import os
import requests

TEMP_DIR = r"f:\projects\CVClass\tmp\principles_replacement"
urls = [
    "https://aka.doubaocdn.com/s/TWOn1wkzC4",
    "https://aka.doubaocdn.com/s/1yEA1wkzC4",
]
for i, url in enumerate(urls):
    ext = url.split('.')[-1] if '.' in url else "png"
    if ext not in ("png", "jpg", "jpeg", "svg"):
        ext = "png"
    path = os.path.join(TEMP_DIR, f"gan_candidate_new_{i}.{ext}")
    r = requests.get(url, headers={"User-Agent":"Mozilla/5.0"}, timeout=30)
    r.raise_for_status()
    with open(path, "wb") as f:
        f.write(r.content)
    print(f"Saved {path}: {len(r.content)} bytes")
