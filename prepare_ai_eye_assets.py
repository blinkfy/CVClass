"""Prepare pretrained torchvision assets for the AI Eye page.

Examples:
    python prepare_ai_eye_assets.py --list
    python prepare_ai_eye_assets.py --model fasterrcnn_resnet50_fpn
    python prepare_ai_eye_assets.py --all

Weights are downloaded by torchvision into the torch hub checkpoint cache.
They are intentionally not committed to this repository.
"""
from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description='Prepare AI Eye pretrained model weights.')
    parser.add_argument('--list', action='store_true', help='List supported models and cache status.')
    parser.add_argument('--model', action='append', default=[], help='Download/preload one model id. Can be repeated.')
    parser.add_argument('--all', action='store_true', help='Download/preload all AI Eye models.')
    args = parser.parse_args()

    from app.modules.phase4_deep_learning.ai_eye.processor import download_model, list_models

    manifest = list_models()
    if args.list or (not args.model and not args.all):
        print('AI Eye model cache:', manifest['cache_dir'])
        for model_id, model in manifest['models'].items():
            mark = 'cached' if model['cached'] else 'missing'
            default = ' default' if model['default'] else ''
            size = f" ~{model['size_mb']}MB" if model.get('size_mb') else ''
            print(f"- {model_id:36s} {model['task']:9s} {mark:8s}{default}{size}")
        if args.list:
            return 0

    targets = list(manifest['models']) if args.all else args.model
    if not targets:
        return 0

    failed = []
    for model_id in targets:
        if model_id not in manifest['models']:
            print(f'[skip] unknown model: {model_id}', file=sys.stderr)
            failed.append(model_id)
            continue
        print(f'[load] {model_id}')
        try:
            info = download_model(model_id)
            print(f"  ok: {info['weights']} on {info['device']} ({info['parameters']:,} params)")
        except Exception as exc:
            print(f'  failed: {type(exc).__name__}: {exc}', file=sys.stderr)
            failed.append(model_id)

    if failed:
        print('Failed models:', ', '.join(failed), file=sys.stderr)
        return 1
    print('All requested AI Eye assets are ready.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
