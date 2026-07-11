import os
import requests
import fitz
from PIL import Image

TEMP_DIR = r"f:\projects\CVClass\tmp\principles_replacement"

papers = {
    "fast_rcnn": "1504.08083",
    "faster_rcnn": "1506.01497",
    "fcn": "1411.4038",
    "deeppose": "1311.6769",
    "sam": "2304.02643",
}


def download_pdf(arxiv_id):
    url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    path = os.path.join(TEMP_DIR, f"{arxiv_id}.pdf")
    if os.path.exists(path):
        print(f"Already have {path}")
        return path
    r = requests.get(url, headers={"User-Agent":"Mozilla/5.0"}, timeout=60)
    r.raise_for_status()
    with open(path, "wb") as f:
        f.write(r.content)
    print(f"Downloaded {path}")
    return path


def render_pages(pdf_path, name, pages):
    doc = fitz.open(pdf_path)
    for p in pages:
        if p >= len(doc):
            continue
        page = doc.load_page(p)
        pix = page.get_pixmap(matrix=fitz.Matrix(2,2))
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        out = os.path.join(TEMP_DIR, f"{name}_page{p+1}.png")
        img.save(out)
        print(f"Saved {out}")
    doc.close()


for name, arxiv_id in papers.items():
    pdf_path = download_pdf(arxiv_id)
    render_pages(pdf_path, name, list(range(4)))
