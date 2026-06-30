from app.modules.base import AlgorithmModule
class 噪声模型Module(AlgorithmModule):
    module_id='noise';name='噪声模型';name_en='Noise Models'
    phase='phase1_fundamentals';difficulty=1
    description='椒盐噪声、高斯噪声的生成与特性。理解为什么要滤波的前提。'
    dependencies=[]
    @staticmethod
    def get_page(): return 'noise.html'
