(function() {
    var W = 96;
    var H = 72;
    var TEX = 128;
    var PATCH = 16;
    var state = {
        stage: 0,
        started: false,
        active: false,
        raf: 0,
        data: null,
        message: "\u8bf7\u5148\u4e0a\u4f20\u56fe\u7247\u751f\u6210\u771f\u5b9e\u6f14\u793a\u6570\u636e"
    };

    var formulas = [
        "D(x,y,\\sigma)=G(x,y,k\\sigma)-G(x,y,\\sigma)",
        "\\hat{x}=-\\left(\\frac{\\partial^2D}{\\partial x^2}\\right)^{-1}\\frac{\\partial D}{\\partial x}",
        "\\frac{Tr(H)^2}{Det(H)}<12.1",
        "m=\\sqrt{d_x^2+d_y^2},\\quad \\theta=atan2(d_y,d_x)",
        "4\\times4\\times8=128,\\quad d\\leftarrow \\min(d,0.2)"
    ];
    var tabLabels = ["尺度差分", "邻居比较", "边缘剔除", "方向统计", "描述子"];
    var names = ["高斯差分尺度空间", "27 点极值与曲线修正", "边缘点剔除", "方向分配", "描述子生成"];
    var hints = [
        "上排是真实高斯层，下排是真实高斯差分层。",
        "三层 3x3 网格来自真实高斯差分邻域，中心点逐个对比 26 个邻居。",
        "用方向陡峭雷达的山脊指数判断山峰还是山脊。",
        "16x16 真实梯度箭头与 36 柱方向直方图联动。",
        "网格按主方向旋转对齐，再聚合成 4x4x8 描述子。"
    ];
    var notes = [
        "高斯差分图像做对比度拉伸后，尺度空间中的强响应会更清楚地显现。",
        "曲线修正量来自真实计算结果，用来把离散极值推到亚像素位置。",
        "ratio 小于 12.1 更像块状峰值；过大则更像边缘山脊，会被剔除。",
        "每个箭头的方向、长度和权重都来自当前关键点邻域的真实梯度。",
        "星形图使用真实 128 维描述子分量，不生成替代数据。"
    ];

    tabLabels = ["尺度差分", "位置修准", "边缘剔除", "方向统计", "特征编码"];
    names = ["不同模糊下找稳定亮点", "把关键点位置修准", "剔除不稳定的边缘点", "给关键点确定主方向", "生成 128 维特征编码"];
    hints = [
        "把同一张图做不同程度的高斯模糊，再相邻相减，强响应位置就是候选特征的来源。",
        "中心格会和上下三层共 26 个邻居比较，只有局部最大或最小才有资格继续保留。",
        "这一步把候选点想成地形：像山峰就稳定，像山脊就容易滑动，要剔除。",
        "统计关键点周围 16x16 区域的真实梯度方向，最高的方向就是这个点的主方向。",
        "把周围梯度按 4x4 小区域汇总，每个区域统计 8 个方向，合成 128 维描述子。"
    ];
    notes = [
        "下排高斯差分图越亮，说明这个尺度上的局部变化越强，越可能出现稳定关键点。",
        "曲线、整数点和绿色修正点都来自真实高斯差分邻域与后端算出的修正量。",
        "山峰往各个方向都陡，定位准；山脊沿着一条方向很平，容易滑动，定位不准。",
        "每个箭头的方向、长度和权重都来自当前关键点邻域的真实梯度。",
        "右侧星形图和底部数组都来自同一个真实关键点的描述子。"
    ];

    function $(id) { return document.getElementById(id); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function viridis(v) {
        var stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
        var x = clamp(v, 0, 1) * (stops.length - 1);
        var i = Math.floor(x);
        var f = x - i;
        var a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
        return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))];
    }

    function css(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

    function matrixFromPayload(item, signed) {
        if (!item || !item.data || !item.width || !item.height) return null;
        var arr = new Float32Array(item.width * item.height);
        for (var y = 0; y < item.height; y++) {
            for (var x = 0; x < item.width; x++) arr[y * item.width + x] = Number(item.data[y][x] || 0);
        }
        arr.sourceWidth = item.width;
        arr.sourceHeight = item.height;
        arr.signed = !!signed;
        return arr;
    }

    function resample(src) {
        if (!src || !src.sourceWidth || !src.sourceHeight) return null;
        var out = new Float32Array(W * H);
        for (var y = 0; y < H; y++) {
            var sy = Math.min(src.sourceHeight - 1, Math.round(y / Math.max(1, H - 1) * (src.sourceHeight - 1)));
            for (var x = 0; x < W; x++) {
                var sx = Math.min(src.sourceWidth - 1, Math.round(x / Math.max(1, W - 1) * (src.sourceWidth - 1)));
                out[y * W + x] = src[sy * src.sourceWidth + sx];
            }
        }
        out.sourceWidth = W;
        out.sourceHeight = H;
        out.signed = !!src.signed;
        return out;
    }

    function stats(arr) {
        var min = Infinity, max = -Infinity, maxAbs = 1e-6, sum = 0;
        for (var i = 0; i < arr.length; i++) {
            var v = Number(arr[i] || 0);
            min = Math.min(min, v);
            max = Math.max(max, v);
            maxAbs = Math.max(maxAbs, Math.abs(v));
            sum += v;
        }
        return { min: min, max: max, maxAbs: maxAbs, mean: sum / Math.max(1, arr.length) };
    }

    function crop(arr, cx, cy, size) {
        var out = new Float32Array(size * size);
        var half = Math.floor(size / 2);
        for (var y = 0; y < size; y++) {
            var sy = clamp(Math.round(cy) - half + y, 0, H - 1);
            for (var x = 0; x < size; x++) {
                var sx = clamp(Math.round(cx) - half + x, 0, W - 1);
                out[y * size + x] = arr[sy * W + sx];
            }
        }
        out.size = size;
        out.signed = !!arr.signed;
        return out;
    }

    function matrixCanvas(arr, mode, px) {
        var size = arr.size || Math.round(Math.sqrt(arr.length));
        var st = stats(arr);
        var off = document.createElement("canvas");
        off.width = size;
        off.height = size;
        var octx = off.getContext("2d");
        var img = octx.createImageData(size, size);
        for (var i = 0; i < size * size; i++) {
            var v = Number(arr[i] || 0);
            var c;
            if (mode === "gray") {
                var g = Math.round(clamp(v, 0, 1) * 255);
                c = [g, g, g];
            } else if (mode === "dog") {
                var s = clamp(0.5 + v / (st.maxAbs * 2), 0, 1);
                s = Math.pow(Math.abs(s - 0.5) * 2, 0.58) * (s >= 0.5 ? 0.5 : -0.5) + 0.5;
                c = viridis(s);
            } else {
                c = viridis((v - st.min) / Math.max(1e-9, st.max - st.min));
            }
            img.data[i * 4] = c[0];
            img.data[i * 4 + 1] = c[1];
            img.data[i * 4 + 2] = c[2];
            img.data[i * 4 + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        var canvas = document.createElement("canvas");
        canvas.width = px;
        canvas.height = px;
        var ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, px, px);
        return { canvas: canvas, stats: st, data: arr };
    }

    function patchCanvas(patch) {
        if (!patch || patch.length !== PATCH) return null;
        var canvas = document.createElement("canvas");
        canvas.width = TEX;
        canvas.height = TEX;
        var ctx = canvas.getContext("2d");
        var cell = TEX / PATCH;
        for (var y = 0; y < PATCH; y++) {
            for (var x = 0; x < PATCH; x++) {
                var p = patch[y][x] || {};
                var g = Math.round(clamp(Number(p.gray || 0), 0, 1) * 255);
                ctx.fillStyle = "rgb(" + g + "," + g + "," + g + ")";
                ctx.fillRect(x * cell, y * cell, cell + 0.2, cell + 0.2);
            }
        }
        return canvas;
    }

    function hideTaylorChart() {
        var c = $("siftTaylorChart");
        if (c) c.style.display = "none";
    }

    function ensureTaylorChart(view, rect) {
        var host = $("siftMicroCanvas") && $("siftMicroCanvas").parentElement;
        if (!host || !window.Chart) return null;
        var canvas = $("siftTaylorChart");
        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.id = "siftTaylorChart";
            canvas.style.position = "absolute";
            canvas.style.zIndex = "4";
            canvas.style.pointerEvents = "none";
            host.appendChild(canvas);
        }
        canvas.style.display = "block";
        canvas.style.left = rect.x + "px";
        canvas.style.top = rect.y + "px";
        canvas.style.right = "auto";
        canvas.style.bottom = "auto";
        canvas.style.width = rect.w + "px";
        canvas.style.height = rect.h + "px";
        var pixelW = Math.floor(rect.w * Math.min(2, window.devicePixelRatio || 1));
        var pixelH = Math.floor(rect.h * Math.min(2, window.devicePixelRatio || 1));
        if (canvas.width !== pixelW) canvas.width = pixelW;
        if (canvas.height !== pixelH) canvas.height = pixelH;
        return canvas;
    }

    function fitTaylorCurve() {
        var cube = state.data && state.data.visual ? state.data.visual.cube : null;
        var row = cube && cube[1] && cube[1][1] ? cube[1][1] : [0, 0, 0];
        var left = Number(row[0] || 0);
        var center = Number(row[1] || 0);
        var right = Number(row[2] || 0);
        var a = (left + right - 2 * center) / 2;
        var b = (right - left) / 2;
        var c = center;
        var offset = state.data.visual.taylor ? Number((state.data.visual.taylor.offset || [0])[0] || 0) : 0;
        var detectedX = 0;
        var refinedX = clamp(offset, -1.6, 1.6);
        var labels = [];
        var curve = [];
        for (var i = 0; i <= 80; i++) {
            var x = -2 + i * 4 / 80;
            labels.push(x.toFixed(2));
            curve.push({ x: x, y: a * x * x + b * x + c });
        }
        return {
            a: a,
            b: b,
            c: c,
            offset: refinedX,
            curve: curve,
            detected: [{ x: detectedX, y: c }],
            refined: [{ x: refinedX, y: a * refinedX * refinedX + b * refinedX + c }],
            samples: [{ x: -1, y: left }, { x: 0, y: center }, { x: 1, y: right }]
        };
    }

    function renderTaylorChart(view, rect) {
        var canvas = ensureTaylorChart(view, rect);
        if (!canvas || !window.Chart) return false;
        var data = fitTaylorCurve();
        var key = [
            Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h),
            data.refined[0].x.toFixed(4), data.detected[0].y.toFixed(6)
        ].join(":");
        if (state.data.cache.taylorChart && state.data.cache.taylorChartKey === key) return true;
        if (state.data.cache.taylorChart) state.data.cache.taylorChart.destroy();
        state.data.cache.taylorChartKey = key;
        try {
            state.data.cache.taylorChart = new Chart(canvas, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        type: "line",
                        label: "曲线修正拟合线",
                        data: data.curve,
                        borderColor: "#0f172a",
                        borderWidth: 2.5,
                        pointRadius: 0,
                        tension: 0.25
                    },
                    {
                        label: "离散采样点",
                        data: data.samples,
                        pointRadius: 5,
                        pointBackgroundColor: "#1d4ed8",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 1.5
                    },
                    {
                        label: "检测到的极值点",
                        data: data.detected,
                        pointRadius: 7,
                        pointBackgroundColor: "#ef4444",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2
                    },
                    {
                        label: "曲线修正后位置",
                        data: data.refined,
                        pointRadius: 8,
                        pointBackgroundColor: "#22c55e",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: {
                        type: "linear",
                        min: -2,
                        max: 2,
                        grid: { color: "rgba(15,23,42,.1)" },
                        ticks: { color: "#475569", font: { size: 13 } },
                        title: { display: true, text: "x 轴偏移", color: "#334155", font: { size: 14, weight: "bold" } }
                    },
                    y: {
                        grid: { color: "rgba(15,23,42,.1)" },
                        ticks: { color: "#475569", font: { size: 13 } }
                    }
                }
            }
        });
        return true;
        } catch (err) {
            if (state.data.cache.taylorChart) state.data.cache.taylorChart.destroy();
            state.data.cache.taylorChart = null;
            state.data.cache.taylorChartKey = "";
            return false;
        }
    }

    function renderTaylorChartRich(view, rect) {
        var canvas = ensureTaylorChart(view, rect);
        if (!canvas || !window.Chart) return false;
        var data = fitTaylorCurve();
        var key = [
            "rich",
            Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h),
            data.offset.toFixed(4), data.detected[0].y.toFixed(6), data.refined[0].y.toFixed(6)
        ].join(":");
        if (state.data.cache.taylorChart && state.data.cache.taylorChartKey === key) return true;
        if (state.data.cache.taylorChart) state.data.cache.taylorChart.destroy();
        state.data.cache.taylorChartKey = key;
        var guidePlugin = {
            id: "taylorGuide",
            afterDatasetsDraw: function(chart) {
                var ctx = chart.ctx;
                var xs = chart.scales.x;
                var ys = chart.scales.y;
                var detected = data.detected[0];
                var refined = data.refined[0];
                function px(p) { return xs.getPixelForValue(p.x); }
                function py(p) { return ys.getPixelForValue(p.y); }
                ctx.save();
                ctx.lineWidth = 1.3;
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = "rgba(29,78,216,.45)";
                data.samples.forEach(function(p) {
                    ctx.beginPath();
                    ctx.moveTo(px(p), ys.bottom);
                    ctx.lineTo(px(p), py(p));
                    ctx.stroke();
                });
                ctx.setLineDash([]);
                ctx.strokeStyle = "rgba(239,68,68,.62)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px(detected), ys.top + 8);
                ctx.lineTo(px(detected), ys.bottom);
                ctx.stroke();
                ctx.strokeStyle = "rgba(34,197,94,.78)";
                ctx.beginPath();
                ctx.moveTo(px(refined), ys.top + 8);
                ctx.lineTo(px(refined), ys.bottom);
                ctx.stroke();
                var x1 = px(detected);
                var y1 = py(detected) - 18;
                var x2 = px(refined);
                var y2 = py(refined) - 18;
                var dir = x2 >= x1 ? 1 : -1;
                ctx.strokeStyle = "#0f172a";
                ctx.fillStyle = "#0f172a";
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x2, y2);
                ctx.lineTo(x2 - dir * 8, y2 - 5);
                ctx.lineTo(x2 - dir * 8, y2 + 5);
                ctx.closePath();
                ctx.fill();
                ctx.font = "800 13px Microsoft YaHei, sans-serif";
                ctx.fillText("修正量 " + data.offset.toFixed(3), Math.min(x1, x2) + 8, Math.min(y1, y2) - 8);
                ctx.fillStyle = "#ef4444";
                ctx.fillText("\u6574\u6570\u6781\u503c", x1 + 8, py(detected) - 10);
                ctx.fillStyle = "#16a34a";
                ctx.fillText("\u4e9a\u50cf\u7d20\u6781\u503c", x2 + 8, py(refined) + 20);
                ctx.restore();
            }
        };
        try {
            state.data.cache.taylorChart = new Chart(canvas, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        type: "line",
                        label: "\u66f2\u7ebf\u4fee\u6b63\u62df\u5408\u7ebf",
                        data: data.curve,
                        borderColor: "#0f172a",
                        borderWidth: 2.6,
                        pointRadius: 0,
                        tension: 0.18
                    },
                    {
                        label: "\u79bb\u6563\u91c7\u6837\u70b9",
                        data: data.samples,
                        pointRadius: 5.5,
                        pointBackgroundColor: "#1d4ed8",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 1.6
                    },
                    {
                        label: "\u68c0\u6d4b\u5230\u7684\u6574\u6570\u6781\u503c",
                        data: data.detected,
                        pointRadius: 7.5,
                        pointBackgroundColor: "#ef4444",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2
                    },
                    {
                        label: "\u66f2\u7ebf\u4fee\u6b63\u540e\u4f4d\u7f6e",
                        data: data.refined,
                        pointRadius: 8.5,
                        pointBackgroundColor: "#22c55e",
                        pointBorderColor: "#ffffff",
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: {
                        type: "linear",
                        min: -2,
                        max: 2,
                        grid: { color: "rgba(15,23,42,.1)" },
                        ticks: { color: "#475569", font: { size: 13 } },
                        title: { display: true, text: "\u5c3a\u5ea6\u7a7a\u95f4 x \u65b9\u5411\u504f\u79fb", color: "#334155", font: { size: 14, weight: "bold" } }
                    },
                    y: {
                        grid: { color: "rgba(15,23,42,.1)" },
                        ticks: { color: "#475569", font: { size: 13 } }
                    }
                }
            },
            plugins: [guidePlugin]
            });
            return true;
        } catch (err) {
            if (state.data.cache.taylorChart) state.data.cache.taylorChart.destroy();
            state.data.cache.taylorChart = null;
            state.data.cache.taylorChartKey = "";
            return false;
        }
    }

    function buildCache(data) {
        var f = data.focus;
        var cache = { gauss: [], dog: [], dogHeat: [], patch: patchCanvas(data.visual.gradient_patch) };
        data.gauss.forEach(function(g) { cache.gauss.push(matrixCanvas(crop(g, f.x, f.y, 48), "gray", TEX)); });
        data.dogs.forEach(function(d) {
            var c = crop(d, f.x, f.y, 48);
            cache.dog.push(matrixCanvas(c, "dog", TEX));
            cache.dogHeat.push(matrixCanvas(c, "heat", TEX));
        });
        cache.taylorChart = null;
        cache.taylorChartKey = "";
        return cache;
    }

    function applyVisualization(vis, payload) {
        payload = payload || {};
        if (!vis || !vis.gaussian || !vis.dog) {
            state.data = null;
            updateResultPanel();
            return;
        }
        var gauss = (vis.gaussian || []).map(function(m) { return resample(matrixFromPayload(m)); }).filter(Boolean);
        var dogs = (vis.dog || []).map(function(m) { return resample(matrixFromPayload(m, true)); }).filter(Boolean);
        if (gauss.length < 2 || dogs.length < 1) {
            state.data = null;
            updateResultPanel();
            return;
        }
        var baseW = vis.gaussian[0].width || W;
        var baseH = vis.gaussian[0].height || H;
        var fallback = (payload.keypoints && payload.keypoints[0]) || (payload.candidates && payload.candidates[0]) || {};
        var src = vis.focus || fallback;
        var focus = {
            x: clamp(Number(src.sample_x != null ? src.sample_x : src.octave_x != null ? src.octave_x : src.x || baseW / 2) / Math.max(1, baseW) * W, 24, W - 25),
            y: clamp(Number(src.sample_y != null ? src.sample_y : src.octave_y != null ? src.octave_y : src.y || baseH / 2) / Math.max(1, baseH) * H, 24, H - 25),
            layer: clamp(Number(src.layer || 1), 1, gauss.length - 1),
            orientation: Number(src.orientation || (vis.focus || {}).orientation || 0)
        };
        state.data = { gauss: gauss, dogs: dogs, visual: vis, focus: focus, cache: null };
        state.data.cache = buildCache(state.data);
        updateResultPanel();
    }

    function setupCanvas(canvas) {
        var rect = canvas.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.max(320, Math.floor(rect.width));
        var h = Math.max(300, Math.floor(rect.height));
        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
        }
        var ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx: ctx, w: w, h: h };
    }

    function clearSvg(svg) { while (svg && svg.firstChild) svg.removeChild(svg.firstChild); }
    function svgEl(svg, name, attrs) {
        var el = document.createElementNS("http://www.w3.org/2000/svg", name);
        Object.keys(attrs || {}).forEach(function(k) { el.setAttribute(k, attrs[k]); });
        svg.appendChild(el);
        return el;
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }

    function label(ctx, text, x, y, color, size) {
        ctx.fillStyle = color || "#334155";
        ctx.font = "800 " + (size || 15) + "px Microsoft YaHei, sans-serif";
        ctx.fillText(text, x, y);
    }

    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        var line = "";
        var yy = y;
        for (var i = 0; i < text.length; i++) {
            var test = line + text[i];
            if (ctx.measureText(test).width > maxWidth && line) {
                ctx.fillText(line, x, yy);
                line = text[i];
                yy += lineHeight;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, x, yy);
        return yy + lineHeight;
    }

    function drawEmpty(canvasId, svgId) {
        var canvas = $(canvasId);
        var svg = $(svgId);
        if (!canvas || !svg) return;
        var view = setupCanvas(canvas);
        var ctx = view.ctx;
        svg.setAttribute("viewBox", "0 0 " + view.w + " " + view.h);
        clearSvg(svg);
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, view.w, view.h);
    }

    function drawSquare(ctx, item, x, y, side, title, accent) {
        roundRect(ctx, x, y, side + 16, side + 42, 9, "#ffffff", "rgba(15,23,42,.12)");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(item.canvas, x + 8, y + 8, side, side);
        ctx.imageSmoothingEnabled = true;
        ctx.strokeStyle = accent || "rgba(15,23,42,.18)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 8, y + 8, side, side);
        label(ctx, title, x + 10, y + side + 33, "#0f1f3d", 15);
    }

    function drawPyramid() {
        var canvas = $("siftPyramidCanvas");
        var svg = $("siftPyramidSvg");
        if (!canvas || !svg) return;
        var view = setupCanvas(canvas);
        var ctx = view.ctx;
        svg.setAttribute("viewBox", "0 0 " + view.w + " " + view.h);
        clearSvg(svg);
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, view.w, view.h);
        if (!state.data) return drawEmpty("siftPyramidCanvas", "siftPyramidSvg");
        var pad = 18;
        var side = Math.min((view.w - pad * 2 - 28) / 3 - 12, (view.h - 110) / 2 - 38, 118);
        side = Math.max(58, side);
        label(ctx, "高斯层", pad, 26, "#0f1f3d", 13);
        for (var i = 0; i < Math.min(3, state.data.cache.gauss.length); i++) {
            var x = pad + i * (side + 22);
            drawSquare(ctx, state.data.cache.gauss[i], x, 42, side, "高斯" + i, i === Math.round(state.data.focus.layer) ? "#0ea5e9" : "rgba(15,23,42,.18)");
        }
        var dogY = 42 + side + 74;
        label(ctx, "高斯差分", pad, dogY - 16, "#0f1f3d", 13);
        for (var j = 0; j < Math.min(3, state.data.cache.dog.length); j++) {
            var dx = pad + j * (side + 22);
            drawSquare(ctx, state.data.cache.dog[j], dx, dogY, side, "差分" + j, j === Math.round(state.data.focus.layer) - 1 ? "#ef4444" : "rgba(15,23,42,.18)");
        }
    }

    function drawDogStage(ctx, svg, view) {
        var side = Math.min((view.w - 90) / 3, view.h * 0.35, 150);
        var topY = view.h * 0.12;
        var botY = view.h * 0.58;
        var x0 = (view.w - side * 3 - 50) / 2;
        for (var i = 0; i < 3; i++) {
            drawSquare(ctx, state.data.cache.gauss[i] || state.data.cache.gauss[0], x0 + i * (side + 25), topY, side, "高斯" + i, "#0ea5e9");
            if (i < 2) drawSquare(ctx, state.data.cache.dog[i] || state.data.cache.dog[0], x0 + i * (side + 25) + side * 0.54, botY, side, "差分" + i, "#ef4444");
        }
        for (var a = 0; a < 2; a++) {
            var ax = x0 + a * (side + 25) + side;
            var bx = x0 + a * (side + 25) + side * 1.04;
            var cx = ax + side * 0.35;
            var cy = (topY + side + botY) / 2;
            svgEl(svg, "line", { x1: ax, y1: topY + side + 6, x2: cx, y2: botY - 8, stroke: "#0ea5e9", "stroke-width": 2, "stroke-dasharray": "7 7" });
            svgEl(svg, "line", { x1: bx + side * 0.42, y1: topY + side + 6, x2: cx, y2: botY - 8, stroke: "#0ea5e9", "stroke-width": 2, "stroke-dasharray": "7 7" });
            svgEl(svg, "circle", { cx: cx, cy: cy, r: 15, fill: "#fff7ed", stroke: "#f59e0b", "stroke-width": 2 });
            svgEl(svg, "text", { x: cx - 5, y: cy + 7, fill: "#f59e0b", "font-size": 24, "font-weight": 900 }).textContent = "-";
        }
    }

    function cubeData() {
        var cube = state.data && state.data.visual ? state.data.visual.cube : null;
        if (!cube || cube.length !== 3) return null;
        var maxAbs = 1e-6;
        for (var z = 0; z < 3; z++) for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) maxAbs = Math.max(maxAbs, Math.abs(Number(cube[z][y][x] || 0)));
        return { cube: cube, maxAbs: maxAbs };
    }

    function drawCubeStage(ctx, svg, view, t) {
        var d = cubeData();
        if (!d) return;
        var cell = Math.min(view.h * 0.105, view.w * 0.075);
        var x0 = view.w * 0.12;
        var y0 = view.h * 0.08;
        var scan = Math.floor((t * 7) % 26);
        var cursor = 0, center = null, active = null;
        for (var z = 0; z < 3; z++) {
            var oy = y0 + z * (cell * 3 + 24);
            label(ctx, z === 0 ? "上一层" : z === 1 ? "当前层" : "下一层", x0, oy - 8, "#334155", 12);
            for (var y = 0; y < 3; y++) {
                for (var x = 0; x < 3; x++) {
                    var global = z * 9 + y * 3 + x;
                    var v = Number(d.cube[z][y][x] || 0);
                    var color = viridis(0.5 + v / (d.maxAbs * 2));
                    var px = x0 + x * cell;
                    var py = oy + y * cell;
                    var isCenter = global === 13;
                    var isActive = !isCenter && cursor++ === scan;
                    ctx.fillStyle = isCenter ? "#bbf7d0" : css(color);
                    ctx.fillRect(px, py, cell - 4, cell - 4);
                    ctx.strokeStyle = isCenter ? "#22c55e" : isActive ? "#f59e0b" : "rgba(15,23,42,.22)";
                    ctx.lineWidth = isCenter || isActive ? 3 : 1.2;
                    ctx.strokeRect(px, py, cell - 4, cell - 4);
                    ctx.fillStyle = "#0f172a";
                    ctx.font = "700 13px Consolas, monospace";
                    ctx.fillText(v.toFixed(2), px + 4, py + cell * 0.58);
                    if (isCenter) center = { x: px + cell / 2, y: py + cell / 2 };
                    if (isActive) active = { x: px + cell / 2, y: py + cell / 2 };
                }
            }
        }
        if (center && active) svgEl(svg, "line", { x1: center.x, y1: center.y, x2: active.x, y2: active.y, stroke: "#f59e0b", "stroke-width": 3, "stroke-dasharray": "6 6" });
        drawTaylorBetter(ctx, svg, view, t);
    }

    function drawTaylorFallbackChart(ctx, rect) {
        var data = fitTaylorCurve();
        var all = data.curve.concat(data.samples, data.detected, data.refined);
        var minY = Infinity, maxY = -Infinity;
        all.forEach(function(p) {
            minY = Math.min(minY, Number(p.y || 0));
            maxY = Math.max(maxY, Number(p.y || 0));
        });
        if (!isFinite(minY) || !isFinite(maxY) || Math.abs(maxY - minY) < 1e-9) {
            minY -= 1;
            maxY += 1;
        }
        var padL = 42, padR = 14, padT = 16, padB = 34;
        var x0 = rect.x + padL;
        var y0 = rect.y + padT;
        var w = rect.w - padL - padR;
        var h = rect.h - padT - padB;
        function px(x) { return x0 + (x + 2) / 4 * w; }
        function py(y) { return y0 + (1 - (y - minY) / (maxY - minY)) * h; }
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = "rgba(15,23,42,.16)";
        ctx.lineWidth = 1;
        ctx.font = "800 13px Microsoft YaHei, sans-serif";
        ctx.fillStyle = "#475569";
        for (var gx = -2; gx <= 2; gx++) {
            ctx.beginPath();
            ctx.moveTo(px(gx), y0);
            ctx.lineTo(px(gx), y0 + h);
            ctx.stroke();
            ctx.fillText(String(gx), px(gx) - 4, y0 + h + 22);
        }
        for (var gy = 0; gy <= 3; gy++) {
            var yy = y0 + gy / 3 * h;
            ctx.beginPath();
            ctx.moveTo(x0, yy);
            ctx.lineTo(x0 + w, yy);
            ctx.stroke();
        }
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        data.curve.forEach(function(p, i) {
            if (i === 0) ctx.moveTo(px(p.x), py(p.y));
            else ctx.lineTo(px(p.x), py(p.y));
        });
        ctx.stroke();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(29,78,216,.45)";
        data.samples.forEach(function(p) {
            ctx.beginPath();
            ctx.moveTo(px(p.x), y0 + h);
            ctx.lineTo(px(p.x), py(p.y));
            ctx.stroke();
        });
        ctx.setLineDash([]);
        function dot(p, color, r) {
            ctx.beginPath();
            ctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        data.samples.forEach(function(p) { dot(p, "#1d4ed8", 5); });
        dot(data.detected[0], "#ef4444", 7);
        dot(data.refined[0], "#22c55e", 8);
        var d0 = data.detected[0], d1 = data.refined[0];
        var dir = px(d1.x) >= px(d0.x) ? 1 : -1;
        ctx.strokeStyle = "#0f172a";
        ctx.fillStyle = "#0f172a";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(px(d0.x), py(d0.y) - 18);
        ctx.lineTo(px(d1.x), py(d1.y) - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px(d1.x), py(d1.y) - 18);
        ctx.lineTo(px(d1.x) - dir * 8, py(d1.y) - 23);
        ctx.lineTo(px(d1.x) - dir * 8, py(d1.y) - 13);
        ctx.closePath();
        ctx.fill();
        ctx.font = "900 15px Microsoft YaHei, sans-serif";
        ctx.fillText("修正量 " + data.offset.toFixed(3), Math.min(px(d0.x), px(d1.x)) + 8, Math.min(py(d0.y), py(d1.y)) - 28);
        ctx.fillStyle = "#ef4444";
        ctx.fillText("整数极值", px(d0.x) + 8, py(d0.y) - 10);
        ctx.fillStyle = "#16a34a";
        ctx.fillText("修正后位置", px(d1.x) + 8, py(d1.y) + 22);
        ctx.fillStyle = "#334155";
        ctx.font = "800 14px Microsoft YaHei, sans-serif";
        ctx.fillText("横轴: 离中心点的偏移", x0, rect.y + rect.h - 8);
        ctx.restore();
    }

    function drawTaylorBetter(ctx, svg, view, t) {
        var off = state.data.visual.taylor ? state.data.visual.taylor.offset || [0, 0, 0] : [0, 0, 0];
        var x0 = view.w * 0.55;
        var y0 = view.h * 0.14;
        var w = view.w * 0.34;
        var h = view.h * 0.62;
        roundRect(ctx, x0, y0, w, h, 10, "#ffffff", "rgba(15,23,42,.12)");
        label(ctx, "亚像素位置修正", x0 + 16, y0 + 32, "#0f1f3d", 20);
        var chartRect = { x: x0 + 14, y: y0 + 46, w: w - 28, h: h - 112 };
        hideTaylorChart();
        drawTaylorFallbackChart(ctx, chartRect);
        ctx.fillStyle = "#334155";
        ctx.font = "900 17px Microsoft YaHei, sans-serif";
        ctx.fillText("修正量=[" + off.map(function(n) { return Number(n || 0).toFixed(3); }).join(", ") + "]", x0 + 16, y0 + h - 42);
        ctx.fillText("对比度 " + Number((state.data.visual.taylor || {}).contrast || 0).toFixed(5), x0 + 16, y0 + h - 18);
    }

    function drawTaylor(ctx, svg, view, t) {
        var off = state.data.visual.taylor ? state.data.visual.taylor.offset || [0, 0, 0] : [0, 0, 0];
        var x0 = view.w * 0.55;
        var y0 = view.h * 0.14;
        var w = view.w * 0.34;
        var h = view.h * 0.62;
        roundRect(ctx, x0, y0, w, h, 10, "#ffffff", "rgba(15,23,42,.12)");
        label(ctx, "曲线修正亚像素位置", x0 + 16, y0 + 30, "#0f1f3d", 14);
        var chartRect = { x: x0 + 14, y: y0 + 46, w: w - 28, h: h - 112 };
        if (!renderTaylorChartRich(view, chartRect)) {
            ctx.fillStyle = "#64748b";
            ctx.font = "800 15px Microsoft YaHei, sans-serif";
            ctx.fillText("数学曲线组件加载后显示亚像素拟合曲线", chartRect.x + 12, chartRect.y + 44);
        }
        ctx.fillStyle = "#334155";
        ctx.font = "700 15px Microsoft YaHei, sans-serif";
        ctx.fillText("修正量=[" + off.map(function(n) { return Number(n || 0).toFixed(3); }).join(", ") + "]", x0 + 16, y0 + h - 42);
        ctx.fillText("对比度=" + Number((state.data.visual.taylor || {}).contrast || 0).toFixed(5), x0 + 16, y0 + h - 20);
    }

    function drawHessianText(ctx, svg, view) {
        var h = state.data.visual.hessian || { matrix: [[1, 0], [0, 1]], ratio: 0, limit: 12.1, keep: true };
        var x0 = view.w * 0.07;
        var y0 = view.h * 0.1;
        var w = view.w * 0.86;
        var hgt = view.h * 0.74;
        roundRect(ctx, x0, y0, w, hgt, 12, "#ffffff", "rgba(15,23,42,.12)");
        var H = h.matrix || [[1, 0], [0, 1]];
        var a = Number((H[0] || [])[0] || 0);
        var b = Number((H[0] || [])[1] || 0);
        var c = Number((H[1] || [])[1] || 0);
        var ratio = Number(h.ratio || 0);
        var limit = Number(h.limit || 12.1);
        var keep = !!h.keep;
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 28px Microsoft YaHei, sans-serif";
        ctx.fillText("边缘点剔除：留下山峰，丢掉山脊", x0 + 26, y0 + 50);
        ctx.fillStyle = "#334155";
        ctx.font = "800 20px Microsoft YaHei, sans-serif";
        var nextY = wrapText(ctx, "SIFT 只保留定位准的点：像山峰一样，往各个方向走都很陡，位置才稳定；像山脊一样，沿着一条方向容易滑动，就要剔除。", x0 + 26, y0 + 92, w - 52, 30);
        var leftX = x0 + 26;
        var rightX = x0 + w * 0.52;
        var boxY = nextY + 20;
        roundRect(ctx, leftX, boxY, w * 0.42, 132, 10, "rgba(248,250,252,.95)", "rgba(15,23,42,.1)");
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 21px Microsoft YaHei, sans-serif";
        ctx.fillText("方向陡峭雷达 H", leftX + 18, boxY + 34);
        ctx.fillStyle = "#172554";
        ctx.font = "900 20px Cascadia Code, Consolas, monospace";
        ctx.fillText("[ " + a.toFixed(4) + "   " + b.toFixed(4) + " ]", leftX + 18, boxY + 76);
        ctx.fillText("[ " + b.toFixed(4) + "   " + c.toFixed(4) + " ]", leftX + 18, boxY + 108);
        roundRect(ctx, rightX, boxY, w * 0.42, 132, 10, "rgba(248,250,252,.95)", "rgba(15,23,42,.1)");
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 21px Microsoft YaHei, sans-serif";
        ctx.fillText("山脊指数打分器", rightX + 18, boxY + 34);
        ctx.fillStyle = "#172554";
        ctx.font = "900 20px Cascadia Code, Consolas, monospace";
        ctx.fillText("Tr(H)^2 / Det(H) < 12.1", rightX + 18, boxY + 78);
        ctx.fillStyle = "#64748b";
        ctx.font = "800 17px Microsoft YaHei, sans-serif";
        ctx.fillText("分数越高越像山脊，越不稳定", rightX + 18, boxY + 110);
        var barX = x0 + 26;
        var barY = boxY + 172;
        var barW = w - 52;
        var barH = 34;
        var p = clamp(ratio / Math.max(limit * 1.35, 1e-6), 0, 1);
        roundRect(ctx, barX, barY, barW, barH, 14, "rgba(15,23,42,.1)", null);
        roundRect(ctx, barX, barY, barW * p, barH, 14, keep ? "#22c55e" : "#ef4444", null);
        ctx.fillStyle = "#334155";
        ctx.font = "900 20px Microsoft YaHei, sans-serif";
        ctx.fillText("当前山脊指数 " + ratio.toFixed(3) + (keep ? " < " : " ≥ ") + "阈值 " + limit.toFixed(1), barX, barY + 62);
        ctx.fillStyle = keep ? "#15803d" : "#dc2626";
        ctx.font = "900 28px Microsoft YaHei, sans-serif";
        ctx.fillText(keep ? "结果：保留。它更像稳定的山峰，定位比较准。" : "结果：剔除。它更像容易滑动的山脊。", barX, barY + 112);
    }

    function drawContour(ctx, svg, view) {
        var h = state.data.visual.hessian || { matrix: [[1, 0], [0, 1]], ratio: 0, limit: 12.1, keep: true };
        var x0 = view.w * 0.08;
        var y0 = view.h * 0.12;
        var w = view.w * 0.84;
        var hgt = view.h * 0.68;
        roundRect(ctx, x0, y0, w, hgt, 12, "#ffffff", "rgba(15,23,42,.12)");
        var H = h.matrix || [[1, 0], [0, 1]];
        var a = Number((H[0] || [])[0] || 0);
        var b = Number((H[0] || [])[1] || 0);
        var c = Number((H[1] || [])[1] || 0);
        var ratio = Number(h.ratio || 0);
        var limit = Number(h.limit || 12.1);
        var keep = !!h.keep;
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 22px Microsoft YaHei, sans-serif";
        ctx.fillText("边缘点剔除判决", x0 + 24, y0 + 42);
        ctx.font = "800 18px Microsoft YaHei, sans-serif";
        ctx.fillText("H = [" + a.toFixed(4) + "  " + b.toFixed(4) + ";  " + b.toFixed(4) + "  " + c.toFixed(4) + "]", x0 + 24, y0 + 92);
        ctx.fillText("判定公式：Tr(H)² / Det(H) < (γ + 1)² / γ，γ = 10", x0 + 24, y0 + 136);
        ctx.fillText("阈值：" + limit.toFixed(3) + "    当前值：" + ratio.toFixed(3), x0 + 24, y0 + 180);
        var barX = x0 + 24;
        var barY = y0 + 220;
        var barW = w - 48;
        var barH = 22;
        var barP = clamp(ratio / Math.max(limit * 1.35, 1e-6), 0, 1);
        roundRect(ctx, barX, barY, barW, barH, 11, "rgba(15,23,42,.1)", null);
        roundRect(ctx, barX, barY, barW * barP, barH, 11, keep ? "#22c55e" : "#ef4444", null);
        ctx.fillStyle = keep ? "#15803d" : "#dc2626";
        ctx.font = "900 24px Microsoft YaHei, sans-serif";
        ctx.fillText(keep ? "结果：保留。该点更像稳定峰值。" : "结果：剔除。该点更像边缘响应。", x0 + 24, y0 + 292);
        ctx.fillStyle = "#475569";
        ctx.font = "800 17px Microsoft YaHei, sans-serif";
        ctx.fillText("含义：曲率比越大，说明局部结构越细长，越容易只是边缘而不是稳定关键点。", x0 + 24, y0 + 338);
    }

    function textPanel(ctx, x, y, w, lines, accent) {
        roundRect(ctx, x, y, w, 34 + lines.length * 24, 10, "#ffffff", "rgba(15,23,42,.12)");
        ctx.fillStyle = accent || "#0f1f3d";
        ctx.font = "800 14px Microsoft YaHei, sans-serif";
        ctx.fillText(lines[0], x + 14, y + 26);
        ctx.fillStyle = "#334155";
        ctx.font = "700 12px Consolas, Microsoft YaHei, sans-serif";
        for (var i = 1; i < lines.length; i++) ctx.fillText(lines[i], x + 14, y + 26 + i * 24);
    }

    function drawGradientPatch(ctx, svg, view, t, descriptorMode) {
        var patch = state.data.visual.gradient_patch;
        if (!patch || patch.length !== PATCH || !state.data.cache.patch) return null;
        var side = Math.min(view.w * 0.48, view.h * 0.68);
        var ox = view.w * 0.07;
        var oy = view.h * 0.14;
        var cell = side / PATCH;
        var main = Number((state.data.visual.focus || {}).orientation || state.data.focus.orientation || 0) * Math.PI / 180;
        ctx.save();
        if (descriptorMode) {
            var p = ease(clamp(((t % 8) / 8 - 0.05) / 0.25, 0, 1));
            ctx.translate(ox + side / 2, oy + side / 2);
            ctx.rotate(-main * p);
            ctx.translate(-(ox + side / 2), -(oy + side / 2));
        }
        roundRect(ctx, ox - 10, oy - 10, side + 20, side + 20, 10, "#ffffff", "rgba(15,23,42,.12)");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(state.data.cache.patch, ox, oy, side, side);
        ctx.imageSmoothingEnabled = true;
        var scanX = Math.floor(((t % 5) / 5) * PATCH);
        for (var y = 0; y < PATCH; y++) {
            for (var x = 0; x < PATCH; x++) {
                var g = patch[y][x] || {};
                var mag = clamp(Number(g.mag || 0) * 24, 0, 1);
                var a = Number(g.angle || 0);
                var weight = clamp(Number(g.weight || 0), 0, 1);
                var len = cell * (0.12 + mag * 0.36);
                var cx = ox + x * cell + cell / 2;
                var cy = oy + y * cell + cell / 2;
                var flash = x === scanX && !descriptorMode;
                var col = viridis(mag * (0.6 + weight * 0.4));
                ctx.strokeStyle = flash ? "#ef4444" : css(col);
                ctx.lineWidth = flash ? 2.8 : 1.4;
                ctx.beginPath();
                ctx.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
                ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
                ctx.stroke();
            }
        }
        if (!descriptorMode) {
            var grd = ctx.createRadialGradient(ox + side / 2, oy + side / 2, side * 0.08, ox + side / 2, oy + side / 2, side * 0.58);
            grd.addColorStop(0, "rgba(255,255,255,0)");
            grd.addColorStop(1, "rgba(0,0,0,.38)");
            ctx.fillStyle = grd;
            ctx.fillRect(ox, oy, side, side);
            ctx.fillStyle = "rgba(255,255,255,.22)";
            ctx.fillRect(ox + scanX * cell, oy, cell, side);
        } else {
            ctx.strokeStyle = "#0f172a";
            ctx.lineWidth = 2.3;
            for (var k = 0; k <= 4; k++) {
                ctx.beginPath();
                ctx.moveTo(ox + k * 4 * cell, oy);
                ctx.lineTo(ox + k * 4 * cell, oy + side);
                ctx.moveTo(ox, oy + k * 4 * cell);
                ctx.lineTo(ox + side, oy + k * 4 * cell);
                ctx.stroke();
            }
        }
        ctx.restore();
        return { x: ox, y: oy, side: side, cell: cell };
    }

    function drawHist(svg, view, t) {
        var hist = state.data.visual.orientation_hist || state.data.visual.orientation_hist_raw || [];
        if (hist.length !== 36) return;
        var x0 = view.w * 0.62;
        var y0 = view.h * 0.16;
        var w = view.w * 0.3;
        var h = view.h * 0.58;
        var max = Math.max.apply(null, hist.concat([1e-6]));
        var focusAngle = Number((state.data.visual.focus || {}).orientation || state.data.focus.orientation || 0);
        var peak = ((Math.round(focusAngle / 10) % 36) + 36) % 36;
        if (!(hist[peak] > 0)) {
            peak = 0;
            for (var i = 1; i < hist.length; i++) if (hist[i] > hist[peak]) peak = i;
            focusAngle = peak * 10;
        }
        svgEl(svg, "rect", { x: x0, y: y0, width: w, height: h, rx: 10, fill: "rgba(255,255,255,.92)", stroke: "rgba(15,23,42,.12)" });
        var cx = x0 + w / 2;
        var cy = y0 + h / 2 + 12;
        var baseR = Math.min(w, h) * 0.13;
        var maxR = Math.min(w, h) * 0.42;
        var growth = ease((t % 5) / 5);
        for (var b = 0; b < 36; b++) {
            var angle = -Math.PI / 2 + b / 36 * Math.PI * 2;
            var length = (maxR - baseR) * (Number(hist[b] || 0) / max) * growth;
            var r1 = baseR;
            var r2 = baseR + length;
            var col = b === peak ? "#ef4444" : css(viridis(Number(hist[b] || 0) / max));
            svgEl(svg, "line", {
                x1: cx + Math.cos(angle) * r1,
                y1: cy + Math.sin(angle) * r1,
                x2: cx + Math.cos(angle) * r2,
                y2: cy + Math.sin(angle) * r2,
                stroke: col,
                "stroke-width": b === peak ? 4 : 2.2,
                "stroke-linecap": "round"
            });
        }
        svgEl(svg, "circle", { cx: cx, cy: cy, r: baseR, fill: "rgba(14,165,233,.08)", stroke: "rgba(15,23,42,.16)", "stroke-width": 1.5 });
        svgEl(svg, "circle", { cx: cx, cy: cy, r: maxR, fill: "none", stroke: "rgba(15,23,42,.1)", "stroke-width": 1, "stroke-dasharray": "4 5" });
        var main = -Math.PI / 2 + peak / 36 * Math.PI * 2;
        svgEl(svg, "line", {
            x1: cx,
            y1: cy,
            x2: cx + Math.cos(main) * maxR * 0.94,
            y2: cy + Math.sin(main) * maxR * 0.94,
            stroke: "#ef4444",
            "stroke-width": 3,
            "stroke-linecap": "round"
        });
        svgEl(svg, "text", { x: x0 + 14, y: y0 + 30, fill: "#0f1f3d", "font-size": 16, "font-weight": 800 }).textContent = "36 柱方向图";
        svgEl(svg, "text", { x: x0 + 14, y: y0 + h - 18, fill: "#ef4444", "font-size": 15, "font-weight": 800 }).textContent = "主方向 " + Math.round(focusAngle) + "°";
    }

    function drawOrientationStage(ctx, svg, view, t) {
        drawGradientPatch(ctx, svg, view, t, false);
        drawHist(svg, view, t);
    }

    function drawStars(ctx, view, t) {
        var desc = state.data.visual.descriptor || [];
        if (desc.length !== 128) return;
        var side = Math.min(view.w * 0.32, view.h * 0.58);
        var x0 = view.w * 0.62;
        var y0 = view.h * 0.16;
        roundRect(ctx, x0, y0, side, side, 10, "#ffffff", "rgba(15,23,42,.12)");
        var gap = side / 4;
        var flow = ease(clamp(((t % 8) / 8 - 0.32) / 0.42, 0, 1));
        for (var by = 0; by < 4; by++) {
            for (var bx = 0; bx < 4; bx++) {
                var cx = x0 + bx * gap + gap / 2;
                var cy = y0 + by * gap + gap / 2;
                ctx.strokeStyle = "rgba(20,184,166," + (0.25 + flow * 0.65).toFixed(2) + ")";
                ctx.fillStyle = "rgba(20,184,166,.08)";
                ctx.beginPath();
                for (var k = 0; k < 8; k++) {
                    var a = -Math.PI / 2 + k / 8 * Math.PI * 2;
                    var r = gap * (0.08 + 0.38 * clamp(Number(desc[(by * 4 + bx) * 8 + k] || 0) / 0.35, 0, 1) * flow);
                    var x = cx + Math.cos(a) * r;
                    var y = cy + Math.sin(a) * r;
                    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    function drawDescriptorStage(ctx, svg, view, t) {
        var info = drawGradientPatch(ctx, svg, view, t, true);
        drawStars(ctx, view, t);
        if (!info) return;
        var flow = ease(clamp(((t % 8) / 8 - 0.32) / 0.42, 0, 1));
        for (var by = 0; by < 4; by++) {
            for (var bx = 0; bx < 4; bx++) {
                var sx = info.x + (bx * 4 + 2) * info.cell;
                var sy = info.y + (by * 4 + 2) * info.cell;
                var tx = view.w * 0.62 + bx * (Math.min(view.w * 0.32, view.h * 0.58) / 4) + Math.min(view.w * 0.32, view.h * 0.58) / 8;
                var ty = view.h * 0.16 + by * (Math.min(view.w * 0.32, view.h * 0.58) / 4) + Math.min(view.w * 0.32, view.h * 0.58) / 8;
                svgEl(svg, "line", { x1: sx, y1: sy, x2: lerp(sx, tx, flow), y2: lerp(sy, ty, flow), stroke: "rgba(20,184,166,.32)", "stroke-width": 2 });
            }
        }
        // var strip = $("descriptorStrip");
        // if (strip) {
        //     var v = state.data.visual;
        //     strip.textContent = arrayRow("归一化", v.descriptor_norm || [], 14) + "\n" + arrayRow("截断", v.descriptor_clipped || [], 14) + "\n" + arrayRow("再归一化", v.descriptor || [], 14);
        //     strip.classList.add("active");
        //     strip.style.opacity = "1";
        // }
    }

    function drawStage(t) {
        var canvas = $("siftMicroCanvas");
        var svg = $("siftMicroSvg");
        if (!canvas || !svg) return;
        var view = setupCanvas(canvas);
        var ctx = view.ctx;
        svg.setAttribute("viewBox", "0 0 " + view.w + " " + view.h);
        clearSvg(svg);
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, view.w, view.h);
        if (state.stage !== 1) hideTaylorChart();
        var strip = $("descriptorStrip");
        if (strip && state.stage !== 4) {
            strip.textContent = "";
            strip.classList.remove("active");
            strip.style.opacity = "0";
        }
        if (!state.data) return drawEmpty("siftMicroCanvas", "siftMicroSvg");
        if (state.stage === 0) drawDogStage(ctx, svg, view);
        else if (state.stage === 1) drawCubeStage(ctx, svg, view, t);
        else if (state.stage === 2) drawHessianText(ctx, svg, view);
        else if (state.stage === 3) drawOrientationStage(ctx, svg, view, t);
        else drawDescriptorStage(ctx, svg, view, t);
    }

    function arrayRow(labelText, arr, count) {
        var nums = [];
        for (var i = 0; i < Math.min(count, arr.length); i++) nums.push(Number(arr[i] || 0).toFixed(2));
        return labelText + " [" + nums.join(", ") + (arr.length > count ? ", ..." : "") + "]";
    }

    function updateResultPanel() {
        var panel = $("siftResultPanel");
        if (!panel) return;
        if (!state.data) {
            panel.innerHTML = '<div class="sift-result-empty">' + state.message + "</div>";
            return;
        }
        var v = state.data.visual;
        var cleanHtml = "";
        if (state.stage === 0) {
            cleanHtml = steps(["高斯模糊得到不同尺度的图像。", "相邻尺度相减得到高斯差分图。", "亮处表示这个尺度上的变化更强。"]) + metricBlocks([["高斯0", state.data.cache.gauss[0].stats], ["高斯1", state.data.cache.gauss[1].stats], ["差分0", state.data.cache.dog[0].stats]]);
        } else if (state.stage === 1) {
            cleanHtml = steps(["中心点和周围 26 个邻居逐个比较。", "如果它是局部最大或最小，就继续做曲线亚像素修正。", "修正量=" + ((v.taylor || {}).offset || []).map(function(n) { return Number(n || 0).toFixed(3); }).join(", ")]);
        } else if (state.stage === 2) {
            var hh = v.hessian || {};
            cleanHtml = steps([
                "把候选点想成地形：山峰稳定，山脊容易滑动。",
                "H 是探测各个方向陡峭程度的雷达；公式算出的就是山脊指数。",
                "当前 " + Number(hh.ratio || 0).toFixed(3) + (hh.keep ? " < " : " ≥ ") + Number(hh.limit || 12.1).toFixed(1) + "，" + (hh.keep ? "更像山峰，保留" : "更像山脊，剔除")
            ]);
        } else if (state.stage === 3) {
            var pk = peakInfo(v.orientation_hist || []);
            var angle = Number((v.focus || {}).orientation || state.data.focus.orientation || pk.angle || 0);
            cleanHtml = steps(["每个像素按梯度强度和距离中心的权重投票。", "36 个方向格中最高的格子就是主方向。", "主方向约 " + Math.round(angle) + "°"]);
        } else {
            cleanHtml = steps(["邻域先按主方向对齐。", "16x16 区域被分成 4x4 个小块。", "每个小块统计 8 个方向，最终得到 128 维描述子。"]) + '<div class="sift-result-lines"><div>' + arrayRow("描述子", v.descriptor || [], 16) + "</div></div>";
        }
        panel.innerHTML = cleanHtml;
        return;
        var html = "";
        if (state.stage === 0) {
            html = steps(["高斯平滑得到不同尺度图像", "相邻尺度相减得到高斯差分", "亮处表示差分响应更强"]) + metricBlocks([["高斯0", state.data.cache.gauss[0].stats], ["高斯1", state.data.cache.gauss[1].stats], ["差分0", state.data.cache.dog[0].stats]]);
        } else if (state.stage === 1) {
            html = steps(["中心点与 26 个邻居逐个比较", "离散极值通过曲线展开做亚像素定位", "修正量=" + ((v.taylor || {}).offset || []).map(function(n) { return Number(n || 0).toFixed(3); }).join(", ")]);
        } else if (state.stage === 2) {
            var h = v.hessian || {};
            html = steps(["用 Hessian 矩阵衡量局部曲率", "曲率比越大，越像边缘响应", "曲率比 " + Number(h.ratio || 0).toFixed(3) + " / " + Number(h.limit || 12.1).toFixed(1) + "，" + (h.keep ? "保留" : "剔除")]);
        } else if (state.stage === 3) {
            var peak = peakInfo(v.orientation_hist || []);
            var focusAngle = Number((v.focus || {}).orientation || state.data.focus.orientation || peak.angle || 0);
            html = steps(["每个像素按梯度强度和距离中心的权重投票", "36 个方向格，每格代表 10°", "主方向 " + Math.round(focusAngle) + "°"]);
        } else {
            html = steps(["邻域按主方向逆向旋转", "分成 4x4 个小区域", "每个小区域统计 8 个方向，得到 128 维描述子"]) + '<div class="sift-result-lines"><div>' + arrayRow("描述子", v.descriptor || [], 16) + "</div></div>";
        }
        panel.innerHTML = html;
    }

    function steps(lines) {
        return '<div class="sift-formula-steps">' + lines.map(function(line, i) {
            return "<div><span>" + (i + 1) + "</span><code>" + line + "</code></div>";
        }).join("") + "</div>";
    }

    function metricBlocks(items) {
        return '<div class="sift-result-grid">' + items.map(function(item) {
            var s = item[1];
            return '<div class="sift-result-block"><strong>' + item[0] + '</strong><p>min ' + s.min.toFixed(3) + " · max " + s.max.toFixed(3) + " · mean " + s.mean.toFixed(3) + "</p></div>";
        }).join("") + "</div>";
    }

    function peakInfo(arr) {
        if (!arr || !arr.length) return { index: -1, angle: 0, value: 0 };
        var peak = 0;
        for (var i = 1; i < arr.length; i++) if (Number(arr[i] || 0) > Number(arr[peak] || 0)) peak = i;
        return { index: peak, angle: peak * 10, value: Number(arr[peak] || 0) };
    }

    function updateText() {
        var name = $("siftStageName");
        var hint = $("siftStageHint");
        var formula = $("siftStageFormula");
        var note = $("siftStageNote");
        if (name) name.textContent = names[state.stage];
        if (hint) hint.textContent = hints[state.stage];
        if (note) note.textContent = notes[state.stage];
        if (formula) {
            formula.textContent = "";
            formula.dataset.katex = formulas[state.stage];
            if (window.katex) katex.render(formulas[state.stage], formula, { throwOnError: false });
        }
        document.querySelectorAll("#siftStageTabs button").forEach(function(btn) {
            var idx = Number(btn.dataset.stage);
            btn.textContent = tabLabels[idx] || btn.textContent;
            btn.classList.toggle("active", idx === state.stage);
        });
        updateResultPanel();
    }

    function loop(now) {
        if (!state.active) return;
        var t = now / 1000;
        drawPyramid();
        drawStage(t);
        state.raf = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (!state.active) return;
        cancelAnimationFrame(state.raf);
        state.raf = requestAnimationFrame(loop);
    }

    function setActive(active) {
        state.active = !!active;
        cancelAnimationFrame(state.raf);
        if (state.active) startLoop();
    }

    function start() {
        if (state.started) return;
        state.started = true;
        updateText();
        setActive($("viewKnowledge") && $("viewKnowledge").style.display !== "none");
    }

    function init() {
        if (!$("siftLab")) return;
        document.querySelectorAll("#siftStageTabs button").forEach(function(btn) {
            btn.addEventListener("click", function() {
                state.stage = Number(btn.dataset.stage || 0);
                updateText();
                drawPyramid();
                drawStage(performance.now() / 1000);
            });
        });
        document.querySelectorAll(".view-tab").forEach(function(tab) {
            tab.addEventListener("click", function() {
                if (this.dataset.view === "knowledge") {
                    start();
                    setActive(true);
                } else {
                    setActive(false);
                }
            });
        });
        window.addEventListener("resize", function() {
            if (state.active) {
                drawPyramid();
                drawStage(performance.now() / 1000);
            }
        });
        window.addEventListener("feature:data", function(ev) {
            if (!ev.detail || ev.detail.moduleKey !== "sift") return;
            if (ev.detail.payload && ev.detail.payload.message) state.message = ev.detail.payload.message;
            applyVisualization(ev.detail.payload && !ev.detail.payload.empty ? ev.detail.payload.visualization || {} : null, ev.detail.payload || {});
            if (!state.started) start();
            updateText();
            if (state.active) startLoop();
        });
        updateText();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
