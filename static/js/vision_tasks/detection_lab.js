(function () {
    const root = document.querySelector("[data-detection-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const inferenceModuleUrl = window.cvclassUrl("/static/js/inference/detection_inference.js");
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const state = {
        data: null,
        sampleId: "",
        source: "inference",
        conf: 0.25,
        iou: 0.5,
        showLow: true,
        classes: new Set(),
        step: 0,
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
        stepperItems: [...document.querySelectorAll("[data-det-stepper] [data-det-phase]")]
    };

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
            makeStep("candidate", "candidate", "展示 decode 后的 raw candidate boxes。", {}, keptIds, suppressedIds, lowIds, candidates),
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

        steps.push(makeStep("final", "nms", "NMS 后处理完成，输出最终检测结果。", {}, keptIds, suppressedIds, lowIds, candidates));
        return {sample: s, boxes: visibleBoxes, low, candidates, candidateIds, kept, keptIds, suppressed, suppressedIds, comparisons, steps};
    }

    function statusForBox(box, step, result) {
        if (step.lowIds.has(box.id)) return "low";
        if (step.type === "candidate") return "raw";
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
        const shape = inference?.rawOutputShape?.length ? `[${inference.rawOutputShape.join(", ")}]` : "--";
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
        const rows = result.boxes
            .slice()
            .sort((a, b) => b.score - a.score)
            .slice(0, 40)
            .map((box) => {
                const status = tableStatusFor(statusForBox(box, step, result), step, box);
                return `<tr class="is-${status}">
                    <td>${box.id}</td>
                    <td>${esc(box.class)}</td>
                    <td>${box.score.toFixed(3)}</td>
                    <td>[${box.bbox.join(", ")}]</td>
                    <td><span>${status}</span></td>
                </tr>`;
            }).join("");
        els.candidateTable.innerHTML = rows || `<tr><td colspan="5">暂无候选框。</td></tr>`;
    }

    function renderStepper(step) {
        els.stepperItems.forEach((item) => {
            const active = item.dataset.detPhase === step.phase;
            item.classList.toggle("is-active", active);
        });
    }

    function renderNotes(step, result) {
        const s = result.sample;
        const inference = state.inferenceResult;
        const shape = inference?.rawOutputShape?.length ? `[${inference.rawOutputShape.join(", ")}]` : "--";

        if (els.notesTitle) {
            els.notesTitle.textContent = step.phase === "image" ? "输入与预处理" :
                                         step.phase === "preprocess" ? "预处理 (Letterbox)" :
                                         step.phase === "inference" ? "模型推理" :
                                         step.phase === "candidate" ? "获取候选框" :
                                         step.phase === "confidence" ? "置信度过滤" :
                                         "IoU 与 NMS";
        }
        
        if (els.notesSubtitle) {
            els.notesSubtitle.textContent = step.message || step.phase;
        }

        let tutorialContent = "";

        if (step.phase === "image") {
            tutorialContent = `<p>载入原始图像。计算机此时看到的只是一大片 RGB 像素矩阵。接下来我们要把它送入神经网络，让它找出图中的所有目标物体。</p>`;
            els.notes.innerHTML = `<dl><div><dt>输入图像尺寸</dt><dd>${s.width} × ${s.height}</dd></div></dl>`;
        } else if (step.phase === "preprocess") {
            tutorialContent = `<p><strong>预处理（Letterbox）</strong>：因为神经网络通常需要固定尺寸的输入（如 640×640）。算法会对原图进行等比缩放并填充灰边，防止变形，同时完成 HWC 到 CHW 维度的转置。</p>`;
            els.notes.innerHTML = `<dl><div><dt>输入图像尺寸</dt><dd>${s.width} × ${s.height}</dd></div><div><dt>letterbox 后尺寸</dt><dd>640 × 640</dd></div><div><dt>normalization</dt><dd>RGB / 255</dd></div><div><dt>layout</dt><dd>HWC → CHW</dd></div><div><dt>tensor shape</dt><dd>[1, 3, 640, 640]</dd></div></dl>`;
        } else if (step.phase === "inference") {
            tutorialContent = `<p><strong>卷积网络推理中...</strong> ONNX Runtime 正在运算。模型最后输出一个庞大的预测矩阵。图上已生成成千上万个预测节点，每个节点包含位置、宽高和置信度。</p>`;
            els.notes.innerHTML = `<p>YOLO 输出说明：[1,84,8400] 表示 8400 个候选位置，每个位置包含 4 个框参数和 80 个类别得分。</p><dl><div><dt>推理后端</dt><dd>${esc(state.activeBackend || "--")}</dd></div><div><dt>rawOutputShape</dt><dd>${esc(shape)}</dd></div><div><dt>inference time</dt><dd>${Number.isFinite(inference?.inferenceTime) ? `${inference.inferenceTime.toFixed(1)} ms` : "--"}</dd></div></dl>`;
        } else if (step.phase === "candidate") {
            tutorialContent = `<p><strong>解码出候选框</strong>。看看这团乱麻！这就是深度网络最原始的输出。对于每一个物体，网络可能在不同尺度上重复预测了几十次。我们需要把它清理干净。</p>`;
            els.notes.innerHTML = `<dl><div><dt>解码候选框数量</dt><dd>${result.candidates.length + result.low.length}</dd></div></dl>`;
        } else if (step.phase === "confidence") {
            tutorialContent = `<p><strong>置信度过滤</strong>：第一道筛子。抛弃连模型自己都觉得“这里大概率什么都没有”的底分预测框（得分不足置信度阈值），瞬间清理掉 99% 的垃圾背景。</p>`;
            els.notes.innerHTML = `<dl><div><dt>解码候选框数量</dt><dd>${result.candidates.length + result.low.length}</dd></div><div><dt>当前 confidence threshold</dt><dd>${state.conf.toFixed(2)}</dd></div><div><dt>高于阈值</dt><dd>${result.candidates.length}</dd></div><div><dt>低置信度过滤</dt><dd>${result.low.length}</dd></div></dl>`;
        } else if (step.type === "final") {
            tutorialContent = `<p><strong>推断完成</strong>：通过 NMS 找到了各个物体真正的目标边框，最终输出了结果！</p>`;
            const avg = result.kept.length ? result.kept.reduce((sum, box) => sum + box.score, 0) / result.kept.length : 0;
            const classText = [...new Set(result.kept.map((box) => box.class))].map((name) => `${name}: ${result.kept.filter((box) => box.class === name).length}`).join(" / ") || "--";
            els.notes.innerHTML = `<dl><div><dt>最终检测数量</dt><dd>${result.kept.length}</dd></div><div><dt>各类别数量</dt><dd>${esc(classText)}</dd></div><div><dt>平均置信度</dt><dd>${avg.toFixed(3)}</dd></div><div><dt>当前输出结构</dt><dd>N × [x1, y1, x2, y2, score, class]</dd></div></dl>`;
        } else {
            const c = step.comparison;
            if (c) {
                tutorialContent = `<p><strong>非极大值抑制 (NMS)</strong>：计算当前最高分“霸主”与其他候选框的交并比 (IoU)。如果 IoU 过大，说明代表同一个物体，直接删掉。</p>`;
                els.notes.innerHTML = `<p><strong>IoU 公式：</strong>Area(A ∩ B) / Area(A ∪ B)</p><div class="detection-pair"><strong>框 A（当前霸主）</strong><span>${esc(c.a.class)} ${c.a.score.toFixed(2)}</span><code>[${c.a.bbox.join(", ")}]</code></div><div class="detection-pair"><strong>框 B（当前比较）</strong><span>${esc(c.b.class)} ${c.b.score.toFixed(2)}</span><code>[${c.b.bbox.join(", ")}]</code></div><dl><div><dt>交集面积</dt><dd>${Math.round(c.inter.area)} px²</dd></div><div><dt>判定</dt><dd>${c.suppress ? "同类框重叠过高，删除框 B" : "保留候选项"}</dd></div></dl>`;
            } else {
                tutorialContent = `<p><strong>${esc(step.message)}</strong></p>`;
                els.notes.innerHTML = "";
            }
        }

        if (els.notesTutorial) {
            els.notesTutorial.innerHTML = tutorialContent;
        }
    }

    function render() {
        const result = compute();
        const s = result.sample;
        state.step = Math.min(state.step, result.steps.length - 1);
        const step = result.steps[state.step] || result.steps[0];
        els.image.closest(".detection-real-stage")?.style.setProperty("--det-aspect", `${Math.max(1, s.width)} / ${Math.max(1, s.height)}`);
        els.image.src = s.image.startsWith("blob:") ? s.image : window.cvclassUrl(s.image);
        els.missing.textContent = "";
        els.missing.style.display = "none";
        els.confOut.textContent = state.conf.toFixed(2);
        els.iouOut.textContent = state.iou.toFixed(2);
        els.total.textContent = String(result.candidates.length + result.low.length);
        els.kept.textContent = String(result.kept.length);
        els.stepLabel.textContent = `${step.phase.toUpperCase()} · STEP ${state.step + 1} / ${result.steps.length}`;

        const shouldDrawLow = state.showLow || step.type === "final" || step.type === "confidence";
        const boxMarkupAll = result.boxes.map((box) => {
            const status = statusForBox(box, step, result);
            if (status === "low" && !shouldDrawLow) return "";
            return boxMarkup(box, s, status);
        }).join("");
        const c = step.comparison;
        const interMarkup = c?.inter.area > 0 ? `<div class="vision-iou-intersection" style="left:${(c.inter.x1 / s.width) * 100}%;top:${(c.inter.y1 / s.height) * 100}%;width:${(c.inter.width / s.width) * 100}%;height:${(c.inter.height / s.height) * 100}%;"></div>` : "";
        els.overlay.innerHTML = boxMarkupAll + interMarkup;

        renderSourceControls();
        renderRuntimeMetrics(result);
        renderCandidateTable(result, step);
        renderClassStats(result);
        renderStepper(step);
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
        clearInterval(state.timer);
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
        const current = currentScene();
        const boxes = result.boxes.map((box, index) => ({...box, id: index + 1}));
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
        setModelStatus("后处理完成", `推理完成：解码 ${boxes.length} 个候选框，rawOutputShape=[${(result.rawOutputShape || []).join(", ")}]。`);
        renderClassControls(true);
        render();
    }

    async function autoLoadAndRun() {
        if (!state.data) return;
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

    fetch(`${dataRoot}/detection_samples.json`)
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
        autoLoadAndRun();
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
        autoLoadAndRun();
    });
    els.upload.addEventListener("change", () => {
        const file = els.upload.files?.[0];
        const filenameEl = document.getElementById("detUploadFilename");
        if (filenameEl) {
            filenameEl.textContent = file ? file.name : "未选择文件";
        }
        setInferenceSceneFromUpload(file);
    });
    els.conf.addEventListener("input", () => { state.conf = Number(els.conf.value); state.step = 4; render(); });
    els.iou.addEventListener("input", () => { state.iou = Number(els.iou.value); state.step = Math.min(state.step, compute().steps.length - 1); render(); });
    els.showLow.addEventListener("change", () => { state.showLow = els.showLow.checked; render(); });
    els.prev.addEventListener("click", () => { state.step = Math.max(0, state.step - 1); render(); });
    els.next.addEventListener("click", () => { state.step = Math.min(compute().steps.length - 1, state.step + 1); render(); });
    els.play.addEventListener("click", () => {
        if (state.playing) return stop();
        state.playing = true;
        els.play.textContent = "暂停播放";
        state.timer = setInterval(() => {
            const max = compute().steps.length - 1;
            state.step = state.step >= max ? 0 : state.step + 1;
            render();
        }, 1200);
    });
}());
