from pathlib import Path
import json
import heapq
import numpy as np
from PIL import Image

def duqu(p,ms):
    with Image.open(p) as im:
        im=im.convert("RGB")
        W,H=im.size
        sc=1.0
        if max(W,H)>ms:
            sc=min(1.0,ms/max(W,H))
        if sc<1.0:
            w=max(1,round(W*sc))
            h=max(1,round(H*sc))
            im=im.resize((w,h),Image.Resampling.BILINEAR)
        a=np.asarray(im,dtype=np.float32)/255.0
    return a,(W,H)

def huise(a):
    return 0.299*a[:,:,0]+0.587*a[:,:,1]+0.114*a[:,:,2]

def bianyuan(g):
    gx,gy=np.gradient(g)
    return np.sqrt(gx*gx+gy*gy)

def caihong(k):
    tab=np.array([
        [255,99,71],
        [60,179,113],
        [30,144,255],
        [255,215,0],
        [238,130,238],
        [0,206,209],
        [255,140,0],
        [106,90,205],
    ],dtype=np.uint8)
    if k<=len(tab):
        return tab[:k]
    rng=np.random.default_rng(k)
    return (rng.random((k,3))*255).astype(np.uint8)

def moren(H,W):
    #中心当FG，四角当BG
    fg=[(W//2,H//2)]
    bg=[(0,0),(W-1,0),(0,H-1),(W-1,H-1)]
    return fg,bg

def shuiyan(p,fg=None,bg=None,ms=320,save=None):
    a,orig=duqu(p,ms)
    H,W,C=a.shape
    g=bianyuan(huise(a))
    mx=g.max()
    if mx>0:
        g/=mx
    #from scipy.ndimage import label
    #bd=g>0.3
    #lb,_=label(~bd)
    if fg is None or bg is None:
        fg,bg=moren(H,W)

    lb=np.zeros((H,W),dtype=np.int32)
    for x,y in fg:
        if 0<=x<W and 0<=y<H:
            lb[y,x]=1
    for x,y in bg:
        if 0<=x<W and 0<=y<H:
            lb[y,x]=2

    hq=[]
    for y in range(H):
        for x in range(W):
            if lb[y,x]!=0:
                heapq.heappush(hq,(float(g[y,x]),x,y,lb[y,x]))
    #print(f"初始种子 {len(hq)} 个")

    fx=[-1,1,0,0,-1,-1,1,1]
    fy=[0,0,-1,1,-1,1,-1,1]
    while hq:
        v,x,y,l=heapq.heappop(hq)
        for i in range(8):
            nx=x+fx[i]
            ny=y+fy[i]
            if 0<=nx<W and 0<=ny<H and lb[ny,nx]==0:
                lb[ny,nx]=l
                heapq.heappush(hq,(float(g[ny,nx]),nx,ny,l))
    #边界
    gx,gy=np.gradient(lb.astype(np.float32))
    bd=(np.abs(gx)+np.abs(gy))>0
    cols=caihong(lb.max()+1)
    clr=cols[lb]
    ovr=np.uint8(a*255)
    mix=np.uint8(ovr*0.55+clr*0.45)

    out={
        "shape":[H,W],
        "orig_size":orig,
        "markers":{"fg":fg,"bg":bg},
        "max_label":int(lb.max()),
        "counts":np.bincount(lb.ravel(),minlength=3).tolist()[1:],
    }

    if save:
        sd=Path(save)
        sd.mkdir(parents=True,exist_ok=True)
        Image.fromarray(clr,mode="RGB").save(sd/"watershed_labels.png")
        Image.fromarray(np.uint8(bd*255),mode="L").save(sd/"watershed_boundary.png")
        Image.fromarray(mix,mode="RGB").save(sd/"watershed_overlay.png")
        (sd/"watershed_meta.json").write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")
        #print(sd)
    return lb,bd,a,out

rt=Path(r"F:\projects\CVClass")
sp=rt/"static"/"assets"/"img"/"flowers17"/"daffodil_01.jpg"
lb,bd,a,info=shuiyan(sp,ms=240,save=rt/"tmp"/"watershed")
print("watershed done",info["counts"])
