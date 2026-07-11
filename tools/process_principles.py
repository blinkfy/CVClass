import os
import io
from PIL import Image
import numpy as np

BASE_DIR = r"f:\projects\CVClass"
PRINCIPLES_DIR = os.path.join(BASE_DIR, "static", "assets", "principles")
TEMP_DIR = os.path.join(BASE_DIR, "tmp", "principles_replacement")

TARGET_WIDTH = 1600
MAX_SIZE_KB = 500
PADDING = 30
BG_THRESH = 245
MIN_GAP = 15


def resize_and_compress(img, target_width=TARGET_WIDTH, max_size_kb=MAX_SIZE_KB, target_ext=None):
    """Resize image to target width and compress to under max_size_kb.

    target_ext: 'png' or 'jpg' (default inferred from image mode).
    """
    w, h = img.size
    if w != target_width:
        ratio = target_width / w
        new_h = int(h * ratio)
        img = img.resize((target_width, new_h), Image.LANCZOS)

    if target_ext is None:
        target_ext = "png" if img.mode in ("RGBA", "P") else "jpg"
    target_ext = target_ext.lower().replace("jpeg", "jpg")

    if target_ext == "png":
        # Try full color PNG first, then quantize if too large.
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
        return Image.open(buf), "PNG", size_kb

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


def find_content_box(img, bg_thresh=BG_THRESH, min_gap=MIN_GAP):
    """Auto detect content bounding box and header/caption gaps."""
    arr = np.array(img.convert("L"))
    h, w = arr.shape
    bg = arr > bg_thresh
    row_fg = (~bg).any(axis=1)
    col_fg = (~bg).any(axis=0)

    top = int(np.argmax(row_fg))
    bottom = int(h - np.argmax(row_fg[::-1])) if row_fg.any() else h
    left = int(np.argmax(col_fg))
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
        # crop below the top gap
        new_top = top_gap_y + top_gap
    else:
        new_top = top

    if bottom_gap >= min_gap and bottom_gap_y is not None:
        new_bottom = bottom_gap_y
    else:
        new_bottom = bottom

    return (left, new_top, right, new_bottom)


def process_image(src_path, dst_path, crop_box=None):
    """Crop (optional), pad, resize, compress, save."""
    img = Image.open(src_path)
    if crop_box:
        img = img.crop(crop_box)
    img = add_padding(img)
    ext = os.path.splitext(dst_path)[1].lower().replace(".", "")
    img, fmt, size_kb = resize_and_compress(img, target_ext=ext)
    img.save(dst_path, format=fmt, optimize=True)
    print(f"Saved {dst_path}: {img.size}, {size_kb:.1f}KB")
    return img.size


# Replacement architecture images
replacements = [
    ("rcnn_arch_crop3.png", "rcnn-architecture.png", None),
    ("yolov1_arch_crop.png", "yolov1-architecture.jpg", None),
    ("maskrcnn_arch_crop3.png", "mask-rcnn-architecture.jpg", (60, 0, 620, 180)),
    ("ddpm_arch_crop4.png", "diffusion-model-architecture.png", None),
    ("vae-architecture_candidate_1.png", "vae-architecture.png", None),
    ("vgg16-architecture_candidate_0.png", "vgg16-architecture.png", None),
]

# GAN needs a crop to remove header/logo
gan_crop = (0, 200, 1024, 576)
replacements.append(("gan_candidate_new_1.png", "gan-architecture.png", gan_crop))

# These originally belonged to the crop list but the existing files were
# corrupted/severely compressed, so replace them from rendered PDF figures.
replacements.append(("sam_page1.png", "sam-architecture.png", (80, 360, 1144, 580)))
replacements.append(("fast_rcnn_page2.png", "fast-rcnn-architecture.jpg", (620, 140, 1180, 320)))
replacements.append(("fcn_page1.png", "fcn-architecture.jpg", (650, 390, 1180, 520)))
replacements.append(("deeppose_correct_page3.png", "deeppose-architecture.jpg", (80, 150, 1144, 380)))

# Crop-only images (manual overrides for side text etc.)
crops = {
    "lenet5-architecture.png": (50, 150, 1550, 420),
    "alexnet-architecture.png": (120, 120, 1480, 520),
    "resnet-architecture.jpg": (150, 250, 1450, 1100),
    "faster-rcnn-architecture.jpg": (80, 80, 920, 620),
    "unet-architecture.png": (100, 150, 1500, 800),
    "segformer-architecture.png": (80, 150, 1520, 600),
    "swin-transformer-architecture.jpg": (80, 220, 1520, 600),
    "vit-architecture.png": (80, 150, 1520, 620),
    "clip-architecture.png": (80, 160, 1520, 470),
    "stable-diffusion-architecture.jpg": (120, 360, 1280, 940),
}


def main():
    print("=== Replacements ===")
    for src, dst, box in replacements:
        src_path = os.path.join(TEMP_DIR, src)
        if not os.path.exists(src_path):
            print(f"Missing {src_path}")
            continue
        dst_path = os.path.join(PRINCIPLES_DIR, dst)
        process_image(src_path, dst_path, box)

    print("\n=== Crops ===")
    for dst, box in crops.items():
        src_path = os.path.join(PRINCIPLES_DIR, dst)
        dst_path = os.path.join(PRINCIPLES_DIR, dst)
        process_image(src_path, dst_path, box)


if __name__ == "__main__":
    main()
