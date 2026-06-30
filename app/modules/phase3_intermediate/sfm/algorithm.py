"""Triangulation & Structure from Motion — pure NumPy.

Two-view SfM pipeline:
  1. Synthesize second view from input
  2. SIFT features → match → F/E estimation → R,t recovery
  3. Construct projection matrices P₀, P₁
  4. Linear triangulation (SVD) for sparse 3D points
  5. Filter by depth sign, reprojection error
  6. Render sparse point cloud as 2D projection
"""
import numpy as np

from app.modules.phase3_intermediate.match.algorithm import (
    extract_features, match_descriptors, resize_max_side,
)
from app.modules.phase3_intermediate.epipolar.algorithm import (
    _estimate_fundamental_matrix, _synthesize_right_view,
)
from app.utils.image_utils import load_image_u8


def _triangulate_point(P0, P1, x1, y1, x2, y2):
    """Linear triangulation of one 3D point from two views.

    Build 4x4 matrix A from:
      x * P[2] - P[0] = 0
      y * P[2] - P[1] = 0
    for both cameras. Solve AX = 0 via SVD (last column of V).
    Returns (X, Y, Z, W) homogeneous.
    """
    A = np.zeros((4, 4), dtype=np.float64)
    A[0] = x1 * P0[2] - P0[0]
    A[1] = y1 * P0[2] - P0[1]
    A[2] = x2 * P1[2] - P1[0]
    A[3] = y2 * P1[2] - P1[1]
    try:
        _, _, vt = np.linalg.svd(A)
    except np.linalg.LinAlgError:
        return None
    X = vt[-1]
    if abs(X[3]) > 1e-12:
        X = X / X[3]
    return X


def _project_point(P, X):
    """Project 3D point X onto camera P. Returns (u, v, depth)."""
    x = P @ X
    if abs(x[2]) < 1e-12:
        return None
    u = x[0] / x[2]
    v = x[1] / x[2]
    return (float(u), float(v), float(x[2]))


def _render_pointcloud(points_3d, width=640, height=480, elev=30, azim=45):
    """Render 3D point cloud as 2D projection image."""
    from PIL import Image, ImageDraw

    if len(points_3d) == 0:
        img = Image.new('RGB', (width, height), (15, 23, 42))
        draw = ImageDraw.Draw(img)
        draw.text((width // 2 - 60, height // 2), 'No 3D points to render',
                  fill=(148, 163, 184))
        return np.array(img)

    pts = np.array(points_3d)
    # Center and normalize
    pts = pts - pts.mean(axis=0)
    scale = np.percentile(np.abs(pts), 95) * 1.2
    if scale < 1e-8:
        scale = 1.0
    pts = pts / scale

    # Rotation: first around Y (azim), then around X (elev)
    ay = np.radians(azim)
    ex = np.radians(elev)
    Ry = np.array([[np.cos(ay), 0, np.sin(ay)],
                    [0, 1, 0],
                    [-np.sin(ay), 0, np.cos(ay)]])
    Rx = np.array([[1, 0, 0],
                    [0, np.cos(ex), -np.sin(ex)],
                    [0, np.sin(ex), np.cos(ex)]])
    R = Rx @ Ry
    rotated = pts @ R.T

    # Perspective projection with depth coloring
    fov = 2.0
    proj_x = rotated[:, 0] / (fov + rotated[:, 2] + 1e-8)
    proj_y = rotated[:, 1] / (fov + rotated[:, 2] + 1e-8)

    # Map to image coordinates
    px = ((proj_x + 0.5) * width * 0.7 + width * 0.15).astype(np.int32)
    py = ((0.5 - proj_y) * height * 0.7 + height * 0.15).astype(np.int32)
    depths = rotated[:, 2]

    # Color by depth: near=warm, far=cool
    d_min, d_max = float(depths.min()), float(depths.max())
    d_range = d_max - d_min if d_max > d_min else 1.0
    d_norm = (depths - d_min) / d_range

    img = Image.new('RGB', (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(img)

    for i in range(len(points_3d)):
        if 0 <= px[i] < width and 0 <= py[i] < height:
            t = float(d_norm[i])
            r = int(239 * (1 - t) + 59 * t)
            g = int(68 * (1 - t) + 130 * t)
            b = int(68 * (1 - t) + 246 * t)
            draw.ellipse((px[i] - 1, py[i] - 1, px[i] + 1, py[i] + 1),
                         fill=(r, g, b))

    # Draw camera frustums
    cam_size = 25
    # Camera 0 at origin
    cx0, cy0 = int(width * 0.15), int(height * 0.5)
    draw.rectangle((cx0 - 8, cy0 - 6, cx0 + 8, cy0 + 6), fill=(34, 197, 94))
    draw.text((cx0 - 20, cy0 - 22), 'C₀', fill=(34, 197, 94))

    # Camera 1
    cam1_3d = np.array([0.5, 0, 0.3])
    cam1_rot = cam1_3d @ R.T
    cx1 = int((cam1_rot[0] / (fov + cam1_rot[2]) + 0.5) * width * 0.7 + width * 0.15)
    cy1 = int((0.5 - cam1_rot[1] / (fov + cam1_rot[2])) * height * 0.7 + height * 0.15)
    draw.rectangle((cx1 - 8, cy1 - 6, cx1 + 8, cy1 + 6), fill=(59, 130, 246))
    draw.text((cx1 - 20, cy1 - 22), 'C₁', fill=(59, 130, 246))

    # Legend
    draw.text((width - 180, 10), '● Near  ● Far', fill=(148, 163, 184))
    return np.array(img)


def _render_side_view(points_3d, width=480, height=320):
    """Render top-down (XZ plane) view of point cloud."""
    from PIL import Image, ImageDraw

    if len(points_3d) == 0:
        img = Image.new('RGB', (width, height), (248, 250, 252))
        return np.array(img)

    pts = np.array(points_3d)
    pts = pts - pts.mean(axis=0)
    scale = np.percentile(np.abs(pts), 95) * 1.2
    if scale < 1e-8: scale = 1.0
    pts = pts / scale

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)

    cx, cy = width // 2, height // 2
    s = min(width, height) * 0.35

    for i, pt in enumerate(points_3d):
        px = int(cx + pt[0] * s)
        py = int(cy - pt[2] * s)
        if 0 <= px < width and 0 <= py < height:
            draw.ellipse((px - 1, py - 1, px + 1, py + 1),
                         fill=(59, 130, 246))

    # Camera positions
    draw.rectangle((cx - 6, cy - 6, cx + 6, cy + 6), fill=(34, 197, 94))
    draw.text((cx - 16, cy - 20), 'C₀', fill=(34, 197, 94))
    # C1 at (baseline, 0, 0) on top view
    cx1 = int(cx + 0.5 * s)
    draw.rectangle((cx1 - 6, cy - 6, cx1 + 6, cy + 6), fill=(59, 130, 246))
    draw.text((cx1 - 16, cy - 20), 'C₁', fill=(59, 130, 246))

    # Connect cameras with baseline
    draw.line((cx, cy, cx1, cy), fill=(148, 163, 184), width=2)
    draw.text((cx + 20, cy + 8), 'baseline', fill=(100, 116, 139))

    draw.text((10, 10), 'X-Z 俯视图 (Top View)', fill=(30, 41, 59))
    return np.array(img)


def _reprojection_heatmap(img, pts1, pts2, points_3d, P0, P1, width=480, height=320):
    """Show reprojection error as color-coded points on image."""
    from PIL import Image, ImageDraw
    if img.ndim == 2:
        img = np.stack([img] * 3, axis=-1)
    vis = Image.fromarray(img.astype(np.uint8))
    draw = ImageDraw.Draw(vis)
    errors = []
    for i, pt3d in enumerate(points_3d):
        proj0 = _project_point(P0, pt3d)
        proj1 = _project_point(P1, pt3d)
        if proj0 and proj1 and i < len(pts1) and i < len(pts2):
            err = np.sqrt(
                (proj0[0] - pts1[i][0]) ** 2 + (proj0[1] - pts1[i][1]) ** 2 +
                (proj1[0] - pts2[i][0]) ** 2 + (proj1[1] - pts2[i][1]) ** 2
            )
            errors.append(float(err))
            t = min(err / 5.0, 1.0)
            r = int(255 * t)
            g = int(255 * (1 - t))
            draw.ellipse((int(pts1[i][0]) - 2, int(pts1[i][1]) - 2,
                          int(pts1[i][0]) + 2, int(pts1[i][1]) + 2),
                         fill=(r, g, 0))
    if not errors:
        return np.array(vis)
    draw.text((10, 10), f'Reproj Err: mean={float(np.mean(errors)):.3f}px  max={float(np.max(errors)):.1f}px',
              fill=(30, 41, 59))
    return np.array(vis)


def build_pipeline(image_path=None, image=None, upload_path=None,
                   ratio=0.75, max_matches=120, **kwargs):
    """Two-view SfM pipeline."""
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

    rgb_small, _ = resize_max_side(rgb, 480)
    left = rgb_small.astype(np.uint8)
    right, H_gt = _synthesize_right_view(left, angle_deg=8.0, tx=0.04)

    # Extract and match SIFT features
    _, pts_left, desc_left, _ = extract_features(left, method='sift', max_points=200)
    _, pts_right, desc_right, _ = extract_features(right, method='sift', max_points=200)
    raw_matches, accepted = match_descriptors(desc_left, desc_right, ratio=float(ratio),
                                               max_matches=int(max_matches))
    use_matches = accepted if len(accepted) >= 8 else raw_matches
    use_matches = use_matches[:min(int(max_matches), len(use_matches))]

    pts1 = np.array([[pts_left[m['left']]['x'], pts_left[m['left']]['y']] for m in use_matches])
    pts2 = np.array([[pts_right[m['right']]['x'], pts_right[m['right']]['y']] for m in use_matches])

    # Estimate F/E
    F, _, _ = _estimate_fundamental_matrix(pts1, pts2)

    if F is None:
        return {
            'steps': [{'id': 'error', 'name': '匹配不足', 'image': np.stack([left] * 3, axis=-1) if left.ndim == 2 else left,
                       'explanation': f'仅 {len(accepted)} 对匹配，需要 ≥8 对。'}],
            'metrics': {'status': 'too_few_matches', 'matches': len(accepted), 'backend': 'NumPy'},
        }

    # Camera intrinsics (approximate)
    h, w = left.shape[:2]
    f = max(w, h)
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], dtype=np.float64)

    # E = K^T F K
    E = K.T @ F @ K
    Ue, Se, Vet = np.linalg.svd(E)
    if np.linalg.det(Ue) < 0: Ue[:, 2] *= -1
    if np.linalg.det(Vet.T) < 0: Vet[2, :] *= -1
    W = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=np.float64)
    R = Ue @ W @ Vet
    t = Ue[:, 2]

    # Camera matrices
    P0 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
    P1 = K @ np.hstack([R, t.reshape(3, 1)])

    # Triangulate all matches
    points_3d = []
    for i in range(len(pts1)):
        X = _triangulate_point(P0, P1, pts1[i][0], pts1[i][1], pts2[i][0], pts2[i][1])
        if X is not None:
            points_3d.append(X)

    points_3d_arr = np.array(points_3d)

    # Filter: positive depth in both cameras
    good = []
    for X in points_3d:
        proj0 = _project_point(P0, X)
        proj1 = _project_point(P1, X)
        if proj0 and proj1 and proj0[2] > 0 and proj1[2] > 0:
            # Check reprojection error
            if len(good) < len(pts1):
                idx = len(good)
                err0 = np.sqrt((proj0[0] - pts1[idx][0]) ** 2 + (proj0[1] - pts1[idx][1]) ** 2)
                err1 = np.sqrt((proj1[0] - pts2[idx][0]) ** 2 + (proj1[1] - pts2[idx][1]) ** 2)
                if err0 < 20 and err1 < 20:
                    good.append(X[:3])
            else:
                good.append(X[:3])

    # Visualizations
    cloud_img = _render_pointcloud(good)
    top_view = _render_side_view(good) if good else np.zeros((320, 480, 3), dtype=np.uint8) + 248
    reproj_vis = _reprojection_heatmap(left, pts1, pts2, [np.append(p, 1.0) if len(p) == 3 else p for p in good],
                                        P0, P1) if good else left

    # Depth map: color-code by Z-depth for inlier 3D points
    from PIL import Image, ImageDraw
    depth_map = Image.new('RGB', (w, h), (15, 23, 42))
    draw = ImageDraw.Draw(depth_map)
    if good:
        depths = np.array([p[2] for p in good])
        d_min, d_max = float(depths.min()), float(depths.max())
        d_range = d_max - d_min if d_max > d_min else 1.0
        for i, p in enumerate(good):
            u, v, d = _project_point(P0, np.append(p, 1.0))
            frac = (d - d_min) / d_range
            r = int(239 * (1 - frac) + 59 * frac)
            g = int(68 * (1 - frac) + 130 * frac)
            b = int(68 * (1 - frac) + 246 * frac)
            if 0 <= u < w and 0 <= v < h:
                draw.ellipse((u - 1, v - 1, u + 1, v + 1), fill=(r, g, b))
    depth_map = np.array(depth_map)

    # Match + triangulation detail scene
    match_vis = np.hstack([left, right]) if left.shape == right.shape else left

    steps = [
        {'id': 'input_pair', 'name': '左右视图 + 匹配', 'image': match_vis,
         'explanation': f'SIFT 特征匹配 {len(use_matches)} 对。这些匹配对将用于三角化恢复 3D 结构。'},
        {'id': 'feature_depth', 'name': '深度着色图', 'image': depth_map,
         'explanation': '每个匹配特征点按深度着色：红色=近，蓝色=远。深度来自线性三角化。'},
        {'id': 'reprojection', 'name': '重投影验证', 'image': reproj_vis,
         'explanation': '绿色=重投影误差小，红色=误差大。用于过滤错误三角化点。'},
        {'id': 'point_cloud', 'name': f'稀疏点云 ({len(good)} 点)', 'image': cloud_img,
         'explanation': '从两视图恢复的 3D 稀疏点云。C₀=参考相机，C₁=第二相机。颜色=深度映射。'},
        {'id': 'top_view', 'name': 'X-Z 俯视图', 'image': top_view,
         'explanation': '俯视视角显示场景的平面结构。绿色=C₀，蓝色=C₁，线=基线。观察点的空间分布。'},
        {'id': 'cameras', 'name': '相机姿态', 'image': _camera_pose_vis(R, t),
         'explanation': '左: 旋转矩阵 R (3×3)。右: 平移向量 t。从本质矩阵 E 的 SVD 分解恢复。'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'backend': 'NumPy',
            'algorithm': 'Two-view SfM (DLT Triangulation)',
            'matches': len(use_matches),
            'triangulated_points': len(points_3d),
            'inlier_points': len(good),
            'baseline': round(float(np.linalg.norm(t)), 4),
            'rotation_det': round(float(np.linalg.det(R)), 4),
        },
    }


def _camera_pose_vis(R, t, cell_size=40):
    from PIL import Image, ImageDraw
    w = 520
    h = 160
    img = Image.new('RGB', (w, h), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    # R matrix (left half)
    for r in range(3):
        for c in range(3):
            x, y = 30 + c * cell_size, 20 + r * cell_size
            draw.rectangle((x, y, x + cell_size - 4, y + cell_size - 4),
                           fill=(255, 255, 255), outline=(200, 210, 220))
            draw.text((x + 8, y + 10), f'{R[r, c]:.4f}', fill=(15, 23, 42))
    draw.text((70, 4), 'Rotation R', fill=(30, 41, 59))
    # t vector (right half)
    offset_x = 280
    for r in range(3):
        x, y = offset_x, 20 + r * cell_size
        draw.rectangle((x, y, x + cell_size * 2, y + cell_size - 4),
                       fill=(255, 255, 255), outline=(200, 210, 220))
        draw.text((x + 8, y + 10), f'{t[r]:.4f}', fill=(15, 23, 42))
    draw.text((offset_x + 40, 4), 'Translation t', fill=(30, 41, 59))
    return np.array(img)
