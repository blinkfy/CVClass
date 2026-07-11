"""Export the SDXS CLIP text encoder to a browser-runnable ONNX model.

Run this with an environment that provides torch, transformers, safetensors and
onnx. The output is intentionally written beside externally mounted SDXS model
assets, never into the CVClass repository.
"""

from __future__ import annotations

import argparse
from pathlib import Path


def build_model(weights_path: Path):
    import torch
    from safetensors.torch import load_file
    from transformers import CLIPTextConfig, CLIPTextModel

    config = CLIPTextConfig(
        vocab_size=49408,
        hidden_size=768,
        intermediate_size=3072,
        projection_dim=768,
        num_hidden_layers=12,
        num_attention_heads=12,
        max_position_embeddings=77,
        hidden_act="quick_gelu",
        layer_norm_eps=1e-5,
        bos_token_id=49406,
        eos_token_id=49407,
        pad_token_id=1,
    )
    model = CLIPTextModel(config)
    missing, unexpected = model.load_state_dict(load_file(str(weights_path), device="cpu"), strict=False)
    if missing or unexpected:
        raise RuntimeError(f"SDXS text encoder 权重不匹配：missing={missing}, unexpected={unexpected}")
    model.eval()
    return model


def main():
    parser = argparse.ArgumentParser(description="导出 SDXS CLIP Text Encoder ONNX")
    parser.add_argument("--model-dir", required=True, type=Path, help="sdxs-512-dreamshaper 模型目录")
    parser.add_argument("--output", type=Path, help="输出 ONNX 路径，默认 text_encoder/model.onnx")
    parser.add_argument("--fp16", action="store_true", help="将权重转换为 FP16，同时保持输入/输出为 FP32")
    args = parser.parse_args()

    model_dir = args.model_dir.expanduser().resolve()
    weights_path = model_dir / "text_encoder" / "model.safetensors"
    default_name = "model.fp16.onnx" if args.fp16 else "model.onnx"
    output_path = (args.output or model_dir / "text_encoder" / default_name).expanduser().resolve()
    if not weights_path.is_file():
        raise FileNotFoundError(f"未找到文本编码权重：{weights_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    import onnx
    import torch

    model = build_model(weights_path)
    sample_input = torch.full((1, 77), 49407, dtype=torch.long)
    sample_input[0, 0] = 49406
    torch.onnx.export(
        model,
        (sample_input,),
        str(output_path),
        input_names=["input_ids"],
        output_names=["last_hidden_state"],
        opset_version=17,
        do_constant_folding=True,
    )
    if args.fp16:
        from onnxconverter_common import float16

        model_onnx = onnx.load(str(output_path))
        model_onnx = float16.convert_float_to_float16(
            model_onnx,
            keep_io_types=True,
            disable_shape_infer=True,
        )
        onnx.save(model_onnx, str(output_path))
    onnx.checker.check_model(str(output_path))
    print(f"已导出浏览器端 Text Encoder：{output_path}（{output_path.stat().st_size} bytes）")


if __name__ == "__main__":
    main()
