# AI之眼模型、权重与训练说明

AI之眼页面使用两类后端结果：

1. 正式预训练推理：torchvision 官方预训练模型完成目标检测、语义分割、实例分割。
2. 机制级本地实现：YOLO 范式和 U-Net 结构用 NumPy/Pillow 在后端真实计算中间结果，用于教学解释，不冒充训练好的官方权重。

- 目标检测：Faster R-CNN、RetinaNet、FCOS
- 语义分割：FCN、DeepLabV3、LR-ASPP
- 实例分割：Mask R-CNN
- 单阶段检测机制：YOLO-style grid detector，本地 NumPy/Pillow
- 编解码分割机制：U-Net-style encoder-decoder，本地 NumPy/Pillow

项目不使用 OpenCV。模型推理由 PyTorch/torchvision 完成；图像读取、框和 mask 可视化、统计图与中间步骤展示由 NumPy/Pillow 实现。

## 安装依赖

```bash
pip install -r requirements.txt
```

AI之眼需要：

```bash
pip install torch torchvision
```

CPU 可以运行，但 Faster R-CNN、DeepLabV3、Mask R-CNN 首次加载和推理会较慢。有 CUDA 时会自动使用 GPU。

## 准备权重

权重默认由 torchvision 下载到 torch hub 缓存目录，通常是：

```text
~/.cache/torch/hub/checkpoints
```

Windows 上常见路径：

```text
C:\Users\<用户名>\.cache\torch\hub\checkpoints
```

查看模型与缓存状态：

```bash
python prepare_ai_eye_assets.py --list
```

准备默认体验所需模型：

```bash
python prepare_ai_eye_assets.py --model fasterrcnn_resnet50_fpn
python prepare_ai_eye_assets.py --model deeplabv3_resnet50
python prepare_ai_eye_assets.py --model maskrcnn_resnet50_fpn
```

准备全部可切换模型：

```bash
python prepare_ai_eye_assets.py --all
```

这些权重体积较大，不提交到 Git 仓库。公开平台部署时，推荐把权重放在平台缓存层、Release 附件或云存储中，并在启动前运行上面的准备命令。

## 页面运行模式

AI之眼正式页面只把真实 torchvision 预训练推理作为成功结果。若权重缺失或下载失败，后端会返回明确错误和下载命令，不会用本地启发式算法冒充真实模型。

YOLO 与 U-Net 当前不作为预训练成功结果计入。它们是后端真实计算的机制讲解：

- `/api/demo/yolo` 返回网格划分、目标性图、候选框、重叠抑制和最终框，`implementation.category=local_mechanism`。
- `/api/demo/unet` 返回编码器细节、瓶颈、无跳跃解码、跳跃融合、概率图和 mask，`implementation.category=local_mechanism`。

如果后续需要展示真实 YOLO 或真实 U-Net 指标，应新增外部权重下载/训练说明，并在元数据中改为对应真实模型来源；不能把机制版结果标成预训练权重推理。

API：

```bash
POST /api/demo/ai_eye
```

常用参数：

- `task=all|detection|semantic|instance`
- `model=<model_id>`
- `score_threshold=0.5`
- `mask_threshold=0.5`

模型清单：

```bash
GET /api/ai-eye/models
```

## 是否需要训练

第一版不默认自动训练。原因是：

- 三类任务已有 torchvision 官方预训练权重，观众安装和体验成本更低。
- 训练目标检测、语义分割、实例分割需要 COCO/VOC 等数据集，体积大、耗时长，不适合默认安装流程。
- 自训权重体积也较大，应放到 Release、云存储或平台缓存，不应直接塞进仓库。

如果后续要增加自训练流程，建议新增独立脚本：

```bash
python train_ai_eye.py --task detection --dataset coco --output external_weights/
```

并在文档中说明数据集来源、许可、训练命令、指标和权重下载地址。
