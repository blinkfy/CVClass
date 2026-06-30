"""
目标检测模块 [新增]。
YOLO 风格的单阶段检测流程可视化：
Anchor 生成 → 特征提取 → 边界框回归 → NMS → 最终检测结果。
"""
from app.modules.base import AlgorithmModule


class DetectionModule(AlgorithmModule):
    module_id = 'detection'
    name = '目标检测'
    name_en = 'Object Detection'
    phase = 'phase4_deep_learning'
    difficulty = 3
    required = True
    description = '框出图像中所有感兴趣的物体——同时回答"是什么"和"在哪里"。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=detection'
