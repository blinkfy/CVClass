from app.modules.base import AlgorithmModule


class MedianModule(AlgorithmModule):
    module_id = 'median'
    name = '中值滤波'
    name_en = 'Median Filter'
    phase = 'phase1_fundamentals'
    difficulty = 1
    description = '平滑与去噪专题中的非线性排序滤波，适合椒盐噪声和孤立坏点。'
    dependencies = ['smoothing', 'noise']

    @staticmethod
    def get_page():
        return 'smoothing.html'
