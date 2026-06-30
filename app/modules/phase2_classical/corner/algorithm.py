"""
Harris Corner Detection algorithm.
Pure NumPy implementation.

Pipeline: Gray -> Sobel Gradients -> Structure Tensor (Ixx, Iyy, Ixy)
         -> Gaussian Weighted -> Corner Response R = det(M) - k*trace(M)^2
         -> Threshold -> NMS -> Final Corners

Key insight: In a window, if shifting in any direction causes large intensity change,
the window center is a corner point.
"""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from app.utils.image_utils import to_uint8 as _to_uint8, ensure_gray as _ensure_gray


SOBEL_X = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
SOBEL_Y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)


def ensure_uint8(img):
    """Safely convert to uint8."""
    return _to_uint8(img)


def to_gray(img):
    """RGB to grayscale (human-perception weighted)."""
    return _ensure_gray(img)


def conv2d(img, kernel):
    """2D convolution with edge-padding."""
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    ph, pw = ker.shape[0] // 2, ker.shape[1] // 2
    padded = np.pad(arr, ((ph, ph), (pw, pw)), mode='edge')
    windows = sliding_window_view(padded, ker.shape)
    return np.sum(windows * ker, axis=(2, 3))


def gaussian_kernel(size=3, sigma=2.0):
    """Generate Gaussian kernel (size forced odd)."""
    size = int(size)
    if size % 2 == 0:
        size += 1
    radius = size // 2
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    xx, yy = np.meshgrid(ax, ax)
    ker = np.exp(-(xx * xx + yy * yy) / (2.0 * sigma * sigma))
    total = float(ker.sum())
    if total <= 1e-12:
        return np.ones((size, size), dtype=np.float32) / float(size * size)
    return (ker / total).astype(np.float32)


def gaussian_blur(img, size=3, sigma=2.0):
    """Apply Gaussian blur (smooths structure tensor components)."""
    return conv2d(img, gaussian_kernel(size, sigma))


def threshold_response(response, ratio=0.01):
    """Keep pixels where response > max(response) * ratio."""
    arr = np.asarray(response, dtype=np.float32)
    max_val = float(arr.max()) if arr.size else 0.0
    th = max_val * float(ratio) if max_val > 0 else np.inf
    return arr > th, th


def nms_response(response, ratio=0.01, radius=1):
    """Non-maximum suppression: keep only local maxima within given radius."""
    arr = np.asarray(response, dtype=np.float32)
    mask, threshold = threshold_response(arr, ratio)
    if arr.size == 0 or not np.any(mask):
        return np.zeros(arr.shape, dtype=bool), threshold

    radius = max(1, int(radius))
    size = radius * 2 + 1
    padded = np.pad(arr, ((radius, radius), (radius, radius)), mode='edge')
    windows = sliding_window_view(padded, (size, size))
    local_max = windows.max(axis=(2, 3))
    return mask & (arr == local_max), threshold


def harris_pipeline(img, k=0.04, threshold_ratio=0.01, nms=True,
                    window_size=3, sigma=2.0, nms_radius=1, max_points=800):
    """
    Complete Harris corner detection pipeline.

    Parameters:
        k: Empirical constant in response formula (typically 0.04-0.06).
           R = det(M) - k * trace(M)^2
           R > 0 and large -> corner
           R < 0 -> edge
           |R| small -> flat region
        threshold_ratio: Fraction of max response to keep (0.01 = top 1%).
        nms: Whether to use non-maximum suppression.
        window_size, sigma: Gaussian smoothing parameters for structure tensor.
        nms_radius: NMS neighborhood radius.
        max_points: Maximum corner points to return (sorted by response).

    Returns:
        dict with all intermediate results for visualization.
    """
    original = ensure_uint8(img)
    gray = to_gray(original).astype(np.float32)

    # Step 1: Compute gradients
    ix = conv2d(gray, SOBEL_X)
    iy = conv2d(gray, SOBEL_Y)

    # Step 2: Structure tensor components (per-pixel)
    # M = [[Ix^2,  Ix*Iy],
    #      [Ix*Iy, Iy^2 ]]
    # Then Gaussian-smooth each component (weighted average over window)
    ixx = gaussian_blur(ix * ix, window_size, sigma)
    iyy = gaussian_blur(iy * iy, window_size, sigma)
    ixy = gaussian_blur(ix * iy, window_size, sigma)

    # Step 3: Corner response function
    # R = det(M) - k * trace(M)^2
    #   = lambda1*lambda2 - k*(lambda1+lambda2)^2
    # where lambda1, lambda2 are eigenvalues of M
    det_M = ixx * iyy - ixy * ixy
    trace_M = ixx + iyy
    response = det_M - float(k) * trace_M * trace_M

    # Step 4: Threshold + NMS
    if nms:
        corner_mask, threshold = nms_response(response, threshold_ratio, nms_radius)
    else:
        corner_mask, threshold = threshold_response(response, threshold_ratio)

    # Step 5: Sort by response, take top-k
    ys, xs = np.where(corner_mask)
    values = response[ys, xs] if ys.size else np.array([], dtype=np.float32)
    order = np.argsort(values)[::-1]
    if max_points and order.size > int(max_points):
        order = order[:int(max_points)]

    points = [
        {'x': int(xs[i]), 'y': int(ys[i]),
         'response': float(response[ys[i], xs[i]])}
        for i in order
    ]

    selected_mask = np.zeros_like(corner_mask, dtype=np.uint8)
    for pt in points:
        selected_mask[pt['y'], pt['x']] = 255

    return {
        'original': original,
        'gray': gray.astype(np.uint8),
        'ix': ix, 'iy': iy,
        'ixx': ixx, 'iyy': iyy, 'ixy': ixy,
        'response': response,
        'threshold_mask': (response > threshold) if np.isfinite(threshold) else np.zeros_like(response, dtype=bool),
        'corner_mask': corner_mask,
        'selected_mask': selected_mask,
        'points': points,
        'threshold_value': float(threshold) if np.isfinite(threshold) else 0.0,
        'metrics': {
            'count': int(len(points)),
            'max_response': float(response.max()) if response.size else 0.0,
            'threshold': float(threshold) if np.isfinite(threshold) else 0.0,
            'k': float(k),
            'threshold_ratio': float(threshold_ratio),
            'nms': bool(nms),
        },
    }
