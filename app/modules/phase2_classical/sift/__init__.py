"""
SIFT 特征检测模块。
尺度空间构建 → DoG → 极值检测 → 方向分配 → 描述子生成，全流程手写实现。
"""
from app.modules.base import AlgorithmModule


class SIFTModule(AlgorithmModule):
    module_id = 'sift'
    name = 'SIFT 特征检测'
    name_en = 'SIFT Feature Detection'
    phase = 'phase2_classical'
    difficulty = 3
    required = True
    description = '尺度不变特征变换：无论旋转、缩放、光照变化，都能找到稳定的关键点。'

    @staticmethod
    def get_page():
        return 'sift.html'
