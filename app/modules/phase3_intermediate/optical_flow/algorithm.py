"""Lucas-Kanade optical flow. Pure NumPy."""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def lucas_kanade_flow(img1, img2, points, window_size=15):
    """
    Lucas-Kanade sparse optical flow.
    For each point, solve the linear system in a local window:
      [sum(Ix^2)    sum(Ix*Iy)] [u]   [-sum(Ix*It)]
      [sum(Ix*Iy)   sum(Iy^2) ] [v] = [-sum(Iy*It)]

    where u, v are the estimated optical flow at that point.
    """
    I1 = np.asarray(img1, dtype=np.float64)
    I2 = np.asarray(img2, dtype=np.float64)

    # Compute gradients
    Ix = np.zeros_like(I1)
    Iy = np.zeros_like(I1)
    Ix[:, 1:-1] = (I1[:, 2:] - I1[:, :-2]) / 2.0
    Iy[1:-1, :] = (I1[2:, :] - I1[:-2, :]) / 2.0
    It = I2 - I1  # Temporal derivative

    h, w = I1.shape
    half = window_size // 2
    flows = []

    for px, py in points:
        x, y = int(round(px)), int(round(py))
        if x < half or x >= w - half or y < half or y >= h - half:
            flows.append((0, 0))
            continue

        # Extract local window
        y0, y1 = y - half, y + half + 1
        x0, x1 = x - half, x + half + 1
        ix = Ix[y0:y1, x0:x1].ravel()
        iy = Iy[y0:y1, x0:x1].ravel()
        it = It[y0:y1, x0:x1].ravel()

        # Build the linear system
        A = np.zeros((2, 2))
        b = np.zeros(2)
        A[0, 0] = np.sum(ix * ix)
        A[0, 1] = np.sum(ix * iy)
        A[1, 0] = A[0, 1]
        A[1, 1] = np.sum(iy * iy)
        b[0] = -np.sum(ix * it)
        b[1] = -np.sum(iy * it)

        # Solve for flow (with regularization)
        eps = 1e-6
        det = A[0, 0] * A[1, 1] - A[0, 1] * A[1, 0]
        if abs(det) < eps:
            flows.append((0, 0))
        else:
            u = (A[1, 1] * b[0] - A[0, 1] * b[1]) / det
            v = (A[0, 0] * b[1] - A[0, 1] * b[0]) / det
            flows.append((float(u), float(v)))

    return flows


def flow_to_color(flows, max_magnitude=None):
    """
    Convert optical flow vectors to HSV color wheel representation.
    Hue = flow direction, Saturation = flow magnitude.
    """
    if max_magnitude is None:
        mags = [np.sqrt(u*u + v*v) for u, v in flows]
        max_magnitude = max(mags) if mags else 1.0

    colors = []
    for u, v in flows:
        mag = np.sqrt(u*u + v*v)
        angle = np.arctan2(v, u) * 180.0 / np.pi
        if angle < 0:
            angle += 360.0

        # HSV -> RGB
        h = angle / 360.0
        s = min(mag / max(max_magnitude, 1e-6), 1.0)
        v_val = 0.8

        # Simple HSV to RGB
        c = v_val * s
        x = c * (1 - abs((h * 6) % 2 - 1))
        m = v_val - c

        if h < 1/6:
            r, g, b = c, x, 0
        elif h < 2/6:
            r, g, b = x, c, 0
        elif h < 3/6:
            r, g, b = 0, c, x
        elif h < 4/6:
            r, g, b = 0, x, c
        elif h < 5/6:
            r, g, b = x, 0, c
        else:
            r, g, b = c, 0, x

        colors.append((
            int((r + m) * 255),
            int((g + m) * 255),
            int((b + m) * 255),
        ))

    return colors
