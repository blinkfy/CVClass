"""Stereo block matching for disparity estimation. Pure NumPy, vectorized."""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def block_matching_disparity(left_img, right_img, block_size=9, max_disparity=64):
    """Vectorized block matching using sliding_window_view."""
    left = np.asarray(left_img, dtype=np.float64)
    right = np.asarray(right_img, dtype=np.float64)

    if left.ndim == 3:
        left = 0.299*left[:,:,0] + 0.587*left[:,:,1] + 0.114*left[:,:,2]
    if right.ndim == 3:
        right = 0.299*right[:,:,0] + 0.587*right[:,:,1] + 0.114*right[:,:,2]

    h, w = left.shape
    half = block_size // 2
    bs = block_size

    if h < bs or w < bs:
        return np.zeros((h, w), dtype=np.float64)

    # Right image: extract all patches (H, W-bs+1, bs, bs)
    right_patches = sliding_window_view(right, (bs, bs))
    rh, rw = right_patches.shape[:2]

    # Left patches: only need the valid region (H-bs+1, W-bs+1, bs, bs)
    left_patches = sliding_window_view(left, (bs, bs))
    # Reshape for broadcasting: (H-bs+1, W-bs+1, 1, bs*bs)
    L = left_patches.reshape(rh, rw, 1, bs * bs)

    # SAD for each disparity
    best_sad = np.full((h, w), np.inf, dtype=np.float64)
    best_disp = np.zeros((h, w), dtype=np.float64)

    # Process disparities in chunks to manage memory
    max_disp = min(max_disparity, rw - 1)
    for disp in range(0, max_disp + 1):
        # Right patches shifted by disp: (H-bs+1, valid_width, bs*bs)
        valid_w = rw - disp
        if valid_w <= 0:
            break
        R = right_patches[:, disp:disp + valid_w, :, :].reshape(rh, valid_w, 1, bs * bs)
        L_valid = L[:, :valid_w, :, :]

        # SAD: sum(|L - R|) across patch pixels
        sad_map = np.sum(np.abs(L_valid[:, :, 0, :] - R[:, :, 0, :]), axis=2)  # (rh, valid_w)

        # Update best: where sad_map < current best
        y0, x0 = half, half
        better = sad_map < best_sad[y0:y0 + rh, x0:x0 + valid_w]
        best_sad[y0:y0 + rh, x0:x0 + valid_w][better] = sad_map[better]
        best_disp[y0:y0 + rh, x0:x0 + valid_w][better] = disp

    return best_disp


def disparity_to_depth(disparity, baseline=0.1, focal_length=500):
    """
    Convert disparity to depth.
    depth = (baseline * focal_length) / disparity
    depth = 0 where disparity = 0 (no match found)
    """
    disp = np.asarray(disparity, dtype=np.float64)
    depth = np.zeros_like(disp)
    valid = disp > 0
    depth[valid] = (baseline * focal_length) / disp[valid]
    return depth


def disparity_to_color(disparity, max_disp=None):
    """
    Colorize disparity map for visualization.
    Red = close (large disparity), Blue = far (small disparity).
    """
    disp = np.asarray(disparity, dtype=np.float64)
    if max_disp is None:
        max_disp = disp.max() if disp.max() > 0 else 1.0

    norm = np.clip(disp / max(max_disp, 1e-6), 0, 1)
    colored = np.zeros((*disp.shape, 3), dtype=np.uint8)

    m = norm < 0.25
    colored[..., 1][m] = np.round(norm[m] * 4 * 255).astype(np.uint8)
    colored[..., 2][m] = 255

    m = (norm >= 0.25) & (norm < 0.5)
    colored[..., 1][m] = 255
    colored[..., 2][m] = np.round((0.5 - norm[m]) * 4 * 255).clip(0, 255).astype(np.uint8)

    m = (norm >= 0.5) & (norm < 0.75)
    colored[..., 0][m] = np.round((norm[m] - 0.5) * 4 * 255).clip(0, 255).astype(np.uint8)
    colored[..., 1][m] = 255

    m = norm >= 0.75
    colored[..., 0][m] = 255
    colored[..., 1][m] = np.round((1 - norm[m]) * 4 * 255).clip(0, 255).astype(np.uint8)

    return colored
