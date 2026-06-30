"""Demo processor for Hough 变换."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
from app.modules.phase2_classical.hough.algorithm import hough_line_transform, find_line_peaks
from app.modules.phase2_classical.edge.algorithm import canny_detect


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=768) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    gray = ensure_gray(img_u8)
    edges=canny_detect(gray,60,140)
    acc,thetas,rhos=hough_line_transform(edges)
    lines=find_line_peaks(acc,thetas,rhos,threshold_ratio=0.5,max_lines=20)
    h,w=gray.shape; vis=np.zeros((h,w,3),dtype=np.uint8)
    vis[:]=np.array([15,23,42],dtype=np.uint8)
    for l in lines[:30]:
        rho,theta=l["rho"],l["theta"]
        for t in np.linspace(0,max(h,w),max(h,w)*2):
            x=int(rho*np.cos(theta)-t*np.sin(theta)); y=int(rho*np.sin(theta)+t*np.cos(theta))
            if 0<=x<w and 0<=y<h: vis[y,x]=[34,197,94]
    acc_vis=_to_uint8_heat(acc)
    steps=[{"id":"original","name":"原图","image":img_u8,"explanation":"输入图像"},
           {"id":"gray","name":"灰度图","image":gray,"explanation":"转为灰度图"},
           {"id":"edges","name":"边缘检测","image":edges,"explanation":"Canny边缘检测提取边缘像素"},
           {"id":"accumulator","name":"霍夫累加器","image":acc_vis,"explanation":"每个亮点=检测到一条直线,亮度=该直线的投票数"},
           {"id":"lines","name":"检测到的直线","image":vis,"explanation":"绿色线=检测到的直线,共"+str(len(lines))+"条"}]
    return {"steps":steps,"metrics":{"lines_detected":len(lines),"hough_peaks":len(lines)}}
