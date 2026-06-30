from app.modules.base import AlgorithmModule


class DeepPoseModule(AlgorithmModule):
    module_id = 'deeppose'
    name = 'DeepPose'
    name_en = 'DeepPose'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'DeepPose'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=deeppose'
