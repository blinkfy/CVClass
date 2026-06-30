"""LeNet-5 in pure NumPy — inference only."""
import json
import os
import numpy as np


def _im2col(img_2d, k_h, k_w, stride=1):
    h, w = img_2d.shape
    out_h = (h - k_h) // stride + 1
    out_w = (w - k_w) // stride + 1
    cols = np.zeros((k_h * k_w, out_h * out_w), dtype=np.float32)
    idx = 0
    for y in range(0, h - k_h + 1, stride):
        for x in range(0, w - k_w + 1, stride):
            cols[:, idx] = img_2d[y:y + k_h, x:x + k_w].ravel()
            idx += 1
    return cols, out_h, out_w


class Conv2d:
    def __init__(self, in_c, out_c, k_size, stride=1):
        self.in_c = in_c
        self.out_c = out_c
        self.k_size = k_size
        self.stride = stride
        rng = np.random.default_rng(42)
        scale = np.sqrt(2.0 / (in_c * k_size * k_size))
        self.W = rng.normal(0, scale, (out_c, in_c, k_size, k_size)).astype(np.float32)
        self.b = np.zeros(out_c, dtype=np.float32)

    def forward(self, x):
        # x: (C, H, W)
        c_in, h, w = x.shape
        out_h = (h - self.k_size) // self.stride + 1
        out_w = (w - self.k_size) // self.stride + 1
        out = np.zeros((self.out_c, out_h, out_w), dtype=np.float32)
        for oc in range(self.out_c):
            for ic in range(self.in_c):
                cols, oh, ow = _im2col(x[ic], self.k_size, self.k_size, self.stride)
                kernel_flat = self.W[oc, ic].ravel()
                conv = np.dot(kernel_flat, cols).reshape(oh, ow)
                out[oc] += conv
            out[oc] += self.b[oc]
        return out

    def load_weights(self, W_list, b_list):
        self.W = np.array(W_list, dtype=np.float32)
        self.b = np.array(b_list, dtype=np.float32)


class AvgPool2d:
    def __init__(self, k_size=2, stride=2):
        self.k_size = k_size
        self.stride = stride

    def forward(self, x):
        c, h, w = x.shape
        out_h = (h - self.k_size) // self.stride + 1
        out_w = (w - self.k_size) // self.stride + 1
        out = np.zeros((c, out_h, out_w), dtype=np.float32)
        for ci in range(c):
            for i in range(out_h):
                for j in range(out_w):
                    si = i * self.stride
                    sj = j * self.stride
                    out[ci, i, j] = np.mean(x[ci, si:si + self.k_size, sj:sj + self.k_size])
        return out


class Linear:
    def __init__(self, in_features, out_features):
        rng = np.random.default_rng(42)
        scale = np.sqrt(2.0 / in_features)
        self.W = rng.normal(0, scale, (out_features, in_features)).astype(np.float32)
        self.b = np.zeros(out_features, dtype=np.float32)

    def forward(self, x):
        return np.dot(self.W, x) + self.b

    def load_weights(self, W_list, b_list):
        self.W = np.array(W_list, dtype=np.float32)
        self.b = np.array(b_list, dtype=np.float32)


class LeNet5:
    def __init__(self):
        self.conv1 = Conv2d(1, 6, 5)       # 28x28 -> 24x24x6
        self.pool1 = AvgPool2d(2, 2)        # 24x24x6 -> 12x12x6
        self.conv2 = Conv2d(6, 16, 5)       # 12x12x6 -> 8x8x16
        self.pool2 = AvgPool2d(2, 2)        # 8x8x16 -> 4x4x16
        self.fc1 = Linear(16 * 4 * 4, 120)
        self.fc2 = Linear(120, 84)
        self.fc3 = Linear(84, 10)

    def forward(self, x):
        # x: (28, 28) grayscale image
        x = x[np.newaxis, :, :].astype(np.float32)  # (1, 28, 28)
        x = self.conv1.forward(x)
        x = np.tanh(x)
        x = self.pool1.forward(x)
        x = self.conv2.forward(x)
        x = np.tanh(x)
        x = self.pool2.forward(x)
        x = x.ravel()
        x = self.fc1.forward(x)
        x = np.tanh(x)
        x = self.fc2.forward(x)
        x = np.tanh(x)
        x = self.fc3.forward(x)
        # softmax
        shifted = x - np.max(x)
        exp_x = np.exp(shifted)
        return exp_x / np.sum(exp_x)

    def load_weights(self, weights_dict):
        self.conv1.load_weights(weights_dict['conv1.W'], weights_dict['conv1.b'])
        self.conv2.load_weights(weights_dict['conv2.W'], weights_dict['conv2.b'])
        self.fc1.load_weights(weights_dict['fc1.W'], weights_dict['fc1.b'])
        self.fc2.load_weights(weights_dict['fc2.W'], weights_dict['fc2.b'])
        self.fc3.load_weights(weights_dict['fc3.W'], weights_dict['fc3.b'])


# Global model instance — lazy loaded
_model = None


def _load_weights_file():
    paths = [
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'static', 'lenet_weights.json'),
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'lenet_weights.json'),
    ]
    for p in paths:
        p = os.path.normpath(p)
        if os.path.exists(p):
            with open(p) as f:
                return json.load(f)
    return None


def get_model():
    global _model
    if _model is None:
        _model = LeNet5()
        w = _load_weights_file()
        if w is not None:
            _model.load_weights(w)
        else:
            return None  # no trained weights available
    return _model


def predict(image_28x28):
    """image_28x28: (28, 28) float32 ndarray in [0, 1]"""
    model = get_model()
    if model is None:
        return None
    probs = model.forward(image_28x28)
    prediction = int(np.argmax(probs))
    return {
        'prediction': prediction,
        'probabilities': [round(float(p), 4) for p in probs],
    }
