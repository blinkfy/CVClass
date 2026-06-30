from app.modules.base import AlgorithmModule


class BilateralModule(AlgorithmModule):
    module_id = 'bilateral'
    name = '双边滤波'
    name_en = 'Bilateral Filter'
    phase = 'phase1_fundamentals'
    difficulty = 1
    description = '平滑与去噪专题中的保边滤波，同时考虑空间距离和颜色相似度。'
    dependencies = ['smoothing', 'gaussian']

    @staticmethod
    def get_page():
        return 'smoothing.html'
