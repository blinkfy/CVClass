"""HOG feature extraction. Pure NumPy."""
import numpy as np


def compute_gradients(gray_img):
    """Compute gradient magnitude and orientation for each pixel."""
    arr = np.asarray(gray_img, dtype=np.float64)
    h, w = arr.shape
    gx = np.zeros_like(arr)
    gy = np.zeros_like(arr)
    gx[:, 1:-1] = arr[:, 2:] - arr[:, :-2]
    gy[1:-1, :] = arr[2:, :] - arr[:-2, :]
    mag = np.sqrt(gx**2 + gy**2)
    ang = np.arctan2(gy, gx) * 180.0 / np.pi
    ang = ang % 180  # Unsigned gradient [0, 180)
    return mag, ang


def extract_hog_features(gray_img, cell_size=8, block_size=2, num_bins=9):
    """
    Extract HOG (Histogram of Oriented Gradients) features.

    Steps:
    1. Compute gradient magnitude and orientation per pixel
    2. Divide image into cells (e.g. 8x8 pixels)
    3. Build histogram of gradients for each cell (9 bins for 0-180 degrees)
    4. Normalize across blocks of cells (e.g. 2x2 cells)
    5. Concatenate all block histograms into final feature vector

    Returns: (feature_vector, cell_histograms, visualization_data)
    """
    img = np.asarray(gray_img, dtype=np.float64)
    h, w = img.shape
    mag, ang = compute_gradients(img)

    # Number of cells
    n_cells_y = h // cell_size
    n_cells_x = w // cell_size
    h_trim = n_cells_y * cell_size
    w_trim = n_cells_x * cell_size

    # Cell histograms
    bin_width = 180.0 / num_bins
    cell_hists = np.zeros((n_cells_y, n_cells_x, num_bins), dtype=np.float64)

    for cy in range(n_cells_y):
        for cx in range(n_cells_x):
            y0, y1 = cy * cell_size, (cy + 1) * cell_size
            x0, x1 = cx * cell_size, (cx + 1) * cell_size
            cell_mag = mag[y0:y1, x0:x1]
            cell_ang = ang[y0:y1, x0:x1]

            for i in range(cell_size):
                for j in range(cell_size):
                    m = cell_mag[i, j]
                    a = cell_ang[i, j]
                    # Bilinear interpolation into two neighboring bins
                    bin_idx = a / bin_width
                    lo = int(np.floor(bin_idx)) % num_bins
                    hi = (lo + 1) % num_bins
                    frac = bin_idx - np.floor(bin_idx)
                    cell_hists[cy, cx, lo] += m * (1 - frac)
                    cell_hists[cy, cx, hi] += m * frac

    # Block normalization
    features = []
    for cy in range(n_cells_y - block_size + 1):
        for cx in range(n_cells_x - block_size + 1):
            block = cell_hists[cy:cy+block_size, cx:cx+block_size, :].ravel()
            norm = np.sqrt(np.sum(block**2) + 1e-6)
            features.extend((block / norm).tolist())

    return np.array(features, dtype=np.float64), cell_hists, (mag[:h_trim, :w_trim], ang[:h_trim, :w_trim])


def visualize_hog_cells(gray_img, cell_hists, cell_size=8):
    """
    Create a HOG visualization image showing dominant gradient directions per cell.
    Each cell shows lines in the directions of its histogram bins,
    with line length proportional to bin magnitude.
    """
    h_cells, w_cells = cell_hists.shape[:2]
    h_img = h_cells * cell_size
    w_img = w_cells * cell_size
    vis = np.zeros((h_img, w_img, 3), dtype=np.uint8)
    vis[:] = np.array([245, 245, 245], dtype=np.uint8)

    for cy in range(h_cells):
        for cx in range(w_cells):
            y0, x0 = cy * cell_size + cell_size // 2, cx * cell_size + cell_size // 2
            hist = cell_hists[cy, cx]
            max_val = hist.max() if hist.max() > 0 else 1.0

            for b in range(len(hist)):
                angle = b * 180.0 / len(hist)
                rad = np.deg2rad(angle)
                length = int(hist[b] / max_val * cell_size * 0.4)
                x1 = int(x0 - np.cos(rad) * length)
                y1 = int(y0 - np.sin(rad) * length)
                x2 = int(x0 + np.cos(rad) * length)
                y2 = int(y0 + np.sin(rad) * length)
                # Draw line
                n = max(abs(x2 - x1), abs(y2 - y1), 1)
                for t in np.linspace(0, 1, n):
                    xx = int(x1 + (x2 - x1) * t)
                    yy = int(y1 + (y2 - y1) * t)
                    if 0 <= yy < h_img and 0 <= xx < w_img:
                        vis[yy, xx] = [59, 130, 246]

    return vis
