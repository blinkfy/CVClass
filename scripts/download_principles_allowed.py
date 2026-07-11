"""
Re-download all 21 deep-learning architecture diagrams for
static/assets/principles/ from allowed public sources.

Allowed sources (in priority order):
  1. GitHub official repo README / docs (raw.githubusercontent.com / github.com)
  2. Well-known tutorials: d2l.ai, learnopencv.com, lilianweng.github.io, etc.
  3. arXiv paper PDF figures (only when no good web image exists)

Forbidden: CSDN, doubao CDN, Baidu images, watermarked/ambiguous images.
"""

import os
import io
import re
import sys
import json
import shutil
import hashlib
import tempfile
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import requests
import fitz  # PyMuPDF
from PIL import Image, ImageOps
import numpy as np

BASE_DIR = Path(r"f:\projects\CVClass")
PRINCIPLES_DIR = BASE_DIR / "static" / "assets" / "principles"
WORK_DIR = PRINCIPLES_DIR / "_redownload_work"
WORK_DIR.mkdir(parents=True, exist_ok=True)

TARGET_WIDTH = 1600
MIN_WIDTH = 800
MAX_SIZE_KB = 500
PADDING = 30
BG_THRESH = 245
MIN_GAP = 15
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# Candidate URLs for each target file.  Tried in order until one succeeds.
CANDIDATES = {
    "lenet5-architecture.png": [
        # d2l.ai LeNet chapter figure
        "https://d2l.ai/_images/lenet.svg",
        # Papers with Code / classic diagram mirror
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/lenet.svg",
    ],
    "alexnet-architecture.png": [
        "https://d2l.ai/_images/alexnet.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/alexnet.svg",
    ],
    "vgg16-architecture.png": [
        # learnopencv high-quality VGG architecture diagram
        "https://learnopencv.com/wp-content/uploads/2023/01/tensorflow-keras-cnn-vgg-architecture.png",
        "https://d2l.ai/_images/vgg.svg",
    ],
    "resnet-architecture.jpg": [
        # d2l ResNet-18 / residual block figure
        "https://d2l.ai/_images/resnet18.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/resnet18.svg",
        "https://d2l.ai/_images/residual-block.svg",
    ],
    "rcnn-architecture.png": [
        "https://d2l.ai/_images/r-cnn.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/r-cnn.svg",
    ],
    "fast-rcnn-architecture.jpg": [
        "https://d2l.ai/_images/fast-r-cnn.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/fast-r-cnn.svg",
    ],
    "faster-rcnn-architecture.jpg": [
        "https://d2l.ai/_images/faster-r-cnn.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/faster-r-cnn.svg",
    ],
    "yolov1-architecture.jpg": [
        # YOLOv1 paper figure 3 (PDF crop handled below)
        "arxiv://1506.02640#page=3&crop=70,380,560,700",
    ],
    "fcn-architecture.jpg": [
        "https://d2l.ai/_images/fcn.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/fcn.svg",
    ],
    "unet-architecture.png": [
        # Official U-Net repository paper figure
        "https://lmb.informatik.uni-freiburg.de/people/ronneber/u-net/u-net-architecture.png",
        "https://raw.githubusercontent.com/milesial/Pytorch-UNet/master/unet.png",
    ],
    "segformer-architecture.png": [
        # NVLabs SegFormer official figure
        "https://raw.githubusercontent.com/NVlabs/SegFormer/master/figures/segformer.png",
        "https://github.com/NVlabs/SegFormer/raw/master/figures/segformer.png",
    ],
    "mask-rcnn-architecture.jpg": [
        "https://d2l.ai/_images/mask-r-cnn.svg",
        "https://raw.githubusercontent.com/d2l-ai/d2l-en/master/img/mask-r-cnn.svg",
    ],
    "deeppose-architecture.jpg": [
        # DeepPose paper figure 2 (PDF crop)
        "arxiv://1312.4659#page=2&crop=50,380,580,700",
    ],
    "vit-architecture.png": [
        # Google Research ViT figure from paper / repo
        "https://raw.githubusercontent.com/google-research/vision_transformer/main/vit_figure.png",
        "https://storage.googleapis.com/vit_public/images/vit_figure.png",
        "https://lilianweng.github.io/posts/2022-02-20-rl-law/ViT.png",
    ],
    "swin-transformer-architecture.jpg": [
        "https://raw.githubusercontent.com/microsoft/Swin-Transformer/main/figures/swin_architecture.png",
        "https://github.com/microsoft/Swin-Transformer/raw/main/figures/swin_architecture.png",
    ],
    "clip-architecture.png": [
        "https://raw.githubusercontent.com/openai/CLIP/main/CLIP.png",
        "https://raw.githubusercontent.com/mlfoundations/open_clip/main/docs/CLIP.png",
    ],
    "sam-architecture.png": [
        # SAM official model diagram
        "https://raw.githubusercontent.com/facebookresearch/segment-anything/main/assets/model_diagram.png",
        "https://github.com/facebookresearch/segment-anything/raw/main/assets/model_diagram.png",
    ],
    "gan-architecture.png": [
        # USC CAIS++ tutorial figure (clean, no watermark)
        "https://caisplusplus.usc.edu/assets/images/projects/gan_architecture.png",
        # Goodfellow NIPS 2016 tutorial
        "https://raw.githubusercontent.com/goodfeli/adversarial/master/images/gan.png",
    ],
    "vae-architecture.png": [
        # Carl Doersch VAE tutorial figure
        "https://raw.githubusercontent.com/cdoersch/vae_tutorial/master/net_drawings/vae_test_net.png",
        "https://github.com/cdoersch/vae_tutorial/raw/master/net_drawings/vae_test_net.png",
    ],
    "diffusion-model-architecture.png": [
        # Lilian Weng's diffusion model post
        "https://lilianweng.github.io/posts/2021-07-11-diffusion-models/DDPM.png",
        "https://lilianweng.github.io/posts/2021-07-11-diffusion-models/DDPM-algorithm.png",
    ],
    "stable-diffusion-architecture.jpg": [
        # CompVis Stable Diffusion official model figure
        "https://raw.githubusercontent.com/CompVis/stable-diffusion/main/assets/modelfigure.png",
        "https://github.com/CompVis/stable-diffusion/raw/main/assets/modelfigure.png",
    ],
}


def log(msg):
    print(msg, flush=True)


def safe_name(url):
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def download_bytes(url, timeout=40):
    """Return bytes or None."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.content
    except Exception as e:
        log(f"    download failed: {url} -> {e}")
        return None


def parse_arxiv_url(url):
    """arxiv://ID#page=N&crop=l,t,r,b -> (arxiv_id, page_idx, crop_box)"""
    m = re.match(r"arxiv://([^?#]+)(?:#(.+))?", url)
    if not m:
        return None
    arxiv_id = m.group(1)
    frag = m.group(2) or ""
    page = 0
    crop = None
    if "page=" in frag:
        pm = re.search(r"page=(\d+)", frag)
        if pm:
            page = int(pm.group(1)) - 1  # 1-based in URL
    if "crop=" in frag:
        cm = re.search(r"crop=([\d.,]+)", frag)
        if cm:
            crop = tuple(float(x) for x in cm.group(1).split(","))
    return arxiv_id, page, crop


def render_pdf_page(arxiv_id, page_idx, crop_box=None, zoom=3):
    pdf_path = WORK_DIR / f"{arxiv_id}.pdf"
    if not pdf_path.exists():
        url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        data = download_bytes(url, timeout=60)
        if data is None:
            return None
        pdf_path.write_bytes(data)
        log(f"    downloaded arxiv PDF {arxiv_id}")
    try:
        doc = fitz.open(str(pdf_path))
        page = doc.load_page(page_idx)
        mat = fitz.Matrix(zoom, zoom)
        if crop_box:
            rect = fitz.Rect(crop_box)
            pix = page.get_pixmap(matrix=mat, clip=rect)
        else:
            pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        doc.close()
        return img
    except Exception as e:
        log(f"    PDF render failed: {e}")
        return None


def load_image_from_url(url, as_bytes_for_svg=False):
    """Return PIL Image, or raw bytes if as_bytes_for_svg and url is svg."""
    if url.startswith("arxiv://"):
        parsed = parse_arxiv_url(url)
        if not parsed:
            return None
        return render_pdf_page(*parsed)
    data = download_bytes(url)
    if data is None:
        return None
    if as_bytes_for_svg and (url.lower().endswith(".svg") or url.lower().endswith(".svgz")):
        return data
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return img
    except Exception as e:
        log(f"    open image failed: {url} -> {e}")
        return None


def is_allowed_url(url):
    host = urlparse(url).netloc.lower()
    forbidden = ["csdn", "doubao", "baidu", "sohu", "sinaimg", "weixin"]
    return not any(b in host for b in forbidden)


def auto_crop_content(img, bg_thresh=BG_THRESH, min_gap=MIN_GAP):
    """Detect content bounding box and remove large header/caption gaps."""
    arr = np.array(img.convert("L"))
    h, w = arr.shape
    bg = arr > bg_thresh
    row_fg = (~bg).any(axis=1)
    col_fg = (~bg).any(axis=0)

    top = int(np.argmax(row_fg)) if row_fg.any() else 0
    bottom = int(h - np.argmax(row_fg[::-1])) if row_fg.any() else h
    left = int(np.argmax(col_fg)) if col_fg.any() else 0
    right = int(w - np.argmax(col_fg[::-1])) if col_fg.any() else w

    empty = ~row_fg
    half = h // 2

    def largest_gap(start, end):
        max_gap = 0
        gap_start = None
        cur_start = None
        cur_len = 0
        for y in range(start, end):
            if empty[y]:
                if cur_start is None:
                    cur_start = y
                    cur_len = 1
                else:
                    cur_len += 1
            else:
                if cur_start is not None and cur_len > max_gap:
                    max_gap = cur_len
                    gap_start = cur_start
                cur_start = None
                cur_len = 0
        if cur_start is not None and cur_len > max_gap:
            max_gap = cur_len
            gap_start = cur_start
        return max_gap, gap_start

    top_gap, top_gap_y = largest_gap(0, half)
    bottom_gap, bottom_gap_y = largest_gap(half, h)

    if top_gap >= min_gap and top_gap_y is not None:
        new_top = max(top, top_gap_y + top_gap)
    else:
        new_top = top

    if bottom_gap >= min_gap and bottom_gap_y is not None:
        new_bottom = min(bottom, bottom_gap_y)
    else:
        new_bottom = bottom

    if new_bottom <= new_top or right <= left:
        return (0, 0, w, h)
    return (left, new_top, right, new_bottom)


def add_padding(img, padding=PADDING):
    if img.mode in ("RGBA", "P"):
        bg = Image.new("RGBA", (img.width + 2 * padding, img.height + 2 * padding), (255, 255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, (padding, padding), img)
        return bg.convert("RGB")
    bg = Image.new("RGB", (img.width + 2 * padding, img.height + 2 * padding), (255, 255, 255))
    bg.paste(img, (padding, padding))
    return bg


def resize_and_compress(img, target_ext, target_width=TARGET_WIDTH, max_size_kb=MAX_SIZE_KB):
    w, h = img.size
    if w > target_width:
        ratio = target_width / w
        new_h = int(h * ratio)
        img = img.resize((target_width, new_h), Image.LANCZOS)

    target_ext = target_ext.lower().replace("jpeg", "jpg")

    if target_ext == "png":
        for colors in [None, 256, 128, 64]:
            buf = io.BytesIO()
            if colors is None:
                save_img = img
            else:
                save_img = img.quantize(colors=colors) if img.mode != "P" else img
            save_img.save(buf, format="PNG", optimize=True)
            size_kb = buf.tell() / 1024
            if size_kb <= max_size_kb:
                break
        buf.seek(0)
        return Image.open(buf), size_kb

    # JPEG
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    quality = 95
    while quality >= 50:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        size_kb = buf.tell() / 1024
        if size_kb <= max_size_kb:
            break
        quality -= 5
    buf.seek(0)
    return Image.open(buf), size_kb


def process_one_image(dst_name, urls):
    log(f"\n=== {dst_name} ===")
    ext = Path(dst_name).suffix.lower().replace(".", "")
    dst_path = PRINCIPLES_DIR / dst_name

    for url in urls:
        if not is_allowed_url(url):
            log(f"  skip forbidden: {url}")
            continue
        log(f"  trying {url}")
        is_svg = url.lower().endswith(".svg") or url.lower().endswith(".svgz")
        img = load_image_from_url(url, as_bytes_for_svg=is_svg)
        if img is None:
            continue

        if is_svg and isinstance(img, bytes):
            log("    SVG source; rasterizing with Chromium")
            raster = render_svg_bytes(img)
            if raster is None:
                log("    SVG rasterization failed, trying next candidate")
                continue
            img = raster

        # Auto-crop
        box = auto_crop_content(img)
        cropped = img.crop(box)
        if cropped.width < MIN_WIDTH:
            log(f"    too narrow after crop ({cropped.width}px), skip")
            continue

        # Pad, resize, compress
        final = add_padding(cropped)
        final, size_kb = resize_and_compress(final, ext)

        if final.width < MIN_WIDTH or final.width > TARGET_WIDTH:
            log(f"    width out of range ({final.width}px), skip")
            continue
        if size_kb > MAX_SIZE_KB:
            log(f"    too large ({size_kb:.1f}KB), skip")
            continue

        final.save(dst_path, optimize=True)
        log(f"  SAVED {dst_path}: {final.size}, {size_kb:.1f}KB from {url}")
        return {"status": "success", "source": url, "size": final.size, "kb": size_kb}

    log(f"  FAILED to find valid source for {dst_name}")
    return {"status": "failed", "source": None}


def render_svg_bytes(svg_bytes, output_width=TARGET_WIDTH):
    """Render SVG bytes to a PIL RGB image using Playwright/Chromium."""
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        log(f"    playwright not available: {e}")
        return None
    tmp_svg = WORK_DIR / f"tmp_{hashlib.sha256(svg_bytes).hexdigest()[:12]}.svg"
    tmp_png = WORK_DIR / f"tmp_{hashlib.sha256(svg_bytes).hexdigest()[:12]}.png"
    tmp_svg.write_bytes(svg_bytes)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.set_viewport_size({"width": output_width, "height": 1200})
            page.goto(f"file:///{tmp_svg.resolve().as_posix()}")
            # Wait for SVG to render
            page.wait_for_timeout(500)
            # Determine SVG natural size for full-height screenshot
            dims = page.evaluate("""() => {
                const svg = document.querySelector('svg');
                if (!svg) return null;
                const rect = svg.getBoundingClientRect();
                return {w: Math.max(rect.width, svg.width.baseVal.value || rect.width),
                        h: Math.max(rect.height, svg.height.baseVal.value || rect.height)};
            }""")
            if dims and dims["w"] > 0:
                scale = output_width / dims["w"]
                shot_width = output_width
                shot_height = max(int(dims["h"] * scale), 100)
                page.set_viewport_size({"width": shot_width, "height": shot_height})
                page.wait_for_timeout(200)
            page.screenshot(path=str(tmp_png), full_page=False)
            browser.close()
        img = Image.open(tmp_png).convert("RGB")
        return img
    except Exception as e:
        log(f"    screenshot failed: {e}")
        return None
    finally:
        try:
            tmp_svg.unlink(missing_ok=True)
            tmp_png.unlink(missing_ok=True)
        except Exception:
            pass


def main():
    results = {}
    for name, urls in CANDIDATES.items():
        results[name] = process_one_image(name, urls)

    log("\n\n=== SUMMARY ===")
    success = [k for k, v in results.items() if v["status"] == "success"]
    failed = [k for k, v in results.items() if v["status"] == "failed"]
    for k in success:
        v = results[k]
        log(f"OK  {k}: {v['source']} -> {v['size']} {v['kb']:.1f}KB")
    for k in failed:
        log(f"FAIL {k}")

    summary_path = WORK_DIR / "download_summary.json"
    summary_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"\nSummary written to {summary_path}")


if __name__ == "__main__":
    main()
