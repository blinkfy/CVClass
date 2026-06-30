from app.modules.base import AlgorithmModule


class DINODINOv2Module(AlgorithmModule):
    module_id = 'dino'
    name = 'DINO/DINOv2'
    name_en = 'DINO/DINOv2'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'DINO/DINOv2'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=dino'
