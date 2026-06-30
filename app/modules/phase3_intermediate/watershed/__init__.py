"""
分水岭分割模块。
把梯度幅值图看作地形——「注水」后不同集水盆地对应不同物体。经典的分割算法，擅长分离粘连物体。
"""
from app.modules.base import AlgorithmModule


class WatershedSegmentationModule(AlgorithmModule):
    module_id = 'watershed'
    name = '分水岭分割'
    name_en = 'Watershed Segmentation'
    phase = 'phase3_intermediate'
    difficulty = 3
    description = '把梯度幅值图看作地形——「注水」后不同集水盆地对应不同物体。经典的分割算法，擅长分离粘连物体。'

    @staticmethod
    def get_page():
        return 'watershed.html'
