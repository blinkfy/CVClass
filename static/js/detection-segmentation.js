(function () {
  'use strict';

  var TASK_TEXT = {
    all: '三视角总览',
    detection: '目标检测',
    semantic: '语义分割',
    instance: '实例分割',
    yolo: 'YOLO范式',
    unet: 'U-Net机制'
  };

  var TASK_GUIDE = {
    detection: {
      title: '图里有什么，在哪里',
      text: '它解决的是“找物体”的问题：比如图里有没有人、车、狗，它们大概在什么位置。结果要按三个东西读：类别名称、置信度、边界框。它适合定位和计数，但只给矩形框，不给精确轮廓。',
      formula: 'D={(box_i,class_i,score_i)}',
      output: '框 + 类别 + 置信度'
    },
    semantic: {
      title: '每个像素是什么类别',
      text: '它解决的是“给整张图涂类别颜色”的问题：道路、天空、车辆、人体等区域分别在哪里。它会给每个像素一个类别，但不会区分同类里的不同个体。',
      formula: 'label(x,y)=argmax_c p_c(x,y)',
      output: '每个像素一个类别'
    },
    instance: {
      title: '同类物体也要一个个分开',
      text: '它解决的是“哪个个体是哪一个”的问题：两个人同样都是 person，但要有两个独立 mask。它结合检测框和像素 mask，适合需要数个体、量面积、抠单个目标的场景。',
      formula: 'I_i=(box_i,class_i,mask_i)',
      output: '框 + 类别 + 每个实例自己的 mask'
    },
    yolo: {
      title: 'YOLO范式：一次看完整张图并快速出框',
      text: '它解决的是“检测要更快”的问题：把图像划成网格，每个位置直接预测有没有目标和框在哪里。本页是后端本地机制实现，用真实计算讲清单阶段思想，不冒充官方 YOLO 权重。',
      formula: 'box,obj,class=head(grid(I))',
      output: '网格目标性 + 候选框 + 去重结果'
    },
    unet: {
      title: 'U-Net机制：既看全局，又保边界',
      text: '它解决的是“像素级 mask 边界要细”的问题：编码器压缩图像看大局，解码器恢复尺寸，跳跃连接把早期边缘细节补回来。本页是后端本地机制实现，不冒充训练好的 U-Net 权重。',
      formula: 'D_l=concat(up(D_{l+1}),E_l)',
      output: '前景概率图 + 二值 mask'
    }
  };

  var state = {
    task: initialTask(),
    model: '',
    file: null,
    models: null,
    result: null,
    stage: null,
    filter: 'all',
    selectedTask: 'detection'
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    taskBtns: Array.prototype.slice.call(document.querySelectorAll('.task-btn')),
    filterBtns: Array.prototype.slice.call(document.querySelectorAll('.filter-btn')),
    modelSelect: $('modelSelect'),
    modelHint: $('modelHint'),
    fileInput: $('fileInput'),
    uploadBtn: $('uploadBtn'),
    sampleBtn: $('sampleBtn'),
    modelsBtn: $('modelsBtn'),
    runBtn: $('runBtn'),
    fileLine: $('fileLine'),
    score: $('scoreThreshold'),
    scoreValue: $('scoreValue'),
    mask: $('maskThreshold'),
    maskValue: $('maskValue'),
    inspectTitle: $('inspectTitle'),
    inspectText: $('inspectText'),
    formula: $('formulaBox'),
    inspectData: $('inspectData'),
    overview: $('overviewGrid'),
    objectList: $('objectList'),
    steps: $('stepsGrid'),
    modelStrip: $('modelStrip'),
    loading: $('loading'),
    error: $('errorBox')
  };

  init();

  function init() {
    bind();
    state.stage = window.InteractiveTeachingStage && window.InteractiveTeachingStage.mount($('interactiveStageRoot'), {
      compact: true,
      frameDelay: 1000,
      onParamChange: function (name, value) {
        if (name === 'score_threshold') el.score.value = Math.round(Number(value) * 100);
        if (name === 'mask_threshold') el.mask.value = Math.round(Number(value) * 100);
        updateThresholdText();
        runCurrentTask();
      }
    });
    loadModels().then(function () {
      applyTask(state.task);
      runCurrentTask();
    });
  }

  function initialTask() {
    var params = new URLSearchParams(location.search);
    var raw = params.get('module') || params.get('task') || params.get('tab') || location.hash.replace('#', '');
    return ['detection', 'semantic', 'instance', 'yolo', 'unet'].indexOf(raw) >= 0 ? raw : 'all';
  }

  function bind() {
    el.taskBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTask(btn.dataset.task);
        runCurrentTask();
      });
    });
    el.filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.dataset.filter;
        el.filterBtns.forEach(function (item) { item.classList.toggle('active', item === btn); });
        renderSteps();
      });
    });
    el.modelSelect.addEventListener('change', function () {
      state.model = el.modelSelect.value;
      renderModelHint();
    });
    el.uploadBtn.addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', function () {
      state.file = el.fileInput.files && el.fileInput.files[0] ? el.fileInput.files[0] : null;
      el.fileLine.textContent = state.file ? state.file.name : '未选择图片，将使用内置示例图。';
    });
    el.sampleBtn.addEventListener('click', function () {
      state.file = null;
      el.fileInput.value = '';
      el.fileLine.textContent = '使用内置示例图。';
      runCurrentTask();
    });
    el.modelsBtn.addEventListener('click', function () {
      loadModels(true).then(function () { applyTask(state.task); });
    });
    el.runBtn.addEventListener('click', runCurrentTask);
    el.score.addEventListener('input', updateThresholdText);
    el.mask.addEventListener('input', updateThresholdText);
    el.score.addEventListener('change', runCurrentTask);
    el.mask.addEventListener('change', runCurrentTask);
  }

  function loadModels(force) {
    if (state.models && !force) return Promise.resolve(state.models);
    return fetch('/api/ai-eye/models')
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
          state.models = json;
          renderModelStrip();
          return json;
        });
      })
      .catch(function (err) {
        showError('模型清单读取失败：' + (err.message || err));
      });
  }

  function applyTask(task) {
    state.task = task || 'all';
    state.selectedTask = state.task === 'all' ? 'detection' : state.task;
    el.taskBtns.forEach(function (btn) { btn.classList.toggle('active', btn.dataset.task === state.task); });
    renderModelOptions();
    renderModelHint();
    updateThresholdText();
    history.replaceState(null, '', '?task=' + encodeURIComponent(state.task));
  }

  function renderModelOptions() {
    if (!state.models) return;
    if (state.task === 'yolo' || state.task === 'unet') {
      var label = state.task === 'yolo' ? 'YOLO-style 本地机制实现' : 'U-Net-style 本地机制实现';
      el.modelSelect.innerHTML = '<option value="local_mechanism">' + esc(label) + '</option>';
      el.modelSelect.disabled = true;
      state.model = 'local_mechanism';
      return;
    }
    var task = state.task === 'all' ? 'detection' : state.task;
    var ids = state.models.tasks[task] || [];
    var defaultId = state.models.defaults[task] || ids[0] || '';
    if (ids.indexOf(state.model) < 0) state.model = defaultId;
    el.modelSelect.innerHTML = ids.map(function (id) {
      var model = state.models.models[id] || {};
      var cached = model.cached ? '已缓存' : '待下载';
      return '<option value="' + esc(id) + '"' + (id === state.model ? ' selected' : '') + '>' +
        esc((model.name || id) + ' · ' + cached) + '</option>';
    }).join('');
    el.modelSelect.disabled = state.task === 'all';
  }

  function renderModelHint() {
    if (!state.models) return;
    if (state.task === 'all') {
      el.modelHint.textContent = '总览会同时运行检测、语义分割、实例分割的默认模型；切到单任务后可切换模型。';
      return;
    }
    if (state.task === 'yolo') {
      el.modelHint.textContent = 'YOLO范式为后端 NumPy/Pillow 本地机制实现：真实计算网格、候选框和过滤，但不是官方训练权重。';
      return;
    }
    if (state.task === 'unet') {
      el.modelHint.textContent = 'U-Net机制为后端本地编码器、瓶颈、解码器与跳跃融合计算，用来讲清结构，不冒充训练权重。';
      return;
    }
    var model = state.models.models[state.model];
    el.modelHint.textContent = model ? (model.description + ' 优势：' + model.strengths + ' 局限：' + model.limitations) : '';
  }

  function updateThresholdText() {
    el.scoreValue.textContent = value01(el.score);
    el.maskValue.textContent = value01(el.mask);
  }

  function runCurrentTask() {
    clearError();
    setBusy(true);
    var local = state.task === 'yolo' || state.task === 'unet';
    var endpoint = local ? '/api/demo/' + state.task : '/api/demo/ai_eye';
    var form = new FormData();
    if (!local) form.append('task', state.task);
    if (!local && state.task !== 'all' && state.model) form.append('model', state.model);
    form.append('score_threshold', value01(el.score));
    form.append('threshold', value01(el.score));
    form.append('mask_threshold', value01(el.mask));
    form.append('return_steps', '1');
    if (state.file) form.append('file', state.file);

    fetch(endpoint, { method: 'POST', body: form })
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
        if (json.models) state.models = json.models;
        renderAll();
        if (json.error) showError(json.error);
      })
      .catch(function (err) {
        setBusy(false);
        if (err.payload) {
          state.result = err.payload;
          renderAll();
        }
        showError('运行失败：' + (err.message || err));
      });
  }

  function renderAll() {
    if (state.stage) state.stage.render(state.result || {});
    state.selectedTask = defaultSelectedTask(state.result || {});
    renderOverview();
    renderObjects();
    renderSteps();
    renderModelStrip();
    updateInspectorForTask(state.selectedTask);
    if (window.renderLatexIn) window.renderLatexIn(document);
  }

  function defaultSelectedTask(json) {
    if (json.module_id === 'yolo') return 'yolo';
    if (json.module_id === 'unet') return 'unet';
    if (state.task !== 'all') return state.task;
    var outputs = json.outputs || {};
    if (outputs.detection) return 'detection';
    if (outputs.semantic) return 'semantic';
    if (outputs.instance) return 'instance';
    return 'detection';
  }

  function overviewCards() {
    if (!state.result) return [];
    if (state.result.module_id === 'yolo') {
      return [{ task: 'yolo', title: 'YOLO范式', badge: 'local mechanism', image: findStepImage(['detections', 'score_filter']), text: TASK_GUIDE.yolo.text }];
    }
    if (state.result.module_id === 'unet') {
      return [{ task: 'unet', title: 'U-Net机制', badge: 'local mechanism', image: findStepImage(['mask', 'probability', 'skip_fusion']), text: TASK_GUIDE.unet.text }];
    }
    return [
      { task: 'detection', title: '目标检测', badge: 'box + class + score', image: findStepImage(['detection_detections', 'detection_score_filter', 'detections']), text: summarizeTask('detection') },
      { task: 'semantic', title: '语义分割', badge: 'pixel class map', image: findStepImage(['semantic_overlay', 'semantic_label_map', 'overlay', 'label_map']), text: summarizeTask('semantic') },
      { task: 'instance', title: '实例分割', badge: 'box + mask', image: findStepImage(['instance_masks', 'instance_mask_threshold', 'masks']), text: summarizeTask('instance') }
    ].filter(function (card) {
      return state.task === 'all' || state.task === card.task || ((state.result.outputs || {})[card.task]);
    });
  }

  function renderOverview() {
    var cards = overviewCards();
    if (!cards.length) {
      el.overview.innerHTML = '<div class="empty-card">当前结果没有可展示的总览图。</div>';
      return;
    }
    el.overview.innerHTML = cards.map(function (card) {
      return '<button class="overview-card' + (card.task === state.selectedTask ? ' active' : '') +
        '" type="button" data-task="' + esc(card.task) + '">' +
        '<header><strong>' + esc(card.title) + '</strong><span>' + esc(card.badge) + '</span></header>' +
        '<div class="media">' + (card.image ? '<img src="data:image/png;base64,' + card.image + '" alt="' + esc(card.title) + '">' : '<span class="empty-card">无图</span>') + '</div>' +
        '<p>' + esc(card.text) + '</p></button>';
    }).join('');
    Array.prototype.forEach.call(el.overview.querySelectorAll('.overview-card'), function (button) {
      button.addEventListener('click', function () {
        state.selectedTask = button.dataset.task;
        renderOverview();
        renderObjects();
        updateInspectorForTask(state.selectedTask);
      });
    });
  }

  function summarizeTask(task) {
    var alg = (state.result.algorithms || {})[task];
    if (!alg) return '当前运行范围未包含该任务。';
    if (alg.error) return alg.error;
    var out = ((state.result.outputs || {})[task]) || alg.output || {};
    if (task === 'detection') return TASK_GUIDE.detection.text + ' 当前检测到 ' + ((out.detections || []).length) + ' 个高于阈值的目标。';
    if (task === 'semantic') return TASK_GUIDE.semantic.text + ' 当前得到 ' + ((out.labels || []).length) + ' 个主要语义类别及像素占比。';
    return TASK_GUIDE.instance.text + ' 当前分离出 ' + ((out.instances || []).length) + ' 个实例。';
  }

  function currentObjects() {
    if (!state.result) return [];
    if (state.selectedTask === 'detection') {
      return getOutput('detection', 'detections').map(function (det, index) {
        return { key: 'detection-' + index, title: det.label || 'object', badge: 'score ' + formatNumber(det.score), text: '边界框 ' + formatBox(det.box), data: det, score: Number(det.score || 0) };
      });
    }
    if (state.selectedTask === 'instance') {
      return getOutput('instance', 'instances').map(function (inst, index) {
        return { key: 'instance-' + index, title: inst.label || 'instance', badge: 'score ' + formatNumber(inst.score), text: '面积 ' + (inst.area || 0) + ' 像素，框 ' + formatBox(inst.box), data: inst, score: Number(inst.score || 0) };
      });
    }
    if (state.selectedTask === 'semantic') {
      return getOutput('semantic', 'labels').map(function (label, index) {
        return { key: 'semantic-' + index, title: label.label || ('class ' + label.label_id), badge: Math.round((label.ratio || 0) * 1000) / 10 + '%', text: '像素数 ' + label.pixels + '，类别 ID ' + label.label_id, data: label, score: Number(label.ratio || 0) };
      });
    }
    if (state.selectedTask === 'yolo') {
      return extractStepData('detections', 'detections').map(function (det, index) {
        return { key: 'yolo-' + index, title: det.label || ('候选 ' + (index + 1)), badge: 'score ' + formatNumber(det.score), text: 'YOLO 机制候选框 ' + formatBox(det.box), data: det, score: Number(det.score || det.objectness || 0) };
      });
    }
    return [];
  }

  function renderObjects() {
    var objects = currentObjects();
    if (!objects.length) {
      el.objectList.innerHTML = '<div class="empty-card">当前视角没有可点击的结构化对象，请查看过程步骤。</div>';
      return;
    }
    el.objectList.innerHTML = objects.map(function (obj, index) {
      return '<button class="object-card" type="button" data-index="' + index + '">' +
        '<header><strong>' + esc(obj.title) + '</strong><span>' + esc(obj.badge) + '</span></header>' +
        '<p>' + esc(obj.text) + '</p><div class="bars"><div class="mini-bar"><i style="--w:' +
        Math.max(3, Math.min(100, obj.score * 100)).toFixed(1) + '%"></i></div></div></button>';
    }).join('');
    Array.prototype.forEach.call(el.objectList.querySelectorAll('.object-card'), function (button) {
      button.addEventListener('click', function () {
        updateInspectorForObject(objects[Number(button.dataset.index || 0)]);
      });
    });
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

  function renderSteps() {
    var steps = ((state.result && state.result.steps) || []).filter(function (step) {
      if (state.filter === 'all') return true;
      return String(step.id || '').indexOf(state.filter + '_') === 0 || String(step.id || '').indexOf(state.filter) >= 0;
    });
    if (!steps.length) {
      el.steps.innerHTML = '<div class="empty-card">暂无可展示步骤。</div>';
      return;
    }
    el.steps.innerHTML = steps.map(function (step, index) {
      var img = step.chart
        ? '<canvas class="step-chart-thumb" data-step-chart="' + index + '" aria-label="' + esc(step.name || step.id || 'chart') + '"></canvas>'
        : (step.image_base64 ? '<img src="data:image/png;base64,' + step.image_base64 + '" alt="' + esc(step.name || step.id || 'step') + '">' : '<div class="empty-card">无图</div>');
      return '<article class="step-card">' +
        '<div class="step-img">' + img + '</div><div class="step-copy">' +
        '<span>' + String(index + 1).padStart(2, '0') + '</span><h3>' + esc(step.name || step.id || '步骤') + '</h3>' +
        stepTeachingHtml(step) +
        (step.formula ? '<code class="formula">' + esc(step.formula) + '</code>' : '') +
        '</div></article>';
    }).join('');
    drawStepCharts(steps);
    if (window.renderLatexIn) window.renderLatexIn(el.steps);
  }

  function drawStepCharts(steps) {
    var helper = window.InteractiveTeachingStage && window.InteractiveTeachingStage.helpers && window.InteractiveTeachingStage.helpers.drawMiniChart;
    if (!helper) return;
    Array.prototype.forEach.call(el.steps.querySelectorAll('[data-step-chart]'), function (canvas) {
      var step = steps[Number(canvas.dataset.stepChart || 0)];
      if (step && step.chart) helper(canvas, step.chart);
    });
  }

  function renderModelStrip() {
    if (!state.models || !el.modelStrip) return;
    var ids = Object.keys(state.models.models || {});
    el.modelStrip.innerHTML = ids.map(function (id) {
      var model = state.models.models[id];
      return '<article class="model-card"><strong>' + esc(model.name || id) + '</strong>' +
        '<span>' + esc(model.task || '') + ' · ' + esc(model.cached ? '已缓存' : '待下载') + '</span>' +
        '<p>' + esc(model.description || '') + '</p><code>' + esc(model.download_command || '') + '</code></article>';
    }).join('');
  }

  function updateInspectorForTask(task) {
    var guide = TASK_GUIDE[task] || TASK_GUIDE.detection;
    el.inspectTitle.textContent = guide.title;
    el.inspectText.textContent = guide.text;
    if (window.renderLatex) window.renderLatex(el.formula, guide.formula, { display: true });
    else el.formula.textContent = guide.formula;
    el.inspectData.innerHTML = '<dt>当前任务</dt><dd>' + esc(TASK_TEXT[task] || task) + '</dd><dt>解决问题</dt><dd>' + esc(guide.output) + '</dd><dt>来源</dt><dd>后端真实推理/计算输出</dd>';
  }

  function updateInspectorForObject(obj) {
    if (!obj) return;
    el.inspectTitle.textContent = obj.title || '对象详情';
    el.inspectText.textContent = (obj.data && obj.data.focus_note)
      ? obj.data.focus_note
      : '该对象来自后端返回的结构化输出。前端只负责选择和解释，不会生成假的检测框或 mask。';
    if (window.renderLatex) window.renderLatex(el.formula, 'object = backend_output', { display: true });
    var data = obj.data || {};
    var keys = Object.keys(data).filter(function (key) { return !/image|base64|mask/i.test(key); }).slice(0, 8);
    el.inspectData.innerHTML = keys.map(function (key) {
      return '<dt>' + esc(key) + '</dt><dd>' + esc(formatValue(data[key])) + '</dd>';
    }).join('') || '<dt>数据</dt><dd>暂无结构化字段</dd>';
  }

  function getOutput(task, key) {
    var outputs = (state.result && state.result.outputs) || {};
    return ((outputs[task] || {})[key]) || [];
  }

  function extractStepData(stepId, key) {
    var steps = (state.result && state.result.steps) || [];
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].id === stepId && steps[i].data && Array.isArray(steps[i].data[key])) return steps[i].data[key];
    }
    return [];
  }

  function findStepImage(ids) {
    var steps = (state.result && state.result.steps) || [];
    for (var i = 0; i < ids.length; i += 1) {
      for (var j = 0; j < steps.length; j += 1) {
        if (steps[j].id === ids[i] && steps[j].image_base64) return steps[j].image_base64;
      }
    }
    return '';
  }

  function setBusy(flag) {
    el.loading.hidden = !flag;
    el.runBtn.disabled = flag;
    el.sampleBtn.disabled = flag;
    el.uploadBtn.disabled = flag;
  }

  function showError(msg) {
    el.error.hidden = false;
    el.error.textContent = String(msg || '未知错误');
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function value01(input) {
    return (Number(input.value || 0) / 100).toFixed(2);
  }

  function formatNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n.toFixed(3) : '-';
  }

  function formatBox(box) {
    return Array.isArray(box) ? '[' + box.map(function (v) { return Math.round(Number(v)); }).join(', ') + ']' : '-';
  }

  function formatValue(value) {
    var mapped = displayValue(value);
    if (mapped !== null) return mapped;
    if (Array.isArray(value)) return value.length > 8 ? 'len=' + value.length + ' ' + JSON.stringify(value.slice(0, 4)) : JSON.stringify(value);
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
      torchvision: 'torchvision 真实推理',
      'NumPy/PIL': 'NumPy/Pillow 本地计算',
      'NumPy/Pillow': 'NumPy/Pillow 本地计算',
      local_edge_objectness_detector: '本地边缘目标性检测器',
      local_color_spatial_segmentation: '本地颜色-空间语义分割',
      local_proposal_mask_segmenter: '本地候选框实例分割'
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
