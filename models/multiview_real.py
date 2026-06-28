from __future__ import annotations

import base64
import os
from io import BytesIO
from time import perf_counter

import numpy as np

try:
    import cv2
except Exception:  # pragma: no cover - depends on local OpenCV runtime availability.
    cv2 = None


DISPLAY_W = 320
DISPLAY_H = 220
DEFAULT_SAMPLE = "middlebury_cones"
SAMPLES = {
    DEFAULT_SAMPLE: {
        "title": "Middlebury Cones",
        "left": os.path.join("assets", "examples", "multiview", "middlebury_cones", "im2.png"),
        "right": os.path.join("assets", "examples", "multiview", "middlebury_cones", "im6.png"),
        "source": "Middlebury Stereo 2003 Cones im2 / im6",
        "source_url": "https://vision.middlebury.edu/stereo/data/scenes2003/",
        "permission_url": "https://vision.middlebury.edu/stereo/data/",
    }
}


def _form_value(form, *names, default=None):
    for name in names:
        value = form.get(name)
        if value not in (None, ""):
            return value
    return default


def _clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _clamp_float(value, default, minimum, maximum):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _round_matrix(matrix, digits=6):
    return np.round(np.asarray(matrix, dtype=float), digits).tolist()


def _point(point):
    return {"x": round(float(point[0]), 2), "y": round(float(point[1]), 2)}


def _encode_png_bgr(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("真实样例图像编码失败")
    encoded = base64.b64encode(buffer.tobytes()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def _load_sample(static_folder, sample_key):
    sample = SAMPLES.get(sample_key)
    if not sample:
        raise ValueError("真实样例不存在")
    left_path = os.path.join(static_folder, sample["left"])
    right_path = os.path.join(static_folder, sample["right"])
    left = cv2.imread(left_path, cv2.IMREAD_COLOR)
    right = cv2.imread(right_path, cv2.IMREAD_COLOR)
    if left is None or right is None:
        raise ValueError("真实样例图片缺失，请检查 Middlebury Cones 资产")
    left = cv2.resize(left, (DISPLAY_W, DISPLAY_H), interpolation=cv2.INTER_AREA)
    right = cv2.resize(right, (DISPLAY_W, DISPLAY_H), interpolation=cv2.INTER_AREA)
    return sample, left, right


def _make_intrinsics(width, height):
    focal = 0.92 * max(width, height)
    return np.array(
        [
            [focal, 0.0, width / 2.0],
            [0.0, focal, height / 2.0],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )


def _line_error(F, left, right):
    x = np.array([left[0], left[1], 1.0], dtype=np.float64)
    xp = np.array([right[0], right[1], 1.0], dtype=np.float64)
    line = F @ x
    denom = max(float(np.linalg.norm(line[:2])), 1e-9)
    return float(abs(xp @ line) / denom), line


def _triangulate(P1, P2, pts1, pts2):
    points4 = cv2.triangulatePoints(P1, P2, pts1.T, pts2.T)
    w = points4[3]
    valid_w = np.abs(w) > 1e-9
    points3 = np.full((points4.shape[1], 3), np.nan, dtype=np.float64)
    points3[valid_w] = (points4[:3, valid_w] / w[valid_w]).T
    return points3


def _project(P, points3):
    points_h = np.c_[points3, np.ones(len(points3), dtype=np.float64)]
    projected = (P @ points_h.T).T
    z = projected[:, 2:3]
    out = np.full((len(points3), 2), np.nan, dtype=np.float64)
    valid = np.abs(z[:, 0]) > 1e-9
    out[valid] = projected[valid, :2] / z[valid]
    return out


def _positive_depth_count(R, t, K, pts1, pts2):
    P1 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
    P2 = K @ np.hstack([R, t.reshape(3, 1)])
    points3 = _triangulate(P1, P2, pts1, pts2)
    finite = np.isfinite(points3).all(axis=1)
    cam2 = (R @ points3.T + t.reshape(3, 1)).T
    positive = finite & (points3[:, 2] > 0) & (cam2[:, 2] > 0)
    return int(np.count_nonzero(positive)), int(np.count_nonzero(finite))


def _normalize_cloud(points3):
    finite = np.isfinite(points3).all(axis=1)
    if not np.any(finite):
        return np.zeros_like(points3)
    center = np.median(points3[finite], axis=0)
    spread = np.percentile(np.abs(points3[finite] - center), 75, axis=0)
    scale = max(float(np.max(spread)), 1e-6)
    normalized = (points3 - center) / scale
    normalized[:, 2] = np.clip((points3[:, 2] - np.nanmin(points3[finite, 2])) / max(np.ptp(points3[finite, 2]), 1e-6) * 2.5 + 2.2, 1.5, 5.2)
    return normalized


def build_multiview_real_response(form, static_folder):
    if cv2 is None:
        raise ValueError("OpenCV 运行库不可用，真实样例算法暂时无法运行")
    if not hasattr(cv2, "SIFT_create"):
        raise ValueError("当前 OpenCV 不支持 SIFT，无法运行真实样例匹配")

    start = perf_counter()
    sample_key = _form_value(form, "sample", default=DEFAULT_SAMPLE)
    max_features = _clamp_int(_form_value(form, "max_features", default=700), 700, 120, 1600)
    ratio_threshold = _clamp_float(_form_value(form, "ratio_threshold", default=0.74), 0.74, 0.45, 0.95)
    ransac_threshold = _clamp_float(_form_value(form, "ransac_threshold", default=1.35), 1.35, 0.4, 4.0)

    sample, left_img, right_img = _load_sample(static_folder, sample_key)
    gray_left = cv2.cvtColor(left_img, cv2.COLOR_BGR2GRAY)
    gray_right = cv2.cvtColor(right_img, cv2.COLOR_BGR2GRAY)

    sift = cv2.SIFT_create(nfeatures=max_features, contrastThreshold=0.025)
    keypoints_left, desc_left = sift.detectAndCompute(gray_left, None)
    keypoints_right, desc_right = sift.detectAndCompute(gray_right, None)
    if desc_left is None or desc_right is None or len(keypoints_left) < 8 or len(keypoints_right) < 8:
        raise ValueError("真实样例特征点不足，无法估计基础矩阵")

    matcher = cv2.BFMatcher(cv2.NORM_L2)
    raw_pairs = matcher.knnMatch(desc_left, desc_right, k=2)
    good = []
    for pair in raw_pairs:
        if len(pair) < 2:
            continue
        first, second = pair
        ratio = first.distance / max(second.distance, 1e-9)
        if ratio < ratio_threshold:
            good.append((first, second, ratio))
    good.sort(key=lambda item: (item[2], item[0].distance))
    if len(good) < 8:
        raise ValueError("真实样例通过 ratio test 的匹配不足，无法运行 RANSAC")

    pts_left = np.float32([keypoints_left[item[0].queryIdx].pt for item in good])
    pts_right = np.float32([keypoints_right[item[0].trainIdx].pt for item in good])
    F, mask = cv2.findFundamentalMat(
        pts_left,
        pts_right,
        cv2.FM_RANSAC,
        ransac_threshold,
        0.995,
        8000,
    )
    if F is None or F.shape != (3, 3) or mask is None:
        raise ValueError("RANSAC 未能估计稳定的基础矩阵")
    mask = mask.reshape(-1).astype(bool)
    if np.count_nonzero(mask) < 8:
        raise ValueError("基础矩阵内点不足，无法恢复相机位姿")

    inlier_pts_left = pts_left[mask].astype(np.float64)
    inlier_pts_right = pts_right[mask].astype(np.float64)
    K = _make_intrinsics(DISPLAY_W, DISPLAY_H)
    E = K.T @ F @ K
    E = E / max(float(np.linalg.norm(E)), 1e-9)

    pose_count, R_pose, t_pose, pose_mask = cv2.recoverPose(E, inlier_pts_left, inlier_pts_right, K)
    if pose_count < 8:
        raise ValueError("recoverPose 正深度点不足，无法得到稳定相机位姿")

    R1, R2, t = cv2.decomposeEssentialMat(E)
    candidate_defs = [
        ("R1, +t", R1, t.reshape(3)),
        ("R1, -t", R1, -t.reshape(3)),
        ("R2, +t", R2, t.reshape(3)),
        ("R2, -t", R2, -t.reshape(3)),
    ]
    candidates = []
    for index, (label, R, tv) in enumerate(candidate_defs, start=1):
        positive, finite = _positive_depth_count(R, tv, K, inlier_pts_left, inlier_pts_right)
        candidates.append(
            {
                "id": index,
                "label": label,
                "positive_depth": positive,
                "negative_depth": max(0, finite - positive),
                "total": finite,
            }
        )
    selected_candidate = max(candidates, key=lambda item: item["positive_depth"])
    R = candidate_defs[selected_candidate["id"] - 1][1]
    t_vec = candidate_defs[selected_candidate["id"] - 1][2]

    P1 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
    P2 = K @ np.hstack([R, t_vec.reshape(3, 1)])
    points3 = _triangulate(P1, P2, inlier_pts_left, inlier_pts_right)
    projected_left = _project(P1, points3)
    projected_right = _project(P2, points3)
    cam2_points = (R @ points3.T + t_vec.reshape(3, 1)).T
    finite = np.isfinite(points3).all(axis=1) & np.isfinite(projected_left).all(axis=1) & np.isfinite(projected_right).all(axis=1)
    positive = finite & (points3[:, 2] > 0) & (cam2_points[:, 2] > 0)
    err_left = np.linalg.norm(projected_left - inlier_pts_left, axis=1)
    err_right = np.linalg.norm(projected_right - inlier_pts_right, axis=1)
    mean_err = (err_left + err_right) / 2.0
    usable = positive & np.isfinite(mean_err) & (mean_err < 8.0)
    usable_indices = np.where(usable)[0]
    if usable_indices.size < 6:
        raise ValueError("三角化后的有效正深度点不足")
    usable_indices = usable_indices[np.argsort(mean_err[usable_indices])[:90]]
    normalized = _normalize_cloud(points3)

    cloud_points = []
    for rank, idx in enumerate(usable_indices, start=1):
        cloud_points.append(
            {
                "id": rank - 1,
                "match_index": int(idx),
                "left": _point(inlier_pts_left[idx]),
                "right": _point(inlier_pts_right[idx]),
                "reprojLeft": _point(projected_left[idx]),
                "reprojRight": _point(projected_right[idx]),
                "point3d": [round(float(v), 5) for v in points3[idx]],
                "x3": round(float(normalized[idx, 0]), 4),
                "y3": round(float(normalized[idx, 1]), 4),
                "z3": round(float(normalized[idx, 2]), 4),
                "err1": round(float(err_left[idx]), 3),
                "err2": round(float(err_right[idx]), 3),
                "error": round(float(mean_err[idx]), 3),
                "low": bool(mean_err[idx] > 2.0),
            }
        )

    matches = []
    for idx, (first, second, ratio) in enumerate(good[:160]):
        left = pts_left[idx]
        right = pts_right[idx]
        error, line = _line_error(F, left, right)
        matches.append(
            {
                "id": idx,
                "left": _point(left),
                "right": _point(right),
                "inlier": bool(mask[idx]),
                "outlier": not bool(mask[idx]),
                "error": round(float(error), 3),
                "distance": round(float(first.distance), 3),
                "ratio": round(float(ratio), 4),
                "line": {
                    "a": round(float(line[0]), 8),
                    "b": round(float(line[1]), 8),
                    "c": round(float(line[2]), 5),
                },
            }
        )
    matches.sort(key=lambda item: (not item["inlier"], item["error"]))

    public_keypoints_left = [
        {"x": round(float(kp.pt[0]), 2), "y": round(float(kp.pt[1]), 2), "size": round(float(kp.size), 2)}
        for kp in keypoints_left[: max_features]
    ]
    public_keypoints_right = [
        {"x": round(float(kp.pt[0]), 2), "y": round(float(kp.pt[1]), 2), "size": round(float(kp.size), 2)}
        for kp in keypoints_right[: max_features]
    ]

    avg_error = float(np.mean([point["error"] for point in cloud_points]))
    low_count = sum(1 for point in cloud_points if point["low"])
    for candidate in candidates:
        candidate["selected"] = candidate["id"] == selected_candidate["id"]

    return {
        "success": True,
        "mode": "real",
        "algorithm": "OpenCV SIFT + RANSAC F/E + recoverPose + triangulatePoints",
        "sample": {
            "key": sample_key,
            "title": sample["title"],
            "source": sample["source"],
            "source_url": sample["source_url"],
            "permission_url": sample["permission_url"],
        },
        "images": {
            "width": DISPLAY_W,
            "height": DISPLAY_H,
            "left": _encode_png_bgr(left_img),
            "right": _encode_png_bgr(right_img),
        },
        "keypoints": {
            "left": public_keypoints_left,
            "right": public_keypoints_right,
        },
        "matches": matches,
        "matrices": {
            "F": _round_matrix(F),
            "K": _round_matrix(K),
            "E": _round_matrix(E),
            "R": _round_matrix(R),
            "t": [round(float(v), 6) for v in t_vec],
            "P1": _round_matrix(P1),
            "P2": _round_matrix(P2),
        },
        "pose": {
            "selected_candidate": selected_candidate["id"],
            "recover_pose_positive": int(pose_count),
            "candidates": candidates,
            "scale_note": "translation direction only; metric scale is unknown",
        },
        "cloud": {
            "points": cloud_points,
            "avg_error": round(avg_error, 3),
            "low_count": int(low_count),
            "stable_count": int(len(cloud_points) - low_count),
        },
        "stats": {
            "elapsed_ms": round((perf_counter() - start) * 1000, 2),
            "left_keypoints": len(keypoints_left),
            "right_keypoints": len(keypoints_right),
            "raw_pairs": len(raw_pairs),
            "ratio_matches": len(good),
            "inliers": int(np.count_nonzero(mask)),
            "outliers": int(len(good) - np.count_nonzero(mask)),
            "inlier_ratio": round(float(np.count_nonzero(mask) / max(len(good), 1)), 4),
            "triangulated": len(cloud_points),
            "mean_reprojection_error": round(avg_error, 3),
            "ratio_threshold": ratio_threshold,
            "ransac_threshold": ransac_threshold,
            "max_features": max_features,
        },
    }
