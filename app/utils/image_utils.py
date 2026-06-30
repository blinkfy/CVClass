"""
图像工具纯函数。
"""
import numpy as np
import imageio.v3 as iio
import base64
import io
import os
from PIL import Image, ImageFont
from numpy.lib.stride_tricks import sliding_window_view


def check_shape(arr, name='array', min_dim=2, max_dim=4):
    """防御性断言：确保 NumPy 数组维度在合理范围内。"""
    assert isinstance(arr, np.ndarray), f'{name} 必须是 np.ndarray，实际为 {type(arr).__name__}'
    assert min_dim <= arr.ndim <= max_dim, \
        f'{name} 维度应为 {min_dim}-{max_dim}，实际为 {arr.ndim}'
    return arr


def load_image(path, mode='rgb'):
    """
    从磁盘读取图像，统一转为 RGB 的 float32 数组 [0, 1]。
    mode: 'rgb' | 'gray'
    """
    img = iio.imread(path)
    img = np.asarray(img, dtype=np.float32) / 255.0
    check_shape(img, 'loaded image')

    if mode == 'gray' and img.ndim == 3:
        # RGB → Gray: 加权平均，符合人眼感知
        img = 0.299 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.114 * img[:, :, 2]
    elif mode == 'rgb' and img.ndim == 2:
        img = np.stack([img, img, img], axis=-1)

    return img.astype(np.float32)


def resize_max_side(arr, max_side=None):
    """最近邻缩放：限制最长边，避免教学 demo 被超大图片拖垮。"""
    arr = np.asarray(arr)
    if not max_side or arr.ndim < 2:
        return arr
    h, w = arr.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return arr
    scale = float(max_side) / float(longest)
    nh, nw = max(1, int(round(h * scale))), max(1, int(round(w * scale)))
    ys = np.linspace(0, h - 1, nh).astype(np.int32)
    xs = np.linspace(0, w - 1, nw).astype(np.int32)
    return arr[ys[:, None], xs[None, :]]


def ensure_rgb(arr, background=255):
    """任意灰度/RGB/RGBA 图像 → RGB uint8。透明像素合成到纯色背景。"""
    arr = to_uint8(arr)
    if arr.ndim == 2:
        return np.repeat(arr[..., None], 3, axis=2)
    if arr.ndim == 3 and arr.shape[2] == 1:
        return np.repeat(arr[..., :1], 3, axis=2)
    if arr.ndim == 3 and arr.shape[2] >= 4:
        rgb = arr[..., :3].astype(np.float32)
        alpha = arr[..., 3:4].astype(np.float32) / 255.0
        bg = np.full_like(rgb, float(background))
        return np.round(rgb * alpha + bg * (1.0 - alpha)).clip(0, 255).astype(np.uint8)
    if arr.ndim == 3 and arr.shape[2] >= 3:
        return arr[..., :3]
    raise ValueError(f'Unsupported image shape: {arr.shape}')


def ensure_gray(arr):
    """任意灰度/RGB/RGBA 图像 → 灰度 uint8。"""
    arr = to_uint8(arr)
    if arr.ndim == 2:
        return arr
    rgb = ensure_rgb(arr)
    weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    return np.round(np.dot(rgb, weights)).clip(0, 255).astype(np.uint8)


def load_image_u8(path, mode='rgb', max_side=None):
    """读取图片并进行前置预处理：规整通道、动态范围和可选尺寸。"""
    img = iio.imread(path)
    img = ensure_gray(img) if mode == 'gray' else ensure_rgb(img)
    return resize_max_side(img, max_side=max_side)


def save_image(arr, path):
    """将 float32 数组 [0, 1] 保存为 PNG。"""
    arr = to_uint8(arr)
    iio.imwrite(path, arr)


def to_uint8(arr):
    """任意常见图像数组 → uint8 [0, 255]，安全裁剪。"""
    arr = np.asarray(arr)
    if arr.dtype == np.uint8:
        return arr

    if arr.dtype.kind == 'b':
        return arr.astype(np.uint8) * 255

    if arr.dtype.kind in 'ui':
        info = np.iinfo(arr.dtype)
        if info.max > 255:
            return np.round(arr.astype(np.float64) / float(info.max) * 255.0).clip(0, 255).astype(np.uint8)
        return arr.clip(0, 255).astype(np.uint8)

    arr = np.asarray(arr, dtype=np.float64)
    if arr.size == 0:
        return arr.astype(np.uint8)

    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return np.zeros(arr.shape, dtype=np.uint8)

    max_val = float(finite.max())
    min_val = float(finite.min())
    if min_val >= 0.0 and max_val <= 1.0:
        arr = arr * 255.0

    return np.nan_to_num(arr, nan=0.0, posinf=255.0, neginf=0.0).round().clip(0, 255).astype(np.uint8)


def to_float32(arr):
    """任意图像数组 → float32 [0, 1]。"""
    arr = np.asarray(arr, dtype=np.float64)
    if arr.size == 0:
        return arr.astype(np.float32)
    if arr.max() > 1.0:
        arr /= 255.0
    return np.clip(arr, 0.0, 1.0).astype(np.float32)


def ensure_3channel(arr):
    """若为单通道 (H,W)，复制为三通道 (H,W,3)，方便统一渲染。"""
    return ensure_rgb(arr)


def to_base64(arr, max_side=None):
    """NumPy 图像数组 → base64 PNG 字符串（用于 API 返回）。"""
    arr = ensure_3channel(arr)
    arr_u8 = to_uint8(arr)
    img = Image.fromarray(arr_u8)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def load_chinese_font(size=18):
    """Best-effort Chinese-capable font for generated teaching cards."""
    candidates = [
        os.environ.get('CV_FONT_PATH'),
        r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\simhei.ttf',
        r'C:\Windows\Fonts\simsun.ttc',
        r'C:\Windows\Fonts\arialuni.ttf',
        r'C:\Windows\Fonts\NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf',
        '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
        '/usr/share/fonts/truetype/arphic/ukai.ttc',
    ]
    for path in candidates:
        if not path:
            continue
        try:
            if os.path.exists(path):
                return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()

# Backward compatibility for old CV module imports
def ensure_uint8(image_array):
    """Old CV compatibility: ensure array is uint8."""
    return to_uint8(image_array)


def conv2d(img, kernel, padding='edge'):
    """Pure NumPy 2D convolution/correlation."""
    arr = np.asarray(img, dtype=np.float32)
    ker = np.asarray(kernel, dtype=np.float32)
    if ker.ndim != 2:
        raise ValueError('kernel must be 2D')
    if arr.ndim == 3:
        return np.stack([conv2d(arr[..., c], ker, padding=padding) for c in range(arr.shape[2])], axis=-1)
    if arr.ndim != 2:
        raise ValueError(f'img must be 2D or 3D, got {arr.shape}')

    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    padded = np.pad(arr, ((ph, ph), (pw, pw)), mode=padding)
    windows = sliding_window_view(padded, (kh, kw))
    return np.sum(windows * ker, axis=(2, 3))


def window_mean(img, size, padding='edge'):
    """Pure NumPy local mean filter."""
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    kernel = np.ones((size, size), dtype=np.float32) / float(size * size)
    return conv2d(img, kernel, padding=padding)


def window_median(img, size, padding='edge'):
    """Pure NumPy local median filter."""
    arr = np.asarray(img)
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    if arr.ndim == 3:
        return np.stack([window_median(arr[..., c], size, padding=padding) for c in range(arr.shape[2])], axis=-1).astype(arr.dtype, copy=False)
    if arr.ndim != 2:
        raise ValueError(f'img must be 2D or 3D, got {arr.shape}')
    pad = size // 2
    padded = np.pad(arr, ((pad, pad), (pad, pad)), mode=padding)
    windows = sliding_window_view(padded, (size, size))
    return np.median(windows, axis=(2, 3)).astype(arr.dtype, copy=False)


def window_max(img, size, padding='edge'):
    """Pure NumPy local max filter."""
    arr = np.asarray(img)
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    pad = size // 2
    padded = np.pad(arr, ((pad, pad), (pad, pad)), mode=padding)
    windows = sliding_window_view(padded, (size, size))
    return windows.max(axis=(2, 3))
