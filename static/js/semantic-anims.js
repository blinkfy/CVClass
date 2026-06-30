(function() {
  var BASE = 320;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function setupCanvas(canvas) {
    var rect = canvas.parentElement.getBoundingClientRect();
    var css = Math.max(1, Math.round(rect.width || BASE));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    var ctx = canvas.getContext('2d');
    var scale = css / BASE;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    return ctx;
  }

  function init(state) {
    state.t = 0;
  }

  function cycle(state, dt, duration) {
    state.t += dt;
    if (reducedMotion) return 0.62;
    return (state.t % duration) / duration;
  }

  function clear(ctx) {
    ctx.clearRect(0, 0, BASE, BASE);
    var grad = ctx.createLinearGradient(0, 0, BASE, BASE);
    grad.addColorStop(0, '#07111f');
    grad.addColorStop(1, '#101827');
    ctx.fillStyle = grad;
    roundRect(ctx, 8, 8, BASE - 16, BASE - 16, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function label(ctx, text, x, y, color) {
    ctx.fillStyle = color || 'rgba(226,232,240,0.86)';
    ctx.font = '700 10px Cascadia Code, Consolas, monospace';
    ctx.fillText(text, x, y);
  }

  function drawGrid(ctx, x, y, rows, cols, cell, gap, fillFn, stroke) {
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        ctx.fillStyle = fillFn(r, c);
        roundRect(ctx, x + c * (cell + gap), y + r * (cell + gap), cell, cell, 4);
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  function tickCorner(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5200);
    var idx = Math.min(24, Math.floor(p * 25));
    var row = Math.floor(idx / 5) + 1;
    var col = (idx % 5) + 1;
    var x0 = 32, y0 = 42, cell = 21, gap = 3;
    label(ctx, 'Shi-Tomasi: scan + tensor score', 24, 28, '#bae6fd');
    drawGrid(ctx, x0, y0, 7, 7, cell, gap, function(r, c) {
      var bright = (c >= 3 && r <= 3) || (c >= 3 && r >= 3);
      var cornerBoost = Math.abs(r - 3) + Math.abs(c - 3) < 2;
      if (cornerBoost) return '#f8fafc';
      return bright ? '#cbd5e1' : '#172033';
    }, 'rgba(255,255,255,0.08)');

    var wx = x0 + col * (cell + gap);
    var wy = y0 + row * (cell + gap);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    roundRect(ctx, wx, wy, cell * 3 + gap * 2, cell * 3 + gap * 2, 9);
    ctx.stroke();

    var cx = col + 1, cy = row + 1;
    var dx = Math.abs(cx - 3), dy = Math.abs(cy - 3);
    var l1 = clamp(1 - dx / 3, 0.08, 1);
    var l2 = clamp(1 - dy / 3, 0.08, 1);
    var score = Math.min(l1, l2);
    var bx = 214, by = 74;
    label(ctx, 'lambda1', bx, by - 8);
    label(ctx, 'lambda2', bx, by + 42);
    bar(ctx, bx, by, 72, l1, '#38bdf8');
    bar(ctx, bx, by + 50, 72, l2, '#66f2c2');
    ctx.fillStyle = score > 0.62 ? '#fb7185' : 'rgba(148,163,184,0.32)';
    roundRect(ctx, bx, by + 106, 78, 34, 10);
    ctx.fill();
    label(ctx, score > 0.62 ? 'KEEP' : 'reject', bx + 17, by + 128, '#fff7ed');
    label(ctx, 'score = min(lambda1, lambda2)', 38, 252, '#cbd5e1');
  }

  function bar(ctx, x, y, width, value, color) {
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    roundRect(ctx, x, y, width, 16, 8);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x, y, width * clamp(value, 0, 1), 16, 8);
    ctx.fill();
  }

  function tickHough(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    var active = Math.min(4, Math.floor(p * 5));
    label(ctx, 'Hough: edge votes -> accumulator', 22, 28, '#bae6fd');
    var pts = [[48, 196], [78, 174], [108, 152], [138, 130]];
    ctx.strokeStyle = 'rgba(102,242,194,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(34, 208);
    ctx.lineTo(152, 120);
    ctx.stroke();
    for (var i = 0; i < pts.length; i += 1) {
      ctx.fillStyle = i <= active ? '#f8fafc' : 'rgba(148,163,184,0.35)';
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 5, 0, Math.PI * 2);
      ctx.fill();
      if (i === active) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    label(ctx, 'image space', 48, 232);
    label(ctx, 'vote', 154, 158, '#66f2c2');

    var ax = 194, ay = 66, cols = 6, rows = 6, cell = 15, gap = 4;
    drawGrid(ctx, ax, ay, rows, cols, cell, gap, function(r, c) {
      var dist = Math.abs(r - 2) + Math.abs(c - 4);
      var votes = Math.max(0, active + 1 - dist);
      var alpha = 0.12 + votes * 0.18;
      return 'rgba(102,242,194,' + clamp(alpha, 0.08, 0.92).toFixed(2) + ')';
    }, 'rgba(255,255,255,0.08)');
    var peakX = ax + 4 * (cell + gap) + cell / 2;
    var peakY = ay + 2 * (cell + gap) + cell / 2;
    ctx.fillStyle = 'rgba(251,113,133,0.85)';
    ctx.beginPath();
    ctx.arc(peakX, peakY, 7 + active * 1.2, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'accumulator', 204, 205);
    label(ctx, 'peak = supported line', 176, 252, '#fecdd3');
  }

  function tickMorph(mode, state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    var idx = Math.min(35, Math.floor(p * 36));
    var sr = Math.floor(idx / 6);
    var sc = idx % 6;
    var grid = [
      [0,0,0,0,0,0,0,0],
      [0,0,1,1,1,0,0,0],
      [0,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,0,0],
      [0,0,1,1,1,0,0,0],
      [0,0,0,1,0,0,0,0],
      [0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0]
    ];
    label(ctx, mode === 'erode' ? 'Erosion: all kernel cells hit' : 'Dilation: any kernel cell hits', 20, 28, '#bae6fd');
    var x = 32, y = 62, cell = 13, gap = 3;
    drawGrid(ctx, x, y, 8, 8, cell, gap, function(r, c) {
      return grid[r][c] ? '#66f2c2' : '#172033';
    }, 'rgba(255,255,255,0.08)');
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    roundRect(ctx, x + sc * (cell + gap), y + sr * (cell + gap), cell * 3 + gap * 2, cell * 3 + gap * 2, 8);
    ctx.stroke();

    var ox = 178, oy = 62;
    drawGrid(ctx, ox, oy, 8, 8, cell, gap, function(r, c) {
      if (r < 1 || c < 1 || r > 6 || c > 6) return '#0f172a';
      var order = (r - 1) * 6 + (c - 1);
      if (order > idx) return 'rgba(15,23,42,0.65)';
      var hit = morphValue(grid, r, c, mode);
      return hit ? (mode === 'erode' ? '#38bdf8' : '#fb7185') : '#172033';
    }, 'rgba(255,255,255,0.08)');
    label(ctx, 'input', 74, 218);
    label(ctx, 'output scan', 210, 218);
  }

  function morphValue(grid, r, c, mode) {
    var any = false;
    for (var dy = -1; dy <= 1; dy += 1) {
      for (var dx = -1; dx <= 1; dx += 1) {
        var v = grid[r + dy][c + dx] === 1;
        any = any || v;
        if (mode === 'erode' && !v) return false;
      }
    }
    return mode === 'erode' ? true : any;
  }

  function tickContour(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    var pts = [[92,66],[140,76],[166,114],[154,162],[110,190],[66,172],[48,126],[60,88]];
    var count = Math.max(1, Math.floor(p * (pts.length + 1)));
    label(ctx, 'Contour: boundary -> ordered points', 22, 28, '#bae6fd');
    ctx.fillStyle = 'rgba(56,189,248,0.18)';
    ctx.strokeStyle = 'rgba(56,189,248,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var j = 1; j < count && j < pts.length; j += 1) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.stroke();
    var cur = pts[Math.min(count - 1, pts.length - 1)];
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cur[0], cur[1], 7, 0, Math.PI * 2);
    ctx.fill();

    label(ctx, 'point sequence', 200, 82);
    for (var k = 0; k < pts.length; k += 1) {
      ctx.fillStyle = k < count ? '#66f2c2' : 'rgba(148,163,184,0.25)';
      roundRect(ctx, 202, 98 + k * 18, 54, 12, 6);
      ctx.fill();
    }
    label(ctx, 'area / perimeter / bbox', 72, 254, '#cbd5e1');
  }

  function tickTemplate(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 6200);
    var idx = Math.min(24, Math.floor(p * 25));
    var row = Math.floor(idx / 5);
    var col = idx % 5;
    label(ctx, 'Template: raster scan + response', 20, 28, '#bae6fd');
    var x = 32, y = 52, w = 130, h = 130;
    var grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#102033');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.fillStyle = '#fb7185';
    roundRect(ctx, x + 82, y + 82, 32, 28, 8);
    ctx.fill();

    var wx = x + col * 18;
    var wy = y + row * 18;
    ctx.strokeStyle = '#66f2c2';
    ctx.lineWidth = 2;
    roundRect(ctx, wx, wy, 44, 38, 9);
    ctx.stroke();
    label(ctx, 'scan window', 52, 204);

    ctx.fillStyle = '#fb7185';
    roundRect(ctx, 206, 58, 50, 42, 10);
    ctx.fill();
    label(ctx, 'template', 206, 118);

    var hx = 196, hy = 146, cell = 14, gap = 4;
    drawGrid(ctx, hx, hy, 5, 5, cell, gap, function(r, c) {
      var order = r * 5 + c;
      if (order > idx) return 'rgba(15,23,42,0.7)';
      var d = Math.abs(r - 4) + Math.abs(c - 4);
      var alpha = 0.12 + Math.max(0, 5 - d) * 0.13;
      return 'rgba(251,113,133,' + alpha.toFixed(2) + ')';
    }, 'rgba(255,255,255,0.08)');
    label(ctx, 'response', 204, 252);
  }

  function tickKMeans(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    var iter = Math.floor(p * 4);
    label(ctx, 'K-Means: assign pixels to nearest color center', 18, 28, '#bae6fd');
    var centers = [[76 + iter * 9, 88, '#ef4444'], [142 - iter * 6, 152, '#22c55e'], [92, 202 - iter * 8, '#38bdf8']];
    for (var i = 0; i < 44; i += 1) {
      var x = 42 + (i * 37 % 132);
      var y = 58 + (i * 53 % 164);
      var best = 0, bd = Infinity;
      for (var c = 0; c < centers.length; c += 1) {
        var dx = x - centers[c][0], dy = y - centers[c][1];
        var d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = c; }
      }
      ctx.fillStyle = centers[best][2];
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    centers.forEach(function(c) {
      ctx.fillStyle = c[2];
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c[0], c[1], 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    label(ctx, 'assign -> update center', 184, 92, '#cbd5e1');
    label(ctx, 'iteration ' + String(iter + 1), 202, 126, '#66f2c2');
    label(ctx, 'output: color regions', 184, 214, '#fecdd3');
  }

  function tickWatershed(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    label(ctx, 'Watershed: flood basins until fronts meet', 20, 28, '#bae6fd');
    var basins = [[88,150,'#38bdf8'], [156,116,'#66f2c2'], [136,196,'#fb7185']];
    ctx.strokeStyle = 'rgba(248,250,252,0.12)';
    for (var r = 0; r < 7; r += 1) {
      ctx.beginPath(); ctx.moveTo(42, 62 + r * 24); ctx.lineTo(194, 62 + r * 24); ctx.stroke();
    }
    basins.forEach(function(b, idx) {
      var rad = 10 + p * 58 + idx * 3;
      var g = ctx.createRadialGradient(b[0], b[1], 4, b[0], b[1], rad);
      g.addColorStop(0, b[2]);
      g.addColorStop(1, 'rgba(15,23,42,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b[0], b[1], rad, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(b[0], b[1], 5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(112, 76); ctx.bezierCurveTo(128, 126, 116, 176, 102, 224); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(172, 72); ctx.bezierCurveTo(150, 122, 170, 172, 190, 220); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'markers', 220, 94, '#66f2c2');
    label(ctx, 'ridges = boundaries', 184, 230, '#f8fafc');
  }

  function tickGrabCut(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 6200);
    var phase = Math.floor(p * 4);
    label(ctx, 'GrabCut: rectangle -> color models -> mask', 20, 28, '#bae6fd');
    ctx.fillStyle = '#1e293b'; roundRect(ctx, 42, 58, 126, 126, 14); ctx.fill();
    ctx.fillStyle = '#fb7185'; roundRect(ctx, 82, 86, 42, 58, 16); ctx.fill();
    ctx.strokeStyle = '#66f2c2'; ctx.lineWidth = 2; roundRect(ctx, 62, 72, 86, 92, 8); ctx.stroke();
    label(ctx, 'user rectangle', 54, 202, '#66f2c2');
    var mx = 210, my = 72;
    label(ctx, 'FG model', mx, my, '#fecdd3');
    bar(ctx, mx, my + 10, 70, phase >= 1 ? 0.82 : 0.3, '#fb7185');
    label(ctx, 'BG model', mx, my + 48, '#bae6fd');
    bar(ctx, mx, my + 58, 70, phase >= 1 ? 0.7 : 0.25, '#38bdf8');
    ctx.fillStyle = phase >= 2 ? 'rgba(251,113,133,0.35)' : 'rgba(148,163,184,0.16)';
    roundRect(ctx, 206, 168, 76, 48, 14); ctx.fill();
    label(ctx, phase >= 2 ? 'refined mask' : 'estimate', 210, 236, '#cbd5e1');
  }

  function tickSlic(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    label(ctx, 'SLIC: local K-Means in Lab + xy space', 20, 28, '#bae6fd');
    var x0 = 42, y0 = 54, cell = 20;
    for (var y = 0; y < 8; y += 1) {
      for (var x = 0; x < 8; x += 1) {
        ctx.fillStyle = x < 4 ? '#38bdf8' : '#fb7185';
        ctx.globalAlpha = 0.28 + 0.04 * y;
        roundRect(ctx, x0 + x * cell, y0 + y * cell, cell - 2, cell - 2, 4); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (var gy = 0; gy < 3; gy += 1) {
      for (var gx = 0; gx < 3; gx += 1) {
        var cx = x0 + 30 + gx * 50 + Math.sin(p * Math.PI * 2 + gx) * 5;
        var cy = y0 + 30 + gy * 50 + Math.cos(p * Math.PI * 2 + gy) * 5;
        ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
      }
    }
    label(ctx, 'centers move locally', 184, 94, '#66f2c2');
    label(ctx, 'compactness balances', 184, 128, '#cbd5e1');
    label(ctx, 'color vs position', 184, 146, '#cbd5e1');
  }

  function tickHog(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5200);
    label(ctx, 'HOG: gradients vote into orientation bins', 20, 28, '#bae6fd');
    var cx = 92, cy = 128;
    for (var i = 0; i < 9; i += 1) {
      var a = i * Math.PI / 9;
      var len = 18 + 22 * Math.abs(Math.sin(p * Math.PI * 2 + i));
      ctx.strokeStyle = i === 2 || i === 6 ? '#66f2c2' : 'rgba(148,163,184,0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    label(ctx, 'cell histogram', 188, 70, '#cbd5e1');
    for (var b = 0; b < 9; b += 1) {
      var h = 14 + 46 * Math.abs(Math.sin(p * Math.PI * 2 + b * 0.7));
      ctx.fillStyle = b === 2 || b === 6 ? '#66f2c2' : '#38bdf8';
      roundRect(ctx, 184 + b * 11, 168 - h, 7, h, 4); ctx.fill();
    }
    label(ctx, 'block normalize -> feature vector', 88, 238, '#fecdd3');
  }

  function tickOpticalFlow(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5200);
    label(ctx, 'Optical flow: local brightness constancy', 20, 28, '#bae6fd');
    var shift = 8 + Math.sin(p * Math.PI * 2) * 4;
    ctx.fillStyle = '#1e293b'; roundRect(ctx, 42, 64, 86, 86, 12); ctx.fill();
    ctx.fillStyle = '#66f2c2'; roundRect(ctx, 72, 92, 28, 28, 8); ctx.fill();
    ctx.fillStyle = '#1e293b'; roundRect(ctx, 168, 64, 86, 86, 12); ctx.fill();
    ctx.fillStyle = '#66f2c2'; roundRect(ctx, 198 + shift, 96, 28, 28, 8); ctx.fill();
    label(ctx, 'frame t', 60, 170);
    label(ctx, 'frame t+1', 184, 170);
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(92, 214); ctx.lineTo(92 + shift * 3, 214); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(92 + shift * 3, 214); ctx.lineTo(92 + shift * 3 - 8, 209); ctx.lineTo(92 + shift * 3 - 8, 219); ctx.fillStyle = '#facc15'; ctx.fill();
    label(ctx, 'solve [Ix Iy] [u v] = -It', 154, 218, '#cbd5e1');
  }

  function tickStereo(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    var d = Math.floor(p * 6);
    label(ctx, 'Stereo: search along epipolar row', 20, 28, '#bae6fd');
    ctx.fillStyle = '#102033'; roundRect(ctx, 38, 62, 110, 84, 12); ctx.fill();
    ctx.fillStyle = '#102033'; roundRect(ctx, 174, 62, 110, 84, 12); ctx.fill();
    ctx.fillStyle = '#fb7185'; roundRect(ctx, 86, 92, 24, 22, 6); ctx.fill();
    ctx.fillStyle = '#fb7185'; roundRect(ctx, 222 - d * 7, 92, 24, 22, 6); ctx.fill();
    ctx.strokeStyle = '#66f2c2'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(48, 103); ctx.lineTo(274, 103); ctx.stroke();
    label(ctx, 'left patch', 58, 164);
    label(ctx, 'right search', 188, 164);
    label(ctx, 'disparity d = xL - xR', 86, 226, '#fecdd3');
    bar(ctx, 184, 212, 72, d / 5, '#fb7185');
  }

  function tickNcuts(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    label(ctx, 'Normalized Cuts: weak links become cut', 20, 28, '#bae6fd');
    var nodes = [[70,90],[104,78],[88,128],[138,110],[196,92],[232,118],[204,158],[248,166]];
    for (var i = 0; i < nodes.length; i += 1) {
      for (var j = i + 1; j < nodes.length; j += 1) {
        var same = (i < 4 && j < 4) || (i >= 4 && j >= 4);
        ctx.strokeStyle = same ? 'rgba(102,242,194,0.32)' : 'rgba(251,113,133,' + (0.18 + p * 0.22).toFixed(2) + ')';
        ctx.lineWidth = same ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[j][0], nodes[j][1]); ctx.stroke();
      }
    }
    nodes.forEach(function(n, i) { ctx.fillStyle = i < 4 ? '#38bdf8' : '#fb7185'; ctx.beginPath(); ctx.arc(n[0], n[1], 7, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(166, 62); ctx.lineTo(166, 204); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'min cut / assoc', 110, 246, '#facc15');
  }

  function tickBovw(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    var active = Math.floor(p * 12);
    label(ctx, 'BoVW + SPM: descriptors -> words -> pooled hist', 16, 28, '#bae6fd');
    for (var i = 0; i < 12; i += 1) {
      var x = 42 + (i % 4) * 32, y = 62 + Math.floor(i / 4) * 32;
      ctx.fillStyle = i <= active ? ['#38bdf8','#66f2c2','#fb7185'][i % 3] : 'rgba(148,163,184,0.24)';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
    label(ctx, 'visual words', 190, 76);
    for (var b = 0; b < 6; b += 1) { bar(ctx, 188, 88 + b * 20, 72, ((active + b) % 6 + 1) / 6, ['#38bdf8','#66f2c2','#fb7185'][b % 3]); }
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; roundRect(ctx, 42, 180, 88, 54, 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(86,180); ctx.lineTo(86,234); ctx.moveTo(42,207); ctx.lineTo(130,207); ctx.stroke();
    label(ctx, 'SPM keeps rough layout', 56, 258, '#cbd5e1');
  }

  function tickCalibration(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5200);
    label(ctx, 'Calibration: 3D checker corners -> image points', 18, 28, '#bae6fd');
    var x0 = 50, y0 = 70, cell = 18;
    for (var y = 0; y < 5; y += 1) {
      for (var x = 0; x < 6; x += 1) {
        ctx.fillStyle = (x + y) % 2 ? '#e2e8f0' : '#1e293b';
        roundRect(ctx, x0 + x * cell + y * 5, y0 + y * cell, cell, cell, 2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#66f2c2'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(214,72); ctx.lineTo(270,104); ctx.lineTo(246,174); ctx.lineTo(190,142); ctx.closePath(); ctx.stroke();
    label(ctx, 'estimate K, R, t', 190, 222, '#fecdd3');
    label(ctx, 'min reprojection error', 74, 254, '#cbd5e1');
  }

  function tickEpipolar(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    label(ctx, 'Epipolar geometry: point constrains a line', 18, 28, '#bae6fd');
    ctx.fillStyle = '#102033'; roundRect(ctx, 36, 58, 112, 108, 12); ctx.fill(); roundRect(ctx, 174, 58, 112, 108, 12); ctx.fill();
    var px = 86, py = 112;
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#66f2c2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(184, 130 + Math.sin(p * Math.PI * 2) * 10); ctx.lineTo(274, 88 + Math.sin(p * Math.PI * 2) * 10); ctx.stroke();
    ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(226 + Math.sin(p * Math.PI * 2) * 18, 110, 5, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'p2^T F p1 = 0', 102, 232, '#fecdd3');
  }

  function tickSfm(state, ctx, dt) {
    clear(ctx);
    var p = cycle(state, dt, 5600);
    label(ctx, 'SfM: rays triangulate sparse 3D points', 18, 28, '#bae6fd');
    var c1 = [70,210], c2 = [244,210], pt = [156,88 + Math.sin(p * Math.PI * 2) * 8];
    ctx.fillStyle = '#38bdf8'; roundRect(ctx, c1[0]-14, c1[1]-10, 28, 20, 6); ctx.fill();
    ctx.fillStyle = '#fb7185'; roundRect(ctx, c2[0]-14, c2[1]-10, 28, 20, 6); ctx.fill();
    ctx.strokeStyle = '#66f2c2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(pt[0], pt[1]); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(pt[0], pt[1], 7, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'triangulate X', 116, 246, '#fecdd3');
  }

  function tick(kind, state, ctx, dt) {
    if (kind === 'corner') return tickCorner(state, ctx, dt);
    if (kind === 'hough') return tickHough(state, ctx, dt);
    if (kind === 'morph_erode') return tickMorph('erode', state, ctx, dt);
    if (kind === 'morph_dilate') return tickMorph('dilate', state, ctx, dt);
    if (kind === 'contour') return tickContour(state, ctx, dt);
    if (kind === 'template') return tickTemplate(state, ctx, dt);
    if (kind === 'kmeans') return tickKMeans(state, ctx, dt);
    if (kind === 'watershed') return tickWatershed(state, ctx, dt);
    if (kind === 'grabcut') return tickGrabCut(state, ctx, dt);
    if (kind === 'slic') return tickSlic(state, ctx, dt);
    if (kind === 'hog') return tickHog(state, ctx, dt);
    if (kind === 'optical_flow') return tickOpticalFlow(state, ctx, dt);
    if (kind === 'stereo') return tickStereo(state, ctx, dt);
    if (kind === 'ncuts') return tickNcuts(state, ctx, dt);
    if (kind === 'bovw') return tickBovw(state, ctx, dt);
    if (kind === 'calibration') return tickCalibration(state, ctx, dt);
    if (kind === 'epipolar') return tickEpipolar(state, ctx, dt);
    if (kind === 'sfm') return tickSfm(state, ctx, dt);
  }

  window.SemanticAnims = {
    init: init,
    tick: tick,
    setupCanvas: setupCanvas
  };
})();
