import os
import fitz
from PIL import Image

TEMP_DIR = r"f:\projects\CVClass\tmp\principles_replacement"


def render_pdf_page(pdf_path, page_num, zoom=2, save_path=None):
    doc = fitz.open(pdf_path)
    if page_num >= len(doc):
        print(f"Page {page_num} out of range for {pdf_path}")
        doc.close()
        return None
    page = doc.load_page(page_num)
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    if save_path:
        img.save(save_path)
        print(f"Saved {save_path}")
    doc.close()
    return img


papers = {
    "rcnn": ("1311.2524.pdf", 6),
    "yolov1": ("1506.02640.pdf", 7),
    "maskrcnn": ("1703.06870.pdf", 5),
    "ddpm": ("2006.11239.pdf", 6),
}

for name, (pdf_name, max_page) in papers.items():
    pdf_path = os.path.join(TEMP_DIR, pdf_name)
    if not os.path.exists(pdf_path):
        print(f"Missing {pdf_path}")
        continue
    for p in range(max_page):
        save_path = os.path.join(TEMP_DIR, f"{name}_page{p+1}.png")
        render_pdf_page(pdf_path, p, zoom=2, save_path=save_path)
