"""Unified smoothing and denoising teaching pipeline."""
import math

import numpy as np
from PIL import Image, ImageDraw

from app.modules.phase1_fundamentals.convolution.algorithm import (
    bilateral_filter,
    gaussian_kernel,
)
from app.modules.phase1_fundamentals.noise.algorithm import (
    add_gaussian_noise,
    add_salt_pepper,
)
from app.utils.image_utils import conv2d, ensure_gray, load_image_u8, to_base64, window_median


def _sample_image():
    h, w = 180, 240
    yy, xx = np.mgrid[0:h, 0:w]
    base = 76 + 95 * (xx / max(w - 1, 1))
    img = np.stack([base * 0.86, base * 1.0, base * 1.18], axis=-1)
    img[28:128, 34:96] = [72, 132, 202]
    disk = (xx - 154) ** 2 + (yy - 92) ** 2 < 42 ** 2
    img[disk] = [222, 174, 82]
    stripe = np.abs((xx - yy * 0.45) % 34 - 17) < 2
    img[stripe] = np.clip(img[stripe] + 38, 0, 255)
    return np.round(img).clip(0, 255).astype(np.uint8)


def _load(path):
    return load_image_u8(path, mode='rgb', max_side=220) if path else _sample_image()


def _apply_gaussian(img, kernel):
    return np.clip(conv2d(img, kernel), 0, 255).astype(np.uint8)


def _residual(a, b):
    diff = np.abs(a.astype(np.float64) - b.astype(np.float64))
    if diff.ndim == 3:
        diff = diff.mean(axis=2)
    vis = np.clip(diff / max(float(diff.max()), 1.0) * 255.0, 0, 255).astype(np.uint8)
    return np.repeat(vis[..., None], 3, axis=2)


def _psnr(a, b):
    diff = a.astype(np.float64) - b.astype(np.float64)
    mse = float(np.mean(diff * diff))
    if mse <= 1e-12:
        return 99.0
    return float(20.0 * math.log10(255.0 / math.sqrt(mse)))


def _mae(a, b):
    return float(np.mean(np.abs(a.astype(np.float64) - b.astype(np.float64))))


def _heatmap(values, color=(59, 130, 246), size=240):
    arr = np.asarray(values, dtype=np.float64)
    h, w = arr.shape
    scale = max(1, size // max(h, w))
    out = np.full((h * scale, w * scale, 3), 248, dtype=np.uint8)
    lo, hi = float(arr.min()), float(arr.max())
    norm = (arr - lo) / max(hi - lo, 1e-12)
    for y in range(h):
        for x in range(w):
            v = float(norm[y, x])
            bg = np.array([248, 250, 252], dtype=np.float64)
            fg = np.array(color, dtype=np.float64)
            rgb = np.round(bg * (1.0 - v) + fg * v).clip(0, 255).astype(np.uint8)
            out[y * scale:(y + 1) * scale, x * scale:(x + 1) * scale] = rgb
    return out


def _matrix_visual(values, highlights=None, color=(59, 130, 246), title=None):
    arr = np.asarray(values, dtype=np.float64)
    h, w = arr.shape
    cell = 44
    top = 34 if title else 10
    img = Image.new('RGB', (w * cell + 20, h * cell + top + 10), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    if title:
        draw.text((10, 10), title, fill=(15, 23, 42))
    lo, hi = float(arr.min()), float(arr.max())
    highlights = set(highlights or [])
    for y in range(h):
        for x in range(w):
            v = (float(arr[y, x]) - lo) / max(hi - lo, 1e-12)
            fill = tuple(np.round(np.array([248, 250, 252]) * (1.0 - v) + np.array(color) * v).astype(int))
            if (y, x) in highlights:
                fill = (245, 158, 11)
            x0, y0 = 10 + x * cell, top + y * cell
            draw.rounded_rectangle((x0, y0, x0 + cell - 4, y0 + cell - 4), radius=6, fill=fill, outline=(203, 213, 225))
            draw.text((x0 + 9, y0 + 14), str(int(round(arr[y, x]))), fill=(15, 23, 42))
    return np.array(img)


def _sort_visual(window, sorted_values, median_value):
    cell = 38
    width = max(420, 20 + len(sorted_values) * cell)
    img = Image.new('RGB', (width, 250), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((16, 12), '3x3 window -> sorted values -> median', fill=(15, 23, 42))
    for y in range(3):
        for x in range(3):
            val = int(window[y, x])
            x0, y0 = 24 + x * 42, 48 + y * 42
            fill = (226, 232, 240) if val not in (0, 255) else (248, 113, 113)
            draw.rounded_rectangle((x0, y0, x0 + 34, y0 + 34), radius=6, fill=fill, outline=(148, 163, 184))
            draw.text((x0 + 7, y0 + 10), str(val), fill=(15, 23, 42))
    draw.line((164, 104, 212, 104), fill=(59, 130, 246), width=3)
    draw.polygon([(212, 104), (202, 98), (202, 110)], fill=(59, 130, 246))
    for i, val in enumerate(sorted_values):
        x0, y0 = 230 + i * cell, 84
        fill = (245, 158, 11) if int(val) == int(median_value) and i == len(sorted_values) // 2 else (219, 234, 254)
        draw.rounded_rectangle((x0, y0, x0 + 31, y0 + 31), radius=5, fill=fill, outline=(147, 197, 253))
        draw.text((x0 + 5, y0 + 9), str(int(val)), fill=(15, 23, 42))
    draw.text((230, 132), f'median = {int(median_value)} replaces center pixel', fill=(15, 23, 42))
    return np.array(img)


def _comparison_strip(original, gaussian_noisy, salt_pepper, gaussian_out, median_out, bilateral_out):
    panels = [
        ('original', original),
        ('gaussian noise', gaussian_noisy),
        ('salt pepper', salt_pepper),
        ('gaussian', gaussian_out),
        ('median', median_out),
        ('bilateral', bilateral_out),
    ]
    thumbs = []
    for _, arr in panels:
        pil = Image.fromarray(arr).resize((150, 110))
        thumbs.append(np.array(pil))
    width = 150 * len(thumbs)
    out = Image.new('RGB', (width, 144), (248, 250, 252))
    draw = ImageDraw.Draw(out)
    for idx, (label, _) in enumerate(panels):
        out.paste(Image.fromarray(thumbs[idx]), (idx * 150, 0))
        draw.text((idx * 150 + 8, 118), label, fill=(15, 23, 42))
    return np.array(out)


def _edge_metric(img):
    gray = ensure_gray(img).astype(np.float64)
    gy, gx = np.gradient(gray)
    return float(np.mean(np.sqrt(gx * gx + gy * gy)))


def _find_impulse_window(noisy_gray, mask):
    h, w = noisy_gray.shape
    ys, xs = np.where(mask > 0)
    for y, x in zip(ys, xs):
        if 1 <= y < h - 1 and 1 <= x < w - 1:
            return int(y), int(x)
    return h // 2, w // 2


def _find_edge_window(gray):
    gy, gx = np.gradient(gray.astype(np.float64))
    mag = np.sqrt(gx * gx + gy * gy)
    if gray.shape[0] > 6 and gray.shape[1] > 6:
        mag[:3, :] = 0
        mag[-3:, :] = 0
        mag[:, :3] = 0
        mag[:, -3:] = 0
    y, x = np.unravel_index(int(np.argmax(mag)), mag.shape)
    return int(y), int(x)


def _bilateral_weights(gray, y, x, d=5, sigma_color=35.0, sigma_space=2.0):
    half = d // 2
    padded = np.pad(gray.astype(np.float64), half, mode='edge')
    py, px = y + half, x + half
    patch = padded[py - half:py + half + 1, px - half:px + half + 1]
    ax = np.arange(-half, half + 1, dtype=np.float64)
    xx, yy = np.meshgrid(ax, ax)
    spatial = np.exp(-(xx * xx + yy * yy) / (2.0 * sigma_space * sigma_space))
    center = float(patch[half, half])
    range_w = np.exp(-((patch - center) ** 2) / (2.0 * sigma_color * sigma_color))
    combined = spatial * range_w
    combined /= max(float(combined.sum()), 1e-12)
    return patch, spatial, range_w, combined


def _step(step_id, name, image, explanation, formula, data=None):
    item = {
        'id': step_id,
        'name': name,
        'image_base64': to_base64(image),
        'explanation': explanation,
        'formula': formula,
    }
    if data is not None:
        item['data'] = data
    return item


def _as_list(arr, digits=4):
    return np.round(np.asarray(arr, dtype=np.float64), digits).tolist()


def build_pipeline(upload_path=None, image_path=None, requested_algorithm='smoothing', **_ignored):
    path = upload_path or image_path
    img = _load(path)
    gray = ensure_gray(img)

    gaussian_noisy, gaussian_field = add_gaussian_noise(img, sigma=22, seed=17)
    salt_pepper, impulse_mask = add_salt_pepper(img, amount=0.045, seed=19, return_mask=True)

    kernel = gaussian_kernel(5, 1.4)
    gaussian_out = _apply_gaussian(gaussian_noisy, kernel)
    gaussian_loss = _residual(img, gaussian_out)

    gy, gx = _find_edge_window(gray)
    half = 2
    padded_gray = np.pad(ensure_gray(gaussian_noisy).astype(np.float64), half, mode='edge')
    window = padded_gray[gy:gy + 5, gx:gx + 5]
    contribution = window * kernel

    median3 = window_median(salt_pepper, 3)
    median5 = window_median(salt_pepper, 5)
    noisy_gray = ensure_gray(salt_pepper)
    my, mx = _find_impulse_window(noisy_gray, impulse_mask)
    med_window = np.pad(noisy_gray, 1, mode='edge')[my:my + 3, mx:mx + 3]
    sorted_values = np.sort(med_window.ravel())
    median_value = int(sorted_values[len(sorted_values) // 2])

    gaussian_for_bilateral = _apply_gaussian(gaussian_noisy, kernel)
    bilateral_out = bilateral_filter(gaussian_noisy, d=5, sigma_color=35, sigma_space=2.0)
    by, bx = _find_edge_window(gray)
    patch, spatial_w, range_w, combined_w = _bilateral_weights(ensure_gray(gaussian_noisy), by, bx)

    gaussian_steps = [
        _step('gaussian_input_noise', '输入：连续高斯噪声', gaussian_noisy,
              '先给同一张图叠加连续的正态扰动，模拟相机传感器读数抖动。高斯平滑最适合压低这类细颗粒噪声。',
              "I_n(x,y)=clip(I(x,y)+epsilon), epsilon~N(0,sigma_n^2)",
              {'noise_sigma': 22, 'psnr_before': round(_psnr(img, gaussian_noisy), 3)}),
        _step('gaussian_kernel', '高斯核：距离越近权重越大', _heatmap(kernel, color=(59, 130, 246)),
              '5x5 高斯核按到中心的距离分配权重，中心贡献最大，越远贡献越小；所有权重归一化后总和为 1。',
              'G(x,y)=1/(2*pi*sigma^2) exp(-(x^2+y^2)/(2*sigma^2))',
              {'kernel': _as_list(kernel, 6), 'kernel_sum': round(float(kernel.sum()), 8), 'sigma': 1.4}),
        _step('gaussian_window', '局部窗口加权求和', _matrix_visual(contribution, highlights=[(2, 2)], color=(59, 130, 246), title='window value x gaussian weight'),
              '窗口覆盖中心像素周围的 25 个亮度值，每个值乘以对应高斯权重后求和，写回中心位置。',
              "I'(p)=sum_{q in Omega} G_sigma(||p-q||) I(q)",
              {'window': _as_list(window, 2), 'weighted_contribution': _as_list(contribution, 3), 'weighted_sum': round(float(contribution.sum()), 3)}),
        _step('gaussian_result', '结果：颗粒被抹平，但边缘会变软', gaussian_out,
              '高斯平滑能明显降低随机颗粒，但因为它只看空间距离，会把边缘两侧也一起平均，所以细节会变软。',
              "I'=G_sigma*I_n",
              {'psnr_after': round(_psnr(img, gaussian_out), 3), 'mae_after': round(_mae(img, gaussian_out), 3)}),
        _step('gaussian_detail_loss', '细节损失图', gaussian_loss,
              '亮处表示平滑结果与原图差异较大。边缘和纹理通常最亮，说明平滑和保细节之间存在取舍。',
              "D(x,y)=|I'(x,y)-I(x,y)|",
              {'edge_metric_original': round(_edge_metric(img), 3), 'edge_metric_filtered': round(_edge_metric(gaussian_out), 3)}),
    ]

    median_steps = [
        _step('median_input_noise', '输入：椒盐坏点', salt_pepper,
              '椒盐噪声把少量像素直接打成纯黑或纯白，它们是局部窗口里的极端值。',
              "I_n(x,y)=0 or 255 with probability p",
              {'amount': 0.045, 'psnr_before': round(_psnr(img, salt_pepper), 3), 'impulse_pixels': int(np.sum(impulse_mask > 0))}),
        _step('median_window', '3x3 窗口：抓住异常点周围邻域', _matrix_visual(med_window, highlights=[(1, 1)], color=(245, 158, 11), title='3x3 noisy window'),
              '中值滤波先取中心像素周围的局部窗口。孤立黑白坏点通常只占少数，不会代表邻域真实亮度。',
              'Omega_3(p)={I_n(q)|q around p}',
              {'window': _as_list(med_window, 0), 'center_before': int(med_window[1, 1])}),
        _step('median_sort', '排序取中位数', _sort_visual(med_window, sorted_values, median_value),
              '把窗口内 9 个数从小到大排序，选第 5 个作为输出。极端的 0 或 255 会被挤到两端。',
              "I'(p)=median(Omega(p))",
              {'sorted_values': [int(v) for v in sorted_values], 'median_index': 4, 'median_value': median_value}),
        _step('median3_result', '3x3 中值滤波结果', median3,
              '3x3 窗口通常足以去掉稀疏椒盐噪声，同时保留较多边缘和细节。',
              "I'_3(p)=median(Omega_3(p))",
              {'psnr_after': round(_psnr(img, median3), 3), 'mae_after': round(_mae(img, median3), 3)}),
        _step('median5_result', '5x5 中值滤波结果', median5,
              '5x5 窗口更强，会清除更多坏点，但小纹理和细线也更容易被抹掉。',
              "I'_5(p)=median(Omega_5(p))",
              {'psnr_after': round(_psnr(img, median5), 3), 'mae_after': round(_mae(img, median5), 3)}),
    ]

    bilateral_steps = [
        _step('bilateral_input_noise', '输入：需要保边的带噪图', gaussian_noisy,
              '双边滤波常用于有连续噪声但又希望保护轮廓的图像，例如人像边缘、物体边界和分割预处理。',
              "I_n(x,y)=I(x,y)+epsilon",
              {'noise_sigma': 22, 'psnr_before': round(_psnr(img, gaussian_noisy), 3)}),
        _step('bilateral_spatial_kernel', '空间核：离中心近才重要', _heatmap(spatial_w, color=(34, 197, 94)),
              '空间核和高斯平滑相同，只根据像素距离衰减。它保证滤波主要发生在局部邻域内。',
              "G_s(q)=exp(-||p-q||^2/(2 sigma_s^2))",
              {'spatial_weights': _as_list(spatial_w, 6), 'sigma_space': 2.0}),
        _step('bilateral_range_kernel', '颜色核：颜色相似才重要', _heatmap(range_w, color=(249, 115, 22)),
              '范围核根据中心像素和邻居像素的亮度差分配权重；跨过边缘的像素即使很近，也会因为颜色差异大而被压低。',
              "G_r(q)=exp(-||I(p)-I(q)||^2/(2 sigma_r^2))",
              {'patch': _as_list(patch, 2), 'range_weights': _as_list(range_w, 6), 'sigma_color': 35}),
        _step('bilateral_combined_weights', '组合权重：空间近 × 颜色像', _heatmap(combined_w, color=(14, 165, 233)),
              '最终权重是空间核和颜色核相乘再归一化。只有“离得近”并且“颜色像”的像素才真正参与平均。',
              "w(p,q)=G_s(||p-q||)G_r(||I(p)-I(q)||)/W_p",
              {'combined_weights': _as_list(combined_w, 8), 'weight_sum': round(float(combined_w.sum()), 8)}),
        _step('bilateral_result', '结果：平滑同质区域，尽量不跨边缘', bilateral_out,
              '双边滤波比普通高斯更能保留边界，但计算更慢，并且在强纹理区域可能把纹理也当作边缘而降低去噪强度。',
              "I'(p)=sum_q w(p,q) I_n(q)",
              {'psnr_after': round(_psnr(img, bilateral_out), 3), 'edge_metric_filtered': round(_edge_metric(bilateral_out), 3)}),
        _step('bilateral_vs_gaussian', '对照：普通高斯会更容易糊边', gaussian_for_bilateral,
              '这张普通高斯结果只看空间距离，用来和双边滤波对照：它更平滑，但边缘保护更弱。',
              "I'_g=G_s*I_n",
              {'gaussian_psnr_after': round(_psnr(img, gaussian_for_bilateral), 3), 'bilateral_psnr_after': round(_psnr(img, bilateral_out), 3)}),
    ]

    comparison = [
        {'algorithm': 'gaussian', 'name': '高斯平滑', 'best_for': '高斯噪声、轻微颗粒、Canny/SIFT 前处理', 'smooth_strength': '中到强', 'edge_preservation': '弱', 'cost': '低', 'risk': '边缘和纹理会变软'},
        {'algorithm': 'median', 'name': '中值滤波', 'best_for': '椒盐噪声、孤立坏点、扫描黑白点', 'smooth_strength': '对坏点强', 'edge_preservation': '中', 'cost': '中', 'risk': '窗口大时会吃掉细线和小纹理'},
        {'algorithm': 'bilateral', 'name': '双边滤波', 'best_for': '边缘敏感去噪、人像/物体边界、分割预处理', 'smooth_strength': '中', 'edge_preservation': '强', 'cost': '高', 'risk': '强纹理区域可能去噪不足'},
    ]

    comparison_step = _step(
        'comparison',
        '同图对比：噪声、结果和取舍',
        _comparison_strip(img, gaussian_noisy, salt_pepper, gaussian_out, median3, bilateral_out),
        '同一输入下，三种滤波器解决的问题并不相同：高斯压连续颗粒，中值排除极端坏点，双边在平滑时额外保护边缘。',
        'choose filter by noise model and edge requirement',
        {'comparison': comparison},
    )

    flat_steps = [
        _step('original', '原图：同一个输入', img, '所有滤波器从同一张图出发，便于比较它们面对不同噪声时的行为。', 'I(x,y)'),
        gaussian_steps[0],
        median_steps[0],
        gaussian_steps[1],
        gaussian_steps[2],
        gaussian_steps[3],
        median_steps[2],
        median_steps[3],
        bilateral_steps[1],
        bilateral_steps[2],
        bilateral_steps[3],
        bilateral_steps[4],
        comparison_step,
    ]

    metrics = {
        'status': 'numpy_algorithm',
        'family': 'smoothing_and_denoising',
        'requested_algorithm': requested_algorithm,
        'recommended_filters': {
            'gaussian_noise': 'gaussian or bilateral',
            'salt_pepper_noise': 'median',
            'edge_sensitive_denoising': 'bilateral',
            'fast_preprocessing': 'gaussian',
        },
        'comparison': comparison,
        'quality': {
            'gaussian_noise_psnr_before': round(_psnr(img, gaussian_noisy), 3),
            'gaussian_after_psnr': round(_psnr(img, gaussian_out), 3),
            'median_salt_pepper_psnr_before': round(_psnr(img, salt_pepper), 3),
            'median3_after_psnr': round(_psnr(img, median3), 3),
            'bilateral_after_psnr': round(_psnr(img, bilateral_out), 3),
            'original_edge_energy': round(_edge_metric(img), 3),
            'gaussian_edge_energy': round(_edge_metric(gaussian_out), 3),
            'bilateral_edge_energy': round(_edge_metric(bilateral_out), 3),
        },
    }

    return {
        'module_id': 'smoothing',
        'family_module_id': 'smoothing',
        'steps': flat_steps,
        'algorithms': {
            'gaussian': {'title': '高斯平滑', 'steps': gaussian_steps},
            'median': {'title': '中值滤波', 'steps': median_steps},
            'bilateral': {'title': '双边滤波', 'steps': bilateral_steps},
        },
        'metrics': metrics,
    }
