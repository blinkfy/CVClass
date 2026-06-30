"""Instance segmentation with real Mask R-CNN and local NumPy fallback."""
import numpy as np

from app.modules.offline_teaching import _load_or_fixture
from app.utils.image_utils import ensure_gray, load_image_u8, to_base64


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
        from torchvision.models.detection import MaskRCNN_ResNet50_FPN_Weights, maskrcnn_resnet50_fpn

        _DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        _WEIGHTS = MaskRCNN_ResNet50_FPN_Weights.DEFAULT
        _MODEL = maskrcnn_resnet50_fpn(weights=_WEIGHTS)
        _MODEL.to(_DEVICE)
        _MODEL.eval()
    return _MODEL, _WEIGHTS, _DEVICE


def build_pipeline(image_path=None, score_threshold=0.5, mask_threshold=0.5, **kwargs):
    """Run real Mask R-CNN by default; fall back to local heuristic if torch unavailable."""
    if not image_path:
        return _build_local_pipeline(image_path=image_path, **kwargs)

    if not _check_torch():
        return _build_local_pipeline(image_path=image_path, **kwargs)

    score_th = float(kwargs.get('score_threshold', kwargs.get('threshold', score_threshold)))
    mask_th = float(kwargs.get('mask_threshold', mask_threshold))
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
    masks = output['masks'].detach().cpu().numpy()[:, 0]
    keep = np.where(scores >= score_th)[0][:20]

    categories = weights.meta.get('categories', [])
    instances = []
    for idx in keep:
        label_idx = int(labels[idx])
        label = categories[label_idx] if label_idx < len(categories) else str(label_idx)
        instances.append({
            'box': [round(float(v), 1) for v in boxes[idx].tolist()],
            'label': label,
            'score': round(float(scores[idx]), 4),
            'mask': (masks[idx] >= mask_th),
        })

    return _package_result(
        img_u8,
        instances,
        status='pretrained_model',
        model='maskrcnn_resnet50_fpn',
        backend='torchvision',
        extra_metrics={
            'weights': str(weights),
            'device': str(device),
            'threshold': score_th,
            'mask_threshold': mask_th,
        },
        explanations=[
            '图像送入 torchvision 的 Mask R-CNN ResNet50-FPN COCO 预训练权重。',
            f'保留置信度不低于 {score_th:.2f} 的实例框。',
            f'掩码来自 Mask R-CNN 的 mask 分支，并使用 {mask_th:.2f} 作为二值化阈值。',
            '每个裁剪图显示一个预测实例内部的原始像素。',
        ],
    )


def _build_local_pipeline(image_path=None, **kwargs):
    score_th = float(kwargs.get('score_threshold', kwargs.get('threshold', 0.28)))
    count = int(kwargs.get('num_instances', 4))
    img_u8 = _load_or_fixture(image_path=image_path)
    instances = _local_instances(img_u8, score_threshold=score_th, max_instances=count)
    return _package_result(
        img_u8,
        instances,
        status='local_teaching_fallback',
        model='local_proposal_mask_segmenter',
        backend='NumPy/PIL',
        extra_metrics={
            'pretrained_model': 'maskrcnn_resnet50_fpn',
            'pretrained_enabled': False,
            'threshold': score_th,
        },
        explanations=[
            '本地实例分割先寻找显著的候选目标区域。',
            '候选框表示不同物体实例可能出现的位置。',
            '每个框内部再根据颜色和对比度生成独立 mask，而不是整张图共用一张语义类别图。',
            '裁剪条强调实例分割是把物体一个一个分开。',
        ],
    )


def _local_instances(img, score_threshold=0.28, max_instances=4):
    from app.modules.phase4_deep_learning.detection.processor import _local_candidates

    gray = ensure_gray(img)
    candidates, _ = _local_candidates(gray)
    selected = [d for d in candidates if d['score'] >= score_threshold][:max(1, max_instances)]
    instances = []
    for i, det in enumerate(selected):
        x1, y1, x2, y2 = [int(v) for v in det['box']]
        patch = img[y1:y2, x1:x2]
        if patch.size == 0:
            continue
        center_color = patch.reshape(-1, 3).mean(axis=0)
        dist = np.sqrt(np.sum((patch.astype(np.float32) - center_color[None, None, :]) ** 2, axis=2))
        edge = _edge_norm(ensure_gray(patch))
        color_mask = dist <= max(18.0, np.percentile(dist, 58))
        mask_patch = color_mask | (edge > np.percentile(edge, 72))
        mask = np.zeros(gray.shape, dtype=bool)
        mask[y1:y2, x1:x2] = _clean_mask(mask_patch)
        if mask.sum() < 12:
            mask[y1:y2, x1:x2] = True
        instances.append({
            'box': [x1, y1, x2, y2],
            'label': f'实例 {i + 1}',
            'score': det['score'],
            'mask': mask,
        })
    return instances


def _edge_norm(gray):
    g = gray.astype(np.float32)
    gy, gx = np.gradient(g)
    edge = np.sqrt(gx * gx + gy * gy)
    return edge / max(float(edge.max()), 1e-6)


def _clean_mask(mask):
    mask = np.asarray(mask, dtype=bool)
    padded = np.pad(mask, 1, mode='edge')
    votes = np.zeros(mask.shape, dtype=np.uint8)
    for dy in range(3):
        for dx in range(3):
            votes += padded[dy:dy + mask.shape[0], dx:dx + mask.shape[1]]
    return votes >= 4


def _package_result(img_u8, instances, status, model, backend, extra_metrics, explanations):
    box_vis = _draw_boxes(img_u8, instances)
    mask_vis = _overlay_masks(img_u8, instances)
    detail = _instance_strip(img_u8, instances)
    public_instances = [{k: v for k, v in inst.items() if k != 'mask'} for inst in instances]
    overlay_instances = _overlay_instances(instances)
    instance_chart = _instance_chart(instances, img_u8.shape[0] * img_u8.shape[1])
    metrics = {
        'status': status,
        'model': model,
        'backend': backend,
        'instances': len(instances),
    }
    metrics.update(extra_metrics)
    return {
        'steps': [
            {'id': 'original', 'name': '输入图像', 'image': img_u8,
             'visual_kind': 'image',
             'explanation': explanations[0]},
            {'id': 'boxes', 'name': f'实例框（{len(instances)} 个）', 'image': box_vis,
             'visual_kind': 'overlay_image',
             'overlay_scope': 'frame',
             'overlays': {'boxes': overlay_instances},
             'data': {'instances': public_instances},
             'explanation': explanations[1]},
            {'id': 'masks', 'name': '逐实例掩码', 'image': mask_vis,
             'visual_kind': 'overlay_image',
             'overlay_scope': 'frame',
             'overlays': {'masks': overlay_instances, 'boxes': overlay_instances},
             'data': {'instances': public_instances},
             'explanation': explanations[2]},
            {'id': 'score_area', 'name': '实例分数与面积', 'image': _instance_chart_image(instance_chart),
             'visual_kind': 'chart',
             'overlay_scope': 'none',
             'chart': instance_chart,
             'explanation': '柱状图展示每个实例的置信度，并附带 mask 面积占比；前端根据结构化数据高清绘制。'},
            {'id': 'detail', 'name': '实例裁剪', 'image': detail,
             'visual_kind': 'image',
             'explanation': explanations[3]},
        ],
        'metrics': metrics,
        'instances': public_instances,
    }


def _draw_boxes(img, instances):
    vis = img.copy()
    h, w = vis.shape[:2]
    colors = _colors()
    for i, inst in enumerate(instances):
        x1, y1, x2, y2 = [int(round(v)) for v in inst['box']]
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


def _overlay_masks(img, instances):
    out = img.astype(np.float32).copy()
    colors = _colors().astype(np.float32)
    for i, inst in enumerate(instances):
        mask = np.asarray(inst['mask'], dtype=bool)
        if mask.shape[:2] != img.shape[:2]:
            from PIL import Image
            mask = np.array(Image.fromarray(mask.astype(np.uint8) * 255).resize((img.shape[1], img.shape[0]), Image.NEAREST)) > 0
        col = colors[i % len(colors)]
        out[mask] = out[mask] * 0.52 + col * 0.48
    return np.clip(out, 0, 255).astype(np.uint8)


def _instance_strip(img, instances):
    from PIL import Image
    if not instances:
        canvas = Image.new('RGB', (420, 120), (15, 23, 42))
        return np.array(canvas)
    thumbs = []
    for inst in instances[:8]:
        x1, y1, x2, y2 = [int(round(v)) for v in inst['box']]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)
        if x2 <= x1 or y2 <= y1:
            continue
        crop = img[y1:y2, x1:x2]
        ratio = 120 / max(1, crop.shape[0])
        pil = Image.fromarray(crop).resize((max(1, int(crop.shape[1] * ratio)), 120), Image.LANCZOS)
        thumbs.append(np.array(pil))
    if not thumbs:
        return np.zeros((120, 240, 3), dtype=np.uint8)
    h = max(t.shape[0] for t in thumbs)
    w = sum(t.shape[1] for t in thumbs) + 6 * (len(thumbs) - 1)
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    x = 0
    for t in thumbs:
        canvas[:t.shape[0], x:x + t.shape[1]] = t
        x += t.shape[1] + 6
    return canvas


def _colors():
    return np.array([
        [239, 68, 68], [34, 197, 94], [59, 130, 246],
        [217, 119, 6], [124, 58, 237], [20, 184, 166],
    ], dtype=np.uint8)


def _overlay_instances(instances):
    colors = _colors()
    out = []
    for idx, inst in enumerate(instances):
        item = {
            'box': [round(float(v), 1) for v in inst.get('box', [])[:4]],
            'label': inst.get('label', f'实例 {idx + 1}'),
            'score': round(float(inst.get('score', 0)), 4),
            'color': colors[idx % len(colors)].tolist(),
        }
        mask = np.asarray(inst.get('mask'), dtype=bool)
        if mask.ndim == 2 and mask.size:
            item['mask_base64'] = to_base64(mask.astype(np.uint8) * 255)
            item['mask_area'] = int(mask.sum())
        out.append(item)
    return out


def _instance_chart(instances, total_pixels):
    total = max(1, int(total_pixels))
    items = []
    for idx, inst in enumerate(instances[:10]):
        mask = np.asarray(inst.get('mask'), dtype=bool)
        items.append({
            'label': inst.get('label', f'实例 {idx + 1}'),
            'value': round(float(inst.get('score', 0)), 4),
            'mask_ratio': round(float(mask.sum()) / total, 4) if mask.size else 0,
            'box': [round(float(v), 1) for v in inst.get('box', [])[:4]],
        })
    return {
        'type': 'bar',
        'title': '实例置信度',
        'subtitle': '柱长表示检测置信度，数据里同时保留 mask 面积占比。',
        'xLabel': '实例',
        'yLabel': '置信度',
        'valueFormat': 'percent',
        'items': items,
    }


def _instance_chart_image(chart, width=640, height=300):
    from PIL import Image, ImageDraw
    canvas = Image.new('RGB', (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 16), chart.get('title', '实例置信度'), fill=(226, 232, 240))
    items = chart.get('items', [])[:10]
    if not items:
        draw.text((20, height // 2), '暂无实例', fill=(148, 163, 184))
        return np.array(canvas)
    bar_h = max(18, (height - 70) // len(items) - 8)
    for idx, item in enumerate(items):
        y = 54 + idx * (bar_h + 8)
        value = float(item.get('value', 0))
        draw.text((18, y + 2), str(item.get('label', f'实例 {idx + 1}'))[:18], fill=(226, 232, 240))
        draw.rectangle((180, y, 180 + int(value * (width - 220)), y + bar_h), fill=(168, 85, 247))
    return np.array(canvas)
