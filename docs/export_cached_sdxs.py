"""Export the locally cached SDXS DreamShaper weights for browser ONNX use.

The source weights remain in the Hugging Face cache. Generated ONNX files are
written only to static_site/model-assets so the original Flask project remains
untouched. This is a one-time, resource-intensive conversion.
"""

from __future__ import annotations

import argparse
import gc
import os
from pathlib import Path


STATIC_ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT = STATIC_ROOT / "model-assets" / "sdxs-512-dreamshaper"


def find_snapshot(explicit: Path | None) -> Path:
    if explicit:
        snapshot = explicit.expanduser().resolve()
        if (snapshot / "unet" / "diffusion_pytorch_model.safetensors").is_file():
            return snapshot
        raise FileNotFoundError(f"指定目录不是完整 SDXS snapshot：{snapshot}")

    cache_home = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
    snapshots = (
        cache_home
        / "hub"
        / "models--IDKiro--sdxs-512-dreamshaper"
        / "snapshots"
    )
    candidates = sorted(snapshots.glob("*"), key=lambda path: path.stat().st_mtime, reverse=True)
    for candidate in candidates:
        if (
            (candidate / "unet" / "diffusion_pytorch_model.safetensors").is_file()
            and (candidate / "text_encoder" / "model.safetensors").is_file()
        ):
            return candidate.resolve()
    raise FileNotFoundError(f"未找到 Hugging Face SDXS 缓存：{snapshots}")


def convert_to_fp16(fp32_path: Path, output_path: Path) -> None:
    import onnx
    from onnxconverter_common import float16

    print(f"转换 FP16：{fp32_path.name}", flush=True)
    model = onnx.load(str(fp32_path), load_external_data=True)
    model = float16.convert_float_to_float16(
        model,
        keep_io_types=True,
        disable_shape_infer=True,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save_model(model, str(output_path))
    del model
    gc.collect()
    onnx.checker.check_model(str(output_path))
    fp32_path.unlink(missing_ok=True)
    print(f"已生成：{output_path}（{output_path.stat().st_size / 1024 / 1024:.1f} MiB）", flush=True)


def export_unet(snapshot: Path, output_root: Path, force: bool) -> None:
    import torch
    from diffusers import UNet2DConditionModel

    output_path = output_root / "unet" / "model.fp16.onnx"
    if output_path.is_file() and not force:
        print(f"复用已有文件：{output_path}", flush=True)
        return
    fp32_path = output_path.with_name("model.fp32.onnx")
    fp32_path.parent.mkdir(parents=True, exist_ok=True)
    fp32_path.unlink(missing_ok=True)

    class BrowserUNet(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, sample, timestep, encoder_hidden_states):
            return self.model(
                sample,
                timestep,
                encoder_hidden_states,
                return_dict=False,
            )[0]

    print("加载 Hugging Face SDXS UNet 参数...", flush=True)
    model = UNet2DConditionModel.from_pretrained(
        str(snapshot),
        subfolder="unet",
        local_files_only=True,
        low_cpu_mem_usage=False,
    )
    wrapper = BrowserUNet(model.eval())
    sample = torch.randn(1, 4, 64, 64, dtype=torch.float32)
    timestep = torch.tensor([999.0], dtype=torch.float32)
    hidden = torch.randn(1, 77, 768, dtype=torch.float32)
    print("导出 UNet FP32 ONNX 中间文件...", flush=True)
    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            (sample, timestep, hidden),
            str(fp32_path),
            input_names=["sample", "timestep", "encoder_hidden_states"],
            output_names=["out_sample"],
            opset_version=17,
            do_constant_folding=True,
        )
    del wrapper, model, sample, timestep, hidden
    gc.collect()
    convert_to_fp16(fp32_path, output_path)


def export_text_encoder(snapshot: Path, output_root: Path, force: bool) -> None:
    import torch
    from transformers import CLIPTextModel

    output_path = output_root / "text_encoder" / "model.fp16.onnx"
    if output_path.is_file() and not force:
        print(f"复用已有文件：{output_path}", flush=True)
        return
    fp32_path = output_path.with_name("model.fp32.onnx")
    fp32_path.parent.mkdir(parents=True, exist_ok=True)
    fp32_path.unlink(missing_ok=True)

    class BrowserTextEncoder(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, input_ids):
            return self.model(input_ids=input_ids, return_dict=False)[0]

    print("加载 Hugging Face SDXS CLIP Text Encoder 参数...", flush=True)
    model = CLIPTextModel.from_pretrained(
        str(snapshot / "text_encoder"),
        local_files_only=True,
        low_cpu_mem_usage=False,
    )
    wrapper = BrowserTextEncoder(model.eval())
    input_ids = torch.full((1, 77), 49407, dtype=torch.long)
    input_ids[0, 0] = 49406
    print("导出 Text Encoder FP32 ONNX 中间文件...", flush=True)
    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            (input_ids,),
            str(fp32_path),
            input_names=["input_ids"],
            output_names=["last_hidden_state"],
            opset_version=17,
            do_constant_folding=True,
        )
    del wrapper, model, input_ids
    gc.collect()
    convert_to_fp16(fp32_path, output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="Hugging Face snapshot 目录；默认自动发现")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    snapshot = find_snapshot(args.snapshot)
    output = args.output.expanduser().resolve()
    print(f"使用 SDXS 参数：{snapshot}", flush=True)
    export_unet(snapshot, output, args.force)
    export_text_encoder(snapshot, output, args.force)
    print("SDXS 浏览器 ONNX 转换完成。现在可运行 static_site/build_static.py。", flush=True)


if __name__ == "__main__":
    main()
