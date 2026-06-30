"""
LeNet-5 训练过程观察模块。
实时观察训练过程中的参数变化、损失曲线下降、各层权重分布的演化。
"""
from app.modules.base import AlgorithmModule


class ConvTrainingModule(AlgorithmModule):
    module_id = 'conv_training'
    name = '训练观察'
    name_en = 'Training Observation'
    phase = 'phase4_deep_learning'
    difficulty = 4
    description = '实时观察 LeNet-5 训练过程中的参数变化与损失曲线：权重分布如何从随机初始化逐步收敛到有意义的滤波器。'
    required = True

    @staticmethod
    def get_page():
        return 'conv_training.html'
