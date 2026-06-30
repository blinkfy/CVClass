"""
SIFT pipeline builder + visualization helpers.
"""
import numpy as np
from app.utils.image_utils import load_image_u8
from app.modules.phase2_classical.sift.algorithm import (
    sift_pipeline, ensure_uint8, to_gray, compute_descriptor,
    compute_first_derivative, compute_second_derivative,
)


def _positive_to_uint8(arr):
    arr = np.asarray(arr, dtype=np.float32)
    if arr.size == 0:
        return np.zeros(arr.shape, dtype=np.uint8)
    mn, mx = float(arr.min()), float(arr.max())
    if mx - mn <= 1e-12:
        return np.zeros(arr.shape, dtype=np.uint8)
    return np.round((arr - mn) / (mx - mn) * 255.0).clip(0, 255).astype(np.uint8)


def _dog_to_uint8(arr):
    """DoG visualization: 0 maps to gray (127), positive->white, negative->black."""
    arr = np.asarray(arr, dtype=np.float32)
    if arr.size == 0:
        return np.zeros(arr.shape, dtype=np.uint8)
    max_abs = float(np.max(np.abs(arr)))
    if max_abs <= 1e-12:
        return np.full(arr.shape, 127, dtype=np.uint8)
    return np.round((arr / max_abs * 0.5 + 0.5) * 255.0).clip(0, 255).astype(np.uint8)


def _solve_small_system(a, b):
    """Solve a tiny dense linear system without LAPACK."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64).reshape(-1, 1)
    n = a.shape[0]
    aug = np.hstack([a, b])
    for col in range(n):
        pivot = col + int(np.argmax(np.abs(aug[col:, col])))
        if abs(float(aug[pivot, col])) < 1e-12:
            return None
        if pivot != col:
            aug[[col, pivot]] = aug[[pivot, col]]
        aug[col] = aug[col] / aug[col, col]
        for row in range(n):
            if row == col:
                continue
            aug[row] -= aug[row, col] * aug[col]
    out = aug[:, -1]
    return out if np.isfinite(out).all() else None


def _det2(a):
    a = np.asarray(a, dtype=np.float64)
    return float(a[0, 0] * a[1, 1] - a[0, 1] * a[1, 0])


def sample_matrix(arr, max_w=96, max_h=72, signed=False):
    """Downsample matrix for frontend JSON transmission."""
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


def draw_keypoints(img, keypoints, color=(20, 184, 166), max_points=300):
    """Draw keypoints on image: circles with orientation lines."""
    arr = ensure_uint8(img)
    canvas = np.repeat(arr[..., None], 3, axis=2) if arr.ndim == 2 else arr[..., :3].copy()
    h, w = canvas.shape[:2]
    rgb = np.array(color, dtype=np.uint8)
    for kp in keypoints[:max_points]:
        x, y = int(round(kp['x'])), int(round(kp['y']))
        radius = int(max(3, min(12, round(kp['scale'] * 0.8))))
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        for t in np.linspace(0, 2 * np.pi, max(16, radius * 8), endpoint=False):
            yy, xx = int(round(y + np.sin(t) * radius)), int(round(x + np.cos(t) * radius))
            if 0 <= yy < h and 0 <= xx < w:
                canvas[yy, xx] = rgb
        angle = np.deg2rad(kp['orientation'])
        x2, y2 = int(round(x + np.cos(angle) * radius)), int(round(y + np.sin(angle) * radius))
        for a in np.linspace(0, 1, radius + 1):
            xx, yy = int(round(x + (x2 - x) * a)), int(round(y + (y2 - y) * a))
            if 0 <= yy < h and 0 <= xx < w:
                canvas[yy, xx] = np.array([239, 68, 68], dtype=np.uint8)
    return canvas


def draw_points(img, points, color=(249, 115, 22), max_points=500):
    arr = ensure_uint8(img)
    canvas = np.repeat(arr[..., None], 3, axis=2) if arr.ndim == 2 else arr[..., :3].copy()
    h, w = canvas.shape[:2]
    rgb = np.array(color, dtype=np.uint8)
    for pt in points[:max_points]:
        x, y = int(round(pt['x'])), int(round(pt['y']))
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        y0, y1 = max(0, y - 2), min(h, y + 3)
        x0, x1 = max(0, x - 2), min(w, x + 3)
        canvas[y0:y1, x0:x1] = rgb
    return canvas


def sanitize_keypoints(keypoints, limit=300):
    return [{
        'x': round(float(kp['x']), 2), 'y': round(float(kp['y']), 2),
        'octave': int(kp['octave']), 'layer': int(kp['layer']),
        'scale': round(float(kp.get('scale', 0.0)), 3),
        'orientation': round(float(kp.get('orientation', 0.0)), 2),
        'response': round(float(kp['response']), 6),
    } for kp in keypoints[:limit]]


def scale_keypoints(keypoints, factor):
    if abs(factor - 1.0) <= 1e-9:
        return keypoints
    return [{**kp, 'x': float(kp['x'])*factor, 'y': float(kp['y'])*factor,
             'scale': float(kp.get('scale',0))*factor} for kp in keypoints]


def build_visualization(data, gamma=10):
    """Build detailed visualization data for the frontend."""
    gauss = data['gaussian_octaves']
    dogs = data['dog_octaves']
    keypoints = data['keypoints']
    descriptors = data['descriptors']
    grad_cache = data['gradient_cache']

    focus = keypoints[0] if keypoints else None
    fo = int(focus.get('octave', 0)) if focus else 0
    if fo < 0 or fo >= len(gauss):
        fo = 0

    vis = {
        'gray': sample_matrix(data['gray']),
        'gaussian': [sample_matrix(l) for l in (gauss[fo][:4] if gauss else [data['gray']])],
        'dog': [sample_matrix(l, signed=True) for l in (dogs[fo][:3] if dogs and fo < len(dogs) else [])],
        'focus': None, 'cube': [], 'descriptor': [],
    }

    if focus:
        octave, layer = int(focus.get('octave', 0)), int(focus.get('layer', 1))
        row, col = int(round(focus.get('octave_y', 0))), int(round(focus.get('octave_x', 0)))
        dgs = dogs[octave] if 0 <= octave < len(dogs) else []
        if dgs and 1 <= layer < len(dgs) - 1:
            h, w = dgs[layer].shape
            row, col = int(np.clip(row, 1, h-2)), int(np.clip(col, 1, w-2))
            cube = np.array([
                dgs[layer-1][row-1:row+2, col-1:col+2],
                dgs[layer][row-1:row+2, col-1:col+2],
                dgs[layer+1][row-1:row+2, col-1:col+2],
            ], dtype=np.float32)
            grad = compute_first_derivative(cube)
            hessian3 = compute_second_derivative(cube)
            solved = _solve_small_system(hessian3, grad)
            if solved is None:
                offset = np.zeros(3, dtype=np.float32)
            else:
                offset = -solved.astype(np.float32)
            xy_hess = hessian3[:2, :2]
            tr = float(xy_hess[0, 0] + xy_hess[1, 1])
            dt = _det2(xy_hess)
            ratio = float((tr*tr)/dt) if dt > 1e-12 else 0.0
            vis['cube'] = np.round(cube, 5).tolist()
            vis['taylor'] = {'offset': np.round(offset, 4).tolist(),
                             'contrast': round(float(cube[1,1,1] + 0.5*np.sum(grad * offset)), 6)}
            vis['hessian'] = {'matrix': np.round(xy_hess, 5).tolist(), 'ratio': round(ratio, 4),
                              'limit': round(float(((gamma+1.0)**2)/gamma), 4),
                              'keep': bool(dt > 1e-12 and ratio < ((gamma+1.0)**2)/gamma)}

        if 0 <= octave < len(gauss):
            vis['focus'] = {
                'x': round(float(focus.get('x',0)), 2), 'y': round(float(focus.get('y',0)), 2),
                'octave_x': round(float(focus.get('octave_x',0)), 2),
                'octave_y': round(float(focus.get('octave_y',0)), 2),
                'octave': int(focus.get('octave',0)), 'layer': int(focus.get('layer',0)),
                'scale': round(float(focus.get('scale',0)), 3),
                'orientation': round(float(focus.get('orientation',0)), 2),
                'response': round(float(focus.get('response',0)), 6),
            }

    if focus and 0 <= int(focus.get('octave', 0)) < len(gauss):
        desc = compute_descriptor(gauss, focus, grad_cache)
        vis['descriptor'] = np.round(desc, 5).tolist()
    elif descriptors:
        vis['descriptor'] = np.round(np.asarray(descriptors[0], dtype=np.float32), 5).tolist()

    return vis


def build_pipeline(image_path, sigma=1.6, num_layers=4, k_stride=1,
                   threshold=0.02, border=5, gamma=10, octaves=3):
    """Build SIFT pipeline data for frontend rendering."""
    img = load_image_u8(image_path, mode='rgb', max_side=360)
    data = sift_pipeline(img, sigma=sigma, num_layers=num_layers, k_stride=k_stride,
                         threshold=threshold, border=border, gamma=gamma, octaves=octaves)

    original = data['original']
    g_preview = data['gaussian_octaves'][0][min(1, len(data['gaussian_octaves'][0])-1)] \
        if data['gaussian_octaves'] else data['gray']
    d_preview = data['dog_octaves'][0][min(1, len(data['dog_octaves'][0])-1)] \
        if data['dog_octaves'] and data['dog_octaves'][0] else data['gray'] * 0.0

    df = 1.0 / data['compute_scale']
    disp_kp = scale_keypoints(data['keypoints'], df)
    disp_cand = scale_keypoints(data['candidates'], df)

    order = ['original', 'gray', 'gaussian', 'dog', 'candidates', 'keypoints', 'final']
    step_images = {
        'original': original, 'gray': data['gray_u8'],
        'gaussian': _positive_to_uint8(g_preview),
        'dog': _dog_to_uint8(d_preview),
        'candidates': draw_points(original, disp_cand),
        'keypoints': draw_keypoints(original, disp_kp),
        'final': draw_keypoints(original, disp_kp),
    }
    step_names = {
        'original': 'Original Image', 'gray': 'Grayscale',
        'gaussian': 'Gaussian Blur (sigma=1.6)', 'dog': 'DoG (Difference of Gaussian)',
        'candidates': 'Extrema Candidates', 'keypoints': 'Refined Keypoints',
        'final': 'Final SIFT Keypoints',
    }

    steps = [{'id': sid, 'name': step_names.get(sid, sid), 'image': step_images[sid]} for sid in order]
    vis = build_visualization(data, gamma)

    return steps, sanitize_keypoints(disp_kp, 500), sanitize_keypoints(disp_cand, 500), data['metrics'], vis
