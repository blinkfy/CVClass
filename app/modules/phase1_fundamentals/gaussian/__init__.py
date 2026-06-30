from app.modules.base import AlgorithmModule


class GaussianModule(AlgorithmModule):
    module_id = 'gaussian'
    name = '高斯平滑'
    name_en = 'Gaussian Smoothing'
    phase = 'phase1_fundamentals'
    difficulty = 1
    description = '平滑与去噪专题中的线性加权平均滤波，适合连续高斯噪声和快速预处理。'
    dependencies = ['smoothing', 'convolution']

    @staticmethod
    def get_page():
        return 'smoothing.html'
