"""Thresholding algorithms implemented with NumPy only."""
import numpy as np
from imageio.v3 import imread

from app.modules.phase2_classical.edge.edge import bi, to_gray
from app.utils.image_utils import to_base64, window_mean


def global_threshold(gray, threshold):
    """Binary threshold: values >= threshold become 255, otherwise 0."""
    return bi(np.asarray(gray, dtype=np.uint8), threshold)


def otsu_threshold(gray):
    """Find the Otsu threshold that maximizes between-class variance."""
    arr = np.asarray(gray, dtype=np.uint8)
    hist, _ = np.histogram(arr, bins=256, range=(0, 256))
    total = arr.size
    if total == 0:
        return 128

    sum_all = np.dot(np.arange(256), hist)
    weight_bg = 0.0
    sum_bg = 0.0
    max_var = -1.0
    best_t = 0

    for t in range(256):
        weight_bg += hist[t]
        if weight_bg == 0:
            continue
        weight_fg = total - weight_bg
        if weight_fg == 0:
            break
        sum_bg += t * hist[t]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_all - sum_bg) / weight_fg
        var_between = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
        if var_between > max_var:
            max_var = var_between
            best_t = t

    if best_t == 0:
        nonzero = np.flatnonzero(hist)
        if nonzero.size >= 2:
            best_t = int((int(nonzero[0]) + int(nonzero[-1])) // 2)
    return int(best_t)


def adaptive_mean_threshold(gray, block_size=11, C=2):
    """Adaptive threshold using a local mean window, without SciPy."""
    arr = np.asarray(gray, dtype=np.float64)
    local_mean = window_mean(arr, block_size)
    return np.where(arr >= local_mean - C, 255, 0).astype(np.uint8)


def build_pipeline(upload_path):
    img = imread(upload_path)
    if img.ndim == 3 and img.shape[2] == 4:
        img = img[:, :, :3]

    gray = to_gray(img)
    otsu_t = otsu_threshold(gray)
    steps = [
        {'id': 'original', 'name': 'Original Image', 'image': img, 'image_base64': to_base64(img)},
        {'id': 'gray', 'name': 'Grayscale', 'image': gray, 'image_base64': to_base64(gray)},
        {'id': 'thr64', 'name': 'Binary Threshold 64', 'image': global_threshold(gray, 64)},
        {'id': 'thr128', 'name': 'Binary Threshold 128', 'image': global_threshold(gray, 128)},
        {'id': 'thr192', 'name': 'Binary Threshold 192', 'image': global_threshold(gray, 192)},
        {'id': 'otsu', 'name': f'Otsu Threshold {otsu_t}', 'image': global_threshold(gray, otsu_t)},
        {'id': 'adaptive', 'name': 'Adaptive Mean Threshold', 'image': adaptive_mean_threshold(gray, 11, 2)},
    ]
    return {
        'steps': steps,
        'metrics': {
            'otsu_threshold': int(otsu_t),
            'fixed_thresholds': [64, 128, 192],
            'adaptive_block_size': 11,
            'adaptive_C': 2,
        },
    }
