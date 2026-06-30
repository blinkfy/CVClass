from app.modules.base import AlgorithmModule


class PointNetModule(AlgorithmModule):
    module_id = 'pointnet'
    name = 'PointNet'
    name_en = 'PointNet'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'PointNet'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=pointnet'
