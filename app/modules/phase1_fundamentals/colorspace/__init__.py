"""Color space conversion module."""
from app.modules.base import AlgorithmModule


class ColorSpaceModule(AlgorithmModule):
    module_id = 'colorspace'
    name = '色彩空间'
    name_en = 'Color Spaces'
    phase = 'phase1_fundamentals'
    difficulty = 1
    required = True
    description = '展示 RGB、HSV、Lab、CMYK 四种色彩模式的维度含义、应用场景和通道拆分结果。'
    dependencies = []

    @staticmethod
    def get_page():
        return 'colorspace.html'
