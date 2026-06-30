"""Local mechanism-level implementations for frontier CV modules.

The functions here are deliberately small and deterministic. They implement the
data flow of each algorithm family with NumPy/PIL so every registered page can
show real intermediate tensors without pretending to run downloaded pretrained
weights.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

from app.utils.image_utils import ensure_gray, ensure_rgb, load_image_u8


LOCAL_FRONTIER_ALGORITHM_MODULES = {
    'swin', 'dino', 'mae', 'dino_det', 'grdino', 'mask2former', 'sam2',
    'blip2', 'controlnet', 'dit', 'flux', 'stylegan', 'dust3r',
    'orbslam3', 'mediapipe', 'vitpose',
}


def build_pipeline(module_id, image_path=None, image=None, **kwargs):
    """Build a module-specific local algorithm pipeline."""
    module_id = str(module_id)
    rgb = _load_or_fixture(image_path=image_path, image=image)
    builders = {
        'swin': _build_swin,
        'dino': _build_dino,
        'mae': _build_mae,
        'dino_det': _build_dino_det,
        'grdino': _build_grdino,
        'mask2former': _build_mask2former,
        'sam2': _build_sam2,
        'blip2': _build_blip2,
        'controlnet': _build_controlnet,
        'dit': _build_dit,
        'flux': _build_flux,
        'stylegan': _build_stylegan,
        'dust3r': _build_dust3r,
        'orbslam3': _build_orbslam3,
        'mediapipe': _build_mediapipe,
        'vitpose': _build_vitpose,
    }
    if module_id not in builders:
        raise ValueError(f'Unknown local frontier module: {module_id}')
    result = builders[module_id](rgb, **kwargs)
    metrics = {
        'status': 'numpy_algorithm',
        'module_id': module_id,
        'backend': 'NumPy/PIL local mechanism implementation',
        'real_model': False,
        'external_weights': False,
        'note': 'Local small algorithm implementation; not pretrained-weight inference.',
    }
    metrics.update(result.get('metrics', {}))
    return {'steps': result['steps'], 'metrics': metrics}


def _build_swin(rgb, **_kwargs):
    feats, colors = _patch_features(rgb, rows=8, cols=8)
    qkv = _normalize(feats[:, :5])
    window_idx = [r * 8 + c for r in range(4) for c in range(4)]
    window_tokens = qkv[window_idx]
    att = _softmax(_pairwise_dot(window_tokens, window_tokens) / math.sqrt(window_tokens.shape[1]), axis=1)
    merged = colors.reshape(4, 2, 4, 2, 3).mean(axis=(1, 3))
    shifted = _overlay_grid(rgb, 8, 8, shift=(rgb.shape[0] // 16, rgb.shape[1] // 16), color=(239, 68, 68))
    return {
        'steps': [
            _step('patch_partition', 'Patch partition', _overlay_grid(rgb, 8, 8),
                  'The image is split into non-overlapping patches and each patch becomes a token.',
                  'x_i = flatten(I[iP:(i+1)P, jP:(j+1)P])'),
            _step('window_attention', 'Window self-attention', _matrix_image(att),
                  'Self-attention is computed inside a local 4x4 token window, reducing global quadratic cost.',
                  'A = softmax(QK^T / sqrt(d)), Y = A V',
                  data={'attention': np.round(att, 4).tolist()}),
            _step('shifted_window', 'Shifted window exchange', shifted,
                  'The next Swin block shifts the window grid so neighboring windows can exchange information.',
                  'SW-MSA(x) = W-MSA(roll(x, shift=P/2))'),
            _step('patch_merge', 'Patch merging', _token_grid_image(merged),
                  'Every 2x2 group of neighboring tokens is concatenated and projected, halving resolution while expanding channels.',
                  'x_merge = Linear([x_00, x_01, x_10, x_11])'),
        ],
        'metrics': {'window_tokens': 16, 'merged_grid': '4x4'},
    }


def _build_dino(rgb, **_kwargs):
    view_a = _resize_nearest(rgb, 144, 144)
    view_b = np.flip(_resize_nearest(rgb, 144, 144), axis=1)
    view_b = np.clip(view_b.astype(np.float32) * np.array([0.9, 1.05, 1.12]), 0, 255).astype(np.uint8)
    fa, _ = _patch_features(view_a, 6, 6)
    fb, _ = _patch_features(view_b, 6, 6)
    student = _normalize(fa.mean(axis=0))
    teacher = _normalize(0.9 * fb.mean(axis=0) + 0.1 * student)
    center = 0.5 * (student + teacher)
    ps = _softmax(student / 0.10)
    pt = _softmax((teacher - center) / 0.04)
    att = _softmax(np.sum(fa * teacher[None, :], axis=1), axis=0).reshape(6, 6)
    return {
        'steps': [
            _step('multi_view', 'Student and teacher views', _side_by_side(view_a, view_b),
                  'DINO trains on two augmented views of the same image: a student view and an EMA teacher view.',
                  'v_s = aug_s(I), v_t = aug_t(I)'),
            _step('feature_alignment', 'View embeddings', _bar_chart([student, teacher], labels=['student', 'teacher']),
                  'Both views are encoded into feature distributions that should agree despite augmentation.',
                  'z_s = f_s(v_s), z_t = f_t(v_t)'),
            _step('centering_softmax', 'Centering and temperature softmax', _bar_chart([ps, pt], labels=['student p', 'teacher p']),
                  'The teacher output is centered and sharpened; the student learns to match that distribution.',
                  'p_t = softmax((z_t - c) / tau_t)'),
            _step('emergent_attention', 'Object attention map', _overlay_heatmap(view_a, att),
                  'Similarity between the teacher summary token and image patches forms an attention map over salient regions.',
                  'a_i = softmax(q_teacher^T k_i)'),
        ],
        'metrics': {'student_teacher_kl': float(np.sum(pt * np.log((pt + 1e-8) / (ps + 1e-8))))},
    }


def _build_mae(rgb, **_kwargs):
    rows, cols = 8, 8
    _, colors = _patch_features(rgb, rows, cols)
    rng = np.random.default_rng(7)
    mask = np.zeros(rows * cols, dtype=bool)
    mask[rng.choice(rows * cols, int(rows * cols * 0.75), replace=False)] = True
    mask = mask.reshape(rows, cols)
    masked = _masked_patch_image(rgb, mask)
    visible_tokens = colors[~mask]
    encoded = _token_grid_image(np.where(mask[..., None], 30, colors))
    recon_colors = colors.copy()
    recon_colors[mask] = _fill_masked_patches(colors, mask)
    recon = _patch_grid_to_image(recon_colors, rgb.shape[0], rgb.shape[1])
    return {
        'steps': [
            _step('patchify', 'Patchify image', _overlay_grid(rgb, rows, cols),
                  'MAE first converts the image into a regular sequence of patch tokens.',
                  'X = [x_1, x_2, ..., x_N]'),
            _step('random_mask', 'Random 75 percent mask', masked,
                  'A high masking ratio forces the encoder to reason from a sparse set of visible patches.',
                  'M ~ Bernoulli(r), r = 0.75'),
            _step('visible_encoding', 'Visible token encoding', encoded,
                  'Only visible tokens enter the encoder; masked tokens are reinserted later for the decoder.',
                  'Z_vis = Encoder({x_i | M_i = 0})'),
            _step('reconstruction', 'Masked patch reconstruction', recon,
                  'The decoder predicts missing patch colors from neighboring visible context in this local implementation.',
                  'L = mean_{i in M} ||x_i - decode(Z_vis)_i||_2^2'),
        ],
        'metrics': {'visible_tokens': int(visible_tokens.shape[0]), 'mask_ratio': 0.75},
    }


def _build_dino_det(rgb, **_kwargs):
    gray = ensure_gray(rgb).astype(np.float32) / 255.0
    objectness = _norm01(gray + _gradient_magnitude(gray))
    boxes = _candidate_boxes(objectness, count=3)
    queries = _query_boxes(rgb.shape[1], rgb.shape[0], count=5)
    noisy = _jitter_boxes(boxes, rgb.shape[1], rgb.shape[0])
    refined = _refine_queries(queries, boxes)
    cost = _box_cost_matrix(refined, boxes)
    return {
        'steps': [
            _step('queries', 'DETR object queries', _draw_boxes(_heatmap(objectness), queries, color=(59, 130, 246)),
                  'Object queries start as learned slots that compete to explain objects in the encoded image.',
                  'Y = Decoder(Q, Encoder(F))'),
            _step('denoising_queries', 'Denoising query groups', _draw_boxes(rgb, noisy, color=(245, 158, 11)),
                  'DINO-style detection adds noisy boxes during training so the decoder learns to correct perturbed targets.',
                  'q_dn = embed(box + epsilon, class)'),
            _step('box_refinement', 'Iterative box refinement', _draw_boxes(_draw_boxes(rgb, queries, color=(148, 163, 184)), refined, color=(34, 197, 94)),
                  'Each decoder layer predicts box deltas and moves queries toward object-like regions.',
                  'b_l = sigmoid(inverse_sigmoid(b_{l-1}) + Delta b_l)'),
            _step('matching_preview', 'Hungarian matching cost', _matrix_image(cost),
                  'Set prediction matches each predicted slot to at most one target using classification and box costs.',
                  'sigma* = argmin_sigma sum_i C(y_i, yhat_{sigma(i)})',
                  data={'cost': np.round(cost, 3).tolist()}),
        ],
        'metrics': {'queries': len(queries), 'targets': len(boxes)},
    }


def _build_grdino(rgb, **_kwargs):
    phrases = ['warm object', 'cool object', 'bright area']
    text_vecs = np.array([[1.0, 0.35, 0.10], [0.10, 0.55, 1.0], [0.95, 0.95, 0.95]], dtype=np.float32)
    feats, colors = _patch_features(rgb, 6, 8)
    region_rgb = _normalize(colors.reshape(-1, 3))
    sims = _pairwise_dot(region_rgb, _normalize(text_vecs))
    best_phrase = int(np.argmax(sims.max(axis=0)))
    heat = sims[:, best_phrase].reshape(6, 8)
    boxes = _boxes_from_grid_scores(heat, rgb.shape[1], rgb.shape[0], count=2)
    return {
        'steps': [
            _step('regions', 'Image region tokens', _overlay_grid(rgb, 6, 8),
                  'Grounding models compare text tokens with dense image region tokens rather than closed-set classes only.',
                  'r_i = ImageEncoder(I)_i'),
            _step('text_region_similarity', 'Text-region similarity', _matrix_image(sims.T),
                  'Each phrase token is projected into the same space as image regions and scored by cosine similarity.',
                  's_{t,i} = cos(e_text(t), e_img(i))'),
            _step('phrase_heatmap', f'Phrase heatmap: {phrases[best_phrase]}', _overlay_heatmap(rgb, heat),
                  'The selected phrase lights up regions whose color and intensity features best match the text embedding.',
                  'H_t(i) = softmax_i(s_{t,i})'),
            _step('grounded_boxes', 'Grounded box result', _draw_boxes(rgb, boxes, color=(34, 197, 94)),
                  'High-scoring connected phrase regions are converted into boxes for grounded detection.',
                  'box_t = bbox({i | H_t(i) > tau})',
                  data={'phrases': phrases, 'boxes': boxes}),
        ],
        'metrics': {'phrases': len(phrases), 'best_phrase': phrases[best_phrase]},
    }


def _build_mask2former(rgb, **_kwargs):
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    feat = np.dstack([
        rgb[..., 0] / 255.0,
        rgb[..., 1] / 255.0,
        rgb[..., 2] / 255.0,
        xx / max(w - 1, 1),
        yy / max(h - 1, 1),
    ])
    prototypes = np.array([
        [0.90, 0.35, 0.12, 0.35, 0.45],
        [0.15, 0.62, 0.90, 0.65, 0.55],
        [0.25, 0.25, 0.25, 0.50, 0.50],
    ])
    logits = -np.stack([np.sum((feat - p) ** 2, axis=-1) for p in prototypes], axis=0)
    masks = _softmax(logits, axis=0)
    query_id = int(np.argmax(masks.reshape(3, -1).sum(axis=1)))
    masked_attention = masks[query_id] * ensure_gray(rgb) / 255.0
    overlay = _multi_mask_overlay(rgb, masks)
    return {
        'steps': [
            _step('pixel_embedding', 'Pixel embedding field', _heatmap(feat[..., :3].mean(axis=-1)),
                  'Mask2Former starts from dense pixel embeddings that combine appearance and position.',
                  'E_{u,v} = PixelDecoder(Backbone(I))'),
            _step('mask_queries', 'Mask query logits', _make_mask_triptych(masks),
                  'A small set of learned mask queries produces class-agnostic mask logits over all pixels.',
                  'M_q(u,v) = q^T E_{u,v}'),
            _step('masked_attention', 'Masked attention region', _overlay_heatmap(rgb, masked_attention),
                  'Masked attention restricts cross-attention to the region currently predicted by each query.',
                  'Attention(q, K_M, V_M), K_M = {K_i | M_q(i) > tau}'),
            _step('class_mask_output', 'Class plus mask output', overlay,
                  'The final prediction pairs each query mask with a class score, then keeps the best masks.',
                  'y_q = (softmax(c_q), sigmoid(M_q))'),
        ],
        'metrics': {'mask_queries': 3, 'selected_query': query_id},
    }


def _build_sam2(rgb, **_kwargs):
    h, w = rgb.shape[:2]
    frame0 = rgb
    shift = (max(4, h // 20), max(6, w // 18))
    frame1 = np.roll(np.roll(frame0, shift[0], axis=0), shift[1], axis=1)
    point = (w // 2, h // 2)
    prompt_heat = _gaussian_map(h, w, point[0], point[1], sigma=max(h, w) / 9)
    seed_color = frame0[point[1], point[0]].astype(np.float32)
    dist0 = np.linalg.norm(frame0.astype(np.float32) - seed_color, axis=-1)
    mask0 = dist0 < np.percentile(dist0, 35)
    memory = _norm01(mask0.astype(np.float32) * (1.0 - dist0 / max(float(dist0.max()), 1.0)))
    propagated = np.roll(np.roll(memory, shift[0], axis=0), shift[1], axis=1)
    dist1 = np.linalg.norm(frame1.astype(np.float32) - seed_color, axis=-1)
    mask1 = _norm01(0.65 * propagated + 0.35 * (1.0 - dist1 / max(float(dist1.max()), 1.0)))
    return {
        'steps': [
            _step('frame_memory', 'Frame t memory mask', _overlay_mask(frame0, memory),
                  'SAM2 stores a memory representation from previous frames so segmentation can persist through time.',
                  'm_t = MemoryEncoder(I_t, mask_t)'),
            _step('prompt_encoding', 'Prompt encoding', _overlay_heatmap(frame0, prompt_heat),
                  'A point prompt is encoded as a spatial signal that tells the decoder which object to segment.',
                  'p = PromptEncoder(point, box, mask)'),
            _step('mask_propagation', 'Memory propagation to frame t+1', _overlay_heatmap(frame1, propagated),
                  'The previous mask memory is propagated to the next frame before being fused with current image evidence.',
                  'm_{t+1|t} = Warp(m_t, motion)'),
            _step('refined_mask', 'Refined video mask', _overlay_mask(frame1, mask1),
                  'The propagated memory and current-frame color similarity are fused into a new mask.',
                  'mask_{t+1} = Decoder(E_{t+1}, p, m_{t+1|t})'),
        ],
        'metrics': {'motion_shift_yx': list(shift), 'mask_pixels': int((mask1 > 0.5).sum())},
    }


def _build_blip2(rgb, **_kwargs):
    feats, colors = _patch_features(rgb, 6, 8)
    token_img = _token_grid_image(colors)
    queries = np.array([
        [0.9, 0.2, 0.1, 0.45, 0.2, 0.2],
        [0.1, 0.7, 0.9, 0.58, 0.8, 0.5],
        [0.8, 0.8, 0.8, 0.80, 0.5, 0.5],
        [0.2, 0.2, 0.2, 0.25, 0.5, 0.8],
    ], dtype=np.float32)
    att = _softmax(_pairwise_dot(queries, _normalize(feats)) / math.sqrt(feats.shape[1]), axis=1)
    q_tokens = np.sum(att[:, :, None] * feats[None, :, :], axis=1)
    text = ['a warm object', 'a cool region', 'a bright scene']
    text_vecs = np.array([
        [0.95, 0.35, 0.15, 0.45, 0.35, 0.45],
        [0.15, 0.65, 0.95, 0.58, 0.65, 0.45],
        [0.90, 0.90, 0.90, 0.80, 0.50, 0.50],
    ])
    scores = np.sum(_normalize(q_tokens.mean(axis=0))[None, :] * _normalize(text_vecs), axis=1)
    best = int(np.argmax(scores))
    return {
        'steps': [
            _step('image_tokens', 'Frozen image tokens', token_img,
                  'BLIP-2 begins with image tokens from a frozen vision encoder.',
                  'V = ImageEncoder(I)'),
            _step('qformer_attention', 'Q-Former cross-attention', _matrix_image(att),
                  'Learned query tokens attend to image tokens and compress visual evidence for the language side.',
                  'Q_out = CrossAttention(Q, K=V, V=V)'),
            _step('text_alignment', 'Image-text alignment scores', _bar_chart([scores], labels=['caption score']),
                  'The Q-Former output is compared with candidate text embeddings in a shared semantic space.',
                  's_j = cos(W_q mean(Q_out), W_t t_j)'),
            _step('caption_grounding', f'Best local caption: {text[best]}', _overlay_heatmap(rgb, att[np.argmax(att.max(axis=1))].reshape(6, 8)),
                  'The strongest query attention shows which image tokens support the best text alignment.',
                  'caption = argmax_j s_j',
                  data={'captions': text, 'scores': np.round(scores, 4).tolist()}),
        ],
        'metrics': {'best_caption': text[best], 'score': float(scores[best])},
    }


def _build_controlnet(rgb, num_steps=4, **_kwargs):
    gray = ensure_gray(rgb).astype(np.float32) / 255.0
    edge = _norm01(_gradient_magnitude(gray))
    residual = _norm01(edge * 0.35)
    target = _resize_nearest(rgb, 160, 160).astype(np.float32) / 255.0
    noise = _deterministic_noise(target.shape[:2], channels=3)
    z = noise.copy()
    frames = []
    steps_count = max(4, int(num_steps) if str(num_steps).isdigit() else 4)
    for i in range(4):
        alpha = (i + 1) / 4.0
        cond = _resize_nearest(residual, target.shape[0], target.shape[1])[..., None]
        z = (1 - 0.35 * alpha) * z + (0.25 * alpha) * target + (0.20 * alpha) * cond
        frames.append((np.clip(z, 0, 1) * 255).astype(np.uint8))
    return {
        'steps': [
            _step('condition_map', 'Condition map', _heatmap(edge),
                  'ControlNet uses an external condition such as edges, depth or pose to steer generation.',
                  'c = ConditionEncoder(edge(I))'),
            _step('zero_conv_residual', 'Zero-conv residual branch', _heatmap(residual),
                  'A residual branch injects condition features into the denoising backbone; zero-conv starts from no disruption.',
                  'h_l = h_l + ZeroConv(c_l)'),
            _step('guided_denoising', 'Guided denoising trajectory', _mosaic(frames),
                  'The latent is iteratively moved toward both the image prior and the condition map.',
                  'z_{t-1} = z_t - eta eps_theta(z_t,t,c)'),
            _step('controlled_result', 'Condition-guided result', frames[-1],
                  'The final local sample preserves the condition structure while reducing noise.',
                  'x_0 = Decoder(z_0)'),
        ],
        'metrics': {'requested_steps': steps_count, 'condition_energy': float(edge.mean())},
    }


def _build_dit(rgb, **_kwargs):
    latent = _resize_nearest(rgb, 128, 128).astype(np.float32) / 255.0
    feats, colors = _patch_features((latent * 255).astype(np.uint8), 8, 8)
    time = 37
    t_embed = _time_embedding(time, dim=16)
    att = _softmax(_pairwise_dot(_normalize(feats), _normalize(feats)) / math.sqrt(feats.shape[1]), axis=1)
    denoised_tokens = 0.72 * colors.reshape(-1, 3) + 0.28 * np.sum(att[:, :, None] * colors.reshape(1, -1, 3), axis=1)
    denoised = _patch_grid_to_image(denoised_tokens.reshape(8, 8, 3), 128, 128)
    return {
        'steps': [
            _step('latent_patches', 'Latent patch tokens', _token_grid_image(colors),
                  'DiT treats a noisy latent image as a sequence of patch tokens instead of using a UNet grid only.',
                  'X = PatchEmbed(z_t)'),
            _step('time_embedding', 'Diffusion timestep embedding', _bar_chart([t_embed], labels=['sin/cos t']),
                  'The denoising transformer receives a sinusoidal timestep embedding that tells it how noisy the latent is.',
                  'e_t = [sin(omega t), cos(omega t)]'),
            _step('transformer_denoise', 'Transformer token mixing', _matrix_image(att[:24, :24]),
                  'Self-attention lets latent patches exchange global context before predicting the noise residual.',
                  'Y = MSA(LN(X + e_t)) + X'),
            _step('denoised_latent', 'Denoised latent update', denoised,
                  'The local denoise step mixes each patch with attention-weighted neighbors to reduce token noise.',
                  'z_{t-1} = z_t - sigma_t eps_theta(z_t,t)'),
        ],
        'metrics': {'tokens': 64, 'timestep': time},
    }


def _build_flux(rgb, **_kwargs):
    target = _resize_nearest(rgb, 128, 128).astype(np.float32) / 255.0
    noise = _deterministic_noise((128, 128), 3)
    text_tokens = np.array([[0.9, 0.4, 0.2], [0.2, 0.7, 0.9], [0.8, 0.8, 0.8]], dtype=np.float32)
    _, colors = _patch_features((target * 255).astype(np.uint8), 8, 8)
    image_tokens = colors.reshape(-1, 3) / 255.0
    dual_att = _softmax(_pairwise_dot(_normalize(text_tokens), _normalize(image_tokens)), axis=1)
    vector = target - noise
    traj = []
    z = noise.copy()
    for alpha in [0.2, 0.45, 0.7, 1.0]:
        z = noise + alpha * vector
        traj.append((np.clip(z, 0, 1) * 255).astype(np.uint8))
    flow_vis = _flow_field_image(vector[::8, ::8, :2].mean(axis=2))
    return {
        'steps': [
            _step('dual_stream_tokens', 'Dual text-image streams', _matrix_image(dual_att),
                  'FLUX-style models process text and image/latent tokens in coupled streams.',
                  'H_txt, H_img = DualStreamBlock(T, X_t)'),
            _step('flow_field', 'Flow matching vector field', flow_vis,
                  'Flow matching learns a velocity field that moves noisy samples toward data samples.',
                  'v_theta(x_t,t,c) ~= x_1 - x_0'),
            _step('latent_trajectory', 'Latent update trajectory', _mosaic(traj),
                  'Sampling integrates the learned velocity field through time instead of predicting only a denoised image.',
                  'x_{t+dt} = x_t + dt v_theta(x_t,t,c)'),
            _step('flow_result', 'Flow-matched result', traj[-1],
                  'The final local latent reaches the image-like endpoint after deterministic Euler updates.',
                  'x_1 = x_0 + integral_0^1 v_theta(x_t,t,c) dt'),
        ],
        'metrics': {'text_tokens': 3, 'image_tokens': int(image_tokens.shape[0])},
    }


def _build_stylegan(rgb, **_kwargs):
    stats = np.array([
        rgb[..., 0].mean(), rgb[..., 1].mean(), rgb[..., 2].mean(),
        rgb[..., 0].std(), rgb[..., 1].std(), rgb[..., 2].std(), rgb.shape[0], rgb.shape[1],
    ], dtype=np.float32)
    z = _normalize(stats)
    w1 = np.linspace(-0.7, 0.9, 64, dtype=np.float32).reshape(8, 8)
    w2 = np.linspace(0.8, -0.6, 64, dtype=np.float32).reshape(8, 8)
    hidden = np.tanh(np.sum(z[:, None] * w1, axis=0))
    w = np.tanh(np.sum(hidden[:, None] * w2, axis=0))
    base = _style_base(64)
    scale = 0.8 + 0.5 * np.tanh(w[:3])
    bias = 0.2 * np.tanh(w[3:6])
    styled = _adain(base, scale, bias)
    prog = [
        _resize_nearest((styled * 255).astype(np.uint8), 32, 32),
        _resize_nearest((styled * 255).astype(np.uint8), 64, 64),
        _resize_nearest((styled * 255).astype(np.uint8), 128, 128),
    ]
    return {
        'steps': [
            _step('mapping_network', 'Mapping network z to w', _bar_chart([z, w], labels=['z', 'w']),
                  'StyleGAN maps the input latent z into an intermediate style vector w before synthesis.',
                  'w = f_mapping(z)'),
            _step('adain_style', 'AdaIN style modulation', (np.clip(styled, 0, 1) * 255).astype(np.uint8),
                  'The style vector controls channel-wise scale and bias after feature normalization.',
                  'AdaIN(x,w) = s(w) (x - mu(x)) / sigma(x) + b(w)'),
            _step('progressive_synthesis', 'Progressive synthesis', _mosaic(prog),
                  'Feature maps are progressively upsampled and modulated to form higher-resolution images.',
                  'x_{l+1} = upsample(ModConv(x_l, w_l))'),
            _step('generated_image', 'Local StyleGAN sample', prog[-1],
                  'The output is a deterministic synthesis from the mapped latent and style-modulated features.',
                  'I = ToRGB(x_L)'),
        ],
        'metrics': {'latent_dim': 8, 'style_mean': float(w.mean())},
    }


def _build_dust3r(rgb, **_kwargs):
    view1 = _resize_nearest(rgb, 160, 200)
    shift = (0, 12)
    view2 = np.roll(view1, shift[1], axis=1)
    gray1 = ensure_gray(view1).astype(np.float32) / 255.0
    gray2 = ensure_gray(view2).astype(np.float32) / 255.0
    disp, conf = _dense_shift_match(gray1, gray2, max_disp=20)
    depth = 1.0 / np.maximum(disp + 1.0, 1.0)
    cloud = _point_cloud_preview(depth, conf, view1)
    return {
        'steps': [
            _step('dense_features', 'Dense feature grids', _side_by_side(_heatmap(gray1), _heatmap(gray2)),
                  'DUSt3R computes dense descriptors for an image pair so every location can participate in matching.',
                  'F_1, F_2 = DenseEncoder(I_1, I_2)'),
            _step('pairwise_matching', 'Pairwise correspondence field', _flow_field_image(disp),
                  'For each pixel row, the best horizontal correspondence is selected from a small disparity search.',
                  'm(u,v) = argmax_d sim(F_1(u,v), F_2(u-d,v))'),
            _step('depth_confidence', 'Depth and confidence', _side_by_side(_heatmap(depth), _heatmap(conf)),
                  'Disparity is converted into an inverse-depth style signal and paired with a confidence map.',
                  'Z(u,v) proportional 1 / (d(u,v) + epsilon)'),
            _step('point_cloud', 'Point cloud preview', cloud,
                  'Pixels with confident matches are lifted into a simple 3D point cloud preview.',
                  'P = Z K^{-1} [u, v, 1]^T'),
        ],
        'metrics': {'mean_disparity': float(disp.mean()), 'mean_confidence': float(conf.mean())},
    }


def _build_orbslam3(rgb, **_kwargs):
    frame1 = _resize_nearest(rgb, 160, 220)
    frame2 = np.roll(frame1, 9, axis=1)
    gray1 = ensure_gray(frame1).astype(np.float32) / 255.0
    gray2 = ensure_gray(frame2).astype(np.float32) / 255.0
    k1 = _corner_keypoints(gray1, count=55)
    k2 = _corner_keypoints(gray2, count=55)
    d1 = _brief_descriptors(gray1, k1)
    d2 = _brief_descriptors(gray2, k2)
    matches = _match_descriptors(d1, d2, k1, k2, max_matches=32)
    if matches:
        dx = float(np.median([k2[j][0] - k1[i][0] for i, j in matches]))
        dy = float(np.median([k2[j][1] - k1[i][1] for i, j in matches]))
    else:
        dx, dy = 0.0, 0.0
    graph = _pose_graph_image(dx, dy)
    return {
        'steps': [
            _step('orb_keypoints', 'ORB-like FAST corners', _draw_points(frame1, k1),
                  'ORB-SLAM starts by detecting repeatable oriented corner keypoints in each frame.',
                  'score(p) = FAST(p), theta = atan2(m_01, m_10)'),
            _step('binary_matching', 'Binary descriptor matching', _draw_matches(frame1, frame2, k1, k2, matches),
                  'BRIEF-like binary descriptors are matched across frames with Hamming distance.',
                  'j* = argmin_j Hamming(b_i, b_j)'),
            _step('pose_update', 'Relative pose preview', graph,
                  'Matched keypoints estimate a frame-to-frame motion that becomes an edge in the pose graph.',
                  'T_{t,t+1} = argmin_T sum_i ||x_i - pi(T X_i)||^2'),
            _step('keyframe_map', 'Keyframe trajectory map', _keyframe_map_image(dx, dy),
                  'ORB-SLAM keeps selected keyframes and map points, then optimizes the pose graph.',
                  'min_{T,X} sum ||x - pi(TX)||^2'),
        ],
        'metrics': {'keypoints': len(k1), 'matches': len(matches), 'estimated_dx': dx, 'estimated_dy': dy},
    }


def _build_mediapipe(rgb, **_kwargs):
    h, w = rgb.shape[:2]
    landmarks = _canonical_pose(w, h)
    heatmaps = np.stack([_gaussian_map(h, w, x, y, sigma=max(w, h) / 28) for x, y in landmarks], axis=0)
    decoded = [_soft_argmax(hm) for hm in heatmaps]
    graph_img = _landmark_graph_image(len(landmarks), _pose_edges())
    return {
        'steps': [
            _step('roi_landmarks', 'ROI and landmark targets', _draw_points(rgb, landmarks),
                  'MediaPipe pipelines crop a region of interest and predict normalized landmark heatmaps inside it.',
                  'R = ROI(I), H_k = LandmarkHead(R)_k'),
            _step('landmark_heatmaps', 'Landmark heatmaps', _heatmap(heatmaps.max(axis=0)),
                  'Each landmark is represented as a probability heatmap over image coordinates.',
                  'P_k(u,v) = softmax(H_k(u,v))'),
            _step('soft_argmax', 'Soft-argmax decoded landmarks', _draw_points(rgb, decoded),
                  'Coordinates are recovered by the expectation of the heatmap distribution, not by text labels.',
                  '(x_k,y_k) = sum_{u,v} (u,v) P_k(u,v)'),
            _step('skeleton_graph', 'Skeleton connection graph', _draw_skeleton(rgb, decoded, _pose_edges(), graph_img=graph_img),
                  'Landmarks are connected by a fixed graph to produce a pose or hand skeleton.',
                  'G = (V_landmarks, E_connections)'),
        ],
        'metrics': {'landmarks': len(landmarks), 'edges': len(_pose_edges())},
    }


def _build_vitpose(rgb, **_kwargs):
    h, w = rgb.shape[:2]
    feats, colors = _patch_features(rgb, 8, 8)
    attention = _softmax(_pairwise_dot(_normalize(feats), _normalize(feats)) / math.sqrt(feats.shape[1]), axis=1)
    landmarks = _canonical_pose(w, h)
    heatmaps = []
    for x, y in landmarks:
        spatial = _gaussian_grid(8, 8, x / max(w - 1, 1), y / max(h - 1, 1), sigma=0.22)
        idx = min(63, max(0, int(round(y / max(h, 1) * 7)) * 8 + int(round(x / max(w, 1) * 7))))
        token_sim = _norm01(attention[idx].reshape(8, 8))
        heatmaps.append(_resize_nearest(_norm01(0.65 * spatial + 0.35 * token_sim), h, w))
    heatmaps = np.stack(heatmaps, axis=0)
    decoded = [_soft_argmax(hm) for hm in heatmaps]
    return {
        'steps': [
            _step('vit_patches', 'ViT patch features', _token_grid_image(colors),
                  'ViTPose first turns the image into Transformer patch tokens.',
                  'X = PatchEmbed(I) + E_pos'),
            _step('token_attention', 'Transformer token attention', _matrix_image(attention[:32, :32]),
                  'Self-attention mixes global body context across all patch tokens.',
                  'A = softmax(QK^T / sqrt(d))'),
            _step('heatmap_head', 'Keypoint heatmap head', _heatmap(heatmaps.max(axis=0)),
                  'A pose head upsamples token features into one heatmap per keypoint.',
                  'H_k = ConvHead(reshape(Z))_k'),
            _step('pose_overlay', 'Pose overlay', _draw_skeleton(rgb, decoded, _pose_edges()),
                  'Final keypoints are decoded from heatmaps and connected into a skeleton.',
                  '(x_k,y_k) = argmax H_k or softargmax(H_k)'),
        ],
        'metrics': {'patch_tokens': 64, 'keypoints': len(decoded)},
    }


def _step(step_id, name, image, explanation, formula, data=None):
    out = {
        'id': step_id,
        'name': name,
        'image': image,
        'explanation': explanation,
        'formula': formula,
    }
    if data is not None:
        out['data'] = data
    return out


def _load_or_fixture(image_path=None, image=None):
    if image is not None:
        arr = ensure_rgb(np.asarray(image))
        arr = _resize_max(arr, 256)
    elif image_path:
        arr = load_image_u8(image_path, mode='rgb', max_side=256)
    else:
        h, w = 168, 224
        y, x = np.mgrid[0:h, 0:w]
        arr = np.zeros((h, w, 3), dtype=np.uint8)
        arr[..., 0] = (70 + 120 * x / max(w - 1, 1)).astype(np.uint8)
        arr[..., 1] = (60 + 150 * y / max(h - 1, 1)).astype(np.uint8)
        arr[..., 2] = (180 - 90 * x / max(w - 1, 1)).astype(np.uint8)
        arr[32:116, 38:116] = [225, 116, 48]
        arr[62:144, 124:198] = [35, 160, 220]
        rr = (x - 156) ** 2 + (y - 62) ** 2
        arr[rr < 26 ** 2] = [246, 210, 70]
    return arr.astype(np.uint8)


def _resize_max(arr, max_side):
    h, w = arr.shape[:2]
    scale = max(h, w) / float(max_side)
    if scale <= 1:
        return arr
    return _resize_nearest(arr, max(1, int(h / scale)), max(1, int(w / scale)))


def _resize_nearest(arr, new_h, new_w):
    arr = np.asarray(arr)
    ys = np.linspace(0, arr.shape[0] - 1, int(new_h)).round().astype(np.int32)
    xs = np.linspace(0, arr.shape[1] - 1, int(new_w)).round().astype(np.int32)
    if arr.ndim == 2:
        return arr[ys[:, None], xs[None, :]]
    return arr[ys[:, None], xs[None, :], :]


def _patch_features(rgb, rows=8, cols=8):
    h, w = rgb.shape[:2]
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    feats = []
    colors = np.zeros((rows, cols, 3), dtype=np.float32)
    gray = ensure_gray(rgb).astype(np.float32) / 255.0
    for r in range(rows):
        for c in range(cols):
            patch = rgb[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            gpatch = gray[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            mean = patch.reshape(-1, 3).mean(axis=0) / 255.0
            colors[r, c] = mean * 255.0
            feats.append([
                mean[0], mean[1], mean[2], float(gpatch.mean()),
                (c + 0.5) / cols, (r + 0.5) / rows,
            ])
    return np.asarray(feats, dtype=np.float32), colors.astype(np.uint8)


def _normalize(x, axis=-1):
    arr = np.asarray(x, dtype=np.float32)
    if arr.ndim == 1:
        norm = float(np.linalg.norm(arr)) + 1e-8
        return arr / norm
    norm = np.linalg.norm(arr, axis=axis, keepdims=True) + 1e-8
    return arr / norm


def _softmax(x, axis=-1):
    arr = np.asarray(x, dtype=np.float32)
    arr = arr - np.max(arr, axis=axis, keepdims=True)
    exp = np.exp(arr)
    return exp / (np.sum(exp, axis=axis, keepdims=True) + 1e-8)


def _pairwise_dot(a, b):
    left = np.asarray(a, dtype=np.float32)
    right = np.asarray(b, dtype=np.float32)
    return np.sum(left[:, None, :] * right[None, :, :], axis=2)


def _norm01(x):
    arr = np.asarray(x, dtype=np.float32)
    mn = float(np.min(arr))
    mx = float(np.max(arr))
    if mx - mn < 1e-8:
        return np.zeros_like(arr, dtype=np.float32)
    return (arr - mn) / (mx - mn)


def _gradient_magnitude(gray):
    gy, gx = np.gradient(gray.astype(np.float32))
    return np.sqrt(gx * gx + gy * gy)


def _heatmap(values):
    v = _norm01(values)
    r = np.clip(1.6 * v - 0.25, 0, 1)
    g = np.clip(1.5 - np.abs(v - 0.55) * 2.2, 0, 1)
    b = np.clip(1.2 * (1.0 - v), 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def _matrix_image(matrix, size=220):
    m = np.asarray(matrix, dtype=np.float32)
    if m.ndim == 1:
        m = m[None, :]
    img = _heatmap(m)
    return _resize_nearest(img, size, size)


def _token_grid_image(colors, cell=28):
    arr = np.asarray(colors, dtype=np.uint8)
    if arr.ndim == 2:
        arr = _heatmap(arr)
    rows, cols = arr.shape[:2]
    img = np.repeat(np.repeat(arr, cell, axis=0), cell, axis=1)
    return _overlay_grid(img, rows, cols, color=(15, 23, 42))


def _patch_grid_to_image(colors, h, w):
    rows, cols = colors.shape[:2]
    return _resize_nearest(colors.astype(np.uint8), h, w)


def _overlay_grid(rgb, rows, cols, shift=(0, 0), color=(15, 23, 42)):
    out = rgb.copy()
    h, w = out.shape[:2]
    y0, x0 = shift
    for r in range(rows + 1):
        y = int(round(y0 + r * h / rows)) % max(h, 1)
        out[max(0, y - 1):min(h, y + 1), :] = color
    for c in range(cols + 1):
        x = int(round(x0 + c * w / cols)) % max(w, 1)
        out[:, max(0, x - 1):min(w, x + 1)] = color
    return out


def _overlay_heatmap(rgb, heat, alpha=0.48):
    base = _resize_nearest(rgb, heat.shape[0], heat.shape[1]) if rgb.shape[:2] != heat.shape[:2] else rgb
    hm = _heatmap(heat)
    return np.clip(base.astype(np.float32) * (1 - alpha) + hm.astype(np.float32) * alpha, 0, 255).astype(np.uint8)


def _overlay_mask(rgb, mask, color=(34, 197, 94)):
    m = _norm01(mask)[..., None]
    col = np.asarray(color, dtype=np.float32)
    return np.clip(rgb.astype(np.float32) * (1 - 0.55 * m) + col * (0.55 * m), 0, 255).astype(np.uint8)


def _side_by_side(left, right):
    h = max(left.shape[0], right.shape[0])
    left_r = _resize_nearest(left, h, int(left.shape[1] * h / left.shape[0]))
    right_r = _resize_nearest(right, h, int(right.shape[1] * h / right.shape[0]))
    pad = np.ones((h, 8, 3), dtype=np.uint8) * 248
    return np.concatenate([left_r, pad, right_r], axis=1)


def _mosaic(images):
    imgs = [ensure_rgb(img) for img in images]
    h = max(img.shape[0] for img in imgs)
    resized = [_resize_nearest(img, h, int(img.shape[1] * h / img.shape[0])) for img in imgs]
    pad = np.ones((h, 6, 3), dtype=np.uint8) * 248
    out = resized[0]
    for img in resized[1:]:
        out = np.concatenate([out, pad, img], axis=1)
    return out


def _bar_chart(series, labels=None, width=340, height=180):
    vals = [np.asarray(v, dtype=np.float32).ravel() for v in series]
    n = max(len(v) for v in vals)
    canvas = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    colors = [(59, 130, 246), (34, 197, 94), (245, 158, 11), (239, 68, 68)]
    max_val = max(float(np.max(np.abs(v))) for v in vals) + 1e-8
    group_w = max(5, (width - 40) // max(n, 1))
    bar_w = max(3, group_w // (len(vals) + 1))
    zero = height - 28
    for s, v in enumerate(vals):
        for i, value in enumerate(v):
            bh = int(abs(float(value)) / max_val * (height - 58))
            x0 = 24 + i * group_w + s * bar_w
            y0 = zero - bh
            draw.rectangle((x0, y0, x0 + bar_w - 1, zero), fill=colors[s % len(colors)])
    if labels:
        for s, label in enumerate(labels[:4]):
            draw.text((22 + s * 84, 8), str(label)[:16], fill=colors[s % len(colors)])
    return np.array(canvas)


def _masked_patch_image(rgb, mask):
    rows, cols = mask.shape
    out = rgb.copy().astype(np.float32)
    h, w = out.shape[:2]
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    for r in range(rows):
        for c in range(cols):
            if mask[r, c]:
                patch = out[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
                patch[:] = patch * 0.18 + np.array([32, 39, 58]) * 0.82
    return _overlay_grid(out.astype(np.uint8), rows, cols, color=(226, 232, 240))


def _fill_masked_patches(colors, mask):
    filled = np.zeros((int(mask.sum()), 3), dtype=np.float32)
    rows, cols = mask.shape
    idx = 0
    global_mean = colors[~mask].reshape(-1, 3).mean(axis=0) if np.any(~mask) else colors.reshape(-1, 3).mean(axis=0)
    for r in range(rows):
        for c in range(cols):
            if not mask[r, c]:
                continue
            neigh = []
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                rr, cc = r + dr, c + dc
                if 0 <= rr < rows and 0 <= cc < cols and not mask[rr, cc]:
                    neigh.append(colors[rr, cc])
            filled[idx] = np.mean(neigh, axis=0) if neigh else global_mean
            idx += 1
    return filled.astype(np.uint8)


def _candidate_boxes(score, count=3):
    h, w = score.shape
    boxes = []
    work = score.copy()
    for _ in range(count):
        y, x = np.unravel_index(int(np.argmax(work)), work.shape)
        bw = max(24, w // 4)
        bh = max(24, h // 4)
        x1 = int(np.clip(x - bw // 2, 0, w - 2))
        y1 = int(np.clip(y - bh // 2, 0, h - 2))
        x2 = int(np.clip(x1 + bw, x1 + 2, w - 1))
        y2 = int(np.clip(y1 + bh, y1 + 2, h - 1))
        boxes.append([x1, y1, x2, y2])
        work[max(0, y1):min(h, y2), max(0, x1):min(w, x2)] *= 0.3
    return boxes


def _query_boxes(w, h, count=5):
    boxes = []
    for i in range(count):
        cx = int((i + 1) * w / (count + 1))
        cy = int((0.35 + 0.25 * ((i % 2))) * h)
        bw = w // 4
        bh = h // 3
        boxes.append([max(0, cx - bw // 2), max(0, cy - bh // 2), min(w - 1, cx + bw // 2), min(h - 1, cy + bh // 2)])
    return boxes


def _jitter_boxes(boxes, w, h):
    out = []
    for i, b in enumerate(boxes):
        dx = int((i - 1) * w * 0.04)
        dy = int((1 - i) * h * 0.035)
        out.append([int(np.clip(b[0] + dx, 0, w - 2)), int(np.clip(b[1] + dy, 0, h - 2)),
                    int(np.clip(b[2] + dx, 1, w - 1)), int(np.clip(b[3] + dy, 1, h - 1))])
    return out


def _refine_queries(queries, boxes):
    refined = []
    for q in queries:
        target = min(boxes, key=lambda b: _box_center_dist(q, b))
        refined.append([int(round(0.45 * q[i] + 0.55 * target[i])) for i in range(4)])
    return refined


def _box_center_dist(a, b):
    ac = ((a[0] + a[2]) / 2, (a[1] + a[3]) / 2)
    bc = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    return (ac[0] - bc[0]) ** 2 + (ac[1] - bc[1]) ** 2


def _box_cost_matrix(pred, target):
    cost = np.zeros((len(pred), len(target)), dtype=np.float32)
    for i, p in enumerate(pred):
        for j, t in enumerate(target):
            cost[i, j] = 1.0 - _iou(p, t) + 0.002 * math.sqrt(_box_center_dist(p, t))
    return cost


def _iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = max(1, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / float(area_a + area_b - inter + 1e-8)


def _draw_boxes(rgb, boxes, color=(239, 68, 68)):
    out = ensure_rgb(rgb).copy()
    img = Image.fromarray(out)
    draw = ImageDraw.Draw(img)
    for box in boxes:
        draw.rectangle(tuple(map(int, box)), outline=tuple(color), width=3)
    return np.array(img)


def _boxes_from_grid_scores(scores, w, h, count=2):
    boxes = []
    work = scores.copy()
    rows, cols = scores.shape
    for _ in range(count):
        r, c = np.unravel_index(int(np.argmax(work)), work.shape)
        x1 = int(c / cols * w)
        y1 = int(r / rows * h)
        x2 = int(min(w - 1, (c + 2) / cols * w))
        y2 = int(min(h - 1, (r + 2) / rows * h))
        boxes.append([x1, y1, x2, y2])
        work[max(0, r - 1):min(rows, r + 2), max(0, c - 1):min(cols, c + 2)] *= 0.2
    return boxes


def _multi_mask_overlay(rgb, masks):
    colors = np.array([[239, 68, 68], [34, 197, 94], [59, 130, 246]], dtype=np.float32)
    idx = np.argmax(masks, axis=0)
    conf = np.max(masks, axis=0)[..., None]
    col = colors[idx]
    return np.clip(rgb.astype(np.float32) * (1 - 0.55 * conf) + col * (0.55 * conf), 0, 255).astype(np.uint8)


def _make_mask_triptych(masks):
    imgs = [_heatmap(masks[i]) for i in range(masks.shape[0])]
    return _mosaic(imgs)


def _gaussian_map(h, w, cx, cy, sigma):
    y, x = np.mgrid[0:h, 0:w]
    return np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma + 1e-8)).astype(np.float32)


def _gaussian_grid(rows, cols, cx, cy, sigma):
    y, x = np.mgrid[0:rows, 0:cols]
    x = (x + 0.5) / cols
    y = (y + 0.5) / rows
    return np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma + 1e-8)).astype(np.float32)


def _deterministic_noise(shape, channels=1):
    h, w = shape
    y, x = np.mgrid[0:h, 0:w]
    base = (np.sin(x / 7.0) + np.cos(y / 11.0) + np.sin((x + y) / 17.0)) / 3.0
    if channels == 1:
        return ((base + 1.0) / 2.0).astype(np.float32)
    out = []
    for c in range(channels):
        out.append(((np.sin((x + c * 5) / (7.0 + c)) + np.cos((y - c * 3) / (11.0 + c))) + 2.0) / 4.0)
    return np.stack(out, axis=-1).astype(np.float32)


def _time_embedding(t, dim=16):
    half = dim // 2
    freqs = np.exp(np.linspace(0, math.log(1000), half))
    emb = np.concatenate([np.sin(t / freqs), np.cos(t / freqs)])
    return emb.astype(np.float32)


def _flow_field_image(field, size=220):
    arr = _resize_nearest(np.asarray(field, dtype=np.float32), size, size)
    if arr.ndim == 3:
        arr = arr.mean(axis=-1)
    base = _heatmap(arr)
    img = Image.fromarray(base)
    draw = ImageDraw.Draw(img)
    step = max(16, size // 10)
    for y in range(step // 2, size, step):
        for x in range(step // 2, size, step):
            v = float(arr[y, x])
            dx = int(np.clip(v * 18, -18, 18))
            draw.line((x, y, x + dx, y), fill=(15, 23, 42), width=2)
            draw.ellipse((x + dx - 2, y - 2, x + dx + 2, y + 2), fill=(15, 23, 42))
    return np.array(img)


def _style_base(size):
    y, x = np.mgrid[0:size, 0:size]
    r = (np.sin(x / 5.5) + 1) / 2
    g = (np.cos(y / 7.0) + 1) / 2
    b = (np.sin((x + y) / 9.0) + 1) / 2
    return np.stack([r, g, b], axis=-1).astype(np.float32)


def _adain(base, scale, bias):
    mean = base.mean(axis=(0, 1), keepdims=True)
    std = base.std(axis=(0, 1), keepdims=True) + 1e-6
    return np.clip((base - mean) / std * scale.reshape(1, 1, 3) + 0.5 + bias.reshape(1, 1, 3), 0, 1)


def _dense_shift_match(gray1, gray2, max_disp=20):
    h, w = gray1.shape
    costs = []
    for d in range(max_disp + 1):
        shifted = np.roll(gray2, -d, axis=1)
        costs.append(np.abs(gray1 - shifted))
    costs = np.stack(costs, axis=0)
    disp = np.argmin(costs, axis=0).astype(np.float32)
    conf = 1.0 - np.min(costs, axis=0) / (np.max(costs, axis=0) + 1e-6)
    return disp, np.clip(conf, 0, 1)


def _point_cloud_preview(depth, conf, rgb, size=240):
    img = np.ones((size, size, 3), dtype=np.uint8) * 248
    h, w = depth.shape
    ys = np.linspace(0, h - 1, 36).astype(int)
    xs = np.linspace(0, w - 1, 48).astype(int)
    for y in ys:
        for x in xs:
            if conf[y, x] < 0.25:
                continue
            z = depth[y, x]
            px = int(size * 0.5 + (x / w - 0.5) * size * 0.78 / max(z, 0.2))
            py = int(size * 0.68 - (y / h - 0.5) * size * 0.58 - z * 35)
            if 0 <= px < size and 0 <= py < size:
                col = rgb[y, x]
                img[max(0, py - 1):min(size, py + 2), max(0, px - 1):min(size, px + 2)] = col
    return img


def _corner_keypoints(gray, count=50):
    gy, gx = np.gradient(gray)
    ixx, iyy, ixy = gx * gx, gy * gy, gx * gy
    score = (ixx * iyy - ixy * ixy) - 0.04 * (ixx + iyy) ** 2
    flat = np.argsort(score.ravel())[::-1]
    pts = []
    h, w = gray.shape
    for idx in flat:
        y, x = divmod(int(idx), w)
        if x < 5 or y < 5 or x >= w - 5 or y >= h - 5:
            continue
        if all((x - px) ** 2 + (y - py) ** 2 > 8 ** 2 for px, py in pts):
            pts.append((x, y))
        if len(pts) >= count:
            break
    return pts


def _brief_descriptors(gray, points):
    pairs = [(-3, -2, 2, 1), (-2, 3, 3, -1), (-4, 0, 1, 4), (0, -4, 4, 0),
             (-5, -5, 5, 5), (-5, 4, 4, -5), (-1, -3, 3, 2), (-4, 2, 2, -4),
             (-2, -1, 1, 2), (-3, 4, 5, 1), (2, -5, -2, 5), (4, 3, -4, -3),
             (0, 2, 5, -1), (-5, 1, 1, -5), (3, 0, -3, 2), (2, 4, -1, -4)]
    h, w = gray.shape
    desc = []
    for x, y in points:
        bits = []
        for ax, ay, bx, by in pairs:
            xa, ya = int(np.clip(x + ax, 0, w - 1)), int(np.clip(y + ay, 0, h - 1))
            xb, yb = int(np.clip(x + bx, 0, w - 1)), int(np.clip(y + by, 0, h - 1))
            bits.append(1 if gray[ya, xa] < gray[yb, xb] else 0)
        desc.append(np.array(bits, dtype=np.uint8))
    return desc


def _match_descriptors(d1, d2, k1, k2, max_matches=32):
    matches = []
    used = set()
    for i, a in enumerate(d1):
        if not d2:
            break
        distances = [int(np.sum(a != b)) for b in d2]
        j = int(np.argmin(distances))
        if j not in used and distances[j] <= 7:
            matches.append((i, j))
            used.add(j)
    matches.sort(key=lambda ij: (k2[ij[1]][0] - k1[ij[0]][0]) ** 2 + (k2[ij[1]][1] - k1[ij[0]][1]) ** 2)
    return matches[:max_matches]


def _draw_points(rgb, points, color=(34, 197, 94)):
    img = Image.fromarray(ensure_rgb(rgb).copy())
    draw = ImageDraw.Draw(img)
    for x, y in points:
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=tuple(color), outline=(15, 23, 42))
    return np.array(img)


def _draw_matches(left, right, k1, k2, matches):
    h = max(left.shape[0], right.shape[0])
    l = _resize_nearest(left, h, int(left.shape[1] * h / left.shape[0]))
    r = _resize_nearest(right, h, int(right.shape[1] * h / right.shape[0]))
    canvas = np.concatenate([l, np.ones((h, 8, 3), dtype=np.uint8) * 248, r], axis=1)
    offset = l.shape[1] + 8
    img = Image.fromarray(canvas)
    draw = ImageDraw.Draw(img)
    for i, j in matches:
        x1, y1 = k1[i]
        x2, y2 = k2[j]
        draw.line((x1, y1, x2 + offset, y2), fill=(245, 158, 11), width=1)
        draw.ellipse((x1 - 2, y1 - 2, x1 + 2, y1 + 2), fill=(34, 197, 94))
        draw.ellipse((x2 + offset - 2, y2 - 2, x2 + offset + 2, y2 + 2), fill=(59, 130, 246))
    return np.array(img)


def _pose_graph_image(dx, dy, size=220):
    img = Image.new('RGB', (size, size), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    pts = []
    cx, cy = 40, size // 2
    for i in range(5):
        pts.append((int(cx + i * 34 + dx * i * 0.7), int(cy + math.sin(i * 0.8) * 18 + dy * i * 0.5)))
    for a, b in zip(pts[:-1], pts[1:]):
        draw.line((a[0], a[1], b[0], b[1]), fill=(59, 130, 246), width=3)
    for i, p in enumerate(pts):
        draw.ellipse((p[0] - 7, p[1] - 7, p[0] + 7, p[1] + 7), fill=(34, 197, 94), outline=(15, 23, 42))
        draw.text((p[0] - 4, p[1] - 22), f'K{i}', fill=(15, 23, 42))
    return np.array(img)


def _keyframe_map_image(dx, dy, size=220):
    img = _pose_graph_image(dx, dy, size)
    pil = Image.fromarray(img)
    draw = ImageDraw.Draw(pil)
    for i in range(24):
        x = int(size * 0.25 + (i % 6) * 22 + dx * 1.5)
        y = int(size * 0.35 + (i // 6) * 20 + dy)
        draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=(239, 68, 68))
    return np.array(pil)


def _canonical_pose(w, h):
    pts = [
        (0.50, 0.16), (0.43, 0.26), (0.57, 0.26), (0.36, 0.42), (0.64, 0.42),
        (0.43, 0.52), (0.57, 0.52), (0.39, 0.70), (0.61, 0.70), (0.37, 0.88),
        (0.63, 0.88), (0.47, 0.36), (0.53, 0.36),
    ]
    return [(int(x * w), int(y * h)) for x, y in pts]


def _pose_edges():
    return [(0, 1), (0, 2), (1, 11), (2, 12), (11, 12), (11, 5), (12, 6),
            (5, 7), (6, 8), (7, 9), (8, 10), (1, 3), (2, 4)]


def _soft_argmax(hm):
    p = np.asarray(hm, dtype=np.float32)
    p = p / (p.sum() + 1e-8)
    y, x = np.mgrid[0:p.shape[0], 0:p.shape[1]]
    return int((x * p).sum()), int((y * p).sum())


def _draw_skeleton(rgb, points, edges, graph_img=None):
    img = Image.fromarray(ensure_rgb(rgb).copy())
    draw = ImageDraw.Draw(img)
    for a, b in edges:
        if a < len(points) and b < len(points):
            draw.line((points[a][0], points[a][1], points[b][0], points[b][1]), fill=(245, 158, 11), width=3)
    for x, y in points:
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(34, 197, 94), outline=(15, 23, 42))
    out = np.array(img)
    if graph_img is not None:
        g = _resize_nearest(graph_img, out.shape[0], out.shape[0])
        out = np.concatenate([out, np.ones((out.shape[0], 8, 3), dtype=np.uint8) * 248, g], axis=1)
    return out


def _landmark_graph_image(n, edges, size=220):
    img = Image.new('RGB', (size, size), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    pts = []
    for i in range(n):
        angle = 2 * math.pi * i / n
        pts.append((int(size / 2 + math.cos(angle) * size * 0.36), int(size / 2 + math.sin(angle) * size * 0.36)))
    for a, b in edges:
        draw.line((pts[a][0], pts[a][1], pts[b][0], pts[b][1]), fill=(100, 116, 139), width=2)
    for i, p in enumerate(pts):
        draw.ellipse((p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5), fill=(59, 130, 246))
        draw.text((p[0] + 6, p[1] - 5), str(i), fill=(15, 23, 42))
    return np.array(img)
