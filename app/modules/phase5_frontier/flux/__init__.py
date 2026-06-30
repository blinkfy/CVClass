from app.modules.base import AlgorithmModule


class FluxModule(AlgorithmModule):
    module_id = 'flux'
    name = 'Flux'
    name_en = 'Flux'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'Flux'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=flux'
