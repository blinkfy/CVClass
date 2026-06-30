from app.modules.base import AlgorithmModule


class BYOLModule(AlgorithmModule):
    module_id = 'byol'
    name = 'BYOL'
    name_en = 'BYOL'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'BYOL'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=byol'
