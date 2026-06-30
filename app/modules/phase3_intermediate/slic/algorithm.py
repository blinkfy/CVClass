"""SLIC superpixel segmentation. Pure NumPy."""
import numpy as np


def slic_superpixels(img, num_superpixels=200, compactness=10.0, max_iter=10):
    """
    SLIC (Simple Linear Iterative Clustering) superpixel segmentation.
    Clusters pixels in 5D space: [L, a, b, x, y]
    compactness: trade-off between color similarity and spatial proximity.
    """
    arr = np.asarray(img, dtype=np.float64)
    if arr.ndim == 2:
        arr = np.stack([arr, arr, arr], axis=-1)
    h, w = arr.shape[:2]

    # Convert RGB to CIELAB (simplified)
    lab = _rgb_to_lab_simple(arr)

    # Initialize cluster centers on a regular grid
    S = int(np.sqrt(h * w / num_superpixels))
    nx = w // S
    ny = h // S
    Sx = w / nx
    Sy = h / ny

    centers = []
    for i in range(ny):
        for j in range(nx):
            cy = int((i + 0.5) * Sy)
            cx = int((j + 0.5) * Sx)
            if cy < h and cx < w:
                centers.append(np.array([
                    lab[cy, cx, 0], lab[cy, cx, 1], lab[cy, cx, 2],
                    cx, cy
                ], dtype=np.float64))

    centers = np.array(centers)
    n_centers = len(centers)

    # Assign labels
    labels = np.full((h, w), -1, dtype=np.int32)
    distances = np.full((h, w), np.inf, dtype=np.float64)

    for _ in range(max_iter):
        changed = False
        new_distances = np.full((h, w), np.inf, dtype=np.float64)
        new_labels = np.full((h, w), -1, dtype=np.int32)

        for k, center in enumerate(centers):
            cx, cy = int(center[3]), int(center[4])
            # Search in 2S x 2S neighborhood
            y0 = max(0, cy - S)
            y1 = min(h, cy + S + 1)
            x0 = max(0, cx - S)
            x1 = min(w, cx + S + 1)

            for y in range(y0, y1):
                for x in range(x0, x1):
                    # Color distance
                    dc = np.sqrt(np.sum((lab[y, x] - center[:3])**2))
                    # Spatial distance
                    ds = np.sqrt((x - center[3])**2 + (y - center[4])**2)
                    # Combined distance
                    D = np.sqrt(dc**2 + (ds / S * compactness)**2)

                    if D < new_distances[y, x]:
                        new_distances[y, x] = D
                        new_labels[y, x] = k

        if np.array_equal(labels, new_labels):
            break
        labels = new_labels
        distances = new_distances

        # Update centers
        for k in range(n_centers):
            mask = labels == k
            if mask.any():
                for d in range(3):
                    centers[k, d] = lab[:, :, d][mask].mean()
                ys, xs = np.where(mask)
                centers[k, 3] = xs.mean()
                centers[k, 4] = ys.mean()

    return labels, n_centers


def _rgb_to_lab_simple(rgb):
    """Simplified RGB -> CIELAB conversion."""
    arr = rgb.astype(np.float64) / 255.0
    # RGB -> XYZ (simplified)
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    x = 0.4124*r + 0.3576*g + 0.1805*b
    y = 0.2126*r + 0.7152*g + 0.0722*b
    z = 0.0193*r + 0.1192*g + 0.9505*b
    # XYZ -> Lab (simplified)
    xn, yn, zn = 0.9505, 1.0, 1.0890
    fx = _f_lab(x / xn)
    fy = _f_lab(y / yn)
    fz = _f_lab(z / zn)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b_lab = 200.0 * (fy - fz)
    return np.stack([L, a, b_lab], axis=-1)


def _f_lab(t):
    delta = 6.0 / 29.0
    result = np.where(t > delta**3, t**(1.0/3.0), t/(3.0*delta**2) + 4.0/29.0)
    return result
