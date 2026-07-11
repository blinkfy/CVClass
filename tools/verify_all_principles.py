"""
Verify all 21 images on the /principles page.
"""

import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:5000/principles"
OUTPUT_DIR = Path(r"f:\projects\CVClass\static\assets\principles\_redownload_work\verification")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# (anchor, filename substring, label)
ALL_MODELS = [
    ("algo-part7-6-lenet-5", "lenet5-architecture", "LeNet-5"),
    ("algo-part7-6-alexnet", "alexnet-architecture", "AlexNet"),
    ("algo-part7-6-vgg", "vgg16-architecture", "VGG-16"),
    ("algo-part7-6-resnet", "resnet-architecture", "ResNet"),
    ("topic-part9-1", "rcnn-architecture", "R-CNN"),
    ("topic-part9-2", "fast-rcnn-architecture", "Fast R-CNN"),
    ("topic-part9-2", "faster-rcnn-architecture", "Faster R-CNN"),
    ("topic-part9-3", "yolov1-architecture", "YOLOv1"),
    ("topic-part10-1", "fcn-architecture", "FCN"),
    ("topic-part10-2", "unet-architecture", "U-Net"),
    ("topic-part10-3", "segformer-architecture", "SegFormer"),
    ("topic-part11-1", "mask-rcnn-architecture", "Mask R-CNN"),
    ("topic-part16-2", "deeppose-architecture", "DeepPose"),
    ("topic-part17-2", "vit-architecture", "ViT"),
    ("topic-part17-3", "swin-transformer-architecture", "Swin Transformer"),
    ("topic-part18-1", "clip-architecture", "CLIP"),
    ("topic-part19-1", "sam-architecture", "SAM"),
    ("topic-part20-1", "gan-architecture", "GAN"),
    ("topic-part20-2", "vae-architecture", "VAE"),
    ("topic-part20-3", "diffusion-model-architecture", "Diffusion"),
    ("topic-part20-4", "stable-diffusion-architecture", "Stable Diffusion"),
]


def verify():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(1200)

        for anchor, filename, label in ALL_MODELS:
            print(f"\n=== {label} ===")
            page.goto(f"{BASE_URL}#{anchor}", wait_until="networkidle")
            page.wait_for_timeout(1000)

            img_locator = page.locator(f'img[src*="{filename}"]')
            count = img_locator.count()
            if count == 0:
                print(f"  IMAGE NOT FOUND: {filename}")
                results.append({"model": label, "found": False, "loaded": False})
                continue

            img_locator.first.scroll_into_view_if_needed()
            page.wait_for_timeout(500)

            loaded = img_locator.first.evaluate("el => el.naturalWidth > 0")
            width = img_locator.first.evaluate("el => el.naturalWidth")
            height = img_locator.first.evaluate("el => el.naturalHeight")
            print(f"  found, loaded={loaded}, natural={width}x{height}")

            results.append({
                "model": label,
                "found": True,
                "loaded": bool(loaded),
                "natural_width": width,
                "natural_height": height,
            })

        browser.close()

    summary_path = OUTPUT_DIR / "verification_all_summary.json"
    summary_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nAll-model verification saved to {summary_path}")

    failed = [r for r in results if not r["loaded"]]
    if failed:
        print(f"FAILED ({len(failed)}): {[r['model'] for r in failed]}")
    else:
        print("All 21 images loaded successfully.")


if __name__ == "__main__":
    verify()
