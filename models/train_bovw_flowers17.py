from __future__ import annotations

import argparse
import json
import math
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.cluster import MiniBatchKMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, top_k_accuracy_score


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


@dataclass(frozen=True)
class FlowerImage:
    path: Path
    index: int
    label_index: int
    label: str
    within_class_index: int


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train a frontend-compatible BoVW classifier on Oxford 17 Flowers.")
    parser.add_argument("--data-dir", type=Path, default=root / "models" / "data" / "17flowers")
    parser.add_argument("--model-out", type=Path, default=root / "static" / "assets" / "data" / "vision_tasks" / "classification_lab" / "bovw_flowers17_model.json")
    parser.add_argument("--samples-out", type=Path, default=root / "static" / "assets" / "data" / "vision_tasks" / "classification_lab" / "flowers17_samples.json")
    parser.add_argument("--sample-img-dir", type=Path, default=root / "static" / "assets" / "img" / "flowers17")
    parser.add_argument("--vocab-size", type=int, default=128)
    parser.add_argument("--max-side", type=int, default=320)
    parser.add_argument("--patches-per-image", type=int, default=128)
    parser.add_argument("--random-state", type=int, default=42)
    return parser.parse_args()


def image_dir(data_dir: Path) -> Path:
    jpg_dir = data_dir / "jpg"
    return jpg_dir if jpg_dir.exists() else data_dir


def load_index(data_dir: Path) -> list[FlowerImage]:
    directory = image_dir(data_dir)
    files = sorted(directory.glob("image_*.jpg"))
    if len(files) != 1360:
        raise RuntimeError(f"Expected 1360 Oxford 17 Flowers images, found {len(files)} in {directory}")

    entries: list[FlowerImage] = []
    pattern = re.compile(r"image_(\d{4})\.jpg$", re.IGNORECASE)
    for path in files:
        match = pattern.search(path.name)
        if not match:
            continue
        image_index = int(match.group(1))
        if not 1 <= image_index <= 1360:
            raise RuntimeError(f"Image index out of range: {path.name}")
        label_index = (image_index - 1) // 80
        within_class_index = (image_index - 1) % 80
        entries.append(
            FlowerImage(
                path=path,
                index=image_index,
                label_index=label_index,
                label=LABELS[label_index],
                within_class_index=within_class_index,
            )
        )
    if len(entries) != 1360:
        raise RuntimeError(f"Expected 1360 parseable image_####.jpg files, found {len(entries)}")
    return sorted(entries, key=lambda item: item.index)


def split_entries(entries: list[FlowerImage]) -> tuple[list[FlowerImage], list[FlowerImage]]:
    train = [item for item in entries if item.within_class_index < 60]
    test = [item for item in entries if item.within_class_index >= 60]
    return train, test


def load_rgb(path: Path, max_side: int) -> np.ndarray:
    with Image.open(path) as image:
        image = image.convert("RGB")
        scale = min(1.0, max_side / max(image.size))
        if scale < 1.0:
            width = max(1, round(image.width * scale))
            height = max(1, round(image.height * scale))
            image = image.resize((width, height), Image.Resampling.BILINEAR)
        array = np.asarray(image, dtype=np.float32) / 255.0
    return array


def read_pixel(rgb: np.ndarray, x: float, y: float) -> tuple[float, float, float, float]:
    height, width, _ = rgb.shape
    px = int(np.clip(round(x), 0, width - 1))
    py = int(np.clip(round(y), 0, height - 1))
    r, g, b = rgb[py, px]
    luma = (0.299 * r) + (0.587 * g) + (0.114 * b)
    return float(r), float(g), float(b), float(luma)


def patch_descriptor(rgb: np.ndarray, px: float, py: float, patch_radius: int) -> np.ndarray:
    height, width, _ = rgb.shape
    step = max(1, round(patch_radius / 3))
    offsets = np.arange(-patch_radius, patch_radius + 1, step, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(offsets, offsets)
    xs = np.clip(np.rint(px + grid_x.ravel()).astype(np.int32), 0, width - 1)
    ys = np.clip(np.rint(py + grid_y.ravel()).astype(np.int32), 0, height - 1)

    pixels = rgb[ys, xs]
    r_values = pixels[:, 0]
    g_values = pixels[:, 1]
    b_values = pixels[:, 2]
    luma_values = (0.299 * r_values) + (0.587 * g_values) + (0.114 * b_values)

    left_xs = np.clip(xs - 1, 0, width - 1)
    right_xs = np.clip(xs + 1, 0, width - 1)
    up_ys = np.clip(ys - 1, 0, height - 1)
    down_ys = np.clip(ys + 1, 0, height - 1)
    left = (0.299 * rgb[ys, left_xs, 0]) + (0.587 * rgb[ys, left_xs, 1]) + (0.114 * rgb[ys, left_xs, 2])
    right = (0.299 * rgb[ys, right_xs, 0]) + (0.587 * rgb[ys, right_xs, 1]) + (0.114 * rgb[ys, right_xs, 2])
    up = (0.299 * rgb[up_ys, xs, 0]) + (0.587 * rgb[up_ys, xs, 1]) + (0.114 * rgb[up_ys, xs, 2])
    down = (0.299 * rgb[down_ys, xs, 0]) + (0.587 * rgb[down_ys, xs, 1]) + (0.114 * rgb[down_ys, xs, 2])
    gx = right - left
    gy = down - up

    sample_count = max(1, len(luma_values))
    mean = float(luma_values.mean())
    variance = float(((luma_values - mean) ** 2).mean())
    r_sum = float(r_values.sum())
    g_sum = float(g_values.sum())
    b_sum = float(b_values.sum())
    grad_sum = float(np.sqrt((gx * gx) + (gy * gy)).sum())
    vertical_sum = float(np.abs(gx).sum())
    horizontal_sum = float(np.abs(gy).sum())
    colorfulness = (max(r_sum, g_sum, b_sum) - min(r_sum, g_sum, b_sum)) / sample_count
    descriptor = np.array(
        [
            np.clip(mean, 0, 1),
            np.clip(math.sqrt(variance) * 2.4, 0, 1),
            np.clip((grad_sum / sample_count) * 3.2, 0, 1),
            np.clip(vertical_sum / max(0.001, vertical_sum + horizontal_sum), 0, 1),
            np.clip(r_sum / sample_count, 0, 1),
            np.clip(g_sum / sample_count, 0, 1),
            np.clip(b_sum / sample_count, 0, 1),
            np.clip(colorfulness * 2.2, 0, 1),
        ],
        dtype=np.float32,
    )
    return descriptor


def luma_image(rgb: np.ndarray) -> np.ndarray:
    return (0.299 * rgb[:, :, 0]) + (0.587 * rgb[:, :, 1]) + (0.114 * rgb[:, :, 2])


def sample_patch_points(rgb: np.ndarray, count: int, rng: np.random.Generator) -> list[tuple[float, float]]:
    height, width, _ = rgb.shape
    radius = max(4, round(min(width, height) * 0.018))
    stride = max(8, round(min(width, height) / 16))
    luma = luma_image(rgb)
    gy, gx = np.gradient(luma)
    magnitude = np.sqrt((gx * gx) + (gy * gy))

    candidates: list[tuple[float, float, float]] = []
    for y in range(radius, max(radius + 1, height - radius), stride):
        for x in range(radius, max(radius + 1, width - radius), stride):
            y0 = max(0, y - radius)
            y1 = min(height, y + radius + 1)
            x0 = max(0, x - radius)
            x1 = min(width, x + radius + 1)
            candidates.append((float(magnitude[y0:y1, x0:x1].mean()), float(x), float(y)))
    candidates.sort(reverse=True, key=lambda item: item[0])

    strong_count = min(len(candidates), round(count * 0.72))
    points = [(x, y) for _, x, y in candidates[:strong_count]]
    remaining = count - len(points)
    if remaining > 0:
        if candidates:
            pool = np.array([(x, y) for _, x, y in candidates], dtype=np.float32)
            choices = rng.choice(len(pool), size=remaining, replace=len(pool) < remaining)
            points.extend((float(pool[i, 0]), float(pool[i, 1])) for i in choices)
        else:
            points.extend(
                (
                    float(rng.integers(radius, max(radius + 1, width - radius))),
                    float(rng.integers(radius, max(radius + 1, height - radius))),
                )
                for _ in range(remaining)
            )
    return points[:count]


def image_descriptors(entry: FlowerImage, max_side: int, patches_per_image: int, rng: np.random.Generator) -> np.ndarray:
    rgb = load_rgb(entry.path, max_side)
    height, width, _ = rgb.shape
    radius = max(4, round(min(width, height) * 0.018))
    points = sample_patch_points(rgb, patches_per_image, rng)
    return np.vstack([patch_descriptor(rgb, x, y, radius) for x, y in points])


def histogram_for_descriptors(kmeans: MiniBatchKMeans, descriptors: np.ndarray, vocab_size: int) -> np.ndarray:
    words = kmeans.predict(descriptors)
    hist = np.bincount(words, minlength=vocab_size).astype(np.float32)
    total = hist.sum()
    if total > 0:
        hist /= total
    return np.sqrt(hist)


def build_histograms(
    entries: list[FlowerImage],
    kmeans: MiniBatchKMeans,
    max_side: int,
    patches_per_image: int,
    random_state: int,
) -> tuple[np.ndarray, np.ndarray]:
    histograms = []
    labels = []
    for entry in entries:
        rng = np.random.default_rng(random_state + entry.index)
        descriptors = image_descriptors(entry, max_side, patches_per_image, rng)
        histograms.append(histogram_for_descriptors(kmeans, descriptors, len(kmeans.cluster_centers_)))
        labels.append(entry.label_index)
    return np.vstack(histograms), np.asarray(labels, dtype=np.int64)


def round_nested(values: np.ndarray, digits: int = 6) -> list:
    return np.round(values.astype(np.float64), digits).tolist()


def copy_samples(entries: list[FlowerImage], sample_img_dir: Path, samples_out: Path) -> None:
    sample_img_dir.mkdir(parents=True, exist_ok=True)
    sample_items = []
    for label_index, label in enumerate(LABELS):
        label_entries = [item for item in entries if item.label_index == label_index][:2]
        for sample_index, entry in enumerate(label_entries, start=1):
            filename = f"{label}_{sample_index:02d}.jpg"
            target = sample_img_dir / filename
            shutil.copy2(entry.path, target)
            with Image.open(entry.path) as image:
                width, height = image.size
            sample_items.append(
                {
                    "id": f"flower_{label}_{sample_index:02d}",
                    "name": f"{label.replace('_', ' ').title()} · sample {sample_index:02d}",
                    "image": f"/static/assets/img/flowers17/{filename}",
                    "label": label,
                    "width": width,
                    "height": height,
                    "source": "Oxford 17 Category Flower Dataset",
                }
            )

    samples_out.parent.mkdir(parents=True, exist_ok=True)
    samples_out.write_text(
        json.dumps(
            {
                "defaultSample": "flower_daffodil_01",
                "task": "flowers17_bovw_classification",
                "engine": "trained_frontend_bovw",
                "samples": sample_items,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    entries = load_index(args.data_dir)
    train_entries, test_entries = split_entries(entries)
    print(f"Loaded {len(entries)} images: {len(train_entries)} train, {len(test_entries)} test")

    rng = np.random.default_rng(args.random_state)
    descriptor_batches = []
    for entry in train_entries:
        descriptor_batches.append(image_descriptors(entry, args.max_side, args.patches_per_image, rng))
    train_descriptors = np.vstack(descriptor_batches)
    print(f"Training codebook on {len(train_descriptors)} patch descriptors")

    kmeans = MiniBatchKMeans(
        n_clusters=args.vocab_size,
        random_state=args.random_state,
        batch_size=4096,
        n_init=3,
        max_iter=240,
        reassignment_ratio=0.01,
        verbose=0,
    )
    kmeans.fit(train_descriptors)

    x_train, y_train = build_histograms(train_entries, kmeans, args.max_side, args.patches_per_image, args.random_state)
    x_test, y_test = build_histograms(test_entries, kmeans, args.max_side, args.patches_per_image, args.random_state)

    classifier = LogisticRegression(
        multi_class="auto",
        max_iter=1500,
        class_weight="balanced",
        solver="lbfgs",
        C=3.0,
        random_state=args.random_state,
    )
    classifier.fit(x_train, y_train)

    train_pred = classifier.predict(x_train)
    test_pred = classifier.predict(x_test)
    test_scores = classifier.predict_proba(x_test)
    train_accuracy = float(accuracy_score(y_train, train_pred))
    test_accuracy = float(accuracy_score(y_test, test_pred))
    top3_accuracy = float(top_k_accuracy_score(y_test, test_scores, k=3, labels=np.arange(len(LABELS))))

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    model = {
        "model_type": "frontend_bovw_patch",
        "dataset": "Oxford 17 Category Flower Dataset",
        "descriptor": {
            "type": "patch_descriptor",
            "dimension": 8,
            "compatible_with": "classification_lab.patchDescriptor",
        },
        "vocab_size": args.vocab_size,
        "codebook": round_nested(kmeans.cluster_centers_),
        "histogram": {"normalization": "l1_sqrt"},
        "labels": LABELS,
        "classifier": {
            "type": "logistic_regression",
            "weights": round_nested(classifier.coef_),
            "bias": round_nested(classifier.intercept_),
        },
        "metrics": {
            "train_accuracy": round(train_accuracy, 6),
            "test_accuracy": round(test_accuracy, 6),
            "top3_accuracy": round(top3_accuracy, 6),
            "train_count": len(train_entries),
            "test_count": len(test_entries),
            "patches_per_image": args.patches_per_image,
            "split": "per_class_first_60_train_last_20_test",
            "random_state": args.random_state,
        },
    }
    args.model_out.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
    copy_samples(entries, args.sample_img_dir, args.samples_out)

    print(f"Saved model: {args.model_out}")
    print(f"Saved samples: {args.samples_out}")
    print(f"Copied sample images: {args.sample_img_dir}")
    print(f"train_accuracy={train_accuracy:.4f}")
    print(f"test_accuracy={test_accuracy:.4f}")
    print(f"top3_accuracy={top3_accuracy:.4f}")


if __name__ == "__main__":
    main()
