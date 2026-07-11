import os
import re
import io
import requests
import fitz  # PyMuPDF
from PIL import Image
from urllib.parse import urlparse

BASE_DIR = r"f:\projects\CVClass"
PRINCIPLES_DIR = os.path.join(BASE_DIR, "static", "assets", "principles")
TEMP_DIR = os.path.join(BASE_DIR, "tmp", "principles_replacement")
os.makedirs(TEMP_DIR, exist_ok=True)

TARGET_WIDTH = 1600
MAX_SIZE_KB = 500
PADDING = 30


def download_image(url, save_path):
    """Download image from URL and save to path."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        with open(save_path, "wb") as f:
            f.write(r.content)
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return False


def get_image_from_pdf(pdf_path, page_num, crop_box=None, zoom=2):
    """Render a PDF page (or crop region) to PIL Image."""
    doc = fitz.open(pdf_path)
    page = doc.load_page(page_num)
    mat = fitz.Matrix(zoom, zoom)
    if crop_box:
        rect = fitz.Rect(crop_box)
        pix = page.get_pixmap(matrix=mat, clip=rect)
    else:
        pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    doc.close()
    return img


def download_arxiv_pdf(arxiv_id, save_path):
    """Download arxiv PDF."""
    url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    return download_image(url, save_path)


def resize_and_compress(img, target_width=TARGET_WIDTH, max_size_kb=MAX_SIZE_KB):
    """Resize image to target width and compress to under max_size_kb."""
    # Resize maintaining aspect ratio
    w, h = img.size
    if w != target_width:
        ratio = target_width / w
        new_h = int(h * ratio)
        img = img.resize((target_width, new_h), Image.LANCZOS)

    # Try PNG first
    buf = io.BytesIO()
    if img.mode in ("RGBA", "P"):
        img.save(buf, format="PNG", optimize=True)
    else:
        img.save(buf, format="PNG", optimize=True)
    size_kb = buf.tell() / 1024

    if size_kb <= max_size_kb:
        buf.seek(0)
        return Image.open(buf), "PNG", size_kb

    # Fallback to JPEG with quality reduction
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
    return Image.open(buf), "JPEG", size_kb


def add_padding(img, padding=PADDING):
    """Add white padding around image."""
    if img.mode == "RGBA":
        bg = Image.new("RGBA", (img.width + 2*padding, img.height + 2*padding), (255, 255, 255, 255))
        bg.paste(img, (padding, padding), img)
        return bg.convert("RGB")
    else:
        bg = Image.new("RGB", (img.width + 2*padding, img.height + 2*padding), (255, 255, 255))
        bg.paste(img, (padding, padding))
        return bg


def save_final(img, path, ext=None):
    """Resize, compress, add padding and save."""
    img = add_padding(img)
    img, fmt, size_kb = resize_and_compress(img)
    if ext is None:
        ext = "png" if fmt == "PNG" else "jpg"
    final_path = os.path.splitext(path)[0] + "." + ext
    img.save(final_path, format=fmt, optimize=True)
    print(f"Saved {final_path}: {img.size}, {size_kb:.1f}KB")
    return final_path


# Try downloading replacement images from various sources
def try_replacements():
    replacements = {
        "rcnn-architecture": [
            ("https://aka.doubaocdn.com/s/Yurq1wkyxy", "jpg"),
            ("https://d2l.ai/_images/r-cnn.svg", "svg"),
        ],
        "yolov1-architecture": [
            # YOLO v1 paper figure 3
            ("arxiv://1506.02640", "pdf"),
        ],
        "mask-rcnn-architecture": [
            ("https://aka.doubaocdn.com/s/d2yL1wkyzF", "jpg"),
            ("arxiv://1703.06870", "pdf"),
        ],
        "gan-architecture": [
            ("https://aka.doubaocdn.com/s/QDOt1wkyy0", "png"),
            ("https://caisplusplus.usc.edu/assets/images/projects/gan_architecture.png", "png"),
        ],
        "vae-architecture": [
            ("https://aka.doubaocdn.com/s/1Sdd1wkyy0", "png"),
            ("https://aka.doubaocdn.com/s/8GQA1wkyzg", "png"),
        ],
        "diffusion-model-architecture": [
            ("arxiv://2006.11239", "pdf"),
        ],
        "vgg16-architecture": [
            ("https://learnopencv.com/wp-content/uploads/2023/01/tensorflow-keras-cnn-vgg-architecture.png", "png"),
        ],
    }

    for name, sources in replacements.items():
        print(f"\n=== {name} ===")
        saved = False
        for i, (url, fmt) in enumerate(sources):
            save_path = os.path.join(TEMP_DIR, f"{name}_candidate_{i}.{fmt}")
            if url.startswith("arxiv://"):
                arxiv_id = url.replace("arxiv://", "")
                pdf_path = os.path.join(TEMP_DIR, f"{arxiv_id}.pdf")
                if download_arxiv_pdf(arxiv_id, pdf_path):
                    print(f"Downloaded arxiv PDF {arxiv_id}")
                else:
                    print(f"Failed to download arxiv PDF {arxiv_id}")
            else:
                if download_image(url, save_path):
                    print(f"Downloaded candidate {i} from {url}")
                else:
                    print(f"Failed candidate {i} from {url}")


if __name__ == "__main__":
    try_replacements()
