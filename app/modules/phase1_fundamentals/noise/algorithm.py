"""Noise model generation and visual analysis."""
import numpy as np

from app.utils.image_utils import ensure_gray, load_image_u8


def _sample_image():
    h, w = 180, 240
    yy, xx = np.mgrid[0:h, 0:w]
    base = 84 + 70 * (xx / max(w - 1, 1))
    circle = ((xx - 142) ** 2 + (yy - 92) ** 2) < 44 ** 2
    img = np.stack([base * 0.92, base * 1.02, base * 1.14], axis=-1)
    img[circle] = [210, 178, 92]
    img[42:142, 42:92] = [72, 126, 188]
    return np.round(img).clip(0, 255).astype(np.uint8)


def add_salt_pepper(img, amount=0.03, seed=7, return_mask=False):
    out = img.copy()
    h, w = img.shape[:2]
    n = max(1, int(h * w * amount))
    rng = np.random.default_rng(seed)
    ys = rng.integers(0, h, n)
    xs = rng.integers(0, w, n)
    is_salt = rng.random(n) > 0.5
    out[ys[is_salt], xs[is_salt]] = [255, 255, 255]
    out[ys[~is_salt], xs[~is_salt]] = [0, 0, 0]
    impulse_mask = np.zeros((h, w), dtype=np.uint8)
    impulse_mask[ys, xs] = 255
    if return_mask:
        return out, impulse_mask
    return out


def add_gaussian_noise(img, sigma=25, seed=11):
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, sigma, img.shape)
    noisy = np.clip(img.astype(np.float64) + noise, 0, 255).astype(np.uint8)
    return noisy, noise


def add_poisson_noise(img, peak=32, seed=13):
    rng = np.random.default_rng(seed)
    scaled = img.astype(np.float64) / 255.0 * peak
    noisy = rng.poisson(scaled) / float(peak) * 255.0
    return np.clip(noisy, 0, 255).astype(np.uint8), noisy - img.astype(np.float64)


def _noise_residual(original, noisy):
    diff = noisy.astype(np.int16) - original.astype(np.int16)
    mag = np.abs(diff).mean(axis=2) if diff.ndim == 3 else np.abs(diff)
    vis = np.clip(mag / max(float(mag.max()), 1.0) * 255.0, 0, 255).astype(np.uint8)
    return np.repeat(vis[..., None], 3, axis=2)


def _histogram_image(values, width=520, height=220, color=(59, 130, 246)):
    vals = np.asarray(values, dtype=np.float64).ravel()
    hist, edges = np.histogram(vals, bins=80)
    chart = np.full((height, width, 3), 248, dtype=np.uint8)
    chart[18:height - 30, 34:width - 14] = [242, 246, 252]
    peak = max(float(hist.max()), 1.0)
    left, right, bottom, top = 34, width - 14, height - 30, 18
    for i, v in enumerate(hist):
        x0 = left + int(i / len(hist) * (right - left))
        x1 = max(x0 + 1, left + int((i + 1) / len(hist) * (right - left)))
        bar_h = int(v / peak * (bottom - top))
        chart[bottom - bar_h:bottom, x0:x1] = color
    chart[bottom:bottom + 2, left:right] = [90, 100, 116]
    chart[top:bottom, left:left + 2] = [90, 100, 116]
    return chart


def _stats(original, noisy):
    diff = noisy.astype(np.float64) - original.astype(np.float64)
    mse = float(np.mean(diff ** 2))
    psnr = 99.0 if mse <= 1e-12 else 20.0 * np.log10(255.0 / np.sqrt(mse))
    return {
        'mean_abs_error': round(float(np.mean(np.abs(diff))), 3),
        'std_error': round(float(np.std(diff)), 3),
        'mse': round(mse, 3),
        'psnr_db': round(float(psnr), 3),
    }


def build_pipeline(upload_path=None, image_path=None):
    path = upload_path or image_path
    img = load_image_u8(path, mode='rgb', max_side=768) if path else _sample_image()
    sp, impulse_mask = add_salt_pepper(img, 0.03, return_mask=True)
    gn, gaussian_field = add_gaussian_noise(img, 25)
    pn, poisson_field = add_poisson_noise(img, 32)
    gray = ensure_gray(img)

    sp_stats = _stats(img, sp)
    gn_stats = _stats(img, gn)
    pn_stats = _stats(img, pn)
    shared = {
        'models': {
            'salt_pepper': {'amount': 0.03, **sp_stats},
            'gaussian': {'sigma': 25, **gn_stats},
            'poisson': {'peak': 32, **pn_stats},
        },
        'original': {
            'mean': round(float(gray.mean()), 3),
            'std': round(float(gray.std()), 3),
        },
    }

    return {
        'steps': [
            {
                'id': 'original',
                'name': '原图',
                'image': img,
                'explanation': '原图是干净信号，后续三个噪声模型分别模拟不同成因的随机扰动。',
                'formula': 'I(x,y)',
                'data': shared,
            },
            {
                'id': 'salt_pepper',
                'name': '椒盐噪声：随机坏点',
                'image': sp,
                'explanation': '少量像素被直接替换成纯黑或纯白，常见于传感器坏点、传输错误或二值脉冲干扰。',
                'formula': "I'(x,y)=0 or 255 with probability p",
                'data': {'model': shared['models']['salt_pepper']},
            },
            {
                'id': 'impulse_mask',
                'name': '坏点位置图',
                'image': impulse_mask,
                'explanation': '白点表示被椒盐噪声击中的位置。它是稀疏、突变、局部极端的噪声。',
                'formula': 'M(x,y) in {0,1}, P(M=1)=p',
                'data': {'model': shared['models']['salt_pepper']},
            },
            {
                'id': 'gaussian_noise',
                'name': '高斯噪声：连续抖动',
                'image': gn,
                'explanation': '每个像素都叠加一个接近正态分布的随机数，图像会出现细密颗粒。',
                'formula': "I'(x,y)=clip(I(x,y)+epsilon), epsilon~N(0,sigma^2)",
                'data': {'model': shared['models']['gaussian']},
            },
            {
                'id': 'gaussian_distribution',
                'name': '高斯误差分布',
                'image': _histogram_image(gaussian_field, color=(124, 58, 237)),
                'explanation': '误差大多集中在 0 附近，越大的正负扰动越少，形成钟形分布。',
                'formula': 'p(e)=1/(sqrt(2pi)sigma) exp(-e^2/(2sigma^2))',
                'data': {'model': shared['models']['gaussian']},
            },
            {
                'id': 'poisson_noise',
                'name': '泊松噪声：光子计数波动',
                'image': pn,
                'explanation': '亮区域接收到更多光子，波动也更大；暗区域光子少，随机性更明显。',
                'formula': "I'(x,y)~Poisson(lambda=I(x,y))",
                'data': {'model': shared['models']['poisson']},
            },
            {
                'id': 'residual_map',
                'name': '噪声残差热度',
                'image': _noise_residual(img, gn),
                'explanation': '用残差图看哪里被噪声改动得更明显。越亮表示和原图差得越多。',
                'formula': "R(x,y)=abs(I'(x,y)-I(x,y))",
                'data': {'gaussian': shared['models']['gaussian'], 'poisson': shared['models']['poisson']},
            },
        ],
        'metrics': {
            'status': 'numpy_algorithm',
            'salt_pepper_psnr_db': sp_stats['psnr_db'],
            'gaussian_psnr_db': gn_stats['psnr_db'],
            'poisson_psnr_db': pn_stats['psnr_db'],
            'recommended_filters': {
                'salt_pepper': 'median filter',
                'gaussian': 'gaussian or bilateral filter',
                'poisson': 'variance-stabilizing transform or denoising',
            },
        },
    }
