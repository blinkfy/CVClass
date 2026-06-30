"""CLIP (Contrastive Language-Image Pre-training) algorithm.

Uses HuggingFace transformers CLIPModel for zero-shot classification
and image-text similarity computation.
"""
import os

import numpy as np
import torch
from PIL import Image


_MODEL = None
_PROCESSOR = None
_MODEL_NAME = "openai/clip-vit-base-patch32"


def _allow_model_download():
    return os.environ.get('CV_ALLOW_MODEL_DOWNLOAD', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _model_load_error(exc):
    return (
        f'{_MODEL_NAME} 权重未在本地缓存中找到或加载失败：{type(exc).__name__}: {exc}. '
        '为避免网页请求卡住，默认不会在 /api/demo/clip 中自动联网下载。'
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
        from transformers import CLIPModel, CLIPProcessor
        local_only = not _allow_model_download()
        try:
            _PROCESSOR = CLIPProcessor.from_pretrained(_MODEL_NAME, local_files_only=local_only)
            _MODEL = CLIPModel.from_pretrained(_MODEL_NAME, **_offline_model_load_kwargs(local_only))
        except Exception as exc:
            raise RuntimeError(_model_load_error(exc)) from exc
        _MODEL.eval()
    return _MODEL, _PROCESSOR


def load_image_as_array(image_path_or_array):
    if isinstance(image_path_or_array, str):
        return Image.open(image_path_or_array).convert('RGB')
    elif isinstance(image_path_or_array, np.ndarray):
        return Image.fromarray(image_path_or_array.astype(np.uint8))
    return image_path_or_array


def compute_image_text_similarity(image, text_list):
    """
    Compute cosine similarity between an image and multiple text descriptions.

    Returns:
        similarities: list of float scores
        image_embedding: normalized image feature vector
        text_embeddings: normalized text feature vectors
    """
    model, processor = _get_model()
    img = load_image_as_array(image)
    inputs = processor(text=text_list, images=img, return_tensors="pt", padding=True)

    with torch.no_grad():
        outputs = model(**inputs)

    # Normalized embeddings
    img_emb = outputs.image_embeds[0].cpu().numpy()
    txt_embs = outputs.text_embeds.cpu().numpy()

    # Cosine similarity
    img_norm = img_emb / (np.linalg.norm(img_emb) + 1e-8)
    txt_norms = txt_embs / (np.linalg.norm(txt_embs, axis=1, keepdims=True) + 1e-8)
    similarities = (img_norm * txt_norms).sum(axis=1)

    return {
        'similarities': similarities.tolist(),
        'image_embedding': img_norm.tolist(),
        'text_embeddings': txt_norms.tolist(),
    }


def zero_shot_classify(image, class_names):
    """
    Zero-shot classification using CLIP.

    class_names: list of class labels (e.g., ['dog', 'cat', 'car'])
    Returns sorted predictions with probabilities.
    """
    result = compute_image_text_similarity(
        image,
        [f'a photo of a {name}' for name in class_names]
    )

    sims = np.array(result['similarities'])
    text_emb = np.asarray(result['text_embeddings'], dtype=np.float64)
    text_similarity = text_emb @ text_emb.T
    # Softmax
    logits = sims * 100
    logits = logits - logits.max()
    probs = np.exp(logits) / np.sum(np.exp(logits))

    predictions = []
    for i in np.argsort(-probs):
        predictions.append({
            'label': class_names[i],
            'prompt': f'a photo of a {class_names[i]}',
            'similarity': round(float(sims[i]), 4),
            'probability': round(float(probs[i]), 4),
        })

    return {
        'predictions': predictions,
        'similarities': result['similarities'],
        'image_embedding': result['image_embedding'],
        'text_embeddings': result['text_embeddings'],
        'text_similarity': text_similarity.tolist(),
    }


PRESET_CLASS_SETS = {
    'animals': ['dog', 'cat', 'bird', 'fish', 'horse', 'elephant', 'butterfly', 'tiger'],
    'objects': ['car', 'bicycle', 'phone', 'laptop', 'book', 'chair', 'pizza', 'guitar'],
    'scenes': ['beach', 'mountain', 'forest', 'city street', 'kitchen', 'bedroom', 'office', 'garden'],
    'actions': ['running', 'swimming', 'cooking', 'reading', 'dancing', 'sleeping', 'flying', 'driving'],
}
