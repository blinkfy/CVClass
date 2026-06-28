(function () {
    const root = document.querySelector("[data-gm-diffusion]");
    if (!root || !window.FrontierPlayer) return;

    const DEFAULT_DATA = {
        defaultSample: "cat",
        samples: [
            {
                id: "cat",
                title: "生成小猫",
                scene: "cat",
                prompt: "a small cat",
                samplingSteps: 30,
                steps: [
                    { t: 100, noise: 1, label: "纯噪声" },
                    { t: 75, noise: 0.75, label: "粗略形状" },
                    { t: 50, noise: 0.5, label: "主体轮廓" },
                    { t: 25, noise: 0.25, label: "细节出现" },
                    { t: 0, noise: 0, label: "生成图像" }
                ],
                guidance: [
                    { scale: 1, description: "弱条件，结果更随机。" },
                    { scale: 3, description: "条件略增强。" },
                    { scale: 7.5, description: "常用条件强度。" },
                    { scale: 12, description: "强条件，可能牺牲自然度。" }
                ]
            }
        ]
    };

    const STEPS = [
        {
            id: "clean",
            label: "干净图像 Clean Image",
            short: "x0",
            note: "x0 是训练时的干净图像。",
            input: "x0，真实干净图像",
            compute: "训练样本作为加噪起点",
            output: "干净图像 clean image",
            state: "模型学习不同噪声程度下的恢复目标",
            metrics: "视觉质量 / 细节稳定性",
            formula: "x0",
            summary: "训练阶段模型学习如何从不同噪声程度恢复图像。"
        },
        {
            id: "forward",
            label: "前向加噪 Forward Noise",
            short: "逐步加噪",
            note: "逐步向图像加入高斯噪声。",
            input: "x0 + 噪声日程 noise schedule",
            compute: "加入高斯噪声",
            output: "x_t",
            state: "图像逐渐接近噪声",
            metrics: "噪声强度 noise level",
            formula: "x_t = sqrt(alpha_t) x0 + sqrt(1-alpha_t) epsilon",
            summary: "前向过程把清晰图像逐步加噪，用来构造训练样本。"
        },
        {
            id: "schedule",
            label: "噪声日程 Noise Schedule",
            short: "噪声日程",
            note: "t 越大，图像越接近纯噪声。",
            input: "timestep t",
            compute: "日程控制加噪量",
            output: "噪声强度 noise level",
            state: "当前 timestep 控制噪声强度",
            metrics: "t / beta_t / alpha_t",
            formula: "noise = f(t)",
            summary: "噪声日程 Noise Schedule 决定每一步加入多少噪声，是训练和采样的时间轴。"
        },
        {
            id: "noise",
            label: "纯噪声 Pure Noise",
            short: "生成起点",
            note: "推理时通常从随机噪声开始。",
            input: "随机噪声 random noise",
            compute: "采样 seed 噪声",
            output: "x_T",
            state: "随机噪声作为生成起点",
            metrics: "seed / 方差",
            formula: "x_T ~ N(0, I)",
            summary: "生成时通常不是从真实图像开始，而是从随机噪声开始反向去噪。"
        },
        {
            id: "denoise",
            label: "反向去噪 Reverse Denoise",
            short: "预测噪声",
            note: "模型预测当前图像中的噪声，然后减去噪声。",
            input: "x_t + t",
            compute: "Denoising U-Net 预测噪声",
            output: "x_{t-1}",
            state: "噪声粒子淡出，主体轮廓出现",
            metrics: "预测噪声 / 残差",
            formula: "x_{t-1} = denoise(x_t, t)",
            summary: "反向去噪每一步只做一点点恢复，多步累积形成最终图像。"
        },
        {
            id: "condition",
            label: "文本条件 Text Condition",
            short: "prompt 引导",
            note: "文本 prompt 被编码成 text embedding，参与去噪网络计算。",
            input: "prompt 文本",
            compute: "Text Encoder → Text Embedding",
            output: "带条件的去噪",
            state: "文本语义连接到去噪网络",
            metrics: "guidance scale",
            formula: "epsilon_theta(x_t, t, c)",
            summary: "文本条件 Text Condition 引导生成内容朝 prompt 指定语义靠近。"
        },
        {
            id: "sampling",
            label: "采样路径 Sampling",
            short: "多步采样",
            note: "seed、prompt、guidance scale 和采样步数共同影响路径。",
            input: "噪声 seed + 条件",
            compute: "多步迭代去噪",
            output: "采样轨迹",
            state: "多条采样路径产生不同结果",
            metrics: "seed / prompt / 采样步数",
            formula: "x_T -> ... -> x_0",
            summary: "采样过程由多步去噪形成最终图像，同一个 prompt 也会因 seed 不同而变化。"
        },
        {
            id: "output",
            label: "生成输出 Generated Output",
            short: "最终输出",
            note: "评价文本一致性、视觉质量、多样性和细节稳定性。",
            input: "最终去噪样本",
            compute: "解码 / 输出图像",
            output: "生成图像 generated image",
            state: "输出当前 prompt 的生成样例",
            metrics: "文本一致性 / 视觉质量",
            formula: "x_0 generated",
            summary: "最终输出是 Generated image；要同时看文本一致性、视觉质量和细节稳定性。"
        }
    ];

    const DISPLAY_LABEL = {
        forward: "前向加噪",
        reverse: "反向去噪",
        condition: "文本条件",
        sampling: "采样时间线"
    };

    const el = {
        sample: root.querySelector('[data-diff-control="sample"]'),
        prompt: root.querySelector('[data-diff-control="prompt"]'),
        timestepButtons: Array.from(root.querySelectorAll("[data-diff-timestep]")),
        displayButtons: Array.from(root.querySelectorAll("[data-diff-display]")),
        guidanceButtons: Array.from(root.querySelectorAll("[data-diff-guidance]")),
        stage: root.querySelector("[data-diff-stage]"),
        pipeline: root.querySelector("[data-diff-pipeline]"),
        stageTitle: root.querySelector("[data-diff-stage-title]"),
        chips: {
            sample: root.querySelector('[data-diff-chip="sample"]'),
            timestep: root.querySelector('[data-diff-chip="timestep"]'),
            display: root.querySelector('[data-diff-chip="display"]')
        },
        summary: {
            prompt: root.querySelector('[data-diff-summary="prompt"]'),
            timestep: root.querySelector('[data-diff-summary="timestep"]'),
            phase: root.querySelector('[data-diff-summary="phase"]'),
            noise: root.querySelector('[data-diff-summary="noise"]'),
            guidance: root.querySelector('[data-diff-summary="guidance"]'),
            steps: root.querySelector('[data-diff-summary="steps"]')
        },
        notes: {
            step: root.querySelector('[data-diff-note="step"]'),
            summary: root.querySelector('[data-diff-note="summary"]'),
            input: root.querySelector('[data-diff-note="input"]'),
            compute: root.querySelector('[data-diff-note="compute"]'),
            output: root.querySelector('[data-diff-note="output"]'),
            state: root.querySelector('[data-diff-note="state"]'),
            metrics: root.querySelector('[data-diff-note="metrics"]'),
            formula: root.querySelector('[data-diff-note="formula"]'),
            formulaNote: root.querySelector('[data-diff-note="formulaNote"]')
        }
    };

    const state = {
        data: null,
        sampleId: "",
        prompt: "a small cat",
        timestep: 50,
        display: "forward",
        guidance: 7.5,
        player: null
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clamp01(value) {
        return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function numberOr(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function stringOr(value, fallback) {
        const text = String(value ?? "").trim();
        return text || fallback;
    }

    function normalizeSteps(steps, fallbackSteps) {
        const byT = new Map((Array.isArray(steps) ? steps : []).map((step) => [Number(step?.t), step]));
        return fallbackSteps.map((fallback) => {
            const raw = byT.get(Number(fallback.t)) || {};
            const t = Number(fallback.t);
            return {
                t,
                noise: clamp01(numberOr(raw.noise, fallback.noise ?? t / 100)),
                image: String(raw.image || ""),
                label: stringOr(raw.label, fallback.label || `x${t}`)
            };
        });
    }

    function normalizeGuidance(guidance, fallbackGuidance) {
        const source = Array.isArray(guidance) && guidance.length ? guidance : fallbackGuidance;
        return source.map((item, index) => ({
            scale: Math.max(0.1, numberOr(item?.scale, fallbackGuidance[index % fallbackGuidance.length]?.scale || 7.5)),
            description: stringOr(item?.description, fallbackGuidance[index % fallbackGuidance.length]?.description || "条件强度影响去噪方向。")
        }));
    }

    function normalizeData(data) {
        const fallbackSamples = DEFAULT_DATA.samples;
        const rawSamples = Array.isArray(data?.samples) && data.samples.length ? data.samples : fallbackSamples;
        const samplesOut = rawSamples.map((sample, index) => {
            const fallback = fallbackSamples[index % fallbackSamples.length];
            return {
                id: stringOr(sample?.id, fallback.id),
                title: stringOr(sample?.title, fallback.title),
                scene: stringOr(sample?.scene, fallback.scene || fallback.id),
                prompt: String(sample?.prompt ?? fallback.prompt ?? ""),
                samplingSteps: Math.max(1, Math.round(numberOr(sample?.samplingSteps, fallback.samplingSteps || 30))),
                steps: normalizeSteps(sample?.steps, fallback.steps),
                guidance: normalizeGuidance(sample?.guidance, fallback.guidance)
            };
        });
        return {
            defaultSample: stringOr(data?.defaultSample, samplesOut[0]?.id || fallbackSamples[0].id),
            samples: samplesOut
        };
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

    function currentSample() {
        return samples().find((sample) => sample.id === state.sampleId) || samples()[0];
    }

    function sampleSteps() {
        const steps = currentSample()?.steps;
        return Array.isArray(steps) && steps.length ? steps : DEFAULT_DATA.samples[0].steps;
    }

    function stepByT(timestep) {
        const target = Number(timestep);
        return sampleSteps().find((item) => Number(item.t) === target) || {
            t: target,
            noise: clamp01(target / 100),
            label: target >= 100 ? "纯噪声" : "中间状态"
        };
    }

    function currentNoise() {
        return clamp01(stepByT(state.timestep).noise ?? (state.timestep / 100));
    }

    function displayForStep(stepId) {
        if (["denoise"].includes(stepId)) return "reverse";
        if (["condition"].includes(stepId)) return "condition";
        if (["sampling", "output"].includes(stepId)) return "sampling";
        return "forward";
    }

    function timestepForStep(stepId) {
        return {
            clean: 0,
            forward: 50,
            schedule: 75,
            noise: 100,
            denoise: 75,
            condition: 50,
            sampling: 25,
            output: 0
        }[stepId] ?? state.timestep;
    }

    function stepForDisplay(display) {
        return { forward: 1, reverse: 4, condition: 5, sampling: 6 }[display] ?? 1;
    }

    function sceneDetail(sample, timestep) {
        const scene = sample.scene || sample.id || "cat";
        if (scene === "digit") return timestep <= 25 ? "7" : "";
        if (scene === "street") return timestep <= 25 ? "车" : "";
        if (scene === "flower") return timestep <= 25 ? "花" : "";
        if (scene === "style") return timestep <= 25 ? "水彩" : "";
        return timestep <= 25 ? "猫" : "";
    }

    function diffImageMarkup(timestep, label) {
        const sample = currentSample();
        const step = stepByT(timestep);
        const noise = clamp01(step.noise ?? (Number(timestep) / 100));
        return `
            <div
                class="diff-img"
                data-scene="${escapeHtml(sample.scene || sample.id || "cat")}"
                style="--noise:${noise.toFixed(2)}"
                aria-label="${escapeHtml(label || step.label || "扩散过程图像")}"
            >
                <span class="diff-shape"></span>
                <b class="diff-detail">${escapeHtml(sceneDetail(sample, Number(timestep)))}</b>
            </div>
        `;
    }

    function orderedTimesteps() {
        const base = [0, 25, 50, 75, 100];
        return state.display === "reverse" || state.player?.current()?.id === "denoise" || state.player?.current()?.id === "sampling"
            ? base.slice().reverse()
            : base;
    }

    function renderSequencePanel() {
        return `
            <section class="diff-sequence-panel">
                <div class="diff-panel-heading">
                    <strong>加噪 / 去噪主序列</strong>
                    <span>${state.display === "reverse" ? "x100 → x0" : "x0 → x100"}</span>
                </div>
                <div class="diff-phase-note" aria-label="Diffusion 训练与生成阶段区分">
                    <article><strong>训练理解</strong><span>Clean x0 → Forward Noise → 学习预测噪声</span></article>
                    <article><strong>生成理解</strong><span>Pure Noise xT → Reverse Denoise → Generated Output</span></article>
                </div>
                <div class="diff-sequence" aria-label="Diffusion timestep 序列">
                    ${orderedTimesteps().map((timestep) => {
                        const step = stepByT(timestep);
                        return `
                            <article class="diff-step-card ${Number(timestep) === Number(state.timestep) ? "is-active" : ""}" data-diff-step-card="${timestep}">
                                ${diffImageMarkup(timestep, `x${timestep}`)}
                                <strong>x${timestep}</strong>
                                <span>${escapeHtml(step.label || "")} · 噪声 ${Number(step.noise ?? timestep / 100).toFixed(2)}</span>
                            </article>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }

    function renderCurrentPanel() {
        const t = Number(state.timestep);
        const nextT = Math.max(0, t - 25);
        const noisyLabel = `含噪 x_${t}`;
        const lessLabel = `更少噪声 x_${nextT}`;
        return `
            <section class="diff-current-panel">
                <div class="diff-panel-heading">
                    <strong>当前 timestep 大图</strong>
                    <span>t=${t} -> t=${nextT}</span>
                </div>
                <div class="diff-denoise-flow" aria-label="当前 timestep 去噪流程">
                    <article class="diff-current-card">
                        <strong>${escapeHtml(noisyLabel)}</strong>
                        ${diffImageMarkup(t, noisyLabel)}
                    </article>
                    <div class="diff-arrow">-></div>
                    <div class="diff-unet">
                        <div>
                            <strong>Denoising U-Net</strong>
                            <span>预测噪声 epsilon</span>
                        </div>
                    </div>
                    <div class="diff-arrow">-></div>
                    <article class="diff-current-card">
                        <strong>${escapeHtml(lessLabel)}</strong>
                        ${diffImageMarkup(nextT, lessLabel)}
                    </article>
                </div>
            </section>
        `;
    }

    function promptTokens() {
        return String(state.prompt ?? currentSample().prompt ?? "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 8);
    }

    function guidanceDescription() {
        const guidance = currentSample()?.guidance || DEFAULT_DATA.samples[0].guidance;
        const exact = guidance.find((item) => Number(item.scale) === Number(state.guidance));
        return exact?.description || "条件强度改变 text embedding 对去噪网络的影响。";
    }

    function renderConditionPanel() {
        const width = `${Math.round(Math.min(100, Math.max(12, (Number(state.guidance) / 12) * 100)))}%`;
        return `
            <section class="diff-condition-panel">
                <div class="diff-panel-heading">
                    <strong>文本条件区 Text Condition</strong>
                    <span>guidance ${Number(state.guidance).toFixed(1)}</span>
                </div>
                <div class="diff-condition-flow">
                    <div class="diff-token-row" aria-label="Prompt token 化">
                        ${promptTokens().map((token, index) => `<span style="animation-delay:${index * 0.04}s">${escapeHtml(token)}</span>`).join("")}
                    </div>
                    <div class="diff-condition-card">
                        <article><strong>Prompt 文本</strong><span>${escapeHtml(state.prompt || "空 prompt / 无条件演示")}</span></article>
                        <div class="diff-arrow">-></div>
                        <article><strong>Text Encoder</strong><span>token → embedding</span></article>
                        <div class="diff-arrow">-></div>
                        <article><strong>去噪网络</strong><span>conditioned U-Net</span></article>
                    </div>
                    <div>
                        <div class="diff-guidance-line" style="--guidance-width:${width}"><b></b></div>
                        <p class="diff-caption">${escapeHtml(guidanceDescription())}</p>
                    </div>
                </div>
            </section>
        `;
    }

    function renderSamplingPanel() {
        const sample = currentSample();
        const rows = [
            ["噪声 seed A", state.prompt || "空 prompt", "结果 A", 25],
            ["噪声 seed B", state.prompt || "空 prompt", "结果 B", 0],
            ["相同 seed", `${state.prompt || "空 prompt"} + 变体`, "不同方向", 50]
        ];
        return `
            <section class="diff-sampling-panel">
                <div class="diff-panel-heading">
                    <strong>采样路径区 Sampling</strong>
                    <span>seed / prompt / guidance</span>
                </div>
                <div class="diff-sampling-paths" aria-label="Diffusion sampling path">
                    ${rows.map((row, index) => `
                        <div class="diff-path-row">
                            <div class="diff-path-seed">${escapeHtml(row[0])}</div>
                            <div class="diff-path-line"><b style="width:${72 + index * 8}%"></b></div>
                            <div class="diff-path-result">
                                ${diffImageMarkup(row[3], `${sample.title} ${row[2]}`)}
                                <span>${escapeHtml(row[2])}</span>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </section>
        `;
    }

    function renderStage() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载 Diffusion 预设样例...</div>';
            return;
        }
        el.stage.innerHTML = `
            <div class="diffusion-stage-layout" data-display="${escapeHtml(state.display)}">
                ${renderSequencePanel()}
                ${renderCurrentPanel()}
                ${renderConditionPanel()}
                ${renderSamplingPanel()}
            </div>
        `;
    }

    function renderPipeline() {
        if (!el.pipeline || !state.player) return;
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
        if (!state.data) return;
        const sample = currentSample();
        if (el.sample) {
            el.sample.innerHTML = samples().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("");
            el.sample.value = sample.id;
        }
        if (el.prompt && el.prompt.value !== state.prompt) el.prompt.value = state.prompt;

        el.timestepButtons.forEach((button) => {
            const active = Number(button.dataset.diffTimestep) === Number(state.timestep);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
        el.displayButtons.forEach((button) => {
            const active = button.dataset.diffDisplay === state.display;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
        el.guidanceButtons.forEach((button) => {
            const active = Number(button.dataset.diffGuidance) === Number(state.guidance);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (el.stageTitle) el.stageTitle.textContent = `${STEPS[state.player.index]?.label || "Diffusion"} · ${sample.title}`;
        if (el.chips.sample) el.chips.sample.textContent = sample.title;
        if (el.chips.timestep) el.chips.timestep.textContent = `t = ${state.timestep}`;
        if (el.chips.display) el.chips.display.textContent = DISPLAY_LABEL[state.display] || state.display;
        if (el.summary.prompt) el.summary.prompt.textContent = state.prompt || "空 prompt";
        if (el.summary.timestep) el.summary.timestep.textContent = `t = ${state.timestep}`;
        if (el.summary.phase) el.summary.phase.textContent = DISPLAY_LABEL[state.display] || state.display;
        if (el.summary.noise) el.summary.noise.textContent = currentNoise().toFixed(2);
        if (el.summary.guidance) el.summary.guidance.textContent = Number(state.guidance).toFixed(1);
        if (el.summary.steps) el.summary.steps.textContent = String(sample.samplingSteps || 30);
    }

    function renderNotes() {
        if (!state.player) return;
        const step = state.player.current();
        if (el.notes.step) el.notes.step.textContent = step.label || "";
        if (el.notes.summary) el.notes.summary.textContent = `${step.summary || ""} 当前 prompt：${state.prompt || "空 prompt / 无条件演示"}。`;
        if (el.notes.input) el.notes.input.textContent = step.input || "";
        if (el.notes.compute) el.notes.compute.textContent = step.compute || "";
        if (el.notes.output) el.notes.output.textContent = step.output || "";
        if (el.notes.state) el.notes.state.textContent = step.state || "";
        if (el.notes.metrics) el.notes.metrics.textContent = step.metrics || "";
        if (el.notes.formula) el.notes.formula.textContent = step.formula || "";
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = `当前 noise level=${currentNoise().toFixed(2)}，guidance scale=${Number(state.guidance).toFixed(1)}。本页为机制拆解与预设样例演示，不是真实 Diffusion 推理。`;
        }
    }

    function renderAll() {
        renderControls();
        renderStage();
        renderPipeline();
        renderNotes();
    }

    function setSample(sampleId) {
        state.sampleId = sampleId;
        state.prompt = currentSample().prompt || state.prompt;
        renderAll();
    }

    function bindEvents() {
        root.querySelectorAll("[data-frontier-play]").forEach((button) => {
            button.addEventListener("click", () => {
                window.setTimeout(() => {
                    state.player?.renderStepper?.();
                    state.player?.renderControls?.();
                    renderPipeline();
                }, 0);
            });
        });

        el.sample?.addEventListener("change", () => setSample(el.sample.value));
        el.prompt?.addEventListener("input", () => {
            state.prompt = el.prompt.value;
            renderAll();
        });
        root.addEventListener("click", (event) => {
            const stepCard = event.target.closest("[data-diff-step-card]");
            if (stepCard) {
                state.timestep = Number(stepCard.dataset.diffStepCard) || 0;
                renderAll();
                return;
            }

            const timestep = event.target.closest("[data-diff-timestep]");
            if (timestep) {
                state.timestep = Number(timestep.dataset.diffTimestep) || 0;
                renderAll();
                return;
            }

            const display = event.target.closest("[data-diff-display]");
            if (display) {
                state.display = display.dataset.diffDisplay || "forward";
                state.player.setStep(stepForDisplay(state.display));
                return;
            }

            const guidance = event.target.closest("[data-diff-guidance]");
            if (guidance) {
                state.guidance = Number(guidance.dataset.diffGuidance) || 7.5;
                renderAll();
            }
        });
    }

    function initWithData(data) {
        state.data = normalizeData(data);
        state.sampleId = state.data.defaultSample || samples()[0]?.id || "cat";
                state.prompt = currentSample().prompt || "a small cat";
        renderAll();
    }

    function init() {
        state.player = new window.FrontierPlayer(root, {
            onStepChange: function (_index, step) {
                state.display = displayForStep(step.id);
                state.timestep = timestepForStep(step.id);
                renderAll();
            }
        });
        state.player.setSteps(STEPS);
        bindEvents();

        fetchJson(root.dataset.samplesUrl)
            .then(initWithData)
            .catch((error) => {
                console.warn("Diffusion 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
