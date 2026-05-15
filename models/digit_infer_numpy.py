from io import BytesIO
import base64
from pathlib import Path

import numpy as np
from PIL import Image


MODEL_PATH = Path(__file__).resolve().parent / "models" / "numpy_mnist_cnn.npz"
_MODEL = None
_LOAD_ERROR = None


def _conv2d_same(x, weights, bias):
    n, channels, height, width = x.shape
    out_channels, _, kernel_size, _ = weights.shape
    pad = kernel_size // 2
    padded = np.pad(x, ((0, 0), (0, 0), (pad, pad), (pad, pad)), mode="constant")
    out = np.zeros((n, out_channels, height, width), dtype=np.float64)

    for oc in range(out_channels):
        acc = np.zeros((n, height, width), dtype=np.float64)
        for ic in range(channels):
            for kh in range(kernel_size):
                for kw in range(kernel_size):
                    acc += padded[:, ic, kh:kh + height, kw:kw + width] * weights[oc, ic, kh, kw]
        out[:, oc] = acc + bias[oc]
    return out


def _relu(x):
    return np.maximum(x, 0)


def _max_pool2x2(x):
    n, channels, height, width = x.shape
    out_h = height // 2
    out_w = width // 2
    reshaped = x[:, :, :out_h * 2, :out_w * 2].reshape(n, channels, out_h, 2, out_w, 2)
    return reshaped.max(axis=(3, 5))


def _softmax(logits):
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exp_scores = np.exp(shifted)
    return exp_scores / np.sum(exp_scores, axis=1, keepdims=True)


class NumpyMnistCnn:
    def __init__(self, params):
        self.conv1_w = params["layer0_weights"]
        self.conv1_b = params["layer0_bias"]
        self.conv2_w = params["layer3_weights"]
        self.conv2_b = params["layer3_bias"]
        self.fc1_w = params["layer6_weights"]
        self.fc1_b = params["layer6_bias"]
        self.fc2_w = params["layer8_weights"]
        self.fc2_b = params["layer8_bias"]

    def predict_proba(self, x):
        x = _conv2d_same(x, self.conv1_w, self.conv1_b)
        x = _relu(x)
        x = _max_pool2x2(x)
        x = _conv2d_same(x, self.conv2_w, self.conv2_b)
        x = _relu(x)
        x = _max_pool2x2(x)
        x = x.reshape(x.shape[0], -1)
        x = _relu(x @ self.fc1_w + self.fc1_b)
        logits = x @ self.fc2_w + self.fc2_b
        return _softmax(logits)


def get_model_status():
    if not MODEL_PATH.exists():
        return False, f"未找到模型参数文件：{MODEL_PATH}"
    return True, "模型参数文件已就绪"


def _load_model():
    global _MODEL, _LOAD_ERROR
    if _MODEL is not None:
        return _MODEL
    if _LOAD_ERROR is not None:
        raise RuntimeError(_LOAD_ERROR)
    if not MODEL_PATH.exists():
        _LOAD_ERROR = f"未找到模型参数文件：{MODEL_PATH}"
        raise RuntimeError(_LOAD_ERROR)

    try:
        data = np.load(MODEL_PATH)
        required = {
            "layer0_weights", "layer0_bias",
            "layer3_weights", "layer3_bias",
            "layer6_weights", "layer6_bias",
            "layer8_weights", "layer8_bias",
        }
        missing = sorted(required.difference(data.files))
        if missing:
            raise RuntimeError(f"模型参数缺少字段：{', '.join(missing)}")
        _MODEL = NumpyMnistCnn(data)
        return _MODEL
    except Exception as error:
        _LOAD_ERROR = f"模型参数加载失败：{error}"
        raise RuntimeError(_LOAD_ERROR) from error


def _strip_data_url(image_data):
    if "," in image_data:
        return image_data.split(",", 1)[1]
    return image_data


def _image_to_gray_array(image):
    rgba = image.convert("RGBA")
    arr = np.asarray(rgba).astype(np.float32)
    alpha = arr[..., 3:4] / 255.0
    rgb = arr[..., :3] * alpha + 255.0 * (1.0 - alpha)
    gray = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    return gray


def _array_to_data_url(arr_0_1):
    image = Image.fromarray(np.uint8(np.clip(arr_0_1, 0, 1) * 255), mode="L")
    image = image.resize((140, 140), Image.Resampling.NEAREST)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def preprocess_canvas_image(image_data):
    if not image_data:
        raise ValueError("请先在画布中书写数字")

    try:
        raw = base64.b64decode(_strip_data_url(image_data), validate=True)
        image = Image.open(BytesIO(raw))
        image.load()
    except Exception as error:
        raise ValueError("图片数据解析失败，请重新书写后再试") from error

    gray = _image_to_gray_array(image)
    if gray.size == 0:
        raise ValueError("图片为空，请重新书写数字")

    # MNIST-like input should end up as bright digits on a dark background.
    # If the source image is mostly light, invert it; otherwise keep it as-is.
    foreground = 255.0 - gray if float(gray.mean()) > 127.0 else gray
    foreground = foreground - foreground.min()
    if foreground.max() > 0:
        foreground = foreground / foreground.max()

    mask = foreground > 0.18
    if int(mask.sum()) < 10:
        raise ValueError("没有检测到有效数字，请在画布中央写大一点")

    rows, cols = np.where(mask)
    top, bottom = rows.min(), rows.max()
    left, right = cols.min(), cols.max()
    cropped = foreground[top:bottom + 1, left:right + 1]

    crop_image = Image.fromarray(np.uint8(cropped * 255), mode="L")
    width, height = crop_image.size
    scale = 20.0 / max(width, height)
    new_size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
    resized = crop_image.resize(new_size, Image.Resampling.LANCZOS)
    digit = np.asarray(resized).astype(np.float32) / 255.0

    canvas = np.zeros((28, 28), dtype=np.float32)
    y0 = (28 - digit.shape[0]) // 2
    x0 = (28 - digit.shape[1]) // 2
    canvas[y0:y0 + digit.shape[0], x0:x0 + digit.shape[1]] = digit

    mass = canvas.sum()
    if mass > 0:
        yy, xx = np.indices(canvas.shape)
        cy = float((yy * canvas).sum() / mass)
        cx = float((xx * canvas).sum() / mass)
        shift_y = int(round(13.5 - cy))
        shift_x = int(round(13.5 - cx))
        shifted = np.zeros_like(canvas)
        src_y0 = max(0, -shift_y)
        src_y1 = min(28, 28 - shift_y)
        src_x0 = max(0, -shift_x)
        src_x1 = min(28, 28 - shift_x)
        dst_y0 = max(0, shift_y)
        dst_y1 = min(28, 28 + shift_y)
        dst_x0 = max(0, shift_x)
        dst_x1 = min(28, 28 + shift_x)
        shifted[dst_y0:dst_y1, dst_x0:dst_x1] = canvas[src_y0:src_y1, src_x0:src_x1]
        canvas = shifted

    model_input = canvas.reshape(1, 1, 28, 28).astype(np.float64)
    return model_input, _array_to_data_url(canvas)


def predict_digit(image_data):
    model = _load_model()
    model_input, preview = preprocess_canvas_image(image_data)
    probabilities = model.predict_proba(model_input)[0]
    prediction = int(np.argmax(probabilities))
    confidence = float(probabilities[prediction])
    return {
        "prediction": prediction,
        "confidence": confidence,
        "probabilities": [float(value) for value in probabilities],
        "preprocessed_image": preview,
    }
