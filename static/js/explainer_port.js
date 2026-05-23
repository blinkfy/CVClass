(function () {
    "use strict";

    const root = document.getElementById("cnnExplainerPort");
    if (!root) {
        return;
    }

    if (!window.d3) {
        root.querySelector(".ce-network-panel").innerHTML = "<p class='ce-fallback'>D3.js 加载失败，无法显示 CNN Explainer 页。</p>";
        return;
    }

    const assetsBase = root.dataset.assetsBase || "";
    const modelUrl = root.dataset.modelUrl || "";
    const imageOptions = [
        { file: "boat_1.jpeg", label: "救生艇" },
        { file: "bug_1.jpeg", label: "瓢虫" },
        { file: "pizza_1.jpeg", label: "披萨" },
        { file: "pepper_1.jpeg", label: "甜椒" },
        { file: "bus_1.jpeg", label: "校车" },
        { file: "koala_1.jpeg", label: "考拉" },
        { file: "espresso_1.jpeg", label: "浓缩咖啡" },
        { file: "panda_1.jpeg", label: "小熊猫" },
        { file: "orange_1.jpeg", label: "橙子" },
        { file: "car_1.jpeg", label: "跑车" }
    ];

    const sourceImages = [...imageOptions];
    let uploadedImageCount = 0;
    const imageClassNames = imageOptions.map((item) => item.label);
    const digitClassNames = Array.from({ length: 10 }, (_, index) => String(index));
    let classNames = imageClassNames;
    const imageLayerDefs = [
        { name: "input", shortName: "input", type: "input", count: 3, matrix: 16, input: "-", output: "64 × 64 × 3", desc: "输入层把一张 RGB 图片拆成 Red、Green、Blue 三个通道，每个通道作为一个张量切片进入 CNN。", formula: "X \\in \\mathbb{R}^{64 \\times 64 \\times 3}" },
        { name: "conv_1_1", shortName: "conv", type: "conv", count: 10, matrix: 12, input: "64 × 64 × 3", output: "62 × 62 × 10", desc: "卷积层使用多个 3×3 kernel 在输入张量上滑动，得到一组 activation maps。", formula: "Z^{(k)} = \\sum_c X^{(c)} \\ast K^{(k,c)} + b^{(k)}" },
        { name: "relu_1_1", shortName: "relu", type: "relu", count: 10, matrix: 12, input: "62 × 62 × 10", output: "62 × 62 × 10", desc: "ReLU 对卷积输出逐元素截断，把小于 0 的响应置为 0，保留更强的正向激活。", formula: "A = \\max(0, Z)" },
        { name: "conv_1_2", shortName: "conv", type: "conv", count: 10, matrix: 10, input: "62 × 62 × 10", output: "60 × 60 × 10", desc: "第二个卷积层继续组合第一组卷积特征，得到更稳定的局部模式响应。", formula: "Z^{(k)} = \\sum_c A^{(c)} \\ast K^{(k,c)} + b^{(k)}" },
        { name: "relu_1_2", shortName: "relu", type: "relu", count: 10, matrix: 10, input: "60 × 60 × 10", output: "60 × 60 × 10", desc: "ReLU 对第二个卷积输出继续做逐元素非线性截断。", formula: "A = \\max(0, Z)" },
        { name: "max_pool_1", shortName: "max_pool", type: "pool", count: 10, matrix: 10, input: "60 × 60 × 10", output: "30 × 30 × 10", desc: "Max Pooling 从局部区域选择最大响应，降低空间尺寸并保留显著特征。", formula: "P_{i,j} = \\max(\\text{region}_{i,j})" },
        { name: "conv_2_1", shortName: "conv", type: "conv", count: 10, matrix: 9, input: "30 × 30 × 10", output: "28 × 28 × 10", desc: "更深的卷积层组合前一层的局部特征，形成更抽象的纹理和形状响应。", formula: "Z^{(k)} = \\sum_c P^{(c)} \\ast K^{(k,c)} + b^{(k)}" },
        { name: "relu_2_1", shortName: "relu", type: "relu", count: 10, matrix: 9, input: "28 × 28 × 10", output: "28 × 28 × 10", desc: "第二组 ReLU 继续引入非线性，让网络可以表达更复杂的分类边界。", formula: "A = \\max(0, Z)" },
        { name: "conv_2_2", shortName: "conv", type: "conv", count: 10, matrix: 8, input: "28 × 28 × 10", output: "26 × 26 × 10", desc: "最后一个卷积层进一步提取高层视觉模式，为最终分类提供特征。", formula: "Z^{(k)} = \\sum_c A^{(c)} \\ast K^{(k,c)} + b^{(k)}" },
        { name: "relu_2_2", shortName: "relu", type: "relu", count: 10, matrix: 8, input: "26 × 26 × 10", output: "26 × 26 × 10", desc: "最后一个 ReLU 保留正向高层响应，抑制负响应。", formula: "A = \\max(0, Z)" },
        { name: "max_pool_2", shortName: "max_pool", type: "pool", count: 10, matrix: 7, input: "26 × 26 × 10", output: "13 × 13 × 10", desc: "第二次 pooling 进一步压缩空间信息，使后续分类层更关注高层语义。", formula: "P_{i,j} = \\max(\\text{region}_{i,j})" },
        { name: "flatten", shortName: "flatten", type: "flatten", count: 24, matrix: 1, input: "13 × 13 × 10", output: "1690", desc: "Flatten 把 13×13×10 的三维特征图按顺序展开成一维向量，供全连接分类器使用。", formula: "\\mathrm{flat} = \\mathrm{reshape}(P)" },
        { name: "fc", shortName: "FC / logits", type: "fc", count: 10, matrix: 1, input: "1690", output: "FC / logits", desc: "全连接层把 1690 维特征向量映射为 10 个类别分数，这些原始分数就是 logits。", formula: "z_j = \\sum_i x_i W_{i,j} + b_j" },
        { name: "output", shortName: "Softmax / output", type: "output", count: 10, matrix: 1, input: "FC / logits", output: "Output probabilities", desc: "输出层用 Softmax 把 FC / logits 变成类别概率，右侧条形图表示归一化后的概率。", formula: "p_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}" }
    ];

    const digitLayerDefs = [
        { name: "input", shortName: "input", type: "input", count: 1, matrix: 28, input: "-", output: "28 × 28 × 1", desc: "手写数字识别模型以 28×28 灰度图作为输入，这里由页面绘图区实时预处理得到。", formula: "X \\in \\mathbb{R}^{28 \\times 28 \\times 1}" },
        { name: "digit_conv_1", shortName: "conv", type: "conv", count: 10, matrix: 28, input: "28 × 28 × 1", output: "28 × 28 × 32", desc: "第一层 3×3 卷积从手写笔画中提取局部边缘和笔画方向响应。", formula: "Z^{(k)} = X \\ast K^{(k)} + b^{(k)}" },
        { name: "digit_relu_1", shortName: "relu", type: "relu", count: 10, matrix: 28, input: "28 × 28 × 32", output: "28 × 28 × 32", desc: "ReLU 激活函数将卷积响应中的负值截断为 0，保留正向笔画响应。", formula: "A = \\max(0, Z)" },
        { name: "digit_pool_1", shortName: "max_pool", type: "pool", count: 10, matrix: 14, input: "28 × 28 × 32", output: "14 × 14 × 32", desc: "2×2 MaxPool 下采样第一组笔画响应，保留局部最强激活。", formula: "P_{i,j} = \\max(\\text{region}_{i,j})" },
        { name: "digit_conv_2", shortName: "conv", type: "conv", count: 10, matrix: 14, input: "14 × 14 × 32", output: "14 × 14 × 64", desc: "第二层卷积组合浅层笔画特征，形成更抽象的数字部件响应。", formula: "Z^{(k)} = \\sum_c P^{(c)} \\ast K^{(k,c)} + b^{(k)}" },
        { name: "digit_relu_2", shortName: "relu", type: "relu", count: 10, matrix: 14, input: "14 × 14 × 64", output: "14 × 14 × 64", desc: "第二个 ReLU 继续进行非线性激活，让高层数字部件更稀疏更易分类。", formula: "A = \\max(0, Z)" },
        { name: "digit_pool_2", shortName: "max_pool", type: "pool", count: 10, matrix: 7, input: "14 × 14 × 64", output: "7 × 7 × 64", desc: "第二次池化把空间尺寸压缩到 7×7，为全连接层提供紧凑特征。", formula: "P_{i,j} = \\max(\\text{region}_{i,j})" },
        { name: "digit_flatten", shortName: "flatten", type: "flatten", count: 24, matrix: 1, input: "7 × 7 × 64", output: "3136", desc: "Flatten 将 7×7×64 的特征图展开成 3136 维向量。", formula: "\\mathrm{flat} = \\mathrm{reshape}(P)" },
        { name: "digit_fc_1", shortName: "FC", type: "fc", count: 10, matrix: 1, input: "3136", output: "128", desc: "第一层全连接把 3136 维卷积特征映射到 128 维隐藏表示。", formula: "h_j = \\sum_i x_i W_{i,j} + b_j" },
        { name: "digit_fc_relu", shortName: "relu", type: "relu", count: 10, matrix: 1, input: "128", output: "128", desc: "全连接后的 ReLU 保留正向隐藏特征，抑制负响应。", formula: "a_j = \\max(0, h_j)" },
        { name: "digit_fc_2", shortName: "FC / logits", type: "fc", count: 10, matrix: 1, input: "128", output: "10 logits", desc: "第二层全连接把 128 维隐藏特征映射为 10 个数字类别分数。", formula: "z_j = \\sum_i a_i W_{i,j} + b_j" },
        { name: "digit_output", shortName: "Softmax / output", type: "output", count: 10, matrix: 1, input: "10 logits", output: "10 probabilities", desc: "Softmax 将 10 个 logits 归一化为数字 0 到 9 的概率分布。", formula: "p_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}" }
    ];

    let layerDefs = imageLayerDefs;

    const state = {
        modelMode: "image",
        selectedImage: "espresso_1.jpeg",
        digitDrawing: false,
        digitHasInk: false,
        digitTimer: null,
        selectedScale: "local",
        calcMode: "forward",
        sideTab: "info",
        detailed: false,
        selected: null,
        hovered: null,
        intermediate: null,
        inputChannels: null,
        tfModel: null,
        usingRealModel: false,
        modelError: "",
        digitPrediction: null,
        digitConfidence: null,
        cnn: [],
        coords: [],
        links: [],
        nodeImageCache: new Map(),
        globalExtentCache: new Map(),
        layerRanges: {
            local: [],
            module: [],
            global: []
        },
        gradReplay: {
            active: false,
            targetLabel: null,
            dlogits: [],
            nodeGrad: new Map(),
            activeLayers: new Set(),
            sequence: [],
            stepIndex: -1,
            timer: null,
            version: 0,
            updateActive: false,
            maxScalar: 1
        },
        renderToken: 0
    };

    function resolveImageSrc(file) {
        return file && (file.startsWith("blob:") || file.startsWith("data:") || file.startsWith("http"))
            ? file
            : assetsBase + file;
    }

    function applyModelMode(mode) {
        state.modelMode = mode === "digit" ? "digit" : "image";
        layerDefs = state.modelMode === "digit" ? digitLayerDefs : imageLayerDefs;
        classNames = state.modelMode === "digit" ? digitClassNames : imageClassNames;
        if (els.imageStrip) {
            els.imageStrip.hidden = state.modelMode === "digit";
        }
        if (els.imageUpload) {
            els.imageUpload.disabled = state.modelMode === "digit";
        }
        if (els.digitDrawer) {
            els.digitDrawer.hidden = true;
        }
        root.classList.toggle("is-digit-model", state.modelMode === "digit");
        root.dataset.calcMode = state.calcMode;
    }

    const gradConfig = {
        stepDuration: 720,
        minDuration: 600,
        maxDuration: 900
    };

    function clearGradientReplay({ silent = false, render = true } = {}) {
        const replay = state.gradReplay;
        if (replay.timer) {
            window.clearTimeout(replay.timer);
            replay.timer = null;
        }
        replay.active = false;
        replay.updateActive = false;
        replay.targetLabel = null;
        replay.dlogits = [];
        replay.nodeGrad.clear();
        replay.activeLayers.clear();
        replay.sequence = [];
        replay.stepIndex = -1;
        replay.maxScalar = 1;
        if (!silent && els.interactionText) {
            els.interactionText.textContent = "梯度热力已清除，可点击 Softmax 类别重新回放。";
        }
        state.nodeImageCache.clear();
        if (render) {
            renderNetwork();
            updateSidePanel();
        }
    }

    function gradientSequence() {
        const order = ["output", "fc", "flatten", "pool", "relu", "conv", "input"];
        const indices = [];
        order.forEach((type) => {
            let index = -1;
            for (let i = layerDefs.length - 1; i >= 0; i -= 1) {
                if (layerDefs[i].type === type) {
                    index = i;
                    break;
                }
            }
            if (type === "input") {
                index = 0;
            }
            if (index >= 0 && !indices.includes(index)) {
                indices.push(index);
            }
        });
        return indices.map((layerIndex) => ({ layerIndex, type: layerDefs[layerIndex]?.type || "" }));
    }

    function gradientColor(value, maxValue) {
        const magnitude = Math.abs(value || 0);
        if (!maxValue || maxValue <= 1e-6 || magnitude <= 1e-4) {
            return "#cbd5e1";
        }
        const norm = Math.min(1, magnitude / maxValue);
        const t = value < 0 ? 0.6 + 0.4 * norm : 0.25 + 0.65 * norm;
        return d3.interpolateOranges(t);
    }

    function meanAbsMatrix(matrix) {
        if (!Array.isArray(matrix)) {
            return Math.abs(matrix || 0);
        }
        const flat = Array.isArray(matrix[0]) ? matrix.flat() : matrix;
        if (!flat.length) return 0;
        const sum = flat.reduce((acc, value) => acc + Math.abs(value || 0), 0);
        return sum / flat.length;
    }

    function setNodeGrad(node, payload) {
        if (!node || !payload) return;
        const entry = {
            scalar: payload.scalar || 0,
            matrix: payload.matrix || null,
            max: payload.max || 0
        };
        if (entry.matrix && !entry.max) {
            entry.max = Math.max(1e-6, Math.max(...entry.matrix.flat().map((v) => Math.abs(v || 0))));
        }
        state.gradReplay.nodeGrad.set(node.id, entry);
    }

    function gradMatrixFromActivation(matrix, scale, options = {}) {
        if (!Array.isArray(matrix)) {
            return [[scale || 0]];
        }
        const rows = Array.isArray(matrix[0]) ? matrix : [matrix];
        const absValues = rows.map((row) => row.map((value) => Math.abs(value || 0)));
        const maxVal = Math.max(1e-6, Math.max(...absValues.flat()));
        const norm = absValues.map((row, r) => row.map((value, c) => {
            const base = (value / maxVal) * (scale || 0);
            if (options.reluMask && rows[r][c] <= 0) {
                return 0;
            }
            return base;
        }));
        if (!options.pool) {
            return norm;
        }
        const pooled = norm.map((row) => row.map(() => 0));
        const windowSize = 2;
        for (let r = 0; r < norm.length; r += windowSize) {
            for (let c = 0; c < norm[0].length; c += windowSize) {
                let max = -Infinity;
                let maxPos = { r, c };
                for (let i = 0; i < windowSize; i += 1) {
                    for (let j = 0; j < windowSize; j += 1) {
                        const rr = r + i;
                        const cc = c + j;
                        if (rr >= norm.length || cc >= norm[0].length) continue;
                        if (norm[rr][cc] > max) {
                            max = norm[rr][cc];
                            maxPos = { r: rr, c: cc };
                        }
                    }
                }
                if (max > -Infinity) {
                    pooled[maxPos.r][maxPos.c] = max;
                }
            }
        }
        return pooled;
    }

    function buildGradients(targetLabel) {
        const outputs = state.cnn[state.cnn.length - 1] || [];
        const probs = outputs.map((item) => Math.max(0, Number(item.output) || 0));
        const safeLabel = Math.max(0, Math.min(probs.length - 1, Number(targetLabel)));
        const dlogits = probs.map((p, i) => p - (i === safeLabel ? 1 : 0));
        state.gradReplay.dlogits = dlogits;
        state.gradReplay.targetLabel = safeLabel;

        state.gradReplay.nodeGrad.clear();
        const absGrad = dlogits.map((v) => Math.abs(v || 0));
        const meanGrad = absGrad.reduce((a, b) => a + b, 0) / Math.max(1, absGrad.length);

        outputs.forEach((node, index) => {
            setNodeGrad(node, { scalar: absGrad[index] || 0 });
        });

        const lastOfType = (type) => {
            for (let i = layerDefs.length - 1; i >= 0; i -= 1) {
                if (layerDefs[i].type === type) return i;
            }
            return -1;
        };

        const fcIndex = lastOfType("fc");
        const flattenIndex = lastOfType("flatten");
        const poolIndex = lastOfType("pool");
        const reluIndex = lastOfType("relu");
        const convIndex = lastOfType("conv");

        const fcLayer = state.cnn[fcIndex] || [];
        fcLayer.forEach((node, index) => {
            const scalar = absGrad[index % absGrad.length] || meanGrad;
            setNodeGrad(node, { scalar });
        });

        const flattenLayer = state.cnn[flattenIndex] || [];
        flattenLayer.forEach((node) => {
            const scale = meanGrad * (0.35 + 0.65 * Math.min(1, Math.abs(averageOutput(node.output))));
            setNodeGrad(node, { scalar: scale });
        });

        const poolLayer = state.cnn[poolIndex] || [];
        poolLayer.forEach((node) => {
            const scale = meanGrad * 0.85;
            const matrix = gradMatrixFromActivation(node.output, scale, { pool: true });
            setNodeGrad(node, { matrix, scalar: meanAbsMatrix(matrix) });
        });

        const reluLayer = state.cnn[reluIndex] || [];
        reluLayer.forEach((node) => {
            const scale = meanGrad * 0.95;
            const matrix = gradMatrixFromActivation(node.output, scale, { reluMask: true });
            setNodeGrad(node, { matrix, scalar: meanAbsMatrix(matrix) });
        });

        const convLayer = state.cnn[convIndex] || [];
        convLayer.forEach((node) => {
            const scale = meanGrad;
            const matrix = gradMatrixFromActivation(node.output, scale);
            setNodeGrad(node, { matrix, scalar: meanAbsMatrix(matrix) });
        });

        const inputLayer = state.cnn[0] || [];
        inputLayer.forEach((node) => {
            const scale = meanGrad * 0.8;
            const matrix = gradMatrixFromActivation(node.output, scale);
            setNodeGrad(node, { matrix, scalar: meanAbsMatrix(matrix) });
        });

        let maxScalar = 0.001;
        state.gradReplay.nodeGrad.forEach((entry) => {
            maxScalar = Math.max(maxScalar, entry.scalar || 0);
        });
        state.gradReplay.maxScalar = maxScalar;
    }

    function startGradientReplay(targetLabel) {
        if (state.modelMode !== "digit") {
            return;
        }
        clearGradientReplay({ silent: true, render: false });
        buildGradients(targetLabel);
        const replay = state.gradReplay;
        replay.active = true;
        replay.updateActive = false;
        replay.activeLayers.clear();
        replay.sequence = gradientSequence();
        replay.stepIndex = -1;
        replay.version += 1;
        if (els.interactionText) {
            els.interactionText.textContent = `已将类别 ${replay.targetLabel} 设为正确标签，开始回放从 Softmax 到输入端的反向传播梯度。`;
        }
        advanceGradientReplay();
    }

    function advanceGradientReplay() {
        const replay = state.gradReplay;
        replay.stepIndex += 1;
        if (replay.stepIndex < replay.sequence.length) {
            const layerIndex = replay.sequence[replay.stepIndex].layerIndex;
            replay.activeLayers.add(layerIndex);
            state.nodeImageCache.clear();
            renderNetwork();
            updateSidePanel();
            replay.timer = window.setTimeout(advanceGradientReplay, gradConfig.stepDuration);
            return;
        }
        replay.updateActive = true;
        state.nodeImageCache.clear();
        renderNetwork();
        updateSidePanel();
        if (els.interactionText) {
            els.interactionText.textContent = "梯度回放完成，已保留最后热力分布与绿色参数更新标记。";
        }
    }

    let resizeTimer = null;

    const els = {
        modelSelect: root.querySelector("#ceModelSelect"),
        imageStrip: root.querySelector("#ceImageStrip"),
        imageUpload: root.querySelector("#ceImageUpload"),
        digitDrawer: root.querySelector("#ceDigitDrawer"),
        digitCanvas: root.querySelector("#ceDigitCanvas"),
        clearDigit: root.querySelector("#ceClearDigit"),
        digitStatus: root.querySelector("#ceDigitStatus"),
        modeSwitch: root.querySelector("#ceModeSwitch"),
        clearGrad: root.querySelector("#ceClearGrad"),
        hoverPill: root.querySelector("#ceHoverPill"),
        detailToggle: root.querySelector("#ceDetailToggle"),
        scaleSelect: root.querySelector("#ceScaleSelect"),
        svg: d3.select(root.querySelector("#ceNetworkSvg")),
        overlay: root.querySelector("#ceDetailOverlay"),
        principlePanel: root.querySelector("#cePrinciplePanel"),
        principleContent: root.querySelector("#cePrincipleContent"),
        sideTabs: root.querySelector("#ceSideTabs"),
        layerInfo: root.querySelector("#ceLayerInfo"),
        layerTitle: root.querySelector("#ceLayerTitle"),
        layerInput: root.querySelector("#ceLayerInput"),
        layerOutput: root.querySelector("#ceLayerOutput"),
        layerDesc: root.querySelector("#ceLayerDesc"),
        layerFormula: root.querySelector("#ceLayerFormula"),
        miniView: root.querySelector("#ceMiniView"),
        interactionText: root.querySelector("#ceInteractionText"),
        legend: root.querySelector("#ceLegend")
    };

    function renderLatex(target, tex) {
        if (!target) {
            return;
        }
        if (!tex) {
            target.innerHTML = "";
            return;
        }

        target.innerHTML = `
            <div class="ce-latex-block"></div>
        `;
        const container = target.querySelector(".ce-latex-block");

        if (!window.katex) {
            container.textContent = tex;
            return;
        }

        try {
            window.katex.render(tex, container, {
                throwOnError: false,
                displayMode: true
            });
        } catch (error) {
            container.textContent = tex;
        }
    }

    function renderLatexInElement(container) {
        if (!container || !window.katex) {
            return;
        }
        container.querySelectorAll("[data-tex]").forEach((node) => {
            const tex = node.getAttribute("data-tex");
            if (!tex) {
                return;
            }
            const displayMode = node.getAttribute("data-display") === "block";
            try {
                window.katex.render(tex, node, { throwOnError: false, displayMode });
            } catch (error) {
                node.textContent = tex;
            }
        });
    }

    const width = 1440;
    const height = 620;
    const nodeLength = 46;
    const topPad = 48;
    const bottomPad = 52;
    const leftPad = 24;
    const rightPad = 24;
    const colorScales = {
        input: [d3.interpolateReds, d3.interpolateGreens, d3.interpolateBlues],
        conv: (t) => d3.interpolateRdBu(1 - t),
        relu: (t) => d3.interpolateRdBu(1 - t),
        pool: (t) => d3.interpolateRdBu(1 - t),
        flatten: d3.interpolateBlues,
        fc: d3.interpolateBlues,
        output: d3.interpolateOranges
    };

    const inputChannelScales = [
        d3.interpolateRgb("#1e1e1e", "#ef4444"), // Background dark -> Red
        d3.interpolateRgb("#1e1e1e", "#22c55e"), // Background dark -> Green
        d3.interpolateRgb("#1e1e1e", "#3b82f6")  // Background dark -> Blue
    ];

    function hashText(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return hash >>> 0;
    }

    function randomFrom(seed) {
        let value = seed >>> 0;
        return function () {
            value += 0x6D2B79F5;
            let t = value;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function makeMatrix(size, seed, type) {
        const rand = randomFrom(seed);
        const matrix = [];
        for (let r = 0; r < size; r++) {
            const row = [];
            for (let c = 0; c < size; c++) {
                const wave = Math.sin((r + 1) * 0.75 + seed * 0.0003) * Math.cos((c + 1) * 0.55);
                let value = (rand() - 0.5) * 1.2 + wave * 0.55;
                if (type === "input") {
                    value = Math.max(0, Math.min(1, 0.45 + wave * 0.22 + rand() * 0.36));
                }
                if (type === "relu" || type === "pool") {
                    value = Math.max(0, value);
                }
                row.push(value);
            }
            matrix.push(row);
        }
        return matrix;
    }

    function softmax(values) {
        const max = Math.max(...values);
        const exps = values.map((value) => Math.exp(value - max));
        const total = exps.reduce((sum, value) => sum + value, 0);
        return exps.map((value) => value / total);
    }

    function loadInputChannels(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const size = 16;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;
                const channels = [
                    Array.from({ length: size }, () => Array(size).fill(0)),
                    Array.from({ length: size }, () => Array(size).fill(0)),
                    Array.from({ length: size }, () => Array(size).fill(0))
                ];
                for (let i = 0; i < data.length; i += 4) {
                    const pixel = i / 4;
                    const row = Math.floor(pixel / size);
                    const col = pixel % size;
                    channels[0][row][col] = data[i] / 255;
                    channels[1][row][col] = data[i + 1] / 255;
                    channels[2][row][col] = data[i + 2] / 255;
                }
                resolve(channels);
            };
            img.onerror = () => resolve(null);
            img.src = resolveImageSrc(file);
        });
    }

    async function loadTfModel() {
        if (!window.tf || !modelUrl) {
            throw new Error("TensorFlow.js 未加载");
        }
        if (!state.tfModel) {
            state.tfModel = await window.tf.loadLayersModel(modelUrl);
        }
        return state.tfModel;
    }

    function imageTensorFromFile(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const size = 64;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                const scale = Math.max(size / img.width, size / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const dx = (size - drawW) / 2;
                const dy = (size - drawH) / 2;
                ctx.drawImage(img, dx, dy, drawW, drawH);
                const imageData = ctx.getImageData(0, 0, size, size);
                const inputArray = [];
                const channels = [
                    Array.from({ length: size }, () => Array(size).fill(0)),
                    Array.from({ length: size }, () => Array(size).fill(0)),
                    Array.from({ length: size }, () => Array(size).fill(0))
                ];
                for (let r = 0; r < size; r++) {
                    const row = [];
                    for (let c = 0; c < size; c++) {
                        const index = (r * size + c) * 4;
                        const pixel = [
                            imageData.data[index] / 255,
                            imageData.data[index + 1] / 255,
                            imageData.data[index + 2] / 255
                        ];
                        channels[0][r][c] = pixel[0];
                        channels[1][r][c] = pixel[1];
                        channels[2][r][c] = pixel[2];
                        row.push(pixel);
                    }
                    inputArray.push(row);
                }
                resolve({
                    tensor: window.tf.tensor3d(inputArray, [size, size, 3], "float32"),
                    channels
                });
            };
            img.onerror = reject;
            img.src = resolveImageSrc(file);
        });
    }

    async function buildRealCNN(file) {
        const model = await loadTfModel();
        const { tensor, channels } = await imageTensorFromFile(file);
        const batch = tensor.expandDims(0);
        const outputs = [];
        let current = batch;
        try {
            for (let i = 0; i < model.layers.length; i++) {
                current = model.layers[i].apply(current);
                outputs.push(current);
            }
            const cnn = [];
            cnn.push(channels.map((channel, index) => ({
                id: `input-${index}`,
                layerIndex: 0,
                index,
                layerName: "input",
                type: "input",
                output: channel
            })));
            for (let i = 0; i < outputs.length; i++) {
                const layerDef = layerDefs.find((item) => item.name === model.layers[i].name);
                if (!layerDef) {
                    continue;
                }
                const squeezed = outputs[i].squeeze();
                const array = squeezed.arraySync();
                if (layerDef.type === "output") {
                    const logits = logitsFromProbabilities(array);
                    const fcLayerIndex = cnn.length;
                    cnn.push(logits.map((logit, index) => ({
                        id: `fc-${index}`,
                        layerIndex: fcLayerIndex,
                        index,
                        layerName: "fc",
                        type: "fc",
                        label: classNames[index],
                        output: normalizeLogit(logit),
                        logit
                    })));
                    const outputLayerIndex = cnn.length;
                    cnn.push(array.map((prob, index) => ({
                        id: `${layerDef.name}-${index}`,
                        layerIndex: outputLayerIndex,
                        index,
                        layerName: layerDef.name,
                        type: layerDef.type,
                        label: classNames[index],
                        output: prob,
                        logit: logits[index]
                    })));
                } else if (layerDef.type === "flatten" && squeezed.shape.length === 1) {
                    cnn.push(vectorToNodes(array, cnn.length, layerDef));
                } else if (squeezed.shape.length === 3) {
                    const channelsFirst = transposeHwcToChw(array);
                    cnn.push(channelsFirst.map((channel, index) => ({
                        id: `${layerDef.name}-${index}`,
                        layerIndex: cnn.length,
                        index,
                        layerName: layerDef.name,
                        type: layerDef.type,
                        output: channel
                    })));
                }
                squeezed.dispose();
            }
            outputs.forEach((tensorOutput) => {
                if (tensorOutput !== current) {
                    tensorOutput.dispose();
                }
            });
            current.dispose();
            batch.dispose();
            tensor.dispose();
            prepareNodeMetadata(cnn);
            return cnn;
        } catch (error) {
            outputs.forEach((tensorOutput) => tensorOutput.dispose?.());
            current.dispose?.();
            batch.dispose();
            tensor.dispose();
            throw error;
        }
    }

    async function buildRealCNNProgressive(file, token, onProgress) {
        const { tensor, channels } = await imageTensorFromFile(file);
        if (token !== state.renderToken) {
            tensor.dispose();
            return null;
        }

        const cnn = [channels.map((channel, index) => ({
            id: `input-${index}`,
            layerIndex: 0,
            index,
            layerName: "input",
            type: "input",
            output: channel
        }))];
        prepareNodeMetadata(cnn, false);
        onProgress(cnn, "输入层已完成");
        await nextFrame();

        const model = await loadTfModel();
        if (token !== state.renderToken) {
            tensor.dispose();
            return null;
        }

        const batch = tensor.expandDims(0);
        let current = batch;
        try {
            for (let i = 0; i < model.layers.length; i++) {
                const next = model.layers[i].apply(current);
                if (current !== batch) {
                    current.dispose();
                }
                current = next;

                const layerDef = layerDefs.find((item) => item.name === model.layers[i].name);
                if (!layerDef) {
                    await nextFrame();
                    continue;
                }

                const squeezed = current.squeeze();
                const array = squeezed.arraySync();
                const layerIndex = cnn.length;
                if (layerDef.type === "output") {
                    const logits = logitsFromProbabilities(array);
                    const fcLayerIndex = cnn.length;
                    cnn.push(logits.map((logit, index) => ({
                        id: `fc-${index}`,
                        layerIndex: fcLayerIndex,
                        index,
                        layerName: "fc",
                        type: "fc",
                        label: classNames[index],
                        output: normalizeLogit(logit),
                        logit
                    })));
                    const outputLayerIndex = cnn.length;
                    cnn.push(array.map((prob, index) => ({
                        id: `${layerDef.name}-${index}`,
                        layerIndex: outputLayerIndex,
                        index,
                        layerName: layerDef.name,
                        type: layerDef.type,
                        label: classNames[index],
                        output: prob,
                        logit: logits[index]
                    })));
                } else if (layerDef.type === "flatten" && squeezed.shape.length === 1) {
                    cnn.push(vectorToNodes(array, layerIndex, layerDef));
                } else if (squeezed.shape.length === 3) {
                    const channelsFirst = transposeHwcToChw(array);
                    cnn.push(channelsFirst.map((channel, index) => ({
                        id: `${layerDef.name}-${index}`,
                        layerIndex,
                        index,
                        layerName: layerDef.name,
                        type: layerDef.type,
                        output: channel
                    })));
                }
                squeezed.dispose();

                if (token !== state.renderToken) {
                    current.dispose();
                    batch.dispose();
                    tensor.dispose();
                    return null;
                }

                prepareNodeMetadata(cnn, false);
                onProgress(cnn, `${displayLayerName(layerDef.name)} 已完成`);
                await nextFrame();
            }
            current.dispose();
            batch.dispose();
            tensor.dispose();
            return cnn;
        } catch (error) {
            current.dispose?.();
            batch.dispose();
            tensor.dispose();
            throw error;
        }
    }

    function nextFrame() {
        return new Promise((resolve) => requestAnimationFrame(resolve));
    }

    function transposeHwcToChw(array) {
        const height = array.length;
        const width = array[0].length;
        const depth = array[0][0].length;
        return Array.from({ length: depth }, (_, channel) =>
            Array.from({ length: height }, (_, row) =>
                Array.from({ length: width }, (_, col) => array[row][col][channel])
            )
        );
    }

    function vectorToNodes(vector, layerIndex, layerDef) {
        const count = layerDef.count || 24;
        const chunk = Math.max(1, Math.floor(vector.length / count));
        return Array.from({ length: count }, (_, index) => {
            const start = index * chunk;
            const end = index === count - 1 ? vector.length : Math.min(vector.length, start + chunk);
            const slice = vector.slice(start, end);
            const value = slice.reduce((sum, item) => sum + Math.abs(item), 0) / Math.max(1, slice.length);
            return {
                id: `${layerDef.name}-${index}`,
                layerIndex,
                index,
                layerName: layerDef.name,
                type: layerDef.type,
                output: value,
                range: [start, end - 1],
                vectorSize: vector.length
            };
        });
    }

    function logitsFromProbabilities(probabilities) {
        const eps = 1e-7;
        return probabilities.map((prob) => Math.log(Math.max(eps, prob)));
    }

    function normalizeLogit(logit) {
        return Math.max(0.04, Math.min(0.96, (logit + 16) / 16));
    }

    function buildCNN() {
        const imageSeed = hashText(state.selectedImage);
        const cnn = layerDefs.map((layer, layerIndex) => {
            if (layer.type === "output") {
                const target = imageOptions.findIndex((item) => item.file === state.selectedImage);
                const logits = classNames.map((_, index) => {
                    const rand = randomFrom(imageSeed + index * 997 + 31);
                    return (rand() - 0.5) * 2.4 + (index === target ? 2.25 : 0);
                });
                const probs = softmax(logits);
                return probs.map((prob, index) => ({
                    id: `${layer.name}-${index}`,
                    layerIndex,
                    index,
                    layerName: layer.name,
                    type: layer.type,
                    label: classNames[index],
                    output: prob,
                    logit: logits[index]
                }));
            }

            return Array.from({ length: layer.count }, (_, index) => {
                let output;
                if (layer.type === "input" && state.inputChannels) {
                    output = state.inputChannels[index];
                } else if (layer.type === "flatten") {
                    output = randomFrom(imageSeed + layerIndex * 1009 + index * 53)();
                } else if (layer.type === "fc") {
                    output = randomFrom(imageSeed + layerIndex * 1009 + index * 53)();
                } else {
                    output = makeMatrix(layer.matrix, imageSeed + layerIndex * 1009 + index * 53, layer.type);
                }
                return {
                    id: `${layer.name}-${index}`,
                    layerIndex,
                    index,
                    layerName: layer.name,
                    type: layer.type,
                    output
                };
            });
        });
        state.cnn = cnn;
        prepareNodeMetadata();
        state.selected = cnn[0][0];
    }

    function flatChannelToMatrix(values, height, width, channel = 0) {
        const offset = channel * height * width;
        return Array.from({ length: height }, (_, row) =>
            Array.from({ length: width }, (_, col) => Number(values[offset + row * width + col] || 0))
        );
    }

    function channelsFromFlat(values, channels, height, width, layerIndex, layerName, type, count = 10) {
        const step = Math.max(1, Math.floor(channels / count));
        return Array.from({ length: Math.min(count, channels) }, (_, index) => {
            const channel = Math.min(channels - 1, index * step);
            return {
                id: `${layerName}-${index}`,
                layerIndex,
                index,
                channel,
                layerName,
                type,
                output: flatChannelToMatrix(values, height, width, channel)
            };
        });
    }

    function vectorSampleNodes(values, layerIndex, layerDef) {
        return vectorToNodes(Array.from(values), layerIndex, layerDef);
    }

    function scalarSampleNodes(values, layerIndex, layerName, type, count = 10, labels = classNames) {
        const array = Array.from(values);
        const step = Math.max(1, Math.floor(array.length / count));
        return Array.from({ length: Math.min(count, array.length) }, (_, index) => {
            const sourceIndex = Math.min(array.length - 1, index * step);
            const value = Number(array[sourceIndex] || 0);
            return {
                id: `${layerName}-${index}`,
                layerIndex,
                index,
                sourceIndex,
                layerName,
                type,
                label: labels[index],
                output: type === "fc" ? normalizeLogit(value) : value,
                logit: value
            };
        });
    }

    function buildDigitCNNFromResult(result) {
        const activations = result.activations;
        const cnn = [];
        cnn.push([{
            id: "input-0",
            layerIndex: 0,
            index: 0,
            layerName: "input",
            type: "input",
            output: flatChannelToMatrix(activations.input, 28, 28, 0)
        }]);
        cnn.push(channelsFromFlat(activations.conv0_raw, 32, 28, 28, 1, "digit_conv_1", "conv", 10));
        cnn.push(channelsFromFlat(activations.conv0, 32, 28, 28, 2, "digit_relu_1", "relu", 10));
        cnn.push(channelsFromFlat(activations.pool0, 32, 14, 14, 3, "digit_pool_1", "pool", 10));
        cnn.push(channelsFromFlat(activations.conv1_raw, 64, 14, 14, 4, "digit_conv_2", "conv", 10));
        cnn.push(channelsFromFlat(activations.conv1, 64, 14, 14, 5, "digit_relu_2", "relu", 10));
        cnn.push(channelsFromFlat(activations.pool1, 64, 7, 7, 6, "digit_pool_2", "pool", 10));
        cnn.push(vectorSampleNodes(activations.pool1, 7, digitLayerDefs[7]));
        cnn.push(scalarSampleNodes(activations.fc0_raw || activations.fc0, 8, "digit_fc_1", "fc", 10));
        cnn.push(scalarSampleNodes(activations.fc0, 9, "digit_fc_relu", "relu", 10));
        cnn.push(result.logits.map((logit, index) => ({
            id: `digit_fc_2-${index}`,
            layerIndex: 10,
            index,
            layerName: "digit_fc_2",
            type: "fc",
            label: classNames[index],
            output: logit,
            logit
        })));
        cnn.push(result.probabilities.map((prob, index) => ({
            id: `digit_output-${index}`,
            layerIndex: 11,
            index,
            layerName: "digit_output",
            type: "output",
            label: classNames[index],
            output: prob,
            logit: result.logits[index]
        })));
        state.cnn = cnn;
        prepareNodeMetadata();
        state.selected = cnn[0][0];
    }

    function resetDigitCanvas() {
        if (!els.digitCanvas) {
            return;
        }
        const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, els.digitCanvas.width, els.digitCanvas.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 22;
        state.digitHasInk = false;
        if (els.digitStatus) {
            els.digitStatus.textContent = "在绘图区写一个 0~9 数字";
        }
    }

    function digitCanvasPoint(event, canvas = els.digitCanvas) {
        const rect = canvas.getBoundingClientRect();
        const pointer = event.touches?.[0] || event;
        return {
            x: (pointer.clientX - rect.left) * (canvas.width / rect.width),
            y: (pointer.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function digitDrawSurfaces() {
        return Array.from(root.querySelectorAll(".ce-digit-draw-surface"));
    }

    function copyCanvas(source, target) {
        if (!source || !target) {
            return;
        }
        const ctx = target.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.drawImage(source, 0, 0, target.width, target.height);
    }

    function syncDigitSurfaces() {
        if (!els.digitCanvas || state.modelMode !== "digit") {
            return;
        }
        digitDrawSurfaces().forEach((canvas) => {
            if (canvas === els.digitCanvas) {
                return;
            }
            if (!canvas.width) canvas.width = 280;
            if (!canvas.height) canvas.height = 280;
            copyCanvas(els.digitCanvas, canvas);
        });
    }

    function bindDigitSurfaces() {
        if (!els.digitCanvas || state.modelMode !== "digit") {
            return;
        }
        digitDrawSurfaces().forEach((canvas) => {
            if (canvas.dataset.digitBound === "true") {
                return;
            }
            canvas.dataset.digitBound = "true";
            canvas.width = canvas.width || 280;
            canvas.height = canvas.height || 280;
            const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
            const startDraw = (event) => {
                if (state.modelMode !== "digit") return;
                event.preventDefault();
                canvas.setPointerCapture?.(event.pointerId);
                state.digitDrawing = true;
                state.digitHasInk = true;
                if (els.digitStatus) {
                    els.digitStatus.textContent = "松开后自动更新模型";
                }
                const point = digitCanvasPoint(event, canvas);
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
            };
            const draw = (event) => {
                if (!state.digitDrawing) return;
                event.preventDefault();
                const point = digitCanvasPoint(event, canvas);
                ctx.lineTo(point.x, point.y);
                ctx.stroke();
                syncDigitSurfaces();
            };
            const endDraw = (event) => {
                if (!state.digitDrawing) return;
                event?.preventDefault?.();
                state.digitDrawing = false;
                ctx.closePath();
                syncDigitSurfaces();
                scheduleDigitUpdate();
            };
            canvas.addEventListener("pointerdown", startDraw);
            canvas.addEventListener("pointermove", draw);
            canvas.addEventListener("pointerup", endDraw);
            canvas.addEventListener("pointercancel", endDraw);
            canvas.addEventListener("pointerleave", endDraw);
        });
        syncDigitSurfaces();
    }

    function scheduleDigitUpdate(delay = 420) {
        if (state.modelMode !== "digit" || !state.digitHasInk) {
            return;
        }
        window.clearTimeout(state.digitTimer);
        state.digitTimer = window.setTimeout(() => {
            selectDigitFromCanvas();
        }, delay);
    }

    function drawDigitSample() {
        resetDigitCanvas();
        const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
        ctx.beginPath();
        [[92, 72], [182, 68], [198, 118], [156, 148], [105, 160], [84, 218], [202, 220]].forEach(([x, y], index) => {
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        ctx.closePath();
        state.digitHasInk = true;
        syncDigitSurfaces();
    }

    function preprocessDigitCanvas() {
        const canvas = els.digitCanvas;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const source = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const gray = new Float32Array(canvas.width * canvas.height);
        let total = 0;

        for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
            const brightness = (299 * source[i] + 587 * source[i + 1] + 114 * source[i + 2]) / 1000;
            gray[p] = brightness;
            total += brightness;
        }

        let foreground = gray;
        const mean = total / gray.length;
        if (mean > 127) {
            foreground = new Float32Array(gray.length);
            for (let i = 0; i < gray.length; i += 1) {
                foreground[i] = 255 - gray[i];
            }
        }

        let minValue = Infinity;
        let maxValue = -Infinity;
        for (let i = 0; i < foreground.length; i += 1) {
            const value = foreground[i];
            if (value < minValue) minValue = value;
            if (value > maxValue) maxValue = value;
        }

        const normalized = new Float32Array(foreground.length);
        const range = maxValue - minValue;
        if (range > 0) {
            for (let i = 0; i < foreground.length; i += 1) {
                normalized[i] = (foreground[i] - minValue) / range;
            }
        }

        const mask = [];
        let count = 0;
        let top = canvas.height;
        let bottom = -1;
        let left = canvas.width;
        let right = -1;
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const index = y * canvas.width + x;
                const hit = normalized[index] > 0.18;
                mask[index] = hit;
                if (!hit) continue;
                count += 1;
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
                left = Math.min(left, x);
                right = Math.max(right, x);
            }
        }
        if (count < 10) {
            throw new Error("没有检测到有效数字，请在绘图区中央写大一点");
        }

        const cropWidth = right - left + 1;
        const cropHeight = bottom - top + 1;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext("2d");
        const cropImage = cropCtx.createImageData(cropWidth, cropHeight);
        for (let y = 0; y < cropHeight; y += 1) {
            for (let x = 0; x < cropWidth; x += 1) {
                const value = Math.round(normalized[(top + y) * canvas.width + (left + x)] * 255);
                const offset = (y * cropWidth + x) * 4;
                cropImage.data[offset] = value;
                cropImage.data[offset + 1] = value;
                cropImage.data[offset + 2] = value;
                cropImage.data[offset + 3] = 255;
            }
        }
        cropCtx.putImageData(cropImage, 0, 0);

        const maxSide = Math.max(cropWidth, cropHeight);
        const scaledWidth = Math.max(1, Math.round(20 / maxSide * cropWidth));
        const scaledHeight = Math.max(1, Math.round(20 / maxSide * cropHeight));
        const scaledCanvas = document.createElement("canvas");
        scaledCanvas.width = scaledWidth;
        scaledCanvas.height = scaledHeight;
        const scaledCtx = scaledCanvas.getContext("2d");
        scaledCtx.imageSmoothingEnabled = true;
        scaledCtx.drawImage(cropCanvas, 0, 0, scaledWidth, scaledHeight);
        const resized = scaledCtx.getImageData(0, 0, scaledWidth, scaledHeight).data;
        const canvas28 = new Float32Array(28 * 28);
        const x0 = Math.floor((28 - scaledWidth) / 2);
        const y0 = Math.floor((28 - scaledHeight) / 2);
        for (let y = 0; y < scaledHeight; y += 1) {
            for (let x = 0; x < scaledWidth; x += 1) {
                canvas28[(y0 + y) * 28 + (x0 + x)] = resized[(y * scaledWidth + x) * 4] / 255;
            }
        }

        let mass = 0;
        let sumX = 0;
        let sumY = 0;
        for (let y = 0; y < 28; y += 1) {
            for (let x = 0; x < 28; x += 1) {
                const value = canvas28[y * 28 + x];
                mass += value;
                sumX += x * value;
                sumY += y * value;
            }
        }

        if (mass > 0) {
            const centerX = sumX / mass;
            const centerY = sumY / mass;
            const shiftX = Math.round(13.5 - centerX);
            const shiftY = Math.round(13.5 - centerY);
            const shifted = new Float32Array(28 * 28);

            for (let y = 0; y < 28; y += 1) {
                for (let x = 0; x < 28; x += 1) {
                    const sourceX = x - shiftX;
                    const sourceY = y - shiftY;
                    if (sourceX < 0 || sourceX >= 28 || sourceY < 0 || sourceY >= 28) continue;
                    shifted[y * 28 + x] = canvas28[sourceY * 28 + sourceX];
                }
            }

            return Array.from({ length: 28 }, (_, row) => Array.from(shifted.slice(row * 28, (row + 1) * 28)));
        }

        return Array.from({ length: 28 }, (_, row) => Array.from(canvas28.slice(row * 28, (row + 1) * 28)));
    }

    async function selectDigitFromCanvas() {
        const token = state.renderToken + 1;
        state.renderToken = token;
        clearGradientReplay({ silent: true, render: false });
        state.hovered = null;
        state.intermediate = null;
        state.selected = null;
        state.detailed = false;
        state.cnn = [];
        state.nodeImageCache.clear();
        state.globalExtentCache.clear();
        els.detailToggle.classList.remove("active");
        els.detailToggle.textContent = "显示细节";
        els.overlay.hidden = true;
        try {
            if (!window.loadClientDigitModel || !window.clientDigitModel?.predictDetailed) {
                throw new Error("手写数字前端模型脚本未加载");
            }
            const canvas28 = preprocessDigitCanvas();
            els.hoverPill.textContent = "正在运行手写数字模型...";
            if (els.digitStatus) {
                els.digitStatus.textContent = "正在推理...";
            }
            await window.loadClientDigitModel();
            const result = window.clientDigitModel.predictDetailed(canvas28);
            if (token !== state.renderToken) {
                return;
            }
            state.digitPrediction = result.prediction;
            state.digitConfidence = result.confidence;
            buildDigitCNNFromResult(result);
            state.usingRealModel = true;
            state.modelError = "";
            renderAll();
            bindDigitSurfaces();
            const message = `预测 ${result.prediction}，置信度 ${(result.confidence * 100).toFixed(1)}%，${result.elapsed_ms.toFixed(2)} ms`;
            els.hoverPill.textContent = message;
            if (els.digitStatus) {
                els.digitStatus.textContent = message;
            }
        } catch (error) {
            if (token !== state.renderToken) {
                return;
            }
            state.usingRealModel = false;
            state.modelError = error.message || "手写数字模型推理失败";
            els.hoverPill.textContent = state.modelError;
            if (els.digitStatus) {
                els.digitStatus.textContent = state.modelError;
            }
            buildCNN();
            renderAll();
            bindDigitSurfaces();
        }
    }

    function matrixExtent(matrix) {
        if (!Array.isArray(matrix)) {
            return [0, 1];
        }
        let min = Infinity;
        let max = -Infinity;
        if (Array.isArray(matrix[0])) {
            matrix.forEach((row) => row.forEach((value) => {
                min = Math.min(min, value);
                max = Math.max(max, value);
            }));
        } else {
            matrix.forEach((value) => {
                min = Math.min(min, value);
                max = Math.max(max, value);
            });
        }
        return [min, max];
    }

    function symmetricRangeFromExtent(extent) {
        const maxAbs = Math.max(Math.abs(extent[0]), Math.abs(extent[1]));
        return 2 * (0.1 + Math.round(maxAbs * 1000) / 1000);
    }

    function prepareNodeMetadata(cnn = state.cnn, clearImages = true) {
        state.globalExtentCache.clear();
        if (clearImages) {
            state.nodeImageCache.clear();
        }
        cnn.flat().forEach((node) => {
            node.extent = Array.isArray(node.output) ? matrixExtent(node.output) : [0, 1];
        });
        const layerRangesLocal = cnn.map((layer) => {
            if (!layer.length) {
                return 1;
            }
            const type = layer[0].type;
            if (!["conv", "relu", "pool"].includes(type)) {
                return 1;
            }
            const extent = layer.reduce((acc, node) => [
                Math.min(acc[0], node.extent[0]),
                Math.max(acc[1], node.extent[1])
            ], [Infinity, -Infinity]);
            return symmetricRangeFromExtent(extent);
        });
        const group1 = layerRangesLocal.slice(1, 6);
        const group2 = layerRangesLocal.slice(6, 11);
        const moduleRange1 = Math.max(...group1, 1);
        const moduleRange2 = Math.max(...group2, 1);
        const globalRange = Math.max(...layerRangesLocal.slice(1, 11), 1);
        state.layerRanges = {
            local: layerRangesLocal,
            module: layerRangesLocal.map((range, index) => {
                if (index >= 1 && index <= 5) {
                    return moduleRange1;
                }
                if (index >= 6 && index <= 10) {
                    return moduleRange2;
                }
                return range;
            }),
            global: layerRangesLocal.map((range, index) => (index >= 1 && index <= 10 ? globalRange : range))
        };
        ["conv", "relu", "pool", "input", "flatten", "fc"].forEach((type) => {
            let min = Infinity;
            let max = -Infinity;
            cnn.flat().forEach((node) => {
                if (node.type === type && node.extent) {
                    min = Math.min(min, node.extent[0]);
                    max = Math.max(max, node.extent[1]);
                }
            });
            if (!Number.isFinite(min) || min === max) {
                min = type === "input" ? 0 : -1;
                max = 1;
            }
            state.globalExtentCache.set(type, [min, max]);
        });
        let activationMin = Infinity;
        let activationMax = -Infinity;
        cnn.flat().forEach((node) => {
            if (["conv", "relu", "pool", "flatten", "fc"].includes(node.type) && node.extent) {
                activationMin = Math.min(activationMin, node.extent[0]);
                activationMax = Math.max(activationMax, node.extent[1]);
            }
        });
        if (!Number.isFinite(activationMin) || activationMin === activationMax) {
            activationMin = -1;
            activationMax = 1;
        }
        state.globalExtentCache.set("activation", [activationMin, activationMax]);
    }

    function globalExtent(type) {
        return state.globalExtentCache.get(type) || [-1, 1];
    }

    function rangeForNode(node) {
        const scale = state.selectedScale || "local";
        const ranges = state.layerRanges[scale] || state.layerRanges.local || [];
        return ranges[node.layerIndex] || symmetricRangeFromExtent(node.extent || matrixExtent(node.output));
    }

    function colorFor(node, value, row, col) {
        const gradEntry = gradientEntry(node);
        if (gradEntry && gradEntry.matrix) {
            const gradValue = gradEntry.matrix[row]?.[col] ?? 0;
            return gradientColor(gradValue, gradEntry.max);
        }
        if (node.type === "kernel") {
            const [min, max] = node.extent || matrixExtent(node.output);
            const normalized = max === min ? 0.5 : (value - min) / (max - min);
            return colorScales.conv(Math.max(0, Math.min(1, normalized)));
        }
        if (node.type === "input") {
            if (state.modelMode === "digit") {
                return d3.interpolateBlues(Math.max(0.05, Math.min(1, value)));
            }
            const channelIndex = node.index % inputChannelScales.length;
            return inputChannelScales[channelIndex](Math.max(0, Math.min(1, value)));
        }
        if (node.type === "fc" || node.type === "flatten") {
            return colorScales.fc(Math.max(0.15, Math.min(0.95, value)));
        }
        const scale = colorScales[node.type] || colorScales.conv;
        if (["conv", "relu", "pool"].includes(node.type)) {
            const range = rangeForNode(node);
            const normalized = (value + range / 2) / range;
            return scale(Math.max(0, Math.min(1, normalized)));
        }
        let min = -1;
        let max = 1;
        [min, max] = node.extent || matrixExtent(node.output);
        const normalized = max === min ? 0.5 : (value - min) / (max - min);
        const checker = ((row + col) % 2) * 0.015;
        return scale(Math.max(0, Math.min(1, normalized + checker)));
    }

    function gradientEntry(node) {
        if (!node || !state.gradReplay.active) {
            return null;
        }
        if (!state.gradReplay.activeLayers.has(node.layerIndex)) {
            return null;
        }
        return state.gradReplay.nodeGrad.get(node.id) || null;
    }

    function gradientScalar(node) {
        const entry = gradientEntry(node);
        return entry ? entry.scalar || 0 : 0;
    }

    function edgeGradient(link) {
        if (!state.gradReplay.active) {
            return null;
        }
        const active = state.gradReplay.activeLayers.has(link.source.layerIndex) || state.gradReplay.activeLayers.has(link.target.layerIndex);
        if (!active) {
            return null;
        }
        const scalar = gradientScalar(link.target) || gradientScalar(link.source);
        if (!scalar) {
            return null;
        }
        const norm = Math.min(1, scalar / Math.max(1e-6, state.gradReplay.maxScalar));
        const color = gradientColor(scalar, state.gradReplay.maxScalar);
        return {
            color,
            width: 0.8 + norm * 3.2,
            opacity: 0.45 + norm * 0.5
        };
    }

    function gradFillColor(node, fallbackColor) {
        const scalar = gradientScalar(node);
        if (!state.gradReplay.active || !scalar) {
            return fallbackColor;
        }
        return gradientColor(scalar, state.gradReplay.maxScalar);
    }

    function matrixToDataUrl(node) {
        const cacheKey = `${state.modelMode}|${state.selectedImage}|${state.selectedScale}|${state.gradReplay.version}|${node.id}`;
        const cached = state.nodeImageCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const canvas = document.createElement("canvas");
        const gradEntry = gradientEntry(node);
        const matrix = gradEntry && gradEntry.matrix ? gradEntry.matrix : (Array.isArray(node.output) ? node.output : [[node.output]]);
        const size = matrix.length;
        const scale = Math.max(1, Math.ceil(64 / size));
        canvas.width = size * scale;
        canvas.height = size * scale;
        const ctx = canvas.getContext("2d");
        matrix.forEach((row, r) => row.forEach((value, c) => {
            if (gradEntry && gradEntry.matrix) {
                ctx.fillStyle = gradientColor(value, gradEntry.max);
            } else {
                ctx.fillStyle = colorFor(node, value, r, c);
            }
            ctx.fillRect(c * scale, r * scale, scale, scale);
        }));
        const dataUrl = canvas.toDataURL("image/png");
        state.nodeImageCache.set(cacheKey, dataUrl);
        return dataUrl;
    }

    function computeLayout() {
        const layerWidths = layerDefs.map((layer) => {
            if (layer.type === "flatten") {
                return 18;
            }
            if (layer.type === "fc") {
                return 90;
            }
            if (layer.type === "output") {
                return 140;
            }
            return nodeLength;
        });
        const totalLayerWidth = layerWidths.reduce((sum, item) => sum + item, 0);
        const layerGap = (width - leftPad - rightPad - totalLayerWidth) / (layerDefs.length - 1);
        let cursorX = leftPad;
        state.coords = state.cnn.map((layer, layerIndex) => {
            const usableHeight = height - topPad - bottomPad;
            const gap = (usableHeight - nodeLength * layer.length) / (layer.length + 1);
            const layerWidth = layerWidths[layerIndex];
            const x = cursorX;
            const coords = layer.map((node, index) => {
                const y = topPad + gap * (index + 1) + nodeLength * index;
                const cx = x + layerWidth / 2;
                return { ...node, x, y, width: layerWidth, cx, cy: y + nodeLength / 2 };
            });
            cursorX += layerWidth + layerGap;
            return coords;
        });
        state.links = [];
        for (let layerIndex = 1; layerIndex < state.coords.length; layerIndex++) {
            const prev = state.coords[layerIndex - 1];
            const cur = state.coords[layerIndex];
            const type = layerDefs[layerIndex].type;
            const prevType = layerDefs[layerIndex - 1].type;
            cur.forEach((target) => {
                if (type === "fc" && prevType === "flatten") {
                    const samples = 6;
                    const stride = Math.max(1, Math.floor(prev.length / samples));
                    const start = target.index % stride;
                    for (let s = start; s < prev.length; s += stride) {
                        const source = prev[s];
                        state.links.push({
                            source,
                            target,
                            sourceId: source.id,
                            targetId: target.id,
                            targetLayerIndex: target.layerIndex,
                            targetNodeIndex: target.index
                        });
                    }
                    return;
                }
                prev.forEach((source) => {
                    const oneToOne = type === "relu" || type === "pool" || (type === "output" && prevType === "fc");
                    if (oneToOne && source.index !== target.index) {
                        return;
                    }
                    state.links.push({
                        source,
                        target,
                        sourceId: source.id,
                        targetId: target.id,
                        targetLayerIndex: target.layerIndex,
                        targetNodeIndex: target.index
                    });
                });
            });
        }
    }

    function renderImageStrip() {
        els.imageStrip.innerHTML = `${sourceImages.map((item) => `
            <button class="ce-image-option ${item.file === state.selectedImage ? "active" : ""}" type="button" data-image="${item.file}" title="${item.label}">
                <img src="${resolveImageSrc(item.file)}" alt="${item.label}">
            </button>
        `).join("")}
        <button class="ce-image-option ce-upload-tile" type="button" data-upload-tile="true" title="上传图片" aria-label="上传图片">
            <span>+</span>
        </button>`;
        els.imageStrip.querySelectorAll("[data-image]").forEach((button) => {
            button.addEventListener("click", async () => {
                await selectImage(button.dataset.image);
            });
        });
        const uploadTile = els.imageStrip.querySelector("[data-upload-tile='true']");
        if (uploadTile) {
            uploadTile.addEventListener("click", () => {
                els.imageUpload.click();
            });
        }
    }

    function renderLegend() {
        const activeNodeForLegend = state.selected || state.cnn[0]?.[0];
        const activationExtent = legendExtent(activeNodeForLegend);
        const outputExtent = [0, 1];
        const modeLabel = {
            local: "当前：单元色阶",
            module: "当前：模块色阶",
            global: "当前：全局色阶"
        }[state.selectedScale] || "当前色阶";
        els.legend.innerHTML = `
            <div class="ce-legend-mode">${modeLabel}</div>
            <div class="ce-legend-row">
                <span>激活热力图</span>
                <span class="ce-legend-scale">
                    <span class="ce-legend-swatch" style="background: linear-gradient(90deg, ${d3.interpolateRdBu(1)}, ${d3.interpolateRdBu(0.5)}, ${d3.interpolateRdBu(0)})"></span>
                    <span class="ce-legend-ticks">
                        <span>${formatLegendNumber(activationExtent[0])}</span>
                        <span>${formatLegendNumber((activationExtent[0] + activationExtent[1]) / 2)}</span>
                        <span>${formatLegendNumber(activationExtent[1])}</span>
                    </span>
                </span>
            </div>
            <div class="ce-legend-row">
                <span>输出概率</span>
                <span class="ce-legend-scale">
                    <span class="ce-legend-swatch" style="background: linear-gradient(90deg, ${d3.interpolateOranges(0.15)}, ${d3.interpolateOranges(0.95)})"></span>
                    <span class="ce-legend-ticks">
                        <span>${formatLegendNumber(outputExtent[0])}</span>
                        <span>0.50</span>
                        <span>${formatLegendNumber(outputExtent[1])}</span>
                    </span>
                </span>
            </div>
        `;
    }

    function legendExtent(node) {
        if (!node || !node.extent) {
            return globalExtent("activation");
        }
        if (["conv", "relu", "pool"].includes(node.type)) {
            const range = rangeForNode(node);
            return [-range / 2, range / 2];
        }
        if (state.selectedScale === "local") {
            return node.extent;
        }
        if (state.selectedScale === "module") {
            return globalExtent(node.type);
        }
        return globalExtent("activation");
    }

    function formatLegendNumber(value) {
        if (!Number.isFinite(value)) {
            return "0";
        }
        if (Math.abs(value) >= 10) {
            return value.toFixed(1);
        }
        return value.toFixed(2);
    }

    function linkPath(link) {
        const source = { x: link.source.x + (link.source.width || nodeLength), y: link.source.cy };
        const target = { x: link.target.x, y: link.target.cy };
        const mid = (source.x + target.x) / 2;
        return `M${source.x},${source.y}C${mid},${source.y} ${mid},${target.y} ${target.x},${target.y}`;
    }

    function isRelatedLink(link, node) {
        return link.targetId === node.id || link.sourceId === node.id;
    }

    function activeNode() {
        return state.hovered || state.selected;
    }

    function selectNode(node) {
        if (!node) {
            return;
        }
        state.selected = node;
        state.intermediate = node;
        state.detailed = false;
        state.sideTab = defaultSideTabForMode();
        els.detailToggle.classList.remove("active");
        els.detailToggle.textContent = "显示细节";
        els.overlay.hidden = true;
        updateSidePanel();
        updateHighlights();
        updateInteraction(node, false);
        renderLegend();
        handleExplainerUnitClick(node.layerName, { node });
    }

    function renderNetwork() {
        if (!state.cnn.length) {
            els.svg.selectAll("*").remove();
            els.svg.attr("viewBox", `0 0 ${width} ${height}`)
                .append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .attr("fill", "#64748b")
                .attr("font-size", 18)
                .attr("font-weight", 900)
                .text("正在逐层计算 CNN 输出...");
            return;
        }
        computeLayout();
        const svg = els.svg;
        svg.selectAll("*").remove();
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        const main = svg.append("g").attr("class", "ce-cnn-group");
        main.append("defs").append("filter")
            .attr("id", "ceDropShadow")
            .append("feDropShadow")
            .attr("dx", 0)
            .attr("dy", 5)
            .attr("stdDeviation", 5)
            .attr("flood-opacity", 0.22);

        const edgeSelection = main.append("g")
            .attr("class", "ce-edge-group")
            .selectAll("path")
            .data(state.links)
            .enter()
            .append("path")
            .attr("class", (d) => `ce-edge ce-edge-target-${d.targetLayerIndex}-${d.targetNodeIndex}`)
            .attr("d", linkPath);

        if (state.gradReplay.active) {
            edgeSelection
                .classed("is-grad", (d) => edgeGradient(d) !== null)
                .style("stroke", (d) => {
                    const grad = edgeGradient(d);
                    return grad ? grad.color : null;
                })
                .style("stroke-width", (d) => {
                    const grad = edgeGradient(d);
                    return grad ? grad.width : null;
                })
                .style("opacity", (d) => {
                    const grad = edgeGradient(d);
                    return grad ? grad.opacity : null;
                });
        }

        const layerGroups = main.selectAll("g.ce-layer")
            .data(state.coords)
            .enter()
            .append("g")
            .attr("class", "ce-layer");

        layerGroups.each(function (layer, layerIndex) {
            const layerGroup = d3.select(this);
            const layerDef = layerDefs[layerIndex];
            const label = layerGroup.append("text")
                .attr("class", "ce-layer-label")
                .classed("selected", state.selected && state.selected.layerIndex === layerIndex)
                .attr("x", layer[0].cx)
                .attr("y", 30)
                .style("cursor", "pointer")
                .on("click", function (event) {
                    event.stopPropagation();
                    selectNode(layer[0]);
                })
                .text(layerDef.shortName);

            label.append("title").text(`${layerDef.name}: ${layerDef.output}`);

            layerGroup.append("text")
                .attr("class", "ce-layer-dimension")
                .attr("x", layer[0].cx)
                .attr("y", 45)
                .text(layerDef.output);

            const isUpdateLayer = state.gradReplay.active && state.gradReplay.updateActive && ["conv", "fc"].includes(layerDef.type);
            const nodeGroups = layerGroup.selectAll("g.ce-node")
                .data(layer)
                .enter()
                .append("g")
                .attr("class", (d) => {
                    const selected = state.selected && d.id === state.selected.id;
                    const hovered = state.hovered && d.id === state.hovered.id;
                    return `ce-node ${selected ? "selected" : ""} ${hovered ? "hovered" : ""} ${isUpdateLayer ? "is-update" : ""}`;
                })
                .style("cursor", "pointer")
                .on("mouseenter", function (event, d) {
                    state.hovered = d;
                    updateHighlights();
                    els.hoverPill.textContent = `${displayLayerName(d.layerName)} #${d.index + 1}`;
                    updateInteraction(d, true);
                })
                .on("mouseleave", function () {
                    state.hovered = null;
                    updateHighlights();
                    els.hoverPill.textContent = "悬停特征图";
                    updateInteraction(state.selected, false);
                })
                .on("click", function (event, d) {
                    event.stopPropagation();
                    selectNode(d);
                });

            if (layerDef.type === "flatten") {
                nodeGroups.append("rect")
                    .attr("class", "ce-vector-node")
                    .attr("x", (d) => d.cx - 6)
                    .attr("y", (d) => d.y)
                    .attr("width", 12)
                    .attr("height", nodeLength)
                    .style("fill", (d) => gradFillColor(d, colorFor(d, d.output, 0, 0)));
                nodeGroups.append("title")
                    .text((d) => `flatten[${d.range ? d.range.join("-") : d.index}]`);
            } else if (layerDef.type === "fc" || layerDef.name === "digit_fc_relu") {
                nodeGroups.append("circle")
                    .attr("class", "ce-logit-node")
                    .attr("cx", (d) => d.x + 16)
                    .attr("cy", (d) => d.cy)
                    .attr("r", 10)
                    .style("fill", (d) => {
                        const base = layerDef.name === "digit_fc_relu"
                            ? colorFor(d, d.output, 0, 0)
                            : colorScales.output(0.25 + 0.7 * d.output);
                        return gradFillColor(d, base);
                    });
                nodeGroups.append("title")
                    .text((d) => `${d.label || `logit ${d.index}`}：${Number.isFinite(d.logit) ? d.logit.toFixed(4) : d.output.toFixed(4)}`);
            } else if (state.modelMode === "digit" && layerDef.type === "input") {
                nodeGroups.append("foreignObject")
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y)
                    .attr("width", nodeLength)
                    .attr("height", nodeLength)
                    .html(`<canvas class="ce-digit-inline-canvas ce-digit-draw-surface" width="280" height="280" aria-label="手写数字输入层绘图区"></canvas>`);

                nodeGroups.append("rect")
                    .attr("class", "ce-node-border ce-digit-input-border")
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y)
                    .attr("width", nodeLength)
                    .attr("height", nodeLength);
            } else if (layerDef.type !== "output") {
                nodeGroups.append("image")
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y)
                    .attr("width", nodeLength)
                    .attr("height", nodeLength)
                    .attr("preserveAspectRatio", "none")
                    .attr("href", (d) => matrixToDataUrl(d));

                nodeGroups.append("rect")
                    .attr("class", "ce-node-border")
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y)
                    .attr("width", nodeLength)
                    .attr("height", nodeLength);
            } else {
                const maxOutput = Math.max(...layer.map((d) => d.output));
                const dlogits = state.gradReplay.active ? state.gradReplay.dlogits || [] : [];
                const showGrad = state.gradReplay.active && state.gradReplay.activeLayers.has(layerIndex);
                const targetLabel = state.gradReplay.targetLabel;
                nodeGroups.append("text")
                    .attr("class", (d) => {
                        const isTarget = showGrad && Number.isFinite(targetLabel) && d.index === targetLabel;
                        const gradActive = showGrad ? "is-grad-active" : "";
                        return `ce-output-name ${d.output === maxOutput ? "active" : ""} ${isTarget ? "is-target" : ""} ${gradActive}`;
                    })
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y + nodeLength / 2 - 3)
                    .text((d) => d.label)
                    .on("click", (event, d) => {
                        event.stopPropagation();
                        startGradientReplay(d.index);
                    });

                nodeGroups.append("rect")
                    .attr("class", "ce-output-track")
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y + nodeLength / 2 + 6)
                    .attr("height", 10)
                    .attr("width", 110)
                    .attr("rx", 5);

                nodeGroups.append("rect")
                    .attr("class", "ce-output-bar")
                    .attr("x", (d) => d.x)
                    .attr("y", (d) => d.y + nodeLength / 2 + 6)
                    .attr("height", 10)
                    .attr("width", 0)
                    .attr("rx", 5)
                    .classed("is-grad", showGrad)
                    .style("fill", (d) => {
                        if (showGrad) {
                            const gradValue = dlogits[d.index] || 0;
                            return gradientColor(gradValue, Math.max(1e-6, state.gradReplay.maxScalar));
                        }
                        return colorScales.output(0.45 + 0.5 * d.output);
                    })
                    .on("click", (event, d) => {
                        event.stopPropagation();
                        startGradientReplay(d.index);
                    })
                    .transition()
                    .duration(680)
                    .attr("width", (d) => 110 * d.output);
            }
        });


        const inputLayer = state.coords[0];
        const inputLabels = state.modelMode === "digit" ? ["28×28 灰度输入"] : ["Red channel", "Green", "Blue"];
        main.append("g")
            .attr("class", "ce-input-annotation")
            .selectAll("text")
            .data(inputLabels)
            .enter()
            .append("text")
            .attr("class", "ce-annotation")
            .attr("x", (_, i) => inputLayer[i]?.cx || inputLayer[0].cx)
            .attr("y", (_, i) => (inputLayer[i]?.y || inputLayer[0].y) + nodeLength + 14)
            .attr("text-anchor", "middle")
            .style("fill", (_, i) => state.modelMode === "digit" ? "#475569" : ["#c95e67", "#3db665", "#3f7fbc"][i])
            .text((d) => d);

        updateHighlights();
        bindDigitSurfaces();
    }


    function updateHighlights() {
        const node = activeNode();
        els.svg.selectAll(".ce-node")
            .classed("selected", (d) => state.selected && d.id === state.selected.id)
            .classed("hovered", (d) => state.hovered && d.id === state.hovered.id);

        els.svg.selectAll(".ce-edge")
            .classed("active", (d) => node && isRelatedLink(d, node));

        els.svg.selectAll(".ce-layer-label")
            .classed("selected", (_, index) => state.selected && state.selected.layerIndex === index);

        els.svg.selectAll(".ce-node")
            .style("opacity", (d) => {
                if (!node) {
                    return 1;
                }
                const related = d.id === node.id ||
                    d.layerIndex === node.layerIndex - 1 ||
                    d.layerIndex === node.layerIndex + 1;
                return related ? 1 : 0.68;
            });
    }

    function displayLayerName(name) {
        const map = {
            input: "输入层",
            conv_1_1: "卷积层 1-1",
            relu_1_1: "ReLU 1-1",
            conv_1_2: "卷积层 1-2",
            relu_1_2: "ReLU 1-2",
            max_pool_1: "最大池化 1",
            conv_2_1: "卷积层 2-1",
            relu_2_1: "ReLU 2-1",
            conv_2_2: "卷积层 2-2",
            relu_2_2: "ReLU 2-2",
            max_pool_2: "最大池化 2",
            flatten: "Flatten vector",
            fc: "FC / logits",
            output: "Softmax / output",
            digit_conv_1: "卷积层 1",
            digit_relu_1: "ReLU 1",
            digit_pool_1: "最大池化 1",
            digit_conv_2: "卷积层 2",
            digit_relu_2: "ReLU 2",
            digit_pool_2: "最大池化 2",
            digit_flatten: "Flatten",
            digit_fc_1: "FC 1",
            digit_fc_relu: "FC ReLU",
            digit_fc_2: "FC 2 / logits",
            digit_output: "Softmax / output"
        };
        return map[name] || name;
    }

    function renderIntermediateView() {
        els.svg.selectAll(".ce-intermediate-layer").remove();
        if (!state.intermediate) {
            return;
        }
        const node = state.intermediate;
        const layer = layerDefFor(node);
        const svg = els.svg.select(".ce-cnn-group");
        const panel = svg.append("g")
            .attr("class", "ce-intermediate-layer")
            .attr("transform", `translate(${width * 0.28}, ${height * 0.17})`);

        const panelW = width * 0.46;
        const panelH = height * 0.62;
        panel.append("rect")
            .attr("class", "ce-intermediate-backdrop")
            .attr("rx", 14)
            .attr("width", panelW)
            .attr("height", panelH);

        panel.append("text")
            .attr("class", "ce-intermediate-title")
            .attr("x", 22)
            .attr("y", 30)
            .text(`${displayLayerName(node.layerName)}：局部计算展开`);

        panel.append("text")
            .attr("class", "ce-intermediate-note")
            .attr("x", 22)
            .attr("y", 50)
            .text(intermediateNote(node));

        const close = panel.append("g")
            .attr("class", "ce-intermediate-close")
            .attr("transform", `translate(${panelW - 38}, 18)`)
            .on("click", () => {
                state.intermediate = null;
                state.detailed = false;
                els.detailToggle.classList.remove("active");
                els.detailToggle.textContent = "显示细节";
                els.overlay.hidden = true;
                renderNetwork();
            });
        close.append("rect").attr("width", 24).attr("height", 24).attr("rx", 12);
        close.append("text").attr("x", 12).attr("y", 13).text("×");

        if (node.type === "conv") {
            renderIntermediateConv(panel, node, panelW, panelH);
        } else if (node.type === "relu") {
            renderIntermediateRelu(panel, node, panelW, panelH);
        } else if (node.type === "pool") {
            renderIntermediatePool(panel, node, panelW, panelH);
        } else if (node.type === "flatten") {
            renderIntermediateFlatten(panel, node, panelW, panelH);
        } else if (node.type === "output") {
            renderIntermediateSoftmax(panel, panelW, panelH);
        } else {
            renderIntermediateGeneric(panel, node, panelW, panelH);
        }
    }

    function intermediateNote(node) {
        if (node.type === "conv") return "展示输入 feature maps 与 kernel 的局部卷积关系。";
        if (node.type === "relu") return "展示 max(0, x) 如何保留正响应并截断负响应。";
        if (node.type === "pool") return "展示 2×2 MaxPool 如何保留局部最大响应。";
        if (node.type === "output") return "展示 logits 如何经过 Softmax 转换为类别概率。";
        return "展示该层的局部计算或数据变换过程。";
    }

    function layerDefFor(node) {
        return layerDefs[node ? node.layerIndex : 0];
    }

    function drawMiniMatrixSvg(group, node, x, y, size, label, maxSize = 5, options = {}) {
        const matrix = Array.isArray(node.output) ? node.output : [[node.output]];
        const rows = matrix.slice(0, Math.min(maxSize, matrix.length));
        const cols = rows[0].slice(0, Math.min(maxSize, rows[0].length));
        const cell = size / cols.length;
        const g = group.append("g").attr("transform", `translate(${x}, ${y})`);
        g.append("text")
            .attr("class", "ce-intermediate-note")
            .attr("x", size / 2)
            .attr("y", -8)
            .attr("text-anchor", "middle")
            .text(label);
        rows.forEach((row, r) => {
            row.slice(0, cols.length).forEach((value, c) => {
                g.append("rect")
                    .attr("class", `ce-intermediate-cell ${options.hot && r < 2 && c < 2 ? "hot" : ""}`)
                    .attr("x", c * cell)
                    .attr("y", r * cell)
                    .attr("width", cell)
                    .attr("height", cell)
                    .attr("fill", colorFor(node, value, r, c));
            });
        });
        return { x, y, size, cx: x + size / 2, cy: y + size / 2 };
    }

    function drawVectorStripSvg(group, values, x, y, width, label) {
        const chipWidth = 34;
        const chipHeight = 24;
        const gap = 8;
        const columns = Math.max(1, Math.floor((width + gap) / (chipWidth + gap)));
        const rows = Math.ceil(values.length / columns);
        const height = rows * chipHeight + Math.max(0, rows - 1) * gap + 24;
        const g = group.append("g").attr("transform", `translate(${x}, ${y})`);
        g.append("text")
            .attr("class", "ce-intermediate-note")
            .attr("x", width / 2)
            .attr("y", -8)
            .attr("text-anchor", "middle")
            .text(label);
        values.forEach((value, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const chipX = col * (chipWidth + gap);
            const chipY = row * (chipHeight + gap);
            g.append("rect")
                .attr("x", chipX)
                .attr("y", chipY)
                .attr("width", chipWidth)
                .attr("height", chipHeight)
                .attr("rx", 6)
                .attr("fill", d3.interpolateBlues(0.18 + Math.max(0, Math.min(1, value)) * 0.62))
                .attr("stroke", "rgba(2, 132, 199, 0.18)");
            g.append("text")
                .attr("x", chipX + chipWidth / 2)
                .attr("y", chipY + 16)
                .attr("text-anchor", "middle")
                .attr("fill", "#0f172a")
                .attr("font-size", 10)
                .attr("font-weight", 900)
                .text(value.toFixed(2));
        });
        return { x, y, size: height, cx: x + width / 2, cy: y + height / 2 };
    }

    function drawLinkSvg(group, source, target, hot = false) {
        const mid = (source.x + source.size + target.x) / 2;
        group.append("path")
            .attr("class", `ce-intermediate-link ${hot ? "hot" : ""}`)
            .attr("d", `M${source.x + source.size},${source.cy} C${mid},${source.cy} ${mid},${target.cy} ${target.x},${target.cy}`);
    }

    function renderIntermediateConv(panel, node, panelW) {
        const prevLayer = state.coords[Math.max(0, node.layerIndex - 1)] || state.coords[0];
        const left = 42;
        const top = 100;
        const mapSize = 72;
        const kernelSize = 56;
        const outSize = 90;
        const inputs = prevLayer.slice(0, 3).map((item, index) =>
            drawMiniMatrixSvg(panel, item, left, top + index * 82, mapSize, `输入 ${index + 1}`, 5, { hot: index === 0 })
        );
        const kernels = inputs.map((_, index) =>
            drawMiniMatrixSvg(panel, { type: "conv", output: makeKernel(hashText(`${node.id}-${index}`)) }, left + 160, top + index * 82 + 8, kernelSize, `K${index + 1}`, 3)
        );
        const output = drawMiniMatrixSvg(panel, node, panelW - 140, top + 72, outSize, "加和 + b", 6);
        inputs.forEach((input, index) => {
            drawLinkSvg(panel, input, kernels[index], index === 0);
            drawLinkSvg(panel, kernels[index], output, index === 0);
        });
        panel.append("text")
            .attr("class", "ce-intermediate-title")
            .attr("x", left + 255)
            .attr("y", top + 118)
            .text("加和 + b");
    }

    function renderIntermediateRelu(panel, node, panelW) {
        const prev = state.coords[node.layerIndex - 1]?.[node.index] || node;
        const input = drawMiniMatrixSvg(panel, prev, 58, 130, 115, "ReLU 输入 Z", 6);
        const output = drawMiniMatrixSvg(panel, node, panelW - 178, 130, 115, "ReLU 输出 A", 6);
        drawLinkSvg(panel, input, output, true);
        panel.append("path")
            .attr("d", `M${panelW / 2 - 58},230 L${panelW / 2},230 L${panelW / 2 + 62},160`)
            .attr("fill", "none")
            .attr("stroke", "#3273dc")
            .attr("stroke-width", 5)
            .attr("stroke-linecap", "round");
        panel.append("text")
            .attr("class", "ce-intermediate-title")
            .attr("x", panelW / 2 - 66)
            .attr("y", 274)
            .text("A = max(0, Z)");
    }

    function renderIntermediatePool(panel, node, panelW) {
        const prev = state.coords[node.layerIndex - 1]?.[node.index] || node;
        const input = drawMiniMatrixSvg(panel, prev, 70, 125, 130, "池化输入", 6, { hot: true });
        const output = drawMiniMatrixSvg(panel, node, panelW - 176, 140, 105, "池化输出", 5);
        drawLinkSvg(panel, input, output, true);
        panel.append("text")
            .attr("class", "ce-intermediate-title")
            .attr("x", panelW / 2 - 44)
            .attr("y", 198)
            .text("max");
        panel.append("text")
            .attr("class", "ce-intermediate-note")
            .attr("x", panelW / 2 - 86)
            .attr("y", 222)
            .text("2×2 窗口取最大值");
    }

    function renderIntermediateSoftmax(panel, panelW) {
        const outputs = state.cnn[state.cnn.length - 1];
        const max = Math.max(...outputs.map((item) => item.output));
        const top = outputs.reduce((best, item) => (item.output > best.output ? item : best), outputs[0]);
        const chart = panel.append("g").attr("transform", "translate(70, 95)");
        outputs.forEach((item, index) => {
            const y = index * 24;
            chart.append("text")
                .attr("class", "ce-intermediate-note")
                .attr("x", 0)
                .attr("y", y + 12)
                .text(item.label);
            chart.append("rect")
                .attr("x", 96)
                .attr("y", y)
                .attr("width", 260)
                .attr("height", 12)
                .attr("rx", 6)
                .attr("fill", "#e5e7eb");
            chart.append("rect")
                .attr("x", 96)
                .attr("y", y)
                .attr("width", 260 * item.output / max)
                .attr("height", 12)
                .attr("rx", 6)
                .attr("fill", item.id === top.id ? d3.interpolateOranges(0.95) : d3.interpolateOranges(0.85));
            chart.append("text")
                .attr("class", "ce-intermediate-note")
                .attr("x", 368)
                .attr("y", y + 12)
                .text(`${(item.output * 100).toFixed(1)}%`);
        });
        panel.append("text")
            .attr("class", "ce-intermediate-title")
            .attr("x", panelW - 180)
            .attr("y", 160)
            .text("Softmax / output probabilities");
        panel.append("text")
            .attr("class", "ce-intermediate-note")
            .attr("x", panelW - 218)
            .attr("y", 188)
            .text("概率总和 = 1");
    }

    function renderIntermediateFlatten(panel, node, panelW) {
        const prevLayer = state.coords[Math.max(0, node.layerIndex - 1)] || state.coords[0];
        const prevNode = prevLayer[node.index % Math.max(1, prevLayer.length)] || prevLayer[0] || node;
        const vectorLayer = state.cnn[node.layerIndex] || [];
        const values = vectorLayer.slice(0, 24).map((item) => averageOutput(item.output));
        const input = drawMiniMatrixSvg(panel, prevNode, 48, 126, 128, "Flatten 前", 6);
        const vector = drawVectorStripSvg(panel, values, panelW - 300, 122, 220, "Flatten vector");
        drawLinkSvg(panel, input, vector, true);
        panel.append("text")
            .attr("class", "ce-intermediate-title")
            .attr("x", panelW / 2 - 46)
            .attr("y", 196)
            .text("reshape");
        panel.append("text")
            .attr("class", "ce-intermediate-note")
            .attr("x", panelW / 2 - 88)
            .attr("y", 222)
            .text("13×13×10 个 feature maps 展开为向量");
    }

    function renderIntermediateGeneric(panel, node, panelW) {
        const current = drawMiniMatrixSvg(panel, node, panelW / 2 - 55, 140, 110, displayLayerName(node.layerName), 6);
        panel.append("circle")
            .attr("cx", current.cx)
            .attr("cy", current.cy)
            .attr("r", 78)
            .attr("fill", "none")
            .attr("stroke", "#3273dc")
            .attr("stroke-dasharray", "6 6")
            .attr("opacity", 0.55);
    }

    function showPrinciplePanel(node) {
        if (!els.principlePanel || !els.principleContent) {
            return;
        }
        els.principlePanel.hidden = false;
        els.principlePanel.removeAttribute("hidden");
        els.principlePanel.classList.add("is-visible");
        els.principlePanel.dataset.calcMode = state.calcMode;
        els.principleContent.innerHTML = renderExplainChain(node);
        renderLatexInElement(els.principleContent);
        const closeButton = els.principleContent.querySelector("[data-principle-close]");
        if (closeButton) {
            closeButton.addEventListener("click", closePrinciplePanel);
        }
        els.principlePanel.onclick = (event) => {
            if (event.target === els.principlePanel) {
                closePrinciplePanel();
            }
        };
        const softmaxButton = els.principleContent.querySelector("[data-softmax-play]");
        if (softmaxButton) {
            softmaxButton.addEventListener("click", () => playProbeByMode(node));
        }
        const convButton = els.principleContent.querySelector("[data-conv-play]");
        if (convButton) {
            convButton.addEventListener("click", () => playProbeByMode(node));
        }
        const poolButton = els.principleContent.querySelector("[data-pool-play]");
        if (poolButton) {
            poolButton.addEventListener("click", () => playProbeByMode(node));
        }
        const reluButton = els.principleContent.querySelector("[data-relu-play]");
        if (reluButton) {
            reluButton.addEventListener("click", () => playProbeByMode(node));
        }
        const modeProbeButton = els.principleContent.querySelector("[data-mode-probe-play]");
        if (modeProbeButton) {
            modeProbeButton.addEventListener("click", () => playProbeByMode(node));
        }
        els.principleContent.querySelectorAll("[data-grad-target]").forEach((target) => {
            target.addEventListener("click", (event) => {
                event.stopPropagation();
                startGradientReplay(Number(target.dataset.gradTarget));
            });
        });
        els.hoverPill.textContent = `${displayLayerName(node.layerName)}`;
        window.setTimeout(() => {
            if (!els.principlePanel || els.principlePanel.hidden) {
                return;
            }
            playProbeByMode(node);
        }, 260);
    }

    function handleExplainerUnitClick(layerName, unitInfo = {}) {
        const node = unitInfo.node || state.selected || state.cnn[0]?.[0];
        if (!node) {
            return;
        }
        state.intermediate = node;
        showPrinciplePanel(node);
        if (state.detailed) {
            showDetailOverlay(node);
        }
    }

    function renderExplainChain(node) {
        if (state.calcMode === "backward") {
            return renderBackwardChain(node);
        }
        if (state.calcMode === "update") {
            return renderUpdateChain(node);
        }
        return renderForwardChain(node);
    }

    function renderForwardChain(node) {
        const html = principleHtml(node);
        if (!learnableLayer(node)) {
            return html;
        }
        return html.replace(/<\/div>\s*$/, `${parameterInspectorHtml(node, "params")}</div>`);
    }

    function renderBackwardChain(node) {
        return `
            <div class="ce-principle-shell is-mode-backward">
                ${principleHeader(node, "反向梯度模式：展示该层局部梯度如何由上游梯度计算并继续回传。")}
                ${learnableLayer(node) ? parameterInspectorHtml(node, "backward") : backwardCalc(node)}
                <div class="ce-principle-actions">
                    <button class="ce-softmax-play" type="button" data-mode-probe-play>播放反向梯度动画</button>
                </div>
            </div>
        `;
    }

    function renderUpdateChain(node) {
        return `
            <div class="ce-principle-shell is-mode-update">
                ${principleHeader(node, "参数更新模式：只对 Conv / FC 的权重和 bias 展示更新。")}
                ${learnableLayer(node) ? parameterInspectorHtml(node, "update") : updateCalc(node)}
                <div class="ce-principle-actions">
                    <button class="ce-softmax-play" type="button" data-mode-probe-play>播放参数更新动画</button>
                </div>
            </div>
        `;
    }

    function playProbeByMode(node) {
        if (state.calcMode === "backward") {
            playBackwardProbe(node);
            return;
        }
        if (state.calcMode === "update") {
            playUpdateProbe(node);
            return;
        }
        playForwardProbe(node);
    }

    function playForwardProbe(node) {
        if (node.type === "conv") {
            playConvWindowAnimation();
        } else if (node.type === "pool") {
            playPoolWindowAnimation();
        } else if (node.type === "relu") {
            playReluMaskAnimation();
        } else if (node.type === "output") {
            playSoftmaxAnimation();
        } else {
            playCalcFlowAnimation("is-demo-hot");
        }
    }

    function closePrinciplePanel() {
        state.intermediate = null;
        if (els.principlePanel) {
            els.principlePanel.classList.remove("is-visible");
            els.principlePanel.hidden = true;
        }
        if (els.principleContent) {
            els.principleContent.innerHTML = "";
        }
        if (els.hoverPill) {
            els.hoverPill.textContent = "悬停特征图";
        }
        updateHighlights();
    }

    function principleHtml(node) {
        if (node.type === "input") {
            return inputPrincipleHtml(node);
        }
        if (node.type === "conv") {
            return convPrincipleHtml(node);
        }
        if (node.type === "relu") {
            return reluPrincipleHtml(node);
        }
        if (node.type === "pool") {
            return poolPrincipleHtml(node);
        }
        if (node.type === "output") {
            return softmaxPrincipleHtml();
        }
        if (node.type === "flatten") {
            return flattenPrincipleHtml(node);
        }
        if (node.type === "fc") {
            return fcPrincipleHtml(node);
        }
        return genericPrincipleHtml(node);
    }

    function principleHeader(node, subtitle) {
        return `
            <div class="ce-principle-header">
                <div>
                    <h3>${displayLayerName(node.layerName)}：原理展开</h3>
                    <p>${subtitle}</p>
                </div>
                <button class="ce-principle-close" type="button" data-principle-close aria-label="关闭">×</button>
            </div>
        `;
    }

    function defaultSideTabForMode() {
        if (state.calcMode === "backward" || state.calcMode === "update") {
            return "grads";
        }
        return "info";
    }

    function syncSideTabs() {
        if (!els.sideTabs) {
            return;
        }
        els.sideTabs.querySelectorAll("[data-ce-side-tab]").forEach((button) => {
            button.classList.toggle("active", button.dataset.ceSideTab === state.sideTab);
        });
        if (els.layerInfo) {
            els.layerInfo.hidden = state.sideTab !== "info";
        }
    }

    function parameterSpec(node) {
        const name = String(node?.layerName || "");
        if (node?.type === "conv") {
            if (name.includes("digit_conv_1")) {
                return { kind: "conv", title: "Conv1 kernels", shape: "32 × 1 × 3 × 3", outChannels: 32, inChannels: 1, outputIndex: 5, inputIndex: 0 };
            }
            if (name.includes("digit_conv_2")) {
                return { kind: "conv", title: "Conv2 kernels", shape: "64 × 32 × 3 × 3", outChannels: 64, inChannels: 32, outputIndex: 5, inputIndex: 7 };
            }
            const inputChannels = Math.max(1, state.coords[Math.max(0, node.layerIndex - 1)]?.length || 3);
            const outputChannels = Math.max(1, state.coords[node.layerIndex]?.length || 10);
            return { kind: "conv", title: `${displayLayerName(node.layerName)} kernels`, shape: `${outputChannels} × ${inputChannels} × 3 × 3`, outChannels: outputChannels, inChannels: inputChannels, outputIndex: Math.min(5, outputChannels - 1), inputIndex: Math.min(1, inputChannels - 1) };
        }
        if (node?.type === "fc") {
            if (name.includes("digit_fc_1")) {
                return { kind: "fc", title: "FC1 weight", shape: "3136 × 128", inputDim: 3136, outputDim: 128, inputIndex: 48, outputIndex: 5 };
            }
            if (name.includes("digit_fc_2") || name.includes("logits")) {
                return { kind: "fc", title: "FC2 weight", shape: "128 × 10", inputDim: 128, outputDim: 10, inputIndex: 12, outputIndex: 3 };
            }
            return { kind: "fc", title: `${displayLayerName(node.layerName)} weight`, shape: "sampled W[i,j]", inputDim: 1690, outputDim: 10, inputIndex: 24, outputIndex: Math.min(5, node.index || 0) };
        }
        return { kind: "none", title: "无可学习参数", shape: "-", inputDim: 0, outputDim: 0 };
    }

    function representativeKernel(node, index = 0) {
        return makeKernel(hashText(`${node.id || node.layerName}-kernel-${index}`));
    }

    function representativeWeightPatch(node, rows = 8, cols = 14) {
        const rand = randomFrom(hashText(`${node.id || node.layerName}-weight-patch`));
        return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
            const band = Math.sin((r + 1) * 0.7) * Math.cos((c + 1) * 0.35);
            return (band * 0.18) + (rand() - 0.5) * 0.32;
        }));
    }

    function convKernelBankHtml(node, spec) {
        const count = Math.min(10, spec.outChannels || 10);
        const active = Math.min(count - 1, Math.max(0, node.index || spec.outputIndex || 0));
        const tiles = Array.from({ length: count }, (_, index) => {
            const kernel = representativeKernel(node, index);
            return `
                <button class="ce-param-kernel-tile ${index === active ? "is-active" : ""}" type="button" data-kernel-index="${index}">
                    ${plainMatrix(kernel, `K${index + 1}`, 3, { role: "conv-kernel", fixedScale: true, compact: true })}
                </button>
            `;
        }).join("");
        const slice = representativeKernel(node, active);
        return `
            <div class="ce-param-section">
                <div class="ce-param-heading">
                    <strong>${spec.title}</strong>
                    <span>${spec.shape}</span>
                </div>
                <div class="ce-param-kernel-bank">${tiles}</div>
            </div>
        `;
    }

    function fcWeightInspectorHtml(node, spec) {
        const patch = representativeWeightPatch(node);
        const weightValue = patch[2][4];
        return `
            <div class="ce-param-section">
                <div class="ce-param-heading">
                    <strong>${spec.title}</strong>
                    <span>${spec.shape}</span>
                </div>
                <div class="ce-param-grid">
                    <div class="ce-param-card is-wide">
                        ${plainMatrix(patch, "W 局部 heatmap", 8, { role: "conv-product", compact: true, markWindow: { row: 2, col: 4, size: 1 } })}
                        <p class="ce-matrix-note">高亮代表性连接 W[${spec.inputIndex}, ${spec.outputIndex}] = ${num(weightValue)}。</p>
                    </div>
                    <div class="ce-param-card">
                        ${fcLinksSvg(Math.min(12, spec.inputDim), Math.min(6, spec.outputDim))}
                        <p>网络图中同步高亮 input node i、output node j 与对应连接线。</p>
                    </div>
                </div>
            </div>
        `;
    }

    function parameterInspectorHtml(node, mode = state.calcMode) {
        const spec = parameterSpec(node);
        if (spec.kind === "conv") {
            if (mode === "params") {
                return `
                    <div class="ce-param-inspector is-forward">
                        <div class="ce-param-tabs-title">Parameter Inspector</div>
                        ${convKernelBankHtml(node, spec)}
                    </div>
                `;
            }
            const calc = mode === "backward" ? backwardCalc(node) : mode === "update" ? updateCalc(node) : forwardCalc(node);
            return `
                <div class="ce-param-inspector is-${mode}">
                    <div class="ce-param-tabs-title">Parameter Inspector</div>
                    ${convKernelBankHtml(node, spec)}
                    ${calc}
                </div>
            `;
        }
        if (spec.kind === "fc") {
            if (mode === "params") {
                return `
                    <div class="ce-param-inspector is-forward">
                        <div class="ce-param-tabs-title">Parameter Inspector</div>
                        ${fcWeightInspectorHtml(node, spec)}
                    </div>
                `;
            }
            const calc = mode === "backward" ? backwardCalc(node) : mode === "update" ? updateCalc(node) : forwardCalc(node);
            return `
                <div class="ce-param-inspector is-${mode}">
                    <div class="ce-param-tabs-title">Parameter Inspector</div>
                    ${fcWeightInspectorHtml(node, spec)}
                    ${calc}
                </div>
            `;
        }
        return `
            <div class="ce-param-inspector is-${mode}">
                <div class="ce-principle-empty">该层无可学习参数，不参与参数更新。</div>
            </div>
        `;
    }

    function convPrincipleHtml(node) {
        const prevLayer = state.coords[Math.max(0, node.layerIndex - 1)] || state.coords[0];
        const prevNode = prevLayer[node.index % Math.max(1, prevLayer.length)] || prevLayer[0] || node;
        const channelCount = Math.min(6, Math.max(1, prevLayer.length));
        const inputChannels = prevLayer.slice(0, channelCount).map((item, index) => inputPatchSourceForConv(node, item, index));
        const kernels = inputChannels.map((_, i) => makeKernel(hashText(`${node.id}-${i}`)));
        const inputForKernel = inputPatchSourceForConv(node, prevNode);
        const focus = focusStart(inputForKernel.output, 3);
        const patch = matrixWindow(inputForKernel.output, focus.row, focus.col, 3);
        const product = multiplyMatrices(patch, kernels[0]);
        const outFocus = focusStart(node.output, 1);
        const inputHeatmap = node.layerName === "conv_1_1";
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "用 patch 与卷积核相乘，再与偏置相加得到特征图")}
                <div class="ce-principle-stage">
                    <div class="ce-principle-card">
                        <h4>输入特征图</h4>
                        ${stackedFeatureMaps(inputChannels, inputHeatmap ? "特征图堆叠" : "特征图", { role: "conv-input", heatmap: inputHeatmap, markWindow: { row: focus.row, col: focus.col, size: 3 } })}
                        <p class="ce-matrix-note">从输入特征图中取出一个 3 × 3 patch。</p>
                    </div>
                    <div class="ce-principle-operator">×W+b</div>
                    <div class="ce-principle-card">
                        <h4>卷积核</h4>
                        ${stackedKernels(kernels, "3 × 3 kernel")}
                        <span class="ce-principle-formula" data-tex="Z_k = \\sum_c X_c \\ast K_{k,c} + b_k"></span>
                    </div>
                    <div class="ce-principle-operator">=</div>
                    <div class="ce-principle-card">
                        <h4>逐元素乘积</h4>
                        ${matrixHtml(product, "patch × K1", { role: "conv-product", node, zoom: true })}
                        <p class="ce-matrix-note">乘积结果求和后再加上偏置。</p>
                    </div>
                    <div class="ce-principle-operator">+</div>
                    <div class="ce-principle-card">
                        <h4>输出特征图</h4>
                        ${detailMatrix(node, "Feature map", 10, { compact: true, role: "conv-output", markWindow: { row: outFocus.row, col: outFocus.col, size: 1 } })}
                    </div>
                </div>
                <div class="ce-principle-actions">
                    <button class="ce-softmax-play" type="button" data-conv-play>播放卷积过程</button>
                    <span class="ce-principle-badge">patch × kernel + bias</span>
                </div>
                <ul class="ce-principle-steps">
                    <li>取出局部 patch</li>
                    <li>与卷积核逐元素相乘</li>
                    <li>求和并得到 feature map</li>
                </ul>
            </div>
        `;
    }

    function inputPrincipleHtml(node) {
        let imageSrc;
        if (state.modelMode === "digit") {
            imageSrc = els.digitCanvas.toDataURL();
        } else {
            imageSrc = resolveImageSrc(state.selectedImage);
        }
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "RGB 图像作为 CNN 的输入")}
                <div class="ce-principle-stage is-input">
                    <div class="ce-principle-card">
                        <h4>输入图像</h4>
                        <div class="ce-input-preview-frame">
                            <img class="ce-input-preview" src="${imageSrc}" alt="input image">
                        </div>
                        <p class="ce-matrix-note">像素会先被归一化，再送入网络。</p>
                    </div>
                    <div class="ce-principle-card">
                        <h4>输入张量</h4>
                        <div class="ce-latex-block" data-tex="X \\in R^{64\\times64\\times3}" data-display="block"></div>
                        <ul class="ce-principle-steps">
                            <li>64 × 64 × 3</li>
                            <li>RGB 三通道</li>
                            <li>进入第一层卷积</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    function reluPrincipleHtml(node) {
        const prev = state.coords[node.layerIndex - 1]?.[node.index] || node;
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "ReLU 将负值截断为 0")}
                <div class="ce-principle-stage is-relu">
                    <div class="ce-principle-card">
                        <h4>输入 Z</h4>
                        ${detailMatrix(prev, "ReLU 输入", 10, { compact: true, reluMask: true, role: "relu-input" })}
                    </div>
                    <div class="ce-principle-operator">→</div>
                    <div class="ce-principle-card">
                        <h4>ReLU 函数</h4>
                        ${reluGraph()}
                        <span class="ce-principle-formula" data-tex="A = \\max(0, Z)"></span>
                        <div class="ce-principle-actions">
                            <button class="ce-softmax-play" type="button" data-relu-play>播放 ReLU</button>
                        </div>
                    </div>
                    <div class="ce-principle-operator">→</div>
                    <div class="ce-principle-card">
                        <h4>A</h4>
                        ${detailMatrix(node, "ReLU 输出", 10, { compact: true, role: "relu-output" })}
                    </div>
                </div>
            </div>
        `;
    }

    function poolPrincipleHtml(node) {
        const prev = state.coords[node.layerIndex - 1]?.[node.index] || node;
        const prevMatrix = Array.isArray(prev.output) ? prev.output : [[prev.output]];
        const inputSampleSize = Math.max(2, Math.min(12, prevMatrix.length));
        const evenInputSampleSize = inputSampleSize % 2 === 0 ? inputSampleSize : inputSampleSize - 1;
        const outputSampleSize = Math.max(1, Math.floor(evenInputSampleSize / 2));
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "MaxPool 取局部窗口中的最大值")}
                <div class="ce-principle-stage is-pool">
                    <div class="ce-principle-card">
                        <h4>输入激活图</h4>
                        ${detailMatrix(prev, "激活图", evenInputSampleSize, { compact: true, role: "pool-input" })}
                        <p class="ce-matrix-note">按 2 × 2 窗口做最大池化。</p>
                    </div>
                    <div class="ce-principle-operator is-orange">max</div>
                    <div class="ce-principle-card">
                        <h4>池化规则</h4>
                        <ul class="ce-principle-steps">
                    <li>在窗口内取最大值</li>
                    <li>只保留最强响应</li>
                    <li>stride = 2</li>
                        </ul>
                        <span class="ce-principle-formula" data-tex="P_{i,j} = \\max(\\mathrm{region}_{i,j})"></span>
                        <div class="ce-principle-actions">
                            <button class="ce-softmax-play" type="button" data-pool-play>播放池化过程</button>
                        </div>
                    </div>
                    <div class="ce-principle-operator">→</div>
                    <div class="ce-principle-card">
                        <h4>输出</h4>
                        ${detailMatrix(node, "池化输出", outputSampleSize, { compact: true, role: "pool-output" })}
                    </div>
                </div>
            </div>
        `;
    }

    function softmaxPrincipleHtml() {
        const outputs = state.cnn[state.cnn.length - 1];
        const top = [...outputs].sort((a, b) => b.output - a.output)[0];
        const logits = outputs.map((item) => Number.isFinite(item.logit) ? item.logit : Math.log(Math.max(1e-7, item.output)));
        const maxLogit = Math.max(...logits);
        const exps = logits.map((logit) => Math.exp(logit - maxLogit));
        const denom = exps.reduce((sum, value) => sum + value, 0);
        const topIndex = outputs.findIndex((item) => item.id === top.id);
        const targetLabel = Number.isFinite(state.gradReplay.targetLabel) ? state.gradReplay.targetLabel : null;
        const dlogits = targetLabel === null ? [] : outputs.map((item, index) => item.output - (index === targetLabel ? 1 : 0));
        return `
            <div class="ce-principle-shell">
                ${principleHeader({ layerName: "output" }, "Softmax 将 logits 归一化为概率")}
                <div class="ce-principle-grid is-two">
                    <div class="ce-principle-card">
                        <h4>Softmax 公式</h4>
                        <div class="ce-latex-block" data-tex="p_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}" data-display="block"></div>
                        <div class="ce-softmax-substitution">
                            <div class="ce-softmax-eq">
                                <span>类别</span>
                                <strong>${top.label}</strong>
                            </div>
                            <div class="ce-softmax-eq">
                                <span>分母 × exp(z-max)</span>
                                <strong data-softmax-denom>${denom.toFixed(4)}</strong>
                            </div>
                            <div class="ce-softmax-eq is-main">
                                <span>p(${top.label})</span>
                                <strong data-softmax-main>exp(${logits[topIndex].toFixed(3)} - ${maxLogit.toFixed(3)}) / ${denom.toFixed(4)} = ${(top.output * 100).toFixed(1)}%</strong>
                            </div>
                        </div>
                        <div class="ce-softmax-table">
                            <div class="ce-softmax-table-head"><span>类别</span><span>logit z</span><span>exp(z-max)</span><span>${targetLabel === null ? "概率" : "dlogits"}</span></div>
                            ${outputs.map((item, index) => `<div class="ce-softmax-calc-row ${item.id === top.id ? "top" : ""} ${targetLabel === index ? "is-target" : ""}" data-softmax-calc-row="${index}" data-grad-target="${index}">
                                <span>${item.label}</span>
                                <span>${logits[index].toFixed(3)}</span>
                                <span>${exps[index].toFixed(4)}</span>
                                <span>${targetLabel === null ? `${(item.output * 100).toFixed(1)}%` : dlogits[index].toFixed(3)}</span>
                            </div>`).join("")}
                        </div>
                    </div>
                    <div class="ce-principle-card">
                        <h4>概率分布</h4>
                        <div class="ce-softmax-detail">
                            ${outputs.map((item, index) => `<button class="ce-softmax-row ${item.id === top.id ? "top" : ""} ${targetLabel === index ? "is-target" : ""}" type="button" data-softmax-row="${index}" data-grad-target="${index}" title="设为正确标签并回放梯度">
                                <span>${item.label}</span>
                                <span class="ce-softmax-track"><span class="ce-softmax-fill" style="--prob:${Math.round(item.output * 100)}%"></span></span>
                                <span>${targetLabel === null ? `${(item.output * 100).toFixed(1)}%` : dlogits[index].toFixed(2)}</span>
                            </button>`).join("")}
                        </div>
                        ${targetLabel === null ? `<p class="ce-matrix-note">点击任意类别条目，将其设为 targetLabel 并从 Softmax 向输入端回放梯度。</p>` : `<p class="ce-matrix-note">targetLabel=${targetLabel}，dlogits = probs - onehot(${targetLabel})。</p>`}
                        <button class="ce-softmax-play" type="button" data-softmax-play>播放 Softmax 动画</button>
                    </div>
                </div>
            </div>
        `;
    }

    function fcPrincipleHtml(node) {
        const prevLayer = state.coords[node.layerIndex - 1] || [];
        const flatValues = prevLayer.slice(0, 12).map((item) => averageOutput(item.output));
        const logits = state.cnn[node.layerIndex] || [];
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "FC / logits 将向量映射为类别原始分数")}
                <div class="ce-principle-stage is-fc">
                    <div class="ce-principle-card">
                        <h4>Flatten vector</h4>
                        <div class="ce-vector-strip">
                            ${flatValues.map((value, index) => `<span class="ce-vector-chip" style="opacity:${0.35 + value * 0.65}" data-fc-input="${index}">${value.toFixed(2)}</span>`).join("")}
                        </div>
                        <p class="ce-matrix-note">由 feature maps 展开得到的 flatten 向量。</p>
                    </div>
                    <div class="ce-principle-operator">×W+b</div>
                    <div class="ce-principle-card">
                        <h4>全连接权重</h4>
                        ${fcLinksSvg(flatValues.length, Math.min(6, logits.length))}
                        <span class="ce-principle-formula" data-tex="z_j = \\sum_i x_i W_{i,j} + b_j"></span>
                    </div>
                    <div class="ce-principle-operator">→</div>
                    <div class="ce-principle-card">
                        <h4>FC / logits</h4>
                        <div class="ce-mini-bars">
                            ${logits.map((item) => `<div class="ce-mini-bar">
                                <span>FC / logits ${item.index}</span>
                                <span class="ce-mini-bar-track"><span class="ce-mini-bar-fill" style="--bar-width:${Math.max(4, Math.round(item.output * 100))}%"></span></span>
                                <span>${item.output.toFixed(2)}</span>
                            </div>`).join("")}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function genericPrincipleHtml(node) {
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "该层的局部表示")}
                <div class="ce-principle-stage is-generic">
                    <div class="ce-principle-card">${detailMatrix(node, "当前特征图", 14, { compact: true })}</div>
                    <div class="ce-principle-card">
                        <h4>说明</h4>
                        <p class="ce-detail-caption">${layerDefFor(node).desc}</p>
                        <span class="ce-principle-formula" data-tex="${layerDefFor(node).formula.replace(/"/g, "&quot;")}"></span>
                    </div>
                </div>
            </div>
        `;
    }

    function flattenPrincipleHtml(node) {
        const prevLayer = state.coords[node.layerIndex - 1] || [];
        const prevNode = prevLayer[node.index % Math.max(1, prevLayer.length)] || prevLayer[0] || node;
        const vectorLayer = state.cnn[node.layerIndex] || [];
        const values = vectorLayer.slice(0, 24).map((item) => averageOutput(item.output));
        return `
            <div class="ce-principle-shell">
                ${principleHeader(node, "Flatten 将 feature maps 展开成一维向量，为后面的 FC / logits 提供输入。")}
                <div class="ce-principle-stage is-fc">
                    <div class="ce-principle-card">
                        <h4>Flatten 前的 feature map</h4>
                        ${detailMatrix(prevNode, "Current feature map", 10, { compact: true })}
                    </div>
                    <div class="ce-principle-operator">→</div>
                    <div class="ce-principle-card">
                        <h4>Flatten vector</h4>
                        <div class="ce-vector-strip">
                            ${values.map((value, index) => `<span class="ce-vector-chip" style="opacity:${0.35 + value * 0.65}" data-fc-input="${index}">${value.toFixed(2)}</span>`).join("")}
                        </div>
                        <p class="ce-matrix-note">Flatten 只是重排数据，不改变数值本身。</p>
                    </div>
                </div>
            </div>
        `;
    }

    function updateSidePanel() {
        if (!state.cnn.length) {
            return;
        }
        const node = state.selected || state.cnn[0][0];
        const layer = layerDefFor(node);
        syncSideTabs();
        els.layerTitle.textContent = displayLayerName(node.layerName);
        els.layerInput.textContent = layer.input;
        els.layerOutput.textContent = layer.output;
        els.layerDesc.textContent = layer.desc;
        renderLatex(els.layerFormula, layer.formula, true);
        renderMiniView(node);
    }

    function renderMiniView(node) {
        if (!node) {
            return;
        }
        if (state.sideTab === "params") {
            els.miniView.innerHTML = parameterInspectorHtml(node, "params");
            renderLatexInElement(els.miniView);
            return;
        }
        if (state.sideTab === "grads") {
            els.miniView.innerHTML = state.calcMode === "update" ? updateCalc(node) : backwardCalc(node);
            renderLatexInElement(els.miniView);
            return;
        }
        if (node.type === "input") {
            let imageSrc;
            if (state.modelMode === "digit") {
                els.miniView.innerHTML = `
                    <div class="ce-input-preview-frame is-mini is-digit-input-card">
                        <canvas class="ce-input-preview ce-digit-card-canvas ce-digit-draw-surface" width="280" height="280" aria-label="手写数字输入层绘图区"></canvas>
                        <div class="ce-digit-inline-actions">
                            <button type="button" data-ce-clear-digit>清空</button>
                        </div>
                        <p class="ce-detail-caption">可在此继续书写数字，松开后自动更新模型。</p>
                    </div>
                `;
                bindDigitSurfaces();
                return;
            } else {
                imageSrc = resolveImageSrc(state.selectedImage);
            }
            els.miniView.innerHTML = `
                <div class="ce-input-preview-frame is-mini">
                    <img class="ce-input-preview" src="${imageSrc}" alt="input image">
                </div>
            `;
            return;
        }
        if (node.type === "output") {
            const outputs = state.cnn[state.cnn.length - 1];
            const targetLabel = Number.isFinite(state.gradReplay.targetLabel) ? state.gradReplay.targetLabel : null;
            const dlogits = state.gradReplay.dlogits || [];
            els.miniView.innerHTML = `<div class="ce-mini-bars">${outputs.map((item) => `
                <button class="ce-mini-bar ce-output-target-button ${targetLabel === item.index ? "is-target" : ""}" type="button" data-grad-target="${item.index}">
                    <span>${item.label}</span>
                    <span class="ce-mini-bar-track"><span class="ce-mini-bar-fill" style="--bar-width:${Math.round(item.output * 100)}%"></span></span>
                    <span>${targetLabel === null ? `${(item.output * 100).toFixed(1)}%` : dlogits[item.index]?.toFixed(2)}</span>
                </button>
            `).join("")}</div>`;
            els.miniView.querySelectorAll("[data-grad-target]").forEach((target) => {
                target.addEventListener("click", () => startGradientReplay(Number(target.dataset.gradTarget)));
            });
            return;
        }
        if (node.type === "fc") {
            const fc = state.cnn[node.layerIndex];
            els.miniView.innerHTML = `<div class="ce-mini-bars">${fc.map((item) => `
                <div class="ce-mini-bar">
                    <span>FC / logits ${item.index}</span>
                    <span class="ce-mini-bar-track"><span class="ce-mini-bar-fill" style="--bar-width:${Math.round(item.output * 100)}%"></span></span>
                    <span>${item.output.toFixed(2)}</span>
                </div>
            `).join("")}</div>`;
            return;
        }
        if (node.type === "flatten") {
            const layer = state.cnn[node.layerIndex];
            els.miniView.innerHTML = `
                <div class="ce-vector-strip">
                    ${layer.slice(0, 24).map((item) => `<span class="ce-vector-chip" style="opacity:${0.35 + Math.min(1, item.output) * 0.65}">${item.output.toFixed(2)}</span>`).join("")}
                </div>
            `;
            return;
        }
        const matrix = node.output;
        const stride = Math.max(1, Math.floor(matrix.length / 8));
        const sampled = [];
        for (let r = 0; r < matrix.length; r += stride) {
            const row = [];
            for (let c = 0; c < matrix[r].length; c += stride) {
                row.push(matrix[r][c]);
            }
            sampled.push(row.slice(0, 8));
            if (sampled.length >= 8) {
                break;
            }
        }
        els.miniView.innerHTML = `
            <div class="ce-mini-matrix" style="--cols:${sampled[0].length}">
                ${sampled.flatMap((row, r) => row.map((value, c) => `
                    <span class="ce-mini-cell" style="--cell-bg:${colorFor(node, value, r, c)}"></span>
                `)).join("")}
            </div>
        `;
    }

    function calcModeLabel() {
        return {
            forward: "Forward 前向计算",
            backward: "Backward 反向梯度",
            update: "Update 参数更新"
        }[state.calcMode] || "Forward 前向计算";
    }

    function learnableLayer(node) {
        return node && (node.type === "conv" || node.type === "fc");
    }

    function sampleMatrixFromNode(node, size = 3) {
        const matrix = Array.isArray(node?.output) ? node.output : [[Number(node?.output || 0)]];
        const focus = focusStart(matrix, size);
        return matrixWindow(matrix, focus.row, focus.col, size);
    }

    function num(value, digits = 2) {
        return Number(value || 0).toFixed(digits);
    }

    function calcArrow() {
        return `<div class="ce-calc-arrow">→</div>`;
    }

    function calcMatrix(matrix, title, options = {}) {
        return `<div class="ce-calc-chip">${plainMatrix(matrix, title, options.size || matrix.length || 3, { compact: true, ...options })}</div>`;
    }

    function calcVector(values, title, options = {}) {
        return `
            <div class="ce-calc-vector ${options.kind || ""}">
                <div class="ce-detail-label">${title}${options.note ? `<span>${options.note}</span>` : ""}</div>
                <div class="ce-vector-strip">
                    ${values.map((value, index) => {
                        const hot = options.hotIndex === index ? " is-hot" : "";
                        const sign = value < 0 ? " is-negative" : value > 0 ? " is-positive" : "";
                        return `<span class="ce-vector-chip ce-grad-token${hot}${sign}">${num(value, options.digits || 2)}</span>`;
                    }).join("")}
                </div>
            </div>
        `;
    }

    function calcShell({ kind = "", title, formula, numeric, chain = "", conclusion = "" }) {
        return `
            <div class="ce-calc-detail ${kind}">
                <div class="ce-calc-section">
                    <span class="ce-calc-eyebrow">${calcModeLabel()}</span>
                    <h4>${title}</h4>
                </div>
                <div class="ce-calc-section">
                    <strong>核心公式</strong>
                    <div class="ce-calc-formula" data-tex="${formula.replace(/"/g, "&quot;")}" data-display="block"></div>
                </div>
                <div class="ce-calc-section">
                    <strong>数值代入</strong>
                    <p>${numeric}</p>
                </div>
                <div class="ce-calc-section">
                    <strong>计算链</strong>
                    ${chain}
                </div>
                <div class="ce-calc-section is-conclusion">
                    <strong>本步结论</strong>
                    <p>${conclusion}</p>
                </div>
            </div>
        `;
    }

    function forwardCalc(node) {
        if (node.type === "conv") {
            const patch = [[0.8, 0.2, 0.0], [0.4, 0.9, 0.1], [0.0, 0.3, 0.7]];
            const kernel = makeKernel(hashText(`${node.id}-fwd-kernel`));
            const product = patch.map((row, r) => row.map((v, c) => v * kernel[r][c]));
            const bias = 0.07;
            const sum = product.flat().reduce((a, b) => a + b, 0);
            const out = sum + bias;
            return calcShell({
                kind: "is-forward",
                title: `${displayLayerName(node.layerName)} 前向计算`,
                formula: "z_{i,j,k}=\\sum_{u,v,c}x_{i+u,j+v,c}w_{u,v,c,k}+b_k",
                numeric: `patch center=${num(patch[1][1])}, kernel center=${num(kernel[1][1])}, sum=${num(sum)}, bias=${num(bias)}, output=${num(out)}。`,
                chain: `<div class="ce-calc-chain">${calcMatrix(patch, "input patch", { role: "conv-input" })}<div class="ce-calc-arrow">×</div>${calcMatrix(kernel, "kernel", { role: "conv-kernel", fixedScale: true })}${calcArrow()}${calcMatrix(product, "elementwise", { role: "conv-product" })}<div class="ce-calc-arrow ce-calc-arrow-note">sum + b</div><div class="ce-calc-result is-forward">${num(sum)} + ${num(bias)} = <b>${num(out)}</b></div></div>`,
                conclusion: "卷积层取出局部 patch，与 kernel 逐元素相乘、求和并写入输出 feature map。"
            });
        }
        if (node.type === "relu") {
            const z = [[-0.4, 0.2], [1.1, -0.1]];
            const a = z.map((row) => row.map((v) => Math.max(0, v)));
            return calcShell({
                kind: "is-forward",
                title: `${displayLayerName(node.layerName)} 前向计算`,
                formula: "A=\\max(0,Z)",
                numeric: `${num(z[0][0])} → ${num(a[0][0])}; ${num(z[1][0])} → ${num(a[1][0])}。`,
                chain: `<div class="ce-calc-chain">${calcMatrix(z, "Z", { reluMask: true, role: "conv-product" })}${calcArrow()}${calcMatrix(a, "A", { role: "conv-product" })}</div>`,
                conclusion: "ReLU 保留正响应，把负响应截断为 0。"
            });
        }
        if (node.type === "pool") {
            const region = [[0.2, 0.8], [0.4, 0.5]];
            const best = { row: 0, col: 1, value: 0.8 };
            return calcShell({
                kind: "is-forward",
                title: `${displayLayerName(node.layerName)} 前向计算`,
                formula: "P_{i,j}=\\max(R_{i,j})",
                numeric: `2×2 region 最大值位置为 (${best.row}, ${best.col}), max=${num(best.value)}。`,
                chain: `<div class="ce-calc-chain">${calcMatrix(region, "2×2 region", { poolMax: best, role: "conv-product" })}<div class="ce-calc-arrow">max</div><div class="ce-calc-result is-forward">P = <b>${num(best.value)}</b></div></div>`,
                conclusion: "MaxPool 在局部窗口中保留最大响应并降低空间尺寸。"
            });
        }
        if (node.type === "flatten") {
            const vector = [0.8, 0.5, 0.3, 0.1];
            return calcShell({
                kind: "is-forward",
                title: `${displayLayerName(node.layerName)} 展开`,
                formula: "v=reshape(P)",
                numeric: `2×2 region reshape 为 [${vector.map((v) => num(v)).join(", ")}]。`,
                chain: `<div class="ce-calc-chain">${calcMatrix([[0.8, 0.5], [0.3, 0.1]], "feature map", { role: "conv-product" })}${calcArrow()}${calcVector(vector, "flat vector")}</div>`,
                conclusion: "Flatten 只改变数据排列形状，不改变数值本身。"
            });
        }
        if (node.type === "fc") {
            const v = 0.72;
            const w = -0.31;
            const b = 0.08;
            return calcShell({
                kind: "is-forward",
                title: `${displayLayerName(node.layerName)} 加权求和`,
                formula: "y_j=\\sum_i v_iW_{i,j}+b_j",
                numeric: `v[1]=${num(v)}, W[1,j]=${num(w)}, b[j]=${num(b)}, contribution=${num(v * w)}。`,
                chain: `<div class="ce-calc-chain"><div class="ce-calc-result is-forward">v[i]<br><b>${num(v)}</b></div><div class="ce-calc-arrow">×</div><div class="ce-calc-result">W[i,j]<br><b>${num(w)}</b></div><div class="ce-calc-arrow">+ b</div><div class="ce-calc-result is-forward">logit contribution<br><b>${num(v * w + b)}</b></div></div>`,
                conclusion: "FC 对输入向量做加权求和，得到每个类别的 logit。"
            });
        }
        if (node.type === "output") {
            const outputNodes = state.cnn[state.cnn.length - 1] || [];
            const outputs = outputNodes.map((item, index) => ({
                label: item.label || classNames[index] || String(index),
                prob: Number(item.output || 0) * 100
            }));
            const top = outputs.reduce((a, b) => (a.prob > b.prob ? a : b), outputs[0] || { label: "-", prob: 0 });
            const p = top.prob / 100;
            return calcShell({
                kind: "is-forward",
                title: "Softmax / output 前向计算",
                formula: "p_i=\\frac{e^{z_i}}{\\sum_j e^{z_j}},\\quad L=-\\log p_y",
                numeric: `预测类别 ${top.label}, p=${num(p, 3)}, loss=-log(${num(p, 3)})=${num(-Math.log(Math.max(p, 1e-6)))}。`,
                chain: `<div class="ce-calc-chain">${calcVector(outputs.map((item) => item.prob / 100), "probabilities")}${calcArrow()}<div class="ce-calc-result is-forward">prediction<br><b>${top.label}</b></div></div>`,
                conclusion: "Softmax 将 logits 归一化为概率，交叉熵衡量预测与标签的差距。"
            });
        }
        return calcShell({
            kind: "is-forward",
            title: `${displayLayerName(node.layerName)} 前向计算`,
            formula: layerDefFor(node).formula,
            numeric: "当前层根据自身规则把输入转换为输出。",
            chain: `<div class="ce-calc-chain"><div class="ce-calc-result">input</div>${calcArrow()}<div class="ce-calc-result is-forward">output</div></div>`,
            conclusion: "该层完成一次前向数据变换。"
        });
    }

    function backwardCalc(node) {
        if (node.type === "output") {
            const label = Number.isFinite(state.gradReplay.targetLabel)
                ? Number(state.gradReplay.targetLabel)
                : state.usingRealModel && state.digitPrediction !== null ? Number(state.digitPrediction) : 3;
            const outputNodes = state.cnn[state.cnn.length - 1] || [];
            const probs = outputNodes.length
                ? outputNodes.map((item) => Number(item.output || 0))
                : [0.02, 0.01, 0.05, 0.82, 0.02, 0.03, 0.01, 0.01, 0.02, 0.01];
            const safeLabel = Math.max(0, Math.min(probs.length - 1, Number.isFinite(label) ? label : 3));
            const grad = state.gradReplay.dlogits.length === probs.length
                ? state.gradReplay.dlogits
                : probs.map((p, i) => p - (i === safeLabel ? 1 : 0));
            return calcShell({
                kind: "is-backward",
                title: "Softmax + CE 反向",
                formula: "dlogits=p-onehot(y)",
                numeric: `label=${safeLabel}, dlogits[label]=${num(grad[safeLabel])}，真实类别梯度为负，表示需要提高该类 logit。`,
                chain: `<div class="ce-calc-chain">${calcVector(probs, "probs")}<div class="ce-calc-arrow">-</div>${calcVector(probs.map((_, i) => (i === safeLabel ? 1 : 0)), "onehot")}${calcArrow()}${calcVector(grad, "dlogits", { gradient: true })}</div>`,
                conclusion: "Softmax 与交叉熵组合后，logits 梯度简化为概率减去真实 one-hot 标签。"
            });
        }
        if (node.type === "fc") {
            const v = 0.64;
            const dy = -0.28;
            const w = 0.22;
            const dW = v * dy;
            const dInput = dy * w;
            const isFirstFc = String(node.layerName || "").toLowerCase().includes("relu") || String(node.layerName || "").toLowerCase().includes("fc_1");
            return calcShell({
                kind: "is-backward",
                title: `${displayLayerName(node.layerName)} 反向传播`,
                formula: isFirstFc ? "dW_1=flat\\cdot dZ_{fc1},\\quad db_1=dZ_{fc1},\\quad dflat=dZ_{fc1}W_1^T" : "dW_2=h\\cdot dlogits,\\quad db_2=dlogits,\\quad dh=dlogits W_2^T",
                numeric: `input[i]=${num(v)}, upstream dy[j]=${num(dy)}, W[i,j]=${num(w)}。`,
                chain: `<div class="ce-calc-branches">
                    <div class="ce-calc-branch"><span>dW</span><div class="ce-calc-chain"><div class="ce-calc-result">input[i]<br><b>${num(v)}</b></div><div class="ce-calc-arrow">×</div><div class="ce-calc-result is-grad">dy[j]<br><b>${num(dy)}</b></div>${calcArrow()}<div class="ce-calc-result is-grad">dW[i,j]<br><b>${num(dW)}</b></div></div></div>
                    <div class="ce-calc-branch"><span>db</span><div class="ce-calc-chain"><div class="ce-calc-result is-grad">dy[j]<br><b>${num(dy)}</b></div>${calcArrow()}<div class="ce-calc-result is-grad">db[j]<br><b>${num(dy)}</b></div></div></div>
                    <div class="ce-calc-branch"><span>${isFirstFc ? "dflat" : "dh"}</span><div class="ce-calc-chain"><div class="ce-calc-result is-grad">dy[j]<br><b>${num(dy)}</b></div><div class="ce-calc-arrow ce-calc-arrow-note">× W<sup>T</sup></div><div class="ce-calc-result">W[i,j]<br><b>${num(w)}</b></div>${calcArrow()}<div class="ce-calc-result is-grad">${isFirstFc ? "dflat[i]" : "dh[i]"}<br><b>${num(dInput)}</b></div></div></div>
                </div>`,
                conclusion: "FC 反向同时得到权重梯度、bias 梯度，并把梯度传回上一层向量。"
            });
        }
        if (node.type === "flatten") {
            const dflat = [0.12, -0.08, 0.05, 0.20];
            return calcShell({
                kind: "is-backward",
                title: "Flatten 反向 reshape",
                formula: "dP=reshape(dflat)",
                numeric: "dflat=[0.12,-0.08,0.05,0.20] reshape 回 2×2。",
                chain: `<div class="ce-calc-chain">${calcVector(dflat, "dflat", { gradient: true })}${calcArrow()}${calcMatrix([[0.12, -0.08], [0.05, 0.20]], "dPool", { role: "conv-product" })}</div>`,
                conclusion: "Flatten 反向不改变梯度数值，只把一维梯度恢复成池化输出的形状。"
            });
        }
        if (node.type === "pool") {
            const region = [[0.2, 0.9], [0.4, 0.1]];
            const dp = 0.36;
            const routed = [[0, dp], [0, 0]];
            const best = { row: 0, col: 1, value: 0.9 };
            return calcShell({
                kind: "is-backward",
                title: `${displayLayerName(node.layerName)} 反向梯度路由`,
                formula: "dA_{argmax}=dP,\\quad dA_{others}=0",
                numeric: `前向最大值 ${num(best.value)} 接收上游梯度 dP=${num(dp)}，其它位置置为 0。`,
                chain: `<div class="ce-calc-chain">${calcMatrix(region, "forward region", { poolMax: best, role: "conv-product" })}<div class="ce-calc-arrow ce-calc-arrow-note">route dP</div><div class="ce-calc-result is-grad">dP<br><b>${num(dp)}</b></div>${calcArrow()}${calcMatrix(routed, "dA", { poolMax: best, role: "conv-product" })}</div>`,
                conclusion: "MaxPool 反向只把梯度传给前向最大值所在位置，其余位置梯度为 0。"
            });
        }
        if (node.type === "relu") {
            const z = [[-0.4, 0.2], [1.1, -0.1]];
            const da = [[0.5, 0.3], [-0.1, 0.2]];
            const mask = z.map((row) => row.map((v) => (v > 0 ? 1 : 0)));
            const dz = da.map((row, r) => row.map((v, c) => v * mask[r][c]));
            return calcShell({
                kind: "is-backward",
                title: `${displayLayerName(node.layerName)} mask 阻断`,
                formula: "mask=1(Z>0),\\quad dZ=dA\\odot mask",
                numeric: "Z≤0 的位置 mask=0，因此即使 dA 有值也会被阻断。",
                chain: `<div class="ce-calc-chain">${calcMatrix(z, "Z", { reluMask: true, role: "conv-product" })}<div class="ce-calc-arrow">→</div>${calcMatrix(mask, "mask", { role: "conv-product" })}<div class="ce-calc-arrow">×</div>${calcMatrix(da, "dA", { role: "conv-product" })}<div class="ce-calc-arrow">=</div>${calcMatrix(dz, "dZ", { reluMask: true, role: "conv-product" })}</div>`,
                conclusion: "ReLU 只允许正响应位置通过梯度，负响应位置梯度为 0。"
            });
        }
        if (node.type === "conv") {
            const patch = [[0.7, 0.2, 0.0], [0.1, 0.9, 0.3], [0.0, 0.4, 0.8]];
            const kernel = makeKernel(hashText(`${node.id}-back-kernel`));
            const dz = 0.42;
            const dK = patch.map((row) => row.map((v) => v * dz));
            const dKPrev = [[0.06, -0.03, 0.02], [0.01, 0.04, -0.02], [0.00, 0.03, 0.05]];
            const dKTotal = dKPrev.map((row, r) => row.map((value, c) => value + dK[r][c]));
            const dX = kernel.map((row) => row.map((v) => v * dz));
            return calcShell({
                kind: "is-backward",
                title: `${displayLayerName(node.layerName)} 反向卷积`,
                formula: "dK_{u,v,c,k}=\\sum_{i,j}X_{i+u,j+v,c}dZ_{i,j,k},\\quad db_k=\\sum_{i,j}dZ_{i,j,k},\\quad dX_{patch}{+}=K\\,dZ",
                numeric: `当前 dZ[i,j,k]=${num(dz)} 只产生一个 contribution；最终 dK 必须累加所有输出位置的 contribution。db contribution=${num(dz)}。`,
                chain: `<div class="ce-calc-branches is-conv-backward">
                    <div class="ce-calc-branch"><span>dK accumulation</span><div class="ce-calc-chain"><div class="ce-calc-result is-grad">dZ[i,j,k]<br><b>${num(dz)}</b></div><div class="ce-calc-arrow">&times;</div>${calcMatrix(patch, "input patch(i,j)", { role: "conv-product" })}${calcArrow()}${calcMatrix(dK, "current contribution", { role: "conv-product" })}<div class="ce-calc-arrow">+</div>${calcMatrix(dKPrev, "previous dK sum", { role: "conv-product" })}<div class="ce-calc-arrow">=</div>${calcMatrix(dKTotal, "accumulated dK", { role: "conv-product" })}</div><p class="ce-calc-note">卷积核梯度不是一次 patch 得到的，而是所有输出位置贡献累加：dK = Σ input_patch(i,j) × dZ(i,j)。</p></div>
                    <div class="ce-calc-branch"><span>db contribution</span><div class="ce-calc-chain"><div class="ce-calc-result is-grad">dZ[i,j,k]<br><b>${num(dz)}</b></div>${calcArrow()}<div class="ce-calc-result is-grad">db += dZ<br><b>${num(dz)}</b></div></div></div>
                    <div class="ce-calc-branch"><span>dX patch contribution</span><div class="ce-calc-chain"><div class="ce-calc-result is-grad">dZ[i,j,k]<br><b>${num(dz)}</b></div><div class="ce-calc-arrow">&times;</div>${calcMatrix(kernel, "kernel slice", { role: "conv-kernel", fixedScale: true })}${calcArrow()}${calcMatrix(dX, "dX_patch += K × dZ", { role: "conv-product" })}</div></div>
                </div>`,
                conclusion: "Conv 反向同时累加卷积核梯度、bias 梯度，并把梯度分配回输入 patch。"
            });
        }
        return calcShell({
            kind: "is-backward",
            title: `${displayLayerName(node.layerName)} 反向传播`,
            formula: "dX=\\frac{\\partial L}{\\partial X}",
            numeric: "该层主要负责传递上游梯度。",
            chain: `<div class="ce-calc-chain"><div class="ce-calc-result is-grad">upstream gradient</div>${calcArrow()}<div class="ce-calc-result">local rule</div>${calcArrow()}<div class="ce-calc-result is-grad">downstream gradient</div></div>`,
            conclusion: "点击 Conv、ReLU、Pool、Flatten、FC、Softmax 可查看更具体的梯度链。"
        });
    }

    function updateCalc(node) {
        if (!learnableLayer(node)) {
            return calcShell({
                kind: "is-update",
                title: `${displayLayerName(node.layerName)} 无可学习参数`,
                formula: "\\theta_{new}=\\theta_{old}-lr\\cdot d\\theta",
                numeric: "ReLU、Pool、Flatten、Softmax 本身没有需要学习的 weight / bias。",
                chain: `<div class="ce-calc-chain"><div class="ce-calc-result">无 W / K</div>${calcArrow()}<div class="ce-calc-result">无 bias</div>${calcArrow()}<div class="ce-calc-result is-update">不参与参数更新</div></div>`,
                conclusion: "只有 Conv 和 FC 层的权重、bias 会在优化步骤中被更新。"
            });
        }
        const oldValue = node.type === "conv" ? 0.20 : -0.18;
        const grad = node.type === "conv" ? 0.37 : -0.24;
        const lr = 0.1;
        const next = oldValue - lr * grad;
        const biasOld = 0.06;
        const db = node.type === "conv" ? 0.42 : -0.28;
        const biasNext = biasOld - lr * db;
        const oldMatrix = node.type === "conv" ? [[0.20, -0.12], [0.05, 0.18]] : [[-0.18, 0.22], [0.11, -0.05]];
        const gradMatrix = node.type === "conv" ? [[0.37, -0.16], [0.08, 0.24]] : [[-0.24, 0.18], [0.05, -0.09]];
        const newMatrix = oldMatrix.map((row, r) => row.map((value, c) => value - lr * gradMatrix[r][c]));
        const lossOld = 0.82;
        const lossNew = 0.68;
        return calcShell({
            kind: "is-update",
            title: `${displayLayerName(node.layerName)} 参数更新`,
            formula: "\\theta_{new}=\\theta_{old}-lr\\cdot d\\theta",
            numeric: `${node.type === "conv" ? "K" : "W"}: ${num(oldValue)} - ${lr}×${num(grad)} = ${num(next)}；bias: ${num(biasOld)} - ${lr}×${num(db)} = ${num(biasNext)}。`,
            chain: `<div class="ce-calc-branches is-update-chain">
                <div class="ce-calc-branch"><span>${node.type === "conv" ? "kernel K" : "weight W"} 更新</span><div class="ce-calc-chain">${calcMatrix(oldMatrix, "old parameter", { role: "conv-product" })}<div class="ce-calc-arrow ce-calc-arrow-note">- lr ×</div>${calcMatrix(gradMatrix, "gradient", { role: "conv-product" })}<div class="ce-calc-arrow">=</div>${calcMatrix(newMatrix, "new parameter", { role: "conv-product" })}</div></div>
                <div class="ce-calc-branch"><span>bias 更新</span><div class="ce-calc-chain"><div class="ce-calc-result is-update-old">old b<br><b>${num(biasOld)}</b></div><div class="ce-calc-arrow ce-calc-arrow-note">- ${lr} ×</div><div class="ce-calc-result is-update-grad">db<br><b>${num(db)}</b></div><div class="ce-calc-arrow">=</div><div class="ce-calc-result is-update">new b<br><b>${num(biasNext)}</b></div></div></div>
                <div class="ce-calc-branch"><span>优化目标：降低 loss</span><div class="ce-calc-chain"><div class="ce-calc-result is-update-old">old loss<br><b>${num(lossOld)}</b></div><div class="ce-calc-arrow ce-calc-arrow-note">沿负梯度方向<br><span>-∇L</span></div><div class="ce-calc-result is-update">new loss<br><b>${num(lossNew)}</b></div></div><p class="ce-calc-note">参数更新的目标不是单纯改变参数数值，而是让下一次前向传播预测更接近标签，从而降低交叉熵 loss。</p></div>
            </div>`,
            conclusion: "Conv/FC 参数沿负梯度方向更新，目标是让后续前向传播的 loss 下降。"
        });
    }

    function calculationDetail(node) {
        if (state.calcMode === "backward") return backwardCalc(node);
        if (state.calcMode === "update") return updateCalc(node);
        return forwardCalc(node);
    }

    function showDetailOverlay(node) {
        els.overlay.hidden = false;
        els.overlay.innerHTML = `
            <button class="ce-detail-close" type="button" aria-label="关闭">×</button>
            <h3>${displayLayerName(node.layerName)} · ${calcModeLabel()}</h3>
            ${calculationDetail(node)}
        `;
        renderLatexInElement(els.overlay);
        bindDigitSurfaces();
        els.overlay.querySelector(".ce-detail-close").addEventListener("click", () => {
            state.detailed = false;
            state.intermediate = null;
            els.detailToggle.classList.remove("active");
            els.detailToggle.textContent = "显示细节";
            els.overlay.hidden = true;
            renderNetwork();
        });
        return;
        const layer = layerDefFor(node);
        let body = "";
        if (node.type === "conv") {
            body = convDetail(node);
        } else if (node.type === "relu") {
            body = reluDetail(node);
        } else if (node.type === "pool") {
            body = poolDetail(node);
        } else if (node.type === "output") {
            body = softmaxDetail();
        } else if (node.type === "fc") {
            body = fcDetail(node);
        } else {
            body = inputDetail(node);
        }
        els.overlay.innerHTML = `
            <button class="ce-detail-close" type="button" aria-label="关闭">×</button>
            <h3>${displayLayerName(node.layerName)}</h3>
            ${body}
        `;
        renderLatexInElement(els.overlay);
        bindDigitSurfaces();
        els.overlay.querySelector(".ce-detail-close").addEventListener("click", () => {
            state.detailed = false;
            state.intermediate = null;
            els.detailToggle.classList.remove("active");
            els.detailToggle.textContent = "显示细节";
            els.overlay.hidden = true;
            renderNetwork();
        });
        const softmaxButton = els.overlay.querySelector("[data-softmax-play]");
        if (softmaxButton) {
            softmaxButton.addEventListener("click", playSoftmaxAnimation);
        }
        els.overlay.querySelectorAll("[data-grad-target]").forEach((target) => {
            target.addEventListener("click", (event) => {
                event.stopPropagation();
                startGradientReplay(Number(target.dataset.gradTarget));
            });
        });
    }

    function playSoftmaxAnimation() {
        const container = els.overlay && !els.overlay.hidden ? els.overlay : els.principleContent;
        const rows = Array.from(container.querySelectorAll("[data-softmax-row]"));
        const calcRows = Array.from(container.querySelectorAll("[data-softmax-calc-row]"));
        const mainText = container.querySelector("[data-softmax-main]");
        rows.forEach((row) => row.classList.remove("is-animating"));
        calcRows.forEach((row) => row.classList.remove("is-animating"));
        rows.forEach((row, index) => {
            window.setTimeout(() => {
                rows.forEach((item) => item.classList.remove("is-animating"));
                calcRows.forEach((item) => item.classList.remove("is-animating"));
                row.classList.add("is-animating");
                calcRows[index]?.classList.add("is-animating");
                if (mainText && calcRows[index]) {
                    const cells = calcRows[index].querySelectorAll("span");
                    mainText.textContent = `${cells[0].textContent}: exp(${cells[1].textContent} - max) / Σexp = ${cells[3].textContent}`;
                }
            }, index * 180);
        });
        window.setTimeout(() => {
            rows.forEach((row) => row.classList.remove("is-animating"));
            calcRows.forEach((row) => row.classList.remove("is-animating"));
        }, rows.length * 180 + 700);
    }

    function clearDemoHighlights(container) {
        if (!container) {
            return;
        }
        container.querySelectorAll(".is-demo-hot, .is-demo-kernel, .is-demo-output, .is-demo-off, .is-grad-hot, .is-grad-off, .is-update-old, .is-update-grad, .is-update-new").forEach((cell) => {
            cell.classList.remove("is-demo-hot", "is-demo-kernel", "is-demo-output", "is-demo-off", "is-grad-hot", "is-grad-off", "is-update-old", "is-update-grad", "is-update-new");
        });
    }

    function cellsForMatrix(matrixEl) {
        return Array.from(matrixEl ? matrixEl.querySelectorAll(".ce-mini-cell") : []);
    }

    function highlightWindow(matrixEl, top, left, size, className) {
        const cells = cellsForMatrix(matrixEl);
        cells.forEach((cell) => {
            const row = Number(cell.dataset.cellRow);
            const col = Number(cell.dataset.cellCol);
            if (row >= top && row < top + size && col >= left && col < left + size) {
                cell.classList.add(className);
            }
        });
    }

    function highlightCell(matrixEl, row, col, className) {
        const cell = matrixEl && matrixEl.querySelector(`[data-cell-row="${row}"][data-cell-col="${col}"]`);
        if (cell) {
            cell.classList.add(className);
        }
    }

    function matrixRowCount(matrixEl) {
        const rows = cellsForMatrix(matrixEl).map((cell) => Number(cell.dataset.cellRow));
        return rows.length ? Math.max(...rows) + 1 : 0;
    }

    function matrixColCount(matrixEl) {
        const cols = cellsForMatrix(matrixEl).map((cell) => Number(cell.dataset.cellCol));
        return cols.length ? Math.max(...cols) + 1 : 0;
    }

    function allWindowPositions(matrixEl, windowSize) {
        const rowCount = matrixRowCount(matrixEl);
        const colCount = matrixColCount(matrixEl);
        const maxRow = Math.max(0, rowCount - windowSize);
        const maxCol = Math.max(0, colCount - windowSize);
        const positions = [];
        for (let row = 0; row <= maxRow; row += 1) {
            for (let col = 0; col <= maxCol; col += 1) {
                positions.push([row, col]);
            }
        }
        return positions;
    }

    function playConvWindowAnimation() {
        const node = state.intermediate || activeNode();
        if (!node) {
            return;
        }
        const prevLayer = state.coords[Math.max(0, node.layerIndex - 1)] || state.coords[0];
        const prevNode = prevLayer[node.index % Math.max(1, prevLayer.length)] || prevLayer[0] || node;
        const inputForKernel = inputPatchSourceForConv(node, prevNode);
        const kernel = makeKernel(hashText(`${node.id}-0`));
        const inputMatrix = els.principleContent.querySelector('[data-matrix-role="conv-input"]');
        const kernelMatrices = Array.from(els.principleContent.querySelectorAll('[data-matrix-role="conv-kernel"]'));
        const productMatrix = els.principleContent.querySelector('[data-matrix-role="conv-product"]');
        const outputMatrix = els.principleContent.querySelector('[data-matrix-role="conv-output"]');
        const positions = allWindowPositions(inputMatrix, 3);
        clearDemoHighlights(els.principleContent);
        positions.forEach(([top, left], index) => {
            window.setTimeout(() => {
                clearDemoHighlights(els.principleContent);
                highlightWindow(inputMatrix, top, left, 3, "is-demo-hot");
                kernelMatrices.forEach((matrixEl) => highlightWindow(matrixEl, 0, 0, 3, "is-demo-kernel"));
                const patch = matrixWindow(inputForKernel.output, top, left, 3);
                const product = multiplyMatrices(patch, kernel);
                updateMatrixElement(productMatrix, product, { type: "conv", output: product }, { role: "conv-product", node });
                highlightCell(outputMatrix, Math.min(top, matrixRowCount(outputMatrix) - 1), Math.min(left, matrixColCount(outputMatrix) - 1), "is-demo-output");
            }, index * 70);
        });
        window.setTimeout(() => clearDemoHighlights(els.principleContent), positions.length * 70 + 700);
    }

    function playPoolWindowAnimation() {
        const inputMatrix = els.principleContent.querySelector('[data-matrix-role="pool-input"]');
        const outputMatrix = els.principleContent.querySelector('[data-matrix-role="pool-output"]');
        const positions = poolingWindowPositions(inputMatrix, 2);
        clearDemoHighlights(els.principleContent);
        positions.forEach(([top, left], index) => {
            window.setTimeout(() => {
                clearDemoHighlights(els.principleContent);
                highlightWindow(inputMatrix, top, left, 2, "is-demo-hot");
                highlightCell(outputMatrix, Math.min(Math.floor(top / 2), matrixRowCount(outputMatrix) - 1), Math.min(Math.floor(left / 2), matrixColCount(outputMatrix) - 1), "is-demo-output");
            }, index * 90);
        });
        window.setTimeout(() => clearDemoHighlights(els.principleContent), positions.length * 90 + 700);
    }

    function poolingWindowPositions(matrixEl, windowSize) {
        const rowCount = matrixRowCount(matrixEl);
        const colCount = matrixColCount(matrixEl);
        const positions = [];
        for (let row = 0; row <= rowCount - windowSize; row += windowSize) {
            for (let col = 0; col <= colCount - windowSize; col += windowSize) {
                positions.push([row, col]);
            }
        }
        return positions.length ? positions : [[0, 0]];
    }

    function playReluMaskAnimation() {
        const inputMatrix = els.principleContent.querySelector('[data-matrix-role="relu-input"]');
        const outputMatrix = els.principleContent.querySelector('[data-matrix-role="relu-output"]');
        clearDemoHighlights(els.principleContent);
        cellsForMatrix(inputMatrix).forEach((cell, index) => {
            window.setTimeout(() => {
                const numeric = Number(cell.dataset.cellValue);
                cell.classList.add(numeric <= 0 ? "is-demo-off" : "is-demo-hot");
                const outCell = outputMatrix && outputMatrix.querySelector(`[data-cell-row="${cell.dataset.cellRow}"][data-cell-col="${cell.dataset.cellCol}"]`);
                if (outCell) {
                    outCell.classList.add(numeric <= 0 ? "is-demo-off" : "is-demo-output");
                }
            }, index * 45);
        });
        window.setTimeout(() => clearDemoHighlights(els.principleContent), cellsForMatrix(inputMatrix).length * 45 + 1400);
    }

    function playCalcFlowAnimation(className = "is-grad-hot") {
        clearDemoHighlights(els.principleContent);
        const parts = Array.from(els.principleContent.querySelectorAll(".ce-calc-result, .ce-calc-branch, .ce-vector-chip, .ce-grad-token, .ce-mini-cell, .ce-fc-links line, .ce-softmax-row, .ce-softmax-calc-row"));
        parts.forEach((part, index) => {
            window.setTimeout(() => {
                part.classList.add(className);
            }, index * 80);
        });
        window.setTimeout(() => clearDemoHighlights(els.principleContent), parts.length * 80 + 900);
    }

    function playBackwardProbe(node) {
        clearDemoHighlights(els.principleContent);
        if (node.type === "relu") {
            const cells = Array.from(els.principleContent.querySelectorAll(".ce-mini-cell"));
            cells.forEach((cell, index) => {
                window.setTimeout(() => {
                    const value = Number(cell.dataset.cellValue);
                    cell.classList.add(cell.classList.contains("ce-relu-off") || value <= 0 ? "is-grad-off" : "is-grad-hot");
                }, index * 55);
            });
            window.setTimeout(() => clearDemoHighlights(els.principleContent), cells.length * 55 + 1000);
            return;
        }
        if (node.type === "pool") {
            const cells = Array.from(els.principleContent.querySelectorAll(".ce-mini-cell"));
            cells.forEach((cell, index) => {
                window.setTimeout(() => {
                    cell.classList.add(cell.classList.contains("ce-pool-mark") ? "is-grad-hot" : "is-grad-off");
                }, index * 70);
            });
            window.setTimeout(() => clearDemoHighlights(els.principleContent), cells.length * 70 + 1000);
            return;
        }
        if (node.type === "conv") {
            const chips = Array.from(els.principleContent.querySelectorAll(".ce-calc-branch, .ce-calc-chip, .ce-calc-result"));
            chips.forEach((chip, index) => {
                window.setTimeout(() => {
                    chip.classList.add("is-grad-hot");
                    chip.querySelectorAll(".ce-mini-cell").forEach((cell) => cell.classList.add("is-grad-hot"));
                }, index * 180);
            });
            window.setTimeout(() => clearDemoHighlights(els.principleContent), chips.length * 180 + 1000);
            return;
        }
        playCalcFlowAnimation("is-grad-hot");
    }

    function playUpdateProbe(node) {
        clearDemoHighlights(els.principleContent);
        if (!learnableLayer(node)) {
            playCalcFlowAnimation("is-grad-off");
            return;
        }
        const results = Array.from(els.principleContent.querySelectorAll(".ce-calc-chip, .ce-calc-result"));
        results.forEach((item, index) => {
            window.setTimeout(() => {
                if (index % 3 === 0) {
                    item.classList.add("is-update-old");
                } else if (index % 3 === 1) {
                    item.classList.add("is-update-grad");
                } else {
                    item.classList.add("is-update-new");
                }
            }, index * 180);
        });
        window.setTimeout(() => clearDemoHighlights(els.principleContent), results.length * 180 + 1200);
    }

    function inputDetail(node) {
        if (state.modelMode === "digit") {
            return `
                <div class="ce-detail-grid is-wide">
                    <div class="ce-detail-panel">
                        <div class="ce-detail-label">手写数字输入 <span>28 × 28 × 1</span></div>
                        <div class="ce-input-preview-frame is-large is-digit-input-card">
                            <canvas class="ce-input-preview ce-digit-detail-canvas ce-digit-draw-surface" width="280" height="280" aria-label="手写数字输入"></canvas>
                            <div class="ce-digit-inline-actions">
                                <button type="button" data-ce-clear-digit>清空</button>
                            </div>
                        </div>
                        <p class="ce-detail-caption">可以直接在此绘制手写数字，松开后自动更新模型。</p>
                    </div>
                    <div class="ce-detail-panel">
                        <div class="ce-detail-label">输入张量<span>28×28</span></div>
                        ${detailMatrix(node, "28 × 28 灰度张量", 14)}
                        <p class="ce-detail-caption">MNIST 0~1 归一化后的 CNN 输入。</p>
                    </div>
                </div>
            `;
        }
        const channels = state.cnn[0];
        return `
            <div class="ce-detail-grid is-wide">
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">RGB channel slices <span>sampled from current image</span></div>
                    <div class="ce-kernel-row">
                        ${channels.map((channel, i) => detailMatrix(channel, ["Red", "Green", "Blue"][i], 5)).join("")}
                    </div>
                    <p class="ce-detail-caption">CNN Explainer 的输入示例。</p>
                </div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">当前通道<span>${displayLayerName(node.layerName)} #${node.index + 1}</span></div>
                    ${detailMatrix(node, "当前通道", 8)}
                </div>
            </div>
        `;
    }

    function convDetail(node) {
        const prevLayer = state.coords[Math.max(0, node.layerIndex - 1)] || state.coords[0];
        const kernels = [0, 1, 2].map((i) => makeKernel(hashText(`${node.id}-${i}`)));
        return `
            <div class="ce-detail-grid">
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">上一层特征图 <span>${prevLayer.length} 张输入图</span></div>
                    <div class="ce-kernel-row">
                        ${prevLayer.slice(0, 3).map((item, i) => detailMatrix(item, `Input ${i + 1}`, 4)).join("")}
                    </div>
                </div>
                <div class="ce-detail-symbol">×</div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">已学习卷积核 <span>3 × 3</span></div>
                    <div class="ce-kernel-row">
                        ${kernels.map((kernel, i) => plainMatrix(kernel, `K${i + 1}`, 3)).join("")}
                    </div>
                </div>
                <div class="ce-detail-symbol">+</div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">激活图 <span>求和 + 偏置</span></div>
                    ${detailMatrix(node, "卷积输出", 5)}
                    <p class="ce-detail-caption">kernel 与 feature map 做卷积，再加上 bias。</p>
                </div>
            </div>
        `;
    }

    function reluDetail(node) {
        const prev = state.coords[node.layerIndex - 1]?.[node.index] || node;
        return `
            <div class="ce-detail-grid">
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Input activation <span>before ReLU</span></div>
                    ${detailMatrix(prev, "Z", 6)}
                </div>
                <div class="ce-detail-symbol">→</div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">ReLU function <span>max(0, x)</span></div>
                    ${reluGraph()}
                    <p class="ce-detail-caption">小于 0 的响应被截断为 0，正响应保持不变。</p>
                </div>
                <div class="ce-detail-symbol">→</div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">输出激活<span>A</span></div>
                    ${detailMatrix(node, "A", 6)}
                </div>
            </div>
        `;
    }

    function poolDetail(node) {
        const prev = state.coords[node.layerIndex - 1]?.[node.index] || node;
        const prevMatrix = Array.isArray(prev.output) ? prev.output : [[prev.output]];
        const inputSampleSize = Math.max(2, Math.min(8, prevMatrix.length));
        const evenInputSampleSize = inputSampleSize % 2 === 0 ? inputSampleSize : inputSampleSize - 1;
        const outputSampleSize = Math.max(1, Math.floor(evenInputSampleSize / 2));
        return `
            <div class="ce-detail-grid">
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Input region <span>2 × 2 windows</span></div>
                    ${detailMatrix(prev, "激活图", evenInputSampleSize)}
                    <p class="ce-detail-caption">按 2×2 窗口取最大值。</p>
                </div>
                <div class="ce-detail-symbol">max</div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Pooling rule <span>keep strongest response</span></div>
                    <p class="ce-detail-caption">MaxPool 保留局部最强响应并完成下采样。</p>
                </div>
                <div class="ce-detail-symbol">→</div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Pooled map <span>downsampled</span></div>
                    ${detailMatrix(node, "Pool output", outputSampleSize)}
                </div>
            </div>
        `;
    }

    function fcDetail(node) {
        const prevLayer = state.coords[node.layerIndex - 1] || [];
        return `
            <div class="ce-detail-grid is-wide">
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Flattened features <span>from previous maps</span></div>
                    <div class="ce-mini-bars">
                        ${prevLayer.slice(0, 8).map((item) => {
                            const value = averageOutput(item.output);
                            return `<div class="ce-mini-bar"><span>flat ${item.index}</span><span class="ce-mini-bar-track"><span class="ce-mini-bar-fill" style="--bar-width:${Math.round(value * 100)}%"></span></span><span>${value.toFixed(2)}</span></div>`;
                        }).join("")}
                    </div>
                </div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">FC / logits <span>weighted sum</span></div>
                    <div class="ce-mini-bars">
                        ${state.cnn[node.layerIndex].map((item) => `<div class="ce-mini-bar"><span>FC / logits ${item.index}</span><span class="ce-mini-bar-track"><span class="ce-mini-bar-fill" style="--bar-width:${Math.round(item.output * 100)}%"></span></span><span>${item.output.toFixed(2)}</span></div>`).join("")}
                    </div>
                    <p class="ce-detail-caption">这些 logits 会继续送入 Softmax 转换为概率。</p>
                </div>
            </div>
        `;
    }

    function softmaxDetail() {
        const outputs = state.cnn[state.cnn.length - 1];
        const top = [...outputs].sort((a, b) => b.output - a.output)[0];
        return `
            <div class="ce-detail-grid is-wide">
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Softmax formula <span>normalize logits</span></div>
                    <div class="ce-latex-block" data-tex="p_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}" data-display="block"></div>
                    <p class="ce-detail-caption">Softmax 将 logits 归一化为概率，总和为 1；当前最高类别为 ${top.label}。</p>
                    <button class="ce-softmax-play" type="button" data-softmax-play>播放 Softmax 动画</button>
                </div>
                <div class="ce-detail-panel">
                    <div class="ce-detail-label">Class probabilities <span>output layer</span></div>
                    <div class="ce-softmax-detail">
                        ${outputs.map((item, index) => `<div class="ce-softmax-row ${item.id === top.id ? "top" : ""}" data-softmax-row="${index}">
                            <span>${item.label}</span>
                            <span class="ce-softmax-track"><span class="ce-softmax-fill" style="--prob:${Math.round(item.output * 100)}%"></span></span>
                            <span>${(item.output * 100).toFixed(1)}%</span>
                        </div>`).join("")}
                    </div>
                </div>
            </div>
        `;
    }

    function sampleIndices(length, maxSize) {
        const count = Math.min(maxSize, length);
        if (count <= 1) {
            return [0];
        }
        if (length <= maxSize) {
            return Array.from({ length }, (_, index) => index);
        }
        return Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1)));
    }

    function focusStart(matrix, size) {
        const rows = Array.isArray(matrix) ? matrix.length : 1;
        const cols = Array.isArray(matrix?.[0]) ? matrix[0].length : 1;
        return {
            row: Math.max(0, Math.floor((rows - size) / 2)),
            col: Math.max(0, Math.floor((cols - size) / 2))
        };
    }

    function matrixWindow(matrix, startRow, startCol, size) {
        return Array.from({ length: size }, (_, r) => (
            Array.from({ length: size }, (_, c) => {
                const row = matrix[startRow + r] || [];
                return Number(row[startCol + c] || 0);
            })
        ));
    }

    function inputPatchSourceForConv(node, fallbackNode, channelOffset = 0) {
        const outputMatrix = Array.isArray(node.output) ? node.output : [[node.output]];
        const wantedRows = outputMatrix.length + 2;
        const wantedCols = outputMatrix[0].length + 2;
        const sourceMatrix = Array.isArray(fallbackNode.output) ? fallbackNode.output : [[fallbackNode.output]];
        const sampledRows = sampleIndices(sourceMatrix.length, wantedRows);
        const sampledCols = sampleIndices(sourceMatrix[0].length, wantedCols);
        return {
            ...fallbackNode,
            id: `${fallbackNode.id || "channel"}-conv-stack-${channelOffset}`,
            output: sampledRows.map((rowIndex) => sampledCols.map((colIndex) => sourceMatrix[rowIndex][colIndex])),
            actualShape: `${wantedRows}×${wantedCols}`
        };
    }

    function multiplyMatrices(a, b) {
        return a.map((row, r) => row.map((value, c) => value * (b[r]?.[c] || 0)));
    }

    function maxPosition(matrix) {
        let best = { row: 0, col: 0, value: -Infinity };
        matrix.forEach((row, r) => row.forEach((value, c) => {
            if (value > best.value) {
                best = { row: r, col: c, value };
            }
        }));
        return best;
    }

    function stackedFeatureMaps(nodes, title, options = {}) {
        const front = nodes[0];
        const depth = nodes.length;
        const ghosts = nodes.slice(1, 4).map((_, index) => `<span class="ce-stack-ghost" style="--stack-offset:${index + 1}"></span>`).join("");
        return `
            <div class="ce-stack-wrap" style="--stack-depth:${depth}">
                <div class="ce-stack-label">${title}<span>${depth} 个输入通道</span></div>
                <div class="ce-stack-canvas">
                    ${ghosts}
                    <div class="ce-stack-front">
                        ${detailMatrix(front, "前景通道", 12, { ...options, compact: true, actualShape: front.actualShape })}
                    </div>
                </div>
            </div>
        `;
    }

    function stackedKernels(kernels, title) {
        const ghosts = kernels.slice(1, 4).map((_, index) => `<span class="ce-stack-ghost is-kernel" style="--stack-offset:${index + 1}"></span>`).join("");
        return `
            <div class="ce-stack-wrap is-kernel-stack" style="--stack-depth:${kernels.length}">
                <div class="ce-stack-label">${title}<span>${kernels.length} 个通道切片</span></div>
                <div class="ce-stack-canvas is-kernel">
                    ${ghosts}
                    <div class="ce-stack-front">
                        ${plainMatrix(kernels[0], "K1", 3, { role: "conv-kernel", zoom: true, fixedScale: true })}
                    </div>
                </div>
            </div>
        `;
    }

    function matrixHtml(matrix, title, options = {}) {
        const rows = matrix || [[0]];
        const rowIndices = rows.map((_, index) => index);
        const colIndices = rows[0].map((_, index) => index);
        const node = options.node || { type: "conv", output: rows };
        return matrixCellsHtml(node, title, rows, rowIndices, colIndices, options);
    }

    function fcLinksSvg(inputCount, outputCount) {
        const inputs = Math.max(1, Math.min(12, inputCount));
        const outputs = Math.max(1, Math.min(6, outputCount));
        const inputYs = Array.from({ length: inputs }, (_, i) => 16 + i * (118 / Math.max(1, inputs - 1)));
        const outputYs = Array.from({ length: outputs }, (_, i) => 24 + i * (102 / Math.max(1, outputs - 1)));
        return `
            <svg class="ce-fc-links" viewBox="0 0 220 150" role="img" aria-label="Fully connected links">
                ${inputYs.flatMap((y1, i) => outputYs.map((y2, j) => `<line class="${i === 1 || j === 1 ? "is-hot" : ""}" x1="36" y1="${y1}" x2="184" y2="${y2}"></line>`)).join("")}
                ${inputYs.map((y) => `<circle class="ce-fc-node" cx="36" cy="${y}" r="6"></circle>`).join("")}
                ${outputYs.map((y) => `<circle class="ce-fc-node is-out" cx="184" cy="${y}" r="8"></circle>`).join("")}
            </svg>
        `;
    }

    function detailMatrix(node, title, maxSize = 5, options = {}) {
        const matrix = Array.isArray(node.output) ? node.output : [[node.output]];
        const rowIndices = sampleIndices(matrix.length, maxSize);
        const colIndices = sampleIndices(matrix[0].length, maxSize);
        const rows = rowIndices.map((rowIndex) => colIndices.map((colIndex) => matrix[rowIndex][colIndex]));
        return matrixCellsHtml(node, title, rows, rowIndices, colIndices, {
            ...options,
            actualShape: options.actualShape || `${matrix.length}×${matrix[0].length}`
        });
    }

    function matrixCellsHtml(node, title, rows, rowIndices, colIndices, options = {}) {
        const role = options.role ? ` data-matrix-role="${options.role}"` : "";
        const className = `ce-mini-matrix ${options.compact ? "is-compact" : ""} ${options.zoom ? "is-zoom" : ""}`.trim();
        return `
            <div class="ce-detail-label">${title}${options.actualShape ? `<span>真实尺寸 ${options.actualShape}</span>` : ""}</div>
            <div class="${className}" style="--cols:${colIndices.length}; margin-top:8px;"${role}>
                ${matrixCellsMarkup(node, rows, rowIndices, colIndices, options)}
            </div>
        `;
    }

    function matrixCellsMarkup(node, rows, rowIndices, colIndices, options = {}) {
        return rows.flatMap((row, r) => row.map((value, c) => {
            const actualRow = rowIndices[r];
            const actualCol = colIndices[c];
            const inMarkedWindow = options.markWindow
                && actualRow >= options.markWindow.row
                && actualRow < options.markWindow.row + options.markWindow.size
                && actualCol >= options.markWindow.col
                && actualCol < options.markWindow.col + options.markWindow.size;
            const isPoolMax = options.poolMax && options.poolMax.row === r && options.poolMax.col === c;
            
            // For kernel and products, display the value text (two decimals)
            const showValue = options.role === "conv-kernel" || options.role === "conv-product";
            const valText = showValue ? value.toFixed(2) : "";

            return `
            <span class="ce-mini-cell ${options.reluMask && value <= 0 ? "ce-relu-off" : ""} ${inMarkedWindow || isPoolMax ? "ce-pool-mark" : ""}" 
                style="--cell-bg:${matrixCellColor(node, value, actualRow, actualCol, options)}" 
                title="${value.toFixed(3)}" 
                data-cell-row="${r}" 
                data-cell-col="${c}" 
                data-actual-row="${actualRow}" 
                data-actual-col="${actualCol}" 
                data-cell-value="${value}">${valText}</span>`;
        })).join("");
    }

    function matrixDataHtml(matrix, node = { type: "conv", output: matrix }, options = {}) {
        const rows = matrix || [[0]];
        const rowIndices = rows.map((_, index) => index);
        const colIndices = rows[0].map((_, index) => index);
        return matrixCellsMarkup(node, rows, rowIndices, colIndices, options);
    }

    function updateMatrixElement(matrixEl, matrix, node, options = {}) {
        if (!matrixEl) {
            return;
        }
        const rows = matrix || [[0]];
        const rowIndices = rows.map((_, index) => index);
        const colIndices = rows[0].map((_, index) => index);
        matrixEl.style.setProperty("--cols", String(colIndices.length));
        matrixEl.innerHTML = matrixCellsMarkup(node, rows, rowIndices, colIndices, options);
    }

    function matrixCellColor(node, value, row, col, options = {}) {
        if (!options.heatmap) {
            return colorFor(node, value, row, col);
        }
        return colorFor({
            ...node,
            type: "conv",
            extent: node.extent || matrixExtent(Array.isArray(node.output) ? node.output : [[node.output]])
        }, value, row, col);
    }

    function plainMatrix(matrix, title, maxSize = 5, options = {}) {
        const node = { type: options.fixedScale ? "kernel" : "conv", output: matrix, extent: matrixExtent(matrix) };
        const rowIndices = sampleIndices(matrix.length, maxSize);
        const colIndices = sampleIndices(matrix[0].length, maxSize);
        const rows = rowIndices.map((rowIndex) => colIndices.map((colIndex) => matrix[rowIndex][colIndex]));
        return matrixCellsHtml(node, title, rows, rowIndices, colIndices, options);
    }

    function makeKernel(seed) {
        const rand = randomFrom(seed);
        return Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => {
            const sign = (r + c) % 2 === 0 ? 1 : -1;
            return sign * (0.05 + rand() * 0.35);
        }));
    }

    function averageOutput(output) {
        if (!Array.isArray(output)) {
            return Math.max(0, Math.min(1, output));
        }
        let sum = 0;
        let count = 0;
            if (Array.isArray(output[0])) {
                output.forEach((row) => row.forEach((value) => {
                    sum += Math.max(0, value);
                    count += 1;
                }));
            } else {
                output.forEach((value) => {
                    sum += Math.max(0, value);
                    count += 1;
                });
            }
        return Math.max(0.02, Math.min(1, sum / Math.max(1, count)));
    }

    function reluGraph() {
        return `
            <svg class="ce-relu-graph" viewBox="0 0 220 120" role="img" aria-label="ReLU graph">
                <path d="M15 96 L110 96 L205 20" fill="none" stroke="#3273dc" stroke-width="5" stroke-linecap="round"/>
                <text x="14" y="112" font-size="10" fill="#64748b">negative → 0</text>
                <text x="134" y="28" font-size="10" fill="#3273dc">positive kept</text>
            </svg>
        `;
    }

    function updateInteraction(node, fromHover) {
        if (!node) {
            return;
        }
        const layer = layerDefFor(node);
        const action = fromHover ? "悬停" : "选中";
        els.interactionText.textContent = `${action} ${layer.name} node ${node.index + 1}: current feature map and related links are highlighted.`;
    }

    function bindEvents() {
        els.modelSelect?.addEventListener("change", async () => {
            clearGradientReplay({ silent: true, render: false });
            applyModelMode(els.modelSelect.value);
            state.cnn = [];
            state.selected = null;
            state.hovered = null;
            state.intermediate = null;
            state.nodeImageCache.clear();
            state.globalExtentCache.clear();
            if (state.modelMode === "digit") {
                if (!state.digitHasInk) {
                    drawDigitSample();
                }
                await selectDigitFromCanvas();
            } else {
                await selectImage(state.selectedImage);
            }
        });

        els.clearGrad?.addEventListener("click", () => {
            clearGradientReplay();
        });

        els.modeSwitch?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-ce-mode]");
            if (!button) {
                return;
            }
            state.calcMode = button.dataset.ceMode || "forward";
            els.modeSwitch.querySelectorAll("[data-ce-mode]").forEach((item) => {
                item.classList.toggle("active", item === button);
            });
            root.dataset.calcMode = state.calcMode;
            state.sideTab = defaultSideTabForMode();
            if (state.selected && els.principlePanel && !els.principlePanel.hidden) {
                showPrinciplePanel(state.selected);
            }
            if (state.detailed && state.selected) {
                showDetailOverlay(state.selected);
            }
            updateSidePanel();
            updateInteraction(state.selected || state.cnn[0]?.[0], false);
        });

        els.sideTabs?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-ce-side-tab]");
            if (!button) {
                return;
            }
            state.sideTab = button.dataset.ceSideTab || "info";
            updateSidePanel();
        });

        if (els.digitCanvas) {
            const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
            const startDraw = (event) => {
                if (state.modelMode !== "digit") return;
                event.preventDefault();
                state.digitDrawing = true;
                state.digitHasInk = true;
                if (els.digitStatus) {
                    els.digitStatus.textContent = "正在书写，松开后自动更新模型";
                }
                const point = digitCanvasPoint(event);
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
            };
            const draw = (event) => {
                if (!state.digitDrawing) return;
                event.preventDefault();
                const point = digitCanvasPoint(event);
                ctx.lineTo(point.x, point.y);
                ctx.stroke();
            };
            const endDraw = () => {
                if (!state.digitDrawing) return;
                state.digitDrawing = false;
                ctx.closePath();
                scheduleDigitUpdate();
            };
            els.digitCanvas.addEventListener("mousedown", startDraw);
            els.digitCanvas.addEventListener("mousemove", draw);
            window.addEventListener("mouseup", endDraw);
            els.digitCanvas.addEventListener("touchstart", startDraw, { passive: false });
            els.digitCanvas.addEventListener("touchmove", draw, { passive: false });
            window.addEventListener("touchend", endDraw);
        }
        els.clearDigit?.addEventListener("click", () => {
            window.clearTimeout(state.digitTimer);
            resetDigitCanvas();
            syncDigitSurfaces();
            state.nodeImageCache.clear();
            els.hoverPill.textContent = "悬停特征图";
        });

        root.addEventListener("click", (event) => {
            const clearButton = event.target.closest("[data-ce-clear-digit]");
            if (!clearButton) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            window.clearTimeout(state.digitTimer);
            resetDigitCanvas();
            syncDigitSurfaces();
            state.nodeImageCache.clear();
            els.hoverPill.textContent = "手写输入已清空，重新书写后会自动更新模型";
        });

        els.detailToggle.addEventListener("click", () => {
            state.detailed = !state.detailed;
            els.detailToggle.classList.toggle("active", state.detailed);
            els.detailToggle.textContent = state.detailed ? "隐藏细节" : "显示细节";
            if (state.detailed) {
                state.intermediate = null;
                if (els.principlePanel) {
                    els.principlePanel.classList.remove("is-visible");
                    els.principlePanel.hidden = true;
                }
                if (els.principleContent) {
                    els.principleContent.innerHTML = "";
                }
            }
            renderNetwork();
            if (state.detailed) {
                showDetailOverlay(state.selected || state.cnn[0][0]);
            } else {
                els.overlay.hidden = true;
            }
        });
        els.scaleSelect.addEventListener("change", () => {
            state.selectedScale = els.scaleSelect.value;
            renderNetwork();
            updateSidePanel();
        });
        els.imageUpload.addEventListener("change", () => {
            const file = els.imageUpload.files && els.imageUpload.files[0];
            if (!file) {
                return;
            }
            const url = URL.createObjectURL(file);
            uploadedImageCount += 1;
            sourceImages.push({
                file: url,
                label: file.name || `uploaded ${uploadedImageCount}`,
                custom: true
            });
            renderImageStrip();
            selectImage(url);
            els.imageUpload.value = "";
        });
        window.addEventListener("resize", () => {
            renderNetwork();
        });
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && els.principlePanel && !els.principlePanel.hidden) {
                closePrinciplePanel();
            }
        });
    }

    function renderAll() {
        renderImageStrip();
        renderNetwork();
        updateSidePanel();
        renderLegend();
        if (state.detailed) {
            showDetailOverlay(state.selected);
        }
    }

    async function selectImage(file) {
        const token = state.renderToken + 1;
        state.renderToken = token;
        clearGradientReplay({ silent: true, render: false });
        state.selectedImage = file;
        state.hovered = null;
        state.intermediate = null;
        state.selected = null;
        state.detailed = false;
        state.cnn = [];
        state.nodeImageCache.clear();
        state.globalExtentCache.clear();
        els.detailToggle.classList.remove("active");
        els.detailToggle.textContent = "显示细节";
        els.overlay.hidden = true;
        els.hoverPill.textContent = "正在加载真实模型...";
        renderImageStrip();
        try {
            const finalCnn = await buildRealCNNProgressive(file, token, (partialCnn, message) => {
                if (token !== state.renderToken) {
                    return;
                }
                state.cnn = partialCnn;
                state.usingRealModel = true;
                state.modelError = "";
                state.selected = state.selected || state.cnn[0][0];
                renderNetwork();
                updateSidePanel();
                renderLegend();
                els.hoverPill.textContent = message;
            });
            if (token !== state.renderToken || !finalCnn) {
                return;
            }
            state.cnn = finalCnn;
            state.usingRealModel = true;
            state.modelError = "";
            state.selected = state.cnn[0][0];
        } catch (error) {
            if (token !== state.renderToken) {
                return;
            }
            console.warn("TFJS model fallback:", error);
            state.inputChannels = await loadInputChannels(file);
            state.usingRealModel = false;
            state.modelError = error.message || "模型加载失败";
            buildCNN();
        }
        if (token !== state.renderToken) {
            return;
        }
        renderAll();
        els.hoverPill.textContent = state.usingRealModel ? "真实模型已加载" : "使用模拟数据展示";
    }

    async function init() {
        applyModelMode(els.modelSelect?.value || "image");
        resetDigitCanvas();
        bindEvents();
        if (state.modelMode === "digit") {
            drawDigitSample();
            await selectDigitFromCanvas();
        } else {
            await selectImage(state.selectedImage);
        }
    }

    init();
})();
