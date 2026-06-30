from app.modules.base import AlgorithmModule


class IJEPAModule(AlgorithmModule):
    module_id = 'ijepa'
    name = 'I-JEPA'
    name_en = 'I-JEPA'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'I-JEPA'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=ijepa'
