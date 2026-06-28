from __future__ import annotations
import json
import math
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.cluster import MiniBatchKMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score,top_k_accuracy_score

lb = ["daffodil","snowdrop","lily_of_the_valley","bluebell","crocus","iris","tigerlily",
    "tulip","fritillary","sunflower","daisy","coltsfoot","dandelion","cowslip",
    "buttercup","windflower","pansy"]

@dataclass(frozen=True)
class Im:
    p: Path
    idx: int
    li: int
    l: str
    wi: int

def huoqumulu(d):
    # 取图片目录
    j=d/"jpg"
    return j if j.exists() else d

def ld(d):
    dr=huoqumulu(d)
    fs=sorted(dr.glob("image_*.jpg"))
    # DEBUG-01: found images count
    # print("[DEBUG] found",len(fs),"images in",dr)
    if len(fs)!=1360:
        raise RuntimeError(f"Expected 1360 images,found {len(fs)}")
    rs=[]
    pt=re.compile(r"image_(\d{4})\.jpg$",re.I)
    for p in fs:
        m=pt.search(p.name)
        if not m: continue
        ix=int(m.group(1))
        if not 1<=ix<=1360:
            raise RuntimeError(f"Bad index: {p.name}")
        li=(ix-1)//80
        wi=(ix-1)%80
        # if ix <= 3: print(f"[标记-A] {p.name} -> 标签 {li}")
        rs.append(Im(p=p,idx=ix,li=li,l=lb[li],wi=wi))
    if len(rs)!=1360:
        raise RuntimeError(f"Expected 1360,got {len(rs)}")
    return sorted(rs,key=lambda x:x.idx)

def fenge(e):
    tr=[x for x in e if x.wi<60]
    test=[x for x in e if x.wi>=60]
    # print(f"[调试-SPLIT] 训练={len(tr)} 测试={len(test)}")
    return tr,test

def rgb(p,ms):
    with Image.open(p) as img:
        img=img.convert("RGB")
        sc=min(1.0,ms/max(img.size))
        if sc<1.0:
            w=max(1,round(img.width*sc))
            h=max(1,round(img.height*sc))
            img=img.resize((w,h),Image.Resampling.BILINEAR)
        a=np.asarray(img,dtype=np.float32)/255.0
    return a

def px(a,x,y):
    H,W,_=a.shape
    px=int(np.clip(round(x),0,W-1))
    py=int(np.clip(round(y),0,H-1))
    r,g,b=a[py,px]
    lu=0.299*r+0.587*g+0.114*b
    return float(r),float(g),float(b),float(lu)

def patch_desc(a,x,y,pr):
    #补丁描述
    H,W,_=a.shape
    st=max(1,round(pr/3))
    off=np.arange(-pr,pr+1,st,dtype=np.float32)
    gx,gy=np.meshgrid(off,off)
    xs=np.clip(np.rint(x+gx.ravel()).astype(np.int32),0,W-1)
    ys=np.clip(np.rint(y+gy.ravel()).astype(np.int32),0,H-1)
    ps=a[ys,xs]
    rv=ps[:,0]
    gv=ps[:,1]
    bv=ps[:,2]
    lv=0.299*rv+0.587*gv+0.114*bv
    lx=np.clip(xs-1,0,W-1)
    rx=np.clip(xs+1,0,W-1)
    uy=np.clip(ys-1,0,H-1)
    dy=np.clip(ys+1,0,H-1)
    L=0.299*a[ys,lx,0]+0.587*a[ys,lx,1]+0.114*a[ys,lx,2]
    R=0.299*a[ys,rx,0]+0.587*a[ys,rx,1]+0.114*a[ys,rx,2]
    U=0.299*a[uy,xs,0]+0.587*a[uy,xs,1]+0.114*a[uy,xs,2]
    D=0.299*a[dy,xs,0]+0.587*a[dy,xs,1]+0.114*a[dy,xs,2]
    gx2=R-L
    gy2=D-U
    n=max(1,len(lv))
    m=float(lv.mean())
    v=float(((lv-m)**2).mean())
    rs=float(rv.sum())
    gs=float(gv.sum())
    bs=float(bv.sum())
    gr=float(np.sqrt(gx2*gx2+gy2*gy2).sum())
    vx=float(np.abs(gx2).sum())
    vy=float(np.abs(gy2).sum())
    cf=(max(rs,gs,bs)-min(rs,gs,bs))/n
    return np.array([
        np.clip(m,0,1),
        np.clip(math.sqrt(v)*2.4,0,1),
        np.clip((gr/n)*3.2,0,1),
        np.clip(vx/max(0.001,vx+vy),0,1),
        np.clip(rs/n,0,1),
        np.clip(gs/n,0,1),
        np.clip(bs/n,0,1),
        np.clip(cf*2.2,0,1),
    ],dtype=np.float32)

def liangdu(a):
    return 0.299*a[:,:,0]+0.587*a[:,:,1]+0.114*a[:,:,2]

def sample_points(a,c,rng):
    H,W,_=a.shape
    r=max(4,round(min(W,H)*0.018))
    st=max(8,round(min(W,H)/16))
    l=liangdu(a)
    gy,gx=np.gradient(l)
    mg=np.sqrt(gx*gx+gy*gy)
    cd=[]
    for y in range(r,max(r+1,H-r),st):
        for x in range(r,max(r+1,W-r),st):
            y0=max(0,y-r)
            y1=min(H,y+r+1)
            x0=max(0,x-r)
            x1=min(W,x+r+1)
            cd.append((float(mg[y0:y1,x0:x1].mean()),float(x),float(y)))
    cd.sort(reverse=True,key=lambda x:x[0])
    sc=min(len(cd),round(c*0.72))
    rs=[(x,y) for _,x,y in cd[:sc]]
    rm=c-len(rs)
    if rm>0:
        if cd:
            pl=np.array([(x,y) for _,x,y in cd],dtype=np.float32)
            ch=rng.choice(len(pl),size=rm,replace=len(pl)<rm)
            rs.extend((float(pl[i,0]),float(pl[i,1])) for i in ch)
        else:
            rs.extend((float(rng.integers(r,max(r+1,W-r))),float(rng.integers(r,max(r+1,H-r)))) for _ in range(rm))
    return rs[:c]

def get_fd(e,ms,ppi,rng):
    a=rgb(e.p,ms)
    H,W,_=a.shape
    r=max(4,round(min(W,H)*0.018))
    ps=sample_points(a,ppi,rng)
    return np.vstack([patch_desc(a,x,y,r) for x,y in ps])

def hst(km,ds,vs):
    w=km.predict(ds)
    h=np.bincount(w,minlength=vs).astype(np.float32)
    s=h.sum()
    if s>0: h/=s
    return np.sqrt(h)

def jisuangeshu(e,km,ms,ppi,rs):
    hs=[]
    labels=[]
    for x in e:
        rng=np.random.default_rng(rs+x.idx)
        ds=get_fd(x,ms,ppi,rng)
        hs.append(hst(km,ds,len(km.cluster_centers_)))
        labels.append(x.li)
    return np.vstack(hs),np.asarray(labels,dtype=np.int64)

def rnd(v,d=6):
    return np.round(v.astype(np.float64),d).tolist()

def copy_samples(e,sd,so):
    sd.mkdir(parents=True,exist_ok=True)
    si=[]
    for i,l in enumerate(lb):
        le=[x for x in e if x.li==i][:2]
        for j,x in enumerate(le,start=1):
            fn=f"{l}_{j:02d}.jpg"
            tg=sd/fn
            shutil.copy2(x.p,tg)
            with Image.open(x.p) as img:
                W,H=img.size
            si.append({
                "id": f"flower_{l}_{j:02d}",
                "name": f"{l.replace('_',' ').title()} · sample {j:02d}",
                "image": f"/static/assets/img/flowers17/{fn}",
                "label": l,
                "width": W,
                "height": H,
                "source": "Oxford 17 Category Flower Dataset",
            })
    so.parent.mkdir(parents=True,exist_ok=True)
    so.write_text(json.dumps({
        "defaultSample": "flower_daffodil_01",
        "task": "flowers17_bovw_classification",
        "engine": "trained_frontend_bovw",
        "samples": si,
    },ensure_ascii=False,indent=2),encoding="utf-8")

def main():
    rt=Path(r"F:\projects\CVClass")
    data_dir=rt/"models"/"data"/"17flowers"
    model_out=rt/"static"/"assets"/"data"/"vision_tasks"/"classification_lab"/"bovw_flowers17_model.json"
    samples_out=rt/"static"/"assets"/"data"/"vision_tasks"/"classification_lab"/"flowers17_samples.json"
    sample_img_dir=rt/"static"/"assets"/"img"/"flowers17"
    vocab_size=128
    max_side=320
    ppi=128
    rs=42

    e=ld(data_dir)
    tr,te=fenge(e)
    print(f"Loaded {len(e)} images: {len(tr)} train,{len(te)} test")

    rng=np.random.default_rng(rs)
    db=[]
    for x in tr:
        db.append(get_fd(x,max_side,ppi,rng))
    td=np.vstack(db)
    print(f"Training codebook on {len(td)} descriptors")

    km=MiniBatchKMeans(
        n_clusters=vocab_size,
        random_state=rs,
        batch_size=4096,
        n_init=3,
        max_iter=240,
        reassignment_ratio=0.01,
        verbose=0,
    )
    km.fit(td)
    # print("KMEANS聚类完成")

    xt,yt=jisuangeshu(tr,km,max_side,ppi,rs)
    xe,ye=jisuangeshu(te,km,max_side,ppi,rs)

    clf=LogisticRegression(
        multi_class="auto",
        max_iter=1500,
        class_weight="balanced",
        solver="lbfgs",
        C=3.0,
        random_state=rs,
    )
    clf.fit(xt,yt)

    ptr=clf.predict(xt)
    pte=clf.predict(xe)
    sc=clf.predict_proba(xe)
    atr=float(accuracy_score(yt,ptr))
    ate=float(accuracy_score(ye,pte))
    t3=float(top_k_accuracy_score(ye,sc,k=3,labels=np.arange(len(lb))))

    model_out.parent.mkdir(parents=True,exist_ok=True)
    md={
        "model_type": "frontend_bovw_patch",
        "dataset": "Oxford 17 Category Flower Dataset",
        "descriptor": {
            "type": "patch_descriptor",
            "dimension": 8,
            "compatible_with": "classification_lab.patchDescriptor",
        },
        "vocab_size": vocab_size,
        "codebook": rnd(km.cluster_centers_),
        "histogram": {"normalization": "l1_sqrt"},
        "labels": lb,
        "classifier": {
            "type": "logistic_regression",
            "weights": rnd(clf.coef_),
            "bias": rnd(clf.intercept_),
        },
        "metrics": {
            "train_accuracy": round(atr,6),
            "test_accuracy": round(ate,6),
            "top3_accuracy": round(t3,6),
            "train_count": len(tr),
            "test_count": len(te),
            "patches_per_image": ppi,
            "split": "per_class_first_60_train_last_20_test",
            "random_state": rs,
        },
    }
    model_out.write_text(json.dumps(md,ensure_ascii=False,indent=2),encoding="utf-8")
    copy_samples(e,sample_img_dir,samples_out)
    #print(f"ok")

    print(f"Saved model: {model_out}")
    print(f"Saved samples: {samples_out}")
    print(f"Copied sample images: {sample_img_dir}")
    print(f"train_accuracy={atr:.4f}")
    print(f"test_accuracy={ate:.4f}")
    print(f"top3_accuracy={t3:.4f}")


if __name__ == "__main__":
    main()
