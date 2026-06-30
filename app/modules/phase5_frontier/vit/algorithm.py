"""Vision Transformer (ViT) algorithm — real inference with pretrained model.

Uses HuggingFace transformers ViTModel to extract attention maps,
patch embeddings, and classification logits for visualization.
"""
import os

import numpy as np
import torch
from PIL import Image


_MODEL = None
_PROCESSOR = None
_MODEL_NAME = "google/vit-base-patch16-224"


def _allow_model_download():
    return os.environ.get('CV_ALLOW_MODEL_DOWNLOAD', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _model_load_error(exc):
    return (
        f'{_MODEL_NAME} 权重未在本地缓存中找到或加载失败：{type(exc).__name__}: {exc}. '
        '为避免网页请求卡住，默认不会在 /api/demo/vit 中自动联网下载。'
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
        from transformers import ViTForImageClassification, ViTImageProcessor
        local_only = not _allow_model_download()
        try:
            _PROCESSOR = ViTImageProcessor.from_pretrained(_MODEL_NAME, local_files_only=local_only)
            _MODEL = ViTForImageClassification.from_pretrained(
                _MODEL_NAME, output_attentions=True, **_offline_model_load_kwargs(local_only))
        except Exception as exc:
            raise RuntimeError(_model_load_error(exc)) from exc
        _MODEL.eval()
    return _MODEL, _PROCESSOR


def load_image_as_array(image_path_or_array):
    """Normalize image input to PIL Image and numpy array."""
    if isinstance(image_path_or_array, str):
        img = Image.open(image_path_or_array).convert('RGB')
    elif isinstance(image_path_or_array, np.ndarray):
        img = Image.fromarray(image_path_or_array.astype(np.uint8))
    else:
        img = image_path_or_array
    return img


def extract_attention_maps(image, layer_indices=None):
    """
    Extract self-attention maps from ViT layers.

    Returns:
        attentions: list of attention tensors (num_layers, num_heads, N+1, N+1)
        patches: patch grid shape info
    """
    model, processor = _get_model()
    img = load_image_as_array(image)
    inputs = processor(images=img, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs, output_attentions=True)

    # outputs.attentions: tuple of (batch, num_heads, N+1, N+1) per layer
    attentions = [attn[0].cpu().numpy() for attn in outputs.attentions]
    logits = outputs.logits[0].cpu().numpy()

    # Get class predictions
    probs = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]
    top5_idx = probs.topk(5).indices.cpu().numpy()
    top5_probs = probs.topk(5).values.cpu().numpy()

    predictions = []
    for idx, prob in zip(top5_idx, top5_probs):
        predictions.append({
            'class_id': int(idx),
            'label': model.config.id2label[int(idx)],
            'probability': round(float(prob), 4),
        })

    return {
        'attentions': attentions,
        'logits': logits.tolist(),
        'predictions': predictions,
        'num_layers': len(attentions),
        'num_heads': attentions[0].shape[0] if attentions else 0,
        'num_patches': attentions[0].shape[-1] - 1 if attentions else 0,  # minus CLS token
    }


def get_patch_grid(image, patch_size=16):
    """Visualize how an image is split into patches."""
    model, processor = _get_model()
    img = load_image_as_array(image)
    # Resize to model input size
    img_resized = img.resize((224, 224), Image.LANCZOS)
    arr = np.array(img_resized)

    # Draw grid lines
    grid_vis = arr.copy()
    for i in range(0, 225, patch_size):
        grid_vis[i:i+1, :] = [255, 255, 0]  # Yellow grid lines
        grid_vis[:, i:i+1] = [255, 255, 0]

    return grid_vis


def get_position_embedding_heatmap():
    """Generate a visualization of position embeddings (similarity matrix)."""
    model, _ = _get_model()
    pos_embed = model.vit.embeddings.position_embeddings  # (1, N+1, D)
    pos = pos_embed[0].detach().cpu().numpy()  # (N+1, D)
    # Compute pairwise cosine similarity
    norms = np.linalg.norm(pos, axis=1, keepdims=True)
    pos_norm = pos / np.maximum(norms, 1e-8)
    similarity = pos_norm @ pos_norm.T  # (N+1, N+1)

    # Normalize to [0,1] for heatmap
    sim_min, sim_max = similarity.min(), similarity.max()
    if sim_max - sim_min > 1e-8:
        similarity = (similarity - sim_min) / (sim_max - sim_min)
    return similarity


def attention_to_heatmap(attention_matrix, head_idx=0, patch_grid_size=14, query_patch=None):
    """
    Convert a self-attention matrix to a spatial heatmap.
    Removes CLS token, averages over query positions.
    """
    # attention_matrix: (heads, N+1, N+1)
    head_idx = int(np.clip(head_idx, 0, attention_matrix.shape[0] - 1))
    attn = attention_matrix[head_idx]  # (N+1, N+1)
    # CLS row explains what the classifier token reads. A selected patch row
    # explains what that patch token attends to.
    if query_patch is None:
        attn_avg = attn[0, 1:]
    else:
        q = int(np.clip(query_patch, 0, patch_grid_size * patch_grid_size - 1))
        attn_avg = attn[q + 1, 1:]
    # Reshape to 2D grid
    heatmap = attn_avg.reshape(patch_grid_size, patch_grid_size)
    # Normalize
    hm_min, hm_max = heatmap.min(), heatmap.max()
    if hm_max - hm_min > 1e-8:
        heatmap = (heatmap - hm_min) / (hm_max - hm_min)
    return heatmap
