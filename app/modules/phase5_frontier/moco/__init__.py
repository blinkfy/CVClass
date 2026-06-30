from app.modules.base import AlgorithmModule


class MoCoModule(AlgorithmModule):
    module_id = 'moco'
    name = 'MoCo'
    name_en = 'MoCo'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'MoCo'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=moco'
