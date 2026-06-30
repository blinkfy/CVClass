"""
阈值化模块。
将灰度图按阈值切分为黑白二值——最简单的图像分割方法。全局阈值、自适应阈值和Otsu自动阈值各有适用场景。
"""
from app.modules.base import AlgorithmModule


class ThresholdingModule(AlgorithmModule):
    module_id = 'threshold'
    name = '阈值化'
    name_en = 'Thresholding'
    phase = 'phase1_fundamentals'
    difficulty = 1
    description = '将灰度图按阈值切分为黑白二值——最简单的图像分割方法。全局阈值、自适应阈值和Otsu自动阈值各有适用场景。'

    @staticmethod
    def get_page():
        return 'threshold.html'
