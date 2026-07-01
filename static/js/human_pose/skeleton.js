(function () {
    const root = document.querySelector("[data-human-pose-skeleton]");
    if (!root) return;

    const lab = document.querySelector(".human-pose-lab");
    const basePath = window.CVCLASS_BASE_PATH || "";
    const el = {
        inferenceMode: root.querySelector("[data-pose-inference-mode]"),
        maxPeople: root.querySelector("[data-pose-max-people]"),
        sampleSelect: root.querySelector("[data-pose-sample]"),
        templateSelect: root.querySelector("[data-pose-template]"),
        threshold: root.querySelector("[data-pose-threshold]"),
        thresholdOutput: root.querySelector("[data-pose-threshold-output]"),
        upload: root.querySelector("[data-pose-upload]"),
        uploadName: root.querySelector("[data-pose-upload-name]"),
        uploadNote: root.querySelector("[data-pose-upload-note]"),
        play: root.querySelector("[data-pose-play]"),
        runModel: root.querySelector("[data-pose-run-model]"),
        reset: root.querySelector("[data-pose-reset]"),
        version: root.querySelector("[data-pose-version]"),
        versionNote: root.querySelector("[data-pose-version-note]"),
        imageFrame: root.querySelector("[data-pose-image-frame]"),
        image: root.querySelector("[data-pose-image]"),
        overlay: root.querySelector("[data-pose-overlay]"),
        loading: root.querySelector("[data-pose-loading]"),
        bboxLayer: root.querySelector("[data-pose-bbox-layer]"),
        skeletonLayer: root.querySelector("[data-pose-skeleton-layer]"),
        keypointLayer: root.querySelector("[data-pose-keypoint-layer]"),
        labelLayer: root.querySelector("[data-pose-label-layer]"),
        sampleLabel: root.querySelector("[data-pose-sample-label]"),
        templateLabel: root.querySelector("[data-pose-template-label]"),
        visibleCount: root.querySelector("[data-pose-visible-count]"),
        statusChip: root.querySelector("[data-pose-status-chip]"),
        stageNoteTitle: root.querySelector("[data-pose-stage-note-title]"),
        stageNote: root.querySelector("[data-pose-stage-note]"),
        vectorCard: root.querySelector("[data-pose-vector-card]"),
        vector: root.querySelector("[data-pose-vector]"),
        vectorShape: root.querySelector("[data-pose-vector-shape]"),
        vectorStats: root.querySelector("[data-pose-vector-stats]"),
        outputSchema: root.querySelector("[data-pose-output-schema]"),
        limbReadout: root.querySelector("[data-pose-limb-readout]"),
        stepperItems: Array.from(document.querySelectorAll("[data-pose-stepper] li")),
        kpTitle: root.querySelector("[data-kp-title]"),
        kpId: root.querySelector("[data-kp-id]"),
        kpName: root.querySelector("[data-kp-name]"),
        kpX: root.querySelector("[data-kp-x]"),
        kpY: root.querySelector("[data-kp-y]"),
        kpScore: root.querySelector("[data-kp-score]"),
        kpVisible: root.querySelector("[data-kp-visible]"),
        kpLimbs: root.querySelector("[data-kp-limbs]"),
        kpVectorIndex: root.querySelector("[data-kp-vector-index]"),
    };

    const keypointNames = [
        "nose",
        "left_eye",
        "right_eye",
        "left_ear",
        "right_ear",
        "left_shoulder",
        "right_shoulder",
        "left_elbow",
        "right_elbow",
        "left_wrist",
        "right_wrist",
        "left_hip",
        "right_hip",
        "left_knee",
        "right_knee",
        "left_ankle",
        "right_ankle",
    ];

    const phaseNotes = [
        ["Person Crop", "人体检测框先限定推理区域，减少背景干扰。"],
        ["Keypoint Prediction", "模型或预设标注给出 17 个关节点坐标与置信度。"],
        ["Confidence Filter", "置信度低于阈值的点会灰化，对应 limb 也会弱化。"],
        ["Skeleton Link", "按骨架模板把肩、肘、腕、髋、膝、踝等关节连接成结构图。"],
        ["Pose Vector", "所有关键点坐标与 score 被拼接成姿态向量，供后续动作识别使用。"],
    ];

    const personPalette = [
        ["#0ea5e9", "rgba(14, 165, 233, 0.07)"],
        ["#2563eb", "rgba(37, 99, 235, 0.07)"],
        ["#f59e0b", "rgba(245, 158, 11, 0.08)"],
        ["#0891b2", "rgba(8, 145, 178, 0.07)"],
        ["#3b82f6", "rgba(59, 130, 246, 0.07)"],
        ["#64748b", "rgba(100, 116, 139, 0.07)"],
    ];

    const state = {
        samplesData: null,
        skeletonData: null,
        sample: null,
        templateKey: "coco17",
        selectedId: 0,
        threshold: 0.5,
        phase: 5,
        timer: 0,
        customObjectUrl: "",
        customFileName: "",
        inferenceMode: "movenet_multi",
        multiPoseMaxPeople: 6,
        modelUrls: {
            thunder: root.dataset.poseModelUrlThunder || root.dataset.poseModelUrl || "",
            lightning: root.dataset.poseModelUrlLightning || "",
            multipose: root.dataset.poseModelUrlMultipose || "",
        },
        poseWorkerUrl: root.dataset.poseWorkerUrl || "",
        modelVariant: "multipose",
        worker: null,
        workerRequestId: 0,
        activeWorkerRequestId: 0,
        pendingInference: null,
        modelLoading: false,
        autoRunning: false,
        autoInferenceTimer: 0,
        modelReady: false,
        modelError: false,
        backendName: "",
        lastRealInference: null,
    };

    function cvUrl(path) {
        if (!path || /^(https?:|data:|blob:)/i.test(path)) return path;
        // 避免双重前缀：若路径已含 basePath 则直接返回（来自 url_for 的路径已包含 basePath）
        if (basePath && path.startsWith(basePath + "/")) return path;
        return `${basePath}${path}`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function personColor(index) {
        return personPalette[index % personPalette.length][0];
    }

    function personFill(index) {
        return personPalette[index % personPalette.length][1];
    }

    function setPageStatus(text) {
        const heroState = document.querySelector(".human-pose-state");
        if (heroState) heroState.textContent = text;
        if (el.version) el.version.textContent = text;
    }

    function setModelMessage(title, note) {
        if (el.stageNoteTitle) el.stageNoteTitle.textContent = title;
        if (el.stageNote) el.stageNote.textContent = note;
    }

    function poseRuntimeAvailable() {
        return Boolean(window.Worker && state.poseWorkerUrl);
    }

    function invalidateActiveInference() {
        state.activeWorkerRequestId = 0;
        state.pendingInference = null;
        state.autoRunning = false;
        state.modelLoading = false;
    }

    function nextFrame() {
        return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    function isRealInferenceMode() {
        return state.inferenceMode === "movenet_multi" || state.inferenceMode === "movenet";
    }

    function isMultiPoseMode() {
        return state.inferenceMode === "movenet_multi";
    }

    function modelVariantName(variant = state.modelVariant) {
        if (variant === "multipose") return "MoveNet MultiPose Lightning";
        return variant === "lightning" ? "MoveNet Lightning fallback" : "MoveNet Thunder";
    }

    function modelVariantStatus(variant = state.modelVariant) {
        if (variant === "multipose") return "本地 MoveNet MultiPose";
        return variant === "lightning" ? "本地 MoveNet Lightning fallback" : "本地 MoveNet Thunder";
    }

    function modelVariantSourceId(variant = state.modelVariant) {
        if (variant === "multipose") return "tensorflow_js_movenet_multipose_lightning_local";
        return variant === "lightning"
            ? "tensorflow_js_movenet_singlepose_lightning_local"
            : "tensorflow_js_movenet_singlepose_thunder_local";
    }

    function preferredModelVariants() {
        return isMultiPoseMode() ? ["multipose", "thunder", "lightning"] : ["thunder", "lightning"];
    }

    function samplePoses() {
        if (!state.sample) return [];
        if (Array.isArray(state.sample.poses) && state.sample.poses.length) return state.sample.poses;
        return [{
            id: "person_1",
            personId: 1,
            label: "P1",
            score: Number(state.sample.score ?? 1),
            bbox: state.sample.bbox,
            keypoints: (state.sample.keypoints || []).map((point) => ({
                ...point,
                id: Number(point.id),
                localId: Number(point.localId ?? point.id),
                personId: Number(point.personId ?? 1),
            })),
        }];
    }

    function allKeypoints() {
        return samplePoses().flatMap((pose) => pose.keypoints || []);
    }

    function localPointId(point) {
        return Number(point?.localId ?? point?.id);
    }

    function keypointById(id) {
        const targetId = Number(id);
        return allKeypoints().find((point) => Number(point.id) === targetId);
    }

    function poseByPersonId(personId) {
        return samplePoses().find((pose) => Number(pose.personId) === Number(personId));
    }

    function activeTemplate() {
        return state.skeletonData?.templates?.[state.templateKey] || state.skeletonData?.templates?.coco17;
    }

    function connectedPairs(pointId) {
        const template = activeTemplate();
        if (!template) return [];
        const point = keypointById(pointId);
        const localId = localPointId(point);
        return template.pairs.filter((pair) => pair[0] === localId || pair[1] === localId);
    }

    function pointPasses(point) {
        return Boolean(point?.visible) && Number(point.score) >= state.threshold;
    }

    function imageReady() {
        return Boolean(el.image?.complete && el.image.naturalWidth && el.image.naturalHeight);
    }

    function imageRenderedSize() {
        const box = el.image.getBoundingClientRect();
        return {
            width: Math.max(1, Number(el.image.width) || box.width || el.image.naturalWidth || 1),
            height: Math.max(1, Number(el.image.height) || box.height || el.image.naturalHeight || 1),
            naturalWidth: Math.max(1, el.image.naturalWidth || Number(el.image.width) || box.width || 1),
            naturalHeight: Math.max(1, el.image.naturalHeight || Number(el.image.height) || box.height || 1),
        };
    }

    function setStageAspect(width, height) {
        const safeWidth = Math.max(1, Number(width) || 1);
        const safeHeight = Math.max(1, Number(height) || 1);
        el.imageFrame.style.setProperty("--pose-aspect", `${safeWidth} / ${safeHeight}`);
        el.imageFrame.style.setProperty("--pose-aspect-ratio", String(safeWidth / safeHeight));
    }

    function setOverlaySpace(width, height) {
        const safeWidth = Math.max(1, Number(width) || 1);
        const safeHeight = Math.max(1, Number(height) || 1);
        el.overlay.setAttribute("viewBox", `0 0 ${safeWidth} ${safeHeight}`);
        el.overlay.setAttribute("preserveAspectRatio", "none");
    }

    function clearOverlay() {
        el.bboxLayer.innerHTML = "";
        el.skeletonLayer.innerHTML = "";
        el.keypointLayer.innerHTML = "";
        el.labelLayer.innerHTML = "";
        el.overlay.hidden = true;
        el.visibleCount.textContent = "0 / 17 keypoints";
    }

    function workerModelUrls() {
        return Object.fromEntries(
            Object.entries(state.modelUrls)
                .filter(([, value]) => Boolean(value))
                .map(([key, value]) => [key, cvUrl(value)])
        );
    }

    function ensurePoseWorker() {
        if (state.worker) return state.worker;
        if (!poseRuntimeAvailable()) {
            throw new Error("Pose inference Worker is not available");
        }
        state.worker = new Worker(cvUrl(state.poseWorkerUrl));
        state.worker.onmessage = handleWorkerMessage;
        state.worker.onerror = (event) => {
            const error = new Error(event.message || "Pose inference Worker failed");
            handleInferenceFailure(error, state.activeWorkerRequestId);
        };
        return state.worker;
    }

    function captureInferenceImage() {
        const imageSpace = imageRenderedSize();
        const width = Math.max(1, Math.round(imageSpace.width));
        const height = Math.max(1, Math.round(imageSpace.height));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D context is not available for pose inference");
        context.drawImage(el.image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        return {
            imageSpace: {
                ...imageSpace,
                width,
                height,
            },
            image: {
                width,
                height,
                pixels: imageData.data.buffer,
            },
            transfer: [imageData.data.buffer],
        };
    }

    function completeWorkerInference() {
        state.modelLoading = false;
        state.autoRunning = false;
        state.pendingInference = null;
        updateModelControls();
    }

    function handleWorkerMessage(event) {
        const payload = event.data || {};
        if (!payload.id || payload.id !== state.activeWorkerRequestId) return;

        if (payload.type === "status") {
            if (payload.stage === "model") state.modelLoading = true;
            if (payload.stage === "inference") state.modelLoading = false;
            el.statusChip.textContent = payload.detail || "Pose Worker Running";
            setModelMessage("Pose Worker", "姿态模型正在后台 Worker 中运行；页面控件仍可继续操作。");
            updateModelControls();
            return;
        }

        if (payload.type === "result") {
            try {
                applyWorkerResult(payload);
            } catch (error) {
                handleInferenceFailure(error, payload.id);
            }
            return;
        }

        if (payload.type === "error") {
            handleInferenceFailure(new Error(payload.message || "Worker inference failed"), payload.id);
        }
    }

    function queueAutoInference(reason = "auto", waitCount = 0) {
        window.clearTimeout(state.autoInferenceTimer);
        if (!isRealInferenceMode()) return;
        if (state.modelLoading || state.autoRunning) return;
        state.autoInferenceTimer = window.setTimeout(() => {
            if (!isRealInferenceMode()) return;
            if (!imageReady()) {
                if (waitCount < 18) queueAutoInference(reason, waitCount + 1);
                return;
            }
            runRealInference({ auto: true, reason });
        }, 140);
    }

    function populateControls() {
        el.sampleSelect.innerHTML = state.samplesData.samples
            .map((sample) => `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.label)}</option>`)
            .join("");
        el.sampleSelect.value = state.samplesData.defaultSample || state.samplesData.samples[0]?.id || "";

        el.templateSelect.innerHTML = Object.entries(state.skeletonData.templates)
            .map(([key, value]) => `<option value="${escapeHtml(key)}">${escapeHtml(value.label)}</option>`)
            .join("");
        state.templateKey = state.skeletonData.defaultTemplate || "coco17";
        el.templateSelect.value = state.templateKey;
    }

    function setPhase(phase) {
        state.phase = phase;
        for (let index = 1; index <= 5; index += 1) {
            el.imageFrame?.classList.toggle(`pose-stage--phase-${index}`, index === phase);
        }
        el.stepperItems.forEach((item, index) => item.classList.toggle("is-active", index === phase - 1));
        const note = phaseNotes[Math.max(0, phase - 1)] || phaseNotes[0];
        if (el.stageNoteTitle) el.stageNoteTitle.textContent = note[0];
        if (el.stageNote) el.stageNote.textContent = note[1];
        el.vectorCard?.classList.toggle("is-active", phase === 5);
    }

    function updateModelControls() {
        const realMode = isRealInferenceMode();
        const available = poseRuntimeAvailable();
        const busy = state.modelLoading || state.autoRunning;
        const multiMode = isMultiPoseMode();
        if (el.maxPeople) {
            el.maxPeople.disabled = !multiMode;
            el.maxPeople.title = multiMode ? "控制 MultiPose 最多返回的人体数量" : "单人高精度模式固定返回 1 个人";
        }
        if (el.runModel) {
            el.runModel.disabled = !realMode || !available || busy;
            el.runModel.textContent = busy ? "真实推理中..." : "重新运行真实推理";
            el.runModel.title = realMode
                ? (available ? "在后台 Worker 中运行本地 MoveNet 模型，推理期间页面仍可操作" : "浏览器 Worker 不可用，当前只能使用预设 fallback")
                : "切换到真实推理模式后可运行模型";
        }
        if (el.uploadNote) {
            el.uploadNote.textContent = realMode
                ? (multiMode
                    ? `本地 MoveNet MultiPose 模式：上传或切换示例后会自动推理，最多返回 ${state.multiPoseMaxPeople} 个人。`
                    : "本地 MoveNet Thunder 单人模式：上传或切换示例后会自动推理；Thunder 失败时自动尝试 Lightning fallback。")
                : "预设数据仅用于模型不可用时的 fallback 机制拆解。";
        }
        if (!realMode) {
            setPageStatus("预设 fallback · 机制拆解");
            if (el.versionNote) {
                el.versionNote.textContent = "当前显示预设关键点；切换回真实推理模式后会自动运行本地 MoveNet。";
            }
        } else if (available) {
            let statusText = `真实推理准备中 · ${modelVariantStatus()}`;
            if (busy) {
                statusText = `真实推理加载中 · ${modelVariantStatus()}`;
            }
            if (state.modelError) {
                statusText = "模型失败 · 预设 fallback";
            } else if (state.modelReady && state.lastRealInference) {
                statusText = `真实推理 · ${modelVariantStatus()}`;
            }
            setPageStatus(statusText);
            if (el.versionNote) {
                el.versionNote.textContent = state.modelError
                    ? "本地模型或运行时不可用时，页面会保留预设 fallback；可刷新或稍后重试。"
                    : state.modelReady && state.lastRealInference
                        ? `当前关键点由本地静态路由加载的 TensorFlow.js ${modelVariantName()} 在浏览器端真实推理得到；运行后端：${(state.backendName || "web").toUpperCase()}。`
                        : (multiMode
                            ? "页面优先通过本地静态模型路由加载 MoveNet MultiPose，在浏览器端执行最多 6 人的 17 关键点姿态估计。"
                            : "页面优先通过本地静态模型路由加载 MoveNet Thunder，在浏览器端执行单人 17 关键点姿态估计；失败时自动尝试 Lightning fallback。");
            }
        } else {
            if (el.version) el.version.textContent = "Worker 不可用 · 预设 fallback";
            if (el.versionNote) el.versionNote.textContent = "浏览器无法创建姿态推理 Worker 时，页面会继续保留预设 fallback 机制拆解。";
        }
    }

    function setUploadName(fileName) {
        if (!el.uploadName) return;
        el.uploadName.textContent = fileName || "未选择图片";
        el.uploadName.title = fileName || "未选择图片";
    }

    function renderSample(sampleId) {
        invalidateActiveInference();
        const sample = state.samplesData.samples.find((item) => item.id === sampleId) || state.samplesData.samples[0];
        if (!sample) return;

        state.sample = sample;
        state.selectedId = 0;
        state.modelError = false;
        state.lastRealInference = null;
        if (state.customObjectUrl) {
            URL.revokeObjectURL(state.customObjectUrl);
            state.customObjectUrl = "";
            state.customFileName = "";
        }
        if (el.upload) el.upload.value = "";
        setUploadName("");

        el.overlay.hidden = false;
        el.imageFrame.classList.remove("is-loaded", "is-custom-preview");
        setStageAspect(sample.imageWidth, sample.imageHeight);
        setOverlaySpace(sample.imageWidth, sample.imageHeight);
        el.image.src = cvUrl(sample.image);
        el.image.alt = `${sample.label} · 本地 MoveNet 输入图`;
        el.sampleLabel.textContent = isRealInferenceMode()
            ? `${sample.label} · 等待本地 ${isMultiPoseMode() ? "MoveNet MultiPose" : "MoveNet Thunder"} 自动推理`
            : sample.label;
        el.statusChip.textContent = isRealInferenceMode()
            ? (isMultiPoseMode() ? "Fallback Ready · Auto MultiPose" : "Fallback Ready · Auto Thunder")
            : "Preset COCO-17";

        renderOverlay();
        setPhase(5);
        updateModelControls();
        if (isRealInferenceMode()) queueAutoInference("sample");
    }

    function renderOverlay() {
        if (!state.sample) return;
        const poses = samplePoses();
        const keypoints = allKeypoints();
        const template = activeTemplate();
        const pairs = template?.pairs || [];

        el.overlay.hidden = false;
        el.bboxLayer.innerHTML = poses.map((pose, index) => {
            const bbox = pose.bbox || computeBBox(pose.keypoints || [], state.sample.imageWidth || 1, state.sample.imageHeight || 1);
            return `
                <g class="pose-person-group" data-person-id="${pose.personId}" style="--person-color:${personColor(index)};--person-fill:${personFill(index)}">
                    <rect class="pose-bbox" x="${bbox[0]}" y="${bbox[1]}" width="${bbox[2]}" height="${bbox[3]}" rx="10" />
                    <text class="pose-person-tag" x="${bbox[0] + 8}" y="${Math.max(18, bbox[1] + 18)}">${escapeHtml(pose.label || `P${pose.personId}`)} · ${Number(pose.score || 0).toFixed(2)}</text>
                </g>
            `;
        }).join("");

        el.skeletonLayer.innerHTML = poses.flatMap((pose, poseIndex) => pairs.map((pair, index) => {
            const from = (pose.keypoints || []).find((point) => localPointId(point) === pair[0]);
            const to = (pose.keypoints || []).find((point) => localPointId(point) === pair[1]);
            if (!from || !to) return "";
            const length = Math.hypot(to.x - from.x, to.y - from.y).toFixed(2);
            return `
                <line
                    class="pose-skeleton-line"
                    data-person-id="${pose.personId}"
                    data-from="${from.id}"
                    data-to="${to.id}"
                    x1="${from.x}"
                    y1="${from.y}"
                    x2="${to.x}"
                    y2="${to.y}"
                    style="--line-length:${length};--person-color:${personColor(poseIndex)};transition-delay:${(poseIndex * pairs.length + index) * 24}ms"
                ></line>
            `;
        })).join("");

        const order = state.samplesData.animationOrder || keypoints.map((point) => point.id);
        const orderMap = new Map(order.map((id, index) => [id, index]));
        el.keypointLayer.innerHTML = keypoints.map((point, index) => {
            const poseIndex = Math.max(0, Number(point.personId || 1) - 1);
            const delay = ((point.personId || 1) - 1) * 90 + (orderMap.get(localPointId(point)) ?? index) * 24;
            return `
                <g
                    class="pose-keypoint"
                    data-keypoint-id="${point.id}"
                    data-person-id="${point.personId || 1}"
                    tabindex="0"
                    role="button"
                    aria-label="${escapeHtml(`P${point.personId || 1} ${localPointId(point)} ${point.name}`)}"
                    style="--person-color:${personColor(poseIndex)};transition-delay:${delay}ms"
                    transform="translate(${point.x} ${point.y})"
                >
                    <g class="pose-keypoint-marker">
                        <circle class="pose-keypoint-halo" r="5.8"></circle>
                        <circle class="pose-keypoint-core" r="2.8"></circle>
                    </g>
                </g>
            `;
        }).join("");

        el.labelLayer.innerHTML = keypoints.map((point) => `
            <g class="pose-point-label" data-label-id="${point.id}" data-person-id="${point.personId || 1}">
                <text x="${point.x + 8}" y="${point.y - 8}">P${point.personId || 1}:${localPointId(point)}</text>
            </g>
            <g class="pose-point-coord" data-coord-id="${point.id}" data-person-id="${point.personId || 1}">
                <text x="${point.x + 8}" y="${point.y + 18}">(${Math.round(point.x)}, ${Math.round(point.y)})</text>
            </g>
        `).join("");

        bindKeypoints();
        updateVisibility();
        updateReadout(state.selectedId);
        updateVector();
        updateTemplateSummary();
    }

    function bindKeypoints() {
        el.keypointLayer.querySelectorAll("[data-keypoint-id]").forEach((node) => {
            const id = Number(node.dataset.keypointId);
            node.addEventListener("click", () => updateReadout(id));
            node.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    updateReadout(id);
                }
            });
        });
    }

    function updateVisibility() {
        if (!state.sample) return;
        state.threshold = Number(el.threshold.value);
        el.thresholdOutput.textContent = state.threshold.toFixed(2);

        const toggles = Object.fromEntries(
            Array.from(root.querySelectorAll("[data-pose-toggle]"))
                .map((input) => [input.dataset.poseToggle, input.checked])
        );
        lab?.classList.toggle("hide-keypoints", !toggles.keypoints);
        lab?.classList.toggle("hide-skeleton", !toggles.skeleton);
        lab?.classList.toggle("show-labels", Boolean(toggles.labels));
        lab?.classList.toggle("show-coords", Boolean(toggles.coords));

        let visibleCount = 0;
        el.keypointLayer.querySelectorAll("[data-keypoint-id]").forEach((node) => {
            const point = keypointById(node.dataset.keypointId);
            const visible = pointPasses(point);
            if (visible) visibleCount += 1;
            node.classList.toggle("is-muted", !visible);
            node.classList.toggle("is-selected", Number(point?.id) === state.selectedId);
            node.setAttribute("aria-pressed", Number(point?.id) === state.selectedId ? "true" : "false");
        });

        el.skeletonLayer.querySelectorAll(".pose-skeleton-line").forEach((line) => {
            const from = keypointById(line.dataset.from);
            const to = keypointById(line.dataset.to);
            line.classList.toggle("is-muted", !pointPasses(from) || !pointPasses(to));
        });

        const poses = samplePoses();
        const totalKeypoints = allKeypoints().length || 17;
        el.visibleCount.textContent = poses.length > 1
            ? `${visibleCount} / ${totalKeypoints} keypoints · ${poses.length} persons`
            : `${visibleCount} / ${totalKeypoints} keypoints`;
    }

    function updateReadout(id) {
        const point = keypointById(id);
        if (!point) return;
        state.selectedId = point.id;
        const pose = poseByPersonId(point.personId || 1);
        const localId = localPointId(point);

        const pairs = connectedPairs(point.id);
        const limbNames = pairs.map((pair) => {
            const otherId = pair[0] === localId ? pair[1] : pair[0];
            const other = (pose?.keypoints || []).find((item) => localPointId(item) === otherId);
            return other ? `${point.name} - ${other.name}` : pair.join("-");
        });

        el.kpTitle.textContent = `P${point.personId || 1} · ${point.name} · id ${localId}`;
        el.kpId.textContent = `P${point.personId || 1}-${localId}`;
        el.kpName.textContent = point.name;
        el.kpX.textContent = String(Math.round(point.x));
        el.kpY.textContent = String(Math.round(point.y));
        el.kpScore.textContent = Number(point.score).toFixed(2);
        el.kpVisible.textContent = point.visible ? "true" : "false";
        el.kpLimbs.textContent = limbNames.length ? limbNames.join(" / ") : "无";
        el.kpVectorIndex.textContent = `P${point.personId || 1}: ${localId * 3} - ${localId * 3 + 2}`;

        updateVisibility();
        updateVector();
    }

    function updateVector() {
        if (!state.sample) return;
        const poses = samplePoses();
        const selectedPoint = keypointById(state.selectedId);
        const activePose = poseByPersonId(selectedPoint?.personId) || poses[0];
        const activeKeypoints = activePose?.keypoints || [];
        const personCount = poses.length;
        const totalValues = poses.reduce((sum, pose) => sum + ((pose.keypoints || []).length * 3), 0);
        const activeLabel = activePose?.label || `P${activePose?.personId || 1}`;
        const shapeText = personCount > 1
            ? `${personCount} × ${activeKeypoints.length || 17} × 3`
            : `${activeKeypoints.length || allKeypoints().length || 17} × 3`;
        const tokenHtml = (points) => points.map((point) => `
            <span class="human-vector-token" title="${escapeHtml(point.name)}">
                <em>${localPointId(point)}</em>
                ${Math.round(point.x)}, ${Math.round(point.y)}, ${Number(point.score).toFixed(2)}
            </span>
        `).join("");

        if (el.vectorShape) el.vectorShape.textContent = shapeText;
        if (el.vectorStats) {
            el.vectorStats.innerHTML = `
                <span>${personCount} ${personCount > 1 ? "persons" : "person"}</span>
                <span>${totalValues} values</span>
                <span>x, y, score</span>
                <span>当前显示 ${escapeHtml(activeLabel)}</span>
            `;
        }
        el.vector.innerHTML = `
            <div class="human-vector-person-row">
                <strong>${escapeHtml(activeLabel)} · ${activeKeypoints.length || 17} keypoints</strong>
                <div class="human-vector-tokens">${tokenHtml(activeKeypoints)}</div>
            </div>
            <details class="human-vector-details">
                <summary>查看全部 ${personCount} 个人的完整向量</summary>
                <div class="human-vector-table">
                    ${poses.map((pose) => `
                        <div class="human-vector-person-row">
                            <strong>${escapeHtml(pose.label || `P${pose.personId}`)}</strong>
                            <div class="human-vector-tokens">${tokenHtml(pose.keypoints || [])}</div>
                        </div>
                    `).join("")}
                </div>
            </details>
        `;
        el.outputSchema.textContent = poses.length > 1
            ? `${poses.length} persons × 17 × {x, y, score}`
            : `${allKeypoints().length} × {x, y, score}`;
    }

    function updateTemplateSummary() {
        const template = activeTemplate();
        if (!template || !el.limbReadout) return;
        const poses = samplePoses();
        el.templateLabel.textContent = template.label;
        el.limbReadout.querySelector("strong").textContent = template.label;
        el.limbReadout.querySelector("p").textContent = poses.length > 1
            ? `当前检测到 ${poses.length} 个人；每个人使用 ${template.label} 的 17 个关键点与 ${template.pairs.length} 条 limb 连接。${template.description}`
            : `当前模板包含 ${allKeypoints().length || 17} 个关键点与 ${template.pairs.length} 条 limb 连接。${template.description}`;
    }

    function playAnimation() {
        window.clearInterval(state.timer);
        el.play.disabled = true;
        el.play.textContent = "播放中...";
        setPhase(1);
        state.timer = window.setInterval(() => {
            const next = state.phase + 1;
            if (next > 5) {
                window.clearInterval(state.timer);
                el.play.disabled = false;
                el.play.textContent = "动画播放";
                return;
            }
            setPhase(next);
        }, 780);
    }

    function resetStage() {
        window.clearInterval(state.timer);
        el.play.disabled = false;
        el.play.textContent = "动画播放";
        renderSample(el.sampleSelect.value);
    }

    function clearReadout(message) {
        el.kpTitle.textContent = message;
        [el.kpId, el.kpName, el.kpX, el.kpY, el.kpScore, el.kpVisible, el.kpLimbs, el.kpVectorIndex]
            .forEach((node) => { node.textContent = "--"; });
    }

    function handleUpload(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        invalidateActiveInference();
        if (state.customObjectUrl) URL.revokeObjectURL(state.customObjectUrl);
        state.customObjectUrl = URL.createObjectURL(file);
        state.customFileName = file.name;
        setUploadName(file.name);
        state.sample = null;
        state.modelError = false;
        state.lastRealInference = null;
        el.imageFrame.classList.remove("is-loaded");
        el.imageFrame.classList.add("is-custom-preview");
        clearOverlay();
        el.image.src = state.customObjectUrl;
        el.image.alt = `${file.name} · 自定义姿态推理输入`;
        el.statusChip.textContent = isRealInferenceMode()
            ? (isMultiPoseMode() ? "Custom Image · Auto MultiPose" : "Custom Image · Auto Thunder")
            : "Custom Preview · No Inference";
        el.sampleLabel.textContent = `自定义图片 · ${file.name}`;
        el.visibleCount.textContent = "0 / 17 keypoints";
        if (el.vectorShape) el.vectorShape.textContent = isMultiPoseMode() ? "≤6 × 17 × 3" : "1 × 17 × 3";
        if (el.vectorStats) {
            el.vectorStats.innerHTML = `
                <span>pending</span>
                <span>等待 Worker 推理</span>
                <span>x, y, score</span>
            `;
        }
        el.vector.textContent = isRealInferenceMode()
            ? (isMultiPoseMode()
                ? `图片载入后将自动运行本地 MoveNet MultiPose，最多生成 ${state.multiPoseMaxPeople} 个人的关键点。`
                : "图片载入后将自动运行本地 MoveNet Thunder，生成 17 个关键点。")
            : "上传图片未执行真实姿态推理；切换到 MoveNet 后可以在浏览器端运行模型。";
        clearReadout("未生成关键点");
        setModelMessage("Custom Image", isRealInferenceMode()
            ? (isMultiPoseMode()
                ? `当前图片将进入本地 MoveNet MultiPose 自动推理，最多检测 ${state.multiPoseMaxPeople} 个人。`
                : "当前图片将进入本地 MoveNet Thunder 自动推理；若 Thunder 失败，将尝试 Lightning fallback。")
            : "当前仅做图片预览，未运行姿态模型。");
        updateModelControls();
        if (isRealInferenceMode()) queueAutoInference("upload");
    }

    function computeBBox(keypoints, width, height) {
        const confident = keypoints.filter((point) => Number(point.score) >= 0.12);
        const points = confident.length ? confident : keypoints;
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const minX = Math.max(0, Math.min(...xs) - width * 0.06);
        const minY = Math.max(0, Math.min(...ys) - height * 0.08);
        const maxX = Math.min(width, Math.max(...xs) + width * 0.06);
        const maxY = Math.min(height, Math.max(...ys) + height * 0.08);
        return [
            Math.round(minX),
            Math.round(minY),
            Math.max(1, Math.round(maxX - minX)),
            Math.max(1, Math.round(maxY - minY)),
        ];
    }

    function bboxFromPoseBox(box, keypoints, width, height) {
        if (!box) return computeBBox(keypoints, width, height);
        const x = Number(box.xMin ?? box.x ?? 0);
        const y = Number(box.yMin ?? box.y ?? 0);
        const xMax = Number(box.xMax);
        const yMax = Number(box.yMax);
        const boxWidth = Number(box.width ?? (Number.isFinite(xMax) ? xMax - x : 0));
        const boxHeight = Number(box.height ?? (Number.isFinite(yMax) ? yMax - y : 0));
        if (!Number.isFinite(x) || !Number.isFinite(y) || boxWidth <= 0 || boxHeight <= 0) {
            return computeBBox(keypoints, width, height);
        }
        return [
            Math.round(Math.max(0, Math.min(width, x))),
            Math.round(Math.max(0, Math.min(height, y))),
            Math.round(Math.max(1, Math.min(width, x + boxWidth) - Math.max(0, x))),
            Math.round(Math.max(1, Math.min(height, y + boxHeight) - Math.max(0, y))),
        ];
    }

    function normalizePose(pose, poseIndex, width, height) {
        const personId = poseIndex + 1;
        const keypoints = keypointNames.map((name, index) => {
            const point = pose.keypoints[index] || {};
            return {
                id: poseIndex * 100 + index,
                localId: index,
                personId,
                name,
                x: Math.max(0, Math.min(width, Number(point.x) || 0)),
                y: Math.max(0, Math.min(height, Number(point.y) || 0)),
                score: Number(point.score || 0),
                visible: Number(point.score || 0) > 0.01,
            };
        });
        const averageScore = keypoints.reduce((sum, point) => sum + Number(point.score || 0), 0) / keypoints.length;
        return {
            id: `person_${personId}`,
            personId,
            label: `P${personId}`,
            score: Number(pose.score ?? averageScore),
            bbox: bboxFromPoseBox(pose.box, keypoints, width, height),
            keypoints,
        };
    }

    function applyWorkerResult(payload) {
        const context = state.pendingInference;
        if (!context || payload.id !== state.activeWorkerRequestId) return;

        state.modelVariant = payload.variant || state.modelVariant;
        state.backendName = payload.backendName || "worker";
        state.modelReady = true;
        state.modelError = false;

        const rawPoses = (payload.poses || [])
            .filter((pose) => pose?.keypoints?.length)
            .filter((pose) => state.modelVariant !== "multipose" || Number(pose.score ?? 0) >= 0.3)
            .slice(0, state.modelVariant === "multipose" ? state.multiPoseMaxPeople : 1);
        if (!rawPoses.length) {
            throw new Error("MoveNet did not return a pose");
        }

        const imageSpace = context.imageSpace;
        const width = imageSpace.width;
        const height = imageSpace.height;
        const activeModelName = modelVariantName();
        const activeModelStatus = modelVariantStatus();
        const normalizedPoses = rawPoses.map((pose, index) => normalizePose(pose, index, width, height));
        const keypoints = normalizedPoses.flatMap((pose) => pose.keypoints);
        const bbox = normalizedPoses[0]?.bbox || computeBBox(keypoints, width, height);
        state.sample = {
            id: "movenet_real_inference",
            label: `真实推理 · ${activeModelStatus}${normalizedPoses.length > 1 ? ` · ${normalizedPoses.length} persons` : ""}${state.customFileName ? ` · ${state.customFileName}` : ""}`,
            description: `TensorFlow.js ${activeModelName} browser inference from a local static model route.`,
            image: el.image.src,
            imageWidth: width,
            imageHeight: height,
            sourceImageWidth: imageSpace.naturalWidth,
            sourceImageHeight: imageSpace.naturalHeight,
            coordinateSpace: "rendered_image_pixels",
            bbox,
            poses: normalizedPoses,
            status: "real_web_pose_model_local",
            annotationSource: modelVariantSourceId(),
            keypoints,
        };
        state.lastRealInference = state.sample;

        const visibleAtCurrentThreshold = keypoints
            .filter((point) => point.visible && Number(point.score) >= state.threshold)
            .length;
        let thresholdNote = "";
        if (visibleAtCurrentThreshold < 6 && state.threshold > 0.25 && el.threshold) {
            state.threshold = 0.25;
            el.threshold.value = "0.25";
            if (el.thresholdOutput) el.thresholdOutput.textContent = "0.25";
            thresholdNote = " 默认阈值下可见点偏少，已临时将阈值调到 0.25 以展示更多模型输出。";
        }

        state.selectedId = keypoints.find((point) => point.score >= state.threshold)?.id ?? keypoints[0]?.id ?? 0;
        setStageAspect(imageSpace.naturalWidth, imageSpace.naturalHeight);
        setOverlaySpace(width, height);
        el.overlay.hidden = false;
        el.sampleLabel.textContent = state.sample.label;
        el.statusChip.textContent = `Real Inference · ${activeModelName}`;
        setPageStatus(`真实推理 · ${activeModelStatus}`);
        if (el.versionNote) {
            el.versionNote.textContent = `当前关键点由后台 Worker 加载本地 TensorFlow.js ${activeModelName} 推理得到；运行后端：${(state.backendName || "worker").toUpperCase()}。`;
        }
        renderOverlay();
        setPhase(5);
        setModelMessage(`Real Inference · ${activeModelName}`, `当前 ${normalizedPoses.length} 个人的 bbox、COCO-17 关键点、骨架和 Pose Vector 来自后台 Worker 中的本地 ${activeModelName} 模型推理；后端：${(state.backendName || "worker").toUpperCase()}。${thresholdNote}`);
        completeWorkerInference();
    }

    function handleInferenceFailure(error, requestId) {
        if (requestId && requestId !== state.activeWorkerRequestId) return;
        console.info("MoveNet worker inference failed; using preset fallback.", error);
        state.modelError = true;
        if (!state.sample && state.customObjectUrl) {
            clearOverlay();
            clearReadout("未生成关键点");
            el.vector.textContent = "后台 MoveNet 未在当前上传图中返回人体姿态；请换一张包含清晰人体的图片。";
        }
        el.statusChip.textContent = "Worker Failed · Preset Fallback";
        setModelMessage("Worker 推理失败", "后台 Worker 或本地模型不可用时，页面会保留预设 fallback；可刷新后重试。");
        if (el.version) el.version.textContent = "Worker 失败 · 预设 fallback";
        completeWorkerInference();
    }

    async function runRealInference(options = {}) {
        if (!isRealInferenceMode()) return;
        if (state.autoRunning || state.modelLoading) return;

        const requestId = state.workerRequestId + 1;
        state.workerRequestId = requestId;
        state.activeWorkerRequestId = requestId;
        state.autoRunning = true;
        state.modelLoading = false;
        updateModelControls();

        try {
            if (!imageReady()) {
                setModelMessage("Image Loading", "图片还未加载完成，请稍后再运行真实推理。");
                completeWorkerInference();
                return;
            }
            if (!poseRuntimeAvailable()) {
                state.modelError = true;
                el.statusChip.textContent = "Worker Missing · Preset Fallback";
                setModelMessage("Worker 不可用", "浏览器无法创建后台推理 Worker，当前保留预设 fallback 机制拆解。");
                completeWorkerInference();
                return;
            }

            el.runModel.disabled = true;
            el.runModel.textContent = "后台推理中...";
            state.modelError = false;
            el.statusChip.textContent = options.auto
                ? (isMultiPoseMode() ? "Auto MultiPose Worker" : "Auto Thunder Worker")
                : (isMultiPoseMode() ? "MultiPose Worker" : "Thunder Worker");
            setModelMessage(isMultiPoseMode() ? "MoveNet MultiPose Worker" : "MoveNet Thunder Worker", isMultiPoseMode()
                ? `后台 Worker 正在运行本地 MoveNet MultiPose，多人姿态估计最多返回 ${state.multiPoseMaxPeople} 个人；页面控件仍可操作。`
                : "后台 Worker 正在运行本地 MoveNet Thunder 高精度姿态估计；页面控件仍可操作。");

            await nextFrame();
            const captured = captureInferenceImage();
            state.pendingInference = {
                id: requestId,
                imageSpace: captured.imageSpace,
            };
            ensurePoseWorker().postMessage({
                type: "infer",
                id: requestId,
                image: captured.image,
                variants: preferredModelVariants(),
                modelUrls: workerModelUrls(),
                maxPeople: state.multiPoseMaxPeople,
            }, captured.transfer);
        } catch (error) {
            handleInferenceFailure(error, requestId);
        }
    }

    function bindEvents() {
        el.threshold.addEventListener("input", updateVisibility);
        root.querySelectorAll("[data-pose-toggle]").forEach((input) => {
            input.addEventListener("change", updateVisibility);
        });
        el.inferenceMode.addEventListener("change", () => {
            invalidateActiveInference();
            state.inferenceMode = ["movenet_multi", "movenet"].includes(el.inferenceMode.value)
                ? el.inferenceMode.value
                : "movenet_multi";
            if (el.inferenceMode.value !== state.inferenceMode) {
                el.inferenceMode.value = state.inferenceMode;
            }
            state.modelVariant = isMultiPoseMode() ? "multipose" : "thunder";
            state.modelError = false;
            el.statusChip.textContent = poseRuntimeAvailable()
                ? (isMultiPoseMode() ? "Local MoveNet MultiPose Ready" : "Local MoveNet Thunder Ready")
                : "MoveNet Runtime Missing";
            setModelMessage("MoveNet Worker", poseRuntimeAvailable()
                ? (isMultiPoseMode()
                    ? `当前图片将自动进入后台 Worker 的本地 MoveNet MultiPose 多人推理，最多检测 ${state.multiPoseMaxPeople} 个人。`
                    : "当前图片将自动进入后台 Worker 的本地 MoveNet SinglePose Thunder 高精度推理；失败时尝试 Lightning fallback。")
                : "浏览器 Worker 不可用，当前仍可自动降级到预设 fallback。");
            updateModelControls();
            queueAutoInference("mode");
        });
        el.maxPeople?.addEventListener("change", () => {
            invalidateActiveInference();
            state.multiPoseMaxPeople = Math.max(1, Math.min(6, Number(el.maxPeople.value) || 6));
            updateModelControls();
            if (isMultiPoseMode()) queueAutoInference("max-people");
        });
        el.sampleSelect.addEventListener("change", () => renderSample(el.sampleSelect.value));
        el.templateSelect.addEventListener("change", () => {
            state.templateKey = el.templateSelect.value;
            renderOverlay();
        });
        el.play.addEventListener("click", playAnimation);
        el.runModel.addEventListener("click", () => runRealInference({ auto: false, reason: "manual" }));
        el.reset.addEventListener("click", resetStage);
        el.upload.addEventListener("change", handleUpload);
        el.image.addEventListener("load", () => {
            if (el.image.naturalWidth && el.image.naturalHeight && el.overlay.hidden) {
                setStageAspect(el.image.naturalWidth, el.image.naturalHeight);
            }
            el.imageFrame.classList.add("is-loaded");
            updateModelControls();
            queueAutoInference("image-load");
        });
    }

    async function init() {
        try {
            const [samplesResponse, skeletonsResponse] = await Promise.all([
                fetch(root.dataset.poseSamplesUrl, { cache: "no-store" }),
                fetch(root.dataset.poseSkeletonsUrl, { cache: "no-store" }),
            ]);
            if (!samplesResponse.ok || !skeletonsResponse.ok) {
                throw new Error("pose preset data failed to load");
            }
            state.samplesData = await samplesResponse.json();
            state.skeletonData = await skeletonsResponse.json();
            populateControls();
            bindEvents();
            renderSample(el.sampleSelect.value);
            updateModelControls();
        } catch (error) {
            console.error(error);
            el.loading.textContent = "姿态预设数据加载失败，请刷新页面重试。";
        }
    }

    init();
}());
