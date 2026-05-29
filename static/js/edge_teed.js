(() => {
    "use strict";

    const root = document.getElementById("edgeTeedPage");
    if (!root) return;

    const assetsBase = root.dataset.assetsBase || "";
    const modelUrl = root.dataset.modelUrl || "/static/assets/data/teed_debug_352.onnx";
    const ortScriptUrl = root.dataset.ortScriptUrl || "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js";
    const ortWasmBase = root.dataset.ortWasmBase || "/static/vendor/onnxruntime-web/";
    const inputSize = 352;
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

    const els = {
        imageInput: document.getElementById("edgeTeedImageInput"),
        imageName: document.getElementById("edgeTeedImageName"),
        samples: document.getElementById("edgeTeedSamples"),
        status: document.getElementById("edgeTeedStatus"),
        original: document.getElementById("edgeTeedOriginal"),
        results: document.getElementById("edgeTeedResults"),
        timeline: document.getElementById("edgeTeedTimeline"),
        infoTitle: document.getElementById("edgeTeedInfoTitle"),
        infoText: document.getElementById("edgeTeedInfoText"),
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
        outputs: null
    };
    const ortScriptLoads = Object.create(null);

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
            const canvas = state.outputs?.[item.key];
            const media = item.key === "original"
                ? `<img src="${state.imageSrc}" alt="Original">`
                : (canvas ? "" : placeholderMarkup(item));
            return `
                <article class="edge-teed-result-card ${active}" data-result-key="${item.key}" data-group="${item.group}" ${hidden}>
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
    }

    function renderTimeline() {
        els.timeline.style.setProperty("--edge-flow-count", flowKeys.length);
        els.timeline.innerHTML = resultItems.map((item, index) => `
            <li class="${index < state.activeIndex ? "is-done" : ""} ${index === state.activeIndex ? "is-active" : ""}" data-flow-index="${index}">
                <span>${index + 1}</span>
                <b>${escapeHtml(item.title.replace(" / Final Edge", ""))}</b>
            </li>
        `).join("");
        root.querySelectorAll("[data-flow-key]").forEach((node) => {
            const index = flowKeys.indexOf(node.dataset.flowKey);
            node.classList.toggle("is-active", index === state.activeIndex);
            node.classList.toggle("is-done", index >= 0 && index < state.activeIndex);
        });
        updateInfo();
    }

    function updateInfo() {
        const item = resultItems[state.activeIndex] || resultItems[0];
        if (els.infoTitle) {
            els.infoTitle.textContent = item.title;
        }
        if (els.infoText) {
            els.infoText.textContent = item.key === "original"
                ? "TEED / HED 是深度边缘检测拓展展示；Sobel / Canny 才是本实验核心手写算法。"
                : item.desc;
        }
    }

    function setActiveIndex(index) {
        state.activeIndex = Math.max(0, Math.min(resultItems.length - 1, index));
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
            const response = await fetch(modelUrl, { method: "HEAD", cache: "no-store" });
            if (!response.ok) {
                throw new Error("未检测到 TEED ONNX 模型文件，请将 teed_debug_352.onnx 放入 static/assets/data/ 后重新加载。");
            }
            await withTimeout(loadScript(ortScriptUrl), 12000, "onnxruntime-web 脚本加载");
            if (!window.ort) throw new Error("onnxruntime-web 未加载成功。");
            window.ort.env.wasm.wasmPaths = ortWasmBase;
            window.ort.env.wasm.proxy = false;
            window.ort.env.wasm.numThreads = 1;
            window.ort.env.wasm.simd = true;
            window.ort.env.wasm.initTimeout = 0;
            state.session = await withTimeout(
                window.ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] }),
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

    function imageToTeedTensor(img, size = inputSize) {
        if (!window.ort) throw new Error("onnxruntime-web 未加载成功。");
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(img, 0, 0, size, size);
        const data = context.getImageData(0, 0, size, size).data;
        const input = new Float32Array(1 * 3 * size * size);
        for (let index = 0; index < size * size; index += 1) {
            input[index] = data[index * 4];
            input[size * size + index] = data[index * 4 + 1];
            input[size * size * 2 + index] = data[index * 4 + 2];
        }
        return new window.ort.Tensor("float32", input, [1, 3, size, size]);
    }

    function firstExistingOutput(results, names) {
        return names.find((name) => results[name]);
    }

    async function runTeedDebug(img) {
        if (!state.session) {
            setStatus("TEED 模型尚未加载", "missing");
            return null;
        }
        setStatus("推理中", "loading");
        const inputName = state.session.inputNames?.[0] || "input";
        const tensor = imageToTeedTensor(img, inputSize);
        const results = await state.session.run({ [inputName]: tensor });
        const aliases = {
            stage1_feature: ["stage1_feature", "stage1", "stage1_out"],
            stage2_feature: ["stage2_feature", "stage2", "stage2_out"],
            stage3_feature: ["stage3_feature", "stage3", "stage3_out"],
            side1: ["side1", "side_output1", "dsn1"],
            side2: ["side2", "side_output2", "dsn2"],
            side3: ["side3", "side_output3", "dsn3"],
            fuse: ["fuse", "fusion", "final", "output"]
        };
        const outputs = {};
        Object.entries(aliases).forEach(([key, names]) => {
            const outputName = firstExistingOutput(results, names);
            if (outputName) outputs[key] = results[outputName];
        });
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
        if (options.normalize) {
            for (let i = 0; i < values.length; i += 1) {
                min = Math.min(min, values[i]);
                max = Math.max(max, values[i]);
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
            const normalized = options.normalize ? (raw - min) / (max - min) : raw;
            const clipped = Math.max(0, Math.min(1, normalized));
            const value = Math.round((options.invert ? 1 - clipped : clipped) * 255);
            imageData.data[i * 4] = value;
            imageData.data[i * 4 + 1] = value;
            imageData.data[i * 4 + 2] = value;
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
        return canvas;
    }

    function renderTeedResults(outputs) {
        const canvases = {};
        ["stage1_feature", "stage2_feature", "stage3_feature"].forEach((key) => {
            if (outputs[key]) canvases[key] = tensorToGrayCanvas(outputs[key], { normalize: true });
        });
        ["side1", "side2", "side3", "fuse"].forEach((key) => {
            if (outputs[key]) canvases[key] = tensorToGrayCanvas(outputs[key], { invert: false });
        });
        state.outputs = canvases;
        renderResultGrid();
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
        if (!state.session) {
            await loadTeedModel();
            if (!state.session) {
                return;
            }
        }
        try {
            const image = await loadImageElement(state.imageSrc);
            const outputs = await runTeedDebug(image);
            if (outputs) renderTeedResults(outputs);
        } catch (error) {
            setStatus("推理失败", "missing", error?.message || String(error || ""));
        }
    }

    function setImageSource(src, name) {
        state.imageSrc = src;
        els.original.src = src;
        els.imageName.textContent = name;
        state.outputs = null;
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
