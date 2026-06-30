from app.modules.base import AlgorithmModule


class ByteTrackModule(AlgorithmModule):
    module_id = 'bytetrack'
    name = 'ByteTrack'
    name_en = 'ByteTrack'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'ByteTrack'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=bytetrack'
