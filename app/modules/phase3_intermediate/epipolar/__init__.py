from app.modules.base import AlgorithmModule


class EpipolarGeometryModule(AlgorithmModule):
    module_id = 'epipolar'
    name = '对极几何'
    name_en = 'Epipolar Geometry'
    phase = 'phase3_intermediate'
    difficulty = 4
    description = 'F/E矩阵→8点法→SVD恢复R,t。从两视图匹配点对恢复相机相对运动。'
    dependencies = ['match', 'sift']

    @staticmethod
    def get_page():
        return 'teaching.html?id=epipolar'
