"""
语义分割模块 [新增]。
U-Net 风格的编码器-解码器架构可视化：
下采样 → 特征提取 → 跳跃连接 → 上采样 → 逐像素分类。
"""
from app.modules.base import AlgorithmModule


class SemanticModule(AlgorithmModule):
    module_id = 'semantic'
    name = '语义分割'
    name_en = 'Semantic Segmentation'
    phase = 'phase4_deep_learning'
    difficulty = 3
    required = True
    description = '给图像中每个像素分配一个类别标签——知道天空在哪、道路在哪、行人又在哪。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=semantic'
