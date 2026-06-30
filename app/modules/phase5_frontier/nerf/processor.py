"""Pipeline builder for NeRF module."""
import numpy as np
from app.modules.phase5_frontier.nerf.algorithm import render_view, generate_rays, sample_points


def build_pipeline(image_path=None, azimuth=0, **kwargs):
    az = float(kwargs.get('azimuth', azimuth))

    # Render two views
    img1, depth1 = render_view(az, H=120, W=120)
    img2, depth2 = render_view(az + 45, H=120, W=120)
    img3, depth3 = render_view(az + 90, H=120, W=120)

    # Convert rendered images to uint8
    view1_u8 = (np.clip(img1, 0, 1) * 255).astype(np.uint8)
    view2_u8 = (np.clip(img2, 0, 1) * 255).astype(np.uint8)
    view3_u8 = (np.clip(img3, 0, 1) * 255).astype(np.uint8)

    # Depth maps as heatmaps
    depth1_vis = _depth_to_heatmap(depth1)
    depth2_vis = _depth_to_heatmap(depth2)

    # Multi-view strip
    multi_view = _make_multi_view_strip([view1_u8, view2_u8, view3_u8],
                                        [f'{az:.0f}°', f'{az+45:.0f}°', f'{az+90:.0f}°'])

    # Ray diagram: sample rays at 3 azimuths
    ray_diagram = _render_ray_diagram(az)

    steps = [
        {'id': 'ray_diagram', 'name': '射线采样示意 (俯视图)', 'image': ray_diagram,
         'explanation': '从相机发射射线穿过场景。每条射线上采样 64 个 3D 点，经过位置编码后送入 MLP 预测颜色和密度'},
        {'id': 'depth1', 'name': f'深度图 (视角 {az:.0f}°)', 'image': depth1_vis,
         'explanation': '体渲染累积的深度图。越亮 = 越近——MLP 在每个采样点预测密度 σ，通过体渲染积分得到每个像素的深度'},
        {'id': 'view1', 'name': f'渲染结果 (视角 {az:.0f}°)', 'image': view1_u8,
         'explanation': f'从 {az:.0f}° 方位角渲染。NeRF 的 MLP 记住了整个 3D 场景——输入 (x,y,z,θ,φ)，输出 (R,G,B,σ)'},
        {'id': 'multi_view', 'name': '多视角对比', 'image': multi_view,
         'explanation': '同一个 MLP 从三个不同角度渲染。NeRF 的核心：用神经网络隐式表示 3D 场景，通过体渲染合成任意新视角'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'method': 'NeRF (Tiny MLP)',
            'pos_encoding_freqs': 10,
            'samples_per_ray': 64,
            'rendered_views': 3,
        },
    }


def _depth_to_heatmap(depth):
    d = np.asarray(depth, dtype=np.float64)
    valid = np.isfinite(d) & (d > 0)
    if valid.any():
        d[~valid] = d[valid].max()
        d = (d - d.min()) / max(d.max() - d.min(), 1e-8)
    r = (d * 255).astype(np.uint8)
    g = ((1 - np.abs(d - 0.5) * 2) * 220).astype(np.uint8)
    b = ((1 - d) * 200).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _make_multi_view_strip(views, labels):
    h = max(v.shape[0] for v in views)
    total_w = sum(v.shape[1] for v in views) + max(0, len(views)-1)*8
    from PIL import Image
    canvas = np.zeros((h, total_w, 3), dtype=np.uint8)
    x_off = 0
    for v in views:
        vh, vw = v.shape[:2]
        y0 = (h - vh) // 2
        canvas[y0:y0+vh, x_off:x_off+vw] = v
        x_off += vw + 8
    return canvas


def _render_ray_diagram(azimuth, size=300):
    """Draw a top-down ray diagram showing camera and scene."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (size, size), (20, 25, 35))
    draw = ImageDraw.Draw(img)
    cx, cy = size//2, size//2
    # Scene sphere
    draw.ellipse([(cx-30, cy-30), (cx+30, cy+30)], outline=(100, 100, 120), width=1)
    # Camera positions at 3 angles
    angles_deg = [float(azimuth), float(azimuth)+45, float(azimuth)+90]
    colors = [(239, 68, 68), (59, 130, 246), (34, 197, 94)]
    for ang, col in zip(angles_deg, colors):
        rad = np.radians(ang)
        cam_x = cx + int(90 * np.cos(rad))
        cam_y = cy - int(90 * np.sin(rad))
        draw.ellipse([(cam_x-5, cam_y-5), (cam_x+5, cam_y+5)], fill=col)
        # Ray cone
        for t in np.linspace(0, 1, 8):
            px = int(cam_x + t * (cx - cam_x) + (t*20-10))
            py = int(cam_y + t * (cy - cam_y) + (t*20-10))
            draw.point((px, py), fill=col)
    draw.text((6, 4), '俯视图: 相机→射线→场景', fill=(180, 190, 200))
    return np.array(img)
