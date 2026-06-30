from app.modules.base import AlgorithmModule


class SAM2Module(AlgorithmModule):
    module_id = 'sam2'
    name = 'SAM 2'
    name_en = 'SAM 2'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'SAM 2'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=sam2'
