"""Build frontend-ready RGB/HSV/Lab/CMYK teaching pipeline."""
import numpy as np

from app.modules.phase1_fundamentals.colorspace.algorithm import (
    diverging_visual,
    grayscale_visual,
    hsv_to_rgb,
    ink_visual,
    rgb_channel_visual,
    rgb_to_cmyk,
    rgb_to_hsv,
    rgb_to_lab,
)
from app.utils.image_utils import load_image_u8, to_base64


def _sample_image():
    h, w = 180, 240
    x = np.linspace(0.0, 1.0, w, dtype=np.float64)
    y = np.linspace(0.0, 1.0, h, dtype=np.float64)[:, None]
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    rgb[..., 0] = np.round(x * 255.0).astype(np.uint8)
    rgb[..., 1] = np.round(y * 255.0).astype(np.uint8)
    rgb[..., 2] = np.round((1.0 - x)[None, :] * 180.0 + y * 60.0).clip(0, 255).astype(np.uint8)
    rgb[34:102, 36:108] = [235, 64, 52]
    rgb[76:150, 126:202] = [34, 197, 94]
    return rgb


def _channel(channel_id, name, meaning, value_range, formula, image, note):
    return {
        'id': channel_id,
        'name': name,
        'meaning': meaning,
        'range': value_range,
        'formula': formula,
        'image_base64': to_base64(image),
        'visualization_note': note,
    }


def build_pipeline(image_path=None):
    """Return color-space decomposition steps for one input image."""
    rgb = load_image_u8(image_path, mode='rgb', max_side=768) if image_path else _sample_image()
    hsv = rgb_to_hsv(rgb)
    lab = rgb_to_lab(rgb)
    cmyk = rgb_to_cmyk(rgb)

    hue_vis = hsv_to_rgb(np.dstack([
        hsv[..., 0],
        np.ones(hsv.shape[:2], dtype=np.float64),
        np.ones(hsv.shape[:2], dtype=np.float64),
    ]))

    steps = [
        {
            'id': 'rgb_space',
            'name': 'RGB 发光三通道',
            'image': rgb,
            'explanation': 'RGB 用红、绿、蓝三个发光强度描述颜色，是屏幕、相机和多数网页图像的默认表达。拆开通道后，越亮表示该颜色分量越强。',
            'formula': 'color = [R, G, B], R,G,B in [0,255]',
            'applications': ['屏幕显示', '相机图像', '网页图像', '逐像素通道处理'],
            'channels': [
                _channel('r', 'R 红色通道', '红光强度。值越大，该像素越偏向红色发光。', '0-255',
                         'R = image[:,:,0]', rgb_channel_visual(rgb, 0), '只保留红色分量，绿色和蓝色置零。'),
                _channel('g', 'G 绿色通道', '绿光强度。人眼对绿色亮度最敏感，很多亮度公式会给 G 更大权重。', '0-255',
                         'G = image[:,:,1]', rgb_channel_visual(rgb, 1), '只保留绿色分量，红色和蓝色置零。'),
                _channel('b', 'B 蓝色通道', '蓝光强度。天空、水面、冷色区域通常在该通道更亮。', '0-255',
                         'B = image[:,:,2]', rgb_channel_visual(rgb, 2), '只保留蓝色分量，红色和绿色置零。'),
            ],
        },
        {
            'id': 'hsv_space',
            'name': 'HSV 调色盘三维',
            'image': hue_vis,
            'explanation': 'HSV 把颜色拆成“是什么颜色”“有多纯”“有多亮”。它更接近颜色选择器和阈值分割里的直觉。',
            'formula': 'V=max(R,G,B), S=(V-min(R,G,B))/V, H from dominant channel',
            'applications': ['颜色选择器', '按色相阈值分割', '目标跟踪', '交互调色'],
            'channels': [
                _channel('h', 'H 色相', '色相表示颜色种类，在圆环上循环：0 度附近是红色，120 度附近是绿色，240 度附近是蓝色。', '0-360 deg',
                         'H = angle(max channel, R,G,B)', hue_vis, '用完整饱和度和明度重绘色相，直接看到每个像素属于哪类颜色。'),
                _channel('s', 'S 饱和度', '饱和度表示颜色纯不纯。越接近 0 越灰，越接近 1 越鲜艳。', '0-1',
                         'S = (V - min(R,G,B)) / V', grayscale_visual(hsv[..., 1], 0.0, 1.0), '灰度越亮表示颜色越鲜艳。'),
                _channel('v', 'V 明度', '明度表示像素里最强通道的亮度，决定整体看起来亮不亮。', '0-1',
                         'V = max(R,G,B)', grayscale_visual(hsv[..., 2], 0.0, 1.0), '灰度越亮表示像素整体越亮。'),
            ],
        },
        {
            'id': 'lab_space',
            'name': 'Lab 感知均匀空间',
            'image': grayscale_visual(lab[..., 0], 0.0, 100.0),
            'explanation': 'Lab 先把 RGB 变到 XYZ，再按 D65 白点归一化。L 表示亮度，a/b 表示两条对立颜色轴，颜色距离比 RGB 更接近人眼感受。',
            'formula': 'L=116f(Y/Yn)-16, a=500(f(X/Xn)-f(Y/Yn)), b=200(f(Y/Yn)-f(Z/Zn))',
            'applications': ['感知颜色距离', 'Delta E 色差', '亮度增强', '超像素/聚类', '颜色校正'],
            'channels': [
                _channel('l', 'L 亮度', '感知亮度。0 是黑，100 是白，尽量把明暗和颜色分开。', '0-100',
                         'L = 116 f(Y/Yn) - 16', grayscale_visual(lab[..., 0], 0.0, 100.0), '灰度越亮表示感知亮度越高。'),
                _channel('a', 'a 绿-红轴', 'a 小于 0 偏绿，大于 0 偏红，接近 0 表示该轴上较中性。', 'about -128 to 127',
                         'a = 500(f(X/Xn)-f(Y/Yn))', diverging_visual(lab[..., 1], [30, 160, 85], [220, 38, 38]), '绿色到红色的发散色带展示 a 轴方向。'),
                _channel('b', 'b 蓝-黄轴', 'b 小于 0 偏蓝，大于 0 偏黄，接近 0 表示该轴上较中性。', 'about -128 to 127',
                         'b = 200(f(Y/Yn)-f(Z/Zn))', diverging_visual(lab[..., 2], [37, 99, 235], [234, 179, 8]), '蓝色到黄色的发散色带展示 b 轴方向。'),
            ],
        },
        {
            'id': 'cmyk_space',
            'name': 'CMYK 印刷四色油墨',
            'image': ink_visual(cmyk[..., 3], [18, 18, 18]),
            'explanation': 'CMYK 用青、品红、黄、黑四种油墨覆盖白纸。它是减色模型：覆盖越多，反射回眼睛的光越少。',
            'formula': 'K=1-max(R,G,B), C=(1-R-K)/(1-K), M=(1-G-K)/(1-K), Y=(1-B-K)/(1-K)',
            'applications': ['印刷分色', '出版排版', '喷墨/胶印预览', '油墨覆盖分析'],
            'channels': [
                _channel('c', 'C 青色油墨', '青色油墨吸收红光。覆盖越多，红色反射越少。', '0-1',
                         'C = (1 - R - K) / (1 - K)', ink_visual(cmyk[..., 0], [0, 174, 239]), '在白纸上叠加青色油墨，越深表示覆盖越多。'),
                _channel('m', 'M 品红油墨', '品红油墨吸收绿光。覆盖越多，绿色反射越少。', '0-1',
                         'M = (1 - G - K) / (1 - K)', ink_visual(cmyk[..., 1], [236, 0, 140]), '在白纸上叠加品红油墨，越深表示覆盖越多。'),
                _channel('y', 'Y 黄色油墨', '黄色油墨吸收蓝光。覆盖越多，蓝色反射越少。', '0-1',
                         'Y = (1 - B - K) / (1 - K)', ink_visual(cmyk[..., 2], [255, 221, 0]), '在白纸上叠加黄色油墨，越深表示覆盖越多。'),
                _channel('k', 'K 黑色油墨', '黑版负责暗部和细节，减少 C/M/Y 叠印造成的脏色和用墨量。', '0-1',
                         'K = 1 - max(R,G,B)', ink_visual(cmyk[..., 3], [18, 18, 18]), '在白纸上叠加黑色油墨，越深表示黑版覆盖越多。'),
            ],
        },
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'local_algorithm',
            'backend': 'NumPy color conversion',
            'input_shape': list(rgb.shape),
            'color_spaces': 4,
            'channel_images': 13,
            'rgb_mean': [round(float(x), 2) for x in rgb.reshape(-1, 3).mean(axis=0)],
            'hue_mean_deg': round(float(hsv[..., 0].mean()), 2),
            'lab_l_mean': round(float(lab[..., 0].mean()), 2),
            'cmyk_k_mean': round(float(cmyk[..., 3].mean()), 4),
        },
    }
