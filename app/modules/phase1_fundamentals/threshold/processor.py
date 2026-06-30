"""Thresholding pipeline with Otsu search data and visual steps."""
import numpy as np

from app.modules.phase1_fundamentals.histogram.algorithm import compute_histogram
from app.modules.phase1_fundamentals.threshold.algorithm import (
    adaptive_mean_threshold,
    global_threshold,
    otsu_threshold,
)
from app.utils.image_utils import ensure_gray, load_image_u8


def _sample_image():
    h, w = 180, 240
    yy, xx = np.mgrid[0:h, 0:w]
    bg = 42 + 34 * (xx / max(w - 1, 1))
    obj = ((xx - 138) ** 2 / 48 ** 2 + (yy - 90) ** 2 / 54 ** 2) < 1
    img = np.stack([bg, bg + 8, bg + 16], axis=-1)
    img[obj] = [184, 198, 214]
    img[36:132, 44:92] = [96, 112, 132]
    return np.round(img).clip(0, 255).astype(np.uint8)


def _otsu_curve(hist):
    hist = np.asarray(hist, dtype=np.float64)
    total = float(hist.sum())
    if total <= 0:
        return np.zeros(256, dtype=np.float64), {
            'background_weight': 0.0,
            'foreground_weight': 0.0,
            'background_mean': 0.0,
            'foreground_mean': 0.0,
            'max_between_variance': 0.0,
        }
    bins = np.arange(256, dtype=np.float64)
    omega = np.cumsum(hist)
    mu = np.cumsum(hist * bins)
    mu_total = mu[-1]
    fg = total - omega
    valid = (omega > 0) & (fg > 0)
    score = np.zeros(256, dtype=np.float64)
    mean_bg = np.zeros(256, dtype=np.float64)
    mean_fg = np.zeros(256, dtype=np.float64)
    mean_bg[valid] = mu[valid] / omega[valid]
    mean_fg[valid] = (mu_total - mu[valid]) / fg[valid]
    score[valid] = omega[valid] * fg[valid] * (mean_bg[valid] - mean_fg[valid]) ** 2
    t = int(np.argmax(score))
    return score, {
        'background_weight': round(float(omega[t] / total), 6),
        'foreground_weight': round(float(fg[t] / total), 6),
        'background_mean': round(float(mean_bg[t]), 3),
        'foreground_mean': round(float(mean_fg[t]), 3),
        'max_between_variance': round(float(score[t]), 3),
    }


def _safe_norm(values):
    arr = np.asarray(values, dtype=np.float64)
    peak = float(arr.max()) if arr.size else 0.0
    return arr / peak if peak > 0 else arr


def _draw_histogram_with_threshold(hist, threshold, width=520, height=240):
    chart = np.full((height, width, 3), 248, dtype=np.uint8)
    chart[18:height - 32, 34:width - 14] = [242, 246, 252]
    hist_norm = _safe_norm(hist)
    left, right, bottom, top = 34, width - 14, height - 32, 18
    usable_w = right - left
    for i, v in enumerate(hist_norm):
        x0 = left + int(i / 256 * usable_w)
        x1 = max(x0 + 1, left + int((i + 1) / 256 * usable_w))
        bar_h = int(v * (bottom - top))
        chart[bottom - bar_h:bottom, x0:x1] = [59, 130, 246] if i < threshold else [147, 197, 253]
    tx = left + int(threshold / 255 * usable_w)
    chart[top:bottom, max(left, tx - 2):min(right, tx + 2)] = [239, 68, 68]
    chart[bottom:bottom + 2, left:right] = [90, 100, 116]
    chart[top:bottom, left:left + 2] = [90, 100, 116]
    return chart


def _draw_score_curve(score, threshold, width=520, height=240):
    chart = np.full((height, width, 3), 248, dtype=np.uint8)
    chart[18:height - 32, 34:width - 14] = [242, 246, 252]
    left, right, bottom, top = 34, width - 14, height - 32, 18
    values = _safe_norm(score)
    xs = np.linspace(left, right - 1, 256)
    ys = bottom - values * (bottom - top)
    for i in range(255):
        x0, y0 = int(xs[i]), int(ys[i])
        x1, y1 = int(xs[i + 1]), int(ys[i + 1])
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for t in np.linspace(0, 1, n + 1):
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            chart[max(top, y - 1):min(bottom, y + 2), max(left, x - 1):min(right, x + 2)] = [124, 58, 237]
    tx = left + int(threshold / 255 * (right - left))
    chart[top:bottom, max(left, tx - 2):min(right, tx + 2)] = [239, 68, 68]
    chart[bottom:bottom + 2, left:right] = [90, 100, 116]
    chart[top:bottom, left:left + 2] = [90, 100, 116]
    return chart


def _draw_decision_strip(threshold, width=520, height=130):
    strip = np.zeros((height, width, 3), dtype=np.uint8)
    grad = np.linspace(0, 255, width, dtype=np.uint8)
    strip[:, :, :] = grad[None, :, None]
    tx = int(threshold / 255 * (width - 1))
    strip[:, :tx, 2] = np.maximum(strip[:, :tx, 2], 110)
    strip[:, tx:, 1] = np.maximum(strip[:, tx:, 1], 180)
    strip[:, max(0, tx - 2):min(width, tx + 3)] = [239, 68, 68]
    return strip


def _overlay_mask(rgb, mask):
    out = rgb.copy().astype(np.float64)
    fg = mask > 0
    out[fg] = out[fg] * 0.55 + np.array([34, 197, 94]) * 0.45
    out[~fg] = out[~fg] * 0.55 + np.array([37, 99, 235]) * 0.22
    return np.round(out).clip(0, 255).astype(np.uint8)


def build_pipeline(image_path=None, method='otsu', threshold=128, block_size=11, C=2):
    """Build thresholding pipeline steps."""
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=1024) if image_path else _sample_image()
    gray = ensure_gray(img_u8)
    hist = compute_histogram(gray)
    otsu_t = otsu_threshold(gray)
    score, otsu_stats = _otsu_curve(hist)

    if method == 'adaptive':
        selected_t = None
        result = adaptive_mean_threshold(gray, block_size, C)
        method_label = 'adaptive'
    elif method == 'global':
        selected_t = int(np.clip(threshold, 0, 255))
        result = global_threshold(gray, selected_t)
        method_label = 'global'
    else:
        selected_t = int(otsu_t)
        result = global_threshold(gray, selected_t)
        method_label = 'otsu'

    display_t = int(selected_t if selected_t is not None else otsu_t)
    result_rgb = np.repeat(result[..., None], 3, axis=2)
    foreground_pct = round(float((result > 0).sum() / max(result.size, 1) * 100), 2)
    background_pct = round(100.0 - foreground_pct, 2)
    shared_data = {
        'histogram': hist.astype(int).tolist(),
        'otsu_scores': [round(float(v), 3) for v in score.tolist()],
        'threshold': display_t,
        'method': method_label,
        'foreground_pct': foreground_pct,
        'background_pct': background_pct,
        'otsu': otsu_stats,
    }

    steps = [
        {
            'id': 'original',
            'name': '原图',
            'image': img_u8,
            'explanation': '输入图像仍然是连续的亮度世界。阈值化要把它压成“前景/背景”两个集合。',
            'formula': 'I(x,y)=[R,G,B]',
            'data': {'threshold': display_t},
        },
        {
            'id': 'gray',
            'name': '灰度亮度图',
            'image': gray,
            'explanation': '阈值化先把颜色变成单通道亮度，之后每个像素只和阈值比较。',
            'formula': 'Y=0.299R+0.587G+0.114B',
            'data': {'threshold': display_t},
        },
        {
            'id': 'histogram',
            'name': f'亮度直方图与阈值 T={display_t}',
            'image': _draw_histogram_with_threshold(hist, display_t),
            'explanation': '红线左侧倾向背景，右侧倾向前景。Otsu 会寻找让两类分得最开的红线位置。',
            'formula': 'h(k)=sum_{x,y} [Y(x,y)=k]',
            'data': shared_data,
        },
        {
            'id': 'otsu_score',
            'name': 'Otsu 类间方差搜索',
            'image': _draw_score_curve(score, display_t),
            'explanation': '每个候选阈值都会得到一个类间方差分数。分数最高的位置就是 Otsu 自动阈值。',
            'formula': 'sigma_b^2(t)=w0(t)w1(t)(mu0(t)-mu1(t))^2',
            'data': shared_data,
        },
        {
            'id': 'decision_rule',
            'name': '二值判定规则',
            'image': _draw_decision_strip(display_t),
            'explanation': '亮度小于阈值的像素变黑，亮度大于等于阈值的像素变白。连续灰度被切成两个离散标签。',
            'formula': 'B(x,y)=255 if Y(x,y)>=T else 0',
            'data': shared_data,
        },
        {
            'id': 'result',
            'name': '二值化结果',
            'image': result_rgb,
            'explanation': '白色区域是前景，黑色区域是背景。阈值越高，留下的白色前景通常越少。',
            'formula': 'B in {0,255}',
            'data': shared_data,
        },
        {
            'id': 'overlay',
            'name': '前景覆盖检查',
            'image': _overlay_mask(img_u8, result),
            'explanation': '把二值结果叠回原图，检查阈值切出的前景是否符合图像语义。',
            'formula': 'Overlay = alpha*I + (1-alpha)*MaskColor',
            'data': shared_data,
        },
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'method': method_label,
            'threshold': display_t,
            'otsu_threshold': int(otsu_t),
            'foreground_pct': foreground_pct,
            'background_pct': background_pct,
            'background_mean': otsu_stats['background_mean'],
            'foreground_mean': otsu_stats['foreground_mean'],
            'max_between_variance': otsu_stats['max_between_variance'],
        },
    }
