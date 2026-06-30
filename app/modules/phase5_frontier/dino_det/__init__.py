from app.modules.base import AlgorithmModule


class DINO检测Module(AlgorithmModule):
    module_id = 'dino_det'
    name = 'DINO检测'
    name_en = 'DINO Detection'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'DINO Detection'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=dino_det'
