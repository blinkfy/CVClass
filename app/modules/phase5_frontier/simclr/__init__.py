from app.modules.base import AlgorithmModule


class SimCLRModule(AlgorithmModule):
    module_id = 'simclr'
    name = 'SimCLR'
    name_en = 'SimCLR'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'SimCLR'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=simclr'
