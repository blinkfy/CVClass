(function () {
    const root = document.querySelector("[data-detection-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/detection_inference.js?v=20260625-det-flowdiff1");
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const initialParams = new URLSearchParams(window.location.search);
    function modeForPath() {
        if (window.location.pathname.endsWith("/rcnn")) return "rcnn";
        return "yolo";
    }
    const initialMode = ["yolo", "rcnn", "roi", "rpn"].includes(initialParams.get("mode")) ? initialParams.get("mode") : modeForPath();
    const forcePresetSource = initialParams.get("source") === "preset";
    const initialFocusStep = {
        preprocess: 1,
        inference: 2,
        decode: 3,
        confidence: 4,
        nms: 5,
        final: 999
    }[initialParams.get("focus")] ?? 0;
    const state = {
        data: null,
        rcnnData: null,
        sampleId: "",
        source: forcePresetSource ? "preset" : "inference",
        detMode: initialMode,
        conf: 0.25,
        iou: 0.5,
        showLow: true,
        classes: new Set(),
        step: initialFocusStep,
        rcnnStep: 0,
        playing: false,
        timer: null,
        backend: "wasm",
        activeBackend: "--",
        modelStatus: "未加载",
        inferenceClient: null,
        inferenceModule: null,
        inferenceScene: null,
        inferenceResult: null,
        inferenceError: null,
        customUrl: null,
        autoToken: 0,
        fallbackReason: "",
        hoveredProposalId: null,
        selectedDetectionId: null,
        nmsAnimationStep: 0,
        heatmapType: "auto",
        heatmapClass: "all",
        heatmapAlpha: 0.55,
        imageRect: {left: 0, top: 0, width: 100, height: 100},
        imageSampler: {src: "", canvas: null, ctx: null, width: 0, height: 0, ready: false}
    };
    const els = {
        sample: $("[data-det-sample-picker]"),
        sampleTrigger: $("[data-det-sample-trigger]"),
        sampleLabel: $("[data-det-sample-label]"),
        sampleGrid: $("[data-det-sample-grid]"),
        upload: $("[data-det-upload]"),
        modeButtons: $$("[data-det-mode]"),
        sourceReadout: $("[data-det-source-readout]"),
        backend: $("[data-det-backend]"),
        modelStatus: $("[data-det-model-status]"),
        inputSize: $("[data-det-input-size]"),
        inferenceTime: $("[data-det-inference-time]"),
        postprocessTime: $("[data-det-postprocess-time]"),
        activeBackend: $("[data-det-active-backend]"),
        inferenceMessage: $("[data-det-inference-message]"),
        conf: $("[data-det-conf]"),
        confOut: $("[data-det-conf-output]"),
        iou: $("[data-det-iou]"),
        iouOut: $("[data-det-iou-output]"),
        showLow: $("[data-det-show-low]"),
        classFilter: $("[data-det-class-filter]"),
        total: $("[data-det-total]"),
        kept: $("[data-det-kept]"),
        image: $("[data-det-image]"),
        missing: $("[data-det-missing]"),
        overlay: $("[data-det-overlay]"),
        featureView: $("[data-det-feature-view]"),
        rcnnStage: $("[data-det-rcnn-stage]"),
        sourceNote: $("[data-det-source-note]"),
        notes: $("[data-det-notes]"),
        notesTutorial: $("[data-det-notes-tutorial]"),
        notesTitle: document.getElementById("detNotesTitle"),
        notesSubtitle: document.getElementById("detNotesSubtitle"),
        stepLabel: $("[data-det-step-label]"),
        prev: $("[data-det-prev]"),
        next: $("[data-det-next]"),
        play: $("[data-det-play]"),
        stageSource: $("[data-det-stage-source]"),
        stageBackend: $("[data-det-stage-backend]"),
        stageInference: $("[data-det-stage-inference]"),
        stageCandidates: $("[data-det-stage-candidates]"),
        stageFinal: $("[data-det-stage-final]"),
        candidateTable: $("[data-det-candidate-table]"),
        runtimeStats: $("[data-det-runtime-stats]"),
        classStats: $("[data-det-class-stats]"),
        pipeline: $("[data-det-pipeline]"),
        pairCard: $("[data-det-pair-card]"),
        nmsControl: $("[data-det-nms-control]"),
        heatmapType: $("[data-det-heatmap-type]"),
        heatmapClass: $("[data-det-heatmap-class]"),
        heatmapAlpha: $("[data-det-heatmap-alpha]"),
        heatmapAlphaOut: $("[data-det-heatmap-alpha-output]"),
        tableTitle: $("[data-det-table-title]"),
        courseStep: $("[data-det-course-step]"),
        courseGoal: $("[data-det-course-goal]"),
        courseActive: $("[data-det-course-active]"),
        courseState: $("[data-det-course-state]"),
        courseSummary: $("[data-det-course-summary]"),
        stepper: document.querySelector("[data-det-stepper]"),
        stepperItems: [...document.querySelectorAll("[data-det-stepper] [data-det-phase]")]
    };

    const yoloStepper = [
        {id: "image", title: "图像", detail: "图像已载入"},
        {id: "preprocess", title: "预处理", detail: "等比缩放填充"},
        {id: "inference", title: "推理", detail: "ONNX 前向"},
        {id: "decode", title: "解码", detail: "rawOutput 转框"},
        {id: "confidence", title: "置信度", detail: "分数阈值"},
        {id: "nms", title: "NMS", detail: "IoU 矩阵"},
        {id: "final", title: "最终框", detail: "检测结果"}
    ];

    const yoloDecodePipeline = [
        {id: "raw", title: "rawOutput [1,84,8400]", detail: "84 = xywh + 80 类别分数"},
        {id: "points", title: "候选点", detail: "8400 个密集位置"},
        {id: "xywh", title: "xywh + 类别分数", detail: "每点取最高类别"},
        {id: "threshold", title: "置信度阈值", detail: "丢弃低分框"},
        {id: "nms", title: "NMS", detail: "按 IoU 抑制"},
        {id: "final", title: "最终检测框", detail: "N 个检测结果"}
    ];

    const modeSteppers = {
        rcnn: [
            {id: "image", title: "图像", detail: "输入"},
            {id: "proposals", title: "候选框", detail: "Selective Search"},
            {id: "crop", title: "裁剪 / ROI", detail: "裁剪与归一化"},
            {id: "features", title: "CNN 特征", detail: "单个 proposal"},
            {id: "classifier", title: "分类器", detail: "类别得分"},
            {id: "regression", title: "边界框回归", detail: "修正框"},
            {id: "nms", title: "NMS", detail: "去重"}
        ],
        roi: [
            {id: "image", title: "图像", detail: "候选框"},
            {id: "feature", title: "特征图", detail: "共享卷积"},
            {id: "roi", title: "ROI Pooling", detail: "quantized ROI"},
            {id: "head", title: "分类 + BBox", detail: "定长特征"},
            {id: "nms", title: "NMS", detail: "去重"}
        ],
        rpn: [
            {id: "image", title: "图像", detail: "输入"},
            {id: "feature", title: "特征图", detail: "滑动窗口"},
            {id: "anchors", title: "Anchors", detail: "每格 k 个框"},
            {id: "rpn", title: "RPN", detail: "objectness + offset"},
            {id: "proposals", title: "候选框", detail: "正样本 anchors"},
            {id: "head", title: "Fast R-CNN 头", detail: "分类 + bbox"},
            {id: "final", title: "最终框", detail: "NMS 输出"}
        ]
    };

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function idText(id) {
        return String(id ?? "");
    }

    function activeSpotlightId() {
        return state.hoveredProposalId || state.selectedDetectionId;
    }

    function spotlightClassFor(id) {
        const activeId = activeSpotlightId();
        if (!activeId) return "";
        return idText(id) === idText(activeId) ? "is-spotlight" : "is-dimmed";
    }

    function renderLatex(tex) {
        if (window.katex?.renderToString) {
            return window.katex.renderToString(tex, {throwOnError: false, strict: false});
        }
        return esc(tex);
    }

    function num(value, digits = 2) {
        return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "--";
    }

    function xyxyToRect(bbox = []) {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = bbox;
        return {
            x: x1,
            y: y1,
            w: Math.max(0, x2 - x1),
            h: Math.max(0, y2 - y1),
            x2,
            y2
        };
    }

    function boxCenter(box) {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = box?.bbox || [];
        return {
            x: (x1 + x2) / 2,
            y: (y1 + y2) / 2
        };
    }

    function pointPercent(point, sample) {
        return {
            x: Math.max(0, Math.min(100, (point.x / Math.max(1, sample.width)) * 100)),
            y: Math.max(0, Math.min(100, (point.y / Math.max(1, sample.height)) * 100))
        };
    }

    function activeImageRect() {
        return state.imageRect || {left: 0, top: 0, width: 100, height: 100};
    }

    function updateImageRenderRect(sample = {}) {
        if (!els.image) return activeImageRect();
        const stage = els.image.closest(".detection-real-stage");
        if (!stage) return activeImageRect();
        const stageWidth = stage.clientWidth || 0;
        const stageHeight = stage.clientHeight || 0;
        if (!stageWidth || !stageHeight) {
            state.imageRect = {left: 0, top: 0, width: 100, height: 100};
            return state.imageRect;
        }

        const imageReady = els.image.complete && els.image.naturalWidth && els.image.naturalHeight;
        const imageWidth = imageReady ? els.image.naturalWidth : (sample.width || stageWidth);
        const imageHeight = imageReady ? els.image.naturalHeight : (sample.height || stageHeight);
        const fit = getComputedStyle(els.image).objectFit || "contain";
        let drawWidth = stageWidth;
        let drawHeight = stageHeight;
        let offsetLeft = 0;
        let offsetTop = 0;

        if (fit === "contain" && imageWidth && imageHeight) {
            const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
            drawWidth = imageWidth * scale;
            drawHeight = imageHeight * scale;
            offsetLeft = (stageWidth - drawWidth) / 2;
            offsetTop = (stageHeight - drawHeight) / 2;
        }

        state.imageRect = {
            left: (offsetLeft / stageWidth) * 100,
            top: (offsetTop / stageHeight) * 100,
            width: (drawWidth / stageWidth) * 100,
            height: (drawHeight / stageHeight) * 100
        };
        stage.style.setProperty("--det-img-left", `${state.imageRect.left}%`);
        stage.style.setProperty("--det-img-top", `${state.imageRect.top}%`);
        stage.style.setProperty("--det-img-width", `${state.imageRect.width}%`);
        stage.style.setProperty("--det-img-height", `${state.imageRect.height}%`);
        return state.imageRect;
    }

    function imagePointPercent(point, sample) {
        const p = pointPercent(point, sample);
        const rect = activeImageRect();
        return {
            x: rect.left + (rect.width * p.x) / 100,
            y: rect.top + (rect.height * p.y) / 100
        };
    }

    function imageRectStyle(x, y, w, h, width, height) {
        const rect = activeImageRect();
        const x1 = Math.max(0, Math.min(width, x));
        const y1 = Math.max(0, Math.min(height, y));
        const x2 = Math.max(0, Math.min(width, x + w));
        const y2 = Math.max(0, Math.min(height, y + h));
        const left = rect.left + rect.width * (Math.min(x1, x2) / Math.max(1, width));
        const top = rect.top + rect.height * (Math.min(y1, y2) / Math.max(1, height));
        const boxWidth = rect.width * (Math.abs(x2 - x1) / Math.max(1, width));
        const boxHeight = rect.height * (Math.abs(y2 - y1) / Math.max(1, height));
        return `left:${left}%;top:${top}%;width:${boxWidth}%;height:${boxHeight}%;`;
    }

    function centerStyle(box, sample, extra = "") {
        const p = imagePointPercent(boxCenter(box), sample);
        return `left:${p.x}%;top:${p.y}%;${extra}`;
    }

    function renderStagePulses(boxes, sample, className = "") {
        return boxes.slice(0, 12).map((box, index) => {
            const color = colorFor(box);
            return `<i class="det-algo-pulse ${esc(className)}" style="${centerStyle(box, sample, `--delay:${index * 70}ms;--pulse-color:${esc(color)};`)}"></i>`;
        }).join("");
    }

    function flowLinePoints(aBox, bBox, sample) {
        const a = boxCenter(aBox);
        const b = boxCenter(bBox);
        return {
            a,
            b,
            mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
            ap: imagePointPercent(a, sample),
            bp: imagePointPercent(b, sample),
            mp: imagePointPercent({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, sample)
        };
    }

    function activeRcnnProposal(demo) {
        const proposals = demo?.proposals || [];
        const activeId = activeSpotlightId();
        return proposals.find((proposal) => idText(proposal.id) === idText(activeId)) || proposals[0] || {};
    }

    function comparisonForNms(result, step) {
        return step?.comparison || result?.comparisons?.[0] || null;
    }

    function applySpotlightState() {
        const activeId = activeSpotlightId();
        root.classList.toggle("is-spotlight-active", Boolean(activeId));
        root.querySelectorAll("[data-det-related-id], [data-det-hover-id]").forEach((node) => {
            const nodeId = node.dataset.detRelatedId || node.dataset.detHoverId;
            const isActive = activeId && idText(nodeId) === idText(activeId);
            node.classList.toggle("is-spotlight", Boolean(isActive));
            node.classList.toggle("is-dimmed", Boolean(activeId && !isActive));
        });
    }

    function setHoveredProposal(id) {
        const nextId = id ? idText(id) : null;
        if (state.hoveredProposalId === nextId) return;
        state.hoveredProposalId = nextId;
        if (state.detMode === "rcnn") {
            renderRcnnMode();
            return;
        }
        if (state.data) {
            const result = compute();
            const step = result.steps[Math.min(state.step, result.steps.length - 1)] || result.steps[0];
            if (step) {
                renderYoloFeatureView(step, result);
                renderNotes(step, result);
            }
        }
        applySpotlightState();
    }

    function updateModeButtons() {
        els.modeButtons.forEach((button) => {
            const active = button.dataset.detMode === state.detMode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function setStepper(items, activeId) {
        if (!els.stepper) return;
        els.stepper.innerHTML = items.map((item, index) => `
            <li data-det-phase="${esc(item.id)}" class="${item.id === activeId ? "is-active" : ""}">
                <span>${index + 1}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div>
            </li>
        `).join("");
        els.stepperItems = [...els.stepper.querySelectorAll("[data-det-phase]")];
    }

    function setModeTheme(mode) {
        root.dataset.detModeView = mode === "yolo" ? "yolo" : "rcnn";
        root.dataset.detSubmode = mode;
    }

    function rawOutputShapeText() {
        const shape = state.inferenceResult?.rawOutputShape;
        return shape?.length ? `[${shape.join(", ")}]` : "[1, 84, 8400]";
    }

    function rawOutputShapeNote() {
        return state.inferenceResult?.rawOutputShape?.length ? rawOutputShapeText() : `${rawOutputShapeText()} expected`;
    }

    function findBoxById(boxes, id) {
        return boxes.find((box) => box.id === id) || null;
    }

    function renderYoloDecodePipeline(step, result) {
        if (!els.pipeline) return;
        const counts = yoloCounts(result);
        const activeIndexByPhase = {
            image: -1,
            preprocess: -1,
            inference: 0,
            decode: 2,
            confidence: 3,
            nms: 4,
            final: 5
        };
        const activeIndex = activeIndexByPhase[step.phase] ?? 0;
        els.pipeline.hidden = false;
        els.pipeline.innerHTML = `
            <div class="det-output-pipeline-head">
                <span>模型输出解码</span>
                <strong>${esc(rawOutputShapeText())} → 最终检测框</strong>
                <em>${counts.decoded} 已解码 / ${counts.final} 最终保留</em>
            </div>
            <div class="det-output-pipeline-track">
                ${yoloDecodePipeline.map((item, index) => `
                    <article class="${index < activeIndex ? "is-done" : ""} ${index === activeIndex ? "is-current" : ""}">
                        <span>${index + 1}</span>
                        <strong>${esc(item.title)}</strong>
                        <small>${esc(item.detail)}</small>
                    </article>
                `).join("")}
            </div>`;
    }

    function boxStyle(box, width, height) {
        const [x1, y1, x2, y2] = box.bbox;
        return imageRectStyle(x1, y1, x2 - x1, y2 - y1, width, height);
    }

    function demoData() {
        return state.rcnnData || {};
    }

    function demoImageSample() {
        const s = selectedPresetSample();
        return { width: s?.width || demoData().image?.width || 640, height: s?.height || demoData().image?.height || 427, image: s?.image || "" };
    }

    function pinDetectionImageStage(sample) {
        if (!els.image) return;
        const stage = els.image.closest(".detection-real-stage");
        if (!stage) return;
        stage.style.setProperty("--det-aspect", `${Math.max(1, sample.width)} / ${Math.max(1, sample.height)}`);
        const rawRatio = Math.max(1, sample.width) / Math.max(1, sample.height);
        stage.style.setProperty("--det-aspect-raw-x", rawRatio.toFixed(3));
        stage.hidden = false;
        stage.removeAttribute("hidden");
        stage.dataset.detPinnedImage = "true";
    }

    function syncDetectionImage(sample) {
        pinDetectionImageStage(sample);
        if (!sample.image) return;
        const nextSrc = sample.image.startsWith("blob:") ? sample.image : window.cvclassUrl(sample.image);
        if (els.image.getAttribute("src") !== nextSrc) {
            els.image.src = nextSrc;
        }
    }

    function activeRcnnSteps() {
        return modeSteppers[state.detMode] || modeSteppers.rcnn;
    }

    function activeRcnnStep() {
        const steps = activeRcnnSteps();
        state.rcnnStep = Math.max(0, Math.min(state.rcnnStep, steps.length - 1));
        return steps[state.rcnnStep] || steps[0];
    }

    function selectedPresetSample() {
        return state.data.samples.find((item) => item.id === state.sampleId) || state.data.samples[0];
    }

    function sceneFromPreset(sample, boxes = []) {
        return {
            id: `inference_${sample.id}`,
            name: `${sample.name} · ONNX`,
            image: sample.image,
            width: sample.width,
            height: sample.height,
            boxes,
            confidence_判定目标置信度阈值: sample.confidence_threshold || 0.25,
            nms_iou_判定目标置信度阈值: sample.nms_iou_threshold || 0.5
        };
    }

    function currentScene() {
        if (state.source === "preset") return selectedPresetSample();
        if (!state.inferenceScene) state.inferenceScene = sceneFromPreset(selectedPresetSample(), []);
        return state.inferenceScene;
    }

    function candidatePoolFromInference(result) {
        const raw = Array.isArray(result?.rawCandidates) && result.rawCandidates.length ? result.rawCandidates : result?.boxes;
        const selected = (Array.isArray(raw) ? raw : [])
            .filter((box) => Array.isArray(box.bbox) && Number.isFinite(box.score))
            .sort((a, b) => b.score - a.score)
            .slice(0, 220);
        const keys = new Set();
        const keyFor = (box) => `${box.class}|${box.bbox.map((v) => Math.round(v)).join(",")}`;
        const deduped = [];
        selected.forEach((box) => {
            const key = keyFor(box);
            if (keys.has(key)) return;
            keys.add(key);
            deduped.push({...box});
        });

        return deduped.map((box, index) => ({...box, id: index + 1}));
    }

    function colorFor(box) {
        return box.color || state.data.classes[box.class] || "#2563eb";
    }

    function area(box) {
        const [x1, y1, x2, y2] = box.bbox;
        return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    }

    function intersection(a, b) {
        const [ax1, ay1, ax2, ay2] = a.bbox;
        const [bx1, by1, bx2, by2] = b.bbox;
        const x1 = Math.max(ax1, bx1);
        const y1 = Math.max(ay1, by1);
        const x2 = Math.min(ax2, bx2);
        const y2 = Math.min(ay2, by2);
        const width = Math.max(0, x2 - x1);
        const height = Math.max(0, y2 - y1);
        return {x1, y1, x2, y2, width, height, area: width * height};
    }

    function iou(a, b) {
        const inter = intersection(a, b);
        const union = area(a) + area(b) - inter.area;
        return union > 0 ? inter.area / union : 0;
    }

    function cloneSet(set) {
        return new Set([...set]);
    }

    function makeStep(type, phase, message, extra = {}, keptIds = new Set(), suppressedIds = new Set(), lowIds = new Set(), candidates = []) {
        return {
            type,
            phase,
            currentBoxId: null,
            compareBoxId: null,
            iou: null,
            decision: "",
            message,
            keptIds: cloneSet(keptIds),
            suppressedIds: cloneSet(suppressedIds),
            lowIds: cloneSet(lowIds),
            candidateIds: new Set(candidates.map((box) => box.id)),
            ...extra
        };
    }

    function compute() {
        const s = currentScene();
        const boxes = Array.isArray(s.boxes) ? s.boxes : [];
        const classAllowed = (box) => state.classes.size === 0 || state.classes.has(box.class);
        const visibleBoxes = boxes.filter(classAllowed);
        const low = visibleBoxes.filter((box) => box.score < state.conf);
        const lowIds = new Set(low.map((box) => box.id));
        const candidates = visibleBoxes.filter((box) => box.score >= state.conf).sort((a, b) => b.score - a.score);
        const candidateIds = new Set(candidates.map((box) => box.id));
        const kept = [];
        const keptIds = new Set();
        const suppressed = new Map();
        const suppressedIds = new Set();
        const comparisons = [];
        const steps = [
            makeStep("image", "image", "输入图像已载入，下一步进行 letterbox 与张量构建。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("preprocess", "preprocess", "执行 letterbox、张量归一化，并把 HWC 布局转为 CHW。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("inference", "inference", "ONNX Runtime Web 已输出 raw tensor。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("decode", "decode", "把 rawOutput 位置解码为 xywh 框和类别分数。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("confidence", "confidence", "先按置信度阈值筛分候选框，再送入 NMS。", {}, keptIds, suppressedIds, lowIds, candidates)
        ];

        for (const box of candidates) {
            let deletedBy = null;
            let compared = false;
            for (const keep of kept) {
                if (keep.class !== box.class) continue;
                compared = true;
                const score = iou(keep, box);
                const inter = intersection(keep, box);
                const comparison = {
                    a: keep,
                    b: box,
                    iou: score,
                    inter,
                    union: area(keep) + area(box) - inter.area,
                    suppress: score >= state.iou
                };
                comparisons.push(comparison);
                steps.push(makeStep("compare", "nms", `用 IoU 比较框 A #${keep.id} 与框 B #${box.id}。`, {
                    currentBoxId: keep.id,
                    compareBoxId: box.id,
                    iou: score,
                    decision: "compare",
                    comparison
                }, keptIds, suppressedIds, lowIds, candidates));
                if (score >= state.iou) {
                    deletedBy = keep;
                    suppressed.set(box.id, keep.id);
                    suppressedIds.add(box.id);
                    steps.push(makeStep("suppress", "nms", `IoU ${score.toFixed(3)} >= 阈值 ${state.iou.toFixed(2)}；抑制框 B。`, {
                        currentBoxId: keep.id,
                        compareBoxId: box.id,
                        iou: score,
                        decision: "suppress",
                        comparison
                    }, keptIds, suppressedIds, lowIds, candidates));
                    break;
                }
                steps.push(makeStep("keep", "nms", `IoU ${score.toFixed(3)} < 阈值 ${state.iou.toFixed(2)}；暂时保留框 B。`, {
                    currentBoxId: keep.id,
                    compareBoxId: box.id,
                    iou: score,
                    decision: "keep",
                    comparison
                }, keptIds, suppressedIds, lowIds, candidates));
            }
            if (!deletedBy) {
                kept.push(box);
                keptIds.add(box.id);
                if (!compared) {
                    steps.push(makeStep("keep", "nms", `框 #${box.id} 没有更高分同类框需要比较，直接保留。`, {
                        currentBoxId: box.id,
                        decision: "keep"
                    }, keptIds, suppressedIds, lowIds, candidates));
                }
            }
        }

        steps.push(makeStep("final", "final", "NMS 后处理完成，输出最终检测框。", {}, keptIds, suppressedIds, lowIds, candidates));
        return {sample: s, boxes: visibleBoxes, low, candidates, candidateIds, kept, keptIds, suppressed, suppressedIds, comparisons, steps};
    }

    function statusForBox(box, step, result) {
        if (["inference", "decode"].includes(step.phase)) return "raw";
        if (["image", "preprocess"].includes(step.phase)) return "raw";
        if (step.lowIds.has(box.id)) return "low";
        if (step.type === "decode") return "raw";
        if (step.type === "confidence" || ["image", "preprocess", "inference"].includes(step.type)) {
            return result.candidateIds.has(box.id) ? "candidate" : "low";
        }
        if (step.type === "final") {
            if (step.suppressedIds.has(box.id)) return "suppressed";
            if (step.keptIds.has(box.id)) return "kept";
            return result.candidateIds.has(box.id) ? "candidate" : "low";
        }
        if (step.type === "suppress" && step.suppressedIds.has(box.id)) return "suppressed";
        if (step.compareBoxId === box.id) return "compare-b";
        if (step.currentBoxId === box.id) return "compare-a";
        if (step.suppressedIds.has(box.id)) return "suppressed";
        if (step.keptIds.has(box.id)) return "candidate";
        return result.candidateIds.has(box.id) ? "candidate" : "low";
    }

    function tableStatusFor(status, step, box) {
        if (status === "raw") return "raw";
        if (status === "low") return "low-confidence";
        if (status === "compare-a" || status === "compare-b") return "comparing";
        if (status === "suppressed") return "suppressed";
        if (status === "kept") return "kept";
        if (step.type === "keep" && step.currentBoxId === box.id) return "kept";
        return "candidate";
    }

    function tableStatusLabel(status) {
        return {
            raw: "原始候选",
            "low-confidence": "低分过滤",
            comparing: "正在比较",
            suppressed: "NMS 抑制",
            kept: "最终保留",
            candidate: "候选框"
        }[status] || status;
    }

    function boxMarkup(box, s, status) {
        const label = status === "low" ? `${box.class} ${box.score.toFixed(2)} 已过滤` : `${box.class} ${box.score.toFixed(2)}`;
        const spotlightClass = spotlightClassFor(box.id);
        return `<div data-det-hover-id="${esc(box.id)}" data-det-related-id="${esc(box.id)}" class="vision-bbox vision-bbox--${status} ${spotlightClass}" style="${boxStyle(box, s.width, s.height)}--box-color:${esc(colorFor(box))}"><span>${esc(label)}</span></div>`;
    }

    function overlayBoxesForStep(result, step) {
        const relatedIds = new Set([step.currentBoxId, step.compareBoxId].filter(Boolean));
        const byScore = result.boxes.slice().sort((a, b) => b.score - a.score);
        const picked = [];
        const pickedIds = new Set();
        const add = (box) => {
            if (!box || pickedIds.has(box.id)) return;
            pickedIds.add(box.id);
            picked.push(box);
        };
        relatedIds.forEach((id) => add(findBoxById(result.boxes, id)));

        if (["image", "preprocess"].includes(step.phase)) {
            byScore.slice(0, 16).forEach(add);
        } else if (step.phase === "inference" || step.phase === "decode") {
            byScore.forEach(add);
        } else if (step.phase === "confidence") {
            result.candidates.forEach(add);
            result.low.forEach(add);
        } else if (step.phase === "nms") {
            result.kept.forEach(add);
            byScore.filter((box) => step.suppressedIds.has(box.id)).forEach(add);
            result.candidates.forEach(add);
        } else if (step.type === "final") {
            result.kept.forEach(add);
        } else {
            result.candidates.forEach(add);
        }

        relatedIds.forEach((id) => add(findBoxById(result.boxes, id)));
        return picked;
    }

    function captureYoloStepPosition() {
        const steps = compute().steps;
        const step = steps[Math.min(state.step, steps.length - 1)] || steps[0];
        if (!step) return null;
        const phaseSteps = steps.filter((item) => item.phase === step.phase);
        return {
            phase: step.phase,
            type: step.type,
            phaseIndex: Math.max(0, phaseSteps.indexOf(step))
        };
    }

    function restoreYoloStepPosition(position) {
        if (!position) return;
        const steps = compute().steps;
        if (!steps.length) {
            state.step = 0;
            return;
        }
        if (position.phase === "final") {
            state.step = steps.length - 1;
            return;
        }
        const samePhase = steps
            .map((step, index) => ({step, index}))
            .filter((item) => item.step.phase === position.phase);
        if (!samePhase.length) {
            state.step = Math.min(state.step, steps.length - 1);
            return;
        }
        const sameType = samePhase.filter((item) => item.step.type === position.type);
        const pool = sameType.length ? sameType : samePhase;
        state.step = pool[Math.min(position.phaseIndex, pool.length - 1)].index;
    }

    function updateYoloThreshold(kind, value) {
        stop();
        if (state.detMode !== "yolo") {
            if (kind === "conf") state.conf = value;
            if (kind === "iou") state.iou = value;
            render();
            return;
        }
        const position = captureYoloStepPosition();
        if (kind === "conf") state.conf = value;
        if (kind === "iou") state.iou = value;
        restoreYoloStepPosition(position);
        render();
    }

    function renderSourceControls() {
        const fallback = state.source === "preset" && state.fallbackReason;
        const sourceText = state.source === "preset" ? (fallback ? "预设结果模式" : "预设结果模式") : "ONNX Runtime Web";
        els.sourceNote.textContent = sourceText;
        if (els.sourceReadout) {
            els.sourceReadout.textContent = sourceText;
            const container = els.sourceReadout.closest("[data-det-source-container]");
            if (container) {
                container.style.display = (state.source === "preset" && state.fallbackReason) ? "flex" : "none";
            }
        }
    }

    function setModelStatus(text, message) {
        state.modelStatus = text;
        els.modelStatus.textContent = text;
        if (message) els.inferenceMessage.textContent = message;
    }

    function yoloCounts(result) {
        const decoded = Array.isArray(result?.boxes) ? result.boxes.length : 0;
        const filteredRaw = Array.isArray(result?.candidates) ? result.candidates.length : 0;
        const finalRaw = Array.isArray(result?.kept) ? result.kept.length : 0;
        const filtered = Math.min(filteredRaw, decoded);
        const final = Math.min(finalRaw, filtered);
        return {decoded, filtered, final};
    }

    function renderRuntimeMetrics(result) {
        const inference = state.inferenceResult;
        const shape = rawOutputShapeNote();
        const source = state.source === "preset" ? "预设结果" : "ONNX Runtime Web";
        const counts = yoloCounts(result);
        els.inputSize.textContent = inference?.inputSize ? `${inference.inputSize} × ${inference.inputSize}` : "640 × 640";
        els.inferenceTime.textContent = Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--";
        els.postprocessTime.textContent = Number.isFinite(inference?.postprocessTime) ? `${inference.postprocessTime.toFixed(1)} ms` : "--";
        els.activeBackend.textContent = state.activeBackend || "--";
        els.stageSource.textContent = source;
        els.stageBackend.textContent = `后端: ${state.activeBackend || "--"}`;
        els.stageInference.textContent = `推理耗时: ${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}`;
        els.stageCandidates.textContent = `候选框: ${counts.decoded}`;
        els.stageFinal.textContent = `最终框: ${counts.final}`;
        els.runtimeStats.innerHTML = `
            <div><dt>rawOutputShape</dt><dd>${esc(shape)}</dd></div>
            <div><dt>向量布局</dt><dd>4 xywh + 80 类别分数</dd></div>
            <div><dt>全景特征点空间总候选数</dt><dd>8400 个密集位置</dd></div>
            <div><dt>解码候选框数</dt><dd>${counts.decoded}</dd></div>
            <div><dt>过置信度阈值框数</dt><dd>${counts.filtered}</dd></div>
            <div><dt>NMS 最终保留框数</dt><dd>${counts.final}</dd></div>
            <div><dt>预处理耗时</dt><dd>${Number.isFinite(inference?.preprocessTime) ? `${inference.preprocessTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>推理耗时</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>后处理耗时</dt><dd>${Number.isFinite(inference?.postprocessTime) ? `${inference.postprocessTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>激活后端</dt><dd>${esc(state.activeBackend || "--")}</dd></div>`;
    }

    function renderClassStats(result) {
        const counts = new Map();
        result.kept.forEach((box) => counts.set(box.class, (counts.get(box.class) || 0) + 1));
        if (!counts.size) {
            els.classStats.textContent = "当前没有最终保留框。";
            return;
        }
        els.classStats.innerHTML = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `<span><i style="background:${esc(colorFor({class: name}))}"></i>${esc(name)}<strong>${count}</strong></span>`)
            .join("");
    }

    function renderCandidateTable(result, step) {
        if (els.tableTitle) els.tableTitle.textContent = "候选框队列";
        const relatedIds = new Set([step.currentBoxId, step.compareBoxId].filter(Boolean));
        const sorted = result.boxes
            .slice()
            .sort((a, b) => b.score - a.score);
        const display = [];
        sorted.forEach((box) => {
            if (relatedIds.has(box.id)) display.push(box);
        });
        sorted.forEach((box) => {
            if (display.length >= 8) return;
            if (!display.some((item) => item.id === box.id)) display.push(box);
        });
        const rows = display
            .map((box) => {
                const status = tableStatusFor(statusForBox(box, step, result), step, box);
                const active = relatedIds.has(box.id);
                const isKept = step.keptIds.has(box.id);
                const isSuppressed = step.suppressedIds.has(box.id);
                const rowClasses = [
                    `is-${status}`,
                    active ? "is-active-row" : "",
                    active ? "is-active" : "",
                    isKept ? "is-kept" : "",
                    isSuppressed ? "is-suppressed" : "",
                    spotlightClassFor(box.id)
                ].filter(Boolean).join(" ");
                return `<tr data-det-hover-id="${esc(box.id)}" data-det-related-id="${esc(box.id)}" class="${rowClasses}">
                    <td>${box.id}</td>
                    <td>${esc(box.class)}</td>
                    <td>${box.score.toFixed(3)}</td>
                    <td>[${box.bbox.join(", ")}]</td>
                    <td><span>${esc(tableStatusLabel(status))}</span></td>
                </tr>`;
            }).join("");
        els.candidateTable.innerHTML = rows || `<tr><td colspan="5">暂无候选框。</td></tr>`;
    }

    function renderPairCard(step) {
        if (!els.pairCard) return;
        const c = step.comparison;
        if (!c) {
            els.pairCard.hidden = true;
            els.pairCard.innerHTML = "";
            return;
        }
        els.pairCard.hidden = false;
        els.pairCard.innerHTML = `
            <div class="det-pair-card-head">
                <span>NMS 框对比较</span>
                <strong>A#${esc(c.a.id)} × B#${esc(c.b.id)}</strong>
                <em>${c.suppress ? "抑制" : "保留"}</em>
            </div>
            <div class="det-pair-card-grid">
                <article class="is-a"><span>框 A</span><strong>${esc(c.a.class)} · ${c.a.score.toFixed(3)}</strong><code>[${c.a.bbox.join(", ")}]</code></article>
                <article class="is-b"><span>框 B</span><strong>${esc(c.b.class)} · ${c.b.score.toFixed(3)}</strong><code>[${c.b.bbox.join(", ")}]</code></article>
                <dl>
                    <div><dt>交集面积</dt><dd>${Math.round(c.inter.area)} px²</dd></div>
                    <div><dt>并集面积</dt><dd>${Math.round(c.union)} px²</dd></div>
                    <div><dt>IoU</dt><dd>${c.iou.toFixed(3)}</dd></div>
                    <div><dt>IoU 阈值</dt><dd>${state.iou.toFixed(2)}</dd></div>
                    <div><dt>判定结果</dt><dd>${c.suppress ? "抑制框 B" : "保留框 B"}</dd></div>
                </dl>
            </div>`;
    }

    function renderNmsController(step, result) {
        if (!els.nmsControl) return;
        if (step.phase !== "nms") {
            els.nmsControl.hidden = true;
            els.nmsControl.innerHTML = "";
            return;
        }
        els.nmsControl.hidden = false;
        const c = comparisonForNms(result, step);
        const buttons = [
            [0, "停止", "重置"],
            [1, "置信度排序", "降序重新排列"],
            [2, "对比扫描", "从高分框A开始扫描"],
            [3, "交并比计算", "公式与两框重合度"],
            [4, "重叠抑制", "剔除低分重复框B"]
        ];
        els.nmsControl.innerHTML = `
            <div class="det-nms-control-head">
                <span>NMS 极慢速后处理动画演示</span>
                <strong>${c ? `A#${esc(c.a.id)} / B#${esc(c.b.id)} · IoU ${c.iou.toFixed(3)}` : "score-sorted scan"}</strong>
            </div>
            <div class="det-nms-control-actions">
                ${buttons.map(([id, label, detail]) => `<button type="button" data-det-nms-step="${id}" class="${state.nmsAnimationStep === id ? "is-active" : ""}"><b>${label}</b><small>${detail}</small></button>`).join("")}
            </div>`;
    }

    function renderNmsSlowMotionLayer(step, result, s) {
        if (step.phase !== "nms" || !state.nmsAnimationStep) return "";
        const c = comparisonForNms(result, step);
        if (!c) {
            return `<div class="det-nms-sort-badge"><span>1</span><strong>按置信度从高到低排序</strong><em>${result.candidates.length} 候选框</em></div>`;
        }
        const a = boxCenter(c.a);
        const b = boxCenter(c.b);
        const aPct = imagePointPercent(a, s);
        const bPct = imagePointPercent(b, s);
        const midPct = imagePointPercent({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, s);
        const radar = state.nmsAnimationStep >= 2
            ? `<div class="det-nms-radar" style="left:${aPct.x}%;top:${aPct.y}%;"></div>`
            : "";
        const link = state.nmsAnimationStep >= 3
            ? `<svg class="det-nms-link" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <defs><marker id="detNmsArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>
                    <line x1="${aPct.x}" y1="${aPct.y}" x2="${bPct.x}" y2="${bPct.y}" marker-end="url(#detNmsArrow)"></line>
                </svg>
                <div class="det-nms-iou-tooltip" style="left:${midPct.x}%;top:${midPct.y}%;">
                    <b>${renderLatex("IoU = \\frac{Area\\_of\\_Overlap}{Area\\_of\\_Union}")}</b>
                    <strong>IoU = ${c.iou.toFixed(3)}</strong>
                    <span>${c.iou >= state.iou ? `>= ${state.iou.toFixed(2)} 抑制` : `< ${state.iou.toFixed(2)} 保留`}</span>
                </div>`
            : "";
        const particles = state.nmsAnimationStep >= 4 && c.iou >= state.iou
            ? `<div class="det-nms-particles" style="left:${bPct.x}%;top:${bPct.y}%;">${Array.from({length: 10}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>`
            : "";
        return `<div class="det-nms-slow-layer">${radar}${link}${particles}</div>`;
    }

    function renderYoloStageMotion(step, result, sample) {
        const counts = yoloCounts(result);
        const c = comparisonForNms(result, step);
        const phase = step.phase || step.type || "image";
        const rawBoxes = result.boxes || [];
        const candidateBoxes = result.candidates || [];
        const keptBoxes = result.kept || [];
        const lowBoxes = result.low || [];
        let pulses = "";
        let flow = "";
        let chip = "";
        let particles = "";

        if (phase === "image") {
            chip = `<div class="det-algo-chip det-algo-chip--source">
                <b>图像输入</b><span>${sample.width} x ${sample.height} 像素进入检测流程</span>
            </div>`;
            particles = `<i class="det-algo-scan det-algo-scan--x"></i><i class="det-algo-scan det-algo-scan--y"></i>`;
        } else if (phase === "preprocess") {
            chip = `<div class="det-algo-chip det-algo-chip--source">
                <b>letterbox + 归一化</b><span>${sample.width} x ${sample.height} → 640 x 640 张量</span>
            </div>`;
            particles = `<i class="det-algo-scan det-algo-scan--x"></i><i class="det-algo-scan det-algo-scan--y"></i>`;
        } else if (phase === "decode" || phase === "inference") {
            const decodedPreview = candidateBoxes.length ? candidateBoxes : rawBoxes;
            pulses = renderStagePulses(decodedPreview, sample, "is-decode");
            const target = decodedPreview[0] || rawBoxes[0];
            if (target) {
                const center = imagePointPercent(boxCenter(target), sample);
                flow = `<svg class="det-algo-flow-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M 50 8 C 44 24, ${Math.max(8, center.x - 8).toFixed(1)} ${(center.y * 0.62).toFixed(1)}, ${center.x.toFixed(1)} ${center.y.toFixed(1)}"></path>
                </svg>`;
                chip = `<div class="det-algo-chip" style="left:${center.x}%;top:${Math.max(8, center.y - 14)}%;">
                    <b>解码</b><span>${esc(rawOutputShapeText())} → 候选框 #${esc(target.id)}</span>
                </div>`;
            } else {
                chip = `<div class="det-algo-chip det-algo-chip--source">
                    <b>${phase === "inference" ? "ONNX 前向" : "等待解码"}</b><span>${esc(rawOutputShapeText())} → 候选框</span>
                </div>`;
                particles = `<i class="det-algo-scan det-algo-scan--tensor"></i>`;
            }
        } else if (phase === "confidence") {
            pulses = renderStagePulses(candidateBoxes, sample, "is-candidate") + renderStagePulses(lowBoxes, sample, "is-low");
            chip = `<div class="det-algo-chip det-algo-chip--confidence">
                <b>置信度过滤</b><span>${counts.decoded} → ${counts.filtered}; θ=${state.conf.toFixed(2)}</span>
            </div>`;
            particles = lowBoxes.slice(0, 8).map((box, index) => `<i class="det-algo-shrink" style="${centerStyle(box, sample, `--delay:${index * 55}ms;`)}"></i>`).join("");
        } else if (phase === "nms" || step.type === "keep" || step.type === "suppress") {
            pulses = renderStagePulses(keptBoxes, sample, "is-kept");
            if (c) {
                const points = flowLinePoints(c.a, c.b, sample);
                flow = `<svg class="det-algo-flow-svg det-algo-flow-svg--nms" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="${points.ap.x}" y1="${points.ap.y}" x2="${points.bp.x}" y2="${points.bp.y}"></line>
                </svg>`;
                chip = `<div class="det-algo-chip det-algo-chip--nms" style="left:${points.mp.x}%;top:${points.mp.y}%;">
                    <b>IoU ${c.iou.toFixed(3)}</b><span>${c.iou >= state.iou ? "抑制 B" : "保留 B"} / θ=${state.iou.toFixed(2)}</span>
                </div>`;
                if (c.suppress) {
                    particles = Array.from({length: 7}, (_, index) => `<i class="det-algo-spark" style="${centerStyle(c.b, sample, `--i:${index};`)}"></i>`).join("");
                }
            } else {
                chip = `<div class="det-algo-chip det-algo-chip--nms"><b>按分数排序</b><span>${counts.filtered} 个候选进入同类扫描</span></div>`;
            }
        } else if (phase === "final" || step.type === "final") {
            pulses = renderStagePulses(keptBoxes, sample, "is-final");
            chip = `<div class="det-algo-chip det-algo-chip--final">
                <b>最终检测</b><span>${counts.filtered} → ${counts.final}; N × [x1,y1,x2,y2,score,class]</span>
            </div>`;
        } else {
            pulses = renderStagePulses(rawBoxes.slice(0, 10), sample, "is-source");
        }

        return `<div class="det-algo-motion det-algo-motion--yolo det-algo-motion--${esc(phase)}">
            ${flow}${pulses}${particles}${chip}
        </div>`;
    }

    function renderStepper(step) {
        setStepper(yoloStepper, step.phase);
    }

    function renderMiniFlow(items, activeId) {
        const activeIndex = Math.max(0, items.findIndex((entry) => entry.id === activeId));
        return `<div class="det-teach-flow">${items.map((item, index) => `
            <span class="${item.id === activeId ? "is-active" : ""} ${index < activeIndex ? "is-done" : ""}">
                <b>${index + 1}</b><em>${esc(item.label)}</em>
            </span>
        `).join("")}</div>`;
    }

    function renderYoloAlgoSymbol(phase, counts) {
        const active = {
            decode: [0, 1],
            confidence: [1, 2],
            nms: [2, 3],
            final: [3, 4]
        }[phase] || [0];
        const nodeClass = (index) => active.includes(index) ? "is-active" : index < active[0] ? "is-done" : "";
        return `<div class="det-algo-symbol det-algo-symbol--yolo" aria-hidden="true">
            <svg viewBox="0 0 260 66" role="img">
                <path class="det-symbol-flow" d="M24 33 H73 C88 33 90 17 105 17 H145 C160 17 162 49 177 49 H236"></path>
                <g class="${nodeClass(0)}"><rect x="10" y="18" width="28" height="28" rx="5"></rect><text x="24" y="36">T</text></g>
                <g class="${nodeClass(1)}"><circle cx="82" cy="33" r="15"></circle><text x="82" y="37">B</text></g>
                <g class="${nodeClass(2)}"><path d="M126 18 L146 18 L137 33 L137 48 L131 51 L131 33 Z"></path></g>
                <g class="${nodeClass(3)}"><circle cx="187" cy="33" r="18"></circle><circle cx="202" cy="33" r="18"></circle><path class="det-symbol-cross" d="M197 23 L207 43 M207 23 L197 43"></path></g>
                <g class="${nodeClass(4)}"><rect x="226" y="21" width="28" height="24" rx="4"></rect><path d="M232 33 L238 39 L249 27"></path></g>
            </svg>
            <p><b>${counts.decoded}</b> 已解码 → <b>${counts.filtered}</b> 过阈值 → <b>${counts.final}</b> 最终框</p>
        </div>`;
    }

    function renderRcnnAlgoSymbol(phase, proposal) {
        const active = {
            image: 0,
            proposals: 0,
            crop: 1,
            features: 2,
            classifier: 3,
            regression: 4,
            nms: 5
        }[phase] ?? 0;
        const nodeClass = (index) => index === active ? "is-active" : index < active ? "is-done" : "";
        return `<div class="det-algo-symbol det-algo-symbol--rcnn" aria-hidden="true">
            <svg viewBox="0 0 286 66" role="img">
                <path class="det-symbol-flow" d="M24 33 H65 L89 18 H123 L148 33 H184 L211 18 H254"></path>
                <g class="${nodeClass(0)}"><rect x="10" y="18" width="31" height="30" rx="4"></rect><rect x="18" y="25" width="17" height="15" rx="2"></rect></g>
                <g class="${nodeClass(1)}"><rect x="70" y="19" width="31" height="28" rx="3"></rect><path d="M77 26 H95 M77 33 H95 M77 40 H95"></path></g>
                <g class="${nodeClass(2)}">${Array.from({length: 9}, (_, i) => `<circle cx="${128 + (i % 3) * 8}" cy="${24 + Math.floor(i / 3) * 8}" r="2.3"></circle>`).join("")}</g>
                <g class="${nodeClass(3)}"><rect x="168" y="20" width="30" height="26" rx="4"></rect><path d="M174 39 V30 M183 39 V25 M192 39 V34"></path></g>
                <g class="${nodeClass(4)}"><rect x="216" y="18" width="28" height="30" rx="4"></rect><rect x="224" y="24" width="28" height="21" rx="4"></rect></g>
                <g class="${nodeClass(5)}"><circle cx="268" cy="33" r="14"></circle><path d="M262 33 H274 M268 27 V39"></path></g>
            </svg>
            <p><b>${esc(proposal.id || "p1")}</b> proposal → 裁剪 → 特征 → 分类 → 修正 → NMS</p>
        </div>`;
    }

    function renderYoloTeachingDashboard(step, result) {
        const counts = yoloCounts(result);
        const c = comparisonForNms(result, step);
        const lowCount = Math.max(0, counts.decoded - counts.filtered);
        const phaseLabelById = {
            image: "图像",
            preprocess: "预处理",
            inference: "推理",
            decode: "解码",
            confidence: "置信度",
            nms: "NMS",
            final: "最终框"
        };
        const formulaByPhase = {
            image: "I(x,y) \\rightarrow RGB",
            preprocess: "X = Letterbox(I) / 255",
            inference: "Y \\in \\mathbb{R}^{1 \\times 84 \\times 8400}",
            decode: "x_1=c_x-\\frac{w}{2},\\ y_1=c_y-\\frac{h}{2}",
            confidence: "score_{max} \\ge \\theta_{conf}",
            nms: "IoU(A,B)=\\frac{|A \\cap B|}{|A \\cup B|}",
            final: "D \\in \\mathbb{R}^{N \\times 6}"
        };
        const lineByPhase = {
            image: "原图先保持像素空间不变，等待 letterbox 进入模型输入。",
            preprocess: "尺寸、比例和数值范围被统一，才可送入 ONNX 前向。",
            inference: "模型一次性输出密集张量，而不是直接输出最终框。",
            decode: "每个候选点拆出 xywh 与类别分数，再反算成图像坐标框。",
            confidence: "低分候选先离场，NMS 只处理通过阈值的候选。",
            nms: c ? `当前比较 A#${c.a.id} 与 B#${c.b.id}，IoU=${c.iou.toFixed(3)}。` : "先按置信度排序，再按类别逐个扫描重叠框。",
            final: "最终数组只包含 NMS 后保留下来的稳定检测结果。"
        };
        const phase = step.type === "final" ? "final" : (step.phase || "image");
        const flow = [
            {id: "decode", label: "解码"},
            {id: "confidence", label: "过滤"},
            {id: "nms", label: "比较"},
            {id: "final", label: "输出"}
        ];
        const activeFlow = ["image", "preprocess", "inference"].includes(phase) ? "decode" : phase;
        return `<section class="det-teach-dashboard det-teach-dashboard--yolo">
            <div class="det-teach-one-line"><span>${esc(phaseLabelById[phase] || phase)}</span><p>${esc(lineByPhase[phase] || lineByPhase.nms)}</p></div>
            <div class="det-teach-formula">${renderLatex(formulaByPhase[phase] || formulaByPhase.nms)}</div>
            ${renderYoloAlgoSymbol(activeFlow, counts)}
            ${renderMiniFlow(flow, activeFlow)}
            <div class="det-teach-stats">
                <span><b>${counts.decoded}</b><em>已解码</em></span>
                <span><b>${counts.filtered}</b><em>过阈值</em></span>
                <span><b>${lowCount}</b><em>低分过滤</em></span>
                <span><b>${counts.final}</b><em>最终框</em></span>
            </div>
        </section>`;
    }

    function activeYoloBox(result, step) {
        const activeId = activeSpotlightId() || step.compareBoxId || step.currentBoxId;
        return findBoxById(result.boxes || [], activeId) || findBoxById(result.candidates || [], activeId) || result.candidates?.[0] || result.boxes?.[0] || null;
    }

    function heatmapModeForStep(step) {
        if (state.heatmapType && state.heatmapType !== "auto") return state.heatmapType;
        if (step.phase === "confidence") return "objectness";
        if (step.phase === "nms") return "suppression";
        if (step.phase === "final") return "class";
        if (step.phase === "decode") return "center";
        return "objectness";
    }

    function heatmapBoxesFor(result, step, mode) {
        const cls = state.heatmapClass;
        let boxes = [];
        if (mode === "suppression") {
            boxes = [...(result.kept || []), ...(result.boxes || []).filter((box) => step.suppressedIds?.has?.(box.id))];
        } else if (mode === "class") {
            boxes = step.phase === "final" ? (result.kept || []) : (result.candidates || []);
        } else if (mode === "center") {
            boxes = result.boxes || [];
        } else {
            boxes = step.phase === "confidence" ? [...(result.candidates || []), ...(result.low || [])] : (result.candidates || result.boxes || []);
        }
        const limit = {
            center: 120,
            objectness: 120,
            class: 90,
            suppression: 70
        }[mode] || 100;
        return boxes.filter((box) => cls === "all" || box.class === cls).slice(0, limit);
    }

    function seededRandom(seed) {
        let hash = 2166136261;
        const text = String(seed);
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        hash += hash << 13;
        hash ^= hash >>> 7;
        hash += hash << 3;
        hash ^= hash >>> 17;
        hash += hash << 5;
        return ((hash >>> 0) % 10000) / 10000;
    }

    function ensureImageSampler(sample) {
        const img = els.image;
        if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
        const src = img.currentSrc || img.src || sample.image || "";
        const sampler = state.imageSampler;
        if (sampler.ready && sampler.src === src && sampler.width === img.naturalWidth && sampler.height === img.naturalHeight) {
            return sampler;
        }
        try {
            const canvas = sampler.canvas || document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d", {willReadFrequently: true});
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            state.imageSampler = {src, canvas, ctx, width: canvas.width, height: canvas.height, ready: true};
            return state.imageSampler;
        } catch (_) {
            state.imageSampler = {src, canvas: null, ctx: null, width: 0, height: 0, ready: false};
            return null;
        }
    }

    function sampleImageColor(sample, x, y, radius = 2) {
        const sampler = ensureImageSampler(sample);
        if (!sampler?.ctx) return {r: 34, g: 211, b: 238, luma: 0.68, chroma: 0.35, contrast: 0};
        const px = Math.max(0, Math.min(sampler.width - 1, Math.round((x / Math.max(1, sample.width)) * sampler.width)));
        const py = Math.max(0, Math.min(sampler.height - 1, Math.round((y / Math.max(1, sample.height)) * sampler.height)));
        const size = radius * 2 + 1;
        try {
            const data = sampler.ctx.getImageData(Math.max(0, px - radius), Math.max(0, py - radius), Math.min(size, sampler.width - px + radius), Math.min(size, sampler.height - py + radius)).data;
            let r = 0;
            let g = 0;
            let b = 0;
            let count = 0;
            let minLuma = 1;
            let maxLuma = 0;
            for (let i = 0; i < data.length; i += 4) {
                const rr = data[i];
                const gg = data[i + 1];
                const bb = data[i + 2];
                const luma = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
                r += rr;
                g += gg;
                b += bb;
                count += 1;
                minLuma = Math.min(minLuma, luma);
                maxLuma = Math.max(maxLuma, luma);
            }
            r = Math.round(r / Math.max(1, count));
            g = Math.round(g / Math.max(1, count));
            b = Math.round(b / Math.max(1, count));
            const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
            return {r, g, b, luma, chroma, contrast: Math.max(0, maxLuma - minLuma)};
        } catch (_) {
            return {r: 34, g: 211, b: 238, luma: 0.68, chroma: 0.35, contrast: 0};
        }
    }

    function heatmapCellStyle(cell) {
        return [
            `left:${cell.x.toFixed(2)}%`,
            `top:${cell.y.toFixed(2)}%`,
            `--hm-w:${cell.w.toFixed(2)}%`,
            `--hm-h:${cell.h.toFixed(2)}%`,
            `--heat-rgb:${cell.rgb}`,
            `--part-alpha:${cell.alpha.toFixed(3)}`,
            `--part-alpha-mid:${cell.alphaMid.toFixed(3)}`,
            `--cell-rot:${cell.rotate.toFixed(2)}deg`,
            `--cell-scale:${cell.scale.toFixed(2)}`,
            `--delay:${cell.delay}ms`
        ].join(";");
    }

    function featureMapPercent(sample, x, y, w, h) {
        return {
            x: (x / Math.max(1, sample.width)) * 100,
            y: (y / Math.max(1, sample.height)) * 100,
            w: (w / Math.max(1, sample.width)) * 100,
            h: (h / Math.max(1, sample.height)) * 100
        };
    }

    function heatmapCellsForBox(box, sample, mode, boxIndex) {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = box.bbox || [];
        const bw = Math.max(1, x2 - x1);
        const bh = Math.max(1, y2 - y1);
        const score = Math.max(0.12, Math.min(1, Number(box.score) || 0.2));
        const cols = Math.max(2, Math.min(8, Math.round(bw / Math.max(14, sample.width / 28))));
        const rows = Math.max(2, Math.min(7, Math.round(bh / Math.max(14, sample.height / 30))));
        const candidates = [];
        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const seed = `${sample.id || sample.image}:${box.id}:${mode}:${row}:${col}`;
                const rx = seededRandom(`${seed}:x`) - 0.5;
                const ry = seededRandom(`${seed}:y`) - 0.5;
                const cx = x1 + bw * Math.max(0.03, Math.min(0.97, (col + 0.5 + rx * 0.42) / cols));
                const cy = y1 + bh * Math.max(0.03, Math.min(0.97, (row + 0.5 + ry * 0.42) / rows));
                const color = sampleImageColor(sample, cx, cy, Math.max(1, Math.round(Math.min(bw / cols, bh / rows) / 2.8)));
                const noise = seededRandom(`${seed}:n`);
                const edge = Math.min(1, color.contrast * 2.4);
                const colorfulness = Math.min(1, color.chroma * 1.9);
                const midTone = 1 - Math.min(1, Math.abs(color.luma - 0.52) * 1.45);
                const saliency = Math.max(0, Math.min(1, score * 0.52 + edge * 0.30 + colorfulness * 0.16 + midTone * 0.10 + noise * 0.20));
                const cellW = (bw / cols) * (1.02 + seededRandom(`${seed}:w`) * 0.58);
                const cellH = (bh / rows) * (0.98 + seededRandom(`${seed}:h`) * 0.55);
                const mapped = featureMapPercent(sample, cx, cy, cellW, cellH);
                candidates.push({
                    x: Math.max(0, Math.min(100, mapped.x)),
                    y: Math.max(0, Math.min(100, mapped.y)),
                    w: Math.max(1.85, mapped.w),
                    h: Math.max(1.55, mapped.h),
                    rgb: `${Math.round(color.r * 0.38 + 34 * 0.62)}, ${Math.round(color.g * 0.34 + 211 * 0.66)}, ${Math.round(color.b * 0.34 + 238 * 0.66)}`,
                    alpha: 0.18 + saliency * 0.50,
                    alphaMid: 0.11 + saliency * 0.36,
                    rotate: (seededRandom(`${seed}:r`) - 0.5) * 8,
                    scale: 0.86 + seededRandom(`${seed}:scale`) * 0.28,
                    delay: boxIndex * 12 + row * 18 + col * 10,
                    saliency
                });
            }
        }
        const density = mode === "center" ? 0.48 : mode === "suppression" ? 0.58 : 0.74;
        const take = Math.max(4, Math.min(24, Math.round(candidates.length * density + score * 3)));
        return candidates.sort((a, b) => b.saliency - a.saliency).slice(0, take);
    }

    function renderHeatmapSpots(result, step, sample, mode, activeBox) {
        const boxes = heatmapBoxesFor(result, step, mode);
        if (!boxes.length) {
            return `<div class="det-yolo-feature-empty">当前没有可用于生成解释热力图的候选框。</div>`;
        }
        return `<div class="det-yolo-heatmap-layer det-yolo-heatmap-layer--${esc(mode)}" style="--hm-alpha:${state.heatmapAlpha};">
            ${boxes.map((box, index) => {
                const score = Math.max(0.12, Math.min(1, Number(box.score) || 0.2));
                const suppressed = step.suppressedIds?.has?.(box.id);
                const active = activeBox && idText(activeBox.id) === idText(box.id);
                return heatmapCellsForBox(box, sample, mode, index).map((cell) => {
                    return `<i data-det-hover-id="${esc(box.id)}" data-det-related-id="${esc(box.id)}" class="det-yolo-heat-cell ${active ? "is-active" : ""} ${suppressed ? "is-suppressed" : ""} ${spotlightClassFor(box.id)}" style="${heatmapCellStyle(cell)};--score:${score};"></i>`;
                }).join("");
            }).join("")}
        </div>`;
    }

    function renderFeatureMiniImage(result, step, sample, mode, activeBox) {
        const src = sample.image ? (sample.image.startsWith("blob:") ? sample.image : window.cvclassUrl(sample.image)) : "";
        const activeCenter = activeBox ? boxCenter(activeBox) : {x: sample.width / 2, y: sample.height / 2};
        const active = featureMapPercent(sample, activeCenter.x, activeCenter.y, 0, 0);
        const ratio = Math.max(0.7, Math.min(2.2, Math.max(1, sample.width) / Math.max(1, sample.height)));
        return `<div class="det-yolo-feature-map" style="--feature-aspect-ratio:${ratio.toFixed(3)};">
            ${src ? `<img src="${esc(src)}" alt="">` : ""}
            <div class="det-yolo-feature-gridlines" aria-hidden="true"></div>
            ${renderHeatmapSpots(result, step, sample, mode, activeBox)}
            <b class="det-yolo-feature-cell" style="left:${active.x.toFixed(2)}%;top:${active.y.toFixed(2)}%;"></b>
        </div>`;
    }

    function renderYoloHeadSplit(activeBox) {
        const score = Number(activeBox?.score || 0);
        return `<div class="det-yolo-head-split">
            <div class="is-source"><span>feature cell</span><strong>${activeBox ? `#${esc(activeBox.id)}` : "cell"}</strong></div>
            <i></i>
            <div><span>objectness</span><strong>${score ? score.toFixed(2) : "--"}</strong></div>
            <div><span>class scores</span><strong>${esc(activeBox?.class || "--")}</strong></div>
            <div><span>bbox offsets</span><strong>cx cy w h</strong></div>
            <i class="is-merge"></i>
            <div class="is-output"><span>candidate box</span><strong>${activeBox ? `[${esc(activeBox.bbox.join(", "))}]` : "--"}</strong></div>
        </div>`;
    }

    function renderYoloFeaturePyramid() {
        return `<div class="det-yolo-pyramid">
            ${[
                ["P3", "80×80", "小目标 / 密集响应"],
                ["P4", "40×40", "中尺度目标"],
                ["P5", "20×20", "大目标 / 语义强"]
            ].map((item, index) => `<article style="--i:${index};">
                <span>${item[0]}</span><strong>${item[1]}</strong><em>${item[2]}</em>
                <div>${Array.from({length: 16}, (_, i) => `<i style="--j:${i};"></i>`).join("")}</div>
            </article>`).join("")}
        </div>`;
    }

    function renderYoloScoreBars(result, activeBox) {
        const classes = [...new Set((result.candidates || result.boxes || []).map((box) => box.class))].slice(0, 5);
        const rows = (classes.length ? classes : ["car", "person", "bus"]).map((name) => {
            const top = (result.candidates || result.boxes || []).filter((box) => box.class === name).sort((a, b) => b.score - a.score)[0];
            const value = Number(top?.score || (name === activeBox?.class ? activeBox?.score : 0.18)) || 0.18;
            return {name, value, active: name === activeBox?.class};
        }).sort((a, b) => b.value - a.value);
        return `<div class="det-yolo-score-bars">
            ${rows.map((row) => `<div class="${row.active ? "is-active" : ""}"><span>${esc(row.name)}</span><b style="--score:${Math.max(0.08, Math.min(1, row.value))}"></b><strong>${row.value.toFixed(2)}</strong></div>`).join("")}
        </div>`;
    }

    function renderYoloIouMatrix(result, step) {
        const c = comparisonForNms(result, step);
        const boxes = result.candidates.slice(0, 4);
        return `<div class="det-yolo-iou-matrix">
            ${boxes.map((row) => boxes.map((col) => {
                const same = row.id === col.id;
                const value = same ? 1 : iou(row, col);
                const active = c && ((row.id === c.a.id && col.id === c.b.id) || (row.id === c.b.id && col.id === c.a.id));
                return `<span class="${same ? "is-self" : ""} ${active ? "is-active" : ""}" style="--iou:${Math.min(1, value)}">${same ? "1.00" : value.toFixed(2)}</span>`;
            }).join("")).join("")}
        </div>`;
    }

    function renderYoloFinalSchema(result) {
        const rows = result.kept.slice(0, 4);
        return `<div class="det-yolo-output-schema">
            <strong>N × [x1, y1, x2, y2, score, class]</strong>
            ${rows.length ? rows.map((box) => `<code>[${box.bbox.join(", ")}], ${box.score.toFixed(2)}, ${esc(box.class)}</code>`).join("") : `<span>当前阈值下暂无最终检测框</span>`}
        </div>`;
    }

    function renderYoloFeatureView(step, result) {
        if (!els.featureView) return;
        const sample = result.sample;
        const mode = heatmapModeForStep(step);
        const activeBox = activeYoloBox(result, step);
        const counts = yoloCounts(result);
        const phase = step.type === "final" ? "final" : (step.phase || "image");
        const phaseTitle = {
            image: "输入张量观察",
            preprocess: "预处理参数",
            inference: "Backbone / FPN / Head",
            decode: "Detection Head 输出拆解",
            confidence: "目标响应热力图",
            nms: "NMS 抑制观察",
            final: "最终输出结构"
        }[phase] || "模型内部观察";
        const note = {
            image: "RGB 图像将被调整为模型输入张量，后续响应都回映射到当前图像坐标。",
            preprocess: "letterbox 保持比例并补边，归一化把像素范围压到 0–1。",
            inference: "YOLO 通过多尺度特征层同时观察小、中、大目标。",
            decode: "每个 feature cell 输出 bbox 偏移、类别分数和候选框。",
            confidence: "解释热力图由 decoded candidates 聚合生成，亮区表示更高目标响应。",
            nms: "同类高分框先保留，重叠过高的低分框被抑制。",
            final: "最终输出是 N 行检测数组，可直接被前端或后续业务消费。"
        }[phase] || "";
        let body = "";
        if (phase === "image") {
            body = `<div class="det-yolo-rgb-stack"><i>R</i><i>G</i><i>B</i><span>${sample.width}×${sample.height}×3</span></div>${renderFeatureMiniImage(result, step, sample, mode, activeBox)}`;
        } else if (phase === "preprocess") {
            body = `<div class="det-yolo-preprocess-card">
                <div><span>输入尺寸</span><strong>640 × 640</strong></div>
                <div><span>原图尺寸</span><strong>${sample.width} × ${sample.height}</strong></div>
                <div><span>padding</span><strong>letterbox 自动补边</strong></div>
                <div><span>normalize</span><strong>RGB / 255</strong></div>
            </div>${renderFeatureMiniImage(result, step, sample, mode, activeBox)}`;
        } else if (phase === "inference") {
            body = `<div class="det-yolo-model-flow"><span>Backbone</span><i></i><span>Neck / FPN</span><i></i><span>Detection Head</span></div>${renderYoloFeaturePyramid()}`;
        } else if (phase === "decode") {
            body = `${renderYoloHeadSplit(activeBox)}${renderFeatureMiniImage(result, step, sample, mode, activeBox)}`;
        } else if (phase === "confidence") {
            body = `${renderFeatureMiniImage(result, step, sample, mode, activeBox)}${renderYoloScoreBars(result, activeBox)}`;
        } else if (phase === "nms") {
            body = `<div class="det-yolo-nms-compact">${renderYoloScoreBars(result, activeBox)}${renderYoloIouMatrix(result, step)}</div>${renderFeatureMiniImage(result, step, sample, mode, activeBox)}`;
        } else {
            body = `${renderYoloFinalSchema(result)}${renderFeatureMiniImage(result, step, sample, "class", activeBox)}`;
        }
        els.featureView.hidden = false;
        els.featureView.innerHTML = `<section class="det-yolo-feature-panel det-yolo-feature-panel--${esc(phase)}">
            <header><span>模型内部观察窗</span><strong>${esc(phaseTitle)}</strong><em>${esc(mode === "auto" ? heatmapModeForStep(step) : mode)} · opacity ${Math.round(state.heatmapAlpha * 100)}%</em></header>
            <p>${esc(note)}</p>
            ${body}
            <footer>
                <span>候选 ${counts.decoded}</span><span>过阈值 ${counts.filtered}</span><span>最终 ${counts.final}</span>
                <b>${activeBox ? `#${esc(activeBox.id)} ${esc(activeBox.class)} ${activeBox.score.toFixed(2)}` : "未选中候选框"}</b>
            </footer>
        </section>`;
    }

    function renderYoloActiveContext(step, result) {
        const activeBox = activeYoloBox(result, step);
        const mode = heatmapModeForStep(step);
        const status = activeBox
            ? step.suppressedIds?.has?.(activeBox.id) ? "NMS 已抑制"
                : step.keptIds?.has?.(activeBox.id) ? "已保留 / 候选中"
                    : step.lowIds?.has?.(activeBox.id) ? "低置信度过滤"
                        : "候选响应"
            : "未选中";
        const center = activeBox ? boxCenter(activeBox) : null;
        return `<dl class="det-yolo-active-context">
            <div><dt>观察图层</dt><dd>${esc(mode)} / 解释型热力图</dd></div>
            <div><dt>当前候选</dt><dd>${activeBox ? `#${activeBox.id} ${esc(activeBox.class)} ${activeBox.score.toFixed(3)}` : "--"}</dd></div>
            <div><dt>候选中心</dt><dd>${center ? `(${Math.round(center.x)}, ${Math.round(center.y)})` : "--"}</dd></div>
            <div><dt>bbox</dt><dd>${activeBox ? `[${esc(activeBox.bbox.join(", "))}]` : "--"}</dd></div>
            <div><dt>NMS 状态</dt><dd>${esc(status)}</dd></div>
        </dl>
        <p class="det-yolo-heatmap-note">当前热力图基于 decoded candidates 的 bbox、类别、置信度、局部颜色值和纹理差异聚合生成；每个框都会投影响应，车辆会按车身、车窗、车轮等局部展开，用于解释候选分布，不等同于真实中间层 feature map。</p>`;
    }

    function renderNotes(step, result) {
        const s = result.sample;
        const inference = state.inferenceResult;
        const shape = rawOutputShapeText();
        const counts = yoloCounts(result);
        const decodedCount = counts.decoded;
        const sampleCandidate = result.candidates[0] || result.low[0] || null;
        const currentBox = findBoxById(result.boxes, step.currentBoxId) || activeYoloBox(result, step);
        const compareBox = findBoxById(result.boxes, step.compareBoxId);
        const finalPreview = result.kept.slice(0, 2).map((box) => ({
            bbox: box.bbox,
            score: Number(box.score.toFixed(3)),
            class: box.class
        }));

        if (els.notesTitle) {
            els.notesTitle.textContent = "后处理具体步骤说明";
        }

        if (els.notesSubtitle) {
            els.notesSubtitle.textContent = "算法计算细节";
        }

        let tutorialContent = "";
        let notesContent = "";

        if (step.phase === "image") {
            tutorialContent = `<p><span class="det-note-stage">图像</span><strong>输入图像</strong>仍是原始 RGB 像素，后续会被 letterbox 到模型固定输入尺寸，再送入 ONNX Runtime。</p>`;
            notesContent = `<dl>
                <div><dt>输入图像尺寸</dt><dd>${s.width} × ${s.height}</dd></div>
                <div><dt>预处理生成的输入张量维度</dt><dd>[1, 3, 640, 640]</dd></div>
                <div><dt>目标前向核心计算流程</dt><dd>图像 → 预处理 → 推理 → 解码</dd></div>
            </dl>`;
        } else if (step.phase === "preprocess") {
            tutorialContent = `<p><span class="det-note-stage">预处理</span><strong>Letterbox + Normalize</strong>保留原图比例，补边到 640×640，并把 HWC 像素布局转成模型需要的 CHW tensor。</p>`;
            notesContent = `<dl>
                <div><dt>letterbox</dt><dd>${s.width} × ${s.height} → 640 × 640</dd></div>
                <div><dt>张量归一化计算</dt><dd>RGB / 255</dd></div>
                <div><dt>layout</dt><dd>HWC → CHW</dd></div>
                <div><dt>ONNX 前向输入尺度</dt><dd>[1, 3, 640, 640]</dd></div>
            </dl>`;
        } else if (step.phase === "inference") {
            tutorialContent = `<p><span class="det-note-stage">推理</span><strong>ONNX inference</strong>输出 dense tensor。${esc(shape)} 表示 8400 个候选点，每个点有 4 个 xywh 参数和 80 个类别分数。</p>`;
            notesContent = `<dl>
                <div><dt>激活后端</dt><dd>${esc(state.activeBackend || "--")}</dd></div>
                <div><dt>rawOutputShape</dt><dd>${esc(rawOutputShapeNote())}</dd></div>
                <div><dt>单个检测输出位置参数含义</dt><dd>84 = 4 bbox + 80 类别分数</dd></div>
                <div><dt>推理耗时</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div>
            </dl>`;
        } else if (step.phase === "decode") {
            tutorialContent = `<p><span class="det-note-stage">解码</span><strong>rawOutput → 候选框</strong>遍历 8400 个点，取每个点的 xywh 与最大类别分数，再把中心点宽高换算成图像坐标 bbox。</p>`;
            notesContent = `<dl>
                <div><dt>待解码输出张量</dt><dd>${esc(shape)}</dd></div>
                <div><dt>全景特征点空间总候选数</dt><dd>8400</dd></div>
                <div><dt>反向解码像素包围框总数</dt><dd>${decodedCount}</dd></div>
                <div><dt>首个被还原的有效示例候选框</dt><dd>${sampleCandidate ? `#${sampleCandidate.id} ${esc(sampleCandidate.class)} ${sampleCandidate.score.toFixed(3)}` : "--"}</dd></div>
                <div><dt>框坐标变换</dt><dd>cx, cy, w, h → x1, y1, x2, y2</dd></div>
            </dl>`;
        } else if (step.phase === "confidence") {
            tutorialContent = `<p><span class="det-note-stage">置信度</span><strong>阈值过滤</strong>先删除低置信度框。低于 ${state.conf.toFixed(2)} 的候选框会变灰并淡出，只把高分候选框送入 NMS。</p>`;
            notesContent = `<dl>
                <div><dt>接收到待剔除候选总框数</dt><dd>${decodedCount}</dd></div>
                <div><dt>判定目标置信度阈值</dt><dd>${state.conf.toFixed(2)}</dd></div>
                <div><dt>置信度合格送入NMS框数</dt><dd>${counts.filtered}</dd></div>
                <div><dt>因得分低自动淡出过滤框数</dt><dd>${Math.max(0, counts.decoded - counts.filtered)}</dd></div>
                <div><dt>下一步</dt><dd>按分数排序 → 同类 NMS</dd></div>
            </dl>`;
        } else if (step.type === "final") {
            tutorialContent = `<p><span class="det-note-stage">最终框</span><strong>最终检测输出</strong>只保留 NMS 后的稳定框。页面输出结构对应前端可消费的 detection 数组。</p>`;
            const avg = result.kept.length ? result.kept.reduce((sum, box) => sum + box.score, 0) / result.kept.length : 0;
            const classText = [...new Set(result.kept.map((box) => box.class))].map((name) => `${name}: ${result.kept.filter((box) => box.class === name).length}`).join(" / ") || "--";
            notesContent = `<dl>
                <div><dt>最终检测框数</dt><dd>${counts.final}</dd></div>
                <div><dt>本帧识别出的物体类别分布</dt><dd>${esc(classText)}</dd></div>
                <div><dt>全图留存目标平均置信得分</dt><dd>${avg.toFixed(3)}</dd></div>
                <div><dt>输出结构</dt><dd>N × [x1,y1,x2,y2,score,class]</dd></div>
            </dl>
            <div class="det-final-output"><strong>检测输出 JSON 首帧片段预览</strong><code>${esc(JSON.stringify(finalPreview))}</code></div>`;
        } else {
            const c = step.comparison;
            if (c) {
                const stageName = step.type === "suppress" ? "NMS" : step.type === "keep" ? "NMS" : "IoU";
                const decisionText = c.suppress ? `IoU >= ${state.iou.toFixed(2)}；NMS 抑制低分框 B。` : `当前两候选框交并比 IoU 低于阈值 ${state.iou.toFixed(2)}。算法认为它们属于两个不同目标，候选框 B 继续保留。`;
                tutorialContent = `<p><span class="det-note-stage">${stageName}</span><strong>比较 A/B</strong>IoU 交并比计算公式 = A ∩ B 重叠面积 / A ∪ B 总合面积。NMS 执行判断规则如下：${decisionText}</p>`;
                notesContent = `<div class="det-iou-equation">
                    <span>IoU</span><strong>${c.iou.toFixed(3)}</strong><small>${Math.round(c.inter.area)} / ${Math.round(c.union)}</small>
                </div>
                <div class="detection-pair"><strong>框 A</strong><span>${esc(c.a.class)} ${c.a.score.toFixed(2)}</span><code>[${c.a.bbox.join(", ")}]</code></div>
                <div class="detection-pair"><strong>框 B</strong><span>${esc(c.b.class)} ${c.b.score.toFixed(2)}</span><code>[${c.b.bbox.join(", ")}]</code></div>
                <dl>
                    <div><dt>矩阵单元</dt><dd>A#${c.a.id} × B#${c.b.id}</dd></div>
                    <div><dt>交集面积</dt><dd>${Math.round(c.inter.area)} px²</dd></div>
                    <div><dt>并集面积</dt><dd>${Math.round(c.union)} px²</dd></div>
                    <div><dt>NMS 判定</dt><dd>${c.suppress ? "抑制框 B" : "认为独立，继续保留 B"}</dd></div>
                </dl>`;
            } else {
                tutorialContent = `<p><span class="det-note-stage">NMS</span><strong>${esc(step.message)}</strong>当前候选没有同类高分框需要比较，先进入 kept set。</p>`;
                notesContent = `<dl>
                    <div><dt>当前主要检查的高分框A</dt><dd>${currentBox ? `#${currentBox.id} ${esc(currentBox.class)} ${currentBox.score.toFixed(3)}` : "--"}</dd></div>
                    <div><dt>已被确定保留框的总数量</dt><dd>${step.keptIds.size}</dd></div>
                    <div><dt>已被干掉剔除框的总数量</dt><dd>${step.suppressedIds.size}</dd></div>
                    <div><dt>当前比较对象</dt><dd>${compareBox ? `#${compareBox.id}` : "无（此轮对比完成）"}</dd></div>
                </dl>`;
            }
        }

        if (els.notesTutorial) {
            els.notesTutorial.innerHTML = tutorialContent;
        }
        els.notes.innerHTML = notesContent + renderYoloActiveContext(step, result) + renderYoloTeachingDashboard(step, result);
    }

    function demoBox(box, sample, kind, label, extraClass = "", extraStyle = "") {
        const hoverId = box?.id || box?.sourceId || "";
        const spotlightClass = hoverId ? spotlightClassFor(hoverId) : "";
        const attrs = hoverId ? `data-det-hover-id="${esc(hoverId)}" data-det-related-id="${esc(hoverId)}"` : "";
        return `<div ${attrs} class="vision-bbox detection-demo-box detection-demo-box--${esc(kind)} ${esc(extraClass)} ${spotlightClass}" style="${boxStyle(box, sample.width, sample.height)}${extraStyle}"><span>${esc(label)}</span></div>`;
    }

    function renderFeatureGrid(values = [], active = []) {
        const activeSet = new Set(active);
        return `<div class="detection-feature-grid">${values.map((row, r) => row.map((value, c) => {
            const isActive = activeSet.has(`${r}-${c}`);
            return `<i class="${isActive ? "is-active" : ""}" style="--v:${Math.max(0.08, Number(value) || 0)}">${Number(value).toFixed(2)}</i>`;
        }).join("")).join("")}</div>`;
    }

    function renderClassifierBars(proposal = {}, active = false) {
        const primaryClass = proposal.class && proposal.class !== "background" ? proposal.class : "person";
        const bars = [
            {label: primaryClass, value: Number(proposal.score) || 0.91},
            {label: "background", value: primaryClass === "background" ? 0.62 : 0.12},
            {label: "bus", value: primaryClass === "bus" ? 0.87 : 0.18}
        ];
        return `<div class="detection-classifier-bars ${active ? "is-active" : ""}">
            ${bars.map((bar) => {
                const score = Math.max(0.04, Math.min(1, bar.value));
                return `<div class="${bar.label === primaryClass ? "is-top" : ""}"><span>${esc(bar.label)}</span><b style="--score-pct:${(score * 100).toFixed(1)}%"></b><strong>${bar.value.toFixed(2)}</strong></div>`;
            }).join("")}
        </div>`;
    }

    function regressionResult(proposal = {}) {
        const rect = xyxyToRect(proposal.bbox || []);
        const offset = proposal.offset || {};
        return {
            x: rect.x + (Number(offset.dx) || 0) * rect.w,
            y: rect.y + (Number(offset.dy) || 0) * rect.h,
            w: rect.w * Math.exp(Number(offset.dw) || 0),
            h: rect.h * Math.exp(Number(offset.dh) || 0),
            refined: xyxyToRect(proposal.refined || proposal.bbox || [])
        };
    }

    function renderFormulaRow(label, formula, expression, value) {
        return `<div class="det-reg-formula-row">
            <span>${esc(label)}</span>
            <b>${renderLatex(formula)}</b>
            <em>${renderLatex(expression)}</em>
            <strong data-det-ticker="${esc(num(value, 1))}">${esc(num(value, 1))}</strong>
        </div>`;
    }

    function renderBBoxRegressionPanel(proposal = {}, step) {
        const rect = xyxyToRect(proposal.bbox || []);
        const result = regressionResult(proposal);
        const offset = proposal.offset || {};
        const active = step.id === "regression" || state.hoveredProposalId;
        return `<aside data-det-related-id="${esc(proposal.id || "p1")}" class="det-bbox-reg-panel ${active ? "is-running" : ""} ${spotlightClassFor(proposal.id)}">
            <header>
                <span>边界框偏移回归计算面板</span>
                <strong>${esc(proposal.id || "p1")} ${esc(proposal.class || "proposal")}</strong>
                <em>算法在内部执行的数学回归演算</em>
            </header>
            <div class="det-reg-canvas" aria-hidden="true">
                <i class="det-reg-box det-reg-box--original"></i>
                <i class="det-reg-box det-reg-box--target"></i>
                <i class="det-reg-box det-reg-box--moving"></i>
            </div>
            <div class="det-reg-formulas">
                ${renderFormulaRow("x'", "x' = x_p + d_x \\cdot w_p", `${num(rect.x, 1)} + ${num(offset.dx, 3)} \\cdot ${num(rect.w, 1)}`, result.x)}
                ${renderFormulaRow("y'", "y' = y_p + d_y \\cdot h_p", `${num(rect.y, 1)} + ${num(offset.dy, 3)} \\cdot ${num(rect.h, 1)}`, result.y)}
                ${renderFormulaRow("w'", "w' = w_p \\cdot e^{d_w}", `${num(rect.w, 1)} \\cdot e^{${num(offset.dw, 3)}}`, result.w)}
                ${renderFormulaRow("h'", "h' = h_p \\cdot e^{d_h}", `${num(rect.h, 1)} \\cdot e^{${num(offset.dh, 3)}}`, result.h)}
            </div>
            <dl>
                <div><dt>dx</dt><dd>${esc(num(offset.dx, 3))}</dd></div>
                <div><dt>dy</dt><dd>${esc(num(offset.dy, 3))}</dd></div>
                <div><dt>dw</dt><dd>${esc(num(offset.dw, 3))}</dd></div>
                <div><dt>dh</dt><dd>${esc(num(offset.dh, 3))}</dd></div>
                <div><dt>修正框</dt><dd>[${esc((proposal.refined || proposal.bbox || []).join(", "))}]</dd></div>
            </dl>
        </aside>`;
    }

    function rcnnStepMeta(step) {
        const meta = {
            image: ["图像", "输入图像与当前 proposal", "确认图像内容，并让一个活跃 proposal 保持聚焦。", "候选生成"],
            proposals: ["候选框", "Selective Search 生成候选区域", "在 CNN 分类前先展示类别无关的候选区域。", "候选生成"],
            crop: ["裁剪 / ROI", "裁剪当前 proposal 并归一化尺寸", "抽取当前区域，并缩放到 CNN 固定输入尺寸。", "裁剪归一化"],
            features: ["CNN 特征", "单个 proposal 的特征提取", "把归一化后的 patch 转成紧凑的特征图和向量。", "特征提取"],
            classifier: ["分类器", "由 proposal 特征得到类别分数", "对当前 proposal 计算前景类别与背景得分。", "已分类"],
            regression: ["边界框回归", "原始框平滑修正为精细框", "应用 dx、dy、dw、dh 修正粗糙 proposal 框。", "已修正"],
            nms: ["NMS / 最终", "去除重复的修正检测框", "用 IoU 比较修正后的框，并抑制重复框。", "最终输出"]
        };
        const value = meta[step.id] || meta.image;
        return {label: value[0], title: value[1], goal: value[2], state: value[3]};
    }

    function renderRcnnCourseConsole(demo, step) {
        const p = activeRcnnProposal(demo);
        const meta = rcnnStepMeta(step);
        if (els.courseStep) els.courseStep.textContent = meta.label;
        if (els.courseGoal) els.courseGoal.textContent = meta.goal;
        if (els.courseActive) els.courseActive.textContent = p.id || "--";
        if (els.courseState) els.courseState.textContent = meta.state;
        if (!els.courseSummary) return;
        els.courseSummary.innerHTML = `<dl>
            <div><dt>当前 proposal</dt><dd>${esc(p.id || "--")}</dd></div>
            <div><dt>类别</dt><dd>${esc(p.class || "--")}</dd></div>
            <div><dt>得分</dt><dd>${Number.isFinite(p.score) ? p.score.toFixed(2) : "--"}</dd></div>
            <div><dt>proposal bbox</dt><dd>[${esc((p.bbox || []).join(", "))}]</dd></div>
            <div><dt>refined bbox</dt><dd>[${esc((p.refined || p.bbox || []).join(", "))}]</dd></div>
            <div><dt>当前状态</dt><dd>${esc(meta.state)}</dd></div>
        </dl>`;
    }

    function renderRcnnStepRail(step) {
        const steps = modeSteppers.rcnn;
        const currentIndex = Math.max(0, steps.findIndex((item) => item.id === step.id));
        return `<nav class="det-rcnn-step-rail" aria-label="R-CNN focused steps">
            ${steps.map((item, index) => `<button type="button" data-rcnn-step="${esc(item.id)}" class="${index < currentIndex ? "is-done" : ""} ${item.id === step.id ? "is-current" : ""}">
                <span>${index + 1}</span><strong>${esc(item.title)}</strong>
            </button>`).join("")}
        </nav>`;
    }

    function renderRcnnFlowGlyph(type, proposal) {
        const score = Number(proposal.score || 0);
        const cls = proposal.class || "--";
        if (type === "image") {
            return `<div class="det-rcnn-glyph det-rcnn-glyph--image" aria-hidden="true">
                <i class="is-frame"></i><i class="is-scan"></i>
            </div>`;
        }
        if (type === "decompose") {
            return `<div class="det-rcnn-glyph det-rcnn-glyph--decompose" aria-hidden="true">
                <i></i><i></i><i></i><i></i><i></i>
                <b>${esc(proposal.id || "p1")}</b>
            </div>`;
        }
        if (type === "crop") {
            return `<div class="det-rcnn-glyph det-rcnn-glyph--crop" aria-hidden="true">
                <i class="is-image"></i><i class="is-cut"></i><i class="is-patch"></i>
            </div>`;
        }
        if (type === "feature") {
            return `<div class="det-rcnn-glyph det-rcnn-glyph--feature" aria-hidden="true">
                ${Array.from({length: 18}, (_, index) => `<i style="--i:${index};--v:${0.28 + ((index * 7) % 11) / 14}"></i>`).join("")}
            </div>`;
        }
        if (type === "classifier") {
            const bars = [
                ["person", cls === "person" ? score : 0.24],
                ["car", cls === "car" ? score : 0.18],
                ["bus", cls === "bus" ? score : 0.16]
            ];
            return `<div class="det-rcnn-glyph det-rcnn-glyph--classifier" aria-hidden="true">
                ${bars.map(([name, value]) => `<i class="${name === cls ? "is-winner" : ""}" style="--score:${Math.max(0.12, value)}"><span>${esc(name)}</span></i>`).join("")}
            </div>`;
        }
        if (type === "regression") {
            return `<div class="det-rcnn-glyph det-rcnn-glyph--regression" aria-hidden="true">
                <i class="is-original"></i><i class="is-refined"></i><b>dx/dy</b>
            </div>`;
        }
        return `<div class="det-rcnn-glyph det-rcnn-glyph--nms" aria-hidden="true">
            <i class="is-a"></i><i class="is-b"></i><i class="is-final"></i>
        </div>`;
    }

    function renderRcnnLifecycleCanvas(demo, step, activeProposal) {
        const proposals = demo.proposals || [];
        const stepIndexById = {
            image: 0,
            proposals: 1,
            crop: 2,
            features: 3,
            classifier: 4,
            regression: 5,
            nms: 6
        };
        const activeIndex = stepIndexById[step.id] ?? 0;
        const nodes = [
            {id: "image", word: "输入", title: "原始图像", detail: "输入待检测图像", kind: "image"},
            {id: "proposals", word: "分解", title: "候选区域生成", detail: "图像被拆成多个 proposal", kind: "decompose"},
            {id: "crop", word: "伸展", title: "裁剪与归一化", detail: "当前框抽离成 patch", kind: "crop"},
            {id: "features", word: "分解", title: "CNN 特征", detail: "patch 展开为特征向量", kind: "feature"},
            {id: "classifier", word: "碰撞", title: "类别竞争", detail: "类别分数相互竞争", kind: "classifier"},
            {id: "regression", word: "脉冲", title: "边界框回归", detail: "粗框平滑修正", kind: "regression"},
            {id: "nms", word: "合并", title: "NMS 收束", detail: "重复框抑制为最终框", kind: "nms"}
        ];
        const streamItems = proposals.slice(0, 5).map((p, index) => {
            const active = idText(p.id) === idText(activeProposal.id);
            const low = p.score < state.conf && p.id !== "p1";
            return `<span data-det-hover-id="${esc(p.id)}" data-det-related-id="${esc(p.id)}" class="${active ? "is-active" : ""} ${low ? "is-low" : ""} ${spotlightClassFor(p.id)}" style="--i:${index};">
                <b>${esc(p.id)}</b><em>${esc(p.class || "proposal")}</em><code>${Number(p.score || 0).toFixed(2)}</code>
            </span>`;
        }).join("");
        const activeLeft = 7.8 + activeIndex * 12.4;
        return `<div class="det-rcnn-algo-canvas det-rcnn-algo-canvas--${esc(step.id)}" data-det-related-id="${esc(activeProposal.id || "p1")}" style="--active-index:${activeIndex};--active-left:${activeLeft.toFixed(1)}%;">
            <div class="det-rcnn-algo-flow" style="--active-index:${activeIndex};">
                ${nodes.map((node, index) => `<button type="button" data-rcnn-step="${esc(node.id)}" class="${index < activeIndex ? "is-done" : ""} ${index === activeIndex ? "is-active" : ""}" style="--node-index:${index};">
                    <small>${esc(node.word)}</small>
                    ${renderRcnnFlowGlyph(node.kind, activeProposal)}
                    <strong>${esc(node.title)}</strong>
                    <p>${esc(node.detail)}</p>
                </button>`).join("")}
            </div>
            <div class="det-rcnn-proposal-stream" aria-label="proposal 数据流">
                <strong>proposal 流</strong>
                <div>${streamItems}</div>
            </div>
        </div>`;
    }

    function renderProposalCards(proposals, activeProposal, limit = 5) {
        return `<div class="det-rcnn-proposal-cards">
            ${proposals.slice(0, limit).map((p, index) => {
                const active = idText(p.id) === idText(activeProposal.id);
                const isLow = p.score < state.conf && p.id !== "p1";
                return `<article data-det-hover-id="${esc(p.id)}" data-det-related-id="${esc(p.id)}" class="${active ? "is-active" : ""} ${isLow ? "is-low" : ""} ${spotlightClassFor(p.id)}" style="--proposal-delay:${index * 90}ms">
                    <span>${esc(p.id)}</span>
                    <strong>${esc(p.class || "proposal")}</strong>
                    <em>${Number.isFinite(p.score) ? p.score.toFixed(2) : "--"}</em>
                    <code>[${esc((p.bbox || []).join(", "))}]</code>
                </article>`;
            }).join("")}
        </div>`;
    }

    function renderRcnnFocusHeader(step) {
        const meta = rcnnStepMeta(step);
        return `<header class="det-rcnn-focus-head">
            <div class="det-rcnn-focus-head__row">
                <h4>${esc(meta.title)}</h4>
                <span>${esc(meta.label)}</span>
            </div>
            <p>${esc(meta.goal)}</p>
        </header>`;
    }

    function renderCropPatch(label, proposal, extraClass = "") {
        const sample = demoImageSample();
        const imageUrl = sample.image ? (sample.image.startsWith("blob:") ? sample.image : window.cvclassUrl(sample.image)) : "";
        return `<article class="det-rcnn-patch ${extraClass}" style="--patch-url:url('${esc(imageUrl)}')">
            <span>${esc(label)}</span>
            <div class="det-rcnn-patch-image"></div>
            <code>[${esc((proposal.bbox || []).join(", "))}]</code>
        </article>`;
    }

    function renderRcnnNmsFocus(proposals, activeProposal) {
        const refinedBoxes = proposals
            .filter((p) => p.class !== "background" && (p.score >= state.conf || p.id === activeProposal.id))
            .map((p) => ({...p, bbox: p.refined || p.bbox || []}));
        const active = refinedBoxes.find((p) => idText(p.id) === idText(activeProposal.id)) || refinedBoxes[0] || activeProposal;
        const peer = refinedBoxes.find((p) => p.id !== active.id && p.class === active.class) || refinedBoxes.find((p) => p.id !== active.id);
        const pairIou = peer ? iou(active, peer) : 0;
        const suppressPeer = peer ? pairIou >= state.iou && (active.score || 0) >= (peer.score || 0) : false;
        return `<div class="det-rcnn-nms-focus">
            <section>
                <span>IoU 比较</span>
                <strong>${peer ? `${esc(active.id)} vs ${esc(peer.id)}` : `仅 ${esc(active.id || "p1")}`}</strong>
                <dl>
                    <div><dt>IoU</dt><dd>${pairIou.toFixed(2)}</dd></div>
                    <div><dt>阈值</dt><dd>${state.iou.toFixed(2)}</dd></div>
                    <div><dt>判定</dt><dd>${suppressPeer ? `抑制 ${esc(peer.id)}` : "保留候选框"}</dd></div>
                </dl>
            </section>
            <div class="det-rcnn-refined-list">
                ${refinedBoxes.slice(0, 5).map((p) => {
                    const suppressed = peer && p.id === peer.id && suppressPeer;
                    return `<article data-det-hover-id="${esc(p.id)}" data-det-related-id="${esc(p.id)}" class="${p.id === active.id ? "is-active" : ""} ${suppressed ? "is-suppressed" : ""} ${spotlightClassFor(p.id)}">
                        <span>${esc(p.id)}</span>
                        <strong>${esc(p.class)} ${Number(p.score || 0).toFixed(2)}</strong>
                        <code>[${esc((p.bbox || []).join(", "))}]</code>
                        <em>${suppressed ? "抑制" : "保留"}</em>
                    </article>`;
                }).join("")}
            </div>
        </div>`;
    }

    function renderRcnnStepFocus(demo, step, activeProposal) {
        const proposals = demo.proposals || [];
        const feature = demo.roiPooling?.featureMap || [];
        const header = renderRcnnFocusHeader(step);
        const offset = activeProposal.offset || {};
        const refined = activeProposal.refined || activeProposal.bbox || [];
        const primaryClass = activeProposal.class || "--";

        if (step.id === "image") {
            return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}<div class="det-rcnn-focus-grid det-rcnn-focus-grid--compact">
                <article class="det-rcnn-focus-copy">
                    <span>当前 proposal</span>
                    <strong>${esc(activeProposal.id || "p1")} / ${esc(primaryClass)}</strong>
                    <p>图像阶段只强调当前活跃 proposal，其余候选框降低存在感，便于观察后续生命周期。</p>
                    <dl>
                        <div><dt>图像尺寸</dt><dd>${demoImageSample().width} x ${demoImageSample().height}</dd></div>
                        <div><dt>proposal 数量</dt><dd>${proposals.length}</dd></div>
                        <div><dt>当前 bbox</dt><dd>[${esc((activeProposal.bbox || []).join(", "))}]</dd></div>
                    </dl>
                </article>
            </div>`;
        }

        if (step.id === "proposals") {
            return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}<div class="det-rcnn-focus-grid det-rcnn-focus-grid--compact">
                <article class="det-rcnn-focus-copy">
                    <span>Selective Search</span>
                    <strong>${proposals.length} 个 proposal</strong>
                    <p>先生成类别无关的候选区域。这些只是可能含有目标的区域，并不是最终检测结果。</p>
                    <dl>
                        <div><dt>当前 ID</dt><dd>${esc(activeProposal.id || "--")}</dd></div>
                        <div><dt>bbox</dt><dd>[${esc((activeProposal.bbox || []).join(", "))}]</dd></div>
                        <div><dt>CNN 前得分</dt><dd>无</dd></div>
                    </dl>
                </article>
            </div>`;
        }

        if (step.id === "crop") {
            return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}<div class="det-rcnn-crop-flow" data-det-related-id="${esc(activeProposal.id || "p1")}">
                ${renderCropPatch("原始 proposal", activeProposal, "is-source")}
                <div class="det-rcnn-flow-arrow"><span></span></div>
                ${renderCropPatch("裁剪 patch", activeProposal, "is-crop")}
                <div class="det-rcnn-flow-arrow"><span></span></div>
                ${renderCropPatch("warp 到 224 x 224", activeProposal, "is-warp")}
            </div>`;
        }

        if (step.id === "features") {
            return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}<div class="det-rcnn-feature-focus" data-det-related-id="${esc(activeProposal.id || "p1")}">
                ${renderCropPatch("归一化 patch", activeProposal, "is-feature-input")}
                <div class="det-rcnn-cnn-stack"><i>conv</i><i>relu</i><i>pool</i><i>fc</i></div>
                <section><span>特征图</span>${renderFeatureGrid(feature, ["2-4", "3-4", "4-4"])}</section>
                <div class="det-rcnn-feature-vector">${[0.22, 0.48, 0.72, 0.56, 0.88, 0.34, 0.62, 0.44].map((v, i) => `<i style="--v:${v};--delay:${i * 35}ms"></i>`).join("")}</div>
            </div>`;
        }

        if (step.id === "classifier") {
            return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}<div class="det-rcnn-classifier-focus" data-det-related-id="${esc(activeProposal.id || "p1")}">
                <article>
                    <span>proposal 特征</span>
                    <strong>${esc(activeProposal.id || "p1")}</strong>
                    <p>分类器基于该 proposal 特征，同时计算前景类别和 background 的得分。</p>
                </article>
                <section>
                    ${renderClassifierBars(activeProposal, true)}
                    <div class="det-rcnn-verdict"><span>最终类别</span><strong>${esc(primaryClass)}</strong><em>${Number(activeProposal.score || 0).toFixed(2)}</em></div>
                </section>
            </div>`;
        }

        if (step.id === "regression") {
            return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}<div class="det-rcnn-regression-focus" data-det-related-id="${esc(activeProposal.id || "p1")}">
                ${renderBBoxRegressionPanel(activeProposal, step)}
                <dl class="detection-regression-offsets">
                    <div><dt>dx</dt><dd>${offset.dx ?? "--"}</dd></div>
                    <div><dt>dy</dt><dd>${offset.dy ?? "--"}</dd></div>
                    <div><dt>dw</dt><dd>${offset.dw ?? "--"}</dd></div>
                    <div><dt>dh</dt><dd>${offset.dh ?? "--"}</dd></div>
                    <div><dt>原始框</dt><dd>[${esc((activeProposal.bbox || []).join(", "))}]</dd></div>
                    <div><dt>修正框</dt><dd>[${esc(refined.join(", "))}]</dd></div>
                </dl>
            </div>`;
        }

        return `${header}${renderRcnnLifecycleCanvas(demo, step, activeProposal)}${renderRcnnNmsFocus(proposals, activeProposal)}`;
    }

    function renderRcnnFlow(demo, step) {
        const activeProposal = activeRcnnProposal(demo);
        return `<section data-det-related-id="${esc(activeProposal.id || "p1")}" class="det-rcnn-focus-board det-rcnn-focus-board--${esc(step.id)} ${spotlightClassFor(activeProposal.id)}">
                ${renderRcnnStepFocus(demo, step, activeProposal)}
            </section>`;
    }

    function renderRoiFlow(demo, step) {
        const roi = demo.roiPooling || {};
        const bins = roi.bins || [];
        const feature = roi.featureMap || [];
        return `
            <div class="detection-roi-board">
                <section>
                    <h4>ROI 坐标映射</h4>
                    <dl>
                        <div><dt>image ROI</dt><dd>[${(roi.roi?.bbox || []).join(", ")}]</dd></div>
                        <div><dt>feature stride</dt><dd>${roi.featureStride || 16}</dd></div>
                        <div><dt>feature ROI</dt><dd>[${(roi.roi?.featureBox || []).join(", ")}]</dd></div>
                        <div><dt>pooled size</dt><dd>${(roi.pooledSize || [3, 3]).join(" × ")}</dd></div>
                    </dl>
                </section>
                <section>
                    <h4>特征图 + ROI 分箱</h4>
                    ${renderFeatureGrid(feature, ["2-3", "3-4", "4-4"])}
                </section>
                <section>
                    <h4>Max Pooling 输出</h4>
                    <div class="detection-pooled-grid">${bins.map((bin) => `<i style="--v:${bin.max}"><b>${Number(bin.max).toFixed(2)}</b><span>${esc(bin.id)}</span></i>`).join("")}</div>
                </section>
            </div>`;
    }

    function renderRpnFlow(demo, step) {
        const anchors = demo.anchors || [];
        const positives = anchors.filter((anchor) => anchor.label === "positive").length;
        const negatives = anchors.filter((anchor) => anchor.label === "negative").length;
        return `
            <div class="detection-rpn-board">
                <section>
                    <h4>特征图滑动窗口</h4>
                    <div class="detection-anchor-grid">${Array.from({length: 24}, (_, i) => `<i class="${i % 5 === 0 ? "is-hot" : ""}"><span>${i % 5 === 0 ? "k anchors" : ""}</span></i>`).join("")}</div>
                </section>
                <section>
                    <h4>Anchor 判定规则</h4>
                    <dl>
                        <div><dt>positive</dt><dd>${esc(demo.rpnRules?.positive || "IoU >= 0.70")}</dd></div>
                        <div><dt>negative</dt><dd>${esc(demo.rpnRules?.negative || "IoU < 0.30")}</dd></div>
                        <div><dt>ignore</dt><dd>${esc(demo.rpnRules?.ignore || "middle IoU")}</dd></div>
                    </dl>
                </section>
                <section>
                    <h4>RPN 输出</h4>
                    <div class="detection-rpn-score">
                        <span><b>${positives}</b> 正样本 anchors</span>
                        <span><b>${negatives}</b> 负样本 anchors</span>
                        <span><b>${anchors.length}</b> 演示 anchors 总数</span>
                    </div>
                </section>
            </div>`;
    }

    function renderRcnnOverlay(demo, sample, step) {
        const gts = demo.groundTruth || [];
        const proposals = demo.proposals || [];
        const anchors = demo.anchors || [];
        const showLow = state.showLow;

        if (state.detMode === "roi") {
            const roi = demo.roiPooling?.roi;
            return [
                roi ? demoBox({bbox: roi.bbox}, sample, "proposal", "image ROI") : "",
                ...gts.slice(0, 2).map((box) => demoBox(box, sample, "gt", `GT ${box.class}`))
            ].join("");
        }
        if (state.detMode === "rpn") {
            const processed = processRpnAnchors(demo);
            const active = step.id === "proposals" || step.id === "head" || step.id === "final";
            const boxesToRender = [];

            gts.forEach(box => boxesToRender.push(demoBox(box, sample, "gt", `GT ${box.class}`)));

            processed.forEach(anchor => {
                const isTarget = active ? (anchor.dynamicLabel === "positive") : true;
                if (!isTarget) return;
                if (anchor.isLow && !showLow) return;
                const status = anchor.isLow ? "low" : `anchor-${anchor.dynamicLabel}`;
                const label = `${anchor.id} ${anchor.isLow ? "低置信度" : anchor.dynamicLabel} IoU ${anchor.iou.toFixed(2)}`;
                boxesToRender.push(demoBox(anchor, sample, status, label));
            });
            return boxesToRender.join("");
        }

        const processedProposals = proposals.map(p => {
            const isLow = p.score < state.conf && p.id !== "p1";
            return { ...p, isLow };
        });
        const activeProposalId = activeRcnnProposal(demo).id || "p1";
        const activeProposal = processedProposals.find((item) => idText(item.id) === idText(activeProposalId)) || processedProposals[0];

        if (step.id === "regression") {
            const p = activeProposal;
            const gt = gts.find((item) => item.id === p?.target) || gts[0];
            const pClass = p.isLow ? "proposal-low" : "proposal-active";
            const pLabel = `${p.id} 原始框 ${p.isLow ? "(低置信度)" : ""}`;
            return [
                p ? demoBox(p, sample, pClass, pLabel) : "",
                gt ? demoBox(gt, sample, "gt", "真实框") : "",
                p?.refined ? demoBox({id: p.id, sourceId: p.id, bbox: p.refined}, sample, "refined", "修正框") : ""
            ].join("");
        }
        if (step.id === "nms") {
            const p = activeProposal;
            const duplicate = p?.bbox ? {bbox: [p.bbox[0] + 4, p.bbox[1] + 4, p.bbox[2] - 2, p.bbox[3] - 4]} : null;
            const isDuplicateSuppressed = state.iou >= 0.96 ? false : true;
            const boxes = [];

            processedProposals.slice(0, 4).forEach((item) => {
                if (item.isLow && !showLow) return;
                const status = item.isLow ? "low" : "refined";
                boxes.push(demoBox({id: item.id, sourceId: item.id, bbox: item.refined || item.bbox}, sample, status, `${item.class} ${item.score.toFixed(2)}`));
            });

            if (duplicate) {
                if (isDuplicateSuppressed) {
                    if (showLow) {
                        boxes.push(demoBox({...duplicate, id: p.id, sourceId: p.id}, sample, "nms-delete", "重复框（NMS 删除）"));
                    }
                } else {
                    boxes.push(demoBox({...duplicate, id: p.id, sourceId: p.id}, sample, "refined", "重复框（NMS 保留）"));
                }
            }
            return boxes.join("");
        }
        if (["image", "proposals", "crop", "features", "classifier"].includes(step.id)) {
            const p = activeProposal;
            const boxes = [];
            if (p) {
                const pClass = p.isLow ? "proposal-low" : "proposal-active";
                boxes.push(demoBox(p, sample, pClass, `${p.id} ${step.id === "image" ? "proposal" : "裁剪目标"} ${p.isLow ? "(低置信度)" : ""}`));
            }
            processedProposals.filter((box) => idText(box.id) !== idText(p?.id)).forEach((box, index) => {
                const isBackground = box.class === "background";
                const isFilterOut = box.isLow;
                if ((isBackground || isFilterOut) && !showLow) return;
                const status = (isBackground || isFilterOut) ? "low" : "proposal";
                const label = isFilterOut ? `${box.id} 低置信度` : `${box.id} ${box.class}`;
                boxes.push(demoBox(box, sample, status, label, "", `--proposal-delay:${(index + 1) * 90}ms;`));
            });
            return boxes.join("");
        }
        return processedProposals.map((box, index) => {
            const isBackground = box.class === "background";
            if ((isBackground || box.isLow) && !showLow) return "";
            const status = (isBackground || box.isLow) ? "low" : "proposal";
            return demoBox(box, sample, status, `${box.id} ${box.class}`, "", `--proposal-delay:${index * 90}ms;`);
        }).filter(Boolean).join("");
    }

    function renderRcnnStageMotion(demo, sample, step) {
        if (state.detMode !== "rcnn") return "";
        const proposals = demo.proposals || [];
        const p = activeRcnnProposal(demo);
        if (!p?.bbox) return "";
        const phase = step.id || "image";
        const center = imagePointPercent(boxCenter(p), sample);
        const refinedBox = p.refined ? {id: `${p.id}-refined`, class: p.class, score: p.score, bbox: p.refined} : null;
        const activePulse = `<i class="det-algo-pulse is-rcnn-active" style="${centerStyle(p, sample, "--pulse-color:#8b5cf6;")}"></i>`;
        let flow = "";
        let chip = "";
        let pulses = activePulse;
        let sparks = "";

        if (phase === "proposals") {
            pulses = renderStagePulses(proposals.filter((item) => item.bbox), sample, "is-rcnn-proposal");
            chip = `<div class="det-algo-chip det-algo-chip--rcnn det-algo-chip--corner">
                <b>${esc(p.id || "p1")} proposal</b><span>类别无关区域从图像中生成</span>
            </div>`;
        } else if (phase === "image") {
            chip = `<div class="det-algo-chip det-algo-chip--rcnn det-algo-chip--corner">
                <b>当前 proposal</b><span>${esc(p.id || "p1")} 保持在原图语境中</span>
            </div>`;
        } else if (phase === "crop") {
            flow = `<svg class="det-algo-flow-svg det-algo-flow-svg--rcnn" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M ${center.x.toFixed(1)} ${center.y.toFixed(1)} C ${(center.x + 10).toFixed(1)} ${(center.y + 4).toFixed(1)}, 68 42, 82 34"></path>
            </svg>`;
            chip = `<div class="det-algo-chip det-algo-chip--rcnn" style="left:82%;top:34%;"><b>crop / warp</b><span>[${esc((p.bbox || []).join(", "))}] → 224 x 224</span></div>`;
        } else if (phase === "features") {
            flow = `<svg class="det-algo-flow-svg det-algo-flow-svg--rcnn" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M ${center.x.toFixed(1)} ${center.y.toFixed(1)} C 48 48, 62 58, 76 58"></path>
            </svg>`;
            chip = `<div class="det-algo-chip det-algo-chip--rcnn" style="left:76%;top:58%;"><b>CNN 特征</b><span>patch → 特征向量</span></div>`;
        } else if (phase === "classifier") {
            chip = `<div class="det-algo-chip det-algo-chip--rcnn" style="left:${center.x}%;top:${Math.max(8, center.y - 18)}%;">
                <b>${esc(p.class || "类别")} ${Number(p.score || 0).toFixed(2)}</b><span>分类器选择前景类别</span>
            </div>`;
        } else if (phase === "regression" && refinedBox) {
            const points = flowLinePoints(p, refinedBox, sample);
            flow = `<svg class="det-algo-flow-svg det-algo-flow-svg--rcnn" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1="${points.ap.x}" y1="${points.ap.y}" x2="${points.bp.x}" y2="${points.bp.y}"></line>
            </svg>`;
            chip = `<div class="det-algo-chip det-algo-chip--rcnn" style="left:${points.mp.x}%;top:${points.mp.y}%;">
                <b>边界框回归</b><span>dx ${esc(p.offset?.dx ?? "--")} / dy ${esc(p.offset?.dy ?? "--")}</span>
            </div>`;
            sparks = Array.from({length: 6}, (_, index) => `<i class="det-algo-spark is-rcnn" style="${centerStyle(refinedBox, sample, `--i:${index};`)}"></i>`).join("");
        } else if (phase === "nms") {
            const refined = proposals.filter((item) => item.class !== "background").map((item) => ({...item, bbox: item.refined || item.bbox}));
            return `<div class="det-algo-motion det-algo-motion--rcnn det-algo-motion--rcnn-${esc(phase)}">
                ${renderStagePulses(refined, sample, "is-rcnn-final")}
                <div class="det-algo-chip det-algo-chip--rcnn"><b>NMS / 最终</b><span>${refined.length} 个修正框 → 重复框抑制</span></div>
            </div>`;
        }

        return `<div class="det-algo-motion det-algo-motion--rcnn det-algo-motion--rcnn-${esc(phase)}">
            ${flow}${pulses}${sparks}${chip}
        </div>`;
    }

    function renderRcnnTable(demo) {
        if (state.detMode === "roi") {
            const bins = demo.roiPooling?.bins || [];
            if (els.tableTitle) els.tableTitle.textContent = "ROI 分箱";
            els.candidateTable.innerHTML = `<thead><tr><th>BIN</th><th>特征范围</th><th>最大值</th><th>输出</th><th>状态</th></tr></thead><tbody>${bins.map((bin) => `<tr><td>${esc(bin.id)}</td><td>${esc(bin.range)}</td><td>${Number(bin.max).toFixed(2)}</td><td>池化单元</td><td><span>最大值</span></td></tr>`).join("")}</tbody>`;
            return;
        }
        if (state.detMode === "rpn") {
            const processedAnchors = processRpnAnchors(demo);
            if (els.tableTitle) els.tableTitle.textContent = "Anchor 列表";
            els.candidateTable.innerHTML = `<thead><tr><th>ID</th><th>GT</th><th>IoU</th><th>objectness / offset</th><th>标签</th></tr></thead><tbody>${processedAnchors.map((a) => {
                const labelClass = a.isLow ? "low-confidence" : `is-${a.dynamicLabel}`;
                const statusText = a.isLow
                    ? `低 objectness (<${state.conf.toFixed(2)})`
                    : a.dynamicLabel === "positive"
                        ? `正样本 (IoU >= ${state.iou.toFixed(2)})`
                        : a.dynamicLabel === "negative"
                            ? `负样本 (IoU < 0.3)`
                            : `忽略 (0.3 <= IoU < ${state.iou.toFixed(2)})`;
                return `<tr class="${labelClass}"><td>${esc(a.id)}</td><td>${esc(a.gt || "background")}</td><td>${a.iou.toFixed(2)}</td><td>${a.objectness.toFixed(2)} / (${a.offset.dx}, ${a.offset.dy}, ${a.offset.dw}, ${a.offset.dh})</td><td><span>${statusText}</span></td></tr>`;
            }).join("")}</tbody>`;
            return;
        }
        const proposals = demo.proposals || [];
        const step = activeRcnnStep();
        const active = activeRcnnProposal(demo);
        const activeId = active.id || "p1";
        const hoverAttrs = (id) => `data-det-hover-id="${esc(id)}" data-det-related-id="${esc(id)}"`;
        const rowClassFor = (id, extra = "") => `${idText(id) === idText(activeId) ? "is-active-row is-active" : ""} ${extra} ${spotlightClassFor(id)}`;
        const setTable = (title, header, rows) => {
            if (els.tableTitle) els.tableTitle.textContent = title;
            els.candidateTable.innerHTML = `<thead><tr>${header.map((item) => `<th>${esc(item)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>`;
        };

        if (step.id === "image" || step.id === "crop") {
            setTable("当前步骤信息", ["ID", "类别", "得分", "BBOX", "状态"], [
                `<tr ${hoverAttrs(activeId)} class="${rowClassFor(activeId)}"><td>${esc(activeId)}</td><td>${esc(active.class || "--")}</td><td>${Number(active.score || 0).toFixed(2)}</td><td>[${esc((active.bbox || []).join(", "))}]</td><td><span>${step.id === "crop" ? "裁剪目标" : "当前 proposal"}</span></td></tr>`
            ]);
            return;
        }

        if (step.id === "proposals") {
            setTable("Proposal 列表", ["ID", "类别", "得分", "BBOX", "状态"], proposals.slice(0, 5).map((p) => {
                const isLow = p.score < state.conf && p.id !== "p1";
                return `<tr ${hoverAttrs(p.id)} class="${rowClassFor(p.id, isLow || p.class === "background" ? "low-confidence" : "candidate")}"><td>${esc(p.id)}</td><td>${esc(p.class || "proposal")}</td><td>${p.score.toFixed(2)}</td><td>[${esc((p.bbox || []).join(", "))}]</td><td><span>${isLow ? `低于阈值 ${state.conf.toFixed(2)}` : "proposal"}</span></td></tr>`;
            }));
            return;
        }

        if (step.id === "features") {
            const feature = demo.roiPooling?.featureMap || [];
            setTable("特征摘要", ["单元", "来源", "形状", "输出", "状态"], [
                `<tr class="is-active"><td>patch</td><td>${esc(activeId)}</td><td>[${esc((active.bbox || []).join(", "))}]</td><td>224 x 224</td><td><span>已归一化输入</span></td></tr>`,
                `<tr><td>conv map</td><td>${feature.length} 行</td><td>${feature[0]?.length || 0} 列</td><td>区域特征图</td><td><span>激活</span></td></tr>`,
                `<tr><td>vector</td><td>fc 特征</td><td>8 个演示维度</td><td>分类器输入</td><td><span>就绪</span></td></tr>`
            ]);
            return;
        }

        if (step.id === "classifier") {
            const primaryClass = active.class || "proposal";
            const score = Number(active.score || 0);
            setTable("分类器得分", ["ID", "类别", "得分", "含义", "状态"], [
                `<tr class="is-active-row is-active"><td>${esc(activeId)}</td><td>${esc(primaryClass)}</td><td>${score.toFixed(2)}</td><td>最高类别分数</td><td><span>已选中</span></td></tr>`,
                `<tr><td>${esc(activeId)}</td><td>background</td><td>${Math.max(0.08, (1 - score) * 0.45).toFixed(2)}</td><td>背景分数</td><td><span>候选</span></td></tr>`
            ]);
            return;
        }

        if (step.id === "regression") {
            const offset = active.offset || {};
            const refined = active.refined || active.bbox || [];
            const rows = [
                ["dx", offset.dx, "中心横向平移"],
                ["dy", offset.dy, "中心纵向平移"],
                ["dw", offset.dw, "宽度对数缩放"],
                ["dh", offset.dh, "高度对数缩放"]
            ].map(([key, value, meaning]) => `<tr class="is-active"><td>${esc(activeId)}</td><td>${esc(key)}</td><td>${esc(value ?? "--")}</td><td>${esc(meaning)}</td><td><span>应用</span></td></tr>`);
            rows.push(`<tr ${hoverAttrs(activeId)} class="${rowClassFor(activeId)}"><td>${esc(activeId)}</td><td>box</td><td>[${esc((active.bbox || []).join(", "))}]</td><td>[${esc(refined.join(", "))}]</td><td><span>已修正</span></td></tr>`);
            setTable("边界框回归", ["ID", "值", "原始框", "修正 / 含义", "状态"], rows);
            return;
        }

        setTable("NMS / 最终框", ["ID", "类别", "得分", "修正框", "判定"], proposals
            .filter((p) => p.class !== "background")
            .slice(0, 5)
            .map((p) => {
                const duplicate = p.id === "p2" && state.iou <= 0.75;
                return `<tr ${hoverAttrs(p.id)} class="${rowClassFor(p.id, duplicate ? "is-suppressed" : "is-kept")}"><td>${esc(p.id)}</td><td>${esc(p.class)}</td><td>${p.score.toFixed(2)}</td><td>[${esc((p.refined || p.bbox || []).join(", "))}]</td><td><span>${duplicate ? "抑制" : "保留"}</span></td></tr>`;
            }));
    }

    function renderRcnnTeachingDashboard(step, demo, proposal) {
        const proposals = demo.proposals || [];
        const phase = step.id || "image";
        const formulaByPhase = {
            image: "I \\rightarrow \\{p_i\\}",
            proposals: "P = SelectiveSearch(I)",
            crop: "patch_i = Warp(I[p_i], 224,224)",
            features: "f_i = CNN(patch_i)",
            classifier: "score_c = Softmax(W_c f_i)",
            regression: "x' = x_p + d_x \\cdot w_p",
            nms: "IoU=\\frac{|B_i \\cap B_j|}{|B_i \\cup B_j|}"
        };
        const lineByPhase = {
            image: "先在原图语境中锁定当前 proposal，后续所有计算都围绕它展开。",
            proposals: "Selective Search 只生成类别无关的候选区域，还不是检测结果。",
            crop: "当前 proposal 从原图中被裁剪，再 warp 成 CNN 可接受的固定尺寸。",
            features: "CNN 把 patch 压缩成语义特征向量，分类和回归共享这段表示。",
            classifier: "分类头只判断这个 proposal 更像哪一类，背景会被排除。",
            regression: "回归头输出 dx/dy/dw/dh，将粗 proposal 修正为精细边界框。",
            nms: "完成分类和修正后，再用 IoU 去重保留最终检测框。"
        };
        const flow = [
            {id: "proposals", label: "候选"},
            {id: "crop", label: "裁剪"},
            {id: "features", label: "特征"},
            {id: "classifier", label: "分类"},
            {id: "regression", label: "修正"},
            {id: "nms", label: "NMS"}
        ];
        const activeFlow = phase === "image" ? "proposals" : phase;
        const refined = proposal.refined || proposal.bbox || [];
        const hasRefinedOutput = phase === "regression" || phase === "nms";
        return `<section class="det-teach-dashboard det-teach-dashboard--rcnn">
            <div class="det-teach-one-line"><span>${esc(({
                image: "图像",
                proposals: "候选框",
                crop: "裁剪 / ROI",
                features: "CNN 特征",
                classifier: "分类器",
                regression: "边界框回归",
                nms: "NMS / 最终"
            })[phase] || phase)}</span><p>${esc(lineByPhase[phase] || lineByPhase.proposals)}</p></div>
            <div class="det-teach-formula">${renderLatex(formulaByPhase[phase] || formulaByPhase.proposals)}</div>
            ${renderRcnnAlgoSymbol(phase, proposal)}
            ${renderMiniFlow(flow, activeFlow)}
            <div class="det-teach-stats">
                <span><b>${proposals.length}</b><em>候选</em></span>
                <span><b>${esc(proposal.id || "--")}</b><em>当前</em></span>
                <span><b>${Number(proposal.score || 0).toFixed(2)}</b><em>得分</em></span>
                <span><b>${esc(proposal.class || "--")}</b><em>类别</em></span>
            </div>
            <div class="det-teach-boxline">
                <span><b>${hasRefinedOutput ? "原始框" : "当前 bbox"}</b><code>[${esc((proposal.bbox || []).join(", "))}]</code></span>
                <i></i>
                <span><b>${hasRefinedOutput ? "修正框" : "下一输出"}</b><code>${hasRefinedOutput ? `[${esc(refined.join(", "))}]` : "待计算"}</code></span>
            </div>
        </section>`;
    }

    function renderRcnnNotes(demo, step) {
        const proposals = demo.proposals || [];
        const anchors = demo.anchors || [];
        const p = activeRcnnProposal(demo);
        const roi = demo.roiPooling || {};
        if (state.detMode === "rcnn") {
            const stageCopy = {
                image: {
                    stage: "候选区域建议 (Selective Search)",
                    text: "两阶段目标检测（如 Faster R-CNN）先产生与类别无关的候选提取框 (proposal)，然后对每个候选区域进行提取特征图、分类和边界回归精细修复。",
                    data: [
                        ["输入图像", `${demoImageSample().width} × ${demoImageSample().height}`],
                        ["第一阶段", "生成候选区域建议框"],
                        ["第二阶段", "特征提取/分类器/公式偏移回归"],
                        ["当前步骤活跃检测候选框", p.id || "--"]
                    ]
                },
                proposals: {
                    stage: "候选区域建议 (Selective Search)",
                    text: "通过无监督颜色/纹理融合，Selective Search 自动把相似图案合并，聚类成约 2000 个不带类别的边界范围候选建议（p1、p2 等）。",
                    data: [
                        ["当前生成的建议框总数", proposals.length],
                        ["建议框 p1 原始坐标", `[${(p.bbox || []).join(", ")}]`],
                        ["提取类型", "类别无关的多变像素区域"],
                        ["下一步操作", "提取对应的原图小图 (Crop/Warp)"]
                    ]
                },
                crop: {
                    stage: "图像裁剪缩放 (Crop / Warp)",
                    text: "R-CNN 会从原图中裁出当前活跃 proposal，并把它 warp 到 CNN 固定输入尺寸。",
                    data: [
                        ["当前 proposal", p.id || "--"],
                        ["原始 bbox", `[${(p.bbox || []).join(", ")}]`],
                        ["裁剪操作", "裁剪多变区域图像 + 强制拉伸缩放"],
                        ["CNN 输入数据", "格式统一的边界图像块 (Tensor)"]
                    ]
                },
                features: {
                    stage: "CNN 卷积特征提取",
                    text: "裁剪缩放后的建议框传入神经网络进行多次卷积，输出一个固定维度的特征向量。传统 R-CNN 中为了避免这步带来大量计算消耗，Fast R-CNN 阶段转为了将整张图做一次卷积后再在特征图上进行 ROI 映射。",
                    data: [
                        ["当前 proposal", p.id || "--"],
                        ["特征图提取来源", "小图片段"],
                        ["特征图属性", "该区域的高维语义特征描述子"],
                        ["运算算力开销", "极高（对2000个框重复进行2000次CNN计算）"]
                    ]
                },
                classifier: {
                    stage: "类别独立分类器 (SVM / Softmax)",
                    text: "该区域特征会被送入特定类别的分类器（如支持向量机 SVM），输出当前建议框属于人、车辆等类别及背景概率，若置信度过低或背景得分高将会在后处理中被直接删除。",
                    data: [
                        ["当前 proposal", p.id || "--"],
                        ["回归分类所属类别", p.class || "--"],
                        ["分类置信度得分", Number.isFinite(p.score) ? p.score.toFixed(2) : "--"],
                        ["过滤剔除机制", "得分低或非前景框的候选直接舍弃"]
                    ]
                },
                regression: {
                    stage: "边界框回归偏移修正",
                    text: "回归器根据特征计算出横向平移 dx、纵向平移 dy、宽度放缩 dw、高度放缩 dh 四个参数，微调原本极粗糙的预设候选框坐标，使最终检测框极其贴合边界。",
                    data: [
                        ["原始建议候选框坐标", `[${(p.bbox || []).join(", ")}]`],
                        ["回归计算偏移量 (offsets)", `dx ${p.offset?.dx ?? "--"} / dy ${p.offset?.dy ?? "--"} / dw ${p.offset?.dw ?? "--"} / dh ${p.offset?.dh ?? "--"}`],
                        ["回归计算修正后坐标", `[${(p.refined || []).join(", ")}]`],
                        ["生命周期", "proposal → 修正检测框"]
                    ]
                },
                nms: {
                    stage: "同类候选框极大值剔除 (NMS)",
                    text: "经过前边分类和回归的物体框可能在同一个物理物体上大段重叠，NMS (非极大值抑制) 对同类别的候选框进行两两交并比 IoU 计算，保留最高分数框并抑制删除其他重复重合框。",
                    data: [
                        ["非极大值抑制输入", "所有完成类别分类并回归修偏的稳定框"],
                        ["最终决策保留框", `${p.id || "p1"} ${p.class || "--"} ${Number.isFinite(p.score) ? p.score.toFixed(2) : "--"}`],
                        ["决策剔除重叠框", "两两 IoU 特别高且分数较低的冗余框"],
                        ["最终输出", "目标检测全链路过滤后的精细对象数组"]
                    ]
                }
            };
            const copy = stageCopy[step.id] || stageCopy.image;
            els.notesTitle.textContent = "两阶段目标检测原理";
            els.notesSubtitle.textContent = "两阶段逻辑图解";
            els.notesTutorial.innerHTML = `<p><span class="det-note-stage">${esc(copy.stage)}</span><strong>${esc(step.title)}</strong>${esc(copy.text)}</p>`;

            els.notes.innerHTML = `<dl>${copy.data.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${renderRcnnTeachingDashboard(step, demo, p)}`;
            return;
        }
        const processedAnchorsForNotes = processRpnAnchors(demo);
        const positiveCount = processedAnchorsForNotes.filter((anchor) => anchor.dynamicLabel === "positive" && !anchor.isLow).length;
        const negativeCount = processedAnchorsForNotes.filter((anchor) => anchor.dynamicLabel === "negative" || anchor.isLow).length;
        const copy = {
            rcnn: {
                title: "两阶段检测机制",
                tutorial: `<p><strong>当前机制解决的问题：</strong>滑动窗口位置、尺度和长宽比组合爆炸。R-CNN 用 proposal 先筛掉大量背景区域，再执行裁剪归一化、CNN 特征提取、分类、边界框回归与 NMS。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>用 proposal 减少滑窗搜索空间，并通过边界框回归修正候选框。</dd></div>
                    <div><dt>输入结构</dt><dd>图像 + ${proposals.length} 个 proposal，每个 proposal 会裁剪并归一化到 CNN 输入尺寸。</dd></div>
                    <div><dt>中间输出</dt><dd>proposal → 裁剪 / warp → CNN 特征 → 分类分数 → 边界框回归偏移量。</dd></div>
                    <div><dt>关键规则 / 公式</dt><dd>bbox' = bbox + (dx, dy, dw, dh)，当前 dx ${p.offset?.dx ?? "--"} / dy ${p.offset?.dy ?? "--"} / dw ${p.offset?.dw ?? "--"} / dh ${p.offset?.dh ?? "--"}。</dd></div>
                    <div><dt>与 YOLO / NMS 的关系</dt><dd>R-CNN 是两阶段；YOLO 是单阶段密集预测。两者最终都需要 NMS 去掉同类重复框。</dd></div>
                    <div><dt>本页链路</dt><dd>proposal ${esc(p.id || "--")} → 裁剪 / warp → CNN 特征 → 分类 ${esc(p.class || "--")} → 边界框回归 → NMS。</dd></div>
                </dl>`
            },
            roi: {
                title: "Fast R-CNN / ROI Pooling",
                tutorial: `<p><strong>当前机制解决的问题：</strong>早期 R-CNN 对每个 proposal 重复跑 CNN。ROI Pooling 让整图共享特征图，再把每个 ROI 转成固定尺寸特征。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>避免每个 proposal 单独卷积，统一映射到共享特征图。</dd></div>
                    <div><dt>输入结构</dt><dd>图像 ROI [${(roi.roi?.bbox || []).join(", ")}] + 特征图，stride ${roi.featureStride || 16}。</dd></div>
                    <div><dt>中间输出</dt><dd>特征图 ROI [${(roi.roi?.featureBox || []).join(", ")}] → pooling 网格 ${(roi.pooledSize || [3, 3]).join(" × ")}。</dd></div>
                    <div><dt>关键规则 / 公式</dt><dd>每个 bin 取最大池化，输出固定尺寸特征，再送入分类器与 bbox 回归头。</dd></div>
                    <div><dt>与 YOLO / NMS 的关系</dt><dd>ROI Pooling 属于两阶段检测头；YOLO 直接从网格预测框。ROI 后的分类框仍需 NMS 去重。</dd></div>
                    <div><dt>本页链路</dt><dd>图像 ROI → 特征图 ROI → pooling 网格 → 最大池化 → 定长特征输出。</dd></div>
                </dl>`
            },
            rpn: {
                title: "Faster R-CNN / RPN Anchor",
                tutorial: `<p><strong>当前机制解决的问题：</strong>用可学习的 RPN 替代 Selective Search。RPN 在特征图上滑动，为每个 anchor 预测前景分数和 bbox 偏移。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>自动生成高质量候选框，减少手工候选区域生成成本。</dd></div>
                    <div><dt>输入结构</dt><dd>共享特征图 + ${anchors.length} 个 anchors（正样本 ${positiveCount} / 负样本 ${negativeCount}）。</dd></div>
                    <div><dt>中间输出</dt><dd>每个 anchor 输出前景分数和 bbox 偏移，再筛选为 proposal。</dd></div>
                    <div><dt>关键规则 / 公式</dt><dd>正样本: ${esc(demo.rpnRules?.positive || "IoU >= 0.70")}；负样本: ${esc(demo.rpnRules?.negative || "IoU < 0.30")}；proposal = anchor + offset。</dd></div>
                    <div><dt>与 YOLO / NMS 的关系</dt><dd>RPN 是两阶段的候选框生成器；YOLO 直接输出检测框。RPN 候选框和最终检测通常都要经过 NMS。</dd></div>
                    <div><dt>本页链路</dt><dd>anchor 总数 ${anchors.length} → 前景分数 → bbox 偏移 → proposal 输出 → Fast R-CNN 头。</dd></div>
                </dl>`
            }
        }[state.detMode];
        els.notesTitle.textContent = copy.title;
        els.notesSubtitle.textContent = copy.subtitle;
        els.notesTutorial.innerHTML = copy.tutorial;
        els.notes.innerHTML = copy.data;
    }

    function processRpnAnchors(demo) {
        const anchors = demo.anchors || [];
        return anchors.map((anchor) => {
            let label = "ignore";
            if (anchor.iou >= state.iou) {
                label = "positive";
            } else if (anchor.iou < 0.3) {
                label = "negative";
            }
            const isLow = anchor.objectness < state.conf;
            return {
                ...anchor,
                dynamicLabel: label,
                isLow
            };
        });
    }

    function renderRcnnMode() {
        setModeTheme("rcnn");
        updateModeButtons();
        const demo = demoData();
        const sample = demoImageSample();
        const step = activeRcnnStep();
        const steps = activeRcnnSteps();
        const activeProposal = activeRcnnProposal(demo);
        if (els.pipeline) els.pipeline.hidden = true;
        if (els.featureView) {
            els.featureView.hidden = true;
            els.featureView.innerHTML = "";
        }
        if (els.nmsControl) {
            els.nmsControl.hidden = true;
            els.nmsControl.innerHTML = "";
        }
        if (els.pairCard) {
            els.pairCard.hidden = true;
            els.pairCard.innerHTML = "";
        }

        // 同步阈值滑动条与其数值文本显示
        els.confOut.textContent = state.conf.toFixed(2);
        els.iouOut.textContent = state.iou.toFixed(2);
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);

        syncDetectionImage(sample);
        updateImageRenderRect(sample);
        els.missing.textContent = "";
        els.missing.style.display = "none";
        els.rcnnStage.hidden = false;

        // 动态计数计算
        let rcnnTotalCount = 0;
        let rcnnKeptCount = 0;
        if (state.detMode === "rpn") {
            const processedAnchors = processRpnAnchors(demo);
            rcnnTotalCount = processedAnchors.length;
            rcnnKeptCount = processedAnchors.filter(a => a.dynamicLabel === "positive" && !a.isLow).length;
        } else if (state.detMode === "roi") {
            rcnnTotalCount = 1;
            rcnnKeptCount = (demo.roiPooling?.roi) ? 1 : 0;
        } else {
            const proposals = demo.proposals || [];
            const ssProposals = proposals.filter(p => p.class !== "background");
            rcnnTotalCount = ssProposals.length;
            const survivesConf = ssProposals.filter(p => p.score >= state.conf || p.id === "p1");
            const isDuplicateSuppressed = state.iou >= 0.96 ? true : false;
            rcnnKeptCount = survivesConf.length;
            if (step.id === "nms" && !isDuplicateSuppressed) {
                rcnnKeptCount += 1;
            }
        }

        els.overlay.innerHTML = demo.version ? renderRcnnOverlay(demo, sample, step) + renderRcnnStageMotion(demo, sample, step) : "";
        els.total.textContent = String(rcnnTotalCount);
        els.kept.textContent = String(rcnnKeptCount);
        els.stageSource.textContent = state.detMode === "rcnn" ? "两阶段 proposal 生命周期" : state.detMode === "roi" ? "Fast R-CNN ROI Pooling" : "Faster R-CNN 之全特征图 RPN 滑窗区域";
        els.stageBackend.textContent = state.detMode === "rcnn" ? "候选生成: Selective Search" : "推理组件: 前端课程精选交互模型演示数据";
        els.stageInference.textContent = state.detMode === "rcnn" ? "CNN 头: 概念演示" : "计算层: 滑动窗口参数";
        els.stageCandidates.textContent = state.detMode === "rcnn" ? `候选框: ${els.total.textContent}` : `锚框候选: ${els.total.textContent}`;
        els.stageFinal.textContent = state.detMode === "rcnn" ? `修正框: ${els.kept.textContent}` : `最终检测出: ${els.kept.textContent}`;
        els.stepLabel.textContent = `${step.title} · 步骤 ${state.rcnnStep + 1} / ${steps.length}`;
        els.runtimeStats.innerHTML = state.detMode === "rcnn"
            ? `<div><dt>阶段 1</dt><dd>Selective Search 候选框</dd></div><div><dt>当前阶段</dt><dd>${esc(step.title)}</dd></div><div><dt>当前步骤活跃检测候选框</dt><dd>${esc(activeProposal.id || "p1")}</dd></div><div><dt>阶段 2</dt><dd>CNN 特征 + 分类器 + bbox 回归</dd></div>`
            : `<div><dt>方法</dt><dd>${esc(state.detMode)}</dd></div><div><dt>当前阶段</dt><dd>${esc(step.title)}</dd></div><div><dt>真实标注框</dt><dd>${(demo.groundTruth || []).length}</dd></div><div><dt>NMS</dt><dd>最终多类别重复目标去重剔除</dd></div>`;
        els.classStats.innerHTML = state.detMode === "rcnn"
            ? `<span><i style="background:#7c3aed"></i>候选框<strong>${(demo.proposals || []).length}</strong></span><span><i style="background:#4f46e5"></i>修正框<strong>${rcnnKeptCount}</strong></span><span><i style="background:#ef4444"></i>背景/低分<strong>${(demo.proposals || []).filter((p) => p.class === "background" || (p.score < state.conf && p.id !== "p1")).length}</strong></span>`
            : `<span><i style="background:#2563eb"></i>候选框<strong>${(demo.anchors || []).length}</strong></span><span><i style="background:#22c55e"></i>正 anchor<strong>${rcnnKeptCount}</strong></span><span><i style="background:#ef4444"></i>负 anchor<strong>${processRpnAnchors(demo).filter((a) => a.dynamicLabel === "negative" || a.isLow).length}</strong></span>`;
        renderRcnnTable(demo);
        setStepper(steps, step.id);
        renderRcnnNotes(demo, step);
        renderRcnnCourseConsole(demo, step);
        const notesEl = document.querySelector(".det-notes-tutorial");
        if (notesEl) {
            notesEl.classList.add("is-active");
            clearTimeout(notesEl._activeTimer);
            notesEl._activeTimer = setTimeout(() => notesEl.classList.remove("is-active"), 800);
        }
        if (!demo.version) {
            els.rcnnStage.innerHTML = `<div class="vision-empty-result">R-CNN 演示数据加载中...</div>`;
            return;
        }
        els.rcnnStage.innerHTML = state.detMode === "roi" ? renderRoiFlow(demo, step) : state.detMode === "rpn" ? renderRpnFlow(demo, step) : renderRcnnFlow(demo, step);
        applySpotlightState();
    }

    function render() {
        if (state.detMode !== "yolo") {
            renderRcnnMode();
            return;
        }
        setModeTheme("yolo");
        updateModeButtons();
        if (els.rcnnStage) els.rcnnStage.hidden = true;
        const result = compute();
        const s = result.sample;
        const counts = yoloCounts(result);
        state.step = Math.min(state.step, result.steps.length - 1);
        const step = result.steps[state.step] || result.steps[0];
        syncDetectionImage(s);
        renderYoloFeatureView(step, result);
        updateImageRenderRect(s);
        els.missing.textContent = "";
        els.missing.style.display = "none";
        els.confOut.textContent = state.conf.toFixed(2);
        els.iouOut.textContent = state.iou.toFixed(2);
        if (els.heatmapType) els.heatmapType.value = state.heatmapType;
        if (els.heatmapClass) els.heatmapClass.value = state.heatmapClass;
        if (els.heatmapAlpha) els.heatmapAlpha.value = String(state.heatmapAlpha);
        if (els.heatmapAlphaOut) els.heatmapAlphaOut.textContent = `${Math.round(state.heatmapAlpha * 100)}%`;
        els.total.textContent = String(counts.decoded);
        els.total.classList.remove("det-count-roll");
        void els.total.offsetWidth;
        els.total.classList.add("det-count-roll");
        els.kept.textContent = String(counts.final);
        els.kept.classList.remove("det-count-roll");
        void els.kept.offsetWidth;
        els.kept.classList.add("det-count-roll");
        const yoloStepTitle = (yoloStepper.find((item) => item.id === step.phase) || {}).title || step.phase;
        els.stepLabel.textContent = `${yoloStepTitle} · 步骤 ${state.step + 1} / ${result.steps.length}`;

        const shouldDrawLow = state.showLow && ["decode", "confidence"].includes(step.phase);
        const statusLayers = {low: [], suppressed: [], candidate: [], raw: [], "compare-b": [], "compare-a": [], kept: []};
        overlayBoxesForStep(result, step).forEach((box) => {
            const status = statusForBox(box, step, result);
            if (status === "low" && !shouldDrawLow) return;
            statusLayers[status]?.push(boxMarkup(box, s, status));
        });
        const boxMarkupAll = [
            ...statusLayers.low,
            ...statusLayers.raw,
            ...statusLayers.candidate,
            ...statusLayers["compare-b"],
            ...statusLayers["compare-a"],
            ...statusLayers.suppressed,
            ...statusLayers.kept
        ].join("");
        const c = step.comparison;
        const interMarkup = c?.inter.area > 0 ? `<div class="vision-iou-intersection" style="${imageRectStyle(c.inter.x1, c.inter.y1, c.inter.width, c.inter.height, s.width, s.height)}"></div>` : "";
        const iouBadge = c ? `<div class="det-iou-badge"><span>IoU</span><strong>${c.iou.toFixed(3)}</strong><small>${c.suppress ? "抑制 B" : "保留 B"}</small></div>` : "";
        els.overlay.innerHTML = boxMarkupAll + interMarkup + iouBadge + renderYoloStageMotion(step, result, s) + renderNmsSlowMotionLayer(step, result, s);

        if (step.type === "decode" && result.candidates.length > 0) {
            const burst = document.createElement("div");
            burst.className = "det-particle-burst";
            burst.style.left = "50%";
            burst.style.top = "50%";
            els.overlay.appendChild(burst);
            setTimeout(() => burst.remove(), 600);
        }

        renderSourceControls();
        renderRuntimeMetrics(result);
        renderCandidateTable(result, step);
        renderPairCard(step);
        renderNmsController(step, result);
        renderClassStats(result);
        renderStepper(step);
        renderYoloDecodePipeline(step, result);
        renderNotes(step, result);
        const notesEl = document.querySelector(".det-notes-tutorial");
        if (notesEl) {
            notesEl.classList.add("is-active");
            clearTimeout(notesEl._activeTimer);
            notesEl._activeTimer = setTimeout(() => notesEl.classList.remove("is-active"), 800);
        }
        applySpotlightState();
    }

    function renderClassControls(reset = true) {
        const boxes = currentScene().boxes || [];
        const classes = [...new Set(boxes.map((box) => box.class))];
        if (reset) state.classes = new Set(classes);
        renderHeatmapClassControls(classes);
        if (!classes.length) {
            els.classFilter.innerHTML = `<p class="detection-empty-hint">当前暂无检测框类别。</p>`;
            return;
        }
        els.classFilter.innerHTML = classes.map((name) => {
            const box = boxes.find((item) => item.class === name);
            return `<label class="vision-check-row"><input type="checkbox" value="${esc(name)}" ${state.classes.has(name) ? "checked" : ""}><span><i style="background:${esc(colorFor(box || {class: name}))}"></i>${esc(name)}</span></label>`;
        }).join("");
        els.classFilter.querySelectorAll("input").forEach((input) => {
            input.addEventListener("change", () => {
                state.classes = new Set([...els.classFilter.querySelectorAll("input:checked")].map((node) => node.value));
                state.step = Math.min(state.step, compute().steps.length - 1);
                render();
            });
        });
    }

    function renderHeatmapClassControls(classes = []) {
        if (!els.heatmapClass) return;
        const current = state.heatmapClass || "all";
        const available = ["all", ...classes];
        if (!available.includes(current)) state.heatmapClass = "all";
        els.heatmapClass.innerHTML = available.map((name) => {
            const label = name === "all" ? "All 全部" : name;
            return `<option value="${esc(name)}">${esc(label)}</option>`;
        }).join("");
        els.heatmapClass.value = state.heatmapClass;
    }

    function renderSamplePicker() {
        const samples = state.data?.samples || [];
        if (!els.sampleGrid) return;
        els.sampleGrid.innerHTML = samples.map((item) => `
            <button type="button" class="vis-sample-picker__card${item.id === state.sampleId ? " is-active" : ""}" data-det-sample-card="${esc(item.id)}">
                <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">
                <span>${esc(item.name)}</span>
            </button>
        `).join("");
        els.sampleGrid.querySelectorAll("[data-det-sample-card]").forEach((button) => {
            button.addEventListener("click", () => {
                if (button.dataset.detSampleCard === state.sampleId) {
                    closeSamplePicker();
                    return;
                }
                selectSample(button.dataset.detSampleCard);
                closeSamplePicker();
            });
        });
        updateSampleLabel();
    }

    function updateSampleLabel() {
        const s = state.data?.samples.find((item) => item.id === state.sampleId);
        if (els.sampleLabel) els.sampleLabel.textContent = s ? s.name : "选择示例图";
    }

    function openSamplePicker() {
        els.sample?.classList.add("is-open");
    }
    function closeSamplePicker() {
        els.sample?.classList.remove("is-open");
    }
    function toggleSamplePicker() {
        els.sample?.classList.toggle("is-open");
    }

    function selectSample(sampleId) {
        stop();
        state.sampleId = sampleId;
        const s = selectedPresetSample();
        state.conf = s.confidence_threshold || 0.25;
        state.iou = s.nms_iou_threshold || 0.5;
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);
        state.source = forcePresetSource ? "preset" : "inference";
        state.fallbackReason = "";
        state.inferenceScene = sceneFromPreset(s, []);
        state.inferenceResult = null;
        state.inferenceError = null;
        state.hoveredProposalId = null;
        state.selectedDetectionId = null;
        state.nmsAnimationStep = 0;
        state.step = 0;
        renderClassControls(true);
        renderSamplePicker();
        render();
        if (state.detMode === "yolo" && !forcePresetSource) autoLoadAndRun();
    }

    function renderControls() {
        renderSamplePicker();
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);
        renderClassControls(true);
    }

    function stop() {
        state.playing = false;
        clearTimeout(state.timer);
        els.play.textContent = "自动播放";
    }

    let imageRelayoutFrame = 0;
    function scheduleImageRelayoutRender() {
        if (!state.data) return;
        if (imageRelayoutFrame) cancelAnimationFrame(imageRelayoutFrame);
        imageRelayoutFrame = requestAnimationFrame(() => {
            imageRelayoutFrame = 0;
            const sample = state.detMode === "yolo" ? currentScene() : demoImageSample();
            updateImageRenderRect(sample);
            render();
        });
    }

    async function getInferenceClient() {
        if (state.inferenceClient) return state.inferenceClient;
        state.inferenceModule = await import(inferenceModuleUrl);
        state.inferenceClient = state.inferenceModule.createDetectionInferenceClient();
        return state.inferenceClient;
    }

    function formatInferenceError(error) {
        if (state.inferenceModule?.handleModelInferenceError) return state.inferenceModule.handleModelInferenceError(error);
        const shape = error?.rawOutputShape ? ` rawOutputShape=[${error.rawOutputShape.join(", ")}]` : "";
        return `${error?.message || "推理失败"}${shape}`;
    }

    function fallbackToPreset(error) {
        const message = formatInferenceError(error);
        const s = selectedPresetSample();
        state.source = "preset";
        state.fallbackReason = message;
        state.inferenceError = error;
        state.inferenceResult = null;
        state.inferenceScene = null;
        state.conf = s.confidence_threshold || 0.25;
        state.iou = s.nms_iou_threshold || 0.5;
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);
        els.inferenceMessage.textContent = `ONNX 推理不可用，已回退预设结果：${message}`;
        renderClassControls(true);
        state.step = Math.min(4, compute().steps.length - 1);
        render();
    }

    async function loadModelInternal() {
        setModelStatus("加载中", "正在加载 ONNX Runtime Web 与 yolo_detection.onnx...");
        state.backend = els.backend.value;
        state.activeBackend = "--";
        renderRuntimeMetrics(compute());
        const client = await getInferenceClient();
        const info = await client.loadDetectionModel({backend: state.backend});
        state.activeBackend = info.backend || state.backend;
        const fallback = state.backend === "webgpu" && state.activeBackend === "wasm";
        setModelStatus("已加载", fallback ? "WebGPU 不可用，已回退到 WASM 并继续推理。" : "模型已加载，正在自动推理。");
        state.inferenceError = null;
        state.step = 2;
        render();
    }

    function waitForImage(image) {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                image.removeEventListener("load", onLoad);
                image.removeEventListener("error", onError);
            };
            const onLoad = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error("图像加载失败，无法执行推理。")); };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    async function runInferenceInternal() {
        await waitForImage(els.image);
        setModelStatus("推理完成", "正在解码候选框并执行后处理...");
        const client = await getInferenceClient();
        const result = await client.runDetectionInference(els.image);
        setModelStatus("解码完成", "候选框已解码，正在执行置信度过滤与 NMS...");
        const current = currentScene();
        const boxes = candidatePoolFromInference(result);
        state.inferenceScene = {
            ...current,
            width: result.width || els.image.naturalWidth || current.width,
            height: result.height || els.image.naturalHeight || current.height,
            boxes
        };
        state.inferenceResult = result;
        state.activeBackend = result.backend || state.activeBackend;
        state.inferenceError = null;
        state.fallbackReason = "";
        state.step = Math.min(3, compute().steps.length - 1);
        setModelStatus("后处理完成", `推理完成：当前展示 Top ${boxes.length} 个候选框，rawOutputShape=[${(result.rawOutputShape || []).join(", ")}]。`);
        renderClassControls(true);
        render();
    }

    async function autoLoadAndRun() {
        if (forcePresetSource) return;
        if (!state.data || state.detMode !== "yolo") return;
        const token = state.autoToken + 1;
        state.autoToken = token;
        stop();
        state.source = "inference";
        state.fallbackReason = "";
        state.inferenceError = null;
        renderClassControls(true);
        state.step = 0;
        render();
        try {
            if (state.modelStatus !== "已加载" && state.modelStatus !== "后处理完成") await loadModelInternal();
            if (token !== state.autoToken) return;
            await runInferenceInternal();
        } catch (error) {
            if (token !== state.autoToken) return;
            state.inferenceError = error;
            state.activeBackend = "--";
            setModelStatus("加载失败", formatInferenceError(error));
            fallbackToPreset(error);
        }
    }

    function setInferenceSceneFromUpload(file) {
        if (!file) return;
        if (!state.data) {
            els.inferenceMessage.textContent = "检测样例数据仍在加载，请稍后再试。";
            return;
        }
        if (state.customUrl) URL.revokeObjectURL(state.customUrl);
        const url = URL.createObjectURL(file);
        state.customUrl = url;
        const image = new Image();
        image.onload = () => {
            state.inferenceScene = {
                id: "uploaded_image",
                name: file.name,
                image: url,
                width: image.naturalWidth,
                height: image.naturalHeight,
                boxes: [],
                confidence_threshold: state.conf,
                nms_iou_threshold: state.iou
            };
            state.inferenceResult = null;
            state.inferenceError = null;
            state.source = "inference";
            state.fallbackReason = "";
            state.step = 0;
            els.inferenceMessage.textContent = "上传图像已载入，正在自动推理。";
            renderClassControls(true);
            render();
            if (!forcePresetSource) autoLoadAndRun();
        };
        image.onerror = () => {
            els.inferenceMessage.textContent = "上传图像加载失败。";
            els.missing.textContent = "上传图片读取失败";
            els.missing.style.display = "flex";
            URL.revokeObjectURL(url);
            if (state.customUrl === url) state.customUrl = null;
        };
        image.src = url;
    }

    fetch(`${dataRoot}/detection_lab/rcnn_demo.json`)
        .then((response) => response.json())
        .then((data) => {
            state.rcnnData = data;
            if (state.detMode !== "yolo" && state.data) render();
        })
        .catch(() => {
            state.rcnnData = null;
        });

    fetch(`${dataRoot}/overview/detection_samples.json?v=20260625-samples4`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            const s = selectedPresetSample();
            state.conf = s.confidence_threshold || 0.25;
            state.iou = s.nms_iou_threshold || 0.5;
            els.conf.value = String(state.conf);
            els.iou.value = String(state.iou);
            state.inferenceScene = sceneFromPreset(s, []);
            renderControls();
            render();
            if (!forcePresetSource) autoLoadAndRun();
        })
        .catch(() => {
            els.overlay.innerHTML = `<div class="vision-empty-result">检测样例数据加载失败</div>`;
        });

    els.sampleTrigger?.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSamplePicker();
    });
    document.addEventListener("click", (e) => {
        if (!els.sample?.contains(e.target)) closeSamplePicker();
    });
    els.backend.addEventListener("change", () => {
        state.backend = els.backend.value;
        state.inferenceClient?.dispose?.();
        state.inferenceClient = null;
        state.inferenceModule = null;
        state.inferenceResult = null;
        state.inferenceError = null;
        state.activeBackend = "--";
        setModelStatus("未加载", "后端已切换，正在重新加载模型并执行推理...");
        renderRuntimeMetrics(compute());
        if (state.detMode === "yolo" && !forcePresetSource) autoLoadAndRun();
    });
    els.upload.addEventListener("change", () => {
        const file = els.upload.files?.[0];
        const filenameEl = document.getElementById("detUploadFilename");
        if (filenameEl) {
            filenameEl.textContent = file ? file.name : "未选择文件";
        }
        setInferenceSceneFromUpload(file);
    });
    els.modeButtons.forEach((button) => button.addEventListener("click", () => {
        const nextMode = button.dataset.detMode || "yolo";
        if (state.detMode === nextMode) return;
        stop();
        state.detMode = nextMode;
        state.rcnnStep = 0;
        state.step = 0;
        state.hoveredProposalId = null;
        state.selectedDetectionId = null;
        state.nmsAnimationStep = 0;
        render();
        if (state.detMode === "yolo" && !forcePresetSource) autoLoadAndRun();
    }));
    els.conf.addEventListener("input", () => updateYoloThreshold("conf", Number(els.conf.value)));
    els.iou.addEventListener("input", () => updateYoloThreshold("iou", Number(els.iou.value)));
    els.showLow.addEventListener("change", () => { state.showLow = els.showLow.checked; render(); });
    els.heatmapType?.addEventListener("change", () => {
        state.heatmapType = els.heatmapType.value || "auto";
        render();
    });
    els.heatmapClass?.addEventListener("change", () => {
        state.heatmapClass = els.heatmapClass.value || "all";
        render();
    });
    els.heatmapAlpha?.addEventListener("input", () => {
        state.heatmapAlpha = Math.max(0, Math.min(0.8, Number(els.heatmapAlpha.value) || 0));
        render();
    });
    els.candidateTable?.addEventListener("click", (event) => {
        const target = event.target.closest("[data-det-hover-id]");
        if (!target || !root.contains(target)) return;
        state.selectedDetectionId = target.dataset.detHoverId || null;
        render();
    });
    els.prev.addEventListener("click", () => {
        if (state.detMode === "yolo") state.step = Math.max(0, state.step - 1);
        else state.rcnnStep = Math.max(0, state.rcnnStep - 1);
        render();
    });
    els.next.addEventListener("click", () => {
        if (state.detMode === "yolo") state.step = Math.min(compute().steps.length - 1, state.step + 1);
        else state.rcnnStep = Math.min(activeRcnnSteps().length - 1, state.rcnnStep + 1);
        render();
    });
    els.play.addEventListener("click", () => {
        if (state.playing) return stop();
        state.playing = true;
        els.play.textContent = "暂停播放";
        function scheduleNext() {
            const steps = state.detMode === "yolo" ? compute().steps : activeRcnnSteps();
            const curStep = steps[state.detMode === "yolo" ? state.step : state.rcnnStep];
            const phaseStr = state.detMode === "yolo" ? curStep?.phase : curStep?.id;
            const delay = phaseStr === "nms" ? 400 : 1200;
            state.timer = setTimeout(() => {
                if (!state.playing) return;
                if (state.detMode === "yolo") {
                    const max = compute().steps.length - 1;
                    state.step = state.step >= max ? 0 : state.step + 1;
                } else {
                    const max = activeRcnnSteps().length - 1;
                    state.rcnnStep = state.rcnnStep >= max ? 0 : state.rcnnStep + 1;
                }
                render();
                scheduleNext();
            }, delay);
        }
        scheduleNext();
    });

    root.addEventListener("pointerover", (event) => {
        const target = event.target.closest("[data-det-hover-id]");
        if (!target || !root.contains(target)) return;
        setHoveredProposal(target.dataset.detHoverId);
    });
    root.addEventListener("pointerout", (event) => {
        const target = event.target.closest("[data-det-hover-id]");
        if (!target || !root.contains(target)) return;
        const nextHover = event.relatedTarget?.closest?.("[data-det-hover-id]");
        if (nextHover && root.contains(nextHover)) return;
        setHoveredProposal(null);
    });
    root.addEventListener("focusin", (event) => {
        const target = event.target.closest("[data-det-hover-id]");
        if (!target || !root.contains(target)) return;
        setHoveredProposal(target.dataset.detHoverId);
    });
    root.addEventListener("focusout", () => setHoveredProposal(null));
    els.image?.addEventListener("load", scheduleImageRelayoutRender);
    window.addEventListener("resize", scheduleImageRelayoutRender);

    if (els.nmsControl) {
        els.nmsControl.addEventListener("click", (event) => {
            const button = event.target.closest("[data-det-nms-step]");
            if (!button) return;
            state.nmsAnimationStep = Math.max(0, Math.min(4, Number(button.dataset.detNmsStep) || 0));
            if (state.detMode === "yolo" && state.nmsAnimationStep > 0) {
                const steps = compute().steps;
                const nmsIndex = steps.findIndex((item) => item.phase === "nms");
                if (nmsIndex !== -1 && steps[state.step]?.phase !== "nms") state.step = nmsIndex;
            }
            render();
        });
    }

    if (els.pipeline) {
        els.pipeline.addEventListener("click", (e) => {
            const article = e.target.closest(".det-output-pipeline-track article");
            if (!article) return;

            const articles = [...els.pipeline.querySelectorAll(".det-output-pipeline-track article")];
            const clickIndex = articles.indexOf(article);
            if (clickIndex === -1) return;

            const steps = compute().steps;
            let targetIndex = -1;

            switch (clickIndex) {
                case 0:
                case 1:
                    targetIndex = steps.findIndex(s => s.phase === "inference");
                    break;
                case 2:
                    targetIndex = steps.findIndex(s => s.phase === "decode");
                    break;
                case 3:
                    targetIndex = steps.findIndex(s => s.phase === "confidence");
                    break;
                case 4:
                    targetIndex = steps.findIndex(s => s.phase === "nms");
                    break;
                case 5:
                    targetIndex = steps.length - 1;
                    break;
            }

            if (targetIndex !== -1) {
                state.step = targetIndex;
                render();
            }
        });
    }

    if (els.rcnnStage) {
        els.rcnnStage.addEventListener("click", (event) => {
            const button = event.target.closest("[data-rcnn-step]");
            if (!button || !els.rcnnStage.contains(button)) return;
            const steps = activeRcnnSteps();
            const targetIndex = steps.findIndex((item) => item.id === button.dataset.rcnnStep);
            if (targetIndex === -1) return;
            state.rcnnStep = targetIndex;
            renderRcnnMode();
        });
    }
}());
