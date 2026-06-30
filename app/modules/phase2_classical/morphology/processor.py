"""Demo processor for 形态学操作."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
from app.modules.phase2_classical.morphology.algorithm import erode,dilate,opening,closing,morphological_gradient
from app.modules.phase1_fundamentals.threshold.algorithm import otsu_threshold,global_threshold


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=1024) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    gray=ensure_gray(img_u8)
    t=otsu_threshold(gray); binary=global_threshold(gray,t)
    er=erode(binary); di=dilate(binary); op=opening(binary); cl=closing(binary); grad=morphological_gradient(binary)
    steps=[{"id":"original","name":"原图","image":img_u8,"explanation":"输入图像"},
           {"id":"binary","name":"二值化","image":binary,"explanation":"Otsu阈值="+str(t)},
           {"id":"erode","name":"腐蚀","image":er,"explanation":"白色区域收缩,小噪点消失"},
           {"id":"dilate","name":"膨胀","image":di,"explanation":"白色区域扩张,小孔洞被填充"},
           {"id":"opening","name":"开运算","image":op,"explanation":"先腐蚀后膨胀:去噪点"},
           {"id":"closing","name":"闭运算","image":cl,"explanation":"先膨胀后腐蚀:填孔洞"},
           {"id":"gradient","name":"形态学梯度","image":grad,"explanation":"膨胀-腐蚀=物体边界"}]
    return {"steps":steps,"metrics":{"otsu_threshold":int(t),"fg_pct":round(float(binary.sum()/255/binary.size)*100,1)}}
