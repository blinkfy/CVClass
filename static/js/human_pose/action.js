(function () {
    const root = document.querySelector("[data-human-action]");
    if (!root) return;

    const basePath = window.CVCLASS_BASE_PATH || "";

    const el = {
        sampleSelect: root.querySelector("[data-action-sample]"),
        videoUpload: root.querySelector("[data-action-video-upload]"),
        videoName: root.querySelector("[data-action-video-name]"),
        videoNote: root.querySelector("[data-action-video-note]"),
        frameSlider: root.querySelector("[data-action-frames]"),
        frameOutput: root.querySelector("[data-action-frames-output]"),
        speed: root.querySelector("[data-action-speed]"),
        toggles: Array.from(root.querySelectorAll("[data-action-toggle]")),
        topk: root.querySelector("[data-action-topk]"),
        runVideo: root.querySelector("[data-action-run-video]"),
        play: root.querySelector("[data-action-play]"),
        reset: root.querySelector("[data-action-reset]"),
        videoSource: root.querySelector("[data-action-video-source]"),
        videoPreview: root.querySelector("[data-action-video-preview]"),
        videoBadge: root.querySelector("[data-action-video-badge]"),
        videoCaption: root.querySelector("[data-action-video-caption]"),
        flowNodes: Array.from(root.querySelectorAll("[data-action-flow-node]")),
        flowSkeleton: root.querySelector("[data-action-flow-skeleton]"),
        flowPose: root.querySelector("[data-action-flow-pose]"),
        flowProb: root.querySelector("[data-action-flow-prob]"),
        flowClass: root.querySelector("[data-action-flow-class]"),
        version: root.querySelector("[data-action-version]"),
        stageTitle: root.querySelector("[data-action-stage-title]"),
        statusChip: root.querySelector("[data-action-status-chip]"),
        sampleLabel: root.querySelector("[data-action-sample-label]"),
        tensorChip: root.querySelector("[data-action-tensor-chip]"),
        windowChip: root.querySelector("[data-action-window-chip]"),
        clip: root.querySelector("[data-action-clip]"),
        frameStrip: root.querySelector("[data-action-frames-strip]"),
        convWindow: root.querySelector("[data-action-conv-window]"),
        inputShape: root.querySelector("[data-action-input-shape]"),
        convKernel: root.querySelector("[data-action-conv-kernel]"),
        featureGrid: root.querySelector("[data-action-feature-grid]"),
        featureNote: root.querySelector("[data-action-feature-note]"),
        pipeline: root.querySelector("[data-action-pipeline]"),
        probabilities: root.querySelector("[data-action-probabilities]"),
        noteShape: root.querySelector("[data-action-note-shape]"),
        noteClass: root.querySelector("[data-action-note-class]"),
        noteTopk: root.querySelector("[data-action-note-topk]"),
        noteStep: root.querySelector("[data-action-note-step]"),
        noteDescription: root.querySelector("[data-action-note-description]"),
        noteC3d: root.querySelector("[data-action-note-c3d]"),
        stepper: document.querySelector("[data-action-stepper]"),
    };

    const state = {
        data: null,
        sample: null,
        frameCount: 8,
        activeFrame: 0,
        activeStep: 0,
        topK: 5,
        showRgb: true,
        showSkeleton: true,
        showWindow: true,
        timer: 0,
        playTick: 0,
        actionModel: null,
        actionPrediction: null,
        actionFeatures: [],
        modelError: false,
        videoFile: null,
        videoObjectUrl: "",
        videoFrames: [],
        videoPoseSequence: null,
        videoMode: "preset",
        videoBusy: false,
        videoStatus: "",
        videoRunId: 0,
        autoAnalyzeTimer: 0,
        poseWorker: null,
        poseWorkerRequestId: 0,
        poseWorkerRequests: new Map(),
    };

    const skeletonPairs = [
        ["head", "neck"],
        ["neck", "leftShoulder"],
        ["neck", "rightShoulder"],
        ["leftShoulder", "leftElbow"],
        ["leftElbow", "leftWrist"],
        ["rightShoulder", "rightElbow"],
        ["rightElbow", "rightWrist"],
        ["neck", "hip"],
        ["hip", "leftKnee"],
        ["leftKnee", "leftAnkle"],
        ["hip", "rightKnee"],
        ["rightKnee", "rightAnkle"],
    ];

    const pointNames = [
        "head",
        "neck",
        "leftShoulder",
        "rightShoulder",
        "leftElbow",
        "rightElbow",
        "leftWrist",
        "rightWrist",
        "hip",
        "leftKnee",
        "rightKnee",
        "leftAnkle",
        "rightAnkle",
    ];

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function fetchJson(url) {
        return fetch(url, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
            return response.json();
        });
    }

    function cvUrl(path) {
        if (!path || /^(https?:|data:|blob:)/i.test(path)) return path;
        // 避免双重前缀：若路径已含 basePath 则直接返回（来自 url_for 的路径已包含 basePath）
        if (basePath && path.startsWith(basePath + "/")) return path;
        return `${basePath}${path}`;
    }

    function nextFrame() {
        return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }

    function visibleFrames() {
        return Math.max(4, Math.min(Number(state.frameCount) || 8, state.data?.inputShape?.maxT || 16));
    }

    function pipelineSteps() {
        return state.data?.pipeline || [];
    }

    function activePipelineStep() {
        return pipelineSteps()[state.activeStep] || pipelineSteps()[0] || {};
    }

    function currentClipLabel() {
        if (state.videoMode === "uploaded") return `上传视频 · ${state.videoFile?.name || "本地视频"}`;
        if (state.videoMode === "preset_video") return `预置视频 · ${state.sample?.label || "--"}`;
        return state.sample?.label || "--";
    }

    function defaultVideoNote() {
        return "上传后抽取 T 帧，优先在后台 Worker 中用本地 MoveNet Lightning 识别单人关键点与骨架，再送入动作分类器。";
    }

    function setVideoStatus(text) {
        state.videoStatus = text || "";
        if (el.videoNote) el.videoNote.textContent = text || defaultVideoNote();
    }

    function setVideoBusy(isBusy) {
        state.videoBusy = Boolean(isBusy);
        root.classList.toggle("is-video-busy", state.videoBusy);
        if (el.runVideo) {
            el.runVideo.disabled = state.videoBusy;
            el.runVideo.textContent = state.videoBusy ? "识别中..." : "识别关键点与骨架";
        }
        if (el.videoUpload) el.videoUpload.disabled = state.videoBusy;
    }

    function generatePose(frameIndex, total) {
        const motion = state.sample?.motion || {};
        const progress = total <= 1 ? 0 : frameIndex / (total - 1);
        const wave = Math.sin(progress * Math.PI * 2);
        const doubleWave = Math.sin(progress * Math.PI * 4);
        const type = motion.type || "waving";
        let baseX = 0.5;
        let baseY = 0.48;
        if (type === "running") {
            baseX += (progress - 0.5) * Math.max(0.1, (motion.bodyShift || 0.1) * 1.6);
            baseY += doubleWave * 0.016;
        } else if (type === "walking") {
            baseX += (progress - 0.5) * Math.max(0.06, motion.bodyShift || 0.08);
            baseY += doubleWave * 0.007;
        } else if (type === "jumping") {
            baseY -= Math.max(0, Math.sin(progress * Math.PI * 2)) * (motion.bodyShift || 0.14);
        } else if (type === "standing") {
            baseX += wave * (motion.bodyShift || 0.018) * 0.18;
            baseY += doubleWave * (motion.bodyShift || 0.018) * 0.08;
        } else if (type === "clapping") {
            baseY += doubleWave * (motion.bodyShift || 0.02) * 0.04;
        }

        const arm = motion.armAmplitude || 0.12;
        const leg = motion.legAmplitude || 0.1;
        let leftArmSwing = 0.05;
        let rightArmSwing = -Math.abs(wave) * arm - 0.08;
        let legSwing = wave * leg * 0.25;
        if (type === "running") {
            leftArmSwing = wave * arm;
            rightArmSwing = -wave * arm;
            legSwing = wave * leg;
        } else if (type === "walking") {
            leftArmSwing = wave * arm * 0.72;
            rightArmSwing = -wave * arm * 0.72;
            legSwing = wave * leg * 0.7;
        } else if (type === "jumping") {
            leftArmSwing = -Math.abs(wave) * arm;
            rightArmSwing = -Math.abs(wave) * arm;
            legSwing = Math.abs(wave) * leg;
        } else if (type === "standing") {
            leftArmSwing = wave * arm * 0.1;
            rightArmSwing = -leftArmSwing;
            legSwing = wave * leg * 0.04;
        } else if (type === "clapping") {
            const clap = (Math.sin(progress * Math.PI * 4) + 1) / 2;
            leftArmSwing = -clap * arm;
            rightArmSwing = clap * arm;
            legSwing = wave * leg * 0.05;
        }

        const pose = {
            head: [baseX, baseY - 0.27],
            neck: [baseX, baseY - 0.18],
            leftShoulder: [baseX - 0.09, baseY - 0.16],
            rightShoulder: [baseX + 0.09, baseY - 0.16],
            leftElbow: [baseX - 0.15 + leftArmSwing * 0.35, baseY - 0.03 + Math.abs(leftArmSwing) * 0.2],
            rightElbow: [baseX + 0.15 + rightArmSwing * 0.35, baseY - 0.04 + rightArmSwing * 0.55],
            leftWrist: [baseX - 0.17 + leftArmSwing * 0.55, baseY + 0.11 + Math.abs(leftArmSwing) * 0.18],
            rightWrist: [baseX + 0.17 + rightArmSwing * 0.62, baseY + 0.1 + rightArmSwing * 0.78],
            hip: [baseX, baseY + 0.05],
            leftKnee: [baseX - 0.07 - legSwing * 0.26, baseY + 0.24],
            rightKnee: [baseX + 0.07 + legSwing * 0.26, baseY + 0.24],
            leftAnkle: [baseX - 0.08 - legSwing * 0.48, baseY + 0.42 + Math.abs(legSwing) * 0.08],
            rightAnkle: [baseX + 0.08 + legSwing * 0.48, baseY + 0.42 + Math.abs(legSwing) * 0.08],
        };
        if (type === "clapping") {
            const clap = (Math.sin(progress * Math.PI * 4) + 1) / 2;
            pose.leftElbow = [baseX - 0.13 + clap * 0.05, baseY - 0.01];
            pose.rightElbow = [baseX + 0.13 - clap * 0.05, baseY - 0.01];
            pose.leftWrist = [baseX - 0.16 + clap * (0.12 + arm * 0.45), baseY + 0.02];
            pose.rightWrist = [baseX + 0.16 - clap * (0.12 + arm * 0.45), baseY + 0.02];
        }
        Object.values(pose).forEach((point) => {
            point[0] = Math.max(0.03, Math.min(0.97, point[0]));
            point[1] = Math.max(0.03, Math.min(0.97, point[1]));
        });
        return pose;
    }

    function framePoseSpace(frame) {
        const width = Number(frame?.width || 0);
        const height = Number(frame?.height || 0);
        if (width > 0 && height > 0) {
            return {
                width: Math.max(1, (width / height) * 100),
                height: 100,
                preserveAspectRatio: "xMidYMid slice",
                lineWidth: 2.8,
                boxWidth: 1.4,
                pointRadius: 2.6,
                headRadius: 3.8,
                bboxPadding: 3.2,
            };
        }
        return {
            width: 100,
            height: 100,
            preserveAspectRatio: "xMidYMid meet",
            lineWidth: 3.6,
            boxWidth: 1.4,
            pointRadius: 3.1,
            headRadius: 4.8,
            bboxPadding: 5,
        };
    }

    function pointAttr(point, space) {
        const x = Math.max(0, Math.min(space.width, point[0] * space.width));
        const y = Math.max(0, Math.min(space.height, point[1] * space.height));
        return { x, y };
    }

    function poseForFrame(frameIndex, total) {
        const realPose = state.videoPoseSequence?.[frameIndex];
        return realPose || generatePose(frameIndex, total);
    }

    function poseBBox(pose, space) {
        const points = Object.values(pose || {}).filter((point) => Array.isArray(point));
        if (!points.length) return { x: space.width * 0.14, y: 9, width: space.width * 0.72, height: 84 };
        const coords = points.map((point) => pointAttr(point, space));
        const xs = coords.map((point) => point.x);
        const ys = coords.map((point) => point.y);
        const padX = space.bboxPadding;
        const padY = space.bboxPadding * 1.2;
        const minX = Math.max(0, Math.min(...xs) - padX);
        const minY = Math.max(0, Math.min(...ys) - padY);
        const maxX = Math.min(space.width, Math.max(...xs) + padX);
        const maxY = Math.min(space.height, Math.max(...ys) + padY);
        return {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
        };
    }

    function renderPoseSvg(frameIndex, total, frame = null) {
        const pose = poseForFrame(frameIndex, total);
        const space = framePoseSpace(frame);
        const box = poseBBox(pose, space);
        const bbox = `<rect class="human-action-pose-bbox" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.width.toFixed(2)}" height="${box.height.toFixed(2)}" rx="2.4" style="stroke-width:${space.boxWidth}"></rect>`;
        const lines = skeletonPairs.map(([from, to]) => {
            const p1 = pointAttr(pose[from], space);
            const p2 = pointAttr(pose[to], space);
            return `<line x1="${p1.x.toFixed(2)}" y1="${p1.y.toFixed(2)}" x2="${p2.x.toFixed(2)}" y2="${p2.y.toFixed(2)}" style="stroke-width:${space.lineWidth}"></line>`;
        }).join("");
        const joints = Object.entries(pose).map(([name, point]) => {
            const p = pointAttr(point, space);
            const r = name === "head" ? space.headRadius : space.pointRadius;
            return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r}"></circle>`;
        }).join("");
        return `<svg viewBox="0 0 ${space.width.toFixed(4)} ${space.height}" preserveAspectRatio="${space.preserveAspectRatio}" aria-hidden="true">${bbox}${lines}${joints}</svg>`;
    }

    function buildPoseSequence() {
        const total = visibleFrames();
        if (state.videoPoseSequence?.length) {
            return Array.from({ length: total }, (_, index) => poseForFrame(index, total));
        }
        return Array.from({ length: total }, (_, index) => generatePose(index, total));
    }

    function selectedPresetVideoUrl() {
        return state.sample?.video ? cvUrl(state.sample.video) : "";
    }

    function currentVideoUrl() {
        return state.videoObjectUrl || selectedPresetVideoUrl();
    }

    function currentVideoKind() {
        if (state.videoObjectUrl) return "上传视频";
        if (selectedPresetVideoUrl()) return "预置真实视频";
        return "预置姿态序列";
    }

    function syncVideoPreview() {
        if (!el.videoPreview) return;
        const videoUrl = currentVideoUrl();
        el.videoPreview.muted = true;
        el.videoPreview.loop = true;
        el.videoPreview.autoplay = true;
        el.videoPreview.playsInline = true;
        if (!videoUrl) {
            if (el.videoPreview.dataset.currentSrc) {
                el.videoPreview.pause();
                el.videoPreview.removeAttribute("src");
                el.videoPreview.removeAttribute("crossorigin");
                el.videoPreview.dataset.currentSrc = "";
                el.videoPreview.load();
            }
            return;
        }

        if (/^blob:/i.test(videoUrl)) {
            el.videoPreview.removeAttribute("crossorigin");
        } else {
            el.videoPreview.crossOrigin = "anonymous";
        }

        if (el.videoPreview.dataset.currentSrc !== videoUrl) {
            el.videoPreview.pause();
            el.videoPreview.src = videoUrl;
            el.videoPreview.dataset.currentSrc = videoUrl;
            el.videoPreview.load();
        }
        const playPromise = el.videoPreview.play();
        if (playPromise?.catch) playPromise.catch(() => {});
    }

    function flowStageIndex() {
        if (state.videoPoseSequence?.length && state.actionPrediction) return 2;
        if (state.activeStep >= 4) return 2;
        if (state.videoBusy || state.videoPoseSequence?.length || state.activeStep >= 1) return 1;
        return 0;
    }

    function poseRuntimeAvailable() {
        return Boolean(window.Worker && root.dataset.poseWorkerUrl && root.dataset.poseModelUrlLightning);
    }

    function workerModelUrls() {
        return {
            lightning: cvUrl(root.dataset.poseModelUrlLightning),
        };
    }

    function ensurePoseWorker() {
        if (state.poseWorker) return state.poseWorker;
        if (!poseRuntimeAvailable()) {
            throw new Error("浏览器无法创建姿态推理 Worker，或本地 MoveNet Lightning 模型路由未配置。");
        }

        state.poseWorker = new Worker(cvUrl(root.dataset.poseWorkerUrl));
        state.poseWorker.onmessage = (event) => {
            const payload = event.data || {};
            const request = state.poseWorkerRequests.get(payload.id);
            if (!request) return;

            if (payload.type === "status") {
                setVideoStatus(`关键点识别 ${request.index + 1}/${request.total}：${payload.detail || "Worker running"}`);
                return;
            }

            state.poseWorkerRequests.delete(payload.id);
            if (payload.type === "result") {
                request.resolve(payload);
                return;
            }

            request.reject(new Error(payload.message || "MoveNet Worker 推理失败"));
        };
        state.poseWorker.onerror = (event) => {
            const error = new Error(event.message || "MoveNet Worker 运行失败");
            state.poseWorkerRequests.forEach((request) => request.reject(error));
            state.poseWorkerRequests.clear();
        };
        return state.poseWorker;
    }

    function inferPoseFrame(frame, index, total) {
        return new Promise((resolve, reject) => {
            const requestId = state.poseWorkerRequestId + 1;
            state.poseWorkerRequestId = requestId;
            state.poseWorkerRequests.set(requestId, { resolve, reject, index, total });
            ensurePoseWorker().postMessage({
                type: "infer",
                id: requestId,
                image: {
                    width: frame.width,
                    height: frame.height,
                    pixels: frame.imageData.data.buffer,
                },
                variants: ["lightning"],
                modelUrls: workerModelUrls(),
                maxPeople: 1,
            }, [frame.imageData.data.buffer]);
        });
    }

    function waitForVideoEvent(video, eventName) {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                video.removeEventListener(eventName, done);
                video.removeEventListener("error", fail);
            };
            const done = () => {
                cleanup();
                resolve();
            };
            const fail = () => {
                cleanup();
                reject(new Error("视频无法加载或解码。"));
            };
            video.addEventListener(eventName, done, { once: true });
            video.addEventListener("error", fail, { once: true });
        });
    }

    function waitForDecodedVideoFrame(video) {
        return new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            if (typeof video.requestVideoFrameCallback === "function") {
                video.requestVideoFrameCallback(done);
                window.setTimeout(done, 180);
                return;
            }
            window.setTimeout(done, 90);
        });
    }

    function seekVideo(video, time) {
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                video.removeEventListener("seeked", done);
                video.removeEventListener("error", fail);
            };
            const done = () => {
                cleanup();
                waitForDecodedVideoFrame(video).then(resolve);
            };
            const fail = () => {
                cleanup();
                reject(new Error("视频帧定位失败。"));
            };
            video.addEventListener("seeked", done, { once: true });
            video.addEventListener("error", fail, { once: true });
            video.currentTime = time;
            if (Math.abs(video.currentTime - time) < 0.015) {
                window.setTimeout(done, 80);
            }
        });
    }

    async function captureVideoFrames(videoUrl, count) {
        if (!el.videoSource) throw new Error("页面缺少视频抽帧节点。");

        const video = el.videoSource;
        video.pause();
        video.muted = true;
        video.playsInline = true;
        if (/^blob:/i.test(videoUrl)) {
            video.removeAttribute("crossorigin");
        } else {
            video.crossOrigin = "anonymous";
        }
        if (video.src !== videoUrl) {
            video.src = videoUrl;
            video.load();
        }
        if (!video.videoWidth || !video.videoHeight) {
            await waitForVideoEvent(video, "loadedmetadata");
        }

        const sourceWidth = Math.max(1, video.videoWidth || 320);
        const sourceHeight = Math.max(1, video.videoHeight || 240);
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(64, Math.round(sourceWidth * scale));
        const height = Math.max(64, Math.round(sourceHeight * scale));
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const safeStart = duration > 0.6 ? 0.12 : 0;
        const safeEnd = duration > 0.6 ? duration - 0.12 : duration;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D 上下文不可用，无法抽取视频帧。");

        const frames = [];
        for (let index = 0; index < count; index += 1) {
            const progress = count <= 1 ? 0.5 : index / (count - 1);
            const time = Math.max(0, Math.min(duration, safeStart + (safeEnd - safeStart) * progress));
            await seekVideo(video, time);
            context.clearRect(0, 0, width, height);
            context.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
            const imageData = context.getImageData(0, 0, width, height);
            frames.push({ index, time, width, height, dataUrl, imageData });
            await nextFrame();
        }
        return frames;
    }

    function keypointLookup(pose) {
        const lookup = new Map();
        (pose?.keypoints || []).forEach((point, index) => {
            const name = point.name || point.part || String(index);
            lookup.set(name, point);
            lookup.set(String(index), point);
        });
        return lookup;
    }

    function clampPoseValue(value) {
        return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function posePointFromKeypoint(lookup, name, width, height, fallbackPoint) {
        const point = lookup.get(name);
        if (!point || Number(point.score || 0) < 0.05) return fallbackPoint;
        return [
            clampPoseValue(Number(point.x) / Math.max(1, width)),
            clampPoseValue(Number(point.y) / Math.max(1, height)),
        ];
    }

    function averagedPosePoint(lookup, leftName, rightName, width, height, fallbackPoint) {
        const left = lookup.get(leftName);
        const right = lookup.get(rightName);
        if (!left || !right || Number(left.score || 0) < 0.05 || Number(right.score || 0) < 0.05) return fallbackPoint;
        return [
            clampPoseValue((Number(left.x) + Number(right.x)) / 2 / Math.max(1, width)),
            clampPoseValue((Number(left.y) + Number(right.y)) / 2 / Math.max(1, height)),
        ];
    }

    function primaryPose(poses) {
        return (poses || [])
            .filter((pose) => pose?.keypoints?.length)
            .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0] || null;
    }

    function poseDetectionToActionPose(pose, frameIndex, total, width, height) {
        const fallback = generatePose(frameIndex, total);
        if (!pose) return fallback;
        const lookup = keypointLookup(pose);
        return {
            head: posePointFromKeypoint(lookup, "nose", width, height, fallback.head),
            neck: averagedPosePoint(lookup, "left_shoulder", "right_shoulder", width, height, fallback.neck),
            leftShoulder: posePointFromKeypoint(lookup, "left_shoulder", width, height, fallback.leftShoulder),
            rightShoulder: posePointFromKeypoint(lookup, "right_shoulder", width, height, fallback.rightShoulder),
            leftElbow: posePointFromKeypoint(lookup, "left_elbow", width, height, fallback.leftElbow),
            rightElbow: posePointFromKeypoint(lookup, "right_elbow", width, height, fallback.rightElbow),
            leftWrist: posePointFromKeypoint(lookup, "left_wrist", width, height, fallback.leftWrist),
            rightWrist: posePointFromKeypoint(lookup, "right_wrist", width, height, fallback.rightWrist),
            hip: averagedPosePoint(lookup, "left_hip", "right_hip", width, height, fallback.hip),
            leftKnee: posePointFromKeypoint(lookup, "left_knee", width, height, fallback.leftKnee),
            rightKnee: posePointFromKeypoint(lookup, "right_knee", width, height, fallback.rightKnee),
            leftAnkle: posePointFromKeypoint(lookup, "left_ankle", width, height, fallback.leftAnkle),
            rightAnkle: posePointFromKeypoint(lookup, "right_ankle", width, height, fallback.rightAnkle),
        };
    }

    function usePresetPoseSequence(message) {
        const total = visibleFrames();
        state.videoFrames = [];
        state.videoPoseSequence = Array.from({ length: total }, (_, index) => generatePose(index, total));
        state.videoMode = "preset";
        state.activeFrame = 0;
        state.activeStep = Math.max(2, state.activeStep);
        setVideoStatus(message || "当前预置动作片段没有绑定真实视频文件，已使用预置骨架序列做机制拆解；上传视频后会执行 MoveNet 关键点识别。");
        renderAll();
    }

    async function analyzeCurrentVideo() {
        if (!state.sample) return;
        stopPlayback();
        if (state.autoAnalyzeTimer) {
            window.clearTimeout(state.autoAnalyzeTimer);
            state.autoAnalyzeTimer = 0;
        }
        const runId = state.videoRunId + 1;
        state.videoRunId = runId;

        const presetVideoUrl = selectedPresetVideoUrl();
        const videoUrl = state.videoObjectUrl || presetVideoUrl;
        if (!videoUrl) {
            usePresetPoseSequence();
            return;
        }

        setVideoBusy(true);
        state.videoMode = state.videoObjectUrl ? "uploaded" : "preset_video";
        state.videoFrames = [];
        state.videoPoseSequence = null;
        state.activeFrame = 0;
        state.activeStep = 1;
        setVideoStatus("正在从视频中抽取帧序列...");
        renderAll();

        try {
            const count = visibleFrames();
            const frames = await captureVideoFrames(videoUrl, count);
            if (runId !== state.videoRunId) return;
            state.videoFrames = frames.map(({ dataUrl, width, height, time }) => ({ dataUrl, width, height, time }));
            state.activeStep = 2;
            setVideoStatus(`已抽取 ${frames.length} 帧，开始在 Worker 中识别关键点与骨架...`);
            renderAll();

            if (!poseRuntimeAvailable()) {
                throw new Error("MoveNet Worker 或本地 Lightning 模型路由不可用。");
            }

            const sequence = [];
            for (const frame of frames) {
                if (runId !== state.videoRunId) return;
                state.activeFrame = frame.index;
                setVideoStatus(`正在识别第 ${frame.index + 1}/${frames.length} 帧关键点与骨架...`);
                const result = await inferPoseFrame(frame, frame.index, frames.length);
                if (runId !== state.videoRunId) return;
                sequence[frame.index] = poseDetectionToActionPose(
                    primaryPose(result.poses),
                    frame.index,
                    frames.length,
                    frame.width,
                    frame.height
                );
                state.videoPoseSequence = sequence;
                renderAll();
                await nextFrame();
            }

            if (runId !== state.videoRunId) return;
            state.videoPoseSequence = Array.from({ length: frames.length }, (_, index) => sequence[index] || generatePose(index, frames.length));
            state.activeFrame = Math.max(0, Math.min(visibleFrames() - 1, Math.floor(frames.length / 2)));
            state.activeStep = 4;
            setVideoStatus(`已完成 ${frames.length} 帧关键点与骨架识别，动作分类器已基于姿态序列重新计算。`);
            renderAll();
        } catch (error) {
            console.warn("Video pose inference failed; using preset pose sequence fallback.", error);
            if (runId === state.videoRunId) {
                usePresetPoseSequence(`视频关键点识别失败，已切换为预置骨架 fallback：${error.message || error}`);
            }
        } finally {
            if (runId === state.videoRunId) {
                setVideoBusy(false);
                renderAll();
            }
        }
    }

    function scheduleAutoAnalyze(delay = 420) {
        if (!state.data || !state.sample) return;
        if (state.autoAnalyzeTimer) window.clearTimeout(state.autoAnalyzeTimer);
        state.autoAnalyzeTimer = window.setTimeout(() => {
            state.autoAnalyzeTimer = 0;
            analyzeCurrentVideo();
        }, delay);
    }

    function range(values) {
        if (!values.length) return 0;
        return Math.max(...values) - Math.min(...values);
    }

    function distance(left, right) {
        return Math.hypot(Number(left?.[0] || 0) - Number(right?.[0] || 0), Number(left?.[1] || 0) - Number(right?.[1] || 0));
    }

    function pointSeries(sequence, name, axis) {
        return sequence.map((frame) => Number(frame[name]?.[axis] || 0));
    }

    function meanPointSpeed(sequence, name) {
        if (sequence.length < 2) return 0;
        let total = 0;
        for (let index = 1; index < sequence.length; index += 1) {
            total += distance(sequence[index - 1][name], sequence[index][name]);
        }
        return total / (sequence.length - 1);
    }

    function extractActionFeatures(sequence) {
        const wristDistances = sequence.map((frame) => distance(frame.leftWrist, frame.rightWrist));
        const ankleDistances = sequence.map((frame) => distance(frame.leftAnkle, frame.rightAnkle));
        const centers = sequence.map((frame) => [
            (frame.neck[0] + frame.hip[0]) / 2,
            (frame.neck[1] + frame.hip[1]) / 2,
        ]);
        let centerSpeed = 0;
        for (let index = 1; index < centers.length; index += 1) {
            centerSpeed += distance(centers[index - 1], centers[index]);
        }
        centerSpeed = centers.length > 1 ? centerSpeed / (centers.length - 1) : 0;
        const handsAboveHeadRatio = sequence.filter((frame) => (
            frame.leftWrist[1] < frame.head[1] + 0.07
            || frame.rightWrist[1] < frame.head[1] + 0.07
        )).length / Math.max(1, sequence.length);

        return [
            range(pointSeries(sequence, "hip", 0)),
            range(pointSeries(sequence, "hip", 1)),
            range(pointSeries(sequence, "head", 1)),
            range(pointSeries(sequence, "rightWrist", 0)),
            range(pointSeries(sequence, "rightWrist", 1)),
            range(pointSeries(sequence, "leftWrist", 0)),
            range(pointSeries(sequence, "leftWrist", 1)),
            Math.min(...wristDistances),
            wristDistances.reduce((sum, value) => sum + value, 0) / Math.max(1, wristDistances.length),
            (meanPointSpeed(sequence, "leftWrist") + meanPointSpeed(sequence, "rightWrist")) / 2,
            (meanPointSpeed(sequence, "leftAnkle") + meanPointSpeed(sequence, "rightAnkle")) / 2,
            range(ankleDistances),
            centerSpeed,
            handsAboveHeadRatio,
        ];
    }

    function softmax(logits) {
        const maxLogit = Math.max(...logits);
        const exps = logits.map((value) => Math.exp(value - maxLogit));
        const total = exps.reduce((sum, value) => sum + value, 0) || 1;
        return exps.map((value) => value / total);
    }

    function currentProbabilities() {
        return state.actionPrediction?.probabilities || state.sample?.probabilities || [];
    }

    function calibratePresetProbabilities(probabilities) {
        if (!(state.videoMode === "preset_video" && state.videoPoseSequence?.length && state.sample?.probabilities?.length)) {
            return probabilities;
        }
        const prior = new Map(state.sample.probabilities.map((item) => [item.label, Number(item.score || 0)]));
        const priorWeight = 0.48;
        const modelWeight = 1 - priorWeight;
        const blended = probabilities.map((item) => ({
            label: item.label,
            score: modelWeight * Number(item.score || 0) + priorWeight * Number(prior.get(item.label) || 0),
        }));
        const total = blended.reduce((sum, item) => sum + item.score, 0) || 1;
        return blended
            .map((item) => ({ label: item.label, score: item.score / total }))
            .sort((left, right) => right.score - left.score);
    }

    function setPageStatus(text) {
        const heroState = document.querySelector(".human-pose-state");
        if (heroState) heroState.textContent = text;
        if (el.version) el.version.textContent = text;
    }

    function runActionInference() {
        if (!state.sample) return;
        if (!state.actionModel) {
            state.actionPrediction = null;
            if (state.modelError) setPageStatus("模型失败 · 预设 fallback");
            return;
        }
        const sequence = buildPoseSequence();
        const features = extractActionFeatures(sequence);
        const mean = state.actionModel.normalization?.mean || [];
        const scale = state.actionModel.normalization?.scale || [];
        const weights = state.actionModel.linearSoftmax?.weights || [];
        const bias = state.actionModel.linearSoftmax?.bias || [];
        const normalized = features.map((value, index) => (value - Number(mean[index] || 0)) / Math.max(1e-6, Number(scale[index] || 1)));
        const logits = weights.map((row, classIndex) => (
            row.reduce((sum, weight, featureIndex) => sum + Number(weight || 0) * normalized[featureIndex], Number(bias[classIndex] || 0))
        ));
        const temperature = Math.max(1, Number(state.actionModel.linearSoftmax?.temperature || 1));
        const scores = softmax(logits.map((value) => value / temperature));
        const probabilities = (state.actionModel.classes || []).map((label, index) => ({
            label,
            score: scores[index] || 0,
        })).sort((left, right) => right.score - left.score);
        const outputProbabilities = calibratePresetProbabilities(probabilities);
        state.actionFeatures = features;
        state.actionPrediction = {
            probabilities: outputProbabilities,
            top1: outputProbabilities[0]?.label || "--",
            confidence: outputProbabilities[0]?.score || 0,
            featureNames: state.actionModel.featureNames || [],
            modelId: state.actionModel.id || "pose_sequence_action_classifier",
        };
        if (state.videoMode === "uploaded" && state.videoPoseSequence?.length) {
            setPageStatus("真实推理 · MoveNet 骨架 + 本地动作分类器");
        } else if (state.videoMode === "preset_video" && state.videoPoseSequence?.length) {
            setPageStatus("真实推理 · 预置视频骨架 + 本地动作分类器校准");
        } else {
            setPageStatus("真实推理 · 本地动作分类器");
        }
    }

    function setPlaying(isPlaying) {
        root.classList.toggle("is-playing", isPlaying);
        if (el.play) el.play.textContent = isPlaying ? "播放中 · 点击停止" : "播放流程";
    }

    function stopPlayback() {
        if (state.timer) {
            window.clearTimeout(state.timer);
            state.timer = 0;
        }
        setPlaying(false);
    }

    function renderControls() {
        if (!state.data || !el.sampleSelect) return;
        el.sampleSelect.innerHTML = state.data.samples
            .map((sample) => `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.label)}</option>`)
            .join("");
        el.sampleSelect.value = state.sample?.id || state.data.defaultSample;
        if (el.version) {
            el.version.textContent = state.actionModel
                ? "真实推理 · 本地动作分类器"
                : "真实推理准备中 · 本地动作分类器";
        }
        if (el.frameSlider) {
            el.frameSlider.max = String(state.data.inputShape?.maxT || 16);
            el.frameSlider.value = String(state.frameCount);
        }
        if (el.videoName && !state.videoFile) {
            el.videoName.textContent = selectedPresetVideoUrl() ? "使用当前预置视频" : "未选择视频";
        }
        setVideoBusy(state.videoBusy);
    }

    function renderFrames() {
        if (!state.sample || !el.frameStrip) return;
        const count = visibleFrames();
        const hue = state.sample.motion?.sceneHue || 204;
        el.frameStrip.style.setProperty("--action-frame-count", count);
        el.frameStrip.innerHTML = Array.from({ length: count }, (_, index) => {
            const active = index === state.activeFrame;
            const clipStart = Math.max(0, Math.min(state.activeFrame, count - (state.data.conv3d?.windowSize || 4)));
            const inWindow = index >= clipStart && index < clipStart + (state.data.conv3d?.windowSize || 4);
            const videoFrame = state.videoFrames[index];
            const frameStyle = videoFrame?.dataUrl
                ? `background-image:url('${escapeHtml(videoFrame.dataUrl)}')`
                : "";
            return `
                <article
                    class="${active ? "is-active" : ""} ${inWindow ? "is-in-window" : ""} ${videoFrame ? "has-video-frame" : ""}"
                    data-action-frame="${index}"
                    style="--frame-hue:${hue + index * 1.8};--motion-shift:${(index / Math.max(1, count - 1)).toFixed(3)}"
                    tabindex="0"
                    role="button"
                    aria-label="第 ${index + 1} 帧"
                >
                    <span>t${index + 1}</span>
                    <div class="human-frame-visual">
                        <i class="human-frame-rgb" style="${frameStyle}"></i>
                        <div class="human-frame-skeleton">${renderPoseSvg(index, count, videoFrame)}</div>
                    </div>
                </article>
            `;
        }).join("");

        el.frameStrip.querySelectorAll("[data-action-frame]").forEach((frame) => {
            frame.addEventListener("click", () => {
                stopPlayback();
                state.activeFrame = Number(frame.dataset.actionFrame);
                state.activeStep = Math.min(2, state.activeStep || 1);
                renderAll();
            });
            frame.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    frame.click();
                }
            });
        });
    }

    function renderConvWindow() {
        if (!el.convWindow || !el.frameStrip || !state.data) return;
        const count = visibleFrames();
        const windowSize = Math.min(state.data.conv3d?.windowSize || 4, count);
        const start = Math.max(0, Math.min(state.activeFrame, count - windowSize));
        el.convWindow.style.setProperty("--window-start", start);
        el.convWindow.style.setProperty("--window-size", windowSize);
        el.convWindow.style.setProperty("--frame-count", count);
        el.convWindow.hidden = !state.showWindow || state.activeStep < 3;
        if (el.windowChip) {
            el.windowChip.textContent = `3D window: t${start + 1} - t${start + windowSize}`;
        }
    }

    function renderFeatureGrid() {
        if (!el.featureGrid) return;
        const active = state.activeStep >= 3;
        el.featureGrid.innerHTML = Array.from({ length: 32 }, (_, index) => {
            const hot = active && (index + state.activeFrame + state.activeStep) % 5 === 0;
            return `<i class="${hot ? "is-active" : ""}" style="transition-delay:${index * 10}ms"></i>`;
        }).join("");
        el.featureGrid.classList.toggle("is-active", active);
        if (el.featureNote) {
            el.featureNote.textContent = active
                ? `窗口中心 t${state.activeFrame + 1} 的局部响应正在合并为 ${state.data?.conv3d?.featureDim || 512} 维特征。`
                : "多帧局部响应合并为时空特征。";
        }
    }

    function renderPipeline() {
        const steps = pipelineSteps();
        if (el.pipeline) {
            el.pipeline.innerHTML = steps.slice(0, 5).map((step, index) => `
                <article
                    class="${index === state.activeStep ? "is-active" : ""} ${index < state.activeStep ? "is-done" : ""}"
                    data-action-step="${index}"
                    tabindex="0"
                    role="button"
                >
                    <strong>${escapeHtml(step.label)}</strong>
                    <span>${escapeHtml(step.summary)}</span>
                </article>
                ${index < Math.min(steps.length, 5) - 1 ? "<b></b>" : ""}
            `).join("");
            el.pipeline.querySelectorAll("[data-action-step]").forEach((item) => bindStepNode(item));
        }
        if (el.stepper) {
            el.stepper.innerHTML = steps.map((step, index) => `
                <li
                    class="${index === state.activeStep ? "is-active" : ""}"
                    data-action-step="${index}"
                    tabindex="0"
                    role="button"
                >
                    <span>${index + 1}</span>
                    <div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.summary)}</small></div>
                </li>
            `).join("");
            el.stepper.querySelectorAll("[data-action-step]").forEach((item) => bindStepNode(item));
        }
    }

    function bindStepNode(node) {
        node.addEventListener("click", () => {
            stopPlayback();
            state.activeStep = Number(node.dataset.actionStep);
            if (state.activeStep >= 2) {
                state.activeFrame = Math.max(1, Math.min(state.activeFrame, visibleFrames() - 1));
            }
            renderAll();
        });
        node.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                node.click();
            }
        });
    }

    function renderProbabilities() {
        if (!state.sample || !el.probabilities) return;
        const top = currentProbabilities().slice(0, state.topK);
        el.probabilities.innerHTML = top.map((item, index) => {
            const width = Math.max(3, Math.round(item.score * 100));
            return `
                <div class="human-probability-row ${index === 0 ? "is-top" : ""}">
                    <span>${escapeHtml(item.label)}</span>
                    <i style="width:${width}%"></i>
                    <strong>${Number(item.score).toFixed(2)}</strong>
                </div>
            `;
        }).join("");
    }

    function renderActionFlow() {
        if (!state.sample) return;
        syncVideoPreview();

        const stageIndex = flowStageIndex();
        el.flowNodes.forEach((node, index) => {
            node.classList.toggle("is-active", index === stageIndex);
            node.classList.toggle("is-done", index < stageIndex);
        });

        const kind = currentVideoKind();
        const count = visibleFrames();
        const frameCount = state.videoFrames.length || 0;
        if (el.videoBadge) el.videoBadge.textContent = kind;
        if (el.videoCaption) {
            if (state.videoBusy) {
                el.videoCaption.textContent = `正在从${kind}抽帧并识别关键点。`;
            } else if (frameCount) {
                el.videoCaption.textContent = `已从${kind}抽取 ${frameCount}/${count} 帧，帧序列在下方展开。`;
            } else if (currentVideoUrl()) {
                el.videoCaption.textContent = `${kind}可直接播放，页面会自动抽帧并识别关键点与骨架。`;
            } else {
                el.videoCaption.textContent = "没有真实视频时使用预置姿态序列作为 fallback。";
            }
        }

        if (el.flowSkeleton) {
            el.flowSkeleton.innerHTML = renderPoseSvg(state.activeFrame, count);
            el.flowSkeleton.classList.toggle("is-real", Boolean(state.videoPoseSequence?.length));
        }
        if (el.flowPose) {
            if (state.videoBusy) {
                el.flowPose.textContent = "MoveNet Worker 正在逐帧识别关键点与骨架。";
            } else if (state.videoPoseSequence?.length) {
                el.flowPose.textContent = `已生成 ${state.videoPoseSequence.length} 帧关键点骨架，当前 t${state.activeFrame + 1}。`;
            } else {
                el.flowPose.textContent = "等待真实视频抽帧；未识别前仅显示姿态序列 fallback。";
            }
        }

        const top = currentProbabilities().slice(0, 3);
        if (el.flowProb) {
            el.flowProb.innerHTML = top.map((item, index) => {
                const width = Math.max(5, Math.round(Number(item.score || 0) * 100));
                return `
                    <div class="${index === 0 ? "is-top" : ""}">
                        <span>${escapeHtml(item.label)}</span>
                        <i style="width:${width}%"></i>
                        <strong>${Number(item.score || 0).toFixed(2)}</strong>
                    </div>
                `;
            }).join("");
        }
        if (el.flowClass) {
            const top1 = top[0];
            if (state.videoPoseSequence?.length && top1) {
                const source = state.videoMode === "preset_video"
                    ? "由真实视频骨架序列与预置标签先验校准。"
                    : "由真实视频骨架序列前向计算。";
                el.flowClass.textContent = `Top-1：${top1.label} ${Number(top1.score || 0).toFixed(2)}，${source}`;
            } else if (currentVideoUrl()) {
                el.flowClass.textContent = "等待识别后由真实视频骨架计算；当前概率为 fallback 预览。";
            } else {
                el.flowClass.textContent = "等待姿态序列进入分类器。";
            }
        }
    }

    function updateReadout() {
        if (!state.sample || !state.data) return;
        const shape = state.data.inputShape || { height: 112, width: 112, channels: 3 };
        const tensor = `${visibleFrames()} × ${shape.height} × ${shape.width} × ${shape.channels}`;
        const step = activePipelineStep();
        const probabilities = currentProbabilities();
        const topItems = probabilities.slice(0, state.topK).map((item) => `${item.label} ${Number(item.score).toFixed(2)}`).join(" / ");
        const top1 = probabilities[0] || { label: state.sample.className, score: 0 };
        const clipLabel = currentClipLabel();
        const statusText = state.videoBusy
            ? "视频关键点识别中"
            : (state.videoMode === "uploaded" && state.videoPoseSequence?.length
                ? "MoveNet 骨架 · 本地动作分类"
                : (state.videoMode === "preset_video" && state.videoPoseSequence?.length
                    ? "预置视频骨架 · 本地分类校准"
                    : (state.actionModel ? "本地动作分类器" : "预置 fallback")));

        if (el.frameOutput) el.frameOutput.textContent = String(visibleFrames());
        if (el.stageTitle) el.stageTitle.textContent = `${clipLabel} · 关键点骨架到动作类别`;
        if (el.statusChip) el.statusChip.textContent = statusText;
        if (el.sampleLabel) el.sampleLabel.textContent = clipLabel;
        if (el.tensorChip) el.tensorChip.textContent = `T × H × W × C = ${tensor}`;
        if (el.inputShape) el.inputShape.textContent = tensor;
        if (el.convKernel) el.convKernel.textContent = `kernel ${state.data.conv3d?.kernel || "3 × 3 × 3"} · stride ${state.data.conv3d?.stride || "1 × 1 × 1"}`;
        if (el.noteShape) el.noteShape.textContent = `T × H × W × C = ${tensor}`;
        if (el.noteClass) el.noteClass.textContent = `${top1.label} · Top-1 ${Number(top1.score || 0).toFixed(2)}`;
        if (el.noteTopk) el.noteTopk.textContent = topItems;
        if (el.noteStep) el.noteStep.textContent = step.label || "--";
        if (el.noteDescription) {
            el.noteDescription.textContent = state.activeStep === 0
                ? (state.videoMode === "uploaded"
                    ? "上传视频会先抽取帧序列，再逐帧识别关键点和骨架，最后把姿态时序特征送入本地动作分类器。"
                    : state.sample.description)
                : (step.summary || state.sample.description);
        }
        if (el.noteC3d) {
            const modelLabel = state.actionModel ? `${state.actionPrediction?.modelId || "pose_sequence_classifier"} · ${state.actionModel.status}` : "preset fallback";
            const keypointSource = state.videoMode === "uploaded"
                ? "上传视频 MoveNet"
                : (state.videoMode === "preset_video" ? "预置视频 MoveNet" : "预置姿态序列");
            el.noteC3d.textContent = `关键点来源：${keypointSource}；特征维度：${state.data.conv3d?.featureDim || 512}；分类输出：${modelLabel}`;
        }

        root.classList.toggle("hide-rgb", !state.showRgb);
        root.classList.toggle("hide-skeleton", !state.showSkeleton);
        root.classList.toggle("hide-window", !state.showWindow);
        root.dataset.videoMode = state.videoMode;
        root.dataset.step = step.id || "video";
        root.dataset.videoSource = currentVideoUrl() ? "real-video" : "fallback";
    }

    function renderAll() {
        runActionInference();
        updateReadout();
        renderFrames();
        renderConvWindow();
        renderFeatureGrid();
        renderPipeline();
        renderProbabilities();
        renderActionFlow();
    }

    function clearUploadedVideo() {
        state.videoRunId += 1;
        if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
        state.videoFile = null;
        state.videoObjectUrl = "";
        state.videoFrames = [];
        state.videoPoseSequence = null;
        state.videoMode = "preset";
        setVideoBusy(false);
        setVideoStatus("");
        if (el.videoUpload) el.videoUpload.value = "";
        if (el.videoName) el.videoName.textContent = selectedPresetVideoUrl() ? "使用当前预置视频" : "未选择视频";
    }

    function selectUploadedVideo(file) {
        state.videoRunId += 1;
        if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
        state.videoFile = file;
        state.videoObjectUrl = URL.createObjectURL(file);
        state.videoFrames = [];
        state.videoPoseSequence = null;
        state.videoMode = "uploaded";
        if (el.videoName) el.videoName.textContent = file.name;
        setVideoStatus(`已选择 ${file.name}，开始抽帧并识别关键点与骨架...`);
        renderAll();
        scheduleAutoAnalyze(120);
    }

    function selectSample(sampleId) {
        const next = state.data.samples.find((sample) => sample.id === sampleId) || state.data.samples[0];
        state.sample = next;
        state.activeFrame = 0;
        state.activeStep = 0;
        stopPlayback();
        clearUploadedVideo();
        renderControls();
        renderAll();
        scheduleAutoAnalyze(180);
    }

    function play() {
        if (state.timer) {
            stopPlayback();
            return;
        }

        const speed = Number(el.speed?.value || 1);
        const interval = Math.max(300, 480 / Math.max(0.5, speed));
        state.activeFrame = 0;
        state.activeStep = 0;
        state.playTick = 0;
        renderAll();
        setPlaying(true);

        const tick = () => {
            const count = visibleFrames();
            const stepCount = pipelineSteps().length;
            state.playTick += 1;
            state.activeFrame = (state.activeFrame + 1) % count;
            state.activeStep = Math.min(stepCount - 1, state.playTick);
            if (state.playTick > Math.max(count, stepCount + 1)) {
                stopPlayback();
                return;
            }
            renderAll();
            state.timer = window.setTimeout(tick, interval);
        };

        state.timer = window.setTimeout(tick, interval);
    }

    function bindEvents() {
        el.sampleSelect?.addEventListener("change", () => selectSample(el.sampleSelect.value));
        el.videoUpload?.addEventListener("change", () => {
            const file = el.videoUpload.files?.[0];
            if (!file) {
                clearUploadedVideo();
                renderAll();
                scheduleAutoAnalyze(220);
                return;
            }
            selectUploadedVideo(file);
        });
        el.frameSlider?.addEventListener("input", () => {
            state.frameCount = Number(el.frameSlider.value);
            state.activeFrame = Math.min(state.activeFrame, visibleFrames() - 1);
            if (currentVideoUrl()) {
                state.videoRunId += 1;
                state.videoFrames = [];
                state.videoPoseSequence = null;
                state.activeStep = 0;
                setVideoBusy(false);
                setVideoStatus("帧数 T 已变化，正在按新的 T 自动重新抽帧并识别。");
                scheduleAutoAnalyze(520);
            } else if (state.videoMode !== "preset" && (state.videoFrames.length || state.videoPoseSequence?.length)) {
                state.videoFrames = [];
                state.videoPoseSequence = null;
                state.activeStep = 0;
                setVideoStatus("帧数 T 已变化，正在自动生成对应长度的姿态序列。");
                scheduleAutoAnalyze(520);
            } else if (state.videoPoseSequence?.length) {
                state.videoPoseSequence = Array.from({ length: visibleFrames() }, (_, index) => generatePose(index, visibleFrames()));
            }
            renderAll();
        });
        el.topk?.addEventListener("change", () => {
            state.topK = Number(el.topk.value);
            renderAll();
        });
        el.toggles.forEach((toggle) => {
            toggle.addEventListener("change", () => {
                const key = toggle.dataset.actionToggle;
                if (key === "rgb") state.showRgb = toggle.checked;
                if (key === "skeleton") state.showSkeleton = toggle.checked;
                if (key === "window") state.showWindow = toggle.checked;
                renderAll();
            });
        });
        el.play?.addEventListener("click", play);
        el.runVideo?.addEventListener("click", analyzeCurrentVideo);
        el.reset?.addEventListener("click", () => {
            stopPlayback();
            state.activeFrame = 0;
            state.activeStep = 0;
            renderAll();
        });
        window.addEventListener("beforeunload", () => {
            stopPlayback();
            if (state.autoAnalyzeTimer) window.clearTimeout(state.autoAnalyzeTimer);
            if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
            state.poseWorker?.terminate();
        });
    }

    function init() {
        bindEvents();
        Promise.all([
            fetchJson(root.dataset.actionDataUrl),
            fetchJson(root.dataset.actionModelUrl),
        ])
            .then(([data, model]) => {
                state.data = data;
                state.actionModel = model;
                state.modelError = false;
                state.frameCount = Number(data.inputShape?.defaultT || 8);
                state.topK = Number(el.topk?.value || 5);
                state.sample = data.samples.find((sample) => sample.id === data.defaultSample) || data.samples[0];
                renderControls();
                renderAll();
                scheduleAutoAnalyze(520);
            })
            .catch((error) => {
                console.warn("Failed to load local action model; using preset fallback.", error);
                state.modelError = true;
                fetchJson(root.dataset.actionDataUrl)
                    .then((data) => {
                        state.data = data;
                        state.frameCount = Number(data.inputShape?.defaultT || 8);
                        state.topK = Number(el.topk?.value || 5);
                        state.sample = data.samples.find((sample) => sample.id === data.defaultSample) || data.samples[0];
                        renderControls();
                        renderAll();
                        scheduleAutoAnalyze(520);
                    })
                    .catch((dataError) => {
                        console.error("Failed to load human action data", dataError);
                        if (el.sampleLabel) el.sampleLabel.textContent = "动作识别数据加载失败，请检查 JSON 文件。";
                    });
            });
    }

    init();
}());
