"""
Grayscale conversion algorithms.
Pure NumPy: RGB-to-gray with multiple weighting schemes.
"""
import numpy as np


def to_uint8(arr):
    """Convert any image array safely to uint8 [0,255]."""
    arr = np.asarray(arr)
    if arr.dtype.kind == 'f':
        if arr.size and float(arr.max()) <= 1.0:
            arr = arr * 255.0
        return np.round(arr).clip(0, 255).astype(np.uint8)
    return arr.clip(0, 255).astype(np.uint8)


def weighted_average(img):
    """Weighted avg (ITU-R BT.601): Gray = 0.299*R + 0.587*G + 0.114*B."""
    arr = to_uint8(img)
    if arr.ndim == 2:
        return arr
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    return np.round(r * 0.299 + g * 0.587 + b * 0.114).clip(0, 255).astype(np.uint8)


def arithmetic_average(img):
    """Arithmetic mean: (R+G+B)/3. Simple but perceptually inaccurate."""
    arr = to_uint8(img)
    if arr.ndim == 2:
        return arr
    return np.round(np.mean(arr[:, :, :3], axis=2)).clip(0, 255).astype(np.uint8)


def max_channel(img):
    """Max of R,G,B. Fast but loses shadow detail."""
    arr = to_uint8(img)
    if arr.ndim == 2:
        return arr
    return np.max(arr[:, :, :3], axis=2).clip(0, 255).astype(np.uint8)


def min_channel(img):
    """Min of R,G,B. Useful for dehazing."""
    arr = to_uint8(img)
    if arr.ndim == 2:
        return arr
    return np.min(arr[:, :, :3], axis=2).clip(0, 255).astype(np.uint8)


def single_channel(img, channel='r'):
    """Extract single channel: R, G, or B."""
    arr = to_uint8(img)
    if arr.ndim == 2:
        return arr
    idx = {'r': 0, 'g': 1, 'b': 2}[channel]
    return arr[:, :, idx]


METHODS = {
    'weighted':   ('Weighted Average (ITU-R BT.601)', weighted_average),
    'arithmetic': ('Arithmetic Average', arithmetic_average),
    'max':        ('Max Channel', max_channel),
    'min':        ('Min Channel', min_channel),
    'r':          ('Red Channel Only', lambda img: single_channel(img, 'r')),
    'g':          ('Green Channel Only', lambda img: single_channel(img, 'g')),
    'b':          ('Blue Channel Only', lambda img: single_channel(img, 'b')),
}
