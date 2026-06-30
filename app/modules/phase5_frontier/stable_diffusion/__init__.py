"""
Stable Diffusion模块。
在压缩的潜空间中做扩散——比像素空间快一个数量级。文本通过 Cross-Attention 控制图像生成过程，催生了整个 AI 图像生成生态。
"""
from app.modules.base import AlgorithmModule


class StableDiffusionModule(AlgorithmModule):
    module_id = 'stable_diffusion'
    name = 'Stable Diffusion'
    name_en = 'Stable Diffusion'
    phase = 'phase5_frontier'
    difficulty = 5
    description = '在压缩的潜空间中做扩散——比像素空间快一个数量级。文本通过 Cross-Attention 控制图像生成过程，催生了整个 AI 图像生成生态。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=stable_diffusion'
