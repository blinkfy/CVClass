from app.modules.base import AlgorithmModule


class SwinTransformerModule(AlgorithmModule):
    module_id = 'swin'
    name = 'Swin Transformer'
    name_en = 'Swin Transformer'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'Swin Transformer'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=swin'
