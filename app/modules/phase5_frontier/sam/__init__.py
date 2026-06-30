"""
SAM 分割一切模块。
Meta 的分割基础模型——给它一个点、一个框或一段文字，它能分割出对应的物体。SAM 展示了「提示工程」在视觉领域的巨大潜力。
"""
from app.modules.base import AlgorithmModule


class SegmentAnythingSAMModule(AlgorithmModule):
    module_id = 'sam'
    name = 'SAM 分割一切'
    name_en = 'Segment Anything (SAM)'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'Meta 的分割基础模型——给它一个点、一个框或一段文字，它能分割出对应的物体。SAM 展示了「提示工程」在视觉领域的巨大潜力。'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=sam'
