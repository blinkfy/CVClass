(function () {
  'use strict';

  var rawCfg = window.ModelDemoConfig || {};
  var moduleId = rawCfg.moduleId || new URLSearchParams(location.search).get('id') || 'resnet';
  var cfg = mergeConfig(moduleId, rawCfg);
  var state = {
    file: null,
    result: null,
    dynamicParams: {},
    stage: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    file: $('fileInput'),
    fileName: $('fileName'),
    choose: $('chooseBtn'),
    sample: $('sampleBtn'),
    run: $('runBtn'),
    loading: $('loading'),
    error: $('errorBox'),
    metrics: $('metricsGrid'),
    steps: $('stepsGrid'),
    status: $('statusPill'),
    params: $('paramsPanel'),
    intro: $('introText'),
    problem: $('problemStatement')
  };

  init();

  function mergeConfig(id, incoming) {
    var preset = pagePreset(id);
    if (!preset) return incoming || {};
    var generic = !incoming || !incoming.title || incoming.title === id || incoming.status === '统一教学页';
    return generic ? Object.assign({}, incoming, preset) : Object.assign({}, preset, incoming);
  }

  function pagePreset(id) {
    var base = {
      status: '后端真实计算',
      params: [],
      pipeline: ['输入或内置样例', '后端真实计算', '结构化中间表示', '可交互结果解释'],
      applications: ['课堂演示', '原理讲解', '观察真实中间结果'],
      limitations: ['页面展示机制与可解释结果；是否为预训练推理由实现状态说明决定']
    };
    var presets = {
      dino: {
        title: 'DINO 自监督 ViT',
        subtitle: '学生网络和教师网络从多视图图像中学习一致表示。',
        intro: '后端构造多视图特征、teacher centering、temperature softmax 和 patch attention，让你看到自监督注意力如何逐步浮现。',
        status: '本地小型算法机制实现',
        pipeline: ['生成两种视图', '学生/教师编码', '中心化与温度 softmax', '对齐分布', '观察 emergent attention'],
        applications: ['自监督学习入门', '理解无标签视觉表征', '连接 ViT 与基础模型预训练']
      },
      mae: {
        title: 'MAE 掩码自编码',
        subtitle: '遮住大部分 patch，只用少量可见 token 重建图像。',
        intro: '后端返回 patchify、随机遮罩、可见 token 编码和遮挡 patch 重建；拖动遮罩比例时可重新生成可解释结果。',
        status: '本地小型算法机制实现',
        params: [{ name: 'mask_ratio', label: '遮罩比例', type: 'range', min: 40, max: 85, step: 5, value: 75, scale: 100, fixed: 2 }],
        pipeline: ['Patchify', '随机遮罩', '编码可见 token', '解码 mask token', '只在遮挡区域计算重建误差'],
        applications: ['自监督预训练', '理解高遮罩率为何迫使语义理解', '连接 ViT 预训练']
      },
      swin: {
        title: 'Swin Transformer',
        subtitle: '窗口注意力和移位窗口让视觉 Transformer 兼顾效率与跨窗口通信。',
        intro: '后端返回 patch partition、window attention、shifted window 和 patch merge 的真实矩阵/图像结果，前端按结构重绘。',
        status: '本地小型算法机制实现',
        params: [{ name: 'window_size', label: '窗口大小', type: 'range', min: 2, max: 8, step: 1, value: 4 }],
        pipeline: ['切分 patch', '窗口内自注意力', '移位窗口交换信息', 'Patch Merge 降采样', '形成层级特征'],
        applications: ['高效视觉 Transformer', '多尺度特征学习', '分类/检测/分割骨干网络讲解']
      },
      dino_det: {
        title: 'DINO 检测机制',
        subtitle: 'DETR 风格 query 加上 denoising query 和逐层框精修。',
        intro: '后端展示 object query、噪声框、box refinement 和匹配代价矩阵，说明现代端到端检测如何稳定训练。',
        status: '本地小型算法机制实现',
        pipeline: ['Object Query', 'Denoising Query', '逐层框精修', '匹配代价矩阵', '集合预测输出'],
        applications: ['端到端检测讲解', '理解 denoising 训练', '连接 DETR 与 Grounding DINO']
      },
      grdino: {
        title: 'Grounding DINO',
        subtitle: '用文本短语去定位图像区域，实现开放词表 grounding。',
        intro: '后端计算文本 token 与图像区域 token 的相似度、phrase heatmap 和 grounded boxes，页面只绘制真实返回数据。',
        status: '本地小型算法机制实现',
        params: [{ name: 'phrase', label: '目标短语', type: 'text', value: 'bright object' }],
        pipeline: ['图像区域 token', '文本短语 token', '跨模态相似度', '短语热力图', '短语定位框'],
        applications: ['开放词表检测', '图文 grounding', '理解文本如何参与视觉定位']
      },
      mask2former: {
        title: 'Mask2Former',
        subtitle: '把分割统一成 mask query 分类问题。',
        intro: '后端返回 pixel embedding、mask query、masked attention 和 class+mask 输出，适合对比语义/实例/全景分割。',
        status: '本地小型算法机制实现',
        pipeline: ['像素嵌入', 'Mask Query', 'Masked Attention', '类别 + Mask', '统一分割输出'],
        applications: ['语义分割', '实例分割', '全景分割统一范式讲解']
      },
      sam2: {
        title: 'SAM 2 视频提示分割',
        subtitle: '在 SAM 的提示分割上加入帧间 memory，让 mask 能沿时间传播。',
        intro: '后端构造帧间偏移、memory map、prompt encoding 和 mask propagation，展示视频分割为什么需要记忆。',
        status: '本地小型算法机制实现',
        pipeline: ['当前帧提示', '生成 mask memory', '传播到下一帧', '融合当前图像证据', '输出时序 mask'],
        applications: ['视频目标分割', '提示式交互', '理解基础模型从图像到视频的扩展']
      },
      blip2: {
        title: 'BLIP-2',
        subtitle: 'Q-Former 把图像 token 和语言模型之间接起来。',
        intro: '后端展示 image tokens、query cross-attention、文本候选对齐分数和图文摘要，强调多模态桥接机制。',
        status: '本地小型算法机制实现',
        pipeline: ['图像 token', 'Q-Former 查询', '跨注意力对齐', '文本候选打分', '生成/理解接口'],
        applications: ['图像问答', '图文描述', '多模态基础模型入门']
      },
      controlnet: {
        title: 'ControlNet',
        subtitle: '把边缘、姿态或深度等空间条件注入扩散模型。',
        intro: '后端返回条件图、零卷积残差分支和 guided denoising 轨迹，说明“按图控制生成”的机制。',
        status: '本地小型算法机制实现',
        pipeline: ['条件图', '控制分支', 'Zero-conv 残差注入', '带条件去噪', '空间结构保持'],
        applications: ['可控图像生成', '边缘/姿态/深度条件', '扩散模型工程化讲解']
      },
      dit: {
        title: 'DiT 扩散 Transformer',
        subtitle: '把潜变量切成 patch token，用 Transformer 做去噪。',
        intro: '后端返回 latent patches、time embedding、attention block 和 denoise update，展示 Transformer 如何接管 U-Net 的位置。',
        status: '本地小型算法机制实现',
        pipeline: ['潜变量 patchify', '加入时间嵌入', 'Transformer 去噪块', '预测噪声/速度', '更新潜变量'],
        applications: ['现代扩散骨干', 'Transformer 生成模型', '连接 ViT 与生成模型']
      },
      flux: {
        title: 'Flux / Flow Matching',
        subtitle: '学习从噪声流向数据的向量场，而不是一步步预测固定噪声。',
        intro: '后端返回双流 token、flow matching vector field 和 latent update 轨迹，用真实数组展示“流”的含义。',
        status: '本地小型算法机制实现',
        pipeline: ['文本/图像双流', '时间条件', '向量场预测', '潜变量轨迹更新', '到达数据分布'],
        applications: ['新一代生成模型', '理解 flow matching', '对比 DDPM 与 ODE/流模型']
      },
      stylegan: {
        title: 'StyleGAN',
        subtitle: 'Mapping network 把 z 变成风格向量，再逐层调制卷积。',
        intro: '后端返回 latent mapping、AdaIN/调制权重、渐进合成图和风格通道贡献，展示“风格控制”不是前端假图。',
        status: '本地小型算法机制实现',
        params: [{ name: 'style_strength', label: '风格强度', type: 'range', min: 20, max: 120, step: 10, value: 80, scale: 100, fixed: 1 }],
        pipeline: ['z -> w 映射', '逐层风格调制', '低分辨率到高分辨率合成', '噪声细节注入', '输出生成图'],
        applications: ['人脸/图像生成原理', '风格控制', '连接 GAN 基础与高质量生成']
      },
      dust3r: {
        title: 'DUSt3R',
        subtitle: '直接从图像对预测密集匹配、深度和点云。',
        intro: '后端返回 dense matching、depth/confidence map 和 point cloud preview，让 3D 重建从“匹配点”扩展到“密集场”。',
        status: '本地小型算法机制实现',
        pipeline: ['图像对特征', '密集匹配', '深度/置信度', '点云重投影', '三维预览'],
        applications: ['多视图三维重建', '深度估计', '理解现代几何基础模型']
      },
      orbslam3: {
        title: 'ORB-SLAM3',
        subtitle: '用 ORB 关键点、匹配、位姿图和关键帧维护相机轨迹。',
        intro: '后端返回 ORB keypoints、matching、keyframe map 和 pose graph 机制图，展示 SLAM 的核心数据流。',
        status: '本地小型算法机制实现',
        pipeline: ['提取 ORB 特征', '帧间匹配', '估计相机位姿', '维护关键帧地图', '位姿图优化'],
        applications: ['机器人定位建图', 'AR/VR 跟踪', '连接特征匹配与三维几何']
      },
      mediapipe: {
        title: 'MediaPipe Pose',
        subtitle: '热力图定位关键点，再连接成骨架。',
        intro: '后端返回 landmark heatmaps、soft-argmax 坐标和 skeleton graph，说明姿态估计的结构化输出。',
        status: '本地小型算法机制实现',
        pipeline: ['人体区域', '关键点热力图', 'soft-argmax', '骨架连线', '姿态指标'],
        applications: ['人体姿态估计', '交互应用', '运动分析']
      },
      vitpose: {
        title: 'ViTPose',
        subtitle: '用 ViT patch feature 预测人体关键点热力图。',
        intro: '后端返回 patch feature、keypoint heatmap head 和 pose overlay，展示 Transformer 如何做密集关键点预测。',
        status: '本地小型算法机制实现',
        pipeline: ['人体输入', 'ViT patch feature', '关键点热力图头', '峰值定位', '骨架叠加'],
        applications: ['姿态估计', '人体理解', 'Transformer dense prediction']
      }
    };
    var preset = presets[id];
    if (!preset) return null;
    return Object.assign({}, base, preset);
  }

  function init() {
    document.title = (cfg.title || moduleId) + ' - CV 通识教育';
    document.body.classList.add('model-' + moduleId);
    setText('pageTitle', cfg.title || moduleId);
    setText('subtitle', cfg.subtitle || '');
    if (els.intro) els.intro.textContent = cfg.intro || '';
    renderProblemStatement();
    if (els.status) els.status.textContent = cfg.status || '后端真实计算';
    renderStaticSections();
    renderParams();
    ensureTeachingStage();
    bind();
    runDemo();
  }

  function defaultProblemStatement(id) {
    var map = {
      resnet: '它解决的是“这张图属于什么类别”的问题，并用 Grad-CAM 说明模型主要看了图像里的哪些区域。',
      vit: '它解决的是“把图像切成 patch 后如何做分类”的问题，让你看到 Transformer 如何在整张图里建立关系。',
      detr: '它解决的是“图里有哪些目标、它们在哪里”的问题，用 Transformer 直接预测一组类别和边界框。',
      clip: '它解决的是“图像和文字怎么对齐”的问题，把图片和文本放到同一个语义空间里做匹配。',
      sam: '它解决的是“给一个点或框后，应该分割出哪个物体”的问题，用提示来得到目标 mask。',
      nerf: '它解决的是“如何从视角生成三维场景的新图像”的问题，用射线采样和体渲染合成新视图。',
      gan: '它解决的是“如何从随机噪声生成逼真样本”的问题，通过生成器和判别器对抗学习图像分布。',
      nn_gan: '它解决的是“如何从随机噪声生成逼真样本”的问题，通过生成器和判别器对抗学习图像分布。',
      diffusion: '它解决的是“如何从噪声一步步还原图像”的问题，用去噪过程学习生成图像。',
      stable_diffusion: '它解决的是“如何按文字提示生成图像”的问题，在潜空间里逐步去噪并用文本条件控制结果。',
      sd: '它解决的是“如何按文字提示生成图像”的问题，在潜空间里逐步去噪并用文本条件控制结果。',
      yolo: '它解决的是“如何更快地检测目标”的问题，在单次前向计算中直接预测目标类别和位置。',
      unet: '它解决的是“如何得到细边界的像素级分割”的问题，用编码器看大局、解码器恢复空间细节。',
      nn_interactive: '它解决的是“神经网络每一层到底在做什么”的问题，把卷积、激活、池化和分类过程拆开观察。'
    };
    return map[id] || '';
  }

  function renderProblemStatement() {
    if (!els.problem) return;
    var text = cfg.problemStatement || cfg.problem_statement || cfg.problem || defaultProblemStatement(moduleId) || cfg.subtitle || cfg.intro || '';
    els.problem.innerHTML = '<b>解决的问题</b>' + esc(text);
  }

  function bind() {
    if (els.choose && els.file) {
      els.choose.addEventListener('click', function () { els.file.click(); });
      els.file.addEventListener('change', function () {
        state.file = els.file.files && els.file.files[0] ? els.file.files[0] : null;
        if (els.fileName) {
          els.fileName.textContent = state.file ? state.file.name : '未选择文件，将使用内置示例';
        }
      });
    }
    if (els.sample) {
      els.sample.addEventListener('click', function () {
        state.file = null;
        if (els.file) els.file.value = '';
        if (els.fileName) els.fileName.textContent = '使用内置示例';
        runDemo();
      });
    }
    if (els.run) els.run.addEventListener('click', runDemo);
  }

  function ensureTeachingStage() {
    var root = $('interactiveStageRoot');
    if (!root && els.metrics) {
      var panel = document.createElement('section');
      panel.className = 'panel interactive-stage-panel';
      panel.innerHTML = '<div id="interactiveStageRoot"></div>';
      var stepsPanel = els.steps ? els.steps.closest('.panel') : null;
      if (stepsPanel && stepsPanel.parentNode) {
        stepsPanel.parentNode.insertBefore(panel, stepsPanel);
      } else {
        els.metrics.insertAdjacentElement('afterend', panel);
      }
      root = $('interactiveStageRoot');
    }
    if (!root || state.stage || !window.InteractiveTeachingStage) return;
    state.stage = window.InteractiveTeachingStage.mount(root, {
      frameDelay: Number(cfg.frameDelay || 1050),
      onParamChange: function (name, value) {
        state.dynamicParams[name] = value;
        syncParamInput(name, value);
        runDemo();
      }
    });
  }

  function renderParams() {
    if (!els.params || !cfg.params || !cfg.params.length) return;
    els.params.innerHTML = cfg.params.map(function (p) {
      var value = p.value == null ? '' : p.value;
      if (p.type === 'range') {
        return '<label class="param"><span>' + esc(p.label) + '</span><input id="param_' + esc(p.name) +
          '" type="range" min="' + esc(p.min) + '" max="' + esc(p.max) + '" step="' + esc(p.step || 1) +
          '" value="' + esc(value) + '"><strong id="param_' + esc(p.name) + '_value">' + esc(formatParam(p, value)) +
          '</strong></label>';
      }
      if (p.type === 'select') {
        return '<label class="param"><span>' + esc(p.label) + '</span><select id="param_' + esc(p.name) + '">' +
          (p.options || []).map(function (opt) {
            var val = typeof opt === 'string' ? opt : opt.value;
            var label = typeof opt === 'string' ? opt : opt.label;
            return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' +
              esc(label) + '</option>';
          }).join('') + '</select></label>';
      }
      return '<label class="param text-param"><span>' + esc(p.label) + '</span><input id="param_' + esc(p.name) +
        '" type="text" value="' + esc(value) + '"></label>';
    }).join('');
    cfg.params.forEach(function (p) {
      var input = $('param_' + p.name);
      var value = $('param_' + p.name + '_value');
      if (!input) return;
      if (value) input.addEventListener('input', function () {
        delete state.dynamicParams[p.name];
        value.textContent = formatParam(p, input.value);
      });
      if (p.live) input.addEventListener('change', runDemo);
    });
  }

  function renderStaticSections() {
    renderList('pipelineList', cfg.pipeline);
    renderList('applicationsList', cfg.applications);
    renderList('limitationsList', cfg.limitations);
  }

  function renderList(id, items) {
    var node = $(id);
    if (!node || !items) return;
    node.innerHTML = items.map(function (item) {
      if (Array.isArray(item)) return '<li><strong>' + esc(item[0]) + '</strong> ' + esc(item[1] || '') + '</li>';
      return '<li>' + esc(item) + '</li>';
    }).join('');
  }

  function runDemo() {
    clearError();
    setBusy(true);
    var form = new FormData();
    if (state.file) form.append('file', state.file);
    (cfg.params || []).forEach(function (p) {
      if (Object.prototype.hasOwnProperty.call(state.dynamicParams, p.name)) return;
      var input = $('param_' + p.name);
      if (input) form.append(p.name, normalizeParam(p, input.value));
    });
    Object.keys(state.dynamicParams).forEach(function (key) {
      form.append(key, state.dynamicParams[key]);
    });
    fetch('/api/demo/' + encodeURIComponent(moduleId), { method: 'POST', body: form })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          json._status = res.status;
          if (!res.ok && json.error) {
            var err = new Error(json.error);
            err.payload = json;
            throw err;
          }
          return json;
        });
      })
      .then(function (json) {
        setBusy(false);
        state.result = json;
        renderResult(json);
        if (json.error) showError(json.error);
      })
      .catch(function (err) {
        setBusy(false);
        if (err.payload) {
          state.result = err.payload;
          renderResult(err.payload);
        }
        showError('请求失败：' + (err.message || err));
      });
  }

  function renderResult(json) {
    if (state.stage) state.stage.render(json);
    renderMetrics(json.metrics || {}, json.implementation || {});
    renderSteps(json.steps || []);
    if (window.renderLatexIn) window.renderLatexIn(document);
  }

  function renderMetrics(metrics, impl) {
    if (!els.metrics) return;
    var rows = [];
    if (impl.status) rows.push(['实现状态', impl.status]);
    if (impl.category) rows.push(['类型', impl.category]);
    if (impl.model) rows.push(['模型/算法', impl.model]);
    if (impl.backend) rows.push(['后端', impl.backend]);
    [
      'status', 'backend', 'model', 'device', 'top1', 'top1_prob', 'top1_conf',
      'num_detections', 'num_queries', 'query_idx', 'head_idx', 'layer',
      'reconstruction_mse', 'samples_per_ray', 'azimuth', 'D_loss_final',
      'G_loss_final', 'iterations', 'resolution', 'steps', 'class_set',
      'prompt', 'inference_steps', 'guidance_scale'
    ].forEach(function (key) {
      if (metrics[key] !== undefined) rows.push([labelMetric(key), metrics[key]]);
    });
    if (!rows.length) rows.push(['状态', '已返回后端结果']);
    els.metrics.innerHTML = rows.map(function (row) {
      return '<div class="metric"><span>' + esc(row[0]) + '</span><strong>' + esc(formatValue(row[1])) + '</strong></div>';
    }).join('');
  }

  function stepTeachingHtml(step) {
    var parts = [];
    if (step.problem_statement) parts.push(['解决的问题', step.problem_statement]);
    if (step.plain_explanation || step.teaching_summary) parts.push(['这一步', step.plain_explanation || step.teaching_summary]);
    if (step.watch_for) parts.push(['观察重点', step.watch_for]);
    if (
      step.explanation &&
      step.explanation !== step.plain_explanation &&
      (!step.problem_statement || step.explanation.indexOf(step.problem_statement) !== 0)
    ) {
      parts.push(['严谨说明', step.explanation]);
    }
    return parts.map(function (part) {
      return '<p class="step-note"><b>' + esc(part[0]) + '</b>' + esc(part[1]) + '</p>';
    }).join('');
  }

  function renderSteps(steps) {
    if (!els.steps) return;
    if (!steps.length) {
      els.steps.innerHTML = '<div class="empty">后端没有返回步骤。若这是预训练模型，请先准备权重或查看错误提示。</div>';
      return;
    }
    els.steps.innerHTML = steps.map(function (step, index) {
      var img = step.diagram
        ? '<div class="step-diagram-thumb" data-step-diagram="' + index + '"></div>'
        : step.chart
        ? '<canvas class="step-chart-thumb" data-step-chart="' + index + '" aria-label="' + esc(step.name || step.id || 'chart') + '"></canvas>'
        : (step.image_base64
        ? '<img src="data:image/png;base64,' + step.image_base64 + '" alt="' + esc(step.name || step.id || 'step') + '" loading="lazy">'
        : '<div class="no-image">无图像</div>');
      return '<button class="step-card" type="button" data-index="' + index + '">' +
        '<div class="step-index">' + String(index + 1).padStart(2, '0') + '</div>' +
        '<div class="step-media">' + img + '</div>' +
        '<div class="step-body"><h3>' + esc(step.name || step.id || '步骤') + '</h3>' +
        stepTeachingHtml(step) +
        (step.formula ? '<code class="step-formula">' + esc(step.formula) + '</code>' : '') +
        renderDataDetails(step.data) + '</div></button>';
    }).join('');
    renderStepDiagrams(steps);
    drawStepCharts(steps);
    Array.prototype.forEach.call(els.steps.querySelectorAll('.step-card'), function (card) {
      card.addEventListener('click', function () {
        if (state.stage) state.stage.showFrame(Number(card.dataset.index || 0));
      });
    });
  }

  function renderStepDiagrams(steps) {
    if (!els.steps) return;
    Array.prototype.forEach.call(els.steps.querySelectorAll('[data-step-diagram]'), function (node) {
      var step = steps[Number(node.dataset.stepDiagram || 0)];
      var diagram = step && step.diagram;
      if (!diagram) return;
      var nodes = Array.isArray(diagram.nodes) ? diagram.nodes.slice(0, 4) : [];
      node.innerHTML = '<div class="step-diagram-title">' + esc(diagram.title || step.name || '结构图') + '</div>' +
        '<div class="step-diagram-flow">' + nodes.map(function (item) {
          return '<span data-tone="' + esc(item.tone || item.kind || 'default') + '">' + esc(item.label || item.name || item.id) + '</span>';
        }).join('') + '</div>';
    });
  }

  function drawStepCharts(steps) {
    var helper = window.InteractiveTeachingStage && window.InteractiveTeachingStage.helpers && window.InteractiveTeachingStage.helpers.drawMiniChart;
    if (!helper || !els.steps) return;
    Array.prototype.forEach.call(els.steps.querySelectorAll('[data-step-chart]'), function (canvas) {
      var step = steps[Number(canvas.dataset.stepChart || 0)];
      if (step && step.chart) helper(canvas, step.chart);
    });
  }

  function renderDataDetails(data) {
    if (!data || typeof data !== 'object') return '';
    var keys = Object.keys(data).filter(function (key) {
      return !/image|base64|mask/i.test(key);
    }).slice(0, 6);
    if (!keys.length) return '';
    return '<details><summary>中间数据</summary><dl>' + keys.map(function (key) {
      return '<dt>' + esc(key) + '</dt><dd>' + esc(formatValue(data[key])) + '</dd>';
    }).join('') + '</dl></details>';
  }

  function setBusy(flag) {
    if (els.loading) els.loading.hidden = !flag;
    if (els.run) els.run.disabled = flag;
    if (els.sample) els.sample.disabled = flag;
    if (els.choose) els.choose.disabled = flag;
  }

  function showError(msg) {
    if (!els.error) return;
    els.error.hidden = false;
    els.error.textContent = String(msg || '未知错误');
  }

  function clearError() {
    if (!els.error) return;
    els.error.hidden = true;
    els.error.textContent = '';
  }

  function normalizeParam(p, value) {
    if (p.scale) return Number(value) / p.scale;
    return value;
  }

  function syncParamInput(name, value) {
    var input = $('param_' + name);
    if (input) input.value = value;
    var param = (cfg.params || []).filter(function (p) { return p.name === name; })[0] || {};
    var out = $('param_' + name + '_value');
    if (out) out.textContent = formatParam(param, value);
  }

  function formatParam(p, value) {
    if (p.scale) return (Number(value) / p.scale).toFixed(p.fixed == null ? 2 : p.fixed);
    if (p.suffix) return value + p.suffix;
    return value;
  }

  function labelMetric(key) {
    var map = {
      status: '状态',
      backend: '后端',
      model: '模型',
      device: '设备',
      top1: 'Top-1',
      top1_prob: 'Top-1 概率',
      top1_conf: 'Top-1 置信度',
      num_detections: '检测数',
      num_queries: 'Query 数',
      query_idx: 'Query',
      head_idx: '注意力头',
      layer: '层',
      reconstruction_mse: '重建 MSE',
      samples_per_ray: '每条射线采样',
      azimuth: '视角',
      D_loss_final: '最终 D loss',
      G_loss_final: '最终 G loss',
      iterations: '迭代轮数',
      resolution: '分辨率',
      steps: '时间步',
      class_set: '候选词集',
      prompt: '提示词',
      inference_steps: '推理步数',
      guidance_scale: 'CFG 引导强度'
    };
    return map[key] || key;
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function formatValue(value) {
    var mapped = displayValue(value);
    if (mapped !== null) return mapped;
    if (Array.isArray(value)) {
      if (value.length > 6) return 'len=' + value.length + ' ' + JSON.stringify(value.slice(0, 3));
      return JSON.stringify(value);
    }
    if (value && typeof value === 'object') return JSON.stringify(value).slice(0, 180);
    if (typeof value === 'number') return Math.round(value * 10000) / 10000;
    return value == null ? '' : String(value);
  }

  function displayValue(value) {
    if (typeof value !== 'string') return null;
    var map = {
      local_mechanism: '本地机制实现',
      local_teaching_fallback: '本地教学兜底',
      pretrained_model: '真实预训练模型',
      partial_error: '部分结果可用',
      unavailable: '暂不可用',
      torch: 'PyTorch',
      torchvision: 'torchvision 真实推理',
      'NumPy/PIL': 'NumPy/Pillow 本地计算',
      'NumPy/Pillow': 'NumPy/Pillow 本地计算',
      'YOLO-style one-stage grid mechanism': 'YOLO 风格单阶段网格机制',
      'NumPy/Pillow one-stage grid detector': 'NumPy/Pillow 单阶段网格检测器',
      local_edge_objectness_detector: '本地边缘目标性检测器',
      local_color_spatial_segmentation: '本地颜色-空间语义分割',
      local_proposal_mask_segmenter: '本地候选框实例分割',
      local_encoder_decoder_unet_mechanism: '本地编码器-解码器分割机制',
      local_diffusion_teaching_model: '本地扩散教学模型',
      local_gan_teaching_model: '本地 GAN 教学模型'
    };
    return Object.prototype.hasOwnProperty.call(map, value) ? map[value] : null;
  }

  function esc(value) {
    if (window.esc) return window.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
}());
