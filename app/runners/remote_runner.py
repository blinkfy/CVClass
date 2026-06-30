"""Remote model runner via HuggingFace Inference Providers.

Covers the heavy modules that would otherwise require downloading multi-GB
weights locally.  When HF_TOKEN / HUGGINGFACEHUB_API_TOKEN is set the runner
is activated; without it the system falls back to local inference (or returns
a controlled 503 when local weights are also missing).

Supported tasks
---------------
image-classification          → ViT
object-detection              → DETR, Faster R-CNN (detection)
zero-shot-image-classification → CLIP
text-to-image                 → Stable Diffusion
image-segmentation            → semantic (FCN), instance (Mask R-CNN)
"""

import os
import io
import base64
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Per-module remote configuration
# ---------------------------------------------------------------------------
REMOTE_CONFIG = {
    'vit': {
        'task': 'image-classification',
        'model': 'google/vit-base-patch16-224',
        'label': 'ViT 图像分类',
    },
    'detr': {
        'task': 'object-detection',
        'model': 'facebook/detr-resnet-50',
        'label': 'DETR 目标检测',
    },
    'clip': {
        'task': 'zero-shot-image-classification',
        'model': 'openai/clip-vit-base-patch32',
        'label': 'CLIP 零样本分类',
    },
    'stable_diffusion': {
        'task': 'text-to-image',
        'model': 'runwayml/stable-diffusion-v1-5',
        'label': 'Stable Diffusion 文生图',
    },
    'detection': {
        'task': 'object-detection',
        'model': 'facebook/detr-resnet-50',
        'label': '目标检测 (远程)',
    },
    'semantic': {
        'task': 'image-segmentation',
        'model': 'nvidia/segformer-b0-finetuned-ade-512-512',
        'label': '语义分割 (远程)',
    },
    'instance': {
        'task': 'image-segmentation',
        'model': 'facebook/mask2former-swin-tiny-coco-panoptic',
        'label': '实例分割 (远程)',
    },
}

# ---------------------------------------------------------------------------
# Singleton InferenceClient (lazy, cached)
# ---------------------------------------------------------------------------
_CLIENT = None
_CLIENT_CONFIGURED = None  # tri-state: None=unchecked, True, False


def _get_client():
    """Return (InferenceClient | None, is_configured: bool)."""
    global _CLIENT, _CLIENT_CONFIGURED
    if _CLIENT_CONFIGURED is None:
        token = os.environ.get('HF_TOKEN') or os.environ.get('HUGGINGFACEHUB_API_TOKEN')
        if token:
            try:
                from huggingface_hub import InferenceClient
                _CLIENT = InferenceClient(token=token)
                _CLIENT_CONFIGURED = True
            except Exception:
                _CLIENT_CONFIGURED = False
        else:
            _CLIENT_CONFIGURED = False
    return _CLIENT, _CLIENT_CONFIGURED


def is_remote_configured():
    """True when HF_TOKEN / HUGGINGFACEHUB_API_TOKEN is set and client loads."""
    _, configured = _get_client()
    return configured


def get_remote_runner(module_id):
    """Return a RemoteRunner for *module_id* or None when unavailable."""
    if not is_remote_configured():
        return None
    config = REMOTE_CONFIG.get(module_id)
    if config is None:
        return None
    client, _ = _get_client()
    return RemoteRunner(module_id, config['task'], config['model'], client)


# ---------------------------------------------------------------------------
# RemoteRunner
# ---------------------------------------------------------------------------
class RemoteRunner:
    """Calls HuggingFace Inference Providers and returns {steps, metrics}.

    The returned dict has the same shape as the local processor pipeline
    builders so the frontend works unchanged.
    """

    def __init__(self, module_id, task, model_name, client):
        self.module_id = module_id
        self.task = task
        self.model_name = model_name
        self.client = client

    # -- public API ----------------------------------------------------------

    def run(self, **kwargs):
        """Execute remote inference.  Returns {steps, metrics} or {error, steps, metrics}."""
        try:
            if self.task == 'image-classification':
                return self._run_classification(**kwargs)
            elif self.task == 'object-detection':
                return self._run_detection(**kwargs)
            elif self.task == 'zero-shot-image-classification':
                return self._run_zero_shot(**kwargs)
            elif self.task == 'text-to-image':
                return self._run_text_to_image(**kwargs)
            elif self.task == 'image-segmentation':
                return self._run_segmentation(**kwargs)
            else:
                return self._error(f'Unsupported remote task: {self.task}')
        except Exception as exc:
            return self._error(f'远程推理失败 ({self.model_name}): {exc}',
                               status='remote_error')

    def get_metadata(self):
        """Return implementation metadata for frontend status display."""
        return {
            'status': f'远程推理 · HuggingFace',
            'category': 'pretrained_model',
            'backend': 'remote',
            'provider': 'huggingface',
            'local_inference': False,
            'real_model': True,
            'requires_upload': self.task != 'text-to-image',
            'model': self.model_name,
            'note': f'通过 HuggingFace Inference Providers 远程运行 {self.model_name}。未配置 HF_TOKEN 时回退到本地推理。',
        }

    # -- task-specific handlers ----------------------------------------------

    def _run_classification(self, image_path=None, **kwargs):
        if not image_path:
            return self._error('需要上传图片', status='missing_input')
        img = self._open_image(image_path)
        result = self.client.image_classification(img, model=self.model_name)

        img_u8 = self._resize_to_max(np.array(img), 512)
        chart = _chart_classification(result)

        top1 = result[0] if result else {'label': 'N/A', 'score': 0}
        return {
            'steps': [
                {'id': 'original', 'name': '输入图像', 'image': img_u8,
                 'explanation': '原始图像，通过 HuggingFace 远程推理服务分类。'},
                {'id': 'classification', 'name': f'分类: {top1["label"]}',
                 'image': chart,
                 'explanation': (
                     f'远程模型 {self.model_name} 的 Top-5 预测。'
                     f'Top-1: {top1["label"]} ({top1["score"] * 100:.1f}%)。'
                     '注意：远程推理不返回 Transformer 中间注意力图，若需完整教学展示请配置本地模型。'
                 )},
            ],
            'metrics': {
                'model': self.model_name,
                'backend': 'remote (HuggingFace Inference Providers)',
                'provider': 'huggingface',
                'top1': top1['label'],
                'top1_score': round(top1['score'], 4),
                'num_predictions': len(result),
            },
            'predictions': result,
        }

    def _run_detection(self, image_path=None, threshold=0.5, **kwargs):
        if not image_path:
            return self._error('需要上传图片', status='missing_input')
        th = float(kwargs.get('threshold', threshold))
        img = self._open_image(image_path)
        img_u8 = np.array(img)

        result = self.client.object_detection(img, model=self.model_name)
        detections = [d for d in result if d['score'] >= th]

        box_vis = _draw_boxes(img_u8, detections)
        chart = _chart_scores(detections)

        top_label = detections[0]['label'] if detections else 'N/A'
        return {
            'steps': [
                {'id': 'original', 'name': '输入图像', 'image': img_u8,
                 'explanation': f'原始图像，通过 HuggingFace 远程推理服务检测 ({self.model_name})。'},
                {'id': 'detections', 'name': f'检测结果 ({len(detections)} 个, th={th:.2f})',
                 'image': box_vis,
                 'explanation': (
                     f'远程模型检测到 {len(detections)} 个目标。'
                     '注意：远程推理不返回 DETR decoder cross-attention——若需查看 object query 如何关注图像区域，请使用本地模型。'
                 )},
                {'id': 'scores', 'name': '检测置信度', 'image': chart,
                 'explanation': f'按置信度排序，最高: {top_label}'},
            ],
            'metrics': {
                'model': self.model_name,
                'backend': 'remote (HuggingFace Inference Providers)',
                'provider': 'huggingface',
                'threshold': th,
                'detections': len(detections),
                'top_label': top_label,
            },
            'detections': [
                {k: v for k, v in d.items() if k != 'mask'}
                for d in detections
            ],
        }

    def _run_zero_shot(self, image_path=None, class_set='animals',
                       custom_classes='', **kwargs):
        if not image_path:
            return self._error('需要上传图片', status='missing_input')
        cs = kwargs.get('class_set', class_set)
        custom = kwargs.get('custom_classes', custom_classes)

        # Resolve candidate labels (reuse CLIP presets)
        from app.modules.phase5_frontier.clip.algorithm import PRESET_CLASS_SETS
        if custom.strip():
            labels = [n.strip() for n in custom.split(',') if n.strip()]
        else:
            labels = PRESET_CLASS_SETS.get(cs, PRESET_CLASS_SETS['animals'])

        img = self._open_image(image_path)
        result = self.client.zero_shot_image_classification(
            img, candidate_labels=labels, model=self.model_name)

        img_u8 = self._resize_to_max(np.array(img), 512)
        chart = _chart_similarity(result, labels)

        top1 = result[0] if result else {'label': 'N/A', 'score': 0}
        return {
            'steps': [
                {'id': 'original', 'name': '输入图像', 'image': img_u8,
                 'explanation': '原始图像，CLIP 将其与文本描述一起编码到共享向量空间中。'},
                {'id': 'similarity', 'name': '图文相似度', 'image': chart,
                 'explanation': (
                     f'CLIP 零样本分类结果。Top-1: {top1["label"]} ({top1["score"] * 100:.1f}%)。'
                     'CLIP 从 4 亿图文对中学习对齐——无需微调即可识别任意类别。'
                     '注意：远程推理不返回文本-文本相似度矩阵。'
                 )},
                {'id': 'result', 'name': f'分类: {top1["label"]}', 'image': img_u8,
                 'explanation': f'零样本分类完成——{top1["label"]}。'},
            ],
            'metrics': {
                'model': self.model_name,
                'backend': 'remote (HuggingFace Inference Providers)',
                'provider': 'huggingface',
                'num_classes': len(labels),
                'top1': top1['label'],
                'top1_prob': f"{top1['score'] * 100:.1f}%",
                'class_set': cs if not custom.strip() else 'custom',
            },
            'predictions': [
                {'label': r['label'], 'probability': round(r['score'], 4),
                 'similarity': round(r['score'], 4)}
                for r in result
            ],
        }

    def _run_text_to_image(self, prompt='a cat sitting on a chair', **kwargs):
        p = kwargs.get('prompt', prompt)
        try:
            result = self.client.text_to_image(p, model=self.model_name)
        except Exception:
            # Some providers need explicit size
            result = self.client.text_to_image(
                p, model=self.model_name, height=512, width=512)

        img_u8 = np.array(result) if not isinstance(result, np.ndarray) else result
        return {
            'steps': [
                {'id': 'generated', 'name': f'生成: "{p[:60]}"', 'image': img_u8,
                 'explanation': (
                     f'Stable Diffusion v1.5 远程生成。'
                     '注意：远程推理不返回中间去噪步骤——若需展示 VAE latent 随 timestep 的演化过程，请使用本地模型。'
                 )},
            ],
            'metrics': {
                'model': self.model_name,
                'backend': 'remote (HuggingFace Inference Providers)',
                'provider': 'huggingface',
                'prompt': p,
                'architecture': 'VAE + UNet + CLIP Text Encoder (远程)',
                'note': '远程推理: 中间去噪步骤不可用',
            },
        }

    def _run_segmentation(self, image_path=None, **kwargs):
        if not image_path:
            return self._error('需要上传图片', status='missing_input')
        img = self._open_image(image_path)
        img_u8 = np.array(img)
        h, w = img_u8.shape[:2]

        result = self.client.image_segmentation(img, model=self.model_name)

        # result is list of {score, label, mask} where mask is base64 PNG
        overlay = img_u8.copy().astype(np.float32)
        instances = []
        colors = _palette()

        for i, seg in enumerate(result[:20]):
            mask = _decode_mask(seg['mask'], (w, h))
            col = colors[i % len(colors)].astype(np.float32)
            overlay[mask > 128] = overlay[mask > 128] * 0.45 + col * 0.55
            instances.append({
                'label': seg['label'],
                'score': round(seg['score'], 4),
            })

        overlay = np.clip(overlay, 0, 255).astype(np.uint8)

        # Build label summary
        from collections import Counter
        label_counts = Counter(inst['label'] for inst in instances)
        label_summary = [
            {'label': label, 'count': count}
            for label, count in label_counts.most_common(10)
        ]

        is_instance = self.module_id == 'instance'
        task_label = '实例分割' if is_instance else '语义分割'

        return {
            'steps': [
                {'id': 'original', 'name': '输入图像', 'image': img_u8,
                 'explanation': f'原始图像，通过 HuggingFace 远程推理服务进行{task_label} ({self.model_name})。'},
                {'id': 'segmentation', 'name': f'{task_label}结果 ({len(instances)} 个区域)',
                 'image': overlay,
                 'explanation': (
                     f'远程模型 {self.model_name} 的分割结果。'
                     '每种颜色代表一个检测到的区域/实例。'
                     '注意：远程推理不返回逐像素置信度热力图。'
                 )},
            ],
            'metrics': {
                'model': self.model_name,
                'backend': 'remote (HuggingFace Inference Providers)',
                'provider': 'huggingface',
                'task_type': task_label,
                'segments': len(instances),
                'top_labels': ', '.join(
                    item['label'] for item in label_summary[:5]),
            },
            'labels': label_summary,
        }

    # -- helpers -------------------------------------------------------------

    def _open_image(self, path):
        return Image.open(path).convert('RGB')

    @staticmethod
    def _resize_to_max(arr, max_side):
        h, w = arr.shape[:2]
        if max(h, w) <= max_side:
            return arr
        scale = max_side / max(h, w)
        new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
        return np.array(Image.fromarray(arr).resize((new_w, new_h), Image.LANCZOS))

    def _error(self, message, status='error'):
        return {
            'error': message,
            'steps': [],
            'metrics': {'status': status, 'model': self.model_name},
        }


# ---------------------------------------------------------------------------
# Visualization helpers (chart rendering for remote results)
# ---------------------------------------------------------------------------

def _chart_classification(predictions, width=600, height=280):
    """Horizontal bar chart of classification scores."""
    img = Image.new('RGB', (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(img)
    top = predictions[:8]
    if not top:
        return np.array(img)
    bar_h = max(18, (height - 40) // len(top) - 6)
    for i, p in enumerate(top):
        y = 20 + i * (bar_h + 6)
        score = p['score']
        bar_w = int(score * (width - 200))
        r, g, b = int(37 + 22 * score), int(99 + 31 * score), int(235 - 189 * score)
        draw.rectangle(((160, y), (160 + bar_w, y + bar_h)), fill=(r, g, b))
        label = p['label'][:18]
        draw.text((8, y + 2), f'{label}  {score * 100:.1f}%', fill=(226, 232, 240))
    return np.array(img)


def _chart_scores(detections, width=640, height=300):
    """Bar chart of detection confidence scores."""
    img = Image.new('RGB', (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(img)
    if not detections:
        draw.text((20, height // 2), 'No detections above threshold', fill=(226, 232, 240))
        return np.array(img)
    rows = detections[:10]
    bar_h = max(18, (height - 40) // len(rows) - 6)
    for i, d in enumerate(rows):
        y = 20 + i * (bar_h + 6)
        score = float(d['score'])
        bar_w = int(score * (width - 220))
        draw.rectangle(((180, y), (180 + bar_w, y + bar_h)), fill=(59, 130, 246))
        draw.text((8, y + 2), f"{d['label'][:20]}  {score:.2f}", fill=(226, 232, 240))
    return np.array(img)


def _chart_similarity(predictions, labels, width=600, height=300):
    """Similarity bar chart for zero-shot classification."""
    img = Image.new('RGB', (width, height), (30, 35, 45))
    draw = ImageDraw.Draw(img)
    n = len(predictions)
    if n == 0:
        return np.array(img)
    bar_h = max(18, (height - 60) // n - 4)
    scores = [p['score'] for p in predictions]
    mn, mx = min(scores), max(scores)
    rng = mx - mn if mx - mn > 1e-8 else 1
    for i, p in enumerate(predictions):
        y = 20 + i * (bar_h + 4)
        w_bar = int((p['score'] - mn) / rng * (width - 200)) + 20
        r = int(37 + 22 * p['score'])
        g = int(99 + 31 * p['score'])
        b = int(235 - 189 * p['score'])
        draw.rectangle(((140, y), (140 + w_bar, y + bar_h)), fill=(r, g, b))
        draw.text((6, y + bar_h // 2 - 7),
                  f"{p['label'][:16]} ({p['score'] * 100:.1f}%)",
                  fill=(226, 232, 240))
    return np.array(img)


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def _draw_boxes(img, detections):
    """Draw bounding boxes on image copy."""
    vis = img.copy()
    h, w = vis.shape[:2]
    colors = _palette()
    for i, det in enumerate(detections):
        box = det['box']
        # HF returns {xmin, ymin, xmax, ymax}
        x1 = int(box['xmin'])
        y1 = int(box['ymin'])
        x2 = int(box['xmax'])
        y2 = int(box['ymax'])
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        col = colors[i % len(colors)]
        thickness = max(2, min(w, h) // 200)
        vis[y1:y1 + thickness, x1:x2] = col
        vis[max(y2 - thickness, y1):y2 + 1, x1:x2] = col
        vis[y1:y2, x1:x1 + thickness] = col
        vis[y1:y2, max(x2 - thickness, x1):x2 + 1] = col
    return vis


def _decode_mask(mask_b64, target_size):
    """Decode a base64-encoded PNG mask from HF segmentation result."""
    mask_bytes = base64.b64decode(mask_b64)
    mask_img = Image.open(io.BytesIO(mask_bytes)).convert('L')
    if mask_img.size != target_size:
        mask_img = mask_img.resize(target_size, Image.NEAREST)
    return np.array(mask_img)


def _palette():
    return np.array([
        [239, 68, 68], [34, 197, 94], [59, 130, 246],
        [217, 119, 6], [124, 58, 237], [20, 184, 166],
        [236, 72, 153], [245, 158, 11], [99, 102, 241],
        [16, 185, 129],
    ], dtype=np.uint8)
