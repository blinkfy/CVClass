"""
HOG + SVM 目标检测模块。
深度学习之前的目标检测标准方案：先计算梯度方向直方图 (HOG) 作为特征，再用支持向量机 (SVM) 做分类——理解它才能理解为什么深度学习检测器更好。
"""
from app.modules.base import AlgorithmModule


class HOGSVMModule(AlgorithmModule):
    module_id = 'hog_svm'
    name = 'HOG + SVM 目标检测'
    name_en = 'HOG + SVM Detection'
    phase = 'phase3_intermediate'
    difficulty = 3
    description = '深度学习之前的目标检测标准方案：先计算梯度方向直方图 (HOG) 作为特征，再用支持向量机 (SVM) 做分类——理解它才能理解为什么深度学习检测器更好。'

    @staticmethod
    def get_page():
        return 'hog_svm.html'
