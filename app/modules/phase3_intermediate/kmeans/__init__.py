from app.modules.base import AlgorithmModule
class KMeans分割Module(AlgorithmModule):
    module_id='kmeans';name='K-Means分割';name_en='K-Means Segmentation'
    phase='phase3_intermediate';difficulty=3
    description='RGB像素聚类,最简单的无监督分割入口。K值选择+颜色映射。'
    dependencies=[]
    @staticmethod
    def get_page(): return 'kmeans.html'
