import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def generate_matrix(h, w, seed=None):
    rng = np.random.default_rng(seed)
    return rng.integers(0, 10, size=(h, w)).astype(np.int32).tolist()


def generate_kernel(size, preset='random', seed=None):
    rng = np.random.default_rng(seed)
    if preset == 'edge_detect':
        k = np.full((size, size), -1, dtype=np.float64)
        center = size // 2
        k[center, center] = size * size - 1
        return k.round(2).tolist()
    elif preset == 'blur':
        return np.full((size, size), 1.0 / (size * size)).round(3).tolist()
    elif preset == 'sharpen':
        k = np.full((size, size), -1.0, dtype=np.float64)
        center = size // 2
        k[center, center] = size * size
        return k.round(2).tolist()
    else:
        return rng.integers(-3, 4, size=(size, size)).astype(np.float64).tolist()


def compute_output_shape(h_in, w_in, k, stride, padding, dilation):
    h_out = (h_in + 2 * padding - dilation * (k - 1) - 1) // stride + 1
    w_out = (w_in + 2 * padding - dilation * (k - 1) - 1) // stride + 1
    return h_out, w_out


def _apply_padding(input_2d, padding):
    if padding == 0:
        return np.array(input_2d, dtype=np.int32)
    return np.pad(np.array(input_2d, dtype=np.int32), padding, mode='constant', constant_values=0)


def _effective_kernel(kernel, dilation):
    k_np = np.array(kernel, dtype=np.float64)
    k_size = k_np.shape[0]
    if dilation == 1:
        return k_np
    eff_size = (k_size - 1) * dilation + 1
    eff = np.zeros((eff_size, eff_size), dtype=np.float64)
    for i in range(k_size):
        for j in range(k_size):
            eff[i * dilation, j * dilation] = k_np[i, j]
    return eff


def conv2d_with_trace(input_2d, kernel, stride=1, padding=0, dilation=1):
    inp = _apply_padding(input_2d, padding)
    k_np = np.array(kernel, dtype=np.float64)
    k_size = k_np.shape[0]
    h_in, w_in = inp.shape
    h_out, w_out = compute_output_shape(len(input_2d), len(input_2d[0]), k_size, stride, padding, dilation)

    if dilation > 1:
        eff = _effective_kernel(kernel, dilation)
        k_view = k_np
    else:
        eff = k_np
        k_view = k_np

    windows = sliding_window_view(inp, (k_size, k_size))
    trace = []
    output = np.zeros((h_out, w_out), dtype=np.float64)

    for i in range(0, windows.shape[0] - (k_size - 1) * (dilation - 1), stride):
        for j in range(0, windows.shape[1] - (k_size - 1) * (dilation - 1), stride):
            oi, oj = i // stride, j // stride
            if oi >= h_out or oj >= w_out:
                continue

            if dilation > 1:
                patch = inp[i:i + eff.shape[0], j:j + eff.shape[1]]
                if patch.shape[0] < eff.shape[0] or patch.shape[1] < eff.shape[1]:
                    continue
                window_vals = []
                elem_products = []
                for di in range(k_size):
                    for dj in range(k_size):
                        val = inp[i + di * dilation, j + dj * dilation]
                        window_vals.append(int(val))
                        elem_products.append(round(val * k_np[di, dj], 2))
                sum_val = sum(elem_products)
            else:
                w = windows[i, j]
                window_vals = w.astype(np.int32).tolist()
                elem_products = (w.astype(np.float64) * k_view).round(2).tolist()
                if isinstance(elem_products[0], list):
                    elem_products_flat = []
                    for row in elem_products:
                        elem_products_flat.extend(row)
                    elem_products = elem_products_flat
                sum_val = round(float(np.sum(w.astype(np.float64) * k_view)), 2)

            output[oi, oj] = sum_val
            trace.append({
                'pos': [oi, oj],
                'window_start': [i, j],
                'window': window_vals,
                'elem_product': elem_products,
                'sum': sum_val,
            })

    return {
        'output': output.round(2).tolist(),
        'output_shape': [h_out, w_out],
        'trace': trace,
    }


def conv2d_multi_kernel(input_2d, kernels, stride=1, padding=0):
    results = []
    for k in kernels:
        r = conv2d_with_trace(input_2d, k, stride=stride, padding=padding)
        results.append(r['output'])
    return results


def train_kernel(target_preset, kernel_size, input_size, lr=0.05, iterations=100):
    """Simulate gradient descent to learn a target kernel."""
    rng = np.random.default_rng()
    target = np.array(generate_kernel(kernel_size, preset=target_preset), dtype=np.float64)
    current = rng.normal(0, 0.3, size=(kernel_size, kernel_size)).astype(np.float64)
    inp = rng.integers(0, 10, size=(input_size, input_size)).astype(np.float64)
    inp_norm = inp / 9.0

    target_out = np.zeros((input_size - kernel_size + 1, input_size - kernel_size + 1))
    windows = sliding_window_view(inp_norm, (kernel_size, kernel_size))
    for i in range(windows.shape[0]):
        for j in range(windows.shape[1]):
            target_out[i, j] = np.sum(windows[i, j] * target)

    trace = []
    for step in range(iterations + 1):
        current_out = np.zeros_like(target_out)
        for i in range(windows.shape[0]):
            for j in range(windows.shape[1]):
                current_out[i, j] = np.sum(windows[i, j] * current)
        loss = float(np.mean((current_out - target_out) ** 2))

        grad = np.zeros_like(current)
        n_positions = windows.shape[0] * windows.shape[1]
        for i in range(windows.shape[0]):
            for j in range(windows.shape[1]):
                error = current_out[i, j] - target_out[i, j]
                grad += error * windows[i, j]
        grad = grad / n_positions

        grad_norm = np.sqrt(np.sum(grad ** 2))
        if grad_norm > 1.0:
            grad = grad / grad_norm

        current -= lr * grad

        if step % max(1, iterations // 50) == 0 or step == iterations:
            trace.append({
                'step': step,
                'kernel': current.round(3).tolist(),
                'loss': round(loss, 6),
            })

    return {
        'iterations': trace,
        'final_kernel': current.round(3).tolist(),
        'target_kernel': target.tolist(),
        'input_matrix': inp.astype(np.int32).tolist(),
    }


def conv2d_multi_channel(input_3d, kernel_3d, stride=1, padding=0):
    c_in = len(input_3d)
    per_channel = []
    summed = None
    for c in range(c_in):
        r = conv2d_with_trace(input_3d[c], kernel_3d[c], stride=stride, padding=padding)
        out = np.array(r['output'])
        per_channel.append(out.tolist())
        if summed is None:
            summed = out
        else:
            summed = summed + out
    return {
        'per_channel': per_channel,
        'summed': summed.round(2).tolist() if summed is not None else [],
    }
