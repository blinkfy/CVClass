from app.modules.base import AlgorithmModule


class ViTPoseModule(AlgorithmModule):
    module_id = 'vitpose'
    name = 'ViTPose'
    name_en = 'ViTPose'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'ViTPose'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=vitpose'
