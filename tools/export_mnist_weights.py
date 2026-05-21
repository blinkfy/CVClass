from __future__ import annotations

from pathlib import Path

import numpy as np


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT_DIR / "models" / "numpy_mnist_cnn.npz"
TARGET_PATH = ROOT_DIR / "static" / "models" / "mnist_cnn_weights.json"
PARAM_KEYS = (
    "layer0_weights",
    "layer0_bias",
    "layer3_weights",
    "layer3_bias",
    "layer6_weights",
    "layer6_bias",
    "layer8_weights",
    "layer8_bias",
)


def format_number(value: float) -> str:
    text = f"{float(value):.6f}"
    return "0.000000" if text == "-0.000000" else text


def write_array(file, array: np.ndarray) -> None:
    values = np.round(array.astype(np.float32), 6)
    if values.ndim == 0:
        file.write(format_number(values.item()))
        return

    file.write("[")
    if values.ndim == 1:
        for index, value in enumerate(values):
            if index:
                file.write(",")
            file.write(format_number(value))
    else:
        for index, subarray in enumerate(values):
            if index:
                file.write(",")
            write_array(file, subarray)
    file.write("]")


def main() -> None:
    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"Model weights not found: {SOURCE_PATH}")

    data = np.load(SOURCE_PATH)
    missing = [key for key in PARAM_KEYS if key not in data.files]
    if missing:
        raise KeyError(f"Missing weight arrays: {', '.join(missing)}")

    TARGET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with TARGET_PATH.open("w", encoding="utf-8") as file:
        file.write("{")
        for index, key in enumerate(PARAM_KEYS):
            if index:
                file.write(",")
            file.write(f'"{key}":')
            write_array(file, data[key])
        file.write("}")

    print(f"Exported {len(PARAM_KEYS)} arrays to {TARGET_PATH}")


if __name__ == "__main__":
    main()
