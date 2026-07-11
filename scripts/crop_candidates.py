import os
from PIL import Image

TEMP_DIR = r"f:\projects\CVClass\tmp\principles_replacement"

# (source_path, crop_box_px, output_name)
crops = [
    ("rcnn_page1.png", (660, 420, 1180, 620), "rcnn_arch_crop3.png"),
    ("yolov1_page3.png", (60, 160, 1160, 430), "yolov1_arch_crop.png"),
    ("maskrcnn_page1.png", (540, 400, 1160, 580), "maskrcnn_arch_crop3.png"),
    ("ddpm_page2.png", (200, 150, 1020, 225), "ddpm_arch_crop4.png"),
]

for src, box, out in crops:
    path = os.path.join(TEMP_DIR, src)
    img = Image.open(path)
    cropped = img.crop(box)
    out_path = os.path.join(TEMP_DIR, out)
    cropped.save(out_path)
    print(f"Saved {out_path}: {cropped.size}")
