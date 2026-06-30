"""
SIFT (Scale-Invariant Feature Transform) algorithm.
Pure NumPy: scale-space construction, keypoint detection,
orientation assignment, and 128-dimensional descriptor generation.

Core flow:
  1. Build Gaussian scale-space pyramid (octaves of progressively blurred images)
  2. Build DoG (Difference of Gaussian) space
  3. 3x3x3 extrema detection -> keypoint candidates
  4. Taylor sub-pixel refinement + edge response suppression
  5. Gradient orientation histogram -> dominant orientation assignment
  6. Rotation-normalized 128-dim descriptor generation
"""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from app.utils.image_utils import to_uint8 as _to_uint8, ensure_gray as _ensure_gray


def ensure_uint8(img):
    return _to_uint8(img)


def to_gray(img):
    return _ensure_gray(img)


def conv2d(img, kernel):
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    ph, pw = ker.shape[0] // 2, ker.shape[1] // 2
    padded = np.pad(arr, ((ph, ph), (pw, pw)), mode='edge')
    windows = sliding_window_view(padded, ker.shape)
    return np.sum(windows * ker, axis=(2, 3))


def gaussian_kernel1d(sigma):
    """1D Gaussian kernel for separable filtering (faster than 2D)."""
    sigma = max(float(sigma), 0.05)
    radius = max(1, int(np.ceil(3.0 * sigma)))
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    ker = np.exp(-(ax * ax) / (2.0 * sigma * sigma))
    return (ker / ker.sum()).astype(np.float32)


_GAUSS1D_CACHE = {}


def _cached_gauss1d(sigma):
    key = round(max(float(sigma), 0.05), 5)
    k = _GAUSS1D_CACHE.get(key)
    if k is None:
        k = gaussian_kernel1d(key)
        _GAUSS1D_CACHE[key] = k
    return k


def convolve_axis(img, kernel, axis):
    """1D convolution along specified axis (half of separable convolution)."""
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    pad = len(ker) // 2
    if axis == 1:
        padded = np.pad(arr, ((0, 0), (pad, pad)), mode='edge')
        windows = sliding_window_view(padded, len(ker), axis=1)
        return np.tensordot(windows, ker, axes=([-1], [0])).astype(np.float32)
    padded = np.pad(arr, ((pad, pad), (0, 0)), mode='edge')
    windows = sliding_window_view(padded, len(ker), axis=0)
    return np.tensordot(windows, ker, axes=([-1], [0])).astype(np.float32)


def gaussian_blur(img, sigma):
    """Separable Gaussian blur: horizontal then vertical (faster than 2D conv)."""
    ker = _cached_gauss1d(sigma)
    return convolve_axis(convolve_axis(img, ker, 1), ker, 0)


def resize_half(img):
    """2x downsampling via mean pooling (for building next octave)."""
    arr = np.asarray(img, dtype=np.float32)
    h, w = arr.shape
    h2, w2 = max(1, h // 2), max(1, w // 2)
    trimmed = arr[:h2 * 2, :w2 * 2]
    if trimmed.size == 0:
        return arr.copy()
    return trimmed.reshape(h2, 2, w2, 2).mean(axis=(1, 3))


def resize_nearest(img, scale):
    """Nearest-neighbor resize."""
    arr = np.asarray(img)
    if scale >= 0.999:
        return arr.copy()
    h, w = arr.shape[:2]
    nh, nw = max(1, int(round(h * scale))), max(1, int(round(w * scale)))
    ys = np.minimum((np.arange(nh) / scale).astype(np.int32), h - 1)
    xs = np.minimum((np.arange(nw) / scale).astype(np.int32), w - 1)
    if arr.ndim == 2:
        return arr[ys[:, None], xs[None, :]]
    return arr[ys[:, None], xs[None, :], :]


def limit_image_size(img, max_side=960):
    """Limit image longest side to speed up computation."""
    arr = np.asarray(img)
    h, w = arr.shape[:2]
    longest = max(h, w)
    if longest <= int(max_side):
        return arr.copy(), 1.0
    scale = float(max_side) / float(longest)
    return resize_nearest(arr, scale), scale


def normalize_float(img):
    """Normalize image to float32 in [0, 1]."""
    arr = np.asarray(img, dtype=np.float32)
    if arr.dtype.kind != 'f':
        arr = arr.astype(np.float32) / 255.0
    if float(arr.max()) > 1.5:
        arr = arr / 255.0
    return arr.astype(np.float32)


def generate_gaussian_octaves(image, sigma=1.6, num_layers=4, k_stride=1, octaves=3):
    """Build Gaussian scale-space pyramid."""
    base = normalize_float(image)
    sigma_res = float(np.sqrt(max(sigma * sigma - 1.0, 0.01)))
    base = gaussian_blur(base, sigma_res)
    result = []
    current = base
    for _ in range(max(1, int(octaves))):
        if min(current.shape) < 24:
            break
        layers = _generate_gaussian_layers(current, sigma, num_layers, k_stride)
        result.append(layers)
        current = resize_half(layers[min(2, len(layers) - 1)])
    return result


def _generate_gaussian_layers(image, sigma, num_layers, k_stride):
    """Generate progressively blurred Gaussian layers within one octave."""
    k = 2.0 ** (1.0 / float(k_stride))
    kernels = np.zeros(int(num_layers), dtype=np.float32)
    kernels[0] = float(sigma)
    for i in range(1, int(num_layers)):
        old = (k ** (i - 1)) * float(sigma)
        new = k * old
        kernels[i] = np.sqrt(max(new * new - old * old, 0.01))
    images = [np.asarray(image, dtype=np.float32)]
    for ker_sigma in kernels:
        images.append(gaussian_blur(image, float(ker_sigma)))
    return images


def generate_dog_space(gaussian_images):
    """DoG: subtract adjacent Gaussian layers (approximates scale-normalized Laplacian)."""
    return [img2 - img1 for img1, img2 in zip(gaussian_images, gaussian_images[1:])]


def extrema_mask_3x3x3(image1, image2, image3, threshold, border=5):
    """Detect 3x3x3 local extrema in scale-space (3 DoG layers)."""
    current = np.asarray(image2, dtype=np.float32)
    h, w = current.shape
    mask = np.zeros((h, w), dtype=bool)
    if h < 3 or w < 3 or h <= border * 2 or w <= border * 2:
        return mask

    layers = [np.asarray(image1, dtype=np.float32), current, np.asarray(image3, dtype=np.float32)]
    maxima = [sliding_window_view(layer, (3, 3)).max(axis=(2, 3)) for layer in layers]
    minima = [sliding_window_view(layer, (3, 3)).min(axis=(2, 3)) for layer in layers]
    local_max = np.maximum.reduce(maxima)
    local_min = np.minimum.reduce(minima)

    center = current[1:-1, 1:-1]
    interior = ((center > float(threshold)) & (center >= local_max)) | \
               ((center < -float(threshold)) & (center <= local_min))
    mask[1:-1, 1:-1] = interior

    if border > 0:
        mask[:border, :] = False
        mask[-border:, :] = False
        mask[:, :border] = False
        mask[:, -border:] = False
    return mask


def compute_first_derivative(cube):
    """First derivative at center of 3x3x3 cube (central difference)."""
    dx = (cube[1, 1, 2] - cube[1, 1, 0]) / 2.0
    dy = (cube[1, 2, 1] - cube[1, 0, 1]) / 2.0
    ds = (cube[2, 1, 1] - cube[0, 1, 1]) / 2.0
    return np.array([dx, dy, ds], dtype=np.float32)


def compute_second_derivative(cube):
    """Hessian matrix (3x3) at center of DoG cube."""
    c = float(cube[1, 1, 1])
    dxx = cube[1, 1, 2] + cube[1, 1, 0] - 2.0 * c
    dyy = cube[1, 2, 1] + cube[1, 0, 1] - 2.0 * c
    dss = cube[2, 1, 1] + cube[0, 1, 1] - 2.0 * c
    dxy = (cube[1, 2, 2] - cube[1, 2, 0] - cube[1, 0, 2] + cube[1, 0, 0]) / 4.0
    dxs = (cube[2, 1, 2] - cube[2, 1, 0] - cube[0, 1, 2] + cube[0, 1, 0]) / 4.0
    dys = (cube[2, 2, 1] - cube[2, 0, 1] - cube[0, 2, 1] + cube[0, 0, 1]) / 4.0
    return np.array([[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]], dtype=np.float32)


def _det2(m):
    return float(m[0, 0] * m[1, 1] - m[0, 1] * m[1, 0])


def _solve3(m, b):
    """Solve a 3x3 system with Cramer's rule to avoid fragile LAPACK calls."""
    a00, a01, a02 = [float(v) for v in m[0]]
    a10, a11, a12 = [float(v) for v in m[1]]
    a20, a21, a22 = [float(v) for v in m[2]]
    b0, b1, b2 = [float(v) for v in b]
    det = (
        a00 * (a11 * a22 - a12 * a21)
        - a01 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * a21 - a11 * a20)
    )
    if abs(det) <= 1e-12 or not np.isfinite(det):
        return None
    dx = (
        b0 * (a11 * a22 - a12 * a21)
        - a01 * (b1 * a22 - a12 * b2)
        + a02 * (b1 * a21 - a11 * b2)
    ) / det
    dy = (
        a00 * (b1 * a22 - a12 * b2)
        - b0 * (a10 * a22 - a12 * a20)
        + a02 * (a10 * b2 - b1 * a20)
    ) / det
    ds = (
        a00 * (a11 * b2 - b1 * a21)
        - a01 * (a10 * b2 - b1 * a20)
        + b0 * (a10 * a21 - a11 * a20)
    ) / det
    out = np.array([dx, dy, ds], dtype=np.float32)
    return out if np.isfinite(out).all() else None


def compute_gradient_layer(g_image):
    """Compute gradient magnitude and orientation for one Gaussian layer."""
    arr = np.asarray(g_image, dtype=np.float32)
    dx = np.zeros_like(arr)
    dy = np.zeros_like(arr)
    dx[:, 1:-1] = 0.5 * (arr[:, 2:] - arr[:, :-2])
    dy[1:-1, :] = 0.5 * (arr[2:, :] - arr[:-2, :])
    mag = np.sqrt(dx * dx + dy * dy).astype(np.float32)
    orient_angle = (np.rad2deg(np.arctan2(dy, dx)) % 360.0).astype(np.float32)
    desc_angle = (np.rad2deg(np.arctan2(-dy, dx)) % 360.0).astype(np.float32)
    return {'dx': dx, 'dy': dy, 'mag': mag,
            'orientation_angle': orient_angle,
            'descriptor_mag': (mag * 2.0).astype(np.float32),
            'descriptor_angle': desc_angle}


def build_gradient_cache(gaussian_octaves):
    """Precompute gradient info for all octaves and layers."""
    return [[compute_gradient_layer(layer) for layer in octave] for octave in gaussian_octaves]


def compute_orientation(pt, size, g_image, gradient_layer=None):
    """Compute dominant orientation(s) for a keypoint using gradient histogram."""
    radius = int(round(3.0 * size * 1.5))
    radius = max(1, min(radius, 32))
    h_img, w_img = g_image.shape
    num_bins = 36
    hist = np.zeros(num_bins, dtype=np.float32)

    cx, cy = int(round(pt[0])), int(round(pt[1]))
    y_min, y_max = max(1, cy - radius), min(h_img - 1, cy + radius + 1)
    x_min, x_max = max(1, cx - radius), min(w_img - 1, cx + radius + 1)

    if y_min < y_max and x_min < x_max:
        yy, xx = np.mgrid[y_min:y_max, x_min:x_max]
        di, dj = yy - cy, xx - cx
        weight = np.exp(-0.5 * (di * di + dj * dj) / ((size * 1.5) ** 2 + 1e-12))
        if gradient_layer is None:
            patch = np.asarray(g_image, dtype=np.float32)
            dx_p = 0.5 * (patch[y_min:y_max, x_min+1:x_max+1] - patch[y_min:y_max, x_min-1:x_max-1])
            dy_p = 0.5 * (patch[y_min+1:y_max+1, x_min:x_max] - patch[y_min-1:y_max-1, x_min:x_max])
            val = np.sqrt(dx_p*dx_p + dy_p*dy_p)
            ang = np.rad2deg(np.arctan2(dy_p, dx_p)) % 360.0
        else:
            val = gradient_layer['mag'][y_min:y_max, x_min:x_max]
            ang = gradient_layer['orientation_angle'][y_min:y_max, x_min:x_max]
        bins = np.rint(ang * num_bins / 360.0).astype(np.int32) % num_bins
        hist += np.bincount(bins.ravel(), weights=(weight * val).ravel(), minlength=num_bins).astype(np.float32)

    # Smooth histogram to reduce noise
    smooth = (6.0 * hist + 4.0 * (np.roll(hist, 1) + np.roll(hist, -1))
              + np.roll(hist, 2) + np.roll(hist, -2)) / 16.0

    peak = float(smooth.max()) if smooth.size else 0.0
    if peak <= 1e-12:
        return [0.0], smooth, hist

    orientations = []
    for idx in range(num_bins):
        if smooth[idx] > smooth[idx-1] and smooth[idx] > smooth[(idx+1) % num_bins] \
           and smooth[idx] >= 0.8 * peak:
            orientations.append(idx * 360.0 / num_bins)
    if not orientations:
        orientations = [float(np.argmax(smooth) * 360.0 / num_bins)]
    orientations.sort(key=lambda a: float(smooth[int(round(a * num_bins / 360.0)) % num_bins]), reverse=True)
    return orientations, smooth, hist


def refine_keypoint(x, y, layer, dog_images, sigma, threshold, border,
                    gaussian_images, gradient_layers, octave_index, gamma=10):
    """Taylor expansion sub-pixel refinement + edge response suppression."""
    img_shape = dog_images[0].shape
    update = np.zeros(3, dtype=np.float32)

    for _ in range(5):
        img1, img2, img3 = dog_images[layer-1:layer+2]
        cube = np.array([
            img1[x-1:x+2, y-1:y+2],
            img2[x-1:x+2, y-1:y+2],
            img3[x-1:x+2, y-1:y+2],
        ], dtype=np.float32)
        grad = compute_first_derivative(cube)
        hessian = compute_second_derivative(cube)
        if not (np.isfinite(grad).all() and np.isfinite(hessian).all()):
            return []
        solved = _solve3(hessian, grad)
        if solved is None:
            return []
        update = -solved
        if np.all(np.abs(update) < 0.5):
            break
        y += int(round(float(update[0])))
        x += int(round(float(update[1])))
        layer += int(round(float(update[2])))
        if x < border or x >= img_shape[0] - border or \
           y < border or y >= img_shape[1] - border or \
           layer < 1 or layer > len(dog_images) - 2:
            return []
    else:
        return []

    extremum = float(cube[1, 1, 1] + 0.5 * np.dot(grad, update))
    if abs(extremum) < float(threshold):
        return []

    # Edge response suppression: 2x2 Hessian trace^2/det ratio
    xy_hessian = hessian[:2, :2]
    trace = float(np.trace(xy_hessian))
    det = _det2(xy_hessian)
    if det <= 1e-12 or (trace * trace) / det >= ((gamma + 1.0) ** 2) / gamma:
        return []

    pt = (float(y + update[0]), float(x + update[1]))
    size = float(sigma * (2.0 ** (layer + update[2])))
    g_img = gaussian_images[layer]
    grad_layer = gradient_layers[layer] if gradient_layers else None
    orientations, _, _ = compute_orientation(pt, size, g_img, grad_layer)

    scale = 2 ** octave_index
    return [{
        'x': float(pt[0] * scale), 'y': float(pt[1] * scale),
        'octave_x': float(pt[0]), 'octave_y': float(pt[1]),
        'octave': int(octave_index), 'layer': int(layer),
        'scale': float(size * scale), 'octave_scale': float(size),
        'orientation': float(orient), 'response': abs(extremum),
    } for orient in orientations]


def detect_keypoints(gray, sigma=1.6, num_layers=4, k_stride=1,
                     threshold=0.02, border=5, gamma=10, octaves=3):
    """Full scale-space keypoint detection."""
    gaussian_octaves = generate_gaussian_octaves(gray, sigma, num_layers, k_stride, octaves)
    dog_octaves = [generate_dog_space(images) for images in gaussian_octaves]
    gradient_cache = build_gradient_cache(gaussian_octaves)

    keypoints = []
    candidates = []

    for octave_idx, dog_images in enumerate(dog_octaves):
        if len(dog_images) < 3:
            continue
        for layer, (img1, img2, img3) in enumerate(zip(dog_images, dog_images[1:], dog_images[2:])):
            cur_layer = layer + 1
            h, w = img2.shape
            if h <= border * 2 or w <= border * 2:
                continue
            mask = extrema_mask_3x3x3(img1, img2, img3, threshold, border)
            rows, cols = np.nonzero(mask)
            s = 2 ** octave_idx
            for x, y in zip(rows.tolist(), cols.tolist()):
                candidates.append({
                    'x': float(y * s), 'y': float(x * s),
                    'octave': int(octave_idx), 'layer': int(cur_layer),
                    'response': float(abs(img2[x, y])),
                })
                refined = refine_keypoint(
                    x, y, cur_layer, dog_images, sigma, threshold, border,
                    gaussian_octaves[octave_idx], gradient_cache[octave_idx],
                    octave_idx, gamma)
                keypoints.extend(refined)

    keypoints.sort(key=lambda p: p['response'], reverse=True)
    candidates.sort(key=lambda p: p['response'], reverse=True)
    return gaussian_octaves, dog_octaves, gradient_cache, candidates, keypoints


def trilinear_interpolation(i, j, value, orientation, cube):
    """Trilinear interpolation for descriptor building: distribute gradient
    magnitude to adjacent bins in the 4x4x8 descriptor cube."""
    i_quant, j_quant = int(np.floor(i)), int(np.floor(j))
    o_quant = int(np.floor(orientation)) % 8
    i_res, j_res = i - i_quant, j - j_quant
    o_res = (orientation - o_quant) % 8

    c0, c1 = (1.0 - i_res) * value, i_res * value
    c11, c10 = c1 * j_res, c1 * (1.0 - j_res)
    c01, c00 = c0 * j_res, c0 * (1.0 - j_res)

    for a, b, c, v in [
        (i_quant+1, j_quant+1, o_quant, c00*(1.0-o_res)),
        (i_quant+1, j_quant+1, (o_quant+1)%8, c00*o_res),
        (i_quant+1, j_quant+2, o_quant, c01*(1.0-o_res)),
        (i_quant+1, j_quant+2, (o_quant+1)%8, c01*o_res),
        (i_quant+2, j_quant+1, o_quant, c10*(1.0-o_res)),
        (i_quant+2, j_quant+1, (o_quant+1)%8, c10*o_res),
        (i_quant+2, j_quant+2, o_quant, c11*(1.0-o_res)),
        (i_quant+2, j_quant+2, (o_quant+1)%8, c11*o_res),
    ]:
        if 0 <= a < cube.shape[0] and 0 <= b < cube.shape[1]:
            cube[a, b, c] += v


def compute_descriptor(gaussian_octaves, keypoint, gradient_cache=None):
    """Compute 128-dim SIFT descriptor for a single keypoint.
    Divides 16x16 region into 4x4 subregions, each with 8-bin orientation histogram.
    Result: 4*4*8 = 128 dimensions. L2 normalized + clamped at 0.2 + renormalized."""
    octave = keypoint['octave']
    layer = min(keypoint['layer'], len(gaussian_octaves[octave]) - 1)
    g_img = gaussian_octaves[octave][layer]
    grad_layer = None
    if gradient_cache and 0 <= octave < len(gradient_cache) \
       and 0 <= layer < len(gradient_cache[octave]):
        grad_layer = gradient_cache[octave][layer]

    x, y = int(round(keypoint['octave_x'])), int(round(keypoint['octave_y']))
    size = max(float(keypoint['octave_scale']), 1.0)
    orientation = 360.0 - float(keypoint['orientation'])

    win_s = 3.0 * size
    win_l = int(round(min(np.sqrt(2.0) * win_s * 2.5,
                          np.sqrt(g_img.shape[0]**2 + g_img.shape[1]**2))))
    win_l = max(2, min(win_l, 32))

    result_cube = np.zeros((6, 6, 8), dtype=np.float32)
    sin_t, cos_t = np.sin(np.deg2rad(orientation)), np.cos(np.deg2rad(orientation))

    for i in range(-win_l, win_l + 1):
        for j in range(-win_l, win_l + 1):
            i_rot = j * sin_t + i * cos_t
            j_rot = j * cos_t - i * sin_t
            ci = (i_rot / win_s) + 1.5
            cj = (j_rot / win_s) + 1.5
            if ci <= -1 or cj <= -1 or ci >= 4 or cj >= 4:
                continue
            yi, xj = y + i, x + j
            if yi <= 0 or xj <= 0 or yi >= g_img.shape[0]-1 or xj >= g_img.shape[1]-1:
                continue
            if grad_layer is None:
                dx_p = g_img[yi, xj+1] - g_img[yi, xj-1]
                dy_p = g_img[yi-1, xj] - g_img[yi+1, xj]
                mag = np.sqrt(dx_p*dx_p + dy_p*dy_p)
                grad_orient = np.rad2deg(np.arctan2(dy_p, dx_p)) % 360.0
            else:
                mag = grad_layer['descriptor_mag'][yi, xj]
                grad_orient = grad_layer['descriptor_angle'][yi, xj]
            weight = np.exp(-0.125 * ((i_rot/win_s)**2 + (j_rot/win_s)**2))
            o_idx = (grad_orient - orientation) * 8.0 / 360.0
            trilinear_interpolation(ci, cj, weight * mag, o_idx, result_cube)

    raw = result_cube[1:-1, 1:-1, :].flatten()
    norm = float(np.sqrt(np.sum(raw * raw)))
    if norm <= 1e-12:
        return np.zeros(128, dtype=np.float32)

    before_clip = raw / norm
    clipped = np.minimum(before_clip, 0.2)
    norm2 = float(np.sqrt(np.sum(clipped * clipped)))
    final = clipped / norm2 if norm2 > 1e-12 else clipped
    return final.astype(np.float32)


def compute_descriptors(gaussian_octaves, keypoints, max_descriptors=500, gradient_cache=None):
    """Batch descriptor computation for all keypoints."""
    return [compute_descriptor(gaussian_octaves, kp, gradient_cache) for kp in keypoints[:max_descriptors]]


def sift_pipeline(img, sigma=1.6, num_layers=4, k_stride=1, threshold=0.02,
                  border=5, gamma=10, octaves=3, max_keypoints=500,
                  max_compute_side=640):
    """Complete SIFT pipeline entry point. Returns all intermediate results."""
    original = ensure_uint8(img)
    compute_img, compute_scale = limit_image_size(original, max_compute_side)
    gray_u8 = to_gray(compute_img)
    gray = gray_u8.astype(np.float32) / 255.0

    gaussian_octaves, dog_octaves, gradient_cache, candidates, keypoints = detect_keypoints(
        gray, sigma=sigma, num_layers=num_layers, k_stride=k_stride,
        threshold=threshold, border=border, gamma=gamma, octaves=octaves)

    keypoints = keypoints[:max_keypoints]
    descriptors = compute_descriptors(gaussian_octaves, keypoints, gradient_cache=gradient_cache)

    return {
        'original': original, 'compute_image': compute_img,
        'compute_scale': float(compute_scale), 'gray_u8': gray_u8, 'gray': gray,
        'gaussian_octaves': gaussian_octaves, 'dog_octaves': dog_octaves,
        'gradient_cache': gradient_cache, 'candidates': candidates,
        'keypoints': keypoints, 'descriptors': descriptors,
        'metrics': {
            'candidates': int(len(candidates)), 'keypoints': int(len(keypoints)),
            'descriptors': int(len(descriptors)), 'descriptor_length': 128 if descriptors else 0,
            'octaves': int(len(gaussian_octaves)), 'sigma': float(sigma),
            'threshold': float(threshold), 'gamma': float(gamma),
            'compute_scale': float(compute_scale),
            'compute_width': int(compute_img.shape[1]),
            'compute_height': int(compute_img.shape[0]),
        },
    }
