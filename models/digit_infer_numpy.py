from pathlib import Path
import numpy as np

from models.mycnn import MyCNN

MODEL_PATH = Path(__file__).resolve().parent / "numpy_mnist_cnn.npz"
_MODEL = None
_LOAD_ERROR = None


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
        model = MyCNN.model()
        model.load_params(MODEL_PATH)
        _MODEL = model
        return _MODEL
    except Exception as error:
        _LOAD_ERROR = f"模型参数加载失败：{error}"
        raise RuntimeError(_LOAD_ERROR) from error

def predict_digit(canvas_28x28):
    model = _load_model()
    canvas = np.asarray(canvas_28x28, dtype=np.float64)
    if canvas.shape != (28, 28):
        raise ValueError("输入必须是 28×28 的预处理图像")
    if not np.isfinite(canvas).all():
        raise ValueError("预处理图像包含非法数值")
    if canvas.min() < 0.0 or canvas.max() > 1.0:
        raise ValueError("预处理图像像素值必须在 0 到 1 之间")
    model_input = canvas.reshape(1, 1, 28, 28)
    probabilities = model.predict_proba(model_input)[0]
    prediction = int(np.argmax(probabilities))
    confidence = float(probabilities[prediction])
    return {
        "prediction": prediction,
        "confidence": confidence,
        "probabilities": [float(value) for value in probabilities],
    }
