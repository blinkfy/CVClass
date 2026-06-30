from app.modules.base import AlgorithmModule


class DiTModule(AlgorithmModule):
    module_id = 'dit'
    name = 'DiT'
    name_en = 'DiT'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'DiT'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=dit'
