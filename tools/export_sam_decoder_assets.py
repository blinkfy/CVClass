#!/usr/bin/env python3
"""Export SAM decoder assets for the classroom SAM page.

This script is intentionally offline-only. It is not imported by Flask and does
not add PyTorch or Segment Anything to the web runtime.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


SAMPLE_IDS = [
    "street_vehicle",
    "desktop_objects",
    "animal_subject",
    "medical_slice",
    "indoor_scene",
]


def parse_size(value: str) -> tuple[int, int]:
    width, height = value.lower().split("x", 1)
    return int(width), int(height)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def import_runtime(sam_repo: Path | None):
    if sam_repo:
        sys.path.insert(0, str(sam_repo.resolve()))
    try:
        import numpy as np
        import torch
        from PIL import Image
        from segment_anything import SamPredictor, sam_model_registry
        from segment_anything.utils.onnx import SamOnnxModel
    except ImportError as exc:
        raise SystemExit(
            "Missing offline export dependencies. Install torch, pillow, numpy, "
            "segment-anything, and optionally cairosvg for SVG rendering."
        ) from exc
    return np, torch, Image, SamPredictor, sam_model_registry, SamOnnxModel


def render_sample_image(source: Path, target: Path, size: tuple[int, int], image_module) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() == target.resolve():
        return
    if source.suffix.lower() == ".svg":
        try:
            import cairosvg
        except ImportError as exc:
            raise SystemExit("Install cairosvg to render SVG samples into PNG files.") from exc
        cairosvg.svg2png(
            url=str(source),
            write_to=str(target),
            output_width=size[0],
            output_height=size[1],
        )
        return

    image = image_module.open(source).convert("RGB")
    if image.size != size:
        image = image.resize(size, image_module.Resampling.LANCZOS)
    image.save(target)


def find_sample_source(source_dir: Path, sample_id: str) -> Path:
    for suffix in (".png", ".jpg", ".jpeg", ".svg"):
        source = source_dir / f"{sample_id}{suffix}"
        if source.exists():
            return source
    raise FileNotFoundError(f"No source image found for sample {sample_id} in {source_dir}")


def export_decoder_onnx(sam, onnx_model_cls, torch_module, output_path: Path, opset: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    onnx_model = onnx_model_cls(
        model=sam,
        return_single_mask=False,
        use_stability_score=False,
        return_extra_metrics=False,
    )
    embedding_size = sam.prompt_encoder.image_embedding_size
    embed_dim = sam.prompt_encoder.embed_dim
    mask_input_size = [value * 4 for value in embedding_size]
    dummy_inputs = {
        "image_embeddings": torch_module.randn(1, embed_dim, *embedding_size, dtype=torch_module.float),
        "point_coords": torch_module.randint(low=0, high=1024, size=(1, 5, 2), dtype=torch_module.float),
        "point_labels": torch_module.randint(low=0, high=4, size=(1, 5), dtype=torch_module.float),
        "mask_input": torch_module.randn(1, 1, *mask_input_size, dtype=torch_module.float),
        "has_mask_input": torch_module.tensor([1], dtype=torch_module.float),
        "orig_im_size": torch_module.tensor([1500, 2250], dtype=torch_module.float),
    }
    torch_module.onnx.export(
        onnx_model,
        tuple(dummy_inputs.values()),
        str(output_path),
        export_params=True,
        verbose=False,
        opset_version=opset,
        do_constant_folding=True,
        input_names=list(dummy_inputs.keys()),
        output_names=["masks", "iou_predictions", "low_res_masks"],
        dynamic_axes={
            "point_coords": {1: "num_points"},
            "point_labels": {1: "num_points"},
        },
    )


def generate_embedding(predictor, image_path: Path, target_path: Path, np_module, image_module, torch_module) -> list[int]:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    image = np_module.asarray(image_module.open(image_path).convert("RGB"))
    with torch_module.no_grad():
        predictor.set_image(image)
    features = predictor.features.detach().cpu().numpy().astype(np_module.float16)
    features.tofile(target_path)
    return list(features.shape)


def update_samples_json(samples_path: Path, raster_dir: Path, embedding_dir: Path, shapes: dict[str, list[int]]) -> None:
    data = load_json(samples_path)
    for sample in data.get("samples", []):
        sample_id = sample.get("id")
        if sample_id not in SAMPLE_IDS:
            continue
        sample["realImage"] = f"/static/assets/data/generative_multimodal/sam/real/{sample_id}.png"
        sample["embedding"] = f"/static/assets/data/generative_multimodal/sam/model/embeddings/{sample_id}.fp16.bin"
        sample["embeddingShape"] = shapes.get(sample_id, [1, 256, 64, 64])
        sample["embeddingDtype"] = "float16"
        sample["realInferenceReady"] = (
            (raster_dir / f"{sample_id}.png").exists()
            and (embedding_dir / f"{sample_id}.fp16.bin").exists()
        )
    write_json(samples_path, data)


def update_manifest(
    manifest_path: Path,
    model_path: Path,
    raster_dir: Path,
    embedding_dir: Path,
    shapes: dict[str, list[int]],
) -> None:
    manifest = load_json(manifest_path) if manifest_path.exists() else {}
    manifest.update(
        {
            "version": "generated-sam-decoder-assets",
            "modelName": "SAM ViT-B Mask Decoder",
            "modelUrl": "/static/assets/data/generative_multimodal/sam/model/sam_vit_b_mask_decoder.onnx",
            "modelAvailable": model_path.exists(),
            "defaultBackend": "wasm",
            "embeddingShape": [1, 256, 64, 64],
            "embeddingDtype": "float16",
            "maskInputShape": [1, 1, 256, 256],
            "inputs": {
                "image_embeddings": "image_embeddings",
                "point_coords": "point_coords",
                "point_labels": "point_labels",
                "mask_input": "mask_input",
                "has_mask_input": "has_mask_input",
                "orig_im_size": "orig_im_size",
            },
            "outputs": {
                "masks": "masks",
                "iou_predictions": "iou_predictions",
                "low_res_masks": "low_res_masks",
            },
            "samples": {},
        }
    )
    for sample_id in SAMPLE_IDS:
        manifest["samples"][sample_id] = {
            "image": f"/static/assets/data/generative_multimodal/sam/real/{sample_id}.png",
            "embedding": f"/static/assets/data/generative_multimodal/sam/model/embeddings/{sample_id}.fp16.bin",
            "embeddingShape": shapes.get(sample_id, [1, 256, 64, 64]),
            "embeddingDtype": "float16",
            "embeddingAvailable": (embedding_dir / f"{sample_id}.fp16.bin").exists(),
        }
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, help="Path to sam_vit_b_01ec64.pth or a compatible SAM checkpoint.")
    parser.add_argument("--model-type", default="vit_b", choices=["vit_b", "vit_l", "vit_h"])
    parser.add_argument("--sam-repo", type=Path, help="Optional local clone of facebookresearch/segment-anything.")
    parser.add_argument("--samples-json", type=Path, default=Path("static/assets/data/generative_multimodal/sam_samples.json"))
    parser.add_argument("--source-image-dir", type=Path, default=Path("static/assets/data/generative_multimodal/sam"))
    parser.add_argument("--raster-dir", type=Path, default=Path("static/assets/data/generative_multimodal/sam/real"))
    parser.add_argument("--output-dir", type=Path, default=Path("static/assets/data/generative_multimodal/sam/model"))
    parser.add_argument("--image-size", default="640x420")
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--skip-onnx", action="store_true")
    parser.add_argument("--update-samples", action="store_true")
    args = parser.parse_args()

    np_module, torch_module, image_module, predictor_cls, registry, onnx_model_cls = import_runtime(args.sam_repo)
    size = parse_size(args.image_size)
    output_dir = args.output_dir
    embedding_dir = output_dir / "embeddings"
    model_path = output_dir / "sam_vit_b_mask_decoder.onnx"
    manifest_path = output_dir / "sam_model_manifest.json"

    sam = registry[args.model_type](checkpoint=args.checkpoint)
    sam.eval()
    predictor = predictor_cls(sam)

    if not args.skip_onnx:
        export_decoder_onnx(sam, onnx_model_cls, torch_module, model_path, args.opset)

    shapes: dict[str, list[int]] = {}
    for sample_id in SAMPLE_IDS:
        source = find_sample_source(args.source_image_dir, sample_id)
        raster = args.raster_dir / f"{sample_id}.png"
        render_sample_image(source, raster, size, image_module)
        shapes[sample_id] = generate_embedding(
            predictor,
            raster,
            embedding_dir / f"{sample_id}.fp16.bin",
            np_module,
            image_module,
            torch_module,
        )

    update_manifest(manifest_path, model_path, args.raster_dir, embedding_dir, shapes)
    if args.update_samples:
        update_samples_json(args.samples_json, args.raster_dir, embedding_dir, shapes)

    print(f"Wrote SAM decoder assets to {output_dir}")


if __name__ == "__main__":
    main()
