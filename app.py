import os
import mimetypes
from io import BytesIO
import base64
import json
from time import perf_counter
from waitress import serve
from flask import Flask, jsonify, redirect, render_template, request, url_for
from PIL import Image, UnidentifiedImageError
from werkzeug.middleware.dispatcher import DispatcherMiddleware

from models.digit_infer_numpy import get_model_status, predict_digit
from models.edge_visualization import build_edge_response
from models.image_utils import convolve_gray_image, make_histogram, process_image

mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")

app = Flask(__name__)
CVCLASS_PREFIX = os.environ.get("CVCLASS_PREFIX", "/cvclass")
app.config["APPLICATION_ROOT"] = CVCLASS_PREFIX
app.config["SESSION_COOKIE_PATH"] = CVCLASS_PREFIX

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "bmp", "gif"}
ALLOWED_OPERATIONS = {
    "grayscale",
    "channel",
    "binary",
    "invert",
    "flip_horizontal",
    "flip_vertical",
    "rotate_90",
    "equalize",
}
ALLOWED_GRAY_METHODS = {"weighted", "average", "max", "min"}
ALLOWED_CHANNELS = {"red", "green", "blue"}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
COMPUTE_CONFIG_PATH = os.path.join(app.root_path, "compute_config.json")


def load_compute_config():
    default_config = {
        "grayscale": "backend",
        "image_convolution": "backend",
        "edge_detection": "backend",
        "digit_recognition": "backend",
    }
    try:
        with open(COMPUTE_CONFIG_PATH, "r", encoding="utf-8") as config_file:
            user_config = json.load(config_file)
    except (OSError, json.JSONDecodeError):
        user_config = {}

    config = default_config.copy()
    for key, value in user_config.items():
        if key in config and value in {"frontend", "backend"}:
            config[key] = value
    return config


def compute_mode(feature):
    return load_compute_config().get(feature, "backend")


def frontend_only_response(feature_name):
    return jsonify({
        "error": f"{feature_name} 当前配置为前端计算，后端计算接口已关闭",
        "compute_mode": "frontend",
    }), 409


@app.context_processor
def inject_compute_config():
    return {"compute_config": load_compute_config()}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def image_to_base64(gray_image):
    output = BytesIO()
    gray_image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def format_file_size(size):
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.2f} KB"
    return f"{size / (1024 * 1024):.2f} MB"

@app.route("/")
def home():
    return render_template("home.html", active_page="home")

@app.route("/grayscale", methods=["GET"])
def grayscale_page():
    return render_template("grayscale.html", active_page="grayscale")

@app.route("/convolution", methods=["GET"])
def convolution_page():
    return render_template("convolution.html", active_page="convolution", active_sub_page="visual")

@app.route("/image-convolution", methods=["GET"])
def image_convolution_page():
    return render_template("image_convolution.html", active_page="convolution", active_sub_page="image")

@app.route("/digit-recognition", methods=["GET"])
def digit_recognition_page():
    model_ready, model_message = get_model_status()
    return render_template(
        "digit_recognition.html",
        active_page="convolution",
        active_sub_page="digit",
        model_ready=model_ready,
        model_message=model_message,
    )

@app.route("/cnn-visualization", methods=["GET"])
def cnn_visualization_page():
    return render_template("cnn_visualization.html", active_page="cnn", active_sub_page="cnn_train")

@app.route("/cnn-explainer", methods=["GET"])
def cnn_explainer_page():
    return render_template("cnn_explainer.html", active_page="cnn", active_sub_page="cnn_explainer")

@app.route("/conv-gradient-lab", methods=["GET"])
def conv_gradient_lab_page():
    return render_template(
        "conv_gradient_lab.html",
        active_page="cnn",
        active_sub_page="conv_gradient_lab"
    )

@app.route("/edge-detection", methods=["GET"])
def edge_detection_page():
    return redirect(url_for("edge_detection_mode_page", mode="compare"))

@app.route("/edge-detection/<mode>", methods=["GET"])
def edge_detection_mode_page(mode):
    if mode == "teed":
        return render_template("edge_teed.html", active_page="edge", active_sub_page=mode, edge_mode=mode)
    if mode == "applications":
        return render_template("edge_applications.html", active_page="edge", active_sub_page=mode, edge_mode=mode)
    if mode not in {"compare", "kernel", "canny"}:
        return redirect(url_for("edge_detection_mode_page", mode="compare"))
    return render_template("edge_detection.html", active_page="edge", active_sub_page=mode, edge_mode=mode)

def parse_threshold(value):
    try:
        threshold = int(value)
    except (TypeError, ValueError):
        raise ValueError("threshold must be an integer")

    if threshold < 0 or threshold > 255:
        raise ValueError("threshold out of range")
    return threshold


def handle_process_request(default_operation="grayscale", allow_operation_param=True):
    if compute_mode("grayscale") == "frontend":
        return frontend_only_response("图像处理")

    if "image" not in request.files:
        return jsonify({"error": "请先选择并上传图片文件"}), 400

    file = request.files["image"]
    operation = request.form.get("operation", default_operation) if allow_operation_param else default_operation
    method = request.form.get("method", "weighted")
    channel = request.form.get("channel", "red")

    if file.filename == "":
        return jsonify({"error": "未选择文件"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "文件类型不是图片或格式不受支持"}), 400

    if operation not in ALLOWED_OPERATIONS:
        return jsonify({"error": "图像处理功能非法"}), 400

    if method not in ALLOWED_GRAY_METHODS:
        return jsonify({"error": "灰度化方法非法"}), 400

    if channel not in ALLOWED_CHANNELS:
        return jsonify({"error": "RGB 通道参数非法"}), 400

    try:
        threshold = parse_threshold(request.form.get("threshold", 128))
    except ValueError:
        return jsonify({"error": "二值化阈值必须是 0 到 255 的整数"}), 400

    try:
        image_bytes = file.read()
        image = Image.open(BytesIO(image_bytes))
        image.load()

        start_time = perf_counter()
        result_gray_array, result_image = process_image(
            image,
            operation=operation,
            method=method,
            channel=channel,
            threshold=threshold,
        )
        histogram = make_histogram(result_gray_array)
        result_base64 = image_to_base64(result_image)
        elapsed_ms = (perf_counter() - start_time) * 1000

        return jsonify(
            {
                "image": result_base64,
                "histogram": histogram,
                "elapsed_ms": round(elapsed_ms, 2),
                "info": {
                    "filename": file.filename,
                    "size": format_file_size(len(image_bytes)),
                    "width": result_image.width,
                    "height": result_image.height,
                    "format": image.format or "Unknown",
                    "method": method,
                    "operation": operation,
                    "channel": channel,
                    "threshold": threshold,
                },
            }
        )
    except UnidentifiedImageError:
        return jsonify({"error": "文件类型不是图片或图片已损坏"}), 400
    except Exception:
        app.logger.exception("grayscale failed")
        return jsonify({"error": "后端处理失败，请检查图片后重试"}), 500


@app.route("/process", methods=["POST"])
def process():
    return handle_process_request()


@app.route("/grayscale", methods=["POST"])
def grayscale():
    return handle_process_request(default_operation="grayscale", allow_operation_param=False)


@app.route("/convolve-image", methods=["POST"])
def convolve_image():
    if compute_mode("image_convolution") == "frontend":
        return frontend_only_response("图像卷积")

    if "image" not in request.files:
        return jsonify({"error": "请先选择并上传图片文件"}), 400

    file = request.files["image"]
    if file.filename == "":
        return jsonify({"error": "未选择文件"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "文件类型不是图片或格式不受支持"}), 400

    try:
        kernel = json.loads(request.form.get("kernel", "[]"))
        padding_value = request.form.get("padding")
        padding = int(padding_value) if padding_value is not None else None
        stride = int(request.form.get("stride", 1))
        display_mode = request.form.get("display_mode", "auto")
        if padding is not None and (padding < 0 or padding > 4):
            raise ValueError("padding must be between 0 and 4")
        if stride not in (1, 2):
            raise ValueError("stride must be 1 or 2")
        if display_mode not in {"auto", "clip", "normalize"}:
            raise ValueError("display_mode must be auto, clip or normalize")

        image_bytes = file.read()
        image = Image.open(BytesIO(image_bytes))
        image.load()

        start_time = perf_counter()
        feature_array, result_image = convolve_gray_image(
            image,
            kernel,
            padding=padding,
            stride=stride,
            display_mode=display_mode,
        )
        elapsed_ms = (perf_counter() - start_time) * 1000

        return jsonify(
            {
                "image": image_to_base64(result_image),
                "elapsed_ms": round(elapsed_ms, 2),
                "width": result_image.width,
                "height": result_image.height,
                "min": int(feature_array.min()),
                "max": int(feature_array.max()),
                "padding": padding if padding is not None else "auto",
                "stride": stride,
                "display_mode": display_mode,
            }
        )
    except (json.JSONDecodeError, ValueError) as error:
        return jsonify({"error": f"卷积核参数非法：{error}"}), 400
    except UnidentifiedImageError:
        return jsonify({"error": "文件类型不是图片或图片已损坏"}), 400
    except Exception:
        app.logger.exception("image convolution failed")
        return jsonify({"error": "后端卷积处理失败，请检查图片和卷积核"}), 500


@app.route("/api/edge-detect", methods=["POST"])
def edge_detect_api():
    if compute_mode("edge_detection") == "frontend":
        return frontend_only_response("边缘检测")

    try:
        return jsonify(build_edge_response(request.form, request.files, app.static_folder, allowed_file))
    except (UnidentifiedImageError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("edge detection failed")
        return jsonify({"error": "边缘检测处理失败，请检查图片和参数后重试"}), 500

@app.route("/api/digit-recognize", methods=["POST"])
def digit_recognize():
    if compute_mode("digit_recognition") == "frontend":
        return frontend_only_response("手写数字识别")

    data = request.get_json(silent=True) or {}
    canvas_28x28 = data.get("canvas")
    preview = data.get("preprocessed_image", "")

    if canvas_28x28 is None:
        return jsonify({"success": False, "message": "请先在画布中完成预处理"}), 400

    try:
        result = predict_digit(canvas_28x28)
        return jsonify(
            {
                "success": True,
                "prediction": result["prediction"],
                "confidence": round(result["confidence"], 4),
                "probabilities": result["probabilities"],
                "preprocessed_image": preview,
                "message": "识别成功",
            }
        )
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400
    except RuntimeError as error:
        return jsonify({"success": False, "message": str(error)}), 503
    except Exception:
        app.logger.exception("digit recognition failed")
        return jsonify({"success": False, "message": "后端推理失败，请稍后重试"}), 500


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"error": "文件过大，图片大小不能超过 10MB"}), 413


if __name__ == "__main__":
    app.run(debug=True)

    # port = int(os.environ.get("CVCLASS_PORT", "5001"))
    # # Mount the app under the prefix
    # application = DispatcherMiddleware(
    #     Flask("dummy"),  # dummy root app
    #     {CVCLASS_PREFIX: app}
    # )
    # print(f"Starting CVClass service on port {port} with prefix {CVCLASS_PREFIX}")
    # serve(application, port=port)
