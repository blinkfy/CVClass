"""Object detection algorithm demonstrations. Pure NumPy.

Covers YOLO-style grid detection: grid division, anchor boxes, confidence
prediction, NMS (Non-Maximum Suppression), IoU computation, and mAP evaluation.
"""
import numpy as np


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -10, 10)))


def compute_iou(box1, box2):
    """
    Compute IoU (Intersection over Union) between two boxes.
    Each box: [x_center, y_center, width, height] normalized [0,1].
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2
    left1, top1 = x1 - w1/2, y1 - h1/2
    right1, bottom1 = x1 + w1/2, y1 + h1/2
    left2, top2 = x2 - w2/2, y2 - h2/2
    right2, bottom2 = x2 + w2/2, y2 + h2/2
    inter_left = max(left1, left2)
    inter_top = max(top1, top2)
    inter_right = min(right1, right2)
    inter_bottom = min(bottom1, bottom2)
    if inter_right <= inter_left or inter_bottom <= inter_top:
        return 0.0
    inter_area = (inter_right - inter_left) * (inter_bottom - inter_top)
    area1, area2 = w1 * h1, w2 * h2
    union = area1 + area2 - inter_area
    return float(inter_area / union) if union > 0 else 0.0


def non_max_suppression(boxes, scores, iou_threshold=0.5):
    """NMS: remove overlapping boxes, keeping highest-scoring ones."""
    if len(boxes) == 0:
        return []
    order = np.argsort(scores)[::-1]
    keep = []
    while len(order) > 0:
        idx = order[0]
        keep.append(int(idx))
        if len(order) == 1:
            break
        ious = np.array([compute_iou(boxes[idx], boxes[j]) for j in order[1:]])
        order = order[1:][ious < iou_threshold]
    return keep


# ── Anchor box generation ──
def generate_anchors(grid_size=7, scales=(0.5, 1.0, 1.5), ratios=(0.5, 1.0, 2.0)):
    """
    Generate anchor boxes for each grid cell.
    Returns list of {grid_y, grid_x, scale, ratio, w, h, x_center, y_center}.
    """
    anchors = []
    for gy in range(grid_size):
        for gx in range(grid_size):
            cy = (gy + 0.5) / grid_size
            cx = (gx + 0.5) / grid_size
            for s in scales:
                for r in ratios:
                    w = s * np.sqrt(r) / grid_size
                    h = s / np.sqrt(r) / grid_size
                    anchors.append({
                        'grid_y': gy, 'grid_x': gx,
                        'cx': round(cx, 3), 'cy': round(cy, 3),
                        'w': round(w, 3), 'h': round(h, 3),
                        'scale': s, 'ratio': r,
                    })
    return anchors


def draw_anchor_visualization(img_shape, grid_size=7, max_anchors_per_cell=3):
    """Create a visualization showing anchor boxes overlaid on grid."""
    h, w = img_shape[:2]
    # Create white canvas with grid
    canvas = np.ones((h, w, 3), dtype=np.uint8) * 240
    cell_h, cell_w = h // grid_size, w // grid_size
    # Draw grid lines
    for i in range(grid_size + 1):
        y, x = i * cell_h, i * cell_w
        if y < h: canvas[y:y+1, :] = [180, 180, 180]
        if x < w: canvas[:, x:x+1] = [180, 180, 180]
    # Draw example anchors in center cells
    colors = [(239, 68, 68), (34, 197, 94), (59, 130, 246)]
    mid = grid_size // 2
    scales = [(0.4, 0.6), (1.0, 1.0), (1.2, 0.5)]
    for gi, (sw, sh) in enumerate(scales):
        gy, gx = mid, mid - 1 + gi
        if 0 <= gy < grid_size and 0 <= gx < grid_size:
            cx = int((gx + 0.5) * cell_w)
            cy = int((gy + 0.5) * cell_h)
            bw = int(sw * cell_w)
            bh = int(sh * cell_h)
            x1, y1 = max(0, cx - bw // 2), max(0, cy - bh // 2)
            x2, y2 = min(w-1, cx + bw // 2), min(h-1, cy + bh // 2)
            col = colors[gi % 3]
            canvas[y1:y1+2, x1:x2] = col
            canvas[y2-1:y2+1, x1:x2] = col
            canvas[y1:y2, x1:x1+2] = col
            canvas[y1:y2, x2-1:x2+1] = col
    return canvas


# ── Detection simulation ──
def grid_detection_demo(img_shape, grid_size=7, num_boxes=2, num_classes=3):
    """Generate demo detection results simulating YOLO-style output."""
    h, w = img_shape[:2]
    rng = np.random.default_rng(42)
    detections = []
    for gy in range(grid_size):
        for gx in range(grid_size):
            for b in range(num_boxes):
                confidence = float(rng.random()) ** 5
                if confidence < 0.3:
                    continue
                bx = (gx + rng.random()) / grid_size
                by = (gy + rng.random()) / grid_size
                bw = rng.random() * 0.4 + 0.1
                bh = rng.random() * 0.4 + 0.1
                class_probs = rng.random(num_classes)
                class_probs /= class_probs.sum()
                class_id = int(np.argmax(class_probs))
                detections.append({
                    'box': [float(bx), float(by), float(bw), float(bh)],
                    'confidence': float(confidence),
                    'class_id': class_id,
                })
    detections.sort(key=lambda d: d['confidence'], reverse=True)
    boxes = [d['box'] for d in detections]
    scores = [d['confidence'] for d in detections]
    keep_idx = non_max_suppression(boxes, scores, iou_threshold=0.4)
    result = []
    for idx in keep_idx[:20]:
        d = detections[idx]
        box = d['box']
        result.append({
            'x': round(float(box[0] * w), 1),
            'y': round(float(box[1] * h), 1),
            'w': round(float(box[2] * w), 1),
            'h': round(float(box[3] * h), 1),
            'confidence': round(float(d['confidence']), 3),
            'class_id': int(d['class_id']),
        })
    return result


def compute_confidence_heatmap(img_shape, detections_before_nms, grid_size=7):
    """Generate a per-cell confidence heatmap."""
    h, w = img_shape[:2]
    heatmap = np.zeros((grid_size, grid_size), dtype=np.float32)
    for d in detections_before_nms:
        box = d['box']
        gx = int(np.clip(box[0] * grid_size, 0, grid_size - 1))
        gy = int(np.clip(box[1] * grid_size, 0, grid_size - 1))
        heatmap[gy, gx] = max(heatmap[gy, gx], d['confidence'])
    # Upsample to image size
    big = np.kron(heatmap, np.ones((h // grid_size + 1, w // grid_size + 1)))
    return big[:h, :w]


def draw_detection_result(img, detections, class_names=None):
    """Draw bounding boxes and labels on an image copy."""
    if class_names is None:
        class_names = ['人', '车', '动物']
    colors = [(239, 68, 68), (34, 197, 94), (59, 130, 246), (217, 119, 6), (124, 58, 237)]
    vis = np.asarray(img, dtype=np.uint8).copy()
    if vis.ndim == 2:
        vis = np.stack([vis]*3, axis=-1)
    h, w = vis.shape[:2]
    for d in detections:
        col = colors[d['class_id'] % len(colors)]
        x, y, bw, bh = int(d['x'] - d['w']/2), int(d['y'] - d['h']/2), int(d['w']), int(d['h'])
        x, y = max(0, x), max(0, y)
        bw, bh = min(bw, w - x), min(bh, h - y)
        if bw > 0 and bh > 0:
            vis[y:y+2, x:x+bw] = col
            vis[y+bh:y+bh+2, x:x+bw] = col
            vis[y:y+bh, x:x+2] = col
            vis[y:y+bh, x+bw:x+bw+2] = col
    return vis


def compute_map(predictions, ground_truth, iou_threshold=0.5, num_classes=3):
    """Compute simplified mAP (mean Average Precision)."""
    aps = []
    for c in range(num_classes):
        preds_c = [(p['confidence'], p['box']) for p in predictions if p['class_id'] == c]
        gts_c = [g['box'] for g in ground_truth if g['class_id'] == c]
        if len(preds_c) == 0 or len(gts_c) == 0:
            aps.append(0.0)
            continue
        preds_c.sort(reverse=True)
        tp = np.zeros(len(preds_c))
        fp = np.zeros(len(preds_c))
        gt_used = [False] * len(gts_c)
        for i, (_, box) in enumerate(preds_c):
            best_iou, best_j = 0, -1
            for j, gt_box in enumerate(gts_c):
                if gt_used[j]: continue
                iou_val = compute_iou(box, gt_box)
                if iou_val > best_iou:
                    best_iou, best_j = iou_val, j
            if best_iou >= iou_threshold:
                tp[i] = 1; gt_used[best_j] = True
            else:
                fp[i] = 1
        tp_cum, fp_cum = np.cumsum(tp), np.cumsum(fp)
        recalls = tp_cum / len(gts_c)
        precisions = tp_cum / (tp_cum + fp_cum + 1e-12)
        ap = 0.0
        for r in np.linspace(0, 1, 11):
            if (recalls >= r).any():
                ap += float(precisions[recalls >= r].max())
        aps.append(ap / 11.0)
    return float(np.mean(aps)) if aps else 0.0, [float(a) for a in aps]
