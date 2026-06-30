"""Live camera filter presets and server-side filter application. Pure NumPy."""
import numpy as np
from app.utils.image_utils import conv2d, load_image_u8, to_uint8

# ── Preset convolution kernels ──
PRESETS = {
    'identity': {
        'name': '原图',
        'kernel': [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
        'description': '恒等变换，图像保持不变',
    },
    'edge_detect': {
        'name': '边缘检测',
        'kernel': [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]],
        'description': '拉普拉斯核，突出所有方向的边缘',
    },
    'sharpen': {
        'name': '锐化',
        'kernel': [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
        'description': '增强局部对比度，使图像更清晰',
    },
    'gaussian_blur': {
        'name': '高斯模糊',
        'kernel': [
            [1/16, 2/16, 1/16],
            [2/16, 4/16, 2/16],
            [1/16, 2/16, 1/16],
        ],
        'description': '加权平均平滑，模拟失焦效果',
    },
    'box_blur': {
        'name': '均值模糊',
        'kernel': [[1/9]*3, [1/9]*3, [1/9]*3],
        'description': '简单算术平均，最基础的模糊',
    },
    'emboss': {
        'name': '浮雕',
        'kernel': [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]],
        'description': '产生浮雕般的立体效果',
    },
    'laplacian': {
        'name': '拉普拉斯',
        'kernel': [[0, 1, 0], [1, -4, 1], [0, 1, 0]],
        'description': '二阶导数，检测灰度突变区域',
    },
    'sobel_x': {
        'name': 'Sobel X 方向',
        'kernel': [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
        'description': '检测垂直边缘（水平梯度）',
    },
    'sobel_y': {
        'name': 'Sobel Y 方向',
        'kernel': [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
        'description': '检测水平边缘（垂直梯度）',
    },
    'motion_blur': {
        'name': '运动模糊',
        'kernel': [
            [1/5, 0, 0, 0, 0],
            [0, 1/5, 0, 0, 0],
            [0, 0, 1/5, 0, 0],
            [0, 0, 0, 1/5, 0],
            [0, 0, 0, 0, 1/5],
        ],
        'description': '对角方向模糊，模拟运动拖影',
    },
}


def get_preset_kernels():
    """Return all preset kernel definitions."""
    result = {}
    for key, info in PRESETS.items():
        result[key] = {
            'name': info['name'],
            'kernel': info['kernel'],
            'description': info['description'],
        }
    return result


def _normalize_and_clip(arr):
    """Normalize float result to uint8 [0,255]."""
    arr = np.asarray(arr, dtype=np.float64)
    if arr.size == 0:
        return arr.astype(np.uint8)
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return np.zeros(arr.shape, dtype=np.uint8)
    amin, amax = float(finite.min()), float(finite.max())
    if amin < 0 or amax > 255:
        arr = (arr - amin) / max(amax - amin, 1e-12) * 255
    return np.clip(arr, 0, 255).astype(np.uint8)


def apply_filter(image, kernel_name='edge_detect'):
    """
    Apply a preset convolution kernel to an image.

    Args:
        image: np.ndarray (H,W) grayscale or (H,W,3) RGB uint8
        kernel_name: str, key in PRESETS dict

    Returns:
        np.ndarray: filtered image in uint8
    """
    if kernel_name not in PRESETS:
        kernel_name = 'identity'

    kernel = np.array(PRESETS[kernel_name]['kernel'], dtype=np.float32)
    img_u8 = to_uint8(image)

    result = conv2d(img_u8, kernel, padding='edge')
    return _normalize_and_clip(result)


def build_pipeline(image_path=None, image=None, kernel_name='edge_detect', **_kwargs):
    """Return demo steps for the live filter endpoint without breaking apply_filter."""
    if image is None and image_path:
        image = load_image_u8(image_path, mode='rgb', max_side=384)
    if image is None:
        y, x = np.mgrid[0:128, 0:160]
        image = np.zeros((128, 160, 3), dtype=np.uint8)
        image[..., 0] = (x * 255 // 159).astype(np.uint8)
        image[..., 1] = (y * 255 // 127).astype(np.uint8)
        image[..., 2] = 120
        image[32:96, 44:116] = [230, 120, 60]

    if kernel_name not in PRESETS:
        kernel_name = 'edge_detect'
    kernel = np.array(PRESETS[kernel_name]['kernel'], dtype=np.float32)
    result = apply_filter(image, kernel_name=kernel_name)
    return {
        'steps': [
            {
                'id': 'input',
                'name': 'Input frame',
                'image': to_uint8(image),
                'explanation': 'Input image or camera frame used by the live filter.',
                'formula': 'I(x,y)',
            },
            {
                'id': 'kernel',
                'name': PRESETS[kernel_name]['name'],
                'image': _kernel_visual(kernel),
                'explanation': PRESETS[kernel_name]['description'],
                'formula': 'Y(i,j)=sum_{u,v} K(u,v) I(i+u,j+v)',
                'data': {'kernel': kernel.tolist()},
            },
            {
                'id': 'filtered',
                'name': 'Filtered frame',
                'image': result,
                'explanation': 'The selected convolution kernel is applied to every local window of the frame.',
                'formula': 'Y = I * K',
            },
        ],
        'metrics': {
            'status': 'numpy_algorithm',
            'kernel': kernel_name,
            'kernel_size': f'{kernel.shape[0]}x{kernel.shape[1]}',
        },
    }


def _kernel_visual(kernel, cell=42):
    kernel = np.asarray(kernel, dtype=np.float32)
    k = kernel.copy()
    mn, mx = float(k.min()), float(k.max())
    norm = (k - mn) / max(mx - mn, 1e-8)
    img = np.repeat(np.repeat(norm, cell, axis=0), cell, axis=1)
    rgb = np.stack([img * 255, (1.0 - np.abs(img - 0.5) * 2) * 220, (1.0 - img) * 255], axis=-1)
    out = rgb.astype(np.uint8)
    out[::cell, :] = [15, 23, 42]
    out[:, ::cell] = [15, 23, 42]
    out[-1:, :] = [15, 23, 42]
    out[:, -1:] = [15, 23, 42]
    return out
