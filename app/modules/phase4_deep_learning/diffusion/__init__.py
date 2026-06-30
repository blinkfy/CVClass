"""
扩散模型模块。
先给图像逐步加噪声直到变成纯噪声，再学习逆向去噪——这就是扩散模型的核心思想。每一步去噪都可以可视化，天然适合教学展示。
"""
from app.modules.base import AlgorithmModule


class DiffusionModelModule(AlgorithmModule):
    module_id = 'diffusion'
    name = '扩散模型'
    name_en = 'Diffusion Model'
    phase = 'phase4_deep_learning'
    difficulty = 4
    description = '先给图像逐步加噪声直到变成纯噪声，再学习逆向去噪——这就是扩散模型的核心思想。每一步去噪都可以可视化，天然适合教学展示。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=diffusion'
