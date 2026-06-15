(function () {
    const root = document.querySelector(".vision-lab");
    if (!root) return;

    root.classList.add("is-ready");

    const visionTasksApi = {
        page: root.dataset.visionPage || "overview",
        dataRoot: window.cvclassUrl("/static/assets/vision_tasks/data"),
    };
    window.CVClassVisionTasks = Object.freeze(visionTasksApi);

    if (visionTasksApi.page !== "overview") return;

    const workbench = root.querySelector("[data-overview-workbench]");
    if (!workbench) return;

    const elements = {
        sampleList: workbench.querySelector("[data-sample-list]"),
        sampleCount: workbench.querySelector("[data-sample-count]"),
        sampleName: workbench.querySelector("[data-sample-name]"),
        sampleResolution: workbench.querySelector("[data-sample-resolution]"),
        displayModes: [...workbench.querySelectorAll("[data-display-mode]")],
        taskButtons: [...workbench.querySelectorAll("[data-task-select]")],
        taskCards: [...workbench.querySelectorAll("[data-task-card]")],
        lineageItems: [...workbench.querySelectorAll("[data-lineage-task]")],
        schemaItems: [...workbench.querySelectorAll("[data-schema-task]")],
        resultGrid: workbench.querySelector("[data-result-grid]"),
        threshold: workbench.querySelector("[data-confidence-threshold]"),
        thresholdOutput: workbench.querySelector("[data-confidence-output]"),
        colorScheme: workbench.querySelector("[data-color-scheme]"),
        status: workbench.querySelector("[data-overview-status]"),
        scenes: [...workbench.querySelectorAll("[data-overview-scene]")],
        classificationBars: workbench.querySelector("[data-classification-bars]"),
        classificationTop1: workbench.querySelector("[data-classification-top1]"),
        detectionLayer: workbench.querySelector("[data-detection-layer]"),
        detectionLegend: workbench.querySelector("[data-detection-legend]"),
        detectionCount: workbench.querySelector("[data-detection-count]"),
        semanticLayer: workbench.querySelector("[data-semantic-layer]"),
        semanticLegend: workbench.querySelector("[data-semantic-legend]"),
        semanticMiou: workbench.querySelector("[data-semantic-miou]"),
        instanceLayer: workbench.querySelector("[data-instance-layer]"),
        instanceLegend: workbench.querySelector("[data-instance-legend]"),
        instanceCount: workbench.querySelector("[data-instance-count]"),
        instanceMap: workbench.querySelector("[data-instance-map]"),
    };

    const state = {
        data: null,
        sampleId: "",
        task: "classification",
        displayMode: "parallel",
        confidence: Number(elements.threshold?.value || 0.5),
        colorScheme: "system",
    };

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getCurrentSample() {
        return state.data?.samples.find((sample) => sample.id === state.sampleId) || state.data?.samples[0];
    }

    function toPercent(value, total) {
        return `${(value / total) * 100}%`;
    }

    function polygonPoints(points, width, height) {
        return points.map(([x, y]) => `${(x / width) * 100},${(y / height) * 100}`).join(" ");
    }

    function makeSvg(polygons, width, height, className) {
        const polygonMarkup = polygons.map((polygon) => {
            const label = polygon.label
                ? `<text x="${polygon.label[0]}" y="${polygon.label[1]}" class="overview-svg-label">${escapeHtml(polygon.label[2])}</text>`
                : "";
            return `<g>
                <polygon points="${polygonPoints(polygon.points, width, height)}" fill="${escapeHtml(polygon.color)}" fill-opacity="${polygon.opacity ?? 0.68}" stroke="${escapeHtml(polygon.stroke || polygon.color)}" stroke-width="${polygon.strokeWidth || 1.5}" vector-effect="non-scaling-stroke"></polygon>
                ${label}
            </g>`;
        }).join("");

        return `<svg class="${className}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${polygonMarkup}</svg>`;
    }

    function renderSamples() {
        if (!elements.sampleList || !state.data) return;

        elements.sampleCount.textContent = `${state.data.samples.length} PRESETS`;
        elements.sampleList.innerHTML = state.data.samples.map((sample, index) => `
            <button type="button" data-sample-select="${escapeHtml(sample.id)}" aria-pressed="${sample.id === state.sampleId}">
                <span class="overview-sample-thumb" data-scene="${escapeHtml(sample.scene.variant)}">
                    <i></i><i></i><i></i><i></i>
                </span>
                <span><b>0${index + 1}</b><small>${escapeHtml(sample.short_name)}</small></span>
            </button>
        `).join("");

        elements.sampleList.querySelectorAll("[data-sample-select]").forEach((button) => {
            button.addEventListener("click", () => {
                state.sampleId = button.dataset.sampleSelect;
                renderAll();
            });
        });
    }

    function renderScene(sample) {
        elements.scenes.forEach((scene) => {
            scene.dataset.scene = sample.scene.variant;
            scene.style.setProperty("--scene-sky", sample.scene.palette.sky);
            scene.style.setProperty("--scene-building", sample.scene.palette.building);
            scene.style.setProperty("--scene-building-alt", sample.scene.palette.building_alt);
            scene.style.setProperty("--scene-road", sample.scene.palette.road);
            scene.style.setProperty("--scene-green", sample.scene.palette.vegetation);
            scene.style.setProperty("--scene-vehicle", sample.scene.palette.vehicle);
        });
    }

    function renderClassification(sample) {
        const top5 = sample.classification.top5;
        elements.classificationTop1.textContent = `Top-1: ${top5[0].label} ${(top5[0].score * 100).toFixed(1)}%`;
        elements.classificationBars.innerHTML = top5.map((item, index) => `
            <div class="overview-probability-row">
                <span>${escapeHtml(item.label)}</span>
                <i><b style="width:${item.score * 100}%"></b></i>
                <strong>${(item.score * 100).toFixed(index === 0 ? 1 : 1)}%</strong>
            </div>
        `).join("");
    }

    function renderDetection(sample) {
        const boxes = sample.detection.boxes;
        const kept = boxes.filter((box) => box.score >= state.confidence);
        elements.detectionCount.textContent = `${kept.length} / ${boxes.length} 个目标`;
        elements.detectionLayer.innerHTML = boxes.map((box) => {
            const [x1, y1, x2, y2] = box.bbox;
            const isFiltered = box.score < state.confidence;
            return `<div class="overview-detection-box${isFiltered ? " is-filtered" : ""}"
                style="left:${toPercent(x1, sample.width)};top:${toPercent(y1, sample.height)};width:${toPercent(x2 - x1, sample.width)};height:${toPercent(y2 - y1, sample.height)};--box-color:${escapeHtml(box.color)}"
                data-score="${box.score}">
                <span>${escapeHtml(box.class)} ${(box.score * 100).toFixed(0)}%</span>
            </div>`;
        }).join("");

        elements.detectionLegend.innerHTML = sample.detection.classes.map((item) => `
            <span><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.name)}</span>
        `).join("");
    }

    function renderSemantic(sample) {
        const classMap = new Map(sample.semantic.classes.map((item) => [item.id, item]));
        const polygons = sample.semantic.regions.map((region) => {
            const classInfo = classMap.get(region.class_id);
            return {
                points: region.polygon,
                color: classInfo.color,
                opacity: region.opacity ?? 0.66,
            };
        });

        elements.semanticLayer.innerHTML = makeSvg(polygons, sample.width, sample.height, "overview-semantic-svg");
        elements.semanticMiou.textContent = `mIoU ${(sample.semantic.miou * 100).toFixed(1)}%`;
        elements.semanticLegend.innerHTML = sample.semantic.classes.map((item) => `
            <span><i style="background:${escapeHtml(item.color)}"></i>${escapeHtml(item.cn)}</span>
        `).join("");
    }

    function renderInstance(sample) {
        const polygons = sample.instance.instances.map((instance) => ({
            points: instance.mask,
            color: instance.color,
            opacity: 0.62,
            stroke: instance.color,
            strokeWidth: 2,
        }));

        const masks = makeSvg(polygons, sample.width, sample.height, "overview-instance-svg");
        const boxes = sample.instance.instances.map((instance) => {
            const [x1, y1, x2, y2] = instance.bbox;
            return `<div class="overview-instance-box"
                style="left:${toPercent(x1, sample.width)};top:${toPercent(y1, sample.height)};width:${toPercent(x2 - x1, sample.width)};height:${toPercent(y2 - y1, sample.height)};--box-color:${escapeHtml(instance.color)}">
                <span>ID ${instance.id} · ${escapeHtml(instance.class)}</span>
            </div>`;
        }).join("");

        elements.instanceLayer.innerHTML = masks + boxes;
        elements.instanceCount.textContent = `${sample.instance.instances.length} 个实例`;
        elements.instanceMap.textContent = `Mask AP ${(sample.instance.maskAP * 100).toFixed(1)}%`;
        elements.instanceLegend.innerHTML = sample.instance.instances.map((instance) => `
            <span><i style="background:${escapeHtml(instance.color)}"></i>#${instance.id} ${escapeHtml(instance.class)}</span>
        `).join("");
    }

    function renderState() {
        workbench.dataset.colorScheme = state.colorScheme;
        elements.resultGrid.dataset.displayMode = state.displayMode;
        elements.resultGrid.dataset.activeTask = state.task;

        elements.displayModes.forEach((button) => {
            const active = button.dataset.displayMode === state.displayMode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        elements.taskButtons.forEach((button) => {
            const active = button.dataset.taskSelect === state.task;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-checked", String(active));
        });

        elements.taskCards.forEach((card) => {
            card.classList.toggle("is-selected", card.dataset.taskCard === state.task);
        });

        elements.lineageItems.forEach((item) => {
            item.classList.toggle("is-selected", item.dataset.lineageTask === state.task);
        });

        elements.schemaItems.forEach((item) => {
            item.classList.toggle("is-selected", item.dataset.schemaTask === state.task);
        });
    }

    function renderAll() {
        const sample = getCurrentSample();
        if (!sample) return;

        elements.sampleName.textContent = sample.name;
        elements.sampleResolution.textContent = `分辨率：${sample.width} × ${sample.height}`;
        elements.status.textContent = `${sample.id.toUpperCase()} · PRESET`;
        elements.thresholdOutput.textContent = state.confidence.toFixed(2);

        renderSamples();
        renderScene(sample);
        renderClassification(sample);
        renderDetection(sample);
        renderSemantic(sample);
        renderInstance(sample);
        renderState();
    }

    elements.displayModes.forEach((button) => {
        button.addEventListener("click", () => {
            state.displayMode = button.dataset.displayMode;
            renderState();
        });
    });

    elements.taskButtons.forEach((button) => {
        button.addEventListener("click", () => {
            state.task = button.dataset.taskSelect;
            renderState();
        });
    });

    elements.taskCards.forEach((card) => {
        card.addEventListener("click", () => {
            state.task = card.dataset.taskCard;
            renderState();
        });
    });

    elements.threshold?.addEventListener("input", () => {
        state.confidence = Number(elements.threshold.value);
        elements.thresholdOutput.textContent = state.confidence.toFixed(2);
        const sample = getCurrentSample();
        if (sample) renderDetection(sample);
    });

    elements.colorScheme?.addEventListener("change", () => {
        state.colorScheme = elements.colorScheme.value;
        renderState();
    });

    fetch(`${visionTasksApi.dataRoot}/vision_task_samples.json`)
        .then((response) => {
            if (!response.ok) throw new Error(`样例数据加载失败：HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            if (!Array.isArray(data.samples) || data.samples.length === 0) {
                throw new Error("样例数据缺少 samples");
            }
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            renderAll();
        })
        .catch((error) => {
            console.error(error);
            elements.status.textContent = "SAMPLE DATA ERROR";
            elements.sampleName.textContent = "样例数据加载失败";
            elements.sampleResolution.textContent = "请检查 vision_task_samples.json";
        });
}());
