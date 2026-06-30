"""
Harris corner detection pipeline builder + visualization helpers.
"""
import numpy as np
from app.modules.phase2_classical.corner.algorithm import harris_pipeline, ensure_uint8, to_gray
from app.utils.image_utils import load_image_u8


def _positive_to_uint8(arr):
    """Float to uint8 by max normalization."""
    arr = np.asarray(arr, dtype=np.float32)
    if arr.size == 0:
        return np.zeros(arr.shape, dtype=np.uint8)
    m = float(arr.max())
    if m <= 1e-12:
        return np.zeros(arr.shape, dtype=np.uint8)
    return np.round(arr / m * 255.0).clip(0, 255).astype(np.uint8)


def _heatmap(arr):
    """Float array to colored heatmap (blue-cyan-green-yellow-red)."""
    arr = _positive_to_uint8(arr).astype(np.float32) / 255.0
    stops = np.array([
        [31, 41, 88],     # dark blue (low)
        [30, 116, 178],   # blue
        [35, 170, 145],   # teal (mid)
        [249, 214, 79],   # yellow
        [239, 68, 68],    # red (high = strong corner)
    ], dtype=np.float32)
    pos = arr * (len(stops) - 1)
    left = np.floor(pos).astype(np.int32)
    right = np.clip(left + 1, 0, len(stops) - 1)
    frac = (pos - left)[..., None]
    return np.round(stops[left] * (1.0 - frac) + stops[right] * frac).clip(0, 255).astype(np.uint8)


def draw_points(img, points, color=(239, 68, 68), radius=3):
    """Draw corner markers (colored disks) on the image."""
    arr = ensure_uint8(img)
    canvas = np.repeat(arr[..., None], 3, axis=2) if arr.ndim == 2 else arr[..., :3].copy()
    h, w = canvas.shape[:2]
    yy, xx = np.ogrid[-radius:radius + 1, -radius:radius + 1]
    disk = xx * xx + yy * yy <= radius * radius
    rgb = np.array(color, dtype=np.uint8)
    for pt in points:
        y, x = int(round(pt['y'])), int(round(pt['x']))
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        if y0 >= y1 or x0 >= x1:
            continue
        mask = disk[y0 - (y - radius):y1 - (y - radius), x0 - (x - radius):x1 - (x - radius)]
        patch = canvas[y0:y1, x0:x1]
        patch[mask] = rgb
    return canvas


def sample_matrix(arr, max_w=96, max_h=72, signed=False):
    """Downsample matrix for frontend transmission."""
    arr = np.asarray(arr, dtype=np.float32)
    if arr.ndim == 3:
        arr = to_gray(arr).astype(np.float32)
    h, w = arr.shape[:2]
    if h == 0 or w == 0:
        return {'width': 0, 'height': 0, 'data': []}
    nh, nw = min(int(max_h), h), min(int(max_w), w)
    ys = np.linspace(0, h - 1, nh).astype(np.int32)
    xs = np.linspace(0, w - 1, nw).astype(np.int32)
    out = arr[ys[:, None], xs[None, :]].astype(np.float32)
    if signed:
        mabs = float(np.max(np.abs(out))) if out.size else 0.0
        if mabs > 1e-12:
            out = out / mabs
    else:
        mn, mx = float(out.min()), float(out.max())
        if mx - mn > 1e-12:
            out = (out - mn) / (mx - mn)
        else:
            out = np.zeros_like(out)
    return {'width': int(nw), 'height': int(nh), 'data': np.round(out, 5).tolist()}


def build_pipeline(image_path, k=0.04, threshold_ratio=0.01, nms=True,
                   window_size=3, sigma=2.0, nms_radius=1):
    """Build Harris corner detection pipeline data for frontend rendering."""
    img = load_image_u8(image_path, mode='rgb', max_side=1024)
    data = harris_pipeline(img, k=k, threshold_ratio=threshold_ratio, nms=nms,
                           window_size=window_size, sigma=sigma, nms_radius=nms_radius)

    threshold = data['threshold_value']
    threshold_img = np.where(data['response'] > threshold, 255, 0).astype(np.uint8) \
        if np.isfinite(threshold) else np.zeros_like(data['gray'], dtype=np.uint8)
    overlay = draw_points(data['original'], data['points'])

    step_images = {
        'original': data['original'],
        'gray': data['gray'].astype(np.uint8),
        'ix': _positive_to_uint8(np.abs(data['ix'])),
        'iy': _positive_to_uint8(np.abs(data['iy'])),
        'ixx': _positive_to_uint8(data['ixx']),
        'iyy': _positive_to_uint8(data['iyy']),
        'ixy': _positive_to_uint8(data['ixy']),
        'response': _heatmap(data['response']),
        'threshold': threshold_img,
        'nms': data['selected_mask'],
        'overlay': overlay,
    }

    order = ['original', 'gray', 'ix', 'iy', 'ixx', 'iyy', 'ixy',
             'response', 'threshold', 'nms', 'overlay']

    step_names = {
        'original': 'Original Image',
        'gray': 'Grayscale',
        'ix': 'Ix (Horizontal Gradient)',
        'iy': 'Iy (Vertical Gradient)',
        'ixx': 'Ixx = Ix^2 (Gaussian Smoothed)',
        'iyy': 'Iyy = Iy^2 (Gaussian Smoothed)',
        'ixy': 'Ixy = Ix*Iy (Gaussian Smoothed)',
        'response': 'Corner Response R (Heatmap)',
        'threshold': 'After Threshold',
        'nms': 'After NMS',
        'overlay': 'Final Corners Overlay',
    }

    steps = [{'id': sid, 'name': step_names.get(sid, sid), 'image': step_images[sid]} for sid in order]

    vis = {
        'gray': sample_matrix(data['gray']),
        'ix': sample_matrix(data['ix'], signed=True),
        'iy': sample_matrix(data['iy'], signed=True),
        'ix2': sample_matrix(data['ix'] * data['ix']),
        'iy2': sample_matrix(data['iy'] * data['iy']),
        'ixy': sample_matrix(data['ix'] * data['iy'], signed=True),
        'response': sample_matrix(data['response']),
        'points': data['points'][:80],
        'k': float(k),
        'threshold': float(threshold) if np.isfinite(threshold) else 0.0,
    }

    return steps, data['points'], data['metrics'], vis
