"""
立体匹配与深度模块。
从左右两个视角的图像中恢复每个像素的深度——模仿人眼的双目视差原理。视差图越大表示物体越近，越小表示物体越远。
"""
from app.modules.base import AlgorithmModule


class StereoMatchingModule(AlgorithmModule):
    module_id = 'stereo'
    name = '立体匹配与深度'
    name_en = 'Stereo Matching'
    phase = 'phase3_intermediate'
    difficulty = 3
    description = '从左右两个视角的图像中恢复每个像素的深度——模仿人眼的双目视差原理。视差图越大表示物体越近，越小表示物体越远。'

    @staticmethod
    def get_page():
        return 'stereo.html'
