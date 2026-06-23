from __future__ import annotations

import argparse
import json
import random
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


LABELS = [
    "daffodil",
    "snowdrop",
    "lily_of_the_valley",
    "bluebell",
    "crocus",
    "iris",
    "tigerlily",
    "tulip",
    "fritillary",
    "sunflower",
    "daisy",
    "coltsfoot",
    "dandelion",
    "cowslip",
    "buttercup",
    "windflower",
    "pansy",
]

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


@dataclass(frozen=True)
class FlowerEntry:
    path: Path
    index: int
    label_index: int
    within_class_index: int


class Flowers17Dataset(Dataset):
    def __init__(self, entries: list[FlowerEntry], transform: transforms.Compose) -> None:
        self.entries = entries
        self.transform = transform

    def __len__(self) -> int:
        return len(self.entries)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        entry = self.entries[index]
        with Image.open(entry.path) as image:
            image = image.convert("RGB")
            return self.transform(image), entry.label_index


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Fine-tune a lightweight CNN on Oxford 17 Flowers and export ONNX.")
    parser.add_argument("--data", type=Path, default=root / "models" / "data" / "17flowers")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--model", choices=["squeezenet1_1", "mobilenet_v3_small", "mobilenet_v2"], default="squeezenet1_1")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--out-dir", type=Path, default=root / "static" / "assets" / "data" / "classification")
    return parser.parse_args()


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def image_dir(data_dir: Path) -> Path:
    jpg_dir = data_dir / "jpg"
    return jpg_dir if jpg_dir.exists() else data_dir


def load_entries(data_dir: Path) -> list[FlowerEntry]:
    directory = image_dir(data_dir)
    paths = sorted(directory.glob("image_*.jpg"))
    if len(paths) != 1360:
        raise RuntimeError(f"Expected 1360 images in {directory}, found {len(paths)}")
    pattern = re.compile(r"image_(\d{4})\.jpg$", re.IGNORECASE)
    entries: list[FlowerEntry] = []
    for path in paths:
        match = pattern.search(path.name)
        if not match:
            continue
        index = int(match.group(1))
        label_index = (index - 1) // 80
        within_class_index = (index - 1) % 80
        entries.append(FlowerEntry(path, index, label_index, within_class_index))
    if len(entries) != 1360:
        raise RuntimeError(f"Expected 1360 parseable image_####.jpg files, found {len(entries)}")
    return sorted(entries, key=lambda item: item.index)


def split_entries(entries: list[FlowerEntry]) -> tuple[list[FlowerEntry], list[FlowerEntry]]:
    train_entries = [entry for entry in entries if entry.within_class_index < 60]
    test_entries = [entry for entry in entries if entry.within_class_index >= 60]
    return train_entries, test_entries


def build_transforms() -> tuple[transforms.Compose, transforms.Compose]:
    train_tf = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.RandomResizedCrop(224, scale=(0.72, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.18, contrast=0.18, saturation=0.18, hue=0.03),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    eval_tf = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    return train_tf, eval_tf


def build_model(model_name: str, num_classes: int) -> nn.Module:
    if model_name == "squeezenet1_1":
        weights = models.SqueezeNet1_1_Weights.DEFAULT
        model = models.squeezenet1_1(weights=weights)
        model.classifier[1] = nn.Conv2d(512, num_classes, kernel_size=1)
        model.num_classes = num_classes
        return model
    if model_name == "mobilenet_v3_small":
        weights = models.MobileNet_V3_Small_Weights.DEFAULT
        model = models.mobilenet_v3_small(weights=weights)
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = nn.Linear(in_features, num_classes)
        return model
    if model_name == "mobilenet_v2":
        weights = models.MobileNet_V2_Weights.DEFAULT
        model = models.mobilenet_v2(weights=weights)
        in_features = model.classifier[-1].in_features
        model.classifier[-1] = nn.Linear(in_features, num_classes)
        return model
    raise ValueError(f"Unsupported model: {model_name}")


def accuracy(logits: torch.Tensor, labels: torch.Tensor, topk: int = 1) -> float:
    _, pred = logits.topk(topk, dim=1)
    correct = pred.eq(labels.view(-1, 1)).any(dim=1).float().sum().item()
    return correct / max(1, labels.numel())


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[float, float, float]:
    model.eval()
    total = 0
    correct1 = 0.0
    correct3 = 0.0
    loss_total = 0.0
    criterion = nn.CrossEntropyLoss()
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            batch = labels.numel()
            loss_total += loss.item() * batch
            correct1 += accuracy(logits, labels, 1) * batch
            correct3 += accuracy(logits, labels, 3) * batch
            total += batch
    return loss_total / max(1, total), correct1 / max(1, total), correct3 / max(1, total)


def export_onnx(model: nn.Module, out_path: Path, device: torch.device) -> None:
    model.eval()
    dummy = torch.randn(1, 3, 224, 224, device=device)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        out_path,
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=12,
    )


def write_frontend_metadata(out_dir: Path, model_name: str, metrics: dict[str, float]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "flowers17_classes.json").write_text(json.dumps(LABELS, ensure_ascii=False, indent=2), encoding="utf-8")
    config = {
        "available": True,
        "model_name": f"Flowers17 CNN ({model_name})",
        "model_kind": "flowers17",
        "model_url": "/static/assets/data/classification/flowers17_cnn.onnx",
        "labels_url": "/static/assets/data/classification/flowers17_classes.json",
        "input_size": 224,
        "input_layout": "NCHW",
        "mean": IMAGENET_MEAN,
        "std": IMAGENET_STD,
        "top_k": 5,
        "preprocess": "center_crop_resize_normalize_imagenet",
        "metrics": metrics,
    }
    (out_dir / "flowers17_cnn_config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    seed_everything(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    entries = load_entries(args.data)
    train_entries, test_entries = split_entries(entries)
    train_tf, eval_tf = build_transforms()
    train_ds = Flowers17Dataset(train_entries, train_tf)
    test_ds = Flowers17Dataset(test_entries, eval_tf)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=args.num_workers)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers)

    model = build_model(args.model, len(LABELS)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    best_state = None
    best_test_acc = -1.0
    for epoch in range(1, args.epochs + 1):
        model.train()
        total = 0
        running_loss = 0.0
        running_acc = 0.0
        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            batch = labels.numel()
            running_loss += loss.item() * batch
            running_acc += accuracy(logits.detach(), labels, 1) * batch
            total += batch
        train_loss = running_loss / max(1, total)
        train_acc = running_acc / max(1, total)
        test_loss, test_acc, test_top3 = evaluate(model, test_loader, device)
        print(
            f"epoch={epoch:02d} train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"test_loss={test_loss:.4f} test_acc={test_acc:.4f} top3={test_top3:.4f}"
        )
        if test_acc > best_test_acc:
            best_test_acc = test_acc
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
    train_loss, train_acc, train_top3 = evaluate(model, DataLoader(train_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers), device)
    test_loss, test_acc, test_top3 = evaluate(model, test_loader, device)
    metrics = {
        "train_accuracy": round(train_acc, 6),
        "train_top3_accuracy": round(train_top3, 6),
        "test_accuracy": round(test_acc, 6),
        "top3_accuracy": round(test_top3, 6),
        "train_loss": round(train_loss, 6),
        "test_loss": round(test_loss, 6),
        "epochs": args.epochs,
        "seed": args.seed,
        "model": args.model,
        "split": "per_class_first_60_train_last_20_test",
    }

    onnx_path = args.out_dir / "flowers17_cnn.onnx"
    export_onnx(model, onnx_path, device)
    write_frontend_metadata(args.out_dir, args.model, metrics)
    print(f"Saved ONNX: {onnx_path}")
    print(f"Saved classes: {args.out_dir / 'flowers17_classes.json'}")
    print(f"Saved config: {args.out_dir / 'flowers17_cnn_config.json'}")
    print(f"train_accuracy={train_acc:.4f}")
    print(f"test_accuracy={test_acc:.4f}")
    print(f"top3_accuracy={test_top3:.4f}")


if __name__ == "__main__":
    main()
