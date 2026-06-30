"""
NeRF 神经辐射场模块。
用一个小 MLP 从几十张照片中学习整个 3D 场景——输入 5D 坐标 (x,y,z,θ,φ)，输出该点的颜色和密度。体渲染积分生成任意新视角的照片。
"""
from app.modules.base import AlgorithmModule


class NeRFModule(AlgorithmModule):
    module_id = 'nerf'
    name = 'NeRF 神经辐射场'
    name_en = 'NeRF'
    phase = 'phase5_frontier'
    difficulty = 5
    description = '用一个小 MLP 从几十张照片中学习整个 3D 场景——输入 5D 坐标 (x,y,z,θ,φ)，输出该点的颜色和密度。体渲染积分生成任意新视角的照片。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=nerf'
