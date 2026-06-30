"""
DETR 目标检测模块。
去掉了 Anchor、NMS、Region Proposal——DETR 用 Transformer 的 Object Query 直接「问」出图像中的物体。彻底简化了检测流水线。
"""
from app.modules.base import AlgorithmModule


class DETRModule(AlgorithmModule):
    module_id = 'detr'
    name = 'DETR 目标检测'
    name_en = 'DETR'
    phase = 'phase5_frontier'
    difficulty = 5
    description = '去掉了 Anchor、NMS、Region Proposal——DETR 用 Transformer 的 Object Query 直接「问」出图像中的物体。彻底简化了检测流水线。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=detr'
