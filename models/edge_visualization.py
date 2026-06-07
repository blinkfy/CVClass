import os
from io import BytesIO
import base64
from time import perf_counter

import numpy as np
from PIL import Image

from models.image_utils import fliter, canny, edge_detect, image_to_gray


ALLOWED_EDGE_METHODS = {"sobel", "prewitt", "roberts", "kirsch", "laplacian", "LoG", "scharr", "canny"}


def image_to_base64(image):
    output = BytesIO()
    image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def format_file_size(size):
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.2f} KB"
    return f"{size / (1024 * 1024):.2f} MB"


def parse_threshold(value, default):
    try:
        threshold = int(value if value is not None else default)
    except (TypeError, ValueError):
        raise ValueError("threshold must be an integer")
    if threshold < 0 or threshold > 255:
        raise ValueError("threshold out of range")
    return threshold


def parse_bool(value):
    return str(value).lower() in {"1", "true", "yes", "on"}


def resize_for_edge_demo(image, max_side=960):
    demo_image = image.convert("RGBA")
    if max(demo_image.size) > max_side:
        demo_image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return demo_image

def load_request_image(files, form, static_folder, allowed_file):
    file = files.get("image")
    if file and file.filename:
        if not allowed_file(file.filename):
            raise ValueError("文件类型不是图片或格式不受支持")
        image_bytes = file.read()
        image = Image.open(BytesIO(image_bytes))
        image.load()
        return resize_for_edge_demo(image), file.filename, format_file_size(len(image_bytes))

    sample = os.path.basename(form.get("sample", "espresso_1.jpeg"))
    sample_path = os.path.join(static_folder, "assets", "img", sample)
    if not os.path.isfile(sample_path):
        raise ValueError("示例图片不存在")
    image = Image.open(sample_path)
    image.load()
    return resize_for_edge_demo(image), sample, format_file_size(os.path.getsize(sample_path))

def serialize_steps(steps):
    serialized = []
    for step in steps:
        item = {
            "key": step["key"],
            "label": step["label"],
            "image": image_to_base64(step["image"]),
        }
        if "vector_field" in step:
            item["vector_field"] = step["vector_field"]
        serialized.append(item)
    return serialized

def serialize_pipeline(pipeline, original_image=None):
    steps = serialize_steps(pipeline["steps"])
    if original_image is not None:
        steps.insert(0, {"key": "original", "label": "Image", "image": image_to_base64(original_image)})
    return {
        "method": pipeline["method"],
        "info": pipeline["info"],
        "final": image_to_base64(pipeline["steps"][-1]["image"]),
        "steps": steps,
        "edge_ratio": pipeline["edge_ratio"],
        "stats": pipeline["stats"],
    }

def array_stats(array):
    arr = np.nan_to_num(np.asarray(array, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if arr.size == 0:
        return {"min": 0.0, "max": 0.0, "mean": 0.0}
    return {
        "min": round(float(np.min(arr)), 2),
        "max": round(float(np.max(arr)), 2),
        "mean": round(float(np.mean(arr)), 2),
    }


def normalize_array(array):
    arr = np.nan_to_num(np.asarray(array, dtype=np.float32), nan=0.0, posinf=255.0, neginf=0.0)
    min_value = float(np.min(arr))
    max_value = float(np.max(arr))
    if max_value <= min_value:
        return np.zeros(arr.shape, dtype=np.uint8)
    return np.clip((arr - min_value) / (max_value - min_value) * 255, 0, 255).astype(np.uint8)

def gray_image(array):
    arr = np.nan_to_num(np.asarray(array, dtype=np.float32), nan=0.0, posinf=255.0, neginf=0.0)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="L").convert("RGBA")

def threshold_edges(array, threshold):
    return np.where(np.asarray(array, dtype=np.float32) >= threshold, 255, 0).astype(np.uint8)

def edge_ratio(edge_array):
    arr = np.nan_to_num(np.asarray(edge_array), nan=0.0, posinf=0.0, neginf=0.0)
    if arr.size == 0:
        return 0
    return round(float(np.count_nonzero(arr >= 128) / arr.size * 100), 2)

def direction_vector_field(grad, angle, target_count=18):
    grad_arr = np.nan_to_num(np.asarray(grad, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    angle_arr = np.nan_to_num(np.asarray(angle, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if grad_arr.size == 0:
        return {"width": 0, "height": 0, "vectors": []}

    height, width = grad_arr.shape
    step = max(2, int(min(height, width) / target_count))
    positive = grad_arr[grad_arr > 0]
    scale = float(np.percentile(positive, 92)) if positive.size else 1.0
    if scale <= 0:
        scale = 1.0

    vectors = []
    offset = step // 2
    for y in range(offset, height, step):
        for x in range(offset, width, step):
            magnitude = float(np.clip(grad_arr[y, x] / scale, 0.0, 1.0))
            if magnitude < 0.08:
                continue
            vectors.append({
                "x": round(float(x), 2),
                "y": round(float(y), 2),
                "angle": round(float(angle_arr[y, x]), 2),
                "magnitude": round(magnitude, 3),
            })
    return {"width": int(width), "height": int(height), "vectors": vectors}

def edge_kernel_pipeline(image, method="sobel", threshold=96):
    method = method if method in ALLOWED_EDGE_METHODS and method != "canny" else "sobel"
    gray, gray_result = image_to_gray(image)
    threshold = int(np.clip(threshold, 0, 255))
    steps = [{"key": "gray", "label": "Gray", "image": gray_result}]

    if method in {"sobel", "prewitt", "roberts", "scharr"}:
        gx = fliter(gray, f"{method}_x")
        gy = fliter(gray, f"{method}_y")
        response = np.hypot(gx, gy)
        steps.extend([
            {"key": "gx", "label": "Gx", "image": gray_image(normalize_array(gx))},
            {"key": "gy", "label": "Gy", "image": gray_image(normalize_array(gy))},
            {"key": "magnitude", "label": "Magnitude", "image": gray_image(response)},
        ])
    elif method == "kirsch":
        responses = [fliter(gray, f"kirsch_{direction}") for direction in ["n", "ne", "e", "se", "s", "sw", "w", "nw"]]
        response = np.max(np.stack(responses, axis=-1), axis=-1)
        steps.extend([
            {"key": "response", "label": "8-dir Response", "image": gray_image(response)},
            {"key": "magnitude", "label": "Magnitude", "image": gray_image(response)},
        ])
    else:
        response = np.abs(fliter(gray, method))
        steps.extend([
            {"key": "response", "label": "Kernel Response", "image": gray_image(response)},
            {"key": "magnitude", "label": "Abs Response", "image": gray_image(response)},
        ])

    final, _final_image = edge_detect(image, method=method)
    thresholded = threshold_edges(response, threshold)
    steps.append({"key": "threshold", "label": "Threshold", "image": gray_image(thresholded)})
    steps.append({"key": "final", "label": "Final", "image": gray_image(thresholded)})
    return {
        "method": method,
        "info": {"method": method},
        "steps": steps,
        "edge_ratio": edge_ratio(final),
        "stats": array_stats(response),
    }

def canny_pipeline(image, threshold1=50, threshold2=150, aperture_size=5, l2_gradient=False, precise=False):
    aperture_size = int(aperture_size)
    if aperture_size not in (3, 5, 7):
        aperture_size = 5
    threshold1 = int(np.clip(threshold1, 0, 255))
    threshold2 = int(np.clip(threshold2, 0, 255))
    gray, blurred, grad_pair, nmsret, edges, _result_image = canny(
        image,
        threshold1=threshold1,
        threshold2=threshold2,
        apertureSize=aperture_size,
        L2gradient=bool(l2_gradient),
        precise=bool(precise),
    )
    grad, angle = grad_pair
    low, high = sorted((threshold1, threshold2))
    double = np.zeros_like(nmsret, dtype=np.uint8)
    double[nmsret >= high] = 255
    double[(nmsret >= low) & (nmsret < high)] = 128
    return {
        "method": "canny",
        "info": {
            "method": "canny",
            "threshold1": low,
            "threshold2": high,
            "apertureSize": aperture_size,
            "L2gradient": bool(l2_gradient),
            "precise": bool(precise),
        },
        "steps": [
            {"key": "gray", "label": "Gray", "image": gray_image(gray)},
            {"key": "blur", "label": "Gaussian Blur", "image": gray_image(blurred)},
            {"key": "gradient", "label": "Gradient", "image": gray_image(grad)},
            {
                "key": "direction",
                "label": "Direction",
                "image": gray_image(normalize_array(angle)),
                "vector_field": direction_vector_field(grad, angle),
            },
            {"key": "nms", "label": "NMS", "image": gray_image(nmsret)},
            {"key": "double", "label": "Double Threshold", "image": gray_image(double)},
            {"key": "hysteresis", "label": "Hysteresis", "image": gray_image(edges)},
        ],
        "edge_ratio": edge_ratio(edges),
        "stats": array_stats(grad),
    }


def build_edge_response(form, files, static_folder, allowed_file):
    image, filename, file_size = load_request_image(files, form, static_folder, allowed_file)
    mode = form.get("mode", "compare")
    method = form.get("method", "sobel")
    threshold = parse_threshold(form.get("threshold"), 96)
    threshold1 = parse_threshold(form.get("threshold1"), 50)
    threshold2 = parse_threshold(form.get("threshold2"), 150)
    aperture_size = int(form.get("apertureSize", 5))
    l2_gradient = parse_bool(form.get("L2gradient", "false"))
    precise = parse_bool(form.get("precise", "false"))

    if method not in ALLOWED_EDGE_METHODS:
        method = "sobel"
    if mode not in {"compare", "kernel", "canny"}:
        mode = "compare"

    start_time = perf_counter()
    response = {
        "original": image_to_base64(image),
        "info": {
            "filename": filename,
            "size": file_size,
            "width": image.width,
            "height": image.height,
        },
    }

    if mode == "compare":
        # 如果前端指定了方法列表，则只计算指定的，否则计算全部
        requested_methods = form.get("methods", "").split(",") if form.get("methods") else None
        all_compare_methods = ["sobel", "prewitt", "roberts", "kirsch", "laplacian", "LoG", "canny"]
        target_methods = [m for m in requested_methods if m in all_compare_methods] if requested_methods else all_compare_methods

        compare_results = []
        for item in target_methods:
            item_start = perf_counter()
            pipeline = (
                canny_pipeline(image, threshold1, threshold2, aperture_size, l2_gradient, precise)
                if item == "canny"
                else edge_kernel_pipeline(image, method=item, threshold=threshold)
            )
            payload = serialize_pipeline(pipeline)
            payload["elapsed_ms"] = round((perf_counter() - item_start) * 1000, 2)
            compare_results.append(payload)
        response["compare"] = compare_results
        # 为了保证结构完整性，如果列表为空，回退到原图
        first_res = compare_results[0] if compare_results else None
        response["gray"] = first_res["steps"][0]["image"] if first_res else response["original"]
        response["final"] = first_res["final"] if first_res else response["original"]
    elif mode == "canny":
        pipeline = canny_pipeline(image, threshold1, threshold2, aperture_size, l2_gradient, precise)
        response["pipeline"] = serialize_pipeline(pipeline, image)
        response["gray"] = response["pipeline"]["steps"][1]["image"]
        response["final"] = response["pipeline"]["final"]
    else:
        pipeline = edge_kernel_pipeline(image, method=method, threshold=threshold)
        response["pipeline"] = serialize_pipeline(pipeline, image)
        response["gray"] = response["pipeline"]["steps"][1]["image"]
        response["final"] = response["pipeline"]["final"]

    response["elapsed_ms"] = round((perf_counter() - start_time) * 1000, 2)
    return response
