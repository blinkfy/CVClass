"""Simplified diffusion model demo. Pure NumPy."""
import numpy as np


def forward_diffusion(image, num_steps=1000, beta_start=1e-4, beta_end=0.02):
    """
    Forward diffusion process: gradually add Gaussian noise.
    q(x_t | x_{t-1}) = N(sqrt(1-beta_t)*x_{t-1}, beta_t*I)

    Returns: list of noisy images at different timesteps
    """
    img = np.asarray(image, dtype=np.float64)
    betas = np.linspace(beta_start, beta_end, num_steps, dtype=np.float64)
    alphas = 1.0 - betas
    alpha_bars = np.cumprod(alphas)

    steps = []
    rng = np.random.default_rng(42)

    # Sample key timesteps for visualization
    key_steps = [0, 1, 2, 5, 10, 20, 50, 100, 200, 400, 600, 800, 999]
    key_steps = [s for s in key_steps if s < num_steps]

    for t in key_steps:
        if t == 0:
            steps.append({
                'timestep': 0,
                'image': img.copy(),
                'noise_level': 0.0,
            })
            continue

        alpha_bar_t = alpha_bars[t - 1]
        noise = rng.normal(0, 1, img.shape).astype(np.float64)
        # q(x_t | x_0) = N(sqrt(alpha_bar_t)*x_0, (1-alpha_bar_t)*I)
        noisy = np.sqrt(alpha_bar_t) * img + np.sqrt(1.0 - alpha_bar_t) * noise

        steps.append({
            'timestep': int(t),
            'image': noisy,
            'noise_level': float(1.0 - alpha_bar_t),
            'snr_db': float(10.0 * np.log10(alpha_bar_t / (1.0 - alpha_bar_t + 1e-12))),
        })

    return steps


def reverse_diffusion_demo(noisy_images, num_steps=20):
    """
    Simplified reverse diffusion demo.
    In a real diffusion model, a UNet predicts the noise to remove.
    This demo simulates the reverse process for visualization.

    Takes the noisiest image and progressively denoises it.
    """
    if not noisy_images:
        return []

    steps = []
    x_t = np.asarray(noisy_images[-1]['image'], dtype=np.float64)

    for i in range(num_steps):
        alpha = i / num_steps
        # Blend towards a cleaner version (simulated UNet output)
        target = np.asarray(noisy_images[max(0, len(noisy_images) - 1 - i)]['image'], dtype=np.float64)
        # In reality, the UNet predicts the noise epsilon_theta(x_t, t)
        # Here we just interpolate for demo purposes
        rng = np.random.default_rng(42 + i)
        predicted_noise = rng.normal(0, 0.1 * (1.0 - alpha), x_t.shape).astype(np.float64)
        x_t = (x_t - 0.1 * predicted_noise).clip(-1, 1)
        x_t = alpha * target + (1.0 - alpha) * x_t

        steps.append({
            'step': int(i),
            'image': x_t.copy(),
            'denoised_ratio': round(float(alpha), 3),
        })

    return steps
