"""Prepare formal foundation-model assets.

Examples:
    python prepare_foundation_assets.py --list
    python prepare_foundation_assets.py --model vit
    python prepare_foundation_assets.py --model detr --model clip
    python prepare_foundation_assets.py --sam-checkpoint models/sam_vit_b_01ec64.pth

Large weights are intentionally not committed to the repository.
"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.request


HF_MODELS = {
    'vit': ('google/vit-base-patch16-224', 'ViTForImageClassification', 'ViTImageProcessor'),
    'detr': ('facebook/detr-resnet-50', 'DetrForObjectDetection', 'DetrImageProcessor'),
    'clip': ('openai/clip-vit-base-patch32', 'CLIPModel', 'CLIPProcessor'),
}

SAM_URL = 'https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth'
SAM_DEFAULT = 'models/sam_vit_b_01ec64.pth'


def main() -> int:
    parser = argparse.ArgumentParser(description='Prepare ViT/DETR/CLIP/SAM assets.')
    parser.add_argument('--list', action='store_true', help='List formal foundation model assets.')
    parser.add_argument('--model', action='append', choices=sorted(HF_MODELS), default=[], help='Download/preload one HuggingFace model.')
    parser.add_argument('--all-hf', action='store_true', help='Download/preload ViT, DETR and CLIP.')
    parser.add_argument('--download-sam', action='store_true', help='Download SAM ViT-B checkpoint.')
    parser.add_argument('--sam-checkpoint', default=SAM_DEFAULT, help='SAM checkpoint destination path.')
    args = parser.parse_args()

    if args.list or (not args.model and not args.all_hf and not args.download_sam):
        print('Formal foundation models:')
        for key, (model_id, _, _) in HF_MODELS.items():
            print(f'- {key:5s} HuggingFace cache: {model_id}')
        print(f'- sam   local checkpoint: {args.sam_checkpoint}')
        print(f'        official URL: {SAM_URL}')
        if args.list:
            return 0

    targets = sorted(HF_MODELS) if args.all_hf else args.model
    failed = []
    for key in targets:
        try:
            preload_hf_model(key)
            print(f'[ok] {key}: {HF_MODELS[key][0]}')
        except Exception as exc:
            print(f'[failed] {key}: {type(exc).__name__}: {exc}', file=sys.stderr)
            failed.append(key)

    if args.download_sam:
        try:
            download_sam(args.sam_checkpoint)
            print(f'[ok] sam checkpoint: {args.sam_checkpoint}')
        except Exception as exc:
            print(f'[failed] sam: {type(exc).__name__}: {exc}', file=sys.stderr)
            failed.append('sam')

    return 1 if failed else 0


def preload_hf_model(key: str) -> None:
    from transformers import (
        CLIPModel,
        CLIPProcessor,
        DetrForObjectDetection,
        DetrImageProcessor,
        ViTForImageClassification,
        ViTImageProcessor,
    )

    model_id, model_cls_name, processor_cls_name = HF_MODELS[key]
    classes = {
        'CLIPModel': CLIPModel,
        'CLIPProcessor': CLIPProcessor,
        'DetrForObjectDetection': DetrForObjectDetection,
        'DetrImageProcessor': DetrImageProcessor,
        'ViTForImageClassification': ViTForImageClassification,
        'ViTImageProcessor': ViTImageProcessor,
    }
    classes[processor_cls_name].from_pretrained(model_id)
    classes[model_cls_name].from_pretrained(model_id)


def download_sam(dest: str) -> None:
    os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    tmp = dest + '.part'
    urllib.request.urlretrieve(SAM_URL, tmp)
    os.replace(tmp, dest)


if __name__ == '__main__':
    raise SystemExit(main())
