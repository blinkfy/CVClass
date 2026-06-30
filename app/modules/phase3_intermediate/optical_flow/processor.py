"""Demo processor for 光流."""
import numpy as np
from app.utils.image_utils import load_image_u8, ensure_gray
from app.modules.phase3_intermediate.optical_flow.algorithm import lucas_kanade_flow,flow_to_color
from app.modules.phase2_classical.corner.algorithm import harris_pipeline


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=512) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    gray=ensure_gray(img_u8)
    shift_x=int(max(-8,min(8,kwargs.get("shift_x",2))))
    shift_y=int(max(-8,min(8,kwargs.get("shift_y",1))))
    window_size=int(max(7,min(31,kwargs.get("window_size",15))))
    if window_size % 2 == 0: window_size += 1
    # Simulate frame2 by shifting image slightly
    h,w=gray.shape; frame2=np.roll(gray,shift_x,axis=1); frame2=np.roll(frame2,shift_y,axis=0)
    # Get feature points using Harris
    data=harris_pipeline(img_u8,max_points=100)
    pts=[(p["x"],p["y"]) for p in data["points"][:60]]
    flows=lucas_kanade_flow(gray.astype(np.float64),frame2.astype(np.float64),pts,window_size=window_size)
    colors=flow_to_color(flows)
    # Build flow visualization
    flow_vis=np.zeros((h,w,3),dtype=np.uint8); flow_vis[:]=np.array([15,23,42],dtype=np.uint8)
    for i,(px,py) in enumerate(pts):
        x,y=int(px),int(py)
        if 0<=x<w and 0<=y<h:
            u,v=flows[i]; col=colors[i]
            x2=int(x+u*3); y2=int(y+v*3)
            n=max(abs(x2-x),abs(y2-y),1)
            for t in np.linspace(0,1,n):
                xx=int(x+(x2-x)*t); yy=int(y+(y2-y)*t)
                if 0<=xx<w and 0<=yy<h: flow_vis[yy,xx]=col
    steps=[{"id":"frame1","name":"第t帧","image":gray,"explanation":"参考帧"},
           {"id":"frame2","name":"第t+1帧","image":frame2,"explanation":"下一帧(模拟位移)"},
           {"id":"flow","name":"光流可视化","image":flow_vis,"explanation":"颜色=运动方向,饱和度=速度,共"+str(len(pts))+"个跟踪点"}]
    return {"steps":steps,"metrics":{"tracked_points":len(pts),"window_size":window_size,"shift_x":shift_x,"shift_y":shift_y}}
