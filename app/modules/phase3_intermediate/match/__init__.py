"""
特征匹配模块。
暴力匹配、比率测试、单应性验证 —— 将两张图的 SIFT 特征点对应起来。
"""
from app.modules.base import AlgorithmModule


class MatchModule(AlgorithmModule):
    module_id = 'match'
    name = '特征匹配'
    name_en = 'Feature Matching'
    phase = 'phase3_intermediate'
    difficulty = 2
    required = True
    description = '找到两幅图像中同一个物体的对应点——图像拼接、目标识别的基石。'

    @staticmethod
    def get_page():
        return 'match.html'
