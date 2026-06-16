(function () {
    const root = document.querySelector("[data-semantic-lab]");
    if (!root) return;

    const UNKNOWN = 65535;
    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const modelBaseUrl = window.cvclassUrl("/static/assets/data/segformer_b0_ade/");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/semantic_inference.js?v=20260616-segformer3");
    const requiredModelFiles = ["config.json", "preprocessor_config.json", "quantize_config.json", "model_quantized.onnx"];
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];

    const state = {
        data: null,
        sampleId: "",
        selectedSource: "preset",
        mode: "overlay",
        opacity: 0.65,
        boundaries: true,
        enabled: new Set(),
        presetMasks: new Map(),
        modelMask: null,
        currentMask: null,
        phase: "image",
        modelStatus: "未加载",
        activeBackend: "--",
        modelInfo: null,
        modelError: "",
        inferenceModule: null,
        inferenceClient: null,
        busy: false,
        probeInfo: null,
        sampler: null,
        samplerKey: ""
    };

    const els = {
        sample: $("[data-sem-sample]"),
        sourceButtons: $$("[data-sem-source]"),
        modes: $$("[data-sem-mode]"),
        opacity: $("[data-sem-opacity]"),
        opacityOut: $("[data-sem-opacity-output]"),
        boundaries: $("[data-sem-boundaries]"),
        filter: $("[data-sem-class-filter]"),
        backend: $("[data-sem-backend]"),
        loadModel: $("[data-sem-load-model]"),
        runModel: $("[data-sem-run-model]"),
        usePreset: $("[data-sem-use-preset]"),
        modelStatus: $("[data-sem-model-status]"),
        modelMessage: $("[data-sem-model-message]"),
        inputSize: $("[data-sem-input-size]"),
        classCount: $("[data-sem-class-count]"),
        inferenceTime: $("[data-sem-inference-time]"),
        postprocessTime: $("[data-sem-postprocess-time]"),
        activeBackend: $("[data-sem-active-backend]"),
        image: $("[data-sem-image]"),
        missing: $("[data-sem-missing]"),
        canvas: $("[data-sem-canvas]"),
        stage: $("[data-sem-stage]"),
        legend: $("[data-sem-legend]"),
        ratios: $("[data-sem-ratios]"),
        miou: $("[data-sem-miou]"),
        probe: $("[data-sem-probe]"),
        notesTitle: $("[data-sem-notes-title]"),
        notesSubtitle: $("[data-sem-notes-subtitle]"),
        notesTutorial: $("[data-sem-notes-tutorial]"),
        notes: $("[data-sem-notes]"),
        outputSchema: $("[data-sem-output-schema]"),
        stripSource: $("[data-sem-strip-source]"),
        stripModel: $("[data-sem-strip-model]"),
        stripBackend: $("[data-sem-strip-backend]"),
        stripInference: $("[data-sem-strip-inference]"),
        stripPostprocess: $("[data-sem-strip-postprocess]"),
        stripMask: $("[data-sem-strip-mask]"),
        stripClasses: $("[data-sem-strip-classes]"),
        stepperItems: [...document.querySelectorAll("[data-sem-stepper] [data-sem-phase]")],
        flowItems: $$("[data-flow-phase]")
    };
    const ctx = els.canvas.getContext("2d", {willReadFrequently: true});

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function fmtMs(value) {
        return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "--";
    }

    function sample() {
        return state.data?.samples?.find((item) => item.id === state.sampleId) || state.data?.samples?.[0];
    }

    function label(info) {
        return info?.cn || info?.name || `class_${info?.id ?? "--"}`;
    }

    function classById(mask, id) {
        return mask?.classes?.find((item) => Number(item.id) === Number(id));
    }

    function encodeId(id) {
        const value = Number(id) + 1;
        return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
    }

    function decodeId(r, g, b) {
        const value = (r << 16) | (g << 8) | b;
        return value > 0 ? value - 1 : UNKNOWN;
    }

    function buildDistribution(classes, counts, total) {
        return classes.map((item) => ({
            id: Number(item.id),
            name: item.name,
            count: counts.get(Number(item.id)) || 0,
            ratio: total ? (counts.get(Number(item.id)) || 0) / total : 0
        }));
    }

    function buildPresetMask(s) {
        if (state.presetMasks.has(s.id)) return state.presetMasks.get(s.id);
        const maskCanvas = document.createElement("canvas");
        const scoreCanvas = document.createElement("canvas");
        maskCanvas.width = scoreCanvas.width = s.width;
        maskCanvas.height = scoreCanvas.height = s.height;
        const maskCtx = maskCanvas.getContext("2d", {willReadFrequently: true});
        const scoreCtx = scoreCanvas.getContext("2d", {willReadFrequently: true});
        const byName = new Map(s.classes.map((item) => [item.name, item]));

        (s.regions || []).forEach((region) => {
            const info = byName.get(region.class);
            if (!info || !Array.isArray(region.polygon) || region.polygon.length < 3) return;
            maskCtx.beginPath();
            scoreCtx.beginPath();
            region.polygon.forEach(([x, y], index) => {
                const target = index === 0 ? "moveTo" : "lineTo";
                maskCtx[target](x, y);
                scoreCtx[target](x, y);
            });
            maskCtx.closePath();
            scoreCtx.closePath();
            maskCtx.fillStyle = encodeId(info.id);
            maskCtx.fill();
            const score = Math.max(0, Math.min(255, Math.round((region.probability ?? 0.75) * 255)));
            scoreCtx.fillStyle = `rgb(${score}, ${score}, ${score})`;
            scoreCtx.fill();
        });

        const rgba = maskCtx.getImageData(0, 0, s.width, s.height).data;
        const scores = scoreCtx.getImageData(0, 0, s.width, s.height).data;
        const classMap = new Uint16Array(s.width * s.height);
        const scoreMap = new Float32Array(s.width * s.height);
        const counts = new Map();
        for (let i = 0; i < classMap.length; i += 1) {
            const p = i * 4;
            const id = decodeId(rgba[p], rgba[p + 1], rgba[p + 2]);
            classMap[i] = id;
            if (id !== UNKNOWN) {
                counts.set(id, (counts.get(id) || 0) + 1);
                scoreMap[i] = scores[p] / 255;
            }
        }

        const classes = s.classes.map((item) => ({...item, id: Number(item.id)}));
        const mask = {
            source: "preset",
            sampleId: s.id,
            width: s.width,
            height: s.height,
            classMap,
            scoreMap,
            classes,
            distribution: buildDistribution(classes, counts, s.width * s.height),
            meta: {
                modelName: "Preset Mask",
                backend: "preset",
                inputSize: `${s.width} × ${s.height}`,
                rawOutputShape: "polygon regions",
                rawOutputSummary: "preset polygons rasterized to classMap",
                preprocessTime: 0,
                inferenceTime: null,
                postprocessTime: 0
            }
        };
        state.presetMasks.set(s.id, mask);
        return mask;
    }

    function presetMask() {
        return buildPresetMask(sample());
    }

    function currentUsableMask() {
        return state.selectedSource === "model" && state.modelMask?.sampleId === state.sampleId ? state.modelMask : presetMask();
    }

    function setPhase(phase) {
        state.phase = phase;
        els.stepperItems.forEach((item) => item.classList.toggle("is-active", item.dataset.semPhase === phase));
        els.flowItems.forEach((item) => item.classList.toggle("is-active", item.dataset.flowPhase === phase));
        renderNotes();
    }

    function setModelStatus(status, message) {
        state.modelStatus = status;
        els.modelStatus.textContent = status;
        if (message) els.modelMessage.textContent = message;
    }

    function setBusy(busy) {
        state.busy = busy;
        els.loadModel.disabled = busy;
        els.runModel.disabled = busy;
        els.backend.disabled = busy;
        els.loadModel.classList.toggle("is-loading", busy);
        els.runModel.classList.toggle("is-loading", busy);
    }

    function renderSourceButtons() {
        els.sourceButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.semSource === state.selectedSource));
    }

    function renderRuntime() {
        const mask = state.currentMask;
        const meta = mask?.meta || {};
        els.inputSize.textContent = meta.inputSize || state.modelInfo?.inputSizeText || "512 × 512";
        els.classCount.textContent = String(meta.classCount || state.modelInfo?.classCount || mask?.classes?.length || "--");
        els.inferenceTime.textContent = fmtMs(meta.inferenceTime);
        els.postprocessTime.textContent = fmtMs(meta.postprocessTime);
        els.activeBackend.textContent = state.activeBackend || meta.backend || "--";
        els.stripSource.textContent = mask?.source === "model" ? "Frontend Model" : "Preset Mask";
        els.stripModel.textContent = meta.modelName || "--";
        els.stripBackend.textContent = meta.backend || state.activeBackend || "--";
        els.stripInference.textContent = fmtMs(meta.inferenceTime);
        els.stripPostprocess.textContent = fmtMs(meta.postprocessTime);
        els.stripMask.textContent = mask ? `${mask.height} × ${mask.width}` : "--";
        els.stripClasses.textContent = String(mask?.classes?.length || "--");
        els.miou.textContent = mask?.source === "preset" ? `mIoU ${((sample()?.miou || 0) * 100).toFixed(1)}%` : "Model Mask";
    }

    function visibleClasses(mask) {
        return mask.distribution
            .filter((item) => item.count > 0 || mask.source === "preset")
            .map((item) => classById(mask, item.id))
            .filter(Boolean);
    }

    function renderClassControls(reset = false) {
        const mask = state.currentMask;
        if (!mask) return;
        const classes = visibleClasses(mask);
        if (reset || !state.enabled.size) {
            state.enabled = new Set(classes.map((item) => Number(item.id)));
        } else {
            const available = new Set(classes.map((item) => Number(item.id)));
            state.enabled = new Set([...state.enabled].filter((id) => available.has(Number(id))));
            if (!state.enabled.size) state.enabled = new Set(classes.map((item) => Number(item.id)));
        }
        els.filter.innerHTML = classes.map((item) => `
            <label class="vision-check-row">
                <input type="checkbox" value="${Number(item.id)}" ${state.enabled.has(Number(item.id)) ? "checked" : ""}>
                <span><i style="background:${esc(item.color)}"></i>${esc(label(item))}</span>
            </label>`).join("");
        els.filter.querySelectorAll("input").forEach((input) => {
            input.addEventListener("change", () => {
                state.enabled = new Set([...els.filter.querySelectorAll("input:checked")].map((node) => Number(node.value)));
                draw();
                renderLegendAndRatios();
                renderNotes();
            });
        });
    }

    function renderLegendAndRatios() {
        const mask = state.currentMask;
        if (!mask) return;
        const rows = mask.distribution
            .filter((item) => item.count > 0 || mask.source === "preset")
            .map((item) => {
                const info = classById(mask, item.id);
                const enabled = state.enabled.has(Number(item.id));
                return {info, enabled, pct: enabled ? item.ratio * 100 : 0};
            });
        els.legend.innerHTML = rows.map(({info, enabled}) => `<span class="${enabled ? "" : "is-muted"}"><i style="background:${esc(info?.color || "#2563eb")}"></i>${esc(label(info))}</span>`).join("");
        els.ratios.innerHTML = rows.map(({info, enabled, pct}) => `
            <div class="${enabled ? "" : "is-muted"}">
                <span><i style="background:${esc(info?.color || "#2563eb")}"></i>${esc(label(info))}</span>
                <b><em style="width:${pct.toFixed(2)}%;background:${esc(info?.color || "#2563eb")}"></em></b>
                <strong>${pct.toFixed(1)}%</strong>
            </div>`).join("") || `<p class="semantic-empty-text">当前 mask 没有可显示类别。</p>`;
        els.outputSchema.textContent = `${mask.height} × ${mask.width} class index map`;
    }

    function parseColor(hex) {
        const value = String(hex || "#2563eb").replace("#", "");
        const full = value.length === 3 ? value.split("").map((x) => x + x).join("") : value.padEnd(6, "0").slice(0, 6);
        return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
    }

    function shouldDraw(id) {
        return id !== UNKNOWN && state.enabled.has(Number(id));
    }

    function boundary(mask, x, y, id) {
        if (!state.boundaries || !shouldDraw(id)) return false;
        const w = mask.width;
        const h = mask.height;
        if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return true;
        const i = y * w + x;
        return mask.classMap[i - 1] !== id || mask.classMap[i + 1] !== id || mask.classMap[i - w] !== id || mask.classMap[i + w] !== id;
    }

    function draw() {
        const mask = state.currentMask;
        if (!mask) return;
        els.canvas.width = mask.width;
        els.canvas.height = mask.height;
        els.stage.dataset.mode = state.mode;
        els.stage.style.setProperty("--sem-aspect", `${Math.max(1, mask.width)} / ${Math.max(1, mask.height)}`);
        els.canvas.style.opacity = state.mode === "image" ? "0" : (state.mode === "mask" ? "1" : String(state.opacity));
        const imageData = ctx.createImageData(mask.width, mask.height);
        const out = imageData.data;
        const colors = new Map();
        for (let y = 0; y < mask.height; y += 1) {
            for (let x = 0; x < mask.width; x += 1) {
                const i = y * mask.width + x;
                const id = mask.classMap[i];
                const p = i * 4;
                if (!shouldDraw(id)) {
                    if (state.mode === "mask") {
                        out[p] = 15; out[p + 1] = 23; out[p + 2] = 42; out[p + 3] = 255;
                    }
                    continue;
                }
                if (boundary(mask, x, y, id)) {
                    out[p] = 255; out[p + 1] = 255; out[p + 2] = 255; out[p + 3] = state.mode === "mask" ? 235 : 210;
                    continue;
                }
                if (!colors.has(id)) colors.set(id, parseColor(classById(mask, id)?.color));
                const [r, g, b] = colors.get(id);
                out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = state.mode === "mask" ? 238 : 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function activateMask(mask, resetClasses = false) {
        state.currentMask = mask;
        state.probeInfo = null;
        state.sampler = null;
        state.samplerKey = "";
        renderRuntime();
        renderClassControls(resetClasses);
        renderLegendAndRatios();
        draw();
        renderNotes();
    }

    function renderImage() {
        const s = sample();
        if (!s) return;
        els.image.src = window.cvclassUrl(s.image);
        els.missing.textContent = `请放入 ${s.image.split("/").pop()}`;
    }

    function switchToPreset(message = "已切回预设 mask 模式。") {
        state.selectedSource = "preset";
        renderSourceButtons();
        setPhase("overlay");
        setModelStatus(state.modelStatus, message);
        activateMask(presetMask(), true);
    }

    async function fetchHeadOrGet(url) {
        let response = await fetch(url, {method: "HEAD", cache: "no-store"});
        if (response.status === 405 || response.status === 501) response = await fetch(url, {cache: "no-store"});
        return response.ok;
    }

    async function checkModelFiles() {
        const missing = [];
        for (const file of requiredModelFiles) {
            const ok = await fetchHeadOrGet(window.cvclassUrl(`/static/assets/data/segformer_b0_ade/${file}`)).catch(() => false);
            if (!ok) missing.push(file);
        }
        return missing;
    }

    async function getInferenceClient() {
        if (state.inferenceClient) return state.inferenceClient;
        state.inferenceModule = await import(inferenceModuleUrl);
        state.inferenceClient = state.inferenceModule.createSemanticInferenceClient();
        return state.inferenceClient;
    }

    function formatError(error) {
        const shape = error?.rawOutputShape ? ` rawOutputShape=[${error.rawOutputShape.join(", ")}]` : "";
        return `${error?.message || "语义分割推理失败"}${shape}`;
    }

    function waitForImage(image) {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                image.removeEventListener("load", onLoad);
                image.removeEventListener("error", onError);
            };
            const onLoad = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error("图像加载失败，无法运行语义分割。")); };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    async function loadModel() {
        if (state.busy) return;
        state.selectedSource = "model";
        renderSourceButtons();
        setBusy(true);
        setPhase("preprocess");
        setModelStatus("加载中", "正在检查本地模型文件...");
        try {
            const missing = await checkModelFiles();
            if (missing.length) {
                const message = `模型文件未安装，请切换到预设 mask 模式。缺失：${missing.join(", ")}`;
                state.modelError = message;
                state.activeBackend = "--";
                setModelStatus("加载失败", message);
                els.loadModel.textContent = "模型文件未安装";
                renderRuntime();
                setPhase("image");
                return;
            }
            els.loadModel.textContent = "加载模型";
            setModelStatus("加载中", "正在加载 SegFormer-B0 本地 ONNX 模型...");
            const client = await getInferenceClient();
            const info = await client.loadSemanticModel({backend: els.backend.value, modelBaseUrl});
            state.modelInfo = {...info, inputSizeText: `${info.inputSize.width} × ${info.inputSize.height}`};
            state.activeBackend = info.backend;
            state.modelError = "";
            setModelStatus("已加载", info.backend === "wasm" && els.backend.value === "webgpu" ? "WebGPU 不可用或加载失败，已自动回退 WASM。" : "模型已加载，可以运行语义分割。");
            renderRuntime();
            setPhase("inference");
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            state.activeBackend = "--";
            setModelStatus("加载失败", `${message} 请切回预设 mask 模式。`);
            setPhase("image");
            renderRuntime();
        } finally {
            setBusy(false);
        }
    }

    async function runModel() {
        if (state.busy) return;
        state.selectedSource = "model";
        renderSourceButtons();
        if (state.modelStatus !== "已加载" && state.modelStatus !== "推理完成") {
            setModelStatus(state.modelStatus, "请先加载模型。");
            setPhase("image");
            return;
        }
        setBusy(true);
        try {
            await waitForImage(els.image);
            setModelStatus("推理中", "正在 resize / normalize 输入图像...");
            setPhase("preprocess");
            await new Promise((resolve) => setTimeout(resolve, 100));
            setPhase("inference");
            const result = await (await getInferenceClient()).runSemanticInference(els.image);
            setPhase("argmax");
            await new Promise((resolve) => setTimeout(resolve, 100));
            result.sampleId = state.sampleId;
            result.meta = {...result.meta, backend: result.meta?.backend || state.activeBackend, modelName: "SegFormer-B0"};
            state.activeBackend = result.meta.backend;
            state.modelMask = result;
            state.enabled = new Set(result.classes.map((item) => Number(item.id)));
            setModelStatus("推理完成", `语义分割完成：mask=${result.height} × ${result.width}，classes=${result.classes.length}。`);
            setPhase("mask");
            activateMask(result, true);
            setPhase("overlay");
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            setModelStatus("加载失败", `${message} 已保留上一次可用 mask，可一键切回预设 mask。`);
            setPhase("image");
            activateMask(currentUsableMask(), false);
        } finally {
            setBusy(false);
        }
    }

    function topClass(mask) {
        return mask?.distribution?.slice().sort((a, b) => b.ratio - a.ratio)[0];
    }

    function renderNotes() {
        const mask = state.currentMask;
        const meta = mask?.meta || {};
        const s = sample();
        const top = topClass(mask);
        const topInfo = top ? classById(mask, top.id) : null;
        if (state.probeInfo) {
            const p = state.probeInfo;
            els.notesTitle.textContent = "Pixel Probe";
            els.notesSubtitle.textContent = `Pixel(${p.x}, ${p.y})`;
            els.notesTutorial.innerHTML = `<p>当前探针读取统一 classMap，因此预设 mask 与模型推理 mask 使用同一套查询逻辑。</p>`;
            els.notes.innerHTML = `<dl><div><dt>Pixel(x,y)</dt><dd>${p.x}, ${p.y}</dd></div><div><dt>RGB</dt><dd>${p.rgb}</dd></div><div><dt>Class ID</dt><dd>${p.classId}</dd></div><div><dt>Class Name</dt><dd>${esc(p.className)}</dd></div><div><dt>Probability / score</dt><dd>${p.score}</dd></div><div><dt>当前类别颜色</dt><dd><span class="semantic-note-swatch" style="background:${esc(p.color)}"></span>${esc(p.color)}</dd></div></dl>`;
            return;
        }
        if (state.phase === "preprocess") {
            els.notesTitle.textContent = "Preprocess";
            els.notesSubtitle.textContent = "Resize / Normalize";
            els.notesTutorial.innerHTML = `<p>输入图像会被缩放到模型预处理配置要求的尺寸，并按 ImageNet mean/std 标准化为 NCHW tensor。</p>`;
            els.notes.innerHTML = `<dl><div><dt>输入图像尺寸</dt><dd>${s?.width || "--"} × ${s?.height || "--"}</dd></div><div><dt>resize / normalize</dt><dd>${meta.inputSize || state.modelInfo?.inputSizeText || "512 × 512"} / ImageNet mean-std</dd></div><div><dt>tensor shape</dt><dd>[1, 3, ${state.modelInfo?.inputSize?.height || 512}, ${state.modelInfo?.inputSize?.width || 512}]</dd></div><div><dt>当前输入来源</dt><dd>${mask?.source === "model" ? "Frontend Model" : "Preset Mask"}</dd></div></dl>`;
        } else if (state.phase === "inference") {
            els.notesTitle.textContent = "Model Inference";
            els.notesSubtitle.textContent = "SegFormer / Frontend Runtime";
            els.notesTutorial.innerHTML = `<p>SegFormer-B0 在浏览器端执行前向计算。若 WebGPU 不可用，运行时自动回退 WASM。</p>`;
            els.notes.innerHTML = `<dl><div><dt>模型名称</dt><dd>SegFormer-B0 Semantic Segmentation</dd></div><div><dt>推理后端</dt><dd>${esc(meta.backend || state.activeBackend || "--")}</dd></div><div><dt>推理耗时</dt><dd>${fmtMs(meta.inferenceTime)}</dd></div><div><dt>输出结构摘要</dt><dd>${esc(meta.rawOutputSummary || "等待模型输出")}</dd></div></dl>`;
        } else if (state.phase === "argmax") {
            els.notesTitle.textContent = "Logits / Argmax";
            els.notesSubtitle.textContent = "C-channel decision";
            const directMask = String(meta.rawOutputSummary || "").includes("class mask");
            els.notesTutorial.innerHTML = directMask ? `<p>模型 pipeline 已直接返回 mask，类别决策已经完成，页面只需统一为 H × W class index map。</p>` : `<p>如果模型输出是 logits，则逐像素执行 <code>classMap[h,w] = argmax_c logits[c,h,w]</code>。</p>`;
            els.notes.innerHTML = `<dl><div><dt>类别数量</dt><dd>${meta.classCount || mask?.classes?.length || "--"}</dd></div><div><dt>mask 尺寸</dt><dd>${mask ? `${mask.height} × ${mask.width}` : "--"}</dd></div><div><dt>rawOutputShape</dt><dd>${Array.isArray(meta.rawOutputShape) ? `[${meta.rawOutputShape.join(", ")}]` : esc(meta.rawOutputShape || "--")}</dd></div></dl>`;
        } else if (state.phase === "mask" || state.phase === "overlay") {
            els.notesTitle.textContent = state.phase === "overlay" ? "Overlay & Metrics" : "Semantic Mask";
            els.notesSubtitle.textContent = "H × W class map";
            els.notesTutorial.innerHTML = `<p>渲染层只读取统一 semantic mask：<code>source, width, height, classMap, classes, distribution, meta</code>。</p>`;
            els.notes.innerHTML = `<dl><div><dt>mask 尺寸</dt><dd>${mask ? `${mask.height} × ${mask.width}` : "--"}</dd></div><div><dt>类别数量</dt><dd>${mask?.classes?.length || "--"}</dd></div><div><dt>最大占比类别</dt><dd>${topInfo ? `${esc(label(topInfo))} ${(top.ratio * 100).toFixed(1)}%` : "--"}</dd></div><div><dt>类别分布</dt><dd>${mask?.distribution?.filter((item) => item.count > 0).slice(0, 4).map((item) => `${label(classById(mask, item.id))}: ${(item.ratio * 100).toFixed(1)}%`).join(" / ") || "--"}</dd></div><div><dt>当前输出结构</dt><dd>H × W class index map</dd></div></dl>`;
        } else {
            els.notesTitle.textContent = "Image";
            els.notesSubtitle.textContent = "H×W×3 input";
            els.notesTutorial.innerHTML = `<p>默认进入预设 mask 模式。切换到前端模型推理后，点击加载模型才会读取本地 SegFormer 文件。</p>`;
            els.notes.innerHTML = `<dl><div><dt>Source</dt><dd>${mask?.source === "model" ? "Frontend Model" : "Preset Mask"}</dd></div><div><dt>图像尺寸</dt><dd>${s ? `${s.width} × ${s.height}` : "--"}</dd></div></dl>`;
        }
    }

    function sampler(mask) {
        const key = `${state.sampleId}:${mask.width}:${mask.height}:${els.image.currentSrc}`;
        if (state.sampler && state.samplerKey === key) return state.sampler;
        const canvas = document.createElement("canvas");
        canvas.width = mask.width;
        canvas.height = mask.height;
        const samplerCtx = canvas.getContext("2d", {willReadFrequently: true});
        samplerCtx.drawImage(els.image, 0, 0, mask.width, mask.height);
        state.sampler = samplerCtx;
        state.samplerKey = key;
        return samplerCtx;
    }

    function probe(event) {
        const mask = state.currentMask;
        if (!mask) return;
        const rect = els.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            els.probe.innerHTML = `<strong>像素探针</strong><span>canvas 坐标映射异常</span>`;
            return;
        }
        const x = Math.max(0, Math.min(mask.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * mask.width)));
        const y = Math.max(0, Math.min(mask.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * mask.height)));
        const index = y * mask.width + x;
        const id = mask.classMap[index];
        const info = id !== UNKNOWN ? classById(mask, id) : null;
        let rgb = "--";
        try {
            const pixel = sampler(mask).getImageData(x, y, 1, 1).data;
            rgb = `${pixel[0]}, ${pixel[1]}, ${pixel[2]}`;
        } catch (error) {
            rgb = "读取失败";
        }
        const score = mask.scoreMap?.[index];
        state.probeInfo = {x, y, rgb, classId: info ? info.id : "--", className: info ? label(info) : "未命中", score: Number.isFinite(score) ? score.toFixed(3) : "--", color: info?.color || "#94a3b8"};
        els.probe.innerHTML = `<strong>像素探针</strong><span>Pixel (x, y): ${x}, ${y}</span><span>RGB: ${esc(rgb)}</span><span>Class ID: ${esc(state.probeInfo.classId)}</span><span>Class Name: ${esc(state.probeInfo.className)}</span><span>Probability / score: ${esc(state.probeInfo.score)}</span>`;
        renderNotes();
    }

    function clearProbe() {
        state.probeInfo = null;
        els.probe.innerHTML = `<strong>像素探针</strong><span>移动鼠标读取 Pixel、RGB、Class ID、Class Name 和 score。</span>`;
        renderNotes();
    }

    function renderAll(resetClasses = false) {
        renderImage();
        activateMask(currentUsableMask(), resetClasses);
        setPhase(state.currentMask?.source === "model" ? "overlay" : "image");
    }

    fetch(`${dataRoot}/semantic_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            els.sample.innerHTML = data.samples.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
            els.sample.value = state.sampleId;
            renderSourceButtons();
            renderAll(true);
            clearProbe();
        })
        .catch(() => {
            els.probe.innerHTML = `<strong>样例数据加载失败</strong>`;
        });

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        state.probeInfo = null;
        if (state.selectedSource === "model" && state.modelMask?.sampleId !== state.sampleId) {
            setModelStatus(state.modelStatus, "当前样例尚未运行模型，暂显示预设 mask。");
        }
        renderAll(true);
        clearProbe();
    });

    els.sourceButtons.forEach((button) => {
        button.addEventListener("click", () => {
            state.selectedSource = button.dataset.semSource;
            renderSourceButtons();
            if (state.selectedSource === "preset") {
                switchToPreset();
                return;
            }
            setPhase(state.modelStatus === "已加载" || state.modelStatus === "推理完成" ? "inference" : "image");
            const mask = currentUsableMask();
            activateMask(mask, mask.source !== state.currentMask?.source);
            if (mask.source === "preset") setModelStatus(state.modelStatus, state.modelError || "请点击“加载模型”，再运行语义分割。");
        });
    });

    els.modes.forEach((button) => button.addEventListener("click", () => {
        state.mode = button.dataset.semMode;
        els.modes.forEach((node) => node.classList.toggle("is-active", node === button));
        draw();
    }));
    els.opacity.addEventListener("input", () => {
        state.opacity = Number(els.opacity.value) / 100;
        els.opacityOut.textContent = `${els.opacity.value}%`;
        draw();
    });
    els.boundaries.addEventListener("change", () => {
        state.boundaries = els.boundaries.checked;
        draw();
    });
    els.backend.addEventListener("change", () => {
        state.inferenceClient?.dispose?.();
        state.inferenceClient = null;
        state.inferenceModule = null;
        state.modelInfo = null;
        state.activeBackend = "--";
        setModelStatus("未加载", "推理后端已切换，请重新加载模型。");
        renderRuntime();
    });
    els.loadModel.addEventListener("click", loadModel);
    els.runModel.addEventListener("click", runModel);
    els.usePreset.addEventListener("click", () => switchToPreset());
    els.stage.addEventListener("mousemove", probe);
    els.stage.addEventListener("mouseleave", clearProbe);
    els.image.addEventListener("error", () => {
        els.missing.textContent = "图像加载失败，请检查静态资源。";
        setModelStatus(state.modelStatus, "图像加载失败，无法运行真实模型推理。");
    });
}());
