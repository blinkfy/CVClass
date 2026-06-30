"""
边缘检测模块。
手工实现 Sobel 和 Canny 算法，展示每一步中间结果。
"""
from app.modules.base import AlgorithmModule


class EdgeModule(AlgorithmModule):
    module_id = 'edge'
    name = '边缘检测'
    name_en = 'Edge Detection'
    phase = 'phase2_classical'
    difficulty = 2
    required = True
    description = 'Sobel 梯度算子与 Canny 多阶段流水线，每一步都可视化。'

    @staticmethod
    def get_page():
        return 'edge.html'
