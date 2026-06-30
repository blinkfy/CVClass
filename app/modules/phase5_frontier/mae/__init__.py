from app.modules.base import AlgorithmModule


class MAEModule(AlgorithmModule):
    module_id = 'mae'
    name = 'MAE'
    name_en = 'MAE'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'MAE'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=mae'
