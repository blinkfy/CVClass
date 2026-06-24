(function () {
    const root = document.querySelector("[data-detection-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/detection_inference.js?v=20260624-det-polish2");
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
        modelStatus: "未加载",
        inferenceClient: null,
        inferenceModule: null,
        inferenceScene: null,
        inferenceResult: null,
        inferenceError: null,
        customUrl: null,
        autoToken: 0,
        fallbackReason: ""
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
        {id: "points", title: "candidate points", detail: "8400 dense locations"},
        {id: "xywh", title: "xywh + class scores", detail: "best class per point"},
        {id: "threshold", title: "threshold", detail: "drop low scores"},
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
                <em>${result.candidates.length + result.low.length} decoded / ${result.kept.length} final</em>
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
            confidence_threshold: sample.confidence_threshold || 0.25,
            nms_iou_threshold: sample.nms_iou_threshold || 0.5
        };
    }

    function currentScene() {
        if (state.source === "preset") return selectedPresetSample();
        if (!state.inferenceScene) state.inferenceScene = sceneFromPreset(selectedPresetSample(), []);
        return state.inferenceScene;
    }

    function candidatePoolFromInference(result) {
        const raw = Array.isArray(result?.rawCandidates) && result.rawCandidates.length ? result.rawCandidates : result?.boxes;
        const sorted = (Array.isArray(raw) ? raw : [])
            .filter((box) => Array.isArray(box.bbox) && Number.isFinite(box.score))
            .sort((a, b) => b.score - a.score);
        const high = sorted.filter((box) => box.score >= state.conf);
        const low = sorted.filter((box) => box.score < state.conf);
        const selected = [
            ...high.slice(0, 600),
            ...low.slice(0, 120)
        ];
        if (selected.length < 72) {
            sorted.forEach((box) => {
                if (selected.length >= 72) return;
                if (!selected.includes(box)) selected.push(box);
            });
        }
        return selected
            .slice(0, 150)
            .map((box, index) => ({...box, id: index + 1}));
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
            makeStep("image", "image", "输入图像已加载，等待进入 letterbox 与 tensor 构造。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("preprocess", "preprocess", "执行 letterbox resize、normalize 与 HWC → CHW。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("inference", "inference", "ONNX Runtime Web 已输出 raw tensor。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("decode", "decode", "将 rawOutput 的 8400 个位置解码为 xywh 与类别得分候选框。", {}, keptIds, suppressedIds, lowIds, candidates),
            makeStep("confidence", "confidence", "按 confidence threshold 分离候选框与低置信度框。", {}, keptIds, suppressedIds, lowIds, candidates)
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
                steps.push(makeStep("compare", "nms", `比较框 A #${keep.id} 与框 B #${box.id} 的 IoU。`, {
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
                    steps.push(makeStep("suppress", "nms", `IoU ${score.toFixed(3)} ≥ 阈值 ${state.iou.toFixed(2)}，删除框 B。`, {
                        currentBoxId: keep.id,
                        compareBoxId: box.id,
                        iou: score,
                        decision: "suppress",
                        comparison
                    }, keptIds, suppressedIds, lowIds, candidates));
                    break;
                }
                steps.push(makeStep("keep", "nms", `IoU ${score.toFixed(3)} < 阈值 ${state.iou.toFixed(2)}，框 B 暂不删除。`, {
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
                    steps.push(makeStep("keep", "nms", `框 #${box.id} 当前没有同类高分框可比较，暂时保留。`, {
                        currentBoxId: box.id,
                        decision: "keep"
                    }, keptIds, suppressedIds, lowIds, candidates));
                }
            }
        }

        steps.push(makeStep("final", "final", "NMS 后处理完成，输出最终检测结果。", {}, keptIds, suppressedIds, lowIds, candidates));
        return {sample: s, boxes: visibleBoxes, low, candidates, candidateIds, kept, keptIds, suppressed, suppressedIds, comparisons, steps};
    }

    function statusForBox(box, step, result) {
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
        return `<div class="vision-bbox vision-bbox--${status}" style="left:${(x1 / s.width) * 100}%;top:${(y1 / s.height) * 100}%;width:${((x2 - x1) / s.width) * 100}%;height:${((y2 - y1) / s.height) * 100}%;--box-color:${esc(colorFor(box))}"><span>${esc(label)}</span></div>`;
    }

    function renderDecodeAnimation(step, result) {
        if (step.phase !== "decode") return "";
        const sample = result.candidates[0] || result.low[0];
        const bbox = sample?.bbox || [];
        return `<div class="det-decode-animation" aria-hidden="true">
            <span>rawOutput [1,84,8400]</span>
            <b>candidate point</b>
            <b>xywh + class scores</b>
            <b>xywh → x1,y1,x2,y2</b>
            <strong>bbox pop #${sample ? esc(sample.id) : "--"}</strong>
            <code>${bbox.length ? `[${bbox.join(", ")}]` : "--"}</code>
        </div>`;
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

    function renderRuntimeMetrics(result) {
        const inference = state.inferenceResult;
        const shape = rawOutputShapeNote();
        const source = state.source === "preset" ? "Preset JSON" : "ONNX Runtime Web";
        const decoded = result.candidates.length + result.low.length;
        els.inputSize.textContent = inference?.inputSize ? `${inference.inputSize} × ${inference.inputSize}` : "640 × 640";
        els.inferenceTime.textContent = Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--";
        els.postprocessTime.textContent = Number.isFinite(inference?.postprocessTime) ? `${inference.postprocessTime.toFixed(1)} ms` : "--";
        els.activeBackend.textContent = state.activeBackend || "--";
        els.stageSource.textContent = source;
        els.stageBackend.textContent = `Backend: ${state.activeBackend || "--"}`;
        els.stageInference.textContent = `Inference: ${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}`;
        els.stageCandidates.textContent = `Candidates: ${decoded}`;
        els.stageFinal.textContent = `Final: ${result.kept.length}`;
        els.runtimeStats.innerHTML = `
            <div><dt>rawOutputShape</dt><dd>${esc(shape)}</dd></div>
            <div><dt>vector layout</dt><dd>4 xywh + 80 class scores</dd></div>
            <div><dt>candidate points</dt><dd>8400 dense locations</dd></div>
            <div><dt>decoded candidate count</dt><dd>${decoded}</dd></div>
            <div><dt>confidence filtered count</dt><dd>${result.candidates.length}</dd></div>
            <div><dt>NMS kept count</dt><dd>${result.kept.length}</dd></div>
            <div><dt>preprocess time</dt><dd>${Number.isFinite(inference?.preprocessTime) ? `${inference.preprocessTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>inference time</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>postprocess time</dt><dd>${Number.isFinite(inference?.postprocessTime) ? `${inference.postprocessTime.toFixed(1)} ms` : "--"}</dd></div>
            <div><dt>backend</dt><dd>${esc(state.activeBackend || "--")}</dd></div>`;
    }

    function renderClassStats(result) {
        const counts = new Map();
        result.kept.forEach((box) => counts.set(box.class, (counts.get(box.class) || 0) + 1));
        if (!counts.size) {
            els.classStats.textContent = "暂无最终保留框。";
            return;
        }
        els.classStats.innerHTML = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `<span><i style="background:${esc(colorFor({class: name}))}"></i>${esc(name)}<strong>${count}</strong></span>`)
            .join("");
    }

    function renderCandidateTable(result, step) {
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
                return `<tr class="is-${status} ${active ? "is-active-row" : ""}">
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
                    <div><dt>threshold</dt><dd>${state.iou.toFixed(2)}</dd></div>
                    <div><dt>decision</dt><dd>${c.suppress ? "suppress B" : "keep B"}</dd></div>
                </dl>
            </div>`;
    }

    function renderStepper(step) {
        setStepper(yoloStepper, step.phase);
    }

    function renderNotes(step, result) {
        const s = result.sample;
        const inference = state.inferenceResult;
        const shape = rawOutputShapeText();
        const decodedCount = result.candidates.length + result.low.length;
        const sampleCandidate = result.candidates[0] || result.low[0] || null;
        const currentBox = findBoxById(result.boxes, step.currentBoxId);
        const compareBox = findBoxById(result.boxes, step.compareBoxId);
        const finalPreview = result.kept.slice(0, 2).map((box) => ({
            bbox: box.bbox,
            score: Number(box.score.toFixed(3)),
            class: box.class
        }));

        if (els.notesTitle) {
            els.notesTitle.textContent = "后处理步骤说明";
        }

        if (els.notesSubtitle) {
            els.notesSubtitle.textContent = "POST-PROCESS NOTES";
        }

        let tutorialContent = "";
        let notesContent = "";

        if (step.phase === "image") {
            tutorialContent = `<p><span class="det-note-stage">Image</span><strong>输入图像</strong>仍是原始 RGB 像素，后续会被 letterbox 到模型固定输入尺寸，再送入 ONNX Runtime。</p>`;
            notesContent = `<dl>
                <div><dt>input image</dt><dd>${s.width} × ${s.height}</dd></div>
                <div><dt>next tensor</dt><dd>[1, 3, 640, 640]</dd></div>
                <div><dt>target path</dt><dd>image → preprocess → inference → decode</dd></div>
            </dl>`;
        } else if (step.phase === "preprocess") {
            tutorialContent = `<p><span class="det-note-stage">Preprocess</span><strong>Letterbox + Normalize</strong>保留原图比例，补边到 640×640，并把 HWC 像素布局转成模型需要的 CHW tensor。</p>`;
            notesContent = `<dl>
                <div><dt>letterbox</dt><dd>${s.width} × ${s.height} → 640 × 640</dd></div>
                <div><dt>normalization</dt><dd>RGB / 255</dd></div>
                <div><dt>layout</dt><dd>HWC → CHW</dd></div>
                <div><dt>model input</dt><dd>[1, 3, 640, 640]</dd></div>
            </dl>`;
        } else if (step.phase === "inference") {
            tutorialContent = `<p><span class="det-note-stage">Inference</span><strong>ONNX inference</strong>输出 dense tensor。${esc(shape)} 表示 8400 个候选点，每个点有 4 个 xywh 参数和 80 个类别分数。</p>`;
            notesContent = `<dl>
                <div><dt>backend</dt><dd>${esc(state.activeBackend || "--")}</dd></div>
                <div><dt>rawOutputShape</dt><dd>${esc(rawOutputShapeNote())}</dd></div>
                <div><dt>layout meaning</dt><dd>84 = 4 bbox + 80 class scores</dd></div>
                <div><dt>inference time</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div>
            </dl>`;
        } else if (step.phase === "decode") {
            tutorialContent = `<p><span class="det-note-stage">Decode</span><strong>rawOutput → candidates</strong>遍历 8400 个点，取每个点的 xywh 与最大类别分数，再把中心点宽高换算成图像坐标 bbox。</p>`;
            notesContent = `<dl>
                <div><dt>raw tensor</dt><dd>${esc(shape)}</dd></div>
                <div><dt>candidate points</dt><dd>8400</dd></div>
                <div><dt>decoded boxes</dt><dd>${decodedCount}</dd></div>
                <div><dt>sample candidate</dt><dd>${sampleCandidate ? `#${sampleCandidate.id} ${esc(sampleCandidate.class)} ${sampleCandidate.score.toFixed(3)}` : "--"}</dd></div>
                <div><dt>box transform</dt><dd>cx, cy, w, h → x1, y1, x2, y2</dd></div>
            </dl>`;
        } else if (step.phase === "confidence") {
            tutorialContent = `<p><span class="det-note-stage">Confidence</span><strong>阈值过滤</strong>先删除低置信度框。低于 ${state.conf.toFixed(2)} 的候选框会变灰并淡出，只把高分候选送入 NMS。</p>`;
            notesContent = `<dl>
                <div><dt>decoded candidates</dt><dd>${decodedCount}</dd></div>
                <div><dt>threshold</dt><dd>${state.conf.toFixed(2)}</dd></div>
                <div><dt>pass filter</dt><dd>${result.candidates.length}</dd></div>
                <div><dt>filtered low score</dt><dd>${result.low.length}</dd></div>
                <div><dt>next stage</dt><dd>sort by score → class-wise NMS</dd></div>
            </dl>`;
        } else if (step.type === "final") {
            tutorialContent = `<p><span class="det-note-stage">Final</span><strong>最终检测输出</strong>只保留 NMS 后的稳定框。页面输出结构对应前端可消费的 detection 数组。</p>`;
            const avg = result.kept.length ? result.kept.reduce((sum, box) => sum + box.score, 0) / result.kept.length : 0;
            const classText = [...new Set(result.kept.map((box) => box.class))].map((name) => `${name}: ${result.kept.filter((box) => box.class === name).length}`).join(" / ") || "--";
            notesContent = `<dl>
                <div><dt>final detections</dt><dd>${result.kept.length}</dd></div>
                <div><dt>class counts</dt><dd>${esc(classText)}</dd></div>
                <div><dt>avg confidence</dt><dd>${avg.toFixed(3)}</dd></div>
                <div><dt>output schema</dt><dd>N × [x1,y1,x2,y2,score,class]</dd></div>
            </dl>
            <div class="det-final-output"><strong>final detections preview</strong><code>${esc(JSON.stringify(finalPreview))}</code></div>`;
        } else {
            const c = step.comparison;
            if (c) {
                const stageName = step.type === "suppress" ? "NMS" : step.type === "keep" ? "NMS" : "IoU";
                const decisionText = c.suppress ? `IoU ≥ ${state.iou.toFixed(2)}，NMS 删除低分框 B。` : `IoU < ${state.iou.toFixed(2)}，框 B 继续留在候选队列。`;
                tutorialContent = `<p><span class="det-note-stage">${stageName}</span><strong>当前比较 A/B</strong>IoU = Area(A ∩ B) / Area(A ∪ B)。${decisionText}</p>`;
                notesContent = `<div class="det-iou-equation">
                    <span>IoU</span><strong>${c.iou.toFixed(3)}</strong><small>${Math.round(c.inter.area)} / ${Math.round(c.union)}</small>
                </div>
                <div class="detection-pair"><strong>框 A</strong><span>${esc(c.a.class)} ${c.a.score.toFixed(2)}</span><code>[${c.a.bbox.join(", ")}]</code></div>
                <div class="detection-pair"><strong>框 B</strong><span>${esc(c.b.class)} ${c.b.score.toFixed(2)}</span><code>[${c.b.bbox.join(", ")}]</code></div>
                <dl>
                    <div><dt>matrix cell</dt><dd>A#${c.a.id} × B#${c.b.id}</dd></div>
                    <div><dt>intersection</dt><dd>${Math.round(c.inter.area)} px²</dd></div>
                    <div><dt>union</dt><dd>${Math.round(c.union)} px²</dd></div>
                    <div><dt>NMS decision</dt><dd>${c.suppress ? "删除框 B，红色虚线标记" : "暂时保留框 B"}</dd></div>
                </dl>`;
            } else {
                tutorialContent = `<p><span class="det-note-stage">NMS</span><strong>${esc(step.message)}</strong>当前候选没有同类高分框需要比较，先进入 kept set。</p>`;
                notesContent = `<dl>
                    <div><dt>current box</dt><dd>${currentBox ? `#${currentBox.id} ${esc(currentBox.class)} ${currentBox.score.toFixed(3)}` : "--"}</dd></div>
                    <div><dt>kept set size</dt><dd>${step.keptIds.size}</dd></div>
                    <div><dt>suppressed count</dt><dd>${step.suppressedIds.size}</dd></div>
                    <div><dt>compare target</dt><dd>${compareBox ? `#${compareBox.id}` : "none"}</dd></div>
                </dl>`;
            }
        }

        if (els.notesTutorial) {
            els.notesTutorial.innerHTML = tutorialContent;
        }
        els.notes.innerHTML = notesContent;
    }

    function demoBox(box, sample, kind, label, extraClass = "", extraStyle = "") {
        return `<div class="vision-bbox detection-demo-box detection-demo-box--${esc(kind)} ${esc(extraClass)}" style="${boxStyle(box, sample.width, sample.height)}${extraStyle}"><span>${esc(label)}</span></div>`;
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
            ${bars.map((bar) => `<div><span>${esc(bar.label)}</span><b style="--score:${Math.max(0.04, Math.min(1, bar.value))}"></b><strong>${bar.value.toFixed(2)}</strong></div>`).join("")}
        </div>`;
    }

    function renderRcnnFlow(demo, step) {
        const proposals = demo.proposals || [];
        const activeProposal = proposals[0] || {};
        const offset = activeProposal.offset || {};
        const refined = activeProposal.refined || activeProposal.bbox || [];
        const phaseOrder = ["image", "proposals", "crop", "features", "classifier", "regression", "nms"];
        const activeIndex = Math.max(0, phaseOrder.indexOf(step.id));
        const isActive = (id) => phaseOrder.indexOf(id) <= activeIndex;
        const isCurrent = (id) => step.id === id;
        const feature = demo.roiPooling?.featureMap || [];
        const cards = [
            ["proposals", "Selective Search", "类别无关候选区域", `${proposals.length} demo proposals`],
            ["crop", "Crop / Warp", "裁剪每个 proposal", "fixed CNN input"],
            ["features", "CNN Feature", "区域图像进入 CNN", "feature vector"],
            ["classifier", "Classifier", "判断类别或背景", `${activeProposal.class || "--"} ${Number(activeProposal.score || 0).toFixed(2)}`],
            ["regression", "BBox Regression", "平移缩放原始框", `dx ${offset.dx ?? "--"} · dy ${offset.dy ?? "--"}`],
            ["nms", "NMS", "删除重复 refined boxes", "final result"]
        ];
        return `
            <div class="detection-rcnn-evolution" aria-label="R-CNN 系列演化轴">
                <article class="is-active"><span>R-CNN</span><strong>Selective Search</strong><small>proposal 后逐框 CNN</small></article>
                <article class="${isActive("features") ? "is-active" : ""}"><span>Fast R-CNN</span><strong>ROI Pooling</strong><small>共享整图 feature map</small></article>
                <article class="${isActive("proposals") ? "is-active" : ""}"><span>Faster R-CNN</span><strong>RPN Anchor</strong><small>学习式 proposal 生成</small></article>
            </div>
            <div class="detection-demo-flow">
                ${cards.map((card) => `<article class="${isActive(card[0]) ? "is-active" : ""} ${isCurrent(card[0]) ? "is-current" : ""}"><strong>${esc(card[1])}</strong><span>${esc(card[2])}</span><em>${esc(card[3])}</em></article>`).join("")}
            </div>
            <section class="detection-proposal-lifecycle">
                <header>
                    <span>当前 Proposal 生命周期</span>
                    <strong>Proposal ${esc(activeProposal.id || "p1")}</strong>
                    <em>原始框 → crop / warp → CNN feature → classifier → refined box → NMS</em>
                </header>
                <div class="detection-lifecycle-grid">
                    <article class="${isActive("proposals") ? "is-active" : ""} ${isCurrent("proposals") || isCurrent("image") ? "is-current" : ""}">
                        <span>原始框</span>
                        <strong>[${(activeProposal.bbox || []).join(", ")}]</strong>
                        <small>Selective Search 给出类别无关 proposal。</small>
                    </article>
                    <article class="${isActive("crop") ? "is-active" : ""} ${isCurrent("crop") ? "is-current" : ""}">
                        <span>Crop / Warp</span>
                        <div class="detection-crop-warp-demo ${isCurrent("crop") ? "is-current" : ""}"><i>crop</i><b>warp</b></div>
                        <small>把 proposal 裁剪并缩放为 CNN 固定输入。</small>
                    </article>
                    <article class="${isActive("features") ? "is-active" : ""} ${isCurrent("features") ? "is-current" : ""}">
                        <span>CNN feature</span>
                        ${renderFeatureGrid(feature, isActive("features") ? ["2-4", "3-4", "4-4"] : [])}
                    </article>
                    <article class="${isActive("classifier") ? "is-active" : ""} ${isCurrent("classifier") ? "is-current" : ""}">
                        <span>Classifier score</span>
                        ${renderClassifierBars(activeProposal, isActive("classifier"))}
                    </article>
                    <article class="${isActive("regression") ? "is-active" : ""} ${isCurrent("regression") ? "is-current" : ""}">
                        <span>BBox regression</span>
                        <div class="detection-regression-track ${isActive("regression") ? "is-active" : ""}">
                            <i class="is-before"></i><i class="is-after"></i>
                            <b>original</b><b>refined</b>
                        </div>
                        <code>[${(activeProposal.bbox || []).join(", ")}] → [${refined.join(", ")}]</code>
                    </article>
                    <article class="${isActive("nms") ? "is-active" : ""} ${isCurrent("nms") ? "is-current" : ""}">
                        <span>NMS result</span>
                        <div class="detection-nms-result ${isActive("nms") ? "is-active" : ""}">
                            <b>keep ${esc(activeProposal.id || "p1")}</b>
                            <b class="is-suppressed">delete duplicate</b>
                        </div>
                        <small>同类 refined boxes 按 IoU 去重。</small>
                    </article>
                </div>
                <dl class="detection-regression-offsets">
                    <div><dt>dx</dt><dd>${offset.dx ?? "--"}</dd></div>
                    <div><dt>dy</dt><dd>${offset.dy ?? "--"}</dd></div>
                    <div><dt>dw</dt><dd>${offset.dw ?? "--"}</dd></div>
                    <div><dt>dh</dt><dd>${offset.dh ?? "--"}</dd></div>
                </dl>
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
        if (state.detMode === "roi") {
            const roi = demo.roiPooling?.roi;
            return [
                roi ? demoBox({bbox: roi.bbox}, sample, "proposal", "image ROI") : "",
                ...gts.slice(0, 2).map((box) => demoBox(box, sample, "gt", `GT ${box.class}`))
            ].join("");
        }
        if (state.detMode === "rpn") {
            const active = step.id === "proposals" || step.id === "head" || step.id === "final";
            return [
                ...gts.map((box) => demoBox(box, sample, "gt", `GT ${box.class}`)),
                ...anchors.filter((anchor) => active ? anchor.label === "positive" : true).map((anchor) => demoBox(anchor, sample, `anchor-${anchor.label}`, `${anchor.id} ${anchor.label} IoU ${anchor.iou.toFixed(2)}`))
            ].join("");
        }
        if (step.id === "regression") {
            const p = proposals[0];
            const gt = gts.find((item) => item.id === p?.target) || gts[0];
            return [
                p ? demoBox(p, sample, "proposal-active", "p1 original") : "",
                gt ? demoBox(gt, sample, "gt", "ground truth") : "",
                p?.refined ? demoBox({bbox: p.refined}, sample, "refined", "refined prediction") : ""
            ].join("");
        }
        if (step.id === "nms") {
            const p = proposals[0];
            const duplicate = p?.bbox ? {bbox: [p.bbox[0] + 4, p.bbox[1] + 4, p.bbox[2] - 2, p.bbox[3] - 4]} : null;
            return [
                ...proposals.slice(0, 4).map((item) => demoBox({bbox: item.refined || item.bbox}, sample, "refined", `${item.class} ${item.score.toFixed(2)}`)),
                duplicate ? demoBox(duplicate, sample, "nms-delete", "duplicate deleted") : ""
            ].join("");
        }
        if (["image", "proposals", "crop", "features", "classifier"].includes(step.id)) {
            const p = proposals[0];
            return [
                p ? demoBox(p, sample, "proposal-active", `${p.id} ${step.id === "image" ? "proposal" : "crop target"}`) : "",
                ...proposals.slice(1).map((box, index) => demoBox(box, sample, box.class === "background" ? "low" : "proposal", `${box.id} ${box.class}`, "", `--proposal-delay:${(index + 1) * 90}ms;`))
            ].join("");
        }
        return proposals.map((box, index) => demoBox(box, sample, box.class === "background" ? "low" : "proposal", `${box.id} ${box.class}`, "", `--proposal-delay:${index * 90}ms;`)).join("");
    }

    function renderRcnnTable(demo) {
        if (state.detMode === "roi") {
            const bins = demo.roiPooling?.bins || [];
            els.candidateTable.innerHTML = `<thead><tr><th>BIN</th><th>FEATURE RANGE</th><th>MAX</th><th>OUTPUT</th><th>STATUS</th></tr></thead><tbody>${bins.map((bin) => `<tr><td>${esc(bin.id)}</td><td>${esc(bin.range)}</td><td>${Number(bin.max).toFixed(2)}</td><td>pooled cell</td><td><span>max</span></td></tr>`).join("")}</tbody>`;
            return;
        }
        if (state.detMode === "rpn") {
            const anchors = demo.anchors || [];
            els.candidateTable.innerHTML = `<thead><tr><th>ID</th><th>GT</th><th>IoU</th><th>OBJECTNESS / OFFSET</th><th>LABEL</th></tr></thead><tbody>${anchors.map((a) => `<tr class="is-${a.label === "positive" ? "kept" : a.label === "negative" ? "suppressed" : "candidate"}"><td>${esc(a.id)}</td><td>${esc(a.gt || "background")}</td><td>${a.iou.toFixed(2)}</td><td>${a.objectness.toFixed(2)} / (${a.offset.dx}, ${a.offset.dy}, ${a.offset.dw}, ${a.offset.dh})</td><td><span>${esc(a.label)}</span></td></tr>`).join("")}</tbody>`;
            return;
        }
        const proposals = demo.proposals || [];
        els.candidateTable.innerHTML = `<thead><tr><th>ID</th><th>CLASS</th><th>SCORE</th><th>BBOX / REFINED</th><th>STATUS</th></tr></thead><tbody>${proposals.slice(0, 5).map((p) => `<tr class="is-${p.class === "background" ? "low-confidence" : "candidate"} ${p.id === "p1" ? "is-active-row" : ""}"><td>${esc(p.id)}</td><td>${esc(p.class)}</td><td>${p.score.toFixed(2)}</td><td>[${p.bbox.join(", ")}] → [${(p.refined || p.bbox).join(", ")}]</td><td><span>${p.id === "p1" ? "active proposal" : p.class === "background" ? "background" : "proposal"}</span></td></tr>`).join("")}</tbody>`;
    }

    function renderRcnnNotes(demo, step) {
        const proposals = demo.proposals || [];
        const anchors = demo.anchors || [];
        const p = proposals[0] || {};
        const roi = demo.roiPooling || {};
        if (state.detMode === "rcnn") {
            const stageCopy = {
                image: {
                    stage: "Selective Search",
                    text: "两阶段检测先看整张图像，但第一阶段不是 dense output decode，而是生成少量类别无关 proposals，降低后续分类搜索空间。",
                    data: [
                        ["input image", `${demoImageSample().width} × ${demoImageSample().height}`],
                        ["stage 1", "proposal generation"],
                        ["stage 2", "classify + refine each proposal"],
                        ["active proposal", p.id || "--"]
                    ]
                },
                proposals: {
                    stage: "Selective Search",
                    text: "Selective Search 根据颜色、纹理、区域相似性合并候选区域，产生 proposal p1、p2 等粗框；这些框还没有类别含义。",
                    data: [
                        ["proposal count", proposals.length],
                        ["proposal p1 bbox", `[${(p.bbox || []).join(", ")}]`],
                        ["proposal type", "class-agnostic region"],
                        ["next", "crop / warp every proposal"]
                    ]
                },
                crop: {
                    stage: "Crop-Warp",
                    text: "R-CNN 会把当前 proposal 从原图裁剪出来，并缩放到 CNN 固定输入尺寸。这个阶段解释 proposal 生命周期中的区域图像如何变成网络输入。",
                    data: [
                        ["proposal", p.id || "--"],
                        ["raw bbox", `[${(p.bbox || []).join(", ")}]`],
                        ["operation", "crop image patch + warp"],
                        ["CNN input", "fixed-size region image"]
                    ]
                },
                features: {
                    stage: "CNN Feature",
                    text: "裁剪后的 proposal 单独进入 CNN，得到区域 feature vector。早期 R-CNN 的核心成本就来自每个 proposal 都要重复跑 CNN。",
                    data: [
                        ["proposal", p.id || "--"],
                        ["feature source", "cropped region"],
                        ["feature role", "region descriptor"],
                        ["compute cost", "per-proposal CNN"]
                    ]
                },
                classifier: {
                    stage: "Classifier",
                    text: "区域 feature 进入分类器，输出 person、bus、background 等分数。分数高的 proposal 才继续参与 bbox regression 和后续 NMS。",
                    data: [
                        ["proposal", p.id || "--"],
                        ["predicted class", p.class || "--"],
                        ["classifier score", Number.isFinite(p.score) ? p.score.toFixed(2) : "--"],
                        ["background handling", "low score or background proposal removed"]
                    ]
                },
                regression: {
                    stage: "BBox Regression",
                    text: "BBox regressor 预测 dx、dy、dw、dh，把 Selective Search 的粗 proposal 平滑移动到更贴近目标的 refined box。",
                    data: [
                        ["original box", `[${(p.bbox || []).join(", ")}]`],
                        ["offset", `dx ${p.offset?.dx ?? "--"} / dy ${p.offset?.dy ?? "--"} / dw ${p.offset?.dw ?? "--"} / dh ${p.offset?.dh ?? "--"}`],
                        ["refined box", `[${(p.refined || []).join(", ")}]`],
                        ["lifecycle", "proposal → refined detection"]
                    ]
                },
                nms: {
                    stage: "NMS",
                    text: "第二阶段产生的 refined boxes 仍可能重复覆盖同一目标。NMS 在同类 refined boxes 上保留高分框，并删除重叠候选。",
                    data: [
                        ["NMS input", "classified refined boxes"],
                        ["keep", `${p.id || "p1"} ${p.class || "--"} ${Number.isFinite(p.score) ? p.score.toFixed(2) : "--"}`],
                        ["delete", "overlapped lower-score duplicate"],
                        ["output", "final two-stage detections"]
                    ]
                }
            };
            const copy = stageCopy[step.id] || stageCopy.image;
            els.notesTitle.textContent = "两阶段检测机制";
            els.notesSubtitle.textContent = "TWO-STAGE NOTES";
            els.notesTutorial.innerHTML = `<p><span class="det-note-stage">${esc(copy.stage)}</span><strong>${esc(step.title)}</strong>${esc(copy.text)}</p>`;

            const STEP_LABELS = {
                image: 'Image Input',
                proposals: 'Selective Search',
                crop: 'Crop / Warp',
                features: 'CNN Feature',
                classifier: 'Classifier',
                regression: 'BBox Regression',
                nms: 'NMS'
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
                        ${i < curIdx ? '<span class="det-notes-tl-check">✓</span>' : ''}
                    </div>`;
                }).join('')}
            </div>`;

            els.notes.innerHTML = `<dl>${copy.data.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${timelineHtml}`;
            return;
        }
        const positiveCount = anchors.filter((anchor) => anchor.label === "positive").length;
        const negativeCount = anchors.filter((anchor) => anchor.label === "negative").length;
        const copy = {
            rcnn: {
                title: "两阶段检测机制",
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
                tutorial: `<p><strong>当前机制解决的问题：</strong>用可学习的 RPN 替代 Selective Search。RPN 在 feature map 上滑动，为每个 anchor 预测 objectness score 与 bbox offset。</p>`,
                subtitle: step.title,
                data: `<dl>
                    <div><dt>解决的问题</dt><dd>自动生成高质量 proposals，减少手工候选区域生成成本。</dd></div>
                    <div><dt>输入结构</dt><dd>shared feature map + ${anchors.length} anchors（positive ${positiveCount} / negative ${negativeCount}）。</dd></div>
                    <div><dt>中间输出</dt><dd>每个 anchor 输出 objectness score 与 bbox offset，再筛选 proposal output。</dd></div>
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

    function renderRcnnMode() {
        setModeTheme("rcnn");
        updateModeButtons();
        const demo = demoData();
        const sample = demoImageSample();
        const step = activeRcnnStep();
        const steps = activeRcnnSteps();
        if (els.pipeline) els.pipeline.hidden = true;
        if (els.pairCard) {
            els.pairCard.hidden = true;
            els.pairCard.innerHTML = "";
        }
        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect", `${Math.max(1, sample.width)} / ${Math.max(1, sample.height)}`);
        const rawRatio = Math.max(1, sample.width) / Math.max(1, sample.height);
        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect-raw-x", rawRatio.toFixed(3));
        if (sample.image) els.image.src = sample.image.startsWith("blob:") ? sample.image : window.cvclassUrl(sample.image);
        els.missing.textContent = "";
        els.missing.style.display = "none";
        els.rcnnStage.hidden = false;
        els.overlay.innerHTML = demo.version ? renderRcnnOverlay(demo, sample, step) : "";
        els.total.textContent = String(state.detMode === "rpn" ? (demo.anchors || []).length : (demo.proposals || []).length);
        els.kept.textContent = String(state.detMode === "rpn" ? (demo.anchors || []).filter((a) => a.label === "positive").length : (demo.proposals || []).filter((p) => p.class !== "background").length);
        els.stageSource.textContent = state.detMode === "rcnn" ? "Two-stage proposal lifecycle" : state.detMode === "roi" ? "Fast R-CNN ROI Pooling" : "Faster R-CNN RPN";
        els.stageBackend.textContent = state.detMode === "rcnn" ? "Proposal: Selective Search" : "Backend: preset demo data";
        els.stageInference.textContent = state.detMode === "rcnn" ? "CNN head: conceptual" : "Inference: concept";
        els.stageCandidates.textContent = state.detMode === "rcnn" ? `Proposals: ${els.total.textContent}` : `Candidates: ${els.total.textContent}`;
        els.stageFinal.textContent = state.detMode === "rcnn" ? `Refined: ${els.kept.textContent}` : `Final: ${els.kept.textContent}`;
        els.stepLabel.textContent = `${step.title.toUpperCase()} · STEP ${state.rcnnStep + 1} / ${steps.length}`;
        els.runtimeStats.innerHTML = state.detMode === "rcnn"
            ? `<div><dt>stage 1</dt><dd>Selective Search proposals</dd></div><div><dt>current phase</dt><dd>${esc(step.id)}</dd></div><div><dt>active proposal</dt><dd>${esc((demo.proposals || [])[0]?.id || "p1")}</dd></div><div><dt>stage 2</dt><dd>CNN feature + classifier + bbox reg</dd></div>`
            : `<div><dt>method</dt><dd>${esc(state.detMode)}</dd></div><div><dt>current phase</dt><dd>${esc(step.id)}</dd></div><div><dt>ground truth boxes</dt><dd>${(demo.groundTruth || []).length}</dd></div><div><dt>NMS</dt><dd>final duplicate removal</dd></div>`;
        els.classStats.innerHTML = state.detMode === "rcnn"
            ? `<span><i style="background:#7c3aed"></i>proposal<strong>${(demo.proposals || []).length}</strong></span><span><i style="background:#4f46e5"></i>refined<strong>${(demo.proposals || []).filter((p) => p.class !== "background").length}</strong></span><span><i style="background:#ef4444"></i>background<strong>${(demo.proposals || []).filter((p) => p.class === "background").length}</strong></span>`
            : `<span><i style="background:#2563eb"></i>proposal<strong>${(demo.proposals || []).length}</strong></span><span><i style="background:#22c55e"></i>positive anchor<strong>${(demo.anchors || []).filter((a) => a.label === "positive").length}</strong></span><span><i style="background:#ef4444"></i>negative anchor<strong>${(demo.anchors || []).filter((a) => a.label === "negative").length}</strong></span>`;
        renderRcnnTable(demo);
        setStepper(steps, step.id);
        renderRcnnNotes(demo, step);
        if (!demo.version) {
            els.rcnnStage.innerHTML = `<div class="vision-empty-result">R-CNN demo data loading...</div>`;
            return;
        }
        els.rcnnStage.innerHTML = state.detMode === "roi" ? renderRoiFlow(demo, step) : state.detMode === "rpn" ? renderRpnFlow(demo, step) : renderRcnnFlow(demo, step);
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
        els.total.textContent = String(result.candidates.length + result.low.length);
        els.kept.textContent = String(result.kept.length);
        els.stepLabel.textContent = `${step.phase.toUpperCase()} · STEP ${state.step + 1} / ${result.steps.length}`;

        const shouldDrawLow = state.showLow || step.type === "final" || step.type === "confidence";
        const statusLayers = {low: [], suppressed: [], candidate: [], raw: [], "compare-b": [], "compare-a": [], kept: []};
        result.boxes.forEach((box) => {
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
        els.overlay.innerHTML = boxMarkupAll + interMarkup + iouBadge + renderDecodeAnimation(step, result);

        renderSourceControls();
        renderRuntimeMetrics(result);
        renderCandidateTable(result, step);
        renderPairCard(step);
        renderClassStats(result);
        renderStepper(step);
        renderYoloDecodePipeline(step, result);
        renderNotes(step, result);
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
        state.conf = s.confidence_threshold;
        state.iou = s.nms_iou_threshold;
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
        setModelStatus("已加载", fallback ? "WebGPU 不可用或加载失败，已自动回退 WASM；正在自动运行推理。" : "模型已加载，正在自动运行推理。");
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
            const onError = () => { cleanup(); reject(new Error("图片加载失败，无法运行推理。")); };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    async function runInferenceInternal() {
        await waitForImage(els.image);
        setModelStatus("推理完成", "正在解码候选框并执行后处理...");
        const client = await getInferenceClient();
        const result = await client.runDetectionInference(els.image);
        setModelStatus("解码完成", "候选框解码完成，正在执行 confidence filter 与 NMS...");
        // 真实推理使用模型阈值 0.25，不沿用样例数据的 0.5
        state.conf = 0.25;
        els.conf.value = "0.25";
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
        setModelStatus("后处理完成", `推理完成：展示 Top ${boxes.length} 个 decoded candidates，rawOutputShape=[${(result.rawOutputShape || []).join(", ")}]。`);
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
            els.inferenceMessage.textContent = "已载入上传图片，正在自动运行推理。";
            renderClassControls(true);
            render();
            autoLoadAndRun();
        };
        image.onerror = () => {
            els.inferenceMessage.textContent = "上传图片读取失败。";
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

    fetch(`${dataRoot}/overview/detection_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            const s = selectedPresetSample();
            state.conf = s.confidence_threshold;
            state.iou = s.nms_iou_threshold;
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
        state.conf = s.confidence_threshold;
        state.iou = s.nms_iou_threshold;
        els.conf.value = String(state.conf);
        els.iou.value = String(state.iou);
        state.source = "inference";
        state.fallbackReason = "";
        state.inferenceScene = sceneFromPreset(s, []);
        state.inferenceResult = null;
        state.inferenceError = null;
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
        setModelStatus("未加载", "后端已切换，正在自动重新加载并推理。");
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
        render();
        if (state.detMode === "yolo") autoLoadAndRun();
    }));
    els.conf.addEventListener("input", () => { state.conf = Number(els.conf.value); state.step = 4; render(); });
    els.iou.addEventListener("input", () => { state.iou = Number(els.iou.value); state.step = state.detMode === "yolo" ? compute().steps.length - 1 : state.step; render(); });
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
}());
