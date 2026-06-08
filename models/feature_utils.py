import base64
import math
import os
from io import BytesIO
from time import perf_counter

import numpy as np
from PIL import Image, ImageEnhance

from models.image_utils import harris as core_harris
from models.image_utils import sift as core_sift


DEFAULT_EXAMPLES = {
    "building": "house.png",
    "checker": "cameraman.png",
    "book": "brick.png",
    "texture": "checkerboard.png",
    "peppers": "peppers_color.png",
}


def clamp_int(value, default, lo, hi):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(lo, min(hi, parsed))


def clamp_float(value, default, lo, hi):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return max(lo, min(hi, parsed))


def form_value(form, *names, default=None):
    for name in names:
        value = form.get(name)
        if value not in (None, ""):
            return value
    return default


def image_to_data_url(image):
    output = BytesIO()
    image.convert("RGB").save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def load_request_image(form, files, static_folder, allowed_file, field="image"):
    file = files.get(field)
    if file and file.filename:
        if not allowed_file(file.filename):
            raise ValueError("文件类型不是图片或格式不受支持")
        image = Image.open(BytesIO(file.read()))
        image.load()
        return image.convert("RGB"), file.filename

    example = form.get("example", "building")
    filename = DEFAULT_EXAMPLES.get(example, DEFAULT_EXAMPLES["building"])
    path = os.path.join(static_folder, "assets", "img", filename)
    if not os.path.exists(path):
        raise ValueError("示例图片不存在，请上传自定义图片")
    return Image.open(path).convert("RGB"), filename


def resize_for_compute(image, max_side=512):
    image = image.convert("RGB")
    width, height = image.size
    if max(width, height) <= max_side:
        return image
    ratio = max_side / max(width, height)
    size = (
        max(1, int(round(width * ratio))),
        max(1, int(round(height * ratio))),
    )
    return image.resize(size, Image.Resampling.LANCZOS)


def normalize_to_uint8(array, absolute=False, positive=False):
    values = np.asarray(array, dtype=np.float32)
    if absolute:
        values = np.abs(values)
    if positive:
        values = np.maximum(values, 0)
    finite = np.isfinite(values)
    if not finite.any():
        return np.zeros(values.shape, dtype=np.uint8)
    minimum = float(values[finite].min())
    maximum = float(values[finite].max())
    if abs(maximum - minimum) < 1e-12:
        return np.zeros(values.shape, dtype=np.uint8)
    normalized = (values - minimum) / (maximum - minimum) * 255
    return np.clip(normalized, 0, 255).astype(np.uint8)


def normalize_to_uint8_clipped(array, positive=False, low=1.0, high=99.0):
    values = np.asarray(array, dtype=np.float32)
    if positive:
        values = np.maximum(values, 0)
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros(values.shape, dtype=np.uint8)
    minimum = float(np.percentile(finite, low))
    maximum = float(np.percentile(finite, high))
    if abs(maximum - minimum) < 1e-12:
        return np.zeros(values.shape, dtype=np.uint8)
    normalized = (np.clip(values, minimum, maximum) - minimum) / (maximum - minimum)
    return np.clip(normalized * 255, 0, 255).astype(np.uint8)


def resize_array_for_payload(array, max_side=260):
    values = np.asarray(array, dtype=np.float32)
    height, width = values.shape
    if max(height, width) <= max_side:
        return values
    ratio = max_side / max(height, width)
    new_size = (
        max(1, int(round(width * ratio))),
        max(1, int(round(height * ratio))),
    )
    preview = Image.fromarray(normalize_to_uint8(values), mode="L")
    preview = preview.resize(new_size, Image.Resampling.BILINEAR)
    return np.asarray(preview, dtype=np.float32)


def pack_array(array, max_side=260, absolute=False, positive=False):
    values = np.asarray(array, dtype=np.float32)
    source_height, source_width = values.shape
    preview = resize_array_for_payload(values, max_side=max_side)
    pixels = normalize_to_uint8(preview, absolute=absolute, positive=positive)
    return {
        "width": int(pixels.shape[1]),
        "height": int(pixels.shape[0]),
        "source_width": int(source_width),
        "source_height": int(source_height),
        "min": round(float(np.nanmin(values)), 6) if values.size else 0,
        "max": round(float(np.nanmax(values)), 6) if values.size else 0,
        "values": pixels.reshape(-1).astype(int).tolist(),
    }


def pack_clipped_array(array, max_side=260, positive=False, low=1.0, high=99.0):
    values = np.asarray(array, dtype=np.float32)
    source_height, source_width = values.shape
    preview = resize_array_for_payload(values, max_side=max_side)
    pixels = normalize_to_uint8_clipped(preview, positive=positive, low=low, high=high)
    return {
        "width": int(pixels.shape[1]),
        "height": int(pixels.shape[0]),
        "source_width": int(source_width),
        "source_height": int(source_height),
        "min": round(float(np.nanmin(values)), 6) if values.size else 0,
        "max": round(float(np.nanmax(values)), 6) if values.size else 0,
        "values": pixels.reshape(-1).astype(int).tolist(),
    }


def pack_float_array(array):
    values = np.asarray(array, dtype=np.float32)
    finite = np.where(np.isfinite(values), values, 0.0)
    return {
        "width": int(finite.shape[1]),
        "height": int(finite.shape[0]),
        "values": finite.reshape(-1).astype(float).tolist(),
    }


def json_value(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    return value


def public_corner(corner):
    response, x, y = corner
    return {
        "x": int(x),
        "y": int(y),
        "response": round(float(response), 6),
    }


def public_sift_point(point, oriented=False):
    angle_deg = float(point.get("angle", 0.0)) if oriented else 0.0
    sigma = float(point.get("sigma_global", point.get("sigma", 1.6)))
    result = {
        "x": int(point.get("x", 0)),
        "y": int(point.get("y", 0)),
        "x_local": int(point.get("x_local", 0)),
        "y_local": int(point.get("y_local", 0)),
        "octave": int(point.get("octave", 0)),
        "layer": int(point.get("scale", point.get("layer", 0))),
        "scale": int(point.get("scale", point.get("layer", 0))),
        "sigma": round(sigma, 4),
        "response": round(float(point.get("response", abs(point.get("dog", 0.0)))), 7),
        "dog": round(float(point.get("dog", 0.0)), 7),
        "edge_ratio": round(float(point.get("edge_ratio", 0.0)), 5),
        "orientation": round(math.radians(angle_deg), 7),
        "orientation_deg": round(angle_deg % 360, 3),
    }
    if "index" in point:
        result["descriptor_index"] = int(point["index"])
    if oriented:
        result.update({
            "orientation_bin": int(point.get("bin", 0)),
            "orientation_peak": round(float(point.get("peak", 0.0)), 7),
            "relative_peak": round(float(point.get("relative_peak", 0.0)), 5),
        })
    return result


def extract_patch(array, x, y, radius=2, precision=2):
    values = np.asarray(array)
    height, width = values.shape
    rows = []
    for yy in range(y - radius, y + radius + 1):
        row = []
        for xx in range(x - radius, x + radius + 1):
            safe_y = min(height - 1, max(0, yy))
            safe_x = min(width - 1, max(0, xx))
            row.append(round(float(values[safe_y, safe_x]), precision))
        rows.append(row)
    return rows


def gaussian_weight_patch(radius=2, sigma=1.0):
    weights = []
    total = 0.0
    for y in range(-radius, radius + 1):
        row = []
        for x in range(-radius, radius + 1):
            weight = math.exp(-(x * x + y * y) / (2 * sigma * sigma))
            row.append(weight)
            total += weight
        weights.append(row)
    return [[round(value / total, 4) for value in row] for row in weights]


def harris_parameters(form):
    return {
        "sigma": clamp_float(
            form_value(form, "sigma", "harris_sigma", default=1.2),
            1.2,
            0.4,
            4.0,
        ),
        "k": clamp_float(
            form_value(form, "k", "harris_k", default=0.04),
            0.04,
            0.02,
            0.12,
        ),
        "threshold_ratio": clamp_float(
            form_value(form, "threshold_ratio", "harris_threshold", default=0.01),
            0.01,
            0.0001,
            0.8,
        ),
        "nms_radius": clamp_int(
            form_value(form, "nms_radius", default=4),
            4,
            1,
            12,
        ),
        "max_corners": clamp_int(
            form_value(form, "max_corners", default=500),
            500,
            20,
            2000,
        ),
    }


def sift_parameters(form):
    return {
        "octave": clamp_int(
            form_value(form, "octave", "sift_octaves", default=3),
            3,
            1,
            4,
        ),
        "scale": clamp_int(
            form_value(form, "scale", "sift_scales", default=3),
            3,
            3,
            6,
        ),
        "sigma0": clamp_float(
            form_value(form, "sigma0", "sift_sigma", default=1.6),
            1.6,
            0.8,
            2.2,
        ),
        "contrast_threshold": clamp_float(
            form_value(form, "contrast_threshold", "sift_contrast_threshold", default=0.04),
            0.04,
            0.005,
            0.2,
        ),
        "edge_threshold": clamp_float(
            form_value(form, "edge_threshold", "sift_edge_threshold", default=10),
            10,
            5,
            20,
        ),
        "max_points": clamp_int(
            form_value(form, "max_points", "max_sift", default=500),
            500,
            20,
            1000,
        ),
        "double_size": str(form_value(form, "double_size", default="true")).lower()
        not in {"0", "false", "off", "no"},
        "auto_nms": str(form_value(form, "auto_nms", default="true")).lower()
        not in {"0", "false", "off", "no"},
    }


def run_harris(image, form, method):
    params = harris_parameters(form)
    if method == "shi-tomasi":
        params["threshold_ratio"] = clamp_float(
            form_value(
                form,
                "shi_threshold",
                "shi_tomasi_threshold",
                default=0.05,
            ),
            0.05,
            0.0001,
            0.8,
        )
        params["nms_radius"] = clamp_int(
            form_value(form, "shi_nms_radius", default=8),
            8,
            1,
            16,
        )
    result = core_harris(image, method=method, **params)
    keys = (
        "gray", "ix", "iy", "ix2", "iy2", "ixiy", "sxx", "syy", "sxy",
        "det", "trace", "response", "candidates", "corners",
    )
    return dict(zip(keys, result)), params


def build_harris_probe(result, sigma):
    corners = result["corners"]
    if corners:
        _, x, y = corners[0]
        x, y = int(x), int(y)
    else:
        y = result["gray"].shape[0] // 2
        x = result["gray"].shape[1] // 2
    sxx = float(result["sxx"][y, x])
    syy = float(result["syy"][y, x])
    sxy = float(result["sxy"][y, x])
    return {
        "x": x,
        "y": y,
        "gray_patch": extract_patch(result["gray"], x, y, precision=0),
        "ix_patch": extract_patch(result["ix"], x, y),
        "iy_patch": extract_patch(result["iy"], x, y),
        "ix2_patch": extract_patch(result["ix2"], x, y),
        "iy2_patch": extract_patch(result["iy2"], x, y),
        "ixiy_patch": extract_patch(result["ixiy"], x, y),
        "gaussian_weight": gaussian_weight_patch(sigma=sigma),
        "M": [[round(sxx, 3), round(sxy, 3)], [round(sxy, 3), round(syy, 3)]],
        "det": round(float(result["det"][y, x]), 3),
        "trace": round(float(result["trace"][y, x]), 3),
        "r": round(float(result["response"][y, x]), 3),
    }


def build_harris_payload(
    image,
    form,
    include_response_surface=True,
    methods=None,
):
    requested = set(methods or {"harris", "shi"})
    selected_method = "harris" if "harris" in requested else "shi-tomasi"
    selected_result, params = run_harris(image, form, selected_method)
    harris_result = selected_result if "harris" in requested else None
    shi_result = selected_result if "shi" in requested else None
    if {"harris", "shi"}.issubset(requested):
        shi_result, _ = run_harris(image, form, "shi-tomasi")

    harris_corners = [
        public_corner(item) for item in (harris_result or {}).get("corners", [])
    ]
    shi_corners = [
        public_corner(item) for item in (shi_result or {}).get("corners", [])
    ]
    selected_corners = harris_corners if harris_result is not None else shi_corners
    nms_array = np.zeros_like(selected_result["gray"], dtype=np.float32)
    for point in selected_corners:
        nms_array[point["y"], point["x"]] = point["response"]
    arrays = {
        "gray": pack_array(selected_result["gray"]),
        "ix": pack_array(selected_result["ix"], absolute=True),
        "iy": pack_array(selected_result["iy"], absolute=True),
        "ix2": pack_array(selected_result["ix2"], positive=True),
        "iy2": pack_array(selected_result["iy2"], positive=True),
        "ixiy": pack_array(selected_result["ixiy"], absolute=True),
        "sxx": pack_clipped_array(selected_result["sxx"], positive=True),
        "syy": pack_clipped_array(selected_result["syy"], positive=True),
        "sxy": pack_clipped_array(selected_result["sxy"], low=2.0, high=98.0),
        "nms": pack_array(nms_array, positive=True),
    }
    if harris_result is not None:
        arrays["harris_response"] = pack_clipped_array(
            harris_result["response"], positive=True, low=1.0, high=99.5
        )
    if shi_result is not None:
        arrays["shi_tomasi_response"] = pack_clipped_array(
            shi_result["response"], positive=True, low=1.0, high=99.5
        )
    if include_response_surface and harris_result is not None:
        arrays["harris_response_surface"] = pack_float_array(harris_result["response"])
    payload = {
        "arrays": arrays,
        "probe": build_harris_probe(selected_result, params["sigma"]),
    }
    if harris_result is not None:
        payload["harris"] = {
            "corners": harris_corners,
            "count": len(harris_corners),
            "candidate_count": len(harris_result["candidates"]),
        }
    if shi_result is not None:
        payload["shi_tomasi"] = {
            "corners": shi_corners,
            "count": len(shi_corners),
            "candidate_count": len(shi_result["candidates"]),
        }
    return payload


def run_sift(image, form, descriptor):
    params = sift_parameters(form)
    return core_sift(image, descriptor=descriptor, **params), params


def pyramid_arrays(pyramid, max_octaves, max_layers, dog=False):
    rows = []
    for octave, layers in enumerate(pyramid[:max_octaves]):
        row = []
        for layer, array in enumerate(layers[:max_layers]):
            row.append({
                "octave": octave,
                "layer": layer,
                "array": pack_array(array, max_side=110, absolute=dog),
            })
        rows.append(row)
    return rows


def dog_extrema_probe(dogs_pyramid):
    if not dogs_pyramid or len(dogs_pyramid[0]) < 3:
        return None
    octave = min(1, len(dogs_pyramid) - 1)
    layers = dogs_pyramid[octave]
    layer = min(2, len(layers) - 2)
    current = np.asarray(layers[layer])
    height, width = current.shape
    flat_index = int(np.argmax(np.abs(current)))
    y, x = divmod(flat_index, width)
    y = min(height - 2, max(1, y))
    x = min(width - 2, max(1, x))
    return {
        "octave": octave,
        "layer": layer,
        "x": x,
        "y": y,
        "prev": extract_patch(layers[layer - 1], x, y, radius=1, precision=5),
        "current": extract_patch(layers[layer], x, y, radius=1, precision=5),
        "next": extract_patch(layers[layer + 1], x, y, radius=1, precision=5),
        "center": round(float(current[y, x]), 6),
    }


def selected_descriptor_payload(sift_result):
    extended = sift_result.get("extended_points", [])
    descriptors = sift_result.get("descriptors", [])
    if not extended or not descriptors:
        return None
    point = public_sift_point(extended[0], oriented=True)
    descriptor = descriptors[0]
    point["descriptor128"] = [
        round(float(value), 7)
        for value in np.asarray(descriptor["descriptor"]).reshape(-1)
    ]
    point["patch_vectors"] = json_value(descriptor.get("patch_vectors", []))
    return point


def build_sift_payload(image, form, descriptor):
    sift_result, params = run_sift(image, form, descriptor=descriptor)
    extrema = [public_sift_point(point) for point in sift_result["points_extrema"]]
    edge_points = [public_sift_point(point) for point in sift_result["points_edge"]]
    keypoints = [public_sift_point(point) for point in sift_result["points_keypoints"]]
    extended = [
        public_sift_point(point, oriented=True)
        for point in sift_result.get("extended_points", [])
    ]
    return {
        "sift": {
            "points_extrema": extrema,
            "points_edge": edge_points,
            "points_keypoints": keypoints,
            "extended_points": extended,
            "oriented_keypoints": extended,
            "keypoints": extended if descriptor else keypoints,
            "count": len(extended if descriptor else keypoints),
            "counts": {
                "raw_extrema": len(extrema),
                "contrast_survivors": len(edge_points),
                "edge_survivors": len(edge_points),
                "kept": len(keypoints),
                "oriented": len(extended),
            },
            "selected": selected_descriptor_payload(sift_result) if descriptor else None,
        },
        "pyramid": {
            "gaussian": pyramid_arrays(
                sift_result["pyramid"],
                max_octaves=params["octave"],
                max_layers=min(params["scale"] + 3, 6),
            ),
            "dog": pyramid_arrays(
                sift_result["dogs_pyramid"],
                max_octaves=params["octave"],
                max_layers=min(params["scale"] + 2, 5),
                dog=True,
            ),
            "probe": dog_extrema_probe(sift_result["dogs_pyramid"]),
        },
        "_core": sift_result,
    }


def build_feature_response(form, files, static_folder, allowed_file):
    start = perf_counter()
    image, filename = load_request_image(
        form, files, static_folder, allowed_file, field="image"
    )
    max_side = clamp_int(form_value(form, "max_side", default=512), 512, 160, 768)
    image = resize_for_compute(image, max_side)
    mode = form.get("mode", "compare")
    if mode not in {"compare", "corner", "harris", "sift", "sift_scale", "sift_descriptor"}:
        raise ValueError("feature mode 参数非法")

    response = {
        "success": True,
        "mode": mode,
        "meta": {
            "filename": filename,
            "width": image.width,
            "height": image.height,
        },
        "images": {"original": image_to_data_url(image)},
    }
    requested_methods = {
        item.strip()
        for item in str(form.get("methods", "")).split(",")
        if item.strip()
    }
    compare_harris_methods = {"harris", "shi", "combo"}
    compare_sift_methods = {"sift", "combo"}
    corner_algorithm = str(form.get("corner_algorithm", "harris")).strip().lower()
    is_corner_mode = mode in {"harris", "corner"}
    include_harris = (is_corner_mode and corner_algorithm != "fast") or (
        mode == "compare"
        and (not requested_methods or bool(requested_methods & compare_harris_methods))
    )
    include_sift = mode in {"sift", "sift_scale", "sift_descriptor"} or (
        mode == "compare"
        and (not requested_methods or bool(requested_methods & compare_sift_methods))
    )

    if include_harris:
        if is_corner_mode:
            harris_methods = {
                "shi" if corner_algorithm in {"shi", "shi-tomasi"} else "harris"
            }
        elif not requested_methods:
            harris_methods = {"harris", "shi"}
        else:
            harris_methods = requested_methods & {"harris", "shi"}
            if "combo" in requested_methods:
                harris_methods.add("harris")
        response.update(build_harris_payload(
            image,
            form,
            include_response_surface=is_corner_mode,
            methods=harris_methods,
        ))
    if include_sift:
        descriptor_requested = str(form.get("descriptor", "")).strip().lower()
        descriptor = mode in {"compare", "sift_descriptor"} or (
            mode == "sift" and descriptor_requested in {"1", "true", "yes", "on"}
        )
        sift_payload = build_sift_payload(image, form, descriptor=descriptor)
        sift_payload.pop("_core", None)
        response.update(sift_payload)
    if mode == "compare":
        response["available_methods"] = sorted(requested_methods) if requested_methods else [
            "harris", "shi", "fast", "sift", "combo"
        ]
    response["meta"]["elapsed_ms"] = round((perf_counter() - start) * 1000, 2)
    return response


def load_two_images_for_match(form, files, static_folder, allowed_file):
    image_a, name_a = load_request_image(
        form, files, static_folder, allowed_file, field="image_a"
    )
    file_b = files.get("image_b")
    if file_b and file_b.filename:
        if not allowed_file(file_b.filename):
            raise ValueError("第二张图片格式不受支持")
        image_b = Image.open(BytesIO(file_b.read()))
        image_b.load()
        image_b = image_b.convert("RGB")
        name_b = file_b.filename
    else:
        image_b = image_a.rotate(
            -18,
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )
        image_b = ImageEnhance.Contrast(image_b).enhance(1.08)
        name_b = "auto_rotated.png"
    max_side = clamp_int(form_value(form, "max_side", default=480), 480, 160, 640)
    return (
        resize_for_compute(image_a, max_side),
        resize_for_compute(image_b, max_side),
        name_a,
        name_b,
    )


def match_descriptors(descriptors_a, descriptors_b, ratio=0.75, max_matches=80):
    matrix_a = np.asarray(descriptors_a, dtype=np.float32)
    matrix_b = np.asarray(descriptors_b, dtype=np.float32)
    if len(matrix_a) == 0 or len(matrix_b) < 2:
        return []
    matches = []
    for left_index, descriptor in enumerate(matrix_a):
        distances = np.linalg.norm(matrix_b - descriptor[None, :], axis=1)
        nearest = np.argsort(distances)[:2]
        distance = float(distances[nearest[0]])
        second_distance = float(distances[nearest[1]])
        ratio_value = distance / (second_distance + 1e-12)
        matches.append({
            "left_index": left_index,
            "right_index": int(nearest[0]),
            "distance": distance,
            "second_distance": second_distance,
            "ratio": ratio_value,
            "passed": ratio_value < ratio,
        })
    matches.sort(
        key=lambda item: (not item["passed"], item["ratio"], item["distance"])
    )
    return matches


def build_feature_match_response(form, files, static_folder, allowed_file):
    start = perf_counter()
    image_a, image_b, name_a, name_b = load_two_images_for_match(
        form, files, static_folder, allowed_file
    )
    ratio = clamp_float(
        form_value(form, "ratio", "ratio_threshold", default=0.75),
        0.75,
        0.4,
        0.95,
    )
    max_matches = clamp_int(
        form_value(form, "max_matches", default=80),
        80,
        10,
        200,
    )

    sift_a, _ = run_sift(image_a, form, descriptor=True)
    sift_b, _ = run_sift(image_b, form, descriptor=True)
    oriented_a = [
        public_sift_point(point, oriented=True)
        for point in sift_a["extended_points"]
    ]
    oriented_b = [
        public_sift_point(point, oriented=True)
        for point in sift_b["extended_points"]
    ]
    matches = match_descriptors(
        sift_a["descriptor_matrix"],
        sift_b["descriptor_matrix"],
        ratio=ratio,
        max_matches=max_matches,
    )
    public_matches = []
    for rank, match in enumerate(matches[:max_matches], start=1):
        public_matches.append({
            "rank": rank,
            "left_index": match["left_index"],
            "right_index": match["right_index"],
            "distance": round(match["distance"], 5),
            "second_distance": round(match["second_distance"], 5),
            "ratio": round(match["ratio"], 5),
            "passed": bool(match["passed"]),
        })
    good_matches = [match for match in matches if match["passed"]]
    return {
        "success": True,
        "meta": {
            "image_a": name_a,
            "image_b": name_b,
            "elapsed_ms": round((perf_counter() - start) * 1000, 2),
        },
        "images": {
            "left": image_to_data_url(image_a),
            "right": image_to_data_url(image_b),
        },
        "extended_points": {
            "left": oriented_a,
            "right": oriented_b,
        },
        "oriented_keypoints": {
            "left": oriented_a,
            "right": oriented_b,
        },
        "stats": {
            "left_keypoints": len(oriented_a),
            "right_keypoints": len(oriented_b),
            "raw_matches": len(matches),
            "good_matches": len(good_matches),
            "ratio_threshold": ratio,
            "avg_distance": round(
                float(np.mean([match["distance"] for match in good_matches]))
                if good_matches else 0.0,
                5,
            ),
            "filter_ratio": round(
                1 - len(good_matches) / max(1, len(matches)),
                5,
            ),
        },
        "matches": public_matches,
    }
