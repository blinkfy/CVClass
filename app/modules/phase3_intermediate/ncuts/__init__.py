from app.modules.base import AlgorithmModule


class NormalizedCutsModule(AlgorithmModule):
    module_id = 'ncuts'
    name = 'Normalized Cuts'
    name_en = 'Normalized Cuts'
    phase = 'phase3_intermediate'
    difficulty = 5
    description = '谱聚类:拉普拉斯矩阵→Fiedler向量→递归二分。基于图割的全局分割方法。'
    dependencies = []

    @staticmethod
    def get_page():
        return 'teaching.html?id=ncuts'
