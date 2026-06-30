"""Convolution kernel training via gradient descent. Pure NumPy.

Trains a small conv kernel to approximate a target kernel by minimizing
MSE loss on random input patches. Records the full training trace for
interactive visualization of loss curves, weight evolution, and convergence.
"""
import numpy as np


# ── Target kernel presets ──
def _make_target(preset, kernel_size):
    """Create a target kernel of given size."""
    k = kernel_size
    if preset == 'edge_detect':
        # Laplacian-style edge detector
        ker = -np.ones((k, k), dtype=np.float32)
        ker[k // 2, k // 2] = float(k * k - 1)
        return ker
    elif preset == 'blur':
        # Box blur / averaging kernel
        return np.ones((k, k), dtype=np.float32) / float(k * k)
    elif preset == 'sharpen':
        # Sharpen: identity + laplacian
        ker = -np.ones((k, k), dtype=np.float32) * 0.25
        ker[k // 2, k // 2] = 1.0 + float(k * k - 1) * 0.25
        return ker
    elif preset == 'random':
        rng = np.random.default_rng(42)
        return rng.normal(0, 0.5, (k, k)).astype(np.float32)
    else:
        return _make_target('edge_detect', kernel_size)


def _generate_training_batch(input_size, kernel_size, batch_size=64):
    """Generate synthetic random input patches for training."""
    k = kernel_size
    n = input_size
    rng = np.random.default_rng(12345)
    # Generate random inputs: shape (batch_size, k, k) extracted from larger random images
    patches = rng.uniform(0, 1, (batch_size, n, n)).astype(np.float32)
    return patches


def train_kernel(target_preset='edge_detect', kernel_size=3, input_size=7,
                 learning_rate=0.1, iterations=100):
    """
    Train a kernel to match a target preset via SGD.

    Args:
        target_preset: 'edge_detect' | 'blur' | 'sharpen' | 'random'
        kernel_size: size of square kernel (odd, 3 or 5)
        input_size: size of random training patches
        learning_rate: SGD step size
        iterations: number of gradient descent steps

    Returns:
        dict with:
            iterations: list of {step, loss, kernel} for each recorded step
            target_kernel: the ground-truth kernel (2D list)
            final_kernel: trained kernel (2D list)
            final_loss: float
    """
    k = max(1, int(kernel_size))
    if k % 2 == 0:
        k += 1
    n = max(k, int(input_size))
    lr = float(learning_rate)
    steps = max(1, int(iterations))

    # Target kernel
    target = _make_target(target_preset, k)

    # Initialize random kernel
    rng = np.random.default_rng(99)
    current = rng.normal(0, 0.3, (k, k)).astype(np.float64)

    # Generate fixed training data for reproducible loss curve
    patches = _generate_training_batch(n, k, batch_size=64)

    # Record interval: record every N steps (at least 50 records, at most steps)
    record_interval = max(1, steps // 80)

    trace = []
    final_loss = 0.0

    for step in range(steps):
        # Convolve each patch with current kernel
        # patches: (B, n, n), kernel: (k, k)
        # For each patch, extract all k×k windows and dot with kernel
        out_h = n - k + 1
        total_loss = 0.0
        total_grad = np.zeros((k, k), dtype=np.float64)
        count = 0

        for b in range(patches.shape[0]):
            patch = patches[b].astype(np.float64)
            for y in range(out_h):
                for x in range(out_h):
                    window = patch[y:y + k, x:x + k]
                    pred = np.sum(window * current)
                    # Target output: convolution with target kernel
                    target_out = np.sum(window * target.astype(np.float64))
                    err = pred - target_out
                    total_loss += err * err
                    total_grad += 2.0 * err * window
                    count += 1

        avg_loss = total_loss / max(count, 1)
        avg_grad = total_grad / max(count, 1)
        final_loss = avg_loss

        # Gradient descent step
        current -= lr * avg_grad

        # Record
        if step % record_interval == 0 or step == steps - 1:
            trace.append({
                'step': step,
                'loss': round(float(avg_loss), 6),
                'kernel': np.round(current, 4).tolist(),
            })

    return {
        'iterations': trace,
        'target_kernel': target.tolist(),
        'final_kernel': np.round(current, 4).tolist(),
        'final_loss': round(float(final_loss), 6),
    }


def build_pipeline(image_path=None, target_preset='edge_detect', **kwargs):
    """Real kernel training demo via gradient descent."""
    import numpy as np
    from PIL import Image
    import io, base64

    result = train_kernel(target_preset=target_preset, kernel_size=3, input_size=7,
                          learning_rate=0.1, iterations=100)

    def _b64(arr):
        b = io.BytesIO(); Image.fromarray(arr).save(b, 'PNG')
        return base64.b64encode(b.getvalue()).decode()

    # Loss curve visualization
    losses = result.get('loss_history', [])
    loss_vis = np.zeros((150, 300, 3), dtype=np.uint8) + 20
    if losses:
        max_l = max(losses) if losses else 1
        for i, l in enumerate(losses):
            x = int(i / max(len(losses)-1, 1) * 280) + 10
            y = 130 - int(l / max(max_l, 1e-8) * 110)
            loss_vis[y:y+2, x:x+2] = [239, 68, 68]

    # Kernel visualization
    target = np.array(result.get('target_kernel', [])).reshape(3,3) if result.get('target_kernel') else np.zeros((3,3))
    final = np.array(result.get('final_kernel', [])).reshape(3,3) if result.get('final_kernel') else np.zeros((3,3))
    kv = np.zeros((80, 160, 3), dtype=np.uint8) + 30
    if target.size == 9 and final.size == 9:
        for r in range(3):
            for c in range(3):
                tv = int((target[r,c] - target.min()) / max(target.max()-target.min(), 1e-8) * 60)
                fv = int((final[r,c] - final.min()) / max(final.max()-final.min(), 1e-8) * 60)
                kv[10+r*22:10+r*22+tv, 10+c*22:10+c*22+15] = [59,130,246]
                kv[10+r*22:10+r*22+fv, 90+c*22:90+c*22+15] = [34,197,94]

    return {'steps': [
        {'id': 'loss', 'name': '损失曲线 (100轮)', 'image': _b64(loss_vis),
         'explanation': f'SGD训练100轮，最终损失={result.get("final_loss",0):.6f}。红色=损失下降轨迹。'},
        {'id': 'kernels', 'name': '目标核(蓝) vs 学习核(绿)', 'image': _b64(kv),
         'explanation': '左=目标核，右=梯度下降学到的核。绿色接近蓝色表示学习成功。'},
    ], 'metrics': {
        'status': 'numpy_algorithm', 'backend': 'NumPy SGD',
        'algorithm': 'Kernel Gradient Descent',
        'iterations': 100, 'final_loss': round(result.get('final_loss', 0), 6),
    }}
