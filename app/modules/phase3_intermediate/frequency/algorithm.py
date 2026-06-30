"""Frequency domain analysis via FFT. Pure NumPy."""
import numpy as np


def compute_fft_spectrum(gray_img):
    """
    Compute 2D FFT magnitude spectrum.
    Shifts zero frequency to center for visualization.
    Log scale for better visibility of low-amplitude high frequencies.
    """
    arr = np.asarray(gray_img, dtype=np.float64)
    fft = np.fft.fft2(arr)
    fft_shifted = np.fft.fftshift(fft)
    magnitude = np.abs(fft_shifted)
    log_magnitude = np.log1p(magnitude)  # log(1+|F|) to compress dynamic range
    return fft_shifted, magnitude, log_magnitude


def apply_lowpass_filter(gray_img, cutoff_ratio=0.1):
    """
    Apply ideal low-pass filter in frequency domain.
    Keeps only low frequencies (smooth regions), removes high frequencies (edges/noise).
    cutoff_ratio: fraction of image diagonal to keep (0-1, smaller = more blur)
    """
    arr = np.asarray(gray_img, dtype=np.float64)
    h, w = arr.shape
    fft = np.fft.fft2(arr)
    fft_shifted = np.fft.fftshift(fft)

    # Create circular mask
    cy, cx = h // 2, w // 2
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((yy - cy)**2 + (xx - cx)**2)
    cutoff = max(h, w) * cutoff_ratio
    mask = (dist <= cutoff).astype(np.float64)

    filtered = fft_shifted * mask
    result = np.fft.ifft2(np.fft.ifftshift(filtered))
    return np.abs(result)


def apply_highpass_filter(gray_img, cutoff_ratio=0.02):
    """
    Apply ideal high-pass filter in frequency domain.
    Removes low frequencies (smooth regions), keeps high frequencies (edges).
    """
    arr = np.asarray(gray_img, dtype=np.float64)
    h, w = arr.shape
    fft = np.fft.fft2(arr)
    fft_shifted = np.fft.fftshift(fft)

    cy, cx = h // 2, w // 2
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((yy - cy)**2 + (xx - cx)**2)
    cutoff = max(h, w) * cutoff_ratio
    mask = (dist >= cutoff).astype(np.float64)

    filtered = fft_shifted * mask
    result = np.fft.ifft2(np.fft.ifftshift(filtered))
    return np.abs(result)


def compute_phase_spectrum(fft_shifted):
    """Compute phase spectrum from shifted FFT."""
    return np.angle(fft_shifted)
