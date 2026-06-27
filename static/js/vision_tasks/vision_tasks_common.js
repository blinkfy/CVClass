(function () {
    const root = document.querySelector(".vision-lab");
    if (!root) return;

    root.classList.add("is-ready");

    const api = {
        page: root.dataset.visionPage || "overview",
        dataRoot: window.cvclassUrl("/static/assets/data/vision_tasks"),
    };
    window.CVClassVisionTasks = Object.freeze(api);

    if (api.page !== "overview") return;

    const workbench = root.querySelector("[data-overview-workbench]");
    if (!workbench) return;

    const $ = (selector) => workbench.querySelector(selector);
    const $$ = (selector) => [...workbench.querySelectorAll(selector)];
    const state = {
        data: null,
        sampleId: "",
        task: "classification",
        displayMode: "parallel",
        confidence: 0.5,
        colorScheme: "system",
        inferenceToken: 0,
        inference: {
            detection: null,
            semantic: null,
            instance: null,
            status: {detection: "preset", semantic: "preset", instance: "preset"}
        }
    };
    const els = {
        sampleList: $("[data-sample-list]"),
        sampleCount: $("[data-sample-count]"),
        sampleName: $("[data-sample-name]"),
        sampleResolution: $("[data-sample-resolution]"),
        displayModes: $$("[data-display-modes] [data-display-mode]"),
        taskButtons: $$("[data-task-select]"),
        taskCards: $$("[data-task-card]"),
        lineageItems: $$("[data-lineage-task]"),
        schemaItems: $$("[data-schema-task]"),
        resultGrid: $("[data-result-grid]"),
        threshold: $("[data-confidence-threshold]"),
        thresholdOutput: $("[data-confidence-output]"),
        status: $("[data-overview-status]"),
        scenes: $$("[data-overview-scene]"),
        classificationBars: $("[data-classification-bars]"),
        classificationTop1: $("[data-classification-top1]"),
        detectionLayer: $("[data-detection-layer]"),
        detectionLegend: $("[data-detection-legend]"),
        detectionCount: $("[data-detection-count]"),
        semanticLayer: $("[data-semantic-layer]"),
        semanticLegend: $("[data-semantic-legend]"),
        semanticMiou: $("[data-semantic-miou]"),
        instanceLayer: $("[data-instance-layer]"),
        instanceLegend: $("[data-instance-legend]"),
        instanceCount: $("[data-instance-count]"),
        instanceMap: $("[data-instance-map]"),
        taskKnowledgeCard: $("[data-task-knowledge-card]"),
        principleFigure: $("[data-principle-figure]"),
        principleCaption: $("[data-principle-caption]"),
        outputSummary: $("[data-output-summary]"),
        compareRows: $$(".overview-compare-row[data-task]"),
    };

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function currentSample() {
        return state.data?.samples.find((sample) => sample.id === state.sampleId) || state.data?.samples[0];
    }

    function pct(value, total) {
        return `${(value / total) * 100}%`;
    }

    function classInfo(sample, className) {
        return sample.semantic?.classes?.find((item) => item.name === className || item.cn === className);
    }

    function polygon(points, width, height) {
        return points.map(([x, y]) => `${(x / width) * 100},${(y / height) * 100}`).join(" ");
    }

    function setInferenceStatus(task, text) {
        state.inference.status[task] = text;
        const card = els.resultGrid?.querySelector(`[data-task-card="${task}"]`);
        const badge = card?.querySelector("[data-overview-infer-status]");
        if (badge) {
            badge.textContent = text;
            badge.dataset.status = /fail|失败|fallback|不可用/i.test(text) ? "fallback" : (/load|run|推理|加载|queued/i.test(text) ? "loading" : "ready");
        }
    }

    function waitForImage(img) {
        if (!img) return Promise.reject(new Error("image element not found"));
        if (img?.complete && img.naturalWidth > 0) return Promise.resolve(img);
        return new Promise((resolve, reject) => {
            const onLoad = () => { cleanup(); resolve(img); };
            const onError = () => { cleanup(); reject(new Error("image load failed")); };
            const cleanup = () => {
                img.removeEventListener("load", onLoad);
                img.removeEventListener("error", onError);
            };
            img.addEventListener("load", onLoad, {once: true});
            img.addEventListener("error", onError, {once: true});
        });
    }

    function getTaskImage(task) {
        return els.resultGrid?.querySelector(`[data-task-card="${task}"] .vision-real-image`);
    }

    function isCurrentRun(token, sample) {
        return token === state.inferenceToken && sample?.id === state.sampleId;
    }

    function maskToCanvas(classMap, width, height, classResolver) {
        if (!classMap || !width || !height) return null;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        canvas.style.pointerEvents = "none";
        canvas.style.position = "absolute";
        canvas.style.left = "0";
        canvas.style.top = "0";
        
        const ctx = canvas.getContext("2d");
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        const colors = new Map();
        
        for (let i = 0; i < classMap.length; i += 1) {
            const id = classMap[i];
            const p = i * 4;
            if (!colors.has(id)) {
                const info = classResolver(id);
                colors.set(id, info ? parseHexColor(info.color) : [0, 0, 0, 0]);
            }
            const [r, g, b] = colors.get(id);
            data[p] = r;
            data[p + 1] = g;
            data[p + 2] = b;
            data[p + 3] = id === 65535 ? 0 : 138; // 65535 为背景，设为透明；其他设为半透明
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    function maskToSvgCells(classMap, width, height, classResolver, maxCells = 1280) {
        if (!classMap || !width || !height) return "";
        const cols = Math.min(46, Math.max(24, Math.round(Math.sqrt(maxCells * width / height))));
        const rows = Math.min(34, Math.max(16, Math.round(cols * height / width)));
        const cellW = width / cols;
        const cellH = height / rows;
        const cells = [];
        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                const px = Math.min(width - 1, Math.floor((x + 0.5) * cellW));
                const py = Math.min(height - 1, Math.floor((y + 0.5) * cellH));
                const id = classMap[py * width + px];
                const info = classResolver(id);
                if (!info) continue;
                cells.push(`<rect x="${(x / cols) * 100}" y="${(y / rows) * 100}" width="${100 / cols + 0.2}" height="${100 / rows + 0.2}" fill="${esc(info.color || "#2563eb")}" fill-opacity="0.48"></rect>`);
            }
        }
        return `<svg class="overview-semantic-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${cells.join("")}</svg>`;
    }

    function instanceMaskToSvgCells(mask, color, maxCells = 96) {
        if (!mask?.data || !mask.width || !mask.height) return "";
        const cols = 12;
        const rows = Math.max(6, Math.round(cols * mask.height / mask.width));
        const cellW = mask.width / cols;
        const cellH = mask.height / rows;
        const cells = [];
        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                if (cells.length >= maxCells) break;
                const px = Math.min(mask.width - 1, Math.floor((x + 0.5) * cellW));
                const py = Math.min(mask.height - 1, Math.floor((y + 0.5) * cellH));
                if (!mask.data[py * mask.width + px]) continue;
                cells.push(`<rect x="${(x / cols) * 100}" y="${(y / rows) * 100}" width="${100 / cols + 0.2}" height="${100 / rows + 0.2}" fill="${esc(color)}" fill-opacity="0.52"></rect>`);
            }
        }
        return cells.join("");
    }

    function parseHexColor(value) {
        const raw = String(value || "#8b5cf6").replace("#", "");
        const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw.padEnd(6, "0").slice(0, 6);
        return [
            Number.parseInt(full.slice(0, 2), 16),
            Number.parseInt(full.slice(2, 4), 16),
            Number.parseInt(full.slice(4, 6), 16)
        ];
    }

    function paintInstanceMaskCanvas(container, width, height, instances) {
        if (!container || !width || !height) return false;
        const maskInstances = instances.filter((item) => item?.mask?.data && item.mask.width === width && item.mask.height === height);
        if (!maskInstances.length) return false;

        const canvas = document.createElement("canvas");
        canvas.className = "overview-instance-canvas";
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", {willReadFrequently: true});
        const imageData = ctx.createImageData(width, height);
        const out = imageData.data;

        maskInstances.forEach((item) => {
            const [r, g, b] = parseHexColor(item.color || "#8b5cf6");
            const alpha = Math.round(0.56 * 255);
            const mask = item.mask.data;
            for (let i = 0; i < mask.length; i += 1) {
                if (!mask[i]) continue;
                const p = i * 4;
                out[p] = r;
                out[p + 1] = g;
                out[p + 2] = b;
                out[p + 3] = Math.max(out[p + 3], alpha);
            }
        });

        ctx.putImageData(imageData, 0, 0);
        container.prepend(canvas);
        return true;
    }

    function svgFromRegions(regions, sample, classResolver, className) {
        if (!regions?.length) {
            return `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
        }
        const content = regions.map((region) => {
            const info = classResolver(region);
            const color = region.color || info?.color || "#2563eb";
            const filteredClass = region.filtered ? ' class="is-filtered"' : '';
            return `<polygon${filteredClass} points="${polygon(region.polygon || region.mask || [], sample.width, sample.height)}" fill="${esc(color)}" fill-opacity="${region.opacity ?? 0.58}" stroke="${esc(color)}" stroke-width="1.5" vector-effect="non-scaling-stroke"></polygon>`;
        }).join("");
        return `<svg class="${className}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${content}</svg>`;
    }

    function imageMarkup(sample, label) {
        return `
            <img class="vision-real-image" src="${esc(window.cvclassUrl(sample.image))}" alt="${esc(label || sample.name)}" loading="lazy">
            <div class="vision-image-placeholder">
                <strong>图片未找到</strong>
                <span>请将 ${esc(sample.image.split("/").pop())} 放入 static/assets/img/</span>
            </div>
        `;
    }

    function renderSamples() {
        els.sampleCount.textContent = `${state.data.samples.length} PRESETS`;
        els.sampleList.innerHTML = state.data.samples.map((sample, index) => `
            <button type="button" data-sample-select="${esc(sample.id)}" aria-pressed="${sample.id === state.sampleId}">
                <span class="overview-sample-thumb overview-sample-thumb--photo">
                    <img src="${esc(window.cvclassUrl(sample.image))}" alt="">
                    <i></i>
                </span>
                <span><b>0${index + 1}</b><small>${esc(sample.short_name || sample.name)}</small></span>
            </button>
        `).join("");
        els.sampleList.querySelectorAll("[data-sample-select]").forEach((button) => {
            button.addEventListener("click", () => {
                state.sampleId = button.dataset.sampleSelect;
                renderAll();
            });
        });
    }

    function orderSamples(data) {
        const order = ["crosswalk_people", "bangkok_traffic", "classroom_equipment", "classroom_students"];
        data.samples = [...(data.samples || [])].sort((a, b) => {
            const ai = order.indexOf(a.id);
            const bi = order.indexOf(b.id);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        return data;
    }

    function renderImages(sample) {
        els.scenes.forEach((scene) => {
            const overlay = scene.querySelector(".overview-overlay-layer");
            scene.classList.add("has-real-image");
            scene.classList.remove("is-image-missing");
            scene.innerHTML = imageMarkup(sample, sample.name);
            const image = scene.querySelector(".vision-real-image");
            image?.addEventListener("load", () => scene.classList.remove("is-image-missing"), {once: true});
            image?.addEventListener("error", () => scene.classList.add("is-image-missing"), {once: true});
            if (image?.complete && image.naturalWidth === 0) scene.classList.add("is-image-missing");
            if (overlay) scene.appendChild(overlay);
        });
        els.detectionLayer = $("[data-detection-layer]");
        els.semanticLayer = $("[data-semantic-layer]");
        els.instanceLayer = $("[data-instance-layer]");
    }

    function renderClassification(sample) {
        const top5 = sample.classification?.top5 || [];
        if (!top5.length) {
            els.classificationTop1.textContent = "Top-1: 暂无";
            els.classificationBars.innerHTML = `<div class="vision-empty-result">该样例暂无分类预设结果</div>`;
            return;
        }
        els.classificationTop1.textContent = `Top-1: ${top5[0].label} ${(top5[0].score * 100).toFixed(1)}%`;
        els.classificationBars.innerHTML = top5.map((item) => `
            <div class="overview-probability-row">
                <span>${esc(item.label)}</span>
                <i><b style="width:${item.score * 100}%"></b></i>
                <strong>${(item.score * 100).toFixed(1)}%</strong>
            </div>
        `).join("");
    }

    function renderDetection(sample) {
        if (state.inference.detection?.sampleId === sample.id) {
            renderDetectionInference(sample, state.inference.detection.result);
            return;
        }
        if (!sample.detection?.boxes?.length) {
            els.detectionCount.textContent = "暂无检测结果";
            const status = state.inference.status.detection;
            const isRunning = /queued|load|run|推理|加载/i.test(status);
            if (isRunning) {
                els.detectionLayer.innerHTML = "";
            } else {
                els.detectionLayer.innerHTML = `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
            }
            els.detectionLegend.innerHTML = "";
            return;
        }
        const boxes = sample.detection.boxes;
        const kept = boxes.filter((box) => box.score >= state.confidence);
        els.detectionCount.textContent = `${kept.length} / ${boxes.length} 个目标`;
        els.detectionLayer.innerHTML = boxes.map((box) => {
            const [x1, y1, x2, y2] = box.bbox;
            const filtered = box.score < state.confidence;
            return `<div class="overview-detection-box${filtered ? " is-filtered" : ""}" style="left:${pct(x1, sample.width)};top:${pct(y1, sample.height)};width:${pct(x2 - x1, sample.width)};height:${pct(y2 - y1, sample.height)};--box-color:${esc(box.color || sample.detection.classes?.find((item) => item.name === box.class)?.color || "#2563eb")}"><span>${esc(box.class)} ${(box.score * 100).toFixed(0)}%</span></div>`;
        }).join("");
        els.detectionLegend.innerHTML = (sample.detection.classes || []).map((item) => `<span><i style="background:${esc(item.color)}"></i>${esc(item.name)}</span>`).join("");
    }

    function renderDetectionInference(sample, result) {
        const boxes = (result?.boxes || []).filter((box) => box.score >= state.confidence);
        const width = result?.width || sample.width;
        const height = result?.height || sample.height;
        els.detectionCount.textContent = `${boxes.length} 个目标 · model`;
        els.detectionLayer.innerHTML = boxes.slice(0, 18).map((box) => {
            const [x1, y1, x2, y2] = box.bbox;
            const color = sample.detection?.classes?.find((item) => item.name === box.class)?.color || sample.detection?.classes?.find((item) => item.name === box.className)?.color || "#2563eb";
            return `<div class="overview-detection-box" style="left:${pct(x1, width)};top:${pct(y1, height)};width:${pct(x2 - x1, width)};height:${pct(y2 - y1, height)};--box-color:${esc(color)}"><span>${esc(box.class || box.className)} ${(box.score * 100).toFixed(0)}%</span></div>`;
        }).join("");
        const names = [...new Set(boxes.map((box) => box.class || box.className))].slice(0, 6);
        els.detectionLegend.innerHTML = names.map((name) => `<span><i style="background:${esc(sample.detection?.classes?.find((item) => item.name === name)?.color || "#2563eb")}"></i>${esc(name)}</span>`).join("");
        setInferenceStatus("detection", `YOLO · ${result?.backend || "wasm"} · ${Number.isFinite(result?.inferenceTime) ? result.inferenceTime.toFixed(0) : "--"} ms`);
    }

    function renderSemantic(sample) {
        if (state.inference.semantic?.sampleId === sample.id) {
            renderSemanticInference(sample, state.inference.semantic.result);
            return;
        }
        if (!sample.semantic?.regions?.length) {
            const status = state.inference.status.semantic;
            const isRunning = /queued|load|run|推理|加载/i.test(status);
            if (isRunning) {
                els.semanticLayer.innerHTML = "";
            } else {
                els.semanticLayer.innerHTML = `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
            }
            els.semanticLegend.innerHTML = "";
            els.semanticMiou.textContent = "mIoU --";
            return;
        }
        els.semanticLayer.innerHTML = svgFromRegions(sample.semantic.regions, sample, (region) => classInfo(sample, region.class), "overview-semantic-svg");
        els.semanticMiou.textContent = `mIoU ${(sample.semantic.miou * 100).toFixed(1)}%`;
        els.semanticLegend.innerHTML = sample.semantic.classes.map((item) => `<span><i style="background:${esc(item.color)}"></i>${esc(item.cn || item.name)}</span>`).join("");
    }

    function renderSemanticInference(sample, result) {
        const width = result?.width || sample.width;
        const height = result?.height || sample.height;
        const classMap = result?.classMap;
        const classes = result?.classes || [];
        const byId = new Map(classes.map((item) => [Number(item.id), item]));
        
        els.semanticLayer.innerHTML = "";
        if (classMap) {
            const canvas = maskToCanvas(classMap, width, height, (id) => byId.get(Number(id)) || classes[Number(id) % classes.length]);
            if (canvas) els.semanticLayer.appendChild(canvas);
        }
        
        const top = result?.distribution?.[0];
        els.semanticMiou.textContent = `SegFormer · ${top ? `${top.name || top.className} ${(top.ratio * 100).toFixed(1)}%` : "mask"}`;
        els.semanticLegend.innerHTML = classes.slice(0, 7).map((item) => `<span><i style="background:${esc(item.color)}"></i>${esc(item.cn || item.name || item.className || item.id)}</span>`).join("");
        setInferenceStatus("semantic", `SegFormer · ${result?.meta?.backend || "wasm"} · ${Number.isFinite(result?.meta?.inferenceTime) ? result.meta.inferenceTime.toFixed(0) : "--"} ms`);
    }

    function renderInstance(sample) {
        if (state.inference.instance?.sampleId === sample.id) {
            renderInstanceInference(sample, state.inference.instance.result);
            return;
        }
        if (!sample.instance?.instances?.length) {
            const status = state.inference.status.instance;
            const isRunning = /queued|load|run|推理|加载/i.test(status);
            if (isRunning) {
                els.instanceLayer.innerHTML = "";
            } else {
                els.instanceLayer.innerHTML = `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
            }
            els.instanceLegend.innerHTML = "";
            els.instanceCount.textContent = "暂无实例";
            els.instanceMap.textContent = "Mask AP --";
            return;
        }
        const instances = sample.instance.instances;
        const kept = instances.filter((item) => item.score >= state.confidence);
        els.instanceCount.textContent = `${kept.length} / ${instances.length} 个实例`;
        els.instanceMap.textContent = `Mask AP ${(sample.instance.maskAP * 100).toFixed(1)}%`;
        els.instanceLegend.innerHTML = instances.map((item) => {
            const filtered = item.score < state.confidence;
            return `<span style="${filtered ? "opacity:0.4;text-decoration:line-through" : ""}"><i style="background:${esc(item.color)}"></i>#${item.id} ${esc(item.class)}</span>`;
        }).join("");

        const masks = svgFromRegions(instances.map((item) => ({
            ...item,
            polygon: item.polygon || item.mask,
            opacity: 0.56,
            filtered: item.score < state.confidence
        })), sample, (item) => item, "overview-instance-svg");

        const boxes = instances.map((item) => {
            const [x1, y1, x2, y2] = item.bbox;
            const filtered = item.score < state.confidence;
            return `<div class="overview-instance-box${filtered ? " is-filtered" : ""}" style="left:${pct(x1, sample.width)};top:${pct(y1, sample.height)};width:${pct(x2 - x1, sample.width)};height:${pct(y2 - y1, sample.height)};--box-color:${esc(item.color)}"><span>ID ${item.id} · ${esc(item.class)} ${(item.score * 100).toFixed(0)}%</span></div>`;
        }).join("");

        els.instanceLayer.innerHTML = masks + boxes;
    }

    function renderInstanceInference(sample, result) {
        const instances = (result?.instances || []).filter((item) => item.score >= state.confidence);
        const width = result?.width || sample.width;
        const height = result?.height || sample.height;
        const visibleInstances = instances.slice(0, 12);
        const boxes = visibleInstances.map((item) => {
            const [x1, y1, x2, y2] = item.bbox;
            return `<div class="overview-instance-box" style="left:${pct(x1, width)};top:${pct(y1, height)};width:${pct(x2 - x1, width)};height:${pct(y2 - y1, height)};--box-color:${esc(item.color || "#8b5cf6")}"><span>ID ${item.id} · ${esc(item.className || item.class)} ${(item.score * 100).toFixed(0)}%</span></div>`;
        }).join("");
        els.instanceLayer.innerHTML = boxes;
        if (!paintInstanceMaskCanvas(els.instanceLayer, width, height, visibleInstances)) {
            const maskRects = visibleInstances.map((item) => instanceMaskToSvgCells(item.mask, item.color || "#8b5cf6")).join("");
            const maskSvg = `<svg class="overview-instance-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${maskRects}</svg>`;
            els.instanceLayer.insertAdjacentHTML("afterbegin", maskSvg);
        }
        els.instanceCount.textContent = `${instances.length} 个实例 · model`;
        els.instanceMap.textContent = `YOLO-seg ${Number.isFinite(result?.meta?.postprocessTime) ? result.meta.postprocessTime.toFixed(0) : "--"} ms`;
        els.instanceLegend.innerHTML = visibleInstances.slice(0, 6).map((item) => `<span><i style="background:${esc(item.color || "#8b5cf6")}"></i>#${item.id} ${esc(item.className || item.class)}</span>`).join("");
        setInferenceStatus("instance", `YOLO-seg · ${result?.meta?.backend || "wasm"} · ${Number.isFinite(result?.meta?.inferenceTime) ? result.meta.inferenceTime.toFixed(0) : "--"} ms`);
    }

    function resetOverviewInference() {
        state.inference.detection = null;
        state.inference.semantic = null;
        state.inference.instance = null;
        setInferenceStatus("classification", "BoVW/CNN demo");
        setInferenceStatus("detection", "Queued");
        setInferenceStatus("semantic", "Queued");
        setInferenceStatus("instance", "Queued");
    }

    async function runDetectionOverviewInference(token, sample) {
        let client = null;
        try {
            setInferenceStatus("detection", "Loading YOLO");
            const image = await waitForImage(getTaskImage("detection"));
            if (!isCurrentRun(token, sample)) return;
            const {createDetectionInferenceClient} = await import(window.cvclassUrl("/static/js/inference/detection_inference.js"));
            client = createDetectionInferenceClient();
            await client.loadDetectionModel({backend: "webgpu"});
            if (!isCurrentRun(token, sample)) return;
            setInferenceStatus("detection", "Running YOLO");
            const result = await client.runDetectionInference(image);
            if (!isCurrentRun(token, sample)) return;
            state.inference.detection = {sampleId: sample.id, result};
            renderDetection(sample);
        } catch (error) {
            if (isCurrentRun(token, sample)) {
                setInferenceStatus("detection", "Preset fallback");
                renderDetection(sample);
            }
            console.info("[vision overview] detection model fallback:", error?.message || error);
        } finally {
            client?.dispose?.();
        }
    }

    async function runSemanticOverviewInference(token, sample) {
        let client = null;
        try {
            setInferenceStatus("semantic", "Loading SegFormer");
            const image = await waitForImage(getTaskImage("semantic"));
            if (!isCurrentRun(token, sample)) return;
            const {createSemanticInferenceClient} = await import(window.cvclassUrl("/static/js/inference/semantic_inference.js"));
            client = createSemanticInferenceClient();
            await client.loadSemanticModel({modelBaseUrl: window.cvclassUrl("/static/assets/data/segformer_b0_ade/"), backend: "webgpu"});
            if (!isCurrentRun(token, sample)) return;
            setInferenceStatus("semantic", "Running SegFormer");
            const result = await client.runSemanticInference(image);
            if (!isCurrentRun(token, sample)) return;
            state.inference.semantic = {sampleId: sample.id, result};
            renderSemantic(sample);
        } catch (error) {
            if (isCurrentRun(token, sample)) {
                setInferenceStatus("semantic", "Preset fallback");
                renderSemantic(sample);
            }
            console.info("[vision overview] semantic model fallback:", error?.message || error);
        } finally {
            client?.dispose?.();
        }
    }

    async function runInstanceOverviewInference(token, sample) {
        let client = null;
        try {
            setInferenceStatus("instance", "Loading YOLO-seg");
            const image = await waitForImage(getTaskImage("instance"));
            if (!isCurrentRun(token, sample)) return;
            const {createInstanceInferenceClient} = await import(window.cvclassUrl("/static/js/inference/instance_inference.js"));
            client = createInstanceInferenceClient();
            await client.loadInstanceModel({backend: "webgpu"});
            if (!isCurrentRun(token, sample)) return;
            setInferenceStatus("instance", "Running YOLO-seg");
            const result = await client.runInstanceInference(image);
            if (!isCurrentRun(token, sample)) return;
            state.inference.instance = {sampleId: sample.id, result};
            renderInstance(sample);
        } catch (error) {
            if (isCurrentRun(token, sample)) {
                setInferenceStatus("instance", "Preset fallback");
                renderInstance(sample);
            }
            console.info("[vision overview] instance model fallback:", error?.message || error);
        } finally {
            client?.dispose?.();
        }
    }

    async function runOverviewInference(token, sample) {
        els.status.textContent = `${sample.id.toUpperCase()} · FRONTEND INFERENCE`;
        await runDetectionOverviewInference(token, sample);
        await runSemanticOverviewInference(token, sample);
        await runInstanceOverviewInference(token, sample);
        if (isCurrentRun(token, sample)) els.status.textContent = `${sample.id.toUpperCase()} · MODEL + PRESET FALLBACK`;
    }

    const taskKnowledgeCards = {
        classification: {
            title: "图像级分类",
            subtitle: "Image-level Classification",
            principle: "将整张图像映射为一个类别概率分布，强调全局语义理解。",
            image: "/static/assets/img/classfication.webp",
            figure: `
                <svg class="tk-figure-svg tk-figure--classification" viewBox="0 0 280 140" aria-hidden="true">
                    <defs>
                        <linearGradient id="tk-cls-input" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#dbeafe"/><stop offset="100%" stop-color="#bfdbfe"/>
                        </linearGradient>
                        <linearGradient id="tk-cls-bar" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#60a5fa"/>
                        </linearGradient>
                    </defs>
                    <!-- input image -->
                    <rect x="12" y="30" width="60" height="80" rx="6" fill="url(#tk-cls-input)" stroke="#93c5fd" stroke-width="1.5"/>
                    <circle cx="42" cy="58" r="14" fill="none" stroke="#3b82f6" stroke-width="2"/>
                    <path d="M28 90 L38 74 L50 86 L58 66 L72 90" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- arrow -->
                    <path d="M78 70 H98" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="96,66 104,70 96,74" fill="#94a3b8"/>
                    <!-- feature vector -->
                    <rect x="110" y="40" width="14" height="60" rx="3" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/>
                    <g fill="#64748b"><rect x="113" y="46" width="8" height="4" rx="1"/><rect x="113" y="54" width="8" height="4" rx="1"/><rect x="113" y="62" width="8" height="4" rx="1"/><rect x="113" y="70" width="8" height="4" rx="1"/><rect x="113" y="78" width="8" height="4" rx="1"/><rect x="113" y="86" width="8" height="4" rx="1"/></g>
                    <!-- arrow -->
                    <path d="M128 70 H148" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="146,66 154,70 146,74" fill="#94a3b8"/>
                    <!-- softmax -->
                    <rect x="160" y="50" width="44" height="40" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
                    <text x="182" y="68" text-anchor="middle" fill="#1d4ed8" font-size="9" font-weight="800">softmax</text>
                    <text x="182" y="80" text-anchor="middle" fill="#3b82f6" font-size="8">f:ℝ<sup>d</sup>→Δ<sup>C</sup></text>
                    <!-- arrow -->
                    <path d="M208 70 H228" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="226,66 234,70 226,74" fill="#94a3b8"/>
                    <!-- probability bars -->
                    <g transform="translate(240, 38)">
                        <rect x="0" y="0" width="28" height="10" rx="2" fill="url(#tk-cls-bar)"/>
                        <text x="32" y="8" fill="#1e3a8a" font-size="8" font-weight="700">cat</text>
                        <rect x="0" y="16" width="18" height="10" rx="2" fill="#93c5fd"/>
                        <text x="22" y="24" fill="#475569" font-size="8">dog</text>
                        <rect x="0" y="32" width="10" height="10" rx="2" fill="#bfdbfe"/>
                        <text x="14" y="40" fill="#64748b" font-size="8">...</text>
                        <rect x="0" y="48" width="6" height="10" rx="2" fill="#dbeafe"/>
                    </g>
                </svg>
            `,
            unit: "整张图像",
            structure: "p(y | image) ∈ R<sup>C</sup>",
            predictionLevel: "Image-level",
            output: "p(y | image) ∈ R<sup>C</sup>",
            metric: "Top-1 / Top-5 Accuracy",
            courses: ["BoVW", "Spatial Pyramid", "CNN / ResNet"],
        },
        detection: {
            title: "目标检测",
            subtitle: "Object Detection",
            principle: "在图像中定位并分类所有感兴趣目标，输出带置信度的边界框。",
            image: "/static/assets/img/detection.webp",
            figure: `
                <svg class="tk-figure-svg tk-figure--detection" viewBox="0 0 280 140" aria-hidden="true">
                    <defs>
                        <linearGradient id="tk-det-input" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#fef3c7"/><stop offset="100%" stop-color="#fde68a"/>
                        </linearGradient>
                        <linearGradient id="tk-det-box" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#fb923c"/>
                        </linearGradient>
                    </defs>
                    <!-- input image -->
                    <rect x="12" y="25" width="90" height="90" rx="6" fill="url(#tk-det-input)" stroke="#fcd34d" stroke-width="1.5"/>
                    <circle cx="45" cy="55" r="12" fill="#fbbf24" opacity="0.7"/>
                    <rect x="60" y="75" width="28" height="18" rx="3" fill="#f59e0b" opacity="0.7"/>
                    <rect x="28" y="82" width="20" height="14" rx="2" fill="#d97706" opacity="0.7"/>
                    <!-- feature grid -->
                    <g transform="translate(118, 35)" stroke="#cbd5e1" stroke-width="0.8">
                        <rect x="0" y="0" width="70" height="70" rx="4" fill="#f8fafc"/>
                        <line x1="14" y1="0" x2="14" y2="70"/><line x1="28" y1="0" x2="28" y2="70"/><line x1="42" y1="0" x2="42" y2="70"/><line x1="56" y1="0" x2="56" y2="70"/>
                        <line x1="0" y1="14" x2="70" y2="14"/><line x1="0" y1="28" x2="70" y2="28"/><line x1="0" y1="42" x2="70" y2="42"/><line x1="0" y1="56" x2="70" y2="56"/>
                    </g>
                    <!-- anchors / boxes -->
                    <g transform="translate(118, 35)">
                        <rect x="18" y="16" width="22" height="22" rx="2" fill="none" stroke="#f97316" stroke-width="1.5" stroke-dasharray="3 2"/>
                        <rect x="12" y="12" width="34" height="34" rx="2" fill="none" stroke="#fdba74" stroke-width="1"/>
                        <rect x="44" y="42" width="18" height="14" rx="2" fill="none" stroke="#f97316" stroke-width="1.5"/>
                        <rect x="38" y="38" width="30" height="22" rx="2" fill="none" stroke="#fdba74" stroke-width="1"/>
                    </g>
                    <!-- arrow -->
                    <path d="M196 70 H216" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="214,66 222,70 214,74" fill="#94a3b8"/>
                    <!-- output boxes -->
                    <g transform="translate(232, 30)">
                        <rect x="0" y="0" width="38" height="22" rx="3" fill="url(#tk-det-box)" opacity="0.15" stroke="#f97316" stroke-width="1.5"/>
                        <text x="4" y="9" fill="#c2410c" font-size="7" font-weight="800">person</text>
                        <text x="4" y="17" fill="#f97316" font-size="7">0.92</text>
                        <rect x="0" y="30" width="34" height="22" rx="3" fill="url(#tk-det-box)" opacity="0.15" stroke="#f97316" stroke-width="1.5"/>
                        <text x="4" y="39" fill="#c2410c" font-size="7" font-weight="800">car</text>
                        <text x="4" y="47" fill="#f97316" font-size="7">0.87</text>
                        <rect x="0" y="60" width="30" height="18" rx="3" fill="url(#tk-det-box)" opacity="0.12" stroke="#fdba74" stroke-width="1"/>
                        <text x="4" y="72" fill="#9a3412" font-size="6">box + cls</text>
                    </g>
                </svg>
            `,
            unit: "目标实例",
            structure: "N × [x<sub>1</sub>, y<sub>1</sub>, x<sub>2</sub>, y<sub>2</sub>, score, class]",
            predictionLevel: "Object-level",
            output: "N × [x1,y1,x2,y2,score,class]",
            metric: "IoU / AP / mAP",
            courses: ["Sliding Window", "R-CNN", "YOLO", "NMS"],
        },
        semantic: {
            title: "语义分割",
            subtitle: "语义分割",
            principle: "为每个像素预测类别标签，获得与输入等分辨率的稠密类别图。",
            image: "/static/assets/img/semantic-segment.webp",
            figure: `
                <svg class="tk-figure-svg tk-figure--semantic" viewBox="0 0 280 140" aria-hidden="true">
                    <defs>
                        <linearGradient id="tk-sem-input" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#ede9fe"/><stop offset="100%" stop-color="#ddd6fe"/>
                        </linearGradient>
                        <linearGradient id="tk-sem-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#93c5fd"/></linearGradient>
                        <linearGradient id="tk-sem-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#64748b"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient>
                        <linearGradient id="tk-sem-tree" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#22c55e"/><stop offset="100%" stop-color="#4ade80"/></linearGradient>
                    </defs>
                    <!-- input image -->
                    <rect x="10" y="28" width="84" height="84" rx="6" fill="url(#tk-sem-input)" stroke="#c4b5fd" stroke-width="1.5"/>
                    <rect x="10" y="28" width="84" height="30" rx="6" fill="#bfdbfe"/>
                    <path d="M10 58 L84 58 L74 112 L20 112 Z" fill="#e2e8f0"/>
                    <circle cx="40" cy="48" r="8" fill="#fbbf24"/>
                    <rect x="36" y="72" width="12" height="28" fill="#a16207" rx="2"/>
                    <circle cx="42" cy="66" r="14" fill="#22c55e" opacity="0.8"/>
                    <!-- arrow -->
                    <path d="M100 70 H120" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="118,66 126,70 118,74" fill="#94a3b8"/>
                    <!-- encoder-decoder -->
                    <g transform="translate(132, 36)">
                        <rect x="0" y="24" width="18" height="18" rx="2" fill="#e0e7ff" stroke="#6366f1" stroke-width="1"/>
                        <rect x="22" y="18" width="18" height="24" rx="2" fill="#c7d2fe" stroke="#6366f1" stroke-width="1"/>
                        <rect x="44" y="12" width="18" height="30" rx="2" fill="#a5b4fc" stroke="#6366f1" stroke-width="1"/>
                        <rect x="66" y="18" width="18" height="24" rx="2" fill="#c7d2fe" stroke="#6366f1" stroke-width="1"/>
                        <rect x="88" y="24" width="18" height="18" rx="2" fill="#e0e7ff" stroke="#6366f1" stroke-width="1"/>
                        <text x="52" y="58" text-anchor="middle" fill="#4338ca" font-size="8" font-weight="800">Encoder · Decoder</text>
                    </g>
                    <!-- arrow -->
                    <path d="M244 70 H264" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="262,66 270,70 262,74" fill="#94a3b8"/>
                    <!-- pixel map -->
                    <g transform="translate(272, 28)">
                        <rect x="0" y="0" width="84" height="84" rx="6" fill="url(#tk-sem-sky)" stroke="#818cf8" stroke-width="1.5"/>
                        <rect x="0" y="30" width="84" height="54" rx="6" fill="url(#tk-sem-road)"/>
                        <rect x="0" y="30" width="84" height="8" fill="#94a3b8"/>
                        <rect x="30" y="0" width="12" height="84" fill="url(#tk-sem-tree)" opacity="0.9"/>
                        <rect x="36" y="42" width="12" height="24" fill="#f97316" opacity="0.85" rx="2"/>
                        <text x="42" y="104" text-anchor="middle" fill="#5b21b6" font-size="8" font-weight="800">H × W class map</text>
                    </g>
                </svg>
            `,
            unit: "像素",
            structure: "mask ∈ {0…C-1}<sup>H×W</sup>",
            predictionLevel: "Pixel-level",
            output: "H×W class map",
            metric: "Pixel Accuracy / mIoU",
            courses: ["FCN", "1×1 Conv", "Upsampling", "Skip Connection", "SegFormer"],
        },
        instance: {
            title: "实例分割",
            subtitle: "实例分割",
            principle: "同时为每个目标实例生成检测框和像素级掩码，并赋予独立身份。",
            image: "/static/assets/img/instance-segment.webp",
            figure: `
                <svg class="tk-figure-svg tk-figure--instance" viewBox="0 0 280 140" aria-hidden="true">
                    <defs>
                        <linearGradient id="tk-ins-input" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#fce7f3"/><stop offset="100%" stop-color="#fbcfe8"/>
                        </linearGradient>
                        <linearGradient id="tk-ins-mask1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#f472b6"/></linearGradient>
                        <linearGradient id="tk-ins-mask2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient>
                    </defs>
                    <!-- input image -->
                    <rect x="10" y="28" width="84" height="84" rx="6" fill="url(#tk-ins-input)" stroke="#f9a8d4" stroke-width="1.5"/>
                    <circle cx="38" cy="58" r="14" fill="#fbbf24" opacity="0.7"/>
                    <rect x="56" y="72" width="26" height="18" rx="3" fill="#f43f5e" opacity="0.7"/>
                    <rect x="22" y="80" width="20" height="14" rx="2" fill="#3b82f6" opacity="0.7"/>
                    <!-- arrow -->
                    <path d="M100 70 H120" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="118,66 126,70 118,74" fill="#94a3b8"/>
                    <!-- mask branch -->
                    <g transform="translate(128, 30)">
                        <rect x="0" y="0" width="44" height="50" rx="5" fill="#fdf2f8" stroke="#ec4899" stroke-width="1.5"/>
                        <text x="22" y="16" text-anchor="middle" fill="#be185d" font-size="8" font-weight="800">Detection</text>
                        <text x="22" y="26" text-anchor="middle" fill="#9d174d" font-size="7">Head</text>
                        <rect x="8" y="34" width="28" height="10" rx="2" fill="#fbcfe8"/>
                        <text x="22" y="41" text-anchor="middle" fill="#be185d" font-size="6">bbox + cls</text>
                    </g>
                    <g transform="translate(128, 86)">
                        <rect x="0" y="0" width="44" height="26" rx="5" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="1.5"/>
                        <text x="22" y="11" text-anchor="middle" fill="#6d28d9" font-size="8" font-weight="800">Mask</text>
                        <text x="22" y="20" text-anchor="middle" fill="#7c3aed" font-size="7">Head</text>
                    </g>
                    <!-- arrow -->
                    <path d="M176 70 H196" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 2"/>
                    <polygon points="194,66 202,70 194,74" fill="#94a3b8"/>
                    <!-- output instances -->
                    <g transform="translate(206, 24)">
                        <rect x="0" y="0" width="64" height="92" rx="6" fill="#fff1f2" stroke="#fda4af" stroke-width="1.5"/>
                        <rect x="6" y="6" width="24" height="30" rx="3" fill="url(#tk-ins-mask1)" opacity="0.45" stroke="#db2777" stroke-width="1"/>
                        <rect x="5" y="5" width="26" height="32" rx="3" fill="none" stroke="#db2777" stroke-width="1.5"/>
                        <text x="18" y="47" text-anchor="middle" fill="#be185d" font-size="7" font-weight="800">ID-1</text>
                        <rect x="34" y="52" width="22" height="24" rx="3" fill="url(#tk-ins-mask2)" opacity="0.45" stroke="#7c3aed" stroke-width="1"/>
                        <rect x="33" y="51" width="24" height="26" rx="3" fill="none" stroke="#7c3aed" stroke-width="1.5"/>
                        <text x="45" y="83" text-anchor="middle" fill="#6d28d9" font-size="7" font-weight="800">ID-2</text>
                    </g>
                </svg>
            `,
            unit: "对象实例",
            structure: "N × {bbox, class, score, mask, instance_id}",
            predictionLevel: "Instance-level",
            output: "N × {bbox,class,score,mask,instance_id}",
            metric: "Mask IoU / Mask AP",
            courses: ["Mask R-CNN", "FPN", "ROI Align", "Mask Head", "YOLO-seg"],
        },
    };

    function renderTaskKnowledgeCard() {
        const card = taskKnowledgeCards[state.task];
        if (!card || !els.taskKnowledgeCard) return;
        const tags = (items) => items.map((item) => `<span class="oc-tag">${esc(item)}</span>`).join("");

        if (els.principleFigure) {
            if (card.image) {
                els.principleFigure.innerHTML = `
                    <img class="tk-principle-image" src="${esc(window.cvclassUrl(card.image))}" alt="${esc(card.title)} 原理示意" loading="lazy">
                    <div class="tk-image-placeholder">
                        <strong>图片未找到</strong>
                        <span>请检查 ${esc(card.image.split("/").pop())}</span>
                    </div>
                `;
                const img = els.principleFigure.querySelector(".tk-principle-image");
                img?.addEventListener("load", () => els.principleFigure.classList.add("is-loaded"), {once: true});
                img?.addEventListener("error", () => els.principleFigure.classList.remove("is-loaded"), {once: true});
                if (img?.complete && img.naturalWidth > 0) els.principleFigure.classList.add("is-loaded");
            } else {
                els.principleFigure.innerHTML = card.figure;
                requestAnimationFrame(() => {
                    const svg = els.principleFigure.querySelector("svg");
                    if (svg) svg.classList.add("is-visible");
                });
            }
        }
        if (els.principleCaption) {
            if (card.image) {
                els.principleCaption.innerHTML = "";
                els.principleCaption.classList.add("is-empty");
            } else {
                els.principleCaption.classList.remove("is-empty");
                els.principleCaption.innerHTML = `
                    <strong>${esc(card.title)}</strong>
                    <span>${esc(card.subtitle)}</span>
                    <p>${esc(card.principle)}</p>
                `;
            }
        }
        if (els.outputSummary) {
            els.outputSummary.innerHTML = `
                <div class="tk-summary-heading">${esc(card.title)}</div>
                <div class="oc-row">
                    <span class="oc-label">Prediction Level</span>
                    <strong class="oc-value">${esc(card.predictionLevel)}</strong>
                </div>
                <div class="oc-formula-box">
                    <span class="oc-label">Output</span>
                    <code class="oc-formula">${card.output || card.structure}</code>
                </div>
                <div class="oc-row">
                    <span class="oc-label">Metric</span>
                    <strong class="oc-value">${esc(card.metric)}</strong>
                </div>
                <div class="oc-row">
                    <span class="oc-label">Course Methods</span>
                    <div class="oc-tags oc-course-tags">${tags(card.courses)}</div>
                </div>
            `;
        }

        // trigger content transition animation
        els.taskKnowledgeCard.classList.remove("is-transitioning");
        void els.taskKnowledgeCard.offsetWidth; // force reflow
        els.taskKnowledgeCard.classList.add("is-transitioning");
    }

    function renderState() {
        workbench.dataset.colorScheme = state.colorScheme;
        els.resultGrid.dataset.displayMode = state.displayMode;
        els.resultGrid.dataset.activeTask = state.task;
        els.displayModes.forEach((button) => {
            const active = button.dataset.displayMode === state.displayMode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        els.taskButtons.forEach((button) => {
            const active = button.dataset.taskSelect === state.task;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-checked", String(active));
        });
        els.taskCards.forEach((card) => {
            const selected = card.dataset.taskCard === state.task;
            card.classList.toggle("is-selected", selected);
            card.style.order = selected ? "-1" : "0";
        });
        els.lineageItems.forEach((item) => item.classList.toggle("is-selected", item.dataset.lineageTask === state.task));
        els.schemaItems.forEach((item) => item.classList.toggle("is-selected", item.dataset.schemaTask === state.task));
        els.compareRows.forEach((row) => row.classList.toggle("is-selected", row.dataset.task === state.task));
        renderTaskKnowledgeCard();
    }

    function renderAll() {
        const sample = currentSample();
        if (!sample) return;
        state.inferenceToken += 1;
        const token = state.inferenceToken;
        resetOverviewInference();
        els.sampleName.textContent = sample.name;
        els.sampleResolution.textContent = `分辨率：${sample.width} × ${sample.height}`;
        els.status.textContent = `${sample.id.toUpperCase()} · PRESET FALLBACK READY`;
        if (els.thresholdOutput) els.thresholdOutput.textContent = state.confidence.toFixed(2);
        renderSamples();
        renderImages(sample);
        renderClassification(sample);
        renderDetection(sample);
        renderSemantic(sample);
        renderInstance(sample);
        renderState();
        runOverviewInference(token, sample).catch((error) => {
            if (isCurrentRun(token, sample)) els.status.textContent = `${sample.id.toUpperCase()} · PRESET FALLBACK`;
            console.info("[vision overview] model inference fallback:", error?.message || error);
        });
    }

    els.displayModes.forEach((button) => button.addEventListener("click", () => {
        state.displayMode = button.dataset.displayMode;
        renderState();
    }));
    els.taskButtons.forEach((button) => button.addEventListener("click", () => {
        state.task = button.dataset.taskSelect;
        renderState();
    }));
    els.taskCards.forEach((card) => card.addEventListener("click", () => {
        state.task = card.dataset.taskCard;
        renderState();
    }));
    els.lineageItems.forEach((item) => item.addEventListener("click", () => {
        state.task = item.dataset.lineageTask;
        renderState();
    }));
    els.threshold?.addEventListener("input", () => {
        state.confidence = Number(els.threshold.value);
        if (els.thresholdOutput) els.thresholdOutput.textContent = state.confidence.toFixed(2);
        const sample = currentSample();
        if (sample) {
            renderDetection(sample);
            renderInstance(sample);
        }
    });


    fetch(`${api.dataRoot}/overview/task_samples.json`)
        .then((response) => {
            if (!response.ok) throw new Error(`sample data http ${response.status}`);
            return response.json();
        })
        .then((data) => {
            state.data = orderSamples(data);
            state.sampleId = data.default_sample || data.samples?.[0]?.id || "";
            renderAll();
        })
        .catch(() => {
            els.status.textContent = "SAMPLE DATA ERROR";
            els.sampleName.textContent = "样例数据加载失败";
            els.sampleResolution.textContent = "请检查 overview/task_samples.json";
        });
}());
