#!/usr/bin/env python3
"""Publish the browser-ready SDXS ONNX conversion to a public HF model repo."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

from huggingface_hub import HfApi


DEFAULT_SOURCE = Path(
    r"F:\projects\fentouxia\smartBin\device-simulator\models\sdxs-512-dreamshaper"
)
UPSTREAM_REPO = "IDKiro/sdxs-512-dreamshaper"
UPSTREAM_REVISION = "76f720262bb051da75666b22c902a78c8e16c763"
EXPECTED_FILES = {
    "unet/model.fp16.onnx": (
        689_988_794,
        "238b7b300bb0545222645669dbd1b345af2b31ea917a9ceb6dfd83c24e98256f",
    ),
    "text_encoder/model.fp16.onnx": (
        246_280_550,
        "af8b9ed5ae2a832d914996000b8bb1eb48c7e420e4d3da8666b8b2e9050556ab",
    ),
    "vae_decoder/model.fp16.onnx": (
        2_468_157,
        "60c78268e188011e6a73c452d03aaf6877a53f153eb91ca8265efc17c6b26fa0",
    ),
}
UPLOAD_PATTERNS = [
    "manifest.json",
    "unet/model.fp16.onnx",
    "text_encoder/model.fp16.onnx",
    "vae_decoder/model.fp16.onnx",
    "tokenizer/merges.txt",
    "tokenizer/vocab.json",
    "tokenizer/special_tokens_map.json",
    "tokenizer/tokenizer_config.json",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_bundle(source: Path) -> None:
    for relative, (expected_bytes, expected_hash) in EXPECTED_FILES.items():
        path = source / relative
        if not path.is_file():
            raise FileNotFoundError(f"缺少浏览器模型文件：{path}")
        if path.stat().st_size != expected_bytes:
            raise RuntimeError(f"文件大小与已验证的上游转换产物不一致：{path}")
        actual_hash = sha256(path)
        if actual_hash != expected_hash:
            raise RuntimeError(f"SHA-256 与已验证的上游转换产物不一致：{path}")
    for relative in UPLOAD_PATTERNS:
        if not (source / relative).is_file():
            raise FileNotFoundError(f"缺少需要上传的文件：{source / relative}")


def model_card(repo_id: str) -> bytes:
    hashes = "\n".join(
        f"- `{name}`: `{digest}`" for name, (_, digest) in EXPECTED_FILES.items()
    )
    text = f"""---
license: openrail++
base_model: {UPSTREAM_REPO}
tags:
- onnx
- webgpu
- stable-diffusion
- sdxs
---

# CVClass SDXS-512 DreamShaper ONNX

这是 [{UPSTREAM_REPO}](https://huggingface.co/{UPSTREAM_REPO}) 的浏览器推理转换产物，
上游固定版本为 `{UPSTREAM_REVISION}`。模型内容未经再训练；仅导出为 ONNX FP16，
用于 CVClass 的 ONNX Runtime Web / WebGPU 一步文生图演示。

公开仓库用于匿名浏览器跨域下载，不包含访问令牌。请同时遵守上游 OpenRAIL++ 许可证。

## 文件校验

{hashes}

目标仓库：`{repo_id}`
"""
    return text.encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-id", default="blinkfy/CVClass-SDXS-ONNX")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()

    api = HfApi()
    account = api.whoami()
    access_token = account.get("auth", {}).get("accessToken", {})
    if access_token.get("role") == "read":
        raise RuntimeError(
            "当前 Hugging Face token 只有 read 权限。请创建 write token，执行 `hf auth login` 后重试。"
        )

    source = args.source.expanduser().resolve()
    verify_bundle(source)

    api.create_repo(args.repo_id, repo_type="model", private=False, exist_ok=True)
    api.upload_large_folder(
        repo_id=args.repo_id,
        repo_type="model",
        folder_path=source,
        allow_patterns=UPLOAD_PATTERNS,
        num_workers=4,
        print_report_every=30,
    )
    api.upload_file(
        repo_id=args.repo_id,
        repo_type="model",
        path_in_repo="README.md",
        path_or_fileobj=io.BytesIO(model_card(args.repo_id)),
        commit_message="Document upstream SDXS ONNX conversion",
    )
    revision = api.repo_info(args.repo_id, repo_type="model").sha
    remote_base_url = f"https://huggingface.co/{args.repo_id}/resolve/{revision}"
    result = {
        "repo_url": f"https://huggingface.co/{args.repo_id}",
        "revision": revision,
        "remote_base_url": remote_base_url,
        "next_command": (
            "python docs/build_github_pages.py --base-path /CVClass "
            f"--sdxs-hf-repo {args.repo_id} --sdxs-hf-revision {revision}"
        ),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
