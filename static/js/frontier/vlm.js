(function () {
    const root = document.querySelector("[data-vlm-lab]");
    if (!root || !window.FrontierPlayer) return;

    const DEFAULT_DATA = {
        defaultSample: "street",
        questionTemplates: ["这张图中有什么？", "关注主要物体", "关注证据区域", "关注场景位置", "关注动作线索"],
        samples: [
            {
                id: "street",
                label: "街道场景",
                scene: "street",
                shape: "384×384×3",
                prompt: "这张图中有什么？",
                answer: "这是一个街道场景，包含道路、车辆和建筑。",
                tokens: ["这", "是", "一个", "街道", "场景", "，", "包含", "道路", "、", "车辆", "和", "建筑", "。"],
                evidence: [
                    { id: "road", label: "道路", x: 33, y: 58, w: 38, h: 30, score: 0.91 },
                    { id: "vehicle", label: "车辆", x: 59, y: 50, w: 22, h: 14, score: 0.86 },
                    { id: "building", label: "建筑", x: 10, y: 18, w: 26, h: 36, score: 0.72 },
                ],
            },
        ],
    };

    const STEPS = [
        {
            id: "image",
            label: "图像输入",
            short: "H×W×3",
            note: "输入图像以 H×W×3 进入视觉编码器。",
            input: "图像 ∈ R^(H×W×3) + 问题 Prompt",
            middle: "原始图像张量",
            compute: "读取输入图像和问题",
            output: "图像画布 + 问题文本",
            explain: "图像区域尚未关联到答案。",
            summary: "VLM 的第一步仍是把图像作为视觉输入，而不是直接进入聊天框。",
            formula: "Image ∈ R^(H×W×3)",
        },
        {
            id: "vision",
            label: "视觉 Tokens",
            short: "patch / region tokens",
            note: "图像被切分为区域或 patch，并压缩成 visual token strip。",
            input: "图像张量",
            middle: "V1...V16 视觉 tokens",
            compute: "Vision Encoder(image)",
            output: "ImageTokens 序列",
            explain: "每个 token 对应一个图像区域。",
            summary: "视觉编码器把二维图像压缩为 token 序列，供后续融合模块读取。",
            formula: "V = VisionEncoder(Image)",
        },
        {
            id: "prompt",
            label: "Prompt Tokens",
            short: "question tokens",
            note: "问题文本被拆成 prompt tokens。",
            input: "问题 Prompt",
            middle: "T1...Tk 文本 tokens",
            compute: "Tokenizer(question)",
            output: "PromptTokens 序列",
            explain: "问题中的物体、区域、场景等词会引导视觉注意力。",
            summary: "文本 prompt 决定模型需要从图像中读取哪些证据。",
            formula: "T = Tokenizer(Prompt)",
        },
        {
            id: "fusion",
            label: "跨模态融合",
            short: "图文 token 互读",
            note: "visual tokens 和 text tokens 进入 fusion block。",
            input: "ImageTokens + PromptTokens",
            middle: "Cross-Attention 激活",
            compute: "h = CrossAttention(Q_text, K_image, V_image)",
            output: "融合后的多模态状态",
            explain: "文本 token 连接到相关图像区域，区域出现 pulse 高亮。",
            summary: "跨模态融合让“物体”“位置”“动作”等词从图像 token 中取证。",
            formula: "h = CrossAttention(Q_text, K_image, V_image)",
        },
        {
            id: "decoder",
            label: "Decoder 解码",
            short: "逐 token 生成",
            note: "回答 token 逐步生成，每个 token 读取融合后的状态。",
            input: "融合状态 + 已生成回答 tokens",
            middle: "Decoder 隐状态",
            compute: "预测下一个 token",
            output: "流式回答 tokens",
            explain: "生成过程中相关证据区域轻微闪烁。",
            summary: "VLM 的回答来自解码器逐 token 生成，而不是一次性从图像中复制文本。",
            formula: "Answer = Decoder(Fusion(ImageTokens, TextTokens))",
        },
        {
            id: "answer",
            label: "回答",
            short: "完整回答",
            note: "展示完整回答，并保留回答与证据区域的连接。",
            input: "回答 token 序列",
            middle: "还原后的句子",
            compute: "join generated tokens",
            output: "自然语言回答",
            explain: "当前回答来自预设样例，不是实时模型输出。",
            summary: "页面展示的是机制动画和样例问答，不模拟真实在线聊天。",
            formula: "Answer = join(tokens)",
        },
        {
            id: "evidence",
            label: "证据",
            short: "区域依据",
            note: "在图像上高亮回答依据区域，并显示 evidence scores。",
            input: "回答 tokens + 图像区域",
            middle: "区域分数",
            compute: "证据区域排序",
            output: "高亮框 + 分数",
            explain: "证据区域用于解释回答可能依赖的视觉线索。",
            summary: "证据高亮是预设可解释视图，用于说明 attention/evidence 的概念边界。",
            formula: "score(region | answer)",
        },
    ];

    const el = {
        sample: root.querySelector('[data-vlm-control="sample"]'),
        question: root.querySelector('[data-vlm-control="question"]'),
        answerMode: root.querySelector('[data-vlm-control="answerMode"]'),
        displayButtons: Array.from(root.querySelectorAll("[data-vlm-display]")),
        stage: root.querySelector("[data-vlm-stage]"),
        pipeline: root.querySelector("[data-vlm-pipeline]"),
        stageTitle: root.querySelector("[data-vlm-stage-title]"),
        evidenceList: root.querySelector("[data-vlm-evidence-list]"),
        chips: {
            sample: root.querySelector('[data-vlm-chip="sample"]'),
            mode: root.querySelector('[data-vlm-chip="mode"]'),
        },
        summary: {
            visionTokens: root.querySelector('[data-vlm-summary="visionTokens"]'),
            promptTokens: root.querySelector('[data-vlm-summary="promptTokens"]'),
            fusion: root.querySelector('[data-vlm-summary="fusion"]'),
            answer: root.querySelector('[data-vlm-summary="answer"]'),
        },
        notes: {
            step: root.querySelector('[data-vlm-note="step"]'),
            summary: root.querySelector('[data-vlm-note="summary"]'),
            input: root.querySelector('[data-vlm-note="input"]'),
            middle: root.querySelector('[data-vlm-note="middle"]'),
            compute: root.querySelector('[data-vlm-note="compute"]'),
            output: root.querySelector('[data-vlm-note="output"]'),
            explain: root.querySelector('[data-vlm-note="explain"]'),
            formula: root.querySelector('[data-vlm-note="formula"]'),
            formulaNote: root.querySelector('[data-vlm-note="formulaNote"]'),
        },
    };

    const state = {
        data: null,
        sampleId: "",
        question: "",
        answerMode: "short",
        display: "fusion",
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

    function samples() {
        return state.data?.samples?.length ? state.data.samples : DEFAULT_DATA.samples;
    }

    function sample() {
        return samples().find((item) => item.id === state.sampleId) || samples()[0];
    }

    function questionTemplates() {
        return state.data?.questionTemplates?.length ? state.data.questionTemplates : DEFAULT_DATA.questionTemplates;
    }

    function displayForStep(stepId) {
        if (stepId === "fusion") return "fusion";
        if (stepId === "decoder" || stepId === "answer") return "answer";
        if (stepId === "evidence") return "evidence";
        return stepId === "vision" ? "attention" : "fusion";
    }

    function stepForDisplay(display) {
        return { fusion: 3, attention: 3, answer: 4, evidence: 6 }[display] ?? 3;
    }

    function displayLabel() {
        return {
            fusion: "Token 融合",
            attention: "图像注意力",
            answer: "回答生成",
            evidence: "证据高亮",
        }[state.display] || "Token 融合";
    }

    function promptTokens() {
        return Array.from((state.question || sample().prompt || questionTemplates()[0]).replace(/[？?。]/g, "")).slice(0, 12);
    }

    function answerTokens() {
        if (state.answerMode === "steps") {
            return ["先", "观察", "图像", "区域", "，", "再", "结合", "问题", "生成", "回答", "。"];
        }
        if (state.answerMode === "evidence") {
            const first = sample().evidence?.[0]?.label || "主体区域";
            return ["答案", "主要", "依据", first, "区域", "。"];
        }
        if (state.answerMode === "stream") return sample().tokens || [];
        return sample().tokens || [];
    }

    function evidenceItems() {
        return (sample().evidence || []).slice().sort((a, b) => b.score - a.score);
    }

    function sceneMarkup(current) {
        return `
            <div class="frontier-sample-scene" data-scene="${escapeHtml(current.scene || current.id)}" aria-hidden="true">
                <span class="f-scene-sky"></span>
                <span class="f-scene-building f-scene-building--left"></span>
                <span class="f-scene-building f-scene-building--right"></span>
                <span class="f-scene-ground"></span>
                <span class="f-scene-subject"></span>
            </div>
        `;
    }

    function evidenceLayerMarkup() {
        return `
            <div class="vlm-evidence-layer" aria-hidden="true">
                ${evidenceItems().map((item, index) => `
                    <span class="vlm-evidence-box" style="--x:${item.x}%;--y:${item.y}%;--w:${item.w}%;--h:${item.h}%;--score:${item.score};--vlm-delay:${index * 110}ms">
                        <b>${escapeHtml(item.label)}</b>
                    </span>
                `).join("")}
            </div>
        `;
    }

    function patchLayerMarkup() {
        return `
            <div class="vlm-patch-layer" aria-hidden="true">
                ${Array.from({ length: 16 }, (_item, index) => `<span style="--vlm-delay:${index * 28}ms">V${index + 1}</span>`).join("")}
            </div>
        `;
    }

    function visionTokensMarkup() {
        return `
            <div class="vlm-token-strip vlm-token-strip--vision">
                ${Array.from({ length: 16 }, (_item, index) => `
                    <span class="${index % 5 === 0 ? "is-hot" : ""}" style="--vlm-delay:${index * 35}ms">V${index + 1}</span>
                `).join("")}
            </div>
        `;
    }

    function promptTokensMarkup() {
        return `
            <div class="vlm-token-strip vlm-token-strip--prompt">
                ${promptTokens().map((token, index) => `
                    <span class="${/[物区场地车人颜色动作]/.test(token) ? "is-hot" : ""}" style="--vlm-delay:${index * 48}ms">T${index + 1}<b>${escapeHtml(token)}</b></span>
                `).join("")}
            </div>
        `;
    }

    function fusionMarkup() {
        const prompt = promptTokens();
        return `
            <div class="vlm-fusion-block">
                <div>
                    <strong>Prompt Tokens</strong>
                    ${promptTokensMarkup()}
                </div>
                <div class="vlm-fusion-core">
                    <span>跨模态融合</span>
                    <code>h = CrossAttention(Q_text, K_image, V_image)</code>
                    ${evidenceItems().slice(0, 3).map((item, index) => `<i style="--vlm-delay:${index * 120}ms">${escapeHtml(prompt[index + 1] || "Q")} → ${escapeHtml(item.label)}</i>`).join("")}
                </div>
                <div>
                    <strong>图像 Tokens</strong>
                    ${visionTokensMarkup()}
                </div>
            </div>
        `;
    }

    function decoderMarkup() {
        const tokens = answerTokens();
        return `
            <div class="vlm-decoder">
                <div class="vlm-decoder-core">
                    <span>Decoder 解码</span>
                    <code>Answer = Decoder(Fusion(ImageTokens, TextTokens))</code>
                </div>
                <div class="vlm-answer-stream">
                    ${tokens.map((token, index) => `<span style="--vlm-delay:${index * 95}ms">${escapeHtml(token)}</span>`).join("")}
                </div>
            </div>
        `;
    }

    function answerMarkup() {
        return `
            <div class="vlm-answer-card">
                <span>回答</span>
                <strong>${escapeHtml(answerTokens().join(""))}</strong>
                <p>Prompt 下拉框只改变 token 观察视角；回答与证据来自当前样例，不调用真实视觉语言模型。</p>
            </div>
        `;
    }

    function evidenceScoresMarkup() {
        return `
            <div class="vlm-evidence-scores">
                ${evidenceItems().map((item, index) => `
                    <article style="--score-width:${Math.round(item.score * 100)}%;--vlm-delay:${index * 90}ms">
                        <span>${escapeHtml(item.label)}</span>
                        <i><b></b></i>
                        <strong>${item.score.toFixed(2)}</strong>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function architectureMarkup(stepId) {
        const activeIndex = {
            image: 0,
            vision: 1,
            prompt: 2,
            fusion: 2,
            decoder: 3,
            answer: 4,
            evidence: 4,
        }[stepId] ?? 0;
        const nodes = [
            ["图像输入", "Image", "H×W×3 图像张量"],
            ["Vision Encoder", "视觉编码器", "输出图像 token"],
            ["Projector / Adapter", "接口适配", "对齐到 LLM token 空间"],
            ["LLM Decoder", "语言解码器", "按 prompt 生成回答 token"],
            ["答案 / 证据", "Answer / Evidence", "输出文本并高亮依据区域"],
        ];
        return `
            <div class="model-arch-graph" aria-label="VLM 网络架构图">
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
                    <span>Prompt 作用</span>
                    <strong>文本问题通过 LLM 读取视觉 token</strong>
                </div>
            </div>
        `;
    }

    function renderStage() {
        const step = state.player.current();
        const current = sample();
        el.stage.innerHTML = `
            <div class="vlm-stage-layout" data-step="${escapeHtml(step.id || "image")}" data-display="${escapeHtml(state.display)}">
                <section class="frontier-stage-card frontier-architecture-card vlm-architecture-panel">
                    <div class="frontier-section-headline">
                        <strong>VLM 网络架构图</strong>
                        <span>视觉编码器 → Adapter → LLM</span>
                    </div>
                    ${architectureMarkup(step.id || "image")}
                </section>
                <section class="frontier-stage-card vlm-image-panel">
                    <div class="frontier-section-headline">
                        <strong>图像输入</strong>
                        <span>${escapeHtml(current.shape || "384×384×3")}</span>
                    </div>
                    <div class="frontier-sample-frame" data-caption="${escapeHtml(current.label)} · ${escapeHtml(current.shape || "H×W×3")}">
                        ${sceneMarkup(current)}
                        ${patchLayerMarkup()}
                        ${evidenceLayerMarkup()}
                    </div>
                </section>

                <section class="frontier-stage-card vlm-token-panel">
                    <div class="frontier-section-headline">
                        <strong>视觉 Tokens</strong>
                        <span>patch / 区域序列</span>
                    </div>
                    ${visionTokensMarkup()}
                </section>

                <section class="frontier-stage-card vlm-prompt-panel">
                    <div class="frontier-section-headline">
                        <strong>Prompt Tokens</strong>
                        <span>${escapeHtml(state.question)}</span>
                    </div>
                    ${promptTokensMarkup()}
                </section>

                <section class="frontier-stage-card vlm-fusion-panel">
                    <div class="frontier-section-headline">
                        <strong>跨模态融合</strong>
                        <span>文本查询图像区域</span>
                    </div>
                    ${fusionMarkup()}
                </section>

                <section class="frontier-stage-card vlm-decoder-panel">
                    <div class="frontier-section-headline">
                        <strong>Decoder 解码</strong>
                        <span>回答 token 流</span>
                    </div>
                    ${decoderMarkup()}
                </section>

                <section class="frontier-stage-card vlm-answer-panel">
                    <div class="frontier-section-headline">
                        <strong>回答 + 证据</strong>
                        <span>回答依据</span>
                    </div>
                    ${answerMarkup()}
                    ${evidenceScoresMarkup()}
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
        if (el.sample) {
            el.sample.innerHTML = samples().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} / ${escapeHtml(item.label)}</option>`).join("");
            el.sample.value = state.sampleId;
        }
        if (el.question) {
            el.question.innerHTML = questionTemplates().map((question) => `<option value="${escapeHtml(question)}">${escapeHtml(question)}</option>`).join("");
            el.question.value = state.question;
        }
        if (el.answerMode) el.answerMode.value = state.answerMode;
        el.displayButtons.forEach((button) => {
            const active = button.dataset.vlmDisplay === state.display;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function renderSummaryAndNotes() {
        const step = state.player.current();
        const current = sample();
        const evidence = evidenceItems();

        if (el.stageTitle) el.stageTitle.textContent = `${step.label} · ${current.label}`;
        if (el.chips.sample) el.chips.sample.textContent = current.id;
        if (el.chips.mode) el.chips.mode.textContent = displayLabel();
        if (el.summary.visionTokens) el.summary.visionTokens.textContent = "16";
        if (el.summary.promptTokens) el.summary.promptTokens.textContent = String(promptTokens().length);
        if (el.summary.fusion) el.summary.fusion.textContent = "Cross-Attention";
        if (el.summary.answer) el.summary.answer.textContent = String(answerTokens().length);

        if (el.notes.step) el.notes.step.textContent = step.label;
        if (el.notes.summary) el.notes.summary.textContent = step.summary;
        if (el.notes.input) el.notes.input.textContent = step.input;
        if (el.notes.middle) el.notes.middle.textContent = step.middle;
        if (el.notes.compute) el.notes.compute.textContent = step.compute;
        if (el.notes.output) el.notes.output.textContent = step.output;
        if (el.notes.explain) el.notes.explain.textContent = step.explain;
        if (el.notes.formula) el.notes.formula.textContent = step.formula;
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = step.id === "evidence"
                ? `最高证据区域：${evidence[0]?.label || "-"} (${evidence[0]?.score.toFixed(2) || "-"})。当前高亮是预设样例。`
                : "Answer = Decoder(Fusion(ImageTokens, TextTokens))；SmolVLM 已作为后续实验模型评估，当前页不默认下载 VLM 权重。";
        }

        if (el.evidenceList) {
            el.evidenceList.innerHTML = evidence.map((item) => `
                <li>
                    <span>${escapeHtml(item.label)}</span>
                    <i><b style="width:${Math.round(item.score * 100)}%"></b></i>
                    <strong>${item.score.toFixed(2)}</strong>
                </li>
            `).join("");
        }
    }

    function renderAll() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载 VLM 预设样例...</div>';
            return;
        }
        state.display = displayForStep(state.player.current().id);
        renderControls();
        renderStage();
        renderPipeline();
        renderSummaryAndNotes();
    }

    function bindEvents() {
        el.sample?.addEventListener("change", () => {
            state.sampleId = el.sample.value;
            state.question = sample().prompt || questionTemplates()[0];
            renderAll();
        });
        el.question?.addEventListener("change", () => {
            state.question = el.question.value || questionTemplates()[0];
            renderAll();
        });
        el.answerMode?.addEventListener("change", () => {
            state.answerMode = el.answerMode.value || "short";
            renderAll();
        });
        el.displayButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.display = button.dataset.vlmDisplay || "fusion";
                state.player.setStep(stepForDisplay(state.display));
                alignStageTop();
            });
        });
    }

    function initWithData(data) {
        state.data = data || DEFAULT_DATA;
        state.sampleId = state.data.defaultSample || samples()[0]?.id || "street";
        state.question = sample().prompt || questionTemplates()[0];
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
                console.warn("VLM 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
