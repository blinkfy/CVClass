"""
CLIP 多模态模型模块。
用 4 亿图文对训练的对比学习模型——给它任意图像和任意文字描述，它能判断是否匹配。CLIP 实现了真正的「零样本」视觉识别。
"""
from app.modules.base import AlgorithmModule


class CLIPModule(AlgorithmModule):
    module_id = 'clip'
    name = 'CLIP 多模态模型'
    name_en = 'CLIP'
    phase = 'phase5_frontier'
    difficulty = 5
    description = '用 4 亿图文对训练的对比学习模型——给它任意图像和任意文字描述，它能判断是否匹配。CLIP 实现了真正的「零样本」视觉识别。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=clip'
