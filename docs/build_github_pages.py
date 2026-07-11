"""Build and promote the GitHub Pages edition into docs/.

Large SDXS ONNX files remain outside GitHub Pages. When a public Hugging Face
repository is supplied, the browser downloads them directly from that pinned
revision; otherwise the Diffusion lesson uses its explicit teaching mode.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote


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
    parser.add_argument(
        "--sdxs-hf-repo",
        default="",
        help="Public Hugging Face model repo containing the browser ONNX bundle, e.g. blinkfy/CVClass-SDXS-ONNX.",
    )
    parser.add_argument(
        "--sdxs-hf-revision",
        default="main",
        help="Hugging Face branch, tag, or preferably immutable commit SHA (default: main).",
    )
    parser.add_argument(
        "--sdxs-remote-base-url",
        default="",
        help="Advanced: direct public model directory URL (mutually exclusive with --sdxs-hf-repo).",
    )
    args = parser.parse_args()
    base_path = "/" + args.base_path.strip("/") if args.base_path.strip("/") else ""

    hf_repo = args.sdxs_hf_repo.strip().strip("/")
    hf_revision = args.sdxs_hf_revision.strip()
    valid_repo = re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*", hf_repo)
    if hf_repo and (not valid_repo or not hf_revision):
        parser.error("--sdxs-hf-repo must be namespace/name and revision must not be empty")
    remote_base_url = args.sdxs_remote_base_url.strip().rstrip("/")
    if hf_repo and remote_base_url:
        parser.error("Choose either --sdxs-hf-repo or --sdxs-remote-base-url, not both")
    if hf_repo:
        repo_path = "/".join(quote(part, safe="-._") for part in hf_repo.split("/"))
        revision_path = quote(hf_revision, safe="-._")
        remote_base_url = f"https://huggingface.co/{repo_path}/resolve/{revision_path}"

    no_models = DOCS_ROOT / ".github-pages-no-sdxs-models"
    command = [
        sys.executable,
        str(DOCS_ROOT / "build_static.py"),
        "--base-path",
        base_path,
        "--sdxs-model-dir",
        str(no_models),
    ]
    if remote_base_url:
        command.extend(("--sdxs-remote-base-url", remote_base_url))
    subprocess.run(command, check=True)
    report = promote_stage(base_path)
    report["sdxs_remote_base_url"] = remote_base_url
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
