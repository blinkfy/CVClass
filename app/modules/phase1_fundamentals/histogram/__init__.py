"""
直方图模块。
统计图像中每个亮度值的像素数量——直方图是理解图像曝光、对比度和动态范围的基础工具。
"""
from app.modules.base import AlgorithmModule


class HistogramModule(AlgorithmModule):
    module_id = 'histogram'
    name = '直方图'
    name_en = 'Histogram'
    phase = 'phase1_fundamentals'
    difficulty = 1
    description = '统计图像中每个亮度值的像素数量——直方图是理解图像曝光、对比度和动态范围的基础工具。'

    @staticmethod
    def get_page():
        return 'histogram.html'
