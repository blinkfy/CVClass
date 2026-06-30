"""Pipeline builder for the interactive SAM teaching page.

The page is prompt-driven: points and boxes selected by the user are sent to
the real Segment Anything predictor.  Frontend visualizations may animate the
returned frames/overlays, but they must not fabricate masks.
"""
from __future__ import annotations

import json
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from app.modules.phase5_frontier.sam.algorithm import encode_image, predict_from_prompts
from app.utils.image_utils import load_image_u8, to_base64


SAM_URL = 'https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth'
_PALETTE = [
    (0, 200, 120),
    (59, 130, 246),
    (168, 85, 247),
    (245, 158, 11),
]


def build_pipeline(image_path=None, **kwargs):
    if not image_path:
        return {
            'module_id': 'sam',
            'error': 'SAM requires an input image and a local checkpoint.',
            'steps': [],
            'metrics': {'status': 'missing_input'},
            'interactions': _interaction_schema(),
        }

    try:
        img_u8 = load_image_u8(image_path, mode='rgb', max_side=768)
    except Exception as exc:
        return {
            'module_id': 'sam',
            'error': f'SAM image load failed: {exc}',
            'steps': [],
            'metrics': {'status': 'bad_input'},
            'interactions': _interaction_schema(),
        }

    h, w = img_u8.shape[:2]
    prompt = _parse_prompt(kwargs, w, h)
    prompt_overlay = _draw_prompt_overlay(img_u8, prompt['points'], prompt['labels'], prompt['box'])

    try:
        enc_info = _clean_encoder_info(encode_image(img_u8))
    except Exception as exc:
        return _missing_checkpoint(img_u8, prompt_overlay, prompt, exc)

    result = predict_from_prompts(
        points=prompt['points'] or None,
        labels=prompt['labels'] or None,
        box=prompt['box'],
        multimask_output=prompt['multimask'],
    )

    masks = result['masks']
    scores = [float(score) for score in result['scores']]
    if not masks:
        return {
            'module_id': 'sam',
            'error': 'SAM returned no masks for the current prompt.',
            'steps': [],
            'metrics': {'status': 'empty_prediction'},
            'interactions': _interaction_schema(prompt),
        }

    best_idx = int(result.get('best_idx', int(np.argmax(scores))))
    selected_idx = _clamp_int(prompt['selected_mask'], 0, len(masks) - 1, best_idx)
    selected_mask = masks[selected_idx]

    encoder_vis = _draw_encoder_grid(img_u8, enc_info)
    token_vis = _draw_prompt_tokens(prompt)
    gallery = _make_multi_mask_strip(img_u8, masks, scores, selected_idx)
    selected_overlay = _overlay_mask(
        _draw_prompt_overlay(img_u8, prompt['points'], prompt['labels'], prompt['box']),
        selected_mask,
        color=_PALETTE[selected_idx % len(_PALETTE)],
    )

    outputs = _build_outputs(img_u8, masks, scores, selected_idx, best_idx, prompt)
    overlays = _build_overlays(img_u8, masks, scores, selected_idx, prompt)
    frames = _build_frames(img_u8, prompt_overlay, encoder_vis, token_vis, gallery, selected_overlay)

    steps = [
        {
            'id': 'input',
            'name': '输入图像',
            'image': img_u8,
            'formula': 'I in R^{H x W x 3}',
            'explanation': 'SAM 先对整张图像做一次图像编码。后续点、负点或框提示都会复用这份图像 embedding。',
            'data': {'height': h, 'width': w, 'encoder_info': enc_info},
        },
        {
            'id': 'prompt_overlay',
            'name': '用户提示覆盖层',
            'image': prompt_overlay,
            'formula': 'P = {(x_i,y_i,l_i)} union B',
            'explanation': '绿色点表示“要这个区域”，红色点表示“不要这个区域”，蓝色框给出粗略范围。提示越明确，mask 越稳定。',
            'data': {
                'points': _point_dicts(prompt['points'], prompt['labels']),
                'box': prompt['box'],
                'prompt_source': prompt['source'],
            },
        },
        {
            'id': 'image_encoder',
            'name': '图像编码器',
            'image': encoder_vis,
            'formula': 'E_I = ImageEncoder(I)',
            'explanation': 'ViT 图像编码器把图像压成高维特征网格。这个过程是真实 SAM 推理的一部分，交互时不需要重复理解整张图。',
            'data': enc_info,
        },
        {
            'id': 'prompt_encoder',
            'name': '提示编码器',
            'image': token_vis,
            'formula': 'E_P = PromptEncoder(P)',
            'explanation': '点和框会被编码成 prompt token。正点会拉近目标区域，负点会压低不想要的区域，框会限制搜索范围。',
            'data': {
                'num_positive_points': int(sum(1 for label in prompt['labels'] if label == 1)),
                'num_negative_points': int(sum(1 for label in prompt['labels'] if label == 0)),
                'has_box': prompt['box'] is not None,
            },
        },
        {
            'id': 'candidate_masks',
            'name': '候选 mask 与 IoU 评分',
            'image': gallery,
            'formula': 'M_i, s_i = MaskDecoder(E_I, E_P)',
            'explanation': 'SAM 通常给出多个候选 mask，并预测每个候选的质量分数。页面允许你选择候选，而不是让前端替你伪造结果。',
            'data': {
                'scores': [round(score, 4) for score in scores],
                'areas': [int((np.asarray(mask) > 128).sum()) for mask in masks],
                'best_idx': best_idx,
                'selected_idx': selected_idx,
                'low_res_logits_shape': result.get('low_res_logits_shape', []),
            },
        },
        {
            'id': 'selected_mask',
            'name': '最终分割叠加',
            'image': selected_overlay,
            'formula': 'M = M_selected',
            'explanation': '这里展示的是当前选中候选 mask 叠加到原图后的真实结果。换点、加负点或拖框后，这一步会随真实后端重新计算。',
            'data': {
                'selected_idx': selected_idx,
                'selected_score': round(scores[selected_idx], 4),
                'selected_area_pixels': int((np.asarray(selected_mask) > 128).sum()),
            },
        },
    ]

    return {
        'module_id': 'sam',
        'steps': steps,
        'frames': frames,
        'overlays': overlays,
        'interactions': _interaction_schema(prompt),
        'outputs': outputs,
        'metrics': {
            'status': 'pretrained_model',
            'backend': 'segment-anything',
            'model': 'SAM ViT-B',
            'image_size': f'{w}x{h}',
            'prompt_type': _prompt_type(prompt),
            'num_points': len(prompt['points']),
            'has_box': prompt['box'] is not None,
            'num_candidates': len(masks),
            'best_iou_score': round(scores[best_idx], 4),
            'selected_iou_score': round(scores[selected_idx], 4),
        },
    }


def _missing_checkpoint(img_u8, prompt_overlay, prompt, exc):
    return {
        'module_id': 'sam',
        'error': (
            'SAM checkpoint is not configured. Download sam_vit_b_01ec64.pth '
            'and either set SAM_CHECKPOINT or place it at models/sam_vit_b_01ec64.pth. '
            f'Official URL: {SAM_URL}. Original error: {exc}'
        ),
        'steps': [
            {
                'id': 'input',
                'name': '输入图像',
                'image': img_u8,
                'formula': 'I in R^{H x W x 3}',
                'explanation': '图像已经成功读取；真实 SAM 分割需要本地 ViT-B checkpoint。这里不会返回伪造 mask。',
            },
            {
                'id': 'prompt_overlay',
                'name': '已选择的提示',
                'image': prompt_overlay,
                'formula': 'P = {(x_i,y_i,l_i)} union B',
                'explanation': '前端选择的点和框会保留，但由于 checkpoint 缺失，后端不会冒充模型输出。',
            },
        ],
        'frames': [
            {
                'id': 'prompt_overlay',
                'name': '已选择的提示',
                'image_base64': to_base64(prompt_overlay),
                'explanation': '准备好 checkpoint 后，同样的提示会送入真实 SAM predictor。',
            },
        ],
        'overlays': {
            'points': _point_dicts(prompt['points'], prompt['labels']),
            'box': prompt['box'],
            'masks': [],
        },
        'interactions': _interaction_schema(prompt),
        'outputs': {'candidate_masks': [], 'selected_mask': None},
        'metrics': {
            'status': 'model_not_available',
            'required_file': 'sam_vit_b_01ec64.pth',
            'env_var': 'SAM_CHECKPOINT',
            'default_path': 'models/sam_vit_b_01ec64.pth',
            'download_url': SAM_URL,
        },
    }


def _parse_prompt(kwargs: dict[str, Any], width: int, height: int) -> dict[str, Any]:
    points, embedded_labels = _coerce_points(_json_value(kwargs.get('points')), width, height)
    labels = _coerce_labels(_json_value(kwargs.get('labels')), embedded_labels, len(points))
    box = _coerce_box(_json_value(kwargs.get('box')), width, height)
    source = 'user_prompt'

    if not points and box is None and ('x' in kwargs or 'y' in kwargs):
        cx = _clamp_int(kwargs.get('x'), 0, width - 1, width // 2)
        cy = _clamp_int(kwargs.get('y'), 0, height - 1, height // 2)
        points = [[cx, cy]]
        labels = [1]
        source = 'legacy_xy'

    if not points and box is None:
        points = [[width // 2, height // 2]]
        labels = [1]
        source = 'fallback_center_for_sample'

    return {
        'points': points,
        'labels': labels,
        'box': box,
        'source': source,
        'multimask': _as_bool(kwargs.get('multimask', True)),
        'selected_mask': kwargs.get('selected_mask', kwargs.get('candidate', None)),
    }


def _json_value(value):
    if value is None or isinstance(value, (list, tuple, dict)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    return value


def _coerce_points(raw, width, height):
    if raw is None:
        return [], []
    if isinstance(raw, dict):
        raw = [raw]
    points = []
    labels = []
    for item in raw if isinstance(raw, list) else []:
        try:
            if isinstance(item, dict):
                x = item.get('x', item.get('0'))
                y = item.get('y', item.get('1'))
                label = int(item.get('label', 1))
            else:
                x, y = item[0], item[1]
                label = int(item[2]) if len(item) > 2 else 1
            points.append([
                _clamp_int(x, 0, width - 1, width // 2),
                _clamp_int(y, 0, height - 1, height // 2),
            ])
            labels.append(1 if label else 0)
        except (TypeError, ValueError, IndexError):
            continue
    return points, labels


def _coerce_labels(raw, embedded_labels, count):
    labels = list(embedded_labels[:count])
    if isinstance(raw, list):
        labels = []
        for item in raw[:count]:
            try:
                labels.append(1 if int(item) else 0)
            except (TypeError, ValueError):
                labels.append(1)
    while len(labels) < count:
        labels.append(1)
    return labels


def _coerce_box(raw, width, height):
    if raw is None:
        return None
    try:
        if isinstance(raw, dict):
            vals = [raw['x1'], raw['y1'], raw['x2'], raw['y2']]
        else:
            vals = list(raw)[:4]
        x1, y1, x2, y2 = [float(v) for v in vals]
    except (TypeError, ValueError, KeyError):
        return None
    left, right = sorted([_clamp_int(x1, 0, width - 1, 0), _clamp_int(x2, 0, width - 1, width - 1)])
    top, bottom = sorted([_clamp_int(y1, 0, height - 1, 0), _clamp_int(y2, 0, height - 1, height - 1)])
    if right - left < 2 or bottom - top < 2:
        return None
    return [left, top, right, bottom]


def _clamp_int(value, low, high, default):
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = int(default)
    return max(int(low), min(int(high), number))


def _as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() not in {'0', 'false', 'no', 'off'}
    return bool(value)


def _clean_encoder_info(info):
    cleaned = {}
    for key, value in dict(info or {}).items():
        if isinstance(value, np.ndarray):
            cleaned[key] = value.tolist()
        elif isinstance(value, (tuple, list)):
            cleaned[key] = [int(v) if isinstance(v, (np.integer, int)) else v for v in value]
        elif isinstance(value, np.integer):
            cleaned[key] = int(value)
        else:
            cleaned[key] = value
    return cleaned


def _prompt_type(prompt):
    if prompt['points'] and prompt['box'] is not None:
        return 'points+box'
    if prompt['box'] is not None:
        return 'box'
    if any(label == 0 for label in prompt['labels']):
        return 'positive+negative points'
    return 'point'


def _interaction_schema(prompt=None):
    return {
        'modes': [
            {'id': 'positive', 'name': '正点', 'meaning': '告诉 SAM：我要这个区域。'},
            {'id': 'negative', 'name': '负点', 'meaning': '告诉 SAM：不要这个区域。'},
            {'id': 'box', 'name': '框选', 'meaning': '给 SAM 一个粗略搜索范围。'},
        ],
        'supports': {
            'multi_points': True,
            'box_prompt': True,
            'candidate_selection': True,
            'opacity': True,
        },
        'current_prompt': {
            'points': _point_dicts(prompt['points'], prompt['labels']) if prompt else [],
            'box': prompt['box'] if prompt else None,
            'source': prompt.get('source') if prompt else None,
        },
    }


def _point_dicts(points, labels):
    return [
        {'x': int(point[0]), 'y': int(point[1]), 'label': int(labels[idx] if idx < len(labels) else 1)}
        for idx, point in enumerate(points)
    ]


def _build_outputs(img, masks, scores, selected_idx, best_idx, prompt):
    candidates = []
    for idx, mask in enumerate(masks):
        mask_bool = np.asarray(mask) > 128
        overlay = _overlay_mask(img, mask, color=_PALETTE[idx % len(_PALETTE)])
        candidates.append({
            'index': idx,
            'name': f'候选 {idx + 1}',
            'score': round(float(scores[idx]), 4),
            'area_pixels': int(mask_bool.sum()),
            'area_ratio': round(float(mask_bool.mean()), 5),
            'mask_base64': to_base64(mask),
            'overlay_base64': to_base64(overlay),
        })
    return {
        'candidate_masks': candidates,
        'selected_mask': candidates[selected_idx] if candidates else None,
        'selected_idx': selected_idx,
        'best_idx': best_idx,
        'prompt': {
            'points': _point_dicts(prompt['points'], prompt['labels']),
            'box': prompt['box'],
            'type': _prompt_type(prompt),
        },
    }


def _build_overlays(img, masks, scores, selected_idx, prompt):
    h, w = img.shape[:2]
    return {
        'image_size': {'width': int(w), 'height': int(h)},
        'points': _point_dicts(prompt['points'], prompt['labels']),
        'box': prompt['box'],
        'masks': [
            {
                'index': idx,
                'score': round(float(scores[idx]), 4),
                'area_pixels': int((np.asarray(mask) > 128).sum()),
                'color': _PALETTE[idx % len(_PALETTE)],
                'selected': idx == selected_idx,
            }
            for idx, mask in enumerate(masks)
        ],
    }


def _build_frames(img, prompt_overlay, encoder_vis, token_vis, gallery, selected_overlay):
    raw_frames = [
        ('input', '输入图像', img, '先固定同一张图片，后续所有 mask 都来自这张图的真实编码。'),
        ('prompt', '选择提示', prompt_overlay, '用户点或框决定 SAM 要分割哪里。'),
        ('image_encoder', '图像编码', encoder_vis, '图像被编码成特征网格，供后续解码器查询。'),
        ('prompt_encoder', '提示编码', token_vis, '交互提示被编码成 token，与图像特征一起送入解码器。'),
        ('candidates', '候选 mask', gallery, '多个候选 mask 同时出现，分数表示模型预计的质量。'),
        ('selected', '最终叠加', selected_overlay, '选中的候选 mask 叠加回原图。'),
    ]
    return [
        {'id': fid, 'name': name, 'image_base64': to_base64(image), 'explanation': explanation}
        for fid, name, image, explanation in raw_frames
    ]


def _draw_prompt_overlay(img, points, labels, box):
    pil = Image.fromarray(img).convert('RGB')
    draw = ImageDraw.Draw(pil, 'RGBA')
    if box is not None:
        x1, y1, x2, y2 = box
        draw.rectangle([x1, y1, x2, y2], outline=(59, 130, 246, 255), width=max(3, pil.width // 180))
        draw.rectangle([x1, y1, x2, y2], fill=(59, 130, 246, 28))
    radius = max(6, min(pil.width, pil.height) // 48)
    for idx, point in enumerate(points):
        x, y = point
        label = labels[idx] if idx < len(labels) else 1
        fill = (34, 197, 94, 230) if label == 1 else (239, 68, 68, 230)
        outline = (236, 253, 245, 255) if label == 1 else (254, 226, 226, 255)
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=fill, outline=outline, width=3)
        sign = '+' if label == 1 else '-'
        draw.text((x - 4, y - 7), sign, fill=(255, 255, 255, 255))
    return np.array(pil)


def _draw_encoder_grid(img, enc_info):
    pil = Image.fromarray(img).convert('RGB')
    overlay = Image.new('RGBA', pil.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = pil.size
    grid = 16
    for x in np.linspace(0, w, grid + 1):
        draw.line([(float(x), 0), (float(x), h)], fill=(102, 242, 194, 90), width=1)
    for y in np.linspace(0, h, grid + 1):
        draw.line([(0, float(y)), (w, float(y))], fill=(102, 242, 194, 90), width=1)
    draw.rectangle([10, 10, min(w - 10, 360), 70], fill=(7, 10, 20, 176), outline=(102, 242, 194, 160))
    text = f"image embedding  original={enc_info.get('original_size')}  input={enc_info.get('input_size')}"
    draw.text((20, 30), text, fill=(255, 255, 255, 235))
    return np.array(Image.alpha_composite(pil.convert('RGBA'), overlay).convert('RGB'))


def _draw_prompt_tokens(prompt):
    width, height = 720, 320
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((24, 22), 'Prompt Encoder: 把用户操作变成可被解码器读取的 token', fill=(15, 23, 42))

    tokens = []
    for idx, point in enumerate(prompt['points']):
        label = prompt['labels'][idx] if idx < len(prompt['labels']) else 1
        tokens.append({
            'title': '正点 token' if label == 1 else '负点 token',
            'detail': f'({point[0]}, {point[1]})',
            'color': (22, 163, 74) if label == 1 else (220, 38, 38),
        })
    if prompt['box'] is not None:
        tokens.append({'title': '框 token', 'detail': str(prompt['box']), 'color': (37, 99, 235)})
    if not tokens:
        tokens.append({'title': '默认中心点', 'detail': 'sample fallback', 'color': (22, 163, 74)})

    start_x = 28
    for idx, token in enumerate(tokens[:6]):
        x = start_x + idx * 112
        y = 112 + (idx % 2) * 78
        draw.rounded_rectangle([x, y, x + 94, y + 52], radius=12, fill=token['color'], outline=(255, 255, 255), width=2)
        draw.text((x + 10, y + 10), token['title'], fill=(255, 255, 255))
        draw.text((x + 10, y + 30), token['detail'][:16], fill=(255, 255, 255))
        draw.line([x + 94, y + 26, width - 150, 160], fill=(100, 116, 139), width=2)

    draw.rounded_rectangle([width - 150, 128, width - 28, 192], radius=16, fill=(15, 23, 42), outline=(51, 65, 85), width=2)
    draw.text((width - 128, 150), 'Mask Decoder', fill=(255, 255, 255))
    draw.text((28, height - 54), '正点提高目标区域概率；负点降低背景或相邻物体概率；框约束搜索范围。', fill=(51, 65, 85))
    return np.array(img)


def _overlay_mask(img, mask, color=(0, 200, 80)):
    h, w = img.shape[:2]
    mask_bool = np.asarray(mask) > 128
    if mask_bool.shape[:2] != (h, w):
        mask_bool = np.array(
            Image.fromarray(mask_bool.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)
        ) > 128
    overlay = img.copy().astype(np.float32)
    alpha = 0.46
    for channel in range(3):
        overlay[mask_bool, channel] = overlay[mask_bool, channel] * (1.0 - alpha) + color[channel] * alpha
    return np.clip(overlay, 0, 255).astype(np.uint8)


def _make_multi_mask_strip(img, masks, scores, selected_idx):
    thumb_h = 168
    thumbs = []
    for idx, mask in enumerate(masks):
        overlay = _overlay_mask(img, mask, color=_PALETTE[idx % len(_PALETTE)])
        pil = Image.fromarray(overlay)
        scale = thumb_h / max(1, pil.height)
        thumb = pil.resize((max(1, int(pil.width * scale)), thumb_h), Image.BILINEAR)
        canvas = Image.new('RGB', (thumb.width, thumb_h + 46), (248, 250, 252))
        canvas.paste(thumb, (0, 46))
        draw = ImageDraw.Draw(canvas)
        tag = '已选' if idx == selected_idx else '候选'
        fill = (15, 118, 110) if idx == selected_idx else (51, 65, 85)
        draw.rounded_rectangle([6, 8, min(128, thumb.width - 6), 34], radius=8, fill=fill)
        draw.text((14, 14), f'{tag} {idx + 1}  IoU {scores[idx]:.3f}', fill=(255, 255, 255))
        thumbs.append(canvas)

    total_w = max(1, sum(t.width for t in thumbs) + max(0, len(thumbs) - 1) * 8)
    out = Image.new('RGB', (total_w, thumb_h + 46), (248, 250, 252))
    x = 0
    for thumb in thumbs:
        out.paste(thumb, (x, 0))
        x += thumb.width + 8
    return np.array(out)
