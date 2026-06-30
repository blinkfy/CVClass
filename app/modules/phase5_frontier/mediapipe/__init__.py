from app.modules.base import AlgorithmModule


class MediaPipePoseModule(AlgorithmModule):
    module_id = 'mediapipe'
    name = 'MediaPipe Pose'
    name_en = 'MediaPipe Pose'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'MediaPipe Pose'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=mediapipe'
