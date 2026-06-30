"""DETR teaching pipeline with real object queries and attention."""
from __future__ import annotations

import numpy as np

from app.modules.phase5_frontier.detr.algorithm import detect_objects, visualize_query_attention
from app.utils.image_utils import load_image_u8


def build_pipeline(image_path=None, threshold=0.5, query_idx=0, head_idx=0, **kwargs):
    th = float(kwargs.get('threshold', threshold))
    q_requested = int(kwargs.get('query_idx', query_idx))
    h_requested = int(kwargs.get('head_idx', head_idx))
    if not image_path:
        return {
            'error': 'DETR 需要输入图像才能运行真实预训练检测模型。',
            'steps': [],
            'metrics': {'status': 'missing_input'},
        }

    try:
        img_u8 = load_image_u8(image_path, mode='rgb', max_side=768)
        result = detect_objects(img_u8, threshold=th)
    except Exception as exc:
        return {
            'error': f'DETR 推理失败：{exc}',
            'steps': [],
            'metrics': {'status': 'model_not_available', 'error_type': type(exc).__name__},
        }

    detections = result.get('detections', [])
    queries = result.get('query_predictions', [])
    num_queries = int(result.get('num_queries', 100))
    q_selected = int(np.clip(q_requested, 0, max(0, num_queries - 1)))
    selected_query = _closest_query(queries, q_selected)
    cross = result.get('cross_attentions')
    num_heads = int((cross or {}).get('num_heads', 8))
    head = int(np.clip(h_requested, 0, max(0, num_heads - 1)))

    query_overlay = None
    if cross is not None:
        query_hm = visualize_query_attention(cross, query_idx=q_selected, head_idx=head)
        query_overlay = _overlay_heatmap_on_image(img_u8, query_hm) if query_hm is not None else None

    steps = [
        {
            'id': 'input',
            'name': '输入图像',
            'image': img_u8,
            'formula': 'I in R^{H x W x 3}',
            'explanation': 'DETR 把目标检测看成集合预测：整张图只前向一次，固定数量的 object query 直接输出类别和边界框。',
            'data': {'height': int(img_u8.shape[0]), 'width': int(img_u8.shape[1]), 'queries': num_queries},
        },
        {
            'id': 'preprocess',
            'name': '模型预处理张量',
            'image': _tensor_preview(result.get('preprocess_tensor')),
            'formula': 'x = normalize(resize(I))',
            'explanation': '输入图像会被 DETR image processor 转成模型需要的张量。这里显示的是真实进入模型前的数值预览。',
            'data': {'tensor_shape': list(np.asarray(result.get('preprocess_tensor')).shape) if result.get('preprocess_tensor') is not None else []},
        },
        {
            'id': 'query_candidates',
            'name': 'Object Query 原始候选',
            'image': _draw_query_predictions(img_u8, queries),
            'formula': '(class_i, box_i)=Head(q_i), i=1..100',
            'explanation': '每个 object query 都像在问图像：“我负责的物体在哪里？”图中展示真实 DETR 输出分数最高的一批 query 候选框。',
            'data': {'top_queries': queries, 'selected_query': selected_query},
        },
        {
            'id': 'query_scores',
            'name': 'Query 分数过滤',
            'image': _query_score_chart(queries, threshold=th),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _query_score_chart_data(queries, threshold=th),
            'formula': 'score_i=(1-p_i(no-object)) max_c p_i(c)',
            'explanation': '大部分 query 会学成 no-object。阈值越高，留下的 query 越少，但通常更可靠。',
            'data': {'threshold': th, 'top_queries': queries},
        },
    ]

    if query_overlay is not None:
        steps.append({
            'id': 'cross_attention',
            'name': f'Query {q_selected} 的交叉注意力',
            'image': query_overlay,
            'formula': 'CrossAttn(q_i, image_tokens)',
            'explanation': '交叉注意力说明当前 query 在 decoder 中看向了图像哪些区域。切换 query/head 后，后端会重新抽取真实注意力热力图。',
            'data': {'query_idx': q_selected, 'head_idx': head, 'selected_query': selected_query},
        })

    steps.extend([
        {
            'id': 'detections',
            'name': f'阈值后检测结果（{len(detections)} 个）',
            'image': _draw_detection_boxes(img_u8, detections),
            'visual_kind': 'overlay_image',
            'overlays': {'boxes': detections[:20]},
            'formula': 'keep_i = score_i >= tau',
            'explanation': f'保留置信度不低于 {th:.2f} 的真实 DETR 输出，并把类别、分数和边界框叠加到原图。',
            'data': {'detections': detections[:20]},
        },
        {
            'id': 'matching_principle',
            'name': '集合预测与匈牙利匹配',
            'image': _matching_card(queries, detections),
            'formula': 'min_perm sum_i cost(y_i, y_hat_{perm(i)})',
            'explanation': '训练时 DETR 用匈牙利算法把预测集合和真实目标一一匹配，因此推理时不再依赖传统密集 anchor 后处理来定义目标集合。',
            'data': {'num_queries': num_queries, 'kept_detections': len(detections)},
        },
    ])

    return {
        'steps': steps,
        'outputs': {
            'detections': detections,
            'top_queries': queries,
            'selected_query': selected_query,
        },
        'metrics': {
            'status': 'pretrained_model',
            'backend': 'transformers',
            'model': 'facebook/detr-resnet-50',
            'num_detections': len(detections),
            'num_queries': num_queries,
            'threshold': th,
            'query_idx': q_selected,
            'head_idx': head,
        },
        'detections': detections,
    }


def _closest_query(queries, query_idx):
    if not queries:
        return {'query': query_idx}
    for item in queries:
        if int(item.get('query', -1)) == int(query_idx):
            return item
    return min(queries, key=lambda item: abs(int(item.get('query', 0)) - int(query_idx)))


def _tensor_preview(tensor):
    if tensor is None:
        return np.zeros((224, 224, 3), dtype=np.uint8) + 240
    arr = np.asarray(tensor, dtype=np.float32)
    if arr.ndim != 3:
        return np.zeros((224, 224, 3), dtype=np.uint8) + 240
    arr = np.transpose(arr, (1, 2, 0))
    lo = np.percentile(arr, 1, axis=(0, 1), keepdims=True)
    hi = np.percentile(arr, 99, axis=(0, 1), keepdims=True)
    vis = (arr - lo) / np.maximum(hi - lo, 1e-8)
    return np.clip(vis * 255, 0, 255).astype(np.uint8)


def _cxcywh_to_xyxy(box, w, h):
    cx, cy, bw, bh = [float(v) for v in box]
    return [
        (cx - bw / 2) * w,
        (cy - bh / 2) * h,
        (cx + bw / 2) * w,
        (cy + bh / 2) * h,
    ]


def _draw_box(out, box, color, width=3):
    h, w = out.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return
    out[y1:y1 + width, x1:x2] = color
    out[max(y1, y2 - width + 1):y2 + 1, x1:x2] = color
    out[y1:y2, x1:x1 + width] = color
    out[y1:y2, max(x1, x2 - width + 1):x2 + 1] = color


def _draw_detection_boxes(img, detections):
    out = img.copy()
    colors = [(239, 68, 68), (34, 197, 94), (59, 130, 246), (217, 119, 6), (124, 58, 237)]
    for i, det in enumerate(detections):
        _draw_box(out, det['box'], colors[i % len(colors)], width=3)
    return out


def _draw_query_predictions(img, query_predictions):
    out = img.copy()
    h, w = out.shape[:2]
    colors = [(234, 88, 12), (37, 99, 235), (22, 163, 74), (147, 51, 234), (220, 38, 38)]
    for i, q in enumerate(query_predictions[:14]):
        box = _cxcywh_to_xyxy(q.get('box_cxcywh', [0, 0, 0, 0]), w, h)
        _draw_box(out, box, colors[i % len(colors)], width=2)
    return out


def _query_score_chart(query_predictions, threshold=0.5, width=640, height=300):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 12), 'Object Query 过滤前分数', fill=(15, 23, 42))
    if not query_predictions:
        draw.text((18, 60), '没有返回 query 数据。', fill=(100, 116, 139))
        return np.array(img)
    max_score = max(float(q.get('score', 0)) for q in query_predictions) or 1.0
    bar_h = 17
    for i, q in enumerate(query_predictions[:10]):
        y = 50 + i * 22
        score = float(q.get('score', 0))
        bw = int(score / max_score * (width - 250))
        color = (37, 99, 235) if score >= threshold else (148, 163, 184)
        draw.rectangle((160, y, 160 + bw, y + bar_h), fill=color)
        draw.text((18, y), f"q{q.get('query')} {str(q.get('label'))[:15]}", fill=(51, 65, 85))
        draw.text((170 + bw, y), f'{score:.3f}', fill=(71, 85, 105))
    tx = 160 + int((threshold / max(max_score, 1e-8)) * (width - 250))
    tx = max(160, min(width - 90, tx))
    draw.line((tx, 44, tx, height - 28), fill=(239, 68, 68), width=2)
    draw.text((tx + 4, height - 24), f'阈值={threshold:.2f}', fill=(239, 68, 68))
    return np.array(img)


def _query_score_chart_data(query_predictions, threshold=0.5):
    return {
        'type': 'bar',
        'title': 'Object Query 分数过滤',
        'xLabel': 'Query',
        'yLabel': '分数',
        'threshold': round(float(threshold), 4),
        'items': [
            {
                'label': f"q{q.get('query')} {str(q.get('label', '目标'))[:10]}",
                'value': round(float(q.get('score', 0)), 4),
                'kept': float(q.get('score', 0)) >= float(threshold),
            }
            for q in (query_predictions or [])[:12]
        ],
    }


def _overlay_heatmap_on_image(img, heatmap_2d):
    from PIL import Image

    h, w = img.shape[:2]
    hm = np.asarray(heatmap_2d, dtype=np.float64)
    hm = np.clip(hm, 0, 1)
    hm_img = np.array(Image.fromarray((hm * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR))
    overlay = np.zeros((h, w, 3), dtype=np.uint8)
    hm_f = hm_img.astype(np.float32) / 255.0
    overlay[:, :, 0] = (hm_f * 255).astype(np.uint8)
    overlay[:, :, 1] = (hm_f * 120).astype(np.uint8)
    return np.clip(img.astype(np.float32) * 0.45 + overlay.astype(np.float32) * 0.55, 0, 255).astype(np.uint8)


def _matching_card(queries, detections, width=640, height=300):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 12), '集合预测：query 槽位 -> 最终目标', fill=(15, 23, 42))
    left_x, right_x = 88, 470
    shown_q = queries[:8]
    shown_d = detections[:8]
    for i, q in enumerate(shown_q):
        y = 54 + i * 26
        keep = i < len(shown_d)
        draw.ellipse((left_x - 9, y - 9, left_x + 9, y + 9), fill=(37, 99, 235) if keep else (203, 213, 225))
        draw.text((left_x + 18, y - 8), f"q{q.get('query')} {float(q.get('score', 0)):.2f}", fill=(51, 65, 85))
        if keep:
            yy = 54 + i * 26
            draw.line((left_x + 90, y, right_x - 18, yy), fill=(245, 158, 11), width=2)
    for i, det in enumerate(shown_d):
        y = 54 + i * 26
        draw.rectangle((right_x - 10, y - 10, right_x + 10, y + 10), fill=(34, 197, 94))
        draw.text((right_x + 18, y - 8), str(det.get('label', 'object'))[:16], fill=(51, 65, 85))
    draw.text((32, height - 34), '训练时用匈牙利匹配建立一对一监督；推理时高分 query 形成最终集合。', fill=(71, 85, 105))
    return np.array(img)
