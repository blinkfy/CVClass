# 计算机视觉通识教育高质量教学页设计方案

本文档用于指导后续把已经留下来的正式算法页做成“真实、好看、能讲课”的高质量展示页面。它不是算法名单扩张计划，而是正式页的产品设计、交互设计、后端数据设计和验收标准。

核心目标：让一个对计算机视觉不了解的人，操作系统后能理解 CV 的基本问题、典型算法范式、现代深度学习视觉模型以及它们之间的关系。评分展示和视频讲解应该围绕“可理解性、美观性、直观性、真实性”展开，而不是围绕算法名词数量堆砌。

## 1. 总体原则

### 1.1 不做静态结果陈列

每个正式页面都必须回答三个问题：

1. 这个算法解决什么视觉问题？
2. 它是怎样一步步把输入变成输出的？
3. 用户改变输入、参数或交互点时，结果为什么会改变？

静态中间结果只能作为证据，不能作为教学主体。页面主体应该是可操作的“教学舞台”：用户能点、拖、调参、播放过程，并且每次操作都能看到真实后端数据如何变化。

### 1.2 真实结果优先

正式页的所有主结果必须来自后端真实计算：

- 传统算法：NumPy/Pillow 本地实现。
- 深度模型：真实 PyTorch/torchvision/transformers/segment-anything 推理。
- 机制型算法：本地真实机制实现，标记 `local_mechanism / real_model:false`。

不能出现以下情况：

- 前端随机生成检测框、mask、attention 来冒充结果。
- 预训练权重缺失时用启发式结果冒充模型推理。
- 页面只放几张后端步骤图，用户无法操作，也看不到过程如何发生。

### 1.3 教学展示优先级

页面质量优先级如下：

1. 可理解：零基础观众能看懂这一步在做什么。
2. 真实：结果和中间数据来自真实算法或真实模型。
3. 可交互：用户能通过操作理解算法含义。
4. 美观：页面规整、有重点、有讲课感。
5. 完整：包含步骤、公式、应用场景、局限。

如果信息很多，宁可减少同屏文字，也要保证主舞台清楚。页面不是论文摘要，而是教学演示系统。

## 2. 正式范围与边界

### 2.1 本阶段正式打磨范围

本阶段重点打磨以下页面：

| 主题 | 正式内容 | 目标 |
|---|---|---|
| AI之眼 | Faster R-CNN、YOLO、FCN/DeepLab、U-Net、Mask R-CNN | 项目核心展示页 |
| 深度基石 | ResNet、Grad-CAM | 解释深度网络如何判断与关注 |
| 生成模型 | GAN、Diffusion | 解释 AI 如何生成图像 |
| Transformer 与基础模型 | ViT、DETR、CLIP、SAM、NeRF | 解释现代 CV 新范式 |

`CNN` 和 `LeNet` 暂时保持现状，不在本阶段重做。后续只允许做主题兼容、入口整理和必要的样式修复。

### 2.2 不纳入本阶段正式页

以下内容不在本阶段做成正式高质量页面：

- 独立 NMS 页面。
- 模板匹配、Hough 变换、轮廓查找。
- Swin、DINO、MAE、Grounding DINO、Mask2Former、BLIP-2。
- Stable Diffusion、StyleGAN、ControlNet、DiT、FLUX。
- SAM2、3D Gaussian Splatting、DUSt3R、ORB-SLAM3、ByteTrack、姿态估计大模型。

这些模块可以保留兼容接口或在未来扩展中提到，但不进入评分展示主线。

## 3. 统一教学页结构

正式页应采用统一的“教学舞台”结构，避免每页风格割裂。

### 3.1 页面区域

每个正式页建议由五个区域组成：

| 区域 | 作用 |
|---|---|
| 顶部问题区 | 一句话说明算法解决什么问题 |
| 左侧流程线 | 显示当前算法步骤，可点击跳转 |
| 中央主舞台 | 大画布/主图/交互区，展示动画和真实结果 |
| 右侧讲解栏 | 当前步骤解释、公式、关键数据、应用提示 |
| 底部控制区 | 上传、模型切换、参数滑块、播放控制、交互模式 |

中央主舞台必须是页面视觉中心。步骤卡片只作为补充，不应抢走主舞台。

### 3.2 主舞台交互能力

统一主舞台需要支持：

- 上传图像。
- 使用内置示例。
- 播放/暂停动画。
- 上一步/下一步。
- 拖动时间轴。
- 点击图像坐标。
- 拖动框选区域。
- 调整阈值和透明度。
- 切换模型或算法分支。
- 展开结构化中间数据。

不是每个页面都要用全部能力，但每个正式页至少要有一种真正改变展示结果的交互。

### 3.3 讲课模式

每个重点页增加“讲课模式”概念。讲课模式不是新功能按钮也可以，但页面内容要天然适合录视频：

1. 第一屏能一句话讲清问题。
2. 点击步骤线能按顺序讲完整流程。
3. 每一步主舞台有明确视觉变化。
4. 右侧解释栏文字短、准、通俗。
5. 页面底部有“应用场景”和“局限”总结。

视频录制时，应能沿着页面从上到下、从左到右自然讲解。

## 4. 后端数据设计

### 4.1 基础响应结构

正式页后端建议统一返回以下结构：

```json
{
  "module_id": "sam",
  "requested_module_id": "sam",
  "steps": [],
  "frames": [],
  "overlays": {},
  "curves": {},
  "interactions": {},
  "outputs": {},
  "metrics": {},
  "implementation": {
    "category": "pretrained_model",
    "real_model": true,
    "backend": "segment-anything"
  }
}
```

字段含义：

| 字段 | 用途 |
|---|---|
| `steps` | 关键步骤图、名称、解释、公式 |
| `frames` | 动画关键帧，如训练轮次、扩散时间步、query 筛选过程 |
| `overlays` | 框、mask、attention、热力图、射线采样点等可叠加数据 |
| `curves` | loss、CDF、alpha_bar、score、confidence 曲线 |
| `interactions` | 前端可交互项定义，如点、框、阈值、类别、patch |
| `outputs` | 最终结构化结果，如 detections、segments、instances |
| `metrics` | 状态、模型、耗时、数量、置信度等 |
| `implementation` | 真实实现状态，不允许误标 |

### 4.2 步骤数据要求

每个 `step` 至少包含：

```json
{
  "id": "query_scores",
  "name": "Query 分数过滤",
  "image_base64": "...",
  "explanation": "这一步说明哪些 query 被保留。",
  "formula": "score_i = (1 - p_i(no-object)) max_c p_i(c)",
  "data": {}
}
```

如果某步骤用于动画，`data` 中必须包含可复现动画的结构化数据，而不是只给图片。

例如：

- DETR：query id、box、class score、objectness、attention map。
- SAM：point prompts、box prompt、candidate masks、IoU scores。
- CLIP：image embedding 摘要、text embeddings、similarity matrix。
- Diffusion：每个时间步的 `alpha_bar`、noise weight、图像帧。
- GAN：每个 checkpoint 的 real samples、fake samples、loss。
- NeRF：ray origin、ray direction、sample points、sigma、weights、rgb。

### 4.3 错误与权重缺失

预训练模型缺权重时：

- 返回 503 或受控错误。
- `implementation.real_model` 仍按该模块真实意图标记。
- `metrics.status` 为 `model_not_available`。
- 返回下载命令、缓存路径、环境变量说明。
- 不返回启发式假结果冒充成功。

机制型页面必须明确标注：

- `category: "local_mechanism"`
- `real_model: false`
- 文案说明“本地机制实现，不是官方预训练权重推理”。

## 5. 前端通用组件设计

### 5.1 TeachingStage 主舞台

新增或改造共享渲染器，形成 `TeachingStage` 能力。它负责：

- 接收后端 JSON。
- 渲染主图。
- 绘制 overlay。
- 播放 frames。
- 响应交互事件。
- 更新右侧讲解栏。

建议支持的 overlay 类型：

| 类型 | 用途 |
|---|---|
| `boxes` | 检测框、query 框、候选框 |
| `masks` | 语义 mask、实例 mask、SAM mask |
| `heatmap` | Grad-CAM、attention、confidence |
| `points` | SAM 点提示、NeRF 采样点 |
| `rays` | NeRF 射线 |
| `tokens` | ViT patch token、DETR query |
| `chart` | loss、score、alpha_bar、similarity |

### 5.2 时间线组件

用于 GAN、Diffusion、NeRF、DETR query 筛选、ViT attention 流程。

功能：

- 播放/暂停。
- 拖动进度。
- 下一帧/上一帧。
- 显示当前帧标题。
- 根据帧切换主舞台画面、公式和解释。

### 5.3 交互图像组件

用于 SAM、Grad-CAM、ViT、NeRF。

功能：

- 点击图像返回原图坐标。
- 拖动生成矩形框。
- 支持多点标注。
- 支持正点/负点切换。
- 支持删除最后一个点。
- 支持 overlay 透明度控制。

### 5.4 对比视图组件

用于 AI之眼、YOLO/Faster R-CNN、FCN/U-Net、GAN/Diffusion。

功能：

- 同一张图多算法并排。
- 原图/结果滑块对比。
- 指标表格。
- 模型来源与真实性标记。

## 6. 各正式页详细设计

## 6.1 AI之眼

### 页面定位

AI之眼是项目最重要页面，用同一张图展示三类视觉理解任务：

- 目标检测：图中有什么，在哪里？
- 语义分割：每个像素属于哪一类？
- 实例分割：同类物体如何一个个分开？

### 页面布局

第一屏：

- 左侧：上传/示例图 + 任务切换。
- 中间：同图三视角总览。
- 右侧：当前任务解释和模型状态。

主体：

- 检测过程区。
- 语义分割过程区。
- 实例分割过程区。
- YOLO 机制区。
- U-Net 机制区。
- 最终对比区。

### 交互设计

必须支持：

- 切换任务：检测、语义、实例、总览、YOLO、U-Net。
- 切换模型：Faster R-CNN、RetinaNet、FCN、DeepLabV3、Mask R-CNN 等。
- 调整 score threshold。
- 调整 mask threshold。
- 调整 overlay opacity。
- 点击某个框/某个 mask 后，右侧显示类别、置信度、面积、来源步骤。

### 后端数据

检测返回：

- `boxes`
- `scores`
- `labels`
- `candidate_summary`
- `filtered_boxes`
- `final_overlay`

语义分割返回：

- `label_map`
- `confidence_map`
- `class_area`
- `overlay`
- `top_classes`

实例分割返回：

- `boxes`
- `masks`
- `scores`
- `areas`
- `instance_overlay`

YOLO 机制返回：

- grid cells
- objectness heatmap
- raw boxes
- filtered boxes
- final boxes

U-Net 机制返回：

- encoder feature maps
- bottleneck
- decoder maps
- skip fusion map
- probability map
- binary mask

### 动画设计

检测：

1. 图像进入 backbone。
2. 候选区域或 query 框出现。
3. 低分框淡出。
4. 保留最终框。

语义分割：

1. 低分辨率 logits 出现。
2. 上采样回原图。
3. 每个像素变成类别色块。
4. overlay 到原图。

实例分割：

1. 先出现检测框。
2. 每个框内 mask 概率图亮起。
3. mask 阈值化。
4. 不同实例着不同颜色。

### 讲解脚本

1. “检测只关心物体框。”
2. “语义分割关心每个像素是什么类。”
3. “实例分割不仅知道类别，还能把同类物体分开。”
4. “这三者是同一张图的三种理解粒度。”

## 6.2 SAM

### 页面定位

SAM 的核心不是“自动给一张 mask”，而是“提示驱动分割”。用户必须参与。

### 必须实现的交互

- 正点模式：点击前景点。
- 负点模式：点击背景点。
- 框选模式：拖动矩形框。
- 清空提示。
- 删除最后一个提示。
- 选择候选 mask。

### 后端接口

请求参数：

- `points`: `[[x, y], ...]`
- `labels`: `[1, 0, ...]`
- `box`: `[x1, y1, x2, y2]`
- `multimask`: `true/false`

返回：

- 输入图。
- prompt overlay。
- image encoder 摘要。
- prompt encoder 摘要。
- candidate masks。
- IoU scores。
- best mask。
- overlay。

### 动画设计

1. 用户点击点或拖框。
2. 提示点变成 prompt token。
3. 候选 mask 从提示附近扩张。
4. 三个候选 mask 并排展示。
5. 用户点击候选 mask 切换最终结果。

### 教学重点

- 正点告诉模型“我要这个”。
- 负点告诉模型“不要这个”。
- 框选给模型一个粗略范围。
- SAM 的强大来自“图像编码一次，提示快速解码”。

## 6.3 DETR

### 页面定位

DETR 用 Transformer 把检测变成集合预测，重点是 object query 和匈牙利匹配。

### 交互设计

- 阈值滑块。
- query index 选择。
- “显示全部 query / 只显示高分 query”切换。
- 点击某个 query 框后显示它的类别概率、objectness、attention。

### 后端数据

必须返回：

- 100 个 query 的 class probability。
- no-object probability。
- box 坐标。
- query attention map。
- 最终过滤结果。
- 若有检测结果，返回类别和置信度。

### 动画设计

1. 100 个 query 点排成网格。
2. 每个 query 发出候选框。
3. no-object query 逐渐变灰退场。
4. 高分 query 留下。
5. 选中 query 时 attention 热力图亮起。

### 教学重点

- 传统检测需要很多 anchor 和后处理。
- DETR 用固定 query 直接问图像：“这里有没有一个物体？”
- 匈牙利匹配让训练时预测和真实目标一一对应。

## 6.4 ViT

### 页面定位

ViT 的核心是：把图像切成 patch，再像语言 token 一样交给 Transformer。

### 交互设计

- 点击任意 patch。
- 切换 layer。
- 切换 attention head。
- 切换 CLS token 或 patch token 视角。

### 后端数据

必须返回：

- patch grid。
- token count。
- layer/head attention matrices。
- CLS attention。
- Top-K 分类结果。
- position embedding 相似度。

### 动画设计

1. 图像切成 patch。
2. patch 拉平成 token 序列。
3. 加上位置编码。
4. 点击一个 patch，显示它关注哪些 patch。
5. CLS token 汇聚全局信息，输出分类。

### 教学重点

- CNN 看局部卷积窗口。
- ViT 让 patch 之间直接通过 attention 建立关系。
- 位置编码让 Transformer 知道 patch 的空间位置。

## 6.5 CLIP

### 页面定位

CLIP 的核心是图像和文本进入同一个语义空间。

### 交互设计

- 用户输入候选文本。
- 支持预设文本组：动物、物体、场景、动作。
- 用户可新增一个自定义类别。
- 点击文本项，主舞台显示它与图像的相似度。

### 后端数据

必须返回：

- image embedding 摘要。
- text embeddings 摘要。
- similarity scores。
- text-text similarity matrix。
- softmax probabilities。
- Top-K 结果。

### 动画设计

1. 图片变成一个向量点。
2. 每个文本变成一个向量点。
3. 文本点按相似度靠近或远离图像点。
4. 相似度转成概率条。

### 教学重点

- CLIP 不需要重新训练分类头。
- 类别可以用自然语言表达。
- 概率只在候选文本集合内部有效。

## 6.6 ResNet + Grad-CAM

### 页面定位

ResNet 说明深层网络如何稳定训练，Grad-CAM 说明模型判断时看哪里。

### 交互设计

- 上传图片。
- 展示 Top-5 分类。
- 用户点击任意 Top-K 类别。
- 页面重新展示该类别对应 Grad-CAM。
- 支持原图/热力图透明度滑块。

### 后端数据

必须返回：

- 预处理图。
- 深层 feature map 摘要。
- Top-5 分类。
- 每个 Top-K 类别的 Grad-CAM。
- overlay。

### 动画设计

1. 图像经过 ResNet 残差块。
2. Top-K 类别条形图出现。
3. 选择类别后，梯度从类别分数回传到最后卷积层。
4. 热区逐渐亮起。

### 教学重点

- 残差连接让深层网络更容易训练。
- Grad-CAM 不是证明因果，只是解释线索。
- 不同目标类别会关注不同区域。

## 6.7 GAN

### 页面定位

GAN 是生成器和判别器的对抗训练。教学重点是动态博弈，而不是最终图像有多漂亮。

### 交互设计

- 播放/暂停训练。
- 拖动 epoch/iteration。
- 切换显示：生成样本、判别器决策面、loss 曲线。
- 调整训练轮数后重新运行后端。

### 后端数据

必须返回多个 checkpoint：

- real samples。
- fake samples。
- discriminator surface。
- D loss。
- G loss。
- D(real)、D(fake)。

### 动画设计

1. 初始 fake samples 离真实分布很远。
2. 判别器决策面逐渐形成。
3. 生成器根据判别器梯度移动样本。
4. fake samples 靠近真实分布。
5. loss 曲线同步更新。

### 教学重点

- G 不是直接看真实答案，而是通过 D 的反馈变好。
- D 太强或太弱都会影响训练。
- toy GAN 是真实训练机制，不是高质量图像生成器。

## 6.8 Diffusion

### 页面定位

扩散模型的核心是先学会加噪，再学会去噪。

### 交互设计

- 时间步滑块。
- 播放加噪过程。
- 播放去噪过程。
- 切换显示：图像、噪声、误差图、alpha_bar 曲线。

### 后端数据

必须返回：

- x0。
- epsilon。
- x_t frames。
- alpha_bar curve。
- noise weight curve。
- oracle reconstruction。
- error map。

### 动画设计

1. 清晰图逐步变成噪声。
2. 曲线上当前时间步同步移动。
3. 显示噪声项 epsilon。
4. 用 oracle epsilon 反推 x0_hat。
5. 显示误差图。

### 教学重点

- 真正的模型学习的是噪声预测。
- 本页展示 DDPM 数学机制，不是 Stable Diffusion 采样。
- 扩散比 GAN 稳定，但生成成本通常更高。

## 6.9 NeRF

### 页面定位

NeRF 用一个隐式场表示 3D 场景，通过射线采样和体渲染生成新视角。

### 交互设计

- 视角滑块。
- 选择一条射线。
- 播放射线采样过程。
- 切换显示：采样点、位置编码、密度、颜色累积、深度图。

### 后端数据

必须返回：

- camera pose。
- ray origin/direction。
- sample points。
- positional encoding 摘要。
- sigma。
- rgb。
- weights。
- rendered view。
- depth map。

### 动画设计

1. 相机发出射线。
2. 射线上出现采样点。
3. 每个点查询密度和颜色。
4. 高密度点贡献更大。
5. 颜色沿射线累积成一个像素。
6. 多条射线组成整张图。

### 教学重点

- NeRF 不是显式网格，而是隐式函数。
- 位置编码帮助表示高频细节。
- 体渲染把 3D 信息积分成 2D 图像。

## 6.10 YOLO 机制页

### 页面定位

YOLO 解释单阶段检测范式：一次前向，网格直接预测目标。

### 交互设计

- 调整 grid size。
- 调整 objectness threshold。
- 调整重叠抑制阈值。
- 点击某个 grid cell 查看该 cell 的 objectness 和候选框。

### 动画设计

1. 图像划分网格。
2. 每个 grid cell 计算 objectness。
3. 高分 cell 发出候选框。
4. 重叠框被抑制。
5. 保留最终框。

### 教学重点

- 单阶段检测快，因为它不先生成候选区域再分类。
- 本页是机制实现，不是官方 YOLO 权重。

## 6.11 U-Net 机制页

### 页面定位

U-Net 解释编码器-解码器和跳跃连接如何恢复边界。

### 交互设计

- 调整 mask 阈值。
- 切换“有跳跃连接 / 无跳跃连接”对比。
- 点击某层 feature map 查看尺寸和含义。

### 动画设计

1. 左侧编码器逐层下采样。
2. bottleneck 汇聚上下文。
3. 右侧解码器逐层上采样。
4. skip connection 把浅层边界送回。
5. 输出 probability map 和 mask。

### 教学重点

- 编码器负责语义。
- 解码器负责恢复空间分辨率。
- 跳跃连接负责细节和边界。

## 7. 审美与视觉规范

### 7.1 页面气质

系统应像一个教学实验室，而不是营销落地页：

- 信息清楚。
- 控件密度适中。
- 主舞台宽阔。
- 色彩克制但有层次。
- 动画服务理解，不做装饰噪音。

### 7.2 色彩规范

- 所有页面使用 `iframe-theme.css + theme-sync.js`。
- 不允许浅色背景上出现浅色文字。
- 不允许浅色模式中突兀出现大块深色模块。
- 图像、画布、卡片背景统一使用主题变量。
- 框、mask、attention、curve 使用稳定语义色：
  - 检测框：蓝/绿。
  - mask：青/紫/橙区分实例。
  - attention/Grad-CAM：红黄热区。
  - 错误/低置信度：灰或淡红。

### 7.3 文案规范

每个页面文案遵循：

- 标题讲问题，不讲术语堆叠。
- 每步解释不超过 2 到 3 句。
- 公式只放核心公式。
- 公式后必须用一句话解释变量含义。
- 明确写应用场景和局限。
- 明确写真实模型或本地机制状态。

## 8. 实施顺序

### 第一阶段：主舞台基础设施

1. 改造共享渲染器，支持主舞台、步骤线、右侧讲解、底部控制。
2. 增加 overlay 渲染能力：boxes、masks、points、heatmap、chart。
3. 增加 timeline 播放能力。
4. 增加 click/drag 图像坐标能力。

验收：

- 至少一个页面能用同一套组件播放后端 frames。
- 至少一个页面能点击图像并把坐标发给后端。

### 第二阶段：AI之眼核心页

1. 重做 `detection_segmentation.html` 的主舞台。
2. 加三视角总览。
3. 加任务/模型/阈值/透明度切换。
4. 检测、语义、实例都能展开过程。
5. YOLO/U-Net 机制结果接入同一页面。

验收：

- 同一张图能展示检测、语义、实例三种真实结果。
- 用户调阈值能改变显示。
- 页面能清楚区分真实预训练模型和本地机制实现。

### 第三阶段：SAM 交互页

1. 支持正点、负点、框选。
2. 后端接收 prompt。
3. 返回候选 masks 和 scores。
4. 用户可切换候选 mask。

验收：

- 用户点不同位置会得到不同真实 SAM mask。
- 负点和框选会影响结果。
- 页面不再随机选择交互点。

### 第四阶段：Transformer 与基础模型

1. ViT 做 patch 点击和 attention 查看。
2. DETR 做 query 选择、阈值筛选、attention 查看。
3. CLIP 做候选文本输入和语义空间动画。
4. NeRF 做射线采样和视角滑块。

验收：

- 每页都有至少一种影响真实数据展示的交互。
- 每页都有动画或逐帧过程。

### 第五阶段：生成模型与可解释性

1. GAN 做训练播放器。
2. Diffusion 做时间轴。
3. ResNet/Grad-CAM 做类别切换热力图。

验收：

- GAN 可播放训练变化。
- Diffusion 可拖动时间步。
- Grad-CAM 可切换类别。

### 第六阶段：整体整理

1. 首页只保留正式专题入口。
2. 文档补齐安装、权重、视频讲解路线。
3. 统一主题、颜色、边距、响应式布局。
4. 增加验收测试。

## 9. 测试与验收

### 9.1 后端测试

- 每个正式模块 `/api/demo/<id>` 返回 JSON。
- 预训练模型有权重时返回真实步骤。
- 缺权重时返回可读错误，不 500。
- 本地机制模块必须 `real_model:false`。
- 结构化数据字段完整。

### 9.2 前端测试

- 页面无乱码。
- 页面加载统一主题。
- 明暗主题切换无浅底浅字。
- 上传图片后可运行。
- 交互控件能改变结果或展示。
- 动画可播放、暂停、拖动。
- 移动端不横向溢出。

### 9.3 教学验收

每页用以下问题验收：

1. 零基础观众能否在 30 秒内知道这个算法解决什么问题？
2. 用户能否通过操作理解核心机制？
3. 页面是否展示了真实中间结果？
4. 动画是否解释了过程，而不是装饰？
5. 是否明确说明应用场景和局限？
6. 是否诚实标注真实模型或本地机制？

## 10. 视频展示路线

最终视频建议路线：

1. 从图像基础开始：图像是矩阵，颜色空间和直方图帮助理解像素。
2. 进入传统处理：平滑、Sobel、Canny 说明如何从像素变化找到结构。
3. 进入 AI之眼：同一张图的检测、语义分割、实例分割。
4. 解释深度网络：ResNet 分类和 Grad-CAM 说明模型如何判断。
5. 展示生成模型：GAN 的对抗训练，Diffusion 的加噪去噪。
6. 展示现代基础模型：ViT、DETR、CLIP、SAM、NeRF。
7. 总结：CV 从像素处理、手工特征、深度学习走向多模态和基础模型。

视频中每个重点页只讲一个核心交互：

- AI之眼：三视角对比。
- SAM：点一下分割目标。
- DETR：query 筛选。
- CLIP：改候选文本。
- Diffusion：拖动时间步。
- NeRF：射线采样。

## 11. 最终交付要求映射

| 作业要求 | 系统对应 |
|---|---|
| 通识教育 | 页面按知识链组织，不是算法散点 |
| 越容易理解越高分 | 主舞台、动画、交互、讲课模式 |
| 内容越多越高分 | 保留正式主线中代表性算法 |
| 包括课程作业 | 图像基础、滤波、边缘、传统 CV 保留 |
| 包括检测与分割 | AI之眼重点页覆盖三任务 |
| 视频展示 | 每页设计可按步骤录制 |
| 安装说明 | 权重、依赖、缓存路径写清楚 |
| 保证核心代码原创 | 明确传统算法和机制实现由项目实现；预训练权重标注来源 |

## 12. 一句话标准

以后判断一个页面是否合格，就看这一句：

用户能不能通过亲手操作这个页面，看见真实算法过程如何一步步发生，并且理解为什么输出会变成现在这样。

