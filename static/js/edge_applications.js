(() => {
    "use strict";

    const root = document.getElementById("edgeApplicationsPage");
    if (!root) return;

    const assetsBase = root.dataset.assetsBase || "";
    const maxWorkWidth = 512;
    const samples = [
        { file: "cameraman.png", label: "Cameraman" },
        { file: "house.png", label: "House" },
        { file: "lena_color_512.png", label: "Lena" },
        { file: "mandril_color.png", label: "Mandrill" },
        { file: "peppers_color.png", label: "Peppers" }
    ];
    const flow = ["Image", "Gray", "Edge Map", "Candidate Points", "Linking / Voting", "Peak / Contour", "Overlay Result"];
    const colors = ["#2563eb", "#f97316", "#16a34a", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6", "#f59e0b"];
    const speedMap = {
        slow: { contour: 420, line: 20, circle: 8 },
        medium: { contour: 960, line: 48, circle: 18 },
        fast: { contour: 2200, line: 110, circle: 42 }
    };

    const els = {
        input: document.getElementById("edgeAppImageInput"),
        imageName: document.getElementById("edgeAppImageName"),
        samples: document.getElementById("edgeAppSamples"),
        source: document.getElementById("edgeAppSource"),
        mode: document.getElementById("edgeAppMode"),
        speed: document.getElementById("edgeAppSpeed"),
        resolution: document.getElementById("edgeAppResolution"),
        resolutionBadge: document.getElementById("edgeAppResolutionBadge"),
        modePill: document.getElementById("edgeAppModePill"),
        processSteps: document.getElementById("edgeAppProcessSteps"),
        meter: document.getElementById("edgeAppMeter"),
        percent: document.getElementById("edgeAppPercent"),
        start: document.getElementById("edgeAppStart"),
        play: document.getElementById("edgeAppPlay"),
        step: document.getElementById("edgeAppStep"),
        reset: document.getElementById("edgeAppReset"),
        stagePlay: document.getElementById("edgeAppStagePlay"),
        stagePause: document.getElementById("edgeAppStagePause"),
        stageStep: document.getElementById("edgeAppStageStep"),
        stageReset: document.getElementById("edgeAppStageReset"),
        stageSpeed: document.getElementById("edgeAppStageSpeed"),
        status: document.getElementById("edgeAppStatus"),
        progress: document.getElementById("edgeAppProgress"),
        timeline: document.getElementById("edgeAppTimeline"),
        panelA: document.getElementById("edgeAppPanelA"),
        panelB: document.getElementById("edgeAppPanelB"),
        panelC: document.getElementById("edgeAppPanelC"),
        canvasA: document.getElementById("edgeAppCanvasA"),
        canvasB: document.getElementById("edgeAppCanvasB"),
        canvasC: document.getElementById("edgeAppCanvasC"),
        infoTitle: document.getElementById("edgeAppInfoTitle"),
        infoText: document.getElementById("edgeAppInfoText"),
        formula: document.getElementById("edgeAppFormula"),
        stats: document.getElementById("edgeAppStats"),
        contourThreshold: document.getElementById("edgeAppContourThreshold"),
        contourThresholdValue: document.getElementById("edgeAppContourThresholdValue"),
        minContour: document.getElementById("edgeAppMinContour"),
        minContourValue: document.getElementById("edgeAppMinContourValue"),
        connectivity: document.getElementById("edgeAppConnectivity"),
        showBox: document.getElementById("edgeAppShowBox"),
        showId: document.getElementById("edgeAppShowId"),
        thetaStep: document.getElementById("edgeAppThetaStep"),
        rhoRes: document.getElementById("edgeAppRhoRes"),
        lineVote: document.getElementById("edgeAppLineVote"),
        lineVoteValue: document.getElementById("edgeAppLineVoteValue"),
        maxLines: document.getElementById("edgeAppMaxLines"),
        maxLinesValue: document.getElementById("edgeAppMaxLinesValue"),
        showAccumulator: document.getElementById("edgeAppShowAccumulator"),
        radiusMin: document.getElementById("edgeAppRadiusMin"),
        radiusMinValue: document.getElementById("edgeAppRadiusMinValue"),
        radiusMax: document.getElementById("edgeAppRadiusMax"),
        radiusMaxValue: document.getElementById("edgeAppRadiusMaxValue"),
        radiusStep: document.getElementById("edgeAppRadiusStep"),
        circleVote: document.getElementById("edgeAppCircleVote"),
        circleVoteValue: document.getElementById("edgeAppCircleVoteValue"),
        maxCircles: document.getElementById("edgeAppMaxCircles"),
        maxCirclesValue: document.getElementById("edgeAppMaxCirclesValue")
    };

    const state = {
        sample: "house.png",
        imageSrc: "",
        image: null,
        width: 0,
        height: 0,
        imageData: null,
        gray: null,
        edge: null,
        edgePoints: [],
        playing: false,
        raf: 0,
        processRaf: 0,
        processAnimStart: performance.now(),
        phase: 0,
        modeData: null,
        selectedContour: -1
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function setStatus(text, mode = "info") {
        els.status.textContent = text;
        els.status.dataset.status = mode;
    }

    function setCanvasSize(canvas, width, height) {
        canvas.width = width;
        canvas.height = height;
    }

    function renderSamples() {
        els.samples.innerHTML = samples.map((sample) => `
            <button class="edge-sample-btn ${state.sample === sample.file ? "is-active" : ""}" type="button" data-sample="${sample.file}" title="${escapeHtml(sample.label)}">
                <img src="${assetsBase}${sample.file}" alt="${escapeHtml(sample.label)}">
            </button>
        `).join("");
    }

    function renderTimeline() {
        els.timeline.style.setProperty("--edge-flow-count", flow.length);
        els.timeline.innerHTML = flow.map((label, index) => `
            <li class="${index < state.phase ? "is-done" : ""} ${index === state.phase ? "is-active" : ""}" data-flow-index="${index}">
                <span>${index + 1}</span>
                <b>${escapeHtml(label)}</b>
            </li>
        `).join("");
        els.progress.textContent = flow.slice(0, state.phase + 1).join(" → ");
        const percent = Math.round((state.phase / (flow.length - 1)) * 100);
        if (els.meter) els.meter.value = percent;
        if (els.percent) els.percent.textContent = `${percent}%`;
    }

    function modeTitle(mode = els.mode.value) {
        return {
            contour: "轮廓提取",
            line: "Hough 直线检测",
            circle: "Hough 圆检测"
        }[mode] || "轮廓提取";
    }

    function renderProcessSteps() {
        if (!els.processSteps) return;
        const mode = els.mode.value;
        const steps = {
            contour: ["扫描边缘点", "连通域扩展", "过滤小噪声", "绘制外接矩形", "结果叠加"],
            line: ["高亮边缘点", "遍历 θ", "绘制正弦曲线", "峰值检测", "直线回映射"],
            circle: ["选择边缘点", "枚举半径", "圆心候选投票", "中心峰值检测", "圆形回映射"]
        }[mode];
        const active = Math.max(0, Math.min(steps.length - 1, state.phase - 2));
        els.processSteps.innerHTML = steps.map((step, index) => `
            <div class="${index < active ? "is-done" : ""} ${index === active ? "is-active" : ""}" data-process-step="${index}">
                <canvas width="132" height="58" aria-hidden="true"></canvas>
                <b><span>${index + 1}</span>${escapeHtml(step)}</b>
            </div>
        `).join("");
        els.processSteps.querySelectorAll("canvas").forEach((canvas, index) => {
            drawProcessMini(canvas, mode, index, index === active);
        });
    }

    function drawProcessMini(canvas, mode, index, active) {
        const context = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        context.clearRect(0, 0, width, height);
        context.fillStyle = active ? "#eff6ff" : "#ffffff";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = active ? "#2563eb" : "#bfdbfe";
        context.lineWidth = 1.5;
        context.strokeRect(0.5, 0.5, width - 1, height - 1);
        if (mode === "line") drawLineProcessMini(context, width, height, index, active);
        else if (mode === "circle") drawCircleProcessMini(context, width, height, index, active);
        else drawContourProcessMini(context, width, height, index, active);
    }

    function processAnimPhase(index) {
        const elapsed = performance.now() - state.processAnimStart;
        return ((elapsed / 900) + index * 0.18) % 1;
    }

    function startProcessMiniAnimation() {
        cancelAnimationFrame(state.processRaf);
        state.processAnimStart = performance.now();
        const tick = () => {
            if (els.mode.value === "contour") renderProcessSteps();
            state.processRaf = requestAnimationFrame(tick);
        };
        state.processRaf = requestAnimationFrame(tick);
    }

    function drawContourProcessMini(context, width, height, index, active) {
        const blue = active ? "#2563eb" : "#60a5fa";
        const green = "#16a34a";
        const orange = "#f97316";
        const gray = "#94a3b8";
        const points = [[18, 17], [34, 15], [51, 19], [25, 34], [42, 35], [62, 31], [86, 18], [96, 34], [108, 25]];
        const phase = active ? processAnimPhase(index) : 0.65;
        if (index === 0) {
            points.forEach(([x, y], i) => {
                const pulseIndex = Math.floor(phase * points.length);
                const isPulse = active && i === pulseIndex;
                context.fillStyle = i < 6 ? blue : "#bfdbfe";
                context.beginPath();
                context.arc(x, y, isPulse ? 5.2 : 3, 0, Math.PI * 2);
                context.fill();
                if (isPulse) {
                    context.strokeStyle = "rgba(37,99,235,0.35)";
                    context.lineWidth = 2;
                    context.beginPath();
                    context.arc(x, y, 8, 0, Math.PI * 2);
                    context.stroke();
                }
            });
            context.fillStyle = orange;
            context.beginPath();
            context.arc(62, 31, 4.5, 0, Math.PI * 2);
            context.fill();
        } else if (index === 1) {
            const connected = points.slice(0, Math.max(1, Math.ceil(phase * 6)));
            context.strokeStyle = "rgba(249,115,22,0.35)";
            context.lineWidth = 8;
            context.beginPath();
            context.moveTo(18, 18);
            context.lineTo(33, 14);
            context.lineTo(50, 20);
            context.lineTo(63, 31);
            context.lineTo(42, 36);
            context.lineTo(25, 34);
            context.closePath();
            context.stroke();
            connected.forEach(([x, y], i) => {
                context.fillStyle = i === connected.length - 1 && active ? orange : blue;
                context.beginPath();
                context.arc(x, y, i === connected.length - 1 && active ? 5 : 3.2, 0, Math.PI * 2);
                context.fill();
            });
        } else if (index === 2) {
            points.slice(0, 6).forEach(([x, y]) => {
                context.fillStyle = blue;
                context.fillRect(x - 2, y - 2, 4, 4);
            });
            points.slice(6).forEach(([x, y]) => {
                const alpha = active ? Math.max(0.18, 1 - phase) : 0.38;
                context.fillStyle = `rgba(100,116,139,${alpha})`;
                context.beginPath();
                context.arc(x, y, 4 - alpha, 0, Math.PI * 2);
                context.fill();
            });
        } else if (index === 3) {
            context.fillStyle = blue;
            points.slice(0, 6).forEach(([x, y]) => context.fillRect(x - 2, y - 2, 4, 4));
            context.strokeStyle = green;
            context.lineWidth = 2;
            const x = 15;
            const y = 12;
            const w = 55;
            const h = 30;
            const perimeter = (w + h) * 2;
            let remaining = active ? phase * perimeter : perimeter;
            context.beginPath();
            context.moveTo(x, y);
            const drawSegment = (x1, y1, x2, y2, length) => {
                if (remaining <= 0) return;
                const portion = Math.min(1, remaining / length);
                context.lineTo(x1 + (x2 - x1) * portion, y1 + (y2 - y1) * portion);
                remaining -= length;
            };
            drawSegment(x + w, y, x + w, y, w);
            drawSegment(x + w, y + h, x + w, y + h, h);
            drawSegment(x, y + h, x, y + h, w);
            drawSegment(x, y, x, y, h);
            context.stroke();
        } else {
            context.fillStyle = "rgba(37,99,235,0.12)";
            context.fillRect(12, 10, 68, 36);
            context.strokeStyle = blue;
            context.lineWidth = 1.6;
            context.beginPath();
            context.moveTo(18, 18);
            context.lineTo(33, 14);
            context.lineTo(50, 20);
            context.lineTo(63, 31);
            context.lineTo(42, 36);
            context.lineTo(25, 34);
            context.closePath();
            context.stroke();
            context.strokeStyle = green;
            context.lineWidth = 2;
            context.strokeRect(15, 12, 55, 30);
            context.strokeStyle = orange;
            context.beginPath();
            const sweep = active ? phase : 1;
            context.moveTo(88, 38);
            context.lineTo(88 + (112 - 88) * sweep, 38 + (18 - 38) * sweep);
            context.stroke();
        }
    }

    function drawLineProcessMini(context, width, height, index, active) {
        const blue = active ? "#2563eb" : "#60a5fa";
        const orange = "#f97316";
        const green = "#16a34a";
        if (index === 0) {
            for (let i = 0; i < 22; i += 1) {
                context.fillStyle = i === 10 ? orange : blue;
                context.beginPath();
                context.arc(14 + (i % 8) * 12, 14 + Math.floor(i / 8) * 13, i === 10 ? 4 : 2.6, 0, Math.PI * 2);
                context.fill();
            }
        } else if (index === 1) {
            context.strokeStyle = "#94a3b8";
            context.setLineDash([5, 4]);
            context.beginPath();
            context.arc(62, 30, 22, 0, Math.PI * 2);
            context.stroke();
            context.setLineDash([]);
            context.strokeStyle = blue;
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(62, 30);
            context.lineTo(94, 18);
            context.stroke();
            context.fillStyle = blue;
            context.fillText("theta", 82, 41);
        } else if (index === 2) {
            context.strokeStyle = "#64748b";
            context.beginPath();
            context.moveTo(14, 46);
            context.lineTo(118, 46);
            context.moveTo(18, 10);
            context.lineTo(18, 50);
            context.stroke();
            context.strokeStyle = orange;
            context.lineWidth = 2;
            context.beginPath();
            for (let x = 0; x <= 96; x += 4) {
                const y = 31 - Math.sin(x / 14) * 15;
                if (x === 0) context.moveTo(22 + x, y);
                else context.lineTo(22 + x, y);
            }
            context.stroke();
        } else if (index === 3) {
            const gradient = context.createRadialGradient(66, 29, 3, 66, 29, 34);
            gradient.addColorStop(0, "#ef4444");
            gradient.addColorStop(0.45, "#facc15");
            gradient.addColorStop(1, "#1d4ed8");
            context.fillStyle = gradient;
            context.fillRect(22, 8, 88, 42);
            context.strokeStyle = "#ffffff";
            context.lineWidth = 2;
            context.beginPath();
            context.arc(66, 29, 9, 0, Math.PI * 2);
            context.stroke();
        } else {
            context.strokeStyle = green;
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(8, 47);
            context.lineTo(124, 15);
            context.moveTo(8, 34);
            context.lineTo(124, 46);
            context.stroke();
            context.strokeStyle = orange;
            context.beginPath();
            context.moveTo(24, 52);
            context.lineTo(110, 12);
            context.stroke();
        }
    }

    function drawCircleProcessMini(context, width, height, index, active) {
        const blue = active ? "#2563eb" : "#60a5fa";
        const orange = "#f97316";
        const green = "#16a34a";
        if (index === 0) {
            context.fillStyle = blue;
            [[22, 18], [40, 35], [76, 18], [96, 36], [112, 26]].forEach(([x, y], i) => {
                context.beginPath();
                context.arc(x, y, i === 2 ? 4 : 3, 0, Math.PI * 2);
                context.fill();
            });
            context.fillStyle = orange;
            context.beginPath();
            context.arc(76, 18, 5, 0, Math.PI * 2);
            context.fill();
        } else if (index === 1) {
            context.strokeStyle = orange;
            context.lineWidth = 2;
            [12, 20, 28].forEach((radius) => {
                context.beginPath();
                context.arc(66, 29, radius, 0, Math.PI * 2);
                context.stroke();
            });
        } else if (index === 2) {
            context.strokeStyle = "rgba(249,115,22,0.85)";
            context.lineWidth = 1.5;
            [[36, 28], [66, 20], [88, 36]].forEach(([x, y]) => {
                context.beginPath();
                context.arc(x, y, 18, 0, Math.PI * 2);
                context.stroke();
            });
            context.fillStyle = blue;
            context.fillRect(64, 27, 5, 5);
        } else if (index === 3) {
            const gradient = context.createRadialGradient(66, 29, 2, 66, 29, 32);
            gradient.addColorStop(0, "#ef4444");
            gradient.addColorStop(0.5, "#facc15");
            gradient.addColorStop(1, "#0ea5e9");
            context.fillStyle = gradient;
            context.fillRect(23, 8, 86, 42);
            context.strokeStyle = "#ffffff";
            context.beginPath();
            context.arc(66, 29, 8, 0, Math.PI * 2);
            context.stroke();
        } else {
            context.strokeStyle = green;
            context.lineWidth = 2.4;
            context.beginPath();
            context.arc(66, 29, 22, 0, Math.PI * 2);
            context.stroke();
            context.fillStyle = blue;
            context.fillRect(64, 27, 4, 4);
        }
    }

    function updatePanelVisibility() {
        root.querySelectorAll("[data-mode-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.modePanel !== els.mode.value;
        });
    }

    function updateRangeLabels() {
        els.contourThresholdValue.textContent = els.contourThreshold.value;
        els.minContourValue.textContent = els.minContour.value;
        els.lineVoteValue.textContent = els.lineVote.value;
        els.maxLinesValue.textContent = els.maxLines.value;
        els.radiusMinValue.textContent = els.radiusMin.value;
        els.radiusMaxValue.textContent = els.radiusMax.value;
        els.circleVoteValue.textContent = els.circleVote.value;
        els.maxCirclesValue.textContent = els.maxCircles.value;
        if (els.resolutionBadge) els.resolutionBadge.textContent = `${els.resolution.value} px`;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("图片读取失败"));
            image.src = src;
        });
    }

    function prepareImage(image) {
        const sourceW = image.naturalWidth || image.width;
        const sourceH = image.naturalHeight || image.height;
        const workWidth = Number(els.resolution?.value || maxWorkWidth);
        const scale = Math.min(1, workWidth / sourceW);
        const width = Math.max(1, Math.round(sourceW * scale));
        const height = Math.max(1, Math.round(sourceH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, sourceW, sourceH, 0, 0, width, height);
        state.image = image;
        state.width = width;
        state.height = height;
        state.imageData = context.getImageData(0, 0, width, height);
        state.gray = imageDataToGray(state.imageData);
        state.edge = sobelEdge(state.gray, width, height, edgeThresholdForSource());
        state.edgePoints = collectEdgePoints(state.edge, width, height, 9000);
        [els.canvasA, els.canvasB, els.canvasC].forEach((canvasEl) => setCanvasSize(canvasEl, width, height));
    }

    function imageDataToGray(imageData) {
        const { data, width, height } = imageData;
        const gray = new Uint8ClampedArray(width * height);
        for (let i = 0; i < gray.length; i += 1) {
            const offset = i * 4;
            gray[i] = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
        }
        return gray;
    }

    function edgeThresholdForSource() {
        const base = Number(els.contourThreshold.value);
        if (els.source.value === "canny") return Math.max(30, base + 14);
        if (els.source.value === "teed") return Math.max(24, base - 10);
        return base;
    }

    function sobelEdge(gray, width, height, threshold) {
        const edge = new Uint8Array(width * height);
        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                const index = y * width + x;
                const gx =
                    -gray[index - width - 1] + gray[index - width + 1]
                    -2 * gray[index - 1] + 2 * gray[index + 1]
                    -gray[index + width - 1] + gray[index + width + 1];
                const gy =
                    -gray[index - width - 1] - 2 * gray[index - width] - gray[index - width + 1]
                    + gray[index + width - 1] + 2 * gray[index + width] + gray[index + width + 1];
                edge[index] = Math.hypot(gx, gy) >= threshold ? 255 : 0;
            }
        }
        return edge;
    }

    function collectEdgePoints(edge, width, height, maxPoints) {
        const all = [];
        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                if (edge[y * width + x]) all.push({ x, y });
            }
        }
        if (all.length <= maxPoints) return all;
        const step = all.length / maxPoints;
        const sampled = [];
        for (let i = 0; i < maxPoints; i += 1) sampled.push(all[Math.floor(i * step)]);
        return sampled;
    }

    function drawOriginal(canvas) {
        const context = canvas.getContext("2d");
        context.putImageData(state.imageData, 0, 0);
    }

    function drawGray(canvas) {
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(state.width, state.height);
        for (let i = 0; i < state.gray.length; i += 1) {
            const value = state.gray[i];
            imageData.data[i * 4] = value;
            imageData.data[i * 4 + 1] = value;
            imageData.data[i * 4 + 2] = value;
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
    }

    function drawEdgeMap(canvas, edge = state.edge) {
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(state.width, state.height);
        for (let i = 0; i < edge.length; i += 1) {
            const value = edge[i];
            imageData.data[i * 4] = value;
            imageData.data[i * 4 + 1] = value;
            imageData.data[i * 4 + 2] = value;
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
    }

    function drawBaseOverlay(canvas, alpha = 0.72) {
        const context = canvas.getContext("2d");
        context.putImageData(state.imageData, 0, 0);
        context.fillStyle = `rgba(255,255,255,${1 - alpha})`;
        context.fillRect(0, 0, state.width, state.height);
    }

    function extractContours(edge, width, height, connectivity, minSize) {
        const visited = new Uint8Array(width * height);
        const contours = [];
        const noise = [];
        const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const dirs8 = dirs4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
        const dirs = connectivity === 4 ? dirs4 : dirs8;
        const queue = new Int32Array(width * height);

        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                const start = y * width + x;
                if (!edge[start] || visited[start]) continue;
                let head = 0;
                let tail = 0;
                let minX = x;
                let minY = y;
                let maxX = x;
                let maxY = y;
                const points = [];
                queue[tail] = start;
                tail += 1;
                visited[start] = 1;
                while (head < tail) {
                    const current = queue[head];
                    head += 1;
                    const cx = current % width;
                    const cy = Math.floor(current / width);
                    points.push(current);
                    if (cx < minX) minX = cx;
                    if (cy < minY) minY = cy;
                    if (cx > maxX) maxX = cx;
                    if (cy > maxY) maxY = cy;
                    dirs.forEach(([dx, dy]) => {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        const ni = ny * width + nx;
                        if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) return;
                        if (!edge[ni] || visited[ni]) return;
                        visited[ni] = 1;
                        queue[tail] = ni;
                        tail += 1;
                    });
                }
                const contour = {
                    points,
                    size: points.length,
                    bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
                };
                if (points.length >= minSize) contours.push(contour);
                else noise.push(contour);
            }
        }
        contours.sort((a, b) => b.size - a.size);
        return { contours, noise };
    }

    function createLineModel() {
        const thetaStep = Number(els.thetaStep.value);
        const rhoResolution = Number(els.rhoRes.value);
        const thetaBins = Math.floor(180 / thetaStep);
        const diagonal = Math.ceil(Math.hypot(state.width, state.height));
        const rhoBins = Math.ceil((diagonal * 2) / rhoResolution) + 1;
        const cos = new Float32Array(thetaBins);
        const sin = new Float32Array(thetaBins);
        for (let t = 0; t < thetaBins; t += 1) {
            const rad = (t * thetaStep * Math.PI) / 180;
            cos[t] = Math.cos(rad);
            sin[t] = Math.sin(rad);
        }
        return {
            accumulator: new Uint16Array(thetaBins * rhoBins),
            thetaStep,
            rhoResolution,
            thetaBins,
            rhoBins,
            diagonal,
            cos,
            sin,
            cursor: 0,
            lines: [],
            maxVote: 0
        };
    }

    function voteLinePoints(model, count) {
        const end = Math.min(state.edgePoints.length, model.cursor + count);
        for (; model.cursor < end; model.cursor += 1) {
            const point = state.edgePoints[model.cursor];
            for (let t = 0; t < model.thetaBins; t += 1) {
                const rho = point.x * model.cos[t] + point.y * model.sin[t];
                const r = Math.round((rho + model.diagonal) / model.rhoResolution);
                const index = r * model.thetaBins + t;
                model.accumulator[index] += 1;
                if (model.accumulator[index] > model.maxVote) model.maxVote = model.accumulator[index];
            }
        }
        model.lines = pickLinePeaks(model);
        return model.cursor >= state.edgePoints.length;
    }

    function pickLinePeaks(model) {
        const threshold = Number(els.lineVote.value);
        const maxLines = Number(els.maxLines.value);
        const peaks = [];
        for (let r = 1; r < model.rhoBins - 1; r += 1) {
            for (let t = 1; t < model.thetaBins - 1; t += 1) {
                const index = r * model.thetaBins + t;
                const value = model.accumulator[index];
                if (value < threshold) continue;
                if (value < model.accumulator[index - 1] || value < model.accumulator[index + 1]) continue;
                if (value < model.accumulator[index - model.thetaBins] || value < model.accumulator[index + model.thetaBins]) continue;
                peaks.push({ r, t, votes: value });
            }
        }
        peaks.sort((a, b) => b.votes - a.votes);
        return peaks.slice(0, maxLines).map((peak) => ({
            theta: peak.t * model.thetaStep,
            rho: peak.r * model.rhoResolution - model.diagonal,
            votes: peak.votes
        }));
    }

    function createCircleModel() {
        const radiusMin = Number(els.radiusMin.value);
        const radiusMax = Math.max(radiusMin, Number(els.radiusMax.value));
        const radiusStep = Number(els.radiusStep.value);
        const angles = [];
        for (let degree = 0; degree < 360; degree += 15) {
            const rad = degree * Math.PI / 180;
            angles.push([Math.cos(rad), Math.sin(rad)]);
        }
        const radii = [];
        for (let radius = radiusMin; radius <= radiusMax; radius += radiusStep) radii.push(radius);
        return {
            accumulator: new Uint16Array(state.width * state.height),
            cursor: 0,
            radii,
            angles,
            circles: [],
            maxVote: 0
        };
    }

    function voteCirclePoints(model, count) {
        const end = Math.min(state.edgePoints.length, model.cursor + count);
        for (; model.cursor < end; model.cursor += 1) {
            const point = state.edgePoints[model.cursor];
            model.radii.forEach((radius) => {
                model.angles.forEach(([cos, sin]) => {
                    const cx = Math.round(point.x - radius * cos);
                    const cy = Math.round(point.y - radius * sin);
                    if (cx < 0 || cy < 0 || cx >= state.width || cy >= state.height) return;
                    const index = cy * state.width + cx;
                    model.accumulator[index] += 1;
                    if (model.accumulator[index] > model.maxVote) model.maxVote = model.accumulator[index];
                });
            });
        }
        model.circles = pickCirclePeaks(model);
        return model.cursor >= state.edgePoints.length;
    }

    function pickCirclePeaks(model) {
        const threshold = Number(els.circleVote.value);
        const maxCircles = Number(els.maxCircles.value);
        const radius = model.radii[Math.floor(model.radii.length / 2)] || Number(els.radiusMin.value);
        const peaks = [];
        for (let y = 2; y < state.height - 2; y += 1) {
            for (let x = 2; x < state.width - 2; x += 1) {
                const index = y * state.width + x;
                const value = model.accumulator[index];
                if (value < threshold) continue;
                if (value < model.accumulator[index - 1] || value < model.accumulator[index + 1]) continue;
                if (value < model.accumulator[index - state.width] || value < model.accumulator[index + state.width]) continue;
                peaks.push({ x, y, radius, votes: value });
            }
        }
        peaks.sort((a, b) => b.votes - a.votes);
        return peaks.slice(0, maxCircles);
    }

    function drawAccumulator(canvas, accumulator, width, height, maxVote) {
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(width, height);
        const scale = maxVote ? 1 / maxVote : 0;
        for (let i = 0; i < accumulator.length; i += 1) {
            const value = Math.min(1, accumulator[i] * scale);
            imageData.data[i * 4] = Math.round(255 * value);
            imageData.data[i * 4 + 1] = Math.round(120 * value);
            imageData.data[i * 4 + 2] = Math.round(30 * (1 - value));
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
    }

    function drawLineAccumulator(canvas, model) {
        setCanvasSize(canvas, model.thetaBins, model.rhoBins);
        drawAccumulator(canvas, model.accumulator, model.thetaBins, model.rhoBins, model.maxVote);
        const context = canvas.getContext("2d");
        context.strokeStyle = "#22c55e";
        context.lineWidth = 1;
        model.lines.forEach((line) => {
            const t = Math.round(line.theta / model.thetaStep);
            const r = Math.round((line.rho + model.diagonal) / model.rhoResolution);
            context.beginPath();
            context.arc(t, r, 3, 0, Math.PI * 2);
            context.stroke();
        });
    }

    function drawCircleAccumulator(canvas, model) {
        setCanvasSize(canvas, state.width, state.height);
        drawAccumulator(canvas, model.accumulator, state.width, state.height, model.maxVote);
    }

    function drawLines(canvas, lines) {
        drawBaseOverlay(canvas, 0.68);
        const context = canvas.getContext("2d");
        context.strokeStyle = "#16a34a";
        context.lineWidth = 2;
        lines.forEach((line, index) => {
            const theta = line.theta * Math.PI / 180;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            const x0 = cos * line.rho;
            const y0 = sin * line.rho;
            const scale = Math.max(state.width, state.height);
            context.strokeStyle = colors[index % colors.length];
            context.beginPath();
            context.moveTo(x0 + scale * -sin, y0 + scale * cos);
            context.lineTo(x0 - scale * -sin, y0 - scale * cos);
            context.stroke();
        });
    }

    function drawCircles(canvas, circles) {
        drawBaseOverlay(canvas, 0.68);
        const context = canvas.getContext("2d");
        context.lineWidth = 2;
        circles.forEach((circle, index) => {
            context.strokeStyle = colors[index % colors.length];
            context.beginPath();
            context.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
            context.stroke();
            context.fillStyle = "#2563eb";
            context.fillRect(circle.x - 2, circle.y - 2, 4, 4);
        });
    }

    function drawContours(canvas, contours, noise, revealCount = contours.length, selected = -1) {
        drawBaseOverlay(canvas, 0.64);
        const context = canvas.getContext("2d");
        noise.forEach((contour) => {
            context.fillStyle = "rgba(100,116,139,0.34)";
            contour.points.forEach((index) => {
                context.fillRect(index % state.width, Math.floor(index / state.width), 1, 1);
            });
        });
        contours.slice(0, revealCount).forEach((contour, index) => {
            const color = colors[index % colors.length];
            context.fillStyle = index === selected ? "#22c55e" : color;
            contour.points.forEach((pointIndex) => {
                context.fillRect(pointIndex % state.width, Math.floor(pointIndex / state.width), 1, 1);
            });
            if (els.showBox.checked || index === selected) {
                context.strokeStyle = index === selected ? "#16a34a" : color;
                context.lineWidth = index === selected ? 3 : 1.5;
                context.strokeRect(contour.bbox.x, contour.bbox.y, contour.bbox.width, contour.bbox.height);
            }
            if (els.showId.checked) {
                context.fillStyle = color;
                context.font = "12px sans-serif";
                context.fillText(String(index + 1), contour.bbox.x + 3, contour.bbox.y + 13);
            }
        });
    }

    function updateInfo() {
        const mode = els.mode.value;
        const titles = {
            contour: "轮廓提取",
            line: "Hough 直线检测",
            circle: "Hough 圆检测"
        };
        const texts = {
            contour: "扫描边缘点，用连通性把相邻边缘组织成轮廓，并过滤小噪声区域。",
            line: "每个边缘点在 rho-theta 参数空间中生成一条正弦投票曲线，峰值对应原图直线。",
            circle: "边缘点对可能圆心投票，中心累加器中的峰值映射回原图形成检测圆。"
        };
        const formulas = {
            contour: `Connected Components by ${els.connectivity.value}-neighborhood`,
            line: "rho = x cos(theta) + y sin(theta)",
            circle: "(x - a)^2 + (y - b)^2 = r^2"
        };
        els.infoTitle.textContent = titles[mode];
        els.infoText.textContent = texts[mode];
        els.formula.textContent = formulas[mode];
    }

    function renderStats(entries) {
        els.stats.innerHTML = entries.map(([key, value]) => `
            <div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join("");
    }

    function resetModeData() {
        cancelAnimationFrame(state.raf);
        state.playing = false;
        els.play.textContent = "Play";
        state.phase = 2;
        renderTimeline();
        drawOriginal(els.canvasA);
        drawEdgeMap(els.canvasB);
        const mode = els.mode.value;
        if (mode === "contour") {
            const data = extractContours(state.edge, state.width, state.height, Number(els.connectivity.value), Number(els.minContour.value));
            state.modeData = { mode, ...data, reveal: 0 };
            els.panelA.textContent = "Original";
            els.panelB.textContent = "Edge Map";
            els.panelC.textContent = "Contour Overlay";
            drawContours(els.canvasC, data.contours, data.noise, 0);
        } else if (mode === "line") {
            state.modeData = { mode, model: createLineModel() };
            els.panelA.textContent = "Edge Map";
            els.panelB.textContent = "Hough Accumulator";
            els.panelC.textContent = "Line Overlay";
            drawEdgeMap(els.canvasA);
            drawLineAccumulator(els.canvasB, state.modeData.model);
            drawLines(els.canvasC, []);
        } else {
            state.modeData = { mode, model: createCircleModel() };
            els.panelA.textContent = "Edge Map";
            els.panelB.textContent = "Center Accumulator";
            els.panelC.textContent = "Circle Overlay";
            drawEdgeMap(els.canvasA);
            drawCircleAccumulator(els.canvasB, state.modeData.model);
            drawCircles(els.canvasC, []);
        }
        updateInfo();
        if (els.modePill) els.modePill.textContent = `当前模式：${modeTitle(mode)}`;
        renderProcessSteps();
        updateStats();
        setStatus("已生成前端边缘图，等待播放", "ready");
    }

    function updateStats() {
        if (!state.modeData) return;
        if (state.modeData.mode === "contour") {
            const selected = state.selectedContour >= 0 ? state.modeData.contours[state.selectedContour] : null;
            renderStats([
                ["contour count", state.modeData.contours.length],
                ["largest contour size", state.modeData.contours[0]?.size || 0],
                ["filtered noise count", state.modeData.noise.length],
                ["selected bbox", selected ? `${selected.bbox.x},${selected.bbox.y},${selected.bbox.width}x${selected.bbox.height}` : "-"],
                ["selected length", selected?.size || "-"]
            ]);
            return;
        }
        if (state.modeData.mode === "line") {
            const model = state.modeData.model;
            renderStats([
                ["edge points", state.edgePoints.length],
                ["theta bins", model.thetaBins],
                ["rho bins", model.rhoBins],
                ["accumulator size", `${model.thetaBins} x ${model.rhoBins}`],
                ["peak count", model.lines.length],
                ["detected lines", model.lines.length]
            ]);
            return;
        }
        const model = state.modeData.model;
        renderStats([
            ["radius range", `${els.radiusMin.value}-${Math.max(Number(els.radiusMin.value), Number(els.radiusMax.value))}`],
            ["radius step", els.radiusStep.value],
            ["center peaks", model.circles.length],
            ["detected circles", model.circles.length],
            ["max votes", model.maxVote]
        ]);
    }

    function stepAnimation() {
        if (!state.modeData) return true;
        const speed = speedMap[els.speed.value] || speedMap.medium;
        let done = false;
        if (state.modeData.mode === "contour") {
            state.phase = state.modeData.reveal < state.modeData.contours.length ? 4 : 6;
            state.modeData.reveal = Math.min(state.modeData.contours.length, state.modeData.reveal + Math.max(1, Math.round(speed.contour / 420)));
            drawContours(els.canvasC, state.modeData.contours, state.modeData.noise, state.modeData.reveal, state.selectedContour);
            done = state.modeData.reveal >= state.modeData.contours.length;
            setStatus(`linking contour ${state.modeData.reveal} / ${state.modeData.contours.length}`, done ? "ready" : "loading");
        } else if (state.modeData.mode === "line") {
            const model = state.modeData.model;
            state.phase = model.cursor < state.edgePoints.length ? 4 : 6;
            done = voteLinePoints(model, speed.line);
            drawLineAccumulator(els.canvasB, model);
            drawLines(els.canvasC, model.lines);
            setStatus(`processing point ${model.cursor} / ${state.edgePoints.length}`, done ? "ready" : "loading");
        } else {
            const model = state.modeData.model;
            state.phase = model.cursor < state.edgePoints.length ? 4 : 6;
            done = voteCirclePoints(model, speed.circle);
            drawCircleAccumulator(els.canvasB, model);
            drawCircles(els.canvasC, model.circles);
            setStatus(`processing point ${model.cursor} / ${state.edgePoints.length}`, done ? "ready" : "loading");
        }
        renderTimeline();
        renderProcessSteps();
        updateStats();
        return done;
    }

    function playLoop() {
        if (!state.playing) return;
        const done = stepAnimation();
        if (done) {
            state.playing = false;
            els.play.textContent = "Play";
            return;
        }
        state.raf = requestAnimationFrame(playLoop);
    }

    async function setImageSource(src, label) {
        try {
            cancelAnimationFrame(state.raf);
            state.playing = false;
            els.play.textContent = "Play";
            state.imageSrc = src;
            els.imageName.textContent = label;
            setStatus("正在读取图像", "loading");
            const image = await loadImage(src);
            prepareImage(image);
            resetModeData();
        } catch (error) {
            setStatus(error?.message || "图像读取失败", "warning");
        }
    }

    function bindEvents() {
        els.samples.addEventListener("click", (event) => {
            const button = event.target.closest("[data-sample]");
            if (!button) return;
            state.sample = button.dataset.sample;
            renderSamples();
            setImageSource(`${assetsBase}${state.sample}`, `当前使用示例图像：${button.title}`);
        });
        els.input.addEventListener("change", () => {
            const file = els.input.files && els.input.files[0];
            if (!file) return;
            state.sample = "";
            renderSamples();
            setImageSource(URL.createObjectURL(file), file.name);
        });
        els.mode.addEventListener("change", () => {
            updatePanelVisibility();
            resetModeData();
            startProcessMiniAnimation();
        });
        els.source.addEventListener("change", () => {
            state.edge = sobelEdge(state.gray, state.width, state.height, edgeThresholdForSource());
            state.edgePoints = collectEdgePoints(state.edge, state.width, state.height, 9000);
            resetModeData();
        });
        root.querySelectorAll("input, select").forEach((control) => {
            if ([els.input, els.mode, els.source].includes(control)) return;
            control.addEventListener("input", () => {
                updateRangeLabels();
                if (!state.imageData) return;
                state.edge = sobelEdge(state.gray, state.width, state.height, edgeThresholdForSource());
                state.edgePoints = collectEdgePoints(state.edge, state.width, state.height, 9000);
                resetModeData();
            });
        });
        els.play.addEventListener("click", () => {
            if (!state.modeData) return;
            state.playing = !state.playing;
            els.play.textContent = state.playing ? "Pause" : "Play";
            if (state.playing) playLoop();
        });
        if (els.start) {
            els.start.addEventListener("click", () => {
                resetModeData();
                state.playing = true;
                els.play.textContent = "Pause";
                playLoop();
            });
        }
        els.step.addEventListener("click", () => stepAnimation());
        els.reset.addEventListener("click", resetModeData);
        if (els.stagePlay) {
            els.stagePlay.addEventListener("click", () => {
                if (!state.modeData) return;
                state.playing = true;
                els.play.textContent = "Pause";
                playLoop();
            });
        }
        if (els.stagePause) {
            els.stagePause.addEventListener("click", () => {
                state.playing = false;
                els.play.textContent = "Play";
            });
        }
        if (els.stageStep) els.stageStep.addEventListener("click", () => stepAnimation());
        if (els.stageReset) els.stageReset.addEventListener("click", resetModeData);
        if (els.stageSpeed) {
            els.stageSpeed.addEventListener("change", () => {
                els.speed.value = els.stageSpeed.value;
            });
        }
        els.speed.addEventListener("change", () => {
            if (els.stageSpeed) els.stageSpeed.value = els.speed.value;
        });
        els.timeline.addEventListener("click", (event) => {
            const item = event.target.closest("[data-flow-index]");
            if (!item) return;
            state.phase = Number(item.dataset.flowIndex);
            renderTimeline();
            renderProcessSteps();
        });
        els.canvasC.addEventListener("click", (event) => {
            if (!state.modeData || state.modeData.mode !== "contour") return;
            const rect = els.canvasC.getBoundingClientRect();
            const x = Math.round((event.clientX - rect.left) * state.width / rect.width);
            const y = Math.round((event.clientY - rect.top) * state.height / rect.height);
            state.selectedContour = state.modeData.contours.findIndex((contour) => (
                x >= contour.bbox.x
                && y >= contour.bbox.y
                && x <= contour.bbox.x + contour.bbox.width
                && y <= contour.bbox.y + contour.bbox.height
            ));
            drawContours(els.canvasC, state.modeData.contours, state.modeData.noise, state.modeData.reveal, state.selectedContour);
            updateStats();
        });
    }

    updateRangeLabels();
    updatePanelVisibility();
    renderSamples();
    renderTimeline();
    bindEvents();
    startProcessMiniAnimation();
    setImageSource(`${assetsBase}${state.sample}`, "当前使用示例图像");
})();
