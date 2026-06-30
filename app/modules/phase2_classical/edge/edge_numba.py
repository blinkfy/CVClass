import numpy as np

from app.modules.phase2_classical.edge.edge import get_gauss, sobel_x, sobel_y

try:
    from numba import njit
    HAS_NUMBA = True
except ImportError:
    def njit(*args, **kwargs):
        return lambda f: f
    HAS_NUMBA = False


@njit(cache=True)
def to_gray_loop(img):
    h, w = img.shape[:2]
    out = np.zeros((h, w), dtype=np.uint8)
    for i in range(h):
        for j in range(w):
            r, g, b = img[i, j, 0], img[i, j, 1], img[i, j, 2]
            out[i, j] = int(round(0.299 * r + 0.587 * g + 0.114 * b))
    return out


def to_gray_numba(img):
    if not HAS_NUMBA:
        raise RuntimeError("numba 未安装，请执行 pip install numba")
    img = np.asarray(img)
    if img.ndim == 2:
        return img.astype(np.uint8)
    img_u8 = img.astype(np.uint8)
    return to_gray_loop(img_u8)


@njit(cache=True)
def conv_loop(padded, ker, h, w, kh, kw):
    res = np.zeros((h, w), dtype=np.float32)
    for i in range(h):
        for j in range(w):
            s = 0.0
            for ki in range(kh):
                for kj in range(kw):
                    s += padded[i + ki, j + kj] * ker[ki, kj]
            res[i, j] = s
    return res


def conv_numba(mat, ker):
    if not HAS_NUMBA:
        raise RuntimeError("numba 未安装，请执行 pip install numba")
    ker = np.asarray(ker, dtype=np.float32)
    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    mat = np.asarray(mat, dtype=np.float32)
    h, w = mat.shape
    padded = np.pad(mat, ((ph, ph), (pw, pw)), mode="edge")
    return conv_loop(padded, ker, h, w, kh, kw)


@njit(cache=True)
def nms_loop(norm, ang, h, w):
    out = np.zeros((h, w), dtype=np.float32)
    for i in range(1, h - 1):
        for j in range(1, w - 1):
            a = ang[i, j] % 180.0
            if a < 22.5 or a >= 157.5:
                n1 = norm[i, j - 1]
                n2 = norm[i, j + 1]
            elif a < 67.5:
                n1 = norm[i - 1, j + 1]
                n2 = norm[i + 1, j - 1]
            elif a < 112.5:
                n1 = norm[i - 1, j]
                n2 = norm[i + 1, j]
            else:
                n1 = norm[i - 1, j - 1]
                n2 = norm[i + 1, j + 1]
            if norm[i, j] >= n1 and norm[i, j] >= n2:
                out[i, j] = norm[i, j]
    return out


def nms_numba(norm, ang):
    if not HAS_NUMBA:
        raise RuntimeError("numba 未安装，请执行 pip install numba")
    norm = np.asarray(norm, dtype=np.float32)
    ang = np.asarray(ang, dtype=np.float32)
    h, w = norm.shape
    return nms_loop(norm, ang, h, w)


@njit(cache=True)
def link_edges_loop(strong, weak, h, w):
    res = np.zeros((h, w), dtype=np.uint8)
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    stack_y = []
    stack_x = []
    for i in range(h):
        for j in range(w):
            if strong[i, j]:
                stack_y.append(i)
                stack_x.append(j)
    while len(stack_y) > 0:
        y = stack_y.pop()
        x = stack_x.pop()
        if res[y, x]:
            continue
        res[y, x] = 255
        for d in range(8):
            ny = y + dirs[d][0]
            nx = x + dirs[d][1]
            if 0 <= ny < h and 0 <= nx < w and not res[ny, nx]:
                if strong[ny, nx] or weak[ny, nx]:
                    stack_y.append(ny)
                    stack_x.append(nx)
    return res


def link_edges_numba(img, low, high):
    if not HAS_NUMBA:
        raise RuntimeError("numba 未安装，请执行 pip install numba")
    img = np.asarray(img, dtype=np.float32)
    h, w = img.shape
    strong = img >= high
    weak = (img >= low) & (img < high)
    return link_edges_loop(strong, weak, h, w)


gauss_k = get_gauss()


def i_sobel_numba(img, threshold=80):
    gray = to_gray_numba(img)
    sx = conv_numba(gray, sobel_x)
    sy = conv_numba(gray, sobel_y)
    norm = np.sqrt(sx * sx + sy * sy)

    max_val = float(norm.max()) if norm.size else 0.0
    if max_val > 1e-8:
        norm_u8 = (norm / max_val * 255).clip(0, 255).astype(np.uint8)
    else:
        norm_u8 = np.zeros(norm.shape, dtype=np.uint8)

    mask = norm_u8 >= threshold
    return np.where(mask, 255, 0).astype(np.uint8)


def i_canny_numba(img, low=50, high=150):
    gray = to_gray_numba(img)
    blur = conv_numba(gray, gauss_k)
    sx = conv_numba(blur, sobel_x)
    sy = conv_numba(blur, sobel_y)
    norm = np.sqrt(sx * sx + sy * sy)
    ang = np.rad2deg(np.arctan2(sy, sx))
    sup = nms_numba(norm, ang)
    return link_edges_numba(sup, low, high)
