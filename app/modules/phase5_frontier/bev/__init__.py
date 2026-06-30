from app.modules.base import AlgorithmModule


class BEVPerceptionModule(AlgorithmModule):
    module_id = 'bev'
    name = 'BEV Perception'
    name_en = 'BEV Perception'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'BEV Perception'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=bev'
