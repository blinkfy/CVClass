from app.modules.base import AlgorithmModule
class 模板匹配Module(AlgorithmModule):
    module_id='template_match';name='模板匹配';name_en='Template Matching'
    phase='phase2_classical';difficulty=2
    description='互相关(CCORR)/归一化互相关(NCC)滑窗匹配。单目标+多目标。'
    dependencies=['convolution']
    @staticmethod
    def get_page(): return 'template_match.html'
