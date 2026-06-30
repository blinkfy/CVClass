(function () {
  'use strict';

  var COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#14b8a6', '#ec4899', '#eab308', '#38bdf8'];

  function esc(value) {
    if (window.esc) return window.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function dataUrl(value) {
    if (!value) return '';
    return /^data:/i.test(value) ? value : 'data:image/png;base64,' + value;
  }

  function formatValue(value) {
    var mapped = displayValue(value);
    if (mapped !== null) return mapped;
    if (value == null) return '';
    if (typeof value === 'number') return Math.round(value * 10000) / 10000;
    if (Array.isArray(value)) {
      if (value.length > 8) return 'len=' + value.length + ' ' + JSON.stringify(value.slice(0, 4));
      return JSON.stringify(value);
    }
    if (typeof value === 'object') {
      var keys = Object.keys(value);
      if (keys.length > 6) return keys.slice(0, 6).join(', ') + ' ...';
      return JSON.stringify(value).slice(0, 180);
    }
    return String(value);
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

  function normalizeFrames(payload) {
    var frames = Array.isArray(payload && payload.frames) ? payload.frames : [];
    if (frames.length) return frames;
    return ((payload && payload.steps) || []).map(function (step, index) {
      return {
        id: step.id || 'step_' + index,
        name: step.name || step.id || '步骤 ' + (index + 1),
        image_base64: step.image_base64 || step.image,
        explanation: step.explanation || '',
        problem_statement: step.problem_statement || '',
        plain_explanation: step.plain_explanation || '',
        watch_for: step.watch_for || '',
        teaching_summary: step.teaching_summary || '',
        formula: step.formula || '',
        data: step.data || {},
        chart: step.chart || null,
        diagram: step.diagram || step.architecture || null,
        visual_kind: step.visual_kind || (step.diagram || step.architecture ? 'architecture' : (step.chart ? 'chart' : (step.overlays ? 'overlay_image' : 'image'))),
        overlay_scope: step.overlay_scope || 'frame',
        overlays: step.overlays || null
      };
    });
  }

  function teachingHtml(frame, payload) {
    frame = frame || {};
    payload = payload || {};
    var parts = [];
    var problem = frame.problem_statement || payload.problem_statement || '';
    var plain = frame.plain_explanation || frame.teaching_summary || '';
    var watch = frame.watch_for || '';
    var detail = frame.explanation || '';
    if (problem) parts.push(['解决的问题', problem]);
    if (plain) parts.push(['这一步在做什么', plain]);
    if (watch) parts.push(['观察重点', watch]);
    if (detail && detail !== plain && detail !== problem && (!problem || detail.indexOf(problem) !== 0)) {
      parts.push(['严谨说明', detail]);
    }
    if (!parts.length) parts.push(['说明', '该步骤来自后端真实计算。']);
    return parts.map(function (item) {
      return '<span class="it-text-block"><b>' + esc(item[0]) + '</b>' + esc(item[1]) + '</span>';
    }).join('');
  }

  function extractBoxes(source) {
    var boxes = [];
    function add(item, sourceName) {
      if (!item || typeof item !== 'object') return;
      var box = item.box || item.bbox;
      if (Array.isArray(box) && box.length >= 4) {
        boxes.push({
          box: box.slice(0, 4).map(Number),
          label: item.label || item.title || item.class || item.name || 'object',
          score: item.score,
          source: sourceName || item.source || '',
          data: item
        });
      }
    }
    function walk(value, sourceName, depth) {
      if (!value || depth > 5 || boxes.length > 100) return;
      if (Array.isArray(value)) {
        value.forEach(function (item) { walk(item, sourceName, depth + 1); });
        return;
      }
      if (typeof value !== 'object') return;
      add(value, sourceName);
      Object.keys(value).forEach(function (key) {
        if (/image|base64|mask/i.test(key)) return;
        walk(value[key], key, depth + 1);
      });
    }
    walk(source, '', 0);
    return boxes;
  }

  function extractPoints(source) {
    var points = [];
    function walk(value, depth) {
      if (!value || depth > 5 || points.length > 160) return;
      if (Array.isArray(value)) {
        if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
          points.push({ x: value[0], y: value[1], label: '' });
          return;
        }
        value.forEach(function (item) { walk(item, depth + 1); });
        return;
      }
      if (typeof value !== 'object') return;
      if (typeof value.x === 'number' && typeof value.y === 'number') {
        points.push({ x: value.x, y: value.y, label: value.label || '' });
      }
      Object.keys(value).forEach(function (key) {
        if (/image|base64|mask/i.test(key)) return;
        walk(value[key], depth + 1);
      });
    }
    walk(source, 0);
    return points;
  }

  function extractMasks(source) {
    var masks = [];
    function add(item, sourceName) {
      if (!item || typeof item !== 'object') return;
      var mask = item.mask_base64 || item.mask || item.mask_image_base64;
      if (typeof mask === 'string' && mask.length > 80) {
        masks.push({
          mask_base64: mask,
          overlay_base64: item.overlay_base64 || item.overlay_image_base64 || '',
          label: item.name || item.label || item.title || sourceName || 'mask',
          score: item.score,
          selected: Boolean(item.selected),
          color: item.color,
          data: item
        });
      }
    }
    function walk(value, sourceName, depth) {
      if (!value || depth > 5 || masks.length > 40) return;
      if (Array.isArray(value)) {
        value.forEach(function (item) { walk(item, sourceName, depth + 1); });
        return;
      }
      if (typeof value !== 'object') return;
      add(value, sourceName);
      Object.keys(value).forEach(function (key) {
        if (/image_base64|focus_image|thumbnail/i.test(key)) return;
        walk(value[key], key, depth + 1);
      });
    }
    walk(source, '', 0);
    return masks;
  }

  function rgba(hex, alpha) {
    var h = String(hex || '#22c55e').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function css(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function frameVisualKind(frame) {
    if (!frame) return 'image';
    return frame.visual_kind || (frame.diagram ? 'architecture' : (frame.chart ? 'chart' : (frame.overlays ? 'overlay_image' : 'image')));
  }

  function frameAllowsOverlay(frame) {
    var kind = frameVisualKind(frame);
    return !!(frame && frame.overlay_scope !== 'none' && (kind === 'image' || kind === 'overlay_image'));
  }

  function chartItems(chart) {
    if (!chart || typeof chart !== 'object') return [];
    if (Array.isArray(chart.items)) return chart.items;
    var values = Array.isArray(chart.values) ? chart.values : [];
    var labels = Array.isArray(chart.labels) ? chart.labels : [];
    return values.map(function (value, index) {
      return { label: labels[index] || String(index + 1), value: value };
    });
  }

  function itemValue(item) {
    if (typeof item === 'number') return item;
    if (!item || typeof item !== 'object') return 0;
    var value = item.value;
    if (value == null) value = item.score;
    if (value == null) value = item.probability;
    if (value == null) value = item.ratio;
    if (value == null) value = item.y;
    return Number(value) || 0;
  }

  function itemLabel(item, index) {
    if (item && typeof item === 'object') {
      return item.label || item.name || item.class || item.title || ('第 ' + (index + 1) + ' 项');
    }
    return '第 ' + (index + 1) + ' 项';
  }

  function resizeCanvas(canvas, w, h) {
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function textLines(ctx, text, maxWidth, maxLines) {
    var raw = String(text || '').trim();
    if (!raw) return [];
    var chars = Array.from(raw);
    var lines = [];
    var line = '';
    chars.forEach(function (ch) {
      var next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    maxLines = maxLines || lines.length;
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[lines.length - 1] || '';
      while (last && ctx.measureText(last + '...').width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = last + '...';
    }
    return lines;
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var lines = textLines(ctx, text, maxWidth, maxLines);
    lines.forEach(function (line, index) {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    return lines.length * lineHeight;
  }

  function drawChartHeader(ctx, chart, w) {
    var y = 30;
    ctx.fillStyle = css('--cv-title', '#e5e7eb');
    ctx.font = '700 18px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    y += drawWrappedText(ctx, chart.title || chart.name || '结构化图表', 22, y, w - 44, 22, 2);
    if (chart.subtitle) {
      ctx.fillStyle = css('--cv-muted', '#94a3b8');
      ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      y += drawWrappedText(ctx, chart.subtitle, 22, y + 4, w - 44, 17, 2) + 2;
    }
    return Math.max(62, y + 8);
  }

  function drawMiniChart(canvas, chart) {
    if (!canvas || !chart) return;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(220, Math.round(rect.width || canvas.parentElement && canvas.parentElement.clientWidth || 300));
    var h = Math.max(150, Math.round(rect.height || 170));
    var ctx = resizeCanvas(canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--cv-media-bg', '#0f172a');
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css('--cv-title', '#e5e7eb');
    ctx.font = '700 13px "Noto Sans SC", sans-serif';
    ctx.fillText(String(chart.title || chart.name || '结构化图表').slice(0, 28), 12, 22);
    var type = chart.type || chart.kind || 'bar';
    if (type === 'matrix') {
      var rows = chart.values || chart.matrix || [];
      if (!rows.length) return;
      var size = Math.min(w - 28, h - 46);
      var flat = rows.reduce(function (acc, row) { return acc.concat(row.map(Number)); }, []);
      var min = chart.min != null ? Number(chart.min) : Math.min.apply(Math, flat);
      var max = chart.max != null ? Number(chart.max) : Math.max.apply(Math, flat);
      var cw = size / Math.max(1, rows[0] ? rows[0].length : 1);
      var rh = size / Math.max(1, rows.length);
      rows.forEach(function (row, y) {
        row.forEach(function (v, x) {
          var t = (Number(v) - min) / Math.max(1e-8, max - min);
          ctx.fillStyle = 'rgb(' + Math.round(20 + 230 * t) + ',' + Math.round(90 + 110 * (1 - Math.abs(t - 0.5) * 2)) + ',' + Math.round(230 - 170 * t) + ')';
          ctx.fillRect(14 + x * cw, 36 + y * rh, Math.ceil(cw), Math.ceil(rh));
        });
      });
      return;
    }
    if (type === 'line' || type === 'series') {
      var series = Array.isArray(chart.series) ? chart.series : [{ values: chart.values || [] }];
      var all = [];
      series.forEach(function (s) { all = all.concat((s.values || []).map(Number).filter(Number.isFinite)); });
      if (!all.length) return;
      var minV = chart.min != null ? Number(chart.min) : Math.min.apply(Math, all);
      var maxV = chart.max != null ? Number(chart.max) : Math.max.apply(Math, all);
      if (Math.abs(maxV - minV) < 1e-8) maxV = minV + 1;
      var left = 18, top = 38, innerW = w - 32, innerH = h - 56;
      ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.28)');
      ctx.strokeRect(left, top, innerW, innerH);
      series.forEach(function (s, si) {
        var vals = (s.values || []).map(Number).filter(Number.isFinite);
        ctx.beginPath();
        vals.forEach(function (value, index) {
          var x = left + index / Math.max(1, vals.length - 1) * innerW;
          var y = top + innerH - (value - minV) / (maxV - minV) * innerH;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = s.color || COLORS[si % COLORS.length];
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      return;
    }
    var items = chartItems(chart).slice(0, 6);
    var maxValue = Math.max(1e-8, Math.max.apply(Math, items.map(itemValue).concat([Number(chart.max || 0)])));
    items.forEach(function (item, index) {
      var value = itemValue(item);
      var y = 40 + index * 18;
      var color = (item && item.color) || (item && item.kept === false ? '#f59e0b' : COLORS[index % COLORS.length]);
      if (item && item.kept === true) color = item.color || '#22c55e';
      ctx.fillStyle = css('--cv-muted', '#94a3b8');
      ctx.font = '11px "Noto Sans SC", sans-serif';
      ctx.fillText(String(itemLabel(item, index)).slice(0, 12), 12, y + 10);
      ctx.fillStyle = rgba(color, 0.2);
      ctx.fillRect(92, y, w - 114, 11);
      ctx.fillStyle = color;
      ctx.fillRect(92, y, (w - 114) * Math.max(0, value) / maxValue, 11);
    });
  }

  function InteractiveTeachingStage(root, options) {
    this.root = typeof root === 'string' ? document.querySelector(root) : root;
    this.options = options || {};
    this.payload = null;
    this.frames = [];
    this.index = 0;
    this.playTimer = null;
    this.selectedObject = null;
    this.params = {};
    this.maskCache = {};
    this.build();
  }

  InteractiveTeachingStage.prototype.build = function () {
    if (!this.root) return;
    this.root.classList.add('interactive-stage');
    this.root.classList.toggle('is-compact', Boolean(this.options.compact));
    this.root.innerHTML = [
      '<div class="it-layout">',
        '<aside class="it-rail">',
          '<div class="it-label">过程时间线</div>',
          '<div class="it-rail-list" data-it-rail></div>',
        '</aside>',
        '<section class="it-main">',
          '<div class="it-media" data-it-media>',
            '<img data-it-image hidden alt="后端真实计算结果">',
            '<canvas data-it-chart hidden class="it-chart-canvas" aria-label="结构化图表"></canvas>',
            '<div data-it-diagram hidden class="it-diagram" aria-label="结构化架构图"></div>',
            '<canvas data-it-canvas hidden></canvas>',
            '<div class="it-empty" data-it-empty>等待后端真实计算结果</div>',
          '</div>',
          '<div class="it-timeline">',
            '<button type="button" data-it-play>播放</button>',
            '<button type="button" data-it-prev>上一步</button>',
            '<input data-it-slider type="range" min="0" max="0" value="0">',
            '<button type="button" data-it-next>下一步</button>',
            '<span data-it-frame-name>等待步骤</span>',
          '</div>',
          '<div class="it-interactions" data-it-interactions></div>',
          '<div class="it-curves" data-it-curves></div>',
        '</section>',
        '<aside class="it-inspector">',
          '<div class="it-label">讲解与数据</div>',
          '<h2 data-it-title>等待运行</h2>',
          '<p data-it-text>运行后端算法后，这里会显示当前步骤做了什么，以及它对应的真实中间数据。</p>',
          '<code data-it-formula>Y=f(X)</code>',
          '<dl data-it-data><dt>状态</dt><dd>等待后端</dd></dl>',
        '</aside>',
      '</div>'
    ].join('');
    this.nodes = {
      rail: this.root.querySelector('[data-it-rail]'),
      media: this.root.querySelector('[data-it-media]'),
      image: this.root.querySelector('[data-it-image]'),
      chart: this.root.querySelector('[data-it-chart]'),
      diagram: this.root.querySelector('[data-it-diagram]'),
      canvas: this.root.querySelector('[data-it-canvas]'),
      empty: this.root.querySelector('[data-it-empty]'),
      slider: this.root.querySelector('[data-it-slider]'),
      play: this.root.querySelector('[data-it-play]'),
      prev: this.root.querySelector('[data-it-prev]'),
      next: this.root.querySelector('[data-it-next]'),
      frameName: this.root.querySelector('[data-it-frame-name]'),
      interactions: this.root.querySelector('[data-it-interactions]'),
      curves: this.root.querySelector('[data-it-curves]'),
      title: this.root.querySelector('[data-it-title]'),
      text: this.root.querySelector('[data-it-text]'),
      formula: this.root.querySelector('[data-it-formula]'),
      data: this.root.querySelector('[data-it-data]')
    };
    this.ctx = this.nodes.canvas.getContext('2d');
    this.nodes.image.addEventListener('load', this.syncCanvas.bind(this));
    this.nodes.slider.addEventListener('input', this.showFrame.bind(this, null));
    this.nodes.play.addEventListener('click', this.togglePlay.bind(this));
    this.nodes.prev.addEventListener('click', this.showRelative.bind(this, -1));
    this.nodes.next.addEventListener('click', this.showRelative.bind(this, 1));
    this.nodes.canvas.addEventListener('click', this.onCanvasClick.bind(this));
    window.addEventListener('resize', this.syncCanvas.bind(this));
  };

  InteractiveTeachingStage.prototype.render = function (payload) {
    this.payload = payload || {};
    this.frames = normalizeFrames(this.payload);
    this.index = Math.max(0, Math.min(this.index, Math.max(0, this.frames.length - 1)));
    this.renderRail();
    this.renderInteractions();
    this.renderCurves();
    this.nodes.slider.max = String(Math.max(0, this.frames.length - 1));
    this.showFrame(this.index);
  };

  InteractiveTeachingStage.prototype.renderRail = function () {
    var self = this;
    if (!this.frames.length) {
      this.nodes.rail.innerHTML = '<div class="it-note">暂无步骤</div>';
      return;
    }
    this.nodes.rail.innerHTML = this.frames.map(function (frame, index) {
      return '<button type="button" class="it-rail-step" data-index="' + index + '">' +
        '<span>' + String(index + 1).padStart(2, '0') + '</span><b>' + esc(frame.name || frame.id || '步骤') + '</b></button>';
    }).join('');
    Array.prototype.forEach.call(this.nodes.rail.querySelectorAll('[data-index]'), function (button) {
      button.addEventListener('click', function () {
        self.stopPlay();
        self.showFrame(Number(button.dataset.index || 0));
      });
    });
  };

  InteractiveTeachingStage.prototype.renderInteractions = function () {
    var self = this;
    var interactions = (this.payload && this.payload.interactions) || [];
    var overlayFrames = (this.frames || []).filter(frameAllowsOverlay).map(function (frame) { return frame.overlays || {}; });
    var boxes = overlayFrames.reduce(function (acc, overlays) { return acc.concat(extractBoxes(overlays)); }, []);
    var masks = overlayFrames.reduce(function (acc, overlays) { return acc.concat(extractMasks(overlays)); }, []);
    var html = '';
    var controlItems = interactions.filter(function (item) {
      return item && ['range', 'select', 'text'].indexOf(item.type) >= 0;
    });
    if (controlItems.length) {
      html += '<div class="it-control-grid">' + controlItems.map(function (item) {
        var name = item.name || item.id;
        var value = self.params[name];
        if (value == null) value = item.value == null ? '' : item.value;
        if (item.type === 'range') {
          return '<label class="it-control"><span>' + esc(item.label || name) +
            '</span><input type="range" data-param="' + esc(name) + '" min="' + esc(item.min) +
            '" max="' + esc(item.max) + '" step="' + esc(item.step || 1) + '" value="' + esc(value) +
            '"><output>' + esc(value) + '</output></label>';
        }
        if (item.type === 'select') {
          return '<label class="it-control"><span>' + esc(item.label || name) +
            '</span><select data-param="' + esc(name) + '">' + (item.options || []).map(function (opt) {
              var val = typeof opt === 'string' ? opt : opt.value;
              var label = typeof opt === 'string' ? opt : opt.label;
              return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>';
            }).join('') + '</select></label>';
        }
        return '<label class="it-control it-control-wide"><span>' + esc(item.label || name) +
          '</span><input type="text" data-param="' + esc(name) + '" value="' + esc(value) + '"></label>';
      }).join('') + '</div>';
    }
    if (interactions.some(function (item) { return item.type === 'point_grid'; })) {
      html += '<div class="it-note">点击主图可以选择真实 patch / token，坐标会回传后端重新计算。</div>';
    }
    if (boxes.length) {
      html += '<div class="it-object-list">' + boxes.slice(0, 12).map(function (box, index) {
        var score = box.score == null ? '' : ' / ' + Number(box.score).toFixed(3);
        return '<button type="button" data-object="' + index + '">' + esc(box.label) + esc(score) + '</button>';
      }).join('') + '</div>';
    }
    if (masks.length) {
      html += '<div class="it-object-list">' + masks.slice(0, 8).map(function (mask, index) {
        var score = mask.score == null ? '' : ' / ' + Number(mask.score).toFixed(3);
        return '<button type="button" data-mask="' + index + '">' + esc(mask.label) + esc(score) + '</button>';
      }).join('') + '</div>';
    }
    this.nodes.interactions.innerHTML = html || '<div class="it-note">拖动时间线、点击步骤或使用控件查看真实中间过程。</div>';
    Array.prototype.forEach.call(this.nodes.interactions.querySelectorAll('[data-param]'), function (input) {
      var updateOutput = function () {
        var out = input.parentElement.querySelector('output');
        if (out) out.textContent = input.value;
      };
      input.addEventListener('input', updateOutput);
      input.addEventListener('change', function () {
        self.params[input.dataset.param] = input.value;
        if (self.options.onParamChange) self.options.onParamChange(input.dataset.param, input.value, self.params);
      });
    });
    Array.prototype.forEach.call(this.nodes.interactions.querySelectorAll('[data-object]'), function (button) {
      button.addEventListener('click', function () {
        self.selectedObject = boxes[Number(button.dataset.object || 0)];
        self.updateInspectorForObject(self.selectedObject);
        self.drawOverlay();
      });
    });
    Array.prototype.forEach.call(this.nodes.interactions.querySelectorAll('[data-mask]'), function (button) {
      button.addEventListener('click', function () {
        self.selectedObject = masks[Number(button.dataset.mask || 0)];
        self.updateInspectorForObject(self.selectedObject);
        self.drawOverlay();
      });
    });
  };

  InteractiveTeachingStage.prototype.renderCurves = function () {
    var curves = (this.payload && this.payload.curves) || [];
    if (!curves.length) {
      this.nodes.curves.innerHTML = '';
      return;
    }
    this.nodes.curves.innerHTML = curves.slice(0, 6).map(function (curve, index) {
      return '<article class="it-curve-card"><strong>' + esc(curve.name || curve.id || '曲线') +
        '</strong><canvas data-curve-index="' + index + '"></canvas></article>';
    }).join('');
    var self = this;
    Array.prototype.forEach.call(this.nodes.curves.querySelectorAll('canvas'), function (canvas) {
      self.drawCurve(canvas, curves[Number(canvas.dataset.curveIndex || 0)]);
    });
  };

  InteractiveTeachingStage.prototype.drawCurve = function (canvas, curve) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(260, Math.round(rect.width || 320));
    var h = 150;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--cv-media-bg', '#0f172a');
    ctx.fillRect(0, 0, w, h);
    if (!curve) return;
    if (curve.type === 'matrix' && Array.isArray(curve.values)) {
      this.drawMatrix(ctx, curve.values, w, h);
      return;
    }
    this.drawSeries(ctx, Array.isArray(curve.values) ? curve.values : [], w, h);
  };

  InteractiveTeachingStage.prototype.drawMatrix = function (ctx, rows, w, h) {
    var rh = h / Math.max(1, rows.length);
    var cw = w / Math.max(1, rows[0] ? rows[0].length : 1);
    var flat = rows.reduce(function (acc, row) { return acc.concat(row); }, []);
    var min = Math.min.apply(Math, flat);
    var max = Math.max.apply(Math, flat);
    rows.forEach(function (row, y) {
      row.forEach(function (v, x) {
        var t = (Number(v) - min) / Math.max(1e-8, max - min);
        ctx.fillStyle = 'rgb(' + Math.round(35 + 220 * t) + ',' + Math.round(90 + 120 * (1 - Math.abs(t - 0.5) * 2)) + ',' + Math.round(225 - 175 * t) + ')';
        ctx.fillRect(x * cw, y * rh, Math.ceil(cw), Math.ceil(rh));
      });
    });
  };

  InteractiveTeachingStage.prototype.drawSeries = function (ctx, rawValues, w, h) {
    var values = rawValues.map(Number).filter(Number.isFinite);
    if (!values.length) return;
    var mn = Math.min.apply(Math, values);
    var mx = Math.max.apply(Math, values);
    var pad = 18;
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.3)');
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.beginPath();
    values.forEach(function (v, i) {
      var x = pad + i / Math.max(1, values.length - 1) * (w - pad * 2);
      var y = h - pad - (v - mn) / Math.max(1e-8, mx - mn) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = css('--cv-accent', '#66f2c2');
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };

  InteractiveTeachingStage.prototype.showRelative = function (delta) {
    this.stopPlay();
    this.showFrame(this.index + delta);
  };

  InteractiveTeachingStage.prototype.showFrame = function (index) {
    if (index == null || typeof index !== 'number') index = Number(this.nodes.slider.value || 0);
    if (!this.frames.length) {
      this.nodes.empty.hidden = false;
      return;
    }
    index = Math.max(0, Math.min(this.frames.length - 1, index));
    this.index = index;
    var frame = this.frames[index];
    var hasChart = !!(frame && frame.chart && typeof frame.chart === 'object');
    var hasDiagram = !!(frame && frame.diagram && typeof frame.diagram === 'object');
    var src = dataUrl(frame.image_base64 || frame.base_image);
    this.nodes.media.classList.toggle('is-diagram', hasDiagram);
    this.nodes.media.classList.toggle('is-chart', !hasDiagram && hasChart);
    this.nodes.media.classList.toggle('is-image', !hasDiagram && !hasChart && !!src);
    if (hasDiagram) {
      this.nodes.image.hidden = true;
      this.nodes.canvas.hidden = true;
      this.nodes.chart.hidden = true;
      this.nodes.diagram.hidden = false;
      this.nodes.empty.hidden = true;
      this.nodes.image.removeAttribute('src');
      this.renderDiagram(frame.diagram);
    } else if (hasChart) {
      this.nodes.image.hidden = true;
      this.nodes.canvas.hidden = true;
      this.nodes.chart.hidden = false;
      this.nodes.diagram.hidden = true;
      this.nodes.empty.hidden = true;
      this.nodes.image.removeAttribute('src');
      this.drawFrameChart(frame.chart);
    } else if (src) {
      this.nodes.image.hidden = false;
      this.nodes.canvas.hidden = false;
      this.nodes.chart.hidden = true;
      this.nodes.diagram.hidden = true;
      this.nodes.image.src = src;
      this.nodes.empty.hidden = true;
    } else {
      this.nodes.image.hidden = true;
      this.nodes.canvas.hidden = true;
      this.nodes.chart.hidden = true;
      this.nodes.diagram.hidden = true;
      this.nodes.image.removeAttribute('src');
      this.nodes.empty.hidden = false;
    }
    this.nodes.slider.value = String(index);
    this.nodes.frameName.textContent = frame.name || frame.id || '步骤';
    this.nodes.title.textContent = frame.name || frame.id || '步骤';
    this.nodes.text.innerHTML = teachingHtml(frame, this.payload);
    this.renderFormula(frame.formula || 'Y=f(X)');
    this.renderData(frame.data || {});
    this.selectedObject = null;
    this.updateActiveRail();
    if (!hasChart && !hasDiagram) this.syncCanvas();
  };

  InteractiveTeachingStage.prototype.drawFrameChart = function (chart) {
    var canvas = this.nodes.chart;
    var media = this.nodes.media;
    var rect = media.getBoundingClientRect();
    var w = Math.max(320, Math.round(rect.width || 640));
    var h = Math.max(280, Math.round(rect.height || 360));
    var ctx = resizeCanvas(canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--cv-media-bg', '#0f172a');
    ctx.fillRect(0, 0, w, h);
    chart._plotTop = drawChartHeader(ctx, chart, w);
    var type = chart.type || chart.kind || 'bar';
    if (type === 'matrix') return this.drawChartMatrix(ctx, chart, w, h);
    if (type === 'line' || type === 'series') return this.drawChartLine(ctx, chart, w, h);
    if (type === 'flow' || type === 'tokens') return this.drawChartFlow(ctx, chart, w, h);
    if (type === 'scatter') return this.drawChartScatter(ctx, chart, w, h);
    if (type === 'histogram') return this.drawChartHistogram(ctx, chart, w, h);
    return this.drawChartBars(ctx, chart, w, h);
  };

  InteractiveTeachingStage.prototype.drawChartBars = function (ctx, chart, w, h) {
    var items = chartItems(chart).slice(0, Number(chart.limit || 12));
    var left = 150;
    var right = 32;
    var top = Number(chart._plotTop) || (chart.subtitle ? 78 : 60);
    var rowH = Math.max(22, Math.min(42, (h - top - 48) / Math.max(1, items.length)));
    var maxValue = Math.max(1e-8, Math.max.apply(Math, items.map(itemValue).concat([Number(chart.max || 0)])));
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.28)');
    ctx.strokeRect(left, top - 8, w - left - right, Math.max(1, items.length) * rowH + 16);
    if (!items.length) {
      ctx.fillStyle = css('--cv-muted', '#94a3b8');
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.fillText('暂无可绘制的数据', 24, h / 2);
      return;
    }
    var self = this;
    items.forEach(function (item, index) {
      var value = itemValue(item);
      var y = top + index * rowH;
      var label = itemLabel(item, index);
      var color = (item && item.color) || (item && item.kept === false ? '#f59e0b' : COLORS[index % COLORS.length]);
      if (item && item.kept === true) color = item.color || '#22c55e';
      ctx.fillStyle = css('--cv-muted', '#94a3b8');
      ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      drawWrappedText(ctx, label, 22, y + Math.max(13, rowH * 0.46), left - 34, 14, 2);
      ctx.fillStyle = rgba(color, 0.18);
      ctx.fillRect(left, y + 5, w - left - right, rowH - 10);
      ctx.fillStyle = color;
      ctx.fillRect(left, y + 5, (w - left - right) * Math.max(0, value) / maxValue, rowH - 10);
      ctx.fillStyle = css('--cv-title', '#e5e7eb');
      ctx.font = '700 12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      var valueText = chart.valueFormat === 'percent' || chart.type === 'probability'
        ? (value * 100).toFixed(value < 0.1 ? 1 : 0) + '%'
        : String(Math.round(value * 1000) / 1000);
      ctx.fillText(valueText, Math.min(w - right - 58, left + (w - left - right) * Math.max(0, value) / maxValue + 8), y + rowH * 0.62);
      if (chart.threshold != null) {
        var tx = left + (w - left - right) * Number(chart.threshold) / maxValue;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, top - 14);
        ctx.lineTo(tx, top + items.length * rowH + 14);
        ctx.stroke();
      }
      if (self.selectedObject && self.selectedObject.data === item) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(left - 2, y + 3, w - left - right + 4, rowH - 6);
      }
    });
    this.drawChartAxes(ctx, chart, left, top + items.length * rowH + 28, w - right, h);
  };

  InteractiveTeachingStage.prototype.drawChartHistogram = function (ctx, chart, w, h) {
    var values = (chart.values || chart.items || []).map(itemValue);
    var left = 46, right = 22, top = Number(chart._plotTop) || (chart.subtitle ? 78 : 60), bottom = 38;
    var innerW = w - left - right;
    var innerH = h - top - bottom;
    if (!values.length) return this.drawChartBars(ctx, chart, w, h);
    var maxValue = Math.max.apply(Math, values.concat([1e-8]));
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.28)');
    ctx.strokeRect(left, top, innerW, innerH);
    values.forEach(function (value, index) {
      var barW = Math.max(1, innerW / values.length);
      var bh = innerH * value / maxValue;
      ctx.fillStyle = chart.color || COLORS[index % COLORS.length];
      ctx.fillRect(left + index * barW, top + innerH - bh, Math.ceil(barW), bh);
    });
    this.drawChartAxes(ctx, chart, left, h - 12, w - right, h);
  };

  InteractiveTeachingStage.prototype.drawChartLine = function (ctx, chart, w, h) {
    var series = Array.isArray(chart.series) ? chart.series : [{ name: chart.name || '', values: chart.values || [] }];
    var left = 48, right = 24, top = Number(chart._plotTop) || (chart.subtitle ? 78 : 60), bottom = 42;
    var innerW = w - left - right;
    var innerH = h - top - bottom;
    var all = [];
    series.forEach(function (s) { all = all.concat((s.values || []).map(Number).filter(Number.isFinite)); });
    if (!all.length) return;
    var minV = chart.min != null ? Number(chart.min) : Math.min.apply(Math, all);
    var maxV = chart.max != null ? Number(chart.max) : Math.max.apply(Math, all);
    if (Math.abs(maxV - minV) < 1e-8) maxV = minV + 1;
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.28)');
    ctx.strokeRect(left, top, innerW, innerH);
    series.forEach(function (s, si) {
      var vals = (s.values || []).map(Number).filter(Number.isFinite);
      if (!vals.length) return;
      ctx.beginPath();
      vals.forEach(function (value, index) {
        var x = left + index / Math.max(1, vals.length - 1) * innerW;
        var y = top + innerH - (value - minV) / (maxV - minV) * innerH;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color || COLORS[si % COLORS.length];
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
    this.drawChartAxes(ctx, chart, left, h - 14, w - right, h);
  };

  InteractiveTeachingStage.prototype.drawChartScatter = function (ctx, chart, w, h) {
    var groups = Array.isArray(chart.groups) ? chart.groups : [];
    var points = Array.isArray(chart.points) ? chart.points : [];
    if (points.length) groups = [{ name: chart.name || 'points', color: chart.color || COLORS[0], points: points }];
    var left = 54, right = 28, top = Number(chart._plotTop) || (chart.subtitle ? 82 : 64), bottom = 44;
    var innerW = w - left - right;
    var innerH = h - top - bottom;
    var all = [];
    groups.forEach(function (group) {
      (group.points || []).forEach(function (pt) {
        if (Array.isArray(pt) && pt.length >= 2) all.push([Number(pt[0]), Number(pt[1])]);
        else if (pt && typeof pt === 'object') all.push([Number(pt.x), Number(pt.y)]);
      });
    });
    all = all.filter(function (pt) { return Number.isFinite(pt[0]) && Number.isFinite(pt[1]); });
    if (!all.length) return;
    var xs = all.map(function (pt) { return pt[0]; });
    var ys = all.map(function (pt) { return pt[1]; });
    var xMin = chart.xMin != null ? Number(chart.xMin) : Math.min.apply(Math, xs);
    var xMax = chart.xMax != null ? Number(chart.xMax) : Math.max.apply(Math, xs);
    var yMin = chart.yMin != null ? Number(chart.yMin) : Math.min.apply(Math, ys);
    var yMax = chart.yMax != null ? Number(chart.yMax) : Math.max.apply(Math, ys);
    if (Math.abs(xMax - xMin) < 1e-8) xMax = xMin + 1;
    if (Math.abs(yMax - yMin) < 1e-8) yMax = yMin + 1;
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.3)');
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, innerW, innerH);
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.16)');
    [0.25, 0.5, 0.75].forEach(function (t) {
      ctx.beginPath();
      ctx.moveTo(left + innerW * t, top);
      ctx.lineTo(left + innerW * t, top + innerH);
      ctx.moveTo(left, top + innerH * t);
      ctx.lineTo(left + innerW, top + innerH * t);
      ctx.stroke();
    });
    groups.forEach(function (group, gi) {
      var color = group.color || COLORS[gi % COLORS.length];
      (group.points || []).forEach(function (pt) {
        var x = Array.isArray(pt) ? Number(pt[0]) : Number(pt.x);
        var y = Array.isArray(pt) ? Number(pt[1]) : Number(pt.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        var cx = left + (x - xMin) / (xMax - xMin) * innerW;
        var cy = top + innerH - (y - yMin) / (yMax - yMin) * innerH;
        ctx.beginPath();
        ctx.arc(cx, cy, Number(group.radius || chart.radius || 3), 0, Math.PI * 2);
        ctx.fillStyle = rgba(color, Number(group.alpha || 0.72));
        ctx.fill();
      });
    });
    var lx = left;
    groups.slice(0, 4).forEach(function (group, gi) {
      var color = group.color || COLORS[gi % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(lx, h - 26, 10, 10);
      ctx.fillStyle = css('--cv-muted', '#94a3b8');
      ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(String(group.name || ('group ' + (gi + 1))).slice(0, 18), lx + 16, h - 17);
      lx += 118;
    });
    this.drawChartAxes(ctx, chart, left, h - 14, w - right, h);
  };

  InteractiveTeachingStage.prototype.drawChartMatrix = function (ctx, chart, w, h) {
    var rows = chart.values || chart.matrix || [];
    if (!Array.isArray(rows) || !rows.length) return;
    var top = Number(chart._plotTop) || (chart.subtitle ? 78 : 60);
    var left = 46;
    var size = Math.min(w - 72, h - top - 34);
    var rowCount = rows.length;
    var colCount = rows[0] ? rows[0].length : 1;
    var flat = rows.reduce(function (acc, row) { return acc.concat(row.map(Number)); }, []);
    var min = chart.min != null ? Number(chart.min) : Math.min.apply(Math, flat);
    var max = chart.max != null ? Number(chart.max) : Math.max.apply(Math, flat);
    var cw = size / Math.max(1, colCount);
    var rh = size / Math.max(1, rowCount);
    rows.forEach(function (row, y) {
      row.forEach(function (v, x) {
        var t = (Number(v) - min) / Math.max(1e-8, max - min);
        ctx.fillStyle = 'rgb(' + Math.round(20 + 230 * t) + ',' + Math.round(80 + 120 * (1 - Math.abs(t - 0.5) * 2)) + ',' + Math.round(230 - 170 * t) + ')';
        ctx.fillRect(left + x * cw, top + y * rh, Math.ceil(cw), Math.ceil(rh));
      });
    });
    ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.28)');
    ctx.strokeRect(left, top, size, size);
  };

  InteractiveTeachingStage.prototype.drawChartFlow = function (ctx, chart, w, h) {
    var items = chartItems(chart);
    if (!items.length && Array.isArray(chart.nodes)) items = chart.nodes;
    var top = (Number(chart._plotTop) || (chart.subtitle ? 92 : 72)) + 12;
    var step = (w - 84) / Math.max(1, items.length - 1);
    items.forEach(function (item, index) {
      var x = 42 + index * step;
      var y = top + (index % 2) * 56;
      if (index > 0) {
        ctx.strokeStyle = css('--cv-border', 'rgba(148,163,184,.42)');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(42 + (index - 1) * step + 36, top + ((index - 1) % 2) * 56);
        ctx.lineTo(x - 36, y);
        ctx.stroke();
      }
      ctx.fillStyle = rgba((item && item.color) || COLORS[index % COLORS.length], 0.22);
      ctx.strokeStyle = (item && item.color) || COLORS[index % COLORS.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = css('--cv-title', '#e5e7eb');
      ctx.font = '700 12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(itemLabel(item, index)).slice(0, 10), x, y + 4);
      ctx.textAlign = 'left';
    });
  };

  InteractiveTeachingStage.prototype.drawChartAxes = function (ctx, chart, x1, y, x2) {
    ctx.fillStyle = css('--cv-muted', '#94a3b8');
    ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    if (chart.xLabel) ctx.fillText(String(chart.xLabel), x1, y + 4);
    if (chart.yLabel) ctx.fillText(String(chart.yLabel), Math.max(12, x2 - 90), y + 4);
    if (chart.threshold != null) {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('阈值 ' + Number(chart.threshold).toFixed(2), x2 - 84, 52);
    }
  };

  InteractiveTeachingStage.prototype.renderDiagram = function (diagram) {
    var root = this.nodes.diagram;
    if (!root) return;
    var nodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
    var edges = Array.isArray(diagram.edges) ? diagram.edges : [];
    var title = diagram.title || diagram.name || '';
    var subtitle = diagram.subtitle || '';
    if (!nodes.length) {
      root.innerHTML = '<div class="it-diagram-empty">暂无可绘制结构</div>';
      return;
    }
    var nodeById = {};
    nodes.forEach(function (node) { if (node && node.id) nodeById[node.id] = node; });
    var html = '<div class="it-diagram-inner">';
    if (title || subtitle) {
      html += '<header class="it-diagram-head">' +
        (title ? '<h3>' + esc(title) + '</h3>' : '') +
        (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') +
        '</header>';
    }
    html += '<div class="it-diagram-flow">';
    nodes.forEach(function (node) {
      var tone = node.tone || node.kind || 'default';
      html += '<div class="it-diagram-node" data-tone="' + esc(tone) + '">' +
        '<b>' + esc(node.label || node.name || node.id) + '</b>' +
        (node.detail ? '<span>' + esc(node.detail) + '</span>' : '') +
        '</div>';
    });
    html += '</div>';
    if (edges.length) {
      html += '<div class="it-diagram-edges">';
      edges.forEach(function (edge) {
        var from = nodeById[edge.from] || {};
        var to = nodeById[edge.to] || {};
        html += '<div class="it-diagram-edge' + (edge.skip ? ' is-skip' : '') + '">' +
          '<span>' + esc(from.label || edge.from || '') + '</span>' +
          '<strong>' + esc(edge.label || (edge.skip ? 'shortcut' : 'flow')) + '</strong>' +
          '<span>' + esc(to.label || edge.to || '') + '</span>' +
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    root.innerHTML = html;
  };

  InteractiveTeachingStage.prototype.renderFormula = function (formula) {
    if (window.renderLatex) window.renderLatex(this.nodes.formula, formula, { display: true });
    else this.nodes.formula.textContent = formula || '';
  };

  InteractiveTeachingStage.prototype.renderData = function (data) {
    var keys = Object.keys(data || {}).filter(function (key) {
      return !/image|base64|mask/i.test(key);
    }).slice(0, 10);
    if (!keys.length) {
      this.nodes.data.innerHTML = '<dt>数据</dt><dd>暂无结构化数据</dd>';
      return;
    }
    this.nodes.data.innerHTML = keys.map(function (key) {
      return '<dt>' + esc(key) + '</dt><dd>' + esc(formatValue(data[key])) + '</dd>';
    }).join('');
  };

  InteractiveTeachingStage.prototype.updateActiveRail = function () {
    var self = this;
    Array.prototype.forEach.call(this.nodes.rail.querySelectorAll('[data-index]'), function (button) {
      button.classList.toggle('active', Number(button.dataset.index || 0) === self.index);
    });
  };

  InteractiveTeachingStage.prototype.togglePlay = function () {
    var self = this;
    if (this.playTimer) {
      this.stopPlay();
      return;
    }
    if (!this.frames.length) return;
    this.nodes.play.textContent = '暂停';
    this.showFrame(0);
    this.playTimer = setInterval(function () {
      if (self.index >= self.frames.length - 1) {
        self.stopPlay();
        return;
      }
      self.showFrame(self.index + 1);
    }, this.options.frameDelay || 1000);
  };

  InteractiveTeachingStage.prototype.stopPlay = function () {
    if (this.playTimer) clearInterval(this.playTimer);
    this.playTimer = null;
    if (this.nodes && this.nodes.play) this.nodes.play.textContent = '播放';
  };

  InteractiveTeachingStage.prototype.syncCanvas = function () {
    var image = this.nodes.image;
    var canvas = this.nodes.canvas;
    var frame = this.frames[this.index] || {};
    if (frame.chart || this.nodes.chart.hidden === false) {
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (frame.chart) this.drawFrameChart(frame.chart);
      return;
    }
    if (!image || !image.complete || !image.naturalWidth) {
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    var rect = image.getBoundingClientRect();
    var parent = this.root.querySelector('[data-it-media]').getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.style.left = (rect.left - parent.left) + 'px';
    canvas.style.top = (rect.top - parent.top) + 'px';
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawOverlay();
  };

  InteractiveTeachingStage.prototype.currentOverlaySource = function () {
    var frame = this.frames[this.index] || {};
    return {
      frame: frame,
      overlays: frameAllowsOverlay(frame) ? (frame.overlays || {}) : {}
    };
  };

  InteractiveTeachingStage.prototype.drawOverlay = function () {
    var image = this.nodes.image;
    var canvas = this.nodes.canvas;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    var frame = this.frames[this.index] || {};
    if (!frameAllowsOverlay(frame)) return;
    if (!image.naturalWidth || !image.naturalHeight) return;
    var source = this.currentOverlaySource();
    var boxes = extractBoxes(source.overlays);
    var points = extractPoints(source.overlays);
    var masks = extractMasks(source.overlays);
    var sx = canvas.clientWidth / image.naturalWidth;
    var sy = canvas.clientHeight / image.naturalHeight;
    var self = this;
    masks.slice(0, 12).forEach(function (mask, index) {
      self.drawMask(mask, index, canvas.clientWidth, canvas.clientHeight);
    });
    boxes.slice(0, 80).forEach(function (obj, index) {
      var box = obj.box;
      if (!box || box.length < 4) return;
      var norm = Math.max.apply(Math, box.map(Math.abs)) <= 1.5;
      var x1 = (norm ? box[0] * image.naturalWidth : box[0]) * sx;
      var y1 = (norm ? box[1] * image.naturalHeight : box[1]) * sy;
      var x2 = (norm ? box[2] * image.naturalWidth : box[2]) * sx;
      var y2 = (norm ? box[3] * image.naturalHeight : box[3]) * sy;
      var color = COLORS[index % COLORS.length];
      var active = self.selectedObject && self.selectedObject.data === obj.data;
      self.ctx.lineWidth = active ? 4 : 2;
      self.ctx.strokeStyle = color;
      self.ctx.fillStyle = rgba(color, active ? 0.18 : 0.07);
      self.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      self.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      if (obj.label) {
        var text = obj.label + (obj.score == null ? '' : ' ' + Number(obj.score).toFixed(2));
        var tw = Math.min(260, Math.max(86, text.length * 8 + 18));
        self.ctx.fillStyle = color;
        self.ctx.fillRect(x1, Math.max(0, y1 - 24), tw, 22);
        self.ctx.fillStyle = '#fff';
        self.ctx.font = 'bold 12px sans-serif';
        self.ctx.fillText(text.slice(0, 34), x1 + 7, Math.max(14, y1 - 8));
      }
    });
    points.slice(0, 160).forEach(function (pt, index) {
      var norm = Math.max(Math.abs(pt.x), Math.abs(pt.y)) <= 1.5;
      var x = (norm ? pt.x * image.naturalWidth : pt.x) * sx;
      var y = (norm ? pt.y * image.naturalHeight : pt.y) * sy;
      self.ctx.beginPath();
      self.ctx.arc(x, y, 5, 0, Math.PI * 2);
      self.ctx.fillStyle = COLORS[index % COLORS.length];
      self.ctx.fill();
      self.ctx.strokeStyle = '#fff';
      self.ctx.lineWidth = 2;
      self.ctx.stroke();
    });
  };

  InteractiveTeachingStage.prototype.drawMask = function (mask, index, w, h) {
    var key = mask.mask_base64 || mask.overlay_base64;
    if (!key) return;
    var img = this.maskCache[key];
    var self = this;
    if (!img) {
      img = new Image();
      this.maskCache[key] = img;
      img.onload = function () { self.drawOverlay(); };
      img.src = dataUrl(key);
      return;
    }
    if (!img.complete || !img.naturalWidth) return;
    var color = mask.color;
    if (Array.isArray(color)) {
      color = '#' + color.slice(0, 3).map(function (v) {
        return Math.max(0, Math.min(255, Number(v) || 0)).toString(16).padStart(2, '0');
      }).join('');
    }
    color = color || COLORS[index % COLORS.length];
    var active = this.selectedObject && this.selectedObject.data === mask.data;
    var off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(w));
    off.height = Math.max(1, Math.round(h));
    var offCtx = off.getContext('2d');
    offCtx.drawImage(img, 0, 0, off.width, off.height);
    offCtx.globalCompositeOperation = 'source-in';
    offCtx.fillStyle = rgba(color, active || mask.selected ? 0.44 : 0.28);
    offCtx.fillRect(0, 0, off.width, off.height);
    this.ctx.drawImage(off, 0, 0, w, h);
  };

  InteractiveTeachingStage.prototype.onCanvasClick = function (event) {
    var image = this.nodes.image;
    var frame = this.frames[this.index] || {};
    if (!frameAllowsOverlay(frame)) return;
    if (!image.naturalWidth || !image.naturalHeight) return;
    var rect = this.nodes.canvas.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width * image.naturalWidth;
    var y = (event.clientY - rect.top) / rect.height * image.naturalHeight;
    var source = this.currentOverlaySource();
    var boxes = extractBoxes(source.overlays);
    for (var i = 0; i < boxes.length; i += 1) {
      var b = boxes[i].box || [];
      var norm = Math.max.apply(Math, b.map(Math.abs)) <= 1.5;
      var x1 = norm ? b[0] * image.naturalWidth : b[0];
      var y1 = norm ? b[1] * image.naturalHeight : b[1];
      var x2 = norm ? b[2] * image.naturalWidth : b[2];
      var y2 = norm ? b[3] * image.naturalHeight : b[3];
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        this.selectedObject = boxes[i];
        this.updateInspectorForObject(boxes[i]);
        this.drawOverlay();
        return;
      }
    }
    var hasPatchInteraction = ((this.payload || {}).interactions || []).some(function (item) { return item.type === 'point_grid'; });
    if (hasPatchInteraction && this.options.onParamChange) {
      var patches = Number(((this.payload || {}).metrics || {}).patches || 196);
      var grid = Math.max(1, Math.round(Math.sqrt(patches)));
      var col = Math.min(grid - 1, Math.floor(x / image.naturalWidth * grid));
      var row = Math.min(grid - 1, Math.floor(y / image.naturalHeight * grid));
      var patch = row * grid + col;
      this.params.selected_patch = String(patch);
      this.options.onParamChange('selected_patch', String(patch), this.params);
    }
  };

  InteractiveTeachingStage.prototype.updateInspectorForObject = function (obj) {
    this.nodes.title.textContent = obj.label || '对象详情';
    this.nodes.text.textContent = '这个对象来自后端返回的结构化输出。前端点击只负责定位和讲解，不会伪造结果。';
    this.renderFormula(obj.score == null ? 'object = backend_output' : 'object=(box,class,score)');
    this.renderData(obj.data || obj);
  };

  window.InteractiveTeachingStage = {
    mount: function (root, options) {
      return new InteractiveTeachingStage(root, options || {});
    },
    helpers: {
      extractBoxes: extractBoxes,
      extractPoints: extractPoints,
      extractMasks: extractMasks,
      drawMiniChart: drawMiniChart,
      formatValue: formatValue
    }
  };
}());
