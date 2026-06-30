import numpy as np
from app.utils.image_utils import ensure_uint8
from numpy.lib.stride_tricks import sliding_window_view


def to_gray(img):
    if img.ndim == 2:
        return ensure_uint8(img)
    img = ensure_uint8(img)
    weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    gray = np.dot(img[..., :3], weights)
    gray = np.round(gray)
    return gray.astype(np.uint8)


def bi(img, threshold):
    arr = np.asarray(img, dtype=np.uint8)
    mask = arr >= threshold
    return np.where(mask, 255, 0).astype(np.uint8)


def conv(mat, ker):
    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    mat = np.asarray(mat, dtype=np.float32)
    padded = np.pad(mat, ((ph, ph), (pw, pw)), mode="edge")
    views = sliding_window_view(padded, window_shape=(kh, kw))
    res = np.sum(views * ker, axis=(2, 3))
    return res


sobel_x = np.array([[-1, 0, 1], 
                    [-2, 0, 2], 
                    [-1, 0, 1]])
sobel_y = np.array([[-1, -2, -1], 
                    [0, 0, 0], 
                    [1, 2, 1]])


def get_gauss(sz=5, sigma=1.4):
    c = sz // 2
    ax = np.arange(-c, c + 1, dtype=np.float32)
    x, y = np.meshgrid(ax, ax)
    ker = np.exp(-(x * x + y * y) / (2 * sigma * sigma))
    res = ker / np.sum(ker)
    return res


gauss_k = get_gauss()


def positive_to_uint8(img):
    arr = np.asarray(img, dtype=np.float32)
    max_val = float(arr.max()) if arr.size else 0.0
    if max_val <= 1e-8:
        return np.zeros(arr.shape, dtype=np.uint8)
    normalized = arr / max_val
    scaled = normalized * 255
    return scaled.clip(0, 255).astype(np.uint8)


def sobel(img):
    sx = conv(img, sobel_x)
    sy = conv(img, sobel_y)
    norm = np.sqrt(sx * sx + sy * sy)
    ang = np.rad2deg(np.arctan2(sy, sx))
    return sx, sy, norm, ang


def nms(norm, ang):
    h, w = norm.shape
    out = np.zeros((h, w), dtype=np.float32)

    ang_mod = ang % 180
    dirs = np.zeros((h, w), dtype=np.uint8)
    dirs[(ang_mod < 22.5) | (ang_mod >= 157.5)] = 0
    dirs[(ang_mod >= 22.5) & (ang_mod < 67.5)] = 1
    dirs[(ang_mod >= 67.5) & (ang_mod < 112.5)] = 2
    dirs[(ang_mod >= 112.5) & (ang_mod < 157.5)] = 3

    offsets = [
        (0, ( 0, -1), ( 0,  1)),
        (1, (-1,  1), ( 1, -1)),
        (2, (-1,  0), ( 1,  0)),
        (3, (-1, -1), ( 1,  1))
    ]

    for d, (dy1, dx1), (dy2, dx2) in offsets:
        mask = dirs[1:-1, 1:-1] == d
        center = norm[1:-1, 1:-1]
        n1 = norm[1+dy1 : h-1+dy1, 1+dx1 : w-1+dx1]
        n2 = norm[1+dy2 : h-1+dy2, 1+dx2 : w-1+dx2]
        keep = (center >= n1) & (center >= n2) & mask
        out[1:-1, 1:-1][keep] = center[keep]

    return out


def link_edges(img, low, high):
    h, w = img.shape
    strong = img >= high
    weak = (img >= low) & (img < high)
    res = np.zeros((h, w), dtype=np.uint8)
    ys, xs = np.where(strong)
    stk = list(zip(ys, xs))
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while stk:
        y, x = stk.pop()
        if res[y, x]:
            continue
        res[y, x] = 255
        for dy, dx in dirs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not res[ny, nx]:
                if strong[ny, nx] or weak[ny, nx]:
                    stk.append((ny, nx))
    return res


def i_sobel(img, threshold=80):
    gray = to_gray(img)
    _, _, norm, _ = sobel(gray)
    norm = positive_to_uint8(norm)
    return bi(norm, threshold)


def i_canny(img, low=50, high=150):
    gray = to_gray(img)
    blur = conv(gray, gauss_k)
    _, _, norm, ang = sobel(blur)
    sup = nms(norm, ang)
    return link_edges(sup, low, high)
