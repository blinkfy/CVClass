from app.modules.base import AlgorithmModule
class Sobel梯度Module(AlgorithmModule):
    module_id='sobel';name='Sobel梯度';name_en='Sobel Gradient'
    phase='phase1_fundamentals';difficulty=1
    description='一阶导数算子,梯度幅值与方向。边缘检测基础。'
    dependencies=['gaussian']
    @staticmethod
    def get_page(): return 'sobel.html'
