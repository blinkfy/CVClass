"""
SLIC 超像素模块。
将图像分割成紧凑、均匀的「超级像素」块——每个超像素内的像素颜色和位置都相近。大幅降低后续处理的复杂度，是很多高级算法的预处理步骤。
"""
from app.modules.base import AlgorithmModule


class SLICSuperpixelsModule(AlgorithmModule):
    module_id = 'slic'
    name = 'SLIC 超像素'
    name_en = 'SLIC Superpixels'
    phase = 'phase3_intermediate'
    difficulty = 3
    description = '将图像分割成紧凑、均匀的「超级像素」块——每个超像素内的像素颜色和位置都相近。大幅降低后续处理的复杂度，是很多高级算法的预处理步骤。'

    @staticmethod
    def get_page():
        return 'slic.html'
