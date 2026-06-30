"""Implementation truth table for frontend/API reporting.

The UI must say what each module really runs.  A local teaching mechanism is
useful, but it must not be reported as pretrained inference.
"""
from __future__ import annotations

import os


DEFAULT_IMPLEMENTATION = {
    'status': '真实 NumPy 算法',
    'category': 'numpy_algorithm',
    'backend': 'NumPy/Pillow',
    'local_inference': True,
    'real_model': False,
    'requires_upload': True,
    'model': '',
    'note': '项目内手写或本地算法实现，返回真实中间结果。',
}


# Stable Diffusion is no longer part of the formal scope. Keep it as a
# compatibility teaching visualization unless a future pass wires real weights.
LOCAL_TEACHING_MODELS = {
    'stable_diffusion',
}


LOCAL_FRONTIER_ALGORITHMS = {
    'swin', 'dino', 'mae', 'dino_det', 'grdino', 'mask2former', 'sam2',
    'blip2', 'controlnet', 'dit', 'flux', 'stylegan', 'dust3r',
    'orbslam3', 'mediapipe', 'vitpose',
}


OFFLINE_TEACHING = set()
REQUIRES_EXTERNAL_WEIGHTS = set()


EXTERNAL_WEIGHT_META = {
    'status': 'requires external weights',
    'category': 'requires_external_weights',
    'backend': 'external pretrained model',
    'local_inference': False,
    'real_model': True,
    'requires_upload': False,
    'model': '',
    'note': 'This algorithm requires local pretrained weights or a remote model. It is intentionally disabled in offline mode.',
}


OFFLINE_TEACHING_META = {
    'status': 'offline teaching demo',
    'category': 'teaching_simulation',
    'backend': 'NumPy/PIL',
    'local_inference': True,
    'real_model': False,
    'requires_upload': False,
    'model': '',
    'note': 'Offline teaching visualization; not a pretrained-model inference result.',
}


LOCAL_TEACHING_MODEL_META = {
    'status': 'local deterministic teaching visualization',
    'category': 'numpy_algorithm',
    'backend': 'NumPy/PIL deterministic teaching visualization',
    'local_inference': True,
    'real_model': False,
    'requires_upload': False,
    'model': 'local teaching pipeline',
    'note': 'This page shows algorithm mechanics with deterministic local visualizations. It is not pretrained inference.',
}


LOCAL_FRONTIER_ALGORITHM_META = {
    'status': 'local small algorithm implementation',
    'category': 'numpy_algorithm',
    'backend': 'NumPy/PIL local mechanism implementation',
    'local_inference': True,
    'real_model': False,
    'requires_upload': False,
    'model': 'local mechanism pipeline',
    'note': 'Local small algorithm implementation; not pretrained-weight inference.',
}


IMPLEMENTATION_META = {
    'ai_eye': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'Faster R-CNN / DeepLabV3 / Mask R-CNN and selectable torchvision variants',
        'note': 'AI之眼主结果来自 torchvision 官方预训练权重；权重缺失时返回下载建议，不用启发式结果冒充成功。',
    },
    'detection': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'fasterrcnn_resnet50_fpn',
        'note': '通过 AI之眼统一管线运行真实目标检测模型。',
    },
    'semantic': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'deeplabv3_resnet50 / fcn_resnet50',
        'note': '通过 AI之眼统一管线运行真实语义分割模型。',
    },
    'instance': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'maskrcnn_resnet50_fpn',
        'note': '通过 AI之眼统一管线运行真实实例分割模型。',
    },
    'faster_rcnn': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'fasterrcnn_resnet50_fpn',
        'note': 'Faster R-CNN 别名走 AI之眼目标检测管线。',
    },
    'fcn': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'fcn_resnet50',
        'note': 'FCN 别名走 AI之眼语义分割管线。',
    },
    'mask_rcnn': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'maskrcnn_resnet50_fpn',
        'note': 'Mask R-CNN 别名走 AI之眼实例分割管线。',
    },
    'yolo': {
        'status': '真实本地机制实现',
        'category': 'local_mechanism',
        'backend': 'NumPy/Pillow one-stage grid detector',
        'local_inference': True,
        'real_model': False,
        'requires_upload': True,
        'model': 'YOLO-style one-stage grid mechanism',
        'note': '后端真实计算网格、目标性、候选框和重叠抑制；不冒充官方 YOLO 预训练权重。',
    },
    'unet': {
        'status': '真实本地机制实现',
        'category': 'local_mechanism',
        'backend': 'NumPy/Pillow encoder-decoder with skip fusion',
        'local_inference': True,
        'real_model': False,
        'requires_upload': True,
        'model': 'U-Net-style local encoder-decoder mechanism',
        'note': '后端真实计算编码器、瓶颈、解码器、跳跃连接和 mask；不冒充训练好的 U-Net 权重。',
    },
    'resnet': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'torchvision',
        'local_inference': True,
        'real_model': True,
        'requires_upload': False,
        'model': 'resnet50',
        'note': '加载 torchvision ResNet-50 ImageNet 权重，返回真实分类结果和 Grad-CAM 热力图。',
    },
    'vit': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'PyTorch + transformers',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'google/vit-base-patch16-224',
        'note': '加载 HuggingFace ViT 分类模型，返回真实分类概率、patch 切分和注意力图。',
    },
    'detr': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'PyTorch + transformers',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'facebook/detr-resnet-50',
        'note': '加载 HuggingFace DETR，返回真实目标检测框和 object query 注意力摘要。',
    },
    'clip': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'PyTorch + transformers',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'openai/clip-vit-base-patch32',
        'note': '加载 HuggingFace CLIP，返回真实图文相似度和零样本分类结果。',
    },
    'sam': {
        'status': '真实预训练模型',
        'category': 'pretrained_model',
        'backend': 'PyTorch + segment-anything',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'SAM ViT-B',
        'weights': 'models/sam_vit_b_01ec64.pth 或 SAM_CHECKPOINT',
        'note': '需要本地 SAM checkpoint；缺失时 API 返回 model_not_available 和下载/配置提示。',
    },
    'gan': {
        'status': '真实本地机制实现',
        'category': 'local_mechanism',
        'backend': 'NumPy tiny GAN training',
        'local_inference': True,
        'real_model': False,
        'requires_upload': False,
        'model': 'tiny GAN on synthetic 2D distribution',
        'note': '本地 NumPy 训练小型 GAN，展示真实对抗损失、判别器决策面和生成分布变化；不是预训练图像生成模型。',
    },
    'diffusion': {
        'status': '真实本地机制实现',
        'category': 'local_mechanism',
        'backend': 'NumPy DDPM equations',
        'local_inference': True,
        'real_model': False,
        'requires_upload': False,
        'model': 'DDPM forward/reverse equation trace',
        'note': '本地计算 DDPM 前向加噪、噪声日程、oracle 反向还原和误差图；不是 Stable Diffusion 预训练采样。',
    },
    'nerf': {
        'status': '真实本地机制实现',
        'category': 'local_mechanism',
        'backend': 'NumPy volume rendering',
        'local_inference': True,
        'real_model': False,
        'requires_upload': False,
        'model': 'Tiny NeRF-style ray marching',
        'note': '真实射线采样、密度/颜色查询和体渲染；展示 NeRF 机制，不是训练好的真实场景权重。',
    },
    'colorspace': {
        'status': 'local color-space algorithm',
        'category': 'local_algorithm',
        'backend': 'NumPy RGB/HSV/Lab/CMYK conversion',
        'local_inference': True,
        'real_model': False,
        'requires_upload': True,
        'model': 'deterministic color conversion',
        'note': '本地确定性色彩空间转换算法；返回 RGB、HSV、Lab、CMYK 的真实通道拆分与中间结果。',
    },
    'smoothing': {
        'status': '真实 NumPy 算法',
        'category': 'numpy_algorithm',
        'backend': 'NumPy smoothing comparison pipeline',
        'local_inference': True,
        'real_model': False,
        'requires_upload': True,
        'model': 'Gaussian + median + bilateral local filters',
        'note': '同一输入下运行高斯平滑、中值滤波和双边滤波，并返回真实中间结果。',
    },
    'lenet': {
        'status': '真实 NumPy 网络',
        'category': 'numpy_model',
        'backend': 'NumPy',
        'local_inference': True,
        'real_model': True,
        'requires_upload': True,
        'model': 'LeNet-5 + lenet_weights.json',
        'note': '保持现状：加载本地 LeNet 权重后运行真实前向传播。',
    },
    'conv_training': {
        'status': '真实 NumPy 算法',
        'category': 'numpy_algorithm',
        'backend': 'NumPy',
        'local_inference': True,
        'real_model': False,
        'requires_upload': False,
        'model': 'Kernel gradient descent training',
        'note': '保持现状：真实梯度下降训练卷积核。',
    },
}


def get_implementation_meta(module_id):
    """Return public implementation metadata for a module id."""
    meta = dict(DEFAULT_IMPLEMENTATION)
    if module_id in LOCAL_TEACHING_MODELS:
        meta.update(LOCAL_TEACHING_MODEL_META)
    if module_id in LOCAL_FRONTIER_ALGORITHMS:
        meta.update(LOCAL_FRONTIER_ALGORITHM_META)
    if module_id in REQUIRES_EXTERNAL_WEIGHTS:
        meta.update(EXTERNAL_WEIGHT_META)
    if module_id in OFFLINE_TEACHING:
        meta.update(OFFLINE_TEACHING_META)
    meta.update(IMPLEMENTATION_META.get(module_id, {}))

    if module_id == 'sam' and module_id not in REQUIRES_EXTERNAL_WEIGHTS:
        checkpoint = os.environ.get('SAM_CHECKPOINT', 'models/sam_vit_b_01ec64.pth')
        candidates = [
            checkpoint,
            'E:/SAM/sam_vit_b_01ec64.pth',
            'E:/Learning/2025/202520261/DIP/E4/sam_vit_b_01ec64.pth',
            'sam_vit_b_01ec64.pth',
        ]
        if not any(os.path.exists(p) for p in candidates):
            meta.update({
                'status': 'SAM checkpoint not configured',
                'category': 'model_not_available',
                'local_inference': False,
                'note': 'Set SAM_CHECKPOINT or place sam_vit_b_01ec64.pth under models/ before this module is counted as runnable.',
            })

    # Do not let optional remote runners overwrite the formal local/backend
    # truth table. They may still be used by future explicit remote features.
    if (
        module_id not in LOCAL_TEACHING_MODELS
        and module_id not in LOCAL_FRONTIER_ALGORITHMS
        and module_id not in REQUIRES_EXTERNAL_WEIGHTS
        and module_id not in {
            'detection', 'semantic', 'instance',
            'faster_rcnn', 'fcn', 'mask_rcnn',
            'vit', 'detr', 'clip', 'sam',
            'resnet', 'gan', 'diffusion', 'nerf',
        }
    ):
        try:
            from app.runners import get_remote_runner
            runner = get_remote_runner(module_id)
            if runner is not None:
                meta.update(runner.get_metadata())
        except Exception:
            pass

    return meta


def requires_upload(module_id):
    """Return whether the demo endpoint needs an uploaded image."""
    return bool(get_implementation_meta(module_id).get('requires_upload', True))
