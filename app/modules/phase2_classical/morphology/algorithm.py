"""Morphological operations. Pure NumPy: erosion, dilation, opening, closing."""
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def _structuring_element(shape='rect', size=3):
    """Generate a structuring element (kernel of 1s)."""
    if shape == 'cross':
        c = size // 2
        se = np.zeros((size, size), dtype=np.uint8)
        se[c, :] = 1
        se[:, c] = 1
        return se
    return np.ones((size, size), dtype=np.uint8)


def erode(binary_img, se_shape='rect', se_size=3, iterations=1):
    """
    Erosion: shrink white regions.
    For each pixel: output=1 only if ALL pixels under the structuring element are 1.
    Removes small white noise, separates touching objects.
    """
    img = np.asarray(binary_img, dtype=np.uint8)
    img = np.where(img > 127, 1, 0).astype(np.uint8)
    se = _structuring_element(se_shape, se_size)
    pad = se.shape[0] // 2
    result = img.copy()

    for _ in range(iterations):
        padded = np.pad(result, pad, mode='edge')
        windows = sliding_window_view(padded, se.shape)
        result = ((windows * se).sum(axis=(2, 3)) == se.sum()).astype(np.uint8)

    return (result * 255).astype(np.uint8)


def dilate(binary_img, se_shape='rect', se_size=3, iterations=1):
    """
    Dilation: expand white regions.
    For each pixel: output=1 if ANY pixel under the structuring element is 1.
    Fills small holes, connects nearby objects.
    """
    img = np.asarray(binary_img, dtype=np.uint8)
    img = np.where(img > 127, 1, 0).astype(np.uint8)
    se = _structuring_element(se_shape, se_size)
    pad = se.shape[0] // 2
    result = img.copy()

    for _ in range(iterations):
        padded = np.pad(result, pad, mode='constant', constant_values=0)
        windows = sliding_window_view(padded, se.shape)
        result = ((windows * se).sum(axis=(2, 3)) > 0).astype(np.uint8)

    return (result * 255).astype(np.uint8)


def opening(binary_img, se_shape='rect', se_size=3):
    """Opening = Erosion then Dilation. Removes small noise dots."""
    eroded = erode(binary_img, se_shape, se_size)
    return dilate(eroded, se_shape, se_size)


def closing(binary_img, se_shape='rect', se_size=3):
    """Closing = Dilation then Erosion. Fills small holes."""
    dilated = dilate(binary_img, se_shape, se_size)
    return erode(dilated, se_shape, se_size)


def morphological_gradient(binary_img, se_shape='rect', se_size=3):
    """Gradient = Dilation - Erosion. Highlights object boundaries."""
    d = dilate(binary_img, se_shape, se_size).astype(np.int32)
    e = erode(binary_img, se_shape, se_size).astype(np.int32)
    return np.clip(d - e, 0, 255).astype(np.uint8)
