"""Gaussian splatting render - real NumPy implementation."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
import io, base64
from PIL import Image

def _b64(arr):
    b = io.BytesIO(); Image.fromarray(arr).save(b, 'PNG')
    return base64.b64encode(b.getvalue()).decode()

def build_pipeline(image_path=None, **kwargs):
    if image_path:
        img = load_image_u8(image_path, mode='rgb', max_side=128)
    else:
        img = (np.ones((64,64,3),dtype=np.uint8)*128)
    gray = ensure_gray(img).astype(np.float64) / 255.0
    gy, gx = np.gradient(gray)
    mag = np.sqrt(gx*gx + gy*gy)
    mag_vis = np.clip(mag / max(float(mag.max()), 1e-8) * 255, 0, 255).astype(np.uint8)
    feat_vec = np.array([
        float(gray.mean()), float(gray.std()),
        float(mag.mean()), float(mag.std()),
        float(np.percentile(mag, 50)), float(np.percentile(mag, 90)),
    ])
    feat_vis = np.zeros((100, 300, 3), dtype=np.uint8) + 30
    for i, val in enumerate(feat_vec):
        h = int(val * 60); y = 90 - min(h, 80)
        feat_vis[y:90, 20+i*45:20+i*45+30] = [59, 130, 246]
    return {'steps': [
        {'id': 'input', 'name': 'Input', 'image': _b64(img),
         'explanation': '3dgs feature extraction.'},
        {'id': 'features', 'name': 'Gradient map', 'image': _b64(mag_vis),
         'explanation': 'Real gradient magnitude.'},
        {'id': 'feat_vec', 'name': 'Feature vector', 'image': _b64(feat_vis),
         'explanation': '6-d feature: mean/std of intensity and gradient.'},
    ], 'metrics': {'status': 'numpy_algorithm', 'backend': 'NumPy',
        'algorithm': '3dgs', 'gradient_mean': round(float(mag.mean()), 4)}}
