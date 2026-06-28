(function () {
    const root = document.querySelector("[data-multimodal-lab]");
    if (!root || !window.FrontierPlayer) return;

    const DEFAULT_DATA = {
        modalities: [
            { id: "image", label: "Image", encoder: "Image Encoder", embedding: "E_img", color: "#2563eb" },
            { id: "text", label: "Text", encoder: "Text Encoder", embedding: "E_text", color: "#0891b2" },
            { id: "ocr", label: "OCR", encoder: "OCR Encoder", embedding: "E_ocr", color: "#10b981" },
            { id: "audio", label: "Audio", encoder: "Audio Encoder", embedding: "E_audio", color: "#f59e0b" },
            { id: "layout", label: "Layout", encoder: "Layout Encoder", embedding: "E_layout", color: "#7c3aed" },
        ],
        fusionModes: {
            early: { label: "Early Fusion", summary: "所有 token 先合并，再进入统一编码器。" },
            late: { label: "Late Fusion", summary: "各模态先独立编码，最后融合分数或 logits。" },
            cross: { label: "Cross Attention", summary: "一个模态作为 Query，另一个模态作为 Key/Value。" },
            unified: { label: "Unified Token", summary: "不同模态被组织成统一 token 序列。" },
        },
        tasks: {
            retrieval: { label: "图文检索", output: "Top-k matched text/image", metric: "Recall@K" },
            vqa: { label: "视觉问答", output: "answer tokens: [图中] [有] [车辆] [和] [道路]", metric: "Accuracy" },
            caption: { label: "图像描述", output: "caption: 一张包含道路、文字和场景布局的图像。", metric: "BLEU / CIDEr" },
            grounding: { label: "区域定位", output: "bbox / mask highlight: target region", metric: "Grounding IoU" },
            classification: { label: "多模态分类", output: "label: urban document scene · score 0.86", metric: "Accuracy" },
        },
    };

    const STEPS = [
        {
            id: "inputs",
            label: "Inputs",
            short: "多模态输入",
            note: "多种模态作为同一任务管线的输入。",
            input: "Image / Text / OCR / Audio / Layout",
            encoder: "raw modality adapters",
            fusion: "not fused yet",
            task: "prepare task request",
            scenario: "需要同时读取视觉、文本和结构信息的场景。",
            summary: "系统先收集不同模态输入，并保留每种模态的结构差异。",
            formula: "X = {image, text, ocr, audio, layout}",
        },
        {
            id: "encoders",
            label: "Encoders",
            short: "独立编码",
            note: "不同模态进入各自 encoder，输出 E_img、E_text 等 embedding。",
            input: "selected modalities",
            encoder: "modality-specific encoders",
            fusion: "embedding preparation",
            task: "shared representation",
            scenario: "各模态尺度和采样方式不同，先独立编码更稳定。",
            summary: "Image/Text/OCR/Audio/Layout 分别输出 embedding，为后续对齐做准备。",
            formula: "E_m = Encoder_m(X_m)",
        },
        {
            id: "alignment",
            label: "Alignment",
            short: "统一空间",
            note: "不同 embedding 被对齐到统一语义空间。",
            input: "modality embeddings",
            encoder: "projection heads",
            fusion: "semantic alignment",
            task: "retrieval-ready representations",
            scenario: "图文检索和跨模态匹配依赖统一空间。",
            summary: "这里复用 CLIP 的向量空间概念，但输入模态更多。",
            formula: "Z_m = Normalize(Project(E_m))",
        },
        {
            id: "fusion",
            label: "Fusion",
            short: "融合策略",
            note: "Early、Late、Cross Attention 和 Unified Token 展示不同融合时机。",
            input: "aligned embeddings / tokens",
            encoder: "fusion block",
            fusion: "early / late / cross / unified",
            task: "joint task state",
            scenario: "任务复杂度和延迟预算决定融合方式。",
            summary: "不同融合策略不是优劣排序，而是针对输入结构和任务需求的选择。",
            formula: "H = Fusion(E_img, E_text, E_ocr, E_audio, E_layout)",
        },
        {
            id: "task",
            label: "Task Output",
            short: "多任务输出",
            note: "根据任务选择切换检索、问答、描述、定位和分类输出。",
            input: "fused representation",
            encoder: "task head",
            fusion: "Head(Fusion(...))",
            task: "retrieval / VQA / caption / grounding / classification",
            scenario: "同一融合状态可接不同任务头。",
            summary: "多模态系统的价值在于把不同输入组织成统一任务接口。",
            formula: "Output = Head(H)",
        },
        {
            id: "evaluation",
            label: "Evaluation",
            short: "指标",
            note: "不同任务需要不同指标：Recall@K、Accuracy、BLEU、IoU 等。",
            input: "task output + target",
            encoder: "metric adapters",
            fusion: "evaluation protocol",
            task: "quality report",
            scenario: "多模态评测常同时关注自动指标和人工偏好。",
            summary: "评价指标必须跟任务类型对齐，不能用一个分数概括所有能力。",
            formula: "metric = Evaluate(Output, Target)",
        },
    ];

    const el = {
        modalityButtons: Array.from(root.querySelectorAll("[data-mm-modality]")),
        fusion: root.querySelector('[data-mm-control="fusion"]'),
        task: root.querySelector('[data-mm-control="task"]'),
        displayButtons: Array.from(root.querySelectorAll("[data-mm-display]")),
        stage: root.querySelector("[data-mm-stage]"),
        pipeline: root.querySelector("[data-mm-pipeline]"),
        stageTitle: root.querySelector("[data-mm-stage-title]"),
        chips: {
            modalities: root.querySelector('[data-mm-chip="modalities"]'),
            fusion: root.querySelector('[data-mm-chip="fusion"]'),
            task: root.querySelector('[data-mm-chip="task"]'),
        },
        summary: {
            modalities: root.querySelector('[data-mm-summary="modalities"]'),
            fusion: root.querySelector('[data-mm-summary="fusion"]'),
            task: root.querySelector('[data-mm-summary="task"]'),
            metric: root.querySelector('[data-mm-summary="metric"]'),
        },
        notes: {
            step: root.querySelector('[data-mm-note="step"]'),
            summary: root.querySelector('[data-mm-note="summary"]'),
            modalities: root.querySelector('[data-mm-note="modalities"]'),
            input: root.querySelector('[data-mm-note="input"]'),
            encoder: root.querySelector('[data-mm-note="encoder"]'),
            fusion: root.querySelector('[data-mm-note="fusion"]'),
            task: root.querySelector('[data-mm-note="task"]'),
            scenario: root.querySelector('[data-mm-note="scenario"]'),
            relation: root.querySelector('[data-mm-note="relation"]'),
            formula: root.querySelector('[data-mm-note="formula"]'),
            formulaNote: root.querySelector('[data-mm-note="formulaNote"]'),
        },
    };

    const state = {
        data: null,
        active: ["image", "text", "ocr", "audio", "layout"],
        fusion: "cross",
        task: "vqa",
        display: "pipeline",
        player: null,
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function alignStageTop() {
        const target = el.stageTitle?.closest(".frontier-algo-stage");
        if (!target) return;
        window.requestAnimationFrame(() => {
            target.scrollIntoView({ block: "start", behavior: "auto" });
        });
    }

    function fetchJson(url) {
        return fetch(url, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        });
    }

    function modalities() {
        return state.data?.modalities?.length ? state.data.modalities : DEFAULT_DATA.modalities;
    }

    function activeModalities() {
        const activeSet = new Set(state.active);
        return modalities().filter((item) => activeSet.has(item.id));
    }

    function fusionModes() {
        return state.data?.fusionModes || DEFAULT_DATA.fusionModes;
    }

    function tasks() {
        return state.data?.tasks || DEFAULT_DATA.tasks;
    }

    function currentFusion() {
        return fusionModes()[state.fusion] || fusionModes().cross;
    }

    function currentTask() {
        return tasks()[state.task] || tasks().vqa;
    }

    function displayForStep(stepId) {
        if (stepId === "encoders" || stepId === "alignment") return "tokens";
        if (stepId === "fusion") return "matrix";
        if (stepId === "task" || stepId === "evaluation") return "output";
        return "pipeline";
    }

    function stepForDisplay(display) {
        return { pipeline: 0, tokens: 1, matrix: 3, output: 4 }[display] ?? 0;
    }

    function displayLabel() {
        return {
            pipeline: "Pipeline",
            tokens: "Token View",
            matrix: "Fusion Matrix",
            output: "Task Output",
        }[state.display] || "Pipeline";
    }

    function modalityCardsMarkup() {
        return `
            <div class="mm-input-grid">
                ${activeModalities().map((item, index) => `
                    <article class="mm-modality-card mm-modality-card--${escapeHtml(item.id)}" style="--mm-color:${escapeHtml(item.color)};--mm-delay:${index * 70}ms">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(inputLabel(item.id))}</strong>
                        <small>${escapeHtml(item.encoder)} input</small>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function inputLabel(id) {
        return {
            image: "scene card",
            text: "question prompt",
            ocr: "detected text box",
            audio: "waveform segment",
            layout: "document grid",
        }[id] || "input card";
    }

    function encoderMarkup() {
        return `
            <div class="mm-encoder-lane">
                ${activeModalities().map((item, index) => `
                    <article style="--mm-color:${escapeHtml(item.color)};--mm-delay:${index * 80}ms">
                        <span>${escapeHtml(item.encoder)}</span>
                        <strong>${escapeHtml(item.embedding)}</strong>
                        <i><b></b></i>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function alignmentMarkup() {
        return `
            <div class="mm-alignment-space">
                ${activeModalities().map((item, index) => {
                    const x = 20 + (index % 3) * 24;
                    const y = 28 + Math.floor(index / 3) * 28;
                    return `<span style="--x:${x}%;--y:${y}%;--mm-color:${escapeHtml(item.color)};--mm-delay:${index * 90}ms">${escapeHtml(item.embedding)}</span>`;
                }).join("")}
                <strong>Unified semantic space</strong>
            </div>
        `;
    }

    function fusionComparisonMarkup() {
        const items = [
            ["early", "Early Fusion", "tokens first"],
            ["late", "Late Fusion", "scores later"],
            ["cross", "Cross Attention", "Q/K/V links"],
            ["unified", "Unified Token", "single sequence"],
        ];
        return `
            <div class="mm-fusion-grid">
                ${items.map((item, index) => `
                    <article class="${state.fusion === item[0] ? "is-active" : ""}" style="--mm-delay:${index * 80}ms">
                        <span>${escapeHtml(item[1])}</span>
                        <div class="mm-mini-flow mm-mini-flow--${escapeHtml(item[0])}">
                            <i></i><i></i><i></i><b></b>
                        </div>
                        <strong>${escapeHtml(item[2])}</strong>
                        <small>${escapeHtml(fusionModes()[item[0]]?.summary || "")}</small>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function fusionMatrixMarkup() {
        const active = activeModalities();
        return `
            <div class="mm-fusion-matrix" style="--mm-cols:${active.length + 1}">
                <span></span>
                ${active.map((item) => `<strong>${escapeHtml(item.label)}</strong>`).join("")}
                ${active.map((row, rowIndex) => `
                    <strong>${escapeHtml(row.label)}</strong>
                    ${active.map((col, colIndex) => {
                        const score = row.id === col.id ? 0.96 : 0.48 + ((rowIndex + colIndex) % 4) * 0.11;
                        return `<i style="--score:${Math.round(score * 100)}%;--mm-delay:${(rowIndex + colIndex) * 30}ms">${score.toFixed(2)}</i>`;
                    }).join("")}
                `).join("")}
            </div>
        `;
    }

    function taskOutputMarkup() {
        const task = currentTask();
        return `
            <div class="mm-task-output mm-task-output--${escapeHtml(state.task)}">
                <span>${escapeHtml(task.label)}</span>
                <strong>${escapeHtml(task.output)}</strong>
                <div class="mm-output-visual">
                    <i></i><i></i><i></i><b></b>
                </div>
                <small>Metric: ${escapeHtml(task.metric)}</small>
            </div>
        `;
    }

    function evaluationMarkup() {
        const metrics = ["Recall@K", "Accuracy", "BLEU / CIDEr", "Grounding IoU", "Human Preference"];
        return `
            <div class="mm-metric-chips">
                ${metrics.map((metric, index) => `<span class="${metric === currentTask().metric ? "is-active" : ""}" style="--mm-delay:${index * 60}ms">${escapeHtml(metric)}</span>`).join("")}
            </div>
        `;
    }

    function architectureMarkup(stepId) {
        const activeIndex = {
            inputs: 0,
            encoders: 1,
            alignment: 1,
            fusion: 2,
            task: 3,
            evaluation: 3,
        }[stepId] ?? 0;
        const selected = activeModalities().map((item) => item.label).join(" / ");
        const nodes = [
            ["多模态输入", "Inputs", selected || "Image / Text / OCR / Audio / Layout"],
            ["模态编码器", "Encoders", "每种输入进入专用 Encoder"],
            ["Fusion / Router", "融合路由", "统一 token 或 cross-attention"],
            ["Task Heads", "任务头", "检索、问答、描述、定位、分类"],
        ];
        return `
            <div class="model-arch-graph" aria-label="多模态统一网络架构图">
                <div class="model-arch-flow" style="--arch-cols:${nodes.length}">
                    ${nodes.map((node, index) => `
                        <article class="model-arch-node ${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-complete" : ""}">
                            <span>${escapeHtml(node[1])}</span>
                            <strong>${escapeHtml(node[0])}</strong>
                            <small>${escapeHtml(node[2])}</small>
                        </article>
                    `).join("")}
                </div>
                <div class="model-arch-caption">
                    <span>统一接口</span>
                    <strong>${escapeHtml(currentTask().label)} 读取同一融合状态</strong>
                </div>
            </div>
        `;
    }

    function renderStage() {
        const step = state.player.current();
        el.stage.innerHTML = `
            <div class="mm-stage-layout" data-step="${escapeHtml(step.id || "inputs")}" data-display="${escapeHtml(state.display)}">
                <section class="frontier-stage-card frontier-architecture-card mm-architecture-panel">
                    <div class="frontier-section-headline">
                        <strong>多模态网络架构图</strong>
                        <span>Encoders → Fusion / Router → Task Heads</span>
                    </div>
                    ${architectureMarkup(step.id || "inputs")}
                </section>
                <section class="frontier-stage-card mm-input-panel">
                    <div class="frontier-section-headline">
                        <strong>Inputs</strong>
                        <span>${escapeHtml(activeModalities().map((item) => item.label).join(" / "))}</span>
                    </div>
                    ${modalityCardsMarkup()}
                </section>

                <section class="frontier-stage-card mm-encoder-panel">
                    <div class="frontier-section-headline">
                        <strong>Encoders</strong>
                        <span>E_img / E_text / E_ocr / E_audio / E_layout</span>
                    </div>
                    ${encoderMarkup()}
                </section>

                <section class="frontier-stage-card mm-alignment-panel">
                    <div class="frontier-section-headline">
                        <strong>Alignment</strong>
                        <span>shared semantic space</span>
                    </div>
                    ${alignmentMarkup()}
                </section>

                <section class="frontier-stage-card mm-fusion-panel">
                    <div class="frontier-section-headline">
                        <strong>Fusion</strong>
                        <span>${escapeHtml(currentFusion().label)}</span>
                    </div>
                    ${fusionComparisonMarkup()}
                    ${fusionMatrixMarkup()}
                </section>

                <section class="frontier-stage-card mm-task-panel">
                    <div class="frontier-section-headline">
                        <strong>Task Output</strong>
                        <span>${escapeHtml(currentTask().label)}</span>
                    </div>
                    ${taskOutputMarkup()}
                </section>

                <section class="frontier-stage-card mm-eval-panel">
                    <div class="frontier-section-headline">
                        <strong>Evaluation</strong>
                        <span>task-specific metrics</span>
                    </div>
                    ${evaluationMarkup()}
                </section>
            </div>
        `;
    }

    function renderPipeline() {
        if (!el.pipeline) return;
        const currentIndex = state.player.index;
        el.pipeline.innerHTML = STEPS.map((step, index) => `
            <article class="${index === currentIndex ? "is-active" : ""} ${index < currentIndex ? "is-complete" : ""}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(step.label)}</strong>
                <small>${escapeHtml(step.short)}</small>
            </article>
        `).join("");
    }

    function renderControls() {
        const activeSet = new Set(state.active);
        el.modalityButtons.forEach((button) => {
            const active = activeSet.has(button.dataset.mmModality);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
        if (el.fusion) el.fusion.value = state.fusion;
        if (el.task) el.task.value = state.task;
        el.displayButtons.forEach((button) => {
            const active = button.dataset.mmDisplay === state.display;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function renderSummaryAndNotes() {
        const step = state.player.current();
        const activeLabels = activeModalities().map((item) => item.label);

        if (el.stageTitle) el.stageTitle.textContent = `${step.label} · ${currentFusion().label}`;
        if (el.chips.modalities) el.chips.modalities.textContent = activeLabels.join("/");
        if (el.chips.fusion) el.chips.fusion.textContent = currentFusion().label;
        if (el.chips.task) el.chips.task.textContent = currentTask().label;
        if (el.summary.modalities) el.summary.modalities.textContent = String(activeLabels.length);
        if (el.summary.fusion) el.summary.fusion.textContent = currentFusion().label;
        if (el.summary.task) el.summary.task.textContent = currentTask().label;
        if (el.summary.metric) el.summary.metric.textContent = currentTask().metric;

        if (el.notes.step) el.notes.step.textContent = step.label;
        if (el.notes.summary) el.notes.summary.textContent = step.summary;
        if (el.notes.modalities) el.notes.modalities.textContent = activeLabels.join(" / ");
        if (el.notes.input) el.notes.input.textContent = step.input;
        if (el.notes.encoder) el.notes.encoder.textContent = step.encoder;
        if (el.notes.fusion) el.notes.fusion.textContent = `${currentFusion().label}: ${currentFusion().summary}`;
        if (el.notes.task) el.notes.task.textContent = `${currentTask().label}: ${currentTask().output}`;
        if (el.notes.scenario) el.notes.scenario.textContent = step.scenario;
        if (el.notes.relation) el.notes.relation.textContent = "CLIP 提供图文 embedding 对齐；VLM 展示 prompt 与图像 token 融合；多模态理解扩展到 OCR、Audio、Layout 等输入。";
        if (el.notes.formula) {
            el.notes.formula.textContent = step.id === "task"
                ? "Output = Head(Fusion(E_img, E_text, E_ocr, E_audio, E_layout))"
                : step.formula;
        }
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = `${currentTask().metric} 是当前任务的主要参考指标；页面使用预设任务输出，不执行真实模型推理。`;
        }
    }

    function renderAll() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载多模态预设样例...</div>';
            return;
        }
        state.display = displayForStep(state.player.current().id);
        renderControls();
        renderStage();
        renderPipeline();
        renderSummaryAndNotes();
    }

    function bindEvents() {
        el.modalityButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const id = button.dataset.mmModality;
                if (!id) return;
                if (state.active.includes(id)) {
                    if (state.active.length <= 1) return;
                    state.active = state.active.filter((item) => item !== id);
                } else {
                    state.active = [...state.active, id];
                }
                renderAll();
            });
        });
        el.fusion?.addEventListener("change", () => {
            state.fusion = el.fusion.value || "cross";
            state.player.setStep(3);
            alignStageTop();
        });
        el.task?.addEventListener("change", () => {
            state.task = el.task.value || "vqa";
            state.player.setStep(4);
            alignStageTop();
        });
        el.displayButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.display = button.dataset.mmDisplay || "pipeline";
                state.player.setStep(stepForDisplay(state.display));
                alignStageTop();
            });
        });
    }

    function initWithData(data) {
        state.data = data || DEFAULT_DATA;
        state.active = modalities().map((item) => item.id);
        renderAll();
    }

    function init() {
        state.player = new window.FrontierPlayer(root, {
            onStepChange: renderAll,
        });
        state.player.setSteps(STEPS);
        bindEvents();

        fetchJson(root.dataset.samplesUrl)
            .then(initWithData)
            .catch((error) => {
                console.warn("多模态理解预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
