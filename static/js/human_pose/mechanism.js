(function () {
    const root = document.querySelector("[data-human-pose-mechanism]");
    if (!root) return;

    const basePath = window.CVCLASS_BASE_PATH || "";
    const SVG_NS = "http://www.w3.org/2000/svg";

    const el = {
        modeButtons: Array.from(root.querySelectorAll("[data-mechanism-mode]")),
        stepList: root.querySelector("[data-mechanism-step-list]"),
        play: root.querySelector("[data-mechanism-play]"),
        prev: root.querySelector("[data-mechanism-prev]"),
        next: root.querySelector("[data-mechanism-next]"),
        reset: root.querySelector("[data-mechanism-reset]"),
        speed: root.querySelector("[data-mechanism-speed]"),
        title: root.querySelector("[data-mechanism-title]"),
        chip: root.querySelector("[data-mechanism-chip]"),
        version: root.querySelector("[data-mechanism-version]"),
        canvas: root.querySelector("[data-mechanism-canvas]"),
        computeBoard: root.querySelector("[data-mechanism-compute-board]"),
        imageFrame: root.querySelector("[data-mechanism-image-frame]"),
        image: root.querySelector("[data-mechanism-image]"),
        overlay: root.querySelector("[data-mechanism-overlay]"),
        operationLayer: root.querySelector("[data-mechanism-operation-layer]"),
        mask: root.querySelector("[data-mechanism-mask]"),
        maskCut: root.querySelector("[data-mechanism-mask-cut]"),
        loading: root.querySelector("[data-mechanism-loading]"),
        bboxLayer: root.querySelector("[data-mechanism-bbox-layer]"),
        skeletonLayer: root.querySelector("[data-mechanism-skeleton-layer]"),
        pointLayer: root.querySelector("[data-mechanism-point-layer]"),
        heatLayer: root.querySelector("[data-mechanism-heat-layer]"),
        stageLabel: root.querySelector("[data-mechanism-stage-label]"),
        stageNote: root.querySelector("[data-mechanism-stage-note]"),
        cropPreview: root.querySelector("[data-mechanism-crop-preview]"),
        featureGrid: root.querySelector("[data-mechanism-feature-grid]"),
        featureCaption: root.querySelector("[data-mechanism-feature-caption]"),
        outputHead: root.querySelector("[data-mechanism-output-head]"),
        deepposeOutput: root.querySelector("[data-mechanism-deeppose-output]"),
        heatmapOutput: root.querySelector("[data-mechanism-heatmap-output]"),
        vectorCard: root.querySelector("[data-mechanism-vector-card]"),
        vector: root.querySelector("[data-mechanism-vector]"),
        coordinateGrid: root.querySelector("[data-mechanism-coordinate-grid]"),
        heatmapList: root.querySelector("[data-mechanism-heatmap-list]"),
        argmaxPanel: root.querySelector("[data-mechanism-argmax]"),
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
        speed: 1,
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
        if (el.play) {
            el.play.textContent = isPlaying ? "暂停" : "播放流程";
            el.play.setAttribute("aria-pressed", isPlaying ? "true" : "false");
        }
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

    function playbackDelay() {
        return Math.max(380, Math.round(1050 / Math.max(0.5, state.speed || 1)));
    }

    function setStep(index, options = {}) {
        if (options.stopPlayback !== false) stopPlayback();
        state.stepIndex = Math.max(0, Math.min(index, activeSteps().length - 1));
        renderAll();
    }

    function goPrev() {
        setStep(state.stepIndex - 1);
    }

    function goNext() {
        setStep(state.stepIndex + 1);
    }

    function startPlayback() {
        if (state.timer) {
            stopPlayback();
            return;
        }

        const steps = activeSteps();
        if (!steps.length) return;
        if (state.stepIndex >= steps.length - 1) state.stepIndex = 0;
        renderAll();
        setPlaying(true);

        const advance = () => {
            if (state.stepIndex >= steps.length - 1) {
                stopPlayback();
                return;
            }
            state.stepIndex += 1;
            renderAll();
            state.timer = window.setTimeout(advance, playbackDelay());
        };

        state.timer = window.setTimeout(advance, playbackDelay());
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

    function renderCropPreview() {
        if (!state.sample || !el.cropPreview) return;
        const bbox = state.sample.bbox || [0, 0, state.sample.imageWidth || 1, state.sample.imageHeight || 1];
        const imageWidth = state.sample.imageWidth || 1;
        const imageHeight = state.sample.imageHeight || 1;
        const xRange = Math.max(1, imageWidth - bbox[2]);
        const yRange = Math.max(1, imageHeight - bbox[3]);
        const imageUrl = cvUrl(state.sample.image);
        el.cropPreview.style.backgroundImage = `url("${imageUrl}")`;
        el.cropPreview.style.backgroundSize = `${(imageWidth / bbox[2]) * 100}% ${(imageHeight / bbox[3]) * 100}%`;
        el.cropPreview.style.backgroundPosition = `${(bbox[0] / xRange) * 100}% ${(bbox[1] / yRange) * 100}%`;
        el.cropPreview.innerHTML = `<span>${Math.round(bbox[2])} × ${Math.round(bbox[3])} 人体 crop</span>`;
    }

    function bboxPercentStyles(bbox = state.sample?.bbox || [0, 0, 1, 1]) {
        const width = state.sample?.imageWidth || 1;
        const height = state.sample?.imageHeight || 1;
        return {
            left: (bbox[0] / width) * 100,
            top: (bbox[1] / height) * 100,
            width: (bbox[2] / width) * 100,
            height: (bbox[3] / height) * 100,
        };
    }

    function pointPercentStyles(point) {
        const width = state.sample?.imageWidth || 1;
        const height = state.sample?.imageHeight || 1;
        return {
            left: (point.x / width) * 100,
            top: (point.y / height) * 100,
        };
    }

    function renderFeatureCells(count = 20, showValues = true) {
        return Array.from({ length: count }, (_, index) => {
            const hot = (index + state.stepIndex) % 4 === 0;
            const value = (((index * 13 + state.stepIndex * 19) % 88) / 100 + 0.09).toFixed(2);
            return `<i class="${hot ? "is-hot" : ""}" style="--delay:${index * 18}ms">${showValues ? value : ""}</i>`;
        }).join("");
    }

    function renderOperationLayer() {
        if (!state.sample || !el.operationLayer) return;
        const step = currentStep();
        const stepId = step.id || "";
        const bbox = state.sample.bbox || [0, 0, state.sample.imageWidth || 1, state.sample.imageHeight || 1];
        const box = bboxPercentStyles(bbox);
        const selected = activeHeatmap();
        const normalizedRows = normalizedPointRows();
        const cropActive = ["crop", "image"].includes(stepId);
        const featureActive = ["feature", "regress", "feature_map", "heatmaps"].includes(stepId);
        const vectorActive = ["regress", "absolute", "refine"].includes(stepId);
        const heatmapActive = ["heatmaps", "peak", "skeleton"].includes(stepId);
        const argmaxActive = stepId === "peak" && selected;
        const skeletonActive = ["refine", "skeleton"].includes(stepId);
        const regionClasses = [
            "mechanism-operation-region",
            featureActive ? "is-feature" : "",
            vectorActive ? "is-vector" : "",
            heatmapActive ? "is-heatmap" : "",
            skeletonActive ? "is-skeleton" : "",
            stepId ? `is-step-${stepId}` : "",
        ].filter(Boolean).join(" ");

        function renderMapLine(to, index, from = { left: box.left + box.width + 5, top: box.top + box.height * 0.36 }) {
            const dx = to.left - from.left;
            const dy = to.top - from.top;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            return `
                <i
                    class="mechanism-map-line"
                    style="left:${from.left}%;top:${from.top}%;width:${length}%;--angle:${angle}rad;--delay:${index * 76}ms"
                ></i>
            `;
        }

        const imageUrl = cvUrl(state.sample.image);
        const xRange = Math.max(1, (state.sample.imageWidth || 1) - bbox[2]);
        const yRange = Math.max(1, (state.sample.imageHeight || 1) - bbox[3]);
        const cropGhost = cropActive ? `
            <i
                class="mechanism-crop-ghost"
                style="
                    left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%;
                    background-image:url('${imageUrl}');
                    background-size:${((state.sample.imageWidth || 1) / bbox[2]) * 100}% ${((state.sample.imageHeight || 1) / bbox[3]) * 100}%;
                    background-position:${(bbox[0] / xRange) * 100}% ${(bbox[1] / yRange) * 100}%;
                "
            ></i>
            <i
                class="mechanism-crop-path"
                style="left:${box.left + box.width * 0.5}%;top:${box.top + box.height * 0.5}%;width:${Math.min(32, box.width * 0.72)}%;--angle:-0.45rad"
            ></i>
        ` : "";

        const featureParticles = featureActive ? Array.from({ length: 14 }, (_, index) => `
            <i
                class="mechanism-feature-particle"
                style="--x:${18 + (index % 5) * 16}%;--y:${18 + Math.floor(index / 5) * 24}%;--delay:${index * 42}ms"
            ></i>
        `).join("") : "";

        const vectorBeads = normalizedRows.map((point, index) => `
            <i
                class="mechanism-vector-bead"
                style="--x:${18 + index * 15}%;--y:${62 + (index % 2) * 17}%;--delay:${index * 70}ms"
            ></i>
        `).join("");

        const projectionDots = normalizedRows.map((point, index) => {
            const pos = pointPercentStyles(point);
            return `
                <i class="mechanism-projection-dot" style="left:${pos.left}%;top:${pos.top}%;--delay:${index * 64}ms"></i>
            `;
        }).join("");

        const projectionLines = (stepId === "absolute" || skeletonActive) ? normalizedRows.map((point, index) => {
            const pos = pointPercentStyles(point);
            return renderMapLine(pos, index);
        }).join("") : "";

        const heatmapNodes = (state.data?.heatmap?.heatmaps || []).map((point, index) => {
            const pos = pointPercentStyles(point);
            const selectedClass = selected && point.id === selected.id ? " is-selected" : "";
            return `
                <i class="mechanism-operation-heat${selectedClass}" style="left:${pos.left}%;top:${pos.top}%;--heat-color:${escapeHtml(point.color || "#12b5d0")};--delay:${index * 45}ms"></i>
            `;
        }).join("");

        const argmaxCandidates = selected ? [0.54, 0.73, Number(selected.score || 0.96), 0.61].map((value, index) => `
            <i
                class="${index === 2 ? "is-winner" : ""}"
                style="--delay:${index * 72}ms;--candidate-scale:${Math.max(0.58, value).toFixed(2)}"
            ></i>
        `).join("") : "";
        const selectedPos = selected ? pointPercentStyles(selected) : { left: box.left + box.width / 2, top: box.top + box.height / 2 };
        const peakProjection = argmaxActive ? `
            ${renderMapLine(selectedPos, 0, { left: Math.min(96, selectedPos.left + 10), top: Math.max(4, selectedPos.top - 16) })}
            <i class="mechanism-projection-dot is-peak-drop" style="left:${selectedPos.left}%;top:${selectedPos.top}%;--delay:120ms"></i>
        ` : "";

        el.operationLayer.innerHTML = `
            <div class="${regionClasses}"
                style="left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%">
                <div class="mechanism-operation-scan"></div>
                <div class="mechanism-operation-feature-grid">${renderFeatureCells(20, false)}</div>
                <div class="mechanism-operation-particles">${featureParticles}</div>
                <div class="mechanism-operation-vector">${vectorBeads}</div>
            </div>
            ${cropGhost}
            ${projectionLines}
            ${peakProjection}
            ${vectorActive || skeletonActive ? projectionDots : ""}
            ${heatmapActive ? heatmapNodes : ""}
            ${argmaxActive ? `
                <div class="mechanism-argmax-graphic" style="left:${selectedPos.left}%;top:${selectedPos.top}%">
                    <b></b>
                    ${argmaxCandidates}
                </div>
            ` : ""}
        `;
        el.operationLayer.setAttribute("data-mode", state.mode);
        el.operationLayer.setAttribute("data-step", stepId);
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
                style: `--line-length:${length};animation-delay:${index * 34}ms`,
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
            normalizedPointRows().forEach((point) => renderKeypoint(point, "mechanism-keypoint is-vector-point"));
            return;
        }
        if (stepId === "refine") {
            state.sample.keypoints.forEach((point) => renderKeypoint(point, "mechanism-keypoint"));
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
            renderKeypoint(selected, "mechanism-keypoint is-peak-point is-selected");
            return;
        }

        if (stepId === "skeleton") {
            state.sample.keypoints.forEach((point) => renderKeypoint(point, "mechanism-keypoint"));
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
                class="${index === state.stepIndex ? "is-active" : ""} ${index < state.stepIndex ? "is-done" : ""}"
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
            <li class="${index === state.stepIndex ? "is-active" : ""} ${index < state.stepIndex ? "is-done" : ""}">
                <span>${index + 1}</span>
                <div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.output)}</small></div>
            </li>
        `).join("");
    }

    function renderFeatureGrid() {
        if (!el.featureGrid) return;
        const stepId = currentStep().id;
        const active = ["feature", "regress", "absolute", "feature_map", "heatmaps", "peak"].includes(stepId);
        const channels = ["边缘", "肩部", "躯干", "肢体", "纹理", "上下文"];
        el.featureGrid.innerHTML = Array.from({ length: 24 }, (_, index) => {
            const hot = active && (index + state.stepIndex) % 4 === 0;
            const strong = active && (index + state.stepIndex) % 7 === 0;
            const value = (((index * 17 + state.stepIndex * 11) % 91) / 100 + 0.08).toFixed(2);
            return `
                <i class="${hot ? "is-active" : ""} ${strong ? "is-strong" : ""}" style="transition-delay:${index * 12}ms">
                    <b>${value}</b>
                </i>
            `;
        }).join("");
        el.featureGrid.classList.toggle("is-active", active);
        if (el.featureCaption) {
            el.featureCaption.textContent = active
                ? `${channels[state.stepIndex % channels.length]}响应组 · ${currentStep().label || stepId}`
                : "人体 crop 进入 CNN 后逐步激活特征图";
        }
    }

    function renderCoordinateGrid() {
        if (!el.coordinateGrid || !el.vector) return;
        const rows = normalizedPointRows();
        el.vector.innerHTML = rows.map((point, index) => `
            <span class="mechanism-vector-token" style="--delay:${index * 54}ms">
                <em>${escapeHtml(point.name)}</em>
                <strong>${point.nx.toFixed(3)}, ${point.ny.toFixed(3)}</strong>
            </span>
        `).join("");
        el.coordinateGrid.innerHTML = rows.map((point) => `
            <article>
                <span>${escapeHtml(point.name)}</span>
                <strong>${point.nx.toFixed(3)} × bbox_w + bbox_x</strong>
                <i></i>
                <small>(${point.x}, ${point.y})</small>
            </article>
        `).join("");
        const stepId = currentStep().id;
        const vectorVisible = state.mode === "deeppose" && ["regress", "absolute", "refine"].includes(stepId);
        const coordinateVisible = state.mode === "deeppose" && ["absolute", "refine"].includes(stepId);
        el.vectorCard?.classList.toggle("is-active", vectorVisible);
        el.coordinateGrid.classList.toggle("is-active", coordinateVisible);
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

    function renderArgmaxPanel() {
        if (!el.argmaxPanel) return;
        const selected = activeHeatmap();
        const visible = state.mode === "heatmap" && ["peak", "skeleton"].includes(currentStep().id) && selected;
        if (!visible) {
            el.argmaxPanel.innerHTML = `
                <span>峰值竞争</span>
                <p>Heatmap 响应生成后，候选峰值将在这里比较。</p>
            `;
            el.argmaxPanel.classList.remove("is-active");
            return;
        }

        const score = Number(selected.score || 0);
        const candidates = [
            Math.max(0.05, score - 0.42),
            Math.max(0.08, score - 0.23),
            score,
            Math.max(0.04, score - 0.35),
        ];
        el.argmaxPanel.innerHTML = `
            <span>峰值竞争 · ${escapeHtml(selected.name)}</span>
            <div class="mechanism-candidate-row">
                ${candidates.map((value, index) => `
                    <i class="${index === 2 ? "is-winner" : ""}" style="--delay:${index * 70}ms">
                        ${value.toFixed(2)}
                    </i>
                `).join("")}
            </div>
            <strong>最大响应 → (${Math.round(selected.x)}, ${Math.round(selected.y)})</strong>
        `;
        el.argmaxPanel.classList.add("is-active");
    }

    function updateReadout() {
        const modeData = activeModeData();
        const step = currentStep();
        const selected = activeHeatmap();
        const isHeatmap = state.mode === "heatmap";

        if (el.title) el.title.textContent = modeData.label || "";
        if (el.chip) el.chip.textContent = isHeatmap ? "Heatmap" : "DeepPose";
        if (el.outputHead) el.outputHead.textContent = isHeatmap ? "热力图头" : "回归头";
        if (el.stageLabel) el.stageLabel.textContent = step.label || "";
        if (el.stageNote) el.stageNote.textContent = step.note || "";
        if (el.readoutKind) el.readoutKind.textContent = isHeatmap ? "热力图解码" : "DeepPose 回归";
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
        el.computeBoard?.setAttribute("data-mode", state.mode);
        el.computeBoard?.setAttribute("data-step", step.id || "");
        el.deepposeOutput?.classList.toggle("is-active", !isHeatmap);
        el.heatmapOutput?.classList.toggle("is-active", isHeatmap);
    }

    function updateControls() {
        const steps = activeSteps();
        const atFirst = state.stepIndex <= 0;
        const atLast = state.stepIndex >= steps.length - 1;
        if (el.prev) el.prev.disabled = atFirst;
        if (el.next) el.next.disabled = atLast;
        if (el.reset) el.reset.disabled = atFirst && !state.timer;
        if (el.speed) el.speed.value = String(state.speed || 1);
        root.style.setProperty("--mechanism-play-speed", String(state.speed || 1));
    }

    function renderAll() {
        renderImageOnce();
        renderCropPreview();
        updateReadout();
        renderStepList();
        renderFlow();
        renderStepper();
        renderFeatureGrid();
        renderCoordinateGrid();
        renderHeatmapList();
        renderArgmaxPanel();
        renderOverlay();
        renderOperationLayer();
        updateControls();
    }

    function bindEvents() {
        el.modeButtons.forEach((button) => {
            button.addEventListener("click", () => setMode(button.dataset.mechanismMode));
        });
        el.play?.addEventListener("click", startPlayback);
        el.prev?.addEventListener("click", goPrev);
        el.next?.addEventListener("click", goNext);
        el.reset?.addEventListener("click", () => {
            stopPlayback();
            state.stepIndex = 0;
            renderAll();
        });
        el.speed?.addEventListener("change", () => {
            state.speed = Number(el.speed.value) || 1;
            if (state.timer) {
                stopPlayback();
                startPlayback();
            } else {
                updateControls();
            }
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
