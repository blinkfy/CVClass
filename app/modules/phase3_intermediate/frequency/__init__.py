"""
频域分析模块。
卷积核与特征图的傅里叶频谱可视化，展示空域与频域的对应关系。
"""
from app.modules.base import AlgorithmModule


class FrequencyModule(AlgorithmModule):
    module_id = 'frequency'
    name = '频域分析'
    name_en = 'Frequency Domain Analysis'
    phase = 'phase3_intermediate'
    difficulty = 3
    required = True
    description = '傅里叶变换揭示图像的频率成分：低频对应平滑区域，高频对应边缘和噪声。'

    @staticmethod
    def get_page():
        return 'conv_frequency.html'
