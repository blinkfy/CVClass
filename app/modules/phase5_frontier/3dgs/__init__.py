from app.modules.base import AlgorithmModule


class GaussianSplatting3DModule(AlgorithmModule):
    module_id = '3dgs'
    name = '3D Gaussian Splatting'
    name_en = '3D Gaussian Splat.'
    phase = 'phase5_frontier'
    difficulty = 5
    description = '3D Gaussian Splat.'

    @staticmethod
    def get_page():
        return 'nn_interactive.html?id=3dgs'
