"""
Edge detection algorithms.
Pure NumPy: Sobel gradient operator and Canny multi-stage pipeline.

Canny pipeline: Grayscale -> Gaussian Blur -> Sobel Gradients -> NMS -> Hysteresis Thresholding
"""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


# ---- Pre-defined Sobel kernels ----
SOBEL_X = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
SOBEL_Y = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)


def _to_uint8(arr):
    """Safely convert array to uint8."""
    arr = np.asarray(arr)
    if arr.dtype.kind == 'f':
        if arr.size and float(arr.max()) <= 1.0:
            arr = arr * 255.0
        return np.round(arr).clip(0, 255).astype(np.uint8)
    return arr.clip(0, 255).astype(np.uint8)


def to_gray(img):
    """RGB to grayscale using human-perception weights."""
    arr = np.asarray(img)
    if arr.ndim == 2:
        return _to_uint8(arr)
    arr = _to_uint8(arr)
    weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    gray = np.round(np.dot(arr[..., :3], weights))
    return gray.astype(np.uint8)


def conv2d(img, kernel):
    """
    2D convolution using sliding_window_view.
    Uses 'edge' padding mode to reduce boundary artifacts.
    """
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    padded = np.pad(arr, ((ph, ph), (pw, pw)), mode='edge')
    windows = sliding_window_view(padded, (kh, kw))
    return np.sum(windows * ker, axis=(2, 3))


def gaussian_kernel(size=5, sigma=1.4):
    """
    Generate a 2D Gaussian kernel.
    Formula: G(x,y) = exp(-(x^2 + y^2) / (2*sigma^2)), then normalized to sum=1.
    Larger sigma = more blur.
    """
    c = size // 2
    ax = np.arange(-c, c + 1, dtype=np.float32)
    xx, yy = np.meshgrid(ax, ax)
    ker = np.exp(-(xx * xx + yy * yy) / (2.0 * sigma * sigma))
    return (ker / ker.sum()).astype(np.float32)


# Default Gaussian kernel (sigma=1.4, size=5)
_GAUSS_K = gaussian_kernel(5, 1.4)


def sobel_gradients(gray_img):
    """
    Compute Sobel gradients.
    Returns: (Gx, Gy, magnitude, angle_degrees)
    - Gx: horizontal gradient (detects vertical edges)
    - Gy: vertical gradient (detects horizontal edges)
    - magnitude: sqrt(Gx^2 + Gy^2) = edge strength
    - angle: atan2(Gy, Gx) in degrees = edge normal direction
    """
    gray = np.asarray(gray_img, dtype=np.float32)
    gx = conv2d(gray, SOBEL_X)
    gy = conv2d(gray, SOBEL_Y)
    magnitude = np.sqrt(gx * gx + gy * gy)
    angle = np.rad2deg(np.arctan2(gy, gx))
    return gx, gy, magnitude, angle


def nms(magnitude, angle):
    """
    Non-Maximum Suppression.
    For each pixel, compare its gradient magnitude with two neighbors
    along the gradient direction. Keep only the local maximum.

    This thins edges to 1-pixel width.

    Gradient directions are quantized to 4 directions:
      dir 0 (0deg, horizontal edges): compare left/right
      dir 1 (45deg, diagonal backslash): compare top-right/bottom-left
      dir 2 (90deg, vertical edges): compare top/bottom
      dir 3 (135deg, diagonal /): compare top-left/bottom-right
    """
    h, w = magnitude.shape
    out = np.zeros((h, w), dtype=np.float32)

    ang_mod = angle % 180
    dirs = np.zeros((h, w), dtype=np.uint8)
    dirs[(ang_mod < 22.5) | (ang_mod >= 157.5)] = 0
    dirs[(ang_mod >= 22.5) & (ang_mod < 67.5)] = 1
    dirs[(ang_mod >= 67.5) & (ang_mod < 112.5)] = 2
    dirs[(ang_mod >= 112.5) & (ang_mod < 157.5)] = 3

    offsets = [
        (0, (0, -1), (0, 1)),      # left / right
        (1, (-1, 1), (1, -1)),     # top-right / bottom-left
        (2, (-1, 0), (1, 0)),      # top / bottom
        (3, (-1, -1), (1, 1)),     # top-left / bottom-right
    ]

    for d, (dy1, dx1), (dy2, dx2) in offsets:
        mask = dirs[1:-1, 1:-1] == d
        center = magnitude[1:-1, 1:-1]
        n1 = magnitude[1 + dy1:h - 1 + dy1, 1 + dx1:w - 1 + dx1]
        n2 = magnitude[1 + dy2:h - 1 + dy2, 1 + dx2:w - 1 + dx2]
        keep = (center >= n1) & (center >= n2) & mask
        out[1:-1, 1:-1][keep] = center[keep]

    return out


def link_edges(suppressed, low, high):
    """
    Double threshold + edge tracking by hysteresis.
    - Pixels >= high: strong edges (definitely keep)
    - low <= pixels < high: weak edges (keep only if connected to strong edge)
    - pixels < low: suppressed

    This is what distinguishes Canny from simpler edge detectors:
    weak edges are preserved if they connect to strong ones,
    producing continuous contours without noise.
    """
    h, w = suppressed.shape
    strong = suppressed >= high
    weak = (suppressed >= low) & (suppressed < high)
    result = np.zeros((h, w), dtype=np.uint8)

    ys, xs = np.where(strong)
    stack = list(zip(ys.tolist(), xs.tolist()))
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    while stack:
        y, x = stack.pop()
        if result[y, x]:
            continue
        result[y, x] = 255
        for dy, dx in dirs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not result[ny, nx]:
                if strong[ny, nx] or weak[ny, nx]:
                    stack.append((ny, nx))

    return result


def sobel_detect(gray_img, threshold=80):
    """Complete Sobel detection: gray -> gradient -> threshold."""
    _, _, mag, _ = sobel_gradients(gray_img)
    mag_u8 = _positive_to_uint8(mag)
    return _threshold(mag_u8, threshold)


def canny_detect(img, low=50, high=150):
    """Complete Canny pipeline."""
    gray = to_gray(img)
    blur = conv2d(gray.astype(np.float32), _GAUSS_K)
    _, _, mag, ang = sobel_gradients(blur)
    suppressed = nms(mag, ang)
    return link_edges(suppressed, low, high)


# ---- Helpers ----

def _threshold(img, t):
    """Binary threshold: >= t -> 255, else 0."""
    return np.where(np.asarray(img, dtype=np.uint8) >= t, 255, 0).astype(np.uint8)


def _positive_to_uint8(arr):
    """Linear map float array to uint8 by max normalization."""
    arr = np.asarray(arr, dtype=np.float32)
    m = float(arr.max()) if arr.size else 0.0
    if m <= 1e-8:
        return np.zeros(arr.shape, dtype=np.uint8)
    return ((arr / m) * 255).clip(0, 255).astype(np.uint8)
