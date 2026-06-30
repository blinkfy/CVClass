"""Shi-Tomasi corner detection — pure NumPy.

Shi-Tomasi uses R = min(λ1, λ2) as the corner response.
Eigenvalues are computed analytically from the structure tensor M:
  λ1,2 = (trace ± sqrt(trace² - 4·det)) / 2

This reuses the structure tensor computation from Harris but replaces
the response formula.
"""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.utils.image_utils import load_image_u8, ensure_gray

SOBEL_X = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
SOBEL_Y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)


def _conv2d(img, kernel):
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    ph, pw = ker.shape[0] // 2, ker.shape[1] // 2
    padded = np.pad(arr, ((ph, ph), (pw, pw)), mode='edge')
    windows = sliding_window_view(padded, ker.shape)
    return np.sum(windows * ker, axis=(2, 3))


def _gaussian_kernel(size=3, sigma=2.0):
    size = int(size)
    if size % 2 == 0:
        size += 1
    radius = size // 2
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    x, y = np.meshgrid(ax, ax)
    ker = np.exp(-(x * x + y * y) / (2.0 * sigma * sigma))
    total = float(ker.sum())
    if total <= 1e-12:
        return np.ones((size, size), dtype=np.float32) / float(size * size)
    return (ker / total).astype(np.float32)


def _gaussian_blur(img, window_size=3, sigma=2.0):
    return _conv2d(img, _gaussian_kernel(window_size, sigma))


def _nms_response(response, ratio=0.01, radius=1):
    arr = np.asarray(response, dtype=np.float32)
    max_val = float(arr.max()) if arr.size else 0.0
    threshold = max_val * float(ratio) if max_val > 0 else np.inf
    mask = arr > threshold
    if arr.size == 0 or not np.any(mask):
        return np.zeros(arr.shape, dtype=bool), threshold
    radius = max(1, int(radius))
    size = radius * 2 + 1
    padded = np.pad(arr, ((radius, radius), (radius, radius)), mode='edge')
    windows = sliding_window_view(padded, (size, size))
    local_max = windows.max(axis=(2, 3))
    return mask & (arr == local_max), threshold


def _float_to_uint8(arr):
    """Normalize float array [0,inf) to [0,255] uint8 for display."""
    a = np.asarray(arr, dtype=np.float32)
    mn, mx = float(a.min()), float(a.max())
    if mx - mn < 1e-8:
        return np.zeros(a.shape, dtype=np.uint8)
    return ((a - mn) / (mx - mn) * 255).astype(np.uint8)


def _heatmap(arr):
    """Convert float array to jet-like RGB heatmap."""
    a = np.asarray(arr, dtype=np.float32)
    mn, mx = float(a.min()), float(a.max())
    if mx - mn < 1e-8:
        norm = np.zeros_like(a)
    else:
        norm = (a - mn) / (mx - mn)
    r = np.clip((norm * 2.0 - 0.5) * 255, 0, 255).astype(np.uint8)
    g = np.clip((1.0 - np.abs(norm - 0.5) * 2.0) * 220, 0, 255).astype(np.uint8)
    b = np.clip((1.5 - norm * 2.0) * 255, 0, 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _abs_to_uint8(arr):
    """Take absolute value and normalize to uint8."""
    a = np.abs(np.asarray(arr, dtype=np.float32))
    mn, mx = float(a.min()), float(a.max())
    if mx - mn < 1e-8:
        return np.zeros(a.shape, dtype=np.uint8)
    norm = ((a - mn) / (mx - mn) * 255).astype(np.uint8)
    return norm


def _draw_points(img, points, color=(0, 255, 0), radius=3):
    """Draw corner points on image."""
    vis = np.asarray(img).copy()
    if vis.ndim == 2:
        vis = np.stack([vis] * 3, axis=-1)
    h, w = vis.shape[:2]
    for pt in points[:500]:
        y, x = pt['y'], pt['x']
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        vis[y0:y1, x0:x1] = color
    return vis


def build_pipeline(image_path=None, image=None, upload_path=None,
                   threshold_ratio=0.01, quality_level=0.01,
                   min_distance=3, window_size=3, sigma=2.0, **kwargs):
    """Shi-Tomasi corner detection pipeline.

    Parameters
    ----------
    threshold_ratio : float
        Fraction of max eigenvalue response to use as threshold (default 0.01).
    quality_level : float
        Synonym for threshold_ratio from OpenCV convention.
    min_distance : int
        NMS radius in pixels.
    window_size : int
        Gaussian blur window size for structure tensor.
    sigma : float
        Gaussian blur sigma.
    """
    # Resolve parameters
    thr_ratio = float(quality_level if quality_level != 0.01 else threshold_ratio)
    nms_radius = max(1, int(min_distance))

    # Load image
    path = image_path or upload_path
    if path:
        rgb = load_image_u8(path, mode='rgb', max_side=1024)
    elif image is not None:
        rgb = np.asarray(image)
        if rgb.ndim == 2:
            rgb = np.stack([rgb] * 3, axis=-1)
    else:
        # Generate a synthetic checkerboard fixture
        h, w = 256, 256
        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        for i in range(4):
            for j in range(4):
                y0, x0 = i * 64, j * 64
                val = 255 if (i + j) % 2 == 0 else 30
                rgb[y0:y0 + 64, x0:x0 + 64] = val

    if rgb.ndim == 3 and rgb.shape[2] == 4:
        rgb = rgb[:, :, :3]
    original = rgb.astype(np.uint8)
    gray = ensure_gray(original).astype(np.float32)

    # Compute gradients
    ix = _conv2d(gray, SOBEL_X)
    iy = _conv2d(gray, SOBEL_Y)

    # Structure tensor components (Gaussian weighted)
    ixx = _gaussian_blur(ix * ix, window_size, sigma)
    iyy = _gaussian_blur(iy * iy, window_size, sigma)
    ixy = _gaussian_blur(ix * iy, window_size, sigma)

    # Eigenvalues of structure tensor M = [[Ixx, Ixy], [Ixy, Iyy]]
    # λ = (trace ± sqrt(trace² - 4*det)) / 2
    trace = ixx + iyy
    det = ixx * iyy - ixy * ixy
    discriminant = np.sqrt(np.maximum(0, trace * trace - 4.0 * det))
    lambda1 = (trace + discriminant) / 2.0
    lambda2 = (trace - discriminant) / 2.0

    # Shi-Tomasi response: R = min(λ1, λ2)
    response = np.minimum(lambda1, lambda2)

    # NMS
    corner_mask, threshold = _nms_response(response, thr_ratio, nms_radius)

    # Extract points sorted by response
    ys, xs = np.where(corner_mask)
    values = response[ys, xs] if ys.size else np.array([], dtype=np.float32)
    order = np.argsort(values)[::-1]
    if len(order) > 800:
        order = order[:800]
    points = [
        {'x': int(xs[i]), 'y': int(ys[i]),
         'response': round(float(response[ys[i], xs[i]]), 4),
         'lambda1': round(float(lambda1[ys[i], xs[i]]), 4),
         'lambda2': round(float(lambda2[ys[i], xs[i]]), 4)}
        for i in order
    ]

    # Build visualizations
    ix_vis = _abs_to_uint8(ix)
    iy_vis = _abs_to_uint8(iy)
    ixx_vis = _heatmap(ixx)
    iyy_vis = _heatmap(iyy)
    ixy_vis = _abs_to_uint8(ixy)
    lam1_vis = _heatmap(lambda1)
    lam2_vis = _heatmap(lambda2)
    response_vis = _heatmap(response)

    # Thresholded mask visualization
    thresh_vis = (corner_mask.astype(np.uint8) * 255)
    thresh_vis = np.stack([thresh_vis] * 3, axis=-1)

    # Overlay corners
    overlay = _draw_points(original, points, color=(34, 197, 94), radius=3)

    steps = [
        {'id': 'original', 'name': '原始图像', 'image': original,
         'explanation': 'Shi-Tomasi 从原图出发，计算每个像素的结构张量。'},
        {'id': 'gray', 'name': '灰度图', 'image': np.stack([gray.astype(np.uint8)] * 3, axis=-1),
         'explanation': '将彩色转为亮度，梯度计算基于单一亮度通道。'},
        {'id': 'ix', 'name': '水平梯度 Ix', 'image': ix_vis,
         'explanation': 'Sobel 水平核卷积，亮处表示水平方向亮度变化大。'},
        {'id': 'iy', 'name': '垂直梯度 Iy', 'image': iy_vis,
         'explanation': 'Sobel 垂直核卷积，亮处表示垂直方向亮度变化大。'},
        {'id': 'ixx', 'name': 'Ixx = Gσ * Ix²', 'image': ixx_vis,
         'explanation': '高斯加权后的局部水平梯度能量。结构张量左上角元素。'},
        {'id': 'iyy', 'name': 'Iyy = Gσ * Iy²', 'image': iyy_vis,
         'explanation': '高斯加权后的局部垂直梯度能量。结构张量右下角元素。'},
        {'id': 'ixy', 'name': 'Ixy = Gσ * Ix·Iy', 'image': ixy_vis,
         'explanation': '高斯加权后的梯度协方差。结构张量非对角线元素。'},
        {'id': 'lambda1', 'name': '特征值 λ₁', 'image': lam1_vis,
         'explanation': '结构张量的第一特征值——梯度主导方向的变化强度。亮处表示至少一个方向有强梯度。'},
        {'id': 'lambda2', 'name': '特征值 λ₂', 'image': lam2_vis,
         'explanation': '结构张量的第二特征值——垂直方向的梯度强度。两个特征值都大的位置才是角点。'},
        {'id': 'response', 'name': '角点响应 R = min(λ₁,λ₂)', 'image': response_vis,
         'explanation': 'Shi-Tomasi 取两个特征值的最小值作为响应。只有两个方向梯度都强时 R 才高。这是它与 Harris 的关键区别。'},
        {'id': 'threshold', 'name': f'阈值化 (>{threshold:.4f})', 'image': thresh_vis,
         'explanation': f'响应大于 {threshold:.4f} 的像素被保留，其余归零。'},
        {'id': 'overlay', 'name': f'最终角点 ({len(points)}个)', 'image': overlay,
         'explanation': f'经 NMS 去重后保留 {len(points)} 个最强角点。绿色十字标记检测到的角点位置。'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'backend': 'NumPy',
            'algorithm': 'Shi-Tomasi',
            'response_formula': 'R = min(λ1, λ2)',
            'corner_count': len(points),
            'threshold': round(float(threshold), 6),
            'max_response': round(float(response.max()) if response.size else 0.0, 4),
            'threshold_ratio': thr_ratio,
            'min_distance': nms_radius,
            'window_size': window_size,
            'sigma': sigma,
        },
        'points': points,
    }
