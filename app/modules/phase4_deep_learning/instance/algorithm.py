"""Instance segmentation algorithm demonstrations. Pure NumPy.

Demonstrates Mask R-CNN style two-stage detection+segmentation:
stage 1: detect bounding boxes, stage 2: segment each instance.
"""
import numpy as np


def simple_instance_demo(img, num_instances=3):
    """Generate demo instance detections with masks."""
    arr = np.asarray(img, dtype=np.uint8)
    if arr.ndim == 2:
        arr = np.stack([arr]*3, axis=-1)
    h, w = arr.shape[:2]
    rng = np.random.default_rng(2026)
    instances = []
    for i in range(num_instances):
        cx = rng.integers(w//6, 5*w//6)
        cy = rng.integers(h//6, 5*h//6)
        bw = rng.integers(w//8, w//3)
        bh = rng.integers(h//8, h//3)
        x1 = max(0, cx - bw//2)
        y1 = max(0, cy - bh//2)
        x2 = min(w, cx + bw//2)
        y2 = min(h, cy + bh//2)
        mask = np.zeros((h, w), dtype=np.uint8)
        bbox_w = x2 - x1
        bbox_h = y2 - y1
        yy, xx = np.ogrid[y1:y2, x1:x2]
        dist_y = (yy - (y1+y2)/2) / (bbox_h/2 + 1e-6)
        dist_x = (xx - (x1+x2)/2) / (bbox_w/2 + 1e-6)
        ellipse = (dist_y**2 + dist_x**2) <= 0.9
        mask[y1:y2, x1:x2] = ellipse.astype(np.uint8) * 255
        noise_mask = rng.random((h, w)) > 0.92
        mask = np.clip(mask.astype(np.int32) + noise_mask.astype(np.int32)*50, 0, 255).astype(np.uint8)
        instances.append({
            'class_id': i % 3,
            'box': [float(x1), float(y1), float(x2-x1), float(y2-y1)],
            'mask': mask,
        })
    return instances


def generate_proposals_from_edges(img, num_proposals=20):
    """
    Simulate RPN (Region Proposal Network) by placing proposals
    at edge-rich regions of the image.
    """
    arr = np.asarray(img, dtype=np.float64)
    if arr.ndim == 3:
        gray = 0.299*arr[:,:,0] + 0.587*arr[:,:,1] + 0.114*arr[:,:,2]
    else:
        gray = arr
    h, w = gray.shape
    gy, gx = np.gradient(gray)
    edge_mag = np.sqrt(gx**2 + gy**2)
    edge_mag = edge_mag / max(edge_mag.max(), 1e-8)
    rng = np.random.default_rng(42)
    proposals = []
    for _ in range(num_proposals):
        if rng.random() < 0.7:
            valid = edge_mag > rng.random() * 0.5
            candidates = np.argwhere(valid)
            if len(candidates) > 0:
                idx = rng.integers(0, len(candidates))
                cy, cx = candidates[idx]
            else:
                cy, cx = rng.integers(h//4, 3*h//4), rng.integers(w//4, 3*w//4)
        else:
            cy, cx = rng.integers(h//4, 3*h//4), rng.integers(w//4, 3*w//4)
        bw = rng.integers(w//10, w//4)
        bh = rng.integers(h//10, h//4)
        x1 = max(0, cx - bw//2); y1 = max(0, cy - bh//2)
        x2 = min(w, cx + bw//2); y2 = min(h, cy + bh//2)
        score = float(edge_mag[y1:y2, x1:x2].mean()) if x2>x1 and y2>y1 else 0.1
        proposals.append({'box': [float(x1), float(y1), float(x2-x1), float(y2-y1)], 'score': round(score, 3)})
    proposals.sort(key=lambda p: p['score'], reverse=True)
    return proposals


def refine_mask_coarse_to_fine(mask, num_iterations=2):
    """Simulate coarse-to-fine mask refinement."""
    from scipy.ndimage import binary_dilation, binary_erosion
    refined = mask > 0
    for _ in range(num_iterations):
        refined = binary_dilation(refined, iterations=1)
        refined = binary_erosion(refined, iterations=1)
    return refined.astype(np.uint8) * 255


def compute_mask_iou(mask1, mask2):
    m1 = np.asarray(mask1, dtype=bool)
    m2 = np.asarray(mask2, dtype=bool)
    intersection = (m1 & m2).sum()
    union = (m1 | m2).sum()
    return float(intersection / union) if union > 0 else 0.0


def colorize_instances(instances, img_shape):
    """Overlay colored instance masks on black canvas."""
    colors = [
        (220, 38, 38, 128), (37, 99, 235, 128), (5, 150, 105, 128),
        (217, 119, 6, 128), (124, 58, 237, 128), (236, 72, 153, 128),
    ]
    h, w = img_shape[:2]
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    for idx, inst in enumerate(instances):
        color = colors[idx % len(colors)]
        mask = inst['mask'] > 0
        for c in range(3):
            canvas[:,:,c] = np.where(mask, color[c], canvas[:,:,c])
    return canvas
