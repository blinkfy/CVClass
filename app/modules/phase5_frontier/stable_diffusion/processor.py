"""Pipeline builder for real Stable Diffusion inference."""
import numpy as np


def build_pipeline(image_path=None, prompt='a cat sitting on a chair',
                   num_steps=20, guidance=7.5, **kwargs):
    p = kwargs.get('prompt', prompt)
    steps = int(kwargs.get('num_steps', num_steps))
    cfg = float(kwargs.get('guidance', guidance))

    try:
        from app.modules.phase5_frontier.stable_diffusion.algorithm import generate_with_intermediates
        result = generate_with_intermediates(
            prompt=p,
            num_inference_steps=min(steps, 30),
            guidance_scale=cfg,
            height=256,
            width=256,
        )
    except Exception as exc:
        return {
            'error': f'Stable Diffusion model unavailable: {exc}',
            'steps': [],
            'metrics': {'status': 'model_not_available', 'prompt': p},
        }

    final_img = result['final_image']
    interms = result.get('intermediates', [])
    denoise_strip = _make_noise_strip(interms) if interms else final_img

    pipeline_steps = [
        {
            'id': 'initial_latent',
            'name': 'Initial latent noise',
            'image': interms[0]['image'] if interms else final_img,
            'explanation': 'The real diffusers pipeline starts from Gaussian noise in VAE latent space.',
            'formula': 'z_T ~ N(0, I)',
        },
        {
            'id': 'final',
            'name': f'Generated image: "{p}"',
            'image': final_img,
            'explanation': 'This image is decoded from the final latent produced by Stable Diffusion v1.5.',
            'formula': 'x = VAE.decode(z_0)',
        },
        {
            'id': 'denoise_strip',
            'name': 'Captured denoising states',
            'image': denoise_strip,
            'explanation': 'These snapshots are captured from the actual reverse denoising loop, not a hand-made forward-noise simulation.',
            'formula': 'z_{t-1} = scheduler.step(epsilon_theta(z_t,t,c), z_t)',
        },
    ]

    return {
        'steps': pipeline_steps,
        'metrics': {
            'model': 'Stable Diffusion v1.5',
            'prompt': p,
            'inference_steps': steps,
            'guidance_scale': cfg,
            'latent_space': 'VAE latent space',
            'architecture': 'VAE + UNet + CLIP Text Encoder',
        },
    }


def _make_noise_strip(intermediates):
    from PIL import Image
    thumb_h = 140
    imgs = [i['image'] for i in intermediates[:6] if i.get('image') is not None]
    if not imgs:
        return np.zeros((thumb_h, thumb_h, 3), dtype=np.uint8)
    thumbs = []
    for img in imgs:
        img_pil = Image.fromarray(img.astype(np.uint8))
        scale = thumb_h / img_pil.height
        new_w = max(1, int(img_pil.width * scale))
        thumbs.append(np.array(img_pil.resize((new_w, thumb_h), Image.LANCZOS)))
    total_w = sum(t.shape[1] for t in thumbs) + max(0, len(thumbs) - 1) * 4
    canvas = np.zeros((thumb_h, total_w, 3), dtype=np.uint8)
    x_off = 0
    for t in thumbs:
        canvas[:, x_off:x_off + t.shape[1]] = t
        x_off += t.shape[1] + 4
    return canvas
