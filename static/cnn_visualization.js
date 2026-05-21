(function () {
    const root = document.getElementById("cnnVizPage");
    if (!root) return;

    const els = {
        tabs: Array.from(root.querySelectorAll("[data-tab]")),
        status: document.getElementById("cnnStepStatus"),
        flow: document.getElementById("cnnFlowBar"),
        sceneMount: document.getElementById("cnnSceneMount"),
        viewButtons: Array.from(root.querySelectorAll("[data-view]")),
        viz: document.getElementById("cnnVisualization"),
        formulaTitle: document.getElementById("cnnFormulaTitle"),
        formulaBody: document.getElementById("cnnFormulaBody"),
        detailTitle: document.getElementById("cnnDetailTitle"),
        detailBody: document.getElementById("cnnDetailBody"),
        prev: document.getElementById("cnnPrevStep"),
        next: document.getElementById("cnnNextStep"),
        auto: document.getElementById("cnnAutoPlay"),
        pause: document.getElementById("cnnPause"),
        runForward: document.getElementById("cnnRunForward"),
        runBackward: document.getElementById("cnnRunBackward"),
        update: document.getElementById("cnnUpdateParams"),
        reset: document.getElementById("cnnReset"),
        lr: document.getElementById("cnnLearningRate"),
        label: document.getElementById("cnnLabel"),
        message: document.getElementById("cnnMessage")
    };

    const flowLayers = ["Input", "Conv", "ReLU", "Pool", "Flatten", "FC", "Softmax", "Loss"];
    const overviewLayers = [
        { key: "input", title: "Input", inSize: "-", outSize: "6×6", formula: "X ∈ R^{6×6}", role: "提供固定教学输入矩阵。" },
        { key: "conv", title: "Conv", inSize: "6×6", outSize: "4×4", formula: "Z[i,j] = Σ X[i+u,j+v]K[u,v] + b", role: "用 3×3 局部窗口提取边缘和纹理响应。" },
        { key: "relu", title: "ReLU", inSize: "4×4", outSize: "4×4", formula: "A = max(0, Z)", role: "引入非线性，负数响应被截断为 0。" },
        { key: "pool", title: "MaxPool", inSize: "4×4", outSize: "2×2", formula: "P[i,j] = max(region)", role: "降低空间尺寸并保留显著响应。" },
        { key: "flatten", title: "Flatten", inSize: "2×2", outSize: "4", formula: "flat = reshape(P)", role: "把二维特征整理成分类器输入向量。" },
        { key: "fc", title: "FC", inSize: "4", outSize: "3", formula: "logits = flat × Wfc + bfc", role: "把特征映射到 3 个类别得分。" },
        { key: "softmax", title: "Softmax", inSize: "3", outSize: "3", formula: "p_i = exp(s_i) / Σ exp(s_j)", role: "把类别得分转成概率分布。" },
        { key: "loss", title: "Loss", inSize: "3", outSize: "1", formula: "L = -log(p_true)", role: "衡量预测概率和真实标签之间的差距。" }
    ];

    const state = {
        currentTab: "overview",
        currentStep: 0,
        mode: "forward",
        lr: 0.1,
        label: 1,
        selectedLayer: "conv",
        X: [],
        K: [],
        bConv: 0,
        Zconv: [],
        A: [],
        pool: [],
        poolMask: [],
        flat: [],
        Wfc: [],
        bfc: [],
        logits: [],
        probs: [],
        loss: 0,
        dlogits: [],
        dWfc: [],
        dbfc: [],
        dflat: [],
        dpool: [],
        dA: [],
        dZconv: [],
        dK: [],
        dbConv: 0,
        timer: null,
        updatedSnapshot: null,
        scene: null,
        activeLayer: "conv"
    };

    function cloneMatrix(matrix) {
        return matrix.map((row) => row.slice());
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "-";
        const rounded = Math.abs(value) < 0.0005 ? 0 : value;
        return Number(rounded.toFixed(3)).toString();
    }

    function zeros(rows, cols) {
        return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    }

    function oneHot(label) {
        return [0, 1, 2].map((index) => (index === label ? 1 : 0));
    }

    function matMul(vector, matrix) {
        return matrix[0].map((_, col) => vector.reduce((sum, value, row) => sum + value * matrix[row][col], 0));
    }

    function softmax(values) {
        const maxValue = Math.max(...values);
        const exps = values.map((value) => Math.exp(value - maxValue));
        const sum = exps.reduce((acc, value) => acc + value, 0);
        return exps.map((value) => value / sum);
    }

    function crossEntropy(probs, label) {
        return -Math.log(Math.max(1e-8, probs[label]));
    }

    function initState() {
        state.currentTab = "overview";
        state.currentStep = 0;
        state.mode = "forward";
        state.lr = Number(els.lr.value) || 0.1;
        state.label = Number(els.label.value) || 1;
        state.selectedLayer = "conv";
        state.X = [
            [1, 2, 0, 1, 3, 2],
            [0, 1, 2, 2, 1, 0],
            [3, 1, 1, 0, 2, 1],
            [2, 0, 1, 3, 1, 2],
            [1, 2, 3, 1, 0, 1],
            [0, 1, 2, 2, 3, 1]
        ];
        state.K = [
            [0.2, -0.1, 0.0],
            [0.1, 0.3, -0.2],
            [0.0, 0.2, 0.1]
        ];
        state.bConv = 0.1;
        state.Wfc = [
            [0.2, -0.1, 0.1],
            [0.0, 0.3, -0.2],
            [0.1, 0.2, 0.0],
            [-0.2, 0.1, 0.3]
        ];
        state.bfc = [0.05, 0.0, -0.05];
        clearComputed();
    }

    function clearComputed() {
        state.Zconv = [];
        state.A = [];
        state.pool = [];
        state.poolMask = [];
        state.flat = [];
        state.logits = [];
        state.probs = [];
        state.loss = 0;
        state.dlogits = [];
        state.dWfc = [];
        state.dbfc = [];
        state.dflat = [];
        state.dpool = [];
        state.dA = [];
        state.dZconv = [];
        state.dK = zeros(3, 3);
        state.dbConv = 0;
        state.updatedSnapshot = null;
    }

    function resetDemo() {
        stopAuto();
        initState();
        setMessage("已重置为固定教学 CNN 初始参数。");
        renderAll();
    }

    function convPosition(index) {
        return { r: Math.floor(index / 4), c: index % 4 };
    }

    function getPatch(row, col) {
        return state.X.slice(row, row + 3).map((items) => items.slice(col, col + 3));
    }

    function forwardConvStep(index) {
        if (!state.Zconv.length) state.Zconv = zeros(4, 4);
        const { r, c } = convPosition(index);
        const patch = getPatch(r, c);
        let sum = state.bConv;
        for (let u = 0; u < 3; u += 1) {
            for (let v = 0; v < 3; v += 1) {
                sum += patch[u][v] * state.K[u][v];
            }
        }
        state.Zconv[r][c] = sum;
        return { patch, value: sum, r, c };
    }

    function forwardConvAll() {
        state.Zconv = zeros(4, 4);
        for (let i = 0; i < 16; i += 1) forwardConvStep(i);
        return state.Zconv;
    }

    function forwardRelu() {
        if (!state.Zconv.length) forwardConvAll();
        state.A = state.Zconv.map((row) => row.map((value) => Math.max(0, value)));
        return state.A;
    }

    function forwardPool() {
        if (!state.A.length) forwardRelu();
        state.pool = zeros(2, 2);
        state.poolMask = zeros(4, 4);
        for (let pr = 0; pr < 2; pr += 1) {
            for (let pc = 0; pc < 2; pc += 1) {
                let best = -Infinity;
                let bestR = 0;
                let bestC = 0;
                for (let r = pr * 2; r < pr * 2 + 2; r += 1) {
                    for (let c = pc * 2; c < pc * 2 + 2; c += 1) {
                        if (state.A[r][c] > best) {
                            best = state.A[r][c];
                            bestR = r;
                            bestC = c;
                        }
                    }
                }
                state.pool[pr][pc] = best;
                state.poolMask[bestR][bestC] = 1;
            }
        }
        return state.pool;
    }

    function forwardFlatten() {
        if (!state.pool.length) forwardPool();
        state.flat = state.pool.flat();
        return state.flat;
    }

    function forwardFC() {
        if (!state.flat.length) forwardFlatten();
        state.logits = matMul(state.flat, state.Wfc).map((value, index) => value + state.bfc[index]);
        return state.logits;
    }

    function forwardSoftmaxLoss() {
        if (!state.logits.length) forwardFC();
        state.probs = softmax(state.logits);
        state.loss = crossEntropy(state.probs, state.label);
        return { probs: state.probs, loss: state.loss };
    }

    function runFullForward() {
        forwardConvAll();
        forwardRelu();
        forwardPool();
        forwardFlatten();
        forwardFC();
        forwardSoftmaxLoss();
        state.mode = "forward";
        state.currentTab = "forward";
        state.currentStep = forwardSteps().length - 1;
        setMessage("完整前向传播已完成。");
        renderAll();
    }

    function backwardSoftmaxLoss() {
        if (!state.probs.length) forwardSoftmaxLoss();
        const y = oneHot(state.label);
        state.dlogits = state.probs.map((prob, index) => prob - y[index]);
        return state.dlogits;
    }

    function backwardFC() {
        if (!state.dlogits.length) backwardSoftmaxLoss();
        state.dWfc = state.flat.map((value) => state.dlogits.map((grad) => value * grad));
        state.dbfc = state.dlogits.slice();
        state.dflat = state.Wfc.map((row) => row.reduce((sum, weight, index) => sum + weight * state.dlogits[index], 0));
        return state.dflat;
    }

    function backwardFlatten() {
        if (!state.dflat.length) backwardFC();
        state.dpool = [
            [state.dflat[0], state.dflat[1]],
            [state.dflat[2], state.dflat[3]]
        ];
        return state.dpool;
    }

    function backwardPool() {
        if (!state.dpool.length) backwardFlatten();
        state.dA = zeros(4, 4);
        for (let pr = 0; pr < 2; pr += 1) {
            for (let pc = 0; pc < 2; pc += 1) {
                for (let r = pr * 2; r < pr * 2 + 2; r += 1) {
                    for (let c = pc * 2; c < pc * 2 + 2; c += 1) {
                        if (state.poolMask[r][c]) state.dA[r][c] = state.dpool[pr][pc];
                    }
                }
            }
        }
        return state.dA;
    }

    function backwardRelu() {
        if (!state.dA.length) backwardPool();
        state.dZconv = state.dA.map((row, r) => row.map((value, c) => (state.Zconv[r][c] > 0 ? value : 0)));
        return state.dZconv;
    }

    function backwardConvStep(index, accumulate = true) {
        if (!state.dZconv.length) backwardRelu();
        const { r, c } = convPosition(index);
        const patch = getPatch(r, c);
        const grad = state.dZconv[r][c];
        const contribution = patch.map((row) => row.map((value) => value * grad));
        if (accumulate) {
            for (let u = 0; u < 3; u += 1) {
                for (let v = 0; v < 3; v += 1) {
                    state.dK[u][v] += contribution[u][v];
                }
            }
            state.dbConv += grad;
        }
        return { r, c, patch, grad, contribution };
    }

    function backwardConvAll(limit = 15) {
        state.dK = zeros(3, 3);
        state.dbConv = 0;
        for (let i = 0; i <= limit; i += 1) backwardConvStep(i, true);
        return state.dK;
    }

    function runFullBackward() {
        ensureForwardReady();
        backwardSoftmaxLoss();
        backwardFC();
        backwardFlatten();
        backwardPool();
        backwardRelu();
        backwardConvAll();
        state.mode = "backward";
        state.currentTab = "backward";
        state.currentStep = backwardSteps().length - 1;
        setMessage("完整反向传播已完成，现可点击更新参数。");
        renderAll();
    }

    function updateParams() {
        ensureBackwardReady();
        const oldK = cloneMatrix(state.K);
        const oldWfc = cloneMatrix(state.Wfc);
        const oldBfc = state.bfc.slice();
        const oldBConv = state.bConv;
        state.K = state.K.map((row, r) => row.map((value, c) => value - state.lr * state.dK[r][c]));
        state.bConv -= state.lr * state.dbConv;
        state.Wfc = state.Wfc.map((row, r) => row.map((value, c) => value - state.lr * state.dWfc[r][c]));
        state.bfc = state.bfc.map((value, index) => value - state.lr * state.dbfc[index]);
        state.updatedSnapshot = { oldK, oldWfc, oldBfc, oldBConv, newK: cloneMatrix(state.K), newWfc: cloneMatrix(state.Wfc), newBfc: state.bfc.slice(), newBConv: state.bConv };
        clearForwardAfterUpdate();
        state.mode = "update";
        state.currentTab = "backward";
        setMessage("参数已按 K_new = K_old - lr × dK 完成更新。");
        renderAll();
    }

    function clearForwardAfterUpdate() {
        const snapshot = state.updatedSnapshot;
        clearComputed();
        state.updatedSnapshot = snapshot;
    }

    function ensureForwardReady() {
        if (!state.probs.length) {
            forwardConvAll();
            forwardRelu();
            forwardPool();
            forwardFlatten();
            forwardFC();
            forwardSoftmaxLoss();
        }
    }

    function ensureBackwardReady() {
        ensureForwardReady();
        if (!state.dK.flat().some((value) => value !== 0) && state.dbConv === 0) {
            backwardSoftmaxLoss();
            backwardFC();
            backwardFlatten();
            backwardPool();
            backwardRelu();
            backwardConvAll();
        }
    }

    function forwardSteps() {
        return [
            { type: "input", layer: "Input", title: "F1 输入初始化" },
            ...Array.from({ length: 16 }, (_, index) => ({ type: "conv", layer: "Conv", title: index === 0 ? "F2 Conv 第一个输出位置计算" : "F3 Conv 滑窗完整计算", convIndex: index })),
            { type: "relu", layer: "ReLU", title: "F4 ReLU 前向" },
            { type: "pool", layer: "Pool", title: "F5 MaxPool 前向" },
            { type: "flatten", layer: "Flatten", title: "F6 Flatten" },
            { type: "fc", layer: "FC", title: "F7 FC 前向" },
            { type: "softmax", layer: "Softmax", title: "F8 Softmax" },
            { type: "loss", layer: "Loss", title: "F9 Cross Entropy Loss" }
        ];
    }

    function backwardSteps() {
        return [
            { type: "dlogits", layer: "Softmax", title: "B1 Softmax + Cross Entropy 梯度" },
            { type: "dfc", layer: "FC", title: "B2 FC 权重梯度" },
            { type: "dflatten", layer: "Flatten", title: "B3 Flatten 反向" },
            { type: "dpool", layer: "Pool", title: "B4 MaxPool 反向" },
            { type: "drelu", layer: "ReLU", title: "B5 ReLU 反向" },
            ...Array.from({ length: 16 }, (_, index) => ({ type: "dconv", layer: "Conv", title: "B6 Conv 卷积核梯度逐步累加", convIndex: index })),
            { type: "dbconv", layer: "Conv", title: "B7 Conv bias 梯度" },
            { type: "update", layer: "Loss", title: "B8 参数更新" }
        ];
    }

    function activeStep() {
        const steps = state.currentTab === "backward" ? backwardSteps() : forwardSteps();
        return steps[Math.max(0, Math.min(state.currentStep, steps.length - 1))];
    }

    function applyStepComputations(step) {
        if (!step) return;
        if (state.currentTab === "forward") {
            if (step.type === "input") return;
            if (step.type === "conv") {
                state.Zconv = zeros(4, 4);
                for (let i = 0; i <= step.convIndex; i += 1) forwardConvStep(i);
                return;
            }
            if (["relu", "pool", "flatten", "fc", "softmax", "loss"].includes(step.type)) {
                forwardConvAll();
                if (step.type === "relu") forwardRelu();
                if (step.type === "pool") forwardPool();
                if (step.type === "flatten") forwardFlatten();
                if (step.type === "fc") forwardFC();
                if (step.type === "softmax" || step.type === "loss") forwardSoftmaxLoss();
            }
            return;
        }
        if (state.currentTab === "backward") {
            ensureForwardReady();
            backwardSoftmaxLoss();
            if (step.type === "dlogits") return;
            backwardFC();
            if (step.type === "dfc") return;
            backwardFlatten();
            if (step.type === "dflatten") return;
            backwardPool();
            if (step.type === "dpool") return;
            backwardRelu();
            if (step.type === "drelu") return;
            if (step.type === "dconv") backwardConvAll(step.convIndex);
            if (step.type === "dbconv" || step.type === "update") backwardConvAll();
        }
    }

    function setMessage(text, isError = false) {
        els.message.textContent = text;
        els.message.classList.toggle("is-error", isError);
    }

    function renderAll() {
        state.lr = Number(els.lr.value) || 0.1;
        state.label = Number(els.label.value) || 1;
        els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === state.currentTab));
        if (state.currentTab === "overview") renderOverview();
        if (state.currentTab === "forward") renderForward();
        if (state.currentTab === "backward") renderBackward();
        if (state.currentTab === "application") renderApplication();
        renderFlowBar();
        renderFormulaPanel();
        renderDetailPanel();
        updateScene();
    }

    function currentSceneStep() {
        if (state.currentTab === "overview" || state.currentTab === "application") return null;
        return activeStep();
    }

    function updateScene() {
        if (!state.scene && window.CnnScene && els.sceneMount) {
            state.scene = window.CnnScene.init(els.sceneMount);
        }
        const step = currentSceneStep();
        const activeLayer = state.currentTab === "overview" || state.currentTab === "application"
            ? state.selectedLayer
            : layerForStep(step);
        state.activeLayer = activeLayer || "conv";
        state.scene?.update?.({
            state,
            step,
            mode: state.currentTab === "backward" ? (step?.type === "update" || state.mode === "update" ? "update" : "backward") : "forward",
            activeLayer: state.activeLayer
        });
    }

    function renderFlowBar() {
        const step = activeStep();
        els.flow.innerHTML = flowLayers.map((layer, index) => {
            const active = step?.layer === layer || (state.currentTab === "overview" && state.selectedLayer.toLowerCase() === layer.toLowerCase());
            return `<button class="cnn-flow-node ${active ? `is-active ${state.mode}` : ""}" type="button" data-flow-index="${index}">
                <strong>${layer}</strong>
                <span>${["6×6", "3×3/4×4", "4×4", "2×2", "4", "4→3", "prob", "CE"][index]}</span>
            </button>`;
        }).join("");
        els.flow.querySelectorAll("[data-flow-index]").forEach((button) => {
            button.addEventListener("click", () => {
                const layer = flowLayers[Number(button.dataset.flowIndex)].toLowerCase();
                const normalized = layer === "input" ? "input" : layer === "pool" ? "pool" : layer;
                state.selectedLayer = normalized;
                jumpToLayer(state.currentTab === "backward" ? "backward" : "forward", normalized);
            });
        });
    }

    function highlightCurrentLayer(layerKey) {
        const target = overviewLayers.find((layer) => layer.key === layerKey);
        if (!target) return;
        state.selectedLayer = layerKey;
        renderAll();
    }

    function renderOverview() {
        state.mode = "forward";
        els.status.textContent = "模型总览";
        const selected = overviewLayers.find((layer) => layer.key === state.selectedLayer) || overviewLayers[1];
        els.viz.innerHTML = `
            <section class="cnn-overview-stage">
                <div class="cnn-visual-shell">
                    ${renderPipelineScene(state.selectedLayer, "forward")}
                </div>
                <aside class="cnn-layer-detail">
                    <span class="section-label">Selected Layer</span>
                    <h3>${selected.title}</h3>
                    <dl>
                        <div><dt>输入尺寸</dt><dd>${selected.inSize}</dd></div>
                        <div><dt>输出尺寸</dt><dd>${selected.outSize}</dd></div>
                    </dl>
                    <p>${selected.role}</p>
                    <code>${selected.formula}</code>
                    <div class="cnn-layer-actions">
                        <button type="button" data-jump="forward" data-layer="${selected.key}">查看前向计算</button>
                        <button type="button" data-jump="backward" data-layer="${selected.key}">查看反向计算</button>
                    </div>
                </aside>
                <div class="cnn-size-ribbon">6×6 → 4×4 → 4×4 → 2×2 → 4 → 3</div>
            </section>`;
        els.viz.querySelectorAll("[data-stage-layer]").forEach((node) => {
            node.addEventListener("click", () => highlightCurrentLayer(node.dataset.stageLayer));
            node.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                highlightCurrentLayer(node.dataset.stageLayer);
            });
        });
        els.viz.querySelectorAll("[data-layer]").forEach((card) => {
            card.addEventListener("click", () => highlightCurrentLayer(card.dataset.layer));
        });
        els.viz.querySelectorAll("[data-jump]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                jumpToLayer(button.dataset.jump, button.dataset.layer);
            });
        });
    }

    function jumpToLayer(tab, layer) {
        state.currentTab = tab;
        const steps = tab === "backward" ? backwardSteps() : forwardSteps();
        const found = steps.findIndex((step) => step.layer.toLowerCase() === (layer === "input" ? "input" : layer));
        state.currentStep = Math.max(0, found);
        if (tab === "backward") ensureForwardReady();
        renderAll();
    }

    function layerForStep(step) {
        if (!step) return "input";
        if (step.type === "dlogits") return "softmax";
        if (step.type === "dfc") return "fc";
        if (step.type === "dflatten") return "flatten";
        if (step.type === "dpool") return "pool";
        if (step.type === "drelu") return "relu";
        if (step.type === "dconv" || step.type === "dbconv") return "conv";
        if (step.type === "update" || step.type === "loss") return "loss";
        return step.layer.toLowerCase();
    }

    function renderForward() {
        state.mode = "forward";
        const step = activeStep();
        applyStepComputations(step);
        els.status.textContent = `${step.title} · ${state.currentStep + 1}/${forwardSteps().length}`;
        els.viz.innerHTML = buildForwardWorkspace(step);
    }

    function renderBackward() {
        state.mode = activeStep()?.type === "update" || state.updatedSnapshot ? "update" : "backward";
        const step = activeStep();
        applyStepComputations(step);
        els.status.textContent = `${step.title} · ${state.currentStep + 1}/${backwardSteps().length}`;
        els.viz.innerHTML = buildBackwardWorkspace(step);
    }

    function renderApplication() {
        state.mode = "forward";
        els.status.textContent = "模型应用";
        const url = root.dataset.digitUrl || "/digit-recognition";
        els.viz.innerHTML = `
            <section class="cnn-application">
                <article class="cnn-app-model small">
                    <span class="section-label">Teaching Model</span>
                    <h3>教学小 CNN</h3>
                    <div class="cnn-app-flow">6×6 <b>→</b> 4×4 <b>→</b> 2×2 <b>→</b> 4 <b>→</b> 3</div>
                    <p>用于拆解每一步前向计算、梯度回传和参数更新。</p>
                </article>
                <div class="cnn-app-bridge">
                    <span>解释计算过程</span>
                    <strong>→</strong>
                    <span>迁移到真实分类</span>
                </div>
                <article class="cnn-app-model real">
                    <span class="section-label">Real Application</span>
                    <h3>手写数字识别</h3>
                    <div class="cnn-app-flow">28×28 <b>→</b> Conv <b>→</b> Pool <b>→</b> FC <b>→</b> 0~9</div>
                    <p>复用已有 canvas 输入和 NumPy CNN 推理模块。</p>
                    <a class="primary-button" href="${url}">打开手写数字识别</a>
                </article>
            </section>
        `;
    }

    function renderMatrix(matrix, options = {}) {
        const rows = matrix.length;
        const cols = matrix[0]?.length || 0;
        const active = new Set((options.active || []).map(([r, c]) => `${r},${c}`));
        const muted = new Set((options.muted || []).map(([r, c]) => `${r},${c}`));
        const maxCells = new Set((options.maxCells || []).map(([r, c]) => `${r},${c}`));
        const mode = options.mode || state.mode;
        const size = options.size || 42;
        return `<div class="cnn-matrix ${options.tilt ? "is-tilted" : ""} ${options.compact ? "is-compact" : ""}" style="grid-template-columns: repeat(${cols}, ${size}px); --cnn-cell:${size}px">
            ${matrix.map((row, r) => row.map((value, c) => `
                <div class="cnn-cell ${active.has(`${r},${c}`) ? `is-active ${mode}` : ""} ${muted.has(`${r},${c}`) ? "is-muted" : ""} ${maxCells.has(`${r},${c}`) ? "is-max" : ""}">
                    ${formatNumber(value)}
                </div>
            `).join("")).join("")}
        </div>`;
    }

    function renderVector(vector, options = {}) {
        const active = new Set(options.active || []);
        const mode = options.mode || state.mode;
        return `<div class="cnn-vector">
            ${vector.map((value, index) => `<div class="cnn-cell ${active.has(index) ? `is-active ${mode}` : ""}">${formatNumber(value)}</div>`).join("")}
        </div>`;
    }

    function renderPipelineScene(activeLayer, mode = "forward") {
        const nodes = [
            { key: "input", title: "Input Tensor", body: renderMatrix(state.X, { size: 18, tilt: true, compact: true }) },
            { key: "conv", title: "Conv Kernel", body: renderMatrix(state.K, { size: 24, compact: true }) },
            { key: "relu", title: "Feature / ReLU", body: renderMatrix(state.A.length ? state.A : zeros(4, 4), { size: 20, compact: true }) },
            { key: "pool", title: "Pooled Map", body: renderMatrix(state.pool.length ? state.pool : zeros(2, 2), { size: 28, compact: true }) },
            { key: "flatten", title: "Flatten", body: renderVector(state.flat.length ? state.flat : [0, 0, 0, 0]) },
            { key: "fc", title: "FC Nodes", body: renderFCGraph(false) },
            { key: "softmax", title: "Softmax", body: renderProbabilityBars(state.probs.length ? state.probs : [0.33, 0.34, 0.33]) },
            { key: "loss", title: "Loss", body: `<strong class="cnn-loss-value">${formatNumber(state.loss || 0)}</strong>` }
        ];
        return `
            <div class="cnn-pipeline-scene ${mode}">
                <svg class="cnn-stage-links" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
                    ${nodes.slice(0, -1).map((_, index) => {
                        const x1 = 92 + index * 132;
                        const x2 = 142 + index * 132;
                        return `<path class="${mode}" d="M ${x1} 110 C ${x1 + 32} 72, ${x2 - 20} 148, ${x2 + 28} 110" />`;
                    }).join("")}
                </svg>
                ${nodes.map((node) => `
                    <div class="cnn-stage-node ${node.key === activeLayer ? `is-active ${mode}` : ""}" role="button" tabindex="0" data-stage-layer="${node.key}">
                        <span>${node.title}</span>
                        ${node.body}
                    </div>
                `).join("")}
            </div>`;
    }

    function renderStageShell(title, subtitle, activeLayer, body, mode = state.mode) {
        return `
            <section class="cnn-visual-shell ${mode}">
                <header class="cnn-stage-title">
                    <div>
                        <span>${mode === "backward" ? "Gradient Flow" : mode === "update" ? "Parameter Update" : "Forward Stage"}</span>
                        <h3>${title}</h3>
                    </div>
                    <strong>${subtitle}</strong>
                </header>
                ${renderPipelineScene(activeLayer, mode)}
                <div class="cnn-stage-workbench">${body}</div>
            </section>`;
    }

    function renderOperator(text, mode = state.mode) {
        return `<div class="cnn-operator ${mode}">${text}</div>`;
    }

    function renderProbabilityBars(values) {
        const maxValue = Math.max(...values);
        return `<div class="cnn-prob-bars">
            ${values.map((value, index) => `
                <div class="cnn-prob-row ${index === state.label ? "is-label" : ""} ${value === maxValue ? "is-max-prob" : ""}">
                    <span>${index}</span>
                    <div><i style="width:${Math.max(4, value * 100)}%"></i></div>
                    <strong>${formatNumber(value * 100)}%</strong>
                </div>
            `).join("")}
        </div>`;
    }

    function renderFCGraph(highlight = true) {
        const lines = [];
        for (let i = 0; i < 4; i += 1) {
            for (let j = 0; j < 3; j += 1) {
                const active = highlight && (state.currentTab === "backward" ? i === 1 && j === 2 : j === 1);
                lines.push(`<line class="${active ? "is-active" : ""}" x1="34" y1="${24 + i * 34}" x2="170" y2="${42 + j * 42}" />`);
            }
        }
        return `<svg class="cnn-fc-graph" viewBox="0 0 205 152" aria-label="FC nodes">
            ${lines.join("")}
            ${[0, 1, 2, 3].map((i) => `<circle class="in-node" cx="28" cy="${24 + i * 34}" r="10" /><text x="28" y="${29 + i * 34}">f${i}</text>`).join("")}
            ${[0, 1, 2].map((i) => `<circle class="out-node" cx="178" cy="${42 + i * 42}" r="12" /><text x="178" y="${47 + i * 42}">c${i}</text>`).join("")}
        </svg>`;
    }

    function buildForwardWorkspace(step) {
        const activeLayer = layerForStep(step);
        if (step.type === "input") {
            return renderStageShell(step.title, "6×6 输入张量", activeLayer, `
                <div class="cnn-tensor-lane single">
                    <div class="cnn-tensor-card hero">${renderMatrix(state.X, { size: 38, tilt: true })}<b>Input X</b></div>
                    <div class="cnn-dimension-track">6×6 → 4×4 → 4×4 → 2×2 → 4 → 3</div>
                </div>`);
        }
        if (step.type === "conv") {
            const { r, c, patch } = forwardConvStep(step.convIndex);
            const activeInput = [];
            for (let u = 0; u < 3; u += 1) for (let v = 0; v < 3; v += 1) activeInput.push([r + u, c + v]);
            const product = patch.map((row, u) => row.map((value, v) => value * state.K[u][v]));
            return renderStageShell(step.title, `写入 Z[${r},${c}]`, activeLayer, `
                <div class="cnn-tensor-lane">
                    <div class="cnn-tensor-card hero">${renderMatrix(state.X, { active: activeInput, mode: "forward", size: 28, tilt: true })}<b>Input Patch</b></div>
                    ${renderOperator("×", "forward")}
                    <div class="cnn-tensor-card floating">${renderMatrix(state.K, { active: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], mode: "forward", size: 34 })}<b>Kernel</b></div>
                    ${renderOperator("→", "forward")}
                    <div class="cnn-tensor-card">${renderMatrix(product, { mode: "forward", size: 34 })}<b>Product</b></div>
                    ${renderOperator("Σ+b", "forward")}
                    <div class="cnn-tensor-card feature-stack">${renderMatrix(state.Zconv, { active: [[r, c]], mode: "forward", size: 30 })}<b>Feature Map</b></div>
                </div>`);
        }
        if (step.type === "relu") {
            const muted = [];
            state.Zconv.forEach((row, r) => row.forEach((value, c) => { if (value <= 0) muted.push([r, c]); }));
            return renderStageShell(step.title, "负数响应置 0", activeLayer, `
                <div class="cnn-tensor-lane">
                    <div class="cnn-tensor-card">${renderMatrix(state.Zconv, { muted, size: 34 })}<b>Conv Z</b></div>
                    ${renderOperator("max(0,z)", "forward")}
                    <div class="cnn-tensor-card glow">${renderMatrix(state.A, { muted, mode: "forward", size: 34 })}<b>ReLU A</b></div>
                </div>`);
        }
        if (step.type === "pool") {
            const maxCells = [];
            state.poolMask.forEach((row, r) => row.forEach((value, c) => { if (value) maxCells.push([r, c]); }));
            return renderStageShell(step.title, "2×2 区域取最大值", activeLayer, `
                <div class="cnn-tensor-lane">
                    <div class="cnn-tensor-card pool-region">${renderMatrix(state.A, { maxCells, size: 34 })}<b>Activation 4×4</b></div>
                    ${renderOperator("max", "forward")}
                    <div class="cnn-tensor-card glow">${renderMatrix(state.pool, { active: [[0,0],[0,1],[1,0],[1,1]], mode: "forward", size: 48 })}<b>Pooled 2×2</b></div>
                </div>`);
        }
        if (step.type === "flatten") return renderStageShell(step.title, "2×2 reshape 为 4维", activeLayer, `<div class="cnn-tensor-lane">${renderMatrix(state.pool, { size: 48 })}${renderOperator("reshape", "forward")}${renderVector(state.flat, { active: [0,1,2,3] })}</div>`);
        if (step.type === "fc") return renderStageShell(step.title, "全连接分类映射", activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card">${renderVector(state.flat)}<b>flat</b></div>${renderFCGraph(true)}<div class="cnn-tensor-card">${renderVector(state.logits, { active: [0,1,2] })}<b>logits</b></div></div>`);
        if (step.type === "softmax") return renderStageShell(step.title, "得分归一化为概率", activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card">${renderVector(state.logits)}<b>logits</b></div>${renderOperator("exp / sum", "forward")}<div class="cnn-tensor-card wide-visual">${renderProbabilityBars(state.probs)}<b>probabilities</b></div></div>`);
        if (step.type === "loss") return renderStageShell(step.title, "Cross Entropy", activeLayer, `<div class="cnn-loss-stage"><div>${renderProbabilityBars(state.probs)}</div><div class="cnn-loss-card"><span>label=${state.label}</span><strong>L=${formatNumber(state.loss)}</strong><em>-log(p_true)</em></div></div>`);
        return "";
    }

    function buildBackwardWorkspace(step) {
        const activeLayer = layerForStep(step);
        if (step.type === "dlogits") return renderStageShell(step.title, "Loss → logits", activeLayer, `<div class="cnn-tensor-lane">${renderProbabilityBars(state.probs)}${renderOperator("-", "backward")}${renderVector(oneHot(state.label), { active: [state.label], mode: "backward" })}${renderOperator("=", "backward")}${renderVector(state.dlogits, { active: [0,1,2], mode: "backward" })}</div>`, "backward");
        if (step.type === "dfc") return renderStageShell(step.title, "flat × dlogits", activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card">${renderVector(state.flat, { active: [1], mode: "backward" })}<b>flat</b></div>${renderOperator("⊗", "backward")}<div class="cnn-tensor-card">${renderVector(state.dlogits, { active: [2], mode: "backward" })}<b>dlogits</b></div>${renderOperator("=", "backward")}<div class="cnn-tensor-card">${renderMatrix(state.dWfc, { active: [[1,2]], mode: "backward", size: 34 })}<b>dWfc</b></div>${renderFCGraph(true)}</div>`, "backward");
        if (step.type === "dflatten") return renderStageShell(step.title, "vector → matrix", activeLayer, `<div class="cnn-tensor-lane">${renderVector(state.dflat, { active: [0,1,2,3], mode: "backward" })}${renderOperator("reshape", "backward")}${renderMatrix(state.dpool, { active: [[0,0],[0,1],[1,0],[1,1]], mode: "backward", size: 48 })}</div>`, "backward");
        if (step.type === "dpool") {
            const maxCells = [];
            state.poolMask.forEach((row, r) => row.forEach((value, c) => { if (value) maxCells.push([r, c]); }));
            return renderStageShell(step.title, "梯度只回到最大值位置", activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card pool-region">${renderMatrix(state.A, { maxCells, size: 34 })}<b>forward max mask</b></div>${renderOperator("route", "backward")}<div class="cnn-tensor-card">${renderMatrix(state.dpool, { mode: "backward", size: 48 })}<b>dPool</b></div>${renderOperator("→", "backward")}<div class="cnn-tensor-card gradient-map">${renderMatrix(state.dA, { active: maxCells, mode: "backward", size: 34 })}<b>dA</b></div></div>`, "backward");
        }
        if (step.type === "drelu") {
            const muted = [];
            state.Zconv.forEach((row, r) => row.forEach((value, c) => { if (value <= 0) muted.push([r, c]); }));
            return renderStageShell(step.title, "Z<=0 阻断梯度", activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card block-mask">${renderMatrix(state.Zconv, { muted, size: 34 })}<b>Z mask</b></div>${renderOperator("×", "backward")}<div class="cnn-tensor-card">${renderMatrix(state.dA, { mode: "backward", size: 34 })}<b>dA</b></div>${renderOperator("=", "backward")}<div class="cnn-tensor-card gradient-map">${renderMatrix(state.dZconv, { muted, mode: "backward", size: 34 })}<b>dZ</b></div></div>`, "backward");
        }
        if (step.type === "dconv") {
            const info = backwardConvStep(step.convIndex, false);
            const activeInput = [];
            for (let u = 0; u < 3; u += 1) for (let v = 0; v < 3; v += 1) activeInput.push([info.r + u, info.c + v]);
            return renderStageShell(step.title, `dZ[${info.r},${info.c}] contribution`, activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card hero">${renderMatrix(state.X, { active: activeInput, mode: "backward", size: 28, tilt: true })}<b>Input patch</b></div><div class="cnn-tensor-card">${renderMatrix(state.dZconv, { active: [[info.r, info.c]], mode: "backward", size: 30 })}<b>dZ</b></div>${renderOperator("patch×dZ", "backward")}<div class="cnn-tensor-card">${renderMatrix(info.contribution, { mode: "backward", size: 34 })}<b>contribution</b></div>${renderOperator("+", "backward")}<div class="cnn-tensor-card gradient-map">${renderMatrix(state.dK, { mode: "backward", size: 34 })}<b>累计 dK</b></div></div>`, "backward");
        }
        if (step.type === "dbconv") return renderStageShell(step.title, "所有 dZ 求和", activeLayer, `<div class="cnn-tensor-lane"><div class="cnn-tensor-card">${renderMatrix(state.dZconv, { mode: "backward", size: 34 })}<b>dZconv</b></div>${renderOperator("Σ", "backward")}<div class="cnn-loss-card orange"><strong>${formatNumber(state.dbConv)}</strong><em>db_conv</em></div></div>`, "backward");
        return buildUpdateCards();
    }

    function buildUpdateCards() {
        const snap = state.updatedSnapshot;
        if (!snap) return renderStageShell("B8 参数更新", "点击更新参数查看前后对比", "loss", `<div class="cnn-tensor-lane"><div class="cnn-tensor-card">${renderMatrix(state.K)}<b>K_old</b></div>${renderOperator("-", "update")}<div class="cnn-tensor-card">${renderMatrix(state.dK, { mode: "update" })}<b>lr × dK</b></div><div class="cnn-tensor-card wide-visual">${renderMatrix(state.dWfc, { mode: "update", size: 30 })}<b>dWfc</b></div></div>`, "update");
        return renderStageShell("B8 参数更新", "绿色为更新后参数", "loss", `<div class="cnn-tensor-lane"><div class="cnn-tensor-card">${renderMatrix(snap.oldK)}<b>K_old</b></div>${renderOperator("→", "update")}<div class="cnn-tensor-card glow">${renderMatrix(snap.newK, { mode: "update" })}<b>K_new</b></div><div class="cnn-tensor-card">${renderMatrix(snap.oldWfc, { size: 30 })}<b>W_old</b></div>${renderOperator("→", "update")}<div class="cnn-tensor-card glow">${renderMatrix(snap.newWfc, { mode: "update", size: 30 })}<b>W_new</b></div></div>`, "update");
    }

    function card(title, body, extraClass = "") {
        return `<article class="cnn-card ${extraClass}"><h3>${title}</h3>${body}</article>`;
    }

    function cards(items) {
        return `<div class="cnn-workspace">${items.join("")}</div>`;
    }

    function renderFormulaPanel() {
        if (state.currentTab === "overview") {
            const layer = overviewLayers.find((item) => item.key === state.selectedLayer) || overviewLayers[1];
            els.formulaTitle.textContent = `${layer.title} 层作用`;
            els.formulaBody.innerHTML = formulaBlock(layer.formula, `输入尺寸：${layer.inSize}\n输出尺寸：${layer.outSize}`, layer.role);
            return;
        }
        if (state.currentTab === "application") {
            els.formulaTitle.textContent = "小模型与真实应用";
            els.formulaBody.innerHTML = formulaBlock("教学模型解释计算，真实模型展示应用", "6×6 小 CNN → 28×28 手写数字 CNN", "不重写手写识别功能，只提供课程展示入口。");
            return;
        }
        const step = activeStep();
        els.formulaTitle.textContent = step.title;
        els.formulaBody.innerHTML = formulaForStep(step);
    }

    function formulaForStep(step) {
        if (!step) return "";
        const formulas = {
            input: ["X 为固定 6×6 输入", "显示完整输入张量。", "后续卷积窗口从 X 中滑动取 3×3 patch。"],
            conv: ["z[i,j] = Σ X[i+u,j+v] × K[u,v] + b", convFormulaText(step.convIndex), "当前 patch 与 kernel 逐元素相乘，求和后写入 feature map。"],
            relu: ["A = max(0, Z)", "Z <= 0 → 0", "负数响应被截断，正数响应保留。"],
            pool: ["P[i,j] = max(2×2 region)", "每个 2×2 区域只保留最大值。", "最大值位置会在反向传播中接收梯度。"],
            flatten: ["flat = reshape(P)", `[${state.pool.flat().map(formatNumber).join(", ")}]`, "把 2×2 特征图按行展开成 4 维向量。"],
            fc: ["logits = flat × Wfc + bfc", `logits = [${state.logits.map(formatNumber).join(", ")}]`, "全连接层把 4 维特征映射到 3 个类别得分。"],
            softmax: ["p_i = exp(logit_i) / Σ exp(logit_j)", `p = [${state.probs.map(formatNumber).join(", ")}]`, "Softmax 将 logits 转成概率分布。"],
            loss: ["L = -log(p_true)", `label=${state.label}, L=-log(${formatNumber(state.probs[state.label])})=${formatNumber(state.loss)}`, "交叉熵衡量真实类别概率是否足够高。"],
            dlogits: ["dlogits = probs - onehot(label)", `[${state.probs.map(formatNumber).join(", ")}] - [${oneHot(state.label).join(", ")}] = [${state.dlogits.map(formatNumber).join(", ")}]`, "Softmax 与交叉熵组合后，logits 梯度简化为预测概率减去 one-hot 标签。"],
            dfc: ["dWfc[i,j] = flat[i] × dlogits[j]\ndbfc[j] = dlogits[j]\ndflat[i] = Σ Wfc[i,j] × dlogits[j]", `dWfc[1,2] = ${formatNumber(state.flat[1])} × ${formatNumber(state.dlogits[2])} = ${formatNumber(state.dWfc[1]?.[2])}`, "FC 权重梯度是输入特征和上游梯度的外积。"],
            dflatten: ["dPool = reshape(dflat, 2×2)", `dflat=[${state.dflat.map(formatNumber).join(", ")}]`, "Flatten 不改变数值，只改变梯度形状。"],
            dpool: ["dA[position_of_max] = dPool[i,j]\nothers = 0", "非最大值位置梯度为 0。", "MaxPool 反向只把梯度传给前向最大值位置。"],
            drelu: ["dZ = dA × 1(Z > 0)", "Z <= 0 的位置梯度被置 0。", "ReLU 的 mask 会阻断负数响应对应的梯度。"],
            dconv: ["dK[u,v] = Σ X[i+u,j+v] × dZ[i,j]", convGradFormulaText(step.convIndex), "每个输出位置贡献一个 patch × dZ，所有 contribution 累加得到 dK。"],
            dbconv: ["db_conv = Σ dZ[i,j]", `db_conv = ${formatNumber(state.dbConv)}`, "卷积 bias 对所有输出位置共享，因此梯度为 dZ 总和。"],
            update: ["K_new = K_old - lr × dK\nWfc_new = Wfc_old - lr × dWfc\nb_new = b_old - lr × db", `lr = ${formatNumber(state.lr)}`, "参数沿负梯度方向更新。"]
        };
        const [formula, numeric, explanation] = formulas[step.type] || ["", "", ""];
        return formulaBlock(formula, numeric, explanation);
    }

    function formulaBlock(formula, numeric, explanation) {
        return `
            <div class="cnn-formula-section">
                <strong>公式</strong>
                <code>${formula}</code>
            </div>
            <div class="cnn-formula-section">
                <strong>数值代入</strong>
                <code>${numeric}</code>
            </div>
            <p>${explanation}</p>`;
    }

    function convFormulaText(index) {
        if (!Number.isInteger(index)) return "";
        const info = forwardConvStep(index);
        const terms = info.patch.flat().map((value, i) => `${value}×${formatNumber(state.K.flat()[i])}`);
        return `z[${info.r},${info.c}] = ${terms.join(" + ")} + ${formatNumber(state.bConv)} = ${formatNumber(info.value)}`;
    }

    function convGradFormulaText(index) {
        const info = backwardConvStep(index, false);
        return `当前位置 dZ[${info.r},${info.c}] = ${formatNumber(info.grad)}，contribution = patch × ${formatNumber(info.grad)}`;
    }

    function renderDetailPanel() {
        els.detailTitle.textContent = state.currentTab === "backward" ? "反向传播关键数值" : state.currentTab === "forward" ? "前向传播关键数值" : "关键数值";
        if (state.currentTab === "overview") {
            els.detailBody.innerHTML = detailItem("教学 CNN 结构", "<code>Input 6×6 → Conv 3×3 → ReLU → MaxPool 2×2 → Flatten → FC 4→3 → Softmax → Loss</code>");
            return;
        }
        if (state.currentTab === "application") {
            els.detailBody.innerHTML = detailItem("真实应用入口", "<code>/digit-recognition\n复用已有手写数字识别页面和推理接口。</code>");
            return;
        }
        const step = activeStep();
        els.detailBody.innerHTML = detailForStep(step);
    }

    function detailForStep(step) {
        if (state.currentTab === "forward" && step?.type === "input") {
            return [
                detailItem("Input Tensor", renderMatrix(state.X, { size: 30 })),
                detailItem("Kernel", renderMatrix(state.K, { size: 30 })),
                detailItem("Shape Path", "<code>6×6 → 4×4 → 4×4 → 2×2 → 4 → 3</code>")
            ].join("");
        }
        if (state.currentTab === "forward" && step?.type === "conv") {
            const info = forwardConvStep(step.convIndex);
            const product = info.patch.map((row, r) => row.map((value, c) => value * state.K[r][c]));
            return [
                detailItem("当前 patch", renderMatrix(info.patch, { size: 30 })),
                detailItem("当前 kernel", renderMatrix(state.K, { size: 30 })),
                detailItem("逐元素乘积", renderMatrix(product, { size: 30 })),
                detailItem("sum + bias", `<code>${product.flat().map(formatNumber).join(" + ")} + ${formatNumber(state.bConv)} = ${formatNumber(info.value)}</code>`)
            ].join("");
        }
        if (state.currentTab === "forward" && step?.type === "relu") {
            const clipped = state.Zconv.flat().filter((value) => value <= 0).length;
            return [
                detailItem("被截断位置", `<code>${clipped} 个 Z<=0 的格子输出为 0</code>`),
                detailItem("Conv Z", renderMatrix(state.Zconv, { size: 30 })),
                detailItem("ReLU A", renderMatrix(state.A, { size: 30 }))
            ].join("");
        }
        if (state.currentTab === "forward" && step?.type === "pool") {
            const maxCells = [];
            state.poolMask.forEach((row, r) => row.forEach((value, c) => { if (value) maxCells.push([r, c]); }));
            return [
                detailItem("最大值 mask", renderMatrix(state.poolMask, { maxCells, size: 30 })),
                detailItem("Pool output", renderMatrix(state.pool, { size: 36 })),
                detailItem("说明", "<code>每个 2×2 region 只有一个最大值进入输出。</code>")
            ].join("");
        }
        if (state.currentTab === "forward" && ["flatten", "fc", "softmax", "loss"].includes(step?.type)) {
            return [
                detailItem("flat", renderVector(state.flat)),
                detailItem("logits", renderVector(state.logits)),
                detailItem("probs / loss", `<code>p=[${state.probs.map(formatNumber).join(", ")}]\nlabel=${state.label}\nL=${formatNumber(state.loss)}</code>`)
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "dlogits") {
            return [
                detailItem("probs", renderVector(state.probs)),
                detailItem("one-hot", renderVector(oneHot(state.label), { active: [state.label], mode: "backward" })),
                detailItem("dlogits", renderVector(state.dlogits, { active: [0, 1, 2], mode: "backward" }))
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "dfc") {
            return [
                detailItem("数值代入", `<code>dWfc[1,2] = ${formatNumber(state.flat[1])} × ${formatNumber(state.dlogits[2])} = ${formatNumber(state.dWfc[1]?.[2])}</code>`),
                detailItem("dWfc", renderMatrix(state.dWfc, { active: [[1, 2]], mode: "backward", size: 30 })),
                detailItem("dflat", renderVector(state.dflat, { mode: "backward" }))
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "dflatten") {
            return [
                detailItem("dflat", renderVector(state.dflat, { mode: "backward" })),
                detailItem("dPool", renderMatrix(state.dpool, { mode: "backward", size: 36 })),
                detailItem("说明", "<code>Flatten 反向只恢复形状。</code>")
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "dpool") {
            const maxCells = [];
            state.poolMask.forEach((row, r) => row.forEach((value, c) => { if (value) maxCells.push([r, c]); }));
            return [
                detailItem("最大值位置", renderMatrix(state.poolMask, { maxCells, size: 30 })),
                detailItem("dPool", renderMatrix(state.dpool, { mode: "backward", size: 36 })),
                detailItem("dA 路由结果", renderMatrix(state.dA, { active: maxCells, mode: "backward", size: 30 }))
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "drelu") {
            const muted = [];
            state.Zconv.forEach((row, r) => row.forEach((value, c) => { if (value <= 0) muted.push([r, c]); }));
            return [
                detailItem("ReLU mask", renderMatrix(state.Zconv, { muted, size: 30 })),
                detailItem("dA", renderMatrix(state.dA, { mode: "backward", size: 30 })),
                detailItem("dZ", renderMatrix(state.dZconv, { muted, mode: "backward", size: 30 }))
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "dconv") {
            const info = backwardConvStep(step.convIndex, false);
            return [
                detailItem("当前上游梯度", `<code>dZ[${info.r},${info.c}] = ${formatNumber(info.grad)}</code>`),
                detailItem("patch", renderMatrix(info.patch, { size: 30 })),
                detailItem("dK contribution", renderMatrix(info.contribution, { size: 30, mode: "backward" })),
                detailItem("累计 dK", renderMatrix(state.dK, { size: 30, mode: "backward" }))
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "dbconv") {
            return [
                detailItem("dZconv", renderMatrix(state.dZconv, { mode: "backward", size: 30 })),
                detailItem("db_conv", `<code>${state.dZconv.flat().map(formatNumber).join(" + ")} = ${formatNumber(state.dbConv)}</code>`)
            ].join("");
        }
        if (state.currentTab === "backward" && step?.type === "update") {
            const snap = state.updatedSnapshot;
            if (!snap) return detailItem("更新公式", `<code>K_new = K_old - ${formatNumber(state.lr)} × dK\n点击“更新参数”查看前后对比。</code>`);
            return [
                detailItem("K[0,0]", `<code>${formatNumber(snap.oldK[0][0])} → ${formatNumber(snap.newK[0][0])}</code>`),
                detailItem("Wfc[1,2]", `<code>${formatNumber(snap.oldWfc[1][2])} → ${formatNumber(snap.newWfc[1][2])}</code>`),
                detailItem("b_conv", `<code>${formatNumber(snap.oldBConv)} → ${formatNumber(snap.newBConv)}</code>`)
            ].join("");
        }
        return detailItem(step?.title || "当前步骤", formulaForStep(step));
    }

    function detailItem(title, body) {
        return `<div class="cnn-detail-item"><strong>${title}</strong>${body}</div>`;
    }

    function nextStep() {
        if (state.currentTab === "overview") state.currentTab = "forward";
        if (state.currentTab === "application") return;
        const steps = state.currentTab === "backward" ? backwardSteps() : forwardSteps();
        state.currentStep = Math.min(steps.length - 1, state.currentStep + 1);
        renderAll();
    }

    function prevStep() {
        if (state.currentTab === "application" || state.currentTab === "overview") return;
        state.currentStep = Math.max(0, state.currentStep - 1);
        renderAll();
    }

    function startAuto() {
        stopAuto();
        state.timer = window.setInterval(() => {
            const steps = state.currentTab === "backward" ? backwardSteps() : forwardSteps();
            if (state.currentStep >= steps.length - 1) {
                stopAuto();
                return;
            }
            nextStep();
        }, 900);
    }

    function stopAuto() {
        if (state.timer) {
            window.clearInterval(state.timer);
            state.timer = null;
        }
    }

    function bindEvents() {
        els.tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                stopAuto();
                state.currentTab = tab.dataset.tab;
                state.currentStep = 0;
                if (state.currentTab === "backward") ensureForwardReady();
                renderAll();
            });
        });
        els.viewButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.scene?.setView?.(button.dataset.view, state.activeLayer);
            });
        });
        els.prev.addEventListener("click", prevStep);
        els.next.addEventListener("click", nextStep);
        els.auto.addEventListener("click", startAuto);
        els.pause.addEventListener("click", stopAuto);
        els.runForward.addEventListener("click", runFullForward);
        els.runBackward.addEventListener("click", runFullBackward);
        els.update.addEventListener("click", updateParams);
        els.reset.addEventListener("click", resetDemo);
        els.lr.addEventListener("change", () => {
            state.lr = Number(els.lr.value) || 0.1;
            renderAll();
        });
        els.label.addEventListener("change", () => {
            clearComputed();
            state.label = Number(els.label.value) || 1;
            setMessage("标签已修改，后续前向和反向计算会使用新标签。");
            renderAll();
        });
    }

    initState();
    bindEvents();
    renderAll();

    window.cnnVisualizationState = state;
}());
