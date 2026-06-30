"""
GAN 生成对抗网络模块。
生成器和判别器互相博弈——生成器学习伪造逼真图像，判别器学习识破伪造。这个对抗过程最终让生成器能创造出以假乱真的图像。
"""
from app.modules.base import AlgorithmModule


class GANModule(AlgorithmModule):
    module_id = 'gan'
    name = 'GAN 生成对抗网络'
    name_en = 'GAN'
    phase = 'phase4_deep_learning'
    difficulty = 4
    description = '生成器和判别器互相博弈——生成器学习伪造逼真图像，判别器学习识破伪造。这个对抗过程最终让生成器能创造出以假乱真的图像。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=gan'
