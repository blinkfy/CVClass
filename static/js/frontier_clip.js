(function () {
    const root = document.querySelector("[data-clip-lab]");
    if (!root || !window.FrontierPlayer) return;

    const TRANSFORMERS_JS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
    const REAL_CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
    const REAL_CLIP_LOAD_TIMEOUT_MS = 120000;
    const REAL_CLIP_INFERENCE_TIMEOUT_MS = 45000;
    let realClipPipelinePromise = null;

    const DEFAULT_DATA = {
        embeddingDim: 512,
        defaultSample: "dog",
        promptTemplates: [
            "a photo of a {label}",
            "an image of {label}",
            "a close-up photo of {label}",
            "a visual scene containing {label}",
        ],
        samples: [
            { id: "dog", label: "dog", title: "草地上的狗", scene: "animal", text: "a photo of a dog", position: [24, 66], summary: "动物主体和草地背景更接近 dog prompt。" },
            { id: "street", label: "street", title: "街道与车辆", scene: "street", text: "a photo of a street", position: [43, 38], summary: "道路、车辆和建筑使图像靠近 street prompt。" },
            { id: "flower", label: "flower", title: "花朵近景", scene: "flower", text: "a photo of a flower", position: [67, 72], summary: "主体颜色和近景形态使图像靠近 flower prompt。" },
            { id: "classroom", label: "classroom", title: "教室场景", scene: "classroom", text: "a classroom scene", position: [75, 30], summary: "桌椅、黑板和室内结构使图像靠近 classroom prompt。" },
            { id: "food", label: "food", title: "餐盘食物", scene: "food", text: "a plate of food", position: [34, 24], summary: "盘子和食物区域使图像靠近 food prompt。" },
        ],
    };

    const STEPS = [
        {
            id: "input",
            label: "Image/Text Input",
            short: "图像 + prompt",
            note: "图像卡与文本 prompt 卡作为双塔编码器输入。",
            input: "5 images + 5 text prompts",
            middle: "raw image cards / prompt strings",
            compute: "构造图像批次和文本批次",
            output: "image batch, text batch",
            summary: "CLIP 的输入不是固定分类头，而是一组图像和一组候选文本。",
        },
        {
            id: "encoder",
            label: "Dual Encoder",
            short: "图像塔 / 文本塔",
            note: "图像进入 Image Encoder，文本进入 Text Encoder。",
            input: "image batch, text batch",
            middle: "Image Encoder + Text Encoder",
            compute: "encoder(image), encoder(text)",
            output: "image vectors + text vectors",
            summary: "双塔结构让图像和文本可以分别编码，再在同一向量空间比较。",
        },
        {
            id: "space",
            label: "Embedding Space",
            short: "共享语义空间",
            note: "匹配的图文点靠近，不匹配的点远离。",
            input: "normalized image / text embeddings",
            middle: "2D projected semantic space",
            compute: "normalize + projection for visualization",
            output: "aligned image/text points",
            summary: "二维散点是教学投影；相似度矩阵使用 512 维预设向量真实计算。",
        },
        {
            id: "matrix",
            label: "Similarity Matrix",
            short: "image × text",
            note: "点击矩阵 cell 可同步高亮对应图像、文本和 cosine similarity。",
            input: "image embeddings I, text embeddings T",
            middle: "I × T score matrix",
            compute: "sim(i,t)= i·t / (||i|| ||t||)",
            output: "cosine similarity matrix",
            summary: "对角线高表示正确图文配对相似度更高；非对角线是负样本对比。",
        },
        {
            id: "contrast",
            label: "Contrastive Alignment",
            short: "正样本靠近",
            note: "正确匹配对角线发光，错误匹配淡化。",
            input: "positive pairs + negative pairs",
            middle: "diagonal positives, off-diagonal negatives",
            compute: "拉近正样本、推远负样本",
            output: "aligned semantic neighborhoods",
            summary: "对比学习的目标是让匹配图文对分数高于其它候选文本。",
        },
        {
            id: "zeroshot",
            label: "Zero-shot Output",
            short: "Top-k label",
            note: "为一张图像构造多个 prompt，计算相似度并输出 Top-k。",
            input: "one image + candidate text prompts",
            middle: "cosine scores over text labels",
            compute: "sort(sim(image, prompt_k))",
            output: "Top-1 / Top-2 / Top-3",
            summary: "zero-shot 分类本质上是图像与开放文本标签之间的相似度排序。",
        },
    ];

    const el = {
        sample: root.querySelector('[data-clip-control="sample"]'),
        template: root.querySelector('[data-clip-control="template"]'),
        displayButtons: Array.from(root.querySelectorAll("[data-clip-display]")),
        stage: root.querySelector("[data-clip-stage]"),
        pipeline: root.querySelector("[data-clip-pipeline]"),
        stageTitle: root.querySelector("[data-clip-stage-title]"),
        topList: root.querySelector("[data-clip-top-list]"),
        chips: {
            sample: root.querySelector('[data-clip-chip="sample"]'),
            mode: root.querySelector('[data-clip-chip="mode"]'),
            pair: root.querySelector('[data-clip-chip="pair"]'),
        },
        summary: {
            imageCount: root.querySelector('[data-clip-summary="imageCount"]'),
            textCount: root.querySelector('[data-clip-summary="textCount"]'),
            dim: root.querySelector('[data-clip-summary="dim"]'),
            compute: root.querySelector('[data-clip-summary="compute"]'),
            top1: root.querySelector('[data-clip-summary="top1"]'),
        },
        notes: {
            step: root.querySelector('[data-clip-note="step"]'),
            summary: root.querySelector('[data-clip-note="summary"]'),
            input: root.querySelector('[data-clip-note="input"]'),
            middle: root.querySelector('[data-clip-note="middle"]'),
            compute: root.querySelector('[data-clip-note="compute"]'),
            output: root.querySelector('[data-clip-note="output"]'),
            vit: root.querySelector('[data-clip-note="vit"]'),
            vlm: root.querySelector('[data-clip-note="vlm"]'),
            formula: root.querySelector('[data-clip-note="formula"]'),
            formulaNote: root.querySelector('[data-clip-note="formulaNote"]'),
        },
        realModel: {
            load: root.querySelector('[data-clip-real="load"]'),
            run: root.querySelector('[data-clip-real="run"]'),
            message: root.querySelector('[data-clip-real="message"]'),
            preview: root.querySelector("[data-clip-real-preview]"),
            results: root.querySelector("[data-clip-real-results]"),
        },
    };

    const state = {
        data: null,
        sampleId: "",
        template: "",
        display: "space",
        matrixImageId: "",
        matrixTextId: "",
        player: null,
        vectorCache: new Map(),
        realModel: {
            phase: "idle",
            message: "",
            output: [],
            sampleId: "",
            sampleTitle: "",
            previewCache: new Map(),
        },
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

    function currentSample() {
        return samples().find((item) => item.id === state.sampleId) || samples()[0];
    }

    function sampleById(id) {
        return samples().find((item) => item.id === id) || samples()[0];
    }

    function templateList() {
        return state.data?.promptTemplates?.length ? state.data.promptTemplates : DEFAULT_DATA.promptTemplates;
    }

    function promptFor(sample) {
        if (state.template === templateList()[0] && sample.text) return sample.text;
        return String(state.template || templateList()[0]).replace("{label}", sample.label);
    }

    function realClipCandidates() {
        return samples().map((item) => ({
            label: item.label,
            prompt: promptFor(item),
        }));
    }

    function withTimeout(promise, ms, message) {
        let timeoutId;
        const timeout = new Promise((_resolve, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
    }

    function displayForStep(stepId) {
        if (stepId === "matrix") return "matrix";
        if (stepId === "zeroshot") return "ranking";
        if (stepId === "contrast") return "pairs";
        return "space";
    }

    function stepForDisplay(display) {
        return { space: 2, matrix: 3, ranking: 5, pairs: 4 }[display] ?? 2;
    }

    function displayLabel() {
        return {
            space: "Embedding Space",
            matrix: "Similarity Matrix",
            ranking: "Zero-shot Ranking",
            pairs: "Contrastive Pairs",
        }[state.display] || "Embedding Space";
    }

    function hashString(value) {
        let hash = 2166136261;
        const text = String(value);
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function randomUnit(seed, index) {
        const x = Math.sin((seed + index * 1013) * 0.00123) * 43758.5453;
        return (x - Math.floor(x)) * 2 - 1;
    }

    function normalize(vector) {
        const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
        return vector.map((value) => value / norm);
    }

    function baseVector(label) {
        const key = `base:${label}`;
        if (state.vectorCache.has(key)) return state.vectorCache.get(key);
        const seed = hashString(`semantic:${label}`);
        const vector = Array.from({ length: state.data?.embeddingDim || DEFAULT_DATA.embeddingDim }, (_item, index) => {
            const anchor = index % samples().length === samples().findIndex((sample) => sample.label === label) ? 2.2 : 0;
            return anchor + randomUnit(seed, index) * 0.42 + Math.cos(index * 0.071 + seed) * 0.08;
        });
        const normalized = normalize(vector);
        state.vectorCache.set(key, normalized);
        return normalized;
    }

    function noiseVector(key, strength) {
        const seed = hashString(key);
        return Array.from({ length: state.data?.embeddingDim || DEFAULT_DATA.embeddingDim }, (_item, index) => randomUnit(seed, index) * strength);
    }

    function mixedVector(base, noise) {
        return normalize(base.map((value, index) => value + (noise[index] || 0)));
    }

    function imageEmbedding(sample) {
        const key = `image:${sample.id}`;
        if (state.vectorCache.has(key)) return state.vectorCache.get(key);
        const vector = mixedVector(baseVector(sample.label), noiseVector(`image:${sample.id}:${sample.scene}`, 0.08));
        state.vectorCache.set(key, vector);
        return vector;
    }

    function textEmbedding(sample) {
        const key = `text:${sample.id}:${state.template}`;
        if (state.vectorCache.has(key)) return state.vectorCache.get(key);
        const templateNoise = state.template === templateList()[0] ? 0.05 : 0.075;
        const vector = mixedVector(baseVector(sample.label), noiseVector(`text:${promptFor(sample)}`, templateNoise));
        state.vectorCache.set(key, vector);
        return vector;
    }

    function cosine(a, b) {
        const len = Math.min(a.length, b.length);
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let index = 0; index < len; index += 1) {
            dot += a[index] * b[index];
            na += a[index] * a[index];
            nb += b[index] * b[index];
        }
        return dot / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
    }

    function matrix() {
        const rows = samples();
        return rows.map((imageSample) => rows.map((textSample) => ({
            image: imageSample,
            text: textSample,
            score: cosine(imageEmbedding(imageSample), textEmbedding(textSample)),
        })));
    }

    function selectedCell() {
        const rows = matrix().flat();
        return rows.find((cell) => cell.image.id === state.matrixImageId && cell.text.id === state.matrixTextId) || rows[0];
    }

    function ranking(sample = currentSample()) {
        return samples()
            .map((textSample) => ({
                label: textSample.label,
                prompt: promptFor(textSample),
                score: cosine(imageEmbedding(sample), textEmbedding(textSample)),
            }))
            .sort((a, b) => b.score - a.score);
    }

    function pct(score) {
        return Math.round(Math.max(0, Math.min(1, (score + 1) / 2)) * 100);
    }

    function drawRoundRect(ctx, x, y, width, height, radius) {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + safeRadius, y);
        ctx.lineTo(x + width - safeRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        ctx.lineTo(x + width, y + height - safeRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        ctx.lineTo(x + safeRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        ctx.lineTo(x, y + safeRadius);
        ctx.quadraticCurveTo(x, y, x + safeRadius, y);
        ctx.closePath();
    }

    function drawSceneBackground(ctx, top = "#dbeafe", bottom = "#dcfce7") {
        const gradient = ctx.createLinearGradient(0, 0, 0, 224);
        gradient.addColorStop(0, top);
        gradient.addColorStop(0.58, top);
        gradient.addColorStop(0.59, bottom);
        gradient.addColorStop(1, bottom);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 224, 224);
    }

    function drawSampleImage(sample) {
        const key = `preview:${sample?.id || "default"}`;
        if (state.realModel.previewCache.has(key)) return state.realModel.previewCache.get(key);
        const canvas = document.createElement("canvas");
        canvas.width = 224;
        canvas.height = 224;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";

        const scene = sample?.scene || sample?.id || "animal";
        drawSceneBackground(ctx);

        if (scene === "street") {
            drawSceneBackground(ctx, "#dbeafe", "#cbd5e1");
            ctx.fillStyle = "#94a3b8";
            ctx.fillRect(0, 126, 224, 98);
            ctx.fillStyle = "#475569";
            ctx.beginPath();
            ctx.moveTo(92, 126);
            ctx.lineTo(132, 126);
            ctx.lineTo(174, 224);
            ctx.lineTo(48, 224);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#f8fafc";
            ctx.lineWidth = 4;
            ctx.setLineDash([14, 12]);
            ctx.beginPath();
            ctx.moveTo(112, 136);
            ctx.lineTo(112, 224);
            ctx.stroke();
            ctx.setLineDash([]);
            ["#bfdbfe", "#93c5fd", "#bae6fd"].forEach((color, index) => {
                ctx.fillStyle = color;
                ctx.fillRect(18 + index * 62, 58 - index * 10, 38, 70 + index * 6);
                ctx.fillStyle = "#ffffff";
                for (let y = 68 - index * 10; y < 120; y += 16) {
                    ctx.fillRect(26 + index * 62, y, 8, 8);
                    ctx.fillRect(40 + index * 62, y, 8, 8);
                }
            });
            ctx.fillStyle = "#2563eb";
            drawRoundRect(ctx, 132, 150, 46, 22, 8);
            ctx.fill();
            ctx.fillStyle = "#0f172a";
            ctx.beginPath();
            ctx.arc(144, 174, 6, 0, Math.PI * 2);
            ctx.arc(166, 174, 6, 0, Math.PI * 2);
            ctx.fill();
        } else if (scene === "flower") {
            drawSceneBackground(ctx, "#dbeafe", "#bbf7d0");
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(112, 176);
            ctx.quadraticCurveTo(104, 136, 114, 105);
            ctx.stroke();
            ctx.fillStyle = "#22c55e";
            ctx.beginPath();
            ctx.ellipse(92, 145, 20, 9, -0.4, 0, Math.PI * 2);
            ctx.ellipse(132, 151, 22, 9, 0.45, 0, Math.PI * 2);
            ctx.fill();
            ["#fb7185", "#f472b6", "#fb7185", "#f472b6", "#fb7185", "#f472b6"].forEach((color, index) => {
                const angle = (Math.PI * 2 * index) / 6;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.ellipse(112 + Math.cos(angle) * 27, 88 + Math.sin(angle) * 24, 18, 27, angle, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.fillStyle = "#facc15";
            ctx.beginPath();
            ctx.arc(112, 88, 18, 0, Math.PI * 2);
            ctx.fill();
        } else if (scene === "classroom") {
            drawSceneBackground(ctx, "#e0f2fe", "#e2e8f0");
            ctx.fillStyle = "#dbeafe";
            ctx.fillRect(0, 0, 224, 138);
            ctx.fillStyle = "#0f766e";
            drawRoundRect(ctx, 44, 44, 136, 62, 8);
            ctx.fill();
            ctx.strokeStyle = "#f8fafc";
            ctx.lineWidth = 4;
            ctx.strokeRect(52, 52, 120, 46);
            ctx.fillStyle = "#c084fc";
            ctx.fillRect(0, 138, 224, 86);
            ctx.fillStyle = "#f59e0b";
            [34, 93, 152].forEach((x) => {
                drawRoundRect(ctx, x, 148, 40, 24, 6);
                ctx.fill();
                ctx.fillRect(x + 6, 172, 6, 28);
                ctx.fillRect(x + 28, 172, 6, 28);
            });
        } else if (scene === "food") {
            const table = ctx.createLinearGradient(0, 0, 224, 224);
            table.addColorStop(0, "#f8fafc");
            table.addColorStop(1, "#cbd5e1");
            ctx.fillStyle = table;
            ctx.fillRect(0, 0, 224, 224);
            ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
            ctx.lineWidth = 2;
            for (let x = 0; x <= 224; x += 28) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, 224);
                ctx.stroke();
            }
            for (let y = 0; y <= 224; y += 28) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(224, y);
                ctx.stroke();
            }
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(112, 112, 72, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#94a3b8";
            ctx.lineWidth = 10;
            ctx.stroke();
            [
                ["#ef4444", 86, 94, 20],
                ["#22c55e", 132, 91, 19],
                ["#f59e0b", 109, 132, 23],
                ["#fde68a", 139, 130, 16],
            ].forEach(([color, x, y, radius]) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            });
        } else {
            drawSceneBackground(ctx, "#dbeafe", "#86efac");
            ctx.fillStyle = "#65a30d";
            ctx.fillRect(0, 142, 224, 82);
            ctx.fillStyle = "#a16207";
            drawRoundRect(ctx, 70, 116, 86, 42, 20);
            ctx.fill();
            ctx.fillStyle = "#92400e";
            ctx.beginPath();
            ctx.arc(151, 105, 29, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#78350f";
            ctx.beginPath();
            ctx.moveTo(132, 84);
            ctx.lineTo(143, 62);
            ctx.lineTo(154, 86);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(162, 84);
            ctx.lineTo(178, 66);
            ctx.lineTo(176, 92);
            ctx.fill();
            ctx.strokeStyle = "#78350f";
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(72, 126);
            ctx.quadraticCurveTo(50, 112, 43, 88);
            ctx.stroke();
            ctx.fillStyle = "#111827";
            ctx.beginPath();
            ctx.arc(158, 101, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(86, 154, 8, 30);
            ctx.fillRect(126, 154, 8, 30);
        }

        const dataUrl = canvas.toDataURL("image/png");
        state.realModel.previewCache.set(key, dataUrl);
        return dataUrl;
    }

    function sceneMarkup(sample) {
        return `
            <div class="frontier-sample-scene" data-scene="${escapeHtml(sample.scene || sample.id)}" aria-hidden="true">
                <span class="f-scene-sky"></span>
                <span class="f-scene-building f-scene-building--left"></span>
                <span class="f-scene-building f-scene-building--right"></span>
                <span class="f-scene-ground"></span>
                <span class="f-scene-subject"></span>
            </div>
        `;
    }

    function imageCardsMarkup() {
        return `
            <div class="clip-card-stack clip-image-stack">
                ${samples().map((sample, index) => {
                    const active = sample.id === currentSample().id || sample.id === state.matrixImageId;
                    return `
                        <button type="button" class="clip-input-card ${active ? "is-active" : ""}" data-clip-image="${escapeHtml(sample.id)}" style="--clip-delay:${index * 55}ms">
                            <span class="clip-thumb">${sceneMarkup(sample)}</span>
                            <strong>${escapeHtml(sample.title)}</strong>
                            <small>Image Encoder input</small>
                        </button>
                    `;
                }).join("")}
            </div>
        `;
    }

    function promptCardsMarkup() {
        return `
            <div class="clip-card-stack clip-text-stack">
                ${samples().map((sample, index) => {
                    const active = sample.id === state.matrixTextId;
                    return `
                        <button type="button" class="clip-prompt-card ${active ? "is-active" : ""}" data-clip-text="${escapeHtml(sample.id)}" style="--clip-delay:${index * 55}ms">
                            <span>T${index + 1}</span>
                            <strong>${escapeHtml(promptFor(sample))}</strong>
                            <small>Text Encoder input</small>
                        </button>
                    `;
                }).join("")}
            </div>
        `;
    }

    function encoderMarkup() {
        return `
            <div class="clip-dual-encoder">
                <div class="clip-flow-column">
                    <strong>Image Encoder</strong>
                    <span>ViT / ResNet image tower</span>
                    <i class="clip-vector-bar"></i>
                    <code>i ∈ R^512</code>
                </div>
                <div class="clip-shared-space-badge">shared semantic space</div>
                <div class="clip-flow-column">
                    <strong>Text Encoder</strong>
                    <span>Transformer text tower</span>
                    <i class="clip-vector-bar clip-vector-bar--text"></i>
                    <code>t ∈ R^512</code>
                </div>
            </div>
        `;
    }

    function embeddingSpaceMarkup() {
        return `
            <div class="clip-space" aria-label="二维语义空间投影">
                <span class="clip-axis clip-axis--x"></span>
                <span class="clip-axis clip-axis--y"></span>
                ${samples().map((sample, index) => {
                    const x = sample.position?.[0] ?? 50;
                    const y = sample.position?.[1] ?? 50;
                    const textX = Math.max(8, Math.min(92, x + (index % 2 ? 5 : -5)));
                    const textY = Math.max(8, Math.min(92, y + (index % 2 ? -4 : 5)));
                    const active = sample.id === currentSample().id || sample.id === state.matrixImageId || sample.id === state.matrixTextId;
                    return `
                        <span class="clip-space-line ${active ? "is-active" : ""}" style="--x1:${x}%;--y1:${y}%;--x2:${textX}%;--y2:${textY}%;--clip-delay:${index * 75}ms"></span>
                        <button type="button" class="clip-point clip-point--image ${active ? "is-active" : ""}" data-clip-image="${escapeHtml(sample.id)}" style="--x:${x}%;--y:${y}%;--clip-delay:${index * 75}ms">I:${escapeHtml(sample.label)}</button>
                        <button type="button" class="clip-point clip-point--text ${active ? "is-active" : ""}" data-clip-text="${escapeHtml(sample.id)}" style="--x:${textX}%;--y:${textY}%;--clip-delay:${index * 75 + 40}ms">T:${escapeHtml(sample.label)}</button>
                    `;
                }).join("")}
            </div>
        `;
    }

    function matrixMarkup() {
        const rows = matrix();
        return `
            <div class="clip-matrix-wrap">
                <div class="clip-matrix-labels clip-matrix-labels--top">
                    <span></span>${samples().map((sample) => `<strong>${escapeHtml(sample.label)}</strong>`).join("")}
                </div>
                <div class="clip-matrix-grid" style="--clip-cols:${samples().length + 1}">
                    ${rows.map((row) => `
                        <strong class="clip-row-label">${escapeHtml(row[0].image.label)}</strong>
                        ${row.map((cell) => {
                            const isPositive = cell.image.id === cell.text.id;
                            const isSelected = cell.image.id === state.matrixImageId && cell.text.id === state.matrixTextId;
                            return `
                                <button
                                    type="button"
                                    class="clip-matrix-cell ${isPositive ? "is-positive" : ""} ${isSelected ? "is-selected" : ""}"
                                    data-clip-matrix-image="${escapeHtml(cell.image.id)}"
                                    data-clip-matrix-text="${escapeHtml(cell.text.id)}"
                                    style="--score:${pct(cell.score)}%"
                                    aria-label="${escapeHtml(cell.image.label)} to ${escapeHtml(cell.text.label)} similarity ${cell.score.toFixed(3)}"
                                >${cell.score.toFixed(2)}</button>
                            `;
                        }).join("")}
                    `).join("")}
                </div>
            </div>
        `;
    }

    function contrastMarkup() {
        const rows = matrix();
        return `
            <div class="clip-contrast-grid">
                ${samples().map((sample, index) => {
                    const positive = rows[index][index].score;
                    const hardestNegative = rows[index]
                        .filter((cell) => cell.text.id !== sample.id)
                        .sort((a, b) => b.score - a.score)[0];
                    return `
                        <article class="clip-pair-card" style="--clip-delay:${index * 70}ms">
                            <span>positive</span>
                            <strong>${escapeHtml(sample.label)} ↔ ${escapeHtml(promptFor(sample))}</strong>
                            <i><b style="width:${pct(positive)}%"></b></i>
                            <small>hard negative: ${escapeHtml(hardestNegative.text.label)} · ${hardestNegative.score.toFixed(2)}</small>
                        </article>
                    `;
                }).join("")}
            </div>
        `;
    }

    function rankingMarkup() {
        const ranks = ranking().slice(0, 3);
        return `
            <div class="clip-ranking-panel">
                <div class="clip-ranking-image">
                    <div class="frontier-sample-frame" data-caption="${escapeHtml(currentSample().title)} · zero-shot input">
                        ${sceneMarkup(currentSample())}
                    </div>
                </div>
                <div class="clip-ranking-list">
                    ${ranks.map((item, index) => `
                        <article class="clip-rank-row ${index === 0 ? "is-top" : ""}" style="--rank-width:${pct(item.score)}%;--clip-delay:${index * 120}ms">
                            <span>Top-${index + 1}</span>
                            <strong>${escapeHtml(item.label)}</strong>
                            <i><b></b></i>
                            <em>${item.score.toFixed(3)}</em>
                            <small>${escapeHtml(item.prompt)}</small>
                        </article>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function realModelDefaultMessage() {
        if (state.realModel.phase === "ready") return "模型已加载，可对当前图像运行真实 zero-shot 分类。";
        if (state.realModel.phase === "loading") return "正在加载 Transformers.js 与 CLIP ONNX 权重，首次运行通常较慢。";
        if (state.realModel.phase === "running") return "正在把当前 canvas 图像交给真实 CLIP 模型，并与候选英文标签比较。";
        if (state.realModel.phase === "success") {
            return `真实 CLIP 已完成 ${state.realModel.sampleTitle || currentSample().title} 的 zero-shot 分类。`;
        }
        if (state.realModel.phase === "error") return state.realModel.message || "真实模型加载或推理失败，已保留预设向量演示。";
        return "点击加载后，浏览器按需下载 ONNX 权重；首轮可能超过 150 MB，失败时保留上方预设向量演示。";
    }

    function renderRealModel() {
        const panel = el.realModel;
        if (!panel.message && !panel.load && !panel.run && !panel.results) return;

        const phase = state.realModel.phase;
        if (panel.preview) {
            const previewUrl = drawSampleImage(currentSample());
            if (previewUrl && panel.preview.getAttribute("src") !== previewUrl) {
                panel.preview.setAttribute("src", previewUrl);
            }
            panel.preview.alt = `${currentSample().title} 的真实 CLIP 输入图像`;
        }

        if (panel.message) {
            panel.message.textContent = realModelDefaultMessage();
            panel.message.dataset.phase = phase;
        }

        if (panel.load) {
            panel.load.disabled = phase === "loading" || phase === "running" || phase === "ready" || phase === "success";
            panel.load.textContent = phase === "loading" ? "加载中" : (phase === "ready" || phase === "success" ? "模型已加载" : "加载模型");
        }

        if (panel.run) {
            panel.run.disabled = phase === "loading" || phase === "running";
            panel.run.textContent = phase === "running" ? "推理中" : "运行当前图像";
        }

        if (panel.results) {
            if (!state.realModel.output.length) {
                panel.results.innerHTML = '<li class="is-empty">真实模型结果会显示在这里。</li>';
            } else {
                panel.results.innerHTML = state.realModel.output.slice(0, 3).map((item, index) => {
                    const score = Math.max(0, Math.min(1, Number(item.score) || 0));
                    return `
                        <li class="${index === 0 ? "is-top" : ""}">
                            <span>Top-${index + 1}</span>
                            <i><b style="width:${Math.round(score * 100)}%"></b></i>
                            <strong>${escapeHtml(item.label)} ${(score * 100).toFixed(1)}%</strong>
                            ${item.prompt ? `<small>${escapeHtml(item.prompt)}</small>` : ""}
                        </li>
                    `;
                }).join("");
            }
        }
    }

    function resetRealModelOutputForSampleChange() {
        if (state.realModel.phase === "success") {
            state.realModel.phase = "ready";
            state.realModel.message = "";
        }
        state.realModel.output = [];
        state.realModel.sampleId = "";
        state.realModel.sampleTitle = "";
    }

    function setRealModelFailure(error) {
        console.warn("真实 CLIP 模型运行失败。", error);
        realClipPipelinePromise = null;
        state.realModel.phase = "error";
        state.realModel.output = [];
        state.realModel.message = `真实模型暂不可用：${error?.message || "未知错误"}。`;
        renderRealModel();
    }

    async function loadRealClipModel() {
        if (!realClipPipelinePromise) {
            state.realModel.phase = "loading";
            state.realModel.message = "";
            renderRealModel();
            realClipPipelinePromise = import(TRANSFORMERS_JS_URL)
                .then(async (module) => {
                    const { pipeline, env } = module;
                    if (!pipeline) throw new Error("Transformers.js pipeline API 不可用");
                    if (env) {
                        env.allowLocalModels = false;
                        env.useBrowserCache = true;
                        if (env.backends?.onnx?.wasm) {
                            env.backends.onnx.wasm.numThreads = 1;
                        }
                    }
                    return withTimeout(
                        pipeline("zero-shot-image-classification", REAL_CLIP_MODEL_ID),
                        REAL_CLIP_LOAD_TIMEOUT_MS,
                        "模型加载超过 120 秒，请检查网络或稍后重试"
                    );
                })
                .catch((error) => {
                    realClipPipelinePromise = null;
                    throw error;
                });
        }

        const classifier = await realClipPipelinePromise;
        state.realModel.phase = "ready";
        state.realModel.message = "";
        renderRealModel();
        return classifier;
    }

    async function runRealClipModel() {
        const sample = currentSample();
        try {
            const classifier = await loadRealClipModel();
            state.realModel.phase = "running";
            state.realModel.output = [];
            state.realModel.sampleId = sample.id;
            state.realModel.sampleTitle = sample.title;
            renderRealModel();

            const imageUrl = drawSampleImage(sample);
            if (!imageUrl) throw new Error("无法生成当前图像输入");
            const candidates = realClipCandidates();
            const output = await withTimeout(
                classifier(imageUrl, candidates.map((item) => item.prompt)),
                REAL_CLIP_INFERENCE_TIMEOUT_MS,
                "模型推理超过 45 秒，请检查浏览器性能或稍后重试"
            );
            state.realModel.output = Array.isArray(output)
                ? output.map((item) => {
                    const match = candidates.find((candidate) => candidate.prompt === item.label);
                    return {
                        label: match?.label || item.label,
                        prompt: match?.prompt || item.label,
                        score: item.score,
                    };
                }).sort((a, b) => b.score - a.score)
                : [];
            state.realModel.phase = "success";
            state.realModel.message = "";
            state.player.setStep(5);
            renderRealModel();
        } catch (error) {
            setRealModelFailure(error);
        }
    }

    function archNodeClass(nodeKey, activeKeys, completeKeys) {
        return `${activeKeys.includes(nodeKey) ? "is-active" : ""} ${completeKeys.includes(nodeKey) ? "is-complete" : ""}`;
    }

    function architectureMarkup(stepId) {
        const flowOrder = ["input", "encoder", "space", "matrix", "output"];
        const activeMap = {
            input: ["input"],
            encoder: ["encoder"],
            space: ["space"],
            matrix: ["matrix"],
            contrast: ["matrix"],
            zeroshot: ["output"],
        };
        const activeKeys = activeMap[stepId] || ["input"];
        const activeIndex = flowOrder.findIndex((key) => activeKeys.includes(key));
        const completeKeys = activeIndex > 0 ? flowOrder.slice(0, activeIndex) : [];
        const laneNodes = [
            {
                label: "Image tower",
                nodes: [
                    ["input", "图像输入", "Image", "图像 batch"],
                    ["encoder", "Image Encoder", "ViT / ResNet", "输出 image vector"],
                    ["space", "共享空间", "Embedding", "归一化图像向量"],
                ],
            },
            {
                label: "Text tower",
                nodes: [
                    ["input", "文本输入", "Text", "prompt batch"],
                    ["encoder", "Text Encoder", "Transformer", "输出 text vector"],
                    ["space", "共享空间", "Embedding", "归一化文本向量"],
                ],
            },
        ];
        return `
            <div class="model-arch-graph" aria-label="CLIP 双塔网络架构图">
                <div class="model-arch-lanes">
                    ${laneNodes.map((lane) => `
                        <span class="model-arch-lane-label">${escapeHtml(lane.label)}</span>
                        <div class="model-arch-lane" style="--arch-cols:${lane.nodes.length}">
                            ${lane.nodes.map((node) => `
                                <article class="model-arch-node ${archNodeClass(node[0], activeKeys, completeKeys)}">
                                    <span>${escapeHtml(node[2])}</span>
                                    <strong>${escapeHtml(node[1])}</strong>
                                    <small>${escapeHtml(node[3])}</small>
                                </article>
                            `).join("")}
                        </div>
                    `).join("")}
                </div>
                <div class="model-arch-flow" style="--arch-cols:2">
                    ${[
                        ["matrix", "相似度矩阵", "Similarity", "image × text cosine"],
                        ["output", "Zero-shot 输出", "Top-k", "按文本标签排序"],
                    ].map((node) => `
                        <article class="model-arch-node ${archNodeClass(node[0], activeKeys, completeKeys)}">
                            <span>${escapeHtml(node[2])}</span>
                            <strong>${escapeHtml(node[1])}</strong>
                            <small>${escapeHtml(node[3])}</small>
                        </article>
                    `).join("")}
                </div>
                <div class="model-arch-caption">
                    <span>结构重点</span>
                    <strong>双塔编码后只在向量空间比较</strong>
                </div>
            </div>
        `;
    }

    function renderStage() {
        const step = state.player.current();
        const cell = selectedCell();
        el.stage.innerHTML = `
            <div class="clip-stage-layout" data-step="${escapeHtml(step.id || "input")}" data-display="${escapeHtml(state.display)}">
                <section class="frontier-stage-card frontier-architecture-card clip-architecture-panel">
                    <div class="frontier-section-headline">
                        <strong>CLIP 网络架构图</strong>
                        <span>Image Encoder + Text Encoder → Similarity</span>
                    </div>
                    ${architectureMarkup(step.id || "input")}
                </section>
                <section class="frontier-stage-card clip-input-panel">
                    <div class="frontier-section-headline">
                        <strong>Image/Text Input</strong>
                        <span>5 images + 5 prompts</span>
                    </div>
                    <div class="clip-input-grid">
                        ${imageCardsMarkup()}
                        <div class="clip-input-arrow">dual tower</div>
                        ${promptCardsMarkup()}
                    </div>
                </section>

                <section class="frontier-stage-card clip-encoder-panel">
                    <div class="frontier-section-headline">
                        <strong>Dual Encoder</strong>
                        <span>image vector / text vector</span>
                    </div>
                    ${encoderMarkup()}
                </section>

                <section class="frontier-stage-card clip-space-panel">
                    <div class="frontier-section-headline">
                        <strong>Embedding Space</strong>
                        <span>matched pairs move closer</span>
                    </div>
                    ${embeddingSpaceMarkup()}
                </section>

                <section class="frontier-stage-card clip-matrix-panel">
                    <div class="frontier-section-headline">
                        <strong>Similarity Matrix</strong>
                        <span>${escapeHtml(cell.image.label)} × ${escapeHtml(cell.text.label)} = ${cell.score.toFixed(3)}</span>
                    </div>
                    ${matrixMarkup()}
                </section>

                <section class="frontier-stage-card clip-contrast-panel">
                    <div class="frontier-section-headline">
                        <strong>Contrastive Alignment</strong>
                        <span>diagonal positives / hard negatives</span>
                    </div>
                    ${contrastMarkup()}
                </section>

                <section class="frontier-stage-card clip-output-panel">
                    <div class="frontier-section-headline">
                        <strong>Zero-shot Output</strong>
                        <span>Top-k text prompts</span>
                    </div>
                    ${rankingMarkup()}
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
            el.sample.innerHTML = samples().map((sample) => `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.id)} / ${escapeHtml(sample.title)}</option>`).join("");
            el.sample.value = state.sampleId;
        }
        if (el.template) {
            el.template.innerHTML = templateList().map((template) => `<option value="${escapeHtml(template)}">${escapeHtml(template)}</option>`).join("");
            el.template.value = state.template;
        }
        el.displayButtons.forEach((button) => {
            const active = button.dataset.clipDisplay === state.display;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function renderSummaryAndNotes() {
        const step = state.player.current();
        const ranks = ranking();
        const cell = selectedCell();

        if (el.stageTitle) el.stageTitle.textContent = `${step.label} · ${currentSample().title}`;
        if (el.chips.sample) el.chips.sample.textContent = currentSample().id;
        if (el.chips.mode) el.chips.mode.textContent = displayLabel();
        if (el.chips.pair) el.chips.pair.textContent = `${cell.image.label} × ${cell.text.label}: ${cell.score.toFixed(3)}`;
        if (el.summary.imageCount) el.summary.imageCount.textContent = String(samples().length);
        if (el.summary.textCount) el.summary.textCount.textContent = String(samples().length);
        if (el.summary.dim) el.summary.dim.textContent = String(state.data?.embeddingDim || DEFAULT_DATA.embeddingDim);
        if (el.summary.compute) el.summary.compute.textContent = "cosine similarity";
        if (el.summary.top1) el.summary.top1.textContent = `${ranks[0]?.label || "-"} (${ranks[0]?.score.toFixed(2) || "-"})`;

        if (el.notes.step) el.notes.step.textContent = step.label;
        if (el.notes.summary) el.notes.summary.textContent = `${step.summary} ${currentSample().summary || ""}`;
        if (el.notes.input) el.notes.input.textContent = step.input;
        if (el.notes.middle) el.notes.middle.textContent = step.middle;
        if (el.notes.compute) el.notes.compute.textContent = step.compute;
        if (el.notes.output) el.notes.output.textContent = step.output;
        if (el.notes.formula) el.notes.formula.textContent = "sim(i,t)= i·t / (||i|| ||t||)";
        if (el.notes.formulaNote) {
            el.notes.formulaNote.textContent = step.id === "matrix"
                ? `当前 cell: ${cell.image.label} ↔ ${cell.text.label}, cosine=${cell.score.toFixed(4)}。`
                : "主舞台相似度由前端对预设 512 维向量计算；左侧面板可手动运行真实 CLIP zero-shot。";
        }

        if (el.topList) {
            el.topList.innerHTML = ranks.slice(0, 3).map((item, index) => `
                <li>
                    <span>Top-${index + 1}</span>
                    <i><b style="width:${pct(item.score)}%"></b></i>
                    <strong>${escapeHtml(item.label)} ${item.score.toFixed(2)}</strong>
                </li>
            `).join("");
        }
    }

    function renderAll() {
        if (!state.data) {
            if (el.stage) el.stage.innerHTML = '<div class="frontier-loading">正在加载 CLIP 预设样例...</div>';
            return;
        }
        const step = state.player.current();
        state.display = displayForStep(step.id);
        renderControls();
        renderStage();
        renderPipeline();
        renderSummaryAndNotes();
        renderRealModel();
    }

    function bindEvents() {
        el.sample?.addEventListener("change", () => {
            state.sampleId = el.sample.value;
            state.matrixImageId = state.sampleId;
            resetRealModelOutputForSampleChange();
            renderAll();
        });
        el.template?.addEventListener("change", () => {
            state.template = el.template.value || templateList()[0];
            state.vectorCache.clear();
            renderAll();
        });
        el.displayButtons.forEach((button) => {
            button.addEventListener("click", () => {
                state.display = button.dataset.clipDisplay || "space";
                state.player.setStep(stepForDisplay(state.display));
                alignStageTop();
            });
        });
        el.stage?.addEventListener("click", (event) => {
            const matrixCell = event.target.closest("[data-clip-matrix-image]");
            if (matrixCell) {
                state.matrixImageId = matrixCell.dataset.clipMatrixImage || state.matrixImageId;
                state.matrixTextId = matrixCell.dataset.clipMatrixText || state.matrixTextId;
                state.sampleId = state.matrixImageId;
                state.player.setStep(3);
                alignStageTop();
                return;
            }
            const image = event.target.closest("[data-clip-image]");
            if (image) {
                state.sampleId = image.dataset.clipImage || state.sampleId;
                state.matrixImageId = state.sampleId;
                resetRealModelOutputForSampleChange();
                renderAll();
                return;
            }
            const text = event.target.closest("[data-clip-text]");
            if (text) {
                state.matrixTextId = text.dataset.clipText || state.matrixTextId;
                renderAll();
            }
        });
        el.realModel.load?.addEventListener("click", () => {
            loadRealClipModel().catch(setRealModelFailure);
        });
        el.realModel.run?.addEventListener("click", () => {
            runRealClipModel();
        });
    }

    function initWithData(data) {
        state.data = data || DEFAULT_DATA;
        state.sampleId = state.data.defaultSample || samples()[0]?.id || "dog";
        state.template = templateList()[0];
        state.matrixImageId = state.sampleId;
        state.matrixTextId = state.sampleId;
        state.vectorCache.clear();
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
                console.warn("CLIP 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });
    }

    init();
}());
