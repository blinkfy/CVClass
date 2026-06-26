(function () {
    const root = document.querySelector("[data-semantic-lab]");
    if (!root) return;

    const UNKNOWN = 65535;
    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const modelBaseUrl = window.cvclassUrl("/static/assets/data/segformer_b0_ade/");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/semantic_inference.js?v=20260621-sem-restore-512");
    const requiredModelFiles = ["config.json", "preprocessor_config.json", "quantize_config.json", "model_quantized.onnx", "model_fp16.onnx"];
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const initialParams = new URLSearchParams(window.location.search);
    const initialSource = ["preset", "model", "fcn"].includes(initialParams.get("source")) ? initialParams.get("source") : "model";

    const state = {
        data: null,
        sampleId: "",
        selectedSource: initialSource,
        opacity: 0.65,
        boundaries: true,
        enabled: new Set(),
        presetMasks: new Map(),
        modelMask: null,
        fcnMask: null,
        currentMask: null,
        phase: "image",
        modelStatus: "未加载",
        activeBackend: "--",
        modelInfo: null,
        modelError: "",
        inferenceModule: null,
        inferenceClient: null,
        busy: false,
        probeInfo: null,
        fcnClassId: null,
        sampler: null,
        samplerKey: "",
        playing: false
    };

    const els = {
        sample: $("[data-sem-sample-picker]"),
        sampleTrigger: $("[data-sem-sample-trigger]"),
        sampleLabel: $("[data-sem-sample-label]"),
        sampleGrid: $("[data-sem-sample-grid]"),
        sourceButtons: $$("[data-sem-source]"),
        opacity: $("[data-sem-opacity]"),
        opacityOut: $("[data-sem-opacity-output]"),
        boundaries: $("[data-sem-boundaries]"),
        filter: $("[data-sem-class-filter]"),
        modelStatus: $("[data-sem-model-status]"),
        activeBackend: $("[data-sem-active-backend]"),
        modelMessage: $("[data-sem-model-message]"),
        inputSize: $("[data-sem-input-size]"),
        classCount: $("[data-sem-class-count]"),
        inferenceTime: $("[data-sem-inference-time]"),
        postprocessTime: $("[data-sem-postprocess-time]"),
        image: $("[data-sem-image]"),
        missing: $("[data-sem-missing]"),
        canvas: $("[data-sem-canvas]"),
        stage: $("[data-sem-stage]"),
        legend: $("[data-sem-legend]"),
        ratios: $("[data-sem-ratios]"),
        miou: $("[data-sem-miou]"),
        probe: $("[data-sem-probe]"),
        notesTitle: $("[data-sem-notes-title]"),
        notesSubtitle: $("[data-sem-notes-subtitle]"),
        notesTutorial: $("[data-sem-notes-tutorial]"),
        notes: $("[data-sem-notes]"),
        outputSchema: $("[data-sem-output-schema]"),
        stripSource: $("[data-sem-strip-source]"),
        stripModel: $("[data-sem-strip-model]"),
        stripInference: $("[data-sem-strip-inference]"),
        stripPostprocess: $("[data-sem-strip-postprocess]"),
        stripMask: $("[data-sem-strip-mask]"),
        stripClasses: $("[data-sem-strip-classes]"),
        stepperItems: [...document.querySelectorAll("[data-sem-stepper] [data-sem-phase]")],
        flowItems: $$("[data-flow-phase]"),
        fcnDemo: $("[data-sem-fcn-demo]"),
        fcnStages: $$("[data-fcn-stage]"),
        fcnChannelStack: $("[data-fcn-channel-stack]"),
        fcnUpsample: $("[data-fcn-upsample]"),
        fcnSkipCompare: $("[data-fcn-skip-compare]"),
        fcnNotesPanel: $("[data-fcn-notes-panel]"),
        fcnLogits: $("[data-fcn-logits]"),
        fcnMiouTable: $("[data-fcn-miou-table]"),
        processSteps: $("[data-sem-process-steps]"),
        processOverlay: $("[data-sem-process-overlay]"),
        processPrinciple: $("[data-sem-process-principle]"),
        processCard: $("[data-sem-process-card]"),
        playToggle: document.querySelector("[data-sem-play]"),
        resetFlow: document.querySelector("[data-sem-reset]"),
        timelineProgress: document.querySelector("[data-sem-progress]"),
        timelineLabel: document.querySelector("[data-sem-step-label]"),
        opacityControl: $("[data-sem-opacity]")?.closest(".vision-field"),
        boundaryControl: $("[data-sem-boundaries]")?.closest(".vision-toggle-row"),
        modelPanel: $("[data-sem-model-panel]")
    };
    const ctx = els.canvas.getContext("2d", {willReadFrequently: true});
    const FLOW_DELAY_MS = 1900;
    let playTimer = null;

    const processSteps = [
        {
            id: "image",
            title: "图像输入",
            detail: "H × W × 3 原始输入",
            input: "原始 RGB 图像",
            compute: "读取像素坐标、RGB 通道和图像尺寸。",
            output: "I ∈ R^{H×W×3}",
            formula: "I \\in \\mathbb{R}^{H \\times W \\times 3}",
            desc: "输入仍是普通 RGB 图像。语义分割的目标不是给整张图一个类别，而是让每个像素都得到一个语义标签。",
            overlay: "input"
        },
        {
            id: "preprocess",
            title: "预处理",
            detail: "等比缩放与归一化",
            input: "H×W×3 image",
            compute: "resize 到模型输入尺寸，并执行 0-255 → 0-1 → mean/std normalize。",
            output: "NCHW tensor",
            formula: "x = \\dfrac{\\mathrm{resize}(I)/255 - \\mu}{\\sigma}",
            desc: "图像先缩放到模型输入尺寸，再按均值和方差归一化，形成 NCHW tensor，保证不同图像进入网络时数值尺度一致。",
            overlay: "scan"
        },
        {
            id: "backbone",
            title: "编码器骨干网络",
            detail: "特征特征提取图",
            input: "normalized tensor",
            compute: "编码器聚合局部纹理、边缘和上下文，逐步降低空间分辨率。",
            output: "low-resolution feature map",
            formula: "F = \\mathrm{Encoder}(x)",
            desc: "编码器把局部纹理、边缘和上下文关系压缩成多尺度特征。动画中的小块向内汇聚，表示空间信息被编码成语义特征。",
            overlay: "blocks"
        },
        {
            id: "logits",
            title: "像素级得分 (Logits)",
            detail: "H′ × W′ × C 类别原始输出",
            input: "feature map F",
            compute: "分类头对每个空间位置输出 C 个类别原始分数。",
            output: "H′×W′×C logits",
            formula: "Z_{h,w,c} = W_c \\cdot F_{h,w} + b_c",
            desc: "分类头在每个空间位置输出 C 个类别分数。它像给每个像素位置放置一个小分类器，分别判断 road、person、building 等类别。",
            overlay: "channels"
        },
        {
            id: "upsample",
            title: "上采样高保真",
            detail: "双线性还原原图空间长宽",
            input: "low-resolution logits",
            compute: "使用双线性插值或 decoder 上采样，把粗网格恢复到原图尺度。",
            output: "H×W×C logits",
            formula: "Z^\\uparrow = \\mathrm{Upsample}(Z)",
            desc: "低分辨率 logits 被放大回原图尺度。线条向外伸展，表示稠密预测从粗网格恢复到像素级分辨率。",
            overlay: "expand"
        },
        {
            id: "argmax",
            title: "类别归属提取 (Argmax)",
            detail: "逐像素挑选最大概率类别",
            input: "H×W×C logits",
            compute: "每个像素沿 class channel 比较分数，选择最大类别。",
            output: "H×W class index map",
            formula: "\\hat{y}_{h,w} = \\arg\\max_c Z^\\uparrow_{h,w,c}",
            desc: "每个像素从 C 个类别分数中选择最大者，得到 H×W class map。颜色块逐渐锁定，表示类别决策完成。",
            overlay: "decision"
        },
        {
            id: "mask",
            title: "语义蒙版渲染",
            detail: "分类图例着色与透明透出",
            input: "H×W class index map",
            compute: "把 class id 映射为类别颜色，并按透明度叠加到原图。",
            output: "colored semantic mask",
            formula: "\\mathrm{Mask}_{h,w} = \\mathrm{color}(\\hat{y}_{h,w})",
            desc: "class map 被映射成颜色并叠加在原图上。这里同类像素会合并成一个语义区域，不区分第几个实例。",
            overlay: "mask"
        },
        {
            id: "miou",
            title: "交并比指标计算",
            detail: "所有类别 IoU 之算术平均",
            input: "prediction mask + ground truth",
            compute: "按类别计算 intersection / union，再对类别求平均。",
            output: "mean Intersection over Union",
            formula: "\\mathrm{mIoU} = \\dfrac{1}{C} \\sum_{c=1}^{C} \\dfrac{|P_c \\cap G_c|}{|P_c \\cup G_c|}",
            desc: "评价时按类别计算预测区域与真实标注的交并比，再对类别求平均。右侧公式展示了语义分割最常用的质量指标。",
            overlay: "metric"
        }
    ];

    const phaseAliases = {
        feature: "backbone",
        backbone: "backbone",
        conv: "logits",
        heatmap: "logits",
        inference: "logits",
        skip: "upsample",
        overlay: "mask",
        mask: "mask"
    };

    function canonicalPhase(id) {
        return phaseAliases[id] || id || "image";
    }

    function canonicalPhaseCN(id) {
        const cnNames = {
            "image": "图像输入",
            "preprocess": "数据预处理",
            "backbone": "骨干特征提取",
            "logits": "像素置信度计算",
            "upsample": "反卷积上采样",
            "argmax": "类别归属裁决",
            "mask": "语义蒙版渲染",
            "miou": "交并比指标校验"
        };
        return cnNames[canonicalPhase(id)] || id;
    }

    function processById(id) {
        const phase = canonicalPhase(id);
        return processSteps.find((step) => step.id === phase) || processSteps[0];
    }

    function phaseIndex(id = state.phase) {
        return Math.max(0, processSteps.findIndex((step) => step.id === canonicalPhase(id)));
    }

    function renderProcessSteps() {
        if (!els.processSteps) return;
        const activeIndex = phaseIndex(state.phase);
        els.processSteps.innerHTML = processSteps.map((step, index) => `
            <button type="button" class="${step.id === canonicalPhase(state.phase) ? "is-active" : ""} ${index < activeIndex ? "is-complete" : ""}" data-sem-process-step="${esc(step.id)}">
                <span class="process-step-num">${index + 1}</span>
                <span class="process-step-thumb" data-visual="${esc(step.overlay)}"></span>
                <strong>${esc(step.title)}</strong>
                <small>${esc(step.detail)}</small>
            </button>
        `).join("");
        els.processSteps.querySelectorAll("[data-sem-process-step]").forEach((button) => {
            button.addEventListener("click", () => setPhase(button.dataset.semProcessStep));
        });
    }

    function topSemanticClasses(limit = 5) {
        const mask = state.currentMask;
        if (!mask?.classes?.length) return [
            {id: 0, name: "road", cn: "道路", color: "#2563eb", ratio: 0.32},
            {id: 1, name: "building", cn: "建筑物", color: "#22c55e", ratio: 0.24},
            {id: 2, name: "person", cn: "行人", color: "#f97316", ratio: 0.18},
            {id: 3, name: "sidewalk", cn: "人行道", color: "#8b5cf6", ratio: 0.14},
            {id: 4, name: "sky", cn: "天空", color: "#06b6d4", ratio: 0.12}
        ].slice(0, limit);
        const byId = new Map(mask.classes.map((item) => [Number(item.id), item]));
        return (mask.distribution || [])
            .slice()
            .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))
            .map((item) => ({...byId.get(Number(item.id)), ratio: item.ratio || 0}))
            .filter((item) => item.id !== undefined)
            .slice(0, limit);
    }

    function normalizedBars(classes = topSemanticClasses(5), winnerId = null) {
        const safe = classes.length ? classes : topSemanticClasses(5);
        return safe.map((item, index) => {
            const ratio = Number.isFinite(item.ratio) ? item.ratio : (0.5 - index * 0.07);
            const value = Math.max(12, Math.min(96, 28 + ratio * 130 + (index === 0 ? 12 : 0)));
            const active = winnerId !== null ? Number(item.id) === Number(winnerId) : index === 0;
            return `<div class="${active ? "is-winner" : ""}">
                <span><i style="background:${esc(item.color || "#2563eb")}"></i>${esc(label(item))}</span>
                <b><em style="width:${value.toFixed(1)}%;background:${esc(item.color || "#2563eb")}"></em></b>
                <strong>${(value / 100).toFixed(2)}</strong>
            </div>`;
        }).join("");
    }

    function softmax(values) {
        const max = Math.max(...values);
        const exps = values.map((value) => Math.exp(value - max));
        const sum = exps.reduce((total, value) => total + value, 0) || 1;
        return exps.map((value) => value / sum);
    }

    function probeMath(mask, classId, rgbText) {
        const rgb = String(rgbText || "0,0,0").split(",").map((part) => Number(part.trim()) || 0);
        const signal = ((rgb[0] * 0.31 + rgb[1] * 0.47 + rgb[2] * 0.22) / 255) || 0.4;
        const classes = topSemanticClasses(5);
        const winnerIndex = Math.max(0, classes.findIndex((item) => Number(item.id) === Number(classId)));
        const logits = classes.map((item, index) => {
            const distance = Math.abs(index - winnerIndex);
            const base = 1.1 - distance * 0.42 + signal * 0.55 + ((Number(item.id) || index) % 5) * 0.07;
            return index === winnerIndex ? base + 1.25 : base;
        });
        const probs = softmax(logits);
        return {classes, logits, probs, winner: classes[winnerIndex] || classes[0]};
    }

    function probeBars(math) {
        return math.classes.map((item, index) => {
            const probability = math.probs[index] || 0;
            const active = Number(item.id) === Number(math.winner?.id);
            return `<div class="${active ? "is-winner" : ""}">
                <span><i style="background:${esc(item.color || "#2563eb")}"></i>${esc(label(item))}</span>
                <b><em style="width:${Math.max(4, probability * 100).toFixed(1)}%;background:${esc(item.color || "#2563eb")}"></em></b>
                <strong>${probability.toFixed(2)}</strong>
            </div>`;
        }).join("");
    }

    function processOverlayMarkup(step) {
        const kind = step.overlay;
        const mask = state.currentMask;
        const sampleInfo = sample();
        const classes = topSemanticClasses(5);
        const winner = classes[0];
        if (kind === "scan") return `
            <div class="semantic-step-visual is-preprocess">
                <div class="process-scanline"></div><div class="process-grid"></div>
                <div class="sem-normalize-card"><span>RGB 183</span><b></b><strong>→ 0.72</strong></div>
                <div class="sem-resize-card"><span>${sampleInfo?.width || mask?.width || "H"}×${sampleInfo?.height || mask?.height || "W"}</span><strong>→ 512×512</strong></div>
            </div>`;
        if (kind === "blocks") return `
            <div class="semantic-step-visual is-backbone">
                <div class="process-block-cloud">${Array.from({length: 24}, (_, i) => `<i style="--i:${i}; --mod6:${i % 6}; --div6:${Math.floor(i / 6)}"></i>`).join("")}</div>
                <div class="process-flow-line"></div>
                <div class="sem-feature-map">${Array.from({length: 36}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <div class="sem-tag-chip is-segformer">Transformer Encoder</div>
                <div class="sem-tag-chip is-fcn">CNN Backbone (FCN)</div>
            </div>`;
        if (kind === "channels") return `
            <div class="semantic-step-visual is-logits">
                <div class="process-channel-stack">${Array.from({length: 6}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <div class="sem-logit-panel"><strong>per-pixel logits</strong>${normalizedBars(classes, winner?.id)}</div>
                <div class="sem-tag-chip is-segformer">MLP Decoder</div>
                <div class="sem-tag-chip is-fcn">1×1 Conv (FCN 关键创新)</div>
            </div>`;
        if (kind === "expand") return `
            <div class="semantic-step-visual is-upsample">
                <div class="process-expand-grid">${Array.from({length: 25}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <div class="sem-upsample-arrow">×4</div>
                <div class="sem-highres-grid">${Array.from({length: 64}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <div class="sem-tag-chip is-segformer">双线性插值</div>
                <div class="sem-tag-chip is-fcn">反卷积 + Skip Connection</div>
            </div>`;
        if (kind === "decision") return `
            <div class="semantic-step-visual is-argmax">
                <div class="process-decision-map">${Array.from({length: 36}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <div class="sem-argmax-panel"><strong>argmax → class id</strong>${normalizedBars(classes, winner?.id)}</div>
            </div>`;
        if (kind === "mask") return `
            <div class="semantic-step-visual is-mask">
                <div class="process-mask-ribbons"><i></i><i></i><i></i><i></i></div>
                <div class="sem-mask-legend">${classes.slice(0, 4).map((item) => `<span><i style="background:${esc(item.color || "#2563eb")}"></i>${esc(label(item))}</span>`).join("")}</div>
            </div>`;
        if (kind === "metric") return `
            <div class="semantic-step-visual is-miou">
                <div class="process-iou-demo"><i class="gt"></i><i class="pred"></i><b></b><span>IoU</span></div>
                <div class="sem-miou-equation"><strong>∩</strong><b>/</b><strong>∪</strong><span>= ${mask ? (fcnMeanIoU(mask) / 100).toFixed(3) : "0.62"}</span></div>
            </div>`;
        return `
            <div class="semantic-step-visual is-image">
                <div class="process-input-frame"><i></i><i></i><i></i></div>
                <div class="sem-input-grid"></div>
                <div class="sem-coordinate-chip">x,y · H×W×3</div>
            </div>`;
    }

    function processStats(step) {
        const mask = state.currentMask;
        const meta = mask?.meta || {};
        const s = sample();
        const top = topClass(mask);
        const topInfo = top ? classById(mask, top.id) : null;
        if (step.id === "image") return s ? `${s.width} × ${s.height} 像素 RGB 原图` : "等待加载图像";
        if (step.id === "preprocess") return `${meta.inputSize || state.modelInfo?.inputSizeText || "512 × 512"} 的归一化输入张量`;
        if (step.id === "backbone") return `层低分辨率高级特征图 ≈ ${(mask?.height || 512) >> 4} × ${(mask?.width || 512) >> 4}`;
        if (step.id === "logits") return `${mask?.classes?.length || state.modelInfo?.classCount || "--"} 类别预测候选概率通道`;
        if (step.id === "upsample") return `${mask ? `${mask.height} × ${mask.width}` : "H × W"} 空间分辨率张量还原成功`;
        if (step.id === "argmax") return topInfo ? `winner class: ${label(topInfo)} ${(top.ratio * 100).toFixed(1)}%` : "等待预测分类完成";
        if (step.id === "mask") return `当前透明度 ${(state.当前透明度 * 100).toFixed(0)}%, 渲染画面类别数 ${state.enabled.size || "--"}`;
        if (step.id === "miou") return mask ? `mIoU ${fcnMeanIoU(mask).toFixed(1)}%` : "指标生成中";
        return "--";
    }

    function renderProcessVisuals() {
        const step = processById(state.phase);
        // 不在大图上叠加动画/网格等装饰层，保持原图与 mask 清晰可见
        if (els.processOverlay) {
            els.processOverlay.innerHTML = "";
            els.processOverlay.hidden = true;
        }
        if (els.processPrinciple) {
            els.processPrinciple.innerHTML = "";
            els.processPrinciple.hidden = true;
        }
        if (els.processCard) {
            const rows = [
                ["输入数据结构", step.input],
                ["前向层核心逻辑", step.compute],
                ["输出数据结构", step.output],
                ["当前运行特征数据", processStats(step)]
            ];
            const kicker = els.processCard.querySelector("[data-process-kicker]");
            const title = els.processCard.querySelector("[data-process-title]");
            const formula = els.processCard.querySelector("[data-process-formula]");
            const desc = els.processCard.querySelector("[data-process-desc]");
            if (kicker) kicker.textContent = `SEMANTIC STEP ${phaseIndex(step.id) + 1} / ${processSteps.length}`;
            if (title) title.textContent = step.title;
            if (formula) renderFormula(step.formula, formula);
            if (desc) {
                desc.outerHTML = `<div class="process-structure-list" data-process-desc>${rows.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("")}</div>`;
            }
        }
    }

    function syncProcessConsole() {
        renderProcessSteps();
        renderProcessVisuals();
        syncTimeline();
    }

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function fmtMs(value) {
        return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "--";
    }

    function stripDisplayDelimiters(tex) {
        const s = String(tex || "").trim();
        if (s.startsWith("$$") && s.endsWith("$$")) return s.slice(2, -2).trim();
        return s;
    }

    function renderFormula(tex, el) {
        if (!el || !window.katex) {
            if (el) el.textContent = tex;
            return false;
        }
        const latex = stripDisplayDelimiters(tex);
        if (!latex) return false;
        try {
            window.katex.render(latex, el, {throwOnError: false, displayMode: true});
            return true;
        } catch (e) {
            console.warn("katex render failed:", latex, e);
            el.textContent = tex;
            return false;
        }
    }

    function sample() {
        return state.data?.samples?.find((item) => item.id === state.sampleId) || state.data?.samples?.[0];
    }

    function label(info) {
        return info?.cn || info?.name || `class_${info?.id ?? "--"}`;
    }

    function classById(mask, id) {
        return mask?.classes?.find((item) => Number(item.id) === Number(id));
    }

    function encodeId(id) {
        const value = Number(id) + 1;
        return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
    }

    function decodeId(r, g, b) {
        const value = (r << 16) | (g << 8) | b;
        return value > 0 ? value - 1 : UNKNOWN;
    }

    function buildDistribution(classes, counts, total) {
        return classes.map((item) => ({
            id: Number(item.id),
            name: item.name,
            count: counts.get(Number(item.id)) || 0,
            ratio: total ? (counts.get(Number(item.id)) || 0) / total : 0
        }));
    }

    function buildFcnMiouRows(classes) {
        return classes.slice(0, 6).map((item, index) => {
            const intersection = 520 - index * 38;
            const union = intersection + 115 + index * 29;
            return {
                id: Number(item.id),
                className: label(item),
                color: item.color,
                intersection,
                union,
                iou: intersection / union
            };
        });
    }

    function buildPresetMask(s) {
        if (state.presetMasks.has(s.id)) return state.presetMasks.get(s.id);
        const maskCanvas = document.createElement("canvas");
        const scoreCanvas = document.createElement("canvas");
        maskCanvas.width = scoreCanvas.width = s.width;
        maskCanvas.height = scoreCanvas.height = s.height;
        const maskCtx = maskCanvas.getContext("2d", {willReadFrequently: true});
        const scoreCtx = scoreCanvas.getContext("2d", {willReadFrequently: true});
        const byName = new Map(s.classes.map((item) => [item.name, item]));

        (s.regions || []).forEach((region) => {
            const info = byName.get(region.class);
            if (!info || !Array.isArray(region.polygon) || region.polygon.length < 3) return;
            maskCtx.beginPath();
            scoreCtx.beginPath();
            region.polygon.forEach(([x, y], index) => {
                const target = index === 0 ? "moveTo" : "lineTo";
                maskCtx[target](x, y);
                scoreCtx[target](x, y);
            });
            maskCtx.closePath();
            scoreCtx.closePath();
            maskCtx.fillStyle = encodeId(info.id);
            maskCtx.fill();
            const score = Math.max(0, Math.min(255, Math.round((region.probability ?? 0.75) * 255)));
            scoreCtx.fillStyle = `rgb(${score}, ${score}, ${score})`;
            scoreCtx.fill();
        });

        const rgba = maskCtx.getImageData(0, 0, s.width, s.height).data;
        const scores = scoreCtx.getImageData(0, 0, s.width, s.height).data;
        const classMap = new Uint16Array(s.width * s.height);
        const scoreMap = new Float32Array(s.width * s.height);
        const counts = new Map();
        for (let i = 0; i < classMap.length; i += 1) {
            const p = i * 4;
            const id = decodeId(rgba[p], rgba[p + 1], rgba[p + 2]);
            classMap[i] = id;
            if (id !== UNKNOWN) {
                counts.set(id, (counts.get(id) || 0) + 1);
                scoreMap[i] = scores[p] / 255;
            }
        }

        const classes = s.classes.map((item) => ({...item, id: Number(item.id)}));
        const mask = {
            source: "preset",
            sampleId: s.id,
            width: s.width,
            height: s.height,
            classMap,
            scoreMap,
            classes,
            distribution: buildDistribution(classes, counts, s.width * s.height),
            meta: {
                modelName: "Preset Mask",
                backend: "preset",
                inputSize: `${s.width} × ${s.height}`,
                rawOutputShape: "polygon regions",
                rawOutputSummary: "preset polygons rasterized to classMap",
                preprocessTime: 0,
                inferenceTime: null,
                postprocessTime: 0
            }
        };
        state.presetMasks.set(s.id, mask);
        return mask;
    }

    function presetMask() {
        return buildPresetMask(sample());
    }

    function buildFcnMask() {
        const base = presetMask();
        const classMap = new Uint16Array(base.classMap);
        const scoreMap = new Float32Array(base.scoreMap || base.classMap.length);
        const counts = new Map();
        for (let i = 0; i < classMap.length; i += 1) {
            const id = classMap[i];
            if (id !== UNKNOWN) {
                counts.set(id, (counts.get(id) || 0) + 1);
                if (!scoreMap[i]) scoreMap[i] = 0.72 + ((i % 17) / 100);
            }
        }
        const classes = base.classes.map((item) => ({...item}));
        const mask = {
            source: "fcn",
            sampleId: state.sampleId,
            width: base.width,
            height: base.height,
            classMap,
            scoreMap,
            classes,
            distribution: buildDistribution(classes, counts, base.width * base.height),
            meta: {
                modelName: "FCN Principle Demo",
                backend: "preset feature maps",
                inputSize: `${base.width} × ${base.height}`,
                rawOutputShape: `[1, ${classes.length}, ${Math.ceil(base.height / 32)}, ${Math.ceil(base.width / 32)}] logits`,
                rawOutputSummary: "Backbone feature map -> 1×1 conv logits -> upsample -> skip fusion -> argmax classMap",
                preprocessTime: 0,
                inferenceTime: null,
                postprocessTime: 0,
                classCount: classes.length,
                miouRows: buildFcnMiouRows(classes)
            }
        };
        state.fcnMask = mask;
        return mask;
    }

    function fcnMask() {
        return state.fcnMask?.sampleId === state.sampleId ? state.fcnMask : buildFcnMask();
    }

    function currentUsableMask() {
        if (state.selectedSource === "fcn") return fcnMask();
        if (state.selectedSource === "model" && state.modelMask?.sampleId === state.sampleId) return state.modelMask;
        return presetMask();
    }

    function setPhase(phase) {
        state.phase = canonicalPhase(phase);
        const activeIndex = phaseIndex(state.phase);
        root.dataset.semActiveStep = state.phase;
        if (els.stage) els.stage.dataset.activeStep = state.phase;
        els.stepperItems.forEach((item) => {
            const itemPhase = canonicalPhase(item.dataset.semPhase);
            item.classList.toggle("is-active", itemPhase === state.phase);
            item.classList.toggle("is-complete", phaseIndex(itemPhase) < activeIndex);
        });
        els.flowItems.forEach((item) => item.classList.toggle("is-active", canonicalPhase(item.dataset.flowPhase) === state.phase));
        els.fcnStages.forEach((item) => item.classList.toggle("is-active", canonicalPhase(item.dataset.fcnStage) === state.phase));
        if (els.opacityControl) els.opacityControl.classList.toggle("is-sem-relevant", ["argmax", "mask", "miou"].includes(state.phase));
        if (els.boundaryControl) els.boundaryControl.classList.toggle("is-sem-relevant", ["argmax", "mask", "miou"].includes(state.phase));
        if (els.filter) els.filter.classList.toggle("is-sem-relevant", ["argmax", "mask", "miou"].includes(state.phase));
        if (els.modelPanel) els.modelPanel.classList.toggle("is-sem-relevant", ["preprocess", "backbone", "logits", "upsample"].includes(state.phase));
        syncProcessConsole();
        renderNotes();
    }

    function syncTimeline() {
        const index = phaseIndex(state.phase);
        const pct = processSteps.length > 1 ? (index / (processSteps.length - 1)) * 100 : 0;
        if (els.timelineProgress) els.timelineProgress.style.setProperty("--sem-progress", `${pct}%`);
        if (els.timelineLabel) els.timelineLabel.textContent = `${String(index + 1).padStart(2, "0")} / ${processSteps.length} · ${canonicalPhaseCN(state.phase)}`;
        if (els.playToggle) els.playToggle.textContent = state.playing ? "暂停" : "自动放映";
        root.classList.toggle("is-sem-playing", state.playing);
    }

    function stopPlayback() {
        state.playing = false;
        if (playTimer) {
            window.clearTimeout(playTimer);
            playTimer = null;
        }
        syncTimeline();
    }

    function schedulePlayback() {
        if (!state.playing) return;
        if (playTimer) window.clearTimeout(playTimer);
        playTimer = window.setTimeout(() => {
            const next = phaseIndex(state.phase) + 1;
            if (next >= processSteps.length) {
                stopPlayback();
                return;
            }
            setPhase(processSteps[next].id);
            schedulePlayback();
        }, FLOW_DELAY_MS);
    }

    function togglePlayback() {
        state.playing = !state.playing;
        syncTimeline();
        if (state.playing) schedulePlayback();
        else stopPlayback();
    }

    function setModelStatus(status, message) {
        state.modelStatus = status;
        els.modelStatus.textContent = status;
        if (message) els.modelMessage.textContent = message;
    }

    function setBusy(busy) {
        state.busy = busy;
    }

    function fallbackToPreset(message = "加载/推理失败，已自动降级为预设 Mask。") {
        state.selectedSource = "preset";
        setPhase("mask");
        setModelStatus(state.modelStatus, message);
        activateMask(presetMask(), true);
    }

    function renderRuntime() {
        const mask = state.currentMask;
        const meta = mask?.meta || {};
        els.inputSize.textContent = meta.inputSize || state.modelInfo?.inputSizeText || "512 × 512";
        els.classCount.textContent = String(meta.classCount || state.modelInfo?.classCount || mask?.classes?.length || "--");
        els.inferenceTime.textContent = fmtMs(meta.inferenceTime);
        els.postprocessTime.textContent = fmtMs(meta.postprocessTime);
        if (els.activeBackend) {
            els.activeBackend.textContent = (state.activeBackend && state.activeBackend !== "--") ? state.activeBackend.toUpperCase() : (meta.backend || "--").toUpperCase();
        }
        els.stripSource.textContent = mask?.source === "model" ? "前端网络推理" : mask?.source === "fcn" ? "FCN 二维全卷积原理" : "课程标准预设 Mask";
        els.stripModel.textContent = meta.modelName || "--";
        els.stripInference.textContent = fmtMs(meta.inferenceTime);
        els.stripPostprocess.textContent = fmtMs(meta.postprocessTime);
        els.stripMask.textContent = mask ? `${mask.height} × ${mask.width}` : "--";
        els.stripClasses.textContent = String(mask?.classes?.length || "--");
        els.miou.textContent = mask?.source === "preset" ? `mIoU ${((sample()?.miou || 0) * 100).toFixed(1)}%` : mask?.source === "fcn" ? `mIoU ${fcnMeanIoU(mask).toFixed(1)}%` : "Model Mask";
        updateSourceButtons();
        renderFcnVisibility();
    }

    function fcnMeanIoU(mask) {
        const rows = mask?.meta?.miouRows || [];
        if (!rows.length) return (sample()?.miou || 0) * 100;
        return rows.reduce((sum, row) => sum + row.iou, 0) / rows.length * 100;
    }

    function updateSourceButtons() {
        els.sourceButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.semSource === state.selectedSource);
        });
    }

    function renderFcnVisibility() {
        const isFcn = state.selectedSource === "fcn";
        if (els.fcnDemo) els.fcnDemo.hidden = !isFcn;
        if (els.fcnNotesPanel) els.fcnNotesPanel.hidden = !isFcn;
        if (isFcn) renderFcnDemo();
    }

    function visibleClasses(mask) {
        return mask.distribution
            .filter((item) => item.count > 0 || mask.source === "preset")
            .map((item) => classById(mask, item.id))
            .filter(Boolean);
    }

    function renderClassControls(reset = false) {
        const mask = state.currentMask;
        if (!mask) return;
        const classes = visibleClasses(mask);
        if (reset || !state.enabled.size) {
            state.enabled = new Set(classes.map((item) => Number(item.id)));
        } else {
            const available = new Set(classes.map((item) => Number(item.id)));
            state.enabled = new Set([...state.enabled].filter((id) => available.has(Number(id))));
            if (!state.enabled.size) state.enabled = new Set(classes.map((item) => Number(item.id)));
        }
        els.filter.innerHTML = classes.map((item) => `
            <label class="vision-check-row">
                <input type="checkbox" value="${Number(item.id)}" ${state.enabled.has(Number(item.id)) ? "checked" : ""}>
                <span><i style="background:${esc(item.color)}"></i>${esc(label(item))}</span>
            </label>`).join("");
        els.filter.querySelectorAll("input").forEach((input) => {
            input.addEventListener("change", () => {
                state.enabled = new Set([...els.filter.querySelectorAll("input:checked")].map((node) => Number(node.value)));
                draw();
                renderLegendAndRatios();
                renderNotes();
            });
        });
    }

    function renderLegendAndRatios() {
        const mask = state.currentMask;
        if (!mask) return;
        const rows = mask.distribution
            .filter((item) => item.count > 0 || mask.source === "preset")
            .map((item) => {
                const info = classById(mask, item.id);
                const enabled = state.enabled.has(Number(item.id));
                return {info, enabled, pct: enabled ? item.ratio * 100 : 0};
            });
        els.legend.innerHTML = rows.map(({info, enabled}) => `<span class="${enabled ? "" : "is-muted"}"><i style="background:${esc(info?.color || "#2563eb")}"></i>${esc(label(info))}</span>`).join("");
        els.ratios.innerHTML = rows.map(({info, enabled, pct}) => `
            <div class="${enabled ? "" : "is-muted"}">
                <span><i style="background:${esc(info?.color || "#2563eb")}"></i>${esc(label(info))}</span>
                <b><em style="width:${pct.toFixed(2)}%;background:${esc(info?.color || "#2563eb")}"></em></b>
                <strong>${pct.toFixed(1)}%</strong>
            </div>`).join("") || `<p class="semantic-empty-text">当前 mask 没有可显示类别。</p>`;
        els.outputSchema.textContent = `${mask.height} × ${mask.width} class index map`;
    }

    function renderFcnDemo() {
        const mask = state.currentMask?.source === "fcn" ? state.currentMask : null;
        if (!mask) return;
        const rows = mask.meta?.miouRows || [];
        const selected = state.fcnClassId ?? rows[0]?.id;
        state.fcnClassId = selected;
        const selectedInfo = classById(mask, selected) || mask.classes[0];
        const selectedColor = selectedInfo?.color || "#2563eb";
        if (els.fcnChannelStack) {
            els.fcnChannelStack.innerHTML = `
                <div class="fcn-feature-cube"><span>Backbone</span>${Array.from({length: 6}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
                <b>1×1</b>
                <div class="fcn-logit-cube"><span>${mask.classes.length} class logits</span>${mask.classes.slice(0, 6).map((item) => `<i style="background:${esc(item.color)}"></i>`).join("")}</div>
            `;
        }
        if (els.fcnUpsample) {
            els.fcnUpsample.innerHTML = `
                <div class="fcn-lowres-grid">${Array.from({length: 16}, (_, i) => `<i style="background:${esc(mask.classes[i % mask.classes.length]?.color || "#2563eb")}"></i>`).join("")}</div>
                <b>×32</b>
                <div class="fcn-highres-grid">${Array.from({length: 64}, (_, i) => `<i style="background:${esc(mask.classes[(i + Math.floor(i / 8)) % mask.classes.length]?.color || "#2563eb")}"></i>`).join("")}</div>
            `;
        }
        if (els.fcnSkipCompare) {
            els.fcnSkipCompare.innerHTML = `
                <div class="fcn-skip-tile is-coarse"><strong>without skip</strong><span style="background:${esc(selectedColor)}"></span></div>
                <div class="fcn-skip-plus">+</div>
                <div class="fcn-skip-tile is-fine"><strong>with skip</strong><span style="background:${esc(selectedColor)}"></span></div>
            `;
        }
        if (els.fcnLogits) {
            const classIndex = mask.classes.findIndex((item) => Number(item.id) === Number(selected));
            const safeIndex = Math.max(0, classIndex);
            const logits = [0.1, 0.2, 0.7].map((v, i) => i === 2 ? 0.62 + safeIndex * 0.03 : v).map((v) => v.toFixed(2));
            els.fcnLogits.textContent = `pixel(h,w): [${logits.join(", ")}] → class=${selected}`;
        }
        if (els.fcnMiouTable) {
            els.fcnMiouTable.innerHTML = `
                <div class="semantic-miou-head"><span>class</span><span>intersection</span><span>union</span><span>IoU</span></div>
                ${rows.map((row) => `
                    <button type="button" class="${Number(row.id) === Number(selected) ? "is-active" : ""}" data-fcn-miou-class="${row.id}">
                        <span><i style="background:${esc(row.color)}"></i>${esc(row.className)}</span>
                        <span>${row.intersection}</span>
                        <span>${row.union}</span>
                        <strong>${row.iou.toFixed(3)}</strong>
                    </button>
                `).join("")}
            `;
            els.fcnMiouTable.querySelectorAll("[data-fcn-miou-class]").forEach((button) => {
                button.addEventListener("click", () => {
                    state.fcnClassId = Number(button.dataset.fcnMiouClass);
                    setPhase("miou");
                    renderFcnDemo();
                    renderNotes();
                });
            });
        }
    }

    function parseColor(hex) {
        const value = String(hex || "#2563eb").replace("#", "");
        const full = value.length === 3 ? value.split("").map((x) => x + x).join("") : value.padEnd(6, "0").slice(0, 6);
        return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
    }

    function shouldDraw(id) {
        return id !== UNKNOWN && state.enabled.has(Number(id));
    }

    function boundary(mask, x, y, id) {
        if (!state.boundaries || !shouldDraw(id)) return false;
        const w = mask.width;
        const h = mask.height;
        if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return true;
        const i = y * w + x;
        return mask.classMap[i - 1] !== id || mask.classMap[i + 1] !== id || mask.classMap[i - w] !== id || mask.classMap[i + w] !== id;
    }

    function draw() {
        const mask = state.currentMask;
        if (!mask) return;
        els.canvas.width = mask.width;
        els.canvas.height = mask.height;
        els.stage.style.setProperty("--sem-aspect", `${Math.max(1, mask.width)} / ${Math.max(1, mask.height)}`);
        els.canvas.style.opacity = String(state.opacity);
        const imageData = ctx.createImageData(mask.width, mask.height);
        const out = imageData.data;
        const colors = new Map();
        for (let y = 0; y < mask.height; y += 1) {
            for (let x = 0; x < mask.width; x += 1) {
                const i = y * mask.width + x;
                const id = mask.classMap[i];
                const p = i * 4;
                if (!shouldDraw(id)) {
                    out[p] = 0; out[p + 1] = 0; out[p + 2] = 0; out[p + 3] = 0;
                    continue;
                }
                if (boundary(mask, x, y, id)) {
                    out[p] = 255; out[p + 1] = 255; out[p + 2] = 255; out[p + 3] = 210;
                    continue;
                }
                if (!colors.has(id)) colors.set(id, parseColor(classById(mask, id)?.color));
                const [r, g, b] = colors.get(id);
                out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function activateMask(mask, resetClasses = false) {
        state.currentMask = mask;
        state.probeInfo = null;
        state.sampler = null;
        state.samplerKey = "";
        renderRuntime();
        renderClassControls(resetClasses);
        renderLegendAndRatios();
        draw();
        renderNotes();
    }

    function renderImage() {
        const s = sample();
        if (!s) return;
        els.image.src = window.cvclassUrl(s.image);
        els.missing.textContent = `请放入 ${s.image.split("/").pop()}`;
    }

    async function fetchHeadOrGet(url) {
        let response = await fetch(url, {method: "HEAD"});
        if (response.status === 405 || response.status === 501) response = await fetch(url);
        return response.ok;
    }

    async function checkModelFiles() {
        const missing = [];
        for (const file of requiredModelFiles) {
            const ok = await fetchHeadOrGet(window.cvclassUrl(`/static/assets/data/segformer_b0_ade/${file}`)).catch(() => false);
            if (!ok) missing.push(file);
        }
        return missing;
    }

    async function getInferenceClient() {
        if (state.inferenceClient) return state.inferenceClient;
        state.inferenceModule = await import(inferenceModuleUrl);
        state.inferenceClient = state.inferenceModule.createSemanticInferenceClient();
        return state.inferenceClient;
    }

    function formatError(error) {
        const shape = error?.rawOutputShape ? ` rawOutputShape=[${error.rawOutputShape.join(", ")}]` : "";
        return `${error?.message || "语义分割推理失败"}${shape}`;
    }

    function waitForImage(image) {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                image.removeEventListener("load", onLoad);
                image.removeEventListener("error", onError);
            };
            const onLoad = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error("图像加载失败，无法运行语义分割。")); };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    async function loadModel() {
        if (state.busy) return;
        state.selectedSource = "model";
        setBusy(true);
        setPhase("preprocess");
        setModelStatus("正在检查资源", "正在检索系统本地部署的 ONNX 权重文件...");
        try {
            const missing = await checkModelFiles();
            if (missing.length) {
                const message = `模型文件未完全准备好，已自动为您使用预设 mask。缺失文件：${missing.join(", ")}`;
                state.modelError = message;
                state.activeBackend = "--";
                setModelStatus("加载失败", message);
                renderRuntime();
                fallbackToPreset(message);
                return;
            }
            setModelStatus("正在激活权重", "正在加载 SegFormer-B0 本地轻量化模型...");
            const client = await getInferenceClient();
            const info = await client.loadSemanticModel({modelBaseUrl, backend: "webgpu"});
            state.modelInfo = {...info, inputSizeText: `${info.inputSize.width} × ${info.inputSize.height}`};
            state.activeBackend = info.backend;
            state.modelError = "";
            setModelStatus("准备绪", "本地 SegFormer-B0 预测引擎状态良好");
            renderRuntime();
            setPhase("logits");
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            state.activeBackend = "--";
            setModelStatus("加载失败", message);
            renderRuntime();
            fallbackToPreset(`加载失败：${message}`);
        } finally {
            setBusy(false);
        }
    }

    async function runModel() {
        if (state.busy) return;
        state.selectedSource = "model";
        if (state.modelStatus !== "准备绪" && state.modelStatus !== "已加载" && state.modelStatus !== "推理完成") {
            await loadModel();
            if (state.modelStatus !== "准备绪" && state.modelStatus !== "已加载") return;
        }
        setBusy(true);
        try {
            await waitForImage(els.image);
            setModelStatus("预处理计算中", "正在对图像像素矩阵执行 letterbox 缩放与中心归一化...");
            setPhase("preprocess");
            await new Promise((resolve) => setTimeout(resolve, 100));
            setPhase("logits");
            const result = await (await getInferenceClient()).runSemanticInference(els.image);
            setPhase("argmax");
            await new Promise((resolve) => setTimeout(resolve, 100));
            result.sampleId = state.sampleId;
            result.meta = {...result.meta, backend: result.meta?.backend || state.activeBackend, modelName: "SegFormer-B0"};
            state.activeBackend = result.meta.backend;
            state.modelMask = result;
            state.enabled = new Set(result.classes.map((item) => Number(item.id)));
            setModelStatus("推理完成", `SegFormer 前向分类与 argmax 计算已全量完成！`);
            setPhase("mask");
            activateMask(result, true);
            setPhase("mask");
        } catch (error) {
            const message = formatError(error);
            state.modelError = message;
            setModelStatus("加载失败", `${message}`);
            fallbackToPreset(`推理失败：${message}`);
        } finally {
            setBusy(false);
        }
    }

    function topClass(mask) {
        return mask?.distribution?.slice().sort((a, b) => b.ratio - a.ratio)[0] || null;
    }

    function renderNotes() {
        const mask = state.currentMask;
        const meta = mask?.meta || {};
        const s = sample();
        const top = topClass(mask);
        const topInfo = top ? classById(mask, top.id) : null;
        if (state.probeInfo) {
            const p = state.probeInfo;
            els.notesTitle.textContent = "Pixel Probe";
            els.notesSubtitle.textContent = `Pixel(${p.x}, ${p.y})`;
            els.notesTutorial.innerHTML = `<p>探针把当前位置的 RGB、classMap 和类别表串起来，演示一个像素从 logits 经 softmax 到 argmax 类别的路径。</p>`;
            els.notes.innerHTML = `<dl>
                <div><dt>Pixel(x,y)</dt><dd>${p.x}, ${p.y}</dd></div>
                <div><dt>RGB</dt><dd>${p.rgb}</dd></div>
                <div><dt>Class Logits</dt><dd>[${esc(p.logits)}]</dd></div>
                <div><dt>Softmax</dt><dd>[${esc(p.softmax)}]</dd></div>
                <div><dt>Argmax Class</dt><dd>${esc(p.argmax)}</dd></div>
                <div><dt>Final Mask Color</dt><dd><span class="semantic-note-swatch" style="background:${esc(p.color)}"></span>${esc(p.color)}</dd></div>
            </dl>`;
            return;
        }
        if (state.selectedSource === "fcn") {
            const rows = mask?.meta?.miouRows || [];
            const selected = rows.find((row) => Number(row.id) === Number(state.fcnClassId)) || rows[0];
            const phaseCopy = {
                image: ["Semantic Segmentation = Pixel-wise Classification", "每个像素输出一个 class id，最终得到 H × W class index map。"],
                preprocess: ["Preprocess", "resize / normalize 把输入图像变为模型可处理的 NCHW tensor。"],
                backbone: ["Patch-wise 分类的问题", "滑窗 patch 分类重复计算多、局部信息有限，且不是端到端 dense prediction。"],
                logits: ["FCN 关键点 1：卷积替换全连接", "1×1 Conv 将每个空间位置的特征通道映射到 C 个类别 logits。"],
                upsample: ["FCN 关键点 2：上采样 / 反卷积", "通过 deconvolution 或双线性插值把低分辨率 heatmap 放大回原图尺寸。"],
                argmax: ["logits → argmax", "对每个像素执行 argmax_c logits[c,h,w]，得到最终 class id。"],
                mask: ["Semantic Mask Overlay", "class id map 被映射为类别颜色并叠加到原图，形成可检查的语义 mask。"],
                miou: ["mIoU 公式", "IoU_c = intersection_c / union_c，mIoU 是所有类别 IoU 的平均。"]
            };
            const [title, desc] = phaseCopy[state.phase] || phaseCopy.image;
            els.notesTitle.textContent = "FCN 原理演示";
            els.notesSubtitle.textContent = title;
            els.notesTutorial.innerHTML = `<p>${desc}</p>`;
            const iouLatex = `\\mathrm{IoU}_c = \\dfrac{${selected ? selected.intersection : "\\cap"}}{${selected ? selected.union : "\\cup"}} = ${selected ? selected.iou.toFixed(3) : "\\text{--}"}`;
            els.notes.innerHTML = `<dl><div><dt>当前阶段</dt><dd>${esc(state.phase)}</dd></div><div><dt>逐像素分类</dt><dd>H × W pixels → H × W class ids</dd></div><div><dt>1×1 Conv 输出</dt><dd>${mask?.classes?.length || "--"} 个类别通道</dd></div><div><dt>Skip Connection</dt><dd>coarse semantic + fine boundary</dd></div><div><dt>当前类别 IoU</dt><dd class="katex-math" data-latex="${esc(iouLatex)}"></dd></div><div><dt>mIoU</dt><dd>${mask ? `${fcnMeanIoU(mask).toFixed(1)}%` : "--"}</dd></div></dl>`;
            return;
        }
        if (state.phase === "preprocess") {
            els.notesTitle.textContent = "Preprocess";
            els.notesSubtitle.textContent = "Resize / Normalize";
            els.notesTutorial.innerHTML = `<p>resize → NCHW tensor，ImageNet mean/std 归一化。</p>`;
            els.notes.innerHTML = `<dl><div><dt>输入</dt><dd>${s?.width || "--"} × ${s?.height || "--"}</dd></div><div><dt>目标</dt><dd>${meta.inputSize || state.modelInfo?.inputSizeText || "512 × 512"}</dd></div><div><dt>tensor</dt><dd>[1, 3, H, W]</dd></div></dl>`;
        } else if (state.phase === "backbone") {
            els.notesTitle.textContent = "Backbone";
            els.notesSubtitle.textContent = "Feature Map";
            els.notesTutorial.innerHTML = `<p>RGB → 低分辨率语义特征。SegFormer 用 Transformer，FCN 用 CNN。</p>`;
            els.notes.innerHTML = `<dl><div><dt>输入</dt><dd>NCHW tensor</dd></div><div><dt>输出</dt><dd>H′ × W′ × D</dd></div><div><dt>后端</dt><dd>${esc(state.activeBackend || meta.backend || "--")}</dd></div><div><dt>模型</dt><dd>${esc(meta.modelName || "SegFormer-B0")}</dd></div></dl>`;
        } else if (state.phase === "logits") {
            els.notesTitle.textContent = "Pixel Logits";
            els.notesSubtitle.textContent = "H×W×C scores";
            els.notesTutorial.innerHTML = `<p>每个像素位置输出 C 类 logits。SegFormer 用 MLP decoder，FCN 用 1×1 conv。</p>`;
            els.notes.innerHTML = `<dl><div><dt>类别数</dt><dd>${meta.classCount || mask?.classes?.length || "--"}</dd></div><div><dt>推理耗时</dt><dd>${fmtMs(meta.inferenceTime)}</dd></div><div><dt>rawOutputShape</dt><dd>${Array.isArray(meta.rawOutputShape) ? `[${meta.rawOutputShape.join(", ")}]` : esc(meta.rawOutputShape || "--")}</dd></div></dl>`;
        } else if (state.phase === "upsample") {
            els.notesTitle.textContent = "Upsample";
            els.notesSubtitle.textContent = "Restore H × W";
            els.notesTutorial.innerHTML = `<p>低分辨率 logits → 原图尺寸。SegFormer 双线性插值，FCN 反卷积 + skip。</p>`;
            els.notes.innerHTML = `<dl><div><dt>输入</dt><dd>H′×W′×C logits</dd></div><div><dt>输出</dt><dd>H×W×C logits</dd></div><div><dt>方式</dt><dd>${mask?.source === "model" ? "双线性插值" : "反卷积 + skip"}</dd></div></dl>`;
        } else if (state.phase === "argmax") {
            els.notesTitle.textContent = "Argmax";
            els.notesSubtitle.textContent = "C-channel decision";
            const directMask = String(meta.rawOutputSummary || "").includes("class mask");
            els.notesTutorial.innerHTML = `<p>${directMask ? "模型内部已完成 argmax，直接返回 class mask。" : "逐像素 argmax_c logits[c,h,w] → class id。"}</p>`;
            els.notes.innerHTML = `<dl><div><dt>类别数</dt><dd>${meta.classCount || mask?.classes?.length || "--"}</dd></div><div><dt>mask 尺寸</dt><dd>${mask ? `${mask.height} × ${mask.width}` : "--"}</dd></div><div><dt>rawOutputShape</dt><dd>${Array.isArray(meta.rawOutputShape) ? `[${meta.rawOutputShape.join(", ")}]` : esc(meta.rawOutputShape || "--")}</dd></div></dl>`;
        } else if (state.phase === "mask") {
            els.notesTitle.textContent = "Semantic Mask";
            els.notesSubtitle.textContent = "H × W class map";
            els.notesTutorial.innerHTML = `<p>class map → 颜色 → 叠加原图。同类合并，不区分实例。</p>`;
            els.notes.innerHTML = `<dl><div><dt>mask 尺寸</dt><dd>${mask ? `${mask.height} × ${mask.width}` : "--"}</dd></div><div><dt>类别数</dt><dd>${mask?.classes?.length || "--"}</dd></div><div><dt>最大占比</dt><dd>${topInfo ? `${esc(label(topInfo))} ${(top.ratio * 100).toFixed(1)}%` : "--"}</dd></div><div><dt>输出结构</dt><dd>H × W class index map</dd></div></dl>`;
        } else if (state.phase === "miou") {
            els.notesTitle.textContent = "mIoU";
            els.notesSubtitle.textContent = "mean IoU";
            els.notesTutorial.innerHTML = `<p>每类 IoU = ∩ / ∪，再对类别求平均。像素级 mask 重叠。</p>`;
            els.notes.innerHTML = `<dl><div><dt>mIoU</dt><dd>${mask ? `${fcnMeanIoU(mask).toFixed(1)}%` : "--"}</dd></div><div><dt>类别数</dt><dd>${mask?.classes?.length || "--"}</dd></div><div><dt>公式</dt><dd class="katex-math" data-latex="\\mathrm{mIoU} = \\dfrac{1}{C} \\sum_{c=1}^{C} \\dfrac{|P_c \\cap G_c|}{|P_c \\cup G_c|}"></dd></div></dl>`;
        } else {
            els.notesTitle.textContent = "Image";
            els.notesSubtitle.textContent = "H×W×3 input";
            els.notesTutorial.innerHTML = `<p>每个像素预测一个 class id，输出 H×W class map。</p>`;
            els.notes.innerHTML = `<dl><div><dt>Source</dt><dd>${mask?.source === "model" ? "Frontend Model" : "Preset Mask"}</dd></div><div><dt>图像尺寸</dt><dd>${s ? `${s.width} × ${s.height}` : "--"}</dd></div><div><dt>输出</dt><dd>H × W class index map</dd></div></dl>`;
        }
        renderKaTeXIn(els.notes);
    }

    function renderKaTeXIn(container) {
        if (!container) return;
        container.querySelectorAll(".katex-math").forEach((node) => {
            renderFormula(node.dataset.latex || node.textContent, node);
        });
    }

    function sampler(mask) {
        const key = `${state.sampleId}:${mask.width}:${mask.height}:${els.image.currentSrc}`;
        if (state.sampler && state.samplerKey === key) return state.sampler;
        const canvas = document.createElement("canvas");
        canvas.width = mask.width;
        canvas.height = mask.height;
        const samplerCtx = canvas.getContext("2d", {willReadFrequently: true});
        samplerCtx.drawImage(els.image, 0, 0, mask.width, mask.height);
        state.sampler = samplerCtx;
        state.samplerKey = key;
        return samplerCtx;
    }

    function probe(event) {
        const mask = state.currentMask;
        if (!mask) return;
        const rect = els.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            els.probe.innerHTML = `<strong>坐标映射</strong><span>图像像素重定位超出视口边界</span>`;
            return;
        }
        const x = Math.max(0, Math.min(mask.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * mask.width)));
        const y = Math.max(0, Math.min(mask.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * mask.height)));
        const index = y * mask.width + x;
        const id = mask.classMap[index];
        const info = id !== UNKNOWN ? classById(mask, id) : null;
        let rgb = "--";
        try {
            const pixel = sampler(mask).getImageData(x, y, 1, 1).data;
            rgb = `${pixel[0]}, ${pixel[1]}, ${pixel[2]}`;
        } catch (error) {
            rgb = "读取失败";
        }
        const score = mask.scoreMap?.[index];
        const hasRealScore = Number.isFinite(score);
        state.probeInfo = {
            x,
            y,
            rgb,
            classId: info ? info.id : "--",
            className: info ? label(info) : "未命中",
            score: hasRealScore ? score.toFixed(3) : "--",
            color: info?.color || "#94a3b8"
        };
        const left = Math.max(12, Math.min(rect.width - 244, event.clientX - rect.left + 14));
        const top = Math.max(12, Math.min(rect.height - 180, event.clientY - rect.top + 14));
        els.probe.style.setProperty("--probe-left", `${left}px`);
        els.probe.style.setProperty("--probe-top", `${top}px`);
        els.probe.innerHTML = `<strong>像素微观探针探测器</strong>
            <span>Pixel (x, y): ${x}, ${y}</span>
            <span>RGB: ${esc(rgb)}</span>
            <span>class: <b style="color:${esc(state.probeInfo.color)}">${esc(state.probeInfo.className)}</b></span>
            <span>confidence: ${esc(state.probeInfo.score)}</span>
            <span>mask color: <i style="background:${esc(state.probeInfo.color)}"></i>${esc(state.probeInfo.color)}</span>`;
        renderNotes();
    }

    function clearProbe() {
        state.probeInfo = null;
        els.probe.innerHTML = `<strong>像素微观探针探测器</strong><span>移动鼠标读取 x,y、RGB、当前像素类别、置信度和最终 mask 颜色。</span>`;
        renderNotes();
    }

    function renderAll(resetClasses = false) {
        renderImage();
        activateMask(currentUsableMask(), resetClasses);
        if (state.currentMask?.source === "fcn") {
            setPhase("image");
        } else {
            setPhase(state.currentMask?.source === "model" ? "miou" : "image");
        }
    }

    function renderSamplePicker() {
        const samples = state.data?.samples || [];
        if (!els.sampleGrid) return;
        els.sampleGrid.innerHTML = samples.map((item) => `
            <button type="button" class="vis-sample-picker__card${item.id === state.sampleId ? " is-active" : ""}" data-sem-sample-card="${esc(item.id)}">
                <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">
                <span>${esc(item.name)}</span>
            </button>
        `).join("");
        els.sampleGrid.querySelectorAll("[data-sem-sample-card]").forEach((button) => {
            button.addEventListener("click", () => {
                if (button.dataset.semSampleCard === state.sampleId) {
                    closeSamplePicker();
                    return;
                }
                selectSample(button.dataset.semSampleCard);
                closeSamplePicker();
            });
        });
        updateSampleLabel();
    }

    function updateSampleLabel() {
        const s = state.data?.samples.find((item) => item.id === state.sampleId);
        if (els.sampleLabel) els.sampleLabel.textContent = s ? s.name : "选择示例图";
    }

    function closeSamplePicker() { els.sample?.classList.remove("is-open"); }
    function toggleSamplePicker() { els.sample?.classList.toggle("is-open"); }

    function selectSample(sampleId) {
        state.sampleId = sampleId;
        state.probeInfo = null;
        if (state.selectedSource === "preset") state.selectedSource = "model";
        renderSamplePicker();
        renderAll(true);
        clearProbe();
        state.fcnMask = null;
        if (state.selectedSource === "model") runModel();
    }

    fetch(`${dataRoot}/overview/semantic_samples.json?v=20260625-samples4`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            renderSamplePicker();
            syncProcessConsole();
            renderAll(true);
            clearProbe();
            // 自动运行或加载模型推理
            if (state.selectedSource === "model") runModel();
        })
        .catch(() => {
            els.probe.innerHTML = `<strong>样例数据加载失败</strong>`;
        });

    els.sampleTrigger?.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSamplePicker();
    });
    document.addEventListener("click", (e) => {
        if (!els.sample?.contains(e.target)) closeSamplePicker();
    });

    els.sourceButtons.forEach((button) => button.addEventListener("click", () => {
        state.selectedSource = button.dataset.semSource;
        state.probeInfo = null;
        clearProbe();
        if (state.selectedSource === "model") {
            renderAll(true);
            runModel();
            return;
        }
        renderAll(true);
    }));

    els.fcnStages.forEach((item) => item.addEventListener("click", () => {
        if (state.selectedSource !== "fcn") return;
        setPhase(item.dataset.fcnStage);
    }));

    els.stepperItems.forEach((item) => item.addEventListener("click", () => {
        if (state.playing) stopPlayback();
        setPhase(item.dataset.semPhase);
    }));
    if (els.playToggle) {
        els.playToggle.addEventListener("click", () => {
            if (!state.playing && phaseIndex(state.phase) >= processSteps.length - 1) {
                setPhase("image");
            }
            togglePlayback();
        });
    }
    if (els.resetFlow) {
        els.resetFlow.addEventListener("click", () => {
            stopPlayback();
            setPhase("image");
        });
    }

    // view mode removed: overlay is the only mode, opacity slider controls mask visibility
    els.opacity.addEventListener("input", () => {
        state.opacity = Number(els.opacity.value) / 100;
        els.opacityOut.textContent = `${els.opacity.value}%`;
        draw();
    });
    els.boundaries.addEventListener("change", () => {
        state.boundaries = els.boundaries.checked;
        draw();
    });
    els.stage.addEventListener("mousemove", probe);
    els.stage.addEventListener("mouseleave", clearProbe);
    els.image.addEventListener("error", () => {
        els.missing.textContent = "图像加载失败，请检查静态资源。";
        setModelStatus(state.modelStatus, "图像加载失败，无法运行真实模型推理。");
    });

    // ==========================================================================
    // IoU (交并比) 算法教学微型交互模拟器控制逻辑
    // ==========================================================================
    const iouSlider = document.querySelector("[data-toy-slider]");
    const iouPredBox = document.querySelector("[data-toy-pred]");
    const iouInterBox = document.querySelector("[data-toy-intersection]");
    const iouOffText = document.querySelector("[data-toy-offset-text]");
    const iouMathInter = document.querySelector("[data-toy-math-inter]");
    const iouMathUnion = document.querySelector("[data-toy-math-union]");
    const iouMathFormula = document.querySelector("[data-toy-formula]");

    function updateIoUToy() {
        if (!iouSlider || !iouPredBox || !iouInterBox) return;
        const val = Number(iouSlider.value); // 0 到 100 的偏移百分比值
        
        // 映射设定：
        // GT 固定于 left = 50px ($50), width = 60px ($60) [区间 50 ~ 110]
        // Pred 固定于 width = 60px ($60)；left 随 value 增加从左向右平移 (偏移范围 0px 到 100px)
        const offsetPx = (val / 100) * 100;
        const gtLeft = 50;
        const gtWidth = 60;
        const predWidth = 60;
        const predLeft = gtLeft + offsetPx;
        
        // 更新 Pred 盒子的 UI 坐标
        iouPredBox.style.left = `${predLeft}px`;
        
        // 计算重叠宽度
        const overlapLeft = Math.max(gtLeft, predLeft);
        const overlapRight = Math.min(gtLeft + gtWidth, predLeft + predWidth);
        const overlapWidth = Math.max(0, overlapRight - overlapLeft);
        
        // 计算面积 (高度统一定为 54px)
        const height = 54;
        const gtArea = gtWidth * height; // 3240
        const predArea = predWidth * height; // 3240
        
        const intersectionArea = overlapWidth * height;
        const unionArea = gtArea + predArea - intersectionArea;
        const iou = unionArea > 0 ? (intersectionArea / unionArea) : 0;
        
        // 更新 Overlap 盒子的 UI
        if (overlapWidth > 0) {
            iouInterBox.style.display = "flex";
            iouInterBox.style.left = `${overlapLeft}px`;
            iouInterBox.style.width = `${overlapWidth}px`;
        } else {
            iouInterBox.style.display = "none";
        }
        
        // 更新文本数据及渲染公式
        iouOffText.textContent = `${val}%`;
        iouMathInter.textContent = `${intersectionArea.toFixed(0)} px²`;
        iouMathUnion.textContent = `${unionArea.toFixed(0)} px²`;
        
        if (iouMathFormula) {
            if (window.katex) {
                try {
                    window.katex.render(`\\text{IoU} = \\frac{|\\text{GT} \\cap \\text{Pred}|}{|\\text{GT} \\cup \\text{Pred}|} = \\frac{${intersectionArea.toFixed(0)}}{${unionArea.toFixed(0)}} \\approx ${iou.toFixed(3)}`, iouMathFormula, {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (e) {
                    iouMathFormula.textContent = `IoU = |GT ∩ Pred| / |GT ∪ Pred| = ${intersectionArea.toFixed(0)} / ${unionArea.toFixed(0)} ≈ ${iou.toFixed(3)}`;
                }
            } else {
                iouMathFormula.textContent = `IoU = |GT ∩ Pred| / |GT ∪ Pred| = ${intersectionArea.toFixed(0)} / ${unionArea.toFixed(0)} ≈ ${iou.toFixed(3)}`;
            }
        }
    }

    if (iouSlider) {
        iouSlider.addEventListener("input", updateIoUToy);
        // 初始化计算一次
        updateIoUToy();
    }
}());
