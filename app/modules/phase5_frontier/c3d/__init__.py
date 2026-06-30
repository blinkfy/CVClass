from app.modules.base import AlgorithmModule


class C3DModule(AlgorithmModule):
    module_id = 'c3d'
    name = 'C3D'
    name_en = 'C3D'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'C3D'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=c3d'
