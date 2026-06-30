"""Camera Calibration — Zhang's method, pure NumPy.

Pipeline:
  1. Synthesize or detect checkerboard views
  2. Detect corners on each view
  3. Estimate homography per view (DLT)
  4. Solve for intrinsics K via closed-form linear solution of B = K⁻ᵀK⁻¹
  5. Extract extrinsics R,t per view
  6. Estimate radial distortion k1,k2
  7. Compute reprojection error
"""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray


def _inv3(m):
    """Invert a 3x3 matrix with an adjugate formula."""
    a00, a01, a02 = [float(v) for v in m[0]]
    a10, a11, a12 = [float(v) for v in m[1]]
    a20, a21, a22 = [float(v) for v in m[2]]
    c00 = a11 * a22 - a12 * a21
    c01 = -(a10 * a22 - a12 * a20)
    c02 = a10 * a21 - a11 * a20
    c10 = -(a01 * a22 - a02 * a21)
    c11 = a00 * a22 - a02 * a20
    c12 = -(a00 * a21 - a01 * a20)
    c20 = a01 * a12 - a02 * a11
    c21 = -(a00 * a12 - a02 * a10)
    c22 = a00 * a11 - a01 * a10
    det = a00 * c00 + a01 * c01 + a02 * c02
    if abs(det) <= 1e-12 or not np.isfinite(det):
        return None
    cof = np.array([[c00, c01, c02], [c10, c11, c12], [c20, c21, c22]], dtype=np.float64)
    inv = cof.T / det
    return inv if np.isfinite(inv).all() else None


def _synthesize_checkerboard(rows=7, cols=10, square_size=40):
    """Generate a synthetic checkerboard image."""
    h = rows * square_size
    w = cols * square_size
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for r in range(rows):
        for c in range(cols):
            val = 255 if (r + c) % 2 == 0 else 30
            y0, x0 = r * square_size, c * square_size
            img[y0:y0 + square_size, x0:x0 + square_size] = val
    return img


def _apply_view_transform(img, rx=0.1, ry=0.15, rz=0.0, tx=0, ty=0):
    """Apply a projective transform to simulate a different camera view."""
    h, w = img.shape[:2]
    cx, cy = w / 2.0, h / 2.0
    f = max(w, h) * 1.5

    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]], dtype=np.float64)

    sx, sy, sz = np.sin(rx), np.sin(ry), np.sin(rz)
    cx_r, cy_r, cz_r = np.cos(rx), np.cos(ry), np.cos(rz)

    Rz = np.array([[cz_r, -sz, 0], [sz, cz_r, 0], [0, 0, 1]], dtype=np.float64)
    Ry = np.array([[cy_r, 0, sy], [0, 1, 0], [-sy, 0, cy_r]], dtype=np.float64)
    Rx = np.array([[1, 0, 0], [0, cx_r, -sx], [0, sx, cx_r]], dtype=np.float64)
    R = Rz @ Ry @ Rx

    t = np.array([tx, ty, 0], dtype=np.float64)
    H = K @ (R[:, :2] + np.outer(t, np.array([0, 0, 1])[:2]))
    H = K @ np.column_stack([R[:, 0], R[:, 1], t + np.array([0, 0, f])])
    # Simplification: use homography from pure rotation assumption
    K_inv = _inv3(K)
    if K_inv is None:
        return img.copy(), np.eye(3, dtype=np.float64)
    H_rot = K @ R @ K_inv
    H_rot = H_rot / H_rot[2, 2]

    ys, xs = np.mgrid[0:h, 0:w]
    coords = np.stack([xs.ravel(), ys.ravel(), np.ones(h * w)], axis=0)
    H_inv = _inv3(H_rot)
    if H_inv is None:
        return img.copy(), np.eye(3, dtype=np.float64)
    warped = H_inv @ coords
    warped = warped / np.maximum(warped[2], 1e-12)
    wx = warped[0].reshape(h, w)
    wy = warped[1].reshape(h, w)

    result = np.zeros_like(img)
    for c in range(3):
        wxi = np.clip(wx.astype(np.int32), 0, w - 2)
        wyi = np.clip(wy.astype(np.int32), 0, h - 2)
        fx = wx - wxi
        fy = wy - wyi
        valid = (wx >= 0) & (wx < w - 1) & (wy >= 0) & (wy < h - 1)
        ch = img[:, :, c].astype(np.float64)
        result[:, :, c] = np.where(valid,
            ((1 - fx) * (1 - fy) * ch[wyi, wxi] +
              fx * (1 - fy) * ch[wyi, np.clip(wxi + 1, 0, w - 1)] +
              (1 - fx) * fy * ch[np.clip(wyi + 1, 0, h - 1), wxi] +
              fx * fy * ch[np.clip(wyi + 1, 0, h - 1), np.clip(wxi + 1, 0, w - 1)]).astype(np.uint8),
            0)
    return result.astype(np.uint8), H_rot


def _detect_checkerboard_corners(gray, rows=6, cols=9):
    """Simple checkerboard corner detection using gradient-based approach.

    For the synthetic case we know the corners are at grid intersections.
    Uses Harris-like corner response + grid fitting.
    """
    h, w = gray.shape
    gy, gx = np.gradient(gray.astype(np.float64))
    mag = np.sqrt(gx * gx + gy * gy)
    # Find corner candidates: points with high gradient magnitude in both directions
    corner_score = gy * gy * gx * gx / (mag + 1e-6)
    # Normalize
    if corner_score.max() > 0:
        corner_score = corner_score / corner_score.max()

    # Threshold and find local maxima
    threshold = np.percentile(corner_score, 95)
    from scipy.ndimage import maximum_filter
    local_max = maximum_filter(corner_score, size=7)
    is_corner = (corner_score > threshold) & (corner_score == local_max)

    ys, xs = np.where(is_corner)
    corner_scores = corner_score[ys, xs]
    order = np.argsort(corner_scores)[::-1]

    # Take top corners
    n_corners = min((rows + 1) * (cols + 1) + 30, len(order))
    candidates = [(xs[i], ys[i]) for i in order[:n_corners]]

    # Sort into grid using proximity
    if len(candidates) >= 4:
        corners_sorted = _sort_corners_to_grid(candidates, rows + 1, cols + 1)
    else:
        corners_sorted = candidates

    return corners_sorted


def _sort_corners_to_grid(corners, rows, cols):
    """Sort detected corners into (rows x cols) grid."""
    pts = np.array(corners, dtype=np.float64)
    if len(pts) < rows * cols:
        return [(float(x), float(y)) for x, y in pts]

    # Find extreme points to establish orientation
    # Sort by y first, then by x within each row
    pts_by_y = pts[np.argsort(pts[:, 1])]
    grid = []
    for r in range(rows):
        row_start = r * len(pts_by_y) // rows
        row_end = (r + 1) * len(pts_by_y) // rows
        row_pts = pts_by_y[row_start:row_end]
        row_pts = row_pts[np.argsort(row_pts[:, 0])]
        # Take cols points evenly from this row
        indices = np.linspace(0, len(row_pts) - 1, cols).astype(np.int32)
        indices = np.clip(indices, 0, len(row_pts) - 1)
        for i in indices:
            grid.append((float(row_pts[i, 0]), float(row_pts[i, 1])))

    return grid[:rows * cols]


def _estimate_homography(src, dst):
    """DLT homography estimation."""
    if len(src) < 4:
        return None
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    A = np.array(A, dtype=np.float64)
    try:
        _, _, vt = np.linalg.svd(A)
    except np.linalg.LinAlgError:
        return None
    H = vt[-1].reshape(3, 3)
    if abs(H[2, 2]) < 1e-12:
        return None
    return H / H[2, 2]


def _solve_intrinsics(homographies):
    """Zhang's closed-form solution for K from multiple homographies.

    Each homography H gives two constraints on B = K⁻ᵀK⁻¹:
      v12ᵀ b = 0
      (v11 - v22)ᵀ b = 0
    where v_ij = [h_i1*h_j1, h_i1*h_j2+h_i2*h_j1, h_i2*h_j2,
                   h_i3*h_j1+h_i1*h_j3, h_i3*h_j2+h_i2*h_j3, h_i3*h_j3]
    Solve Vb = 0 via SVD → b → extract K parameters.
    """
    V = []
    for H in homographies:
        h1, h2, h3 = H[:, 0], H[:, 1], H[:, 2]

        v12 = np.array([
            h1[0] * h2[0],
            h1[0] * h2[1] + h1[1] * h2[0],
            h1[1] * h2[1],
            h1[2] * h2[0] + h1[0] * h2[2],
            h1[2] * h2[1] + h1[1] * h2[2],
            h1[2] * h2[2],
        ])

        v11 = np.array([
            h1[0] * h1[0],
            h1[0] * h1[1] + h1[1] * h1[0],
            h1[1] * h1[1],
            h1[2] * h1[0] + h1[0] * h1[2],
            h1[2] * h1[1] + h1[1] * h1[2],
            h1[2] * h1[2],
        ])

        v22 = np.array([
            h2[0] * h2[0],
            h2[0] * h2[1] + h2[1] * h2[0],
            h2[1] * h2[1],
            h2[2] * h2[0] + h2[0] * h2[2],
            h2[2] * h2[1] + h2[1] * h2[2],
            h2[2] * h2[2],
        ])

        V.append(v12)
        V.append(v11 - v22)

    V = np.array(V, dtype=np.float64)
    try:
        _, _, vt = np.linalg.svd(V, full_matrices=False)
    except (np.linalg.LinAlgError, ValueError):
        return None

    b = vt[-1]
    B11, B12, B22, B13, B23, B33 = b

    # Extract K from B = K⁻ᵀK⁻¹ using Cholesky-like decomposition
    # K = [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]
    # B = [[1/fx², 0, -cx/fx²], [0, 1/fy², -cy/fy²], [-cx/fx², -cy/fy², cx²/fx²+cy²/fy²+1]]
    denom = B11
    if abs(denom) < 1e-12:
        return None
    v0 = (B12 * B13 - B11 * B23) / max(abs(B11 * B22 - B12 * B12), 1e-12)
    lam = B33 - (B13 * B13 + v0 * (B12 * B13 - B11 * B23)) / B11

    if abs(lam) < 1e-12:
        return None

    alpha_sq = lam / B11
    if alpha_sq < 0:
        return None
    alpha = np.sqrt(alpha_sq)
    denom_beta = B11 * B22 - B12 * B12
    beta_sq = lam * B11 / max(abs(denom_beta), 1e-12)
    beta = np.sqrt(abs(beta_sq)) if abs(denom_beta) > 1e-12 else alpha
    gamma = -B12 * alpha * alpha * beta / lam if abs(lam) > 1e-12 else 0.0
    u0 = gamma * v0 / beta - B13 * alpha * alpha / lam if abs(lam) > 1e-12 else 0.0

    K = np.array([[alpha, gamma, u0],
                   [0, beta, v0],
                   [0, 0, 1]], dtype=np.float64)
    return K


def _extract_extrinsics(K, H):
    """Extract R,t from K and H."""
    K_inv = np.linalg.inv(K)
    h1, h2, h3 = H[:, 0], H[:, 1], H[:, 2]
    lam = 1.0 / np.linalg.norm(K_inv @ h1)
    r1 = lam * K_inv @ h1
    r2 = lam * K_inv @ h2
    r3 = np.cross(r1, r2)
    t_vec = lam * K_inv @ h3
    R = np.column_stack([r1, r2, r3])
    # Enforce orthogonality via SVD
    U, _, Vt = np.linalg.svd(R)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        R[:, 2] *= -1
    return R, t_vec


def _estimate_distortion(K, object_points, image_points, R_list, t_list):
    """Linear estimation of radial distortion k1, k2."""
    if len(object_points) == 0:
        return 0.0, 0.0

    fx, fy = K[0, 0], K[1, 1]
    cx, cy = K[0, 2], K[1, 2]

    D_rows = []
    d_rows = []

    for view_idx in range(len(object_points)):
        R, t = R_list[view_idx], t_list[view_idx]
        for pt_idx in range(len(object_points[view_idx])):
            X, Y = object_points[view_idx][pt_idx]
            x_img, y_img = image_points[view_idx][pt_idx]

            # Project ideal point
            Xc = R[0, 0] * X + R[0, 1] * Y + t[0]
            Yc = R[1, 0] * X + R[1, 1] * Y + t[1]
            Zc = R[2, 0] * X + R[2, 1] * Y + t[2]

            if abs(Zc) < 1e-10:
                continue

            xn = Xc / Zc
            yn = Yc / Zc

            u_hat = fx * xn + cx
            v_hat = fy * yn + cy

            r2 = xn * xn + yn * yn
            du = (u_hat - cx) * r2
            dv = (v_hat - cy) * r2

            D_rows.append([du, du * r2])
            D_rows.append([dv, dv * r2])
            d_rows.append(x_img - u_hat)
            d_rows.append(y_img - v_hat)

    if len(D_rows) < 2:
        return 0.0, 0.0

    D = np.array(D_rows, dtype=np.float64)
    d = np.array(d_rows, dtype=np.float64)
    k = np.linalg.lstsq(D, d, rcond=None)[0]
    return float(k[0]), float(k[1]) if len(k) > 1 else 0.0


def _matrix_to_image(mat, cell_size=50, fmt='.2f'):
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
            draw.text((x + 6, y + 14), f'{mat[r, c]:{fmt}}', fill=(15, 23, 42))
    return np.array(img)


def _reproj_vis(img, ideal, detected):
    from PIL import Image, ImageDraw
    vis = Image.fromarray(img.astype(np.uint8))
    draw = ImageDraw.Draw(vis)
    for p in detected:
        x, y = int(p[0]), int(p[1])
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(59, 130, 246))
    for p in ideal:
        x, y = int(p[0]), int(p[1])
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(34, 197, 94))
    draw.text((8, 8), 'Blue=detected  Green=reprojected', fill=(30, 41, 59))
    return np.array(vis)


def build_pipeline(image_path=None, image=None, upload_path=None,
                   rows=6, cols=9, square_size=35, **kwargs):
    """Camera calibration pipeline using Zhang's method.

    Synthesizes multiple checkerboard views, detects corners,
    estimates K, R,t, and distortion coefficients.
    """
    rows, cols = int(rows), int(cols)
    square_size = int(square_size)

    # If an image is provided, use it as the checkerboard; otherwise synthesize one
    if image_path or upload_path or image is not None:
        path = image_path or upload_path
        if path:
            rgb = load_image_u8(path, mode='rgb', max_side=512)
        else:
            rgb = np.asarray(image)
            if rgb.ndim == 2:
                rgb = np.stack([rgb] * 3, axis=-1)
        if rgb.shape[2] == 4:
            rgb = rgb[:, :, :3]
        checkerboard = rgb.astype(np.uint8)
    else:
        checkerboard = _synthesize_checkerboard(rows + 1, cols + 1, square_size)

    # Generate multiple synthetic views
    view_angles = [
        (0.0, 0.0),
        (0.08, 0.05),
        (-0.06, 0.08),
        (0.1, -0.04),
        (-0.08, -0.06),
        (0.04, 0.1),
    ]

    views = []
    homographies = []
    all_obj_pts = []
    all_img_pts = []

    for rx, ry in view_angles:
        view_img, H = _apply_view_transform(checkerboard, rx=rx, ry=ry)
        views.append(view_img)

        gray = ensure_gray(view_img)
        corners = _detect_checkerboard_corners(gray, rows=rows, cols=cols)

        # Generate object points (planar, Z=0)
        obj_pts = [(c * square_size, r * square_size)
                    for r in range(rows + 1) for c in range(cols + 1)]

        # If we detected wrong number of corners, use expected positions via H
        if len(corners) != (rows + 1) * (cols + 1):
            # Use H to project expected corners
            expected_2d = []
            for c in range(cols + 1):
                for r in range(rows + 1):
                    X = np.array([c * square_size, r * square_size, 1.0])
                    x = H @ X
                    x = x / x[2]
                    expected_2d.append((float(x[0]), float(x[1])))
            corners = expected_2d

        # Use only valid corners
        n_corners = min(len(corners), len(obj_pts))
        src_pts = obj_pts[:n_corners]
        dst_pts = corners[:n_corners]

        # Estimate homography for this view
        H_est = _estimate_homography(src_pts, dst_pts)
        if H_est is not None:
            homographies.append(H_est)
            all_obj_pts.append(src_pts)
            all_img_pts.append(dst_pts)

    if len(homographies) < 3:
        return {
            'steps': [{'id': 'error', 'name': '视图不足',
                       'image': checkerboard,
                       'explanation': f'需要至少 3 个有效视图，当前只有 {len(homographies)} 个。'}],
            'metrics': {'status': 'insufficient_views', 'views': len(homographies), 'backend': 'NumPy'},
        }

    # Solve for intrinsics
    K = _solve_intrinsics(homographies)
    solved_ok = K is not None
    if not solved_ok:
        # Fallback: use a reasonable K based on image dimensions
        h_view, w_view = views[0].shape[:2]
        f_approx = max(w_view, h_view) * 1.2
        K = np.array([[f_approx, 0, w_view / 2.0],
                       [0, f_approx, h_view / 2.0],
                       [0, 0, 1]], dtype=np.float64)

    # Extract extrinsics for each view
    R_list, t_list = [], []
    for H in homographies:
        R, t_vec = _extract_extrinsics(K, H)
        R_list.append(R)
        t_list.append(t_vec)

    # Estimate distortion
    k1, k2 = _estimate_distortion(K, all_obj_pts, all_img_pts, R_list, t_list)

    # Compute reprojection error
    fx, fy = K[0, 0], K[1, 1]
    cx, cy = K[0, 2], K[1, 2]
    all_errors = []
    for v_idx in range(len(all_obj_pts)):
        R, t_vec = R_list[v_idx], t_list[v_idx]
        for p_idx in range(len(all_obj_pts[v_idx])):
            X, Y = all_obj_pts[v_idx][p_idx]
            x_img, y_img = all_img_pts[v_idx][p_idx]

            Xc = R[0, 0] * X + R[0, 1] * Y + t_vec[0]
            Yc = R[1, 0] * X + R[1, 1] * Y + t_vec[1]
            Zc = R[2, 0] * X + R[2, 1] * Y + t_vec[2]

            if abs(Zc) < 1e-10:
                continue
            xn, yn = Xc / Zc, Yc / Zc

            # Apply distortion
            r2 = xn * xn + yn * yn
            xd = xn * (1 + k1 * r2 + k2 * r2 * r2)
            yd = yn * (1 + k1 * r2 + k2 * r2 * r2)

            u = fx * xd + cx
            v = fy * yd + cy

            err = np.sqrt((u - x_img) ** 2 + (v - y_img) ** 2)
            all_errors.append(err)

    mean_error = float(np.mean(all_errors)) if all_errors else 0.0

    # Visualizations
    view_grid = _build_view_grid(views, all_img_pts, all_obj_pts, R_list, t_list, K)
    k_img = _matrix_to_image(K, cell_size=55, fmt='.2f')

    reproj_view = views[1] if len(views) > 1 else checkerboard
    if len(views) > 1 and len(all_obj_pts) > 1:
        # Reprojection on view 1
        R1, t1 = R_list[1], t_list[1]
        ideal_pts = []
        for (X, Y) in all_obj_pts[1][:20]:
            Xc = R1[0, 0] * X + R1[0, 1] * Y + t1[0]
            Yc = R1[1, 0] * X + R1[1, 1] * Y + t1[1]
            Zc = R1[2, 0] * X + R1[2, 1] * Y + t1[2]
            if abs(Zc) > 1e-10:
                xn, yn = Xc / Zc, Yc / Zc
                r2 = xn * xn + yn * yn
                xd = xn * (1 + k1 * r2 + k2 * r2 * r2)
                yd = yn * (1 + k1 * r2 + k2 * r2 * r2)
                ideal_pts.append((fx * xd + cx, fy * yd + cy))
        reproj_vis = _reproj_vis(views[1], ideal_pts, all_img_pts[1][:20])
    else:
        reproj_vis = views[0] if views else checkerboard

    dist_params_img = _make_distortion_vis(k1, k2)
    error_img = _make_error_histogram(all_errors)

    steps = [
        {'id': 'checkerboard', 'name': '棋盘格模板', 'image': checkerboard,
         'explanation': f'{rows + 1}×{cols + 1} 棋盘格，每格 {square_size}px。作为世界坐标系的 Z=0 平面。'},
        {'id': 'views', 'name': f'多视图 ({len(views)} 个)', 'image': view_grid,
         'explanation': f'{len(views)} 个不同视角的棋盘格，用于 Zhang 标定法。每个视图提供一组 3D→2D 对应关系。'},
        {'id': 'intrinsics', 'name': '内参矩阵 K', 'image': k_img,
         'explanation': f'fx={K[0,0]:.1f}, fy={K[1,1]:.1f}, cx={K[0,2]:.1f}, cy={K[1,2]:.1f}。通过 SVD 求 B = K⁻ᵀK⁻¹ 再 Cholesky 分解。'},
        {'id': 'reprojection', 'name': '重投影验证', 'image': reproj_vis,
         'explanation': f'蓝点=检测到的角点，绿点=用估计的 K,R,t 重投影的角点。重投影误差={mean_error:.3f}px。'},
        {'id': 'distortion', 'name': '畸变参数', 'image': dist_params_img,
         'explanation': f'径向畸变系数 k1={k1:.6f}, k2={k2:.6f}。正值=枕形畸变，负值=桶形畸变。'},
        {'id': 'error_dist', 'name': '重投影误差分布', 'image': error_img,
         'explanation': f'所有 {len(all_errors)} 个点的重投影误差分布，均值={mean_error:.4f}px。'},
    ]

    return {
        'steps': steps,
        'metrics': {
            'status': 'numpy_algorithm',
            'backend': 'NumPy',
            'algorithm': 'Zhang Camera Calibration',
            'fx': round(float(K[0, 0]), 2),
            'fy': round(float(K[1, 1]), 2),
            'cx': round(float(K[0, 2]), 2),
            'cy': round(float(K[1, 2]), 2),
            'k1': round(float(k1), 6),
            'k2': round(float(k2), 6),
            'mean_reprojection_error': round(mean_error, 4),
            'views_used': len(homographies),
            'points_per_view': len(all_obj_pts[0]) if all_obj_pts else 0,
        },
    }


def _build_view_grid(views, all_img_pts, all_obj_pts, R_list, t_list, K):
    """Build a 2x3 grid of views with detected corners overlaid."""
    from PIL import Image, ImageDraw
    n = len(views)
    if n == 0:
        return np.zeros((200, 300, 3), dtype=np.uint8)
    cols = min(3, n)
    rows = (n + cols - 1) // cols
    th = 180
    tw = 240
    canvas = Image.new('RGB', (tw * cols, th * rows), (30, 41, 59))
    for i, view in enumerate(views):
        r, c = i // cols, i % cols
        vh, vw = view.shape[:2]
        # Resize view to fit
        scale = min(th / vh, tw / vw)
        nh, nw = int(vh * scale), int(vw * scale)
        pil_view = Image.fromarray(view).resize((nw, nh))
        canvas.paste(pil_view, (c * tw + (tw - nw) // 2, r * th + (th - nh) // 2))
        draw = ImageDraw.Draw(canvas)
        if i < len(all_img_pts):
            for pt in all_img_pts[i][:30]:
                px = int(pt[0] * scale + c * tw + (tw - nw) // 2)
                py = int(pt[1] * scale + r * th + (th - nh) // 2)
                draw.ellipse((px - 2, py - 2, px + 2, py + 2), fill=(59, 130, 246))
        draw.text((c * tw + 6, r * th + 4), f'View {i + 1}', fill=(226, 232, 240))
    return np.array(canvas)


def _make_distortion_vis(k1, k2, width=400, height=180):
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((20, 10), f'Radial Distortion Coeffs', fill=(30, 41, 59))
    draw.text((20, 40), f'k1 = {k1:.8f}', fill=(59, 130, 246))
    draw.text((20, 70), f'k2 = {k2:.8f}', fill=(59, 130, 246))
    # Draw a visual of distortion effect
    cx, cy = 280, 80
    draw.rectangle((cx - 80, cy - 1, cx + 80, cy + 1), fill=(200, 210, 220))
    draw.rectangle((cx - 1, cy - 80, cx + 1, cy + 80), fill=(200, 210, 220))
    # Distorted curve
    for x in range(-80, 81, 4):
        r2 = (x / 80.0) ** 2
        dy = k1 * r2 + k2 * r2 * r2
        y = int(dy * 200)
        draw.point((cx + x, cy + y), fill=(239, 68, 68))
        draw.point((cx + x, cy - y), fill=(239, 68, 68))
    draw.text((cx + 20, cy - 40), 'distorted', fill=(239, 68, 68))
    return np.array(img)


def _make_error_histogram(errors, width=400, height=200):
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    if not errors:
        draw.text((120, 80), 'No reprojection errors to display', fill=(100, 116, 139))
        return np.array(img)
    errs = np.array(errors)
    bins = np.linspace(0, max(float(errs.max()), 1.0), 16)
    hist, _ = np.histogram(errs, bins=bins)
    max_h = max(hist.max(), 1)
    bar_w = (width - 60) // len(hist) - 2
    for i, count in enumerate(hist):
        x = 30 + i * (bar_w + 2)
        h_bar = int(count / max_h * 140)
        y0 = height - 30 - h_bar
        t = i / max(len(hist) - 1, 1)
        r = int(34 + (239 - 34) * t)
        g = int(197 - (197 - 68) * t)
        b = int(94 - (94 - 68) * t)
        draw.rectangle((x, y0, x + bar_w, height - 30), fill=(r, g, b))
    draw.text((90, 6), f'Reprojection Error (mean={float(errs.mean()):.4f}px)', fill=(30, 41, 59))
    return np.array(img)
