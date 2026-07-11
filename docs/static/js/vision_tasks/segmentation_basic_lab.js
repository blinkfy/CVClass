(function () {
    const root = document.querySelector("[data-seg-basic-lab]");
    if (!root) return;

    const api = window.CVClassVisionTasks || {};
    const dataRoot = api.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const methodLabels = {
        "kmeans-rgb": "K-means RGB",
        "kmeans-rgbxy": "K-means RGB + XY",
        "kmeans-compare": "RGB vs RGB+XY 对比",
        graphcut: "Graph Cut",
        ncut: "Normalized Cut",
        grabcut: "GrabCut",
        watershed: "Watershed",
        regions: "区域属性",
    };
    const initialParams = new URLSearchParams(window.location.search);
    const methodFamilies = {
        "kmeans-rgb": "cluster",
        "kmeans-rgbxy": "cluster",
        "kmeans-compare": "cluster",
        graphcut: "graph",
        ncut: "graph",
        grabcut: "graph",
        watershed: "region",
        regions: "region",
    };
    function methodForPath() {
        if (window.location.pathname.endsWith("/graph")) return "graphcut";
        if (window.location.pathname.endsWith("/region")) return "watershed";
        return "kmeans-rgb";
    }
    const requestedMethod = initialParams.get("method");
    const initialMethod = methodLabels[requestedMethod] ? requestedMethod : methodForPath();
    const state = {
        data: null,
        sampleId: "",
        uploadUrl: "",
        method: initialMethod,
        k: 4,
        maxIter: 10,
        xyWeight: 0.35,
        init: "fixed",
        showCenters: true,
        showIterations: true,
        image: null,
        sourceName: "",
        work: null,
        result: null,
        compareResult: null,
        concept: null,
        conceptFrameIndex: 0,
        skipConceptAutoPlay: false,
        autoRunTimer: 0,
        grabcut: {
            tool: "box",
            box: null,
            fgSeeds: [],
            bgSeeds: [],
            dragging: false,
            dragStart: null,
            draftBox: null,
        },
        animationTimer: 0,
        playing: false,
        currentSnapshot: 0,
        selectedLabel: null,
        kmeansPhase: "stats",
        kmeansFrameIndex: 0,
        kmeansUi: {
            currentStep: 0,
            kValue: 4,
            iterationCount: 0,
            currentIteration: 0,
        },
    };
    const feature3d = {
        mount: null,
        renderer: null,
        scene: null,
        camera: null,
        root: null,
        points: null,
        centerMeshes: [],
        trailLines: [],
        xyPlane: null,
        lastCenters: null,
        fromCenters: null,
        targetCenters: null,
        tweenStart: 0,
        frame: 0,
        mode: "",
        k: 0,
    };

    const els = {
        sampleTrigger: $("[data-segb-selector-trigger]"),
        selectedLabel: $("[data-segb-selected-label]"),
        selectorWrapper: $("[data-segb-selector-wrapper]"),
        sampleGrid: $("[data-segb-sample-grid]"),
        upload: $("[data-segb-upload]"),
        uploadName: $("[data-segb-upload-name]"),
        methodButtons: $$("[data-segb-method]"),
        kmeansControls: $("[data-segb-kmeans-controls]"),
        k: $("[data-segb-k]"),
        maxIter: $("[data-segb-max-iter]"),
        iterOutput: $("[data-segb-iter-output]"),
        xyWeight: $("[data-segb-xy-weight]"),
        xyOutput: $("[data-segb-xy-output]"),
        init: $("[data-segb-init]"),
        showCenters: $("[data-segb-show-centers]"),
        showIterations: $("[data-segb-show-iterations]"),
        run: $("[data-segb-run]"),
        play: $("[data-segb-play]"),
        activeMethod: $("[data-segb-active-method]"),
        size: $("[data-segb-size]"),
        currentIter: $("[data-segb-current-iter]"),
        regionCount: $("[data-segb-region-count]"),
        time: $("[data-segb-time]"),
        statusText: $("[data-segb-status-text]"),
        status: $("[data-segb-status]"),
        stageTitle: $("[data-segb-stage-title]"),
        stripMethod: $("[data-segb-strip-method]"),
        stripFeature: $("[data-segb-strip-feature]"),
        stripK: $("[data-segb-strip-k]"),
        stripIter: $("[data-segb-strip-iter]"),
        stripOutput: $("[data-segb-strip-output]"),
        kmeansView: $("[data-segb-kmeans-view]"),
        graphView: $("[data-segb-graph-view]"),
        original: $("[data-segb-original]"),
        resultCanvas: $("[data-segb-result]"),
        compareCanvas: $("[data-segb-compare]"),
        compareCard: $("[data-segb-compare-card]"),
        compareNote: $("[data-segb-compare-note]"),
        resultTitle: $("[data-segb-result-title]"),
        thirdTitle: $("[data-segb-third-title]"),
        featureSpace: $("[data-segb-feature-space]"),
        featureIteration: $("[data-segb-feature-iteration]"),
        processIteration: $("[data-segb-process-iteration]"),
        processDistance: $("[data-segb-process-distance]"),
        processMovement: $("[data-segb-process-movement]"),
        processStop: $("[data-segb-process-stop]"),
        processConvergence: $("[data-segb-process-convergence]"),
        processIterationVisual: $("[data-segb-iteration-visual]"),
        processOutputCard: $("[data-segb-process-output-card]"),
        processOutput: $("[data-segb-process-output]"),
        processOutputType: $("[data-segb-process-output-type]"),
        processDecode: $("[data-segb-process-decode]"),
        processRegions: $("[data-segb-process-regions]"),
        processOutputNote: $("[data-segb-process-output-note]"),
        processOutputVisual: $("[data-segb-output-visual]"),
        processIterationCard: $(".seg-process-iteration-card"),
        labelSubtitle: $("[data-segb-label-subtitle]"),
        flowFeature: $("[data-segb-flow-feature]"),
        centerList: $("[data-segb-center-list]"),
        regionList: $("[data-segb-region-list]"),
        regionPopover: $("[data-segb-region-popover]"),
        iterationMonitor: $("[data-segb-iteration-monitor]"),
        stepFocus: $("[data-segb-step-focus]"),
        stepVisual: $("[data-segb-step-visual]"),
        stepMatrix: $("[data-segb-step-matrix]"),
        stepDetail: $("[data-segb-step-detail]"),
        graphStage: $("[data-segb-graph-stage]"),
        matrixStage: $("[data-segb-matrix-stage]"),
        conceptDetail: $("[data-segb-concept-detail]"),
        conceptSource: $("[data-segb-concept-source]"),
        conceptMask: $("[data-segb-concept-mask]"),
        conceptResultTitle: $("[data-segb-concept-result-title]"),
        conceptResultCaption: $("[data-segb-concept-result-caption]"),
        conceptResult: $("[data-segb-concept-result]"),
        frameStrip: $("[data-segb-frame-strip]"),
        compareView: $("[data-segb-compare-view]"),
        compareSlider: $("[data-segb-compare-slider]"),
        compareSliderLeft: $("[data-segb-compare-slider-left]"),
        compareSliderRight: $("[data-segb-compare-slider-right]"),
        compareSliderDivider: $("[data-segb-compare-slider-divider]"),
        compareSliderHandle: $("[data-segb-compare-slider-handle]"),
        grabcutToolbar: $("[data-segb-grabcut-toolbar]"),
        grabcutTools: $$("[data-segb-grabcut-tool]"),
        grabcutReset: $("[data-segb-grabcut-reset]"),
        notesSubtitle: $("[data-segb-notes-subtitle]"),
        formulaLabel: $("[data-segb-formula-label]"),
        formula: $("[data-segb-formula]"),
        formulaNote: $("[data-segb-formula-note]"),
        notes: $("[data-segb-notes]"),
        stepper: [...document.querySelectorAll("[data-segb-phase]")],
    };

    function activeFamily() {
        return methodFamilies[state.method] || "cluster";
    }

    function setKMeansState(patch = {}, reason = "update") {
        Object.assign(state.kmeansUi, patch);
        if (Number.isFinite(patch.kValue)) state.k = patch.kValue;
        if (Number.isFinite(patch.iterationCount)) state.maxIter = patch.iterationCount;
        if (els.kmeansView) {
            els.kmeansView.dataset.currentStep = String(state.kmeansUi.currentStep || 0);
            els.kmeansView.dataset.updateReason = reason;
        }
    }

    function renderFamilyGroups() {
        root.dataset.segbFamily = activeFamily();
        $$("[data-segb-family-group]").forEach((group) => {
            group.hidden = group.dataset.segbFamilyGroup !== activeFamily();
        });
    }

    els.methodButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.segbMethod === state.method));
    renderFamilyGroups();

    const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    function setPhase(phase) {
        els.stepper.forEach((item) => item.classList.toggle("is-active", item.dataset.segbPhase === phase));
    }

    function renderStepper(kind) {
        const steps = kind === "graph"
            ? [
                ["image", "Image / Nodes", "input graph"],
                ["feature", "Build Graph", "S/T or W"],
                ["assign", "Edge Weights", "similarity"],
                ["update", "Min Cut / Ncut", "partition"],
                ["map", "Region Split", "FG/BG"],
                ["stats", "Statistics", "cut cost"],
            ]
            : kind === "grabcut"
            ? [
                ["image", "User Box", "probable FG"],
                ["feature", "GMM Models", "K=5 FG/BG"],
                ["assign", "Graph Weights", "unary + pairwise"],
                ["update", "Min Cut", "optimize labels"],
                ["map", "Foreground Mask", "binary output"],
                ["stats", "Mask Stats", "bbox and ratio"],
            ]
            : kind === "watershed"
            ? [
                ["image", "Gradient / Distance", "boundary cue"],
                ["feature", "FG Marker", "sure foreground"],
                ["assign", "BG Marker", "sure background"],
                ["update", "Unknown Region", "compete fronts"],
                ["map", "Watershed Boundary", "ridge lines"],
                ["stats", "Label Map", "region ids"],
            ]
            : kind === "regions"
            ? [
                ["image", "Label Map", "region ids"],
                ["feature", "Area", "pixel count"],
                ["assign", "BBox", "x y w h"],
                ["update", "Contour", "perimeter"],
                ["map", "Mask Ratio", "area / image"],
                ["stats", "Region Table", "properties"],
            ]
            : [
                ["image", "Image Pixels", "Canvas image data"],
                ["feature", "Feature Vector", "RGB / RGB+XY"],
                ["assign", "Assign Cluster", "nearest center"],
                ["update", "Update Centers", "mean color"],
                ["map", "Segmentation Map", "label map"],
                ["stats", "Region Statistics", "counts and ratios"],
            ];
        els.stepper.forEach((item, index) => {
            const step = steps[index];
            item.dataset.segbPhase = step[0];
            item.querySelector("strong").textContent = step[1];
            item.querySelector("small").textContent = step[2];
            item.classList.toggle("is-active", index === 0);
        });
    }

    function setBusy(isBusy) {
        const canPlay = Boolean(state.concept?.frames?.length > 1) || Boolean(state.result?.snapshots?.length && state.showIterations);
        els.run.disabled = isBusy;
        els.play.disabled = isBusy || !canPlay;
        els.statusText.textContent = isBusy ? "计算中" : "就绪";
    }

    function selectedSample() {
        return state.data?.samples.find((item) => item.id === state.sampleId) || state.data?.samples[0];
    }

    function updateSampleCards() {
        if (!els.sampleGrid) return;
        els.sampleGrid.querySelectorAll("[data-segb-sample-card]").forEach((button) => {
            const isActive = button.dataset.segbSampleCard === state.sampleId;
            button.classList.toggle("is-active", isActive);
        });
        const currentSample = selectedSample();
        if (currentSample && els.selectedLabel) {
            els.selectedLabel.textContent = currentSample.name;
        }
    }

    function renderSamplePicker() {
        const samples = state.data?.samples || [];
        if (!els.sampleGrid) return;
        els.sampleGrid.innerHTML = samples.map((item) => `
            <button type="button" data-segb-sample-card="${escapeHtml(item.id)}">
                <img src="${escapeHtml(window.cvclassUrl(item.image))}" alt="${escapeHtml(item.name)}">
                <span>${escapeHtml(item.name)}</span>
            </button>
        `).join("");
        els.sampleGrid.querySelectorAll("[data-segb-sample-card]").forEach((button) => {
            button.addEventListener("click", async () => {
                if (button.dataset.segbSampleCard === state.sampleId) return;
                state.sampleId = button.dataset.segbSampleCard;
                updateSampleCards();
                // 选择后自动收起下拉
                if (els.selectorWrapper) {
                    els.selectorWrapper.classList.remove("is-open");
                }
                await loadSelectedSample(true);
            });
        });

        // 初始化下拉触发器事件
        if (els.sampleTrigger && els.selectorWrapper) {
            els.sampleTrigger.addEventListener("click", (e) => {
                e.stopPropagation();
                els.selectorWrapper.classList.toggle("is-open");
            });
        }

        // 点击空白处收起下拉
        document.addEventListener("click", () => {
            if (els.selectorWrapper) {
                els.selectorWrapper.classList.remove("is-open");
            }
        });

        updateSampleCards();
    }

    function stopAnimation() {
        if (state.animationTimer) {
            clearInterval(state.animationTimer);
            state.animationTimer = 0;
        }
        state.playing = false;
        document.querySelectorAll("[data-segb-frame-strip]").forEach(strip => {
            strip.classList.remove("is-playing");
        });
        els.play.textContent = "播放流程";
    }

    function drawImageToWorkCanvas(image) {
        const maxDim = 280;
        const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvasList = [els.original, els.resultCanvas, els.compareCanvas];
        canvasList.forEach((canvas) => {
            canvas.width = width;
            canvas.height = height;
        });
        const ctx = els.original.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        state.work = { width, height, imageData };
        els.size.textContent = `${width} × ${height}`;
        return state.work;
    }

    function loadImage(src, name) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                state.image = image;
                state.sourceName = name;
                drawImageToWorkCanvas(image);
                resolve(image);
            };
            image.onerror = () => reject(new Error(`image load failed: ${src}`));
            image.src = window.cvclassUrl(src);
        });
    }

    function readControls() {
        state.k = Number(els.k.value);
        state.maxIter = Number(els.maxIter.value);
        state.xyWeight = Number(els.xyWeight.value);
        state.init = els.init.value;
        state.showCenters = els.showCenters.checked;
        state.showIterations = els.showIterations.checked;
        els.iterOutput.textContent = String(state.maxIter);
        els.xyOutput.textContent = state.xyWeight.toFixed(2);
        setKMeansState({
            kValue: state.k,
            iterationCount: state.maxIter,
        }, "controls");
    }

    function buildFeatures(work, useXY) {
        const { width, height, imageData } = work;
        const source = imageData.data;
        const dims = useXY ? 5 : 3;
        const count = width * height;
        const features = new Float32Array(count * dims);
        for (let i = 0; i < count; i += 1) {
            const p = i * 4;
            const f = i * dims;
            features[f] = source[p];
            features[f + 1] = source[p + 1];
            features[f + 2] = source[p + 2];
            if (useXY) {
                const x = i % width;
                const y = Math.floor(i / width);
                features[f + 3] = (x / Math.max(1, width - 1)) * 255 * state.xyWeight;
                features[f + 4] = (y / Math.max(1, height - 1)) * 255 * state.xyWeight;
            }
        }
        return { features, dims, count };
    }

    function initCenters(features, dims, count, width, height) {
        const centers = new Float32Array(state.k * dims);
        const fixedPoints = [
            [0.18, 0.22],
            [0.78, 0.22],
            [0.24, 0.76],
            [0.76, 0.76],
            [0.50, 0.50],
            [0.50, 0.14],
        ];
        for (let k = 0; k < state.k; k += 1) {
            let index;
            if (state.init === "random") {
                index = Math.floor(Math.random() * count);
            } else {
                const [fx, fy] = fixedPoints[k % fixedPoints.length];
                index = Math.min(count - 1, Math.max(0, Math.round(fy * (height - 1)) * width + Math.round(fx * (width - 1))));
            }
            for (let d = 0; d < dims; d += 1) centers[k * dims + d] = features[index * dims + d];
        }
        return centers;
    }

    function assignClusters(features, centers, dims, labels, counts) {
        counts.fill(0);
        let totalDistance = 0;
        for (let i = 0; i < labels.length; i += 1) {
            const f = i * dims;
            let best = 0;
            let bestDistance = Infinity;
            for (let k = 0; k < state.k; k += 1) {
                const c = k * dims;
                let distance = 0;
                for (let d = 0; d < dims; d += 1) {
                    const diff = features[f + d] - centers[c + d];
                    distance += diff * diff;
                }
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = k;
                }
            }
            labels[i] = best;
            counts[best] += 1;
            totalDistance += bestDistance;
        }
        return totalDistance / Math.max(1, labels.length);
    }

    function updateCenters(features, centers, dims, labels, counts) {
        const sums = new Float64Array(centers.length);
        for (let i = 0; i < labels.length; i += 1) {
            const label = labels[i];
            const f = i * dims;
            const c = label * dims;
            for (let d = 0; d < dims; d += 1) sums[c + d] += features[f + d];
        }
        let movement = 0;
        for (let k = 0; k < state.k; k += 1) {
            const c = k * dims;
            if (!counts[k]) continue;
            for (let d = 0; d < dims; d += 1) {
                const next = sums[c + d] / counts[k];
                const diff = next - centers[c + d];
                movement += Math.abs(diff);
                centers[c + d] = next;
            }
        }
        return movement;
    }

    function runKMeans(useXY) {
        if (!state.work) throw new Error("image data not ready");
        const { width, height } = state.work;
        const { features, dims, count } = buildFeatures(state.work, useXY);
        const labels = new Uint8Array(count);
        const counts = new Uint32Array(state.k);
        const centers = initCenters(features, dims, count, width, height);
        const snapshots = [];
        let finalMovement = 0;
        let finalDistance = 0;
        for (let iter = 1; iter <= state.maxIter; iter += 1) {
            finalDistance = assignClusters(features, centers, dims, labels, counts);
            finalMovement = updateCenters(features, centers, dims, labels, counts);
            snapshots.push({
                iter,
                labels: new Uint8Array(labels),
                centers: new Float32Array(centers),
                counts: Array.from(counts),
                movement: finalMovement,
                distance: finalDistance,
            });
            if (finalMovement < 0.35) break;
        }
        return { width, height, dims, useXY, k: state.k, snapshots, elapsed: 0 };
    }

    function buildKMeansGridModel(useXY, cols = 24, rows = 17) {
        const model = buildSampleGrid(cols, rows);
        const cells = model.cells;
        const count = cells.length;
        const dims = useXY ? 5 : 3;
        const features = new Float32Array(count * dims);
        for (let i = 0; i < count; i += 1) {
            const c = cells[i];
            features[i * dims] = c.r;
            features[i * dims + 1] = c.g;
            features[i * dims + 2] = c.b;
            if (useXY) {
                features[i * dims + 3] = (c.x / Math.max(1, cols - 1)) * 255 * state.xyWeight;
                features[i * dims + 4] = (c.y / Math.max(1, rows - 1)) * 255 * state.xyWeight;
            }
        }
        return { model, features, dims, count, useXY, cols, rows };
    }

    function initCentersForGrid(features, dims, count, cols, rows) {
        const centers = new Float32Array(state.k * dims);
        const fixedPoints = [
            [0.18, 0.22],
            [0.78, 0.22],
            [0.24, 0.76],
            [0.76, 0.76],
            [0.50, 0.50],
            [0.50, 0.14],
        ];
        for (let k = 0; k < state.k; k += 1) {
            let index;
            if (state.init === "random") {
                index = Math.floor(Math.random() * count);
            } else {
                const [fx, fy] = fixedPoints[k % fixedPoints.length];
                const gx = Math.round(fx * (cols - 1));
                const gy = Math.round(fy * (rows - 1));
                index = Math.min(count - 1, Math.max(0, gy * cols + gx));
            }
            for (let d = 0; d < dims; d += 1) centers[k * dims + d] = features[index * dims + d];
        }
        return centers;
    }

    function runKMeansOnGrid(grid) {
        const { features, dims, count, cols, rows } = grid;
        const labels = new Uint8Array(count);
        const counts = new Uint32Array(state.k);
        const centers = initCentersForGrid(features, dims, count, cols, rows);
        const snapshots = [];
        let finalMovement = 0;
        let finalDistance = 0;
        for (let iter = 1; iter <= state.maxIter; iter += 1) {
            finalDistance = assignClusters(features, centers, dims, labels, counts);
            finalMovement = updateCenters(features, centers, dims, labels, counts);
            snapshots.push({
                iter,
                labels: new Uint8Array(labels),
                centers: new Float32Array(centers),
                counts: Array.from(counts),
                movement: finalMovement,
                distance: finalDistance,
            });
            if (finalMovement < 0.35) break;
        }
        return { centers, labels, snapshots };
    }

    function kmeansCenterSeeds(model, centers, dims, useXY) {
        return Array.from({ length: state.k }, (_, k) => {
            const c = k * dims;
            const cx = useXY
                ? Math.round((centers[c + 3] / Math.max(1, 255 * state.xyWeight)) * (model.cols - 1))
                : Math.round(((k % 3) * 0.32 + 0.18) * (model.cols - 1));
            const cy = useXY
                ? Math.round((centers[c + 4] / Math.max(1, 255 * state.xyWeight)) * (model.rows - 1))
                : Math.round((Math.floor(k / 3) * 0.28 + 0.22) * (model.rows - 1));
            const gx = clamp(cx, 0, model.cols - 1);
            const gy = clamp(cy, 0, model.rows - 1);
            return {
                index: gy * model.cols + gx,
                type: "fg",
                text: `C${k + 1}`,
            };
        });
    }

    function kmeansDistanceTable(grid, centers, dims, sampleCount = 3) {
        const { features, count } = grid;
        const samples = [];
        for (let i = 0; i < count && samples.length < sampleCount; i += 1) {
            const x = i % grid.cols;
            const y = Math.floor(i / grid.cols);
            if ((x + y) % 3 === 0) samples.push(i);
        }
        return samples.map((i) => {
            const f = i * dims;
            let best = 0;
            let bestDistance = Infinity;
            const distances = [];
            for (let k = 0; k < state.k; k += 1) {
                const c = k * dims;
                let distance = 0;
                for (let d = 0; d < dims; d += 1) {
                    const diff = features[f + d] - centers[c + d];
                    distance += diff * diff;
                }
                distance = Math.sqrt(distance);
                distances.push(distance.toFixed(1));
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = k;
                }
            }
            return { index: i, best, distances, bestDistance: bestDistance.toFixed(1) };
        });
    }

    function kmeansUpdateTable(oldCenters, newCenters, dims) {
        return Array.from({ length: state.k }, (_, k) => {
            const c = k * dims;
            const oldRgb = `rgb(${Math.round(oldCenters[c])},${Math.round(oldCenters[c + 1])},${Math.round(oldCenters[c + 2])})`;
            const newRgb = `rgb(${Math.round(newCenters[c])},${Math.round(newCenters[c + 1])},${Math.round(newCenters[c + 2])})`;
            const move = Math.sqrt(
                Array.from({ length: dims }, (_, d) => (newCenters[c + d] - oldCenters[c + d]) ** 2).reduce((a, b) => a + b, 0),
            );
            return { label: k + 1, oldRgb, newRgb, move: move.toFixed(1) };
        });
    }

    function kmeansProps(grid, labels) {
        const total = labels.length;
        const counts = new Array(state.k).fill(0);
        labels.forEach((label) => { counts[label] += 1; });
        return counts.map((count, index) => ({
            label: index + 1,
            count,
            ratio: count / total,
            color: labelFill(index + 1),
            name: `C${index + 1}`,
        }));
    }

    function kmeansComputeSvg(grid, options = {}) {
        const { model } = grid;
        const { cells, cols, rows } = model;
        const viewW = 520;
        const viewH = 318;
        const padX = 32;
        const padY = 34;
        const cellW = (viewW - padX * 2) / cols;
        const cellH = (viewH - padY * 2) / rows;
        const mode = options.mode || "assign";
        const centers = options.centers || [];
        const labels = options.labels || [];
        const activeSet = new Set(options.activeCells || []);
        const spatialRings = grid.useXY && centers.length ? Array.from({ length: state.k }, (_, k) => {
            const c = k * grid.dims;
            const cx = (centers[c + 3] / Math.max(1, 255 * state.xyWeight)) * (cols - 1);
            const cy = (centers[c + 4] / Math.max(1, 255 * state.xyWeight)) * (rows - 1);
            const x = padX + (clamp(cx, 0, cols - 1) + 0.5) * cellW;
            const y = padY + (clamp(cy, 0, rows - 1) + 0.5) * cellH;
            const radius = Math.max(28, Math.min(68, cellW * (2.7 + state.xyWeight * 1.8)));
            return `<circle class="seg-spatial-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" style="--c:${labelFill(k + 1)};animation-delay:${k * 90}ms"/>`;
        }).join("") : "";
        const colorLinks = !grid.useXY && labels.length ? (() => {
            const links = [];
            for (let k = 0; k < state.k; k += 1) {
                const indexes = [];
                labels.forEach((label, index) => {
                    if (label === k && indexes.length < 2) {
                        const x = index % cols;
                        const y = Math.floor(index / cols);
                        if (indexes.length === 0 || Math.abs(x - (indexes[0] % cols)) + Math.abs(y - Math.floor(indexes[0] / cols)) > 6) indexes.push(index);
                    }
                });
                if (indexes.length === 2) {
                    const [a, b] = indexes;
                    links.push({ a, b, color: labelFill(k + 1) });
                }
            }
            return links.map((link, index) => {
                const ax = padX + (link.a % cols + 0.5) * cellW;
                const ay = padY + (Math.floor(link.a / cols) + 0.5) * cellH;
                const bx = padX + (link.b % cols + 0.5) * cellW;
                const by = padY + (Math.floor(link.b / cols) + 0.5) * cellH;
                return `<path class="seg-rgb-long-link" d="M${ax.toFixed(1)} ${ay.toFixed(1)} C${(ax + 42).toFixed(1)} ${(ay - 38).toFixed(1)}, ${(bx - 42).toFixed(1)} ${(by + 38).toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}" style="--c:${link.color};animation-delay:${index * 110}ms"/>`;
            }).join("");
        })() : "";
        const centerPositions = Array.from({ length: state.k }, (_, k) => {
            const c = k * grid.dims;
            const cx = grid.useXY
                ? (centers[c + 3] / Math.max(1, 255 * state.xyWeight)) * (cols - 1)
                : (k % 3) * 0.32 * (cols - 1) + 0.18 * (cols - 1);
            const cy = grid.useXY
                ? (centers[c + 4] / Math.max(1, 255 * state.xyWeight)) * (rows - 1)
                : Math.floor(k / 3) * 0.28 * (rows - 1) + 0.22 * (rows - 1);
            return { x: padX + (clamp(cx, 0, cols - 1) + 0.5) * cellW, y: padY + (clamp(cy, 0, rows - 1) + 0.5) * cellH };
        });
        const cellsHtml = cells.map((cell, index) => {
            const x = padX + cell.x * cellW + 2;
            const y = padY + cell.y * cellH + 2;
            const label = labels[index];
            const fill = mode === "image"
                ? `rgb(${Math.round(cell.r)},${Math.round(cell.g)},${Math.round(cell.b)})`
                : labelFill((label ?? 0) + 1);
            const classes = ["seg-grid-cell", activeSet.has(index) ? "is-active" : ""].filter(Boolean).join(" ");
            return `<rect class="${classes}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(5, cellW - 4).toFixed(1)}" height="${Math.max(5, cellH - 4).toFixed(1)}" rx="6" fill="${fill}"/>`;
        }).join("");
        const centerHtml = mode !== "image" ? centerPositions.map((pos, k) => `
            <g class="seg-grid-seed is-fg">
                <circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="12"/>
                <text x="${pos.x.toFixed(1)}" y="${(pos.y + 4).toFixed(1)}" text-anchor="middle">C${k + 1}</text>
            </g>
        `).join("") : "";
        const lineHtml = mode === "assign" && options.lines?.length ? options.lines.map((line) => {
            const fromX = padX + (line.from % cols + 0.5) * cellW;
            const fromY = padY + (Math.floor(line.from / cols) + 0.5) * cellH;
            return `<line class="seg-kmeans-line" x1="${fromX.toFixed(1)}" y1="${fromY.toFixed(1)}" x2="${centerPositions[line.to].x.toFixed(1)}" y2="${centerPositions[line.to].y.toFixed(1)}" stroke="#f97316" stroke-width="3" stroke-dasharray="6,4" opacity="0.78"/>`;
        }).join("") : "";
        const caption = options.caption ? `<text x="260" y="304" text-anchor="middle" class="seg-svg-note">${escapeHtml(options.caption)}</text>` : "";
        const modeBadge = grid.useXY
            ? `<g class="seg-mode-badge is-rgbxy"><rect x="332" y="28" width="152" height="28" rx="14"/><text x="408" y="47" text-anchor="middle">RGB + λXY 空间约束</text></g>`
            : `<g class="seg-mode-badge is-rgb"><rect x="332" y="28" width="152" height="28" rx="14"/><text x="408" y="47" text-anchor="middle">RGB 颜色距离</text></g>`;
        const modeGuide = grid.useXY
            ? `<path class="seg-xy-axis-flow" d="M54 266 H176 M54 266 V196"/><text x="184" y="270" class="seg-svg-note">x</text><text x="45" y="194" class="seg-svg-note">y</text>`
            : `<text x="64" y="52" class="seg-svg-note">同色像素即使相距较远，也会被颜色距离吸引</text>`;
        return `
            <svg class="seg-concept-svg seg-algo-grid ${grid.useXY ? "is-rgbxy" : "is-rgb"}" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="kmeans algorithm grid">
                <rect x="16" y="18" width="488" height="276" rx="22" fill="#f8fafc" stroke="#dbeafe"/>
                ${modeBadge}
                ${modeGuide}
                ${spatialRings}
                ${cellsHtml}
                ${colorLinks}
                ${lineHtml}
                ${centerHtml}
                ${caption}
            </svg>
        `;
    }

    function kmeansSamplingFlowSvg(grid, useXY) {
        const cells = grid.model.cells.slice(0, 60);
        const pixelTiles = cells.map((cell, index) => {
            const x = 36 + (index % 10) * 16;
            const y = 56 + Math.floor(index / 10) * 16;
            return `<rect class="seg-sampling-pixel" x="${x}" y="${y}" width="12" height="12" rx="3" fill="rgb(${Math.round(cell.r)},${Math.round(cell.g)},${Math.round(cell.b)})" style="animation-delay:${index * 12}ms"/>`;
        }).join("");
        const vectorRows = cells.slice(0, 6).map((cell, index) => {
            const y = 62 + index * 25;
            const color = `rgb(${Math.round(cell.r)},${Math.round(cell.g)},${Math.round(cell.b)})`;
            return `
                <g class="seg-sampling-vector" style="animation-delay:${index * 80}ms">
                    <rect x="322" y="${y - 12}" width="146" height="19" rx="9.5" fill="#ffffff" stroke="#dbeafe"/>
                    <circle cx="336" cy="${y - 2}" r="5" fill="${color}"/>
                    <text x="350" y="${y + 2}" class="seg-svg-note">${useXY ? "[R,G,B,λx,λy]" : "[R,G,B]"}</text>
                </g>
            `;
        }).join("");
        return `
            <svg class="seg-concept-svg seg-kmeans-sampling-svg" viewBox="0 0 520 318" role="img" aria-label="pixel sampling to feature vectors">
                <rect x="22" y="28" width="190" height="150" rx="20" fill="#ffffff" stroke="#bfdbfe"/>
                <text x="42" y="48" class="seg-svg-title">image pixels</text>
                ${pixelTiles}
                <path class="seg-sampling-scan" d="M34 50 V172"/>
                <path class="seg-process-arrow" d="M226 102 C254 78, 282 78, 306 102"/>
                <text x="266" y="72" text-anchor="middle" class="seg-svg-title">sample</text>
                <rect x="304" y="28" width="184" height="184" rx="20" fill="#f8fbff" stroke="#bfdbfe"/>
                <text x="324" y="48" class="seg-svg-title">${useXY ? "RGB + XY vectors" : "RGB vectors"}</text>
                ${vectorRows}
                <rect x="86" y="220" width="348" height="48" rx="16" fill="#eff6ff" stroke="#bfdbfe"/>
                <text x="260" y="242" text-anchor="middle" class="seg-svg-title">${useXY ? "颜色值与像素坐标一起进入距离计算" : "只保留颜色值，不读取空间坐标"}</text>
                <text x="260" y="260" text-anchor="middle" class="seg-svg-note">sampling grid keeps the algorithm small enough for live teaching</text>
            </svg>
        `;
    }

    function kmeansAssignmentFieldSvg(grid, snapshot, distanceTable) {
        const { cols, rows } = grid;
        const viewW = 520;
        const viewH = 318;
        const focus = distanceTable[0] || { index: 0, best: 0, distances: [] };
        const sampleX = 145;
        const sampleY = 150;
        const maxDistance = Math.max(1, ...focus.distances.map((item) => Number(item) || 0));
        const centerNodes = Array.from({ length: state.k }, (_, k) => {
            const c = k * grid.dims;
            const cx = grid.useXY && snapshot.centers.length
                ? (snapshot.centers[c + 3] / Math.max(1, 255 * state.xyWeight)) * (cols - 1)
                : (k % 3) * 0.36 * (cols - 1) + 0.18 * (cols - 1);
            const cy = grid.useXY && snapshot.centers.length
                ? (snapshot.centers[c + 4] / Math.max(1, 255 * state.xyWeight)) * (rows - 1)
                : Math.floor(k / 3) * 0.34 * (rows - 1) + 0.2 * (rows - 1);
            return {
                x: 276 + clamp(cx / Math.max(1, cols - 1), 0, 1) * 178,
                y: 66 + clamp(cy / Math.max(1, rows - 1), 0, 1) * 144,
                color: labelFill(k + 1),
                distance: Number(focus.distances[k]) || maxDistance,
                best: focus.best === k,
            };
        });
        const rays = centerNodes.map((node, index) => `
            <path class="seg-assign-ray ${node.best ? "is-best" : ""}" d="M${sampleX} ${sampleY} C${sampleX + 54} ${sampleY - 48 + index * 18}, ${node.x - 46} ${node.y}, ${node.x} ${node.y}" style="--c:${node.color};animation-delay:${index * 90}ms"/>
        `).join("");
        const centers = centerNodes.map((node, index) => `
            <g class="seg-assign-center ${node.best ? "is-best" : ""}" style="--c:${node.color}">
                <circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${node.best ? 17 : 13}"/>
                <text x="${node.x.toFixed(1)}" y="${(node.y + 4).toFixed(1)}" text-anchor="middle">C${index + 1}</text>
            </g>
        `).join("");
        const bars = centerNodes.map((node, index) => {
            const width = 88 * (1 - clamp(node.distance / Math.max(1, maxDistance), 0, 0.92));
            const y = 234 + index * 16;
            return `
                <g class="seg-assign-distance ${node.best ? "is-best" : ""}">
                    <text x="282" y="${y + 8}" class="seg-svg-note">C${index + 1}</text>
                    <rect x="306" y="${y}" width="94" height="9" rx="4.5" fill="#e2e8f0"/>
                    <rect x="306" y="${y}" width="${Math.max(8, width).toFixed(1)}" height="9" rx="4.5" fill="${node.color}"/>
                    <text x="412" y="${y + 8}" class="seg-svg-note">${node.distance.toFixed(1)}</text>
                </g>
            `;
        }).join("");
        return `
            <svg class="seg-concept-svg seg-kmeans-assign-svg" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="assignment distance field">
                <rect x="22" y="26" width="476" height="268" rx="24" fill="#ffffff" stroke="#bfdbfe"/>
                <text x="42" y="50" class="seg-svg-title">distance field</text>
                <g class="seg-assign-sample">
                    <circle cx="${sampleX}" cy="${sampleY}" r="24" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
                    <text x="${sampleX}" y="${sampleY + 4}" text-anchor="middle" class="seg-svg-title">xᵢ</text>
                </g>
                ${rays}
                ${centers}
                <rect x="266" y="224" width="202" height="74" rx="18" fill="#f8fbff" stroke="#dbeafe"/>
                <text x="282" y="218" class="seg-svg-title">argmin distance</text>
                ${bars}
                <text x="150" y="258" text-anchor="middle" class="seg-svg-note">${grid.useXY ? "颜色距离 + 空间距离共同投票" : "只比较 RGB 颜色距离"}</text>
            </svg>
        `;
    }

    function kmeansCenterUpdateSvg(grid, firstSnapshot, finalSnapshot, updateTable) {
        const columns = Array.from({ length: state.k }, (_, index) => {
            const row = updateTable[index] || { move: "0", oldRgb: "#bfdbfe", newRgb: labelFill(index + 1) };
            const x = 70 + index * (380 / Math.max(1, state.k - 1));
            const oldY = 90 + (index % 2) * 22;
            const newY = 205 - (index % 2) * 18;
            const oldColor = row.oldRgb || labelFill(index + 1);
            const newColor = row.newRgb || labelFill(index + 1);
            const dots = Array.from({ length: 5 }, (_, dot) => {
                const dx = (dot - 2) * 10;
                const dy = 134 + ((dot + index) % 3) * 12;
                return `<circle class="seg-update-member" cx="${(x + dx).toFixed(1)}" cy="${dy}" r="4" fill="${newColor}" style="animation-delay:${(dot + index) * 50}ms"/>`;
            }).join("");
            return `
                <g class="seg-update-column" style="--c:${newColor};animation-delay:${index * 90}ms">
                    ${dots}
                    <circle class="seg-update-old" cx="${x.toFixed(1)}" cy="${oldY}" r="12" fill="${oldColor}"/>
                    <path class="seg-update-path" d="M${x.toFixed(1)} ${oldY + 16} C${(x - 24).toFixed(1)} 136, ${(x + 28).toFixed(1)} 168, ${x.toFixed(1)} ${newY - 16}"/>
                    <circle class="seg-update-new" cx="${x.toFixed(1)}" cy="${newY}" r="15" fill="${newColor}"/>
                    <text x="${x.toFixed(1)}" y="${newY + 4}" text-anchor="middle">C${index + 1}</text>
                    <text x="${x.toFixed(1)}" y="250" text-anchor="middle" class="seg-svg-note">move ${row.move}</text>
                </g>
            `;
        }).join("");
        return `
            <svg class="seg-concept-svg seg-kmeans-update-svg" viewBox="0 0 520 318" role="img" aria-label="centroid update as mean migration">
                <rect x="22" y="28" width="476" height="254" rx="24" fill="#ffffff" stroke="#bfdbfe"/>
                <text x="42" y="52" class="seg-svg-title">center update: mean of assigned pixels</text>
                <text x="42" y="74" class="seg-svg-note">${grid.useXY ? "中心同时更新 RGB 均值和 XY 均值" : "中心只更新 RGB 均值"}</text>
                ${columns}
                <path class="seg-update-baseline" d="M54 178 H466"/>
                <text x="260" y="300" text-anchor="middle" class="seg-svg-note">members pull each Ck toward their average feature position</text>
            </svg>
        `;
    }

    function kmeansConvergenceSvg(result, finalSnapshot) {
        const movements = result.snapshots.map((item) => item.movement);
        const maxMovement = Math.max(1, ...movements);
        const points = movements.map((movement, index) => {
            const x = 58 + (index / Math.max(1, movements.length - 1)) * 306;
            const y = 224 - (movement / maxMovement) * 142;
            return [x, y, movement];
        });
        const line = points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ");
        const dots = points.map((point, index) => `<circle class="seg-converge-dot ${index === points.length - 1 ? "is-final" : ""}" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="${index === points.length - 1 ? 6 : 4}" style="animation-delay:${index * 60}ms"/>`).join("");
        const labels = [
            ["iterations", String(result.snapshots.length)],
            ["final move", finalSnapshot.movement.toFixed(2)],
            ["mean dist", finalSnapshot.distance.toFixed(1)],
        ].map(([label, value], index) => `
            <g class="seg-converge-stat">
                <rect x="388" y="${72 + index * 54}" width="98" height="38" rx="12" fill="#f8fbff" stroke="#dbeafe"/>
                <text x="404" y="${89 + index * 54}" class="seg-svg-note">${label}</text>
                <text x="404" y="${104 + index * 54}" class="seg-svg-title">${value}</text>
            </g>
        `).join("");
        return `
            <svg class="seg-concept-svg seg-kmeans-converge-svg" viewBox="0 0 520 318" role="img" aria-label="kmeans convergence curve">
                <rect x="22" y="28" width="476" height="254" rx="24" fill="#ffffff" stroke="#bfdbfe"/>
                <text x="42" y="52" class="seg-svg-title">iteration convergence</text>
                <path d="M58 230 H366 M58 230 V66" fill="none" stroke="#cbd5e1" stroke-width="2"/>
                <path class="seg-converge-line" d="${line}" fill="none"/>
                ${dots}
                <path class="seg-converge-threshold" d="M58 214 H366"/>
                <text x="60" y="258" class="seg-svg-note">center movement drops as labels stabilize</text>
                ${labels}
            </svg>
        `;
    }

    function kmeansStatsDashboardSvg(props, totalCells) {
        const sorted = [...props].sort((a, b) => b.count - a.count);
        const maxCount = Math.max(1, ...sorted.map((item) => item.count));
        const stack = sorted.reduce((acc, item) => {
            const width = 352 * item.ratio;
            const x = acc.x;
            acc.x += width;
            acc.items.push(`<rect class="seg-stats-stack-cell" x="${x.toFixed(1)}" y="86" width="${Math.max(5, width).toFixed(1)}" height="34" rx="8" fill="${item.color}" style="animation-delay:${acc.items.length * 80}ms"/>`);
            return acc;
        }, { x: 84, items: [] }).items.join("");
        const bars = sorted.map((item, index) => {
            const y = 154 + index * 28;
            const width = 190 * (item.count / maxCount);
            const percent = Math.round(item.ratio * 100);
            return `
                <g class="seg-stats-row" style="--c:${item.color};animation-delay:${index * 70}ms">
                    <text x="88" y="${y + 10}" class="seg-svg-title">C${item.label}</text>
                    <rect x="122" y="${y}" width="200" height="12" rx="6" fill="#e2e8f0"/>
                    <rect x="122" y="${y}" width="${width.toFixed(1)}" height="12" rx="6" fill="${item.color}"/>
                    <text x="340" y="${y + 10}" class="seg-svg-note">${item.count}/${totalCells} · ${percent}%</text>
                </g>
            `;
        }).join("");
        return `
            <svg class="seg-concept-svg seg-kmeans-stats-dashboard-svg" viewBox="0 0 520 318" role="img" aria-label="region statistics dashboard">
                <rect x="22" y="28" width="476" height="254" rx="24" fill="#ffffff" stroke="#bfdbfe"/>
                <text x="42" y="52" class="seg-svg-title">label map → measurable regions</text>
                <rect x="76" y="76" width="368" height="54" rx="18" fill="#f8fbff" stroke="#dbeafe"/>
                ${stack}
                <text x="260" y="146" text-anchor="middle" class="seg-svg-note">stacked cluster ratio</text>
                ${bars}
                <rect x="386" y="168" width="76" height="68" rx="16" fill="#eff6ff" stroke="#bfdbfe"/>
                <text x="424" y="190" text-anchor="middle" class="seg-svg-title">bbox</text>
                <path class="seg-stats-bbox" d="M404 202 H446 V224 H404 Z"/>
                <circle cx="425" cy="213" r="4" fill="#2563eb"/>
                <text x="424" y="256" text-anchor="middle" class="seg-svg-note">area · ratio · centroid</text>
            </svg>
        `;
    }

    function kmeansStatsSvg(props, totalCells) {
        const sorted = [...props].sort((a, b) => b.count - a.count);
        const maxCount = Math.max(1, ...sorted.map((item) => item.count));
        const previewLabels = sorted.flatMap((item) => {
            const cellsForCluster = Math.max(1, Math.round(item.ratio * 48));
            return Array.from({ length: cellsForCluster }, () => item.label);
        });
        while (previewLabels.length < 48) previewLabels.push(sorted[0]?.label || 1);
        const cells = previewLabels.slice(0, 48).map((label, index) => {
            const x = 36 + (index % 12) * 13;
            const y = 68 + Math.floor(index / 12) * 13;
            return `<rect x="${x}" y="${y}" width="10" height="10" rx="2.5" fill="${labelFill(label)}"/>`;
        }).join("");
        const bars = sorted.map((item, index) => {
            const y = 67 + index * 34;
            const width = 112 * (item.count / maxCount);
            const percent = Math.round(item.ratio * 100);
            return `
                <g>
                    <text x="255" y="${y + 8}" class="seg-svg-title">C${item.label}</text>
                    <rect x="288" y="${y - 3}" width="122" height="14" rx="7" fill="#e2e8f0"/>
                    <rect x="288" y="${y - 3}" width="${width.toFixed(1)}" height="14" rx="7" fill="${item.color}"/>
                    <text x="420" y="${y + 8}" class="seg-svg-note">${item.count}/${totalCells} · ${percent}%</text>
                </g>
            `;
        }).join("");
        return `
            <svg class="seg-concept-svg seg-kmeans-stats-svg" viewBox="0 0 520 270" role="img" aria-label="kmeans region statistics flow">
                <rect x="24" y="36" width="176" height="114" rx="18" fill="#f8fafc" stroke="#bfdbfe"/>
                ${cells}
                <text x="112" y="174" text-anchor="middle" class="seg-svg-title">label map</text>
                <path d="M210 98 H242" class="seg-edge"/>
                <text x="262" y="38" class="seg-svg-title">count / ratio</text>
                ${bars}
                <path d="M438 98 H474" class="seg-edge"/>
                <rect x="386" y="184" width="110" height="48" rx="13" fill="#eff6ff" stroke="#bfdbfe"/>
                <text x="441" y="205" text-anchor="middle" class="seg-svg-title">region table</text>
                <text x="441" y="222" text-anchor="middle" class="seg-svg-note">area / bbox / centroid</text>
                <text x="260" y="254" text-anchor="middle" class="seg-svg-note">扫描每个 label 的像素数，再计算占比与区域属性</text>
            </svg>
        `;
    }

    function buildKMeansConcept() {
        const isCompare = state.method === "kmeans-compare";
        const activeFeatureName = state.method === "kmeans-rgbxy" ? "RGB + XY" : "RGB";

        function buildFrames(useXY, prefix) {
            const featureName = useXY ? "RGB + XY" : "RGB";
            const modeDifference = useXY
                ? {
                    distance: "距离 = 颜色差 + λ·空间距离",
                    behavior: "相似颜色还必须靠得近，区域会更连续。",
                    caption: "坐标项让中心带有空间吸引范围",
                    sample: "颜色与坐标一起进入特征向量",
                }
                : {
                    distance: "距离 = 颜色差",
                    behavior: "相距很远但颜色相近的像素仍可能合并。",
                    caption: "颜色相似的远距离格子会被同一中心吸引",
                    sample: "只抽取 RGB 颜色值，不关心像素位置",
                };
            const grid = buildKMeansGridModel(useXY, 24, 17);
            const result = runKMeansOnGrid(grid);
            const props = kmeansProps(grid, result.labels);
            const largestProp = [...props].sort((a, b) => b.count - a.count)[0];

            const sampleCells = [];
            for (let i = 0; i < grid.count && sampleCells.length < 3; i += 1) {
                const x = i % grid.cols;
                const y = Math.floor(i / grid.cols);
                if ((x + y) % 4 === 0) sampleCells.push(i);
            }

            const firstSnapshot = result.snapshots[0];
            const finalSnapshot = result.snapshots[result.snapshots.length - 1];
            const firstCenters = firstSnapshot.centers;
            const finalCenters = finalSnapshot.centers;
            const firstSeeds = kmeansCenterSeeds(grid.model, firstCenters, grid.dims, grid.useXY);
            const finalSeeds = kmeansCenterSeeds(grid.model, finalCenters, grid.dims, grid.useXY);
            const distanceTable = kmeansDistanceTable(grid, firstCenters, grid.dims, 3);
            const updateTable = kmeansUpdateTable(firstCenters, finalCenters, grid.dims);

            const commonShowcase = {
                model: grid.model,
                title: `${featureName} K-means 结果`,
                caption: `K=${state.k}，在 ${grid.cols}×${grid.rows} 采样网格上完成 ${result.snapshots.length} 次迭代。`,
                alpha: 0.72,
            };

            return [
                {
                    phase: "image",
                    title: `${prefix}1. 输入图像与采样网格`,
                    graph: kmeansSamplingFlowSvg(grid, useXY),
                    matrix: metricCards([
                        ["image", `${state.work?.width || "--"}×${state.work?.height || "--"}`],
                        ["grid", `${grid.cols}×${grid.rows}=${grid.count} cells`],
                        ["K", String(state.k)],
                        [useXY ? "xy weight" : "spatial", useXY ? state.xyWeight.toFixed(2) : "ignored"],
                    ]),
                    detail: noteRows([["采样", useXY ? "格子不仅有颜色均值，还保留归一化 x/y 坐标。" : "格子只保留颜色均值，空间位置不会进入距离计算。"]]),
                    stageNote: `${modeDifference.distance}；${modeDifference.behavior}`,
                    showcase: { ...commonShowcase, labels: [], alpha: 0 },
                },
                {
                    phase: "feature",
                    title: `${prefix}2. 特征向量提取`,
                    graph: kmeansComputeSvg(grid, { mode: "image", activeCells: sampleCells, caption: modeDifference.sample }),
                    matrix: barsHtml(sampleCells.map((i) => {
                        const c = grid.model.cells[i];
                        const xy = grid.useXY
                            ? `· xy=(${(grid.features[i * grid.dims + 3] / 255 / state.xyWeight).toFixed(2)}, ${(grid.features[i * grid.dims + 4] / 255 / state.xyWeight).toFixed(2)})`
                            : "";
                        return { label: `cell ${i + 1}`, value: 1, color: `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`, note: `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})${xy}` };
                    })),
                    detail: noteRows([["特征", useXY ? `f=[R,G,B,${state.xyWeight.toFixed(2)}x,${state.xyWeight.toFixed(2)}y]` : "f=[R,G,B]"]]),
                    stageNote: useXY ? "RGB+XY 会把图像坐标作为额外维度，约束同色区域必须更接近。" : "RGB 只看颜色，天空、衣服、路面等远处同色块可能落入同一类。",
                    showcase: { ...commonShowcase, labels: [], activeCells: sampleCells, alpha: 0 },
                },
                {
                    phase: "assign",
                    title: `${prefix}3. 初始化中心并分配最近类`,
                    graph: kmeansAssignmentFieldSvg(grid, firstSnapshot, distanceTable),
                    matrix: barsHtml(distanceTable.map((d) => ({
                        label: `cell ${d.index + 1}`,
                        value: d.bestDistance,
                        color: labelFill(d.best + 1),
                        note: `C${d.best + 1}·${d.distances.join(" / ")}`,
                    }))),
                    detail: noteRows([["分配规则", useXY ? "argmin ||RGB-C||² + ||λXY-Cxy||²" : "argmin ||RGB-C||²"]]),
                    stageNote: useXY ? "坐标项会阻止远距离相似颜色被轻易拉到同一中心。" : "只用颜色距离时，空间上断裂的同色区域仍会被分到同一类。",
                    showcase: { ...commonShowcase, labels: Array.from(firstSnapshot.labels).map((l) => l + 1), seeds: firstSeeds },
                },
                {
                    phase: "update",
                    title: `${prefix}4. 更新聚类中心`,
                    graph: kmeansCenterUpdateSvg(grid, firstSnapshot, finalSnapshot, updateTable),
                    matrix: barsHtml(updateTable.map((row) => ({
                        label: `C${row.label}`,
                        value: row.move,
                        color: row.newRgb,
                        note: `${row.oldRgb} → ${row.newRgb}`,
                    }))),
                    detail: noteRows([["更新规则", useXY ? "c_k = mean([RGB, λXY])" : "c_k = mean([RGB])"]]),
                    stageNote: useXY ? "RGB+XY 的中心轨迹会靠向局部邻域，使区域边界更连续。" : "RGB 中心只追随颜色均值，可能跨越图像不同位置吸收相似颜色。",
                    showcase: { ...commonShowcase, labels: Array.from(finalSnapshot.labels).map((l) => l + 1), seeds: finalSeeds },
                },
                {
                    phase: "map",
                    title: `${prefix}5. 迭代收敛 / 最终标签图`,
                    graph: kmeansConvergenceSvg(result, finalSnapshot),
                    matrix: metricCards([
                        ["iterations", String(result.snapshots.length)],
                        ["final movement", finalSnapshot.movement.toFixed(2)],
                        ["mean distance", finalSnapshot.distance.toFixed(1)],
                        ["stop rule", "movement < 0.35"],
                    ]),
                    detail: noteRows([["收敛", useXY ? "颜色相似 + 空间接近的格子更容易形成连续区域。" : "颜色相似的格子更容易共享标签，空间连续性较弱。"]]),
                    stageNote: useXY ? "最终标签图会更倾向局部连续，噪点和远距离串联会减少。" : "最终标签图更像颜色分组，容易把远处相似颜色连到一起。",
                    showcase: { ...commonShowcase, labels: Array.from(finalSnapshot.labels).map((l) => l + 1) },
                },
                {
                    phase: "stats",
                    title: `${prefix}6. 区域统计`,
                    graph: kmeansStatsDashboardSvg(props, grid.count),
                    matrix: barsHtml(props.map((p) => ({ label: p.name, value: p.count, color: p.color, note: `${Math.round(p.ratio * 100)}%` }))),
                    detail: metricCards([
                        ["regions", String(state.k)],
                        ["largest", `C${largestProp?.label || 1} · ${Math.round((largestProp?.ratio || 0) * 100)}%`],
                        [useXY ? "continuity" : "color only", useXY ? "stronger" : "weaker"],
                        ["output", useXY ? "spatial label map" : "color label map"],
                    ]),
                    stageNote: useXY ? "区域统计会体现空间约束后的连续区域比例。" : "区域统计体现颜色聚类结果，局部碎片可能更多。",
                    showcase: { ...commonShowcase, labels: Array.from(finalSnapshot.labels).map((l) => l + 1) },
                },
            ];
        }

        const rgbFrames = buildFrames(false, "RGB ");
        const rgbxyFrames = buildFrames(true, "RGB + XY ");
        const frames = isCompare ? [...rgbFrames, ...rgbxyFrames] : (state.method === "kmeans-rgbxy" ? rgbxyFrames : rgbFrames);
        const mainGrid = state.method === "kmeans-rgbxy" ? buildKMeansGridModel(true, 24, 17) : buildKMeansGridModel(false, 24, 17);
        const mainResult = runKMeansOnGrid(mainGrid);
        const mainFeatureName = activeFeatureName;
        const displayFeatureName = isCompare ? "RGB / RGB+XY" : mainFeatureName;
        const commonShowcase = {
            model: mainGrid.model,
            title: `${mainFeatureName} K-means 结果`,
            caption: `K=${state.k}，在 ${mainGrid.cols}×${mainGrid.rows} 采样网格上完成 ${mainResult.snapshots.length} 次迭代。`,
            alpha: 0.72,
            labels: Array.from(mainResult.labels).map((l) => l + 1),
        };

        return {
            stepperKind: "kmeans",
            status: `K-means ${displayFeatureName}`,
            activeMethod: `K-means ${displayFeatureName}`,
            stageTitle: `当前实验模式：K-means ${displayFeatureName}${isCompare ? " 对比" : ""}`,
            stripFeature: displayFeatureName,
            stripK: `${state.k}`,
            stripOutput: "label map",
            regionCount: String(state.k),
            formulaLabel: "K-means",
            formula: "cluster(x)=\\arg\\min_k \\lVert f(x)-c_k\\rVert^2",
            formulaNote: `${displayFeatureName} 模式下，每个像素被分配到特征空间中距离最近的中心。`,
            notes: [
                ["特征", displayFeatureName],
                ["分配", "每个格子找最近的聚类中心"],
                ["更新", "中心移动到同类格子的平均特征"],
                ["输出", "每个格子的 cluster 标签组成 label map"],
            ],
            showcase: commonShowcase,
            frames,
        };
    }

    function colorFromCenter(centers, dims, index) {
        const c = index * dims;
        return [
            Math.max(0, Math.min(255, Math.round(centers[c]))),
            Math.max(0, Math.min(255, Math.round(centers[c + 1]))),
            Math.max(0, Math.min(255, Math.round(centers[c + 2]))),
        ];
    }

    function renderSnapshot(result, snapshot, canvas) {
        const ctx = canvas.getContext("2d");
        const image = ctx.createImageData(result.width, result.height);
        const data = image.data;
        for (let i = 0; i < snapshot.labels.length; i += 1) {
            const label = snapshot.labels[i];
            const [r, g, b] = colorFromCenter(snapshot.centers, result.dims, label);
            const p = i * 4;
            data[p] = r;
            data[p + 1] = g;
            data[p + 2] = b;
            data[p + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
    }

    function clusterRgb(index) {
        return hexToRgb(labelFill(index + 1));
    }

    function computeRegionStats(result, snapshot) {
        const total = result.width * result.height;
        const stats = Array.from({ length: result.k }, (_, index) => ({
            label: index,
            count: 0,
            minX: result.width,
            minY: result.height,
            maxX: -1,
            maxY: -1,
            sumX: 0,
            sumY: 0,
            boundary: 0,
        }));
        for (let y = 0; y < result.height; y += 1) {
            for (let x = 0; x < result.width; x += 1) {
                const i = y * result.width + x;
                const label = snapshot.labels[i];
                const item = stats[label];
                item.count += 1;
                item.sumX += x;
                item.sumY += y;
                item.minX = Math.min(item.minX, x);
                item.minY = Math.min(item.minY, y);
                item.maxX = Math.max(item.maxX, x);
                item.maxY = Math.max(item.maxY, y);
                if (
                    x === 0 || y === 0 || x === result.width - 1 || y === result.height - 1 ||
                    snapshot.labels[i - 1] !== label ||
                    snapshot.labels[i + 1] !== label ||
                    snapshot.labels[i - result.width] !== label ||
                    snapshot.labels[i + result.width] !== label
                ) {
                    item.boundary += 1;
                }
            }
        }
        return stats.map((item) => {
            const empty = item.count === 0;
            return {
                ...item,
                ratio: item.count / Math.max(1, total),
                centroidX: empty ? 0 : item.sumX / item.count,
                centroidY: empty ? 0 : item.sumY / item.count,
                width: empty ? 0 : item.maxX - item.minX + 1,
                height: empty ? 0 : item.maxY - item.minY + 1,
                color: clusterRgb(item.label),
            };
        });
    }

    function drawLabelMap(result, snapshot, canvas) {
        const ctx = canvas.getContext("2d");
        canvas.width = result.width;
        canvas.height = result.height;
        const image = ctx.createImageData(result.width, result.height);
        const data = image.data;
        for (let i = 0; i < snapshot.labels.length; i += 1) {
            const label = snapshot.labels[i];
            const color = clusterRgb(label);
            const p = i * 4;
            data[p] = color.r;
            data[p + 1] = color.g;
            data[p + 2] = color.b;
            data[p + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
    }

    function drawKMeansOverlay(result, snapshot, canvas, stats) {
        const work = ensureWorkData();
        const ctx = canvas.getContext("2d");
        canvas.width = result.width;
        canvas.height = result.height;
        const output = ctx.createImageData(result.width, result.height);
        const src = work.imageData.data;
        const dst = output.data;
        const progress = state.playing
            ? Math.max(0.16, (state.currentSnapshot + 1) / Math.max(1, result.snapshots.length))
            : 1;
        const selected = Number.isInteger(state.selectedLabel) ? state.selectedLabel : null;
        for (let y = 0; y < result.height; y += 1) {
            for (let x = 0; x < result.width; x += 1) {
                const i = y * result.width + x;
                const p = i * 4;
                const label = snapshot.labels[i];
                const color = clusterRgb(label);
                const reveal = x / Math.max(1, result.width - 1) <= progress;
                const selectedBoost = selected === null || selected === label ? 1 : 0.34;
                const mix = reveal ? 0.30 * selectedBoost : 0;
                dst[p] = Math.round(src[p] * (1 - mix) + color.r * mix);
                dst[p + 1] = Math.round(src[p + 1] * (1 - mix) + color.g * mix);
                dst[p + 2] = Math.round(src[p + 2] * (1 - mix) + color.b * mix);
                dst[p + 3] = 255;
            }
        }
        ctx.putImageData(output, 0, 0);
        ctx.save();
        ctx.lineWidth = 1;
        for (let y = 1; y < result.height - 1; y += 1) {
            for (let x = 1; x < result.width - 1; x += 1) {
                const i = y * result.width + x;
                const label = snapshot.labels[i];
                if (snapshot.labels[i - 1] !== label || snapshot.labels[i + 1] !== label || snapshot.labels[i - result.width] !== label || snapshot.labels[i + result.width] !== label) {
                    ctx.fillStyle = selected === null || selected === label ? "rgba(15, 23, 42, 0.56)" : "rgba(255, 255, 255, 0.42)";
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        if (selected !== null && stats?.[selected]?.count) {
            const item = stats[selected];
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = Math.max(2, Math.round(result.width / 150));
            ctx.setLineDash([7, 4]);
            ctx.strokeRect(item.minX + 0.5, item.minY + 0.5, Math.max(1, item.width), Math.max(1, item.height));
            ctx.setLineDash([]);
            ctx.fillStyle = "#f97316";
            ctx.beginPath();
            ctx.arc(item.centroidX, item.centroidY, Math.max(3, result.width / 70), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        canvas.classList.remove("is-mask-fade");
        void canvas.offsetWidth;
        canvas.classList.add("is-mask-fade");
    }

    function showRegionPopover(stats) {
        if (!els.regionPopover) return;
        const selected = Number.isInteger(state.selectedLabel) ? state.selectedLabel : null;
        const item = selected === null ? null : stats?.[selected];
        if (!item || !item.count) {
            els.regionPopover.hidden = true;
            els.regionPopover.innerHTML = "";
            return;
        }
        els.regionPopover.hidden = false;
        els.regionPopover.innerHTML = `
            <strong>C${item.label + 1} region</strong>
            <span>area ${item.count} px · ${Math.round(item.ratio * 100)}%</span>
            <span>bbox ${item.width}×${item.height} @ (${item.minX}, ${item.minY})</span>
            <span>centroid (${Math.round(item.centroidX)}, ${Math.round(item.centroidY)})</span>
        `;
    }

    function regionRows(result, snapshot, stats) {
        return snapshot.counts.map((count, index) => {
            const color = clusterRgb(index);
            const ratio = stats?.[index]?.ratio ?? (count / Math.max(1, result.width * result.height));
            const active = state.selectedLabel === index ? " is-selected" : "";
            return `
                <button type="button" class="seg-basic-region-row${active}" data-segb-region-label="${index}">
                    <i style="background:rgb(${color.r},${color.g},${color.b})"></i>
                    <strong>Cluster ${index + 1}</strong>
                    <div><span style="width:${Math.round(ratio * 100)}%"></span></div>
                    <em>${count} px · ${Math.round(ratio * 100)}%</em>
                </button>
            `;
        }).join("");
    }

    function centerRows(result, snapshot) {
        if (!state.showCenters) {
            return `<p class="seg-basic-muted">聚类中心显示已关闭。</p>`;
        }
        return snapshot.counts.map((count, index) => {
            const [r, g, b] = colorFromCenter(snapshot.centers, result.dims, index);
            const previous = result.snapshots[Math.max(0, state.currentSnapshot - 1)];
            const movement = previous && previous !== snapshot
                ? Math.sqrt(Array.from({ length: result.dims }, (_, d) => (snapshot.centers[index * result.dims + d] - previous.centers[index * result.dims + d]) ** 2).reduce((a, b) => a + b, 0))
                : snapshot.movement / Math.max(1, result.k);
            const xy = result.useXY ? `<small>xy=(${Math.round(snapshot.centers[index * result.dims + 3])}, ${Math.round(snapshot.centers[index * result.dims + 4])})</small>` : "";
            return `
                <div class="seg-basic-center-row">
                    <i style="background:rgb(${r},${g},${b})"></i>
                    <strong>C${index + 1}</strong>
                    <span>rgb(${r}, ${g}, ${b}) · move ${movement.toFixed(1)}</span>
                    ${xy}
                </div>
            `;
        }).join("");
    }

    function renderFeatureSpaceFallback(result, snapshot) {
        const work = ensureWorkData();
        const source = work.imageData.data;
        const maxCount = Math.max(1, ...snapshot.counts);
        const currentIndex = Math.max(0, state.currentSnapshot);
        const trailEnd = Math.max(currentIndex + 1, Math.min(result.snapshots.length, state.showIterations ? 3 : currentIndex + 1));
        const visibleSnapshots = result.snapshots.slice(0, trailEnd);
        const cubeSize = 94;
        const axisPos = (value) => ((value / 255) - 0.5) * cubeSize;
        function pixelPoint3d(index) {
            const p = index * 4;
            const r = source[p];
            const g = source[p + 1];
            const b = source[p + 2];
            return {
                x: axisPos(r),
                y: -axisPos(g),
                z: axisPos(b),
                rgb: `rgb(${r},${g},${b})`,
                label: snapshot.labels[index],
            };
        }
        const stride = Math.max(1, Math.floor((result.width * result.height) / 88));
        const samples = [];
        for (let i = 0; i < snapshot.labels.length && samples.length < 88; i += stride) {
            samples.push(pixelPoint3d(i));
        }
        const sampleDots = samples.map((point, index) => {
            const color = clusterRgb(point.label);
            return `<i class="seg-feature-particle" style="--x:${point.x.toFixed(1)}px;--y:${point.y.toFixed(1)}px;--z:${point.z.toFixed(1)}px;--c:rgb(${color.r},${color.g},${color.b});animation-delay:${(index % 18) * 18}ms" title="${point.rgb} → C${point.label + 1}"></i>`;
        }).join("");
        function pointFor3d(centerSnapshot, index) {
            const c = index * result.dims;
            const r = centerSnapshot.centers[c];
            const g = centerSnapshot.centers[c + 1];
            const b = centerSnapshot.centers[c + 2];
            return {
                x: axisPos(r),
                y: -axisPos(g),
                z: axisPos(b),
            };
        }
        const centers = Array.from({ length: result.k }, (_, index) => {
            const points = visibleSnapshots.map((item) => pointFor3d(item, index));
            const [r, g, b] = colorFromCenter(snapshot.centers, result.dims, index);
            const size = 18 + (snapshot.counts[index] / maxCount) * 20;
            const current = points[points.length - 1] || { x: 50, y: 50 };
            return `
                ${points.slice(0, -1).map((p, step) => `<i class="seg-feature-trail-3d" style="--x:${p.x.toFixed(1)}px;--y:${p.y.toFixed(1)}px;--z:${p.z.toFixed(1)}px;--c:rgb(${r},${g},${b});animation-delay:${step * 70}ms"></i>`).join("")}
                <b class="seg-feature-center-3d" style="--x:${current.x.toFixed(1)}px;--y:${current.y.toFixed(1)}px;--z:${current.z.toFixed(1)}px;--s:${Math.max(14, size * 0.62).toFixed(1)}px;--c:rgb(${r},${g},${b})"><span>C${index + 1}</span></b>
            `;
        }).join("");
        const xyPlane = result.useXY ? `
            <div class="seg-feature-xy-plane" aria-hidden="true">
                <span style="--x:18%;--y:28%"></span>
                <span style="--x:42%;--y:62%"></span>
                <span style="--x:70%;--y:38%"></span>
                <b>XY locality</b>
            </div>
        ` : "";
        const rgbBeams = !result.useXY ? `
            <div class="seg-feature-rgb-beams" aria-hidden="true">
                <span style="--r:16deg;--d:0ms"></span>
                <span style="--r:-22deg;--d:160ms"></span>
                <span style="--r:34deg;--d:320ms"></span>
                <b>color-only links</b>
            </div>
        ` : "";
        const modeFacts = result.useXY
            ? `<strong>RGB + XY</strong><span>distance includes λx, λy · nearby pixels stay together</span>`
            : `<strong>RGB only</strong><span>distance ignores x,y · remote same-color pixels can merge</span>`;
        return `
            <div class="seg-basic-feature-cloud seg-feature-cube-scene" data-mode="${result.useXY ? "rgbxy" : "rgb"}">
                ${xyPlane}
                ${rgbBeams}
                <div class="seg-feature-cube" role="img" aria-label="Rotating RGB feature cube">
                    <span class="seg-cube-face is-front"></span>
                    <span class="seg-cube-face is-back"></span>
                    <span class="seg-cube-face is-left"></span>
                    <span class="seg-cube-face is-right"></span>
                    <span class="seg-cube-face is-top"></span>
                    <span class="seg-cube-face is-bottom"></span>
                    ${sampleDots}
                    ${centers}
                </div>
                <div class="seg-feature-cube-labels"><span>R</span><span>G</span><span>B</span></div>
                <em><strong>iteration ${snapshot.iter}/${result.snapshots.length}</strong>${result.useXY ? "RGB cube + XY plane guides local center drift" : "RGB cube: color-similar pixels orbit mean centers"}</em>
                <div class="seg-feature-mode-facts">${modeFacts}</div>
            </div>
        `;
    }

    function renderFeatureSpace(result, snapshot) {
        if (!window.THREE) return renderFeatureSpaceFallback(result, snapshot);
        return `
            <div class="seg-feature-3d-shell" data-mode="${result.useXY ? "rgbxy" : "rgb"}">
                <div class="seg-feature-3d-stage" data-segb-feature3d role="img" aria-label="3D RGB feature scatter plot"></div>
                <div class="seg-feature-3d-labels" aria-hidden="true">
                    <span>R</span><span>G</span><span>B</span>
                </div>
                <div class="seg-feature-3d-caption">
                    <strong>iteration ${snapshot.iter}/${result.snapshots.length}</strong>
                    <span>${result.useXY ? "RGB scatter + XY locality constraint" : "RGB scatter · color distance only"}</span>
                </div>
            </div>
        `;
    }

    function feature3dPositionFromRgb(r, g, b) {
        const scale = 3.2;
        return [
            (r / 255 - 0.5) * scale,
            (g / 255 - 0.5) * scale,
            (b / 255 - 0.5) * scale,
        ];
    }

    function feature3dCenterPosition(snapshot, result, index) {
        const c = index * result.dims;
        return feature3dPositionFromRgb(snapshot.centers[c], snapshot.centers[c + 1], snapshot.centers[c + 2]);
    }

    function feature3dDisposeObject(object) {
        if (!object) return;
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose?.());
        } else {
            object.material?.dispose?.();
        }
    }

    function feature3dClearDynamic() {
        if (!feature3d.root) return;
        if (feature3d.points) {
            feature3d.root.remove(feature3d.points);
            feature3dDisposeObject(feature3d.points);
            feature3d.points = null;
        }
        feature3d.trailLines.forEach((line) => {
            feature3d.root.remove(line);
            feature3dDisposeObject(line);
        });
        feature3d.trailLines = [];
    }

    function feature3dAddStaticScene() {
        const THREE = window.THREE;
        const cube = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 3.2, 3.2)),
            new THREE.LineBasicMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.72 }),
        );
        feature3d.root.add(cube);

        const axes = [
            [[-1.8, -1.8, -1.8], [1.9, -1.8, -1.8], 0x2563eb],
            [[-1.8, -1.8, -1.8], [-1.8, 1.9, -1.8], 0x22c55e],
            [[-1.8, -1.8, -1.8], [-1.8, -1.8, 1.9], 0xf97316],
        ];
        axes.forEach(([a, b, color]) => {
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(...a),
                    new THREE.Vector3(...b),
                ]),
                new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62 }),
            );
            feature3d.root.add(line);
        });

        feature3d.xyPlane = new THREE.GridHelper(3.25, 8, 0x86efac, 0xdbeafe);
        feature3d.xyPlane.position.y = -1.74;
        feature3d.xyPlane.material.transparent = true;
        feature3d.xyPlane.material.opacity = 0.0;
        feature3d.root.add(feature3d.xyPlane);
    }

    function feature3dEnsure(mount, result) {
        if (!window.THREE || !mount) return false;
        const THREE = window.THREE;
        if (feature3d.mount === mount && feature3d.renderer && feature3d.mode === (result.useXY ? "rgbxy" : "rgb") && feature3d.k === result.k) {
            return true;
        }
        if (feature3d.frame) cancelAnimationFrame(feature3d.frame);
        if (feature3d.renderer) {
            feature3d.renderer.dispose?.();
            feature3d.renderer.domElement?.remove?.();
        }
        feature3d.mount = mount;
        feature3d.mode = result.useXY ? "rgbxy" : "rgb";
        feature3d.k = result.k;
        feature3d.scene = new THREE.Scene();
        feature3d.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        feature3d.camera.position.set(4.2, 3.1, 5.4);
        feature3d.camera.lookAt(0, 0, 0);
        feature3d.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        feature3d.renderer.setClearColor(0xffffff, 0);
        feature3d.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
        mount.innerHTML = "";
        mount.appendChild(feature3d.renderer.domElement);

        feature3d.scene.add(new THREE.AmbientLight(0xffffff, 0.94));
        const light = new THREE.DirectionalLight(0xffffff, 1.12);
        light.position.set(3, 4, 5);
        feature3d.scene.add(light);
        feature3d.root = new THREE.Group();
        feature3d.scene.add(feature3d.root);
        feature3d.centerMeshes = [];
        feature3d.trailLines = [];
        feature3d.points = null;
        feature3dAddStaticScene();

        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        mount.addEventListener("pointerdown", (event) => {
            dragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
            mount.setPointerCapture?.(event.pointerId);
        });
        mount.addEventListener("pointermove", (event) => {
            if (!dragging || !feature3d.root) return;
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;
            feature3d.root.rotation.y += dx * 0.008;
            feature3d.root.rotation.x = clamp(feature3d.root.rotation.x + dy * 0.006, -0.75, 0.75);
        });
        const stopDrag = (event) => {
            dragging = false;
            mount.releasePointerCapture?.(event.pointerId);
        };
        mount.addEventListener("pointerup", stopDrag);
        mount.addEventListener("pointercancel", stopDrag);
        mount.addEventListener("pointerleave", () => { dragging = false; });

        const sphereGeometry = new THREE.SphereGeometry(0.105, 18, 14);
        for (let k = 0; k < result.k; k += 1) {
            const color = clusterRgb(k);
            const mesh = new THREE.Mesh(
                sphereGeometry.clone(),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(`rgb(${color.r},${color.g},${color.b})`),
                    roughness: 0.48,
                    metalness: 0.02,
                    transparent: true,
                    opacity: 0.96,
                }),
            );
            mesh.scale.setScalar(1.25);
            feature3d.root.add(mesh);
            feature3d.centerMeshes.push(mesh);
        }

        const renderLoop = () => {
            const width = Math.max(220, mount.clientWidth || 220);
            const height = Math.max(146, mount.clientHeight || 146);
            const canvas = feature3d.renderer.domElement;
            if (canvas.width !== Math.round(width * feature3d.renderer.getPixelRatio()) || canvas.height !== Math.round(height * feature3d.renderer.getPixelRatio())) {
                feature3d.renderer.setSize(width, height, false);
                feature3d.camera.aspect = width / height;
                feature3d.camera.updateProjectionMatrix();
            }
            const now = performance.now();
            const t = feature3d.tweenStart ? clamp((now - feature3d.tweenStart) / 520, 0, 1) : 1;
            const eased = 1 - (1 - t) ** 3;
            if (feature3d.fromCenters && feature3d.targetCenters) {
                feature3d.centerMeshes.forEach((mesh, index) => {
                    const from = feature3d.fromCenters[index] || feature3d.targetCenters[index];
                    const to = feature3d.targetCenters[index] || from;
                    mesh.position.set(
                        from[0] + (to[0] - from[0]) * eased,
                        from[1] + (to[1] - from[1]) * eased,
                        from[2] + (to[2] - from[2]) * eased,
                    );
                    const pulse = 1.18 + Math.sin(now / 180 + index) * 0.08;
                    mesh.scale.setScalar(pulse);
                });
            }
            feature3d.root.rotation.y += 0.0022;
            feature3d.renderer.render(feature3d.scene, feature3d.camera);
            feature3d.frame = requestAnimationFrame(renderLoop);
        };
        renderLoop();
        return true;
    }

    function feature3dSamplePoints(result, snapshot) {
        const work = ensureWorkData();
        const source = work.imageData.data;
        const total = result.width * result.height;
        const stride = Math.max(1, Math.floor(total / 720));
        const positions = [];
        const colors = [];
        for (let i = 0; i < total; i += stride) {
            const p = i * 4;
            const pos = feature3dPositionFromRgb(source[p], source[p + 1], source[p + 2]);
            positions.push(pos[0], pos[1], pos[2]);
            const color = clusterRgb(snapshot.labels[i]);
            colors.push(color.r / 255, color.g / 255, color.b / 255);
        }
        return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
    }

    function updateFeatureSpace3D(result, snapshot) {
        const mount = els.featureSpace?.querySelector("[data-segb-feature3d]");
        if (!feature3dEnsure(mount, result)) return;
        const THREE = window.THREE;
        feature3dClearDynamic();

        const sampled = feature3dSamplePoints(result, snapshot);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(sampled.positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(sampled.colors, 3));
        feature3d.points = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
                size: 0.045,
                vertexColors: true,
                transparent: true,
                opacity: 0.72,
                sizeAttenuation: true,
            }),
        );
        feature3d.root.add(feature3d.points);

        const targetCenters = Array.from({ length: result.k }, (_, index) => feature3dCenterPosition(snapshot, result, index));
        const fromCenters = feature3d.lastCenters?.length === result.k
            ? feature3d.lastCenters
            : targetCenters.map((item) => [...item]);
        feature3d.fromCenters = fromCenters.map((item) => [...item]);
        feature3d.targetCenters = targetCenters.map((item) => [...item]);
        feature3d.lastCenters = targetCenters.map((item) => [...item]);
        feature3d.tweenStart = performance.now();

        const upto = Math.max(1, state.currentSnapshot + 1);
        for (let k = 0; k < result.k; k += 1) {
            const trail = result.snapshots.slice(0, upto).map((item) => new THREE.Vector3(...feature3dCenterPosition(item, result, k)));
            if (trail.length < 2) continue;
            const color = clusterRgb(k);
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(trail),
                new THREE.LineBasicMaterial({
                    color: new THREE.Color(`rgb(${color.r},${color.g},${color.b})`),
                    transparent: true,
                    opacity: 0.52,
                }),
            );
            feature3d.root.add(line);
            feature3d.trailLines.push(line);
        }

        if (feature3d.xyPlane) {
            feature3d.xyPlane.material.opacity = result.useXY ? 0.42 : 0.08;
        }
    }

    function snapshotIndexForKMeansPhase(phase, result) {
        const last = Math.max(0, result.snapshots.length - 1);
        if (phase === "image" || phase === "feature" || phase === "assign") return 0;
        if (phase === "update") return Math.min(1, last);
        return last;
    }

    function kmeansTheoryForPhase(result, snapshot, stats, frame) {
        const feature = result.useXY ? "RGB + XY" : "RGB";
        const selected = Number.isInteger(state.selectedLabel) ? stats?.[state.selectedLabel] : null;
        const ratio = stats.map((item) => `C${item.label + 1}=${Math.round(item.ratio * 100)}%`).join(" / ");
        const commonFacts = [
            ["K", String(result.k)],
            ["feature", feature],
            ["iteration", `${snapshot.iter}/${result.snapshots.length}`],
            ["output", state.kmeansPhase === "stats" ? "region table" : state.kmeansPhase === "map" ? "overlay mask" : "intermediate state"],
        ];
        const byPhase = {
            image: {
                label: "输入采样",
                formula: "I(x,y) = [R,G,B],  x ∈ Ω",
                principle: result.useXY
                    ? "RGB+XY 会在采样时保留像素位置，为后续距离计算加入空间约束。"
                    : "RGB 模式只保留像素颜色，后续聚类不会感知像素在图像中的位置。",
                flow: ["image canvas", "pixel grid Ω", "RGB value", "feature sample"],
                theory: [
                    ["计算对象", "不是整张图一次性分类，而是把每个像素看作一个待分配的数据点。"],
                    ["教学尺寸", `${result.width}×${result.height} 像素；页面缩放只影响计算量，不改变 K-means 逻辑。`],
                    ["下一步", "为每个像素构造 f(x)，把图像空间转换成可计算距离的特征空间。"],
                ],
            },
            feature: {
                label: "构造特征空间",
                formula: result.useXY ? "f_i = [R_i,G_i,B_i, λx_i, λy_i]" : "f_i = [R_i,G_i,B_i]",
                principle: result.useXY ? "RGB+XY 把位置也放入距离计算，颜色相似但相距很远的像素不再轻易合并。" : "RGB 模式只使用颜色距离，因此相同颜色会在特征空间中靠近，即使它们在图像上相隔较远。",
                flow: ["pixel", "feature vector", "RGB space", "cluster centers"],
                theory: [
                    ["特征向量", result.useXY ? `λ=${state.xyWeight.toFixed(2)}，坐标项被缩放到与颜色同量级。` : "每个像素只由三维颜色向量表示。"],
                    ["中心含义", "C1-C4 是当前特征空间中的均值点，动画轨迹表示每次迭代的中心移动。"],
                    ["可视化", "中央图中的中心不是装饰，它对应当前 snapshot 的真实 center 数值。"],
                ],
            },
            assign: {
                label: "分配最近中心",
                formula: result.useXY ? "z_i = arg min_k (||RGB_i-C^rgb_k||² + ||λXY_i-C^xy_k||²)" : "z_i = arg min_k || RGB_i - C^rgb_k ||²",
                principle: result.useXY
                    ? "对每个像素同时比较颜色距离和空间距离，远处同色点会被空间项拉开。"
                    : "对每个像素只比较颜色距离，远处同色点仍可能被同一个中心吸收。",
                flow: ["feature f_i", "distance to Ck", "argmin", "label z_i"],
                theory: [
                    ["距离度量", "平方欧氏距离会放大较大的颜色/位置差异。"],
                    ["标签图", "一次 assignment 后已经得到临时 label map，但中心还不是最终均值。"],
                    ["当前代价", `mean distance=${snapshot.distance.toFixed(1)}，越小表示像素更贴近自己的中心。`],
                ],
            },
            update: {
                label: "更新聚类中心",
                formula: result.useXY ? "c_k = mean([R,G,B,λx,λy] | z_i=k)" : "c_k = mean([R,G,B] | z_i=k)",
                principle: result.useXY
                    ? "中心同时更新颜色均值和空间均值，因此轨迹会向局部邻域收缩。"
                    : "中心只更新颜色均值，因此轨迹主要反映颜色分布变化。",
                flow: ["cluster pixels", "mean feature", "new center", "next iteration"],
                theory: [
                    ["均值更新", "中心颜色等于该类像素颜色均值；RGB+XY 下还会更新空间均值。"],
                    ["收敛判断", "movement 记录中心总移动量，低于阈值或达到最大迭代次数后停止。"],
                    ["当前移动", `movement=${snapshot.movement.toFixed(2)}。`],
                ],
            },
            map: {
                label: "生成分割 mask",
                formula: "M(x,y)=z_i,  B=∂M",
                principle: result.useXY
                    ? "RGB+XY 的 label map 更强调空间连续性，再映射成半透明 mask 和边界。"
                    : "RGB 的 label map 更像颜色分组，再映射成半透明 mask 和边界。",
                flow: ["label map", "color mask", "boundary", "overlay"],
                theory: [
                    ["mask", "彩色 mask 来自整数标签，不再用中心颜色直接替代原图。"],
                    ["边界", "边界线由邻域标签变化产生，比马赛克结果更能表达区域轮廓。"],
                    ["输出用途", "overlay 用于观察分割质量，pure label map 用于后续统计。"],
                ],
            },
            stats: {
                label: "区域统计",
                formula: "count_k = Σ 1[M_i=k],  ratio_k=count_k/|Ω|",
                principle: result.useXY
                    ? "统计 RGB+XY 输出时，应重点观察区域是否更连续、bbox 是否更局部。"
                    : "统计 RGB 输出时，应重点观察颜色类占比和可能的跨区域合并。",
                flow: ["label map", "count", "bbox", "centroid"],
                theory: [
                    ["区域数量", `region count=${result.k}，这里的区域是 cluster label，不等价于连通域数量。`],
                    ["类别占比", ratio],
                    ["点击区域", selected ? `C${selected.label + 1}: area=${selected.count}px, bbox=${selected.width}×${selected.height}, centroid=(${Math.round(selected.centroidX)},${Math.round(selected.centroidY)})。` : "点击 overlay 或统计行可查看 bbox / area / centroid。"],
                ],
            },
        };
        const meta = byPhase[state.kmeansPhase] || byPhase.stats;
        return {
            ...meta,
            title: frame?.title || meta.label,
            stageNote: frame?.stageNote || meta.principle,
            facts: commonFacts,
        };
    }

    function renderKMeansStepFocus(frame, result, snapshot, stats) {
        if (!els.stepFocus || !frame) return;
        const theory = kmeansTheoryForPhase(result, snapshot, stats, frame);
        const largest = [...stats].sort((a, b) => b.count - a.count)[0];
        const ratios = stats.map((item) => `C${item.label + 1} ${Math.round(item.ratio * 100)}%`).join(" · ");
        const selected = Number.isInteger(state.selectedLabel) ? stats?.[state.selectedLabel] : null;
        const activeLegendLabel = selected?.label ?? largest?.label;
        els.stepFocus.dataset.phase = state.kmeansPhase;
        els.stepVisual.innerHTML = conceptCard(theory.title, frame.graph, theory.stageNote);
        els.stepMatrix.innerHTML = conceptCard("当前中间量", frame.matrix);
        els.stepDetail.innerHTML = conceptCard("计算输出", frame.detail);
        els.notesSubtitle.textContent = theory.label;
        els.formulaLabel.textContent = "K-means";
        els.formula.innerHTML = renderLatexFormula(theory.formula);
        els.formulaNote.textContent = theory.principle;
        els.notes.innerHTML = `
            <div class="seg-basic-note-current">
                <span>当前步骤 ${state.kmeansFrameIndex + 1}/${state.concept?.frames?.length || 1}</span>
                <strong>${escapeHtml(theory.label)}</strong>
                <p>${escapeHtml(theory.stageNote)}</p>
            </div>
            ${notesFlowChips(theory.flow)}
            ${notesClusterBars(stats, activeLegendLabel)}
            <dl class="seg-notes-focus-list">
                <div><dt>当前参数</dt><dd>K=${result.k} · Feature=${result.useXY ? "RGB+XY" : "RGB"} · Iteration=${snapshot.iter}/${result.snapshots.length} · Output=${state.kmeansPhase === "stats" ? "region stats" : "overlay mask"}</dd></div>
                <div><dt>区域统计</dt><dd>region count=${result.k} · largest=C${(largest?.label ?? 0) + 1} ${Math.round((largest?.ratio || 0) * 100)}% · ${ratios}</dd></div>
                <div><dt>计算状态</dt><dd>movement=${snapshot.movement.toFixed(2)} · mean distance=${snapshot.distance.toFixed(1)}</dd></div>
                ${selected ? `<div><dt>点击区域</dt><dd>C${selected.label + 1} · area=${selected.count}px · bbox=${selected.width}×${selected.height} · centroid=(${Math.round(selected.centroidX)},${Math.round(selected.centroidY)})</dd></div>` : ""}
            </dl>
            <div class="seg-basic-cluster-legend" aria-label="聚类颜色图例">
                ${stats.map((item) => `<span class="${activeLegendLabel === item.label ? "is-active" : ""}"><i style="background:rgb(${item.color.r},${item.color.g},${item.color.b})"></i>C${item.label + 1}</span>`).join("")}
            </div>
        `;
    }

    function notesFlowChips(flow = []) {
        if (!flow.length) return "";
        return `
            <div class="seg-notes-mini-flow" aria-label="当前计算流程">
                ${flow.map((item, index) => `
                    <span>${escapeHtml(item)}</span>
                    ${index < flow.length - 1 ? "<i></i>" : ""}
                `).join("")}
            </div>
        `;
    }

    function notesClusterBars(stats, activeLabel) {
        return `
            <div class="seg-notes-cluster-bars" aria-label="Cluster ratio">
                ${stats.map((item) => {
                    const percent = Math.round(item.ratio * 100);
                    const color = `rgb(${item.color.r},${item.color.g},${item.color.b})`;
                    return `
                        <div class="${activeLabel === item.label ? "is-active" : ""}" style="--w:${percent}%;--c:${color}">
                            <span>C${item.label + 1}</span>
                            <b></b>
                            <em>${percent}%</em>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderContinuityMap(result, snapshot) {
        const ctx = els.compareCanvas.getContext("2d");
        const image = ctx.createImageData(result.width, result.height);
        const data = image.data;
        for (let y = 0; y < result.height; y += 1) {
            for (let x = 0; x < result.width; x += 1) {
                const i = y * result.width + x;
                const label = snapshot.labels[i];
                let mismatch = 0;
                if (x > 0 && snapshot.labels[i - 1] !== label) mismatch += 1;
                if (y > 0 && snapshot.labels[i - result.width] !== label) mismatch += 1;
                if (x < result.width - 1 && snapshot.labels[i + 1] !== label) mismatch += 1;
                if (y < result.height - 1 && snapshot.labels[i + result.width] !== label) mismatch += 1;
                const smooth = Math.max(0, 255 - mismatch * 55);
                const p = i * 4;
                data[p] = 48;
                data[p + 1] = Math.max(120, smooth);
                data[p + 2] = 255 - smooth * 0.45;
                data[p + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
    }

    function renderIterationMonitor(result) {
        const movements = result.snapshots.map((snapshot) => snapshot.movement);
        const maxMovement = Math.max(1, ...movements);
        els.iterationMonitor.innerHTML = `
            <div class="seg-basic-movement-bars">
                ${movements.map((movement, index) => `<i class="${index === state.currentSnapshot ? "is-active" : ""}" style="height:${Math.max(8, Math.round((movement / maxMovement) * 100))}%"><span>${index + 1}</span></i>`).join("")}
            </div>
            <p>movement: ${result.snapshots[state.currentSnapshot]?.movement.toFixed(2) || "--"} · mean distance: ${result.snapshots[state.currentSnapshot]?.distance.toFixed(1) || "--"}</p>
        `;
    }

    function processAssignmentVisual(result, snapshot) {
        const work = ensureWorkData();
        const built = buildFeatures(work, result.useXY);
        const sampleIndex = clamp(Math.floor(result.height * 0.52) * result.width + Math.floor(result.width * 0.48), 0, result.width * result.height - 1);
        const f = sampleIndex * result.dims;
        const distances = Array.from({ length: result.k }, (_, k) => {
            const c = k * result.dims;
            let distance = 0;
            for (let d = 0; d < result.dims; d += 1) {
                const diff = built.features[f + d] - snapshot.centers[c + d];
                distance += diff * diff;
            }
            return Math.sqrt(distance);
        });
        const maxDistance = Math.max(1, ...distances);
        const best = distances.indexOf(Math.min(...distances));
        const sampleX = 84;
        const sampleY = 76;
        const centers = distances.map((distance, index) => {
            const angle = -0.9 + (index / Math.max(1, result.k - 1)) * 1.8;
            const radius = 58 + (distance / maxDistance) * 22;
            const x = sampleX + Math.cos(angle) * radius;
            const y = sampleY + Math.sin(angle) * radius;
            const color = labelFill(index + 1);
            return { index, distance, x, y, color, best: index === best };
        });
        return `
            <div class="seg-iteration-visual is-assign" data-mode="${result.useXY ? "rgbxy" : "rgb"}">
                <svg viewBox="0 0 220 138" role="img" aria-label="assignment distance argmin">
                    <text x="12" y="18" class="seg-mini-title">${result.useXY ? "argmin RGB distance + λXY penalty" : "argmin RGB color distance"}</text>
                    <circle class="seg-mini-sample" cx="${sampleX}" cy="${sampleY}" r="15"/>
                    <text x="${sampleX}" y="${sampleY + 4}" text-anchor="middle" class="seg-mini-sample-text">xᵢ</text>
                    ${result.useXY ? `<circle class="seg-mini-xy-radius" cx="${sampleX}" cy="${sampleY}" r="38"/>` : ""}
                    ${centers.map((item) => `
                        <path class="seg-mini-distance-ray ${item.best ? "is-best" : ""}" d="M${sampleX} ${sampleY} L${item.x.toFixed(1)} ${item.y.toFixed(1)}" style="--c:${item.color}"/>
                        <circle class="seg-mini-center ${item.best ? "is-best" : ""}" cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="${item.best ? 12 : 9}" style="--c:${item.color}"/>
                        <text x="${item.x.toFixed(1)}" y="${(item.y + 4).toFixed(1)}" text-anchor="middle" class="seg-mini-center-text">C${item.index + 1}</text>
                    `).join("")}
                </svg>
                <div class="seg-mini-distance-bars">
                    ${centers.map((item) => `
                        <span class="${item.best ? "is-best" : ""}" style="--w:${Math.max(8, 100 - (item.distance / maxDistance) * 82).toFixed(1)}%;--c:${item.color}">
                            <b>C${item.index + 1}</b><i></i><em>${result.useXY ? `d+xy ${item.distance.toFixed(1)}` : item.distance.toFixed(1)}</em>
                        </span>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function processUpdateVisual(result, snapshot) {
        const previous = result.snapshots[Math.max(0, state.currentSnapshot - 1)] || snapshot;
        const movementMax = Math.max(1, ...Array.from({ length: result.k }, (_, k) => {
            const c = k * result.dims;
            let distance = 0;
            for (let d = 0; d < result.dims; d += 1) distance += (snapshot.centers[c + d] - previous.centers[c + d]) ** 2;
            return Math.sqrt(distance);
        }));
        const rows = Array.from({ length: result.k }, (_, k) => {
            const c = k * result.dims;
            const oldRgb = colorFromCenter(previous.centers, result.dims, k);
            const newRgb = colorFromCenter(snapshot.centers, result.dims, k);
            let distance = 0;
            for (let d = 0; d < result.dims; d += 1) distance += (snapshot.centers[c + d] - previous.centers[c + d]) ** 2;
            const move = Math.sqrt(distance);
            return { k, oldRgb, newRgb, move, width: Math.max(7, (move / movementMax) * 100) };
        });
        return `
            <div class="seg-iteration-visual is-update" data-mode="${result.useXY ? "rgbxy" : "rgb"}">
                <svg viewBox="0 0 220 118" role="img" aria-label="centroid update mean movement">
                    <text x="12" y="18" class="seg-mini-title">${result.useXY ? "cₖ ← mean([RGB, λx, λy])" : "cₖ ← mean([R,G,B])"}</text>
                    ${rows.slice(0, 4).map((item, index) => {
                        const y = 42 + index * 18;
                        const oldColor = `rgb(${item.oldRgb.join(",")})`;
                        const newColor = `rgb(${item.newRgb.join(",")})`;
                        const x2 = 78 + item.width;
                        return `
                            <g class="seg-mini-center-move" style="--c:${newColor};animation-delay:${index * 70}ms">
                                <text x="14" y="${y + 4}" class="seg-mini-label">C${item.k + 1}</text>
                                <circle cx="50" cy="${y}" r="6" fill="${oldColor}"/>
                                <path d="M60 ${y} C76 ${y - 10}, ${Math.max(84, x2 - 16).toFixed(1)} ${y + 10}, ${x2.toFixed(1)} ${y}" class="seg-mini-move-path"/>
                                <circle cx="${x2.toFixed(1)}" cy="${y}" r="8" fill="${newColor}" stroke="#fff" stroke-width="2"/>
                                <text x="176" y="${y + 4}" class="seg-mini-note">${item.move.toFixed(1)}</text>
                            </g>
                        `;
                    }).join("")}
                </svg>
                <div class="seg-mini-update-caption">
                    <span>movement</span>
                    <b><i style="width:${Math.round(clamp(snapshot.movement / 180, 0, 1) * 100)}%"></i></b>
                    <em>${snapshot.movement.toFixed(2)}</em>
                </div>
            </div>
        `;
    }

    function renderProcessIterationVisual(result, snapshot) {
        if (state.kmeansPhase === "assign") return processAssignmentVisual(result, snapshot);
        if (state.kmeansPhase === "update") return processUpdateVisual(result, snapshot);
        return `
            <div class="seg-iteration-visual is-summary" data-mode="${result.useXY ? "rgbxy" : "rgb"}">
                <svg viewBox="0 0 220 118" role="img" aria-label="iteration summary">
                    <text x="12" y="18" class="seg-mini-title">assignment ↔ update loop</text>
                    <circle cx="62" cy="68" r="27" fill="#eff6ff" stroke="#bfdbfe"/>
                    <circle cx="158" cy="68" r="27" fill="#f8fbff" stroke="#bfdbfe"/>
                    <path class="seg-mini-loop" d="M90 58 C108 36, 134 36, 152 58"/>
                    <path class="seg-mini-loop" d="M132 80 C112 100, 86 98, 70 78"/>
                    <text x="62" y="72" text-anchor="middle" class="seg-svg-title">assign</text>
                    <text x="158" y="72" text-anchor="middle" class="seg-svg-title">mean</text>
                </svg>
                <div class="seg-mini-update-caption">
                    <span>iteration</span>
                    <b><i style="width:${Math.round((snapshot.iter / Math.max(1, result.snapshots.length)) * 100)}%"></i></b>
                    <em>${snapshot.iter}/${result.snapshots.length}</em>
                </div>
            </div>
        `;
    }

    function updateProcessCards(result, snapshot, stats) {
        const lastSnapshot = result.snapshots[result.snapshots.length - 1] || snapshot;
        const isFinal = snapshot.iter >= lastSnapshot.iter;
        const isConverged = isFinal && lastSnapshot.movement < 0.35;
        const outputLabel = state.kmeansPhase === "stats"
            ? "region stats"
            : state.kmeansPhase === "map"
                ? "overlay mask"
                : "label map";
        if (els.processIterationCard) {
            els.processIterationCard.style.setProperty("--iter-progress", `${Math.round((snapshot.iter / Math.max(1, result.snapshots.length)) * 100)}%`);
            els.processIterationCard.style.setProperty("--move-progress", `${Math.round(clamp(snapshot.movement / 180, 0, 1) * 100)}%`);
        }
        if (els.kmeansView) {
            els.kmeansView.dataset.phase = state.kmeansPhase;
            els.kmeansView.dataset.featureMode = result.useXY ? "rgbxy" : "rgb";
        }
        if (els.processIteration) els.processIteration.textContent = `${snapshot.iter} / ${result.snapshots.length}`;
        if (els.processDistance) els.processDistance.textContent = snapshot.distance.toFixed(1);
        if (els.processMovement) els.processMovement.textContent = snapshot.movement.toFixed(2);
        if (els.processStop) els.processStop.textContent = isConverged ? "movement < 0.35" : `max iter ${state.maxIter}`;
        if (els.processConvergence) {
            els.processConvergence.textContent = isConverged ? "converged" : (isFinal ? "max iteration" : "iterating");
            els.processConvergence.classList.toggle("is-converged", isConverged);
        }
        if (els.processIterationVisual) {
            els.processIterationVisual.innerHTML = renderProcessIterationVisual(result, snapshot);
            els.processIterationVisual.dataset.phase = state.kmeansPhase;
            els.processIterationVisual.dataset.mode = result.useXY ? "rgbxy" : "rgb";
        }
        if (els.processOutput) els.processOutput.textContent = outputLabel;
        if (els.processOutputType) els.processOutputType.textContent = outputLabel;
        if (els.processDecode) els.processDecode.textContent = "color mask + boundary";
        if (els.processRegions) els.processRegions.textContent = String(stats.length);
        if (els.processOutputNote) {
            els.processOutputNote.textContent = state.kmeansPhase === "stats"
                ? (result.useXY ? "统计阶段会看到更强调局部连续性的 cluster 占比与区域边界。" : "统计阶段会看到颜色聚类带来的跨区域合并和局部碎片。")
                : (result.useXY ? "RGB+XY label map 先压制远距离同色合并，再转成半透明 mask + 边界。" : "RGB label map 主要按颜色分组，再转成半透明 mask + 边界。");
        }
        if (els.processOutputVisual) {
            els.processOutputVisual.dataset.phase = state.kmeansPhase;
            els.processOutputVisual.dataset.mode = result.useXY ? "rgbxy" : "rgb";
            const largest = Math.max(0, ...stats.map((item) => item.count));
            const total = Math.max(1, result.width * result.height);
            els.processOutputVisual.style.setProperty("--largest-ratio", `${Math.round((largest / total) * 100)}%`);
        }
        if (els.processOutputCard) {
            els.processOutputCard.classList.toggle("is-overlay-active", state.kmeansPhase === "map");
        }
    }

    function updateKMeansReadout(result, snapshot) {
        if (state.selectedLabel !== null && state.selectedLabel >= result.k) state.selectedLabel = null;
        const counts = snapshot.counts;
        const stats = computeRegionStats(result, snapshot);
        const maxCount = Math.max(...counts);
        const mainIndex = counts.indexOf(maxCount);
        const ratioText = `${Math.round((maxCount / (result.width * result.height)) * 100)}%`;
        els.currentIter.textContent = `${snapshot.iter} / ${result.snapshots.length}`;
        els.regionCount.textContent = String(result.k);
        els.stripIter.textContent = `${snapshot.iter}`;
        els.stripK.textContent = String(result.k);
        if (els.featureIteration) els.featureIteration.textContent = `iteration ${snapshot.iter} / ${result.snapshots.length}`;
        if (els.labelSubtitle) els.labelSubtitle.textContent = `synced with iteration ${snapshot.iter}`;
        els.regionList.innerHTML = regionRows(result, snapshot, stats);
        els.centerList.innerHTML = centerRows(result, snapshot);
        const featureMode = result.useXY ? "rgbxy" : "rgb";
        const featureShell = els.featureSpace.querySelector(".seg-feature-3d-shell");
        if (!window.THREE || !featureShell || featureShell.dataset.mode !== featureMode) {
            els.featureSpace.innerHTML = renderFeatureSpace(result, snapshot);
        } else {
            const captionStrong = featureShell.querySelector(".seg-feature-3d-caption strong");
            const captionText = featureShell.querySelector(".seg-feature-3d-caption span");
            if (captionStrong) captionStrong.textContent = `iteration ${snapshot.iter}/${result.snapshots.length}`;
            if (captionText) captionText.textContent = result.useXY ? "RGB scatter + XY locality constraint" : "RGB scatter · color distance only";
        }
        updateFeatureSpace3D(result, snapshot);
        renderIterationMonitor(result);
        updateProcessCards(result, snapshot, stats);
        showRegionPopover(stats);
        renderNotesForKMeans(result, snapshot, stats, mainIndex, ratioText);
        return stats;
    }

    function renderNotesForKMeans(result, snapshot, stats, mainIndex, ratioText) {
        const feature = result.useXY ? "RGB + XY" : "RGB";
        const ratios = snapshot.counts.map((count, index) => `C${index + 1}: ${Math.round((count / (result.width * result.height)) * 100)}%`).join(" / ");
        const stepNames = {
            image: "输入图像",
            feature: "特征空间",
            assign: "分配到最近中心",
            update: "更新聚类中心",
            map: "生成分割 mask",
            stats: "区域统计",
        };
        const currentStep = stepNames[state.kmeansPhase] || "区域统计";
        const selected = Number.isInteger(state.selectedLabel) ? stats?.[state.selectedLabel] : null;
        const phaseFlows = {
            image: ["image", "pixels", "RGB", "feature"],
            feature: ["pixels", "f(x)", "space", "centers"],
            assign: ["f(x)", "distance", "argmin", "label"],
            update: ["cluster", "mean", "center", "iterate"],
            map: ["label", "mask", "boundary", "overlay"],
            stats: ["label", "count", "ratio", "region"],
        };
        const activeLegendLabel = selected?.label ?? mainIndex;
        const legend = stats.map((item) => `
            <span class="${item.label === activeLegendLabel ? "is-active" : ""}">
                <i style="background:rgb(${item.color.r},${item.color.g},${item.color.b})"></i>
                C${item.label + 1}
            </span>
        `).join("");
        els.notesSubtitle.textContent = currentStep;
        els.formulaLabel.textContent = "K-means";
        els.formula.innerHTML = renderLatexFormula("\\text{cluster}(x) = \\arg\\min_k \\|f(x) - c_k\\|^2");
        els.formulaNote.textContent = result.useXY
            ? "f(x) = [R,G,B, xyWeight·X, xyWeight·Y]，坐标项会惩罚空间上相距较远的同色像素。"
            : "f(x) = [R,G,B]，只根据颜色距离聚类，空间上不连续的同色区域可能被分到同一类。";
        els.notes.innerHTML = `
            <div class="seg-basic-note-current">
                <span>当前步骤</span>
                <strong>${currentStep}</strong>
                <p>${state.kmeansPhase === "feature" ? "像素被映射到特征空间，中心点会向同类均值移动。" : state.kmeansPhase === "map" ? "label map 转成半透明 mask，并叠加边界线。" : state.kmeansPhase === "stats" ? "从 label map 统计每个区域的面积、bbox 和中心点。" : "根据当前中心计算距离，再更新中心或输出区域。"}</p>
            </div>
            ${notesFlowChips(phaseFlows[state.kmeansPhase] || phaseFlows.stats)}
            ${notesClusterBars(stats, activeLegendLabel)}
            <dl class="seg-notes-focus-list">
                <div><dt>当前参数</dt><dd>K=${result.k} · feature=${feature} · iteration=${snapshot.iter}/${result.snapshots.length} · output=overlay mask</dd></div>
                <div><dt>当前统计</dt><dd>region count=${result.k} · largest=C${mainIndex + 1} ${ratioText} · cluster ratio=${ratios}</dd></div>
                <div><dt>中心移动</dt><dd>movement=${snapshot.movement.toFixed(2)} · mean distance=${snapshot.distance.toFixed(1)}</dd></div>
                ${selected ? `<div><dt>点击区域</dt><dd>C${selected.label + 1} · area=${selected.count}px · bbox=${selected.width}×${selected.height} · centroid=(${Math.round(selected.centroidX)},${Math.round(selected.centroidY)})</dd></div>` : ""}
            </dl>
            <div class="seg-basic-cluster-legend" aria-label="聚类颜色图例">${legend}</div>
        `;
    }

    function renderKMeansResult(snapshotIndex = -1, phaseOverride = "") {
        if (!state.result?.snapshots?.length) return;
        const result = state.result;
        const index = snapshotIndex < 0 ? result.snapshots.length - 1 : Math.min(snapshotIndex, result.snapshots.length - 1);
        const snapshot = result.snapshots[index];
        state.currentSnapshot = index;
        state.kmeansPhase = phaseOverride || (snapshotIndex < 0
            ? "stats"
            : index === 0
                ? "assign"
                : index >= result.snapshots.length - 1
                    ? "map"
                    : index % 2
                        ? "update"
                        : "assign");
        setPhase(state.kmeansPhase);
        syncKMeansFrameStrip(state.kmeansPhase);
        setKMeansState({
            currentStep: state.kmeansFrameIndex,
            currentIteration: index,
            kValue: result.k,
            iterationCount: result.snapshots.length,
        }, phaseOverride ? "step-render" : "snapshot-render");
        const stats = updateKMeansReadout(result, snapshot);
        drawLabelMap(result, snapshot, els.compareCanvas);
        drawKMeansOverlay(result, snapshot, els.resultCanvas, stats);
        return { result, snapshot, stats };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function ensureWorkData() {
        if (!state.work && state.image) drawImageToWorkCanvas(state.image);
        if (!state.work) throw new Error("image data not ready");
        return state.work;
    }

    function buildSampleGrid(cols, rows) {
        const work = ensureWorkData();
        const source = work.imageData.data;
        const cells = [];
        for (let gy = 0; gy < rows; gy += 1) {
            for (let gx = 0; gx < cols; gx += 1) {
                const x0 = Math.floor((gx / cols) * work.width);
                const y0 = Math.floor((gy / rows) * work.height);
                const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) / cols) * work.width));
                const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) / rows) * work.height));
                let r = 0;
                let g = 0;
                let b = 0;
                let count = 0;
                for (let y = y0; y < y1; y += 1) {
                    for (let x = x0; x < x1; x += 1) {
                        const p = (y * work.width + x) * 4;
                        r += source[p];
                        g += source[p + 1];
                        b += source[p + 2];
                        count += 1;
                    }
                }
                r /= Math.max(1, count);
                g /= Math.max(1, count);
                b /= Math.max(1, count);
                cells.push({
                    index: gy * cols + gx,
                    x: gx,
                    y: gy,
                    cx: (gx + 0.5) / cols,
                    cy: (gy + 0.5) / rows,
                    r,
                    g,
                    b,
                    gray: 0.299 * r + 0.587 * g + 0.114 * b,
                });
            }
        }
        return { cells, cols, rows };
    }

    function normalizedSeed(seed) {
        return {
            x: clamp(Number(seed.x) > 1 ? Number(seed.x) / 100 : Number(seed.x), 0, 1),
            y: clamp(Number(seed.y) > 1 ? Number(seed.y) / 100 : Number(seed.y), 0, 1),
            type: seed.type || "fg",
        };
    }

    function nearestCellIndex(cells, cols, rows, x, y) {
        const gx = clamp(Math.round(x * (cols - 1)), 0, cols - 1);
        const gy = clamp(Math.round(y * (rows - 1)), 0, rows - 1);
        return cells[gy * cols + gx].index;
    }

    function graphSeedsForSample() {
        const fallback = [
            { x: 0.22, y: 0.62, type: "fg" },
            { x: 0.52, y: 0.58, type: "fg" },
            { x: 0.78, y: 0.22, type: "bg" },
            { x: 0.18, y: 0.18, type: "bg" },
        ];
        const seeds = selectedSample()?.methods?.graphcut?.seeds || fallback;
        return seeds.map(normalizedSeed);
    }

    function colorMean(cells, indexes) {
        const list = indexes.length ? indexes : cells.map((cell) => cell.index);
        const sum = list.reduce((acc, index) => {
            const cell = cells[index];
            acc.r += cell.r;
            acc.g += cell.g;
            acc.b += cell.b;
            return acc;
        }, { r: 0, g: 0, b: 0 });
        return {
            r: sum.r / Math.max(1, list.length),
            g: sum.g / Math.max(1, list.length),
            b: sum.b / Math.max(1, list.length),
        };
    }

    function colorDistanceSq(a, b) {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return dr * dr + dg * dg + db * db;
    }

    function rgbText(color) {
        return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
    }

    function hexToRgb(hex) {
        const clean = String(hex || "#dbeafe").replace("#", "");
        const full = clean.length === 3 ? clean.split("").map((item) => item + item).join("") : clean;
        const value = Number.parseInt(full, 16);
        return {
            r: (value >> 16) & 255,
            g: (value >> 8) & 255,
            b: value & 255,
        };
    }

    function labelRgb(label) {
        if (label === -1) return hexToRgb("#ef4444");
        if (typeof label === "boolean") return hexToRgb(label ? "#22c55e" : "#60a5fa");
        return hexToRgb(labelFill(label));
    }

    function scoreRgb(score) {
        const value = clamp((score + 1) / 2, 0, 1);
        return {
            r: Math.round(96 + value * 153),
            g: Math.round(165 - value * 50),
            b: Math.round(250 - value * 214),
        };
    }

    function drawShowcaseCanvases(showcase, sourceCanvas, maskCanvas, options = {}) {
        if (!sourceCanvas || !maskCanvas || !showcase) return null;
        const work = ensureWorkData();
        const {
            model,
            labels = [],
            scores = null,
            seeds = [],
            activeCells = [],
            cutEdges = [],
            box = null,
            bboxes = [],
            title,
            caption,
            alpha = 0.66,
        } = showcase;
        if (!model) return null;
        const displayBox = showcase.interactive === "grabcut" && state.grabcut.draftBox
            ? state.grabcut.draftBox
            : box;
        const displaySeeds = showcase.interactive === "grabcut"
            ? [
                ...indexesToSeeds(uniqueIndexes(state.grabcut.fgSeeds, model), "fg"),
                ...indexesToSeeds(uniqueIndexes(state.grabcut.bgSeeds, model), "bg"),
            ]
            : seeds;
        [sourceCanvas, maskCanvas].forEach((canvas) => {
            canvas.width = work.width;
            canvas.height = work.height;
        });
        const sourceCtx = sourceCanvas.getContext("2d");
        sourceCtx.putImageData(work.imageData, 0, 0);
        if (showcase.interactive === "grabcut" && options.showInputMarks !== false) {
            drawConceptBox(sourceCtx, work.width, work.height, model.cols, model.rows, displayBox, sourceCanvas);
            drawConceptSeeds(sourceCtx, work.width, work.height, model.cols, model.rows, displaySeeds, sourceCanvas, { compact: true });
        }

        const maskCtx = maskCanvas.getContext("2d");
        const output = maskCtx.createImageData(work.width, work.height);
        const src = work.imageData.data;
        const dst = output.data;
        const cols = model.cols;
        const rows = model.rows;
        for (let y = 0; y < work.height; y += 1) {
            const gy = clamp(Math.floor((y / work.height) * rows), 0, rows - 1);
            for (let x = 0; x < work.width; x += 1) {
                const gx = clamp(Math.floor((x / work.width) * cols), 0, cols - 1);
                const cellIndex = gy * cols + gx;
                const label = labels[cellIndex];
                const color = scores ? scoreRgb(scores[cellIndex] || 0) : labelRgb(label ?? 0);
                const p = (y * work.width + x) * 4;
                const isBoundary = label === -1;
                const mix = isBoundary ? 0.92 : alpha;
                dst[p] = Math.round(src[p] * (1 - mix) + color.r * mix);
                dst[p + 1] = Math.round(src[p + 1] * (1 - mix) + color.g * mix);
                dst[p + 2] = Math.round(src[p + 2] * (1 - mix) + color.b * mix);
                dst[p + 3] = 255;
            }
        }
        maskCtx.putImageData(output, 0, 0);
        drawGridLines(maskCtx, work.width, work.height, cols, rows);
        drawConceptBox(maskCtx, work.width, work.height, cols, rows, displayBox, maskCanvas);
        drawConceptCutEdges(maskCtx, work.width, work.height, cols, rows, cutEdges, maskCanvas);
        drawConceptBboxes(maskCtx, work.width, work.height, cols, rows, bboxes, maskCanvas);
        drawConceptActiveCells(maskCtx, work.width, work.height, cols, rows, activeCells, maskCanvas);
        if (options.showMaskSeeds !== false && (!showcase.interactive || showcase.showSeedsOnMask)) {
            drawConceptSeeds(maskCtx, work.width, work.height, cols, rows, displaySeeds, maskCanvas, { compact: showcase.interactive === "grabcut" });
        }
        return { title, caption };
    }

    function drawConceptShowcase(showcase) {
        const meta = drawShowcaseCanvases(showcase, els.conceptSource, els.conceptMask);
        if (!meta) return;
        const { title, caption } = meta;
        els.conceptResultTitle.textContent = title || "分割结果 label map";
        els.conceptResultCaption.textContent = caption || "算法输出的区域标签会在这里显示。";
    }

    function renderKMeansCompareSlider(ratio = 0.5) {
        if (!els.compareSlider || !els.compareSliderLeft || !els.compareSliderRight) return;
        const rgbGrid = buildKMeansGridModel(false, 24, 17);
        const rgbResult = runKMeansOnGrid(rgbGrid);
        const rgbxyGrid = buildKMeansGridModel(true, 24, 17);
        const rgbxyResult = runKMeansOnGrid(rgbxyGrid);

        const rgbShowcase = {
            model: rgbGrid.model,
            labels: Array.from(rgbResult.labels).map((l) => l + 1),
            title: "RGB K-means 结果",
            caption: `K=${state.k}，在 ${rgbGrid.cols}×${rgbGrid.rows} 采样网格上完成 ${rgbResult.snapshots.length} 次迭代。`,
            alpha: 0.72,
        };
        const rgbxyShowcase = {
            model: rgbxyGrid.model,
            labels: Array.from(rgbxyResult.labels).map((l) => l + 1),
            title: "RGB + XY K-means 结果",
            caption: `K=${state.k}，在 ${rgbxyGrid.cols}×${rgbxyGrid.rows} 采样网格上完成 ${rgbxyResult.snapshots.length} 次迭代。`,
            alpha: 0.72,
        };

        drawShowcaseCanvases(rgbShowcase, els.compareSliderLeft, els.compareSliderLeft, { showInputMarks: false, showMaskSeeds: false });
        drawShowcaseCanvases(rgbxyShowcase, els.compareSliderRight, els.compareSliderRight, { showInputMarks: false, showMaskSeeds: false });
        updateCompareSliderPosition(ratio);
    }

    function updateCompareSliderPosition(ratio) {
        if (!els.compareSliderDivider || !els.compareSliderHandle) return;
        const percent = Math.max(2, Math.min(98, Math.round(ratio * 100)));
        els.compareSliderDivider.style.left = `${percent}%`;
        els.compareSliderHandle.style.left = `${percent}%`;
        els.compareSliderHandle.setAttribute("aria-valuenow", String(percent));
        els.compareSliderLeft.style.clipPath = `inset(0 calc(100% - ${percent}%) 0 0)`;
    }

    function setupCompareSlider() {
        if (!els.compareSlider || !els.compareSliderHandle) return;
        let dragging = false;
        const move = (clientX) => {
            const rect = els.compareSlider.getBoundingClientRect();
            const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
            updateCompareSliderPosition(ratio);
        };
        const onPointerMove = (event) => {
            if (!dragging) return;
            move(event.clientX);
            event.preventDefault();
        };
        const onPointerUp = () => {
            dragging = false;
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        };
        const onPointerDown = (event) => {
            dragging = true;
            move(event.clientX);
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
        };
        els.compareSlider.addEventListener("pointerdown", onPointerDown);
        els.compareSliderHandle.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            dragging = true;
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
        });
        els.compareSliderHandle.addEventListener("keydown", (event) => {
            const current = Number(els.compareSliderHandle.getAttribute("aria-valuenow") || 50);
            if (event.key === "ArrowLeft") {
                updateCompareSliderPosition((current - 5) / 100);
                event.preventDefault();
            } else if (event.key === "ArrowRight") {
                updateCompareSliderPosition((current + 5) / 100);
                event.preventDefault();
            }
        });
    }

    function currentKMeansSnapshot() {
        if (!state.result?.snapshots?.length) return null;
        return state.result.snapshots[Math.min(state.currentSnapshot, state.result.snapshots.length - 1)];
    }

    function selectKMeansRegion(label) {
        if (!state.result) return;
        state.selectedLabel = state.selectedLabel === label ? null : label;
        if (state.concept?.frames?.length && !state.playing) {
            renderKMeansStep(state.kmeansFrameIndex);
        } else {
            renderKMeansResult(state.currentSnapshot, state.kmeansPhase);
        }
    }

    function setupKMeansRegionInteraction() {
        els.regionList?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-segb-region-label]");
            if (!button) return;
            selectKMeansRegion(Number(button.dataset.segbRegionLabel));
        });
        els.resultCanvas?.addEventListener("click", (event) => {
            const snapshot = currentKMeansSnapshot();
            if (!state.result || !snapshot) return;
            const rect = els.resultCanvas.getBoundingClientRect();
            const x = clamp(Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * state.result.width), 0, state.result.width - 1);
            const y = clamp(Math.floor(((event.clientY - rect.top) / Math.max(1, rect.height)) * state.result.height), 0, state.result.height - 1);
            selectKMeansRegion(snapshot.labels[y * state.result.width + x]);
        });
    }

    function canvasObjectFitRect(canvas, width = canvas.width, height = canvas.height) {
        const displayWidth = canvas.clientWidth || width;
        const displayHeight = canvas.clientHeight || height;
        const intrinsicRatio = width / Math.max(1, height);
        const displayRatio = displayWidth / Math.max(1, displayHeight);
        let drawWidth = displayWidth;
        let drawHeight = displayHeight;
        let offsetX = 0;
        let offsetY = 0;
        if (displayRatio > intrinsicRatio) {
            drawHeight = displayHeight;
            drawWidth = drawHeight * intrinsicRatio;
            offsetX = (displayWidth - drawWidth) / 2;
        } else {
            drawWidth = displayWidth;
            drawHeight = drawWidth / intrinsicRatio;
            offsetY = (displayHeight - drawHeight) / 2;
        }
        return {
            offsetX,
            offsetY,
            scaleX: drawWidth / Math.max(1, width),
            scaleY: drawHeight / Math.max(1, height),
        };
    }

    function withCanvasDisplayTransform(ctx, width, height, canvas, draw) {
        draw(0, 0, 1, 1);
    }

    function drawGridLines(ctx, width, height, cols, rows) {
        if (cols > 32 || rows > 24) return;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.42)";
        ctx.lineWidth = 1;
        for (let x = 1; x < cols; x += 1) {
            const px = Math.round((x / cols) * width) + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, height);
            ctx.stroke();
        }
        for (let y = 1; y < rows; y += 1) {
            const py = Math.round((y / rows) * height) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(width, py);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawConceptActiveCells(ctx, width, height, cols, rows, indexes, canvas = null) {
        if (!indexes?.length) return;
        const cellW = width / cols;
        const cellH = height / rows;
        ctx.save();
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(249,115,22,0.6)";
        ctx.shadowBlur = 8;
        withCanvasDisplayTransform(ctx, width, height, canvas, () => {
            indexes.forEach((index) => {
                const x = (index % cols) * cellW + 2;
                const y = Math.floor(index / cols) * cellH + 2;
                ctx.strokeRect(x, y, Math.max(2, cellW - 4), Math.max(2, cellH - 4));
            });
        });
        ctx.restore();
    }

    function drawConceptSeeds(ctx, width, height, cols, rows, seeds, canvas = null, options = {}) {
        if (!seeds?.length) return;
        const cellW = width / cols;
        const cellH = height / rows;
        const compact = options.compact || cols > 32 || seeds.length > 18;
        ctx.save();
        withCanvasDisplayTransform(ctx, width, height, canvas, (offsetX, offsetY, scaleX) => {
            const seedRadius = (compact ? 2.2 : 8.5) / Math.max(0.001, scaleX);
            ctx.font = `bold ${9 / Math.max(0.001, scaleX)}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.globalAlpha = compact ? 0.72 : 1;
            seeds.forEach((seed) => {
                const x = ((seed.index % cols) + 0.5) * cellW;
                const y = (Math.floor(seed.index / cols) + 0.5) * cellH;
                const isFg = seed.type === "fg" || seed.label === 1 || seed.label === 2;
                ctx.fillStyle = isFg ? "#16a34a" : "#2563eb";
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = (compact ? 0.9 : 2) / Math.max(0.001, scaleX);
                ctx.beginPath();
                ctx.arc(x, y, seedRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                if (!compact) {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillText(seed.text || (seed.type === "bg" ? "B" : "F"), x, y + 0.5 / Math.max(0.001, scaleX));
                }
            });
        });
        ctx.restore();
    }

    function drawConceptBox(ctx, width, height, cols, rows, box, canvas = null) {
        if (!box) return;
        const cellW = width / cols;
        const cellH = height / rows;
        ctx.save();
        ctx.strokeStyle = "#2563eb";
        withCanvasDisplayTransform(ctx, width, height, canvas, (offsetX, offsetY, scaleX) => {
            ctx.lineWidth = 4 / Math.max(0.001, scaleX);
            ctx.setLineDash([10 / Math.max(0.001, scaleX), 7 / Math.max(0.001, scaleX)]);
            ctx.strokeRect(
                box.x0 * cellW + 2,
                box.y0 * cellH + 2,
                (box.x1 - box.x0 + 1) * cellW - 4,
                (box.y1 - box.y0 + 1) * cellH - 4,
            );
        });
        ctx.restore();
    }

    function drawConceptBboxes(ctx, width, height, cols, rows, bboxes, canvas = null) {
        if (!bboxes?.length) return;
        const cellW = width / cols;
        const cellH = height / rows;
        ctx.save();
        withCanvasDisplayTransform(ctx, width, height, canvas, (offsetX, offsetY, scaleX) => {
            ctx.lineWidth = 4 / Math.max(0.001, scaleX);
            ctx.setLineDash([8 / Math.max(0.001, scaleX), 6 / Math.max(0.001, scaleX)]);
            ctx.font = `bold ${12 / Math.max(0.001, scaleX)}px Arial`;
            bboxes.forEach((box) => {
                const color = box.color || "#f97316";
                const x = box.minX * cellW + 3;
                const y = box.minY * cellH + 3;
                const w = (box.maxX - box.minX + 1) * cellW - 6;
                const h = (box.maxY - box.minY + 1) * cellH - 6;
                ctx.strokeStyle = color;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = "rgba(255,255,255,0.88)";
                ctx.fillRect(x + 3, y + 3, 52 / Math.max(0.001, scaleX), 18 / Math.max(0.001, scaleX));
                ctx.fillStyle = color;
                ctx.fillText(box.name || `L${box.label}`, x + 8 / Math.max(0.001, scaleX), y + 16 / Math.max(0.001, scaleX));
            });
        });
        ctx.restore();
    }

    function drawConceptCutEdges(ctx, width, height, cols, rows, cutEdges, canvas = null) {
        if (!cutEdges?.length) return;
        if (cutEdges.length > 260) return;
        const cellW = width / cols;
        const cellH = height / rows;
        ctx.save();
        ctx.strokeStyle = "#ef4444";
        withCanvasDisplayTransform(ctx, width, height, canvas, (offsetX, offsetY, scaleX) => {
            ctx.lineWidth = 4 / Math.max(0.001, scaleX);
            ctx.setLineDash([8 / Math.max(0.001, scaleX), 6 / Math.max(0.001, scaleX)]);
            cutEdges.forEach((pair) => {
                const ax = pair.a % cols;
                const ay = Math.floor(pair.a / cols);
                const bx = pair.b % cols;
                const by = Math.floor(pair.b / cols);
                ctx.beginPath();
                if (ax !== bx) {
                    const x = Math.max(ax, bx) * cellW;
                    ctx.moveTo(x, ay * cellH + 2);
                    ctx.lineTo(x, (ay + 1) * cellH - 2);
                } else {
                    const y = Math.max(ay, by) * cellH;
                    ctx.moveTo(ax * cellW + 2, y);
                    ctx.lineTo((ax + 1) * cellW - 2, y);
                }
                ctx.stroke();
            });
        });
        ctx.restore();
    }

    function neighborIndexes(index, cols, rows) {
        const x = index % cols;
        const y = Math.floor(index / cols);
        const result = [];
        if (x > 0) result.push(index - 1);
        if (x < cols - 1) result.push(index + 1);
        if (y > 0) result.push(index - cols);
        if (y < rows - 1) result.push(index + cols);
        return result;
    }

    function addFlowEdge(adj, u, v, cap) {
        const forward = { u, v, cap, original: cap, rev: adj[v].length };
        const backward = { u: v, v: u, cap: 0, original: 0, rev: adj[u].length };
        adj[u].push(forward);
        adj[v].push(backward);
    }

    function runMaxFlow(nodeCount, source, sink, addEdges) {
        const adj = Array.from({ length: nodeCount }, () => []);
        addEdges(adj);
        let flow = 0;
        const paths = [];
        const maxRounds = 4000;
        const eps = 1e-6;
        for (let round = 0; round < maxRounds; round += 1) {
            const parentNode = new Int32Array(nodeCount).fill(-1);
            const parentEdge = new Int32Array(nodeCount).fill(-1);
            const queue = [source];
            parentNode[source] = source;
            for (let head = 0; head < queue.length && parentNode[sink] < 0; head += 1) {
                const node = queue[head];
                for (let edgeIndex = 0; edgeIndex < adj[node].length; edgeIndex += 1) {
                    const edge = adj[node][edgeIndex];
                    if (edge.cap <= eps || parentNode[edge.v] >= 0) continue;
                    parentNode[edge.v] = node;
                    parentEdge[edge.v] = edgeIndex;
                    queue.push(edge.v);
                    if (edge.v === sink) break;
                }
            }
            if (parentNode[sink] < 0) break;
            let bottle = Infinity;
            const path = [];
            for (let v = sink; v !== source; v = parentNode[v]) {
                const edge = adj[parentNode[v]][parentEdge[v]];
                bottle = Math.min(bottle, edge.cap);
                path.unshift(v);
            }
            path.unshift(source);
            for (let v = sink; v !== source; v = parentNode[v]) {
                const edge = adj[parentNode[v]][parentEdge[v]];
                edge.cap -= bottle;
                adj[edge.v][edge.rev].cap += bottle;
            }
            flow += bottle;
            if (paths.length < 8) paths.push({ nodes: path, bottleneck: bottle });
        }
        const reachable = new Uint8Array(nodeCount);
        const stack = [source];
        reachable[source] = 1;
        while (stack.length) {
            const node = stack.pop();
            adj[node].forEach((edge) => {
                if (edge.cap > eps && !reachable[edge.v]) {
                    reachable[edge.v] = 1;
                    stack.push(edge.v);
                }
            });
        }
        return { flow, paths, reachable, adj };
    }

    function solveGridCut(cells, cols, rows, options) {
        const nodeCount = cells.length + 2;
        const source = cells.length;
        const sink = cells.length + 1;
        const pairs = [];
        const sourceCaps = new Float32Array(cells.length);
        const sinkCaps = new Float32Array(cells.length);
        const result = runMaxFlow(nodeCount, source, sink, (adj) => {
            cells.forEach((cell, index) => {
                const caps = options.unary(cell, index);
                const sourceCap = Math.max(0.001, caps.sourceCap);
                const sinkCap = Math.max(0.001, caps.sinkCap);
                sourceCaps[index] = sourceCap;
                sinkCaps[index] = sinkCap;
                addFlowEdge(adj, source, index, sourceCap);
                addFlowEdge(adj, index, sink, sinkCap);
            });
            cells.forEach((cell, index) => {
                const x = index % cols;
                const y = Math.floor(index / cols);
                [[x + 1, y], [x, y + 1]].forEach(([nx, ny]) => {
                    if (nx >= cols || ny >= rows) return;
                    const nextIndex = ny * cols + nx;
                    const weight = Math.max(0.001, options.pairwise(cell, cells[nextIndex], index, nextIndex));
                    pairs.push({ a: index, b: nextIndex, weight });
                    addFlowEdge(adj, index, nextIndex, weight);
                    addFlowEdge(adj, nextIndex, index, weight);
                });
            });
        });
        const labels = cells.map((_, index) => Boolean(result.reachable[index]));
        const cutEdges = pairs.filter((pair) => labels[pair.a] !== labels[pair.b]);
        return {
            labels,
            cutEdges,
            pairs,
            sourceCaps,
            sinkCaps,
            paths: result.paths,
            maxFlow: result.flow,
        };
    }

    function labelFill(label) {
        const palette = {
            "-1": "#ef4444",
            0: "#e2e8f0",
            1: "#93c5fd",
            2: "#86efac",
            3: "#fdba74",
            4: "#c4b5fd",
            5: "#67e8f9",
        };
        if (typeof label === "boolean") return label ? "#bbf7d0" : "#dbeafe";
        return palette[label] || "#ddd6fe";
    }

    function scoreFill(score) {
        const value = clamp((score + 1) / 2, 0, 1);
        const hue = 214 - value * 170;
        return `hsl(${hue} 82% 78%)`;
    }

    function edgeLine(pair, cols, rows, padX, padY, cellW, cellH, className, width = 3) {
        const ax = pair.a % cols;
        const ay = Math.floor(pair.a / cols);
        const bx = pair.b % cols;
        const by = Math.floor(pair.b / cols);
        if (ax !== bx) {
            const x = padX + Math.max(ax, bx) * cellW;
            const y1 = padY + ay * cellH + 4;
            const y2 = padY + (ay + 1) * cellH - 4;
            return `<line class="${className}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="${width}"/>`;
        }
        const y = padY + Math.max(ay, by) * cellH;
        const x1 = padX + ax * cellW + 4;
        const x2 = padX + (ax + 1) * cellW - 4;
        return `<line class="${className}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="${width}"/>`;
    }

    function scoreGradientColor(val) {
        // 山脊橙红色渐变到平地灰蓝色
        const r = Math.round(59 + val * 190);
        const g = Math.round(130 - val * 70);
        const b = Math.round(246 - val * 210);
        return `rgb(${r},${g},${b})`;
    }

    function elevationColor(val) {
        // 低处：浅青绿山谷；高处：深褐橙岩石山峰，形成强烈高低对比
        const r = Math.round(224 - val * 170);
        const g = Math.round(242 - val * 150);
        const b = Math.round(254 - val * 130);
        return `rgb(${r},${g},${b})`;
    }

    function labelFill3D(label) {
        const colors = [
            "#3b82f6", // 蓝色
            "#10b981", // 绿色
            "#f59e0b", // 橙色
            "#8b5cf6", // 紫色
            "#ec4899", // 粉色
            "#64748b"  // 灰色
        ];
        return colors[(label - 1) % colors.length] || "#94a3b8";
    }

    function adjustLight(color, percent) {
        // 解析 rgb(...) 或者 #hex 或者 {r,g,b}
        let r, g, b;
        if (typeof color === "object" && color !== null) {
            r = color.r;
            g = color.g;
            b = color.b;
        } else if (color.startsWith("rgb")) {
            const matches = color.match(/\d+/g);
            r = parseInt(matches[0]);
            g = parseInt(matches[1]);
            b = parseInt(matches[2]);
        } else {
            const hex = color.replace("#", "");
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
        r = Math.max(0, Math.min(255, r + percent));
        g = Math.max(0, Math.min(255, g + percent));
        b = Math.max(0, Math.min(255, b + percent));
        return `rgb(${r},${g},${b})`;
    }

    function parseColorToRgb(color) {
        let r, g, b;
        if (color.startsWith("rgb")) {
            const matches = color.match(/\d+/g);
            r = parseInt(matches[0]);
            g = parseInt(matches[1]);
            b = parseInt(matches[2]);
        } else {
            const hex = color.replace("#", "");
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        }
        return { r, g, b };
    }

    function getCellBaseColor(index, cell, gradVal, label, isActive, isBoundary, options) {
        if (isBoundary) return "#ef4444"; // 红色山脊
        if (isActive) return "#10b981"; // 绿色水流

        if (label > 0) {
            return labelFill3D(label);
        }
        if (options.scores) {
            return scoreGradientColor(options.scores[index] ?? 0);
        }
        
        // 真实感色彩渲染
        const pxR = cell.r;
        const pxG = cell.g;
        const pxB = cell.b;

        const blendRatio = 0.52; // 像素色彩占比
        const r = Math.round(pxR * blendRatio + (224 - gradVal * 170) * (1 - blendRatio));
        const g = Math.round(pxG * blendRatio + (242 - gradVal * 150) * (1 - blendRatio));
        const b = Math.round(pxB * blendRatio + (254 - gradVal * 130) * (1 - blendRatio));
        return `rgb(${Math.max(0, Math.min(255, r))},${Math.max(0, Math.min(255, g))},${Math.max(0, Math.min(255, b))})`;
    }

    function buildBasementGridPath(cols, rows, padX, padY, cellHalfW, cellHalfH) {
        let draw = "";
        for (let i = 0; i <= cols; i++) {
            const x1 = padX + (i - 0) * cellHalfW;
            const y1 = padY + (i + 0) * cellHalfH;
            const x2 = padX + (i - rows) * cellHalfW;
            const y2 = padY + (i + rows) * cellHalfH;
            draw += `M ${x1} ${y1} L ${x2} ${y2} `;
        }
        for (let j = 0; j <= rows; j++) {
            const x1 = padX + (0 - j) * cellHalfW;
            const y1 = padY + (0 + j) * cellHalfH;
            const x2 = padX + (cols - j) * cellHalfW;
            const y2 = padY + (cols + j) * cellHalfH;
            draw += `M ${x1} ${y1} L ${x2} ${y2} `;
        }
        return draw;
    }

    function conceptGridSvg3D(model, options = {}) {
        const { cells, cols, rows } = model;
        const viewW = 520;
        const viewH = 318;
        const padX = 260; // 水平投影对称中心

        // cellHalfW 直接用视口宽度除以网格总跨度，让地形填满 SVG 视口
        const maxSpan = cols + rows;
        const margin = 32;
        const cellHalfW = (viewW - margin * 2) / maxSpan;
        const cellHalfH = cellHalfW * 0.46;

        // 根据垂直于平面的高度范围适配高程拉伸
        const gridSpan = Math.max(0, maxSpan - 2) * cellHalfH;
        const elevationScale = Math.min(170, Math.max(80, (viewH - 32 - gridSpan) / 2));
        const padY = elevationScale + 6;

        const gradientSource = options.scores || (state.result ? state.result.gradient : []);
        const activeSet = new Set(options.activeCells || []);
        const seedList = options.seeds || [];
        const seedCells = new Map(seedList.map((seed) => [seed.index, seed]));

        // 计算每个区域标签对应的当前水面高度（以当前已淹没单元格的最大梯度为水位线）
        const waterLevels = {};
        if (options.labels) {
            options.labels.forEach((label, idx) => {
                if (label > 0) {
                    const grad = gradientSource?.[idx] ?? 0;
                    if (waterLevels[label] === undefined || grad > waterLevels[label]) {
                        waterLevels[label] = grad;
                    }
                }
            });
        }

        // 查找邻接点的高程数据，进行无缝连接
        const getZ = (x, y) => {
            if (x < 0 || x >= cols || y < 0 || y >= rows) return 0;
            const idx = y * cols + x;
            const baseZ = (gradientSource?.[idx] ?? 0) * elevationScale;
            if (!options.labels) return baseZ;
            
            const label = options.labels[idx];
            if (label > 0) {
                // 水体表面保持水平（水位），高度对应当前波段水位
                return (waterLevels[label] ?? 0) * elevationScale;
            }
            if (label === -1) {
                // 堤坝处构建起红墙堤坝，高度加高 12 像素
                return baseZ + 12;
            }
            return baseZ;
        };

        // 画家算法深度排序 (x + y 从小到大从远到近绘制以实现正确遮挡)
        const cellItems = cells.map((cell, index) => ({ cell, index }))
            .sort((a, b) => (a.cell.x + a.cell.y) - (b.cell.x + b.cell.y));

        const columnsHtml = cellItems.map(({ cell, index }) => {
            const gradVal = gradientSource?.[index] ?? 0;
            const label = options.labels ? options.labels[index] : null;
            const isActive = activeSet.has(index);
            const isBoundary = label === -1;

            // 获取四个顶点以及邻接点的 Z 高程，实现共享顶点的平滑网格渲染 (消除积木的方格梯级感)
            const cx = padX + (cell.x - cell.y) * cellHalfW;
            const cy = padY + (cell.x + cell.y) * cellHalfH;

            // 计算该网格四个顶点的平滑高程 (双线性平滑插值/环绕点平均)
            const { x, y } = cell;
            const zTop = getZ(x, y);
            const zRight = getZ(x + 1, y);
            const zBottom = getZ(x + 1, y + 1);
            const zLeft = getZ(x, y + 1);

            // 四点投影坐标 (以连续曲面拼接取代纯立方积木)
            const ptTopX = cx;
            const ptTopY = cy - cellHalfH - zTop;

            const ptRightX = cx + cellHalfW;
            const ptRightY = cy - zRight;

            const ptBottomX = cx;
            const ptBottomY = cy + cellHalfH - zBottom;

            const ptLeftX = cx - cellHalfW;
            const ptLeftY = cy - zLeft;

            const topPoints = `${ptTopX.toFixed(1)},${ptTopY.toFixed(1)} ${ptRightX.toFixed(1)},${ptRightY.toFixed(1)} ${ptBottomX.toFixed(1)},${ptBottomY.toFixed(1)} ${ptLeftX.toFixed(1)},${ptLeftY.toFixed(1)}`;

            // 基平面的垂直投影基点 (Z=0)
            const baseCy = padY + (x + y) * cellHalfH;
            const baseBottomY = baseCy + cellHalfH;

            // 侧边折角阴影拉伸
            const leftFace = `${ptLeftX.toFixed(1)},${ptLeftY.toFixed(1)} ${ptLeftX.toFixed(1)},${baseCy.toFixed(1)} ${cx.toFixed(1)},${baseBottomY.toFixed(1)} ${cx.toFixed(1)},${ptBottomY.toFixed(1)}`;
            const rightFace = `${cx.toFixed(1)},${ptBottomY.toFixed(1)} ${cx.toFixed(1)},${baseBottomY.toFixed(1)} ${ptRightX.toFixed(1)},${baseCy.toFixed(1)} ${ptRightX.toFixed(1)},${ptRightY.toFixed(1)}`;

            const surfaceColor = getCellBaseColor(index, cell, gradVal, label, isActive, isBoundary, options);
            const sideLeftColor = adjustLight(surfaceColor, -24);
            const sideRightColor = adjustLight(surfaceColor, -42);

            let seedMarkerHtml = "";
            if (seedCells.has(index)) {
                const seed = seedCells.get(index);
                const isFg = seed.type === "fg" || seed.label === 1 || seed.label === 2;
                const text = seed.text || (seed.type === "bg" ? "B" : "F");
                const seedColor = isFg ? "#2563eb" : "#475569";
                const seedR = Math.min(8.5, cellHalfW * 0.95);
                const seedFont = Math.min(9, cellHalfW * 0.95);
                seedMarkerHtml = `
                    <g id="seg-seed-g-${index}" transform="translate(${cx.toFixed(1)}, ${(ptTopY + cellHalfH - seedR - 2).toFixed(1)})" class="seg-3d-seed">
                        <circle cx="0" cy="0" r="${seedR.toFixed(1)}" fill="${seedColor}" stroke="#fff" stroke-width="1.2" />
                        <text x="0" y="${(seedFont * 0.35).toFixed(1)}" font-size="${seedFont.toFixed(1)}" font-family="monospace" font-weight="900" text-anchor="middle" fill="#fff">${text}</text>
                    </g>
                `;
            }

            return `
                <g class="seg-3d-column">
                    <!-- 基海平面投影黑气泡 -->
                    <polygon points="${cx - cellHalfW},${baseCy} ${cx},${baseCy - cellHalfH} ${cx + cellHalfW},${baseCy} ${cx},${baseCy + cellHalfH}" fill="rgba(15, 23, 42, 0.03)" />
                    <!-- 3D 柱体左下侧面（偏暗防光阴影） -->
                    <polygon id="seg-poly-left-${index}" points="${leftFace}" fill="${sideLeftColor}" />
                    <!-- 3D 柱体右下侧面（深暗背光阴影） -->
                    <polygon id="seg-poly-right-${index}" points="${rightFace}" fill="${sideRightColor}" />
                    <!-- 顶端高低起伏的高程面 -->
                    <polygon id="seg-poly-top-${index}" points="${topPoints}" fill="${surfaceColor}" stroke="${surfaceColor}" stroke-width="0.45" stroke-linejoin="round" />
                    ${seedMarkerHtml}
                </g>
            `;
        }).join("");

        const caption = options.caption ? `<text id="seg-svg-caption" x="260" y="306" text-anchor="middle" class="seg-svg-note">${escapeHtml(options.caption)}</text>` : "";

        return `
            <svg class="seg-concept-svg seg-algo-grid is-3d-terrain" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="3D Watershed Terrain">
                <rect x="16" y="18" width="488" height="276" rx="22" fill="#f8fafc" stroke="#dbeafe"/>
                <!-- 绘制海平面定位投影虚线 -->
                <path d="${buildBasementGridPath(cols, rows, padX, padY, cellHalfW, cellHalfH)}" fill="none" stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="2 3" />
                ${columnsHtml}
                ${caption}
            </svg>
        `;
    }

    function easeOutQuad(x) {
        return 1 - (1 - x) * (1 - x);
    }

    function getCellState(model, options = {}) {
        const { cells, cols, rows } = model;
        const gradientSource = options.scores || (state.result ? state.result.gradient : []);
        const activeSet = new Set(options.activeCells || []);
        
        const waterLevels = {};
        if (options.labels) {
            options.labels.forEach((label, idx) => {
                if (label > 0) {
                    const grad = gradientSource?.[idx] ?? 0;
                    if (waterLevels[label] === undefined || grad > waterLevels[label]) {
                        waterLevels[label] = grad;
                    }
                }
            });
        }

        const getZ = (x, y) => {
            if (x < 0 || x >= cols || y < 0 || y >= rows) return 0;
            const idx = y * cols + x;
            const baseZ = (gradientSource?.[idx] ?? 0);
            if (!options.labels) return baseZ;
            
            const label = options.labels[idx];
            if (label > 0) {
                return waterLevels[label] ?? 0;
            }
            if (label === -1) {
                return baseZ + 0.12; 
            }
            return baseZ;
        };

        return cells.map((cell, index) => {
            const { x, y } = cell;
            const zTop = getZ(x, y);
            const zRight = getZ(x + 1, y);
            const zBottom = getZ(x + 1, y + 1);
            const zLeft = getZ(x, y + 1);

            const isBoundary = options.labels ? options.labels[index] === -1 : false;
            const isActive = activeSet.has(index);
            const label = options.labels ? options.labels[index] : null;
            const gradVal = gradientSource?.[index] ?? 0;

            const colorRGB = parseColorToRgb(getCellBaseColor(index, cell, gradVal, label, isActive, isBoundary, options));

            return {
                z: [zTop, zRight, zBottom, zLeft],
                color: colorRGB
            };
        });
    }

    let terrainAnimId = null;
    function animateWatershed3D(model, optionsA, optionsB) {
        if (terrainAnimId) {
            cancelAnimationFrame(terrainAnimId);
            terrainAnimId = null;
        }

        const stateA = getCellState(model, optionsA);
        const stateB = getCellState(model, optionsB);

        const { cols, rows } = model;
        const viewW = 520;
        const viewH = 318;
        const maxSpan = cols + rows;
        const margin = 32;
        const cellHalfW = (viewW - margin * 2) / maxSpan;
        const cellHalfH = cellHalfW * 0.46;
        const gridSpan = Math.max(0, maxSpan - 2) * cellHalfH;
        const elevationScale = Math.min(170, Math.max(80, (viewH - 32 - gridSpan) / 2));
        const padY = elevationScale + 6;
        const padX = 260;

        const duration = 280; 
        const startTime = performance.now();

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const t = easeOutQuad(progress);

            model.cells.forEach((cell, index) => {
                const sA = stateA[index];
                const sB = stateB[index];

                const zTop = sA.z[0] + t * (sB.z[0] - sA.z[0]);
                const zRight = sA.z[1] + t * (sB.z[1] - sA.z[1]);
                const zBottom = sA.z[2] + t * (sB.z[2] - sA.z[2]);
                const zLeft = sA.z[3] + t * (sB.z[3] - sA.z[3]);

                const r = Math.round(sA.color.r + t * (sB.color.r - sA.color.r));
                const g = Math.round(sA.color.g + t * (sB.color.g - sA.color.g));
                const b = Math.round(sA.color.b + t * (sB.color.b - sA.color.b));
                const colorRGB = { r, g, b };

                const cx = padX + (cell.x - cell.y) * cellHalfW;
                const cy = padY + (cell.x + cell.y) * cellHalfH;
                const baseCy = padY + (cell.x + cell.y) * cellHalfH;
                const baseBottomY = baseCy + cellHalfH;

                const ptTopX = cx;
                const ptTopY = cy - cellHalfH - zTop * elevationScale;

                const ptRightX = cx + cellHalfW;
                const ptRightY = cy - zRight * elevationScale;

                const ptBottomX = cx;
                const ptBottomY = cy + cellHalfH - zBottom * elevationScale;

                const ptLeftX = cx - cellHalfW;
                const ptLeftY = cy - zLeft * elevationScale;

                const topPoints = `${ptTopX.toFixed(1)},${ptTopY.toFixed(1)} ${ptRightX.toFixed(1)},${ptRightY.toFixed(1)} ${ptBottomX.toFixed(1)},${ptBottomY.toFixed(1)} ${ptLeftX.toFixed(1)},${ptLeftY.toFixed(1)}`;
                const leftFace = `${ptLeftX.toFixed(1)},${ptLeftY.toFixed(1)} ${ptLeftX.toFixed(1)},${baseCy.toFixed(1)} ${cx.toFixed(1)},${baseBottomY.toFixed(1)} ${cx.toFixed(1)},${ptBottomY.toFixed(1)}`;
                const rightFace = `${cx.toFixed(1)},${ptBottomY.toFixed(1)} ${cx.toFixed(1)},${baseBottomY.toFixed(1)} ${ptRightX.toFixed(1)},${baseCy.toFixed(1)} ${ptRightX.toFixed(1)},${ptRightY.toFixed(1)}`;

                const surfaceColorStr = `rgb(${r},${g},${b})`;
                const sideLeftColor = adjustLight(colorRGB, -24);
                const sideRightColor = adjustLight(colorRGB, -42);

                const polyLeft = document.getElementById(`seg-poly-left-${index}`);
                const polyRight = document.getElementById(`seg-poly-right-${index}`);
                const polyTop = document.getElementById(`seg-poly-top-${index}`);

                if (polyLeft) {
                    polyLeft.setAttribute("points", leftFace);
                    polyLeft.setAttribute("fill", sideLeftColor);
                }
                if (polyRight) {
                    polyRight.setAttribute("points", rightFace);
                    polyRight.setAttribute("fill", sideRightColor);
                }
                if (polyTop) {
                    polyTop.setAttribute("points", topPoints);
                    polyTop.setAttribute("fill", surfaceColorStr);
                    polyTop.setAttribute("stroke", surfaceColorStr);
                }

                const seedGroup = document.getElementById(`seg-seed-g-${index}`);
                if (seedGroup) {
                    const seedR = Math.min(8.5, cellHalfW * 0.95);
                    const translateY = (ptTopY + cellHalfH - seedR - 2).toFixed(1);
                    seedGroup.setAttribute("transform", `translate(${cx.toFixed(1)}, ${translateY})`);
                }
            });

            const captionEl = document.getElementById("seg-svg-caption");
            if (captionEl && optionsB.caption) {
                captionEl.textContent = optionsB.caption;
            }

            if (progress < 1) {
                terrainAnimId = requestAnimationFrame(tick);
            } else {
                terrainAnimId = null;
            }
        }

        terrainAnimId = requestAnimationFrame(tick);
    }

    let showcaseAnimId = null;
    function animateShowcaseTransition(showcaseB) {
        if (showcaseAnimId) {
            cancelAnimationFrame(showcaseAnimId);
            showcaseAnimId = null;
        }

        const maskCanvas = els.conceptMask;
        if (!maskCanvas) return;

        if (!state.offscreenA) state.offscreenA = document.createElement("canvas");
        if (!state.offscreenB) state.offscreenB = document.createElement("canvas");

        state.offscreenA.width = maskCanvas.width;
        state.offscreenA.height = maskCanvas.height;
        state.offscreenB.width = maskCanvas.width;
        state.offscreenB.height = maskCanvas.height;

        const ctxA = state.offscreenA.getContext("2d");
        const ctxB = state.offscreenB.getContext("2d");

        ctxA.drawImage(maskCanvas, 0, 0);

        const meta = drawShowcaseCanvases(showcaseB, els.conceptSource, state.offscreenB);
        if (!meta) return;

        els.conceptResultTitle.textContent = meta.title || "分割结果 label map";
        els.conceptResultCaption.textContent = meta.caption || "";

        const isSameMethod = state.lastShowcaseMethod === state.method;
        state.lastShowcaseMethod = state.method;

        if (!isSameMethod) {
            drawShowcaseCanvases(showcaseB, els.conceptSource, maskCanvas);
            return;
        }

        const duration = 280; 
        const startTime = performance.now();
        const mainCtx = maskCanvas.getContext("2d");

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const t = easeOutQuad(progress);

            mainCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            
            mainCtx.globalAlpha = 1 - t;
            mainCtx.drawImage(state.offscreenA, 0, 0);

            mainCtx.globalAlpha = t;
            mainCtx.drawImage(state.offscreenB, 0, 0);

            mainCtx.globalAlpha = 1.0; 

            if (progress < 1) {
                showcaseAnimId = requestAnimationFrame(tick);
            } else {
                showcaseAnimId = null;
            }
        }
        showcaseAnimId = requestAnimationFrame(tick);
    }

    function conceptGridSvg(model, options = {}) {
        // 如果是 Region/Watershed 分水岭相关环节，改用精致的三维拟物地势渲染！
        const isWatershed = state.method === "watershed" || window.location.pathname.endsWith("/region");
        if (isWatershed) {
            return conceptGridSvg3D(model, options);
        }

        const { cells, cols, rows } = model;
        const viewW = 520;
        const viewH = 318;
        const padX = 32;
        const padY = 34;
        const cellW = (viewW - padX * 2) / cols;
        const cellH = (viewH - padY * 2) / rows;
        const activeSet = new Set(options.activeCells || []);
        const seedList = options.seeds || [];
        const seedCells = new Map(seedList.map((seed) => [seed.index, seed]));
        const edgeWeights = options.pairs || [];
        const edgeMax = Math.max(0.01, ...edgeWeights.map((pair) => pair.weight || 0));
        const visibleEdges = options.showEdges
            ? edgeWeights.filter((pair) => pair.weight > edgeMax * 0.36)
            : [];
        const cellsHtml = cells.map((cell, index) => {
            const x = padX + cell.x * cellW + 2;
            const y = padY + cell.y * cellH + 2;
            const label = options.labels ? options.labels[index] : null;
            const fill = options.scores ? scoreFill(options.scores[index]) : options.labels ? labelFill(label) : `rgb(${Math.round(cell.r)},${Math.round(cell.g)},${Math.round(cell.b)})`;
            const classes = [
                "seg-grid-cell",
                activeSet.has(index) ? "is-active" : "",
                label === -1 ? "is-boundary" : "",
            ].filter(Boolean).join(" ");
            const delay = ((cell.x + cell.y) * 28) % 360;
            return `<rect class="${classes}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(5, cellW - 4).toFixed(1)}" height="${Math.max(5, cellH - 4).toFixed(1)}" rx="6" fill="${fill}" style="animation-delay:${delay}ms"/>`;
        }).join("");
        const edgeHtml = visibleEdges.map((pair) => edgeLine(pair, cols, rows, padX, padY, cellW, cellH, "seg-grid-edge", 1 + (pair.weight / edgeMax) * 4)).join("");
        const cutHtml = (options.cutEdges || []).map((pair) => edgeLine(pair, cols, rows, padX, padY, cellW, cellH, "seg-grid-cut", 4)).join("");
        const seedHtml = seedList.map((seed) => {
            const cell = cells[seed.index];
            if (!cell) return "";
            const cx = padX + (cell.x + 0.5) * cellW;
            const cy = padY + (cell.y + 0.5) * cellH;
            const isFg = seed.type === "fg" || seed.label === 1 || seed.label === 2;
            const text = seed.text || (seed.type === "bg" ? "B" : "F");
            return `<g class="seg-grid-seed ${isFg ? "is-fg" : "is-bg"}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12"/><text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle">${text}</text></g>`;
        }).join("");
        const boxHtml = options.box ? (() => {
            const box = options.box;
            const x = padX + box.x0 * cellW + 2;
            const y = padY + box.y0 * cellH + 2;
            const w = (box.x1 - box.x0 + 1) * cellW - 4;
            const h = (box.y1 - box.y0 + 1) * cellH - 4;
            return `<rect class="seg-grid-box" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="12"/>`;
        })() : "";
        const bboxHtml = (options.bboxes || []).map((box) => {
            const x = padX + box.minX * cellW + 3;
            const y = padY + box.minY * cellH + 3;
            const w = (box.maxX - box.minX + 1) * cellW - 6;
            const h = (box.maxY - box.minY + 1) * cellH - 6;
            return `<rect class="seg-grid-bbox" style="--bbox:${box.color || "#2563eb"}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="9"/><text class="seg-grid-bbox-label" x="${(x + 8).toFixed(1)}" y="${(y + 16).toFixed(1)}">${escapeHtml(box.name || `L${box.label}`)}</text>`;
        }).join("");
        const caption = options.caption ? `<text x="260" y="304" text-anchor="middle" class="seg-svg-note">${escapeHtml(options.caption)}</text>` : "";
        return `
            <svg class="seg-concept-svg seg-algo-grid" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="${escapeHtml(options.aria || "algorithm grid")}">
                <rect x="16" y="18" width="488" height="276" rx="22" fill="#f8fafc" stroke="#dbeafe"/>
                ${edgeHtml}
                ${cellsHtml}
                ${boxHtml}
                ${cutHtml}
                ${bboxHtml}
                ${seedHtml}
                ${caption}
            </svg>
        `;
    }

    function conceptCard(title, body, text = "") {
        return `
            <section class="seg-concept-card seg-algo-card">
                <h4>${escapeHtml(title)}</h4>
                ${body}
                ${text ? `<p>${escapeHtml(text)}</p>` : ""}
            </section>
        `;
    }

    function metricCards(metrics) {
        const icons = {
            "max-flow": "flow",
            "cut edges": "cut",
            foreground: "target",
            seeds: "seed",
            iterations: "loop",
            "mask ratio": "percent",
            bbox: "box",
            image: "image",
            grid: "grid",
            k: "hash",
            "fg color": "drop",
            "bg color": "drop",
            "unary range": "ruler",
            meaning: "help",
            "augment paths": "route",
            "first bottle": "flag",
            "edge model": "link",
            next: "arrow",
            "fg model": "target",
            "bg model": "target",
            boundary: "border",
            sample: "doc",
            source: "photo",
            "seed rule": "rule",
            nodes: "nodes",
            "edge model": "link",
            degree: "signal",
            goal: "target",
            "cut(a,b)": "cut",
            "assoc(a,v)": "group",
            "assoc(b,v)": "group",
            ncut: "chart",
            box: "box",
            "fg seeds": "target",
            "bg seeds": "target",
            "fg markers": "target",
            "bg markers": "target",
            unknown: "question",
            processed: "check",
            frontier: "location",
            "boundary rule": "border",
            queue: "layers",
            regions: "grid",
            largest: "star",
            "grid cells": "grid",
            "final movement": "move",
            "mean distance": "ruler",
            "stop rule": "stop",
        };
        return `
            <div class="seg-analysis-metrics">
                ${metrics.map((metric) => {
                    const key = String(metric[0]).toLowerCase();
                    const icon = icons[key] || "metric";
                    return `<div class="is-${icon}"><span>${escapeHtml(metric[0])}</span><strong>${escapeHtml(metric[1])}</strong></div>`;
                }).join("")}
            </div>
        `;
    }

    function noteRows(rows) {
        return `<dl>${rows.map((row) => `<div><dt>${escapeHtml(row[0])}</dt><dd>${escapeHtml(row[1])}</dd></div>`).join("")}</dl>`;
    }

    function graphCutOutputExplainHtml({ fgRatio, bgRatio, cutEdges, maxFlow }) {
        return `
            <div class="seg-graph-output-explain" aria-label="Graph Cut 输出解释">
                <div class="seg-graph-ratio-bar" aria-hidden="true">
                    <span class="is-fg" style="--w:${fgRatio}%"></span>
                    <span class="is-bg" style="--w:${bgRatio}%"></span>
                </div>
                <div class="seg-graph-output-grid">
                    <div>
                        <span>foreground</span>
                        <strong>${fgRatio}%</strong>
                    </div>
                    <div>
                        <span>cut edges</span>
                        <strong>${cutEdges}</strong>
                    </div>
                    <div>
                        <span>max-flow</span>
                        <strong>${escapeHtml(maxFlow)}</strong>
                    </div>
                </div>
                <div class="seg-graph-energy-flow" aria-hidden="true">
                    <i>Unary</i>
                    <b></b>
                    <i>Pairwise</i>
                    <b></b>
                    <i>Min Cut</i>
                </div>
                <p>label map 不是说明文字本身，而是每个节点的 FG/BG 标签；红色割边就是能量最小的位置。</p>
            </div>
        `;
    }

    function renderLatexFormula(latex) {
        if (!latex) return "";
        try {
            return katex.renderToString(latex, {
                throwOnError: false,
                displayMode: false
            });
        } catch (e) {
            return `<span class="seg-latex-inline">${escapeHtml(String(latex))}</span>`;
        }
    }

    function phaseName(phase) {
        return {
            image: "输入建模",
            feature: "特征/代价",
            assign: "传播/分配",
            update: "优化更新",
            map: "标签输出",
            stats: "统计解释",
        }[phase] || "计算步骤";
    }

    function teachingMeta(concept, frame) {
        const method = concept?.activeMethod || "";
        const phase = frame?.phase || "image";
        const fallback = {
            latex: concept?.formula || "y=f(x)",
            flow: ["input", "feature", "score", "label"],
            principle: frame?.stageNote || concept?.formulaNote || "当前步骤把输入转换为下一阶段所需的中间量。",
            facts: [
                ["step", `${state.conceptFrameIndex + 1}/${concept?.frames?.length || 1}`],
                ["phase", phaseName(phase)],
                ["output", concept?.stripOutput || "label map"],
            ],
        };
        const table = {
            "Graph Cut": {
                image: {
                    latex: "\\mathcal{G}=(V,E),\\; V=\\{p_i\\}\\cup\\{s,t\\}",
                    flow: ["image pixels", "nodes p_i", "Source/Sink", "seed constraints"],
                    principle: "把像素采样点变成图节点，前景种子连接 Source，背景种子连接 Sink。",
                },
                feature: {
                    latex: "D_i(l)=-\\log P(I_i\\mid l),\\; l\\in\\{FG,BG\\}",
                    flow: ["RGB sample", "FG/BG mean", "unary cost", "terminal edges"],
                    principle: "颜色越接近某一类模型，切断该类端点边的代价越高，节点越倾向保留这个标签。",
                },
                assign: {
                    latex: "V_{ij}=\\lambda\\exp\\left(-\\frac{\\lVert I_i-I_j\\rVert^2}{2\\sigma^2}\\right)",
                    flow: ["neighbor pixels", "color contrast", "pairwise edge", "smoothness"],
                    principle: "相邻像素颜色越像，边权越大，算法越不愿把它们切到两侧。",
                },
                update: {
                    latex: "L^*=\\arg\\min_L\\sum_iD_i(L_i)+\\sum_{(i,j)}V_{ij}[L_i\\ne L_j]",
                    flow: ["residual graph", "augment flow", "min cut", "FG/BG split"],
                    principle: "最大流结束后，最小割给出总代价最小的前景/背景边界。",
                },
                stats: {
                    latex: "FG=\\{i\\mid i\\in S\\; after\\; mincut\\},\\; ratio=|FG|/|V|",
                    flow: ["binary labels", "cut edges", "area ratio", "region stats"],
                    principle: "最终 label map 可以直接统计前景比例、割边数量和边界位置。",
                },
            },
            "Normalized Cut": {
                image: {
                    latex: "W_{ij}=\\exp(-\\lVert c_i-c_j\\rVert^2/\\sigma_c^2)\\exp(-\\lVert x_i-x_j\\rVert^2/\\sigma_x^2)",
                    flow: ["image samples", "color + xy", "similarity W", "weighted graph"],
                    principle: "Ncut 先构造全局相似度图，而不是设置 Source/Sink。",
                },
                feature: {
                    latex: "D_{ii}=\\sum_j W_{ij},\\quad S=D^{-1/2}WD^{-1/2}",
                    flow: ["W matrix", "degree D", "normalized S", "spectral space"],
                    principle: "度矩阵记录每个节点与全图的连接强度，归一化能减少孤立小块偏置。",
                },
                assign: {
                    latex: "S y=\\lambda y,\\quad y\\perp \\sqrt{d}",
                    flow: ["power iteration", "eigenvector y", "sign pattern", "soft partition"],
                    principle: "第二特征向量把节点投到一维，符号和大小预示最终分区。",
                },
                update: {
                    latex: "A=\\{i\\mid y_i\\ge median(y)\\},\\; B=V\\setminus A",
                    flow: ["stable y", "threshold", "A/B labels", "balanced cut"],
                    principle: "按特征向量阈值二分，使切割代价和区域内部连接强度同时受控。",
                },
                stats: {
                    latex: "Ncut(A,B)=\\frac{cut(A,B)}{assoc(A,V)}+\\frac{cut(A,B)}{assoc(B,V)}",
                    flow: ["partition", "cut", "assoc", "Ncut score"],
                    principle: "Ncut 分数越小，说明两侧内部更紧密、边界代价更合理。",
                },
            },
            GrabCut: {
                image: {
                    latex: "T_i\\in\\{B,F,?\\},\\quad outside(rect)\\Rightarrow B",
                    flow: ["user box", "trimap T", "probable FG", "hard BG"],
                    principle: "矩形框外是确定背景，框内是可能前景；画笔会加入更强的交互约束。",
                },
                feature: {
                    latex: "\\theta=\\{\\pi_k,\\mu_k,\\Sigma_k\\}_{k=1}^K,\\quad D_i=-\\log\\sum_k\\pi_k\\,\\mathcal{N}(I_i\\mid\\mu_k,\\Sigma_k)",
                    flow: ["current mask", "FG/BG GMM (K=5)", "unary term", "terminal weights"],
                    principle: "FG/BG 各用 5 个高斯分量建模（k-means 初始化 + EM），负对数似然作为 unary 代价。",
                },
                update: {
                    latex: "L^{t+1}=\\min_{L}\\left[\\sum_i D_i(L_i\\mid\\theta^t)+\\gamma\\sum_{ij}e^{-\\beta\\|I_i-I_j\\|^2}[L_i\\neq L_j]\\right]",
                    flow: ["GMM unary cost", "max-flow/min-cut", "new mask", "next iteration"],
                    principle: "GMM 负对数似然为 unary 代价，颜色相似度为 pairwise 代价，min-cut 全局优化标签。",
                },
                map: {
                    latex: "\\alpha_i=1[L_i=FG]",
                    flow: ["binary label", "alpha mask", "bbox", "foreground"],
                    principle: "最终输出是二值前景 mask，可继续做裁剪、透明背景或区域统计。",
                },
                stats: {
                    latex: "bbox=(\\min x,\\min y,\\max x,\\max y),\\quad area=\\sum_i\\alpha_i",
                    flow: ["mask", "area", "bbox", "ratio"],
                    principle: "mask 的面积、外接框和占比直接来自前景像素计数。",
                },
            },
            Watershed: {
                image: {
                    latex: "g(x)=\\lVert \\nabla I(x)\\rVert",
                    flow: ["image", "gradient g(x)", "terrain height", "basins"],
                    principle: "分水岭把梯度图看成地形，高梯度像山脊，低梯度像盆地。",
                },
                feature: {
                    latex: "M(x)\\in\\{1,2,\\ldots,K\\}",
                    flow: ["markers", "priority queue", "unknown pixels", "seed basins"],
                    principle: "marker 是确定起点，未知像素等待相邻标签按梯度优先扩张。",
                },
                assign: {
                    latex: "x^*=\\arg\\min_{x\\in Q} g(x)",
                    flow: ["queue Q", "lowest gradient", "frontier", "label claim"],
                    principle: "每次优先处理低梯度位置，所以区域会沿颜色平滑处扩张。",
                },
                map: {
                    latex: "L(x)=-1\\quad if\\quad |N_L(x)|>1",
                    flow: ["neighbor labels", "conflict", "watershed line", "label map"],
                    principle: "不同标签相遇时不强行归类，而是留下分水岭边界。",
                },
                stats: {
                    latex: "region_k=\\{x\\mid L(x)=k\\}",
                    flow: ["label map", "regions", "boundary", "statistics"],
                    principle: "最终 label map 把边界和区域 id 都保存下来，供后续属性分析使用。",
                },
            },
            "区域属性": {
                image: {
                    latex: "L(x)\\in\\mathbb{N},\\quad x=(u,v)",
                    flow: ["label map", "integer id", "mask per label", "region input"],
                    principle: "区域属性分析的输入不是彩色图片，而是每个像素的整数 label。",
                },
                feature: {
                    latex: "C_k=\\{x\\mid L(x)=k,\\; x\\ connected\\}",
                    flow: ["scan pixels", "same label", "connected component", "compact id"],
                    principle: "同 label 且空间相邻的像素被合成一个连通区域，离散块会分开编号。",
                },
                assign: {
                    latex: "area_k=|C_k|,\\quad ratio_k=area_k/|\\Omega|",
                    flow: ["component C_k", "pixel count", "area", "mask ratio"],
                    principle: "面积就是该区域覆盖的像素数，占比用于过滤过小区域或比较目标规模。",
                },
                update: {
                    latex: "bbox_k=(\\min u,\\min v,\\max u,\\max v)",
                    flow: ["coordinates", "min/max", "bbox", "contour edges"],
                    principle: "bbox 来自坐标极值，轮廓来自与其他 label 或图像边界相邻的边。",
                },
                stats: {
                    latex: "table_k=(area,bbox,perimeter,ratio)",
                    flow: ["label map", "measure", "region table", "filter/sort"],
                    principle: "最终区域表可以直接用于筛选、排序、目标质量评价或后续识别。",
                },
            },
            "K-means RGB": {
                image: {
                    latex: "I(x)\\in\\mathbb{R}^3",
                    flow: ["image", "sample grid", "RGB cell", "input"],
                    principle: "先把图像采样成规则网格，每个格子用平均 RGB 颜色代表。",
                },
                feature: {
                    latex: "f(x)=[R,G,B]",
                    flow: ["cell color", "RGB vector", "feature space", "distance"],
                    principle: "RGB 模式只使用颜色向量，颜色相近的像素在特征空间中距离更近。",
                },
                assign: {
                    latex: "L(x)=\\arg\\min_k \\lVert f(x)-c_k\\rVert^2",
                    flow: ["feature", "centers", "nearest", "label"],
                    principle: "每个格子计算到所有中心的欧氏距离，被分配给距离最近的中心。",
                },
                update: {
                    latex: "c_k=\\frac{1}{|C_k|}\\sum_{x\\in C_k}f(x)",
                    flow: ["cluster C_k", "mean feature", "new center", "next assign"],
                    principle: "中心更新为当前类所有格子的平均特征，然后重复分配。",
                },
                map: {
                    latex: "L(x)\\in\\{1,\\ldots,K\\}",
                    flow: ["converged labels", "label map", "segmentation", "output"],
                    principle: "迭代收敛后，每个格子拥有稳定的 cluster 标签，组成最终 label map。",
                },
                stats: {
                    latex: "count_k=|\\{x\\mid L(x)=k\\}|,\\; ratio_k=count_k/|\\Omega|",
                    flow: ["label map", "count", "ratio", "region stats"],
                    principle: "统计每个聚类的像素数和占比，得到可解释的分割结果。",
                },
            },
            "K-means RGB + XY": {
                image: {
                    latex: "I(x)\\in\\mathbb{R}^3,\\; x=(u,v)",
                    flow: ["image", "sample grid", "color + position", "input"],
                    principle: "同样先采样成规则网格，但后续会同时考虑颜色和空间位置。",
                },
                feature: {
                    latex: "f(x)=[R,G,B,\\lambda u,\\lambda v]",
                    flow: ["cell color", "normalized xy", "RGB+XY vector", "distance"],
                    principle: "XY 项让空间上相距较远的同色像素更难被合并，增强区域连续性。",
                },
                assign: {
                    latex: "L(x)=\\arg\\min_k \\lVert f(x)-c_k\\rVert^2",
                    flow: ["feature", "centers", "nearest", "label"],
                    principle: "同时考虑颜色与归一化坐标，最近中心决定每个格子的标签。",
                },
                update: {
                    latex: "c_k=\\frac{1}{|C_k|}\\sum_{x\\in C_k}f(x)",
                    flow: ["cluster C_k", "mean feature", "new center", "next assign"],
                    principle: "中心在颜色-位置联合空间中移动到平均位置，兼顾颜色与空间分布。",
                },
                map: {
                    latex: "L(x)\\in\\{1,\\ldots,K\\}",
                    flow: ["converged labels", "label map", "spatial smoothness", "output"],
                    principle: "最终标签图在空间上更连续，零散同色块更容易被分开。",
                },
                stats: {
                    latex: "count_k=|\\{x\\mid L(x)=k\\}|,\\; ratio_k=count_k/|\\Omega|",
                    flow: ["label map", "count", "ratio", "region stats"],
                    principle: "与 RGB 模式相同，但区域通常更平滑、更连续。",
                },
            },
        };
        const methodMeta = table[method] || {};
        const phaseMeta = methodMeta[phase] || methodMeta.map || methodMeta.stats || fallback;
        return {
            ...fallback,
            ...phaseMeta,
            facts: [
                ["step", `${state.conceptFrameIndex + 1}/${concept?.frames?.length || 1}`],
                ["phase", phaseName(phase)],
                ["nodes", concept?.stripK || "--"],
                ["output", concept?.stripOutput || "--"],
            ],
        };
    }

    function renderProcessNotes(concept, frame) {
        const meta = teachingMeta(concept, frame);
        const flow = meta.flow || [];
        const compactNotes = (concept?.notes || []).slice(0, 4);

        // 步骤说明：直接技术描述，不使用比喻
        const stepNotes = {
            "K-means RGB": {
                image: "将图像像素按位置划分为规则网格，每个网格用平均 RGB 颜色作为初始特征向量。",
                feature: "每个像素的特征即 RGB 三维向量。颜色越接近的像素在特征空间中距离越近。",
                assign: "在特征空间中计算每个像素到 K 个聚类中心的距离，把像素划归到距离最近的中心。",
                update: "根据当前划分重新计算每个簇的均值向量，并将其作为新的聚类中心。",
                map: "重复分配与更新直到收敛，相同簇的像素构成一个连通或半连通的视觉区域。",
                stats: "统计每个簇的像素数量、面积占比、中心坐标和最小外接矩形，将视觉块转为可量化数据。"
            },
            "K-means RGB + XY": {
                image: "将像素整理为局部网格，每个像素的特征同时包含 RGB 颜色与归一化空间坐标 XY。",
                feature: "特征向量扩展为五维：[R, G, B, x, y]。空间距离较远但颜色相似的像素会被拉开。",
                assign: "综合考虑颜色差异和空间距离，将每个像素划分到综合距离最小的簇中心。",
                update: "重新计算各簇在 RGB+XY 联合空间中的均值中心，兼顾颜色均值与几何中心。",
                map: "由于空间坐标参与度量，聚类结果倾向于形成连片、连续的区域，减少孤立散点。",
                stats: "输出带空间平滑约束的分割标签，并统计每个簇的面积、外接框和中心坐标。"
            },
            "Graph Cut": {
                image: "构建图模型：每个像素是节点，额外引入源点 Source 表示前景、汇点 Sink 表示背景。",
                feature: "根据像素颜色与已知前景/背景模型的匹配程度，分别连接到 Source 和 Sink，容量反映归属概率。",
                assign: "相邻像素之间建立无向边，边容量由颜色相似度决定；颜色越相似，割断代价越大。",
                update: "计算 Source 到 Sink 的最大流，最小割将图分为两部分：割集对应前背景分界线。",
                stats: "最小割一侧为前景，另一侧为背景；切断的边即为最终分割轮廓。"
            },
            "Normalized Cut": {
                image: "构建无向加权图：所有像素为节点，按颜色与空间邻近度建立连接，不预设前景/背景。",
                feature: "边的权重同时衡量像素相似度和空间邻近度，形成关联矩阵与度矩阵。",
                assign: "求解广义特征值问题得到第二小特征向量（Fiedler 向量），作为像素的二分倾向值。",
                update: "以 Fiedler 向量的中位数为阈值将像素划分为两部分，使割代价低且两部分规模均衡。",
                stats: "输出两类标签，得到结构一致、规模均衡的二值分割结果。"
            },
            "GrabCut": {
                image: "用矩形框标注前景的大致位置。框外像素标记为确定背景，框内像素标记为可能前景。",
                feature: "用 5 个高斯分量分别拟合前景和背景的颜色分布（GMM），k-means 初始化后经 EM 迭代优化。",
                update: "以 GMM 负对数似然作为 unary 代价、颜色相似度作为 pairwise 代价，通过 max-flow/min-cut 全局优化二值标签；再用新 mask 修正 GMM，交替迭代。",
                map: "输出二值前景 mask，可直接用于透明背景、目标裁剪或区域统计。",
                stats: "基于最终 mask 计算前景面积、外接框和占比。"
            },
            "Watershed": {
                image: "计算图像梯度幅值，边界处梯度大、区域内部梯度小，将梯度图作为分水岭的“地形高度”。",
                feature: "由用户或算法给出前景/背景种子点（marker），作为不同区域的扩张起点。",
                assign: "从种子点开始，按梯度由低到高的顺序通过优先队列向外扩张，逐步占领相邻像素。",
                map: "当两个不同标签的扩张前沿相遇时，相遇点被标记为分水岭边界（label = -1）。",
                stats: "最终 label map 中，除边界像素外，每个像素都被赋予一个区域 id，形成完整分割。"
            }
        };

        const methodAnalogy = stepNotes[concept?.activeMethod] || {};
        const currentPhase = frame?.phase || "image";
        const currentAnalogyHtml = methodAnalogy[currentPhase]
            ? `<div class="seg-concept-analogy"><strong>当前步骤说明</strong><p>${escapeHtml(methodAnalogy[currentPhase])}</p></div>`
            : "";

        return `
            <section class="seg-notes-current">
                <div class="seg-notes-flowline" aria-label="当前步骤数据流">
                    ${flow.map((item, index) => `
                        <span>${escapeHtml(item)}</span>
                        ${index < flow.length - 1 ? "<i></i>" : ""}
                    `).join("")}
                </div>
                <p>${escapeHtml(meta.principle)}</p>
                <div class="seg-notes-stat-grid">
                    ${meta.facts.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
                </div>
            </section>
            ${currentAnalogyHtml}
            <dl class="seg-notes-compact">
                ${compactNotes.map(([label, text]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`).join("")}
            </dl>
        `;
    }

    function matrixHeatmap(values, size, labels = []) {
        const list = Array.from(values);
        const max = Math.max(0.001, ...list);
        return `
            <div class="seg-algo-matrix" style="--n:${size}">
                ${list.map((value, index) => {
                    const heat = clamp(value / max, 0, 1);
                    const label = labels[index] || (value >= 1 ? value.toFixed(1) : value.toFixed(2));
                    return `<span style="--heat:${heat.toFixed(3)}">${escapeHtml(label)}</span>`;
                }).join("")}
            </div>
        `;
    }

    function barsHtml(items) {
        const max = Math.max(0.001, ...items.map((item) => Math.abs(item.value)));
        return `
            <div class="seg-algo-bars">
                ${items.map((item) => `
                    <span style="--w:${Math.round((Math.abs(item.value) / max) * 100)}%;--c:${item.color || "#2563eb"}">
                        <b>${escapeHtml(item.label)}</b>
                        <em>${escapeHtml(item.note || item.value.toFixed(2))}</em>
                    </span>
                `).join("")}
            </div>
        `;
    }

    function eigenBars(values) {
        const max = Math.max(0.001, ...values.map((value) => Math.abs(value)));
        return `
            <div class="seg-eigen-bars seg-eigen-bars--signed">
                ${values.map((value, index) => {
                    const height = 16 + Math.abs(value / max) * 78;
                    return `<i class="${value < 0 ? "neg" : ""}" style="height:${height.toFixed(1)}%"><span>v${index + 1}</span></i>`;
                }).join("")}
            </div>
        `;
    }

    function computeMaskProps(cells, cols, rows, labels) {
        const fgIndexes = labels.map((label, index) => label ? index : -1).filter((index) => index >= 0);
        if (!fgIndexes.length) {
            return { count: 0, ratio: 0, perimeter: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        let minX = cols;
        let minY = rows;
        let maxX = 0;
        let maxY = 0;
        let perimeter = 0;
        fgIndexes.forEach((index) => {
            const cell = cells[index];
            minX = Math.min(minX, cell.x);
            minY = Math.min(minY, cell.y);
            maxX = Math.max(maxX, cell.x);
            maxY = Math.max(maxY, cell.y);
            neighborIndexes(index, cols, rows).forEach((next) => {
                if (!labels[next]) perimeter += 1;
            });
            const x = index % cols;
            const y = Math.floor(index / cols);
            if (x === 0 || x === cols - 1) perimeter += 1;
            if (y === 0 || y === rows - 1) perimeter += 1;
        });
        return {
            count: fgIndexes.length,
            ratio: fgIndexes.length / labels.length,
            perimeter,
            minX,
            minY,
            maxX,
            maxY,
        };
    }

    function filledLabels(model, value = 0) {
        return Array.from({ length: model.cells.length }, () => value);
    }

    function seedStageLabels(model, seeds) {
        const labels = filledLabels(model, 0);
        seeds.forEach((seed) => {
            labels[seed.index] = seed.type === "bg" ? false : true;
        });
        return labels;
    }

    function defaultGrabCutBox(model) {
        return {
            x0: Math.max(1, Math.round(model.cols * 0.25)),
            y0: Math.max(0, Math.round(model.rows * 0.14)),
            x1: Math.min(model.cols - 2, Math.round(model.cols * 0.78)),
            y1: Math.min(model.rows - 2, Math.round(model.rows * 0.76)),
        };
    }

    function normalizeBox(box, model) {
        const fallback = defaultGrabCutBox(model);
        const raw = box || fallback;
        const x0 = clamp(Math.min(raw.x0, raw.x1), 0, model.cols - 1);
        const x1 = clamp(Math.max(raw.x0, raw.x1), 0, model.cols - 1);
        const y0 = clamp(Math.min(raw.y0, raw.y1), 0, model.rows - 1);
        const y1 = clamp(Math.max(raw.y0, raw.y1), 0, model.rows - 1);
        return {
            x0,
            y0,
            x1: Math.max(x0, x1),
            y1: Math.max(y0, y1),
        };
    }

    function uniqueIndexes(indexes, model) {
        return [...new Set(indexes)]
            .filter((index) => Number.isInteger(index) && index >= 0 && index < model.cells.length);
    }

    function indexesToSeeds(indexes, type) {
        return indexes.map((index) => ({ index, type, text: type === "bg" ? "B" : "F" }));
    }

    function buildPixelModel(maxSide = 120, minCols = 48, minRows = 32) {
        const work = ensureWorkData();
        const scale = maxSide / Math.max(work.width, work.height);
        const cols = Math.max(minCols, Math.round(work.width * Math.min(1, scale)));
        const rows = Math.max(minRows, Math.round(work.height * Math.min(1, scale)));
        return buildSampleGrid(cols, rows);
    }

    function buildGrabCutPixelModel() {
        return buildPixelModel(60, 32, 22);
    }

    function seedsForModel(seedDefs, model) {
        return seedDefs.map((seed) => ({
            index: nearestCellIndex(model.cells, model.cols, model.rows, seed.x, seed.y),
            type: seed.type,
            text: seed.text,
            label: seed.label,
        }));
    }

    function scaleBox(box, fromModel, toModel) {
        const source = normalizeBox(box, fromModel);
        return normalizeBox({
            x0: Math.round((source.x0 / Math.max(1, fromModel.cols - 1)) * (toModel.cols - 1)),
            y0: Math.round((source.y0 / Math.max(1, fromModel.rows - 1)) * (toModel.rows - 1)),
            x1: Math.round((source.x1 / Math.max(1, fromModel.cols - 1)) * (toModel.cols - 1)),
            y1: Math.round((source.y1 / Math.max(1, fromModel.rows - 1)) * (toModel.rows - 1)),
        }, toModel);
    }

    function mapIndexesToModel(indexes, fromModel, toModel) {
        return uniqueIndexes(indexes, fromModel).map((index) => {
            const x = index % fromModel.cols;
            const y = Math.floor(index / fromModel.cols);
            const tx = Math.round((x / Math.max(1, fromModel.cols - 1)) * (toModel.cols - 1));
            const ty = Math.round((y / Math.max(1, fromModel.rows - 1)) * (toModel.rows - 1));
            return ty * toModel.cols + tx;
        });
    }

    function downsampleLabels(sourceModel, labels, targetModel) {
        return targetModel.cells.map((cell) => {
            const sx = Math.round((cell.x / Math.max(1, targetModel.cols - 1)) * (sourceModel.cols - 1));
            const sy = Math.round((cell.y / Math.max(1, targetModel.rows - 1)) * (sourceModel.rows - 1));
            return labels[sy * sourceModel.cols + sx];
        });
    }

    function cutEdgesFromLabels(model, labels, limit = 260) {
        const edges = [];
        for (let y = 0; y < model.rows; y += 1) {
            for (let x = 0; x < model.cols; x += 1) {
                const index = y * model.cols + x;
                if (x < model.cols - 1 && labels[index] !== labels[index + 1]) edges.push({ a: index, b: index + 1, weight: 1 });
                if (y < model.rows - 1 && labels[index] !== labels[index + model.cols]) edges.push({ a: index, b: index + model.cols, weight: 1 });
                if (edges.length >= limit) return edges;
            }
        }
        return edges;
    }

    /* ── GMM (Gaussian Mixture Model) for GrabCut ──
     * K 个对角协方差高斯分量，k-means 初始化 + EM 迭代。
     * 对应 GrabCut 论文步骤 3：用 GMM 对前景/背景颜色分布建模。
     */
    function fitGmm(cells, indexes, k, emIters) {
        k = k || 5;
        emIters = emIters || 3;
        if (indexes.length === 0) {
            return { components: [{ weight: 1, mean: { r: 128, g: 128, b: 128 }, var: { r: 1e4, g: 1e4, b: 1e4 } }] };
        }
        if (indexes.length < k) k = Math.max(1, indexes.length);

        const colors = indexes.map((i) => [cells[i].r, cells[i].g, cells[i].b]);

        // k-means 初始化
        let means = [];
        const step = Math.max(1, Math.floor(colors.length / k));
        for (let c = 0; c < k; c += 1) {
            const idx = Math.min(colors.length - 1, c * step);
            means.push(colors[idx].slice());
        }
        const assignments = new Array(colors.length);
        for (let iter = 0; iter < 6; iter += 1) {
            for (let i = 0; i < colors.length; i += 1) {
                let bestDist = Infinity;
                let bestC = 0;
                for (let c = 0; c < k; c += 1) {
                    const d = (colors[i][0] - means[c][0]) ** 2
                        + (colors[i][1] - means[c][1]) ** 2
                        + (colors[i][2] - means[c][2]) ** 2;
                    if (d < bestDist) { bestDist = d; bestC = c; }
                }
                assignments[i] = bestC;
            }
            for (let c = 0; c < k; c += 1) {
                let sR = 0, sG = 0, sB = 0, n = 0;
                for (let i = 0; i < colors.length; i += 1) {
                    if (assignments[i] === c) { sR += colors[i][0]; sG += colors[i][1]; sB += colors[i][2]; n += 1; }
                }
                if (n > 0) means[c] = [sR / n, sG / n, sB / n];
            }
        }

        // 构建初始分量
        let components = [];
        for (let c = 0; c < k; c += 1) {
            let sR = 0, sG = 0, sB = 0, sR2 = 0, sG2 = 0, sB2 = 0, n = 0;
            for (let i = 0; i < colors.length; i += 1) {
                if (assignments[i] === c) {
                    sR += colors[i][0]; sG += colors[i][1]; sB += colors[i][2];
                    sR2 += colors[i][0] ** 2; sG2 += colors[i][1] ** 2; sB2 += colors[i][2] ** 2;
                    n += 1;
                }
            }
            if (n > 0) {
                components.push({
                    weight: n / colors.length,
                    mean: { r: sR / n, g: sG / n, b: sB / n },
                    var: {
                        r: Math.max(400, sR2 / n - (sR / n) ** 2),
                        g: Math.max(400, sG2 / n - (sG / n) ** 2),
                        b: Math.max(400, sB2 / n - (sB / n) ** 2),
                    },
                });
            }
        }
        if (components.length === 0) {
            components.push({ weight: 1, mean: { r: 128, g: 128, b: 128 }, var: { r: 1e4, g: 1e4, b: 1e4 } });
        }

        // EM 迭代
        for (let em = 0; em < emIters; em += 1) {
            const resp = [];
            for (let i = 0; i < colors.length; i += 1) {
                const probs = components.map((comp) => {
                    const dr = colors[i][0] - comp.mean.r;
                    const dg = colors[i][1] - comp.mean.g;
                    const db = colors[i][2] - comp.mean.b;
                    return comp.weight * Math.exp(-0.5 * (dr * dr / comp.var.r + dg * dg / comp.var.g + db * db / comp.var.b));
                });
                const sum = probs.reduce((a, b) => a + b, 0) || 1;
                resp.push(probs.map((p) => p / sum));
            }
            for (let c = 0; c < components.length; c += 1) {
                let sw = 0, sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0;
                for (let i = 0; i < colors.length; i += 1) {
                    const r = resp[i][c];
                    sw += r; sr += r * colors[i][0]; sg += r * colors[i][1]; sb += r * colors[i][2];
                    sr2 += r * colors[i][0] ** 2; sg2 += r * colors[i][1] ** 2; sb2 += r * colors[i][2] ** 2;
                }
                if (sw > 0.5) {
                    components[c].weight = sw / colors.length;
                    components[c].mean.r = sr / sw;
                    components[c].mean.g = sg / sw;
                    components[c].mean.b = sb / sw;
                    components[c].var.r = Math.max(400, sr2 / sw - (sr / sw) ** 2);
                    components[c].var.g = Math.max(400, sg2 / sw - (sg / sw) ** 2);
                    components[c].var.b = Math.max(400, sb2 / sw - (sb / sw) ** 2);
                }
            }
        }
        return { components };
    }

    // 负对数似然：-log P(color | GMM)，使用 LogSumExp 保证数值稳定
    function gmmNegLogLikelihood(cell, gmm) {
        let logMax = -Infinity;
        const logProbs = gmm.components.map((comp) => {
            const dr = cell.r - comp.mean.r;
            const dg = cell.g - comp.mean.g;
            const db = cell.b - comp.mean.b;
            const lp = Math.log(comp.weight)
                - 0.5 * (dr * dr / comp.var.r + dg * dg / comp.var.g + db * db / comp.var.b);
            if (lp > logMax) logMax = lp;
            return lp;
        });
        let sumExp = 0;
        for (const lp of logProbs) sumExp += Math.exp(lp - logMax);
        return -(logMax + Math.log(sumExp));
    }

    function gmmDominantMean(gmm) {
        let best = gmm.components[0];
        for (let c = 1; c < gmm.components.length; c += 1) {
            if (gmm.components[c].weight > best.weight) best = gmm.components[c];
        }
        return best.mean;
    }

    /* ── GrabCut 核算法 ──
     * 严格遵循 GrabCut 论文流程：
     * 1. 矩形框标注前景大致位置
     * 2. 框外 = 确定背景，框内 = 可能前景
     * 3. GMM 对 FG/BG 颜色分布建模（K=5 分量）
     * 4. 构建图：Source=FG, Sink=BG, 像素间 n-link
     * 5. 边权 = 颜色相似度（β 参数自适应）
     * 6. max-flow / min-cut 全局优化二值标签
     * 7. GMM 与图割交替迭代直至收敛
     */
    function runDenseGrabCut(model, box, fgUserSeeds, bgUserSeeds) {
        const fgUserSet = new Set(uniqueIndexes(fgUserSeeds, model));
        const bgUserSet = new Set(uniqueIndexes(bgUserSeeds, model));
        const insideBox = (cell) => cell.x >= box.x0 && cell.x <= box.x1 && cell.y >= box.y0 && cell.y <= box.y1;
        const central = (cell) => {
            const nx = (cell.x - (box.x0 + box.x1) / 2) / Math.max(1, (box.x1 - box.x0) / 2);
            const ny = (cell.y - (box.y0 + box.y1) / 2) / Math.max(1, (box.y1 - box.y0) / 2);
            return nx * nx + ny * ny < 0.62;
        };

        // 步骤 1-2：初始化 trimap
        let labels = model.cells.map((cell, index) => {
            if (bgUserSet.has(index)) return false;
            if (fgUserSet.has(index)) return true;
            return insideBox(cell);
        });

        // 自适应计算 β 参数（论文公式：β = 1 / (2 * E[||I_i - I_j||²])）
        let sumDistSq = 0;
        let edgeCount = 0;
        for (let y = 0; y < model.rows; y += 1) {
            for (let x = 0; x < model.cols; x += 1) {
                const index = y * model.cols + x;
                const cell = model.cells[index];
                if (x < model.cols - 1) { sumDistSq += colorDistanceSq(cell, model.cells[index + 1]); edgeCount += 1; }
                if (y < model.rows - 1) { sumDistSq += colorDistanceSq(cell, model.cells[index + model.cols]); edgeCount += 1; }
            }
        }
        const beta = edgeCount > 0 ? 1 / (2 * (sumDistSq / edgeCount)) : 0.001;
        const gamma = 9; // pairwise 权重（远小于 unary，让颜色项主导分割）
        const unaryScale = 5; // 放大 GMM 负对数似然，使其显著大于 pairwise

        const snapshots = [];
        const iterations = 5;
        const kComponents = 5;

        for (let iter = 1; iter <= iterations; iter += 1) {
            // 步骤 3：用当前 mask 拟合 FG/BG 的 GMM
            const fgIndexes = [];
            const bgIndexes = [];
            for (let i = 0; i < labels.length; i += 1) {
                if (labels[i]) fgIndexes.push(i);
                else bgIndexes.push(i);
            }
            const fgGmm = fitGmm(model.cells, fgIndexes, kComponents, 3);
            const bgGmm = fitGmm(model.cells, bgIndexes, kComponents, 3);

            // 步骤 4-6：建图 + min-cut
            // unary: sourceCap = D(BG) = -log P(I|BG), sinkCap = D(FG) = -log P(I|FG)
            // pairwise: γ·exp(-β·||I_i-I_j||²)
            const solution = solveGridCut(model.cells, model.cols, model.rows, {
                unary: (cell, index) => {
                    if (fgUserSet.has(index)) return { sourceCap: 1000, sinkCap: 0.001 };
                    if (bgUserSet.has(index) || !insideBox(cell)) return { sourceCap: 0.001, sinkCap: 1000 };
                    const fgCost = Math.min(80, Math.max(0.01, gmmNegLogLikelihood(cell, fgGmm) * unaryScale));
                    const bgCost = Math.min(80, Math.max(0.01, gmmNegLogLikelihood(cell, bgGmm) * unaryScale));
                    return { sourceCap: bgCost, sinkCap: fgCost };
                },
                pairwise: (a, b) => gamma * Math.exp(-beta * colorDistanceSq(a, b)),
            });

            labels = solution.labels;

            // 可视化用 scores（正 = 偏前景）
            const scores = model.cells.map((cell, index) => {
                if (fgUserSet.has(index)) return 8;
                if (bgUserSet.has(index) || !insideBox(cell)) return -8;
                return Math.max(-8, Math.min(8, gmmNegLogLikelihood(cell, bgGmm) - gmmNegLogLikelihood(cell, fgGmm)));
            });

            snapshots.push({
                iter,
                labels: labels.slice(),
                fgMean: gmmDominantMean(fgGmm),
                bgMean: gmmDominantMean(bgGmm),
                scores,
                cutEdges: solution.cutEdges,
                maxFlow: solution.maxFlow,
                fgGmm,
                bgGmm,
            });
        }
        return { labels, snapshots, insideBox, central };
    }

    function runDenseSeededCut(model, seedDefs, options = {}) {
        const seedMarks = seedsForModel(seedDefs, model);
        const fgSeedSet = new Set(seedMarks.filter((seed) => seed.type === "fg").map((seed) => seed.index));
        const bgSeedSet = new Set(seedMarks.filter((seed) => seed.type === "bg").map((seed) => seed.index));
        const fgMean = colorMean(model.cells, [...fgSeedSet]);
        const bgMean = colorMean(model.cells, [...bgSeedSet]);
        const sigmaSq = options.sigmaSq || 58 * 58;
        const scores = model.cells.map((cell, index) => {
            if (fgSeedSet.has(index)) return 8;
            if (bgSeedSet.has(index)) return -8;
            const fgAffinity = Math.exp(-colorDistanceSq(cell, fgMean) / (2 * sigmaSq)) * 3.2;
            const bgAffinity = Math.exp(-colorDistanceSq(cell, bgMean) / (2 * sigmaSq)) * 3.2;
            const centerBias = (0.5 - Math.hypot(cell.cx - 0.5, cell.cy - 0.5)) * (options.centerBias || 0.35);
            return fgAffinity - bgAffinity + centerBias;
        });
        let labels = scores.map((score) => score > 0);
        const snapshots = [];
        const totalRounds = options.rounds || 4;
        for (let iter = 1; iter <= totalRounds; iter += 1) {
            const next = labels.slice();
            model.cells.forEach((cell, index) => {
                if (fgSeedSet.has(index)) {
                    next[index] = true;
                    return;
                }
                if (bgSeedSet.has(index)) {
                    next[index] = false;
                    return;
                }
                let vote = 0;
                neighborIndexes(index, model.cols, model.rows).forEach((neighbor) => {
                    const weight = Math.exp(-colorDistanceSq(cell, model.cells[neighbor]) / (2 * 36 * 36));
                    vote += (labels[neighbor] ? 1 : -1) * weight;
                });
                next[index] = scores[index] + vote * 0.68 > 0;
            });
            labels = next;
            snapshots.push({
                iter,
                labels: labels.slice(),
                scores,
                cutEdges: cutEdgesFromLabels(model, labels),
            });
        }
        return {
            seedMarks,
            fgMean,
            bgMean,
            scores,
            labels,
            cutEdges: cutEdgesFromLabels(model, labels),
            snapshots,
        };
    }

    function runDenseNcut(model) {
        const raw = model.cells.map((cell) => (
            (cell.cx - 0.5) * 1.25
            + (cell.cy - 0.5) * 0.42
            + ((cell.gray - 128) / 255) * 0.86
        ));
        const snapshots = [];
        let vector = raw.slice();
        for (let iter = 1; iter <= 4; iter += 1) {
            const next = vector.slice();
            model.cells.forEach((cell, index) => {
                let sum = vector[index] * 1.4;
                let weightSum = 1.4;
                neighborIndexes(index, model.cols, model.rows).forEach((neighbor) => {
                    const weight = Math.exp(-colorDistanceSq(cell, model.cells[neighbor]) / (2 * 42 * 42));
                    sum += vector[neighbor] * weight;
                    weightSum += weight;
                });
                next[index] = sum / Math.max(0.001, weightSum);
            });
            const mean = next.reduce((sum, value) => sum + value, 0) / next.length;
            const norm = Math.hypot(...next.map((value) => value - mean)) || 1;
            vector = next.map((value) => (value - mean) / norm);
            snapshots.push({ iter, vector: vector.slice() });
        }
        const sorted = [...vector].sort((a, b) => a - b);
        const threshold = sorted[Math.floor(sorted.length / 2)];
        const labels = vector.map((value) => value >= threshold);
        const cutEdges = cutEdgesFromLabels(model, labels);
        return { scores: vector, labels, cutEdges, snapshots, threshold };
    }

    function buildGraphCutDemo() {
        const model = buildSampleGrid(10, 7);
        const seeds = graphSeedsForSample();
        const denseModel = buildPixelModel(120, 48, 32);
        const denseCut = runDenseSeededCut(denseModel, seeds);
        const denseSeedMarks = denseCut.seedMarks;
        const denseFinal = denseCut.snapshots[denseCut.snapshots.length - 1] || denseCut;
        const denseFgCount = denseFinal.labels.filter(Boolean).length;
        const seedMarks = seeds.map((seed) => ({
            index: nearestCellIndex(model.cells, model.cols, model.rows, seed.x, seed.y),
            type: seed.type,
        }));
        const fgSeedSet = new Set(seedMarks.filter((seed) => seed.type === "fg").map((seed) => seed.index));
        const bgSeedSet = new Set(seedMarks.filter((seed) => seed.type === "bg").map((seed) => seed.index));
        const fgMean = colorMean(model.cells, [...fgSeedSet]);
        const bgMean = colorMean(model.cells, [...bgSeedSet]);
        const sigmaSq = 62 * 62;
        const solution = solveGridCut(model.cells, model.cols, model.rows, {
            unary: (cell, index) => {
                if (fgSeedSet.has(index)) return { sourceCap: 90, sinkCap: 0.01 };
                if (bgSeedSet.has(index)) return { sourceCap: 0.01, sinkCap: 90 };
                return {
                    sourceCap: 1 + Math.exp(-colorDistanceSq(cell, fgMean) / (2 * sigmaSq)) * 8,
                    sinkCap: 1 + Math.exp(-colorDistanceSq(cell, bgMean) / (2 * sigmaSq)) * 8,
                };
            },
            pairwise: (a, b) => {
                const edgeSigmaSq = 38 * 38;
                return 0.14 + Math.exp(-colorDistanceSq(a, b) / (2 * edgeSigmaSq)) * 7.5;
            },
        });
        const scores = model.cells.map((_, index) => (solution.sourceCaps[index] - solution.sinkCaps[index]) / Math.max(solution.sourceCaps[index], solution.sinkCaps[index], 1));
        const fgCount = solution.labels.filter(Boolean).length;
        const pathCells = solution.paths[0]?.nodes.filter((index) => index >= 0 && index < model.cells.length) || [];
        const metrics = [
            ["max-flow", solution.maxFlow.toFixed(2)],
            ["cut edges", String(solution.cutEdges.length)],
            ["foreground", `${Math.round((fgCount / model.cells.length) * 100)}%`],
            ["seeds", `FG ${fgSeedSet.size} / BG ${bgSeedSet.size}`],
        ];
        return {
            stepperKind: "graph",
            status: "Graph Cut Algorithm",
            activeMethod: "Graph Cut",
            stageTitle: "当前实验模式：Graph Cut 最小割",
            stripFeature: "unary + pairwise graph",
            stripK: `${denseModel.cells.length} px samples`,
            stripOutput: "min-cut labels",
            regionCount: "2",
            formulaLabel: "Graph Cut",
            formula: "E(L)=\\sum_i \\text{unary}_i(L_i)+\\sum_{ij} \\text{pairwise}_{ij}[L_i \\neq L_j]",
            formulaNote: "页面使用小图解释 max-flow/min-cut，同时在大图上运行 dense 颜色项 + 邻域平滑的像素级近似图割。",
            notes: [
                ["建图", "每个小格是节点，Source 表示前景，Sink 表示背景。"],
                ["Unary cost", "前景/背景种子估计颜色模型，决定节点连到 Source 或 Sink 的代价。"],
                ["Pairwise cost", "相邻格颜色越像，边权越大，被切开的代价越高。"],
                ["最小割", "最大流结束后，从 Source 还能到达的节点就是前景侧。"],
            ],
            showcase: {
                model: denseModel,
                labels: denseFinal.labels,
                cutEdges: denseFinal.cutEdges,
                title: "Graph Cut 分割结果",
                caption: `绿色为 Source 前景侧，蓝色为背景侧；dense 前景约 ${Math.round((denseFgCount / denseModel.cells.length) * 100)}%，割边 ${denseFinal.cutEdges.length} 条。`,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 像素图节点与前景/背景种子",
                    graph: conceptGridSvg(model, { seeds: seedMarks, caption: "FG/BG seeds anchor the two terminal sides" }),
                    matrix: barsHtml([
                        { label: "FG mean", value: 1, color: "#22c55e", note: rgbText(fgMean) },
                        { label: "BG mean", value: 1, color: "#60a5fa", note: rgbText(bgMean) },
                    ]),
                    detail: metricCards([["sample", `${model.cols}×${model.rows} grid`], ["source", state.sourceName || "sample image"], ["seed rule", "manual FG/BG hints"], ["next", "build unary costs"]]),
                    stageNote: "先把图像抽样成小图，再用绿色/蓝色种子给前景和背景提供约束。",
                    showcase: {
                        model: denseModel,
                        labels: seedStageLabels(denseModel, denseSeedMarks),
                        seeds: denseSeedMarks,
                        title: "Graph Cut Step 1：前景/背景种子",
                        caption: "绿色种子代表 Source 前景约束，蓝色种子代表 Sink 背景约束；大图按 dense 像素采样显示。",
                        alpha: 0.5,
                    },
                },
                {
                    phase: "feature",
                    title: "2. Unary cost：节点更像前景还是背景",
                    graph: conceptGridSvg(model, { scores, seeds: seedMarks, caption: "orange = FG affinity, blue = BG affinity" }),
                    matrix: barsHtml(model.cells.slice(0, 8).map((cell, offset) => ({
                        label: `p${offset + 1}`,
                        value: solution.sourceCaps[cell.index] - solution.sinkCaps[cell.index],
                        color: solution.sourceCaps[cell.index] > solution.sinkCaps[cell.index] ? "#f97316" : "#2563eb",
                        note: `S ${solution.sourceCaps[cell.index].toFixed(1)} / T ${solution.sinkCaps[cell.index].toFixed(1)}`,
                    }))),
                    detail: metricCards([
                        ["FG color", rgbText(fgMean)],
                        ["BG color", rgbText(bgMean)],
                        ["formula", "D_i(FG) ∝ d(p_i, FG_mean)"],
                        ["rule", "closer to FG -> stronger Source link"]
                    ]),
                    stageNote: "每个节点会得到一对端点权重：切断 Source 边会让它偏向背景，切断 Sink 边会让它偏向前景。",
                    showcase: {
                        model: denseModel,
                        scores: denseCut.scores,
                        seeds: denseSeedMarks,
                        title: "Graph Cut Step 2：Unary cost 热力图",
                        caption: "偏橙的网格更像前景模型，偏蓝的网格更像背景模型。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "assign",
                    title: "3. Pairwise edge：相似邻居更不愿被切开",
                    graph: conceptGridSvg(model, { pairs: solution.pairs, showEdges: true, activeCells: pathCells, caption: "thicker edges carry higher smoothness penalty" }),
                    matrix: barsHtml(solution.pairs.slice(0, 10).map((pair, index) => ({
                        label: `e${index + 1}`,
                        value: pair.weight,
                        color: pair.weight > 4 ? "#16a34a" : "#f97316",
                        note: `w=${pair.weight.toFixed(2)}`,
                    }))),
                    detail: metricCards([
                        ["contrast σ", "38.0 px color"],
                        ["formula", "V_ij = exp(-ΔI^2 / 2σ^2)"],
                        ["meaning", "similar color -> stronger link"],
                        ["paths", `${solution.paths.length} augment flows`]
                    ]),
                    stageNote: "最大流会沿着还能承载流量的路径推进；粗边代表切开会更痛，红色切线通常绕开它们。",
                    showcase: {
                        model: denseModel,
                        labels: denseCut.snapshots[0]?.labels || filledLabels(denseModel, 0),
                        cutEdges: denseCut.snapshots[0]?.cutEdges || [],
                        title: "Graph Cut Step 3：最大流增广路径",
                        caption: "大图展示 dense 图割的第一轮边界，红线是被切开的相邻采样点。",
                        alpha: 0.66,
                    },
                },
                {
                    phase: "update",
                    title: "4. Max-flow / Min-cut 后的割边",
                    graph: conceptGridSvg(model, { labels: solution.labels, cutEdges: solution.cutEdges, seeds: seedMarks, caption: "red lines are the selected cut boundary" }),
                    matrix: metricCards(metrics),
                    detail: barsHtml([
                        { label: "foreground side", value: fgCount, color: "#22c55e", note: `${fgCount} nodes` },
                        { label: "background side", value: model.cells.length - fgCount, color: "#60a5fa", note: `${model.cells.length - fgCount} nodes` },
                        { label: "cut capacity", value: solution.maxFlow, color: "#ef4444", note: solution.maxFlow.toFixed(2) },
                    ]),
                    stageNote: "最小割选择一组总权重最低的边，把 Source 与 Sink 分开。",
                    showcase: {
                        model: denseModel,
                        labels: denseFinal.labels,
                        cutEdges: denseFinal.cutEdges,
                        title: "Graph Cut Step 4：最小割边界",
                        caption: "红色虚线是 dense 图割最终切断的边，绿色/蓝色表示割开后的两侧。",
                    },
                },
                {
                    phase: "stats",
                    title: "5. 输出二值 label map 与统计",
                    graph: conceptGridSvg(model, { labels: solution.labels, cutEdges: solution.cutEdges, caption: "foreground/background label map" }),
                    matrix: metricCards(metrics),
                    detail: graphCutOutputExplainHtml({
                        fgRatio: Math.round((fgCount / model.cells.length) * 100),
                        bgRatio: Math.round(((model.cells.length - fgCount) / model.cells.length) * 100),
                        cutEdges: solution.cutEdges.length,
                        maxFlow: solution.maxFlow.toFixed(2),
                    }),
                    stageNote: "最终得到的是每个节点的前景/背景标签，红线就是算法认为最自然的边界。",
                    showcase: {
                        model: denseModel,
                        labels: denseFinal.labels,
                        cutEdges: denseFinal.cutEdges,
                        title: "Graph Cut Step 5：最终分割结果",
                        caption: `dense 前景约 ${Math.round((denseFgCount / denseModel.cells.length) * 100)}%，割边 ${denseFinal.cutEdges.length} 条。`,
                    },
                },
            ],
        };
    }

    function buildNcutDemo() {
        const model = buildSampleGrid(4, 3);
        const denseModel = buildPixelModel(120, 48, 32);
        const denseNcut = runDenseNcut(denseModel);
        const n = model.cells.length;
        const weights = new Float64Array(n * n);
        for (let i = 0; i < n; i += 1) {
            for (let j = i + 1; j < n; j += 1) {
                const a = model.cells[i];
                const b = model.cells[j];
                const colorDistance = Math.sqrt(colorDistanceSq(a, b)) / 441.7;
                const spatialDistance = Math.hypot(a.cx - b.cx, a.cy - b.cy);
                const closeBonus = spatialDistance < 0.54 ? 1 : 0.32;
                const weight = closeBonus * Math.exp(-(colorDistance * colorDistance) / 0.16) * Math.exp(-(spatialDistance * spatialDistance) / 0.42);
                weights[i * n + j] = weight;
                weights[j * n + i] = weight;
            }
        }
        const degree = Array.from({ length: n }, (_, i) => {
            let sum = 0;
            for (let j = 0; j < n; j += 1) sum += weights[i * n + j];
            return Math.max(0.001, sum);
        });
        const first = degree.map(Math.sqrt);
        const firstNorm = Math.hypot(...first) || 1;
        for (let i = 0; i < first.length; i += 1) first[i] /= firstNorm;
        let vector = model.cells.map((cell) => (cell.cx - 0.5) * 1.6 + (cell.gray - 128) / 255);
        const orthogonalize = (vec) => {
            const dot = vec.reduce((sum, value, index) => sum + value * first[index], 0);
            for (let i = 0; i < vec.length; i += 1) vec[i] -= dot * first[i];
            const norm = Math.hypot(...vec) || 1;
            for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
        };
        orthogonalize(vector);
        const eigenSnapshots = [];
        for (let iter = 0; iter < 12; iter += 1) {
            const next = Array(n).fill(0);
            for (let i = 0; i < n; i += 1) {
                for (let j = 0; j < n; j += 1) {
                    next[i] += weights[i * n + j] * vector[j] / Math.sqrt(degree[i] * degree[j]);
                }
            }
            orthogonalize(next);
            vector = next;
            if ([1, 4, 8, 11].includes(iter)) eigenSnapshots.push({ iter: iter + 1, vector: [...vector] });
        }
        const sorted = [...vector].sort((a, b) => a - b);
        const threshold = sorted[Math.floor(sorted.length / 2)];
        const labels = vector.map((value) => value >= threshold);
        let cut = 0;
        let assocA = 0;
        let assocB = 0;
        for (let i = 0; i < n; i += 1) {
            if (labels[i]) assocA += degree[i];
            else assocB += degree[i];
            for (let j = i + 1; j < n; j += 1) {
                if (labels[i] !== labels[j]) cut += weights[i * n + j];
            }
        }
        const ncut = cut / Math.max(0.001, assocA) + cut / Math.max(0.001, assocB);
        const pairEdges = [];
        for (let i = 0; i < n; i += 1) {
            for (let j = i + 1; j < n; j += 1) {
                if (weights[i * n + j] > 0.1) pairEdges.push({ a: i, b: j, weight: weights[i * n + j] * 7 });
            }
        }
        const cutEdges = pairEdges.filter((pair) => labels[pair.a] !== labels[pair.b]);
        const metrics = [
            ["cut(A,B)", cut.toFixed(3)],
            ["assoc(A,V)", assocA.toFixed(3)],
            ["assoc(B,V)", assocB.toFixed(3)],
            ["Ncut score", ncut.toFixed(3)],
        ];
        const maxDegree = Math.max(0.001, ...degree);
        const degreeScores = degree.map((value) => (value / maxDegree) * 2 - 1);
        return {
            stepperKind: "graph",
            status: "Normalized Cut Algorithm",
            activeMethod: "Normalized Cut",
            stageTitle: "当前实验模式：Normalized Cut 谱分割",
            stripFeature: "W + D + eigenvector",
            stripK: `${denseModel.cells.length} px samples`,
            stripOutput: "balanced partition",
            regionCount: "2",
            formulaLabel: "Ncut",
            formula: "\\text{Ncut}(A,B)=\\frac{\\text{cut}(A,B)}{\\text{assoc}(A,V)}+\\frac{\\text{cut}(A,B)}{\\text{assoc}(B,V)}",
            formulaNote: "说明区展示小型 W/D/特征向量，右侧大图用 dense 平滑谱向量近似展示像素级二分。",
            notes: [
                ["W 矩阵", "颜色相近、空间相邻的超像素权重大。"],
                ["D 矩阵", "D[i,i] 是第 i 个节点的连接总强度。"],
                ["谱松弛", "第二特征向量把节点投到一维，符号或中位数阈值给出二分。"],
                ["归一化", "Ncut 用 assoc 项惩罚切出很小的孤立块。"],
            ],
            showcase: {
                model: denseModel,
                labels: denseNcut.labels,
                cutEdges: denseNcut.cutEdges,
                title: "Normalized Cut 平衡分割结果",
                caption: `两种颜色表示第二特征向量阈值后的两个区域；Ncut score = ${ncut.toFixed(3)}。`,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 从图像抽样为超像素图",
                    graph: conceptGridSvg(model, { pairs: pairEdges, showEdges: true, caption: "supernodes are connected by color-spatial similarity" }),
                    matrix: metricCards([
                        ["nodes V", `${n} nodes`],
                        ["W weight", "similarity W_ij"],
                        ["cut cost", "cut(A,B) = Σ W_ij"],
                        ["degree D_ii", "Σ_j W_ij"]
                    ]),
                    detail: barsHtml(model.cells.map((cell, index) => ({ label: `v${index + 1}`, value: degree[index], color: "#2563eb", note: `D=${degree[index].toFixed(2)}` }))),
                    stageNote: "Ncut 不是找 Source/Sink，而是先构造一个所有节点之间的相似度图。",
                    showcase: {
                        model: denseModel,
                        labels: filledLabels(denseModel, 0),
                        activeCells: denseModel.cells
                            .filter((_, index) => index % Math.max(1, Math.round(denseModel.cells.length / 80)) === 0)
                            .map((cell) => cell.index),
                        title: "Ncut Step 1：超像素节点图",
                        caption: "先把图像抽样为 dense 像素节点，后续用相似度平滑近似谱分割。",
                        alpha: 0.42,
                    },
                },
                {
                    phase: "feature",
                    title: "2. 权重矩阵 W 与度矩阵 D",
                    graph: matrixHeatmap(Array.from(weights), n),
                    matrix: barsHtml(degree.map((value, index) => ({ label: `D${index + 1}`, value, color: "#0ea5e9", note: value.toFixed(2) }))),
                    detail: metricCards([
                        ["W shape", `${n}×${n}`],
                        ["normalizer", "D^-1/2 * W * D^-1/2"],
                        ["formula W_ij", "exp(-d_c^2/σ_c^2) * exp(-d_s^2/σ_s^2)"],
                        ["eigensystem", "(D - W) * y = λ * D * y"]
                    ]),
                    stageNote: "矩阵越亮表示两个节点越相似；D 记录每个节点在图里的总连接强度。",
                    showcase: {
                        model: denseModel,
                        scores: denseNcut.snapshots[0]?.vector || denseNcut.scores,
                        title: "Ncut Step 2：节点连接强度 D",
                        caption: "蓝/橙热力显示 dense 谱向量的初期分布，后续逐轮平滑稳定。",
                        alpha: 0.7,
                    },
                },
                ...eigenSnapshots.map((snapshot, index) => ({
                    phase: index < 2 ? "assign" : "update",
                    title: `3. 特征向量迭代 ${snapshot.iter}`,
                    graph: eigenBars(snapshot.vector),
                    matrix: conceptGridSvg(model, { scores: snapshot.vector, caption: "blue / orange signs foreshadow the partition" }),
                    detail: metricCards([
                        ["iteration", String(snapshot.iter)],
                        ["orthogonal", "y ⊥ D1 (remove trivial)"],
                        ["partition y_i", "signs show cluster grouping"],
                        ["solve rule", "generalized eigensystem"]
                    ]),
                    stageNote: "向量逐步稳定后，同号节点会被分到同一侧；这就是谱分割的可视化核心。",
                    showcase: {
                        model: denseModel,
                        scores: denseNcut.snapshots[Math.min(index + 1, denseNcut.snapshots.length - 1)]?.vector || denseNcut.scores,
                        title: `Ncut Step 3：特征向量迭代 ${snapshot.iter}`,
                        caption: "蓝/橙两侧逐渐稳定，之后按阈值形成两个区域。",
                        alpha: 0.74,
                    },
                })),
                {
                    phase: "stats",
                    title: "4. Ncut 二分结果",
                    graph: conceptGridSvg(model, { labels, pairs: pairEdges, cutEdges, showEdges: true, caption: "normalized cut keeps two internally coherent groups" }),
                    matrix: metricCards(metrics),
                    detail: noteRows([
                        ["为什么不是普通 cut", "普通 cut 容易把一个弱连接小块切掉，Ncut 会同时看切割代价和区域内部连接强度。"],
                        ["本次结果", `cut=${cut.toFixed(3)}, Ncut=${ncut.toFixed(3)}。`],
                    ]),
                    stageNote: "最终边界由第二特征向量的阈值决定，并用 Ncut 分数衡量是否平衡。",
                    showcase: {
                        model: denseModel,
                        labels: denseNcut.labels,
                        cutEdges: denseNcut.cutEdges,
                        title: "Ncut Step 4：最终平衡分割",
                        caption: `两个区域由特征向量阈值得到；Ncut score = ${ncut.toFixed(3)}。`,
                    },
                },
            ],
        };
    }

    function buildGrabCutDemo() {
        const model = buildGrabCutPixelModel();
        const previewModel = buildSampleGrid(12, 8);
        const box = normalizeBox(state.grabcut.draftBox || state.grabcut.box, model);
        if (!state.grabcut.box && !state.grabcut.draftBox) state.grabcut.box = box;
        const fgUserSeeds = uniqueIndexes(state.grabcut.fgSeeds, model);
        const bgUserSeeds = uniqueIndexes(state.grabcut.bgSeeds, model);
        const userSeedMarks = [
            ...indexesToSeeds(fgUserSeeds, "fg"),
            ...indexesToSeeds(bgUserSeeds, "bg"),
        ];
        const previewBox = scaleBox(box, model, previewModel);
        const previewSeedMarks = [
            ...indexesToSeeds(mapIndexesToModel(fgUserSeeds, model, previewModel), "fg"),
            ...indexesToSeeds(mapIndexesToModel(bgUserSeeds, model, previewModel), "bg"),
        ];
        const { labels, snapshots, insideBox, central } = runDenseGrabCut(model, box, fgUserSeeds, bgUserSeeds);
        const final = snapshots[snapshots.length - 1];
        const props = computeMaskProps(model.cells, model.cols, model.rows, final.labels);
        const finalPreviewLabels = downsampleLabels(model, final.labels, previewModel);
        const metrics = [
            ["iterations", String(snapshots.length)],
            ["mask ratio", `${Math.round(props.ratio * 100)}%`],
            ["bbox", `${props.maxX - props.minX + 1}×${props.maxY - props.minY + 1}`],
            ["pixel grid", `${model.cols}×${model.rows}`],
        ];
        return {
            stepperKind: "grabcut",
            status: "GrabCut Algorithm",
            activeMethod: "GrabCut",
            stageTitle: "当前实验模式：GrabCut 前景提取",
            stripFeature: "GMM (K=5) + max-flow/min-cut",
            stripK: "FG/BG",
            stripOutput: "foreground mask",
            regionCount: "2",
            formulaLabel: "GrabCut",
            formula: "repeat: fit FG/BG GMM → min-cut (max-flow) → update labels",
            formulaNote: "框内默认是可能前景；GMM 学习 FG/BG 各 5 个高斯分量的颜色分布，min-cut 全局优化二值标签。",
            notes: [
                ["用户框", "在输入图上拖拽矩形框，框外作为确定背景，框内作为可能前景。"],
                ["前景/背景笔", "前景笔应画在想保留的衣服/物体上；背景笔只画皮肤、头发或外部背景，画到目标上会被强制扣除。"],
                ["GMM 建模", "每轮用当前 mask 拟合 FG/BG 各 5 个高斯分量的 GMM（k-means 初始化 + EM 迭代），捕获多模态颜色分布。"],
                ["Graph Cut", "以 GMM 负对数似然为 unary 代价，颜色相似度（β 自适应）为 pairwise 代价，用 max-flow/min-cut 求全局最优二值 mask。"],
                ["迭代收敛", "GMM 与图割交替更新，边界逐轮贴近目标轮廓，直至标签稳定。"],
            ],
            showcase: {
                model,
                labels: final.labels,
                box,
                seeds: userSeedMarks,
                interactive: "grabcut",
                title: "GrabCut 前景 mask",
                caption: `绿色为最终前景，蓝色为背景；前景覆盖约 ${Math.round(props.ratio * 100)}%，bbox ${props.maxX - props.minX + 1}×${props.maxY - props.minY + 1}。`,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 用户交互标注",
                    graph: conceptGridSvg(previewModel, { box: previewBox, seeds: previewSeedMarks, activeCells: previewModel.cells.filter((cell) => {
                        const denseX = Math.round((cell.x / Math.max(1, previewModel.cols - 1)) * (model.cols - 1));
                        const denseY = Math.round((cell.y / Math.max(1, previewModel.rows - 1)) * (model.rows - 1));
                        return insideBox(model.cells[denseY * model.cols + denseX]);
                    }).map((cell) => cell.index), caption: "drag box, then add optional FG/BG seeds" }),
                    matrix: metricCards([["box", `[${box.x0},${box.y0}] - [${box.x1},${box.y1}]`], ["FG seeds", String(fgUserSeeds.length)], ["BG seeds", String(bgUserSeeds.length)], ["next", "learn colors"]]),
                    detail: noteRows([["初始化", "矩形框决定 probable foreground 范围；画笔种子会作为强约束进入图割。"]]),
                    stageNote: "在输入图上直接拖拽框选，或用前景/背景笔补充种子，GrabCut 会按这些交互输入重新提取前景。",
                    showcase: {
                        model,
                        labels: model.cells.map((cell) => insideBox(cell)),
                        box,
                        seeds: userSeedMarks,
                        interactive: "grabcut",
                        title: "GrabCut Step 1：交互标注",
                        caption: `矩形框 + ${fgUserSeeds.length} 个前景种子 + ${bgUserSeeds.length} 个背景种子将作为本次图割约束。`,
                        alpha: 0.58,
                    },
                },
                ...snapshots.map((snapshot) => ({
                    phase: snapshot.iter === 1 ? "feature" : snapshot.iter < snapshots.length ? "update" : "map",
                    title: `2. 第 ${snapshot.iter} 轮：颜色模型与图割更新`,
                    graph: conceptGridSvg(previewModel, {
                        labels: downsampleLabels(model, snapshot.labels, previewModel),
                        box: previewBox,
                        cutEdges: cutEdgesFromLabels(previewModel, downsampleLabels(model, snapshot.labels, previewModel)),
                        caption: `iteration ${snapshot.iter}: dense pixel mask is refined`,
                    }),
                    matrix: barsHtml([
                        { label: "FG model", value: 1, color: "#f97316", note: rgbText(snapshot.fgMean) },
                        { label: "BG model", value: 1, color: "#60a5fa", note: rgbText(snapshot.bgMean) },
                        { label: "boundary", value: snapshot.cutEdges.length, color: "#ef4444", note: `${snapshot.cutEdges.length} edges` },
                    ]),
                    detail: metricCards([
                        ["iter", String(snapshot.iter)],
                        ["fg cells", String(snapshot.labels.filter(Boolean).length)],
                        ["cut edges", String(snapshot.cutEdges.length)],
                        ["model", "GMM K=5"],
                    ]),
                    stageNote: "每轮先拟合 FG/BG 的 GMM 颜色模型，再用 max-flow/min-cut 全局优化二值标签。",
                    showcase: {
                        model,
                        labels: snapshot.labels,
                        box,
                        seeds: userSeedMarks,
                        interactive: "grabcut",
                        cutEdges: snapshot.cutEdges,
                        title: `GrabCut Step 2：第 ${snapshot.iter} 轮 mask`,
                        caption: `本轮前景 ${snapshot.labels.filter(Boolean).length} 个像素采样点，边界 ${snapshot.cutEdges.length} 条。`,
                    },
                })),
                {
                    phase: "stats",
                    title: "3. 输出前景 mask 与区域属性",
                    graph: conceptGridSvg(previewModel, { labels: finalPreviewLabels, box: previewBox, bboxes: [{ ...computeMaskProps(previewModel.cells, previewModel.cols, previewModel.rows, finalPreviewLabels), label: 1, name: "FG bbox", color: "#f97316" }], caption: "final dense alpha mask + bounding box" }),
                    matrix: metricCards(metrics),
                    detail: noteRows([
                        ["前景提取", `最终前景覆盖 ${props.count}/${model.cells.length} 个网格。`],
                        ["后续用途", "这个二值 mask 可以继续用于透明背景、目标裁剪或区域统计。"],
                    ]),
                    stageNote: "最终的前景 mask 是一个二值 label map，能直接继续做面积、bbox 和轮廓测量。",
                    showcase: {
                        model,
                        labels: final.labels,
                        box,
                        seeds: userSeedMarks,
                        interactive: "grabcut",
                        bboxes: [{ ...props, label: 1, name: "FG bbox", color: "#f97316" }],
                        title: "GrabCut Step 3：最终前景 mask",
                        caption: `最终前景覆盖 ${props.count}/${model.cells.length} 格，bbox ${props.maxX - props.minX + 1}×${props.maxY - props.minY + 1}。`,
                    },
                },
            ],
        };
    }

    function gradientForModel(model) {
        // 先生成原始高程梯度
        const rawGrad = model.cells.map((cell, index) => {
            const diffs = neighborIndexes(index, model.cols, model.rows).map((next) => Math.abs(cell.gray - model.cells[next].gray) / 255);
            return diffs.reduce((sum, value) => sum + value, 0) / Math.max(1, diffs.length);
        });

        // 依据分辨率网格宽度自适应计算平滑次数，对齐尺度空间
        const passes = Math.max(3, Math.round(model.cols * 0.04));
        let smoothed = [...rawGrad];
        for (let k = 0; k < passes; k++) {
            const temp = new Float32Array(smoothed.length);
            for (let i = 0; i < smoothed.length; i++) {
                const neighbors = neighborIndexes(i, model.cols, model.rows);
                let sum = smoothed[i] * 1.5; // 当前元素加权
                let count = 1.5;
                neighbors.forEach((next) => {
                    sum += smoothed[next];
                    count++;
                });
                temp[i] = sum / count;
            }
            smoothed = Array.from(temp);
        }

        // 归一化并小幅提升拉伸对比度
        const max = Math.max(...smoothed) || 1;
        const min = Math.min(...smoothed) || 0;
        return smoothed.map((v) => {
            const norm = (v - min) / (max - min || 1);
            // 压低谷底、拔高山顶
            return Math.pow(norm, 1.25);
        });
    }

    function buildWatershedCore(model = buildSampleGrid(30, 20)) {
        const gradient = gradientForModel(model);
        const markerDefs = [
            { x: 0.25, y: 0.64, label: 1, text: "1", type: "fg" },
            { x: 0.70, y: 0.44, label: 2, text: "2", type: "fg" },
            { x: 0.08, y: 0.12, label: 3, text: "B1", type: "bg" },
            { x: 0.92, y: 0.88, label: 4, text: "B2", type: "bg" },
        ];
        const markers = markerDefs.map((marker) => ({
            ...marker,
            index: nearestCellIndex(model.cells, model.cols, model.rows, marker.x, marker.y),
        }));
        const labels = new Int16Array(model.cells.length);
        const queued = new Uint8Array(model.cells.length);
        const queue = [];
        const pushQueue = (item) => {
            queue.push(item);
            let index = queue.length - 1;
            while (index > 0) {
                const parent = Math.floor((index - 1) / 2);
                if (queue[parent].priority <= queue[index].priority) break;
                [queue[parent], queue[index]] = [queue[index], queue[parent]];
                index = parent;
            }
        };
        const popQueue = () => {
            if (queue.length === 1) return queue.pop();
            const top = queue[0];
            queue[0] = queue.pop();
            let index = 0;
            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;
                if (left < queue.length && queue[left].priority < queue[smallest].priority) smallest = left;
                if (right < queue.length && queue[right].priority < queue[smallest].priority) smallest = right;
                if (smallest === index) break;
                [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
                index = smallest;
            }
            return top;
        };
        const pushNeighbors = (index) => {
            neighborIndexes(index, model.cols, model.rows).forEach((next) => {
                if (labels[next] !== 0 || queued[next]) return;
                queued[next] = 1;
                pushQueue({ index: next, priority: gradient[next] });
            });
        };
        markers.forEach((marker) => {
            labels[marker.index] = marker.label;
            pushNeighbors(marker.index);
        });
        const snapshots = [{ processed: 0, labels: new Int16Array(labels), frontier: markers.map((marker) => marker.index) }];
        const targets = [0.18, 0.42, 0.68, 1];
        let targetIndex = 0;
        let processed = 0;
        while (queue.length) {
            const current = popQueue();
            if (labels[current.index] !== 0) continue;
            const neighborLabels = [...new Set(neighborIndexes(current.index, model.cols, model.rows)
                .map((next) => labels[next])
                .filter((label) => label > 0))];
            labels[current.index] = neighborLabels.length > 1 ? -1 : (neighborLabels[0] || 3);
            processed += 1;
            pushNeighbors(current.index);
            const ratio = processed / model.cells.length;
            if (targetIndex < targets.length && ratio >= targets[targetIndex]) {
                snapshots.push({ processed, labels: new Int16Array(labels), frontier: [current.index] });
                targetIndex += 1;
            }
        }
        if (snapshots[snapshots.length - 1].processed !== processed) {
            snapshots.push({ processed, labels: new Int16Array(labels), frontier: [] });
        }
        return { model, gradient, markers, labels: Array.from(labels), snapshots };
    }

    function propsFromLabelMap(model, labels) {
        const props = new Map();
        labels.forEach((label, index) => {
            if (label <= 0) return;
            const cell = model.cells[index];
            if (!props.has(label)) {
                props.set(label, { label, count: 0, minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y, perimeter: 0 });
            }
            const item = props.get(label);
            item.count += 1;
            item.minX = Math.min(item.minX, cell.x);
            item.minY = Math.min(item.minY, cell.y);
            item.maxX = Math.max(item.maxX, cell.x);
            item.maxY = Math.max(item.maxY, cell.y);
            neighborIndexes(index, model.cols, model.rows).forEach((next) => {
                if (labels[next] !== label) item.perimeter += 1;
            });
        });
        return [...props.values()].map((item) => ({
            ...item,
            ratio: item.count / labels.length,
            color: labelFill(item.label),
            name: `label ${item.label}`,
        }));
    }

    function downsampleDenseToCore(denseCore, coreModel) {
        const dModel = denseCore.model;
        const cModel = coreModel;
        const dCols = dModel.cols;
        const dRows = dModel.rows;
        const cCols = cModel.cols;
        const cRows = cModel.rows;

        const cGradient = new Float32Array(cCols * cRows);
        const cLabels = new Int16Array(cCols * cRows);

        for (let gy = 0; gy < cRows; gy++) {
            const dy0 = Math.floor((gy / cRows) * dRows);
            const dy1 = Math.max(dy0 + 1, Math.floor(((gy + 1) / cRows) * dRows));
            for (let gx = 0; gx < cCols; gx++) {
                const dx0 = Math.floor((gx / cCols) * dCols);
                const dx1 = Math.max(dx0 + 1, Math.floor(((gx + 1) / cCols) * dCols));

                let gradMax = 0;
                const labelCounts = {};

                for (let dy = dy0; dy < dy1; dy++) {
                    for (let dx = dx0; dx < dx1; dx++) {
                        const dIndex = dy * dCols + dx;
                        const gVal = denseCore.gradient[dIndex] ?? 0;
                        if (gVal > gradMax) {
                            gradMax = gVal;
                        }

                        const dLabel = denseCore.labels[dIndex];
                        if (dLabel !== undefined) {
                            labelCounts[dLabel] = (labelCounts[dLabel] || 0) + 1;
                        }
                    }
                }

                cGradient[gy * cCols + gx] = gradMax;

                let maxLabel = 0;
                let maxCount = -1;
                Object.entries(labelCounts).forEach(([lbl, count]) => {
                    const lVal = parseInt(lbl);
                    let score = count;
                    if (lVal > 0) score += 1000;
                    if (lVal === -1) score += 100;
                    if (score > maxCount) {
                        maxCount = score;
                        maxLabel = lVal;
                    }
                });
                cLabels[gy * cCols + gx] = maxLabel;
            }
        }

        const cMarkers = denseCore.markers.map(m => {
            const index = nearestCellIndex(cModel.cells, cCols, cRows, m.x, m.y);
            return { ...m, index };
        });

        const cSnapshots = denseCore.snapshots.map(denseSnap => {
            const snapLabels = new Int16Array(cCols * cRows);
            for (let gy = 0; gy < cRows; gy++) {
                const dy0 = Math.floor((gy / cRows) * dRows);
                const dy1 = Math.max(dy0 + 1, Math.floor(((gy + 1) / cRows) * dRows));
                for (let gx = 0; gx < cCols; gx++) {
                    const dx0 = Math.floor((gx / cCols) * dCols);
                    const dx1 = Math.max(dx0 + 1, Math.floor(((gx + 1) / cCols) * dCols));

                    const counts = {};
                    for (let dy = dy0; dy < dy1; dy++) {
                        for (let dx = dx0; dx < dx1; dx++) {
                            const dIndex = dy * dCols + dx;
                            const dLabel = denseSnap.labels[dIndex];
                            if (dLabel !== undefined) {
                                counts[dLabel] = (counts[dLabel] || 0) + 1;
                            }
                        }
                    }

                    let maxLabel = 0;
                    let maxCount = -1;
                    Object.entries(counts).forEach(([lbl, count]) => {
                        const lVal = parseInt(lbl);
                        let score = count;
                        if (lVal > 0) score += 1000;
                        if (lVal === -1) score += 100;
                        if (score > maxCount) {
                            maxCount = score;
                            maxLabel = lVal;
                        }
                    });
                    snapLabels[gy * cCols + gx] = maxLabel;
                }
            }
            return {
                processed: Math.round(denseSnap.processed * (cCols * cRows) / (dCols * dRows)),
                labels: snapLabels,
                frontier: denseSnap.frontier.map(dIdx => {
                    const dx = dIdx % dCols;
                    const dy = Math.floor(dIdx / dCols);
                    const cx = clamp(Math.round((dx / dCols) * (cCols - 1)), 0, cCols - 1);
                    const cy = clamp(Math.round((dy / dRows) * (cRows - 1)), 0, cRows - 1);
                    return cy * cCols + cx;
                })
            };
        });

        return {
            model: cModel,
            gradient: Array.from(cGradient),
            markers: cMarkers,
            labels: Array.from(cLabels),
            snapshots: cSnapshots
        };
    }

    function buildWatershedDemo() {
        const denseCore = buildWatershedCore(buildPixelModel(120, 48, 32));
        const core = downsampleDenseToCore(denseCore, buildSampleGrid(30, 20));
        const gradientScores = core.gradient.map((value) => value * 2 - 1);
        const denseGradientScores = denseCore.gradient.map((value) => value * 2 - 1);
        const props = propsFromLabelMap(core.model, core.labels);
        const denseProps = propsFromLabelMap(denseCore.model, denseCore.labels);
        const boundaryCount = core.labels.filter((label) => label === -1).length;
        const denseBoundaryCount = denseCore.labels.filter((label) => label === -1).length;
        return {
            stepperKind: "watershed",
            status: "Watershed Algorithm",
            activeMethod: "Watershed",
            stageTitle: "当前实验模式：Watershed 分水岭",
            stripFeature: "gradient + markers",
            stripK: `${denseCore.model.cells.length} px samples`,
            stripOutput: "boundary + label map",
            regionCount: String(denseProps.length),
            formulaLabel: "Watershed",
            formula: "\\text{markers flood low-gradient basins until fronts meet}",
            formulaNote: "页面把当前图像的梯度当作地形高度，marker 从低阻力区域扩张，相遇处形成分水岭边界。",
            notes: [
                ["梯度地形", "颜色变化越大，梯度越高，越可能成为边界。"],
                ["Marker", "前景/背景种子给出确定起点，未知区域等待扩张竞争。"],
                ["Flooding", "低梯度位置先被占领，不同标签相遇时标记为边界。"],
                ["Label map", "除边界外，每个网格得到一个区域 id。"],
            ],
            showcase: {
                model: denseCore.model,
                labels: denseCore.labels,
                title: "Watershed 分水岭 label map",
                caption: `红色为分水岭边界，其余颜色为区域 label；dense 输出共 ${denseProps.length} 个区域，边界 ${denseBoundaryCount} 格。`,
                alpha: 0.72,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 梯度图：把图像看成地形",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, caption: "orange ridges have higher gradient" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, caption: "orange ridges have higher gradient" },
                    matrix: barsHtml(core.gradient.slice(0, 10).map((value, index) => ({ label: `g${index + 1}`, value, color: "#f97316", note: value.toFixed(2) }))),
                    detail: metricCards([["grid", `${core.model.cols}×${core.model.rows}`], ["cue", "color gradient"], ["low areas", "flood first"], ["ridges", "boundary candidates"]]),
                    stageNote: "分水岭把梯度图想象成地形：水从低处扩张，山脊就是分界线。",
                    showcase: {
                        model: denseCore.model,
                        scores: denseGradientScores,
                        title: "Watershed Step 1：梯度地形图",
                        caption: "偏橙区域代表高梯度山脊，后续更容易成为分水岭边界。",
                        alpha: 0.74,
                    },
                },
                {
                    phase: "feature",
                    title: "2. 设置前景/背景 marker",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, seeds: core.markers, caption: "markers seed the flood basins" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, seeds: core.markers, caption: "markers seed the flood basins" },
                    matrix: metricCards([["FG markers", "label 1 / label 2"], ["BG markers", "label 3"], ["unknown", "all unlabeled cells"], ["next", "priority flood"]]),
                    detail: noteRows([["Marker 约束", "没有 marker 的像素不会立刻分类，而是等待相邻标签扩张。"]]),
                    stageNote: "marker 是分水岭算法的锚点，决定哪些盆地从哪里开始扩张。",
                    showcase: {
                        model: denseCore.model,
                        labels: seedStageLabels(denseCore.model, denseCore.markers),
                        seeds: denseCore.markers,
                        title: "Watershed Step 2：前景/背景 marker",
                        caption: "marker 是扩张起点；未知区域将在后续由优先队列竞争决定标签。",
                        alpha: 0.52,
                    },
                },
                ...core.snapshots.slice(1).map((snapshot, index) => {
                    const denseSnapshot = denseCore.snapshots[Math.min(index + 1, denseCore.snapshots.length - 1)];
                    const denseRatio = denseSnapshot ? Math.round((denseSnapshot.processed / denseCore.model.cells.length) * 100) : 100;
                    return {
                        phase: index < 2 ? "assign" : index < 3 ? "update" : "map",
                        title: `3. Flooding 扩张 ${Math.round((snapshot.processed / core.model.cells.length) * 100)}%`,
                        graph: conceptGridSvg(core.model, { scores: gradientScores, labels: Array.from(snapshot.labels), activeCells: snapshot.frontier, seeds: core.markers, caption: "red cells mark watershed boundaries" }),
                        graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: Array.from(snapshot.labels), activeCells: snapshot.frontier, seeds: core.markers, caption: "red cells mark watershed boundaries" },
                        matrix: metricCards([["processed", `${snapshot.processed}/${core.model.cells.length}`], ["frontier", snapshot.frontier.length ? `cell ${snapshot.frontier[0] + 1}` : "done"], ["boundary rule", "labels meet"], ["queue", "low gradient first"]]),
                        detail: barsHtml(props.map((prop) => ({ label: `label ${prop.label}`, value: prop.count, color: prop.color, note: `${Math.round(prop.ratio * 100)}% final` }))),
                        stageNote: "扩张前沿遇到不同标签时，不再强行归类，而是留下红色分水岭边界。",
                        showcase: {
                            model: denseCore.model,
                            labels: Array.from(denseSnapshot?.labels || denseCore.labels),
                            seeds: denseCore.markers,
                            activeCells: denseSnapshot?.frontier || [],
                            title: `Watershed Step 3：dense 扩张 ${denseRatio}%`,
                            caption: "橙色描边是当前扩张前沿；红色区域是不同标签相遇后形成的边界。",
                            alpha: 0.72,
                        },
                    };
                }),
                {
                    phase: "stats",
                    title: "4. Watershed label map",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, labels: core.labels, seeds: core.markers, caption: "final watershed labels and boundary" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: core.labels, seeds: core.markers, caption: "final watershed labels and boundary" },
                    matrix: metricCards([["labels", String(props.length)], ["boundary", `${boundaryCount} cells`], ["largest", `${Math.max(...props.map((prop) => prop.count))} cells`], ["output", "region id map"]]),
                    detail: `${regionPieChartSvg(props)}${regionStatCards(props)}`,
                    stageNote: "最终结果是一个 label map：边界为红色，其余网格保存区域编号。",
                    showcase: {
                        model: denseCore.model,
                        labels: denseCore.labels,
                        seeds: denseCore.markers,
                        title: "Watershed Step 4：最终 label map",
                        caption: `红色为分水岭边界，其余颜色为 dense 区域 label；共 ${denseProps.length} 个区域。`,
                        alpha: 0.72,
                    },
                },
            ],
        };
    }

    function connectedComponents(model, labels) {
        const visited = new Uint8Array(labels.length);
        const compLabels = new Int16Array(labels.length);
        const props = [];
        let compId = 0;
        labels.forEach((label, start) => {
            if (label <= 0 || visited[start]) return;
            compId += 1;
            const queue = [start];
            visited[start] = 1;
            compLabels[start] = compId;
            const cells = [];
            while (queue.length) {
                const index = queue.shift();
                cells.push(index);
                neighborIndexes(index, model.cols, model.rows).forEach((next) => {
                    if (visited[next] || labels[next] !== label) return;
                    visited[next] = 1;
                    compLabels[next] = compId;
                    queue.push(next);
                });
            }
            let minX = model.cols;
            let minY = model.rows;
            let maxX = 0;
            let maxY = 0;
            let perimeter = 0;
            cells.forEach((index) => {
                const cell = model.cells[index];
                minX = Math.min(minX, cell.x);
                minY = Math.min(minY, cell.y);
                maxX = Math.max(maxX, cell.x);
                maxY = Math.max(maxY, cell.y);
                neighborIndexes(index, model.cols, model.rows).forEach((next) => {
                    if (compLabels[next] !== compId) perimeter += 1;
                });
            });
            props.push({
                label: compId,
                sourceLabel: label,
                count: cells.length,
                ratio: cells.length / labels.length,
                minX,
                minY,
                maxX,
                maxY,
                perimeter,
                cells,
                color: labelFill(compId),
                name: `label ${compId}`,
            });
        });
        return { compLabels: Array.from(compLabels), props: props.sort((a, b) => b.count - a.count).slice(0, 5) };
    }

    function buildRegionsDemo() {
        const denseCore = buildWatershedCore(buildPixelModel(120, 48, 32));
        const core = downsampleDenseToCore(denseCore, buildSampleGrid(30, 20));
        const gradientScores = core.gradient.map((value) => value * 2 - 1);
        const components = connectedComponents(core.model, core.labels);
        const denseComponents = connectedComponents(denseCore.model, denseCore.labels);
        const props = components.props;
        const denseProps = denseComponents.props;
        const scanCells = props[0]?.cells.slice(0, Math.max(1, Math.round((props[0]?.cells.length || 1) * 0.5))) || [];
        const denseScanCells = denseProps[0]?.cells.slice(0, Math.min(120, Math.max(1, Math.round((denseProps[0]?.cells.length || 1) * 0.18)))) || [];
        return {
            stepperKind: "regions",
            status: "Region Properties",
            activeMethod: "区域属性",
            stageTitle: "当前实验模式：区域属性 label map",
            stripFeature: "connected labels",
            stripK: `${denseProps.length} regions`,
            stripOutput: "area / bbox / contour",
            regionCount: String(denseProps.length),
            formulaLabel: "Region Properties",
            formula: "\\text{area}=\\text{count}(\\text{label}),\\; \\text{bbox}=\\min/\\max(x,y),\\; \\text{contour}=\\text{count}(\\text{boundary edges})",
            formulaNote: "区域属性不是人工填写的说明，而是从 label map 中扫描、连通域编号和边界计数得到的数据。",
            notes: [
                ["Label map", "每个像素或网格保存一个整数区域 id。"],
                ["连通域扫描", "同一 label 且空间相邻的像素合成一个 region。"],
                ["bbox", "记录区域像素 x/y 的最小值与最大值。"],
                ["contour", "统计与其他 label 相邻或接触图像边界的边。"],
            ],
            showcase: {
                model: denseCore.model,
                labels: denseComponents.compLabels,
                title: "区域属性 label map",
                caption: `彩色区域是 dense 连通域编号后的 label map；已计算 ${denseProps.length} 个区域的 area、bbox 和 contour。`,
                alpha: 0.72,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 输入 label map",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, labels: core.labels, caption: "watershed output becomes the region-label input" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: core.labels, caption: "watershed output becomes the region-label input" },
                    matrix: metricCards([["source", "watershed labels"], ["boundary", "ignored for area"], ["task", "measure regions"], ["data type", "integer map"]]),
                    detail: noteRows([["关键点", "label map 是结构化数据，不只是彩色可视化图。"]]),
                    stageNote: "区域属性分析从 label map 开始：每个网格都有自己的整数标签。",
                    showcase: {
                        model: denseCore.model,
                        labels: denseCore.labels,
                        title: "Region Step 1：输入 label map",
                        caption: "这是 dense 分水岭输出的整数标签图，区域属性计算从这里开始。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "feature",
                    title: "2. 连通域扫描与重新编号",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, labels: components.compLabels, activeCells: scanCells, caption: "connected components receive compact ids" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: components.compLabels, activeCells: scanCells, caption: "connected components receive compact ids" },
                    matrix: barsHtml(denseProps.map((prop) => ({ label: `label ${prop.label}`, value: prop.count, color: prop.color, note: `${prop.count} px` }))),
                    detail: metricCards([["components", String(denseProps.length)], ["largest", `${denseProps[0]?.count || 0} px`], ["scan", "BFS/DFS"], ["renumber", "compact ids"]]),
                    stageNote: "扫描时只把同 label 且相邻的网格归为同一区域，离散小块会成为单独 region。",
                    showcase: {
                        model: denseCore.model,
                        labels: denseComponents.compLabels,
                        activeCells: denseScanCells,
                        title: "Region Step 2：连通域扫描",
                        caption: "橙色描边展示正在扫描的连通区域，扫描后会重新编号为紧凑 label id。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "assign",
                    title: "3. 面积 area 与 mask ratio",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, labels: components.compLabels, caption: "area = count(label id)" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: components.compLabels, caption: "area = count(label id)" },
                    matrix: barsHtml(denseProps.map((prop) => ({ label: `label ${prop.label}`, value: prop.ratio, color: prop.color, note: `${Math.round(prop.ratio * 100)}%` }))),
                    detail: noteRows(denseProps.map((prop) => [`label ${prop.label}`, `area=${prop.count}, mask ratio=${Math.round(prop.ratio * 100)}%`])),
                    stageNote: "面积就是该 label 覆盖的网格数量，mask ratio 是它占整幅图的比例。",
                    showcase: {
                        model: denseCore.model,
                        labels: denseComponents.compLabels,
                        title: "Region Step 3：面积与占比",
                        caption: "彩色面积直接对应每个 label 的像素计数与 mask ratio。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "update",
                    title: "4. BBox 与轮廓边界",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, labels: components.compLabels, bboxes: props, caption: "dashed boxes are min/max coordinate bounds" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: components.compLabels, bboxes: props, caption: "dashed boxes are min/max coordinate bounds" },
                    matrix: noteRows(denseProps.map((prop) => [`label ${prop.label}`, `bbox ${prop.maxX - prop.minX + 1}×${prop.maxY - prop.minY + 1}, contour ${prop.perimeter}`])),
                    detail: metricCards([["bbox rule", "min/max x,y"], ["contour rule", "neighbor differs"], ["shape cue", "perimeter/area"], ["output", "region table"]]),
                    stageNote: "bbox 来自坐标极值，轮廓长度来自边界邻接关系。",
                    showcase: {
                        model: denseCore.model,
                        labels: denseComponents.compLabels,
                        bboxes: denseProps,
                        activeCells: denseProps.flatMap((prop) => prop.cells.slice(0, 2)),
                        title: "Region Step 4：bbox 与轮廓",
                        caption: "区域轮廓来自相邻 label 变化，bbox 来自该区域坐标的最小/最大值。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "stats",
                    title: "5. 区域属性表",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, labels: components.compLabels, bboxes: props, caption: "label map + measured properties" }),
                    graphOptions: { type: "3d", model: core.model, scores: gradientScores, labels: components.compLabels, bboxes: props, caption: "label map + measured properties" },
                    matrix: `${regionPieChartSvg(denseProps)}${regionStatCards(denseProps)}`,
                    detail: metricCards([["regions", String(denseProps.length)], ["largest ratio", `${Math.round((denseProps[0]?.ratio || 0) * 100)}%`], ["computed", "area / bbox / contour"], ["ready for", "filtering or grading"]]),
                    stageNote: "最终输出就是可用于筛选、排序、评价的区域属性表。",
                    showcase: {
                        model: denseCore.model,
                        labels: denseComponents.compLabels,
                        bboxes: denseProps,
                        title: "Region Step 5：最终区域属性结果",
                        caption: `已从 dense label map 中计算 ${denseProps.length} 个区域的 area、bbox、contour 与 mask ratio。`,
                        alpha: 0.72,
                    },
                },
            ],
        };
    }

    function shortFrameTitle(title, index) {
        return String(title || `Step ${index + 1}`)
            .replace(/^\d+\.\s*/, "")
            .replace(/^Graph Cut\s*/i, "")
            .replace(/^GrabCut\s*/i, "")
            .replace(/^Watershed\s*/i, "")
            .replace(/^Region\s*/i, "");
    }

    function drawFramePreview(canvas, frame) {
        const showcase = frame.showcase || state.concept?.showcase;
        if (!canvas || !showcase) return;
        const source = document.createElement("canvas");
        const mask = document.createElement("canvas");
        const meta = drawShowcaseCanvases(showcase, source, mask, {
            showInputMarks: false,
            showMaskSeeds: false,
        });
        if (!meta) return;
        canvas.width = 132;
        canvas.height = 82;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    }

    function updateConceptFrameStrip() {
        document.querySelectorAll("[data-segb-frame-strip]").forEach(strip => {
            strip.querySelectorAll("[data-segb-frame-index]").forEach((button) => {
                button.classList.toggle("is-active", Number(button.dataset.segbFrameIndex) === state.conceptFrameIndex);
            });
        });
    }

    function renderConceptFrameStrip(config) {
        const strips = document.querySelectorAll("[data-segb-frame-strip]");
        if (strips.length === 0) return;
        const frames = config.frames || [];

        strips.forEach(strip => {
            strip.innerHTML = frames.map((frame, index) => `
                <button type="button" data-segb-frame-index="${index}" title="${escapeHtml(frame.title || `Step ${index + 1}`)}">
                    <canvas width="132" height="82" aria-hidden="true"></canvas>
                    <span>${index + 1}</span>
                    <strong>${escapeHtml(shortFrameTitle(frame.title, index))}</strong>
                </button>
            `).join("");

            strip.querySelectorAll("[data-segb-frame-index]").forEach((button) => {
                const index = Number(button.dataset.segbFrameIndex);
                const canvas = button.querySelector("canvas");
                drawFramePreview(canvas, frames[index]);
                button.addEventListener("click", () => {
                    stopAnimation();
                    if (state.result?.snapshots?.length && config.stepperKind === "kmeans") {
                        renderKMeansStep(index);
                    } else {
                        renderConceptFrame(index);
                    }
                });
            });
        });
        updateConceptFrameStrip();
    }

    function renderKMeansStep(index) {
        if (!state.result?.snapshots?.length || !state.concept?.frames?.length) return;
        const frames = state.concept.frames;
        const frame = frames[clamp(index, 0, frames.length - 1)];
        state.kmeansFrameIndex = frames.indexOf(frame);
        state.conceptFrameIndex = state.kmeansFrameIndex;
        const phase = frame.phase || "stats";
        const snapshotIndex = snapshotIndexForKMeansPhase(phase, state.result);
        const payload = renderKMeansResult(snapshotIndex, phase);
        if (!payload) return;
        setKMeansState({
            currentStep: state.kmeansFrameIndex,
            currentIteration: state.currentSnapshot,
            kValue: state.k,
            iterationCount: state.maxIter,
        }, "timeline-click");
        renderKMeansStepFocus(frame, payload.result, payload.snapshot, payload.stats);
        updateConceptFrameStrip();
    }

    function renderConceptFrame(index) {
        if (!state.concept?.frames?.length) return;
        const frames = state.concept.frames;
        const frame = frames[clamp(index, 0, frames.length - 1)];
        state.conceptFrameIndex = frames.indexOf(frame);

        // 3D 地形图过渡动画
        const isWatershedOrRegion = state.concept.stepperKind === "watershed" || state.concept.stepperKind === "regions";
        const has3D = isWatershedOrRegion && frame.graphOptions;

        if (has3D) {
            const svgEl = els.graphStage.querySelector(".is-3d-terrain");
            if (svgEl && state.last3DOptions && state.last3DModel === frame.graphOptions.model) {
                // 更新卡片标题与文字
                const h4 = els.graphStage.querySelector("h4");
                const p = els.graphStage.querySelector("p");
                if (h4) h4.textContent = frame.title;
                if (p) {
                    p.textContent = frame.stageNote || "";
                    p.style.display = frame.stageNote ? "" : "none";
                }
                
                // 执行 Z 轴高度与颜色的插值过渡动画
                animateWatershed3D(frame.graphOptions.model, state.last3DOptions, frame.graphOptions);
                state.last3DOptions = frame.graphOptions;
            } else {
                // 第一次渲染，直书 HTML
                els.graphStage.innerHTML = conceptCard(frame.title, frame.graph, frame.stageNote);
                state.last3DOptions = frame.graphOptions;
                state.last3DModel = frame.graphOptions.model;
            }
        } else {
            // 普通图像/图形式的 2D 切换
            els.graphStage.innerHTML = conceptCard(frame.title, frame.graph, frame.stageNote);
            state.last3DOptions = null;
            state.last3DModel = null;
        }

        let matrixTitle = "算法中间量";
        let detailTitle = "输出解释";
        if (state.concept?.stepperKind === "watershed") {
            matrixTitle = "分割度量结果";
            detailTitle = "区域属性统计";
        } else if (state.concept?.stepperKind === "regions") {
            matrixTitle = "区域特征列表";
            detailTitle = "区域指标总览";
        } else if (state.concept?.stepperKind === "graph") {
            matrixTitle = "图结构与边权";
            detailTitle = "割集结果与能耗";
        } else if (state.concept?.stepperKind === "grabcut") {
            matrixTitle = "高斯混合模型 (GMM)";
            detailTitle = "掩膜优化与指标";
        }
        els.matrixStage.innerHTML = conceptCard(matrixTitle, frame.matrix);
        els.conceptDetail.innerHTML = conceptCard(detailTitle, frame.detail);
        els.currentIter.textContent = `${state.conceptFrameIndex + 1} / ${frames.length}`;
        els.stripIter.textContent = `${state.conceptFrameIndex + 1}`;
        const meta = teachingMeta(state.concept, frame);
        els.formula.innerHTML = renderLatexFormula(meta.latex);
        els.formulaNote.textContent = meta.principle;
        els.notes.innerHTML = renderProcessNotes(state.concept, frame);
        
        // 渲染右上图效果（支持透明度渐变过渡）
        if (frame.showcase) {
            animateShowcaseTransition(frame.showcase);
        } else {
            drawConceptShowcase(state.concept.showcase);
        }

        setPhase(frame.phase || "map");
        updateConceptFrameStrip();
    }

    function syncKMeansFrameStrip(phase) {
        if (!state.concept?.frames?.length) return;
        const index = state.concept.frames.findIndex((frame) => frame.phase === phase);
        state.conceptFrameIndex = index >= 0 ? index : state.concept.frames.length - 1;
        state.kmeansFrameIndex = state.conceptFrameIndex;
        updateConceptFrameStrip();
    }

    function renderAlgorithmConcept(config) {
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        state.concept = config;
        state.conceptFrameIndex = 0;
        state.last3DOptions = null;
        state.last3DModel = null;
        state.lastShowcaseMethod = null;

        els.kmeansView.hidden = true;
        els.kmeansView.style.setProperty("display", "none", "important");
        els.graphView.hidden = false;
        els.graphView.style.removeProperty("display");
        els.kmeansControls.hidden = true;
        els.status.textContent = config.status;
        els.activeMethod.textContent = config.activeMethod;
        els.currentIter.textContent = "--";
        els.regionCount.textContent = config.regionCount;
        els.time.textContent = "--";
        els.stripMethod.textContent = config.activeMethod;
        els.stripFeature.textContent = config.stripFeature;
        els.stripK.textContent = config.stripK;
        els.stageTitle.textContent = config.stageTitle;
        els.stripOutput.textContent = config.stripOutput;
        els.notesSubtitle.textContent = config.activeMethod;
        els.formulaLabel.textContent = config.formulaLabel;
        els.formula.innerHTML = renderLatexFormula(config.formula);
        els.formulaNote.textContent = config.formulaNote;
        if (els.grabcutToolbar) {
            els.grabcutToolbar.hidden = config.activeMethod !== "GrabCut";
        }
        renderStepper(config.stepperKind);
        const isCompare = state.method === "kmeans-compare";
        if (els.compareView) {
            els.compareView.hidden = !isCompare;
        }
        if (isCompare) {
            if (els.conceptResult) els.conceptResult.hidden = true;
            els.frameStrip.hidden = true;
            els.graphStage.hidden = true;
            els.matrixStage.hidden = true;
            els.conceptDetail.hidden = true;
            renderKMeansCompareSlider(0.5);
            setBusy(false);
            return;
        }
        if (els.conceptResult) els.conceptResult.hidden = false;
        els.frameStrip.hidden = false;
        els.graphStage.hidden = false;
        els.matrixStage.hidden = false;
        els.conceptDetail.hidden = false;
        renderConceptFrameStrip(config);
        renderConceptFrame(0);
        setBusy(false);
        const shouldAutoPlay = !state.skipConceptAutoPlay && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        state.skipConceptAutoPlay = false;
        if (shouldAutoPlay) {
            window.setTimeout(() => {
                if (state.concept === config && !state.playing) playConceptFrames();
            }, 120);
        }
    }

    function playConceptFrames() {
        if (!state.concept?.frames?.length) return;
        if (state.playing) {
            stopAnimation();
            return;
        }
        state.playing = true;
        els.frameStrip?.classList.add("is-playing");
        els.play.textContent = "停止播放";
        let index = 0;
        renderConceptFrame(index);
        state.animationTimer = window.setInterval(() => {
            index += 1;
            if (index >= state.concept.frames.length) {
                stopAnimation();
                renderConceptFrame(state.concept.frames.length - 1);
                return;
            }
            renderConceptFrame(index);
        }, 620);
    }

    function cellFromConceptEvent(event) {
        const model = state.concept?.showcase?.model;
        const canvas = els.conceptSource;
        if (!model || !canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const fit = canvasObjectFitRect(canvas, canvas.width, canvas.height);
        const localX = event.clientX - rect.left - fit.offsetX;
        const localY = event.clientY - rect.top - fit.offsetY;
        const x = clamp(localX / Math.max(1, fit.scaleX * canvas.width), 0, 0.9999);
        const y = clamp(localY / Math.max(1, fit.scaleY * canvas.height), 0, 0.9999);
        const gx = clamp(Math.floor(x * model.cols), 0, model.cols - 1);
        const gy = clamp(Math.floor(y * model.rows), 0, model.rows - 1);
        return { x: gx, y: gy, index: gy * model.cols + gx, model };
    }

    function setGrabCutTool(tool) {
        state.grabcut.tool = tool;
        els.grabcutTools.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.segbGrabcutTool === tool);
        });
    }

    function addGrabCutSeed(index, type, model = state.concept?.showcase?.model) {
        const target = type === "fg" ? state.grabcut.fgSeeds : state.grabcut.bgSeeds;
        const other = type === "fg" ? state.grabcut.bgSeeds : state.grabcut.fgSeeds;
        const indexes = [index];
        if (model) {
            const x = index % model.cols;
            const y = Math.floor(index / model.cols);
            const radius = 1;
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (dx * dx + dy * dy > radius * radius) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= model.cols || ny < 0 || ny >= model.rows) continue;
                    indexes.push(ny * model.cols + nx);
                }
            }
        }
        indexes.forEach((seedIndex) => {
            if (!target.includes(seedIndex)) target.push(seedIndex);
            const otherIndex = other.indexOf(seedIndex);
            if (otherIndex >= 0) other.splice(otherIndex, 1);
        });
    }

    function rerunGrabCutFromInteraction() {
        if (state.method !== "grabcut") return;
        state.skipConceptAutoPlay = true;
        renderGrabCut();
    }

    function resetGrabCutState() {
        state.grabcut.box = null;
        state.grabcut.fgSeeds = [];
        state.grabcut.bgSeeds = [];
        state.grabcut.draftBox = null;
        state.grabcut.dragging = false;
        state.grabcut.dragStart = null;
    }

    function setupGrabCutInteraction() {
        els.grabcutTools.forEach((button) => {
            button.addEventListener("click", () => setGrabCutTool(button.dataset.segbGrabcutTool));
        });
        els.grabcutReset?.addEventListener("click", () => {
            resetGrabCutState();
            setGrabCutTool("box");
            rerunGrabCutFromInteraction();
        });
        if (!els.conceptSource) return;
        els.conceptSource.addEventListener("pointerdown", (event) => {
            if (state.method !== "grabcut") return;
            const cell = cellFromConceptEvent(event);
            if (!cell) return;
            event.preventDefault();
            els.conceptSource.setPointerCapture?.(event.pointerId);
            state.grabcut.dragging = true;
            state.grabcut.dragStart = cell;
            if (state.grabcut.tool === "box") {
                state.grabcut.draftBox = { x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y };
                drawConceptShowcase(state.concept?.frames?.[state.conceptFrameIndex]?.showcase || state.concept?.showcase);
            } else {
                addGrabCutSeed(cell.index, state.grabcut.tool, cell.model);
                drawConceptShowcase(state.concept?.frames?.[state.conceptFrameIndex]?.showcase || state.concept?.showcase);
            }
        });
        els.conceptSource.addEventListener("pointermove", (event) => {
            if (state.method !== "grabcut" || !state.grabcut.dragging) return;
            const cell = cellFromConceptEvent(event);
            if (!cell) return;
            event.preventDefault();
            if (state.grabcut.tool === "box") {
                const start = state.grabcut.dragStart || cell;
                state.grabcut.draftBox = { x0: start.x, y0: start.y, x1: cell.x, y1: cell.y };
                drawConceptShowcase(state.concept?.frames?.[state.conceptFrameIndex]?.showcase || state.concept?.showcase);
            } else {
                addGrabCutSeed(cell.index, state.grabcut.tool, cell.model);
                drawConceptShowcase(state.concept?.frames?.[state.conceptFrameIndex]?.showcase || state.concept?.showcase);
            }
        });
        const finish = (event) => {
            if (state.method !== "grabcut" || !state.grabcut.dragging) return;
            event.preventDefault();
            state.grabcut.dragging = false;
            if (state.grabcut.tool === "box" && state.grabcut.draftBox) {
                const model = state.concept?.showcase?.model;
                state.grabcut.box = model ? normalizeBox(state.grabcut.draftBox, model) : state.grabcut.draftBox;
                state.grabcut.draftBox = null;
                rerunGrabCutFromInteraction();
            } else if (state.grabcut.tool !== "box") {
                rerunGrabCutFromInteraction();
            }
        };
        els.conceptSource.addEventListener("pointerup", finish);
        els.conceptSource.addEventListener("pointercancel", finish);
        els.conceptSource.addEventListener("pointerleave", finish);
    }

    function playSnapshots() {
        if (!state.result?.snapshots?.length && state.concept?.frames?.length > 1) {
            playConceptFrames();
            return;
        }
        if (!state.result?.snapshots?.length || !state.showIterations) return;
        if (state.playing) {
            stopAnimation();
            return;
        }
        state.playing = true;
        els.frameStrip?.classList.add("is-playing");
        els.play.textContent = "停止播放";
        let index = 0;
        renderKMeansResult(index);
        state.animationTimer = window.setInterval(() => {
            index += 1;
            if (index >= state.result.snapshots.length) {
                stopAnimation();
                renderKMeansResult();
                setPhase("stats");
                return;
            }
            renderKMeansResult(index);
            setPhase(index % 2 ? "update" : "assign");
        }, 520);
    }

    async function runKMeansMode() {
        readControls();
        setBusy(true);
        setPhase("feature");
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const started = performance.now();
        const useXY = state.method === "kmeans-rgbxy";
        if (els.kmeansView) els.kmeansView.dataset.featureMode = useXY ? "rgbxy" : "rgb";
        const config = buildKMeansConcept();
        if (state.method === "kmeans-compare") {
            const elapsed = performance.now() - started;
            els.time.textContent = `${elapsed.toFixed(1)} ms`;
            els.statusText.textContent = "分割完成";
            renderAlgorithmConcept(config);
            return;
        }
        const result = runKMeans(useXY);
        const elapsed = performance.now() - started;
        state.result = result;
        state.compareResult = null;
        state.concept = config;
        state.conceptFrameIndex = 0;
        state.selectedLabel = null;
        els.time.textContent = `${elapsed.toFixed(1)} ms`;
        els.statusText.textContent = "分割完成";

        els.kmeansView.hidden = false;
        els.kmeansView.style.removeProperty("display");
        els.graphView.hidden = true;
        els.graphView.style.setProperty("display", "none", "important");
        els.kmeansControls.hidden = false;
        if (els.conceptResult) els.conceptResult.hidden = true;
        if (els.compareView) els.compareView.hidden = true;
        els.frameStrip.hidden = false;
        els.graphStage.hidden = true;
        els.matrixStage.hidden = true;
        els.conceptDetail.hidden = true;
        els.status.textContent = config.status;
        els.activeMethod.textContent = config.activeMethod;
        els.stripMethod.textContent = config.activeMethod;
        els.stripFeature.textContent = config.stripFeature;
        els.stripK.textContent = config.stripK;
        els.stageTitle.textContent = "从像素到区域：K-means 分割流程";
        els.stripOutput.textContent = "overlay mask";
        els.resultTitle.textContent = "原图 + 半透明分割 mask + 区域边界";
        els.thirdTitle.textContent = useXY ? "RGB + XY 特征空间 / 聚类中心" : "RGB 特征空间 / 聚类中心";
        els.flowFeature.textContent = useXY ? "RGB + XY Feature" : "RGB Feature Space";
        renderStepper(config.stepperKind);
        renderConceptFrameStrip(config);
        renderKMeansStep(0);
        setBusy(false);
    }

    function tinyPixelSvg(mode) {
        const colors = mode === "graph"
            ? ["#22c55e", "#22c55e", "#bfdbfe", "#60a5fa", "#22c55e", "#facc15", "#60a5fa", "#60a5fa", "#fed7aa"]
            : ["#38bdf8", "#38bdf8", "#dbeafe", "#38bdf8", "#f8fafc", "#a78bfa", "#dbeafe", "#a78bfa", "#a78bfa"];
        return `
            <svg class="seg-concept-svg seg-pixel-svg" viewBox="0 0 300 210" role="img" aria-label="small pixel graph">
                <rect x="28" y="24" width="244" height="162" rx="18" fill="#f8fafc" stroke="#dbeafe"/>
                ${colors.map((color, index) => {
                    const x = 68 + (index % 3) * 62;
                    const y = 54 + Math.floor(index / 3) * 46;
                    return `<rect x="${x}" y="${y}" width="38" height="30" rx="8" fill="${color}" stroke="#ffffff" stroke-width="4"/><text x="${x + 19}" y="${y + 20}" text-anchor="middle" class="seg-svg-note">p${index + 1}</text>`;
                }).join("")}
                <text x="150" y="202" text-anchor="middle" class="seg-svg-note">${mode === "graph" ? "small pixel grid as graph nodes" : "nodes grouped by spectral similarity"}</text>
            </svg>
        `;
    }

    function cutResultSvg() {
        return `
            <svg class="seg-concept-svg seg-cut-result-svg" viewBox="0 0 300 210" role="img" aria-label="cut region split">
                <rect x="30" y="26" width="112" height="150" rx="18" fill="#dcfce7" stroke="#86efac"/>
                <rect x="158" y="26" width="112" height="150" rx="18" fill="#dbeafe" stroke="#93c5fd"/>
                <path d="M150 34 C126 70 174 100 150 170" class="seg-cut-edge"/>
                <text x="86" y="104" text-anchor="middle" class="seg-svg-title">Foreground</text>
                <text x="214" y="104" text-anchor="middle" class="seg-svg-title">Background</text>
                <text x="150" y="200" text-anchor="middle" class="seg-svg-note">output: binary region split by cut edges</text>
            </svg>
        `;
    }

    function eigenResultSvg() {
        return `
            <svg class="seg-concept-svg seg-cut-result-svg" viewBox="0 0 300 210" role="img" aria-label="eigenvector split">
                <line x1="42" y1="106" x2="258" y2="106" stroke="#dbeafe" stroke-width="4"/>
                ${[-0.82, -0.55, -0.28, 0.24, 0.57, 0.86].map((v, index) => {
                    const x = 58 + index * 36;
                    const y = 106 - v * 70;
                    const color = v < 0 ? "#38bdf8" : "#a78bfa";
                    return `<line x1="${x}" y1="106" x2="${x}" y2="${y}" stroke="${color}" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="9" fill="${color}" stroke="#ffffff" stroke-width="3"/>`;
                }).join("")}
                <text x="150" y="28" text-anchor="middle" class="seg-svg-title">2nd eigenvector</text>
                <text x="150" y="196" text-anchor="middle" class="seg-svg-note">threshold by sign → two balanced regions</text>
            </svg>
        `;
    }

    function graphCutSvg() {
        return `
            <svg class="seg-concept-svg" viewBox="0 0 520 300" role="img" aria-label="Graph Cut graph">
                <defs>
                    <marker id="segArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748b"/></marker>
                </defs>
                <rect x="18" y="28" width="132" height="232" rx="18" fill="#eff6ff" stroke="#bfdbfe"/>
                <rect x="370" y="28" width="132" height="232" rx="18" fill="#fff7ed" stroke="#fed7aa"/>
                <text x="84" y="55" text-anchor="middle" class="seg-svg-title">Source</text>
                <text x="436" y="55" text-anchor="middle" class="seg-svg-title">Sink</text>
                ${[
                    [235, 72, "p1", "#22c55e"],
                    [295, 102, "p2", "#22c55e"],
                    [218, 170, "p3", "#60a5fa"],
                    [305, 204, "p4", "#60a5fa"],
                    [260, 142, "p5", "#facc15"],
                ].map(([x, y, label, color]) => `<circle cx="${x}" cy="${y}" r="22" fill="${color}" stroke="#ffffff" stroke-width="4"/><text x="${x}" y="${y + 4}" text-anchor="middle">${label}</text>`).join("")}
                <path d="M110 90 C155 70 178 68 213 72" class="seg-edge"/>
                <path d="M110 180 C145 170 170 168 196 170" class="seg-edge"/>
                <path d="M327 102 C365 100 388 90 420 82" class="seg-edge"/>
                <path d="M327 204 C365 210 392 198 420 184" class="seg-edge"/>
                <path d="M256 82 L282 94" class="seg-edge"/>
                <path d="M236 93 L224 149" class="seg-edge"/>
                <path d="M278 122 L267 124" class="seg-cut-edge"/>
                <path d="M273 160 L296 186" class="seg-cut-edge"/>
                <path d="M237 180 L283 196" class="seg-edge"/>
                <text x="168" y="72" class="seg-weight">9.2</text>
                <text x="355" y="94" class="seg-weight">8.7</text>
                <text x="266" y="110" class="seg-cut-label">cut</text>
                <text x="256" y="274" text-anchor="middle" class="seg-svg-note">最小割选择代价最低的边，把图划分为 foreground / background。</text>
            </svg>
        `;
    }

    function ncutSvg() {
        return `
            <svg class="seg-concept-svg" viewBox="0 0 520 300" role="img" aria-label="Normalized Cut graph">
                <rect x="26" y="34" width="468" height="218" rx="22" fill="#f8fafc" stroke="#dbeafe"/>
                ${[
                    [120, 92, "v1", "#38bdf8"],
                    [168, 146, "v2", "#38bdf8"],
                    [122, 202, "v3", "#38bdf8"],
                    [360, 90, "v4", "#a78bfa"],
                    [408, 148, "v5", "#a78bfa"],
                    [360, 206, "v6", "#a78bfa"],
                ].map(([x, y, label, color]) => `<circle cx="${x}" cy="${y}" r="23" fill="${color}" stroke="#ffffff" stroke-width="4"/><text x="${x}" y="${y + 4}" text-anchor="middle">${label}</text>`).join("")}
                <path d="M137 109 L151 129" class="seg-edge strong"/>
                <path d="M168 169 L138 190" class="seg-edge strong"/>
                <path d="M377 107 L394 130" class="seg-edge strong"/>
                <path d="M408 171 L378 190" class="seg-edge strong"/>
                <path d="M190 146 C245 126 292 126 338 146" class="seg-cut-edge"/>
                <path d="M188 166 C246 192 292 194 339 166" class="seg-cut-edge"/>
                <line x1="260" y1="58" x2="260" y2="232" class="seg-ncut-divider"/>
                <text x="260" y="50" text-anchor="middle" class="seg-cut-label">2nd eigenvector split</text>
                <text x="260" y="274" text-anchor="middle" class="seg-svg-note">Ncut 会惩罚“切掉小孤岛”的结果，倾向于得到内部相似且规模合理的区域。</text>
            </svg>
        `;
    }

    function grabCutInputSvg() {
        return `
            <svg class="seg-concept-svg" viewBox="0 0 520 300" role="img" aria-label="GrabCut user rectangle">
                <defs>
                    <linearGradient id="grabBg" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#dbeafe"/><stop offset="100%" stop-color="#e0f2fe"/>
                    </linearGradient>
                </defs>
                <rect x="28" y="30" width="464" height="230" rx="22" fill="url(#grabBg)" stroke="#bfdbfe"/>
                <rect x="48" y="178" width="424" height="62" rx="18" fill="#bbf7d0" opacity=".7"/>
                <ellipse cx="260" cy="148" rx="70" ry="88" fill="#f97316" opacity=".82"/>
                <ellipse cx="234" cy="132" rx="28" ry="36" fill="#fed7aa" opacity=".9"/>
                <ellipse cx="292" cy="125" rx="26" ry="34" fill="#fdba74" opacity=".9"/>
                <rect x="154" y="58" width="214" height="178" rx="16" fill="none" stroke="#2563eb" stroke-width="5" stroke-dasharray="12 8"/>
                <path d="M154 58 L118 34 M368 236 L404 262" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>
                <text x="260" y="42" text-anchor="middle" class="seg-svg-title">user rectangle</text>
                <text x="260" y="284" text-anchor="middle" class="seg-svg-note">框外确定背景，框内是可能前景，随后学习 FG/BG 颜色模型。</text>
            </svg>
        `;
    }

    function grabCutMaskSvg() {
        return `
            <svg class="seg-concept-svg seg-cut-result-svg" viewBox="0 0 300 210" role="img" aria-label="GrabCut foreground mask">
                <rect x="30" y="24" width="240" height="162" rx="18" fill="#0f172a"/>
                <path d="M138 46 C196 34 231 88 212 136 C195 181 126 185 96 144 C66 103 88 56 138 46Z" fill="#ffffff"/>
                <path d="M102 62 C125 74 139 90 145 119" fill="none" stroke="#22c55e" stroke-width="8" stroke-linecap="round" opacity=".76"/>
                <rect x="70" y="34" width="160" height="142" rx="12" fill="none" stroke="#2563eb" stroke-width="3" stroke-dasharray="7 6"/>
                <text x="150" y="202" text-anchor="middle" class="seg-svg-note">output: foreground alpha mask</text>
            </svg>
        `;
    }

    function watershedMarkersSvg() {
        return `
            <svg class="seg-concept-svg" viewBox="0 0 520 300" role="img" aria-label="Watershed markers">
                <rect x="28" y="30" width="464" height="230" rx="22" fill="#f8fafc" stroke="#dbeafe"/>
                <path d="M72 218 C130 154 180 224 238 154 C292 88 348 156 448 76" fill="none" stroke="#cbd5e1" stroke-width="16" stroke-linecap="round"/>
                <path d="M72 218 C130 154 180 224 238 154 C292 88 348 156 448 76" fill="none" stroke="#64748b" stroke-width="3" stroke-dasharray="6 6"/>
                <circle cx="150" cy="164" r="28" fill="#22c55e" opacity=".82"/><text x="150" y="169" text-anchor="middle">FG</text>
                <circle cx="380" cy="84" r="28" fill="#22c55e" opacity=".82"/><text x="380" y="89" text-anchor="middle">FG</text>
                <rect x="52" y="50" width="74" height="52" rx="12" fill="#2563eb" opacity=".74"/><text x="89" y="81" text-anchor="middle" fill="#fff">BG</text>
                <rect x="392" y="194" width="76" height="48" rx="12" fill="#2563eb" opacity=".74"/><text x="430" y="224" text-anchor="middle" fill="#fff">BG</text>
                <text x="260" y="278" text-anchor="middle" class="seg-svg-note">foreground marker、background marker 与 unknown region 一起驱动分水岭。</text>
            </svg>
        `;
    }

    function watershedLabelSvg() {
        return `
            <svg class="seg-concept-svg seg-cut-result-svg" viewBox="0 0 300 210" role="img" aria-label="Watershed label map">
                <rect x="28" y="22" width="244" height="164" rx="18" fill="#dbeafe"/>
                <path d="M28 122 C92 78 132 148 178 82 C210 38 234 64 272 40 L272 186 L28 186Z" fill="#bbf7d0"/>
                <path d="M28 122 C92 78 132 148 178 82 C210 38 234 64 272 40" fill="none" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/>
                <text x="82" y="82" text-anchor="middle" class="seg-svg-title">label 1</text>
                <text x="210" y="150" text-anchor="middle" class="seg-svg-title">label 2</text>
                <text x="150" y="202" text-anchor="middle" class="seg-svg-note">red ridge = watershed boundary</text>
            </svg>
        `;
    }

    function regionLabelMapSvg() {
        return `
            <svg class="seg-concept-svg" viewBox="0 0 520 300" role="img" aria-label="region label map">
                <rect x="30" y="32" width="460" height="224" rx="20" fill="#f8fafc" stroke="#dbeafe"/>
                <path d="M62 64 H218 V166 H62Z" fill="#93c5fd"/><text x="140" y="118" text-anchor="middle" class="seg-svg-title">1</text>
                <path d="M244 52 H448 V132 H384 V220 H244Z" fill="#bbf7d0"/><text x="345" y="122" text-anchor="middle" class="seg-svg-title">2</text>
                <path d="M84 188 C132 154 196 176 208 232 H80Z" fill="#fed7aa"/><text x="146" y="215" text-anchor="middle" class="seg-svg-title">3</text>
                <rect x="62" y="64" width="156" height="102" fill="none" stroke="#1d4ed8" stroke-width="4" stroke-dasharray="8 6"/>
                <rect x="244" y="52" width="204" height="168" fill="none" stroke="#16a34a" stroke-width="4" stroke-dasharray="8 6"/>
                <text x="260" y="282" text-anchor="middle" class="seg-svg-note">label map 可以直接计算 area、bbox、contour length 与 mask ratio。</text>
            </svg>
        `;
    }

    function regionPieChartSvg(props, options = {}) {
        const total = Math.max(1, props.reduce((sum, prop) => sum + (prop.count || 0), 0));
        const cx = options.cx || 64;
        const cy = options.cy || 64;
        const r = options.r || 54;
        const innerR = options.innerR || 30;
        const colors = props.map((prop) => prop.color || labelFill(prop.label));
        let startAngle = -Math.PI / 2;
        const slices = props.map((prop, index) => {
            const ratio = (prop.count || 0) / total;
            const angle = ratio * Math.PI * 2;
            const endAngle = startAngle + angle;
            const x1 = cx + r * Math.cos(startAngle);
            const y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);
            const x1Inner = cx + innerR * Math.cos(startAngle);
            const y1Inner = cy + innerR * Math.sin(startAngle);
            const x2Inner = cx + innerR * Math.cos(endAngle);
            const y2Inner = cy + innerR * Math.sin(endAngle);
            const largeArc = angle > Math.PI ? 1 : 0;
            const d = [
                `M ${x1Inner} ${y1Inner}`,
                `L ${x1} ${y1}`,
                `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
                `L ${x2Inner} ${y2Inner}`,
                `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}`,
                "Z",
            ].join(" ");
            const midAngle = startAngle + angle / 2;
            const labelR = (r + innerR) / 2;
            const lx = cx + labelR * Math.cos(midAngle);
            const ly = cy + labelR * Math.sin(midAngle);
            startAngle = endAngle;
            return { ...prop, ratio, d, lx, ly, color: colors[index] };
        });
        const legendItems = slices.map((slice, index) => `
            <span class="seg-region-pie-legend__item" style="--dot:${slice.color}">
                <b>label ${slice.label}</b>
                <em>${Math.round(slice.ratio * 100)}%</em>
            </span>
        `).join("");
        return `
            <div class="seg-region-pie-chart">
                <svg viewBox="0 0 128 128" role="img" aria-label="区域面积占比饼图">
                    ${slices.map((slice) => `
                        <path d="${slice.d}" fill="${slice.color}" stroke="#ffffff" stroke-width="2">
                            <title>label ${slice.label}: ${Math.round(slice.ratio * 100)}%</title>
                        </path>
                        ${slice.ratio > 0.08 ? `<text x="${slice.lx}" y="${slice.ly}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="10" font-weight="900">${Math.round(slice.ratio * 100)}%</text>` : ""}
                    `).join("")}
                    <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="seg-region-pie-center">${props.length}</text>
                    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="seg-region-pie-center-label">regions</text>
                </svg>
                <div class="seg-region-pie-legend">${legendItems}</div>
            </div>
        `;
    }

    function regionStatCards(props) {
        return "";
    }

    function renderGraphCut() {
        renderAlgorithmConcept(buildGraphCutDemo());
        return;
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        els.kmeansView.hidden = true;
        els.graphView.hidden = false;
        els.kmeansControls.hidden = true;
        els.status.textContent = "Graph Cut Concept";
        els.activeMethod.textContent = "Graph Cut";
        els.currentIter.textContent = "--";
        els.regionCount.textContent = "2";
        els.time.textContent = "--";
        els.stripMethod.textContent = "Graph Cut";
        els.stripFeature.textContent = "nodes + weighted edges";
        els.stripK.textContent = "S/T graph";
        els.stripIter.textContent = "min cut";
        els.stageTitle.textContent = "当前实验模式：Graph Cut";
        els.stripOutput.textContent = "foreground / background";
        renderStepper("graph");
        els.graphStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>输入图 / 小型像素图</h4>
                ${tinyPixelSvg("graph")}
            </section>
        `;
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>图结构：source / sink / edge weights</h4>
                ${graphCutSvg()}
            </section>
        `;
        els.conceptDetail.innerHTML = `
            <section class="seg-concept-card">
                <h4>cut 后前景 / 背景划分</h4>
                ${cutResultSvg()}
                <div class="seg-mini-equation">cut cost = 2.4 + 1.8</div>
                <div class="seg-analysis-metrics">
                    <div><span>node weights</span><strong>S-link 9.2 / T-link 8.7</strong></div>
                    <div><span>source / sink</span><strong>FG 46% / BG 54%</strong></div>
                    <div><span>cut cost</span><strong>4.2 total edge weight</strong></div>
                    <div><span>ratio</span><strong>foreground 0.46</strong></div>
                </div>
            </section>
        `;
        els.notesSubtitle.textContent = "Graph Cut / Min Cut";
        els.formulaLabel.textContent = "Graph Cut";
        els.formula.innerHTML = renderLatexFormula("\\text{min cut separates Source and Sink with minimum total edge cost}");
        els.formulaNote.textContent = "概念演示使用小型图结构，不对整张图求解大规模最小割。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>图结构</dt><dd>像素或超像素作为节点，相似度作为边权。</dd></div>
                <div><dt>Source / Sink</dt><dd>Source 代表前景，Sink 代表背景，节点通过 unary 边连接到两端。</dd></div>
                <div><dt>边权与 cut cost</dt><dd>颜色越相似、位置越接近，边权越大；cut cost 是被切断边权之和。</dd></div>
                <div><dt>Cut 边</dt><dd>红色虚线为切割边，切断后得到前景/背景两个连通区域。</dd></div>
                <div><dt>课程重点</dt><dd>最小割倾向于沿着低相似度边界切开图结构。</dd></div>
            </dl>
        `;
        setPhase("map");
        setBusy(false);
    }

    function renderNcut() {
        renderAlgorithmConcept(buildNcutDemo());
        return;
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        els.kmeansView.hidden = true;
        els.graphView.hidden = false;
        els.kmeansControls.hidden = true;
        els.status.textContent = "Normalized Cut Concept";
        els.activeMethod.textContent = "Normalized Cut";
        els.currentIter.textContent = "--";
        els.regionCount.textContent = "2";
        els.time.textContent = "--";
        els.stripMethod.textContent = "Normalized Cut";
        els.stripFeature.textContent = "W matrix + D matrix";
        els.stripK.textContent = "eigen split";
        els.stripIter.textContent = "spectral";
        els.stageTitle.textContent = "当前实验模式：Normalized Cut";
        els.stripOutput.textContent = "balanced region split";
        renderStepper("graph");
        els.graphStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>节点图</h4>
                ${ncutSvg()}
            </section>
        `;
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>权重矩阵 W</h4>
                <div class="seg-matrix">
                    <span>1</span><span>.9</span><span>.8</span><span>.1</span>
                    <span>.9</span><span>1</span><span>.7</span><span>.2</span>
                    <span>.8</span><span>.7</span><span>1</span><span>.1</span>
                    <span>.1</span><span>.2</span><span>.1</span><span>1</span>
                </div>
            </section>
            <section class="seg-concept-card">
                <h4>D 矩阵与第二小特征向量</h4>
                <div class="seg-eigen-bars">
                    <i style="height:36%"></i><i style="height:42%"></i><i style="height:34%"></i><i class="neg" style="height:76%"></i><i class="neg" style="height:82%"></i><i class="neg" style="height:72%"></i>
                </div>
                <p>D 是每个节点连接强度的度矩阵；第二小特征向量的符号可用于二分割。</p>
            </section>
        `;
        els.conceptDetail.innerHTML = `
            <section class="seg-concept-card">
                <h4>第二小特征向量二分结果</h4>
                ${eigenResultSvg()}
                <div class="seg-analysis-metrics">
                    <div><span>assoc(A,V)</span><strong>3.41</strong></div>
                    <div><span>assoc(B,V)</span><strong>3.58</strong></div>
                    <div><span>cut(A,B)</span><strong>0.42</strong></div>
                    <div><span>Ncut score</span><strong>0.240</strong></div>
                </div>
            </section>
        `;
        els.notesSubtitle.textContent = "Normalized Cut";
        els.formulaLabel.textContent = "Ncut";
        els.formula.innerHTML = renderLatexFormula("\\text{Ncut}(A,B)=\\frac{\\text{cut}(A,B)}{\\text{assoc}(A,V)}+\\frac{\\text{cut}(A,B)}{\\text{assoc}(B,V)}");
        els.formulaNote.textContent = "归一化切割会考虑分区内部总连接强度，避免只切出很小的孤立区域。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>权重矩阵 W</dt><dd>W[i,j] 表示两个节点的相似度，颜色、纹理、距离都可以进入权重。</dd></div>
                <div><dt>D 矩阵</dt><dd>D[i,i] 是第 i 个节点的连接总强度，即 W 的行和。</dd></div>
                <div><dt>第二小特征向量</dt><dd>谱分割用特征向量把节点投影到一维，再按符号或阈值二分。</dd></div>
                <div><dt>二分割结果</dt><dd>图中左右两个节点团是 Ncut 倾向保留的平衡区域。</dd></div>
            </dl>
        `;
        setPhase("map");
        setBusy(false);
    }

    function renderGrabCut() {
        renderAlgorithmConcept(buildGrabCutDemo());
        return;
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        els.kmeansView.hidden = true;
        els.graphView.hidden = false;
        els.kmeansControls.hidden = true;
        els.status.textContent = "GrabCut Concept";
        els.activeMethod.textContent = "GrabCut";
        els.currentIter.textContent = "4 refinement";
        els.regionCount.textContent = "2";
        els.time.textContent = "--";
        els.stripMethod.textContent = "GrabCut";
        els.stripFeature.textContent = "box + color GMM";
        els.stripK.textContent = "FG/BG";
        els.stripIter.textContent = "graph cut";
        els.stageTitle.textContent = "当前实验模式：GrabCut 前景提取";
        els.stripOutput.textContent = "foreground mask";
        renderStepper("grabcut");
        els.graphStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>用户框选区域</h4>
                ${grabCutInputSvg()}
            </section>
        `;
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>前景 / 背景颜色模型</h4>
                <div class="seg-model-swatches">
                    <span style="--c:#f97316"><b>FG GMM</b><em>框内可能前景</em></span>
                    <span style="--c:#60a5fa"><b>BG GMM</b><em>框外确定背景</em></span>
                    <span style="--c:#22c55e"><b>Pairwise</b><em>边界平滑项</em></span>
                </div>
                <div class="seg-mini-equation">E(label)=color likelihood + boundary penalty</div>
            </section>
        `;
        els.conceptDetail.innerHTML = `
            <section class="seg-concept-card">
                <h4>Graph Cut 优化后的前景 mask</h4>
                ${grabCutMaskSvg()}
                <div class="seg-analysis-metrics">
                    <div><span>user box</span><strong>[154,58,214,178]</strong></div>
                    <div><span>unary cost</span><strong>FG 0.31 / BG 0.69</strong></div>
                    <div><span>pairwise cost</span><strong>boundary smoothness 0.42</strong></div>
                    <div><span>mask pixels</span><strong>28.4% foreground</strong></div>
                </div>
                <div class="seg-region-property-table">
                    <div><span>mask ratio</span><strong>28.4%</strong></div>
                    <div><span>bbox</span><strong>[70,34,160,142]</strong></div>
                    <div><span>boundary</span><strong>438 px</strong></div>
                </div>
            </section>
        `;
        els.notesSubtitle.textContent = "GrabCut Foreground Extraction";
        els.formulaLabel.textContent = "GrabCut";
        els.formula.innerHTML = renderLatexFormula("\\text{labels} = \\min\\_\\text{cut}(\\text{unary\\_color\\_model} + \\text{pairwise\\_boundary})");
        els.formulaNote.textContent = "用户只给一个矩形框，算法把框外设为确定背景，框内前景概率由颜色模型和图切割共同决定。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>用户框</dt><dd>框外像素直接作为背景种子，框内像素先标为可能前景。</dd></div>
                <div><dt>颜色模型</dt><dd>分别拟合前景与背景的颜色分布，给每个像素计算 unary cost。</dd></div>
                <div><dt>Graph Cut</dt><dd>通过 pairwise 边界项避免 mask 产生锯齿和孤立噪点。</dd></div>
                <div><dt>输出</dt><dd>得到二值前景 mask，可继续生成透明背景或物体区域统计。</dd></div>
            </dl>
        `;
        setPhase("map");
        setBusy(false);
    }

    function renderWatershed() {
        renderAlgorithmConcept(buildWatershedDemo());
        return;
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        els.kmeansView.hidden = true;
        els.graphView.hidden = false;
        els.kmeansControls.hidden = true;
        els.status.textContent = "Watershed Concept";
        els.activeMethod.textContent = "Watershed";
        els.currentIter.textContent = "markers";
        els.regionCount.textContent = "3";
        els.time.textContent = "--";
        els.stripMethod.textContent = "Watershed";
        els.stripFeature.textContent = "gradient + markers";
        els.stripK.textContent = "label ids";
        els.stripIter.textContent = "flood fill";
        els.stageTitle.textContent = "当前实验模式：Watershed 分水岭";
        els.stripOutput.textContent = "boundary + label map";
        renderStepper("watershed");
        els.graphStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>梯度图 / 距离变换</h4>
                <div class="seg-gradient-board"><i></i><i></i><i></i><i></i><i></i></div>
                <p>边缘响应高的位置更可能成为分水岭边界，距离变换能帮助找到前景中心。</p>
            </section>
        `;
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>foreground / background / unknown markers</h4>
                ${watershedMarkersSvg()}
            </section>
        `;
        els.conceptDetail.innerHTML = `
            <section class="seg-concept-card">
                <h4>watershed boundary 与 label map</h4>
                ${watershedLabelSvg()}
                <div class="seg-analysis-metrics">
                    <div><span>markers</span><strong>FG 2 / BG 2 / unknown 1</strong></div>
                    <div><span>gradient mean</span><strong>0.38 ridge score</strong></div>
                    <div><span>boundary</span><strong>286 px watershed line</strong></div>
                    <div><span>label map</span><strong>3 regions + boundary</strong></div>
                </div>
            </section>
        `;
        els.notesSubtitle.textContent = "Watershed Marker Propagation";
        els.formulaLabel.textContent = "Watershed";
        els.formula.innerHTML = renderLatexFormula("\\text{markers flood low-gradient basins until boundaries meet}");
        els.formulaNote.textContent = "分水岭把梯度图看作地形，marker 从盆地扩张，相遇处形成边界线。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>foreground marker</dt><dd>来自阈值、距离变换或人工种子，表示确定前景。</dd></div>
                <div><dt>background marker</dt><dd>表示确定背景区域，防止前景无约束扩张。</dd></div>
                <div><dt>unknown region</dt><dd>前景与背景都不确定的位置由扩张竞争决定标签。</dd></div>
                <div><dt>输出</dt><dd>边界像素形成 watershed boundary，其余像素得到区域 label id。</dd></div>
            </dl>
        `;
        setPhase("map");
        setBusy(false);
    }

    function renderRegions() {
        renderAlgorithmConcept(buildRegionsDemo());
        return;
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        els.kmeansView.hidden = true;
        els.graphView.hidden = false;
        els.kmeansControls.hidden = true;
        els.status.textContent = "Region Properties";
        els.activeMethod.textContent = "区域属性";
        els.currentIter.textContent = "--";
        els.regionCount.textContent = "3";
        els.time.textContent = "--";
        els.stripMethod.textContent = "区域属性";
        els.stripFeature.textContent = "label map";
        els.stripK.textContent = "3 labels";
        els.stripIter.textContent = "measure";
        els.stageTitle.textContent = "当前实验模式：区域属性 label map";
        els.stripOutput.textContent = "area / bbox / contour";
        renderStepper("regions");
        els.graphStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>区域 label map</h4>
                ${regionLabelMapSvg()}
            </section>
        `;
        const hardcodedRegionProps = [
            { label: 1, count: 159, ratio: 0.159, minX: 0, maxX: 155, minY: 0, maxY: 101, perimeter: 412, color: "#93c5fd" },
            { label: 2, count: 272, ratio: 0.272, minX: 0, maxX: 203, minY: 0, maxY: 167, perimeter: 536, color: "#86efac" },
            { label: 3, count: 86, ratio: 0.086, minX: 0, maxX: 127, minY: 0, maxY: 57, perimeter: 248, color: "#fdba74" },
        ];
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>区域统计表</h4>
                ${regionPieChartSvg(hardcodedRegionProps)}
                ${regionStatCards(hardcodedRegionProps)}
            </section>
        `;
        els.conceptDetail.innerHTML = `
            <section class="seg-concept-card">
                <h4>轮廓与 mask 占比</h4>
                <div class="seg-region-bars">
                    <span style="--w:64%;--c:#93c5fd"><b>label 1 contour</b><em>412 px</em></span>
                    <span style="--w:82%;--c:#86efac"><b>label 2 contour</b><em>536 px</em></span>
                    <span style="--w:38%;--c:#fdba74"><b>label 3 contour</b><em>248 px</em></span>
                </div>
                <div class="seg-analysis-metrics">
                    <div><span>label id</span><strong>1 / 2 / 3</strong></div>
                    <div><span>area</span><strong>15.9% / 27.2% / 8.6%</strong></div>
                    <div><span>bbox</span><strong>156×102 · 204×168 · 128×58</strong></div>
                    <div><span>mask ratio</span><strong>area / image area</strong></div>
                </div>
            </section>
        `;
        els.notesSubtitle.textContent = "Connected Region Statistics";
        els.formulaLabel.textContent = "Region Properties";
        els.formula.innerHTML = renderLatexFormula("\\text{area}=\\text{count}(\\text{mask}{=}\\text{label}),\\; \\text{bbox}=\\min/\\max(x,y)");
        els.formulaNote.textContent = "label map 不是最终说明文字，它是后续测量 bbox、轮廓、面积和 mask 占比的数据结构。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>区域面积</dt><dd>统计每个 label 覆盖的像素数量和相对占比。</dd></div>
                <div><dt>bbox</dt><dd>取区域像素坐标的 min/max，得到最小外接矩形。</dd></div>
                <div><dt>轮廓长度</dt><dd>沿 label 边界追踪 contour，用于形状复杂度分析。</dd></div>
                <div><dt>mask 占比</dt><dd>area / image area，可用于过滤过小区域或比较目标规模。</dd></div>
            </dl>
        `;
        setPhase("stats");
        setBusy(false);
    }

    async function runCurrentMode() {
        try {
            if (state.autoRunTimer) {
                clearTimeout(state.autoRunTimer);
                state.autoRunTimer = 0;
            }
            if (state.method === "graphcut") {
                renderGraphCut();
                return;
            }
            if (state.method === "ncut") {
                renderNcut();
                return;
            }
            if (state.method === "grabcut") {
                renderGrabCut();
                return;
            }
            if (state.method === "watershed") {
                renderWatershed();
                return;
            }
            if (state.method === "regions") {
                renderRegions();
                return;
            }
            if (!state.image) {
                const item = selectedSample();
                await loadImage(item.image, item.name);
            } else {
                drawImageToWorkCanvas(state.image);
            }
            await runKMeansMode();
        } catch (error) {
            console.error("segmentation basic run failed", error);
            els.statusText.textContent = "运行失败";
            els.notes.innerHTML = `<p class="method-error">分割运行失败：${escapeHtml(error.message)}。请换一张图片或降低 K / 迭代次数。</p>`;
            setBusy(false);
        }
    }

    function scheduleAutoRun(delay = 160) {
        if (state.autoRunTimer) clearTimeout(state.autoRunTimer);
        state.autoRunTimer = setTimeout(() => {
            state.autoRunTimer = 0;
            runCurrentMode();
        }, delay);
    }

    async function loadSelectedSample(autoRun = true) {
        const item = selectedSample();
        if (!item) return;
        stopAnimation();
        resetGrabCutState();
        if (state.uploadUrl) {
            URL.revokeObjectURL(state.uploadUrl);
            state.uploadUrl = "";
        }
        els.uploadName.textContent = "选择文件";
        updateSampleCards();
        await loadImage(item.image, item.name);
        if (autoRun) await runCurrentMode();
    }

    async function init() {
        try {
            const response = await fetch(`${dataRoot}/segmentation_basic/segmentation_basic_samples.json?v=20260625-segsamp4`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            state.data = await response.json();
            state.sampleId = state.data.defaultSample || state.data.samples?.[0]?.id || "";
            renderSamplePicker();
            readControls();
            await loadSelectedSample(true);
        } catch (error) {
            console.error("segmentation basic data failed", error);
            els.statusText.textContent = "加载失败";
            els.notes.innerHTML = `<p class="method-error">传统分割演示数据加载失败，请检查 static/assets/data/vision_tasks/segmentation_basic/segmentation_basic_samples.json。</p>`;
        }
    }

    // 移除废弃的 els.sample.addEventListener 监听，其选择反馈由触发器和 grid 卡片直接处理
    els.upload.addEventListener("change", async () => {
        const file = els.upload.files?.[0];
        if (!file) return;
        stopAnimation();
        resetGrabCutState();
        if (state.uploadUrl) URL.revokeObjectURL(state.uploadUrl);
        state.uploadUrl = URL.createObjectURL(file);
        els.uploadName.textContent = file.name;
        state.sampleId = "";
        await loadImage(state.uploadUrl, file.name);
        await runCurrentMode();
    });
    els.methodButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            state.method = button.dataset.segbMethod;
            els.methodButtons.forEach((item) => item.classList.toggle("is-active", item === button));
            els.activeMethod.textContent = methodLabels[state.method];
            renderFamilyGroups();
            await runCurrentMode();
        });
    });
    [els.k, els.maxIter, els.xyWeight, els.init, els.showCenters, els.showIterations].forEach((control) => {
        control.addEventListener("change", () => {
            readControls();
            scheduleAutoRun(0);
        });
        control.addEventListener("input", () => {
            readControls();
            if (control === els.showCenters && state.result?.snapshots?.length) renderKMeansResult(state.currentSnapshot);
            scheduleAutoRun(control.type === "range" ? 180 : 0);
        });
    });
    els.run.addEventListener("click", runCurrentMode);
    els.play.addEventListener("click", playSnapshots);
    setupGrabCutInteraction();
    setupCompareSlider();
    setupKMeansRegionInteraction();

    // 监听特征度量毛玻璃弹窗
    document.addEventListener("click", (e) => {
        const trigger = e.target.closest("[data-seg-lens-trigger]");
        if (trigger) {
            const kind = trigger.getAttribute("data-seg-lens-trigger");
            const sourceCard = document.querySelector(`.seg-mode-lens-card.is-${kind}`);
            if (sourceCard) {
                const clone = sourceCard.cloneNode(true);
                const body = document.getElementById("segModalBody");
                body.innerHTML = "";
                body.appendChild(clone);
                document.getElementById("segLensModal").removeAttribute("hidden");
            }
        }
    });

    const lensModal = document.getElementById("segLensModal");
    const lensCloseBtn = document.getElementById("segLensCloseBtn");
    if (lensModal && lensCloseBtn) {
        lensCloseBtn.addEventListener("click", () => {
            lensModal.setAttribute("hidden", "");
            document.getElementById("segModalBody").innerHTML = "";
        });
        lensModal.addEventListener("click", (e) => {
            if (e.target === lensModal) {
                lensModal.setAttribute("hidden", "");
                document.getElementById("segModalBody").innerHTML = "";
            }
        });
    }

    init();
})();
