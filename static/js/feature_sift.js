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
            primary: ["灰度化", "将彩色输入转换为单通道强度图，为后续高斯平滑和梯度计算提供统一输入。"],
            secondary: ["统一尺寸", "按最大边长约束计算尺寸，保证不同方法在同一尺度下对照。"],
            boundary: "本步骤关注输入图、灰度图和后续尺度空间的统一基础。",
            panel: "0"
        }, {
            title: "Gaussian Pyramid",
            primary: ["Octave", "每进入下一组，图像宽高下采样为上一组的一半，覆盖更大的特征尺度。"],
            secondary: ["尺度层", "同一 octave 内逐层增加高斯 σ，得到连续的尺度空间表示。"],
            boundary: "观察同一图像在不同 σ 与 octave 下的平滑变化。",
            panel: "1"
        }, {
            title: "DoG Pyramid",
            primary: ["Difference of Gaussian", "同一 octave 内相邻高斯层相减，近似尺度归一化 LoG 响应。"],
            secondary: ["尺度响应", "亮暗区域表示不同符号和幅值的 DoG 响应，用于寻找稳定尺度极值。"],
            boundary: "DoG 响应用于突出跨尺度稳定结构。",
            panel: "2"
        }, {
            title: "3×3×3 极值检测与过滤",
            primary: ["26 邻域比较", "候选点同时与当前层 8 个邻居及上下尺度层各 9 个邻居比较。"],
            secondary: ["候选过滤", "依次剔除低对比度响应、边缘响应，再保留稳定的最终关键点。"],
            boundary: "本步骤对比原始极值、边缘过滤后点和最终关键点。",
            panel: "3"
        }, {
            title: "主方向分配",
            primary: ["36-bin 方向直方图", "在关键点尺度对应的邻域内统计梯度方向，直方图主峰确定关键点主方向。"],
            secondary: ["旋转不变性", "后续局部坐标和梯度方向都相对主方向旋转，降低图像旋转的影响。"],
            boundary: "方向分配让关键点在旋转图像中保持更稳定的描述。",
            panel: "4"
        }, {
            title: "128 维描述子",
            primary: ["4×4×8", "16×16 邻域划分为 4×4 个 cell，每个 cell 统计 8 个方向，组成 128 维向量。"],
            secondary: ["归一化", "描述子经 L2 归一化与幅值截断，减弱整体亮度和局部强梯度的影响。"],
            boundary: "128 维向量用于后续 L2 距离匹配和 ratio test。",
            panel: "5"
        }],
        surf: [
            { title: "积分图", primary: ["Integral Image", "把矩形区域求和转化为四次数组访问，为盒式滤波提供快速基础。"], secondary: ["尺度近似", "SURF 用盒式滤波近似二阶高斯导数。"], boundary: "本步骤展示积分图思想与响应计算入口。", key: "integral", panel: "analog" },
            { title: "Hessian 近似", primary: ["det(H)", "通过 Dxx、Dyy、Dxy 的盒式响应估计 Hessian 行列式，选出稳定候选点。"], secondary: ["NMS", "保留局部范围内响应更强的点。"], boundary: "Hessian 响应强调局部结构的二维变化。", key: "hessian", panel: "analog" },
            { title: "Haar 小波方向", primary: ["方向估计", "在关键点邻域计算 Haar X/Y 响应，并用主响应方向归一化局部坐标。"], secondary: ["旋转稳定", "方向箭头表示该关键点的主方向。"], boundary: "方向用于后续 64 维描述子坐标对齐。", key: "orientation", panel: "analog" },
            { title: "64 维描述子", primary: ["4×4×4", "每个 cell 统计 dx、dy、|dx|、|dy|，组成 64 维浮点向量。"], secondary: ["L2 匹配", "SURF 描述子使用浮点距离进行匹配。"], boundary: "维度低于 SIFT，便于和 128 维描述子对照。", key: "descriptor", panel: "analog" }
        ],
        "fast-brief": [
            { title: "FAST 关键点", primary: ["圆周连续检测", "用半径 3 的 16 点圆周判断中心像素是否为角点。"], secondary: ["NMS", "根据响应分数保留局部最强角点。"], boundary: "FAST 负责给 BRIEF 提供关键点位置。", key: "fast", panel: "analog" },
            { title: "BRIEF 采样对", primary: ["固定点对", "在关键点邻域使用固定 256 对采样点进行灰度比较。"], secondary: ["局部 Patch", "采样点对围绕关键点分布，描述局部纹理差异。"], boundary: "BRIEF 不估计方向，旋转鲁棒性较弱。", key: "pairs", panel: "analog" },
            { title: "256 bit 描述子", primary: ["二进制向量", "每个灰度比较产生 1 bit，256 对比较组成 256 bit 描述子。"], secondary: ["Hamming", "二进制描述子使用汉明距离匹配。"], boundary: "速度快，适合说明二进制描述子的设计。", key: "descriptor", panel: "analog" }
        ],
        "orb-lite": [
            { title: "FAST 关键点", primary: ["关键点检测", "沿用 FAST 圆周连续检测和 NMS 得到候选角点。"], secondary: ["响应排序", "优先保留局部响应更强的点。"], boundary: "ORB-lite 从 FAST 角点开始。", key: "fast", panel: "analog" },
            { title: "灰度矩方向", primary: ["Intensity Centroid", "用关键点邻域的灰度矩估计主方向。"], secondary: ["方向箭头", "绿色箭头表示局部灰度质心方向。"], boundary: "方向估计让 BRIEF 采样坐标可旋转。", key: "orientation", panel: "analog" },
            { title: "旋转 BRIEF", primary: ["Rotated BRIEF", "把固定采样点对按主方向旋转后再比较灰度。"], secondary: ["旋转稳定", "降低图像旋转对二进制描述子的影响。"], boundary: "ORB-lite 使用 Hamming 距离进行匹配。", key: "descriptor", panel: "analog" }
        ]
    };

    let currentStep = 0;
    let generation = 0;
    let scaleData = null;
    let descriptorData = null;
    let descriptorPromise = null;
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

    async function drawAlgorithmStepCanvas(canvas, src, data, step) {
        const result = await V.drawBaseImage(canvas, src, "#f8fbff");
        if (!result) return;
        const ctx = result.ctx;
        const points = data.points || [];
        const selected = points[0] || { x: canvas.width / 2, y: canvas.height / 2, orientation: 0 };

        if (data.algorithm === "surf" && step.key === "integral") {
            ctx.fillStyle = "rgba(37,99,235,.08)";
            const cell = Math.max(24, Math.round(Math.min(canvas.width, canvas.height) / 10));
            for (let y = 0; y < canvas.height; y += cell) {
                for (let x = 0; x < canvas.width; x += cell) {
                    ctx.fillStyle = `rgba(37,99,235,${0.03 + 0.16 * ((x / cell + y / cell) % 6) / 6})`;
                    ctx.fillRect(x, y, cell, cell);
                }
            }
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 2;
            ctx.strokeRect(selected.x - 36, selected.y - 28, 72, 56);
            return;
        }

        if (data.algorithm === "fast-brief" && step.key === "pairs") {
            V.drawDiamond(ctx, selected.x, selected.y, "#eab308", 7);
            for (let index = 0; index < 36; index++) {
                const a = index * 2.399;
                const b = index * 1.317 + 0.8;
                const r1 = 4 + (index % 9) * 1.3;
                const r2 = 6 + ((index * 5) % 11) * 1.1;
                ctx.strokeStyle = index % 2 ? "rgba(37,99,235,.48)" : "rgba(234,179,8,.52)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(selected.x + Math.cos(a) * r1, selected.y + Math.sin(a) * r1);
                ctx.lineTo(selected.x + Math.cos(b) * r2, selected.y + Math.sin(b) * r2);
                ctx.stroke();
            }
            return;
        }

        if (step.key === "descriptor") {
            await drawAnalogCanvas(canvas, src, data.algorithm, points);
            const bits = data.descriptorType === "binary" ? 32 : 16;
            const width = Math.min(canvas.width - 32, 420);
            const x0 = (canvas.width - width) / 2;
            const y0 = canvas.height - 34;
            for (let index = 0; index < bits; index++) {
                ctx.fillStyle = data.descriptorType === "binary"
                    ? (index % 3 ? "#2563eb" : "#facc15")
                    : `rgba(14,165,233,${0.25 + 0.7 * ((index * 7) % 16) / 16})`;
                ctx.fillRect(x0 + index * width / bits, y0, Math.max(2, width / bits - 2), 18);
            }
            return;
        }

        if (data.algorithm === "orb-lite" && step.key === "orientation") {
            points.slice(0, 260).forEach(point => {
                V.drawDiamond(ctx, point.x, point.y, "#22c55e", 4);
                ctx.strokeStyle = "#16a34a";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(point.x + Math.cos(point.orientation || 0) * 13, point.y + Math.sin(point.orientation || 0) * 13);
                ctx.stroke();
            });
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
            details.innerHTML = [
                `<article class="feature-analog-card"><div class="feature-analog-head"><h3>${step.primary[0]}</h3><span>Step ${currentStep + 1}</span></div><p>${step.primary[1]}</p></article>`,
                `<article class="feature-analog-card"><div class="feature-analog-head"><h3>${step.secondary[0]}</h3><span>${data.descriptorDim}</span></div><p>${step.secondary[1]}</p></article>`
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
                    formula: "D(x,y,\\sigma) \\gtrless N_{26},\\quad R_{edge}<T_e",
                    details: ["每个点和 3×3×3 的 26 个邻居比较。", "低对比度点和边缘响应点会被过滤。"]
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

    function noteValues(algorithm, step) {
        const meta = scaleData?.meta || {};
        const sift = (descriptorData || scaleData)?.sift || scaleData?.sift || {};
        const counts = sift.counts || {};
        const field = name => form.elements[name]?.value || "-";
        if (algorithm === "sift") {
            const selected = descriptorData?.sift?.selected;
            const oriented = descriptorData?.sift?.oriented_keypoints || descriptorData?.sift?.extended_points || [];
            return [
                [
                    ["图像尺寸", meta.width && meta.height ? `${meta.width} × ${meta.height}` : "-"],
                    ["输入文件", meta.filename || "-"],
                    ["处理通道", "RGB → Gray"]
                ],
                [
                    ["Octave", (scaleData?.pyramid?.gaussian || []).length],
                    ["每组尺度", field("sift_scales")],
                    ["初始 σ", field("sift_sigma")]
                ],
                [
                    ["DoG 组数", (scaleData?.pyramid?.dog || []).length],
                    ["原始极值", counts.raw_extrema || 0],
                    ["DoG 阈值", field("contrast_threshold")]
                ],
                [
                    ["原始极值", counts.raw_extrema || 0],
                    ["边缘过滤后", counts.edge_survivors || 0],
                    ["最终关键点", counts.kept || sift.count || 0]
                ],
                [
                    ["方向关键点", oriented.length || "懒加载"],
                    ["方向 bins", 36],
                    ["当前方向", selected ? `${compactNumber(selected.orientation_deg)}°` : "-"]
                ],
                [
                    ["描述子类型", "float"],
                    ["描述子维度", "128"],
                    ["距离类型", "L2"],
                    ["当前响应", selected ? compactNumber(selected.response) : "-"]
                ]
            ][step] || [];
        }
        const data = analogData.get(algorithm);
        if (!data) return [["状态", "等待基础数据"]];
        const common = [
            ["keypoints", data.keypoints],
            ["descriptor", data.descriptorType],
            ["dimension", data.descriptorDim],
            ["distance", data.distanceType],
            ["time", `${compactNumber(data.elapsedMs)} ms`]
        ];
        if (algorithm === "surf") {
            return [
                [["积分图", "rect sum"], ["输入", "Gray"], ...common.slice(0, 3)],
                [["响应", "Hessian"], ["NMS", "local max"], ...common.slice(0, 3)],
                [["方向", "Haar"], ["旋转", "enabled"], ...common.slice(0, 3)],
                [["描述子", "64 float"], ["距离", "L2"], ...common.slice(0, 3)]
            ][step] || common;
        }
        if (algorithm === "fast-brief") {
            return [
                [["检测器", "FAST-9"], ["圆周采样", "16"], ...common.slice(0, 3)],
                [["采样对", "256"], ["方向", "none"], ...common.slice(0, 3)],
                [["描述子", "256 bit"], ["距离", "Hamming"], ...common.slice(0, 3)]
            ][step] || common;
        }
        return [
            [["检测器", "FAST-9"], ["NMS", "enabled"], ...common.slice(0, 3)],
            [["方向", "Intensity centroid"], ["矩", "m10 / m01"], ...common.slice(0, 3)],
            [["描述子", "rotated BRIEF"], ["距离", "Hamming"], ...common.slice(0, 3)]
        ][step] || common;
    }

    function renderFormulaBox(algorithm, step) {
        const box = V.$("siftNoteFormula");
        if (!box) return;
        const info = stepFormula(algorithm, step) || { formula: "-", details: [] };
        box.innerHTML = `
            <b>公式与判断</b>
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
        V.$("siftNoteTitle").textContent = `${info.name} · ${content.title}`;
        V.$("siftNotePrimary").innerHTML = `<b>${content.primary[0]}</b><p>${content.primary[1]}</p>`;
        V.$("siftNoteSecondary").innerHTML = `<b>${content.secondary[0]}</b><p>${content.secondary[1]}</p>`;
        V.$("siftNoteBoundary").textContent = content.boundary;
        renderFormulaBox(algorithm, step);
        V.renderStatList(V.$("siftNoteValues"), noteValues(algorithm, step));
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

    function drawPseudoPyramid(ctx, rows, palette, width, height, thumb) {
        const octaveRows = (rows || []).filter(row => row?.length);
        if (!octaveRows.length) return;

        const rowCount = octaveRows.length;
        const maxColumns = Math.max(1, ...octaveRows.map(row => row.length));
        const left = thumb ? 13 : 108;
        const right = thumb ? 6 : 24;
        const top = thumb ? 7 : 36;
        const bottom = thumb ? 7 : 28;
        const columnGap = thumb ? 3 : 8;
        const rowGap = thumb ? 5 : 22;
        const indentStep = thumb ? 9 : 48;
        const scales = octaveRows.map((row, index) => Math.max(0.58, 1 - index * (thumb ? 0.14 : 0.15)));
        const scaleSum = scales.reduce((sum, scale) => sum + scale, 0);
        const baseHeight = Math.max(12, (height - top - bottom - rowGap * (rowCount - 1)) / scaleSum);
        const baseWidth = Math.max(12, (width - left - right - columnGap * (maxColumns - 1)) / maxColumns);
        const centers = [];
        let y = top;

        octaveRows.forEach((row, octaveIndex) => {
            const scale = scales[octaveIndex];
            const cellWidth = baseWidth * scale;
            const cellHeight = baseHeight * scale;
            const rowX = left + octaveIndex * indentStep;
            const rowWidth = row.length * cellWidth + Math.max(0, row.length - 1) * columnGap;
            const centerY = y + cellHeight / 2;
            centers.push({ x: rowX, y: centerY });

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
                    h: cellHeight
                };
                ctx.save();
                ctx.shadowColor = "rgba(15,23,42,.14)";
                ctx.shadowBlur = thumb ? 2 : 7;
                ctx.shadowOffsetY = thumb ? 1 : 3;
                ctx.fillStyle = palette === "heat" ? "#24104f" : "#0f172a";
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, thumb ? 2 : 7);
                ctx.fill();
                ctx.clip();
                const fitted = coverRect(cell.array.width, cell.array.height, rect.w, rect.h);
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
                ctx.fillText(`1/${2 ** octaveIndex} 尺寸`, 29, centerY + 13);

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
    }

    async function drawSiftStepCanvas(canvas, stepIndex, options = {}) {
        if (!canvas || !scaleData) return;
        const thumb = Boolean(options.thumb);
        const step = stepContentMap.sift[stepIndex] || stepContentMap.sift[0];
        const gray = await grayPacked();
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
            drawPseudoPyramid(ctx, rows, palette, width, height, thumb);
            return;
        }

        if (stepIndex === 3) {
            const contained = await drawOriginalContained(canvas, width, height);
            const drawCtx = contained.ctx;
            const sx = contained.rect.w / (scaleData.meta?.width || contained.img.width);
            const sy = contained.rect.h / (scaleData.meta?.height || contained.img.height);
            const mapPoint = point => ({ x: contained.rect.x + point.x * sx, y: contained.rect.y + point.y * sy });
            (sift.points_extrema || []).slice(0, thumb ? 100 : 500).forEach(point => {
                const mapped = mapPoint(point);
                V.drawCircle(drawCtx, mapped.x, mapped.y, "rgba(148,163,184,.65)", thumb ? 2 : 3);
            });
            (sift.points_edge || []).slice(0, thumb ? 80 : 300).forEach(point => {
                const mapped = mapPoint(point);
                V.drawCircle(drawCtx, mapped.x, mapped.y, "#f97316", thumb ? 2 : 3.5);
            });
            (sift.points_keypoints || sift.keypoints || []).slice(0, thumb ? 80 : 240).forEach(point => {
                const mapped = mapPoint(point);
                V.drawSiftSymbol(drawCtx, { ...point, x: mapped.x, y: mapped.y, scale: thumb ? 3 : (point.scale || 4) * sx });
            });
            return;
        }

        if (stepIndex === 4) {
            const points = descriptor.oriented_keypoints || descriptor.extended_points || sift.extended_points || sift.points_keypoints || [];
            await drawSiftKeypointsContained(canvas, points, width, height, thumb ? 80 : 260);
            return;
        }

        const selected = descriptor.selected;
        V.setCanvasSize(canvas, width, height);
        const descriptorCtx = canvas.getContext("2d");
        descriptorCtx.fillStyle = "#f8fbff";
        descriptorCtx.fillRect(0, 0, width, height);
        if (selected) {
            const chartValues = selected.descriptor128 || [];
            const max = Math.max(1e-6, ...chartValues);
            const left = thumb ? 10 : 38;
            const bottom = height - (thumb ? 18 : 52);
            const barW = (width - left * 2) / chartValues.length;
            chartValues.forEach((value, index) => {
                const barH = (height - (thumb ? 38 : 115)) * (value / max);
                descriptorCtx.fillStyle = index % 8 === 0 ? "#f97316" : "#2563eb";
                descriptorCtx.fillRect(left + index * barW, bottom - barH, Math.max(1, barW - 1), barH);
            });
            if (!thumb) drawCanvasTitle(descriptorCtx, "128-dim descriptor", left, 34);
        } else {
            descriptorCtx.fillStyle = "#64748b";
            descriptorCtx.font = "900 16px sans-serif";
            descriptorCtx.fillText("进入描述子步骤后加载 128 维向量", 30, height / 2);
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
        await drawAlgorithmStepCanvas(canvas, scaleData.images.original, data, step);
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
                    <span><b>${step.title}</b><small>${step.primary?.[0] || ""}</small></span>
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
            ["3×3×3 邻域", "26 邻居比较", "阈值过滤"],
            ["局部梯度", "36-bin 累加", "主方向峰值"],
            ["4×4 cell", "8-bin 统计", "128 维归一化"]
        ][step] || ["输入", "计算", "输出"];
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
                ["边缘过滤后", counts.edge_survivors || 0, "orange"],
                ["最终关键点", counts.kept || 0, "green"]
            ],
            [
                ["方向点", data.keypoints.length || "懒加载", "blue"],
                ["方向 bins", 36, "purple"],
                ["主方向", selected ? `${compactNumber(selected.orientation_deg)}°` : "-", "orange"]
            ],
            [
                ["Descriptor", selected ? "128 float" : "懒加载", "blue"],
                ["Patch vectors", data.vectors.length || 0, "purple"],
                ["L2 norm", selected ? "normalized" : "-", "green"]
            ]
        ][currentStep] || [] : noteValues(algorithm, currentStep).slice(0, 5).map(([k, v]) => [k, v, "blue"]);
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
        const cx = 214;
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
        drawFlowParticles(ctx, 360, 126, 464, 126, "#06b6d4", phase, 5);
        drawNeighborOrbit(ctx, 520, 126, phase);
        drawFlowParticles(ctx, 584, 126, 632, 126, "#f97316", (phase + .2) % 1, 4);
        drawFilterGate(ctx, 646, 78, data.counts || {}, phase);
        ctx.save();
        ctx.fillStyle = "#334155";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("中心响应必须同时大于或小于 26 个尺度邻居，再通过对比度与边缘过滤", 80, 224);
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
        const cell = 20;
        const active = Math.floor(phase * 12) % 12;
        ctx.save();
        ctx.fillStyle = "#2563eb";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("Integral access", x, y - 14);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const px = x + col * cell;
                const py = y + row * cell;
                const hot = (row + col * 2) % 12 === active;
                ctx.fillStyle = hot ? "rgba(249,115,22,.18)" : `rgba(37,99,235,${.07 + (row + col) / 70})`;
                ctx.strokeStyle = hot ? "#f97316" : "rgba(147,197,253,.55)";
                ctx.lineWidth = hot ? 2 : 1;
                roundRect(ctx, px, py, cell - 2, cell - 2, 5);
                ctx.fill();
                ctx.stroke();
                if (hot) {
                    ctx.fillStyle = "#ea580c";
                    ctx.font = "850 8px sans-serif";
                    ctx.fillText(String(20 + row * 8 + col * 5), px + 4, py + 13);
                }
            }
        }
        ctx.fillStyle = "#64748b";
        ctx.font = "850 11px sans-serif";
        ctx.fillText("4 corner reads per box", x, y + rows * cell + 18);
        ctx.restore();
    }

    function drawSurfHessianKernel(ctx, cx, cy, label, color, phase, kind) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, cx, cy - 56);
        const scale = 18;
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
        roundRect(ctx, cx - 40, cy + 42, 80, 28, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "950 12px sans-serif";
        ctx.fillText("box sum", cx, cy + 60);
        ctx.restore();
    }

    function drawSurfDetMixer(ctx, x, y, phase) {
        ctx.save();
        ctx.fillStyle = "rgba(255,247,237,.82)";
        ctx.strokeStyle = "rgba(249,115,22,.58)";
        ctx.lineWidth = 1.8;
        roundRect(ctx, x, y, 164, 86, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("det(H)", x + 20, y + 28);
        ctx.fillStyle = "#7c2d12";
        ctx.font = "950 13px sans-serif";
        ctx.fillText("Dxx·Dyy - .81Dxy²", x + 20, y + 52);
        const t = motionEase(phase);
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 20, y + 70);
        ctx.lineTo(x + 20 + 122 * t, y + 70);
        ctx.stroke();
        ctx.restore();
    }

    function drawSurfPeakField(ctx, x, y, phase) {
        ctx.save();
        ctx.fillStyle = "#16a34a";
        ctx.font = "950 15px sans-serif";
        ctx.fillText("local max field", x, y - 14);
        for (let i = 0; i < 42; i++) {
            const px = x + (i % 7) * 23 + Math.sin(i * 1.7) * 4;
            const py = y + Math.floor(i / 7) * 21 + Math.cos(i * 1.2) * 4;
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
        ctx.arc(x + 3 * 23, y + 2 * 21, 42 + 8 * phase, 0, Math.PI * 2);
        ctx.stroke();
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

    function drawSurfDescriptorCells(ctx, x, y, phase) {
        ctx.save();
        const cell = 26;
        const active = Math.floor(phase * 16);
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const index = row * 4 + col;
                const on = index <= active;
                ctx.fillStyle = on ? "rgba(14,165,233,.18)" : "rgba(255,255,255,.85)";
                ctx.strokeStyle = on ? "#0ea5e9" : "#bfdbfe";
                roundRect(ctx, x + col * cell, y + row * cell, cell - 3, cell - 3, 7);
                ctx.fill();
                ctx.stroke();
                if (on) {
                    ctx.strokeStyle = "#f97316";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x + col * cell + 7, y + row * cell + 13);
                    ctx.lineTo(x + col * cell + 19, y + row * cell + 7);
                    ctx.moveTo(x + col * cell + 7, y + row * cell + 19);
                    ctx.lineTo(x + col * cell + 19, y + row * cell + 19);
                    ctx.stroke();
                }
            }
        }
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
            drawSurfIntegralAccess(ctx, 48, 72, phase);
            drawFlowParticles(ctx, 178, 126, 256, 126, "#2563eb", phase, 4);
            drawSurfHessianKernel(ctx, 318, 88, "Dxx", "#0ea5e9", phase, "xx");
            drawSurfHessianKernel(ctx, 430, 126, "Dxy", "#7c3aed", phase, "xy");
            drawSurfHessianKernel(ctx, 318, 174, "Dyy", "#0ea5e9", phase, "yy");
            drawFlowParticles(ctx, 478, 126, 548, 126, "#f97316", (phase + .15) % 1, 4);
            drawSurfDetMixer(ctx, 560, 78, phase);
            drawFlowParticles(ctx, 638, 170, 686, 170, "#16a34a", (phase + .32) % 1, 3);
            drawSurfPeakField(ctx, 692, 118, phase);
        } else if (step?.key === "orientation") {
            drawMotionPill(ctx, 42, 44, 142, 48, "SURF point", data ? `${data.keypoints} pts` : "keypoint", "#0ea5e9");
            drawMotionFlow(ctx, 196, 106, 288, 106, "#0ea5e9", phase);
            drawHaarCompass(ctx, 384, 124, phase, "#0ea5e9");
            drawMotionPill(ctx, 318, 188, 170, 42, "Haar window", "Σdx / Σdy", "#0ea5e9");
            drawMotionFlow(ctx, 506, 122, 620, 122, "#16a34a", phase);
            drawMotionPill(ctx, 638, 74, 172, 58, "Main angle", "atan2(Σdy, Σdx)", "#16a34a");
            drawMotionPill(ctx, 638, 158, 172, 42, "Align", "rotate descriptor frame", "#7c3aed");
        } else {
            drawMotionPill(ctx, 42, 42, 140, 44, "oriented patch", "Haar samples", "#0ea5e9");
            drawSurfDescriptorCells(ctx, 70, 96, phase);
            drawMotionFlow(ctx, 200, 132, 304, 132, "#0ea5e9", phase);
            drawMotionPill(ctx, 322, 64, 176, 54, "cell sums", "dx dy |dx| |dy|", "#2563eb");
            drawMotionFlow(ctx, 514, 118, 610, 118, "#2563eb", phase);
            drawHistogramBars(ctx, 628, 58, 180, 112, Array.from({ length: 64 }, (_, i) => ((i * 11) % 23) + 4), -1, "#0ea5e9");
            drawMotionPill(ctx, 632, 184, 170, 36, "64 float", "L2 descriptor", "#16a34a");
        }
        if (step?.key !== "integral") {
            ctx.fillStyle = "#475569";
            ctx.font = "900 15px sans-serif";
            ctx.fillText("SURF 用积分图和盒式滤波把尺度响应、方向和 64 维描述子串成快速浮点流程。", 64, 238);
        }
    }

    function drawBriefMotion(ctx, phase, w, h, data, step) {
        if (step?.key === "fast") {
            drawMotionPill(ctx, 38, 42, 138, 46, "scan window", "slide over image", "#eab308");
            drawPatchTiles(ctx, 54, 112, 5, 4, 22, phase, "#eab308");
            drawMotionFlow(ctx, 188, 128, 292, 128, "#eab308", phase);
            drawFastCircleTest(ctx, 386, 126, phase, "#eab308");
            drawMotionFlow(ctx, 470, 126, 570, 126, "#f97316", phase);
            drawMotionPill(ctx, 586, 72, 174, 52, "FAST-9", "9 continuous pass", "#f97316");
            drawNmsCloud(ctx, 590, 150, phase, "#eab308");
        } else if (step?.key === "pairs") {
            drawMotionPill(ctx, 44, 44, 140, 44, "FAST point", data ? `${data.keypoints} corners` : "corner", "#eab308");
            drawMotionFlow(ctx, 196, 118, 272, 118, "#eab308", phase);
            drawBriefPairs(ctx, 356, 126, phase, false);
            drawMotionPill(ctx, 270, 198, 186, 34, "fixed BRIEF pairs", "no rotation", "#2563eb");
            drawMotionFlow(ctx, 452, 126, 560, 126, "#2563eb", phase);
            drawMotionPill(ctx, 576, 70, 166, 58, "compare", "I(a) < I(b)", "#2563eb");
            drawMotionPill(ctx, 576, 154, 166, 44, "one pair", "one binary bit", "#f97316");
        } else {
            drawMotionPill(ctx, 42, 52, 148, 52, "256 compares", "bit generator", "#2563eb");
            drawMotionFlow(ctx, 204, 112, 300, 112, "#2563eb", phase);
            drawBitStrip(ctx, 318, 62, 24, phase, "#2563eb");
            drawMotionFlow(ctx, 640, 96, 708, 96, "#7c3aed", phase);
            drawMotionPill(ctx, 704, 60, 138, 52, "Hamming", "XOR + popcount", "#7c3aed");
            const active = Math.floor(phase * 18);
            for (let i = 0; i < 18; i++) {
                ctx.fillStyle = i <= active ? (i % 2 ? "#f97316" : "#2563eb") : "#cbd5e1";
                ctx.font = "900 12px monospace";
                ctx.fillText(i <= active ? String(i % 2) : "·", 328 + i * 18, 168);
            }
        }
        ctx.fillStyle = "#475569";
        ctx.font = "900 15px sans-serif";
        ctx.fillText("FAST+BRIEF 先用圆周阈值找点，再用固定点对把局部纹理压缩成 256 bit。", 74, 238);
    }

    function drawOrbMotion(ctx, phase, w, h, data, step) {
        if (step?.key === "fast") {
            drawMotionPill(ctx, 38, 42, 138, 46, "FAST detector", data ? `${data.keypoints} corners` : "corners", "#16a34a");
            drawPatchTiles(ctx, 54, 112, 5, 4, 22, phase, "#16a34a");
            drawMotionFlow(ctx, 188, 128, 292, 128, "#16a34a", phase);
            drawFastCircleTest(ctx, 386, 126, phase, "#16a34a");
            drawMotionFlow(ctx, 470, 126, 570, 126, "#16a34a", phase);
            drawNmsCloud(ctx, 590, 98, phase, "#16a34a");
            drawMotionPill(ctx, 600, 180, 162, 38, "ORB seed", "FAST + ranking", "#16a34a");
        } else if (step?.key === "orientation") {
            drawMotionPill(ctx, 42, 38, 138, 44, "local patch", "gray moments", "#16a34a");
            const cx = 260, cy = 126;
            drawPatchTiles(ctx, 122, 88, 6, 5, 20, phase, "#16a34a");
            const angle = -0.8 + phase * 0.7;
            const mx = cx + Math.cos(angle) * 76;
            const my = cy + Math.sin(angle) * 46;
            ctx.strokeStyle = "rgba(22,163,74,.24)";
            ctx.lineWidth = 1.4;
            for (let i = 0; i < 18; i++) {
                const px = 142 + (i % 6) * 20;
                const py = 96 + Math.floor(i / 6) * 20;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(px, py);
                ctx.stroke();
            }
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.fillStyle = "#16a34a";
            ctx.beginPath();
            ctx.arc(mx, my, 8, 0, Math.PI * 2);
            ctx.fill();
            drawMotionFlow(ctx, 360, 126, 478, 126, "#16a34a", phase);
            drawMotionPill(ctx, 496, 72, 170, 58, "θ = atan2", "m01 / m10", "#16a34a");
            drawMotionPill(ctx, 496, 154, 170, 44, "rotate frame", "BRIEF follows θ", "#7c3aed");
        } else {
            drawMotionPill(ctx, 42, 48, 138, 46, "θ aligned", "rotate pairs", "#7c3aed");
            drawMotionFlow(ctx, 194, 124, 274, 124, "#7c3aed", phase);
            drawBriefPairs(ctx, 360, 126, phase, true);
            drawMotionFlow(ctx, 448, 126, 548, 126, "#16a34a", phase);
            drawMotionPill(ctx, 564, 70, 168, 56, "rotated BRIEF", "I(Rθa)<I(Rθb)", "#16a34a");
            drawBitStrip(ctx, 570, 154, 16, phase, "#16a34a");
            drawMotionPill(ctx, 742, 82, 92, 54, "ORB-lite", "256 bit", "#f97316");
        }
        ctx.fillStyle = "#475569";
        ctx.font = "900 15px sans-serif";
        ctx.fillText("ORB-lite 在 FAST 点上估计灰度质心方向，再把 BRIEF 点对旋转到局部主方向。", 74, 238);
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
                siftMotion.progress = (siftMotion.progress + delta / 3600) % 1;
                renderSiftMotionProbe();
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
        syncAlgorithmControls();
        renderStepNav();
        stepPanels.forEach(panel => {
            const panelKey = steps[currentStep]?.panel || "analog";
            panel.hidden = panel.dataset.siftPanel !== panelKey;
        });
        renderCurrentStepView();
        if (algorithm === "sift") {
            if (currentStep >= 4) loadDescriptor();
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

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const requestGeneration = ++generation;
        descriptorData = null;
        descriptorPromise = null;
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
