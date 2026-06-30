"""SAM (Segment Anything Model) algorithm — real inference with pretrained model.

Uses Meta's segment-anything package for prompt-based segmentation.
"""
import numpy as np
import torch
from PIL import Image


_MODEL = None
_DEVICE = None
SAM_VIT_B_URL = 'https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth'
SAM_DEFAULT_CHECKPOINT = 'models/sam_vit_b_01ec64.pth'


def _get_model():
    global _MODEL, _DEVICE
    if _MODEL is None:
        _DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
        from segment_anything import sam_model_registry, SamPredictor
        # Use ViT-B SAM model
        import os
        checkpoint = os.environ.get('SAM_CHECKPOINT', SAM_DEFAULT_CHECKPOINT)
        if not os.path.exists(checkpoint):
            # Try alternate locations
            alt_paths = [
                'E:/SAM/sam_vit_b_01ec64.pth',
                'E:/Learning/2025/202520261/DIP/E4/sam_vit_b_01ec64.pth',
                'sam_vit_b_01ec64.pth',
            ]
            for p in alt_paths:
                if os.path.exists(p):
                    checkpoint = p
                    break
        if not os.path.exists(checkpoint):
            raise FileNotFoundError(
                'SAM ViT-B checkpoint not found. '
                f'Set SAM_CHECKPOINT or place sam_vit_b_01ec64.pth at {SAM_DEFAULT_CHECKPOINT}. '
                f'Download: {SAM_VIT_B_URL}'
            )
        sam = sam_model_registry['vit_b'](checkpoint=checkpoint)
        sam.to(device=_DEVICE)
        sam.eval()
        _MODEL = SamPredictor(sam)
    return _MODEL, _DEVICE


def load_image(image_path_or_array):
    if isinstance(image_path_or_array, str):
        img = Image.open(image_path_or_array).convert('RGB')
    elif isinstance(image_path_or_array, np.ndarray):
        img = Image.fromarray(image_path_or_array.astype(np.uint8))
    else:
        img = image_path_or_array
    return np.array(img)


def encode_image(image):
    """Encode image with SAM's image encoder (run once per image)."""
    predictor, device = _get_model()
    img_arr = load_image(image)
    predictor.set_image(img_arr)
    return {
        'image_shape': img_arr.shape,
        'original_size': predictor.original_size,
        'input_size': predictor.input_size,
    }


def predict_from_prompts(points=None, labels=None, box=None, multimask_output=True):
    """
    Predict masks from point and/or box prompts.
    points: optional list of (x, y) in original image coordinates
    labels: optional list of 1 (foreground) or 0 (background)
    box: optional (x1, y1, x2, y2) in original image coordinates
    """
    predictor, _ = _get_model()

    input_points = None
    input_labels = None
    input_box = None
    if points:
        input_points = np.array(points, dtype=np.float32)
        input_labels = np.array(labels if labels is not None else [1] * len(points), dtype=np.int32)
    if box is not None:
        input_box = np.array(box, dtype=np.float32)

    masks, scores, logits = predictor.predict(
        point_coords=input_points,
        point_labels=input_labels,
        box=input_box,
        multimask_output=bool(multimask_output),
    )
    return {
        'masks': [mask.astype(np.uint8) * 255 for mask in masks],
        'scores': [float(s) for s in scores],
        'best_idx': int(np.argmax(scores)),
        'low_res_logits_shape': list(logits.shape),
    }


def predict_from_points(points, labels):
    """
    Predict mask from point prompts.
    points: list of (x, y) in original image coordinates
    labels: list of 1 (foreground) or 0 (background)
    """
    return predict_from_prompts(points=points, labels=labels, multimask_output=True)


def predict_from_box(box):
    """
    Predict mask from bounding box prompt.
    box: (x1, y1, x2, y2) in original image coordinates
    """
    return predict_from_prompts(points=None, labels=None, box=box, multimask_output=True)
