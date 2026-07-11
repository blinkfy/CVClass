"""Build and promote the GitHub Pages edition into docs/.

The Pages edition intentionally omits the two SDXS browser ONNX files because
GitHub rejects individual repository files above 100 MiB and Pages sites above
1 GiB. All other static lessons and the configurable AI assistant are kept.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


DOCS_ROOT = Path(__file__).resolve().parent
STAGE = DOCS_ROOT / "site"
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_SITE_BYTES = 1024 * 1024 * 1024


def promote_stage(base_path: str) -> dict[str, object]:
    manifest_path = STAGE / "build-manifest.json"
    index_path = STAGE / "index.html"
    if not manifest_path.is_file() or not index_path.is_file():
        raise RuntimeError("GitHub Pages staging build is incomplete")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("summary", {}).get("base_path") != base_path:
        raise RuntimeError("GitHub Pages staging build has the wrong base path")

    for child in DOCS_ROOT.iterdir():
        if child.is_dir() and child != STAGE:
            shutil.rmtree(child)
    for child in STAGE.iterdir():
        target = DOCS_ROOT / child.name
        if child.is_dir():
            shutil.copytree(child, target, dirs_exist_ok=True, copy_function=shutil.copy2)
        else:
            shutil.copy2(child, target)
    shutil.rmtree(STAGE)
    (DOCS_ROOT / ".nojekyll").write_text("\n", encoding="utf-8")
    # Compatibility for previously shared `/CVClass/index` URLs. The canonical
    # Pages entry remains `/CVClass/`.
    alias = DOCS_ROOT / "index" / "index.html"
    alias.parent.mkdir(parents=True, exist_ok=True)
    canonical = (base_path or "") + "/"
    alias.write_text(
        "<!doctype html><meta charset=\"utf-8\">"
        f"<link rel=\"canonical\" href=\"{canonical}\">"
        f"<meta http-equiv=\"refresh\" content=\"0;url={canonical}\">"
        f"<script>location.replace({json.dumps(canonical)})</script>"
        f"<a href=\"{canonical}\">进入 CVClass</a>\n",
        encoding="utf-8",
        newline="\n",
    )

    files = [path for path in DOCS_ROOT.rglob("*") if path.is_file()]
    oversized = [path for path in files if path.stat().st_size >= MAX_FILE_BYTES]
    total = sum(path.stat().st_size for path in files)
    if oversized:
        names = ", ".join(path.relative_to(DOCS_ROOT).as_posix() for path in oversized)
        raise RuntimeError(f"GitHub 100 MiB file limit exceeded: {names}")
    if total >= MAX_SITE_BYTES:
        raise RuntimeError(f"GitHub Pages 1 GiB site limit exceeded: {total} bytes")
    return {"files": len(files), "bytes": total, "base_path": base_path}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-path", default="/CVClass")
    args = parser.parse_args()
    base_path = "/" + args.base_path.strip("/") if args.base_path.strip("/") else ""

    no_models = DOCS_ROOT / ".github-pages-no-sdxs-models"
    subprocess.run(
        [
            sys.executable,
            str(DOCS_ROOT / "build_static.py"),
            "--base-path",
            base_path,
            "--sdxs-model-dir",
            str(no_models),
        ],
        check=True,
    )
    report = promote_stage(base_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
