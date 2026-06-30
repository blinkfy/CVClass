"""
形态学操作模块。
用「结构元素」在二值图像上做集合运算——腐蚀让白色区域缩水、膨胀让白色区域扩张。开运算去除小噪点，闭运算填补小孔洞。
"""
from app.modules.base import AlgorithmModule


class MorphologicalOperationsModule(AlgorithmModule):
    module_id = 'morphology'
    name = '形态学操作'
    name_en = 'Morphological Operations'
    phase = 'phase2_classical'
    difficulty = 2
    description = '用「结构元素」在二值图像上做集合运算——腐蚀让白色区域缩水、膨胀让白色区域扩张。开运算去除小噪点，闭运算填补小孔洞。'

    @staticmethod
    def get_page():
        return 'morphology.html'
