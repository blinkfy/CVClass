"""
Hough 变换模块。
在参数空间中投票找形状——直线检测和圆形检测的核心算法。即使边缘有断裂或噪声，也能鲁棒地检测出完整的几何形状。
"""
from app.modules.base import AlgorithmModule


class HoughTransformModule(AlgorithmModule):
    module_id = 'hough'
    name = 'Hough 变换'
    name_en = 'Hough Transform'
    phase = 'phase2_classical'
    difficulty = 2
    description = '在参数空间中投票找形状——直线检测和圆形检测的核心算法。即使边缘有断裂或噪声，也能鲁棒地检测出完整的几何形状。'

    @staticmethod
    def get_page():
        return 'hough.html'
