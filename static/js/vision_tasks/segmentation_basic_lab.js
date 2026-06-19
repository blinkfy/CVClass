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
        els.run.disabled = isBusy;
        els.play.disabled = isBusy || !state.result?.snapshots?.length || !state.showIterations;
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
        els.play.textContent = "播放迭代";
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

    function playSnapshots() {
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

    init();
})();
