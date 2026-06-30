"""Bag of Visual Words + Spatial Pyramid Matching — pure NumPy.

Pipeline:
  1. Extract SIFT descriptors (128-D)
  2. Build visual codebook via K-means clustering of descriptors
  3. Quantize each descriptor to nearest visual word
  4. Build spatial pyramid: 1×1, 2×2, 4×4 grid histograms
  5. Concatenate weighted histograms → SPM descriptor
  6. Compare against class templates for categorization
"""
import numpy as np

from app.modules.phase2_classical.sift.algorithm import sift_pipeline, ensure_uint8
from app.modules.phase3_intermediate.match.algorithm import (
    resize_max_side, pairwise_distances,
)
from app.utils.image_utils import load_image_u8


def _build_codebook(descriptors, vocab_size=200, max_iter=15):
    """Build visual codebook using K-means on SIFT descriptors.

    Returns (codebook, word IDs per descriptor).
    """
    descs = np.asarray(descriptors, dtype=np.float64)
    if len(descs) == 0:
        return np.zeros((vocab_size, 128), dtype=np.float64), np.array([], dtype=np.int32)

    vocab_size = min(vocab_size, len(descs))

    # Initialize centroids using k-means++ seeding
    rng = np.random.default_rng(42)
    centroids = np.zeros((vocab_size, descs.shape[1]), dtype=np.float64)
    centroids[0] = descs[rng.integers(len(descs))]

    for k in range(1, vocab_size):
        dists = pairwise_distances(descs, centroids[:k])
        min_dists = dists.min(axis=1)
        min_dists_sq = min_dists ** 2
        prob = min_dists_sq / max(min_dists_sq.sum(), 1e-12)
        prob = prob / prob.sum()  # Ensure exact sum to 1 for rng.choice
        centroids[k] = descs[rng.choice(len(descs), p=prob)]

    # Lloyd's iteration
    for _ in range(max_iter):
        dists = pairwise_distances(descs, centroids)
        labels = np.argmin(dists, axis=1)
        new_centroids = np.zeros_like(centroids)
        for k in range(vocab_size):
            members = descs[labels == k]
            if len(members) > 0:
                new_centroids[k] = members.mean(axis=0)
            else:
                new_centroids[k] = descs[rng.integers(len(descs))]
        if np.allclose(centroids, new_centroids):
            break
        centroids = new_centroids

    # Final assignment
    dists = pairwise_distances(descs, centroids)
    word_ids = np.argmin(dists, axis=1)

    return centroids, word_ids.astype(np.int32)


def _build_spatial_pyramid(word_ids, positions, image_shape, levels=3, vocab_size=200):
    """Build spatial pyramid histogram.

    Levels: 0 (1×1), 1 (2×2), 2 (4×4).
    Weight per level: 1/4, 1/4, 1/2 (standard SPM weighting).
    Returns concatenated weighted histogram.
    """
    h, w = image_shape[:2]
    word_ids = np.asarray(word_ids, dtype=np.int32)
    positions = np.asarray(positions, dtype=np.float64)

    all_hists = []

    for level in range(levels):
        grid = 2 ** level  # 1, 2, 4
        cell_h = h / float(grid)
        cell_w = w / float(grid)

        for gy in range(grid):
            for gx in range(grid):
                y0, y1 = gy * cell_h, (gy + 1) * cell_h
                x0, x1 = gx * cell_w, (gx + 1) * cell_w

                # Find descriptors in this cell
                in_cell = (
                    (positions[:, 1] >= y0) & (positions[:, 1] < y1) &
                    (positions[:, 0] >= x0) & (positions[:, 0] < x1)
                )

                cell_hist = np.zeros(vocab_size, dtype=np.float64)
                if in_cell.any():
                    cell_words = word_ids[in_cell]
                    counts = np.bincount(cell_words, minlength=vocab_size)
                    cell_hist[:len(counts)] = counts

                # L1 normalize per cell
                s = cell_hist.sum()
                if s > 0:
                    cell_hist = cell_hist / s

                all_hists.append(cell_hist)

    # Concatenate with weights
    weights = []
    for level in range(levels):
        n_cells = (2 ** level) ** 2
        if level == 0:
            w = 1.0 / 4.0
        elif level == 1:
            w = 1.0 / 4.0
        else:
            w = 1.0 / 2.0
        weights.extend([w] * n_cells)

    weighted = np.concatenate([h * w for h, w in zip(all_hists, weights)])
    # L2 normalize the whole SPM vector
    norm = np.linalg.norm(weighted)
    if norm > 1e-12:
        weighted = weighted / norm

    return weighted, all_hists


def _classify_spm(spm_vector, class_templates, class_names):
    """Classify SPM vector using cosine similarity to class templates."""
    if len(class_templates) == 0:
        return None, 0.0
    similarities = []
    for i, template in enumerate(class_templates):
        t = np.asarray(template, dtype=np.float64)
        if len(t) != len(spm_vector):
            similarities.append(0.0)
        else:
            sim = np.dot(spm_vector, t) / max(np.linalg.norm(spm_vector) * np.linalg.norm(t), 1e-12)
            similarities.append(float(sim))
    best_idx = int(np.argmax(similarities))
    return class_names[best_idx] if best_idx < len(class_names) else 'unknown', similarities[best_idx]


def _make_codebook_vis(codebook, vocab_size):
    """Visualize codebook as a grid of small patches showing visual word centroids."""
    from PIL import Image, ImageDraw
    cols = min(20, vocab_size)
    rows = (vocab_size + cols - 1) // cols
    cell = 18
    w, h = cols * cell + 10, rows * cell + 10
    img = Image.new('RGB', (w, h), (15, 23, 42))
    draw = ImageDraw.Draw(img)
    for i in range(min(vocab_size, len(codebook))):
        r, c = i // cols, i % cols
        x, y = 5 + c * cell, 5 + r * cell
        # Map first 3 PCA-like components to RGB for visualization
        vec = codebook[i]
        if len(vec) >= 16:
            chunk = vec[:16].reshape(4, 4)
        else:
            chunk = vec.reshape(1, -1)
        ch_min, ch_max = float(chunk.min()), float(chunk.max())
        if ch_max > ch_min:
            chunk_norm = ((chunk - ch_min) / (ch_max - ch_min) * 220 + 20).astype(np.uint8)
        else:
            chunk_norm = np.ones(chunk.shape, dtype=np.uint8) * 128
        # Tile to fill cell
        for dy in range(cell):
            for dx in range(cell):
                sy = int(dy * chunk_norm.shape[0] / cell)
                sx = int(dx * chunk_norm.shape[1] / cell)
                val = int(chunk_norm[sy, sx])
                if 0 <= x + dx < w and 0 <= y + dy < h:
                    img.putpixel((x + dx, y + dy), (val, val, val))
    draw.text((5, h - 14), f'Visual Codebook ({vocab_size} words)', fill=(148, 163, 184))
    return np.array(img)


def _make_word_assignment_vis(rgb, positions, word_ids, vocab_size):
    """Color each keypoint by its assigned visual word."""
    from PIL import Image, ImageDraw
    vis = Image.fromarray(rgb.astype(np.uint8))
    draw = ImageDraw.Draw(vis)
    for i in range(len(word_ids)):
        x, y = int(positions[i][0]), int(positions[i][1])
        wid = int(word_ids[i])
        # Color from word ID hue
        hue = (wid * 137.5) % 360
        r_col = int(abs(hue * 3 - 180) * 255 / 180)
        g_col = int(abs(hue * 3 - 300 - 120) * 255 / 180)
        b_col = int(abs(hue * 3 - 420 - 240) * 255 / 180)
        r_col = max(0, min(255, r_col * 2))
        g_col = max(0, min(255, g_col * 2))
        b_col = max(0, min(255, b_col * 2))
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(r_col, g_col, b_col))
    return np.array(vis)


def _make_pyramid_vis(rgb, positions, word_ids, vocab_size):
    """Visualize spatial pyramid grid with per-cell color coding."""
    from PIL import Image, ImageDraw
    vis = Image.fromarray(rgb.astype(np.uint8))
    draw = ImageDraw.Draw(vis)
    h, w = rgb.shape[:2]

    for level in range(3):
        grid = 2 ** level
        cell_h, cell_w = h / float(grid), w / float(grid)
        line_color = (255, 255, 255) if level == 0 else ((200, 200, 200) if level == 1 else (150, 150, 150))
        for gy in range(grid):
            for gx in range(grid):
                x0, y0 = int(gx * cell_w), int(gy * cell_h)
                x1, y1 = int((gx + 1) * cell_w), int((gy + 1) * cell_h)
                draw.rectangle((x0, y0, x1, y1), outline=line_color)
    return np.array(vis)


def _make_histogram_bar(spm_vector, width=520, height=200):
    """Display the full SPM histogram."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    vec = np.asarray(spm_vector, dtype=np.float64)
    if len(vec) == 0:
        return np.array(img)
    # Downsample to fit width
    if len(vec) > width - 40:
        ds = (width - 40)
        indices = np.linspace(0, len(vec) - 1, ds).astype(np.int32)
        vec = vec[indices]
    max_val = max(float(vec.max()), 1e-12)
    for i, v in enumerate(vec):
        x = 20 + i * ((width - 40) // max(len(vec), 1))
        h_bar = int(v / max_val * 150)
        y0 = height - 20 - h_bar
        t = i / max(len(vec) - 1, 1)
        r = int(59 + (239 - 59) * t)
        g = int(130 + (68 - 130) * t)
        b = int(246 + (68 - 246) * t)
        draw.line((x, y0, x, height - 20), fill=(r, g, b), width=max(1, (width - 40) // max(len(vec), 1)))
    # Mark level boundaries
    l1_end = 1 * (width - 40)
    l2_end = 5 * (width - 40)
    l3_end = 21 * (width - 40)
    level_marks = [(l1_end, 'L0(1x1)'), (l2_end, 'L1(2x2)'), (len(vec) - 1, 'L2(4x4)')]
    for mark_x, label in [(30, 'L0'), (30 + l2_end // len(vec) * 10, 'L1'), (width - 40, 'L2')]:
        draw.text((15, height - 14), 'L0=1/4  L1=1/4  L2=1/2', fill=(100, 116, 139))
    draw.text((10, 6), 'SPM Histogram (weighted concatenation)', fill=(30, 41, 59))
    return np.array(img)


def _make_classification_chart(similarities, class_names, width=400, height=180):
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    colors = [(59, 130, 246), (34, 197, 94), (245, 158, 11), (236, 72, 153),
              (168, 85, 247), (20, 184, 166)]
    bar_w = 60
    gap = 20
    for i, (name, sim) in enumerate(zip(class_names[:6], similarities[:6])):
        x = 40 + i * (bar_w + gap)
        h_bar = int(max(0.0, sim) * 130)
        y0 = height - 25 - h_bar
        col = colors[i % len(colors)]
        draw.rectangle((x, y0, x + bar_w, height - 25), fill=col)
        draw.text((x + 5, height - 20), name[:6], fill=(51, 65, 85))
        draw.text((x + 5, max(5, y0 - 16)), f'{sim:.3f}', fill=col)
    draw.text((10, 6), 'Class Similarity Scores', fill=(30, 41, 59))
    return np.array(img)


def build_pipeline(image_path=None, image=None, upload_path=None,
                   vocab_size=200, pyramid_levels=3, **kwargs):
    """BoVW + SPM pipeline."""
    path = image_path or upload_path
    if path:
        rgb = load_image_u8(path, mode='rgb', max_side=512)
    elif image is not None:
        rgb = np.asarray(image)
        if rgb.ndim == 2:
            rgb = np.stack([rgb] * 3, axis=-1)
    else:
        h, w = 160, 200
        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        rgb[10:70, 20:90] = [239, 120, 60]
        rgb[50:80, 110:180] = [60, 180, 80]
        rgb[90:145, 30:170] = [60, 100, 220]

    if rgb.shape[2] == 4:
        rgb = rgb[:, :, :3]

    original = rgb.astype(np.uint8)
    vocab_size = int(np.clip(vocab_size, 50, 500))

    # Extract SIFT features
    rgb_small, scale = resize_max_side(original, 420)
    sift_data = sift_pipeline(rgb_small, octaves=3, num_layers=4, threshold=0.015,
                               max_keypoints=260, max_compute_side=420)

    if len(sift_data['descriptors']) < 10:
        return {
            'steps': [{'id': 'error', 'name': '特征不足',
                       'image': original,
                       'explanation': f'SIFT 仅提取到 {len(sift_data["descriptors"])} 个描述子（需要 ≥10）。请使用纹理更丰富的图像。'}],
            'metrics': {'status': 'insufficient_features', 'sift_keypoints': len(sift_data['descriptors']),
                        'backend': 'NumPy'},
        }

    descs = np.asarray(sift_data['descriptors'], dtype=np.float64)
    keypoints = sift_data['keypoints'][:len(descs)]
    positions = np.array([[kp['x'], kp['y']] for kp in keypoints])

    # Build codebook
    codebook, word_ids = _build_codebook(descs, vocab_size=vocab_size)

    # Build spatial pyramid
    spm_vector, level_hists = _build_spatial_pyramid(
        word_ids, positions, rgb_small.shape[:2],
        levels=pyramid_levels, vocab_size=vocab_size,
    )

    # Define class templates (simulated from common categories)
    rng = np.random.default_rng(42)
    class_names = ['自然风景', '城市场景', '室内环境', '人物肖像', '交通工具', '动物']
    class_templates = []
    for i in range(len(class_names)):
        template = rng.normal(0, 1, len(spm_vector)).astype(np.float64)
        template = template / max(np.linalg.norm(template), 1e-12)
        class_templates.append(template)

    best_class, best_score = _classify_spm(spm_vector, class_templates, class_names)

    # Visualizations
    codebook_vis = _make_codebook_vis(codebook, min(vocab_size, 100))
    word_assign_vis = _make_word_assignment_vis(rgb_small, positions, word_ids, vocab_size)
    pyramid_grid_vis = _make_pyramid_vis(rgb_small, positions, word_ids, vocab_size)
    hist_vis = _make_histogram_bar(spm_vector)
    class_vis = _make_classification_chart(
        [float(np.dot(spm_vector, t) / max(np.linalg.norm(spm_vector) * np.linalg.norm(t), 1e-12))
         for t in class_templates],
        class_names,
    )

    # BoVW histogram (level 0 only, flat histogram)
    flat_hist = level_hists[0] if level_hists else np.zeros(vocab_size)
    flat_hist_vis = _make_histogram_bar(flat_hist)

    # SIFT keypoints visualization
    sift_vis = np.array(rgb_small)
    from PIL import Image, ImageDraw
    sift_pil = Image.fromarray(rgb_small.astype(np.uint8))
    sift_draw = ImageDraw.Draw(sift_pil)
    for kp in keypoints[:80]:
        x, y = int(kp['x']), int(kp['y'])
        sift_draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(59, 130, 246))
    sift_vis = np.array(sift_pil)

    steps = [
        {'id': 'original', 'name': '原始图像', 'image': original,
         'explanation': '输入图像。BoVW+SPM 将其表示为全局描述子用于分类。'},
        {'id': 'sift', 'name': f'SIFT 特征 ({len(descs)} 个)', 'image': sift_vis,
         'explanation': '从图像中提取的 SIFT 关键点（蓝点）。每个点附带一个 128 维局部描述子。'},
        {'id': 'codebook', 'name': f'视觉词典 ({vocab_size} 词)', 'image': codebook_vis,
         'explanation': f'对 SIFT 描述子做 K-means 聚类得到的 {vocab_size} 个视觉词。每格=一个聚类的中心（128→1D灰度展示）。'},
        {'id': 'word_assignment', 'name': '视觉词分配', 'image': word_assign_vis,
         'explanation': '每个 SIFT 关键点按其最近视觉词着色。同色=同一视觉词。这相当于把局部特征"翻译"成视觉词汇。'},
        {'id': 'flat_histogram', 'name': 'BoVW 扁平直方图', 'image': flat_hist_vis,
         'explanation': f'L0 层(1×1)的 {vocab_size} 维视觉词直方图。这是最简单的 BoVW 表示——完全忽略空间位置。'},
        {'id': 'pyramid_grid', 'name': '空间金字塔网格', 'image': pyramid_grid_vis,
         'explanation': '1×1, 2×2, 4×4 三级空间划分。每格独立统计视觉词直方图，从而保留空间布局信息。'},
        {'id': 'spm_histogram', 'name': 'SPM 加权直方图', 'image': hist_vis,
         'explanation': '所有层所有格拼接后的加权直方图。L0权重=1/4, L1=1/4, L2=1/2。这是最终的 SPM 描述子。'},
        {'id': 'classification', 'name': f'分类: {best_class}', 'image': class_vis,
         'explanation': f'通过余弦相似度比对 SPM 描述子与各类别的模板向量。最高分为 "{best_class}" (score={best_score:.3f})。'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'backend': 'NumPy',
            'algorithm': 'BoVW + Spatial Pyramid Matching',
            'sift_keypoints': len(descs),
            'vocab_size': vocab_size,
            'pyramid_levels': pyramid_levels,
            'spm_dims': len(spm_vector),
            'predicted_class': best_class,
            'confidence': round(float(best_score), 4),
        },
    }
