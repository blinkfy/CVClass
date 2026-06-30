"""CLIP teaching pipeline with real image-text embeddings."""
from __future__ import annotations

import numpy as np

from app.modules.phase5_frontier.clip.algorithm import PRESET_CLASS_SETS, zero_shot_classify
from app.utils.image_utils import load_image_u8


def build_pipeline(image_path=None, class_set='animals', custom_classes='', **kwargs):
    class_set = kwargs.get('class_set', class_set)
    custom = str(kwargs.get('custom_classes', custom_classes) or '')
    if not image_path:
        return {
            'error': 'CLIP 需要输入图像才能运行真实图文匹配模型。',
            'steps': [],
            'metrics': {'status': 'missing_input'},
        }

    try:
        img_u8 = load_image_u8(image_path, mode='rgb', max_side=512)
        class_names = [n.strip() for n in custom.split(',') if n.strip()] if custom.strip() else PRESET_CLASS_SETS.get(class_set, PRESET_CLASS_SETS['animals'])
        class_names = class_names[:12] or PRESET_CLASS_SETS['animals']
        result = zero_shot_classify(img_u8, class_names)
    except Exception as exc:
        return {
            'error': f'CLIP 推理失败：{exc}',
            'steps': [],
            'metrics': {'status': 'model_not_available', 'error_type': type(exc).__name__},
        }

    preds = result['predictions']
    prompts = [f'a photo of a {name}' for name in class_names]
    top1_label = preds[0]['label'] if preds else 'N/A'
    top1_prob = f"{preds[0]['probability'] * 100:.1f}%" if preds else 'N/A'

    steps = [
        {
            'id': 'input',
            'name': '输入图像',
            'image': img_u8,
            'formula': 'v_I = ImageEncoder(I)',
            'explanation': 'CLIP 先用图像编码器把整张图片压缩成一个归一化向量。后面的判断都来自这个图像向量和文本向量的相似度。',
            'data': {'height': int(img_u8.shape[0]), 'width': int(img_u8.shape[1])},
        },
        {
            'id': 'text_prompts',
            'name': '候选文本提示',
            'image': _render_prompt_list(prompts),
            'formula': 'T_i = "a photo of a {class_i}"',
            'explanation': '零样本分类的关键是把类别写成自然语言提示，而不是重新训练一个分类头。你可以在页面上直接修改候选文本。',
            'data': {'prompts': prompts},
        },
        {
            'id': 'embeddings',
            'name': '图像与文本 embedding',
            'image': _render_embedding_summary(result.get('image_embedding'), result.get('text_embeddings'), class_names),
            'formula': 'v = f(x) / ||f(x)||',
            'explanation': '图像向量和文本向量被放入同一个语义空间。图中的条纹来自真实 CLIP embedding 的采样值，不是前端手绘示意。',
        },
        {
            'id': 'similarity_chart',
            'name': '图文余弦相似度',
            'image': _render_similarity_chart(preds),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _similarity_chart_data(preds),
            'formula': 'sim(I,T_i)=<v_I,v_T_i>',
            'explanation': f'每条候选文本都和图像向量计算余弦相似度。当前候选集合里，最高分文本是“{top1_label}”。',
            'data': {'predictions': preds},
        },
        {
            'id': 'semantic_space',
            'name': '二维语义空间投影',
            'image': _render_semantic_space(result.get('image_embedding'), result.get('text_embeddings'), preds),
            'formula': 'z_2 = PCA([v_I, v_T])',
            'explanation': '为了直观看懂“同一空间”，后端把图像向量和文本向量投影到二维平面。越靠近图像点的文本，匹配度通常越高。',
        },
        {
            'id': 'text_similarity',
            'name': '候选文本之间的相似度',
            'image': _render_similarity_matrix(preds, result.get('text_similarity')),
            'formula': 'S_ij=<v_T_i,v_T_j>',
            'explanation': '候选文本之间本身也有语义距离。相近的文本会竞争同一个图像证据，因此候选词写法会影响 CLIP 的结果。',
        },
        {
            'id': 'softmax_result',
            'name': f'零样本分类结果：{top1_label}',
            'image': _render_similarity_chart(preds),
            'visual_kind': 'chart',
            'overlay_scope': 'none',
            'chart': _similarity_chart_data(preds, title='候选文本归一化概率'),
            'formula': 'p_i = softmax(100 * sim(I,T_i))',
            'explanation': f'最终概率只在当前候选文本集合内部归一化。Top-1 为 {top1_label}，概率 {top1_prob}。',
            'data': {'predictions': preds},
        },
    ]

    return {
        'steps': steps,
        'outputs': {
            'predictions': preds,
            'prompts': prompts,
        },
        'metrics': {
            'status': 'pretrained_model',
            'backend': 'transformers',
            'model': 'openai/clip-vit-base-patch32',
            'num_classes': len(class_names),
            'top1': top1_label,
            'top1_prob': top1_prob,
            'class_set': class_set if not custom.strip() else 'custom',
        },
        'predictions': preds,
    }


def _render_prompt_list(prompts, width=640, height=270):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 12), '送入 CLIP 文本编码器的候选提示', fill=(15, 23, 42))
    for i, prompt in enumerate(prompts[:10]):
        y = 48 + i * 21
        draw.rectangle((18, y - 3, width - 18, y + 16), fill=(241, 245, 249), outline=(203, 213, 225))
        draw.text((28, y), f'{i + 1}. {prompt}', fill=(51, 65, 85))
    return np.array(img)


def _render_embedding_summary(image_embedding, text_embeddings, labels, width=640, height=300):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 12), '归一化 embedding 采样值', fill=(15, 23, 42))
    image_embedding = np.asarray(image_embedding or [], dtype=np.float64)
    text_embeddings = np.asarray(text_embeddings or [], dtype=np.float64)
    if image_embedding.size == 0 or text_embeddings.size == 0:
        draw.text((18, 60), '没有返回 embedding 数据。', fill=(100, 116, 139))
        return np.array(img)

    sample_idx = np.linspace(0, image_embedding.size - 1, 48).astype(int)
    rows = [('image', image_embedding[sample_idx])]
    for label, emb in zip(labels[:5], text_embeddings[:5]):
        rows.append((label[:12], emb[sample_idx]))

    x0, y0, cell_w, cell_h = 100, 48, 9, 22
    for r, (label, values) in enumerate(rows):
        y = y0 + r * (cell_h + 7)
        draw.text((18, y + 3), label, fill=(51, 65, 85))
        vmax = max(float(np.max(np.abs(values))), 1e-8)
        for c, v in enumerate(values):
            t = float(v / vmax)
            fill = (37, int(110 + 100 * max(t, 0)), 235) if t >= 0 else (225, int(120 + 80 * (1 + t)), 72)
            draw.rectangle((x0 + c * cell_w, y, x0 + c * cell_w + cell_w - 1, y + cell_h), fill=fill)
    return np.array(img)


def _render_similarity_chart(predictions, width=640, height=320):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 12), '图文余弦相似度与归一化概率', fill=(15, 23, 42))
    if not predictions:
        return np.array(img)
    max_sim = max(p['similarity'] for p in predictions)
    min_sim = min(p['similarity'] for p in predictions)
    bar_h = max(18, (height - 72) // len(predictions) - 5)
    for i, p in enumerate(predictions):
        y = 48 + i * (bar_h + 5)
        w_bar = int((p['similarity'] - min_sim) / max(max_sim - min_sim, 1e-8) * (width - 250))
        w_bar = max(8, w_bar)
        fill = (37, int(99 + 95 * float(p['probability'])), 235)
        draw.text((18, y + 3), f"{p['label'][:14]} {p['probability'] * 100:.1f}%", fill=(51, 65, 85))
        draw.rectangle((170, y, 170 + w_bar, y + bar_h), fill=fill)
        draw.text((180 + w_bar, y + 3), f"sim {p['similarity']:.3f}", fill=(71, 85, 105))
    return np.array(img)


def _similarity_chart_data(predictions, title='图文余弦相似度'):
    return {
        'type': 'probability',
        'title': title,
        'xLabel': '候选文本',
        'yLabel': '概率',
        'valueFormat': 'percent',
        'items': [
            {
                'label': p.get('label', f'候选 {idx + 1}'),
                'value': round(float(p.get('probability', 0)), 6),
                'similarity': round(float(p.get('similarity', 0)), 6),
            }
            for idx, p in enumerate((predictions or [])[:12])
        ],
    }


def _render_semantic_space(image_embedding, text_embeddings, predictions, width=520, height=360):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 12), '图像与文本 embedding 的二维投影', fill=(15, 23, 42))
    image_embedding = np.asarray(image_embedding or [], dtype=np.float64)
    text_embeddings = np.asarray(text_embeddings or [], dtype=np.float64)
    if image_embedding.size == 0 or text_embeddings.size == 0:
        return np.array(img)
    all_vecs = np.vstack([image_embedding[None, :], text_embeddings])
    centered = all_vecs - all_vecs.mean(axis=0, keepdims=True)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    coords = centered @ vt[:2].T
    mn, mx = coords.min(axis=0), coords.max(axis=0)
    norm = (coords - mn) / np.maximum(mx - mn, 1e-8)
    pts = np.column_stack([60 + norm[:, 0] * (width - 120), height - 56 - norm[:, 1] * (height - 112)])
    image_pt = pts[0]
    draw.ellipse((image_pt[0] - 10, image_pt[1] - 10, image_pt[0] + 10, image_pt[1] + 10), fill=(225, 29, 72))
    draw.text((image_pt[0] + 12, image_pt[1] - 8), '图像', fill=(225, 29, 72))
    for i, pred in enumerate(predictions):
        if i + 1 >= len(pts):
            continue
        x, y = pts[i + 1]
        color = (37, 99, 235) if i == 0 else (100, 116, 139)
        draw.line((image_pt[0], image_pt[1], x, y), fill=(203, 213, 225), width=1)
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=color)
        draw.text((x + 8, y - 7), str(pred.get('label', 'text'))[:14], fill=color)
    return np.array(img)


def _render_similarity_matrix(predictions, matrix=None, size=340):
    from PIL import Image, ImageDraw

    labels = [p['label'] for p in predictions]
    n = len(labels)
    if n == 0:
        return np.zeros((size, size, 3), dtype=np.uint8) + 248
    matrix = np.eye(n, dtype=np.float64) if matrix is None else np.asarray(matrix, dtype=np.float64)
    if matrix.shape != (n, n):
        matrix = np.eye(n, dtype=np.float64)
    mn, mx = float(matrix.min()), float(matrix.max())
    norm = (matrix - mn) / max(mx - mn, 1e-8)
    cell = max(24, size // n)
    width = n * cell + 96
    height = n * cell + 52
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((12, 8), '候选文本之间的相似度', fill=(15, 23, 42))
    for i in range(n):
        for j in range(n):
            x = 86 + j * cell
            y = 40 + i * cell
            v = float(norm[i, j])
            fill = (int(30 + 210 * v), int(80 + 95 * v), int(220 - 130 * v))
            draw.rectangle((x, y, x + cell - 2, y + cell - 2), fill=fill)
    for i, label in enumerate(labels):
        draw.text((8, 44 + i * cell), label[:10], fill=(51, 65, 85))
        draw.text((88 + i * cell, 25), label[:5], fill=(51, 65, 85))
    return np.array(img)
