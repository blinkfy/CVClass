(function () {
    const root = document.querySelector("[data-instance-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const moduleDataRoot = window.CVClassVisionTasks?.moduleDataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/instance_inference.js");
    const requiredModelFiles = ["yolo11n-seg.onnx", "labels_coco.json", "model_config.json"];
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const initialParams = new URLSearchParams(window.location.search);
    const initialView = ["instance", "semantic"].includes(initialParams.get("view")) ? initialParams.get("view") : "instance";
    const initialSource = initialView === "semantic" ? "preset" : ["preset", "model", "maskrcnn", "roiAlign", "maskMetric"].includes(initialParams.get("source")) ? initialParams.get("source") : "model";
    const COLORS = ["#2563EB", "#F97316", "#22C55E", "#8B5CF6", "#EAB308", "#EC4899", "#06B6D4", "#EF4444", "#14B8A6"];

    const state = {
        data: null,
        maskRcnnData: null,
        sampleId: "",
        selectedId: null,
        opacity: 0.55,
        showMask: true,
        showBox: true,
        showId: true,
        onlySelected: false,
        view: initialView,
        sourceMode: initialSource,
        phase: "image",
        maskRcnnStep: 0,
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
        comparePage: $("[data-inst-compare-page]"),
        canvas: $("[data-inst-mask-canvas]"),
        svg: $("[data-inst-svg]"),
        maskRcnnDemo: $("[data-inst-maskrcnn-demo]"),
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
        stepper: document.querySelector("[data-inst-stepper]"),
        flow: $("[data-inst-flow]"),
        stepperItems: [...document.querySelectorAll("[data-inst-stepper] [data-inst-phase]")],
        flowItems: $$("[data-inst-flow-phase]"),
        interactiveDeck: $(".instance-interactive-deck"),
        blenderContainer: $("[data-inst-blender-container]"),
        blenderPlayBtn: $("[data-inst-blender-play-btn]"),
        blenderCanvas: $("[data-inst-blender-canvas]"),
        blenderOverlayText: $("[data-inst-blender-overlay-text]"),
        blenderGrid: $("[data-inst-blender-grid]")
    };
    const ctx = els.canvas.getContext("2d", {willReadFrequently: true});

    const yoloSteps = [
        {id: "image", title: "Image", detail: "Current / Uploaded"},
        {id: "preprocess", title: "Preprocess", detail: "Letterbox + CHW"},
        {id: "inference", title: "Model Inference", detail: "ONNX Runtime Web"},
        {id: "decode", title: "Decode Boxes", detail: "scores + coeffs"},
        {id: "nms", title: "NMS", detail: "IoU suppression"},
        {id: "prototype", title: "Mask Prototype", detail: "coeff × proto"},
        {id: "masks", title: "Instance Masks", detail: "crop + statistics"}
    ];

    const maskRcnnSteps = [
        {id: "image", title: "Image", detail: "input image"},
        {id: "fpn", title: "Backbone + FPN", detail: "P2 / P3 / P4 / P5"},
        {id: "rpn", title: "RPN Proposals", detail: "class-agnostic boxes"},
        {id: "roiAlign", title: "ROI Align", detail: "bilinear sampling"},
        {id: "heads", title: "Class / BBox Head", detail: "parallel branch"},
        {id: "maskHead", title: "Mask Head", detail: "K × 28 × 28 logits"},
        {id: "instances", title: "Instance Masks", detail: "per-instance binary"},
        {id: "maskIou", title: "Mask IoU", detail: "Mask AP threshold"}
    ];

    function isMaskRcnnMode() {
        return ["maskrcnn", "roiAlign", "maskMetric"].includes(state.sourceMode);
    }

    function isCompareView() {
        return state.view === "semantic";
    }

    function activeSteps() {
        if (isCompareView()) {
            return [
                {id: "semantic", title: "Semantic Mask", detail: "H×W class map"},
                {id: "instance", title: "Instance Mask", detail: "per-object id"},
                {id: "schema", title: "Output Schema", detail: "map vs set"},
                {id: "metric", title: "Metrics", detail: "mIoU / Mask AP"},
            ];
        }
        return isMaskRcnnMode() ? maskRcnnSteps : yoloSteps;
    }

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function fmtMs(value) {
        return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "--";
    }

    function setProcessSteps(activeId = state.phase) {
        const steps = activeSteps();
        if (els.stepper) {
            els.stepper.innerHTML = steps.map((step, index) => `
                <li class="${step.id === activeId ? "is-active" : ""}" data-inst-phase="${esc(step.id)}">
                    <span>${index + 1}</span><div><strong>${esc(step.title)}</strong><small>${esc(step.detail)}</small></div>
                </li>
            `).join("");
            els.stepperItems = [...els.stepper.querySelectorAll("[data-inst-phase]")];
            els.stepperItems.forEach((item, index) => {
                item.addEventListener("click", () => {
                    if (!isMaskRcnnMode()) return;
                    state.maskRcnnStep = index;
                    setPhase(item.dataset.instPhase);
                    render();
                });
            });
        }
        if (els.flow) {
            els.flow.innerHTML = steps.map((step, index) => `
                ${index ? "<b>→</b>" : ""}
                <div class="${step.id === activeId ? "is-active" : ""}" data-inst-flow-phase="${esc(step.id)}">
                    <strong>${esc(step.title)}</strong><span>${esc(step.detail)}</span>
                </div>
            `).join("");
            els.flowItems = [...els.flow.querySelectorAll("[data-inst-flow-phase]")];
        }
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
            maskDecodeFailed: Boolean(item.maskDecodeFailed),
            coeffs: item.coeffs || null
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
        setProcessSteps(phase);
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
        const metric = state.maskRcnnData?.metricSummary;
        els.map.textContent = isMaskRcnnMode() ? `Mask AP ${((metric?.maskAP || 0) * 100).toFixed(1)}%` : scene?.source === "preset" ? `Mask AP ${((scene.maskAP || 0) * 100).toFixed(1)}%` : "Model Instances";
        els.activeBackend.textContent = state.activeBackend && state.activeBackend !== "--" ? state.activeBackend : (meta.backend || "--");
        els.inputSize.textContent = meta.inputSize || state.modelInfo?.inputSizeText || "640 × 640";
        els.inferenceTime.textContent = fmtMs(meta.inferenceTime);
        els.postprocessTime.textContent = fmtMs(meta.postprocessTime);
        els.count.textContent = String(scene?.instances?.length ?? "--");
        els.stripSource.textContent = isMaskRcnnMode() ? "Mask R-CNN Mechanism" : scene?.source === "model" ? "Frontend Model" : "Preset Data";
        els.stripModel.textContent = isMaskRcnnMode() ? "Mask R-CNN" : (meta.modelName || "--");
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
        if (isCompareView()) {
            const palette = classPalette(scene);
            const rows = semanticClassRows(scene);
            els.list.innerHTML = rows.map((row) => `
                <button type="button" class="is-compare-row">
                    <i style="background:${esc(palette.get(row.className) || "#2563eb")}"></i>
                    <span><strong>${esc(row.className)}</strong><small>${row.count} instance(s) → one semantic class · area ${Math.round(row.area).toLocaleString()} px</small></span>
                </button>`).join("");
            return;
        }
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
        if (isCompareView()) {
            const scene = state.currentScene;
            const classes = new Map();
            (scene?.instances || []).forEach((item) => {
                const entry = classes.get(item.className) || {count: 0, area: 0};
                entry.count += 1;
                entry.area += item.maskArea || 0;
                classes.set(item.className, entry);
            });
            els.stats.innerHTML = `
                <div class="instance-compare-mini-schema">
                    <strong>Semantic</strong><span>${classes.size || "--"} classes · merged by class_id</span>
                    <strong>Instance</strong><span>${scene?.instances?.length || 0} masks · unique instance_id</span>
                </div>`;
            return;
        }
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

    function classPalette(scene) {
        const map = new Map();
        (scene.semantic_regions || []).forEach((region, index) => {
            map.set(region.class || region.className || `class_${index + 1}`, region.color || COLORS[index % COLORS.length]);
        });
        (scene.instances || []).forEach((item, index) => {
            if (!map.has(item.className)) map.set(item.className, COLORS[index % COLORS.length]);
        });
        return map;
    }

    function polygonPoints(poly = [], scene) {
        return poly.map(([x, y]) => `${(x / scene.width) * 100},${(y / scene.height) * 100}`).join(" ");
    }

    function semanticClassRows(scene) {
        const rows = new Map();
        (scene.instances || []).forEach((item) => {
            const row = rows.get(item.className) || {className: item.className, count: 0, area: 0};
            row.count += 1;
            row.area += item.maskArea || 0;
            rows.set(item.className, row);
        });
        (scene.semantic_regions || []).forEach((region) => {
            const className = region.class || region.className || "class";
            if (!rows.has(className)) rows.set(className, {className, count: 1, area: polygonArea(region.polygon || [])});
        });
        return [...rows.values()];
    }

    function renderCompareSvg(scene, type) {
        const palette = classPalette(scene);
        if (type === "semantic") {
            const instancePolys = (scene.instances || []).map((item) => `
                <polygon points="${polygonPoints(item.polygon || [], scene)}" fill="${esc(palette.get(item.className) || item.color)}" opacity=".48" stroke="#ffffff" stroke-width=".45" vector-effect="non-scaling-stroke"></polygon>
            `).join("");
            const extraRegions = (scene.semantic_regions || [])
                .filter((region) => !(scene.instances || []).some((item) => item.className === (region.class || region.className)))
                .map((region) => `<polygon points="${polygonPoints(region.polygon || [], scene)}" fill="${esc(region.color || palette.get(region.class) || "#2563eb")}" opacity=".34" stroke="#ffffff" stroke-width=".35" vector-effect="non-scaling-stroke"></polygon>`)
                .join("");
            const labels = semanticClassRows(scene).map((row, index) => `<text x="4" y="${8 + index * 7}" class="instance-compare-svg-label">${esc(row.className)}</text>`).join("");
            return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${extraRegions}${instancePolys}${labels}</svg>`;
        }
        const masks = (scene.instances || []).map((item) => `
            <polygon points="${polygonPoints(item.polygon || [], scene)}" fill="${esc(item.color)}" opacity=".46" stroke="#ffffff" stroke-width=".45" vector-effect="non-scaling-stroke"></polygon>
        `).join("");
        const boxes = (scene.instances || []).map((item) => {
            const rect = percentBox(item.bbox, scene);
            return `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="none" stroke="${esc(item.color)}" stroke-width=".8" vector-effect="non-scaling-stroke"></rect>
                <text x="${rect.x}" y="${Math.max(5, rect.y - 1)}" class="instance-compare-svg-label">#${item.id}</text>`;
        }).join("");
        return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${masks}${boxes}</svg>`;
    }

    function renderComparePage(scene) {
        if (!els.comparePage || !scene) return;
        const palette = classPalette(scene);
        const classRows = semanticClassRows(scene);
        const classLegend = classRows.map((row) => `
            <span><i style="background:${esc(palette.get(row.className) || "#2563eb")}"></i><b>${esc(row.className)}</b><em>${row.count > 1 ? `${row.count} instances merged` : "class region"}</em></span>
        `).join("");
        const instanceLegend = (scene.instances || []).map((item) => `
            <span><i style="background:${esc(item.color)}"></i><b>${esc(item.className)} #${item.id}</b><em>score ${item.score.toFixed(2)} · bbox [${item.bbox.join(", ")}]</em></span>
        `).join("");
        els.comparePage.hidden = false;
        els.comparePage.innerHTML = `
            <div class="instance-compare-grid">
                <section class="instance-compare-panel">
                    <header><span>Semantic Mask</span><strong>H × W class map</strong></header>
                    <div class="instance-compare-visual">
                        <img src="${scene.image.startsWith("blob:") ? scene.image : window.cvclassUrl(scene.image)}" alt="Semantic mask comparison">
                        ${renderCompareSvg(scene, "semantic")}
                    </div>
                    <div class="instance-compare-legend">${classLegend}</div>
                    <p>同一类别的目标共享 class_id / class_name；例如 person #1、#2、#3 都合并为 person 类别区域。</p>
                </section>
                <section class="instance-compare-panel">
                    <header><span>Instance Mask</span><strong>N independent masks</strong></header>
                    <div class="instance-compare-visual">
                        <img src="${scene.image.startsWith("blob:") ? scene.image : window.cvclassUrl(scene.image)}" alt="Instance mask comparison">
                        ${renderCompareSvg(scene, "instance")}
                    </div>
                    <div class="instance-compare-legend">${instanceLegend}</div>
                    <p>同类目标按 instance_id 分开，每个目标保留独立颜色、bbox、score 和可交互实例编号。</p>
                </section>
            </div>
            <div class="instance-output-compare-table">
                <article><h4>Semantic Segmentation</h4><code>H × W class map</code><span>metric: Pixel Accuracy / mIoU</span></article>
                <article><h4>Instance Segmentation</h4><code>N × {bbox, class, score, mask, instance_id}</code><span>metric: Mask IoU / Mask AP</span></article>
            </div>`;
    }

    function activeMaskRcnnStep() {
        const preferred = state.sourceMode === "roiAlign" ? "roiAlign" : state.sourceMode === "maskMetric" ? "maskIou" : null;
        if (preferred && state.phase !== preferred) {
            const index = maskRcnnSteps.findIndex((step) => step.id === preferred);
            state.maskRcnnStep = Math.max(0, index);
            state.phase = preferred;
        }
        state.maskRcnnStep = Math.max(0, Math.min(state.maskRcnnStep, maskRcnnSteps.length - 1));
        return maskRcnnSteps[state.maskRcnnStep] || maskRcnnSteps[0];
    }

    function heatGrid(values = [], className = "") {
        return `<div class="instance-heat-grid ${className}">${values.map((row) => row.map((value) => `<i style="--v:${Number(value) || 0}">${Number(value).toFixed(2)}</i>`).join("")).join("")}</div>`;
    }

    function maskGrid(values = []) {
        return `<div class="instance-binary-grid">${values.map((row) => row.map((value) => `<i class="${value ? "is-on" : ""}"></i>`).join("")).join("")}</div>`;
    }

    function renderMaskRcnnOverlay(demo, scene, step) {
        if (!scene || !els.svg) return;
        const proposals = demo.proposals || [];
        const overlay = proposals.map((proposal) => {
            const rect = percentBox(proposal.bbox, scene);
            const active = ["rpn", "roiAlign", "heads", "maskHead", "instances"].includes(step.id);
            return `<rect class="instance-maskrcnn-box ${active ? "is-active" : ""}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="none" stroke="${esc(proposal.color)}" stroke-width="1.7" vector-effect="non-scaling-stroke"></rect>
                <text class="instance-svg-label instance-maskrcnn-label" x="${rect.x}" y="${Math.max(4, rect.y - 1)}">${esc(proposal.id)} ${esc(proposal.level)}</text>`;
        }).join("");
        els.svg.innerHTML += overlay;
    }

    function renderFpnPanel(demo) {
        return `<div class="instance-fpn-levels">
            ${(demo.fpnLevels || []).map((level, index) => `
                <article class="${index <= state.maskRcnnStep ? "is-active" : ""}">
                    <strong>${esc(level.id)}</strong>
                    <span>stride ${level.stride} · ${esc(level.resolution)}</span>
                    <i style="height:${Math.round(level.activation * 58) + 18}px"></i>
                    <em>${esc(level.target)} · ${esc(level.role)}</em>
                </article>
            `).join("")}
        </div>`;
    }

    function renderMaskHeadPanel(demo) {
        const head = demo.maskHead || {};
        return `<div class="instance-mask-head-board">
            <section>
                <h4>Mask Head</h4>
                <div class="instance-head-flow">
                    <span>ROI feature<br>${esc(head.roiFeatureSize || "14 × 14 × 256")}</span>
                    <b>4 conv</b><b>upsample</b><b>1×1 conv</b>
                    <span>${esc(head.logitsShape || "K × 28 × 28")}</span>
                </div>
                <p>分类头、回归头、mask 分支并行；mask 分支为每个类别生成二值 mask logits。</p>
            </section>
            <section>
                <h4>K 类 mask logits</h4>
                ${heatGrid(head.logits || [])}
            </section>
            <section>
                <h4>当前类别 binary mask</h4>
                ${maskGrid(head.binaryMask || [])}
                <dl><div><dt>BCE target/prob</dt><dd>${head.bceExample?.target ?? "--"} / ${head.bceExample?.probability ?? "--"}</dd></div><div><dt>pixel-wise BCE</dt><dd>${head.bceExample?.loss ?? "--"}</dd></div></dl>
            </section>
        </div>`;
    }

    function renderRoiAlignPanel(demo) {
        const roi = demo.roiAlign || {};
        return `<div class="instance-roi-align-board">
            <section>
                <h4>ROI Pooling</h4>
                <div class="instance-roi-box is-pooling"><span>rounded ROI</span><code>[${(roi.poolingBox || []).join(", ")}]</code><i></i></div>
                <p>坐标取整后再分 bin，ROI 边界会发生偏移，细小实例的 mask 边界更容易错位。</p>
            </section>
            <section>
                <h4>ROI Align</h4>
                <div class="instance-roi-box is-align"><span>float ROI</span><code>[${(roi.roi?.floatBox || []).join(", ")}]</code><div>${(roi.samplePoints || []).map((point) => `<b style="left:${(point.x % 18) * 5 + 8}%;top:${(point.y % 18) * 4 + 8}%"></b>`).join("")}</div></div>
                <p>保留浮点坐标，用双线性插值采样，避免量化误差。</p>
            </section>
            <section>
                <h4>Sample points</h4>
                <dl>${(roi.samplePoints || []).slice(0, 6).map((point) => `<div><dt>${point.x.toFixed(2)}, ${point.y.toFixed(2)}</dt><dd>${point.value.toFixed(2)}</dd></div>`).join("")}</dl>
            </section>
        </div>`;
    }

    function renderMaskMetricPanel(demo) {
        const rows = demo.maskIouExamples || [];
        const summary = demo.metricSummary || {};
        return `<div class="instance-mask-metric-board">
            <section>
                <h4>Mask IoU = intersection / union</h4>
                <div class="instance-mask-overlap"><i class="pred"></i><i class="gt"></i><b></b></div>
                <p>Mask IoU 衡量像素级 mask 重叠，不等同于 bbox IoU。</p>
            </section>
            <section>
                <h4>Mask IoU / AP 阈值</h4>
                <div class="instance-mask-iou-table">
                    <div><span>class</span><span>inter</span><span>union</span><span>IoU</span><span>AP50</span></div>
                    ${rows.map((row) => `<button type="button" data-mask-iou-row="${esc(row.id)}"><span><i style="background:${esc(row.color)}"></i>${esc(row.class)}</span><span>${row.intersection}</span><span>${row.union}</span><strong>${row.iou.toFixed(3)}</strong><em>${row.ap50 ? "hit" : "miss"}</em></button>`).join("")}
                </div>
            </section>
            <section>
                <h4>Mask AP summary</h4>
                <dl><div><dt>AP50</dt><dd>${((summary.ap50 || 0) * 100).toFixed(1)}%</dd></div><div><dt>AP75</dt><dd>${((summary.ap75 || 0) * 100).toFixed(1)}%</dd></div><div><dt>Mask AP</dt><dd>${((summary.maskAP || 0) * 100).toFixed(1)}%</dd></div></dl>
            </section>
        </div>`;
    }

    function renderMaskRcnnDemo() {
        if (!els.maskRcnnDemo) return;
        const isDemo = isMaskRcnnMode();
        els.maskRcnnDemo.hidden = !isDemo;
        if (!isDemo) return;
        const demo = state.maskRcnnData || {};
        const step = activeMaskRcnnStep();
        setProcessSteps(step.id);
        if (!demo.version) {
            els.maskRcnnDemo.innerHTML = `<div class="vision-empty-result">Mask R-CNN demo data loading...</div>`;
            return;
        }
        const header = `<div class="instance-maskrcnn-pipeline">${maskRcnnSteps.map((item, index) => `<article class="${item.id === step.id ? "is-active" : ""}" data-maskrcnn-step="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span><i>${index + 1}</i></article>`).join("")}</div>`;
        let body = "";
        if (state.sourceMode === "roiAlign") body = renderRoiAlignPanel(demo);
        else if (state.sourceMode === "maskMetric") body = renderMaskMetricPanel(demo);
        else body = `<div class="instance-maskrcnn-grid"><section><h4>Backbone + FPN 多尺度特征</h4>${renderFpnPanel(demo)}</section><section><h4>RPN proposals</h4><div class="instance-proposal-list">${(demo.proposals || []).map((p) => `<span style="--c:${esc(p.color)}"><b>${esc(p.id)}</b>${esc(p.class)} · ${esc(p.level)} · ${p.score.toFixed(2)}</span>`).join("")}</div></section><section><h4>并行 heads</h4>${renderMaskHeadPanel(demo)}</section></div>`;
        els.maskRcnnDemo.innerHTML = header + body;
        els.maskRcnnDemo.querySelectorAll("[data-maskrcnn-step]").forEach((node, index) => {
            node.addEventListener("click", () => {
                state.maskRcnnStep = index;
                setPhase(node.dataset.maskrcnnStep);
                render();
            });
        });
    }

    function renderNotes() {
        if (isCompareView()) {
            const scene = state.currentScene || presetScene();
            const classCount = semanticClassRows(scene).length;
            els.notesTitle.textContent = "Semantic vs Instance";
            els.notesSubtitle.textContent = "Output Structure";
            els.notesTutorial.innerHTML = `
                <p>Semantic Mask 关注每个像素属于哪个类别；Instance Mask 进一步区分同一类别中的不同个体。语义分割适合场景理解，实例分割适合目标级计数、实例属性统计和交互选择。</p>
            `;
            els.notes.innerHTML = `<dl>
                <div><dt>Semantic Mask</dt><dd>每个像素输出 class_id / class_name，同类目标合并。</dd></div>
                <div><dt>Instance Mask</dt><dd>每个目标输出独立 mask、bbox、score 与 instance_id。</dd></div>
                <div><dt>类别数量</dt><dd>${classCount} semantic classes</dd></div>
                <div><dt>实例数量</dt><dd>${scene.instances?.length || 0} instance masks</dd></div>
                <div><dt>语义指标</dt><dd>Pixel Accuracy / mIoU</dd></div>
                <div><dt>实例指标</dt><dd>Mask IoU / Mask AP</dd></div>
                <div><dt>输出结构差异</dt><dd>H × W class map vs N × {bbox, class, score, mask, instance_id}</dd></div>
            </dl>`;
            return;
        }
        if (isMaskRcnnMode()) {
            const demo = state.maskRcnnData || {};
            const step = activeMaskRcnnStep();
            const summary = demo.metricSummary || {};
            const copy = {
                image: ["Mask R-CNN 机制", "实例分割 = 检测 + 每个实例的 mask。Mask R-CNN 先检测 proposal，再为每个 proposal 预测独立二值 mask。"],
                fpn: ["Backbone + FPN", "FPN 把高分辨率定位细节和低分辨率语义信息结合起来：小目标用 P2/P3，大目标用 P4/P5。"],
                rpn: ["RPN Proposals", "RPN 在 FPN feature map 上生成类别无关 proposals，替代传统 Selective Search。"],
                roiAlign: ["ROI Align", "ROI Align 保留浮点坐标并用双线性插值采样，避免 ROI Pooling 坐标取整造成的边界偏移。"],
                heads: ["Class / BBox Head", "分类头输出类别概率，回归头修正 bbox；mask 分支与它们并行。"],
                maskHead: ["Mask Head", "Mask Head 经过 4 层卷积、上采样和 1×1 conv 得到 K 类 mask logits，再取当前类别对应 binary mask。"],
                instances: ["Instance Masks", "每个 detection 都有独立 mask，因此同类相邻目标不会像语义分割那样合并成一个区域。"],
                maskIou: ["Mask IoU / Mask AP", "Mask IoU 使用像素交并比；AP50 表示 IoU ≥ 0.5 记为命中，Mask AP 是多个阈值下的平均。"]
            }[step.id] || ["Mask R-CNN", "实例分割机制演示"];
            els.notesTitle.textContent = copy[0];
            els.notesSubtitle.textContent = step.title;
            els.notesTutorial.innerHTML = `<p>${copy[1]}</p>`;
            els.notes.innerHTML = `<dl>
                <div><dt>当前模式</dt><dd>${state.sourceMode === "roiAlign" ? "ROI Align 对比" : state.sourceMode === "maskMetric" ? "Mask IoU / Mask AP" : "Mask R-CNN 机制"}</dd></div>
                <div><dt>FPN levels</dt><dd>${(demo.fpnLevels || []).map((level) => level.id).join(" / ") || "--"}</dd></div>
                <div><dt>proposals</dt><dd>${demo.proposals?.length ?? "--"}</dd></div>
                <div><dt>ROI Align</dt><dd>${demo.roiAlign?.roi?.featureLevel || "--"} float ROI</dd></div>
                <div><dt>Mask Head</dt><dd>${demo.maskHead?.roiFeatureSize || "--"} → ${demo.maskHead?.logitsShape || "--"}</dd></div>
                <div><dt>Mask AP</dt><dd>${Number.isFinite(summary.maskAP) ? `${(summary.maskAP * 100).toFixed(1)}%` : "--"}</dd></div>
                <div><dt>Mask IoU vs bbox IoU</dt><dd>${esc(summary.bboxIouContrast || "pixel overlap vs rectangle overlap")}</dd></div>
            </dl>`;
            return;
        }
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
        if (isCompareView()) {
            state.sourceMode = "preset";
            state.currentScene = presetScene();
        }
        const scene = state.currentScene;
        if (!scene) return;
        els.opacityOut.textContent = `${els.opacity.value}%`;
        els.viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.instView === state.view));
        renderSourceButtons();
        if (isCompareView()) {
            if (els.stage) els.stage.hidden = true;
            if (els.flow) els.flow.hidden = true;
            if (els.interactiveDeck) els.interactiveDeck.hidden = true;
            if (els.maskRcnnDemo) els.maskRcnnDemo.hidden = true;
            if (els.stepper) els.stepper.hidden = false;
            setProcessSteps("schema");
            renderRuntime();
            renderImage();
            renderComparePage(scene);
            renderList();
            renderStats();
            renderNotes();
            return;
        }
        if (els.stage) els.stage.hidden = false;
        if (els.comparePage) els.comparePage.hidden = true;
        if (els.flow) els.flow.hidden = false;
        if (els.interactiveDeck) els.interactiveDeck.hidden = false;
        if (els.stepper) els.stepper.hidden = false;
        const items = visibleInstances();
        drawMaskBitmap(scene, items);
        renderSvg();
        if (isMaskRcnnMode()) renderMaskRcnnOverlay(state.maskRcnnData || {}, scene, activeMaskRcnnStep());
        renderList();
        renderStats();
        renderRuntime();
        renderNotes();
        renderMaskRcnnDemo();
        if (els.blenderContainer) els.blenderContainer.hidden = isMaskRcnnMode();
        if (!isMaskRcnnMode()) renderBlender();
    }

    // ==========================================
    // YOLO11n-seg 原理融合演示 (Prototype Blender)
    // ==========================================
    let blenderAnimationTimer = null;
    let blenderAnimationActive = false;

    function sigmoid(value) {
        return 1 / (1 + Math.exp(-value));
    }

    function renderBlender() {
        if (blenderAnimationTimer) {
            clearTimeout(blenderAnimationTimer);
            blenderAnimationTimer = null;
        }
        blenderAnimationActive = false;
        
        if (els.blenderCanvas && els.blenderCanvas.parentNode) {
            els.blenderCanvas.parentNode.classList.remove("blending");
        }

        const scene = state.currentScene;
        const item = selectedInstance();
        
        if (!els.blenderPlayBtn || !els.blenderOverlayText || !els.blenderGrid) return;

        if (!scene || !item) {
            els.blenderPlayBtn.disabled = true;
            els.blenderOverlayText.classList.remove("hidden");
            els.blenderOverlayText.textContent = "未激活实例。请在左列表点击实例或在图上点击物体使其被选中";
            els.blenderGrid.innerHTML = `<div class="blender-channel-placeholder">等待激活实例检测特征层...</div>`;
            return;
        }

        els.blenderPlayBtn.disabled = false;
        els.blenderOverlayText.classList.add("hidden");

        // 提取或虚拟 coefficients
        let coeffs = item.coeffs;
        let isSimulated = false;

        if (!coeffs || coeffs.length === 0) {
            isSimulated = true;
            coeffs = [];
            for (let i = 0; i < 32; i++) {
                coeffs.push((Math.sin(item.id * 1.7 + i * 2.1) * 0.12));
            }
            // 设计两个强正值，一个强负值，对应关键特征表达
            coeffs[2] = 0.85;  
            coeffs[5] = -0.72; 
            coeffs[7] = 0.58;  
            if (item.classId % 2 === 0) {
                coeffs[14] = 0.64;
                coeffs[22] = -0.55;
            } else {
                coeffs[11] = 0.76;
                coeffs[19] = 0.61;
            }
        }

        // 获取或虚拟 prototype data ( Float32Array 32x160x160 )
        let protoData = null;
        let protoWidth = 160;
        let protoHeight = 160;

        if (scene.prototypes?.data && scene.prototypes?.dims) {
            protoData = scene.prototypes.data;
            const dims = scene.prototypes.dims; 
            if (dims.length === 4) {
                if (dims[1] === 32) {
                    protoWidth = dims[3];
                    protoHeight = dims[2];
                } else if (dims[3] === 32) {
                    protoWidth = dims[2];
                    protoHeight = dims[1];
                }
            }
        }

        if (!protoData) {
            isSimulated = true;
            protoData = new Float32Array(32 * protoWidth * protoHeight);
            
            const [bx1, by1, bx2, by2] = item.bbox;
            const px1 = Math.round((bx1 / scene.width) * protoWidth);
            const py1 = Math.round((by1 / scene.height) * protoHeight);
            const px2 = Math.round((bx2 / scene.width) * protoWidth);
            const py2 = Math.round((by2 / scene.height) * protoHeight);
            const pcx = (px1 + px2) / 2;
            const pcy = (py1 + py2) / 2;
            const pw = Math.max(1, px2 - px1);
            const ph = Math.max(1, py2 - py1);

            for (let k = 0; k < 32; k++) {
                const offset = k * protoWidth * protoHeight;
                const mode = k % 5;
                for (let y = 0; y < protoHeight; y++) {
                    for (let x = 0; x < protoWidth; x++) {
                        const idx = offset + y * protoWidth + x;
                        const inBox = x >= px1 && x <= px2 && y >= py1 && y <= py2;
                        
                        let val = 0;
                        if (mode === 0) {
                            if (inBox) {
                                const dx = (x - pcx) / (pw / 2);
                                const dy = (y - pcy) / (ph / 2);
                                val = Math.max(0, 1.2 - (dx * dx + dy * dy) * 0.5);
                            }
                        } else if (mode === 1) {
                            if (inBox) {
                                const dx = Math.abs(x - pcx) / (pw / 2);
                                const dy = Math.abs(y - pcy) / (ph / 2);
                                val = Math.exp(-Math.pow(Math.max(dx, dy) - 0.88, 2) * 25) * 1.1;
                            }
                        } else if (mode === 2) {
                            if (inBox) {
                                val = y < pcy ? 0.95 : 0.05;
                            }
                        } else if (mode === 3) {
                            if (!inBox) {
                                val = 0.45 + Math.sin(x * 0.15) * Math.cos(y * 0.15) * 0.2;
                            }
                        } else {
                            val = Math.sin(x * 0.3 + k) * Math.cos(y * 0.3 - k) * 0.4;
                            if (inBox) val += 0.25;
                        }
                        
                        val += (Math.random() - 0.5) * 0.08;
                        protoData[idx] = Math.max(-2, Math.min(2, val));
                    }
                }
            }
        }

        // 排序挑选前 8 个主要活跃通道
        const indexedCoeffs = coeffs.map((coeff, idx) => ({ idx, coeff }));
        indexedCoeffs.sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));
        const activeChannels = indexedCoeffs.slice(0, 8);

        // 渲染活跃通道 UI 网格
        const colorHex = item.color || "#2563eb";
        els.blenderGrid.innerHTML = activeChannels.map(({ idx, coeff }) => {
            const isPos = coeff >= 0;
            const absCoeff = Math.abs(coeff);
            const pct = Math.round(Math.min(1, absCoeff / 1.5) * 50); 
            return `
                <div class="blender-channel-cell" data-inst-blender-ch="${idx}" data-coeff="${coeff.toFixed(3)}">
                    <span class="blender-channel-title">CH ${idx} (P<sub>${idx}</sub>)</span>
                    <div class="blender-channel-canvas-wrap">
                        <canvas data-ch-canvas="${idx}" width="60" height="60"></canvas>
                    </div>
                    <div class="blender-channel-coeff-row">
                        <div class="blender-coeff-header">
                            <span>权重 C<sub>${idx}</sub></span>
                            <span class="${isPos ? "positive" : "negative"}">${isPos ? "+" : ""}${coeff.toFixed(3)}</span>
                        </div>
                        <div class="blender-coeff-bar-bg">
                            <div class="blender-coeff-bar-fill ${isPos ? "positive" : "negative"}" style="width: ${pct}%; ${isPos ? "left: 50%" : "right: 50%; left: auto"}"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // 绘制小通道原型图
        activeChannels.forEach(({ idx }) => {
            const chCanvas = els.blenderGrid.querySelector(`[data-ch-canvas="${idx}"]`);
            if (chCanvas) {
                drawPrototypeChannelToCanvas(chCanvas, protoData, idx, protoWidth, protoHeight);
            }
        });

        // 大 Canvas 先行绘制最终静态融合好的 Alpha Mask
        drawFinalBlendedToCanvas(els.blenderCanvas, protoData, coeffs, item.bbox, scene.width, scene.height, colorHex);

        // 重组 Play 按钮以解绑旧事件
        const newBtn = els.blenderPlayBtn.cloneNode(true);
        els.blenderPlayBtn.parentNode.replaceChild(newBtn, els.blenderPlayBtn);
        els.blenderPlayBtn = newBtn;

        els.blenderPlayBtn.addEventListener("click", () => {
            if (blenderAnimationActive) return;
            playBlenderAnimation(protoData, coeffs, activeChannels, item.bbox, scene.width, scene.height, colorHex);
        });

        // 给活跃卡片绑定鼠标 Hover 行为
        const cells = els.blenderGrid.querySelectorAll(".blender-channel-cell");
        cells.forEach((cell) => {
            cell.addEventListener("mouseenter", () => {
                if (blenderAnimationActive) return;
                const chId = Number(cell.dataset.instBlenderCh);
                const cVal = Number(cell.dataset.coeff);
                showSingleChannelContribution(chId, cVal, protoData, item.bbox, scene.width, scene.height, colorHex);
            });
            cell.addEventListener("mouseleave", () => {
                if (blenderAnimationActive) return;
                drawFinalBlendedToCanvas(els.blenderCanvas, protoData, coeffs, item.bbox, scene.width, scene.height, colorHex);
                els.blenderOverlayText.classList.add("hidden");
            });
        });
    }

    function drawPrototypeChannelToCanvas(canvas, protoData, chIdx, width, height) {
        const c = canvas.getContext("2d");
        canvas.width = 60;
        canvas.height = 60;
        const imgData = c.createImageData(60, 60);
        const data = imgData.data;
        
        const offset = chIdx * width * height;
        let min = 999;
        let max = -999;
        for (let i = 0; i < width * height; i++) {
            const v = protoData[offset + i];
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const range = max - min || 1;

        for (let dy = 0; dy < 60; dy++) {
            for (let dx = 0; dx < 60; dx++) {
                const sx = Math.floor((dx / 60) * width);
                const sy = Math.floor((dy / 60) * height);
                const val = protoData[offset + sy * width + sx];
                
                const n = (val - min) / range;
                const r = Math.round(n * n * 255);
                const g = Math.round(Math.sin(n * Math.PI) * 160 + n * 85);
                const b = Math.round((1 - n) * 90 + n * 255);
                
                const p = (dy * 60 + dx) * 4;
                data[p] = r;
                data[p+1] = g;
                data[p+2] = b;
                data[p+3] = 255;
            }
        }
        c.putImageData(imgData, 0, 0);
    }

    function showSingleChannelContribution(chId, coeff, protoData, bbox, sceneWidth, sceneHeight, colorHex) {
        const canvas = els.blenderCanvas;
        canvas.width = 160;
        canvas.height = 160;
        const c = canvas.getContext("2d");
        const imgData = c.createImageData(160, 160);
        const out = imgData.data;
        const [r, g, b] = parseColor(colorHex);

        const offset = chId * 160 * 160;
        for (let y = 0; y < 160; y++) {
            for (let x = 0; x < 160; x++) {
                const idx = offset + y * 160 + x;
                const s = sigmoid(protoData[idx] * coeff);
                const p = (y * 160 + x) * 4;
                out[p] = Math.round(r * s + (1 - s) * 15);
                out[p+1] = Math.round(g * s + (1 - s) * 23);
                out[p+2] = Math.round(b * s + (1 - s) * 42);
                out[p+3] = 255;
            }
        }
        c.putImageData(imgData, 0, 0);
        
        els.blenderOverlayText.classList.remove("hidden");
        els.blenderOverlayText.innerHTML = `
            <span style="color:#3b82f6;font-weight:700">预览活跃通道 P<sub>${chId}</sub> × C<sub>${chId}</sub></span><br/>
            特征分量: ${coeff >= 0 ? "+" : ""}${coeff.toFixed(2)} × P<sub>${chId}</sub>
        `;
    }

    function drawFinalBlendedToCanvas(canvas, protoData, coeffs, bbox, sceneWidth, sceneHeight, colorHex) {
        canvas.width = 160;
        canvas.height = 160;
        const c = canvas.getContext("2d");
        const imgData = c.createImageData(160, 160);
        const out = imgData.data;
        const [r, g, b] = parseColor(colorHex);

        for (let y = 0; y < 160; y++) {
            for (let x = 0; x < 160; x++) {
                let sum = 0;
                for (let k = 0; k < 32; k++) {
                    sum += coeffs[k] * protoData[k * 160 * 160 + y * 160 + x];
                }
                const score = sigmoid(sum);
                const p = (y * 160 + x) * 4;
                if (score >= 0.5) {
                    out[p] = r;
                    out[p+1] = g;
                    out[p+2] = b;
                    out[p+3] = 235;
                } else {
                    out[p] = Math.round(r * score * 0.4 + 10);
                    out[p+1] = Math.round(g * score * 0.4 + 20);
                    out[p+2] = Math.round(b * score * 0.4 + 35);
                    out[p+3] = 180;
                }
            }
        }
        c.putImageData(imgData, 0, 0);
    }

    function playBlenderAnimation(protoData, coeffs, activeChannels, bbox, sceneWidth, sceneHeight, colorHex) {
        blenderAnimationActive = true;
        els.blenderPlayBtn.disabled = true;
        els.blenderOverlayText.classList.remove("hidden");
        els.blenderCanvas.parentNode.classList.add("blending");

        const canvas = els.blenderCanvas;
        const c = canvas.getContext("2d");
        const pmWidth = 160;
        const pmHeight = 160;
        const accumulator = new Float32Array(pmWidth * pmHeight);
        
        let step = 0;
        
        const renderStep = () => {
            if (step === 0) {
                c.fillStyle = "#0f172a";
                c.fillRect(0, 0, pmWidth, pmHeight);
                els.blenderOverlayText.innerHTML = `
                    <span style="color:#3b82f6;font-weight:700">开始融合前向特征层...</span><br/>
                    特征矩阵初始化为 0 矢量
                `;
                
                els.blenderGrid.querySelectorAll(".blender-channel-cell").forEach((el) => {
                    el.classList.remove("active-highlight", "blending-pulse");
                });
                
                step++;
                blenderAnimationTimer = setTimeout(renderStep, 800);
                return;
            }

            if (step <= 8) {
                const targetCh = activeChannels[step - 1];
                const chId = targetCh.idx;
                const coeff = targetCh.coeff;
                
                const cell = els.blenderGrid.querySelector(`[data-inst-blender-ch="${chId}"]`);
                if (cell) {
                    cell.classList.add("active-highlight", "blending-pulse");
                }
                
                els.blenderOverlayText.innerHTML = `
                    <span style="color:#10b981;font-weight:700">正在融合: 通道 P<sub>${chId}</sub></span><br/>
                    累加因子 C<sub>${chId}</sub> = <b>${coeff.toFixed(3)}</b>
                `;
                
                const offset = chId * pmWidth * pmHeight;
                for (let i = 0; i < pmWidth * pmHeight; i++) {
                    accumulator[i] += coeff * protoData[offset + i];
                }
                
                const imgData = c.createImageData(pmWidth, pmHeight);
                const out = imgData.data;
                const [r, g, b] = parseColor(colorHex);
                
                for (let i = 0; i < pmWidth * pmHeight; i++) {
                    const score = sigmoid(accumulator[i]);
                    const p = i * 4;
                    out[p] = Math.round(r * score);
                    out[p+1] = Math.round(g * score);
                    out[p+2] = Math.round(b * score);
                    out[p+3] = 255;
                }
                c.putImageData(imgData, 0, 0);
                
                step++;
                blenderAnimationTimer = setTimeout(renderStep, 900);
                return;
            }

            if (step === 9) {
                const activeSet = new Set(activeChannels.map(c => c.idx));
                for (let k = 0; k < 32; k++) {
                    if (activeSet.has(k)) continue;
                    const offset = k * pmWidth * pmHeight;
                    const coeff = coeffs[k];
                    for (let i = 0; i < pmWidth * pmHeight; i++) {
                        accumulator[i] += coeff * protoData[offset + i];
                    }
                }
                
                els.blenderOverlayText.innerHTML = `
                    <span style="color:#8b5cf6;font-weight:700">融合剩余 24 个次特征通道</span><br/>
                    正在重构多通道全局掩膜空间...
                `;
                
                const imgData = c.createImageData(pmWidth, pmHeight);
                const out = imgData.data;
                const [r, g, b] = parseColor(colorHex);
                
                for (let i = 0; i < pmWidth * pmHeight; i++) {
                    const score = sigmoid(accumulator[i]);
                    const p = i * 4;
                    out[p] = Math.round(r * score);
                    out[p+1] = Math.round(g * score);
                    out[p+2] = Math.round(b * score);
                    out[p+3] = 255;
                }
                c.putImageData(imgData, 0, 0);
                
                step++;
                blenderAnimationTimer = setTimeout(renderStep, 800);
                return;
            }

            if (step === 10) {
                els.blenderOverlayText.innerHTML = `
                    <span style="color:#eab308;font-weight:700">二值截断后处理 (Crop & BBox)</span><br/>
                    提取 $\\sigma(\\sum) \\ge 0.5$ 得到最终 Instance Mask。
                `;
                
                drawFinalBlendedToCanvas(canvas, protoData, coeffs, bbox, sceneWidth, sceneHeight, colorHex);
                
                step++;
                blenderAnimationTimer = setTimeout(renderStep, 1300);
                return;
            }

            els.blenderPlayBtn.disabled = false;
            els.blenderOverlayText.classList.add("hidden");
            els.blenderCanvas.parentNode.classList.remove("blending");
            blenderAnimationActive = false;
            blenderAnimationTimer = null;
        };

        renderStep();
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
                meta: result.meta || {},
                prototypes: result.prototypes || null
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
        if (!state.data || state.sourceMode !== "model") return;
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

    fetch(`${moduleDataRoot}/instance_maskrcnn_demo.json`)
        .then((response) => response.json())
        .then((data) => {
            state.maskRcnnData = data;
            if (isMaskRcnnMode() && state.currentScene) render();
        })
        .catch(() => {
            state.maskRcnnData = null;
        });

    fetch(`${dataRoot}/instance_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            renderControls();
            renderSourceButtons();
            activateScene(presetScene(), true);
            setPhase("image");
            if (!isCompareView()) autoLoadAndRun("initial");
        })
        .catch(() => {
            els.stats.innerHTML = `<div class="vision-empty-result">实例样例数据加载失败</div>`;
        });

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        state.sourceMode = isCompareView() ? "preset" : "model";
        state.modelScene = null;
        renderSourceButtons();
        activateScene(presetScene(), true);
        setPhase("image");
        if (!isCompareView()) autoLoadAndRun("sample");
    });
    els.upload.addEventListener("change", () => setUploadImage(els.upload.files?.[0]));
    if (Array.isArray(els.sourceButtons)) {
        els.sourceButtons.forEach((button) => button.addEventListener("click", () => {
            state.sourceMode = button.dataset.instSource;
            if (isCompareView()) state.sourceMode = "preset";
            renderSourceButtons();
            nextAutoToken();
            if (state.sourceMode === "preset") {
                switchToPreset();
            } else if (isMaskRcnnMode()) {
                state.maskRcnnStep = state.sourceMode === "roiAlign" ? 3 : state.sourceMode === "maskMetric" ? 7 : 0;
                activateScene(presetScene(), false);
                setPhase(maskRcnnSteps[state.maskRcnnStep]?.id || "image");
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
    els.viewButtons.forEach((button) => button.addEventListener("click", () => {
        state.view = button.dataset.instView;
        if (isCompareView()) state.sourceMode = "preset";
        render();
    }));
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
