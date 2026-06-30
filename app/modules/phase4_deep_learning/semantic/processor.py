"""Semantic segmentation with real FCN and local NumPy fallback."""
import numpy as np

from app.modules.offline_teaching import _load_or_fixture
from app.utils.image_utils import load_image_u8


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
        from torchvision.models.segmentation import FCN_ResNet50_Weights, fcn_resnet50

        _DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        _WEIGHTS = FCN_ResNet50_Weights.DEFAULT
        _MODEL = fcn_resnet50(weights=_WEIGHTS)
        _MODEL.to(_DEVICE)
        _MODEL.eval()
    return _MODEL, _WEIGHTS, _DEVICE


def build_pipeline(image_path=None, **kwargs):
    """Run real FCN by default; fall back to local heuristic if torch unavailable."""
    if not image_path:
        return _build_local_pipeline(image_path=image_path, **kwargs)

    if not _check_torch():
        return _build_local_pipeline(image_path=image_path, **kwargs)

    img_u8 = load_image_u8(image_path, mode='rgb', max_side=768)
    try:
        model, weights, device = _get_model()
    except Exception as exc:
        fallback = _build_local_pipeline(image_path=image_path, **kwargs)
        fallback['metrics']['pretrained_status'] = 'unavailable'
        fallback['metrics']['pretrained_error'] = f'{type(exc).__name__}: {exc}'
        return fallback

    import torch
    preprocess = weights.transforms()
    tensor = preprocess(_pil_image(img_u8)).unsqueeze(0).to(device)
    with torch.no_grad():
        logits = model(tensor)['out'][0]
        probs = torch.softmax(logits, dim=0)
        seg = torch.argmax(probs, dim=0).detach().cpu().numpy().astype(np.int32)
        conf = torch.max(probs, dim=0).values.detach().cpu().numpy()

    categories = weights.meta.get('categories', [])
    seg_resized = _resize_nearest(seg, img_u8.shape[:2])
    conf_resized = _resize_float(conf, img_u8.shape[:2])
    color = _colorize(seg_resized)
    overlay = _overlay(img_u8, color)
    conf_vis = _confidence_heatmap(conf_resized)
    label_summary = _label_summary(seg_resized, categories)
    label_chart = _label_chart(label_summary, img_u8.shape[0] * img_u8.shape[1])
    return {
        'steps': [
            {'id': 'original', 'name': '输入图像', 'image': img_u8,
             'visual_kind': 'image',
             'explanation': '图像送入 torchvision 的 FCN ResNet50 语义分割预训练权重。'},
            {'id': 'segmentation', 'name': '像素类别图', 'image': color,
             'visual_kind': 'image',
             'explanation': '每个像素的颜色来自 FCN softmax 后概率最高的类别。'},
            {'id': 'confidence', 'name': '像素置信度热力图', 'image': conf_vis,
             'visual_kind': 'image',
             'explanation': '越亮的位置表示该像素最大类别概率越高。'},
            {'id': 'label_summary', 'name': '类别面积占比', 'image': _label_chart_image(label_chart),
             'visual_kind': 'chart',
             'overlay_scope': 'none',
             'chart': label_chart,
             'explanation': '柱状图展示各语义类别覆盖的像素比例，由前端根据结构化数据高清绘制。'},
            {'id': 'overlay', 'name': '叠加到原图', 'image': overlay,
             'visual_kind': 'image',
             'explanation': '预测出的语义类别以半透明颜色叠加到输入图像上，方便对照原始内容。'},
        ],
        'metrics': {
            'status': 'pretrained_model',
            'model': 'fcn_resnet50',
            'weights': str(weights),
            'backend': 'torchvision',
            'device': str(device),
            'classes_present': len(np.unique(seg_resized)),
            'top_labels': ', '.join(item['label'] for item in label_summary[:4]),
        },
        'labels': label_summary,
    }


def _build_local_pipeline(image_path=None, **kwargs):
    num_classes = int(kwargs.get('num_classes', 5))
    num_classes = int(np.clip(num_classes, 2, 8))
    img_u8 = _load_or_fixture(image_path=image_path)
    seg, conf, centers = _segment_local(img_u8, num_classes=num_classes)
    color = _colorize(seg)
    overlay = _overlay(img_u8, color)
    conf_vis = _confidence_heatmap(conf)
    labels = _local_labels(seg, centers)
    label_chart = _label_chart(labels, img_u8.shape[0] * img_u8.shape[1])
    return {
        'steps': [
            {'id': 'input', 'name': '输入图像', 'image': img_u8,
             'visual_kind': 'image',
             'explanation': '本地语义分割把每个像素表示成颜色和位置特征，再寻找相似区域。'},
            {'id': 'segmentation', 'name': '像素分组区域', 'image': color,
             'visual_kind': 'image',
             'explanation': '同一区域里的像素颜色相近、位置也相邻，用来模拟“每个像素都有类别”的密集预测。'},
            {'id': 'confidence', 'name': '区域置信度', 'image': conf_vis,
             'visual_kind': 'image',
             'explanation': '当像素明显更接近自己的区域中心，而不是其他区域中心时，置信度更高。'},
            {'id': 'label_summary', 'name': '区域面积占比', 'image': _label_chart_image(label_chart),
             'visual_kind': 'chart',
             'overlay_scope': 'none',
             'chart': label_chart,
             'explanation': '柱状图展示每个区域覆盖了多少像素，前端会基于真实统计数据重绘。'},
            {'id': 'overlay', 'name': '叠加到原图', 'image': overlay,
             'visual_kind': 'image',
             'explanation': '彩色掩码覆盖整张图，展示语义分割和只画框的目标检测之间的差别。'},
        ],
        'metrics': {
            'status': 'local_teaching_fallback',
            'model': 'local_color_spatial_segmentation',
            'backend': 'NumPy/PIL',
            'pretrained_model': 'fcn_resnet50',
            'pretrained_enabled': False,
            'classes_present': len(labels),
            'num_classes': num_classes,
        },
        'labels': labels,
    }


def _segment_local(img, num_classes=5):
    arr = np.asarray(img, dtype=np.float32) / 255.0
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    xy = np.stack([yy / max(h - 1, 1), xx / max(w - 1, 1)], axis=-1)
    feats = np.concatenate([arr, xy * 0.45], axis=-1).reshape(-1, 5)
    rng = np.random.default_rng(2026)
    picks = np.linspace(0, len(feats) - 1, num_classes).astype(int)
    jitter = rng.integers(0, max(1, len(feats) // num_classes), size=num_classes)
    centers = feats[np.clip(picks + jitter, 0, len(feats) - 1)].copy()
    for _ in range(9):
        dists = np.sum((feats[:, None, :] - centers[None, :, :]) ** 2, axis=2)
        labels = np.argmin(dists, axis=1)
        for k in range(num_classes):
            if np.any(labels == k):
                centers[k] = feats[labels == k].mean(axis=0)
    dists = np.sum((feats[:, None, :] - centers[None, :, :]) ** 2, axis=2)
    order = np.sort(dists, axis=1)
    labels = np.argmin(dists, axis=1).reshape(h, w)
    margin = np.clip((order[:, 1] - order[:, 0]) / (order[:, 1] + 1e-6), 0, 1).reshape(h, w)
    return labels.astype(np.int32), margin.astype(np.float32), centers


def _local_labels(seg, centers):
    labels, counts = np.unique(seg, return_counts=True)
    out = []
    for label, count in sorted(zip(labels, counts), key=lambda x: x[1], reverse=True):
        rgb = centers[int(label), :3]
        name = _color_name(rgb)
        out.append({'label_id': int(label), 'label': name, 'pixels': int(count)})
    return out


def _label_summary(seg, categories):
    labels, counts = np.unique(seg, return_counts=True)
    top = sorted(zip(labels.tolist(), counts.tolist()), key=lambda x: x[1], reverse=True)[:6]
    return [
        {
            'label_id': int(label),
            'label': categories[int(label)] if int(label) < len(categories) else str(label),
            'pixels': int(count),
        }
        for label, count in top
    ]


def _color_name(rgb):
    r, g, b = rgb
    if max(rgb) - min(rgb) < 0.12:
        return '中性区域'
    if r >= g and r >= b:
        return '暖色区域'
    if g >= r and g >= b:
        return '绿色区域'
    return '冷色区域'


def _label_chart(labels, total_pixels):
    total = max(1, int(total_pixels))
    return {
        'type': 'bar',
        'title': '语义类别面积占比',
        'subtitle': '每根柱子表示一个类别或区域覆盖的像素比例。',
        'xLabel': '类别/区域',
        'yLabel': '像素占比',
        'valueFormat': 'percent',
        'items': [
            {
                'label': item.get('label', f"类别 {item.get('label_id', idx)}"),
                'value': round(float(item.get('pixels', 0)) / total, 4),
                'pixels': int(item.get('pixels', 0)),
                'label_id': item.get('label_id'),
            }
            for idx, item in enumerate(labels[:8])
        ],
    }


def _label_chart_image(chart, width=640, height=300):
    from PIL import Image, ImageDraw
    canvas = Image.new('RGB', (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 16), chart.get('title', '语义类别面积占比'), fill=(226, 232, 240))
    items = chart.get('items', [])[:8]
    if not items:
        draw.text((20, height // 2), '暂无类别统计', fill=(148, 163, 184))
        return np.array(canvas)
    bar_h = max(18, (height - 70) // len(items) - 8)
    for idx, item in enumerate(items):
        y = 54 + idx * (bar_h + 8)
        value = float(item.get('value', 0))
        draw.text((18, y + 2), str(item.get('label', f'类别 {idx + 1}'))[:18], fill=(226, 232, 240))
        draw.rectangle((190, y, 190 + int(value * (width - 230)), y + bar_h), fill=(20, 184, 166))
    return np.array(canvas)


def _pil_image(arr):
    from PIL import Image
    return Image.fromarray(arr.astype(np.uint8))


def _resize_nearest(arr, shape_hw):
    from PIL import Image
    h, w = shape_hw
    return np.array(Image.fromarray(arr.astype(np.int32), mode='I').resize((w, h), Image.NEAREST), dtype=np.int32)


def _resize_float(arr, shape_hw):
    from PIL import Image
    h, w = shape_hw
    return np.array(Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), dtype=np.float32) / 255.0


def _colorize(seg):
    palette = np.array([
        [20, 23, 30], [239, 68, 68], [34, 197, 94], [59, 130, 246],
        [245, 158, 11], [168, 85, 247], [20, 184, 166], [236, 72, 153],
        [250, 204, 21],
    ], dtype=np.uint8)
    return palette[np.asarray(seg, dtype=np.int32) % len(palette)]


def _overlay(img, color):
    return np.clip(img.astype(np.float32) * 0.55 + color.astype(np.float32) * 0.45, 0, 255).astype(np.uint8)


def _confidence_heatmap(conf):
    conf = np.clip(np.asarray(conf, dtype=np.float32), 0, 1)
    r = (conf * 255).astype(np.uint8)
    g = ((1 - np.abs(conf - 0.5) * 2) * 180).astype(np.uint8)
    b = ((1 - conf) * 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)
