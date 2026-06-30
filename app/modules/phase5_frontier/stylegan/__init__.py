from app.modules.base import AlgorithmModule


class StyleGANModule(AlgorithmModule):
    module_id = 'stylegan'
    name = 'StyleGAN'
    name_en = 'StyleGAN'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'StyleGAN'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=stylegan'
