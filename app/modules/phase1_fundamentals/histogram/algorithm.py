"""Histogram computation and equalization. Pure NumPy."""
import numpy as np


def compute_histogram(gray_img, bins=256):
    """Count pixels at each brightness level [0, 255]."""
    arr = np.asarray(gray_img, dtype=np.uint8).ravel()
    hist = np.bincount(arr, minlength=bins).astype(np.float64)
    return hist


def compute_rgb_histograms(img):
    """Compute per-channel histograms for R, G, B."""
    arr = np.asarray(img, dtype=np.uint8)
    hists = []
    for c in range(3):
        hists.append(compute_histogram(arr[:, :, c]))
    return hists


def histogram_equalization(gray_img):
    """
    Equalize histogram to spread brightness uniformly.
    Uses the CDF (Cumulative Distribution Function) as the mapping function.
    Formula: new_pixel = round(CDF_normalized(old_pixel) * 255)
    """
    arr = np.asarray(gray_img, dtype=np.uint8)
    mapping = histogram_equalization_mapping(arr)
    return mapping[arr]


def histogram_equalization_mapping(gray_img):
    """Return the 0-255 lookup table used by global histogram equalization."""
    arr = np.asarray(gray_img, dtype=np.uint8)
    hist = compute_histogram(arr)
    cdf = np.cumsum(hist)
    nonzero = cdf[cdf > 0]
    if arr.size == 0 or nonzero.size == 0:
        return np.arange(256, dtype=np.uint8)

    cdf_min = float(nonzero.min())
    denom = float(arr.size) - cdf_min
    if denom <= 0:
        # Constant images have no dynamic range to stretch safely.
        return np.arange(256, dtype=np.uint8)

    mapping = np.round((cdf - cdf_min) / denom * 255.0)
    return np.clip(mapping, 0, 255).astype(np.uint8)
