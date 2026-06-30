"""DETR (DEtection TRansformer) algorithm — real inference with pretrained model.

Uses HuggingFace transformers DetrForObjectDetection for end-to-end
object detection with Transformer encoder-decoder and object queries.
"""
import os

import numpy as np
import torch
from PIL import Image


_MODEL = None
_PROCESSOR = None
_MODEL_NAME = "facebook/detr-resnet-50"


def _allow_model_download():
    return os.environ.get('CV_ALLOW_MODEL_DOWNLOAD', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _model_load_error(exc):
    return (
        f'{_MODEL_NAME} 权重未在本地缓存中找到或加载失败：{type(exc).__name__}: {exc}. '
        '为避免网页请求卡住，默认不会在 /api/demo/detr 中自动联网下载。'
        '请先在命令行设置 CV_ALLOW_MODEL_DOWNLOAD=1 后预热模型，或手动将 HuggingFace 缓存准备好。'
    )


def _offline_model_load_kwargs(local_only):
    os.environ.setdefault('DISABLE_SAFETENSORS_CONVERSION', '1')
    if local_only:
        os.environ.setdefault('HF_HUB_OFFLINE', '1')
        os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
    return {
        'local_files_only': local_only,
    }


def _get_model():
    global _MODEL, _PROCESSOR
    if _MODEL is None:
        from transformers import DetrForObjectDetection, DetrImageProcessor
        local_only = not _allow_model_download()
        try:
            _PROCESSOR = DetrImageProcessor.from_pretrained(_MODEL_NAME, local_files_only=local_only)
            _MODEL = DetrForObjectDetection.from_pretrained(
                _MODEL_NAME, output_attentions=True, **_offline_model_load_kwargs(local_only))
        except Exception as exc:
            raise RuntimeError(_model_load_error(exc)) from exc
        _MODEL.eval()
    return _MODEL, _PROCESSOR


def load_image_as_array(image_path_or_array):
    if isinstance(image_path_or_array, str):
        img = Image.open(image_path_or_array).convert('RGB')
    elif isinstance(image_path_or_array, np.ndarray):
        img = Image.fromarray(image_path_or_array.astype(np.uint8))
    else:
        img = image_path_or_array
    return img


def detect_objects(image, threshold=0.5):
    """
    Run DETR object detection.

    Returns:
        detections with boxes, labels, scores
        decoder cross-attention maps
    """
    model, processor = _get_model()
    img = load_image_as_array(image)
    inputs = processor(images=img, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs, output_attentions=True)

    pixel_values = inputs["pixel_values"][0].detach().cpu().numpy()
    probs = torch.softmax(outputs.logits[0], dim=-1)
    # The last DETR class is "no-object"; objectness is one minus that
    # probability. These are raw query predictions before confidence filtering.
    objectness = 1.0 - probs[:, -1]
    class_probs, class_ids = probs[:, :-1].max(dim=-1)
    query_scores = objectness * class_probs
    pred_boxes = outputs.pred_boxes[0].detach().cpu().numpy()
    top_query_idx = torch.topk(query_scores, k=min(12, query_scores.numel())).indices.cpu().numpy()
    query_predictions = []
    for q in top_query_idx:
        label_id = int(class_ids[q])
        query_predictions.append({
            'query': int(q),
            'box_cxcywh': [round(float(v), 4) for v in pred_boxes[q].tolist()],
            'label': model.config.id2label.get(label_id, str(label_id)),
            'class_id': label_id,
            'objectness': round(float(objectness[q]), 4),
            'class_probability': round(float(class_probs[q]), 4),
            'score': round(float(query_scores[q]), 4),
        })

    # Process detections
    target_sizes = torch.tensor([img.size[::-1]])
    results = processor.post_process_object_detection(
        outputs, target_sizes=target_sizes, threshold=threshold)[0]

    detections = []
    for score, label, box in zip(results['scores'], results['labels'], results['boxes']):
        detections.append({
            'box': [round(float(v), 1) for v in box.tolist()],
            'label': model.config.id2label[int(label)],
            'class_id': int(label),
            'score': round(float(score), 3),
        })

    # Extract cross-attention from decoder (last layer, last decoder layer)
    # Shape: (batch, num_heads, num_queries, encoder_seq_len)
    cross_attentions = None
    if hasattr(outputs, 'cross_attentions') and outputs.cross_attentions:
        cross_attn = outputs.cross_attentions[-1][0].cpu().numpy()  # (heads, queries, seq_len)

        # Get feature map spatial size (encoder output after CNN backbone)
        encoder_seq_len = cross_attn.shape[-1]
        feat_h, feat_w = _factor_grid(encoder_seq_len)

        cross_attentions = {
            'maps': cross_attn,
            'num_heads': cross_attn.shape[0],
            'num_queries': cross_attn.shape[1],
            'feature_size': feat_h,
            'feature_shape': (feat_h, feat_w),
        }

    return {
        'detections': detections,
        'cross_attentions': cross_attentions,
        'preprocess_tensor': pixel_values,
        'query_predictions': query_predictions,
        'num_queries': 100,
    }


def visualize_query_attention(cross_attn, query_idx=0, head_idx=0):
    """Extract a single query's cross-attention heatmap."""
    if cross_attn is None:
        return None
    # cross_attn['maps']: (heads, queries, seq_len)
    attn = cross_attn['maps'][head_idx, query_idx]  # (seq_len,)
    feat_h, feat_w = cross_attn.get('feature_shape') or (cross_attn['feature_size'], cross_attn['feature_size'])
    heatmap = attn[:feat_h * feat_w].reshape(feat_h, feat_w)
    hm_min, hm_max = heatmap.min(), heatmap.max()
    if hm_max - hm_min > 1e-8:
        heatmap = (heatmap - hm_min) / (hm_max - hm_min)
    return heatmap


def _factor_grid(n):
    """Return factor pair closest to square for a flattened feature map."""
    root = int(np.sqrt(n))
    for h in range(root, 0, -1):
        if n % h == 0:
            return h, n // h
    return 1, n
