from app.modules.base import AlgorithmModule


class DUSt3RModule(AlgorithmModule):
    module_id = 'dust3r'
    name = 'DUSt3R'
    name_en = 'DUSt3R'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'DUSt3R'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=dust3r'
