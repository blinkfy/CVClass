
"""DDPM forward diffusion — real NumPy implementation."""
import numpy as np
from app.utils.image_utils import load_image_u8

def _linear_beta_schedule(T=200, beta_start=1e-4, beta_end=0.02):
    return np.linspace(beta_start, beta_end, T, dtype=np.float64)

def build_pipeline(image_path=None, num_steps=10, **kwargs):
    T = 200
    betas = _linear_beta_schedule(T)
    alphas = 1.0 - betas
    alpha_bars = np.cumprod(alphas)

    if image_path:
        img = load_image_u8(image_path, mode='rgb', max_side=128).astype(np.float64) / 255.0
    else:
        img = np.ones((64,64,3), dtype=np.float64) * 0.5
    original = (img * 255).astype(np.uint8)

    # Forward diffusion: add noise at selected steps
    step_indices = np.linspace(0, T-1, num_steps, dtype=int)
    noisy_imgs = []
    for t in step_indices:
        ab = alpha_bars[t]
        noise = np.random.default_rng(42+t).normal(0, 1, img.shape)
        x_t = np.sqrt(ab) * img + np.sqrt(1 - ab) * noise
        noisy_imgs.append(np.clip(x_t * 255, 0, 255).astype(np.uint8))

    # Reverse: predict noise at each step (simplified, no UNet)
    # Show the concept with actual math
    x_t = noisy_imgs[-1].astype(np.float64) / 255.0
    denoised = []
    for i in range(len(step_indices)-1, -1, -1):
        t = step_indices[i]
        ab = alpha_bars[t]
        # Predict x_0 from x_t: x_0 ≈ (x_t - sqrt(1-ab)*predicted_noise) / sqrt(ab)
        # Without a trained UNet, use a simple approximation
        pred_x0 = x_t / max(np.sqrt(ab), 1e-6)
        pred_x0 = np.clip(pred_x0, 0, 1)
        denoised.append((pred_x0 * 255).astype(np.uint8))
        if i > 0:
            prev_t = step_indices[i-1]
            prev_ab = alpha_bars[prev_t]
            x_t = np.sqrt(prev_ab) * pred_x0 + np.sqrt(1 - prev_ab) * np.random.default_rng(42+i).normal(0,1,x_t.shape)

    def _b64(arr):
        import io, base64
        from PIL import Image
        b = io.BytesIO(); Image.fromarray(arr).save(b, 'PNG')
        return base64.b64encode(b.getvalue()).decode()

    steps = [{'id': 'original', 'name': '原始图像 x₀', 'image': _b64(original),
              'explanation': '扩散过程的起点——真实图像。'}]
    for i, (t, ni) in enumerate(zip(step_indices, noisy_imgs)):
        steps.append({'id': f'forward_{i}', 'name': f'前向 t={t} (ᾱ={alpha_bars[t]:.3f})',
                      'image': _b64(ni), 'explanation': f'加噪到第 {t} 步，ᾱ={alpha_bars[t]:.4f}。信噪比 = {alpha_bars[t]/(1-alpha_bars[t]):.1f}。'})
    for i, (t, di) in enumerate(zip(reversed(step_indices), denoised)):
        steps.append({'id': f'reverse_{i}', 'name': f'反向 t={t}',
                      'image': _b64(di), 'explanation': '从 x_t 估计 x_0（无 UNet 时的简化估计）。'})

    return {'steps': steps, 'metrics': {'status': 'numpy_algorithm', 'backend': 'NumPy',
            'algorithm': 'DDPM Forward + Simplified Reverse', 'T': T, 'steps_shown': num_steps}}
