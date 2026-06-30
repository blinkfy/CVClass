from app.modules.base import AlgorithmModule


class CameraCalibrationModule(AlgorithmModule):
    module_id = 'calibration'
    name = '相机标定'
    name_en = 'Camera Calibration'
    phase = 'phase3_intermediate'
    difficulty = 5
    description = '针孔→K[R|t]→畸变→DLT→Cholesky。Zhang 标定法估计相机内参和外参。'
    dependencies = ['corner']

    @staticmethod
    def get_page():
        return 'teaching.html?id=calibration'
