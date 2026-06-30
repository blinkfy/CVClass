"""Gaussian blur — uses old CV proven edge_optimized.gauss_blur."""
import numpy as np
from imageio.v3 import imread
import io, base64
from PIL import Image
from app.modules.phase2_classical.edge.edge_optimized import gauss_blur
from app.modules.phase2_classical.edge.edge import to_gray
def _b64(arr):
    buf=io.BytesIO();Image.fromarray(np.clip(arr,0,255).astype(np.uint8)).save(buf,'PNG')
    return base64.b64encode(buf.getvalue()).decode()
def build_pipeline(upload_path):
    img=imread(upload_path)
    if img.ndim==3 and img.shape[2]==4:img=img[:,:,:3]
    gray=to_gray(img);blurred=gauss_blur(gray)
    return {'steps':[
        {'id':'original','name':'原始图像','image_base64':_b64(img)},
        {'id':'gray','name':'灰度图','image':gray},
        {'id':'gaussian','name':'高斯模糊 sigma=1.4','image':np.clip(blurred,0,255).astype(np.uint8)},
    ]}
