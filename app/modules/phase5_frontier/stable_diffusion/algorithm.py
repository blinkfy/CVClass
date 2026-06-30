"""Stable Diffusion algorithm — real inference with diffusers pipeline.

Uses HuggingFace diffusers StableDiffusionPipeline for text-to-image
generation with cross-attention visualization.
"""
import numpy as np
import torch
from PIL import Image


_PIPE = None
_MODEL_NAME = "runwayml/stable-diffusion-v1-5"


def _get_pipeline():
    global _PIPE
    if _PIPE is None:
        from diffusers import StableDiffusionPipeline
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        dtype = torch.float16 if device == 'cuda' else torch.float32
        _PIPE = StableDiffusionPipeline.from_pretrained(
            _MODEL_NAME, torch_dtype=dtype,
            safety_checker=None,
        )
        _PIPE = _PIPE.to(device)
        # Enable memory efficient attention if available
        try:
            _PIPE.enable_attention_slicing()
        except Exception:
            pass
    return _PIPE


def generate_image(prompt, num_inference_steps=30, guidance_scale=7.5,
                   height=384, width=384):
    """
    Generate an image from a text prompt using Stable Diffusion.

    Returns:
        generated image (PIL), intermediate latents at key steps
    """
    pipe = _get_pipeline()

    with torch.no_grad():
        result = pipe(
            prompt=prompt,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            height=height,
            width=width,
            output_type='pil',
        )

    return {
        'image': result.images[0],
    }


def generate_with_intermediates(prompt, num_inference_steps=30,
                                guidance_scale=7.5, height=256, width=256):
    """
    Generate and capture intermediate denoising steps.

    Returns the final image plus snapshots at key denoising stages.
    """
    pipe = _get_pipeline()
    device = pipe.device
    dtype = pipe.unet.dtype

    # Text encoding
    text_inputs = pipe.tokenizer(
        prompt, padding='max_length', max_length=pipe.tokenizer.model_max_length,
        truncation=True, return_tensors='pt')
    text_embeddings = pipe.text_encoder(
        text_inputs.input_ids.to(device))[0]

    # Unconditional embedding for CFG
    uncond_input = pipe.tokenizer(
        [''], padding='max_length', max_length=pipe.tokenizer.model_max_length,
        return_tensors='pt')
    uncond_embeddings = pipe.text_encoder(
        uncond_input.input_ids.to(device))[0]
    text_embeddings = torch.cat([uncond_embeddings, text_embeddings])

    # Initial latent noise
    latents = torch.randn(
        (1, pipe.unet.config.in_channels, height // 8, width // 8),
        generator=torch.manual_seed(42), device=device, dtype=dtype)

    pipe.scheduler.set_timesteps(num_inference_steps, device=device)
    timesteps = pipe.scheduler.timesteps

    intermediates = []
    snapshot_steps = sorted(set([0, len(timesteps)//4, len(timesteps)//2,
                                 3*len(timesteps)//4, len(timesteps)-1]))

    for i, t in enumerate(timesteps):
        latent_model_input = torch.cat([latents] * 2)
        noise_pred = pipe.unet(
            latent_model_input, t,
            encoder_hidden_states=text_embeddings)[0]

        # CFG
        noise_pred_uncond, noise_pred_text = noise_pred.chunk(2)
        noise_pred = noise_pred_uncond + guidance_scale * (noise_pred_text - noise_pred_uncond)

        latents = pipe.scheduler.step(noise_pred, t, latents)[0]

        if i in snapshot_steps:
            # Decode latent to image for snapshot
            latents_scaled = 1 / 0.18215 * latents
            with torch.no_grad():
                image = pipe.vae.decode(latents_scaled.to(pipe.vae.dtype))[0]
            image = (image / 2 + 0.5).clamp(0, 1)
            image = image.cpu().permute(0, 2, 3, 1)[0].numpy()
            image = (image * 255).astype(np.uint8)
            intermediates.append({
                'step': i,
                'timestep': int(t),
                'image': image,
            })

    # Final image
    latents_scaled = 1 / 0.18215 * latents
    with torch.no_grad():
        final_image = pipe.vae.decode(latents_scaled.to(pipe.vae.dtype))[0]
    final_image = (final_image / 2 + 0.5).clamp(0, 1)
    final_image = final_image.cpu().permute(0, 2, 3, 1)[0].numpy()
    final_image = (final_image * 255).astype(np.uint8)

    return {
        'final_image': final_image,
        'intermediates': intermediates,
        'prompt': prompt,
    }
