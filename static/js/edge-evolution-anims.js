(function () {
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var sizes = {
    naive: { w: 520, h: 360 },
    edge: { w: 560, h: 380 },
    v1: { w: 560, h: 380 },
    v2: { w: 560, h: 360 }
  };

  var steps = [
    {
      id: 'naive',
      title: '朴素 Python',
      label: '四层 for 暴力',
      text: 'kernel 中心逐点扫完整张图，每个窗口都在 Python 层独立算。',
      formula: 'T=O(HWk^2)',
      tooltip: [
        '最直观：y / x / ky / kx 四层循环。',
        '最慢：每次乘加都要穿过 Python 解释器。'
      ]
    },
    {
      id: 'edge',
      title: 'edge.py',
      label: 'Zero Copy + 向量化',
      text: '3×3 kernel 扫到哪里，中间就高亮对应虚拟窗口；窗口不复制数据，最后交给 NumPy 底层 C 算。',
      formula: '\\mathrm{views}\\in\\mathbb{R}^{H_{out}\\times W_{out}\\times k_h\\times k_w}',
      tooltip: [
        '4D 的四个轴是输出高、输出宽、核高、核宽。',
        'sliding_window_view 主要创建视图，不把每个窗口复制成新数组。'
      ]
    },
    {
      id: 'v1',
      title: 'optimized v1',
      label: '可分离卷积',
      text: 'Gaussian 和 Sobel 都能拆成列向量乘行向量，二维卷积变两次一维卷积。',
      formula: 'K=a b^\\top,\\quad O(k^2)\\rightarrow O(2k)',
      tooltip: [
        '高斯核来自 exp(-(x^2+y^2)) = exp(-x^2)exp(-y^2)。',
        'Sobel 本质是一个方向差分，另一个方向平滑。'
      ]
    },
    {
      id: 'v2',
      title: 'optimized v2',
      label: '并行 + JIT',
      text: 'Gx/Gy 并行跑；NMS 和 hysteresis 这种循环热点交给 Numba 编译。',
      formula: '@njit(cache=True)',
      tooltip: [
        'Sobel 的 Gx 和 Gy 没有数据依赖，可以同时计算。',
        'JIT 不等于魔法融合所有内存 I/O，它主要是把逐像素热点编译成机器码。'
      ]
    }
  ];

  var pseudo = {
    naive: [
      '# naive Python',
      'for y in range(H):',
      '    for x in range(W):',
      '        acc = 0',
      '        for ky in range(kh):',
      '            for kx in range(kw):',
      '                acc += padded[y+ky, x+kx] * ker[ky, kx]',
      '        out[y, x] = acc'
    ].join('\n'),
    edge: [
      '# edge.py',
      'padded = pad(mat)',
      'views = sliding_window_view(padded, (kh, kw))',
      'out = np.sum(views * ker, axis=(2, 3))'
    ].join('\n'),
    v1: [
      '# optimized v1',
      'tmp = conv1d_vertical(mat, v_kernel)',
      'out = conv1d_horizontal(tmp, h_kernel)',
      '# K = v_kernel @ h_kernel'
    ].join('\n'),
    v2: [
      '# optimized v2',
      'sx_future = pool.submit(sobel_x)',
      'sy_future = pool.submit(sobel_y)',
      '',
      'sx = sx_future.result()',
      'sy = sy_future.result()',
      'norm, ang = magnitude_angle(sx, sy)',
      '',
      'sup = nms_jit(norm, ang)',
      'edge = hysteresis_jit(sup, low, high)'
    ].join('\n')
  };

  var staticFormulas = {
    naive: [
      {
        latex: 'T=O(HWk^2)',
        note: '每个输出点都要扫一个 k×k 小窗口，图越大、核越大，循环次数直接爆。'
      },
      {
        latex: 'N_{\\mathrm{op}}=H\\cdot W\\cdot k^2',
        note: '这就是四层 for 的乘法次数，Python 解释器会把这个开销放大很多。'
      }
    ],
    edge: [
      {
        latex: '\\mathrm{views}\\in\\mathbb{R}^{H_{out}\\times W_{out}\\times k_h\\times k_w}',
        note: '四个维度分别是输出高、输出宽、核高、核宽；它是视图，不是把窗口真的复制一堆。'
      },
      {
        latex: 'Y_{i,j}=\\sum_{u,v}\\mathrm{views}_{i,j,u,v}K_{u,v}',
        note: '每个窗口仍然做同一个卷积，只是这一步交给 NumPy 底层 C 一次性算。'
      }
    ],
    v2: [
      {
        latex: 'T_{\\mathrm{parallel}}\\approx\\max(T_{G_x},T_{G_y})',
        note: 'Gx 和 Gy 没有前后依赖，可以同时跑；总时间接近两条里更慢的那条。'
      },
      {
        latex: '\\mathrm{NMS},\\mathrm{hysteresis}\\xrightarrow{\\mathrm{JIT}}\\mathrm{machine\\ code}',
        note: 'NMS 和滞后连接还是循环逻辑，但热点不再由 Python 解释器逐像素执行。'
      }
    ]
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
  function linear(t) { return clamp(t, 0, 1); }
  function cycle(state, dt, duration) {
    state.time += dt;
    if (reducedMotion) return 0.62;
    return (state.time % duration) / duration;
  }
  function hex(v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); }
  function gray(v) {
    var x = hex(v * 255);
    return '#' + x + x + x;
  }
  function colorMix(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return '#' + hex(lerp(ar, br, t)) + hex(lerp(ag, bg, t)) + hex(lerp(ab, bb, t));
  }
  function alphaColor(color, alpha) { return color.replace('A', alpha); }
  function makeScanPath(rows, cols) {
    var out = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) out.push({ r: r, c: c });
    }
    return out;
  }
  function pathAt(path, t) {
    var idx = Math.min(path.length - 1, Math.floor(clamp(t, 0, 0.999999) * path.length));
    return { point: path[idx], index: idx };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function setupCanvas(canvas, id) {
    var size = sizes[id] || sizes.edge;
    var rect = canvas.parentElement.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width || size.w));
    var cssH = Math.max(1, Math.round(rect.height || (cssW * size.h / size.w)));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    var scale = cssW / size.w;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    return ctx;
  }

  function clearStage(ctx, id) {
    var size = sizes[id] || sizes.edge;
    ctx.clearRect(0, 0, size.w, size.h);
    roundedRect(ctx, 10, 10, size.w - 20, size.h - 20, 22);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (var x = 24; x < size.w; x += 20) {
      for (var y = 24; y < size.h; y += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 0.55, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.045)';
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function label(ctx, text, x, y, fill, size, weight, align) {
    ctx.save();
    ctx.font = (weight || 800) + ' ' + Math.max(11, size || 14) + 'px "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = solidText(fill || '#0f1f3d');
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function solidText(fill) {
    var m = String(fill || '').match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\s*\)$/);
    if (!m) return fill;
    return 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')';
  }

  function fitLabel(ctx, text, x, y, maxWidth, opt) {
    opt = opt || {};
    var size = Math.max(11, opt.size || 13);
    var weight = opt.weight || 800;
    var fill = solidText(opt.fill || '#0f1f3d');
    ctx.save();
    ctx.textAlign = opt.align || 'center';
    ctx.textBaseline = 'middle';
    while (size > 11) {
      ctx.font = weight + ' ' + size + 'px "Microsoft YaHei", system-ui, sans-serif';
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }
    ctx.font = weight + ' ' + size + 'px "Microsoft YaHei", system-ui, sans-serif';
    var out = text;
    while (ctx.measureText(out).width > maxWidth && out.length > 2) out = out.slice(0, -2) + '…';
    ctx.fillStyle = fill;
    ctx.fillText(out, x, y);
    ctx.restore();
  }

  function drawStatusBox(ctx, x, y, w, lines, color) {
    roundedRect(ctx, x, y, w, 26 + lines.length * 20, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fill();
    ctx.strokeStyle = color || 'rgba(15,23,42,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (var i = 0; i < lines.length; i++) {
      fitLabel(ctx, lines[i], x + w / 2, y + 20 + i * 20, w - 18, {
        fill: i === 0 ? (color || '#0f1f3d') : '#0f1f3d',
        size: i === 0 ? 13 : 12,
        weight: 900
      });
    }
  }

  function drawCell(ctx, x, y, size, fill, opt) {
    opt = opt || {};
    ctx.save();
    ctx.globalAlpha *= opt.alpha == null ? 1 : opt.alpha;
    if (opt.shadow) {
      ctx.shadowColor = opt.shadow;
      ctx.shadowBlur = opt.shadowBlur || 10;
    }
    roundedRect(ctx, x, y, size, size, opt.radius || 7);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = opt.stroke || 'rgba(255,255,255,0.5)';
    ctx.lineWidth = opt.lineWidth || 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawPanel(ctx, x, y, w, h, title, color) {
    roundedRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.fill();
    ctx.strokeStyle = color || 'rgba(15,23,42,0.1)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (title) label(ctx, title, x + w / 2, y + 20, color || '#0f1f3d', 13, 900);
  }

  function drawChip(ctx, text, x, y, w, active, color) {
    roundedRect(ctx, x, y, w, 28, 8);
    ctx.fillStyle = active ? color : 'rgba(255,255,255,0.72)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.12)';
    ctx.stroke();
    label(ctx, text, x + w / 2, y + 14, active ? '#fff' : 'rgba(15,31,61,0.72)', 12, 800);
  }

  function safeChipRow(ctx, chips, y, centerX, gap) {
    gap = gap == null ? 10 : gap;
    var total = -gap;
    for (var i = 0; i < chips.length; i++) total += chips[i].w + gap;
    var x = centerX - total / 2;
    for (var j = 0; j < chips.length; j++) {
      drawChip(ctx, chips[j].text, x, y, chips[j].w, chips[j].active, chips[j].color);
      x += chips[j].w + gap;
    }
  }

  function arrow(ctx, x1, y1, x2, y2, color, alpha, dashed) {
    var a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = alphaColor(color, alpha == null ? 1 : alpha);
    ctx.fillStyle = alphaColor(color, alpha == null ? 1 : alpha);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.58) * 8, y2 - Math.sin(a - 0.58) * 8);
    ctx.lineTo(x2 - Math.cos(a + 0.58) * 8, y2 - Math.sin(a + 0.58) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function realValue(r, c) {
    return clamp(0.18 + r * 0.11 + c * 0.06 + Math.sin((r + c) * 0.8) * 0.05, 0, 1);
  }

  function drawMatrix(ctx, x, y, rows, cols, cell, active, visited, opt) {
    opt = opt || {};
    var gap = opt.gap == null ? 4 : opt.gap;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var isActive = active && active.r === r && active.c === c;
        var seen = visited && visited[r + ':' + c];
        drawCell(ctx, x + c * (cell + gap), y + r * (cell + gap), cell, gray(realValue(r, c)), {
          radius: opt.radius || 6,
          alpha: opt.alpha == null ? 0.96 : opt.alpha,
          stroke: isActive ? (opt.activeStroke || 'rgba(14,165,233,0.95)') : (seen ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.45)'),
          lineWidth: isActive ? 2.3 : 1
        });
        if (seen) {
          ctx.beginPath();
          ctx.arc(x + c * (cell + gap) + cell / 2, y + r * (cell + gap) + cell / 2, 2.8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34,197,94,0.86)';
          ctx.fill();
        }
      }
    }
  }

  function drawKernelFrame(ctx, x, y, r, c, cell, rows, cols, color) {
    var gap = 4;
    var fx = x + c * (cell + gap) - gap / 2;
    var fy = y + r * (cell + gap) - gap / 2;
    var fw = cols * cell + (cols - 1) * gap + gap;
    var fh = rows * cell + (rows - 1) * gap + gap;
    ctx.save();
    roundedRect(ctx, fx, fy, fw, fh, 12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color.replace('0.9', '0.22');
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  }

  function initNaive(state) {
    state.time = 0;
    state.path = makeScanPath(5, 5);
    state.caption = '当前动作：3×3 kernel 匀速扫过 25 个真实像素中心';
  }

  function tickNaive(state, ctx, dt) {
    var t = cycle(state, dt, 8500);
    var pos = pathAt(state.path, linear(t));
    var visited = {};
    for (var i = 0; i <= pos.index; i++) visited[state.path[i].r + ':' + state.path[i].c] = true;

    clearStage(ctx, 'naive');
    fitLabel(ctx, '3×3 kernel 扫描', 260, 34, 220, { fill: '#0f1f3d', size: 15, weight: 900 });
    var x = 74, y = 58, cell = 30, gap = 4;
    for (var pr = 0; pr < 7; pr++) {
      for (var pc = 0; pc < 7; pc++) {
        var rr = clamp(pr - 1, 0, 4);
        var cc = clamp(pc - 1, 0, 4);
        var ghost = pr === 0 || pc === 0 || pr === 6 || pc === 6;
        drawCell(ctx, x + pc * (cell + gap), y + pr * (cell + gap), cell, gray(realValue(rr, cc)), {
          alpha: ghost ? 0.28 : 0.92,
          radius: 7,
          stroke: 'rgba(255,255,255,0.42)'
        });
      }
    }
    var center = { r: pos.point.r + 1, c: pos.point.c + 1 };
    drawKernelFrame(ctx, x, y, center.r - 1, center.c - 1, cell, 3, 3, 'rgba(239,68,68,0.9)');
    var inner = Math.floor((state.time / 110) % 9);
    var kr = Math.floor(inner / 3), kc = inner % 3;
    drawCell(ctx, x + (center.c - 1 + kc) * (cell + gap) + 5, y + (center.r - 1 + kr) * (cell + gap) + 5, cell - 10, 'rgba(255,255,255,0.42)', {
      stroke: 'rgba(239,68,68,0.34)',
      radius: 6
    });
    for (var j = 0; j <= pos.index; j++) {
      var p = state.path[j];
      ctx.beginPath();
      ctx.arc(x + (p.c + 1) * (cell + gap) + cell / 2, y + (p.r + 1) * (cell + gap) + cell / 2, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34,197,94,0.8)';
      ctx.fill();
    }
    drawStatusBox(ctx, 342, 96, 118, ['center', (pos.index + 1) + ' / 25'], '#dc2626');
    drawStatusBox(ctx, 342, 194, 118, ['Python', '逐次乘加'], '#991b1b');
    var active = Math.floor((state.time / 420) % 4);
    safeChipRow(ctx, [
      { text: 'y', w: 58, active: active === 0, color: '#dc2626' },
      { text: 'x', w: 58, active: active === 1, color: '#dc2626' },
      { text: 'ky', w: 58, active: active === 2, color: '#dc2626' },
      { text: 'kx', w: 58, active: active === 3, color: '#dc2626' }
    ], 314, 260, 12);
  }

  function initEdge(state) {
    state.time = 0;
    state.path = makeScanPath(5, 5);
    state.caption = '当前动作：3×3 kernel 扫过矩阵，并同步指向虚拟 4D view 中对应窗口';
  }

  function tinyWindow(ctx, x, y, size, active, alpha) {
    var cell = size / 3;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    roundedRect(ctx, x, y, size, size, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.54)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(14,165,233,0.8)' : 'rgba(14,165,233,0.22)';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        roundedRect(ctx, x + c * cell + 2, y + r * cell + 2, cell - 4, cell - 4, 3);
        ctx.fillStyle = active && r === 1 && c === 1 ? 'rgba(14,165,233,0.72)' : 'rgba(148,163,184,0.26)';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function tickEdge(state, ctx, dt) {
    var t = cycle(state, dt, 9000);
    var phase = t < 0.34 ? 0 : (t < 0.67 ? 1 : 2);
    var local = phase === 0 ? t / 0.34 : (phase === 1 ? (t - 0.34) / 0.33 : (t - 0.67) / 0.33);
    local = linear(local);
    var pos = pathAt(state.path, linear(t));

    clearStage(ctx, 'edge');
    drawPanel(ctx, 26, 48, 136, 240, '2D memory', 'rgba(15,23,42,0.18)');
    drawPanel(ctx, 190, 48, 180, 240, '4D view', 'rgba(14,165,233,0.26)');
    drawPanel(ctx, 398, 48, 136, 240, 'Vectorized', 'rgba(22,163,74,0.26)');

    var mX = 39, mY = 88, mCell = 13, mGap = 4;
    for (var pr = 0; pr < 7; pr++) {
      for (var pc = 0; pc < 7; pc++) {
        var rr = clamp(pr - 1, 0, 4);
        var cc = clamp(pc - 1, 0, 4);
        var ghost = pr === 0 || pc === 0 || pr === 6 || pc === 6;
        drawCell(ctx, mX + pc * (mCell + mGap), mY + pr * (mCell + mGap), mCell, gray(realValue(rr, cc)), {
          alpha: ghost ? 0.28 : 0.94,
          radius: 4,
          stroke: ghost ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.5)'
        });
      }
    }
    var center = { r: pos.point.r + 1, c: pos.point.c + 1 };
    drawKernelFrame(ctx, mX, mY, center.r - 1, center.c - 1, mCell, 3, 3, 'rgba(239,68,68,0.9)');
    ctx.beginPath();
    ctx.arc(mX + center.c * (mCell + mGap) + mCell / 2, mY + center.r * (mCell + mGap) + mCell / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34,197,94,0.88)';
    ctx.fill();
    label(ctx, 'padded mat', 94, 232, '#0f1f3d', 12, 900);
    fitLabel(ctx, 'window ' + (pos.index + 1) + ' / 25', 94, 256, 112, { fill: '#0284c7', size: 12, weight: 900 });

    var gridX = 211, gridY = 88, win = 24, step = 29;
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        var idx = r * 5 + c;
        var current = idx === pos.index;
        var seen = idx < pos.index;
        tinyWindow(ctx, gridX + c * step, gridY + r * step, win, current, current ? 1 : (seen ? 0.58 : 0.34));
      }
    }
    label(ctx, 'current virtual window', 280, 256, '#0369a1', 11, 900);

    var source = {
      x: mX + center.c * (mCell + mGap) + mCell / 2,
      y: mY + center.r * (mCell + mGap) + mCell / 2
    };
    var target = {
      x: gridX + pos.point.c * step + win / 2,
      y: gridY + pos.point.r * step + win / 2
    };
    arrow(ctx, source.x + 8, source.y, target.x - 12, target.y, 'rgba(14,165,233,A)', phase === 0 ? 0.72 : 0.42, true);

    var kerAlpha = phase >= 1 ? 1 : 0.28;
    label(ctx, 'ker', 464, 78, '#166534', 13, 900);
    for (var kr = 0; kr < 3; kr++) {
      for (var kc = 0; kc < 3; kc++) {
        drawCell(ctx, 430 + kc * 20, 94 + kr * 20, 16, kc === 1 && kr === 1 ? 'rgba(22,163,74,0.72)' : 'rgba(22,163,74,0.28)', {
          alpha: kerAlpha,
          radius: 4,
          stroke: 'rgba(22,163,74,0.34)'
        });
      }
    }
    arrow(ctx, 480, 166, 480, 196, 'rgba(22,163,74,A)', phase >= 1 ? 0.7 : 0.18);

    var flash = phase === 2 ? 0.45 + 0.35 * Math.sin(state.time / 90) : 0.18;
    for (var or = 0; or < 5; or++) {
      for (var oc = 0; oc < 5; oc++) {
        roundedRect(ctx, 426 + oc * 17, 206 + or * 13, 12, 9, 3);
        ctx.fillStyle = 'rgba(22,163,74,' + flash + ')';
        ctx.fill();
      }
    }
    label(ctx, 'sum', 465, 282, '#166534', 12, 900);

    safeChipRow(ctx, [
      { text: 'Zero Copy', w: 102, active: phase === 0, color: '#0284c7' },
      { text: 'Broadcast', w: 104, active: phase === 1, color: '#0f766e' },
      { text: 'All at once', w: 112, active: phase === 2, color: '#16a34a' }
    ], 318, 280, 14);
  }

  function initV1(state) {
    state.time = 0;
    state.kernel = 'gaussian';
    state.caption = '当前动作：Gaussian 5×5 直接卷积和两次一维卷积结果一致';
  }

  function kernelData(kind) {
    if (kind === 'gaussian') {
      return {
        title: 'Gaussian 5×5',
        col: [1, 4, 6, 4, 1],
        row: [1, 4, 6, 4, 1],
        scale: 256,
        img: [
          [2, 4, 5, 6, 3],
          [3, 6, 8, 7, 4],
          [1, 7, 9, 5, 6],
          [4, 5, 6, 8, 7],
          [2, 3, 7, 4, 5]
        ],
        meaningA: '竖向平滑',
        meaningB: '横向平滑',
        directOps: 25,
        separableOps: 10,
        formula: [
          {
            latex: 'g=\\begin{bmatrix}1&4&6&4&1\\end{bmatrix}',
            note: '这就是一维平滑核，横向用一次，竖向再用一次。'
          },
          {
            latex: 'G=\\frac{1}{256}g^\\top g',
            note: '二维高斯就是横向平滑和竖向平滑的组合，所以可以拆。除以 256 是归一化，让亮度别整体变大。'
          },
          {
            latex: 'O(k^2)\\rightarrow O(2k)',
            note: '每个点从看 k×k 个数，变成先看一列再看一行。'
          }
        ]
      };
    }
    return {
      title: 'Sobel Gx',
      col: [1, 2, 1],
      row: [-1, 0, 1],
      scale: 1,
      img: [
        [2, 4, 5],
        [3, 6, 8],
        [1, 7, 9]
      ],
      meaningA: '竖向平滑',
      meaningB: '横向差分',
      directOps: 9,
      separableOps: 6,
      formula: [
        {
          latex: 'G_x=\\begin{bmatrix}1\\\\2\\\\1\\end{bmatrix}\\begin{bmatrix}-1&0&1\\end{bmatrix}',
          note: '先竖向平滑压噪声，再横向做差分找左右边缘。'
        },
        {
          latex: 'G_y=\\begin{bmatrix}-1\\\\0\\\\1\\end{bmatrix}\\begin{bmatrix}1&2&1\\end{bmatrix}',
          note: '先竖向做差分，再横向平滑，找上下边缘。'
        },
        {
          latex: 'O(9)\\rightarrow O(6)',
          note: '3×3 原本看 9 个数，拆开后先看 3 个，再看 3 个。'
        }
      ]
    };
  }

  function drawNumberCell(ctx, x, y, w, h, text, fill, stroke) {
    roundedRect(ctx, x, y, w, h, 7);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke || 'rgba(15,23,42,0.1)';
    ctx.stroke();
    label(ctx, String(text), x + w / 2, y + h / 2, '#0f1f3d', Math.min(13, Math.max(9, h * 0.48)), 900);
  }

  function drawBadge(ctx, text, x, y, w, color) {
    roundedRect(ctx, x, y, w, 24, 8);
    ctx.fillStyle = color || '#0f766e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();
    fitLabel(ctx, text, x + w / 2, y + 12, w - 12, {
      fill: '#fff',
      size: 11,
      weight: 900
    });
  }

  function drawMiniMatrix(ctx, matrix, x, y, cell, gap, activeIndex) {
    for (var r = 0; r < matrix.length; r++) {
      for (var c = 0; c < matrix[r].length; c++) {
        var idx = r * matrix[r].length + c;
        drawNumberCell(
          ctx,
          x + c * (cell + gap),
          y + r * (cell + gap),
          cell,
          cell,
          matrix[r][c],
          idx === activeIndex ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.78)',
          'rgba(15,23,42,0.12)'
        );
      }
    }
  }

  function drawMiniVectorRow(ctx, values, x, y, cell, gap, fill, stroke) {
    for (var i = 0; i < values.length; i++) {
      drawNumberCell(ctx, x + i * (cell + gap), y, cell, cell, values[i], fill, stroke);
    }
  }

  function tickV1(state, ctx, dt) {
    var t = cycle(state, dt, 7800);
    var data = kernelData(state.kernel || 'sobel');
    var img = data.img;
    var n = data.col.length;
    var k2 = [];
    var direct = 0;
    for (var r = 0; r < n; r++) {
      k2[r] = [];
      for (var c = 0; c < n; c++) {
        k2[r][c] = data.col[r] * data.row[c];
        direct += img[r][c] * k2[r][c];
      }
    }
    var tmp = [];
    for (var cc = 0; cc < n; cc++) {
      var v = 0;
      for (var rr0 = 0; rr0 < n; rr0++) v += img[rr0][cc] * data.col[rr0];
      tmp[cc] = v;
    }
    var sep = 0;
    for (var tc0 = 0; tc0 < n; tc0++) sep += tmp[tc0] * data.row[tc0];
    if (data.scale !== 1) {
      direct = Number((direct / data.scale).toFixed(4));
      sep = Number((sep / data.scale).toFixed(4));
    }

    clearStage(ctx, 'v1');
    label(ctx, data.title + ' 核拆解', 280, 32, '#0f1f3d', 15, 900);

    var top = n === 5
      ? { x: 54, y: 56, cell: 17, gap: 4, rowX: 122, matX: 294, opX: 94, eqX: 262 }
      : { x: 70, y: 68, cell: 25, gap: 6, rowX: 130, matX: 310, opX: 112, eqX: 268 };
    for (var a = 0; a < n; a++) {
      drawNumberCell(ctx, top.x, top.y + a * (top.cell + top.gap), top.cell, top.cell, data.col[a], 'rgba(20,184,166,0.18)', 'rgba(20,184,166,0.32)');
    }
    label(ctx, '×', top.opX, 104, '#0f1f3d', 16, 900);
    drawMiniVectorRow(ctx, data.row, top.rowX, top.y + Math.floor(n / 2) * (top.cell + top.gap), top.cell, top.gap, 'rgba(22,163,74,0.18)', 'rgba(22,163,74,0.32)');
    label(ctx, '=', top.eqX, 104, '#0f1f3d', 16, 900);
    for (var rr = 0; rr < n; rr++) {
      for (var cc2 = 0; cc2 < n; cc2++) {
        drawNumberCell(ctx, top.matX + cc2 * (top.cell + top.gap), top.y + rr * (top.cell + top.gap), top.cell, top.cell, k2[rr][cc2], 'rgba(14,165,233,0.14)', 'rgba(14,165,233,0.28)');
      }
    }

    drawPanel(ctx, 34, 196, 236, 128, 'A: 直接 2D 卷积', 'rgba(100,116,139,0.2)');
    drawPanel(ctx, 290, 196, 236, 128, 'B: 分离卷积', 'rgba(22,163,74,0.2)');
    var active = Math.floor(linear(t) * n * n) % (n * n);
    var left = n === 5
      ? { gridX: 58, gridY: 232, cell: 15, gap: 3, badgeX: 186, outX: 190, outY: 292 }
      : { gridX: 66, gridY: 232, cell: 25, gap: 5, badgeX: 184, outX: 190, outY: 292 };
    drawMiniMatrix(ctx, img, left.gridX, left.gridY, left.cell, left.gap, active);
    drawBadge(ctx, data.directOps + ' ops', left.badgeX, 216, 62, '#64748b');
    fitLabel(ctx, 'out = ' + direct, left.outX, left.outY, 120, {
      fill: '#0f1f3d',
      size: 16,
      weight: 900
    });

    var right = n === 5
      ? { tmpX: 310, tmpY: 234, tmpCell: 30, tmpGap: 6, badgeX: 448, outY: 296 }
      : { tmpX: 324, tmpY: 234, tmpCell: 38, tmpGap: 12, badgeX: 448, outY: 296 };
    drawBadge(ctx, data.separableOps + ' ops', right.badgeX, 216, 62, '#16a34a');
    drawMiniVectorRow(ctx, tmp, right.tmpX, right.tmpY, right.tmpCell, right.tmpGap, 'rgba(20,184,166,0.18)', 'rgba(20,184,166,0.32)');
    arrow(ctx, 408, 263, 408, 279, 'rgba(22,163,74,A)', 0.74);
    fitLabel(ctx, 'out = ' + sep, 408, right.outY, 136, {
      fill: direct === sep ? '#16a34a' : '#dc2626',
      size: 16,
      weight: 900
    });
  }

  function initV2(state) {
    state.time = 0;
    state.caption = '当前动作：上轨串行执行，下轨 Gx/Gy 并行；后半段循环热点进入 JIT';
  }

  function timelineBlock(ctx, x, y, w, h, text, color, progress) {
    roundedRect(ctx, x, y, w, h, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
    ctx.strokeStyle = alphaColor(color, 0.3);
    ctx.stroke();
    if (progress > 0) {
      roundedRect(ctx, x, y, w * clamp(progress, 0, 1), h, 9);
      ctx.fillStyle = alphaColor(color, 0.78);
      ctx.fill();
    }
    label(ctx, text, x + w / 2, y + h / 2, progress > 0.5 ? '#fff' : '#0f1f3d', 12, 900);
  }

  function phaseProgress(t, start, end) {
    return clamp((t - start) / (end - start), 0, 1);
  }

  function tickV2(state, ctx, dt) {
    var t = cycle(state, dt, 7600);
    t = linear(t);
    clearStage(ctx, 'v2');
    label(ctx, 'Sequential', 172, 42, '#64748b', 14, 900);
    label(ctx, 'Parallel + JIT', 388, 42, '#166534', 14, 900);

    drawPanel(ctx, 32, 64, 496, 100, '', 'rgba(100,116,139,0.18)');
    drawPanel(ctx, 32, 196, 496, 100, '', 'rgba(22,163,74,0.22)');

    label(ctx, '串行', 62, 92, '#64748b', 12, 900);
    timelineBlock(ctx, 100, 78, 94, 28, 'Gx', 'rgba(14,165,233,A)', phaseProgress(t, 0.00, 0.25));
    timelineBlock(ctx, 198, 78, 94, 28, 'Gy', 'rgba(239,68,68,A)', phaseProgress(t, 0.25, 0.50));
    timelineBlock(ctx, 318, 78, 70, 28, 'NMS', 'rgba(100,116,139,A)', phaseProgress(t, 0.58, 0.76));
    timelineBlock(ctx, 392, 78, 90, 28, 'Hys', 'rgba(100,116,139,A)', phaseProgress(t, 0.76, 1.00));
    label(ctx, 'write', 306, 123, '#dc2626', 11, 900);
    arrow(ctx, 292, 106, 318, 106, 'rgba(239,68,68,A)', 0.62, true);
    label(ctx, 'read', 396, 123, '#dc2626', 11, 900);
    arrow(ctx, 388, 106, 392, 106, 'rgba(239,68,68,A)', 0.62, true);
    drawStatusBox(ctx, 214, 128, 132, ['memory I/O'], '#991b1b');

    label(ctx, '并行', 62, 226, '#166534', 12, 900);
    timelineBlock(ctx, 100, 212, 148, 24, 'Gx Thread', 'rgba(14,165,233,A)', phaseProgress(t, 0.00, 0.38));
    timelineBlock(ctx, 100, 246, 148, 24, 'Gy Thread', 'rgba(239,68,68,A)', phaseProgress(t, 0.00, 0.38));
    arrow(ctx, 258, 242, 296, 242, 'rgba(22,163,74,A)', 0.68);
    timelineBlock(ctx, 304, 222, 164, 38, 'JIT block', 'rgba(22,163,74,A)', phaseProgress(t, 0.42, 1.00));
    label(ctx, 'NMS + Hys', 386, 278, '#166534', 12, 900);

    roundedRect(ctx, 376, 128, 92, 24, 8);
    ctx.fillStyle = 'rgba(239,68,68,0.1)';
    ctx.fill();
    label(ctx, 'no overlap', 422, 140, '#991b1b', 11, 800);

    roundedRect(ctx, 108, 308, 156, 30, 8);
    ctx.fillStyle = 'rgba(14,165,233,0.1)';
    ctx.fill();
    label(ctx, 'Gx/Gy overlap', 186, 323, '#075985', 12, 900);
    roundedRect(ctx, 292, 308, 170, 30, 8);
    ctx.fillStyle = 'rgba(22,163,74,0.1)';
    ctx.fill();
    label(ctx, 'compiled loops', 377, 323, '#166534', 12, 900);
  }

  var inits = { naive: initNaive, edge: initEdge, v1: initV1, v2: initV2 };
  var ticks = { naive: tickNaive, edge: tickEdge, v1: tickV1, v2: tickV2 };

  function initState(id) {
    var state = {};
    if (inits[id]) inits[id](state);
    return state;
  }
  function tick(id, state, ctx, dt) {
    if (ticks[id]) ticks[id](state, ctx, dt);
  }
  function getCaption(id, state) {
    if (id === 'v1') {
      return state && state.kernel === 'sobel'
        ? '当前动作：Sobel 3×3 直接卷积和两次一维卷积结果一致'
        : '当前动作：Gaussian 5×5 直接卷积和两次一维卷积结果一致';
    }
    return state && state.caption ? state.caption : '';
  }
  function getPseudoCode(id) {
    return pseudo[id] || '';
  }
  function getFormula(id, state) {
    if (id === 'v1') return kernelData(state && state.kernel === 'sobel' ? 'sobel' : 'gaussian').formula;
    return staticFormulas[id] || [];
  }
  function getMetrics(id, state) {
    if (id === 'naive') return ['四层循环', '每窗口独立计算'];
    if (id === 'edge') return ['Zero Copy', '1 次向量化求和'];
    if (id === 'v1') {
      var data = kernelData(state && state.kernel === 'sobel' ? 'sobel' : 'gaussian');
      return [data.title, data.directOps + ' ops -> ' + data.separableOps + ' ops'];
    }
    if (id === 'v2') return ['Gx / Gy 并行', 'NMS / hysteresis JIT'];
    return [];
  }
  function setOption(id, state, key, value) {
    if (id === 'v1' && key === 'kernel') state.kernel = value;
  }

  window.EdgeEvolutionAnims = {
    sizes: sizes,
    steps: steps,
    setupCanvas: setupCanvas,
    initState: initState,
    tick: tick,
    getCaption: getCaption,
    getPseudoCode: getPseudoCode,
    getFormula: getFormula,
    getMetrics: getMetrics,
    setOption: setOption,
    _debugCoverage: {
      naive: makeScanPath(5, 5).length,
      edgeViewWindows: makeScanPath(5, 5).length,
      edgeBroadcastTargets: makeScanPath(5, 5).length,
      v1GaussianDirectOps: 25,
      v1GaussianSeparableOps: 10,
      v1SobelDirectOps: 9,
      v1SobelSeparableOps: 6
    }
  };
})();
