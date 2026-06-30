import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


__all__ = ["sift_pipeline"]


def ensure_uint8(img):
    arr = np.asarray(img)
    if arr.dtype.kind == "f":
        if arr.size and float(arr.max()) <= 1.0:
            arr = arr * 255.0
        return np.round(arr).clip(0, 255).astype(np.uint8)
    return arr.clip(0, 255).astype(np.uint8)


def to_gray(img):
    arr = ensure_uint8(img)
    if arr.ndim == 2:
        return arr
    weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    return np.round(np.dot(arr[..., :3], weights)).clip(0, 255).astype(np.uint8)


def conv2d(img, kernel):
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    ph, pw = ker.shape[0] // 2, ker.shape[1] // 2
    padded = np.pad(arr, ((ph, ph), (pw, pw)), mode="edge")
    windows = sliding_window_view(padded, ker.shape)
    return np.sum(windows * ker, axis=(2, 3))


def gaussian_kernel(sigma):
    sigma = max(float(sigma), 0.05)
    radius = max(1, int(np.ceil(3.0 * sigma)))
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    x, y = np.meshgrid(ax, ax)
    ker = np.exp(-(x * x + y * y) / (2.0 * sigma * sigma))
    return (ker / ker.sum()).astype(np.float32)


def gaussian_kernel1d(sigma):
    sigma = max(float(sigma), 0.05)
    radius = max(1, int(np.ceil(3.0 * sigma)))
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    ker = np.exp(-(ax * ax) / (2.0 * sigma * sigma))
    return (ker / ker.sum()).astype(np.float32)


_GAUSSIAN_KERNEL1D_CACHE = {}


def cached_gaussian_kernel1d(sigma):
    key = round(max(float(sigma), 0.05), 5)
    kernel = _GAUSSIAN_KERNEL1D_CACHE.get(key)
    if kernel is None:
        kernel = gaussian_kernel1d(key)
        _GAUSSIAN_KERNEL1D_CACHE[key] = kernel
    return kernel


def convolve_axis(img, kernel, axis):
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    pad = len(ker) // 2
    if axis == 1:
        padded = np.pad(arr, ((0, 0), (pad, pad)), mode="edge")
        windows = sliding_window_view(padded, len(ker), axis=1)
        return np.tensordot(windows, ker, axes=([-1], [0])).astype(np.float32)
    padded = np.pad(arr, ((pad, pad), (0, 0)), mode="edge")
    windows = sliding_window_view(padded, len(ker), axis=0)
    return np.tensordot(windows, ker, axes=([-1], [0])).astype(np.float32)


def gaussian_blur(img, sigma):
    ker = cached_gaussian_kernel1d(sigma)
    return convolve_axis(convolve_axis(img, ker, 1), ker, 0)


def resize_half(img):
    arr = np.asarray(img, dtype=np.float32)
    h, w = arr.shape
    h2, w2 = max(1, h // 2), max(1, w // 2)
    trimmed = arr[:h2 * 2, :w2 * 2]
    if trimmed.size == 0:
        return arr.copy()
    return trimmed.reshape(h2, 2, w2, 2).mean(axis=(1, 3))


def resize_nearest(img, scale):
    arr = np.asarray(img)
    if scale >= 0.999:
        return arr.copy()
    h, w = arr.shape[:2]
    nh = max(1, int(round(h * scale)))
    nw = max(1, int(round(w * scale)))
    ys = np.minimum((np.arange(nh) / scale).astype(np.int32), h - 1)
    xs = np.minimum((np.arange(nw) / scale).astype(np.int32), w - 1)
    if arr.ndim == 2:
        return arr[ys[:, None], xs[None, :]]
    return arr[ys[:, None], xs[None, :], :]


def limit_image_size(img, max_side=960):
    arr = np.asarray(img)
    h, w = arr.shape[:2]
    longest = max(h, w)
    if longest <= int(max_side):
        return arr.copy(), 1.0
    scale = float(max_side) / float(longest)
    return resize_nearest(arr, scale), scale


def normalize_float(img):
    arr = np.asarray(img, dtype=np.float32)
    if arr.dtype.kind != "f":
        arr = arr.astype(np.float32) / 255.0
    max_val = float(arr.max()) if arr.size else 0.0
    if max_val > 1.5:
        arr = arr / 255.0
    return arr.astype(np.float32)


def generate_gaussian_octaves(image, sigma=1.6, num_layers=4,
                              k_stride=1, octaves=3):
    base = normalize_float(image)
    sigma_res = float(np.sqrt(max(sigma * sigma - 1.0, 0.01)))
    base = gaussian_blur(base, sigma_res)
    result = []
    current = base
    for _ in range(max(1, int(octaves))):
        if min(current.shape) < 24:
            break
        layers = generate_gaussian_images(current, sigma, num_layers, k_stride)
        result.append(layers)
        current = resize_half(layers[min(2, len(layers) - 1)])
    return result


def generate_gaussian_images(image, sigma, num_layers=4, k_stride=1):
    k = 2.0 ** (1.0 / float(k_stride))
    kernels = np.zeros(int(num_layers), dtype=np.float32)
    kernels[0] = float(sigma)
    for i in range(1, int(num_layers)):
        old = (k ** (i - 1)) * float(sigma)
        new = k * old
        kernels[i] = np.sqrt(max(new * new - old * old, 0.01))
    images = [np.asarray(image, dtype=np.float32)]
    for kernel in kernels:
        images.append(gaussian_blur(image, float(kernel)))
    return images


def generate_dog_space(gaussian_images):
    return [img2 - img1 for img1, img2 in zip(gaussian_images, gaussian_images[1:])]


def is_local_extremum(l1, l2, l3, threshold):
    center = float(l2[1, 1])
    if abs(center) <= float(threshold):
        return False
    if center > 0:
        return center >= float(l1.max()) and center >= float(l3.max()) and center >= float(l2.max())
    return center <= float(l1.min()) and center <= float(l3.min()) and center <= float(l2.min())


def extrema_mask_3x3x3(image1, image2, image3, threshold, border=5):
    current = np.asarray(image2, dtype=np.float32)
    h, w = current.shape
    mask = np.zeros((h, w), dtype=bool)
    if h < 3 or w < 3 or h <= border * 2 or w <= border * 2:
        return mask
    layers = [
        np.asarray(image1, dtype=np.float32),
        current,
        np.asarray(image3, dtype=np.float32),
    ]
    maxima = []
    minima = []
    for layer in layers:
        windows = sliding_window_view(layer, (3, 3))
        maxima.append(windows.max(axis=(2, 3)))
        minima.append(windows.min(axis=(2, 3)))
    local_max = np.maximum.reduce(maxima)
    local_min = np.minimum.reduce(minima)
    center = current[1:-1, 1:-1]
    interior = ((center > float(threshold)) & (center >= local_max)) | (
        (center < -float(threshold)) & (center <= local_min)
    )
    mask[1:-1, 1:-1] = interior
    if border > 0:
        mask[:border, :] = False
        mask[-border:, :] = False
        mask[:, :border] = False
        mask[:, -border:] = False
    return mask


def compute_first_derivative(cube):
    dx = (cube[1, 1, 2] - cube[1, 1, 0]) / 2.0
    dy = (cube[1, 2, 1] - cube[1, 0, 1]) / 2.0
    ds = (cube[2, 1, 1] - cube[0, 1, 1]) / 2.0
    return np.array([dx, dy, ds], dtype=np.float32)


def compute_second_derivative(cube):
    center = cube[1, 1, 1]
    dxx = cube[1, 1, 2] + cube[1, 1, 0] - 2.0 * center
    dyy = cube[1, 2, 1] + cube[1, 0, 1] - 2.0 * center
    dss = cube[2, 1, 1] + cube[0, 1, 1] - 2.0 * center
    dxy = (cube[1, 2, 2] - cube[1, 2, 0] - cube[1, 0, 2] + cube[1, 0, 0]) / 4.0
    dxs = (cube[2, 1, 2] - cube[2, 1, 0] - cube[0, 1, 2] + cube[0, 1, 0]) / 4.0
    dys = (cube[2, 2, 1] - cube[2, 0, 1] - cube[0, 2, 1] + cube[0, 0, 1]) / 4.0
    return np.array([[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]], dtype=np.float32)


def compute_gradient_layer(g_image):
    arr = np.asarray(g_image, dtype=np.float32)
    dx = np.zeros_like(arr, dtype=np.float32)
    dy = np.zeros_like(arr, dtype=np.float32)
    dx[:, 1:-1] = 0.5 * (arr[:, 2:] - arr[:, :-2])
    dy[1:-1, :] = 0.5 * (arr[2:, :] - arr[:-2, :])
    mag = np.sqrt(dx * dx + dy * dy).astype(np.float32)
    orientation_angle = (np.rad2deg(np.arctan2(dy, dx)) % 360.0).astype(np.float32)
    descriptor_angle = (np.rad2deg(np.arctan2(-dy, dx)) % 360.0).astype(np.float32)
    return {
        "dx": dx,
        "dy": dy,
        "mag": mag,
        "orientation_angle": orientation_angle,
        "descriptor_mag": (mag * 2.0).astype(np.float32),
        "descriptor_angle": descriptor_angle,
    }


def build_gradient_cache(gaussian_octaves):
    return [[compute_gradient_layer(layer) for layer in octave] for octave in gaussian_octaves]


def compute_orientation(pt, size, g_image, gradient_layer=None):
    radius = int(round(3.0 * size * 1.5))
    radius = max(1, min(radius, 32))
    image_shape = g_image.shape
    num_bins = 36
    hist = np.zeros(num_bins, dtype=np.float32)
    x0, y0 = pt
    cy = int(round(y0))
    cx = int(round(x0))
    y_min = max(1, cy - radius)
    y_max = min(image_shape[0] - 1, cy + radius + 1)
    x_min = max(1, cx - radius)
    x_max = min(image_shape[1] - 1, cx + radius + 1)
    if y_min < y_max and x_min < x_max:
        yy, xx = np.mgrid[y_min:y_max, x_min:x_max]
        di = yy - cy
        dj = xx - cx
        weight = np.exp(-0.5 * (di * di + dj * dj) / ((size * 1.5) ** 2 + 1e-12))
        if gradient_layer is None:
            patch = np.asarray(g_image, dtype=np.float32)
            dx = 0.5 * (patch[y_min:y_max, x_min + 1:x_max + 1] - patch[y_min:y_max, x_min - 1:x_max - 1])
            dy = 0.5 * (patch[y_min + 1:y_max + 1, x_min:x_max] - patch[y_min - 1:y_max - 1, x_min:x_max])
            value = np.sqrt(dx * dx + dy * dy)
            angle = np.rad2deg(np.arctan2(dy, dx)) % 360.0
        else:
            value = gradient_layer["mag"][y_min:y_max, x_min:x_max]
            angle = gradient_layer["orientation_angle"][y_min:y_max, x_min:x_max]
        bins = np.rint(angle * num_bins / 360.0).astype(np.int32) % num_bins
        hist += np.bincount(bins.ravel(), weights=(weight * value).ravel(), minlength=num_bins).astype(np.float32)
    smooth = (
        6.0 * hist
        + 4.0 * (np.roll(hist, 1) + np.roll(hist, -1))
        + np.roll(hist, 2)
        + np.roll(hist, -2)
    ) / 16.0
    peak = float(smooth.max()) if smooth.size else 0.0
    if peak <= 1e-12:
        return [0.0], smooth, hist
    orientations = []
    for index in range(num_bins):
        if smooth[index] > smooth[index - 1] and smooth[index] > smooth[(index + 1) % num_bins] and smooth[index] >= 0.8 * peak:
            orientations.append(index * 360.0 / num_bins)
    if not orientations:
        orientations = [float(np.argmax(smooth) * 360.0 / num_bins)]
    orientations.sort(
        key=lambda angle: float(smooth[int(round(angle * num_bins / 360.0)) % num_bins]),
        reverse=True,
    )
    return orientations, smooth, hist


def refine_keypoint(x, y, layer, dog_images, sigma, threshold,
                    border, num_layers, gaussian_images, gradient_layers,
                    octave_index, octave_scale, gamma=10):
    image_shape = dog_images[0].shape
    cube = None
    update = np.zeros(3, dtype=np.float32)
    for iter_num in range(5):
        img1, img2, img3 = dog_images[layer - 1:layer + 2]
        cube = np.array([
            img1[x - 1:x + 2, y - 1:y + 2],
            img2[x - 1:x + 2, y - 1:y + 2],
            img3[x - 1:x + 2, y - 1:y + 2],
        ], dtype=np.float32)
        grad = compute_first_derivative(cube)
        hessian = compute_second_derivative(cube)
        try:
            update = -np.linalg.lstsq(hessian, grad, rcond=None)[0]
        except np.linalg.LinAlgError:
            return []
        if np.all(np.abs(update) < 0.5):
            break
        y += int(round(float(update[0])))
        x += int(round(float(update[1])))
        layer += int(round(float(update[2])))
        if x < border or x >= image_shape[0] - border or y < border or y >= image_shape[1] - border or layer < 1 or layer > num_layers - 2:
            return []
    else:
        return []
    extremum = float(cube[1, 1, 1] + 0.5 * np.dot(grad, update))
    if abs(extremum) < float(threshold):
        return []
    xy_hessian = hessian[:2, :2]
    trace = float(np.trace(xy_hessian))
    det = float(np.linalg.det(xy_hessian))
    if det <= 1e-12 or (trace * trace) / det >= ((gamma + 1.0) ** 2) / gamma:
        return []
    pt = (float(y + update[0]), float(x + update[1]))
    size = float(sigma * (2.0 ** (layer + update[2])))
    g_image = gaussian_images[layer]
    gradient_layer = gradient_layers[layer] if gradient_layers else None
    orientations, hist, raw_hist = compute_orientation(pt, size, g_image, gradient_layer)
    scale_to_original = 2 ** octave_index
    keypoints = []
    for orientation in orientations:
        keypoints.append({
            "x": float(pt[0] * scale_to_original),
            "y": float(pt[1] * scale_to_original),
            "octave_x": float(pt[0]),
            "octave_y": float(pt[1]),
            "octave": int(octave_index),
            "layer": int(layer),
            "scale": float(size * scale_to_original),
            "octave_scale": float(size),
            "orientation": float(orientation),
            "response": abs(extremum),
            "orientation_hist": hist,
            "orientation_hist_raw": raw_hist,
        })
    return keypoints


def detect_keypoints(gray, sigma=1.6, num_layers=4, k_stride=1,
                     threshold=0.02, border=5, gamma=10, octaves=3):
    gaussian_octaves = generate_gaussian_octaves(gray, sigma, num_layers, k_stride, octaves)
    dog_octaves = [generate_dog_space(images) for images in gaussian_octaves]
    gradient_cache = build_gradient_cache(gaussian_octaves)
    keypoints = []
    candidates = []
    for octave_index, dog_images in enumerate(dog_octaves):
        if len(dog_images) < 3:
            continue
        for layer, (image1, image2, image3) in enumerate(zip(dog_images, dog_images[1:], dog_images[2:])):
            current_layer = layer + 1
            h, w = image2.shape
            if h <= border * 2 or w <= border * 2:
                continue
            mask = extrema_mask_3x3x3(image1, image2, image3, threshold, border)
            rows, cols = np.nonzero(mask)
            scale_to_original = 2 ** octave_index
            for x, y in zip(rows.tolist(), cols.tolist()):
                candidates.append({
                    "x": float(y * scale_to_original),
                    "y": float(x * scale_to_original),
                    "octave": int(octave_index),
                    "layer": int(current_layer),
                    "response": float(abs(image2[x, y])),
                })
                refined = refine_keypoint(
                    x, y, current_layer, dog_images, sigma, threshold,
                    border, len(dog_images), gaussian_octaves[octave_index],
                    gradient_cache[octave_index], octave_index, scale_to_original, gamma,
                )
                keypoints.extend(refined)
    keypoints.sort(key=lambda p: p["response"], reverse=True)
    candidates.sort(key=lambda p: p["response"], reverse=True)
    return gaussian_octaves, dog_octaves, gradient_cache, candidates, keypoints


def trilinear_interpolation(i, j, value, orientation, cube):
    i_quant = int(np.floor(i))
    j_quant = int(np.floor(j))
    o_quant = int(np.floor(orientation)) % 8
    i_res = i - i_quant
    j_res = j - j_quant
    o_res = (orientation - o_quant) % 8
    c0 = (1.0 - i_res) * value
    c1 = i_res * value
    c11 = c1 * j_res
    c10 = c1 * (1.0 - j_res)
    c01 = c0 * j_res
    c00 = c0 * (1.0 - j_res)
    values = [
        (i_quant + 1, j_quant + 1, o_quant, c00 * (1.0 - o_res)),
        (i_quant + 1, j_quant + 1, (o_quant + 1) % 8, c00 * o_res),
        (i_quant + 1, j_quant + 2, o_quant, c01 * (1.0 - o_res)),
        (i_quant + 1, j_quant + 2, (o_quant + 1) % 8, c01 * o_res),
        (i_quant + 2, j_quant + 1, o_quant, c10 * (1.0 - o_res)),
        (i_quant + 2, j_quant + 1, (o_quant + 1) % 8, c10 * o_res),
        (i_quant + 2, j_quant + 2, o_quant, c11 * (1.0 - o_res)),
        (i_quant + 2, j_quant + 2, (o_quant + 1) % 8, c11 * o_res),
    ]
    for a, b, c, v in values:
        if 0 <= a < cube.shape[0] and 0 <= b < cube.shape[1]:
            cube[a, b, c] += v


def compute_descriptor_detail(gaussian_octaves, keypoint, gradient_cache=None):
    octave = keypoint["octave"]
    layer = min(keypoint["layer"], len(gaussian_octaves[octave]) - 1)
    g_image = gaussian_octaves[octave][layer]
    gradient_layer = None
    if gradient_cache and 0 <= octave < len(gradient_cache) and 0 <= layer < len(gradient_cache[octave]):
        gradient_layer = gradient_cache[octave][layer]
    x = int(round(keypoint["octave_x"]))
    y = int(round(keypoint["octave_y"]))
    size = max(float(keypoint["octave_scale"]), 1.0)
    orientation = 360.0 - float(keypoint["orientation"])
    win_s = 3.0 * size
    win_l = int(round(min(np.sqrt(2.0) * win_s * 2.5, np.sqrt(g_image.shape[0] ** 2 + g_image.shape[1] ** 2))))
    win_l = max(2, min(win_l, 32))
    result_cube = np.zeros((6, 6, 8), dtype=np.float32)
    sin_t = np.sin(np.deg2rad(orientation))
    cos_t = np.cos(np.deg2rad(orientation))
    for i in range(-win_l, win_l + 1):
        for j in range(-win_l, win_l + 1):
            i_rot = j * sin_t + i * cos_t
            j_rot = j * cos_t - i * sin_t
            ci = (i_rot / win_s) + 1.5
            cj = (j_rot / win_s) + 1.5
            if ci <= -1 or cj <= -1 or ci >= 4 or cj >= 4:
                continue
            yi = y + i
            xj = x + j
            if yi <= 0 or xj <= 0 or yi >= g_image.shape[0] - 1 or xj >= g_image.shape[1] - 1:
                continue
            if gradient_layer is None:
                dx = g_image[yi, xj + 1] - g_image[yi, xj - 1]
                dy = g_image[yi - 1, xj] - g_image[yi + 1, xj]
                mag = np.sqrt(dx * dx + dy * dy)
                grad_orientation = np.rad2deg(np.arctan2(dy, dx)) % 360.0
            else:
                mag = gradient_layer["descriptor_mag"][yi, xj]
                grad_orientation = gradient_layer["descriptor_angle"][yi, xj]
            weight = np.exp(-0.125 * ((i_rot / win_s) ** 2 + (j_rot / win_s) ** 2))
            o_index = (grad_orientation - orientation) * 8.0 / 360.0
            trilinear_interpolation(ci, cj, weight * mag, o_index, result_cube)
    raw = result_cube[1:-1, 1:-1, :].flatten()
    norm = float(np.linalg.norm(raw))
    if norm <= 1e-12:
        before_clip = np.zeros(128, dtype=np.float32)
        clipped = np.zeros(128, dtype=np.float32)
        final = np.zeros(128, dtype=np.float32)
    else:
        before_clip = raw / norm
        clipped = np.minimum(before_clip, 0.2)
        norm2 = float(np.linalg.norm(clipped))
        final = clipped / norm2 if norm2 > 1e-12 else clipped
    return final.astype(np.float32), before_clip.astype(np.float32), clipped.astype(np.float32)


def compute_descriptors(gaussian_octaves, keypoints, max_descriptors=500, gradient_cache=None):
    descriptors = []
    for keypoint in keypoints[:max_descriptors]:
        descriptor, _, _ = compute_descriptor_detail(gaussian_octaves, keypoint, gradient_cache)
        descriptors.append(descriptor)
    return descriptors


def sift_pipeline(img, sigma=1.6, num_layers=4, k_stride=1, threshold=0.02,
                  border=5, gamma=10, octaves=3, max_keypoints=500,
                  max_compute_side=640):
    original = ensure_uint8(img)
    compute_img, compute_scale = limit_image_size(original, max_compute_side)
    gray_u8 = to_gray(compute_img)
    gray = gray_u8.astype(np.float32) / 255.0
    gaussian_octaves, dog_octaves, gradient_cache, candidates, keypoints = detect_keypoints(
        gray,
        sigma=sigma,
        num_layers=num_layers,
        k_stride=k_stride,
        threshold=threshold,
        border=border,
        gamma=gamma,
        octaves=octaves,
    )
    keypoints = keypoints[:max_keypoints]
    descriptors = compute_descriptors(gaussian_octaves, keypoints, gradient_cache=gradient_cache)
    return {
        "original": original,
        "compute_image": compute_img,
        "compute_scale": float(compute_scale),
        "gray_u8": gray_u8,
        "gray": gray,
        "gaussian_octaves": gaussian_octaves,
        "dog_octaves": dog_octaves,
        "gradient_cache": gradient_cache,
        "candidates": candidates,
        "keypoints": keypoints,
        "descriptors": descriptors,
        "metrics": {
            "candidates": int(len(candidates)),
            "keypoints": int(len(keypoints)),
            "descriptors": int(len(descriptors)),
            "descriptor_length": 128 if descriptors else 0,
            "octaves": int(len(gaussian_octaves)),
            "sigma": float(sigma),
            "threshold": float(threshold),
            "gamma": float(gamma),
            "compute_scale": float(compute_scale),
            "compute_width": int(compute_img.shape[1]),
            "compute_height": int(compute_img.shape[0]),
        },
    }
