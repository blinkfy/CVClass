import numpy as np

from app.modules.phase1_fundamentals.threshold.algorithm import otsu_threshold, adaptive_mean_threshold
from app.modules.phase1_fundamentals.convolution.algorithm import bilateral_filter
from app.modules.phase3_intermediate.watershed.algorithm import watershed_segmentation


def test_otsu_threshold_separates_bimodal_image():
    left = np.zeros((8, 8), dtype=np.uint8)
    right = np.full((8, 8), 220, dtype=np.uint8)
    img = np.hstack([left, right])
    t = otsu_threshold(img)
    assert 0 <= t <= 220
    assert t != 0


def test_adaptive_threshold_returns_binary_image():
    img = np.arange(25, dtype=np.uint8).reshape(5, 5)
    out = adaptive_mean_threshold(img, 3, 1)
    assert out.shape == img.shape
    assert set(np.unique(out)).issubset({0, 255})


def test_bilateral_filter_handles_grayscale():
    img = np.arange(49, dtype=np.uint8).reshape(7, 7)
    out = bilateral_filter(img, d=3, sigma_color=10, sigma_space=5)
    assert out.shape == img.shape


def test_watershed_prefers_low_gradient_regions_first():
    grad = np.array([
        [9, 9, 9, 9],
        [9, 1, 2, 9],
        [9, 2, 1, 9],
        [9, 9, 9, 9],
    ], dtype=np.float64)
    markers = np.zeros((4, 4), dtype=np.int32)
    markers[1, 1] = 1
    markers[2, 2] = 2
    labels = watershed_segmentation(grad, markers)
    assert labels[1, 1] == 1
    assert labels[2, 2] == 2
