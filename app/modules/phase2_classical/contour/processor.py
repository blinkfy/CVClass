"""Demo processor for 轮廓查找."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
from app.modules.phase2_classical.contour.algorithm import find_contours,contour_area,approximate_contour
from app.modules.phase1_fundamentals.threshold.algorithm import otsu_threshold,global_threshold


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=768) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    gray=ensure_gray(img_u8)
    t=otsu_threshold(gray); binary=global_threshold(gray,t)
    contours=find_contours(binary,min_area=30)
    colors=[(239,68,68),(34,197,94),(59,130,246),(168,85,247),(251,191,36),(244,114,182)]
    h,w=binary.shape; vis=np.zeros((h,w,3),dtype=np.uint8); vis[:]=np.array([15,23,42],dtype=np.uint8)
    for i,c in enumerate(contours[:20]):
        col=colors[i%len(colors)]
        for x,y in c:
            if 0<=x<w and 0<=y<h: vis[y,x]=col
    approx_vis=np.zeros((h,w,3),dtype=np.uint8); approx_vis[:]=np.array([15,23,42],dtype=np.uint8)
    for i,c in enumerate(contours[:20]):
        col=colors[i%len(colors)]; ac=approximate_contour(c,epsilon=0.02)
        for x,y in ac:
            if 0<=x<w and 0<=y<h: approx_vis[y,x]=col
    steps=[{"id":"original","name":"原图","image":img_u8,"explanation":"输入图像"},
           {"id":"binary","name":"二值化","image":binary,"explanation":"阈值="+str(t)},
           {"id":"contours","name":"轮廓","image":vis,"explanation":"检测到"+str(len(contours))+"个轮廓"},
           {"id":"approx","name":"轮廓近似","image":approx_vis,"explanation":"Douglas-Peucker简化后的轮廓"}]
    return {"steps":steps,"metrics":{"contours":len(contours),"total_area":round(sum(contour_area(c) for c in contours),1)}}
