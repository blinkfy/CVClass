"""Demo processor for 立体匹配."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
from app.modules.phase3_intermediate.stereo.algorithm import block_matching_disparity,disparity_to_color


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=320) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    gray=ensure_gray(img_u8)
    max_disparity=int(max(8,min(64,kwargs.get("max_disparity",32))))
    block_size=int(max(5,min(15,kwargs.get("block_size",7))))
    if block_size % 2 == 0: block_size += 1
    # Simulate right image by shifting left slightly (creates synthetic disparity)
    h,w=gray.shape; shift=max(1,min(max_disparity//2,int(w*0.02)))
    right_img=np.roll(gray,shift,axis=1)
    right_img[:,:shift]=right_img[:,shift:shift*2]
    disp=block_matching_disparity(gray,right_img,block_size=block_size,max_disparity=max_disparity)
    disp_color=disparity_to_color(disp)
    valid_disp = disp[disp>0]
    mean_disp = round(float(valid_disp.mean()),2) if valid_disp.size else 0.0
    steps=[{"id":"left","name":"左视图","image":gray,"explanation":"左相机图像"},
           {"id":"right","name":"右视图","image":right_img,"explanation":"右相机图像(模拟视差)"},
           {"id":"disparity","name":"视差图","image":disp_color,"explanation":"红=近(大视差),蓝=远(小视差)"}]
    return {"steps":steps,"metrics":{"max_disparity":float(disp.max()),"mean_disparity":mean_disp,"search_max_disparity":max_disparity,"block_size":block_size,"synthetic_shift":shift}}
