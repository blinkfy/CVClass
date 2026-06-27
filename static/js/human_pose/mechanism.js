(function () {
    const root = document.querySelector("[data-human-pose-mechanism]");
    if (!root) return;

    const basePath = window.CVCLASS_BASE_PATH || "";
    const SVG_NS = "http://www.w3.org/2000/svg";

    const el = {
        modeButtons: Array.from(root.querySelectorAll("[data-mechanism-mode]")),
        stepList: root.querySelector("[data-mechanism-step-list]"),
        play: root.querySelector("[data-mechanism-play]"),
        reset: root.querySelector("[data-mechanism-reset]"),
        title: root.querySelector("[data-mechanism-title]"),
        chip: root.querySelector("[data-mechanism-chip]"),
        version: root.querySelector("[data-mechanism-version]"),
        canvas: root.querySelector("[data-mechanism-canvas]"),
        imageFrame: root.querySelector("[data-mechanism-image-frame]"),
        image: root.querySelector("[data-mechanism-image]"),
        overlay: root.querySelector("[data-mechanism-overlay]"),
        mask: root.querySelector("[data-mechanism-mask]"),
        maskCut: root.querySelector("[data-mechanism-mask-cut]"),
        loading: root.querySelector("[data-mechanism-loading]"),
        bboxLayer: root.querySelector("[data-mechanism-bbox-layer]"),
        skeletonLayer: root.querySelector("[data-mechanism-skeleton-layer]"),
        pointLayer: root.querySelector("[data-mechanism-point-layer]"),
        heatLayer: root.querySelector("[data-mechanism-heat-layer]"),
        stageLabel: root.querySelector("[data-mechanism-stage-label]"),
        stageNote: root.querySelector("[data-mechanism-stage-note]"),
        featureGrid: root.querySelector("[data-mechanism-feature-grid]"),
        vectorCard: root.querySelector("[data-mechanism-vector-card]"),
        vector: root.querySelector("[data-mechanism-vector]"),
        coordinateGrid: root.querySelector("[data-mechanism-coordinate-grid]"),
        heatmapList: root.querySelector("[data-mechanism-heatmap-list]"),
        readoutKind: root.querySelector("[data-mechanism-readout-kind]"),
        readoutTitle: root.querySelector("[data-mechanism-readout-title]"),
        input: root.querySelector("[data-mechanism-input]"),
        output: root.querySelector("[data-mechanism-output]"),
        modeLabel: root.querySelector("[data-mechanism-mode-label]"),
        sample: root.querySelector("[data-mechanism-sample]"),
        formula: root.querySelector("[data-mechanism-formula]"),
        formulaNote: root.querySelector("[data-mechanism-formula-note]"),
        summaryTitle: root.querySelector("[data-mechanism-summary-title]"),
        summary: root.querySelector("[data-mechanism-summary]"),
        status: root.querySelector("[data-mechanism-status]"),
        flow: root.querySelector("[data-mechanism-flow]"),
        stepper: document.querySelector("[data-mechanism-stepper]"),
    };

    const state = {
        data: null,
        samplesData: null,
        skeletonData: null,
        sample: null,
        mode: "deeppose",
        stepIndex: 0,
        selectedHeatmapId: 0,
        timer: 0,
        imageLoaded: false,
    };

    function cvUrl(path) {
        if (!path || /^(https?:|data:|blob:)/i.test(path)) return path;
        return `${basePath}${path}`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function fetchJson(url) {
        return fetch(url, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
            return response.json();
        });
    }

    function activeModeData() {
        return state.data?.[state.mode] || state.data?.deeppose || { steps: [] };
    }

    function activeSteps() {
        return activeModeData().steps || [];
    }

    function currentStep() {
        return activeSteps()[state.stepIndex] || activeSteps()[0] || {};
    }

    function keypointById(id) {
        return state.sample?.keypoints?.find((point) => point.id === Number(id));
    }

    function cocoPairs() {
        return state.skeletonData?.templates?.coco17?.pairs || [];
    }

    function normalizedPointRows() {
        const bbox = state.sample?.bbox || [0, 0, 1, 1];
        return (state.data?.deeppose?.normalizedPoints || []).map((point) => ({
            ...point,
            x: Math.round(bbox[0] + point.nx * bbox[2]),
            y: Math.round(bbox[1] + point.ny * bbox[3]),
        }));
    }

    function activeHeatmap() {
        const heatmaps = state.data?.heatmap?.heatmaps || [];
        return heatmaps.find((item) => item.id === Number(state.selectedHeatmapId)) || heatmaps[0];
    }

    function setPlaying(isPlaying) {
        root.classList.toggle("is-playing", isPlaying);
        if (el.play) el.play.textContent = isPlaying ? "播放中 · 点击停止" : "播放流程";
    }

    function stopPlayback() {
        if (state.timer) {
            window.clearTimeout(state.timer);
            state.timer = 0;
        }
        setPlaying(false);
    }

    function setMode(mode) {
        stopPlayback();
        state.mode = mode === "heatmap" ? "heatmap" : "deeppose";
        state.stepIndex = 0;
        const firstHeatmap = state.data?.heatmap?.heatmaps?.[0];
        if (firstHeatmap) state.selectedHeatmapId = firstHeatmap.id;
        renderAll();
    }

    function setStep(index) {
        stopPlayback();
        state.stepIndex = Math.max(0, Math.min(index, activeSteps().length - 1));
        renderAll();
    }

    function startPlayback() {
        if (state.timer) {
            stopPlayback();
            return;
        }

        const steps = activeSteps();
        if (!steps.length) return;
        state.stepIndex = 0;
        renderAll();
        setPlaying(true);

        const advance = () => {
            if (state.stepIndex >= steps.length - 1) {
                stopPlayback();
                return;
            }
            state.stepIndex += 1;
            renderAll();
            state.timer = window.setTimeout(advance, 850);
        };

        state.timer = window.setTimeout(advance, 850);
    }

    function renderImageOnce() {
        if (!state.sample || !el.image || !el.overlay) return;

        el.imageFrame.style.setProperty("--pose-aspect", `${state.sample.imageWidth} / ${state.sample.imageHeight}`);
        el.overlay.setAttribute("viewBox", `0 0 ${state.sample.imageWidth} ${state.sample.imageHeight}`);
        if (el.mask) {
            el.mask.setAttribute("x", 0);
            el.mask.setAttribute("y", 0);
            el.mask.setAttribute("width", state.sample.imageWidth);
            el.mask.setAttribute("height", state.sample.imageHeight);
        }
        if (el.image.getAttribute("src") !== cvUrl(state.sample.image)) {
            state.imageLoaded = false;
            el.imageFrame.classList.remove("is-loaded");
            el.image.src = cvUrl(state.sample.image);
            el.image.alt = `${state.sample.label} · 姿态估计机制预设样例`;
        }
    }

    function svgNode(name, attributes = {}) {
        const node = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => {
            if (value !== null && value !== undefined) node.setAttribute(key, value);
        });
        return node;
    }

    function appendSvg(parent, node) {
        if (parent) parent.appendChild(node);
        return node;
    }

    function renderFeatureOverlay(stepId) {
        if (!state.sample || !el.heatLayer) return;
        const bbox = state.sample.bbox;
        if (!["feature", "regress", "feature_map", "heatmaps"].includes(stepId)) return;

        const columns = 5;
        const rows = 4;
        const cellW = bbox[2] / columns;
        const cellH = bbox[3] / rows;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const active = (row + column + state.stepIndex) % 3 === 0;
                appendSvg(el.heatLayer, svgNode("rect", {
                    class: `mechanism-feature-cell${active ? " is-active" : ""}`,
                    x: bbox[0] + column * cellW + 2,
                    y: bbox[1] + row * cellH + 2,
                    width: Math.max(4, cellW - 4),
                    height: Math.max(4, cellH - 4),
                    rx: 5,
                }));
            }
        }
    }

    function renderSkeletonLines(showSkeleton) {
        if (!showSkeleton || !state.sample || !el.skeletonLayer) return;
        cocoPairs().forEach((pair, index) => {
            const from = keypointById(pair[0]);
            const to = keypointById(pair[1]);
            if (!from || !to) return;
            const length = Math.hypot(to.x - from.x, to.y - from.y).toFixed(2);
            appendSvg(el.skeletonLayer, svgNode("line", {
                class: "mechanism-skeleton-line",
                x1: from.x,
                y1: from.y,
                x2: to.x,
                y2: to.y,
                style: `--line-length:${length};transition-delay:${index * 32}ms`,
            }));
        });
    }

    function renderKeypoint(point, className, label) {
        const group = svgNode("g", {
            class: className,
            transform: `translate(${point.x} ${point.y})`,
        });
        appendSvg(group, svgNode("circle", { r: 6 }));
        if (label) {
            const text = svgNode("text", { x: 9, y: -9 });
            text.textContent = label;
            appendSvg(group, text);
        }
        appendSvg(el.pointLayer, group);
    }

    function renderDeepPosePoints(stepId) {
        if (!state.sample || !el.pointLayer) return;
        if (stepId === "absolute") {
            normalizedPointRows().forEach((point) => renderKeypoint(point, "mechanism-keypoint is-vector-point", point.name));
            return;
        }
        if (stepId === "refine") {
            state.sample.keypoints.forEach((point) => renderKeypoint(point, "mechanism-keypoint", point.id));
        }
    }

    function renderHeatmapPeaks(stepId) {
        if (!state.sample || !el.heatLayer || !el.pointLayer) return;
        if (!["heatmaps", "peak", "skeleton"].includes(stepId)) return;

        const selected = activeHeatmap();
        const heatmaps = state.data?.heatmap?.heatmaps || [];
        heatmaps.forEach((point) => {
            const isSelected = selected && point.id === selected.id;
            const heat = svgNode("circle", {
                class: `mechanism-heat-blob${isSelected ? " is-selected" : ""}`,
                cx: point.x,
                cy: point.y,
                r: isSelected ? 34 : 24,
                style: `--heat-color:${point.color || "#12b5d0"}`,
            });
            appendSvg(el.heatLayer, heat);
        });

        if (stepId === "peak" && selected) {
            renderKeypoint(selected, "mechanism-keypoint is-peak-point is-selected", selected.name);
            return;
        }

        if (stepId === "skeleton") {
            state.sample.keypoints.forEach((point) => renderKeypoint(point, "mechanism-keypoint", point.id));
        }
    }

    function renderOverlay() {
        if (!state.sample || !el.overlay) return;

        const step = currentStep();
        const stepId = step.id || "";
        const bbox = state.sample.bbox;
        [el.bboxLayer, el.skeletonLayer, el.pointLayer, el.heatLayer].forEach((layer) => {
            if (layer) layer.innerHTML = "";
        });

        if (el.maskCut) {
            el.maskCut.setAttribute("x", bbox[0]);
            el.maskCut.setAttribute("y", bbox[1]);
            el.maskCut.setAttribute("width", bbox[2]);
            el.maskCut.setAttribute("height", bbox[3]);
        }

        appendSvg(el.bboxLayer, svgNode("rect", {
            class: "mechanism-bbox",
            x: bbox[0],
            y: bbox[1],
            width: bbox[2],
            height: bbox[3],
            rx: 10,
        }));

        renderFeatureOverlay(stepId);

        if (state.mode === "deeppose") {
            renderSkeletonLines(stepId === "refine");
            renderDeepPosePoints(stepId);
        } else {
            renderSkeletonLines(stepId === "skeleton");
            renderHeatmapPeaks(stepId);
        }
    }

    function renderStepList() {
        const steps = activeSteps();
        if (!el.stepList) return;

        el.stepList.innerHTML = steps.map((step, index) => `
            <button
                type="button"
                class="${index === state.stepIndex ? "is-active" : ""}"
                data-mechanism-step="${index}"
            >
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(step.label)}</strong>
                <small>${escapeHtml(step.input)} → ${escapeHtml(step.output)}</small>
            </button>
        `).join("");

        el.stepList.querySelectorAll("[data-mechanism-step]").forEach((button) => {
            button.addEventListener("click", () => setStep(Number(button.dataset.mechanismStep)));
        });
    }

    function renderFlow() {
        const steps = activeSteps();
        if (!el.flow) return;
        el.flow.innerHTML = steps.map((step, index) => `
            <article class="${index === state.stepIndex ? "is-active" : ""} ${index < state.stepIndex ? "is-done" : ""}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(step.label)}</strong>
                <small>${escapeHtml(step.output)}</small>
            </article>
            ${index < steps.length - 1 ? "<b></b>" : ""}
        `).join("");
    }

    function renderStepper() {
        const steps = activeSteps();
        if (!el.stepper) return;
        el.stepper.innerHTML = steps.map((step, index) => `
            <li class="${index === state.stepIndex ? "is-active" : ""}">
                <span>${index + 1}</span>
                <div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.output)}</small></div>
            </li>
        `).join("");
    }

    function renderFeatureGrid() {
        if (!el.featureGrid) return;
        const active = ["feature", "regress", "feature_map", "heatmaps"].includes(currentStep().id);
        el.featureGrid.innerHTML = Array.from({ length: 24 }, (_, index) => {
            const hot = active && (index + state.stepIndex) % 4 === 0;
            return `<i class="${hot ? "is-active" : ""}" style="transition-delay:${index * 12}ms"></i>`;
        }).join("");
        el.featureGrid.classList.toggle("is-active", active);
    }

    function renderCoordinateGrid() {
        if (!el.coordinateGrid || !el.vector) return;
        const rows = normalizedPointRows();
        el.vector.textContent = `[${rows.map((point) => `${point.nx.toFixed(3)}, ${point.ny.toFixed(3)}`).join(", ")}]`;
        el.coordinateGrid.innerHTML = rows.map((point) => `
            <article>
                <span>${escapeHtml(point.name)}</span>
                <strong>(${point.nx.toFixed(3)}, ${point.ny.toFixed(3)})</strong>
                <small>→ (${point.x}, ${point.y})</small>
            </article>
        `).join("");
        const visible = state.mode === "deeppose" && ["regress", "absolute", "refine"].includes(currentStep().id);
        el.vectorCard?.classList.toggle("is-active", visible);
        el.coordinateGrid.classList.toggle("is-active", visible);
    }

    function renderHeatmapList() {
        if (!el.heatmapList) return;
        const heatmaps = state.data?.heatmap?.heatmaps || [];
        const width = state.sample?.imageWidth || 640;
        const height = state.sample?.imageHeight || 427;
        const visible = state.mode === "heatmap" && ["heatmaps", "peak", "skeleton"].includes(currentStep().id);

        el.heatmapList.innerHTML = heatmaps.map((point) => {
            const peakX = Math.max(4, Math.min(96, (point.x / width) * 100));
            const peakY = Math.max(4, Math.min(96, (point.y / height) * 100));
            return `
                <button
                    type="button"
                    class="${point.id === Number(state.selectedHeatmapId) ? "is-active" : ""}"
                    data-heatmap-id="${point.id}"
                    style="--peak-x:${peakX}%;--peak-y:${peakY}%;--heat-color:${escapeHtml(point.color || "#12b5d0")}"
                >
                    <i></i>
                    <span>${escapeHtml(point.name)}</span>
                    <strong>${Number(point.score).toFixed(2)}</strong>
                </button>
            `;
        }).join("");

        el.heatmapList.querySelectorAll("[data-heatmap-id]").forEach((button) => {
            button.addEventListener("click", () => {
                state.selectedHeatmapId = Number(button.dataset.heatmapId);
                renderAll();
            });
        });

        el.heatmapList.classList.toggle("is-active", visible);
    }

    function updateReadout() {
        const modeData = activeModeData();
        const step = currentStep();
        const selected = activeHeatmap();
        const isHeatmap = state.mode === "heatmap";

        if (el.title) el.title.textContent = modeData.label || "";
        if (el.chip) el.chip.textContent = isHeatmap ? "Heatmap" : "DeepPose";
        if (el.stageLabel) el.stageLabel.textContent = step.label || "";
        if (el.stageNote) el.stageNote.textContent = step.note || "";
        if (el.readoutKind) el.readoutKind.textContent = isHeatmap ? "Heatmap Decode" : "DeepPose Regression";
        if (el.readoutTitle) el.readoutTitle.textContent = step.label || "--";
        if (el.input) el.input.textContent = step.input || "--";
        if (el.output) el.output.textContent = step.output || "--";
        if (el.modeLabel) el.modeLabel.textContent = isHeatmap ? "峰值定位" : "坐标回归";
        if (el.sample) el.sample.textContent = state.sample?.id || state.data?.sampleId || "--";
        if (el.formula) el.formula.textContent = step.formula || "--";
        if (el.formulaNote) {
            el.formulaNote.textContent = isHeatmap && selected && step.id === "peak"
                ? `当前示例峰值：${selected.name} (${selected.x}, ${selected.y}), score ${Number(selected.score).toFixed(2)}。`
                : step.note || modeData.summary || "";
        }
        if (el.summaryTitle) el.summaryTitle.textContent = modeData.label || "";
        if (el.summary) el.summary.textContent = modeData.summary || "";
        if (el.status) el.status.textContent = `${state.data?.pageStatus || "预设样例 · 机制拆解"}；未接入真实推理模型。`;
        if (el.version) el.version.textContent = state.data?.pageStatus || "预设样例 · 机制拆解";

        el.modeButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.mechanismMode === state.mode);
        });

        root.dataset.mode = state.mode;
        root.dataset.step = step.id || "";
        el.canvas?.setAttribute("data-mode", state.mode);
        el.canvas?.setAttribute("data-step", step.id || "");
    }

    function renderAll() {
        renderImageOnce();
        updateReadout();
        renderStepList();
        renderFlow();
        renderStepper();
        renderFeatureGrid();
        renderCoordinateGrid();
        renderHeatmapList();
        renderOverlay();
    }

    function bindEvents() {
        el.modeButtons.forEach((button) => {
            button.addEventListener("click", () => setMode(button.dataset.mechanismMode));
        });
        el.play?.addEventListener("click", startPlayback);
        el.reset?.addEventListener("click", () => {
            stopPlayback();
            state.stepIndex = 0;
            renderAll();
        });
        el.image?.addEventListener("load", () => {
            state.imageLoaded = true;
            el.imageFrame?.classList.add("is-loaded");
        });
        window.addEventListener("beforeunload", stopPlayback);
    }

    function init() {
        bindEvents();

        Promise.all([
            fetchJson(root.dataset.mechanismDataUrl),
            fetchJson(root.dataset.poseSamplesUrl),
            fetchJson(root.dataset.poseSkeletonsUrl),
        ])
            .then(([mechanismData, samplesData, skeletonData]) => {
                state.data = mechanismData;
                state.samplesData = samplesData;
                state.skeletonData = skeletonData;
                state.sample = samplesData.samples.find((sample) => sample.id === mechanismData.sampleId)
                    || samplesData.samples.find((sample) => sample.id === samplesData.defaultSample)
                    || samplesData.samples[0];
                const firstHeatmap = mechanismData.heatmap?.heatmaps?.[0];
                if (firstHeatmap) state.selectedHeatmapId = firstHeatmap.id;
                renderAll();
            })
            .catch((error) => {
                console.error("Failed to load human pose mechanism data", error);
                if (el.loading) el.loading.textContent = "姿态机制预设数据加载失败，请检查 JSON 文件。";
                if (el.status) el.status.textContent = "数据加载失败";
            });
    }

    init();
}());
