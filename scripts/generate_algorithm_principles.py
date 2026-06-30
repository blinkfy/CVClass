from __future__ import annotations

import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app


PHASES = [
    {
        "id": "phase-fundamentals",
        "title": "阶段一 · 基础原语",
        "intro": "这一阶段把图像拆回像素、颜色、亮度、噪声和局部窗口。理解这些原语，后面的边缘、特征、深度网络都不再神秘。",
        "topics": [
            {
                "id": "topic-color-and-contrast",
                "title": "色彩与对比",
                "intro": "先把图像看成数值矩阵：颜色空间决定数值如何表达颜色，灰度和直方图揭示亮度分布，阈值化把连续亮度变成清楚的前景与背景。",
                "kind": "pixel",
                "modules": ["colorspace", "grayscale", "histogram", "threshold", "noise"],
            },
            {
                "id": "topic-filter-and-convolution",
                "title": "滤波与卷积",
                "intro": "卷积和局部邻域是传统视觉与 CNN 的共同语言。高斯、中值、双边、Sobel 和实时滤镜都在回答同一个问题：一个像素应该怎样参考它周围的像素。",
                "kind": "filter",
                "modules": ["convolution", "smoothing", "gaussian", "median", "bilateral", "sobel", "live"],
            },
        ],
    },
    {
        "id": "phase-classical-geometry",
        "title": "阶段二 · 经典结构与几何视觉",
        "intro": "这一阶段从像素走向结构。边缘、角点、局部描述子、区域分割、双目几何和运动估计，让系统开始理解哪里有结构，以及结构之间如何对应。",
        "topics": [
            {
                "id": "topic-edges-to-corners",
                "title": "从边缘到角点",
                "intro": "边缘描述亮度突变，角点描述两个方向同时变化的稳定位置。它们是匹配、跟踪和几何恢复的起点。",
                "kind": "edge",
                "modules": ["edge", "corner", "shitomasi"],
            },
            {
                "id": "topic-descriptors-and-shapes",
                "title": "描述与形状",
                "intro": "局部描述子让图像块可以被重新识别，形态学和 HOG 则把二值形状与梯度方向变成可计算的结构特征。",
                "kind": "descriptor",
                "modules": ["sift", "morphology", "hog_svm"],
            },
            {
                "id": "topic-feature-matching",
                "title": "特征匹配",
                "intro": "把两张图中的局部特征连接起来，再用几何一致性过滤误配，是拼接、定位和三维重建的重要前置步骤。",
                "kind": "match",
                "modules": ["match", "bovw_spm"],
            },
            {
                "id": "topic-classical-segmentation",
                "title": "传统分割",
                "intro": "传统分割通常不依赖大模型，而是利用颜色、距离、图割、超像素或区域生长，把像素组织成更容易理解的区域。",
                "kind": "segmentation",
                "modules": ["kmeans", "watershed", "grabcut", "slic", "ncuts"],
            },
            {
                "id": "topic-motion-depth-frequency",
                "title": "运动、深度与频域",
                "intro": "这一组方法把图像放到时间、空间和频率中理解：光流看运动，双目和标定看三维，频域看变化速度。",
                "kind": "geometry",
                "modules": ["optical_flow", "stereo", "frequency", "calibration", "epipolar", "sfm"],
            },
        ],
    },
    {
        "id": "phase-deep-learning",
        "title": "阶段三 · 深度学习时代",
        "intro": "深度学习让视觉系统从手工规则转向数据驱动。卷积网络学习特征，检测和分割网络直接输出语义结果，生成模型学习数据分布。",
        "topics": [
            {
                "id": "topic-ai-eye",
                "title": "AI 之眼",
                "intro": "同一张图可以用检测框、语义类别图、实例掩膜和单阶段检测网格来理解。这里把视觉理解的几种输出形式放在一起比较。",
                "kind": "deep_vision",
                "modules": ["detection", "semantic", "instance", "yolo", "unet"],
            },
            {
                "id": "topic-cnn-foundations",
                "title": "CNN 基石",
                "intro": "CNN 用卷积层、非线性、池化和全连接层逐级组织视觉信息；残差连接和训练可视化帮助理解深层网络为什么可训练。",
                "kind": "cnn",
                "modules": ["cnn_basics", "lenet", "conv_training", "resnet"],
            },
            {
                "id": "topic-generative-models",
                "title": "生成模型",
                "intro": "GAN 用对抗学习逼近真实分布，扩散模型把生成拆成加噪和去噪两条过程。它们把视觉从识别推进到创造。",
                "kind": "generation",
                "modules": ["gan", "diffusion"],
            },
        ],
    },
    {
        "id": "phase-foundation-models",
        "title": "阶段四 · 前沿基础模型",
        "intro": "前沿模型把 Transformer、多模态对齐、提示分割、可控生成、自监督和三维感知连接起来。重点不只是某个任务，而是能迁移、能交互、能扩展的视觉表征。",
        "topics": [
            {
                "id": "topic-transformer-vision",
                "title": "Transformer 视觉",
                "intro": "图像被切成 token 后，自注意力可以建模全局关系；检测、窗口注意力和开放词汇定位都可以纳入这个框架。",
                "kind": "transformer",
                "modules": ["vit", "swin", "detr", "dino_det", "grdino"],
            },
            {
                "id": "topic-segmentation-multimodal",
                "title": "分割与多模态基础模型",
                "intro": "图像、文字、提示点和掩膜进入同一个系统：CLIP 对齐图文，SAM 接受提示，Mask2Former 统一分割形式，BLIP-2 把视觉接入语言模型。",
                "kind": "multimodal",
                "modules": ["clip", "sam", "sam2", "blip2", "mask2former"],
            },
            {
                "id": "topic-controllable-generation",
                "title": "可控生成",
                "intro": "扩散和风格生成把从噪声到图像的过程变成可学习轨迹；文本、结构条件和流匹配让生成结果更可控。",
                "kind": "frontier_generation",
                "modules": ["ddpm", "stable_diffusion", "controlnet", "dit", "flux", "stylegan"],
            },
            {
                "id": "topic-3d-spatial",
                "title": "三维与空间感知",
                "intro": "三维视觉把多视角、光线、点云和占用场统一起来，让系统从二维图像推回空间结构。",
                "kind": "spatial",
                "modules": ["nerf", "3dgs", "dust3r", "pointnet", "orbslam3", "bev", "occupy"],
            },
            {
                "id": "topic-video-tracking-pose",
                "title": "视频、跟踪与姿态",
                "intro": "视频方法关注时间一致性，跟踪方法维护目标身份，姿态方法把人体变成关键点结构。",
                "kind": "temporal_pose",
                "modules": ["c3d", "bytetrack", "botsort", "deeppose", "openpose", "mediapipe", "vitpose"],
            },
            {
                "id": "topic-self-supervised",
                "title": "自监督表征",
                "intro": "自监督方法不用人工标签，也能通过对比、遮挡重建或教师学生机制学到稳定视觉表征。",
                "kind": "self_supervised",
                "modules": ["dino", "mae", "simclr", "moco", "byol", "ijepa"],
            },
        ],
    },
]


FLOW_BY_KIND = {
    "pixel": ["输入图像", "数值通道", "统计或映射", "可视化结果"],
    "filter": ["输入图像", "局部窗口", "加权或排序", "滤波结果"],
    "edge": ["灰度图", "局部变化", "响应评分", "结构点线"],
    "descriptor": ["局部区域", "结构编码", "特征向量", "匹配或分析"],
    "match": ["两张图像", "描述子比较", "几何验证", "可靠对应"],
    "segmentation": ["输入图像", "相似性建模", "区域优化", "分割结果"],
    "geometry": ["多帧或多视图", "几何约束", "优化估计", "运动或三维结果"],
    "deep_vision": ["输入图像", "深度特征", "任务预测头", "语义结果"],
    "cnn": ["输入张量", "卷积特征", "深层语义", "预测或解释"],
    "generation": ["随机变量", "生成机制", "损失约束", "生成样本"],
    "transformer": ["图像 token", "注意力交互", "任务查询", "预测结果"],
    "multimodal": ["图像与提示", "特征对齐", "融合解码", "文字或掩膜"],
    "frontier_generation": ["噪声或潜变量", "条件控制", "逐步去噪", "生成图像"],
    "spatial": ["图像或点云", "空间表示", "几何查询", "三维结果"],
    "temporal_pose": ["视频帧", "时空特征", "关联或解码", "轨迹或姿态"],
    "self_supervised": ["增强视图", "编码表征", "自监督目标", "可迁移特征"],
}


GENERIC = {
    "pixel": {
        "steps": ["读取图像并统一数值范围。", "选择亮度、颜色或噪声相关的表示。", "执行统计、映射或阈值决策。", "把结果交给后续分割、滤波或可视化页面。"],
        "formulas": [("像素表示", r"x_i=[R_i,G_i,B_i]", "每个像素先被看成一个颜色向量。"), ("通道映射", r"z_i=f(x_i)", "算法把原始颜色转成更适合任务的表示。"), ("输出结果", r"Y_i=g(z_i)", "最终结果可以是亮度、标签或噪声后的像素。")],
    },
    "filter": {
        "steps": ["确定局部窗口或卷积核。", "收集中心像素周围的邻域值。", "根据权重、排序或梯度规则计算新值。", "把新值写回输出图像。"],
        "formulas": [("邻域窗口", r"\mathcal{N}_{p}=\{q\mid q\text{ 在 }p\text{ 周围}\}", "局部算法只看一个小范围。"), ("局部计算", r"I'(p)=\sum_{q\in\mathcal{N}_{p}}w(p,q)I(q)", "线性滤波用邻域加权平均。"), ("权重约束", r"\sum_{q}w(p,q)=1", "归一化能避免整体亮度漂移。")],
    },
    "edge": {
        "steps": ["计算局部亮度变化。", "在窗口内累积或比较变化强度。", "用响应函数找稳定结构。", "通过阈值和局部极值筛选最终点线。"],
        "formulas": [("图像梯度", r"\nabla I=(I_x,I_y)", "梯度表示亮度变化方向。"), ("结构响应", r"R(p)=g(\nabla I,\mathcal{N}_{p})", "响应函数把局部变化压成一个分数。"), ("结构筛选", r"R(p)>T", "高于阈值的位置被保留。")],
    },
    "descriptor": {
        "steps": ["定位局部区域或二值结构。", "提取梯度、形状或集合特征。", "把局部结构编码成向量或修正后的区域。", "用于匹配、检测或后续几何分析。"],
        "formulas": [("局部补丁", r"P_p=I[\mathcal{N}_{p}]", "围绕关键位置截取局部区域。"), ("特征编码", r"d_p=\phi(P_p)", "描述子把局部外观变成向量。"), ("相似比较", r"s(p,q)=\operatorname{sim}(d_p,d_q)", "向量相似度用于匹配或分类。")],
    },
    "match": {
        "steps": ["分别提取两张图的局部特征。", "用描述子距离寻找候选对应。", "用比例检验或视觉词汇过滤不可靠匹配。", "用几何一致性得到可信关系。"],
        "formulas": [("距离度量", r"d(i,j)=\|f_i-g_j\|_2", "描述子越接近，局部区域越相似。"), ("可靠性检验", r"\frac{d_1}{d_2}<\tau", "最近邻必须明显优于次近邻。"), ("几何一致", r"x'\sim Hx", "正确匹配应服从同一个几何模型。")],
    },
    "segmentation": {
        "steps": ["选择像素、区域或图节点作为基本单位。", "计算颜色、位置或边界相似性。", "根据相似性合并或切分区域。", "输出区域标签、边界或掩膜。"],
        "formulas": [("像素表示", r"x_i=[c_i,p_i]", "颜色和位置共同描述一个像素。"), ("区域代价", r"E(Y)=\sum_iD_i(Y_i)+\lambda\sum_{i,j}V_{ij}[Y_i\ne Y_j]", "数据项关心像不像，平滑项关心边界是否合理。"), ("标签输出", r"Y^*=\arg\min_YE(Y)", "选择代价最低的区域划分。")],
    },
    "geometry": {
        "steps": ["从多帧、多视图或频域表示中提取约束。", "建立运动、投影、视差或频率模型。", "通过搜索或优化估计参数。", "输出运动、深度、相机或频域处理结果。"],
        "formulas": [("投影关系", r"x\sim K[R\mid t]X", "三维点通过相机模型投到图像上。"), ("几何误差", r"e_i=\|x_i-\pi(PX_i)\|", "误差越小，几何解释越一致。"), ("优化目标", r"\min\sum_i e_i^2", "用最小化误差估计未知量。")],
    },
    "deep_vision": {
        "steps": ["把图像归一化并送入骨干网络。", "提取多层语义特征。", "用任务头预测类别、框或像素掩膜。", "按阈值、上采样或后处理得到可视化结果。"],
        "formulas": [("特征提取", r"F=\operatorname{Backbone}(I)", "骨干网络把像素变成语义特征。"), ("任务预测", r"Y=\operatorname{Head}(F)", "检测头或分割头输出任务结果。"), ("联合损失", r"\mathcal{L}=\mathcal{L}_{cls}+\mathcal{L}_{loc}+\mathcal{L}_{mask}", "多任务模型常把分类、定位和掩膜损失相加。")],
    },
    "cnn": {
        "steps": ["用卷积层提取局部模式。", "通过非线性和池化增加表达能力与稳健性。", "堆叠多层得到高级语义。", "用分类头、热力图或训练曲线解释结果。"],
        "formulas": [("卷积层", r"H_l=\phi(W_l\ast H_{l-1}+b_l)", "卷积、偏置和非线性形成一层特征。"), ("残差形式", r"H_l=F(H_{l-1})+H_{l-1}", "跳跃连接让信息和梯度更容易通过深层网络。"), ("参数更新", r"\theta\leftarrow\theta-\eta\nabla_\theta\mathcal{L}", "训练通过损失梯度更新参数。")],
    },
    "generation": {
        "steps": ["定义随机噪声或带噪样本。", "用生成器、判别器或去噪网络建模数据分布。", "计算对抗损失或去噪损失。", "逐步得到更像真实数据的样本。"],
        "formulas": [("潜变量", r"z\sim p(z)", "生成从随机潜变量开始。"), ("生成映射", r"\hat{x}=G_\theta(z)", "生成器把随机量变成样本。"), ("优化目标", r"\min_\theta\mathbb{E}[\mathcal{L}(x,\hat{x})]", "训练让生成结果接近数据分布。")],
    },
    "transformer": {
        "steps": ["把图像切成 patch 或候选 token。", "加入位置编码和任务查询。", "用自注意力或交叉注意力交换信息。", "把输出 token 解码成分类、框或区域结果。"],
        "formulas": [("注意力", r"\operatorname{Attn}(Q,K,V)=\operatorname{softmax}\left(\frac{QK^T}{\sqrt{d}}\right)V", "查询根据相似度从键值中取信息。"), ("残差块", r"Z_{l+1}=Z_l+\operatorname{MSA}(Z_l)", "Transformer 通过残差堆叠。"), ("任务输出", r"Y=\operatorname{Decode}(Z_L)", "最终 token 被解码成任务结果。")],
    },
    "multimodal": {
        "steps": ["编码图像、文本或提示。", "把不同模态映射到可比较的特征空间。", "通过相似度、注意力或解码器融合信息。", "输出分类、描述、问答或掩膜。"],
        "formulas": [("图像特征", r"z_I=f_I(I)", "视觉编码器得到图像向量。"), ("文本或提示特征", r"z_T=f_T(T)", "文本或提示编码器得到条件向量。"), ("对齐分数", r"s=\frac{z_I^Tz_T}{\|z_I\|\|z_T\|}", "余弦相似度衡量匹配程度。")],
    },
    "frontier_generation": {
        "steps": ["在像素空间或潜空间定义噪声变量。", "用时间步、文本或结构条件控制去噪。", "预测噪声、速度场或风格调制量。", "迭代采样得到最终图像或可视化过程。"],
        "formulas": [("前向加噪", r"x_t=\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon", "把真实样本逐步变成噪声。"), ("条件去噪", r"\epsilon_\theta(x_t,t,c)", "网络根据时间和条件预测噪声。"), ("采样更新", r"x_{t-1}=\operatorname{step}(x_t,\epsilon_\theta,t)", "一步步从噪声走回图像。")],
    },
    "spatial": {
        "steps": ["从图像、相机位姿或点云构造空间表示。", "估计深度、密度、占用或三维点。", "沿光线、视角或坐标查询空间信息。", "输出新视角、点云、位姿或三维结构。"],
        "formulas": [("空间点投影", r"x\sim K[R\mid t]X", "三维点通过相机模型投影到图像。"), ("射线采样", r"r(s)=o+sd", "从相机出发沿方向 d 采样空间。"), ("空间优化", r"\min\sum_i\|x_i-\pi(P_iX_i)\|^2", "让三维解释和二维观测一致。")],
    },
    "temporal_pose": {
        "steps": ["读取单帧或连续帧。", "提取时空特征、目标框或人体关键点热力图。", "关联相邻帧或解码骨架结构。", "输出动作、轨迹、身份或姿态。"],
        "formulas": [("时序特征", r"F_t=f(I_{t-k:t+k})", "当前结果可参考邻近帧。"), ("关联代价", r"C_{ij}=\lambda d_{box}(i,j)+(1-\lambda)d_{app}(i,j)", "跟踪同时看位置和外观。"), ("关键点解码", r"p_k=\arg\max_{p}H_k(p)", "热力图峰值对应关键点位置。")],
    },
    "self_supervised": {
        "steps": ["从同一图像构造不同视图或遮挡版本。", "用编码器得到表征。", "通过对比、预测或重建建立自监督目标。", "迁移到分类、检测或分割任务。"],
        "formulas": [("表征", r"z=f_\theta(\tilde{x})", "增强后的图像被编码成向量。"), ("对比目标", r"\mathcal{L}=-\log\frac{e^{s(z_i,z_j)/\tau}}{\sum_k e^{s(z_i,z_k)/\tau}}", "正样本拉近，负样本拉远。"), ("重建目标", r"\mathcal{L}=\|x_{mask}-\hat{x}_{mask}\|^2", "遮挡重建逼模型理解结构。")],
    },
}


CUSTOM = {
    "grayscale": ("很多结构算法只关心明暗变化，不需要完整颜色。灰度转换把三通道压成单通道，减少计算量，也让边缘、阈值和直方图更清楚。", "灰度不是简单把 RGB 平均，而是按人眼敏感度做加权。这样得到的亮度图更接近我们看到的明暗层次。"),
    "histogram": ("图像过暗、过亮或对比度太低时，很多细节挤在很窄的亮度范围里。直方图和均衡化用于观察并拉开这种分布。", "直方图像亮度人口统计表。如果大量像素挤在暗部，画面就灰暗；均衡化会把拥挤区间摊开，让细节更明显。"),
    "threshold": ("很多任务需要先把前景和背景分开，例如文字提取、缺陷检测和轮廓分析。阈值化把连续灰度压成二值决策。", "阈值就像一条分界线：比它亮的归前景，比它暗的归背景。Otsu 方法会自动寻找让两类差异最大的分界线。"),
    "convolution": ("很多图像操作都需要查看局部邻域。卷积把看周围像素再加权求和的规则写成统一公式，是滤波和 CNN 的核心。", "卷积核像一个小模板，在整张图上滑动。模板里的权重决定它是在模糊、锐化，还是寻找边缘。"),
    "bilateral": ("普通平滑会跨过边缘做平均，导致边界变糊。双边滤波同时考虑空间距离和颜色相似度，尽量保留边缘。", "它只相信离得近且颜色像的邻居。边缘另一侧虽然近，但颜色差大，权重会被压低。"),
    "edge": ("边缘检测需要在噪声中找到细而连续的结构线。Canny 把平滑、梯度、细化和连接组织成稳定流水线。", "Canny 先降噪，再找梯度，再把粗边缘压成细线，最后用强边缘带着弱边缘连起来。"),
    "corner": ("角点是两个方向都变化明显的位置，比单纯边缘更适合跟踪和匹配。Harris 用结构张量衡量局部变化。", "把一个小窗口往任意方向挪，如果内容都变很多，它就是角点；如果只沿一个方向变，它更像边缘。"),
    "shitomasi": ("Shi-Tomasi 希望选出更适合跟踪的角点。它直接使用结构张量的较小特征值作为质量分数。", "一个点要稳定，两个方向都要有足够变化。只要较小的特征值也大，就说明它不是单纯边缘，而是真角点。"),
    "sift": ("图像缩放、旋转或光照变化后，同一局部区域仍要能被再次找到。SIFT 用尺度空间关键点和梯度描述子解决这个问题。", "SIFT 先在不同模糊程度和不同尺寸下找稳定点，再给每个点指定主方向，最后用周围梯度方向统计成 128 维指纹。"),
    "morphology": ("二值图常有毛刺、小洞或断裂。形态学用结构元素做集合运算，修正区域形状。", "腐蚀让白色区域缩水，膨胀让白色区域扩张；先腐蚀后膨胀是开运算，先膨胀后腐蚀是闭运算。"),
    "optical_flow": ("视频中物体会移动，光流估计相邻帧中每个位置的运动方向和速度。", "短时间内同一个点的亮度近似不变。它在下一帧换了位置，于是空间变化和时间变化可以一起约束运动。"),
    "stereo": ("双目相机从左右图像的位移差估计深度。视差越大，物体通常越近。", "左右眼看到同一物体的位置不同。找到对应点后，横向差值就是视差，结合焦距和基线就能算深度。"),
    "calibration": ("相机把三维点投影成二维像素，会受到焦距、主点和畸变影响。标定用于估计这些参数。", "棋盘格的真实几何已知，图像上的角点也能检测。让投影模型尽量对齐这些点，就能反推出相机参数。"),
    "detection": ("目标检测回答图里有什么、在哪里。它输出类别、置信度和矩形框。", "检测模型先提取图像特征，再在不同位置预测候选框和类别，最后过滤低分或重复框。"),
    "semantic": ("语义分割给每个像素分配类别，但不区分同类中的不同个体。", "它像给整张图铺一张类别地图：道路、天空、人、车各自有颜色。"),
    "instance": ("实例分割不仅要知道像素类别，还要把同类物体一个个分开。", "语义分割说这里都是人，实例分割还要说明这是第一个人、第二个人。"),
    "yolo": ("YOLO 追求快速检测，把整张图一次性划成网格并直接预测框和类别。", "它不像两阶段检测先找候选区域，而是每个网格同时猜这里有没有物体和框在哪里。"),
    "unet": ("U-Net 在像素级分割中兼顾全局语义和边界细节。", "编码器看懂整体，解码器恢复尺寸，跳跃连接把早期细节送回后面，边界就不容易丢。"),
    "resnet": ("深层网络容易退化和梯度传播困难。ResNet 用残差连接让信息跨层直达。", "残差块不强迫每层重新学习完整变换，而是学习还需要补什么。"),
    "gan": ("GAN 通过生成器和判别器博弈，让生成器学会产生接近真实分布的样本。", "生成器负责造样本，判别器负责分辨真假。双方一起进步，生成样本会越来越像真实数据。"),
    "diffusion": ("扩散模型把生成拆成前向加噪和反向去噪，训练目标稳定，生成多样性好。", "先学会怎样把清晰图逐步变成噪声，再训练网络反过来一步步把噪声擦掉。"),
    "vit": ("ViT 探索不用卷积处理图像，把图片切成 patch token 后交给 Transformer。", "它把图像块当成词，位置编码说明每块在哪里，自注意力决定哪些图像块互相参考。"),
    "detr": ("DETR 把检测改成集合预测，减少手工候选框和重复框后处理。", "一组 object query 像一组提问者，每个 query 负责找一个可能的目标。"),
    "clip": ("CLIP 把图像和文本放进同一向量空间，让自然语言可以检索和分类图像。", "正确的图文对应该相互靠近，不匹配的图文对应该远离。"),
    "sam": ("SAM 把分割变成提示驱动任务，点、框或粗略提示都能引导模型输出掩膜。", "图像编码器先理解整张图，提示编码器说明用户关心哪里，掩膜解码器给出对应区域。"),
    "stable_diffusion": ("Stable Diffusion 在潜空间中去噪生成图像，用文本条件控制内容，计算量比像素空间更低。", "先把图像压缩到潜变量空间，再用文本引导去噪，最后由解码器还原成图像。"),
    "nerf": ("NeRF 用连续函数表示三维场景，从任意视角沿光线采样并渲染新图像。", "给定空间位置和观察方向，网络回答这里的颜色和密度；沿光线累积就得到像素颜色。"),
}


SPECIFIC_FORMULAS = {
    "grayscale": [("感知加权", r"I(x,y)=0.299R(x,y)+0.587G(x,y)+0.114B(x,y)", "绿色权重最大，因为人眼对绿色亮度更敏感。"), ("平均法对照", r"I_{avg}(x,y)=\frac{R+G+B}{3}", "平均法简单，但感知效果通常不如加权法。"), ("输出范围", r"I(x,y)\in[0,255]", "灰度结果仍然是可显示的像素值。")],
    "histogram": [("亮度统计", r"h(k)=\sum_{x,y}\mathbf{1}(I(x,y)=k)", "统计亮度为 k 的像素数量。"), ("累计分布", r"C(k)=\frac{1}{N}\sum_{i=0}^{k}h(i)", "表示亮度不超过 k 的像素比例。"), ("均衡化映射", r"I'=\operatorname{round}((L-1)C(I))", "把旧亮度映射到更充分的动态范围。")],
    "threshold": [("二值决策", r"B(x,y)=\begin{cases}1,&I(x,y)\ge T\\0,&I(x,y)<T\end{cases}", "T 是前景和背景的分界。"), ("类间方差", r"\sigma_b^2(T)=\omega_0\omega_1(\mu_0-\mu_1)^2", "Otsu 选择让两类均值分得最开的阈值。"), ("最优阈值", r"T^*=\arg\max_T\sigma_b^2(T)", "遍历候选阈值即可得到自动阈值。")],
    "convolution": [("二维卷积", r"O(x,y)=\sum_i\sum_jK(i,j)I(x-i,y-j)", "输出像素来自邻域加权和。"), ("归一化核", r"\sum_{i,j}K(i,j)=1", "平滑类卷积常让权重和为 1。"), ("整图运算", r"O=K\ast I", "同一个卷积核作用到整张图。")],
    "edge": [("平滑后求梯度", r"M=\|\nabla(G_\sigma\ast I)\|", "先平滑再求变化强度。"), ("非极大值抑制", r"M(p)\ge M(p_+),\quad M(p)\ge M(p_-)", "只保留梯度方向上的局部峰值。"), ("双阈值连接", r"E=E_{strong}\cup\operatorname{connected}(E_{weak},E_{strong})", "弱边缘必须连接到强边缘才保留。")],
    "corner": [("结构张量", r"M=\sum_W\begin{bmatrix}I_x^2&I_xI_y\\I_xI_y&I_y^2\end{bmatrix}", "矩阵记录两个方向的变化。"), ("Harris 响应", r"R=\det(M)-k\operatorname{trace}(M)^2", "两个特征值都大时响应高。"), ("角点选择", r"R(p)>T", "阈值过滤低响应位置。")],
    "shitomasi": [("特征值", r"\lambda_1,\lambda_2=\operatorname{eig}(M)", "特征值描述两个主方向变化。"), ("质量分数", r"R=\min(\lambda_1,\lambda_2)", "较小值也大才算稳定。"), ("筛选", r"R(p)>T", "低质量点被排除。")],
    "sift": [("尺度空间", r"L(x,y,\sigma)=G(x,y,\sigma)\ast I(x,y)", "不同 σ 表示不同观察尺度。"), ("高斯差分", r"D(x,y,\sigma)=L(x,y,k\sigma)-L(x,y,\sigma)", "高斯差分用于寻找尺度极值。"), ("描述子", r"d=\operatorname{hist}(\nabla L,\theta)", "用局部梯度方向直方图编码形状。")],
    "gan": [("对抗目标", r"\min_G\max_D\mathbb{E}_{x}[\log D(x)]+\mathbb{E}_{z}[\log(1-D(G(z)))]", "判别器分真假，生成器骗过判别器。"), ("生成样本", r"\hat{x}=G(z)", "随机变量被映射成样本。"), ("判别分数", r"s=D(x)", "分数表示真实概率。")],
}


CATEGORY_LABELS = {
    "pretrained_model": "真实预训练模型",
    "local_mechanism": "本地机制实现",
    "numpy_algorithm": "本地 NumPy 算法",
    "local_algorithm": "本地确定性算法",
    "requires_external_weights": "需要外部权重",
    "teaching_simulation": "离线教学演示",
}


def visible_modules():
    app = create_app()
    with app.test_client() as client:
        payload = client.get("/api/modules").get_json()
    return {mod["id"]: mod for phase in payload["phases"] for mod in phase["modules"]}


def validate_coverage(modules):
    visible = set(modules)
    assigned = [mid for phase in PHASES for topic in phase["topics"] for mid in topic["modules"]]
    missing = sorted(visible - set(assigned))
    extra = sorted(set(assigned) - visible)
    duplicate = sorted({mid for mid in assigned if assigned.count(mid) > 1})
    if missing or extra or duplicate:
        raise SystemExit(f"文档覆盖错误: missing={missing}, extra={extra}, duplicate={duplicate}")


def mermaid_for(module, kind):
    labels = FLOW_BY_KIND[kind]
    title = module["name"].replace('"', "'")
    return "\n".join(
        [
            "```mermaid",
            "flowchart LR",
            f'  A["{labels[0]}"]',
            f'  B["{labels[1]}"]',
            f'  C["{labels[2]}"]',
            f'  D["{labels[3]}"]',
            "  A --> B --> C --> D",
            f'  C -. "{title}" .-> D',
            "```",
        ]
    )


def spec_for(module, kind):
    mid = module["id"]
    generic = GENERIC[kind]
    problem, simple = CUSTOM.get(
        mid,
        (
            module.get("description") or f"{module['name']}用于把图像中的关键信息转成可计算结果。",
            f"{module['name']}的核心是先把输入图像转成合适的中间表示，再用明确规则或模型得到结果。直观理解时，可以把它看成输入、表示、约束、输出四步。",
        ),
    )
    return {
        "problem": problem,
        "simple": simple,
        "steps": generic["steps"],
        "formulas": SPECIFIC_FORMULAS.get(mid, generic["formulas"]),
    }


def implementation_lines(module):
    impl = module.get("implementation") or {}
    category = CATEGORY_LABELS.get(impl.get("category"), "本地教学实现")
    backend = impl.get("backend") or "项目本地后端"
    model = impl.get("model") or "无单独外部模型"
    page = module.get("page") or "共享教学页"
    real = "是" if impl.get("real_model") else "否"
    upload = "是" if impl.get("requires_upload") else "否"
    note = "页面展示真实模型输出；依赖或权重缺失时，需要明确提示不可用原因。" if impl.get("real_model") else "页面展示可复现的本地计算或机制可视化，重点是把关键中间量讲清楚。"
    return [
        f"模块标识：`{module['id']}`。",
        f"前端页面：`{page}`；演示接口：`/api/demo/{module['id']}`。",
        f"实现口径：{category}；计算后端：`{backend}`；模型或机制：`{model}`。",
        f"是否调用真实预训练权重：{real}；是否通常需要上传图片：{upload}。",
        note,
    ]


def write_algorithm(lines, module, kind):
    spec = spec_for(module, kind)
    mid = module["id"]
    lines.extend(
        [
            f"#### {module['name']} {{#algo-{mid}}}",
            "",
            "模块信息",
            "",
        ]
    )
    for item in implementation_lines(module):
        lines.append(f"- {item}")
    lines.extend(["", "解决的问题", "", spec["problem"], "", "浅显但严谨的解释", "", spec["simple"], "", "分步骤流程", ""])
    for index, step in enumerate(spec["steps"], 1):
        lines.append(f"{index}. {step}")
    lines.extend(["", "中文 Mermaid 架构图", "", mermaid_for(module, kind), "", "公式逐步推导", ""])
    for index, (label, formula, explain) in enumerate(spec["formulas"], 1):
        lines.extend([f"{index}. {label}。", "", r"\[", formula, r"\]", "", f"   {explain}", ""])
    lines.extend(
        [
            "项目实现对应关系",
            "",
            f"- 本项目在该章节展示 `{mid}` 的核心输入、关键中间量和输出结果。",
            "- 如果页面使用共享教学框架，算法身份由模块标识传入，文档锚点仍保持一一对应。",
            "- 文档中的公式用于解释计算逻辑；页面中的可视化用于把这些中间量落到真实图像或本地演示数据上。",
            "",
        ]
    )


def build_markdown(modules):
    lines = [
        "# 计算机视觉算法原理详解",
        "",
        "这份文档按主页的学习路径组织：先理解像素和卷积，再进入经典结构与几何视觉，然后学习深度网络，最后看基础模型与前沿感知。每个算法章节都保留稳定锚点，算法关系图可以直接跳到对应章节。",
        "",
        "阅读方式",
        "",
        "- 先看“解决的问题”，明确算法为什么存在。",
        "- 再看“浅显但严谨的解释”和“分步骤流程”，建立直觉。",
        "- 最后看 Mermaid 架构图、公式推导和项目实现对应关系，把直觉落到计算和代码页面。",
        "",
    ]
    for phase in PHASES:
        lines.extend([f"## {phase['title']} {{#{phase['id']}}}", "", phase["intro"], ""])
        for topic in phase["topics"]:
            lines.extend([f"### {topic['title']} {{#{topic['id']}}}", "", topic["intro"], ""])
            for mid in topic["modules"]:
                write_algorithm(lines, modules[mid], topic["kind"])
    return "\n".join(lines).rstrip() + "\n"


def validate_markdown(text, visible_count):
    forbidden = [
        "**",
        "or a shared static page",
        "local small algorithm implementation",
        "Computer Vision Notes",
        "This page shows",
        "not pretrained-weight inference",
        "Frame memory",
        "Patch partition",
        "Input",
        "Output",
    ]
    for phrase in forbidden:
        if phrase in text:
            raise SystemExit(f"文档仍包含不应出现的内容: {phrase}")
    anchors = re.findall(r"\{#algo-[^}]+\}", text)
    if len(anchors) != visible_count or len(set(anchors)) != visible_count:
        raise SystemExit("算法锚点数量不正确")
    if text.count("```mermaid") != visible_count:
        raise SystemExit("Mermaid 图数量不正确")
    if "## 阶段一 · 基础原语 {#phase-fundamentals}" not in text:
        raise SystemExit("缺少阶段标题")


def main():
    modules = visible_modules()
    validate_coverage(modules)
    text = build_markdown(modules)
    validate_markdown(text, len(modules))
    Path("docs/算法原理详解.md").write_text(text, encoding="utf-8", newline="\n")
    print(f"写入 docs/算法原理详解.md，算法章节 {len(modules)} 个。")


if __name__ == "__main__":
    main()
