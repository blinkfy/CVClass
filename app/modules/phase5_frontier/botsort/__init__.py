from app.modules.base import AlgorithmModule


class BoTSORTModule(AlgorithmModule):
    module_id = 'botsort'
    name = 'BoT-SORT'
    name_en = 'BoT-SORT'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'BoT-SORT'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=botsort'
