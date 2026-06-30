"""
Edge detection pipeline builder.
Assembles Sobel and Canny intermediate steps for frontend rendering.
"""
import numpy as np
from app.modules.phase2_classical.edge.algorithm import (
    to_gray, gaussian_kernel, _GAUSS_K,
    sobel_gradients, nms, link_edges,
)
from app.utils.image_utils import load_image_u8


def _positive_to_uint8(arr):
    """Normalize float array to uint8 by max value."""
    arr = np.asarray(arr, dtype=np.float32)
    m = float(arr.max()) if arr.size else 0.0
    if m <= 1e-8:
        return np.zeros(arr.shape, dtype=np.uint8)
    return ((arr / m) * 255).clip(0, 255).astype(np.uint8)


def _abs_to_uint8(arr):
    """Normalize by absolute max (for signed values like Gx/Gy)."""
    return _positive_to_uint8(np.abs(arr))


def build_sobel_pipeline(image_path, threshold=80):
    """
    Sobel edge detection pipeline:
      Original -> Gray -> Gx -> Gy -> Magnitude -> Binary Result
    """
    img = load_image_u8(image_path, mode='rgb', max_side=1024)
    gray = to_gray(img)
    gx, gy, mag, _ = sobel_gradients(gray.astype(np.float32))

    steps = [
        {'id': 'original', 'image': img,
         'name': 'Original Image', 'explanation': 'The input color image.'},
        {'id': 'gray', 'image': gray,
         'name': 'Grayscale', 'explanation': 'Single-channel brightness image.'},
        {'id': 'sobel_x', 'image': _abs_to_uint8(gx),
         'name': 'Gx (Horizontal Gradient)', 'explanation': 'dI/dx. Bright areas = large horizontal change (vertical edges).'},
        {'id': 'sobel_y', 'image': _abs_to_uint8(gy),
         'name': 'Gy (Vertical Gradient)', 'explanation': 'dI/dy. Bright areas = large vertical change (horizontal edges).'},
        {'id': 'magnitude', 'image': _positive_to_uint8(mag),
         'name': 'Gradient Magnitude', 'explanation': 'sqrt(Gx^2 + Gy^2). Combined edge strength at each pixel.'},
        {'id': 'binary', 'image': np.where(_positive_to_uint8(mag) >= threshold, 255, 0).astype(np.uint8),
         'name': f'Binary Threshold (t={threshold})', 'explanation': 'Pixels with magnitude >= threshold are edges.'},
    ]

    metrics = {
        'algorithm': 'Sobel',
        'threshold': threshold,
        'gradient_max': round(float(mag.max()), 2),
        'gradient_mean': round(float(mag.mean()), 4),
    }

    return {'steps': steps, 'metrics': metrics}


def build_canny_pipeline(image_path, low=50, high=150):
    """
    Canny edge detection complete pipeline:
      Original -> Gray -> Gaussian Blur -> Gx -> Gy -> Magnitude -> NMS -> Hysteresis
    """
    img = load_image_u8(image_path, mode='rgb', max_side=1024)
    gray = to_gray(img)
    blur = to_gray(img).astype(np.float32)
    from app.modules.phase2_classical.edge.algorithm import conv2d
    blur_smooth = conv2d(blur, _GAUSS_K)
    gx, gy, mag, ang = sobel_gradients(blur_smooth)
    suppressed = nms(mag, ang)
    edges = link_edges(suppressed, low, high)

    steps = [
        {'id': 'original', 'image': img,
         'name': 'Original Image', 'explanation': 'The input color image.'},
        {'id': 'gray', 'image': gray,
         'name': 'Grayscale', 'explanation': 'Single-channel. Only brightness matters for edges.'},
        {'id': 'gaussian', 'image': np.clip(blur_smooth, 0, 255).astype(np.uint8),
         'name': 'Gaussian Blur (sigma=1.4)', 'explanation': 'Smoothing removes noise that would create false edges.'},
        {'id': 'gradient_x', 'image': _abs_to_uint8(gx),
         'name': 'Sobel Gx', 'explanation': 'Horizontal brightness change rate.'},
        {'id': 'gradient_y', 'image': _abs_to_uint8(gy),
         'name': 'Sobel Gy', 'explanation': 'Vertical brightness change rate.'},
        {'id': 'gradient_mag', 'image': _positive_to_uint8(mag),
         'name': 'Gradient Magnitude', 'explanation': 'Edge strength. At this stage edges are still thick.'},
        {'id': 'nms', 'image': _positive_to_uint8(suppressed),
         'name': 'Non-Maximum Suppression', 'explanation': 'Keep only the local maximum along gradient direction. Thins edges to 1-pixel width.'},
        {'id': 'hysteresis', 'image': edges,
         'name': f'Hysteresis Threshold (low={low}, high={high})', 'explanation': 'Strong edges (>=high) kept; weak edges kept only if connected to strong ones. Produces clean, continuous contours.'},
    ]

    metrics = {
        'algorithm': 'Canny',
        'low': low, 'high': high,
        'gaussian_sigma': 1.4,
        'edge_pixel_ratio': round(float(edges.sum() / 255 / edges.size) * 100, 2),
        'gradient_max': round(float(mag.max()), 2),
    }

    return {'steps': steps, 'metrics': metrics}
