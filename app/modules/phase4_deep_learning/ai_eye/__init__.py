"""AI Eye: unified pretrained detection and segmentation studio."""
from app.modules.base import AlgorithmModule


class AiEyeModule(AlgorithmModule):
    module_id = 'ai_eye'
    name = 'AI之眼'
    name_en = 'AI Eye'
    phase = 'phase4_deep_learning'
    difficulty = 4
    required = True
    description = '同一张图的目标检测、语义分割和实例分割统一预训练模型体验。'
    dependencies = ['detection', 'semantic', 'instance']

    @staticmethod
    def get_page():
        return 'detection_segmentation.html'
