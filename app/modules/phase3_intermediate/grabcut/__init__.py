"""
GrabCut 前景提取模块。
用户画一个矩形框住目标物体，算法用高斯混合模型 (GMM) 迭代优化，自动分离前景和背景——交互式抠图的经典方法。
"""
from app.modules.base import AlgorithmModule


class GrabCutModule(AlgorithmModule):
    module_id = 'grabcut'
    name = 'GrabCut 前景提取'
    name_en = 'GrabCut'
    phase = 'phase3_intermediate'
    difficulty = 3
    description = '用户画一个矩形框住目标物体，算法用高斯混合模型 (GMM) 迭代优化，自动分离前景和背景——交互式抠图的经典方法。'

    @staticmethod
    def get_page():
        return 'grabcut.html'
