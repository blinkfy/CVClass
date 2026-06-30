(function() {
  const common = {
    uploadHint: '上传一张图片后，页面会调用当前项目中的 NumPy 实现，并把中间结果逐步展开。',
  };

  const implementationMeta = {
    gan: { status: '真实本地机制实现', category: 'local_mechanism', localInference: true, realModel: false, model: 'NumPy tiny GAN training' },
    diffusion: { status: '真实本地机制实现', category: 'local_mechanism', localInference: true, realModel: false, model: 'NumPy DDPM equations' },
    detection: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'fasterrcnn_resnet50_fpn' },
    semantic: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'fcn_resnet50' },
    instance: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'maskrcnn_resnet50_fpn' },
    yolo: { status: '真实本地机制实现', category: 'local_mechanism', localInference: true, realModel: false, requiresUpload: true, model: 'YOLO-style NumPy grid detector' },
    unet: { status: '真实本地机制实现', category: 'local_mechanism', localInference: true, realModel: false, requiresUpload: true, model: 'U-Net-style NumPy encoder-decoder' },
    vit: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'google/vit-base-patch16-224' },
    detr: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'facebook/detr-resnet-50' },
    sam: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'SAM ViT-B checkpoint' },
    clip: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'openai/clip-vit-base-patch32' },
    stable_diffusion: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'runwayml/stable-diffusion-v1-5' },
    sd: { status: '真实预训练模型', category: 'pretrained_model', localInference: true, realModel: true, model: 'runwayml/stable-diffusion-v1-5' },
    nerf: { status: '真实本地机制实现', category: 'local_mechanism', localInference: true, realModel: false, model: 'NumPy volume rendering' },
    shitomasi: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, model: 'NumPy Shi-Tomasi' },
    ncuts: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, model: 'NumPy Normalized Cuts' },
    bovw_spm: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, model: 'NumPy BoVW+SPM' },
    calibration: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, model: 'NumPy Zhang Calibration' },
    epipolar: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, model: 'NumPy Epipolar Geometry' },
    sfm: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, model: 'NumPy SfM' }
  };

  const localTeachingWeightIds = new Set([
    'stable_diffusion','sd'
  ]);

  const localFrontierAlgorithmIds = new Set([
    'swin','dino','mae','dino_det','grdino','mask2former','sam2','blip2',
    'controlnet','dit','flux','stylegan','dust3r','orbslam3','mediapipe','vitpose'
  ]);

  const externalWeightIds = new Set([]);

  const offlineTeachingIds = new Set([]);  // 已废弃——所有模块均有真实实现

  function attachImplementation(id, cfg) {
    let meta = implementationMeta[id] || cfg.implementation;
    if (localTeachingWeightIds.has(id) || localFrontierAlgorithmIds.has(id)) {
      meta = {
        status: '本地确定性教学可视化',
        category: 'numpy_algorithm',
        localInference: true,
        realModel: false,
        requiresUpload: false,
        model: 'NumPy/PIL local teaching pipeline',
        note: '展示算法机制和中间结果，不代表下载后的预训练权重推理。'
      };
      cfg.endpoint = cfg.endpoint || ('/api/demo/' + (id === 'sd' ? 'stable_diffusion' : id));
      if (localFrontierAlgorithmIds.has(id)) {
        meta.status = 'local small algorithm implementation';
        meta.model = 'NumPy/PIL local mechanism pipeline';
        meta.note = 'Local small algorithm implementation; not pretrained-weight inference.';
      }
    } else
    if (externalWeightIds.has(id)) {
      meta = {
        status: '需要外部权重',
        category: 'requires_external_weights',
        localInference: false,
        realModel: true,
        model: (meta && meta.model) || '',
        note: '该算法需要本地预训练权重或远程模型，本轮离线模式暂不运行。'
      };
    } else if (offlineTeachingIds.has(id)) {
      meta = {
        status: '离线教学演示',
        category: 'teaching_simulation',
        localInference: true,
        realModel: false,
        model: 'NumPy/PIL offline teaching demo',
        note: '本地教学可视化，不代表真实预训练模型推理。'
      };
      cfg.endpoint = cfg.endpoint || ('/api/demo/' + id);
    }
    if (meta) {
      cfg.implementation = meta;
      cfg.status = meta.status || cfg.status;
      cfg.metrics = Object.assign({
        '实现状态': meta.status || '',
        '模型/后端': meta.model || meta.backend || '',
        '真实预训练模型': meta.realModel ? '是' : '否'
      }, cfg.metrics || {});
    }
    return cfg;
  }

  window.AlgorithmContent = {
    colorspace: {
      phase: '阶段一 · 基础原语',
      title: '色彩空间转换',
      english: 'RGB / HSV / Lab / CMYK',
      tagline: '同一张图像可以从不同语义坐标系观察：RGB 看显示器发光，HSV 看人类调色，Lab 看感知均匀性，灰度只保留亮度。',
      status: '语义科普讲解',
      difficulty: '入门',
      endpoint: '/api/demo/colorspace',
      implementation: { status: 'local color-space algorithm', category: 'local_algorithm', localInference: true, realModel: false, requiresUpload: true, model: 'NumPy RGB/HSV/Lab/CMYK conversion' },
      formula: 'RGB \\rightarrow HSV,\\quad RGB \\rightarrow Lab,\\quad RGB \\rightarrow CMYK',
      principles: [
        '色彩空间不是改变图像内容，而是改变描述颜色的坐标系。不同算法关心的语义不同，所以会选择不同空间。',
        'RGB 适合显示和通道计算；HSV 适合按色相、饱和度、明度做交互调色；Lab 更接近人眼感知距离；灰度则为阈值、梯度和形状分析压缩掉颜色。'
      ],
      core: [
        ['输入', 'RGB 彩色图像'],
        ['核心问题', '同一颜色应该用“发光通道、调色属性、感知距离还是亮度”来描述'],
        ['输出', 'RGB、HSV、Lab、灰度四种语义视角']
      ],
      pipeline: [
        ['RGB', '把颜色拆成红、绿、蓝三个显示通道，最接近屏幕如何发光。'],
        ['HSV', '把颜色拆成色相 H、饱和度 S、明度 V，最接近“选颜色”的直觉。'],
        ['Lab', '把颜色拆成亮度 L 与两条对立色轴 a/b，颜色距离更接近人眼感受。'],
        ['灰度', '把 RGB 压缩成一个亮度通道，放弃颜色，只保留结构和明暗。']
      ],
      conceptSteps: [
        { id: 'rgb_mode', name: 'RGB：屏幕发光模型', explanation: '红、绿、蓝三个通道相加生成颜色，适合显示、滤波和通道级处理。', formula: '[R,G,B]' },
        { id: 'hsv_mode', name: 'HSV：调色盘模型', explanation: 'H 表示颜色种类，S 表示颜色纯不纯，V 表示亮不亮，适合颜色筛选和交互调参。', formula: '[H,S,V]' },
        { id: 'lab_mode', name: 'Lab：感知距离模型', explanation: 'L 是亮度，a 是绿到红，b 是蓝到黄；两个颜色在 Lab 中距离近，通常人眼也觉得接近。', formula: '[L,a,b]' },
        { id: 'gray_mode', name: '灰度：结构亮度模型', explanation: '把颜色压成一个亮度值，方便阈值、边缘、角点等基础视觉算法使用。', formula: 'Y=0.299R+0.587G+0.114B' }
      ],
      visualStory: {
        intro: '同一批像素，换一个坐标系，就会突出完全不同的语义。',
        cards: [
          {
            type: 'mix',
            title: 'RGB：红绿蓝三束光',
            text: 'RGB 直接描述屏幕发光强度。算法看到的是三个颜色通道，各自可以滤波、卷积或统计。',
            labels: ['R', 'G', 'B']
          },
          {
            type: 'gradientSet',
            title: 'HSV：更像调色盘',
            text: '色相决定“是什么颜色”，饱和度决定“颜色纯不纯”，明度决定“亮不亮”。',
            rows: [
              { label: 'H', caption: '色相环', gradient: 'linear-gradient(90deg,#ef4444,#f97316,#facc15,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ef4444)' },
              { label: 'S', caption: '纯度', gradient: 'linear-gradient(90deg,#dbeafe,#60a5fa,#2563eb)' },
              { label: 'V', caption: '明度', gradient: 'linear-gradient(90deg,#020617,#2563eb,#f8fafc)' }
            ]
          },
          {
            type: 'gradientSet',
            title: 'Lab：更接近人眼距离',
            text: 'L 表示明暗，a/b 表示两组对立颜色。做颜色差异、聚类和校正时，Lab 往往比 RGB 更符合感知。',
            rows: [
              { label: 'L', caption: '黑↔白', gradient: 'linear-gradient(90deg,#020617,#64748b,#f8fafc)' },
              { label: 'a', caption: '绿↔红', gradient: 'linear-gradient(90deg,#22c55e,#f8fafc,#ef4444)' },
              { label: 'b', caption: '蓝↔黄', gradient: 'linear-gradient(90deg,#2563eb,#f8fafc,#facc15)' }
            ]
          },
          {
            type: 'gradientSet',
            title: '灰度：只留下结构',
            text: '灰度把颜色变成亮度，牺牲色彩，换来更简单稳定的形状、边缘和纹理分析入口。',
            rows: [
              { label: 'Y', caption: '亮度轴', gradient: 'linear-gradient(90deg,#020617,#1e293b,#64748b,#cbd5e1,#ffffff)' },
              { label: 'R', caption: '0.299', gradient: 'linear-gradient(90deg,#020617,#ef4444)' },
              { label: 'G', caption: '0.587', gradient: 'linear-gradient(90deg,#020617,#22c55e)' },
              { label: 'B', caption: '0.114', gradient: 'linear-gradient(90deg,#020617,#3b82f6)' }
            ]
          }
        ]
      },
      metrics: {
        '展示类型': '四种色彩空间语义对比',
        '本地推理': '讲解模式',
        '覆盖模式': 'RGB / HSV / Lab / CMYK'
      }
    },
    grayscale: {
      phase: '阶段一 · 基础原语',
      title: '灰度转换',
      english: 'Grayscale Conversion',
      tagline: '把 RGB 三个通道压缩成一个亮度通道，是后续阈值、梯度、角点和特征检测的共同入口。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/grayscale',
      formula: 'Y = 0.299R + 0.587G + 0.114B',
      principles: [
        '灰度图不是简单地丢掉颜色，而是把颜色转成“亮度”。人眼对绿色最敏感，对蓝色较不敏感，所以加权灰度通常比三通道平均更接近视觉感受。',
        '灰度转换会减少数据维度，让很多只依赖亮度变化的算法更稳定、更快。'
      ],
      core: [
        ['输入', 'RGB 或 RGBA 图像'],
        ['核心问题', '如何用一个数表示一个像素的亮度'],
        ['输出', '单通道 0-255 灰度图']
      ],
      pipeline: [
        ['读取图像', '去掉 alpha 通道并转成 uint8。'],
        ['分离通道', '取出 R/G/B 三个亮度来源。'],
        ['亮度加权', '用感知权重合成灰度。'],
        ['结果解释', '黑色代表低亮度，白色代表高亮度。']
      ],
      stepMeta: {
        original: ['原图', '保留输入图像的颜色信息。', 'I(x,y)=[R,G,B]'],
        channels: ['通道分离', '观察 R/G/B 对亮度贡献的差异。', 'R,G,B'],
        formula: ['公式应用', '按选定方案把三通道合成为一个通道。', 'Y=w_rR+w_gG+w_bB'],
        result: ['灰度结果', '后续多数基础算法从这张图开始。', 'Y∈[0,255]']
      }
    },
    histogram: {
      phase: '阶段一 · 基础原语',
      title: '直方图与均衡化',
      english: 'Histogram & Equalization',
      tagline: '统计每个亮度值出现多少次，用分布而不是单个像素理解图像的曝光、对比度和动态范围。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/histogram',
      formula: 'h(k)=\\sum_{x,y} [I(x,y)=k],\\quad CDF(k)=\\sum_{i=0}^{k} h(i)',
      principles: [
        '直方图把空间位置暂时放下，只看亮度分布。峰值集中在左侧通常偏暗，集中在右侧通常偏亮，分布很窄说明对比度较低。',
        '均衡化用累计分布函数重新映射亮度，让可用灰度范围更充分。'
      ],
      core: [
        ['输入', '灰度亮度值'],
        ['核心问题', '亮度是否集中、偏暗或偏亮'],
        ['输出', '直方图、CDF 和增强后的图像']
      ],
      pipeline: [
        ['灰度化', '把颜色统一成亮度统计。'],
        ['计数', '统计 0-255 每个亮度出现次数。'],
        ['累计分布', '计算 CDF，观察亮度覆盖范围。'],
        ['均衡化', '用 CDF 重新分配亮度。']
      ],
      stepMeta: {
        original: ['原图', '统计开始前的输入。', 'I'],
        gray: ['灰度图', '只保留亮度。', 'Y'],
        histogram: ['亮度直方图', '展示每个亮度桶的像素数。', 'h(k)'],
        cdf: ['累计分布', '显示小于等于 k 的像素比例。', 'CDF(k)'],
        equalized: ['均衡化结果', '增强局部和整体对比度。', 'T(k)=round(255·CDF(k))']
      }
    },
    threshold: {
      phase: '阶段一 · 基础原语',
      title: '阈值化',
      english: 'Thresholding',
      tagline: '用一个或一组阈值把灰度图切成前景和背景，是最朴素也最常用的分割思想。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/threshold',
      formula: 'B(x,y)=255\\;if\\;I(x,y)\\ge T,\\;else\\;0',
      principles: [
        '全局阈值假设整张图的前景和背景可以用同一条亮度线分开。Otsu 自动寻找让类间方差最大的阈值。',
        '自适应阈值改用局部窗口均值，适合光照不均的文档、显微图和阴影场景。'
      ],
      controls: [
        { name: 'method', label: '方法', type: 'select', value: 'otsu', options: [['otsu','Otsu 自动阈值'], ['global','全局阈值'], ['adaptive','自适应均值']] },
        { name: 'threshold', label: '全局阈值', type: 'range', min: 0, max: 255, step: 1, value: 128 },
        { name: 'block_size', label: '局部窗口', type: 'range', min: 3, max: 31, step: 2, value: 11 },
        { name: 'C', label: '偏移 C', type: 'range', min: -10, max: 10, step: 1, value: 2 }
      ],
      core: [
        ['输入', '灰度图和阈值策略'],
        ['核心问题', '前景和背景能否按亮度分开'],
        ['输出', '黑白二值图']
      ],
      pipeline: [
        ['灰度化', '把颜色空间压缩为亮度。'],
        ['分析分布', '查看直方图中前景/背景是否分离。'],
        ['确定阈值', '手动、Otsu 或局部均值。'],
        ['二值化', '输出可供形态学和轮廓使用的黑白图。']
      ],
      stepMeta: {
        original: ['原图', '待分割输入。', 'I'],
        gray: ['灰度图', '阈值化基于亮度。', 'Y'],
        histogram: ['阈值位置', '红线显示当前阈值或默认参考。', 'h(k),T'],
        thr64: ['阈值 64', '低阈值会保留更多前景。', 'T=64'],
        thr128: ['阈值 128', '中间阈值的基础效果。', 'T=128'],
        thr192: ['阈值 192', '高阈值只保留很亮区域。', 'T=192'],
        otsu: ['Otsu 结果', '自动寻找类间方差最大的阈值。', '\\max \\sigma_b^2'],
        adaptive: ['自适应结果', '每个像素使用局部阈值。', 'T=mean(\\Omega)-C'],
        result: ['二值化结果', '白色为前景，黑色为背景。', 'B']
      }
    },
    noise: {
      phase: '阶段一 · 基础原语',
      title: '噪声模型',
      english: 'Noise Models',
      tagline: '先理解噪声如何破坏图像，才知道为什么需要滤波、平滑和鲁棒特征。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/noise',
      formula: 'I_{noisy}=I+n,\\quad n\\sim\\mathcal{N}(0,\\sigma^2)',
      principles: [
        '高斯噪声像连续的亮度抖动，通常来自传感器和电子信号。',
        '椒盐噪声会把少量像素直接变成黑点或白点，中值滤波通常比线性滤波更适合处理它。'
      ],
      core: [['输入', '原始图像'], ['核心问题', '噪声分布如何影响像素'], ['输出', '带噪图像对比']],
      pipeline: [['读取图像', '得到原图像素。'], ['随机采样', '根据噪声分布生成扰动。'], ['叠加噪声', '改变部分或全部像素。'], ['观察退化', '为后续滤波建立直觉。']],
      stepMeta: {
        original: ['原图', '干净输入。', 'I'],
        salt_pepper: ['椒盐噪声', '随机像素变成 0 或 255。', 'p(I=0/255)=amount'],
        gaussian_noise: ['高斯噪声', '每个像素叠加正态扰动。', 'I+n']
      }
    },
    smoothing: {
      phase: '阶段一 · 基础原语',
      title: '平滑与去噪',
      english: 'Gaussian / Median / Bilateral',
      tagline: '把高斯平滑、中值滤波和双边滤波放在同一个专题里比较：同一张图、不同噪声、不同滤波器，观察过程和取舍。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/smoothing',
      formula: "Gaussian: I'=G*I; Median: I'=median(Omega); Bilateral: I'_p=sum_q G_s G_r I_q / W_p",
      principles: [
        '平滑/去噪不是一个固定动作，而是根据噪声模型选择邻域内哪些像素可信。',
        '高斯平滑按空间距离做线性加权，适合连续颗粒但会软化边缘；中值滤波按排序排除极端坏点，适合椒盐噪声；双边滤波同时考虑空间距离和颜色相似度，适合保边去噪。'
      ],
      core: [['输入', '同一张原图和构造出的噪声场景'], ['核心问题', '邻域内哪些像素应该参与重算中心像素'], ['输出', '三种滤波器的步骤、结果和对比指标']],
      pipeline: [['构造噪声', '生成高斯噪声和椒盐噪声，建立适用场景。'], ['高斯平滑', '显示高斯核、局部窗口和加权求和结果。'], ['中值滤波', '显示 3x3 窗口、排序数组和中位数替换。'], ['双边滤波', '显示空间核、颜色核和组合权重如何保边。'], ['统一对比', '比较平滑强度、边缘保留、计算代价和局限。']],
      applications: ['相机/扫描图像预处理', 'Canny 和 SIFT 前置降噪', '椒盐坏点修复', '人像或物体边缘保留', '分割前保边平滑'],
      visualStory: { intro: '三种滤波器的差别，在于它们如何判断邻居是否可信。', cards: [
        { type: 'cardAnim', anim: 'gaussian', title: '高斯：滑窗加权平均', text: '中心权重大，远处权重小；连续颗粒会被抹平，但边缘也会变软。', caption: 'distance weighted average' },
        { type: 'window', title: '中值：排序排除极端值', text: '椒盐噪声通常是局部极端值，排序后自然落在两端，中位数来自更可信的邻域。', values: [34, 36, 255, 38, 40, 41, 42, 43, 44] },
        { type: 'bilateral', title: '双边：距离近且颜色像', text: '跨边缘像素虽然离得近，但颜色差异大，所以范围核会降低它的贡献。' },
        { type: 'bars', title: '不同噪声对应不同滤波器', text: '先判断噪声，再选滤波器，而不是把所有图都交给同一种平滑。', items: [
          { label: 'Gaussian', value: 70, caption: '连续噪声', color: '#3b82f6' },
          { label: 'Median', value: 86, caption: '椒盐坏点', color: '#f59e0b' },
          { label: 'Bilateral', value: 78, caption: '保边', color: '#22c55e' }
        ] }
      ] },
      stepMeta: {
        gaussian_kernel: ['高斯核', '按距离分配归一化权重。', 'G(x,y)'],
        median_sort: ['排序取中值', '把窗口值排序后选择中间值。', 'median(Omega)'],
        bilateral_combined_weights: ['双边组合权重', '空间核和颜色核相乘后归一化。', 'G_s G_r / W_p'],
        comparison: ['同图对比', '比较三种滤波器的适用噪声和视觉效果。', 'choose filter by noise']
      }
    },
    gaussian: {
      phase: '阶段一 · 基础原语',
      title: '高斯模糊',
      english: 'Gaussian Blur',
      tagline: '已合并到“平滑与去噪”统一专题：作为三种滤波器之一，与中值滤波和双边滤波同图对比。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/smoothing',
      formula: 'G(x,y)=\\frac{1}{2\\pi\\sigma^2}e^{-(x^2+y^2)/(2\\sigma^2)}',
      principles: [
        '高斯核不会平均对待窗口内的所有像素，中心像素权重大，远处像素权重小。',
        'σ 越大，模糊越强，细节和噪声越容易被压掉。'
      ],
      core: [['输入', '灰度或彩色图'], ['核心问题', '如何平滑又尽量少引入硬边界'], ['输出', '降噪后的平滑图']],
      pipeline: [['灰度化', '简化亮度计算。'], ['构造高斯核', '按距离分配权重。'], ['二维卷积', '滑窗加权求和。'], ['输出平滑图', '为梯度或分割降低噪声。']],
      stepMeta: {
        original: ['原图', '待平滑输入。', 'I'],
        gray: ['灰度图', '平滑前亮度。', 'Y'],
        gaussian: ['高斯模糊', '按高斯权重进行局部平均。', 'G*I']
      }
    },
    sobel: {
      phase: '阶段一 · 基础原语',
      title: 'Sobel 梯度',
      english: 'Sobel Gradient',
      tagline: '计算图像在 x/y 方向的亮度变化，边缘、角点、HOG 和光流都建立在梯度之上。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/sobel',
      formula: '|\\nabla I|=\\sqrt{G_x^2+G_y^2},\\quad \\theta=atan2(G_y,G_x)',
      principles: [
        'Sobel 核一边做差分，一边做轻微平滑，因此比简单相邻差分更抗噪。',
        '梯度幅值表示变化强度，梯度方向表示亮度上升最快的方向。'
      ],
      core: [['输入', '灰度图'], ['核心问题', '哪里变化最大、朝哪个方向变'], ['输出', 'Gx、Gy、幅值和方向']],
      pipeline: [['灰度化', '得到亮度图。'], ['水平核卷积', '检测垂直边缘。'], ['垂直核卷积', '检测水平边缘。'], ['合成幅值方向', '形成边缘强度和角度。']],
      stepMeta: {
        original: ['原图', '输入图像。', 'I'],
        gx: ['水平梯度 Gx', '亮处表示水平方向变化大。', 'G_x=I*K_x'],
        gy: ['垂直梯度 Gy', '亮处表示垂直方向变化大。', 'G_y=I*K_y'],
        magnitude: ['梯度幅值', '综合两个方向的变化强度。', '\\sqrt{G_x^2+G_y^2}'],
        angle: ['梯度方向', '用灰度编码方向角。', 'atan2(G_y,G_x)']
      }
    },
    median: {
      phase: '阶段一 · 基础原语',
      title: '中值滤波',
      english: 'Median Filter',
      tagline: '已合并到“平滑与去噪”统一专题：作为三种滤波器之一，与高斯平滑和双边滤波同图对比。',
      status: '真实 NumPy 算法',
      difficulty: '入门',
      endpoint: '/api/demo/smoothing',
      formula: 'I^{\\prime}(x,y)=median\\{I(u,v)|(u,v)\\in\\Omega\\}',
      principles: ['中值滤波是非线性的，它不做加权平均，而是选择排序后的中间值。', '孤立黑白点往往是极端值，会在中位数选择中被自然排除。'],
      core: [['输入', '含噪图像'], ['核心问题', '如何去掉孤立异常值'], ['输出', '去椒盐后的图像']],
      pipeline: [['读取图像', '保留原图。'], ['加入或面对噪声', '观察异常像素。'], ['滑动窗口排序', '取局部中位数。'], ['输出结果', '噪点减少，边界相对保留。']],
      stepMeta: {
        original: ['原图', '滤波前输入。', 'I'],
        noisy: ['椒盐噪声', '孤立黑白异常点。', 'I+n'],
        median: ['中值滤波结果', '局部排序取中位数。', 'median(\\Omega)']
      }
    },
    bilateral: {
      phase: '阶段一 · 基础原语',
      title: '双边滤波',
      english: 'Bilateral Filter',
      tagline: '已合并到“平滑与去噪”统一专题：作为三种滤波器之一，与高斯平滑和中值滤波同图对比。',
      status: '真实 NumPy 算法',
      difficulty: '基础',
      endpoint: '/api/demo/smoothing',
      formula: 'I_p^{\\prime}=\\frac{1}{W_p}\\sum_q G_s(\\|p-q\\|)G_r(\\|I_p-I_q\\|)I_q',
      principles: ['普通高斯只看空间距离，跨过边缘也会平均，容易把边界抹糊。', '双边滤波要求“离得近”且“颜色像”才给高权重，所以边缘两侧不容易互相污染。'],
      core: [['输入', '彩色或灰度图'], ['核心问题', '怎样平滑而不跨边缘平均'], ['输出', '保边平滑图']],
      pipeline: [['空间权重', '距离越近权重越大。'], ['颜色权重', '亮度或颜色越像权重越大。'], ['组合权重', '两个条件同时满足才贡献大。'], ['归一化输出', '得到保边平滑结果。']],
      stepMeta: {
        original: ['原图', '待平滑输入。', 'I'],
        gaussian: ['普通高斯平滑', '只考虑空间距离。', 'G_s*I'],
        bilateral: ['双边滤波', '空间核和颜色核共同作用。', 'G_sG_rI']
      }
    },
    hough: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: 'Hough 变换',
      english: 'Hough Transform',
      tagline: '让边缘像素在参数空间投票，用“很多点共同支持一个模型”的方式找直线或圆。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/hough',
      formula: '\\rho=x\\cos\\theta+y\\sin\\theta',
      principles: ['图像空间里一条直线上的许多点，在参数空间会汇聚到同一个 (ρ,θ)。', 'Hough 的优势是即使边缘有断裂，投票峰值仍然能把整体几何形状找出来。'],
      core: [['输入', '边缘图'], ['核心问题', '哪些边缘点支持同一条直线'], ['输出', '参数空间峰值和检测线']],
      pipeline: [['边缘检测', '提取可能属于形状的像素。'], ['参数投票', '每个边缘点对多个 θ 投票。'], ['峰值选择', '寻找累加器高峰。'], ['线段回绘', '把参数空间结果映射回图像。']],
      stepMeta: {
        original: ['原图', '输入图像。', 'I'],
        edges: ['边缘图', '只让边缘点参与投票。', 'E'],
        accumulator: ['累加器', '参数空间中的投票强度。', 'A(ρ,θ)'],
        lines: ['检测线', '把峰值线绘制回原图。', 'ρ=xcosθ+ysinθ']
      }
    },
    morphology: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '形态学操作',
      english: 'Morphology',
      tagline: '用结构元素在二值图上做集合操作，控制白色区域的收缩、扩张、去噪和补洞。',
      status: '真实 NumPy 算法',
      difficulty: '基础',
      endpoint: '/api/demo/morphology',
      formula: 'A\\oplus B,\\quad A\\ominus B',
      principles: ['腐蚀要求结构元素覆盖区域全部为白，能让前景缩水并去掉小噪点。', '膨胀只要结构元素覆盖到白色就扩张，能补小断裂。开运算是先腐蚀后膨胀，闭运算相反。'],
      core: [['输入', '二值图'], ['核心问题', '如何用形状规则修改前景'], ['输出', '腐蚀、膨胀、开闭运算']],
      pipeline: [['阈值化', '得到二值前景。'], ['选择结构元素', '定义局部邻域形状。'], ['集合运算', '腐蚀/膨胀/开/闭。'], ['形状清理', '减少噪点或填补缝隙。']],
      stepMeta: {
        original: ['原图', '输入图像。', 'I'],
        binary: ['二值图', '形态学操作对象。', 'A'],
        erode: ['腐蚀', '白色区域收缩。', 'A⊖B'],
        dilate: ['膨胀', '白色区域扩张。', 'A⊕B'],
        opening: ['开运算', '去除小噪点。', '(A⊖B)⊕B'],
        closing: ['闭运算', '填补小孔洞。', '(A⊕B)⊖B'],
        gradient: ['形态学梯度', '膨胀和腐蚀之差近似边界。', '(A⊕B)-(A⊖B)']
      }
    },
    contour: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '轮廓查找',
      english: 'Contour Finding',
      tagline: '在二值图中沿着前景边界行走，把像素区域变成可测量的形状对象。',
      status: '真实 NumPy 算法',
      difficulty: '基础',
      endpoint: '/api/demo/contour',
      formula: 'C=\\{(x,y)|B(x,y)=1,\\exists neighbor=0\\}',
      principles: ['轮廓是前景与背景的交界，它把像素块压缩成边界点序列。', '有了轮廓之后，就能计算面积、周长、外接框、近似多边形和目标数量。'],
      core: [['输入', '二值图'], ['核心问题', '哪些像素位于前景边界'], ['输出', '轮廓叠加与形状指标']],
      pipeline: [['阈值化', '把目标从背景中分离。'], ['边界追踪', '找到前景外沿。'], ['轮廓近似', '减少冗余点。'], ['形状分析', '统计面积和数量。']],
      stepMeta: {
        original: ['原图', '待分析输入。', 'I'],
        binary: ['二值图', '轮廓来自前景边界。', 'B'],
        contours: ['轮廓叠加', '把边界点画回图像。', 'C'],
        approximation: ['轮廓近似', '用更少点描述形状。', 'approx(C)']
      }
    },
    nms: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '非极大值抑制',
      english: 'Non-Maximum Suppression',
      tagline: '只保留局部最强响应，让厚边缘变细，也让重复检测框变成一个结果。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/nms',
      formula: 'keep(p) \\iff R(p)=\\max_{q\\in direction(p)}R(q)',
      principles: ['在 Canny 中，NMS 沿梯度方向比较相邻响应，只保留中心最大的像素。', '同一个思想也用于目标检测框：分数高的框留下，和它高度重叠的框删掉。'],
      core: [['输入', '响应图或候选框'], ['核心问题', '怎样删除重复局部响应'], ['输出', '稀疏且更准确的结果']],
      pipeline: [['计算响应', '得到边缘强度或候选分数。'], ['确定比较方向', '沿梯度方向或 IoU 重叠比较。'], ['局部最大判断', '保留最强者。'], ['输出稀疏结果', '边缘变细或框去重。']],
      stepMeta: {
        original: ['原图', '输入。', 'I'],
        gradient: ['梯度幅值', '未抑制前边缘较厚。', '|∇I|'],
        nms: ['NMS 后', '只保留局部最大响应。', 'local max']
      }
    },
    template_match: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '模板匹配',
      english: 'Template Matching',
      tagline: '让小模板在大图中滑动，用相似度峰值定位目标，是最直接的目标查找方法。',
      status: '真实 NumPy 算法',
      difficulty: '基础',
      endpoint: '/api/demo/template_match',
      formula: 'NCC(x,y)=\\frac{\\sum (I-\\bar I)(T-\\bar T)}{\\|I-\\bar I\\|\\|T-\\bar T\\|}',
      principles: ['互相关衡量模板和当前位置窗口是否相像，归一化互相关能减少整体亮度变化影响。', '模板匹配适合目标外观稳定、尺度和旋转变化不大的场景。'],
      core: [['输入', '搜索图和模板'], ['核心问题', '哪个位置最像模板'], ['输出', '相似度热图和最佳位置']],
      pipeline: [['选取模板', '从图中或预设区域得到目标样子。'], ['滑窗比较', '逐位置计算相似度。'], ['峰值寻找', '选出最高响应位置。'], ['结果框定', '把匹配位置画回原图。']],
      stepMeta: {
        original: ['原图', '搜索区域。', 'I'],
        template: ['模板', '被查找的小图块。', 'T'],
        response: ['响应图', '亮处表示相似度高。', 'NCC'],
        match: ['匹配结果', '最佳相似位置。', 'argmax NCC']
      }
    },
    kmeans: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: 'K-Means 分割',
      english: 'K-Means Segmentation',
      tagline: '把像素颜色看作点，用聚类中心把图像粗分成若干颜色区域。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/kmeans',
      formula: '\\min\\sum_i\\|x_i-\\mu_{c_i}\\|^2',
      principles: ['每个像素是 RGB 空间里的一个点，K-Means 反复执行“分配最近中心”和“更新中心”。', '它没有语义理解，只按颜色相似度分组，因此适合做无监督分割直觉入门。'],
      controls: [{ name: 'k', label: '聚类数 K', type: 'range', min: 2, max: 8, step: 1, value: 4 }],
      core: [['输入', 'RGB 像素点'], ['核心问题', '哪些像素颜色相近'], ['输出', '聚类标签和重着色图']],
      pipeline: [['采样像素', '把图像拉平成 RGB 点集。'], ['初始化中心', '选择 K 个颜色中心。'], ['迭代分配更新', '每轮靠近最近中心。'], ['重建图像', '用中心颜色替代像素。']],
      stepMeta: {
        original: ['原图', '待聚类颜色。', 'x_i=[R,G,B]'],
        clustered: ['聚类结果', '同类像素使用同一中心颜色。', 'μ_c'],
        labels: ['标签图', '显示每个像素所属簇。', 'c_i']
      }
    },
    watershed: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '分水岭分割',
      english: 'Watershed Segmentation',
      tagline: '把梯度图想成地形，从标记点向外注水，水盆相遇的位置就是分割边界。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/watershed',
      formula: 'label(p)=label(argmin\\ gradient\\ path)',
      principles: ['亮度变化大的地方像山脊，不同区域从低处扩张，遇到山脊就形成边界。', '标记控制可以减少过分割，让算法从可信前景和背景种子出发。'],
      core: [['输入', '梯度图和种子'], ['核心问题', '不同区域在哪里相遇'], ['输出', '分割标签和边界']],
      pipeline: [['计算梯度', '把边缘看作地形高度。'], ['生成标记', '确定初始水源。'], ['按梯度扩张', '低梯度区域优先合并。'], ['边界绘制', '不同标签相遇处形成边界。']],
      stepMeta: {
        original: ['原图', '待分割图像。', 'I'],
        gradient: ['梯度地形', '亮处是边界山脊。', '|∇I|'],
        markers: ['标记点', '初始区域种子。', 'M'],
        labels: ['标签图', '区域扩张后的分区。', 'L'],
        boundary: ['分割边界', '不同标签相遇的位置。', '∂L']
      }
    },
    grabcut: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: 'GrabCut 前景提取',
      english: 'GrabCut',
      tagline: '用一个矩形给出粗略前景范围，再通过颜色模型和图割迭代分离前景背景。',
      status: '真实 NumPy 教学实现',
      difficulty: '进阶',
      endpoint: '/api/demo/grabcut',
      formula: 'E(L)=\\sum_p D_p(L_p)+\\lambda\\sum_{p,q}V_{p,q}[L_p\\ne L_q]',
      principles: ['GrabCut 把“颜色像不像前景/背景”和“相邻像素是否应该同类”合在一个能量函数中。', '真实工业实现通常用 GMM 和 max-flow；当前页面展示教学版的核心迭代直觉。'],
      controls: [
        { name: 'x', label: '框 x', type: 'range', min: 0, max: 9999, step: 1, value: 30 },
        { name: 'y', label: '框 y', type: 'range', min: 0, max: 9999, step: 1, value: 30 },
        { name: 'w', label: '框宽', type: 'range', min: 10, max: 9999, step: 1, value: 160 },
        { name: 'h', label: '框高', type: 'range', min: 10, max: 9999, step: 1, value: 160 }
      ],
      core: [['输入', '图像和前景矩形'], ['核心问题', '哪些颜色更像前景'], ['输出', '前景掩码和抠图结果']],
      pipeline: [['矩形初始化', '框内可能前景，框外背景。'], ['颜色建模', '估计前景/背景颜色分布。'], ['迭代更新', '根据颜色和边界平滑更新标签。'], ['生成掩码', '输出前景区域。']],
      stepMeta: {
        original: ['原图', '输入图像。', 'I'],
        init: ['矩形初始化', '粗略指定目标范围。', 'R'],
        mask: ['前景掩码', '估计的前景区域。', 'L'],
        result: ['抠图结果', '只保留前景。', 'I·L']
      }
    },
    slic: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: 'SLIC 超像素',
      english: 'SLIC Superpixels',
      tagline: '在颜色和空间的五维特征中做局部 K-Means，把像素组织成紧凑小区域。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/slic',
      formula: 'D=\\sqrt{d_c^2+(m/S)^2d_s^2}',
      principles: ['SLIC 不追求最终语义分割，而是把图像变成更少、更规则的视觉单元。', 'compactness 越大，空间规则性越强；越小，超像素越贴合颜色边界。'],
      controls: [
        { name: 'num_superpixels', label: '超像素数', type: 'range', min: 50, max: 400, step: 10, value: 200 },
        { name: 'compactness', label: '紧凑度', type: 'range', min: 1, max: 30, step: 1, value: 10 }
      ],
      core: [['输入', '颜色和坐标'], ['核心问题', '如何形成颜色相近且空间紧凑的小块'], ['输出', '超像素标签和边界']],
      pipeline: [['初始化网格中心', '均匀放置聚类中心。'], ['局部搜索', '只在中心附近比较。'], ['更新中心', '按颜色和坐标重新平均。'], ['绘制边界', '显示超像素分块。']],
      stepMeta: {
        original: ['原图', '输入图像。', 'I'],
        labels: ['标签图', '每个超像素的编号。', 'L'],
        boundaries: ['超像素边界', '紧凑区域分界线。', '∂L'],
        result: ['平均色结果', '每个超像素用平均颜色表示。', 'mean(I|L)']
      }
    },
    hog_svm: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: 'HOG + SVM',
      english: 'Histogram of Oriented Gradients',
      tagline: '把局部梯度方向统计成特征向量，是深度学习前行人检测的经典表示。',
      status: '真实 NumPy 特征提取',
      difficulty: '进阶',
      endpoint: '/api/demo/hog_svm',
      formula: 'H_{cell}(b)=\\sum |\\nabla I|[\\theta\\in bin_b]',
      principles: ['HOG 关注边缘方向分布，而不是原始像素值，因此对光照和小形变更稳。', 'SVM 可以在 HOG 特征空间中学习“像不像目标”的线性分界。'],
      core: [['输入', '灰度图'], ['核心问题', '局部轮廓方向如何编码'], ['输出', 'HOG 可视化和特征维度']],
      pipeline: [['计算梯度', '得到幅值和方向。'], ['划分 cell', '每个小格统计方向直方图。'], ['block 归一化', '降低光照影响。'], ['拼接特征', '形成分类器输入向量。']],
      stepMeta: {
        original: ['原图', '输入图像。', 'I'],
        gray: ['灰度图', '梯度计算基础。', 'Y'],
        magnitude: ['梯度幅值', '边缘强度。', '|∇I|'],
        hog: ['HOG 可视化', '线段方向和长度表示局部方向统计。', 'H_cell']
      }
    },
    optical_flow: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '光流',
      english: 'Optical Flow',
      tagline: '估计相邻帧之间像素的运动方向和速度，用矢量场描述视频中的运动。',
      status: '真实 NumPy 教学实现',
      difficulty: '进阶',
      endpoint: '/api/demo/optical_flow',
      formula: 'I_xu+I_yv+I_t=0',
      principles: ['亮度恒定假设认为同一个点在短时间内亮度不变，于是空间梯度和时间梯度共同约束运动。', 'Lucas-Kanade 在局部窗口里解最小二乘，适合小位移和局部平滑运动。'],
      core: [['输入', '两帧图像'], ['核心问题', '像素从哪里移动到哪里'], ['输出', '运动矢量或颜色编码流场']],
      pipeline: [['生成相邻帧', '模拟或读取两帧。'], ['计算 Ix/Iy/It', '空间和时间梯度。'], ['局部求解', '估计 u/v 运动。'], ['绘制流场', '用箭头或颜色显示运动。']],
      stepMeta: {
        frame1: ['第一帧', '运动前图像。', 'I_t'],
        frame2: ['第二帧', '运动后图像。', 'I_{t+1}'],
        flow: ['光流场', '箭头显示局部运动。', '(u,v)'],
        magnitude: ['运动强度', '亮处表示速度更大。', '\\sqrt{u^2+v^2}']
      }
    },
    stereo: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '立体匹配',
      english: 'Stereo Matching',
      tagline: '从左右视角寻找同名点，视差越大通常表示物体越近。',
      status: '真实 NumPy 教学实现',
      difficulty: '进阶',
      endpoint: '/api/demo/stereo',
      formula: 'Z=\\frac{fB}{d}',
      principles: ['校正后的双目图像中，同一个点只会沿水平方向移动，搜索从二维降到一维。', '视差 d 是左右图横向位置差，深度 Z 与视差成反比。'],
      core: [['输入', '左右视图'], ['核心问题', '每个像素在另一张图中对应哪里'], ['输出', '视差图和深度直觉']],
      pipeline: [['左右图准备', '模拟双目视角。'], ['窗口匹配', '用 SAD/SSD 比较候选视差。'], ['选择最小代价', '得到每个像素的视差。'], ['深度解释', '视差大近，视差小远。']],
      stepMeta: {
        left: ['左图', '参考视角。', 'I_L'],
        right: ['右图', '匹配视角。', 'I_R'],
        cost: ['匹配代价', '不同视差下的误差。', 'SAD(d)'],
        disparity: ['视差图', '亮处通常更近。', 'd=x_L-x_R'],
        depth: ['深度图', '由视差换算深度直觉。', 'Z=fB/d']
      }
    },
    frequency: {
      phase: '阶段二 · 经典结构与几何视觉',
      title: '频域分析',
      english: 'Frequency Domain Analysis',
      tagline: '把图像拆成不同频率的波，低频对应大面积平滑，高频对应边缘、纹理和噪声。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/frequency',
      formula: 'F(u,v)=\\sum_x\\sum_y f(x,y)e^{-j2\\pi(ux/M+vy/N)}',
      principles: ['空间域看像素位置，频域看变化速度。越靠中心通常越低频，越远离中心通常越高频。', '滤掉高频会模糊，保留高频会强调边缘和噪声。'],
      core: [['输入', '灰度图'], ['核心问题', '图像由哪些频率组成'], ['输出', '频谱和滤波效果']],
      pipeline: [['灰度化', '准备二维信号。'], ['FFT', '变换到频域。'], ['频谱中心化', '低频移动到中心便于观察。'], ['滤波重建', '观察低通/高通效果。']],
      stepMeta: {
        original: ['原图', '空间域输入。', 'f(x,y)'],
        spectrum: ['频谱', '亮处表示对应频率能量强。', '|F(u,v)|'],
        lowpass: ['低通结果', '保留平滑结构。', 'H_lowF'],
        highpass: ['高通结果', '强调边缘纹理。', 'H_highF']
      }
    }
  };

  const phaseLabel = {
    phase1: '阶段一 · 基础原语',
    phase2: '阶段二 · 经典结构与几何视觉',
    phase3: '阶段二 · 经典结构与几何视觉',
    phase4: '阶段三 · 深度学习时代',
    phase5: '阶段四 · 基础模型与前沿感知'
  };

  function makeTeachingConfig(spec) {
    var endpoint = spec.endpoint;
    // 没有手动指定 endpoint 时，只要不是需要外部权重的模块，就自动指向 /api/demo/<id>
    // 离线教学模块至少可以跑教学演示，外部权重模块则无法在离线环境运行
    if (!endpoint && (!externalWeightIds.has(spec.id) || localTeachingWeightIds.has(spec.id) || localFrontierAlgorithmIds.has(spec.id))) {
      endpoint = '/api/demo/' + (spec.id === 'sd' ? 'stable_diffusion' : spec.id);
    }

    var isExtWeight = externalWeightIds.has(spec.id);
    var isLocalTeachingWeight = localTeachingWeightIds.has(spec.id);
    var isLocalFrontierAlgorithm = localFrontierAlgorithmIds.has(spec.id);
    var isOffline = !isExtWeight && offlineTeachingIds.has(spec.id);
    var impl = {
      status: spec.status || (isExtWeight ? '需要外部权重' : '真实 NumPy 算法'),
      category: isExtWeight ? 'requires_external_weights' : 'numpy_algorithm',
      localInference: !isExtWeight,
      realModel: !isExtWeight && !isLocalTeachingWeight && !isLocalFrontierAlgorithm,
      requiresUpload: !isExtWeight && !isLocalTeachingWeight && !isLocalFrontierAlgorithm,
      model: isLocalFrontierAlgorithm ? 'NumPy/PIL local mechanism pipeline' : (spec.id || '')
    };

    return {
      phase: phaseLabel[spec.phase] || spec.phase || '算法讲解',
      title: spec.title,
      english: spec.english || spec.title,
      tagline: spec.tagline,
      status: impl.status,
      difficulty: spec.difficulty || '进阶',
      formula: spec.formula || '',
      principles: spec.principles || [
        spec.tagline,
        '该页面先讲清输入、核心表征、优化目标和输出，再给出参考实现仓库，方便继续深入代码。'
      ],
      core: spec.core || [
        ['输入', spec.input || '图像、视频、文本或空间观测'],
        ['核心问题', spec.question || '如何把视觉信号转换成可用于任务的结构化表示'],
        ['输出', spec.output || '特征、预测、掩码、轨迹、3D结构或生成结果']
      ],
      pipeline: spec.pipeline || [
        ['输入编码', '把原始视觉信号整理成模型或算法可处理的张量。'],
        ['特征提取', '通过手写特征、卷积、Transformer 或几何约束得到中间表示。'],
        ['任务头/优化', '根据检测、分割、匹配、生成或3D重建目标进行预测或求解。'],
        ['结果解释', '把中间张量还原成边界框、掩码、深度、注意力图、点云或生成图像。']
      ],
      endpoint: endpoint,
      implementation: impl,
      conceptSteps: spec.conceptSteps || spec.pipeline,
      visualStory: spec.visualStory,
      references: spec.references || [],
      metrics: spec.metrics || {
        '展示类型': impl.status,
        '本地推理': endpoint ? '可运行' : '未接入',
        '参考实现': spec.references && spec.references.length ? '已列出' : '待补充'
      }
    };
  }

  [
    {
      id: 'shitomasi', phase: 'phase2', title: 'Shi-Tomasi 角点', english: 'Shi-Tomasi Corner',
      tagline: '用结构张量最小特征值选择角点，是光流跟踪中 goodFeaturesToTrack 的经典准则。',
      formula: 'R=\\min(\\lambda_1,\\lambda_2)',
      endpoint: '/api/demo/shitomasi',
      pipeline: [['梯度计算', '计算局部 Ix/Iy。'], ['结构张量', '在窗口内累计 Ix²、Iy²、IxIy。'], ['最小特征值', '用较小特征值判断两个方向都是否有变化。'], ['局部筛选', '阈值和 NMS 保留稳定角点。']]
    },
    {
      id: 'ncuts', phase: 'phase3', title: 'Normalized Cuts', english: 'Normalized Cuts',
      tagline: '把图像看成加权图，用谱聚类寻找既切断弱连接、又保持区域内部强连接的分割。',
      formula: 'Ncut(A,B)=cut(A,B)/assoc(A,V)+cut(A,B)/assoc(B,V)',
      endpoint: '/api/demo/ncuts',
      pipeline: [['构图', '像素或超像素作为节点，颜色/空间相似度作为边权。'], ['拉普拉斯矩阵', '构建 D-W 和归一化形式。'], ['特征向量', '求第二小特征向量作为软分割方向。'], ['二值切分', '阈值化 Fiedler 向量得到区域。']]
    },
    {
      id: 'bovw_spm', phase: 'phase3', title: 'BoVW + SPM', english: 'Bag of Visual Words + SPM',
      tagline: '把局部 SIFT 描述子量化成视觉词，再用空间金字塔保留粗略布局，是手工特征分类时代的完整管线。',
      formula: 'K(x,y)=\\sum_i \\min(x_i,y_i)',
      endpoint: '/api/demo/bovw_spm',
      pipeline: [['提取 SIFT', '从训练图像收集局部描述子。'], ['视觉词典', 'K-Means 聚成 codebook。'], ['硬分配直方图', '每张图统计视觉词频。'], ['空间金字塔', '1x1、2x2、4x4 多级网格加权拼接。'], ['SVM 分类', '用 Chi-square kernel 或线性近似分类。']]
    },
    {
      id: 'calibration', phase: 'phase3', title: '相机标定', english: 'Camera Calibration',
      tagline: '从棋盘格角点估计内参 K、外参 R/t 和畸变参数，把像素坐标连接到真实相机几何。',
      formula: 's\\begin{bmatrix}u\\\\v\\\\1\\end{bmatrix}=K[R|t]\\begin{bmatrix}X\\\\Y\\\\Z\\\\1\\end{bmatrix}',
      endpoint: '/api/demo/calibration',
      pipeline: [['检测棋盘格角点', '建立 3D 世界点和 2D 像素点对应。'], ['估计单应性', '每张平面标定图提供一个 H。'], ['求内参', '用约束解 K。'], ['求外参和畸变', '估计 R/t 并优化重投影误差。']]
    },
    {
      id: 'epipolar', phase: 'phase3', title: '对极几何', english: 'Epipolar Geometry',
      tagline: '用基础矩阵 F 或本质矩阵 E 描述双视图约束，把点匹配限制到对极线。',
      formula: 'p_2^T F p_1=0',
      endpoint: '/api/demo/epipolar',
      pipeline: [['匹配点归一化', '把像素坐标中心化和缩放。'], ['八点法', '线性求解 F。'], ['秩约束', 'SVD 强制 rank(F)=2。'], ['恢复位姿', '由 E 分解得到 R/t 候选。']]
    },
    {
      id: 'sfm', phase: 'phase3', title: '三角测量与 SfM', english: 'Triangulation & SfM',
      tagline: '从多视图匹配、相机位姿和三角测量逐步恢复稀疏三维点云。',
      formula: 'x=P X,\\quad AX=0',
      endpoint: '/api/demo/sfm',
      pipeline: [['特征匹配', '用 SIFT/RANSAC 得到跨图对应点。'], ['估计相机运动', '基础矩阵/本质矩阵恢复 R/t。'], ['三角测量', '用两个投影矩阵线性求 3D 点。'], ['Bundle Adjustment', '联合优化相机和点云重投影误差。']]
    },
    {
      id: 'cnn_basics', phase: 'phase4', title: 'CNN 基础', english: 'CNN Basics',
      tagline: '从卷积、ReLU、池化到全连接，理解深度学习如何把手写卷积变成可学习特征。',
      formula: 'Y_{c}=\\sum_k W_{c,k}*X_k+b_c',
      pipeline: [['卷积层', '多个可学习 kernel 提取边缘和纹理。'], ['非线性', 'ReLU 保留正响应。'], ['池化/步幅', '降低分辨率并扩大感受野。'], ['分类头', '把空间特征聚合成类别概率。']],
      references: [{title:'LeNet-5 paper', url:'http://yann.lecun.com/exdb/publis/pdf/lecun-98.pdf'}]
    },
    {
      id: 'resnet', phase: 'phase4', title: 'ResNet + Grad-CAM', english: 'ResNet + Grad-CAM',
      tagline: '残差连接让超深网络可训练，Grad-CAM 用梯度加权激活图解释模型关注区域。',
      formula: 'y=F(x)+x,\\quad L^c=ReLU(\\sum_k\\alpha_k^c A^k)',
      pipeline: [['残差块', '学习相对输入的增量 F(x)。'], ['全局分类', '深层特征经过 GAP/FC 输出类别。'], ['梯度回传', '对目标类别求最后卷积层梯度。'], ['热力图', '加权激活并 ReLU 得到关注区域。']],
      references: [{title:'ResNet official repository', url:'https://github.com/KaimingHe/deep-residual-networks'}]
    },
    {
      id: 'fcn', phase: 'phase4', title: 'FCN', english: 'Fully Convolutional Network',
      tagline: '把分类网络改成全卷积结构，通过上采样和跳跃连接输出像素级语义。',
      formula: 'score=upsample(f_{deep})+f_{shallow}',
      pipeline: [['骨干网络', 'VGG/ResNet 提取多尺度特征。'], ['1x1 卷积', '把通道映射为类别 logits。'], ['转置卷积', '上采样回原图大小。'], ['跳跃融合', '结合浅层细节和深层语义。']],
      references: [{title:'FCN paper project', url:'https://github.com/shelhamer/fcn.berkeleyvision.org'}]
    },
    {
      id: 'unet', phase: 'phase4', title: 'U-Net', english: 'U-Net',
      tagline: '对称编码器-解码器和长跳跃连接让小数据医学分割也能保留边界细节。',
      formula: 'decoder_l=up(decoder_{l+1})\\oplus encoder_l',
      pipeline: [['编码器', '逐层下采样提取语义。'], ['瓶颈层', '获得全局上下文。'], ['解码器', '逐层上采样恢复分辨率。'], ['跳跃连接', '拼接同尺度浅层细节。']],
      references: [{title:'U-Net original page', url:'https://lmb.informatik.uni-freiburg.de/people/ronneber/u-net/'}]
    },
    {
      id: 'faster_rcnn', phase: 'phase4', title: 'Faster R-CNN + FPN', english: 'Faster R-CNN + FPN',
      tagline: '两阶段检测器：先用 RPN 产生候选框，再对 RoI 分类和回归。',
      formula: 'L=L_{cls}+L_{box}+L_{rpn}',
      pipeline: [['Backbone/FPN', '提取多尺度特征金字塔。'], ['RPN', '用锚框预测 objectness 和候选框。'], ['RoIAlign/Pooling', '把候选区域裁成固定大小特征。'], ['检测头', '分类并精修边界框。']],
      references: [{title:'Detectron2 reference implementation', url:'https://github.com/facebookresearch/detectron2'}]
    },
    {
      id: 'yolo', phase: 'phase4', title: 'YOLO', english: 'You Only Look Once',
      tagline: '单阶段检测直接从网格或特征点回归边界框、类别和置信度，强调实时速度。',
      formula: 'box=(x,y,w,h,obj,class)',
      pipeline: [['特征提取', 'Backbone 提取多尺度图像特征。'], ['检测头', '每个位置预测框和类别。'], ['置信度筛选', '按 objectness 和 class score 过滤。'], ['NMS', '去除高度重叠框。']],
      references: [{title:'Ultralytics YOLO reference', url:'https://github.com/ultralytics/ultralytics'}]
    },
    {
      id: 'mask_rcnn', phase: 'phase4', title: 'Mask R-CNN', english: 'Mask R-CNN',
      tagline: '在 Faster R-CNN 上增加并行掩码分支，输出每个实例的像素级轮廓。',
      formula: 'L=L_{cls}+L_{box}+L_{mask}',
      pipeline: [['候选框检测', '沿用 Faster R-CNN 的 RPN 和 RoI。'], ['RoIAlign', '避免量化误差，精确采样特征。'], ['分类/框回归', '确定实例类别和框。'], ['掩码分支', '对每个 RoI 输出二值 mask。']],
      references: [{title:'Detectron2 Mask R-CNN', url:'https://github.com/facebookresearch/detectron2'}]
    },
    {
      id: 'gan', phase: 'phase4', title: 'GAN 基础', english: 'Generative Adversarial Network',
      tagline: '生成器和判别器相互博弈：一个试图生成逼真样本，另一个试图区分真假。',
      formula: '\\min_G\\max_D E_x[\\log D(x)]+E_z[\\log(1-D(G(z)))]',
      pipeline: [['采样噪声', '从随机向量 z 开始。'], ['生成器', '把 z 映射成图像。'], ['判别器', '判断真实图和生成图。'], ['对抗更新', 'D 学会识别，G 学会欺骗 D。']],
      references: [{title:'DCGAN reference implementation', url:'https://github.com/pytorch/examples/tree/main/dcgan'}]
    },
    {
      id: 'diffusion', phase: 'phase4', title: '扩散模型基础', english: 'Diffusion Basics',
      tagline: '前向过程逐步加噪，反向网络学习一步步去噪生成样本。',
      formula: 'x_t=\\sqrt{\\bar{\\alpha}_t}x_0+\\sqrt{1-\\bar{\\alpha}_t}\\epsilon',
      pipeline: [['前向加噪', '把图像逐步破坏为高斯噪声。'], ['时间编码', '告诉网络当前噪声强度。'], ['预测噪声', 'UNet/Transformer 预测 ε。'], ['反向采样', '从纯噪声迭代还原图像。']],
      references: [{title:'DDPM official repository', url:'https://github.com/hojonathanho/diffusion'}]
    },
    {
      id: 'vit', phase: 'phase5', title: 'ViT', english: 'Vision Transformer',
      tagline: '把图像切成 patch token，用 Transformer 自注意力建模全局关系。',
      formula: 'z_0=[x_{class};x_p^1E;...;x_p^NE]+E_{pos}',
      pipeline: [['Patchify', '把图像切成固定大小 patch。'], ['Token Embedding', '线性投影为 token 并加位置编码。'], ['Transformer Encoder', '多头自注意力建模全局依赖。'], ['CLS Head', '用 class token 做分类或迁移。']],
      references: [{title:'Google Research ViT', url:'https://github.com/google-research/vision_transformer'}]
    },
    {
      id: 'swin', phase: 'phase5', title: 'Swin Transformer', english: 'Swin Transformer',
      tagline: '窗口注意力和移位窗口让 Transformer 拥有层级特征和线性复杂度。',
      formula: 'MSA(W-MSA)\\rightarrow SW-MSA',
      references: [{title:'Official Swin Transformer', url:'https://github.com/microsoft/Swin-Transformer'}]
    },
    {
      id: 'dino', phase: 'phase5', title: 'DINO / DINOv2', english: 'Self-Supervised ViT',
      tagline: '用学生-教师自监督学习训练 ViT，注意力图常自然涌现物体区域。',
      formula: 'L=H(P_t(x_2),P_s(x_1))',
      references: [{title:'DINOv2 official repository', url:'https://github.com/facebookresearch/dinov2'}]
    },
    {
      id: 'mae', phase: 'phase5', title: 'MAE', english: 'Masked Autoencoder',
      tagline: '随机遮盖大部分 patch，只编码可见 token，再重建被遮盖像素。',
      formula: 'L=\\|x_{masked}-\\hat{x}_{masked}\\|^2',
      references: [{title:'MAE official repository', url:'https://github.com/facebookresearch/mae'}]
    },
    {
      id: 'detr', phase: 'phase5', title: 'DETR', english: 'DEtection TRansformer',
      tagline: '用 Object Query 和二分匹配把目标检测变成集合预测问题。',
      formula: '\\hat{y}=Transformer(f_{cnn}(x),Q),\\quad \\min_\\sigma \\sum_i L(y_i,\\hat{y}_{\\sigma(i)})',
      references: [{title:'DETR official repository', url:'https://github.com/facebookresearch/detr'}]
    },
    {
      id: 'dino_det', phase: 'phase5', title: 'DINO 检测', english: 'DINO Detection',
      tagline: '在 DETR 系列中加入对比去噪训练和混合 query，加快收敛并提升检测精度。',
      formula: 'L=L_{match}+L_{denoise}',
      references: [{title:'IDEA-Research DINO', url:'https://github.com/IDEA-Research/DINO'}]
    },
    {
      id: 'grdino', phase: 'phase5', title: 'Grounding DINO', english: 'Grounding DINO',
      tagline: '把文本短语作为条件，让检测框和开放词汇描述对齐。',
      formula: 'score=sim(q_{object},q_{text})',
      references: [{title:'Grounding DINO official repository', url:'https://github.com/IDEA-Research/GroundingDINO'}]
    },
    {
      id: 'mask2former', phase: 'phase5', title: 'Mask2Former', english: 'Mask2Former',
      tagline: '用掩码注意力统一语义、实例和全景分割任务。',
      formula: 'Attention(Q,K,V;M)',
      references: [{title:'Mask2Former official repository', url:'https://github.com/facebookresearch/Mask2Former'}]
    },
    {
      id: 'sam', phase: 'phase5', title: 'SAM', english: 'Segment Anything',
      tagline: '提示编码器 + 图像编码器 + 掩码解码器，实现点、框、文本等提示驱动的通用分割。',
      formula: 'mask=Decoder(ImageEncoder(I),PromptEncoder(p))',
      references: [{title:'Segment Anything official repository', url:'https://github.com/facebookresearch/segment-anything'}]
    },
    {
      id: 'sam2', phase: 'phase5', title: 'SAM 2', english: 'Segment Anything 2',
      tagline: '把 SAM 扩展到视频，使用记忆机制在时间上持续传播目标掩码。',
      formula: 'M_t=Decoder(F_t,Prompt,Memory_{<t})',
      references: [{title:'SAM 2 official repository', url:'https://github.com/facebookresearch/sam2'}]
    },
    {
      id: 'clip', phase: 'phase5', title: 'CLIP', english: 'Contrastive Language-Image Pre-training',
      tagline: '用海量图文对对比学习，把图像和文本映射到同一语义空间。',
      formula: 'L=-\\log\\frac{e^{sim(I,T^+)/\\tau}}{\\sum_j e^{sim(I,T_j)/\\tau}}',
      references: [{title:'OpenAI CLIP official repository', url:'https://github.com/openai/CLIP'}]
    },
    {
      id: 'blip2', phase: 'phase5', title: 'BLIP-2', english: 'BLIP-2',
      tagline: '用 Q-Former 桥接冻结视觉编码器和大语言模型，实现图像问答与描述。',
      formula: 'Q=QFormer(ImageTokens)',
      references: [{title:'LAVIS BLIP-2 reference', url:'https://github.com/salesforce/LAVIS'}]
    },
    {
      id: 'ddpm', phase: 'phase5', title: 'DDPM', english: 'Denoising Diffusion Probabilistic Models',
      tagline: '前向逐步加噪，反向学习去噪，从纯噪声逐步生成图像。',
      formula: 'q(x_t|x_{t-1})=\\mathcal{N}(\\sqrt{1-\\beta_t}x_{t-1},\\beta_tI)',
      references: [{title:'DDPM official repository', url:'https://github.com/hojonathanho/diffusion'}]
    },
    {
      id: 'sd', phase: 'phase5', title: 'Stable Diffusion', english: 'Latent Diffusion',
      tagline: '在 VAE 潜空间中做扩散，用文本 cross-attention 控制生成内容。',
      formula: '\\epsilon_\\theta(z_t,t,c)',
      references: [{title:'CompVis Stable Diffusion', url:'https://github.com/CompVis/stable-diffusion'}]
    },
    {
      id: 'controlnet', phase: 'phase5', title: 'ControlNet', english: 'ControlNet',
      tagline: '给冻结扩散模型增加可训练控制分支，让边缘、深度、姿态等条件精确控制生成。',
      formula: 'F_{control}=ZeroConv(F_{cond})+F_{frozen}',
      references: [{title:'ControlNet official repository', url:'https://github.com/lllyasviel/ControlNet'}]
    },
    {
      id: 'dit', phase: 'phase5', title: 'DiT', english: 'Diffusion Transformer',
      tagline: '用 Transformer 替代 UNet 做扩散模型的去噪网络。',
      formula: 'x_{patch}\\rightarrow TransformerBlocks\\rightarrow \\epsilon',
      references: [{title:'DiT official repository', url:'https://github.com/facebookresearch/DiT'}]
    },
    {
      id: 'flux', phase: 'phase5', title: 'Flux', english: 'Flow Matching Transformer',
      tagline: '把扩散/流匹配与大规模 Transformer 结合，学习从噪声到数据的连续路径。',
      formula: 'v_\\theta(x_t,t,c)\\approx \\frac{dx_t}{dt}',
      references: [{title:'Black Forest Labs Flux', url:'https://github.com/black-forest-labs/flux'}]
    },
    {
      id: 'stylegan', phase: 'phase5', title: 'StyleGAN', english: 'StyleGAN',
      tagline: '通过风格映射、调制卷积和逐层噪声生成高质量可控人脸/图像。',
      formula: 'w=f(z),\\quad y=Conv(Mod(W,w),x)',
      references: [{title:'StyleGAN3 official repository', url:'https://github.com/NVlabs/stylegan3'}]
    },
    {
      id: 'simclr', phase: 'phase5', title: 'SimCLR', english: 'SimCLR',
      tagline: '对同一图像的两种增强视图做对比学习，拉近正样本、推远负样本。',
      formula: 'L_{i,j}=-\\log\\frac{e^{sim(z_i,z_j)/\\tau}}{\\sum_k e^{sim(z_i,z_k)/\\tau}}',
      references: [{title:'SimCLR official repository', url:'https://github.com/google-research/simclr'}]
    },
    {
      id: 'moco', phase: 'phase5', title: 'MoCo', english: 'Momentum Contrast',
      tagline: '用动量编码器和队列维护大量负样本，解耦 batch size 与对比学习规模。',
      formula: 'k\\leftarrow m k +(1-m)q',
      references: [{title:'MoCo official repository', url:'https://github.com/facebookresearch/moco'}]
    },
    {
      id: 'byol', phase: 'phase5', title: 'BYOL', english: 'Bootstrap Your Own Latent',
      tagline: '不用负样本，通过 online/target 双网络和 EMA 避免表征坍塌。',
      formula: '\\theta_{target}\\leftarrow \\tau\\theta_{target}+(1-\\tau)\\theta_{online}',
      references: [{title:'BYOL reference', url:'https://github.com/deepmind/deepmind-research/tree/master/byol'}]
    },
    {
      id: 'ijepa', phase: 'phase5', title: 'I-JEPA', english: 'Image JEPA',
      tagline: '在表征空间预测被遮挡区域，不做像素级重建，学习更语义化的视觉表示。',
      formula: 'L=\\|Predictor(context)-Target(block)\\|',
      references: [{title:'I-JEPA official repository', url:'https://github.com/facebookresearch/ijepa'}]
    },
    {
      id: 'nerf', phase: 'phase5', title: 'NeRF', english: 'Neural Radiance Fields',
      tagline: '用 MLP 表示连续 3D 场，沿相机射线积分颜色和密度生成新视角。',
      formula: 'C(r)=\\int T(t)\\sigma(r(t))c(r(t),d)dt',
      references: [{title:'NeRF official repository', url:'https://github.com/bmild/nerf'}]
    },
    {
      id: '3dgs', phase: 'phase5', title: '3D Gaussian Splatting', english: '3D Gaussian Splatting',
      tagline: '用可优化的三维高斯椭球显式表示场景，实现高质量实时新视角合成。',
      formula: '\\alpha_i=1-\\exp(-\\sigma_i\\delta_i)',
      references: [{title:'3DGS official repository', url:'https://github.com/graphdeco-inria/gaussian-splatting'}]
    },
    {
      id: 'dust3r', phase: 'phase5', title: 'DUSt3R', english: 'DUSt3R',
      tagline: '无需相机参数，直接从图像对预测密集 3D 点图并对齐到同一空间。',
      formula: '(P_1,P_2,conf)=Transformer(I_1,I_2)',
      references: [{title:'DUSt3R official repository', url:'https://github.com/naver/dust3r'}]
    },
    {
      id: 'pointnet', phase: 'phase5', title: 'PointNet', english: 'PointNet',
      tagline: '用共享 MLP 和 max pooling 处理无序点云，建立点云深度学习入口。',
      formula: 'f(\\{x_i\\})=\\gamma(\\max_i h(x_i))',
      references: [{title:'PointNet official repository', url:'https://github.com/charlesq34/pointnet'}]
    },
    {
      id: 'orbslam3', phase: 'phase5', title: 'ORB-SLAM3', english: 'ORB-SLAM3',
      tagline: '跟踪、局部建图和回环检测三线程协作，从视频估计相机轨迹与地图。',
      formula: '\\min \\sum \\rho(\\|x_{ij}-\\pi(T_iX_j)\\|^2)',
      references: [{title:'ORB-SLAM3 official repository', url:'https://github.com/UZ-SLAMLab/ORB_SLAM3'}]
    },
    {
      id: 'bev', phase: 'phase5', title: 'BEV Perception', english: 'Bird-Eye-View Perception',
      tagline: '把多相机图像特征提升到三维再投影到鸟瞰平面，是自动驾驶空间感知核心。',
      formula: 'BEV=Pool(Lift(ImageFeatures,Depth))',
      references: [{title:'BEVFusion reference', url:'https://github.com/mit-han-lab/bevfusion'}]
    },
    {
      id: 'occupy', phase: 'phase5', title: 'Occupancy Networks', english: 'Occupancy Networks',
      tagline: '预测三维空间每个体素是否被占据，比 3D 框更细粒度地描述可通行空间。',
      formula: 'o=f_\\theta(x,z)\\in[0,1]',
      references: [{title:'Occupancy Networks reference', url:'https://github.com/autonomousvision/occupancy_networks'}]
    },
    {
      id: 'c3d', phase: 'phase5', title: 'C3D', english: '3D ConvNet',
      tagline: '用三维卷积同时在空间和时间上提取视频动作特征。',
      formula: 'Y(t,x,y)=\\sum_{\\tau,i,j}W(\\tau,i,j)X(t+\\tau,x+i,y+j)',
      references: [{title:'C3D project page', url:'https://github.com/facebookarchive/C3D'}]
    },
    {
      id: 'bytetrack', phase: 'phase5', title: 'ByteTrack', english: 'ByteTrack',
      tagline: '把低分检测框也纳入二阶段关联，减少遮挡或低置信目标的 ID 丢失。',
      formula: 'associate(high)\\rightarrow associate(low)',
      references: [{title:'ByteTrack official repository', url:'https://github.com/ifzhang/ByteTrack'}]
    },
    {
      id: 'botsort', phase: 'phase5', title: 'BoT-SORT', english: 'BoT-SORT',
      tagline: '在 ByteTrack 基础上加入相机运动补偿和 ReID 特征，提升多目标跟踪稳定性。',
      formula: 'cost=\\lambda IoU+(1-\\lambda)ReID',
      references: [{title:'BoT-SORT official repository', url:'https://github.com/NirAharon/BoT-SORT'}]
    },
    {
      id: 'deeppose', phase: 'phase5', title: 'DeepPose', english: 'DeepPose',
      tagline: '早期深度姿态估计方法，直接用 CNN 回归人体关键点坐标。',
      formula: '\\hat{y}=CNN(I)',
      references: [{title:'DeepPose paper', url:'https://arxiv.org/abs/1312.4659'}]
    },
    {
      id: 'openpose', phase: 'phase5', title: 'OpenPose', english: 'OpenPose',
      tagline: '自底向上预测关键点热力图和肢体亲和场，再做二分匹配组成人体实例。',
      formula: 'PAF(p)=unit(limb)',
      references: [{title:'OpenPose official repository', url:'https://github.com/CMU-Perceptual-Computing-Lab/openpose'}]
    },
    {
      id: 'mediapipe', phase: 'phase5', title: 'MediaPipe Pose', english: 'MediaPipe Pose',
      tagline: '面向实时移动端的人体姿态管线，输出 33 个关键点和可选 3D 坐标。',
      formula: 'landmarks=PoseLandmarker(I)',
      references: [{title:'MediaPipe official repository', url:'https://github.com/google-ai-edge/mediapipe'}]
    },
    {
      id: 'vitpose', phase: 'phase5', title: 'ViTPose', english: 'ViTPose',
      tagline: '用纯 ViT 骨干输出关键点热力图，展示 Transformer 在人体姿态上的强迁移能力。',
      formula: 'Heatmap=Head(ViT(I))',
      references: [{title:'ViTPose official repository', url:'https://github.com/ViTAE-Transformer/ViTPose'}]
    }
  ].forEach(function(spec) {
    if (!window.AlgorithmContent[spec.id]) {
      window.AlgorithmContent[spec.id] = makeTeachingConfig(spec);
    }
  });

  if (window.AlgorithmContent.sd && !window.AlgorithmContent.stable_diffusion) {
    window.AlgorithmContent.stable_diffusion = window.AlgorithmContent.sd;
  }
  if (window.AlgorithmContent.template_match && !window.AlgorithmContent.tpl_match) {
    window.AlgorithmContent.tpl_match = Object.assign({}, window.AlgorithmContent.template_match);
    window.AlgorithmContent.tpl_match.endpoint = '/api/demo/template_match';
  }

  const phaseOneVisualStories = {
    grayscale: {
      intro: '灰度不是去掉颜色，而是把 RGB 按人眼敏感度压成一个亮度通道。',
      cards: [
        {
          type: 'bars',
          title: '三种颜色贡献不一样',
          text: '绿色对人眼亮度影响最大，蓝色最小，所以灰度常用感知加权而不是简单平均。',
          items: [
            { label: 'R', value: 30, caption: '0.299', color: '#ef4444' },
            { label: 'G', value: 59, caption: '0.587', color: '#22c55e' },
            { label: 'B', value: 11, caption: '0.114', color: '#3b82f6' }
          ]
        },
        {
          type: 'pixels',
          title: '彩色像素变成亮度格',
          text: '每个像素从 [R,G,B] 变成一个 0-255 的亮度值，后续阈值、梯度和角点都更容易处理。',
          rows: 8,
          cols: 12,
          palette: ['#1e293b','#334155','#475569','#64748b','#94a3b8','#cbd5e1','#f8fafc']
        }
      ]
    },
    histogram: {
      intro: '直方图把图像从“在哪里亮”改成“有多少像素这么亮”。',
      cards: [
        {
          type: 'histogram',
          title: '亮度分布就是图像性格',
          text: '柱子挤在左边通常偏暗，挤在右边偏亮，范围很窄说明对比度不足。',
          values: [58, 72, 66, 50, 28, 14, 10, 8, 7, 10, 15, 24, 30, 25, 16, 9]
        },
        {
          type: 'bars',
          title: '均衡化像拉开橡皮筋',
          text: 'CDF 映射会把拥挤的亮度段拉开，让暗部和亮部使用更多可见灰度。',
          items: [
            { label: '原始动态范围', value: 38, caption: '窄', color: '#94a3b8' },
            { label: '均衡后范围', value: 92, caption: '宽', color: '#66f2c2' }
          ]
        }
      ]
    },
    threshold: {
      intro: '阈值化是在亮度轴上画一条线：线的一边是背景，另一边是前景。',
      cards: [
        {
          type: 'threshold',
          title: '一条线切开前景和背景',
          text: '阈值越低，保留下来的白色前景越多；阈值越高，只留下最亮区域。',
          position: 52
        },
        {
          type: 'histogram',
          title: 'Otsu 在两团像素之间找谷底',
          text: '当前景和背景形成两个峰时，Otsu 会选择让两类分得最开的阈值。',
          values: [8, 18, 48, 76, 58, 24, 8, 5, 7, 14, 36, 70, 74, 42, 18, 8]
        }
      ]
    },
    noise: {
      intro: '噪声是图像里的“不可信像素”：有的轻微抖动，有的直接坏成黑白点。',
      cards: [
        {
          type: 'pixels',
          title: '椒盐噪声像坏点',
          text: '少量像素突然变成纯黑或纯白，中值滤波通常能把这种极端值排除掉。',
          rows: 8,
          cols: 12,
          palette: ['#020617','#111827','#1e293b','#334155','#f8fafc']
        },
        {
          type: 'bars',
          title: '高斯噪声像连续抖动',
          text: '大多数像素只偏一点点，少数像素偏得较多，所以它更像传感器读数的随机误差。',
          items: [
            { label: '小扰动', value: 82, caption: '常见', color: '#66f2c2' },
            { label: '大扰动', value: 24, caption: '少见', color: '#f97316' }
          ]
        }
      ]
    },
    gaussian: {
      intro: '高斯模糊是温和的局部平均：中心像素说话最大声，越远声音越小。',
      cards: [
        {
          type: 'kernel',
          title: '中心权重大，边缘权重小',
          text: '3x3 或更大的高斯核会按距离分配权重，因此平滑噪声但不会像均值滤波那样生硬。',
          values: [1, 2, 1, 2, 4, 2, 1, 2, 1]
        },
        {
          type: 'window',
          title: '滑窗加权平均',
          text: '窗口扫过图像，每次用周围像素加权求和，sigma 越大，影响范围越宽。',
          values: [20, 38, 52, 72, 160, 86, 96, 112, 128]
        }
      ]
    },
    sobel: {
      intro: 'Sobel 关心”变化”：哪里亮度突然变了，哪里就可能有边缘。',
      cards: []
    },
    median: {
      intro: '中值滤波不平均，而是排序后取中间值，所以特别擅长处理极端坏点。',
      cards: [
        {
          type: 'window',
          title: '极端值被挤到队尾',
          text: '窗口里即使有 240 这样的异常亮点，排序后中位数仍来自正常邻域。',
          values: [32, 35, 36, 38, 240, 39, 40, 42, 44]
        },
        {
          type: 'pixels',
          title: '去噪时更保边',
          text: '因为结果必须来自邻域已有像素，中值滤波比均值滤波更不容易把边缘抹灰。',
          rows: 8,
          cols: 12,
          palette: ['#020617','#111827','#1e293b','#f8fafc','#e2e8f0']
        }
      ]
    },
    bilateral: {
      intro: '双边滤波有两个条件：离得近、颜色像。两个都满足，才会参与平滑。',
      cards: [
        {
          type: 'bilateral',
          title: '不跨边缘乱平均',
          text: '边缘另一侧虽然空间上很近，但颜色差异大，所以权重会被压低。',
        },
        {
          type: 'bars',
          title: '空间核 × 颜色核',
          text: '普通高斯只看距离；双边滤波再乘一个颜色相似度，因此能平滑同质区域并保留边界。',
          items: [
            { label: '空间相近', value: 90, caption: '高', color: '#38bdf8' },
            { label: '颜色相似', value: 72, caption: '决定保边', color: '#66f2c2' },
            { label: '跨边缘权重', value: 18, caption: '低', color: '#f97316' }
          ]
        }
      ]
    }
  };

  Object.keys(phaseOneVisualStories).forEach(function(id) {
    if (window.AlgorithmContent[id]) {
      window.AlgorithmContent[id].visualStory = phaseOneVisualStories[id];
    }
  });

  // ── Phase 2-3 newly implemented modules ──
  window.AlgorithmContent.shitomasi = {
    phase: '阶段二 · 经典结构与几何视觉',
    title: 'Shi-Tomasi 角点检测',
    english: 'Shi-Tomasi Corner Detection',
    tagline: '只看两个方向梯度都强的地方。和 Harris 用同一个结构张量，但角点响应换成了 min(λ₁,λ₂)。',
    status: '真实 NumPy 算法',
    difficulty: '进阶',
    endpoint: '/api/demo/shitomasi',
    formula: 'R = \\min(\\lambda_1, \\lambda_2),\\quad M = G_{\\sigma} * \\begin{bmatrix}I_x^2 & I_x I_y \\\\ I_x I_y & I_y^2\\end{bmatrix}',
    principles: [
      '角点有个很直观的定义：把一个小窗口放在图像上，往任何方向挪一点，窗口里的像素都会明显变化。边缘只有一个方向是这样，平坦区域两个方向都不是。',
      'Harris 把两个特征值揉成一个数 R = det - k·trace²，好处是算得快；坏处是那个 k 需要调。Shi-Tomasi 更直接，取 min(λ₁,λ₂)，两个方向都强才留下，不用调那个 k。',
      'Shi-Tomasi 是光流追踪（KLT tracker）的标配角点检测器。因为它只留两边都强的点，这些点跟踪起来最稳定，不容易跟丢。'
    ],
    core: [
      ['输入', '灰度图，和 Harris 一样从结构张量出发'],
      ['关键', '解析求特征值 λ₁,λ₂，取 min 做响应'],
      ['输出', '角点坐标 + 响应强度，经过 NMS 去重']
    ],
    pipeline: [
      ['灰度化', '把彩色压成一个亮度通道，梯度和角点都只依赖亮度。'],
      ['Sobel 梯度', '分别算 Ix 和 Iy，水平和垂直两个方向的亮度变化。'],
      ['结构张量', 'Ixx = Gσ*Ix², Iyy = Gσ*Iy², Ixy = Gσ*IxIy。高斯窗口给周围像素加权。'],
      ['特征值分解', 'λ₁,λ₂ = (trace ± √(trace²-4det))/2。解析公式，不用数值求解。'],
      ['角点响应', 'R = min(λ₁,λ₂)。只有两边特征值都大的位置才得高分。'],
      ['阈值 + NMS', '响应不够的直接丢掉，靠太近的只留最强的。']
    ],
    references: [
      { title: 'Shi-Tomasi 原始论文', description: 'Good Features to Track (CVPR 1994)', url: 'https://ieeexplore.ieee.org/document/323794' },
      { title: 'OpenCV goodFeaturesToTrack', description: 'cv::goodFeaturesToTrack 的官方文档', url: 'https://docs.opencv.org/4.x/dd/d1a/group__imgproc__feature.html' }
    ]
  };

  window.AlgorithmContent.ncuts = {
    phase: '阶段二 · 经典结构与几何视觉',
    title: 'Normalized Cuts',
    english: 'Normalized Cuts Segmentation',
    tagline: '把图像当成图来切——节点是像素，边是相似度，一刀切在亲和力最弱的地方。',
    status: '真实 NumPy 算法',
    difficulty: '进阶',
    endpoint: '/api/demo/ncuts',
    formula: '\\text{Ncut}(A,B) = \\frac{\\text{cut}(A,B)}{\\text{assoc}(A,V)} + \\frac{\\text{cut}(A,B)}{\\text{assoc}(B,V)}',
    principles: [
      '普通的最小割容易切出孤立的几个像素，因为切掉的边数确实很少。Normalized Cuts 在分母上加了一个“区域内部总关联度”，强迫算法去找“切掉的边少，同时两个区域各自都很紧密”的分割。',
      '这个优化问题是 NP-hard 的，但把它松弛成求解图拉普拉斯矩阵的第二小特征向量（Fiedler 向量），就变成了一个特征值问题，可以在多项式时间内解出来。',
      'Fiedler 向量给每个像素一个连续的分值——正的一边，负的另一边。对每个子区域可以递归做同样的事，直到 Ncut 值太高（说明再切就不自然了）或者区域太小。'
    ],
    core: [
      ['输入', '降采样后的图像（~2000 像素），每个像素是图的一个节点'],
      ['关键', '亲和矩阵 W → 归一化拉普拉斯 → Fiedler 向量 → 递归二分'],
      ['输出', '每个像素的区域标签，上采样回原图尺寸']
    ],
    pipeline: [
      ['降采样', '把图缩到 ~40px 宽，节点数可控，亲和矩阵才不会太大。'],
      ['建亲和图', 'W[i,j] = exp(-颜色距离²/σ_c² - 空间距离²/σ_x²)。颜色像 + 位置近 = 强连接。'],
      ['归一化拉普拉斯', 'L = D⁻¹ᐟ²(D-W)D⁻¹ᐟ²，对称且半正定，保证特征值是实数。'],
      ['特征分解', 'eigh 求最小的几个特征值/特征向量。λ₁ 恒为 0（平凡解），λ₂ 和对应向量是关键。'],
      ['Fiedler 向量二分', '按第二特征向量把节点分成正负两组，再搜索让 Ncut 值最小化的分割点。'],
      ['递归分割', '对每个子区域重复以上步骤，直到 Ncut 值太高或区域太小。']
    ],
    controls: [
      { name: 'sigma_i', label: '颜色带宽 σc', type: 'range', min: 0.02, max: 0.4, step: 0.02, value: 0.10 },
      { name: 'sigma_x', label: '空间带宽 σx', type: 'range', min: 0.01, max: 0.2, step: 0.01, value: 0.05 },
      { name: 'max_regions', label: '最大区域数', type: 'range', min: 2, max: 10, step: 1, value: 5 }
    ],
    references: [
      { title: 'Normalized Cuts 原始论文', description: 'Shi & Malik, TPAMI 2000', url: 'https://ieeexplore.ieee.org/document/868688' },
      { title: 'Spectral Graph Theory', description: 'Chung, CBMS 1997 — 拉普拉斯矩阵的数学基础', url: 'https://mathweb.ucsd.edu/~fan/cbms.pdf' }
    ]
  };

  window.AlgorithmContent.bovw_spm = {
    phase: '阶段二 · 经典结构与几何视觉',
    title: 'BoVW + SPM',
    english: 'Bag of Visual Words + Spatial Pyramid Matching',
    tagline: '像做文本分类一样做图像分类：局部特征是"视觉单词"，空间金字塔保留词的大致位置。',
    status: '真实 NumPy 算法',
    difficulty: '进阶',
    endpoint: '/api/demo/bovw_spm',
    formula: '\\mathbf{h}_{\\text{SPM}} = \\bigoplus_{\\ell=0}^{L} w_\\ell \\cdot \\bigoplus_{g=1}^{4^\\ell} \\mathbf{h}_{\\ell,g}',
    principles: [
      '文本分类的做法是：把文章拆成词 → 统计词频 → 分类。BoVW 把同样的思路用在图像上：SIFT 描述子就是"视觉单词"，每张图的视觉词频直方图就是它的特征向量。',
      '普通的 BoVW 完全丢弃了空间信息——"天空在图片上方，草地在下方"这种常识它完全不知道。空间金字塔匹配（SPM）把图分成越来越细的网格（1×1, 2×2, 4×4），每个格子里独立统计词频，最后加权拼起来。',
      '这个流水线是 2006-2012 年间图像分类的标准做法，后来被 CNN 特征取代。但它展示了一个重要思路：手工特征 + 无监督词典 + 空间池化，很多视觉理解任务本质上是在做同一件事。'
    ],
    core: [
      ['输入', '任意图像，SIFT 提取 ~200 个 128 维局部描述子'],
      ['关键', 'K-means 聚成视觉词典 → 每个描述子量化成词 → 空间金字塔统计'],
      ['输出', 'SPM 全局描述子 + 各类别相似度分数']
    ],
    pipeline: [
      ['SIFT 特征', '从图像中提取 ~200 个关键点和它们的 128 维描述子。'],
      ['建视觉词典', 'K-means 把所有描述子聚成 K 类（~200），每类的中心就是一个"视觉词"。'],
      ['量化', '每个描述子找最近的视觉词——相当于把局部特征"翻译"成词汇。'],
      ['空间金字塔', '图分成 1×1, 2×2, 4×4 共 21 个格子，每格单独统计词频直方图。'],
      ['加权拼接', 'L0 权重 1/4, L1 权重 1/4, L2 权重 1/2，拼成一个长向量后 L2 归一化。'],
      ['分类', 'SPM 向量与各类别模板做余弦相似度比较，最像的那个就是预测类别。']
    ],
    controls: [
      { name: 'vocab_size', label: '视觉词数量', type: 'range', min: 50, max: 500, step: 25, value: 200 }
    ],
    references: [
      { title: 'Beyond Bags of Features: SPM', description: 'Lazebnik, Schmid, Ponce — CVPR 2006', url: 'https://ieeexplore.ieee.org/document/1641015' },
      { title: 'Visual Categorization with Bags of Keypoints', description: 'Csurka 等, ECCV 2004 经典', url: 'https://www.cs.cmu.edu/~efros/courses/LBMV07/Papers/csurka-eccv-04.pdf' }
    ]
  };

  window.AlgorithmContent.calibration = {
    phase: '阶段二 · 经典结构与几何视觉',
    title: '相机标定',
    english: 'Camera Calibration (Zhang)',
    tagline: '用几张棋盘格照片算出相机的内参、外参和畸变——把像素坐标和真实世界坐标对应起来。',
    status: '真实 NumPy 算法',
    difficulty: '进阶',
    endpoint: '/api/demo/calibration',
    formula: 's\\begin{bmatrix}u\\\\v\\\\1\\end{bmatrix} = K[R|t]\\begin{bmatrix}X\\\\Y\\\\0\\\\1\\end{bmatrix},\\quad K = \\begin{bmatrix}f_x & 0 & c_x\\\\0 & f_y & c_y\\\\0 & 0 & 1\\end{bmatrix}',
    principles: [
      '相机标定回答一个核心问题：图像上的某个像素 (u,v) 对应真实世界里的哪条射线？内参 K 管相机自身的属性（焦距、主点），外参 [R|t] 管相机在世界中的位置和朝向。',
      '张正友标定法只用几张不同角度的棋盘格照片就能标定。因为棋盘格是平面（Z=0），每张图给出一个从世界平面到图像平面的单应性映射，多个单应性合起来就能解出 K。',
      '畸变里最常见的是径向畸变——画面边缘的直线会弯。广角镜头桶形畸变（k1 负），长焦镜头枕形畸变（k1 正）。标定出的 k1, k2 可以用来矫正图像。'
    ],
    core: [
      ['输入', '同一棋盘格从 5-6 个不同角度拍摄的照片'],
      ['关键', '每张图的单应性 → 多张图联合解 K → 分解出 R,t → 估计畸变'],
      ['输出', '内参 K（fx,fy,cx,cy）+ 畸变系数 k1,k2 + 每张图的外参 R,t']
    ],
    pipeline: [
      ['棋盘格角点', '检测每张图上棋盘格的交叉点，建立 3D 世界点到 2D 像素点的对应关系。'],
      ['单应性估计', '每张图用 DLT 估一个 3×3 单应性，把世界平面映射到图像平面。'],
      ['内参求解', '利用多张图单应性间的约束关系，SVD 解出 B=K⁻ᵀK⁻¹，再从 B 提取 K。'],
      ['外参分解', '有了 K 和每张图的 H，分解出旋转矩阵 R 和平移向量 t。'],
      ['畸变估计', '线性求解径向畸变 k1, k2，衡量真实像素和理想投影之间的偏差。'],
      ['重投影误差', '把 3D 点投回图像，和检测到的角点位置比，差距越小标定越准。']
    ],
    references: [
      { title: 'Zhang 标定法原始论文', description: 'A Flexible New Technique for Camera Calibration, TPAMI 2000', url: 'https://www.microsoft.com/en-us/research/publication/a-flexible-new-technique-for-camera-calibration/' },
      { title: 'OpenCV 标定教程', description: 'Camera Calibration using OpenCV', url: 'https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html' }
    ]
  };

  window.AlgorithmContent.epipolar = {
    phase: '阶段二 · 经典结构与几何视觉',
    title: '对极几何',
    english: 'Epipolar Geometry',
    tagline: '两个相机看同一个场景——左图上一个点，在右图上一定落在某条线上。找到这条线，匹配就从二维搜变成一维搜。',
    status: '真实 NumPy 算法',
    difficulty: '进阶',
    endpoint: '/api/demo/epipolar',
    formula: '\\mathbf{x}_2^T F \\mathbf{x}_1 = 0,\\quad F = K_2^{-T} [t]_\\times R K_1^{-1}',
    principles: [
      '假设你有两张从不同角度拍的照片，SIFT 找到了几百个匹配点。但里面有不少错的。对极几何给你一个强约束：左图上一点 p1，在右图上匹配的 p2 必须落在对极线 l2 = F·p1 上。不在这条线上的匹配，一定是错的。',
      '8 点法是最经典的基础矩阵估计算法：只要 8 对匹配点就能线性解出 F。但数据要先做归一化（零均值、单位方差），否则数值很不稳定。算出 F 后还要把最小的奇异值强制置零，因为 F 的秩只能是 2。',
      '有了 F 和内参 K，就能算出本质矩阵 E = K₂ᵀFK₁。E 里只藏着旋转和平移——把它 SVD 分解就能恢复两个相机之间的相对运动 R 和 t。'
    ],
    core: [
      ['输入', '同一场景从两个角度拍的照片'],
      ['关键', 'SIFT匹配 → 归一化8点法 → F矩阵(秩2约束) → 对极线 → E矩阵 → R,t'],
      ['输出', 'F矩阵、对极线可视化、E矩阵、旋转R和平移t']
    ],
    pipeline: [
      ['特征匹配', 'SIFT 提取 + 比值测试，筛出可靠的匹配对。'],
      ['归一化8点法', '先把匹配点做等距归一化，再建 A 矩阵用 SVD 求解 F。'],
      ['秩2约束', '对求出的 F 做 SVD，把最小的 σ₃ 置零再乘回去——不这样做 F 不满足对极约束。'],
      ['对极线', '每条对极线过极点，用 F 把左图点映射成右图上的线（反过来也行）。'],
      ['本质矩阵', 'E = KᵀFK，去掉了内参，只留下旋转和平移的信息。'],
      ['恢复 R,t', 'E 做 SVD 分解，4 组候选解中选让大部分点在两个相机前方的那组。']
    ],
    controls: [
      { name: 'ratio', label: '匹配比值阈值', type: 'range', min: 0.55, max: 0.95, step: 0.05, value: 0.75 }
    ],
    references: [
      { title: '八点法经典论文', description: 'Hartley — In Defense of the Eight-Point Algorithm, TPAMI 1997', url: 'https://ieeexplore.ieee.org/document/623246' },
      { title: 'Multiple View Geometry', description: 'Hartley & Zisserman, 第 9-11 章', url: 'https://www.robots.ox.ac.uk/~vgg/hzbook/' }
    ]
  };

  window.AlgorithmContent.sfm = {
    phase: '阶段二 · 经典结构与几何视觉',
    title: '三角测量与运动恢复结构',
    english: 'Triangulation & Structure from Motion',
    tagline: '两幅图 + 已知相机位姿 → 用三角测量把 2D 匹配点推回 3D 空间，重建出稀疏的立体结构。',
    status: '真实 NumPy 算法',
    difficulty: '进阶',
    endpoint: '/api/demo/sfm',
    formula: '\\mathbf{X} = \\arg\\min \\sum_i \\|\\mathbf{x}_i - \\pi(P_i, \\mathbf{X})\\|^2',
    principles: [
      '三角测量的原理很直观：左相机发出一条射线穿过像素 p1，右相机发出一条射线穿过匹配点 p2——两条射线在 3D 空间中交会的地方就是那个点在真实世界里的位置。实际操作中用 SVD 解线性方程组。',
      '恢复出来的 3D 点有些不可靠：落在相机后面的（负深度）肯定是错的；重投影误差太大的可能匹配本身就有问题。把这两种过滤掉，剩下的点大致就是场景的稀疏结构。',
      '完整的 SfM 流水线还要做 Bundle Adjustment——同时微调所有相机位姿和所有 3D 点位置，让总的投影误差最小。这是大规模 3D 重建的核心优化步骤。'
    ],
    core: [
      ['输入', '两幅视图 + SIFT 匹配对'],
      ['关键', 'F→E→R,t→投影矩阵→线性三角化(SVD)→过滤→点云渲染'],
      ['输出', '3D 点云（可旋转视角）+ 深度着色 + 重投影误差']
    ],
    pipeline: [
      ['匹配与对极', '从两幅图像中提取 SIFT 特征并匹配，估计 F 矩阵。'],
      ['恢复位姿', 'F → E → SVD 分解 → 旋转 R 和平移 t。'],
      ['投影矩阵', 'P₀ = K[I|0], P₁ = K[R|t]——两幅图的完整投影矩阵。'],
      ['三角化', '每对匹配点建 4×4 的 A 矩阵，SVD 求解 3D 坐标 X。'],
      ['过滤', '去掉深度为负的点，去掉重投影误差 >20px 的点。'],
      ['点云渲染', '把 3D 点按深度着色（近红远蓝），渲染成 2D 俯视图和透视投影。']
    ],
    controls: [
      { name: 'ratio', label: '匹配比值阈值', type: 'range', min: 0.55, max: 0.95, step: 0.05, value: 0.75 }
    ],
    references: [
      { title: 'Multiple View Geometry', description: 'Hartley & Zisserman, 第 12 章（SfM）和第 18 章（N-view）', url: 'https://www.robots.ox.ac.uk/~vgg/hzbook/' },
      { title: 'COLMAP', description: 'Schoenberger 等 — 通用 SfM + MVS 开源流水线', url: 'https://colmap.github.io/' }
    ]
  };

  const phaseTwoVisualStories = {
    shitomasi: {
      intro: '角点不是“亮点”，而是窗口向任意方向移动都会明显变差的位置。',
      cards: [
        { type: 'arrows', title: '两个方向都要有变化', text: '边缘只有一个方向变化明显；角点在 x/y 两个方向都变化明显，所以最小特征值也高。', labels: ['λ1', 'λ2', 'min'] },
        { type: 'threshold', title: '响应超过阈值才算角点', text: 'Shi-Tomasi 用 min(λ1,λ2) 做响应，阈值线扫过后只留下稳定位置。', position: 62 }
      ]
    },
    hough: {
      intro: 'Hough 的直觉是投票：图像空间的很多边缘点，一起支持参数空间里的同一条线。',
      cards: [
        { type: 'vote', title: '边缘点向参数空间投票', text: '每个边缘点对应很多可能直线；真正的直线会让投票在某个参数位置形成峰值。' },
        { type: 'histogram', title: '峰值就是共同证据', text: '累加器里越高的柱子，表示越多边缘点支持同一个几何模型。', values: [6, 12, 18, 28, 70, 34, 20, 16, 12, 58, 76, 38, 22, 14, 8, 5] }
      ]
    },
    morphology: {
      intro: '形态学把二值图当作形状集合，用一个结构元素在图上滑动来改变白色区域。',
      cards: [
        { type: 'morph', mode: 'erode', title: '腐蚀：形状向内收缩', text: '结构元素必须完全落在前景里才保留中心点，小噪点会被吃掉。' },
        { type: 'morph', mode: 'dilate', title: '膨胀：形状向外扩张', text: '结构元素只要碰到前景就扩张中心点，小断裂会被连接起来。' }
      ]
    },
    contour: {
      intro: '轮廓把像素块压缩成一条可测量的边界线。',
      cards: [
        { type: 'contour', title: '沿着前景边界行走', text: '算法只关心前景和背景交界处，把区域边界记录为点序列。' },
        { type: 'bars', title: '轮廓变成形状指标', text: '有了边界点，就能计算面积、周长、外接框和近似多边形。', items: [
          { label: '面积', value: 72, caption: '区域大小', color: '#66f2c2' },
          { label: '周长', value: 58, caption: '边界长度', color: '#38bdf8' },
          { label: '近似', value: 42, caption: '点数压缩', color: '#f97316' }
        ] }
      ]
    },
    nms: {
      intro: '非极大值抑制是在一串响应里只留下最强代表，删除旁边重复响应。',
      cards: [
        { type: 'nms', title: '只保留局部最高峰', text: '边缘响应通常是一条厚带；沿梯度方向比较后，只保留中心最大值。' },
        { type: 'threshold', title: '先变细，再阈值', text: 'NMS 负责去重变细，阈值负责过滤弱响应，两者合起来得到清晰边缘。', position: 58 }
      ]
    },
    template_match: {
      intro: '模板匹配像拿一张小卡片在大图上滑动，哪里最像，响应热图哪里最亮。',
      cards: [
        { type: 'template', title: '滑窗搜索整张图', text: '模板逐位置比较相似度，窗口移动时响应热图同步变化。' },
        { type: 'histogram', title: '最大响应给出目标位置', text: '响应图最高峰就是最相似的位置；多目标时可以取多个局部峰值。', values: [4, 8, 10, 16, 24, 38, 66, 82, 55, 32, 18, 12, 40, 72, 50, 16] }
      ]
    }
  };

  Object.keys(phaseTwoVisualStories).forEach(function(id) {
    if (window.AlgorithmContent[id]) {
      window.AlgorithmContent[id].visualStory = phaseTwoVisualStories[id];
    }
  });

  const refinedPhaseTwoVisualStories = {
    shitomasi: {
      intro: '第二阶段的关键是从“像素变化”走向“几何结构”：角点、直线、形状和局部峰值都要有明确判据。',
      cards: [
        { type: 'semanticAnim', anim: 'corner', title: '逐窗口计算结构张量响应', text: '画布会按扫描顺序移动窗口，并同步显示 lambda1、lambda2 和 min(lambda1, lambda2)。只有两个方向都强的位置才被保留为角点。', caption: 'structure tensor scan' },
        { type: 'threshold', title: '用最小特征值做稳定性门槛', text: 'Shi-Tomasi 不奖励单方向强边缘，而是看 min(lambda1, lambda2)。只有两个方向都稳定强响应的位置才留下。', position: 64 }
      ]
    },
    hough: {
      intro: 'Hough 不是凭空找线，而是让边缘点在参数空间投票：同一条真实直线会把票集中到同一个峰值。',
      cards: [
        { type: 'semanticAnim', anim: 'hough', title: '边缘点逐个投票到累加器', text: '左侧是图像空间的边缘点，右侧是 rho/theta 累加器。点越多，真实直线对应的参数峰值越明显。', caption: 'image -> accumulator' },
        { type: 'histogram', title: '峰值就是共同证据', text: '累加器高峰表示很多边缘点同意同一条几何模型；阈值只保留证据足够强的直线。', values: [6, 12, 18, 28, 70, 34, 20, 16, 12, 58, 76, 38, 22, 14, 8, 5] }
      ]
    },
    morphology: {
      intro: '形态学把二值图看成形状集合，结构元素像一把小尺子，在图上滑动并决定保留、删除或扩张。',
      cards: [
        { type: 'semanticAnim', anim: 'morph_erode', title: '腐蚀：逐位置判定“全命中”', text: '左边是输入二值形状，右边按扫描顺序显示输出。只有结构元素完全落在前景里，输出中心才保留。', caption: 'all hit -> keep' },
        { type: 'semanticAnim', anim: 'morph_dilate', title: '膨胀：逐位置判定“有命中”', text: '结构元素只要碰到任何前景，输出中心就点亮。因此目标会变粗，裂缝和小洞会被填上。', caption: 'any hit -> grow' }
      ]
    },
    contour: {
      intro: '轮廓不是整块像素，而是沿前景边界走出来的一串点；有了点序列，形状才能被测量和比较。',
      cards: [
        { type: 'semanticAnim', anim: 'contour', title: '边界追踪生成有序点列', text: '动画沿着前景边界逐点记录轮廓，右侧同步生成点序列。面积、周长、外接框都来自这条边界链。', caption: 'boundary -> ordered points' },
        { type: 'bars', title: '轮廓点产生形状指标', text: '轮廓把像素块变成可计算对象：面积看内部，周长看边界长度，近似多边形看结构复杂度。', items: [
          { label: 'area', value: 72, caption: 'region', color: '#66f2c2' },
          { label: 'perim', value: 58, caption: 'boundary', color: '#38bdf8' },
          { label: 'approx', value: 42, caption: 'vertices', color: '#f97316' }
        ] }
      ]
    },
    nms: {
      intro: '非极大值抑制不是普通阈值，而是沿响应方向做局部竞争：赢家留下，邻居被压暗。',
      cards: [
        { type: 'nms', title: '只保留局部最高峰', text: '厚边缘通常是一条响应带。NMS 沿梯度方向比较三个位置，只保留中间最高点，把边缘压成细线。' },
        { type: 'threshold', title: '先去重变细，再做强弱筛选', text: 'NMS 负责去掉重复响应，阈值负责过滤弱响应；两者配合才会得到清晰、稳定的边缘。', position: 58 }
      ]
    },
    template_match: {
      intro: '模板匹配像拿一张小卡片在大图上滑动，每个位置都计算相似度，响应图最高峰就是最可能的位置。',
      cards: [
        { type: 'semanticAnim', anim: 'template', title: '模板按扫描顺序生成响应图', text: '窗口从左到右、从上到下扫描大图；右下角响应图按同样顺序被填充，目标位置形成最亮峰值。', caption: 'raster scan response' },
        { type: 'histogram', title: '响应峰值给出目标坐标', text: '多个峰值可以表示多个相似目标；如果峰值不突出，说明模板和图像内容并不够匹配。', values: [4, 8, 10, 16, 24, 38, 66, 82, 55, 32, 18, 12, 40, 72, 50, 16] }
      ]
    }
  };

  Object.keys(refinedPhaseTwoVisualStories).forEach(function(id) {
    if (window.AlgorithmContent[id]) {
      window.AlgorithmContent[id].visualStory = refinedPhaseTwoVisualStories[id];
    }
  });

  const phaseThreeEnhancements = {
    kmeans: {
      controls: [{ name: 'k', label: '聚类数 K', type: 'range', min: 2, max: 8, step: 1, value: 4 }],
      visualStory: { intro: '经典结构与几何视觉开始从像素走向区域和结构，K-Means 是最直接的无监督分组入口。', cards: [
        { type: 'semanticAnim', anim: 'kmeans', title: '颜色点分配到最近中心', text: '像素被看成 RGB 空间里的点。每轮先按最近中心分配，再把中心移动到本簇均值。', caption: 'assign -> update' },
        { type: 'bars', title: 'K 控制分割粗细', text: 'K 越小，颜色区域越粗；K 越大，图像能保留更多颜色层次，但也更容易碎。', items: [
          { label: 'K小', value: 35, caption: '粗分区', color: '#38bdf8' },
          { label: 'K大', value: 82, caption: '细分区', color: '#fb7185' }
        ] }
      ] }
    },
    ncuts: {
      visualStory: { intro: 'Normalized Cuts 把图像看成图：节点是像素或超像素，边权表示相似度。', cards: [
        { type: 'semanticAnim', anim: 'ncuts', title: '切弱连接，保留强关联', text: '好的切分不是只让 cut 小，还要考虑各区域内部关联 assoc，避免切出孤立小碎片。', caption: 'cut / association' },
        { type: 'gradientSet', title: '谱向量像一条软分割轴', text: 'Fiedler 向量给每个节点一个连续值，再用阈值把软分割变成区域。', rows: [
          { label: 'v2', caption: 'soft partition', gradient: 'linear-gradient(90deg,#38bdf8,#e2e8f0,#fb7185)' }
        ] }
      ] }
    },
    watershed: {
      controls: [{ name: 'marker_distance', label: '种子间距', type: 'range', min: 4, max: 40, step: 1, value: 15 }],
      visualStory: { intro: '分水岭把梯度图当作地形：低处开始涨水，水盆相遇的山脊就是边界。', cards: [
        { type: 'semanticAnim', anim: 'watershed', title: '标记点向外淹没地形', text: '种子越密，区域越多；种子越稀，分割越粗。边缘梯度高的位置像山脊，会阻止区域合并。', caption: 'markers flood basins' },
        { type: 'threshold', title: '标记控制减少过分割', text: '如果每个小坑都当种子，结果会碎；用可靠前景/背景种子能让结果更稳定。', position: 46 }
      ] }
    },
    grabcut: {
      visualStory: { intro: 'GrabCut 是典型交互式分割：用户给粗框，算法迭代细化前景和背景。', cards: [
        { type: 'semanticAnim', anim: 'grabcut', title: '矩形框初始化前景概率', text: '框外先当背景，框内是可能前景；随后颜色模型和边界平滑项一起决定最终 mask。', caption: 'rect -> model -> mask' },
        { type: 'bars', title: '能量函数的两股力量', text: '数据项看颜色像不像前景，平滑项鼓励相邻相似像素同类。', items: [
          { label: '颜色项', value: 72, caption: 'GMM', color: '#fb7185' },
          { label: '平滑项', value: 58, caption: '邻域', color: '#38bdf8' }
        ] }
      ] }
    },
    slic: {
      controls: [
        { name: 'num_superpixels', label: '超像素数', type: 'range', min: 50, max: 400, step: 10, value: 200 },
        { name: 'compactness', label: '紧凑度', type: 'range', min: 1, max: 30, step: 1, value: 10 }
      ],
      visualStory: { intro: 'SLIC 是局部 K-Means：同时考虑颜色接近和空间接近。', cards: [
        { type: 'semanticAnim', anim: 'slic', title: '中心只在局部窗口里移动', text: '每个中心只和附近像素竞争，所以比全局 K-Means 更快，也更容易形成紧凑小块。', caption: 'Lab + xy clustering' },
        { type: 'bars', title: 'compactness 平衡形状和边界', text: '紧凑度高时小块更规则；紧凑度低时更贴近颜色边界。', items: [
          { label: '颜色', value: 70, caption: '贴边界', color: '#66f2c2' },
          { label: '空间', value: 55, caption: '更规则', color: '#facc15' }
        ] }
      ] }
    },
    hog_svm: {
      controls: [
        { name: 'cell_size', label: 'cell 大小', type: 'range', min: 4, max: 16, step: 2, value: 8 },
        { name: 'num_bins', label: '方向桶数', type: 'range', min: 6, max: 12, step: 1, value: 9 }
      ],
      visualStory: { intro: 'HOG 把局部边缘方向统计成直方图，让形状比原始像素更稳定。', cards: [
        { type: 'semanticAnim', anim: 'hog', title: '梯度方向投票到方向桶', text: '每个 cell 统计 0-180 度方向分布，强边缘贡献更多票；block normalize 减少光照影响。', caption: 'gradients -> histogram' },
        { type: 'arrows', title: 'SVM 在 HOG 向量空间分类', text: 'HOG 负责描述形状，SVM 负责学习“像不像目标”的线性分界。', labels: ['HOG', 'SVM', 'score'] }
      ] }
    },
    bovw_spm: {
      visualStory: { intro: 'BoVW 把局部特征当作视觉单词，SPM 再把粗略空间布局拼进去。', cards: [
        { type: 'semanticAnim', anim: 'bovw', title: '描述子量化成视觉词', text: 'SIFT 描述子先被 codebook 量化为词频，再按 1x1、2x2、4x4 网格池化。', caption: 'descriptor -> word histogram' },
        { type: 'histogram', title: '直方图表示图像内容', text: '同类图像往往有相近视觉词频；SPM 保留“词大概出现在图像哪里”。', values: [12, 28, 52, 34, 70, 46, 20, 58, 36, 16, 44, 62] }
      ] }
    },
    optical_flow: {
      controls: [
        { name: 'shift_x', label: '模拟横向位移', type: 'range', min: -8, max: 8, step: 1, value: 2 },
        { name: 'shift_y', label: '模拟纵向位移', type: 'range', min: -8, max: 8, step: 1, value: 1 },
        { name: 'window_size', label: 'LK 窗口', type: 'range', min: 7, max: 31, step: 2, value: 15 }
      ],
      visualStory: { intro: '光流估计相邻帧中局部纹理的移动方向和速度。', cards: [
        { type: 'semanticAnim', anim: 'optical_flow', title: '亮度恒定约束求局部运动', text: 'Lucas-Kanade 在局部窗口里用 Ix、Iy、It 解 u/v，窗口太小不稳，太大又会混合不同运动。', caption: 'Ix u + Iy v + It = 0' },
        { type: 'arrows', title: '向量场表达运动', text: '箭头方向表示移动方向，长度表示速度；真实视频里常在角点或纹理点上估计稀疏光流。', labels: ['frame t', 'frame t+1', 'flow'] }
      ] }
    },
    calibration: {
      visualStory: { intro: '相机标定把 3D 世界点和 2D 像素点对应起来，求相机内参和畸变。', cards: [
        { type: 'semanticAnim', anim: 'calibration', title: '棋盘格角点约束相机参数', text: '每张标定图提供一组 3D 平面点到 2D 像素点的映射，优化目标是最小重投影误差。', caption: '3D corners -> 2D image' },
        { type: 'bars', title: '重投影误差越小越可信', text: '标定质量通常看平均重投影误差；误差大说明角点检测、模型或图片覆盖范围有问题。', items: [
          { label: 'K', value: 74, caption: '内参', color: '#38bdf8' },
          { label: 'dist', value: 42, caption: '畸变', color: '#fb7185' }
        ] }
      ] }
    },
    epipolar: {
      visualStory: { intro: '对极几何把双目匹配从“整张图找点”压缩成“沿一条线找点”。', cards: [
        { type: 'semanticAnim', anim: 'epipolar', title: '一个点对应另一幅图上的一条线', text: '基础矩阵 F 把左图点 p1 映射成右图对极线 l2，正确匹配点必须落在这条线上。', caption: 'p2^T F p1 = 0' },
        { type: 'threshold', title: 'RANSAC 去掉错误匹配', text: '真实匹配里会有离群点，RANSAC 用多数一致的几何约束估计 F。', position: 66 }
      ] }
    },
    stereo: {
      controls: [
        { name: 'max_disparity', label: '最大视差', type: 'range', min: 8, max: 64, step: 4, value: 32 },
        { name: 'block_size', label: '匹配窗口', type: 'range', min: 5, max: 15, step: 2, value: 7 }
      ],
      visualStory: { intro: '校正后的双目图里，同名点只沿水平线搜索，视差越大通常越近。', cards: [
        { type: 'semanticAnim', anim: 'stereo', title: '沿对极行做块匹配', text: '左图 patch 在右图同一行搜索最小 SAD/SSD 的位置，横向位移就是视差。', caption: 'row search -> disparity' },
        { type: 'gradientSet', title: '视差到深度是反比关系', text: 'Z=fB/d：视差大表示近，视差小表示远；无视差区域通常不可靠。', rows: [
          { label: 'd', caption: '近', gradient: 'linear-gradient(90deg,#2563eb,#22c55e,#f97316,#fb7185)' },
          { label: 'Z', caption: '远', gradient: 'linear-gradient(90deg,#fb7185,#f97316,#22c55e,#2563eb)' }
        ] }
      ] }
    },
    sfm: {
      visualStory: { intro: 'SfM 把多视图匹配、相机位姿和三角测量串起来，恢复稀疏三维结构。', cards: [
        { type: 'semanticAnim', anim: 'sfm', title: '两条相机射线交会成 3D 点', text: '已知两台相机位姿和匹配点，就能用三角测量求空间点；更多视图再联合优化。', caption: 'rays -> 3D point' },
        { type: 'bars', title: 'Bundle Adjustment 联合优化', text: 'BA 同时调整相机和点云，让所有投影点尽量贴近观测点。', items: [
          { label: 'pose', value: 58, caption: '相机', color: '#38bdf8' },
          { label: 'points', value: 72, caption: '点云', color: '#66f2c2' },
          { label: 'error', value: 28, caption: '误差', color: '#fb7185' }
        ] }
      ] }
    }
  };

  Object.keys(phaseThreeEnhancements).forEach(function(id) {
    if (!window.AlgorithmContent[id]) return;
    var patch = phaseThreeEnhancements[id];
    if (patch.controls) window.AlgorithmContent[id].controls = patch.controls;
    if (patch.visualStory) window.AlgorithmContent[id].visualStory = patch.visualStory;
  });

  // ── Phase 4-5: Visual Stories ──
  var phaseFourFiveEnhancements = {
    cnn_basics: {
      visualStory: { intro: 'CNN 的核心创新是用反向传播自动学习卷积核，不用人手设计特征。', cards: [
        { type: 'semanticAnim', anim: 'corner', title: '卷积核在图像上滑动提取特征', text: '一个 3×3 或 5×5 的可学习窗口扫描全图，每个位置做一次加权求和，同一套权重在所有位置共享。', caption: 'kernel slides across image' },
        { type: 'bars', title: '卷积层 → 池化层 → 全连接', text: '卷积负责提取特征，池化降低分辨率增加感受野，全连接把空间特征聚合成类别判断。', items: [
          { label: 'Conv', value: 80, caption: '特征提取', color: '#38bdf8' },
          { label: 'Pool', value: 50, caption: '降采样', color: '#66f2c2' },
          { label: 'FC', value: 35, caption: '分类', color: '#f97316' }
        ] }
      ] }
    },
    resnet: {
      visualStory: { intro: 'ResNet 的残差连接让网络学会了"增量"而非"从头学"，使得 152 层深度可训练。', cards: [
        { type: 'bars', title: 'F(x) = H(x) - x：只学残差', text: '不直接拟合目标 H(x)，而是让网络输出 F(x)=H(x)-x，再通过跳跃连接加回输入。这样梯度可以直通浅层。', items: [
          { label: 'weight', value: 65, caption: 'F(x)', color: '#38bdf8' },
          { label: 'skip', value: 90, caption: '+ x', color: '#22c55e' },
          { label: 'relu', value: 70, caption: 'output', color: '#f97316' }
        ] },
        { type: 'gradientSet', title: 'Grad-CAM：梯度加权看模型关注哪', text: '对最后卷积层的每个通道用目标类别的梯度平均做权重，加权激活图再用 ReLU 去掉负值。', rows: [
          { label: 'grad', caption: 'backprop', gradient: 'linear-gradient(90deg,#ef4444,#f8fafc,#3b82f6)' },
          { label: 'CAM', caption: 'heatmap', gradient: 'linear-gradient(90deg,#020617,#ef4444,#facc15)' }
        ] }
      ] }
    },
    gan: {
      visualStory: { intro: 'GAN 不是单一网络，而是生成器和判别器的两人博弈——一个造假，一个打假。', cards: [
        { type: 'bars', title: '生成器 G：噪声 → 逼真图像', text: 'G 从随机向量 z 出发，通过转置卷积逐层放大，目标是骗过 D。', items: [
          { label: 'z~N(0,1)', value: 25, caption: '噪声', color: '#64748b' },
          { label: 'G(z)', value: 72, caption: '生成', color: '#38bdf8' },
          { label: 'D(G(z))', value: 58, caption: '判别', color: '#fb7185' }
        ] },
        { type: 'gradientSet', title: '模式坍塌：GAN 的经典失败模式', text: '当 G 发现某个输出总能骗过 D，就会只生成那几种样本——失去多样性。', rows: [
          { label: 'mode1', caption: '生成器只学会一种', gradient: 'linear-gradient(90deg,#38bdf8,#38bdf8,#38bdf8)' },
          { label: 'real', caption: '真实数据多种多样', gradient: 'linear-gradient(90deg,#ef4444,#f97316,#facc15,#22c55e,#3b82f6,#8b5cf6)' }
        ] }
      ] }
    },
    diffusion: {
      visualStory: { intro: '扩散模型从纯噪声出发，学习的不是直接生成，而是逐步"去噪"——每次只做一点点。', cards: [
        { type: 'gradientSet', title: '前向：逐步加噪直到完全随机', text: '训练时先把真实图像一步步加高斯噪声变成纯噪声，每一步的噪声强度由 schedule 控制。', rows: [
          { label: 't=0', caption: 'real image', gradient: 'linear-gradient(90deg,#22c55e,#22c55e)' },
          { label: 't=T/2', caption: '半噪', gradient: 'linear-gradient(90deg,#64748b,#94a3b8,#cbd5e1)' },
          { label: 't=T', caption: 'pure noise', gradient: 'linear-gradient(90deg,#f8fafc,#cbd5e1,#64748b)' }
        ] },
        { type: 'arrows', title: '反向：从噪声走回图像', text: '推理时从随机噪声开始，UNet 预测当前步该去掉的噪声，逐步还原。每步只改一点点。', labels: ['x_T', 'x_t', 'x_0'] }
      ] }
    },
    vit: {
      visualStory: { intro: 'ViT 把图像切成一块块 patch，像 NLP 的 token 一样送进 Transformer。这是 CNN 之外的全新范式。', cards: [
        { type: 'pixels', title: 'Patchify：把图切成固定大小格子', text: '16×16 的 patch 被拉平成向量，加位置编码后变成 Transformer 的输入 token。', rows: 8, cols: 12, palette: ['#1e293b','#334155','#475569','#64748b','#94a3b8','#cbd5e1','#e2e8f0','#f8fafc'] },
        { type: 'bars', title: '自注意力让每个 patch 看到全局', text: 'CNN 的卷积核只看到局部邻域，Transformer 的每个 token 都能直接与其他所有 token 交互。', items: [
          { label: 'CNN 3x3', value: 12, caption: '局部感受野', color: '#64748b' },
          { label: 'CNN 深层', value: 45, caption: '间接全局', color: '#38bdf8' },
          { label: 'ViT L1', value: 95, caption: '直接全局', color: '#22c55e' }
        ] }
      ] }
    },
    detr: {
      visualStory: { intro: 'DETR 把目标检测从"生成候选框→分类→NMS"变成了直接的集合预测，不需要 anchor 也不需要 NMS。', cards: [
        { type: 'bars', title: 'Object Query：可学习的位置探针', text: '100 个 object query 向量输入 Transformer 解码器，每个 query 学会关注图像中不同位置和尺度的物体。', items: [
          { label: 'Q1', value: 88, caption: '大物体', color: '#ef4444' },
          { label: 'Q2', value: 62, caption: '中物体', color: '#f97316' },
          { label: 'Q3', value: 35, caption: '小物体', color: '#3b82f6' }
        ] },
        { type: 'threshold', title: '二分匹配替代 NMS', text: '用匈牙利算法把预测框和真实框一一配对，没有配对上的预测就是"无物体"。这样就不需要手工 NMS 去重了。', position: 50 }
      ] }
    },
    clip: {
      visualStory: { intro: 'CLIP 不是单纯看图片，而是同时看图片和文字——把它们映射到同一个向量空间，让图文的距离有意义。', cards: [
        { type: 'arrows', title: '双塔架构：图像编码器 + 文本编码器', text: '两个独立的编码器把图像和文本映射成同维度的向量，用余弦相似度算它们多"匹配"。', labels: ['I→v', 'T→v', 'sim'] },
        { type: 'bars', title: '4 亿图文对训练出的零样本能力', text: '训练时用对比学习拉近匹配图文对、推远不匹配的。训练完后不需要微调就能做新任务。', items: [
          { label: '图文匹配', value: 95, caption: 'pos pair', color: '#22c55e' },
          { label: '不匹配', value: 15, caption: 'neg pair', color: '#ef4444' }
        ] }
      ] }
    },
    sam: {
      visualStory: { intro: 'SAM 是分割的基础模型：给一个点、一个框或者一句话，它就能分割出对应的物体。', cards: [
        { type: 'pixels', title: '提示驱动：点一下分割一个物体', text: '用户只需在图像上点一下或在目标周围画个框，提示编码器把位置信息注入掩码解码器。', rows: 6, cols: 10 },
        { type: 'bars', title: '三组件架构：图像编码 → 提示编码 → 掩码解码', text: '图像编码跑一次，提示编码随时响应新输入，掩码解码融合两者输出像素级分割。', items: [
          { label: 'ImgEnc', value: 85, caption: 'ViT', color: '#3b82f6' },
          { label: 'Prompt', value: 40, caption: 'pos', color: '#f97316' },
          { label: 'MaskDec', value: 70, caption: 'fusion', color: '#22c55e' }
        ] }
      ] }
    },
    nerf: {
      visualStory: { intro: 'NeRF 用一个 MLP 记住整个 3D 场景——输入 (x,y,z,θ,φ)，输出 (RGB, 密度)，然后沿射线采样渲染。', cards: [
        { type: 'arrows', title: '从不同角度看同一个场景', text: '训练数据只是从不同角度拍的照片，每张照片的每个像素对应一条空间射线。', labels: ['view1', 'view2', '3D'] },
        { type: 'gradientSet', title: '体渲染：沿射线积分颜色', text: '对每条射线均匀采样 3D 点，MLP 预测每个点的颜色和密度，从前到后累加得到像素色。', rows: [
          { label: 'near', caption: '密度低', gradient: 'linear-gradient(90deg,#020617,#1e293b,#475569)' },
          { label: 'hit', caption: '密度高', gradient: 'linear-gradient(90deg,#475569,#ef4444,#facc15)' },
          { label: 'far', caption: '密度低', gradient: 'linear-gradient(90deg,#facc15,#475569,#020617)' }
        ] }
      ] }
    },
    stable_diffusion: {
      visualStory: { intro: 'Stable Diffusion 把扩散搬到了 VAE 潜空间：在压缩后的特征上做扩散，大幅降低计算量。', cards: [
        { type: 'bars', title: '三个组件协同工作', text: 'VAE 负责压缩/解压图像，UNet 在潜空间里做去噪，CLIP 文本编码器把文字变成条件信号。', items: [
          { label: 'VAE', value: 60, caption: '压缩', color: '#8b5cf6' },
          { label: 'UNet', value: 80, caption: '去噪', color: '#38bdf8' },
          { label: 'CLIP', value: 55, caption: '文本', color: '#f97316' }
        ] },
        { type: 'gradientSet', title: '潜空间扩散：在压缩域做生成', text: '原图 512×512×3=786K 维，潜空间只有 64×64×4=16K 维——50 倍压缩，扩散步数大幅减少。', rows: [
          { label: 'pixel space', caption: '786,432 dims', gradient: 'linear-gradient(90deg,#ef4444,#f97316,#facc15)' },
          { label: 'latent space', caption: '16,384 dims', gradient: 'linear-gradient(90deg,#3b82f6,#38bdf8)' }
        ] }
      ] }
    },
    dino: {
      visualStory: { intro: 'DINO 用自监督学习训练 ViT，神奇的是：不需要任何标注，注意力图就自然涌现出物体分割。', cards: [
        { type: 'arrows', title: '学生-教师自蒸馏架构', text: '教师网络从学生网络的指数移动平均得到，学生的目标是匹配教师的输出——两个网络看同一张图的不同裁剪。', labels: ['student', 'teacher', 'match'] },
        { type: 'gradientSet', title: '注意力自发涌现物体轮廓', text: 'DINO 的 [CLS] token 自注意力图往往精确覆盖前景物体，这是自监督学习的涌现特性。', rows: [
          { label: 'attn', caption: 'object emerges', gradient: 'linear-gradient(90deg,#020617,#020617,#facc15,#facc15,#020617,#020617)' }
        ] }
      ] }
    },
    mae: {
      visualStory: { intro: 'MAE 的预训练任务极其简单：随机遮住 75% 的 patch，让模型从可见的 25% 重建全图。', cards: [
        { type: 'pixels', title: 'Mask 75%：只编码可见的 1/4', text: '被遮盖的 patch 不送入编码器，只有可见的少量 patch 经过 Transformer。这比 ViT 训练快 3 倍以上。', rows: 8, cols: 12, palette: ['#020617','#020617','#f8fafc','#f8fafc','#020617','#020617','#020617','#f8fafc','#f8fafc','#020617','#020617','#020617'] },
        { type: 'bars', title: '重建被遮住的 75%', text: '解码器接收编码后的可见 patch + 被遮盖的 mask token，输出重建的像素值。损失只在被遮盖位置计算。', items: [
          { label: 'encoded', value: 25, caption: '25%', color: '#22c55e' },
          { label: 'masked', value: 75, caption: '75%', color: '#ef4444' }
        ] }
      ] }
    },
    simclr: {
      visualStory: { intro: 'SimCLR 的核心思想：同一张图做两种随机增强，它们的特征应该最接近；不同图的特征应该远离。', cards: [
        { type: 'bars', title: '对比学习：拉近正样本，推开负样本', text: '每张图做两次随机裁剪+颜色扰动，同源的算正对，不同源的算负对。InfoNCE 损失在特征空间做对比。', items: [
          { label: 'pos pair', value: 92, caption: '同源不同增强', color: '#22c55e' },
          { label: 'neg pair', value: 18, caption: '不同源', color: '#ef4444' }
        ] },
        { type: 'gradientSet', title: '大 batch 是关键', text: 'SimCLR 需要大 batch（4096+）提供足够多负样本。batch 太小，对比学习效果会明显下降。', rows: [
          { label: 'bs=256', caption: '弱', gradient: 'linear-gradient(90deg,#ef4444,#f97316)' },
          { label: 'bs=4096', caption: '强', gradient: 'linear-gradient(90deg,#22c55e,#3b82f6,#8b5cf6)' }
        ] }
      ] }
    },
    moco: {
      visualStory: { intro: 'MoCo 用动量编码器和动态队列解耦了 batch size 和负样本数量的关系——大 batch 不是必需的。', cards: [
        { type: 'arrows', title: '动量更新：θ_k ← m·θ_k + (1-m)·θ_q', text: 'key 编码器的参数不是从 query 编码器直接复制，而是用动量慢慢靠近。这让 key 的特征空间更稳定。', labels: ['θ_q', 'EMA', 'θ_k'] },
        { type: 'bars', title: '动态队列存 65536 个负样本', text: '不用当前 batch 的其他样本做负样本，而是维护一个大队列。新 batch 进来时最旧的出去，大小不受 batch 限制。', items: [
          { label: 'queue', value: 90, caption: '65536 keys', color: '#38bdf8' },
          { label: 'batch', value: 30, caption: '256 imgs', color: '#64748b' }
        ] }
      ] }
    },
    byol: {
      visualStory: { intro: 'BYOL 连负样本都不要了——只用正对训练，靠 online 和 target 网络的不对称性防止坍塌。', cards: [
        { type: 'arrows', title: 'Online → predictor → target：自举学习', text: 'Online 网络多看一个 predictor 层，让它学习"如何预测 target 网络的特征"。target 从不反向传播。', labels: ['online', 'pred', 'target'] },
        { type: 'gradientSet', title: '不做对比，只用正样本', text: '没有 push away 负样本的力，理论上应该坍塌到常数特征。但 predictor 的不对称设计和 EMA 阻止了坍塌。', rows: [
          { label: 'aug1', caption: '同图←→同图', gradient: 'linear-gradient(90deg,#3b82f6,#22c55e)' }
        ] }
      ] }
    },
    ijepa: {
      visualStory: { intro: 'I-JEPA 不预测像素，而是在表征空间预测被遮盖区域的特征——更接近人类"理解后再补全"的方式。', cards: [
        { type: 'pixels', title: '遮住图像的大部分区域', text: 'context block 是可见的上下文，target block 是被遮盖的目标。模型只看 context，预测 target 的特征。', rows: 6, cols: 10, palette: ['#3b82f6','#3b82f6','#020617','#020617','#020617','#3b82f6','#3b82f6','#3b82f6','#020617','#020617'] },
        { type: 'bars', title: '预测表征而非重建像素', text: '像素重建容易被高频细节支配；特征空间的预测更关注语义结构，学到的表示在下游任务上更好。', items: [
          { label: '像素预测', value: 45, caption: 'MAE方式', color: '#64748b' },
          { label: '特征预测', value: 78, caption: 'I-JEPA', color: '#22c55e' }
        ] }
      ] }
    },
    ddpm: {
      visualStory: { intro: 'DDPM 是扩散模型的奠基之作：用马尔可夫链建模从图像到噪声再到图像的完整路径。', cards: [
        { type: 'gradientSet', title: '前向扩散：小步加噪的马尔可夫链', text: '每步只加一点点高斯噪声，经过 T=1000 步后图像变成各向同性的高斯分布。', rows: [
          { label: 'x₀', caption: 'image', gradient: 'linear-gradient(90deg,#22c55e,#22c55e)' },
          { label: 'x₅₀₀', caption: 'noisy', gradient: 'linear-gradient(90deg,#94a3b8,#64748b)' },
          { label: 'x₁₀₀₀', caption: 'noise', gradient: 'linear-gradient(90deg,#64748b,#1e293b)' }
        ] },
        { type: 'bars', title: '训练目标：预测噪声而非图像', text: 'DDPM 的核心发现：不是预测去噪后的图像，而是预测当前步加了什么噪声——这个小改变让训练稳定得多。', items: [
          { label: '预测噪声 ε', value: 92, caption: 'epsilon prediction', color: '#38bdf8' }
        ] }
      ] }
    },
    '3dgs': {
      visualStory: { intro: '3D Gaussian Splatting 用几百万个彩色半透明椭球表示 3D 场景，渲染速度比 NeRF 快 100 倍。', cards: [
        { type: 'bars', title: '显式高斯椭球 vs 隐式 MLP', text: 'Gaussian Splatting 每个椭球存 3D 位置、颜色、透明度、协方差。NeRF 用 MLP 隐式存。显式更快但更占内存。', items: [
          { label: 'NeRF', value: 30, caption: '隐式MLP', color: '#8b5cf6' },
          { label: '3DGS', value: 95, caption: '显式椭球', color: '#22c55e' }
        ] },
        { type: 'gradientSet', title: 'α-blending：从前到后叠透明度', text: '所有高斯椭球投影到屏幕后按深度排序，像 Photoshop 图层一样从前到后混合。每个像素的颜色是所有椭球贡献的加权和。', rows: [
          { label: 'alpha=1', caption: '不透明', gradient: 'linear-gradient(90deg,#ef4444,#ef4444)' },
          { label: 'alpha=0.5', caption: '半透明', gradient: 'linear-gradient(90deg,#ef4444,#f8fafc)' }
        ] }
      ] }
    },
    pointnet: {
      visualStory: { intro: 'PointNet 是第一个直接处理无序点云的深度网络——用对称函数（max pool）保证排列不变性。', cards: [
        { type: 'bars', title: 'Max Pool 是关键：消除点的顺序', text: '无论点云的点按什么顺序输入，max pool 后得到的全局特征都是一样的。这是保证置换不变性的关键操作。', items: [
          { label: 'T-Net', value: 45, caption: '空间变换', color: '#38bdf8' },
          { label: 'MLP', value: 70, caption: '逐点特征', color: '#8b5cf6' },
          { label: 'MaxPool', value: 85, caption: '全局特征', color: '#22c55e' }
        ] },
        { type: 'threshold', title: '分类/分割共用一个骨干', text: '全局特征用于分类；把全局特征拼回逐点特征后，可以做逐点分割——同一个架构解决两个任务。', position: 55 }
      ] }
    },
    bev: {
      visualStory: { intro: 'BEV 把环视相机图像"抬"到鸟瞰网格，让自动驾驶系统在统一的自顶向下坐标系里做感知。', cards: [
        { type: 'arrows', title: 'Lift-Splat：图像特征 → 3D → BEV', text: '每张环视图先估计像素深度分布，再把 2D 特征按深度"喷"到 3D 空间，最后投影到鸟瞰网格。', labels: ['camera', '3D', 'BEV'] },
        { type: 'bars', title: '多相机融合到一个统一空间', text: '6-8 个环视相机各自提取特征，在 BEV 网格上融合。这样不同相机看到的同一个物体会落到同一网格。', items: [
          { label: 'Front', value: 65, caption: '前视', color: '#3b82f6' },
          { label: 'Rear', value: 65, caption: '后视', color: '#ef4444' },
          { label: 'Side', value: 55, caption: '侧视', color: '#22c55e' }
        ] }
      ] }
    },
    occupy: {
      visualStory: { intro: 'Occupancy Networks 把 3D 空间切成小立方体，判断每个格子是"空的"还是"被占的"——比 3D 框更精细。', cards: [
        { type: 'pixels', title: '体素网格：3D 空间的"像素"', text: '每个体素 (voxel) 有一个占据概率。物体不再是简单的长方体框，而是任意形状的 3D 占据区域。', rows: 5, cols: 8 },
        { type: 'bars', title: '比 3D bounding box 好在哪里？', text: '3D 框无法描述不规则形状（行人打伞、挂车、异形障碍物）。占据网格能表示任意形状的障碍物。', items: [
          { label: '3D Box', value: 55, caption: '规则形状', color: '#64748b' },
          { label: 'Occupancy', value: 88, caption: '任意形状', color: '#22c55e' }
        ] }
      ] }
    },
    c3d: {
      visualStory: { intro: 'C3D 把 2D 卷积扩展到 3D——卷积核在空间和时间上同时滑动，直接捕捉运动模式。', cards: [
        { type: 'arrows', title: '3D 卷积核：w×h×t 三维窗口', text: '不再是 3×3 的平面核，而是 3×3×3 的时空核。16 帧视频输入，卷积核同时在 x/y/t 上滑动。', labels: ['x', 'y', 't'] },
        { type: 'bars', title: 'C3D 学到什么？', text: '浅层学边缘和运动方向，中层学局部运动模式，深层学复杂动作。但由于参数量大，后来被 (2+1)D 卷积替代。', items: [
          { label: '浅层', value: 35, caption: '边缘+运动', color: '#38bdf8' },
          { label: '中层', value: 55, caption: '运动模式', color: '#f97316' },
          { label: '深层', value: 75, caption: '动作语义', color: '#22c55e' }
        ] }
      ] }
    },
    bytetrack: {
      visualStory: { intro: 'ByteTrack 的洞察：低分检测框也有用——把它们和高分框分开关联，能找回被遮挡和暂时漏检的目标。', cards: [
        { type: 'threshold', title: '两阶段关联：先高分，再低分', text: '第一轮用高分框做标准匹配建立 tracklet；第二轮把剩下的低分框和未匹配的 tracklet 再关联一次——找回"可能被挡住"的目标。', position: 40 },
        { type: 'bars', title: '低分框的价值', text: '传统追踪直接扔掉低分框，ByteTrack 证明它们是宝贵信息——尤其在遮挡和运动模糊时。', items: [
          { label: '高分匹配', value: 85, caption: '确定关联', color: '#22c55e' },
          { label: '低分恢复', value: 55, caption: '遮挡找回', color: '#f97316' }
        ] }
      ] }
    },
    deeppose: {
      visualStory: { intro: 'DeepPose 开创了用 CNN 直接从图像回归人体关键点坐标——深度学习姿态估计的起点。', cards: [
        { type: 'bars', title: '从分类网络到坐标回归器', text: '把 AlexNet 最后的分类头改成 2K 个输出（K 个关键点每个 x,y），直接用 L2 损失回归坐标。简单但有效。', items: [
          { label: 'CNN', value: 70, caption: '特征提取', color: '#38bdf8' },
          { label: 'FC', value: 50, caption: '回归x,y', color: '#22c55e' }
        ] },
        { type: 'arrows', title: '级联精修：粗位置 → 精位置', text: '第一级预测大致位置，后续级在裁剪后的高分辨率区域进一步精修每个关键点。', labels: ['stage1', 'stage2', 'refined'] }
      ] }
    },
    openpose: {
      visualStory: { intro: 'OpenPose 是自底向上的多人姿态估计——先检测所有关键点，再判断哪些点属于同一个人。', cards: [
        { type: 'bars', title: 'Part Affinity Fields：肢体的"连接线索"', text: 'PAF 是一个 2D 向量场，编码了从一个关键点到另一个关键点的方向和关联强度。手肘的 PAF 指向手腕。', items: [
          { label: 'Heatmap', value: 75, caption: '关键点位置', color: '#38bdf8' },
          { label: 'PAF', value: 65, caption: '肢体连接', color: '#22c55e' }
        ] },
        { type: 'gradientSet', title: '二分图匹配组装骨架', text: '有了所有关键点和 PAF，用匈牙利算法做二分图匹配，把属于同一个人的点连成完整骨架。', rows: [
          { label: 'points', caption: '所有候选点', gradient: 'linear-gradient(90deg,#3b82f6,#38bdf8,#22c55e)' },
          { label: 'skeleton', caption: '匹配→骨架', gradient: 'linear-gradient(90deg,#ef4444,#f97316,#facc15)' }
        ] }
      ] }
    },
    botsort: {
      visualStory: { intro: 'BoT-SORT 在 ByteTrack 的基础上加了相机运动补偿和更强的 ReID 特征，让追踪更稳定。', cards: [
        { type: 'bars', title: 'ByteTrack + CMC + ReID = BoT-SORT', text: 'CMC 补偿相机自身运动让 Kalman 预测更准，ReID 用外观特征区分相似目标的 ID switch。', items: [
          { label: 'ByteTrack', value: 75, caption: '关联基础', color: '#38bdf8' },
          { label: 'CMC', value: 60, caption: '运动补偿', color: '#22c55e' },
          { label: 'ReID', value: 55, caption: '外观特征', color: '#8b5cf6' }
        ] }
      ] }
    }
  };

  Object.keys(phaseFourFiveEnhancements).forEach(function(id) {
    if (!window.AlgorithmContent[id]) return;
    var patch = phaseFourFiveEnhancements[id];
    if (patch.controls) window.AlgorithmContent[id].controls = patch.controls;
    if (patch.visualStory) window.AlgorithmContent[id].visualStory = patch.visualStory;
  });

  const cannyStepVisualCards = {
    grayscale: [
      {
        type: 'cardAnim',
        anim: 'gray',
        title: '动态：彩色像素被压成亮度',
        text: '直接复用 Canny 流程里的灰度化动画：每个彩色格子不再保留 RGB 三个通道，而是按感知权重汇成一个亮度值。',
        caption: 'RGB -> luminance'
      }
    ],
    threshold: [
      {
        type: 'cardAnim',
        anim: 'binary',
        title: '动态：阈值线扫过亮度图',
        text: '亮度高于阈值的格子变成白色前景，低于阈值的格子变成黑色背景；阈值移动时，分割结果会立刻改变。',
        caption: 'gray -> binary mask'
      }
    ],
    gaussian: [
      {
        type: 'cardAnim',
        anim: 'gaussian',
        title: '动态：中心权重大，四周温柔参与',
        text: 'Canny 的第一步通常先高斯平滑。动画展示卷积窗口滑过图像时，中心像素影响最大，远处像素只轻轻参与平均。',
        caption: 'Gaussian weighted window'
      }
    ],
    sobel: [
      {
        type: 'cardAnim',
        anim: 'sobel_x',
        title: '动态：Gx 找左右方向的突变',
        text: '横向差分核一边减、一边加，像在问：左侧和右侧亮度是不是差很多？差很多的位置就是垂直边缘候选。',
        caption: 'Sobel X'
      },
      {
        type: 'cardAnim',
        anim: 'sobel_y',
        title: '动态：Gy 找上下方向的突变',
        text: '纵向差分核比较上方和下方的亮度变化，用来捕捉水平边缘候选。两个方向合在一起才能描述完整边缘。',
        caption: 'Sobel Y'
      },
      {
        type: 'cardAnim',
        anim: 'magnitude',
        title: '动态：Gx 与 Gy 合成边缘强度',
        text: '水平变化和垂直变化像两个分量，合成后的梯度幅值越亮，表示这里越可能是真正的边缘。',
        caption: '|gradient|'
      }
    ],
    nms: [
      {
        type: 'cardAnim',
        anim: 'nms',
        title: '动态：沿梯度方向只留下最高峰',
        text: 'Canny 中的 NMS 会把一条厚边缘压细：如果某个响应不是局部最高，就被压暗，只留下最像中心线的像素。',
        caption: 'thin edge ridge'
      }
    ]
  };

  Object.keys(cannyStepVisualCards).forEach(function(id) {
    var cfg = window.AlgorithmContent[id];
    if (!cfg) return;
    var story = cfg.visualStory || { cards: [] };
    var oldCards = story.cards || [];
    story.cards = cannyStepVisualCards[id].concat(oldCards);
    cfg.visualStory = story;
  });

  Object.keys(window.AlgorithmContent).forEach(function(id) {
    if (id !== 'common') attachImplementation(id, window.AlgorithmContent[id]);
  });

  (function normalizeHomepageContracts() {
    function ensureContent(id, cfg) {
      if (!window.AlgorithmContent[id]) {
        window.AlgorithmContent[id] = cfg;
      }
    }

    function applyStory(ids, story) {
      ids.forEach(function(id) {
        var cfg = window.AlgorithmContent[id];
        if (!cfg) return;
        if (!cfg.visualStory || !cfg.visualStory.cards || !cfg.visualStory.cards.length) {
          cfg.visualStory = story;
        }
      });
    }

    var localTeaching = ['stable_diffusion', 'sd'];
    localTeaching.forEach(function(id) {
      var cfg = window.AlgorithmContent[id];
      if (!cfg) return;
      cfg.endpoint = cfg.endpoint || ('/api/demo/' + (id === 'sd' ? 'stable_diffusion' : id));
      cfg.status = '本地确定性教学可视化';
      cfg.implementation = {
        status: '本地确定性教学可视化',
        category: 'numpy_algorithm',
        localInference: true,
        realModel: false,
        requiresUpload: false,
        model: 'NumPy/PIL local teaching pipeline',
        note: '展示算法机制和中间结果，不代表下载后的预训练权重推理。'
      };
    });

    var localFrontierPatches = {
      swin: {
        pipeline: [['Patch partition', 'Split the image into patch tokens.'], ['Window attention', 'Compute self-attention inside local windows.'], ['Shifted windows', 'Shift the grid so adjacent windows exchange context.'], ['Patch merge', 'Merge 2x2 tokens to build a hierarchy.']],
        principles: ['Swin keeps Transformer attention local to reduce quadratic cost.', 'Shifted windows make information cross window boundaries while preserving a hierarchical feature pyramid.'],
        visualStory: { intro: 'Swin is a hierarchical Transformer: local windows keep computation small, shifted windows move context across boundaries.', cards: [
          { type: 'arrows', title: 'Window attention pipeline', text: 'Patch tokens first attend inside a small window, then the next block shifts the window grid.', labels: ['patches', 'W-MSA', 'SW-MSA'] },
          { type: 'bars', title: 'Why patch merge matters', text: 'Resolution goes down while semantic channel capacity goes up, like a CNN feature pyramid.', items: [{ label: 'tokens', value: 45, caption: 'fewer', color: '#38bdf8' }, { label: 'context', value: 85, caption: 'larger', color: '#22c55e' }] }
        ] }
      },
      dino: {
        pipeline: [['Multi-view crops', 'Create two augmented views of the same image.'], ['Student teacher encoders', 'Encode views with online and EMA networks.'], ['Centering softmax', 'Sharpen teacher probabilities after centering.'], ['Attention emergence', 'Inspect patch attention as objectness.']],
        principles: ['DINO learns invariance by matching a student view to a teacher view.', 'Centering and temperature prevent collapse and make attention maps interpretable.'],
        visualStory: { intro: 'DINO is self-supervised: it learns from agreement between augmented views, not from class labels.', cards: [
          { type: 'arrows', title: 'Student teacher agreement', text: 'The student predicts the teacher distribution from a different crop or color view.', labels: ['view A', 'student', 'teacher target'] },
          { type: 'bars', title: 'Collapse prevention', text: 'Centering and temperature keep the representation sharp without becoming a constant vector.', items: [{ label: 'center', value: 68, caption: 'balance', color: '#38bdf8' }, { label: 'temp', value: 82, caption: 'sharpen', color: '#f97316' }] }
        ] }
      },
      mae: {
        pipeline: [['Patchify', 'Turn the image into a patch sequence.'], ['Random mask', 'Hide most patches.'], ['Encode visible tokens', 'Run the encoder only on visible patches.'], ['Decode reconstruction', 'Predict masked patch pixels.']],
        principles: ['MAE forces global understanding by reconstructing missing patches from sparse evidence.', 'The encoder is efficient because masked tokens are skipped until the lightweight decoder.'],
        visualStory: { intro: 'MAE learns by removing most of the image and reconstructing the missing patch content.', cards: [
          { type: 'arrows', title: 'Sparse encoder', text: 'Only visible patches enter the encoder; mask tokens appear later in the decoder.', labels: ['patchify', 'mask', 'reconstruct'] },
          { type: 'bars', title: 'High mask ratio', text: 'A high mask ratio makes the task semantic rather than simple local copying.', items: [{ label: 'visible', value: 25, caption: 'tokens', color: '#38bdf8' }, { label: 'masked', value: 75, caption: 'tokens', color: '#ef4444' }] }
        ] }
      },
      dino_det: {
        pipeline: [['Object queries', 'Use learned slots to represent candidate objects.'], ['Denoising queries', 'Train with perturbed boxes and labels.'], ['Box refinement', 'Update boxes layer by layer.'], ['Set matching', 'Match predictions to targets once.']],
        principles: ['DINO detection keeps DETR set prediction but makes training easier with denoising queries.', 'Iterative box refinement turns coarse query slots into accurate boxes.'],
        visualStory: { intro: 'DINO detection improves DETR by teaching queries how to recover from noisy boxes.', cards: [
          { type: 'arrows', title: 'Query correction', text: 'Noisy query boxes are decoded back toward target boxes during training.', labels: ['noisy box', 'decoder', 'refined box'] },
          { type: 'bars', title: 'Matching plus denoising', text: 'The loss combines Hungarian matching with a denoising objective for faster convergence.', items: [{ label: 'match', value: 72, caption: 'set loss', color: '#38bdf8' }, { label: 'denoise', value: 80, caption: 'stability', color: '#22c55e' }] }
        ] }
      },
      grdino: {
        pipeline: [['Text tokens', 'Encode phrases such as object names.'], ['Image regions', 'Encode dense visual regions.'], ['Similarity map', 'Compare text and visual tokens.'], ['Grounded boxes', 'Convert high-score regions into boxes.']],
        principles: ['Grounding DINO aligns open-vocabulary text phrases with image regions.', 'Detection becomes phrase-conditioned instead of fixed-class only.'],
        visualStory: { intro: 'Grounding DINO asks which image regions best match this phrase.', cards: [
          { type: 'arrows', title: 'Phrase to region', text: 'Text embeddings score dense image regions, then high-score areas become boxes.', labels: ['phrase', 'similarity', 'box'] },
          { type: 'bars', title: 'Open vocabulary', text: 'Changing the phrase changes the score map without changing a closed classifier head.', items: [{ label: 'fixed cls', value: 42, caption: 'closed', color: '#64748b' }, { label: 'text cond', value: 88, caption: 'open', color: '#22c55e' }] }
        ] }
      },
      mask2former: {
        pipeline: [['Pixel embeddings', 'Build dense image features.'], ['Mask queries', 'Predict one mask per query.'], ['Masked attention', 'Restrict attention to the current mask.'], ['Class plus mask', 'Pair each mask with a class prediction.']],
        principles: ['Mask2Former represents segmentation as mask classification.', 'Masked attention lets each query focus on the region it is already explaining.'],
        visualStory: { intro: 'Mask2Former unifies semantic, instance and panoptic segmentation with mask queries.', cards: [
          { type: 'arrows', title: 'Mask classification', text: 'Each query predicts a mask and a class, instead of classifying every pixel independently.', labels: ['query', 'mask', 'class'] },
          { type: 'bars', title: 'Unified segmentation', text: 'The same query-mask idea can serve semantic, instance and panoptic outputs.', items: [{ label: 'semantic', value: 75, caption: 'stuff', color: '#38bdf8' }, { label: 'instance', value: 82, caption: 'things', color: '#f97316' }, { label: 'panoptic', value: 88, caption: 'both', color: '#22c55e' }] }
        ] }
      },
      sam2: {
        pipeline: [['Frame memory', 'Store previous-frame mask evidence.'], ['Prompt encoding', 'Encode points or boxes.'], ['Memory propagation', 'Move mask memory to the next frame.'], ['Mask refinement', 'Fuse current image evidence with memory.']],
        principles: ['SAM2 extends promptable segmentation from images to video by adding memory.', 'The mask is propagated through time and corrected with current-frame features.'],
        visualStory: { intro: 'SAM2 keeps track of a prompted object across frames with a memory bank.', cards: [
          { type: 'arrows', title: 'Video memory loop', text: 'The mask from frame t becomes memory for frame t+1, then gets refined.', labels: ['mask t', 'memory', 'mask t+1'] },
          { type: 'bars', title: 'Prompt plus memory', text: 'Prompt tells what to segment; memory tells where it went over time.', items: [{ label: 'prompt', value: 62, caption: 'intent', color: '#38bdf8' }, { label: 'memory', value: 86, caption: 'temporal', color: '#22c55e' }] }
        ] }
      },
      blip2: {
        pipeline: [['Image tokens', 'Extract frozen vision tokens.'], ['Q-Former', 'Use query tokens to attend to image tokens.'], ['Text alignment', 'Map visual queries to language space.'], ['Caption or QA', 'Rank or generate text from aligned features.']],
        principles: ['BLIP-2 bridges a frozen image encoder and a language model with a lightweight Q-Former.', 'Cross-attention compresses many visual tokens into a few language-ready query tokens.'],
        visualStory: { intro: 'BLIP-2 is a bridge: Q-Former turns visual tokens into something a language model can use.', cards: [
          { type: 'arrows', title: 'Q-Former bridge', text: 'Learned queries look into image tokens, then align with text embeddings.', labels: ['image tokens', 'Q-Former', 'text'] },
          { type: 'bars', title: 'Frozen plus trainable', text: 'Most large components can stay frozen while the bridge learns alignment.', items: [{ label: 'vision', value: 70, caption: 'frozen', color: '#64748b' }, { label: 'Q-former', value: 88, caption: 'trainable', color: '#22c55e' }] }
        ] }
      },
      controlnet: {
        pipeline: [['Condition map', 'Compute edges, depth or pose.'], ['Condition branch', 'Encode condition features.'], ['Zero-conv residual', 'Inject control without disrupting the base model at start.'], ['Guided denoise', 'Denoise under both text and condition.']],
        principles: ['ControlNet adds a parallel conditioning path to a diffusion model.', 'Zero-conv residuals make the control branch start harmless, then learn precise guidance.'],
        visualStory: { intro: 'ControlNet makes generation follow a spatial condition such as edges or pose.', cards: [
          { type: 'arrows', title: 'Condition injection', text: 'A condition map becomes residual features injected into the denoising backbone.', labels: ['edge map', 'zero conv', 'denoise'] },
          { type: 'bars', title: 'Structure control', text: 'The generated sample keeps more layout information when the condition branch is active.', items: [{ label: 'free', value: 45, caption: 'loose', color: '#64748b' }, { label: 'control', value: 90, caption: 'structured', color: '#22c55e' }] }
        ] }
      },
      dit: {
        pipeline: [['Latent patches', 'Patchify noisy latent features.'], ['Time embedding', 'Add diffusion timestep information.'], ['Transformer denoise', 'Mix tokens with self-attention.'], ['Latent update', 'Predict noise or velocity and update latent.']],
        principles: ['DiT replaces UNet denoisers with Transformer blocks over latent patches.', 'Timestep embeddings tell the network how much noise remains.'],
        visualStory: { intro: 'DiT treats denoising as sequence modeling over latent patch tokens.', cards: [
          { type: 'arrows', title: 'Patch denoising', text: 'Noisy latent patches become tokens, pass through Transformer blocks, then update the latent.', labels: ['latent', 'tokens', 'denoise'] },
          { type: 'bars', title: 'Global token mixing', text: 'Self-attention lets distant patches coordinate global structure during denoising.', items: [{ label: 'local', value: 50, caption: 'conv', color: '#64748b' }, { label: 'global', value: 88, caption: 'attention', color: '#38bdf8' }] }
        ] }
      },
      flux: {
        pipeline: [['Dual streams', 'Process text and image tokens together.'], ['Velocity field', 'Predict a flow direction from noise to data.'], ['Euler updates', 'Integrate the flow through time.'], ['Latent endpoint', 'Decode the final latent sample.']],
        principles: ['Flow matching learns a continuous vector field instead of only a discrete denoise target.', 'Dual-stream Transformers keep text and image information coupled during sampling.'],
        visualStory: { intro: 'Flux-style flow matching moves a noisy latent along a learned path toward data.', cards: [
          { type: 'arrows', title: 'Flow path', text: 'The model predicts velocity, and sampling integrates that velocity step by step.', labels: ['noise', 'velocity', 'sample'] },
          { type: 'bars', title: 'Text-image coupling', text: 'Dual streams keep text conditions active while image tokens move through the flow.', items: [{ label: 'text', value: 78, caption: 'condition', color: '#38bdf8' }, { label: 'image', value: 84, caption: 'latent', color: '#22c55e' }] }
        ] }
      },
      stylegan: {
        pipeline: [['Mapping network', 'Map z into style vector w.'], ['Style modulation', 'Scale and bias feature channels.'], ['Progressive synthesis', 'Upsample and modulate feature maps.'], ['ToRGB', 'Convert final features to an image.']],
        principles: ['StyleGAN separates latent sampling from style control through the w space.', 'AdaIN or modulated convolution controls channels at each synthesis layer.'],
        visualStory: { intro: 'StyleGAN generates by controlling feature statistics layer by layer.', cards: [
          { type: 'arrows', title: 'z to w to image', text: 'A mapping network creates style vectors that modulate synthesis features.', labels: ['z', 'w', 'image'] },
          { type: 'bars', title: 'Layer style control', text: 'Early layers affect coarse layout; later layers affect texture and color.', items: [{ label: 'coarse', value: 78, caption: 'shape', color: '#38bdf8' }, { label: 'fine', value: 68, caption: 'texture', color: '#f97316' }] }
        ] }
      },
      dust3r: {
        pipeline: [['Dense features', 'Encode both images into dense descriptors.'], ['Pairwise matching', 'Find correspondences for many pixels.'], ['Depth confidence', 'Predict depth-like points and confidence.'], ['Point cloud', 'Lift confident pixels into 3D.']],
        principles: ['DUSt3R estimates dense 3D structure directly from image pairs.', 'Confidence is as important as depth because weak matches should not dominate the point cloud.'],
        visualStory: { intro: 'DUSt3R turns pairwise image matching into dense 3D point prediction.', cards: [
          { type: 'arrows', title: 'Match to 3D', text: 'Dense correspondence gives disparity-like evidence, then pixels are lifted into 3D.', labels: ['features', 'matches', 'points'] },
          { type: 'bars', title: 'Depth with confidence', text: 'A good 3D preview needs both a depth estimate and a confidence estimate.', items: [{ label: 'depth', value: 82, caption: 'geometry', color: '#38bdf8' }, { label: 'conf', value: 74, caption: 'trust', color: '#22c55e' }] }
        ] }
      },
      orbslam3: {
        pipeline: [['ORB keypoints', 'Detect repeatable corners.'], ['Binary descriptors', 'Build BRIEF-like descriptors.'], ['Feature matching', 'Match keypoints between frames.'], ['Pose graph', 'Estimate motion and optimize keyframes.']],
        principles: ['ORB-SLAM relies on repeatable sparse features, matching and geometric optimization.', 'The map is maintained through keyframes and bundle adjustment rather than single-frame prediction.'],
        visualStory: { intro: 'ORB-SLAM3 builds camera motion from tracked ORB features and a pose graph.', cards: [
          { type: 'arrows', title: 'Tracking to mapping', text: 'Corners are described, matched, converted into motion, then inserted into a keyframe graph.', labels: ['ORB', 'match', 'pose graph'] },
          { type: 'bars', title: 'Why keyframes', text: 'Keyframes reduce redundant frames while preserving enough geometry for optimization.', items: [{ label: 'all frames', value: 45, caption: 'redundant', color: '#64748b' }, { label: 'keyframes', value: 86, caption: 'stable', color: '#22c55e' }] }
        ] }
      },
      mediapipe: {
        pipeline: [['ROI crop', 'Find or define the body region.'], ['Landmark heatmaps', 'Predict one heatmap per landmark.'], ['Soft-argmax', 'Decode coordinates from heatmaps.'], ['Skeleton graph', 'Connect landmarks into a pose graph.']],
        principles: ['MediaPipe-style pipelines are optimized for real-time landmark estimation.', 'Heatmaps encode spatial uncertainty before coordinates are decoded.'],
        visualStory: { intro: 'MediaPipe pose estimation turns landmark heatmaps into a connected skeleton.', cards: [
          { type: 'arrows', title: 'Heatmap to skeleton', text: 'Each landmark heatmap is decoded to a point, then fixed graph edges connect the points.', labels: ['heatmap', 'point', 'graph'] },
          { type: 'bars', title: 'Real-time design', text: 'A lightweight landmark head keeps the pipeline suitable for interactive use.', items: [{ label: 'speed', value: 88, caption: 'real-time', color: '#22c55e' }, { label: 'detail', value: 72, caption: 'landmarks', color: '#38bdf8' }] }
        ] }
      },
      vitpose: {
        pipeline: [['Patch features', 'Encode the image with ViT patches.'], ['Global attention', 'Mix body context across patches.'], ['Heatmap head', 'Predict keypoint heatmaps.'], ['Pose decode', 'Decode and connect keypoints.']],
        principles: ['ViTPose uses Transformer patch features for pose heatmap prediction.', 'Global attention helps long-range body-part relationships such as left-right limbs.'],
        visualStory: { intro: 'ViTPose uses ViT tokens as the backbone for keypoint heatmaps.', cards: [
          { type: 'arrows', title: 'Token to keypoint', text: 'Patch tokens are globally mixed, reshaped, and decoded into keypoint heatmaps.', labels: ['patch', 'attention', 'heatmap'] },
          { type: 'bars', title: 'Global context', text: 'Attention lets distant joints influence each other before heatmap decoding.', items: [{ label: 'local cues', value: 64, caption: 'edges', color: '#38bdf8' }, { label: 'global pose', value: 86, caption: 'layout', color: '#22c55e' }] }
        ] }
      }
    };

    Object.keys(localFrontierPatches).forEach(function(id) {
      var cfg = window.AlgorithmContent[id];
      if (!cfg) return;
      var patch = localFrontierPatches[id];
      cfg.endpoint = '/api/demo/' + id;
      cfg.status = 'local small algorithm implementation';
      cfg.pipeline = patch.pipeline;
      cfg.principles = patch.principles;
      cfg.visualStory = patch.visualStory;
      cfg.implementation = {
        status: 'local small algorithm implementation',
        category: 'numpy_algorithm',
        localInference: true,
        realModel: false,
        requiresUpload: false,
        model: 'NumPy/PIL local mechanism pipeline',
        note: 'Local small algorithm implementation; not pretrained-weight inference.'
      };
    });

    if (window.AlgorithmContent.frequency) {
      window.AlgorithmContent.frequency.visualStory = {
        intro: 'Frequency analysis shows which structures are smooth low-frequency content and which are high-frequency edges or texture.',
        cards: [
          { type: 'arrows', title: 'Spatial to spectrum', text: 'FFT converts pixel positions into frequency coefficients, then fftshift moves low frequency to the center.', labels: ['image', 'FFT', 'spectrum'] },
          { type: 'bars', title: 'Low-pass and high-pass', text: 'Low-pass keeps smooth structure; high-pass keeps edges, texture and noise.', items: [{ label: 'low', value: 72, caption: 'smooth', color: '#38bdf8' }, { label: 'high', value: 58, caption: 'edge', color: '#f97316' }] }
        ]
      };
    }

    var cannyTeaching = {
      phase: '阶段二 / 经典结构与几何视觉',
      title: 'Canny 边缘检测',
      english: 'Canny Edge Detector',
      tagline: '从降噪、梯度、非极大值抑制到双阈值连接，把厚而乱的亮度变化整理成连续细边缘。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/canny',
      formula: '|G|=\\sqrt{G_x^2+G_y^2},\\quad \\theta=\\arctan(G_y/G_x)',
      implementation: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, requiresUpload: true, model: 'NumPy Canny pipeline' },
      principles: [
        '边缘来自亮度的快速变化，先用高斯模糊压住噪声，再用梯度估计变化强度和方向。',
        '非极大值抑制只保留梯度方向上的局部峰值；双阈值滞后连接用强边缘带出相邻弱边缘。'
      ],
      core: [['输入', '灰度或彩色图像'], ['核心问题', '怎样从噪声和纹理中留下稳定、细且连续的边缘'], ['输出', '边缘响应、细化边缘和最终二值边缘图']],
      pipeline: [['高斯平滑', '降低随机噪声，避免梯度被毛刺放大。'], ['Sobel 梯度', '计算 Gx、Gy、幅值和方向。'], ['非极大值抑制', '沿梯度方向比较邻居，只保留局部最大响应。'], ['双阈值连接', '强边缘直接保留，弱边缘只有连接到强边缘才保留。']],
      visualStory: { intro: 'Canny 的动画可以理解为一条五步流水线：先让图像安静下来，再找变化，压细边缘，最后用连接关系判断真假。', cards: [
        { type: 'semanticAnim', anim: 'canny', title: '五步流水线', text: '每一步都产生可观察的中间结果：平滑图、梯度幅值、方向、NMS 细边缘、双阈值连接图。', caption: 'blur -> gradient -> nms -> hysteresis' },
        { type: 'nms', title: '沿梯度方向只留峰值', text: '如果一个像素不是边缘法线方向上的最大响应，它会被压暗；这样厚边缘会被压成单像素附近的细线。' },
        { type: 'threshold', title: '双阈值滞后连接', text: '高阈值负责可靠性，低阈值负责连续性；弱边缘必须和强边缘连通，才会被认为是真边缘。', position: 62 }
      ] }
    };

    var harrisTeaching = {
      phase: '阶段二 / 经典结构与几何视觉',
      title: 'Harris 角点检测',
      english: 'Harris Corner Detector',
      tagline: '用局部结构张量观察窗口向不同方向移动时的亮度变化，找到两个方向都变化明显的位置。',
      status: '真实 NumPy 算法',
      difficulty: '进阶',
      endpoint: '/api/demo/harris',
      formula: 'R=\\det(M)-k\\,\\mathrm{trace}(M)^2',
      implementation: { status: '真实 NumPy 算法', category: 'numpy_algorithm', localInference: true, realModel: false, requiresUpload: true, model: 'NumPy Harris corner response' },
      principles: [
        '平坦区域两个方向变化都小；边缘只有一个方向变化大；角点在两个主方向上变化都大。',
        '结构张量 M 汇总窗口内 Ix、Iy 的二阶统计，Harris 响应 R 用行列式和迹区分角点、边缘和平坦区域。'
      ],
      core: [['输入', '图像梯度 Ix、Iy'], ['核心问题', '怎样判断一个局部窗口是否在任意方向移动都会明显变化'], ['输出', '角点响应热力图、NMS 后角点坐标']],
      pipeline: [['梯度计算', '计算 Ix、Iy。'], ['结构张量', '在局部窗口内累计 Ix²、Iy²、IxIy。'], ['角点响应', '用 det(M)-k trace(M)^2 得到 R。'], ['阈值与 NMS', '只保留响应强且局部最突出的点。']],
      visualStory: { intro: 'Harris 的直觉很通俗：拿一个小窗口在图像上轻轻推，如果往哪个方向推都变得很多，这里就是角点。', cards: [
        { type: 'semanticAnim', anim: 'corner', title: '窗口移动实验', text: '平坦处怎么移动都差不多；边缘处沿边移动差不多、垂直边移动变化大；角点处两个方向都会变化大。', caption: 'flat / edge / corner' },
        { type: 'bars', title: '两个特征值决定局部类型', text: 'lambda1 和 lambda2 都大才是角点；只有一个大通常是边缘；两个都小就是平坦区域。', items: [
          { label: 'flat', value: 18, caption: 'small/small', color: '#64748b' },
          { label: 'edge', value: 55, caption: 'large/small', color: '#f97316' },
          { label: 'corner', value: 88, caption: 'large/large', color: '#22c55e' }
        ] }
      ] }
    };

    ensureContent('canny', cannyTeaching);
    ensureContent('edge', Object.assign({}, cannyTeaching, { endpoint: '/api/demo/edge' }));
    ensureContent('harris', harrisTeaching);
    ensureContent('corner', Object.assign({}, harrisTeaching, { endpoint: '/api/demo/corner' }));

    var aliases = {
      canny: 'edge',
      harris: 'corner',
      detection: 'faster_rcnn',
      semantic: 'fcn',
      instance: 'mask_rcnn',
      tpl_match: 'template_match'
    };
    Object.keys(aliases).forEach(function(id) {
      var source = aliases[id];
      if (!window.AlgorithmContent[id] && window.AlgorithmContent[source]) {
        window.AlgorithmContent[id] = Object.assign({}, window.AlgorithmContent[source]);
        window.AlgorithmContent[id].endpoint = '/api/demo/' + id;
      }
    });

    applyStory(['detection', 'faster_rcnn'], { intro: '目标检测回答“哪里有什么”：先生成或枚举候选框，再给每个框分类并回归位置。', cards: [
      { type: 'semanticAnim', anim: 'detection', title: '候选框到精修框', text: 'Faster R-CNN 先由 RPN 给出可能含物体的区域，再用检测头判断类别并修正边界框。', caption: 'RPN -> RoI -> class/box' },
      { type: 'bars', title: '分类损失 + 边框回归损失', text: '检测不只要说出类别，还要把框画准；因此训练目标通常同时包含分类项和坐标回归项。', items: [
        { label: 'cls', value: 72, caption: '类别', color: '#38bdf8' },
        { label: 'box', value: 66, caption: '位置', color: '#f97316' },
        { label: 'rpn', value: 58, caption: '候选', color: '#22c55e' }
      ] }
    ] });

    applyStory(['semantic', 'fcn'], { intro: '语义分割回答“每个像素属于哪一类”：同类物体会合在一起，不区分第几个实例。', cards: [
      { type: 'semanticAnim', anim: 'segmentation', title: '从特征图回到像素图', text: 'FCN 用全卷积网络得到低分辨率语义特征，再上采样回原图尺寸，给每个像素一个类别。', caption: 'feature map -> logits -> mask' },
      { type: 'gradientSet', title: '像素级 logits', text: '每个像素都有一组类别分数，softmax 后选择最大概率的类别，组成整张语义图。', rows: [
        { label: 'road', caption: 'class score', gradient: 'linear-gradient(90deg,#020617,#38bdf8)' },
        { label: 'person', caption: 'class score', gradient: 'linear-gradient(90deg,#020617,#f97316)' },
        { label: 'sky', caption: 'class score', gradient: 'linear-gradient(90deg,#020617,#22c55e)' }
      ] }
    ] });

    applyStory(['instance', 'mask_rcnn'], { intro: '实例分割同时回答“是什么、在哪里、是哪一个”：同一类别的不同物体要被分开。', cards: [
      { type: 'semanticAnim', anim: 'instance', title: '检测框加掩码分支', text: 'Mask R-CNN 先找到每个实例的 RoI，再为每个 RoI 单独预测一个二值 mask。', caption: 'box + mask' },
      { type: 'bars', title: '多任务输出', text: '实例分割把分类、边框和掩码放在同一个框架中，框解决定位，mask 解决像素级轮廓。', items: [
        { label: 'class', value: 70, caption: '类别', color: '#38bdf8' },
        { label: 'box', value: 64, caption: '位置', color: '#f97316' },
        { label: 'mask', value: 86, caption: '轮廓', color: '#22c55e' }
      ] }
    ] });

    applyStory(['yolo'], { intro: 'YOLO 把检测看成一次前向回归：整张图只看一次，每个网格位置直接预测框、置信度和类别。', cards: [
      { type: 'semanticAnim', anim: 'detection', title: '网格位置直接预测', text: '单阶段检测省去显式候选区域，把速度优先放在设计中心，适合实时场景。', caption: 'one-stage detection' },
      { type: 'bars', title: '速度与精度的权衡', text: 'YOLO 通常推理快；通过多尺度特征、anchor-free 设计和更强后处理继续提升精度。', items: [
        { label: 'speed', value: 92, caption: '快', color: '#22c55e' },
        { label: 'recall', value: 70, caption: '召回', color: '#38bdf8' },
        { label: 'nms', value: 52, caption: '后处理', color: '#f97316' }
      ] }
    ] });

    applyStory(['unet'], { intro: 'U-Net 用编码器获得语义上下文，用解码器恢复分辨率，再用跳跃连接把浅层细节接回去。', cards: [
      { type: 'arrows', title: '编码器到解码器', text: '下采样扩大感受野，上采样恢复尺寸；同尺度跳跃连接让边界和小目标不被深层压缩过程抹掉。', labels: ['encode', 'bottleneck', 'decode'] },
      { type: 'bars', title: '语义和细节同时保留', text: '深层特征懂“是什么”，浅层特征保留“边界在哪里”，拼接后更适合精细分割。', items: [
        { label: 'context', value: 82, caption: '语义', color: '#8b5cf6' },
        { label: 'detail', value: 76, caption: '边界', color: '#22c55e' },
        { label: 'mask', value: 88, caption: '输出', color: '#f97316' }
      ] }
    ] });

    if (window.AlgorithmContent.template_match && window.AlgorithmContent.tpl_match) {
      window.AlgorithmContent.tpl_match.visualStory = window.AlgorithmContent.template_match.visualStory;
    }

    var teachingPages = {
      convolution: {
        phase: '阶段一 · 基础原语',
        title: '卷积操作',
        english: 'Convolution',
        tagline: '卷积核在图像上滑动，每个位置做局部加权求和，是滤波、边缘和 CNN 的共同基础。',
        status: '真实 NumPy 算法',
        difficulty: '入门',
        endpoint: '/api/demo/convolution',
        formula: 'Y(i,j)=\\sum_{u,v}K(u,v)X(i+u,j+v)',
        principles: ['卷积把一个固定小窗口应用到整张图，窗口权重决定滤波语义。', '同一组权重在所有位置复用，所以它既能表达局部结构，又能保持平移一致性。'],
        core: [['输入', '图像和卷积核'], ['核心问题', '如何用局部邻域重算中心像素'], ['输出', '滤波图、梯度图或特征图']],
        pipeline: [['选核', '确定平滑、锐化或边缘检测核。'], ['滑窗', '按像素移动局部窗口。'], ['乘加', '窗口像素和核权重逐项相乘求和。'], ['写回', '把结果写入输出图像对应位置。']],
        visualStory: { intro: '卷积的动画本质就是滑动窗口：看一个小核如何逐格扫完整张图。', cards: [
          { type: 'cardAnim', anim: 'gaussian', title: '滑窗加权求和', text: '窗口覆盖局部像素，中心权重大或方向权重不同，会产生平滑、锐化或边缘响应。', caption: 'kernel scan' },
          { type: 'bars', title: '不同核对应不同语义', text: '均值核平滑噪声，Sobel 核寻找变化，锐化核增强中心和周围的差。', items: [
            { label: 'Blur', value: 45, caption: '平滑', color: '#38bdf8' },
            { label: 'Sobel', value: 75, caption: '梯度', color: '#f97316' },
            { label: 'Sharp', value: 65, caption: '增强', color: '#22c55e' }
          ] }
        ] }
      },
      sift: {
        phase: '阶段二 · 经典结构与几何视觉',
        title: 'SIFT 特征',
        english: 'Scale-Invariant Feature Transform',
        tagline: 'SIFT 在尺度空间找稳定关键点，再用局部梯度方向直方图形成 128 维描述子。',
        status: '真实 NumPy 算法',
        difficulty: '进阶',
        endpoint: '/api/demo/sift',
        formula: 'DoG(x,y,\\sigma)=L(x,y,k\\sigma)-L(x,y,\\sigma)',
        principles: ['尺度空间让同一物体在远近变化时仍能被找到。', '描述子统计局部梯度方向，使匹配对旋转和亮度变化更稳。'],
        core: [['输入', '灰度图像'], ['核心问题', '哪些点在尺度和方向变化下仍稳定'], ['输出', '关键点和局部描述子']],
        pipeline: [['高斯金字塔', '构造多尺度模糊图。'], ['DoG 极值', '在空间和尺度邻域找候选点。'], ['方向赋值', '用主梯度方向获得旋转不变性。'], ['描述子', '统计 4x4 cell 的方向直方图形成 128 维向量。']],
        visualStory: { intro: 'SIFT 的关键是先找稳定位置，再给每个位置一张局部梯度身份证。', cards: [
          { type: 'semanticAnim', anim: 'corner', title: '尺度空间中的候选点', text: '同一位置要在相邻尺度和空间邻域都突出，才可能成为关键点。', caption: 'scale-space extrema' },
          { type: 'bars', title: '128 维描述子的来源', text: '4x4 个 cell，每个 cell 统计 8 个方向桶，最终得到 128 维描述子。', items: [
            { label: 'cells', value: 16, caption: '4x4', color: '#38bdf8' },
            { label: 'bins', value: 8, caption: '方向', color: '#f97316' },
            { label: 'dims', value: 128, caption: '描述子', color: '#22c55e' }
          ] }
        ] }
      },
      match: {
        phase: '阶段二 · 经典结构与几何视觉',
        title: 'SIFT + RANSAC 特征匹配',
        english: 'Feature Matching',
        tagline: '先用描述子距离建立候选匹配，再用 RANSAC 保留符合几何模型的内点。',
        status: '真实 NumPy 算法',
        difficulty: '进阶',
        endpoint: '/api/demo/match',
        formula: 'd_1/d_2<\\tau,\\quad x_2\\sim Hx_1',
        principles: ['最近邻匹配会产生误配，所以要用 ratio test 初筛。', 'RANSAC 通过反复抽样和计数内点，在噪声中找到可信几何关系。'],
        core: [['输入', '两幅图或同图模拟匹配'], ['核心问题', '哪些局部描述子既相似又满足几何一致性'], ['输出', '匹配连线、内点和几何模型']],
        pipeline: [['提特征', '检测关键点并计算描述子。'], ['最近邻', '按 L2 距离找候选匹配。'], ['Ratio Test', '过滤含糊匹配。'], ['RANSAC', '估计单应性或基础矩阵并保留内点。']],
        visualStory: { intro: '匹配不是只看谁最像，还要看所有匹配能否讲出同一个几何故事。', cards: [
          { type: 'arrows', title: '描述子匹配到几何验证', text: '局部相似先给候选，RANSAC 再要求它们服从同一个变换模型。', labels: ['descriptor', 'ratio', 'RANSAC'] },
          { type: 'bars', title: 'RANSAC 保留内点', text: '错误匹配看似相似，但无法支持同一个几何模型，会在投票中被淘汰。', items: [
            { label: 'raw', value: 90, caption: '候选多', color: '#64748b' },
            { label: 'inlier', value: 55, caption: '可信', color: '#22c55e' }
          ] }
        ] }
      }
    };
    Object.keys(teachingPages).forEach(function(id) {
      if (!window.AlgorithmContent[id]) {
        window.AlgorithmContent[id] = teachingPages[id];
      }
      attachImplementation(id, window.AlgorithmContent[id]);
    });
  })();

  window.AlgorithmContent.colorspace = {
    phase: '阶段一 · 基础原语',
    title: '色彩空间',
    english: 'RGB / HSV / Lab / CMYK',
    tagline: '同一张图片可以用不同颜色坐标系解释：RGB 看发光，HSV 看调色，Lab 看感知距离，CMYK 看印刷油墨。',
    status: '本地确定性色彩空间算法',
    difficulty: '入门',
    endpoint: '/api/demo/colorspace',
    implementation: { status: 'local color-space algorithm', category: 'local_algorithm', localInference: true, realModel: false, requiresUpload: true, model: 'NumPy RGB/HSV/Lab/CMYK conversion' },
    formula: 'RGB -> HSV, RGB -> Lab, RGB -> CMYK',
    principles: [
      '色彩空间不改变图像内容，只改变描述颜色的坐标。不同坐标会突出不同语义。',
      'RGB 适合显示和通道处理；HSV 适合颜色阈值和调色；Lab 适合感知色差和颜色校正；CMYK 适合印刷分色。'
    ],
    core: [
      ['输入', 'RGB、灰度或 RGBA 图像'],
      ['核心问题', '同一像素在发光、调色、感知和印刷四种语境下分别是什么维度'],
      ['输出', 'RGB 3 通道、HSV 3 通道、Lab 3 通道、CMYK 4 通道']
    ],
    pipeline: [
      ['RGB 拆分', '保留 R/G/B 单通道发光强度。'],
      ['HSV 转换', '计算色相 H、饱和度 S、明度 V。'],
      ['Lab 转换', '先线性化 RGB 并转 XYZ，再转 L/a/b。'],
      ['CMYK 转换', '计算 C/M/Y/K 四个油墨覆盖比例。']
    ],
    applications: {
      RGB: '屏幕显示、相机图像、网页图像、逐像素通道处理',
      HSV: '颜色选择器、按色相阈值分割、目标跟踪、交互调色',
      Lab: '感知颜色距离、Delta E 色差、亮度增强、超像素聚类、颜色校正',
      CMYK: '印刷分色、出版排版、喷墨或胶印预览、油墨覆盖分析'
    },
    visualStory: {
      intro: '上传同一张图后，页面会纵向展示四种色彩模式及每个维度的中间图。',
      cards: [
        { type: 'mix', title: 'RGB 三圆相加', text: '红、绿、蓝三束光相加生成屏幕颜色。', labels: ['R', 'G', 'B'] },
        { type: 'gradientSet', title: 'HSV 色相圆环', text: 'H 是颜色种类，S 是纯度，V 是亮度。', rows: [
          { label: 'H', caption: '色相', gradient: 'linear-gradient(90deg,#ef4444,#facc15,#22c55e,#3b82f6,#8b5cf6,#ef4444)' },
          { label: 'S', caption: '饱和度', gradient: 'linear-gradient(90deg,#f8fafc,#3b82f6)' },
          { label: 'V', caption: '明度', gradient: 'linear-gradient(90deg,#020617,#f8fafc)' }
        ] },
        { type: 'gradientSet', title: 'Lab 感知轴', text: 'L 是黑白亮度，a 是绿到红，b 是蓝到黄。', rows: [
          { label: 'L', caption: '亮度', gradient: 'linear-gradient(90deg,#020617,#f8fafc)' },
          { label: 'a', caption: '绿到红', gradient: 'linear-gradient(90deg,#22c55e,#f8fafc,#ef4444)' },
          { label: 'b', caption: '蓝到黄', gradient: 'linear-gradient(90deg,#2563eb,#f8fafc,#facc15)' }
        ] },
        { type: 'gradientSet', title: 'CMYK 油墨覆盖', text: 'C/M/Y/K 表示青、品红、黄、黑四种油墨覆盖比例。', rows: [
          { label: 'C', caption: '青', gradient: 'linear-gradient(90deg,#fff,#00aeef)' },
          { label: 'M', caption: '品红', gradient: 'linear-gradient(90deg,#fff,#ec008c)' },
          { label: 'Y', caption: '黄', gradient: 'linear-gradient(90deg,#fff,#ffdd00)' },
          { label: 'K', caption: '黑', gradient: 'linear-gradient(90deg,#fff,#111827)' }
        ] }
      ]
    },
    metrics: {
      '展示类型': '四种色彩空间语义对比',
      '本地推理': 'NumPy 确定性转换',
      '覆盖模式': 'RGB / HSV / Lab / CMYK'
    }
  };

  window.AlgorithmContent.histogram = {
    phase: '阶段一 · 基础原语',
    title: '直方图与均衡化',
    english: 'Histogram Equalization',
    tagline: '统计亮度分布，用 CDF 把拥挤的灰度段拉开，让低对比图像使用更完整的动态范围。',
    status: '真实 NumPy 算法',
    difficulty: '入门',
    endpoint: '/api/demo/histogram',
    formula: 'h(k)=sum[I(x,y)=k], CDF(k)=sum_{i<=k}h(i)/N, T(k)=round((CDF(k)-CDF_min)/(N-CDF_min)*255)',
    principles: [
      '直方图只关心每个亮度出现多少次，不关心它出现在图像哪里。',
      '均衡化用 CDF 生成查找表，把像素密集的亮度段展开，从而增强对比度。'
    ],
    core: [['输入', '彩色或灰度图像'], ['核心问题', '亮度是否挤在窄范围，如何重新分配'], ['输出', '直方图、CDF、映射表、均衡化结果']],
    pipeline: [['灰度化', '得到亮度 Y。'], ['统计直方图', '计算 h(k)。'], ['累计分布', '计算 CDF(k)。'], ['生成映射', '得到 T(k)。'], ['重映射像素', "Y'=T(Y)。"]],
    applications: ['低光照照片增强', '医学/工业图像对比度增强', '扫描文档改善', '遥感图像增强'],
    visualStory: { intro: '页面会展示亮度从旧位置移动到新位置的过程。', cards: [
      { type: 'histogram', title: '亮度分布是否拥挤', text: '柱子集中说明动态范围窄，对比度不足。', values: [8, 16, 40, 82, 95, 70, 32, 12, 6, 4, 5, 8, 10, 9, 6, 4] },
      { type: 'bars', title: 'CDF 映射把灰度拉开', text: '拥挤的亮度段经过映射后占用更宽范围。', items: [
        { label: 'Before', value: 36, caption: '窄', color: '#94a3b8' },
        { label: 'After', value: 86, caption: '宽', color: '#14b8a6' }
      ] }
    ] }
  };

  window.AlgorithmContent.threshold = {
    phase: '阶段一 · 基础原语',
    title: '阈值化',
    english: 'Thresholding',
    tagline: '用一条亮度分界线把连续灰度切成前景和背景，Otsu 会自动寻找最能分开两类的阈值。',
    status: '真实 NumPy 算法',
    difficulty: '入门',
    endpoint: '/api/demo/threshold',
    formula: 'B(x,y)=255 if Y(x,y)>=T else 0; sigma_b^2=w0w1(mu0-mu1)^2',
    principles: [
      '阈值化把连续亮度变成二值标签，是轮廓、形态学和连通域分析的常见入口。',
      'Otsu 遍历所有候选阈值，选择类间方差最大的那一刀。'
    ],
    core: [['输入', '灰度亮度图'], ['核心问题', '阈值放在哪里最能分开前景和背景'], ['输出', '二值图和前景覆盖检查']],
    pipeline: [['灰度化', '统一成单通道亮度。'], ['统计直方图', '观察前景背景峰。'], ['Otsu 搜索', '最大化类间方差。'], ['二值判定', '按阈值输出 0/255。'], ['叠加检查', '看分割是否合理。']],
    applications: ['文档二值化', '工业缺陷检测', '医学区域粗分割', '轮廓/形态学前处理'],
    visualStory: { intro: '页面会展示红色阈值线如何切开直方图和像素。', cards: [
      { type: 'threshold', title: '一条线切开灰度轴', text: '线左侧归为背景，右侧归为前景。', position: 52 },
      { type: 'histogram', title: 'Otsu 找峰谷之间的位置', text: '当前景和背景形成两个峰，最佳阈值通常落在中间谷底。', values: [6, 14, 42, 78, 55, 20, 8, 5, 9, 24, 62, 80, 48, 18, 8, 4] }
    ] }
  };

  window.AlgorithmContent.noise = {
    phase: '阶段一 · 基础原语',
    title: '噪声模型',
    english: 'Noise Models',
    tagline: '噪声是信号里的随机扰动。椒盐、高斯、泊松噪声有不同形态，也需要不同的处理策略。',
    status: '真实 NumPy 算法',
    difficulty: '入门',
    endpoint: '/api/demo/noise',
    formula: "I_noisy=I+n; Gaussian: n~N(0,sigma^2); SaltPepper: I'=0 or 255",
    principles: [
      '椒盐噪声是稀疏极端坏点，适合用中值滤波处理。',
      '高斯噪声是连续加性扰动，常用高斯、双边或更强的去噪方法。',
      '泊松噪声与光子计数有关，低光照图像里很常见。'
    ],
    core: [['输入', '干净图像'], ['核心问题', '噪声以什么分布、位置和强度破坏像素'], ['输出', '噪声图、残差图和模型统计']],
    pipeline: [['生成椒盐噪声', '随机替换黑白坏点。'], ['生成高斯噪声', '逐像素叠加正态误差。'], ['生成泊松噪声', '模拟光子计数波动。'], ['残差分析', '观察图像被改动的位置和强度。']],
    applications: ['相机传感器建模', '图像降噪前分析', '滤波算法教学', '低光照成像理解'],
    visualStory: { intro: '噪声页采用实验台布局，对比不同噪声怎样破坏同一张图。', cards: [
      { type: 'particles', title: '随机扰动不是一种形态', text: '坏点是稀疏突发，高斯是连续颗粒，泊松和亮度相关。' },
      { type: 'bars', title: '不同噪声对应不同滤波器', text: '先判断噪声模型，再选择中值、高斯或保边滤波。', items: [
        { label: 'Median', value: 82, caption: '椒盐', color: '#f97316' },
        { label: 'Gaussian', value: 62, caption: '颗粒', color: '#8b5cf6' },
        { label: 'Bilateral', value: 70, caption: '保边', color: '#22c55e' }
      ] }
    ] }
  };

  window.AlgorithmContent.common = common;
})();
