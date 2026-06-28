(function () {
    const root = document.querySelector("[data-gm-gan]");
    if (!root || !window.FrontierPlayer) return;

    const DEFAULT_DATA = {
        defaultSample: "digit",
        samples: [
            {
                id: "digit",
                title: "手写数字",
                scene: "digit",
                latentDim: 100,
                stages: {
                    early: { dReal: 0.91, dFake: 0.12, gLoss: 2.18, dLoss: 0.31, fakeQuality: "噪声块", description: "生成器尚未学到稳定结构。" },
                    middle: { dReal: 0.86, dFake: 0.41, gLoss: 1.12, dLoss: 0.63, fakeQuality: "粗略轮廓", description: "生成结果开始出现类别轮廓。" },
                    late: { dReal: 0.73, dFake: 0.67, gLoss: 0.54, dLoss: 0.82, fakeQuality: "较清晰", description: "生成器更容易骗过判别器。" }
                },
                latentPoints: [
                    { id: "z1", vector2d: [0.2, 0.7], label: "thin" },
                    { id: "z2", vector2d: [0.8, 0.4], label: "bold" },
                    { id: "z3", vector2d: [0.5, 0.2], label: "round" }
                ]
            }
        ]
    };

    const STEPS = [
        {
            id: "noise",
            label: "Noise z",
            short: "随机隐变量",
            note: "随机隐变量作为生成器输入。",
            input: "z ∈ R^d",
            compute: "从潜空间采样 latent vector",
            output: "latent code",
            state: "等待进入 Generator",
            metrics: "latent dim / z position",
            formula: "z ∈ R^d",
            summary: "GAN 不从图像开始生成，而是从随机隐变量 z 开始。"
        },
        {
            id: "generator",
            label: "Generator",
            short: "z → image",
            note: "Generator 将 z 映射成图像空间。",
            input: "latent vector z",
            compute: "Generator network G",
            output: "x_fake = G(z)",
            state: "生成器正在放大结构",
            metrics: "G loss / fake quality",
            formula: "x_fake = G(z)",
            summary: "生成器学习把潜变量映射成具有目标类别结构的图像。"
        },
        {
            id: "fake",
            label: "Fake Image",
            short: "生成图像",
            note: "生成结果可能从模糊噪声逐渐变成可识别图像。",
            input: "x_fake",
            compute: "前向生成结果",
            output: "fake image",
            state: "fake batch 等待判别",
            metrics: "fake quality / diversity",
            formula: "x_fake = G(z)",
            summary: "训练越充分，fake image 通常越有类别轮廓，但仍可能存在伪影。"
        },
        {
            id: "batch",
            label: "Real / Fake Batch",
            short: "真假样本",
            note: "真实图像和生成图像一起进入判别器。",
            input: "x_real + x_fake",
            compute: "构造判别器训练批次",
            output: "real/fake batch",
            state: "真假样本同时送入 D",
            metrics: "D(real), D(fake)",
            formula: "batch = {x_real, G(z)}",
            summary: "判别器需要同时看真实样本和生成样本，才知道应该分开什么。"
        },
        {
            id: "discriminator",
            label: "Discriminator",
            short: "真假分数",
            note: "Discriminator 判断输入图像是真实还是生成。",
            input: "real/fake images",
            compute: "D(x) → probability(real)",
            output: "Real / Fake Score",
            state: "输出真假概率条",
            metrics: "D(real), D(fake)",
            formula: "D(x) → probability(real)",
            summary: "D(real) 越高说明真实样本越容易被识别；D(fake) 越高说明生成器越能迷惑判别器。"
        },
        {
            id: "loss",
            label: "Loss Battle",
            short: "G vs D",
            note: "G 在骗 D，D 在识别 G。",
            input: "D(real), D(fake)",
            compute: "adversarial objectives",
            output: "G loss + D loss",
            state: "两条 loss 曲线动态博弈",
            metrics: "G loss / D loss",
            formula: "min_G max_D V(D,G)",
            summary: "GAN 训练是动态博弈，不是单一 loss 一路下降。"
        },
        {
            id: "update",
            label: "Update",
            short: "交替优化",
            note: "更新 D 提高识别能力，更新 G 提高欺骗能力。",
            input: "loss gradients",
            compute: "alternating optimization",
            output: "updated G and D",
            state: "Generator / Discriminator 交替更新",
            metrics: "learning stability",
            formula: "D ← ∇L_D, G ← ∇L_G",
            summary: "二者交替优化，不是一次性完成；一方过强会让训练失衡。"
        },
        {
            id: "result",
            label: "Generated Result",
            short: "最终样例",
            note: "观察生成图像、真实性、多样性和模式崩溃风险。",
            input: "updated generator G",
            compute: "G(z_new)",
            output: "Generated Image",
            state: "输出当前阶段的生成样例",
            metrics: "真实性 / 多样性 / 稳定性",
            formula: "x = G(z_new)",
            summary: "最终输出是 Generated Image；评价时要同时看真实感、多样性和训练稳定性。"
        }
    ];

    const PHASES = ["early", "middle", "late"];
    const PHASE_LABEL = { early: "Early", middle: "Middle", late: "Late" };
    const DISPLAY_LABEL = {
        flow: "Network Flow",
        batch: "Real vs Fake",
        loss: "Loss Battle",
        latent: "Latent Interpolation"
    };

    const el = {
        sample: root.querySelector('[data-gan-control="sample"]'),
        latentButtons: root.querySelector("[data-gan-latents]"),
        phaseButtons: Array.from(root.querySelectorAll("[data-gan-phase]")),
        displayButtons: Array.from(root.querySelectorAll("[data-gan-display]")),
        stage: root.querySelector("[data-gan-stage]"),
        pipeline: root.querySelector("[data-gan-pipeline]"),
        stageTitle: root.querySelector("[data-gan-stage-title]"),
        chips: {
            sample: root.querySelector('[data-gan-chip="sample"]'),
            phase: root.querySelector('[data-gan-chip="phase"]'),
            display: root.querySelector('[data-gan-chip="display"]')
        },
        summary: {
            sample: root.querySelector('[data-gan-summary="sample"]'),
            latentDim: root.querySelector('[data-gan-summary="latentDim"]'),
            phase: root.querySelector('[data-gan-summary="phase"]'),
            latent: root.querySelector('[data-gan-summary="latent"]'),
            dReal: root.querySelector('[data-gan-summary="dReal"]'),
            dFake: root.querySelector('[data-gan-summary="dFake"]'),
            gLoss: root.querySelector('[data-gan-summary="gLoss"]'),
            dLoss: root.querySelector('[data-gan-summary="dLoss"]')
        },
        notes: {
            step: root.querySelector('[data-gan-note="step"]'),
            summary: root.querySelector('[data-gan-note="summary"]'),
            input: root.querySelector('[data-gan-note="input"]'),
            compute: root.querySelector('[data-gan-note="compute"]'),
            output: root.querySelector('[data-gan-note="output"]'),
            state: root.querySelector('[data-gan-note="state"]'),
            metrics: root.querySelector('[data-gan-note="metrics"]'),
            formula: root.querySelector('[data-gan-note="formula"]'),
            formulaNote: root.querySelector('[data-gan-note="formulaNote"]')
        }
    };

    const state = {
        data: null,
        sampleId: "",
        latentId: "z1",
        randomLatent: [0.62, 0.38],
        phase: "early",
        display: "flow",
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

    function normalizeStage(rawStage, fallbackStage) {
        const fallback = fallbackStage || DEFAULT_DATA.samples[0].stages.early;
        return {
            dReal: clamp01(numberOr(rawStage?.dReal, fallback.dReal)),
            dFake: clamp01(numberOr(rawStage?.dFake, fallback.dFake)),
            gLoss: Math.max(0, numberOr(rawStage?.gLoss, fallback.gLoss)),
            dLoss: Math.max(0, numberOr(rawStage?.dLoss, fallback.dLoss)),
            fakeQuality: stringOr(rawStage?.fakeQuality, fallback.fakeQuality || "生成样例"),
            description: stringOr(rawStage?.description, fallback.description || "当前使用前端预设数据演示。")
        };
    }

    function normalizeLatentPoints(points, fallbackPoints) {
        const source = Array.isArray(points) && points.length ? points : fallbackPoints;
        return source.slice(0, 4).map((point, index) => {
            const vector = Array.isArray(point?.vector2d) ? point.vector2d : [];
            return {
                id: stringOr(point?.id, `z${index + 1}`),
                vector2d: [clamp01(numberOr(vector[0], 0.24 + index * 0.22)), clamp01(numberOr(vector[1], 0.68 - index * 0.18))],
                label: stringOr(point?.label, `latent-${index + 1}`)
            };
        });
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
                latentDim: Math.max(2, Math.round(numberOr(sample?.latentDim, fallback.latentDim || 100))),
                stages: {
                    early: normalizeStage(sample?.stages?.early, fallback.stages.early),
                    middle: normalizeStage(sample?.stages?.middle, fallback.stages.middle),
                    late: normalizeStage(sample?.stages?.late, fallback.stages.late)
                },
                latentPoints: normalizeLatentPoints(sample?.latentPoints, fallback.latentPoints)
            };
        });
        return {
            defaultSample: stringOr(data?.defaultSample, samplesOut[0]?.id || fallbackSamples[0].id),
            samples: samplesOut
        };
    }

    function pct(value) {
        return `${Math.round(clamp01(value) * 100)}%`;
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

    function currentStage() {
        const sample = currentSample();
        return sample?.stages?.[state.phase] || sample?.stages?.early || DEFAULT_DATA.samples[0].stages.early;
    }

    function latentPoints() {
        const sample = currentSample();
        return Array.isArray(sample?.latentPoints) && sample.latentPoints.length ? sample.latentPoints : DEFAULT_DATA.samples[0].latentPoints;
    }

    function currentLatent() {
        if (state.latentId === "random") {
            return { id: "random", vector2d: state.randomLatent, label: "random" };
        }
        return latentPoints().find((point) => point.id === state.latentId) || latentPoints()[0];
    }

    function displayForStep(stepId) {
        if (stepId === "batch") return "batch";
        if (stepId === "loss") return "loss";
        if (stepId === "result") return "latent";
        return "flow";
    }

    function stepForDisplay(display) {
        return { flow: 0, batch: 3, loss: 5, latent: 7 }[display] ?? 0;
    }

    function stageQuality() {
        return state.phase === "late" ? "late" : (state.phase === "middle" ? "middle" : "early");
    }

    function sceneDetail(sample, index, real) {
        const latent = currentLatent().vector2d || [0.4, 0.5];
        if ((sample.scene || sample.id) === "digit") return String((index + Math.round((latent[0] || 0.2) * 9) + (real ? 2 : 0)) % 10);
        if ((sample.scene || sample.id) === "face") return real ? "real" : "fake";
        if ((sample.scene || sample.id) === "flower") return real ? "real" : "G";
        return real ? "real" : "G";
    }

    function ganArtMarkup(sample, quality, index, real) {
        const latent = real ? [0.46 + index * 0.03, 0.42 + index * 0.02] : currentLatent().vector2d || [0.5, 0.5];
        const scene = sample.scene || sample.id || "digit";
        return `
            <div
                class="gan-art"
                data-scene="${escapeHtml(scene)}"
                data-quality="${escapeHtml(real ? "late" : quality)}"
                style="--latent-x:${clamp01(latent[0])};--latent-y:${clamp01(latent[1])}"
                aria-hidden="true"
            >
                <span class="gan-shape"></span>
                <b class="gan-detail">${escapeHtml(sceneDetail(sample, index, real))}</b>
            </div>
        `;
    }

    function nodeClass(key, activeKeys) {
        return `gan-node gan-node--${key} ${activeKeys.includes(key) ? "is-active" : ""}`;
    }

    function activeNetworkKeys(stepId) {
        const map = {
            noise: ["noise"],
            generator: ["generator"],
            fake: ["fake"],
            batch: ["batch"],
            discriminator: ["discriminator"],
            loss: ["discriminator"],
            update: ["generator", "discriminator"],
            result: ["fake", "generator"]
        };
        return map[stepId] || ["noise"];
    }

    function renderNetwork() {
        const step = state.player.current();
        const sample = currentSample();
        const stage = currentStage();
        const activeKeys = activeNetworkKeys(step.id);
        const arrowActive = (from, to) => activeKeys.includes(from) || activeKeys.includes(to);
        return `
            <section class="gan-flow-panel">
                <div class="gan-panel-heading">
                    <strong>对抗流程主图</strong>
                    <span>Noise z -> G -> Fake -> D -> Score</span>
                </div>
                <div class="gan-network" aria-label="GAN 对抗流程主图">
                    <article class="${nodeClass("noise", activeKeys)}">
                        <span>INPUT</span>
                        <strong>Noise z</strong>
                        <div class="gan-vector-dots"><i></i><i></i><i></i><i></i></div>
                        <small>${escapeHtml(currentLatent().id)} / ${escapeHtml(currentLatent().label)}</small>
                    </article>
                    <div class="gan-arrow ${arrowActive("noise", "generator") ? "is-active" : ""}">-></div>
                    <article class="${nodeClass("generator", activeKeys)}">
                        <span>NETWORK</span>
                        <strong>Generator G</strong>
                        <small>把 z 映射到图像空间</small>
                    </article>
                    <div class="gan-arrow ${arrowActive("generator", "fake") ? "is-active" : ""}">-></div>
                    <article class="${nodeClass("fake", activeKeys)}">
                        <span>OUTPUT</span>
                        <strong>Fake Image</strong>
                        ${ganArtMarkup(sample, stageQuality(), 0, false)}
                    </article>
                    <div class="gan-arrow ${arrowActive("fake", "batch") ? "is-active" : ""}">-></div>
                    <article class="${nodeClass("batch", activeKeys)}">
                        <span>BATCH</span>
                        <strong>Real / Fake</strong>
                        <small>真实图像和生成图像一起进入 D</small>
                    </article>
                    <div class="gan-arrow ${arrowActive("batch", "discriminator") ? "is-active" : ""}">-></div>
                    <article class="${nodeClass("discriminator", activeKeys)}">
                        <span>JUDGE</span>
                        <strong>Discriminator D</strong>
                        <div class="gan-score-bars">
                            <div><span>D(real)</span><i><b style="--score:${pct(stage.dReal)}"></b></i><em>${Number(stage.dReal).toFixed(2)}</em></div>
                            <div><span>D(fake)</span><i><b style="--score:${pct(stage.dFake)}"></b></i><em>${Number(stage.dFake).toFixed(2)}</em></div>
                        </div>
                        <small class="gan-score-disclaimer">预设分数 · 非真实训练</small>
                    </article>
                </div>
                <div class="gan-update-loop" aria-label="GAN loss 回传更新示意">
                    <article>
                        <strong>Update D</strong>
                        <span>用 real / fake batch 提高真假判别能力。</span>
                    </article>
                    <article>
                        <strong>Update G</strong>
                        <span>用 D(fake) 的反馈提高生成欺骗能力。</span>
                    </article>
                </div>
            </section>
        `;
    }

    function renderBatchPanel() {
        const sample = currentSample();
        const quality = stageQuality();
        const realCards = Array.from({ length: 6 }, (_item, index) => `
            <article class="gan-mini-card is-real">
                ${ganArtMarkup(sample, "late", index, true)}
                <strong>Real ${index + 1}</strong>
                <span>真实样本示意</span>
            </article>
        `).join("");
        const fakeCards = Array.from({ length: 6 }, (_item, index) => `
            <article class="gan-mini-card is-fake">
                ${ganArtMarkup(sample, quality, index, false)}
                <strong>Fake ${index + 1}</strong>
                <span>${escapeHtml(currentStage().fakeQuality || "生成样本")}</span>
            </article>
        `).join("");

        return `
            <section class="gan-batch-panel">
                <div class="gan-panel-heading">
                    <strong>Real / Fake 对比区</strong>
                    <span>${escapeHtml(PHASE_LABEL[state.phase])} quality</span>
                </div>
                <div class="gan-batch-grid">
                    <div class="gan-batch-column">
                        <div class="gan-panel-heading"><strong>Real Batch</strong><span>green label</span></div>
                        <div class="gan-mini-grid">${realCards}</div>
                    </div>
                    <div class="gan-batch-column">
                        <div class="gan-panel-heading"><strong>Fake Batch</strong><span>orange label</span></div>
                        <div class="gan-mini-grid">${fakeCards}</div>
                    </div>
                </div>
            </section>
        `;
    }

    function lossPoint(loss, maxLoss, x) {
        const y = 142 - (Math.max(0, Math.min(maxLoss, loss)) / maxLoss) * 102;
        return [x, y];
    }

    function renderLossPanel() {
        const sample = currentSample();
        const stageValues = PHASES.map((phase, index) => ({
            phase,
            x: 46 + index * 122,
            g: Number(sample.stages?.[phase]?.gLoss ?? 1),
            d: Number(sample.stages?.[phase]?.dLoss ?? 1)
        }));
        const maxLoss = Math.max(2.5, ...stageValues.flatMap((item) => [item.g, item.d]));
        const gPoints = stageValues.map((item) => lossPoint(item.g, maxLoss, item.x));
        const dPoints = stageValues.map((item) => lossPoint(item.d, maxLoss, item.x));
        const currentIndex = Math.max(0, PHASES.indexOf(state.phase));
        const gCurrent = gPoints[currentIndex];
        const dCurrent = dPoints[currentIndex];
        return `
            <section class="gan-loss-panel">
                <div class="gan-panel-heading">
                    <strong>Loss Battle 面板</strong>
                    <span>Generator Loss / Discriminator Loss</span>
                </div>
                <div class="gan-loss-tug">
                    <div class="gan-tug-side"><span>Generator Loss</span><strong>${Number(currentStage().gLoss).toFixed(2)}</strong></div>
                    <div class="gan-tug-side"><span>Discriminator Loss</span><strong>${Number(currentStage().dLoss).toFixed(2)}</strong></div>
                </div>
                <div class="gan-loss-chart" aria-label="GAN loss battle 曲线">
                    <svg viewBox="0 0 350 170" role="img" aria-label="Generator loss 与 Discriminator loss 曲线">
                        <line class="gan-grid-line" x1="28" y1="40" x2="330" y2="40"></line>
                        <line class="gan-grid-line" x1="28" y1="91" x2="330" y2="91"></line>
                        <line class="gan-grid-line" x1="28" y1="142" x2="330" y2="142"></line>
                        <polyline class="gan-g-line" points="${gPoints.map((point) => point.join(",")).join(" ")}"></polyline>
                        <polyline class="gan-d-line" points="${dPoints.map((point) => point.join(",")).join(" ")}"></polyline>
                        ${stageValues.map((item, index) => `<text x="${item.x - 18}" y="162" fill="#64748b" font-size="10" font-weight="800">${escapeHtml(PHASE_LABEL[item.phase])}</text>`).join("")}
                        <circle cx="${gCurrent[0]}" cy="${gCurrent[1]}" r="6" stroke="#f97316"></circle>
                        <circle cx="${dCurrent[0]}" cy="${dCurrent[1]}" r="6" stroke="#7c3aed"></circle>
                    </svg>
                </div>
                <p class="gan-loss-caption">GAN 的目标不是让一条 loss 单调下降，而是在 G 与 D 的竞争中逼近更真实的生成分布。</p>
            </section>
        `;
    }

    function renderLatentPanel() {
        const sample = currentSample();
        const points = latentPoints();
        return `
            <section class="gan-latent-panel">
                <div class="gan-panel-heading">
                    <strong>Latent Interpolation</strong>
                    <span>z changes output</span>
                </div>
                <div class="gan-latent-map" aria-label="潜空间二维教学投影">
                    ${points.map((point) => `
                        <button
                            type="button"
                            class="gan-latent-point ${point.id === state.latentId ? "is-active" : ""}"
                            data-gan-latent-point="${escapeHtml(point.id)}"
                            style="--x:${clamp01(point.vector2d?.[0])};--y:${clamp01(point.vector2d?.[1])}"
                        >${escapeHtml(point.id)}</button>
                    `).join("")}
                    <button
                        type="button"
                        class="gan-latent-point ${state.latentId === "random" ? "is-active" : ""}"
                        data-gan-latent-point="random"
                        style="--x:${clamp01(state.randomLatent[0])};--y:${clamp01(state.randomLatent[1])}"
                    >rand</button>
                </div>
            </section>
            <section class="gan-generated-card">
                <strong>Generated Result · ${escapeHtml(currentStage().fakeQuality || "")}</strong>
                ${ganArtMarkup(sample, stageQuality(), 8, false)}
                <p>${escapeHtml(currentStage().description || "当前生成结果由预设样例和前端 fallback 组成。")}</p>
            </section>
        `;
    }

    function renderStage() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载 GAN 预设样例...</div>';
            return;
        }

        el.stage.innerHTML = `
            <div class="gan-stage-layout" data-display="${escapeHtml(state.display)}">
                ${renderNetwork()}
                ${renderBatchPanel()}
                ${renderLossPanel()}
                ${renderLatentPanel()}
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
        const stage = currentStage();
        const latent = currentLatent();

        if (el.sample) {
            el.sample.innerHTML = samples().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("");
            el.sample.value = sample.id;
        }

        if (el.latentButtons) {
            el.latentButtons.innerHTML = [
                ...latentPoints().map((point) => `<button type="button" class="${point.id === state.latentId ? "is-active" : ""}" data-gan-latent="${escapeHtml(point.id)}">${escapeHtml(point.id)}</button>`),
                `<button type="button" class="${state.latentId === "random" ? "is-active" : ""}" data-gan-latent="random">随机采样</button>`
            ].join("");
        }

        el.phaseButtons.forEach((button) => {
            const active = button.dataset.ganPhase === state.phase;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        el.displayButtons.forEach((button) => {
            const active = button.dataset.ganDisplay === state.display;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (el.stageTitle) el.stageTitle.textContent = `${STEPS[state.player.index]?.label || "GAN"} · ${sample.title}`;
        if (el.chips.sample) el.chips.sample.textContent = sample.title;
        if (el.chips.phase) el.chips.phase.textContent = PHASE_LABEL[state.phase] || state.phase;
        if (el.chips.display) el.chips.display.textContent = DISPLAY_LABEL[state.display] || state.display;

        if (el.summary.sample) el.summary.sample.textContent = sample.title;
        if (el.summary.latentDim) el.summary.latentDim.textContent = String(sample.latentDim || 100);
        if (el.summary.phase) el.summary.phase.textContent = PHASE_LABEL[state.phase] || state.phase;
        if (el.summary.latent) el.summary.latent.textContent = `${latent.id} / ${latent.label || "latent"}`;
        if (el.summary.dReal) el.summary.dReal.textContent = Number(stage.dReal).toFixed(2);
        if (el.summary.dFake) el.summary.dFake.textContent = Number(stage.dFake).toFixed(2);
        if (el.summary.gLoss) el.summary.gLoss.textContent = Number(stage.gLoss).toFixed(2);
        if (el.summary.dLoss) el.summary.dLoss.textContent = Number(stage.dLoss).toFixed(2);
    }

    function renderNotes() {
        if (!state.player) return;
        const step = state.player.current();
        const stage = currentStage();
        if (el.notes.step) el.notes.step.textContent = step.label || "";
        if (el.notes.summary) el.notes.summary.textContent = `${step.summary || ""} 当前样例：${currentSample().title}，${stage.description || ""}`;
        if (el.notes.input) el.notes.input.textContent = step.input || "";
        if (el.notes.compute) el.notes.compute.textContent = step.compute || "";
        if (el.notes.output) el.notes.output.textContent = step.output || "";
        if (el.notes.state) el.notes.state.textContent = step.state || "";
        if (el.notes.metrics) el.notes.metrics.textContent = step.metrics || "";
        if (el.notes.formula) el.notes.formula.textContent = step.formula || "";
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = `当前 D(real)=${Number(stage.dReal).toFixed(2)}，D(fake)=${Number(stage.dFake).toFixed(2)}。本页为机制拆解与预设样例演示，不是真实 GAN 训练。`;
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
        state.latentId = latentPoints()[0]?.id || "z1";
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

        el.latentButtons?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-gan-latent]");
            if (!button) return;
            state.latentId = button.dataset.ganLatent || "z1";
            if (state.latentId === "random") {
                state.randomLatent = [Math.random() * 0.78 + 0.1, Math.random() * 0.78 + 0.1];
            }
            renderAll();
        });

        root.addEventListener("click", (event) => {
            const latentPoint = event.target.closest("[data-gan-latent-point]");
            if (latentPoint) {
                state.latentId = latentPoint.dataset.ganLatentPoint || "z1";
                if (state.latentId === "random") {
                    state.randomLatent = [Math.random() * 0.78 + 0.1, Math.random() * 0.78 + 0.1];
                }
                renderAll();
                return;
            }

            const phase = event.target.closest("[data-gan-phase]");
            if (phase) {
                state.phase = PHASES.includes(phase.dataset.ganPhase) ? phase.dataset.ganPhase : "early";
                renderAll();
                return;
            }

            const display = event.target.closest("[data-gan-display]");
            if (display) {
                state.display = display.dataset.ganDisplay || "flow";
                state.player.setStep(stepForDisplay(state.display));
            }
        });
    }

    function initWithData(data) {
        state.data = normalizeData(data);
        state.sampleId = state.data.defaultSample || samples()[0]?.id || "digit";
        state.latentId = latentPoints()[0]?.id || "z1";
        renderAll();
    }

    function init() {
        state.player = new window.FrontierPlayer(root, {
            onStepChange: function (_index, step) {
                state.display = displayForStep(step.id);
                renderAll();
            }
        });
        state.player.setSteps(STEPS);
        bindEvents();

        fetchJson(root.dataset.samplesUrl)
            .then(initWithData)
            .catch((error) => {
                console.warn("GAN 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
