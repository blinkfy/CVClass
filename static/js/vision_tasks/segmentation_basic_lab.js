(function () {
    const root = document.querySelector("[data-seg-basic-lab]");
    if (!root) return;

    const api = window.CVClassVisionTasks || {};
    const dataRoot = api.moduleDataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
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
    };

    const els = {
        sample: $("[data-segb-sample]"),
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
        flowFeature: $("[data-segb-flow-feature]"),
        centerList: $("[data-segb-center-list]"),
        regionList: $("[data-segb-region-list]"),
        iterationMonitor: $("[data-segb-iteration-monitor]"),
        graphStage: $("[data-segb-graph-stage]"),
        matrixStage: $("[data-segb-matrix-stage]"),
        conceptDetail: $("[data-segb-concept-detail]"),
        conceptSource: $("[data-segb-concept-source]"),
        conceptMask: $("[data-segb-concept-mask]"),
        conceptResultTitle: $("[data-segb-concept-result-title]"),
        conceptResultCaption: $("[data-segb-concept-result-caption]"),
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
                ["feature", "Color Models", "GMM FG/BG"],
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
        const canPlay = activeFamily() === "cluster"
            ? Boolean(state.result?.snapshots?.length && state.showIterations)
            : Boolean(state.concept?.frames?.length > 1);
        els.run.disabled = isBusy;
        els.play.disabled = isBusy || !canPlay;
        els.statusText.textContent = isBusy ? "计算中" : "就绪";
    }

    function selectedSample() {
        return state.data?.samples.find((item) => item.id === state.sampleId) || state.data?.samples[0];
    }

    function stopAnimation() {
        if (state.animationTimer) {
            clearInterval(state.animationTimer);
            state.animationTimer = 0;
        }
        state.playing = false;
        els.play.textContent = activeFamily() === "cluster" ? "播放迭代" : "播放流程";
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
            image.src = src;
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

    function regionRows(result, snapshot) {
        const total = result.width * result.height;
        return snapshot.counts.map((count, index) => {
            const [r, g, b] = colorFromCenter(snapshot.centers, result.dims, index);
            const ratio = count / total;
            return `
                <div class="seg-basic-region-row">
                    <i style="background:rgb(${r},${g},${b})"></i>
                    <strong>Cluster ${index + 1}</strong>
                    <div><span style="width:${Math.round(ratio * 100)}%"></span></div>
                    <em>${count} px · ${Math.round(ratio * 100)}%</em>
                </div>
            `;
        }).join("");
    }

    function centerRows(result, snapshot) {
        if (!state.showCenters) {
            return `<p class="seg-basic-muted">聚类中心显示已关闭。</p>`;
        }
        return snapshot.counts.map((count, index) => {
            const [r, g, b] = colorFromCenter(snapshot.centers, result.dims, index);
            const xy = result.useXY ? `<small>xy=(${Math.round(snapshot.centers[index * result.dims + 3])}, ${Math.round(snapshot.centers[index * result.dims + 4])})</small>` : "";
            return `
                <div class="seg-basic-center-row">
                    <i style="background:rgb(${r},${g},${b})"></i>
                    <strong>C${index + 1}</strong>
                    <span>rgb(${r}, ${g}, ${b})</span>
                    ${xy}
                </div>
            `;
        }).join("");
    }

    function renderFeatureSpace(result, snapshot) {
        const maxCount = Math.max(1, ...snapshot.counts);
        return `
            <div class="seg-basic-feature-cloud" data-mode="${result.useXY ? "rgbxy" : "rgb"}">
                ${snapshot.counts.map((count, index) => {
                    const [r, g, b] = colorFromCenter(snapshot.centers, result.dims, index);
                    const x = result.useXY ? Math.max(8, Math.min(92, (snapshot.centers[index * result.dims + 3] / Math.max(1, 255 * state.xyWeight)) * 100)) : 12 + (index % 3) * 34;
                    const y = result.useXY ? Math.max(10, Math.min(90, (snapshot.centers[index * result.dims + 4] / Math.max(1, 255 * state.xyWeight)) * 100)) : 18 + Math.floor(index / 3) * 34;
                    const size = 16 + (count / maxCount) * 22;
                    return `<span style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;background:rgb(${r},${g},${b})"><b>C${index + 1}</b></span>`;
                }).join("")}
                <em>${result.useXY ? "XY position pulls centers into local regions" : "RGB distance only: same colors can merge across space"}</em>
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

    function updateKMeansReadout(result, snapshot) {
        const counts = snapshot.counts;
        const maxCount = Math.max(...counts);
        const mainIndex = counts.indexOf(maxCount);
        const ratioText = `${Math.round((maxCount / (result.width * result.height)) * 100)}%`;
        els.currentIter.textContent = `${snapshot.iter} / ${result.snapshots.length}`;
        els.regionCount.textContent = String(result.k);
        els.stripIter.textContent = `${snapshot.iter}`;
        els.stripK.textContent = String(result.k);
        els.regionList.innerHTML = regionRows(result, snapshot);
        els.centerList.innerHTML = centerRows(result, snapshot);
        els.featureSpace.innerHTML = renderFeatureSpace(result, snapshot);
        renderIterationMonitor(result);
        renderNotesForKMeans(result, snapshot, mainIndex, ratioText);
    }

    function renderNotesForKMeans(result, snapshot, mainIndex, ratioText) {
        const feature = result.useXY ? "RGB + XY" : "RGB";
        const ratios = snapshot.counts.map((count, index) => `C${index + 1}: ${Math.round((count / (result.width * result.height)) * 100)}%`).join(" / ");
        els.notesSubtitle.textContent = result.useXY ? "RGB + XY Spatial Constraint" : "K-means Assignment";
        els.formulaLabel.textContent = "K-means";
        els.formula.textContent = "cluster(x) = argmin_k ||f(x) - c_k||²";
        els.formulaNote.textContent = result.useXY
            ? "f(x) = [R,G,B, xyWeight·X, xyWeight·Y]，坐标项会惩罚空间上相距较远的同色像素。"
            : "f(x) = [R,G,B]，只根据颜色距离聚类，空间上不连续的同色区域可能被分到同一类。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>公式</dt><dd>cluster(x)=argmin_k ||f(x)-c_k||²</dd></div>
                <div><dt>当前输入</dt><dd>${escapeHtml(state.sourceName)} · ${result.width}×${result.height}</dd></div>
                <div><dt>Feature Vector</dt><dd>${result.useXY ? `f(x)=[R,G,B,λx,λy], xyWeight=${state.xyWeight.toFixed(2)}` : "f(x)=[R,G,B]"}</dd></div>
                <div><dt>当前步骤</dt><dd>${state.playing ? (state.currentSnapshot % 2 ? "Update" : "Assignment") : "Assignment / Update complete"}</dd></div>
                <div><dt>当前迭代次数</dt><dd>${snapshot.iter} / ${result.snapshots.length}</dd></div>
                <div><dt>聚类中心变化</dt><dd>movement = ${snapshot.movement.toFixed(2)}, mean distance = ${snapshot.distance.toFixed(1)}</dd></div>
                <div><dt>最大区域</dt><dd>Cluster ${mainIndex + 1} · ${ratioText}</dd></div>
                <div><dt>每类像素比例</dt><dd>${ratios}</dd></div>
                <div><dt>${result.useXY ? "空间连续性" : "局限性"}</dt><dd>${result.useXY ? "坐标项让空间相邻像素更容易保持同类，减少零散噪点。" : "颜色相近但空间不相邻的像素可能被分到同一类。"}</dd></div>
            </dl>
        `;
    }

    function renderKMeansResult(snapshotIndex = -1) {
        if (!state.result?.snapshots?.length) return;
        const result = state.result;
        const index = snapshotIndex < 0 ? result.snapshots.length - 1 : Math.min(snapshotIndex, result.snapshots.length - 1);
        const snapshot = result.snapshots[index];
        state.currentSnapshot = index;
        renderSnapshot(result, snapshot, els.resultCanvas);
        updateKMeansReadout(result, snapshot);
        if (state.compareResult?.snapshots?.length) {
            const compareSnapshot = state.compareResult.snapshots[state.compareResult.snapshots.length - 1];
            renderSnapshot(state.compareResult, compareSnapshot, els.compareCanvas);
        }
        if (state.method === "kmeans-rgbxy") renderContinuityMap(result, snapshot);
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

    function drawConceptShowcase(showcase) {
        if (!els.conceptSource || !els.conceptMask || !showcase) return;
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
        const displayBox = showcase.interactive === "grabcut" && state.grabcut.draftBox
            ? state.grabcut.draftBox
            : box;
        const displaySeeds = showcase.interactive === "grabcut"
            ? [
                ...indexesToSeeds(uniqueIndexes(state.grabcut.fgSeeds, model), "fg"),
                ...indexesToSeeds(uniqueIndexes(state.grabcut.bgSeeds, model), "bg"),
            ]
            : seeds;
        [els.conceptSource, els.conceptMask].forEach((canvas) => {
            canvas.width = work.width;
            canvas.height = work.height;
        });
        const sourceCtx = els.conceptSource.getContext("2d");
        sourceCtx.putImageData(work.imageData, 0, 0);
        if (showcase.interactive === "grabcut") {
            drawConceptBox(sourceCtx, work.width, work.height, model.cols, model.rows, displayBox, els.conceptSource);
            drawConceptSeeds(sourceCtx, work.width, work.height, model.cols, model.rows, displaySeeds, els.conceptSource, { compact: true });
        }

        const maskCtx = els.conceptMask.getContext("2d");
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
        drawConceptBox(maskCtx, work.width, work.height, cols, rows, displayBox, els.conceptMask);
        drawConceptCutEdges(maskCtx, work.width, work.height, cols, rows, cutEdges, els.conceptMask);
        drawConceptBboxes(maskCtx, work.width, work.height, cols, rows, bboxes, els.conceptMask);
        drawConceptActiveCells(maskCtx, work.width, work.height, cols, rows, activeCells, els.conceptMask);
        if (!showcase.interactive || showcase.showSeedsOnMask) {
            drawConceptSeeds(maskCtx, work.width, work.height, cols, rows, displaySeeds, els.conceptMask, { compact: showcase.interactive === "grabcut" });
        }
        els.conceptResultTitle.textContent = title || "分割结果 label map";
        els.conceptResultCaption.textContent = caption || "算法输出的区域标签会在这里显示。";
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
        const maxRounds = 600;
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

    function conceptGridSvg(model, options = {}) {
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
        return `
            <div class="seg-analysis-metrics">
                ${metrics.map((metric) => `<div><span>${escapeHtml(metric[0])}</span><strong>${escapeHtml(metric[1])}</strong></div>`).join("")}
            </div>
        `;
    }

    function noteRows(rows) {
        return `<dl>${rows.map((row) => `<div><dt>${escapeHtml(row[0])}</dt><dd>${escapeHtml(row[1])}</dd></div>`).join("")}</dl>`;
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

    function buildGrabCutPixelModel() {
        const work = ensureWorkData();
        const maxSide = 132;
        const scale = maxSide / Math.max(work.width, work.height);
        const cols = Math.max(48, Math.round(work.width * Math.min(1, scale)));
        const rows = Math.max(32, Math.round(work.height * Math.min(1, scale)));
        return buildSampleGrid(cols, rows);
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

    function runDenseGrabCut(model, box, fgUserSeeds, bgUserSeeds) {
        const fgUserSet = new Set(uniqueIndexes(fgUserSeeds, model));
        const bgUserSet = new Set(uniqueIndexes(bgUserSeeds, model));
        const insideBox = (cell) => cell.x >= box.x0 && cell.x <= box.x1 && cell.y >= box.y0 && cell.y <= box.y1;
        const central = (cell) => {
            const nx = (cell.x - (box.x0 + box.x1) / 2) / Math.max(1, (box.x1 - box.x0) / 2);
            const ny = (cell.y - (box.y0 + box.y1) / 2) / Math.max(1, (box.y1 - box.y0) / 2);
            return nx * nx + ny * ny < 0.62;
        };
        let labels = model.cells.map((cell, index) => {
            if (bgUserSet.has(index)) return false;
            if (fgUserSet.has(index)) return true;
            return insideBox(cell) && central(cell);
        });
        const snapshots = [];
        const sigmaSq = 54 * 54;
        for (let iter = 1; iter <= 5; iter += 1) {
            const fgIndexes = labels.map((label, index) => label ? index : -1).filter((index) => index >= 0);
            const bgIndexes = labels.map((label, index) => !label ? index : -1).filter((index) => index >= 0);
            const fgMean = colorMean(model.cells, fgIndexes.length ? fgIndexes : model.cells.filter(insideBox).map((cell) => cell.index));
            const bgMean = colorMean(model.cells, bgIndexes);
            const scores = model.cells.map((cell, index) => {
                if (fgUserSet.has(index)) return 8;
                if (bgUserSet.has(index) || !insideBox(cell)) return -8;
                const fgAffinity = Math.exp(-colorDistanceSq(cell, fgMean) / (2 * sigmaSq)) * 3.2 + (central(cell) ? 0.58 : 0);
                const bgAffinity = Math.exp(-colorDistanceSq(cell, bgMean) / (2 * sigmaSq)) * 3.2 + 0.24;
                return fgAffinity - bgAffinity;
            });
            for (let smooth = 0; smooth < 4; smooth += 1) {
                const next = labels.slice();
                model.cells.forEach((cell, index) => {
                    if (fgUserSet.has(index)) {
                        next[index] = true;
                        return;
                    }
                    if (bgUserSet.has(index) || !insideBox(cell)) {
                        next[index] = false;
                        return;
                    }
                    let vote = 0;
                    neighborIndexes(index, model.cols, model.rows).forEach((neighbor) => {
                        const weight = Math.exp(-colorDistanceSq(cell, model.cells[neighbor]) / (2 * 34 * 34));
                        vote += (labels[neighbor] ? 1 : -1) * weight;
                    });
                    next[index] = scores[index] + vote * 0.72 > 0;
                });
                labels = next;
            }
            snapshots.push({
                iter,
                labels: labels.slice(),
                fgMean,
                bgMean,
                scores,
                cutEdges: cutEdgesFromLabels(model, labels),
            });
        }
        return { labels, snapshots, insideBox, central };
    }

    function buildGraphCutDemo() {
        const model = buildSampleGrid(10, 7);
        const seeds = graphSeedsForSample();
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
            stripK: `${model.cells.length} nodes`,
            stripOutput: "min-cut labels",
            regionCount: "2",
            formulaLabel: "Graph Cut",
            formula: "E(L)=Σ unary_i(L_i)+Σ pairwise_ij[L_i≠L_j]",
            formulaNote: "页面在当前图像上抽样成小型像素图，并用最大流/最小割实际求解前景与背景划分。",
            notes: [
                ["建图", "每个小格是节点，Source 表示前景，Sink 表示背景。"],
                ["Unary cost", "前景/背景种子估计颜色模型，决定节点连到 Source 或 Sink 的代价。"],
                ["Pairwise cost", "相邻格颜色越像，边权越大，被切开的代价越高。"],
                ["最小割", "最大流结束后，从 Source 还能到达的节点就是前景侧。"],
            ],
            showcase: {
                model,
                labels: solution.labels,
                title: "Graph Cut 分割结果",
                caption: `绿色为 Source 前景侧，蓝色为背景侧；当前前景约 ${Math.round((fgCount / model.cells.length) * 100)}%，割边 ${solution.cutEdges.length} 条。`,
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
                        model,
                        labels: seedStageLabels(model, seedMarks),
                        seeds: seedMarks,
                        title: "Graph Cut Step 1：前景/背景种子",
                        caption: "绿色种子代表 Source 前景约束，蓝色种子代表 Sink 背景约束。",
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
                    detail: metricCards([["FG color", rgbText(fgMean)], ["BG color", rgbText(bgMean)], ["unary range", "seed caps = 90"], ["meaning", "lower cut keeps label"]]),
                    stageNote: "每个节点会得到一对端点权重：切断 Source 边会让它偏向背景，切断 Sink 边会让它偏向前景。",
                    showcase: {
                        model,
                        scores,
                        seeds: seedMarks,
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
                    detail: metricCards([["augment paths", String(solution.paths.length)], ["first bottle", (solution.paths[0]?.bottleneck || 0).toFixed(2)], ["edge model", "color contrast"], ["next", "min cut"]]),
                    stageNote: "最大流会沿着还能承载流量的路径推进；粗边代表切开会更痛，红色切线通常绕开它们。",
                    showcase: {
                        model,
                        labels: filledLabels(model, 0),
                        activeCells: pathCells,
                        title: "Graph Cut Step 3：最大流增广路径",
                        caption: "橙色高亮表示当前增广路径经过的节点，算法沿可通行边不断推送流量。",
                        alpha: 0.42,
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
                        model,
                        labels: solution.labels,
                        cutEdges: solution.cutEdges,
                        seeds: seedMarks,
                        title: "Graph Cut Step 4：最小割边界",
                        caption: "红色虚线是最终切断的边，绿色/蓝色表示割开后的两侧。",
                    },
                },
                {
                    phase: "stats",
                    title: "5. 输出二值 label map 与统计",
                    graph: conceptGridSvg(model, { labels: solution.labels, cutEdges: solution.cutEdges, caption: "foreground/background label map" }),
                    matrix: metricCards(metrics),
                    detail: noteRows([
                        ["可解释输出", `前景占 ${Math.round((fgCount / model.cells.length) * 100)}%，割边 ${solution.cutEdges.length} 条。`],
                        ["算法意义", "Graph Cut 把分割转化成能量最小化，适合有种子约束的前景/背景任务。"],
                    ]),
                    stageNote: "最终得到的是每个节点的前景/背景标签，红线就是算法认为最自然的边界。",
                    showcase: {
                        model,
                        labels: solution.labels,
                        cutEdges: solution.cutEdges,
                        title: "Graph Cut Step 5：最终分割结果",
                        caption: `前景约 ${Math.round((fgCount / model.cells.length) * 100)}%，割边 ${solution.cutEdges.length} 条。`,
                    },
                },
            ],
        };
    }

    function buildNcutDemo() {
        const model = buildSampleGrid(4, 3);
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
            stripK: `${n} supernodes`,
            stripOutput: "balanced partition",
            regionCount: "2",
            formulaLabel: "Ncut",
            formula: "Ncut(A,B)=cut(A,B)/assoc(A,V)+cut(A,B)/assoc(B,V)",
            formulaNote: "页面实际构造 W 矩阵，并用归一化相似度矩阵的第二特征向量做二分割。",
            notes: [
                ["W 矩阵", "颜色相近、空间相邻的超像素权重大。"],
                ["D 矩阵", "D[i,i] 是第 i 个节点的连接总强度。"],
                ["谱松弛", "第二特征向量把节点投到一维，符号或中位数阈值给出二分。"],
                ["归一化", "Ncut 用 assoc 项惩罚切出很小的孤立块。"],
            ],
            showcase: {
                model,
                labels,
                title: "Normalized Cut 平衡分割结果",
                caption: `两种颜色表示第二特征向量阈值后的两个区域；Ncut score = ${ncut.toFixed(3)}。`,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 从图像抽样为超像素图",
                    graph: conceptGridSvg(model, { pairs: pairEdges, showEdges: true, caption: "supernodes are connected by color-spatial similarity" }),
                    matrix: metricCards([["nodes", String(n)], ["edge model", "color × spatial"], ["degree", "row sum of W"], ["goal", "balanced split"]]),
                    detail: barsHtml(model.cells.map((cell, index) => ({ label: `v${index + 1}`, value: degree[index], color: "#2563eb", note: `D=${degree[index].toFixed(2)}` }))),
                    stageNote: "Ncut 不是找 Source/Sink，而是先构造一个所有节点之间的相似度图。",
                    showcase: {
                        model,
                        labels: filledLabels(model, 0),
                        activeCells: model.cells.map((cell) => cell.index),
                        title: "Ncut Step 1：超像素节点图",
                        caption: "先把图像抽样为少量超像素节点，后续用节点相似度做谱分割。",
                        alpha: 0.42,
                    },
                },
                {
                    phase: "feature",
                    title: "2. 权重矩阵 W 与度矩阵 D",
                    graph: matrixHeatmap(Array.from(weights), n),
                    matrix: barsHtml(degree.map((value, index) => ({ label: `D${index + 1}`, value, color: "#0ea5e9", note: value.toFixed(2) }))),
                    detail: metricCards([["W shape", `${n}×${n}`], ["max W", Math.max(...weights).toFixed(2)], ["min nonzero W", Math.min(...Array.from(weights).filter(Boolean)).toFixed(2)], ["normalizer", "D^-1/2 W D^-1/2"]]),
                    stageNote: "矩阵越亮表示两个节点越相似；D 记录每个节点在图里的总连接强度。",
                    showcase: {
                        model,
                        scores: degreeScores,
                        title: "Ncut Step 2：节点连接强度 D",
                        caption: "颜色越偏橙，表示该节点与全图的连接总强度越高。",
                        alpha: 0.7,
                    },
                },
                ...eigenSnapshots.map((snapshot, index) => ({
                    phase: index < 2 ? "assign" : "update",
                    title: `3. 特征向量迭代 ${snapshot.iter}`,
                    graph: eigenBars(snapshot.vector),
                    matrix: conceptGridSvg(model, { scores: snapshot.vector, caption: "blue / orange signs foreshadow the partition" }),
                    detail: metricCards([["iteration", String(snapshot.iter)], ["orthogonal", "removed first eigenvector"], ["threshold", "median sign split"], ["solver", "power iteration demo"]]),
                    stageNote: "向量逐步稳定后，同号节点会被分到同一侧；这就是谱分割的可视化核心。",
                    showcase: {
                        model,
                        scores: snapshot.vector,
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
                        model,
                        labels,
                        cutEdges,
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
            stripFeature: "box + color model + min-cut",
            stripK: "FG/BG",
            stripOutput: "foreground mask",
            regionCount: "2",
            formulaLabel: "GrabCut",
            formula: "repeat: estimate FG/BG color model → graph cut labels",
            formulaNote: "在左侧输入图上拖拽矩形框或使用前景/背景画笔，页面会用你的标注重新估计颜色模型并运行图割。",
            notes: [
                ["用户框", "在输入图上拖拽矩形框，框外作为确定背景，框内作为可能前景。"],
                ["前景/背景笔", "前景笔会强制 Source 约束，背景笔会强制 Sink 约束。"],
                ["颜色模型", "每轮用当前 mask 估计 FG/BG 平均颜色，近似 GrabCut 的 GMM 思路。"],
                ["Graph Cut", "用 unary 颜色项和 pairwise 平滑项求新的二值 mask。"],
                ["迭代收敛", "mask 与颜色模型交替更新，边界逐渐贴合物体颜色差异。"],
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
                        return insideBox(model.cells[denseY * model.cols + denseX]) && central(model.cells[denseY * model.cols + denseX]);
                    }).map((cell) => cell.index), caption: "drag box, then add optional FG/BG seeds" }),
                    matrix: metricCards([["box", `[${box.x0},${box.y0}] - [${box.x1},${box.y1}]`], ["FG seeds", String(fgUserSeeds.length)], ["BG seeds", String(bgUserSeeds.length)], ["next", "learn colors"]]),
                    detail: noteRows([["初始化", "矩形框决定 probable foreground 范围；画笔种子会作为强约束进入图割。"]]),
                    stageNote: "在输入图上直接拖拽框选，或用前景/背景笔补充种子，GrabCut 会按这些交互输入重新提取前景。",
                    showcase: {
                        model,
                        labels: model.cells.map((cell) => insideBox(cell) && central(cell)),
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
                        ["model", "FG/BG color mean"],
                    ]),
                    stageNote: "每轮先根据当前 mask 估计颜色，再由图割决定下一轮的前景/背景标签。",
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
        return model.cells.map((cell, index) => {
            const diffs = neighborIndexes(index, model.cols, model.rows).map((next) => Math.abs(cell.gray - model.cells[next].gray) / 255);
            return diffs.reduce((sum, value) => sum + value, 0) / Math.max(1, diffs.length);
        });
    }

    function buildWatershedCore() {
        const model = buildSampleGrid(16, 10);
        const gradient = gradientForModel(model);
        const markerDefs = [
            { x: 0.25, y: 0.64, label: 1, text: "1", type: "fg" },
            { x: 0.70, y: 0.44, label: 2, text: "2", type: "fg" },
            { x: 0.08, y: 0.12, label: 3, text: "B", type: "bg" },
            { x: 0.92, y: 0.88, label: 3, text: "B", type: "bg" },
        ];
        const markers = markerDefs.map((marker) => ({
            ...marker,
            index: nearestCellIndex(model.cells, model.cols, model.rows, marker.x, marker.y),
        }));
        const labels = new Int16Array(model.cells.length);
        const queued = new Uint8Array(model.cells.length);
        const queue = [];
        const pushNeighbors = (index) => {
            neighborIndexes(index, model.cols, model.rows).forEach((next) => {
                if (labels[next] !== 0 || queued[next]) return;
                queued[next] = 1;
                queue.push({ index: next, priority: gradient[next] });
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
            queue.sort((a, b) => a.priority - b.priority);
            const current = queue.shift();
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

    function buildWatershedDemo() {
        const core = buildWatershedCore();
        const gradientScores = core.gradient.map((value) => value * 2 - 1);
        const props = propsFromLabelMap(core.model, core.labels);
        const boundaryCount = core.labels.filter((label) => label === -1).length;
        return {
            stepperKind: "watershed",
            status: "Watershed Algorithm",
            activeMethod: "Watershed",
            stageTitle: "当前实验模式：Watershed 分水岭",
            stripFeature: "gradient + markers",
            stripK: `${props.length} labels`,
            stripOutput: "boundary + label map",
            regionCount: String(props.length),
            formulaLabel: "Watershed",
            formula: "markers flood low-gradient basins until fronts meet",
            formulaNote: "页面把当前图像的梯度当作地形高度，marker 从低阻力区域扩张，相遇处形成分水岭边界。",
            notes: [
                ["梯度地形", "颜色变化越大，梯度越高，越可能成为边界。"],
                ["Marker", "前景/背景种子给出确定起点，未知区域等待扩张竞争。"],
                ["Flooding", "低梯度位置先被占领，不同标签相遇时标记为边界。"],
                ["Label map", "除边界外，每个网格得到一个区域 id。"],
            ],
            showcase: {
                model: core.model,
                labels: core.labels,
                title: "Watershed 分水岭 label map",
                caption: `红色为分水岭边界，其余颜色为区域 label；共 ${props.length} 个区域，边界 ${boundaryCount} 格。`,
                alpha: 0.72,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 梯度图：把图像看成地形",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, caption: "orange ridges have higher gradient" }),
                    matrix: barsHtml(core.gradient.slice(0, 10).map((value, index) => ({ label: `g${index + 1}`, value, color: "#f97316", note: value.toFixed(2) }))),
                    detail: metricCards([["grid", `${core.model.cols}×${core.model.rows}`], ["cue", "color gradient"], ["low areas", "flood first"], ["ridges", "boundary candidates"]]),
                    stageNote: "分水岭把梯度图想象成地形：水从低处扩张，山脊就是分界线。",
                    showcase: {
                        model: core.model,
                        scores: gradientScores,
                        title: "Watershed Step 1：梯度地形图",
                        caption: "偏橙区域代表高梯度山脊，后续更容易成为分水岭边界。",
                        alpha: 0.74,
                    },
                },
                {
                    phase: "feature",
                    title: "2. 设置前景/背景 marker",
                    graph: conceptGridSvg(core.model, { scores: gradientScores, seeds: core.markers, caption: "markers seed the flood basins" }),
                    matrix: metricCards([["FG markers", "label 1 / label 2"], ["BG markers", "label 3"], ["unknown", "all unlabeled cells"], ["next", "priority flood"]]),
                    detail: noteRows([["Marker 约束", "没有 marker 的像素不会立刻分类，而是等待相邻标签扩张。"]]),
                    stageNote: "marker 是分水岭算法的锚点，决定哪些盆地从哪里开始扩张。",
                    showcase: {
                        model: core.model,
                        labels: seedStageLabels(core.model, core.markers),
                        seeds: core.markers,
                        title: "Watershed Step 2：前景/背景 marker",
                        caption: "marker 是扩张起点；未知区域将在后续由优先队列竞争决定标签。",
                        alpha: 0.52,
                    },
                },
                ...core.snapshots.slice(1).map((snapshot, index) => ({
                    phase: index < 2 ? "assign" : index < 3 ? "update" : "map",
                    title: `3. Flooding 扩张 ${Math.round((snapshot.processed / core.model.cells.length) * 100)}%`,
                    graph: conceptGridSvg(core.model, { labels: Array.from(snapshot.labels), activeCells: snapshot.frontier, seeds: core.markers, caption: "red cells mark watershed boundaries" }),
                    matrix: metricCards([["processed", `${snapshot.processed}/${core.model.cells.length}`], ["frontier", snapshot.frontier.length ? `cell ${snapshot.frontier[0] + 1}` : "done"], ["boundary rule", "labels meet"], ["queue", "low gradient first"]]),
                    detail: barsHtml(props.map((prop) => ({ label: `label ${prop.label}`, value: prop.count, color: prop.color, note: `${Math.round(prop.ratio * 100)}% final` }))),
                    stageNote: "扩张前沿遇到不同标签时，不再强行归类，而是留下红色分水岭边界。",
                    showcase: {
                        model: core.model,
                        labels: Array.from(snapshot.labels),
                        seeds: core.markers,
                        activeCells: snapshot.frontier,
                        title: `Watershed Step 3：扩张 ${Math.round((snapshot.processed / core.model.cells.length) * 100)}%`,
                        caption: "橙色描边是当前扩张前沿；红色格子是不同标签相遇后形成的边界。",
                        alpha: 0.72,
                    },
                })),
                {
                    phase: "stats",
                    title: "4. Watershed label map",
                    graph: conceptGridSvg(core.model, { labels: core.labels, seeds: core.markers, caption: "final watershed labels and boundary" }),
                    matrix: metricCards([["labels", String(props.length)], ["boundary", `${boundaryCount} cells`], ["largest", `${Math.max(...props.map((prop) => prop.count))} cells`], ["output", "region id map"]]),
                    detail: noteRows(props.map((prop) => [`label ${prop.label}`, `area ${Math.round(prop.ratio * 100)}%, bbox ${prop.maxX - prop.minX + 1}×${prop.maxY - prop.minY + 1}`])),
                    stageNote: "最终结果是一个 label map：边界为红色，其余网格保存区域编号。",
                    showcase: {
                        model: core.model,
                        labels: core.labels,
                        seeds: core.markers,
                        title: "Watershed Step 4：最终 label map",
                        caption: `红色为分水岭边界，其余颜色为区域 label；共 ${props.length} 个区域。`,
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
        const core = buildWatershedCore();
        const components = connectedComponents(core.model, core.labels);
        const props = components.props;
        const scanCells = props[0]?.cells.slice(0, Math.max(1, Math.round((props[0]?.cells.length || 1) * 0.5))) || [];
        return {
            stepperKind: "regions",
            status: "Region Properties",
            activeMethod: "区域属性",
            stageTitle: "当前实验模式：区域属性 label map",
            stripFeature: "connected labels",
            stripK: `${props.length} regions`,
            stripOutput: "area / bbox / contour",
            regionCount: String(props.length),
            formulaLabel: "Region Properties",
            formula: "area=count(label), bbox=min/max(x,y), contour=count(boundary edges)",
            formulaNote: "区域属性不是人工填写的说明，而是从 label map 中扫描、连通域编号和边界计数得到的数据。",
            notes: [
                ["Label map", "每个像素或网格保存一个整数区域 id。"],
                ["连通域扫描", "同一 label 且空间相邻的像素合成一个 region。"],
                ["bbox", "记录区域像素 x/y 的最小值与最大值。"],
                ["contour", "统计与其他 label 相邻或接触图像边界的边。"],
            ],
            showcase: {
                model: core.model,
                labels: components.compLabels,
                title: "区域属性 label map",
                caption: `彩色区域是连通域编号后的 label map；已计算 ${props.length} 个区域的 area、bbox 和 contour。`,
                alpha: 0.72,
            },
            frames: [
                {
                    phase: "image",
                    title: "1. 输入 label map",
                    graph: conceptGridSvg(core.model, { labels: core.labels, caption: "watershed output becomes the region-label input" }),
                    matrix: metricCards([["source", "watershed labels"], ["boundary", "ignored for area"], ["task", "measure regions"], ["data type", "integer map"]]),
                    detail: noteRows([["关键点", "label map 是结构化数据，不只是彩色可视化图。"]]),
                    stageNote: "区域属性分析从 label map 开始：每个网格都有自己的整数标签。",
                    showcase: {
                        model: core.model,
                        labels: core.labels,
                        title: "Region Step 1：输入 label map",
                        caption: "这是分割算法输出的整数标签图，区域属性计算从这里开始。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "feature",
                    title: "2. 连通域扫描与重新编号",
                    graph: conceptGridSvg(core.model, { labels: components.compLabels, activeCells: scanCells, caption: "connected components receive compact ids" }),
                    matrix: barsHtml(props.map((prop) => ({ label: `label ${prop.label}`, value: prop.count, color: prop.color, note: `${prop.count} cells` }))),
                    detail: metricCards([["components", String(props.length)], ["largest", `${props[0]?.count || 0} cells`], ["scan", "BFS/DFS"], ["renumber", "compact ids"]]),
                    stageNote: "扫描时只把同 label 且相邻的网格归为同一区域，离散小块会成为单独 region。",
                    showcase: {
                        model: core.model,
                        labels: components.compLabels,
                        activeCells: scanCells,
                        title: "Region Step 2：连通域扫描",
                        caption: "橙色描边展示正在扫描的连通区域，扫描后会重新编号为紧凑 label id。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "assign",
                    title: "3. 面积 area 与 mask ratio",
                    graph: conceptGridSvg(core.model, { labels: components.compLabels, caption: "area = count(label id)" }),
                    matrix: barsHtml(props.map((prop) => ({ label: `label ${prop.label}`, value: prop.ratio, color: prop.color, note: `${Math.round(prop.ratio * 100)}%` }))),
                    detail: noteRows(props.map((prop) => [`label ${prop.label}`, `area=${prop.count}, mask ratio=${Math.round(prop.ratio * 100)}%`])),
                    stageNote: "面积就是该 label 覆盖的网格数量，mask ratio 是它占整幅图的比例。",
                    showcase: {
                        model: core.model,
                        labels: components.compLabels,
                        title: "Region Step 3：面积与占比",
                        caption: "彩色面积直接对应每个 label 的像素计数与 mask ratio。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "update",
                    title: "4. BBox 与轮廓边界",
                    graph: conceptGridSvg(core.model, { labels: components.compLabels, bboxes: props, caption: "dashed boxes are min/max coordinate bounds" }),
                    matrix: noteRows(props.map((prop) => [`label ${prop.label}`, `bbox ${prop.maxX - prop.minX + 1}×${prop.maxY - prop.minY + 1}, contour ${prop.perimeter}`])),
                    detail: metricCards([["bbox rule", "min/max x,y"], ["contour rule", "neighbor differs"], ["shape cue", "perimeter/area"], ["output", "region table"]]),
                    stageNote: "bbox 来自坐标极值，轮廓长度来自边界邻接关系。",
                    showcase: {
                        model: core.model,
                        labels: components.compLabels,
                        bboxes: props,
                        activeCells: props.flatMap((prop) => prop.cells.slice(0, 2)),
                        title: "Region Step 4：bbox 与轮廓",
                        caption: "区域轮廓来自相邻 label 变化，bbox 来自该区域坐标的最小/最大值。",
                        alpha: 0.72,
                    },
                },
                {
                    phase: "stats",
                    title: "5. 区域属性表",
                    graph: conceptGridSvg(core.model, { labels: components.compLabels, bboxes: props, caption: "label map + measured properties" }),
                    matrix: `
                        <div class="seg-region-property-table">
                            ${props.map((prop) => `<div><span>label ${prop.label}</span><strong>area ${prop.count} · bbox ${prop.maxX - prop.minX + 1}×${prop.maxY - prop.minY + 1} · contour ${prop.perimeter}</strong></div>`).join("")}
                        </div>
                    `,
                    detail: metricCards([["regions", String(props.length)], ["largest ratio", `${Math.round((props[0]?.ratio || 0) * 100)}%`], ["computed", "area / bbox / contour"], ["ready for", "filtering or grading"]]),
                    stageNote: "最终输出就是可用于筛选、排序、评价的区域属性表。",
                    showcase: {
                        model: core.model,
                        labels: components.compLabels,
                        bboxes: props,
                        title: "Region Step 5：最终区域属性结果",
                        caption: `已从 label map 中计算 ${props.length} 个区域的 area、bbox、contour 与 mask ratio。`,
                        alpha: 0.72,
                    },
                },
            ],
        };
    }

    function renderConceptFrame(index) {
        if (!state.concept?.frames?.length) return;
        const frames = state.concept.frames;
        const frame = frames[clamp(index, 0, frames.length - 1)];
        state.conceptFrameIndex = frames.indexOf(frame);
        els.graphStage.innerHTML = conceptCard(frame.title, frame.graph, frame.stageNote);
        els.matrixStage.innerHTML = conceptCard("算法中间量", frame.matrix);
        els.conceptDetail.innerHTML = conceptCard("输出解释", frame.detail);
        els.currentIter.textContent = `${state.conceptFrameIndex + 1} / ${frames.length}`;
        els.stripIter.textContent = `${state.conceptFrameIndex + 1}`;
        els.notes.innerHTML = noteRows([
            ["当前阶段", frame.stageNote || frame.title],
            ...state.concept.notes,
        ]);
        els.formulaNote.textContent = frame.stageNote || state.concept.formulaNote;
        drawConceptShowcase(frame.showcase || state.concept.showcase);
        setPhase(frame.phase || "map");
    }

    function renderAlgorithmConcept(config) {
        stopAnimation();
        state.result = null;
        state.compareResult = null;
        state.concept = config;
        state.conceptFrameIndex = 0;
        els.kmeansView.hidden = true;
        els.graphView.hidden = false;
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
        els.formula.textContent = config.formula;
        els.formulaNote.textContent = config.formulaNote;
        if (els.grabcutToolbar) {
            els.grabcutToolbar.hidden = config.activeMethod !== "GrabCut";
        }
        renderStepper(config.stepperKind);
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
        }, 980);
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
                rerunGrabCutFromInteraction();
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
        if (activeFamily() !== "cluster") {
            playConceptFrames();
            return;
        }
        if (!state.result?.snapshots?.length || !state.showIterations) return;
        if (state.playing) {
            stopAnimation();
            return;
        }
        state.playing = true;
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
        stopAnimation();
        state.concept = null;
        readControls();
        setBusy(true);
        setPhase("feature");
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const isCompare = state.method === "kmeans-compare";
        const useXY = state.method === "kmeans-rgbxy" || isCompare;
        const started = performance.now();
        state.result = runKMeans(useXY);
        state.result.elapsed = performance.now() - started;
        state.compareResult = null;
        if (useXY) {
            const compareStarted = performance.now();
            state.compareResult = runKMeans(false);
            state.compareResult.elapsed = performance.now() - compareStarted;
        }
        const elapsed = state.result.elapsed + (state.compareResult?.elapsed || 0);
        els.time.textContent = `${elapsed.toFixed(1)} ms`;
        els.statusText.textContent = "分割完成";
        els.status.textContent = "Canvas K-means";
        els.compareCard.hidden = false;
        els.compareNote.hidden = state.method !== "kmeans-rgbxy";
        els.featureSpace.hidden = state.method !== "kmeans-rgb";
        els.compareCanvas.hidden = state.method === "kmeans-rgb";
        els.resultTitle.textContent = isCompare ? "RGB-only 分割" : useXY ? "K-means RGB+XY 分割结果" : "K-means RGB 分割结果";
        els.thirdTitle.textContent = isCompare ? "RGB+XY 分割" : useXY ? "空间连续性热力图" : "RGB 聚类中心 / 特征空间示意";
        els.flowFeature.textContent = useXY ? "RGB + XY Vector" : "RGB Vector";
        els.stripFeature.textContent = useXY ? "[R,G,B,λx,λy]" : "[R,G,B]";
        els.stripMethod.textContent = methodLabels[state.method];
        els.activeMethod.textContent = methodLabels[state.method];
        els.stageTitle.textContent = `当前实验模式：${methodLabels[state.method]}`;
        els.stripOutput.textContent = "label map";
        renderStepper("kmeans");
        setPhase("map");
        renderKMeansResult(isCompare ? -1 : state.showIterations ? 0 : -1);
        if (isCompare && state.compareResult?.snapshots?.length) {
            renderSnapshot(state.compareResult, state.compareResult.snapshots[state.compareResult.snapshots.length - 1], els.resultCanvas);
            renderSnapshot(state.result, state.result.snapshots[state.result.snapshots.length - 1], els.compareCanvas);
        }
        setBusy(false);
        if (state.showIterations && !isCompare) playSnapshots();
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
        els.formula.textContent = "min cut separates Source and Sink with minimum total edge cost";
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
        els.formula.textContent = "Ncut(A,B)=cut(A,B)/assoc(A,V)+cut(A,B)/assoc(B,V)";
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
        els.formula.textContent = "labels = min_cut(unary_color_model + pairwise_boundary)";
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
        els.formula.textContent = "markers flood low-gradient basins until boundaries meet";
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
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>区域统计表</h4>
                <div class="seg-region-property-table">
                    <div><span>label 1</span><strong>area 15.9% · bbox 156×102</strong></div>
                    <div><span>label 2</span><strong>area 27.2% · bbox 204×168</strong></div>
                    <div><span>label 3</span><strong>area 8.6% · bbox 128×58</strong></div>
                </div>
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
        els.formula.textContent = "area(label)=count(mask==label), bbox=min/max(x,y)";
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
            els.kmeansView.hidden = false;
            els.graphView.hidden = true;
            els.kmeansControls.hidden = false;
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
        await loadImage(item.image, item.name);
        if (autoRun) await runCurrentMode();
    }

    async function init() {
        try {
            const response = await fetch(`${dataRoot}/segmentation_basic_samples.json`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            state.data = await response.json();
            state.sampleId = state.data.defaultSample || state.data.samples?.[0]?.id || "";
            els.sample.innerHTML = (state.data.samples || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
            els.sample.value = state.sampleId;
            readControls();
            await loadSelectedSample(true);
        } catch (error) {
            console.error("segmentation basic data failed", error);
            els.statusText.textContent = "加载失败";
            els.notes.innerHTML = `<p class="method-error">传统分割演示数据加载失败，请检查 static/assets/vision_tasks/data/segmentation_basic_samples.json。</p>`;
        }
    }

    els.sample.addEventListener("change", async () => {
        state.sampleId = els.sample.value;
        await loadSelectedSample(true);
    });
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
        control.addEventListener("change", runCurrentMode);
        control.addEventListener("input", () => {
            readControls();
            if (control === els.showCenters && state.result?.snapshots?.length) renderKMeansResult(state.currentSnapshot);
        });
    });
    els.run.addEventListener("click", runCurrentMode);
    els.play.addEventListener("click", playSnapshots);
    setupGrabCutInteraction();

    init();
})();
