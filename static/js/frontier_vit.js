(function () {
    const root = document.querySelector("[data-vit-lab]");
    if (!root || !window.FrontierPlayer) return;

    const DEFAULT_DATA = {
        status: "机制拆解 · 教学动画；预设样例 · 非真实推理",
        imageSize: 224,
        defaultSample: "city",
        samples: [
            {
                id: "city",
                label: "城市街道",
                scene: "city",
                tensor: "224×224×3",
                summary: "内置 fallback 样例：道路、车辆和建筑提供多个 attention 关联。",
                anchors: [
                    { label: "bus", x: 0.33, y: 0.64 },
                    { label: "car", x: 0.68, y: 0.65 },
                    { label: "building", x: 0.18, y: 0.34 },
                    { label: "road", x: 0.52, y: 0.78 },
                    { label: "skyline", x: 0.76, y: 0.28 },
                ],
                predictions: [
                    { label: "street scene", score: 0.82 },
                    { label: "vehicle", score: 0.67 },
                    { label: "building", score: 0.54 },
                ],
            },
        ],
        heads: {
            head1: { label: "Head 1", focus: "local", description: "偏向临近 patch 和局部边界。" },
            head2: { label: "Head 2", focus: "object", description: "偏向主体区域和语义对象。" },
            head3: { label: "Head 3", focus: "context", description: "偏向远距离上下文和背景结构。" },
            average: { label: "Average", focus: "mixed", description: "融合多个 head 的平均注意力。" },
        },
    };

    const STEPS = [
        {
            id: "image",
            label: "Image",
            short: "H×W×3 输入",
            note: "输入图像被表示为 224×224×3 张量。",
            input: "Image ∈ R^(H×W×3)",
            compute: "读取 RGB 图像张量",
            output: "224×224×3 图像张量",
            formula: "Image ∈ R^(H×W×3)",
            relation: "CNN 从局部卷积窗口开始；ViT 先把整图改写成序列。",
            summary: "把输入图像作为 224×224×3 张量，是后续 patch token 化的起点。",
        },
        {
            id: "patch",
            label: "Patch",
            short: "图像切块",
            note: "图像按 P×P 网格切分，每个 patch 会进入同一个线性嵌入层。",
            input: "224×224×3 image, patch size P",
            compute: "按网格切分并展平每个 patch",
            output: "N 个 patch",
            formula: "N = (H / P) × (W / P)",
            relation: "CNN 用卷积核滑窗共享权重；ViT 用非重叠 patch 建立 token 序列。",
            summary: "patch size 改变会同步改变 grid 数量和 token 数量。",
        },
        {
            id: "token",
            label: "Token",
            short: "Patch → sequence",
            note: "每个 patch 经过线性投影成为 token，CLS token 被放到序列最前方。",
            input: "N 个 patch",
            compute: "patch flatten + linear projection + prepend CLS",
            output: "N+1 个 token",
            formula: "x_i = Linear(flatten(patch_i)), z = [CLS; x_1; ...; x_N]",
            relation: "CNN 保留二维 feature map；ViT 把二维图像变成一维 token sequence。",
            summary: "CLS token 是后续聚合全局表征的专用 token。",
        },
        {
            id: "position",
            label: "Position",
            short: "加入位置编码",
            note: "位置编码补回 patch 的二维位置信息，让 token 保留空间顺序。",
            input: "patch token + CLS token",
            compute: "token embedding 与 position embedding 相加",
            output: "带位置的 token 序列",
            formula: "z_i = patch_embed_i + pos_embed_i",
            relation: "CNN 的局部结构来自网格卷积；ViT 需要显式位置编码补充空间信息。",
            summary: "位置编码让 Transformer 知道每个 token 来自图像中的哪个 patch。",
        },
        {
            id: "attention",
            label: "Attention",
            short: "全局关联",
            note: "点击 patch 或 token 后，当前 patch 与其它 patch 的 attention 权重会更新。",
            input: "Q, K, V token projections",
            compute: "softmax(QK^T / √d) 加权汇聚 V",
            output: "attention map + updated tokens",
            formula: "Attention(Q,K,V)=softmax(QKᵀ / √d)V",
            relation: "CNN 逐层扩大感受野；self-attention 可以直接建立远距离 patch 关系。",
            summary: "当前 attention map 使用预设权重模拟，不代表真实模型输出。",
        },
        {
            id: "encoder",
            label: "Encoder",
            short: "Transformer block",
            note: "Transformer Encoder 交替执行归一化、多头注意力、残差和 MLP。",
            input: "带上下文的 token 序列",
            compute: "LayerNorm → Multi-Head Self-Attention → Residual → MLP → Residual",
            output: "更新后的 token 表征",
            formula: "z' = z + MSA(LN(z)); z_out = z' + MLP(LN(z'))",
            relation: "CNN block 混合局部卷积和非线性；Transformer block 用 attention 混合全局上下文。",
            summary: "Encoder block 重复堆叠后，每个 token 都融合了其它 patch 的上下文。",
        },
        {
            id: "cls",
            label: "CLS Output",
            short: "全局表征",
            note: "所有 token 的信息汇聚到 CLS token，输出 768-d representation vector。",
            input: "最终层 token sequence",
            compute: "读取 CLS token 并接分类头或下游任务头",
            output: "Representation vector: 768-d",
            formula: "y = Head(z_CLS), representation ∈ R^768",
            relation: "CNN 常用 global average pooling；ViT 常用 CLS token 或 token pooling 表示整图。",
            summary: "CLS 输出可进入分类、检索、检测、分割或自监督训练目标。",
        },
    ];

    const el = {
        sample: root.querySelector('[data-vit-control="sample"]'),
        patchSize: root.querySelector('[data-vit-control="patchSize"]'),
        head: root.querySelector('[data-vit-control="head"]'),
        displayButtons: Array.from(root.querySelectorAll("[data-vit-display]")),
        stage: root.querySelector("[data-vit-stage]"),
        pipeline: root.querySelector("[data-vit-pipeline]"),
        stageTitle: root.querySelector("[data-vit-stage-title]"),
        topList: root.querySelector("[data-vit-top-list]"),
        chips: {
            sample: root.querySelector('[data-vit-chip="sample"]'),
            shape: root.querySelector('[data-vit-chip="shape"]'),
            mode: root.querySelector('[data-vit-chip="mode"]'),
        },
        summary: {
            input: root.querySelector('[data-vit-summary="input"]'),
            patch: root.querySelector('[data-vit-summary="patch"]'),
            tokens: root.querySelector('[data-vit-summary="tokens"]'),
            tokensCls: root.querySelector('[data-vit-summary="tokensCls"]'),
            step: root.querySelector('[data-vit-summary="step"]'),
        },
        notes: {
            step: root.querySelector('[data-vit-note="step"]'),
            summary: root.querySelector('[data-vit-note="summary"]'),
            input: root.querySelector('[data-vit-note="input"]'),
            compute: root.querySelector('[data-vit-note="compute"]'),
            output: root.querySelector('[data-vit-note="output"]'),
            relation: root.querySelector('[data-vit-note="relation"]'),
            formula: root.querySelector('[data-vit-note="formula"]'),
            formulaNote: root.querySelector('[data-vit-note="formulaNote"]'),
        },
    };

    const state = {
        data: null,
        sampleId: "",
        patchSize: 16,
        head: "average",
        display: "patch",
        selectedPatch: 104,
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

    function imageSize() {
        return Number(state.data?.imageSize) || 224;
    }

    function patchCols() {
        return imageSize() / state.patchSize;
    }

    function tokenCount() {
        return patchCols() * patchCols();
    }

    function sample() {
        const samples = state.data?.samples || DEFAULT_DATA.samples;
        return samples.find((item) => item.id === state.sampleId) || samples[0];
    }

    function headProfile(head = state.head) {
        return state.data?.heads?.[head] || DEFAULT_DATA.heads[head] || DEFAULT_DATA.heads.average;
    }

    function displayForStep(stepId) {
        if (stepId === "token" || stepId === "position") return "token";
        if (stepId === "attention") return "attention";
        if (stepId === "cls") return "cls";
        return "patch";
    }

    function stepForDisplay(display) {
        return { patch: 1, token: 2, attention: 4, cls: 6 }[display] ?? 1;
    }

    function patchPoint(index) {
        const cols = patchCols();
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
            row,
            col,
            x: (col + 0.5) / cols,
            y: (row + 0.5) / cols,
        };
    }

    function anchorPatch(anchor) {
        const cols = patchCols();
        const col = Math.max(0, Math.min(cols - 1, Math.round(anchor.x * (cols - 1))));
        const row = Math.max(0, Math.min(cols - 1, Math.round(anchor.y * (cols - 1))));
        return row * cols + col;
    }

    function calculateHeadWeights(head) {
        const cols = patchCols();
        const total = tokenCount();
        const current = patchPoint(state.selectedPatch);
        const currentSample = sample();
        const anchors = currentSample.anchors || [];
        const focus = headProfile(head).focus;
        const centerSigma = Math.max(1.2, cols * 0.22);
        const localSigma = Math.max(1, cols * 0.16);
        const values = [];

        for (let index = 0; index < total; index += 1) {
            const point = patchPoint(index);
            const dx = point.col - current.col;
            const dy = point.row - current.row;
            const distance = Math.hypot(dx, dy);
            const local = Math.exp(-(distance * distance) / (2 * localSigma * localSigma));
            const object = anchors.reduce((maxValue, anchor) => {
                const ax = anchor.x * cols;
                const ay = anchor.y * cols;
                const ad = Math.hypot(point.col + 0.5 - ax, point.row + 0.5 - ay);
                return Math.max(maxValue, Math.exp(-(ad * ad) / (2 * centerSigma * centerSigma)));
            }, 0);
            const context = Math.min(1, distance / Math.max(cols * 0.58, 1)) * 0.58
                + (point.y < 0.42 || point.y > 0.72 ? 0.18 : 0);
            const center = 1 - Math.min(1, Math.hypot(point.x - 0.5, point.y - 0.5) * 1.45);
            const noise = ((index * 37 + state.selectedPatch * 17 + currentSample.id.length * 11) % 19) / 100;
            let raw = local * 0.55 + object * 0.28 + center * 0.08 + noise;

            if (focus === "object") raw = object * 0.66 + local * 0.16 + center * 0.12 + noise;
            if (focus === "context") raw = context * 0.58 + object * 0.22 + local * 0.10 + noise;
            if (focus === "mixed") raw = local * 0.34 + object * 0.42 + context * 0.18 + noise;
            values.push(raw);
        }

        const maxValue = Math.max(...values, 1);
        return values.map((value) => value / maxValue);
    }

    function attentionWeights() {
        if (state.head !== "average") return calculateHeadWeights(state.head);
        const heads = ["head1", "head2", "head3"].map(calculateHeadWeights);
        return heads[0].map((value, index) => (value + heads[1][index] + heads[2][index]) / 3);
    }

    function topAttention(weights) {
        return weights
            .map((weight, index) => ({ index, weight }))
            .filter((item) => item.index !== state.selectedPatch)
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5);
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

    function patchGridMarkup(weights) {
        const cols = patchCols();
        return `
            <div class="vit-patch-grid" style="--patch-cols:${cols}">
                ${Array.from({ length: tokenCount() }, (_item, index) => {
                    const point = patchPoint(index);
                    const shiftX = `${(point.col - (cols - 1) / 2) * 0.16}px`;
                    const shiftY = `${(point.row - (cols - 1) / 2) * 0.16}px`;
                    const classes = [
                        "vit-patch-cell",
                        index === state.selectedPatch ? "is-selected" : "",
                        weights[index] > 0.62 ? "is-hot" : "",
                    ].filter(Boolean).join(" ");
                    return `
                        <button
                            type="button"
                            class="${classes}"
                            data-patch-index="${index}"
                            style="--attention:${weights[index].toFixed(3)};--patch-delay:${Math.min(index * 3, 360)}ms;--patch-shift-x:${shiftX};--patch-shift-y:${shiftY}"
                            aria-label="选择 patch ${index + 1}"
                        ></button>
                    `;
                }).join("")}
            </div>
        `;
    }

    function attentionOverlayMarkup(weights) {
        const cols = patchCols();
        return `
            <div class="vit-attention-overlay" style="--patch-cols:${cols}" aria-hidden="true">
                ${weights.map((weight, index) => `<span style="--attention:${weight.toFixed(3)};--patch-delay:${Math.min(index * 2, 360)}ms"></span>`).join("")}
            </div>
        `;
    }

    function tokenSequenceMarkup() {
        const total = tokenCount();
        const maxVisible = Math.min(total, 784);
        return `
            <div class="vit-token-sequence" aria-label="ViT token sequence">
                <button type="button" class="vit-token is-cls" data-token-index="-1">CLS</button>
                ${Array.from({ length: maxVisible }, (_item, index) => `
                    <button
                        type="button"
                        class="vit-token ${index === state.selectedPatch ? "is-selected" : ""}"
                        data-token-index="${index}"
                        style="--token-delay:${Math.min(index * 4, 420)}ms"
                    >T${index + 1}</button>
                `).join("")}
            </div>
            <div class="vit-position-tags">
                ${Array.from({ length: Math.min(12, total) }, (_item, index) => `<span style="--token-delay:${index * 34}ms">pos_${index + 1}</span>`).join("")}
            </div>
        `;
    }

    function attentionMatrixMarkup(weights) {
        const cols = patchCols();
        return `
            <div class="vit-attention-layout">
                <div class="vit-attention-matrix" style="--matrix-cols:${cols}" aria-label="attention matrix">
                    ${weights.map((weight, index) => `<span class="vit-matrix-cell" style="--attention:${Math.max(0.06, weight).toFixed(3)};--matrix-delay:${Math.min(index * 2, 420)}ms"></span>`).join("")}
                </div>
                <div class="vit-attention-detail">
                    <code>Attention(Q,K,V)=softmax(QKᵀ / √d)V</code>
                    <p>当前选择 patch ${state.selectedPatch + 1}，${headProfile().label}：${headProfile().description}</p>
                    <p>矩阵色块越亮，表示该 patch 对当前 query token 的预设权重越高。</p>
                </div>
            </div>
        `;
    }

    function encoderMarkup() {
        const blocks = [
            ["LN", "LayerNorm", "稳定 token 分布"],
            ["MSA", "Multi-Head Self-Attention", "跨 patch 汇聚上下文"],
            ["+", "Residual", "保留输入信息"],
            ["MLP", "Feed Forward", "逐 token 非线性变换"],
            ["+", "Residual", "输出 encoder token"],
        ];
        return `
            <div class="vit-encoder-chain" aria-label="Transformer Encoder block">
                ${blocks.map((block, index) => `
                    <article class="vit-encoder-card ${index === 1 || index === 3 ? "is-active" : ""}" style="--encoder-delay:${index * 80}ms">
                        <span>${escapeHtml(block[0])}</span>
                        <strong>${escapeHtml(block[1])}</strong>
                        <code>${escapeHtml(block[2])}</code>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function outputMarkup(currentSample) {
        const predictions = currentSample.predictions || [];
        return `
            <div class="vit-output-grid">
                <div class="vit-output-vector">
                    <div class="vit-cls-node">CLS</div>
                    <code>Representation vector: 768-d</code>
                </div>
                <div class="vit-predictions">
                    ${predictions.map((item) => `
                        <article>
                            <span>${escapeHtml(item.label)}</span>
                            <i><b style="width:${Math.round(item.score * 100)}%"></b></i>
                            <strong>${Math.round(item.score * 100)}%</strong>
                        </article>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderStage() {
        const currentSample = sample();
        const currentStep = state.player.current();
        const weights = attentionWeights();
        const cols = patchCols();
        const stepId = currentStep.id || "image";
        state.selectedPatch = Math.max(0, Math.min(tokenCount() - 1, state.selectedPatch));

        el.stage.innerHTML = `
            <div class="vit-stage-layout" data-step="${escapeHtml(stepId)}" data-display="${escapeHtml(state.display)}">
                <div class="vit-visual-stack">
                    <section class="frontier-stage-card vit-image-panel">
                        <div class="frontier-section-headline">
                            <strong>Input image / patch grid</strong>
                            <span>Image ∈ R^(H×W×3)</span>
                        </div>
                        <div class="frontier-sample-frame" data-caption="${escapeHtml(currentSample.label)} · 224×224×3">
                            ${sceneMarkup(currentSample)}
                            ${patchGridMarkup(weights)}
                            ${attentionOverlayMarkup(weights)}
                        </div>
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>Shape summary</strong>
                            <span>P=${state.patchSize}, grid=${cols}×${cols}</span>
                        </div>
                        <div class="vit-shape-readout">
                            <div><span>公式</span><strong>N=(H/P)×(W/P)</strong></div>
                            <div><span>Patch tokens</span><strong>${tokenCount()}</strong></div>
                            <div><span>With CLS</span><strong>${tokenCount() + 1}</strong></div>
                        </div>
                    </section>
                </div>
                <div class="vit-side-stack">
                    <section class="frontier-stage-card vit-token-panel">
                        <div class="frontier-section-headline">
                            <strong>Token sequence</strong>
                            <span>CLS + ${tokenCount()} patch tokens</span>
                        </div>
                        ${tokenSequenceMarkup()}
                    </section>
                    <section class="frontier-stage-card vit-attention-panel">
                        <div class="frontier-section-headline">
                            <strong>Attention map / matrix</strong>
                            <span>${escapeHtml(headProfile().label)}</span>
                        </div>
                        ${attentionMatrixMarkup(weights)}
                    </section>
                    <section class="frontier-stage-card vit-encoder-panel">
                        <div class="frontier-section-headline">
                            <strong>Transformer Encoder block</strong>
                            <span>LN → MSA → Residual → MLP → Residual</span>
                        </div>
                        ${encoderMarkup()}
                    </section>
                    <section class="frontier-stage-card vit-output-panel">
                        <div class="frontier-section-headline">
                            <strong>CLS Output</strong>
                            <span>Top-3 preset classification</span>
                        </div>
                        ${outputMarkup(currentSample)}
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
        if (el.patchSize) el.patchSize.value = String(state.patchSize);
        if (el.head) el.head.value = state.head;
        el.displayButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.vitDisplay === state.display);
            button.setAttribute("aria-pressed", button.dataset.vitDisplay === state.display ? "true" : "false");
        });
    }

    function renderSummaryAndNotes() {
        const currentSample = sample();
        const step = state.player.current();
        const weights = attentionWeights();
        const top = topAttention(weights);
        const cols = patchCols();

        if (el.stageTitle) el.stageTitle.textContent = `${step.label} · ${currentSample.label}`;
        if (el.chips.sample) el.chips.sample.textContent = currentSample.id;
        if (el.chips.shape) el.chips.shape.textContent = `${cols}×${cols} patches`;
        if (el.chips.mode) el.chips.mode.textContent = state.display === "patch" ? "Patch Grid" : state.display === "token" ? "Token Sequence" : state.display === "attention" ? "Attention Map" : "CLS 聚合";
        if (el.summary.input) el.summary.input.textContent = currentSample.tensor || "224×224×3";
        if (el.summary.patch) el.summary.patch.textContent = `${state.patchSize}×${state.patchSize}`;
        if (el.summary.tokens) el.summary.tokens.textContent = String(tokenCount());
        if (el.summary.tokensCls) el.summary.tokensCls.textContent = String(tokenCount() + 1);
        if (el.summary.step) el.summary.step.textContent = step.label;

        if (el.notes.step) el.notes.step.textContent = step.label;
        if (el.notes.summary) el.notes.summary.textContent = step.summary;
        if (el.notes.input) el.notes.input.textContent = step.input;
        if (el.notes.compute) el.notes.compute.textContent = step.compute;
        if (el.notes.output) el.notes.output.textContent = step.output;
        if (el.notes.relation) el.notes.relation.textContent = step.relation;
        if (el.notes.formula) el.notes.formula.textContent = step.formula;
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = step.id === "attention"
                ? `${headProfile().description} 当前权重为预设样例，不执行真实 ViT 推理。`
                : `${currentSample.summary} 页面状态：${state.data?.status || DEFAULT_DATA.status}`;
        }

        if (el.topList) {
            el.topList.innerHTML = top.map((item) => {
                const point = patchPoint(item.index);
                const label = `r${point.row + 1} c${point.col + 1}`;
                return `
                    <li>
                        <span>${escapeHtml(label)}</span>
                        <i><b style="width:${Math.round(item.weight * 100)}%"></b></i>
                        <strong>${item.weight.toFixed(2)}</strong>
                    </li>
                `;
            }).join("");
        }
    }

    function renderAll() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载 ViT 预设样例...</div>';
            return;
        }
        const step = state.player.current();
        state.display = displayForStep(step.id);
        state.selectedPatch = Math.max(0, Math.min(tokenCount() - 1, state.selectedPatch));
        renderControls();
        renderStage();
        renderPipeline();
        renderSummaryAndNotes();
    }

    function bindEvents() {
        el.sample?.addEventListener("change", () => {
            state.sampleId = el.sample.value;
            state.selectedPatch = anchorPatch(sample().anchors?.[0] || { x: 0.5, y: 0.5 });
            renderAll();
        });
        el.patchSize?.addEventListener("change", () => {
            state.patchSize = Number(el.patchSize.value) || 16;
            state.selectedPatch = Math.min(tokenCount() - 1, Math.floor(tokenCount() / 2));
            renderAll();
        });
        el.head?.addEventListener("change", () => {
            state.head = el.head.value || "average";
            renderAll();
        });
        el.displayButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.display = button.dataset.vitDisplay || "patch";
                state.player.setStep(stepForDisplay(state.display));
            });
        });
        el.stage?.addEventListener("click", (event) => {
            const patchButton = event.target.closest("[data-patch-index], [data-token-index]");
            if (!patchButton) return;
            const tokenIndex = patchButton.dataset.tokenIndex;
            const patchIndex = tokenIndex !== undefined ? Number(tokenIndex) : Number(patchButton.dataset.patchIndex);
            if (patchIndex >= 0) {
                state.selectedPatch = Math.max(0, Math.min(tokenCount() - 1, patchIndex));
                if (state.player.current().id !== "attention") {
                    state.player.setStep(4);
                } else {
                    renderAll();
                }
            }
        });
    }

    function initWithData(data) {
        state.data = data || DEFAULT_DATA;
        state.sampleId = state.data.defaultSample || state.data.samples?.[0]?.id || "city";
        state.selectedPatch = anchorPatch(sample().anchors?.[0] || { x: 0.5, y: 0.5 });
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
                console.warn("ViT 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
