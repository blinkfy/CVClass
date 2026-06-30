from app.modules.base import AlgorithmModule


class GroundingDINOModule(AlgorithmModule):
    module_id = 'grdino'
    name = 'Grounding DINO'
    name_en = 'Grounding DINO'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'Grounding DINO'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=grdino'
