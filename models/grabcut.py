from pathlib import Path
import json
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

def km_simple(fe,k,rs):
    #给GrabCut当颜色模型
    rng=np.random.default_rng(rs)
    N,D=fe.shape
    k=min(k,N)
    idx=rng.choice(N,size=k,replace=False)
    ct=fe[idx].copy()
    for it in range(20):
        ds=((fe[:,None,:]-ct[None,:,:])**2).sum(axis=2)
        lb=ds.argmin(axis=1)
        new=np.zeros_like(ct)
        for j in range(k):
            mask=lb==j
            c=int(mask.sum())
            if c>0:
                new[j]=fe[mask].mean(axis=0)
            else:
                new[j]=fe[rng.integers(N)]
        ct=new
    ds=((fe[:,None,:]-ct[None,:,:])**2).sum(axis=2)
    lb=ds.argmin(axis=1)
    return ct,lb

def juli(px,ct):
    if len(ct)==0:
        return np.full(len(px),1e9)
    ds=((px[:,None,:]-ct[None,:,:])**2).sum(axis=2)
    return ds.min(axis=1)

def grab(p,box=None,k=5,iters=5,ms=320,rs=42,save=None):
    a,orig=duqu(p,ms)
    H,W,C=a.shape
    px=a.reshape(-1,C)
    if box is None:
        x1=W//5
        y1=H//5
        x2=W*4//5
        y2=H*4//5
    else:
        x1,y1,x2,y2=box
    x1=max(0,min(W-1,x1))
    y1=max(0,min(H-1,y1))
    x2=max(0,min(W-1,x2))
    y2=max(0,min(H-1,y2))
    if x2<x1:
        x1,x2=x2,x1
    if y2<y1:
        y1,y2=y2,y1

    #初始mask：框外BG=0，框内FG=1
    mk=np.zeros((H,W),dtype=np.int32)
    mk[y1:y2+1,x1:x2+1]=1

    for it in range(iters):
        fg=px[mk.ravel()==1]
        bg=px[mk.ravel()==0]
        if len(fg)<k or len(bg)<k:
            break
        ct_fg,_=km_simple(fg,k,rs+it)
        ct_bg,_=km_simple(bg,k,rs+it+100)
        df=juli(px,ct_fg)
        db=juli(px,ct_bg)
        mk2=(df<db).reshape(H,W)
        #框外强制背景
        mk2[:y1,:]=False
        mk2[y2+1:,:]=False
        mk2[:,:x1]=False
        mk2[:,x2+1:]=False
        mk=mk2.astype(np.int32)
        #print(f"迭代 {it} FG像素 {int(mk.sum())}")

    mask=np.uint8(mk*255)
    fg_img=(a*mk[:,:,None]).astype(np.float32)
    ovr=np.uint8(a*255)
    col=np.zeros((H,W,3),dtype=np.uint8)
    col[mk==1]=[0,255,128]
    alpha=0.45
    mix=np.uint8(ovr*(1-alpha)+col*alpha)

    out={
        "shape":[H,W],
        "orig_size":orig,
        "box":[x1,y1,x2,y2],
        "iterations":it+1,
        "fg_pixels":int(mk.sum()),
        "bg_pixels":int((mk==0).sum()),
    }

    if save:
        sd=Path(save)
        sd.mkdir(parents=True,exist_ok=True)
        Image.fromarray(mask,mode="L").save(sd/"grabcut_mask.png")
        Image.fromarray(np.uint8(fg_img*255),mode="RGB").save(sd/"grabcut_fg.png")
        Image.fromarray(mix,mode="RGB").save(sd/"grabcut_overlay.png")
        (sd/"grabcut_meta.json").write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")
        #print(sd)
    return mask,fg_img,mix,a,out

rt=Path(r"F:\projects\CVClass")
sp=rt/"static"/"assets"/"img"/"flowers17"/"daffodil_01.jpg"
mk,fg,ov,a,info=grab(sp,k=5,iters=4,ms=240,save=rt/"tmp"/"grabcut")
print("grabcut done",info["fg_pixels"],info["bg_pixels"])
