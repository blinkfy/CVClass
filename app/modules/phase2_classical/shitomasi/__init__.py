from app.modules.base import AlgorithmModule


class ShiTomasiCornerModule(AlgorithmModule):
    module_id = 'shitomasi'
    name = 'Shi-Tomasi角点'
    name_en = 'Shi-Tomasi Corner'
    phase = 'phase2_classical'
    difficulty = 3
    description = 'R=min(λ₁,λ₂),光流追踪首选角点检测器。相比Harris只保留两个方向都强的角点。'
    dependencies = ['corner']

    @staticmethod
    def get_page():
        return 'teaching.html?id=shitomasi'
