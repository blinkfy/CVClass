(() => {
    "use strict";

    const root = document.getElementById("edgeTeedPage");
    if (!root) return;

    const assetsBase = root.dataset.assetsBase || "";
    const _bp = window.CVCLASS_BASE_PATH || "";
    const modelUrl = root.dataset.modelUrl || (_bp+"/static/assets/data/edge/teed_debug_352.onnx");
    const ortScriptUrl = root.dataset.ortScriptUrl || "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js";
    const ortWasmBase = root.dataset.ortWasmBase || (_bp+"/static/vendor/onnxruntime-web/");
    const inputSize = 352;
    const refineStride = 176;
    const refineMaxLongSide = 1408;
    const refineGlobalWeight = 0.35;
    const refineTileWeight = 0.65;
    const refineAuxUpdateEvery = 3;
    const teedBgrMean = [104.00699, 116.66877, 122.67892];
    const samples = [
        { file: "cameraman.png", label: "Cameraman" },
        { file: "house.png", label: "House" },
        { file: "lena_color_512.png", label: "Lena" },
        { file: "mandril_color.png", label: "Mandrill" },
        { file: "peppers_color.png", label: "Peppers" }
    ];

    const resultItems = [
        { key: "original", title: "Original", group: "original", desc: "原始输入图像，用于和深度模型输出对比。" },
        { key: "stage1_feature", title: "Stage1 Feature", group: "stage", desc: "浅层特征响应，通常保留更多纹理与细节。" },
        { key: "stage2_feature", title: "Stage2 Feature", group: "stage", desc: "中层特征响应，开始形成局部结构。" },
        { key: "stage3_feature", title: "Stage3 Feature", group: "stage", desc: "深层特征响应，更强调整体轮廓。" },
        { key: "side1", title: "Side1", group: "side", desc: "浅层边缘预测，细节多，可能噪声较多。" },
        { key: "side2", title: "Side2", group: "side", desc: "中层边缘预测，结构性增强。" },
        { key: "side3", title: "Side3", group: "side", desc: "深层边缘预测，轮廓更概括。" },
        { key: "fuse", title: "Fusion / Final Edge", group: "fusion", desc: "融合多个 side output，得到最终边缘预测图。" }
    ];
    const flowKeys = resultItems.map((item) => item.key);
    const formulaTokens = {
        original: ["fprev"],
        stage1_feature: ["f1", "conv", "fprev"],
        stage2_feature: ["f1", "conv", "fprev"],
        stage3_feature: ["f1", "conv", "fprev"],
        side1: ["s1", "conv"],
        side2: ["s2", "conv"],
        side3: ["s3", "conv"],
        fuse: ["final", "w1", "w2", "w3", "s1", "s2", "s3"]
    };
    const flowMotionKeys = {
        original: { main: true },
        stage1_feature: { main: true, branch: "stage1" },
        stage2_feature: { main: true, branch: "stage2" },
        stage3_feature: { main: true, branch: "stage3" },
        side1: { side: "side1", branch: "stage1" },
        side2: { side: "side2", branch: "stage2" },
        side3: { side: "side3", branch: "stage3" },
        fuse: { fuse: true, side: ["side1", "side2", "side3"] }
    };
    const flowLineStages = {
        "main-1": { active: "stage1_feature", doneAfter: 1, type: "main" },
        "main-2": { active: "stage2_feature", doneAfter: 2, type: "main" },
        "main-3": { active: "stage3_feature", doneAfter: 3, type: "main" },
        "branch-1": { active: "side1", doneAfter: 4, type: "branch" },
        "branch-2": { active: "side2", doneAfter: 5, type: "branch" },
        "branch-3": { active: "side3", doneAfter: 6, type: "branch" },
        "side-1": { active: "side2", doneAfter: 5, type: "side" },
        "side-2": { active: "side3", doneAfter: 6, type: "side" },
        "side-3": { active: "fuse", doneAfter: 7, type: "fusion" },
        "fusion-1": { active: "fuse", doneAfter: 7, type: "fusion" },
        "fusion-2": { active: "fuse", doneAfter: 7, type: "fusion" },
        "fusion-3": { active: "fuse", doneAfter: 7, type: "fusion" }
    };

    const els = {
        imageInput: document.getElementById("edgeTeedImageInput"),
        imageName: document.getElementById("edgeTeedImageName"),
        samples: document.getElementById("edgeTeedSamples"),
        status: document.getElementById("edgeTeedStatus"),
        original: document.getElementById("edgeTeedOriginal"),
        networkOriginal: document.getElementById("edgeTeedNetworkOriginal"),
        topPreview: document.getElementById("edgeTeedTopPreview"),
        topPreviewLabel: document.getElementById("edgeTeedTopPreviewLabel"),
        results: document.getElementById("edgeTeedResults"),
        timeline: document.getElementById("edgeTeedTimeline"),
        infoTitle: document.getElementById("edgeTeedInfoTitle"),
        infoText: document.getElementById("edgeTeedInfoText"),
        formulaText: document.getElementById("edgeTeedFormulaText"),
        formulaParts: document.getElementById("edgeTeedFormulaParts"),
        prev: document.getElementById("edgeTeedPrev"),
        play: document.getElementById("edgeTeedPlay"),
        next: document.getElementById("edgeTeedNext"),
        reset: document.getElementById("edgeTeedReset"),
        showStages: document.getElementById("edgeTeedShowStages"),
        showSides: document.getElementById("edgeTeedShowSides"),
        showFusion: document.getElementById("edgeTeedShowFusion"),
        showOriginal: document.getElementById("edgeTeedShowOriginal")
    };

    const state = {
        sample: "cameraman.png",
        file: null,
        imageSrc: "",
        session: null,
        modelLoading: null,
        modelStatus: "missing",
        activeIndex: 0,
        timer: null,
        outputs: null,
        outputFit: null,
        runToken: 0
    };
    const teedStepOrder = resultItems.map((item) => item.key);
    const ortScriptLoads = Object.create(null);

    async function createTeedSession() {
        return window.ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function cleanStatusText(text) {
        return String(text ?? "")
            .replace(/\s+/g, " ")
            .replace(/https?:\/\/\S+/g, "")
            .trim();
    }

    function formatTeedError(error) {
        const message = cleanStatusText(error?.message || error || "");
        if (/failed to fetch dynamically imported module/i.test(message)) {
            return "TEED 运行时组件未就绪，当前仅展示结构示意。";
        }
        if (/no available backend found/i.test(message) || /backend not found/i.test(message)) {
            return "TEED 推理后端未初始化完成，当前仅展示结构示意。";
        }
        if (/jsep/i.test(message) || /wasm/i.test(message)) {
            return "TEED 运行时加载失败，当前仅展示结构示意。";
        }
        if (!message) {
            return "TEED 模型加载失败，当前仅展示结构示意。";
        }
        return message.length > 96 ? `${message.slice(0, 93)}...` : message;
    }

    function setStatus(text, mode = "info", detail = "") {
        const content = cleanStatusText(text);
        els.status.textContent = content;
        els.status.dataset.status = mode;
        els.status.title = cleanStatusText(detail || content);
    }

    function itemVisible(item) {
        if (item.group === "original") return els.showOriginal.checked;
        if (item.group === "stage") return els.showStages.checked;
        if (item.group === "side") return els.showSides.checked;
        if (item.group === "fusion") return els.showFusion.checked;
        return true;
    }

    function renderSamples() {
        els.samples.innerHTML = samples.map((sample) => `
            <button class="edge-sample-btn ${state.sample === sample.file && !state.file ? "is-active" : ""}" type="button" data-sample="${sample.file}" title="${escapeHtml(sample.label)}">
                <img src="${assetsBase}${sample.file}" alt="${escapeHtml(sample.label)}">
            </button>
        `).join("");
    }

    function placeholderMarkup(item) {
        return `
            <div class="edge-teed-placeholder">
                <i></i><i></i><i></i>
                <span>等待模型输出</span>
            </div>
            <p>模型文件补充后显示该阶段输出。</p>
        `;
    }

    function renderResultGrid() {
        els.results.innerHTML = resultItems.map((item, index) => {
            const hidden = itemVisible(item) ? "" : "hidden";
            const active = index === state.activeIndex ? "is-active" : "";
            const motionClass = item.key === state.activeKey ? "is-flow-active" : (index < state.activeIndex ? "is-flow-done" : "");
            const fusionSourceClass = state.activeKey === "fuse" && ["side1", "side2", "side3", "fuse"].includes(item.key)
                ? "is-fusion-source"
                : "";
            const canvas = state.outputs?.[item.key];
            const media = item.key === "original"
                ? `<img src="${state.imageSrc}" alt="Original">`
                : (canvas ? "" : placeholderMarkup(item));
            return `
                <article class="edge-teed-result-card ${active} ${motionClass} ${fusionSourceClass}" data-result-key="${item.key}" data-group="${item.group}" ${hidden}>
                    <header>
                        <strong>${escapeHtml(item.title)}</strong>
                        <span>${index + 1}</span>
                    </header>
                    <div class="edge-teed-result-media" data-media-key="${item.key}">${media}</div>
                    <p>${escapeHtml(item.desc)}</p>
                </article>
            `;
        }).join("");
        if (state.outputs) {
            Object.entries(state.outputs).forEach(([key, canvas]) => {
                const target = els.results.querySelector(`[data-media-key="${key}"]`);
                if (target && key !== "original") {
                    target.innerHTML = "";
                    target.appendChild(canvas);
                }
            });
        }
        renderTopPreview();
    }

    function copyCanvas(source, target) {
        target.width = source.width;
        target.height = source.height;
        target.getContext("2d").drawImage(source, 0, 0);
    }

    function renderTopPreview() {
        if (!els.topPreview) return;
        const activeKey = flowKeys[state.activeIndex];
        const previewKey = state.outputs?.[activeKey] && activeKey !== "original"
            ? activeKey
            : (state.outputs?.fuse ? "fuse" : "");
        if (previewKey && state.outputs?.[previewKey]) {
            const item = resultItems.find((entry) => entry.key === previewKey);
            if (els.topPreviewLabel) {
                els.topPreviewLabel.textContent = item?.title || "Result Preview";
            }
            let canvas = els.topPreview.querySelector("canvas");
            if (!canvas || canvas.dataset.previewKey !== previewKey) {
                els.topPreview.innerHTML = "";
                canvas = document.createElement("canvas");
                canvas.dataset.previewKey = previewKey;
                els.topPreview.appendChild(canvas);
            }
            copyCanvas(state.outputs[previewKey], canvas);
            return;
        }
        if (els.topPreviewLabel) {
            els.topPreviewLabel.textContent = "Result Preview";
        }
        els.topPreview.innerHTML = "";
        const image = document.createElement("img");
        image.src = state.imageSrc;
        image.alt = "TEED 输出结果预览";
        els.topPreview.appendChild(image);
        if (els.networkOriginal) {
            els.networkOriginal.src = state.imageSrc;
        }
    }

    function renderTimeline() {
        els.timeline.style.setProperty("--edge-flow-count", flowKeys.length);
        els.timeline.innerHTML = resultItems.map((item, index) => `
            <li class="${index < state.activeIndex ? "is-done" : ""} ${index === state.activeIndex ? "is-active" : ""}" data-flow-index="${index}" data-flow-key="${item.key}">
                <span>${index + 1}</span>
                <b>${escapeHtml(item.title.replace(" / Final Edge", ""))}</b>
            </li>
        `).join("");
        root.querySelectorAll(".edge-teed-network [data-flow-key]").forEach((node) => {
            const index = flowKeys.indexOf(node.dataset.flowKey);
            node.classList.toggle("is-active", index === state.activeIndex);
            node.classList.toggle("is-done", index >= 0 && index < state.activeIndex);
        });
        updateInfo();
        updateFormula();
        updateNetworkFlow();
    }

    function updateInfo() {
        const item = resultItems[state.activeIndex] || resultItems[0];
        if (els.infoTitle) {
            els.infoTitle.textContent = item.title;
        }
        if (els.infoText) {
            const infoMap = {
                original: "输入图像进入 TEED 网络，作为后续特征提取的基础。",
                stage1_feature: "浅层卷积特征，保留边缘、纹理和局部细节。",
                stage2_feature: "中层特征，局部结构增强，噪声纹理开始被压制。",
                stage3_feature: "深层特征，轮廓更加抽象，关注更大范围结构。",
                side1: "由浅层特征直接产生边缘预测，细节丰富但噪声较多。",
                side2: "由中层特征产生边缘预测，结构性更强。",
                side3: "由深层特征产生边缘预测，轮廓更概括。",
                fuse: "将多个 Side Output 加权融合，得到最终边缘概率图。"
            };
            els.infoText.textContent = infoMap[item.key] || item.desc;
        }
    }

    function updateFormula() {
        if (!els.formulaText || !els.formulaParts) return;
        const item = resultItems[state.activeIndex] || resultItems[0];
        const formulaMap = {
            original: { html: "F<sub>i</sub> = Conv<sub>i</sub>(F<sub>i-1</sub>)", tokens: ["fprev"] },
            stage1_feature: { html: "F<sub>i</sub> = Conv<sub>i</sub>(F<sub>i-1</sub>)", tokens: ["f1", "conv", "fprev"] },
            stage2_feature: { html: "F<sub>i</sub> = Conv<sub>i</sub>(F<sub>i-1</sub>)", tokens: ["f1", "conv", "fprev"] },
            stage3_feature: { html: "F<sub>i</sub> = Conv<sub>i</sub>(F<sub>i-1</sub>)", tokens: ["f1", "conv", "fprev"] },
            side1: { html: "S<sub>i</sub> = Conv1x1(F<sub>i</sub>)", tokens: ["s1", "conv"] },
            side2: { html: "S<sub>i</sub> = Conv1x1(F<sub>i</sub>)", tokens: ["s2", "conv"] },
            side3: { html: "S<sub>i</sub> = Conv1x1(F<sub>i</sub>)", tokens: ["s3", "conv"] },
            fuse: {
                html: "<span class=\"edge-formula-step edge-formula-final edge-formula-step-6\">Final</span><span class=\"edge-formula-equals\">=</span><span class=\"edge-formula-step edge-formula-sigmoid edge-formula-step-5\">sigmoid</span><span class=\"edge-formula-paren\">(</span><span class=\"edge-formula-step edge-formula-pair edge-formula-step-1\"><b>w<sub>1</sub></b>·<em>S<sub>1</sub></em></span><span class=\"edge-formula-plus\">+</span><span class=\"edge-formula-step edge-formula-pair edge-formula-step-2\"><b>w<sub>2</sub></b>·<em>S<sub>2</sub></em></span><span class=\"edge-formula-plus\">+</span><span class=\"edge-formula-step edge-formula-pair edge-formula-step-3\"><b>w<sub>3</sub></b>·<em>S<sub>3</sub></em></span><span class=\"edge-formula-plus\">+</span><span class=\"edge-formula-step edge-formula-sum edge-formula-step-4\">sum</span><span class=\"edge-formula-paren\">)</span>",
                tokens: ["final", "sigmoid", "sum", "w1", "w2", "w3", "s1", "s2", "s3"]
            }
        };
        const formula = formulaMap[item.key] || formulaMap.original;
        els.formulaText.innerHTML = formula.html;
        els.formulaParts.querySelectorAll("[data-formula-token]").forEach((node) => {
            const token = node.dataset.formulaToken;
            node.classList.toggle("is-active", formula.tokens.includes(token));
            node.dataset.tokenKind = ["sigmoid", "sum", "final"].includes(token) ? "final"
                : token.startsWith("s") ? "side"
                : token.startsWith("w") ? "weight"
                : "feature";
        });
    }

    function updateNetworkFlow() {
        const activeKey = state.activeKey || resultItems[0].key;
        root.dataset.activeKey = activeKey;
        root.dataset.fusionActive = activeKey === "fuse" ? "true" : "false";
        root.querySelectorAll("[data-flow-key]").forEach((node) => {
            const key = node.dataset.flowKey;
            const isActive = key === activeKey;
            const isDone = teedStepOrder.indexOf(key) >= 0 && teedStepOrder.indexOf(key) < state.activeIndex;
            node.classList.toggle("is-active", isActive);
            node.classList.toggle("is-done", isDone);
        });
        root.querySelectorAll("[data-flow-line]").forEach((line) => {
            const config = flowLineStages[line.dataset.flowLine];
            if (!config) return;
            const isFusionLine = config.type === "fusion";
            line.classList.toggle("is-active", config.active === activeKey || (activeKey === "fuse" && isFusionLine));
            line.classList.toggle("is-done", state.activeIndex > config.doneAfter);
            line.dataset.flowType = config.type;
        });
        const network = root.querySelector(".edge-teed-network");
        if (!network) return;
        network.dataset.step = activeKey;
    }

    function setActiveIndex(index) {
        state.activeIndex = Math.max(0, Math.min(resultItems.length - 1, index));
        state.activeKey = (resultItems[state.activeIndex] || resultItems[0]).key;
        renderTimeline();
        renderResultGrid();
    }

    function togglePlay() {
        if (state.timer) {
            window.clearInterval(state.timer);
            state.timer = null;
            els.play.textContent = "Play";
            return;
        }
        els.play.textContent = "Pause";
        state.timer = window.setInterval(() => {
            setActiveIndex((state.activeIndex + 1) % resultItems.length);
        }, 1050);
    }

    function withTimeout(promise, timeoutMs, label) {
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                reject(new Error(`${label} timed out. Please check the local runtime files and network access.`));
            }, timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId) window.clearTimeout(timeoutId);
        });
    }

    function loadScript(src) {
        if (window.ort) return Promise.resolve();
        if (ortScriptLoads[src]) return ortScriptLoads[src];
        ortScriptLoads[src] = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("onnxruntime-web failed to load. Please check local vendor files."));
            document.head.appendChild(script);
        });
        return ortScriptLoads[src].catch((error) => {
            delete ortScriptLoads[src];
            throw error;
        });
    }

    async function loadTeedModel() {
        if (state.session) {
            return state.session;
        }
        if (state.modelLoading) {
            return state.modelLoading;
        }
        setStatus("正在加载模型", "loading");
        state.modelLoading = (async () => {
            const response = await fetch(modelUrl, { method: "HEAD" });
            if (!response.ok) {
                throw new Error("未检测到 TEED ONNX 模型文件，请将 teed_debug_352.onnx 放入 static/assets/data/edge/ 后重新加载。");
            }
            await withTimeout(loadScript(ortScriptUrl), 12000, "onnxruntime-web 脚本加载");
            if (!window.ort) throw new Error("onnxruntime-web 未加载成功。");
            const wasmEnv = window.ort.env?.wasm;
            if (!wasmEnv) {
                throw new Error("onnxruntime-web WASM 环境未就绪。");
            }
            wasmEnv.wasmPaths = ortWasmBase;
            wasmEnv.proxy = false;
            wasmEnv.numThreads = 1;
            wasmEnv.simd = true;
            wasmEnv.initTimeout = 0;
            state.session = await withTimeout(
                createTeedSession(),
                45000,
                "TEED 模型加载"
            );
            state.modelStatus = "ready";
            setStatus("模型已加载", "ready");
            return state.session;
        })().catch((error) => {
            state.session = null;
            state.modelStatus = "missing";
            console.warn("TEED model load failed:", error);
            setStatus(formatTeedError(error), "missing", error?.message || String(error || ""));
            return null;
        }).finally(() => {
            state.modelLoading = null;
        });
        return state.modelLoading;
    }

    function tensorFromCanvas(canvas, size = inputSize) {
        if (!window.ort) throw new Error("onnxruntime-web 未加载成功。");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const data = context.getImageData(0, 0, size, size).data;
        const input = new Float32Array(1 * 3 * size * size);
        const plane = size * size;
        for (let index = 0; index < size * size; index += 1) {
            input[index] = data[index * 4 + 2] - teedBgrMean[0];
            input[plane + index] = data[index * 4 + 1] - teedBgrMean[1];
            input[plane * 2 + index] = data[index * 4] - teedBgrMean[2];
        }
        return new window.ort.Tensor("float32", input, [1, 3, size, size]);
    }

    function imageToTeedTensorWithFit(img, size = inputSize) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.fillStyle = "#000000";
        context.fillRect(0, 0, size, size);
        const sourceW = img.naturalWidth || img.width;
        const sourceH = img.naturalHeight || img.height;
        const scale = Math.min(size / sourceW, size / sourceH);
        const drawWidth = Math.max(1, Math.round(sourceW * scale));
        const drawHeight = Math.max(1, Math.round(sourceH * scale));
        const offsetX = Math.floor((size - drawWidth) / 2);
        const offsetY = Math.floor((size - drawHeight) / 2);
        context.drawImage(img, 0, 0, sourceW, sourceH, offsetX, offsetY, drawWidth, drawHeight);
        return {
            tensor: tensorFromCanvas(canvas, size),
            fit: { size, sourceW, sourceH, drawWidth, drawHeight, offsetX, offsetY }
        };
    }

    function imageToTeedTensor(img, size = inputSize) {
        return imageToTeedTensorWithFit(img, size).tensor;
    }

    function imageTileToTeedTensor(source, tile, size = inputSize) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(source, tile.x, tile.y, tile.width, tile.height, 0, 0, size, size);
        return tensorFromCanvas(canvas, size);
    }

    function sigmoid(value) {
        return 1 / (1 + Math.exp(-value));
    }

    function stretch01(value, min, max) {
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return value;
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }

    function firstExistingOutput(results, names) {
        return names.find((name) => results[name]);
    }

    function firstOutputTensor(results, names) {
        const outputName = firstExistingOutput(results, names);
        return outputName ? results[outputName] : null;
    }

    function collectTeedOutputs(results) {
        const aliases = {
            stage1_feature: ["stage1_feature", "stage1", "stage1_out"],
            stage2_feature: ["stage2_feature", "stage2", "stage2_out"],
            stage3_feature: ["stage3_feature", "stage3", "stage3_out"],
            side1: ["side1", "side_output1", "dsn1"],
            side2: ["side2", "side_output2", "dsn2"],
            side3: ["side3", "side_output3", "dsn3"],
            fuse: ["fuse", "fusion", "final", "final_edge", "output"]
        };
        const outputs = {};
        Object.entries(aliases).forEach(([key, names]) => {
            const outputName = firstExistingOutput(results, names);
            if (outputName) outputs[key] = results[outputName];
        });
        return { outputs, aliases };
    }

    async function runTeedTensor(tensor) {
        const inputName = state.session.inputNames?.[0] || "input";
        return state.session.run({ [inputName]: tensor });
    }

    function createRefineSource(img) {
        const sourceW = img.naturalWidth || img.width;
        const sourceH = img.naturalHeight || img.height;
        const scale = Math.min(1, refineMaxLongSide / Math.max(sourceW, sourceH));
        if (scale >= 1) {
            return { source: img, width: sourceW, height: sourceH };
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceW * scale));
        canvas.height = Math.max(1, Math.round(sourceH * scale));
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
        return { source: canvas, width: canvas.width, height: canvas.height };
    }

    function generateRefineTiles(width, height, size = inputSize, stride = refineStride) {
        const step = Math.max(1, Math.min(stride, size));
        const positions = (length) => {
            if (length <= size) return [0];
            const values = [];
            for (let value = 0; value <= length - size; value += step) values.push(value);
            const last = length - size;
            if (values[values.length - 1] !== last) values.push(last);
            return values;
        };
        const tiles = [];
        positions(height).forEach((y) => {
            positions(width).forEach((x) => {
                tiles.push({
                    x,
                    y,
                    width: Math.min(size, width),
                    height: Math.min(size, height)
                });
            });
        });
        return tiles;
    }

    function tensorToValues(tensor, key) {
        const dims = tensor.dims || [];
        const data = tensor.data || [];
        const height = dims[dims.length - 2] || inputSize;
        const width = dims[dims.length - 1] || inputSize;
        const planeSize = width * height;
        const offset = Math.max(0, data.length - planeSize);
        const values = new Float32Array(planeSize);
        const useSigmoid = key !== "stage1_feature" && key !== "stage2_feature" && key !== "stage3_feature";
        for (let i = 0; i < planeSize; i += 1) {
            const raw = data[offset + i] ?? 0;
            values[i] = useSigmoid ? sigmoid(raw) : raw;
        }
        return { width, height, values };
    }

    function resizeValues(map, targetWidth, targetHeight) {
        if (map.width === targetWidth && map.height === targetHeight) return map.values;
        return resizeCropValues(map, 0, 0, map.width, map.height, targetWidth, targetHeight);
    }

    function resizeCropValues(map, sx, sy, sw, sh, targetWidth, targetHeight) {
        const output = new Float32Array(targetWidth * targetHeight);
        for (let y = 0; y < targetHeight; y += 1) {
            const sourceY = sy + ((y + 0.5) * sh / targetHeight) - 0.5;
            const y0 = Math.max(0, Math.floor(sourceY));
            const y1 = Math.min(map.height - 1, y0 + 1);
            const ty = Math.max(0, Math.min(1, sourceY - y0));
            for (let x = 0; x < targetWidth; x += 1) {
                const sourceX = sx + ((x + 0.5) * sw / targetWidth) - 0.5;
                const x0 = Math.max(0, Math.floor(sourceX));
                const x1 = Math.min(map.width - 1, x0 + 1);
                const tx = Math.max(0, Math.min(1, sourceX - x0));
                const top = map.values[y0 * map.width + x0] * (1 - tx) + map.values[y0 * map.width + x1] * tx;
                const bottom = map.values[y1 * map.width + x0] * (1 - tx) + map.values[y1 * map.width + x1] * tx;
                output[y * targetWidth + x] = top * (1 - ty) + bottom * ty;
            }
        }
        return output;
    }

    function fitTensorToImageValues(tensor, key, fit, targetWidth, targetHeight) {
        const map = tensorToValues(tensor, key);
        const sx = fit.offsetX / fit.size * map.width;
        const sy = fit.offsetY / fit.size * map.height;
        const sw = fit.drawWidth / fit.size * map.width;
        const sh = fit.drawHeight / fit.size * map.height;
        return resizeCropValues(map, sx, sy, sw, sh, targetWidth, targetHeight);
    }

    function hannWeights(width, height) {
        const weights = new Float32Array(width * height);
        for (let y = 0; y < height; y += 1) {
            const wy = height <= 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (height - 1));
            for (let x = 0; x < width; x += 1) {
                const wx = width <= 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (width - 1));
                weights[y * width + x] = Math.max(0.05, wx * wy);
            }
        }
        return weights;
    }

    function valuesToCanvas(values, width, height, canvas = document.createElement("canvas"), flashRect = null) {
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(width, height);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < values.length; i += 1) {
            min = Math.min(min, values[i]);
            max = Math.max(max, values[i]);
        }
        if (!Number.isFinite(min) || max <= min) {
            min = 0;
            max = 1;
        }
        for (let i = 0; i < values.length; i += 1) {
            const normalized = stretch01(values[i], min, max);
            const byte = Math.max(0, Math.min(255, Math.round(normalized * 255)));
            imageData.data[i * 4] = byte;
            imageData.data[i * 4 + 1] = byte;
            imageData.data[i * 4 + 2] = byte;
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
        if (flashRect) {
            context.save();
            context.strokeStyle = "rgba(37, 99, 235, 0.92)";
            context.fillStyle = "rgba(59, 130, 246, 0.13)";
            context.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 180));
            context.fillRect(flashRect.x, flashRect.y, flashRect.width, flashRect.height);
            context.strokeRect(flashRect.x + 0.5, flashRect.y + 0.5, flashRect.width - 1, flashRect.height - 1);
            context.restore();
        }
        return canvas;
    }

    function createProgressiveStates(outputs, fit, width, height) {
        const states = {};
        resultItems.forEach((item) => {
            if (item.key === "original" || !outputs[item.key]) return;
            const values = fitTensorToImageValues(outputs[item.key], item.key, fit, width, height);
            const sum = new Float32Array(width * height);
            const weightSum = new Float32Array(width * height);
            for (let i = 0; i < values.length; i += 1) {
                sum[i] = values[i] * refineGlobalWeight;
                weightSum[i] = refineGlobalWeight;
            }
            states[item.key] = {
                key: item.key,
                sum,
                weightSum,
                current: values,
                canvas: valuesToCanvas(values, width, height)
            };
        });
        return states;
    }

    function applyTileToProgressiveState(stateItem, tensor, tile, weights, width) {
        const tileMap = tensorToValues(tensor, stateItem.key);
        const tileValues = resizeValues(tileMap, tile.width, tile.height);
        for (let y = 0; y < tile.height; y += 1) {
            const targetRow = (tile.y + y) * width;
            const tileRow = y * tile.width;
            for (let x = 0; x < tile.width; x += 1) {
                const targetIndex = targetRow + tile.x + x;
                const tileIndexInPatch = tileRow + x;
                const weight = refineTileWeight * weights[tileIndexInPatch];
                stateItem.sum[targetIndex] += tileValues[tileIndexInPatch] * weight;
                stateItem.weightSum[targetIndex] += weight;
                stateItem.current[targetIndex] = stateItem.sum[targetIndex] / stateItem.weightSum[targetIndex];
            }
        }
    }

    function progressiveStatesToCanvases(states) {
        return Object.fromEntries(Object.entries(states).map(([key, item]) => [key, item.canvas]));
    }

    function cropCanvasToFit(sourceCanvas, fit) {
        if (!fit) return sourceCanvas;
        const sx = fit.offsetX / fit.size * sourceCanvas.width;
        const sy = fit.offsetY / fit.size * sourceCanvas.height;
        const sw = fit.drawWidth / fit.size * sourceCanvas.width;
        const sh = fit.drawHeight / fit.size * sourceCanvas.height;
        if (sw >= sourceCanvas.width - 0.5 && sh >= sourceCanvas.height - 0.5) return sourceCanvas;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        const context = canvas.getContext("2d");
        context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function yieldFrame() {
        return new Promise((resolve) => requestAnimationFrame(resolve));
    }

    async function runTeedDebug(img) {
        if (!state.session) {
            setStatus("TEED 模型尚未加载", "missing");
            return null;
        }
        setStatus("推理中", "loading");
        const input = imageToTeedTensorWithFit(img, inputSize);
        state.outputFit = input.fit;
        const results = await runTeedTensor(input.tensor);
        const { outputs, aliases } = collectTeedOutputs(results);
        const missing = Object.keys(aliases).filter((key) => !outputs[key]);
        if (missing.length) {
            setStatus("推理完成，部分输出缺失", "warning", `缺少输出: ${missing.join(", ")}`);
        } else {
            setStatus("推理完成", "ready");
        }
        return outputs;
    }

    function tensorToGrayCanvas(tensor, options = {}) {
        const dims = tensor.dims || [];
        const data = tensor.data || [];
        const height = dims[dims.length - 2] || inputSize;
        const width = dims[dims.length - 1] || inputSize;
        const planeSize = width * height;
        const offset = Math.max(0, data.length - planeSize);
        const values = data.slice(offset, offset + planeSize);
        let min = Infinity;
        let max = -Infinity;
        if (options.normalize || options.stretch) {
            for (let i = 0; i < values.length; i += 1) {
                const raw = values[i] ?? 0;
                const value = options.normalize ? raw : sigmoid(raw);
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
            if (!Number.isFinite(min) || max <= min) {
                min = 0;
                max = 1;
            }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(width, height);
        for (let i = 0; i < planeSize; i += 1) {
            const raw = values[i] ?? 0;
            let normalized = options.normalize ? (raw - min) / (max - min) : sigmoid(raw);
            if (options.stretch) {
                normalized = stretch01(normalized, min, max);
            }
            const clipped = Math.max(0, Math.min(1, normalized));
            const value = Math.round((options.invert ? 1 - clipped : clipped) * 255);
            imageData.data[i * 4] = value;
            imageData.data[i * 4 + 1] = value;
            imageData.data[i * 4 + 2] = value;
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
        return options.fit ? cropCanvasToFit(canvas, options.fit) : canvas;
    }

    function renderTeedResults(outputs, overrides = {}) {
        const canvases = {};
        const fit = state.outputFit;
        ["stage1_feature", "stage2_feature", "stage3_feature"].forEach((key) => {
            if (outputs[key]) canvases[key] = tensorToGrayCanvas(outputs[key], { normalize: true, fit });
        });
        ["side1", "side2", "side3", "fuse"].forEach((key) => {
            if (outputs[key]) canvases[key] = tensorToGrayCanvas(outputs[key], { invert: false, stretch: true, fit });
        });
        Object.assign(canvases, overrides);
        state.outputs = canvases;
        renderResultGrid();
    }

    async function runSerialProgressiveTeed(img, runToken) {
        if (!state.session) return;
        const work = createRefineSource(img);
        const globalInput = imageToTeedTensorWithFit(work.source, inputSize);
        const globalResults = await runTeedTensor(globalInput.tensor);
        if (runToken !== state.runToken) return;

        const { outputs } = collectTeedOutputs(globalResults);
        if (!outputs.fuse) return;

        const progressiveStates = createProgressiveStates(outputs, globalInput.fit, work.width, work.height);
        state.outputs = Object.assign({}, state.outputs, progressiveStatesToCanvases(progressiveStates));
        renderResultGrid();
        setActiveIndex(flowKeys.indexOf("fuse"));

        const tiles = generateRefineTiles(work.width, work.height);
        const weightCache = new Map();
        for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
            if (runToken !== state.runToken) return;
            const tile = tiles[tileIndex];
            setStatus(`滑窗细化中：patch ${tileIndex + 1} / ${tiles.length}`, "loading");

            const tileTensor = imageTileToTeedTensor(work.source, tile, inputSize);
            const tileResults = await runTeedTensor(tileTensor);
            if (runToken !== state.runToken) return;

            const { outputs: tileOutputs } = collectTeedOutputs(tileResults);
            const weightKey = `${tile.width}x${tile.height}`;
            if (!weightCache.has(weightKey)) {
                weightCache.set(weightKey, hannWeights(tile.width, tile.height));
            }
            const weights = weightCache.get(weightKey);
            Object.entries(tileOutputs).forEach(([key, tensor]) => {
                const stateItem = progressiveStates[key];
                if (stateItem) applyTileToProgressiveState(stateItem, tensor, tile, weights, work.width);
            });

            Object.values(progressiveStates).forEach((stateItem) => {
                const isFuse = stateItem.key === "fuse";
                const shouldRepaint = isFuse
                    || tileIndex === 0
                    || tileIndex === tiles.length - 1
                    || (tileIndex + 1) % refineAuxUpdateEvery === 0;
                if (shouldRepaint) {
                    valuesToCanvas(stateItem.current, work.width, work.height, stateItem.canvas, tile);
                }
            });
            renderTopPreview();
            await yieldFrame();
        }

        if (runToken === state.runToken) {
            Object.values(progressiveStates).forEach((stateItem) => {
                valuesToCanvas(stateItem.current, work.width, work.height, stateItem.canvas);
            });
            renderTopPreview();
            setStatus(`推理完成，滑窗细化 ${tiles.length} / ${tiles.length}`, "ready");
        }
    }

    function loadImageElement(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("图片读取失败"));
            image.src = src;
        });
    }

    async function runCurrentImage() {
        const runToken = ++state.runToken;
        if (!state.session) {
            await loadTeedModel();
            if (!state.session) {
                return;
            }
        }
        try {
            const image = await loadImageElement(state.imageSrc);
            if (runToken !== state.runToken) return;
            const outputs = await runTeedDebug(image);
            if (runToken !== state.runToken) return;
            if (outputs) {
                renderTeedResults(outputs);
                await runSerialProgressiveTeed(image, runToken);
            }
        } catch (error) {
            if (runToken === state.runToken) {
                setStatus("推理失败", "missing", error?.message || String(error || ""));
            }
        }
    }

    function setImageSource(src, name) {
        state.imageSrc = src;
        els.original.src = src;
        if (els.networkOriginal) {
            els.networkOriginal.src = src;
        }
        els.imageName.textContent = name;
        state.outputs = null;
        state.outputFit = null;
        renderResultGrid();
        setActiveIndex(0);
        runCurrentImage();
    }

    function bindEvents() {
        els.samples.addEventListener("click", (event) => {
            const button = event.target.closest("[data-sample]");
            if (!button) return;
            state.file = null;
            state.sample = button.dataset.sample;
            renderSamples();
            setImageSource(`${assetsBase}${state.sample}`, `当前使用示例图像：${button.title}`);
        });
        els.imageInput.addEventListener("change", () => {
            const file = els.imageInput.files && els.imageInput.files[0];
            if (!file) return;
            state.file = file;
            state.sample = "";
            renderSamples();
            setImageSource(URL.createObjectURL(file), file.name);
        });
        els.timeline.addEventListener("click", (event) => {
            const item = event.target.closest("[data-flow-index]");
            if (!item) return;
            setActiveIndex(Number(item.dataset.flowIndex));
        });
        els.prev.addEventListener("click", () => setActiveIndex(state.activeIndex - 1));
        els.next.addEventListener("click", () => setActiveIndex(state.activeIndex + 1));
        els.reset.addEventListener("click", () => setActiveIndex(0));
        els.play.addEventListener("click", togglePlay);
        [els.showStages, els.showSides, els.showFusion, els.showOriginal].forEach((control) => {
            control.addEventListener("change", renderResultGrid);
        });
        els.results.addEventListener("click", (event) => {
            const card = event.target.closest("[data-result-key]");
            if (!card) return;
            const index = flowKeys.indexOf(card.dataset.resultKey);
            if (index >= 0) setActiveIndex(index);
        });
    }

    renderSamples();
    setImageSource(`${assetsBase}${state.sample}`, "当前使用示例图像");
    renderTimeline();
    bindEvents();
})();
