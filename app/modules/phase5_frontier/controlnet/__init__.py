from app.modules.base import AlgorithmModule


class ControlNetModule(AlgorithmModule):
    module_id = 'controlnet'
    name = 'ControlNet'
    name_en = 'ControlNet'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'ControlNet'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=controlnet'
