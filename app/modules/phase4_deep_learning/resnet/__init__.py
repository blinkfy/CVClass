from app.modules.base import AlgorithmModule


class ResNetGradCAMModule(AlgorithmModule):
    module_id = 'resnet'
    name = 'ResNet+Grad-CAM'
    name_en = 'ResNet + Grad-CAM'
    phase = 'phase4_deep_learning'
    difficulty = 4
    description = 'ResNet + Grad-CAM'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=resnet'
