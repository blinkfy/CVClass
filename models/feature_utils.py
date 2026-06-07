import base64
import math
import os
from io import BytesIO
from time import perf_counter

import numpy as np
from PIL import Image, ImageEnhance

DEFAULT_EXAMPLES = {
    "building": "house.png",
    "checker": "cameraman.png",
    "book": "brick.png",
    "texture": "checkerboard.png",
    "peppers": "peppers_color.png",
}


def clamp_int(value, default, lo, hi):
    try:
        value = int(value)
    except (TypeError, ValueError):
        value = default
    return max(lo, min(hi, value))


def clamp_float(value, default, lo, hi):
    try:
        value = float(value)
    except (TypeError, ValueError):
        value = default
    return max(lo, min(hi, value))


def image_to_data_url(image):
    """Only encodes the input/resized image for frontend canvas display; no result drawing is done here."""
    out = BytesIO()
    image.convert("RGB").save(out, format="PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode("utf-8")


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
    w, h = image.size
    if max(w, h) <= max_side:
        return image
    scale = max_side / max(w, h)
    new_size = (max(1, int(round(w * scale))), max(1, int(round(h * scale))))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def resize_array_for_payload(arr, max_side=260):
    arr = np.asarray(arr, dtype=np.float32)
    h, w = arr.shape
    if max(h, w) <= max_side:
        return arr
    scale = max_side / max(h, w)
    nh = max(1, int(round(h * scale)))
    nw = max(1, int(round(w * scale)))
    pil = Image.fromarray(normalize_to_uint8(arr), mode="L")
    small = pil.resize((nw, nh), Image.Resampling.BILINEAR)
    return np.asarray(small, dtype=np.float32)


def normalize_to_uint8(arr, abs_value=False, positive=False):
    arr = np.asarray(arr, dtype=np.float32)
    if abs_value:
        arr = np.abs(arr)
    if positive:
        arr = np.maximum(arr, 0)
    finite = np.isfinite(arr)
    if not finite.any():
        return np.zeros(arr.shape, dtype=np.uint8)
    mn = float(arr[finite].min())
    mx = float(arr[finite].max())
    if abs(mx - mn) < 1e-12:
        return np.zeros(arr.shape, dtype=np.uint8)
    return np.clip((arr - mn) / (mx - mn) * 255, 0, 255).astype(np.uint8)


def pack_array(arr, max_side=260, abs_value=False, positive=False):
    arr = np.asarray(arr, dtype=np.float32)
    h0, w0 = arr.shape
    arr_small = resize_array_for_payload(arr, max_side=max_side)
    vals = normalize_to_uint8(arr_small, abs_value=abs_value, positive=positive)
    return {
        "width": int(vals.shape[1]),
        "height": int(vals.shape[0]),
        "source_width": int(w0),
        "source_height": int(h0),
        "min": round(float(np.nanmin(arr)), 6) if arr.size else 0,
        "max": round(float(np.nanmax(arr)), 6) if arr.size else 0,
        "values": vals.reshape(-1).astype(int).tolist(),
    }


def rgb_to_gray_array(image):
    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    return 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]


def gaussian_kernel_1d(sigma):
    sigma = max(float(sigma), 0.05)
    radius = max(1, int(math.ceil(3 * sigma)))
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    k = np.exp(-(x * x) / (2 * sigma * sigma))
    k /= np.sum(k)
    return k


def blur_gray(gray, sigma):
    gray = np.asarray(gray, dtype=np.float32)
    if sigma <= 0.05:
        return gray.copy()
    k = gaussian_kernel_1d(sigma)
    r = len(k) // 2
    padded = np.pad(gray, ((0, 0), (r, r)), mode="edge")
    tmp = np.zeros_like(gray, dtype=np.float32)
    for i, weight in enumerate(k):
        tmp += float(weight) * padded[:, i:i + gray.shape[1]]
    padded = np.pad(tmp, ((r, r), (0, 0)), mode="edge")
    out = np.zeros_like(gray, dtype=np.float32)
    for i, weight in enumerate(k):
        out += float(weight) * padded[i:i + gray.shape[0], :]
    return out


def convolve2d_manual(img, kernel, pad_mode="edge"):
    img = np.asarray(img, dtype=np.float32)
    kernel = np.asarray(kernel, dtype=np.float32)
    kh, kw = kernel.shape
    rh, rw = kh // 2, kw // 2
    padded = np.pad(img, ((rh, rh), (rw, rw)), mode=pad_mode)
    out = np.zeros_like(img, dtype=np.float32)
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            s = 0.0
            for j in range(kh):
                for i in range(kw):
                    s += float(padded[y + j, x + i]) * float(kernel[j, i])
            out[y, x] = s
    return out


def gradients(gray):
    sobel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32) / 8.0
    sobel_y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32) / 8.0
    return convolve2d_manual(gray, sobel_x), convolve2d_manual(gray, sobel_y)


def harris_response(gray, sigma=1.0, k=0.04):
    ix, iy = gradients(gray)
    ix2 = ix * ix
    iy2 = iy * iy
    ixy = ix * iy
    sxx = blur_gray(ix2, sigma)
    syy = blur_gray(iy2, sigma)
    sxy = blur_gray(ixy, sigma)
    det = sxx * syy - sxy * sxy
    trace = sxx + syy
    r = det - k * trace * trace
    tmp = np.maximum(trace * trace - 4 * det, 0)
    lam1 = (trace + np.sqrt(tmp)) / 2
    lam2 = (trace - np.sqrt(tmp)) / 2
    shi = np.minimum(lam1, lam2)
    return {
        "ix": ix,
        "iy": iy,
        "ix2": ix2,
        "iy2": iy2,
        "ixy": ixy,
        "sxx": sxx,
        "syy": syy,
        "sxy": sxy,
        "r": r,
        "shi": shi,
    }


def nms_points(score, threshold_ratio=0.01, radius=4, max_points=500, positive_only=True):
    score = np.asarray(score, dtype=np.float32)
    s = score.copy()
    if positive_only:
        s[s < 0] = 0
    mx = float(s.max()) if s.size else 0.0
    if mx <= 1e-12:
        return []
    threshold = mx * float(threshold_ratio)
    ys, xs = np.where(s >= threshold)
    candidates = [(float(s[y, x]), int(x), int(y)) for y, x in zip(ys, xs)]
    candidates.sort(reverse=True, key=lambda item: item[0])
    h, w = score.shape
    occupied = np.zeros((h, w), dtype=np.uint8)
    kept = []
    r = max(1, int(radius))
    for val, x, y in candidates:
        y0, y1 = max(0, y - r), min(h, y + r + 1)
        x0, x1 = max(0, x - r), min(w, x + r + 1)
        if occupied[y0:y1, x0:x1].any():
            continue
        kept.append({"x": x, "y": y, "response": round(float(val), 6)})
        occupied[y0:y1, x0:x1] = 1
        if len(kept) >= max_points:
            break
    return kept


def patch_values(arr, x, y, radius=2, precision=0):
    arr = np.asarray(arr)
    h, w = arr.shape
    rows = []
    for yy in range(y - radius, y + radius + 1):
        row = []
        for xx in range(x - radius, x + radius + 1):
            yy2 = min(h - 1, max(0, yy))
            xx2 = min(w - 1, max(0, xx))
            v = float(arr[yy2, xx2])
            row.append(round(v, precision) if precision > 0 else int(round(v)))
        rows.append(row)
    return rows


def gaussian_weight_patch(radius=2, sigma=1.0):
    rows = []
    total = 0.0
    for y in range(-radius, radius + 1):
        row = []
        for x in range(-radius, radius + 1):
            v = math.exp(-(x * x + y * y) / (2 * sigma * sigma))
            row.append(v)
            total += v
        rows.append(row)
    return [[round(v / total, 3) for v in row] for row in rows]


def harris_probe(gray, harris, corners, sigma=1.0):
    if corners:
        x, y = corners[0]["x"], corners[0]["y"]
    else:
        y, x = gray.shape[0] // 2, gray.shape[1] // 2
    sxx = float(harris["sxx"][y, x])
    syy = float(harris["syy"][y, x])
    sxy = float(harris["sxy"][y, x])
    det = sxx * syy - sxy * sxy
    trace = sxx + syy
    r_value = float(harris["r"][y, x])
    return {
        "x": int(x),
        "y": int(y),
        "gray_patch": patch_values(gray, x, y, 2, 0),
        "ix_patch": patch_values(harris["ix"], x, y, 2, 1),
        "iy_patch": patch_values(harris["iy"], x, y, 2, 1),
        "ix2_patch": patch_values(harris["ix2"], x, y, 2, 1),
        "iy2_patch": patch_values(harris["iy2"], x, y, 2, 1),
        "ixiy_patch": patch_values(harris["ixy"], x, y, 2, 1),
        "gaussian_weight": gaussian_weight_patch(2, sigma),
        "M": [[round(sxx, 3), round(sxy, 3)], [round(sxy, 3), round(syy, 3)]],
        "det": round(det, 3),
        "trace": round(trace, 3),
        "r": round(r_value, 3),
    }


def build_gaussian_pyramid(gray, octaves=3, scales=3, sigma0=1.6):
    k = 2 ** (1.0 / max(1, scales))
    pyramid = []
    base = gray.astype(np.float32)
    for o in range(int(octaves)):
        if o == 0:
            current_base = base
        else:
            current_base = pyramid[o - 1][scales][::2, ::2]
        layers = []
        for s in range(int(scales) + 3):
            sigma = sigma0 * (k ** s)
            layers.append(blur_gray(current_base, sigma))
        pyramid.append(layers)
        if min(current_base.shape) < 24:
            break
    return pyramid


def build_dog_pyramid(gaussian_pyr):
    return [[layers[i + 1] - layers[i] for i in range(len(layers) - 1)] for layers in gaussian_pyr]


def detect_dog_extrema(dog_pyr, scales=3, contrast_threshold=0.03, edge_threshold=10, max_points=700):
    keypoints = []
    total_candidates = 0
    contrast_survivors = 0
    for o, dog_layers in enumerate(dog_pyr):
        if len(dog_layers) < 3:
            continue
        img_h, img_w = dog_layers[0].shape
        dog_scale = max(1e-9, max(float(np.max(np.abs(d))) for d in dog_layers))
        thr = contrast_threshold * dog_scale
        for s in range(1, len(dog_layers) - 1):
            prev_l = dog_layers[s - 1]
            cur = dog_layers[s]
            next_l = dog_layers[s + 1]
            c = cur[1:-1, 1:-1]
            abs_mask = np.abs(c) >= thr
            max_mask = abs_mask.copy()
            min_mask = abs_mask.copy()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    p = prev_l[1 + dy:img_h - 1 + dy, 1 + dx:img_w - 1 + dx]
                    n = next_l[1 + dy:img_h - 1 + dy, 1 + dx:img_w - 1 + dx]
                    max_mask &= c > p
                    max_mask &= c > n
                    min_mask &= c < p
                    min_mask &= c < n
                    if dy != 0 or dx != 0:
                        cc = cur[1 + dy:img_h - 1 + dy, 1 + dx:img_w - 1 + dx]
                        max_mask &= c > cc
                        min_mask &= c < cc
            ys, xs = np.where(max_mask | min_mask)
            total_candidates += len(xs)
            for yy, xx in zip(ys, xs):
                y = int(yy + 1)
                x = int(xx + 1)
                contrast_survivors += 1
                if y <= 0 or x <= 0 or y >= img_h - 1 or x >= img_w - 1:
                    continue
                dxx = cur[y, x + 1] + cur[y, x - 1] - 2 * cur[y, x]
                dyy = cur[y + 1, x] + cur[y - 1, x] - 2 * cur[y, x]
                dxy = (cur[y + 1, x + 1] - cur[y + 1, x - 1] - cur[y - 1, x + 1] + cur[y - 1, x - 1]) / 4.0
                det = dxx * dyy - dxy * dxy
                trace = dxx + dyy
                if det <= 1e-12:
                    continue
                ratio = float((trace * trace) / det)
                edge_limit = ((edge_threshold + 1) ** 2) / edge_threshold
                if ratio >= edge_limit:
                    continue
                scale_factor = 2 ** o
                keypoints.append({
                    "x": int(round(x * scale_factor)),
                    "y": int(round(y * scale_factor)),
                    "octave": int(o),
                    "layer": int(s),
                    "x_local": int(x),
                    "y_local": int(y),
                    "sigma": float(1.6 * (2 ** (s / max(1, scales))) * scale_factor),
                    "response": float(abs(cur[y, x]) / dog_scale),
                    "edge_ratio": ratio,
                })
    keypoints.sort(key=lambda p: p["response"], reverse=True)
    kept = []
    min_dist = 5
    for kp in keypoints:
        if all((kp["x"] - q["x"]) ** 2 + (kp["y"] - q["y"]) ** 2 >= min_dist ** 2 for q in kept[:220]):
            kept.append(kp)
        if len(kept) >= max_points:
            break
    return kept, {"raw_extrema": int(total_candidates), "contrast_survivors": int(contrast_survivors), "edge_survivors": int(len(keypoints)), "kept": int(len(kept))}


def assign_orientation_and_descriptor(kp, gaussian_pyr, scales=3):
    o = kp["octave"]
    s = min(kp["layer"], len(gaussian_pyr[o]) - 1)
    img = gaussian_pyr[o][s]
    h, w = img.shape
    x0, y0 = int(kp["x_local"]), int(kp["y_local"])
    gx = np.zeros_like(img, dtype=np.float32)
    gy = np.zeros_like(img, dtype=np.float32)
    gx[:, 1:-1] = img[:, 2:] - img[:, :-2]
    gy[1:-1, :] = img[2:, :] - img[:-2, :]
    mag = np.sqrt(gx * gx + gy * gy)
    ori = np.arctan2(gy, gx)
    hist = np.zeros(36, dtype=np.float32)
    radius = 8
    sigma_w = 4.5
    patch_vectors = []
    for yy in range(y0 - radius, y0 + radius + 1):
        for xx in range(x0 - radius, x0 + radius + 1):
            if yy <= 0 or yy >= h - 1 or xx <= 0 or xx >= w - 1:
                continue
            dy = yy - y0
            dx = xx - x0
            weight = math.exp(-(dx * dx + dy * dy) / (2 * sigma_w * sigma_w))
            angle = float(ori[yy, xx])
            bin_idx = int(((angle + math.pi) / (2 * math.pi)) * 36) % 36
            hist[bin_idx] += float(mag[yy, xx]) * weight
    main_bin = int(np.argmax(hist))
    orientation = (main_bin + 0.5) / 36.0 * 2 * math.pi - math.pi
    descriptor = np.zeros((4, 4, 8), dtype=np.float32)
    cos_t = math.cos(-orientation)
    sin_t = math.sin(-orientation)
    for yy in range(y0 - 8, y0 + 8):
        for xx in range(x0 - 8, x0 + 8):
            if yy <= 0 or xx <= 0 or yy >= h - 1 or xx >= w - 1:
                continue
            dx = xx - x0
            dy = yy - y0
            rx = cos_t * dx - sin_t * dy
            ry = sin_t * dx + cos_t * dy
            cell_x = int((rx + 8) // 4)
            cell_y = int((ry + 8) // 4)
            if not (0 <= cell_x < 4 and 0 <= cell_y < 4):
                continue
            angle = float(ori[yy, xx] - orientation)
            while angle < 0:
                angle += 2 * math.pi
            while angle >= 2 * math.pi:
                angle -= 2 * math.pi
            bin_idx = int(angle / (2 * math.pi) * 8) % 8
            weight = math.exp(-(dx * dx + dy * dy) / (2 * 8 * 8))
            descriptor[cell_y, cell_x, bin_idx] += float(mag[yy, xx]) * weight
            patch_vectors.append({
                "dx": int(dx),
                "dy": int(dy),
                "mag": round(float(mag[yy, xx]), 5),
                "angle": round(float(ori[yy, xx]), 5),
            })
    vec = descriptor.reshape(-1)
    vec = vec / (float(np.linalg.norm(vec)) + 1e-12)
    vec = np.clip(vec, 0, 0.2)
    vec = vec / (float(np.linalg.norm(vec)) + 1e-12)
    return float(orientation), hist.astype(float).tolist(), vec.astype(np.float32), patch_vectors[:256], descriptor.astype(float).tolist()


def public_keypoint(kp):
    return {
        "x": int(kp["x"]),
        "y": int(kp["y"]),
        "octave": int(kp["octave"]),
        "layer": int(kp["layer"]),
        "sigma": round(float(kp["sigma"]), 3),
        "response": round(float(kp["response"]), 6),
        "orientation": round(float(kp.get("orientation", 0.0)), 6),
        "orientation_deg": round(float(kp.get("orientation_deg", 0.0)), 2),
        "edge_ratio": round(float(kp.get("edge_ratio", 0.0)), 3),
    }


def compute_sift(gray, octaves=3, scales=3, sigma0=1.6, contrast_threshold=0.03, edge_threshold=10, max_points=500, with_descriptors=True):
    gaussian = build_gaussian_pyramid(gray, octaves=octaves, scales=scales, sigma0=sigma0)
    dog = build_dog_pyramid(gaussian)
    keypoints, counts = detect_dog_extrema(dog, scales=scales, contrast_threshold=contrast_threshold, edge_threshold=edge_threshold, max_points=max_points)
    descriptors = []
    selected_detail = None
    if with_descriptors:
        for idx, kp in enumerate(keypoints):
            orientation, hist, desc, patch_vectors, cells = assign_orientation_and_descriptor(kp, gaussian, scales=scales)
            kp["orientation"] = orientation
            kp["orientation_deg"] = (orientation * 180 / math.pi) % 360
            descriptors.append(desc)
            if idx == 0:
                selected_detail = public_keypoint(kp)
                selected_detail["histogram36"] = [round(float(v), 6) for v in hist]
                selected_detail["descriptor128"] = [round(float(v), 6) for v in desc.tolist()]
                selected_detail["patch_vectors"] = patch_vectors
                selected_detail["cell_histograms"] = cells
    else:
        for kp in keypoints:
            kp["orientation"] = 0.0
            kp["orientation_deg"] = 0.0
    desc_matrix = np.vstack(descriptors) if descriptors else np.zeros((0, 128), dtype=np.float32)
    return {
        "gaussian": gaussian,
        "dog": dog,
        "keypoints_internal": keypoints,
        "keypoints": [public_keypoint(kp) for kp in keypoints],
        "descriptors": desc_matrix,
        "counts": counts,
        "selected": selected_detail,
    }


def pyramid_arrays(pyramid, max_octaves=3, max_layers=5, dog=False):
    rows = []
    for o, layers in enumerate(pyramid[:max_octaves]):
        row = []
        for s, arr in enumerate(layers[:max_layers]):
            row.append({
                "octave": int(o),
                "layer": int(s),
                "array": pack_array(np.abs(arr) if dog else arr, max_side=110),
            })
        rows.append(row)
    return rows


def dog_extrema_probe(dog):
    if not dog or len(dog[0]) < 3:
        return None
    o = min(1, len(dog) - 1)
    layers = dog[o]
    s = min(2, len(layers) - 2)
    cur = layers[s]
    h, w = cur.shape
    y, x = h // 2, w // 2
    # choose a strong local response if available
    abs_cur = np.abs(cur)
    if abs_cur.size:
        flat_idx = int(np.argmax(abs_cur))
        y, x = divmod(flat_idx, w)
        y = min(h - 2, max(1, y))
        x = min(w - 2, max(1, x))
    def mat(layer):
        return [[round(float(layer[y + dy, x + dx]), 4) for dx in (-1, 0, 1)] for dy in (-1, 0, 1)]
    return {
        "octave": int(o),
        "layer": int(s),
        "x": int(x),
        "y": int(y),
        "prev": mat(layers[s - 1]),
        "current": mat(layers[s]),
        "next": mat(layers[s + 1]),
        "center": round(float(layers[s][y, x]), 5),
    }


def build_harris_payload(image, form):
    gray = rgb_to_gray_array(image)
    sigma = clamp_float(form.get("harris_sigma"), 1.0, 0.4, 4.0)
    k = clamp_float(form.get("harris_k"), 0.04, 0.02, 0.12)
    threshold = clamp_float(form.get("harris_threshold"), 0.01, 0.0001, 0.8)
    radius = clamp_int(form.get("nms_radius"), 4, 1, 12)
    max_corners = clamp_int(form.get("max_corners"), 500, 20, 2000)
    harris = harris_response(gray, sigma=sigma, k=k)
    corners = nms_points(harris["r"], threshold_ratio=threshold, radius=radius, max_points=max_corners)
    shi = nms_points(harris["shi"], threshold_ratio=max(0.001, threshold * 0.5), radius=radius, max_points=max_corners)
    nms_arr = np.zeros_like(gray, dtype=np.float32)
    for p in corners:
        if 0 <= p["y"] < nms_arr.shape[0] and 0 <= p["x"] < nms_arr.shape[1]:
            nms_arr[p["y"], p["x"]] = 255
    return {
        "arrays": {
            "gray": pack_array(gray),
            "ix": pack_array(harris["ix"], abs_value=True),
            "iy": pack_array(harris["iy"], abs_value=True),
            "ix2": pack_array(harris["ix2"]),
            "iy2": pack_array(harris["iy2"]),
            "ixiy": pack_array(harris["ixy"], abs_value=True),
            "harris_response": pack_array(harris["r"], positive=True),
            "nms": pack_array(nms_arr),
        },
        "harris": {"corners": corners, "count": len(corners)},
        "shi_tomasi": {"corners": shi, "count": len(shi)},
        "probe": harris_probe(gray, harris, corners, sigma=sigma),
    }


def build_sift_payload(image, form):
    gray = rgb_to_gray_array(image)
    octaves = clamp_int(form.get("sift_octaves"), 3, 1, 4)
    scales = clamp_int(form.get("sift_scales"), 3, 3, 6)
    sigma0 = clamp_float(form.get("sift_sigma"), 1.6, 0.8, 2.2)
    contrast = clamp_float(form.get("contrast_threshold"), 0.03, 0.005, 0.2)
    edge = clamp_float(form.get("edge_threshold"), 10, 5, 20)
    max_points = clamp_int(form.get("max_sift"), 450, 50, 900)
    sift = compute_sift(gray, octaves, scales, sigma0, contrast, edge, max_points=max_points, with_descriptors=True)
    return {
        "sift": {
            "keypoints": sift["keypoints"],
            "count": len(sift["keypoints"]),
            "counts": sift["counts"],
            "selected": sift["selected"],
        },
        "pyramid": {
            "gaussian": pyramid_arrays(sift["gaussian"], max_octaves=octaves, max_layers=min(scales + 2, 5), dog=False),
            "dog": pyramid_arrays(sift["dog"], max_octaves=octaves, max_layers=min(scales + 1, 4), dog=True),
            "probe": dog_extrema_probe(sift["dog"]),
        },
        "_sift_internal": sift,
    }


def build_feature_response(form, files, static_folder, allowed_file):
    start = perf_counter()
    image, filename = load_request_image(form, files, static_folder, allowed_file, field="image")
    image = resize_for_compute(image, clamp_int(form.get("max_side"), 512, 160, 768))
    mode = form.get("mode", "compare")
    if mode not in {"compare", "harris", "sift_scale", "sift_descriptor"}:
        raise ValueError("feature mode 参数非法")
    response = {
        "success": True,
        "mode": mode,
        "meta": {"filename": filename, "width": image.width, "height": image.height},
        "images": {"original": image_to_data_url(image)},
    }
    if mode in {"compare", "harris"}:
        response.update(build_harris_payload(image, form))
    if mode in {"compare", "sift_scale", "sift_descriptor"}:
        sift_payload = build_sift_payload(image, form)
        response["sift"] = sift_payload["sift"]
        response["pyramid"] = sift_payload["pyramid"]
        sift_payload.pop("_sift_internal", None)
    response["meta"]["elapsed_ms"] = round((perf_counter() - start) * 1000, 2)
    return response


def load_two_images_for_match(form, files, static_folder, allowed_file):
    image_a, name_a = load_request_image(form, files, static_folder, allowed_file, field="image_a")
    file_b = files.get("image_b")
    if file_b and file_b.filename:
        if not allowed_file(file_b.filename):
            raise ValueError("第二张图片格式不受支持")
        image_b = Image.open(BytesIO(file_b.read()))
        image_b.load()
        image_b = image_b.convert("RGB")
        name_b = file_b.filename
    else:
        image_b = image_a.rotate(-18, resample=Image.Resampling.BICUBIC, expand=True)
        image_b = ImageEnhance.Contrast(image_b).enhance(1.08)
        name_b = "auto_rotated.png"
    return resize_for_compute(image_a, 480), resize_for_compute(image_b, 480), name_a, name_b


def match_descriptors(desc_a, desc_b, ratio=0.75, max_matches=80):
    if len(desc_a) == 0 or len(desc_b) < 2:
        return []
    matches = []
    for i, va in enumerate(desc_a):
        diff = desc_b - va[None, :]
        dist = np.sqrt(np.sum(diff * diff, axis=1))
        idx = np.argsort(dist)[:2]
        d1 = float(dist[idx[0]])
        d2 = float(dist[idx[1]]) + 1e-12
        r = d1 / d2
        matches.append({"i": int(i), "j": int(idx[0]), "d1": d1, "d2": d2, "ratio": r, "passed": r < ratio})
    matches.sort(key=lambda m: (not m["passed"], m["ratio"], m["d1"]))
    good = [m for m in matches if m["passed"]][:max_matches]
    bad = [m for m in matches if not m["passed"]][:max(0, max_matches - len(good))]
    return good + bad


def build_feature_match_response(form, files, static_folder, allowed_file):
    start = perf_counter()
    image_a, image_b, name_a, name_b = load_two_images_for_match(form, files, static_folder, allowed_file)
    ratio = clamp_float(form.get("ratio_threshold"), 0.75, 0.4, 0.95)
    max_matches = clamp_int(form.get("max_matches"), 80, 10, 200)
    gray_a = rgb_to_gray_array(image_a)
    gray_b = rgb_to_gray_array(image_b)
    sift_a = compute_sift(gray_a, octaves=3, scales=3, sigma0=1.6, contrast_threshold=0.025, edge_threshold=10, max_points=500, with_descriptors=True)
    sift_b = compute_sift(gray_b, octaves=3, scales=3, sigma0=1.6, contrast_threshold=0.025, edge_threshold=10, max_points=500, with_descriptors=True)
    matches = match_descriptors(sift_a["descriptors"], sift_b["descriptors"], ratio=ratio, max_matches=max_matches)
    public_matches = []
    for idx, m in enumerate(matches[:max_matches], start=1):
        pa = sift_a["keypoints"][m["i"]]
        pb = sift_b["keypoints"][m["j"]]
        public_matches.append({
            "rank": idx,
            "left_index": m["i"],
            "right_index": m["j"],
            "left": {"x": pa["x"], "y": pa["y"], "scale": pa["sigma"], "orientation": pa["orientation_deg"]},
            "right": {"x": pb["x"], "y": pb["y"], "scale": pb["sigma"], "orientation": pb["orientation_deg"]},
            "distance": round(m["d1"], 4),
            "second_distance": round(m["d2"], 4),
            "ratio": round(m["ratio"], 4),
            "passed": bool(m["passed"]),
        })
    good = [m for m in matches if m["passed"]]
    return {
        "success": True,
        "meta": {"image_a": name_a, "image_b": name_b, "elapsed_ms": round((perf_counter() - start) * 1000, 2)},
        "images": {"left": image_to_data_url(image_a), "right": image_to_data_url(image_b)},
        "left_keypoints": sift_a["keypoints"],
        "right_keypoints": sift_b["keypoints"],
        "stats": {
            "left_keypoints": len(sift_a["keypoints"]),
            "right_keypoints": len(sift_b["keypoints"]),
            "raw_matches": len(matches),
            "good_matches": len(good),
            "ratio_threshold": ratio,
            "avg_distance": round(float(np.mean([m["d1"] for m in good])) if good else 0.0, 4),
            "filter_ratio": round(1 - len(good) / max(1, len(matches)), 4),
        },
        "matches": public_matches,
    }
