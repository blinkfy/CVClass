from pathlib import Path
import json
import numpy as np
from PIL import Image

def duqu(p,ms):#读图缩放
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

def tiqu(a,m,xyw):
    H,W,C=a.shape
    px=a.reshape(-1,C)
    if m=="rgb":
        fe=px.copy()
    elif m=="rgbxy":
        y,x=np.indices((H,W),dtype=np.float32)
        #归一化/加权
        xs=(x.ravel()/max(1,W-1))*xyw
        ys=(y.ravel()/max(1,H-1))*xyw
        fe=np.column_stack([px,xs,ys])
    #print(f" {m} 维度 {fe.shape}")
    return fe

def cluster(fe,k,rs,max_iter,tol):
    rng=np.random.default_rng(rs)
    N,D=fe.shape
    k=min(k,N)
    #idx=rng.choice(N,size=k,replace=False)
    #ct=fe[idx]
    #ds=((fe[:,None,:]-ct[None,:,:])**2).sum(axis=2)
    #lb=ds.argmin(axis=1)
    #iner=float(((fe-ct[lb])**2).sum())
    #return lb,ct,iner

    #随机选K个样本当初始中心
    idx=rng.choice(N,size=k,replace=False)
    ct=fe[idx].copy()
    lb=np.zeros(N,dtype=np.int32)
    iner=0.0
    for it in range(max_iter):
        #计算每个样本到各中心的距离
        ds=((fe[:,None,:]-ct[None,:,:])**2).sum(axis=2)
        lb=np.argmin(ds,axis=1)
        new=np.zeros_like(ct)
        for j in range(k):
            mask=lb==j
            c=int(mask.sum())
            if c>0:
                new[j]=fe[mask].mean(axis=0)
            else:
                #空簇就随机挑一个样本重生
                new[j]=fe[rng.integers(N)]
        shift=np.sqrt(((new-ct)**2).sum(axis=1)).max()
        ct=new
        if shift<tol:
            break
    #最终归类与inertia
    ds=((fe[:,None,:]-ct[None,:,:])**2).sum(axis=2)
    lb=np.argmin(ds,axis=1)
    iner=float(((fe-ct[lb])**2).sum())
    return lb,ct,iner

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
        [220,20,60],
        [128,128,0],
    ],dtype=np.uint8)
    if k<=len(tab):
        return tab[:k]
    rng=np.random.default_rng(k)
    return (rng.random((k,3))*255).astype(np.uint8)

def fenge(p,k,m,ms,rs,xyw,save):
    a,orig=duqu(p,ms)
    H,W,C=a.shape
    fe=tiqu(a,m,xyw)
    lb,ct,iner=cluster(fe,k,rs)
    mk=lb.reshape(H,W).astype(np.int32)

    #按聚类中心RGB着色，保留原始色调
    cols=(np.clip(ct[:,:3],0,1)*255).astype(np.uint8)
    clr=cols[lb].reshape(H,W,3)
    dis=caihong(k)

    out={
        "shape":[H,W],
        "orig_size":orig,
        "mode":m,
        "k":k,
        "xy_weight":xyw,
        "inertia":float(iner),
        "centers":ct.tolist(),
        "cluster_colors":cols.tolist(),
        "counts":np.bincount(lb,minlength=k).tolist(),
    }

    if save:
        sd=Path(save)
        sd.mkdir(parents=True,exist_ok=True)
        Image.fromarray(clr,mode="RGB").save(sd/"cluster_color.png")
        Image.fromarray(dis[mk],mode="RGB").save(sd/"cluster_mask_color.png")
        alpha=0.45
        ovr=np.uint8(a*255)
        mix=np.uint8(ovr*(1-alpha)+dis[mk]*alpha)
        Image.fromarray(mix,mode="RGB").save(sd/"overlay.png")
        (sd/"cluster_meta.json").write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")
    return mk,clr,out

rt=Path(r"F:\projects\CVClass")
sp=rt/"static"/"assets"/"img"/"flowers17"/"daffodil_01.jpg"

mk,clr,info=fenge(sp,k=5,m="rgb",ms=240,rs=42,xyw=0.5,save=rt/"tmp"/"kmeans_rgb")
print("rgb done",info["counts"])

mk2,clr2,info2=fenge(sp,k=5,m="rgbxy",ms=240,rs=42,xyw=0.6,save=rt/"tmp"/"kmeans_rgbxy")
print("rgbxy done",info2["counts"])
