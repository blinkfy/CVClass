"""Pipeline builder for training observation module."""
import numpy as np
from app.modules.phase4_deep_learning.conv_training.algorithm import train_kernel


def _kernel_to_heatmap(kernel_2d):
    """Convert a 2D kernel matrix to a small heatmap image for display."""
    k = np.asarray(kernel_2d, dtype=np.float64)
    if k.size == 0:
        return np.zeros((32, 32, 3), dtype=np.uint8)
    vmin, vmax = float(k.min()), float(k.max())
    if vmax - vmin < 1e-8:
        normalized = np.zeros_like(k)
    else:
        normalized = (k - vmin) / (vmax - vmin)
    # Upsample to visible size
    h, w = k.shape
    scale = max(1, 64 // max(h, w))
    big = np.kron(normalized, np.ones((scale, scale)))
    # Apply colormap: blue=negative, white=zero, red=positive
    r = np.clip(big * 255, 0, 255).astype(np.uint8)
    g = np.clip((1 - np.abs(big - 0.5) * 2) * 200, 0, 255).astype(np.uint8)
    b = np.clip((1 - big) * 255, 0, 255).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def build_pipeline(image_path=None, target_preset='edge_detect',
                   kernel_size=3, input_size=7,
                   learning_rate=0.1, iterations=100, **kwargs):
    """
    Build training observation pipeline.

    Returns:
        dict with 'steps' (initial, mid-training, final kernel visualizations)
        and 'metrics' (final loss, convergence info).
        Also includes the raw training trace for the frontend loss chart.
    """
    # Handle param name from frontend (target_preset) and API (preset)
    preset = kwargs.get('preset', target_preset)
    ksize = int(kwargs.get('kernel_size', kernel_size))
    n = int(kwargs.get('input_size', input_size))
    lr = float(kwargs.get('learning_rate', learning_rate))
    steps = int(kwargs.get('iterations', iterations))

    result = train_kernel(
        target_preset=preset,
        kernel_size=ksize,
        input_size=n,
        learning_rate=lr,
        iterations=steps,
    )

    trace = result['iterations']
    target_k = np.array(result['target_kernel'])

    # Build visualization steps from trace
    pipeline_steps = []

    # Step 1: Target kernel
    pipeline_steps.append({
        'id': 'target',
        'name': '目标卷积核',
        'image': _kernel_to_heatmap(target_k),
        'explanation': f'训练目标：{preset} 核 ({ksize}×{ksize})',
    })

    # Step 2: Initial kernel (first recorded)
    if trace:
        init_k = np.array(trace[0]['kernel'])
        pipeline_steps.append({
            'id': 'initial',
            'name': f'初始核 (step {trace[0]["step"]})',
            'image': _kernel_to_heatmap(init_k),
            'explanation': f'随机初始化，loss={trace[0]["loss"]:.4f}',
        })

    # Step 3: Mid-training kernel
    if len(trace) > 2:
        mid = trace[len(trace) // 2]
        mid_k = np.array(mid['kernel'])
        pipeline_steps.append({
            'id': 'mid',
            'name': f'训练中期 (step {mid["step"]})',
            'image': _kernel_to_heatmap(mid_k),
            'explanation': f'loss 已降至 {mid["loss"]:.4f}',
        })

    # Step 4: Final kernel
    if trace:
        final = trace[-1]
        final_k = np.array(final['kernel'])
        pipeline_steps.append({
            'id': 'final',
            'name': f'最终核 (step {final["step"]})',
            'image': _kernel_to_heatmap(final_k),
            'explanation': f'训练完成，最终 loss={final["loss"]:.6f}',
        })

    # Loss curve as a rendered image
    if len(trace) >= 2:
        loss_img = _render_loss_chart(trace)
        pipeline_steps.append({
            'id': 'loss_chart',
            'name': '损失曲线',
            'image': loss_img,
            'explanation': f'{len(trace)} 步迭代，loss 从 {trace[0]["loss"]:.4f} → {trace[-1]["loss"]:.6f}',
        })

    return {
        'steps': pipeline_steps,
        'metrics': {
            'preset': preset,
            'kernel_size': ksize,
            'iterations': steps,
            'learning_rate': lr,
            'initial_loss': trace[0]['loss'] if trace else 0,
            'final_loss': round(result['final_loss'], 6),
            'converged': result['final_loss'] < 0.001,
        },
        # Pass raw trace for frontend interactive chart
        'iterations': trace,
        'target_kernel': result['target_kernel'],
    }


def _render_loss_chart(trace, width=600, height=200):
    """Render loss curve as a PNG image using pure NumPy + PIL."""
    from PIL import Image, ImageDraw
    import io

    losses = [t['loss'] for t in trace]
    max_loss = max(losses) * 1.1 or 1.0
    n = len(losses)

    img = Image.new('RGB', (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    pad_l, pad_r, pad_t, pad_b = 50, 20, 20, 30
    pw = width - pad_l - pad_r
    ph = height - pad_t - pad_b

    # Grid lines
    for i in range(5):
        y = pad_t + ph * i // 4
        draw.line([(pad_l, y), (pad_l + pw, y)], fill=(230, 230, 230))

    # Axes
    draw.line([(pad_l, pad_t), (pad_l, pad_t + ph)], fill=(180, 180, 180))
    draw.line([(pad_l, pad_t + ph), (pad_l + pw, pad_t + ph)], fill=(180, 180, 180))

    # Loss line
    points = []
    for i, loss in enumerate(losses):
        x = pad_l + int(pw * i / (n - 1))
        y = pad_t + int(ph * (1 - loss / max_loss))
        points.append((x, y))

    if len(points) > 1:
        for i in range(len(points) - 1):
            draw.line([points[i], points[i + 1]], fill=(14, 165, 233), width=2)

    # Final point
    if points:
        x, y = points[-1]
        draw.ellipse([(x - 4, y - 4), (x + 4, y + 4)], fill=(239, 68, 68))

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return np.array(img)
