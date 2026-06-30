from app.modules.base import AlgorithmModule


class Mask2FormerModule(AlgorithmModule):
    module_id = 'mask2former'
    name = 'Mask2Former'
    name_en = 'Mask2Former'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'Mask2Former'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=mask2former'
