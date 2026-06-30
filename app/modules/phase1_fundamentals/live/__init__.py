"""
实时滤镜模块。
调用本地摄像头，实时应用卷积滤镜，零延迟体验卷积效果。
"""
from app.modules.base import AlgorithmModule


class LiveModule(AlgorithmModule):
    module_id = 'live'
    name = '实时摄像头滤镜'
    name_en = 'Live Camera Filters'
    phase = 'phase1_fundamentals'
    difficulty = 2
    required = True
    description = '打开摄像头，实时查看不同卷积核对画面的影响——模糊、锐化、边缘增强。'

    @staticmethod
    def get_page():
        return 'conv_live.html'
