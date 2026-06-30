"""Sobel gradient pipeline backed by the original optimized CV implementation."""

import base64
import io

import numpy as np
from imageio.v3 import imread
from PIL import Image

from app.modules.phase2_classical.edge.edge import to_gray
from app.modules.phase2_classical.edge.edge_optimized import sobel


SOBEL_X = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
SOBEL_Y = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]


def _b64(arr):
    buf = io.BytesIO()
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(buf, 'PNG')
    return base64.b64encode(buf.getvalue()).decode()


def _normalize_mag(mag):
    mx = float(np.max(mag)) if mag.size else 0.0
    if mx <= 0:
        return np.zeros_like(mag, dtype=np.uint8)
    if mx <= 255:
        return np.clip(mag, 0, 255).astype(np.uint8)
    return np.clip(mag / mx * 255.0, 0, 255).astype(np.uint8)


def build_pipeline(upload_path):
    img = imread(upload_path)
    if img.ndim == 2:
        rgb = np.stack([img, img, img], axis=-1)
    else:
        rgb = img[:, :, :3] if img.shape[2] >= 3 else np.repeat(img[:, :, :1], 3, axis=2)

    gray = to_gray(rgb).astype(np.float32)
    sx, sy, mag, ang = sobel(gray)
    gxv = np.clip(np.abs(sx), 0, 255).astype(np.uint8)
    gyv = np.clip(np.abs(sy), 0, 255).astype(np.uint8)
    magv = _normalize_mag(mag)
    angv = np.clip((ang + 180.0) / 360.0 * 255.0, 0, 255).astype(np.uint8)

    stats = {
        'mean_abs_gx': round(float(np.mean(np.abs(sx))), 3),
        'mean_abs_gy': round(float(np.mean(np.abs(sy))), 3),
        'max_magnitude': round(float(np.max(mag)) if mag.size else 0.0, 3),
        'edge_density_gt_50': round(float(np.mean(magv > 50)), 4),
    }

    return {
        'steps': [
            {
                'id': 'original',
                'name': '原始图像',
                'image_base64': _b64(rgb),
                'explanation': '输入图像是 Sobel 计算的起点，后续先转灰度，再在亮度图上做两个方向的卷积。',
                'formula': 'I(x,y)',
                'data': {'height': int(rgb.shape[0]), 'width': int(rgb.shape[1]), 'channels': 3},
            },
            {
                'id': 'gray',
                'name': '灰度亮度图',
                'image': gray.astype(np.uint8),
                'explanation': 'Sobel 检测的是亮度变化，因此彩色图像先用标准亮度权重压成单通道。',
                'formula': 'Y=0.299R+0.587G+0.114B',
                'data': {'mean_luminance': round(float(np.mean(gray)), 3), 'std_luminance': round(float(np.std(gray)), 3)},
            },
            {
                'id': 'gx',
                'name': '水平梯度 Gx',
                'image': gxv,
                'explanation': 'Gx 用左右差分检测横向亮度变化，响应强的位置通常对应竖直边缘。',
                'formula': 'G_x=K_x*Y, K_x=[[-1,0,1],[-2,0,2],[-1,0,1]]',
                'data': {'kernel': SOBEL_X, 'mean_abs_response': stats['mean_abs_gx']},
            },
            {
                'id': 'gy',
                'name': '垂直梯度 Gy',
                'image': gyv,
                'explanation': 'Gy 用上下差分检测纵向亮度变化，响应强的位置通常对应水平边缘。',
                'formula': 'G_y=K_y*Y, K_y=[[-1,-2,-1],[0,0,0],[1,2,1]]',
                'data': {'kernel': SOBEL_Y, 'mean_abs_response': stats['mean_abs_gy']},
            },
            {
                'id': 'magnitude',
                'name': '梯度幅值',
                'image': magv,
                'explanation': '幅值把两个方向的梯度合成为总边缘强度，越亮表示局部变化越剧烈。',
                'formula': '|G|=sqrt(G_x^2+G_y^2)',
                'data': {'max_magnitude': stats['max_magnitude'], 'edge_density_gt_50': stats['edge_density_gt_50']},
            },
            {
                'id': 'angle',
                'name': '梯度方向',
                'image': angv,
                'explanation': '方向角表示亮度上升最快的方向，Canny 的非极大值抑制会沿这个方向比较邻居。',
                'formula': 'theta=atan2(G_y,G_x)',
                'data': {'encoding': 'angle -180..180 mapped to 0..255'},
            },
        ],
        'metrics': {
            'status': 'numpy_algorithm',
            'algorithm': 'Sobel gradient',
            **stats,
        },
    }
