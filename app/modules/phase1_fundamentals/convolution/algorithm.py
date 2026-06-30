"""Convolution demos and small NumPy-only filters."""
import numpy as np
from imageio.v3 import imread

from app.utils.image_utils import conv2d, ensure_gray, to_uint8, window_median


def gaussian_kernel(size=5, sigma=1.0):
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    radius = size // 2
    ax = np.arange(-radius, radius + 1, dtype=np.float32)
    xx, yy = np.meshgrid(ax, ax)
    k = np.exp(-(xx * xx + yy * yy) / (2.0 * float(sigma) * float(sigma)))
    return (k / max(float(k.sum()), 1e-12)).astype(np.float32)


def sobel_x():
    return np.array([[1, 0, -1], [2, 0, -2], [1, 0, -1]], dtype=np.float32)


def sobel_y():
    return np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float32)


def median_filter(img, size=3):
    return window_median(to_uint8(img), size)


def bilateral_filter(img, d=9, sigma_color=75, sigma_space=75):
    """Small educational bilateral filter. Handles gray and RGB images."""
    src = to_uint8(img)
    src_f = src.astype(np.float64)
    is_color = src_f.ndim == 3
    half = max(1, int(d) // 2)
    d = half * 2 + 1
    ax = np.arange(-half, half + 1, dtype=np.float64)
    xx, yy = np.meshgrid(ax, ax)
    spatial_k = np.exp(-(xx * xx + yy * yy) / (2.0 * float(sigma_space) ** 2))

    if not is_color:
        work = src_f[..., None]
    else:
        work = src_f

    h, w, c = work.shape
    out = work.copy()
    padded = np.pad(work, ((half, half), (half, half), (0, 0)), mode='edge')
    for y in range(h):
        for x in range(w):
            patch = padded[y:y + d, x:x + d]
            center = padded[y + half, x + half]
            color_dist = np.sum((patch - center) ** 2, axis=2)
            range_k = np.exp(-color_dist / (2.0 * float(sigma_color) ** 2))
            weights = spatial_k * range_k
            denom = max(float(weights.sum()), 1e-12)
            out[y, x] = np.sum(patch * weights[..., None], axis=(0, 1)) / denom

    out = np.clip(out, 0, 255).astype(np.uint8)
    return out if is_color else out[..., 0]


def _apply_kernel(img, kernel):
    return np.clip(conv2d(img, kernel), 0, 255).astype(np.uint8)


def build_conv_demo(upload_path):
    img = imread(upload_path)
    if img.ndim == 3 and img.shape[2] == 4:
        img = img[:, :, :3]
    img = to_uint8(img)

    box_k = np.ones((5, 5), dtype=np.float32) / 25.0
    gauss_k = gaussian_kernel(5, 1.5)
    gray = ensure_gray(img).astype(np.float32)
    sx = conv2d(gray, sobel_x())
    sy = conv2d(gray, sobel_y())
    mag = np.sqrt(sx * sx + sy * sy)
    mag = np.clip(mag / max(float(mag.max()), 1e-12) * 255.0, 0, 255).astype(np.uint8)
    sharpen_k = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)

    return {
        'steps': [
            {'id': 'identity', 'name': 'Identity Kernel', 'image': img},
            {'id': 'box_blur', 'name': 'Box Blur (5x5)', 'image': _apply_kernel(img, box_k)},
            {'id': 'gaussian', 'name': 'Gaussian Blur (sigma=1.5)', 'image': _apply_kernel(img, gauss_k)},
            {'id': 'sobel', 'name': 'Sobel Gradient Magnitude', 'image': mag},
            {'id': 'sharpen', 'name': 'Sharpen Kernel', 'image': _apply_kernel(img, sharpen_k)},
        ],
        'metrics': {
            'kernel_examples': 5,
            'implementation': 'pure_numpy_2d_convolution',
        },
    }
