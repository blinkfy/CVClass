from app.modules.base import AlgorithmModule


class SmoothingModule(AlgorithmModule):
    module_id = 'smoothing'
    name = '平滑与去噪'
    name_en = 'Smoothing and Denoising'
    phase = 'phase1_fundamentals'
    difficulty = 1
    description = '统一对比高斯平滑、中值滤波和双边滤波，解释它们适合的噪声场景和中间计算过程。'
    dependencies = ['noise', 'convolution']

    @staticmethod
    def get_page():
        return 'smoothing.html'
