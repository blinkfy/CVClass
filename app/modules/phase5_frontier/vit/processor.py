"""ViT teaching pipeline with real pretrained attention maps."""
from __future__ import annotations

import numpy as np

from app.modules.phase5_frontier.vit.algorithm import (
    attention_to_heatmap,
    extract_attention_maps,
    get_patch_grid,
    get_position_embedding_heatmap,
)
from app.utils.image_utils import load_image_u8


def build_pipeline(image_path=None, layer=12, head_idx=1, selected_patch=0, **kwargs):
    if not image_path:
        return {
            'error': 'ViT 需要输入图像才能运行真实预训练模型。',
            'steps': [],
            'metrics': {'status': 'missing_input'},
        }

    try:
        img_u8 = load_image_u8(image_path, mode='rgb', max_side=512)
        result = extract_attention_maps(img_u8)
    except Exception as exc:
        return {
            'error': f'ViT 推理失败：{exc}',
            'steps': [],
            'metrics': {'status': 'model_not_available', 'error_type': type(exc).__name__},
        }

    num_layers = int(result['num_layers'])
    num_heads = int(result['num_heads'])
    grid_size = int(np.sqrt(result['num_patches']))
    layer_idx = int(np.clip(int(kwargs.get('layer', layer)) - 1, 0, num_layers - 1))
    head = int(np.clip(int(kwargs.get('head_idx', head_idx)) - 1, 0, num_heads - 1))
    patch = int(np.clip(int(kwargs.get('selected_patch', selected_patch)), 0, result['num_patches'] - 1))

    patch_grid = get_patch_grid(img_u8)
    pos_heatmap = _matrix_to_heatmap_image(get_position_embedding_heatmap())
    cls_attn = attention_to_heatmap(result['attentions'][layer_idx], head_idx=head, patch_grid_size=grid_size)
    patch_attn = attention_to_heatmap(
        result['attentions'][layer_idx],
        head_idx=head,
        patch_grid_size=grid_size,
        query_patch=patch,
    )
    cls_overlay = _overlay_attention_on_image(img_u8, cls_attn)
    patch_overlay = _overlay_attention_on_image(img_u8, patch_attn, selected_patch=patch, grid_size=grid_size)
    preds = result['predictions']

    steps = [
        {
            'id': 'original',
            'name': '输入图像',
            'image': img_u8,
            'formula': 'I in R^{H x W x 3}',
            'explanation': 'ViT 接收整张 RGB 图像。和 CNN 不同，它马上会把图像拆成固定大小的小块，把每个小块当成视觉 token。',
            'data': {'height': int(img_u8.shape[0]), 'width': int(img_u8.shape[1])},
        },
        {
            'id': 'patches',
            'name': 'Patch 切分',
            'image': patch_grid,
            'formula': 'x_p^i = flatten(patch_i)',
            'explanation': f'图像被切成 {grid_size} x {grid_size} = {result["num_patches"]} 个 16x16 patch。每个 patch 展平后线性投影成一个 token。',
            'data': {'grid_size': grid_size, 'patch_size': 16, 'selected_patch': patch},
        },
        {
            'id': 'pos_embed',
            'name': '位置编码相似度',
            'image': pos_heatmap,
            'visual_kind': 'image',
            'formula': 'z_i = E x_p^i + e_pos^i',
            'explanation': 'Transformer 本身不知道 token 在图像中的位置，因此 ViT 给每个 patch token 加上位置编码。图中展示位置编码之间的余弦相似度。',
        },
        {
            'id': 'cls_attention',
            'name': f'CLS token 注意力：第 {layer_idx + 1} 层 / 第 {head + 1} 头',
            'image': _heatmap_to_image(cls_attn),
            'formula': 'A = softmax(QK^T / sqrt(d))',
            'explanation': 'CLS token 是最终分类用的全局 token。它对哪些 patch 注意力更高，通常可以作为分类证据的线索。',
            'data': {'layer': layer_idx + 1, 'head': head + 1, 'view': 'CLS token'},
        },
        {
            'id': 'patch_attention',
            'name': f'Patch {patch} 的注意力视角',
            'image': _heatmap_to_image(patch_attn),
            'formula': 'A_{q,*}=softmax(q K^T / sqrt(d))',
            'explanation': '选择某个 patch 后，可以观察这个 patch token 关注图像中哪些区域。拖动页面上的 Patch 编号会重新让后端抽取对应注意力。',
            'data': {'selected_patch': patch, 'layer': layer_idx + 1, 'head': head + 1},
        },
        {
            'id': 'overlay',
            'name': '注意力叠加到原图',
            'image': patch_overlay,
            'formula': 'p(y|I)=softmax(head(CLS))',
            'explanation': '热力图叠加到原图后，可以把 token 注意力和真实图像区域对应起来。黄色框标出当前被解释的 patch。',
        },
        {
            'id': 'predictions',
            'name': f'ImageNet Top-5 分类：{preds[0]["label"] if preds else "N/A"}',
            'image': _prediction_chart(preds),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _prediction_chart_data(preds),
            'formula': 'p_c = softmax(logits)_c',
            'explanation': '最终分类来自真实 ViT 预训练模型的 logits。注意力只是解释线索，真正的类别概率来自分类头。',
            'data': {'top5': preds},
        },
    ]

    return {
        'steps': steps,
        'outputs': {
            'predictions': preds,
            'selected_layer': layer_idx + 1,
            'selected_head': head + 1,
            'selected_patch': patch,
        },
        'metrics': {
            'status': 'pretrained_model',
            'backend': 'transformers',
            'model': 'google/vit-base-patch16-224',
            'layers': num_layers,
            'heads': num_heads,
            'patches': result['num_patches'],
            'layer': layer_idx + 1,
            'head_idx': head + 1,
            'selected_patch': patch,
            'top1': preds[0]['label'] if preds else 'N/A',
            'top1_prob': f"{preds[0]['probability'] * 100:.1f}%" if preds else 'N/A',
        },
    }


def _matrix_to_heatmap_image(matrix):
    m = np.asarray(matrix, dtype=np.float64)
    m = np.clip(m, 0, 1)
    scale = max(1, 420 // max(m.shape))
    big = np.kron(m, np.ones((scale, scale)))
    return _color_heat(big)


def _heatmap_to_image(heatmap_2d):
    hm = np.asarray(heatmap_2d, dtype=np.float64)
    hm = np.clip(hm, 0, 1)
    scale = max(1, 420 // max(hm.shape))
    return _color_heat(np.kron(hm, np.ones((scale, scale))))


def _color_heat(values):
    v = np.clip(values, 0, 1)
    r = (v * 255).astype(np.uint8)
    g = ((1 - np.abs(v - 0.5) * 2) * 210).astype(np.uint8)
    b = ((1 - v) * 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _overlay_attention_on_image(img, heatmap_2d, selected_patch=None, grid_size=14):
    from PIL import Image, ImageDraw

    h, w = img.shape[:2]
    hm = np.asarray(heatmap_2d, dtype=np.float64)
    hm_img = np.array(Image.fromarray((np.clip(hm, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR))
    heat = _color_heat(hm_img.astype(np.float32) / 255.0)
    out = np.clip(img.astype(np.float32) * 0.52 + heat.astype(np.float32) * 0.48, 0, 255).astype(np.uint8)
    if selected_patch is not None:
        pil = Image.fromarray(out)
        draw = ImageDraw.Draw(pil)
        col = selected_patch % grid_size
        row = selected_patch // grid_size
        x0 = int(col * w / grid_size)
        y0 = int(row * h / grid_size)
        x1 = int((col + 1) * w / grid_size)
        y1 = int((row + 1) * h / grid_size)
        draw.rectangle((x0, y0, x1, y1), outline=(250, 204, 21), width=4)
        out = np.array(pil)
    return out


def _prediction_chart(preds, width=640, height=300):
    from PIL import Image, ImageDraw

    canvas = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 14), 'ViT ImageNet Top-5 概率', fill=(15, 23, 42))
    if not preds:
        return np.array(canvas)
    for i, pred in enumerate(preds[:5]):
        y = 56 + i * 42
        p = float(pred.get('probability', 0))
        draw.text((18, y + 3), str(pred.get('label', 'class'))[:32], fill=(51, 65, 85))
        draw.rectangle((260, y, width - 34, y + 18), outline=(203, 213, 225))
        draw.rectangle((260, y, 260 + int((width - 294) * p), y + 18), fill=(37, 99, 235))
        draw.text((width - 92, y + 2), f'{p * 100:.1f}%', fill=(15, 23, 42))
    return np.array(canvas)


def _prediction_chart_data(preds):
    return {
        'type': 'probability',
        'title': 'ImageNet Top-5 概率',
        'xLabel': '类别',
        'yLabel': '概率',
        'valueFormat': 'percent',
        'items': [
            {
                'label': pred.get('label', f'类别 {idx + 1}'),
                'value': round(float(pred.get('probability', 0)), 6),
            }
            for idx, pred in enumerate((preds or [])[:5])
        ],
    }
