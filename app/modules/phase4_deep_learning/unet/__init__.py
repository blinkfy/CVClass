from app.modules.base import AlgorithmModule


class UNetModule(AlgorithmModule):
    module_id = 'unet'
    name = 'U-Net'
    name_en = 'U-Net'
    phase = 'phase4_deep_learning'
    difficulty = 4
    description = 'U-Net'

    @staticmethod
    def get_page():
        return 'unet.html'
