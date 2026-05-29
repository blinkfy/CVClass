import argparse
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

from ted import TED


def clean_state_dict_keys(state_dict):
    """
    兼容 DataParallel / 训练脚本保存时附加的 module. 前缀。
    """
    cleaned = {}

    for key, value in state_dict.items():
        new_key = key

        if new_key.startswith("module."):
            new_key = new_key[len("module."):]

        if new_key.startswith("model."):
            new_key = new_key[len("model."):]

        cleaned[new_key] = value

    return cleaned


def extract_state_dict(checkpoint):
    """
    兼容常见 checkpoint 格式：
    1. 直接是 state_dict
    2. {"state_dict": ...}
    3. {"model": ...}
    4. {"model_state_dict": ...}
    """
    if not isinstance(checkpoint, dict):
        raise TypeError("checkpoint is not a dict. Please check the .pth file.")

    candidate_keys = [
        "state_dict",
        "model",
        "model_state_dict",
        "net",
        "network",
    ]

    for key in candidate_keys:
        if key in checkpoint and isinstance(checkpoint[key], dict):
            return checkpoint[key]

    # 如果 dict 的 value 大多是 tensor，说明它本身就是 state_dict
    tensor_like_count = sum(torch.is_tensor(v) for v in checkpoint.values())
    if tensor_like_count > 0:
        return checkpoint

    raise KeyError(
        "Cannot find state_dict in checkpoint. "
        f"Available keys: {list(checkpoint.keys())}"
    )


class TEEDDebugWrapper(nn.Module):
    """
    不修改 ted.py，直接包住已有 TED 模型。
    这个 wrapper 主动返回适合前端展示的中间结果：

    stage1_feature:
        Block1 的特征强度预览，已经压成 1 通道。
    stage2_feature:
        Block2 的特征强度预览，已经压成 1 通道。
    stage3_feature:
        Block3 的特征强度预览，已经压成 1 通道。
    side1:
        浅层 side output。
    side2:
        中层 side output。
    side3:
        深层 side output。
    fuse:
        多尺度融合输出。

    注意：
    - stage feature 不是最终边缘概率，只是为了页面上展示“不同深度特征响应”。
    - side/fuse 才更适合展示为边缘图。
    """

    def __init__(self, model: TED, output_size: int = 352, apply_sigmoid: bool = True):
        super().__init__()
        self.model = model
        self.output_size = output_size
        self.apply_sigmoid = apply_sigmoid

    def _feature_preview(self, x):
        """
        将多通道 feature map 压成 1 通道，便于前端显示。
        这里不做 min-max 归一化，前端显示时再归一化。
        """
        x = torch.mean(torch.abs(x), dim=1, keepdim=True)
        x = F.interpolate(
            x,
            size=(self.output_size, self.output_size),
            mode="bilinear",
            align_corners=False,
        )
        return x

    def _edge_output(self, x):
        """
        TEED 原始输出通常是 logits。
        前端展示边缘概率时，直接导出 sigmoid 后的结果更方便。
        """
        if self.apply_sigmoid:
            return torch.sigmoid(x)
        return x

    def forward(self, x):
        m = self.model

        # ===== 以下流程复现 TED.forward() 的主体结构 =====

        # Block 1
        block_1 = m.block_1(x)
        block_1_side = m.side_1(block_1)

        # Block 2
        block_2 = m.block_2(block_1)
        block_2_down = m.maxpool(block_2)
        block_2_add = block_2_down + block_1_side

        # Block 3
        block_3_pre_dense = m.pre_dense_3(block_2_down)
        block_3, _ = m.dblock_3([block_2_add, block_3_pre_dense])

        # Side outputs
        out_1 = m.up_block_1(block_1)
        out_2 = m.up_block_2(block_2)
        out_3 = m.up_block_3(block_3)

        # Fusion
        block_cat = torch.cat([out_1, out_2, out_3], dim=1)
        fuse = m.block_cat(block_cat)

        # Feature previews
        stage1_feature = self._feature_preview(block_1)
        stage2_feature = self._feature_preview(block_2)
        stage3_feature = self._feature_preview(block_3)

        return (
            stage1_feature,
            stage2_feature,
            stage3_feature,
            self._edge_output(out_1),
            self._edge_output(out_2),
            self._edge_output(out_3),
            self._edge_output(fuse),
        )


def load_teed_model(checkpoint_path: str):
    model = TED()

    ckpt = torch.load(checkpoint_path, map_location="cpu")
    state_dict = extract_state_dict(ckpt)
    state_dict = clean_state_dict_keys(state_dict)

    try:
        model.load_state_dict(state_dict, strict=True)
        print("[OK] Loaded checkpoint with strict=True")
    except RuntimeError as exc:
        print("[WARN] strict=True failed. Retrying strict=False.")
        print(exc)
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        print("[WARN] Missing keys:", missing)
        print("[WARN] Unexpected keys:", unexpected)

    model.eval()
    return model


def export_onnx(
    checkpoint_path: str,
    output_path: str,
    image_size: int = 352,
    opset: int = 17,
):
    checkpoint_path = str(Path(checkpoint_path))
    output_path = str(Path(output_path))

    model = load_teed_model(checkpoint_path)
    debug_model = TEEDDebugWrapper(
        model=model,
        output_size=image_size,
        apply_sigmoid=True,
    )
    debug_model.eval()

    dummy = torch.randn(1, 3, image_size, image_size, dtype=torch.float32)

    output_names = [
        "stage1_feature",
        "stage2_feature",
        "stage3_feature",
        "side1",
        "side2",
        "side3",
        "fuse",
    ]

    with torch.no_grad():
        outputs = debug_model(dummy)
        print("[INFO] PyTorch output shapes:")
        for name, tensor in zip(output_names, outputs):
            print(f"  {name}: {tuple(tensor.shape)}")

    torch.onnx.export(
        debug_model,
        dummy,
        output_path,
        input_names=["input"],
        output_names=output_names,
        opset_version=opset,
        do_constant_folding=True,
    )

    print(f"[OK] Exported ONNX to: {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--checkpoint",
        type=str,
        default="checkpoints/BIPED/5/5_model.pth",
        help="Path to TEED checkpoint .pth",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="teed_debug_352.onnx",
        help="Output ONNX path",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=352,
        help="Fixed input size. Recommended: 256 or 352.",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version.",
    )

    args = parser.parse_args()

    export_onnx(
        checkpoint_path=args.checkpoint,
        output_path=args.output,
        image_size=args.size,
        opset=args.opset,
    )


if __name__ == "__main__":
    main()