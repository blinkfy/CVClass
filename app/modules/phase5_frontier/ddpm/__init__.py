from app.modules.base import AlgorithmModule


class DDPMModule(AlgorithmModule):
    module_id = 'ddpm'
    name = 'DDPM'
    name_en = 'DDPM'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'DDPM'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=ddpm'
