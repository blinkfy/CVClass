# 计算机视觉教学实验系统

这是一个面向计算机视觉课程教学的交互式 Web 实验平台，覆盖从经典图像处理、CNN 学习与分类、检测与分割，到几何运动、三维视觉和多模态前沿的完整 CV 知识体系。系统以"逐步可视化"为核心设计理念，将算法原理、计算过程和真实推理结果以可交互、可动画、可调试的方式呈现。

## 系统定位

- **完整课程体系**：从像素级操作到前沿多模态模型，形成 4 大学习世界、40+ 交互页面。
- **前端为主的重推理体验**：目标检测、语义分割、实例分割等视觉任务基于 ONNX Runtime Web 在浏览器端完成真实推理，不依赖后端 GPU。
- **NumPy 手动实现**：传统图像处理、卷积、特征提取等核心计算不使用 OpenCV/cv2，而是用 NumPy 逐步完成，便于教学讲解。
- **可视化优先**：每个算法都配备步骤拆解、公式展示、中间结果可视化和参数实时调节。

## 四大学习世界

### World 01 · 基础算法主线

- **图像基础** (`/grayscale`)：灰度化、二值化、通道分离、颜色反转、翻转旋转、直方图均衡化。
- **卷积与滤波** (`/convolution`)：卷积核、padding、stride、dilation、1×1 卷积、空洞卷积、蛇形卷积。
- **图像卷积应用** (`/image-convolution`)：将卷积操作应用于真实图像。
- **边缘、轮廓与形态学** (`/edge-detection`)：Sobel、Prewitt、Roberts、Laplacian、LoG、Canny、TEED 及应用实践。
- **角点、特征与图像拼接** (`/feature-detection`)：Harris、FAST、SIFT、ORB、特征匹配、全景拼接。

### World 02 · CNN 学习与分类

- **CNN 如何学习 / 图像分类** (`/cnn-visualization`)：6×6 教学 CNN 的前向传播、反向传播和参数更新。
- **CNN 数据传播细节** (`/cnn-explainer`)：更细粒度的数据流展示。
- **卷积梯度显微镜** (`/conv-gradient-lab`)：卷积层梯度计算可视化。
- **手写数字识别** (`/digit-recognition`)：基于 NumPy CNN 的 MNIST 在线推理。
- **图像分类实验** (`/vision-tasks/classification`)：BoVW、CNN Top-K 等分类任务。

### World 03 · 几何运动与三维视觉

- **相机几何与标定** (`/camera-geometry`)：针孔模型、内外参、投影矩阵、棋盘格标定。
- **运动估计与光流** (`/motion-estimation`)：光流约束、Lucas-Kanade、金字塔追踪、真实视频光流。
- **双目视觉与深度** (`/stereo-depth`)：平行双目、极线约束、视差三角关系、块匹配。
- **多视图几何与三维重建** (`/multiview-reconstruction`)：对极几何、本质矩阵、相机位姿、三角测量。
- **人体姿态估计** (`/human-pose`)：关键点骨架、姿态估计机制、动作识别。

### World 04 · 生成式与多模态前沿

- **Vision Transformer** (`/vision-transformer`)：ViT、DINO 自监督蒸馏。
- **CLIP 图文对齐** (`/frontier/clip`)
- **VLM 视觉语言模型** (`/frontier/vlm`)
- **多模态理解** (`/frontier/multimodal`)
- **生成式多模态** (`/generative-multimodal`)：SAM、GAN、Diffusion
- **Vision Banana 案例** (`/frontier/vision-banana`)：统一视觉任务接口

### 视觉任务实验台

- **目标检测** (`/object-detection`)：YOLO 真实推理、R-CNN 机制拆解。
- **语义分割** (`/semantic-segmentation`)：基于 SegFormer 的全景像素级分类。
- **实例分割** (`/instance-segmentation`)：YOLO-seg / Mask R-CNN 机制、Prototype Blender。
- **语义 vs 实例对比** (`/segmentation-lab`)
- **传统分割与区域提取** (`/segmentation-basic`)：K-means、Graph Cut、Watershed、区域属性分析。

## 技术栈

- **前端**：原生 HTML、CSS、JavaScript
- **后端**：Python Flask
- **核心计算**：NumPy（手动实现，不依赖 OpenCV）
- **深度学习推理**：ONNX Runtime Web（浏览器端 WASM/WebGL/WebGPU）
- **可视化**：ECharts、Three.js、自定义 Canvas/SVG 动画
- **公式渲染**：KaTeX

## 运行方式

1. 安装依赖：

```bash
pip install flask numpy pillow numba
```

1. 启动服务：

```bash
python app.py
```

1. 在浏览器中访问：

```text
http://127.0.0.1:5000/
```

### Diffusion 真实推理资源（可选）

`/generative-multimodal/diffusion` 的 SDXS 实验台在浏览器端运行 UNet、VAE 与 CLIP 文本编码器；后端不加载或执行这些模型。浏览器会从仓库内的 `static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/` 读取模型文件。

该目录包含 `unet/model.fp16.onnx`、`vae_decoder/model.fp16.onnx`、`text_encoder/model.fp16.onnx`、`tokenizer/vocab.json` 和 `tokenizer/merges.txt`。若只有原始的 `text_encoder/model.safetensors`，请先在具备 `torch`、`transformers`、`safetensors`、`onnx` 与 `onnxconverter-common` 的 Python 环境中运行：

```powershell
python scripts/export_sdxs_text_encoder_onnx.py --model-dir 'F:\path\to\source-sdxs-512-dreamshaper' --output 'static/assets/data/generative_multimodal/diffusion/sdxs-512-dreamshaper/text_encoder/model.fp16.onnx' --fp16
```

若替换 ONNX 模型文件，请同步更新 `static/js/generative_multimodal/diffusion_text_to_image.js` 中的 `MODEL_REVISION`，让浏览器下载新版权重。

## 项目结构

```text
CVClass/
├─ app.py                          # Flask 应用入口
├─ page_routes.py                  # 页面路由注册
├─ ai_routes.py                    # AI 助手导航目录与 API
├─ README.md                       # 本文件
├─ templates/                      # Jinja2 模板
│  ├─ base.html                    # 站点基础布局
│  ├─ pages/                       # 首页、学习路径、知识图谱等
│  ├─ vision_tasks/                # 视觉任务实验台页面
│  ├─ frontier/                    # 前沿模型页面
│  ├─ human_pose/                  # 姿态估计页面
│  ├─ camera_geometry/             # 相机几何页面
│  ├─ motion_estimation/           # 光流页面
│  ├─ stereo_depth/                # 双目深度页面
│  ├─ multiview_reconstruction/    # 多视图重建页面
│  ├─ cnn/                         # CNN 可视化页面
│  ├─ edge/                        # 边缘检测页面
│  ├─ feature/                     # 特征检测页面
│  └─ convolution/                 # 卷积可视化页面
├─ static/
│  ├─ css/                         # 样式文件
│  ├─ js/                          # 前端脚本
│  │  ├─ pages/                    # 页面级脚本
│  │  ├─ vision_tasks/             # 视觉任务脚本
│  │  ├─ inference/                # ONNX 推理封装
│  │  └─ ...                       # 其他模块脚本
│  └─ assets/                      # 图片、数据、模型配置
├─ models/                         # 后端 NumPy 算法实现
│  ├─ image_utils.py               # 图像处理核心
│  ├─ edge_visualization.py        # 边缘检测
│  ├─ feature_utils.py             # 特征提取与匹配
│  ├─ digit_infer_numpy.py         # MNIST 推理
│  ├─ multiview_real.py            # 多视图重建
│  └─ mycnn.py                     # NumPy CNN 实现
└─ reference/                      # 参考资料与工具
```

## 主要功能特性

- **闯关式学习路径** (`/learning-path`)：以 World/Level 地图形式串联所有知识点。
- **知识图谱** (`/knowledge-graph`)：展示模块间的前置与演进关系。
- **AI 学习助手**：每个页面内置算法解释、参数分析和结果诊断能力。
- **真实模型推理**：YOLO11n、SegFormer、YOLO11n-seg 等模型在浏览器端运行。
- **教学动画**：NMS、ROI Align、Mask Prototype、光流约束、对极几何等均配备分步动画。
- **参数实时调节**：几乎所有可视化都支持滑块、下拉、开关等交互控制。

## 浏览器要求

- 推荐 Chrome / Edge / Firefox 最新版
- 视觉任务真实推理需要支持 WebAssembly，WebGPU 后端可获得最佳性能
- 部分 Three.js 可视化需要 WebGL 支持

