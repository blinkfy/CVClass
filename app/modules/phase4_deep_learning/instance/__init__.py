"""
实例分割模块 [新增]。
Mask R-CNN 风格的两阶段流程可视化：
目标检测 → ROI Align → 掩码预测，区分同一类别的不同个体。
"""
from app.modules.base import AlgorithmModule


class InstanceModule(AlgorithmModule):
    module_id = 'instance'
    name = '实例分割'
    name_en = 'Instance Segmentation'
    phase = 'phase4_deep_learning'
    difficulty = 4
    required = True
    description = '不仅知道每个像素是什么，还能区分出"第一个行人"和"第二个行人"。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=instance'
