from app.modules.base import AlgorithmModule


class SfMModule(AlgorithmModule):
    module_id = 'sfm'
    name = '三角测量与SfM'
    name_en = 'Triangulation & SfM'
    phase = 'phase3_intermediate'
    difficulty = 5
    description = 'P₀,P₁→SVD线性三角化→稀疏3D点云。从两视图恢复三维结构。'
    dependencies = ['epipolar', 'match', 'sift']

    @staticmethod
    def get_page():
        return 'teaching.html?id=sfm'
