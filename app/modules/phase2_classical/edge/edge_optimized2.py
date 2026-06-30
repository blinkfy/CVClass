import numpy as np
from concurrent.futures import ThreadPoolExecutor

from app.modules.phase2_classical.edge.edge_optimized import (
    SOBEL_SMOOTH,
    SOBEL_DIFF,
    to_gray,
    bi,
    gauss_blur,
    conv2d_separable,
    positive_to_uint8,
)

try:
    from numba import njit, prange
    HAS_NUMBA = True
except ImportError:
    def njit(*args, **kwargs):
        return lambda f: f
    def prange(n):
        return range(n)
    HAS_NUMBA = False


@njit(cache=True, fastmath=True)
def nms_jit(norm, ang, h, w):
    out = np.zeros((h, w), dtype=np.float32)
    for i in prange(1, h - 1):
        for j in range(1, w - 1):
            a = ang[i, j] % 180.0
            val = norm[i, j]
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
            if val >= n1 and val >= n2:
                out[i, j] = val
    return out


@njit(cache=True, fastmath=True)
def hysteresis_jit(strong, weak, h, w):
    dy = (-1, -1, -1, 0, 0, 1, 1, 1)
    dx = (-1, 0, 1, -1, 1, -1, 0, 1)
    stack_y = np.empty(h * w, dtype=np.int64)
    stack_x = np.empty(h * w, dtype=np.int64)
    queued = np.zeros((h, w), dtype=np.bool_)
    sp = 0

    for i in range(h):
        for j in range(w):
            if strong[i, j]:
                stack_y[sp] = i
                stack_x[sp] = j
                queued[i, j] = True
                sp += 1

    res = np.zeros((h, w), dtype=np.uint8)

    while sp > 0:
        sp -= 1
        y = stack_y[sp]
        x = stack_x[sp]
        res[y, x] = 255
        for d in range(8):
            ny = y + dy[d]
            nx = x + dx[d]
            if 0 <= ny < h and 0 <= nx < w and not queued[ny, nx]:
                if strong[ny, nx] or weak[ny, nx]:
                    stack_y[sp] = ny
                    stack_x[sp] = nx
                    queued[ny, nx] = True
                    sp += 1
    return res


POOL = None
WARMED = False


def get_pool():
    global POOL
    if POOL is None:
        POOL = ThreadPoolExecutor(max_workers=2)
    return POOL


def has_numba():
    return HAS_NUMBA


def warmup():
    global WARMED, HAS_NUMBA
    if WARMED or not HAS_NUMBA:
        WARMED = True
        return
    img = np.zeros((32, 32), dtype=np.uint8)
    img[8:24, 8:24] = 255
    try:
        i_canny(img)
    except Exception:
        HAS_NUMBA = False
    WARMED = True


def sobel(img):
    img = np.asarray(img, dtype=np.float32)
    pool = get_pool()

    fx = pool.submit(conv2d_separable, img, SOBEL_SMOOTH, SOBEL_DIFF)
    fy = pool.submit(conv2d_separable, img, SOBEL_DIFF, SOBEL_SMOOTH)
    sx = fx.result()
    sy = fy.result()

    norm = np.sqrt(sx * sx + sy * sy)
    ang = np.rad2deg(np.arctan2(sy, sx))
    return sx, sy, norm, ang


def nms(norm, ang):
    if HAS_NUMBA:
        norm = np.asarray(norm, dtype=np.float32)
        ang = np.asarray(ang, dtype=np.float32)
        return nms_jit(norm, ang, norm.shape[0], norm.shape[1])
    from app.modules.phase2_classical.edge.edge_optimized import nms as nms_opt
    return nms_opt(norm, ang)


def link_edges(img, low, high):
    h, w = img.shape
    strong = img >= high
    weak = (img >= low) & (img < high)
    if HAS_NUMBA:
        return hysteresis_jit(strong, weak, h, w)
    from app.modules.phase2_classical.edge.edge_optimized import link_edges_stack
    return link_edges_stack(img, low, high)


def i_sobel(img, threshold=80):
    gray = to_gray(img)
    _, _, norm, _ = sobel(gray)
    return bi(positive_to_uint8(norm), threshold)


def i_canny(img, low=50, high=150):
    gray = to_gray(img)
    blur = gauss_blur(gray)
    _, _, mag, ang = sobel(blur)
    sup = nms(mag, ang)
    return link_edges(sup, low, high)
