from app.modules.base import AlgorithmModule


class OccupancyNetworksModule(AlgorithmModule):
    module_id = 'occupy'
    name = 'Occupancy Networks'
    name_en = 'Occupancy Networks'
    phase = 'phase5_frontier'
    difficulty = 5
    description = 'Occupancy Networks'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=occupy'
