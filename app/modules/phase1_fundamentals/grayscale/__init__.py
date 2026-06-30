"""
灰度转换模块。
演示 RGB → 灰度的多种加权方案（平均值法、加权平均法、最大值法等）。
"""
from app.modules.base import AlgorithmModule


class GrayscaleModule(AlgorithmModule):
    module_id = 'grayscale'
    name = '灰度转换'
    name_en = 'Grayscale Conversion'
    phase = 'phase1_fundamentals'
    difficulty = 1
    required = True
    description = '将彩色图像转换为灰度图，理解不同加权方案对人眼感知的影响。'

    @staticmethod
    def get_page():
        return 'grayscale.html'
