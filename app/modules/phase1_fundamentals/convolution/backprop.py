"""Compute full forward+backward trace for LeNet-5 on a single MNIST image."""
import json
import gzip
import os
import struct
import sys
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))


def _load_mnist_sample(digit=None):
    """Load a single MNIST test image. If digit is specified, find first matching label."""
    test_img_path = os.path.join(PROJECT_ROOT, 'mnist_data', 't10k-images-idx3-ubyte.gz')
    test_lbl_path = os.path.join(PROJECT_ROOT, 'mnist_data', 't10k-labels-idx1-ubyte.gz')

    with gzip.open(test_img_path, 'rb') as f:
        _, n, rows, cols = struct.unpack('>IIII', f.read(16))
        images = np.frombuffer(f.read(), dtype=np.uint8).reshape(n, rows, cols)

    with gzip.open(test_lbl_path, 'rb') as f:
        _, n = struct.unpack('>II', f.read(8))
        labels = np.frombuffer(f.read(), dtype=np.uint8)

    if digit is not None:
        idxs = np.where(labels == digit)[0]
        if len(idxs) > 0:
            idx = int(idxs[0])
            return images[idx].astype(np.float32) / 255.0, int(labels[idx])

    return images[0].astype(np.float32) / 255.0, int(labels[0])


def _load_weights():
    weights_path = os.path.join(PROJECT_ROOT, 'static', 'lenet_weights.json')
    with open(weights_path, 'r') as f:
        raw = json.load(f)
    return {k: np.array(v, dtype=np.float32) for k, v in raw.items()}


def _random_weights():
    """Generate freshly initialized random weights (same scheme as training init)."""
    rng = np.random.default_rng()
    return {
        'conv1.W': rng.normal(0, 0.1, (6, 1, 5, 5)).astype(np.float32),
        'conv1.b': np.zeros(6, dtype=np.float32),
        'conv2.W': rng.normal(0, 0.1, (16, 6, 5, 5)).astype(np.float32),
        'conv2.b': np.zeros(16, dtype=np.float32),
        'fc1.W': rng.normal(0, 0.05, (120, 256)).astype(np.float32),
        'fc1.b': np.zeros(120, dtype=np.float32),
        'fc2.W': rng.normal(0, 0.05, (84, 120)).astype(np.float32),
        'fc2.b': np.zeros(84, dtype=np.float32),
        'fc3.W': rng.normal(0, 0.05, (10, 84)).astype(np.float32),
        'fc3.b': np.zeros(10, dtype=np.float32),
    }


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


def _conv2d_forward(x, W, b, stride=1):
    oc, ic, k, _ = W.shape
    _, h, w = x.shape
    out_h = (h - k) // stride + 1
    out_w = (w - k) // stride + 1
    out = np.zeros((oc, out_h, out_w), dtype=np.float32)
    for out_c in range(oc):
        for in_c in range(ic):
            cols, oh, ow = _im2col(x[in_c], k, k, stride)
            out[out_c] += np.dot(W[out_c, in_c].ravel(), cols).reshape(oh, ow)
        out[out_c] += b[out_c]
    return out


def _conv2d_backward(x, W, d_out, stride=1):
    oc, ic, k, _ = W.shape
    _, h, w = x.shape
    d_W = np.zeros_like(W)
    d_b = np.sum(d_out, axis=(1, 2)).astype(np.float32)
    d_x = np.zeros_like(x)
    for out_c in range(oc):
        for in_c in range(ic):
            for i in range(d_out.shape[1]):
                for j in range(d_out.shape[2]):
                    si = i * stride
                    sj = j * stride
                    grad = float(d_out[out_c, i, j])
                    patch = x[in_c, si:si + k, sj:sj + k]
                    d_W[out_c, in_c] += grad * patch
                    d_x[in_c, si:si + k, sj:sj + k] += grad * W[out_c, in_c]
    return d_x, d_W, d_b


def _avg_pool2d_forward(x, k_size=2, stride=2):
    c, h, w = x.shape
    out_h = (h - k_size) // stride + 1
    out_w = (w - k_size) // stride + 1
    out = np.zeros((c, out_h, out_w), dtype=np.float32)
    for ci in range(c):
        for i in range(out_h):
            for j in range(out_w):
                si = i * stride
                sj = j * stride
                out[ci, i, j] = np.mean(x[ci, si:si + k_size, sj:sj + k_size])
    return out


def _avg_pool2d_backward(d_out, input_shape, k_size=2, stride=2):
    c, _, _ = input_shape
    d_x = np.zeros(input_shape, dtype=np.float32)
    scale = 1.0 / (k_size * k_size)
    for ci in range(c):
        for i in range(d_out.shape[1]):
            for j in range(d_out.shape[2]):
                si = i * stride
                sj = j * stride
                d_x[ci, si:si + k_size, sj:sj + k_size] += d_out[ci, i, j] * scale
    return d_x


def _safe_stats(arr):
    """Return compact stats for any numpy array."""
    a = np.asarray(arr, dtype=np.float64).ravel()
    return {
        'shape': list(arr.shape),
        'min': round(float(a.min()), 6),
        'max': round(float(a.max()), 6),
        'mean': round(float(a.mean()), 6),
        'std': round(float(a.std()), 6),
        'l2': round(float(np.sqrt(np.sum(a ** 2))), 6),
        'first8': [round(float(x), 6) for x in a[:8]],
    }


def _matrix_slice(arr, max_rows=8, max_cols=8):
    """Return a viewable slice of a 2D array."""
    a = np.asarray(arr, dtype=np.float64)
    if a.ndim == 1:
        a = a.reshape(1, -1)
    r = min(a.shape[0], max_rows)
    c = min(a.shape[1], max_cols)
    return a[:r, :c].round(6).tolist()


def _visual(title, meaning, kind, data, shape, color_mode):
    return {
        'title': title,
        'meaning': meaning,
        'kind': kind,
        'data': data,
        'shape': shape,
        'color_mode': color_mode,
    }


def _grid(values, cols=4, precision=6):
    arr = np.asarray(values, dtype=np.float64).ravel()
    if arr.size == 0:
        return []
    width = max(1, min(cols, int(arr.size)))
    rows = []
    for start in range(0, int(arr.size), width):
        row = arr[start:start + width].round(precision).tolist()
        while len(row) < width:
            row.append(0.0)
        rows.append(row)
    return rows


def _mat(data, precision=6):
    return np.asarray(data, dtype=np.float64).round(precision).tolist()


def _first_present(*values):
    for value in values:
        if value is None:
            continue
        if isinstance(value, list) and len(value) == 0:
            continue
        return value
    return []


def _arch_layer(trace, arch_index):
    for layer in trace.get('architecture', []):
        if layer.get('arch_index') == arch_index:
            return layer
    return {}


def _prob_visuals(probs, target=None, predicted=None, logits=None):
    visuals = []
    if logits:
        visuals.append(_visual(
            'logits z[0:10]',
            'Softmax 之前的 10 个类别分数，按数字 0-9 排成 2×5。',
            'vector_grid',
            _grid(logits, 5, 6),
            '10 = 数字 0-9',
            'activation',
        ))
    if probs:
        extra = []
        if target is not None:
            extra.append(f'真实标签 {target}')
        if predicted is not None:
            extra.append(f'预测 {predicted}')
        suffix = '；' + '，'.join(extra) if extra else ''
        visuals.append(_visual(
            '概率分布 p[0:10]',
            '每个数字类别的 Softmax 概率，条越长表示置信度越高' + suffix + '。',
            'probability',
            probs,
            '10 = 数字 0-9',
            'probability',
        ))
    return visuals


def _attach_visuals(trace):
    """Attach explicit, human-readable visual specs to all forward/backward steps."""
    arch = {layer.get('arch_index'): layer for layer in trace.get('architecture', [])}
    has_forward_steps = bool(trace.get('forward_steps'))
    fw = trace.get('forward_steps') or trace.get('steps') or []
    bw = trace.get('steps') if has_forward_steps else []
    sample = trace.get('sample', {})

    def a_heat(idx):
        layer = arch.get(idx, {})
        return layer.get('heatmap') or (layer.get('channels') or [[]])[0] or layer.get('vector') or []

    def a_weight(idx):
        layer = arch.get(idx, {})
        return layer.get('heatmap') or layer.get('kernels') or layer.get('channels') or layer.get('vector') or []

    for s in fw:
        d = s.get('data', {})
        step = s.get('step')
        visuals = []
        if step == 1:
            visuals = [
                _visual('输入图像 X ch0', 'MNIST 输入灰度图，1 表示笔画更亮。', 'matrix', arch.get(0, {}).get('heatmap', sample.get('image', [])), '1×28×28 / ch0', 'activation'),
                _visual('Conv1 输出 Z1 ch0', '第 0 个卷积核在每个位置的响应，输出尺寸 24×24。', 'matrix', d.get('output_ch0', []), '6×24×24 / ch0', 'activation'),
            ]
        elif step == 2:
            prev = fw[0].get('data', {}) if len(fw) > 0 else {}
            visuals = [
                _visual('激活前 Z1 ch0', 'Conv1 第 0 通道进入 tanh 前的响应。', 'matrix', prev.get('output_ch0', []), '6×24×24 / ch0', 'activation'),
                _visual('激活后 A1 ch0', 'tanh(Z1) 后的第 0 通道，值被压到 (-1, 1)。', 'matrix', d.get('act_ch0', a_heat(2)), '6×24×24 / ch0', 'activation'),
            ]
        elif step == 3:
            visuals = [
                _visual('池化前 A1 ch0', 'Pool1 输入的第 0 通道特征图。', 'matrix', a_heat(2), '6×24×24 / ch0', 'activation'),
                _visual('池化后 P1 ch0', '2×2 平均池化后的第 0 通道，尺寸 12×12。', 'matrix', d.get('output_ch0', a_heat(3)), '6×12×12 / ch0', 'activation'),
            ]
        elif step == 4:
            visuals = [
                _visual('Conv2 输入 P1 ch0', 'Conv2 接收 Pool1 的第 0 通道作为 6 个输入通道之一。', 'matrix', a_heat(3), '6×12×12 / ch0', 'activation'),
                _visual('Conv2 输出 Z2 ch0', 'Conv2 第 0 个卷积核的输出响应，尺寸 8×8。', 'matrix', d.get('output_ch0', []), '16×8×8 / ch0', 'activation'),
            ]
        elif step == 5:
            prev = fw[3].get('data', {}) if len(fw) > 3 else {}
            visuals = [
                _visual('激活前 Z2 ch0', 'Conv2 第 0 通道进入 tanh 前的响应。', 'matrix', prev.get('output_ch0', []), '16×8×8 / ch0', 'activation'),
                _visual('激活后 A2 ch0', 'tanh(Z2) 后的第 0 通道。', 'matrix', d.get('act_ch0', a_heat(5)), '16×8×8 / ch0', 'activation'),
            ]
        elif step == 6:
            channels = d.get('output_channels') or arch.get(6, {}).get('channels') or []
            visuals = [
                _visual('池化前 A2 ch0', 'Pool2 输入的第 0 通道特征图，尺寸 8×8。', 'matrix', a_heat(5), '16×8×8 / ch0', 'activation'),
                _visual('池化后 P2 ch0', '2×2 平均池化后的第 0 通道，尺寸 4×4。', 'matrix', _first_present(d.get('output_ch0'), channels[0] if channels else None), '16×4×4 / ch0', 'activation'),
            ]
        elif step == 7:
            visuals = [
                _visual('展平前 P2 ch0', 'Flatten 前的第 0 通道 4×4 特征图。', 'matrix', a_heat(6), '16×4×4 / ch0', 'activation'),
                _visual('flat[0:16]', '展平向量的前 16 个位置，按索引顺序排成 4×4。', 'vector_grid', _grid(d.get('first16', []), 4, 6), '256 / 前 16 维', 'activation'),
            ]
        elif step == 8:
            visuals = [
                _visual('W_fc1 切片', 'FC1 权重矩阵的左上切片：前 8 个输出神经元 × 前 16 个输入位置。', 'matrix', _first_present(d.get('W_slice'), a_weight(8)), '120×256 / rows 0-7, cols 0-15', 'weight'),
                _visual('z1[0:16]', 'FC1 输出向量前 16 维，按索引顺序排成 4×4。', 'vector_grid', _grid(d.get('output_vec', []), 4, 6), '120 / 前 16 维', 'activation'),
            ]
        elif step == 9:
            prev = fw[7].get('data', {}) if len(fw) > 7 else {}
            visuals = [
                _visual('激活前 z1[0:16]', 'FC1 输出进入 tanh 前的前 16 维。', 'vector_grid', _grid(_first_present(d.get('input_vals'), prev.get('output_vec')), 4, 6), '120 / 前 16 维', 'activation'),
                _visual('激活后 a1[0:16]', 'tanh(z1) 后的前 16 维。', 'vector_grid', _grid(d.get('act_vals', []), 4, 6), '120 / 前 16 维', 'activation'),
            ]
        elif step == 10:
            visuals = [
                _visual('W_fc2 切片', 'FC2 权重矩阵切片：前 8 个输出神经元 × 前 12 个输入维度。', 'matrix', _first_present(d.get('W_slice'), a_weight(10)), '84×120 / rows 0-7, cols 0-11', 'weight'),
                _visual('z2[0:16]', 'FC2 输出向量前 16 维，按索引顺序排成 4×4。', 'vector_grid', _grid(d.get('output_vec', []), 4, 6), '84 / 前 16 维', 'activation'),
            ]
        elif step == 11:
            prev = fw[9].get('data', {}) if len(fw) > 9 else {}
            visuals = [
                _visual('激活前 z2[0:16]', 'FC2 输出进入 tanh 前的前 16 维。', 'vector_grid', _grid(_first_present(d.get('input_vals'), prev.get('output_vec')), 4, 6), '84 / 前 16 维', 'activation'),
                _visual('激活后 a2[0:16]', 'tanh(z2) 后的前 16 维。', 'vector_grid', _grid(d.get('act_vals', []), 4, 6), '84 / 前 16 维', 'activation'),
            ]
        elif step == 12:
            visuals = [
                _visual('W_fc3 切片', 'FC3 权重矩阵切片：10 个类别 × 前 8 个输入维度。', 'matrix', _first_present(d.get('W_slice'), a_weight(12)), '10×84 / rows 0-9, cols 0-7', 'weight'),
                _visual('logits z3[0:10]', 'FC3 输出的 10 个类别分数，按数字 0-9 排成 2×5。', 'vector_grid', _grid(d.get('logits', []), 5, 6), '10 = 数字 0-9', 'activation'),
            ]
        elif step in (13, 14):
            visuals = _prob_visuals(
                d.get('probs', []),
                d.get('target', sample.get('label')),
                d.get('predicted', sample.get('predicted')),
                d.get('logits'),
            )
            if step == 14:
                visuals.append(_visual('预测结果', '模型选择概率最大的数字作为预测类别。', 'scalar', d.get('predicted', sample.get('predicted')), 'scalar', 'scalar'))
        if visuals:
            s['visuals'] = visuals

    for s in bw:
        d = s.get('data', {})
        step = s.get('step')
        visuals = []
        if step == 1:
            probs = d.get('probs', [])
            label = d.get('target', sample.get('label'))
            dz = [round(float(p) - (1.0 if i == label else 0.0), 6) for i, p in enumerate(probs)] if probs and label is not None else []
            visuals = _prob_visuals(probs, label, sample.get('predicted'))
            visuals.append(_visual('dL/dz3[0:10]', 'Softmax + CrossEntropy 的 logits 梯度：p - one_hot(y)。', 'vector_grid', _grid(dz, 5, 6), '10 = 数字 0-9', 'gradient'))
        elif step in (2, 4, 6):
            names = {2: ('FC3', '10×84'), 4: ('FC2', '84×120'), 6: ('FC1', '120×256')}
            name, shape = names[step]
            visuals = [
                _visual(f'∂L/∂W_{name} 切片', f'{name} 的权重梯度切片，红/绿表示更新方向和强度。', 'matrix', d.get('W_grad_slice', []), shape + ' / 切片', 'gradient'),
                _visual(f'W_{name} 当前切片', f'{name} 当前权重切片，用于对照梯度更新位置。', 'matrix', d.get('W_slice', []), shape + ' / 切片', 'weight'),
            ]
        elif step in (3, 5, 9, 12):
            labels = {3: ('a2', 'dL/dz2', '84'), 5: ('a1', 'dL/dz1', '120'), 9: ('A2 ch0', 'dL/dZ2 ch0', '16×8×8'), 12: ('A1 ch0', 'dL/dZ1 ch0', '6×24×24')}
            left, right, shape = labels[step]
            visuals = [
                _visual(left, '前向激活值，用于 tanh 导数 1 - tanh²(z)。', 'matrix' if d.get('act_ch0') else 'vector_grid', _first_present(d.get('act_ch0'), _grid(d.get('act_vals', []), 4, 6)), shape, 'activation'),
                _visual(right, '经过 tanh 导数修正后的梯度。', 'matrix' if d.get('grad_ch0') else 'vector_grid', _first_present(d.get('grad_ch0'), _grid(d.get('grad_vals', []), 4, 6)), shape, 'gradient'),
            ]
        elif step == 7:
            visuals = [
                _visual('d_flat[0:16]', 'FC1 回传到展平向量的前 16 个梯度。', 'vector_grid', _grid(d.get('flat_grad_first12', []), 4, 6), '256 / 前 12-16 维', 'gradient'),
                _visual('dP2 ch0', '把展平梯度 reshape 回 16×4×4 后的第 0 通道。', 'matrix', _first_present(d.get('d_p2_ch0'), d.get('p2_channel0'), _grid(d.get('flat_grad_first12', []), 4, 6)), '16×4×4 / ch0', 'gradient'),
            ]
        elif step == 8:
            visuals = [
                _visual('dP2 ch0', 'Pool2 输出端收到的第 0 通道梯度，尺寸 4×4。', 'matrix', d.get('input_ch0', []), '16×4×4 / ch0', 'gradient'),
                _visual('dA2 ch0', 'AvgPool2 反向传播后分摊回输入端的第 0 通道梯度。', 'matrix', _first_present(d.get('output_ch0'), d.get('output_ch0_slice')), '16×8×8 / ch0', 'gradient'),
            ]
        elif step == 10:
            visuals = [
                _visual('∂L/∂W_conv2', 'Conv2 卷积核梯度，展示输出通道 0 的前几个输入通道核。', 'kernels', [x for x in [_first_present(d.get('d_W_ch0'), d.get('d_W_ch0_in0')), _first_present(d.get('d_W_ch1'), d.get('d_W_ch0_in1')), d.get('d_W_ch2')] if x], '16×6×5×5 / output ch0 slice', 'gradient'),
                _visual('∂L/∂P1 ch0', 'Conv2 反传到 Pool1 输出端的第 0 通道梯度。', 'matrix', _first_present(d.get('d_x_ch0'), d.get('d_x_ch0_slice')), '6×12×12 / ch0', 'gradient'),
            ]
        elif step == 11:
            visuals = [
                _visual('dP1 ch0', 'Pool1 输出端收到的第 0 通道梯度。', 'matrix', d.get('input_ch0', []), '6×12×12 / ch0', 'gradient'),
                _visual('dA1 ch0', 'AvgPool1 反向传播后分摊回输入端的第 0 通道梯度。', 'matrix', _first_present(d.get('output_ch0'), d.get('output_ch0_slice')), '6×24×24 / ch0', 'gradient'),
            ]
        elif step == 13:
            visuals = [
                _visual('∂L/∂W_conv1', 'Conv1 卷积核梯度，展示 1→6 的 5×5 核梯度。', 'kernels', [x for x in [d.get('d_W_ch0'), d.get('d_W_ch1'), d.get('d_W_ch2')] if x], '6×1×5×5', 'gradient'),
                _visual('∂L/∂X ch0', 'Conv1 反传到输入图像的第 0 通道梯度。', 'matrix', _first_present(d.get('d_x_ch0'), d.get('d_x_slice')), '1×28×28 / ch0', 'gradient'),
            ]
        if visuals:
            s['visuals'] = visuals
    return trace


def compute_forward_trace(image_28x28):
    """Run full forward pass on a user-drawn 28×28 image and return step-by-step trace."""
    W = _load_weights()
    x = image_28x28[np.newaxis, :, :].astype(np.float32)  # (1, 28, 28)
    steps = []

    # Step 1: Conv1 (1→6, 5×5 kernel)
    c1_out = _conv2d_forward(x, W['conv1.W'], W['conv1.b'])  # (6, 24, 24)
    steps.append({
        'step': 1, 'title': 'Conv1 卷积 (1→6, 5×5)',
        'formula': r'\mathbf{Z}_1 = \mathbf{X} \star \mathbf{W}_1 + \mathbf{b}_1',
        'description': '6个5×5卷积核在28×28输入上滑动，输出6×24×24',
        'input_shape': [1, 28, 28], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 1,
        'data': {
            'input_ch0': x[0].round(3).tolist(),
            'output_ch0': c1_out[0].round(4).tolist(),
            'output_ch1': c1_out[1].round(4).tolist() if c1_out.shape[0] > 1 else [],
            'kernels': [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)],
            'bias': [round(float(b), 4) for b in W['conv1.b']],
            'act_min': round(float(c1_out.min()), 4), 'act_max': round(float(c1_out.max()), 4),
        },
    })

    # Step 2: Tanh after Conv1
    c1_act = np.tanh(c1_out)
    steps.append({
        'step': 2, 'title': 'Tanh (Conv1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{Z}_1)',
        'description': f'非线性激活，值域(-1,1), 范围: [{c1_act.min():.4f}, {c1_act.max():.4f}]',
        'input_shape': [6, 24, 24], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 2,
        'data': {
            'input_vals': [round(float(x), 4) for x in c1_out.ravel()[:16]],
            'act_vals': [round(float(x), 4) for x in c1_act.ravel()[:16]],
            'act_ch0': c1_act[0].round(3).tolist(),
            'act_min': round(float(c1_act.min()), 4), 'act_max': round(float(c1_act.max()), 4),
        },
    })

    # Step 3: Pool1 (6×24×24 → 6×12×12)
    p1_out = _avg_pool2d_forward(c1_act)
    steps.append({
        'step': 3, 'title': 'Pool1 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '2×2窗口取平均，尺寸减半 24×24→12×12，保留6通道',
        'input_shape': [6, 24, 24], 'output_shape': [6, 12, 12],
        'grad_norm': round(float(np.linalg.norm(p1_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 3,
        'data': {
            'pool_size': 2, 'stride': 2,
            'input_ch0_slice': c1_act[0, :6, :6].round(4).tolist(),
            'output_ch0': p1_out[0].round(4).tolist(),
            'output_ch1': p1_out[1].round(4).tolist() if p1_out.shape[0] > 1 else [],
        },
    })

    # Step 4: Conv2 (6→16, 5×5 kernel)
    c2_out = _conv2d_forward(p1_out, W['conv2.W'], W['conv2.b'])  # (16, 8, 8)
    steps.append({
        'step': 4, 'title': 'Conv2 卷积 (6→16, 5×5)',
        'formula': r'\mathbf{Z}_2 = \mathbf{a}_1 \star \mathbf{W}_2 + \mathbf{b}_2',
        'description': '16个5×5×6卷积核，输入12×12→输出8×8',
        'input_shape': [6, 12, 12], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 4,
        'data': {
            'output_ch0': c2_out[0].round(4).tolist(),
            'output_ch1': c2_out[1].round(4).tolist() if c2_out.shape[0] > 1 else [],
            'output_ch2': c2_out[2].round(4).tolist() if c2_out.shape[0] > 2 else [],
            'kernels': [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))],
            'bias': [round(float(b), 4) for b in W['conv2.b'][:8]],
        },
    })

    # Step 5: Tanh after Conv2
    c2_act = np.tanh(c2_out)
    steps.append({
        'step': 5, 'title': 'Tanh (Conv2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{Z}_2)',
        'description': f'16通道特征图非线性激活，范围: [{c2_act.min():.4f}, {c2_act.max():.4f}]',
        'input_shape': [16, 8, 8], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 5,
        'data': {
            'act_vals': [round(float(x), 4) for x in c2_act.ravel()[:16]],
            'act_ch0': c2_act[0].round(3).tolist(),
            'act_ch1': c2_act[1].round(3).tolist() if c2_act.shape[0] > 1 else [],
            'act_min': round(float(c2_act.min()), 4), 'act_max': round(float(c2_act.max()), 4),
        },
    })

    # Step 6: Pool2 (16×8×8 → 16×4×4)
    p2_out = _avg_pool2d_forward(c2_act)
    steps.append({
        'step': 6, 'title': 'Pool2 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '8×8→4×4，进一步降采样，提取更稳定的部件特征',
        'input_shape': [16, 8, 8], 'output_shape': [16, 4, 4],
        'grad_norm': round(float(np.linalg.norm(p2_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 6,
        'data': {
            'pool_size': 2, 'stride': 2,
            'input_ch0_slice': c2_act[0, :6, :6].round(4).tolist(),
            'output_channels': [p2_out[i].round(3).tolist() for i in range(min(8, 16))],
        },
    })

    # Step 7: Flatten 16×4×4 → 256
    flat = p2_out.ravel()  # (256,)
    steps.append({
        'step': 7, 'title': 'Flatten 展平 (16×4×4 → 256)',
        'formula': r'\mathbf{v} = \text{flatten}(\mathbf{a}_2^{\text{pool}})',
        'description': '将16通道×4×4的特征图展平为256维向量，准备输入全连接层',
        'input_shape': [16, 4, 4], 'output_shape': [256],
        'grad_norm': round(float(np.linalg.norm(flat)), 6),
        'layer_type': 'flatten', 'arch_layer_index': 7,
        'data': {
            'first16': [round(float(x), 4) for x in flat[:16]],
            'last16': [round(float(x), 4) for x in flat[-16:]],
        },
    })

    # Step 8: FC1 (256 → 120)
    fc1_out = np.dot(W['fc1.W'], flat) + W['fc1.b']
    steps.append({
        'step': 8, 'title': 'FC1 全连接 (256→120)',
        'formula': r'\mathbf{z}_1 = \mathbf{W}_1 \mathbf{v} + \mathbf{b}_1',
        'description': f'120个神经元，每个连接256个输入 ({120*256}个权重参数)',
        'input_shape': [256], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 8,
        'data': {
            'W_slice': _matrix_slice(W['fc1.W'], 8, 16),
            'b_slice': [round(float(x), 4) for x in W['fc1.b'][:8]],
            'input_vec': [round(float(x), 4) for x in flat[:16]],
            'output_vec': [round(float(x), 4) for x in fc1_out[:16]],
        },
    })

    # Step 9: Tanh after FC1
    fc1_act = np.tanh(fc1_out)
    steps.append({
        'step': 9, 'title': 'Tanh (FC1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{z}_1)',
        'description': f'120维向量逐元素激活，范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
        'input_shape': [120], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 9,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc1_act[:20]],
            'input_vals': [round(float(x), 4) for x in fc1_out[:20]],
            'act_min': round(float(fc1_act.min()), 4), 'act_max': round(float(fc1_act.max()), 4),
        },
    })

    # Step 10: FC2 (120 → 84)
    fc2_out = np.dot(W['fc2.W'], fc1_act) + W['fc2.b']
    steps.append({
        'step': 10, 'title': 'FC2 全连接 (120→84)',
        'formula': r'\mathbf{z}_2 = \mathbf{W}_2 \mathbf{a}_1 + \mathbf{b}_2',
        'description': '84个神经元，进一步压缩特征表示',
        'input_shape': [120], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 10,
        'data': {
            'W_slice': _matrix_slice(W['fc2.W'], 8, 12),
            'b_slice': [round(float(x), 4) for x in W['fc2.b'][:8]],
            'output_vec': [round(float(x), 4) for x in fc2_out[:16]],
        },
    })

    # Step 11: Tanh after FC2
    fc2_act = np.tanh(fc2_out)
    steps.append({
        'step': 11, 'title': 'Tanh (FC2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{z}_2)',
        'description': f'84维向量激活，范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
        'input_shape': [84], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 11,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc2_act[:20]],
            'act_min': round(float(fc2_act.min()), 4), 'act_max': round(float(fc2_act.max()), 4),
        },
    })

    # Step 12: FC3 (84 → 10)
    fc3_out = np.dot(W['fc3.W'], fc2_act) + W['fc3.b']
    steps.append({
        'step': 12, 'title': 'FC3 全连接 (84→10)',
        'formula': r'\mathbf{z}_3 = \mathbf{W}_3 \mathbf{a}_2 + \mathbf{b}_3',
        'description': '输出10个logits，对应数字0-9',
        'input_shape': [84], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(fc3_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 12,
        'data': {
            'W_slice': _matrix_slice(W['fc3.W'], 10, 8),
            'b_vec': [round(float(x), 4) for x in W['fc3.b']],
            'logits': [round(float(x), 4) for x in fc3_out],
        },
    })

    # Step 13: Softmax
    shifted = fc3_out - np.max(fc3_out)
    probs = np.exp(shifted) / np.sum(np.exp(shifted))
    steps.append({
        'step': 13, 'title': 'Softmax',
        'formula': r'\hat{y}_i = \frac{e^{z_i}}{\sum_{j=0}^{9} e^{z_j}}',
        'description': '将10个logits转换为0-9的概率分布',
        'input_shape': [10], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(probs)), 6),
        'layer_type': 'softmax', 'arch_layer_index': 13,
        'data': {
            'logits': [round(float(x), 4) for x in fc3_out],
            'probs': [round(float(p), 4) for p in probs],
        },
    })

    # Step 14: Prediction + Loss (no real label, use max prob as prediction)
    predicted = int(np.argmax(probs))
    confidence = float(probs[predicted])
    steps.append({
        'step': 14, 'title': '预测结果',
        'formula': r'\hat{y} = \arg\max_i\; \hat{y}_i',
        'description': f'预测数字: {predicted}, 置信度: {confidence*100:.1f}%',
        'input_shape': [10], 'output_shape': [1],
        'grad_norm': round(float(confidence), 6),
        'layer_type': 'prediction', 'arch_layer_index': 14,
        'data': {
            'predicted': predicted,
            'confidence': round(float(confidence), 4),
            'probs': [round(float(p), 4) for p in probs],
        },
    })

    # Build architecture (same structure as backprop)
    arch_conv1_kernels = [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]
    arch_conv2_kernels = [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))]
    arch_fc1_slice = _matrix_slice(W['fc1.W'], 16, 24)
    arch_fc2_slice = _matrix_slice(W['fc2.W'], 16, 20)
    arch_fc3_full = W['fc3.W'].round(3).tolist()

    trace = {
        'sample': {
            'image': image_28x28.round(4).tolist(),
            'predicted': predicted,
            'confidence': round(float(confidence), 4),
        },
        'architecture': [
            {'arch_index': 0,  'name': 'Input', 'shape': '1×28×28', 'group': '输入', 'static': True, 'heatmap': image_28x28.round(3).tolist()},
            {'arch_index': 1,  'name': 'Conv1.W\n(6@5×5)', 'shape': '6×1×5×5', 'group': '卷积块 1', 'static': True, 'kernels': arch_conv1_kernels},
            {'arch_index': 2,  'name': 'Conv1.out\nTanh', 'shape': '6×24×24', 'group': '卷积块 1', 'static': False, 'heatmap': c1_act[0].round(3).tolist()},
            {'arch_index': 3,  'name': 'Pool1', 'shape': '6×12×12', 'group': '卷积块 1', 'static': False, 'heatmap': p1_out[0].round(3).tolist()},
            {'arch_index': 4,  'name': 'Conv2.W\n(16@6×5×5)', 'shape': '16×6×5×5', 'group': '卷积块 2', 'static': True, 'kernels': arch_conv2_kernels},
            {'arch_index': 5,  'name': 'Conv2.out\nTanh', 'shape': '16×8×8', 'group': '卷积块 2', 'static': False, 'heatmap': c2_act[0].round(3).tolist()},
            {'arch_index': 6,  'name': 'Pool2', 'shape': '16×4×4', 'group': '卷积块 2', 'static': False, 'channels': [p2_out[i].round(3).tolist() for i in range(16)]},
            {'arch_index': 7,  'name': 'Flatten', 'shape': '256', 'group': '全连接', 'static': False, 'vector': flat[:28].round(3).tolist()},
            {'arch_index': 8,  'name': 'FC1\n(256→120)', 'shape': '120×256', 'group': '全连接', 'static': True, 'heatmap': arch_fc1_slice},
            {'arch_index': 9,  'name': 'Tanh', 'shape': '120', 'group': '全连接', 'static': False, 'vector': fc1_act[:20].round(3).tolist()},
            {'arch_index': 10, 'name': 'FC2\n(120→84)', 'shape': '84×120', 'group': '全连接', 'static': True, 'heatmap': arch_fc2_slice},
            {'arch_index': 11, 'name': 'Tanh', 'shape': '84', 'group': '全连接', 'static': False, 'vector': fc2_act[:20].round(3).tolist()},
            {'arch_index': 12, 'name': 'FC3\n(84→10)', 'shape': '10×84', 'group': '全连接', 'static': True, 'heatmap': arch_fc3_full},
            {'arch_index': 13, 'name': 'Softmax', 'shape': '10', 'group': '全连接', 'static': False, 'vector': probs.round(4).tolist()},
            {'arch_index': 14, 'name': 'Pred', 'shape': str(predicted), 'group': '全连接', 'static': False, 'value': predicted},
        ],
        'grad_norms': [s['grad_norm'] for s in steps],
        'steps': steps,
    }
    return _attach_visuals(trace)


def compute_backprop_trace(sample_digit=None, reset=False):
    """Run full forward+backward pass and return step-by-step trace."""
    if reset:
        W = _random_weights()
    else:
        W = _load_weights()
    x_raw, label = _load_mnist_sample(digit=sample_digit)
    x = x_raw[np.newaxis, :, :].astype(np.float32)  # (1, 28, 28)

    # ============ Forward pass (capture all intermediates) ============
    # Conv1
    c1_out = _conv2d_forward(x, W['conv1.W'], W['conv1.b'])  # (6, 24, 24)
    c1_act = np.tanh(c1_out)
    # Pool1
    p1_out = _avg_pool2d_forward(c1_act)  # (6, 12, 12)
    # Conv2
    c2_out = _conv2d_forward(p1_out, W['conv2.W'], W['conv2.b'])  # (16, 8, 8)
    c2_act = np.tanh(c2_out)
    # Pool2
    p2_out = _avg_pool2d_forward(c2_act)  # (16, 4, 4)
    flat = p2_out.ravel()  # (256,)
    # FC1
    fc1_out = np.dot(W['fc1.W'], flat) + W['fc1.b']  # (120,)
    fc1_act = np.tanh(fc1_out)
    # FC2
    fc2_out = np.dot(W['fc2.W'], fc1_act) + W['fc2.b']  # (84,)
    fc2_act = np.tanh(fc2_out)
    # FC3
    fc3_out = np.dot(W['fc3.W'], fc2_act) + W['fc3.b']  # (10,)
    # Softmax
    shifted = fc3_out - np.max(fc3_out)
    probs = np.exp(shifted) / np.sum(np.exp(shifted))
    loss = -np.log(max(probs[label], 1e-12))
    predicted = int(np.argmax(probs))

    # ============ Backward pass ============
    steps = []

    # --- Step 1: Softmax + CrossEntropy ---
    d_fc3 = probs.copy()
    d_fc3[label] -= 1.0  # (10,)
    steps.append({
        'step': 1,
        'title': 'Softmax + Cross-Entropy Loss',
        'formula': r'\frac{\partial L}{\partial \mathbf{z}_3} = \hat{\mathbf{y}} - \mathbf{y}_{\mathrm{one-hot}}',
        'description': f'真实标签={label}, 预测={predicted}, Loss={loss:.4f}',
        'input_shape': [10],
        'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(d_fc3)), 6),
        'layer_type': 'softmax_ce',
        'arch_layer_index': 14,
        'data': {
            'probs': [round(float(p), 4) for p in probs],
            'target': int(label),
            'd_fc3': [round(float(x), 6) for x in d_fc3],
            'loss': round(float(loss), 6),
            'predicted': predicted,
        },
    })

    # --- Step 2: FC3 weight gradient (∂L/∂W_fc3, ∂L/∂b_fc3) ---
    d_W_fc3 = np.outer(d_fc3, fc2_act)  # (10, 84)
    d_b_fc3 = d_fc3.copy()
    delta_fc3 = np.dot(W['fc3.W'].T, d_fc3)  # (84,) — passed to next layer
    steps.append({
        'step': 2,
        'title': 'FC3 全连接层 (10→84)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_3} = \mathbf{\delta}_3 \cdot \mathbf{a}_2^\top, \quad \mathbf{\delta}_2 = \mathbf{W}_3^\top \mathbf{\delta}_3',
        'description': f'W_fc3: 10×84, b_fc3: 10维',
        'input_shape': [10],
        'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(d_W_fc3)), 6),
        'layer_type': 'linear',
        'arch_layer_index': 12,
        'data': {
            'W_slice': _matrix_slice(W['fc3.W'], 10, 8),
            'W_grad_slice': _matrix_slice(d_W_fc3, 10, 8),
            'b_grad': [round(float(x), 6) for x in d_b_fc3],
            'input_vec': [round(float(x), 4) for x in fc2_act[:8]],
            'output_grad': [round(float(x), 6) for x in d_fc3],
            'prev_grad': [round(float(x), 6) for x in delta_fc3[:8]],
        },
    })

    # --- Step 3: Tanh' after FC2 ---
    d_fc2_out = delta_fc3 * (1 - fc2_act ** 2)  # (84,)
    steps.append({
        'step': 3,
        'title': "Tanh' (FC2 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{z}_2} = \mathbf{\delta}_2^{\text{act}} \odot (1 - \tanh^2(\mathbf{z}_2))",
        'description': f'激活值范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
        'input_shape': [84],
        'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(d_fc2_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 11,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc2_act[:16]],
            'grad_vals': [round(float(x), 6) for x in d_fc2_out[:16]],
            'act_min': round(float(fc2_act.min()), 4),
            'act_max': round(float(fc2_act.max()), 4),
        },
    })

    # --- Step 4: FC2 weight gradient ---
    d_W_fc2 = np.outer(d_fc2_out, fc1_act)  # (84, 120)
    d_b_fc2 = d_fc2_out.copy()
    delta_fc2 = np.dot(W['fc2.W'].T, d_fc2_out)  # (120,)
    steps.append({
        'step': 4,
        'title': 'FC2 全连接层 (84→120)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_2} = \mathbf{\delta}_2^{\text{out}} \cdot \mathbf{a}_1^\top, \quad \mathbf{\delta}_1^{\text{act}} = \mathbf{W}_2^\top \mathbf{\delta}_2^{\text{out}}',
        'description': f'W_fc2: 84×120, b_fc2: 84维',
        'input_shape': [84],
        'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(d_W_fc2)), 6),
        'layer_type': 'linear',
        'arch_layer_index': 10,
        'data': {
            'W_slice': _matrix_slice(W['fc2.W'], 8, 8),
            'W_grad_slice': _matrix_slice(d_W_fc2, 8, 8),
            'b_grad': [round(float(x), 6) for x in d_b_fc2[:8]],
            'input_vec': [round(float(x), 4) for x in fc1_act[:8]],
            'output_grad': [round(float(x), 6) for x in d_fc2_out[:8]],
            'prev_grad': [round(float(x), 6) for x in delta_fc2[:8]],
        },
    })

    # --- Step 5: Tanh' after FC1 ---
    d_fc1_out = delta_fc2 * (1 - fc1_act ** 2)  # (120,)
    steps.append({
        'step': 5,
        'title': "Tanh' (FC1 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{z}_1} = \mathbf{\delta}_1^{\text{act}} \odot (1 - \tanh^2(\mathbf{z}_1))",
        'description': f'激活值范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
        'input_shape': [120],
        'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(d_fc1_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 9,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc1_act[:16]],
            'grad_vals': [round(float(x), 6) for x in d_fc1_out[:16]],
            'act_min': round(float(fc1_act.min()), 4),
            'act_max': round(float(fc1_act.max()), 4),
        },
    })

    # --- Step 6: FC1 weight gradient ---
    d_W_fc1 = np.outer(d_fc1_out, flat)  # (120, 256)
    d_b_fc1 = d_fc1_out.copy()
    d_flat = np.dot(W['fc1.W'].T, d_fc1_out)  # (256,)
    steps.append({
        'step': 6,
        'title': 'FC1 全连接层 (120→256)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_1} = \mathbf{\delta}_1^{\text{out}} \cdot \mathbf{a}_0^\top, \quad \mathbf{\delta}_{\text{flat}} = \mathbf{W}_1^\top \mathbf{\delta}_1^{\text{out}}',
        'description': f'W_fc1: 120×256, b_fc1: 120维 (120×256 = {120*256} 个权重)',
        'input_shape': [120],
        'output_shape': [256],
        'grad_norm': round(float(np.linalg.norm(d_W_fc1)), 6),
        'layer_type': 'linear',
        'arch_layer_index': 8,
        'data': {
            'W_slice': _matrix_slice(W['fc1.W'], 8, 12),
            'W_grad_slice': _matrix_slice(d_W_fc1, 8, 12),
            'b_grad': [round(float(x), 6) for x in d_b_fc1[:8]],
            'input_vec': [round(float(x), 4) for x in flat[:12]],
            'output_grad': [round(float(x), 6) for x in d_fc1_out[:8]],
            'prev_grad': [round(float(x), 6) for x in d_flat[:12]],
        },
    })

    # --- Step 7: Reshape (256 → 16×4×4) ---
    d_p2 = d_flat.reshape(16, 4, 4)
    steps.append({
        'step': 7,
        'title': 'Reshape (256 → 16×4×4)',
        'formula': r'\mathbf{\delta}_{P2} = \text{reshape}(\mathbf{\delta}_{\text{flat}},\; (16, 4, 4))',
        'description': f'将256维向量重塑为16通道×4×4的特征图',
        'input_shape': [256],
        'output_shape': [16, 4, 4],
        'grad_norm': round(float(np.linalg.norm(d_p2)), 6),
        'layer_type': 'reshape',
        'arch_layer_index': 7,
        'data': {
            'flat_grad_first12': [round(float(x), 6) for x in d_flat[:12]],
            'p2_channel0': d_p2[0].round(4).tolist(),
            'p2_channel1': d_p2[1].round(4).tolist() if d_p2.shape[0] > 1 else [],
        },
    })

    # --- Step 8: AvgPool2 backward (16×4×4 → 16×8×8) ---
    d_c2_act = _avg_pool2d_backward(d_p2, c2_act.shape)
    steps.append({
        'step': 8,
        'title': 'AvgPool2 反向传播',
        'formula': r'\frac{\partial L}{\partial x_{i,j}} = \frac{1}{k^2} \frac{\partial L}{\partial y_{\lfloor i/2 \rfloor, \lfloor j/2 \rfloor}}',
        'description': f'2×2平均池化的梯度均匀分配到4个输入位置 (16×4×4 → 16×8×8)',
        'input_shape': [16, 4, 4],
        'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(d_c2_act)), 6),
        'layer_type': 'pool_backward',
        'arch_layer_index': 6,
        'data': {
            'pool_size': 2,
            'stride': 2,
            'input_ch0': d_p2[0].round(4).tolist(),
            'output_ch0_slice': d_c2_act[0, :4, :4].round(4).tolist(),
        },
    })

    # --- Step 9: Tanh' after Conv2 ---
    d_c2_out = d_c2_act * (1 - c2_act ** 2)  # (16, 8, 8)
    steps.append({
        'step': 9,
        'title': "Tanh' (Conv2 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{C}_2} = \mathbf{\delta}_{C2}^{\text{act}} \odot (1 - \tanh^2(\mathbf{C}_2))",
        'description': f'16通道×8×8, 激活值范围: [{c2_act.min():.4f}, {c2_act.max():.4f}]',
        'input_shape': [16, 8, 8],
        'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(d_c2_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 5,
        'data': {
            'act_vals': [round(float(x), 4) for x in c2_act.ravel()[:16]],
            'grad_vals': [round(float(x), 6) for x in d_c2_out.ravel()[:16]],
            'act_min': round(float(c2_act.min()), 4),
            'act_max': round(float(c2_act.max()), 4),
        },
    })

    # --- Step 10: Conv2 backward ---
    d_p1, d_W2, d_b2 = _conv2d_backward(p1_out, W['conv2.W'], d_c2_out)
    steps.append({
        'step': 10,
        'title': 'Conv2 卷积层反向 (16×6×5×5)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_{C2}} = \mathbf{X}_{P1} \star \mathbf{\delta}_{C2}, \quad \frac{\partial L}{\partial \mathbf{X}_{P1}} = \mathbf{\delta}_{C2} \star_{\text{full}} \text{rot}(\mathbf{W}_{C2})',
        'description': f'Conv2: 6→16通道, 5×5核, 输入12×12, 输出8×8',
        'input_shape': [6, 12, 12],
        'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(d_W2)), 6),
        'layer_type': 'conv_backward',
        'arch_layer_index': 4,
        'data': {
            'd_W_shape': list(d_W2.shape),
            'd_W_norm': round(float(np.linalg.norm(d_W2)), 6),
            'd_b': [round(float(x), 6) for x in d_b2],
            'd_W_ch0_in0': d_W2[0, 0].round(4).tolist(),
            'd_W_ch0_in1': d_W2[0, 1].round(4).tolist() if d_W2.shape[1] > 1 else [],
            'd_x_norm': round(float(np.linalg.norm(d_p1)), 6),
            'd_x_ch0_slice': d_p1[0, :4, :4].round(6).tolist(),
        },
    })

    # --- Step 11: AvgPool1 backward (6×12×12 → 6×24×24) ---
    d_c1_act = _avg_pool2d_backward(d_p1, c1_act.shape)
    steps.append({
        'step': 11,
        'title': 'AvgPool1 反向传播',
        'formula': r'\frac{\partial L}{\partial x_{i,j}} = \frac{1}{k^2} \frac{\partial L}{\partial y_{\lfloor i/2 \rfloor, \lfloor j/2 \rfloor}}',
        'description': f'2×2平均池化梯度上采样 (6×12×12 → 6×24×24)',
        'input_shape': [6, 12, 12],
        'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(d_c1_act)), 6),
        'layer_type': 'pool_backward',
        'arch_layer_index': 3,
        'data': {
            'pool_size': 2,
            'stride': 2,
            'input_ch0': d_p1[0, :4, :4].round(6).tolist(),
            'output_ch0_slice': d_c1_act[0, :6, :6].round(6).tolist(),
        },
    })

    # --- Step 12: Tanh' after Conv1 ---
    d_c1_out = d_c1_act * (1 - c1_act ** 2)  # (6, 24, 24)
    steps.append({
        'step': 12,
        'title': "Tanh' (Conv1 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{C}_1} = \mathbf{\delta}_{C1}^{\text{act}} \odot (1 - \tanh^2(\mathbf{C}_1))",
        'description': f'6通道×24×24, 激活值范围: [{c1_act.min():.4f}, {c1_act.max():.4f}]',
        'input_shape': [6, 24, 24],
        'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(d_c1_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 2,
        'data': {
            'act_vals': [round(float(x), 4) for x in c1_act.ravel()[:16]],
            'grad_vals': [round(float(x), 6) for x in d_c1_out.ravel()[:16]],
            'act_min': round(float(c1_act.min()), 4),
            'act_max': round(float(c1_act.max()), 4),
        },
    })

    # --- Step 13: Conv1 backward + input gradient ---
    d_x, d_W1, d_b1 = _conv2d_backward(x, W['conv1.W'], d_c1_out)
    steps.append({
        'step': 13,
        'title': 'Conv1 卷积层反向 (6×1×5×5) + 输入梯度',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_{C1}} = \mathbf{X}_{\text{input}} \star \mathbf{\delta}_{C1}, \quad \frac{\partial L}{\partial \mathbf{X}_{\text{input}}} = \mathbf{\delta}_{C1} \star_{\text{full}} \text{rot}(\mathbf{W}_{C1})',
        'description': f'Conv1: 1→6通道, 5×5核, 输入28×28, 输出24×24 (共6×5×5=150个权重参数)',
        'input_shape': [1, 28, 28],
        'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(d_W1)), 6),
        'layer_type': 'conv_backward',
        'arch_layer_index': 1,
        'data': {
            'd_W_shape': list(d_W1.shape),
            'd_W_norm': round(float(np.linalg.norm(d_W1)), 6),
            'd_b': [round(float(x), 6) for x in d_b1],
            'd_W_ch0': d_W1[0, 0].round(4).tolist(),
            'd_W_ch1': d_W1[1, 0].round(4).tolist() if d_W1.shape[0] > 1 else [],
            'd_W_ch2': d_W1[2, 0].round(4).tolist() if d_W1.shape[0] > 2 else [],
            'd_x_norm': round(float(np.linalg.norm(d_x)), 6),
            'd_x_slice': d_x[0, :8, :8].round(6).tolist(),
        },
    })

    # ============ Gradient flow summary ============
    grad_norms = [s['grad_norm'] for s in steps]
    lr = 0.01  # learning rate for visualization

    arch_conv1_kernels = [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]
    arch_conv2_kernels = [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))]
    arch_fc1_slice = _matrix_slice(W['fc1.W'], 16, 24)
    arch_fc2_slice = _matrix_slice(W['fc2.W'], 16, 20)
    arch_fc3_full = W['fc3.W'].round(3).tolist()

    # Compute updated weights for visualization (W_new = W - lr * dW)
    fc3_updated = (W['fc3.W'] - lr * d_W_fc3).round(3).tolist()
    fc2_updated = _matrix_slice(W['fc2.W'] - lr * d_W_fc2, 16, 20)
    fc1_updated = _matrix_slice(W['fc1.W'] - lr * d_W_fc1, 16, 24)
    conv2_updated = [(W['conv2.W'][i, 0] - lr * d_W2[i, 0]).round(3).tolist() for i in range(min(8, 16))]
    conv1_updated = [(W['conv1.W'][i, 0] - lr * d_W1[i, 0]).round(3).tolist() for i in range(6)]

    # Gradient slices for architecture thumbnails
    fc3_grad_slice = d_W_fc3.round(3).tolist()
    fc2_grad_slice = _matrix_slice(d_W_fc2, 16, 20)
    fc1_grad_slice = _matrix_slice(d_W_fc1, 16, 24)
    conv2_grad_kernels = [d_W2[i, 0].round(3).tolist() for i in range(min(8, 16))]
    conv1_grad_kernels = [d_W1[i, 0].round(3).tolist() for i in range(6)]

    # Inject weight-update data into steps (arch_layer_index already set inline)
    # Step 2: FC3
    steps[1]['arch_update'] = {
        'W_before': arch_fc3_full, 'W_grad': fc3_grad_slice, 'W_after': fc3_updated,
        'lr': lr, 'type': 'heatmap'
    }
    # Step 4: FC2
    steps[3]['arch_update'] = {
        'W_before': arch_fc2_slice, 'W_grad': fc2_grad_slice, 'W_after': fc2_updated,
        'lr': lr, 'type': 'heatmap'
    }
    # Step 6: FC1
    steps[5]['arch_update'] = {
        'W_before': arch_fc1_slice, 'W_grad': fc1_grad_slice, 'W_after': fc1_updated,
        'lr': lr, 'type': 'heatmap'
    }
    # Step 10: Conv2
    steps[9]['arch_update'] = {
        'W_before': arch_conv2_kernels, 'W_grad': conv2_grad_kernels, 'W_after': conv2_updated,
        'lr': lr, 'type': 'kernels'
    }
    # Step 13: Conv1
    steps[12]['arch_update'] = {
        'W_before': arch_conv1_kernels, 'W_grad': conv1_grad_kernels, 'W_after': conv1_updated,
        'lr': lr, 'type': 'kernels'
    }

    # --- Build forward steps (reuse forward pass intermediates) ---
    fw_steps = []
    # FW 1: Conv1
    fw_steps.append({'step': 1, 'title': 'Conv1 卷积 (1→6, 5×5)',
        'formula': r'\mathbf{Z}_1 = \mathbf{X} \star \mathbf{W}_1 + \mathbf{b}_1',
        'description': '6个5×5卷积核在28×28输入上滑动，输出6×24×24',
        'input_shape': [1, 28, 28], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 1,
        'data': {'output_ch0': c1_out[0].round(4).tolist(), 'output_ch1': c1_out[1].round(4).tolist() if c1_out.shape[0] > 1 else [],
                 'kernels': [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]}})
    # FW 2: Tanh Conv1
    fw_steps.append({'step': 2, 'title': 'Tanh (Conv1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{Z}_1)',
        'description': f'非线性激活，值域(-1,1), 范围: [{c1_act.min():.4f}, {c1_act.max():.4f}]',
        'input_shape': [6, 24, 24], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 2,
        'data': {'act_ch0': c1_act[0].round(3).tolist(), 'act_min': round(float(c1_act.min()), 4), 'act_max': round(float(c1_act.max()), 4)}})
    # FW 3: Pool1
    fw_steps.append({'step': 3, 'title': 'Pool1 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '2×2窗口取平均，尺寸减半 24×24→12×12',
        'input_shape': [6, 24, 24], 'output_shape': [6, 12, 12],
        'grad_norm': round(float(np.linalg.norm(p1_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 3,
        'data': {'output_ch0': p1_out[0].round(4).tolist(), 'output_ch1': p1_out[1].round(4).tolist() if p1_out.shape[0] > 1 else []}})
    # FW 4: Conv2
    fw_steps.append({'step': 4, 'title': 'Conv2 卷积 (6→16, 5×5)',
        'formula': r'\mathbf{Z}_2 = \mathbf{a}_1^{\text{pool}} \star \mathbf{W}_2 + \mathbf{b}_2',
        'description': '16个5×5×6卷积核，输入12×12→输出8×8',
        'input_shape': [6, 12, 12], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 4,
        'data': {'output_ch0': c2_out[0].round(4).tolist(), 'output_ch1': c2_out[1].round(4).tolist() if c2_out.shape[0] > 1 else []}})
    # FW 5: Tanh Conv2
    fw_steps.append({'step': 5, 'title': 'Tanh (Conv2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{Z}_2)',
        'description': f'16通道特征图非线性激活，范围: [{c2_act.min():.4f}, {c2_act.max():.4f}]',
        'input_shape': [16, 8, 8], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 5,
        'data': {'act_ch0': c2_act[0].round(3).tolist(), 'act_min': round(float(c2_act.min()), 4), 'act_max': round(float(c2_act.max()), 4)}})
    # FW 6: Pool2
    fw_steps.append({'step': 6, 'title': 'Pool2 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '8×8→4×4，进一步降采样',
        'input_shape': [16, 8, 8], 'output_shape': [16, 4, 4],
        'grad_norm': round(float(np.linalg.norm(p2_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 6,
        'data': {'output_channels': [p2_out[i].round(3).tolist() for i in range(min(8, 16))]}})
    # FW 7: Flatten
    fw_steps.append({'step': 7, 'title': 'Flatten 展平 (16×4×4 → 256)',
        'formula': r'\mathbf{v} = \text{flatten}(\mathbf{a}_2^{\text{pool}})',
        'description': '将16通道×4×4的特征图展平为256维向量',
        'input_shape': [16, 4, 4], 'output_shape': [256],
        'grad_norm': round(float(np.linalg.norm(flat)), 6),
        'layer_type': 'flatten', 'arch_layer_index': 7,
        'data': {'first16': [round(float(x), 4) for x in flat[:16]]}})
    # FW 8: FC1
    fw_steps.append({'step': 8, 'title': 'FC1 全连接 (256→120)',
        'formula': r'\mathbf{z}_1 = \mathbf{W}_1 \mathbf{v} + \mathbf{b}_1',
        'description': f'120个神经元，每个连接256个输入',
        'input_shape': [256], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 8,
        'data': {'W_slice': _matrix_slice(W['fc1.W'], 8, 16), 'output_vec': [round(float(x), 4) for x in fc1_out[:16]]}})
    # FW 9: Tanh FC1
    fw_steps.append({'step': 9, 'title': 'Tanh (FC1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{z}_1)',
        'description': f'120维向量逐元素激活，范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
        'input_shape': [120], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 9,
        'data': {'act_vals': [round(float(x), 4) for x in fc1_act[:20]]}})
    # FW 10: FC2
    fw_steps.append({'step': 10, 'title': 'FC2 全连接 (120→84)',
        'formula': r'\mathbf{z}_2 = \mathbf{W}_2 \mathbf{a}_1 + \mathbf{b}_2',
        'description': '84个神经元，进一步压缩特征表示',
        'input_shape': [120], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 10,
        'data': {'W_slice': _matrix_slice(W['fc2.W'], 8, 12), 'output_vec': [round(float(x), 4) for x in fc2_out[:16]]}})
    # FW 11: Tanh FC2
    fw_steps.append({'step': 11, 'title': 'Tanh (FC2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{z}_2)',
        'description': f'84维向量激活，范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
        'input_shape': [84], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 11,
        'data': {'act_vals': [round(float(x), 4) for x in fc2_act[:20]]}})
    # FW 12: FC3
    fw_steps.append({'step': 12, 'title': 'FC3 全连接 (84→10)',
        'formula': r'\mathbf{z}_3 = \mathbf{W}_3 \mathbf{a}_2 + \mathbf{b}_3',
        'description': '输出10个logits，对应数字0-9',
        'input_shape': [84], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(fc3_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 12,
        'data': {'logits': [round(float(x), 4) for x in fc3_out]}})
    # FW 13: Softmax
    fw_steps.append({'step': 13, 'title': 'Softmax',
        'formula': r'\hat{y}_i = \frac{e^{z_i}}{\sum_{j=0}^{9} e^{z_j}}',
        'description': '将10个logits转换为0-9的概率分布',
        'input_shape': [10], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(probs)), 6),
        'layer_type': 'softmax', 'arch_layer_index': 13,
        'data': {'probs': [round(float(p), 4) for p in probs]}})
    # FW 14: Prediction
    fw_steps.append({'step': 14, 'title': '预测结果',
        'formula': r'\hat{y} = \arg\max_i\; \hat{y}_i',
        'description': f'预测数字: {predicted}, 置信度: {probs[predicted]*100:.1f}%',
        'input_shape': [10], 'output_shape': [1],
        'grad_norm': round(float(probs[predicted]), 6),
        'layer_type': 'prediction', 'arch_layer_index': 14,
        'data': {'predicted': predicted, 'confidence': round(float(probs[predicted]), 4),
                 'probs': [round(float(p), 4) for p in probs]}})

    trace = {
        'sample': {
            'image': x_raw.round(4).tolist(),
            'label': int(label),
            'predicted': predicted,
            'loss': round(float(loss), 6),
            'correct': predicted == label,
            'lr': lr,
        },
        'architecture': [
            {'arch_index': 0,  'name': 'Input', 'shape': '1×28×28', 'group': '输入', 'static': True, 'heatmap': x_raw.round(3).tolist()},
            {'arch_index': 1,  'name': 'Conv1.W\n(6@5×5)', 'shape': '6×1×5×5', 'group': '卷积块 1', 'static': True, 'kernels': arch_conv1_kernels},
            {'arch_index': 2,  'name': 'Conv1.out\nTanh', 'shape': '6×24×24', 'group': '卷积块 1', 'static': False, 'heatmap': c1_act[0].round(3).tolist()},
            {'arch_index': 3,  'name': 'Pool1', 'shape': '6×12×12', 'group': '卷积块 1', 'static': False, 'heatmap': p1_out[0].round(3).tolist()},
            {'arch_index': 4,  'name': 'Conv2.W\n(16@6×5×5)', 'shape': '16×6×5×5', 'group': '卷积块 2', 'static': True, 'kernels': arch_conv2_kernels},
            {'arch_index': 5,  'name': 'Conv2.out\nTanh', 'shape': '16×8×8', 'group': '卷积块 2', 'static': False, 'heatmap': c2_act[0].round(3).tolist()},
            {'arch_index': 6,  'name': 'Pool2', 'shape': '16×4×4', 'group': '卷积块 2', 'static': False, 'channels': [p2_out[i].round(3).tolist() for i in range(16)]},
            {'arch_index': 7,  'name': 'Flatten', 'shape': '256', 'group': '全连接', 'static': False, 'vector': flat[:28].round(3).tolist()},
            {'arch_index': 8,  'name': 'FC1\n(256→120)', 'shape': '120×256', 'group': '全连接', 'static': True, 'heatmap': arch_fc1_slice},
            {'arch_index': 9,  'name': 'Tanh', 'shape': '120', 'group': '全连接', 'static': False, 'vector': fc1_act[:20].round(3).tolist()},
            {'arch_index': 10, 'name': 'FC2\n(120→84)', 'shape': '84×120', 'group': '全连接', 'static': True, 'heatmap': arch_fc2_slice},
            {'arch_index': 11, 'name': 'Tanh', 'shape': '84', 'group': '全连接', 'static': False, 'vector': fc2_act[:20].round(3).tolist()},
            {'arch_index': 12, 'name': 'FC3\n(84→10)', 'shape': '10×84', 'group': '全连接', 'static': True, 'heatmap': arch_fc3_full},
            {'arch_index': 13, 'name': 'Softmax', 'shape': '10', 'group': '全连接', 'static': False, 'vector': probs.round(4).tolist()},
            {'arch_index': 14, 'name': 'Loss', 'shape': 'CE', 'group': '全连接', 'static': False, 'value': round(float(loss), 4)},
        ],
        'grad_norms': grad_norms,
        'steps': steps,
        'forward_steps': fw_steps,
    }
    return _attach_visuals(trace)




def compute_forward_trace(image_28x28):
    """Run full forward pass on a user-drawn 28×28 image and return step-by-step trace."""
    W = _load_weights()
    x = image_28x28[np.newaxis, :, :].astype(np.float32)  # (1, 28, 28)
    steps = []

    # Step 1: Conv1 (1→6, 5×5 kernel)
    c1_out = _conv2d_forward(x, W['conv1.W'], W['conv1.b'])  # (6, 24, 24)
    steps.append({
        'step': 1, 'title': 'Conv1 卷积 (1→6, 5×5)',
        'formula': r'\mathbf{Z}_1 = \mathbf{X} \star \mathbf{W}_1 + \mathbf{b}_1',
        'description': '6个5×5卷积核在28×28输入上滑动，输出6×24×24',
        'input_shape': [1, 28, 28], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 1,
        'data': {
            'input_ch0': x[0].round(3).tolist(),
            'output_ch0': c1_out[0].round(4).tolist(),
            'output_ch1': c1_out[1].round(4).tolist() if c1_out.shape[0] > 1 else [],
            'kernels': [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)],
            'bias': [round(float(b), 4) for b in W['conv1.b']],
            'act_min': round(float(c1_out.min()), 4), 'act_max': round(float(c1_out.max()), 4),
        },
    })

    # Step 2: Tanh after Conv1
    c1_act = np.tanh(c1_out)
    steps.append({
        'step': 2, 'title': 'Tanh (Conv1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{Z}_1)',
        'description': f'非线性激活，值域(-1,1), 范围: [{c1_act.min():.4f}, {c1_act.max():.4f}]',
        'input_shape': [6, 24, 24], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 2,
        'data': {
            'input_vals': [round(float(x), 4) for x in c1_out.ravel()[:16]],
            'act_vals': [round(float(x), 4) for x in c1_act.ravel()[:16]],
            'act_ch0': c1_act[0].round(3).tolist(),
            'act_min': round(float(c1_act.min()), 4), 'act_max': round(float(c1_act.max()), 4),
        },
    })

    # Step 3: Pool1 (6×24×24 → 6×12×12)
    p1_out = _avg_pool2d_forward(c1_act)
    steps.append({
        'step': 3, 'title': 'Pool1 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '2×2窗口取平均，尺寸减半 24×24→12×12，保留6通道',
        'input_shape': [6, 24, 24], 'output_shape': [6, 12, 12],
        'grad_norm': round(float(np.linalg.norm(p1_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 3,
        'data': {
            'pool_size': 2, 'stride': 2,
            'input_ch0_slice': c1_act[0, :6, :6].round(4).tolist(),
            'output_ch0': p1_out[0].round(4).tolist(),
            'output_ch1': p1_out[1].round(4).tolist() if p1_out.shape[0] > 1 else [],
        },
    })

    # Step 4: Conv2 (6→16, 5×5 kernel)
    c2_out = _conv2d_forward(p1_out, W['conv2.W'], W['conv2.b'])  # (16, 8, 8)
    steps.append({
        'step': 4, 'title': 'Conv2 卷积 (6→16, 5×5)',
        'formula': r'\mathbf{Z}_2 = \mathbf{a}_1 \star \mathbf{W}_2 + \mathbf{b}_2',
        'description': '16个5×5×6卷积核，输入12×12→输出8×8',
        'input_shape': [6, 12, 12], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 4,
        'data': {
            'output_ch0': c2_out[0].round(4).tolist(),
            'output_ch1': c2_out[1].round(4).tolist() if c2_out.shape[0] > 1 else [],
            'output_ch2': c2_out[2].round(4).tolist() if c2_out.shape[0] > 2 else [],
            'kernels': [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))],
            'bias': [round(float(b), 4) for b in W['conv2.b'][:8]],
        },
    })

    # Step 5: Tanh after Conv2
    c2_act = np.tanh(c2_out)
    steps.append({
        'step': 5, 'title': 'Tanh (Conv2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{Z}_2)',
        'description': f'16通道特征图非线性激活，范围: [{c2_act.min():.4f}, {c2_act.max():.4f}]',
        'input_shape': [16, 8, 8], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 5,
        'data': {
            'act_vals': [round(float(x), 4) for x in c2_act.ravel()[:16]],
            'act_ch0': c2_act[0].round(3).tolist(),
            'act_ch1': c2_act[1].round(3).tolist() if c2_act.shape[0] > 1 else [],
            'act_min': round(float(c2_act.min()), 4), 'act_max': round(float(c2_act.max()), 4),
        },
    })

    # Step 6: Pool2 (16×8×8 → 16×4×4)
    p2_out = _avg_pool2d_forward(c2_act)
    steps.append({
        'step': 6, 'title': 'Pool2 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '8×8→4×4，进一步降采样，提取更稳定的部件特征',
        'input_shape': [16, 8, 8], 'output_shape': [16, 4, 4],
        'grad_norm': round(float(np.linalg.norm(p2_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 6,
        'data': {
            'pool_size': 2, 'stride': 2,
            'input_ch0_slice': c2_act[0, :6, :6].round(4).tolist(),
            'output_channels': [p2_out[i].round(3).tolist() for i in range(min(8, 16))],
        },
    })

    # Step 7: Flatten 16×4×4 → 256
    flat = p2_out.ravel()  # (256,)
    steps.append({
        'step': 7, 'title': 'Flatten 展平 (16×4×4 → 256)',
        'formula': r'\mathbf{v} = \text{flatten}(\mathbf{a}_2^{\text{pool}})',
        'description': '将16通道×4×4的特征图展平为256维向量，准备输入全连接层',
        'input_shape': [16, 4, 4], 'output_shape': [256],
        'grad_norm': round(float(np.linalg.norm(flat)), 6),
        'layer_type': 'flatten', 'arch_layer_index': 7,
        'data': {
            'first16': [round(float(x), 4) for x in flat[:16]],
            'last16': [round(float(x), 4) for x in flat[-16:]],
        },
    })

    # Step 8: FC1 (256 → 120)
    fc1_out = np.dot(W['fc1.W'], flat) + W['fc1.b']
    steps.append({
        'step': 8, 'title': 'FC1 全连接 (256→120)',
        'formula': r'\mathbf{z}_1 = \mathbf{W}_1 \mathbf{v} + \mathbf{b}_1',
        'description': f'120个神经元，每个连接256个输入 ({120*256}个权重参数)',
        'input_shape': [256], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 8,
        'data': {
            'W_slice': _matrix_slice(W['fc1.W'], 8, 16),
            'b_slice': [round(float(x), 4) for x in W['fc1.b'][:8]],
            'input_vec': [round(float(x), 4) for x in flat[:16]],
            'output_vec': [round(float(x), 4) for x in fc1_out[:16]],
        },
    })

    # Step 9: Tanh after FC1
    fc1_act = np.tanh(fc1_out)
    steps.append({
        'step': 9, 'title': 'Tanh (FC1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{z}_1)',
        'description': f'120维向量逐元素激活，范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
        'input_shape': [120], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 9,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc1_act[:20]],
            'input_vals': [round(float(x), 4) for x in fc1_out[:20]],
            'act_min': round(float(fc1_act.min()), 4), 'act_max': round(float(fc1_act.max()), 4),
        },
    })

    # Step 10: FC2 (120 → 84)
    fc2_out = np.dot(W['fc2.W'], fc1_act) + W['fc2.b']
    steps.append({
        'step': 10, 'title': 'FC2 全连接 (120→84)',
        'formula': r'\mathbf{z}_2 = \mathbf{W}_2 \mathbf{a}_1 + \mathbf{b}_2',
        'description': '84个神经元，进一步压缩特征表示',
        'input_shape': [120], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 10,
        'data': {
            'W_slice': _matrix_slice(W['fc2.W'], 8, 12),
            'b_slice': [round(float(x), 4) for x in W['fc2.b'][:8]],
            'output_vec': [round(float(x), 4) for x in fc2_out[:16]],
        },
    })

    # Step 11: Tanh after FC2
    fc2_act = np.tanh(fc2_out)
    steps.append({
        'step': 11, 'title': 'Tanh (FC2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{z}_2)',
        'description': f'84维向量激活，范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
        'input_shape': [84], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 11,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc2_act[:20]],
            'act_min': round(float(fc2_act.min()), 4), 'act_max': round(float(fc2_act.max()), 4),
        },
    })

    # Step 12: FC3 (84 → 10)
    fc3_out = np.dot(W['fc3.W'], fc2_act) + W['fc3.b']
    steps.append({
        'step': 12, 'title': 'FC3 全连接 (84→10)',
        'formula': r'\mathbf{z}_3 = \mathbf{W}_3 \mathbf{a}_2 + \mathbf{b}_3',
        'description': '输出10个logits，对应数字0-9',
        'input_shape': [84], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(fc3_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 12,
        'data': {
            'W_slice': _matrix_slice(W['fc3.W'], 10, 8),
            'b_vec': [round(float(x), 4) for x in W['fc3.b']],
            'logits': [round(float(x), 4) for x in fc3_out],
        },
    })

    # Step 13: Softmax
    shifted = fc3_out - np.max(fc3_out)
    probs = np.exp(shifted) / np.sum(np.exp(shifted))
    steps.append({
        'step': 13, 'title': 'Softmax',
        'formula': r'\hat{y}_i = \frac{e^{z_i}}{\sum_{j=0}^{9} e^{z_j}}',
        'description': '将10个logits转换为0-9的概率分布',
        'input_shape': [10], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(probs)), 6),
        'layer_type': 'softmax', 'arch_layer_index': 13,
        'data': {
            'logits': [round(float(x), 4) for x in fc3_out],
            'probs': [round(float(p), 4) for p in probs],
        },
    })

    # Step 14: Prediction + Loss (no real label, use max prob as prediction)
    predicted = int(np.argmax(probs))
    confidence = float(probs[predicted])
    steps.append({
        'step': 14, 'title': '预测结果',
        'formula': r'\hat{y} = \arg\max_i\; \hat{y}_i',
        'description': f'预测数字: {predicted}, 置信度: {confidence*100:.1f}%',
        'input_shape': [10], 'output_shape': [1],
        'grad_norm': round(float(confidence), 6),
        'layer_type': 'prediction', 'arch_layer_index': 14,
        'data': {
            'predicted': predicted,
            'confidence': round(float(confidence), 4),
            'probs': [round(float(p), 4) for p in probs],
        },
    })

    # Build architecture (same structure as backprop)
    arch_conv1_kernels = [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]
    arch_conv2_kernels = [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))]
    arch_fc1_slice = _matrix_slice(W['fc1.W'], 16, 24)
    arch_fc2_slice = _matrix_slice(W['fc2.W'], 16, 20)
    arch_fc3_full = W['fc3.W'].round(3).tolist()

    trace = {
        'sample': {
            'image': image_28x28.round(4).tolist(),
            'predicted': predicted,
            'confidence': round(float(confidence), 4),
        },
        'architecture': [
            {'arch_index': 0,  'name': 'Input', 'shape': '1×28×28', 'group': '输入', 'static': True, 'heatmap': image_28x28.round(3).tolist()},
            {'arch_index': 1,  'name': 'Conv1.W\n(6@5×5)', 'shape': '6×1×5×5', 'group': '卷积块 1', 'static': True, 'kernels': arch_conv1_kernels},
            {'arch_index': 2,  'name': 'Conv1.out\nTanh', 'shape': '6×24×24', 'group': '卷积块 1', 'static': False, 'heatmap': c1_act[0].round(3).tolist()},
            {'arch_index': 3,  'name': 'Pool1', 'shape': '6×12×12', 'group': '卷积块 1', 'static': False, 'heatmap': p1_out[0].round(3).tolist()},
            {'arch_index': 4,  'name': 'Conv2.W\n(16@6×5×5)', 'shape': '16×6×5×5', 'group': '卷积块 2', 'static': True, 'kernels': arch_conv2_kernels},
            {'arch_index': 5,  'name': 'Conv2.out\nTanh', 'shape': '16×8×8', 'group': '卷积块 2', 'static': False, 'heatmap': c2_act[0].round(3).tolist()},
            {'arch_index': 6,  'name': 'Pool2', 'shape': '16×4×4', 'group': '卷积块 2', 'static': False, 'channels': [p2_out[i].round(3).tolist() for i in range(16)]},
            {'arch_index': 7,  'name': 'Flatten', 'shape': '256', 'group': '全连接', 'static': False, 'vector': flat[:28].round(3).tolist()},
            {'arch_index': 8,  'name': 'FC1\n(256→120)', 'shape': '120×256', 'group': '全连接', 'static': True, 'heatmap': arch_fc1_slice},
            {'arch_index': 9,  'name': 'Tanh', 'shape': '120', 'group': '全连接', 'static': False, 'vector': fc1_act[:20].round(3).tolist()},
            {'arch_index': 10, 'name': 'FC2\n(120→84)', 'shape': '84×120', 'group': '全连接', 'static': True, 'heatmap': arch_fc2_slice},
            {'arch_index': 11, 'name': 'Tanh', 'shape': '84', 'group': '全连接', 'static': False, 'vector': fc2_act[:20].round(3).tolist()},
            {'arch_index': 12, 'name': 'FC3\n(84→10)', 'shape': '10×84', 'group': '全连接', 'static': True, 'heatmap': arch_fc3_full},
            {'arch_index': 13, 'name': 'Softmax', 'shape': '10', 'group': '全连接', 'static': False, 'vector': probs.round(4).tolist()},
            {'arch_index': 14, 'name': 'Pred', 'shape': str(predicted), 'group': '全连接', 'static': False, 'value': predicted},
        ],
        'grad_norms': [s['grad_norm'] for s in steps],
        'steps': steps,
    }
    return _attach_visuals(trace)


def compute_backprop_trace(sample_digit=None, reset=False):
    """Run full forward+backward pass and return step-by-step trace."""
    if reset:
        W = _random_weights()
    else:
        W = _load_weights()
    x_raw, label = _load_mnist_sample(digit=sample_digit)
    x = x_raw[np.newaxis, :, :].astype(np.float32)  # (1, 28, 28)

    # ============ Forward pass (capture all intermediates) ============
    # Conv1
    c1_out = _conv2d_forward(x, W['conv1.W'], W['conv1.b'])  # (6, 24, 24)
    c1_act = np.tanh(c1_out)
    # Pool1
    p1_out = _avg_pool2d_forward(c1_act)  # (6, 12, 12)
    # Conv2
    c2_out = _conv2d_forward(p1_out, W['conv2.W'], W['conv2.b'])  # (16, 8, 8)
    c2_act = np.tanh(c2_out)
    # Pool2
    p2_out = _avg_pool2d_forward(c2_act)  # (16, 4, 4)
    flat = p2_out.ravel()  # (256,)
    # FC1
    fc1_out = np.dot(W['fc1.W'], flat) + W['fc1.b']  # (120,)
    fc1_act = np.tanh(fc1_out)
    # FC2
    fc2_out = np.dot(W['fc2.W'], fc1_act) + W['fc2.b']  # (84,)
    fc2_act = np.tanh(fc2_out)
    # FC3
    fc3_out = np.dot(W['fc3.W'], fc2_act) + W['fc3.b']  # (10,)
    # Softmax
    shifted = fc3_out - np.max(fc3_out)
    probs = np.exp(shifted) / np.sum(np.exp(shifted))
    loss = -np.log(max(probs[label], 1e-12))
    predicted = int(np.argmax(probs))

    # ============ Backward pass ============
    steps = []

    # --- Step 1: Softmax + CrossEntropy ---
    d_fc3 = probs.copy()
    d_fc3[label] -= 1.0  # (10,)
    steps.append({
        'step': 1,
        'title': 'Softmax + Cross-Entropy Loss',
        'formula': r'\frac{\partial L}{\partial \mathbf{z}_3} = \hat{\mathbf{y}} - \mathbf{y}_{\mathrm{one-hot}}',
        'description': f'真实标签={label}, 预测={predicted}, Loss={loss:.4f}',
        'input_shape': [10],
        'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(d_fc3)), 6),
        'layer_type': 'softmax_ce',
        'arch_layer_index': 14,
        'data': {
            'probs': [round(float(p), 4) for p in probs],
            'target': int(label),
            'd_fc3': [round(float(x), 6) for x in d_fc3],
            'loss': round(float(loss), 6),
            'predicted': predicted,
        },
    })

    # --- Step 2: FC3 weight gradient (∂L/∂W_fc3, ∂L/∂b_fc3) ---
    d_W_fc3 = np.outer(d_fc3, fc2_act)  # (10, 84)
    d_b_fc3 = d_fc3.copy()
    delta_fc3 = np.dot(W['fc3.W'].T, d_fc3)  # (84,) — passed to next layer
    steps.append({
        'step': 2,
        'title': 'FC3 全连接层 (10→84)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_3} = \mathbf{\delta}_3 \cdot \mathbf{a}_2^\top, \quad \mathbf{\delta}_2 = \mathbf{W}_3^\top \mathbf{\delta}_3',
        'description': f'W_fc3: 10×84, b_fc3: 10维',
        'input_shape': [10],
        'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(d_W_fc3)), 6),
        'layer_type': 'linear',
        'arch_layer_index': 12,
        'data': {
            'W_slice': _matrix_slice(W['fc3.W'], 10, 8),
            'W_grad_slice': _matrix_slice(d_W_fc3, 10, 8),
            'b_grad': [round(float(x), 6) for x in d_b_fc3],
            'input_vec': [round(float(x), 4) for x in fc2_act[:8]],
            'output_grad': [round(float(x), 6) for x in d_fc3],
            'prev_grad': [round(float(x), 6) for x in delta_fc3[:8]],
        },
    })

    # --- Step 3: Tanh' after FC2 ---
    d_fc2_out = delta_fc3 * (1 - fc2_act ** 2)  # (84,)
    steps.append({
        'step': 3,
        'title': "Tanh' (FC2 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{z}_2} = \mathbf{\delta}_2^{\text{act}} \odot (1 - \tanh^2(\mathbf{z}_2))",
        'description': f'激活值范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
        'input_shape': [84],
        'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(d_fc2_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 11,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc2_act[:16]],
            'grad_vals': [round(float(x), 6) for x in d_fc2_out[:16]],
            'act_min': round(float(fc2_act.min()), 4),
            'act_max': round(float(fc2_act.max()), 4),
        },
    })

    # --- Step 4: FC2 weight gradient ---
    d_W_fc2 = np.outer(d_fc2_out, fc1_act)  # (84, 120)
    d_b_fc2 = d_fc2_out.copy()
    delta_fc2 = np.dot(W['fc2.W'].T, d_fc2_out)  # (120,)
    steps.append({
        'step': 4,
        'title': 'FC2 全连接层 (84→120)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_2} = \mathbf{\delta}_2^{\text{out}} \cdot \mathbf{a}_1^\top, \quad \mathbf{\delta}_1^{\text{act}} = \mathbf{W}_2^\top \mathbf{\delta}_2^{\text{out}}',
        'description': f'W_fc2: 84×120, b_fc2: 84维',
        'input_shape': [84],
        'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(d_W_fc2)), 6),
        'layer_type': 'linear',
        'arch_layer_index': 10,
        'data': {
            'W_slice': _matrix_slice(W['fc2.W'], 8, 8),
            'W_grad_slice': _matrix_slice(d_W_fc2, 8, 8),
            'b_grad': [round(float(x), 6) for x in d_b_fc2[:8]],
            'input_vec': [round(float(x), 4) for x in fc1_act[:8]],
            'output_grad': [round(float(x), 6) for x in d_fc2_out[:8]],
            'prev_grad': [round(float(x), 6) for x in delta_fc2[:8]],
        },
    })

    # --- Step 5: Tanh' after FC1 ---
    d_fc1_out = delta_fc2 * (1 - fc1_act ** 2)  # (120,)
    steps.append({
        'step': 5,
        'title': "Tanh' (FC1 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{z}_1} = \mathbf{\delta}_1^{\text{act}} \odot (1 - \tanh^2(\mathbf{z}_1))",
        'description': f'激活值范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
        'input_shape': [120],
        'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(d_fc1_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 9,
        'data': {
            'act_vals': [round(float(x), 4) for x in fc1_act[:16]],
            'grad_vals': [round(float(x), 6) for x in d_fc1_out[:16]],
            'act_min': round(float(fc1_act.min()), 4),
            'act_max': round(float(fc1_act.max()), 4),
        },
    })

    # --- Step 6: FC1 weight gradient ---
    d_W_fc1 = np.outer(d_fc1_out, flat)  # (120, 256)
    d_b_fc1 = d_fc1_out.copy()
    d_flat = np.dot(W['fc1.W'].T, d_fc1_out)  # (256,)
    steps.append({
        'step': 6,
        'title': 'FC1 全连接层 (120→256)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_1} = \mathbf{\delta}_1^{\text{out}} \cdot \mathbf{a}_0^\top, \quad \mathbf{\delta}_{\text{flat}} = \mathbf{W}_1^\top \mathbf{\delta}_1^{\text{out}}',
        'description': f'W_fc1: 120×256, b_fc1: 120维 (120×256 = {120*256} 个权重)',
        'input_shape': [120],
        'output_shape': [256],
        'grad_norm': round(float(np.linalg.norm(d_W_fc1)), 6),
        'layer_type': 'linear',
        'arch_layer_index': 8,
        'data': {
            'W_slice': _matrix_slice(W['fc1.W'], 8, 12),
            'W_grad_slice': _matrix_slice(d_W_fc1, 8, 12),
            'b_grad': [round(float(x), 6) for x in d_b_fc1[:8]],
            'input_vec': [round(float(x), 4) for x in flat[:12]],
            'output_grad': [round(float(x), 6) for x in d_fc1_out[:8]],
            'prev_grad': [round(float(x), 6) for x in d_flat[:12]],
        },
    })

    # --- Step 7: Reshape (256 → 16×4×4) ---
    d_p2 = d_flat.reshape(16, 4, 4)
    steps.append({
        'step': 7,
        'title': 'Reshape (256 → 16×4×4)',
        'formula': r'\mathbf{\delta}_{P2} = \text{reshape}(\mathbf{\delta}_{\text{flat}},\; (16, 4, 4))',
        'description': f'将256维向量重塑为16通道×4×4的特征图',
        'input_shape': [256],
        'output_shape': [16, 4, 4],
        'grad_norm': round(float(np.linalg.norm(d_p2)), 6),
        'layer_type': 'reshape',
        'arch_layer_index': 7,
        'data': {
            'flat_grad_first12': [round(float(x), 6) for x in d_flat[:12]],
            'p2_channel0': d_p2[0].round(4).tolist(),
            'p2_channel1': d_p2[1].round(4).tolist() if d_p2.shape[0] > 1 else [],
        },
    })

    # --- Step 8: AvgPool2 backward (16×4×4 → 16×8×8) ---
    d_c2_act = _avg_pool2d_backward(d_p2, c2_act.shape)
    steps.append({
        'step': 8,
        'title': 'AvgPool2 反向传播',
        'formula': r'\frac{\partial L}{\partial x_{i,j}} = \frac{1}{k^2} \frac{\partial L}{\partial y_{\lfloor i/2 \rfloor, \lfloor j/2 \rfloor}}',
        'description': f'2×2平均池化的梯度均匀分配到4个输入位置 (16×4×4 → 16×8×8)',
        'input_shape': [16, 4, 4],
        'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(d_c2_act)), 6),
        'layer_type': 'pool_backward',
        'arch_layer_index': 6,
        'data': {
            'pool_size': 2,
            'stride': 2,
            'input_ch0': d_p2[0].round(4).tolist(),
            'output_ch0_slice': d_c2_act[0, :4, :4].round(4).tolist(),
        },
    })

    # --- Step 9: Tanh' after Conv2 ---
    d_c2_out = d_c2_act * (1 - c2_act ** 2)  # (16, 8, 8)
    steps.append({
        'step': 9,
        'title': "Tanh' (Conv2 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{C}_2} = \mathbf{\delta}_{C2}^{\text{act}} \odot (1 - \tanh^2(\mathbf{C}_2))",
        'description': f'16通道×8×8, 激活值范围: [{c2_act.min():.4f}, {c2_act.max():.4f}]',
        'input_shape': [16, 8, 8],
        'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(d_c2_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 5,
        'data': {
            'act_vals': [round(float(x), 4) for x in c2_act.ravel()[:16]],
            'grad_vals': [round(float(x), 6) for x in d_c2_out.ravel()[:16]],
            'act_min': round(float(c2_act.min()), 4),
            'act_max': round(float(c2_act.max()), 4),
        },
    })

    # --- Step 10: Conv2 backward ---
    d_p1, d_W2, d_b2 = _conv2d_backward(p1_out, W['conv2.W'], d_c2_out)
    steps.append({
        'step': 10,
        'title': 'Conv2 卷积层反向 (16×6×5×5)',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_{C2}} = \mathbf{X}_{P1} \star \mathbf{\delta}_{C2}, \quad \frac{\partial L}{\partial \mathbf{X}_{P1}} = \mathbf{\delta}_{C2} \star_{\text{full}} \text{rot}(\mathbf{W}_{C2})',
        'description': f'Conv2: 6→16通道, 5×5核, 输入12×12, 输出8×8',
        'input_shape': [6, 12, 12],
        'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(d_W2)), 6),
        'layer_type': 'conv_backward',
        'arch_layer_index': 4,
        'data': {
            'd_W_shape': list(d_W2.shape),
            'd_W_norm': round(float(np.linalg.norm(d_W2)), 6),
            'd_b': [round(float(x), 6) for x in d_b2],
            'd_W_ch0_in0': d_W2[0, 0].round(4).tolist(),
            'd_W_ch0_in1': d_W2[0, 1].round(4).tolist() if d_W2.shape[1] > 1 else [],
            'd_x_norm': round(float(np.linalg.norm(d_p1)), 6),
            'd_x_ch0_slice': d_p1[0, :4, :4].round(6).tolist(),
        },
    })

    # --- Step 11: AvgPool1 backward (6×12×12 → 6×24×24) ---
    d_c1_act = _avg_pool2d_backward(d_p1, c1_act.shape)
    steps.append({
        'step': 11,
        'title': 'AvgPool1 反向传播',
        'formula': r'\frac{\partial L}{\partial x_{i,j}} = \frac{1}{k^2} \frac{\partial L}{\partial y_{\lfloor i/2 \rfloor, \lfloor j/2 \rfloor}}',
        'description': f'2×2平均池化梯度上采样 (6×12×12 → 6×24×24)',
        'input_shape': [6, 12, 12],
        'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(d_c1_act)), 6),
        'layer_type': 'pool_backward',
        'arch_layer_index': 3,
        'data': {
            'pool_size': 2,
            'stride': 2,
            'input_ch0': d_p1[0, :4, :4].round(6).tolist(),
            'output_ch0_slice': d_c1_act[0, :6, :6].round(6).tolist(),
        },
    })

    # --- Step 12: Tanh' after Conv1 ---
    d_c1_out = d_c1_act * (1 - c1_act ** 2)  # (6, 24, 24)
    steps.append({
        'step': 12,
        'title': "Tanh' (Conv1 之后)",
        'formula': r"\frac{\partial L}{\partial \mathbf{C}_1} = \mathbf{\delta}_{C1}^{\text{act}} \odot (1 - \tanh^2(\mathbf{C}_1))",
        'description': f'6通道×24×24, 激活值范围: [{c1_act.min():.4f}, {c1_act.max():.4f}]',
        'input_shape': [6, 24, 24],
        'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(d_c1_out)), 6),
        'layer_type': 'tanh',
        'arch_layer_index': 2,
        'data': {
            'act_vals': [round(float(x), 4) for x in c1_act.ravel()[:16]],
            'grad_vals': [round(float(x), 6) for x in d_c1_out.ravel()[:16]],
            'act_min': round(float(c1_act.min()), 4),
            'act_max': round(float(c1_act.max()), 4),
        },
    })

    # --- Step 13: Conv1 backward + input gradient ---
    d_x, d_W1, d_b1 = _conv2d_backward(x, W['conv1.W'], d_c1_out)
    steps.append({
        'step': 13,
        'title': 'Conv1 卷积层反向 (6×1×5×5) + 输入梯度',
        'formula': r'\frac{\partial L}{\partial \mathbf{W}_{C1}} = \mathbf{X}_{\text{input}} \star \mathbf{\delta}_{C1}, \quad \frac{\partial L}{\partial \mathbf{X}_{\text{input}}} = \mathbf{\delta}_{C1} \star_{\text{full}} \text{rot}(\mathbf{W}_{C1})',
        'description': f'Conv1: 1→6通道, 5×5核, 输入28×28, 输出24×24 (共6×5×5=150个权重参数)',
        'input_shape': [1, 28, 28],
        'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(d_W1)), 6),
        'layer_type': 'conv_backward',
        'arch_layer_index': 1,
        'data': {
            'd_W_shape': list(d_W1.shape),
            'd_W_norm': round(float(np.linalg.norm(d_W1)), 6),
            'd_b': [round(float(x), 6) for x in d_b1],
            'd_W_ch0': d_W1[0, 0].round(4).tolist(),
            'd_W_ch1': d_W1[1, 0].round(4).tolist() if d_W1.shape[0] > 1 else [],
            'd_W_ch2': d_W1[2, 0].round(4).tolist() if d_W1.shape[0] > 2 else [],
            'd_x_norm': round(float(np.linalg.norm(d_x)), 6),
            'd_x_slice': d_x[0, :8, :8].round(6).tolist(),
        },
    })

    # ============ Gradient flow summary ============
    grad_norms = [s['grad_norm'] for s in steps]
    lr = 0.01  # learning rate for visualization

    arch_conv1_kernels = [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]
    arch_conv2_kernels = [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))]
    arch_fc1_slice = _matrix_slice(W['fc1.W'], 16, 24)
    arch_fc2_slice = _matrix_slice(W['fc2.W'], 16, 20)
    arch_fc3_full = W['fc3.W'].round(3).tolist()

    # Compute updated weights for visualization (W_new = W - lr * dW)
    fc3_updated = (W['fc3.W'] - lr * d_W_fc3).round(3).tolist()
    fc2_updated = _matrix_slice(W['fc2.W'] - lr * d_W_fc2, 16, 20)
    fc1_updated = _matrix_slice(W['fc1.W'] - lr * d_W_fc1, 16, 24)
    conv2_updated = [(W['conv2.W'][i, 0] - lr * d_W2[i, 0]).round(3).tolist() for i in range(min(8, 16))]
    conv1_updated = [(W['conv1.W'][i, 0] - lr * d_W1[i, 0]).round(3).tolist() for i in range(6)]

    # Gradient slices for architecture thumbnails
    fc3_grad_slice = d_W_fc3.round(3).tolist()
    fc2_grad_slice = _matrix_slice(d_W_fc2, 16, 20)
    fc1_grad_slice = _matrix_slice(d_W_fc1, 16, 24)
    conv2_grad_kernels = [d_W2[i, 0].round(3).tolist() for i in range(min(8, 16))]
    conv1_grad_kernels = [d_W1[i, 0].round(3).tolist() for i in range(6)]

    # Inject weight-update data into steps (arch_layer_index already set inline)
    # Step 2: FC3
    steps[1]['arch_update'] = {
        'W_before': arch_fc3_full, 'W_grad': fc3_grad_slice, 'W_after': fc3_updated,
        'lr': lr, 'type': 'heatmap'
    }
    # Step 4: FC2
    steps[3]['arch_update'] = {
        'W_before': arch_fc2_slice, 'W_grad': fc2_grad_slice, 'W_after': fc2_updated,
        'lr': lr, 'type': 'heatmap'
    }
    # Step 6: FC1
    steps[5]['arch_update'] = {
        'W_before': arch_fc1_slice, 'W_grad': fc1_grad_slice, 'W_after': fc1_updated,
        'lr': lr, 'type': 'heatmap'
    }
    # Step 10: Conv2
    steps[9]['arch_update'] = {
        'W_before': arch_conv2_kernels, 'W_grad': conv2_grad_kernels, 'W_after': conv2_updated,
        'lr': lr, 'type': 'kernels'
    }
    # Step 13: Conv1
    steps[12]['arch_update'] = {
        'W_before': arch_conv1_kernels, 'W_grad': conv1_grad_kernels, 'W_after': conv1_updated,
        'lr': lr, 'type': 'kernels'
    }

    # --- Build forward steps (reuse forward pass intermediates) ---
    fw_steps = []
    # FW 1: Conv1
    fw_steps.append({'step': 1, 'title': 'Conv1 卷积 (1→6, 5×5)',
        'formula': r'\mathbf{Z}_1 = \mathbf{X} \star \mathbf{W}_1 + \mathbf{b}_1',
        'description': '6个5×5卷积核在28×28输入上滑动，输出6×24×24',
        'input_shape': [1, 28, 28], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 1,
        'data': {'output_ch0': c1_out[0].round(4).tolist(), 'output_ch1': c1_out[1].round(4).tolist() if c1_out.shape[0] > 1 else [],
                 'kernels': [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]}})
    # FW 2: Tanh Conv1
    fw_steps.append({'step': 2, 'title': 'Tanh (Conv1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{Z}_1)',
        'description': f'非线性激活，值域(-1,1), 范围: [{c1_act.min():.4f}, {c1_act.max():.4f}]',
        'input_shape': [6, 24, 24], 'output_shape': [6, 24, 24],
        'grad_norm': round(float(np.linalg.norm(c1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 2,
        'data': {'act_ch0': c1_act[0].round(3).tolist(), 'act_min': round(float(c1_act.min()), 4), 'act_max': round(float(c1_act.max()), 4)}})
    # FW 3: Pool1
    fw_steps.append({'step': 3, 'title': 'Pool1 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '2×2窗口取平均，尺寸减半 24×24→12×12',
        'input_shape': [6, 24, 24], 'output_shape': [6, 12, 12],
        'grad_norm': round(float(np.linalg.norm(p1_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 3,
        'data': {'output_ch0': p1_out[0].round(4).tolist(), 'output_ch1': p1_out[1].round(4).tolist() if p1_out.shape[0] > 1 else []}})
    # FW 4: Conv2
    fw_steps.append({'step': 4, 'title': 'Conv2 卷积 (6→16, 5×5)',
        'formula': r'\mathbf{Z}_2 = \mathbf{a}_1^{\text{pool}} \star \mathbf{W}_2 + \mathbf{b}_2',
        'description': '16个5×5×6卷积核，输入12×12→输出8×8',
        'input_shape': [6, 12, 12], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_out)), 6),
        'layer_type': 'conv_forward', 'arch_layer_index': 4,
        'data': {'output_ch0': c2_out[0].round(4).tolist(), 'output_ch1': c2_out[1].round(4).tolist() if c2_out.shape[0] > 1 else []}})
    # FW 5: Tanh Conv2
    fw_steps.append({'step': 5, 'title': 'Tanh (Conv2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{Z}_2)',
        'description': f'16通道特征图非线性激活，范围: [{c2_act.min():.4f}, {c2_act.max():.4f}]',
        'input_shape': [16, 8, 8], 'output_shape': [16, 8, 8],
        'grad_norm': round(float(np.linalg.norm(c2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 5,
        'data': {'act_ch0': c2_act[0].round(3).tolist(), 'act_min': round(float(c2_act.min()), 4), 'act_max': round(float(c2_act.max()), 4)}})
    # FW 6: Pool2
    fw_steps.append({'step': 6, 'title': 'Pool2 平均池化 (2×2, stride=2)',
        'formula': r'y_{i,j} = \frac{1}{4}\sum_{u=0}^{1}\sum_{v=0}^{1} x_{2i+u,\,2j+v}',
        'description': '8×8→4×4，进一步降采样',
        'input_shape': [16, 8, 8], 'output_shape': [16, 4, 4],
        'grad_norm': round(float(np.linalg.norm(p2_out)), 6),
        'layer_type': 'pool_forward', 'arch_layer_index': 6,
        'data': {'output_channels': [p2_out[i].round(3).tolist() for i in range(min(8, 16))]}})
    # FW 7: Flatten
    fw_steps.append({'step': 7, 'title': 'Flatten 展平 (16×4×4 → 256)',
        'formula': r'\mathbf{v} = \text{flatten}(\mathbf{a}_2^{\text{pool}})',
        'description': '将16通道×4×4的特征图展平为256维向量',
        'input_shape': [16, 4, 4], 'output_shape': [256],
        'grad_norm': round(float(np.linalg.norm(flat)), 6),
        'layer_type': 'flatten', 'arch_layer_index': 7,
        'data': {'first16': [round(float(x), 4) for x in flat[:16]]}})
    # FW 8: FC1
    fw_steps.append({'step': 8, 'title': 'FC1 全连接 (256→120)',
        'formula': r'\mathbf{z}_1 = \mathbf{W}_1 \mathbf{v} + \mathbf{b}_1',
        'description': f'120个神经元，每个连接256个输入',
        'input_shape': [256], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 8,
        'data': {'W_slice': _matrix_slice(W['fc1.W'], 8, 16), 'output_vec': [round(float(x), 4) for x in fc1_out[:16]]}})
    # FW 9: Tanh FC1
    fw_steps.append({'step': 9, 'title': 'Tanh (FC1 之后)',
        'formula': r'\mathbf{a}_1 = \tanh(\mathbf{z}_1)',
        'description': f'120维向量逐元素激活，范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
        'input_shape': [120], 'output_shape': [120],
        'grad_norm': round(float(np.linalg.norm(fc1_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 9,
        'data': {'act_vals': [round(float(x), 4) for x in fc1_act[:20]]}})
    # FW 10: FC2
    fw_steps.append({'step': 10, 'title': 'FC2 全连接 (120→84)',
        'formula': r'\mathbf{z}_2 = \mathbf{W}_2 \mathbf{a}_1 + \mathbf{b}_2',
        'description': '84个神经元，进一步压缩特征表示',
        'input_shape': [120], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 10,
        'data': {'W_slice': _matrix_slice(W['fc2.W'], 8, 12), 'output_vec': [round(float(x), 4) for x in fc2_out[:16]]}})
    # FW 11: Tanh FC2
    fw_steps.append({'step': 11, 'title': 'Tanh (FC2 之后)',
        'formula': r'\mathbf{a}_2 = \tanh(\mathbf{z}_2)',
        'description': f'84维向量激活，范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
        'input_shape': [84], 'output_shape': [84],
        'grad_norm': round(float(np.linalg.norm(fc2_act)), 6),
        'layer_type': 'tanh', 'arch_layer_index': 11,
        'data': {'act_vals': [round(float(x), 4) for x in fc2_act[:20]]}})
    # FW 12: FC3
    fw_steps.append({'step': 12, 'title': 'FC3 全连接 (84→10)',
        'formula': r'\mathbf{z}_3 = \mathbf{W}_3 \mathbf{a}_2 + \mathbf{b}_3',
        'description': '输出10个logits，对应数字0-9',
        'input_shape': [84], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(fc3_out)), 6),
        'layer_type': 'linear_forward', 'arch_layer_index': 12,
        'data': {'logits': [round(float(x), 4) for x in fc3_out]}})
    # FW 13: Softmax
    fw_steps.append({'step': 13, 'title': 'Softmax',
        'formula': r'\hat{y}_i = \frac{e^{z_i}}{\sum_{j=0}^{9} e^{z_j}}',
        'description': '将10个logits转换为0-9的概率分布',
        'input_shape': [10], 'output_shape': [10],
        'grad_norm': round(float(np.linalg.norm(probs)), 6),
        'layer_type': 'softmax', 'arch_layer_index': 13,
        'data': {'probs': [round(float(p), 4) for p in probs]}})
    # FW 14: Prediction
    fw_steps.append({'step': 14, 'title': '预测结果',
        'formula': r'\hat{y} = \arg\max_i\; \hat{y}_i',
        'description': f'预测数字: {predicted}, 置信度: {probs[predicted]*100:.1f}%',
        'input_shape': [10], 'output_shape': [1],
        'grad_norm': round(float(probs[predicted]), 6),
        'layer_type': 'prediction', 'arch_layer_index': 14,
        'data': {'predicted': predicted, 'confidence': round(float(probs[predicted]), 4),
                 'probs': [round(float(p), 4) for p in probs]}})

    trace = {
        'sample': {
            'image': x_raw.round(4).tolist(),
            'label': int(label),
            'predicted': predicted,
            'loss': round(float(loss), 6),
            'correct': predicted == label,
            'lr': lr,
        },
        'architecture': [
            {'arch_index': 0,  'name': 'Input', 'shape': '1×28×28', 'group': '输入', 'static': True, 'heatmap': x_raw.round(3).tolist()},
            {'arch_index': 1,  'name': 'Conv1.W\n(6@5×5)', 'shape': '6×1×5×5', 'group': '卷积块 1', 'static': True, 'kernels': arch_conv1_kernels},
            {'arch_index': 2,  'name': 'Conv1.out\nTanh', 'shape': '6×24×24', 'group': '卷积块 1', 'static': False, 'heatmap': c1_act[0].round(3).tolist()},
            {'arch_index': 3,  'name': 'Pool1', 'shape': '6×12×12', 'group': '卷积块 1', 'static': False, 'heatmap': p1_out[0].round(3).tolist()},
            {'arch_index': 4,  'name': 'Conv2.W\n(16@6×5×5)', 'shape': '16×6×5×5', 'group': '卷积块 2', 'static': True, 'kernels': arch_conv2_kernels},
            {'arch_index': 5,  'name': 'Conv2.out\nTanh', 'shape': '16×8×8', 'group': '卷积块 2', 'static': False, 'heatmap': c2_act[0].round(3).tolist()},
            {'arch_index': 6,  'name': 'Pool2', 'shape': '16×4×4', 'group': '卷积块 2', 'static': False, 'channels': [p2_out[i].round(3).tolist() for i in range(16)]},
            {'arch_index': 7,  'name': 'Flatten', 'shape': '256', 'group': '全连接', 'static': False, 'vector': flat[:28].round(3).tolist()},
            {'arch_index': 8,  'name': 'FC1\n(256→120)', 'shape': '120×256', 'group': '全连接', 'static': True, 'heatmap': arch_fc1_slice},
            {'arch_index': 9,  'name': 'Tanh', 'shape': '120', 'group': '全连接', 'static': False, 'vector': fc1_act[:20].round(3).tolist()},
            {'arch_index': 10, 'name': 'FC2\n(120→84)', 'shape': '84×120', 'group': '全连接', 'static': True, 'heatmap': arch_fc2_slice},
            {'arch_index': 11, 'name': 'Tanh', 'shape': '84', 'group': '全连接', 'static': False, 'vector': fc2_act[:20].round(3).tolist()},
            {'arch_index': 12, 'name': 'FC3\n(84→10)', 'shape': '10×84', 'group': '全连接', 'static': True, 'heatmap': arch_fc3_full},
            {'arch_index': 13, 'name': 'Softmax', 'shape': '10', 'group': '全连接', 'static': False, 'vector': probs.round(4).tolist()},
            {'arch_index': 14, 'name': 'Loss', 'shape': 'CE', 'group': '全连接', 'static': False, 'value': round(float(loss), 4)},
        ],
        'grad_norms': grad_norms,
        'steps': steps,
        'forward_steps': fw_steps,
    }
    return _attach_visuals(trace)


def compute_training_trace_sequence(num_iterations=30, lr=0.01):
    """Run a real mini-training loop and return traces for each iteration.

    Each trace contains:
    - forward_steps (14 steps): forward pass activations
    - steps (13 steps): backward pass gradients with W_before/W_grad/W_after
    - architecture with static flags
    - sample.iteration, sample.loss, sample.was_updated

    Weights are actually updated between iterations, so W evolves across traces.
    """
    W = _random_weights()
    traces = []
    rng = np.random.default_rng(42)

    # Pre-load MNIST test set
    import gzip, struct
    test_img_path = os.path.join(PROJECT_ROOT, 'mnist_data', 't10k-images-idx3-ubyte.gz')
    test_lbl_path = os.path.join(PROJECT_ROOT, 'mnist_data', 't10k-labels-idx1-ubyte.gz')
    with gzip.open(test_img_path, 'rb') as f:
        _, n, rows, cols = struct.unpack('>IIII', f.read(16))
        images = np.frombuffer(f.read(), dtype=np.uint8).reshape(n, rows, cols).astype(np.float32) / 255.0
    with gzip.open(test_lbl_path, 'rb') as f:
        _, n_labels = struct.unpack('>II', f.read(8))
        labels = np.frombuffer(f.read(), dtype=np.uint8)

    for it in range(num_iterations):
        idx = rng.integers(0, len(images))
        x_raw = images[idx]
        label = int(labels[idx])
        x = x_raw[np.newaxis, :, :].astype(np.float32)

        # ---- Forward ----
        c1_out = _conv2d_forward(x, W['conv1.W'], W['conv1.b'])
        c1_act = np.tanh(c1_out)
        p1_out = _avg_pool2d_forward(c1_act)
        c2_out = _conv2d_forward(p1_out, W['conv2.W'], W['conv2.b'])
        c2_act = np.tanh(c2_out)
        p2_out = _avg_pool2d_forward(c2_act)
        flat = p2_out.ravel()
        fc1_out = np.dot(W['fc1.W'], flat) + W['fc1.b']
        fc1_act = np.tanh(fc1_out)
        fc2_out = np.dot(W['fc2.W'], fc1_act) + W['fc2.b']
        fc2_act = np.tanh(fc2_out)
        fc3_out = np.dot(W['fc3.W'], fc2_act) + W['fc3.b']
        shifted = fc3_out - np.max(fc3_out)
        probs = np.exp(shifted) / np.sum(np.exp(shifted))
        loss = -np.log(max(probs[label], 1e-12))
        predicted = int(np.argmax(probs))

        # ---- Backward (compute gradients) ----
        d_fc3 = probs.copy(); d_fc3[label] -= 1.0
        d_W_fc3 = np.outer(d_fc3, fc2_act)
        d_fc2_act = np.dot(W['fc3.W'].T, d_fc3)
        d_fc2_out = d_fc2_act * (1 - fc2_act ** 2)
        d_W_fc2 = np.outer(d_fc2_out, fc1_act)
        d_fc1_act = np.dot(W['fc2.W'].T, d_fc2_out)
        d_fc1_out = d_fc1_act * (1 - fc1_act ** 2)
        d_W_fc1 = np.outer(d_fc1_out, flat)
        d_flat = np.dot(W['fc1.W'].T, d_fc1_out)
        d_p2 = d_flat.reshape(16, 4, 4)
        d_c2_act = _avg_pool2d_backward(d_p2, c2_act.shape)
        d_c2_out = d_c2_act * (1 - c2_act ** 2)
        d_p1, d_W2, d_b2 = _conv2d_backward(p1_out, W['conv2.W'], d_c2_out)
        d_c1_act = _avg_pool2d_backward(d_p1, c1_act.shape)
        d_c1_out = d_c1_act * (1 - c1_act ** 2)
        d_x, d_W1, d_b1 = _conv2d_backward(x, W['conv1.W'], d_c1_out)
        d_b_fc3 = d_fc3; d_b_fc2 = d_fc2_out; d_b_fc1 = d_fc1_out

        # Snapshot W_before for all weight layers
        W_before = {k: v.copy() for k, v in W.items()}

        # ---- Weight update ----
        for key, grad in [('conv1.W', d_W1), ('conv1.b', d_b1),
                          ('conv2.W', d_W2), ('conv2.b', d_b2),
                          ('fc1.W', d_W_fc1), ('fc1.b', d_b_fc1),
                          ('fc2.W', d_W_fc2), ('fc2.b', d_b_fc2),
                          ('fc3.W', d_W_fc3), ('fc3.b', d_b_fc3)]:
            W[key] -= lr * grad

        # ---- Build forward steps ----
        fw_steps = []
        fw_steps.append({'step': 1, 'title': 'Conv1 卷积 (1→6, 5×5)',
            'formula': r'\mathbf{Z}_1 = \mathbf{X} \star \mathbf{W}_1 + \mathbf{b}_1',
            'description': '6个5×5卷积核在28×28输入上滑动，输出6×24×24',
            'input_shape': [1, 28, 28], 'output_shape': [6, 24, 24],
            'grad_norm': round(float(np.linalg.norm(c1_out)), 6),
            'layer_type': 'conv_forward', 'arch_layer_index': 1,
            'data': {'output_ch0': c1_out[0].round(4).tolist(), 'output_ch1': c1_out[1].round(4).tolist() if c1_out.shape[0] > 1 else []}})
        fw_steps.append({'step': 2, 'title': 'Tanh (Conv1 之后)',
            'formula': r'\mathbf{a}_1 = \tanh(\mathbf{Z}_1)',
            'description': f'非线性激活，值域(-1,1)',
            'input_shape': [6, 24, 24], 'output_shape': [6, 24, 24],
            'grad_norm': round(float(np.linalg.norm(c1_act)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 2,
            'data': {'act_ch0': c1_act[0].round(3).tolist()}})
        fw_steps.append({'step': 3, 'title': 'Pool1 平均池化 (2×2)',
            'formula': r'y_{i,j} = \frac{1}{4}\sum x_{2i+u,2j+v}',
            'description': '2×2窗口取平均，24×24→12×12',
            'input_shape': [6, 24, 24], 'output_shape': [6, 12, 12],
            'grad_norm': round(float(np.linalg.norm(p1_out)), 6),
            'layer_type': 'pool_forward', 'arch_layer_index': 3,
            'data': {'output_ch0': p1_out[0].round(4).tolist()}})
        fw_steps.append({'step': 4, 'title': 'Conv2 卷积 (6→16, 5×5)',
            'formula': r'\mathbf{Z}_2 = \mathbf{a}_1^{\text{pool}} \star \mathbf{W}_2 + \mathbf{b}_2',
            'description': '16个5×5×6卷积核，12×12→8×8',
            'input_shape': [6, 12, 12], 'output_shape': [16, 8, 8],
            'grad_norm': round(float(np.linalg.norm(c2_out)), 6),
            'layer_type': 'conv_forward', 'arch_layer_index': 4,
            'data': {'output_ch0': c2_out[0].round(4).tolist()}})
        fw_steps.append({'step': 5, 'title': 'Tanh (Conv2 之后)',
            'formula': r'\mathbf{a}_2 = \tanh(\mathbf{Z}_2)',
            'description': '16通道特征图非线性激活',
            'input_shape': [16, 8, 8], 'output_shape': [16, 8, 8],
            'grad_norm': round(float(np.linalg.norm(c2_act)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 5,
            'data': {'act_ch0': c2_act[0].round(3).tolist()}})
        fw_steps.append({'step': 6, 'title': 'Pool2 平均池化 (2×2)',
            'formula': r'y_{i,j} = \frac{1}{4}\sum x_{2i+u,2j+v}',
            'description': '8×8→4×4，进一步降采样',
            'input_shape': [16, 8, 8], 'output_shape': [16, 4, 4],
            'grad_norm': round(float(np.linalg.norm(p2_out)), 6),
            'layer_type': 'pool_forward', 'arch_layer_index': 6,
            'data': {'input_ch0': c2_act[0].round(4).tolist(),
                     'output_ch0': p2_out[0].round(4).tolist(),
                     'output_channels': [p2_out[i].round(3).tolist() for i in range(min(8, 16))]}})
        fw_steps.append({'step': 7, 'title': 'Flatten 展平 (16×4×4→256)',
            'formula': r'\mathbf{v} = \text{flatten}(\mathbf{a}_2^{\text{pool}})',
            'description': '将16通道×4×4的特征图展平为256维向量',
            'input_shape': [16, 4, 4], 'output_shape': [256],
            'grad_norm': round(float(np.linalg.norm(flat)), 6),
            'layer_type': 'flatten', 'arch_layer_index': 7,
            'data': {'first16': [round(float(x), 4) for x in flat[:16]]}})
        fw_steps.append({'step': 8, 'title': 'FC1 全连接 (256→120)',
            'formula': r'\mathbf{z}_1 = \mathbf{W}_1 \mathbf{v} + \mathbf{b}_1',
            'description': '120个神经元',
            'input_shape': [256], 'output_shape': [120],
            'grad_norm': round(float(np.linalg.norm(fc1_out)), 6),
            'layer_type': 'linear_forward', 'arch_layer_index': 8,
            'data': {'W_slice': _matrix_slice(W_before['fc1.W'], 8, 16),
                     'output_vec': [round(float(x), 4) for x in fc1_out[:16]]}})
        fw_steps.append({'step': 9, 'title': 'Tanh (FC1 之后)',
            'formula': r'\mathbf{a}_1 = \tanh(\mathbf{z}_1)',
            'description': '120维向量逐元素激活',
            'input_shape': [120], 'output_shape': [120],
            'grad_norm': round(float(np.linalg.norm(fc1_act)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 9,
            'data': {'act_vals': [round(float(x), 4) for x in fc1_act[:20]]}})
        fw_steps.append({'step': 10, 'title': 'FC2 全连接 (120→84)',
            'formula': r'\mathbf{z}_2 = \mathbf{W}_2 \mathbf{a}_1 + \mathbf{b}_2',
            'description': '84个神经元',
            'input_shape': [120], 'output_shape': [84],
            'grad_norm': round(float(np.linalg.norm(fc2_out)), 6),
            'layer_type': 'linear_forward', 'arch_layer_index': 10,
            'data': {'W_slice': _matrix_slice(W_before['fc2.W'], 8, 12),
                     'output_vec': [round(float(x), 4) for x in fc2_out[:16]]}})
        fw_steps.append({'step': 11, 'title': 'Tanh (FC2 之后)',
            'formula': r'\mathbf{a}_2 = \tanh(\mathbf{z}_2)',
            'description': '84维向量激活',
            'input_shape': [84], 'output_shape': [84],
            'grad_norm': round(float(np.linalg.norm(fc2_act)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 11,
            'data': {'act_vals': [round(float(x), 4) for x in fc2_act[:20]]}})
        fw_steps.append({'step': 12, 'title': 'FC3 全连接 (84→10)',
            'formula': r'\mathbf{z}_3 = \mathbf{W}_3 \mathbf{a}_2 + \mathbf{b}_3',
            'description': '输出10个logits',
            'input_shape': [84], 'output_shape': [10],
            'grad_norm': round(float(np.linalg.norm(fc3_out)), 6),
            'layer_type': 'linear_forward', 'arch_layer_index': 12,
            'data': {'W_slice': _matrix_slice(W_before['fc3.W'], 10, 8),
                     'logits': [round(float(x), 4) for x in fc3_out]}})
        fw_steps.append({'step': 13, 'title': 'Softmax',
            'formula': r'\hat{y}_i = \frac{e^{z_i}}{\sum e^{z_j}}',
            'description': '将10个logits转换为0-9概率分布',
            'input_shape': [10], 'output_shape': [10],
            'grad_norm': round(float(np.linalg.norm(probs)), 6),
            'layer_type': 'softmax', 'arch_layer_index': 13,
            'data': {'probs': [round(float(p), 4) for p in probs]}})
        fw_steps.append({'step': 14, 'title': '预测结果',
            'formula': r'\hat{y} = \arg\max_i\; \hat{y}_i',
            'description': f'预测: {predicted}, 置信度: {probs[predicted]*100:.1f}%',
            'input_shape': [10], 'output_shape': [1],
            'grad_norm': round(float(probs[predicted]), 6),
            'layer_type': 'prediction', 'arch_layer_index': 14,
            'data': {'predicted': predicted, 'confidence': round(float(probs[predicted]), 4),
                     'probs': [round(float(p), 4) for p in probs]}})

        # ---- Build backward steps with arch_update showing real W changes ----
        bw_steps = []
        bw_steps.append({'step': 1, 'title': 'Softmax + Cross-Entropy Loss',
            'formula': r'\frac{\partial L}{\partial \mathbf{z}_3} = \hat{\mathbf{y}} - \mathbf{y}_{\mathrm{one-hot}}',
            'description': f'真实标签={label}, 预测={predicted}, Loss={loss:.4f}',
            'input_shape': [10], 'output_shape': [10],
            'grad_norm': round(float(np.linalg.norm(d_fc3)), 6),
            'layer_type': 'softmax_ce', 'arch_layer_index': 14,
            'data': {'probs': [round(float(p), 4) for p in probs], 'target': int(label)}})
        # FC3 weights (arch 12)
        bw_steps.append({'step': 2, 'title': 'FC3 全连接层 (10→84)',
            'formula': r'\frac{\partial L}{\partial \mathbf{W}_3} = \mathbf{\delta}_3 \cdot \mathbf{a}_2^\top',
            'description': 'W_fc3: 10×84',
            'input_shape': [10], 'output_shape': [84],
            'grad_norm': round(float(np.linalg.norm(d_W_fc3)), 6),
            'layer_type': 'linear', 'arch_layer_index': 12,
            'arch_update': {'W_before': W_before['fc3.W'].round(3).tolist(), 'W_grad': d_W_fc3.round(3).tolist(),
                            'W_after': W['fc3.W'].round(3).tolist(), 'lr': lr, 'type': 'heatmap'},
            'data': {'W_slice': _matrix_slice(W_before['fc3.W'], 10, 8), 'W_grad_slice': _matrix_slice(d_W_fc3, 10, 8)}})
        bw_steps.append({'step': 3, 'title': "Tanh' (FC2 之后)",
            'formula': r'\frac{\partial L}{\partial \mathbf{z}_2} = \mathbf{\delta}_2^{\text{act}} \odot (1 - \tanh^2(\mathbf{z}_2))',
            'description': f'激活值范围: [{fc2_act.min():.4f}, {fc2_act.max():.4f}]',
            'input_shape': [84], 'output_shape': [84],
            'grad_norm': round(float(np.linalg.norm(d_fc2_out)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 11, 'data': {'act_vals': [round(float(x), 4) for x in fc2_act[:16]], 'grad_vals': [round(float(x), 6) for x in d_fc2_out[:16]]}})
        bw_steps.append({'step': 4, 'title': 'FC2 全连接层 (84→120)',
            'formula': r'\frac{\partial L}{\partial \mathbf{W}_2} = \mathbf{\delta}_2^{\text{out}} \cdot \mathbf{a}_1^\top',
            'description': 'W_fc2: 84×120',
            'input_shape': [84], 'output_shape': [120],
            'grad_norm': round(float(np.linalg.norm(d_W_fc2)), 6),
            'layer_type': 'linear', 'arch_layer_index': 10,
            'arch_update': {'W_before': _matrix_slice(W_before['fc2.W'], 16, 20), 'W_grad': _matrix_slice(d_W_fc2, 16, 20),
                            'W_after': _matrix_slice(W['fc2.W'], 16, 20), 'lr': lr, 'type': 'heatmap'},
            'data': {'W_slice': _matrix_slice(W_before['fc2.W'], 8, 8), 'W_grad_slice': _matrix_slice(d_W_fc2, 8, 8)}})
        bw_steps.append({'step': 5, 'title': "Tanh' (FC1 之后)",
            'formula': r'\frac{\partial L}{\partial \mathbf{z}_1} = \mathbf{\delta}_1^{\text{act}} \odot (1 - \tanh^2(\mathbf{z}_1))',
            'description': f'激活值范围: [{fc1_act.min():.4f}, {fc1_act.max():.4f}]',
            'input_shape': [120], 'output_shape': [120],
            'grad_norm': round(float(np.linalg.norm(d_fc1_out)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 9, 'data': {'act_vals': [round(float(x), 4) for x in fc1_act[:16]], 'grad_vals': [round(float(x), 6) for x in d_fc1_out[:16]]}})
        bw_steps.append({'step': 6, 'title': 'FC1 全连接层 (120→256)',
            'formula': r'\frac{\partial L}{\partial \mathbf{W}_1} = \mathbf{\delta}_1^{\text{out}} \cdot \mathbf{a}_0^\top',
            'description': 'W_fc1: 120×256',
            'input_shape': [120], 'output_shape': [256],
            'grad_norm': round(float(np.linalg.norm(d_W_fc1)), 6),
            'layer_type': 'linear', 'arch_layer_index': 8,
            'arch_update': {'W_before': _matrix_slice(W_before['fc1.W'], 16, 24), 'W_grad': _matrix_slice(d_W_fc1, 16, 24),
                            'W_after': _matrix_slice(W['fc1.W'], 16, 24), 'lr': lr, 'type': 'heatmap'},
            'data': {'W_slice': _matrix_slice(W_before['fc1.W'], 8, 12), 'W_grad_slice': _matrix_slice(d_W_fc1, 8, 12)}})
        bw_steps.append({'step': 7, 'title': 'Reshape (256 → 16×4×4)',
            'formula': r'\mathbf{\delta}_{P2} = \text{reshape}(\mathbf{\delta}_{\text{flat}},\; (16, 4, 4))',
            'description': '将256维向量重塑为16通道×4×4',
            'input_shape': [256], 'output_shape': [16, 4, 4],
            'grad_norm': round(float(np.linalg.norm(d_p2)), 6),
            'layer_type': 'reshape', 'arch_layer_index': 7,
            'data': {'flat_grad_first12': [round(float(x), 6) for x in d_flat[:12]],
                     'd_p2_ch0': d_p2[0].round(6).tolist()}})
        bw_steps.append({'step': 8, 'title': 'AvgPool2 反向传播',
            'formula': r'\frac{\partial L}{\partial x} = \frac{1}{k^2} \frac{\partial L}{\partial y}',
            'description': '2×2平均池化梯度上采样 (16×4×4→16×8×8)',
            'input_shape': [16, 4, 4], 'output_shape': [16, 8, 8],
            'grad_norm': round(float(np.linalg.norm(d_c2_act)), 6),
            'layer_type': 'pool_backward', 'arch_layer_index': 6,
            'data': {'input_ch0': d_p2[0].round(6).tolist(),
                     'output_ch0': d_c2_act[0].round(6).tolist(),
                     'output_ch0_slice': d_c2_act[0,:4,:4].round(4).tolist()}})
        bw_steps.append({'step': 9, 'title': "Tanh' (Conv2 之后)",
            'formula': r'\frac{\partial L}{\partial \mathbf{C}_2} = \mathbf{\delta}_{C2} \odot (1 - \tanh^2(\mathbf{C}_2))',
            'description': '16通道×8×8',
            'input_shape': [16, 8, 8], 'output_shape': [16, 8, 8],
            'grad_norm': round(float(np.linalg.norm(d_c2_out)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 5,
            'data': {'act_vals': [round(float(x), 4) for x in c2_act.ravel()[:16]],
                     'grad_vals': [round(float(x), 6) for x in d_c2_out.ravel()[:16]],
                     'act_ch0': c2_act[0].round(4).tolist(),
                     'grad_ch0': d_c2_out[0].round(6).tolist()}})
        bw_steps.append({'step': 10, 'title': 'Conv2 卷积层反向 (16×6×5×5)',
            'formula': r'\frac{\partial L}{\partial \mathbf{W}_{C2}} = \mathbf{X}_{P1} \star \mathbf{\delta}_{C2}',
            'description': 'Conv2: 6→16通道, 5×5核',
            'input_shape': [6, 12, 12], 'output_shape': [16, 8, 8],
            'grad_norm': round(float(np.linalg.norm(d_W2)), 6),
            'layer_type': 'conv_backward', 'arch_layer_index': 4,
            'arch_update': {'W_before': [W_before['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))],
                            'W_grad': [d_W2[i, 0].round(3).tolist() for i in range(min(8, 16))],
                            'W_after': [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))],
                            'lr': lr, 'type': 'kernels'},
            'data': {'d_W_ch0': d_W2[0,0].round(4).tolist(),
                     'd_W_ch1': d_W2[0,1].round(4).tolist() if d_W2.shape[1] > 1 else [],
                     'd_W_ch2': d_W2[0,2].round(4).tolist() if d_W2.shape[1] > 2 else [],
                     'd_x_ch0': d_p1[0].round(6).tolist(),
                     'd_x_ch0_slice': d_p1[0,:4,:4].round(6).tolist()}})
        bw_steps.append({'step': 11, 'title': 'AvgPool1 反向传播',
            'formula': r'\frac{\partial L}{\partial x} = \frac{1}{k^2} \frac{\partial L}{\partial y}',
            'description': '2×2平均池化梯度上采样 (6×12×12→6×24×24)',
            'input_shape': [6, 12, 12], 'output_shape': [6, 24, 24],
            'grad_norm': round(float(np.linalg.norm(d_c1_act)), 6),
            'layer_type': 'pool_backward', 'arch_layer_index': 3,
            'data': {'input_ch0': d_p1[0].round(6).tolist(),
                     'output_ch0': d_c1_act[0].round(6).tolist(),
                     'output_ch0_slice': d_c1_act[0,:6,:6].round(6).tolist()}})
        bw_steps.append({'step': 12, 'title': "Tanh' (Conv1 之后)",
            'formula': r'\frac{\partial L}{\partial \mathbf{C}_1} = \mathbf{\delta}_{C1} \odot (1 - \tanh^2(\mathbf{C}_1))',
            'description': '6通道×24×24',
            'input_shape': [6, 24, 24], 'output_shape': [6, 24, 24],
            'grad_norm': round(float(np.linalg.norm(d_c1_out)), 6),
            'layer_type': 'tanh', 'arch_layer_index': 2,
            'data': {'act_vals': [round(float(x), 4) for x in c1_act.ravel()[:16]],
                     'grad_vals': [round(float(x), 6) for x in d_c1_out.ravel()[:16]],
                     'act_ch0': c1_act[0].round(4).tolist(),
                     'grad_ch0': d_c1_out[0].round(6).tolist()}})
        bw_steps.append({'step': 13, 'title': 'Conv1 卷积层反向 (6×1×5×5)',
            'formula': r'\frac{\partial L}{\partial \mathbf{W}_{C1}} = \mathbf{X}_{\text{input}} \star \mathbf{\delta}_{C1}',
            'description': 'Conv1: 1→6通道, 5×5核',
            'input_shape': [1, 28, 28], 'output_shape': [6, 24, 24],
            'grad_norm': round(float(np.linalg.norm(d_W1)), 6),
            'layer_type': 'conv_backward', 'arch_layer_index': 1,
            'arch_update': {'W_before': [W_before['conv1.W'][i, 0].round(3).tolist() for i in range(6)],
                            'W_grad': [d_W1[i, 0].round(3).tolist() for i in range(6)],
                            'W_after': [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)],
                            'lr': lr, 'type': 'kernels'},
            'data': {'d_W_ch0': d_W1[0,0].round(4).tolist(),
                     'd_W_ch1': d_W1[1,0].round(4).tolist() if d_W1.shape[0] > 1 else [],
                     'd_W_ch2': d_W1[2,0].round(4).tolist() if d_W1.shape[0] > 2 else [],
                     'd_x_ch0': d_x[0].round(6).tolist(),
                     'd_x_slice': d_x[0,:8,:8].round(6).tolist()}})

        # Architecture with current weights
        arch_conv1_kernels = [W['conv1.W'][i, 0].round(3).tolist() for i in range(6)]
        arch_conv2_kernels = [W['conv2.W'][i, 0].round(3).tolist() for i in range(min(8, 16))]
        arch_fc1_slice = _matrix_slice(W['fc1.W'], 16, 24)
        arch_fc2_slice = _matrix_slice(W['fc2.W'], 16, 20)
        arch_fc3_full = W['fc3.W'].round(3).tolist()

        trace = {
            'sample': {
                'image': x_raw.round(4).tolist(),
                'label': int(label),
                'predicted': predicted,
                'loss': round(float(loss), 6),
                'correct': predicted == label,
                'lr': lr,
                'iteration': it + 1,
            },
            'architecture': [
                {'arch_index': 0,  'name': 'Input', 'shape': '1×28×28', 'group': '输入', 'static': True, 'heatmap': x_raw.round(3).tolist()},
                {'arch_index': 1,  'name': 'Conv1.W\n(6@5×5)', 'shape': '6×1×5×5', 'group': '卷积块 1', 'static': True, 'kernels': arch_conv1_kernels},
                {'arch_index': 2,  'name': 'Conv1.out\nTanh', 'shape': '6×24×24', 'group': '卷积块 1', 'static': False, 'heatmap': c1_act[0].round(3).tolist()},
                {'arch_index': 3,  'name': 'Pool1', 'shape': '6×12×12', 'group': '卷积块 1', 'static': False, 'heatmap': p1_out[0].round(3).tolist()},
                {'arch_index': 4,  'name': 'Conv2.W\n(16@6×5×5)', 'shape': '16×6×5×5', 'group': '卷积块 2', 'static': True, 'kernels': arch_conv2_kernels},
                {'arch_index': 5,  'name': 'Conv2.out\nTanh', 'shape': '16×8×8', 'group': '卷积块 2', 'static': False, 'heatmap': c2_act[0].round(3).tolist()},
                {'arch_index': 6,  'name': 'Pool2', 'shape': '16×4×4', 'group': '卷积块 2', 'static': False, 'channels': [p2_out[i].round(3).tolist() for i in range(16)]},
                {'arch_index': 7,  'name': 'Flatten', 'shape': '256', 'group': '全连接', 'static': False, 'vector': flat[:28].round(3).tolist()},
                {'arch_index': 8,  'name': 'FC1\n(256→120)', 'shape': '120×256', 'group': '全连接', 'static': True, 'heatmap': arch_fc1_slice},
                {'arch_index': 9,  'name': 'Tanh', 'shape': '120', 'group': '全连接', 'static': False, 'vector': fc1_act[:20].round(3).tolist()},
                {'arch_index': 10, 'name': 'FC2\n(120→84)', 'shape': '84×120', 'group': '全连接', 'static': True, 'heatmap': arch_fc2_slice},
                {'arch_index': 11, 'name': 'Tanh', 'shape': '84', 'group': '全连接', 'static': False, 'vector': fc2_act[:20].round(3).tolist()},
                {'arch_index': 12, 'name': 'FC3\n(84→10)', 'shape': '10×84', 'group': '全连接', 'static': True, 'heatmap': arch_fc3_full},
                {'arch_index': 13, 'name': 'Softmax', 'shape': '10', 'group': '全连接', 'static': False, 'vector': probs.round(4).tolist()},
                {'arch_index': 14, 'name': 'Loss', 'shape': 'CE', 'group': '全连接', 'static': False, 'value': round(float(loss), 4)},
            ],
            'grad_norms': [s['grad_norm'] for s in bw_steps],
            'steps': bw_steps,
            'forward_steps': fw_steps,
        }
        traces.append(_attach_visuals(trace))

    return traces
