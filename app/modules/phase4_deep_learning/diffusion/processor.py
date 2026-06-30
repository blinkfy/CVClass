"""DDPM teaching pipeline with real NumPy forward/reverse equations.

This module intentionally does not pretend to be Stable Diffusion. It computes
the DDPM noising equation on the uploaded image, visualizes the exact noise
term, and reconstructs with the oracle epsilon so every displayed result comes
from backend math instead of frontend illustration.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.modules.offline_teaching import _load_or_fixture


def _schedule(num_steps):
    betas = np.linspace(0.0005, 0.045, num_steps, dtype=np.float64)
    alphas = 1.0 - betas
    alpha_bar = np.cumprod(alphas)
    return betas, alphas, alpha_bar


def _to_float(rgb):
    return np.asarray(rgb, dtype=np.float64) / 255.0


def _to_u8(x):
    return np.round(np.clip(x, 0.0, 1.0) * 255.0).astype(np.uint8)


def _noise_to_image(eps):
    e = np.asarray(eps, dtype=np.float64)
    e = (e - e.min()) / max(float(e.max() - e.min()), 1e-8)
    return _to_u8(e)


def _xt(x0, eps, alpha_bar_t):
    return np.sqrt(alpha_bar_t) * x0 + np.sqrt(1.0 - alpha_bar_t) * eps


def _oracle_reconstruct(xt, eps, alpha_bar_t):
    return (xt - np.sqrt(1.0 - alpha_bar_t) * eps) / max(np.sqrt(alpha_bar_t), 1e-8)


def _lowpass(x, scale=0.16):
    arr = np.clip(np.asarray(x, dtype=np.float64), 0.0, 1.0)
    pil = Image.fromarray(_to_u8(arr))
    small_w = max(4, int(pil.width * scale))
    small_h = max(4, int(pil.height * scale))
    smooth = pil.resize((small_w, small_h), Image.BILINEAR).resize(pil.size, Image.BILINEAR)
    return _to_float(smooth)


def _predict_x0_from_prior(xt, prototype, alpha_bar_t):
    """Tiny deterministic denoiser used for teaching the reverse update."""
    visible = np.clip(xt, 0.0, 1.0)
    local_hint = _lowpass(visible, scale=0.14)
    noise_level = 1.0 - float(alpha_bar_t)
    prior_weight = np.clip(0.36 + 0.48 * noise_level, 0.36, 0.86)
    return np.clip((1.0 - prior_weight) * local_hint + prior_weight * prototype, 0.0, 1.0)


def _predict_epsilon(xt, x0_pred, alpha_bar_t):
    return (xt - np.sqrt(alpha_bar_t) * x0_pred) / max(np.sqrt(1.0 - alpha_bar_t), 1e-8)


def _reverse_update(alpha_bar_next, x0_pred, eps_pred):
    return np.sqrt(alpha_bar_next) * x0_pred + np.sqrt(1.0 - alpha_bar_next) * eps_pred


def _error_heatmap(err):
    value = np.asarray(err, dtype=np.float64)
    if value.ndim == 3:
        value = value.mean(axis=2)
    value = value / max(float(value.max()), 1e-8)
    r = (255 * value).astype(np.uint8)
    g = (180 * np.sqrt(value)).astype(np.uint8)
    b = (42 * (1.0 - value)).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _reverse_demo_trace(x0, alpha_bar):
    prototype = _lowpass(x0, scale=0.22)
    reverse_alphas = [0.035, 0.10, 0.24, 0.48, 0.74, 0.92]
    rng = np.random.default_rng(456)
    eps_gen = rng.normal(0.0, 1.0, size=x0.shape)
    xt = _xt(prototype, eps_gen, reverse_alphas[0])
    frames = [{'label': 'start noise', 'alpha': reverse_alphas[0], 'xt': xt, 'x0_pred': None, 'eps_pred': None}]
    for current_alpha, next_alpha in zip(reverse_alphas, reverse_alphas[1:]):
        x0_pred = _predict_x0_from_prior(xt, prototype, current_alpha)
        eps_pred = _predict_epsilon(xt, x0_pred, current_alpha)
        xt_next = _reverse_update(next_alpha, x0_pred, eps_pred)
        frames.append({
            'label': 'predict and update',
            'alpha': next_alpha,
            'xt': xt_next,
            'x0_pred': x0_pred,
            'eps_pred': eps_pred,
        })
        xt = xt_next
    final = _predict_x0_from_prior(xt, prototype, reverse_alphas[-1])
    return frames, final, prototype


def _strip(images, labels, thumb_h=132):
    thumbs = []
    for img in images:
        pil = Image.fromarray(img)
        scale = thumb_h / max(1, pil.height)
        thumbs.append(pil.resize((max(1, int(pil.width * scale)), thumb_h), Image.BILINEAR))
    label_h = 26
    total_w = sum(t.width for t in thumbs) + 8 * (len(thumbs) - 1)
    canvas = Image.new('RGB', (total_w, thumb_h + label_h), (248, 250, 252))
    draw = ImageDraw.Draw(canvas)
    x = 0
    for img, label in zip(thumbs, labels):
        canvas.paste(img, (x, label_h))
        draw.text((x + 4, 5), label, fill=(15, 23, 42))
        x += img.width + 8
    return np.array(canvas)


def _curve_chart(alpha_bar, selected, width=540, height=260):
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    left, top, right, bottom = 44, 22, 18, 36
    draw.rectangle((left, top, width - right, height - bottom), outline=(203, 213, 225))
    xs = np.linspace(left, width - right, len(alpha_bar))
    ys = height - bottom - alpha_bar * (height - top - bottom)
    pts = list(zip(xs.astype(int), ys.astype(int)))
    draw.line(pts, fill=(37, 99, 235), width=3)
    for t in selected:
        x = int(xs[t])
        y = int(ys[t])
        draw.line((x, top, x, height - bottom), fill=(225, 29, 72), width=1)
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(225, 29, 72))
        draw.text((x + 4, y - 14), f't={t + 1}', fill=(100, 116, 139))
    draw.text((16, 4), '噪声日程：alpha_bar 变小，噪声权重变大', fill=(15, 23, 42))
    draw.text((52, height - 26), '时间步', fill=(71, 85, 105))
    draw.text((6, 110), 'alpha_bar', fill=(71, 85, 105))
    return np.array(img)


def build_pipeline(image_path=None, num_steps=40, **kwargs):
    steps_count = max(8, min(int(kwargs.get('num_steps', num_steps)), 80))
    rgb = _load_or_fixture(image_path=image_path)
    if max(rgb.shape[:2]) > 256:
        pil = Image.fromarray(rgb)
        pil.thumbnail((256, 256), Image.BILINEAR)
        rgb = np.array(pil)
    x0 = _to_float(rgb)

    rng = np.random.default_rng(123)
    eps = rng.normal(0.0, 1.0, size=x0.shape)
    _, _, alpha_bar = _schedule(steps_count)

    t_early = max(0, steps_count // 5 - 1)
    t_mid = max(0, steps_count // 2 - 1)
    t_late = steps_count - 1
    xt_early = _xt(x0, eps, alpha_bar[t_early])
    xt_mid = _xt(x0, eps, alpha_bar[t_mid])
    xt_late = _xt(x0, eps, alpha_bar[t_late])
    recon = _oracle_reconstruct(xt_late, eps, alpha_bar[t_late])
    oracle_err = np.abs(recon - x0)
    x0_pred_late = _predict_x0_from_prior(xt_late, _lowpass(x0, scale=0.22), alpha_bar[t_late])
    eps_pred_late = _predict_epsilon(xt_late, x0_pred_late, alpha_bar[t_late])
    pred_err = np.abs(eps_pred_late - eps)
    pred_mse = float(np.mean((eps_pred_late - eps) ** 2))
    reverse_frames, generated, prototype = _reverse_demo_trace(x0, alpha_bar)

    timeline = _strip(
        [_to_u8(x0), _to_u8(xt_early), _to_u8(xt_mid), _to_u8(xt_late), _to_u8(recon)],
        ['x0', f't={t_early + 1}', f't={t_mid + 1}', f't={t_late + 1}', 'x0_hat'],
    )
    generation_timeline = _strip(
        [_noise_to_image(reverse_frames[0]['xt']), _to_u8(reverse_frames[1]['x0_pred']),
         _to_u8(reverse_frames[2]['xt']), _to_u8(reverse_frames[4]['xt']), _to_u8(generated)],
        ['pure noise', 'predict x0', 'less noise', 'shape appears', 'generated'],
    )
    mse = float(np.mean((recon - x0) ** 2))

    return {
        'steps': [
            {
                'id': 'input',
                'name': '输入图像 x0',
                'image': _to_u8(x0),
                'explanation': '扩散模型把干净图像看作 x0，后续每个时间步都会按噪声日程混入更强的高斯噪声。',
                'problem_statement': '扩散模型要解决的问题是：从一团随机噪声里逐步修出符合训练图像规律的图片。',
                'plain_explanation': '先看一张清晰图。扩散模型训练时会学习：图片被不同强度的噪声弄脏后，应该去掉哪一部分噪声。',
                'watch_for': '先记住原图的主体、颜色和轮廓，后面看它们怎样被噪声淹没，又怎样被公式还原。',
                'formula': 'x0 in [0,1]^{H x W x 3}',
            },
            {
                'id': 'schedule',
                'name': '噪声日程 alpha_bar',
                'image': _curve_chart(alpha_bar, [t_early, t_mid, t_late]),
                'visual_kind': 'chart',
                'overlay_scope': 'none',
                'chart': _schedule_chart_data(alpha_bar),
                'explanation': 'alpha_bar_t 越小，原图权重越低，噪声权重越高。图中的红线对应本页展示的几个时间步。',
                'problem_statement': '扩散模型要解决的问题是：控制每一步加多少噪声，让训练和生成都稳定。',
                'plain_explanation': '这条曲线像一张加噪时间表：越往后，原图保留越少，噪声占比越大。',
                'watch_for': '看曲线是否平滑下降，以及红线对应的早、中、晚三种噪声强度。',
                'formula': 'alpha_bar_t = product_{s=1..t}(1 - beta_s)',
                'data': {'alpha_bar': [round(float(v), 6) for v in alpha_bar.tolist()]},
            },
            {
                'id': 'noise',
                'name': '采样到的高斯噪声 epsilon',
                'image': _noise_to_image(eps),
                'explanation': '这是后端真实采样的标准高斯噪声。DDPM 的训练目标就是让网络学会预测每一步里的这部分噪声。',
                'problem_statement': '扩散模型要解决的问题是：学会识别并去掉图像里的噪声成分。',
                'plain_explanation': '这里展示后端真实采样出来的噪声。训练时模型要学会预测的，就是类似这样的噪声。',
                'watch_for': '看噪声本身没有物体语义；真正的难点是从噪声状态里一步步找回结构。',
                'formula': 'epsilon ~ N(0, I)',
            },
            {
                'id': 'forward_early',
                'name': f'前向加噪 t={t_early + 1}',
                'image': _to_u8(xt_early),
                'explanation': '早期时间步仍保留大部分原图结构，只叠加少量噪声。',
                'problem_statement': '扩散模型要解决的问题是：理解图像怎样从清晰逐步变脏。',
                'plain_explanation': '早期只加了一点噪声，主体通常还看得清。真实训练会让模型在各种噪声强度下都学会还原。',
                'watch_for': '看细节是否先变粗糙，而整体轮廓仍然保留。',
                'formula': 'x_t = sqrt(alpha_bar_t) x0 + sqrt(1-alpha_bar_t) epsilon',
            },
            {
                'id': 'forward_mid',
                'name': f'前向加噪 t={t_mid + 1}',
                'image': _to_u8(xt_mid),
                'explanation': '中间时间步里噪声已经明显增强，图像语义开始被破坏。',
                'problem_statement': '扩散模型要解决的问题是：在图像被明显破坏时仍然估计应该去掉什么噪声。',
                'plain_explanation': '中期噪声已经明显增加，图像语义开始变模糊。模型需要从残留结构里判断如何往回修。',
                'watch_for': '看颜色和轮廓是否还隐约存在，这些残留线索是去噪的重要依据。',
                'formula': 'q(x_t | x0) = N(sqrt(alpha_bar_t)x0, (1-alpha_bar_t)I)',
            },
            {
                'id': 'forward_late',
                'name': f'接近纯噪声 t={t_late + 1}',
                'image': _to_u8(xt_late),
                'explanation': '后期时间步中原图权重很低，模型在生成时需要从类似这种噪声状态一步步反推。',
                'problem_statement': '扩散模型要解决的问题是：从几乎纯噪声的状态开始生成图像。',
                'plain_explanation': '晚期接近纯噪声。真正生成时通常就是从这样的状态出发，一步步去噪得到图片。',
                'watch_for': '看原图线索几乎消失了；这能解释为什么强大的去噪模型和条件控制很重要。',
                'formula': 'noise_weight = sqrt(1-alpha_bar_t)',
            },
            {
                'id': 'reverse_oracle',
                'name': 'oracle 公式校验',
                'image': _to_u8(recon),
                'explanation': '这里故意使用已知 epsilon 做 oracle 还原，只用于校验 DDPM 公式。真实生成时模型并不知道这份答案，必须自己预测 epsilon_theta。',
                'problem_statement': '扩散模型要解决的问题是：如果能准确预测噪声，就能把脏图往清晰图推回去。',
                'plain_explanation': '这是“开卷答案”演示：因为后端知道当初加进去的噪声，所以几乎可以精确还原。它不是实际生成过程。',
                'watch_for': '如果后面的 oracle 误差图是黑的，这是因为误差接近 0，不是显示坏了；真正困难的是下一步的近似预测。',
                'formula': 'x0_hat = (x_t - sqrt(1-alpha_bar_t) epsilon_theta) / sqrt(alpha_bar_t)',
                'data': {'mse_to_input': mse, 'oracle': True},
            },
            {
                'id': 'generation_start_noise',
                'name': '生成从纯噪声开始',
                'image': _noise_to_image(reverse_frames[0]['xt']),
                'explanation': '真正生成图片时，起点不是一张已知原图，而是一团随机噪声。本页用本地轻量先验模拟“模型从噪声中寻找结构”的过程。',
                'problem_statement': '扩散模型要解决的问题是：没有原图可看的时候，也能从噪声里逐步生成图像。',
                'plain_explanation': '这一帧看起来只有杂点。扩散模型接下来要做的事，是一小步一小步判断“哪些更像噪声，哪些可能是图像结构”。',
                'watch_for': '此时还不该出现清晰物体；如果一开始就有完整图片，反而不是扩散生成的直观过程。',
                'formula': 'x_T ~ N(0, I)',
                'data': {'alpha_bar': round(float(reverse_frames[0]['alpha']), 4), 'source': 'deterministic local noise'},
            },
            {
                'id': 'denoise_prediction_high_t',
                'name': '预测要去掉的噪声',
                'image': _to_u8(reverse_frames[1]['x0_pred']),
                'explanation': '轻量预测器先估计“如果这团噪声里有图像，它大概的低频轮廓是什么”。再由这个 x0 估计反推出当前噪声 epsilon_theta。',
                'problem_statement': '扩散模型要解决的问题是：在一张很脏的图里估计噪声成分，而不是一次性画出最终图。',
                'plain_explanation': '可以把这一步理解成：模型先猜一个很粗的草图，再计算“当前画面里哪些随机纹理应该被减掉”。',
                'watch_for': '这里出现的是粗略结构，不追求细节；扩散模型通常靠很多小步慢慢修。',
                'formula': 'epsilon_theta = (x_t - sqrt(alpha_bar_t) x0_pred) / sqrt(1-alpha_bar_t)',
                'data': {
                    'alpha_bar': round(float(reverse_frames[1]['alpha']), 4),
                    'prediction': 'low-frequency local prior',
                    'formula_terms': {
                        'x_t': '当前带噪图像状态',
                        'x0_pred': '预测出来的干净图粗草图',
                        'alpha_bar_t': '当前时间步保留原图结构的比例',
                        'epsilon_theta': '模型估计应该去掉的噪声',
                    },
                },
            },
            {
                'id': 'denoise_update_high_t',
                'name': '减掉一部分预测噪声',
                'image': _to_u8(reverse_frames[2]['xt']),
                'explanation': '反向更新不会一下子把图画好，而是把预测到的噪声减掉一部分，让下一步的图像状态更容易判断。',
                'problem_statement': '扩散模型要解决的问题是：把一次很难的生成任务拆成很多次小幅去噪。',
                'plain_explanation': '这一帧比纯噪声更稳定了一点：随机颗粒减少，颜色和大轮廓开始有方向。',
                'watch_for': '看图像是否只是逐步变清楚，而不是突然跳到最终结果。',
                'formula': 'x_{t-1} = sqrt(alpha_bar_next) x0_pred + sqrt(1-alpha_bar_next) epsilon_theta',
                'data': {
                    'alpha_bar': round(float(reverse_frames[2]['alpha']), 4),
                    'formula_terms': {
                        'x_{t-1}': '下一帧、噪声更少一点的图像状态',
                        'alpha_bar_next': '下一时间步的原图结构权重',
                        'x0_pred': '本轮预测的干净图草图',
                        'epsilon_theta': '本轮预测的噪声',
                    },
                },
            },
            {
                'id': 'denoise_mid',
                'name': '中期：结构开始出现',
                'image': _to_u8(reverse_frames[4]['xt']),
                'explanation': '经过几轮预测和更新后，噪声仍然存在，但低频结构已经更稳定。真实扩散模型会在这里继续根据条件、文本或训练分布修细节。',
                'problem_statement': '扩散模型要解决的问题是：让随机噪声逐步服从图像数据的规律。',
                'plain_explanation': '现在已经能看到更稳定的色块和轮廓。它不是凭空出现，而是每一步都在重复“预测噪声、减掉一点”。',
                'watch_for': '看主体是否逐步连贯；这正是扩散模型比一次性生成更容易控制的地方。',
                'formula': 'repeat predict epsilon_theta, then update x_t',
                'data': {'alpha_bar': round(float(reverse_frames[4]['alpha']), 4)},
            },
            {
                'id': 'denoise_final',
                'name': '最终生成示例',
                'image': _to_u8(generated),
                'explanation': '这是本地轻量机制生成的最终结果，用来直观展示反向扩散路径。它不是 Stable Diffusion 大模型输出，也不代表高质量预训练生成能力。',
                'problem_statement': '扩散模型要解决的问题是：把纯噪声逐步变成一张有结构、符合数据规律的图片。',
                'plain_explanation': '最终图像来自一串真实 NumPy 更新。重点不是画得多惊艳，而是看懂“从噪声到图像”的中间过程。',
                'watch_for': '看最终图是否保留了训练样式的低频颜色和轮廓，同时理解这只是轻量教学版。',
                'formula': 'x_0 approx denoise(x_T)',
                'data': {'mechanism': 'local approximate denoising prior', 'real_model': False},
            },
            {
                'id': 'timeline',
                'name': '从噪声逐步生成的时间线',
                'image': generation_timeline,
                'explanation': '这条时间线把纯噪声、预测草图、逐步去噪和最终生成放在一起。每一帧都来自 NumPy 计算，不是静态插画。',
                'problem_statement': '扩散模型要解决的问题是：把“加噪”和“去噪”连成一条可理解的生成路径。',
                'plain_explanation': '从左到右看：一开始只有噪声，模型先猜粗结构，再逐步减噪，最后得到可辨认的生成结果。',
                'watch_for': '看变化是否连续：扩散生成的直觉就是很多个小修正累积成最终图片。',
                'formula': 'forward q(x_t|x0), reverse p_theta(x_{t-1}|x_t)',
            },
            {
                'id': 'error',
                'name': '预测误差图',
                'image': _error_heatmap(pred_err),
                'explanation': '这张图比较近似预测器 epsilon_theta 和真实噪声 epsilon 的差异。它应该不是全黑，因为这里没有使用开卷答案。',
                'problem_statement': '扩散模型要解决的问题是：让预测噪声越来越接近真实噪声。',
                'plain_explanation': '亮的地方代表“这部分噪声猜得不够准”。真实扩散模型训练的核心，就是不断降低这种预测误差。',
                'watch_for': '如果 oracle 误差全黑是正常的；这张预测误差图才用来观察模型哪里还猜不准。',
                'formula': 'prediction_MSE = mean((epsilon_theta - epsilon)^2)',
                'data': {
                    'prediction_mse': round(pred_mse, 8),
                    'error_min': round(float(pred_err.min()), 6),
                    'error_max': round(float(pred_err.max()), 6),
                    'formula_terms': {
                        'epsilon_theta': '近似预测器猜出的噪声',
                        'epsilon': '前向加噪时真实加入的噪声',
                        'prediction_MSE': '两者差异的平均平方，越小表示噪声预测越准',
                    },
                },
            },
            {
                'id': 'oracle_zero_error',
                'name': 'oracle 零误差说明',
                'image': _to_u8(oracle_err / max(float(oracle_err.max()), 1e-8)),
                'explanation': '这张图全黑是预期结果：oracle 步骤直接使用了已知 epsilon，所以重建误差为 0。它用于解释“黑图不是显示异常”。',
                'problem_statement': '扩散模型要解决的问题是：区分公式校验和真实预测，避免把开卷答案当成模型能力。',
                'plain_explanation': '这里的黑色不是坏图，而是“误差几乎没有”。实际生成没有这份已知噪声，所以要看上一张预测误差图。',
                'watch_for': '把这一步当作校验项即可；真正有教学价值的是近似预测误差和反向生成时间线。',
                'formula': 'oracle_MSE = mean((x0_hat_oracle - x0)^2) = 0',
                'data': {'mse_to_input': round(mse, 8), 'oracle': True},
            },
        ],
        'metrics': {
            'status': 'local_mechanism',
            'backend': 'NumPy DDPM equations plus local denoising prior',
            'real_model': False,
            'steps': steps_count,
            'alpha_bar_final': round(float(alpha_bar[-1]), 6),
            'reconstruction_mse': round(mse, 8),
            'prediction_mse': round(pred_mse, 8),
            'note': '本页展示真实 DDPM 数学机制和轻量近似去噪过程，不是 Stable Diffusion 预训练采样。',
        },
    }


def _schedule_chart_data(alpha_bar):
    return {
        'type': 'line',
        'title': '扩散噪声日程',
        'xLabel': '时间步',
        'yLabel': 'alpha_bar',
        'min': 0,
        'max': 1,
        'series': [
            {
                'name': '原图保留权重 alpha_bar',
                'color': '#2563eb',
                'values': [round(float(v), 6) for v in alpha_bar.tolist()],
            }
        ],
    }
