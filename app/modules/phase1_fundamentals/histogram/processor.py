"""Histogram equalization pipeline with process data and chart images."""
import numpy as np

from app.modules.phase1_fundamentals.histogram.algorithm import (
    compute_histogram,
    histogram_equalization_mapping,
)
from app.utils.image_utils import ensure_gray, load_image_u8


def _sample_image():
    h, w = 180, 240
    x = np.linspace(0, 1, w, dtype=np.float64)
    y = np.linspace(0, 1, h, dtype=np.float64)[:, None]
    base = 52 + 42 * x + 28 * y
    img = np.stack([base * 0.9, base * 1.02, base * 1.12], axis=-1)
    img[36:122, 36:104] += [24, 10, 4]
    img[74:154, 122:210] -= [18, 18, 12]
    return np.round(img).clip(0, 255).astype(np.uint8)


def _safe_norm(values):
    arr = np.asarray(values, dtype=np.float64)
    peak = float(arr.max()) if arr.size else 0.0
    return arr / peak if peak > 0 else arr


def _draw_polyline(canvas, xs, ys, color):
    h, w = canvas.shape[:2]
    for i in range(len(xs) - 1):
        x0, y0 = int(xs[i]), int(ys[i])
        x1, y1 = int(xs[i + 1]), int(ys[i + 1])
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for t in np.linspace(0, 1, n + 1):
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            if 0 <= x < w and 0 <= y < h:
                canvas[max(0, y - 1):min(h, y + 2), max(0, x - 1):min(w, x + 2)] = color


def _draw_histogram_chart(hist, width=520, height=240, color=(59, 130, 246)):
    chart = np.full((height, width, 3), 248, dtype=np.uint8)
    chart[18:height - 32, 34:width - 14] = [242, 246, 252]
    hist_norm = _safe_norm(hist)
    left, right, bottom, top = 34, width - 14, height - 32, 18
    usable_w = right - left
    for i, v in enumerate(hist_norm):
        x0 = left + int(i / 256 * usable_w)
        x1 = left + int((i + 1) / 256 * usable_w)
        x1 = max(x1, x0 + 1)
        bar_h = int(v * (bottom - top))
        chart[bottom - bar_h:bottom, x0:x1] = color
    chart[bottom:bottom + 2, left:right] = [90, 100, 116]
    chart[top:bottom, left:left + 2] = [90, 100, 116]
    return chart


def _draw_cdf_chart(cdf_norm, width=520, height=240):
    chart = np.full((height, width, 3), 248, dtype=np.uint8)
    chart[18:height - 32, 34:width - 14] = [242, 246, 252]
    left, right, bottom, top = 34, width - 14, height - 32, 18
    xs = np.linspace(left, right - 1, 256)
    ys = bottom - np.asarray(cdf_norm, dtype=np.float64) * (bottom - top)
    _draw_polyline(chart, xs, ys, [34, 197, 94])
    chart[bottom:bottom + 2, left:right] = [90, 100, 116]
    chart[top:bottom, left:left + 2] = [90, 100, 116]
    return chart


def _draw_mapping_chart(mapping, width=520, height=240):
    chart = np.full((height, width, 3), 248, dtype=np.uint8)
    chart[18:height - 32, 34:width - 14] = [242, 246, 252]
    left, right, bottom, top = 34, width - 14, height - 32, 18
    xs = np.linspace(left, right - 1, 256)
    ys = bottom - np.asarray(mapping, dtype=np.float64) / 255.0 * (bottom - top)
    diag_y = np.linspace(bottom, top, 256)
    _draw_polyline(chart, xs, diag_y, [190, 198, 212])
    _draw_polyline(chart, xs, ys, [245, 158, 11])
    chart[bottom:bottom + 2, left:right] = [90, 100, 116]
    chart[top:bottom, left:left + 2] = [90, 100, 116]
    return chart


def _stats(gray, hist):
    nonzero = np.flatnonzero(hist)
    dynamic_range = int(nonzero[-1] - nonzero[0]) if nonzero.size else 0
    total = float(max(int(hist.sum()), 1))
    return {
        'mean': round(float(gray.mean()), 2),
        'std': round(float(gray.std()), 2),
        'min': int(gray.min()) if gray.size else 0,
        'max': int(gray.max()) if gray.size else 0,
        'dynamic_range': dynamic_range,
        'dark_pct': round(float(hist[:64].sum() / total * 100), 2),
        'bright_pct': round(float(hist[192:].sum() / total * 100), 2),
        'peak_bin': int(np.argmax(hist)) if len(hist) else 0,
    }


def build_pipeline(image_path=None):
    """Build histogram equalization analysis pipeline."""
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=1024) if image_path else _sample_image()
    gray = ensure_gray(img_u8)
    hist = compute_histogram(gray)
    cdf = np.cumsum(hist)
    cdf_norm = cdf / float(cdf[-1]) if cdf.size and cdf[-1] > 0 else np.zeros(256, dtype=np.float64)
    mapping = histogram_equalization_mapping(gray)
    equalized = mapping[gray]
    equalized_hist = compute_histogram(equalized)
    eq_rgb = np.repeat(equalized[..., None], 3, axis=2)

    before_stats = _stats(gray, hist)
    after_stats = _stats(equalized, equalized_hist)
    contrast_gain = round(float(after_stats['std'] / max(before_stats['std'], 1e-6)), 2)
    shared_data = {
        'histogram': hist.astype(int).tolist(),
        'cdf': [round(float(v), 6) for v in cdf_norm.tolist()],
        'mapping': mapping.astype(int).tolist(),
        'equalized_histogram': equalized_hist.astype(int).tolist(),
        'stats': {
            'before': before_stats,
            'after': after_stats,
            'contrast_gain': contrast_gain,
        },
    }

    steps = [
        {
            'id': 'original',
            'name': '原图',
            'image': img_u8,
            'explanation': '输入图像保留原始颜色与结构，后续均衡化只在亮度统计上解释。',
            'formula': 'I(x,y)=[R,G,B]',
            'data': {'stats': shared_data['stats']},
        },
        {
            'id': 'gray',
            'name': '灰度亮度图',
            'image': gray,
            'explanation': '把彩色图像压成亮度 Y，直方图均衡化通常先分析亮度分布。',
            'formula': 'Y=0.299R+0.587G+0.114B',
            'data': {'stats': before_stats},
        },
        {
            'id': 'histogram',
            'name': '原始亮度直方图',
            'image': _draw_histogram_chart(hist, color=(59, 130, 246)),
            'explanation': '横轴是 0-255 亮度，纵轴是像素数量。分布越窄，说明图像可用动态范围越少。',
            'formula': 'h(k)=sum_{x,y} [Y(x,y)=k]',
            'data': shared_data,
        },
        {
            'id': 'cdf',
            'name': '累计分布函数 CDF',
            'image': _draw_cdf_chart(cdf_norm),
            'explanation': 'CDF 表示不超过某个亮度的像素比例。均衡化把这条曲线用作亮度重映射依据。',
            'formula': 'CDF(k)=sum_{i=0}^{k} h(i) / N',
            'data': shared_data,
        },
        {
            'id': 'mapping',
            'name': '灰度映射函数',
            'image': _draw_mapping_chart(mapping),
            'explanation': '每个旧亮度 k 查表得到新亮度 T(k)。像素密集的亮度段会被拉开，对比度随之增强。',
            'formula': 'T(k)=round((CDF(k)-CDF_min)/(N-CDF_min)*255)',
            'data': shared_data,
        },
        {
            'id': 'equalized',
            'name': '均衡化结果',
            'image': eq_rgb,
            'explanation': '把映射表应用到每个像素后，暗部和亮部的可见层次通常更明显。',
            'formula': "Y'(x,y)=T(Y(x,y))",
            'data': {'stats': shared_data['stats']},
        },
        {
            'id': 'equalized_histogram',
            'name': '均衡后直方图',
            'image': _draw_histogram_chart(equalized_hist, color=(20, 184, 166)),
            'explanation': '均衡后的亮度使用范围通常更宽。它不一定完全平坦，但会更充分地占用灰度轴。',
            'formula': "h'(k)=sum_{x,y} [Y'(x,y)=k]",
            'data': shared_data,
        },
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'method': 'global_histogram_equalization',
            'peak_bin': before_stats['peak_bin'],
            'dark_pct': before_stats['dark_pct'],
            'bright_pct': before_stats['bright_pct'],
            'mean_before': before_stats['mean'],
            'std_before': before_stats['std'],
            'mean_after': after_stats['mean'],
            'std_after': after_stats['std'],
            'contrast_gain': contrast_gain,
        },
    }
