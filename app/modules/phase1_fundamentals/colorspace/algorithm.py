"""Local color space conversion and channel visualization."""
import numpy as np


def rgb_to_hsv(rgb):
    """Convert uint8 RGB image to HSV with H in degrees, S/V in [0, 1]."""
    arr = rgb.astype(np.float64) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    cmax = np.max(arr, axis=-1)
    cmin = np.min(arr, axis=-1)
    delta = cmax - cmin

    hue = np.zeros_like(cmax)
    mask = delta > 1e-12
    rmax = mask & (cmax == r)
    gmax = mask & (cmax == g)
    bmax = mask & (cmax == b)
    hue[rmax] = (60.0 * ((g[rmax] - b[rmax]) / delta[rmax]) + 360.0) % 360.0
    hue[gmax] = 60.0 * ((b[gmax] - r[gmax]) / delta[gmax] + 2.0)
    hue[bmax] = 60.0 * ((r[bmax] - g[bmax]) / delta[bmax] + 4.0)

    sat = np.zeros_like(cmax)
    sat[cmax > 1e-12] = delta[cmax > 1e-12] / cmax[cmax > 1e-12]
    val = cmax
    return np.stack([hue, sat, val], axis=-1)


def hsv_to_rgb(hsv):
    """Convert HSV image with H in degrees, S/V in [0, 1] to uint8 RGB."""
    h = (hsv[..., 0] % 360.0) / 60.0
    s = np.clip(hsv[..., 1], 0.0, 1.0)
    v = np.clip(hsv[..., 2], 0.0, 1.0)
    c = v * s
    x = c * (1.0 - np.abs((h % 2.0) - 1.0))
    m = v - c

    z = np.zeros_like(h)
    rp, gp, bp = z.copy(), z.copy(), z.copy()
    masks = [
        (0 <= h) & (h < 1),
        (1 <= h) & (h < 2),
        (2 <= h) & (h < 3),
        (3 <= h) & (h < 4),
        (4 <= h) & (h < 5),
        (5 <= h) & (h < 6),
    ]
    values = [(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]
    for mask, (rv, gv, bv) in zip(masks, values):
        rp[mask], gp[mask], bp[mask] = rv[mask], gv[mask], bv[mask]

    out = np.stack([rp + m, gp + m, bp + m], axis=-1)
    return np.round(out * 255.0).clip(0, 255).astype(np.uint8)


def rgb_to_lab(rgb):
    """Convert uint8 RGB image to CIE Lab using D65 white point."""
    srgb = rgb.astype(np.float64) / 255.0
    linear = np.where(
        srgb > 0.04045,
        ((srgb + 0.055) / 1.055) ** 2.4,
        srgb / 12.92,
    )
    matrix = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    xyz = linear @ matrix.T
    white = np.array([0.95047, 1.0, 1.08883])
    xyz_n = xyz / white

    eps = 216.0 / 24389.0
    kappa = 24389.0 / 27.0
    f = np.where(xyz_n > eps, np.cbrt(xyz_n), (kappa * xyz_n + 16.0) / 116.0)
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    l = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([l, a, b], axis=-1)


def rgb_to_cmyk(rgb):
    """Convert uint8 RGB image to CMYK in [0, 1], with safe pure-black handling."""
    arr = rgb.astype(np.float64) / 255.0
    k = 1.0 - np.max(arr, axis=-1)
    denom = np.maximum(1.0 - k, 1e-12)
    c = (1.0 - arr[..., 0] - k) / denom
    m = (1.0 - arr[..., 1] - k) / denom
    y = (1.0 - arr[..., 2] - k) / denom
    pure_black = k >= 1.0 - 1e-12
    c[pure_black] = 0.0
    m[pure_black] = 0.0
    y[pure_black] = 0.0
    return np.stack([c, m, y, k], axis=-1).clip(0.0, 1.0)


def rgb_channel_visual(rgb, index):
    out = np.zeros_like(rgb)
    out[..., index] = rgb[..., index]
    return out


def grayscale_visual(values, vmin, vmax):
    denom = max(float(vmax - vmin), 1e-12)
    gray = np.round((np.asarray(values) - vmin) / denom * 255.0).clip(0, 255).astype(np.uint8)
    return np.repeat(gray[..., None], 3, axis=2)


def diverging_visual(values, low_color, high_color, vmin=-128.0, vmax=127.0):
    values = np.asarray(values, dtype=np.float64)
    t = ((values - vmin) / max(vmax - vmin, 1e-12)).clip(0.0, 1.0)
    neutral = np.array([246, 248, 250], dtype=np.float64)
    low = np.array(low_color, dtype=np.float64)
    high = np.array(high_color, dtype=np.float64)
    out = np.empty(values.shape + (3,), dtype=np.float64)
    left = t < 0.5
    alpha_low = (t[left] / 0.5)[..., None]
    alpha_high = ((t[~left] - 0.5) / 0.5)[..., None]
    out[left] = low * (1.0 - alpha_low) + neutral * alpha_low
    out[~left] = neutral * (1.0 - alpha_high) + high * alpha_high
    return np.round(out).clip(0, 255).astype(np.uint8)


def ink_visual(coverage, ink_color):
    coverage = np.asarray(coverage, dtype=np.float64).clip(0.0, 1.0)
    white = np.full(coverage.shape + (3,), 255.0, dtype=np.float64)
    ink = np.array(ink_color, dtype=np.float64)
    out = white * (1.0 - coverage[..., None]) + ink * coverage[..., None]
    return np.round(out).clip(0, 255).astype(np.uint8)
