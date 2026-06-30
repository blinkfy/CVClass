from app.modules.base import AlgorithmModule


class CNNBasicsModule(AlgorithmModule):
    module_id = 'cnn_basics'
    name = 'CNN基础'
    name_en = 'CNN Basics'
    phase = 'phase4_deep_learning'
    difficulty = 3
    description = 'Conv→ReLU→Pool→FC。三个子实验：卷积可视化、LeNet实时推理、训练与反向传播。'
    dependencies = ['convolution']

    @staticmethod
    def get_page():
        return 'cnn_basics_hub.html'
