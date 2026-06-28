(function () {
    const root = document.querySelector("[data-dino-lab]");
    if (!root || !window.FrontierPlayer) return;

    const DEFAULT_DATA = {
        status: "机制拆解 · 教学动画；预设样例 · 非真实推理",
        defaultSample: "animal",
        samples: [
            {
                id: "animal",
                label: "动物主体",
                scene: "animal",
                summary: "内置 fallback 样例：多种 crop 对齐到同一主体表征。",
                crops: [
                    { id: "gA", label: "Global View A", type: "global", x: 8, y: 8, w: 82, h: 82 },
                    { id: "gB", label: "Global View B", type: "global", x: 16, y: 13, w: 76, h: 76 },
                    { id: "l1", label: "Local Crop 1", type: "local", x: 38, y: 26, w: 34, h: 34 },
                    { id: "l2", label: "Local Crop 2", type: "local", x: 24, y: 42, w: 32, h: 32 },
                    { id: "l3", label: "Local Crop 3", type: "local", x: 50, y: 48, w: 28, h: 28 },
                    { id: "l4", label: "Local Crop 4", type: "local", x: 18, y: 62, w: 30, h: 30 },
                ],
                distribution: {
                    labels: ["proto 07", "proto 18", "proto 24", "proto 31", "proto 42"],
                    teacher: [0.34, 0.23, 0.18, 0.14, 0.11],
                    studentStart: [0.14, 0.33, 0.16, 0.26, 0.11],
                    studentAligned: [0.31, 0.24, 0.19, 0.15, 0.11],
                },
                attention: {
                    average: { x: 48, y: 54, x2: 57, y2: 42, label: "主体区域" },
                    head1: { x: 58, y: 42, x2: 42, y2: 58, label: "头部和身体轮廓" },
                    head2: { x: 43, y: 58, x2: 31, y2: 68, label: "主体躯干" },
                    head3: { x: 29, y: 75, x2: 72, y2: 28, label: "背景上下文" },
                },
            },
        ],
    };

    const STEPS = [
        {
            id: "views",
            label: "Image Views",
            short: "multi-crop",
            note: "同一张无标签图像被裁成多个 global / local views。",
            input: "无标签图像",
            compute: "multi-crop augmentation",
            output: "2 个 global views + 4 个 local crops",
            formula: "views = crop_aug(image)",
            relation: "DINO 使用 ViT 处理每个 view 的 token 序列。",
            ssl: "没有人工标签，只有同一图像的不同视图。",
            summary: "多视图裁剪让模型从局部和整体中学习一致语义。",
        },
        {
            id: "student",
            label: "Student",
            short: "local/global 输入",
            note: "多种 crop 输入 Student ViT，得到 student output distribution。",
            input: "Local / Global Views",
            compute: "Student ViT forward",
            output: "student output distribution",
            formula: "p_student = softmax(g_s(v_i) / τ_s)",
            relation: "Student 与普通 ViT 前向结构相似，但训练目标来自 teacher。",
            ssl: "student 学习预测 teacher 给出的 soft target。",
            summary: "student 接收更多局部 crop，学习把不同视图对齐到同一语义。",
        },
        {
            id: "teacher",
            label: "Teacher",
            short: "global 输入",
            note: "global view 输入 Teacher ViT；teacher 不直接由梯度更新。",
            input: "Global View A / B",
            compute: "Teacher ViT forward, no direct gradient",
            output: "teacher output distribution",
            formula: "p_teacher = softmax(g_t(v_g) / τ_t)",
            relation: "teacher 与 student 同构，但参数来自 student 的 EMA。",
            ssl: "teacher 输出作为无标签训练目标。",
            summary: "teacher 提供稳定目标，减少 student 自己追自己造成的坍塌。",
        },
        {
            id: "distribution",
            label: "Distribution",
            short: "soft target 对齐",
            note: "student 概率条逐渐靠近 teacher soft target。",
            input: "student distribution + teacher distribution",
            compute: "temperature softmax + centering",
            output: "aligned output distribution",
            formula: "align(p_student, p_teacher)",
            relation: "ViT 输出不只做人工分类，也可以作为自监督原型分布。",
            ssl: "目标来自 teacher 分布，不来自人工 class label。",
            summary: "分布对齐展示 student 从错位概率逐步靠近 teacher soft target。",
        },
        {
            id: "loss",
            label: "Loss",
            short: "交叉熵",
            note: "DINO 没有人工 class label，teacher soft target 作为学习目标。",
            input: "p_teacher, p_student",
            compute: "cross entropy over teacher soft target",
            output: "loss 下降",
            formula: "L = -Σ p_teacher log(p_student)",
            relation: "分类任务的 cross entropy 需要人工标签；DINO 的 target 来自 teacher。",
            ssl: "同一图像不同视图之间互相监督。",
            summary: "loss 衡量 student 分布和 teacher 分布的距离。",
        },
        {
            id: "ema",
            label: "EMA Update",
            short: "teacher 慢更新",
            note: "student 参数通过 EMA 更新 teacher，teacher 不直接反向传播。",
            input: "θ_student, θ_teacher",
            compute: "exponential moving average",
            output: "updated teacher parameters",
            formula: "θ_teacher ← m θ_teacher + (1-m) θ_student",
            relation: "ViT block 结构不变，训练更新机制改变了监督来源。",
            ssl: "teacher 是 student 历史参数的平滑版本。",
            summary: "EMA 让 teacher 稳定追随 student，提供更平滑的目标。",
        },
        {
            id: "attention",
            label: "Attention",
            short: "emergent attention",
            note: "无检测框/无分割标签，也可能自动关注主体区域。",
            input: "trained DINO ViT tokens",
            compute: "read selected self-attention head",
            output: "attention heatmap + feature clusters",
            formula: "A_head = softmax(QKᵀ / √d)",
            relation: "DINO 仍建立在 ViT attention 上，但训练来自自监督对齐。",
            ssl: "主体关注是从无标签视图一致性中涌现的可视化现象。",
            summary: "attention map 和 feature space 都使用预设数据解释机制，不执行真实训练。",
        },
    ];

    const el = {
        sample: root.querySelector('[data-dino-control="sample"]'),
        viewMode: root.querySelector('[data-dino-control="viewMode"]'),
        network: root.querySelector('[data-dino-control="network"]'),
        head: root.querySelector('[data-dino-control="head"]'),
        representationButtons: Array.from(root.querySelectorAll("[data-dino-representation]")),
        stage: root.querySelector("[data-dino-stage]"),
        pipeline: root.querySelector("[data-dino-pipeline]"),
        stageTitle: root.querySelector("[data-dino-stage-title]"),
        alignment: root.querySelector("[data-dino-alignment]"),
        chips: {
            sample: root.querySelector('[data-dino-chip="sample"]'),
            views: root.querySelector('[data-dino-chip="views"]'),
            mode: root.querySelector('[data-dino-chip="mode"]'),
        },
        summary: {
            sample: root.querySelector('[data-dino-summary="sample"]'),
            views: root.querySelector('[data-dino-summary="views"]'),
            training: root.querySelector('[data-dino-summary="training"]'),
            step: root.querySelector('[data-dino-summary="step"]'),
        },
        notes: {
            step: root.querySelector('[data-dino-note="step"]'),
            summary: root.querySelector('[data-dino-note="summary"]'),
            input: root.querySelector('[data-dino-note="input"]'),
            compute: root.querySelector('[data-dino-note="compute"]'),
            output: root.querySelector('[data-dino-note="output"]'),
            relation: root.querySelector('[data-dino-note="relation"]'),
            ssl: root.querySelector('[data-dino-note="ssl"]'),
            formula: root.querySelector('[data-dino-note="formula"]'),
            formulaNote: root.querySelector('[data-dino-note="formulaNote"]'),
        },
    };

    const state = {
        data: null,
        sampleId: "",
        viewMode: "multi",
        network: "both",
        representation: "distribution",
        head: "average",
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

    function fetchJson(url) {
        return fetch(url, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        });
    }

    function sample() {
        const samples = state.data?.samples || DEFAULT_DATA.samples;
        return samples.find((item) => item.id === state.sampleId) || samples[0];
    }

    function visibleCrops() {
        const crops = sample().crops || [];
        if (state.viewMode === "global") return crops.filter((crop) => crop.type === "global");
        if (state.viewMode === "local") return crops.filter((crop) => crop.type === "local");
        return crops;
    }

    function attentionFocus() {
        const current = sample().attention || {};
        return current[state.head] || current.average || { x: 50, y: 50, x2: 62, y2: 42, label: "主体区域" };
    }

    function representationLabel() {
        return {
            distribution: "Output Distribution",
            feature: "Feature Space",
            attention: "Attention Map",
        }[state.representation] || "Output Distribution";
    }

    function sceneMarkup(currentSample) {
        return `
            <div class="frontier-sample-scene" data-scene="${escapeHtml(currentSample.scene || currentSample.id)}" aria-hidden="true">
                <span class="f-scene-sky"></span>
                <span class="f-scene-building f-scene-building--left"></span>
                <span class="f-scene-building f-scene-building--right"></span>
                <span class="f-scene-ground"></span>
                <span class="f-scene-subject"></span>
            </div>
        `;
    }

    function cropLayerMarkup() {
        return `
            <div class="dino-crop-layer">
                ${visibleCrops().map((crop, index) => `
                    <span
                        class="dino-crop-box ${crop.type === "local" ? "is-local" : "is-global"}"
                        data-label="${escapeHtml(crop.label)}"
                        style="--x:${crop.x}%;--y:${crop.y}%;--w:${crop.w}%;--h:${crop.h}%;--crop-delay:${index * 70}ms"
                    ></span>
                `).join("")}
            </div>
        `;
    }

    function attentionLayerMarkup() {
        const focus = attentionFocus();
        return `
            <div
                class="dino-attention-layer"
                style="--focus-x:${Number(focus.x) || 50}%;--focus-y:${Number(focus.y) || 50}%;--focus2-x:${Number(focus.x2) || 62}%;--focus2-y:${Number(focus.y2) || 42}%"
                aria-hidden="true"
            ></div>
        `;
    }

    function viewStripMarkup() {
        return `
            <div class="dino-view-strip">
                ${visibleCrops().map((crop, index) => `
                    <article class="dino-view-card" style="--crop-delay:${index * 60}ms">
                        <strong>${escapeHtml(crop.label)}</strong>
                        <span>${crop.type === "global" ? "global crop → teacher/student" : "local crop → student only"}</span>
                        <i></i>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function branchMarkup(stepId) {
        const showStudent = state.network === "student" || state.network === "both";
        const showTeacher = state.network === "teacher" || state.network === "both";
        return `
            <div class="dino-branch-grid">
                <article class="dino-branch-node is-student ${showStudent ? "is-active" : "is-muted"}">
                    <span>Student</span>
                    <strong>Local / Global Views</strong>
                    <small>Student ViT 接收全部 multi-crop，并通过梯度更新。</small>
                </article>
                <i class="dino-flow-line dino-flow-line--student" aria-hidden="true"></i>
                <article class="dino-branch-node ${stepId === "distribution" || stepId === "loss" ? "is-active" : ""}">
                    <span>Output</span>
                    <strong>Prototype distribution</strong>
                    <small>student 与 teacher 输出在同一原型分布空间中比较。</small>
                </article>
                <i class="dino-flow-line dino-flow-line--teacher" aria-hidden="true"></i>
                <article class="dino-branch-node is-teacher ${showTeacher ? "is-active" : "is-muted"}">
                    <span>Teacher</span>
                    <strong>Global Views only</strong>
                    <small>Teacher ViT 不直接反向传播，由 EMA 更新参数。</small>
                </article>
            </div>
        `;
    }

    function distributionBars(values, labels, color) {
        return `
            <div class="dino-bars">
                ${labels.map((label, index) => `
                    <div class="dino-bar-row">
                        <span>${escapeHtml(label)}</span>
                        <i><b style="--bar-color:${color};--bar-width:${Math.round((values[index] || 0) * 100)}%"></b></i>
                        <strong>${Math.round((values[index] || 0) * 100)}%</strong>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function distributionMarkup(stepId) {
        const dist = sample().distribution || DEFAULT_DATA.samples[0].distribution;
        const labels = dist.labels || [];
        const aligned = ["distribution", "loss", "ema", "attention"].includes(stepId);
        const student = aligned ? dist.studentAligned : dist.studentStart;
        const loss = aligned ? "0.74" : "1.92";
        return `
            <div class="dino-distribution-grid">
                <section class="frontier-mini-card">
                    <div class="frontier-section-headline"><strong>Teacher output</strong><span>soft target</span></div>
                    ${distributionBars(dist.teacher || [], labels, "#10b981")}
                </section>
                <section class="frontier-mini-card">
                    <div class="frontier-section-headline"><strong>Student output</strong><span>${aligned ? "aligned" : "before alignment"}</span></div>
                    ${distributionBars(student || [], labels, "#2563eb")}
                </section>
            </div>
            <div class="dino-loss-readout">
                <div><span>Loss</span><strong>${loss}</strong></div>
                <div><span>Target</span><strong>teacher soft target</strong></div>
                <div><span>No labels</span><strong>class label = none</strong></div>
            </div>
        `;
    }

    function emaMarkup() {
        return `
            <div class="dino-ema-panel">
                <div class="dino-ema-node">
                    <strong>Student θ_s</strong>
                    <span>gradient update</span>
                </div>
                <i class="dino-ema-arrow" aria-hidden="true"></i>
                <div class="dino-ema-node">
                    <strong>Teacher θ_t</strong>
                    <span>EMA target</span>
                </div>
            </div>
        `;
    }

    function featureSpaceMarkup() {
        const current = visibleCrops();
        const samePoints = current.map((crop, index) => {
            const baseX = 25 + (index % 3) * 9 + (index > 2 ? 5 : 0);
            const baseY = 34 + Math.floor(index / 3) * 18 + (index % 2) * 5;
            const dx = 56 - baseX;
            const dy = 48 - baseY;
            return `<span class="dino-feature-point is-same" style="--x:${baseX}%;--y:${baseY}%;--cluster-dx:${dx * 0.45}px;--cluster-dy:${dy * 0.45}px;--point-delay:${index * 70}ms" title="${escapeHtml(crop.label)}"></span>`;
        }).join("");
        const others = [
            ["is-other-a", 76, 30],
            ["is-other-a", 82, 36],
            ["is-other-a", 73, 42],
            ["is-other-b", 26, 78],
            ["is-other-b", 32, 72],
            ["is-other-b", 38, 82],
        ].map((point, index) => `<span class="dino-feature-point ${point[0]}" style="--x:${point[1]}%;--y:${point[2]}%;--cluster-dx:0px;--cluster-dy:0px;--point-delay:${index * 55}ms"></span>`).join("");
        return `
            <div class="dino-feature-space" aria-label="二维 Feature Space">
                ${samePoints}
                ${others}
            </div>
        `;
    }

    function renderStage() {
        const currentSample = sample();
        const step = state.player.current();
        const stepId = step.id || "views";
        const focus = attentionFocus();

        el.stage.innerHTML = `
            <div
                class="dino-stage-layout"
                data-step="${escapeHtml(stepId)}"
                data-view-mode="${escapeHtml(state.viewMode)}"
                data-network="${escapeHtml(state.network)}"
                data-representation="${escapeHtml(state.representation)}"
            >
                <div class="dino-visual-stack">
                    <section class="frontier-stage-card dino-image-panel">
                        <div class="frontier-section-headline">
                            <strong>Input image / multi-crop</strong>
                            <span>${escapeHtml(currentSample.label)} · ${escapeHtml(state.viewMode)}</span>
                        </div>
                        <div class="frontier-sample-frame" data-caption="${escapeHtml(currentSample.label)} · no label">
                            ${sceneMarkup(currentSample)}
                            ${cropLayerMarkup()}
                            ${attentionLayerMarkup()}
                        </div>
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>View cards</strong>
                            <span>${visibleCrops().length} views</span>
                        </div>
                        ${viewStripMarkup()}
                    </section>
                </div>
                <div class="dino-side-stack">
                    <section class="frontier-stage-card dino-branch-panel">
                        <div class="frontier-section-headline">
                            <strong>Student / Teacher branches</strong>
                            <span>${escapeHtml(state.network)}</span>
                        </div>
                        ${branchMarkup(stepId)}
                    </section>
                    <section class="frontier-stage-card dino-distribution-panel">
                        <div class="frontier-section-headline">
                            <strong>Output distribution</strong>
                            <span>teacher target vs student</span>
                        </div>
                        ${distributionMarkup(stepId)}
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>EMA Update</strong>
                            <span>θ_teacher ← m θ_teacher + (1-m) θ_student</span>
                        </div>
                        ${emaMarkup()}
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>Feature Space / Attention</strong>
                            <span>${escapeHtml(focus.label || "主体区域")}</span>
                        </div>
                        ${featureSpaceMarkup()}
                    </section>
                </div>
            </div>
        `;
    }

    function renderPipeline() {
        const currentIndex = state.player.index;
        if (!el.pipeline) return;
        el.pipeline.innerHTML = STEPS.map((step, index) => `
            <article class="${index === currentIndex ? "is-active" : ""} ${index < currentIndex ? "is-complete" : ""}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(step.label)}</strong>
                <small>${escapeHtml(step.short)}</small>
            </article>
        `).join("");
    }

    function renderControls() {
        const samples = state.data?.samples || [];
        if (el.sample) {
            el.sample.innerHTML = samples.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} / ${escapeHtml(item.label)}</option>`).join("");
            el.sample.value = state.sampleId;
        }
        if (el.viewMode) el.viewMode.value = state.viewMode;
        if (el.network) el.network.value = state.network;
        if (el.head) el.head.value = state.head;
        el.representationButtons.forEach((button) => {
            const active = button.dataset.dinoRepresentation === state.representation;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function renderSummaryAndNotes() {
        const currentSample = sample();
        const step = state.player.current();
        const focus = attentionFocus();
        const viewCount = visibleCrops().length;

        if (el.stageTitle) el.stageTitle.textContent = `${step.label} · ${currentSample.label}`;
        if (el.chips.sample) el.chips.sample.textContent = currentSample.id;
        if (el.chips.views) el.chips.views.textContent = `${viewCount} views`;
        if (el.chips.mode) el.chips.mode.textContent = representationLabel();
        if (el.summary.sample) el.summary.sample.textContent = currentSample.id;
        if (el.summary.views) el.summary.views.textContent = String(viewCount);
        if (el.summary.training) el.summary.training.textContent = "teacher-student + EMA";
        if (el.summary.step) el.summary.step.textContent = step.label;

        if (el.notes.step) el.notes.step.textContent = step.label;
        if (el.notes.summary) el.notes.summary.textContent = step.summary;
        if (el.notes.input) el.notes.input.textContent = step.input;
        if (el.notes.compute) el.notes.compute.textContent = step.compute;
        if (el.notes.output) el.notes.output.textContent = step.output;
        if (el.notes.relation) el.notes.relation.textContent = step.relation;
        if (el.notes.ssl) el.notes.ssl.textContent = step.ssl;
        if (el.notes.formula) el.notes.formula.textContent = step.formula;
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = step.id === "attention"
                ? `${focus.label || "主体区域"}；attention map 使用预设 head 参数，不执行真实 DINO 推理。`
                : `${currentSample.summary} 页面状态：${state.data?.status || DEFAULT_DATA.status}`;
        }

        if (el.alignment) {
            const aligned = ["distribution", "loss", "ema", "attention"].includes(step.id);
            el.alignment.innerHTML = `
                <strong>${aligned ? "loss 1.92 → 0.74" : "loss 1.92"}</strong>
                <span>${aligned ? "student distribution 正在靠近 teacher soft target" : "student 与 teacher 分布仍明显错位"}</span>
            `;
        }
    }

    function renderAll() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载 DINO 预设样例...</div>';
            return;
        }
        renderControls();
        renderStage();
        renderPipeline();
        renderSummaryAndNotes();
    }

    function bindEvents() {
        el.sample?.addEventListener("change", () => {
            state.sampleId = el.sample.value;
            renderAll();
        });
        el.viewMode?.addEventListener("change", () => {
            state.viewMode = el.viewMode.value || "multi";
            renderAll();
        });
        el.network?.addEventListener("change", () => {
            state.network = el.network.value || "both";
            renderAll();
        });
        el.head?.addEventListener("change", () => {
            state.head = el.head.value || "average";
            renderAll();
        });
        el.representationButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.representation = button.dataset.dinoRepresentation || "distribution";
                if (state.representation === "distribution") state.player.setStep(3);
                if (state.representation === "feature" || state.representation === "attention") state.player.setStep(6);
                renderAll();
            });
        });
    }

    function initWithData(data) {
        state.data = data || DEFAULT_DATA;
        state.sampleId = state.data.defaultSample || state.data.samples?.[0]?.id || "animal";
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
                console.warn("DINO 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
