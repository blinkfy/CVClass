"""
光流模块。
估计图像中每个像素的运动速度和方向——稠密光流展现了场景中的所有运动信息，是视频理解、目标跟踪和运动分割的基础。
"""
from app.modules.base import AlgorithmModule


class OpticalFlowModule(AlgorithmModule):
    module_id = 'optical_flow'
    name = '光流'
    name_en = 'Optical Flow'
    phase = 'phase3_intermediate'
    difficulty = 3
    description = '估计图像中每个像素的运动速度和方向——稠密光流展现了场景中的所有运动信息，是视频理解、目标跟踪和运动分割的基础。'

    @staticmethod
    def get_page():
        return 'optical_flow.html'
