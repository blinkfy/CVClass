# ARCHITECTURE.md §六 vs Hands-on-CV 覆盖缺口分析

> 生成日期：2026-06-14
>
> 对照基准：`E:\workspace\cvdsx\Hands-on-CV` 全部 18 章 + 两本知识手册

---

## 一、总览

| 维度 | ARCHITECTURE.md §六 | Hands-on-CV | 状态 |
|---|---|---|---|
| 规划算法总数 | **53** | — | — |
| Hands-on-CV 章节算法 | — | **~80** (含子技术) | — |
| ARCHITECTURE 已覆盖 | 53 | — | — |
| Hands-on-CV 有但 ARCHITECTURE 缺 | — | **28** | ❌ 缺口 |
| Hands-on-CV 无但 ARCHITECTURE 规划 | — | **11** | ⚠️ 超出范围 |

---

## 二、逐章对比

### 第2章 卷积

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 1D 离散卷积（定义/翻转/滑窗/输出尺寸） | 卷积操作（仅2D） | ⚠️ 缺 1D 卷积基础 |
| 单位冲激信号 | — | ❌ |
| 方波核平滑 | 高斯模糊（类似） | ~ |
| 2D 卷积 `filter2D` | 卷积操作 | ✅ |
| 核尺寸对输出的影响 | — | ❌ |

### 第3章 滤波

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 椒盐噪声生成 | — | ❌ |
| 高斯噪声生成 | — | ❌ |
| 均值滤波 | 高斯模糊（类似） | ~ |
| **高斯滤波** | 高斯模糊 | ✅ |
| **中值滤波** | — | ❌ |
| **双边滤波** | — | ❌ |
| **Unsharp Masking 锐化** | — | ❌ |

### 第4章 模版匹配

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 互相关 CCORR | — | ❌ |
| 归一化互相关 NCC | — | ❌ |
| 单目标匹配 | — | ❌ |
| 多目标匹配 + Quickselect | — | ❌ |

> **整章缺失**。模板匹配是一个经典的滑窗检测范式，值得作为「基础原语」或「经典CV」补充。

### 第5章 边缘检测

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 图像梯度概念 | Sobel梯度 | ✅ |
| Sobel X/Y 核 | Sobel梯度 | ✅ |
| 梯度幅值计算 | Sobel梯度 | ✅ |
| **Canny 五步完整实现** | Canny边缘检测 | ✅ |
| Canny 参数影响（核尺寸/σ/双阈值） | — | ⚠️ 可补充 |

> 基本完整覆盖。Canny 的详细参数交互式展示是可选的增强点。

### 第6章 角点检测

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 结构张量 M | Harris角点 | ✅ |
| 角点响应函数 R | Harris角点 | ✅ |
| 特征值分类（角/边/平坦） | Harris角点 | ✅ |
| 高斯加权窗口 | Harris角点 | ✅ |
| NMS 3×3 | — | ⚠️ 可补充 |

> 基本完整覆盖。

### 第7章 特征检测（SIFT）

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 高斯尺度空间 | SIFT特征 | ✅ |
| DoG 空间 | SIFT特征 | ✅ |
| 局部极值检测（26邻域） | SIFT特征 | ✅ |
| 亚像素定位（Newton迭代） | — | ⚠️ 可补充 |
| 低对比度剔除 + 边缘响应剔除 | — | ⚠️ 可补充 |
| 主方向分配（36bin直方图） | SIFT特征 | ✅ |
| 128维描述子（三线性插值） | SIFT特征 | ✅ |
| 描述子归一化 | SIFT特征 | ✅ |
| Lowe's ratio test | SIFT特征 | ✅ |
| **RANSAC** | 图像拼接 | ✅ |

> 覆盖充分。亚像素定位的数值优化细节可作为进阶展示。

### 第8章 图像拼接

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| RANSAC 鲁棒估计 | 图像拼接 | ✅ |
| 透视变换（单应性矩阵） | 图像拼接 | ✅ |
| SVD 求解 | — | ⚠️ |
| 图像融合（重叠区平均） | 图像拼接 | ✅ |
| 内点/外点可视化 | — | ⚠️ |

> 基本覆盖。

### 第9章 图像分割

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **K-Means 分割**（RGB） | — | ❌ |
| **空间增强K-Means**（RGB+xy） | SLIC超像素（类似） | ~ |
| **Normalized Cuts**（谱聚类） | — | ❌ |
| 分水岭分割 | 分水岭分割 | ✅ |
| GrabCut | GrabCut | ✅ |
| SLIC | SLIC超像素 | ✅ |

> **缺 K-Means 和 Ncuts**。这是两种经典分割方法，尤其 Ncuts 的谱聚类视角有教学价值。

### 第10章 图像分类

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **Bag of Visual Words (BoVW)** | — | ❌ |
| **Spatial Pyramid Matching (SPM)** | — | ❌ |
| **AdditiveChi2Sampler + SVM** | HOG+SVM（不同特征） | ~ |
| ResNet 残差块 | ResNet | ✅ |
| ResNet34 完整实现 | ResNet | ✅ |
| 迁移学习（ImageNet预训练） | ResNet | ✅ |
| 数据增强 + 归一化 | — | ⚠️ |
| CrossEntropy + Adam | — | ⚠️ |

> **缺 BoVW 和 SPM**。这是衔接 SIFT（手工特征）+ SVM（分类器）的关键桥梁，展示了手工特征时代的完整分类流程。

### 第11章 语义分割

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **FCN-8s**（ResNet101 backbone） | — | ❌ |
| 转置卷积（反卷积） | — | ⚠️ |
| 跳跃连接 | U-Net（类似） | ~ |
| 双线性核初始化 | — | ❌ |
| PASCAL VOC + mIoU | U-Net | ✅ |

> **缺 FCN**。FCN 是语义分割的开山之作，与 U-Net 互补。U-Net 偏医学/小样本，FCN 偏自然图像/端到端。

### 第12章 目标检测

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **Faster R-CNN + FPN** | — | ❌ |
| **RPN**（Region Proposal Network） | — | ❌ |
| RoI Pooling | — | ❌ |
| Bounding box regression | YOLO（回归方式不同）| ~ |
| NMS | YOLO | ✅ |
| MS COCO + mAP | YOLO | ✅ |

> **缺 Faster R-CNN**。Faster R-CNN 是两阶段检测器的代表，YOLO 是单阶段的代表。同时覆盖才有教学对比价值。

### 第13章 实例分割

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **Mask R-CNN** | 实例分割（空壳） | ⚠️ |
| RoIAlign（双线性插值） | — | ❌ |
| Anchor 机制 | — | ❌ |
| FPN 特征金字塔 | — | ❌ |
| 多任务损失 | — | ❌ |
| MS COCO 80类 | — | ❌ |

> ARCHITECTURE 阶段四有计划 `instance/` 目录但**算法实现为空壳**。Mask R-CNN 是核心内容。

### 第14章 人体姿态估计

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **DeepPose**（级联回归） | — | ❌ |
| ResNet50 backbone | OpenPose/MediaPipe/ViTPose | ~ |
| PCK 评估指标 | — | ❌ |
| COCO 17关键点 | OpenPose | ✅ |

> **缺 DeepPose**。这是深度学习姿态估计的起点（2014），有教学价值。

### 第15章 动作识别

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **3D卷积**（时空卷积核） | — | ❌ |
| **C3D 网络**（8conv+3FC） | — | ❌ |
| UCF101 数据集 | — | ❌ |
| 时序特征学习 | — | ❌ |

> **整章缺失**。动作识别/视频理解是一个独立的大方向，ARCHITECTURE 完全没有覆盖。

### 第16章 照相机标定

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| **针孔相机模型** | — | ❌ |
| **内参矩阵 K**（fx/fy/cx/cy） | — | ❌ |
| **外参矩阵 [R\|t]** | — | ❌ |
| **畸变模型**（径向+切向） | — | ❌ |
| 棋盘格角点检测 | — | ❌ |
| **DLT 归一化 + SVD 求解** | — | ❌ |
| **Cholesky 分解求 K** | — | ❌ |
| 重投影误差 | — | ❌ |
| OpenCV calibrateCamera | — | ❌ |

> **整章缺失**。相机标定是 3D 视觉的前置基础（从 2D 图像恢复 3D 信息的数学桥梁），与 NeRF/3DGS/立体匹配密切相关。

### 第17章 光流和运动场

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 光流约束方程 | 光流 | ✅ |
| 孔径问题 | 光流 | ✅ |
| **Lucas-Kanade** 最小二乘 | 光流 | ✅ |
| 高斯导数核 | 光流 | ✅ |
| **Shi-Tomasi 角点** | — | ❌ |
| **金字塔 LK**（coarse-to-fine） | 光流 | ✅ |
| cv2.calcOpticalFlowPyrLK | 光流 | ✅ |

> 基本覆盖。**缺 Shi-Tomasi**（Harris 的改进版，用于光流的特征点选择）。

### 第18章 双目视觉

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| 三角测量原理 `Z=fB/d` | 立体匹配 | ✅ |
| 视差图概念 | 立体匹配 | ✅ |
| **SAD 匹配代价** | — | ❌ |
| **SSD 匹配代价** | — | ❌ |
| 窗口尺寸效应 | — | ❌ |
| 置信度过滤 | — | ❌ |

> 基本覆盖核心概念，**缺 SAD/SSD 具体匹配代价函数**。

### 第19章 三维重建

| Hands-on-CV 内容 | ARCHITECTURE 对应 | 状态 |
|---|---|---|
| SIFT 特征匹配 | 图像拼接 | ✅ |
| **基础矩阵 F**（8点法+RANSAC） | — | ❌ |
| **本质矩阵 E** | — | ❌ |
| **相机姿态恢复**（SVD 4解） | — | ❌ |
| 对极几何约束 | — | ❌ |
| 三角测量 | — | ❌ |
| 完整的 SfM 管线 | — | ❌ |

> **大量缺失**。立体匹配只是 3D 重建的一部分。完整的运动推断结构（SfM）管线——F→E→R,t→三角测量——完全没有覆盖。这是连接 Ch16（标定）、Ch18（立体）、NeRF/3DGS 的关键桥梁。

---

## 三、前沿知识手册内容对比

Hands-on-CV 的「计算机视觉前沿与进阶知识手册」包含但 ARCHITECTURE 未规划：

| 内容 | 状态 |
|---|---|
| ViT, Swin, DINO, MAE | ✅ 已规划 |
| CLIP, SAM, SAM 2 | ✅ 已规划 |
| NeRF, 3DGS | ✅ 已规划 |
| DDPM/DDIM, ControlNet, DiT | ✅ 已规划 |
| **PointNet**（点云深度学习） | ❌ |
| **BEV Perception**（LSS/多相机融合） | ❌ |
| **Occupancy Networks**（体素占据预测） | ❌ |
| **End-to-End Autonomous Driving**（UniAD/VAD） | ❌ |
| **Visual SLAM**（ORB-SLAM3） | ❌ |
| **Gesture/Eye Tracking**（MediaPipe Hands, HaMeR） | ❌ |
| **3D U-Net**（医学图像分割） | ❌ |
| **Cross-modal Medical AI**（ConVIRT, BioViL, Med-PaLM 2） | ❌ |
| **Visual RL**（DrQ-v2, DreamerV3） | ❌ |
| **VLA Models**（RT-2） | ❌ |
| **Sim2Real**（域随机化/域自适应） | ❌ |

---

## 四、汇总

### 4.1 ARCHITECTURE 完全缺失的 Hands-on-CV 章节（整章缺）

| 章节 | 主题 | 重要性 | 建议 |
|---|---|---|---|
| **第4章** | 模板匹配 | ⭐⭐ | 可并入阶段一「基础原语」 |
| **第15章** | 动作识别（C3D） | ⭐⭐⭐ | 建议新增「视频理解」模块 |
| **第16章** | 照相机标定 | ⭐⭐⭐⭐ | 建议新增到阶段三，作为 3D 视觉前置 |

### 4.2 ARCHITECTURE 缺失的具体算法/技术（章节内部分缺失）

| 章节 | 缺失内容 | 重要性 | 建议 |
|---|---|---|---|
| Ch2 | 1D卷积、核尺寸效应 | ⭐ | 不紧急 |
| Ch3 | 中值滤波、双边滤波、Unsharp Masking | ⭐⭐⭐ | 补充到阶段一 |
| Ch9 | **K-Means 分割、Normalized Cuts** | ⭐⭐⭐ | 补充到阶段三 |
| Ch10 | **BoVW、SPM** | ⭐⭐⭐ | 补充到阶段三（衔接 SIFT→分类） |
| Ch11 | **FCN** | ⭐⭐⭐⭐ | 补充到阶段四（与 U-Net 并列） |
| Ch12 | **Faster R-CNN + FPN + RPN** | ⭐⭐⭐⭐ | 补充到阶段四（与 YOLO 对比） |
| Ch13 | **Mask R-CNN + RoIAlign** | ⭐⭐⭐ | 填充 instance/ 空壳 |
| Ch14 | **DeepPose** | ⭐⭐ | 补充到阶段五·姿态估计 |
| Ch17 | **Shi-Tomasi 角点** | ⭐⭐ | 补充到阶段二 |
| Ch18 | SAD/SSD 匹配代价 | ⭐⭐ | 补充到阶段三 |
| Ch19 | **F/E/R,t/三角测量管线** | ⭐⭐⭐⭐ | 补充到阶段三或阶段五·3D |

### 4.3 前沿手册完全缺失的方向

| 方向 | 重要性 | 建议 |
|---|---|---|
| PointNet | ⭐⭐⭐ | 补充到阶段五·3D |
| BEV + Occupancy + E2E Driving | ⭐⭐⭐ | 可选新增「自动驾驶」子类 |
| Visual SLAM | ⭐⭐⭐ | 补充到阶段五·3D |
| 医学图像 AI（3D U-Net, MedCLIP） | ⭐⭐ | 可选 |
| Embodied AI（VLA, Sim2Real） | ⭐⭐ | 可选 |
| 姿态/手势跟踪 | ⭐⭐ | MediaPipe Hands 已有部分覆盖 |

### 4.4 ARCHITECTURE 独有但 Hands-on-CV 没有的内容（超出范围）

| 算法 | 说明 |
|---|---|
| Hough 变换 | Hands-on-CV 完全没有提及 |
| 形态学操作 | Hands-on-CV 完全没有提及 |
| 轮廓查找 | Hands-on-CV 完全没有提及 |
| GrabCut | Hands-on-CV 完全没有提及 |
| SLIC 超像素 | Hands-on-CV 完全没有提及 |
| 色彩空间转换 | Hands-on-CV 未独立教学 |
| 直方图/均衡化 | Hands-on-CV 未独立教学 |
| HOG + SVM | Hands-on-CV 用 BoVW+SPM 替代 |
| YOLO | Hands-on-CV 用 Faster R-CNN |
| U-Net | Hands-on-CV 用 FCN |
| Diffusion Models | 仅有前沿手册简述 |
| DETR 系列 | 仅前沿手册有 DETR，缺 DINO/Grounding DINO |
| ByteTrack/BotSORT | 完全缺 |

---

## 五、建议的补充优先级

### P0 — 强烈建议立即补充

1. **Faster R-CNN**（Ch12）→ 填充 `detection/` 空壳，与 YOLO 形成两阶段 vs 单阶段对比
2. **FCN**（Ch11）→ 填充 `semantic/` 空壳，与 U-Net 形成语义分割双璧
3. **Mask R-CNN**（Ch13）→ 填充 `instance/` 空壳
4. **相机标定**（Ch16）→ 新增到阶段三，作为 3D 视觉的数学基础
5. **对极几何/F/E/三角测量**（Ch19）→ 扩充立体匹配，连接 SIFT→3D 重建→NeRF 的完整链

### P1 — 建议补充

6. **K-Means / Ncuts 分割**（Ch9）→ 补充到阶段三，丰富分割算法
7. **BoVW / SPM**（Ch10）→ 补充到阶段三，完善手工特征→分类的完整故事线
8. **中值滤波 / 双边滤波**（Ch3）→ 补充到阶段一
9. **动作识别 C3D**（Ch15）→ 新增视频理解模块

### P2 — 可选补充

10. **模板匹配**（Ch4）→ 并入阶段一
11. **Shi-Tomasi**（Ch17）→ 补充到阶段二
12. **DeepPose**（Ch14）→ 补充到阶段五
13. **PointNet**（前沿手册）→ 补充到阶段五·3D
