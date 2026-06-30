
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from imageio.v3 import imread
import io, base64
from PIL import Image
from app.modules.phase1_fundamentals.noise.algorithm import add_salt_pepper

def median_filter(img, size=3):
    """Vectorized median filter using sliding_window_view."""
    pad = size // 2
    if img.ndim == 3:
        out = np.zeros_like(img)
        for c in range(3):
            p = np.pad(img[:, :, c], pad, mode='edge')
            windows = sliding_window_view(p, (size, size))
            out[:, :, c] = np.median(windows, axis=(2, 3))
        return out.astype(np.uint8)
    p = np.pad(img, pad, mode='edge')
    windows = sliding_window_view(p, (size, size))
    return np.median(windows, axis=(2, 3)).astype(np.uint8)
def _b64(arr):b=io.BytesIO();Image.fromarray(arr).save(b,'PNG');return base64.b64encode(b.getvalue()).decode()
def build_pipeline(upload_path):
    img=imread(upload_path)
    if img.ndim==3 and img.shape[2]==4:img=img[:,:,:3]
    noisy=add_salt_pepper(img,.05)
    m3=median_filter(noisy,3);m5=median_filter(noisy,5)
    return {'steps':[{'id':'original','name':'原始图像','image_base64':_b64(img)},{'id':'noisy','name':'椒盐噪声 (5%)','image_base64':_b64(noisy)},{'id':'median3','name':'中值滤波 (3x3)','image_base64':_b64(m3)},{'id':'median5','name':'中值滤波 (5x5)','image_base64':_b64(m5)}]}
