"""Small real GAN training trace for teaching."""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.utils.image_utils import load_chinese_font


def _mm(a, b):
    return np.einsum('ik,kj->ij', np.asarray(a), np.asarray(b), optimize=False)


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -40.0, 40.0)))


def _real_samples(rng, n):
    centers = np.array([[-1.8, -1.4], [-1.4, 1.5], [1.6, -1.2], [1.4, 1.4]], dtype=np.float64)
    idx = rng.integers(0, len(centers), size=n)
    return centers[idx] + rng.normal(0.0, 0.18, size=(n, 2))


def _init_params(rng):
    return {
        'Wg1': rng.normal(0, 0.45, (2, 16)),
        'bg1': np.zeros(16),
        'Wg2': rng.normal(0, 0.35, (16, 2)),
        'bg2': np.zeros(2),
        'Wd1': rng.normal(0, 0.55, (2, 18)),
        'bd1': np.zeros(18),
        'Wd2': rng.normal(0, 0.45, (18, 1)),
        'bd2': np.zeros(1),
    }


def _G(z, p):
    h = np.tanh(_mm(z, p['Wg1']) + p['bg1'])
    x = _mm(h, p['Wg2']) + p['bg2']
    return x, h


def _D(x, p):
    h = np.tanh(_mm(x, p['Wd1']) + p['bd1'])
    logit = _mm(h, p['Wd2']) + p['bd2']
    return _sigmoid(logit), h, logit


def _bce(prob, target):
    eps = 1e-8
    return -np.mean(target * np.log(prob + eps) + (1.0 - target) * np.log(1.0 - prob + eps))


def _train_gan(seed=7, iterations=260, batch=128):
    rng = np.random.default_rng(seed)
    p = _init_params(rng)
    lr_d, lr_g = 0.035, 0.025
    losses = []
    checkpoints = []
    checkpoint_iters = set(np.linspace(0, iterations - 1, 6, dtype=int).tolist())
    z_probe = rng.normal(0, 1, size=(512, 2))
    real_vis = _real_samples(rng, 512)

    for it in range(iterations):
        real = _real_samples(rng, batch)
        z = rng.normal(0, 1, size=(batch, 2))
        fake, _ = _G(z, p)

        x_all = np.vstack([real, fake])
        y_all = np.vstack([np.ones((batch, 1)), np.zeros((batch, 1))])
        pred, h_d, _ = _D(x_all, p)
        dlogit = (pred - y_all) / len(x_all)
        gWd2 = _mm(h_d.T, dlogit)
        gbd2 = dlogit.sum(axis=0)
        dh = _mm(dlogit, p['Wd2'].T) * (1.0 - h_d * h_d)
        gWd1 = _mm(x_all.T, dh)
        gbd1 = dh.sum(axis=0)
        p['Wd2'] -= lr_d * gWd2
        p['bd2'] -= lr_d * gbd2
        p['Wd1'] -= lr_d * gWd1
        p['bd1'] -= lr_d * gbd1

        z = rng.normal(0, 1, size=(batch, 2))
        fake, h_g = _G(z, p)
        pred_fake, h_df, _ = _D(fake, p)
        dlogit_g = (pred_fake - 1.0) / batch
        dhd = _mm(dlogit_g, p['Wd2'].T) * (1.0 - h_df * h_df)
        dfake = _mm(dhd, p['Wd1'].T)
        gWg2 = _mm(h_g.T, dfake)
        gbg2 = dfake.sum(axis=0)
        dhg = _mm(dfake, p['Wg2'].T) * (1.0 - h_g * h_g)
        gWg1 = _mm(z.T, dhg)
        gbg1 = dhg.sum(axis=0)
        p['Wg2'] -= lr_g * gWg2
        p['bg2'] -= lr_g * gbg2
        p['Wg1'] -= lr_g * gWg1
        p['bg1'] -= lr_g * gbg1

        if it % 10 == 0 or it == iterations - 1:
            real_eval = _real_samples(rng, batch)
            fake_eval, _ = _G(rng.normal(0, 1, size=(batch, 2)), p)
            pr, _, _ = _D(real_eval, p)
            pf, _, _ = _D(fake_eval, p)
            losses.append({
                'iter': it,
                'D_loss': float(_bce(pr, 1.0) + _bce(pf, 0.0)),
                'G_loss': float(_bce(pf, 1.0)),
                'D_real': float(pr.mean()),
                'D_fake': float(pf.mean()),
            })
        if it in checkpoint_iters or it == iterations - 1:
            fake_probe, _ = _G(z_probe, p)
            checkpoints.append({'iter': it, 'fake': fake_probe.copy()})

    final_fake, _ = _G(z_probe, p)
    return p, real_vis, checkpoints, final_fake, losses


def _xy_to_canvas(points, width, height):
    arr = np.asarray(points, dtype=np.float64)
    x = np.clip((arr[:, 0] + 2.8) / 5.6, 0, 1)
    y = np.clip((arr[:, 1] + 2.4) / 4.8, 0, 1)
    return (x * (width - 1)).astype(int), ((1.0 - y) * (height - 1)).astype(int)


def _scatter(real, fake=None, title='GAN samples', width=520, height=360):
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.rectangle((42, 24, width - 22, height - 34), outline=(203, 213, 225), width=1)
    draw.line((42, height // 2, width - 22, height // 2), fill=(226, 232, 240))
    draw.line((width // 2, 24, width // 2, height - 34), fill=(226, 232, 240))
    draw.text((18, 6), title, fill=(15, 23, 42))
    rx, ry = _xy_to_canvas(real, width, height)
    for x, y in zip(rx, ry):
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(37, 99, 235))
    if fake is not None:
        fx, fy = _xy_to_canvas(fake, width, height)
        for x, y in zip(fx, fy):
            draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=(225, 29, 72))
        draw.text((width - 178, 8), '蓝=真实 红=生成', fill=(71, 85, 105))
    return np.array(img)


def _loss_chart(losses, width=520, height=260):
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    pad_l, pad_t, pad_r, pad_b = 48, 24, 20, 38
    draw.rectangle((pad_l, pad_t, width - pad_r, height - pad_b), outline=(203, 213, 225))
    xs = np.array([d['iter'] for d in losses], dtype=np.float64)
    d_loss = np.array([d['D_loss'] for d in losses], dtype=np.float64)
    g_loss = np.array([d['G_loss'] for d in losses], dtype=np.float64)
    y_max = max(float(d_loss.max()), float(g_loss.max()), 1.0)

    def pts(values):
        x = pad_l + (xs - xs.min()) / max(xs.max() - xs.min(), 1e-8) * (width - pad_l - pad_r)
        y = height - pad_b - values / y_max * (height - pad_t - pad_b)
        return list(zip(x.astype(int), y.astype(int)))

    draw.line(pts(d_loss), fill=(37, 99, 235), width=3)
    draw.line(pts(g_loss), fill=(225, 29, 72), width=3)
    draw.text((16, 6), '真实 NumPy 对抗训练损失', fill=(15, 23, 42))
    draw.text((60, height - 28), '蓝：判别器损失', fill=(37, 99, 235))
    draw.text((250, height - 28), '红：生成器损失', fill=(225, 29, 72))
    return np.array(img)


def _decision_surface(p, width=420, height=320):
    xs = np.linspace(-2.8, 2.8, width)
    ys = np.linspace(2.4, -2.4, height)
    xx, yy = np.meshgrid(xs, ys)
    grid = np.stack([xx.ravel(), yy.ravel()], axis=1)
    prob, _, _ = _D(grid, p)
    prob = prob.reshape(height, width)
    r = (prob * 255).astype(np.uint8)
    b = ((1.0 - prob) * 255).astype(np.uint8)
    g = (80 + np.abs(prob - 0.5) * 120).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _decision_surface_chart_data(p, rows=30, cols=38):
    xs = np.linspace(-2.8, 2.8, cols)
    ys = np.linspace(2.4, -2.4, rows)
    xx, yy = np.meshgrid(xs, ys)
    grid = np.stack([xx.ravel(), yy.ravel()], axis=1)
    prob, _, _ = _D(grid, p)
    values = prob.reshape(rows, cols)
    return {
        'type': 'matrix',
        'title': '判别器认为“像真实样本”的区域',
        'subtitle': '暖色更像真实数据，冷色更像生成器还没有学好的区域。',
        'xLabel': '特征 1',
        'yLabel': '特征 2',
        'min': 0,
        'max': 1,
        'matrix': [[round(float(v), 4) for v in row] for row in values.tolist()],
    }


def _checkpoint_strip(real, checkpoints):
    thumbs = []
    for item in checkpoints[:6]:
        img = Image.fromarray(_scatter(real, item['fake'], f"iter {item['iter']}", width=260, height=190))
        thumbs.append(img)
    width = sum(t.width for t in thumbs) + 8 * (len(thumbs) - 1)
    canvas = Image.new('RGB', (width, 190), (248, 250, 252))
    x = 0
    for thumb in thumbs:
        canvas.paste(thumb, (x, 0))
        x += thumb.width + 8
    return np.array(canvas)


def _mode_style(point):
    centers = np.array([[-1.8, -1.4], [-1.4, 1.5], [1.6, -1.2], [1.4, 1.4]], dtype=np.float64)
    colors = [(37, 99, 235), (13, 148, 136), (225, 29, 72), (245, 158, 11)]
    arr = np.asarray(point, dtype=np.float64)
    dist = np.linalg.norm(centers - arr[:2], axis=1)
    mode = int(np.argmin(dist))
    confidence = float(np.exp(-dist[mode] * 0.62))
    return mode, colors[mode], np.clip(confidence, 0.22, 1.0)


def _draw_sample(draw, point, box, real=False):
    x0, y0, x1, y1 = box
    mode, color, confidence = _mode_style(point)
    bg = tuple(int(248 - 26 * confidence) for _ in range(3))
    draw.rounded_rectangle(box, radius=6, fill=bg, outline=(203, 213, 225), width=1)
    cx = (x0 + x1) // 2 + int(np.clip(point[0], -2.5, 2.5) * 2)
    cy = (y0 + y1) // 2 - int(np.clip(point[1], -2.2, 2.2) * 2)
    span = int((x1 - x0) * (0.22 + 0.22 * confidence))
    fill = tuple(int(235 * (1 - confidence) + c * confidence) for c in color)
    outline = (15, 23, 42) if real else (88, 28, 135)
    if mode == 0:
        draw.ellipse((cx - span, cy - span, cx + span, cy + span), fill=fill, outline=outline, width=2)
    elif mode == 1:
        draw.rounded_rectangle((cx - span, cy - span // 2, cx + span, cy + span // 2), radius=5, fill=fill, outline=outline, width=2)
        draw.rounded_rectangle((cx - span // 2, cy - span, cx + span // 2, cy + span), radius=5, fill=fill, outline=outline, width=2)
    elif mode == 2:
        draw.polygon([(cx, cy - span), (cx + span, cy), (cx, cy + span), (cx - span, cy)], fill=fill, outline=outline)
    else:
        draw.rounded_rectangle((cx - span, cy - span, cx + span, cy + span), radius=8, fill=fill, outline=outline, width=2)


def _sample_grid(points, title='generated samples', limit=12, width=520):
    arr = np.asarray(points, dtype=np.float64)
    if len(arr) > limit:
        idx = np.linspace(0, len(arr) - 1, limit, dtype=int)
        arr = arr[idx]
    cols = 4
    cell = 82
    gap = 12
    title_h = 46
    rows = int(np.ceil(len(arr) / cols))
    height = title_h + rows * cell + max(0, rows - 1) * gap + 18
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    font_title = load_chinese_font(18)
    font_body = load_chinese_font(13)
    draw.text((18, 14), title, fill=(15, 23, 42), font=font_title)
    start_x = max(18, (width - (cols * cell + (cols - 1) * gap)) // 2)
    for i, point in enumerate(arr):
        row, col = divmod(i, cols)
        x0 = start_x + col * (cell + gap)
        y0 = title_h + row * (cell + gap)
        _draw_sample(draw, point, (x0, y0, x0 + cell, y0 + cell), real=False)
        draw.text((x0 + 8, y0 + cell - 17), f'z{i + 1}', fill=(71, 85, 105), font=font_body)
    return np.array(img)


def _generation_flow_diagram():
    return {
        'title': 'GAN 怎样从噪声造样本',
        'subtitle': '生成器负责造，判别器负责挑错，梯度把生成器推向更像真实数据的方向。',
        'nodes': [
            {'id': 'z', 'label': '随机噪声 z', 'detail': '一组没有语义的数字', 'tone': 'source'},
            {'id': 'g', 'label': '生成器 G', 'detail': '把数字变成样本', 'tone': 'process'},
            {'id': 'sample', 'label': '生成样本', 'detail': '当前造出来的小图', 'tone': 'output'},
            {'id': 'd', 'label': '判别器 D', 'detail': '判断像不像真实数据', 'tone': 'decision'},
            {'id': 'grad', 'label': '反馈梯度', 'detail': '告诉 G 往哪里改', 'tone': 'feedback'},
        ],
        'edges': [
            {'from': 'z', 'to': 'g', 'label': '输入'},
            {'from': 'g', 'to': 'sample', 'label': '生成'},
            {'from': 'sample', 'to': 'd', 'label': '打分'},
            {'from': 'd', 'to': 'grad', 'label': '指出差异'},
            {'from': 'grad', 'to': 'g', 'label': '更新', 'skip': True},
        ],
    }


def _training_timeline_chart(checkpoints):
    items = []
    total = max(1, len(checkpoints) - 1)
    for index, item in enumerate(checkpoints[:6]):
        items.append({
            'label': f'iter {int(item["iter"])}',
            'value': round(index / total, 4),
            'color': ['#64748b', '#2563eb', '#0d9488', '#f59e0b', '#e11d48', '#7c3aed'][index % 6],
        })
    return {
        'type': 'flow',
        'title': '生成器训练时间线',
        'subtitle': '从乱造到逐步靠近真实分布；节点表示训练 checkpoint。',
        'items': items,
    }


def _sample_grid_legend():
    return {
        'meaning': '每个小格不是照片，而是把生成器输出的二维点渲染成一个教学图标。',
        'shape': '圆形、十字、菱形、方块对应真实数据分布里的四个模式。',
        'color': '颜色对应离哪个真实模式最近；颜色越稳定，说明生成器输出越集中。',
        'position': '图形在格子里的轻微偏移来自 G(z) 的二维坐标，用来保留训练变化痕迹。',
        'purpose': '它帮助非专业观众理解“随机噪声 z 经过生成器后会变成一个样本”。',
    }


def _sample_points(points, limit=180):
    arr = np.asarray(points, dtype=np.float64)
    if len(arr) > limit:
        idx = np.linspace(0, len(arr) - 1, limit, dtype=int)
        arr = arr[idx]
    return [[round(float(x), 4), round(float(y), 4)] for x, y in arr[:, :2]]


def _scatter_chart_data(real, fake=None, title='真实与生成样本分布'):
    groups = [
        {'name': '真实样本', 'color': '#2563eb', 'points': _sample_points(real), 'radius': 3, 'alpha': 0.62},
    ]
    if fake is not None:
        groups.append({'name': '生成样本', 'color': '#e11d48', 'points': _sample_points(fake), 'radius': 3, 'alpha': 0.72})
    return {
        'type': 'scatter',
        'title': title,
        'subtitle': '蓝点是真实数据，红点是生成器当前造出的样本。',
        'xLabel': '特征 1',
        'yLabel': '特征 2',
        'xMin': -2.8,
        'xMax': 2.8,
        'yMin': -2.4,
        'yMax': 2.4,
        'groups': groups,
    }


def build_pipeline(image_path=None, **kwargs):
    iterations = int(kwargs.get('iterations', 260))
    iterations = max(80, min(iterations, 400))
    p, real, checkpoints, final_fake, losses = _train_gan(iterations=iterations)
    final = losses[-1]
    steps = [
        {
            'id': 'real_distribution',
            'name': '真实数据分布',
            'image': _scatter(real, None, '真实目标分布'),
            'explanation': '这里用四个二维高斯团作为“真实图像数据分布”的可视化替身。GAN 的目标是让生成分布接近真实分布。',
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _scatter_chart_data(real, title='真实数据长什么样'),
            'problem_statement': 'GAN 要解决的问题是：让机器学会造出看起来像真实数据的新样本。',
            'plain_explanation': '先给出“真实样本应该分布在哪里”。这里用二维点云代替真实图片，方便直接观察生成器有没有学到形状。',
            'watch_for': '重点看蓝点形成的几个簇：生成器后面要尽量把红点推到这些区域附近。',
            'formula': 'x ~ p_data(x)',
            'data': {'sample_count': int(len(real)), 'distribution': '4 Gaussian modes'},
        },
        {
            'id': 'initial_generator',
            'name': '训练前生成器',
            'image': _scatter(real, checkpoints[0]['fake'], '训练前：G(z) 远离真实数据'),
            'explanation': '生成器从随机噪声 z 出发。训练前红色生成样本和蓝色真实样本明显不一致。',
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _scatter_chart_data(real, checkpoints[0]['fake'], title='训练前：生成器还不会造'),
            'problem_statement': 'GAN 要解决的问题是：把随机噪声变成像真实数据的新样本。',
            'plain_explanation': '训练前生成器几乎是乱造，红点和蓝点对不上。判别器会利用这种差异给生成器提供改进方向。',
            'watch_for': '看红点是否远离蓝色簇；这就是训练开始时“造假很容易被识破”的状态。',
            'formula': 'z ~ N(0,I), x_fake=G_theta(z)',
        },
        {
            'id': 'generation_flow',
            'name': '从噪声到生成样本的流程',
            'image': _sample_grid(checkpoints[0]['fake'], '训练前：随机噪声生成的小图样本'),
            'visual_kind': 'architecture',
            'overlay_scope': 'none',
            'diagram': _generation_flow_diagram(),
            'explanation': 'GAN 的核心不是“把图片丢进模型”，而是让生成器从随机噪声 z 造样本，再让判别器指出它哪里不像真实数据。这里的小图是教学渲染：形状和颜色代表生成器当前落到哪一种数据模式。',
            'problem_statement': 'GAN 要解决的问题是：自动造出看起来像训练集的新样本，比如人脸、纹理、图标或医学影像候选图。',
            'plain_explanation': '可以把它想成一位造图者和一位鉴别者：z 是随机起点，G(z) 是造出来的样本，D(G(z)) 是鉴别者给出的“像不像真的”分数。',
            'watch_for': '看箭头里的反馈：判别器不是只给一个分数，它还通过梯度告诉生成器下一次该往哪个方向改。',
            'formula': 'z -> G(z) -> D(G(z)) -> grad_theta_G',
            'data': {
                'real_model': False,
                'mechanism': 'local tiny GAN plus deterministic sample renderer',
                'formula_terms': {
                    'z': '随机噪声输入',
                    'G(z)': '生成器输出的样本坐标',
                    'D(G(z))': '判别器认为该样本像真实数据的概率',
                    'grad_theta_G': '反馈给生成器的更新方向',
                },
                'legend': _sample_grid_legend(),
            },
        },
        {
            'id': 'image_samples_before',
            'name': '训练前生成小图',
            'image': _sample_grid(checkpoints[0]['fake'], '训练前：样本形状分散、不稳定'),
            'explanation': '这些小图由生成器输出的二维点确定性渲染而来，不是照片。圆形、十字、菱形、方块表示四种真实数据模式；训练前的样本通常分散、形状不稳定。',
            'problem_statement': 'GAN 要解决的问题是：让随机输入不再只产生杂乱样本，而是产生像真实集合的新样本。',
            'plain_explanation': '训练前就像随手乱画：每个 z 都会生成一个小图，但生成器还不知道真实样本应该集中到哪几种形状附近。',
            'watch_for': '看小图是否形状统一、是否覆盖多种样式；训练前通常两点都做不好。',
            'formula': 'image_sample = render(G_theta(z))',
            'data': {
                'sample_grid': True,
                'checkpoint': int(checkpoints[0]['iter']),
                'legend': _sample_grid_legend(),
                'formula_terms': {
                    'G_theta': '带参数的生成器',
                    'render': '把二维坐标转成教学小图的本地渲染函数',
                },
            },
        },
    ]
    for item in checkpoints[1:-1]:
        steps.append({
            'id': f'checkpoint_{item["iter"]}',
            'name': f'训练 checkpoint：iter {item["iter"]}',
            'image': _scatter(real, item['fake'], f'训练迭代 {item["iter"]}'),
            'explanation': '播放这些 checkpoint 可以看到生成器分布逐步被判别器梯度推向真实数据模式。',
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _scatter_chart_data(real, item['fake'], title=f'训练到第 {item["iter"]} 轮'),
            'problem_statement': 'GAN 要解决的问题是：通过一轮轮博弈，让生成样本越来越像真实样本。',
            'plain_explanation': '这一帧展示训练中的生成器。红点如果逐渐靠近蓝色簇，说明生成器正在学会真实数据的分布形状。',
            'watch_for': '看红点是覆盖多个蓝色簇，还是只挤到某一个簇；后者就是常见的模式坍塌苗头。',
            'formula': 'theta_G <- theta_G - eta grad L_G',
            'data': {'iter': int(item['iter'])},
        })
    steps.extend([
        {
            'id': 'adversarial_training',
            'name': '对抗训练损失曲线',
            'image': _loss_chart(losses),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _loss_chart_data(losses),
            'explanation': '判别器学习区分真样本和假样本；生成器利用判别器梯度，让假样本更像真样本。曲线来自本地 NumPy 反向传播。',
            'problem_statement': 'GAN 要解决的问题是：让生成器和判别器在对抗中互相推动。',
            'plain_explanation': '这张曲线不是最终效果图，而是训练过程的体温计。判别器和生成器的损失会拉扯、震荡，不一定像普通监督学习那样单调下降。',
            'watch_for': '看两条线是否完全发散；轻微震荡正常，长期一边倒说明博弈失衡。',
            'formula': 'min_G max_D E[log D(x)] + E[log(1-D(G(z)))]',
            'data': {'losses': losses},
        },
        {
            'id': 'discriminator_surface',
            'name': '判别器决策面',
            'image': _decision_surface(p),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _decision_surface_chart_data(p),
            'explanation': '暖色区域更像判别器认为的真实区域，冷色区域更像假区域。生成器更新方向来自这张“地形图”的梯度。',
            'problem_statement': 'GAN 要解决的问题是：让判别器提供可学习的方向，而不是只说“真”或“假”。',
            'plain_explanation': '这张图可以理解成判别器心里的地图：哪里更像真实数据，生成器就会被训练得往哪里靠。',
            'watch_for': '看暖色区域是否覆盖真实数据簇附近；如果整张图一边倒，生成器就很难得到有用反馈。',
            'formula': 'D_phi(x)=sigmoid(f_phi(x))',
            'data': {'surface_min': 0.0, 'surface_max': 1.0, 'rendered_as': 'frontend matrix chart'},
        },
        {
            'id': 'training_timeline',
            'name': '生成分布移动时间线',
            'image': _checkpoint_strip(real, checkpoints),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _training_timeline_chart(checkpoints),
            'explanation': '把多个 checkpoint 放在一起，可以直观看到生成分布如何从随机状态逐步靠近真实分布。',
            'problem_statement': 'GAN 要解决的问题是：让生成器经过多轮反馈，逐步靠近真实样本分布。',
            'plain_explanation': '时间线展示训练不是一步完成的：一开始乱，后来逐渐靠近真实样本所在的区域。',
            'watch_for': '看过程是否逐步靠近多个真实簇，而不是只学会一种样式。',
            'formula': 'p_G^{(t)} -> p_data',
            'data': {'checkpoints': [int(c['iter']) for c in checkpoints[:6]], 'rendered_as': 'frontend flow chart'},
        },
        {
            'id': 'image_samples_after',
            'name': '训练后生成小图',
            'image': _sample_grid(final_fake, '训练后：生成样本更像真实集合'),
            'explanation': '训练后，生成器输出的点更靠近真实分布，对应的小图也更稳定。这个网格是本地机制渲染：形状表示学到的模式，颜色表示离哪类真实簇更近，不是大模型生成照片。',
            'problem_statement': 'GAN 要解决的问题是：从随机噪声采样出新的、像训练集但不是复制训练集的样本。',
            'plain_explanation': '现在可以更直观看到 GAN 的目的：不是识别图片，而是让不同随机 z 生成一批看起来属于同一数据集合的新样本。',
            'watch_for': '看小图是否比训练前更稳定、是否覆盖多种形状；如果只剩一种形状，就说明生成器可能模式坍塌。',
            'formula': 'z ~ N(0,I), generated_image = render(G_theta(z))',
            'data': {
                'sample_grid': True,
                'checkpoint': 'final',
                'legend': _sample_grid_legend(),
                'formula_terms': {
                    'z ~ N(0,I)': '每次从标准正态分布抽一个随机输入',
                    'G_theta(z)': '训练后的生成器输出',
                    'generated_image': '为教学展示渲染出来的小图样本',
                },
            },
        },
        {
            'id': 'trained_generator',
            'name': '训练后生成结果',
            'image': _scatter(real, final_fake, '训练后：生成样本靠近真实模式'),
            'explanation': '训练后红点被推向真实数据的几个主要模式。这是真实小型 GAN 训练结果，不是预训练图像生成器。',
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _scatter_chart_data(real, final_fake, title='训练后：生成样本靠近真实分布'),
            'problem_statement': 'GAN 要解决的问题是：最终能从随机噪声中采样出像真实数据的新样本。',
            'plain_explanation': '训练后如果红点覆盖到蓝点所在的几个区域，就说明生成器学到了“真实数据大概长什么样”。',
            'watch_for': '看红点是否覆盖多个真实簇，以及是否仍有大量红点飘在空白区域。',
            'formula': 'x_fake=G_theta(z)',
            'data': {'D_real': round(final['D_real'], 4), 'D_fake': round(final['D_fake'], 4)},
        },
    ])
    return {
        'steps': steps,
        'outputs': {'checkpoints': [{'iter': int(c['iter'])} for c in checkpoints]},
        'metrics': {
            'status': 'local_mechanism',
            'backend': 'NumPy',
            'algorithm': 'tiny GAN with real backpropagation',
            'real_model': False,
            'iterations': iterations,
            'D_loss_final': round(final['D_loss'], 4),
            'G_loss_final': round(final['G_loss'], 4),
            'note': '本页展示真实本地 GAN 训练机制，不是大型预训练图像生成器。',
        },
    }


def _loss_chart_data(losses):
    return {
        'type': 'line',
        'title': '对抗训练损失',
        'xLabel': '迭代',
        'yLabel': '损失',
        'series': [
            {'name': '判别器损失', 'color': '#2563eb', 'values': [round(float(row['D_loss']), 6) for row in losses]},
            {'name': '生成器损失', 'color': '#e11d48', 'values': [round(float(row['G_loss']), 6) for row in losses]},
        ],
    }
