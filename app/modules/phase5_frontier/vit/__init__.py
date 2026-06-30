"""
Vision Transformer模块。
将图像切成 16×16 的 Patch，像处理文字 Token 一样送入 Transformer。ViT 证明：纯注意力机制在大规模预训练后可以超越 CNN。
"""
from app.modules.base import AlgorithmModule


class VisionTransformerViTModule(AlgorithmModule):
    module_id = 'vit'
    name = 'Vision Transformer'
    name_en = 'Vision Transformer (ViT)'
    phase = 'phase5_frontier'
    difficulty = 5
    description = '将图像切成 16×16 的 Patch，像处理文字 Token 一样送入 Transformer。ViT 证明：纯注意力机制在大规模预训练后可以超越 CNN。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=vit'
