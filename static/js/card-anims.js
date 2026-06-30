(function() {
    var SIZE = 7;
    var CELL = 34;
    var GAP = 5;
    var PAD = 26;
    var CELL_R = 8;
    var CANVAS = SIZE * CELL + (SIZE - 1) * GAP + PAD * 2;
    var GRID_SIZE = SIZE * CELL + (SIZE - 1) * GAP;
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;


    var colorSeed = [
        ['#f97316', '#fb923c', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4'],
        ['#fb7185', '#f59e0b', '#fde047', '#a3e635', '#34d399', '#2dd4bf', '#38bdf8'],
        ['#e879f9', '#fb7185', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#60a5fa'],
        ['#c084fc', '#f472b6', '#fb923c', '#fef08a', '#4ade80', '#22d3ee', '#818cf8'],
        ['#a78bfa', '#e879f9', '#fb7185', '#f59e0b', '#84cc16', '#14b8a6', '#38bdf8'],
        ['#60a5fa', '#a78bfa', '#f472b6', '#f97316', '#facc15', '#34d399', '#2dd4bf'],
        ['#38bdf8', '#60a5fa', '#c084fc', '#fb7185', '#fb923c', '#a3e635', '#22c55e']
    ];

    var binarySeed = [
        [0.08, 0.12, 0.18, 0.27, 0.40, 0.58, 0.74],
        [0.10, 0.17, 0.24, 0.36, 0.50, 0.69, 0.82],
        [0.14, 0.21, 0.33, 0.43, 0.62, 0.78, 0.90],
        [0.19, 0.29, 0.38, 0.52, 0.72, 0.86, 0.94],
        [0.24, 0.34, 0.49, 0.65, 0.80, 0.91, 0.97],
        [0.31, 0.45, 0.57, 0.73, 0.85, 0.95, 0.99],
        [0.39, 0.53, 0.66, 0.79, 0.90, 0.97, 1.00]
    ];

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOutCubic(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
    function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    function cycle(state, dt, duration) {
        state.cycleTime += dt;
        if (reducedMotion) return 0.62;
        return (state.cycleTime % duration) / duration;
    }

    function setupCanvas(canvas) {
        var rect = canvas.parentElement.getBoundingClientRect();
        var css = Math.max(1, Math.round(rect.width || CANVAS));
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(css * dpr);
        canvas.height = Math.round(css * dpr);
        var ctx = canvas.getContext('2d');
        var scale = css / CANVAS;
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
        return ctx;
    }

    function roundedRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
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

    function cellX(c) { return PAD + c * (CELL + GAP); }
    function cellY(r) { return PAD + r * (CELL + GAP); }
    function cellCenter(c, r) { return { x: cellX(c) + CELL / 2, y: cellY(r) + CELL / 2 }; }

    function clearStage(ctx) {
        ctx.clearRect(0, 0, CANVAS, CANVAS);
        roundedRect(ctx, 8, 8, CANVAS - 16, CANVAS - 16, 18);
        ctx.fillStyle = 'rgba(210, 207, 203, 0.55)';
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        roundedRect(ctx, 8, 8, CANVAS - 16, CANVAS - 16, 18);
        ctx.clip();
        var dotPitch = CELL + GAP;
        for (var dx = PAD + CELL / 2; dx < CANVAS - PAD; dx += dotPitch) {
            for (var dy = PAD + CELL / 2; dy < CANVAS - PAD; dy += dotPitch) {
                ctx.beginPath();
                ctx.arc(dx, dy, 0.55, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.04)';
                ctx.fill();
            }
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawRoundedCell(ctx, c, r, fill, options) {
        options = options || {};
        var inset = options.inset || 0;
        var x = cellX(c) + inset;
        var y = cellY(r) + inset;
        var s = CELL - inset * 2;
        ctx.save();
        ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
        if (options.shadow) {
            ctx.shadowColor = options.shadow;
            ctx.shadowBlur = options.shadowBlur || 10;
            ctx.shadowOffsetY = options.shadowOffsetY || 0;
        }
        roundedRect(ctx, x, y, s, s, options.radius == null ? CELL_R : options.radius);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = options.stroke || 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = options.lineWidth || 1;
        ctx.stroke();
        ctx.restore();
    }

    function drawRoundedGrid(ctx, colors, options) {
        options = options || {};
        for (var r = 0; r < SIZE; r++) {
            for (var c = 0; c < SIZE; c++) {
                drawRoundedCell(ctx, c, r, colors[r][c], options);
            }
        }
    }

    function makeScene(gridSize, pad, gap) {
        var cell = (CANVAS - pad * 2 - gap * (gridSize - 1)) / gridSize;
        return {
            gridSize: gridSize,
            pad: pad,
            gap: gap,
            cell: cell,
            radius: Math.max(3.8, Math.min(7, cell * 0.26)),
            gridPx: gridSize * cell + (gridSize - 1) * gap
        };
    }

    function sceneCellX(scene, c) { return scene.pad + c * (scene.cell + scene.gap); }
    function sceneCellY(scene, r) { return scene.pad + r * (scene.cell + scene.gap); }
    function sceneCenter(scene, c, r) {
        return { x: sceneCellX(scene, c) + scene.cell / 2, y: sceneCellY(scene, r) + scene.cell / 2 };
    }

    function drawSceneCell(ctx, scene, c, r, fill, options) {
        options = options || {};
        var inset = options.inset || 0;
        var x = sceneCellX(scene, c) + inset;
        var y = sceneCellY(scene, r) + inset;
        var s = scene.cell - inset * 2;
        ctx.save();
        ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
        if (options.shadow) {
            ctx.shadowColor = options.shadow;
            ctx.shadowBlur = options.shadowBlur || 10;
        }
        roundedRect(ctx, x, y, s, s, options.radius == null ? scene.radius : options.radius);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = options.stroke || 'rgba(255, 255, 255, 0.36)';
        ctx.lineWidth = options.lineWidth || 1;
        ctx.stroke();
        ctx.restore();
    }

    function drawSceneGrid(ctx, scene, values, colorFn, options) {
        for (var r = 0; r < scene.gridSize; r++) {
            for (var c = 0; c < scene.gridSize; c++) {
                drawSceneCell(ctx, scene, c, r, colorFn(values[r][c], r, c), options);
            }
        }
    }

    function drawSceneKernelFrame(ctx, scene, c, r, sizeCells, color, alpha) {
        var x = sceneCellX(scene, c) - scene.gap / 2;
        var y = sceneCellY(scene, r) - scene.gap / 2;
        var side = scene.cell * sizeCells + scene.gap * (sizeCells - 1) + scene.gap;
        ctx.save();
        roundedRect(ctx, x, y, side, side, Math.min(13, scene.radius + 4));
        ctx.strokeStyle = color.replace('ALPHA', alpha);
        ctx.lineWidth = sizeCells > 3 ? 2.2 : 2.6;
        ctx.shadowColor = color.replace('ALPHA', alpha * 0.26);
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = color.replace('ALPHA', alpha * 0.34);
        for (var i = 1; i < sizeCells; i++) {
            var px = x + i * (scene.cell + scene.gap) - scene.gap / 2;
            ctx.beginPath();
            ctx.moveTo(px, y + 5);
            ctx.lineTo(px, y + side - 5);
            ctx.stroke();
            var py = y + i * (scene.cell + scene.gap) - scene.gap / 2;
            ctx.beginPath();
            ctx.moveTo(x + 5, py);
            ctx.lineTo(x + side - 5, py);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawSceneVector(ctx, from, to, color, alpha, width) {
        var angle = Math.atan2(to.y - from.y, to.x - from.x);
        var head = 6;
        ctx.save();
        ctx.strokeStyle = color.replace('ALPHA', alpha);
        ctx.fillStyle = color.replace('ALPHA', alpha);
        ctx.lineWidth = width || 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - Math.cos(angle - 0.65) * head, to.y - Math.sin(angle - 0.65) * head);
        ctx.lineTo(to.x - Math.cos(angle + 0.65) * head, to.y - Math.sin(angle + 0.65) * head);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function makeMatrix(size, fn) {
        var out = [];
        for (var r = 0; r < size; r++) {
            out[r] = [];
            for (var c = 0; c < size; c++) out[r][c] = fn(r, c);
        }
        return out;
    }

    function drawSoftGlow(ctx, x, y, radius, color, alpha) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, color.replace('ALPHA', alpha));
        g.addColorStop(0.58, color.replace('ALPHA', alpha * 0.35));
        g.addColorStop(1, color.replace('ALPHA', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawKernelFrame(ctx, x, y, color, alpha) {
        var size = CELL * 3 + GAP * 2;
        ctx.save();
        roundedRect(ctx, x, y, size, size, 13);
        ctx.strokeStyle = color.replace('ALPHA', alpha);
        ctx.lineWidth = 3;
        ctx.shadowColor = color.replace('ALPHA', alpha * 0.28);
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = color.replace('ALPHA', alpha * 0.42);
        for (var i = 1; i < 3; i++) {
            var p = x + i * (CELL + GAP) - GAP / 2;
            ctx.beginPath();
            ctx.moveTo(p, y + 7);
            ctx.lineTo(p, y + size - 7);
            ctx.stroke();
            p = y + i * (CELL + GAP) - GAP / 2;
            ctx.beginPath();
            ctx.moveTo(x + 7, p);
            ctx.lineTo(x + size - 7, p);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawVector(ctx, from, to, color, alpha) {
        var angle = Math.atan2(to.y - from.y, to.x - from.x);
        var head = 7;
        ctx.save();
        ctx.strokeStyle = color.replace('ALPHA', alpha);
        ctx.fillStyle = color.replace('ALPHA', alpha);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - Math.cos(angle - 0.65) * head, to.y - Math.sin(angle - 0.65) * head);
        ctx.lineTo(to.x - Math.cos(angle + 0.65) * head, to.y - Math.sin(angle + 0.65) * head);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function hexByte(v) {
        return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }

    function gray(v) {
        var b = hexByte(v * 255);
        return '#' + b + b + b;
    }

    function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

    function lerpColor(c1, c2, t) {
        t = clamp(t, 0, 1);
        var r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
        var r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
        return '#' + hexByte(lerp(r1, r2, t)) + hexByte(lerp(g1, g2, t)) + hexByte(lerp(b1, b2, t));
    }

    function toGray(hex) {
        var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return gray((0.299 * r + 0.587 * g + 0.114 * b) / 255);
    }

    function initGray(state) {
        state.colors = colorSeed.map(function(row) { return row.slice(); });
        state.grays = state.colors.map(function(row) { return row.map(toGray); });
        state.cycleTime = 0;
    }

    function tickGray(state, ctx, dt) {
        var t = cycle(state, dt, 6600);
        var sweep = easeInOut(clamp(t / 0.82, 0, 1)) * (SIZE + 0.8) - 0.4;
        var grid = [];
        clearStage(ctx);
        for (var r = 0; r < SIZE; r++) {
            grid[r] = [];
            for (var c = 0; c < SIZE; c++) {
                var local = smoothstep(sweep - c + 0.55);
                grid[r][c] = lerpColor(state.colors[r][c], state.grays[r][c], local);
            }
        }
        drawRoundedGrid(ctx, grid);
        if (sweep > -0.2 && sweep < SIZE) {
            var x = PAD + sweep * (CELL + GAP);
            drawSoftGlow(ctx, x, PAD + GRID_SIZE / 2, 58, 'rgba(14, 165, 233, ALPHA)', 0.28);
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.shadowColor = 'rgba(14, 165, 233, 0.32)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(x, PAD + 3);
            ctx.lineTo(x, PAD + GRID_SIZE - 3);
            ctx.stroke();
            ctx.restore();
        }
    }

    function initSobelX(state) {
        var scene = makeScene(13, 21, 3);
        state.scene = scene;
        state.values = makeMatrix(scene.gridSize, function(r, c) {
            var inBlock = c >= 4 && c <= 8 && r >= 2 && r <= 10;
            var diagEdge = Math.abs((c - r) - 1.5) < 0.9 && c >= 3 && c <= 10 && r >= 2 && r <= 10;
            var cornerBlock = c >= 8 && r >= 8 && c <= 10 && r <= 10;
            var vEdge1 = c === 3 && r >= 2 && r <= 10;
            var vEdge2 = c === 9 && r >= 2 && r <= 10;
            var base;
            if (inBlock) base = 0.74 + (r - 6) * 0.015 + Math.sin(c * 0.55) * 0.04;
            else if (diagEdge) base = 0.50;
            else if (cornerBlock) base = 0.60;
            else if (vEdge1 || vEdge2) base = 0.34;
            else base = 0.18;
            return clamp(base, 0, 1);
        });
        state.cycleTime = 0;
    }

    function tickSobelX(state, ctx, dt) {
        var scene = state.scene;
        var t = cycle(state, dt, 6500);
        var move = easeInOut(clamp(t / 0.84, 0, 1)) * (scene.gridSize - 3);
        var centerCol = move + 1;
        var leftResponse = Math.exp(-Math.pow(centerCol - 4, 2) / 0.38);
        var rightResponse = Math.exp(-Math.pow(centerCol - 9, 2) / 0.38);
        var response = Math.max(leftResponse, rightResponse);
        var kernelWeights = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        clearStage(ctx);
        drawSceneGrid(ctx, scene, state.values, function(v) { return gray(v); });
        [3, 9].forEach(function(edgeCol) {
            var edgeResponse = edgeCol === 3 ? leftResponse : rightResponse;
            for (var r = 2; r <= 10; r++) {
                var intensity = edgeResponse * (0.55 + 0.2 * state.values[r][clamp(edgeCol, 0, scene.gridSize - 1)]);
                drawSceneCell(ctx, scene, edgeCol, r, gray(state.values[r][clamp(edgeCol, 0, scene.gridSize - 1)]), {
                    stroke: 'rgba(239, 68, 68, ' + (0.55 + intensity * 0.45) + ')',
                    lineWidth: 2.0 + intensity * 2.5,
                    inset: 2
                });
                if (intensity > 0.3) {
                    drawSceneCell(ctx, scene, edgeCol, r, 'rgba(255, 200, 200, ' + (intensity * 0.35) + ')', {
                        inset: 2, stroke: 'rgba(239,68,68,0)', lineWidth: 0
                    });
                }
            }
        });
        drawSoftGlow(ctx, sceneCellX(scene, response > leftResponse ? 9 : 4) + scene.cell / 2, scene.pad + scene.gridPx / 2, 70, 'rgba(239, 68, 68, ALPHA)', 0.15 + response * 0.35);
        drawSceneKernelFrame(ctx, scene, move, 5, 3, 'rgba(239, 68, 68, ALPHA)', 0.82);
        for (var kr = 0; kr < 3; kr++) {
            for (var kc = 0; kc < 3; kc++) {
                var kcx = sceneCellX(scene, move + kc) + scene.cell / 2;
                var kcy = sceneCellY(scene, 5 + kr) + scene.cell / 2;
                var w = kernelWeights[kr][kc];
                if (w === 0) continue;
                ctx.save();
                ctx.font = 'bold ' + Math.round(scene.cell * 0.38) + 'px "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = w > 0 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(14, 165, 233, 0.9)';
                ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                ctx.shadowBlur = 2;
                ctx.fillText((w > 0 ? '+' : '') + w, kcx, kcy);
                ctx.restore();
            }
        }
    }

    function initSobelY(state) {
        var scene = makeScene(13, 21, 3);
        state.scene = scene;
        state.values = makeMatrix(scene.gridSize, function(r, c) {
            var inBlock = r >= 4 && r <= 8 && c >= 2 && c <= 10;
            var diagEdge = Math.abs((r - c) - 1.5) < 0.9 && r >= 3 && r <= 10 && c >= 2 && c <= 10;
            var cornerBlock = r >= 8 && c >= 8 && r <= 10 && c <= 10;
            var hEdge1 = r === 3 && c >= 2 && c <= 10;
            var hEdge2 = r === 9 && c >= 2 && c <= 10;
            var base;
            if (inBlock) base = 0.74 + (c - 6) * 0.015 + Math.sin(r * 0.55) * 0.04;
            else if (diagEdge) base = 0.50;
            else if (cornerBlock) base = 0.60;
            else if (hEdge1 || hEdge2) base = 0.34;
            else base = 0.18;
            return clamp(base, 0, 1);
        });
        state.cycleTime = 0;
    }

    function tickSobelY(state, ctx, dt) {
        var scene = state.scene;
        var t = cycle(state, dt, 6500);
        var move = easeInOut(clamp(t / 0.84, 0, 1)) * (scene.gridSize - 3);
        var centerRow = move + 1;
        var topResponse = Math.exp(-Math.pow(centerRow - 4, 2) / 0.38);
        var bottomResponse = Math.exp(-Math.pow(centerRow - 9, 2) / 0.38);
        var response = Math.max(topResponse, bottomResponse);
        var kernelWeights = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
        clearStage(ctx);
        drawSceneGrid(ctx, scene, state.values, function(v) { return gray(v); });
        [3, 9].forEach(function(edgeRow) {
            var edgeResponse = edgeRow === 3 ? topResponse : bottomResponse;
            for (var c = 2; c <= 10; c++) {
                var intensity = edgeResponse * (0.55 + 0.2 * state.values[clamp(edgeRow, 0, scene.gridSize - 1)][c]);
                drawSceneCell(ctx, scene, c, edgeRow, gray(state.values[clamp(edgeRow, 0, scene.gridSize - 1)][c]), {
                    stroke: 'rgba(37, 99, 235, ' + (0.55 + intensity * 0.45) + ')',
                    lineWidth: 2.0 + intensity * 2.5,
                    inset: 2
                });
                if (intensity > 0.3) {
                    drawSceneCell(ctx, scene, c, edgeRow, 'rgba(200, 210, 255, ' + (intensity * 0.35) + ')', {
                        inset: 2, stroke: 'rgba(37,99,235,0)', lineWidth: 0
                    });
                }
            }
        });
        drawSoftGlow(ctx, scene.pad + scene.gridPx / 2, sceneCellY(scene, response > topResponse ? 9 : 4) + scene.cell / 2, 70, 'rgba(37, 99, 235, ALPHA)', 0.15 + response * 0.35);
        drawSceneKernelFrame(ctx, scene, 5, move, 3, 'rgba(37, 99, 235, ALPHA)', 0.82);
        for (var kr = 0; kr < 3; kr++) {
            for (var kc = 0; kc < 3; kc++) {
                var kcx = sceneCellX(scene, 5 + kc) + scene.cell / 2;
                var kcy = sceneCellY(scene, move + kr) + scene.cell / 2;
                var w = kernelWeights[kr][kc];
                if (w === 0) continue;
                ctx.save();
                ctx.font = 'bold ' + Math.round(scene.cell * 0.38) + 'px "Microsoft YaHei", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = w > 0 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(37, 99, 235, 0.9)';
                ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                ctx.shadowBlur = 2;
                ctx.fillText((w > 0 ? '+' : '') + w, kcx, kcy);
                ctx.restore();
            }
        }
    }

    function makeSubPanel(ox, oy, pw, gs) {
        var gap = 2;
        var pad = 8;
        var avail = pw - pad * 2 - gap * (gs - 1);
        var cell = avail / gs;
        return { ox: ox, oy: oy, pw: pw, cell: cell, gap: gap, pad: pad, gs: gs, radius: Math.max(2, Math.min(5, cell * 0.26)) };
    }

    function subCellX(sp, c) { return sp.ox + sp.pad + c * (sp.cell + sp.gap); }
    function subCellY(sp, r) { return sp.oy + sp.pad + r * (sp.cell + sp.gap); }
    function subGridPx(sp) { return sp.gs * sp.cell + (sp.gs - 1) * sp.gap; }

    function drawSubCell(ctx, sp, c, r, fill, options) {
        options = options || {};
        var x = subCellX(sp, c);
        var y = subCellY(sp, r);
        var s = sp.cell;
        ctx.save();
        ctx.globalAlpha *= options.alpha == null ? 1 : options.alpha;
        roundedRect(ctx, x, y, s, s, sp.radius);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = options.stroke || 'rgba(255, 255, 255, 0.36)';
        ctx.lineWidth = options.lineWidth || 1;
        ctx.stroke();
        ctx.restore();
    }

    function drawSubGrid(ctx, sp, values, colorFn, options) {
        for (var r = 0; r < sp.gs; r++)
            for (var c = 0; c < sp.gs; c++)
                drawSubCell(ctx, sp, c, r, colorFn(values[r][c], r, c), options);
    }

    function drawSubPanelBg(ctx, sp, label) {
        var gpx = subGridPx(sp);
        ctx.save();
        roundedRect(ctx, sp.ox + sp.pad - 6, sp.oy + sp.pad - 6, gpx + 12, gpx + 12, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = 'bold ' + Math.round(sp.cell * 0.95) + 'px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(15, 31, 61, 0.72)';
        ctx.fillText(label, sp.ox + sp.pw / 2, sp.oy + sp.pad * 0.45);
        ctx.restore();
    }

    function drawGhostPanel(ctx, sp, values, compVals, compColor, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        var gpx = subGridPx(sp);
        // Dashed border
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = compColor;
        ctx.lineWidth = 1.5;
        roundedRect(ctx, sp.ox + sp.pad - 5, sp.oy + sp.pad - 4, gpx + 10, gpx + 8, 8);
        ctx.stroke();
        ctx.setLineDash([]);
        // Cells
        for (var r = 0; r < sp.gs; r++) {
            for (var c = 0; c < sp.gs; c++) {
                drawSubCell(ctx, sp, c, r, gray(values[r][c] * 0.7));
                if (compVals[r][c] > 0.05) {
                    drawSubCell(ctx, sp, c, r, compColor.replace('ALPHA', 0.22 + compVals[r][c] * 0.4), { stroke: 'rgba(0,0,0,0)' });
                }
            }
        }
        ctx.restore();
    }

    function initMagnitude(state) {
        var gs = 4;
        state.gs = gs;
        state.input = makeMatrix(gs, function(r, c) {
            var diag = Math.abs(c - r) < 0.8 && c >= 0 && c <= 3;
            var corner = c >= 2 && r >= 2;
            var v = diag ? 0.78 : corner ? 0.68 : 0.16;
            return clamp(v + (c + r - 3) * 0.01, 0, 1);
        });
        state.xVals = makeMatrix(gs, function(r, c) {
            var left = state.input[r][clamp(c - 1, 0, gs - 1)];
            var right = state.input[r][clamp(c + 1, 0, gs - 1)];
            return clamp(Math.abs(right - left) * 1.5, 0, 1);
        });
        state.yVals = makeMatrix(gs, function(r, c) {
            var up = state.input[clamp(r - 1, 0, gs - 1)][c];
            var down = state.input[clamp(r + 1, 0, gs - 1)][c];
            return clamp(Math.abs(down - up) * 1.5, 0, 1);
        });
        state.mag = makeMatrix(gs, function(r, c) {
            return clamp(Math.sqrt(state.xVals[r][c]*state.xVals[r][c] + state.yVals[r][c]*state.yVals[r][c]) / 1.05, 0, 1);
        });
        // All three panels use identical pw so cells perfectly align when overlapping
        state.pGx = makeSubPanel(34, 16, 108, gs);
        state.pGy = makeSubPanel(178, 16, 108, gs);
        state.pMag = makeSubPanel(106, 158, 108, gs);
        state.dstX = state.pMag.ox;
        state.dstY = state.pMag.oy;
        state.dstEndX = state.pMag.ox;
        state.dstEndY = state.pMag.oy;
        state.cycleTime = 0;
    }

    function tickMagnitude(state, ctx, dt) {
        var t = cycle(state, dt, 8600);
        var pGx = state.pGx, pGy = state.pGy, pMag = state.pMag;
        var gs = state.gs;

        var topAlpha = smoothstep(clamp(t / 0.14, 0, 1));
        var copyAlpha = smoothstep(clamp((t - 0.18) / 0.10, 0, 1)) * (1 - smoothstep(clamp((t - 0.56) / 0.10, 0, 1)));
        var slide = easeOutCubic(clamp((t - 0.20) / 0.36, 0, 1));
        var magAlpha = smoothstep(clamp((t - 0.48) / 0.22, 0, 1));

        clearStage(ctx);

        // Top panels
        ctx.save();
        ctx.globalAlpha = topAlpha;
        drawSubPanelBg(ctx, pGx, 'Sobel X (Gx)');
        drawSubGrid(ctx, pGx, state.input, function(v) { return gray(v * 0.74); });
        for (var r = 0; r < gs; r++)
            for (var c = 0; c < gs; c++)
                if (state.xVals[r][c] > 0.05)
                    drawSubCell(ctx, pGx, c, r, 'rgba(37, 99, 235, ' + (0.18 + state.xVals[r][c]*0.55) + ')', { stroke: 'rgba(37,99,235,0)' });
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = topAlpha;
        drawSubPanelBg(ctx, pGy, 'Sobel Y (Gy)');
        drawSubGrid(ctx, pGy, state.input, function(v) { return gray(v * 0.74); });
        for (var r = 0; r < gs; r++)
            for (var c = 0; c < gs; c++)
                if (state.yVals[r][c] > 0.05)
                    drawSubCell(ctx, pGy, c, r, 'rgba(239, 68, 68, ' + (0.18 + state.yVals[r][c]*0.55) + ')', { stroke: 'rgba(239,68,68,0)' });
        ctx.restore();

        // Diagonal slide: Gx down-right, Gy down-left → converge at mag position
        if (copyAlpha > 0.03 && slide < 1) {
            var gxStartX = pGx.ox, gxStartY = pGx.oy;
            var gyStartX = pGy.ox, gyStartY = pGy.oy;
            var dstX = pMag.ox, dstY = pMag.oy;

            var gxX = gxStartX + (dstX - gxStartX) * slide;
            var gxY = gxStartY + (dstY - gxStartY) * slide;
            var gyX = gyStartX + (dstX - gyStartX) * slide;
            var gyY = gyStartY + (dstY - gyStartY) * slide;

            // Dashed trails from originals to converging copies
            ctx.save();
            ctx.globalAlpha = copyAlpha * 0.45;
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
            ctx.fillStyle = 'rgba(14, 165, 233, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 5]);
            var gxCx = pGx.ox + pGx.pw / 2;
            var gxBy = pGx.oy + pGx.pad + subGridPx(pGx);
            var gyCx = pGy.ox + pGy.pw / 2;
            var gyBy = pGy.oy + pGy.pad + subGridPx(pGy);
            ctx.beginPath();
            ctx.moveTo(gxCx, gxBy + 4);
            ctx.lineTo(gxX + pGx.pw / 2, gxY + pGx.pad - 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gyCx, gyBy + 4);
            ctx.lineTo(gyX + pGy.pw / 2, gyY + pGy.pad - 4);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // Ghost copies at slide position
            var ghostGx = { ox: gxX, oy: gxY, pw: pGx.pw, cell: pGx.cell, gap: pGx.gap, pad: pGx.pad, gs: pGx.gs, radius: pGx.radius };
            var ghostGy = { ox: gyX, oy: gyY, pw: pGy.pw, cell: pGy.cell, gap: pGy.gap, pad: pGy.pad, gs: pGy.gs, radius: pGy.radius };
            drawGhostPanel(ctx, ghostGx, state.input, state.xVals, 'rgba(37, 99, 235, ALPHA)', copyAlpha);
            drawGhostPanel(ctx, ghostGy, state.input, state.yVals, 'rgba(239, 68, 68, ALPHA)', copyAlpha);
        }

        // Magnitude result
        ctx.save();
        ctx.globalAlpha = magAlpha;
        drawSubPanelBg(ctx, pMag, '梯度幅值 √(Gx²+Gy²)');
        for (var r = 0; r < gs; r++)
            for (var c = 0; c < gs; c++) {
                var m = state.mag[r][c];
                drawSubCell(ctx, pMag, c, r, gray(0.20 + m * 0.76), {
                    shadow: m > 0.55 ? 'rgba(255, 255, 255, 0.28)' : null,
                    shadowBlur: 9
                });
            }
        ctx.restore();
    }

    function drawArrowHead(ctx, x, y, dx, dy) {
        var len = 5;
        var angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(angle - 0.5) * len, y - Math.sin(angle - 0.5) * len);
        ctx.lineTo(x - Math.cos(angle + 0.5) * len, y - Math.sin(angle + 0.5) * len);
        ctx.closePath();
        ctx.fill();
    }

    function initBinary(state) {
        state.origVals = binarySeed.map(function(row) { return row.slice(); });
        state.cycleTime = 0;
    }

    function tickBinary(state, ctx, dt) {
        var t = cycle(state, dt, 6100);
        var threshold = 0.55;
        var wave = easeInOut(clamp(t / 0.86, 0, 1)) * (SIZE * 2.15) - 1.1;
        clearStage(ctx);
        for (var r = 0; r < SIZE; r++) {
            for (var c = 0; c < SIZE; c++) {
                var diag = (SIZE - 1 - r) + c;
                var pass = smoothstep((wave - diag + 1.2) / 2.2);
                var v0 = state.origVals[r][c];
                var v1 = v0 >= threshold ? 0.96 : 0.15;
                var v = lerp(v0, v1, pass);
                var border = Math.abs(v0 - threshold) < 0.06 ? 'rgba(245, 158, 11, 0.42)' : 'rgba(255, 255, 255, 0.42)';
                drawRoundedCell(ctx, c, r, gray(v), { stroke: border });
            }
        }
        for (var i = 0; i < SIZE; i++) {
            for (var j = 0; j < SIZE; j++) {
                var d = Math.abs(((SIZE - 1 - i) + j) - wave);
                if (d < 1) drawRoundedCell(ctx, j, i, '#ffffff', { alpha: (1 - d) * 0.22, inset: 1, radius: 8, stroke: 'rgba(255,255,255,0)' });
            }
        }
    }

    function initGauss(state) {
        var scene = makeScene(15, 36, 2);
        state.scene = scene;
        state.noiseCenters = [[3, 3], [7, 8], [11, 5], [4, 12]];
        state.base = makeMatrix(scene.gridSize, function(r, c) {
            var jag = (r % 3 === 0) ? 1 : 0;
            var inside = c >= 5 + jag && c <= 11 && r >= 3 && r <= 11;
            var v = inside ? 0.68 : 0.23;
            return clamp(v + (r - c) * 0.004, 0, 1);
        });
        [
            [3, 3, 0.98], [7, 8, 1.0], [11, 5, 0.92], [4, 12, 0.04],
            [12, 11, 0.08], [2, 9, 0.9], [9, 2, 0.05]
        ].forEach(function(p) { state.base[p[0]][p[1]] = p[2]; });

        var k = [1, 4, 6, 4, 1];
        state.blurred = makeMatrix(scene.gridSize, function(r, c) {
            var sum = 0;
            var weight = 0;
            for (var kr = -2; kr <= 2; kr++) {
                for (var kc = -2; kc <= 2; kc++) {
                    var rr = clamp(r + kr, 0, scene.gridSize - 1);
                    var cc = clamp(c + kc, 0, scene.gridSize - 1);
                    var w = k[kr + 2] * k[kc + 2];
                    sum += state.base[rr][cc] * w;
                    weight += w;
                }
            }
            return sum / weight;
        });
        state.cycleTime = 0;
    }

    function tickGauss(state, ctx, dt) {
        var scene = state.scene;
        var t = cycle(state, dt, 9200);
        var totalCells = scene.gridSize * scene.gridSize;
        var rawScan = smoothstep(clamp((t - 0.12) / 0.76, 0, 1));
        var scanPos = rawScan * (totalCells - 1);
        var scanR = clamp(Math.floor(scanPos / scene.gridSize), 0, scene.gridSize - 1);
        var scanC = clamp(Math.round(scanPos % scene.gridSize), 0, scene.gridSize - 1);
        var weights = [
            [1, 4, 6, 4, 1],
            [4, 16, 24, 16, 4],
            [6, 24, 36, 24, 6],
            [4, 16, 24, 16, 4],
            [1, 4, 6, 4, 1]
        ];
        var maxW = 36;
        var gs = scene.gridSize;
        clearStage(ctx);

        // Draw 2-layer padding zone around the grid (replicate border values)
        for (var pr = -2; pr < gs + 2; pr++) {
            for (var pc = -2; pc < gs + 2; pc++) {
                if (pr >= 0 && pr < gs && pc >= 0 && pc < gs) continue; // skip inner cells
                var srcR = clamp(pr, 0, gs - 1);
                var srcC = clamp(pc, 0, gs - 1);
                var cellIdx = srcR * gs + srcC;
                var behind = scanPos - cellIdx;
                var cellProgress = smoothstep(clamp(behind / 2.5, 0, 1));
                var v = lerp(state.base[srcR][srcC], state.blurred[srcR][srcC], cellProgress);
                var px = sceneCellX(scene, pc);
                var py = sceneCellY(scene, pr);
                ctx.save();
                ctx.globalAlpha = 0.38;
                roundedRect(ctx, px + 1, py + 1, scene.cell - 2, scene.cell - 2, scene.radius);
                ctx.fillStyle = gray(v);
                ctx.fill();
                ctx.setLineDash([2, 3]);
                ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
                ctx.lineWidth = 0.7;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Draw grid cells with progressive blur
        for (var r = 0; r < gs; r++) {
            for (var c = 0; c < gs; c++) {
                var cellIdx = r * gs + c;
                var behind = scanPos - cellIdx;
                var cellProgress = smoothstep(clamp(behind / 2.5, 0, 1));
                var v = lerp(state.base[r][c], state.blurred[r][c], cellProgress);
                drawSceneCell(ctx, scene, c, r, gray(v), { stroke: 'rgba(255,255,255,0.24)' });
            }
        }

        // Kernel frame at TRUE (unclamped) position — may extend beyond grid
        var frameC = scanC - 2;
        var frameR = scanR - 2;
        var scanInBounds = scanR < gs;
        if (scanInBounds) {
            // Draw kernel frame (clipped to canvas, but using raw position for visual)
            var visFrameC = clamp(frameC, -2, gs - 3);
            var visFrameR = clamp(frameR, -2, gs - 3);
            drawSceneKernelFrame(ctx, scene, visFrameC, visFrameR, 5, 'rgba(14, 165, 233, ALPHA)', 0.78);

            // Draw weight overlay & phantom padding cells
            for (var gr = -2; gr <= 2; gr++) {
                for (var gc = -2; gc <= 2; gc++) {
                    var rr2 = scanR + gr;
                    var cc2 = scanC + gc;
                    var inBounds = rr2 >= 0 && cc2 >= 0 && rr2 < gs && cc2 < gs;
                    var w = weights[gr + 2][gc + 2];
                    var alphaScale = w / maxW;

                    if (inBounds) {
                        // Normal in-bounds kernel cell
                        drawSceneCell(ctx, scene, cc2, rr2, '#ffffff', {
                            alpha: alphaScale * 0.36,
                            inset: 2,
                            stroke: 'rgba(255,255,255,0)'
                        });
                    } else {
                        // Phantom padding cell — use nearest border value, faint appearance
                        var padR = clamp(rr2, 0, gs - 1);
                        var padC = clamp(cc2, 0, gs - 1);
                        var padV = lerp(state.base[padR][padC], state.blurred[padR][padC], scanPos > (padR * gs + padC) ? 1 : 0);
                        // Draw as ghost cell outside the grid
                        var px = sceneCellX(scene, cc2);
                        var py = sceneCellY(scene, rr2);
                        ctx.save();
                        ctx.globalAlpha = alphaScale * 0.14;
                        roundedRect(ctx, px + 2, py + 2, scene.cell - 4, scene.cell - 4, scene.radius);
                        ctx.fillStyle = gray(padV);
                        ctx.fill();
                        ctx.setLineDash([2, 3]);
                        ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.restore();
                    }
                }
            }

            var sc = sceneCenter(scene, scanC, scanR);
            drawSoftGlow(ctx, sc.x, sc.y, 60, 'rgba(14, 165, 233, ALPHA)', 0.2);
        }
    }

    function initNms(state) {
        var mCell = 28, mGap = 2, mRad = 5;
        state.mCell = mCell; state.mGap = mGap; state.mRad = mRad;
        state.examples = [
            {
                vals: [[0.12,0.13,0.14],[0.13,0.80,0.12],[0.14,0.11,0.15]],
                dir: Math.PI / 4, n1: [-1,-1], n2: [1,1], keep: true
            },
            {
                vals: [[0.13,0.15,0.12],[0.72,0.26,0.74],[0.14,0.13,0.11]],
                dir: 0, n1: [0,-1], n2: [0,1], keep: false
            },
            {
                vals: [[0.15,0.18,0.16],[0.19,0.16,0.20],[0.14,0.17,0.15]],
                dir: 0, n1: [0,-1], n2: [0,1], keep: false
            }
        ];
        var mSize = 3 * mCell + 2 * mGap;
        var gapX = 22;
        var totalWidth = 3 * mSize + 2 * gapX;
        var startX = (CANVAS - totalWidth) / 2;
        state.mxX = [];
        for (var i = 0; i < 3; i++) {
            state.mxX.push(startX + i * (mSize + gapX));
        }
        state.mxY = (CANVAS - mSize) / 2;
        state.cycleTime = 0;
    }

    function drawNmsArrow(ctx, cx, cy, dir, len, color) {
        var ax = Math.cos(dir) * len;
        var ay = Math.sin(dir) * len;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - ax, cy - ay);
        ctx.lineTo(cx + ax, cy + ay);
        ctx.stroke();
        var headLen = 5;
        for (var s = -1; s <= 1; s += 2) {
            var hx = cx + ax * s, hy = cy + ay * s;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx - Math.cos(dir - 0.55) * headLen, hy - Math.sin(dir - 0.55) * headLen);
            ctx.lineTo(hx - Math.cos(dir + 0.55) * headLen, hy - Math.sin(dir + 0.55) * headLen);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    function tickNms(state, ctx, dt) {
        var st = state;
        var t = cycle(state, dt, 7500);
        var highlight = Math.floor(t * 3) % 3;
        var mCell = st.mCell, mGap = st.mGap;

        clearStage(ctx);

        // 3 example matrices — no text, just visuals
        for (var m = 0; m < 3; m++) {
            var ex = st.examples[m];
            var mx = st.mxX[m];
            var my = st.mxY;
            var isActive = m === highlight;
            var activeAlpha = isActive ? 1 : 0.48;

            ctx.save();
            ctx.globalAlpha = activeAlpha;

            // Draw cells
            for (var r = 0; r < 3; r++) {
                for (var c = 0; c < 3; c++) {
                    var v = ex.vals[r][c];
                    var cx2 = mx + c * (mCell + mGap);
                    var cy2 = my + r * (mCell + mGap);
                    var isCenter = r === 1 && c === 1;
                    var isN1 = r === 1 + ex.n1[0] && c === 1 + ex.n1[1];
                    var isN2 = r === 1 + ex.n2[0] && c === 1 + ex.n2[1];
                    var isNbr = isN1 || isN2;

                    ctx.save();
                    roundedRect(ctx, cx2, cy2, mCell, mCell, st.mRad);
                    ctx.fillStyle = gray(v);
                    ctx.fill();

                    if (isNbr) {
                        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
                        ctx.lineWidth = 2.2;
                    } else {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                        ctx.lineWidth = 1;
                    }
                    ctx.stroke();

                    if (isCenter) {
                        if (ex.keep) {
                            ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
                            ctx.lineWidth = 2.8;
                            ctx.stroke();
                            ctx.shadowColor = 'rgba(34, 197, 94, 0.4)';
                            ctx.shadowBlur = 10;
                            ctx.stroke();
                        } else {
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                            ctx.lineWidth = 2.8;
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(cx2 + 5, cy2 + 5);
                            ctx.lineTo(cx2 + mCell - 5, cy2 + mCell - 5);
                            ctx.moveTo(cx2 + mCell - 5, cy2 + 5);
                            ctx.lineTo(cx2 + 5, cy2 + mCell - 5);
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                            ctx.lineWidth = 2.2;
                            ctx.stroke();
                        }
                    }

                    ctx.restore();
                }
            }

            // Direction arrow through center
            var arrowCx = mx + mCell + mGap + mCell / 2;
            var arrowCy = my + mCell + mGap + mCell / 2;
            var arrowColor = ex.keep ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.7)';
            drawNmsArrow(ctx, arrowCx, arrowCy, ex.dir, mCell * 0.95, arrowColor);

            ctx.restore();
        }
    }

    function initHysteresis(state) {
        var scene = makeScene(15, 20, 2.4);
        state.scene = scene;
        state.path = [[2, 3], [2, 4], [3, 4], [4, 5], [5, 5], [5, 6], [6, 6], [7, 7], [8, 7], [8, 8], [9, 8], [10, 9], [11, 10], [12, 10]];
        state.strongPos = [[2, 3], [5, 5], [8, 7], [11, 10]];
        state.connectedWeak = state.path.filter(function(p) {
            return !state.strongPos.some(function(s) { return s[0] === p[0] && s[1] === p[1]; });
        });
        state.orphanWeak = [[2, 11], [3, 12], [9, 3], [10, 3], [12, 5], [5, 12]];
        state.cycleTime = 0;
    }

    function hasPoint(list, r, c) {
        return list.some(function(p) { return p[0] === r && p[1] === c; });
    }

    function weakPathIndex(state, r, c) {
        for (var i = 0; i < state.connectedWeak.length; i++) {
            if (state.connectedWeak[i][0] === r && state.connectedWeak[i][1] === c) return i;
        }
        return -1;
    }

    function tickHysteresis(state, ctx, dt) {
        var scene = state.scene;
        var t = cycle(state, dt, 7500);
        var spread = easeOutCubic(clamp(t / 0.56, 0, 1));
        var settle = smoothstep(clamp((t - 0.58) / 0.25, 0, 1));
        var activeCount = Math.ceil(spread * state.connectedWeak.length);
        clearStage(ctx);

        // Segment lines
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (var p = 0; p < state.path.length - 1; p++) {
            var a = state.path[p];
            var b = state.path[p + 1];
            var strongA = hasPoint(state.strongPos, a[0], a[1]);
            var strongB = hasPoint(state.strongPos, b[0], b[1]);
            var weakA = weakPathIndex(state, a[0], a[1]);
            var weakB = weakPathIndex(state, b[0], b[1]);
            var activeA = strongA || (weakA >= 0 && weakA < activeCount);
            var activeB = strongB || (weakB >= 0 && weakB < activeCount);
            var bothStrong = strongA && strongB;
            var ca = sceneCenter(scene, a[1], a[0]);
            var cb = sceneCenter(scene, b[1], b[0]);
            if (activeA && activeB) {
                ctx.strokeStyle = bothStrong ? 'rgba(14, 165, 233, 0.50)' : 'rgba(245, 158, 11, 0.40)';
            } else {
                ctx.strokeStyle = 'rgba(146, 64, 14, 0.15)';
            }
            ctx.beginPath();
            ctx.moveTo(ca.x, ca.y);
            ctx.lineTo(cb.x, cb.y);
            ctx.stroke();
        }
        ctx.restore();

        for (var r = 0; r < scene.gridSize; r++) {
            for (var c = 0; c < scene.gridSize; c++) {
                var strong = hasPoint(state.strongPos, r, c);
                var weakIndex = weakPathIndex(state, r, c);
                var connected = weakIndex >= 0;
                var orphan = hasPoint(state.orphanWeak, r, c);
                if (strong) {
                    drawSceneCell(ctx, scene, c, r, lerpColor('#e0f0ff', '#ffffff', settle), {
                        inset: 0,
                        shadow: 'rgba(14, 165, 233, 0.55)',
                        shadowBlur: 14,
                        stroke: 'rgba(14, 165, 233, 0.6)',
                        lineWidth: 2
                    });
                } else if (connected) {
                    var active = weakIndex < activeCount;
                    drawSceneCell(ctx, scene, c, r, active ? lerpColor('#f59e0b', '#fde68a', settle) : '#b45309', {
                        alpha: active ? 1 : 0.38,
                        inset: active ? 2 : 7,
                        shadow: active ? 'rgba(245, 158, 11, 0.35)' : null,
                        shadowBlur: 10,
                        stroke: active ? 'rgba(245, 158, 11, 0.45)' : 'rgba(180,83,9,0.18)',
                        lineWidth: active ? 1.5 : 1
                    });
                } else if (orphan) {
                    drawSceneCell(ctx, scene, c, r, '#92400e', {
                        alpha: 0.55 * (1 - settle),
                        inset: lerp(5, 8, settle),
                        stroke: 'rgba(146,64,14,0.15)'
                    });
                } else {
                    drawSceneCell(ctx, scene, c, r, '#c4cad4', { stroke: 'rgba(255,255,255,0.25)' });
                }
            }
        }
        // Strong seed glow during spread
        if (spread < 1) {
            state.strongPos.forEach(function(p) {
                var center = sceneCenter(scene, p[1], p[0]);
                drawSoftGlow(ctx, center.x, center.y, 30 + spread * 34, 'rgba(14, 165, 233, ALPHA)', 0.15 * (1 - settle));
            });
        }
    }

// Export API
window.CardAnims = {
    init: {
        gray: initGray,
        sobel_x: initSobelX,
        sobel_y: initSobelY,
        magnitude: initMagnitude,
        binary: initBinary,
        gaussian: initGauss,
        gradient: initMagnitude,
        nms: initNms,
        hysteresis: initHysteresis
    },
    tick: {
        gray: tickGray,
        sobel_x: tickSobelX,
        sobel_y: tickSobelY,
        magnitude: tickMagnitude,
        binary: tickBinary,
        gaussian: tickGauss,
        gradient: tickMagnitude,
        nms: tickNms,
        hysteresis: tickHysteresis
    },
    setupCanvas: setupCanvas,
    CANVAS: CANVAS
};
})();