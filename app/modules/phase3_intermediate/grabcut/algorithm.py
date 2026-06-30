"""GrabCut foreground extraction — pure NumPy implementation.
Uses K-means GMM approximation + iterative energy minimization.
"""
import numpy as np
from scipy.ndimage import convolve


def _kmeans(data, k=5, max_iter=15):
    """K-means clustering with K-means++ initialization."""
    n = len(data)
    if n == 0:
        raise ValueError('K-means requires at least one sample')
    if n < k:
        k = max(1, n)
    # K-means++ init
    rng = np.random.default_rng(2026)
    centroids = [data[rng.integers(n)]]
    for _ in range(1, k):
        dists = np.min([np.sum((data - c) ** 2, axis=1) for c in centroids], axis=0)
        total = float(dists.sum())
        if total <= 1e-12 or not np.isfinite(total):
            # Uniform-color regions make all K-means++ distances zero. Pick a
            # deterministic sample instead of passing an all-zero probability
            # vector to numpy.choice.
            centroids.append(data[len(centroids) % n])
        else:
            probs = dists / total
            centroids.append(data[rng.choice(n, p=probs)])
    centroids = np.array(centroids)
    for _ in range(max_iter):
        dists = np.sum((data[:, None] - centroids[None, :]) ** 2, axis=2)
        labels = np.argmin(dists, axis=1)
        new_c = np.array([data[labels == j].mean(axis=0) if (labels == j).any() else centroids[j] for j in range(k)])
        if np.abs(new_c - centroids).max() < 0.1:
            break
        centroids = new_c
    return centroids, labels


def _build_gmm(pixels, k=5):
    """Build a K-means GMM: mean + diagonal covariance + weight per component."""
    if len(pixels) == 0:
        neutral = np.array([127.0, 127.0, 127.0])
        return [{'mean': neutral, 'weight': 1.0, 'var': np.array([2500.0, 2500.0, 2500.0])}]
    if len(pixels) < k:
        k = max(1, len(pixels))
    centroids, labels = _kmeans(pixels, k)
    components = []
    for j in range(k):
        mask = labels == j
        count = mask.sum()
        if count < 2:
            components.append({'mean': centroids[j], 'weight': 1.0 / k, 'var': np.array([2500.0, 2500.0, 2500.0])})
            continue
        cluster_data = pixels[mask].astype(np.float64)
        mean = cluster_data.mean(axis=0)
        var = np.maximum(cluster_data.var(axis=0), 100.0)  # floor variance
        components.append({'mean': mean, 'weight': float(count) / len(pixels), 'var': var})
    return components


def _gmm_prob_all(img, components):
    """Compute per-pixel probability for a GMM (vectorized)."""
    h, w = img.shape[:2]
    prob = np.zeros((h, w), dtype=np.float64)
    for comp in components:
        diff = img.astype(np.float64) - comp['mean'].reshape(1, 1, 3)
        var = comp['var'].reshape(1, 1, 3)
        # Gaussian log-prob, diagonal covariance
        log_prob = -0.5 * np.sum(diff * diff / var, axis=2) - 0.5 * np.sum(np.log(2 * np.pi * var), axis=2)
        prob += comp['weight'] * np.exp(np.clip(log_prob, -30, 30))
    return np.maximum(prob, 1e-15)


def _graph_cut_refine(img, mask, fg_gmm, bg_gmm, gamma=50.0, iterations=3):
    """Iterative energy minimization (approximates graph cut)."""
    h, w = img.shape[:2]
    result = mask.copy()
    for it in range(iterations):
        fg_prob = _gmm_prob_all(img, fg_gmm)
        bg_prob = _gmm_prob_all(img, bg_gmm)
        data_fg = -np.log(fg_prob + 1e-15)
        data_bg = -np.log(bg_prob + 1e-15)

        # Smoothness: neighbor affinity
        kernel = np.ones((3, 3), dtype=np.float64)
        kernel[1, 1] = 0
        n_fg = convolve((result == 1).astype(np.float64), kernel, mode='constant', cval=0.0)
        n_bg = convolve((result == 0).astype(np.float64), kernel, mode='constant', cval=0.0)

        energy_fg = data_fg - gamma * n_fg
        energy_bg = data_bg - gamma * n_bg
        result = np.where(energy_fg < energy_bg, 1, 0).astype(np.uint8)

        if it < iterations - 1:
            fg_pixels = img[result == 1].reshape(-1, 3)
            bg_pixels = img[result == 0].reshape(-1, 3)
            if len(fg_pixels) >= 10:
                fg_gmm = _build_gmm(fg_pixels.astype(np.float64))
            if len(bg_pixels) >= 10:
                bg_gmm = _build_gmm(bg_pixels.astype(np.float64))
    return result


def grabcut_segment(img, rect):
    img_u8 = np.asarray(img, dtype=np.uint8)
    if img_u8.ndim == 2:
        img_u8 = np.stack([img_u8] * 3, axis=-1)
    h, w = img_u8.shape[:2]
    x, y, rw, rh = rect
    x, y = max(0, x), max(0, y)
    rw, rh = min(rw, w - x), min(rh, h - y)

    # Init mask: inside rect=probable fg, border=definite bg
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y:y + rh, x:x + rw] = 1
    border = 3
    mask[:border, :] = 0
    mask[-border:, :] = 0
    mask[:, :border] = 0
    mask[:, -border:] = 0

    # Sample colors
    fg_pixels = img_u8[mask == 1].reshape(-1, 3).astype(np.float64)
    bg_pixels = img_u8[mask == 0].reshape(-1, 3).astype(np.float64)

    if len(fg_pixels) < 5:
        return np.zeros((h, w), dtype=np.uint8)

    # Build initial GMMs
    fg_gmm = _build_gmm(fg_pixels)
    bg_gmm = _build_gmm(bg_pixels)

    # Iterative refinement
    refined = _graph_cut_refine(img_u8, mask, fg_gmm, bg_gmm, gamma=50.0, iterations=4)
    return np.where(refined > 0, 255, 0).astype(np.uint8)
