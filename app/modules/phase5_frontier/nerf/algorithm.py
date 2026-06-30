"""Tiny NeRF-style volume rendering with real NumPy ray marching."""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw


def _camera_pose(azimuth_deg, radius=3.2):
    theta = np.deg2rad(float(azimuth_deg))
    origin = np.array([np.sin(theta) * radius, 0.35, np.cos(theta) * radius], dtype=np.float64)
    target = np.array([0.0, 0.0, 0.0], dtype=np.float64)
    forward = target - origin
    forward /= np.linalg.norm(forward) + 1e-8
    world_up = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    right = np.cross(forward, world_up)
    right /= np.linalg.norm(right) + 1e-8
    up = np.cross(right, forward)
    return origin, right, up, forward


def _generate_rays(azimuth, h=96, w=96, fov_deg=45.0):
    origin, right, up, forward = _camera_pose(azimuth)
    focal = 0.5 * w / np.tan(0.5 * np.deg2rad(fov_deg))
    yy, xx = np.mgrid[0:h, 0:w]
    px = (xx - w * 0.5) / focal
    py = -(yy - h * 0.5) / focal
    dirs = forward[None, None, :] + px[..., None] * right[None, None, :] + py[..., None] * up[None, None, :]
    dirs = dirs / (np.linalg.norm(dirs, axis=-1, keepdims=True) + 1e-8)
    origins = np.broadcast_to(origin, dirs.shape).copy()
    return origins, dirs


def _sample_points(rays_o, rays_d, near=1.2, far=5.2, samples=80):
    t = np.linspace(near, far, samples, dtype=np.float64)
    pts = rays_o[..., None, :] + rays_d[..., None, :] * t[None, None, :, None]
    return pts, t


def _radiance_field(points):
    p = np.asarray(points, dtype=np.float64)
    r1 = np.linalg.norm(p - np.array([0.0, 0.0, 0.0]), axis=-1)
    r2 = np.linalg.norm(p - np.array([0.65, 0.22, -0.35]), axis=-1)
    sigma = 22.0 * np.exp(-((r1 - 0.82) ** 2) / 0.025) + 14.0 * np.exp(-(r2 ** 2) / 0.12)
    sigma += 0.45 * np.exp(-((p[..., 1] + 0.95) ** 2) / 0.015)
    color = np.empty(p.shape, dtype=np.float64)
    color[..., 0] = 0.45 + 0.45 * np.sin(2.2 * p[..., 0] + 0.6)
    color[..., 1] = 0.48 + 0.42 * np.sin(2.0 * p[..., 1] + 1.5)
    color[..., 2] = 0.50 + 0.40 * np.cos(2.1 * p[..., 2] - 0.3)
    return np.clip(color, 0.0, 1.0), sigma


def _volume_render(rgb, sigma, depths):
    delta = np.concatenate([np.diff(depths), np.array([1e3])])
    alpha = 1.0 - np.exp(-sigma * delta[None, None, :])
    trans = np.cumprod(1.0 - alpha + 1e-10, axis=2)
    trans = np.concatenate([np.ones_like(trans[:, :, :1]), trans[:, :, :-1]], axis=2)
    weights = alpha * trans
    color = np.sum(weights[..., None] * rgb, axis=2)
    acc = np.sum(weights, axis=2)
    depth = np.sum(weights * depths[None, None, :], axis=2) / (acc + 1e-8)
    bg = np.array([0.96, 0.97, 0.99])
    color = color + (1.0 - acc[..., None]) * bg
    return np.clip(color, 0.0, 1.0), depth, weights


def _render_view(azimuth, h=96, w=96, samples=80):
    rays_o, rays_d = _generate_rays(azimuth, h=h, w=w)
    pts, depths = _sample_points(rays_o, rays_d, samples=samples)
    rgb, sigma = _radiance_field(pts)
    color, depth, weights = _volume_render(rgb, sigma, depths)
    return color, depth, weights, pts, depths


def _u8(x):
    return np.round(np.clip(x, 0.0, 1.0) * 255).astype(np.uint8)


def _depth_image(depth):
    d = np.asarray(depth, dtype=np.float64)
    finite = d[np.isfinite(d)]
    if finite.size == 0:
        return np.zeros((*d.shape, 3), dtype=np.uint8)
    lo, hi = np.percentile(finite, [2, 98])
    norm = np.clip((d - lo) / max(hi - lo, 1e-8), 0, 1)
    return np.stack([(1 - norm) * 255, (1 - np.abs(norm - 0.5) * 2) * 220, norm * 255], axis=-1).astype(np.uint8)


def _view_strip(rendered):
    thumbs = []
    for az, img in rendered:
        pil = Image.fromarray(_u8(img)).resize((150, 150), Image.BILINEAR)
        canvas = Image.new('RGB', (150, 176), (248, 250, 252))
        canvas.paste(pil, (0, 26))
        ImageDraw.Draw(canvas).text((8, 6), f'视角 {az} 度', fill=(15, 23, 42))
        thumbs.append(canvas)
    out = Image.new('RGB', (sum(t.width for t in thumbs) + 10 * (len(thumbs) - 1), 176), (248, 250, 252))
    x = 0
    for t in thumbs:
        out.paste(t, (x, 0))
        x += t.width + 10
    return np.array(out)


def _ray_diagram(width=520, height=300):
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    cam = (70, 155)
    sphere = (340, 150)
    draw.ellipse((sphere[0] - 72, sphere[1] - 72, sphere[0] + 72, sphere[1] + 72), outline=(37, 99, 235), width=3)
    draw.ellipse((sphere[0] - 34, sphere[1] - 34, sphere[0] + 34, sphere[1] + 34), fill=(191, 219, 254))
    draw.polygon([(cam[0] - 18, cam[1] - 14), (cam[0] - 18, cam[1] + 14), (cam[0] + 18, cam[1])], fill=(15, 23, 42))
    for off in [-64, -32, 0, 32, 64]:
        end = (450, sphere[1] + off)
        draw.line((cam[0] + 18, cam[1], end[0], end[1]), fill=(100, 116, 139), width=1)
        for t in np.linspace(0.38, 0.78, 6):
            x = int((1 - t) * (cam[0] + 18) + t * end[0])
            y = int((1 - t) * cam[1] + t * end[1])
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(225, 29, 72))
    draw.text((20, 18), '相机射线采样 3D 点，再累积密度与颜色。', fill=(15, 23, 42))
    return np.array(img)


def _density_curve(depths, weights, width=520, height=260):
    center_weights = weights[weights.shape[0] // 2, weights.shape[1] // 2]
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    left, top, right, bottom = 48, 24, 20, 38
    draw.rectangle((left, top, width - right, height - bottom), outline=(203, 213, 225))
    vals = center_weights / max(float(center_weights.max()), 1e-8)
    xs = left + (depths - depths.min()) / max(depths.max() - depths.min(), 1e-8) * (width - left - right)
    ys = height - bottom - vals * (height - top - bottom)
    draw.line(list(zip(xs.astype(int), ys.astype(int))), fill=(225, 29, 72), width=3)
    for x, y in zip(xs[::8].astype(int), ys[::8].astype(int)):
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(37, 99, 235))
    draw.text((16, 5), '中心射线上每个采样点的贡献', fill=(15, 23, 42))
    return np.array(img)


def _positional_encoding_chart(samples, levels=6, width=520, height=260):
    vals = np.asarray(samples[:, 0], dtype=np.float64)
    freqs = 2.0 ** np.arange(levels, dtype=np.float64)
    encoded = np.concatenate([np.sin(vals[:, None] * freqs[None, :]), np.cos(vals[:, None] * freqs[None, :])], axis=1)
    matrix = (encoded + 1.0) / 2.0
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((16, 8), '位置编码：一条射线上的 sin/cos 频带', fill=(15, 23, 42))
    x0, y0 = 52, 44
    cell_w = max(8, (width - x0 - 20) // matrix.shape[1])
    cell_h = max(12, (height - y0 - 28) // matrix.shape[0])
    for i in range(matrix.shape[0]):
        draw.text((8, y0 + i * cell_h), f'p{i}', fill=(71, 85, 105))
        for j in range(matrix.shape[1]):
            v = float(matrix[i, j])
            fill = (int(30 + 210 * v), int(90 + 90 * (1 - abs(v - 0.5) * 2)), int(220 - 140 * v))
            draw.rectangle((x0 + j * cell_w, y0 + i * cell_h, x0 + (j + 1) * cell_w - 1, y0 + (i + 1) * cell_h - 1), fill=fill)
    return np.array(img)


def _density_slice(width=360, height=360, y=0.0):
    xs = np.linspace(-1.7, 1.7, width)
    zs = np.linspace(1.7, -1.7, height)
    xx, zz = np.meshgrid(xs, zs)
    pts = np.stack([xx, np.full_like(xx, y), zz], axis=-1)
    _, sigma = _radiance_field(pts)
    sigma = sigma / max(float(np.percentile(sigma, 99)), 1e-8)
    sigma = np.clip(sigma, 0, 1)
    r = (sigma * 255).astype(np.uint8)
    g = ((1.0 - np.abs(sigma - 0.5) * 2) * 210).astype(np.uint8)
    b = ((1.0 - sigma) * 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def build_pipeline(image_path=None, **kwargs):
    samples = max(32, min(int(kwargs.get('samples_per_ray', 80)), 128))
    resolution = max(64, min(int(kwargs.get('resolution', 96)), 128))
    azimuth = float(kwargs.get('azimuth', 0.0))
    rendered = []
    first = None
    for az in [azimuth - 60, azimuth, azimuth + 60]:
        color, depth, weights, pts, depths = _render_view(az, h=resolution, w=resolution, samples=samples)
        rendered.append((int(round(az)), color))
        if first is None or abs(az - azimuth) < 1e-6:
            first = (color, depth, weights, pts, depths)
    color, depth, weights, pts, depths = first
    center_ray = pts[resolution // 2, resolution // 2, :: max(1, samples // 10)]

    return {
        'steps': [
            {
                'id': 'camera_rays',
                'name': '相机射线',
                'image': _ray_diagram(),
                'explanation': 'NeRF 对每个像素从相机发出一条 3D 射线。拖动视角滑块会改变相机位置，从而改变所有射线方向。',
                'formula': 'r(t)=o+t d',
                'data': {'azimuth': round(float(azimuth), 2), 'resolution': f'{resolution}x{resolution}', 'samples_per_ray': samples},
            },
            {
                'id': 'sample_points',
                'name': '沿射线采样 3D 点',
                'image': _density_curve(depths, weights),
                'visual_kind': 'chart',
                'overlay_scope': 'none',
                'chart': _density_curve_data(depths, weights),
                'explanation': '后端沿中心射线均匀采样多个 3D 点，并计算每个点对最终像素颜色的贡献权重。',
                'formula': 'p_i=o+t_i d',
                'data': {'center_ray_samples': np.round(center_ray, 4).tolist()},
            },
            {
                'id': 'positional_encoding',
                'name': '位置编码',
                'image': _positional_encoding_chart(center_ray),
                'visual_kind': 'chart',
                'overlay_scope': 'none',
                'chart': _positional_encoding_chart_data(center_ray),
                'explanation': '3D 坐标会被映射成多频 sin/cos 特征，让场函数能够表达更细的几何和纹理变化。',
                'formula': 'gamma(p)=[sin(2^k p), cos(2^k p)]',
            },
            {
                'id': 'radiance_field',
                'name': '密度场切片',
                'image': _density_slice(),
                'explanation': '每个采样点都会查询颜色 c 和密度 sigma。亮处表示该区域更容易挡住射线并贡献颜色。',
                'formula': '(c_i, sigma_i)=F_theta(gamma(p_i), d)',
            },
            {
                'id': 'render_view',
                'name': f'体渲染结果：{azimuth:.0f} 度视角',
                'image': _u8(color),
                'explanation': '体渲染把每条射线上的颜色和密度按透明度累积，得到当前视角下的像素颜色。',
                'formula': 'C(r)=sum_i T_i (1-exp(-sigma_i delta_i)) c_i',
                'data': {'azimuth': round(float(azimuth), 2)},
            },
            {
                'id': 'depth_map',
                'name': '累积深度图',
                'image': _depth_image(depth),
                'explanation': '深度图由同一组体渲染权重计算得到，表示射线主要在哪里遇到高密度区域。',
                'formula': 'D(r)=sum_i w_i t_i / sum_i w_i',
            },
            {
                'id': 'novel_views',
                'name': '相邻新视角渲染',
                'image': _view_strip(rendered),
                'explanation': '同一个 3D 辐射场从不同相机角度渲染出不同图像，这就是 NeRF 新视角合成的核心思想。',
                'formula': 'same field F_theta(x,d), different camera poses',
            },
        ],
        'outputs': {
            'azimuth': azimuth,
            'resolution': resolution,
            'samples_per_ray': samples,
        },
        'metrics': {
            'status': 'local_mechanism',
            'backend': 'NumPy volume rendering',
            'real_model': False,
            'algorithm': 'Tiny NeRF-style ray marching',
            'views': 3,
            'azimuth': round(float(azimuth), 2),
            'resolution': f'{resolution}x{resolution}',
            'samples_per_ray': samples,
            'note': '本页展示真实射线采样和体渲染机制，不是训练好的真实场景 NeRF 权重。',
        },
    }


def _density_curve_data(depths, weights):
    center_weights = weights[weights.shape[0] // 2, weights.shape[1] // 2]
    vals = center_weights / max(float(center_weights.max()), 1e-8)
    return {
        'type': 'line',
        'title': '中心射线采样贡献',
        'xLabel': '深度',
        'yLabel': '贡献权重',
        'min': 0,
        'max': 1,
        'series': [{'name': '权重', 'color': '#e11d48', 'values': [round(float(v), 6) for v in vals.tolist()]}],
    }


def _positional_encoding_chart_data(samples, levels=6):
    vals = np.asarray(samples[:, 0], dtype=np.float64)
    freqs = 2.0 ** np.arange(levels, dtype=np.float64)
    encoded = np.concatenate([np.sin(vals[:, None] * freqs[None, :]), np.cos(vals[:, None] * freqs[None, :])], axis=1)
    matrix = ((encoded + 1.0) / 2.0).round(6).tolist()
    return {
        'type': 'matrix',
        'title': '位置编码频带',
        'values': matrix,
        'min': 0,
        'max': 1,
    }
