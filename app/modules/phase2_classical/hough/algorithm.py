"""Hough Transform for line detection. Pure NumPy."""
import numpy as np


def hough_line_transform(edge_img, theta_res=180, rho_res=None, max_edge_pixels=20000):
    """
    Hough line detection via rho-theta parameter space voting.
    For each edge pixel (x,y), vote for all lines passing through it:
      rho = x*cos(theta) + y*sin(theta)

    Returns: (accumulator, thetas, rhos)
    """
    edges = np.asarray(edge_img, dtype=np.uint8)
    h, w = edges.shape
    diag = int(np.ceil(np.sqrt(h*h + w*w)))
    if rho_res is None:
        rho_res = diag * 2

    thetas = np.linspace(0, np.pi, theta_res, endpoint=False)
    rhos = np.linspace(-diag, diag, rho_res)
    accumulator = np.zeros((rho_res, theta_res), dtype=np.float64)

    # Get edge pixel coordinates
    ys, xs = np.where(edges > 0)
    if xs.size > int(max_edge_pixels):
        keep = np.linspace(0, xs.size - 1, int(max_edge_pixels)).astype(np.int32)
        xs, ys = xs[keep], ys[keep]
    cos_t = np.cos(thetas)
    sin_t = np.sin(thetas)

    if xs.size:
        rho_vals = xs[:, None] * cos_t[None, :] + ys[:, None] * sin_t[None, :]
        rho_idx = np.round((rho_vals + diag) / (2 * diag) * (rho_res - 1)).astype(np.int32)
        rho_idx = np.clip(rho_idx, 0, rho_res - 1)
        theta_idx = np.broadcast_to(np.arange(theta_res, dtype=np.int32), rho_idx.shape)
        np.add.at(accumulator, (rho_idx.ravel(), theta_idx.ravel()), 1)

    return accumulator, thetas, rhos


def find_line_peaks(accumulator, thetas, rhos, threshold_ratio=0.5, min_distance=10, max_lines=50):
    """
    Find peaks in Hough accumulator space.
    Each peak = one detected line: (rho, theta, votes)
    """
    acc = np.asarray(accumulator, dtype=np.float64)
    max_val = acc.max() if acc.size else 1.0
    threshold = max_val * threshold_ratio

    rho_res, theta_res = acc.shape
    if rho_res < 3 or theta_res < 3:
        return []

    center = acc[1:-1, 1:-1]
    local_max = center >= threshold
    for dr in (-1, 0, 1):
        for dt in (-1, 0, 1):
            if dr == 0 and dt == 0:
                continue
            local_max &= center >= acc[1 + dr:rho_res - 1 + dr, 1 + dt:theta_res - 1 + dt]

    rr, tt = np.where(local_max)
    vals = center[rr, tt]
    order = np.argsort(vals)[::-1]
    peaks = [(float(vals[i]), int(rr[i] + 1), int(tt[i] + 1)) for i in order]

    # Filter peaks that are too close
    filtered = []
    for val, r, t in peaks:
        too_close = False
        for _, pr, pt in filtered:
            dr = abs(r - pr)
            dt = min(abs(t - pt), theta_res - abs(t - pt))
            if dr < min_distance and dt < min_distance:
                too_close = True
                break
        if not too_close:
            filtered.append((val, r, t))
        if len(filtered) >= max_lines:
            break

    return [{'rho': float(rhos[r]), 'theta': float(thetas[t]), 'votes': int(val)}
            for val, r, t in filtered]
