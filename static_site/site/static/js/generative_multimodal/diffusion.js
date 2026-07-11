(function () {
    const root = document.querySelector("[data-gm-diffusion]");
    if (!root || !window.FrontierPlayer) return;
    const realTextToImageModuleUrl = window.cvclassUrl("/static/js/generative_multimodal/diffusion_text_to_image.js?v=20260711-diffusion-sdxs5");

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
        },
        real: {
            status: root.querySelector("[data-diff-real-status]"),
            progress: root.querySelector("[data-diff-real-progress]"),
            prompt: root.querySelector("[data-diff-real-prompt]"),
            preview: root.querySelector("[data-diff-real-preview]"),
            seed: root.querySelector('[data-diff-real-control="seed"]'),
            load: root.querySelector('[data-diff-real-action="load"]'),
            generate: root.querySelector('[data-diff-real-action="generate"]'),
            cancel: root.querySelector('[data-diff-real-action="cancel"]'),
            download: root.querySelector('[data-diff-real-action="download"]'),
            meta: {
                model: root.querySelector('[data-diff-real-meta="model"]'),
                backend: root.querySelector('[data-diff-real-meta="backend"]'),
                runtime: root.querySelector('[data-diff-real-meta="runtime"]')
            },
            facts: {
                model: root.querySelector('[data-diff-real-fact="model"]'),
                size: root.querySelector('[data-diff-real-fact="size"]'),
                result: root.querySelector('[data-diff-real-fact="result"]')
            }
        }
    };

    const state = {
        data: null,
        sampleId: "",
        prompt: "a small cat",
        timestep: 50,
        display: "forward",
        guidance: 7.5,
        player: null,
        realModel: {
            module: null,
            moduleLoading: null,
            supported: null,
            ready: false,
            loading: false,
            generating: false,
            imageUrl: "",
            lastSeed: 42,
            lastDurationMs: 0,
            lastPrompt: "",
            lastResultLabel: "尚未生成",
            teachingFrames: {},
            teachingFrameUrls: [],
            teachingFrameJob: 0,
            autoStartRequested: false
        }
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

    function formatBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return "";
        if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
        if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
        return `${Math.round(value / 1024)} KB`;
    }

    function currentPrompt() {
        return String(el.prompt?.value || state.prompt || currentSample()?.prompt || "").trim();
    }

    function cleanupRealPreviewUrl() {
        if (state.realModel.imageUrl) {
            URL.revokeObjectURL(state.realModel.imageUrl);
            state.realModel.imageUrl = "";
        }
    }

    function cleanupTeachingFrames() {
        const real = state.realModel;
        real.teachingFrameJob += 1;
        real.teachingFrameUrls.forEach((url) => URL.revokeObjectURL(url));
        real.teachingFrameUrls = [];
        real.teachingFrames = {};
    }

    function invalidateRealResult(message) {
        const real = state.realModel;
        const hasPreviousResult = Boolean(real.imageUrl || real.lastPrompt);
        if (!hasPreviousResult) return false;

        cleanupTeachingFrames();
        cleanupRealPreviewUrl();
        real.lastDurationMs = 0;
        real.lastPrompt = "";
        real.lastResultLabel = "输入已变更，请重新生成";
        renderRealPlaceholder("等待新的真实图像", "Prompt 或示例已变更，上一张真实推理结果已清除。");
        setRealStatus(message || "输入已变更，已清除上一张真实图像，请重新生成。", { pct: 0 });
        return true;
    }

    function makeSeededRandom(seed) {
        let value = Number(seed) >>> 0;
        return function random() {
            value += 0x6D2B79F5;
            let result = Math.imul(value ^ (value >>> 15), 1 | value);
            result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
            return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
        };
    }

    function canvasToPngBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("无法创建教学过程图像。"));
            }, "image/png");
        });
    }

    function decodeBlobForCanvas(blob) {
        if (typeof createImageBitmap === "function") return createImageBitmap(blob);
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("无法读取模型生成的图像。"));
            };
            image.src = url;
        });
    }

    async function buildTeachingFramesFromRealImage(blob, seed) {
        cleanupTeachingFrames();
        const real = state.realModel;
        const jobId = real.teachingFrameJob;
        const temporaryUrls = [];
        let bitmap;

        try {
            bitmap = await decodeBlobForCanvas(blob);
            if (jobId !== real.teachingFrameJob) {
                temporaryUrls.forEach((url) => URL.revokeObjectURL(url));
                return;
            }

            const size = 512;
            const sourceCanvas = document.createElement("canvas");
            sourceCanvas.width = size;
            sourceCanvas.height = size;
            const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
            const frameCanvas = document.createElement("canvas");
            frameCanvas.width = size;
            frameCanvas.height = size;
            const frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
            if (!sourceContext || !frameContext) throw new Error("浏览器不支持教学帧所需的 Canvas。" );

            sourceContext.drawImage(bitmap, 0, 0, size, size);
            const sourcePixels = sourceContext.getImageData(0, 0, size, size).data;
            const frames = {};
            const blockByTimestep = { 25: 2, 50: 5, 75: 11, 100: 1 };

            for (const timestep of [25, 50, 75, 100]) {
                const noise = timestep / 100;
                const block = blockByTimestep[timestep];
                const frameSeed = Number.isFinite(Number(seed)) ? Number(seed) : 1;
                const random = makeSeededRandom(frameSeed ^ (timestep * 2654435761));
                const pixels = new Uint8ClampedArray(size * size * 4);

                for (let y = 0; y < size; y += 1) {
                    const sampleY = Math.min(size - 1, Math.floor(y / block) * block);
                    for (let x = 0; x < size; x += 1) {
                        const sampleX = Math.min(size - 1, Math.floor(x / block) * block);
                        const sourceIndex = (sampleY * size + sampleX) * 4;
                        const targetIndex = (y * size + x) * 4;
                        pixels[targetIndex] = sourcePixels[sourceIndex] * (1 - noise) + random() * 255 * noise;
                        pixels[targetIndex + 1] = sourcePixels[sourceIndex + 1] * (1 - noise) + random() * 255 * noise;
                        pixels[targetIndex + 2] = sourcePixels[sourceIndex + 2] * (1 - noise) + random() * 255 * noise;
                        pixels[targetIndex + 3] = 255;
                    }
                }

                frameContext.putImageData(new ImageData(pixels, size, size), 0, 0);
                const frameBlob = await canvasToPngBlob(frameCanvas);
                const frameUrl = URL.createObjectURL(frameBlob);
                temporaryUrls.push(frameUrl);
                frames[timestep] = frameUrl;
            }

            if (jobId !== real.teachingFrameJob) {
                temporaryUrls.forEach((url) => URL.revokeObjectURL(url));
                return;
            }
            real.teachingFrames = frames;
            real.teachingFrameUrls = temporaryUrls;
            renderStage();
            setRealStatus("SDXS 真实图像与教学模拟中间帧均已就绪。", { pct: 100 });
        } catch (error) {
            temporaryUrls.forEach((url) => URL.revokeObjectURL(url));
            if (jobId === real.teachingFrameJob) {
                console.warn("Diffusion 教学中间帧生成失败，已保留真实最终图。", error);
                setRealStatus("SDXS 真实图像已生成；教学模拟中间帧准备失败，主舞台保留最终图。", { error: true, pct: 100 });
                renderStage();
            }
        } finally {
            bitmap?.close?.();
        }
    }

    function teachingFrameFor(timestep) {
        const real = state.realModel;
        if (!real.imageUrl) return null;
        const t = Number(timestep);
        if (t <= 0) {
            return {
                url: real.imageUrl,
                label: "模型真实最终输出",
                simulated: false
            };
        }
        return {
            url: real.teachingFrames[t] || real.imageUrl,
            label: real.teachingFrames[t]
                ? "模型中间过程"
                : "正在准备教学模拟帧",
            simulated: true
        };
    }

    function renderRealPlaceholder(title, note) {
        if (!el.real.preview) return;
        el.real.preview.innerHTML = `
            <div class="diff-real-placeholder">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(note)}</span>
            </div>
        `;
    }

    function setRealStatus(message, options = {}) {
        if (!el.real.status) return;
        el.real.status.textContent = message;
        el.real.status.classList.toggle("is-error", options.error === true);
        if (el.real.progress && typeof options.pct === "number") {
            const pct = Math.max(0, Math.min(100, Number(options.pct) || 0));
            el.real.progress.style.width = `${pct}%`;
        }
    }

    function syncRealPromptMirror() {
        if (el.real.prompt) {
            el.real.prompt.textContent = currentPrompt() || "请输入 prompt";
        }
    }

    function updateRealModelUi() {
        const prompt = currentPrompt();
        const real = state.realModel;
        syncRealPromptMirror();

        if (el.real.meta.model) el.real.meta.model.textContent = "SDXS-512 DreamShaper";
        if (el.real.meta.backend) {
            el.real.meta.backend.textContent = real.supported === false ? "WebGPU / shader-f16 不可用" : "浏览器 WebGPU";
        }
        if (el.real.meta.runtime) {
            el.real.meta.runtime.textContent = real.generating
                ? "正在生成"
                : real.loading
                    ? "模型加载中"
                    : real.ready
                        ? "模型已就绪"
                        : real.supported === false
                            ? "当前浏览器不可用"
                            : "等待加载模型";
        }

        if (el.real.facts.model) {
            el.real.facts.model.textContent = real.ready
                ? "SDXS 单步扩散 · 浏览器端已加载"
                : "SDXS 单步扩散 · 浏览器 WebGPU";
        }
        if (el.real.facts.size) {
            el.real.facts.size.textContent = Number.isInteger(real.lastSeed)
                ? `512 × 512 · seed ${real.lastSeed}`
                : "512 × 512";
        }
        if (el.real.facts.result) {
            el.real.facts.result.textContent = real.lastResultLabel;
        }

        if (el.real.load) {
            el.real.load.disabled = real.loading || real.generating || real.ready || real.supported === false;
            el.real.load.textContent = real.loading ? "加载中" : (real.ready ? "模型已加载" : "加载真实模型");
        }
        if (el.real.generate) {
            el.real.generate.disabled = !prompt || real.loading || real.generating || real.supported === false;
            el.real.generate.textContent = real.generating ? "生成中" : "生成 512×512";
        }
        if (el.real.cancel) {
            el.real.cancel.disabled = !real.generating;
        }
        if (el.real.download) {
            const enabled = Boolean(real.imageUrl);
            el.real.download.setAttribute("aria-disabled", enabled ? "false" : "true");
            el.real.download.tabIndex = enabled ? 0 : -1;
            el.real.download.href = enabled ? real.imageUrl : "#";
        }

        const lockInputs = real.loading || real.generating;
        if (el.sample) el.sample.disabled = lockInputs;
        if (el.prompt) el.prompt.disabled = lockInputs;
        if (el.real.seed) el.real.seed.disabled = lockInputs;
    }

    function describeRealProgress(progress, fallback) {
        const pctText = typeof progress?.pct === "number" ? `${Math.round(progress.pct)}%` : "";
        const downloaded = formatBytes(progress?.bytesDownloaded);
        const total = formatBytes(progress?.totalBytesExpected);
        const sizeText = downloaded && total ? `${downloaded} / ${total}` : downloaded || "";
        return [progress?.message || progress?.phase || fallback, pctText, sizeText].filter(Boolean).join(" · ");
    }

    async function getRealRuntime() {
        if (state.realModel.module) return state.realModel.module;
        if (!state.realModel.moduleLoading) {
            state.realModel.moduleLoading = import(realTextToImageModuleUrl)
                .then((module) => {
                    state.realModel.module = module;
                    return module;
                })
                .catch((error) => {
                    state.realModel.moduleLoading = null;
                    throw error;
                });
        }
        return state.realModel.moduleLoading;
    }

    async function probeRealModelSupport() {
        try {
            const runtime = await getRealRuntime();
            const caps = await runtime.detectTextToImageCapabilities();
            state.realModel.supported = Boolean(caps?.webgpu && caps?.shaderF16);
            if (!state.realModel.supported) {
                setRealStatus("当前浏览器未启用 WebGPU 或 shader-f16，无法运行 SDXS 真实文生图推理。", { error: true, pct: 0 });
                renderRealPlaceholder("当前环境不支持 SDXS WebGPU 推理", "请使用新版 Chrome / Edge，并开启硬件加速后重试。");
            } else {
                setRealStatus("已检测到 WebGPU 和 shader-f16，可自动加载约 0.9 GB 的 SDXS 浏览器端模型。", { pct: 0 });
            }
        } catch (error) {
            state.realModel.supported = false;
            setRealStatus(error?.message || "真实前端文生图运行时加载失败。", { error: true, pct: 0 });
            renderRealPlaceholder("运行时加载失败", "无法初始化浏览器端文生图依赖，请检查网络或稍后重试。");
        } finally {
            updateRealModelUi();
        }
    }

    async function ensureRealModelReady() {
        if (state.realModel.ready) return true;
        state.realModel.loading = true;
        updateRealModelUi();
        setRealStatus("正在初始化 SDXS 真实文生图运行时，首次下载约 0.9 GB，可能需要较长时间。", { pct: 0 });
        try {
            const runtime = await getRealRuntime();
            setRealStatus("正在加载 SDXS 真实文生图模型，首次下载约 0.9 GB，可能需要较长时间。", { pct: 0 });
            await runtime.preloadTextToImageModel((progress) => {
                setRealStatus(describeRealProgress(progress, "正在加载 SDXS 模型"), { pct: progress?.pct });
            });
            state.realModel.ready = true;
            state.realModel.supported = true;
            state.realModel.lastResultLabel = "模型已加载，等待生成";
            setRealStatus("模型加载完成。UNet、VAE 与 CLIP 均在浏览器端运行；后端仅流式提供模型文件。", { pct: 100 });
            return true;
        } catch (error) {
            state.realModel.ready = false;
            state.realModel.lastResultLabel = "模型加载失败";
            setRealStatus(error?.message || "真实前端文生图模型加载失败。", { error: true, pct: 0 });
            throw error;
        } finally {
            state.realModel.loading = false;
            updateRealModelUi();
        }
    }

    async function generateRealImage() {
        const prompt = currentPrompt();
        if (!prompt || state.realModel.generating) return;
        const rawSeed = String(el.real.seed?.value ?? "").trim();
        const parsedSeed = Number(rawSeed);
        const seed = rawSeed && Number.isInteger(parsedSeed) ? parsedSeed : 42;
        try {
            await ensureRealModelReady();
        } catch (_error) {
            return;
        }

        const runtime = await getRealRuntime();
        state.realModel.generating = true;
        state.realModel.lastSeed = seed;
        state.realModel.lastPrompt = prompt;
        state.realModel.lastResultLabel = "正在生成";
        updateRealModelUi();
        setRealStatus("正在执行真实前端文生图推理。", { pct: 0 });

        try {
            const startedAt = performance.now();
            const blob = await runtime.textToImage(prompt, (progress) => {
                setRealStatus(describeRealProgress(progress, "正在生成图像"), { pct: progress?.pct });
            }, { seed, width: 512, height: 512 });
            if (!blob) throw new Error("模型未返回图像结果。");
            const nextUrl = URL.createObjectURL(blob);
            cleanupTeachingFrames();
            cleanupRealPreviewUrl();
            state.realModel.imageUrl = nextUrl;
            state.realModel.lastDurationMs = Math.round(performance.now() - startedAt);
            state.realModel.lastResultLabel = `${Math.max(1, Math.round(state.realModel.lastDurationMs / 1000))} 秒完成`;
            if (el.real.preview) {
                el.real.preview.innerHTML = `<img src="${escapeHtml(nextUrl)}" alt="${escapeHtml(prompt)}">`;
            }
            renderAll();
            void buildTeachingFramesFromRealImage(blob, seed);
            setRealStatus(`SDXS 真实图像生成完成，耗时约 ${Math.max(1, Math.round(state.realModel.lastDurationMs / 1000))} 秒；正在准备教学模拟中间帧。`, { pct: 100 });
        } catch (error) {
            state.realModel.lastResultLabel = error?.message === "已取消当前图片生成" ? "已取消生成" : "生成失败";
            setRealStatus(error?.message || "真实前端图像生成失败。", { error: true, pct: 0 });
            if (!state.realModel.imageUrl) {
                renderRealPlaceholder("生成未完成", "请调整 prompt、重试模型加载，或检查当前设备是否支持 WebGPU。");
            }
        } finally {
            state.realModel.generating = false;
            updateRealModelUi();
        }
    }

    async function cancelRealImageGeneration() {
        if (!state.realModel.generating) return;
        try {
            const runtime = await getRealRuntime();
            runtime.cancelTextToImageGeneration?.();
            setRealStatus("正在取消当前图片生成，请稍候。", { pct: 0 });
        } catch (error) {
            setRealStatus(error?.message || "取消生成失败。", { error: true, pct: 0 });
        }
    }

    function scheduleAutoRealGeneration() {
        const real = state.realModel;
        if (real.autoStartRequested || real.supported === false) return;
        real.autoStartRequested = true;
        window.setTimeout(() => {
            // Keep the first 0.9 GB model load asynchronous: the teaching stage
            // has already rendered and remains usable while this work proceeds.
            void generateRealImage();
        }, 0);
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
        const teachingFrame = teachingFrameFor(timestep);
        if (teachingFrame) {
            return `
                <div
                    class="diff-img diff-img--real ${teachingFrame.simulated ? "is-simulated" : "is-final"}"
                    style="--noise:${noise.toFixed(2)}"
                    aria-label="${escapeHtml(label || step.label || "真实 Diffusion 图像")}"
                >
                    <img src="${escapeHtml(teachingFrame.url)}" alt="${escapeHtml(label || step.label || "Diffusion 教学图像")}">
                    <span class="diff-teaching-image-badge">${escapeHtml(teachingFrame.label)}</span>
                </div>
            `;
        }
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
        const hasRealImage = Boolean(state.realModel.imageUrl);
        return `
            <section class="diff-sequence-panel">
                <div class="diff-panel-heading">
                    <strong>加噪 / 去噪主序列</strong>
                    <span>${state.display === "reverse" ? "x100 → x0" : "x0 → x100"}</span>
                </div>
                <p class="diff-stage-source-note ${hasRealImage ? "is-real" : ""}">
                    ${hasRealImage
                        ? "已接入本次模型真实最终图。x100 / x75 / x50 / x25 由同一 seed 与最终图合成，仅用于解释多步扩散，不是 SDXS 单步模型返回的中间输出。"
                        : "生成一次真实图像后，本区会自动替换为该结果及其教学模拟中间帧；当前为机制占位示意。"}
                </p>
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
        const noisyLabel = t > 0 ? `含噪 x_${t}` : "模型最终输出 x_0";
        const lessLabel = t > 0 ? `更少噪声 x_${nextT}` : "最终图像 x_0";
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
                        <article><strong>Text Encoder</strong><span>浏览器端 CLIP · token → embedding</span></article>
                        <div class="diff-arrow">-></div>
                        <article><strong>去噪网络</strong><span>conditioned U-Net</span></article>
                    </div>
                    <div>
                        <div class="diff-guidance-line" style="--guidance-width:${width}"><b></b></div>
                        <p class="diff-caption">${escapeHtml(guidanceDescription())}</p>
                        <p class="diff-caption">本页 guidance 用于讲解条件引导；真实 SDXS 为单步推理，只返回最终图，不提供 CFG 的逐步中间帧。</p>
                    </div>
                </div>
            </section>
        `;
    }

    function renderSamplingPanel() {
        const sample = currentSample();
        const hasRealImage = Boolean(state.realModel.imageUrl);
        const rows = hasRealImage
            ? [
                [`本次真实 seed ${state.realModel.lastSeed}`, state.realModel.lastPrompt || state.prompt, "模型最终输出", 0],
                ["教学模拟 x25", state.realModel.lastPrompt || state.prompt, "中间输出", 25],
                ["教学模拟 x50", state.realModel.lastPrompt || state.prompt, "中间输出", 50]
            ]
            : [
                ["噪声 seed A", state.prompt || "空 prompt", "结果 A", 25],
                ["噪声 seed B", state.prompt || "空 prompt", "结果 B", 0],
                ["相同 seed", `${state.prompt || "空 prompt"} + 变体`, "不同方向", 50]
            ];
        return `
            <section class="diff-sampling-panel">
                <div class="diff-panel-heading">
                    <strong>采样路径区 Sampling</strong>
                    <span>${hasRealImage ? "真实输出 + 教学帧" : "seed / prompt / guidance"}</span>
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
        if (el.summary.steps) {
            el.summary.steps.textContent = state.realModel.imageUrl
                ? "1（真实 SDXS）"
                : String(sample.samplingSteps || 30);
        }
        syncRealPromptMirror();
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
            const runtimeNote = state.realModel.ready
                ? "左侧 SDXS 控制已加载：模型返回真实最终图，主舞台所需的多步中间图会基于该结果显式模拟。"
                : state.realModel.supported === false
                    ? "当前浏览器不支持 SDXS 所需的 WebGPU / shader-f16，因此真实推理面板不可用。"
                    : "左侧真实推理控制可手动加载 SDXS，并用当前 prompt 生成真实最终图。";
            el.notes.formulaNote.textContent = `当前 noise level=${currentNoise().toFixed(2)}，guidance scale=${Number(state.guidance).toFixed(1)}。${runtimeNote}`;
        }
    }

    function renderAll() {
        renderControls();
        renderStage();
        renderPipeline();
        renderNotes();
        updateRealModelUi();
    }

    function setSample(sampleId) {
        const changed = state.sampleId !== sampleId;
        state.sampleId = sampleId;
        state.prompt = currentSample().prompt || state.prompt;
        if (changed) {
            invalidateRealResult("示例已变更，已清除上一张真实图像，请重新生成。");
        }
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
            const nextPrompt = el.prompt.value;
            const changed = state.prompt !== nextPrompt;
            state.prompt = nextPrompt;
            if (changed) {
                invalidateRealResult("Prompt 已变更，已清除上一张真实图像，请重新生成。");
            }
            renderAll();
        });
        el.real.seed?.addEventListener("input", updateRealModelUi);
        el.real.load?.addEventListener("click", () => {
            ensureRealModelReady().catch(() => {});
        });
        el.real.generate?.addEventListener("click", () => {
            generateRealImage();
        });
        el.real.cancel?.addEventListener("click", () => {
            cancelRealImageGeneration();
        });
        el.real.download?.addEventListener("click", (event) => {
            if (!state.realModel.imageUrl) event.preventDefault();
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
        scheduleAutoRealGeneration();
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
        updateRealModelUi();
        probeRealModelSupport();

        fetchJson(root.dataset.samplesUrl)
            .then(initWithData)
            .catch((error) => {
                console.warn("Diffusion 预设 JSON 加载失败，已使用内置默认数据。", error);
                initWithData(DEFAULT_DATA);
            });

        window.addEventListener("pagehide", () => {
            cleanupTeachingFrames();
            cleanupRealPreviewUrl();
            getRealRuntime()
                .then((runtime) => runtime.disposeTextToImage?.())
                .catch(() => {});
        });
    }

    init();
}());
