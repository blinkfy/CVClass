(function () {
    const root = document.querySelector("[data-semantic-lab]");
    if (!root) return;

    const UNKNOWN = 65535;
    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const modelBaseUrl = window.cvclassUrl("/static/assets/data/segformer_b0_ade/");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/semantic_inference.js?v=20260618-pure-wasm");
    const requiredModelFiles = ["config.json", "preprocessor_config.json", "quantize_config.json", "model_quantized.onnx"];
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];

    const state = {
        data: null,
        sampleId: "",
        selectedSource: "model",
        mode: "overlay",
        opacity: 0.65,
        boundaries: true,
        enabled: new Set(),
        presetMasks: new Map(),
        modelMask: null,
        fcnMask: null,
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
        fcnClassId: null,
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
        modelStatus: $("[data-sem-model-status]"),
        modelMessage: $("[data-sem-model-message]"),
        inputSize: $("[data-sem-input-size]"),
        classCount: $("[data-sem-class-count]"),
        inferenceTime: $("[data-sem-inference-time]"),
        postprocessTime: $("[data-sem-postprocess-time]"),
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
        stripInference: $("[data-sem-strip-inference]"),
        stripPostprocess: $("[data-sem-strip-postprocess]"),
        stripMask: $("[data-sem-strip-mask]"),
        stripClasses: $("[data-sem-strip-classes]"),
        stepperItems: [...document.querySelectorAll("[data-sem-stepper] [data-sem-phase]")],
        flowItems: $$("[data-flow-phase]"),
        fcnDemo: $("[data-sem-fcn-demo]"),
        fcnStages: $$("[data-fcn-stage]"),
        fcnChannelStack: $("[data-fcn-channel-stack]"),
        fcnUpsample: $("[data-fcn-upsample]"),
        fcnSkipCompare: $("[data-fcn-skip-compare]"),
        fcnNotesPanel: $("[data-fcn-notes-panel]"),
        fcnLogits: $("[data-fcn-logits]"),
        fcnMiouTable: $("[data-fcn-miou-table]")
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

    function buildFcnMiouRows(classes) {
        return classes.slice(0, 6).map((item, index) => {
            const intersection = 520 - index * 38;
            const union = intersection + 115 + index * 29;
            return {
                id: Number(item.id),
                className: label(item),
                color: item.color,
                intersection,
                union,
                iou: intersection / union
            };
        });
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

    function buildFcnMask() {
        const base = presetMask();
        const classMap = new Uint16Array(base.classMap);
        const scoreMap = new Float32Array(base.scoreMap || base.classMap.length);
        const counts = new Map();
        for (let i = 0; i < classMap.length; i += 1) {
            const id = classMap[i];
            if (id !== UNKNOWN) {
                counts.set(id, (counts.get(id) || 0) + 1);
                if (!scoreMap[i]) scoreMap[i] = 0.72 + ((i % 17) / 100);
            }
        }
        const classes = base.classes.map((item) => ({...item}));
        const mask = {
            source: "fcn",
            sampleId: state.sampleId,
            width: base.width,
            height: base.height,
            classMap,
            scoreMap,
            classes,
            distribution: buildDistribution(classes, counts, base.width * base.height),
            meta: {
                modelName: "FCN Principle Demo",
                backend: "preset feature maps",
                inputSize: `${base.width} × ${base.height}`,
                rawOutputShape: `[1, ${classes.length}, ${Math.ceil(base.height / 32)}, ${Math.ceil(base.width / 32)}] logits`,
                rawOutputSummary: "Backbone feature map -> 1×1 conv logits -> upsample -> skip fusion -> argmax classMap",
                preprocessTime: 0,
                inferenceTime: null,
                postprocessTime: 0,
                classCount: classes.length,
                miouRows: buildFcnMiouRows(classes)
            }
        };
        state.fcnMask = mask;
        return mask;
    }

    function fcnMask() {
        return state.fcnMask?.sampleId === state.sampleId ? state.fcnMask : buildFcnMask();
    }

    function currentUsableMask() {
        if (state.selectedSource === "fcn") return fcnMask();
        if (state.selectedSource === "model" && state.modelMask?.sampleId === state.sampleId) return state.modelMask;
        return presetMask();
    }

    function setPhase(phase) {
        state.phase = phase;
        els.stepperItems.forEach((item) => item.classList.toggle("is-active", item.dataset.semPhase === phase));
        els.flowItems.forEach((item) => item.classList.toggle("is-active", item.dataset.flowPhase === phase));
        els.fcnStages.forEach((item) => item.classList.toggle("is-active", item.dataset.fcnStage === phase));
        renderNotes();
    }

    function setModelStatus(status, message) {
        state.modelStatus = status;
        els.modelStatus.textContent = status;
        if (message) els.modelMessage.textContent = message;
    }

    function setBusy(busy) {
        state.busy = busy;
    }

    function fallbackToPreset(message = "加载/推理失败，已自动降级为预设 Mask。") {
        state.selectedSource = "preset";
        setPhase("overlay");
        setModelStatus(state.modelStatus, message);
        activateMask(presetMask(), true);
    }

    function renderRuntime() {
        const mask = state.currentMask;
        const meta = mask?.meta || {};
        els.inputSize.textContent = meta.inputSize || state.modelInfo?.inputSizeText || "512 × 512";
        els.classCount.textContent = String(meta.classCount || state.modelInfo?.classCount || mask?.classes?.length || "--");
        els.inferenceTime.textContent = fmtMs(meta.inferenceTime);
        els.postprocessTime.textContent = fmtMs(meta.postprocessTime);
        els.stripSource.textContent = mask?.source === "model" ? "Frontend Model" : mask?.source === "fcn" ? "FCN Principle Demo" : "Preset Mask";
        els.stripModel.textContent = meta.modelName || "--";
        els.stripInference.textContent = fmtMs(meta.inferenceTime);
        els.stripPostprocess.textContent = fmtMs(meta.postprocessTime);
        els.stripMask.textContent = mask ? `${mask.height} × ${mask.width}` : "--";
        els.stripClasses.textContent = String(mask?.classes?.length || "--");
        els.miou.textContent = mask?.source === "preset" ? `mIoU ${((sample()?.miou || 0) * 100).toFixed(1)}%` : mask?.source === "fcn" ? `mIoU ${fcnMeanIoU(mask).toFixed(1)}%` : "Model Mask";
        updateSourceButtons();
        renderFcnVisibility();
    }

    function fcnMeanIoU(mask) {
        const rows = mask?.meta?.miouRows || [];
        if (!rows.length) return (sample()?.miou || 0) * 100;
        return rows.reduce((sum, row) => sum + row.iou, 0) / rows.length * 100;
    }

    function updateSourceButtons() {
        els.sourceButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.semSource === state.selectedSource);
        });
    }

    function renderFcnVisibility() {
        const isFcn = state.selectedSource === "fcn";
        if (els.fcnDemo) els.fcnDemo.hidden = !isFcn;
        if (els.fcnNotesPanel) els.fcnNotesPanel.hidden = !isFcn;
        if (isFcn) renderFcnDemo();
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

    function renderFcnDemo() {
        const mask = state.currentMask?.source === "fcn" ? state.currentMask : null;
        if (!mask) return;
        const rows = mask.meta?.miouRows || [];
        const selected = state.fcnClassId ?? rows[0]?.id;
        state.fcnClassId = selected;
        const selectedInfo = classById(mask, selected) || mask.classes[0];
        const selectedColor = selectedInfo?.color || "#2563eb";
        if (els.fcnChannelStack) {
            els.fcnChannelStack.innerHTML = `
                <div class="fcn-feature-cube"><span>Backbone</span>${Array.from({length: 6}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <b>1×1</b>
                <div class="fcn-logit-cube"><span>${mask.classes.length} class logits</span>${mask.classes.slice(0, 6).map((item) => `<i style="background:${esc(item.color)}"></i>`).join("")}</div>
            `;
        }
        if (els.fcnUpsample) {
            els.fcnUpsample.innerHTML = `
                <div class="fcn-lowres-grid">${Array.from({length: 16}, (_, i) => `<i style="background:${esc(mask.classes[i % mask.classes.length]?.color || "#2563eb")}"></i>`).join("")}</div>
                <b>×32</b>
                <div class="fcn-highres-grid">${Array.from({length: 64}, (_, i) => `<i style="background:${esc(mask.classes[(i + Math.floor(i / 8)) % mask.classes.length]?.color || "#2563eb")}"></i>`).join("")}</div>
            `;
        }
        if (els.fcnSkipCompare) {
            els.fcnSkipCompare.innerHTML = `
                <div class="fcn-skip-tile is-coarse"><strong>without skip</strong><span style="background:${esc(selectedColor)}"></span></div>
                <div class="fcn-skip-plus">+</div>
                <div class="fcn-skip-tile is-fine"><strong>with skip</strong><span style="background:${esc(selectedColor)}"></span></div>
            `;
        }
        if (els.fcnLogits) {
            const classIndex = mask.classes.findIndex((item) => Number(item.id) === Number(selected));
            const safeIndex = Math.max(0, classIndex);
            const logits = [0.1, 0.2, 0.7].map((v, i) => i === 2 ? 0.62 + safeIndex * 0.03 : v).map((v) => v.toFixed(2));
            els.fcnLogits.textContent = `pixel(h,w): [${logits.join(", ")}] → class=${selected}`;
        }
        if (els.fcnMiouTable) {
            els.fcnMiouTable.innerHTML = `
                <div class="semantic-miou-head"><span>class</span><span>intersection</span><span>union</span><span>IoU</span></div>
                ${rows.map((row) => `
                    <button type="button" class="${Number(row.id) === Number(selected) ? "is-active" : ""}" data-fcn-miou-class="${row.id}">
                        <span><i style="background:${esc(row.color)}"></i>${esc(row.className)}</span>
                        <span>${row.intersection}</span>
                        <span>${row.union}</span>
                        <strong>${row.iou.toFixed(3)}</strong>
                    </button>
                `).join("")}
            `;
            els.fcnMiouTable.querySelectorAll("[data-fcn-miou-class]").forEach((button) => {
                button.addEventListener("click", () => {
                    state.fcnClassId = Number(button.dataset.fcnMiouClass);
                    setPhase("miou");
                    renderFcnDemo();
                    renderNotes();
                });
            });
        }
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
        setBusy(true);
        setPhase("preprocess");
        setModelStatus("加载中", "正在检查本地模型文件...");
        try {
            const missing = await checkModelFiles();
            if (missing.length) {
                const message = `模型文件未完全准备好，已自动为您使用预设 mask。缺失文件：${missing.join(", ")}`;
                state.modelError = message;
                state.activeBackend = "--";
                setModelStatus("加载失败", message);
                renderRuntime();
                fallbackToPreset(message);
                return;
            }
            setModelStatus("加载中", "正在加载 SegFormer-B0 本地 ONNX 模型...");
            const client = await getInferenceClient();
            const info = await client.loadSemanticModel({modelBaseUrl});
            state.modelInfo = {...info, inputSizeText: `${info.inputSize.width} × ${info.inputSize.height}`};
            state.activeBackend = info.backend;
            state.modelError = "";
            setModelStatus("已加载", "模型已加载。");
            renderRuntime();
            setPhase("inference");
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            state.activeBackend = "--";
            setModelStatus("加载失败", message);
            renderRuntime();
            fallbackToPreset(`加载失败：${message}`);
        } finally {
            setBusy(false);
        }
    }

    async function runModel() {
        if (state.busy) return;
        state.selectedSource = "model";
        if (state.modelStatus !== "已加载" && state.modelStatus !== "推理完成") {
            await loadModel();
            if (state.modelStatus !== "已加载") return;
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
            setModelStatus("推理完成", `语义分割推理完成。`);
            setPhase("mask");
            activateMask(result, true);
            setPhase("overlay");
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            setModelStatus("加载失败", `${message}`);
            fallbackToPreset(`推理失败：${message}`);
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
        if (state.selectedSource === "fcn") {
            const rows = mask?.meta?.miouRows || [];
            const selected = rows.find((row) => Number(row.id) === Number(state.fcnClassId)) || rows[0];
            const phaseCopy = {
                image: ["Semantic Segmentation = Pixel-wise Classification", "每个像素输出一个 class id，最终得到 H × W class index map。"],
                feature: ["Patch-wise 分类的问题", "滑窗 patch 分类重复计算多、局部信息有限，且不是端到端 dense prediction。"],
                conv: ["FCN 关键点 1：卷积替换全连接", "1×1 Conv 将每个空间位置的特征通道映射到 C 个类别 logits。"],
                heatmap: ["低分辨率 heatmap", "深层特征语义强但空间分辨率低，类别热图边界通常比较粗。"],
                upsample: ["FCN 关键点 2：上采样 / 反卷积", "通过 deconvolution 或双线性插值把低分辨率 heatmap 放大回原图尺寸。"],
                skip: ["FCN 关键点 3：跳跃连接", "浅层特征定位准，深层特征语义强，融合后边界更精细。"],
                argmax: ["logits → argmax", "对每个像素执行 argmax_c logits[c,h,w]，得到最终 class id。"],
                miou: ["mIoU 公式", "IoU_c = intersection_c / union_c，mIoU 是所有类别 IoU 的平均。"]
            };
            const [title, desc] = phaseCopy[state.phase] || phaseCopy.image;
            els.notesTitle.textContent = "FCN 原理演示";
            els.notesSubtitle.textContent = title;
            els.notesTutorial.innerHTML = `<p>${desc}</p>`;
            els.notes.innerHTML = `<dl><div><dt>当前阶段</dt><dd>${esc(state.phase)}</dd></div><div><dt>逐像素分类</dt><dd>H × W pixels → H × W class ids</dd></div><div><dt>1×1 Conv 输出</dt><dd>${mask?.classes?.length || "--"} 个类别通道</dd></div><div><dt>Skip Connection</dt><dd>coarse semantic + fine boundary</dd></div><div><dt>当前类别 IoU</dt><dd>${selected ? `${esc(selected.className)}: ${selected.intersection}/${selected.union} = ${selected.iou.toFixed(3)}` : "--"}</dd></div><div><dt>mIoU</dt><dd>${mask ? `${fcnMeanIoU(mask).toFixed(1)}%` : "--"}</dd></div></dl>`;
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
            els.notesTutorial.innerHTML = `<p>SegFormer-B0 在浏览器端由于量化模型原因，使用稳定的 WASM 后端执行前向计算。</p>`;
            els.notes.innerHTML = `<dl><div><dt>模型名称</dt><dd>SegFormer-B0 Semantic Segmentation</dd></div><div><dt>推理后端</dt><dd>WASM</dd></div><div><dt>推理耗时</dt><dd>${fmtMs(meta.inferenceTime)}</dd></div><div><dt>输出结构摘要</dt><dd>${esc(meta.rawOutputSummary || "等待模型输出")}</dd></div></dl>`;
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
            els.notesTutorial.innerHTML = `<p>默认进入预设 mask 模式。切换到前端模型推理后，会自动加载本地 SegFormer 模型并完成推理。</p>`;
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
        if (state.currentMask?.source === "fcn") {
            setPhase("image");
        } else {
            setPhase(state.currentMask?.source === "model" ? "miou" : "image");
        }
    }

    fetch(`${dataRoot}/semantic_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            els.sample.innerHTML = data.samples.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
            els.sample.value = state.sampleId;
            renderAll(true);
            clearProbe();
            // 自动运行或加载模型推理
            if (state.selectedSource === "model") runModel();
        })
        .catch(() => {
            els.probe.innerHTML = `<strong>样例数据加载失败</strong>`;
        });

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        state.probeInfo = null;
        renderAll(true);
        clearProbe();
        // 自动完成对新样例的运行
        state.fcnMask = null;
        if (state.selectedSource === "model") runModel();
    });

    els.sourceButtons.forEach((button) => button.addEventListener("click", () => {
        state.selectedSource = button.dataset.semSource;
        state.probeInfo = null;
        clearProbe();
        if (state.selectedSource === "model") {
            renderAll(true);
            runModel();
            return;
        }
        renderAll(true);
    }));

    els.fcnStages.forEach((item) => item.addEventListener("click", () => {
        if (state.selectedSource !== "fcn") return;
        setPhase(item.dataset.fcnStage);
    }));

    els.stepperItems.forEach((item) => item.addEventListener("click", () => {
        if (state.selectedSource !== "fcn") return;
        setPhase(item.dataset.semPhase);
    }));

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
    els.stage.addEventListener("mousemove", probe);
    els.stage.addEventListener("mouseleave", clearProbe);
    els.image.addEventListener("error", () => {
        els.missing.textContent = "图像加载失败，请检查静态资源。";
        setModelStatus(state.modelStatus, "图像加载失败，无法运行真实模型推理。");
    });

    // ==========================================================================
    // IoU (交并比) 算法教学微型交互模拟器控制逻辑
    // ==========================================================================
    const iouSlider = document.querySelector("[data-toy-slider]");
    const iouPredBox = document.querySelector("[data-toy-pred]");
    const iouInterBox = document.querySelector("[data-toy-intersection]");
    const iouOffText = document.querySelector("[data-toy-offset-text]");
    const iouMathInter = document.querySelector("[data-toy-math-inter]");
    const iouMathUnion = document.querySelector("[data-toy-math-union]");
    const iouMathFormula = document.querySelector("[data-toy-formula]");

    function updateIoUToy() {
        if (!iouSlider || !iouPredBox || !iouInterBox) return;
        const val = Number(iouSlider.value); // 0 到 100 的偏移百分比值
        
        // 映射设定：
        // GT 固定于 left = 50px ($50), width = 60px ($60) [区间 50 ~ 110]
        // Pred 固定于 width = 60px ($60)；left 随 value 增加从左向右平移 (偏移范围 0px 到 100px)
        const offsetPx = (val / 100) * 100;
        const gtLeft = 50;
        const gtWidth = 60;
        const predWidth = 60;
        const predLeft = gtLeft + offsetPx;
        
        // 更新 Pred 盒子的 UI 坐标
        iouPredBox.style.left = `${predLeft}px`;
        
        // 计算重叠宽度
        const overlapLeft = Math.max(gtLeft, predLeft);
        const overlapRight = Math.min(gtLeft + gtWidth, predLeft + predWidth);
        const overlapWidth = Math.max(0, overlapRight - overlapLeft);
        
        // 计算面积 (高度统一定为 54px)
        const height = 54;
        const gtArea = gtWidth * height; // 3240
        const predArea = predWidth * height; // 3240
        
        const intersectionArea = overlapWidth * height;
        const unionArea = gtArea + predArea - intersectionArea;
        const iou = unionArea > 0 ? (intersectionArea / unionArea) : 0;
        
        // 更新 Overlap 盒子的 UI
        if (overlapWidth > 0) {
            iouInterBox.style.display = "flex";
            iouInterBox.style.left = `${overlapLeft}px`;
            iouInterBox.style.width = `${overlapWidth}px`;
        } else {
            iouInterBox.style.display = "none";
        }
        
        // 更新文本数据及渲染公式
        iouOffText.textContent = `${val}%`;
        iouMathInter.textContent = `${intersectionArea.toFixed(0)} px²`;
        iouMathUnion.textContent = `${unionArea.toFixed(0)} px²`;
        
        if (iouMathFormula) {
            if (window.katex) {
                try {
                    window.katex.render(`\\text{IoU} = \\frac{|\\text{GT} \\cap \\text{Pred}|}{|\\text{GT} \\cup \\text{Pred}|} = \\frac{${intersectionArea.toFixed(0)}}{${unionArea.toFixed(0)}} \\approx ${iou.toFixed(3)}`, iouMathFormula, {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (e) {
                    iouMathFormula.innerHTML = `$$IoU = \\frac{|GT \\cap Pred|}{|GT \\cup Pred|} = \\frac{${intersectionArea.toFixed(0)}}{${unionArea.toFixed(0)}} \\approx ${iou.toFixed(3)}$$`;
                }
            } else {
                iouMathFormula.innerHTML = `$$IoU = \\frac{|GT \\cap Pred|}{|GT \\cup Pred|} = \\frac{${intersectionArea.toFixed(0)}}{${unionArea.toFixed(0)}} \\approx ${iou.toFixed(3)}$$`;
            }
        }
    }

    if (iouSlider) {
        iouSlider.addEventListener("input", updateIoUToy);
        // 初始化计算一次
        updateIoUToy();
    }
}());
