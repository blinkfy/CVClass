(function () {
    const root = document.querySelector(".vision-lab");
    if (!root) return;

    root.classList.add("is-ready");

    const api = {
        page: root.dataset.visionPage || "overview",
        dataRoot: window.cvclassUrl("/static/assets/data/vision_tasks"),
        moduleDataRoot: window.cvclassUrl("/static/assets/vision_tasks/data"),
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
        displayModes: $$("[data-display-mode]"),
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
        els.semanticLayer.innerHTML = maskToSvgCells(classMap, width, height, (id) => byId.get(Number(id)) || classes[Number(id) % classes.length]);
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
        const maskRects = instances.slice(0, 12).map((item) => instanceMaskToSvgCells(item.mask, item.color || "#8b5cf6")).join("");
        const maskSvg = `<svg class="overview-instance-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${maskRects}</svg>`;
        const boxes = instances.slice(0, 12).map((item) => {
            const [x1, y1, x2, y2] = item.bbox;
            return `<div class="overview-instance-box" style="left:${pct(x1, width)};top:${pct(y1, height)};width:${pct(x2 - x1, width)};height:${pct(y2 - y1, height)};--box-color:${esc(item.color || "#8b5cf6")}"><span>ID ${item.id} · ${esc(item.className || item.class)} ${(item.score * 100).toFixed(0)}%</span></div>`;
        }).join("");
        els.instanceLayer.innerHTML = maskSvg + boxes;
        els.instanceCount.textContent = `${instances.length} 个实例 · model`;
        els.instanceMap.textContent = `YOLO-seg ${Number.isFinite(result?.meta?.postprocessTime) ? result.meta.postprocessTime.toFixed(0) : "--"} ms`;
        els.instanceLegend.innerHTML = instances.slice(0, 6).map((item) => `<span><i style="background:${esc(item.color || "#8b5cf6")}"></i>#${item.id} ${esc(item.className || item.class)}</span>`).join("");
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
        els.taskCards.forEach((card) => card.classList.toggle("is-selected", card.dataset.taskCard === state.task));
        els.lineageItems.forEach((item) => item.classList.toggle("is-selected", item.dataset.lineageTask === state.task));
        els.schemaItems.forEach((item) => item.classList.toggle("is-selected", item.dataset.schemaTask === state.task));
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
        els.thresholdOutput.textContent = state.confidence.toFixed(2);
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
    els.threshold?.addEventListener("input", () => {
        state.confidence = Number(els.threshold.value);
        els.thresholdOutput.textContent = state.confidence.toFixed(2);
        const sample = currentSample();
        if (sample) {
            renderDetection(sample);
            renderInstance(sample);
        }
    });


    fetch(`${api.dataRoot}/vision_task_samples.json`)
        .then((response) => {
            if (!response.ok) throw new Error(`sample data http ${response.status}`);
            return response.json();
        })
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples?.[0]?.id || "";
            renderAll();
        })
        .catch(() => {
            els.status.textContent = "SAMPLE DATA ERROR";
            els.sampleName.textContent = "样例数据加载失败";
            els.sampleResolution.textContent = "请检查 vision_task_samples.json";
        });
}());
