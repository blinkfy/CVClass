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
    const state = { data: null, sampleId: "", task: "classification", displayMode: "parallel", confidence: 0.5, colorScheme: "system" };
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
        colorScheme: $("[data-color-scheme]"),
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

    function svgFromRegions(regions, sample, classResolver, className) {
        if (!regions?.length) {
            return `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
        }
        const content = regions.map((region) => {
            const info = classResolver(region);
            const color = region.color || info?.color || "#2563eb";
            return `<polygon points="${polygon(region.polygon || region.mask || [], sample.width, sample.height)}" fill="${esc(color)}" fill-opacity="${region.opacity ?? 0.58}" stroke="${esc(color)}" stroke-width="1.5" vector-effect="non-scaling-stroke"></polygon>`;
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
            scene.innerHTML = imageMarkup(sample, sample.name);
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
        if (!sample.detection?.boxes?.length) {
            els.detectionCount.textContent = "暂无检测结果";
            els.detectionLayer.innerHTML = `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
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

    function renderSemantic(sample) {
        if (!sample.semantic?.regions?.length) {
            els.semanticLayer.innerHTML = `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
            els.semanticLegend.innerHTML = "";
            els.semanticMiou.textContent = "mIoU --";
            return;
        }
        els.semanticLayer.innerHTML = svgFromRegions(sample.semantic.regions, sample, (region) => classInfo(sample, region.class), "overview-semantic-svg");
        els.semanticMiou.textContent = `mIoU ${(sample.semantic.miou * 100).toFixed(1)}%`;
        els.semanticLegend.innerHTML = sample.semantic.classes.map((item) => `<span><i style="background:${esc(item.color)}"></i>${esc(item.cn || item.name)}</span>`).join("");
    }

    function renderInstance(sample) {
        if (!sample.instance?.instances?.length) {
            els.instanceLayer.innerHTML = `<div class="vision-empty-result">该样例暂无该任务预设结果</div>`;
            els.instanceLegend.innerHTML = "";
            els.instanceCount.textContent = "暂无实例";
            els.instanceMap.textContent = "Mask AP --";
            return;
        }
        const masks = svgFromRegions(sample.instance.instances.map((item) => ({...item, polygon: item.polygon || item.mask, opacity: 0.56})), sample, (item) => item, "overview-instance-svg");
        const boxes = sample.instance.instances.map((item) => {
            const [x1, y1, x2, y2] = item.bbox;
            return `<div class="overview-instance-box" style="left:${pct(x1, sample.width)};top:${pct(y1, sample.height)};width:${pct(x2 - x1, sample.width)};height:${pct(y2 - y1, sample.height)};--box-color:${esc(item.color)}"><span>ID ${item.id} · ${esc(item.class)}</span></div>`;
        }).join("");
        els.instanceLayer.innerHTML = masks + boxes;
        els.instanceCount.textContent = `${sample.instance.instances.length} 个实例`;
        els.instanceMap.textContent = `Mask AP ${(sample.instance.maskAP * 100).toFixed(1)}%`;
        els.instanceLegend.innerHTML = sample.instance.instances.map((item) => `<span><i style="background:${esc(item.color)}"></i>#${item.id} ${esc(item.class)}</span>`).join("");
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
        els.sampleName.textContent = sample.name;
        els.sampleResolution.textContent = `分辨率：${sample.width} × ${sample.height}`;
        els.status.textContent = `${sample.id.toUpperCase()} · PRESET`;
        els.thresholdOutput.textContent = state.confidence.toFixed(2);
        renderSamples();
        renderImages(sample);
        renderClassification(sample);
        renderDetection(sample);
        renderSemantic(sample);
        renderInstance(sample);
        renderState();
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
        if (sample) renderDetection(sample);
    });
    els.colorScheme?.addEventListener("change", () => {
        state.colorScheme = els.colorScheme.value;
        renderState();
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
