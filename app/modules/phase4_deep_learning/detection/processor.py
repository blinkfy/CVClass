"""Object detection with real Faster R-CNN and local NumPy fallback."""
import numpy as np

from app.modules.offline_teaching import _load_or_fixture
from app.utils.image_utils import ensure_gray, load_image_u8


_MODEL = None
_WEIGHTS = None
_DEVICE = None
_TORCH_AVAILABLE = None


def _check_torch():
    global _TORCH_AVAILABLE
    if _TORCH_AVAILABLE is None:
        try:
            import torch  # noqa: F401
            import torchvision  # noqa: F401
            _TORCH_AVAILABLE = True
        except ImportError:
            _TORCH_AVAILABLE = False
    return _TORCH_AVAILABLE


def _get_model():
    global _MODEL, _WEIGHTS, _DEVICE
    if _MODEL is None and _check_torch():
        import torch
        from torchvision.models.detection import (
            FasterRCNN_ResNet50_FPN_Weights,
            fasterrcnn_resnet50_fpn,
        )

        _DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        _WEIGHTS = FasterRCNN_ResNet50_FPN_Weights.DEFAULT
        _MODEL = fasterrcnn_resnet50_fpn(weights=_WEIGHTS)
        _MODEL.to(_DEVICE)
        _MODEL.eval()
    return _MODEL, _WEIGHTS, _DEVICE


def build_pipeline(image_path=None, score_threshold=0.5, **kwargs):
    """Run real Faster R-CNN by default; fall back to local heuristic if torch unavailable."""
    if not image_path:
        return _build_local_pipeline(image_path=image_path, **kwargs)

    if not _check_torch():
        return _build_local_pipeline(image_path=image_path, **kwargs)

    threshold = float(kwargs.get('score_threshold', kwargs.get('threshold', score_threshold)))
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=768)
    try:
        model, weights, device = _get_model()
    except Exception as exc:
        fallback = _build_local_pipeline(image_path=image_path, **kwargs)
        fallback['metrics']['pretrained_status'] = 'unavailable'
        fallback['metrics']['pretrained_error'] = f'{type(exc).__name__}: {exc}'
        return fallback

    import torch
    from torchvision.transforms.functional import to_tensor

    tensor = to_tensor(img_u8).to(device)
    with torch.no_grad():
        output = model([tensor])[0]

    scores = output['scores'].detach().cpu().numpy()
    boxes = output['boxes'].detach().cpu().numpy()
    labels = output['labels'].detach().cpu().numpy()
    keep = np.where(scores >= threshold)[0]

    categories = weights.meta.get('categories', [])
    detections = []
    for idx in keep[:30]:
        label_idx = int(labels[idx])
        label = categories[label_idx] if label_idx < len(categories) else str(label_idx)
        detections.append({
            'box': [round(float(v), 1) for v in boxes[idx].tolist()],
            'label': label,
            'score': round(float(scores[idx]), 4),
        })

    result_vis = _draw_boxes(img_u8, detections)
    score_chart = _score_chart(detections, title='检测置信度')
    score_chart_data = _score_chart_data(detections, title='检测置信度', threshold=threshold)
    overlay_boxes = _public_boxes(detections)
    return {
        'steps': [
            {'id': 'original', 'name': '输入图像', 'image': img_u8,
             'visual_kind': 'image',
             'explanation': '图像送入 torchvision 的 Faster R-CNN ResNet50-FPN COCO 预训练权重。'},
            {'id': 'detections', 'name': f'真实检测结果（{len(detections)} 个）', 'image': result_vis,
             'visual_kind': 'overlay_image',
             'overlay_scope': 'frame',
             'overlays': {'boxes': overlay_boxes},
             'data': {'detections': overlay_boxes},
             'explanation': f'保留模型置信度不低于 {threshold:.2f} 的框；这里不会注入合成检测结果。'},
            {'id': 'scores', 'name': '置信度排序', 'image': score_chart,
             'visual_kind': 'chart',
             'overlay_scope': 'none',
             'chart': score_chart_data,
             'explanation': '柱状图来自模型输出分数，前端会用结构化数据重新绘制高清图表。'},
        ],
        'metrics': {
            'status': 'pretrained_model',
            'model': 'fasterrcnn_resnet50_fpn',
            'weights': str(weights),
            'backend': 'torchvision',
            'device': str(device),
            'threshold': threshold,
            'detections': len(detections),
        },
        'detections': detections,
    }


def _build_local_pipeline(image_path=None, **kwargs):
    threshold = float(kwargs.get('score_threshold', kwargs.get('threshold', 0.32)))
    img_u8 = _load_or_fixture(image_path=image_path)
    gray = ensure_gray(img_u8)
    candidates, score_map = _local_candidates(gray)
    detections = [d for d in candidates if d['score'] >= threshold][:12]
    result_vis = _draw_boxes(img_u8, detections)
    score_chart = _score_chart(detections, title='候选区域置信度')
    score_chart_data = _score_chart_data(detections, title='候选区域置信度', threshold=threshold)
    heat = _heatmap(score_map)
    overlay_boxes = _public_boxes(detections)
    return {
        'steps': [
            {'id': 'input', 'name': '输入图像', 'image': img_u8,
             'visual_kind': 'image',
             'explanation': '本地教学检测器从图像对比度、边缘和显著区域开始寻找候选目标。'},
            {'id': 'objectness', 'name': '目标性热力图', 'image': heat,
             'visual_kind': 'image',
             'explanation': '越亮的位置说明边缘或局部对比越强，更可能成为候选目标区域。'},
            {'id': 'detections', 'name': f'NMS 后候选框（{len(detections)} 个）', 'image': result_vis,
             'visual_kind': 'overlay_image',
             'overlay_scope': 'frame',
             'overlays': {'boxes': overlay_boxes},
             'data': {'detections': overlay_boxes},
             'explanation': '候选框先按分数排序，再用非极大值抑制去掉高度重叠的重复框。'},
            {'id': 'scores', 'name': '候选框置信度', 'image': score_chart,
             'visual_kind': 'chart',
             'overlay_scope': 'none',
             'chart': score_chart_data,
             'explanation': '这里是离线教学检测器的候选分数。前端用结构化数据重绘柱状图，兼容图片只作为旧页面兜底。'},
        ],
        'metrics': {
            'status': 'local_teaching_fallback',
            'model': 'local_edge_objectness_detector',
            'backend': 'NumPy/PIL',
            'pretrained_model': 'fasterrcnn_resnet50_fpn',
            'pretrained_enabled': False,
            'threshold': threshold,
            'detections': len(detections),
        },
        'detections': detections,
    }


def _local_candidates(gray):
    g = gray.astype(np.float32)
    gy, gx = np.gradient(g)
    mag = np.sqrt(gx * gx + gy * gy)
    mag = mag / max(float(mag.max()), 1e-6)
    h, w = gray.shape
    cell = max(18, min(h, w) // 5)
    stride = max(8, cell // 2)
    boxes = []
    for y0 in range(0, h, stride):
        for x0 in range(0, w, stride):
            y1 = min(h, y0 + cell)
            x1 = min(w, x0 + cell)
            if y1 - y0 < 12 or x1 - x0 < 12:
                continue
            edge_score = float(mag[y0:y1, x0:x1].mean())
            contrast = float(g[y0:y1, x0:x1].std() / 96.0)
            score = float(np.clip(edge_score * 1.8 + contrast * 0.5, 0, 1))
            if score >= 0.18:
                boxes.append({'box': [x0, y0, x1, y1], 'label': 'salient region', 'score': round(score, 4)})
    boxes.sort(key=lambda d: d['score'], reverse=True)
    keep = []
    for det in boxes:
        if all(_box_iou(det['box'], old['box']) < 0.35 for old in keep):
            keep.append(det)
    return keep, mag


def _box_iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a = max(1, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(1, (bx2 - bx1) * (by2 - by1))
    return inter / float(area_a + area_b - inter)


def _draw_boxes(img, detections):
    vis = img.copy()
    h, w = vis.shape[:2]
    colors = np.array([
        [239, 68, 68], [34, 197, 94], [59, 130, 246],
        [217, 119, 6], [124, 58, 237], [20, 184, 166],
    ], dtype=np.uint8)
    for i, det in enumerate(detections):
        x1, y1, x2, y2 = [int(round(v)) for v in det['box']]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        col = colors[i % len(colors)]
        vis[y1:y1 + 3, x1:x2] = col
        vis[max(y2 - 2, y1):y2 + 1, x1:x2] = col
        vis[y1:y2, x1:x1 + 3] = col
        vis[y1:y2, max(x2 - 2, x1):x2 + 1] = col
    return vis


def _score_chart(detections, title='检测置信度', width=640, height=320):
    from PIL import Image, ImageDraw
    canvas = Image.new('RGB', (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 12), title, fill=(226, 232, 240))
    if not detections:
        draw.text((20, height // 2 - 8), '阈值以上暂无检测结果', fill=(226, 232, 240))
        return np.array(canvas)
    rows = detections[:10]
    bar_h = max(18, (height - 64) // len(rows) - 6)
    for i, det in enumerate(rows):
        y = 46 + i * (bar_h + 6)
        score = float(det['score'])
        bar_w = int(score * (width - 220))
        draw.rectangle((180, y, 180 + bar_w, y + bar_h), fill=(59, 130, 246))
        draw.text((12, y + 2), f"{det['label']} {score:.2f}", fill=(226, 232, 240))
    return np.array(canvas)


def _score_chart_data(detections, title='检测置信度', threshold=None):
    return {
        'type': 'bar',
        'title': title,
        'subtitle': '按检测分数从高到低排序，红线表示当前保留阈值。',
        'xLabel': '候选目标',
        'yLabel': '置信度',
        'valueFormat': 'percent',
        'threshold': round(float(threshold), 4) if threshold is not None else None,
        'items': [
            {
                'label': det.get('label', f'目标 {idx + 1}'),
                'value': round(float(det.get('score', 0)), 4),
                'box': [round(float(v), 1) for v in det.get('box', [])[:4]],
            }
            for idx, det in enumerate(detections[:12])
        ],
    }


def _public_boxes(detections):
    return [
        {
            'box': [round(float(v), 1) for v in det.get('box', [])[:4]],
            'label': det.get('label', '目标'),
            'score': round(float(det.get('score', 0)), 4),
        }
        for det in detections
    ]


def _heatmap(score):
    s = np.clip(np.asarray(score, dtype=np.float32), 0, 1)
    return np.stack([
        (s * 255).astype(np.uint8),
        ((1 - np.abs(s - 0.5) * 2) * 210).astype(np.uint8),
        ((1 - s) * 255).astype(np.uint8),
    ], axis=-1)
