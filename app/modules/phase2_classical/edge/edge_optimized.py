import numpy as np
from app.utils.image_utils import ensure_uint8
from numpy.lib.stride_tricks import sliding_window_view


GRAY_WEIGHTS = np.array([0.299, 0.587, 0.114], dtype=np.float32)
SOBEL_SMOOTH = np.array([1, 2, 1], dtype=np.float32)
SOBEL_DIFF = np.array([-1, 0, 1], dtype=np.float32)
GAUSS_1D = None


def get_gauss_1d(sz=5, sigma=1.4):
    c = sz // 2
    ax = np.arange(-c, c + 1, dtype=np.float32)
    ker = np.exp(-(ax * ax) / (2 * sigma * sigma))
    return (ker / np.sum(ker)).astype(np.float32)


def gauss_1d():
    global GAUSS_1D
    if GAUSS_1D is None:
        GAUSS_1D = get_gauss_1d()
    return GAUSS_1D


def to_gray(img):
    if img.ndim == 2:
        return ensure_uint8(img)
    img = ensure_uint8(img)
    gray = np.dot(img[..., :3], GRAY_WEIGHTS)
    np.round(gray, out=gray)
    return gray.astype(np.uint8)


def bi(img, threshold):
    arr = np.asarray(img, dtype=np.uint8)
    out = np.zeros_like(arr, dtype=np.uint8)
    out[arr >= threshold] = 255
    return out


def conv(mat, ker):
    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    mat = np.asarray(mat, dtype=np.float32)
    padded = np.pad(mat, ((ph, ph), (pw, pw)), mode="edge")
    views = sliding_window_view(padded, window_shape=(kh, kw))
    return np.sum(views * ker, axis=(2, 3))


def conv2d_separable(mat, v_kernel, h_kernel):
    mat = np.asarray(mat, dtype=np.float32)

    kv = len(v_kernel)
    pv = kv // 2
    padded_v = np.pad(mat, ((pv, pv), (0, 0)), mode="edge")
    windows_v = sliding_window_view(padded_v, (kv, 1))
    vertical = np.sum(windows_v * v_kernel.reshape(1, 1, kv, 1), axis=(2, 3))

    kh = len(h_kernel)
    ph = kh // 2
    padded_h = np.pad(vertical, ((0, 0), (ph, ph)), mode="edge")
    windows_h = sliding_window_view(padded_h, (1, kh))
    return np.sum(windows_h * h_kernel.reshape(1, 1, 1, kh), axis=(2, 3))


def gauss_blur(img):
    ker = gauss_1d()
    return conv2d_separable(img, ker, ker)


def sobel(img):
    sx = conv2d_separable(img, SOBEL_SMOOTH, SOBEL_DIFF)
    sy = conv2d_separable(img, SOBEL_DIFF, SOBEL_SMOOTH)
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
        (0, (0, -1), (0, 1)),
        (1, (-1, 1), (1, -1)),
        (2, (-1, 0), (1, 0)),
        (3, (-1, -1), (1, 1)),
    ]

    center = norm[1:-1, 1:-1]
    out_core = out[1:-1, 1:-1]
    dirs_core = dirs[1:-1, 1:-1]
    for d, (dy1, dx1), (dy2, dx2) in offsets:
        mask = dirs_core == d
        n1 = norm[1 + dy1 : h - 1 + dy1, 1 + dx1 : w - 1 + dx1]
        n2 = norm[1 + dy2 : h - 1 + dy2, 1 + dx2 : w - 1 + dx2]
        keep = (center >= n1) & (center >= n2) & mask
        out_core[keep] = center[keep]

    return out


def link_edges_stack(img, low, high):
    h, w = img.shape
    strong = img >= high
    weak = (img >= low) & (img < high)
    res = np.zeros((h, w), dtype=np.uint8)
    ys, xs = np.where(strong)
    stack_y = list(ys)
    stack_x = list(xs)
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while stack_y:
        y = stack_y.pop()
        x = stack_x.pop()
        if res[y, x]:
            continue
        res[y, x] = 255
        for dy, dx in dirs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not res[ny, nx]:
                if strong[ny, nx] or weak[ny, nx]:
                    stack_y.append(ny)
                    stack_x.append(nx)
    return res


def link_edges_morph_stats(img, low, high, max_iter=None):
    strong = img >= high
    weak = (img >= low) & (img < high)
    mask = strong | weak
    iterations = 0

    while True:
        iterations += 1
        padded = np.pad(strong, 1, mode="constant")
        windows = sliding_window_view(padded, (3, 3))
        dilated = np.any(windows, axis=(2, 3))
        next_strong = dilated & mask
        if np.array_equal(strong, next_strong):
            return (strong * 255).astype(np.uint8), iterations
        strong = next_strong
        if max_iter is not None and iterations >= max_iter:
            return (strong * 255).astype(np.uint8), iterations


def link_edges_morph(img, low, high):
    out, _ = link_edges_morph_stats(img, low, high)
    return out


def positive_to_uint8(img):
    arr = np.asarray(img, dtype=np.float32)
    max_val = float(arr.max()) if arr.size else 0.0
    if max_val <= 1e-8:
        return np.zeros(arr.shape, dtype=np.uint8)
    return (arr / max_val * 255).clip(0, 255).astype(np.uint8)


def i_sobel(img, threshold=80):
    gray = to_gray(img)
    _, _, norm, _ = sobel(gray)
    return bi(positive_to_uint8(norm), threshold)


def i_canny(img, low=50, high=150, link_mode="stack"):
    gray = to_gray(img)
    blur = gauss_blur(gray)
    _, _, norm, ang = sobel(blur)
    sup = nms(norm, ang)
    if link_mode == "morph":
        return link_edges_morph(sup, low, high)
    return link_edges_stack(sup, low, high)


def i_canny_morph(img, low=50, high=150):
    return i_canny(img, low, high, link_mode="morph")
