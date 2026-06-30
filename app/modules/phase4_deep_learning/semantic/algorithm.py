"""Semantic segmentation algorithm demonstrations. Pure NumPy.

Demonstrates U-Net style encoder-decoder with skip connections,
pixel-wise classification, and per-class probability maps.
"""
import numpy as np


def simple_segmentation_demo(img, num_classes=5):
    """Demo semantic segmentation using K-means clustering in RGB space."""
    arr = np.asarray(img, dtype=np.float64)
    if arr.ndim == 2:
        arr = np.stack([arr]*3, axis=-1)
    arr = arr / 255.0
    h, w = arr.shape[:2]

    # Downsample for efficiency
    scale = min(1.0, 128.0 / max(h, w))
    if scale < 1.0:
        nh = max(1, int(h * scale))
        nw = max(1, int(w * scale))
        ys = np.linspace(0, h-1, nh).astype(np.int32)
        xs = np.linspace(0, w-1, nw).astype(np.int32)
        small = arr[ys[:, None], xs[None, :]]
    else:
        small = arr
    sh, sw = small.shape[:2]
    pixels = small.reshape(-1, 3)

    n_pixels = len(pixels)
    step = max(1, n_pixels // 200)
    sampled = pixels[::step]
    rng = np.random.default_rng(2026)
    indices = rng.choice(len(sampled), min(num_classes, len(sampled)), replace=False)
    centroids = sampled[indices].copy()

    for _ in range(10):
        dists = np.sum((pixels[:, None] - centroids[None, :])**2, axis=2)
        labels = np.argmin(dists, axis=1)
        for j in range(num_classes):
            if (labels == j).any():
                centroids[j] = pixels[labels == j].mean(axis=0)

    dists = np.sum((pixels[:, None] - centroids[None, :])**2, axis=2)
    small_labels = np.argmin(dists, axis=1).reshape(sh, sw)

    if scale < 1.0:
        ys_full = np.linspace(0, sh-1, h).astype(np.int32)
        xs_full = np.linspace(0, sw-1, w).astype(np.int32)
        seg_map = small_labels[ys_full[:, None], xs_full[None, :]]
    else:
        seg_map = small_labels

    return seg_map.astype(np.int32)


def spatial_smooth(seg_map, num_classes=5, sigma=1.5):
    """Apply Gaussian smoothing to class probability maps for spatial regularization."""
    from scipy.ndimage import gaussian_filter
    h, w = seg_map.shape
    probs = np.zeros((h, w, num_classes), dtype=np.float32)
    for c in range(num_classes):
        probs[:, :, c] = (seg_map == c).astype(np.float32)
        probs[:, :, c] = gaussian_filter(probs[:, :, c], sigma=sigma)
    probs_sum = probs.sum(axis=2, keepdims=True)
    probs = probs / np.maximum(probs_sum, 1e-8)
    return np.argmax(probs, axis=2).astype(np.int32), probs


def compute_class_probability_maps(seg_map, num_classes=5):
    """Create per-class binary masks as probability map images."""
    h, w = seg_map.shape
    prob_maps = []
    for c in range(num_classes):
        mask = (seg_map == c).astype(np.uint8) * 255
        prob_maps.append(mask)
    return prob_maps


def simulate_encoder_decoder(img, num_classes=5, levels=3):
    """
    Simulate a U-Net style encoder-decoder architecture.
    Returns visualization of feature maps at each level.
    """
    arr = np.asarray(img, dtype=np.float64)
    if arr.ndim == 2:
        arr = np.stack([arr]*3, axis=-1)
    if arr.max() > 1: arr = arr / 255.0
    h, w = arr.shape[:2]

    encoder_levels = []
    current = arr.copy()
    for lv in range(levels):
        # Simulate conv + pool: downsample by 2x
        new_h, new_w = max(1, current.shape[0] // 2), max(1, current.shape[1] // 2)
        ys = np.linspace(0, current.shape[0]-1, new_h).astype(np.int32)
        xs = np.linspace(0, current.shape[1]-1, new_w).astype(np.int32)
        down = current[ys[:, None], xs[None, :]]
        # Simulate feature extraction: apply simple filters
        if lv == 0:
            feat = np.abs(np.gradient(down.mean(axis=2)))[0] if down.ndim == 3 else np.abs(np.gradient(down))[0]
        else:
            feat = np.abs(down.mean(axis=2)) if down.ndim == 3 else np.abs(down)
        feat = (feat - feat.min()) / max(feat.max() - feat.min(), 1e-8)
        encoder_levels.append({'name': f'Encoder L{lv+1}', 'features': down, 'activation': feat})
        current = down

    decoder_levels = []
    prev = current
    for lv in range(levels - 1, -1, -1):
        enc = encoder_levels[lv]
        # Upsample
        up_h, up_w = enc['features'].shape[0], enc['features'].shape[1]
        ys = np.linspace(0, prev.shape[0]-1, up_h).astype(np.int32)
        xs = np.linspace(0, prev.shape[1]-1, up_w).astype(np.int32)
        up = prev[ys[:, None], xs[None, :]] if prev.ndim >= 2 else prev
        # Skip connection: blend with encoder features
        if up.ndim == 3 and enc['features'].ndim == 3:
            fused = up * 0.5 + enc['features'] * 0.5
        else:
            fused = up
        decoder_levels.append({'name': f'Decoder L{lv+1}', 'features': fused, 'skip_from': enc['name']})
        prev = fused

    return encoder_levels, decoder_levels


def colorize_segmentation(seg_map, num_classes=5):
    """Colorize a segmentation map for visualization."""
    colors = np.array([
        [220, 38, 38],
        [37, 99, 235],
        [5, 150, 105],
        [217, 119, 6],
        [124, 58, 237],
        [236, 72, 153],
        [20, 184, 166],
        [250, 204, 21],
    ], dtype=np.uint8)
    h, w = seg_map.shape
    result = np.zeros((h, w, 3), dtype=np.uint8)
    for c in range(min(num_classes, len(colors))):
        result[seg_map == c] = colors[c]
    return result
