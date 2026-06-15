import os
import mimetypes
from io import BytesIO
import base64
import json
from time import perf_counter
import urllib.request
import urllib.error
from waitress import serve
from flask import Flask, jsonify, redirect, render_template, request, url_for
from PIL import Image, UnidentifiedImageError
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from flask import Response

from models.digit_infer_numpy import get_model_status, predict_digit
from models.edge_visualization import build_edge_response
from models.feature_utils import build_feature_match_response, build_feature_response
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
        "feature_detection": "backend",
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


def load_full_config():
    """Load the full compute_config.json including ai_assistant section."""
    try:
        with open(COMPUTE_CONFIG_PATH, "r", encoding="utf-8") as config_file:
            return json.load(config_file)
    except (OSError, json.JSONDecodeError):
        return {}


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

@app.route("/")
def home():
    return render_template("home.html", active_page="home")

@app.route("/knowledge-graph", methods=["GET"])
def knowledge_graph_page():
    return render_template("knowledge_graph.html", active_page="knowledge_graph")

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


@app.route("/vision-tasks", methods=["GET"])
def vision_tasks_page():
    return redirect(url_for("vision_tasks_overview_page"))


@app.route("/vision-tasks/overview", methods=["GET"])
def vision_tasks_overview_page():
    return render_template(
        "vision_tasks_overview.html",
        active_page="vision_tasks",
        active_sub_page="overview",
    )


@app.route("/vision-tasks/detection", methods=["GET"])
def detection_lab_page():
    return render_template(
        "detection_lab.html",
        active_page="vision_tasks",
        active_sub_page="detection",
    )


@app.route("/vision-tasks/semantic", methods=["GET"])
def semantic_segmentation_lab_page():
    return render_template(
        "semantic_segmentation_lab.html",
        active_page="vision_tasks",
        active_sub_page="semantic",
    )


@app.route("/vision-tasks/instance", methods=["GET"])
def instance_segmentation_lab_page():
    return render_template(
        "instance_segmentation_lab.html",
        active_page="vision_tasks",
        active_sub_page="instance",
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

@app.route("/feature-detection", methods=["GET"])
def feature_detection_page():
    return redirect(url_for("feature_detection_mode_page", mode="compare"))


@app.route("/feature-detection/<mode>", methods=["GET"])
def feature_detection_mode_page(mode):
    if mode == "harris":
        return redirect(url_for("feature_detection_mode_page", mode="corner"))
    if mode in {"sift_scale", "sift_descriptor"}:
        return redirect(url_for("feature_detection_mode_page", mode="sift"))
    feature_templates = {
        "compare": "feature_compare.html",
        "corner": "feature_harris.html",
        "sift": "feature_sift.html",
        "matching": "feature_matching.html",
        "panorama": "feature_panorama.html",
    }
    if mode not in feature_templates:
        return redirect(url_for("feature_detection_mode_page", mode="compare"))
    return render_template(
        feature_templates[mode],
        active_page="feature",
        active_sub_page=mode,
        feature_mode=mode,
    )

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


@app.route("/api/feature-detect", methods=["POST"])
def feature_detect_api():
    if compute_mode("feature_detection") == "frontend":
        return frontend_only_response("特征检测")

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

    try:
        return jsonify(build_feature_match_response(request.form, request.files, app.static_folder, allowed_file))
    except (UnidentifiedImageError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("feature matching failed")
        return jsonify({"error": "特征匹配处理失败，请检查图片和参数后重试"}), 500

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


# ---------------------------------------------------------------------------
# AI 学习助手
# ---------------------------------------------------------------------------

AI_SYSTEM_PROMPT = """你是计算机视觉实验系统中的 AI 技术助理。
你需要结合当前页面上下文，解释算法、分析参数、诊断结果、生成简短讲解稿或报告描述。

【页面主动控制权】
我们为你打通了操纵用户本地页面的权限。在用户上下文中，你会看到 `controls` 字典，里面列出了当前页面中可以由你来操纵的各种旋钮、输入框和按钮的句柄（handle）。
当你诊断认为应该调整某个参数，或者想在页面高亮某个按钮让用户注意时，请把控制符单独放在一行：
- 如果你想帮用户把参数调整为某个数值：`[SET_PARAM: handle | 值]` （例如：[SET_PARAM: #edgeSigma | 1.8]）
- 如果你想高亮（闪烁）页面的某个控件以引起注意：`[HIGHLIGHT: handle]` （例如：[HIGHLIGHT: #threshold-input]）

【控制符使用绝对要求】
1. **绝对不要向用户说你能控制什么，不要复述 `controls` 字典或暴露 `handle`。用户不需要知道底层细节。**不要输出“当前可直接操作的控件”“可操控空间”“句柄列表”“控件清单”等标题或说明性段落。
2. 如果你要执行控制，就直接给出控制符并在正文里只说结果，例如“我已将参数调为更稳的设置”。不要在正文中点名具体元素、ID 或选择器。
3. 控制符必须**100%完全独立占据一行**，**绝对不要**在行首或行尾加项目符号（如 `- `、`* `、`• `）、括号、解释文字、代码块。正确示例就是纯白板上一句 `[SET_PARAM: #xxxx | 12]`，错误示例是 `- [SET_PARAM: #xxxx | 12]`。
4. 系统会在后台静默吞掉这行并替你执行，所以你的回答里直接描述你干了啥即可。

回答要求：
1. 简洁、准确、偏技术说明。
2. 尽量使用页面控制权引导用户调参。
3. 不编造系统中不存在的 controls 句柄。
4. 优先结合上下文信息的 params、stats 和 controls。"""

ACTION_PROMPTS = {
    "explain_algorithm": "请解释当前页面中的算法流程，结合当前参数和步骤，控制在 150 字以内。",
    "analyze_params": "请说明当前参数的作用，以及这些参数如何影响输出结果。",
    "diagnose_result": "请根据当前算法、参数和统计结果，分析可能的问题，如果可以，请直接动用 SET_PARAM 帮我修正到一个较为合适的参数，并在文字里解释。",
    "video_script": "请为当前页面生成一段 40 到 80 秒的视频讲解稿，突出算法流程和系统功能。",
    "report_text": "请为当前页面生成一段实验报告中的功能说明或结果分析文字，要求正式、技术化。",
}


def call_bailian_model(question, context, action):
    """Call Bailian (DashScope compatible) model API with streaming."""
    ai_cfg = get_ai_config()
    if ai_cfg is None:
        yield f"data: {json.dumps({'error': 'AI 助手未启用，请在 compute_config.json 中配置 ai_assistant。'})}\n\n"
        return

    action_hint = ACTION_PROMPTS.get(action, "")
    user_prompt = action_hint + "\n" + question if action_hint else question

    context_text = (
        f"当前模块: {context.get('module', 'unknown')}\n"
        f"当前页面: {context.get('page', 'unknown')}\n"
        f"当前算法: {context.get('algorithm', 'unknown')}\n"
        f"当前步骤: {context.get('step', 'unknown')}\n"
        f"参数: {json.dumps(context.get('params', {}), ensure_ascii=False)}\n"
        f"可操作句柄(controls): {json.dumps(context.get('controls', {}), ensure_ascii=False)}\n"
        f"统计: {json.dumps(context.get('stats', {}), ensure_ascii=False)}"
    )

    image_data = context.get('selectedImage', '')

    # For text-only or models that do not support vision format, we can fallback, but let's assume OpenAI vision format.
    if image_data:
        # User prompt structure changed to array if handling vision format
        user_content = [
            {"type": "text", "text": f"【页面上下文】\n{context_text}\n\n【用户问题】\n{user_prompt}"},
            {"type": "image_url", "image_url": {"url": image_data}}
        ]
    else:
        user_content = f"【页面上下文】\n{context_text}\n\n【用户问题】\n{user_prompt}"

    messages = [
        {"role": "system", "content": AI_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    payload = json.dumps({
        "model": ai_cfg["model"],
        "messages": messages,
        "temperature": ai_cfg.get("temperature", 0.1),
        "max_tokens": ai_cfg.get("max_tokens", 800),
        "stream": True
    }).encode("utf-8")

    api_url = ai_cfg["api_base"].rstrip("/") + "/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ai_cfg['api_key']}",
        "Accept": "text/event-stream"
    }

    req = urllib.request.Request(api_url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            for line in resp:
                line = line.decode("utf-8").strip()
                if not line:
                    continue
                if line == "data: [DONE]":
                    break
                if line.startswith("data: "):
                    body = json.loads(line[6:])
                    choices = body.get("choices", [])
                    if choices:
                        chunk = choices[0].get("delta", {}).get("content", "")
                        if chunk:
                            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    except urllib.error.HTTPError as exc:
        app.logger.warning("AI assistant HTTP error: %s", exc)
        yield f"data: {json.dumps({'error': f'模型服务返回错误 ({exc.code})，请检查 api_key 和 model 配置。'})}\n\n"
    except urllib.error.URLError as exc:
        app.logger.warning("AI assistant URL error: %s", exc)
        yield f"data: {json.dumps({'error': '无法连接模型服务，请检查 api_base 配置和网络。'})}\n\n"
    except Exception as exc:
        app.logger.exception("AI assistant unexpected error")
        yield f"data: {json.dumps({'error': 'AI 助手内部错误，请稍后重试。'})}\n\n"


@app.route("/api/ai-assistant", methods=["POST"])
def ai_assistant_api():
    ai_cfg = get_ai_config()
    if ai_cfg is None:
        return jsonify({
            "success": False,
            "message": "AI 助手未启用，请在 compute_config.json 中配置 ai_assistant。",
        })

    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    context = data.get("context", {})
    action = data.get("action", "free_chat")

    if not question and action == "free_chat":
        return jsonify({"success": False, "message": "请输入问题。"})

    if not question:
        question = ACTION_PROMPTS.get(action, "请简要说明当前页面内容。")

    return Response(call_bailian_model(question, context, action), mimetype="text/event-stream")


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
