"""
Harris 角点检测模块。
手工实现 Harris 角点检测：梯度计算 → 结构张量 → 角点响应 → 非极大值抑制。
"""
from app.modules.base import AlgorithmModule


class CornerModule(AlgorithmModule):
    module_id = 'corner'
    name = 'Harris 角点检测'
    name_en = 'Harris Corner Detection'
    phase = 'phase2_classical'
    difficulty = 2
    required = True
    description = '检测图像中的角点——那些在各个方向上亮度变化都很大的像素。'

    @staticmethod
    def get_page():
        return 'corner.html'
