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
                summary: "内置备用样例：道路、车辆和建筑提供多个 Attention 关联。",
                anchors: [
                    { label: "公交车", x: 0.33, y: 0.64 },
                    { label: "汽车", x: 0.68, y: 0.65 },
                    { label: "建筑", x: 0.18, y: 0.34 },
                    { label: "道路", x: 0.52, y: 0.78 },
                    { label: "天际线", x: 0.76, y: 0.28 },
                ],
                predictions: [
                    { label: "街景", score: 0.82 },
                    { label: "车辆", score: 0.67 },
                    { label: "建筑", score: 0.54 },
                ],
            },
        ],
        heads: {
            head1: { label: "第 1 头", focus: "local", description: "偏向临近 Patch 和局部边界。" },
            head2: { label: "第 2 头", focus: "object", description: "偏向主体区域和语义对象。" },
            head3: { label: "第 3 头", focus: "context", description: "偏向远距离上下文和背景结构。" },
            average: { label: "平均", focus: "mixed", description: "融合多个注意力头的平均注意力。" },
        },
    };

    const STEPS = [
        {
            id: "image",
            label: "图像",
            short: "H×W×3 输入",
            note: "输入图像被表示为 224×224×3 张量。",
            input: "图像 ∈ R^(H×W×3)",
            compute: "读取 RGB 图像张量",
            output: "224×224×3 图像张量",
            formula: "图像 ∈ R^(H×W×3)",
            relation: "CNN 从局部卷积窗口开始；ViT 先把整图改写成序列。",
            summary: "把输入图像作为 224×224×3 张量，是后续 patch token 化的起点。",
        },
        {
            id: "patch",
            label: "Patch 切分",
            short: "图像切块",
            note: "图像按 P×P 网格切分，每个 patch 会进入同一个线性嵌入层。",
            input: "224×224×3 图像，Patch 尺寸 P",
            compute: "按网格切分并展平每个 Patch",
            output: "N 个 Patch",
            formula: "N = (H / P) × (W / P)",
            relation: "CNN 用卷积核滑窗共享权重；ViT 用非重叠 patch 建立 token 序列。",
            summary: "Patch 尺寸改变会同步改变网格数量和 Token 数量。",
        },
        {
            id: "token",
            label: "Token 化",
            short: "Patch → 序列",
            note: "每个 patch 经过线性投影成为 token，CLS token 被放到序列最前方。",
            input: "N 个 Patch",
            compute: "Patch 展平 + 线性投影 + 添加 CLS",
            output: "N+1 个 Token",
            formula: "x_i = Linear(flatten(patch_i)), z = [CLS; x_1; ...; x_N]",
            relation: "CNN 保留二维特征图；ViT 把二维图像变成一维 Token 序列。",
            summary: "CLS Token 是后续聚合全局表征的专用 Token。",
        },
        {
            id: "position",
            label: "位置编码",
            short: "加入位置编码",
            note: "位置编码补回 patch 的二维位置信息，让 token 保留空间顺序。",
            input: "Patch Token + CLS Token",
            compute: "Token 嵌入与位置编码相加",
            output: "带位置的 Token 序列",
            formula: "z_i = patch_embed_i + pos_embed_i",
            relation: "CNN 的局部结构来自网格卷积；ViT 需要显式位置编码补充空间信息。",
            summary: "位置编码让 Transformer 知道每个 Token 来自图像中的哪个 Patch。",
        },
        {
            id: "attention",
            label: "自注意力",
            short: "全局关联",
            note: "点击 patch 或 token 后，当前 patch 与其它 patch 的 attention 权重会更新。",
            input: "Q、K、V Token 投影",
            compute: "softmax(QK^T / √d) 加权汇聚 V",
            output: "Attention 图 + 更新后的 Token",
            formula: "Attention(Q,K,V)=softmax(QKᵀ / √d)V",
            relation: "CNN 逐层扩大感受野；self-attention 可以直接建立远距离 patch 关系。",
            summary: "当前 Attention 图使用预设权重模拟，不代表真实模型输出。",
        },
        {
            id: "encoder",
            label: "Encoder 编码",
            short: "Transformer 模块",
            note: "Transformer Encoder 交替执行归一化、多头注意力、残差和 MLP。",
            input: "带上下文的 Token 序列",
            compute: "LayerNorm → 多头 Self-Attention → 残差 → MLP → 残差",
            output: "更新后的 Token 表征",
            formula: "z' = z + MSA(LN(z)); z_out = z' + MLP(LN(z'))",
            relation: "CNN 模块混合局部卷积和非线性；Transformer 模块用 Attention 混合全局上下文。",
            summary: "Encoder 模块重复堆叠后，每个 Token 都融合了其它 Patch 的上下文。",
        },
        {
            id: "cls",
            label: "CLS 输出",
            short: "全局表征",
            note: "所有 Token 的信息汇聚到 CLS Token，输出 768 维表征向量。",
            input: "最终层 Token 序列",
            compute: "读取 CLS Token 并接分类头或下游任务头",
            output: "768 维表征向量",
            formula: "y = Head(z_CLS), representation ∈ R^768",
            relation: "CNN 常用全局平均池化；ViT 常用 CLS Token 或 Token 池化表示整图。",
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
            <div class="vit-token-sequence" aria-label="ViT Token 序列">
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
                ${Array.from({ length: Math.min(12, total) }, (_item, index) => `<span style="--token-delay:${index * 34}ms">位置 ${index + 1}</span>`).join("")}
            </div>
        `;
    }

    function attentionMatrixMarkup(weights) {
        const cols = patchCols();
        return `
            <div class="vit-attention-layout">
                <div class="vit-attention-matrix" style="--matrix-cols:${cols}" aria-label="Attention 矩阵">
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
            ["LN", "LayerNorm", "稳定 Token 分布"],
            ["MSA", "多头 Self-Attention", "跨 Patch 汇聚上下文"],
            ["+", "残差连接", "保留输入信息"],
            ["MLP", "前馈网络", "逐 Token 非线性变换"],
            ["+", "残差连接", "输出 Encoder Token"],
        ];
        return `
            <div class="vit-encoder-chain" aria-label="Transformer Encoder 模块">
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
                    <code>表征向量：768 维</code>
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

    function architectureMarkup(stepId) {
        const activeIndex = {
            image: 0,
            patch: 1,
            token: 2,
            position: 2,
            attention: 3,
            encoder: 3,
            cls: 4,
        }[stepId] ?? 0;
        const nodes = [
            ["输入图像", "Image", "RGB 张量进入模型"],
            ["Patch Embedding", "切块投影", "Patch 展平并线性投影"],
            ["位置 / CLS", "+ Position / CLS", "加入空间位置与全局 token"],
            ["Transformer Encoder", "L× Encoder", "多头注意力与 MLP 堆叠"],
            ["输出头", "CLS Head", "读取 CLS 表征接任务头"],
        ];
        return `
            <div class="model-arch-graph" aria-label="ViT 网络架构图">
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
                            <strong>输入图像 / Patch 网格</strong>
                            <span>图像 ∈ R^(H×W×3)</span>
                        </div>
                        <div class="frontier-sample-frame" data-caption="${escapeHtml(currentSample.label)} · 224×224×3">
                            ${sceneMarkup(currentSample)}
                            ${patchGridMarkup(weights)}
                            ${attentionOverlayMarkup(weights)}
                        </div>
                    </section>
                    <section class="frontier-stage-card">
                        <div class="frontier-section-headline">
                            <strong>形状摘要</strong>
                            <span>P=${state.patchSize}, grid=${cols}×${cols}</span>
                        </div>
                        <div class="vit-shape-readout">
                            <div><span>公式</span><strong>N=(H/P)×(W/P)</strong></div>
                            <div><span>Patch Token 数</span><strong>${tokenCount()}</strong></div>
                            <div><span>加 CLS 后</span><strong>${tokenCount() + 1}</strong></div>
                        </div>
                    </section>
                </div>
                <div class="vit-side-stack">
                    <section class="frontier-stage-card frontier-architecture-card vit-architecture-panel">
                        <div class="frontier-section-headline">
                            <strong>ViT 网络架构图</strong>
                            <span>Image → Patch → Encoder → CLS</span>
                        </div>
                        ${architectureMarkup(stepId)}
                    </section>
                    <section class="frontier-stage-card vit-token-panel">
                        <div class="frontier-section-headline">
                            <strong>Token 序列</strong>
                            <span>CLS + ${tokenCount()} 个 Patch Token</span>
                        </div>
                        ${tokenSequenceMarkup()}
                    </section>
                    <section class="frontier-stage-card vit-attention-panel">
                        <div class="frontier-section-headline">
                            <strong>Attention 图 / 矩阵</strong>
                            <span>${escapeHtml(headProfile().label)}</span>
                        </div>
                        ${attentionMatrixMarkup(weights)}
                    </section>
                    <section class="frontier-stage-card vit-encoder-panel">
                        <div class="frontier-section-headline">
                            <strong>Transformer Encoder 模块</strong>
                            <span>LN → MSA → 残差 → MLP → 残差</span>
                        </div>
                        ${encoderMarkup()}
                    </section>
                    <section class="frontier-stage-card vit-output-panel">
                        <div class="frontier-section-headline">
                            <strong>CLS 输出</strong>
                            <span>Top-3 预设分类</span>
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
            el.sample.innerHTML = samples.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("");
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
        if (el.chips.sample) el.chips.sample.textContent = currentSample.label;
        if (el.chips.shape) el.chips.shape.textContent = `${cols}×${cols} 个 Patch`;
        if (el.chips.mode) el.chips.mode.textContent = state.display === "patch" ? "Patch 网格" : state.display === "token" ? "Token 序列" : state.display === "attention" ? "Attention 热力图" : "CLS 聚合";
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
                const label = `第 ${point.row + 1} 行 · 第 ${point.col + 1} 列`;
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
