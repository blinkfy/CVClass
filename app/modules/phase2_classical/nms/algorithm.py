"""Non-Maximum Suppression — uses old CV proven edge_optimized.nms."""
import numpy as np
from imageio.v3 import imread
from app.modules.phase2_classical.edge.edge_optimized import sobel, nms, gauss_blur
from app.modules.phase2_classical.edge.edge import to_gray
import io, base64
from PIL import Image
def _b64(arr):
    buf=io.BytesIO();Image.fromarray(np.clip(arr,0,255).astype(np.uint8)).save(buf,'PNG')
    return base64.b64encode(buf.getvalue()).decode()
def build_pipeline(upload_path):
    img=imread(upload_path)
    if img.ndim==3 and img.shape[2]==4:img=img[:,:,:3]
    gray=to_gray(img);blurred=gauss_blur(gray)
    _,_,mag,ang=sobel(blurred)
    mag_norm=((mag/mag.max())*255).clip(0,255).astype(np.uint8) if mag.max()>0 else mag.astype(np.uint8)
    suppressed=nms(mag,ang)
    sup_norm=((suppressed/suppressed.max())*255).clip(0,255).astype(np.uint8) if suppressed.max()>0 else suppressed.astype(np.uint8)
    return {'steps':[
        {'id':'original','name':'原始图像','image_base64':_b64(img)},
        {'id':'gaussian','name':'高斯模糊','image':np.clip(blurred,0,255).astype(np.uint8)},
        {'id':'gradient','name':'梯度幅值(抑制前)','image':mag_norm},
        {'id':'nms','name':'NMS抑制后','image':sup_norm},
    ]}
