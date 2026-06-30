"""Offline teaching demos for blueprint-only algorithms.

These demos are intentionally lightweight: they provide deterministic,
inspectable visual steps for algorithms that do not have local weights or a
full research implementation wired into this project.
"""
from __future__ import annotations

import math

import numpy as np

from app.utils.image_utils import ensure_gray, load_image_u8


LOCAL_TEACHING_MODEL_MODULES = {
    'stable_diffusion',
}

LOCAL_FRONTIER_ALGORITHM_MODULES = {
    'swin', 'dino', 'mae', 'dino_det', 'grdino', 'mask2former', 'sam2',
    'blip2', 'controlnet', 'dit', 'flux', 'stylegan', 'dust3r',
    'orbslam3', 'mediapipe', 'vitpose',
}

OFFLINE_TEACHING_MODULES = set()  # 已废弃——所有模块必须有真实实现

EXTERNAL_WEIGHT_MODULES = set()

BLUEPRINT_MODULES = OFFLINE_TEACHING_MODULES | LOCAL_TEACHING_MODEL_MODULES | LOCAL_FRONTIER_ALGORITHM_MODULES | EXTERNAL_WEIGHT_MODULES

MODULE_TITLES = {
    'vit': ('Vision Transformer', 'Image patches are embedded as tokens and mixed by self-attention.'),
    'detr': ('DETR', 'Object queries decode a set of boxes without anchors or NMS.'),
    'sam': ('Segment Anything', 'Image embeddings and prompts are decoded into candidate masks.'),
    'clip': ('CLIP', 'Image and text towers are aligned in a shared embedding space.'),
    'stable_diffusion': ('Stable Diffusion', 'Latent noise is iteratively denoised under text conditioning.'),
    'shitomasi': ('Shi-Tomasi corners', 'Corner response keeps locations where both local gradient eigenvalues are large.'),
    'ncuts': ('Normalized Cuts', 'A graph affinity map is split by a smooth spectral partition.'),
    'bovw_spm': ('BoVW + SPM', 'Local descriptors are quantized into visual words and pooled over spatial cells.'),
    'calibration': ('Camera Calibration', 'Checkerboard correspondences constrain intrinsics and reprojection error.'),
    'epipolar': ('Epipolar Geometry', 'Matched points satisfy an epipolar line constraint between two views.'),
    'sfm': ('Triangulation and SfM', 'Feature tracks plus camera motion reconstruct sparse 3D structure.'),
    'cnn_basics': ('CNN Basics', 'Learned filters, ReLU and pooling transform pixels into task features.'),
    'resnet': ('ResNet + Grad-CAM', 'Residual blocks preserve signal flow; class activation highlights evidence.'),
    'fcn': ('FCN', 'Dense class scores are upsampled back to image resolution.'),
    'unet': ('U-Net', 'Encoder context and decoder skip details produce pixel masks.'),
    'faster_rcnn': ('Faster R-CNN + FPN', 'Region proposals are classified and refined on multi-scale features.'),
    'yolo': ('YOLO', 'A grid predicts boxes and class confidences in one pass.'),
    'mask_rcnn': ('Mask R-CNN', 'Detection boxes get a parallel pixel-mask branch.'),
    'gan': ('GAN Basics', 'Generator and discriminator losses move in opposite directions.'),
    'conv_training': ('Kernel Training', 'A small convolution kernel is optimized toward a target operator.'),
    'nerf': ('NeRF', 'Camera rays accumulate density and color samples to render a view.'),
    'ddpm': ('DDPM', 'A forward noise schedule and reverse denoising path explain diffusion sampling.'),
    'simclr': ('SimCLR', 'Two augmented views of the same image are pulled together in embedding space.'),
    'moco': ('MoCo', 'A momentum encoder and queue stabilize contrastive learning.'),
    'byol': ('BYOL', 'Online and target networks bootstrap representations without negatives.'),
    'ijepa': ('I-JEPA', 'A predictor fills missing representation blocks instead of pixels.'),
    '3dgs': ('3D Gaussian Splatting', 'Projected Gaussian ellipses alpha-composite into a rendered view.'),
    'pointnet': ('PointNet', 'Shared point features and max pooling handle unordered point clouds.'),
    'bev': ('BEV Perception', 'Image features are lifted into a bird-eye-view grid.'),
    'occupy': ('Occupancy Networks', 'A voxel field marks free and occupied 3D space.'),
    'c3d': ('C3D', '3D convolution filters integrate space and time.'),
    'bytetrack': ('ByteTrack', 'High and low confidence detections are associated in two passes.'),
    'botsort': ('BoT-SORT', 'Camera motion and appearance features improve multi-object tracking.'),
    'deeppose': ('DeepPose', 'A CNN-style regressor predicts human keypoint coordinates.'),
    'openpose': ('OpenPose', 'Heatmaps and part affinity fields assemble a pose skeleton.'),
}


def build_pipeline(module_id, image_path=None, image=None, **kwargs):
    """Return a generic but module-specific offline teaching pipeline."""
    rgb = _load_or_fixture(image_path=image_path, image=image)
    gray = ensure_gray(rgb)
    title, summary = MODULE_TITLES.get(module_id, (module_id, 'Offline teaching visualization.'))
    feature = _feature_image(module_id, rgb, gray)
    diagram = _diagram_image(module_id)
    output = _output_image(module_id, rgb, gray)

    steps = [
        {'id': 'input', 'name': 'Input / fixture', 'image': rgb,
         'explanation': 'Input image used for the local teaching pipeline.',
         'formula': _formula_for(module_id, 'input')},
        {'id': 'representation', 'name': 'Intermediate representation', 'image': feature,
         'explanation': summary,
         'formula': _formula_for(module_id, 'representation')},
        {'id': 'process', 'name': 'Algorithm process', 'image': diagram,
         'explanation': 'A deterministic local visualization of the main computation stages.',
         'formula': _formula_for(module_id, 'process')},
        {'id': 'result', 'name': f'{title} teaching result', 'image': output,
         'explanation': 'Offline teaching output. This is not a downloaded pretrained-model prediction.',
         'formula': _formula_for(module_id, 'result')},
    ]
    return {
        'steps': steps,
        'metrics': {
            'status': 'local_teaching_visualization',
            'module_id': module_id,
            'backend': 'NumPy/PIL deterministic teaching visualization',
            'real_model': False,
            'external_weights': False,
            'image_shape': f'{rgb.shape[1]}x{rgb.shape[0]}',
        },
    }


def external_weight_error(module_id):
    title = MODULE_TITLES.get(module_id, (module_id, ''))[0]
    return {
        'error': f'{title} requires external pretrained weights or a remote model and is intentionally disabled in offline mode.',
        'steps': [],
        'metrics': {'status': 'requires_external_weights', 'module_id': module_id},
    }


def _load_or_fixture(image_path=None, image=None):
    if image is not None:
        arr = np.asarray(image)
    elif image_path:
        arr = load_image_u8(image_path, mode='rgb', max_side=384)
    else:
        y, x = np.mgrid[0:160, 0:220]
        arr = np.zeros((160, 220, 3), dtype=np.uint8)
        arr[..., 0] = (x * 255 // 219).astype(np.uint8)
        arr[..., 1] = (y * 255 // 159).astype(np.uint8)
        arr[..., 2] = (((x - 110) ** 2 + (y - 80) ** 2) ** 0.5 * 2).clip(0, 255).astype(np.uint8)
        arr[35:115, 55:145] = [230, 130, 70]
        arr[70:135, 125:195] = [40, 170, 220]
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    if arr.shape[-1] == 4:
        arr = arr[..., :3]
    return arr.astype(np.uint8)


def _feature_image(module_id, rgb, gray):
    if module_id in {'vit', 'clip'}:
        return _patch_grid(rgb)
    if module_id in {'detr', 'sam'}:
        return _detection_overlay(rgb) if module_id == 'detr' else _segmentation_overlay(rgb, gray)
    if module_id == 'stable_diffusion':
        return _noise_grid()
    if module_id in {'shitomasi', 'sfm', 'epipolar', 'calibration'}:
        return _corner_overlay(rgb, gray)
    if module_id in {'ncuts', 'fcn', 'unet', 'mask_rcnn', 'sam2', 'occupy'}:
        return _segmentation_overlay(rgb, gray)
    if module_id in {'cnn_basics', 'resnet', 'c3d'}:
        return _filter_bank(gray)
    if module_id in {'bovw_spm', 'simclr', 'moco', 'byol', 'ijepa'}:
        return _embedding_chart(gray)
    if module_id in {'gan', 'ddpm', 'stylegan'}:
        return _noise_grid()
    if module_id in {'nerf', '3dgs', 'pointnet', 'bev'}:
        return _point_field()
    if module_id in {'faster_rcnn', 'yolo', 'bytetrack', 'botsort', 'deeppose', 'openpose'}:
        return _detection_overlay(rgb)
    return _heatmap(gray)


def _output_image(module_id, rgb, gray):
    if module_id == 'vit':
        return _attention_matrix()
    if module_id == 'clip':
        return _embedding_chart(gray)
    if module_id == 'detr':
        return _detection_overlay(rgb)
    if module_id == 'sam':
        return _segmentation_overlay(rgb, gray)
    if module_id == 'stable_diffusion':
        return _generated_pattern()
    if module_id in {'faster_rcnn', 'yolo', 'bytetrack', 'botsort'}:
        return _detection_overlay(rgb)
    if module_id in {'deeppose', 'openpose'}:
        return _pose_overlay(rgb)
    if module_id in {'gan', 'ddpm'}:
        return _generated_pattern()
    if module_id in {'nerf', '3dgs'}:
        return _rendered_view()
    if module_id in {'pointnet', 'bev', 'occupy'}:
        return _point_field()
    if module_id in {'ncuts', 'fcn', 'unet', 'mask_rcnn'}:
        return _segmentation_overlay(rgb, gray)
    return _feature_image(module_id, rgb, gray)


def _heatmap(gray):
    g = gray.astype(np.float64)
    g = (g - g.min()) / max(g.max() - g.min(), 1e-8)
    return np.stack([(g * 255), ((1 - np.abs(g - .5) * 2) * 220), ((1 - g) * 255)], axis=-1).astype(np.uint8)


def _corner_overlay(rgb, gray):
    out = rgb.copy()
    gy, gx = np.gradient(gray.astype(np.float64))
    score = gx * gx + gy * gy
    thresh = np.percentile(score, 96)
    ys, xs = np.where(score >= thresh)
    for y, x in list(zip(ys[::max(1, len(ys)//80)], xs[::max(1, len(xs)//80)]))[:80]:
        y0, y1 = max(0, y - 2), min(out.shape[0], y + 3)
        x0, x1 = max(0, x - 2), min(out.shape[1], x + 3)
        out[y0:y1, x0:x1] = [239, 68, 68]
    return out


def _segmentation_overlay(rgb, gray):
    out = rgb.copy().astype(np.float64)
    masks = [gray < np.percentile(gray, 35), gray > np.percentile(gray, 68)]
    colors = [np.array([40, 180, 120]), np.array([240, 160, 40])]
    for mask, col in zip(masks, colors):
        out[mask] = out[mask] * 0.45 + col * 0.55
    return out.astype(np.uint8)


def _detection_overlay(rgb):
    out = rgb.copy()
    h, w = out.shape[:2]
    boxes = [(w//8, h//6, w//2, h//2), (w//2, h//3, w-12, h-14)]
    colors = [[239, 68, 68], [59, 130, 246]]
    for (x1, y1, x2, y2), col in zip(boxes, colors):
        out[y1:y1+3, x1:x2] = col
        out[y2-3:y2, x1:x2] = col
        out[y1:y2, x1:x1+3] = col
        out[y1:y2, x2-3:x2] = col
    return out


def _pose_overlay(rgb):
    out = _detection_overlay(rgb)
    h, w = out.shape[:2]
    points = [(w//2, h//5), (w//2, h//3), (w//3, h//2), (2*w//3, h//2), (w//3, 4*h//5), (2*w//3, 4*h//5)]
    for x, y in points:
        out[max(0, y-4):min(h, y+5), max(0, x-4):min(w, x+5)] = [34, 197, 94]
    for a, b in [(0, 1), (1, 2), (1, 3), (2, 4), (3, 5)]:
        _draw_line(out, points[a], points[b], [250, 204, 21])
    return out


def _filter_bank(gray):
    gy, gx = np.gradient(gray.astype(np.float64))
    mag = np.sqrt(gx * gx + gy * gy)
    return _heatmap((mag / max(mag.max(), 1e-8) * 255).astype(np.uint8))


def _embedding_chart(gray, size=220):
    img = np.ones((150, size, 3), dtype=np.uint8) * 245
    hist, _ = np.histogram(gray, bins=16, range=(0, 256))
    hist = hist / max(hist.max(), 1)
    for i, v in enumerate(hist):
        x0 = 8 + i * 13
        x1 = x0 + 9
        y0 = 130 - int(v * 105)
        img[y0:130, x0:x1] = [59, 130, 246]
    return img


def _patch_grid(rgb, patch=28):
    out = rgb.copy()
    h, w = out.shape[:2]
    for y in range(0, h, patch):
        out[y:min(h, y + 2), :] = [15, 23, 42]
    for x in range(0, w, patch):
        out[:, x:min(w, x + 2)] = [15, 23, 42]
    out[:patch, :patch] = np.clip(out[:patch, :patch].astype(np.float64) * 0.45 + np.array([250, 204, 21]) * 0.55, 0, 255)
    return out.astype(np.uint8)


def _attention_matrix(size=220, tokens=10):
    img = np.ones((size, size, 3), dtype=np.uint8) * 248
    cell = size // tokens
    for r in range(tokens):
        for c in range(tokens):
            dist = abs(r - c)
            val = int(max(30, 230 - dist * 24))
            img[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = [val, 180, 255 - val // 3]
    for i in range(tokens + 1):
        p = min(size - 1, i * cell)
        img[p:p + 1, :] = [15, 23, 42]
        img[:, p:p + 1] = [15, 23, 42]
    return img


def _noise_grid(size=180):
    y, x = np.mgrid[0:size, 0:size]
    z = (np.sin(x / 9) + np.cos(y / 13) + np.sin((x + y) / 17)) / 3
    g = ((z + 1) * 127.5).astype(np.uint8)
    return _heatmap(g)


def _generated_pattern(size=180):
    y, x = np.mgrid[0:size, 0:size]
    r = ((np.sin(x / 12) + 1) * 127).astype(np.uint8)
    g = ((np.cos(y / 14) + 1) * 127).astype(np.uint8)
    b = ((np.sin((x + y) / 18) + 1) * 127).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _point_field(size=220):
    img = np.zeros((size, size, 3), dtype=np.uint8) + 18
    center = size / 2
    for i in range(260):
        t = i * 0.23
        rad = 18 + (i % 90)
        x = int(center + math.cos(t) * rad)
        y = int(center + math.sin(t * 0.8) * rad * 0.72)
        if 0 <= x < size and 0 <= y < size:
            img[max(0, y-1):min(size, y+2), max(0, x-1):min(size, x+2)] = [80 + i % 160, 180, 240]
    return img


def _rendered_view(size=180):
    y, x = np.mgrid[-1:1:complex(size), -1:1:complex(size)]
    sphere = np.clip(1 - x*x - y*y, 0, 1)
    shade = np.sqrt(sphere)
    return np.stack([shade * 230, shade * 160 + 20, shade * 80 + 80], axis=-1).astype(np.uint8)


def _diagram_image(module_id, width=520, height=180):
    from PIL import Image, ImageDraw
    title, _ = MODULE_TITLES.get(module_id, (module_id, ''))
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    labels = ['input', 'encode', 'compute', 'output']
    colors = [(59, 130, 246), (20, 184, 166), (245, 158, 11), (34, 197, 94)]
    for i, label in enumerate(labels):
        x = 26 + i * 122
        draw.rounded_rectangle((x, 56, x + 86, 116), radius=8, fill=colors[i], outline=(30, 41, 59))
        draw.text((x + 14, 78), label, fill=(255, 255, 255))
        if i < len(labels) - 1:
            draw.line((x + 90, 86, x + 116, 86), fill=(51, 65, 85), width=3)
    draw.text((24, 18), title, fill=(15, 23, 42))
    return np.array(img)


def _formula_for(module_id, step_id):
    formulas = {
        'vit': {
            'representation': 'z_0=[x_cls; x_p^1E; ...; x_p^NE]+E_pos',
            'process': 'Attention(Q,K,V)=softmax(QK^T/sqrt(d))V',
            'result': 'y=MLP(LN(z_cls))',
        },
        'detr': {
            'representation': 'F=CNN(I)+pos',
            'process': 'Y=Decoder(Q, Encoder(F))',
            'result': 'min_sigma sum_i L(y_i, y_hat_sigma(i))',
        },
        'sam': {
            'representation': 'E_img=ImageEncoder(I)',
            'process': 'E_prompt=PromptEncoder(points, boxes, masks)',
            'result': 'M=MaskDecoder(E_img, E_prompt)',
        },
        'clip': {
            'representation': 'v_img=f_img(I), v_txt=f_txt(T)',
            'process': 's=cos(v_img, v_txt)/tau',
            'result': 'L=InfoNCE(image, text)',
        },
        'stable_diffusion': {
            'representation': 'z=VAE.encode(I)',
            'process': 'eps_hat=UNet(z_t,t,c)',
            'result': 'z_{t-1}=Denoise(z_t, eps_hat)',
        },
    }
    return formulas.get(module_id, {}).get(step_id, '')


def _draw_line(img, p0, p1, color):
    x0, y0 = p0
    x1, y1 = p1
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        t = i / steps
        x = int(round(x0 * (1 - t) + x1 * t))
        y = int(round(y0 * (1 - t) + y1 * t))
        img[max(0, y-1):min(img.shape[0], y+2), max(0, x-1):min(img.shape[1], x+2)] = color
