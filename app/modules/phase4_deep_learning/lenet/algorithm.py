"""
LeNet-5 handwritten digit recognition model.
Pure NumPy: Conv2d -> Tanh -> AvgPool -> Conv2d -> Tanh -> AvgPool -> FCx3 -> Softmax.
Supports loading pre-trained weights and computing forward pass traces for visualization.
"""
import json
import os
import numpy as np


def _im2col(img_2d, k_h, k_w, stride=1):
    """Unfold 2D image sliding windows into column matrix (im2col) for efficient conv."""
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


def _matrix_slice(arr, max_rows=8, max_cols=8):
    """Return a viewable slice of a matrix."""
    a = np.asarray(arr, dtype=np.float64)
    if a.ndim == 1:
        a = a.reshape(1, -1)
    r, c = min(a.shape[0], max_rows), min(a.shape[1], max_cols)
    return a[:r, :c].round(6).tolist()


# ============================================================
#  Layer implementations
# ============================================================

class Conv2d:
    """2D convolutional layer."""
    def __init__(self, in_c, out_c, k_size, stride=1):
        self.in_c, self.out_c, self.k_size, self.stride = in_c, out_c, k_size, stride
        rng = np.random.default_rng(42)
        scale = np.sqrt(2.0 / (in_c * k_size * k_size))
        self.W = rng.normal(0, scale, (out_c, in_c, k_size, k_size)).astype(np.float32)
        self.b = np.zeros(out_c, dtype=np.float32)

    def forward(self, x):
        c_in, h, w = x.shape
        out_h = (h - self.k_size) // self.stride + 1
        out_w = (w - self.k_size) // self.stride + 1
        out = np.zeros((self.out_c, out_h, out_w), dtype=np.float32)
        for oc in range(self.out_c):
            for ic in range(self.in_c):
                cols, oh, ow = _im2col(x[ic], self.k_size, self.k_size, self.stride)
                out[oc] += np.dot(self.W[oc, ic].ravel(), cols).reshape(oh, ow)
            out[oc] += self.b[oc]
        return out

    def load_weights(self, W_list, b_list):
        self.W = np.array(W_list, dtype=np.float32)
        self.b = np.array(b_list, dtype=np.float32)


class AvgPool2d:
    """Average pooling layer."""
    def __init__(self, k_size=2, stride=2):
        self.k_size, self.stride = k_size, stride

    def forward(self, x):
        c, h, w = x.shape
        out_h = (h - self.k_size) // self.stride + 1
        out_w = (w - self.k_size) // self.stride + 1
        out = np.zeros((c, out_h, out_w), dtype=np.float32)
        for ci in range(c):
            for i in range(out_h):
                for j in range(out_w):
                    si, sj = i * self.stride, j * self.stride
                    out[ci, i, j] = np.mean(x[ci, si:si+self.k_size, sj:sj+self.k_size])
        return out


class Linear:
    """Fully-connected layer."""
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


# ============================================================
#  LeNet-5 Model
# ============================================================

class LeNet5:
    """LeNet-5: classic 7-layer CNN (excluding input).
    Architecture: Input(1x28x28) -> Conv1(6@5x5) -> Tanh -> AvgPool(2x2)
    -> Conv2(16@5x5) -> Tanh -> AvgPool(2x2) -> FC(120) -> FC(84) -> FC(10) -> Softmax
    """
    def __init__(self):
        self.conv1 = Conv2d(1, 6, 5)          # 28->24, 1ch->6ch
        self.pool1 = AvgPool2d(2, 2)           # 24->12
        self.conv2 = Conv2d(6, 16, 5)          # 12->8, 6ch->16ch
        self.pool2 = AvgPool2d(2, 2)           # 8->4
        self.fc1   = Linear(16*4*4, 120)       # 256->120
        self.fc2   = Linear(120, 84)            # 120->84
        self.fc3   = Linear(84, 10)             # 84->10

    def forward(self, x):
        """x: (28,28) grayscale image [0,1], returns 10-class probabilities."""
        x = x[np.newaxis, :, :].astype(np.float32)
        x = self.conv1.forward(x); x = np.tanh(x)
        x = self.pool1.forward(x)
        x = self.conv2.forward(x); x = np.tanh(x)
        x = self.pool2.forward(x)
        x = x.ravel()
        x = self.fc1.forward(x); x = np.tanh(x)
        x = self.fc2.forward(x); x = np.tanh(x)
        x = self.fc3.forward(x)
        shifted = x - np.max(x)
        exp_x = np.exp(shifted)
        return exp_x / np.sum(exp_x)

    def load_weights(self, weights_dict):
        self.conv1.load_weights(weights_dict['conv1.W'], weights_dict['conv1.b'])
        self.conv2.load_weights(weights_dict['conv2.W'], weights_dict['conv2.b'])
        self.fc1.load_weights(weights_dict['fc1.W'], weights_dict['fc1.b'])
        self.fc2.load_weights(weights_dict['fc2.W'], weights_dict['fc2.b'])
        self.fc3.load_weights(weights_dict['fc3.W'], weights_dict['fc3.b'])


# Global model singleton
_model = None


def _find_weights_file():
    """Search for pre-trained weights file."""
    search_dirs = [
        os.path.join(os.path.dirname(__file__), '..', '..', 'static'),
        os.path.join(os.path.dirname(__file__), '..', '..', '..', 'static'),
    ]
    for d in search_dirs:
        p = os.path.normpath(os.path.join(d, 'lenet_weights.json'))
        if os.path.exists(p):
            return p
    return None


def get_model():
    """Get or initialize LeNet-5 model (singleton)."""
    global _model
    if _model is None:
        _model = LeNet5()
        w_path = _find_weights_file()
        if w_path:
            with open(w_path) as f:
                _model.load_weights(json.load(f))
        else:
            return None
    return _model


def predict(image_28x28):
    """Run inference on a 28x28 grayscale image [0,1]. Returns predicted digit and probabilities."""
    model = get_model()
    if model is None:
        return None
    probs = model.forward(image_28x28)
    predicted = int(np.argmax(probs))
    return {'prediction': predicted, 'probabilities': [round(float(p), 4) for p in probs]}


# ============================================================
#  Forward pass trace (for step-by-step visualization)
# ============================================================

def _conv2d_forward(x, W, b, stride=1):
    """Low-level conv forward (used in trace generation)."""
    oc, ic, k, _ = W.shape
    _, h, w = x.shape
    out_h = (h - k) // stride + 1
    out_w = (w - k) // stride + 1
    out = np.zeros((oc, out_h, out_w), dtype=np.float32)
    for oci in range(oc):
        for ici in range(ic):
            cols, oh, ow = _im2col(x[ici], k, k, stride)
            out[oci] += np.dot(W[oci, ici].ravel(), cols).reshape(oh, ow)
        out[oci] += b[oci]
    return out


def _avg_pool2d_forward(x, k_size=2, stride=2):
    """Low-level pool forward."""
    c, h, w = x.shape
    out_h = (h - k_size) // stride + 1
    out_w = (w - k_size) // stride + 1
    out = np.zeros((c, out_h, out_w), dtype=np.float32)
    for ci in range(c):
        for i in range(out_h):
            for j in range(out_w):
                si, sj = i * stride, j * stride
                out[ci, i, j] = np.mean(x[ci, si:si+k_size, sj:sj+k_size])
    return out


def compute_forward_trace(image_28x28, weights_dict):
    """Run complete forward pass and record every step for visualization."""
    W = weights_dict
    x = image_28x28[np.newaxis, :, :].astype(np.float32)
    steps = []

    # Step 1: Conv1
    c1 = _conv2d_forward(x, W['conv1.W'], W['conv1.b'])
    steps.append({
        'step': 1, 'title': 'Conv1 (1->6, 5x5)',
        'formula': 'Z1 = X * W1 + b1',
        'description': '6 filters of 5x5 on 28x28 input -> 6x24x24 output',
        'data': {
            'input_ch0': x[0].round(3).tolist(),
            'output_ch0': c1[0].round(4).tolist(),
            'kernels': [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)],
        },
    })

    # Step 2: Tanh after Conv1
    a1 = np.tanh(c1)
    steps.append({
        'step': 2, 'title': 'Tanh (after Conv1)', 'formula': 'a1 = tanh(Z1)',
        'description': f'Nonlinear activation, range (-1,1): [{a1.min():.4f}, {a1.max():.4f}]',
        'data': {'act_ch0': a1[0].round(3).tolist()},
    })

    # Step 3: Pool1
    p1 = _avg_pool2d_forward(a1)
    steps.append({
        'step': 3, 'title': 'Pool1 (2x2 Avg)', 'formula': 'P1 = AvgPool(a1)',
        'description': '2x2 average pooling, 24x24->12x12, keeps 6 channels',
        'data': {'output_ch0': p1[0].round(4).tolist()},
    })

    # Step 4: Conv2
    c2 = _conv2d_forward(p1, W['conv2.W'], W['conv2.b'])
    steps.append({
        'step': 4, 'title': 'Conv2 (6->16, 5x5)',
        'formula': 'Z2 = P1 * W2 + b2',
        'description': '16 filters of 5x5x6, 12x12->8x8 output',
        'data': {
            'output_ch0': c2[0].round(4).tolist(),
            'kernels': [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8,16))],
        },
    })

    # Step 5: Tanh after Conv2
    a2 = np.tanh(c2)
    steps.append({
        'step': 5, 'title': 'Tanh (after Conv2)', 'formula': 'a2 = tanh(Z2)',
        'description': f'16-channel activation, range: [{a2.min():.4f}, {a2.max():.4f}]',
        'data': {'act_ch0': a2[0].round(3).tolist()},
    })

    # Step 6: Pool2
    p2 = _avg_pool2d_forward(a2)
    steps.append({
        'step': 6, 'title': 'Pool2 (2x2 Avg)', 'formula': 'P2 = AvgPool(a2)',
        'description': '8x8->4x4, 16 channels each become 4x4 feature maps',
        'data': {'output_ch0': p2[0].round(3).tolist()},
    })

    # Step 7: Flatten
    flat = p2.ravel()
    steps.append({
        'step': 7, 'title': 'Flatten (16x4x4->256)',
        'formula': 'v = flatten(P2)',
        'description': 'Flatten 16-channel x 4x4 into 256-dim vector',
        'data': {'first16': [round(float(x), 4) for x in flat[:16]]},
    })

    # Step 8: FC1
    fc1 = np.dot(W['fc1.W'], flat) + W['fc1.b']
    steps.append({
        'step': 8, 'title': 'FC1 (256->120)',
        'formula': 'z1 = W1*v + b1',
        'description': f'120 neurons, {120*256} weight params',
        'data': {'W_slice': _matrix_slice(W['fc1.W'], 8, 16),
                 'output_vec': [round(float(x), 4) for x in fc1[:16]]},
    })

    # Step 9: Tanh FC1
    af1 = np.tanh(fc1)
    steps.append({
        'step': 9, 'title': 'Tanh (after FC1)', 'formula': 'a1_f = tanh(z1)',
        'data': {'act_vals': [round(float(x), 4) for x in af1[:20]]},
    })

    # Step 10: FC2
    fc2 = np.dot(W['fc2.W'], af1) + W['fc2.b']
    steps.append({
        'step': 10, 'title': 'FC2 (120->84)', 'formula': 'z2 = W2*a1_f + b2',
        'description': '84 neurons',
        'data': {'W_slice': _matrix_slice(W['fc2.W'], 8, 12),
                 'output_vec': [round(float(x), 4) for x in fc2[:16]]},
    })

    # Step 11: Tanh FC2
    af2 = np.tanh(fc2)
    steps.append({
        'step': 11, 'title': 'Tanh (after FC2)', 'formula': 'a2_f = tanh(z2)',
        'data': {'act_vals': [round(float(x), 4) for x in af2[:20]]},
    })

    # Step 12: FC3
    fc3 = np.dot(W['fc3.W'], af2) + W['fc3.b']
    steps.append({
        'step': 12, 'title': 'FC3 (84->10)', 'formula': 'z3 = W3*a2_f + b3',
        'description': 'Output 10 logits for digits 0-9',
        'data': {'W_slice': _matrix_slice(W['fc3.W'], 10, 8),
                 'logits': [round(float(x), 4) for x in fc3]},
    })

    # Step 13: Softmax
    shifted = fc3 - np.max(fc3)
    probs = np.exp(shifted) / np.sum(np.exp(shifted))
    predicted = int(np.argmax(probs))
    steps.append({
        'step': 13, 'title': 'Softmax', 'formula': 'y_i = exp(z_i) / sum_j exp(z_j)',
        'description': 'Convert logits to probability distribution over digits 0-9',
        'data': {'probs': [round(float(p), 4) for p in probs], 'predicted': predicted},
    })

    return {
        'sample': {'image': image_28x28.round(4).tolist(), 'predicted': predicted},
        'steps': steps,
    }
