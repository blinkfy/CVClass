import math

import numpy as np

from app.modules.phase2_classical.edge.edge import gauss_k, sobel_x, sobel_y


def to_gray(img):
    img = np.asarray(img)
    if img.ndim == 2:
        return img.astype(np.uint8)
    h, w = img.shape[:2]
    out = np.zeros((h, w), dtype=np.uint8)
    for i in range(h):
        row = img[i]
        for j in range(w):
            r, g, b = int(row[j, 0]), int(row[j, 1]), int(row[j, 2])
            out[i, j] = int(round(0.299 * r + 0.587 * g + 0.114 * b))
    return out


def bi(img, threshold):
    arr = np.asarray(img, dtype=np.uint8)
    out = np.zeros_like(arr, dtype=np.uint8)
    out[arr >= threshold] = 255
    return out


def conv(mat, ker):
    ker = np.asarray(ker, dtype=np.float32)
    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    mat = np.asarray(mat, dtype=np.float32)
    h, w = mat.shape
    padded = np.pad(mat, ((ph, ph), (pw, pw)), mode="edge")
    res = np.zeros((h, w), dtype=np.float32)
    for i in range(h):
        for j in range(w):
            s = 0.0
            for ki in range(kh):
                row = padded[i + ki]
                krow = ker[ki]
                for kj in range(kw):
                    s += float(row[j + kj]) * float(krow[kj])
            res[i, j] = s
    return res


def positive_to_uint8(img):
    arr = np.asarray(img, dtype=np.float32)
    max_val = float(arr.max()) if arr.size else 0.0
    if max_val <= 1e-8:
        return np.zeros(arr.shape, dtype=np.uint8)
    return (arr / max_val * 255).clip(0, 255).astype(np.uint8)


def sobel(img):
    sx = conv(img, sobel_x)
    sy = conv(img, sobel_y)
    h, w = sx.shape
    mag = np.zeros((h, w), dtype=np.float32)
    ang = np.zeros((h, w), dtype=np.float32)
    for i in range(h):
        for j in range(w):
            mag[i, j] = math.sqrt(float(sx[i, j]) ** 2 + float(sy[i, j]) ** 2)
            ang[i, j] = math.degrees(math.atan2(float(sy[i, j]), float(sx[i, j])))
    return sx, sy, mag, ang


def nms(norm, ang):
    norm = np.asarray(norm, dtype=np.float32)
    ang = np.asarray(ang, dtype=np.float32)
    h, w = norm.shape
    out = np.zeros((h, w), dtype=np.float32)
    for i in range(1, h - 1):
        for j in range(1, w - 1):
            a = float(ang[i, j]) % 180.0
            val = float(norm[i, j])
            if a < 22.5 or a >= 157.5:
                n1 = float(norm[i, j - 1])
                n2 = float(norm[i, j + 1])
            elif a < 67.5:
                n1 = float(norm[i - 1, j + 1])
                n2 = float(norm[i + 1, j - 1])
            elif a < 112.5:
                n1 = float(norm[i - 1, j])
                n2 = float(norm[i + 1, j])
            else:
                n1 = float(norm[i - 1, j - 1])
                n2 = float(norm[i + 1, j + 1])
            if val >= n1 and val >= n2:
                out[i, j] = val
    return out


def link_edges(img, low, high):
    h, w = img.shape
    strong = img >= high
    weak = (img >= low) & (img < high)
    res = np.zeros((h, w), dtype=np.uint8)
    ys, xs = np.where(strong)
    stack = list(zip(ys, xs))
    dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    while stack:
        y, x = stack.pop()
        if res[y, x]:
            continue
        res[y, x] = 255
        for dy, dx in dirs:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not res[ny, nx]:
                if strong[ny, nx] or weak[ny, nx]:
                    stack.append((ny, nx))
    return res


def i_sobel(img, threshold=80):
    gray = to_gray(img)
    _, _, norm, _ = sobel(gray)
    return bi(positive_to_uint8(norm), threshold)


def i_canny(img, low=50, high=150):
    gray = to_gray(img)
    blur = conv(gray, gauss_k)
    _, _, mag, ang = sobel(blur)
    sup = nms(mag, ang)
    return link_edges(sup, low, high)
