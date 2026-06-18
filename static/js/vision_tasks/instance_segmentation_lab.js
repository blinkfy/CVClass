(function () {
    const root = document.querySelector("[data-instance-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/instance_inference.js?v=20260618-yoloseg1");
    const requiredModelFiles = ["yolo11n-seg.onnx", "labels_coco.json", "model_config.json"];
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const COLORS = ["#2563EB", "#F97316", "#22C55E", "#8B5CF6", "#EAB308", "#EC4899", "#06B6D4", "#EF4444", "#14B8A6"];

    const state = {
        data: null,
        sampleId: "",
        selectedId: null,
        opacity: 0.55,
        showMask: true,
        showBox: true,
        showId: true,
        onlySelected: false,
        view: "instance",
        sourceMode: "model",
        phase: "image",
        presetScenes: new Map(),
        modelScene: null,
        currentScene: null,
        modelStatus: "未加载",
        modelInfo: null,
        activeBackend: "--",
        modelError: "",
        inferenceModule: null,
        inferenceClient: null,
        busy: false,
        customUrl: null,
        autoToken: 0
    };

    const els = {
        sample: $("[data-inst-sample]"),
        upload: $("[data-inst-upload]"),
        uploadName: $("[data-inst-upload-name]"),
        sourceButtons: $$("[data-inst-source]"),
        image: $("[data-inst-image]"),
        missing: $("[data-inst-missing]"),
        stage: $("[data-inst-stage]"),
        canvas: $("[data-inst-mask-canvas]"),
        svg: $("[data-inst-svg]"),
        map: $("[data-inst-map]"),
        list: $("[data-inst-list]"),
        stats: $("[data-inst-stats]"),
        opacity: $("[data-inst-opacity]"),
        opacityOut: $("[data-inst-opacity-output]"),
        showMask: $("[data-inst-show-mask]"),
        showBox: $("[data-inst-show-box]"),
        showId: $("[data-inst-show-id]"),
        onlySelected: $("[data-inst-only-selected]"),
        viewButtons: $$("[data-inst-view]"),
        backend: $("[data-inst-backend]"),
        loadModel: $("[data-inst-load-model]"),
        runModel: $("[data-inst-run-model]"),
        usePreset: $("[data-inst-use-preset]"),
        modelStatus: $("[data-inst-model-status]"),
        modelMessage: $("[data-inst-model-message]"),
        activeBackend: $("[data-inst-active-backend]"),
        inputSize: $("[data-inst-input-size]"),
        inferenceTime: $("[data-inst-inference-time]"),
        postprocessTime: $("[data-inst-postprocess-time]"),
        count: $("[data-inst-count]"),
        stripSource: $("[data-inst-strip-source]"),
        stripModel: $("[data-inst-strip-model]"),
        stripBackend: $("[data-inst-strip-backend]"),
        stripInference: $("[data-inst-strip-inference]"),
        stripPostprocess: $("[data-inst-strip-postprocess]"),
        stripCount: $("[data-inst-strip-count]"),
        notesTitle: $("[data-inst-notes-title]"),
        notesSubtitle: $("[data-inst-notes-subtitle]"),
        notesTutorial: $("[data-inst-notes-tutorial]"),
        notes: $("[data-inst-notes]"),
        stepperItems: [...document.querySelectorAll("[data-inst-stepper] [data-inst-phase]")],
        flowItems: $$("[data-inst-flow-phase]")
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

    function polygonArea(poly = []) {
        let area = 0;
        for (let i = 0; i < poly.length; i += 1) {
            const [x1, y1] = poly[i];
            const [x2, y2] = poly[(i + 1) % poly.length];
            area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area / 2);
    }

    function contourLength(poly = []) {
        return poly.reduce((sum, point, index) => {
            const next = poly[(index + 1) % poly.length];
            return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
        }, 0);
    }

    function bboxArea(bbox = [0, 0, 0, 0]) {
        return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
    }

    function normalizeInstance(item, index, source) {
        const bbox = (item.bbox || [0, 0, 0, 0]).map((value) => Math.round(Number(value) || 0));
        const boxArea = Number.isFinite(item.boxArea) ? item.boxArea : bboxArea(bbox);
        const poly = Array.isArray(item.polygon) ? item.polygon : [];
        const maskArea = Number.isFinite(item.maskArea) ? item.maskArea : polygonArea(poly);
        const center = item.center || [Math.round((bbox[0] + bbox[2]) / 2), Math.round((bbox[1] + bbox[3]) / 2)];
        return {
            id: Number(item.id ?? index + 1),
            classId: Number(item.classId ?? index),
            className: item.className || item.class || `instance_${index + 1}`,
            class: item.className || item.class || `instance_${index + 1}`,
            score: Number(item.score ?? 1),
            bbox,
            mask: item.mask || null,
            polygon: poly,
            color: item.color || COLORS[index % COLORS.length],
            maskArea,
            boxArea,
            maskBoxRatio: boxArea > 0 ? maskArea / boxArea : 0,
            center,
            contourLength: Number.isFinite(item.contourLength) ? item.contourLength : contourLength(poly),
            source,
            maskDecodeFailed: Boolean(item.maskDecodeFailed)
        };
    }

    function buildPresetScene(s) {
        if (state.presetScenes.has(s.id)) return state.presetScenes.get(s.id);
        const scene = {
            id: s.id,
            name: s.name,
            image: s.image,
            width: s.width,
            height: s.height,
            source: "preset",
            maskAP: s.maskAP,
            instances: (s.instances || []).map((item, index) => normalizeInstance(item, index, "preset")),
            semantic_regions: s.semantic_regions || [],
            meta: {
                modelName: "Preset Instance Data",
                backend: "preset",
                inputSize: `${s.width} × ${s.height}`,
                rawOutputShape: "preset polygon instances",
                decodedBoxesCount: s.instances?.length || 0,
                confidenceFilteredCount: s.instances?.length || 0,
                nmsKeptCount: s.instances?.length || 0,
                maskPrototypeShape: "--",
                preprocessTime: 0,
                inferenceTime: null,
                postprocessTime: 0
            }
        };
        state.presetScenes.set(s.id, scene);
        return scene;
    }

    function presetScene() {
        return buildPresetScene(sample());
    }

    function currentScene() {
        if (state.sourceMode === "model" && state.modelScene) return state.modelScene;
        return presetScene();
    }

    function selectedInstance() {
        const scene = state.currentScene;
        if (!scene?.instances?.length) return null;
        return scene.instances.find((item) => item.id === state.selectedId) || scene.instances[0];
    }

    function setPhase(phase) {
        state.phase = phase;
        els.stepperItems.forEach((item) => item.classList.toggle("is-active", item.dataset.instPhase === phase));
        els.flowItems.forEach((item) => item.classList.toggle("is-active", item.dataset.instFlowPhase === phase));
        renderNotes();
    }

    function setModelStatus(status, message) {
        state.modelStatus = status;
        els.modelStatus.textContent = status;
        if (message) els.modelMessage.textContent = message;
    }

    function setBusy(busy) {
        state.busy = busy;
        if (els.loadModel) {
            els.loadModel.disabled = busy;
            els.loadModel.classList.toggle("is-loading", busy);
        }
        if (els.runModel) {
            els.runModel.disabled = busy;
            els.runModel.classList.toggle("is-loading", busy);
        }
        if (els.backend) {
            els.backend.disabled = busy;
        }
    }

    function nextAutoToken() {
        state.autoToken += 1;
        return state.autoToken;
    }

    function isAutoTokenCurrent(token) {
        return token === state.autoToken;
    }

    function renderSourceButtons() {
        if (Array.isArray(els.sourceButtons)) {
            els.sourceButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.instSource === state.sourceMode));
        }
    }

    function activateScene(scene, resetSelected = false) {
        state.currentScene = scene;
        if (resetSelected || !scene.instances.some((item) => item.id === state.selectedId)) {
            state.selectedId = scene.instances[0]?.id ?? null;
        }
        renderRuntime();
        renderImage();
        render();
    }

    function renderControls() {
        els.sample.innerHTML = state.data.samples.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
        els.sample.value = state.sampleId;
    }

    function renderImage() {
        const scene = state.currentScene;
        if (!scene) return;
        els.image.src = scene.image.startsWith("blob:") ? scene.image : window.cvclassUrl(scene.image);
        els.missing.textContent = scene.image.startsWith("blob:") ? "上传图像读取失败" : `请放入 ${scene.image.split("/").pop()}`;
        els.stage.style.setProperty("--inst-aspect", `${Math.max(1, scene.width)} / ${Math.max(1, scene.height)}`);
    }

    function renderRuntime() {
        const scene = state.currentScene;
        const meta = scene?.meta || {};
        els.map.textContent = scene?.source === "preset" ? `Mask AP ${((scene.maskAP || 0) * 100).toFixed(1)}%` : "Model Instances";
        els.activeBackend.textContent = state.activeBackend && state.activeBackend !== "--" ? state.activeBackend : (meta.backend || "--");
        els.inputSize.textContent = meta.inputSize || state.modelInfo?.inputSizeText || "640 × 640";
        els.inferenceTime.textContent = fmtMs(meta.inferenceTime);
        els.postprocessTime.textContent = fmtMs(meta.postprocessTime);
        els.count.textContent = String(scene?.instances?.length ?? "--");
        els.stripSource.textContent = scene?.source === "model" ? "Frontend Model" : "Preset Data";
        els.stripModel.textContent = meta.modelName || "--";
        els.stripBackend.textContent = meta.backend || state.activeBackend || "--";
        els.stripInference.textContent = fmtMs(meta.inferenceTime);
        els.stripPostprocess.textContent = fmtMs(meta.postprocessTime);
        els.stripCount.textContent = String(scene?.instances?.length ?? "--");
    }

    function visibleInstances() {
        const scene = state.currentScene;
        if (!scene) return [];
        const selected = selectedInstance();
        if (state.onlySelected && selected && state.view === "instance") return scene.instances.filter((item) => item.id === selected.id);
        return scene.instances;
    }

    function pointInPolygon(x, y, poly = []) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            const intersect = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function parseColor(hex) {
        const value = String(hex || "#2563eb").replace("#", "");
        const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value.padEnd(6, "0").slice(0, 6);
        return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
    }

    function drawMaskBitmap(scene, items) {
        els.canvas.width = scene.width;
        els.canvas.height = scene.height;
        ctx.clearRect(0, 0, scene.width, scene.height);
        if (!state.showMask) return;
        if (state.view === "semantic" && scene.semantic_regions?.length) {
            scene.semantic_regions.forEach((region) => {
                ctx.beginPath();
                region.polygon.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
                ctx.closePath();
                ctx.fillStyle = region.color || "#2563eb";
                ctx.globalAlpha = state.opacity;
                ctx.fill();
                ctx.globalAlpha = 1;
            });
            return;
        }
        const selected = selectedInstance();
        items.forEach((item) => {
            const selectedBoost = item.id === selected?.id ? 0.14 : 0;
            const alpha = Math.max(0.1, Math.min(0.92, state.opacity + selectedBoost));
            if (item.mask?.data) {
                const imageData = ctx.getImageData(0, 0, scene.width, scene.height);
                const out = imageData.data;
                const [r, g, b] = parseColor(item.color);
                const mask = item.mask.data;
                for (let i = 0; i < mask.length; i += 1) {
                    if (!mask[i]) continue;
                    const p = i * 4;
                    out[p] = r;
                    out[p + 1] = g;
                    out[p + 2] = b;
                    out[p + 3] = Math.round(alpha * 255);
                }
                ctx.putImageData(imageData, 0, 0);
            } else if (item.polygon?.length) {
                ctx.beginPath();
                item.polygon.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
                ctx.closePath();
                ctx.fillStyle = item.color;
                ctx.globalAlpha = alpha;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        });
    }

    function percentBox(bbox, scene) {
        return {
            x: (bbox[0] / scene.width) * 100,
            y: (bbox[1] / scene.height) * 100,
            w: ((bbox[2] - bbox[0]) / scene.width) * 100,
            h: ((bbox[3] - bbox[1]) / scene.height) * 100
        };
    }

    function renderSvg() {
        const scene = state.currentScene;
        if (!scene) return;
        const selected = selectedInstance();
        const items = visibleInstances();
        const boxMarkup = state.showBox && state.view === "instance" ? items.map((item) => {
            const rect = percentBox(item.bbox, scene);
            return `<rect class="instance-svg-bbox ${item.id === selected?.id ? "is-selected" : ""}" data-inst-hit="${item.id}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="none" stroke="${esc(item.color)}" stroke-width="1.6" vector-effect="non-scaling-stroke"></rect>`;
        }).join("") : "";
        const labelMarkup = state.showId && state.view === "instance" ? items.map((item) => {
            const [x1, y1] = item.bbox;
            return `<text class="instance-svg-label" data-inst-hit="${item.id}" x="${(x1 / scene.width) * 100}" y="${Math.max(4, (y1 / scene.height) * 100 - 1)}">ID ${item.id} · ${esc(item.className)} · ${item.score.toFixed(2)}</text>`;
        }).join("") : "";
        const hitMarkup = items.filter((item) => item.polygon?.length).map((item) => {
            const points = item.polygon.map(([x, y]) => `${(x / scene.width) * 100},${(y / scene.height) * 100}`).join(" ");
            return `<polygon class="instance-hit-poly" data-inst-hit="${item.id}" points="${points}" fill="transparent" stroke="transparent"></polygon>`;
        }).join("");
        els.svg.innerHTML = hitMarkup + boxMarkup + labelMarkup;
    }

    function renderList() {
        const scene = state.currentScene;
        if (!scene) return;
        if (!scene.instances.length) {
            els.list.innerHTML = `<div class="vision-empty-result">当前暂无实例结果</div>`;
            return;
        }
        els.list.innerHTML = scene.instances.map((item) => `
            <button class="${item.id === state.selectedId ? "is-active" : ""}" type="button" data-inst-id="${item.id}">
                <i style="background:${esc(item.color)}"></i>
                <span><strong>#${item.id} ${esc(item.className)}</strong><small>score ${item.score.toFixed(2)} · area ${Math.round(item.maskArea).toLocaleString()}</small></span>
            </button>`).join("");
        els.list.querySelectorAll("[data-inst-id]").forEach((button) => {
            button.addEventListener("click", () => {
                state.selectedId = Number(button.dataset.instId);
                render();
            });
        });
    }

    function renderStats() {
        const item = selectedInstance();
        if (!item) {
            els.stats.innerHTML = `<div class="vision-empty-result">暂无可选实例</div>`;
            return;
        }
        els.stats.innerHTML = `
            <div class="instance-preview-swatch" style="--instance-color:${esc(item.color)}">#${item.id}</div>
            <div class="instance-stats-grid">
                <div><span>Instance ID</span><strong>${item.id}</strong></div>
                <div><span>Class</span><strong>${esc(item.className)}</strong></div>
                <div><span>Score</span><strong>${item.score.toFixed(3)}</strong></div>
                <div><span>BBox</span><strong>[${item.bbox.join(", ")}]</strong></div>
                <div><span>Box Area</span><strong>${Math.round(item.boxArea).toLocaleString()} px</strong></div>
                <div><span>Mask Area</span><strong>${Math.round(item.maskArea).toLocaleString()} px</strong></div>
                <div><span>Mask / Box Ratio</span><strong>${item.maskBoxRatio.toFixed(3)}</strong></div>
                <div><span>Center</span><strong>(${item.center.join(", ")})</strong></div>
                <div><span>Contour Length</span><strong>${Math.round(item.contourLength).toLocaleString()} px</strong></div>
            </div>`;
    }

    function renderNotes() {
        const scene = state.currentScene;
        const meta = scene?.meta || {};
        const selected = selectedInstance();
        const raw = meta.rawOutputShape ? JSON.stringify(meta.rawOutputShape) : "--";
        const proto = Array.isArray(meta.maskPrototypeShape) ? `[${meta.maskPrototypeShape.join(", ")}]` : (meta.maskPrototypeShape || "--");
        const phaseText = {
            image: ["Image / Preprocess", "载入当前样例或上传图像，预设模式不会触发模型加载。"],
            preprocess: ["Image / Preprocess", "letterbox resize 到 640×640，RGB normalize，并完成 HWC 到 CHW。"],
            inference: ["Model Inference", "ONNX Runtime Web 在浏览器端执行 YOLO11n-seg 前向推理。"],
            decode: ["Decode Boxes", "从 output0 解码 bbox、class scores 与 mask coefficients。"],
            nms: ["Confidence Filter / NMS", "按置信度过滤候选框，再对同类框执行 IoU NMS。"],
            prototype: ["Mask Prototype", "使用 mask coefficients 线性组合 prototype masks。"],
            masks: ["Instance Masks", "resize 回原图、按 bbox crop、threshold 成二值 mask 并统计几何属性。"]
        }[state.phase] || ["Process Notes", "实例分割流程"];
        els.notesTitle.textContent = phaseText[0];
        els.notesSubtitle.textContent = selected ? `#${selected.id} ${selected.className}` : "Instance Statistics";
        els.notesTutorial.innerHTML = `<p>${phaseText[1]}</p>`;
        els.notes.innerHTML = `<dl>
            <div><dt>raw output shape</dt><dd>${esc(raw)}</dd></div>
            <div><dt>decoded boxes count</dt><dd>${meta.decodedBoxesCount ?? scene?.instances?.length ?? "--"}</dd></div>
            <div><dt>confidence filtered count</dt><dd>${meta.confidenceFilteredCount ?? scene?.instances?.length ?? "--"}</dd></div>
            <div><dt>NMS kept count</dt><dd>${meta.nmsKeptCount ?? scene?.instances?.length ?? "--"}</dd></div>
            <div><dt>mask prototype shape</dt><dd>${esc(proto)}</dd></div>
            <div><dt>selected class / score</dt><dd>${selected ? `${esc(selected.className)} / ${selected.score.toFixed(3)}` : "--"}</dd></div>
            <div><dt>selected bbox</dt><dd>${selected ? `[${selected.bbox.join(", ")}]` : "--"}</dd></div>
            <div><dt>area / contour / center</dt><dd>${selected ? `${Math.round(selected.maskArea)} px / ${Math.round(selected.contourLength)} / (${selected.center.join(", ")})` : "--"}</dd></div>
            <div><dt>输出结构</dt><dd>N × {bbox, class, score, mask, instance_id}</dd></div>
        </dl>`;
    }

    function render() {
        const scene = state.currentScene;
        if (!scene) return;
        els.opacityOut.textContent = `${els.opacity.value}%`;
        els.viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.instView === state.view));
        const items = visibleInstances();
        drawMaskBitmap(scene, items);
        renderSvg();
        renderList();
        renderStats();
        renderRuntime();
        renderNotes();
    }

    function findHitInstance(clientX, clientY) {
        const scene = state.currentScene;
        if (!scene) return null;
        const rect = els.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = Math.max(0, Math.min(scene.width - 1, Math.floor(((clientX - rect.left) / rect.width) * scene.width)));
        const y = Math.max(0, Math.min(scene.height - 1, Math.floor(((clientY - rect.top) / rect.height) * scene.height)));
        const items = visibleInstances().slice().reverse();
        return items.find((item) => {
            if (item.mask?.data) return Boolean(item.mask.data[y * scene.width + x]);
            if (item.polygon?.length) return pointInPolygon(x, y, item.polygon);
            return x >= item.bbox[0] && x <= item.bbox[2] && y >= item.bbox[1] && y <= item.bbox[3];
        });
    }

    async function fetchHeadOrGet(url) {
        let response = await fetch(url, {method: "HEAD", cache: "no-store"});
        if (response.status === 405 || response.status === 501) response = await fetch(url, {cache: "no-store"});
        return response.ok;
    }

    async function checkModelFiles() {
        const missing = [];
        for (const file of requiredModelFiles) {
            const ok = await fetchHeadOrGet(window.cvclassUrl(`/static/assets/data/instance/${file}`)).catch(() => false);
            if (!ok) missing.push(file);
        }
        return missing;
    }

    async function getInferenceClient() {
        if (state.inferenceClient) return state.inferenceClient;
        state.inferenceModule = await import(inferenceModuleUrl);
        state.inferenceClient = state.inferenceModule.createInstanceInferenceClient();
        return state.inferenceClient;
    }

    function formatError(error) {
        const shape = error?.rawOutputShape ? ` rawOutputShape=${JSON.stringify(error.rawOutputShape)}` : "";
        return `${error?.message || "实例分割推理失败"}${shape}`;
    }

    function waitForImage(image) {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                image.removeEventListener("load", onLoad);
                image.removeEventListener("error", onError);
            };
            const onLoad = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error("图像加载失败，无法运行实例分割。")); };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    async function loadModel() {
        if (state.busy) return false;
        state.sourceMode = "model";
        renderSourceButtons();
        setBusy(true);
        setPhase("preprocess");
        setModelStatus("加载中", "正在检查 static/assets/data/instance 下的模型文件...");
        try {
            const missing = await checkModelFiles();
            if (missing.length) {
                const message = `模型文件未安装，请切回预设模式。缺失：${missing.join(", ")}`;
                state.modelError = message;
                state.activeBackend = "--";
                setModelStatus("加载失败", message);
                return false;
            }
            setModelStatus("加载中", "正在加载 YOLO11n-seg ONNX 模型...");
            const info = await (await getInferenceClient()).loadInstanceModel({backend: els.backend.value});
            state.modelInfo = {...info, inputSizeText: `${info.inputSize} × ${info.inputSize}`};
            state.activeBackend = info.backend;
            setModelStatus("已加载", info.backend === "wasm" && els.backend.value === "webgpu" ? "WebGPU 不可用或加载失败，已自动回退 WASM。" : "模型已加载，可以运行实例分割。");
            setPhase("inference");
            renderRuntime();
            return true;
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            state.activeBackend = "--";
            setModelStatus("加载失败", `${message} 已保留预设结果。`);
            state.sourceMode = "preset";
            renderSourceButtons();
            activateScene(presetScene(), true);
            setPhase("image");
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function runModel() {
        if (state.busy) return false;
        state.sourceMode = "model";
        renderSourceButtons();
        if (state.modelStatus !== "已加载" && state.modelStatus !== "推理完成") {
            setModelStatus(state.modelStatus, "请先加载模型。");
            setPhase("image");
            return false;
        }
        setBusy(true);
        try {
            await waitForImage(els.image);
            setModelStatus("推理中", "正在执行 letterbox / normalize / CHW 预处理...");
            setPhase("preprocess");
            await new Promise((resolve) => setTimeout(resolve, 100));
            setPhase("inference");
            const result = await (await getInferenceClient()).runInstanceInference(els.image);
            setPhase("decode");
            await new Promise((resolve) => setTimeout(resolve, 80));
            setPhase("nms");
            await new Promise((resolve) => setTimeout(resolve, 80));
            setPhase("prototype");
            const baseScene = state.currentScene || presetScene();
            const modelScene = {
                id: "model_result",
                name: `${baseScene.name || "Uploaded"} · YOLO11n-seg`,
                image: baseScene.image,
                width: result.width,
                height: result.height,
                source: "model",
                maskAP: null,
                instances: (result.instances || []).map((item, index) => normalizeInstance(item, index, "model")),
                semantic_regions: [],
                meta: result.meta || {}
            };
            state.modelScene = modelScene;
            setModelStatus("推理完成", `实例分割完成：保留 ${modelScene.instances.length} 个实例。`);
            activateScene(modelScene, true);
            setPhase("masks");
            return true;
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            setModelStatus("加载失败", `${message} 已切回预设模式。`);
            state.sourceMode = "preset";
            renderSourceButtons();
            activateScene(presetScene(), true);
            setPhase("image");
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function autoLoadAndRun(reason = "auto") {
        if (!state.data) return;
        const token = nextAutoToken();
        state.sourceMode = "model";
        renderSourceButtons();
        if (!state.modelScene || reason === "sample" || reason === "backend") {
            activateScene(reason === "upload" && state.modelScene ? state.modelScene : presetScene(), true);
        }
        const pendingStatus = (state.modelStatus === "已加载" || state.modelStatus === "推理完成") ? "已加载" : "加载中";
        setModelStatus(pendingStatus, "正在自动加载并运行前端模型；预设结果仅作为 fallback。");
        try {
            if (state.modelStatus !== "已加载" && state.modelStatus !== "推理完成") {
                const loaded = await loadModel();
                if (!isAutoTokenCurrent(token) || !loaded) return;
            }
            if (!isAutoTokenCurrent(token)) return;
            await runModel();
        } catch (error) {
            if (!isAutoTokenCurrent(token)) return;
            const message = formatError(error);
            state.modelError = message;
            setModelStatus("加载失败", `${message} 已切回预设 fallback。`);
            state.sourceMode = "preset";
            renderSourceButtons();
            activateScene(presetScene(), true);
            setPhase("image");
        }
    }

    function switchToPreset() {
        state.sourceMode = "preset";
        renderSourceButtons();
        setModelStatus(state.modelStatus, "已切回预设实例数据。");
        activateScene(presetScene(), true);
        setPhase("image");
    }

    function setUploadImage(file) {
        if (!file) return;
        if (state.customUrl) URL.revokeObjectURL(state.customUrl);
        const url = URL.createObjectURL(file);
        state.customUrl = url;
        const image = new Image();
        image.onload = () => {
            const scene = {
                id: "uploaded_image",
                name: file.name,
                image: url,
                width: image.naturalWidth,
                height: image.naturalHeight,
                source: "model",
                maskAP: null,
                instances: [],
                semantic_regions: [],
                meta: {modelName: "YOLO11n-seg", backend: state.activeBackend || "--", inputSize: "640 × 640"}
            };
            state.modelScene = scene;
            state.sourceMode = "model";
            state.selectedId = null;
            els.uploadName.textContent = file.name;
            renderSourceButtons();
            activateScene(scene, true);
            setModelStatus(state.modelStatus, "已载入上传图片，正在自动运行实例分割。");
            setPhase("image");
            autoLoadAndRun("upload");
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            if (state.customUrl === url) state.customUrl = null;
            setModelStatus(state.modelStatus, "上传图片读取失败。");
        };
        image.src = url;
    }

    fetch(`${dataRoot}/instance_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            renderControls();
            renderSourceButtons();
            activateScene(presetScene(), true);
            setPhase("image");
            autoLoadAndRun("initial");
        })
        .catch(() => {
            els.stats.innerHTML = `<div class="vision-empty-result">实例样例数据加载失败</div>`;
        });

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        state.sourceMode = "model";
        state.modelScene = null;
        renderSourceButtons();
        activateScene(presetScene(), true);
        setPhase("image");
        autoLoadAndRun("sample");
    });
    els.upload.addEventListener("change", () => setUploadImage(els.upload.files?.[0]));
    if (Array.isArray(els.sourceButtons)) {
        els.sourceButtons.forEach((button) => button.addEventListener("click", () => {
            state.sourceMode = button.dataset.instSource;
            renderSourceButtons();
            nextAutoToken();
            if (state.sourceMode === "preset") {
                switchToPreset();
            } else {
                activateScene(currentScene(), false);
                setModelStatus(state.modelStatus, state.modelScene?.instances?.length ? "当前显示模型推理结果。" : "正在自动加载并运行前端模型。");
                autoLoadAndRun("source");
            }
        }));
    }
    els.opacity.addEventListener("input", () => { state.opacity = Number(els.opacity.value) / 100; render(); });
    els.showMask.addEventListener("change", () => { state.showMask = els.showMask.checked; render(); });
    els.showBox.addEventListener("change", () => { state.showBox = els.showBox.checked; render(); });
    els.showId.addEventListener("change", () => { state.showId = els.showId.checked; render(); });
    els.onlySelected.addEventListener("change", () => { state.onlySelected = els.onlySelected.checked; render(); });
    els.viewButtons.forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.instView; render(); }));
    els.backend.addEventListener("change", () => {
        nextAutoToken();
        state.inferenceClient?.dispose?.();
        state.inferenceClient = null;
        state.inferenceModule = null;
        state.modelInfo = null;
        state.activeBackend = "--";
        state.modelScene = null;
        state.sourceMode = "model";
        renderSourceButtons();
        setModelStatus("未加载", "推理后端已切换，请重新加载模型。");
        activateScene(presetScene(), true);
        renderRuntime();
        autoLoadAndRun("backend");
    });
    if (els.loadModel) {
        els.loadModel.addEventListener("click", () => {
            nextAutoToken();
            loadModel();
        });
    }
    if (els.runModel) {
        els.runModel.addEventListener("click", () => {
            nextAutoToken();
            runModel();
        });
    }
    if (els.usePreset) {
        els.usePreset.addEventListener("click", () => {
            nextAutoToken();
            switchToPreset();
        });
    }
    els.svg.addEventListener("click", (event) => {
        if (state.view !== "instance") return;
        const target = event.target.closest("[data-inst-hit]");
        if (!target) return;
        state.selectedId = Number(target.dataset.instHit);
        render();
    });
    els.stage.addEventListener("click", (event) => {
        if (state.view !== "instance") return;
        const target = event.target.closest("[data-inst-hit]");
        if (target) return;
        const hit = findHitInstance(event.clientX, event.clientY);
        if (!hit) return;
        state.selectedId = hit.id;
        render();
    });
}());
