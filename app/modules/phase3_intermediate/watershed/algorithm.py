"""Watershed segmentation algorithm."""
import heapq
import numpy as np

from app.utils.image_utils import window_max


def watershed_segmentation(gradient_img, markers):
    """Flood from markers in increasing gradient order."""
    grad = np.asarray(gradient_img, dtype=np.float64)
    labels = np.asarray(markers, dtype=np.int32).copy()
    h, w = grad.shape

    heap = []
    visited = labels > 0
    for y in range(h):
        for x in range(w):
            if labels[y, x] > 0:
                heapq.heappush(heap, (float(grad[y, x]), y, x, int(labels[y, x])))

    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    while heap:
        _, y, x, lbl = heapq.heappop(heap)
        if labels[y, x] == 0:
            labels[y, x] = lbl
        for dy, dx in dirs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                labels[ny, nx] = lbl
                heapq.heappush(heap, (float(grad[ny, nx]), ny, nx, lbl))
    return labels


def make_markers_using_distance(binary_img, min_dist=10):
    """Create watershed markers using BFS distance transform. O(N) time."""
    binary = np.asarray(binary_img, dtype=np.uint8)
    binary = np.where(binary > 127, 1, 0).astype(np.uint8)
    if binary.size == 0:
        return binary

    h, w = binary.shape
    fg = binary > 0
    bg = ~fg

    # BFS distance transform: start from background pixels, flood into foreground
    from collections import deque
    dist = np.full((h, w), np.inf, dtype=np.float32)
    q = deque()

    for y in range(h):
        for x in range(w):
            if bg[y, x]:
                dist[y, x] = 0.0
                q.append((y, x))

    if not q:  # No background - entire image is foreground
        dist.fill(0)
    else:
        dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        while q:
            y, x = q.popleft()
            d = dist[y, x] + 1.0
            for dy, dx in dirs:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and d < dist[ny, nx]:
                    dist[ny, nx] = d
                    q.append((ny, nx))

    ws = max(3, int(min_dist) * 2 + 1)
    local_max = dist >= window_max(dist, ws)
    fg_markers = np.where(local_max & fg, 1, 0).astype(np.int32)
    bg_markers = np.where(bg, 2, 0).astype(np.int32)
    return fg_markers + bg_markers
