"""Epipolar geometry — Fundamental matrix estimation via normalized 8-point algorithm.

Pure NumPy: extract SIFT features → match → normalize → 8-point → F → epipolar lines → E → R,t.
"""
import numpy as np

from app.modules.phase3_intermediate.match.algorithm import (
    extract_features, pairwise_distances, match_descriptors,
    resize_max_side,
)
from app.utils.image_utils import load_image_u8, ensure_gray


def _normalize_points(points):
    """Isotropic scaling: translate to centroid, scale so mean distance = sqrt(2).
    Returns (norm_points, T) where T is the 3x3 normalization matrix."""
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim == 1:
        pts = pts.reshape(-1, 2)
    mean = pts.mean(axis=0)
    shifted = pts - mean
    avg_dist = np.mean(np.sqrt(np.sum(shifted ** 2, axis=1)))
    scale = np.sqrt(2.0) / avg_dist if avg_dist > 1e-12 else 1.0
    T = np.array([[scale, 0, -scale * mean[0]],
                   [0, scale, -scale * mean[1]],
                   [0, 0, 1]], dtype=np.float64)
    homogeneous = np.column_stack([pts, np.ones(len(pts))])
    norm = homogeneous @ T.T
    return norm[:, :2], T


def _estimate_fundamental_matrix(pts1, pts2):
    """Normalized 8-point algorithm for Fundamental matrix F.

    Steps:
    1. Normalize both point sets (isotropic scaling)
    2. Build linear system from x2^T * F * x1 = 0
    3. Solve via SVD (last column of V)
    4. Enforce rank-2 constraint (set smallest singular value to 0)
    5. Denormalize: F = T2^T * F_norm * T1
    """
    if len(pts1) < 8:
        return None, None, None

    n1, T1 = _normalize_points(pts1)
    n2, T2 = _normalize_points(pts2)

    # Build constraint matrix A: for each (x1,y1,1) -> (x2,y2,1):
    # [x2*x1, x2*y1, x2, y2*x1, y2*y1, y2, x1, y1, 1] * f = 0
    A = np.zeros((len(n1), 9), dtype=np.float64)
    A[:, 0] = n2[:, 0] * n1[:, 0]
    A[:, 1] = n2[:, 0] * n1[:, 1]
    A[:, 2] = n2[:, 0]
    A[:, 3] = n2[:, 1] * n1[:, 0]
    A[:, 4] = n2[:, 1] * n1[:, 1]
    A[:, 5] = n2[:, 1]
    A[:, 6] = n1[:, 0]
    A[:, 7] = n1[:, 1]
    A[:, 8] = 1.0

    try:
        _, _, vt = np.linalg.svd(A)
    except np.linalg.LinAlgError:
        return None, n1, n2

    F_vec = vt[-1].reshape(3, 3)

    # Enforce rank-2: SVD of F, set smallest singular value to 0
    U, S, Vt = np.linalg.svd(F_vec)
    S[2] = 0.0
    F_norm = U @ np.diag(S) @ Vt

    # Denormalize
    F = T2.T @ F_norm @ T1
    # Normalize F so F[2,2] = 1 or unit norm
    if abs(F[2, 2]) > 1e-10:
        F = F / F[2, 2]

    return F, n1, n2


def _compute_epipolar_lines(F, points, is_left=True):
    """Compute epipolar lines for each point.
    For left image: line = F.T @ p_right
    For right image: line = F @ p_left
    Each line is (a, b, c) representing a*x + b*y + c = 0.
    """
    pts = np.asarray(points, dtype=np.float64)
    homogeneous = np.column_stack([pts, np.ones(len(pts))])
    lines = []
    for i in range(len(homogeneous)):
        if is_left:
            l_vec = F.T @ homogeneous[i]
        else:
            l_vec = F @ homogeneous[i]
        a, b, c = l_vec[0], l_vec[1], l_vec[2]
        norm = np.sqrt(a * a + b * b)
        if norm > 1e-12:
            a, b, c = a / norm, b / norm, c / norm
        lines.append((float(a), float(b), float(c)))
    return lines


def _draw_epipolar_lines(img, points, lines, color=(239, 68, 68)):
    """Draw epipolar lines on image."""
    vis = np.asarray(img).copy()
    if vis.ndim == 2:
        vis = np.stack([vis] * 3, axis=-1)
    h, w = vis.shape[:2]
    for pt, (a, b, c) in zip(points[:30], lines[:30]):
        x, y = int(pt[0]), int(pt[1])
        # Draw point
        y0, y1 = max(0, y - 2), min(h, y + 3)
        x0, x1 = max(0, x - 2), min(w, x + 3)
        vis[y0:y1, x0:x1] = (59, 130, 246)
        # Draw epipolar line across image width
        # Line: a*x + b*y + c = 0 -> y = -(a*x + c)/b
        if abs(b) > 1e-10:
            for lx in [0, w - 1]:
                ly = int(-(a * lx + c) / b)
                if 0 <= ly < h:
                    ly0, ly1 = max(0, ly - 1), min(h, ly + 2)
                    lx0, lx1 = max(0, lx - 1), min(w, lx + 2)
                    vis[ly0:ly1, lx0:lx1] = color
        elif abs(a) > 1e-10:
            for ly in [0, h - 1]:
                lx = int(-(b * ly + c) / a)
                if 0 <= lx < w:
                    ly0, ly1 = max(0, ly - 1), min(h, ly + 2)
                    lx0, lx1 = max(0, lx - 1), min(w, lx + 2)
                    vis[ly0:ly1, lx0:lx1] = color
    return vis


def _draw_matches(img_left, img_right, pts1, pts2, lines1, lines2, max_show=30):
    """Draw side-by-side view with epipolar lines and matches."""
    h1, w1 = img_left.shape[:2]
    h2, w2 = img_right.shape[:2]
    h = max(h1, h2)
    w = w1 + w2
    canvas = np.zeros((h, w, 3), dtype=np.uint8)
    canvas[:h1, :w1] = img_left[:, :, :3] if img_left.ndim == 3 else np.stack([img_left] * 3, axis=-1)
    canvas[:h2, w1:w1 + w2] = img_right[:, :, :3] if img_right.ndim == 3 else np.stack([img_right] * 3, axis=-1)
    canvas = canvas.copy()

    colors = [(59, 130, 246), (34, 197, 94), (245, 158, 11), (236, 72, 153),
              (168, 85, 247), (20, 184, 166)]
    for i in range(min(len(pts1), max_show)):
        col = colors[i % len(colors)]
        x1, y1 = int(pts1[i][0]), int(pts1[i][1])
        x2, y2 = int(pts2[i][0]) + w1, int(pts2[i][1])
        # Draw points
        for px, py in [(x1, y1), (x2, y2)]:
            py0, py1 = max(0, py - 2), min(h, py + 3)
            px0, px1 = max(0, px - 2), min(w, px + 3)
            canvas[py0:py1, px0:px1] = col
        # Draw connecting line
        steps = max(abs(x2 - x1), abs(y2 - y1), 1)
        for t in range(steps + 1):
            sx = int(x1 + (x2 - x1) * t / steps)
            sy = int(y1 + (y2 - y1) * t / steps)
            if 0 <= sx < w and 0 <= sy < h:
                canvas[sy, sx] = col
    return canvas


def _synthesize_right_view(rgb, angle_deg=8.0, tx=0.05):
    """Create a synthetic second view by applying a small rotation and translation.

    This simulates a camera rotating slightly around the vertical axis,
    producing a view pair with known epipolar geometry for teaching.
    Returns (right_view, H_ground_truth).
    """
    h, w = rgb.shape[:2]
    angle = np.radians(angle_deg)

    # Build homography: H = K * R * K^{-1} (pure rotation)
    K = np.array([[w, 0, w / 2],
                   [0, w, h / 2],
                   [0, 0, 1]], dtype=np.float64)

    R = np.array([[np.cos(angle), 0, np.sin(angle)],
                   [0, 1, 0],
                   [-np.sin(angle), 0, np.cos(angle)]], dtype=np.float64)

    # Add small translation effect via skew
    R[0, 2] += tx

    H = K @ R @ np.linalg.inv(K)
    H = H / H[2, 2]

    # Apply homography via inverse mapping
    ys, xs = np.mgrid[0:h, 0:w]
    coords = np.stack([xs.ravel(), ys.ravel(), np.ones(h * w)], axis=0)
    H_inv = np.linalg.inv(H)
    warped = H_inv @ coords
    warped = warped / np.maximum(warped[2], 1e-12)
    wx = warped[0].reshape(h, w)
    wy = warped[1].reshape(h, w)

    right = np.zeros_like(rgb)
    for c in range(3):
        valid = (wx >= 0) & (wx < w - 1) & (wy >= 0) & (wy < h - 1)
        wxi = np.clip(wx.astype(np.int32), 0, w - 2)
        wyi = np.clip(wy.astype(np.int32), 0, h - 2)
        fx = wx - wxi
        fy = wy - wyi
        # Bilinear interpolation
        ch = rgb[:, :, c].astype(np.float64)
        right[:, :, c] = np.where(valid,
            ((1 - fx) * (1 - fy) * ch[wyi, wxi] +
              fx * (1 - fy) * ch[wyi, np.clip(wxi + 1, 0, w - 1)] +
              (1 - fx) * fy * ch[np.clip(wyi + 1, 0, h - 1), wxi] +
              fx * fy * ch[np.clip(wyi + 1, 0, h - 1), np.clip(wxi + 1, 0, w - 1)]).astype(np.uint8),
            0)
    return right.astype(np.uint8), H


def _matrix_to_image(mat, cell_size=40, fmt='.3f'):
    """Render a matrix as a PIL image."""
    from PIL import Image, ImageDraw
    rows, cols = mat.shape
    w = cols * cell_size + 20
    h = rows * cell_size + 20
    img = Image.new('RGB', (w, h), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    for r in range(rows):
        for c in range(cols):
            x, y = 10 + c * cell_size, 10 + r * cell_size
            draw.rectangle((x, y, x + cell_size - 2, y + cell_size - 2),
                           fill=(255, 255, 255), outline=(200, 210, 220))
            val = float(mat[r, c])
            text = f'{val:{fmt}}'
            draw.text((x + 4, y + 10), text, fill=(15, 23, 42))
    return np.array(img)


def _svd_chart(S, width=480, height=200):
    """Bar chart showing singular values."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    labels = ['σ₁', 'σ₂', 'σ₃']
    colors = [(59, 130, 246), (34, 197, 94), (239, 68, 68)]
    bar_area_w = width - 120
    bar_w = 50
    gap = 30
    max_s = max(float(S.max()), 1e-8)
    for i, (label, col) in enumerate(zip(labels, colors)):
        x = 80 + i * (bar_w + gap)
        h_bar = int(S[i] / max_s * 140)
        y0 = height - 30 - h_bar
        draw.rectangle((x, y0, x + bar_w, height - 30), fill=col)
        draw.text((x + 8, y0 - 20), f'{S[i]:.4f}', fill=col)
        draw.text((x + 6, height - 25), label, fill=(51, 65, 85))
    if len(S) > 2 and abs(S[2]) < 0.001 * abs(S[0]):
        draw.text((240, 16), 'σ₃ ≈ 0 → rank-2 约束', fill=(239, 68, 68))
    return np.array(img)


def build_pipeline(image_path=None, image=None, upload_path=None,
                   ratio=0.75, max_matches=120, **kwargs):
    """Epipolar geometry pipeline.

    1. Synthesize second view from input via projective warp
    2. Extract SIFT features from both views
    3. Match features with ratio test
    4. Estimate Fundamental matrix F (normalized 8-point)
    5. Draw epipolar lines
    6. Recover Essential matrix E and decompose to R,t
    """
    path = image_path or upload_path
    if path:
        rgb = load_image_u8(path, mode='rgb', max_side=512)
    elif image is not None:
        rgb = np.asarray(image)
        if rgb.ndim == 2:
            rgb = np.stack([rgb] * 3, axis=-1)
    else:
        h, w = 240, 320
        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        for i in range(5):
            for j in range(5):
                y0, x0 = i * 48, j * 64
                rgb[y0:y0 + 48, x0:x0 + 64] = 255 if (i + j) % 2 == 0 else 40

    if rgb.shape[2] == 4:
        rgb = rgb[:, :, :3]

    # Resize for feature extraction speed
    rgb_small, scale = resize_max_side(rgb, 480)
    left = rgb_small.astype(np.uint8)

    # Synthesize right view
    right, H_gt = _synthesize_right_view(left, angle_deg=6.0, tx=0.03)

    # Extract SIFT features
    _, pts_left, desc_left, _ = extract_features(left, method='sift', max_points=200)
    _, pts_right, desc_right, _ = extract_features(right, method='sift', max_points=200)

    raw_matches, accepted = match_descriptors(desc_left, desc_right, ratio=float(ratio),
                                               max_matches=int(max_matches))

    if len(accepted) < 8:
        # Fallback: use raw matches if not enough accepted
        use_matches = raw_matches[:min(int(max_matches), len(raw_matches))]
    else:
        use_matches = accepted[:min(int(max_matches), len(accepted))]

    pts1 = np.array([[pts_left[m['left']]['x'], pts_left[m['left']]['y']] for m in use_matches])
    pts2 = np.array([[pts_right[m['right']]['x'], pts_right[m['right']]['y']] for m in use_matches])

    # Estimate F
    F, n1, n2 = _estimate_fundamental_matrix(pts1, pts2)

    if F is None:
        return {
            'steps': [
                {'id': 'input_pair', 'name': '左右视图', 'image': np.hstack([left, right]),
                 'explanation': '左图为原始输入，右图为模拟相机旋转后的视图。'},
                {'id': 'error', 'name': '特征匹配不足',
                 'image': np.zeros((100, 400, 3), dtype=np.uint8) + 240,
                 'explanation': f'仅匹配到 {len(accepted)} 对（需要 ≥8 对才能估计 F 矩阵）。请尝试更丰富的纹理图像。'},
            ],
            'metrics': {'status': 'too_few_matches', 'matches': len(accepted),
                        'required': 8, 'backend': 'NumPy'},
        }

    # Compute epipolar lines
    epi_lines_left = _compute_epipolar_lines(F, pts1, is_left=True)
    epi_lines_right = _compute_epipolar_lines(F, pts2, is_left=False)

    # Draw visualizations
    left_with_lines = _draw_epipolar_lines(left, pts2, epi_lines_left)
    right_with_lines = _draw_epipolar_lines(right, pts1, epi_lines_right)
    pair_vis = _draw_matches(left, right, pts1, pts2, epi_lines_left, epi_lines_right)

    # Epipolar line detail (zoomed view for first few matches)
    epi_detail = _draw_epipolar_lines(left, pts2[:6], epi_lines_left[:6])

    # Matrix visualizations
    f_img = _matrix_to_image(F, cell_size=50, fmt='.4f')

    # Singular values of F
    Uf, Sf, Vft = np.linalg.svd(F)
    sv_chart = _svd_chart(Sf)

    # Estimate Essential matrix (assume K ~ identity * max(w,h))
    h, w = left.shape[:2]
    f_approx = max(w, h)
    K_approx = np.array([[f_approx, 0, w / 2],
                          [0, f_approx, h / 2],
                          [0, 0, 1]], dtype=np.float64)
    E = K_approx.T @ F @ K_approx

    # Decompose E
    Ue, Se, Vet = np.linalg.svd(E)
    # Ensure proper rotation
    if np.linalg.det(Ue) < 0: Ue[:, 2] *= -1
    if np.linalg.det(Vet.T) < 0: Vet[2, :] *= -1

    W = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=np.float64)
    R = Ue @ W @ Vet
    t = Ue[:, 2]

    e_img = _matrix_to_image(E, cell_size=50, fmt='.2f')
    rt_img = _matrix_to_image(np.column_stack([R, t.reshape(3, 1)]), cell_size=35, fmt='.3f')

    # Sampson error for first few matches
    errors = []
    for i in range(len(pts1)):
        x1 = np.append(pts1[i], 1.0)
        x2 = np.append(pts2[i], 1.0)
        Fx1 = F @ x1
        Ftx2 = F.T @ x2
        err = (x2 @ Fx1) ** 2 / (Fx1[0] ** 2 + Fx1[1] ** 2 + Ftx2[0] ** 2 + Ftx2[1] ** 2 + 1e-12)
        errors.append(float(err))

    steps = [
        {'id': 'input_pair', 'name': '左右视图', 'image': pair_vis,
         'explanation': f'左图=原始输入，右图=模拟相机旋转后视图。匹配点用彩色连线标识 ({len(use_matches)} 对)。'},
        {'id': 'left_epipolar', 'name': '左图 + 对极线', 'image': left_with_lines,
         'explanation': '红色线为右图匹配点对应的对极线。所有对极线交汇于左极点 e₁。'},
        {'id': 'right_epipolar', 'name': '右图 + 对极线', 'image': right_with_lines,
         'explanation': '红色线为左图匹配点对应的对极线。所有对极线交汇于右极点 e₂。'},
        {'id': 'fundamental_matrix', 'name': '基础矩阵 F', 'image': f_img,
         'explanation': '3×3 矩阵 F，秩为2。满足 x₂ᵀ F x₁ = 0，即右图像点在左图对应极线上。det(F)=0。'},
        {'id': 'svd', 'name': 'F 的奇异值', 'image': sv_chart,
         'explanation': 'σ₃ 被强制置零以满足 rank(F)=2 约束。这是 8 点法的核心步骤。'},
        {'id': 'epi_detail', 'name': '对极线细节（前6点）', 'image': epi_detail,
         'explanation': '放大显示前 6 个匹配点的对极线。蓝点=匹配点，红线=对极线。'},
        {'id': 'essential_matrix', 'name': '本质矩阵 E', 'image': e_img,
         'explanation': 'E = Kᵀ F K，假设 fx=fy=max(w,h)。E 仅编码旋转和平移，与内参无关。'},
        {'id': 'rt', 'name': '旋转 R | 平移 t', 'image': rt_img,
         'explanation': '从 E 的 SVD 分解恢复的 [R|t] 矩阵。4 组候选解中选择正深度最多的那组。'},
        {'id': 'epipolar_error', 'name': 'Sampson 误差分布',
         'image': _error_histogram(errors),
         'explanation': 'Sampson 距离衡量每个匹配对与对极约束的符合程度。值越小越符合。'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'backend': 'NumPy',
            'algorithm': 'Normalized 8-point + SVD',
            'total_matches': len(use_matches),
            'raw_matches': len(raw_matches),
            'ratio_threshold': float(ratio),
            'F_rank': int(np.linalg.matrix_rank(F)),
            'mean_epipolar_error': round(float(np.mean(errors)), 6),
            'rotation_det': round(float(np.linalg.det(R)), 4),
        },
    }


def _error_histogram(errors, width=480, height=200):
    """Draw Sampson error histogram."""
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    if not errors:
        return np.array(img)
    errs = np.array(errors)
    bins = np.linspace(0, min(float(errs.max()), 5.0), 21)
    hist, _ = np.histogram(errs, bins=bins)
    max_h = max(hist.max(), 1)
    bar_w = (width - 70) // len(hist) - 2
    for i, count in enumerate(hist):
        x = 40 + i * (bar_w + 2)
        h_bar = int(count / max_h * 140)
        y0 = height - 30 - h_bar
        col = (34, 197, 94) if i < 3 else ((59, 130, 246) if i < 10 else (239, 68, 68))
        draw.rectangle((x, y0, x + bar_w, height - 30), fill=col)
    draw.text((160, 6), f'Sampson Error (mean={float(errs.mean()):.4f})', fill=(30, 41, 59))
    return np.array(img)
