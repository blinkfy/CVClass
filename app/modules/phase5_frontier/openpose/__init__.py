from app.modules.base import AlgorithmModule


class OpenPoseModule(AlgorithmModule):
    module_id = 'openpose'
    name = 'OpenPose'
    name_en = 'OpenPose'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'OpenPose'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=openpose'
