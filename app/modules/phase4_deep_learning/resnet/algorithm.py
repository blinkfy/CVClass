"""ResNet-50 inference plus real Grad-CAM visualization."""
from __future__ import annotations

import os

import numpy as np
from app.utils.image_utils import load_image_u8


_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
_MODEL = None
_DEVICE = None


def _get_model():
    global _MODEL, _DEVICE
    if _MODEL is None:
        import torch
        from torchvision.models import ResNet50_Weights, resnet50

        _DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        _MODEL = resnet50(weights=ResNet50_Weights.DEFAULT)
        _MODEL.to(_DEVICE)
        _MODEL.eval()
    return _MODEL, _DEVICE


def build_pipeline(image_path=None, target_rank=1, **kwargs):
    try:
        import torch
        from PIL import Image
        from torchvision.models import ResNet50_Weights
        from torchvision.transforms import CenterCrop, Compose, Normalize, Resize, ToTensor
    except ImportError:
        return _error('PyTorch/torchvision 未安装，无法运行 ResNet + Grad-CAM。', _blank())

    if not image_path:
        demo = os.path.join(_PROJECT_ROOT, 'bus.jpg')
        image_path = demo if os.path.exists(demo) else None

    display_img = load_image_u8(image_path, mode='rgb') if image_path else _blank(224, 224)
    model_img = load_image_u8(image_path, mode='rgb', max_side=320) if image_path else display_img

    try:
        model, device = _get_model()
    except Exception as exc:
        return _error(f'ResNet-50 权重加载失败：{exc}', display_img)

    rank = int(kwargs.get('target_rank', target_rank))
    rank = int(np.clip(rank, 1, 5))

    resize_crop = Compose([Resize(256), CenterCrop(224)])
    preprocess = Compose([
        Resize(256),
        CenterCrop(224),
        ToTensor(),
        Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    pil_img = Image.fromarray(model_img)
    model_view = np.array(resize_crop(pil_img))
    input_tensor = preprocess(pil_img).unsqueeze(0).to(device)

    activations = {}
    gradients = {}
    target_layer = model.layer4[-1].conv3

    def forward_hook(_module, _inp, out):
        activations['value'] = out

    def backward_hook(_module, _grad_in, grad_out):
        gradients['value'] = grad_out[0]

    fh = target_layer.register_forward_hook(forward_hook)
    bh = target_layer.register_full_backward_hook(backward_hook)
    try:
        model.zero_grad(set_to_none=True)
        logits = model(input_tensor)
        probs = torch.softmax(logits, dim=1)[0]
        top5_prob, top5_idx = torch.topk(probs, 5)
        classes = _imagenet_classes(ResNet50_Weights)
        top5 = [
            {
                'class_id': int(idx),
                'label': classes[int(idx)] if int(idx) < len(classes) else str(int(idx)),
                'probability': round(float(prob), 4),
            }
            for idx, prob in zip(top5_idx.detach().cpu().tolist(), top5_prob.detach().cpu().tolist())
        ]
        target_class = top5_idx[rank - 1]
        target_label = top5[rank - 1]['label']
        score = logits[0, target_class]
        score.backward()
    finally:
        fh.remove()
        bh.remove()

    if 'value' not in activations or 'value' not in gradients:
        return _error('Grad-CAM hook 没有捕获到激活或梯度。', display_img)

    act = activations['value'].detach()[0]
    grad = gradients['value'].detach()[0]
    weights = grad.mean(dim=(1, 2), keepdim=True)
    cam = (weights * act).sum(dim=0)
    cam = torch.relu(cam)
    cam = cam - cam.min()
    if float(cam.max()) > 0:
        cam = cam / cam.max()
    cam_np = cam.detach().cpu().numpy()

    feature = torch.relu(act).mean(dim=0)
    feature = feature - feature.min()
    if float(feature.max()) > 0:
        feature = feature / feature.max()
    feature_np = feature.detach().cpu().numpy()

    heat = _resize_heatmap(cam_np, display_img.shape[:2])
    feature_heat = _resize_heatmap(feature_np, display_img.shape[:2], palette='blue')
    overlay = _overlay_heat(display_img, heat)
    result_img = _prediction_overlay(display_img, top5, rank)

    return {
        'steps': [
            {
                'id': 'input',
                'name': '输入图像',
                'image': display_img,
                'formula': 'I in R^{H x W x 3}',
                'problem_statement': 'ResNet 要解决的问题是：判断一张照片里最可能是什么，并解释模型主要看了哪里。',
                'plain_explanation': '先确认要识别的原始照片。后面的分类分数和热力图都必须能回到这张图上解释。',
                'watch_for': '重点看照片里的主体、背景和容易混淆的区域，后面的热力图是否真的落在主体上。',
                'explanation': 'ResNet 接收 RGB 图像，先按 ImageNet 训练配置做缩放、中心裁剪和归一化。',
            },
            {
                'id': 'preprocess',
                'name': 'ImageNet 预处理 224x224',
                'image': model_view,
                'formula': 'x=(resize_crop(I)/255 - mean) / std',
                'problem_statement': 'ResNet 要解决的问题是：判断一张照片里最可能是什么，并解释模型主要看了哪里。',
                'plain_explanation': '把人看的图片整理成模型固定需要的尺寸和数字范围。它不是在改答案，只是在统一输入格式。',
                'watch_for': '看裁剪后主体是否还在画面内；如果主体被裁掉，分类自然会变差。',
                'explanation': '真实模型输入是 224x224 张量。这个步骤说明任意上传图像如何进入固定结构的分类网络。',
            },
            {
                'id': 'residual_block',
                'name': '残差块机制',
                'image': _blank(280, 640),
                'visual_kind': 'architecture',
                'overlay_scope': 'none',
                'diagram': _residual_diagram(),
                'formula': 'y = F(x) + x',
                'problem_statement': 'ResNet 要解决的问题是：网络很深时仍然能稳定学习，而不是越叠越难训练。',
                'plain_explanation': '残差块像一条有旁路的加工线：主路学习“需要改多少”，旁路把原信息直接送到后面，两者相加得到输出。',
                'watch_for': '重点看 shortcut 这条旁路。它让网络不必每层都从零重建信息，只需要学修正量。',
                'explanation': '残差连接让网络学习“修正量”F(x)，同时保留输入 x 的捷径路径，缓解深层网络越深越难训练的问题。',
            },
            {
                'id': 'feature_map',
                'name': '最后卷积层特征响应',
                'image': feature_heat,
                'formula': 'A = layer4(x)',
                'problem_statement': 'ResNet 要解决的问题是：不仅给出分类，还告诉我们判断依据大概来自哪里。',
                'plain_explanation': '这里显示模型深层看到的“有用线索”强弱。亮的地方通常是模型认为更有辨识度的区域。',
                'watch_for': '看高响应区域是否围绕物体主体，而不是只盯着背景、边框或水印。',
                'explanation': 'Grad-CAM 使用最后一组残差块的卷积特征图。亮处表示深层语义特征响应更强的位置。',
            },
            {
                'id': 'predictions',
                'name': f'Top-5 分类结果（当前解释第 {rank} 名）',
                'image': result_img,
                'visual_kind': 'chart',
                'overlay_scope': 'none',
                'chart': _top5_chart_data(top5, active_rank=rank),
                'formula': 'p_c = softmax(logits)_c',
                'problem_statement': 'ResNet 要解决的问题是：从很多候选类别里选出最像照片内容的几个答案。',
                'plain_explanation': '柱越长，模型越相信这个类别。选择不同名次后，后端会重新计算该类别对应的 Grad-CAM。',
                'watch_for': '看第一名是否符合照片主体，也看第二、第三名是否是相近或容易混淆的类别。',
                'explanation': f'真实 ImageNet 分类结果已经算出。你可以点击页面上的 Top-5 类别，让后端重新对该类别做 Grad-CAM 反向传播。',
                'data': {'top5': top5, 'target_rank': rank, 'target_class': target_label},
            },
            {
                'id': 'gradcam',
                'name': f'Grad-CAM：模型为何认为是 {target_label}',
                'image': overlay,
                'formula': 'L^c = ReLU(sum_k alpha_k^c A^k), alpha_k^c = mean(dy^c/dA^k)',
                'problem_statement': 'ResNet 要解决的问题是：把“模型说它是什么”变成可检查的视觉证据。',
                'plain_explanation': '热力图把模型判断这个类别时最依赖的区域盖回原图。红黄区域越强，说明该类别越依赖那里。',
                'watch_for': '如果热力图集中在真实主体上，解释更可信；如果集中在背景上，说明模型可能在用错误线索。',
                'explanation': 'Grad-CAM 对目标类别分数反向传播，用梯度给最后卷积特征图加权。红黄区域表示该类别判断更依赖的视觉证据。',
                'data': {'target_rank': rank, 'target_label': target_label},
            },
            {
                'id': 'raw_heatmap',
                'name': '原始 Grad-CAM 热力图',
                'image': heat,
                'formula': 'CAM -> resize(H,W)',
                'problem_statement': 'ResNet 要解决的问题是：分离出模型证据本身，方便和原图对照。',
                'plain_explanation': '这里去掉原图，只看热力图形状。这样更容易判断模型注意力是不是成片、是否偏离主体。',
                'watch_for': '看热区是否连贯，是否覆盖关键部件，而不是零散噪声点。',
                'explanation': '这一步单独展示热力图本身，方便和叠加结果对照。它是后端真实梯度计算得到的，不是前端涂色。',
            },
        ],
        'outputs': {
            'top5': top5,
            'target_rank': rank,
            'target_label': target_label,
        },
        'metrics': {
            'status': 'pretrained_model',
            'model': 'resnet50',
            'backend': 'torchvision',
            'device': str(device),
            'top1': top5[0]['label'],
            'top1_conf': top5[0]['probability'],
            'target_rank': rank,
            'target_label': target_label,
        },
    }


def _imagenet_classes(weights_cls):
    classes_path = os.path.join(_PROJECT_ROOT, 'static', 'data', 'imagenet_classes.txt')
    try:
        with open(classes_path, encoding='utf-8') as f:
            return [line.strip() for line in f.readlines()]
    except FileNotFoundError:
        return list(weights_cls.DEFAULT.meta.get('categories', [str(i) for i in range(1000)]))


def _blank(h=120, w=420):
    return np.zeros((h, w, 3), dtype=np.uint8) + 240


def _resize_heatmap(values, shape_hw, palette='hot'):
    from PIL import Image

    h, w = shape_hw
    v = np.asarray(values, dtype=np.float32)
    v = np.clip(v, 0, 1)
    v = np.array(Image.fromarray((v * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), dtype=np.float32) / 255.0
    if palette == 'blue':
        r = (30 + 40 * v).astype(np.uint8)
        g = (90 + 140 * v).astype(np.uint8)
        b = (170 + 75 * v).astype(np.uint8)
    else:
        r = (80 + 175 * v).astype(np.uint8)
        g = (30 + 190 * np.clip(v - 0.12, 0, 1)).astype(np.uint8)
        b = (160 * (1 - v)).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def _overlay_heat(img, heat):
    return np.clip(img.astype(np.float32) * 0.50 + heat.astype(np.float32) * 0.50, 0, 255).astype(np.uint8)


def _prediction_overlay(img, top5, rank):
    from PIL import Image, ImageDraw

    canvas = Image.fromarray(img.copy())
    draw = ImageDraw.Draw(canvas)
    box_w = min(canvas.width - 16, 430)
    draw.rectangle((8, 8, 8 + box_w, 128), fill=(15, 23, 42))
    for i, item in enumerate(top5):
        y = 16 + i * 21
        color = (250, 204, 21) if i + 1 == rank else (226, 232, 240)
        draw.text((18, y), f"{i + 1}. {item['label'][:32]}  {item['probability']:.3f}", fill=color)
    return np.array(canvas)


def _top5_chart_data(top5, active_rank=1):
    return {
        'type': 'probability',
        'title': 'ImageNet Top-5 概率',
        'xLabel': '类别',
        'yLabel': '概率',
        'valueFormat': 'percent',
        'items': [
            {
                'label': item.get('label', f'类别 {idx + 1}'),
                'value': round(float(item.get('probability', 0)), 6),
                'kept': idx + 1 == int(active_rank),
            }
            for idx, item in enumerate(top5[:5])
        ],
    }


def _residual_diagram():
    return {
        'title': '残差块：主路学习修正，旁路保留原信号',
        'subtitle': '深层网络不必每层都重新发明特征，只需要学习 F(x)，再和 x 相加。',
        'nodes': [
            {'id': 'x', 'label': '输入 x', 'detail': '上一层传来的特征', 'tone': 'input'},
            {'id': 'fx', 'label': '主路 F(x)', 'detail': '卷积、归一化、激活学习修正量', 'tone': 'block'},
            {'id': 'add', 'label': '相加', 'detail': '修正量 + 原信号', 'tone': 'skip'},
            {'id': 'y', 'label': '输出 y', 'detail': 'y = F(x) + x', 'tone': 'output'},
        ],
        'edges': [
            {'from': 'x', 'to': 'fx', 'label': '主路计算'},
            {'from': 'fx', 'to': 'add', 'label': '修正量'},
            {'from': 'x', 'to': 'add', 'label': 'shortcut', 'skip': True},
            {'from': 'add', 'to': 'y', 'label': '输出'},
        ],
    }


def _residual_card(width=640, height=280):
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.text((18, 14), 'Residual block: learn a correction, keep a shortcut', fill=(15, 23, 42))
    draw.rounded_rectangle((70, 100, 170, 160), radius=8, fill=(59, 130, 246))
    draw.text((102, 122), 'x', fill=(255, 255, 255))
    draw.rounded_rectangle((250, 80, 390, 180), radius=8, fill=(37, 99, 235))
    draw.text((286, 118), 'F(x)', fill=(255, 255, 255))
    draw.rounded_rectangle((470, 100, 570, 160), radius=8, fill=(34, 197, 94))
    draw.text((502, 122), 'y', fill=(255, 255, 255))
    draw.line((170, 130, 250, 130), fill=(71, 85, 105), width=3)
    draw.line((390, 130, 470, 130), fill=(71, 85, 105), width=3)
    draw.arc((128, 52, 512, 210), 185, 355, fill=(245, 158, 11), width=4)
    draw.text((242, 218), 'y = F(x) + x', fill=(146, 64, 14))
    return np.array(img)


def _error(message, img):
    return {
        'steps': [
            {
                'id': 'error',
                'name': '错误',
                'image': img,
                'formula': 'status=error',
                'explanation': message,
            }
        ],
        'metrics': {'status': 'error', 'error': message},
    }
