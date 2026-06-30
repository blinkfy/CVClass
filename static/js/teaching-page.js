(function () {
  'use strict';

  var state = {
    id: paramId(),
    cfg: null,
    file: null,
    stage: null,
    dynamicParams: {}
  };

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(value) {
    if (window.esc) return window.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function paramId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('id') || window.ALGORITHM_ID || 'grayscale';
  }

  function stepImage(step) {
    if (!step) return '';
    if (step.image && /^data:|^\//.test(step.image)) return step.image;
    if (step.image_base64) return 'data:image/png;base64,' + step.image_base64;
    if (step.image_b64) return 'data:image/png;base64,' + step.image_b64;
    return step.image || '';
  }

  function renderFormula(node, formula) {
    if (!node) return;
    if (window.renderLatex) window.renderLatex(node, formula || '', { display: true });
    else node.textContent = formula || '';
  }

  function renderStatic(cfg) {
    document.title = (cfg.title || state.id) + ' - Cvtoolkits';
    setText('[data-title]', cfg.title || state.id);
    setText('[data-english]', cfg.english || '');
    setText('[data-phase]', cfg.phase || '');
    setText('[data-status]', cfg.status || '');
    setText('[data-difficulty]', cfg.difficulty || '');
    setText('[data-tagline]', cfg.tagline || '');
    renderProblemStatement(cfg);
    renderFormula(qs('[data-formula]'), cfg.formula || '');

    var core = qs('#coreGrid');
    core.innerHTML = (cfg.core || []).map(function (item) {
      return '<div class="teach-core-item"><strong>' + esc(item[0]) + '</strong><span>' + esc(item[1]) + '</span></div>';
    }).join('');

    qs('#principles').innerHTML = (cfg.principles || []).map(function (text) {
      return '<p>' + esc(text) + '</p>';
    }).join('');

    renderVisualStory(cfg);
    renderReferences(cfg);
    renderPipeline(cfg);
    renderControls(cfg);
  }

  function findProblemStatement(cfg) {
    if (!cfg) return '';
    if (cfg.problemStatement || cfg.problem_statement || cfg.problem) {
      return cfg.problemStatement || cfg.problem_statement || cfg.problem;
    }
    var core = cfg.core || [];
    for (var i = 0; i < core.length; i += 1) {
      var item = core[i];
      var label = Array.isArray(item) ? item[0] : (item.label || item.name || item.title || '');
      var text = Array.isArray(item) ? item[1] : (item.text || item.value || item.description || '');
      if (/核心问题|解决|问题|What|Problem/i.test(String(label))) return text;
    }
    return cfg.tagline || cfg.subtitle || '';
  }

  function renderProblemStatement(cfg) {
    var node = qs('#problemStatement');
    if (!node) return;
    var text = findProblemStatement(cfg);
    node.innerHTML = text ? '<b>解决的问题</b>' + esc(text) : '<b>解决的问题</b>用可视化方式说明这个算法在输入图像上要完成的具体任务。';
  }

  function setText(selector, value) {
    var node = qs(selector);
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function renderReferences(cfg) {
    var section = qs('#referenceSection');
    var root = qs('#references');
    var refs = cfg.references || [];
    if (!refs.length) {
      section.style.display = 'none';
      root.innerHTML = '';
      return;
    }
    section.style.display = '';
    root.innerHTML = refs.map(function (ref) {
      var title = ref.title || ref.name || '参考资料';
      var desc = ref.description || '';
      var url = ref.url || '';
      return '<article class="teach-ref"><strong>' + esc(title) + '</strong>' +
        (desc ? '<span>' + esc(desc) + '</span>' : '') +
        (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' : '') +
        '</article>';
    }).join('');
  }

  function renderPipeline(cfg) {
    qs('#pipeline').innerHTML = (cfg.pipeline || []).map(function (item, idx) {
      var name = Array.isArray(item) ? item[0] : item.name || item.title || ('步骤 ' + (idx + 1));
      var text = Array.isArray(item) ? item[1] : item.explanation || item.text || '';
      return '<article class="teach-stage" data-index="' + String(idx + 1).padStart(2, '0') + '">' +
        '<strong>' + esc(name) + '</strong><span>' + esc(text) + '</span></article>';
    }).join('');
  }

  function renderControls(cfg) {
    var root = qs('#controls');
    var controls = cfg.controls || [];
    root.innerHTML = controls.map(function (control) {
      var value = control.value == null ? '' : control.value;
      if (control.type === 'select') {
        return '<label class="teach-control"><span>' + esc(control.label || control.name) + '</span><select name="' + esc(control.name) + '">' +
          (control.options || []).map(function (opt) {
            var val = Array.isArray(opt) ? opt[0] : opt.value;
            var label = Array.isArray(opt) ? opt[1] : opt.label || opt.value;
            return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
          }).join('') + '</select><output>' + esc(value) + '</output></label>';
      }
      return '<label class="teach-control"><span>' + esc(control.label || control.name) + '</span><input name="' + esc(control.name) +
        '" type="' + esc(control.type || 'range') + '" min="' + esc(control.min || '') + '" max="' + esc(control.max || '') +
        '" step="' + esc(control.step || 1) + '" value="' + esc(value) + '"><output>' + esc(value) + '</output></label>';
    }).join('');
    root.style.display = controls.length ? 'grid' : 'none';
    qsa('input,select', root).forEach(function (input) {
      input.addEventListener('input', function () {
        var out = input.parentElement.querySelector('output');
        if (out) out.textContent = input.value;
      });
      input.addEventListener('change', function () {
        delete state.dynamicParams[input.name];
      });
    });
  }

  function renderVisualStory(cfg) {
    var section = qs('#visualStorySection');
    var root = qs('#visualStory');
    var story = cfg.visualStory || {};
    var cards = story.cards || [];
    if (!cards.length) {
      section.style.display = 'none';
      root.innerHTML = '';
      return;
    }
    section.style.display = '';
    qs('#visualStoryIntro').textContent = story.intro || '用图形先看懂像素和参数发生了什么。';
    root.innerHTML = cards.map(function (card) {
      return '<article class="teach-visual-card teach-visual-' + esc(card.type || 'bars') + '">' +
        '<div class="teach-visual-art">' + visualArt(card) + '</div>' +
        '<div class="teach-visual-copy"><strong>' + esc(card.title || '') + '</strong><p>' + esc(card.text || '') + '</p></div>' +
        '</article>';
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
    if (!parts.length && step.description) parts.push(['说明', step.description]);
    return parts.map(function (part) {
      return '<p class="teach-step-note"><b>' + esc(part[0]) + '</b>' + esc(part[1]) + '</p>';
    }).join('');
  }

  function visualArt(card) {
    if (card.type === 'gradientSet') {
      return '<div class="visual-gradient-set">' + (card.rows || []).map(function (row) {
        return '<div class="visual-gradient-row"><span>' + esc(row.label || '') + '</span><i style="background:' +
          esc(row.gradient || 'linear-gradient(90deg,#020617,#f8fafc)') + '"></i><b>' + esc(row.caption || '') + '</b></div>';
      }).join('') + '</div>';
    }
    if (card.type === 'mix') {
      var labels = card.labels || ['R', 'G', 'B'];
      return '<div class="visual-rgb-mix"><span class="rgb-lobe red">' + esc(labels[0]) +
        '</span><span class="rgb-lobe green">' + esc(labels[1]) +
        '</span><span class="rgb-lobe blue">' + esc(labels[2]) + '</span><strong>RGB</strong></div>';
    }
    if (card.type === 'window') {
      var values = card.values || [34, 36, 255, 38, 40, 41, 42, 43, 44];
      var sorted = values.slice().sort(function (a, b) { return a - b; });
      var median = sorted[Math.floor(sorted.length / 2)];
      return '<div class="visual-window"><div class="visual-sort">' + sorted.map(function (v) {
        return '<span class="' + (v === median ? 'is-median' : '') + '">' + esc(v) + '</span>';
      }).join('') + '</div><b>median = ' + esc(median) + '</b></div>';
    }
    var items = card.items || [
      { label: '输入', value: 35, caption: 'Input', color: '#3b82f6' },
      { label: '中间表示', value: 70, caption: 'Feature', color: '#22c55e' },
      { label: '输出', value: 90, caption: 'Output', color: '#f59e0b' }
    ];
    return '<div class="visual-bars">' + items.map(function (item) {
      var value = Math.max(0, Math.min(100, Number(item.value || 0)));
      return '<div class="visual-bar-row"><span>' + esc(item.label || '') + '</span>' +
        '<div class="visual-bar-track"><i style="width:' + value + '%;background:' + esc(item.color || '#66f2c2') + '"></i></div>' +
        '<b>' + esc(item.caption || value + '%') + '</b></div>';
    }).join('') + '</div>';
  }

  function renderMetrics(metrics) {
    var root = qs('#metrics');
    var cfg = state.cfg || {};
    var impl = cfg.implementation || {};
    var merged = Object.assign({}, metrics || {});
    if (impl.status) merged['实现方式'] = impl.status;
    if (impl.model) merged['模型/后端'] = impl.model;
    var keys = Object.keys(merged);
    root.innerHTML = keys.length ? keys.slice(0, 10).map(function (key) {
      return '<span class="teach-metric">' + esc(key) + '<strong>' + esc(formatValue(merged[key])) + '</strong></span>';
    }).join('') : '<span class="teach-metric">运行后显示指标</span>';
  }

  function renderSteps(rawSteps) {
    var root = qs('#results');
    var steps = rawSteps || [];
    if (!steps.length) {
      root.innerHTML = '<div class="teach-empty">运行算法后，这里会显示每一步的真实中间结果。</div>';
      return;
    }
    root.innerHTML = steps.map(function (step, index) {
      var image = stepImage(step);
      var img = image ? '<img src="' + esc(image) + '" alt="' + esc(step.name || step.id || 'step') + '">' : '<div class="teach-empty">无图像输出</div>';
      return '<button class="teach-step-card" type="button" data-index="' + index + '">' +
        '<div class="teach-step-image">' + img + '</div><div class="teach-step-body">' +
        '<strong>' + esc(step.name || step.id || '步骤') + '</strong>' +
        stepTeachingHtml(step) +
        (step.formula ? '<div class="teach-step-formula">' + esc(step.formula) + '</div>' : '') +
        '</div></button>';
    }).join('');
    qsa('.teach-step-card', root).forEach(function (card) {
      card.addEventListener('click', function () {
        if (state.stage) state.stage.showFrame(Number(card.dataset.index || 0));
      });
    });
    if (window.renderLatexIn) window.renderLatexIn(root);
  }

  function renderConceptSteps(cfg) {
    var steps = (cfg.conceptSteps || cfg.pipeline || []).map(function (item, idx) {
      if (Array.isArray(item)) return { id: 'concept_' + idx, name: item[0], explanation: item[1], formula: item[2] || '' };
      return item;
    });
    renderSteps(steps);
    if (state.stage) state.stage.render({ steps: steps, metrics: cfg.metrics || {}, implementation: cfg.implementation || {} });
    renderMetrics(cfg.metrics || { 展示类型: cfg.status || '教学讲解' });
  }

  function createDemoFile() {
    return new Promise(function (resolve) {
      var canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 144;
      var ctx = canvas.getContext('2d');
      var grad = ctx.createLinearGradient(0, 0, 192, 144);
      grad.addColorStop(0, '#eef2ff');
      grad.addColorStop(0.5, '#8dd7c6');
      grad.addColorStop(1, '#f7b267');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 192, 144);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(24, 24, 54, 54);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(36, 36, 30, 30);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(118, 20);
      ctx.lineTo(166, 70);
      ctx.lineTo(106, 118);
      ctx.stroke();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(118, 64, 24, 0, Math.PI * 2);
      ctx.stroke();
      canvas.toBlob(function (blob) {
        resolve(new File([blob], 'teaching-demo.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  function collectFormData(file) {
    var fd = new FormData();
    if (file) fd.set('file', file, file.name || 'upload.png');
    qsa('#controls input, #controls select').forEach(function (input) {
      if (Object.prototype.hasOwnProperty.call(state.dynamicParams, input.name)) return;
      fd.set(input.name, input.value);
    });
    Object.keys(state.dynamicParams).forEach(function (key) {
      fd.set(key, state.dynamicParams[key]);
    });
    return fd;
  }

  function run(cfg, file) {
    var status = qs('#status');
    var button = qs('#runButton');
    if (!cfg.endpoint) {
      renderConceptSteps(cfg);
      status.textContent = '当前为原理讲解页，尚未接入后端接口。';
      return;
    }
    status.textContent = (cfg.implementation || {}).realModel ? '正在运行真实预训练模型...' : '正在运行后端算法...';
    button.disabled = true;
    fetch(cfg.endpoint, { method: 'POST', body: collectFormData(file) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok && json.error) throw new Error(json.error);
          return json;
        });
      })
      .then(function (json) {
        if (json.implementation) qs('[data-status]').textContent = json.implementation.status || cfg.status || '';
        if (state.stage) state.stage.render(json);
        renderSteps(json.steps || []);
        renderMetrics(json.metrics || {});
        status.textContent = '已生成真实后端结果。';
        if (window.renderLatexIn) window.renderLatexIn(document);
      })
      .catch(function (err) {
        status.textContent = '运行失败：' + (err.message || err);
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  function syncBackendStatus() {
    fetch('/api/modules')
      .then(function (res) { return res.json(); })
      .then(function (payload) {
        var impl = null;
        (payload.phases || []).forEach(function (phase) {
          (phase.modules || []).forEach(function (mod) {
            if (mod.id === state.id && mod.implementation) impl = mod.implementation;
          });
        });
        if (!impl) return;
        qs('[data-status]').textContent = impl.status || qs('[data-status]').textContent;
        if (impl.category === 'pretrained_model') qs('#status').textContent = '真实预训练模型：点击运行加载模型推理。';
        else if (impl.category === 'numpy_algorithm') qs('#status').textContent = '真实 NumPy 算法：点击运行查看中间过程。';
        else if (impl.category === 'local_mechanism') qs('#status').textContent = '本地机制实现：点击运行查看结构化过程。';
      })
      .catch(function () {});
  }

  function bindUploadAndActions(cfg) {
    var upload = qs('#upload');
    var input = qs('#fileInput');
    var filename = qs('#filename');
    var runButton = qs('#runButton');
    var demoButton = qs('#demoButton');

    function setFile(file) {
      state.file = file;
      filename.textContent = file ? file.name : '未选择文件';
      if (file) qs('#status').textContent = '已选择图片，点击运行开始处理。';
      runButton.disabled = false;
    }

    upload.addEventListener('click', function (event) {
      if (event.target !== input) {
        event.preventDefault();
        input.click();
      }
    });
    upload.addEventListener('dragover', function (event) {
      event.preventDefault();
      upload.classList.add('dragging');
    });
    upload.addEventListener('dragleave', function () { upload.classList.remove('dragging'); });
    upload.addEventListener('drop', function (event) {
      event.preventDefault();
      upload.classList.remove('dragging');
      if (event.dataTransfer.files && event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () {
      setFile(input.files && input.files[0] ? input.files[0] : null);
    });
    input.addEventListener('click', function () { input.value = ''; });
    runButton.addEventListener('click', function () { run(cfg, state.file); });
    demoButton.addEventListener('click', function () {
      createDemoFile().then(function (file) {
        setFile(file);
        run(cfg, file);
      });
    });
  }

  function init() {
    var cfg = window.AlgorithmContent && window.AlgorithmContent[state.id];
    if (!cfg) {
      document.body.innerHTML = '<main class="teach-page"><div class="teach-empty">未找到算法内容配置：' + esc(state.id) + '</div></main>';
      return;
    }
    state.cfg = cfg;
    window.__TEACHING_CFG__ = cfg;
    renderStatic(cfg);
    state.stage = window.InteractiveTeachingStage && window.InteractiveTeachingStage.mount(qs('#interactiveStageRoot'), {
      frameDelay: 1000,
      onParamChange: function (name, value) {
        state.dynamicParams[name] = value;
        run(cfg, state.file);
      }
    });
    if (cfg.endpoint) {
      renderSteps([]);
      renderMetrics({});
      qs('#runButton').disabled = false;
      qs('#status').textContent = '点击运行算法，或先上传图片。未上传时后端会使用内置示例。';
    } else {
      renderConceptSteps(cfg);
      qs('#runButton').disabled = false;
      qs('#runButton').textContent = '查看流程';
      qs('#demoButton').style.display = 'none';
    }
    bindUploadAndActions(cfg);
    syncBackendStatus();
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.length > 8 ? 'len=' + value.length + ' ' + JSON.stringify(value.slice(0, 4)) : JSON.stringify(value);
    if (value && typeof value === 'object') return JSON.stringify(value).slice(0, 160);
    if (typeof value === 'number') return Math.round(value * 10000) / 10000;
    return value == null ? '' : String(value);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
