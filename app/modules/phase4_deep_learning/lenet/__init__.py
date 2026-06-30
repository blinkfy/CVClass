"""
LeNet 模块。
包含 LeNet-5 前向推理可视化和训练过程观察两个子模块。
"""
from app.modules.base import AlgorithmModule


class LeNetModule(AlgorithmModule):
    module_id = 'lenet'
    name = 'LeNet 手写数字识别'
    name_en = 'LeNet Digit Recognition'
    phase = 'phase4_deep_learning'
    difficulty = 3
    required = True
    description = '经典 CNN 的前向推理与训练过程全可视化：卷积层特征图、反向传播梯度流。'

    @staticmethod
    def get_page():
        return 'conv_lenet.html'
