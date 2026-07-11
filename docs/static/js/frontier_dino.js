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
                summary: "内置备用样例：多种裁剪对齐到同一主体表征。",
                crops: [
                    { id: "gA", label: "全局视图 A", type: "global", x: 8, y: 8, w: 82, h: 82 },
                    { id: "gB", label: "全局视图 B", type: "global", x: 16, y: 13, w: 76, h: 76 },
                    { id: "l1", label: "局部裁剪 1", type: "local", x: 38, y: 26, w: 34, h: 34 },
                    { id: "l2", label: "局部裁剪 2", type: "local", x: 24, y: 42, w: 32, h: 32 },
                    { id: "l3", label: "局部裁剪 3", type: "local", x: 50, y: 48, w: 28, h: 28 },
                    { id: "l4", label: "局部裁剪 4", type: "local", x: 18, y: 62, w: 30, h: 30 },
                ],
                distribution: {
                    labels: ["原型 07", "原型 18", "原型 24", "原型 31", "原型 42"],
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
            label: "多视图裁剪",
            short: "多裁剪",
            note: "同一张无标签图像被裁成多个全局/局部视图。",
            input: "无标签图像",
            compute: "多裁剪增强",
            output: "2 个全局视图 + 4 个局部裁剪",
            formula: "views = crop_aug(image)",
            relation: "DINO 使用 ViT 处理每个视图的 Token 序列。",
            ssl: "没有人工标签，只有同一图像的不同视图。",
            summary: "多视图裁剪让模型从局部和整体中学习一致语义。",
        },
        {
            id: "student",
            label: "Student 分支",
            short: "局部/全局输入",
            note: "多种裁剪输入 Student ViT，得到 Student 输出分布。",
            input: "局部/全局视图",
            compute: "Student ViT 前向计算",
            output: "Student 输出分布",
            formula: "p_student = softmax(g_s(v_i) / τ_s)",
            relation: "Student 与普通 ViT 前向结构相似，但训练目标来自 Teacher。",
            ssl: "Student 学习预测 Teacher 给出的软目标。",
            summary: "Student 接收更多局部裁剪，学习把不同视图对齐到同一语义。",
        },
        {
            id: "teacher",
            label: "Teacher 分支",
            short: "全局输入",
            note: "全局视图输入 Teacher ViT；Teacher 不直接由梯度更新。",
            input: "全局视图 A / B",
            compute: "Teacher ViT 前向计算，不直接接收梯度",
            output: "Teacher 输出分布",
            formula: "p_teacher = softmax(g_t(v_g) / τ_t)",
            relation: "Teacher 与 Student 同构，但参数来自 Student 的 EMA。",
            ssl: "Teacher 输出作为无标签训练目标。",
            summary: "Teacher 提供稳定目标，减少 Student 自己追自己造成的坍塌。",
        },
        {
            id: "distribution",
            label: "输出分布",
            short: "软目标对齐",
            note: "Student 概率条逐渐靠近 Teacher 软目标。",
            input: "Student 分布 + Teacher 分布",
            compute: "温度 softmax + 中心化",
            output: "对齐后的输出分布",
            formula: "align(p_student, p_teacher)",
            relation: "ViT 输出不只做人工分类，也可以作为自监督原型分布。",
            ssl: "目标来自 Teacher 分布，不来自人工类别标签。",
            summary: "分布对齐展示 Student 从错位概率逐步靠近 Teacher 软目标。",
        },
        {
            id: "loss",
            label: "损失",
            short: "交叉熵",
            note: "DINO 没有人工类别标签，Teacher 软目标作为学习目标。",
            input: "p_teacher、p_student",
            compute: "基于 Teacher 软目标的交叉熵",
            output: "损失下降",
            formula: "L = -Σ p_teacher log(p_student)",
            relation: "分类任务的交叉熵需要人工标签；DINO 的目标来自 Teacher。",
            ssl: "同一图像不同视图之间互相监督。",
            summary: "损失衡量 Student 分布和 Teacher 分布的距离。",
        },
        {
            id: "ema",
            label: "EMA 更新",
            short: "Teacher 慢更新",
            note: "Student 参数通过 EMA 更新 Teacher，Teacher 不直接反向传播。",
            input: "θ_student, θ_teacher",
            compute: "指数移动平均",
            output: "更新后的 Teacher 参数",
            formula: "θ_teacher ← m θ_teacher + (1-m) θ_student",
            relation: "ViT 模块结构不变，训练更新机制改变了监督来源。",
            ssl: "Teacher 是 Student 历史参数的平滑版本。",
            summary: "EMA 让 Teacher 稳定追随 Student，提供更平滑的目标。",
        },
        {
            id: "attention",
            label: "Attention 可视化",
            short: "涌现关注",
            note: "无检测框/无分割标签，也可能自动关注主体区域。",
            input: "训练后的 DINO ViT Token",
            compute: "读取选中的 Self-Attention 头",
            output: "Attention 热力图 + 特征簇",
            formula: "A_head = softmax(QKᵀ / √d)",
            relation: "DINO 仍建立在 ViT Attention 上，但训练来自自监督对齐。",
            ssl: "主体关注是从无标签视图一致性中涌现的可视化现象。",
            summary: "Attention 图和特征空间都使用预设数据解释机制，不执行真实训练。",
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

    function assetUrl(path) {
        const value = String(path || "");
        if (!value) return "";
        if (/^(https?:)?\/\//.test(value) || value.startsWith("/")) return value;
        return `${window.CVCLASS_BASE_PATH || ""}/static/${value}`;
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

    function viewModeLabel() {
        return {
            global: "全局视图",
            local: "局部裁剪",
            multi: "多裁剪",
        }[state.viewMode] || "多裁剪";
    }

    function networkLabel() {
        return {
            student: "Student 分支",
            teacher: "Teacher 分支",
            both: "全部分支",
        }[state.network] || "全部分支";
    }

    function attentionFocus() {
        const current = sample().attention || {};
        return current[state.head] || current.average || { x: 50, y: 50, x2: 62, y2: 42, label: "主体区域" };
    }

    function representationLabel() {
        return {
            distribution: "输出分布",
            feature: "特征空间",
            attention: "Attention 热力图",
        }[state.representation] || "输出分布";
    }

    function sceneMarkup(currentSample) {
        const image = assetUrl(currentSample.image);
        return `
            <div class="frontier-sample-scene ${image ? "has-photo" : ""}" data-scene="${escapeHtml(currentSample.scene || currentSample.id)}" aria-hidden="true">
                ${image ? `<img class="frontier-sample-photo" src="${escapeHtml(image)}" alt="" onerror="this.parentElement && this.parentElement.classList.remove('has-photo'); this.remove();">` : ""}
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
                        <span>${crop.type === "global" ? "全局裁剪 → Teacher / Student" : "局部裁剪 → 仅 Student"}</span>
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
                    <strong>局部/全局视图</strong>
                    <small>Student ViT 接收全部多裁剪，并通过梯度更新。</small>
                </article>
                <i class="dino-flow-line dino-flow-line--student" aria-hidden="true"></i>
                <article class="dino-branch-node ${stepId === "distribution" || stepId === "loss" ? "is-active" : ""}">
                    <span>输出</span>
                    <strong>原型分布</strong>
                    <small>Student 与 Teacher 输出在同一原型分布空间中比较。</small>
                </article>
                <i class="dino-flow-line dino-flow-line--teacher" aria-hidden="true"></i>
                <article class="dino-branch-node is-teacher ${showTeacher ? "is-active" : "is-muted"}">
                    <span>Teacher</span>
                    <strong>仅全局视图</strong>
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
                    <div class="frontier-section-headline"><strong>Teacher 输出</strong><span>软目标</span></div>
                    ${distributionBars(dist.teacher || [], labels, "#10b981")}
                </section>
                <section class="frontier-mini-card">
                    <div class="frontier-section-headline"><strong>Student 输出</strong><span>${aligned ? "已对齐" : "对齐前"}</span></div>
                    ${distributionBars(student || [], labels, "#2563eb")}
                </section>
            </div>
            <div class="dino-loss-readout">
                <div><span>损失</span><strong>${loss}</strong></div>
                <div><span>目标</span><strong>Teacher 软目标</strong></div>
                <div><span>无标签</span><strong>无人工类别标签</strong></div>
            </div>
        `;
    }

    function emaMarkup() {
        return `
            <div class="dino-ema-panel">
                <div class="dino-ema-node">
                    <strong>Student θ_s</strong>
                    <span>梯度更新</span>
                </div>
                <i class="dino-ema-arrow" aria-hidden="true"></i>
                <div class="dino-ema-node">
                    <strong>Teacher θ_t</strong>
                    <span>EMA 目标</span>
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
            <div class="dino-feature-space" aria-label="二维特征空间">
                ${samePoints}
                ${others}
            </div>
        `;
    }

    function architectureMarkup(stepId) {
        const activeIndex = {
            views: 0,
            student: 1,
            teacher: 1,
            distribution: 3,
            loss: 4,
            ema: 5,
            attention: 1,
        }[stepId] ?? 0;
        const nodes = [
            ["多裁剪视图", "Multi-crop Views", "全局/局部裁剪形成无标签视图"],
            ["Student / Teacher ViT", "双分支 ViT", "Student 学习，Teacher 稳定给目标"],
            ["Projection Head", "原型映射", "把 CLS 表征映射到原型分布"],
            ["Softmax Target", "软目标", "Teacher 输出作为无标签监督"],
            ["Loss", "交叉熵", "Student 分布靠近 Teacher"],
            ["EMA", "慢更新", "Student 参数平滑更新 Teacher"],
        ];
        return `
            <div class="model-arch-graph" aria-label="DINO 网络架构图">
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
                    <span>当前高亮</span>
                    <strong>${escapeHtml(nodes[activeIndex][0])}</strong>
                </div>
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
                            <strong>输入图像 / 多裁剪</strong>
                            <span>${escapeHtml(currentSample.label)} · ${escapeHtml(viewModeLabel())}</span>
                        </div>
                        <div class="frontier-sample-frame" data-caption="${escapeHtml(currentSample.label)} · 无标签">
                            ${sceneMarkup(currentSample)}
                            ${cropLayerMarkup()}
                            ${attentionLayerMarkup()}
                        </div>
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>视图卡片</strong>
                            <span>${visibleCrops().length} 个视图</span>
                        </div>
                        ${viewStripMarkup()}
                    </section>
                </div>
                <div class="dino-side-stack">
                    <section class="frontier-stage-card frontier-architecture-card dino-architecture-panel">
                        <div class="frontier-section-headline">
                            <strong>DINO 网络架构图</strong>
                            <span>Views → ViT → Target → Loss → EMA</span>
                        </div>
                        ${architectureMarkup(stepId)}
                    </section>
                    <section class="frontier-stage-card dino-branch-panel">
                        <div class="frontier-section-headline">
                            <strong>Student / Teacher 分支</strong>
                            <span>${escapeHtml(networkLabel())}</span>
                        </div>
                        ${branchMarkup(stepId)}
                    </section>
                    <section class="frontier-stage-card dino-distribution-panel">
                        <div class="frontier-section-headline">
                            <strong>输出分布</strong>
                            <span>Teacher 目标 vs Student</span>
                        </div>
                        ${distributionMarkup(stepId)}
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>EMA 更新</strong>
                            <span>θ_teacher ← m θ_teacher + (1-m) θ_student</span>
                        </div>
                        ${emaMarkup()}
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>特征空间 / Attention</strong>
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
            el.sample.innerHTML = samples.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("");
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
        if (el.chips.sample) el.chips.sample.textContent = currentSample.label;
        if (el.chips.views) el.chips.views.textContent = `${viewCount} 个视图`;
        if (el.chips.mode) el.chips.mode.textContent = representationLabel();
        if (el.summary.sample) el.summary.sample.textContent = currentSample.label;
        if (el.summary.views) el.summary.views.textContent = String(viewCount);
        if (el.summary.training) el.summary.training.textContent = "教师-学生 + EMA";
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
                ? `${focus.label || "主体区域"}；Attention 图使用预设注意力头参数，不执行真实 DINO 推理。`
                : `${currentSample.summary} 页面状态：${state.data?.status || DEFAULT_DATA.status}`;
        }

        if (el.alignment) {
            const aligned = ["distribution", "loss", "ema", "attention"].includes(step.id);
            el.alignment.innerHTML = `
                <strong>${aligned ? "损失 1.92 → 0.74" : "损失 1.92"}</strong>
                <span>${aligned ? "Student 分布正在靠近 Teacher 软目标" : "Student 与 Teacher 分布仍明显错位"}</span>
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
