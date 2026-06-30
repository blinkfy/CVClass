"""Demo processor for SLIC 超像素."""
import numpy as np
from app.utils.image_utils import load_image_u8
from app.modules.phase3_intermediate.slic.algorithm import slic_superpixels


def _to_uint8_heat(arr):
    """Float array -> uint8 heatmap."""
    arr=np.asarray(arr,dtype=np.float64)
    m=arr.max() if arr.size else 1.0
    if m<=1e-12: return np.zeros(arr.shape,dtype=np.uint8)
    return np.clip(arr/m*255,0,255).astype(np.uint8)


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=1024) if image_path else np.zeros((64,64,3), dtype=np.uint8)
    h0,w0=img_u8.shape[:2]; scale=min(1.0,200.0/max(h0,w0))
    if scale<1.0:
        nh,nw=max(1,int(h0*scale)),max(1,int(w0*scale))
        ys=np.linspace(0,h0-1,nh).astype(np.int32); xs=np.linspace(0,w0-1,nw).astype(np.int32)
        small=img_u8[ys[:,None],xs[None,:]]
    else: small=img_u8
    n_sp=int(kwargs.get("num_superpixels",200)); comp=float(kwargs.get("compactness",10.0))
    labels,n_centers=slic_superpixels(small,num_superpixels=n_sp,compactness=comp,max_iter=5)
    h,w=small.shape[:2]; vis=small.copy()
    rng=np.random.default_rng(42); sp_colors=rng.integers(50,220,(n_centers,3),dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            if labels[y,x]>=0: vis[y,x]=(vis[y,x].astype(np.int32)//2+sp_colors[labels[y,x]]//2).astype(np.uint8)
    for y in range(2,h-2):
        for x in range(2,w-2):
            l=labels[y,x]
            if l>=0 and (labels[y-1,x]!=l or labels[y+1,x]!=l or labels[y,x-1]!=l or labels[y,x+1]!=l):
                vis[y,x]=[255,255,255]
    if scale<1.0:
        ys2=np.linspace(0,h-1,h0).astype(np.int32); xs2=np.linspace(0,w-1,w0).astype(np.int32)
        vis_full=vis[ys2[:,None],xs2[None,:]]
    else: vis_full=vis
    steps=[{"id":"original","name":"原图","image":img_u8,"explanation":"输入图像"},
           {"id":"superpixels","name":"超像素分割","image":vis_full,"explanation":"白色线=超像素边界,共"+str(n_centers)+"个超像素"}]
    return {"steps":steps,"metrics":{"superpixels":int(n_centers),"compactness":comp}}
