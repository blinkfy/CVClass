"""Normalized Cuts — spectral clustering for image segmentation, pure NumPy.

Pipeline:
  1. Downsample to manageable size (~40px max side)
  2. Build dense affinity matrix W (Gaussian on color + spatial distance)
  3. Compute normalized Laplacian: L_sym = I - D^(-1/2) W D^(-1/2)
  4. Full eigendecomposition (eigh) → Fiedler vector
  5. Bipartition + recursive partitioning
"""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray


def _downsample(rgb, max_side=40):
    """Downsample image so the longer side <= max_side."""
    h, w = rgb.shape[:2]
    scale = min(1.0, float(max_side) / float(max(h, w)))
    if scale >= 0.999:
        return rgb
    nh, nw = max(1, int(h * scale)), max(1, int(w * scale))
    ys = np.linspace(0, h - 1, nh).astype(np.int32)
    xs = np.linspace(0, w - 1, nw).astype(np.int32)
    return rgb[ys[:, None], xs[None, :]]


def _build_affinity(pixels, positions, sigma_i=0.1, sigma_x=0.05):
    """Build affinity matrix W[i,j] = exp(-||c_i-c_j||^2 / σ_i² - ||p_i-p_j||^2 / σ_x²).

    Parameters
    ----------
    pixels : ndarray (N, C) float
        Color features, normalized to [0,1].
    positions : ndarray (N, 2) float
        Spatial coordinates, normalized to [0,1].
    sigma_i : float
        Color/intensity bandwidth.
    sigma_x : float
        Spatial bandwidth.
    """
    N = len(pixels)
    # Compute pairwise squared distances efficiently
    # Color distances
    ci_sq = np.sum(pixels ** 2, axis=1)  # (N,)
    color_d2 = np.abs(ci_sq[:, None] + ci_sq[None, :] - 2 * pixels @ pixels.T)
    color_d2 = np.maximum(color_d2, 0)

    # Spatial distances
    px_sq = np.sum(positions ** 2, axis=1)
    pos_d2 = np.abs(px_sq[:, None] + px_sq[None, :] - 2 * positions @ positions.T)
    pos_d2 = np.maximum(pos_d2, 0)

    # Combined affinity
    W = np.exp(-color_d2 / (2 * sigma_i ** 2) - pos_d2 / (2 * sigma_x ** 2))
    # Zero diagonal
    np.fill_diagonal(W, 0)
    return W.astype(np.float64)


def _ncut_bipartition(W, threshold=0.0):
    """Perform one bipartition using normalized cuts.

    Steps:
      1. D = diag(W @ 1)
      2. D_half_inv = D^(-1/2)
      3. L_sym = I - D_half_inv @ W @ D_half_inv
      4. Eigen-decompose L_sym → second smallest eigenvector
      5. Threshold Fiedler vector at 0 (or search for best split)
      6. Return binary labels
    """
    N = W.shape[0]
    d = W.sum(axis=1)
    # Avoid division by zero for isolated nodes
    d_safe = np.maximum(d, 1e-10)

    # Build normalized Laplacian L_sym = I - D^(-1/2) W D^(-1/2)
    d_half_inv = 1.0 / np.sqrt(d_safe)
    L_sym = np.eye(N) - (d_half_inv[:, None] * W) * d_half_inv[None, :]

    # Eigendecomposition — get 3 smallest eigenvalues
    try:
        eigenvalues, eigenvectors = np.linalg.eigh(L_sym)
    except np.linalg.LinAlgError:
        # Fallback: random split
        return np.random.default_rng(0).integers(0, 2, N).astype(bool), [1.0, 0.0]

    # Fiedler vector = second smallest eigenvector (index 1)
    if N < 2:
        return np.zeros(N, dtype=bool), eigenvalues[:2].tolist()

    fiedler = eigenvectors[:, 1]

    # Find best splitting point (minimize Ncut)
    sorted_idx = np.argsort(fiedler)
    sorted_fiedler = fiedler[sorted_idx]

    # Compute cumulative sums for efficient Ncut computation
    d_sorted = d[sorted_idx]
    cumsum_d = np.cumsum(d_sorted)
    total_d = cumsum_d[-1]

    best_ncut = np.inf
    best_split = N // 2

    # Precompute: sum of W[i, j] for j > i (upper triangle reordered)
    # Use vectorized approach: cut_ab[t] = total_cut - sum(W[A,A])
    # cut(A,B) = sum_{i in A} d_i - sum_{i,j in A} W[i,j]
    # Compute prefix sums of d_sorted
    cum_d_assoc = np.zeros(N + 1, dtype=np.float64)
    for i in range(N):
        cum_d_assoc[i + 1] = cum_d_assoc[i] + d[sorted_idx[i]]

    # Compute intra-association for prefix groups: assoc(A,A) = sum_{i,j in A} W[i,j]
    # Build cumulative row sums to approximate
    intra = np.zeros(N + 1, dtype=np.float64)
    for i_idx in range(N):
        i = sorted_idx[i_idx]
        # sum of W[i, j] for j in A (j <= i_idx)
        row_sum = 0.0
        for j_idx in range(i_idx + 1):
            j = sorted_idx[j_idx]
            row_sum += W[i, j]
        intra[i_idx + 1] = intra[i_idx] + row_sum

    min_idx = max(1, int(N * 0.05))
    max_idx = min(N - 1, int(N * 0.95))
    for t in range(min_idx, max_idx):
        assoc_a = cum_d_assoc[t]
        assoc_b = total_d - assoc_a
        if assoc_a < 1e-10 or assoc_b < 1e-10:
            continue
        # cut(A,B) = assoc_a - intra[t]
        cut_ab = assoc_a - intra[t]
        ncut = cut_ab / assoc_a + cut_ab / assoc_b
        if ncut < best_ncut:
            best_ncut = ncut
            best_split = t

    labels = np.zeros(N, dtype=np.int32)
    labels[sorted_idx[best_split:]] = 1

    evals_list = [float(eigenvalues[0]), float(eigenvalues[1])]

    return labels.astype(bool), evals_list


def _kway_ncut(W, max_regions=6, min_size=20, depth=0):
    """Recursive normalized cuts — k-way segmentation."""
    N = W.shape[0]
    if N < min_size or depth >= max_regions - 1:
        return np.zeros(N, dtype=np.int32)

    labels, evals = _ncut_bipartition(W)
    ncut_value = evals[1]  # Fiedler eigenvalue approximates Ncut

    # Stop if Ncut value is too high (bad split)
    if ncut_value > 0.8:
        return np.zeros(N, dtype=np.int32)

    mask_a = ~labels
    mask_b = labels
    count_a = mask_a.sum()
    count_b = mask_b.sum()

    if count_a < min_size or count_b < min_size:
        return np.zeros(N, dtype=np.int32)

    # Recursive partition on each side
    final = np.zeros(N, dtype=np.int32)

    # Subgraph A
    if count_a >= min_size:
        sub_W_a = W[mask_a][:, mask_a]
        sub_labels_a = _kway_ncut(sub_W_a, max_regions, min_size, depth + 1)
        max_label = final.max()
        final[mask_a] = sub_labels_a
        if sub_labels_a.max() == 0:  # Wasn't split further
            final[mask_a] = 0 if max_label == 0 else max_label + 1
        # Renumber labels
        unique_a = np.unique(final[mask_a])
        if len(unique_a) > 1 or unique_a[0] != 0:
            pass  # already handled
    else:
        final[mask_a] = 0

    # Subgraph B — offset labels
    if count_b >= min_size:
        sub_W_b = W[mask_b][:, mask_b]
        sub_labels_b = _kway_ncut(sub_W_b, max_regions, min_size, depth + 1)
        offset = final.max() + 1
        final[mask_b] = sub_labels_b + offset
    else:
        offset = final.max() + 1
        final[mask_b] = offset

    # Renumber labels to be contiguous
    unique_labels = np.unique(final)
    mapping = {old: new for new, old in enumerate(unique_labels)}
    final = np.array([mapping[l] for l in final])

    return final.astype(np.int32)


def _upsample_labels(labels, h_small, w_small, target_shape):
    """Upsample label map from small to original size."""
    H, W = target_shape[:2]
    ys = np.linspace(0, h_small - 1, H).astype(np.int32)
    xs = np.linspace(0, w_small - 1, W).astype(np.int32)
    return labels[ys[:, None], xs[None, :]]


def _colorize_labels(labels):
    """Colorize a label map."""
    colors = np.array([
        [239, 68, 68], [34, 197, 94], [59, 130, 246],
        [245, 158, 11], [168, 85, 247], [20, 184, 166],
        [236, 72, 153], [250, 204, 21],
    ], dtype=np.uint8)
    h, w = labels.shape
    result = np.zeros((h, w, 3), dtype=np.uint8)
    for c in range(min(len(colors), labels.max() + 1)):
        result[labels == c] = colors[c % len(colors)]
    return result


def _draw_boundaries(rgb, labels):
    """Draw segmentation boundaries on original image."""
    vis = np.asarray(rgb, dtype=np.uint8).copy()
    if vis.ndim == 2:
        vis = np.stack([vis] * 3, axis=-1)
    H, W = labels.shape
    # Resize labels if needed
    if labels.shape[:2] != vis.shape[:2]:
        labels = _upsample_labels(labels, labels.shape[0], labels.shape[1], vis.shape[:2])
        H, W = vis.shape[:2]

    h, w = labels.shape[:2]
    # Find boundary pixels (where label differs from neighbor)
    boundary = np.zeros((h, w), dtype=bool)
    boundary[:-1, :] |= (labels[:-1, :] != labels[1:, :])
    boundary[1:, :] |= (labels[1:, :] != labels[:-1, :])
    boundary[:, :-1] |= (labels[:, :-1] != labels[:, 1:])
    boundary[:, 1:] |= (labels[:, 1:] != labels[:, :-1])
    vis[boundary] = [255, 255, 255]
    return vis


def _eigenvalue_vis(eigenvalues, width=400, height=200):
    """Visualize first few eigenvalues as bar chart."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    evals = eigenvalues[:8]
    max_val = max(max(evals), 1e-6)
    bar_w = 30
    gap = 15
    for i, val in enumerate(evals):
        x = 50 + i * (bar_w + gap)
        h_bar = int(val / max_val * 140)
        y0 = height - 30 - h_bar
        col = (59, 130, 246) if i > 1 else ((34, 197, 94) if i == 0 else (239, 68, 68))
        draw.rectangle((x, y0, x + bar_w, height - 30), fill=col)
        draw.text((x, height - 22), f'λ{i + 1}', fill=(51, 65, 85))
        draw.text((x - 4, max(0, y0 - 18)), f'{val:.4f}', fill=col, )
    draw.text((120, 6), 'Eigenvalues of L_sym (λ₁=0, λ₂=Fiedler)', fill=(30, 41, 59))
    return np.array(img)


def _affinity_vis(W, positions, h_small, w_small):
    """Visualize strongest connections in the affinity graph."""
    from PIL import Image, ImageDraw
    h, w = h_small, w_small
    img = Image.new('RGB', (w * 4, h * 4), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    N = W.shape[0]
    # Show top 5% strongest edges
    threshold = np.percentile(W[W > 0], 95) if np.any(W > 0) else 0
    show_W = W.copy()
    show_W[show_W < threshold] = 0

    for i in range(N):
        for j in range(i + 1, N):
            if show_W[i, j] > 0:
                alpha = min(255, int(show_W[i, j] * 255))
                x1, y1 = positions[i]
                x2, y2 = positions[j]
                draw.line((x1 * w * 4, y1 * h * 4, x2 * w * 4, y2 * h * 4),
                          fill=(59, 130, 246, alpha), width=1)
    return np.array(img)


def build_pipeline(image_path=None, image=None, upload_path=None,
                   sigma_i=0.1, sigma_x=0.05,
                   max_regions=6, min_size=15, **kwargs):
    """Normalized Cuts segmentation pipeline.

    Parameters
    ----------
    sigma_i : float
        Color/intensity bandwidth for affinity.
    sigma_x : float
        Spatial bandwidth for affinity.
    max_regions : int
        Maximum number of regions to split into.
    min_size : int
        Minimum region size (pixels in downsampled space).
    """
    path = image_path or upload_path
    if path:
        rgb = load_image_u8(path, mode='rgb', max_side=512)
    elif image is not None:
        rgb = np.asarray(image)
        if rgb.ndim == 2:
            rgb = np.stack([rgb] * 3, axis=-1)
    else:
        h, w = 160, 160
        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        rgb[20:70, 30:130] = [239, 120, 80]
        rgb[90:140, 20:80] = [80, 180, 120]
        rgb[75:135, 90:150] = [80, 120, 220]

    if rgb.shape[2] == 4:
        rgb = rgb[:, :, :3]

    original = rgb.astype(np.uint8)
    H_orig, W_orig = original.shape[:2]

    # Downsample for tractable eigendecomposition
    small_rgb = _downsample(original, max_side=28)
    h_small, w_small = small_rgb.shape[:2]
    N = h_small * w_small

    # Build feature vectors: RGB color + spatial position
    pixels = small_rgb.reshape(-1, 3).astype(np.float64) / 255.0
    xs, ys = np.meshgrid(np.linspace(0, 1, w_small), np.linspace(0, 1, h_small))
    positions = np.stack([xs.ravel(), ys.ravel()], axis=1).astype(np.float64)

    # Build affinity matrix
    sigma_i_val = float(sigma_i)
    sigma_x_val = float(sigma_x)
    W = _build_affinity(pixels, positions, sigma_i=sigma_i_val, sigma_x=sigma_x_val)

    # D and Laplacian
    d = W.sum(axis=1)
    d_safe = np.maximum(d, 1e-10)
    d_half_inv = 1.0 / np.sqrt(d_safe)
    L_sym = np.eye(N) - (d_half_inv[:, None] * W) * d_half_inv[None, :]

    # Eigendecomposition
    try:
        eigenvalues, eigenvectors = np.linalg.eigh(L_sym)
    except np.linalg.LinAlgError:
        eigenvalues = np.zeros(min(N, 10))
        eigenvectors = np.zeros((N, min(N, 10)))

    # Fiedler vector
    fiedler = eigenvectors[:, 1] if N > 1 else np.zeros(N)

    # Recursive k-way partitioning
    region_labels = _kway_ncut(W, max_regions=int(max_regions), min_size=int(min_size))

    # Reshape back to image
    small_labels = region_labels.reshape(h_small, w_small)

    # Upsample to original size
    full_labels = _upsample_labels(small_labels, h_small, w_small, original.shape)

    # Visualizations
    small_color = _colorize_labels(small_labels)
    full_color = _colorize_labels(full_labels)
    boundary_vis = _draw_boundaries(original, full_labels)
    eigen_vis = _eigenvalue_vis(eigenvalues[:min(10, N)])

    # Fiedler vector visualization
    fiedler_img = (fiedler - fiedler.min()) / max(fiedler.max() - fiedler.min(), 1e-8)
    fiedler_img = (fiedler_img.reshape(h_small, w_small) * 255).astype(np.uint8)
    fiedler_vis = np.stack([
        (fiedler_img * 0.7).astype(np.uint8),
        (fiedler_img * 0.3).astype(np.uint8),
        (255 - fiedler_img * 0.7).astype(np.uint8),
    ], axis=-1)

    # Overlay small segmentation on original
    overlay = (original.astype(np.float32) * 0.5 +
               full_color.astype(np.float32) * 0.5).astype(np.uint8)

    n_regions = int(region_labels.max()) + 1 if N > 0 else 0

    steps = [
        {'id': 'original', 'name': '原始图像', 'image': original,
         'explanation': '输入图像。Ncuts 通过全局图割方式分割，不依赖局部滑动窗口。'},
        {'id': 'downsampled', 'name': f'降采样 ({w_small}×{h_small})', 'image': small_rgb,
         'explanation': f'降采样到 {w_small}×{h_small}={N} 像素，每个像素是图中的一个节点。'},
        {'id': 'affinity', 'name': '亲和图 (最强5%边)', 'image': _affinity_vis(W, positions, h_small, w_small),
         'explanation': '蓝色边=颜色和位置都相似的像素对。Ncuts 在这张图上寻找最优分割。'},
        {'id': 'eigenvalues', 'name': '拉普拉斯特征值', 'image': eigen_vis,
         'explanation': 'λ₁≡0（平凡解）。λ₂=Fiedler 特征值，越小表示分割越自然。Ncuts 递归检测 λ₂ 是否大到该停止。'},
        {'id': 'fiedler', 'name': 'Fiedler 向量', 'image': fiedler_vis,
         'explanation': '第二特征向量编码了每个像素属于"哪一侧"。红=正，蓝=负。这是第一次二分的关键信号。'},
        {'id': 'small_seg', 'name': f'降采样分割 ({n_regions} 区域)', 'image': small_color,
         'explanation': f'递归 Ncuts 在降采样空间将图像分为 {n_regions} 个区域。'},
        {'id': 'segmentation', 'name': f'最终分割 ({n_regions} 区域)', 'image': full_color,
         'explanation': f'将低分辨率标签上采样到原图尺寸，得到 {n_regions} 个语义一致的区域。'},
        {'id': 'overlay', 'name': '分割叠加', 'image': overlay,
         'explanation': '半透明叠加显示分割区域与原图的关系。Ncuts 的全局特性使其能捕捉非局部的相似性。'},
        {'id': 'boundaries', 'name': '分割边界', 'image': boundary_vis,
         'explanation': '白色线=区域边界。Ncuts 倾向于在颜色变化大且图割代价小的地方放置边界。'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'backend': 'NumPy (eigh)',
            'algorithm': 'Normalized Cuts (Spectral Clustering)',
            'regions': n_regions,
            'nodes': N,
            'fiedler_eigenvalue': round(float(eigenvalues[1]) if N > 1 else 0.0, 4),
            'sigma_intensity': sigma_i_val,
            'sigma_spatial': sigma_x_val,
            'max_regions': int(max_regions),
        },
    }
