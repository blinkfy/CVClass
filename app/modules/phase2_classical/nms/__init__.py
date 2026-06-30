from app.modules.base import AlgorithmModule
class 非极大值抑制Module(AlgorithmModule):
    module_id='nms';name='非极大值抑制';name_en='NMS'
    phase='phase2_classical';difficulty=2
    description='从Canny边缘细化到目标检测边界框去重的通用后处理技术。'
    dependencies=['edge']
    @staticmethod
    def get_page(): return 'nms.html'
