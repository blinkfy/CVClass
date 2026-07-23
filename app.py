import os
import mimetypes
from io import BytesIO
import base64
import json
from pathlib import Path
from time import perf_counter
from flask import Flask, jsonify, request

# 注意：models.* 子模块（image_utils / edge_visualization / feature_utils /
# digit_infer_numpy / mycnn / multiview_real）顶层依赖 numpy 与 numba，
# PIL 仅在 backend 路由内使用，waitress / DispatcherMiddleware 仅在 __main__ 块使用，
# 均改为按需延迟导入；frontend 模式下不触发这些导入，从而降低内存与启动开销。
from page_routes import register_page_routes
from ai_routes import register_ai_routes

mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")

app = Flask(__name__)
CVCLASS_PREFIX = os.environ.get("CVCLASS_PREFIX", "/cvclass")
# 无论反向代理是否剥离前缀，确保 Flask 始终知道部署路径
# SCRIPT_NAME 使 url_for 和 request.script_root 包含正确前缀
os.environ.setdefault("SCRIPT_NAME", CVCLASS_PREFIX)

app = Flask(__name__)
app.config["APPLICATION_ROOT"] = CVCLASS_PREFIX
app.config["SESSION_COOKIE_PATH"] = CVCLASS_PREFIX

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "bmp", "gif"}
ALLOWED_OPERATIONS = {
    "grayscale",
    "channel",
    "hsv",
    "binary",
    "invert",
    "flip_horizontal",
    "flip_vertical",
    "rotate_90",
    "rotate_right_90",
    "equalize",
}
ALLOWED_GRAY_METHODS = {"weighted", "average", "max", "min"}
ALLOWED_CHANNELS = {"red", "green", "blue"}
ALLOWED_CHANNEL_MODES = {"color", "gray"}
ALLOWED_HSV_CHANNELS = {"h", "s", "v", "composite"}
ALLOWED_EQUALIZE_MODES = {"gray", "rgb"}
ALLOWED_INVERT_MODES = {"rgb", "gray"}
MAX_CONTENT_LENGTH = 10 * 1024 * 1024
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
COMPUTE_CONFIG_PATH = os.path.join(app.root_path, "compute_config.json")
# 与 models/digit_infer_numpy.py 中的 MODEL_PATH 等价，但此处仅用于文件存在性检查，
# 不触发 numpy / numba 加载；frontend 模式下 /digit-recognition 页面仍可正常显示状态。
MODEL_PATH = Path(app.root_path) / "models" / "numpy_mnist_cnn.npz"


def get_model_status():
    if not MODEL_PATH.exists():
        return False, f"未找到模型参数文件：{MODEL_PATH}"
    return True, "模型参数文件已就绪"


def load_compute_config():
    default_config = {
        "grayscale": "backend",
        "image_convolution": "backend",
        "edge_detection": "backend",
        "digit_recognition": "backend",
        "feature_detection": "backend",
    }
    user_config = _load_config_raw()

    config = default_config.copy()
    for key, value in user_config.items():
        if key in config and value in {"frontend", "backend"}:
            config[key] = value
    return config


# compute_config.json 的 mtime 缓存：避免每个请求重复读磁盘 + json 解析。
# 先更新 raw 再更新 mtime，确保并发线程不会读到“新 mtime + 旧 raw”的不一致状态。
_CONFIG_CACHE = {"mtime": None, "raw": {}}


def _load_config_raw():
    """读取 compute_config.json 原始 dict，命中 mtime 则直接返回缓存。"""
    try:
        mtime = os.path.getmtime(COMPUTE_CONFIG_PATH)
    except OSError:
        return {}
    if _CONFIG_CACHE["mtime"] == mtime:
        return _CONFIG_CACHE["raw"]
    try:
        with open(COMPUTE_CONFIG_PATH, "r", encoding="utf-8") as config_file:
            raw = json.load(config_file)
    except (OSError, json.JSONDecodeError):
        raw = {}
    _CONFIG_CACHE["raw"] = raw
    _CONFIG_CACHE["mtime"] = mtime
    return raw


def load_full_config():
    """Load the full compute_config.json including ai_assistant section.
    返回顶层浅拷贝以保持“调用方可自由修改返回值”的原语义，避免污染 mtime 缓存。"""
    return dict(_load_config_raw())


def get_ai_config():
    """Get ai_assistant config; returns None if not enabled or incomplete."""
    full = load_full_config()
    ai_cfg = full.get("ai_assistant", {})
    if not ai_cfg.get("enabled", False):
        return None
    required = ("api_base", "api_key", "model")
    for key in required:
        if not ai_cfg.get(key) or ai_cfg[key].startswith("在此填写"):
            return None
    return ai_cfg


def compute_mode(feature):
    return load_compute_config().get(feature, "backend")


def frontend_only_response(feature_name):
    return jsonify({
        "error": f"{feature_name} 当前配置仅提供页面演示，接口调用已关闭",
        "compute_mode": "frontend",
    }), 409


@app.context_processor
def inject_compute_config():
    ai_cfg = get_ai_config()
    return {
        "compute_config": load_compute_config(),
        "ai_assistant_enabled": ai_cfg is not None,
    }


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

    from models.image_utils import make_histogram, process_image
    from PIL import Image, UnidentifiedImageError

    if "image" not in request.files:
        return jsonify({"error": "请先选择并上传图片文件"}), 400

    file = request.files["image"]
    operation = request.form.get("operation", default_operation) if allow_operation_param else default_operation
    method = request.form.get("method", "weighted")
    channel = request.form.get("channel", "red")
    channel_mode = request.form.get("channel_mode", "color")
    hsv_channel = request.form.get("hsv_channel", "h")
    equalize_mode = request.form.get("equalize_mode", "gray")
    invert_mode = request.form.get("invert_mode", "rgb")
    binary_mode = request.form.get("binary_mode", "manual")

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

    if channel_mode not in ALLOWED_CHANNEL_MODES:
        return jsonify({"error": "RGB 通道显示模式非法"}), 400

    if hsv_channel not in ALLOWED_HSV_CHANNELS:
        return jsonify({"error": "HSV 通道参数非法"}), 400

    if equalize_mode not in ALLOWED_EQUALIZE_MODES:
        return jsonify({"error": "直方图均衡化模式非法"}), 400

    if invert_mode not in ALLOWED_INVERT_MODES:
        return jsonify({"error": "反色模式非法"}), 400

    if binary_mode not in {"manual", "otsu"}:
        return jsonify({"error": "二值化模式非法"}), 400

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
            binary_mode=binary_mode,
            channel_mode=channel_mode,
            hsv_channel=hsv_channel,
            equalize_mode=equalize_mode,
            invert_mode=invert_mode,
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
                    "binary_mode": binary_mode,
                    "channel_mode": channel_mode,
                    "hsv_channel": hsv_channel,
                    "equalize_mode": equalize_mode,
                    "invert_mode": invert_mode,
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

    from models.image_utils import convolve_gray_image
    from PIL import Image, UnidentifiedImageError

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

    from models.edge_visualization import build_edge_response
    from PIL import UnidentifiedImageError

    try:
        return jsonify(build_edge_response(request.form, request.files, app.static_folder, allowed_file))
    except (UnidentifiedImageError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("edge detection failed")
        return jsonify({"error": "边缘检测处理失败，请检查图片和参数后重试"}), 500


@app.route("/api/feature-detect", methods=["POST"])
def feature_detect_api():
    if compute_mode("feature_detection") == "frontend":
        return frontend_only_response("特征检测")

    from models.feature_utils import build_feature_response
    from PIL import UnidentifiedImageError

    try:
        return jsonify(build_feature_response(request.form, request.files, app.static_folder, allowed_file))
    except (UnidentifiedImageError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("feature detection failed")
        return jsonify({"error": "特征检测处理失败，请检查图片和参数后重试"}), 500


@app.route("/api/feature-match", methods=["POST"])
def feature_match_api():
    if compute_mode("feature_detection") == "frontend":
        return frontend_only_response("特征匹配")

    from models.feature_utils import build_feature_match_response
    from PIL import UnidentifiedImageError

    try:
        return jsonify(build_feature_match_response(request.form, request.files, app.static_folder, allowed_file))
    except (UnidentifiedImageError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("feature matching failed")
        return jsonify({"error": "特征匹配处理失败，请检查图片和参数后重试"}), 500


@app.route("/api/multiview-reconstruction/real-run", methods=["POST"])
def multiview_real_run_api():
    # 注意：multiview 无前端本地实现（SIFT/RANSAC/三角化），后端 OpenCV 是
    # preset 缺失时的唯一数据源，故不设 frontend 开关，始终执行后端计算。
    # 保留延迟导入，使其他 frontend 路由不触发 cv2 加载。
    from models.multiview_real import build_multiview_real_response

    try:
        return jsonify(build_multiview_real_response(request.form, app.static_folder))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("multiview real reconstruction failed")
        return jsonify({"error": "真实多视图几何计算失败，请稍后重试"}), 500


@app.route("/api/digit-recognize", methods=["POST"])
def digit_recognize():
    if compute_mode("digit_recognition") == "frontend":
        return frontend_only_response("手写数字识别")

    from models.digit_infer_numpy import predict_digit

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


register_page_routes(app, get_model_status)
register_ai_routes(app, get_ai_config)


if __name__ == "__main__":
    app.run(debug=True)

    # port = int(os.environ.get("CVCLASS_PORT", "5001"))
    # # 取消下方注释前需先导入：from waitress import serve
    # #                       from werkzeug.middleware.dispatcher import DispatcherMiddleware
    # # Mount the app under the prefix
    # application = DispatcherMiddleware(
    #     Flask("dummy"),  # dummy root app
    #     {CVCLASS_PREFIX: app}
    # )
    # print(f"Starting CVClass service on port {port} with prefix {CVCLASS_PREFIX}")
    # serve(application, port=port)
