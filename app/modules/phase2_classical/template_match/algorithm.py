"""Template matching pipeline with bounded-memory NCC.

The previous teaching implementation expanded every image patch at full
resolution, which could allocate enormous arrays for the built-in sample image.
This keeps the same normalized cross-correlation algorithm while computing the
response map in row blocks.
"""

import io
import base64

import numpy as np
from imageio.v3 import imread
from PIL import Image, ImageDraw
from numpy.lib.stride_tricks import sliding_window_view

from app.utils.image_utils import ensure_rgb, ensure_gray, resize_max_side, to_uint8


def _b64(arr):
    buf = io.BytesIO()
    Image.fromarray(to_uint8(ensure_rgb(arr))).save(buf, 'PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def _normalize01(arr):
    arr = np.asarray(arr, dtype=np.float32)
    lo = float(np.min(arr))
    hi = float(np.max(arr))
    return (arr - lo) / max(hi - lo, 1e-8)


def _ncc_match_blocked(gray, template, block_rows=20):
    """Zero-mean normalized cross-correlation computed in row blocks."""
    gray = np.asarray(gray, dtype=np.float32)
    template = np.asarray(template, dtype=np.float32)
    h, w = gray.shape
    th, tw = template.shape
    out_h, out_w = h - th + 1, w - tw + 1
    if out_h <= 0 or out_w <= 0:
        raise ValueError('Template is larger than the image after resizing.')

    t = template.reshape(-1)
    t = t - float(t.mean())
    t_norm = float(np.linalg.norm(t)) or 1e-8
    t = t / t_norm

    response = np.empty((out_h, out_w), dtype=np.float32)
    for y0 in range(0, out_h, block_rows):
        y1 = min(out_h, y0 + block_rows)
        # Include the template height so windows ending in this block are valid.
        stripe = gray[y0:y1 + th - 1, :]
        windows = sliding_window_view(stripe, (th, tw))
        windows = windows[:y1 - y0, :, :, :]
        flat = windows.reshape((y1 - y0) * out_w, th * tw).astype(np.float32)
        flat -= flat.mean(axis=1, keepdims=True)
        norms = np.linalg.norm(flat, axis=1, keepdims=True)
        flat /= np.maximum(norms, 1e-8)
        response[y0:y1, :] = (flat @ t).reshape(y1 - y0, out_w)
    return response


def _heatmap(response):
    n = _normalize01(response)
    r = (n * 255).astype(np.uint8)
    g = ((1.0 - np.abs(n - 0.5) * 2.0) * 220).astype(np.uint8)
    b = ((1.0 - n) * 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _draw_box(rgb, box, color=(34, 197, 94), width=3):
    img = Image.fromarray(ensure_rgb(rgb).copy())
    draw = ImageDraw.Draw(img)
    x1, y1, x2, y2 = box
    for i in range(width):
        draw.rectangle([x1 - i, y1 - i, x2 + i, y2 + i], outline=color)
    return np.array(img)


def _choose_template(gray, ratio):
    h, w = gray.shape
    ratio = min(max(float(ratio), 0.08), 0.45)
    ts = int(round(min(h, w) * ratio))
    ts = max(24, min(ts, min(h, w) - 2))
    if ts % 2:
        ts += 1
    cy, cx = h // 2, w // 2
    y1 = max(0, min(h - ts, cy - ts // 2))
    x1 = max(0, min(w - ts, cx - ts // 2))
    return gray[y1:y1 + ts, x1:x1 + ts], (x1, y1, x1 + ts, y1 + ts)


def build_pipeline(upload_path=None, image_path=None, tmpl_ratio=0.25, threshold=0.6, **kwargs):
    path = upload_path or image_path
    if not path:
        raise FileNotFoundError('Template matching requires an input image.')

    rgb_full = imread(path)
    rgb = resize_max_side(ensure_rgb(rgb_full), max_side=320)
    gray = ensure_gray(rgb)
    template, template_box = _choose_template(gray, tmpl_ratio)
    response = _ncc_match_blocked(gray, template)
    best_y, best_x = np.unravel_index(int(np.argmax(response)), response.shape)
    th, tw = template.shape
    best_score = float(response[best_y, best_x])
    result = _draw_box(rgb, (best_x, best_y, best_x + tw, best_y + th))
    template_source = _draw_box(rgb, template_box, color=(59, 130, 246), width=2)

    response_vis = _heatmap(response)
    # Resize the response heatmap to match the input preview width for readability.
    response_img = Image.fromarray(response_vis).resize((rgb.shape[1], rgb.shape[0]), Image.Resampling.BILINEAR)

    return {
        'steps': [
            {
                'id': 'original',
                'name': '输入图像',
                'image_base64': _b64(rgb),
                'explanation': '将输入图像缩放到教学可视化尺寸，避免无意义的大规模滑窗拖慢页面。',
                'formula': 'I(x,y)',
            },
            {
                'id': 'template',
                'name': f'中心模板 ({tw}x{th})',
                'image_base64': _b64(template_source),
                'explanation': '从图像中心截取模板。蓝框标出模板来源区域，后续会让它在整张图上滑动。',
                'formula': 'T(u,v)=I(x_0+u,y_0+v)',
            },
            {
                'id': 'ncc',
                'name': 'NCC 响应图',
                'image_base64': _b64(np.array(response_img)),
                'explanation': '每个位置都计算零均值归一化互相关；越亮表示该窗口和模板越相似。',
                'formula': 'NCC(x,y)=<W_xy-mean(W_xy),T-mean(T)>/(||W_xy-mean(W_xy)|| ||T-mean(T)||)',
                'data': {
                    'response_shape': list(response.shape),
                    'best_score': round(best_score, 4),
                    'threshold': float(threshold),
                },
            },
            {
                'id': 'result',
                'name': '最佳匹配位置',
                'image_base64': _b64(result),
                'explanation': f'绿色框是 NCC 最大的位置，得分 {best_score:.3f}。教学实现使用分块计算，算法结果仍来自真实 NCC 响应。',
                'formula': '(x*,y*)=argmax_{x,y} NCC(x,y)',
            },
        ],
        'metrics': {
            'status': 'numpy_algorithm',
            'algorithm': 'blocked_ncc_template_matching',
            'image_size': f'{rgb.shape[1]}x{rgb.shape[0]}',
            'template_size': f'{tw}x{th}',
            'best_score': round(best_score, 4),
            'above_threshold': bool(best_score >= float(threshold)),
        },
    }
