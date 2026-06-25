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
    const state = {
        data: null,
        rcnnData: null,
        sampleId: "",
        source: "inference",
        detMode: initialMode,
        conf: 0.25,
        iou: 0.5,
        showLow: true,
        classes: new Set(),
        step: initialParams.get("focus") === "nms" ? 5 : 0,
        rcnnStep: 0,
        playing: false,
        timer: null,
        backend: "wasm",
        activeBackend: "--",
        modelStatus: "not loaded",
        inferenceClient: null,
        inferenceModule: null,
        inferenceScene: null,
        inferenceResult: null,
        inferenceError: null,
        customUrl: null,
        autoToken: 0,
        fallbackReason: "",
        hoveredProposalId: null,
        nmsAnimationStep: 0
    };
    const els = {
        sample: $("[data-det-sample]"),
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
        {id: "image", title: "Image", detail: "Image Loaded"},
        {id: "preprocess", title: "Preprocess", detail: "Letterbox Resize"},
        {id: "inference", title: "Inference", detail: "ONNX Forward"},
        {id: "decode", title: "Decode", detail: "rawOutput to boxes"},
        {id: "confidence", title: "Confidence", detail: "Score Threshold"},
        {id: "nms", title: "NMS", detail: "IoU Matrix"},
        {id: "final", title: "Final", detail: "Detections"}
    ];

    const yoloDecodePipeline = [
        {id: "raw", title: "rawOutput [1,84,8400]", detail: "84 = xywh + 80 scores"},
        {id: "points", title: "全景特征点空间总候选数", detail: "8400 dense locations"},
        {id: "xywh", title: "xywh + class scores", detail: "best class per point"},
        {id: "判定目标置信度阈值", title: "判定目标置信度阈值", detail: "drop low scores"},
        {id: "nms", title: "NMS", detail: "IoU suppress"},
        {id: "final", title: "final boxes", detail: "N x detection"}
    ];

    const modeSteppers = {
        rcnn: [
            {id: "image", title: "Image", detail: "input"},
            {id: "proposals", title: "Proposals", detail: "selective search"},
            {id: "crop", title: "Crop / ROI", detail: "crop + warp"},
            {id: "features", title: "CNN Feature", detail: "per proposal"},
            {id: "classifier", title: "Classifier", detail: "class score"},
            {id: "regression", title: "BBox Regression", detail: "refine box"},
            {id: "nms", title: "NMS", detail: "deduplicate"}
        ],
        roi: [
            {id: "image", title: "Image", detail: "candidate box"},
            {id: "feature", title: "Feature Map", detail: "shared conv"},
            {id: "roi", title: "ROI Pooling", detail: "quantized ROI"},
            {id: "head", title: "Class + BBox", detail: "fixed feature"},
            {id: "nms", title: "NMS", detail: "deduplicate"}
        ],
        rpn: [
            {id: "image", title: "Image", detail: "input"},
            {id: "feature", title: "Feature Map", detail: "sliding window"},
            {id: "anchors", title: "Anchors", detail: "k boxes / cell"},
            {id: "rpn", title: "RPN", detail: "objectness + offset"},
            {id: "proposals", title: "Proposals", detail: "positive anchors"},
            {id: "head", title: "Fast R-CNN Head", detail: "class + bbox"},
            {id: "final", title: "Final", detail: "NMS output"}
        ]
    };

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function idText(id) {
        return String(id ?? "");
    }

    function spotlightClassFor(id) {
        if (!state.hoveredProposalId) return "";
        return idText(id) === idText(state.hoveredProposalId) ? "is-spotlight" : "is-dimmed";
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

    function activeRcnnProposal(demo) {
        const proposals = demo?.proposals || [];
        return proposals.find((proposal) => idText(proposal.id) === idText(state.hoveredProposalId)) || proposals[0] || {};
    }

    function comparisonForNms(result, step) {
        return step?.comparison || result?.comparisons?.[0] || null;
    }

    function applySpotlightState() {
        const activeId = state.hoveredProposalId;
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
                <span>MODEL OUTPUT DECODE</span>
                <strong>${esc(rawOutputShapeText())} → final detections</strong>
                <em>${counts.decoded} decoded / ${counts.final} final</em>
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
        return `left:${(x1 / width) * 100}%;top:${(y1 / height) * 100}%;width:${((x2 - x1) / width) * 100}%;height:${((y2 - y1) / height) * 100}%;`;
    }

    function demoData() {
        return state.rcnnData || {};
    }

    function demoImageSample() {
        const s = selectedPresetSample();
        return { width: s?.width || demoData().image?.width || 640, height: s?.height || demoData().image?.height || 427, image: s?.image || "" };
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
            makeStep("image", "image", "Input image loaded. Next: letterbox resize and tensor construction.", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("preprocess", "preprocess", "Apply letterbox resize, 张量归一化计算, and HWC to CHW layout.", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("inference", "inference", "ONNX Runtime Web has produced the raw output tensor.", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("decode", "decode", "Decode rawOutput locations into xywh boxes and class scores.", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("confidence", "confidence", "Split decoded boxes by confidence 判定目标置信度阈值 before NMS.", {}, keptIds, suppressedIds, lowIds, candidates)
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
                steps.push(makeStep("compare", "nms", `Compare Box A #${keep.id} with Box B #${box.id} by IoU.`, {
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
                    steps.push(makeStep("suppress", "nms", `IoU ${score.toFixed(3)} >= 判定目标置信度阈值 ${state.iou.toFixed(2)}; suppress Box B.`, {
                        currentBoxId: keep.id,
                        compareBoxId: box.id,
                        iou: score,
                        decision: "suppress",
                        comparison
                    }, keptIds, suppressedIds, lowIds, candidates));
                    break;
                }
                steps.push(makeStep("keep", "nms", `IoU ${score.toFixed(3)} < 判定目标置信度阈值 ${state.iou.toFixed(2)}; keep Box B for now.`, {
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
                    steps.push(makeStep("keep", "nms", `Box #${box.id} has no higher-score same-class box to compare; keep it.`, {
                        currentBoxId: box.id,
                        decision: "keep"
                    }, keptIds, suppressedIds, lowIds, candidates));
                }
            }
        }

        steps.push(makeStep("final", "final", "NMS post-processing complete. Output final detections.", {}, keptIds, suppressedIds, lowIds, candidates));
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

    function boxMarkup(box, s, status) {
        const [x1, y1, x2, y2] = box.bbox;
        const label = status === "low" ? `${box.class} ${box.score.toFixed(2)} filtered` : `${box.class} ${box.score.toFixed(2)}`;
        const spotlightClass = spotlightClassFor(box.id);
        return `<div data-det-hover-id="${esc(box.id)}" data-det-related-id="${esc(box.id)}" class="vision-bbox vision-bbox--${status} ${spotlightClass}" style="left:${(x1 / s.width) * 100}%;top:${(y1 / s.height) * 100}%;width:${((x2 - x1) / s.width) * 100}%;height:${((y2 - y1) / s.height) * 100}%;--box-color:${esc(colorFor(box))}"><span>${esc(label)}</span></div>`;
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
        const source = state.source === "preset" ? "Preset JSON" : "ONNX Runtime Web";
        const counts = yoloCounts(result);
        els.inputSize.textContent = inference?.inputSize ? `${inference.inputSize} × ${inference.inputSize}` : "640 × 640";
        els.inferenceTime.textContent = Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--";
        els.postprocessTime.textContent = Number.isFinite(inference?.postprocessTime) ? `${inference.postprocessTime.toFixed(1)} ms` : "--";
        els.activeBackend.textContent = state.activeBackend || "--";
        els.stageSource.textContent = source;
        els.stageBackend.textContent = `Backend: ${state.activeBackend || "--"}`;
        els.stageInference.textContent = `Inference: ${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}`;
        els.stageCandidates.textContent = `Candidates: ${counts.decoded}`;
        els.stageFinal.textContent = `Final: ${counts.final}`;
        els.runtimeStats.innerHTML = `
            <div><dt>rawOutputShape</dt><dd>${esc(shape)}</dd></div>
            <div><dt>vector layout</dt><dd>4 xywh + 80 class scores</dd></div>
            <div><dt>全景特征点空间总候选数</dt><dd>8400 dense locations</dd></div>
            <div><dt>decoded candidate count</dt><dd>${counts.decoded}</dd></div>
            <div><dt>confidence filtered count</dt><dd>${counts.filtered}</dd></div>
            <div><dt>NMS kept count</dt><dd>${counts.final}</dd></div>
            <div><dt>preprocess time</dt><dd>${Number.isFinite(inference?.preprocessTime) ? `${inference.preprocessTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>inference time</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>postprocess time</dt><dd>${Number.isFinite(inference?.postprocessTime) ? `${inference.postprocessTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>backend</dt><dd>${esc(state.activeBackend || "--")}</dd></div>`;
    }

    function renderClassStats(result) {
        const counts = new Map();
        result.kept.forEach((box) => counts.set(box.class, (counts.get(box.class) || 0) + 1));
        if (!counts.size) {
            els.classStats.textContent = "No final kept boxes.";
            return;
        }
        els.classStats.innerHTML = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `<span><i style="background:${esc(colorFor({class: name}))}"></i>${esc(name)}<strong>${count}</strong></span>`)
            .join("");
    }

    function renderCandidateTable(result, step) {
        if (els.tableTitle) els.tableTitle.textContent = "CANDIDATES";
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
                    <td><span>${status}</span></td>
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
                <span>NMS PAIR COMPARE</span>
                <strong>A#${esc(c.a.id)} × B#${esc(c.b.id)}</strong>
                <em>${c.suppress ? "suppress" : "keep"}</em>
            </div>
            <div class="det-pair-card-grid">
                <article class="is-a"><span>Box A</span><strong>${esc(c.a.class)} · ${c.a.score.toFixed(3)}</strong><code>[${c.a.bbox.join(", ")}]</code></article>
                <article class="is-b"><span>Box B</span><strong>${esc(c.b.class)} · ${c.b.score.toFixed(3)}</strong><code>[${c.b.bbox.join(", ")}]</code></article>
                <dl>
                    <div><dt>intersection</dt><dd>${Math.round(c.inter.area)} px²</dd></div>
                    <div><dt>union</dt><dd>${Math.round(c.union)} px²</dd></div>
                    <div><dt>IoU</dt><dd>${c.iou.toFixed(3)}</dd></div>
                    <div><dt>判定目标置信度阈值</dt><dd>${state.iou.toFixed(2)}</dd></div>
                    <div><dt>decision</dt><dd>${c.suppress ? "suppress B" : "keep B"}</dd></div>
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
            return `<div class="det-nms-sort-badge"><span>1</span><strong>按置信度从高到低排序</strong><em>${result.候选框.length} 候选框</em></div>`;
        }
        const a = boxCenter(c.a);
        const b = boxCenter(c.b);
        const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
        const radar = state.nmsAnimationStep >= 2
            ? `<div class="det-nms-radar" style="left:${(a.x / s.width) * 100}%;top:${(a.y / s.height) * 100}%;"></div>`
            : "";
        const link = state.nmsAnimationStep >= 3
            ? `<svg class="det-nms-link" viewBox="0 0 ${s.width} ${s.height}" preserveAspectRatio="none" aria-hidden="true">
                    <defs><marker id="detNmsArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>
                    <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" marker-end="url(#detNmsArrow)"></line>
                </svg>
                <div class="det-nms-iou-tooltip" style="left:${(mid.x / s.width) * 100}%;top:${(mid.y / s.height) * 100}%;">
                    <b>${renderLatex("IoU = \\frac{Area\\_of\\_Overlap}{Area\\_of\\_Union}")}</b>
                    <strong>IoU = ${c.iou.toFixed(3)}</strong>
                    <span>${c.iou >= state.iou ? `>= ${state.iou.toFixed(2)} suppress` : `< ${state.iou.toFixed(2)} keep`}</span>
                </div>`
            : "";
        const particles = state.nmsAnimationStep >= 4 && c.iou >= state.iou
            ? `<div class="det-nms-particles" style="left:${(b.x / s.width) * 100}%;top:${(b.y / s.height) * 100}%;">${Array.from({length: 10}, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>`
            : "";
        return `<div class="det-nms-slow-layer">${radar}${link}${particles}</div>`;
    }

    function renderStepper(step) {
        setStepper(yoloStepper, step.phase);
    }

    function renderNotes(step, result) {
        const s = result.sample;
        const inference = state.inferenceResult;
        const shape = rawOutputShapeText();
        const counts = yoloCounts(result);
        const decodedCount = counts.decoded;
        const sampleCandidate = result.candidates[0] || result.low[0] || null;
        const currentBox = findBoxById(result.boxes, step.currentBoxId);
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
            tutorialContent = `<p><span class="det-note-stage">Image</span><strong>输入图像</strong>仍是原始 RGB 像素，后续会被 letterbox 到模型固定输入尺寸，再送入 ONNX Runtime。</p>`;
            notesContent = `<dl>
                <div><dt>input image</dt><dd>${s.width} × ${s.height}</dd></div>
                <div><dt>预处理生成的输入张量维度</dt><dd>[1, 3, 640, 640]</dd></div>
                <div><dt>目标前向核心计算流程</dt><dd>image → preprocess → inference → decode</dd></div>
            </dl>`;
        } else if (step.phase === "preprocess") {
            tutorialContent = `<p><span class="det-note-stage">Preprocess</span><strong>Letterbox + Normalize</strong>保留原图比例，补边到 640×640，并把 HWC 像素布局转成模型需要的 CHW tensor。</p>`;
            notesContent = `<dl>
                <div><dt>letterbox</dt><dd>${s.width} × ${s.height} → 640 × 640</dd></div>
                <div><dt>张量归一化计算</dt><dd>RGB / 255</dd></div>
                <div><dt>layout</dt><dd>HWC → CHW</dd></div>
                <div><dt>ONNX 前向输入尺度</dt><dd>[1, 3, 640, 640]</dd></div>
            </dl>`;
        } else if (step.phase === "inference") {
            tutorialContent = `<p><span class="det-note-stage">Inference</span><strong>ONNX inference</strong>输出 dense tensor。${esc(shape)} 表示 8400 个候选点，每个点有 4 个 xywh 参数和 80 个类别分数。</p>`;
            notesContent = `<dl>
                <div><dt>backend</dt><dd>${esc(state.activeBackend || "--")}</dd></div>
                <div><dt>rawOutputShape</dt><dd>${esc(rawOutputShapeNote())}</dd></div>
                <div><dt>单个检测输出位置参数含义</dt><dd>84 = 4 bbox + 80 class scores</dd></div>
                <div><dt>inference time</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div>
            </dl>`;
        } else if (step.phase === "decode") {
            tutorialContent = `<p><span class="det-note-stage">Decode</span><strong>rawOutput → candidates</strong>遍历 8400 个点，取每个点的 xywh 与最大类别分数，再把中心点宽高换算成图像坐标 bbox。</p>`;
            notesContent = `<dl>
                <div><dt>待解码输出张量</dt><dd>${esc(shape)}</dd></div>
                <div><dt>全景特征点空间总候选数</dt><dd>8400</dd></div>
                <div><dt>反向解码像素包围框总数</dt><dd>${decodedCount}</dd></div>
                <div><dt>首个被还原的有效示例候选框</dt><dd>${sampleCandidate ? `#${sampleCandidate.id} ${esc(sampleCandidate.class)} ${sampleCandidate.score.toFixed(3)}` : "--"}</dd></div>
                <div><dt>box transform</dt><dd>cx, cy, w, h → x1, y1, x2, y2</dd></div>
            </dl>`;
        } else if (step.phase === "confidence") {
            tutorialContent = `<p><span class="det-note-stage">Confidence</span><strong>阈值过滤</strong>先删除低置信度框。低于 ${state.conf.toFixed(2)} 的候选框会变灰并淡出，只把高分候选框送入 NMS。</p>`;
            notesContent = `<dl>
                <div><dt>接收到待剔除候选总框数</dt><dd>${decodedCount}</dd></div>
                <div><dt>判定目标置信度阈值</dt><dd>${state.conf.toFixed(2)}</dd></div>
                <div><dt>置信度合格送入NMS框数</dt><dd>${counts.filtered}</dd></div>
                <div><dt>因得分低自动淡出过滤框数</dt><dd>${Math.max(0, counts.decoded - counts.filtered)}</dd></div>
                <div><dt>next stage</dt><dd>sort by score → class-wise NMS</dd></div>
            </dl>`;
        } else if (step.type === "final") {
            tutorialContent = `<p><span class="det-note-stage">Final</span><strong>最终检测输出</strong>只保留 NMS 后的稳定框。页面输出结构对应前端可消费的 detection 数组。</p>`;
            const avg = result.kept.length ? result.kept.reduce((sum, box) => sum + box.score, 0) / result.kept.length : 0;
            const classText = [...new Set(result.kept.map((box) => box.class))].map((name) => `${name}: ${result.kept.filter((box) => box.class === name).length}`).join(" / ") || "--";
            notesContent = `<dl>
                <div><dt>final detections</dt><dd>${counts.final}</dd></div>
                <div><dt>本帧识别出的物体类别分布</dt><dd>${esc(classText)}</dd></div>
                <div><dt>全图留存目标平均置信得分</dt><dd>${avg.toFixed(3)}</dd></div>
                <div><dt>output schema</dt><dd>N × [x1,y1,x2,y2,score,class]</dd></div>
            </dl>
            <div class="det-final-output"><strong>检测输出 JSON 首帧片段预览</strong><code>${esc(JSON.stringify(finalPreview))}</code></div>`;
        } else {
            const c = step.comparison;
            if (c) {
                const stageName = step.type === "suppress" ? "NMS" : step.type === "keep" ? "NMS" : "IoU";
                const decisionText = c.suppress ? `IoU >= ${state.iou.toFixed(2)}; NMS suppresses lower-score Box B.` : `当前两候选框交并比 IoU 低于阈值 ${state.iou.toFixed(2)}。算法认为它们属于两不同的目标物理实体，候选框 B 继续予以保留。`;
                tutorialContent = `<p><span class="det-note-stage">${stageName}</span><strong>Compare A/B</strong>IoU 交并比计算公式 = A ∩ B 重叠面积 / A ∪ B 总合面积。NMS 执行判断规则如下：${decisionText}</p>`;
                notesContent = `<div class="det-iou-equation">
                    <span>IoU</span><strong>${c.iou.toFixed(3)}</strong><small>${Math.round(c.inter.area)} / ${Math.round(c.union)}</small>
                </div>
                <div class="detection-pair"><strong>框 A</strong><span>${esc(c.a.class)} ${c.a.score.toFixed(2)}</span><code>[${c.a.bbox.join(", ")}]</code></div>
                <div class="detection-pair"><strong>框 B</strong><span>${esc(c.b.class)} ${c.b.score.toFixed(2)}</span><code>[${c.b.bbox.join(", ")}]</code></div>
                <dl>
                    <div><dt>matrix cell</dt><dd>A#${c.a.id} × B#${c.b.id}</dd></div>
                    <div><dt>intersection</dt><dd>${Math.round(c.inter.area)} px²</dd></div>
                    <div><dt>union</dt><dd>${Math.round(c.union)} px²</dd></div>
                    <div><dt>NMS decision</dt><dd>${c.suppress ? "suppress Box B" : "认为独立，继续保留 B"}</dd></div>
                </dl>`;
            } else {
                tutorialContent = `<p><span class="det-note-stage">NMS</span><strong>${esc(step.message)}</strong>当前候选没有同类高分框需要比较，先进入 kept set。</p>`;
                notesContent = `<dl>
                    <div><dt>当前主要检查的高分框A</dt><dd>${currentBox ? `#${currentBox.id} ${esc(currentBox.class)} ${currentBox.score.toFixed(3)}` : "--"}</dd></div>
                    <div><dt>已被确定保留框的总数量</dt><dd>${step.keptIds.size}</dd></div>
                    <div><dt>已被干掉剔除框的总数量</dt><dd>${step.suppressedIds.size}</dd></div>
                    <div><dt>compare target</dt><dd>${compareBox ? `#${compareBox.id}` : "无（此轮对比完成）"}</dd></div>
                </dl>`;
            }
        }

        if (els.notesTutorial) {
            els.notesTutorial.innerHTML = tutorialContent;
        }
        els.notes.innerHTML = notesContent;
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
                <div><dt>refined</dt><dd>[${esc((proposal.refined || proposal.bbox || []).join(", "))}]</dd></div>
            </dl>
        </aside>`;
    }

    function rcnnStepMeta(step) {
        const meta = {
            image: ["Image", "Input image and active proposal", "Confirm the image content and keep one active proposal in focus.", "proposal"],
            proposals: ["Proposals", "Selective Search proposal generation", "Show class-agnostic regions before CNN classification.", "proposal"],
            crop: ["Crop / ROI", "Crop active proposal and warp it", "Extract the active region and resize it to the CNN input size.", "crop"],
            features: ["CNN Feature", "Feature extraction for one proposal", "Convert the warped patch into a compact feature map and vector.", "feature"],
            classifier: ["Classifier", "Class score from proposal feature", "Score object classes and background for the active proposal.", "classified"],
            regression: ["BBox Regression", "Move original box to refined box", "Apply dx, dy, dw, dh to correct the rough proposal box.", "refined"],
            nms: ["NMS / Final", "Deduplicate refined detections", "Compare refined boxes by IoU and suppress duplicates.", "final"]
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
            <div><dt>proposal id</dt><dd>${esc(p.id || "--")}</dd></div>
            <div><dt>class</dt><dd>${esc(p.class || "--")}</dd></div>
            <div><dt>score</dt><dd>${Number.isFinite(p.score) ? p.score.toFixed(2) : "--"}</dd></div>
            <div><dt>proposal bbox</dt><dd>[${esc((p.bbox || []).join(", "))}]</dd></div>
            <div><dt>refined bbox</dt><dd>[${esc((p.refined || p.bbox || []).join(", "))}]</dd></div>
            <div><dt>status</dt><dd>${esc(meta.state)}</dd></div>
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
            <span>${esc(meta.label)}</span>
            <h4>${esc(meta.title)}</h4>
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
                <span>IoU compare</span>
                <strong>${peer ? `${esc(active.id)} vs ${esc(peer.id)}` : `${esc(active.id || "p1")} only`}</strong>
                <dl>
                    <div><dt>IoU</dt><dd>${pairIou.toFixed(2)}</dd></div>
                    <div><dt>threshold</dt><dd>${state.iou.toFixed(2)}</dd></div>
                    <div><dt>decision</dt><dd>${suppressPeer ? `suppress ${esc(peer.id)}` : "keep candidate"}</dd></div>
                </dl>
            </section>
            <div class="det-rcnn-refined-list">
                ${refinedBoxes.slice(0, 5).map((p) => {
                    const suppressed = peer && p.id === peer.id && suppressPeer;
                    return `<article data-det-hover-id="${esc(p.id)}" data-det-related-id="${esc(p.id)}" class="${p.id === active.id ? "is-active" : ""} ${suppressed ? "is-suppressed" : ""} ${spotlightClassFor(p.id)}">
                        <span>${esc(p.id)}</span>
                        <strong>${esc(p.class)} ${Number(p.score || 0).toFixed(2)}</strong>
                        <code>[${esc((p.bbox || []).join(", "))}]</code>
                        <em>${suppressed ? "suppress" : "keep"}</em>
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
            return `${header}<div class="det-rcnn-focus-grid">
                <article class="det-rcnn-focus-copy">
                    <span>active proposal</span>
                    <strong>${esc(activeProposal.id || "p1")} / ${esc(primaryClass)}</strong>
                    <p>The image stage keeps only the active proposal emphasized; other proposals are muted.</p>
                    <dl>
                        <div><dt>image size</dt><dd>${demoImageSample().width} x ${demoImageSample().height}</dd></div>
                        <div><dt>proposal count</dt><dd>${proposals.length}</dd></div>
                        <div><dt>active bbox</dt><dd>[${esc((activeProposal.bbox || []).join(", "))}]</dd></div>
                    </dl>
                </article>
                ${renderProposalCards(proposals, activeProposal, 5)}
            </div>`;
        }

        if (step.id === "proposals") {
            return `${header}<div class="det-rcnn-focus-grid">
                <article class="det-rcnn-focus-copy">
                    <span>Selective Search</span>
                    <strong>${proposals.length} proposals</strong>
                    <p>Class-agnostic regions are generated first. They are not final detections.</p>
                    <dl>
                        <div><dt>current id</dt><dd>${esc(activeProposal.id || "--")}</dd></div>
                        <div><dt>bbox</dt><dd>[${esc((activeProposal.bbox || []).join(", "))}]</dd></div>
                        <div><dt>score before CNN</dt><dd>none</dd></div>
                    </dl>
                </article>
                ${renderProposalCards(proposals, activeProposal, 5)}
            </div>`;
        }

        if (step.id === "crop") {
            return `${header}<div class="det-rcnn-crop-flow" data-det-related-id="${esc(activeProposal.id || "p1")}">
                ${renderCropPatch("source proposal", activeProposal, "is-source")}
                <div class="det-rcnn-flow-arrow"><span></span></div>
                ${renderCropPatch("crop patch", activeProposal, "is-crop")}
                <div class="det-rcnn-flow-arrow"><span></span></div>
                ${renderCropPatch("warp 224 x 224", activeProposal, "is-warp")}
            </div>`;
        }

        if (step.id === "features") {
            return `${header}<div class="det-rcnn-feature-focus" data-det-related-id="${esc(activeProposal.id || "p1")}">
                ${renderCropPatch("warped patch", activeProposal, "is-feature-input")}
                <div class="det-rcnn-cnn-stack"><i>conv</i><i>relu</i><i>pool</i><i>fc</i></div>
                <section><span>feature map</span>${renderFeatureGrid(feature, ["2-4", "3-4", "4-4"])}</section>
                <div class="det-rcnn-feature-vector">${[0.22, 0.48, 0.72, 0.56, 0.88, 0.34, 0.62, 0.44].map((v, i) => `<i style="--v:${v};--delay:${i * 35}ms"></i>`).join("")}</div>
            </div>`;
        }

        if (step.id === "classifier") {
            return `${header}<div class="det-rcnn-classifier-focus" data-det-related-id="${esc(activeProposal.id || "p1")}">
                <article>
                    <span>proposal feature</span>
                    <strong>${esc(activeProposal.id || "p1")}</strong>
                    <p>The classifier scores object classes and background from this proposal feature.</p>
                </article>
                <section>
                    ${renderClassifierBars(activeProposal, true)}
                    <div class="det-rcnn-verdict"><span>final class</span><strong>${esc(primaryClass)}</strong><em>${Number(activeProposal.score || 0).toFixed(2)}</em></div>
                </section>
            </div>`;
        }

        if (step.id === "regression") {
            return `${header}<div class="det-rcnn-regression-focus" data-det-related-id="${esc(activeProposal.id || "p1")}">
                ${renderBBoxRegressionPanel(activeProposal, step)}
                <dl class="detection-regression-offsets">
                    <div><dt>dx</dt><dd>${offset.dx ?? "--"}</dd></div>
                    <div><dt>dy</dt><dd>${offset.dy ?? "--"}</dd></div>
                    <div><dt>dw</dt><dd>${offset.dw ?? "--"}</dd></div>
                    <div><dt>dh</dt><dd>${offset.dh ?? "--"}</dd></div>
                    <div><dt>original</dt><dd>[${esc((activeProposal.bbox || []).join(", "))}]</dd></div>
                    <div><dt>refined</dt><dd>[${esc(refined.join(", "))}]</dd></div>
                </dl>
            </div>`;
        }

        return `${header}${renderRcnnNmsFocus(proposals, activeProposal)}`;
    }

    function renderRcnnFlow(demo, step) {
        const activeProposal = activeRcnnProposal(demo);
        return `${renderRcnnStepRail(step)}
            <section data-det-related-id="${esc(activeProposal.id || "p1")}" class="det-rcnn-focus-board det-rcnn-focus-board--${esc(step.id)} ${spotlightClassFor(activeProposal.id)}">
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
                    <h4>Feature Map + ROI bins</h4>
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
                    <h4>Feature map sliding window</h4>
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
                        <span><b>${positives}</b> positive anchors</span>
                        <span><b>${negatives}</b> negative anchors</span>
                        <span><b>${anchors.length}</b> total demo anchors</span>
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
                const label = `${anchor.id} ${anchor.isLow ? "low conf" : anchor.dynamicLabel} IoU ${anchor.iou.toFixed(2)}`;
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
            const pLabel = `${p.id} original ${p.isLow ? "(low conf)" : ""}`;
            return [
                p ? demoBox(p, sample, pClass, pLabel) : "",
                gt ? demoBox(gt, sample, "gt", "ground truth") : "",
                p?.refined ? demoBox({id: p.id, sourceId: p.id, bbox: p.refined}, sample, "refined", "refined prediction") : ""
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
                        boxes.push(demoBox({...duplicate, id: p.id, sourceId: p.id}, sample, "nms-delete", "duplicate (NMS deleted)"));
                    }
                } else {
                    boxes.push(demoBox({...duplicate, id: p.id, sourceId: p.id}, sample, "refined", "duplicate (NMS kept)"));
                }
            }
            return boxes.join("");
        }
        if (["image", "proposals", "crop", "features", "classifier"].includes(step.id)) {
            const p = activeProposal;
            const boxes = [];
            if (p) {
                const pClass = p.isLow ? "proposal-low" : "proposal-active";
                boxes.push(demoBox(p, sample, pClass, `${p.id} ${step.id === "image" ? "proposal" : "crop target"} ${p.isLow ? "(low conf)" : ""}`));
            }
            processedProposals.filter((box) => idText(box.id) !== idText(p?.id)).forEach((box, index) => {
                const isBackground = box.class === "background";
                const isFilterOut = box.isLow;
                if ((isBackground || isFilterOut) && !showLow) return;
                const status = (isBackground || isFilterOut) ? "low" : "proposal";
                const label = isFilterOut ? `${box.id} low conf` : `${box.id} ${box.class}`;
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

    function renderRcnnTable(demo) {
        if (state.detMode === "roi") {
            const bins = demo.roiPooling?.bins || [];
            if (els.tableTitle) els.tableTitle.textContent = "ROI BINS";
            els.candidateTable.innerHTML = `<thead><tr><th>BIN</th><th>FEATURE RANGE</th><th>MAX</th><th>OUTPUT</th><th>STATUS</th></tr></thead><tbody>${bins.map((bin) => `<tr><td>${esc(bin.id)}</td><td>${esc(bin.range)}</td><td>${Number(bin.max).toFixed(2)}</td><td>pooled cell</td><td><span>max</span></td></tr>`).join("")}</tbody>`;
            return;
        }
        if (state.detMode === "rpn") {
            const processedAnchors = processRpnAnchors(demo);
            if (els.tableTitle) els.tableTitle.textContent = "ANCHORS";
            els.candidateTable.innerHTML = `<thead><tr><th>ID</th><th>GT</th><th>IoU</th><th>OBJECTNESS / OFFSET</th><th>LABEL</th></tr></thead><tbody>${processedAnchors.map((a) => {
                const labelClass = a.isLow ? "low-confidence" : `is-${a.dynamicLabel}`;
                const statusText = a.isLow
                    ? `Low Objectness (<${state.conf.toFixed(2)})`
                    : a.dynamicLabel === "positive"
                        ? `Positive (IoU >= ${state.iou.toFixed(2)})`
                        : a.dynamicLabel === "negative"
                            ? `Negative (IoU < 0.3)`
                            : `Ignore (0.3 <= IoU < ${state.iou.toFixed(2)})`;
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
            setTable("STEP DETAIL", ["ID", "CLASS", "SCORE", "BBOX", "STATE"], [
                `<tr ${hoverAttrs(activeId)} class="${rowClassFor(activeId)}"><td>${esc(activeId)}</td><td>${esc(active.class || "--")}</td><td>${Number(active.score || 0).toFixed(2)}</td><td>[${esc((active.bbox || []).join(", "))}]</td><td><span>${step.id === "crop" ? "crop target" : "active proposal"}</span></td></tr>`
            ]);
            return;
        }

        if (step.id === "proposals") {
            setTable("PROPOSAL LIST", ["ID", "CLASS", "SCORE", "BBOX", "STATE"], proposals.slice(0, 5).map((p) => {
                const isLow = p.score < state.conf && p.id !== "p1";
                return `<tr ${hoverAttrs(p.id)} class="${rowClassFor(p.id, isLow || p.class === "background" ? "low-confidence" : "candidate")}"><td>${esc(p.id)}</td><td>${esc(p.class || "proposal")}</td><td>${p.score.toFixed(2)}</td><td>[${esc((p.bbox || []).join(", "))}]</td><td><span>${isLow ? `below conf ${state.conf.toFixed(2)}` : "proposal"}</span></td></tr>`;
            }));
            return;
        }

        if (step.id === "features") {
            const feature = demo.roiPooling?.featureMap || [];
            setTable("FEATURE SUMMARY", ["UNIT", "SOURCE", "SHAPE", "OUTPUT", "STATE"], [
                `<tr class="is-active"><td>patch</td><td>${esc(activeId)}</td><td>[${esc((active.bbox || []).join(", "))}]</td><td>224 x 224</td><td><span>warped input</span></td></tr>`,
                `<tr><td>conv map</td><td>${feature.length} rows</td><td>${feature[0]?.length || 0} cols</td><td>region feature map</td><td><span>active</span></td></tr>`,
                `<tr><td>vector</td><td>fc feature</td><td>8 demo dims</td><td>classifier input</td><td><span>ready</span></td></tr>`
            ]);
            return;
        }

        if (step.id === "classifier") {
            const primaryClass = active.class || "proposal";
            const score = Number(active.score || 0);
            setTable("CLASSIFIER SCORES", ["ID", "CLASS", "SCORE", "MEANING", "STATE"], [
                `<tr class="is-active-row is-active"><td>${esc(activeId)}</td><td>${esc(primaryClass)}</td><td>${score.toFixed(2)}</td><td>highest class score</td><td><span>selected</span></td></tr>`,
                `<tr><td>${esc(activeId)}</td><td>background</td><td>${Math.max(0.08, (1 - score) * 0.45).toFixed(2)}</td><td>background score</td><td><span>candidate</span></td></tr>`
            ]);
            return;
        }

        if (step.id === "regression") {
            const offset = active.offset || {};
            const refined = active.refined || active.bbox || [];
            const rows = [
                ["dx", offset.dx, "horizontal center shift"],
                ["dy", offset.dy, "vertical center shift"],
                ["dw", offset.dw, "log width scale"],
                ["dh", offset.dh, "log height scale"]
            ].map(([key, value, meaning]) => `<tr class="is-active"><td>${esc(activeId)}</td><td>${esc(key)}</td><td>${esc(value ?? "--")}</td><td>${esc(meaning)}</td><td><span>apply</span></td></tr>`);
            rows.push(`<tr ${hoverAttrs(activeId)} class="${rowClassFor(activeId)}"><td>${esc(activeId)}</td><td>box</td><td>[${esc((active.bbox || []).join(", "))}]</td><td>[${esc(refined.join(", "))}]</td><td><span>refined</span></td></tr>`);
            setTable("BBOX REGRESSION", ["ID", "VALUE", "ORIGINAL", "REFINED / MEANING", "STATE"], rows);
            return;
        }

        setTable("NMS / FINAL", ["ID", "CLASS", "SCORE", "REFINED BOX", "DECISION"], proposals
            .filter((p) => p.class !== "background")
            .slice(0, 5)
            .map((p) => {
                const duplicate = p.id === "p2" && state.iou <= 0.75;
                return `<tr ${hoverAttrs(p.id)} class="${rowClassFor(p.id, duplicate ? "is-suppressed" : "is-kept")}"><td>${esc(p.id)}</td><td>${esc(p.class)}</td><td>${p.score.toFixed(2)}</td><td>[${esc((p.refined || p.bbox || []).join(", "))}]</td><td><span>${duplicate ? "suppress" : "keep"}</span></td></tr>`;
            }));
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
                        ["input image", `${demoImageSample().width} × ${demoImageSample().height}`],
                        ["第一阶段", "生成候选区域建议框"],
                        ["第二阶段", "独立特征提取/分类器/公式偏移回归"],
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
                    text: "R-CNN crops the 当前步骤活跃检测候选框 from the image and warps it to the fixed CNN input size.",
                    data: [
                        ["proposal", p.id || "--"],
                        ["raw bbox", `[${(p.bbox || []).join(", ")}]`],
                        ["裁剪操作", "裁剪多变区域图像 + 强制拉伸缩放"],
                        ["CNN 输入数据", "格式统一的边界图像块 (Tensor)"]
                    ]
                },
                features: {
                    stage: "CNN 卷积特征提取",
                    text: "裁剪缩放后的建议框传入神经网络进行多次卷积，输出一个固定维度的特征向量。传统 R-CNN 中为了避免这步带来大量计算消耗，Fast R-CNN 阶段转为了将整张图做一次卷积后再在特征图上进行 ROI 映射。",
                    data: [
                        ["proposal", p.id || "--"],
                        ["特征图提取来源", "小图片段"],
                        ["特征图属性", "该区域的高维语义特征描述子"],
                        ["运算算力开销", "极高（对2000个框重复进行2000次CNN计算）"]
                    ]
                },
                classifier: {
                    stage: "类别独立分类器 (SVM / Softmax)",
                    text: "该区域特征会被送入特定类别的分类器（如支持向量机 SVM），输出当前建议框属于人、车辆等类别及背景概率，若置信度过低或背景得分高将会在后处理中被直接删除。",
                    data: [
                        ["proposal", p.id || "--"],
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
                        ["lifecycle", "proposal → refined detection"]
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

            const STEP_LABELS = {
                image: '图像输入',
                proposals: 'Selective Search',
                crop: '裁剪拉伸',
                features: '特征图卷积提取',
                classifier: '多阶段分类器器',
                regression: '边界回归计算偏移',
                nms: '非极大抑制去重'
            };
            const ALL_STEPS = ['image', 'proposals', 'crop', 'features', 'classifier', 'regression', 'nms'];
            const curIdx = ALL_STEPS.indexOf(step.id);
            const timelineHtml = `
            <div class="det-notes-timeline">
                ${ALL_STEPS.map((s, i) => {
                    const itemState = i < curIdx ? 'done' : i === curIdx ? 'active' : '';
                    return `<div class="det-notes-timeline-item ${itemState}">
                        <span class="det-notes-tl-dot"></span>
                        <span class="det-notes-tl-label">${i + 1}. ${esc(STEP_LABELS[s])}</span>
                        ${i < curIdx ? '<span class="det-notes-tl-check">✔</span>' : ''}
                    </div>`;
                }).join('')}
            </div>`;

            els.notes.innerHTML = `<dl>${copy.data.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${timelineHtml}`;
            return;
        }
        const processedAnchorsForNotes = processRpnAnchors(demo);
        const positiveCount = processedAnchorsForNotes.filter((anchor) => anchor.dynamicLabel === "positive" && !anchor.isLow).length;
        const negativeCount = processedAnchorsForNotes.filter((anchor) => anchor.dynamicLabel === "negative" || anchor.isLow).length;
        const copy = {
            rcnn: {
                title: "Two-stage detection mechanism",
                tutorial: `<p><strong>当前机制解决的问题：</strong>滑动窗口位置、尺度和长宽比组合爆炸。R-CNN 用 proposal 先筛掉大量背景区域，再执行 crop / warp、CNN feature、classifier、bbox regression 与 NMS。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>用 proposal 减少滑窗搜索空间，并通过 bbox regression 修正候选框。</dd></div>
                    <div><dt>输入结构</dt><dd>image + ${proposals.length} proposals，每个 proposal 会 crop / warp 到 CNN 输入尺寸。</dd></div>
                    <div><dt>中间输出</dt><dd>proposal → crop / warp → CNN feature → classifier score → bbox regression offset。</dd></div>
                    <div><dt>关键规则 / 公式</dt><dd>bbox' = bbox + (dx, dy, dw, dh)，当前 dx ${p.offset?.dx ?? "--"} / dy ${p.offset?.dy ?? "--"} / dw ${p.offset?.dw ?? "--"} / dh ${p.offset?.dh ?? "--"}。</dd></div>
                    <div><dt>与 YOLO / NMS 的关系</dt><dd>R-CNN 是 two-stage；YOLO 是 one-stage dense prediction。两者最终都需要 NMS 去掉同类重复框。</dd></div>
                    <div><dt>本页链路</dt><dd>proposal ${esc(p.id || "--")} → crop / warp → CNN feature → classifier ${esc(p.class || "--")} → bbox regression → NMS。</dd></div>
                </dl>`
            },
            roi: {
                title: "Fast R-CNN / ROI Pooling",
                tutorial: `<p><strong>当前机制解决的问题：</strong>早期 R-CNN 对每个 proposal 重复跑 CNN。ROI Pooling 让整图共享 feature map，再把每个 ROI 转成固定尺寸特征。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>避免每个 proposal 单独卷积，统一映射到 shared feature map。</dd></div>
                    <div><dt>输入结构</dt><dd>image ROI [${(roi.roi?.bbox || []).join(", ")}] + feature map，stride ${roi.featureStride || 16}。</dd></div>
                    <div><dt>中间输出</dt><dd>feature map ROI [${(roi.roi?.featureBox || []).join(", ")}] → pooling grid ${(roi.pooledSize || [3, 3]).join(" × ")}。</dd></div>
                    <div><dt>关键规则 / 公式</dt><dd>每个 bin 取 max pooling，输出固定尺寸 feature，再送入 classifier + bbox regressor。</dd></div>
                    <div><dt>与 YOLO / NMS 的关系</dt><dd>ROI Pooling 属于 two-stage head；YOLO 直接从网格预测框。ROI 后的分类框仍需 NMS 去重。</dd></div>
                    <div><dt>本页链路</dt><dd>image ROI → feature map ROI → pooling grid → max pooling → fixed-size feature output。</dd></div>
                </dl>`
            },
            rpn: {
                title: "Faster R-CNN / RPN Anchor",
                tutorial: `<p><strong>当前机制解决的问题：</strong>用可学习 of RPN 替代 Selective Search。RPN 在 feature map 上滑动，为每个 anchor 预测 objectness score 和 bbox offset。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>自动生成高质量 proposals，减少手工候选区域生成成本。</dd></div>
                    <div><dt>输入结构</dt><dd>shared feature map + ${anchors.length} anchors（positive ${positiveCount} / negative ${negativeCount}）。</dd></div>
                    <div><dt>中间输出</dt><dd>每个 anchor 输出 objectness score 和 bbox offset，再筛选 proposal output。</dd></div>
                    <div><dt>关键规则 / 公式</dt><dd>positive: ${esc(demo.rpnRules?.positive || "IoU >= 0.70")}；negative: ${esc(demo.rpnRules?.negative || "IoU < 0.30")}；proposal = anchor + offset。</dd></div>
                    <div><dt>与 YOLO / NMS 的关系</dt><dd>RPN 是 two-stage 的候选框生成器；YOLO 直接输出检测框。RPN proposals 和最终检测都通常要经过 NMS。</dd></div>
                    <div><dt>本页链路</dt><dd>anchor count ${anchors.length} → objectness score → bbox offset → proposal output → Fast R-CNN head。</dd></div>
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

        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect", `${Math.max(1, sample.width)} / ${Math.max(1, sample.height)}`);
        const rawRatio = Math.max(1, sample.width) / Math.max(1, sample.height);
        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect-raw-x", rawRatio.toFixed(3));
        const realStage = els.image.closest(".detection-real-stage");
        if (realStage) realStage.hidden = false;
        if (sample.image) els.image.src = sample.image.startsWith("blob:") ? sample.image : window.cvclassUrl(sample.image);
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

        els.overlay.innerHTML = demo.version ? renderRcnnOverlay(demo, sample, step) : "";
        els.total.textContent = String(rcnnTotalCount);
        els.kept.textContent = String(rcnnKeptCount);
        els.stageSource.textContent = state.detMode === "rcnn" ? "Two-stage proposal lifecycle" : state.detMode === "roi" ? "Fast R-CNN ROI Pooling" : "Faster R-CNN 之全特征图 RPN 滑窗区域";
        els.stageBackend.textContent = state.detMode === "rcnn" ? "Proposal: Selective Search" : "推理组件: 前端课程精选交互模型演示数据";
        els.stageInference.textContent = state.detMode === "rcnn" ? "CNN head: conceptual" : "计算层: 滑动窗口参数";
        els.stageCandidates.textContent = state.detMode === "rcnn" ? `Proposals: ${els.total.textContent}` : `锚框候选: ${els.total.textContent}`;
        els.stageFinal.textContent = state.detMode === "rcnn" ? `Refined: ${els.kept.textContent}` : `最终检测出: ${els.kept.textContent}`;
        els.stepLabel.textContent = `${step.title.toUpperCase()} · STEP ${state.rcnnStep + 1} / ${steps.length}`;
        els.runtimeStats.innerHTML = state.detMode === "rcnn"
            ? `<div><dt>stage 1</dt><dd>Selective Search proposals</dd></div><div><dt>current phase</dt><dd>${esc(step.id)}</dd></div><div><dt>当前步骤活跃检测候选框</dt><dd>${esc(activeProposal.id || "p1")}</dd></div><div><dt>stage 2</dt><dd>CNN feature + classifier + bbox reg</dd></div>`
            : `<div><dt>method</dt><dd>${esc(state.detMode)}</dd></div><div><dt>current phase</dt><dd>${esc(step.id)}</dd></div><div><dt>ground truth boxes</dt><dd>${(demo.groundTruth || []).length}</dd></div><div><dt>NMS</dt><dd>最终多类别重复目标去重剔除</dd></div>`;
        els.classStats.innerHTML = state.detMode === "rcnn"
            ? `<span><i style="background:#7c3aed"></i>proposal<strong>${(demo.proposals || []).length}</strong></span><span><i style="background:#4f46e5"></i>refined<strong>${rcnnKeptCount}</strong></span><span><i style="background:#ef4444"></i>background<strong>${(demo.proposals || []).filter((p) => p.class === "background" || (p.score < state.conf && p.id !== "p1")).length}</strong></span>`
            : `<span><i style="background:#2563eb"></i>proposal<strong>${(demo.anchors || []).length}</strong></span><span><i style="background:#22c55e"></i>positive anchor<strong>${rcnnKeptCount}</strong></span><span><i style="background:#ef4444"></i>negative anchor<strong>${processRpnAnchors(demo).filter((a) => a.dynamicLabel === "negative" || a.isLow).length}</strong></span>`;
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
            els.rcnnStage.innerHTML = `<div class="vision-empty-result">R-CNN demo data loading...</div>`;
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
        const yoloRealStage = els.image.closest(".detection-real-stage");
        if (yoloRealStage) yoloRealStage.hidden = false;
        const result = compute();
        const s = result.sample;
        const counts = yoloCounts(result);
        state.step = Math.min(state.step, result.steps.length - 1);
        const step = result.steps[state.step] || result.steps[0];
        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect", `${Math.max(1, s.width)} / ${Math.max(1, s.height)}`);
        const rawRatio2 = Math.max(1, s.width) / Math.max(1, s.height);
        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect-raw-x", rawRatio2.toFixed(3));
        els.image.src = s.image.startsWith("blob:") ? s.image : window.cvclassUrl(s.image);
        els.missing.textContent = "";
        els.missing.style.display = "none";
        els.confOut.textContent = state.conf.toFixed(2);
        els.iouOut.textContent = state.iou.toFixed(2);
        els.total.textContent = String(counts.decoded);
        els.total.classList.remove("det-count-roll");
        void els.total.offsetWidth;
        els.total.classList.add("det-count-roll");
        els.kept.textContent = String(counts.final);
        els.kept.classList.remove("det-count-roll");
        void els.kept.offsetWidth;
        els.kept.classList.add("det-count-roll");
        els.stepLabel.textContent = `${step.phase.toUpperCase()} · STEP ${state.step + 1} / ${result.steps.length}`;

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
        const interMarkup = c?.inter.area > 0 ? `<div class="vision-iou-intersection" style="left:${(c.inter.x1 / s.width) * 100}%;top:${(c.inter.y1 / s.height) * 100}%;width:${(c.inter.width / s.width) * 100}%;height:${(c.inter.height / s.height) * 100}%;"></div>` : "";
        const iouBadge = c ? `<div class="det-iou-badge"><span>IoU</span><strong>${c.iou.toFixed(3)}</strong><small>${c.suppress ? "suppress B" : "keep B"}</small></div>` : "";
        els.overlay.innerHTML = boxMarkupAll + interMarkup + iouBadge + renderNmsSlowMotionLayer(step, result, s);

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

    function renderControls() {
        els.sample.innerHTML = state.data.samples.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
        els.sample.value = state.sampleId;
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);
        renderClassControls(true);
    }

    function stop() {
        state.playing = false;
        clearTimeout(state.timer);
        els.play.textContent = "自动播放";
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
        setModelStatus("loading", "Loading ONNX Runtime Web and yolo_detection.onnx...");
        state.backend = els.backend.value;
        state.activeBackend = "--";
        renderRuntimeMetrics(compute());
        const client = await getInferenceClient();
        const info = await client.loadDetectionModel({backend: state.backend});
        state.activeBackend = info.backend || state.backend;
        const fallback = state.backend === "webgpu" && state.activeBackend === "wasm";
        setModelStatus("loaded", fallback ? "WebGPU unavailable or failed; fallback to WASM and continue inference." : "Model loaded. Running inference automatically.");
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
            const onError = () => { cleanup(); reject(new Error("Image failed to load; inference cannot run.")); };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    async function runInferenceInternal() {
        await waitForImage(els.image);
        setModelStatus("inference complete", "Decoding candidates and running post-processing...");
        const client = await getInferenceClient();
        const result = await client.runDetectionInference(els.image);
        setModelStatus("decode complete", "Candidates decoded. Running confidence filter and NMS...");
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
        setModelStatus("post-process complete", `Inference complete: showing Top ${boxes.length} 接收到待剔除候选总框数, rawOutputShape=[${(result.rawOutputShape || []).join(", ")}].`);
        renderClassControls(true);
        render();
    }

    async function autoLoadAndRun() {
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
            if (state.modelStatus !== "loaded" && state.modelStatus !== "post-process complete") await loadModelInternal();
            if (token !== state.autoToken) return;
            await runInferenceInternal();
        } catch (error) {
            if (token !== state.autoToken) return;
            state.inferenceError = error;
            state.activeBackend = "--";
            setModelStatus("load failed", formatInferenceError(error));
            fallbackToPreset(error);
        }
    }

    function setInferenceSceneFromUpload(file) {
        if (!file) return;
        if (!state.data) {
            els.inferenceMessage.textContent = "Detection sample data is still loading. Please try again later.";
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
            els.inferenceMessage.textContent = "Uploaded image loaded. Running inference automatically.";
            renderClassControls(true);
            render();
            autoLoadAndRun();
        };
        image.onerror = () => {
            els.inferenceMessage.textContent = "Uploaded image failed to load.";
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

    fetch(`${dataRoot}/overview/detection_samples.json?v=20260625-flowdiff1`)
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
            autoLoadAndRun();
        })
        .catch(() => {
            els.overlay.innerHTML = `<div class="vision-empty-result">检测样例数据加载失败</div>`;
        });

    els.sample.addEventListener("change", () => {
        stop();
        state.sampleId = els.sample.value;
        const s = selectedPresetSample();
        state.conf = s.confidence_threshold || 0.25;
        state.iou = s.nms_iou_threshold || 0.5;
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);
        state.source = "inference";
        state.fallbackReason = "";
        state.inferenceScene = sceneFromPreset(s, []);
        state.inferenceResult = null;
        state.inferenceError = null;
        state.hoveredProposalId = null;
        state.nmsAnimationStep = 0;
        state.step = 0;
        renderClassControls(true);
        render();
        if (state.detMode === "yolo") autoLoadAndRun();
    });
    els.backend.addEventListener("change", () => {
        state.backend = els.backend.value;
        state.inferenceClient?.dispose?.();
        state.inferenceClient = null;
        state.inferenceModule = null;
        state.inferenceResult = null;
        state.inferenceError = null;
        state.activeBackend = "--";
        setModelStatus("not loaded", "Backend changed. Reloading model and running inference...");
        renderRuntimeMetrics(compute());
        if (state.detMode === "yolo") autoLoadAndRun();
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
        state.nmsAnimationStep = 0;
        render();
        if (state.detMode === "yolo") autoLoadAndRun();
    }));
    els.conf.addEventListener("input", () => updateYoloThreshold("conf", Number(els.conf.value)));
    els.iou.addEventListener("input", () => updateYoloThreshold("iou", Number(els.iou.value)));
    els.showLow.addEventListener("change", () => { state.showLow = els.showLow.checked; render(); });
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
