"""Contour finding via border following. Pure NumPy."""
import numpy as np


def find_contours(binary_img, min_area=50):
    """
    Simple border-following contour detection.
    Scans the binary image row by row, follows the outer boundary
    of each white region.
    Returns list of contours, each contour = list of (x, y) points.
    """
    img = np.asarray(binary_img, dtype=np.uint8)
    img = np.where(img > 127, 1, 0).astype(np.uint8)
    h, w = img.shape
    visited = np.zeros((h, w), dtype=bool)
    contours = []

    # 8-direction neighbor offsets (clockwise)
    dirs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]

    for y in range(h):
        for x in range(w):
            if img[y, x] == 0 or visited[y, x]:
                continue

            # Found start of a new white region, follow its boundary
            contour = []
            stack = [(y, x)]
            while stack:
                cy, cx = stack.pop()
                if visited[cy, cx]:
                    continue
                visited[cy, cx] = True

                # Check if this is a boundary pixel (has at least one black neighbor)
                is_boundary = False
                for dy, dx in dirs:
                    ny, nx = cy + dy, cx + dx
                    if ny < 0 or ny >= h or nx < 0 or nx >= w or img[ny, nx] == 0:
                        is_boundary = True
                        break

                if is_boundary:
                    contour.append((int(cx), int(cy)))

                # Add unvisited white neighbors to stack
                for dy, dx in dirs:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and img[ny, nx] == 1 and not visited[ny, nx]:
                        stack.append((ny, nx))

            if len(contour) >= min_area:
                contours.append(contour)

    return contours


def contour_area(contour):
    """Compute area enclosed by contour using the shoelace formula."""
    if len(contour) < 3:
        return 0
    area = 0
    n = len(contour)
    for i in range(n):
        x1, y1 = contour[i]
        x2, y2 = contour[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def contour_centroid(contour):
    """Compute centroid (center of mass) of a contour."""
    if not contour:
        return (0, 0)
    xs = [p[0] for p in contour]
    ys = [p[1] for p in contour]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def contour_perimeter(contour):
    """Compute perimeter (sum of distances between consecutive points)."""
    if len(contour) < 2:
        return 0
    peri = 0
    for i in range(len(contour)):
        x1, y1 = contour[i]
        x2, y2 = contour[(i + 1) % len(contour)]
        peri += np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    return peri


def approximate_contour(contour, epsilon=0.02):
    """
    Douglas-Peucker contour approximation.
    Simplifies contour by removing points that are within epsilon
    distance from the line connecting endpoints.
    """
    if len(contour) <= 2:
        return contour

    peri = contour_perimeter(contour)
    eps = epsilon * peri

    # Find point with maximum distance from line (start -> end)
    max_dist = 0
    max_idx = 0
    xs, ys = contour[0]
    xe, ye = contour[-1]
    line_len = np.sqrt((xe - xs)**2 + (ye - ys)**2)

    for i in range(1, len(contour) - 1):
        xi, yi = contour[i]
        if line_len < 1e-12:
            dist = np.sqrt((xi - xs)**2 + (yi - ys)**2)
        else:
            # Distance from point to line
            dist = abs((xe - xs)*(ys - yi) - (xs - xi)*(ye - ys)) / line_len
        if dist > max_dist:
            max_dist = dist
            max_idx = i

    if max_dist > eps:
        left = approximate_contour(contour[:max_idx+1], epsilon)
        right = approximate_contour(contour[max_idx:], epsilon)
        return left[:-1] + right
    else:
        return [contour[0], contour[-1]]
