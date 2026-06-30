from app.modules.base import AlgorithmModule


class BoVWSPMModule(AlgorithmModule):
    module_id = 'bovw_spm'
    name = 'BoVW+SPM'
    name_en = 'BoVW + SPM'
    phase = 'phase3_intermediate'
    difficulty = 4
    description = 'SIFT→K-Means视觉词汇→空间金字塔→Chi2SVM。传统图像分类的标准流水线。'
    dependencies = ['sift', 'match', 'kmeans']

    @staticmethod
    def get_page():
        return 'teaching.html?id=bovw_spm'
