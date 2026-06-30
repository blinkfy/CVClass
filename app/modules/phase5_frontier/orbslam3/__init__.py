from app.modules.base import AlgorithmModule


class ORBSLAM3Module(AlgorithmModule):
    module_id = 'orbslam3'
    name = 'ORB-SLAM3'
    name_en = 'ORB-SLAM3'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'ORB-SLAM3'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=orbslam3'
