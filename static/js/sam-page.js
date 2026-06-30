(function () {
  'use strict';

  var MAX_SIDE = 768;
  var COLORS = [
    [0, 200, 120],
    [59, 130, 246],
    [168, 85, 247],
    [245, 158, 11]
  ];
  var FRAME_STEP_MAP = {
    prompt: 'prompt_overlay',
    candidates: 'candidate_masks',
    selected: 'selected_mask'
  };

  var state = {
    mode: 'positive',
    file: null,
    fileName: '',
    previewUrl: '',
    imageWidth: 0,
    imageHeight: 0,
    points: [],
    labels: [],
    box: null,
    draftBox: null,
    dragging: false,
    dragStart: null,
    result: null,
    frames: [],
    stepsById: {},
    selectedCandidate: 0,
    playing: false,
    playTimer: null,
    stageView: 'interactive'
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    fileInput: $('fileInput'),
    chooseBtn: $('chooseBtn'),
    sampleBtn: $('sampleBtn'),
    fileName: $('fileName'),
    undoBtn: $('undoBtn'),
    clearBtn: $('clearBtn'),
    runBtn: $('runBtn'),
    opacity: $('opacitySlider'),
    opacityValue: $('opacityValue'),
    stage: $('samStage'),
    image: $('stageImage'),
    canvas: $('promptCanvas'),
    stageEmpty: $('stageEmpty'),
    status: $('stageStatus'),
    playBtn: $('playBtn'),
    frameSlider: $('frameSlider'),
    frameName: $('frameName'),
    explainTitle: $('explainTitle'),
    explainText: $('explainText'),
    formulaBox: $('formulaBox'),
    dataPanel: $('dataPanel'),
    candidateGrid: $('candidateGrid'),
    loading: $('loading'),
    error: $('errorBox')
  };
  var ctx = el.canvas.getContext('2d');

  init();

  function init() {
    bindControls();
    bindStage();
    loadSample();
    updatePromptStatus();
  }

  function bindControls() {
    el.chooseBtn.addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', function () {
      var file = el.fileInput.files && el.fileInput.files[0];
      if (file) setSourceFromFile(file);
    });
    el.sampleBtn.addEventListener('click', loadSample);
    el.runBtn.addEventListener('click', runSam);
    el.undoBtn.addEventListener('click', undoPrompt);
    el.clearBtn.addEventListener('click', clearPrompt);
    el.opacity.addEventListener('input', function () {
      el.opacityValue.textContent = el.opacity.value + '%';
      if (state.result) showInteractiveImage();
    });
    el.playBtn.addEventListener('click', togglePlayback);
    el.frameSlider.addEventListener('input', function () {
      stopPlayback();
      showFrame(Number(el.frameSlider.value));
    });
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (button) {
      button.addEventListener('click', function () {
        setMode(button.dataset.mode);
        showInteractiveImage();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rail-step'), function (button) {
      button.addEventListener('click', function () {
        stopPlayback();
        showFrame(Number(button.dataset.frame || 0));
      });
    });
    window.addEventListener('resize', syncCanvasToImage);
    el.image.addEventListener('load', syncCanvasToImage);
  }

  function bindStage() {
    el.canvas.addEventListener('pointerdown', function (event) {
      if (!state.imageWidth || !state.imageHeight) return;
      if (state.stageView !== 'interactive') {
        showInteractiveImage();
        return;
      }
      var point = eventToImagePoint(event);
      if (!point) return;
      if (state.mode === 'box') {
        state.dragging = true;
        state.dragStart = point;
        state.draftBox = [point.x, point.y, point.x, point.y];
        el.canvas.setPointerCapture(event.pointerId);
      } else {
        state.points.push([point.x, point.y]);
        state.labels.push(state.mode === 'negative' ? 0 : 1);
        markPromptChanged();
      }
      drawPrompts();
    });
    el.canvas.addEventListener('pointermove', function (event) {
      if (!state.dragging || !state.dragStart) return;
      var point = eventToImagePoint(event);
      if (!point) return;
      state.draftBox = [state.dragStart.x, state.dragStart.y, point.x, point.y];
      drawPrompts();
    });
    el.canvas.addEventListener('pointerup', function (event) {
      if (!state.dragging) return;
      state.dragging = false;
      var point = eventToImagePoint(event);
      if (point && state.dragStart) {
        var box = normalizeBox([state.dragStart.x, state.dragStart.y, point.x, point.y]);
        if (box && Math.abs(box[2] - box[0]) > 4 && Math.abs(box[3] - box[1]) > 4) {
          state.box = box;
          markPromptChanged();
        }
      }
      state.dragStart = null;
      state.draftBox = null;
      drawPrompts();
    });
    el.canvas.addEventListener('pointercancel', function () {
      state.dragging = false;
      state.dragStart = null;
      state.draftBox = null;
      drawPrompts();
    });
  }

  function setMode(mode) {
    state.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (button) {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
    var text = mode === 'positive'
      ? '正点模式：点击目标内部。'
      : mode === 'negative'
        ? '负点模式：点击不想要的背景或相邻物体。'
        : '框选模式：按住并拖出目标的大致范围。';
    el.status.textContent = text;
  }

  function loadSample() {
    clearError();
    fetch('/static/images/demo-street.jpg')
      .then(function (res) {
        if (!res.ok) throw new Error('示例图读取失败');
        return res.blob();
      })
      .then(function (blob) {
        return setSourceFromFile(new File([blob], 'demo-street.jpg', { type: blob.type || 'image/jpeg' }));
      })
      .catch(function (err) {
        showError('无法加载内置示例图：' + (err.message || err));
      });
  }

  function setSourceFromFile(file) {
    clearError();
    return prepareImageFile(file)
      .then(function (prepared) {
        state.file = prepared.file;
        state.fileName = file.name || 'image.png';
        state.previewUrl = prepared.dataUrl;
        state.imageWidth = prepared.width;
        state.imageHeight = prepared.height;
        state.points = [];
        state.labels = [];
        state.box = null;
        state.result = null;
        state.frames = [];
        state.stepsById = {};
        state.selectedCandidate = 0;
        state.stageView = 'interactive';
        el.fileName.textContent = state.fileName + ' · 已统一缩放为 ' + prepared.width + '×' + prepared.height;
        el.image.src = state.previewUrl;
        el.stageEmpty.classList.add('is-hidden');
        renderCandidates([]);
        resetTimeline();
        updatePromptStatus();
        updateExplainer({
          name: '选择提示',
          explanation: '在图上点击正点、负点，或拖出框选。运行后端后，真实 SAM 会根据这些提示重新计算候选 mask。',
          formula: 'P = {(x_i,y_i,l_i)} union B',
          data: { image_size: prepared.width + '×' + prepared.height }
        });
      })
      .catch(function (err) {
        showError('图片准备失败：' + (err.message || err));
      });
  }

  function prepareImageFile(file) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        var width = Math.max(1, Math.round(image.naturalWidth * scale));
        var height = Math.max(1, Math.round(image.naturalHeight * scale));
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var canvasCtx = canvas.getContext('2d');
        canvasCtx.drawImage(image, 0, 0, width, height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error('无法生成上传图像'));
            return;
          }
          var out = new File([blob], sanitizeFileName(file.name || 'sam-input.png'), { type: 'image/png' });
          resolve({ file: out, dataUrl: canvas.toDataURL('image/png'), width: width, height: height });
        }, 'image/png');
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('浏览器无法读取这张图片'));
      };
      image.src = objectUrl;
    });
  }

  function sanitizeFileName(name) {
    return String(name).replace(/\.[^.]*$/, '') + '-sam.png';
  }

  function runSam() {
    if (!state.file) {
      showError('请先选择图片或使用内置示例。');
      return;
    }
    clearError();
    stopPlayback();
    setBusy(true);
    var form = new FormData();
    form.append('file', state.file);
    form.append('points', JSON.stringify(state.points));
    form.append('labels', JSON.stringify(state.labels));
    if (state.box) form.append('box', JSON.stringify(state.box));
    form.append('selected_mask', String(state.selectedCandidate || 0));
    form.append('multimask', '1');

    fetch('/api/demo/sam', { method: 'POST', body: form })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          json._status = res.status;
          return json;
        });
      })
      .then(function (json) {
        setBusy(false);
        state.result = json;
        state.frames = Array.isArray(json.frames) ? json.frames : [];
        state.stepsById = indexSteps(json.steps || []);
        state.selectedCandidate = Number((json.outputs || {}).selected_idx || 0);
        renderTimeline();
        renderCandidates(((json.outputs || {}).candidate_masks) || []);
        if (json.error) {
          showError(json.error);
          if (json.steps && json.steps.length) showStep(json.steps[json.steps.length - 1]);
          return;
        }
        showInteractiveImage();
        var selectedStep = state.stepsById.selected_mask || (json.steps || [])[0];
        updateExplainer(selectedStep || {});
      })
      .catch(function (err) {
        setBusy(false);
        showError('请求失败：' + (err.message || err));
      });
  }

  function indexSteps(steps) {
    var out = {};
    steps.forEach(function (step) {
      if (step && step.id) out[step.id] = step;
    });
    return out;
  }

  function showInteractiveImage() {
    state.stageView = 'interactive';
    el.canvas.style.pointerEvents = 'auto';
    if (!state.result || !(state.result.outputs || {}).candidate_masks) {
      if (state.previewUrl && el.image.src !== state.previewUrl) el.image.src = state.previewUrl;
      syncCanvasToImage();
      return;
    }
    renderCandidateStage(state.selectedCandidate);
  }

  function renderCandidateStage(index) {
    var candidates = ((state.result || {}).outputs || {}).candidate_masks || [];
    var candidate = candidates[index];
    if (!candidate) {
      if (state.previewUrl) el.image.src = state.previewUrl;
      syncCanvasToImage();
      return;
    }
    state.selectedCandidate = index;
    composeMask(candidate.mask_base64, COLORS[index % COLORS.length], Number(el.opacity.value) / 100)
      .then(function (dataUrl) {
        if (state.stageView === 'interactive' && state.selectedCandidate === index) {
          el.image.src = dataUrl;
          syncCanvasToImage();
        }
      })
      .catch(function () {
        el.image.src = 'data:image/png;base64,' + candidate.overlay_base64;
        syncCanvasToImage();
      });
    renderCandidates(candidates);
    updateCandidateData(candidate);
  }

  function composeMask(maskBase64, color, opacity) {
    return Promise.all([
      loadImage(state.previewUrl),
      loadImage('data:image/png;base64,' + maskBase64)
    ]).then(function (images) {
      var base = images[0];
      var mask = images[1];
      var canvas = document.createElement('canvas');
      canvas.width = base.naturalWidth;
      canvas.height = base.naturalHeight;
      var c = canvas.getContext('2d');
      c.drawImage(base, 0, 0);
      var baseData = c.getImageData(0, 0, canvas.width, canvas.height);
      var maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      var maskCtx = maskCanvas.getContext('2d');
      maskCtx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      var maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i = 0; i < baseData.data.length; i += 4) {
        var m = maskData[i] / 255;
        if (m <= 0.5) continue;
        baseData.data[i] = Math.round(baseData.data[i] * (1 - opacity) + color[0] * opacity);
        baseData.data[i + 1] = Math.round(baseData.data[i + 1] * (1 - opacity) + color[1] * opacity);
        baseData.data[i + 2] = Math.round(baseData.data[i + 2] * (1 - opacity) + color[2] * opacity);
      }
      c.putImageData(baseData, 0, 0);
      return canvas.toDataURL('image/png');
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = reject;
      image.src = src;
    });
  }

  function showFrame(index) {
    if (!state.frames.length) return;
    index = Math.max(0, Math.min(state.frames.length - 1, index));
    state.stageView = 'frame';
    el.canvas.style.pointerEvents = 'none';
    var frame = state.frames[index];
    el.image.src = 'data:image/png;base64,' + frame.image_base64;
    el.frameSlider.value = String(index);
    el.frameName.textContent = frame.name || ('步骤 ' + (index + 1));
    setRailActive(index);
    var stepId = FRAME_STEP_MAP[frame.id] || frame.id;
    updateExplainer(state.stepsById[stepId] || frame);
  }

  function showStep(step) {
    if (!step) return;
    state.stageView = 'frame';
    el.canvas.style.pointerEvents = 'none';
    if (step.image_base64) {
      el.image.src = 'data:image/png;base64,' + step.image_base64;
    }
    updateExplainer(step);
  }

  function renderTimeline() {
    var count = Math.max(1, state.frames.length);
    el.frameSlider.max = String(Math.max(0, count - 1));
    el.frameSlider.value = String(Math.max(0, count - 1));
    if (state.frames.length) {
      el.frameName.textContent = state.frames[state.frames.length - 1].name || '最终结果';
      setRailActive(state.frames.length - 1);
    }
  }

  function resetTimeline() {
    state.frames = [];
    el.frameSlider.max = '5';
    el.frameSlider.value = '0';
    el.frameName.textContent = '等待后端步骤';
    setRailActive(0);
  }

  function togglePlayback() {
    if (!state.frames.length) return;
    if (state.playing) {
      stopPlayback();
      return;
    }
    state.playing = true;
    el.playBtn.textContent = '暂停';
    var index = 0;
    showFrame(index);
    state.playTimer = setInterval(function () {
      index += 1;
      if (index >= state.frames.length) {
        stopPlayback();
        showInteractiveImage();
        return;
      }
      showFrame(index);
    }, 1150);
  }

  function stopPlayback() {
    state.playing = false;
    el.playBtn.textContent = '播放过程';
    if (state.playTimer) clearInterval(state.playTimer);
    state.playTimer = null;
  }

  function setRailActive(index) {
    Array.prototype.forEach.call(document.querySelectorAll('.rail-step'), function (button) {
      button.classList.toggle('active', Number(button.dataset.frame || 0) === index);
    });
  }

  function renderCandidates(candidates) {
    if (!candidates || !candidates.length) {
      el.candidateGrid.innerHTML = '<div class="empty-card">运行后会显示 1 到 3 个候选 mask 和 IoU 质量分。</div>';
      return;
    }
    el.candidateGrid.innerHTML = candidates.map(function (candidate, index) {
      var active = index === state.selectedCandidate ? ' active' : '';
      return '<button class="candidate-card' + active + '" type="button" data-index="' + index + '">' +
        '<img src="data:image/png;base64,' + esc(candidate.overlay_base64 || '') + '" alt="候选 mask ' + (index + 1) + '">' +
        '<div><strong>候选 ' + (index + 1) + ' · IoU ' + esc(candidate.score) + '</strong>' +
        '<small>面积 ' + esc(candidate.area_pixels) + ' 像素，约占 ' + esc(Math.round((candidate.area_ratio || 0) * 10000) / 100) + '%</small></div></button>';
    }).join('');
    Array.prototype.forEach.call(el.candidateGrid.querySelectorAll('.candidate-card'), function (button) {
      button.addEventListener('click', function () {
        stopPlayback();
        state.stageView = 'interactive';
        renderCandidateStage(Number(button.dataset.index || 0));
        updateExplainer(state.stepsById.selected_mask || {});
      });
    });
  }

  function updateCandidateData(candidate) {
    if (!candidate || !state.stepsById.selected_mask) return;
    var step = Object.assign({}, state.stepsById.selected_mask, {
      data: Object.assign({}, state.stepsById.selected_mask.data || {}, {
        selected_idx: candidate.index,
        selected_score: candidate.score,
        selected_area_pixels: candidate.area_pixels
      })
    });
    updateExplainer(step);
  }

  function undoPrompt() {
    if (state.mode === 'box' && state.box) {
      state.box = null;
    } else if (state.points.length) {
      state.points.pop();
      state.labels.pop();
    } else if (state.box) {
      state.box = null;
    }
    markPromptChanged();
    drawPrompts();
  }

  function clearPrompt() {
    state.points = [];
    state.labels = [];
    state.box = null;
    state.draftBox = null;
    markPromptChanged();
    drawPrompts();
  }

  function markPromptChanged() {
    if (state.result) {
      state.result = null;
      state.frames = [];
      state.stepsById = {};
      state.selectedCandidate = 0;
      renderCandidates([]);
      resetTimeline();
      if (state.previewUrl) el.image.src = state.previewUrl;
      updateExplainer({
        name: '提示已改变',
        explanation: '你改变了点或框。点击“运行真实 SAM”后，后端会用新的提示重新计算候选 mask。',
        formula: 'M_i = SAM(I, P_new)',
        data: currentPromptData()
      });
    }
    state.stageView = 'interactive';
    el.canvas.style.pointerEvents = 'auto';
    updatePromptStatus();
  }

  function updatePromptStatus() {
    var positives = state.labels.filter(function (label) { return label === 1; }).length;
    var negatives = state.labels.filter(function (label) { return label === 0; }).length;
    var parts = [];
    if (positives) parts.push(positives + ' 个正点');
    if (negatives) parts.push(negatives + ' 个负点');
    if (state.box) parts.push('1 个框');
    el.status.textContent = parts.length
      ? '当前提示：' + parts.join('，') + '。运行后端查看真实变化。'
      : '点击图像添加正点，或切换模式拖出框选。';
  }

  function currentPromptData() {
    return {
      points: state.points.map(function (point, index) {
        return { x: point[0], y: point[1], label: state.labels[index] };
      }),
      box: state.box,
      mode: state.mode
    };
  }

  function syncCanvasToImage() {
    if (!state.imageWidth || !state.imageHeight || !el.image.complete) return;
    var imageRect = el.image.getBoundingClientRect();
    var stageRect = el.stage.getBoundingClientRect();
    if (!imageRect.width || !imageRect.height) return;
    el.canvas.width = Math.max(1, Math.round(imageRect.width));
    el.canvas.height = Math.max(1, Math.round(imageRect.height));
    el.canvas.style.width = imageRect.width + 'px';
    el.canvas.style.height = imageRect.height + 'px';
    el.canvas.style.left = (imageRect.left - stageRect.left) + 'px';
    el.canvas.style.top = (imageRect.top - stageRect.top) + 'px';
    drawPrompts();
  }

  function drawPrompts() {
    ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    if (!state.imageWidth || !state.imageHeight || !el.canvas.width || !el.canvas.height) return;
    var sx = el.canvas.width / state.imageWidth;
    var sy = el.canvas.height / state.imageHeight;
    drawBox(state.box, sx, sy, 'rgba(59, 130, 246, 0.95)', 'rgba(59, 130, 246, 0.14)');
    drawBox(state.draftBox && normalizeBox(state.draftBox), sx, sy, 'rgba(102, 242, 194, 0.95)', 'rgba(102, 242, 194, 0.12)');
    state.points.forEach(function (point, index) {
      var label = state.labels[index] || 0;
      var x = point[0] * sx;
      var y = point[1] * sy;
      var r = 9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = label === 1 ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label === 1 ? '+' : '-', x, y + 0.5);
    });
  }

  function drawBox(box, sx, sy, stroke, fill) {
    if (!box) return;
    var x = box[0] * sx;
    var y = box[1] * sy;
    var w = (box[2] - box[0]) * sx;
    var h = (box[3] - box[1]) * sy;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  function eventToImagePoint(event) {
    var rect = el.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var x = Math.round((event.clientX - rect.left) / rect.width * state.imageWidth);
    var y = Math.round((event.clientY - rect.top) / rect.height * state.imageHeight);
    return {
      x: clamp(x, 0, state.imageWidth - 1),
      y: clamp(y, 0, state.imageHeight - 1)
    };
  }

  function normalizeBox(box) {
    if (!box) return null;
    var x1 = clamp(Math.round(Math.min(box[0], box[2])), 0, state.imageWidth - 1);
    var y1 = clamp(Math.round(Math.min(box[1], box[3])), 0, state.imageHeight - 1);
    var x2 = clamp(Math.round(Math.max(box[0], box[2])), 0, state.imageWidth - 1);
    var y2 = clamp(Math.round(Math.max(box[1], box[3])), 0, state.imageHeight - 1);
    return [x1, y1, x2, y2];
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function updateExplainer(step) {
    el.explainTitle.textContent = step.name || step.id || '当前步骤';
    el.explainText.textContent = step.explanation || '这一步等待真实后端数据。';
    setFormula(step.formula || 'M = MaskDecoder(ImageEncoder(I), PromptEncoder(P))');
    renderData(step.data || currentPromptData());
  }

  function setFormula(value) {
    if (!el.formulaBox) return;
    if (window.renderLatex) window.renderLatex(el.formulaBox, value, { display: true });
    else el.formulaBox.textContent = value;
  }

  function renderData(data) {
    var keys = Object.keys(data || {}).slice(0, 8);
    if (!keys.length) {
      el.dataPanel.innerHTML = '<dt>状态</dt><dd>暂无结构化数据</dd>';
      return;
    }
    el.dataPanel.innerHTML = keys.map(function (key) {
      return '<dt>' + esc(key) + '</dt><dd>' + esc(formatValue(data[key])) + '</dd>';
    }).join('');
  }

  function formatValue(value) {
    if (Array.isArray(value)) {
      if (value.length > 8) return 'len=' + value.length + ' · ' + JSON.stringify(value.slice(0, 4));
      return JSON.stringify(value);
    }
    if (value && typeof value === 'object') return JSON.stringify(value).slice(0, 180);
    return value == null ? '' : String(value);
  }

  function setBusy(flag) {
    el.loading.hidden = !flag;
    el.runBtn.disabled = flag;
    el.sampleBtn.disabled = flag;
    el.chooseBtn.disabled = flag;
  }

  function showError(message) {
    el.error.hidden = false;
    el.error.textContent = String(message || '未知错误');
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function esc(value) {
    if (window.esc) return window.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
}());
