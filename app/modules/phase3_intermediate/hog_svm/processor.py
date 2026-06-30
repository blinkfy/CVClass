"""Demo processor for HOG 特征."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
from app.modules.phase3_intermediate.hog_svm.algorithm import extract_hog_features,visualize_hog_cells


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=512) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    cell_size=int(max(4,min(16,kwargs.get("cell_size",8))))
    num_bins=int(max(6,min(12,kwargs.get("num_bins",9))))
    gray=ensure_gray(img_u8)
    features,cell_hists,(mag,ang)=extract_hog_features(gray.astype(np.float64),cell_size=cell_size,block_size=2,num_bins=num_bins)
    hog_vis=visualize_hog_cells(gray,cell_hists,cell_size=cell_size)
    mag_vis=np.clip(mag/mag.max()*255,0,255).astype(np.uint8) if mag.max()>0 else np.zeros_like(gray,dtype=np.uint8)
    steps=[{"id":"original","name":"原图","image":img_u8,"explanation":"输入图像"},
           {"id":"gradient","name":"梯度幅值","image":mag_vis,"explanation":"每个像素的边缘强度"},
           {"id":"hog","name":"HOG 特征可视化","image":hog_vis,"explanation":"每个8×8 cell:线段=梯度主方向,长度=该方向强度。共"+str(len(features))+"维特征"}]
    return {"steps":steps,"metrics":{"feature_dim":int(len(features)),"cell_size":cell_size,"num_bins":num_bins,"num_cells":f"{cell_hists.shape[0]}x{cell_hists.shape[1]}"}}
