
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from imageio.v3 import imread
import io, base64
from PIL import Image

def bilateral_filter(img, d=5, sigma_color=50, sigma_space=10):
    """Vectorized bilateral filter using sliding_window_view."""
    img_f = img.astype(np.float64)
    half = d // 2
    # Spatial kernel (same for all channels)
    ax = np.arange(-half, half + 1, dtype=np.float64)
    xx, yy = np.meshgrid(ax, ax)
    sk = np.exp(-(xx**2 + yy**2) / (2 * sigma_space**2))

    is_color = img.ndim == 3
    src = img_f if is_color else img_f[:, :, None]
    if not is_color:
        src = src[:, :, None]
    h, w = src.shape[:2]
    ch = src.shape[2]

    # Pad and get sliding windows: shape (H, W, d, d, C)
    pad_src = np.pad(src, ((half, half), (half, half), (0, 0)), mode='edge')
    windows = sliding_window_view(pad_src, (d, d, ch))  # (H, W, d, d, C)
    windows = windows[:, :, 0, :, :, :]  # Remove extra dim: (H, W, d, d, C)

    # Center pixels: (H, W, 1, 1, C)
    center = src[None, :, :, :].transpose(1, 2, 0, 3)
    center = src.reshape(h, w, 1, 1, ch)

    # Color kernel: exp(-||patch - center||^2 / 2*sigma_color^2)
    diff = windows - center  # (H, W, d, d, C)
    diff_sq = np.sum(diff**2, axis=-1)  # (H, W, d, d)
    rk = np.exp(-diff_sq / (2 * sigma_color**2))  # (H, W, d, d)

    # Combined weight
    wgt = sk.reshape(1, 1, d, d) * rk  # (H, W, d, d)

    # Apply weights
    wgt_sum = wgt.sum(axis=(2, 3), keepdims=True)  # (H, W, 1, 1)
    numerator = np.sum(windows * wgt[:, :, :, :, None], axis=(2, 3))  # (H, W, C)
    denominator = wgt_sum[:, :, 0, 0, None]  # (H, W, 1)
    out = numerator / np.maximum(denominator, 1e-10)

    if not is_color:
        out = out[:, :, 0]
    return np.clip(out, 0, 255).astype(np.uint8)
def _b64(arr):b=io.BytesIO();Image.fromarray(arr).save(b,'PNG');return base64.b64encode(b.getvalue()).decode()
def build_pipeline(upload_path):
    img=imread(upload_path)
    if img.ndim==3 and img.shape[2]==4:img=img[:,:,:3]
    bf=bilateral_filter(img)
    return {'steps':[{'id':'original','name':'原始图像','image_base64':_b64(img)},{'id':'bilateral','name':'双边滤波 (d=5, color=50, space=10)','image_base64':_b64(bf)}]}
