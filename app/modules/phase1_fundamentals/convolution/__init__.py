"""
基础卷积模块。
自定义卷积核的 3D 可视化，卷积核在图像上滑动的动画展示。
"""
from app.modules.base import AlgorithmModule


class ConvolutionModule(AlgorithmModule):
    module_id = 'convolution'
    name = '基础卷积'
    name_en = 'Convolution Basics'
    phase = 'phase1_fundamentals'
    difficulty = 1
    required = True
    description = '滑动窗口的直观理解，卷积核如何提取边缘、模糊、锐化等特征。'

    @staticmethod
    def get_page():
        return 'conv_basic.html'
