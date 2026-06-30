"""
轮廓查找模块。
在二值图像中追踪物体边界，建立轮廓层级树——哪个轮廓在哪个轮廓内部？这是形状分析和物体计数的第一步。
"""
from app.modules.base import AlgorithmModule


class ContourFindingModule(AlgorithmModule):
    module_id = 'contour'
    name = '轮廓查找'
    name_en = 'Contour Finding'
    phase = 'phase2_classical'
    difficulty = 2
    description = '在二值图像中追踪物体边界，建立轮廓层级树——哪个轮廓在哪个轮廓内部？这是形状分析和物体计数的第一步。'

    @staticmethod
    def get_page():
        return 'contour.html'
