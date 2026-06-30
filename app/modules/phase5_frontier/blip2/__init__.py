from app.modules.base import AlgorithmModule


class BLIP2Module(AlgorithmModule):
    module_id = 'blip2'
    name = 'BLIP-2'
    name_en = 'BLIP-2'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'BLIP-2'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=blip2'
