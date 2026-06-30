(function() {
    var W = 96;
    var H = 72;
    var LOCAL_WIN = 13;
    var HALF = Math.floor(LOCAL_WIN / 2);
    var state = {
        stage: 0,
        started: false,
        raf: 0,
        data: null,
        message: "\u8bf7\u5148\u4e0a\u4f20\u56fe\u7247\u751f\u6210\u771f\u5b9e\u6f14\u793a\u6570\u636e",
        focus: { x: 48, y: 36 },
        target: { x: 48, y: 36 }
    };

    var formulas = [
        "I(i+u,j+v) \\approx I(i,j)+uI_x+vI_y",
        "M=\\sum w\\begin{bmatrix}I_x^2&I_xI_y\\\\I_xI_y&I_y^2\\end{bmatrix}",
        "\\theta=\\lambda_1\\lambda_2-0.04(\\lambda_1+\\lambda_2)^2",
        "\\theta=det(M)-0.04\\,trace(M)^2",
        "M'=\\sum w\\,M(R_\\phi s[u,v])"
    ];
    var names = [
        "局部灰度怎么变",
        "汇总窗口里的变化",
        "看它更像角还是边",
        "只留下最强角点",
        "旋转和放大窗口"
    ];
    var tabLabels = ["局部变化", "变化汇总", "角/边判断", "筛最强点", "旋转放大"];
    var hints = [
        "\u70b9\u51fb\u5de6\u56fe\u9009\u62e9\u89c2\u5bdf\u70b9\uff0c\u53f3\u4fa7\u653e\u5927\u5b83\u5468\u56f4 13x13 \u50cf\u7d20\uff0c\u7bad\u5934\u8868\u793a\u7070\u5ea6\u53d8\u5316\u7684\u65b9\u5411\u548c\u5f3a\u5ea6\u3002",
        "把 13x13 窗口里的水平变化、竖直变化和共同变化分别加权汇总，得到这个位置的整体变化情况。",
        "两个方向都变化很强，才像角点；只有一个方向强，更像边；两个方向都弱，就是平坦区域。",
        "先给每个像素算角点分数，再在 3x3 邻域里只保留分数最高的位置。",
        "\u8fd9\u91cc\u65cb\u8f6c\u6216\u653e\u5927\u7684\u662f\u539f\u56fe\u4e0a\u7684\u68c0\u6d4b\u7a97\u53e3\uff0c\u4e0d\u662f\u76f4\u63a5\u62c9\u4f38\u7ea2\u8272\u692d\u5706\u3002"
    ];
    var notes = [
        "箭头来自真实的水平/垂直灰度变化（Ix/Iy）。箭头越长，说明该方向的灰度变化越强。",
        "四个小热力图按矩阵位置排列，表示窗口里两个方向的变化强度和关联程度。",
        "椭圆越圆、越大，越接近角点；拉成长条更像边；缩成小点说明这里变化不明显。",
        "亮格表示角点分数高。中心格如果不是周围 8 个邻居里最强，就会被筛掉。",
        "\u5c3a\u5ea6\u53d8\u5927\u65f6\uff0c\u540c\u4e00\u4e2a 13x13 \u7a97\u53e3\u4f1a\u770b\u5230\u66f4\u5927\u8303\u56f4\u7684\u539f\u56fe\u5185\u5bb9\uff0cHarris \u54cd\u5e94\u4f1a\u968f\u4e4b\u6539\u53d8\u3002"
    ];

    function $(id) { return document.getElementById(id); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function viridis(v) {
        var stops = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
        var x = clamp(v, 0, 1) * (stops.length - 1);
        var i = Math.floor(x);
        var f = x - i;
        var a = stops[i];
        var b = stops[Math.min(i + 1, stops.length - 1)];
        return "rgb(" + Math.round(lerp(a[0], b[0], f)) + "," + Math.round(lerp(a[1], b[1], f)) + "," + Math.round(lerp(a[2], b[2], f)) + ")";
    }

    function clearSvg(svg) {
        while (svg && svg.firstChild) svg.removeChild(svg.firstChild);
    }

    function svgEl(svg, name, attrs) {
        var el = document.createElementNS("http://www.w3.org/2000/svg", name);
        Object.keys(attrs || {}).forEach(function(k) { el.setAttribute(k, attrs[k]); });
        svg.appendChild(el);
        return el;
    }

    function setupCanvas(canvas) {
        var rect = canvas.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.max(320, Math.floor(rect.width));
        var h = Math.max(280, Math.floor(rect.height));
        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
        }
        var ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx: ctx, w: w, h: h };
    }

    function matrixFromPayload(item) {
        if (!item || !item.data || !item.width || !item.height) return null;
        var out = new Float32Array(item.width * item.height);
        for (var y = 0; y < item.height; y++) {
            for (var x = 0; x < item.width; x++) out[y * item.width + x] = Number(item.data[y][x] || 0);
        }
        out.sourceWidth = item.width;
        out.sourceHeight = item.height;
        return out;
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
        return out;
    }

    function gaussianWeights() {
        var w = new Float32Array(LOCAL_WIN * LOCAL_WIN);
        var sum = 0;
        var sigma = LOCAL_WIN / 3.2;
        for (var y = -HALF; y <= HALF; y++) {
            for (var x = -HALF; x <= HALF; x++) {
                var v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
                w[(y + HALF) * LOCAL_WIN + x + HALF] = v;
                sum += v;
            }
        }
        for (var i = 0; i < w.length; i++) w[i] /= sum;
        return w;
    }

    var WEIGHTS = gaussianWeights();

    function applyVisualization(vis) {
        if (!vis) {
            state.data = null;
            return;
        }
        var gray = resample(matrixFromPayload(vis.gray));
        var ix = resample(matrixFromPayload(vis.ix));
        var iy = resample(matrixFromPayload(vis.iy));
        var ix2 = resample(matrixFromPayload(vis.ix2));
        var iy2 = resample(matrixFromPayload(vis.iy2));
        var ixy = resample(matrixFromPayload(vis.ixy));
        var response = resample(matrixFromPayload(vis.response));
        if (!gray || !ix || !iy || !ix2 || !iy2 || !ixy || !response) {
            state.data = null;
            return;
        }
        var maxGrad = 1e-6;
        var maxProduct = 1e-6;
        var maxResponse = 1e-6;
        for (var i = 0; i < W * H; i++) {
            maxGrad = Math.max(maxGrad, Math.hypot(ix[i], iy[i]));
            maxProduct = Math.max(maxProduct, Math.abs(ix2[i]), Math.abs(iy2[i]), Math.abs(ixy[i]));
            maxResponse = Math.max(maxResponse, Math.abs(response[i]));
        }
        ix.maxGrad = maxGrad;
        iy.maxGrad = maxGrad;
        response.max = maxResponse;
        var points = (vis.points || []).map(function(p) {
            return {
                x: Number(p.x || 0) / Math.max(1, vis.width || W) * W,
                y: Number(p.y || 0) / Math.max(1, vis.height || H) * H,
                response: Number(p.response || 0)
            };
        });
        state.data = { base: gray, ix: ix, iy: iy, ix2: ix2, iy2: iy2, ixy: ixy, response: response, maxProduct: maxProduct, points: points };
        if (points.length) {
            state.focus.x = state.target.x = clamp(points[0].x, HALF, W - HALF - 1);
            state.focus.y = state.target.y = clamp(points[0].y, HALF, H - HALF - 1);
        } else {
            state.focus.x = state.target.x = W / 2;
            state.focus.y = state.target.y = H / 2;
        }
    }

    function sliderValues() {
        var rotateInput = $("harrisRotateInput");
        var scaleInput = $("harrisScaleInput");
        return {
            angle: Number(rotateInput ? rotateInput.value : 0),
            scale: Number(scaleInput ? scaleInput.value : 1)
        };
    }

    function useWindowTransform() {
        return state.stage === 3 || state.stage === 4;
    }

    function transformedOffset(dx, dy, transform) {
        transform = transform || { angle: 0, scale: 1 };
        var rad = transform.angle * Math.PI / 180;
        var s = transform.scale || 1;
        var x = dx * s;
        var y = dy * s;
        return {
            x: Math.cos(rad) * x - Math.sin(rad) * y,
            y: Math.sin(rad) * x + Math.cos(rad) * y
        };
    }

    function sampleAt(arr, x, y) {
        x = clamp(x, 0, W - 1);
        y = clamp(y, 0, H - 1);
        var x0 = Math.floor(x);
        var y0 = Math.floor(y);
        var x1 = Math.min(W - 1, x0 + 1);
        var y1 = Math.min(H - 1, y0 + 1);
        var fx = x - x0;
        var fy = y - y0;
        var a = arr[y0 * W + x0] * (1 - fx) + arr[y0 * W + x1] * fx;
        var b = arr[y1 * W + x0] * (1 - fx) + arr[y1 * W + x1] * fx;
        return a * (1 - fy) + b * fy;
    }

    function windowSample(arr, cx, cy, dx, dy, transform) {
        var off = transformedOffset(dx, dy, transform);
        return sampleAt(arr, cx + off.x, cy + off.y);
    }

    function tensorAt(cx, cy, transform) {
        var A = 0, B = 0, C = 0;
        for (var y = -HALF; y <= HALF; y++) {
            for (var x = -HALF; x <= HALF; x++) {
                var wt = WEIGHTS[(y + HALF) * LOCAL_WIN + x + HALF];
                A += windowSample(state.data.ix2, cx, cy, x, y, transform) * wt;
                B += windowSample(state.data.iy2, cx, cy, x, y, transform) * wt;
                C += windowSample(state.data.ixy, cx, cy, x, y, transform) * wt;
            }
        }
        var trace = A + B;
        var det = A * B - C * C;
        var disc = Math.sqrt(Math.max(0, (A - B) * (A - B) + 4 * C * C));
        return {
            A: A, B: B, C: C, trace: trace, det: det,
            l1: Math.max(0, (trace + disc) / 2),
            l2: Math.max(0, (trace - disc) / 2),
            angle: 0.5 * Math.atan2(2 * C, A - B),
            theta: det - 0.04 * trace * trace
        };
    }

    function currentTransform() {
        return useWindowTransform() ? sliderValues() : { angle: 0, scale: 1 };
    }

    function currentTensor() {
        return tensorAt(state.focus.x, state.focus.y, currentTransform());
    }

    function viewRect(view) {
        var scale = Math.min(view.w * 0.88 / W, view.h * 0.82 / H);
        var w = W * scale;
        var h = H * scale;
        return { x: (view.w - w) / 2, y: (view.h - h) / 2, w: w, h: h, scale: scale };
    }

    function drawGray(ctx, arr, x, y, w, h) {
        var img = ctx.createImageData(W, H);
        for (var i = 0; i < W * H; i++) {
            var g = Math.round(clamp(arr[i], 0, 1) * 255);
            img.data[i * 4] = g;
            img.data[i * 4 + 1] = g;
            img.data[i * 4 + 2] = g;
            img.data[i * 4 + 3] = 255;
        }
        var off = document.createElement("canvas");
        off.width = W;
        off.height = H;
        off.getContext("2d").putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
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
        ctx.fillStyle = canvasId === "harrisOverviewCanvas" ? "#0f172a" : "#f8fafc";
        ctx.fillRect(0, 0, view.w, view.h);
    }

    function windowPolygon(fx, fy, r, win, transform) {
        var s = r.scale;
        var pts = [
            transformedOffset(-win / 2, -win / 2, transform),
            transformedOffset(win / 2, -win / 2, transform),
            transformedOffset(win / 2, win / 2, transform),
            transformedOffset(-win / 2, win / 2, transform)
        ];
        return pts.map(function(p) { return [fx + p.x * s, fy + p.y * s]; });
    }

    function drawOverview(t) {
        var canvas = $("harrisOverviewCanvas");
        var svg = $("harrisOverviewSvg");
        if (!canvas || !svg) return;
        var view = setupCanvas(canvas);
        var ctx = view.ctx;
        svg.setAttribute("viewBox", "0 0 " + view.w + " " + view.h);
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, view.w, view.h);
        clearSvg(svg);
        if (!state.data) return drawEmpty("harrisOverviewCanvas", "harrisOverviewSvg");
        state.focus.x = lerp(state.focus.x, state.target.x, 0.18);
        state.focus.y = lerp(state.focus.y, state.target.y, 0.18);
        var r = viewRect(view);
        drawGray(ctx, state.data.base, r.x, r.y, r.w, r.h);
        ctx.strokeStyle = "rgba(226,232,240,.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        var fx = r.x + state.focus.x / W * r.w;
        var fy = r.y + state.focus.y / H * r.h;
        var transform = currentTransform();
        var pts = windowPolygon(fx, fy, r, LOCAL_WIN, transform);
        svgEl(svg, "polygon", {
            points: pts.map(function(p) { return p[0] + "," + p[1]; }).join(" "),
            fill: "rgba(14,165,233,.12)", stroke: "#38bdf8", "stroke-width": 3,
            "stroke-linejoin": "round"
        });
        svgEl(svg, "line", { x1: fx - 14, y1: fy, x2: fx + 14, y2: fy, stroke: "#38bdf8", "stroke-width": 2 });
        svgEl(svg, "line", { x1: fx, y1: fy - 14, x2: fx, y2: fy + 14, stroke: "#38bdf8", "stroke-width": 2 });
        if (state.stage === 3 && currentTensor().theta > state.data.response.max * 0.2) {
            svgEl(svg, "circle", { cx: fx, cy: fy, r: 10 + Math.sin(t * 8) * 2, fill: "none", stroke: "#ef4444", "stroke-width": 4 });
        }
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

    function textBlock(ctx, x, y, w, lines) {
        roundRect(ctx, x, y, w, 42 + lines.length * 32, 10, "#ffffff", "rgba(15,23,42,.1)");
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 20px Microsoft YaHei, sans-serif";
        ctx.fillText(lines[0], x + 14, y + 31);
        ctx.font = "800 17px Microsoft YaHei, sans-serif";
        ctx.fillStyle = "rgba(15,31,61,.76)";
        for (var i = 1; i < lines.length; i++) ctx.fillText(lines[i], x + 14, y + 34 + i * 32);
    }

    function drawWindowGrid(ctx, svg, view, transform) {
        transform = transform || { angle: 0, scale: 1 };
        var side = Math.min(view.w * 0.55, view.h * 0.78);
        var cell = side / LOCAL_WIN;
        var ox = view.w * 0.06;
        var oy = view.h * 0.1;
        roundRect(ctx, ox - 10, oy - 10, side + 20, side + 20, 10, "#ffffff", "rgba(15,23,42,.1)");
        for (var y = 0; y < LOCAL_WIN; y++) {
            for (var x = 0; x < LOCAL_WIN; x++) {
                var dx = x - HALF;
                var dy = y - HALF;
                var g = clamp(windowSample(state.data.base, state.focus.x, state.focus.y, dx, dy, transform), 0, 1);
                ctx.fillStyle = "rgb(" + Math.round(g * 255) + "," + Math.round(g * 255) + "," + Math.round(g * 255) + ")";
                ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.4, cell + 0.4);
                var gx = windowSample(state.data.ix, state.focus.x, state.focus.y, dx, dy, transform);
                var gy = windowSample(state.data.iy, state.focus.x, state.focus.y, dx, dy, transform);
                var mag = clamp(Math.hypot(gx, gy) / state.data.ix.maxGrad, 0, 1);
                var len = cell * (0.12 + mag * 0.42);
                var a = Math.atan2(gy, gx);
                var cx = ox + x * cell + cell / 2;
                var cy = oy + y * cell + cell / 2;
                svgEl(svg, "line", {
                    x1: cx - Math.cos(a) * len, y1: cy - Math.sin(a) * len,
                    x2: cx + Math.cos(a) * len, y2: cy + Math.sin(a) * len,
                    stroke: viridis(mag), "stroke-width": 1 + mag * 2.4, "stroke-linecap": "round"
                });
                svgEl(svg, "circle", { cx: cx + Math.cos(a) * len, cy: cy + Math.sin(a) * len, r: 1.7 + mag * 1.2, fill: viridis(mag) });
            }
        }
        drawMagnitudePatch(ctx, view.w * 0.68, oy, Math.min(view.w * 0.24, side * 0.42), transform);
        textBlock(ctx, view.w * 0.64, oy + side * 0.5, view.w * 0.3, [
            "\u7070\u5ea6\u53d8\u5316\u8fd1\u4f3c",
            "I(i+u,j+v) ≈ I(i,j)+uIx+vIy",
            "箭头 = 水平/垂直灰度变化"
        ]);
    }

    function drawMagnitudePatch(ctx, x0, y0, side, transform) {
        var cell = side / LOCAL_WIN;
        roundRect(ctx, x0 - 8, y0 - 8, side + 16, side + 38, 9, "#ffffff", "rgba(15,23,42,.1)");
        for (var y = 0; y < LOCAL_WIN; y++) {
            for (var x = 0; x < LOCAL_WIN; x++) {
                var dx = x - HALF;
                var dy = y - HALF;
                var gx = windowSample(state.data.ix, state.focus.x, state.focus.y, dx, dy, transform);
                var gy = windowSample(state.data.iy, state.focus.x, state.focus.y, dx, dy, transform);
                var mag = clamp(Math.hypot(gx, gy) / state.data.ix.maxGrad, 0, 1);
                ctx.fillStyle = viridis(mag);
                ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.2, cell + 0.2);
            }
        }
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 16px Microsoft YaHei, sans-serif";
        ctx.fillText("梯度强度热力图", x0, y0 + side + 27);
    }

    function drawPatchHeat(ctx, arr, x0, y0, side, title, signed, transform) {
        var cell = side / LOCAL_WIN;
        roundRect(ctx, x0 - 8, y0 - 8, side + 16, side + 38, 9, "#ffffff", "rgba(15,23,42,.1)");
        for (var y = 0; y < LOCAL_WIN; y++) {
            for (var x = 0; x < LOCAL_WIN; x++) {
                var v = windowSample(arr, state.focus.x, state.focus.y, x - HALF, y - HALF, transform);
                var norm = signed ? 0.5 + v / Math.max(1e-6, state.data.maxProduct * 2) : Math.abs(v) / Math.max(1e-6, state.data.maxProduct);
                ctx.fillStyle = viridis(norm);
                ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.5, cell + 0.5);
            }
        }
        ctx.strokeStyle = "rgba(15,23,42,.28)";
        ctx.strokeRect(x0, y0, side, side);
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 15px Microsoft YaHei, sans-serif";
        ctx.fillText(title, x0, y0 + side + 24);
    }

    function drawGaussianBell(svg, x, y, w, h, t) {
        var cy = y + h * (0.28 + 0.035 * Math.sin(t * 3));
        var cx = x + w / 2;
        svgEl(svg, "ellipse", { cx: cx, cy: y + h * 0.72, rx: w * 0.34, ry: h * 0.11, fill: "rgba(14,165,233,.13)", stroke: "#38bdf8", "stroke-width": 2 });
        svgEl(svg, "path", {
            d: "M" + (cx - w * 0.34) + " " + (y + h * 0.72) + " C" + (cx - w * 0.18) + " " + cy + "," + (cx + w * 0.18) + " " + cy + "," + (cx + w * 0.34) + " " + (y + h * 0.72),
            fill: "rgba(56,189,248,.18)", stroke: "#38bdf8", "stroke-width": 2
        });
        svgEl(svg, "line", { x1: cx, y1: cy, x2: cx, y2: y + h * 0.92, stroke: "rgba(14,165,233,.65)", "stroke-width": 2, "stroke-dasharray": "6 6" });
    }

    function drawProductMaps(ctx, svg, view, t) {
        var transform = currentTransform();
        var gap = Math.min(view.w, view.h) * 0.026;
        var size = Math.min((view.w * 0.5 - gap) / 2, (view.h * 0.62 - gap) / 2, 145);
        var x0 = view.w * 0.08;
        var y0 = view.h * 0.15;
        drawPatchHeat(ctx, state.data.ix2, x0, y0, size, "水平能量 Ix²", false, transform);
        drawPatchHeat(ctx, state.data.ixy, x0 + size + gap, y0, size, "方向关联 IxIy", true, transform);
        drawPatchHeat(ctx, state.data.ixy, x0, y0 + size + gap, size, "方向关联 IxIy", true, transform);
        drawPatchHeat(ctx, state.data.iy2, x0 + size + gap, y0 + size + gap, size, "垂直能量 Iy²", false, transform);
        drawGaussianBell(svg, view.w * 0.66, view.h * 0.12, view.w * 0.2, view.h * 0.26, t);
        var m = currentTensor();
        textBlock(ctx, view.w * 0.62, view.h * 0.45, view.w * 0.34, [
            "窗口变化汇总",
            "[" + m.A.toFixed(3) + "  " + m.C.toFixed(3) + "]",
            "[" + m.C.toFixed(3) + "  " + m.B.toFixed(3) + "]"
        ]);
    }

    function drawAxes(svg, cx, cy, size) {
        svgEl(svg, "line", { x1: cx - size, y1: cy, x2: cx + size, y2: cy, stroke: "rgba(15,23,42,.25)", "stroke-width": 1.5 });
        svgEl(svg, "line", { x1: cx, y1: cy + size, x2: cx, y2: cy - size, stroke: "rgba(15,23,42,.25)", "stroke-width": 1.5 });
        svgEl(svg, "text", { x: cx + size - 14, y: cy - 10, fill: "#334155", "font-size": 16, "font-weight": 900 }).textContent = "x";
        svgEl(svg, "text", { x: cx + 10, y: cy - size + 18, fill: "#334155", "font-size": 16, "font-weight": 900 }).textContent = "y";
    }

    function ellipseDims(m, view) {
        var maxL = Math.max(m.l1, m.l2, 1e-6);
        var base = Math.min(view.w, view.h) * 0.5;
        var strength = clamp(Math.sqrt(maxL / Math.max(1e-6, state.data.maxProduct)) * 2.6, 0.36, 1);
        var rx = clamp(Math.sqrt(Math.max(m.l1, 0)) / Math.sqrt(maxL) * base * strength, 26, base);
        var ry = clamp(Math.sqrt(Math.max(m.l2, 0)) / Math.sqrt(maxL) * base * strength, 26, base);
        return { rx: rx, ry: ry };
    }

    function drawEllipseStage(ctx, svg, view, opts) {
        opts = opts || {};
        var m = currentTensor();
        var cx = opts.cx || view.w * 0.42;
        var cy = opts.cy || view.h * 0.42;
        var size = Math.min(view.w, view.h) * (opts.axisScale || 0.34);
        var cardX = opts.cardX == null ? view.w * 0.09 : opts.cardX;
        var cardY = opts.cardY == null ? view.h * 0.1 : opts.cardY;
        var cardW = opts.cardW == null ? view.w * 0.66 : opts.cardW;
        var cardH = opts.cardH == null ? view.h * 0.66 : opts.cardH;
        roundRect(ctx, cardX, cardY, cardW, cardH, 12, "#ffffff", "rgba(15,23,42,.1)");
        drawAxes(svg, cx, cy, size);
        var d = ellipseDims(m, view);
        svgEl(svg, "ellipse", {
            cx: cx, cy: cy, rx: d.rx, ry: d.ry,
            transform: "rotate(" + (m.angle * 180 / Math.PI) + " " + cx + " " + cy + ")",
            fill: "rgba(239,68,68,.12)", stroke: "#ef4444", "stroke-width": 4,
            style: "transition: all .3s ease-out"
        });
        if (!opts.noPatch) drawMagnitudePatch(ctx, view.w * 0.78, view.h * 0.16, Math.min(view.w * 0.16, view.h * 0.24), currentTransform());
        if (!opts.hideText) {
            textBlock(ctx, view.w * 0.14, view.h * 0.79, view.w * 0.6, [
                "两个方向的变化强度",
                "λ1=" + m.l1.toFixed(5) + "    λ2=" + m.l2.toFixed(5),
                "平坦: 小点   边缘: 长条   角点: 大圆"
            ]);
        }
    }

    function drawResponseStage(ctx, svg, view) {
        var m = currentTensor();
        drawEllipseStage(ctx, svg, view, {
            noPatch: true,
            hideText: true,
            cx: view.w * 0.34,
            cy: view.h * 0.38,
            axisScale: 0.31,
            cardX: view.w * 0.06,
            cardY: view.h * 0.08,
            cardW: view.w * 0.54,
            cardH: view.h * 0.56
        });
        var fx = Math.round(state.focus.x);
        var fy = Math.round(state.focus.y);
        var side = Math.min(view.w * 0.23, view.h * 0.31);
        var sx = view.w * 0.67;
        var sy = view.h * 0.11;
        var cell = side / 3;
        roundRect(ctx, sx - 12, sy - 12, side + 24, side + 54, 9, "#ffffff", "rgba(15,23,42,.1)");
        var best = -Infinity;
        for (var yy = -1; yy <= 1; yy++) {
            for (var xx = -1; xx <= 1; xx++) {
                var idx = clamp(fy + yy, 0, H - 1) * W + clamp(fx + xx, 0, W - 1);
                best = Math.max(best, state.data.response[idx]);
            }
        }
        for (var y = 0; y < 3; y++) {
            for (var x = 0; x < 3; x++) {
                var id = clamp(fy + y - 1, 0, H - 1) * W + clamp(fx + x - 1, 0, W - 1);
                var rv = state.data.response[id];
                ctx.fillStyle = viridis(Math.abs(rv) / Math.max(1e-6, state.data.response.max));
                ctx.fillRect(sx + x * cell, sy + y * cell, cell - 4, cell - 4);
                if (x === 1 && y === 1) {
                    ctx.strokeStyle = rv >= best ? "#22c55e" : "#ef4444";
                    ctx.lineWidth = 3;
                    ctx.strokeRect(sx + x * cell, sy + y * cell, cell - 4, cell - 4);
                }
            }
        }
        ctx.fillStyle = "#0f1f3d";
        ctx.font = "900 17px Microsoft YaHei, sans-serif";
        ctx.fillText("3x3 局部最强点筛选", sx, sy + side + 34);
        textBlock(ctx, view.w * 0.08, view.h * 0.69, view.w * 0.48, [
            "角点分数",
            "θ = det(M)-0.04 trace(M)^2",
            "θ=" + m.theta.toFixed(6)
        ]);
        var s = sliderValues();
        textBlock(ctx, view.w * 0.62, view.h * 0.55, view.w * 0.32, [
            "窗口变换",
            "旋转 " + s.angle.toFixed(0) + "°    放大 " + s.scale.toFixed(2),
            "椭圆由变换后的窗口重新计算"
        ]);
    }

    function drawVerifyStage(ctx, svg, view) {
        var m = currentTensor();
        drawEllipseStage(ctx, svg, view, { noPatch: false });
        var s = sliderValues();
        textBlock(ctx, view.w * 0.58, view.h * 0.78, view.w * 0.34, [
            "旋转和放大窗口",
            "旋转: " + s.angle.toFixed(0) + "°    放大: " + s.scale.toFixed(2),
            "λ1=" + m.l1.toFixed(5) + "  λ2=" + m.l2.toFixed(5)
        ]);
    }

    function drawStage(t) {
        var canvas = $("harrisMicroCanvas");
        var svg = $("harrisMicroSvg");
        if (!canvas || !svg) return;
        var view = setupCanvas(canvas);
        var ctx = view.ctx;
        svg.setAttribute("viewBox", "0 0 " + view.w + " " + view.h);
        ctx.clearRect(0, 0, view.w, view.h);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, view.w, view.h);
        clearSvg(svg);
        if (!state.data) return drawEmpty("harrisMicroCanvas", "harrisMicroSvg");
        if (state.stage === 0) drawWindowGrid(ctx, svg, view, { angle: 0, scale: 1 });
        else if (state.stage === 1) drawProductMaps(ctx, svg, view, t);
        else if (state.stage === 2) drawEllipseStage(ctx, svg, view);
        else if (state.stage === 3) drawResponseStage(ctx, svg, view);
        else drawVerifyStage(ctx, svg, view);
    }

    function updateText() {
        var stage = Math.min(state.stage, 4);
        var name = $("harrisStageName");
        var hint = $("harrisStageHint");
        var formula = $("harrisStageFormula");
        var note = $("harrisStageNote");
        if (name) name.textContent = names[stage];
        if (hint) hint.textContent = hints[stage];
        if (note) note.textContent = notes[stage];
        if (formula) {
            formula.textContent = "";
            formula.dataset.katex = formulas[stage];
            if (window.katex) katex.render(formulas[stage], formula, { throwOnError: false });
        }
        document.querySelectorAll("#harrisStageTabs button").forEach(function(btn) {
            var idx = Number(btn.dataset.stage);
            btn.textContent = tabLabels[idx] || btn.textContent;
            btn.classList.toggle("active", idx === state.stage);
            btn.style.display = "";
        });
        var controls = document.querySelector(".harris-verify-controls");
        if (controls) controls.classList.toggle("active", state.stage === 3 || state.stage === 4);
    }

    function loop(now) {
        var t = now / 1000;
        drawOverview(t);
        drawStage(t);
        state.raf = requestAnimationFrame(loop);
    }

    function bindPointer() {
        var canvas = $("harrisOverviewCanvas");
        if (!canvas || canvas.dataset.harrisBound) return;
        canvas.dataset.harrisBound = "1";
        canvas.addEventListener("pointerdown", function(ev) {
            if (!state.started || !state.data) return;
            var view = setupCanvas(canvas);
            var r = viewRect(view);
            var rect = canvas.getBoundingClientRect();
            var px = ev.clientX - rect.left;
            var py = ev.clientY - rect.top;
            if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) return;
            state.target.x = clamp((px - r.x) / r.w * W, HALF, W - HALF - 1);
            state.target.y = clamp((py - r.y) / r.h * H, HALF, H - HALF - 1);
        });
    }

    function start() {
        if (state.started) return;
        state.started = true;
        bindPointer();
        updateText();
        state.raf = requestAnimationFrame(loop);
    }

    function init() {
        if (!$("harrisLab")) return;
        var head = document.querySelector("#harrisLab .sift-lab-head h2");
        var intro = document.querySelector("#harrisLab .sift-lab-head p");
        var overviewTitle = document.querySelector("#harrisLab .harris-overview-panel .sift-panel-title span");
        var overviewHint = document.querySelector("#harrisLab .harris-overview-panel .sift-panel-title strong");
        if (head) head.textContent = "Harris 角点检测过程";
        if (intro) intro.textContent = "点击左侧图片选择观察位置，右侧展示这个位置为什么会被判断为角点、边缘或平坦区域。";
        if (overviewTitle) overviewTitle.textContent = "原图观察区";
        if (overviewHint) overviewHint.textContent = "点击图片选择要分析的位置";
        document.querySelectorAll("#harrisStageTabs button").forEach(function(btn) {
            btn.addEventListener("click", function() {
                state.stage = Math.min(4, Number(btn.dataset.stage || 0));
                updateText();
            });
        });
        ["harrisRotateInput", "harrisScaleInput"].forEach(function(id) {
            var input = $(id);
            if (input) input.addEventListener("input", updateText);
        });
        document.querySelectorAll(".view-tab").forEach(function(tab) {
            tab.addEventListener("click", function() {
                if (this.dataset.view === "knowledge") start();
            });
        });
        window.addEventListener("feature:data", function(ev) {
            if (!ev.detail || ev.detail.moduleKey !== "corner") return;
            if (ev.detail.payload && ev.detail.payload.message) state.message = ev.detail.payload.message;
            applyVisualization(ev.detail.payload && !ev.detail.payload.empty ? ev.detail.payload.visualization || {} : null);
            if (!state.started) start();
        });
        if ($("viewKnowledge") && $("viewKnowledge").style.display !== "none") start();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
