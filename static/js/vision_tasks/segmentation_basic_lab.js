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
        graphcut: "Graph Cut",
        ncut: "Normalized Cut",
    };
    const state = {
        data: null,
        sampleId: "",
        uploadUrl: "",
        method: "kmeans-rgb",
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
        stripMethod: $("[data-segb-strip-method]"),
        stripFeature: $("[data-segb-strip-feature]"),
        stripK: $("[data-segb-strip-k]"),
        stripIter: $("[data-segb-strip-iter]"),
        kmeansView: $("[data-segb-kmeans-view]"),
        graphView: $("[data-segb-graph-view]"),
        original: $("[data-segb-original]"),
        resultCanvas: $("[data-segb-result]"),
        compareCanvas: $("[data-segb-compare]"),
        compareCard: $("[data-segb-compare-card]"),
        compareNote: $("[data-segb-compare-note]"),
        resultTitle: $("[data-segb-result-title]"),
        flowFeature: $("[data-segb-flow-feature]"),
        centerList: $("[data-segb-center-list]"),
        regionList: $("[data-segb-region-list]"),
        graphStage: $("[data-segb-graph-stage]"),
        matrixStage: $("[data-segb-matrix-stage]"),
        notesSubtitle: $("[data-segb-notes-subtitle]"),
        formulaLabel: $("[data-segb-formula-label]"),
        formula: $("[data-segb-formula]"),
        formulaNote: $("[data-segb-formula-note]"),
        notes: $("[data-segb-notes]"),
        stepper: $$("[data-segb-phase]"),
    };

    const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    function setPhase(phase) {
        els.stepper.forEach((item) => item.classList.toggle("is-active", item.dataset.segbPhase === phase));
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
                <div><dt>当前输入</dt><dd>${escapeHtml(state.sourceName)} · ${result.width}×${result.height}</dd></div>
                <div><dt>Feature Vector</dt><dd>${feature}${result.useXY ? ` · xyWeight=${state.xyWeight.toFixed(2)}` : ""}</dd></div>
                <div><dt>当前迭代次数</dt><dd>${snapshot.iter} / ${result.snapshots.length}</dd></div>
                <div><dt>聚类中心变化</dt><dd>movement = ${snapshot.movement.toFixed(2)}, mean distance = ${snapshot.distance.toFixed(1)}</dd></div>
                <div><dt>最大区域</dt><dd>Cluster ${mainIndex + 1} · ${ratioText}</dd></div>
                <div><dt>每类像素比例</dt><dd>${ratios}</dd></div>
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
        const useXY = state.method === "kmeans-rgbxy";
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
        els.compareCard.hidden = !useXY;
        els.compareNote.hidden = !useXY;
        els.resultTitle.textContent = useXY ? "RGB+XY 分割结果" : "RGB 聚类分割结果";
        els.flowFeature.textContent = useXY ? "RGB + XY Vector" : "RGB Vector";
        els.stripFeature.textContent = useXY ? "RGB + XY" : "RGB";
        els.stripMethod.textContent = methodLabels[state.method];
        els.activeMethod.textContent = methodLabels[state.method];
        setPhase("map");
        renderKMeansResult(state.showIterations ? 0 : -1);
        setBusy(false);
        if (state.showIterations) playSnapshots();
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
        els.graphStage.innerHTML = graphCutSvg();
        els.matrixStage.innerHTML = `
            <section class="seg-concept-card">
                <h4>Min Cut Energy</h4>
                <p>E(A,B)= unary(source/sink) + pairwise(boundary penalty)</p>
                <div class="seg-mini-equation">cut* = argmin cut(A,B)</div>
            </section>
            <section class="seg-concept-card">
                <h4>边权含义</h4>
                <p>颜色越相似、位置越接近，像素节点之间的边权越大；高权重边更不容易被切断。</p>
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
                <div><dt>Cut 边</dt><dd>红色虚线为切割边，切断后得到前景/背景两个连通区域。</dd></div>
                <div><dt>课程重点</dt><dd>最小割倾向于沿着低相似度边界切开图结构。</dd></div>
            </dl>
        `;
        setPhase("update");
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
        els.graphStage.innerHTML = ncutSvg();
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
        setPhase("update");
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
