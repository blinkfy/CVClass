#!/usr/bin/env python3
"""Build an isolated, deployable static edition of CVClass.

Only ``static_site/site`` is replaced. Source files in the parent project are
read at build time and are never modified.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


STATIC_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = STATIC_ROOT.parent
OUTPUT_ROOT = (STATIC_ROOT / "site").resolve()
AI_SOURCE = STATIC_ROOT / "static_ai_assistant.js"
OPTIONAL_MODEL_ROOT = STATIC_ROOT / "model-assets" / "sdxs-512-dreamshaper"

EDGE_MODES = ("compare", "kernel", "canny", "teed", "applications")
FEATURE_MODES = ("compare", "corner", "sift", "matching", "panorama")
FEATURE_ALIASES = ("harris", "sift_scale", "sift_descriptor")
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".md", ".txt", ".svg"}
SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r'(?i)["\']api[_-]?key["\']\s*:\s*["\'](?!YOUR_|<|\$\{)[^"\']{12,}["\']'),
)
RUNTIME_ASSETS = (
    "static/vendor/onnxruntime-web/ort.min.js",
    "static/vendor/onnxruntime-web/ort.webgpu.bundle.min.mjs",
    "static/vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm",
    "static/assets/data/classification/flowers17_cnn.onnx",
    "static/assets/data/detection/yolo_detection.onnx",
    "static/assets/data/instance/yolo11n-seg.onnx",
    "static/assets/data/segformer_b0_ade/model_quantized.onnx",
    "static/assets/data/segformer_b0_ade/model_fp16.onnx",
    "static/assets/data/human_pose/models/movenet/singlepose-thunder/model.json",
    "static/assets/data/human_pose/models/movenet/singlepose-thunder/movenet-thunder.bin",
    "static/assets/data/generative_multimodal/sam/model/sam_vit_b_mask_decoder.onnx",
    "static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/vae_decoder/model.fp16.onnx",
    "static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/tokenizer/vocab.json",
    "static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/tokenizer/merges.txt",
    "static/assets/examples/multiview/middlebury_cones/reconstruction.json",
    "static/assets/author/task319-hls/index.m3u8",
    "static/assets/author/task319-hls/segment_000.ts",
    "static/assets/author/fentouxia-hls/index.m3u8",
    "static/assets/author/fentouxia-hls/segment_000.ts",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-path",
        default="",
        help="Deployment prefix, e.g. /CVClass for a project site (default: root).",
    )
    parser.add_argument(
        "--sdxs-model-dir",
        type=Path,
        default=OPTIONAL_MODEL_ROOT,
        help=(
            "Directory containing unet/model.fp16.onnx and "
            "text_encoder/model.fp16.onnx (default: docs/model-assets/sdxs-512-dreamshaper)."
        ),
    )
    parser.add_argument(
        "--sdxs-remote-base-url",
        default="",
        help=(
            "Public HTTP(S) directory containing the browser SDXS ONNX bundle. "
            "Mutually exclusive with a complete --sdxs-model-dir."
        ),
    )
    return parser.parse_args()


def normalize_base_path(value: str) -> str:
    value = (value or "").strip()
    if not value or value == "/":
        return ""
    return "/" + value.strip("/")


def normalize_remote_model_url(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("--sdxs-remote-base-url must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password:
        raise ValueError("Credentials must not be embedded in --sdxs-remote-base-url")
    if parsed.query or parsed.fragment:
        raise ValueError("--sdxs-remote-base-url must not contain a query string or fragment")
    return value.rstrip("/")


def prepare_environment(base_path: str) -> None:
    # app.py reads these during import. Assignment is intentional: a stale shell
    # variable must not leak into a reproducible static build.
    os.environ["CVCLASS_PREFIX"] = base_path
    os.environ["SCRIPT_NAME"] = base_path
    sys.path.insert(0, str(PROJECT_ROOT))


def ensure_safe_output_path() -> None:
    if OUTPUT_ROOT.parent != STATIC_ROOT.resolve() or OUTPUT_ROOT.name != "site":
        raise RuntimeError(f"Refusing to replace unexpected output path: {OUTPUT_ROOT}")


def output_path_for(route: str) -> Path:
    clean = route.split("?", 1)[0].strip("/")
    if not clean:
        return OUTPUT_ROOT / "index.html"
    return OUTPUT_ROOT / clean / "index.html"


def collect_routes(app) -> list[str]:
    routes: set[str] = set()
    for rule in app.url_map.iter_rules():
        if "GET" not in rule.methods or rule.rule.startswith("/static/"):
            continue
        if not rule.arguments and rule.rule != "/api/docs/algorithm-principles":
            routes.add(rule.rule)
    routes.update(f"/edge-detection/{mode}" for mode in EDGE_MODES)
    routes.update(f"/feature-detection/{mode}" for mode in FEATURE_MODES)
    routes.update(f"/feature-detection/{mode}" for mode in FEATURE_ALIASES)
    return sorted(routes, key=lambda value: (value.count("/"), value))


def render_routes(app, routes: list[str]) -> list[dict[str, object]]:
    manifest: list[dict[str, object]] = []
    with app.test_client() as client:
        for route in routes:
            response = client.get(route, follow_redirects=True)
            if response.status_code != 200:
                raise RuntimeError(f"GET {route} returned {response.status_code}")
            if not response.content_type.startswith("text/html"):
                raise RuntimeError(f"GET {route} did not render HTML: {response.content_type}")
            destination = output_path_for(route)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(response.data)
            manifest.append(
                {
                    "route": route,
                    "output": destination.relative_to(OUTPUT_ROOT).as_posix(),
                    "bytes": len(response.data),
                }
            )
    return manifest


def copy_assets() -> None:
    source = PROJECT_ROOT / "static"
    target = OUTPUT_ROOT / "static"
    shutil.copytree(source, target, copy_function=shutil.copy2)
    if not AI_SOURCE.is_file():
        raise FileNotFoundError(f"Missing static AI source: {AI_SOURCE}")
    shutil.copy2(AI_SOURCE, target / "js" / "core" / "ai_assistant.js")


def overlay_optional_sdxs_models(model_root: Path) -> bool:
    model_root = model_root.expanduser().resolve()
    required = (
        model_root / "unet" / "model.fp16.onnx",
        model_root / "text_encoder" / "model.fp16.onnx",
    )
    present = [path.is_file() for path in required]
    if any(present) and not all(present):
        raise RuntimeError(
            "Optional SDXS model bundle is incomplete; provide both unet/model.fp16.onnx "
            "and text_encoder/model.fp16.onnx or remove the partial bundle."
        )
    if not all(present):
        return False
    minimum_sizes = {"unet": 500 * 1024 * 1024, "text_encoder": 200 * 1024 * 1024}
    for source in required:
        if source.stat().st_size < minimum_sizes[source.parent.name]:
            raise RuntimeError(f"SDXS ONNX file is unexpectedly small or incomplete: {source}")
    destination = (
        OUTPUT_ROOT
        / "static"
        / "assets"
        / "data"
        / "generative_multimodal"
        / "diffusion"
        / "sdxs-512-dreamshaper"
    )
    for source in required:
        target = destination / source.relative_to(model_root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    manifest = model_root / "manifest.json"
    if manifest.is_file():
        shutil.copy2(manifest, destination / "manifest.json")
    return True


def configure_sdxs_runtime_logging() -> None:
    path = OUTPUT_ROOT / "static" / "vendor" / "web-txt2img" / "adapters" / "sdxs.js"
    text = path.read_text(encoding="utf-8")
    marker = "this.ort.env.logLevel = 'warning';"
    if marker not in text:
        raise RuntimeError("Could not locate SDXS ONNX Runtime log-level setting")
    # ORT reports normal WebGPU/CPU shape-op assignment notices through
    # console.error at warning level. They are harmless but look like runtime
    # failures in DevTools, so production static output keeps real errors only.
    text = text.replace(marker, "this.ort.env.logLevel = 'error';", 1)
    options_marker = "            graphOptimizationLevel: 'all',"
    if options_marker not in text:
        raise RuntimeError("Could not locate SDXS ONNX Runtime session options")
    text = text.replace(
        options_marker,
        options_marker + "\n            logSeverityLevel: 3,",
        1,
    )
    path.write_text(text, encoding="utf-8", newline="\n")


def configure_remote_sdxs(remote_base_url: str) -> None:
    script_path = OUTPUT_ROOT / "static" / "js" / "generative_multimodal" / "diffusion_text_to_image.js"
    script = script_path.read_text(encoding="utf-8")
    local_marker = (
        'const MODEL_BASE_PATH = '
        '"/static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper";'
    )
    remote_marker = f"const MODEL_BASE_PATH = {json.dumps(remote_base_url)};"
    if local_marker not in script:
        raise RuntimeError("Could not locate the SDXS model base path")
    script = script.replace(local_marker, remote_marker, 1)
    app_url_marker = "function appUrl(path) {\n"
    if app_url_marker not in script:
        raise RuntimeError("Could not locate the prefix-aware appUrl helper")
    script = script.replace(
        app_url_marker,
        app_url_marker + '    if (/^https?:\\/\\//i.test(path)) return new URL(path).href;\n',
        1,
    )
    script_path.write_text(script, encoding="utf-8", newline="\n")

    html_path = OUTPUT_ROOT / "generative-multimodal" / "diffusion" / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = html.replace(
        "浏览器加载约 0.9 GB · UNet、VAE 与 CLIP 均在本机运行",
        "模型由 Hugging Face 托管 · 约 0.9 GB 按需下载 · 推理仍在浏览器本机运行",
    )
    html_path.write_text(html, encoding="utf-8", newline="\n")


def configure_diffusion_mode(models_bundled: bool, remote_base_url: str) -> None:
    if models_bundled:
        return
    if remote_base_url:
        configure_remote_sdxs(remote_base_url)
        return
    script_path = OUTPUT_ROOT / "static" / "js" / "generative_multimodal" / "diffusion.js"
    script = script_path.read_text(encoding="utf-8")
    marker = "        probeRealModelSupport();"
    replacement = """        state.realModel.supported = false;
        updateRealModelUi();
        setRealStatus("本静态包未包含可选的 0.9 GB SDXS 权重；教学动画与预设样例仍可完整使用。", { pct: 0 });
        renderRealPlaceholder("真实生成资源未打包", "如需启用，请按 static_site/README.md 放置 UNet 与 Text Encoder 模型后重新构建。");"""
    if marker not in script:
        raise RuntimeError("Could not locate Diffusion capability probe")
    script_path.write_text(script.replace(marker, replacement, 1), encoding="utf-8", newline="\n")

    html_path = OUTPUT_ROOT / "generative-multimodal" / "diffusion" / "index.html"
    html = html_path.read_text(encoding="utf-8")
    html = html.replace("真实推理 · SDXS / WebGPU", "教学演示 · 可选 SDXS 权重未打包")
    html = html.replace(
        "浏览器加载约 0.9 GB · UNet、VAE 与 CLIP 均在本机运行",
        "教学动画可直接使用 · 真实生成需另行放置可选模型权重",
    )
    html_path.write_text(html, encoding="utf-8", newline="\n")


def export_algorithm_document() -> None:
    source = PROJECT_ROOT / "docs" / "算法原理详解.md"
    if not source.is_file():
        raise FileNotFoundError(source)
    destination = OUTPUT_ROOT / "api" / "docs" / "algorithm-principles"
    destination.parent.mkdir(parents=True, exist_ok=True)
    text = source.read_text(encoding="utf-8")
    # The document is fetched from /api/docs/... and rendered under
    # /principles/. Relative `static/...` URLs would therefore resolve as
    # /principles/static/... and 404. Keep them root-relative so the page's
    # prefix-aware cvclassUrl() post-processing can also support --base-path.
    text = text.replace("](static/", "](/static/")
    image_refs = re.findall(r"!\[[^\]]*\]\((/static/[^)\s]+)\)", text)
    missing = [ref for ref in image_refs if not (PROJECT_ROOT / ref.lstrip("/")).is_file()]
    if missing:
        raise RuntimeError("Missing algorithm document images: " + ", ".join(sorted(set(missing))))
    destination.write_text(text, encoding="utf-8", newline="\n")


def disable_multiview_backend_fallback() -> None:
    path = OUTPUT_ROOT / "static" / "js" / "geometry_vision" / "multiview_reconstruction.js"
    text = path.read_text(encoding="utf-8")
    # 若源码中已不存在 Flask 后端回调，直接跳过
    if "fetchLiveRealData" not in text and "/api/multiview-reconstruction/real-run" not in text:
        return
    fn_start = text.find("    function fetchLiveRealData() {")
    fn_end = text.find("    function ensureRealData(render) {", fn_start)
    if fn_start < 0 or fn_end < 0:
        raise RuntimeError("Could not locate multiview live API helper")
    text = text[:fn_start] + text[fn_end:]

    catch_start = text.find("            .catch(() => fetchLiveRealData().then((data) => {")
    finally_start = text.find("            .finally(() => {", catch_start)
    if catch_start < 0 or finally_start < 0:
        raise RuntimeError("Could not locate multiview live API fallback")
    replacement = (
        "            .catch((error) => {\n"
        "                console.error(\"Static multiview preset failed to load\", error);\n"
        "                realState.error = \"静态重建数据加载失败，请确认 reconstruction.json 已部署。\";\n"
        "            })\n"
    )
    path.write_text(text[:catch_start] + replacement + text[finally_start:], encoding="utf-8", newline="\n")


def create_404() -> None:
    home = OUTPUT_ROOT / "index.html"
    shutil.copy2(home, OUTPUT_ROOT / "404.html")


def local_path_from_url(url: str, base_path: str) -> str | None:
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc or url.startswith(("data:", "mailto:", "javascript:", "#")):
        return None
    path = unquote(parsed.path)
    if base_path and path.startswith(base_path + "/"):
        path = path[len(base_path) :]
    return path


def validate_html_refs(base_path: str) -> tuple[int, list[str]]:
    checked = 0
    missing: set[str] = set()
    attr_re = re.compile(r'''(?:src|href|poster|data-[\w-]+(?:src|url))=["']([^"']+)["']''', re.I)
    for html_path in OUTPUT_ROOT.rglob("*.html"):
        html = html_path.read_text(encoding="utf-8")
        for raw in attr_re.findall(html):
            path = local_path_from_url(raw, base_path)
            if path is None or not path.startswith("/static/"):
                continue
            checked += 1
            target = OUTPUT_ROOT / path.lstrip("/")
            if raw.endswith("/"):
                exists = target.is_dir()
            else:
                exists = target.is_file()
            # These two optional MP4 fallbacks are absent in the source project;
            # HLS is the primary, fully bundled playback path.
            if not exists and not path.endswith(("/具身智能.mp4", "/垃圾分类.mp4")):
                missing.add(path)
    return checked, sorted(missing)


def validate_no_secrets() -> None:
    findings: list[str] = []
    for path in OUTPUT_ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(pattern.search(text) for pattern in SECRET_PATTERNS):
            findings.append(path.relative_to(OUTPUT_ROOT).as_posix())
    if findings:
        raise RuntimeError("Potential embedded secrets in static output: " + ", ".join(findings))


def validate_runtime_assets(models_bundled: bool) -> int:
    required = list(RUNTIME_ASSETS)
    if models_bundled:
        required.extend(
            (
                "static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/unet/model.fp16.onnx",
                "static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/text_encoder/model.fp16.onnx",
            )
        )
    missing = [relative for relative in required if not (OUTPUT_ROOT / relative).is_file()]
    if missing:
        raise RuntimeError("Missing declared runtime assets:\n" + "\n".join(missing))

    for playlist in OUTPUT_ROOT.rglob("*.m3u8"):
        for line in playlist.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and not (playlist.parent / line).is_file():
                raise RuntimeError(f"Missing HLS segment {line} referenced by {playlist}")
    return len(required)


def validate_static_contract(
    base_path: str,
    routes: list[str],
    models_bundled: bool,
    remote_base_url: str,
) -> dict[str, object]:
    for route in routes:
        if not output_path_for(route).is_file():
            raise RuntimeError(f"Missing rendered route: {route}")
    required = (
        OUTPUT_ROOT / "index.html",
        OUTPUT_ROOT / "404.html",
        OUTPUT_ROOT / "api" / "docs" / "algorithm-principles",
        OUTPUT_ROOT / "static" / "js" / "core" / "ai_assistant.js",
        OUTPUT_ROOT
        / "static"
        / "assets"
        / "examples"
        / "multiview"
        / "middlebury_cones"
        / "reconstruction.json",
    )
    for path in required:
        if not path.is_file():
            raise RuntimeError(f"Missing required output: {path}")

    checked_refs, missing_refs = validate_html_refs(base_path)
    if missing_refs:
        raise RuntimeError("Missing local HTML resources:\n" + "\n".join(missing_refs))
    validate_no_secrets()
    runtime_asset_count = validate_runtime_assets(models_bundled)

    diffusion_loader = (
        OUTPUT_ROOT / "static" / "js" / "generative_multimodal" / "diffusion_text_to_image.js"
    ).read_text(encoding="utf-8")
    if remote_base_url and remote_base_url not in diffusion_loader:
        raise RuntimeError("Remote SDXS base URL was not written to the browser loader")

    ai_text = (OUTPUT_ROOT / "static" / "js" / "core" / "ai_assistant.js").read_text(encoding="utf-8")
    for required_text in (
        "chat/completions",
        "cvclass.ai.baseUrl",
        "cvclass.ai.model",
        "cvclass.ai.apiKey",
        "cvclass.ai.sessionApiKey",
    ):
        if required_text not in ai_text:
            raise RuntimeError(f"Static AI contract missing {required_text}")

    multiview = (
        OUTPUT_ROOT / "static" / "js" / "geometry_vision" / "multiview_reconstruction.js"
    ).read_text(encoding="utf-8")
    if "/api/multiview-reconstruction/real-run" in multiview or "fetchLiveRealData" in multiview:
        raise RuntimeError("Multiview static bundle still references its Flask fallback")

    if models_bundled:
        sdxs_mode = "full-browser-inference"
    elif remote_base_url:
        sdxs_mode = "remote-browser-inference"
    else:
        sdxs_mode = "teaching-only-explicit-degradation"

    return {
        "routes": len(routes),
        "html_resource_refs_checked": checked_refs,
        "missing_required_refs": 0,
        "secret_findings": 0,
        "runtime_assets_checked": runtime_asset_count,
        "sdxs_mode": sdxs_mode,
        "sdxs_remote_host": urlsplit(remote_base_url).netloc if remote_base_url else "",
        "base_path": base_path,
    }


def main() -> int:
    args = parse_args()
    base_path = normalize_base_path(args.base_path)
    remote_base_url = normalize_remote_model_url(args.sdxs_remote_base_url)
    prepare_environment(base_path)
    ensure_safe_output_path()

    from app import app  # noqa: PLC0415 - environment must be set first

    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True)

    routes = collect_routes(app)
    manifest = render_routes(app, routes)
    copy_assets()
    models_bundled = overlay_optional_sdxs_models(args.sdxs_model_dir)
    if models_bundled and remote_base_url:
        raise RuntimeError(
            "Choose either a complete --sdxs-model-dir or --sdxs-remote-base-url, not both."
        )
    configure_sdxs_runtime_logging()
    export_algorithm_document()
    disable_multiview_backend_fallback()
    configure_diffusion_mode(models_bundled, remote_base_url)
    create_404()
    report = validate_static_contract(base_path, routes, models_bundled, remote_base_url)

    (OUTPUT_ROOT / "build-manifest.json").write_text(
        json.dumps({"summary": report, "pages": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
