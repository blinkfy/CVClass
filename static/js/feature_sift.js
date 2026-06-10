(function () {
    "use strict";

    const V = window.FeatureViz;
    const form = document.getElementById("featureSiftForm");
    if (!V || !form) return;

    const descriptorFlag = document.getElementById("siftDescriptorFlag");
    const stepNav = document.querySelector(".feature-sift-steps");
    const stepPanels = Array.from(document.querySelectorAll("[data-sift-panel]"));
    const descriptorStatuses = Array.from(document.querySelectorAll("[data-descriptor-status]"));
    const algorithmInfo = {
        sift: { name: "SIFT", label: "SIFT Pipeline" },
        surf: { name: "SURF", label: "SURF Pipeline" },
        "fast-brief": { name: "FAST + BRIEF", label: "FAST + BRIEF Pipeline" },
        "orb-lite": { name: "ORB-lite", label: "ORB-lite Pipeline" }
    };
    const stepContentMap = {
        sift: [{
            title: "预处理",
            goal: "彩色图转灰度，建立统一输入。",
            io: "输入：RGB 图像 → 输出：Gray 灰度图",
            next: "灰度图将作为构建 Gaussian Pyramid 的基底（Layer 0）。",
            panel: "0"
        }, {
            title: "Gaussian Pyramid",
            goal: "逐层高斯平滑，并跨 octave 下采样。",
            io: "输入：上一尺度图像 → 输出：不同分辨率和模糊程度的图像序列",
            next: "同一 Octave 的相邻 Gaussian 层相减，用于生成 DoG 响应。",
            panel: "1"
        }, {
            title: "DoG Pyramid",
            goal: "相邻 Gaussian 层相减，得到尺度响应。",
            io: "输入：Gaussian Pyramid → 输出：DoG 差分金字塔",
            next: "在 DoG 空间中进行 3×3×3 的局部极值检测。",
            panel: "2"
        }, {
            title: "DoG 极值定位",
            goal: "在 3×3×3 邻域中寻找尺度极值。",
            io: "输入：DoG Pyramid → 输出：候选极值点 (x, y, octave, layer)",
            next: "候选极值点会进入低对比度过滤、Hessian 边缘响应过滤和 NMS。",
            panel: "3"
        }, {
            title: "边缘抑制",
            goal: "抑制边缘型响应，保留二维稳定点。",
            io: "输入：候选极值点 → 输出：稳定关键点 (x, y, σ, response)",
            next: "通过边缘抑制的点进入局部方向分配阶段。",
            panel: "3"
        }, {
            title: "主方向分配",
            goal: "统计 36-bin 方向直方图，取主峰方向。",
            io: "输入：尺度极值点及周围梯度 → 输出：定向关键点 (含 orientation)",
            next: "生成以主方向为基准对齐的局部特征描述子。",
            panel: "4"
        }, {
            title: "128 维描述子",
            goal: "4×4 网格内统计 8-bin 梯度，组成 128 维。",
            io: "输入：定向关键点及局部梯度 → 输出：128 维浮点描述子",
            next: "使用该描述子向量和 L2 距离即可在多张图像间进行比率测试与特征匹配。",
            panel: "5"
        }],
        surf: [
            { title: "积分图", goal: "快速计算图像中任意矩形区域的像素和，把复杂度降到 O(1)。", io: "输入：Gray → 输出：Integral Image", next: "后续所有盒式滤波均通过积分图极速完成。", key: "integral", panel: "analog" },
            { title: "Hessian 近似", goal: "使用大尺度盒式滤波器近似二阶高斯偏导数，快速计算 Hessian 行列式。", io: "输入：积分图 → 输出：Hessian 极值候选点", next: "通过 NMS 提取局部最强点后分配主方向。", key: "hessian", panel: "analog" },
            { title: "Haar 小波方向", goal: "在圆形邻域内通过 Haar X/Y 滤波器计算并累加梯度响应，寻找主峰方向。", io: "输入：候选关键点 → 输出：定向关键点", next: "按主方向对齐网格，计算 64 维描述子。", key: "orientation", panel: "analog" },
            { title: "64 维描述子", goal: "在 4×4 的网格中累计 4 个 Haar 特征（dx, dy, |dx|, |dy|），组合成 64 维向量。", io: "输入：定向关键点 → 输出：64 维 float 描述子", next: "降维的同时仍具备良好区分度，用于 L2 距离匹配。", key: "descriptor", panel: "analog" }
        ],
        "fast-brief": [
            { title: "FAST 关键点", goal: "仅比较中心像素与半径为 3 的 16 个圆周像素亮度，极速检测角点。", io: "输入：Gray → 输出：FAST 候选角点", next: "保留响应最强的点进入 BRIEF 描述子提取。", key: "fast", panel: "analog" },
            { title: "BRIEF 采样对", goal: "以关键点为中心，用预先固定的 256 对像素坐标读取亮度差异。", io: "输入：FAST 角点 + 图像 Patch → 输出：256 个亮度比较结果 (True/False)", next: "将布尔结果打包为 256 维的二进制向量。", key: "pairs", panel: "analog" },
            { title: "256 bit 描述子", goal: "将成对亮度比较的结果转为 0/1 位向量，大幅降低存储开销。", io: "输入：256 个亮度比较结果 → 输出：256 bit 二进制描述子", next: "在匹配时使用极其快速的 Hamming 距离计算异或即可。", key: "descriptor", panel: "analog" }
        ],
        "orb-lite": [
            { title: "FAST 关键点", goal: "利用 FAST-9 加速寻找角点，并通过响应分数阈值进行初步筛选。", io: "输入：Gray → 输出：带分数的 FAST 候选点", next: "通过 NMS 筛选后交由灰度矩计算方向。", key: "fast", panel: "analog" },
            { title: "灰度矩方向", goal: "计算关键点周围圆形区域的一阶与零阶灰度矩，根据重心位置确定特征方向。", io: "输入：FAST 候选点 + 图像 Patch → 输出：具备方向信息的关键点", next: "按此方向旋转固定的 BRIEF 采样点对。", key: "orientation", panel: "analog" },
            { title: "旋转 BRIEF", goal: "通过方向角对 BRIEF 采样点对进行预旋转，赋予二进制描述子抗旋转能力。", io: "输入：定向关键点 → 输出：256 bit 二进制描述子", next: "输出支持旋转不变的二进制特征，进行 Hamming 距离匹配。", key: "descriptor", panel: "analog" }
        ]
    };

    let currentStep = 0;
    let generation = 0;
    let scaleData = null;
    let descriptorData = null;
    let descriptorPromise = null;
    const imageCache = new Map();
    let orientationDemoIndex = 0;
    let orientationLayout = null;
    let analogData = new Map();
    let selectedAnalogMethod = V.$("siftAnalogMethod")?.value || "sift";
    const siftMotion = {
        playing: true,
        progress: 0,
        lastTime: 0,
        raf: 0
    };

    V.setupSamples(form);
    V.bindFileNames(form);

    function selectedAlgorithm() {
        return selectedAnalogMethod || "sift";
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function currentSteps() {
        return stepContentMap[selectedAlgorithm()] || stepContentMap.sift;
    }

    function renderStepNav() {
        if (!stepNav) return;
        const steps = currentSteps();
        stepNav.hidden = true;
        stepNav.innerHTML = steps.map((step, index) => `
            <button class="${index === currentStep ? "is-active" : ""}" type="button" data-sift-step="${index}">
                <i>${index + 1}</i><span>${step.title}</span>
            </button>
        `).join("");
    }

    function syncAlgorithmControls() {
        const algorithm = selectedAlgorithm();
        const isSift = algorithm === "sift";
        if (V.$("siftScaleParams")) V.$("siftScaleParams").hidden = !isSift;
        if (V.$("siftDescriptorParams")) V.$("siftDescriptorParams").hidden = !isSift;
        if (V.$("siftAnalogParams")) V.$("siftAnalogParams").hidden = isSift;
        if (isSift) return;
        const info = V.featureAlgorithmInfo(algorithm);
        const labels = {
            surf: ["Hessian 近似", "64 float", "L2"],
            "fast-brief": ["FAST", "256 bit", "Hamming"],
            "orb-lite": ["FAST + 方向", "256 bit", "Hamming"]
        };
        const [keypoint, descriptor, distance] = labels[algorithm] || ["-", "-", "-"];
        V.$("siftAnalogParamTitle").textContent = info.name;
        V.$("siftAnalogKeypointType").value = keypoint;
        V.$("siftAnalogDescriptorType").value = descriptor;
        V.$("siftAnalogDistanceType").value = distance;
    }

    function setDescriptorStatus(text, state = "") {
        descriptorStatuses.forEach(element => {
            element.textContent = text;
            element.dataset.state = state;
        });
    }

    function preloadImage(src) {
        if (!src) return Promise.resolve(null);
        const cached = imageCache.get(src);
        if (cached?.img) return Promise.resolve(cached.img);
        if (cached?.promise) return cached.promise;
        const promise = V.loadImage(src).then(img => {
            imageCache.set(src, { img, promise: null });
            return img;
        });
        imageCache.set(src, { img: null, promise });
        return promise;
    }

    function cachedImage(src) {
        return imageCache.get(src)?.img || null;
    }

    function ensureCanvasSize(canvas, width, height) {
        const nextWidth = Math.max(1, Math.round(width));
        const nextHeight = Math.max(1, Math.round(height));
        if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
            V.setCanvasSize(canvas, nextWidth, nextHeight);
        }
    }

    function renderPyramid(container, rows, dog) {
        if (!container) return;
        container.innerHTML = "";
        (rows || []).forEach((row, octave) => {
            const rowElement = document.createElement("div");
            rowElement.className = "feature-pyramid-row";
            rowElement.innerHTML = `<div class="feature-pyramid-label">Octave ${octave}</div>`;
            row.forEach(cell => {
                const canvas = document.createElement("canvas");
                canvas.title = `${dog ? "DoG" : "Gaussian"} · O${cell.octave} L${cell.layer}`;
                rowElement.appendChild(canvas);
                V.drawArray(canvas, cell.array, "gray");
            });
            container.appendChild(rowElement);
        });
    }

    function renderDogProbe(probe) {
        const box = V.$("dogProbe");
        if (!box) return;
        box.innerHTML = "";
        if (!probe) {
            box.textContent = "当前参数下没有可展示的 3×3×3 邻域。";
            return;
        }
        V.renderMatrix(box, "上一层", probe.prev);
        V.renderMatrix(box, "当前层", probe.current);
        V.renderMatrix(box, "下一层", probe.next);
        box.insertAdjacentHTML("beforeend", `
            <div class="feature-matrix-card">
                <strong>检测点状态</strong>
                <p>Octave / Layer: ${probe.octave} / ${probe.layer}</p>
                <p>坐标: (${probe.x}, ${probe.y})</p>
                <p>中心值: ${probe.center}</p>
            </div>
        `);
    }

    async function renderPreprocess(data) {
        await V.drawBaseImage(V.$("siftOriginalCanvas"), data.images.original);
        const gray = await V.imageToGray(data.images.original);
        V.drawArray(V.$("siftGrayCanvas"), gray, "gray");
        V.renderStatList(V.$("siftInputStats"), [
            ["图像尺寸", `${data.meta.width} × ${data.meta.height}`],
            ["输入文件", data.meta.filename],
            ["处理通道", "RGB → Gray"]
        ]);
    }

    async function renderScale(data) {
        scaleData = data;
        preloadImage(data.images.original);
        await renderPreprocess(data);
        renderPyramid(V.$("gaussianPyramid"), data.pyramid?.gaussian || [], false);
        renderPyramid(V.$("dogPyramid"), data.pyramid?.dog || [], true);
        renderDogProbe(data.pyramid?.probe);

        const sift = data.sift || {};
        await Promise.all([
            V.drawKeypoints(V.$("scaleExtremaCanvas"), data.images.original, sift.points_extrema || [], {
                color: "#94a3b8", max: 800, size: 3
            }),
            V.drawKeypoints(V.$("scaleEdgeCanvas"), data.images.original, sift.points_edge || [], {
                color: "#f97316", type: "circle", max: 600, radius: 3
            }),
            V.drawSiftKeypoints(V.$("scaleSiftCanvas"), data.images.original, sift.points_keypoints || sift.keypoints || [], {
                max: 350
            })
        ]);

        const counts = sift.counts || {};
        V.renderStatList(V.$("scaleStats"), [
            ["原始极值点", counts.raw_extrema || 0],
            ["对比度与边缘过滤后", counts.edge_survivors || 0],
            ["最终保留", counts.kept || sift.count || 0]
        ]);
        V.$("siftElapsed").textContent = `${data.meta.elapsed_ms} ms · 基础数据`;
        await renderAnalogAlgorithms(data);
        await renderCurrentStepView();
    }

    async function drawAnalogCanvas(canvas, src, algorithm, points) {
        const result = await V.drawBaseImage(canvas, src, "#f8fbff");
        if (!result) return;
        const ctx = result.ctx;
        if (algorithm === "sift") {
            points.slice(0, 180).forEach(point => V.drawSiftSymbol(ctx, point));
        } else if (algorithm === "surf") {
            points.slice(0, 260).forEach(point => {
                V.drawCircle(ctx, point.x, point.y, "#0ea5e9", 5);
                ctx.strokeStyle = "#2563eb";
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(point.x + Math.cos(point.orientation || 0) * 12, point.y + Math.sin(point.orientation || 0) * 12);
                ctx.stroke();
            });
        } else if (algorithm === "orb-lite") {
            points.slice(0, 320).forEach(point => {
                V.drawDiamond(ctx, point.x, point.y, "#22c55e", 5);
                ctx.strokeStyle = "#16a34a";
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(point.x + Math.cos(point.orientation || 0) * 11, point.y + Math.sin(point.orientation || 0) * 11);
                ctx.stroke();
            });
        } else {
            points.slice(0, 320).forEach(point => V.drawDiamond(ctx, point.x, point.y, "#eab308", 5));
        }
    }

    function analogRandom(seed) {
        let value = (Math.round(seed) || 1) >>> 0;
        return () => {
            value = (value * 1664525 + 1013904223) >>> 0;
            return value / 4294967296;
        };
    }

    function analogDemoPoint(data, step) {
        const points = data?.points || [];
        if (!points.length) return { x: scaleData?.meta?.width ? scaleData.meta.width / 2 : 256, y: scaleData?.meta?.height ? scaleData.meta.height / 2 : 256, sigma: 4, orientation: -0.55 };
        const seed = `${data.algorithm}-${step?.key || ""}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
        return points[Math.min(points.length - 1, Math.floor(points.length * ((seed % 47) / 70 + .18)))];
    }

    function drawAnalogImageBackdrop(ctx, imageResult, data, point, phase, color) {
        if (!imageResult) return null;
        const rect = imageResult.rect;
        const img = imageResult.img;
        const imageWidth = scaleData?.meta?.width || img.naturalWidth || img.width;
        const imageHeight = scaleData?.meta?.height || img.naturalHeight || img.height;
        ctx.save();
        ctx.fillStyle = "rgba(248,251,255,.54)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        (data.points || []).slice(0, 220).forEach((item, index) => {
            const mapped = mapPointToImageRect(item, rect, imageWidth, imageHeight);
            ctx.globalAlpha = .16 + .12 * ((index * 7) % 5) / 4;
            if (data.algorithm === "surf") V.drawCircle(ctx, mapped.x, mapped.y, color, 3.2);
            else V.drawDiamond(ctx, mapped.x, mapped.y, color, 3.6);
        });
        ctx.globalAlpha = 1;
        const selected = mapPointToImageRect(point, rect, imageWidth, imageHeight);
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        if (data.algorithm === "surf") drawCandidateCircle(ctx, selected.x, selected.y, 9 + 2 * Math.sin(phase * Math.PI * 2) ** 2, color, .95);
        else V.drawDiamond(ctx, selected.x, selected.y, color, 9);
        ctx.shadowBlur = 0;
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = `${color}78`;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(selected.x, selected.y);
        ctx.bezierCurveTo(rect.x + rect.w + 18, selected.y - 42, 526, 118, 562, 118);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return { selected, rect, imageWidth, imageHeight };
    }

    function drawAnalogPatchFromImage(ctx, img, point, panel, color, label) {
        drawMotionPanel(ctx, panel.x, panel.y, panel.w, panel.h, color);
        ctx.save();
        const imageWidth = scaleData?.meta?.width || img.naturalWidth || img.width;
        const imageHeight = scaleData?.meta?.height || img.naturalHeight || img.height;
        const patch = Math.max(48, Math.round((Number(point.sigma) || 4) * 18));
        const sx = clamp(Number(point.x) - patch / 2, 0, Math.max(1, imageWidth - patch));
        const sy = clamp(Number(point.y) - patch / 2, 0, Math.max(1, imageHeight - patch));
        const inner = { x: panel.x + 18, y: panel.y + 34, w: panel.w - 36, h: panel.h - 58 };
        roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 12);
        ctx.clip();
        ctx.drawImage(img, sx, sy, patch, patch, inner.x, inner.y, inner.w, inner.h);
        ctx.fillStyle = "rgba(248,251,255,.38)";
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(label, panel.x + 16, panel.y + 22);
        ctx.strokeStyle = "rgba(255,255,255,.65)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(inner.x + i * inner.w / 6, inner.y);
            ctx.lineTo(inner.x + i * inner.w / 6, inner.y + inner.h);
            ctx.moveTo(inner.x, inner.y + i * inner.h / 6);
            ctx.lineTo(inner.x + inner.w, inner.y + i * inner.h / 6);
            ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(inner.x + inner.w / 2, inner.y + inner.h / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return inner;
    }

    function drawAnalogMetricStrip(ctx, rect, items) {
        drawMotionPanel(ctx, rect.x, rect.y, rect.w, rect.h, "#2563eb");
        ctx.save();
        const gap = 8;
        const width = (rect.w - 36 - gap * (items.length - 1)) / items.length;
        items.forEach(([label, value, color], index) => {
            const x = rect.x + 18 + index * (width + gap);
            ctx.fillStyle = "rgba(255,255,255,.78)";
            ctx.strokeStyle = `${color}66`;
            ctx.lineWidth = 1.2;
            roundRect(ctx, x, rect.y + 10, width, rect.h - 20, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#475569";
            ctx.font = "850 11px sans-serif";
            ctx.fillText(label, x + 10, rect.y + 29);
            ctx.fillStyle = color;
            ctx.font = String(value).length > 12 ? "950 11px sans-serif" : "950 14px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(String(value), x + width - 10, rect.y + 30);
            ctx.textAlign = "left";
        });
        ctx.restore();
    }

    function drawFastRingTeaching(ctx, cx, cy, radius, phase, color, mode) {
        const offsets = [
            [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3],
            [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]
        ];
        const active = Math.floor(phase * 24) % 16;
        ctx.save();
        ctx.strokeStyle = `${color}55`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        offsets.forEach(([dx, dy], index) => {
            const x = cx + dx / 3 * radius;
            const y = cy + dy / 3 * radius;
            const contiguous = index >= 2 && index <= 10;
            const visited = index <= active || phase > .62;
            ctx.fillStyle = visited ? (contiguous ? `${color}33` : "rgba(148,163,184,.22)") : "rgba(255,255,255,.72)";
            ctx.strokeStyle = index === active ? "#ef4444" : (contiguous && visited ? color : "rgba(148,163,184,.65)");
            ctx.lineWidth = index === active ? 3 : 1.5;
            ctx.beginPath();
            ctx.arc(x, y, index === active ? 9 : 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#334155";
            ctx.font = "850 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(String(index + 1), x, y + 3);
        });
        ctx.textAlign = "left";
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(mode === "orb" ? "FAST score + NMS" : "FAST-9 contiguous arc", cx - radius, cy + radius + 22);
        ctx.restore();
    }

    function drawBriefPairsTeaching(ctx, center, size, phase, color, rotated = false) {
        const active = Math.floor(phase * 32) % 32;
        const angle = rotated ? -0.55 + .06 * Math.sin(phase * Math.PI * 2) : 0;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(angle);
        ctx.strokeStyle = `${color}35`;
        ctx.lineWidth = 1.2;
        for (let r = size * .18; r <= size * .44; r += size * .13) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < 46; i++) {
            const a = i * 2.399;
            const b = i * 1.317 + 1.2;
            const r1 = size * (.1 + (i % 7) * .045);
            const r2 = size * (.14 + ((i * 3) % 8) * .04);
            const ax = Math.cos(a) * r1;
            const ay = Math.sin(a) * r1;
            const bx = Math.cos(b) * r2;
            const by = Math.sin(b) * r2;
            const hot = i === active;
            ctx.strokeStyle = hot ? "#f97316" : (i < active ? `${color}55` : "rgba(148,163,184,.18)");
            ctx.lineWidth = hot ? 3 : 1.2;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            if (hot) {
                ctx.fillStyle = "#0ea5e9";
                ctx.beginPath();
                ctx.arc(ax, ay, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#f97316";
                ctx.beginPath();
                ctx.arc(bx, by, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        if (rotated) {
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(size * .44, 0);
            ctx.stroke();
        }
        ctx.restore();
        return active;
    }

    function drawBitVector(ctx, x, y, count, active, color, label) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(label, x, y - 10);
        for (let i = 0; i < count; i++) {
            const bx = x + (i % 32) * 9;
            const by = y + Math.floor(i / 32) * 18;
            const on = i <= active;
            ctx.fillStyle = on ? (i === active ? "#f97316" : (i % 3 ? color : "#16a34a")) : "rgba(203,213,225,.45)";
            roundRect(ctx, bx, by, 6, 14, 3);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawSurfKernelSet(ctx, x, y, phase) {
        const kernels = [["Dxx", "#0ea5e9"], ["Dyy", "#2563eb"], ["Dxy", "#7c3aed"]];
        kernels.forEach(([label, color], index) => {
            const kx = x + index * 94;
            ctx.fillStyle = "rgba(255,255,255,.82)";
            ctx.strokeStyle = `${color}88`;
            roundRect(ctx, kx, y, 78, 78, 10);
            ctx.fill();
            ctx.stroke();
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    const hot = label === "Dxy" ? (r === c) : (label === "Dxx" ? c === 1 : r === 1);
                    ctx.fillStyle = hot ? `${color}88` : "rgba(226,232,240,.75)";
                    ctx.fillRect(kx + 9 + c * 20, y + 9 + r * 20, 18, 18);
                }
            }
            ctx.fillStyle = color;
            ctx.font = "950 12px sans-serif";
            ctx.fillText(label, kx + 25, y + 100);
        });
        drawFlowParticles(ctx, x + 276, y + 40, x + 318, y + 40, "#16a34a", phase, 3);
    }

    function drawAnalogTeachingScene(ctx, img, data, step, phase, layout) {
        const algorithm = data.algorithm;
        const color = algorithm === "surf" ? "#0ea5e9" : algorithm === "orb-lite" ? "#16a34a" : "#eab308";
        const point = analogDemoPoint(data, step);
        const imageResult = drawLoadedImageInRect(ctx, img, layout.image, "#f1f5f9");
        const mapped = drawAnalogImageBackdrop(ctx, imageResult, data, point, phase, color);
        const patch = drawAnalogPatchFromImage(ctx, img, point, layout.patch, color, `${data.name} local evidence`);
        const center = { x: patch.x + patch.w / 2, y: patch.y + patch.h / 2 };
        const stage = layout.compute;
        drawMotionPanel(ctx, stage.x, stage.y, stage.w, stage.h, color);

        if (algorithm === "surf") {
            if (step.key === "integral") {
                const rect = { x: patch.x + patch.w * .32, y: patch.y + patch.h * .30, w: patch.w * .42, h: patch.h * .38 };
                ctx.fillStyle = "rgba(37,99,235,.13)";
                ctx.strokeStyle = "#2563eb";
                ctx.lineWidth = 2.3;
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
                ctx.fill();
                ctx.stroke();
                [["A", rect.x, rect.y, "#ef4444"], ["B", rect.x + rect.w, rect.y, "#f97316"], ["C", rect.x, rect.y + rect.h, "#f97316"], ["D", rect.x + rect.w, rect.y + rect.h, "#16a34a"]].forEach(([label, x, y, c], index) => {
                    if (phase < index * .14) return;
                    ctx.fillStyle = c;
                    ctx.beginPath();
                    ctx.arc(x, y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = "#1e293b";
                    ctx.font = "950 12px sans-serif";
                    ctx.fillText(label, x + 8, y - 6);
                });
                ctx.fillStyle = "#0ea5e9";
                ctx.font = "950 15px sans-serif";
                ctx.fillText("Integral image rectangle sum", stage.x + 18, stage.y + 30);
                ctx.font = "950 22px monospace";
                ctx.fillStyle = "#334155";
                const terms = ["D", "+ A", "- B", "- C"];
                ctx.fillText(`Sum = ${terms.slice(0, 1 + Math.floor(phase * 4)).join(" ")}`, stage.x + 22, stage.y + 76);
                drawAnalogMetricStrip(ctx, layout.metrics, [["corner reads", "4", "#0ea5e9"], ["complexity", "O(1)", "#16a34a"], ["output", "area sum", "#f97316"]]);
            } else if (step.key === "hessian") {
                drawSurfKernelSet(ctx, stage.x + 18, stage.y + 18, phase);
                ctx.fillStyle = "#334155";
                ctx.font = "950 15px monospace";
                ctx.fillText("det(H) = Dxx * Dyy - 0.81 * Dxy²", stage.x + 24, stage.y + 168);
                ctx.fillStyle = "rgba(14,165,233,.18)";
                ctx.beginPath();
                ctx.arc(center.x, center.y, 42 + 8 * Math.sin(phase * Math.PI * 2) ** 2, 0, Math.PI * 2);
                ctx.fill();
                drawAnalogMetricStrip(ctx, layout.metrics, [["Dxx/Dyy/Dxy", "box filters", "#0ea5e9"], ["response", "det(H)", "#7c3aed"], ["decision", "local max", "#16a34a"]]);
            } else if (step.key === "orientation") {
                ctx.strokeStyle = "#0ea5e9";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(center.x, center.y, 74, 0, Math.PI * 2);
                ctx.stroke();
                const sweep = phase * Math.PI * 2;
                ctx.fillStyle = "rgba(249,115,22,.18)";
                ctx.beginPath();
                ctx.moveTo(center.x, center.y);
                ctx.arc(center.x, center.y, 74, sweep, sweep + Math.PI / 3);
                ctx.closePath();
                ctx.fill();
                for (let i = 0; i < 34; i++) {
                    const a = i * 2.17;
                    const r = 15 + (i % 7) * 8;
                    drawOrientationArrow(ctx, center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, a * 180 / Math.PI + 24, 10 + (i % 4) * 2, i % 2 ? "#0ea5e9" : "#16a34a", .68, 1.5);
                }
                drawOrientationArrow(ctx, center.x, center.y, -34, 92 * motionEase(phase), "#16a34a", 1, 4);
                ctx.fillStyle = "#0ea5e9";
                ctx.font = "950 15px sans-serif";
                ctx.fillText("Haar responses sweep sector", stage.x + 18, stage.y + 30);
                for (let i = 0; i < 8; i++) {
                    const h = 18 + ((i * 13) % 52) * motionEase(phase);
                    ctx.fillStyle = i === 6 ? "#f97316" : "#60a5fa";
                    roundRect(ctx, stage.x + 26 + i * 29, stage.y + 132 - h, 16, h, 5);
                    ctx.fill();
                }
                drawAnalogMetricStrip(ctx, layout.metrics, [["support", "radius 6σ", "#0ea5e9"], ["window", "π / 3", "#f97316"], ["main θ", "-34°", "#16a34a"]]);
            } else {
                ctx.save();
                ctx.translate(center.x, center.y);
                ctx.rotate(-.35);
                ctx.strokeStyle = "#0ea5e9";
                ctx.lineWidth = 1.5;
                for (let r = -2; r <= 2; r++) {
                    ctx.beginPath();
                    ctx.moveTo(-82, r * 32);
                    ctx.lineTo(82, r * 32);
                    ctx.moveTo(r * 32, -82);
                    ctx.lineTo(r * 32, 82);
                    ctx.stroke();
                }
                ctx.restore();
                const active = Math.floor(phase * 16) % 16;
                for (let i = 0; i < 16; i++) {
                    const x = stage.x + 22 + (i % 8) * 32;
                    const y = stage.y + 40 + Math.floor(i / 8) * 44;
                    ["dx", "dy", "|x|", "|y|"].forEach((_, k) => {
                        ctx.fillStyle = i <= active ? ["#0ea5e9", "#2563eb", "#f97316", "#16a34a"][k] : "#cbd5e1";
                        roundRect(ctx, x + k * 7, y + 30 - (8 + ((i + k * 3) % 20)), 5, 8 + ((i + k * 3) % 20), 3);
                        ctx.fill();
                    });
                }
                drawBitVector(ctx, stage.x + 22, stage.y + 126, 64, Math.floor(phase * 64), "#0ea5e9", "64 float descriptor");
                drawAnalogMetricStrip(ctx, layout.metrics, [["grid", "4×4", "#0ea5e9"], ["per cell", "4 sums", "#f97316"], ["vector", "64 float", "#16a34a"]]);
            }
            return;
        }

        if (step.key === "fast") {
            drawFastRingTeaching(ctx, center.x, center.y, 78, phase, color, algorithm === "orb-lite" ? "orb" : "brief");
            const score = Math.round(42 + 48 * motionEase(phase));
            ctx.fillStyle = color;
            ctx.font = "950 15px sans-serif";
            ctx.fillText("FAST compares center p with 16-pixel circle", stage.x + 18, stage.y + 30);
            ctx.fillStyle = "#334155";
            ctx.font = "900 13px sans-serif";
            ctx.fillText("continuous bright/dark arc -> corner candidate", stage.x + 18, stage.y + 58);
            ctx.strokeStyle = `${color}55`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(stage.x + 72, stage.y + 92, 32, 0, Math.PI * 2);
            ctx.stroke();
            drawFastRingTeaching(ctx, stage.x + 72, stage.y + 92, 28, phase, color, "mini");
            drawAnalogMetricStrip(ctx, layout.metrics, [["circle", "16 pixels", color], ["score", score, "#f97316"], ["NMS", algorithm === "orb-lite" ? "rank + keep" : "local max", "#16a34a"]]);
            return;
        }

        if (algorithm === "fast-brief" && step.key === "pairs") {
            const active = drawBriefPairsTeaching(ctx, center, Math.min(patch.w, patch.h), phase, "#2563eb", false);
            const valueA = 82 + (active * 17) % 120;
            const valueB = 76 + (active * 29) % 132;
            const bit = valueA < valueB ? 1 : 0;
            ctx.fillStyle = "#2563eb";
            ctx.font = "950 15px sans-serif";
            ctx.fillText("BRIEF fixed sampling pairs", stage.x + 18, stage.y + 30);
            [["I(a)", valueA, "#0ea5e9"], ["I(b)", valueB, "#f97316"]].forEach(([label, value, c], i) => {
                const y = stage.y + 62 + i * 42;
                ctx.fillStyle = `${c}22`;
                roundRect(ctx, stage.x + 22, y, 160, 16, 8);
                ctx.fill();
                ctx.fillStyle = c;
                roundRect(ctx, stage.x + 22, y, 160 * value / 220, 16, 8);
                ctx.fill();
                ctx.fillStyle = "#334155";
                ctx.font = "950 12px sans-serif";
                ctx.fillText(label, stage.x + 190, y + 13);
            });
            drawBitVector(ctx, stage.x + 22, stage.y + 136, 32, active, "#2563eb", `bit = ${bit}`);
            drawAnalogMetricStrip(ctx, layout.metrics, [["pairs", "256 fixed", "#2563eb"], ["current bit", bit, bit ? "#16a34a" : "#f97316"], ["rotation", "none", "#64748b"]]);
            return;
        }

        if (algorithm === "orb-lite" && step.key === "orientation") {
            const angle = point.orientation || -.55;
            const centroid = { x: center.x + Math.cos(angle) * 68, y: center.y + Math.sin(angle) * 42 };
            const glow = ctx.createRadialGradient(centroid.x, centroid.y, 10, center.x, center.y, 90);
            glow.addColorStop(0, "rgba(22,163,74,.28)");
            glow.addColorStop(1, "rgba(22,163,74,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(patch.x, patch.y, patch.w, patch.h);
            for (let i = 0; i < 28; i++) {
                const a = i * 2.31;
                const r = 12 + (i % 6) * 10;
                ctx.strokeStyle = "rgba(22,163,74,.2)";
                ctx.beginPath();
                ctx.moveTo(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r);
                ctx.lineTo(centroid.x, centroid.y);
                ctx.stroke();
            }
            ctx.fillStyle = "#16a34a";
            ctx.beginPath();
            ctx.arc(centroid.x, centroid.y, 8, 0, Math.PI * 2);
            ctx.fill();
            drawOrientationArrow(ctx, center.x, center.y, angle * 180 / Math.PI, 88 * motionEase(phase), "#16a34a", 1, 4);
            ctx.fillStyle = "#16a34a";
            ctx.font = "950 15px sans-serif";
            ctx.fillText("Intensity centroid moments", stage.x + 18, stage.y + 30);
            [["m10", .72, "#16a34a"], ["m01", .48, "#0ea5e9"]].forEach(([label, value, c], i) => {
                const y = stage.y + 66 + i * 48;
                ctx.fillStyle = `${c}22`;
                roundRect(ctx, stage.x + 22, y, 180, 16, 8);
                ctx.fill();
                ctx.fillStyle = c;
                roundRect(ctx, stage.x + 22, y, 180 * value * motionEase(phase), 16, 8);
                ctx.fill();
                ctx.fillStyle = "#334155";
                ctx.font = "950 12px sans-serif";
                ctx.fillText(label, stage.x + 214, y + 13);
            });
            drawAnalogMetricStrip(ctx, layout.metrics, [["center", "O"], ["centroid", "C", "#16a34a"], ["θ", `${Math.round(angle * 180 / Math.PI)}°`, "#f97316"]]);
            return;
        }

        const rotated = algorithm === "orb-lite";
        const active = drawBriefPairsTeaching(ctx, center, Math.min(patch.w, patch.h), phase, rotated ? "#16a34a" : "#2563eb", rotated);
        drawBitVector(ctx, stage.x + 22, stage.y + 58, 96, active * 3, rotated ? "#16a34a" : "#2563eb", rotated ? "rotated BRIEF bits" : "BRIEF descriptor bits");
        if (!rotated) {
            ctx.fillStyle = "#7c3aed";
            ctx.font = "950 15px sans-serif";
            ctx.fillText("Hamming matching preview", stage.x + 22, stage.y + 124);
            for (let i = 0; i < 32; i++) {
                const mismatch = (i * 7 + active) % 5 === 0;
                ctx.fillStyle = mismatch ? "#f97316" : "#16a34a";
                roundRect(ctx, stage.x + 22 + i * 8, stage.y + 138, 5, 18, 3);
                ctx.fill();
            }
        }
        drawAnalogMetricStrip(ctx, layout.metrics, [[rotated ? "rotation" : "pairs", rotated ? "Rθ pairs" : "256 tests", rotated ? "#16a34a" : "#2563eb"], ["descriptor", data.descriptorDim, "#f97316"], ["distance", data.distanceType, "#7c3aed"]]);
    }

    async function drawAnalogTeachingCanvas(canvas, src, data, step, options = {}) {
        const thumb = Boolean(options.thumb);
        const width = thumb ? 220 : 920;
        const height = thumb ? 130 : 520;
        ensureCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        let img = cachedImage(src);
        if (!img) {
            preloadImage(src).then(() => {
                if (selectedAlgorithm() !== "sift") drawAnalogStepMain(canvas, currentStep, { animationPhase: siftMotion.progress, thumb });
            });
            ctx.fillStyle = "#eef6ff";
            roundRect(ctx, 18, 18, width - 36, height - 36, 14);
            ctx.fill();
            ctx.fillStyle = "#64748b";
            ctx.font = thumb ? "850 10px sans-serif" : "900 15px sans-serif";
            ctx.fillText("正在准备教学动画...", 32, 44);
            return;
        }
        if (thumb) {
            const mini = drawLoadedImageInRect(ctx, img, { x: 10, y: 16, w: 200, h: 96 }, "#f1f5f9");
            if (mini) {
                const point = analogDemoPoint(data, step);
                const mapped = mapPointToImageRect(point, mini.rect, scaleData?.meta?.width || mini.img.width, scaleData?.meta?.height || mini.img.height);
                const color = data.algorithm === "surf" ? "#0ea5e9" : data.algorithm === "orb-lite" ? "#16a34a" : "#eab308";
                drawCandidateCircle(ctx, mapped.x, mapped.y, 6, color, .95);
            }
            return;
        }
        const layout = {
            image: { x: 28, y: 36, w: 500, h: 378 },
            patch: { x: 560, y: 28, w: 332, h: 216 },
            compute: { x: 560, y: 258, w: 332, h: 160 },
            metrics: { x: 28, y: 438, w: 864, h: 52 }
        };
        drawAnalogTeachingScene(ctx, img, data, step, options.animationPhase || 0, layout);
    }

    async function drawAlgorithmStepCanvas(canvas, src, data, step, options = {}) {
        if (data?.algorithm && data.algorithm !== "sift" && !options.legacy) {
            await drawAnalogTeachingCanvas(canvas, src, data, step, options);
            return;
        }
        const result = await V.drawBaseImage(canvas, src, "#f8fbff");
        if (!result) return;
        const ctx = result.ctx;
        const phase = options.animationPhase || 0;
        const points = data.points || [];
        const selected = points[0] || { x: canvas.width / 2, y: canvas.height / 2, orientation: 0 };

        if (data.algorithm === "surf" && step.key === "integral") {
            ctx.fillStyle = "rgba(248, 251, 255, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const cellSize = 40;
            const px = selected.x; const py = selected.y;
            const w = 4 * cellSize; const h = 3 * cellSize;
            
            const rx = Math.floor(px / cellSize) * cellSize;
            const ry = Math.floor(py / cellSize) * cellSize;
            
            ctx.strokeStyle = "rgba(100, 116, 139, 0.15)";
            ctx.lineWidth = 1;
            for(let x=0; x<=canvas.width; x+=cellSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
            for(let y=0; y<=canvas.height; y+=cellSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
            
            const A = {x: rx - w, y: ry - h};
            const B = {x: rx + w, y: ry - h};
            const C = {x: rx - w, y: ry + h};
            const D = {x: rx + w, y: ry + h};
            
            ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
            ctx.fillRect(A.x, A.y, B.x - A.x, C.y - A.y);
            
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 2;
            ctx.strokeRect(A.x, A.y, B.x - A.x, C.y - A.y);
            
            const drawNode = (pt, label, color, t) => {
                if (phase < t) return;
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = "#1e293b";
                ctx.font = "900 16px sans-serif";
                ctx.fillText(label, pt.x + 10, pt.y - 10);
            };
            
            drawNode(A, "A", "#ef4444", 0.2); 
            drawNode(B, "B", "#eab308", 0.4); 
            drawNode(C, "C", "#eab308", 0.6); 
            drawNode(D, "D", "#22c55e", 0.1); 
            
            const panelX = canvas.width / 2 - 200;
            const panelY = canvas.height - 120;
            
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(0,0,0,0.1)";
            ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.roundRect(panelX, panelY, 400, 100, 10); ctx.fill();
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = "#334155";
            ctx.font = "950 18px sans-serif";
            ctx.fillText("积分图矩形求和 (O(1) 复杂度)", panelX + 20, panelY + 35);
            
            ctx.font = "800 24px monospace";
            let eq = "Sum = ";
            if (phase > 0.1) eq += "D ";
            if (phase > 0.2) eq += "+ A ";
            if (phase > 0.4) eq += "- B ";
            if (phase > 0.6) eq += "- C";
            ctx.fillText(eq, panelX + 20, panelY + 75);
            
            return;
        }
        
        if (data.algorithm === "surf" && step.key === "hessian") {
            ctx.fillStyle = "rgba(248, 251, 255, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const px = canvas.width / 2;
            const py = canvas.height / 2 - 30;
            
            const drawBoxFilter = (cx, cy, type) => {
                const s = 10; 
                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 1;
                ctx.strokeRect(cx - 4.5*s, cy - 4.5*s, 9*s, 9*s);
                
                if (type === "Dyy") {
                    ctx.fillStyle = "#000000"; ctx.fillRect(cx - 4.5*s, cy - 1.5*s, 9*s, 3*s); 
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 4.5*s, cy - 4.5*s, 9*s, 3*s); 
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 4.5*s, cy + 1.5*s, 9*s, 3*s); 
                } else if (type === "Dxx") {
                    ctx.fillStyle = "#000000"; ctx.fillRect(cx - 1.5*s, cy - 4.5*s, 3*s, 9*s); 
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx - 4.5*s, cy - 4.5*s, 3*s, 9*s); 
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx + 1.5*s, cy - 4.5*s, 3*s, 9*s); 
                } else if (type === "Dxy") {
                    ctx.fillStyle = "#000000"; 
                    ctx.fillRect(cx + 0.5*s, cy + 0.5*s, 3*s, 3*s); ctx.fillRect(cx - 3.5*s, cy - 3.5*s, 3*s, 3*s);
                    ctx.fillStyle = "#ffffff"; 
                    ctx.fillRect(cx + 0.5*s, cy - 3.5*s, 3*s, 3*s); ctx.fillRect(cx - 3.5*s, cy + 0.5*s, 3*s, 3*s);
                }
                
                for(let i=0; i<=9; i++) {
                    ctx.beginPath(); ctx.moveTo(cx - 4.5*s + i*s, cy - 4.5*s); ctx.lineTo(cx - 4.5*s + i*s, cy + 4.5*s); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(cx - 4.5*s, cy - 4.5*s + i*s); ctx.lineTo(cx + 4.5*s, cy - 4.5*s + i*s); ctx.stroke();
                }
                
                ctx.fillStyle = "#1e293b";
                ctx.font = "800 16px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(type, cx, cy + 60);
            };
            
            drawBoxFilter(px - 150, py, "Dxx");
            drawBoxFilter(px, py, "Dyy");
            drawBoxFilter(px + 150, py, "Dxy");
            
            const panelX = canvas.width / 2 - 200;
            const panelY = canvas.height - 110;
            ctx.fillStyle = "#334155";
            ctx.font = "950 18px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("Hessian 矩阵行列式近似 (Box Filters)", panelX + 20, panelY + 20);
            
            const detPhase = Math.min(1, phase * 1.5);
            ctx.font = "800 20px monospace";
            let eq = "det(H_approx) = ";
            if (detPhase > 0.3) eq += "Dxx * Dyy";
            if (detPhase > 0.6) eq += " - (0.9 * Dxy)²";
            ctx.fillText(eq, panelX + 20, panelY + 60);
            
            return;
        }
        
        if (data.algorithm === "surf" && step.key === "orientation") {
            ctx.fillStyle = "rgba(248, 251, 255, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const px = canvas.width / 2;
            const py = canvas.height / 2 - 20;
            const radius = 150;
            
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI*2); ctx.stroke();
            
            ctx.fillStyle = "#334155";
            ctx.font = "950 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Haar Wavelet Responses in Radius 6s", px, py - radius - 20);
            
            const seed = 999; let currentSeed = seed;
            const random = () => { currentSeed = (currentSeed * 9301 + 49297) % 233280; return currentSeed / 233280; };
            for(let i=0; i<150; i++) {
                const r = Math.sqrt(random()) * radius;
                const a = random() * Math.PI * 2;
                const weight = random() * 4; 
                const hx = px + Math.cos(a) * r;
                const hy = py + Math.sin(a) * r;
                
                ctx.fillStyle = (a > Math.PI/4 && a < 3*Math.PI/4) ? "#3b82f6" : "#94a3b8"; 
                ctx.beginPath(); ctx.arc(hx, hy, weight, 0, Math.PI*2); ctx.fill();
            }
            
            const wedgePhase = phase; 
            const sweepAngle = wedgePhase * Math.PI * 2;
            const wedgeSize = Math.PI / 3;
            
            ctx.fillStyle = "rgba(234, 179, 8, 0.2)";
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.arc(px, py, radius, sweepAngle, sweepAngle + wedgeSize);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#eab308";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            if (phase > 0.9) {
                const targetAngle = Math.PI / 2; 
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(px + Math.cos(targetAngle) * radius * 1.2, py + Math.sin(targetAngle) * radius * 1.2);
                ctx.stroke();
                
                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.moveTo(px + Math.cos(targetAngle) * radius * 1.2, py + Math.sin(targetAngle) * radius * 1.2);
                ctx.lineTo(px + Math.cos(targetAngle) * radius * 1.2 - 12*Math.cos(targetAngle-0.5), py + Math.sin(targetAngle) * radius * 1.2 - 12*Math.sin(targetAngle-0.5));
                ctx.lineTo(px + Math.cos(targetAngle) * radius * 1.2 - 12*Math.cos(targetAngle+0.5), py + Math.sin(targetAngle) * radius * 1.2 - 12*Math.sin(targetAngle+0.5));
                ctx.fill();
            }
            
            ctx.fillStyle = "#334155";
            ctx.font = "800 16px sans-serif";
            ctx.fillText("滑动扇形窗口 (π/3) 统计响应和", px, py + radius + 40);
            
            return;
        }

        if (step.key === "fast") {
            // Draw background points
            points.slice(0, 150).forEach(point => {
                V.drawDiamond(ctx, point.x, point.y, data.algorithm === "orb-lite" ? "#22c55e" : "#eab308", 4);
            });
            
            // Dim background
            ctx.fillStyle = "rgba(248, 251, 255, 0.75)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw selected point highlighted
            V.drawDiamond(ctx, selected.x, selected.y, data.algorithm === "orb-lite" ? "#16a34a" : "#ca8a04", 8);
            
            // Setup Magnifier
            const cellSize = 38;
            const magSize = cellSize * 7;
            const magX = Math.min(canvas.width - magSize / 2 - 40, Math.max(magSize / 2 + 40, selected.x + 180));
            const magY = canvas.height / 2;
            
            // Draw connection line
            ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(selected.x, selected.y);
            ctx.bezierCurveTo(selected.x + 100, selected.y, magX - 100, magY, magX, magY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw Magnifier Background
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.15)";
            ctx.shadowBlur = 24;
            ctx.shadowOffsetY = 8;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.roundRect(magX - magSize/2 - 20, magY - magSize/2 - 20, magSize + 40, magSize + 60, 20);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = "#334155";
            ctx.font = "950 16px sans-serif";
            ctx.fillText("FAST-9 16-pixel Ring", magX - magSize/2 - 2, magY - magSize/2 - 40);
            
            // Grid
            ctx.strokeStyle = "rgba(203, 213, 225, 0.4)";
            ctx.lineWidth = 1;
            for(let i = 0; i <= 7; i++) {
                ctx.beginPath();
                ctx.moveTo(magX - magSize/2 + i * cellSize, magY - magSize/2);
                ctx.lineTo(magX - magSize/2 + i * cellSize, magY + magSize/2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(magX - magSize/2, magY - magSize/2 + i * cellSize);
                ctx.lineTo(magX + magSize/2, magY - magSize/2 + i * cellSize);
                ctx.stroke();
            }
            
            // Center Pixel p
            ctx.fillStyle = "#3b82f6";
            ctx.fillRect(magX - cellSize/2, magY - cellSize/2, cellSize, cellSize);
            ctx.fillStyle = "#ffffff";
            ctx.font = "900 18px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("p", magX, magY);
            
            // Bresenham circle coordinates (radius 3)
            const offsets = [
                [0,-3], [1,-3], [2,-2], [3,-1], [3,0], [3,1], [2,2], [1,3],
                [0,3], [-1,3], [-2,2], [-3,-1], [-3,0], [-3,1], [-2,-2], [-1,-3]
            ];
            
            // Radar sweep logic
            const sweepIndex = Math.floor((phase * 2) * 16) % 16;
            const isContiguous = (i) => i >= 2 && i <= 10; // Highlight a contiguous bright region
            const isOrb = data.algorithm === "orb-lite";
            
            offsets.forEach(([dx, dy], i) => {
                const px = magX + dx * cellSize;
                const py = magY + dy * cellSize;
                
                // Determine state
                let stateColor = "#f1f5f9"; // unvisited
                let strokeColor = "#cbd5e1";
                if (i <= sweepIndex || phase > 0.5) {
                    if (isContiguous(i)) {
                        stateColor = isOrb ? "#dcfce7" : "#fef08a"; // bright
                        strokeColor = isOrb ? "#22c55e" : "#eab308";
                    } else {
                        stateColor = "#e2e8f0"; // dark
                        strokeColor = "#94a3b8";
                    }
                }
                
                ctx.fillStyle = stateColor;
                ctx.fillRect(px - cellSize/2 + 2, py - cellSize/2 + 2, cellSize - 4, cellSize - 4);
                
                if (i === sweepIndex && phase < 0.5) {
                    ctx.strokeStyle = "#ef4444";
                    ctx.lineWidth = 3;
                    ctx.strokeRect(px - cellSize/2, py - cellSize/2, cellSize, cellSize);
                } else {
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px - cellSize/2 + 2, py - cellSize/2 + 2, cellSize - 4, cellSize - 4);
                }
                
                ctx.fillStyle = "#64748b";
                ctx.font = "800 11px sans-serif";
                ctx.fillText(String(i + 1), px, py);
            });
            
            ctx.restore();
            return;
        }

        if (data.algorithm === "fast-brief" && step.key === "pairs") {
            // Dim background
            ctx.fillStyle = "rgba(248, 251, 255, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw patch
            const patchSize = 310;
            const px = canvas.width / 2;
            const py = canvas.height / 2;
            
            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(0,0,0,0.1)";
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.roundRect(px - patchSize/2 - 20, py - patchSize/2 - 20, patchSize + 40, patchSize + 60, 20);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = "#334155";
            ctx.font = "950 16px sans-serif";
            ctx.fillText("BRIEF 31×31 采样对 (Gaussian Dist.)", px - patchSize/2, py - patchSize/2 - 40);
            
            // Seeded random for stable pairs
            const seed = 12345;
            let currentSeed = seed;
            const random = () => {
                currentSeed = (currentSeed * 9301 + 49297) % 233280;
                return currentSeed / 233280;
            };
            
            const randomGaussian = () => {
                let u = 0, v = 0;
                while(u === 0) u = random();
                while(v === 0) v = random();
                return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            };
            
            const numPairs = 256;
            const pairs = [];
            for(let i=0; i<numPairs; i++) {
                const std = patchSize / 5;
                const p1x = Math.max(-patchSize/2, Math.min(patchSize/2, randomGaussian() * std));
                const p1y = Math.max(-patchSize/2, Math.min(patchSize/2, randomGaussian() * std));
                const p2x = Math.max(-patchSize/2, Math.min(patchSize/2, randomGaussian() * std));
                const p2y = Math.max(-patchSize/2, Math.min(patchSize/2, randomGaussian() * std));
                pairs.push({p1x, p1y, p2x, p2y});
            }
            
            const activePairIndex = Math.floor(phase * numPairs * 1.5) % numPairs;
            
            pairs.forEach((pair, i) => {
                const isActive = (i === activePairIndex);
                const isPast = (i < activePairIndex) || (phase > 0.66);
                
                if (!isPast && !isActive) return;
                
                ctx.strokeStyle = isActive ? "#ef4444" : "rgba(37,99,235,0.15)";
                ctx.lineWidth = isActive ? 2.5 : 1;
                
                const ax = px + pair.p1x;
                const ay = py + pair.p1y;
                const bx = px + pair.p2x;
                const by = py + pair.p2y;
                
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
                
                if (isActive) {
                    ctx.fillStyle = "#3b82f6";
                    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = "#eab308";
                    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI*2); ctx.fill();
                    
                    ctx.fillStyle = "#1e293b";
                    ctx.font = "900 14px sans-serif";
                    const bit = random() > 0.5 ? 1 : 0;
                    ctx.fillText(`I(p1) ${bit ? "<" : ">"} I(p2)  →  Bit = ${bit}`, px - 70, py + patchSize/2 + 25);
                }
            });
            
            ctx.restore();
            return;
        }

        if (step.key === "descriptor") {
            ctx.fillStyle = "rgba(248, 251, 255, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const bits = data.descriptorType === "binary" ? (data.algorithm === "fast-brief" || data.algorithm === "orb-lite" ? 256 : 32) : 64;
            
            if (bits === 256) {
                const isOrb = data.algorithm === "orb-lite";
                const gridW = 380;
                const cellW = gridW / 16;
                const startX = isOrb ? (canvas.width / 2 + 30) : (canvas.width / 2 - gridW / 2);
                const startY = canvas.height / 2 - gridW / 2;
                
                if (isOrb) {
                    const px = canvas.width / 2 - 200;
                    const py = canvas.height / 2;
                    const patchSize = 220;
                    
                    ctx.save();
                    ctx.fillStyle = "#ffffff";
                    ctx.shadowColor = "rgba(0,0,0,0.1)";
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(px, py, patchSize/2, 0, Math.PI*2);
                    ctx.fill();
                    ctx.clip();
                    const grad = ctx.createRadialGradient(px + patchSize*0.1, py + patchSize*0.2, 10, px, py, patchSize/2);
                    grad.addColorStop(0, "rgba(34, 197, 94, 0.15)");
                    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
                    ctx.fillStyle = grad;
                    ctx.fillRect(px - patchSize, py - patchSize, patchSize*2, patchSize*2);
                    ctx.restore();
                    
                    ctx.strokeStyle = "#cbd5e1";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(px, py, patchSize/2, 0, Math.PI*2);
                    ctx.stroke();
                    
                    ctx.fillStyle = "#334155";
                    ctx.font = "950 16px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("Steered BRIEF Pairs", px, py - patchSize/2 - 25);
                    
                    const theta = selected.orientation || (Math.PI / 3);
                    const steerPhase = Math.min(1, phase * 3);
                    const currentAngle = theta * (1 - Math.pow(1 - steerPhase, 3));
                    
                    const numPairs = 120;
                    const seed = 42; let currentSeed = seed;
                    const random = () => { currentSeed = (currentSeed * 9301 + 49297) % 233280; return currentSeed / 233280; };
                    const randomGaussian = () => { let u=0, v=0; while(u===0)u=random(); while(v===0)v=random(); return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); };
                    
                    const cosA = Math.cos(currentAngle);
                    const sinA = Math.sin(currentAngle);
                    
                    const drawPairPhase = Math.max(0, Math.min(1, (phase - 0.33) * 1.5));
                    const activePairIndex = Math.floor(drawPairPhase * numPairs);
                    
                    for(let i=0; i<numPairs; i++) {
                        const std = patchSize / 5;
                        const bx1 = randomGaussian() * std; const by1 = randomGaussian() * std;
                        const bx2 = randomGaussian() * std; const by2 = randomGaussian() * std;
                        
                        const rx1 = bx1 * cosA - by1 * sinA; const ry1 = bx1 * sinA + by1 * cosA;
                        const rx2 = bx2 * cosA - by2 * sinA; const ry2 = bx2 * sinA + by2 * cosA;
                        
                        const ax = px + rx1; const ay = py + ry1;
                        const bx = px + rx2; const by = py + ry2;
                        
                        const isActive = (i === activePairIndex);
                        const isPast = i < activePairIndex;
                        if (!isPast && !isActive) {
                            ctx.strokeStyle = "rgba(100, 116, 139, 0.08)";
                            ctx.lineWidth = 1;
                            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
                        } else {
                            ctx.strokeStyle = isActive ? "#ef4444" : "rgba(34, 197, 94, 0.15)";
                            ctx.lineWidth = isActive ? 2 : 1;
                            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
                        }
                    }
                    
                    ctx.strokeStyle = "#ef4444";
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4,4]);
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + Math.cos(currentAngle) * patchSize/2.2, py + Math.sin(currentAngle) * patchSize/2.2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                
                ctx.fillStyle = "#334155";
                ctx.font = "950 18px sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(`256-bit 二进制描述子 (${data.algorithm})`, startX, startY - 30);
                
                let bitPhase = isOrb ? Math.max(0, Math.min(1, (phase - 0.33) * 1.5)) : phase;
                const activeBit = Math.floor(bitPhase * 256 * 1.2);
                
                for(let i=0; i<256; i++) {
                    const row = Math.floor(i / 16);
                    const col = i % 16;
                    const x = startX + col * cellW;
                    const y = startY + row * cellW;
                    
                    const val = (Math.sin(i * 12.345) > 0) ? 1 : 0;
                    
                    if (i <= activeBit || phase > 0.95) {
                        ctx.fillStyle = val ? (isOrb ? "#16a34a" : "#2563eb") : "#f1f5f9";
                        ctx.fillRect(x + 1, y + 1, cellW - 2, cellW - 2);
                        
                        ctx.fillStyle = val ? "#ffffff" : "#94a3b8";
                        ctx.font = "800 11px sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(val, x + cellW/2, y + cellW/2);
                        
                        if (i === activeBit) {
                            ctx.strokeStyle = "#ef4444";
                            ctx.lineWidth = 2;
                            ctx.strokeRect(x, y, cellW, cellW);
                        }
                    } else {
                        ctx.fillStyle = "#e2e8f0";
                        ctx.fillRect(x + 1, y + 1, cellW - 2, cellW - 2);
                    }
                }
                return;
            }
            
            if (data.algorithm === "surf") {
                const gridW = 300;
                const cellW = gridW / 4;
                const startX = canvas.width / 2 - 350;
                const startY = canvas.height / 2 - gridW / 2;
                
                ctx.fillStyle = "#334155";
                ctx.font = "950 18px sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(`64维描述子 (4×4 Grid, 4 Features/Cell)`, startX, startY - 20);
                
                ctx.strokeStyle = "#cbd5e1";
                ctx.lineWidth = 1;
                for(let i=0; i<=4; i++) {
                    ctx.beginPath(); ctx.moveTo(startX + i*cellW, startY); ctx.lineTo(startX + i*cellW, startY + gridW); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(startX, startY + i*cellW); ctx.lineTo(startX + gridW, startY + i*cellW); ctx.stroke();
                }
                
                const chartX = startX + gridW + 40;
                const chartW = 350;
                const chartH = gridW;
                const barW = chartW / 64;
                
                ctx.fillText(`Flattened 64-D Vector`, chartX, startY - 20);
                ctx.strokeStyle = "rgba(100, 116, 139, 0.2)";
                ctx.beginPath(); ctx.moveTo(chartX, startY + chartH); ctx.lineTo(chartX + chartW, startY + chartH); ctx.stroke();
                
                const currentCell = Math.min(15, Math.floor(phase * 16 * 1.2));
                
                for(let c=0; c<16; c++) {
                    const cx = startX + (c%4)*cellW + cellW/2;
                    const cy = startY + Math.floor(c/4)*cellW + cellW/2;
                    
                    if (c === currentCell && phase < 0.95) {
                        ctx.fillStyle = "rgba(234, 179, 8, 0.2)";
                        ctx.fillRect(startX + (c%4)*cellW, startY + Math.floor(c/4)*cellW, cellW, cellW);
                    }
                    
                    if (c <= currentCell || phase > 0.95) {
                        ctx.fillStyle = "#3b82f6"; ctx.fillRect(cx - 15, cy - 20, 8, 20);
                        ctx.fillStyle = "#22c55e"; ctx.fillRect(cx - 5, cy - 15, 8, 15);
                        ctx.fillStyle = "#ef4444"; ctx.fillRect(cx + 5, cy - 25, 8, 25);
                        ctx.fillStyle = "#f59e0b"; ctx.fillRect(cx + 15, cy - 10, 8, 10);
                        
                        const ease = (c === currentCell && phase < 0.95) ? Math.max(0, Math.min(1, (phase * 16 * 1.2 - c))) : 1;
                        
                        const bx = chartX + c * 4 * barW;
                        ctx.fillStyle = "#3b82f6"; ctx.fillRect(bx, startY + chartH - 20*ease, barW-1, 20*ease);
                        ctx.fillStyle = "#22c55e"; ctx.fillRect(bx + barW, startY + chartH - 15*ease, barW-1, 15*ease);
                        ctx.fillStyle = "#ef4444"; ctx.fillRect(bx + 2*barW, startY + chartH - 25*ease, barW-1, 25*ease);
                        ctx.fillStyle = "#f59e0b"; ctx.fillRect(bx + 3*barW, startY + chartH - 10*ease, barW-1, 10*ease);
                    }
                }
                
                return;
            }
            
            const width = Math.min(canvas.width - 32, 420);
            const x0 = (canvas.width - width) / 2;
            const y0 = canvas.height - 34;
            for (let index = 0; index < bits; index++) {
                ctx.fillStyle = `rgba(14,165,233,${0.25 + 0.7 * ((index * 7) % 16) / 16})`;
                ctx.fillRect(x0 + index * width / bits, y0, Math.max(2, width / bits - 2), 18);
            }
            return;
        }

        if (data.algorithm === "orb-lite" && step.key === "orientation") {
            ctx.fillStyle = "rgba(248, 251, 255, 0.85)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const px = canvas.width / 2;
            const py = canvas.height / 2;
            const radius = 160;
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(0,0,0,0.15)";
            ctx.shadowBlur = 24;
            ctx.fill();
            ctx.clip(); 
            
            const grad = ctx.createRadialGradient(px + radius*0.3, py + radius*0.4, 10, px, py, radius);
            grad.addColorStop(0, "rgba(34, 197, 94, 0.5)");
            grad.addColorStop(1, "rgba(255, 255, 255, 0.1)");
            ctx.fillStyle = grad;
            ctx.fillRect(px - radius, py - radius, radius*2, radius*2);
            ctx.restore();
            
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.fillStyle = "#3b82f6";
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#1e293b";
            ctx.font = "800 16px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText("O", px - 25, py - 10);
            
            const angle = selected.orientation || Math.PI / 4;
            const mag = radius * 0.55;
            const cx = px + Math.cos(angle) * mag;
            const cy = py + Math.sin(angle) * mag;
            
            const centroidPhase = Math.min(1, phase * 2);
            const linePhase = Math.max(0, Math.min(1, (phase - 0.5) * 2));
            
            if (centroidPhase > 0.1) {
                ctx.fillStyle = `rgba(234, 179, 8, ${centroidPhase})`;
                ctx.beginPath();
                ctx.arc(px + (cx - px) * centroidPhase, py + (cy - py) * centroidPhase, 6, 0, Math.PI * 2);
                ctx.fill();
                
                if (centroidPhase === 1) {
                    ctx.fillStyle = "#1e293b";
                    ctx.fillText("C (Centroid)", cx + 15, cy + 10);
                }
            }
            
            if (linePhase > 0) {
                const curX = px + (cx - px) * linePhase;
                const curY = py + (cy - py) * linePhase;
                ctx.strokeStyle = "#16a34a";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(curX, curY);
                ctx.stroke();
                
                if (linePhase === 1) {
                    ctx.fillStyle = "#16a34a";
                    ctx.beginPath();
                    ctx.moveTo(curX, curY);
                    ctx.lineTo(curX - 12 * Math.cos(angle - 0.5), curY - 12 * Math.sin(angle - 0.5));
                    ctx.lineTo(curX - 12 * Math.cos(angle + 0.5), curY - 12 * Math.sin(angle + 0.5));
                    ctx.fill();
                    
                    ctx.strokeStyle = "rgba(100, 116, 139, 0.5)";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(px, py, 40, 0, angle, angle < 0);
                    ctx.stroke();
                    
                    ctx.fillStyle = "#334155";
                    ctx.fillText(`θ = ${(angle * 180 / Math.PI).toFixed(1)}°`, px + 50, py + 25);
                }
            }
            
            ctx.fillStyle = "#334155";
            ctx.font = "950 18px sans-serif";
            ctx.fillText("灰度矩主方向 (Intensity Centroid)", px - 150, py - radius - 30);
            ctx.font = "800 14px sans-serif";
            ctx.fillText("m₀₀ = Σ I(x,y)   m₁₀ = Σ x·I(x,y)   m₀₁ = Σ y·I(x,y)", px - 150, py + radius + 40);
            ctx.fillText("Centroid C = (m₁₀/m₀₀, m₀₁/m₀₀)", px - 150, py + radius + 65);
            ctx.fillText("θ = atan2(m₀₁, m₁₀)", px - 150, py + radius + 90);
            
            return;
        }

        await drawAnalogCanvas(canvas, src, data.algorithm, points);
    }

    async function renderAnalogAlgorithms(data) {
        if (!data?.images?.original) return;
        const started = performance.now();
        const gray = await V.imageToGray(data.images.original);
        const siftPoints = data.sift?.oriented_keypoints || data.sift?.extended_points || data.sift?.keypoints || data.sift?.points_keypoints || [];
        const analogSets = [
            {
                algorithm: "sift",
                name: "SIFT",
                family: "DoG + 梯度直方图",
                keypoints: siftPoints.length,
                descriptorType: "float",
                descriptorDim: "128 float",
                distanceType: "L2",
                elapsedMs: Number(data.meta?.elapsed_ms) || 0,
                points: siftPoints,
                note: "原有核心 SIFT 流程：DoG 尺度空间、主方向、128 维浮点描述子。"
            }
        ];
        [
            ["fast-brief", "FAST + BRIEF", "FAST + 二进制比较", "FAST 关键点周围固定 256 对采样，生成 BRIEF bit 描述子。"],
            ["orb-lite", "ORB-lite", "FAST + 旋转 BRIEF", "用局部灰度矩估计方向，再旋转 BRIEF 采样点对。"],
            ["surf", "SURF", "积分图 + Hessian/Haar", "用积分图近似 Hessian 响应，并生成 4×4×4 的 64 维描述子。"]
        ].forEach(([algorithm, name, family, note]) => {
            const set = V.computeDescriptorSet(gray, algorithm, { maxKeypoints: 420 });
            analogSets.push({
                algorithm,
                name,
                family,
                keypoints: set.keypoints.length,
                descriptorType: set.descriptorType,
                descriptorDim: set.descriptorDim,
                distanceType: set.distanceType,
                elapsedMs: set.elapsedMs,
                points: set.keypoints,
                note
            });
        });
        analogData = new Map(analogSets.map(item => [item.algorithm, item]));
        const elapsed = performance.now() - started;
        V.$("siftElapsed").dataset.analogElapsed = elapsed.toFixed(1);
        await renderSelectedAlgorithmStep();
    }

    function analogStepDetails(data, step) {
        const common = [
            ["keypoints", data.keypoints],
            ["descriptor", data.descriptorType],
            ["dimension", data.descriptorDim],
            ["distance", data.distanceType],
            ["processing time", `${data.elapsedMs.toFixed(1)} ms`]
        ];
        if (selectedAlgorithm() === "surf") {
            if (step.key === "integral") return [["输入", "Gray"], ["结构", "Integral Image"], ["矩形求和", "4 corners"], ...common.slice(0, 2)];
            if (step.key === "hessian") return [["响应", "det(H)"], ["近似滤波", "Dxx / Dyy / Dxy"], ["NMS", "local max"], ...common.slice(0, 2)];
            if (step.key === "orientation") return [["方向", "Haar X/Y"], ["主方向", "weighted sum"], ...common.slice(0, 3)];
        }
        if (selectedAlgorithm() === "fast-brief") {
            if (step.key === "fast") return [["检测器", "FAST-9"], ["圆周", "16 points"], ["筛选", "NMS"], ...common.slice(0, 2)];
            if (step.key === "pairs") return [["采样对", "256 pairs"], ["窗口", "31 × 31"], ["方向", "none"], ...common.slice(0, 2)];
        }
        if (selectedAlgorithm() === "orb-lite") {
            if (step.key === "fast") return [["检测器", "FAST-9"], ["筛选", "NMS"], ...common.slice(0, 3)];
            if (step.key === "orientation") return [["方向", "Intensity centroid"], ["矩", "m10 / m01"], ["采样", "rotate pairs"], ...common.slice(0, 2)];
        }
        return common;
    }

    async function renderSelectedAlgorithmStep() {
        const data = analogData.get(selectedAnalogMethod) || analogData.get("sift");
        if (!data || !scaleData?.images?.original || selectedAlgorithm() === "sift") return;
        const step = currentSteps()[currentStep] || currentSteps()[0];
        V.$("siftAnalogMethod").value = data.algorithm;
        V.$("siftAnalogSelectedTitle").textContent = `${data.name} · ${step.title}`;
        V.$("siftAnalogSelectedNote").textContent = step.boundary || data.note;
        V.renderStatList(V.$("siftAnalogSelectedStats"), analogStepDetails(data, step));
        const details = V.$("siftAnalogStepDetails");
        if (details) {
            const primary = step.primary || [step.title, step.goal || ""];
            const secondary = step.secondary || ["输入 / 输出", step.io || step.next || data.note || ""];
            details.innerHTML = [
                `<article class="feature-analog-card"><div class="feature-analog-head"><h3>${primary[0]}</h3><span>Step ${currentStep + 1}</span></div><p>${primary[1]}</p></article>`,
                `<article class="feature-analog-card"><div class="feature-analog-head"><h3>${secondary[0]}</h3><span>${data.descriptorDim}</span></div><p>${secondary[1]}</p></article>`
            ].join("");
        }
        await drawAlgorithmStepCanvas(V.$("siftAnalogSelectedCanvas"), scaleData.images.original, data, step);
    }

    function orientationHistogram(vectors) {
        const histogram = new Array(36).fill(0);
        (vectors || []).forEach(vector => {
            const angle = ((Number(vector.angle) || 0) % 360 + 360) % 360;
            const bin = Math.round(angle / 10) % 36;
            histogram[bin] += (Number(vector.mag) || 0) * (Number(vector.weight) || 1);
        });
        return histogram;
    }

    function cellHistograms(vectors) {
        const cells = Array.from({ length: 4 }, () =>
            Array.from({ length: 4 }, () => new Array(8).fill(0))
        );
        (vectors || []).forEach(vector => {
            const cellX = Math.floor(Number(vector.xbin));
            const cellY = Math.floor(Number(vector.ybin));
            if (cellX < 0 || cellX >= 4 || cellY < 0 || cellY >= 4) return;
            const bin = (Math.floor(Number(vector.obin)) % 8 + 8) % 8;
            cells[cellY][cellX][bin] += (Number(vector.mag) || 0) * (Number(vector.weight) || 1);
        });
        return cells;
    }

    function drawPatch(canvas, vectors) {
        if (!canvas) return;
        V.setCanvasSize(canvas, 360, 260);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#dbeafe";
        for (let index = 0; index <= 16; index++) {
            const x = 30 + index * 18;
            const y = 20 + index * 14;
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.lineTo(x, 244);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(30, y);
            ctx.lineTo(318, y);
            ctx.stroke();
        }
        const maxMagnitude = Math.max(1e-6, ...(vectors || []).map(vector => Number(vector.mag) || 0));
        (vectors || []).forEach(vector => {
            const x = 30 + (Number(vector.dx) + 8.5) * 18;
            const y = 20 + (Number(vector.dy) + 8.5) * 14;
            const length = 4 + 10 * ((Number(vector.mag) || 0) / maxMagnitude);
            const angle = (Number(vector.angle) || 0) * Math.PI / 180;
            ctx.strokeStyle = "#7c3aed";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(angle) * length / 2, y - Math.sin(angle) * length / 2);
            ctx.lineTo(x + Math.cos(angle) * length / 2, y + Math.sin(angle) * length / 2);
            ctx.stroke();
        });
    }

    function drawCells(canvas, cells) {
        if (!canvas) return;
        V.setCanvasSize(canvas, 440, 220);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const size = 42;
        const startX = 22;
        const startY = 22;
        for (let cellY = 0; cellY < 4; cellY++) {
            for (let cellX = 0; cellX < 4; cellX++) {
                const x = startX + cellX * (size + 8);
                const y = startY + cellY * (size + 8);
                ctx.strokeStyle = "#cbd5e1";
                ctx.strokeRect(x, y, size, size);
                const histogram = cells?.[cellY]?.[cellX] || [];
                const maximum = Math.max(1e-9, ...histogram);
                for (let bin = 0; bin < 8; bin++) {
                    const angle = bin / 8 * Math.PI * 2;
                    const length = 4 + 12 * ((histogram[bin] || 0) / maximum);
                    const centerX = x + size / 2;
                    const centerY = y + size / 2;
                    ctx.strokeStyle = "#2563eb";
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
                    ctx.stroke();
                }
            }
        }
    }

    async function renderDescriptor(data) {
        descriptorData = data;
        const selected = data.sift?.selected;
        const oriented = data.sift?.oriented_keypoints || data.sift?.extended_points || [];
        await V.drawSiftKeypoints(
            V.$("descriptorKeypointCanvas"),
            data.images.original,
            oriented,
            { max: 250 }
        );

        const vectors = selected?.patch_vectors || [];
        drawPatch(V.$("descriptorPatchCanvas"), vectors);
        const histogram = orientationHistogram(vectors);
        const mainBin = selected ? Math.round(Number(selected.orientation_deg) / 10) % 36 : -1;
        V.drawBarChart(V.$("orientationHist"), histogram, {
            width: 820, height: 160, highlight: mainBin, color: "#60a5fa"
        });
        drawCells(V.$("cellHistCanvas"), cellHistograms(vectors));
        V.drawBarChart(V.$("descriptor128Canvas"), selected?.descriptor128 || [], {
            width: 820, height: 180, color: "#2563eb"
        });
        V.renderStatList(V.$("keypointInfo"), selected ? [
            ["x, y", `${selected.x}, ${selected.y}`],
            ["octave / layer", `${selected.octave} / ${selected.layer}`],
            ["σ", selected.sigma],
            ["主方向", `${selected.orientation_deg}°`],
            ["Response", selected.response],
            ["Descriptor", "128 维"]
        ] : [["状态", "当前参数下未检测到可生成描述子的关键点"]]);
        setDescriptorStatus(
            selected ? `已加载 ${oriented.length} 个方向关键点，当前展示 1 个描述子。` : "未检测到可生成描述子的关键点。",
            selected ? "ready" : "empty"
        );
        V.$("siftElapsed").textContent = `${data.meta.elapsed_ms} ms · 描述子数据`;
        await renderAnalogAlgorithms(data);
        await renderCurrentStepView();
    }

    function compactNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return value ?? "-";
        if (Math.abs(number) >= 1000000 || (Math.abs(number) > 0 && Math.abs(number) < 0.001)) {
            return number.toExponential(2);
        }
        if (Math.abs(number) >= 1000) return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 2 }).format(number);
        return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/\.?0+$/, "");
    }

    function evenlySamplePoints(points, max) {
        const list = Array.isArray(points) ? points : [];
        const limit = Math.max(0, Number(max) || 0);
        if (!limit || list.length <= limit) return list;
        if (limit === 1) return [list[Math.floor(list.length / 2)]];
        const step = (list.length - 1) / (limit - 1);
        return Array.from({ length: limit }, (_, index) => list[Math.round(index * step)]);
    }

    function normalizeAngleDeg(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return (number % 360 + 360) % 360;
    }

    function pointOrientationDeg(point) {
        if (!point) return 0;
        if (Number.isFinite(Number(point.orientation_deg))) return normalizeAngleDeg(point.orientation_deg);
        if (Number.isFinite(Number(point.angle))) return normalizeAngleDeg(point.angle);
        if (Number.isFinite(Number(point.orientation))) {
            const value = Number(point.orientation);
            return normalizeAngleDeg(Math.abs(value) <= Math.PI * 2 + .01 ? value * 180 / Math.PI : value);
        }
        return 0;
    }

    function angleDistanceDeg(a, b) {
        const diff = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
        return Math.min(diff, 360 - diff);
    }

    function orientationKeypoints() {
        const descriptor = descriptorData?.sift || {};
        const sift = scaleData?.sift || {};
        const oriented = descriptor.oriented_keypoints || descriptor.extended_points || sift.oriented_keypoints || sift.extended_points || [];
        const base = oriented.length ? oriented : (sift.points_keypoints || sift.keypoints || []);
        if (base.length) return base;
        return descriptor.selected ? [descriptor.selected] : [];
    }

    function sameLocationOrientations(point, keypoints) {
        if (!point) return [];
        const px = Math.round(Number(point.x) || 0);
        const py = Math.round(Number(point.y) || 0);
        const octave = Number(point.octave);
        const layer = Number(point.layer ?? point.scale);
        return (keypoints || []).filter(item => {
            const sameXY = Math.abs((Number(item.x) || 0) - px) <= 1 && Math.abs((Number(item.y) || 0) - py) <= 1;
            const sameOctave = !Number.isFinite(octave) || !Number.isFinite(Number(item.octave)) || Number(item.octave) === octave;
            const sameLayer = !Number.isFinite(layer) || !Number.isFinite(Number(item.layer ?? item.scale)) || Number(item.layer ?? item.scale) === layer;
            return sameXY && sameOctave && sameLayer;
        });
    }

    function orientationSyntheticVectors(point, secondary) {
        const mainAngle = pointOrientationDeg(point);
        const secondaryAngle = secondary ? pointOrientationDeg(secondary) : null;
        const secondaryRatio = secondary ? Math.max(.55, Math.min(1, Number(secondary.relative_peak) || .82)) : 0;
        const seed = ((Number(point?.x) || 0) * 31 + (Number(point?.y) || 0) * 17 + (Number(point?.octave) || 0) * 13) % 360;
        const vectors = [];
        for (let row = -6; row <= 6; row++) {
            for (let col = -6; col <= 6; col++) {
                const radius = Math.hypot(col, row);
                if (radius > 6.35) continue;
                const index = vectors.length;
                const chooseSecondary = secondaryAngle !== null && (index + Math.round(seed)) % 5 === 0;
                const baseAngle = chooseSecondary ? secondaryAngle : mainAngle;
                const swirl = 8 * Math.sin((col * 1.7 + row * 2.3 + seed) * Math.PI / 18);
                const weight = Math.exp(-(radius * radius) / 18);
                const lobe = chooseSecondary ? secondaryRatio : 1;
                const mag = (4.5 + 7.5 * weight + ((index * 7 + seed) % 9) * .45) * lobe;
                vectors.push({
                    dx: col,
                    dy: row,
                    angle: normalizeAngleDeg(baseAngle + swirl),
                    mag,
                    weight
                });
            }
        }
        return vectors;
    }

    function orientationVectorsForPoint(point, keypoints) {
        const selected = descriptorData?.sift?.selected;
        const selectedVectors = selected?.patch_vectors || [];
        const sameLocation = sameLocationOrientations(point, keypoints)
            .filter(item => angleDistanceDeg(pointOrientationDeg(item), pointOrientationDeg(point)) > 12)
            .sort((a, b) => (Number(b.orientation_peak) || Number(b.relative_peak) || 0) - (Number(a.orientation_peak) || Number(a.relative_peak) || 0));
        const secondary = sameLocation[0] || null;
        const isSelectedDescriptor = selected && Math.abs((Number(selected.x) || 0) - (Number(point?.x) || 0)) <= 1 &&
            Math.abs((Number(selected.y) || 0) - (Number(point?.y) || 0)) <= 1;
        if (isSelectedDescriptor && selectedVectors.length) return selectedVectors.slice(0, 140);
        return orientationSyntheticVectors(point, secondary);
    }

    function smoothOrientationHistogram(histogram, passes = 2) {
        let values = (histogram || new Array(36).fill(0)).slice(0, 36);
        while (values.length < 36) values.push(0);
        for (let pass = 0; pass < passes; pass++) {
            values = values.map((value, index) => {
                const prev = values[(index + values.length - 1) % values.length] || 0;
                const next = values[(index + 1) % values.length] || 0;
                return (prev + 2 * value + next) / 4;
            });
        }
        return values;
    }

    function orientationPeakInfo(point, keypoints, rawHistogram, smoothHistogram) {
        const values = smoothHistogram?.length ? smoothHistogram : rawHistogram || [];
        const mainAngle = pointOrientationDeg(point);
        const mainBin = Math.round(mainAngle / 10) % 36;
        const maximum = Math.max(1e-6, ...values);
        const histogramSecondary = values
            .map((value, bin) => ({ bin, value, angle: bin * 10 }))
            .filter(item => angleDistanceDeg(item.angle, mainAngle) >= 20)
            .sort((a, b) => b.value - a.value)[0] || { bin: -1, value: 0, angle: 0 };
        const same = sameLocationOrientations(point, keypoints)
            .filter(item => angleDistanceDeg(pointOrientationDeg(item), mainAngle) >= 12)
            .map(item => {
                const angle = pointOrientationDeg(item);
                const bin = Math.round(angle / 10) % 36;
                const ratio = Number(item.relative_peak) || ((Number(item.orientation_peak) || 0) / Math.max(1e-6, Number(point?.orientation_peak) || values[mainBin] || maximum));
                return { bin, angle, value: values[bin] || histogramSecondary.value, ratio };
            })
            .sort((a, b) => b.ratio - a.ratio);
        const secondary = same[0] || {
            bin: histogramSecondary.bin,
            angle: histogramSecondary.angle,
            value: histogramSecondary.value,
            ratio: histogramSecondary.value / maximum
        };
        const secondaryRatio = Math.max(0, Math.min(1, Number(secondary.ratio) || 0));
        return {
            mainBin,
            mainAngle,
            mainValue: values[mainBin] || maximum,
            secondaryBin: secondary.bin,
            secondaryAngle: normalizeAngleDeg(secondary.angle),
            secondaryValue: secondary.value || 0,
            secondaryRatio,
            hasSecondary: secondary.bin >= 0 && secondaryRatio >= .8,
            outputCount: secondary.bin >= 0 && secondaryRatio >= .8 ? 2 : 1
        };
    }

    function orientationDemoPayload() {
        const keypoints = orientationKeypoints();
        if (!keypoints.length) {
            const fallbackPoint = descriptorData?.sift?.selected || { x: scaleData?.meta?.width ? scaleData.meta.width / 2 : 0, y: scaleData?.meta?.height ? scaleData.meta.height / 2 : 0, sigma: 1.6, octave: 0, layer: 0, orientation_deg: 0 };
            const vectors = orientationSyntheticVectors(fallbackPoint, null);
            const rawHistogram = orientationHistogram(vectors);
            const smoothHistogram = smoothOrientationHistogram(rawHistogram);
            return { point: fallbackPoint, keypoints: [], index: 0, vectors, rawHistogram, smoothHistogram, peaks: orientationPeakInfo(fallbackPoint, [], rawHistogram, smoothHistogram) };
        }
        orientationDemoIndex = Math.max(0, Math.min(keypoints.length - 1, orientationDemoIndex));
        const point = keypoints[orientationDemoIndex] || keypoints[0];
        const vectors = orientationVectorsForPoint(point, keypoints);
        const rawHistogram = orientationHistogram(vectors);
        const smoothHistogram = smoothOrientationHistogram(rawHistogram);
        return {
            point,
            keypoints,
            index: orientationDemoIndex,
            vectors,
            rawHistogram,
            smoothHistogram,
            peaks: orientationPeakInfo(point, keypoints, rawHistogram, smoothHistogram)
        };
    }


    function stepFormula(algorithm, step) {
        if (algorithm === "sift") {
            return [
                {
                    formula: "G(x,y)=0.299R+0.587G+0.114B",
                    details: ["把输入统一成单通道强度图。", "后续 Gaussian、DoG、梯度方向都基于同一灰度输入。"]
                },
                {
                    formula: "L(x,y,\\sigma)=G(x,y,\\sigma)*I(x,y)",
                    details: ["同一 octave 内逐层增大 σ。", "进入下一 octave 前对图像下采样。"]
                },
                {
                    formula: "D(x,y,\\sigma)=L(x,y,k\\sigma)-L(x,y,\\sigma)",
                    details: ["相邻高斯层相减近似 LoG。", "DoG 响应越稳定，越可能成为尺度特征候选。"]
                },
                {
                    formula: "D(x,y,\\sigma) \\gtrless N_{26}",
                    details: ["当前点与本层 8 个邻居比较。", "同时与上一层和下一层各 9 个邻居比较，共 26 个邻居。"]
                },
                {
                    formula: "|D(x,y,\\sigma)|\\ge T_c,\\quad \\frac{\\operatorname{Tr}(H)^2}{\\det(H)}<\\frac{(r+1)^2}{r}",
                    details: ["低对比度响应先被剔除。", "Hessian 边缘响应过强的点会被过滤，最后再用 NMS 去掉局部重复点。"]
                },
                {
                    formula: "\\theta=\\arg\\max_b H_b,\\quad H_b=\\sum w(x,y)m(x,y)",
                    details: ["在关键点尺度邻域内统计 36-bin 梯度方向直方图。", "主峰方向作为局部坐标系方向。"]
                },
                {
                    formula: "\\mathrm{Descriptor}=4\\times4\\times8=128",
                    details: ["16×16 邻域分成 4×4 个 cell。", "每个 cell 统计 8 个方向并做归一化。"]
                }
            ][step];
        }
        if (algorithm === "surf") {
            return [
                {
                    formula: "S(x,y)=\\sum_{i\\le x,j\\le y}I(i,j)",
                    details: ["积分图让任意矩形求和只需要四个角。", "盒式滤波可快速近似高斯二阶导。"]
                },
                {
                    formula: "\\det(H)\\approx D_{xx}D_{yy}-0.81D_{xy}^{2}",
                    details: ["用盒式响应近似 Hessian 矩阵。", "局部最大 Hessian 响应作为关键点。"]
                },
                {
                    formula: "\\theta=\\operatorname{atan2}(\\sum Haar_y,\\sum Haar_x)",
                    details: ["在关键点邻域累计 Haar X/Y 响应。", "主方向用于旋转归一化。"]
                },
                {
                    formula: "\\mathrm{SURF}=4\\times4\\times(dx,dy,|dx|,|dy|)=64",
                    details: ["每个 cell 汇总四个 Haar 统计量。", "64 维浮点描述子使用 L2 距离。"]
                }
            ][step];
        }
        if (algorithm === "fast-brief") {
            return [
                {
                    formula: "\\exists\\ N\\ \\text{连续圆周点}: |I(p_i)-I(c)|>t",
                    details: ["中心点和半径 3 的 16 个圆周点比较。", "通过 NMS 保留响应更强的 FAST 点。"]
                },
                {
                    formula: "b_i=[I(a_i)<I(b_i)],\\quad i=1\\ldots256",
                    details: ["每个采样点对只产生 1 bit。", "固定采样对不做方向旋转。"]
                },
                {
                    formula: "d_H(A,B)=\\operatorname{popcount}(A\\oplus B)",
                    details: ["256 bit BRIEF 描述子使用汉明距离。", "速度快，但旋转稳定性弱于带方向的方法。"]
                }
            ][step];
        }
        return [
            {
                formula: "\\exists\\ N\\ \\text{连续圆周点}: |I(p_i)-I(c)|>t",
                details: ["先用 FAST 找候选角点。", "响应排序和 NMS 控制最终关键点数量。"]
            },
            {
                formula: "\\theta=\\operatorname{atan2}(m_{01},m_{10})",
                details: ["用局部灰度矩估计质心方向。", "方向箭头代表 rotated BRIEF 的旋转角。"]
            },
            {
                formula: "b_i=[I(R_{\\theta}a_i)<I(R_{\\theta}b_i)]",
                details: ["采样点对按主方向旋转。", "二进制描述子仍使用汉明距离匹配。"]
            }
        ][step];
    }

    function noteParams(algorithm, step) {
        const field = name => form.elements[name]?.value || "-";
        if (algorithm === "sift") {
            return [
                [],
                [["每组尺度", field("sift_scales")], ["初始 σ", field("sift_sigma")]],
                [["DoG 阈值", field("contrast_threshold")]],
                [],
                [["对比度阈值", field("contrast_threshold")], ["边缘阈值", field("edge_threshold")]],
                [["方向 bins", 36]],
                [["描述子网格", "4×4"], ["每 cell bins", 8]]
            ][step] || [];
        }
        return [];
    }

    function noteResults(algorithm, step) {
        const meta = scaleData?.meta || {};
        const sift = (descriptorData || scaleData)?.sift || scaleData?.sift || {};
        const counts = sift.counts || {};
        if (algorithm === "sift") {
            const selected = descriptorData?.sift?.selected;
            const oriented = descriptorData?.sift?.oriented_keypoints || descriptorData?.sift?.extended_points || [];
            const orientation = step === 5 ? orientationDemoPayload() : null;
            const orientationPoint = orientation?.point || selected;
            const orientationPeaks = orientation?.peaks || null;
            return [
                [
                    ["图像尺寸", meta.width && meta.height ? `${meta.width} × ${meta.height}` : "-"],
                    ["输入文件", meta.filename || "-"],
                    ["处理通道", "RGB → Gray"]
                ],
                [
                    ["Octave", (scaleData?.pyramid?.gaussian || []).length],
                    ["高斯层总数", (scaleData?.pyramid?.gaussian || []).reduce((sum, oct) => sum + oct.length, 0)]
                ],
                [
                    ["DoG 组数", (scaleData?.pyramid?.dog || []).length],
                    ["原始极值探测", counts.raw_extrema || 0]
                ],
                [
                    ["原始极值点", counts.raw_extrema || 0]
                ],
                [
                    ["原始极值", counts.raw_extrema || 0],
                    ["过滤后点数", counts.edge_survivors || 0],
                    ["最终关键点", counts.kept || sift.count || 0]
                ],
                [
                    ["当前关键点", orientationPoint?.x !== undefined ? `(${compactNumber(orientationPoint.x)}, ${compactNumber(orientationPoint.y)})` : "-"],
                    ["octave / layer", orientationPoint ? `${orientationPoint.octave ?? "-"} / ${orientationPoint.layer ?? orientationPoint.scale ?? "-"}` : "-"],
                    ["σ", orientationPoint?.sigma !== undefined ? compactNumber(orientationPoint.sigma) : "-"],
                    ["主峰角度", orientationPeaks ? `${compactNumber(orientationPeaks.mainAngle)}°` : "-"],
                    ["次峰比例", orientationPeaks ? compactNumber(orientationPeaks.secondaryRatio) : "-"],
                    ["输出方向数", orientationPeaks ? orientationPeaks.outputCount : (oriented.length || "懒加载")]
                ],
                [
                    ["描述子类型", "float"],
                    ["描述子维度", "128"],
                    ["当前响应", selected ? compactNumber(selected.response) : "-"]
                ]
            ][step] || [];
        }
        const fallbackAnalog = {
            surf: { keypoints: "-", descriptorType: "float", descriptorDim: "64 float", distanceType: "L2" },
            "fast-brief": { keypoints: "-", descriptorType: "binary", descriptorDim: "256 bit", distanceType: "Hamming" },
            "orb-lite": { keypoints: "-", descriptorType: "binary", descriptorDim: "256 bit", distanceType: "Hamming" }
        };
        const data = analogData.get(algorithm) || fallbackAnalog[algorithm];
        return [
            ["keypoints", data.keypoints],
            ["descriptor", data.descriptorType],
            ["dimension", data.descriptorDim],
            ["distance", data.distanceType]
        ];
    }

    function renderFormulaBox(algorithm, step) {
        const box = V.$("siftInfoLogic");
        if (!box) return;
        const info = stepFormula(algorithm, step) || { formula: "-", details: [] };
        box.innerHTML = `
            <div class="latex-formula" data-sift-formula></div>
            <ul class="feature-note-detail">${(info.details || []).map(item => `<li>${item}</li>`).join("")}</ul>
        `;
        const target = box.querySelector("[data-sift-formula]");
        if (window.katex && target) {
            try {
                window.katex.render(info.formula, target, { throwOnError: false, displayMode: false });
            } catch (error) {
                target.textContent = info.formula;
            }
        } else if (target) {
            target.textContent = info.formula;
        }
    }

    function renderNotes(step) {
        const content = currentSteps()[step] || currentSteps()[0];
        const info = algorithmInfo[selectedAlgorithm()] || algorithmInfo.sift;
        const algorithm = selectedAlgorithm();
        V.$("siftPipelineLabel").textContent = info.label;
        V.$("siftStageTitle").textContent = `${info.name} · ${content.title}`;
        V.$("siftInfoTitle").textContent = `${info.name} · ${content.title}`;
        V.$("siftInfoGoal").textContent = content.goal;
        V.$("siftInfoIO").textContent = content.io;
        V.$("siftInfoNext").textContent = content.next;
        renderFormulaBox(algorithm, step);
        const params = noteParams(algorithm, step);
        const results = noteResults(algorithm, step);
        V.$("siftInfoParams").parentElement.hidden = params.length === 0;
        V.renderStatList(V.$("siftInfoParams"), params);
        V.renderStatList(V.$("siftInfoResult"), results);
    }

    function cloneToCanvas(packed, palette = "gray") {
        const canvas = document.createElement("canvas");
        V.drawArray(canvas, normalizePacked(packed), palette);
        return canvas;
    }

    function normalizePacked(packed) {
        if (!packed) return null;
        if (packed.values) return packed;
        if (packed.gray) return { width: packed.width, height: packed.height, values: Array.from(packed.gray) };
        return packed;
    }

    function coverRect(srcW, srcH, dstW, dstH, contain = true) {
        const scale = contain ? Math.min(dstW / srcW, dstH / srcH) : Math.max(dstW / srcW, dstH / srcH);
        const w = srcW * scale;
        const h = srcH * scale;
        return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
    }

    async function grayPacked() {
        if (!scaleData?.images?.original) return null;
        return V.imageToGray(scaleData.images.original);
    }

    function drawPackedImage(ctx, packed, rect, palette = "gray") {
        if (!packed) return;
        const temp = cloneToCanvas(packed, palette);
        ctx.drawImage(temp, rect.x, rect.y, rect.w, rect.h);
    }

    async function drawOriginalContained(canvas, width, height, background = "#f8fbff") {
        if (!canvas || !scaleData?.images?.original) return null;
        const img = await V.loadImage(scaleData.images.original);
        V.setCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        const rect = coverRect(img.naturalWidth || img.width, img.naturalHeight || img.height, width, height);
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
        return { ctx, rect, img };
    }

    function drawCanvasTitle(ctx, title, x, y, color = "#1d4ed8") {
        ctx.font = "900 14px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.fillRect(x - 6, y - 16, ctx.measureText(title).width + 14, 24);
        ctx.fillStyle = color;
        ctx.fillText(title, x, y);
    }

    async function drawMainBase(canvas, width = 920, height = 520, background = null) {
        if (!canvas) return null;
        V.setCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, width, height);
        if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, width, height);
        }
        return ctx;
    }

    function drawPseudoPyramidMotion(ctx, rectRows, phase, seedPoint) {
        if (!rectRows.length) return;
        const segments = [];
        if (seedPoint && rectRows[0]?.[0]) {
            const first = rectRows[0][0];
            segments.push({
                from: seedPoint,
                to: { x: first.x + first.w / 2, y: first.y + first.h / 2 },
                fromSize: seedPoint,
                target: first,
                type: "double"
            });
        }
        rectRows.forEach((row, octave) => {
            row.forEach((rect, layer) => {
                if (layer < row.length - 1) {
                    const next = row[layer + 1];
                    segments.push({
                        from: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
                        to: { x: next.x + next.w / 2, y: next.y + next.h / 2 },
                        fromSize: rect,
                        target: next,
                        type: "blur"
                    });
                }
            });
            if (octave < rectRows.length - 1 && rectRows[octave + 1]?.[0]) {
                const sourceIndex = Math.max(0, row.length - 3);
                const fromRect = row[sourceIndex] || row[row.length - 1];
                const toRect = rectRows[octave + 1][0];
                segments.push({
                    from: { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 },
                    to: { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 },
                    fromSize: fromRect,
                    target: toRect,
                    type: "down"
                });
            }
        });
        if (!segments.length) return;
        const total = segments.length;
        const raw = (phase || 0) * total;
        const activeIndex = Math.min(total - 1, Math.floor(raw));
        const activeT = motionEase(raw - activeIndex);
        const active = segments[activeIndex];
        const arrivalOrder = new Map();
        segments.forEach((segment, index) => {
            if (segment.target?.key) arrivalOrder.set(segment.target.key, index);
        });

        ctx.save();
        rectRows.forEach(row => {
            row.forEach(rect => {
                const order = arrivalOrder.get(rect.key);
                if (order === undefined || order < activeIndex) return;
                ctx.fillStyle = "rgba(248,251,255,.94)";
                ctx.strokeStyle = "rgba(191,219,254,.62)";
                ctx.setLineDash([4, 4]);
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 7);
                ctx.fill();
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = "#93a4bd";
                ctx.font = "900 11px sans-serif";
                ctx.fillText(`L${rect.layer}`, rect.x + 10, rect.y + 18);
            });
        });

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        segments.forEach((segment, index) => {
            const done = index < activeIndex;
            const live = index === activeIndex;
            ctx.globalAlpha = live ? .9 : done ? .34 : .12;
            ctx.strokeStyle = segment.type === "down" ? "#06b6d4" : segment.type === "double" ? "#7c3aed" : "#2563eb";
            ctx.lineWidth = live ? 3 : 1.6;
            ctx.beginPath();
            ctx.moveTo(segment.from.x, segment.from.y);
            if (segment.type === "down") {
                const midY = (segment.from.y + segment.to.y) / 2;
                ctx.bezierCurveTo(segment.from.x + 34, midY, segment.to.x - 34, midY, segment.to.x, segment.to.y);
            } else {
                ctx.lineTo(segment.to.x, segment.to.y);
            }
            ctx.stroke();
        });
        ctx.globalAlpha = 1;

        const x = active.from.x + (active.to.x - active.from.x) * activeT;
        const y = active.from.y + (active.to.y - active.from.y) * activeT;
        const target = active.target;
        const fromSize = active.fromSize || target;
        const movingW = Math.max(24, fromSize.w + (target.w - fromSize.w) * activeT);
        const movingH = Math.max(20, fromSize.h + (target.h - fromSize.h) * activeT);
        ctx.shadowColor = active.type === "down" ? "rgba(6,182,212,.22)" : "rgba(37,99,235,.24)";
        ctx.shadowBlur = 16;
        ctx.save();
        roundRect(ctx, x - movingW / 2, y - movingH / 2, movingW, movingH, 7);
        ctx.clip();
        const fitted = coverRect(target.cell.array.width, target.cell.array.height, movingW, movingH, false);
        fitted.x += x - movingW / 2;
        fitted.y += y - movingH / 2;
        drawPackedImage(ctx, target.cell.array, fitted, "gray");
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = active.type === "down" ? "#06b6d4" : active.type === "double" ? "#7c3aed" : "#2563eb";
        ctx.lineWidth = 2.5;
        roundRect(ctx, x - movingW / 2, y - movingH / 2, movingW, movingH, 7);
        ctx.stroke();
        ctx.fillStyle = active.type === "down" ? "#0891b2" : active.type === "double" ? "#7c3aed" : "#1d4ed8";
        ctx.font = "950 12px sans-serif";
        ctx.fillText(active.type === "down" ? "scale down" : active.type === "double" ? "2× base enters" : "blur to next layer", x - movingW / 2, y - movingH / 2 - 8);
        ctx.restore();
    }

    function drawDogDifferenceMotion(ctx, rectRows, gaussianRows, phase, gaussianRectRows = []) {
        const targets = [];
        rectRows.forEach((row, octave) => {
            row.forEach((rect, layer) => {
                const gaussianRow = gaussianRows?.[octave] || [];
                if (gaussianRow[layer] && gaussianRow[layer + 1]) {
                    targets.push({
                        rect,
                        previous: gaussianRow[layer],
                        next: gaussianRow[layer + 1],
                        previousRect: gaussianRectRows?.[octave]?.[layer] || rect,
                        nextRect: gaussianRectRows?.[octave]?.[layer + 1] || rect
                    });
                }
            });
        });
        if (!targets.length) return;

        const maxLayer = Math.max(1, ...targets.map(item => Number(item.rect.layer) + 1 || 1));
        const raw = (phase || 0) * maxLayer;
        const activeLayer = Math.min(maxLayer - 1, Math.floor(raw));
        const activeT = motionEase(raw - activeLayer);
        const activeTargets = targets.filter(item => Number(item.rect.layer) === activeLayer);

        ctx.save();
        targets.forEach(item => {
            const rect = item.rect;
            const layer = Number(rect.layer) || 0;
            if (layer < activeLayer) return;
            ctx.fillStyle = "rgba(248,251,255,.96)";
            roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 7);
            ctx.fill();
            ctx.strokeStyle = "rgba(191,219,254,.7)";
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        });

        gaussianRectRows.forEach(row => {
            row.forEach(sourceRect => {
                const sourceLayer = Number(sourceRect.layer) || 0;
                if (sourceLayer <= activeLayer + 1) return;
                ctx.save();
                ctx.globalAlpha = .78;
                roundRect(ctx, sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h, 7);
                ctx.clip();
                const fitted = coverRect(sourceRect.cell.array.width, sourceRect.cell.array.height, sourceRect.w, sourceRect.h, false);
                fitted.x += sourceRect.x;
                fitted.y += sourceRect.y;
                drawPackedImage(ctx, sourceRect.cell.array, fitted, "gray");
                ctx.restore();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = "rgba(96,165,250,.45)";
                ctx.lineWidth = 1.2;
                roundRect(ctx, sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h, 7);
                ctx.stroke();
                ctx.fillStyle = "rgba(255,255,255,.86)";
                roundRect(ctx, sourceRect.x + 5, sourceRect.y + 5, 25, 18, 6);
                ctx.fill();
                ctx.fillStyle = "#2563eb";
                ctx.font = "900 10px sans-serif";
                ctx.fillText(`G${sourceRect.layer}`, sourceRect.x + 10, sourceRect.y + 18);
            });
        });

        activeTargets.forEach(active => {
            const rect = active.rect;
            const targetCenter = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
            const mergeGap = Math.max(5, rect.w * 0.12 * (1 - activeT));
            const drawSource = (cell, sourceRect, side, label, tone) => {
                const sourceCenter = { x: sourceRect.x + sourceRect.w / 2, y: sourceRect.y + sourceRect.h / 2 };
                const targetX = targetCenter.x + side * mergeGap;
                const targetY = targetCenter.y;
                const cx = sourceCenter.x + (targetX - sourceCenter.x) * activeT;
                const cy = sourceCenter.y + (targetY - sourceCenter.y) * activeT;
                const w = sourceRect.w + (rect.w * 0.52 - sourceRect.w) * activeT;
                const h = sourceRect.h + (rect.h * 0.72 - sourceRect.h) * activeT;
                ctx.save();
                ctx.shadowColor = `${tone}44`;
                ctx.shadowBlur = 10;
                roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 6);
                ctx.clip();
                const fitted = coverRect(cell.array.width, cell.array.height, w, h, false);
                fitted.x += cx - w / 2;
                fitted.y += cy - h / 2;
                drawPackedImage(ctx, cell.array, fitted, "gray");
                ctx.restore();
                ctx.strokeStyle = tone;
                ctx.lineWidth = 1.8;
                roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 6);
                ctx.stroke();
                ctx.fillStyle = tone;
                ctx.font = "950 10px sans-serif";
                ctx.fillText(label, cx - w / 2 + 5, cy - h / 2 - 4);
            };

            drawSource(active.previous, active.previousRect, -1, `G${active.rect.layer}`, "#7c3aed");
            drawSource(active.next, active.nextRect, 1, `G${active.rect.layer + 1}`, "#2563eb");

            ctx.fillStyle = "#f97316";
            ctx.font = "950 20px sans-serif";
            ctx.textAlign = "center";
            ctx.globalAlpha = Math.min(1, activeT * 1.8);
            ctx.fillText("-", targetCenter.x, targetCenter.y + 7);
            ctx.globalAlpha = 1;
            ctx.textAlign = "left";

            if (activeT > 0.38) {
                const resultT = motionEase((activeT - 0.38) / 0.62);
                ctx.save();
                ctx.globalAlpha = resultT;
                ctx.shadowColor = "rgba(249,115,22,.32)";
                ctx.shadowBlur = 14;
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 7);
                ctx.clip();
                const fitted = coverRect(rect.cell.array.width, rect.cell.array.height, rect.w, rect.h, false);
                fitted.x += rect.x;
                fitted.y += rect.y;
                drawPackedImage(ctx, rect.cell.array, fitted, "heat");
                ctx.restore();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 2.4;
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 7);
                ctx.stroke();
            }
        });

        if (activeTargets[0]) {
            const first = activeTargets[0].rect;
            const last = activeTargets[activeTargets.length - 1].rect;
            ctx.fillStyle = "#475569";
            ctx.font = "900 12px sans-serif";
            ctx.fillText(`Layer D${activeLayer}:  G${activeLayer + 1} - G${activeLayer}`, first.x, Math.max(18, first.y - 18));
            ctx.strokeStyle = "rgba(249,115,22,.48)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(first.x, first.y - 10);
            ctx.lineTo(last.x + last.w, first.y - 10);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawPseudoPyramid(ctx, rows, palette, width, height, thumb, phase = 0, sourceRows = null) {
        const octaveRows = (rows || []).filter(row => row?.length);
        if (!octaveRows.length) return;

        const rowCount = octaveRows.length;
        const maxColumns = Math.max(1, ...octaveRows.map(row => row.length));
        const showInitialDouble = !thumb && palette !== "heat";
        const left = thumb ? 13 : 108;
        const right = thumb ? 6 : 24;
        const top = thumb ? 7 : (showInitialDouble ? 64 : 36);
        const bottom = thumb ? 7 : 28;
        const columnGap = thumb ? 3 : 8;
        const rowGap = thumb ? 5 : 22;
        const indentStep = thumb ? 9 : 48;
        const scales = octaveRows.map((row, index) => Math.max(0.58, 1 - index * (thumb ? 0.14 : 0.15)));
        const scaleSum = scales.reduce((sum, scale) => sum + scale, 0);
        const baseHeight = Math.max(12, (height - top - bottom - rowGap * (rowCount - 1)) / scaleSum);
        const baseWidth = Math.max(12, (width - left - right - columnGap * (maxColumns - 1)) / maxColumns);
        const centers = [];
        const rectRows = [];
        let seedPoint = null;
        let y = top;
        const buildSourceRectRows = rowsForLayout => {
            const sourceRows = (rowsForLayout || []).filter(row => row?.length);
            if (!sourceRows.length) return [];
            const sourceMaxColumns = Math.max(1, ...sourceRows.map(row => row.length));
            const sourceTop = palette === "heat" ? 64 : top;
            const sourceScales = sourceRows.map((row, index) => Math.max(0.58, 1 - index * (thumb ? 0.14 : 0.15)));
            const sourceScaleSum = sourceScales.reduce((sum, scale) => sum + scale, 0);
            const sourceBaseHeight = Math.max(12, (height - sourceTop - bottom - rowGap * (sourceRows.length - 1)) / sourceScaleSum);
            const sourceBaseWidth = Math.max(12, (width - left - right - columnGap * (sourceMaxColumns - 1)) / sourceMaxColumns);
            let sourceY = sourceTop;
            return sourceRows.map((row, octaveIndex) => {
                const scale = sourceScales[octaveIndex];
                const cellWidth = sourceBaseWidth * scale;
                const cellHeight = sourceBaseHeight * scale;
                const rowX = left + octaveIndex * indentStep;
                const rects = row.map((cell, layerIndex) => ({
                    x: rowX + layerIndex * (cellWidth + columnGap),
                    y: sourceY,
                    w: cellWidth,
                    h: cellHeight,
                    cell,
                    octave: octaveIndex,
                    layer: cell.layer ?? layerIndex,
                    key: `${octaveIndex}:${layerIndex}`
                }));
                sourceY += cellHeight + rowGap;
                return rects;
            });
        };

        if (showInitialDouble) {
            const meta = scaleData?.meta || {};
            const inputSize = meta.width && meta.height ? `${meta.width}×${meta.height}` : "input";
            const baseSize = meta.width && meta.height ? `${meta.width * 2}×${meta.height * 2}` : "2× base";
            ctx.save();
            const drawSeed = (x, y, title, sub, tone) => {
                ctx.fillStyle = "rgba(255,255,255,.9)";
                ctx.strokeStyle = `${tone}88`;
                ctx.lineWidth = 1.3;
                roundRect(ctx, x, y, 72, 34, 9);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = tone;
                ctx.font = "950 12px sans-serif";
                ctx.fillText(title, x + 9, y + 14);
                ctx.fillStyle = "#64748b";
                ctx.font = "850 10px sans-serif";
                ctx.fillText(sub, x + 9, y + 28);
            };
            drawSeed(14, 10, "Input", inputSize, "#64748b");
            drawSeed(14, 52, "2× base", baseSize, "#2563eb");
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(50, 44);
            ctx.lineTo(50, 54);
            ctx.stroke();
            ctx.fillStyle = "#2563eb";
            ctx.beginPath();
            ctx.moveTo(50, 56);
            ctx.lineTo(45, 48);
            ctx.lineTo(55, 48);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(37,99,235,.55)";
            ctx.lineWidth = 2;
            const targetY = top + baseHeight / 2;
            ctx.beginPath();
            ctx.moveTo(86, 69);
            ctx.lineTo(96, 69);
            ctx.lineTo(96, targetY);
            ctx.lineTo(left - 14, targetY);
            ctx.stroke();
            ctx.fillStyle = "#2563eb";
            ctx.beginPath();
            ctx.moveTo(left - 4, targetY);
            ctx.lineTo(left - 14, targetY - 5);
            ctx.lineTo(left - 14, targetY + 5);
            ctx.closePath();
            ctx.fill();
            seedPoint = { x: 50, y: 69, w: 72, h: 34 };
            ctx.restore();
        }

        octaveRows.forEach((row, octaveIndex) => {
            const scale = scales[octaveIndex];
            const cellWidth = baseWidth * scale;
            const cellHeight = baseHeight * scale;
            const rowX = left + octaveIndex * indentStep;
            const rowWidth = row.length * cellWidth + Math.max(0, row.length - 1) * columnGap;
            const centerY = y + cellHeight / 2;
            centers.push({ x: rowX, y: centerY });
            rectRows[octaveIndex] = [];

            ctx.save();
            ctx.fillStyle = thumb ? "rgba(239,246,255,.5)" : "rgba(239,246,255,.72)";
            ctx.strokeStyle = "rgba(147,197,253,.5)";
            ctx.setLineDash(thumb ? [2, 2] : [5, 5]);
            roundRect(ctx, rowX - (thumb ? 2 : 7), y - (thumb ? 2 : 7), rowWidth + (thumb ? 4 : 14), cellHeight + (thumb ? 4 : 14), thumb ? 4 : 12);
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);

            row.forEach((cell, layerIndex) => {
                const rect = {
                    x: rowX + layerIndex * (cellWidth + columnGap),
                    y,
                    w: cellWidth,
                    h: cellHeight,
                    cell,
                    octave: octaveIndex,
                    layer: cell.layer ?? layerIndex,
                    key: `${octaveIndex}:${layerIndex}`
                };
                rectRows[octaveIndex][layerIndex] = rect;
                ctx.save();
                ctx.shadowColor = "rgba(15,23,42,.14)";
                ctx.shadowBlur = thumb ? 2 : 7;
                ctx.shadowOffsetY = thumb ? 1 : 3;
                ctx.fillStyle = palette === "heat" ? "#f5f3ff" : "#f8fbff";
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, thumb ? 2 : 7);
                ctx.fill();
                ctx.clip();
                const fitted = coverRect(cell.array.width, cell.array.height, rect.w, rect.h, false);
                fitted.x += rect.x;
                fitted.y += rect.y;
                drawPackedImage(ctx, cell.array, fitted, palette);
                ctx.restore();

                ctx.strokeStyle = octaveIndex === 0 ? "#60a5fa" : "rgba(148,163,184,.8)";
                ctx.lineWidth = thumb ? 0.7 : 1.3;
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, thumb ? 2 : 7);
                ctx.stroke();

                if (!thumb) {
                    const label = `L${cell.layer ?? layerIndex}`;
                    ctx.font = "900 11px sans-serif";
                    const labelWidth = ctx.measureText(label).width + 12;
                    ctx.fillStyle = "rgba(255,255,255,.9)";
                    roundRect(ctx, rect.x + 5, rect.y + 5, labelWidth, 19, 6);
                    ctx.fill();
                    ctx.fillStyle = palette === "heat" ? "#7c3aed" : "#2563eb";
                    ctx.fillText(label, rect.x + 11, rect.y + 18);
                }
            });

            if (!thumb) {
                ctx.fillStyle = "#eff6ff";
                ctx.strokeStyle = "#93c5fd";
                ctx.lineWidth = 1.2;
                roundRect(ctx, 18, centerY - 24, 76, 48, 11);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "#1d4ed8";
                ctx.font = "950 13px sans-serif";
                ctx.fillText(`Octave ${octaveIndex}`, 29, centerY - 4);
                ctx.fillStyle = "#64748b";
                ctx.font = "850 10px sans-serif";
                const originalScale = octaveIndex === 0 ? "2× 原图" : octaveIndex === 1 ? "1× 原图" : `1/${2 ** (octaveIndex - 1)} 原图`;
                ctx.fillText(showInitialDouble ? originalScale : `1/${2 ** octaveIndex} 尺寸`, 29, centerY + 13);

                ctx.strokeStyle = "rgba(37,99,235,.55)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(rowX + 8, y - 13);
                ctx.lineTo(rowX + rowWidth - 8, y - 13);
                ctx.stroke();
                ctx.fillStyle = "#2563eb";
                ctx.beginPath();
                ctx.moveTo(rowX + rowWidth, y - 13);
                ctx.lineTo(rowX + rowWidth - 9, y - 18);
                ctx.lineTo(rowX + rowWidth - 9, y - 8);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "#475569";
                ctx.font = "850 10px sans-serif";
                ctx.fillText("σ 增大 / 平滑增强", rowX + 12, y - 18);
            } else {
                ctx.fillStyle = "#1d4ed8";
                ctx.font = "900 7px sans-serif";
                ctx.fillText(`O${octaveIndex}`, 1, centerY + 2);
            }
            ctx.restore();
            y += cellHeight + rowGap;
        });

        ctx.save();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = thumb ? 1 : 2.4;
        centers.forEach((center, index) => {
            if (index === 0) return;
            const previous = centers[index - 1];
            const bendX = thumb ? 10 + index * 2 : 98 + (index - 1) * 13;
            ctx.beginPath();
            ctx.moveTo(previous.x - (thumb ? 2 : 8), previous.y);
            ctx.lineTo(bendX, previous.y);
            ctx.lineTo(bendX, center.y);
            ctx.lineTo(center.x - (thumb ? 2 : 8), center.y);
            ctx.stroke();
            ctx.fillStyle = "#2563eb";
            ctx.beginPath();
            ctx.moveTo(center.x - (thumb ? 2 : 8), center.y);
            ctx.lineTo(center.x - (thumb ? 7 : 17), center.y - (thumb ? 3 : 6));
            ctx.lineTo(center.x - (thumb ? 7 : 17), center.y + (thumb ? 3 : 6));
            ctx.closePath();
            ctx.fill();
        });
        if (!thumb && centers.length > 1) {
            ctx.save();
            ctx.translate(12, height / 2 + 42);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#475569";
            ctx.font = "900 11px sans-serif";
            ctx.fillText("下采样 / 尺度增大", 0, 0);
            ctx.restore();
        }
        ctx.restore();
        if (!thumb && palette !== "heat") {
            drawPseudoPyramidMotion(ctx, rectRows, phase, seedPoint);
        } else if (!thumb && palette === "heat") {
            drawDogDifferenceMotion(ctx, rectRows, sourceRows, phase, buildSourceRectRows(sourceRows));
        }
    }

    function drawCandidateCross(ctx, x, y, size = 4, color = "#64748b", alpha = 1) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.2, size * 0.32);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - size, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.moveTo(x + size, y - size);
        ctx.lineTo(x - size, y + size);
        ctx.stroke();
        ctx.restore();
    }

    function drawCandidateCircle(ctx, x, y, radius = 4, color = "#64748b", alpha = 1, fill = false) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1.2, radius * 0.36);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (fill) ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    async function drawImageInRect(ctx, src, rect, background = "#f8fbff") {
        if (!src) return null;
        const img = await preloadImage(src);
        return drawLoadedImageInRect(ctx, img, rect, background);
    }

    function drawLoadedImageInRect(ctx, img, rect, background = "#f8fbff") {
        if (!img) return null;
        ctx.save();
        ctx.fillStyle = background;
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
        ctx.fill();
        ctx.clip();
        const fitted = coverRect(img.naturalWidth || img.width, img.naturalHeight || img.height, rect.w, rect.h);
        fitted.x += rect.x;
        fitted.y += rect.y;
        ctx.drawImage(img, fitted.x, fitted.y, fitted.w, fitted.h);
        ctx.restore();
        return { img, rect: fitted };
    }

    function mapPointToImageRect(point, imageRect, imageWidth, imageHeight) {
        return {
            x: imageRect.x + point.x * imageRect.w / Math.max(1, imageWidth),
            y: imageRect.y + point.y * imageRect.h / Math.max(1, imageHeight)
        };
    }

    const orientationStageNames = [
        "select-keypoint",
        "show-support-region",
        "show-gradients",
        "vote-histogram",
        "smooth-histogram",
        "pick-main-peak",
        "duplicate-secondary-peak",
        "write-back-orientation"
    ];

    function orientationStageInfo(phase = 0) {
        const p = ((Number(phase) || 0) % 1 + 1) % 1;
        const scaled = p * orientationStageNames.length;
        const index = Math.min(orientationStageNames.length - 1, Math.floor(scaled));
        const local = scaled - index;
        return {
            index,
            name: orientationStageNames[index],
            local,
            progress(name) {
                const target = orientationStageNames.indexOf(name);
                if (target < 0) return 0;
                if (index > target) return 1;
                if (index < target) return 0;
                return motionEase(local);
            }
        };
    }

    function drawOrientationArrow(ctx, x, y, angleDeg, length, color, alpha = 1, width = 2) {
        const angle = normalizeAngleDeg(angleDeg) * Math.PI / 180;
        const tipX = x + Math.cos(angle) * length;
        const tipY = y + Math.sin(angle) * length;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(angle - .55) * 8, tipY - Math.sin(angle - .55) * 8);
        ctx.lineTo(tipX - Math.cos(angle + .55) * 8, tipY - Math.sin(angle + .55) * 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawOrientationKeypointSymbol(ctx, x, y, point, alpha, options = {}) {
        const sigma = Math.max(4, Math.min(14, Number(point?.sigma) || 5));
        const color = options.color || "#2563eb";
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = color;
        ctx.fillStyle = options.fill ? color : "rgba(255,255,255,.72)";
        ctx.lineWidth = options.active ? 2.8 : 1.6;
        ctx.beginPath();
        ctx.arc(x, y, sigma, 0, Math.PI * 2);
        if (options.fill) ctx.fill();
        ctx.stroke();
        if (options.arrow) {
            drawOrientationArrow(ctx, x, y, pointOrientationDeg(point), sigma + 12, color, .95, options.active ? 2.6 : 1.6);
        }
        ctx.restore();
    }

    function patchVectorPosition(rect, vector) {
        const radius = Math.min(rect.w, rect.h) * .34;
        return {
            x: rect.x + rect.w / 2 + (Number(vector.dx) || 0) / 8.0 * radius,
            y: rect.y + rect.h / 2 + (Number(vector.dy) || 0) / 8.0 * radius
        };
    }

    function histogramBarGeometry(rect, bin, value, maximum) {
        const gap = 1.8;
        const plot = { x: rect.x + 18, y: rect.y + 34, w: rect.w - 36, h: rect.h - 58 };
        const barW = plot.w / 36;
        const ratio = Math.max(0, Number(value) || 0) / Math.max(1e-6, maximum);
        const h = Math.max(3, plot.h * ratio);
        return {
            x: plot.x + bin * barW + gap / 2,
            y: plot.y + plot.h - h,
            w: Math.max(2, barW - gap),
            h,
            cx: plot.x + (bin + .5) * barW,
            top: plot.y + plot.h - h
        };
    }

    function drawOrientationPatchPanel(ctx, rect, payload, stage, phase) {
        const supportProgress = stage.progress("show-support-region");
        const gradientProgress = stage.progress("show-gradients");
        const peakProgress = stage.progress("pick-main-peak");
        const duplicateProgress = payload.peaks.hasSecondary ? stage.progress("duplicate-secondary-peak") : 0;
        const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 + 6 };
        const radius = Math.min(rect.w, rect.h) * .34;
        drawMotionPanel(ctx, rect.x, rect.y, rect.w, rect.h, "#2563eb");
        ctx.save();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("局部 patch / Gaussian 权重", rect.x + 16, rect.y + 22);
        const glow = ctx.createRadialGradient(center.x, center.y, 8, center.x, center.y, radius * 1.25);
        glow.addColorStop(0, `rgba(249,115,22,${.2 + .28 * supportProgress})`);
        glow.addColorStop(.45, `rgba(37,99,235,${.12 + .18 * supportProgress})`);
        glow.addColorStop(1, "rgba(37,99,235,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * 1.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(37,99,235,${.18 + .62 * supportProgress})`;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(center.x, center.y, 5.5 + 2 * Math.sin(phase * Math.PI * 2) ** 2, 0, Math.PI * 2);
        ctx.fill();
        
        const maxMag = Math.max(1e-6, ...payload.vectors.map(vector => (Number(vector.mag) || 0) * (Number(vector.weight) || 1)));
        const visibleCount = Math.floor(payload.vectors.length * gradientProgress);
        
        payload.vectors.slice(0, visibleCount).forEach((vector, index) => {
            const dx = Number(vector.dx) || 0;
            const dy = Number(vector.dy) || 0;
            
            // Geometrically cull the corners of the 16x16 square to form a perfect circular patch!
            // This prevents the grid from sticking out of the Gaussian circle boundary.
            if (Math.hypot(dx, dy) > 8.2) return;
            
            const pos = patchVectorPosition(rect, vector);
            const magnitude = (Number(vector.mag) || 0) * (Number(vector.weight) || 1);
            
            // Limit maximum arrow length to 14 so edge arrows don't violently poke out
            const length = Math.max(1.5, Math.min(14, 18 * (magnitude / maxMag)));
            const alpha = .15 + .85 * (magnitude / maxMag);
            const active = index === Math.floor(phase * payload.vectors.length) % Math.max(1, payload.vectors.length);
            drawOrientationArrow(ctx, pos.x, pos.y, vector.angle, length, active ? "#f97316" : "#2563eb", alpha, active ? 2.2 : 1.3);
        });
        
        if (peakProgress > 0) {
            drawOrientationArrow(ctx, center.x, center.y, payload.peaks.mainAngle, radius * (.55 + .40 * peakProgress), "#f97316", peakProgress, 4.5);
        }
        if (duplicateProgress > 0) {
            drawOrientationArrow(ctx, center.x, center.y, payload.peaks.secondaryAngle, radius * (.5 + .35 * duplicateProgress), "#7c3aed", duplicateProgress, 3.2);
        }
        ctx.restore();
    }

    function drawOrientationHistogramPanel(ctx, rect, payload, stage) {
        const voteProgress = stage.progress("vote-histogram");
        const smoothProgress = stage.progress("smooth-histogram");
        const peakProgress = stage.progress("pick-main-peak");
        const raw = payload.rawHistogram;
        const smooth = payload.smoothHistogram;
        const maximum = Math.max(1e-6, ...raw, ...smooth);
        drawMotionPanel(ctx, rect.x, rect.y, rect.w, rect.h, "#7c3aed");
        ctx.save();
        ctx.fillStyle = "#5b21b6";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("36-bin 方向直方图", rect.x + 16, rect.y + 23);
        for (let bin = 0; bin < 36; bin++) {
            const binGate = Math.min(1, Math.max(0, voteProgress * 40 - bin));
            const value = (raw[bin] || 0) * binGate;
            const display = value * (1 - smoothProgress) + (smooth[bin] || 0) * Math.max(binGate, smoothProgress) * smoothProgress;
            const geo = histogramBarGeometry(rect, bin, display, maximum);
            const isMain = bin === payload.peaks.mainBin;
            const isSecondary = payload.peaks.hasSecondary && bin === payload.peaks.secondaryBin;
            ctx.fillStyle = isMain && peakProgress > 0 ? "#f97316" : isSecondary ? "#7c3aed" : "#60a5fa";
            ctx.globalAlpha = isMain ? .55 + .45 * peakProgress : .38 + .42 * binGate;
            roundRect(ctx, geo.x, geo.y, geo.w, geo.h, 4);
            ctx.fill();
            if (isMain && peakProgress > 0) {
                ctx.strokeStyle = "#fb923c";
                ctx.lineWidth = 2;
                ctx.strokeRect(geo.x - 1.5, geo.y - 2, geo.w + 3, geo.h + 3);
            }
        }
        ctx.globalAlpha = 1;
        const baseline = rect.y + rect.h - 24;
        ctx.strokeStyle = "rgba(100,116,139,.35)";
        ctx.beginPath();
        ctx.moveTo(rect.x + 18, baseline);
        ctx.lineTo(rect.x + rect.w - 18, baseline);
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.font = "850 10px sans-serif";
        ctx.fillText("0°", rect.x + 18, rect.y + rect.h - 9);
        ctx.fillText("180°", rect.x + rect.w / 2 - 14, rect.y + rect.h - 9);
        ctx.fillText("360°", rect.x + rect.w - 48, rect.y + rect.h - 9);
        ctx.restore();
    }

    function drawOrientationVoteParticles(ctx, patchRect, histRect, payload, stage, phase) {
        const voteProgress = stage.progress("vote-histogram");
        if (voteProgress <= 0) return;
        const maximum = Math.max(1e-6, ...payload.rawHistogram, ...payload.smoothHistogram);
        const samples = evenlySamplePoints(payload.vectors, 18);
        ctx.save();
        samples.forEach((vector, index) => {
            const start = patchVectorPosition(patchRect, vector);
            const bin = Math.round(normalizeAngleDeg(vector.angle) / 10) % 36;
            const geo = histogramBarGeometry(histRect, bin, payload.rawHistogram[bin] || 0, maximum);
            const local = Math.max(0, Math.min(1, voteProgress * 1.35 - index / samples.length * .55));
            if (local <= 0) return;
            const t = motionEase(local);
            const endX = geo.cx;
            const endY = geo.top - 8;
            const c1x = start.x + (endX - start.x) * .35;
            const c1y = start.y - 52;
            const c2x = start.x + (endX - start.x) * .72;
            const c2y = endY - 34;
            ctx.strokeStyle = "rgba(37,99,235,.18)";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
            ctx.stroke();
            const ax = start.x * (1 - t) + endX * t;
            const ay = start.y * (1 - t) + endY * t - Math.sin(t * Math.PI) * 42;
            ctx.fillStyle = index % 3 ? "#2563eb" : "#f97316";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(ax, ay, 3.2 + 2.2 * Math.sin(t * Math.PI), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        ctx.restore();
    }

    function drawOrientationResultStrip(ctx, rect, payload, stage) {
        const duplicateProgress = payload.peaks.hasSecondary ? stage.progress("duplicate-secondary-peak") : 0;
        const writeProgress = stage.progress("write-back-orientation");
        drawMotionPanel(ctx, rect.x, rect.y, rect.w, rect.h, "#0ea5e9");
        ctx.save();
        const chips = [
            ["主峰", `${compactNumber(payload.peaks.mainAngle)}°`, "#f97316", stage.progress("pick-main-peak")],
            ["平滑", "circular", "#2563eb", stage.progress("smooth-histogram")],
            ["辅方向", payload.peaks.hasSecondary ? `${compactNumber(payload.peaks.secondaryAngle)}°` : "未触发", "#7c3aed", duplicateProgress || .25],
            ["回写", `${payload.peaks.outputCount} 个方向`, "#16a34a", writeProgress]
        ];
        chips.forEach(([label, value, color, progress], index) => {
            const x = rect.x + 18 + index * ((rect.w - 36) / chips.length);
            const w = (rect.w - 54) / chips.length;
            ctx.fillStyle = "rgba(255,255,255,.82)";
            ctx.strokeStyle = `${color}${progress > 0 ? "aa" : "33"}`;
            ctx.lineWidth = progress > 0 ? 1.8 : 1;
            roundRect(ctx, x, rect.y + 12, w, rect.h - 24, 12);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = "950 14px sans-serif";
            ctx.fillText(label, x + 13, rect.y + 35);
            ctx.fillStyle = "#334155";
            ctx.font = "850 12px sans-serif";
            ctx.fillText(value, x + 13, rect.y + 53);
        });
        ctx.restore();
    }

    async function drawOrientationAssignmentMain(canvas, width, height, thumb, options = {}) {
        if (thumb) {
            const payload = orientationDemoPayload();
            await drawSiftKeypointsContained(canvas, payload.keypoints, width, height, 90);
            return;
        }
        const phase = options.animationPhase || 0;
        const stage = orientationStageInfo(phase);
        const payload = orientationDemoPayload();
        ensureCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        const src = scaleData.images.original;
        let image = cachedImage(src);
        if (!image) {
            preloadImage(src).then(() => {
                if (selectedAlgorithm() === "sift" && currentStep === 5) {
                    drawSiftStepCanvas(canvas, currentStep, { animationPhase: siftMotion.progress });
                }
            });
            ctx.fillStyle = "#eef6ff";
            roundRect(ctx, 28, 36, 860, 430, 16);
            ctx.fill();
            ctx.fillStyle = "#64748b";
            ctx.font = "900 15px sans-serif";
            ctx.fillText("正在准备主方向分配动画...", 54, 74);
            return;
        }
        const imagePanel = { x: 22, y: 24, w: 530, h: 410 };
        const patchPanel = { x: 578, y: 16, w: 318, h: 222 };
        const histPanel = { x: 578, y: 252, w: 318, h: 176 };
        const resultStrip = { x: 22, y: 438, w: 874, h: 68 };
        const imageResult = drawLoadedImageInRect(ctx, image, imagePanel, "#f1f5f9");
        const imageRect = imageResult?.rect || imagePanel;
        const imageWidth = scaleData.meta?.width || image.naturalWidth || image.width;
        const imageHeight = scaleData.meta?.height || image.naturalHeight || image.height;
        const allPoints = payload.keypoints.length ? payload.keypoints : [payload.point];
        const sampledPoints = evenlySamplePoints(allPoints, 420);
        orientationLayout = { points: [], imageRect, imageWidth, imageHeight };
        ctx.save();
        ctx.fillStyle = "rgba(248,251,255,.36)";
        ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
        sampledPoints.forEach(point => {
            const mapped = mapPointToImageRect(point, imageRect, imageWidth, imageHeight);
            const sourceIndex = allPoints.indexOf(point);
            orientationLayout.points.push({ index: sourceIndex >= 0 ? sourceIndex : 0, x: mapped.x, y: mapped.y });
            drawOrientationKeypointSymbol(ctx, mapped.x, mapped.y, point, .20, { color: "#2563eb", arrow: stage.index >= 7 });
        });
        const selectedMapped = mapPointToImageRect(payload.point, imageRect, imageWidth, imageHeight);
        const selectPulse = .55 + .45 * Math.sin(phase * Math.PI * 2) ** 2;
        drawOrientationKeypointSymbol(ctx, selectedMapped.x, selectedMapped.y, payload.point, .98, { color: "#f97316", active: true, arrow: stage.progress("write-back-orientation") > 0 });
        drawCandidateCircle(ctx, selectedMapped.x, selectedMapped.y, 14 + 10 * selectPulse * (1 - stage.progress("write-back-orientation") * .35), "#f97316", .45);
        if (payload.peaks.hasSecondary && stage.progress("duplicate-secondary-peak") > 0) {
            drawOrientationArrow(ctx, selectedMapped.x, selectedMapped.y, payload.peaks.secondaryAngle, 25, "#7c3aed", stage.progress("duplicate-secondary-peak"), 2.6);
        }
        ctx.strokeStyle = "rgba(37,99,235,.38)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(selectedMapped.x, selectedMapped.y);
        ctx.bezierCurveTo(474, 58, 520, 92, patchPanel.x + 22, patchPanel.y + 76);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        drawOrientationPatchPanel(ctx, patchPanel, payload, stage, phase);
        drawOrientationHistogramPanel(ctx, histPanel, payload, stage);
        drawOrientationVoteParticles(ctx, patchPanel, histPanel, payload, stage, phase);
        drawOrientationResultStrip(ctx, resultStrip, payload, stage);
    }

    function drawDoGVolume(ctx, x, y, options = {}) {
        const size = options.size || 64;
        const gapX = options.gapX || 74;
        const gapY = options.gapY || 38;
        const phase = options.phase || 0;
        const activeNeighbor = Math.floor(phase * 26) % 26;
        let neighborIndex = 0;
        let centerMarker = null;
        let activeMarker = null;
        const dog = scaleData?.pyramid?.probe;
        const layers = [
            { matrix: dog?.prev, label: "σ-", caption: "上一尺度", color: "#64748b" },
            { matrix: dog?.current, label: "σ", caption: "当前尺度", color: "#2563eb" },
            { matrix: dog?.next, label: "σ+", caption: "下一尺度", color: "#64748b" }
        ];
        layers.forEach((layer, layerIndex) => {
            const lx = x + layerIndex * gapX;
            const ly = y - layerIndex * gapY;
            const values = dogMatrixValues(layer.matrix);
            const flat = values.flat().map(value => Number(value) || 0);
            const maxAbs = Math.max(1e-6, ...flat.map(value => Math.abs(value)));
            ctx.save();
            ctx.fillStyle = "rgba(255,255,255,.82)";
            ctx.strokeStyle = `${layer.color}8a`;
            ctx.lineWidth = layerIndex === 1 ? 2 : 1.3;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + size, ly - 20);
            ctx.lineTo(lx + size + size * .82, ly + size * .38);
            ctx.lineTo(lx + size * .82, ly + size * .38 + 20);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            values.forEach((row, rowIndex) => {
                row.forEach((value, colIndex) => {
                    const baseX = lx + colIndex * size / 3 + rowIndex * size * .27;
                    const baseY = ly + rowIndex * size * .14 - colIndex * 6;
                    const cellW = size / 3;
                    const cellH = size / 6;
                    const v = Number(value) || 0;
                    const strength = Math.min(1, Math.abs(v) / maxAbs);
                    const isCenter = layerIndex === 1 && rowIndex === 1 && colIndex === 1;
                    ctx.fillStyle = v >= 0
                        ? `rgba(37,99,235,${.12 + strength * .42})`
                        : `rgba(249,115,22,${.10 + strength * .38})`;
                    ctx.strokeStyle = isCenter ? "#f97316" : "rgba(147,197,253,.72)";
                    ctx.lineWidth = isCenter ? 2.4 : 1;
                    ctx.beginPath();
                    ctx.moveTo(baseX, baseY);
                    ctx.lineTo(baseX + cellW, baseY - 6);
                    ctx.lineTo(baseX + cellW + size * .27, baseY + cellH);
                    ctx.lineTo(baseX + size * .27, baseY + cellH + 6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    const markerX = baseX + cellW * .62;
                    const markerY = baseY + cellH * .54;
                    if (isCenter) {
                        centerMarker = { x: markerX, y: markerY };
                        const pulse = .5 + .5 * Math.sin(phase * Math.PI * 2);
                        drawCandidateCircle(ctx, markerX, markerY, (options.thumb ? 5 : 8.5) + pulse * 2.2, "#f97316", 1);
                        drawCandidateCircle(ctx, markerX, markerY, options.thumb ? 2.4 : 3.4, "#f97316", .88, true);
                    } else if (!options.thumb) {
                        const isActive = neighborIndex === activeNeighbor;
                        if (isActive) activeMarker = { x: markerX, y: markerY };
                        drawCandidateCircle(
                            ctx,
                            markerX,
                            markerY,
                            isActive ? 5.8 : 3.9,
                            isActive ? "#2563eb" : "#64748b",
                            isActive ? .95 : .42,
                            false
                        );
                        if (isActive) {
                            drawCandidateCircle(ctx, markerX, markerY, 2.1, "#2563eb", .72, true);
                        }
                        neighborIndex += 1;
                    } else {
                        neighborIndex += 1;
                    }
                });
            });
            ctx.fillStyle = layer.color;
            ctx.font = options.thumb ? "900 10px sans-serif" : "950 14px sans-serif";
            ctx.fillText(layer.label, lx + size * .18, ly - 16);
            if (!options.thumb) {
                ctx.fillStyle = "#475569";
                ctx.font = "850 11px sans-serif";
                ctx.fillText(layer.caption, lx + size * .18 + 28, ly - 16);
            }
            ctx.restore();
        });
        if (!options.thumb && centerMarker && activeMarker) {
            ctx.save();
            const beam = ctx.createLinearGradient(activeMarker.x, activeMarker.y, centerMarker.x, centerMarker.y);
            beam.addColorStop(0, "rgba(37,99,235,.18)");
            beam.addColorStop(.55, "rgba(37,99,235,.9)");
            beam.addColorStop(1, "rgba(249,115,22,.82)");
            ctx.strokeStyle = beam;
            ctx.lineWidth = 3.2;
            ctx.lineCap = "round";
            ctx.shadowColor = "rgba(37,99,235,.45)";
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(activeMarker.x, activeMarker.y);
            ctx.lineTo(centerMarker.x, centerMarker.y);
            ctx.stroke();
            const t = motionEase((phase * 26) % 1);
            const px = activeMarker.x + (centerMarker.x - activeMarker.x) * t;
            const py = activeMarker.y + (centerMarker.y - activeMarker.y) * t;
            drawCandidateCircle(ctx, px, py, 4.4, "#2563eb", .92, true);
            ctx.restore();
        }
        return { center: centerMarker, active: activeMarker, activeNeighbor };
    }

    function dogTransitionLayers() {
        const rows = scaleData?.pyramid?.dog || [];
        const probe = scaleData?.pyramid?.probe || {};
        const octave = Math.max(0, Math.min(rows.length - 1, Number(probe.octave) || 0));
        const row = rows[octave] || rows[0] || [];
        const currentLayer = Number.isFinite(Number(probe.layer)) ? Number(probe.layer) : 1;
        const indices = [currentLayer - 1, currentLayer, currentLayer + 1]
            .map(index => Math.max(0, Math.min(row.length - 1, index)));
        return indices.map((index, order) => ({
            cell: row[index],
            label: ["σ-", "σ", "σ+"][order],
            caption: ["上一尺度", "当前尺度", "下一尺度"][order]
        })).filter(item => item.cell?.array);
    }

    function drawImageCard(ctx, packed, cx, cy, w, h, angle, alpha, label, color) {
        const temp = cloneToCanvas(packed, "heat");
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(1, 0.74);
        ctx.shadowColor = "rgba(37,99,235,.16)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = "rgba(255,255,255,.92)";
        roundRect(ctx, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 14);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.save();
        roundRect(ctx, -w / 2, -h / 2, w, h, 10);
        ctx.clip();
        ctx.drawImage(temp, -w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.strokeStyle = `${color}aa`;
        ctx.lineWidth = 2;
        roundRect(ctx, -w / 2, -h / 2, w, h, 10);
        ctx.stroke();
        ctx.scale(1, 1 / 0.74);
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(label, -w / 2 + 10, -h / 2 - 12);
        ctx.restore();
    }

    function drawDogPyramidToExtremaTransition(ctx, phase, alpha = 1) {
        const t = motionEase(clamp01(phase));
        const layers = dogTransitionLayers();
        const start = [
            { x: 92, y: 286, angle: -0.02 },
            { x: 216, y: 286, angle: 0.01 },
            { x: 340, y: 286, angle: 0.02 }
        ];
        const size = 116;
        const deck = { x: 74, y: 352, gapX: 28, gapY: 48 };
        const targets = [0, 1, 2].map(index => {
            const lx = deck.x + index * deck.gapX;
            const ly = deck.y - index * deck.gapY;
            return {
                x: lx + size * .91,
                y: ly + size * .19,
                angle: -0.18
            };
        });

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.fillStyle = "rgba(219,234,254,.76)";
        roundRect(ctx, 48, 76, 402, 62, 18);
        ctx.fill();
        ctx.strokeStyle = "rgba(147,197,253,.72)";
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 17px sans-serif";
        ctx.fillText("从 DoG Pyramid 抽取相邻三层", 68, 106);
        ctx.fillStyle = "#475569";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("三张差分层做 3D 旋转，落成 3×3×3 极值定位的尺度邻域。", 68, 128);
        ctx.restore();

        layers.forEach((layer, index) => {
            const from = start[index] || start[1];
            const to = targets[index] || targets[1];
            const cx = from.x + (to.x - from.x) * t;
            const cy = from.y + (to.y - from.y) * t;
            const angle = from.angle + (to.angle - from.angle) * t;
            const w = 106 + 18 * t;
            const h = 82 + 14 * t;
            const color = index === 1 ? "#2563eb" : "#64748b";
            drawImageCard(ctx, layer.cell.array, cx, cy, w, h, angle, alpha * (.62 + .34 * t), `${layer.label} ${layer.caption}`, color);
        });

        ctx.save();
        ctx.strokeStyle = "rgba(37,99,235,.28)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 8]);
        ctx.beginPath();
        ctx.moveTo(404, 284);
        ctx.bezierCurveTo(480, 222, 566, 170, 646, 128);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 15px sans-serif";
        ctx.fillText(t < .62 ? "抽取 L(s-1), L(s), L(s+1)" : "旋转成尺度邻域层板", 520, 120);
        ctx.fillStyle = "#475569";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("下一步：中心点与三层 26 个邻居逐一比较。", 520, 144);
        ctx.restore();
        ctx.restore();
    }

    function clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    async function drawDogExtremaMain(canvas, width, height, thumb, sift, options = {}) {
        const phase = options.animationPhase || 0;
        V.setCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        if (thumb) {
            drawDoGVolume(ctx, 30, 92, { size: 42, gapX: 34, gapY: 18, thumb: true });
            ctx.fillStyle = "#1d4ed8";
            ctx.font = "950 12px sans-serif";
            ctx.fillText("26 邻域", 18, 24);
            return;
        }

        const transitionEnd = 0.42;
        const overlapStart = 0.18;
        const blend = motionEase(clamp01((phase - overlapStart) / (transitionEnd - overlapStart)));
        if (phase < overlapStart) {
            drawDogPyramidToExtremaTransition(ctx, phase / transitionEnd, 1);
            return;
        }

        if (phase < transitionEnd) {
            drawDogPyramidToExtremaTransition(ctx, phase / transitionEnd, 1 - blend);
        }

        const finalAlpha = phase < transitionEnd ? blend : 1;
        const localPhase = phase < transitionEnd ? 0 : clamp01((phase - transitionEnd) / (1 - transitionEnd));
        ctx.save();
        ctx.globalAlpha = finalAlpha;
        const volume = drawDoGVolume(ctx, 70, 334, { size: 122, gapX: 28, gapY: 50, phase: localPhase });
        ctx.save();
        ctx.fillStyle = "rgba(219,234,254,.78)";
        roundRect(ctx, 44, 48, 370, 58, 16);
        ctx.fill();
        ctx.strokeStyle = "rgba(147,197,253,.75)";
        ctx.stroke();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("三层 DoG 层叠：上一尺度 / 当前尺度 / 下一尺度", 62, 78);
        ctx.fillStyle = "#475569";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("先找 26 邻域极值，再用二次拟合修正到真实极值位置。", 62, 100);
        ctx.restore();

        const compareCount = Math.min(26, Math.floor(localPhase * 27) + 1);
        const panel = { x: 466, y: 34, w: 394, h: 106 };
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.strokeStyle = "rgba(147,197,253,.72)";
        ctx.lineWidth = 1.4;
        roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 18px sans-serif";
        ctx.fillText("逐邻域比较", panel.x + 22, panel.y + 30);
        ctx.fillStyle = "#475569";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("中心响应大于全部邻居，或小于全部邻居。", panel.x + 22, panel.y + 50);
        ctx.fillStyle = "#e0f2fe";
        roundRect(ctx, panel.x + 22, panel.y + 60, panel.w - 44, 10, 5);
        ctx.fill();
        const ratio = compareCount / 26;
        const grad = ctx.createLinearGradient(panel.x + 22, 0, panel.x + panel.w - 22, 0);
        grad.addColorStop(0, "#2563eb");
        grad.addColorStop(1, "#f97316");
        ctx.fillStyle = grad;
        roundRect(ctx, panel.x + 22, panel.y + 60, (panel.w - 44) * ratio, 10, 5);
        ctx.fill();
        ctx.fillStyle = "#0f172a";
        ctx.font = "950 22px sans-serif";
        ctx.fillText(`${compareCount}`, panel.x + 22, panel.y + 94);
        ctx.fillStyle = "#64748b";
        ctx.font = "950 12px sans-serif";
        ctx.fillText("/ 26 neighbors", panel.x + 56, panel.y + 93);
        const passAlpha = Math.max(0, Math.min(1, (localPhase - .78) / .08));
        ctx.globalAlpha = .35 + passAlpha * .65;
        ctx.fillStyle = passAlpha > .2 ? "#16a34a" : "#94a3b8";
        roundRect(ctx, panel.x + 244, panel.y + 78, 104, 24, 12);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "950 12px sans-serif";
        ctx.fillText(passAlpha > .2 ? "进入精确定位" : "比较中", panel.x + 260, panel.y + 94);
        ctx.restore();

        const refineT = motionEase(clamp01((localPhase - .52) / .34));
        const refinePanel = { x: 466, y: 148, w: 394, h: 56 };
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = "rgba(187,247,208,.9)";
        ctx.lineWidth = 1.2;
        roundRect(ctx, refinePanel.x, refinePanel.y, refinePanel.w, refinePanel.h, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#15803d";
        ctx.font = "950 14px sans-serif";
        ctx.fillText("精确定位：Xi + ΔX", refinePanel.x + 18, refinePanel.y + 23);
        ctx.fillStyle = "#475569";
        ctx.font = "850 11px sans-serif";
        ctx.fillText("二次拟合估计真实极值偏移", refinePanel.x + 18, refinePanel.y + 42);
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 28; i++) {
            const x = refinePanel.x + 184 + i * 64 / 28;
            const d = (i - 19) / 15;
            const y = refinePanel.y + 42 - 22 + d * d * 20;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        const xi = refinePanel.x + 206;
        const xr = refinePanel.x + 236;
        const xc = xi + (xr - xi) * refineT;
        drawCandidateCircle(ctx, xi, refinePanel.y + 41, 4.2, "#f97316", 1, true);
        drawCandidateCircle(ctx, xc, refinePanel.y + 34 - 10 * refineT, 4.8, "#16a34a", 1, true);
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "950 11px sans-serif";
        ctx.fillText("ΔX=-H⁻¹g", refinePanel.x + 268, refinePanel.y + 24);
        ctx.fillText(`(${(0.32 * refineT).toFixed(2)}, ${(-0.27 * refineT).toFixed(2)}, ${(0.18 * refineT).toFixed(2)})`, refinePanel.x + 268, refinePanel.y + 43);
        ctx.restore();

        if (volume.center) {
            ctx.save();
            ctx.strokeStyle = "rgba(37,99,235,.22)";
            ctx.lineWidth = 2.4;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(volume.center.x + 22, volume.center.y - 10);
            ctx.bezierCurveTo(392, 216, 436, 150, panel.x, panel.y + 82);
            ctx.stroke();
            ctx.restore();
        }

        const preview = { x: 466, y: 212, w: 394, h: 272 };
        const result = await drawImageInRect(ctx, scaleData.images.original, preview, "#f1f5f9");
        if (result) {
            ctx.save();
            ctx.fillStyle = "rgba(248,251,255,.50)";
            ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
            evenlySamplePoints(sift.points_extrema, 120).forEach(point => {
                const mapped = mapPointToImageRect(point, result.rect, scaleData.meta?.width || result.img.width, scaleData.meta?.height || result.img.height);
                drawCandidateCircle(ctx, mapped.x, mapped.y, 3.2, "#64748b", .46);
            });
            const pulsePoints = evenlySamplePoints(sift.points_extrema, 12);
            const active = pulsePoints.length ? pulsePoints[Math.floor(localPhase * pulsePoints.length) % pulsePoints.length] : null;
            if (active) {
                const mapped = mapPointToImageRect(active, result.rect, scaleData.meta?.width || result.img.width, scaleData.meta?.height || result.img.height);
                const refined = { x: mapped.x + 18 * refineT, y: mapped.y - 13 * refineT };
                drawCandidateCircle(ctx, mapped.x, mapped.y, 7.2, "#f97316", .92);
                ctx.strokeStyle = "#16a34a";
                ctx.lineWidth = 2.2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(mapped.x, mapped.y);
                ctx.lineTo(refined.x, refined.y);
                ctx.stroke();
                ctx.setLineDash([]);
                drawCandidateCircle(ctx, refined.x, refined.y, 6.4 + 1.8 * refineT, "#16a34a", .95, true);
            }

            ctx.restore();
        }
        ctx.fillStyle = "#334155";
        ctx.font = "950 12px sans-serif";
        ctx.fillText(`粗定位候选：${sift.counts?.raw_extrema || 0} · 精确定位：Xi + ΔX`, 466, 504);
        ctx.fillStyle = "#15803d";
        ctx.fillText(`ΔX=-H⁻¹g · (${(0.32 * refineT).toFixed(2)}, ${(-0.27 * refineT).toFixed(2)}, ${(0.18 * refineT).toFixed(2)})`, 686, 504);
        ctx.restore();
    }

    async function drawSiftFilterComparison(canvas, width, height, thumb, sift, options = {}) {
        const phase = options.animationPhase || 0;
        const state = edgeSuppressionState(phase);
        ensureCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        const raw = sift.points_extrema || [];
        const filtered = sift.points_edge || [];
        const kept = sift.points_keypoints || sift.keypoints || [];
        const left = thumb
            ? { x: 10, y: 20, w: 94, h: 92 }
            : { x: 44, y: 44, w: 400, h: 382 };
        const right = thumb
            ? { x: 116, y: 20, w: 94, h: 92 }
            : { x: 486, y: 44, w: 400, h: 382 };
        const src = scaleData.images.original;
        let image = cachedImage(src);
        if (!image) {
            preloadImage(src).then(() => {
                if (selectedAlgorithm() === "sift" && currentStep === 4) {
                    drawSiftStepCanvas(canvas, currentStep, { animationPhase: siftMotion.progress });
                }
            });
            ctx.fillStyle = "#eef6ff";
            roundRect(ctx, left.x, left.y, left.w, left.h, 14);
            ctx.fill();
            roundRect(ctx, right.x, right.y, right.w, right.h, 14);
            ctx.fill();
            ctx.fillStyle = "#64748b";
            ctx.font = "900 13px sans-serif";
            ctx.fillText("正在准备图像...", left.x + 18, left.y + 34);
            return;
        }
        const leftImage = drawLoadedImageInRect(ctx, image, left, "#f1f5f9");
        const rightImage = drawLoadedImageInRect(ctx, image, right, "#f1f5f9");

        // Draw the right image (filtering result) normally with faint raw points as context
        if (rightImage) {
            ctx.save();
            ctx.fillStyle = `rgba(248,251,255,${thumb ? .42 : .56})`;
            ctx.fillRect(rightImage.rect.x, rightImage.rect.y, rightImage.rect.w, rightImage.rect.h);
            evenlySamplePoints(raw, thumb ? 70 : 340).forEach(point => {
                const mapped = mapPointToImageRect(point, rightImage.rect, scaleData.meta?.width || rightImage.img.width, scaleData.meta?.height || rightImage.img.height);
                drawCandidateCross(ctx, mapped.x, mapped.y, thumb ? 2.3 : 3.6, "#64748b", thumb ? .18 : .20);
            });
            ctx.restore();
        }

        // Draw the left image as an Edge Response Heatmap!
        // We use the raw extrema points (which naturally cluster on edges) to form the map.
        if (leftImage) {
            ctx.save();
            // Darken the background slightly to make the glowing edges pop without hiding the image
            ctx.fillStyle = `rgba(15, 23, 42, ${thumb ? .55 : .45})`; 
            ctx.fillRect(leftImage.rect.x, leftImage.rect.y, leftImage.rect.w, leftImage.rect.h);
            
            ctx.globalCompositeOperation = "screen";
            // Make dots brighter and clearer in both views
            ctx.fillStyle = thumb ? "rgba(56, 189, 248, 0.45)" : "rgba(56, 189, 248, 0.35)";
            
            // Plot all points to form the edge response lines
            const edgePoints = raw.length > 8000 ? evenlySamplePoints(raw, 8000) : raw;
            const r = thumb ? 1 : 1.5;
            
            ctx.beginPath();
            edgePoints.forEach(point => {
                const mapped = mapPointToImageRect(point, leftImage.rect, scaleData.meta?.width || leftImage.img.width, scaleData.meta?.height || leftImage.img.height);
                ctx.fillRect(mapped.x - r, mapped.y - r, r * 2, r * 2);
            });
            ctx.restore();
        }

        const nearPoint = (point, list, tolerance = 1.5) => (list || []).some(item =>
            Math.hypot((Number(item.x) || 0) - (Number(point.x) || 0), (Number(item.y) || 0) - (Number(point.y) || 0)) <= tolerance
        );
        const rejected = raw.filter(point => !nearPoint(point, kept, 2.5));
        const keptSequence = evenlySamplePoints(kept.length ? kept : filtered.length ? filtered : raw, 12);
        const rejectedSequence = evenlySamplePoints(rejected.length ? rejected : raw, 12);
        const activeSequence = state.edgeLike ? rejectedSequence : keptSequence;
        const candidate = activeSequence.length ? activeSequence[Math.floor(phase * activeSequence.length) % activeSequence.length] : null;
        const localPhase = activeSequence.length ? (phase * activeSequence.length) % 1 : 0;

        if (rightImage) {
            filtered.slice(0, thumb ? 80 : 360).forEach(point => {
                const mapped = mapPointToImageRect(point, rightImage.rect, scaleData.meta?.width || rightImage.img.width, scaleData.meta?.height || rightImage.img.height);
                V.drawCircle(ctx, mapped.x, mapped.y, "#f97316", thumb ? 2.2 : 3.5);
            });
            kept.slice(0, thumb ? 60 : 240).forEach(point => {
                const mapped = mapPointToImageRect(point, rightImage.rect, scaleData.meta?.width || rightImage.img.width, scaleData.meta?.height || rightImage.img.height);
                V.drawCircle(ctx, mapped.x, mapped.y, "#ea580c", thumb ? 3 : 5.2);
            });
        }

        if (candidate && leftImage) {
            const mapped = mapPointToImageRect(candidate, leftImage.rect, scaleData.meta?.width || leftImage.img.width, scaleData.meta?.height || leftImage.img.height);
            
            if (!thumb) {
                ctx.save();
                ctx.strokeStyle = `rgba(59,130,246,${1 - localPhase})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(mapped.x, mapped.y, 8 + 24 * localPhase, 0, Math.PI * 2);
                ctx.stroke();
                
                const maxLen = 46;
                // Exaggerate the length difference for edge points to create a dramatic "long strip"
                const len1 = state.edgeLike ? 8 : (maxLen * 0.85); // Along edge (small for edge, large for corner)
                const len2 = state.edgeLike ? maxLen : (maxLen * 0.95); // Perpendicular to edge (large)
                
                ctx.translate(mapped.x, mapped.y);
                const angle = (mapped.x * 3 + mapped.y * 7) * 0.01; 
                ctx.rotate(angle);
                
                // Draw the response ellipse (long strip for edges, fat circle for corners)
                ctx.fillStyle = state.edgeLike ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.25)";
                ctx.beginPath();
                ctx.ellipse(0, 0, len1/2, len2/2, 0, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw responsive outward arrows for principal directions
                const drawOutwardArrow = (dx, dy, color) => {
                    const length = Math.hypot(dx, dy);
                    ctx.strokeStyle = color;
                    ctx.fillStyle = color;
                    ctx.lineWidth = 2.2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(dx, dy);
                    ctx.stroke();
                    
                    const a = Math.atan2(dy, dx);
                    const headSize = Math.min(6, length * 0.75); // Scale down head for tiny arrows
                    ctx.beginPath();
                    ctx.moveTo(dx, dy);
                    ctx.lineTo(dx - headSize * Math.cos(a - 0.5), dy - headSize * Math.sin(a - 0.5));
                    ctx.lineTo(dx - headSize * Math.cos(a + 0.5), dy - headSize * Math.sin(a + 0.5));
                    ctx.fill();
                };
                
                // Perpendicular direction (gradient/large response)
                drawOutwardArrow(0, len2/2, "#3b82f6");
                drawOutwardArrow(0, -len2/2, "#3b82f6");
                
                // Along edge direction (small response for edges)
                drawOutwardArrow(len1/2, 0, "#f97316");
                drawOutwardArrow(-len1/2, 0, "#f97316");
                
                ctx.rotate(-angle);
                
                ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
                ctx.fillRect(16, -10, 114, 18);
                
                ctx.fillStyle = state.edgeLike ? "#ef4444" : "#16a34a";
                ctx.font = "800 11px sans-serif";
                ctx.fillText(`Ratio: ${state.edgeRatio.toFixed(1)} ${state.edgeLike ? '>' : '<'} ${state.threshold.toFixed(1)}`, 20, 3);
                
                ctx.restore();
            }

            const alpha = state.edgeLike ? .92 - .62 * localPhase : .92;
            drawCandidateCircle(ctx, mapped.x, mapped.y, thumb ? 4.2 : 8, state.edgeLike ? "#f97316" : "#16a34a", alpha);
            
            if (state.edgeLike && !thumb) {
                const rejectScale = 1 + localPhase * 0.5;
                drawCandidateCross(ctx, mapped.x, mapped.y, 10 * rejectScale, "#ef4444", 1 - localPhase);
                ctx.fillStyle = `rgba(239,68,68,${1 - localPhase})`;
                ctx.font = "900 12px sans-serif";
                ctx.fillText("REJECT (Edge)", mapped.x + 12, mapped.y - 12 - 15 * localPhase);
            } else if (!state.edgeLike && !thumb && rightImage) {
                const rightMapped = mapPointToImageRect(candidate, rightImage.rect, scaleData.meta?.width || rightImage.img.width, scaleData.meta?.height || rightImage.img.height);
                ctx.save();
                ctx.strokeStyle = "rgba(34,197,94,0.3)";
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 6]);
                ctx.beginPath();
                ctx.moveTo(mapped.x, mapped.y);
                const cpX = (mapped.x + rightMapped.x) / 2;
                const cpY = mapped.y - 60;
                ctx.bezierCurveTo(cpX, cpY, cpX, cpY, rightMapped.x, rightMapped.y);
                ctx.stroke();
                
                const t = Math.pow(localPhase, 1.5);
                const mx = mapped.x * (1 - t) * (1 - t) + 2 * cpX * (1 - t) * t + rightMapped.x * t * t;
                const my = mapped.y * (1 - t) * (1 - t) + 2 * cpY * (1 - t) * t + rightMapped.y * t * t;
                drawCandidateCircle(ctx, mx, my, 6, "#22c55e", 1);
                
                ctx.fillStyle = `rgba(34,197,94,${1 - localPhase})`;
                ctx.font = "900 12px sans-serif";
                ctx.fillText("KEEP (Corner)", mapped.x + 12, mapped.y - 12 - 10 * localPhase);
                ctx.restore();
            }

            if (rightImage && !state.edgeLike) {
                const rightMapped = mapPointToImageRect(candidate, rightImage.rect, scaleData.meta?.width || rightImage.img.width, scaleData.meta?.height || rightImage.img.height);
                drawCandidateCircle(ctx, rightMapped.x, rightMapped.y, thumb ? 5 : 9 + 2 * Math.sin(localPhase * Math.PI * 2) ** 2, "#16a34a", Math.min(1, localPhase * 1.5));
            }
        }

        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.font = thumb ? "900 10px sans-serif" : "950 15px sans-serif";
        ctx.fillText("过滤前候选", left.x, left.y - (thumb ? 8 : 14));
        ctx.fillText("过滤后关键点", right.x, right.y - (thumb ? 8 : 14));
        if (!thumb) {
            const y = 466;
            [
                ["原始极值", raw.length, "#64748b"],
                ["过滤后", filtered.length, "#f97316"],
                ["NMS 保留", kept.length, "#16a34a"]
            ].forEach(([label, value, color], index) => {
                const x = 116 + index * 230;
                ctx.fillStyle = "rgba(255,255,255,.9)";
                ctx.strokeStyle = `${color}66`;
                roundRect(ctx, x, y - 26, 170, 44, 12);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.font = "950 18px sans-serif";
                ctx.fillText(String(value), x + 18, y);
                ctx.fillStyle = "#475569";
                ctx.font = "850 12px sans-serif";
                ctx.fillText(label, x + 76, y);
            });
        }
        ctx.restore();
    }

    async function drawSiftStepCanvas(canvas, stepIndex, options = {}) {
        if (!canvas || !scaleData) return;
        const thumb = Boolean(options.thumb);
        const step = stepContentMap.sift[stepIndex] || stepContentMap.sift[0];
        const gray = stepIndex === 0 ? await grayPacked() : null;
        const sift = scaleData.sift || {};
        const descriptor = descriptorData?.sift || {};
        const preprocessSize = (!thumb && stepIndex === 0 && gray)
            ? (() => {
                const scale = Math.min(560 / gray.width, 430 / gray.height, 1);
                return {
                    width: Math.max(1, Math.round(gray.width * scale)),
                    height: Math.max(1, Math.round(gray.height * scale))
                };
            })()
            : null;
        const width = thumb ? 220 : (preprocessSize?.width || 920);
        const height = thumb ? 130 : (preprocessSize?.height || 520);
        const ctx = await drawMainBase(canvas, width, height);
        const margin = thumb ? 8 : 22;

        if (stepIndex === 0) {
            const rect = thumb
                ? (() => {
                    const fitted = coverRect(gray.width, gray.height, width - margin * 2, height - margin * 2);
                    fitted.x += margin;
                    fitted.y += margin;
                    return fitted;
                })()
                : { x: 0, y: 0, w: width, h: height };
            drawPackedImage(ctx, gray, rect, "gray");
            if (!thumb) {
                drawCanvasTitle(ctx, "RGB → Gray", 14, 26);
            }
            return;
        }

        if (stepIndex === 1 || stepIndex === 2) {
            const rows = stepIndex === 1 ? scaleData.pyramid?.gaussian || [] : scaleData.pyramid?.dog || [];
            const palette = stepIndex === 1 ? "gray" : "heat";
            const sourceRows = stepIndex === 2 ? scaleData.pyramid?.gaussian || [] : null;
            const animationPhase = thumb ? 0 : replayWithHold(options.animationPhase || 0);
            drawPseudoPyramid(ctx, rows, palette, width, height, thumb, animationPhase, sourceRows);
            return;
        }

        if (stepIndex === 3) {
            const animationPhase = thumb ? 0 : replayWithHold(options.animationPhase || 0, 0.86);
            await drawDogExtremaMain(canvas, width, height, thumb, sift, { animationPhase });
            return;
        }

        if (stepIndex === 4) {
            await drawSiftFilterComparison(canvas, width, height, thumb, sift, { animationPhase: options.animationPhase || 0 });
            return;
        }

        if (stepIndex === 5) {
            await drawOrientationAssignmentMain(canvas, width, height, thumb, { animationPhase: options.animationPhase || 0 });
            return;
        }

        const selected = descriptor.selected;
        V.setCanvasSize(canvas, width, height);
        const descriptorCtx = canvas.getContext("2d");
        descriptorCtx.fillStyle = "#f8fbff";
        descriptorCtx.fillRect(0, 0, width, height);
        
        const phase = thumb ? 1 : replayWithHold(options.animationPhase || 0, 0.75);

        if (selected) {
            const chartValues = selected.descriptor128 || [];
            const max = Math.max(1e-6, ...chartValues);
            
            // Layout parameters
            const gridLeft = thumb ? 0 : 50;
            const gridTop = 110;
            const cellSize = 75;
            const chartLeft = thumb ? 10 : 410;
            const chartWidth = thumb ? (width - 20) : (width - chartLeft - 40);
            const cellGap = thumb ? 1 : 8;
            const barW = Math.max(0.5, (chartWidth - cellGap * 15) / 128);
            const bottom = height - (thumb ? 18 : 52);
            const maxBarH = height - (thumb ? 38 : 155);

            if (!thumb) {
                // 1. Draw 4x4 Spatial Grid of Orientation Stars (Classic SIFT visualization)
                descriptorCtx.fillStyle = "#64748b";
                descriptorCtx.font = "950 15px sans-serif";
                descriptorCtx.fillText("4×4 空间网格 (Spatial Grid)", gridLeft + 50, gridTop - 25);
                
                descriptorCtx.strokeStyle = "rgba(100, 116, 139, 0.2)";
                descriptorCtx.lineWidth = 1;
                for (let i = 0; i <= 4; i++) {
                    descriptorCtx.beginPath();
                    descriptorCtx.moveTo(gridLeft + i * cellSize, gridTop);
                    descriptorCtx.lineTo(gridLeft + i * cellSize, gridTop + 4 * cellSize);
                    descriptorCtx.stroke();
                    descriptorCtx.beginPath();
                    descriptorCtx.moveTo(gridLeft, gridTop + i * cellSize);
                    descriptorCtx.lineTo(gridLeft + 4 * cellSize, gridTop + i * cellSize);
                    descriptorCtx.stroke();
                }
                
                const rawVectors = selected.patch_vectors || [];
                
                // Draw Raw Patch Vectors accumulating into Stars
                rawVectors.forEach(v => {
                    const cx_center = gridLeft + 2 * cellSize;
                    const cy_center = gridTop + 2 * cellSize;
                    const x = cx_center + (v.dx / 8.0) * (2 * cellSize);
                    const y = cy_center + (v.dy / 8.0) * (2 * cellSize);
                    
                    const cell_x = Math.min(3, Math.max(0, Math.floor((v.dx + 8) / 4)));
                    const cell_y = Math.min(3, Math.max(0, Math.floor((v.dy + 8) / 4)));
                    const c = cell_y * 4 + cell_x;
                    
                    const cellPhase = Math.max(0, Math.min(1, (phase - c / 16 * 0.6) / 0.15));
                    const mag = (v.mag || 0) * (v.weight || 1);
                    if (mag < 1e-4) return;
                    
                    if (cellPhase < 1) {
                        const alpha = cellPhase > 0 ? (1 - cellPhase) : 0.18;
                        const len = Math.max(1.5, Math.min(10, mag * 65)); 
                        const color = cellPhase > 0 ? "#f97316" : "#94a3b8";
                        
                        const ax = x + Math.cos(v.angle) * len;
                        const ay = y - Math.sin(v.angle) * len;
                        
                        descriptorCtx.strokeStyle = color;
                        descriptorCtx.globalAlpha = alpha;
                        descriptorCtx.lineWidth = 1;
                        descriptorCtx.beginPath();
                        descriptorCtx.moveTo(x, y);
                        descriptorCtx.lineTo(ax, ay);
                        descriptorCtx.stroke();
                        descriptorCtx.globalAlpha = 1;
                    }
                });
                
                // Draw 8-directional stars inside each cell
                for (let c = 0; c < 16; c++) {
                    const cx = gridLeft + (c % 4) * cellSize + cellSize / 2;
                    const cy = gridTop + Math.floor(c / 4) * cellSize + cellSize / 2;
                    
                    const cellPhase = Math.max(0, Math.min(1, (phase - c / 16 * 0.6) / 0.15));
                    if (cellPhase <= 0) continue;
                    
                    const isCurrentCell = cellPhase < 1 && cellPhase > 0;
                    
                    if (isCurrentCell && !thumb) {
                        descriptorCtx.fillStyle = "rgba(249, 115, 22, 0.08)";
                        descriptorCtx.fillRect(cx - cellSize/2, cy - cellSize/2, cellSize, cellSize);
                        
                        const chartCx = chartLeft + c * (barW * 8 + cellGap) + (barW * 4);
                        const chartCy = bottom - maxBarH - 25;
                        
                        descriptorCtx.strokeStyle = "rgba(249, 115, 22, 0.4)";
                        descriptorCtx.setLineDash([4, 4]);
                        descriptorCtx.lineWidth = 1.5;
                        descriptorCtx.beginPath();
                        descriptorCtx.moveTo(cx + cellSize/2, cy);
                        descriptorCtx.bezierCurveTo(cx + cellSize, cy, chartCx, chartCy - 40, chartCx, chartCy + 10);
                        descriptorCtx.stroke();
                        descriptorCtx.setLineDash([]);
                    }
                    
                    for (let i = 0; i < 8; i++) {
                        const val = chartValues[c * 8 + i] || 0;
                        if (val <= 1e-6) continue;
                        const len = (val / max) * (cellSize / 2 * 0.85) * cellPhase;
                        const angle = i * Math.PI / 4; 
                        
                        const ax = cx + Math.cos(angle) * len;
                        const ay = cy - Math.sin(angle) * len; 
                        
                        const color = (isCurrentCell && !thumb) ? "#f97316" : "#3b82f6";
                        
                        descriptorCtx.strokeStyle = color;
                        descriptorCtx.fillStyle = color;
                        descriptorCtx.lineWidth = (isCurrentCell && !thumb) ? 2.5 : 1.8;
                        descriptorCtx.beginPath();
                        descriptorCtx.moveTo(cx, cy);
                        descriptorCtx.lineTo(ax, ay);
                        descriptorCtx.stroke();
                        
                        if (len > 4) {
                            const head = Math.min(4, len * 0.6);
                            descriptorCtx.beginPath();
                            descriptorCtx.moveTo(ax, ay);
                            descriptorCtx.lineTo(ax - head * Math.cos(angle - 0.5), ay + head * Math.sin(angle - 0.5));
                            descriptorCtx.lineTo(ax - head * Math.cos(angle + 0.5), ay + head * Math.sin(angle + 0.5));
                            descriptorCtx.fill();
                        }
                    }
                }
                
                // 2. Draw 128-D Flattened Histogram
                descriptorCtx.fillStyle = "#64748b";
                descriptorCtx.font = "950 15px sans-serif";
                descriptorCtx.fillText("128 维展开向量 (Flattened 128-D Vector)", chartLeft, gridTop - 25);
                
                // Clip threshold line
                descriptorCtx.strokeStyle = "rgba(239, 68, 68, 0.4)";
                descriptorCtx.setLineDash([5, 5]);
                descriptorCtx.beginPath();
                descriptorCtx.moveTo(chartLeft, bottom - maxBarH);
                descriptorCtx.lineTo(chartLeft + chartWidth, bottom - maxBarH);
                descriptorCtx.stroke();
                descriptorCtx.setLineDash([]);
                descriptorCtx.fillStyle = "rgba(239, 68, 68, 0.7)";
                descriptorCtx.font = "800 11px sans-serif";
                descriptorCtx.fillText("Clip Threshold (0.2)", chartLeft + chartWidth - 110, bottom - maxBarH - 6);
            }
            
            // Draw grouped bars
            chartValues.forEach((value, index) => {
                const c = Math.floor(index / 8);
                const b = index % 8;
                
                const cellPhase = Math.max(0, Math.min(1, (phase - c / 16 * 0.6) / 0.15));
                const barPhase = Math.max(0, Math.min(1, (cellPhase - b / 8 * 0.3) / 0.7));
                const ease = 1 - Math.pow(1 - barPhase, 3);
                
                if (ease <= 0) return;
                
                const barH = maxBarH * (value / max) * ease;
                if (barH <= 0.5 && !thumb) return;
                
                const x = chartLeft + c * (barW * 8 + cellGap) + b * barW;
                const isCurrentCell = cellPhase < 1 && cellPhase > 0;
                
                if (!thumb && barH > 5) {
                    const grad = descriptorCtx.createLinearGradient(x, bottom - barH, x, bottom);
                    if (isCurrentCell) {
                        grad.addColorStop(0, "#fde047");
                        grad.addColorStop(1, "#ea580c");
                    } else {
                        grad.addColorStop(0, b === 0 ? "#fdba74" : "#60a5fa");
                        grad.addColorStop(1, b === 0 ? "#ea580c" : "#2563eb");
                    }
                    descriptorCtx.fillStyle = grad;
                } else {
                    descriptorCtx.fillStyle = isCurrentCell ? "#ea580c" : (b === 0 ? "#f97316" : "#2563eb");
                }
                
                descriptorCtx.fillRect(x, bottom - barH, Math.max(1, barW - (thumb ? 0 : 0.8)), barH);
                
                // Draw cell group indicators on x-axis
                if (!thumb && b === 4 && barPhase > 0.8) {
                    descriptorCtx.fillStyle = "#94a3b8";
                    descriptorCtx.font = "800 9px sans-serif";
                    descriptorCtx.fillText(`C${c}`, x - 6, bottom + 16);
                }
            });
            
            if (!thumb) drawCanvasTitle(descriptorCtx, "128-dim descriptor computation", 34, 34);
            
        } else {
            descriptorCtx.fillStyle = "#64748b";
            descriptorCtx.font = "900 16px sans-serif";
            descriptorCtx.fillText("进入描述子步骤后加载 128 维向量", width / 2 - 120, height / 2);
        }
    }

    async function drawSiftKeypointsContained(canvas, points, width, height, max) {
        const contained = await drawOriginalContained(canvas, width, height);
        if (!contained) return;
        const sx = contained.rect.w / (scaleData.meta?.width || contained.img.width);
        const sy = contained.rect.h / (scaleData.meta?.height || contained.img.height);
        points.slice(0, max).forEach(point => {
            const mapped = {
                ...point,
                x: contained.rect.x + point.x * sx,
                y: contained.rect.y + point.y * sy,
                sigma: (point.sigma || point.scale || 2) * Math.min(sx, sy)
            };
            V.drawSiftSymbol(contained.ctx, mapped);
        });
    }

    async function drawAnalogStepMain(canvas, stepIndex, options = {}) {
        const algorithm = selectedAlgorithm();
        const data = analogData.get(algorithm);
        const step = currentSteps()[stepIndex] || currentSteps()[0];
        if (!data || !scaleData?.images?.original || !canvas) {
            const ctx = await drawMainBase(canvas, options.thumb ? 220 : 920, options.thumb ? 130 : 520);
            ctx.fillStyle = "#64748b";
            ctx.font = "900 14px sans-serif";
            ctx.fillText("等待基础数据", 18, 36);
            return;
        }
        await drawAlgorithmStepCanvas(canvas, scaleData.images.original, data, step, options);
        if (!options.thumb) {
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "rgba(255,255,255,.9)";
            ctx.fillRect(12, 12, 210, 34);
            ctx.fillStyle = algorithm === "surf" ? "#0ea5e9" : algorithm === "orb-lite" ? "#16a34a" : "#ca8a04";
            ctx.font = "900 16px sans-serif";
            ctx.fillText(`${data.name} · ${step.title}`, 24, 35);
        }
    }

    async function renderCurrentMain() {
        const canvas = V.$("siftStepCanvas");
        const status = V.$("siftStepStatus");
        const algorithm = selectedAlgorithm();
        const step = currentSteps()[currentStep] || currentSteps()[0];
        if (status) {
            const counts = scaleData?.sift?.counts || {};
            status.textContent = scaleData
                ? `当前步骤：${step.title}；图像 ${scaleData.meta.width} × ${scaleData.meta.height}；关键点 ${counts.kept || scaleData.sift?.count || analogData.get(algorithm)?.keypoints || 0}`
                : "正在加载示例图...";
        }
        if (!scaleData) return;
        if (algorithm === "sift") await drawSiftStepCanvas(canvas, currentStep);
        else await drawAnalogStepMain(canvas, currentStep);
    }

    async function renderFlowThumbs() {
        const container = V.$("siftFlowThumbs");
        if (!container) return;
        const steps = currentSteps();
        const info = algorithmInfo[selectedAlgorithm()] || algorithmInfo.sift;
        V.$("siftFlowTitle").textContent = `${info.name} 特征检测计算流程`;
        container.innerHTML = steps.map((step, index) => `
            <button type="button" class="${index === currentStep ? "is-active" : ""}" data-sift-thumb-step="${index}">
                <span class="corner-flow-card-head">
                    <i>${index + 1}</i>
                    <span><b>${step.title}</b><small>${step.primary?.[0] || (step.goal || "").split("，")[0]}</small></span>
                </span>
                <canvas id="siftThumb${index}"></canvas>
            </button>
        `).join("");
        container.querySelectorAll("[data-sift-thumb-step]").forEach(button => {
            button.addEventListener("click", () => selectStep(button.dataset.siftThumbStep));
        });
        await Promise.all(steps.map((step, index) => {
            const canvas = V.$(`siftThumb${index}`);
            return selectedAlgorithm() === "sift"
                ? drawSiftStepCanvas(canvas, index, { thumb: true })
                : drawAnalogStepMain(canvas, index, { thumb: true });
        }));
    }

    async function renderCurrentStepView() {
        renderNotes(currentStep);
        await renderCurrentMain();
        await renderFlowThumbs();
        renderSiftMotionProbe();
    }

    function motionLabels(algorithm, step) {
        if (algorithm !== "sift") {
            const map = {
                surf: [
                    ["像素累加", "四角求和", "积分图"],
                    ["Dxx/Dyy/Dxy", "det(H)", "局部峰值"],
                    ["Haar 扇区", "向量求和", "主方向"],
                    ["4×4 cells", "dx/dy 统计", "64 float"]
                ],
                "fast-brief": [
                    ["滑动窗口", "16 点判定", "NMS 保留"],
                    ["采样点对", "灰度比较", "bit 写入"],
                    ["256 bit", "XOR popcount", "Hamming"]
                ],
                "orb-lite": [
                    ["FAST 候选", "响应排序", "NMS 保留"],
                    ["灰度矩", "质心向量", "旋转角"],
                    ["旋转点对", "BRIEF 比较", "ORB bits"]
                ]
            };
            return (map[algorithm] || map["fast-brief"])[step] || ["输入", "计算", "输出"];
        }
        return [
            ["RGB 采样", "灰度融合", "统一输入"],
            ["尺度层", "高斯平滑", "Octave 下采样"],
            ["相邻高斯层", "差分响应", "DoG 输出"],
            ["3×3×3 邻域", "26 邻居比较", "Taylor 精确定位"],
            ["局部 patch", "方向探针", "edge ratio gate"],
            ["选择关键点", "显示支持域", "显示梯度", "投票直方图", "平滑直方图", "选择主峰", "复制辅方向", "回写方向"],
            ["4×4 cell", "8-bin 统计", "128 维归一化"]
        ][step] || ["输入", "计算", "输出"];
    }

    function edgeSuppressionState(phase = 0) {
        const t = ((Number(phase) || 0) % 1 + 1) % 1;
        const edgeThreshold = Math.max(1, Number(form.elements.edge_threshold?.value) || 10);
        const ratioThreshold = (edgeThreshold + 1) * (edgeThreshold + 1) / edgeThreshold;
        const edgeLike = t < 0.56;
        const scan = motionEase((t % 0.56) / 0.56);
        const parallel = edgeLike ? 0.12 + 0.04 * Math.sin(t * Math.PI * 4) : 0.74 + 0.08 * Math.sin(t * Math.PI * 4);
        const perpendicular = edgeLike ? 0.88 + 0.06 * Math.sin(t * Math.PI * 3) : 0.78 + 0.07 * Math.cos(t * Math.PI * 4);
        const edgeRatio = edgeLike ? ratioThreshold * (1.22 + 0.1 * scan) : ratioThreshold * (0.42 + 0.06 * scan);
        return {
            edgeLike,
            type: edgeLike ? "Edge-like" : "Corner-like",
            decision: edgeLike ? "REJECT" : "KEEP",
            parallel,
            perpendicular,
            edgeRatio,
            threshold: ratioThreshold,
            scan
        };
    }

    function motionProbeData() {
        const sift = (descriptorData || scaleData)?.sift || scaleData?.sift || {};
        const selected = descriptorData?.sift?.selected || sift.selected || null;
        const keypoints = descriptorData?.sift?.oriented_keypoints || descriptorData?.sift?.extended_points ||
            sift.oriented_keypoints || sift.extended_points || sift.points_keypoints || sift.keypoints || [];
        const point = selected || keypoints[0] || scaleData?.pyramid?.probe || {};
        return {
            point,
            selected,
            keypoints,
            counts: sift.counts || {},
            dogProbe: scaleData?.pyramid?.probe || null,
            gaussianRows: scaleData?.pyramid?.gaussian || [],
            dogRows: scaleData?.pyramid?.dog || [],
            vectors: selected?.patch_vectors || [],
            descriptor128: selected?.descriptor128 || []
        };
    }

    function renderSiftMotionSteps() {
        const box = V.$("siftMotionSteps");
        if (!box) return;
        const labels = motionLabels(selectedAlgorithm(), currentStep);
        const active = Math.min(labels.length - 1, Math.floor(siftMotion.progress * labels.length));
        box.innerHTML = labels.map((label, index) => `
            <span class="corner-motion-step-chip ${index === active ? "is-active" : ""} ${index < active ? "is-done" : ""}">
                <span>${label}</span>
            </span>
        `).join("");
    }

    function renderSiftMotionMetrics() {
        const box = V.$("siftMotionMetrics");
        if (!box) return;
        const algorithm = selectedAlgorithm();
        const data = motionProbeData();
        const counts = data.counts || {};
        const selected = data.selected;
        const dog = data.dogProbe;
        const edgeState = edgeSuppressionState(siftMotion.progress);
        const orientationState = currentStep === 5 ? orientationDemoPayload() : null;
        const common = algorithm === "sift" ? [
            [
                ["图像尺寸", scaleData?.meta ? `${scaleData.meta.width} × ${scaleData.meta.height}` : "-", "blue"],
                ["当前点", data.point?.x !== undefined ? `(${compactNumber(data.point.x)}, ${compactNumber(data.point.y)})` : "-", "purple"],
                ["RGB", "142 / 171 / 188", "blue"],
                ["Gray", "164.3", "green"],
                ["输出", "I(x,y) 单通道", "orange"]
            ],
            [
                ["Octave", data.gaussianRows.length || "-", "blue"],
                ["尺度层", form.elements.sift_scales?.value || "-", "purple"],
                ["初始 σ", form.elements.sift_sigma?.value || "-", "orange"]
            ],
            [
                ["DoG 组", data.dogRows.length || "-", "blue"],
                ["Probe 层", dog ? `O${dog.octave} L${dog.layer}` : "-", "purple"],
                ["中心响应", dog ? compactNumber(dog.center) : "-", "orange"]
            ],
            [
                ["原始极值", counts.raw_extrema || 0, "blue"],
                ["邻域比较", "26", "purple"],
                ["输出", "候选点", "orange"]
            ],
            [
                ["当前点类型", edgeState.type, edgeState.edgeLike ? "orange" : "green"],
                ["平行方向变化", compactNumber(edgeState.parallel), "blue"],
                ["垂直方向变化", compactNumber(edgeState.perpendicular), "orange"],
                ["edge ratio", compactNumber(edgeState.edgeRatio), "purple"],
                ["threshold", compactNumber(edgeState.threshold), "blue"],
                ["最终判定", edgeState.decision, edgeState.edgeLike ? "orange" : "green"]
            ],
            [
                ["当前关键点", orientationState?.point?.x !== undefined ? `(${compactNumber(orientationState.point.x)}, ${compactNumber(orientationState.point.y)})` : "-", "blue"],
                ["octave / layer", orientationState?.point ? `${orientationState.point.octave ?? "-"} / ${orientationState.point.layer ?? orientationState.point.scale ?? "-"}` : "-", "purple"],
                ["σ", orientationState?.point?.sigma !== undefined ? compactNumber(orientationState.point.sigma) : "-", "blue"],
                ["主峰角度", orientationState ? `${compactNumber(orientationState.peaks.mainAngle)}°` : "-", "orange"],
                ["主峰值", orientationState ? compactNumber(orientationState.peaks.mainValue) : "-", "orange"],
                ["次峰角度", orientationState?.peaks?.secondaryBin >= 0 ? `${compactNumber(orientationState.peaks.secondaryAngle)}°` : "-", "purple"],
                ["次峰比例", orientationState ? compactNumber(orientationState.peaks.secondaryRatio) : "-", "purple"],
                ["输出方向数", orientationState ? orientationState.peaks.outputCount : 0, orientationState?.peaks?.hasSecondary ? "green" : "blue"]
            ],
            [
                ["Descriptor", selected ? "128 float" : "懒加载", "blue"],
                ["Patch vectors", data.vectors.length || 0, "purple"],
                ["L2 norm", selected ? "normalized" : "-", "green"]
            ]
        ][currentStep] || [] : noteResults(algorithm, currentStep).slice(0, 5).map(([k, v]) => [k, v, "blue"]);
        box.innerHTML = common.map(([label, value, tone]) => `
            <div class="corner-motion-metric is-${tone || "blue"}">
                <span>${label}<small>${value}</small></span>
            </div>
        `).join("");
    }

    function drawMotionBackground(ctx, w, h) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.clearRect(0, 0, w, h);
        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, "#ffffff");
        bg.addColorStop(1, "#eff6ff");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(191,219,254,.65)";
        ctx.lineWidth = 1;
        for (let x = 24; x < w; x += 34) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 24; y < h; y += 34) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
    }

    function motionEase(t) {
        return 0.5 - Math.cos(Math.max(0, Math.min(1, t)) * Math.PI) / 2;
    }

    function replayWithHold(progress, activePortion = 0.78) {
        const p = ((Number(progress) || 0) % 1 + 1) % 1;
        return p < activePortion ? p / activePortion : 1;
    }

    function drawMotionPill(ctx, x, y, w, h, title, value, color = "#2563eb") {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = `${color}55`;
        ctx.lineWidth = 1.4;
        roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "900 15px sans-serif";
        ctx.fillText(title, x + 13, y + 22);
        ctx.fillStyle = "#334155";
        ctx.font = "850 13px sans-serif";
        ctx.fillText(String(value), x + 13, y + 43);
        ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function drawMotionFlow(ctx, x1, y1, x2, y2, color, progress) {
        const t = motionEase(progress);
        ctx.save();
        ctx.strokeStyle = `${color}88`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawMotionPanel(ctx, x, y, w, h, color = "#2563eb") {
        ctx.save();
        ctx.shadowColor = "rgba(37,99,235,.12)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = `${color}4f`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 16);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
        const gloss = ctx.createLinearGradient(x, y, x + w, y + h);
        gloss.addColorStop(0, `${color}14`);
        gloss.addColorStop(.48, "rgba(255,255,255,0)");
        gloss.addColorStop(1, "rgba(255,255,255,.38)");
        ctx.fillStyle = gloss;
        roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 15);
        ctx.fill();
        ctx.restore();
    }

    function drawFlowParticles(ctx, x1, y1, x2, y2, color, phase, count = 4) {
        ctx.save();
        ctx.strokeStyle = `${color}42`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        for (let i = 0; i < count; i++) {
            const t = (phase + i / count) % 1;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            const alpha = .3 + .7 * Math.sin(t * Math.PI);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 13;
            ctx.beginPath();
            ctx.arc(x, y, 4.5 + Math.sin(t * Math.PI) * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawRgbMiniPatch(ctx, x, y, phase, activeColor) {
        const cell = 20;
        const palette = [
            [210, 229, 238], [154, 190, 206], [132, 178, 198], [171, 204, 216], [226, 236, 242],
            [179, 209, 220], [142, 171, 188], [111, 153, 178], [150, 187, 205], [205, 224, 232],
            [146, 184, 205], [118, 160, 186], [142, 171, 188], [164, 197, 212], [213, 229, 236],
            [183, 210, 220], [152, 188, 204], [126, 166, 190], [171, 203, 216], [226, 236, 242]
        ];
        ctx.save();
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 5; col++) {
                const [r, g, b] = palette[row * 5 + col];
                const xx = x + col * cell;
                const yy = y + row * cell;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                roundRect(ctx, xx, yy, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,.72)";
                ctx.stroke();
            }
        }
        const pulse = 1 + .18 * Math.sin(phase * Math.PI * 2);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3;
        roundRect(ctx, x + cell * 2 - 4 * pulse, y + cell * 2 - 4 * pulse, cell - 2 + 8 * pulse, cell - 2 + 8 * pulse, 6);
        ctx.stroke();
        ctx.restore();
    }

    function drawGrayMiniPatch(ctx, x, y, phase, activeColor) {
        const cell = 19;
        ctx.save();
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 5; col++) {
                const value = 120 + Math.round(55 * Math.sin(row * 1.15 + col * .86 + phase * Math.PI * 2));
                const clipped = Math.max(68, Math.min(218, value));
                const xx = x + col * cell;
                const yy = y + row * cell;
                ctx.fillStyle = `rgb(${clipped},${clipped},${clipped})`;
                roundRect(ctx, xx, yy, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,.78)";
                ctx.stroke();
            }
        }
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3;
        roundRect(ctx, x + cell * 2 - 4, y + cell * 2 - 4, cell + 6, cell + 6, 7);
        ctx.stroke();
        ctx.restore();
    }

    function drawWeightRow(ctx, x, y, w, label, raw, weight, contribution, color, progress) {
        const fillW = Math.max(8, w * motionEase(progress));
        ctx.save();
        ctx.fillStyle = `${color}18`;
        roundRect(ctx, x, y, w, 18, 9);
        ctx.fill();
        ctx.fillStyle = color;
        roundRect(ctx, x, y, fillW, 18, 9);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 11px sans-serif";
        ctx.fillText(label, x + 9, y + 13);
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${raw} × ${weight} = ${contribution}`, x + w - 8, y + 13);
        ctx.restore();
    }

    function drawMiniMatrix(ctx, x, y, title, matrix, phase, color = "#2563eb") {
        ctx.save();
        drawMotionPill(ctx, x, y - 28, 126, 26, title, "", color);
        const cell = 24;
        const values = matrix || [[0, 0, 0], [0, 1, 0], [0, 0, 0]];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const active = row === 1 && col === 1;
                ctx.fillStyle = active ? `${color}22` : "rgba(255,255,255,.94)";
                ctx.strokeStyle = active ? color : "#bfdbfe";
                ctx.lineWidth = active ? 2 : 1;
                ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
                ctx.strokeRect(x + col * cell, y + row * cell, cell, cell);
                ctx.fillStyle = active ? color : "#475569";
                ctx.font = active ? "900 12px sans-serif" : "800 11px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(compactNumber(values[row]?.[col] ?? 0), x + col * cell + cell / 2, y + row * cell + 15);
            }
        }
        const pulse = 1 + 0.18 * Math.sin(phase * Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 36, y + 36, 19 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawHistogramBars(ctx, x, y, w, h, values, highlight, color = "#2563eb") {
        const max = Math.max(1e-9, ...values.map(value => Math.abs(Number(value) || 0)));
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = "#bfdbfe";
        roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        ctx.stroke();
        const pad = 14;
        const barW = (w - pad * 2) / Math.max(1, values.length);
        values.forEach((value, index) => {
            const t = Math.abs(Number(value) || 0) / max;
            ctx.fillStyle = index === highlight ? "#f97316" : color;
            ctx.fillRect(x + pad + index * barW, y + h - pad - t * (h - pad * 2), Math.max(1.2, barW - 1), t * (h - pad * 2));
        });
        ctx.restore();
    }

    function drawSiftMotionPreprocess(ctx, phase, w, h, data = {}) {
        const rgb = { r: 142, g: 171, b: 188 };
        const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        const sampleT = motionEase(Math.min(1, Math.max(0, phase * 3)));
        const mixT = motionEase(Math.min(1, Math.max(0, (phase - .22) * 3)));
        const outputT = motionEase(Math.min(1, Math.max(0, (phase - .52) * 3)));
        const point = data.point?.x !== undefined ? `(${compactNumber(data.point.x)}, ${compactNumber(data.point.y)})` : "(x, y)";

        drawMotionPanel(ctx, 30, 34, 238, 168, "#2563eb");
        drawMotionPanel(ctx, 314, 34, 238, 168, "#06b6d4");
        drawMotionPanel(ctx, 598, 34, 218, 168, "#f97316");
        drawFlowParticles(ctx, 268, 118, 314, 118, "#06b6d4", phase, 3);
        drawFlowParticles(ctx, 552, 118, 598, 118, "#f97316", (phase + .28) % 1, 3);

        ctx.save();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 18px sans-serif";
        ctx.fillText("RGB 采样", 50, 64);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText(`局部 patch 中心 ${point}`, 50, 84);
        drawRgbMiniPatch(ctx, 50, 99, phase, "#2563eb");
        [
            ["R", rgb.r, "#ef4444", 0],
            ["G", rgb.g, "#22c55e", 1],
            ["B", rgb.b, "#2563eb", 2]
        ].forEach(([label, value, color, index]) => {
            const x = 170 + index * 26;
            const barH = (34 + index * 8) * sampleT;
            ctx.fillStyle = `${color}1f`;
            roundRect(ctx, x, 138 - 48, 18, 48, 7);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, x, 138 - barH, 18, barH, 7);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.font = "950 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(label, x + 9, 154);
            ctx.fillStyle = "#334155";
            ctx.font = "900 12px sans-serif";
            ctx.fillText(String(value), x + 9, 171);
        });
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(37,99,235,.12)";
        roundRect(ctx, 48, 184, 186, 8, 4);
        ctx.fill();
        ctx.fillStyle = "#2563eb";
        roundRect(ctx, 48, 184, 186 * sampleT, 8, 4);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "#0891b2";
        ctx.font = "950 18px sans-serif";
        ctx.fillText("加权融合", 334, 64);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("三个通道按亮度感知权重合成", 334, 84);
        drawWeightRow(ctx, 334, 98, 190, "R", rgb.r, "0.299", "42.5", "#ef4444", mixT);
        drawWeightRow(ctx, 334, 124, 190, "G", rgb.g, "0.587", "100.4", "#22c55e", Math.max(0, mixT - .12));
        drawWeightRow(ctx, 334, 150, 190, "B", rgb.b, "0.114", "21.4", "#2563eb", Math.max(0, mixT - .24));
        const orb = 16 + Math.sin(phase * Math.PI * 2) * 2;
        const gx = 496, gy = 78;
        const grayFill = Math.round(gray);
        ctx.fillStyle = `rgb(${grayFill},${grayFill},${grayFill})`;
        ctx.shadowColor = "rgba(6,182,212,.45)";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(gx, gy, orb, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy, orb + 8 * mixT, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.font = "950 17px sans-serif";
        ctx.fillText(`Gray = ${gray.toFixed(1)}`, 380, 188);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = .42 + outputT * .58;
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 18px sans-serif";
        ctx.fillText("I(x,y) 灰度输入", 618, 64);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("后续 Gaussian / DoG 共用", 618, 84);
        drawGrayMiniPatch(ctx, 620, 100, phase, "#f97316");
        ctx.fillStyle = "#fff7ed";
        ctx.strokeStyle = "rgba(249,115,22,.45)";
        ctx.lineWidth = 1.4;
        roundRect(ctx, 730, 102, 62, 46, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#9a3412";
        ctx.font = "950 12px sans-serif";
        ctx.fillText("单通道", 744, 121);
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 17px sans-serif";
        ctx.fillText(String(Math.round(gray)), 750, 141);
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(712, 132);
        ctx.lineTo(730, 126);
        ctx.stroke();
        ctx.fillStyle = "#475569";
        ctx.font = "900 13px sans-serif";
        ctx.fillText("统一尺度空间入口", 640, 184);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.font = "950 14px sans-serif";
        ctx.fillText("patch 选点 → RGB 通道采样 → 感知权重融合 → 生成 SIFT 的单通道输入", 156, 224);
        ctx.restore();
    }

    function drawGaussianTextureTile(ctx, cx, cy, size, blur, color, active, phase) {
        ctx.save();
        const radius = size / 2;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (1.1 + blur * .4));
        glow.addColorStop(0, `${color}${active ? "55" : "28"}`);
        glow.addColorStop(.62, `${color}${active ? "20" : "12"}`);
        glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (1.25 + blur * .45), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.72)";
        ctx.strokeStyle = active ? "#f97316" : `${color}72`;
        ctx.lineWidth = active ? 2.6 : 1.3;
        roundRect(ctx, cx - radius, cy - radius * .68, size, size * .78, 11);
        ctx.fill();
        ctx.stroke();
        const cols = 4;
        const rows = 3;
        const tileX = cx - radius;
        const tileY = cy - radius * .68;
        const tileW = size;
        const tileH = size * .78;
        const gridW = Math.min(tileW - 16, tileW * .72);
        const gridH = Math.min(tileH - 14, tileH * .58);
        const gridX = tileX + (tileW - gridW) / 2;
        const gridY = tileY + (tileH - gridH) / 2;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const t = (Math.sin(row * 1.7 + col * 1.2 + phase * Math.PI * 2) + 1) / 2;
                const alpha = Math.max(.08, (.42 - blur * .13) * (active ? 1 : .7));
                ctx.fillStyle = `rgba(37,99,235,${alpha * (.45 + t * .55)})`;
                const px = gridX + (col + .5) * gridW / cols;
                const py = gridY + (row + .5) * gridH / rows;
                ctx.beginPath();
                ctx.arc(px, py, Math.max(2.2, 4.2 - blur * .55), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        if (active) {
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(cx, cy, radius * (1.03 + .12 * phase), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    function drawGaussianBlurBeam(ctx, x1, y1, x2, y2, phase, active) {
        ctx.save();
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, "rgba(37,99,235,.08)");
        gradient.addColorStop(.5, active ? "rgba(6,182,212,.34)" : "rgba(96,165,250,.16)");
        gradient.addColorStop(1, "rgba(249,115,22,.12)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = active ? 9 : 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo((x1 + x2) / 2, y1 - 18, (x1 + x2) / 2, y2 + 18, x2, y2);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
            const t = (phase + i / 3) % 1;
            const mx = x1 + (x2 - x1) * t;
            const my = y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * 8;
            ctx.globalAlpha = active ? .72 : .36;
            ctx.fillStyle = active ? "#06b6d4" : "#60a5fa";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = active ? 14 : 8;
            ctx.beginPath();
            ctx.arc(mx, my, active ? 4.5 : 3.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    function drawSiftMotionGaussian(ctx, phase, w, h, data) {
        const rows = Math.max(1, Math.min(3, data.gaussianRows.length || 3));
        const layers = Math.max(4, Math.min(5, data.gaussianRows[0]?.length || 5));
        const layerProgress = phase * layers;
        const activeLayer = Math.min(layers - 1, Math.floor(layerProgress));
        const local = layerProgress - activeLayer;
        const startX = 116;
        const endX = 498;
        const octaveYs = rows === 1 ? [128] : Array.from({ length: rows }, (_, index) => 82 + index * 52);
        const baseSize = 50;

        ctx.save();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Gaussian Scale Space", 64, 36);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 11px sans-serif";
        ctx.fillText("σ 逐层增大，末层缩小后进入下一 octave", 64, 53);
        ctx.restore();

        octaveYs.forEach((y, octave) => {
            const scale = Math.pow(.72, octave);
            ctx.save();
            ctx.strokeStyle = "rgba(96,165,250,.35)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(startX - 18, y);
            ctx.lineTo(endX + 18, y);
            ctx.stroke();
            ctx.fillStyle = "#2563eb";
            ctx.font = "950 13px sans-serif";
            ctx.fillText(`O${octave}`, 50, y + 5);
            ctx.fillStyle = "#64748b";
            ctx.font = "850 10px sans-serif";
            ctx.fillText(octave ? "1/2 size" : "base", 50, y + 21);
            ctx.restore();

            for (let layer = 0; layer < layers; layer++) {
                const x = startX + layer * ((endX - startX) / Math.max(1, layers - 1));
                const active = layer === activeLayer;
                const blur = layer / Math.max(1, layers - 1);
                const size = baseSize * scale * (1 - blur * .08);
                drawGaussianBlurBeam(ctx, x - 58, y, x - 8, y, phase, active && layer > 0);
                drawGaussianTextureTile(ctx, x, y, size, blur, "#2563eb", active, phase);
                ctx.fillStyle = active ? "#ea580c" : "#1d4ed8";
                ctx.font = "950 12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(`σ${layer}`, x, y + size * .46 + 18);
                ctx.textAlign = "left";
            }

            if (octave < rows - 1) {
                const fromX = endX + 22;
                const toX = endX + 68;
                const fromY = y;
                const toY = octaveYs[octave + 1];
                ctx.save();
                ctx.strokeStyle = "rgba(6,182,212,.28)";
                ctx.lineWidth = 10;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
                ctx.restore();
                drawFlowParticles(ctx, fromX, fromY, toX, toY, "#06b6d4", (phase + octave * .18) % 1, 4);
            }
        });

        const gaugeX = 610;
        const gaugeY = 86;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.78)";
        ctx.strokeStyle = "rgba(6,182,212,.55)";
        ctx.lineWidth = 1.6;
        roundRect(ctx, gaugeX, gaugeY, 138, 92, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#0891b2";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("σ sweep", gaugeX + 18, gaugeY + 26);
        const sweep = Math.min(1, (activeLayer + local) / Math.max(1, layers - 1));
        ctx.strokeStyle = "rgba(6,182,212,.18)";
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(gaugeX + 50, gaugeY + 61, 23, -Math.PI * .75, Math.PI * .75);
        ctx.stroke();
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(gaugeX + 50, gaugeY + 61, 23, -Math.PI * .75, -Math.PI * .75 + Math.PI * 1.5 * sweep);
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 18px sans-serif";
        ctx.fillText(`σ${activeLayer}`, gaugeX + 86, gaugeY + 67);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 11px sans-serif";
        ctx.fillText("blur", gaugeX + 18, gaugeY + 84);
        ctx.fillText("downsample", gaugeX + 68, gaugeY + 84);
        ctx.restore();
    }

    function dogMatrixValues(matrix) {
        const fallback = [[-0.05, 0.06, 0.067], [-0.06, -0.075, 0.073], [-0.06, 0.07, 0.069]];
        return Array.isArray(matrix) && matrix.length ? matrix : fallback;
    }

    function drawDogLayerSheet(ctx, x, y, w, h, label, sigmaLabel, color, phase, topLayer) {
        ctx.save();
        const lift = topLayer ? -10 : 10;
        ctx.globalAlpha = topLayer ? .95 : .84;
        const gradient = ctx.createLinearGradient(x, y + lift, x + w, y + h + lift);
        gradient.addColorStop(0, "rgba(255,255,255,.9)");
        gradient.addColorStop(1, topLayer ? "rgba(219,234,254,.78)" : "rgba(239,246,255,.82)");
        ctx.fillStyle = gradient;
        ctx.strokeStyle = `${color}88`;
        ctx.lineWidth = 1.8;
        roundRect(ctx, x, y + lift, w, h, 18);
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 30; i++) {
            const col = i % 6;
            const row = Math.floor(i / 6);
            const t = (Math.sin(i * 1.31 + phase * Math.PI * 2) + 1) / 2;
            ctx.fillStyle = topLayer
                ? `rgba(37,99,235,${.08 + t * .14})`
                : `rgba(14,165,233,${.07 + t * .10})`;
            ctx.beginPath();
            ctx.arc(x + 18 + col * (w - 36) / 5, y + lift + 18 + row * (h - 36) / 4, topLayer ? 5.4 : 4.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = color;
        ctx.font = "950 15px sans-serif";
        ctx.fillText(label, x + 14, y + lift + 25);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText(sigmaLabel, x + 14, y + lift + h - 14);
        ctx.restore();
    }

    function drawDogResponsePatch(ctx, x, y, size, matrix, phase) {
        const values = dogMatrixValues(matrix);
        const flat = values.flat().map(value => Number(value) || 0);
        const maxAbs = Math.max(1e-6, ...flat.map(value => Math.abs(value)));
        const cell = size / 3;
        ctx.save();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("DoG response", x, y - 16);
        values.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
                const v = Number(value) || 0;
                const strength = Math.min(1, Math.abs(v) / maxAbs);
                const px = x + colIndex * cell;
                const py = y + rowIndex * cell;
                const positive = v >= 0;
                ctx.fillStyle = positive
                    ? `rgba(37,99,235,${.13 + strength * .52})`
                    : `rgba(249,115,22,${.13 + strength * .55})`;
                ctx.strokeStyle = rowIndex === 1 && colIndex === 1 ? "#f97316" : "rgba(147,197,253,.62)";
                ctx.lineWidth = rowIndex === 1 && colIndex === 1 ? 2.6 : 1;
                roundRect(ctx, px + 3, py + 3, cell - 6, cell - 6, 9);
                ctx.fill();
                ctx.stroke();
                if (rowIndex === 1 && colIndex === 1) {
                    ctx.fillStyle = "#7c2d12";
                    ctx.font = "950 12px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(compactNumber(v), px + cell / 2, py + cell / 2 + 4);
                    ctx.strokeStyle = "#f97316";
                    ctx.lineWidth = 2.4;
                    ctx.beginPath();
                    ctx.arc(px + cell / 2, py + cell / 2, 18 + 5 * phase, 0, Math.PI * 2);
                    ctx.stroke();
                }
            });
        });
        ctx.restore();
    }

    function drawDogSubtractCore(ctx, cx, cy, phase) {
        ctx.save();
        const t = motionEase(phase);
        ctx.strokeStyle = "rgba(249,115,22,.24)";
        ctx.lineWidth = 16;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx - 82, cy - 42);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - 82, cy + 42);
        ctx.stroke();
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 32, cy);
        ctx.lineTo(cx + 32, cy);
        ctx.moveTo(cx, cy - 32);
        ctx.lineTo(cx, cy + 32);
        ctx.stroke();
        ctx.fillStyle = "#fff7ed";
        ctx.strokeStyle = "rgba(249,115,22,.72)";
        ctx.lineWidth = 1.8;
        roundRect(ctx, cx - 72, cy - 34, 144, 68, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 17px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("L(kσ) - L(σ)", cx, cy - 5);
        ctx.fillStyle = "#7c2d12";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("相邻高斯层逐像素相减", cx, cy + 17);
        for (let i = 0; i < 5; i++) {
            const angle = -Math.PI / 2 + i * Math.PI * 2 / 5 + t * Math.PI * 2;
            const px = cx + Math.cos(angle) * 48;
            const py = cy + Math.sin(angle) * 34;
            ctx.fillStyle = i % 2 ? "#2563eb" : "#f97316";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(px, py, 3.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawSiftMotionDog(ctx, phase, w, h, data) {
        const dog = data.dogProbe;
        const response = dogMatrixValues(dog?.current);
        const center = Number(dog?.center ?? response[1]?.[1] ?? 0);
        drawDogLayerSheet(ctx, 54, 66, 168, 76, "L(kσ)", "blurred layer i+1", "#2563eb", phase, true);
        drawDogLayerSheet(ctx, 74, 130, 168, 76, "L(σ)", "blurred layer i", "#06b6d4", phase, false);
        drawFlowParticles(ctx, 230, 96, 344, 118, "#2563eb", phase, 4);
        drawFlowParticles(ctx, 246, 158, 344, 130, "#06b6d4", (phase + .22) % 1, 4);
        drawDogSubtractCore(ctx, 430, 124, phase);
        drawFlowParticles(ctx, 506, 124, 612, 124, "#f97316", (phase + .12) % 1, 5);
        drawDogResponsePatch(ctx, 628, 76, 120, response, phase);
        ctx.save();
        const color = center >= 0 ? "#2563eb" : "#f97316";
        ctx.strokeStyle = `${color}66`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(628, 214);
        for (let i = 0; i < 72; i++) {
            const x = 628 + i * 2.2;
            const y = 214 + Math.sin(i * .35 + phase * Math.PI * 2) * 8 - Math.sign(center || -1) * 8;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "950 15px sans-serif";
        ctx.fillText(`center response ${compactNumber(center)}`, 616, 238);
        ctx.restore();
    }

    function drawExtremaSlice(ctx, cx, cy, matrix, label, color, phase, depthIndex) {
        const values = dogMatrixValues(matrix);
        const cell = 27;
        const skewX = depthIndex * 16;
        const skewY = depthIndex * -10;
        ctx.save();
        ctx.translate(cx + skewX, cy + skewY);
        ctx.fillStyle = "rgba(255,255,255,.74)";
        ctx.strokeStyle = `${color}80`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, -cell * 1.5 - 10, -cell * 1.5 - 10, cell * 3 + 20, cell * 3 + 20, 15);
        ctx.fill();
        ctx.stroke();
        values.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
                const x = (colIndex - 1) * cell;
                const y = (rowIndex - 1) * cell;
                const center = rowIndex === 1 && colIndex === 1 && depthIndex === 0;
                const neighbor = !center;
                const scan = Math.floor(phase * 27) % 27;
                const flatIndex = (depthIndex + 1) * 9 + rowIndex * 3 + colIndex;
                const hot = neighbor && flatIndex % 27 === scan;
                const v = Number(value) || 0;
                ctx.fillStyle = center ? "rgba(249,115,22,.32)" : v >= 0 ? "rgba(37,99,235,.17)" : "rgba(249,115,22,.16)";
                ctx.strokeStyle = center ? "#f97316" : hot ? "#06b6d4" : "rgba(147,197,253,.55)";
                ctx.lineWidth = center ? 2.8 : hot ? 2.2 : 1;
                roundRect(ctx, x - 11, y - 11, 22, 22, 6);
                ctx.fill();
                ctx.stroke();
                if (center || hot) {
                    ctx.fillStyle = center ? "#ea580c" : "#0891b2";
                    ctx.font = "950 9px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(compactNumber(v), x, y + 3);
                }
                if (hot) {
                    ctx.beginPath();
                    ctx.arc(x, y, 16 + 4 * phase, 0, Math.PI * 2);
                    ctx.stroke();
                }
            });
        });
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, 0, -cell * 1.75 - 15);
        ctx.restore();
    }

    function drawNeighborOrbit(ctx, cx, cy, phase) {
        ctx.save();
        ctx.strokeStyle = "rgba(6,182,212,.22)";
        ctx.lineWidth = 2;
        [30, 48, 66].forEach(radius => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
        });
        for (let i = 0; i < 26; i++) {
            const layer = Math.floor(i / 9);
            const angle = i * 2.399 + phase * Math.PI * 2;
            const radius = 30 + layer * 18 + (i % 3) * 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius * .62;
            const active = i === Math.floor(phase * 26) % 26;
            ctx.fillStyle = active ? "#f97316" : "#06b6d4";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = active ? 16 : 7;
            ctx.globalAlpha = active ? .95 : .42;
            ctx.beginPath();
            ctx.arc(x, y, active ? 6 : 3.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#0891b2";
        ctx.font = "950 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("26", cx, cy - 6);
        ctx.fillStyle = "#475569";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("neighbors", cx, cy + 13);
        ctx.restore();
    }

    function drawExtremaRefinementMotion(ctx, x, y, phase, dog) {
        const fitT = motionEase(clamp01((phase - .34) / .44));
        const settle = motionEase(clamp01((phase - .76) / .18));
        const baseX = x + 36;
        const baseY = y + 112;
        const peakX = x + 126;
        const peakY = y + 46;
        const xiX = x + 78;
        const xiY = y + 94;
        const currentX = xiX + (peakX - xiX) * fitT;
        const currentY = xiY + (peakY - xiY) * fitT;
        const center = Number(dog?.center || 0);

        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.strokeStyle = "rgba(187,247,208,.9)";
        ctx.lineWidth = 1.4;
        roundRect(ctx, x, y, 278, 168, 20);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#15803d";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Taylor 精确定位", x + 18, y + 28);
        ctx.fillStyle = "#475569";
        ctx.font = "850 11px sans-serif";
        ctx.fillText("候选点是离散采样点，二次拟合估计真实极值偏移。", x + 18, y + 48);

        ctx.strokeStyle = "rgba(148,163,184,.5)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(x + 168, baseY);
        ctx.stroke();
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 56; i++) {
            const px = baseX + i * 132 / 56;
            const d = (px - peakX) / 54;
            const py = peakY + d * d * 54;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(249,115,22,.72)";
        ctx.beginPath();
        ctx.moveTo(xiX, baseY + 4);
        ctx.lineTo(xiX, xiY - 14);
        ctx.stroke();
        ctx.strokeStyle = "rgba(22,163,74,.78)";
        ctx.beginPath();
        ctx.moveTo(peakX, baseY + 4);
        ctx.lineTo(peakX, peakY - 12);
        ctx.stroke();
        ctx.setLineDash([]);

        drawCandidateCircle(ctx, xiX, xiY, 7, "#f97316", 1, true);
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(xiX + 10, xiY - 3);
        ctx.lineTo(currentX - 9, currentY + 3);
        ctx.stroke();
        drawCandidateCircle(ctx, currentX, currentY, 8 + settle * 2.2, "#16a34a", .96, true);

        ctx.fillStyle = "#f97316";
        ctx.font = "950 10px sans-serif";
        ctx.fillText("Xi", xiX - 8, xiY + 22);
        ctx.fillStyle = "#16a34a";
        ctx.fillText("Xi + ΔX", peakX - 20, peakY - 18);

        const dx = 0.34 * fitT;
        const dy = -0.28 * fitT;
        const ds = 0.16 * fitT;
        ctx.fillStyle = "rgba(239,246,255,.95)";
        ctx.strokeStyle = "rgba(191,219,254,.9)";
        roundRect(ctx, x + 178, y + 68, 82, 72, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "950 10px sans-serif";
        ctx.fillText("ΔX=-H⁻¹g", x + 188, y + 88);
        ctx.fillText(`Δx ${dx.toFixed(2)}`, x + 188, y + 106);
        ctx.fillText(`Δy ${dy.toFixed(2)}`, x + 188, y + 122);
        ctx.fillText(`Δσ ${ds.toFixed(2)}`, x + 188, y + 138);

        const refinedValue = center + Math.abs(center) * .12 * fitT;
        ctx.fillStyle = "#334155";
        ctx.font = "850 11px sans-serif";
        ctx.fillText(`D(Xi + ΔX) = ${compactNumber(refinedValue)}`, x + 18, y + 152);
        if (settle > .2) {
            ctx.fillStyle = "#16a34a";
            roundRect(ctx, x + 188, y + 18, 72, 24, 12);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "950 11px sans-serif";
            ctx.fillText("|ΔX| < 0.5", x + 198, y + 34);
        }
        ctx.restore();
    }

    function drawFilterGate(ctx, x, y, counts, phase) {
        const raw = counts.raw_extrema || 0;
        const edge = counts.edge_survivors || 0;
        const kept = counts.kept || 0;
        const t = motionEase(phase);
        ctx.save();
        ctx.strokeStyle = "rgba(249,115,22,.55)";
        ctx.fillStyle = "rgba(255,247,237,.78)";
        ctx.lineWidth = 1.8;
        roundRect(ctx, x, y, 146, 96, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Filter gate", x + 18, y + 25);
        [["contrast", raw, edge, "#f97316"], ["edge", edge, kept, "#16a34a"]].forEach(([label, before, after, color], index) => {
            const yy = y + 44 + index * 25;
            const ratio = before ? Math.max(.08, Math.min(1, after / before)) : .15;
            ctx.fillStyle = "rgba(255,255,255,.8)";
            roundRect(ctx, x + 18, yy, 84, 9, 5);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, x + 18, yy, 84 * ratio * t, 9, 5);
            ctx.fill();
            ctx.fillStyle = "#64748b";
            ctx.font = "850 10px sans-serif";
            ctx.fillText(label, x + 108, yy + 8);
        });
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 20px sans-serif";
        ctx.fillText(`${kept}`, x + 104, y + 86);
        ctx.fillStyle = "#166534";
        ctx.font = "850 11px sans-serif";
        ctx.fillText("kept", x + 104, y + 70);
        ctx.restore();
    }

    function drawSiftMotionExtrema(ctx, phase, w, h, data) {
        const dog = data.dogProbe;
        const cx = 156;
        const cy = 126;
        drawExtremaSlice(ctx, cx - 54, cy - 18, dog?.prev, "上一层", "#64748b", phase, -1);
        drawExtremaSlice(ctx, cx, cy, dog?.current, "当前层", "#2563eb", phase, 0);
        drawExtremaSlice(ctx, cx + 54, cy + 18, dog?.next, "下一层", "#64748b", phase, 1);
        ctx.save();
        ctx.strokeStyle = "rgba(249,115,22,.75)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 21 + 6 * phase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("center", cx, cy + 43);
        ctx.restore();
        drawFlowParticles(ctx, 304, 126, 388, 126, "#06b6d4", phase, 5);
        drawNeighborOrbit(ctx, 448, 126, phase);
        drawFlowParticles(ctx, 512, 126, 584, 126, "#16a34a", (phase + .18) % 1, 4);
        drawExtremaRefinementMotion(ctx, 596, 46, phase, dog);
        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.font = "950 12px sans-serif";
        ctx.fillText("先通过 26 邻域比较得到离散候选，再用 Taylor 二次拟合移动到亚像素 / 亚尺度极值。", 82, 224);
        ctx.restore();
    }

    function drawSiftMotionFilter(ctx, phase, w, h, data) {
        const state = edgeSuppressionState(phase);
        const edgeLike = state.edgeLike;
        const accent = edgeLike ? "#f97316" : "#16a34a";
        const parallelColor = "#2563eb";
        const perpendicularColor = "#f97316";
        const probeOsc = Math.sin(phase * Math.PI * 2);

        function bar(x, y, label, value, color) {
            ctx.save();
            ctx.fillStyle = `${color}12`;
            roundRect(ctx, x, y, 132, 14, 7);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, x, y, 132 * Math.max(.04, Math.min(1, value)), 14, 7);
            ctx.fill();
            ctx.fillStyle = "#334155";
            ctx.font = "900 11px sans-serif";
            ctx.fillText(label, x, y - 8);
            ctx.fillStyle = color;
            ctx.font = "950 12px sans-serif";
            ctx.fillText(compactNumber(value), x + 104, y - 8);
            ctx.restore();
        }

        function arrow(cx, cy, angle, length, color, label) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            const x1 = cx - Math.cos(angle) * length / 2;
            const y1 = cy - Math.sin(angle) * length / 2;
            const x2 = cx + Math.cos(angle) * length / 2;
            const y2 = cy + Math.sin(angle) * length / 2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - Math.cos(angle - .45) * 10, y2 - Math.sin(angle - .45) * 10);
            ctx.lineTo(x2 - Math.cos(angle + .45) * 10, y2 - Math.sin(angle + .45) * 10);
            ctx.closePath();
            ctx.fill();
            ctx.font = "950 11px sans-serif";
            ctx.fillText(label, x2 + 8, y2 - 4);
            ctx.restore();
        }

        drawMotionPanel(ctx, 28, 30, 214, 202, accent);
        ctx.save();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Local DoG patch", 48, 56);
        const patch = { x: 58, y: 76, cell: 17 };
        for (let row = 0; row < 7; row++) {
            for (let col = 0; col < 7; col++) {
                const dx = col - 3;
                const dy = row - 3;
                const value = edgeLike
                    ? 0.45 + 0.38 * Math.tanh(dx * 0.9) + 0.04 * Math.sin(row)
                    : 0.44 + 0.22 * Math.tanh(dx * 1.1) + 0.24 * Math.tanh(dy * 1.1);
                const blue = Math.round(218 - value * 54);
                ctx.fillStyle = `rgb(${blue},${Math.round(232 - value * 34)},${Math.round(246 - value * 18)})`;
                roundRect(ctx, patch.x + col * patch.cell, patch.y + row * patch.cell, patch.cell - 2, patch.cell - 2, 4);
                ctx.fill();
            }
        }
        const cx = patch.x + 3.5 * patch.cell - 1;
        const cy = patch.y + 3.5 * patch.cell - 1;
        drawCandidateCircle(ctx, cx, cy, 9, accent, 1, true);
        const parallelAngle = edgeLike ? Math.PI / 2 : Math.PI / 4;
        const perpendicularAngle = parallelAngle + Math.PI / 2;
        arrow(cx, cy, parallelAngle, 106, parallelColor, "parallel");
        arrow(cx, cy, perpendicularAngle, 106, perpendicularColor, "perp");
        const parallelProbe = { x: cx + Math.cos(parallelAngle) * probeOsc * 34, y: cy + Math.sin(parallelAngle) * probeOsc * 34 };
        const perpProbe = { x: cx + Math.cos(perpendicularAngle) * Math.sin(phase * Math.PI * 2 + Math.PI / 2) * 34, y: cy + Math.sin(perpendicularAngle) * Math.sin(phase * Math.PI * 2 + Math.PI / 2) * 34 };
        drawCandidateCircle(ctx, parallelProbe.x, parallelProbe.y, 5.2, parallelColor, .95, true);
        drawCandidateCircle(ctx, perpProbe.x, perpProbe.y, 5.2, perpendicularColor, .95, true);
        ctx.fillStyle = accent;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(state.type, 78, 214);
        ctx.restore();

        drawMotionPanel(ctx, 266, 36, 152, 86, "#2563eb");
        drawMotionPanel(ctx, 266, 146, 152, 86, "#f97316");
        bar(282, 78, "Δ_parallel", state.parallel, parallelColor);
        bar(282, 188, "Δ_perpendicular", state.perpendicular, perpendicularColor);
        drawFlowParticles(ctx, 418, 82, 480, 96, parallelColor, phase, 4);
        drawFlowParticles(ctx, 418, 190, 480, 130, perpendicularColor, (phase + .24) % 1, 4);

        drawMotionPanel(ctx, 482, 52, 144, 150, "#7c3aed");
        ctx.save();
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Hessian / M", 508, 78);
        const vals = edgeLike
            ? [["Dxx", "9.4"], ["Dxy", "0.6"], ["Dxy", "0.6"], ["Dyy", "0.9"]]
            : [["Dxx", "7.3"], ["Dxy", "1.1"], ["Dxy", "1.1"], ["Dyy", "6.8"]];
        vals.forEach(([label, value], index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            const x = 508 + col * 54;
            const y = 96 + row * 38;
            ctx.fillStyle = "rgba(245,243,255,.95)";
            ctx.strokeStyle = "rgba(167,139,250,.7)";
            roundRect(ctx, x, y, 46, 28, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#4c1d95";
            ctx.font = "850 9px sans-serif";
            ctx.fillText(label, x + 6, y + 11);
            ctx.font = "950 12px sans-serif";
            ctx.fillText(value, x + 7, y + 24);
        });
        ctx.restore();

        drawFlowParticles(ctx, 626, 126, 664, 126, "#7c3aed", (phase + .18) % 1, 4);
        drawMotionPanel(ctx, 664, 42, 116, 170, accent);
        ctx.save();
        ctx.fillStyle = accent;
        ctx.font = "950 14px sans-serif";
        ctx.fillText("response ellipse", 678, 68);
        ctx.translate(722, 124);
        ctx.rotate(edgeLike ? -.2 : .18);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, edgeLike ? 42 : 29, edgeLike ? 9 : 25, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(100,116,139,.48)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-50, 0);
        ctx.lineTo(50, 0);
        ctx.moveTo(0, -34);
        ctx.lineTo(0, 34);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#475569";
        ctx.font = "850 11px sans-serif";
        ctx.fillText(edgeLike ? "one strong direction" : "balanced directions", 682, 190);

        drawFlowParticles(ctx, 780, 126, 812, 126, accent, (phase + .36) % 1, 3);
        ctx.save();
        const gate = { x: 806, y: 72, w: 42, h: 116 };
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = `${accent}88`;
        roundRect(ctx, gate.x, gate.y, gate.w, gate.h, 18);
        ctx.fill();
        ctx.stroke();
        const ratio = Math.min(1, state.edgeRatio / Math.max(1, state.threshold * 1.45));
        ctx.fillStyle = edgeLike ? "#fed7aa" : "#bbf7d0";
        roundRect(ctx, gate.x + 13, gate.y + 18 + (78 * (1 - ratio)), 16, Math.max(7, 78 * ratio), 8);
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gate.x + 8, gate.y + 50);
        ctx.lineTo(gate.x + gate.w - 8, gate.y + 50);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(state.decision, gate.x - 4, gate.y + 140);
        ctx.restore();
    }

    function fallbackOrientationVectors() {
        return Array.from({ length: 42 }, (_, index) => {
            const col = index % 7;
            const row = Math.floor(index / 7);
            const dx = col - 3;
            const dy = row - 2.5;
            const angle = Math.atan2(dy, dx) + .55 * Math.sin(index);
            const mag = 4 + ((index * 7) % 13);
            return { dx: Math.cos(angle) * mag, dy: Math.sin(angle) * mag, mag, angle };
        });
    }

    function vectorAngle(vector) {
        if (Number.isFinite(Number(vector.angle))) return Number(vector.angle);
        if (Number.isFinite(Number(vector.orientation))) return Number(vector.orientation);
        return Math.atan2(Number(vector.dy) || 0, Number(vector.dx) || 0);
    }

    function vectorMagnitude(vector) {
        if (Number.isFinite(Number(vector.mag))) return Number(vector.mag);
        return Math.hypot(Number(vector.dx) || 0, Number(vector.dy) || 0);
    }

    function drawWeightedGradientWindow(ctx, x, y, vectors, phase) {
        const cols = 7;
        const rows = 6;
        const cell = 23;
        const cx = x + cols * cell / 2;
        const cy = y + rows * cell / 2;
        ctx.save();
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("weighted gradient patch", x, y - 14);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const px = x + (col + .5) * cell;
                const py = y + (row + .5) * cell;
                const dist = Math.hypot(px - cx, py - cy);
                const weight = Math.exp(-(dist * dist) / 5600);
                ctx.fillStyle = `rgba(124,58,237,${.04 + weight * .11})`;
                ctx.beginPath();
                ctx.arc(px, py, 8.5 * weight, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        vectors.slice(0, cols * rows).forEach((vector, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const px = x + (col + .5) * cell;
            const py = y + (row + .5) * cell;
            const angle = vectorAngle(vector) + phase * .18;
            const mag = Math.min(16, 6 + vectorMagnitude(vector) * .42);
            const active = index === Math.floor(phase * vectors.length) % Math.max(1, vectors.length);
            ctx.strokeStyle = active ? "#f97316" : "#7c3aed";
            ctx.lineWidth = active ? 3 : 1.9;
            ctx.beginPath();
            ctx.moveTo(px - Math.cos(angle) * mag * .45, py - Math.sin(angle) * mag * .45);
            ctx.lineTo(px + Math.cos(angle) * mag * .55, py + Math.sin(angle) * mag * .55);
            ctx.stroke();
            if (active) drawFlowParticles(ctx, px, py, 360, 126, "#7c3aed", phase, 2);
        });
        ctx.restore();
    }

    function drawCircularOrientationHistogram(ctx, cx, cy, values, peak, phase) {
        const bins = values.length ? values : new Array(36).fill(1).map((_, i) => 2 + (i * 7) % 12);
        const max = Math.max(1e-6, ...bins.map(value => Math.abs(Number(value) || 0)));
        ctx.save();
        ctx.strokeStyle = "rgba(37,99,235,.16)";
        ctx.lineWidth = 1.5;
        [34, 58, 82].forEach(radius => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
        });
        bins.forEach((value, index) => {
            const ratio = Math.abs(Number(value) || 0) / max;
            const angle = -Math.PI / 2 + index / bins.length * Math.PI * 2;
            const inner = 34;
            const outer = inner + 48 * ratio;
            const hot = index === peak;
            ctx.strokeStyle = hot ? "#f97316" : "#2563eb";
            ctx.globalAlpha = hot ? .95 : .26 + .44 * ratio;
            ctx.lineWidth = hot ? 4.2 : 2.2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.stroke();
            if (hot) {
                ctx.fillStyle = "#f97316";
                ctx.shadowColor = "#f97316";
                ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(cx + Math.cos(angle) * (outer + 7), cy + Math.sin(angle) * (outer + 7), 6 + 2 * phase, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.strokeStyle = "rgba(147,197,253,.72)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("36", cx, cy - 2);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 10px sans-serif";
        ctx.fillText("bins", cx, cy + 13);
        ctx.restore();
    }

    function drawMainOrientationArrow(ctx, cx, cy, angleDeg, phase) {
        const angle = (Number(angleDeg) || 0) * Math.PI / 180;
        const len = 74;
        ctx.save();
        ctx.strokeStyle = "rgba(249,115,22,.18)";
        ctx.lineWidth = 18;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();
        const tipX = cx + Math.cos(angle) * len;
        const tipY = cy + Math.sin(angle) * len;
        ctx.fillStyle = "#f97316";
        ctx.shadowColor = "#f97316";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 8 + 2 * phase, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("main θ", cx - 42, cy + 92);
        ctx.fillStyle = "#7c2d12";
        ctx.font = "950 15px sans-serif";
        ctx.fillText(`${compactNumber(angleDeg)}°`, cx + 20, cy + 92);
        ctx.restore();
    }

    function drawSiftMotionOrientation(ctx, phase, w, h, data) {
        const values = orientationHistogram(data.vectors);
        const vectors = data.vectors.length ? data.vectors : fallbackOrientationVectors();
        const selected = data.selected;
        const angleDeg = selected ? Number(selected.orientation_deg) : 292.964;
        const peak = selected ? Math.round(angleDeg / 10) % 36 : values.indexOf(Math.max(...values));
        drawWeightedGradientWindow(ctx, 56, 62, vectors, phase);
        drawFlowParticles(ctx, 276, 126, 372, 126, "#7c3aed", phase, 5);
        drawCircularOrientationHistogram(ctx, 470, 126, values, peak, phase);
        drawFlowParticles(ctx, 560, 126, 642, 126, "#f97316", (phase + .18) % 1, 4);
        drawMainOrientationArrow(ctx, 690, 126, angleDeg, phase);
        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("局部梯度按高斯权重投票到 36 个方向 bin，最高峰定义关键点主方向", 100, 224);
        ctx.restore();
    }

    function descriptorValues(data) {
        return data.descriptor128.length
            ? data.descriptor128
            : Array.from({ length: 128 }, (_, index) => (((index * 17) % 31) + 3) / 34);
    }

    function drawDescriptorPatchGrid(ctx, x, y, size, phase) {
        const cell = size / 4;
        const active = Math.min(15, Math.floor(phase * 16));
        ctx.save();
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("oriented 16×16 patch", x, y - 14);
        ctx.translate(x + size / 2, y + size / 2);
        ctx.rotate(-0.32);
        ctx.translate(-size / 2, -size / 2);
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const index = row * 4 + col;
                const on = index <= active;
                const px = col * cell;
                const py = row * cell;
                ctx.fillStyle = on ? "rgba(124,58,237,.18)" : "rgba(255,255,255,.72)";
                ctx.strokeStyle = on ? "#7c3aed" : "rgba(147,197,253,.7)";
                ctx.lineWidth = on ? 2 : 1;
                roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 7);
                ctx.fill();
                ctx.stroke();
                if (on) {
                    const angle = -Math.PI / 2 + ((index * 5) % 16) / 16 * Math.PI * 2;
                    ctx.strokeStyle = index === active ? "#f97316" : "#2563eb";
                    ctx.lineWidth = index === active ? 2.5 : 1.5;
                    ctx.beginPath();
                    ctx.moveTo(px + cell / 2 - Math.cos(angle) * 7, py + cell / 2 - Math.sin(angle) * 7);
                    ctx.lineTo(px + cell / 2 + Math.cos(angle) * 9, py + cell / 2 + Math.sin(angle) * 9);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    function drawCellHistogramBank(ctx, x, y, descriptor, phase) {
        const cell = 34;
        const activeCell = Math.min(15, Math.floor(phase * 16));
        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("4×4 cells × 8 bins", x, y - 14);
        for (let c = 0; c < 16; c++) {
            const col = c % 4;
            const row = Math.floor(c / 4);
            const cx = x + col * cell + cell / 2;
            const cy = y + row * cell + cell / 2;
            const active = c === activeCell;
            ctx.strokeStyle = active ? "#f97316" : "rgba(37,99,235,.36)";
            ctx.fillStyle = active ? "rgba(249,115,22,.08)" : "rgba(255,255,255,.7)";
            ctx.lineWidth = active ? 2.4 : 1;
            roundRect(ctx, x + col * cell + 2, y + row * cell + 2, cell - 4, cell - 4, 9);
            ctx.fill();
            ctx.stroke();
            const values = descriptor.slice(c * 8, c * 8 + 8);
            const max = Math.max(1e-6, ...values.map(value => Math.abs(Number(value) || 0)));
            values.forEach((value, bin) => {
                const ratio = Math.abs(Number(value) || 0) / max;
                const angle = -Math.PI / 2 + bin / 8 * Math.PI * 2;
                ctx.strokeStyle = active ? "#f97316" : "#2563eb";
                ctx.globalAlpha = active ? .85 : .38;
                ctx.lineWidth = active ? 2.2 : 1.4;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * (5 + ratio * 11), cy + Math.sin(angle) * (5 + ratio * 11));
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    function drawDescriptorVectorRibbon(ctx, x, y, w, h, descriptor, phase) {
        const max = Math.max(1e-6, ...descriptor.map(value => Math.abs(Number(value) || 0)));
        const active = Math.min(127, Math.floor(phase * 128));
        ctx.save();
        ctx.fillStyle = "#06b6d4";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("128-D descriptor", x, y - 14);
        ctx.fillStyle = "rgba(255,255,255,.76)";
        ctx.strokeStyle = "rgba(6,182,212,.42)";
        roundRect(ctx, x, y, w, h, 16);
        ctx.fill();
        ctx.stroke();
        const barW = w / 128;
        descriptor.forEach((value, index) => {
            const ratio = Math.abs(Number(value) || 0) / max;
            const barH = Math.max(2, ratio * (h - 30));
            const hot = index <= active;
            ctx.fillStyle = hot ? (index === active ? "#f97316" : "#06b6d4") : "rgba(148,163,184,.38)";
            ctx.globalAlpha = hot ? .92 : .35;
            ctx.fillRect(x + index * barW, y + h - 16 - barH, Math.max(1, barW - .5), barH);
        });
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 3;
        const normT = motionEase(Math.max(0, phase - .54) / .46);
        ctx.beginPath();
        ctx.moveTo(x + 12, y + h + 26);
        ctx.lineTo(x + 12 + (w - 24) * normT, y + h + 26);
        ctx.stroke();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("L2 normalize", x + 16, y + h + 48);
        ctx.restore();
    }

    function drawSiftMotionDescriptor(ctx, phase, w, h, data) {
        const descriptor = descriptorValues(data);
        drawDescriptorPatchGrid(ctx, 54, 78, 112, phase);
        drawFlowParticles(ctx, 178, 136, 270, 136, "#7c3aed", phase, 5);
        drawCellHistogramBank(ctx, 288, 72, descriptor, phase);
        drawFlowParticles(ctx, 432, 136, 522, 136, "#06b6d4", (phase + .18) % 1, 5);
        drawDescriptorVectorRibbon(ctx, 538, 76, 220, 108, descriptor, phase);
        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("16×16 邻域分成 4×4 cell，每个 cell 投票 8 个方向，拼接并归一化为 128 维向量", 74, 226);
        ctx.restore();
    }

    function drawPatchTiles(ctx, x, y, cols, rows, size, phase, color) {
        ctx.save();
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const value = (Math.sin(row * 1.7 + col * 1.13 + phase * Math.PI * 2) + 1) / 2;
                ctx.fillStyle = `rgba(37,99,235,${0.06 + value * 0.18})`;
                ctx.strokeStyle = "rgba(147,197,253,.75)";
                ctx.fillRect(x + col * size, y + row * size, size - 1, size - 1);
                ctx.strokeRect(x + col * size, y + row * size, size - 1, size - 1);
            }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, cols * size + 1, rows * size + 1);
        ctx.restore();
    }

    function drawBoxLobes(ctx, x, y, scale, color, phase) {
        const boxes = [
            [-2, -0.5, 1, 1, "rgba(14,165,233,.28)"],
            [-1, -0.5, 2, 1, "rgba(249,115,22,.28)"],
            [1, -0.5, 1, 1, "rgba(14,165,233,.28)"],
            [-0.5, -2, 1, 1, "rgba(14,165,233,.16)"],
            [-0.5, -1, 1, 2, "rgba(249,115,22,.22)"],
            [-0.5, 1, 1, 1, "rgba(14,165,233,.16)"]
        ];
        ctx.save();
        boxes.forEach(([bx, by, bw, bh, fill], index) => {
            ctx.fillStyle = fill;
            ctx.strokeStyle = index === Math.floor(phase * boxes.length) ? "#f97316" : color;
            ctx.lineWidth = index === Math.floor(phase * boxes.length) ? 2.4 : 1.2;
            roundRect(ctx, x + bx * scale, y + by * scale, bw * scale, bh * scale, 7);
            ctx.fill();
            ctx.stroke();
        });
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawBitStrip(ctx, x, y, bits, phase, color) {
        ctx.save();
        const active = Math.floor(phase * bits);
        for (let i = 0; i < bits; i++) {
            ctx.fillStyle = i <= active ? (i % 3 ? color : "#f97316") : "rgba(203,213,225,.72)";
            roundRect(ctx, x + i * 13, y, 9, 28, 3);
            ctx.fill();
        }
        ctx.fillStyle = "#475569";
        ctx.font = "900 13px sans-serif";
        ctx.fillText(`${bits} visible bits / 256`, x, y + 48);
        ctx.restore();
    }

    function drawBriefPairs(ctx, cx, cy, phase, rotated) {
        ctx.save();
        ctx.strokeStyle = "rgba(37,99,235,.18)";
        ctx.lineWidth = 1;
        for (let r = 22; r <= 66; r += 22) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        const base = rotated ? phase * Math.PI * 2 : 0;
        for (let i = 0; i < 22; i++) {
            const a = base + i * 2.399;
            const b = base + i * 1.317 + 1.1;
            const r1 = 18 + (i % 5) * 7;
            const r2 = 24 + ((i * 3) % 6) * 6;
            const ax = cx + Math.cos(a) * r1;
            const ay = cy + Math.sin(a) * r1;
            const bx = cx + Math.cos(b) * r2;
            const by = cy + Math.sin(b) * r2;
            const hot = i === Math.floor(phase * 22);
            ctx.strokeStyle = hot ? "#f97316" : (i % 2 ? "rgba(37,99,235,.55)" : "rgba(14,165,233,.45)");
            ctx.lineWidth = hot ? 2.8 : 1.2;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.fillStyle = hot ? "#f97316" : "#2563eb";
            ctx.beginPath();
            ctx.arc(ax, ay, hot ? 4 : 2.5, 0, Math.PI * 2);
            ctx.arc(bx, by, hot ? 4 : 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = rotated ? "#16a34a" : "#eab308";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(base) * 58, cy + Math.sin(base) * 58);
        ctx.stroke();
        ctx.fillStyle = rotated ? "#16a34a" : "#eab308";
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawBriefPairSamplingMotion(ctx, phase, data) {
        const active = Math.floor(phase * 18) % 18;
        const pairA = { x: 328 + Math.cos(active * 2.14) * (20 + active % 5 * 8), y: 126 + Math.sin(active * 2.14) * (18 + active % 4 * 9) };
        const pairB = { x: 328 + Math.cos(active * 1.37 + 1.2) * (28 + active % 6 * 6), y: 126 + Math.sin(active * 1.37 + 1.2) * (24 + active % 5 * 7) };
        const valueA = 88 + (active * 17) % 120;
        const valueB = 76 + (active * 29) % 132;
        const bit = valueA < valueB ? 1 : 0;

        ctx.save();
        ctx.fillStyle = "#eab308";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("FAST corner", 54, 62);
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.fillText(data ? `${data.keypoints} corners` : "corner", 54, 82);
        drawPatchTiles(ctx, 54, 102, 5, 4, 22, phase, "#eab308");
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(108, 146, 23 + 4 * Math.sin(phase * Math.PI * 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(108, 146, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        drawFlowParticles(ctx, 178, 136, 238, 136, "#eab308", phase, 4);

        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("fixed sampling pairs", 246, 52);
        ctx.strokeStyle = "rgba(37,99,235,.16)";
        ctx.lineWidth = 1.2;
        for (let r = 26; r <= 78; r += 26) {
            ctx.beginPath();
            ctx.arc(328, 126, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.strokeStyle = "rgba(147,197,253,.48)";
        roundRect(ctx, 250, 62, 156, 132, 18);
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 36; i++) {
            const a = i * 2.399;
            const r = 18 + (i % 7) * 8;
            const px = 328 + Math.cos(a) * r;
            const py = 126 + Math.sin(a) * r;
            ctx.fillStyle = i % 2 ? "rgba(37,99,235,.7)" : "rgba(14,165,233,.65)";
            ctx.beginPath();
            ctx.arc(px, py, 2.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(pairA.x, pairA.y);
        ctx.lineTo(pairB.x, pairB.y);
        ctx.stroke();
        [["a", pairA, "#0ea5e9"], ["b", pairB, "#f97316"]].forEach(([label, point, color]) => {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#0f172a";
            ctx.font = "950 12px sans-serif";
            ctx.fillText(label, point.x + 8, point.y - 7);
        });
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("no rotation", 292, 212);
        ctx.restore();

        drawFlowParticles(ctx, 414, 136, 494, 136, "#2563eb", (phase + .14) % 1, 5);

        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("compare", 516, 72);
        const rows = [
            ["I(a)", valueA, "#0ea5e9"],
            ["I(b)", valueB, "#f97316"]
        ];
        rows.forEach(([label, value, color], index) => {
            const y = 94 + index * 38;
            ctx.fillStyle = `${color}1f`;
            roundRect(ctx, 518, y, 128, 14, 7);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, 518, y, 128 * (value / 220), 14, 7);
            ctx.fill();
            ctx.fillStyle = "#334155";
            ctx.font = "950 12px sans-serif";
            ctx.fillText(label, 518, y + 31);
            ctx.textAlign = "right";
            ctx.fillText(String(value), 646, y + 31);
            ctx.textAlign = "left";
        });
        ctx.fillStyle = bit ? "#16a34a" : "#f97316";
        ctx.font = "950 20px sans-serif";
        ctx.fillText(valueA < valueB ? "I(a) < I(b)" : "I(a) ≥ I(b)", 518, 184);
        ctx.restore();

        drawFlowParticles(ctx, 654, 136, 710, 136, bit ? "#16a34a" : "#f97316", (phase + .3) % 1, 4);

        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("write bit", 724, 72);
        for (let i = 0; i < 18; i++) {
            const on = i <= active;
            ctx.fillStyle = on ? (i === active ? "#f97316" : i % 2 ? "#2563eb" : "#16a34a") : "rgba(203,213,225,.55)";
            roundRect(ctx, 724 + (i % 9) * 13, 96 + Math.floor(i / 9) * 36, 9, 28, 3);
            ctx.fill();
        }
        ctx.fillStyle = "#334155";
        ctx.font = "950 13px sans-serif";
        ctx.fillText(`bit = ${bit}`, 724, 184);
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("256 comparisons", 724, 204);
        ctx.restore();
    }

    function drawBriefDescriptorMatchMotion(ctx, phase) {
        const write = Math.floor(phase * 32) % 32;
        const scan = Math.floor(phase * 24) % 24;
        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("256 comparisons", 56, 62);
        for (let i = 0; i < 24; i++) {
            const x = 58 + (i % 8) * 14;
            const y = 88 + Math.floor(i / 8) * 28;
            const on = i <= scan;
            ctx.strokeStyle = on ? "#2563eb" : "rgba(147,197,253,.62)";
            ctx.lineWidth = on ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 10, y - 6 + (i % 3) * 6);
            ctx.stroke();
            ctx.fillStyle = on ? (i % 2 ? "#f97316" : "#2563eb") : "#cbd5e1";
            ctx.beginPath();
            ctx.arc(x, y, on ? 3.3 : 2.2, 0, Math.PI * 2);
            ctx.arc(x + 10, y - 6 + (i % 3) * 6, on ? 3.3 : 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("each pair writes one bit", 56, 196);
        ctx.restore();

        drawFlowParticles(ctx, 188, 126, 246, 126, "#2563eb", phase, 4);

        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("descriptor A", 264, 64);
        ctx.fillStyle = "#7c3aed";
        ctx.fillText("descriptor B", 264, 118);
        for (let i = 0; i < 32; i++) {
            const x = 266 + i * 10;
            const aBit = (i * 7 + 3) % 5 > 1;
            const bBit = (i * 11 + 1) % 6 > 2;
            const on = i <= write;
            ctx.fillStyle = on ? (aBit ? "#2563eb" : "#cbd5e1") : "rgba(203,213,225,.35)";
            roundRect(ctx, x, 78, 7, 26, 3);
            ctx.fill();
            ctx.fillStyle = on ? (bBit ? "#7c3aed" : "#cbd5e1") : "rgba(203,213,225,.35)";
            roundRect(ctx, x, 132, 7, 26, 3);
            ctx.fill();
            if (on && aBit !== bBit) {
                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 1.7;
                ctx.beginPath();
                ctx.moveTo(x + 3.5, 108);
                ctx.lineTo(x + 3.5, 128);
                ctx.stroke();
            }
        }
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("visible window of 256 bits", 264, 196);
        ctx.restore();

        drawFlowParticles(ctx, 596, 126, 648, 126, "#f97316", (phase + .2) % 1, 4);

        ctx.save();
        ctx.fillStyle = "#f97316";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("XOR", 666, 64);
        let diffCount = 0;
        for (let i = 0; i < 24; i++) {
            const aBit = (i * 7 + 3) % 5 > 1;
            const bBit = (i * 11 + 1) % 6 > 2;
            const diff = aBit !== bBit;
            if (diff && i <= scan) diffCount += 1;
            const x = 668 + (i % 12) * 12;
            const y = 84 + Math.floor(i / 12) * 28;
            ctx.fillStyle = i <= scan ? (diff ? "#f97316" : "#cbd5e1") : "rgba(203,213,225,.35)";
            roundRect(ctx, x, y, 8, 20, 3);
            ctx.fill();
        }
        ctx.strokeStyle = "rgba(249,115,22,.45)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(730, 148, 32 + 8 * phase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("popcount", 666, 180);
        ctx.fillStyle = "#0f172a";
        ctx.font = "950 22px sans-serif";
        ctx.fillText(`d = ${diffCount}`, 756, 180);
        ctx.restore();
    }

    function drawFastCircleTest(ctx, cx, cy, phase, color = "#eab308", rotated = false) {
        ctx.save();
        const radius = 58;
        const active = Math.floor(phase * 16) % 16;
        const start = rotated ? 3 : 1;
        ctx.strokeStyle = "rgba(37,99,235,.18)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 16; i++) {
            const angle = -Math.PI / 2 + i / 16 * Math.PI * 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            const inArc = ((i - start + 16) % 16) < 9;
            const similar = i % 5 === 0;
            const fill = similar ? "#cbd5e1" : (inArc ? color : "#7c3aed");
            ctx.fillStyle = i === active ? "#f97316" : fill;
            ctx.shadowColor = i === active ? "#f97316" : fill;
            ctx.shadowBlur = i === active ? 16 : 5;
            ctx.beginPath();
            ctx.arc(x, y, i === active ? 7 : 4.5, 0, Math.PI * 2);
            ctx.fill();
            if (i === active) {
                ctx.fillStyle = "#1e293b";
                ctx.font = "900 11px sans-serif";
                ctx.fillText(String(i), x + 8, y - 8);
            }
        }
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 10, -Math.PI / 2 + start / 16 * Math.PI * 2, -Math.PI / 2 + (start + 9) / 16 * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawNmsCloud(ctx, x, y, phase, color) {
        ctx.save();
        for (let i = 0; i < 36; i++) {
            const px = x + (i % 9) * 24 + Math.sin(i) * 5;
            const py = y + Math.floor(i / 9) * 22 + Math.cos(i * 1.7) * 5;
            const keep = i === 12 || i === 25 || i === 31;
            const fade = keep ? 1 : Math.max(0.16, 1 - phase * 1.35);
            ctx.globalAlpha = fade;
            ctx.strokeStyle = keep ? color : "#94a3b8";
            ctx.lineWidth = keep ? 2.5 : 1.4;
            ctx.beginPath();
            ctx.arc(px, py, keep ? 6 : 4, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const ripple = 16 + phase * 65;
        ctx.strokeStyle = `${color}88`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 4 * 24, y + 22, ripple, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawFastScanSweep(ctx, x, y, phase, color, label) {
        const cols = 6;
        const rows = 5;
        const cell = 21;
        const active = Math.floor(phase * cols * rows) % (cols * rows);
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 16px sans-serif";
        ctx.fillText(label, x, y - 16);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col;
                const value = (Math.sin(row * 1.5 + col * 1.1) + 1) / 2;
                ctx.fillStyle = `rgba(37,99,235,${.06 + value * .2})`;
                ctx.strokeStyle = "rgba(147,197,253,.62)";
                roundRect(ctx, x + col * cell, y + row * cell, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.stroke();
                if (index === active) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.4;
                    roundRect(ctx, x + col * cell - 2, y + row * cell - 2, cell + 2, cell + 2, 7);
                    ctx.stroke();
                }
            }
        }
        const cx = x + (active % cols) * cell + cell / 2;
        const cy = y + Math.floor(active / cols) * cell + cell / 2;
        ctx.fillStyle = "#0f172a";
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("slide center pixel", x + 4, y + rows * cell + 24);
        ctx.restore();
    }

    function drawFastDecisionRing(ctx, cx, cy, phase, color) {
        const radius = 58;
        const active = Math.floor(phase * 16) % 16;
        const start = 1;
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("16-point circle test", cx, cy - 84);
        ctx.textAlign = "left";
        ctx.strokeStyle = "rgba(37,99,235,.18)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("Ip", cx + 15, cy + 5);

        for (let i = 0; i < 16; i++) {
            const angle = -Math.PI / 2 + i / 16 * Math.PI * 2;
            const px = cx + Math.cos(angle) * radius;
            const py = cy + Math.sin(angle) * radius;
            const contiguous = ((i - start + 16) % 16) < 9;
            const dim = i % 5 === 0;
            const fill = dim ? "#cbd5e1" : contiguous ? color : "#7c3aed";
            ctx.fillStyle = i === active ? "#f97316" : fill;
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = i === active || contiguous ? 12 : 4;
            ctx.beginPath();
            ctx.arc(px, py, i === active ? 7 : contiguous ? 5.4 : 4.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 10, -Math.PI / 2 + start / 16 * Math.PI * 2, -Math.PI / 2 + (start + 9) / 16 * Math.PI * 2);
        ctx.stroke();

        const bars = [
            ["+T", color, .8],
            ["-T", "#7c3aed", .46],
            ["~", "#cbd5e1", .25]
        ];
        bars.forEach(([label, barColor, level], index) => {
            const bx = cx + 96;
            const by = cy - 34 + index * 19;
            ctx.fillStyle = "#334155";
            ctx.font = "950 12px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(label, bx - 8, by + 9);
            ctx.fillStyle = `${barColor}24`;
            roundRect(ctx, bx, by, 64, 9, 5);
            ctx.fill();
            ctx.fillStyle = barColor;
            roundRect(ctx, bx, by, 64 * level * motionEase(phase), 9, 5);
            ctx.fill();
        });
        ctx.textAlign = "left";
        ctx.fillStyle = "#475569";
        ctx.font = "900 11px sans-serif";
        ctx.fillText("threshold gate", cx + 96, cy + 45);
        ctx.fillStyle = "#7c2d12";
        ctx.font = "950 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("9 continuous pass", cx, cy + 82);
        ctx.textAlign = "left";
        ctx.restore();
    }

    function drawFastNmsCompetition(ctx, x, y, phase, color, label) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 16px sans-serif";
        ctx.fillText(label, x, y - 16);
        const winner = 14;
        for (let i = 0; i < 35; i++) {
            const px = x + (i % 7) * 23 + Math.sin(i * 1.7) * 3;
            const py = y + Math.floor(i / 7) * 20 + Math.cos(i * 1.1) * 3;
            const strong = i === winner || i === 25 || i === 31;
            const active = i === Math.floor(phase * 35) % 35;
            const score = strong ? 1 : .25 + ((i * 7) % 8) / 14;
            ctx.globalAlpha = i === winner ? 1 : active ? .9 : .28 + score * .35;
            ctx.strokeStyle = i === winner ? color : active ? "#f97316" : "#94a3b8";
            ctx.lineWidth = i === winner ? 3 : active ? 2.2 : 1.2;
            ctx.beginPath();
            ctx.arc(px, py, i === winner ? 7 : active ? 5.2 : 3.8, 0, Math.PI * 2);
            ctx.stroke();
            if (strong) {
                ctx.fillStyle = `${color}22`;
                ctx.beginPath();
                ctx.arc(px, py, 12 * score, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        const wx = x + (winner % 7) * 23 + Math.sin(winner * 1.7) * 3;
        const wy = y + Math.floor(winner / 7) * 20 + Math.cos(winner * 1.1) * 3;
        ctx.strokeStyle = `${color}78`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(wx, wy, 30 + 14 * phase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#166534";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("keep local max", x + 26, y + 126);
        ctx.restore();
    }

    function drawOrbResponseRank(ctx, x, y, phase, color) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 15px sans-serif";
        ctx.fillText("response rank", x, y - 12);
        for (let i = 0; i < 7; i++) {
            const h = 18 + ((i * 17) % 42);
            const active = i === Math.floor(phase * 7) % 7;
            ctx.fillStyle = active ? "#f97316" : `${color}${i < 3 ? "cc" : "55"}`;
            ctx.shadowColor = active ? "#f97316" : color;
            ctx.shadowBlur = active ? 12 : 0;
            roundRect(ctx, x + i * 15, y + 58 - h, 10, h, 5);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `${color}88`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 66);
        ctx.lineTo(x + 104, y + 66);
        ctx.stroke();
        ctx.fillStyle = "#166534";
        ctx.font = "900 11px sans-serif";
        ctx.fillText("top scores survive", x, y + 84);
        ctx.restore();
    }

    function drawFastDetectorMotion(ctx, phase, color, data, mode = "brief") {
        const name = mode === "orb" ? "FAST detector" : "scan window";
        const nmsLabel = mode === "orb" ? "rank by response" : "NMS candidates";
        drawFastScanSweep(ctx, 54, 76, phase, color, name);
        drawFlowParticles(ctx, 190, 126, 270, 126, color, phase, 5);
        drawFastDecisionRing(ctx, 360, 126, phase, color);
        if (mode === "orb") {
            drawFlowParticles(ctx, 542, 126, 576, 126, "#f97316", (phase + .16) % 1, 4);
            drawOrbResponseRank(ctx, 590, 94, phase, color);
            drawFlowParticles(ctx, 694, 126, 714, 126, color, (phase + .32) % 1, 3);
            drawFastNmsCompetition(ctx, 718, 80, phase, color, "NMS");
        } else {
            drawFlowParticles(ctx, 542, 126, 638, 126, "#f97316", (phase + .16) % 1, 5);
            drawFastNmsCompetition(ctx, 666, 80, phase, color, nmsLabel);
        }
    }

    function drawIntegralGrid(ctx, x, y, phase) {
        ctx.save();
        const size = 20;
        const active = Math.floor(phase * 30);
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 6; col++) {
                const index = row * 6 + col;
                const value = 20 + row * 8 + col * 6;
                const done = index <= active;
                ctx.fillStyle = done ? `rgba(37,99,235,${0.12 + index / 90})` : "rgba(255,255,255,.9)";
                ctx.strokeStyle = done ? "#60a5fa" : "#dbeafe";
                ctx.fillRect(x + col * size, y + row * size, size - 1, size - 1);
                ctx.strokeRect(x + col * size, y + row * size, size - 1, size - 1);
                if (done && index % 5 === 0) {
                    ctx.fillStyle = "#1d4ed8";
                    ctx.font = "800 8px sans-serif";
                    ctx.fillText(String(value), x + col * size + 4, y + row * size + 13);
                }
            }
        }
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2.4;
        ctx.strokeRect(x + 2 * size, y + size, 3 * size, 3 * size);
        [["A", 2, 1], ["B", 5, 1], ["C", 2, 4], ["D", 5, 4]].forEach(([label, col, row]) => {
            ctx.fillStyle = "#f97316";
            ctx.beginPath();
            ctx.arc(x + col * size, y + row * size, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#7c2d12";
            ctx.font = "900 11px sans-serif";
            ctx.fillText(label, x + col * size + 6, y + row * size - 4);
        });
        ctx.restore();
    }

    function drawSurfGrayAccumulation(ctx, x, y, phase) {
        const cols = 6;
        const rows = 5;
        const cell = 19;
        const active = Math.min(cols * rows - 1, Math.floor(phase * cols * rows));
        ctx.save();
        ctx.fillStyle = "#0ea5e9";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Gray patch", x, y - 14);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col;
                const value = (Math.sin(row * 1.4 + col * .9) + 1) / 2;
                const done = index <= active;
                ctx.fillStyle = `rgba(14,165,233,${done ? .14 + value * .3 : .06})`;
                ctx.strokeStyle = done ? "#0ea5e9" : "rgba(147,197,253,.55)";
                ctx.lineWidth = index === active ? 2.3 : 1;
                roundRect(ctx, x + col * cell, y + row * cell, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.stroke();
            }
        }
        const rowY = y + Math.floor(active / cols) * cell + cell / 2;
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 6, rowY);
        ctx.lineTo(x + cols * cell + 6, rowY);
        ctx.stroke();
        ctx.fillStyle = "#475569";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("scan rows → prefix sum", x, y + rows * cell + 20);
        ctx.restore();
    }

    function drawSurfIntegralSurface(ctx, x, y, phase) {
        const cols = 6;
        const rows = 5;
        const cell = 22;
        const active = Math.min(cols * rows - 1, Math.floor(phase * cols * rows));
        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Integral surface", x, y - 14);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col;
                const done = index <= active;
                const height = 4 + row * 4 + col * 3;
                const px = x + col * cell;
                const py = y + row * cell - (done ? height * .22 : 0);
                ctx.fillStyle = done ? `rgba(37,99,235,${.12 + index / 90})` : "rgba(255,255,255,.72)";
                ctx.strokeStyle = done ? "#60a5fa" : "#dbeafe";
                ctx.lineWidth = index === active ? 2 : 1;
                roundRect(ctx, px, py, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.stroke();
                if (done && index % 7 === 0) {
                    ctx.fillStyle = "#1d4ed8";
                    ctx.font = "800 8px sans-serif";
                    ctx.fillText(String(20 + row * 8 + col * 6), px + 4, py + 14);
                }
            }
        }
        ctx.restore();
    }

    function drawSurfRectSum(ctx, x, y, phase) {
        const cell = 25;
        const rect = { col: 1, row: 1, w: 4, h: 3 };
        ctx.save();
        ctx.fillStyle = "#f97316";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Rect sum in O(1)", x, y - 16);
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 6; col++) {
                const inside = col >= rect.col && col < rect.col + rect.w && row >= rect.row && row < rect.row + rect.h;
                ctx.fillStyle = inside ? "rgba(249,115,22,.14)" : "rgba(255,255,255,.66)";
                ctx.strokeStyle = inside ? "rgba(249,115,22,.45)" : "rgba(191,219,254,.55)";
                roundRect(ctx, x + col * cell, y + row * cell, cell - 2, cell - 2, 6);
                ctx.fill();
                ctx.stroke();
            }
        }
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        roundRect(ctx, x + rect.col * cell, y + rect.row * cell, rect.w * cell - 2, rect.h * cell - 2, 8);
        const corners = [
            ["A", rect.col, rect.row, "#2563eb"],
            ["B", rect.col + rect.w, rect.row, "#ef4444"],
            ["C", rect.col, rect.row + rect.h, "#ef4444"],
            ["D", rect.col + rect.w, rect.row + rect.h, "#16a34a"]
        ];
        corners.forEach(([label, col, row, color], index) => {
            const pulse = 1 + .18 * Math.sin(phase * Math.PI * 2 + index);
            const cx = x + col * cell;
            const cy = y + row * cell;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy, 6 * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#0f172a";
            ctx.font = "950 12px sans-serif";
            ctx.fillText(label, cx + 8, cy - 6);
        });
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("D - B - C + A", x + 24, y + 150);
        ctx.fillStyle = "#166534";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("box filter reads 4 corners", x + 24, y + 171);
        ctx.restore();
    }

    function drawSurfIntegralAccess(ctx, x, y, phase) {
        const cols = 6;
        const rows = 5;
        const cell = 19;
        const active = Math.floor(phase * 12) % 12;
        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("Integral image", x, y - 14);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const px = x + col * cell;
                const py = y + row * cell;
                const hot = (row + col * 2) % 12 === active;
                ctx.fillStyle = hot ? "rgba(249,115,22,.2)" : `rgba(37,99,235,${.07 + (row + col) / 70})`;
                ctx.strokeStyle = hot ? "#f97316" : "rgba(147,197,253,.55)";
                ctx.lineWidth = hot ? 2 : 1;
                roundRect(ctx, px, py, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.stroke();
                if (hot) {
                    ctx.fillStyle = "#ea580c";
                    ctx.font = "900 9px sans-serif";
                    ctx.fillText(String(20 + row * 8 + col * 5), px + 4, py + 13);
                }
            }
        }
        const t = motionEase(phase);
        ctx.strokeStyle = "rgba(249,115,22,.72)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + rows * cell + 15);
        ctx.lineTo(x + 10 + 92 * t, y + rows * cell + 15);
        ctx.stroke();
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("4 corner reads / box", x, y + rows * cell + 34);
        ctx.restore();
    }

    function drawSurfHessianKernel(ctx, cx, cy, label, color, phase, kind) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, cx, cy - 48);
        const scale = 15;
        const lobes = kind === "xy"
            ? [[-1, -1, 1, 1, "#0ea5e944"], [0, -1, 1, 1, "#f9731648"], [-1, 0, 1, 1, "#f9731648"], [0, 0, 1, 1, "#0ea5e944"]]
            : kind === "yy"
                ? [[-1, -2, 2, 1, "#0ea5e936"], [-1, -1, 2, 2, "#f9731644"], [-1, 1, 2, 1, "#0ea5e936"]]
                : [[-2, -1, 1, 2, "#0ea5e936"], [-1, -1, 2, 2, "#f9731644"], [1, -1, 1, 2, "#0ea5e936"]];
        lobes.forEach(([lx, ly, lw, lh, fill], index) => {
            const active = index === Math.floor(phase * lobes.length) % lobes.length;
            ctx.fillStyle = fill;
            ctx.strokeStyle = active ? "#f97316" : color;
            ctx.lineWidth = active ? 2.4 : 1.4;
            roundRect(ctx, cx + lx * scale, cy + ly * scale, lw * scale, lh * scale, 6);
            ctx.fill();
            ctx.stroke();
        });
        ctx.fillStyle = "rgba(255,255,255,.86)";
        ctx.strokeStyle = `${color}80`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, cx - 40, cy + 32, 80, 24, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "950 12px sans-serif";
        ctx.fillText(`${label} sum`, cx, cy + 49);
        ctx.restore();
    }

    function drawSurfDetMixer(ctx, x, y, phase) {
        ctx.save();
        ctx.fillStyle = "rgba(255,247,237,.82)";
        ctx.strokeStyle = "rgba(249,115,22,.58)";
        ctx.lineWidth = 1.8;
        roundRect(ctx, x, y, 150, 88, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("det(H)", x + 18, y + 28);
        ctx.fillStyle = "#7c2d12";
        ctx.font = "950 12px sans-serif";
        ctx.fillText("Dxx × Dyy - 0.81Dxy²", x + 18, y + 52);
        const t = motionEase(phase);
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 70);
        ctx.lineTo(x + 18 + 112 * t, y + 70);
        ctx.stroke();
        ctx.restore();
    }

    function drawSurfPeakField(ctx, x, y, phase) {
        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("local max", x, y - 14);
        const gap = 19;
        for (let i = 0; i < 42; i++) {
            const px = x + (i % 7) * gap + Math.sin(i * 1.7) * 3;
            const py = y + Math.floor(i / 7) * gap + Math.cos(i * 1.2) * 3;
            const strong = i === 17 || i === 31 || i === 38;
            const active = i === Math.floor(phase * 42) % 42;
            ctx.strokeStyle = strong ? "#16a34a" : active ? "#f97316" : "rgba(148,163,184,.55)";
            ctx.lineWidth = strong ? 2.6 : active ? 2.2 : 1.1;
            ctx.globalAlpha = strong ? .95 : active ? .82 : .36;
            ctx.beginPath();
            ctx.arc(px, py, strong ? 6 : active ? 5 : 3.2, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(22,163,74,.45)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x + 3 * gap, y + 2 * gap, 34 + 7 * phase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawSurfHessianWires(ctx, phase) {
        const t = motionEase(phase);
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(37,99,235,.34)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(160, 112);
        ctx.lineTo(238, 112);
        ctx.lineTo(278, 76);
        ctx.moveTo(238, 112);
        ctx.lineTo(278, 154);
        ctx.moveTo(238, 112);
        ctx.lineTo(390, 116);
        ctx.stroke();

        ctx.strokeStyle = "rgba(249,115,22,.36)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(308, 132);
        ctx.bezierCurveTo(382, 132, 458, 78, 536, 92);
        ctx.moveTo(308, 210);
        ctx.bezierCurveTo(382, 198, 454, 156, 536, 128);
        ctx.moveTo(420, 172);
        ctx.bezierCurveTo(466, 166, 500, 138, 536, 120);
        ctx.stroke();

        for (let i = 0; i < 5; i++) {
            const p = (phase + i / 5) % 1;
            const x = 166 + (354 * p);
            const y = 112 + Math.sin(p * Math.PI * 2) * 6;
            ctx.globalAlpha = .22 + .7 * Math.sin(p * Math.PI);
            ctx.fillStyle = i % 2 ? "#2563eb" : "#f97316";
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(x, y, 3.5 + 1.5 * t, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#f97316";
        ctx.beginPath();
        ctx.arc(536, 112, 5.5 + 2 * Math.sin(phase * Math.PI), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawHaarCompass(ctx, cx, cy, phase, color = "#0ea5e9") {
        ctx.save();
        for (let i = 0; i < 16; i++) {
            const angle = i / 16 * Math.PI * 2;
            const len = 18 + ((i * 5) % 7) * 4;
            const hot = i === Math.floor(phase * 16);
            ctx.strokeStyle = hot ? "#f97316" : `${color}99`;
            ctx.lineWidth = hot ? 3.4 : 1.7;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * 20, cy + Math.sin(angle) * 20);
            ctx.lineTo(cx + Math.cos(angle) * (20 + len), cy + Math.sin(angle) * (20 + len));
            ctx.stroke();
        }
        const sumAngle = -0.7 + phase * 0.5;
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(sumAngle) * 78, cy + Math.sin(sumAngle) * 78);
        ctx.stroke();
        ctx.fillStyle = "#16a34a";
        ctx.beginPath();
        ctx.arc(cx + Math.cos(sumAngle) * 78, cy + Math.sin(sumAngle) * 78, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawSurfKeypointSeed(ctx, x, y, data, phase) {
        const cell = 18;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.strokeStyle = "rgba(14,165,233,.24)";
        ctx.lineWidth = 1.2;
        roundRect(ctx, x, y, 128, 116, 14);
        ctx.fill();
        ctx.stroke();
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const v = (Math.sin(row * 1.1 + col * 1.7) + 1) / 2;
                ctx.fillStyle = `rgba(14,165,233,${.07 + v * .18})`;
                roundRect(ctx, x + 18 + col * cell, y + 18 + row * cell, cell - 2, cell - 2, 4);
                ctx.fill();
            }
        }
        const pulse = 1 + .18 * Math.sin(phase * Math.PI * 2);
        const cx = x + 62;
        const cy = y + 62;
        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 20 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#0ea5e9";
        ctx.shadowColor = "#0ea5e9";
        ctx.shadowBlur = 13;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0ea5e9";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("SURF point", x + 14, y - 12);
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.fillText(data ? `${data.keypoints} pts` : "keypoint", x + 14, y + 132);
        ctx.restore();
    }

    function drawSurfHaarSectorWindow(ctx, cx, cy, phase) {
        const sector = Math.PI / 3;
        const angle = -1.15 + phase * Math.PI * 2;
        const samples = [];
        for (let ring = 1; ring <= 4; ring++) {
            const count = 6 + ring * 3;
            for (let i = 0; i < count; i++) {
                const a = i / count * Math.PI * 2 + ring * .23;
                const r = 16 + ring * 15 + ((i * 7) % 5);
                samples.push({ a, r, amp: .45 + ((i * 11 + ring * 3) % 9) / 12 });
            }
        }
        ctx.save();
        ctx.fillStyle = "#0ea5e9";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("Haar wavelets", cx - 70, cy - 88);

        ctx.fillStyle = "rgba(14,165,233,.07)";
        ctx.strokeStyle = "rgba(14,165,233,.3)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 78, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(37,99,235,.12)";
        for (let r = 24; r <= 72; r += 24) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = "rgba(249,115,22,.16)";
        ctx.strokeStyle = "rgba(249,115,22,.62)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 78, angle - sector / 2, angle + sector / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        samples.forEach((sample, index) => {
            const diff = Math.atan2(Math.sin(sample.a - angle), Math.cos(sample.a - angle));
            const inside = Math.abs(diff) < sector / 2;
            const sx = cx + Math.cos(sample.a) * sample.r;
            const sy = cy + Math.sin(sample.a) * sample.r;
            const dir = sample.a + Math.PI / 2 + Math.sin(index) * .45;
            const len = 10 + sample.amp * 12;
            ctx.strokeStyle = inside ? "#f97316" : "rgba(14,165,233,.48)";
            ctx.lineWidth = inside ? 2.6 : 1.6;
            ctx.globalAlpha = inside ? .96 : .54;
            ctx.beginPath();
            ctx.moveTo(sx - Math.cos(dir) * len * .35, sy - Math.sin(dir) * len * .35);
            ctx.lineTo(sx + Math.cos(dir) * len * .65, sy + Math.sin(dir) * len * .65);
            ctx.stroke();
            ctx.fillStyle = inside ? "#f97316" : "#60a5fa";
            ctx.beginPath();
            ctx.arc(sx, sy, inside ? 3.3 : 2.4, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * 84, cy + Math.sin(angle) * 84);
        ctx.stroke();
        ctx.fillStyle = "#7c2d12";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("60° sector sum", cx - 58, cy + 103);
        ctx.restore();
    }

    function drawSurfSectorAccumulator(ctx, cx, cy, phase) {
        const mainAngle = -0.58;
        const sweep = -1.15 + phase * Math.PI * 2;
        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("vector sum", cx - 46, cy - 82);
        ctx.strokeStyle = "rgba(22,163,74,.22)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 64, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 18; i++) {
            const a = i / 18 * Math.PI * 2;
            const len = 18 + ((i * 7) % 16);
            const hot = Math.abs(Math.atan2(Math.sin(a - sweep), Math.cos(a - sweep))) < .35;
            ctx.strokeStyle = hot ? "#f97316" : "rgba(14,165,233,.45)";
            ctx.lineWidth = hot ? 3 : 1.6;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
            ctx.lineTo(cx + Math.cos(a) * (22 + len), cy + Math.sin(a) * (22 + len));
            ctx.stroke();
        }
        ctx.strokeStyle = "rgba(249,115,22,.55)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 52, sweep - .35, sweep + .35);
        ctx.stroke();
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(mainAngle) * 82, cy + Math.sin(mainAngle) * 82);
        ctx.stroke();
        ctx.fillStyle = "#16a34a";
        ctx.shadowColor = "#16a34a";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(mainAngle) * 82, cy + Math.sin(mainAngle) * 82, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#166534";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("max Σ(dx,dy)", cx - 42, cy + 92);
        ctx.restore();
    }

    function drawSurfOrientationOutput(ctx, x, y, phase) {
        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 18px sans-serif";
        ctx.fillText("main θ", x, y);
        ctx.fillStyle = "#334155";
        ctx.font = "900 13px sans-serif";
        ctx.fillText("atan2(Σdy, Σdx)", x, y + 24);
        const cx = x + 58;
        const cy = y + 74;
        const angle = -0.58;
        ctx.strokeStyle = "rgba(124,58,237,.28)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + .08 * Math.sin(phase * Math.PI * 2));
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-34, 0);
        ctx.lineTo(34, 0);
        ctx.moveTo(0, -34);
        ctx.lineTo(0, 34);
        ctx.stroke();
        ctx.fillStyle = "rgba(124,58,237,.13)";
        roundRect(ctx, -28, -28, 56, 56, 8);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("rotate frame", x + 8, y + 132);
        ctx.restore();
    }

    function drawSurfHaarOrientationWires(ctx, phase) {
        ctx.save();
        drawFlowParticles(ctx, 184, 126, 248, 126, "#0ea5e9", phase, 4);
        drawFlowParticles(ctx, 436, 126, 492, 126, "#f97316", (phase + .14) % 1, 4);
        drawFlowParticles(ctx, 626, 126, 682, 126, "#16a34a", (phase + .3) % 1, 3);
        ctx.restore();
    }

    function drawSurfDescriptorPatch(ctx, x, y, phase) {
        const size = 128;
        const cell = size / 4;
        const active = Math.floor(phase * 16) % 16;
        ctx.save();
        ctx.fillStyle = "#0ea5e9";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("aligned patch", x, y - 16);
        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        ctx.rotate(-0.32 + .04 * Math.sin(phase * Math.PI * 2));
        ctx.fillStyle = "rgba(255,255,255,.58)";
        ctx.strokeStyle = "rgba(14,165,233,.34)";
        ctx.lineWidth = 1.3;
        roundRect(ctx, -size / 2, -size / 2, size, size, 12);
        ctx.fill();
        ctx.stroke();
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const index = row * 4 + col;
                const hot = index === active;
                const px = -size / 2 + col * cell;
                const py = -size / 2 + row * cell;
                const tone = (Math.sin(index * 1.8) + 1) / 2;
                ctx.fillStyle = hot ? "rgba(249,115,22,.2)" : `rgba(14,165,233,${.07 + tone * .16})`;
                ctx.strokeStyle = hot ? "#f97316" : "rgba(147,197,253,.58)";
                ctx.lineWidth = hot ? 2.3 : 1;
                roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 7);
                ctx.fill();
                ctx.stroke();
                for (let k = 0; k < 3; k++) {
                    const yy = py + 10 + k * 8;
                    ctx.strokeStyle = hot ? (k % 2 ? "#0ea5e9" : "#f97316") : "rgba(96,165,250,.42)";
                    ctx.lineWidth = hot ? 2 : 1.2;
                    ctx.beginPath();
                    ctx.moveTo(px + 8, yy);
                    ctx.lineTo(px + cell - 10, yy - 5 + k * 3);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
        const activeCol = active % 4;
        const activeRow = Math.floor(active / 4);
        const ax = x + 16 + activeCol * cell + cell / 2;
        const ay = y + 2 + activeRow * cell + cell / 2;
        ctx.fillStyle = "#f97316";
        ctx.shadowColor = "#f97316";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("4×4 spatial cells", x + 6, y + size + 26);
        ctx.restore();
    }

    function drawSurfDescriptorStats(ctx, x, y, phase) {
        const labels = ["dx", "dy", "|dx|", "|dy|"];
        const colors = ["#0ea5e9", "#2563eb", "#f97316", "#16a34a"];
        const active = Math.floor(phase * 16) % 16;
        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("cell statistics", x, y - 18);
        labels.forEach((label, index) => {
            const cx = x + index * 48;
            ctx.strokeStyle = `${colors[index]}66`;
            ctx.lineWidth = 1.4;
            roundRect(ctx, cx, y, 34, 106, 15);
            ctx.stroke();
            const fillH = 22 + ((active * 5 + index * 13) % 58);
            ctx.fillStyle = `${colors[index]}26`;
            roundRect(ctx, cx + 5, y + 96 - fillH, 24, fillH, 11);
            ctx.fill();
            ctx.fillStyle = colors[index];
            ctx.globalAlpha = .88;
            roundRect(ctx, cx + 9, y + 96 - fillH, 16, Math.max(10, fillH * motionEase(phase)), 8);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#334155";
            ctx.font = "950 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(label, cx + 17, y + 126);
        });
        ctx.textAlign = "left";
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText(`cell ${String(active + 1).padStart(2, "0")} writes 4 values`, x + 4, y + 148);
        ctx.restore();
    }

    function drawSurfDescriptorVector(ctx, x, y, phase) {
        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("16 × 4 = 64 float", x, y - 16);
        const write = Math.floor(phase * 64) % 64;
        for (let group = 0; group < 16; group++) {
            const gx = x + (group % 8) * 24;
            const gy = y + Math.floor(group / 8) * 48;
            for (let k = 0; k < 4; k++) {
                const index = group * 4 + k;
                const on = index <= write || group < Math.floor(write / 4);
                const h = 7 + ((group * 5 + k * 9) % 18);
                const color = ["#0ea5e9", "#2563eb", "#f97316", "#16a34a"][k];
                ctx.fillStyle = on ? color : "#cbd5e1";
                ctx.globalAlpha = on ? .88 : .28;
                roundRect(ctx, gx + k * 5, gy + 30 - h, 4, h, 3);
                ctx.fill();
            }
            if (group === Math.floor(write / 4)) {
                ctx.globalAlpha = 1;
                ctx.strokeStyle = "#f97316";
                ctx.lineWidth = 2;
                roundRect(ctx, gx - 4, gy + 3, 28, 32, 8);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        const t = motionEase(phase);
        ctx.strokeStyle = "rgba(22,163,74,.78)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + 118);
        ctx.lineTo(x + 188 * t, y + 118);
        ctx.stroke();
        ctx.fillStyle = "#166534";
        ctx.font = "950 12px sans-serif";
        ctx.fillText("L2 normalize", x, y + 140);
        ctx.restore();
    }

    function drawSurfMotion(ctx, phase, w, h, data, step) {
        if (step?.key === "integral") {
            drawSurfGrayAccumulation(ctx, 46, 62, phase);
            drawFlowParticles(ctx, 178, 122, 286, 122, "#0ea5e9", phase, 5);
            drawSurfIntegralSurface(ctx, 306, 62, phase);
            drawFlowParticles(ctx, 448, 122, 548, 122, "#f97316", (phase + .18) % 1, 5);
            drawSurfRectSum(ctx, 572, 62, phase);
        } else if (step?.key === "hessian") {
            drawSurfHessianWires(ctx, phase);
            drawSurfIntegralAccess(ctx, 42, 58, phase);
            drawSurfHessianKernel(ctx, 308, 76, "Dxx", "#0ea5e9", phase, "xx");
            drawSurfHessianKernel(ctx, 420, 116, "Dxy", "#7c3aed", phase, "xy");
            drawSurfHessianKernel(ctx, 308, 154, "Dyy", "#0ea5e9", phase, "yy");
            drawSurfDetMixer(ctx, 546, 58, phase);
            drawFlowParticles(ctx, 696, 146, 726, 146, "#16a34a", (phase + .32) % 1, 3);
            drawSurfPeakField(ctx, 732, 88, phase);
        } else if (step?.key === "orientation") {
            drawSurfHaarOrientationWires(ctx, phase);
            drawSurfKeypointSeed(ctx, 52, 72, data, phase);
            drawSurfHaarSectorWindow(ctx, 342, 126, phase);
            drawSurfSectorAccumulator(ctx, 556, 126, phase);
            drawSurfOrientationOutput(ctx, 704, 82, phase);
        } else {
            drawSurfDescriptorPatch(ctx, 70, 64, phase);
            drawFlowParticles(ctx, 210, 126, 288, 126, "#0ea5e9", phase, 5);
            drawSurfDescriptorStats(ctx, 314, 62, phase);
            drawFlowParticles(ctx, 514, 126, 594, 126, "#2563eb", (phase + .18) % 1, 5);
            drawSurfDescriptorVector(ctx, 620, 72, phase);
        }
    }

    function drawBriefMotion(ctx, phase, w, h, data, step) {
        if (step?.key === "fast") {
            drawFastDetectorMotion(ctx, phase, "#eab308", data, "brief");
        } else if (step?.key === "pairs") {
            drawBriefPairSamplingMotion(ctx, phase, data);
        } else {
            drawBriefDescriptorMatchMotion(ctx, phase);
        }
    }

    function drawOrbCentroidOrientationMotion(ctx, phase) {
        const patchX = 58;
        const patchY = 78;
        const cell = 18;
        const center = { x: patchX + cell * 3, y: patchY + cell * 2.5 };
        const angle = -0.64 + .08 * Math.sin(phase * Math.PI * 2);
        const centroid = {
            x: center.x + Math.cos(angle) * 82,
            y: center.y + Math.sin(angle) * 46
        };

        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("gray moment patch", patchX, 58);
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 6; col++) {
                const value = .2 + ((Math.sin(row * 1.2 + col * 1.9) + 1) / 2) * .5;
                const hot = (row + col * 2) % 7 === Math.floor(phase * 7);
                ctx.fillStyle = hot ? "rgba(249,115,22,.22)" : `rgba(22,163,74,${.06 + value * .2})`;
                ctx.strokeStyle = hot ? "#f97316" : "rgba(147,197,253,.58)";
                ctx.lineWidth = hot ? 2 : 1;
                roundRect(ctx, patchX + col * cell, patchY + row * cell, cell - 2, cell - 2, 4);
                ctx.fill();
                ctx.stroke();
                if ((row + col) % 2 === 0) {
                    const px = patchX + col * cell + cell / 2;
                    const py = patchY + row * cell + cell / 2;
                    ctx.strokeStyle = "rgba(22,163,74,.16)";
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(centroid.x, centroid.y);
                    ctx.stroke();
                }
            }
        }
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#16a34a";
        ctx.shadowColor = "#16a34a";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(centroid.x, centroid.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(centroid.x, centroid.y);
        ctx.stroke();
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("keypoint", center.x - 28, center.y + 22);
        ctx.fillStyle = "#166534";
        ctx.fillText("centroid", centroid.x + 10, centroid.y - 10);
        ctx.restore();

        drawFlowParticles(ctx, 224, 126, 288, 126, "#16a34a", phase, 4);

        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("m10 / m01", 306, 66);
        [["m10", "#16a34a", .78], ["m01", "#0ea5e9", .52]].forEach(([label, color, value], index) => {
            const y = 92 + index * 42;
            ctx.fillStyle = `${color}20`;
            roundRect(ctx, 306, y, 138, 14, 7);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, 306, y, 138 * value * motionEase(phase), 14, 7);
            ctx.fill();
            ctx.fillStyle = "#334155";
            ctx.font = "950 12px sans-serif";
            ctx.fillText(label, 306, y + 32);
        });
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("weighted pixel offsets", 306, 188);
        ctx.restore();

        drawFlowParticles(ctx, 454, 126, 520, 126, "#16a34a", (phase + .18) % 1, 4);

        ctx.save();
        const dial = { x: 574, y: 126 };
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("θ = atan2(m01,m10)", 508, 66);
        ctx.strokeStyle = "rgba(22,163,74,.24)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dial.x, dial.y, 54, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2;
            ctx.strokeStyle = "rgba(14,165,233,.32)";
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(dial.x + Math.cos(a) * 42, dial.y + Math.sin(a) * 42);
            ctx.lineTo(dial.x + Math.cos(a) * 54, dial.y + Math.sin(a) * 54);
            ctx.stroke();
        }
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(dial.x, dial.y);
        ctx.lineTo(dial.x + Math.cos(angle) * 68, dial.y + Math.sin(angle) * 68);
        ctx.stroke();
        ctx.fillStyle = "#16a34a";
        ctx.beginPath();
        ctx.arc(dial.x + Math.cos(angle) * 68, dial.y + Math.sin(angle) * 68, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#166534";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("main direction", 526, 202);
        ctx.restore();

        drawFlowParticles(ctx, 650, 126, 704, 126, "#7c3aed", (phase + .32) % 1, 3);

        ctx.save();
        const frame = { x: 756, y: 126 };
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("rotate BRIEF frame", 690, 66);
        ctx.save();
        ctx.translate(frame.x, frame.y);
        ctx.rotate(angle);
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-46, 0);
        ctx.lineTo(46, 0);
        ctx.moveTo(0, -40);
        ctx.lineTo(0, 40);
        ctx.stroke();
        ctx.fillStyle = "rgba(124,58,237,.12)";
        roundRect(ctx, -34, -34, 68, 68, 9);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("pairs follow θ", 714, 202);
        ctx.restore();
    }

    function drawOrbRotatedBriefMotion(ctx, phase) {
        const angle = -0.62 + .08 * Math.sin(phase * Math.PI * 2);
        const active = Math.floor(phase * 18) % 18;
        ctx.save();
        ctx.fillStyle = "#7c3aed";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("θ-aligned frame", 54, 64);
        const frame = { x: 116, y: 134 };
        ctx.save();
        ctx.translate(frame.x, frame.y);
        ctx.rotate(angle);
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-48, 0);
        ctx.lineTo(48, 0);
        ctx.moveTo(0, -42);
        ctx.lineTo(0, 42);
        ctx.stroke();
        ctx.fillStyle = "rgba(124,58,237,.1)";
        roundRect(ctx, -38, -38, 76, 76, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(124,58,237,.38)";
        ctx.lineWidth = 1.2;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(-38, i * 19);
            ctx.lineTo(38, i * 19);
            ctx.moveTo(i * 19, -38);
            ctx.lineTo(i * 19, 38);
            ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("local axes rotate by θ", 62, 206);
        ctx.restore();

        drawFlowParticles(ctx, 190, 134, 250, 134, "#7c3aed", phase, 4);

        ctx.save();
        const cx = 336;
        const cy = 132;
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("Rθ sampling pairs", 258, 62);
        ctx.fillStyle = "rgba(255,255,255,.5)";
        ctx.strokeStyle = "rgba(147,197,253,.5)";
        roundRect(ctx, 252, 74, 168, 132, 18);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.strokeStyle = "rgba(37,99,235,.16)";
        ctx.lineWidth = 1.2;
        for (let r = 24; r <= 66; r += 21) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < 28; i++) {
            const a = i * 2.399;
            const b = i * 1.317 + 1.1;
            const r1 = 18 + (i % 5) * 8;
            const r2 = 24 + ((i * 3) % 6) * 6;
            const ax = Math.cos(a) * r1;
            const ay = Math.sin(a) * r1;
            const bx = Math.cos(b) * r2;
            const by = Math.sin(b) * r2;
            const hot = i === active;
            ctx.strokeStyle = hot ? "#f97316" : (i % 2 ? "rgba(37,99,235,.55)" : "rgba(22,163,74,.48)");
            ctx.lineWidth = hot ? 3 : 1.2;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.fillStyle = hot ? "#f97316" : "#2563eb";
            ctx.beginPath();
            ctx.arc(ax, ay, hot ? 4.5 : 2.4, 0, Math.PI * 2);
            ctx.arc(bx, by, hot ? 4.5 : 2.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(0) * 62, Math.sin(0) * 62);
        ctx.stroke();
        ctx.fillStyle = "#16a34a";
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("pattern follows main direction", 266, 224);
        ctx.restore();

        drawFlowParticles(ctx, 430, 134, 502, 134, "#16a34a", (phase + .16) % 1, 4);

        ctx.save();
        const valueA = 82 + (active * 23) % 128;
        const valueB = 76 + (active * 31) % 136;
        const bit = valueA < valueB ? 1 : 0;
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("rotated compare", 520, 74);
        [["I(Rθa)", valueA, "#0ea5e9"], ["I(Rθb)", valueB, "#f97316"]].forEach(([label, value, color], index) => {
            const y = 96 + index * 38;
            ctx.fillStyle = `${color}20`;
            roundRect(ctx, 520, y, 136, 14, 7);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, 520, y, 136 * (value / 220), 14, 7);
            ctx.fill();
            ctx.fillStyle = "#334155";
            ctx.font = "950 12px sans-serif";
            ctx.fillText(label, 520, y + 31);
        });
        ctx.fillStyle = bit ? "#16a34a" : "#f97316";
        ctx.font = "950 19px sans-serif";
        ctx.fillText(bit ? "bit = 1" : "bit = 0", 520, 184);
        ctx.restore();

        drawFlowParticles(ctx, 664, 134, 710, 134, bit ? "#16a34a" : "#f97316", (phase + .3) % 1, 3);

        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("ORB bits", 728, 74);
        for (let i = 0; i < 24; i++) {
            const on = i <= active + 5;
            const x = 728 + (i % 12) * 10;
            const y = 94 + Math.floor(i / 12) * 38;
            ctx.fillStyle = on ? (i === active ? "#f97316" : i % 3 ? "#16a34a" : "#2563eb") : "rgba(203,213,225,.5)";
            roundRect(ctx, x, y, 7, 28, 3);
            ctx.fill();
        }
        ctx.fillStyle = "#475569";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("256 bit · Hamming", 728, 186);
        ctx.restore();
    }

    function drawOrbMotion(ctx, phase, w, h, data, step) {
        if (step?.key === "fast") {
            drawFastDetectorMotion(ctx, phase, "#16a34a", data, "orb");
        } else if (step?.key === "orientation") {
            drawOrbCentroidOrientationMotion(ctx, phase);
        } else {
            drawOrbRotatedBriefMotion(ctx, phase);
        }
    }

    function drawAnalogMotion(ctx, phase, w, h) {
        const algorithm = selectedAlgorithm();
        const data = analogData.get(algorithm);
        const step = currentSteps()[currentStep] || {};
        if (algorithm === "surf") {
            drawSurfMotion(ctx, phase, w, h, data, step);
        } else if (algorithm === "orb-lite") {
            drawOrbMotion(ctx, phase, w, h, data, step);
        } else {
            drawBriefMotion(ctx, phase, w, h, data, step);
        }
    }

    function drawSiftMotionFrame() {
        const canvas = V.$("siftMotionCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.width || 860;
        const h = canvas.height || 260;
        const phase = siftMotion.progress % 1;
        const algorithm = selectedAlgorithm();
        const data = motionProbeData();
        drawMotionBackground(ctx, w, h);
        if (algorithm !== "sift") {
            drawAnalogMotion(ctx, phase, w, h);
        } else if (currentStep === 0) {
            drawSiftMotionPreprocess(ctx, phase, w, h, data);
        } else if (currentStep === 1) {
            drawSiftMotionGaussian(ctx, phase, w, h, data);
        } else if (currentStep === 2) {
            drawSiftMotionDog(ctx, phase, w, h, data);
        } else if (currentStep === 3) {
            drawSiftMotionExtrema(ctx, phase, w, h, data);
        } else if (currentStep === 4) {
            drawSiftMotionFilter(ctx, phase, w, h, data);
        } else if (currentStep === 5) {
            drawSiftMotionOrientation(ctx, phase, w, h, data);
        } else {
            drawSiftMotionDescriptor(ctx, phase, w, h, data);
        }
    }

    function renderSiftMotionProbe() {
        const title = V.$("siftMotionTitle");
        const action = V.$("siftMotionAction");
        const frame = V.$("siftMotionFrame");
        const step = currentSteps()[currentStep] || currentSteps()[0];
        const info = algorithmInfo[selectedAlgorithm()] || algorithmInfo.sift;
        if (title) title.textContent = `${info.name} · ${step.title} 动态探针`;
        if (action) action.textContent = motionLabels(selectedAlgorithm(), currentStep)[Math.floor(siftMotion.progress * 3) % 3] || "计算中";
        if (frame) frame.textContent = String(currentStep + 1).padStart(2, "0");
        renderSiftMotionSteps();
        renderSiftMotionMetrics();
        drawSiftMotionFrame();
    }

    function startSiftMotion() {
        if (siftMotion.raf) return;
        const tick = time => {
            if (!siftMotion.lastTime) siftMotion.lastTime = time;
            const delta = Math.min(80, time - siftMotion.lastTime);
            siftMotion.lastTime = time;
            if (siftMotion.playing) {
                const duration = selectedAlgorithm() === "sift" && currentStep === 4 ? 6200 : 3600;
                siftMotion.progress = (siftMotion.progress + delta / duration) % 1;
                renderSiftMotionProbe();
                if (scaleData) {
                    if (selectedAlgorithm() === "sift" && (currentStep >= 1 && currentStep <= 6)) {
                        drawSiftStepCanvas(V.$("siftStepCanvas"), currentStep, { animationPhase: siftMotion.progress });
                    } else if (selectedAlgorithm() !== "sift") {
                        drawAnalogStepMain(V.$("siftStepCanvas"), currentStep, { animationPhase: siftMotion.progress });
                    }
                }
            }
            siftMotion.raf = requestAnimationFrame(tick);
        };
        siftMotion.raf = requestAnimationFrame(tick);
    }

    async function loadDescriptor() {
        if (descriptorData) return descriptorData;
        if (descriptorPromise) return descriptorPromise;

        const requestGeneration = generation;
        setDescriptorStatus("正在加载主方向与 128 维描述子数据...", "loading");
        descriptorFlag.value = "true";
        const request = V.postForm(form, "/api/feature-detect");
        descriptorFlag.value = "false";

        descriptorPromise = request.then(async data => {
            if (requestGeneration !== generation) return null;
            await renderDescriptor(data);
            return data;
        }).catch(error => {
            if (requestGeneration === generation) {
                setDescriptorStatus(error.message || "描述子数据加载失败。", "error");
            }
            return null;
        }).finally(() => {
            if (requestGeneration === generation) descriptorPromise = null;
        });
        return descriptorPromise;
    }

    function selectStep(step) {
        const algorithm = selectedAlgorithm();
        const steps = currentSteps();
        currentStep = Math.max(0, Math.min(steps.length - 1, Number(step) || 0));
        siftMotion.progress = 0;
        if (currentStep !== 5 || algorithm !== "sift") orientationLayout = null;
        syncAlgorithmControls();
        renderStepNav();
        stepPanels.forEach(panel => {
            const panelKey = steps[currentStep]?.panel || "analog";
            panel.hidden = panel.dataset.siftPanel !== panelKey;
        });
        renderCurrentStepView();
        if (algorithm === "sift") {
            if (currentStep >= 5) loadDescriptor();
            else if (scaleData) V.$("siftElapsed").textContent = `${scaleData.meta.elapsed_ms} ms · 基础数据`;
        } else {
            renderSelectedAlgorithmStep();
            if (scaleData) V.$("siftElapsed").textContent = `${algorithmInfo[algorithm].name} · ${scaleData.meta.width} × ${scaleData.meta.height}`;
        }
    }

    stepNav?.addEventListener("click", event => {
        const button = event.target.closest("[data-sift-step]");
        if (!button) return;
        selectStep(button.dataset.siftStep);
    });

    V.$("siftStepCanvas")?.addEventListener("click", event => {
        if (selectedAlgorithm() !== "sift" || currentStep !== 5 || !orientationLayout?.points?.length) return;
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) * canvas.width / Math.max(1, bounds.width);
        const y = (event.clientY - bounds.top) * canvas.height / Math.max(1, bounds.height);
        let best = null;
        orientationLayout.points.forEach(item => {
            const distance = Math.hypot(item.x - x, item.y - y);
            if (!best || distance < best.distance) best = { ...item, distance };
        });
        if (!best || best.distance > 26) return;
        orientationDemoIndex = best.index;
        siftMotion.progress = 0;
        renderNotes(currentStep);
        renderSiftMotionProbe();
        drawSiftStepCanvas(canvas, currentStep, { animationPhase: 0 });
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const requestGeneration = ++generation;
        descriptorData = null;
        descriptorPromise = null;
        orientationDemoIndex = 0;
        orientationLayout = null;
        setDescriptorStatus("进入第 5 或第 6 步后加载描述子数据。", "");
        descriptorFlag.value = "false";

        const button = form.querySelector("button[type=submit]");
        if (button) button.textContent = "计算中...";
        V.$("siftElapsed").textContent = "基础数据计算中...";
        try {
            const data = await V.postForm(form, "/api/feature-detect");
            if (requestGeneration !== generation) return;
            await renderScale(data);
            if (selectedAlgorithm() === "sift") {
                await loadDescriptor();
            } else {
                selectStep(currentStep);
            }
        } catch (error) {
            if (requestGeneration === generation) {
                V.$("siftElapsed").textContent = error.message || "计算失败";
            }
        } finally {
            if (requestGeneration === generation && button) button.textContent = "重新计算";
        }
    });

    V.$("siftAnalogMethod")?.addEventListener("change", async event => {
        selectedAnalogMethod = event.target.value || "sift";
        currentStep = 0;
        siftMotion.progress = 0;
        selectStep(0);
    });

    document.querySelectorAll("[data-sift-motion]").forEach(button => {
        button.addEventListener("click", () => {
            const action = button.dataset.siftMotion;
            if (action === "toggle") {
                siftMotion.playing = !siftMotion.playing;
                button.textContent = siftMotion.playing ? "暂停" : "播放";
            } else if (action === "restart") {
                siftMotion.progress = 0;
                siftMotion.playing = true;
                const toggle = document.querySelector('[data-sift-motion="toggle"]');
                if (toggle) toggle.textContent = "暂停";
                renderSiftMotionProbe();
            }
        });
    });

    V.bindAutoSubmit(form, { excludeIds: ["siftAnalogMethod"] });
    renderStepNav();
    selectStep(0);
    startSiftMotion();
    form.requestSubmit();
})();
