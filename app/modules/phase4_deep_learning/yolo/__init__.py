from app.modules.base import AlgorithmModule


class YOLOModule(AlgorithmModule):
    module_id = 'yolo'
    name = 'YOLO'
    name_en = 'YOLO'
    phase = 'phase4_deep_learning'
    difficulty = 4
    description = 'YOLO'

    @staticmethod
    def get_page():
        return 'yolo.html'
