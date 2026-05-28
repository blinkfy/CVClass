(function () {
    "use strict";

    const root = document.getElementById("edgeDetectionPage");
    if (!root) return;

    const basePath = window.CVCLASS_BASE_PATH || "";
    const assetsBase = root.dataset.assetsBase || "";
    const samples = [
        { file: "espresso_1.jpeg", label: "咖啡" },
        { file: "bus_1.jpeg", label: "校车" },
        { file: "pizza_1.jpeg", label: "披萨" },
        { file: "bug_1.jpeg", label: "瓢虫" },
        { file: "car_1.jpeg", label: "跑车" }
    ];

    const compareTimeline = ["算子分类", "一阶导数 / 二阶导数 / Canny", "结果对比"];
    const kernelTimeline = ["Image", "Gray", "Kernel Response", "Magnitude", "Threshold", "Final"];
    const cannyTimeline = ["Image", "Gray", "Gaussian Blur", "Gradient", "Direction", "NMS", "Double Threshold", "Hysteresis"];

    const methodLabels = {
        original: "Original",
        sobel: "Sobel",
        prewitt: "Prewitt",
        roberts: "Roberts",
        kirsch: "Kirsch",
        laplacian: "Laplacian",
        LoG: "LoG / Marr",
        scharr: "Scharr",
        canny: "Canny"
    };

    const methodInfo = {
        roberts: {
            name: "Roberts",
            category: "一阶导数",
            summary: "2×2 对角梯度，速度快，定位敏感，但抗噪声弱。",
            pros: "模板小、计算快、边缘定位敏感。",
            cons: "抗噪声弱，斜向细节容易被噪声干扰。",
            best_for: "快速预览、对角边缘和低噪声图像。"
        },
        sobel: {
            name: "Sobel",
            category: "一阶导数",
            summary: "3×3 一阶梯度，含平滑权重，对噪声更稳，边缘可能较粗。",
            pros: "计算稳定，教学中最适合解释 Gx/Gy 和幅值。",
            cons: "边缘可能偏粗，方向响应有限。",
            best_for: "通用边缘检测、梯度方向入门演示。"
        },
        prewitt: {
            name: "Prewitt",
            category: "一阶导数",
            summary: "3×3 一阶梯度，结构简单，效果接近 Sobel，但平滑性略弱。",
            pros: "模板直观，便于手算和课堂推导。",
            cons: "对噪声的抑制弱于 Sobel。",
            best_for: "基础梯度算子对比。"
        },
        kirsch: {
            name: "Kirsch",
            category: "一阶导数",
            summary: "八方向模板，方向响应更丰富，适合方向边缘分析，但计算量较大。",
            pros: "方向覆盖丰富，能观察多方向边缘响应。",
            cons: "需要计算八个模板，耗时较高。",
            best_for: "方向边缘、纹理结构分析。"
        },
        laplacian: {
            name: "Laplacian",
            category: "二阶导数",
            summary: "二阶导数，对灰度突变敏感，定位较准，但对噪声敏感。",
            pros: "对突变响应强，单核即可检测多方向变化。",
            cons: "会放大噪声，通常需要先平滑。",
            best_for: "突变检测、二阶导数概念演示。"
        },
        LoG: {
            name: "LoG / Marr",
            category: "二阶导数",
            summary: "先高斯平滑再二阶检测，比 Laplacian 更抗噪，但参数影响明显。",
            pros: "兼顾平滑和二阶响应，比直接 Laplacian 稳。",
            cons: "核大小与尺度会明显影响结果。",
            best_for: "Marr-Hildreth 思路、尺度空间演示。"
        },
        scharr: {
            name: "Scharr",
            category: "一阶导数",
            summary: "增强版 3×3 梯度模板，方向一致性通常优于 Sobel。",
            pros: "方向响应更平衡，梯度强度更明显。",
            cons: "数值范围更大，需要合适归一化或阈值。",
            best_for: "Sobel 扩展对比、方向梯度演示。"
        },
        canny: {
            name: "Canny",
            category: "非微分边缘检测",
            summary: "多阶段边缘检测，边缘细且连续，抗噪声较好，但流程复杂、参数较多。",
            pros: "边缘细、连续性好，抗噪声能力较强。",
            cons: "参数较多，流程不如单个卷积核直观。",
            best_for: "高质量边缘提取、完整检测流水线演示。"
        }
    };

    const edgeKernels = {
        sobel_x: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]],
        sobel_y: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]],
        prewitt_x: [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]],
        prewitt_y: [[-1, -1, -1], [0, 0, 0], [1, 1, 1]],
        roberts_x: [[1, 0], [0, -1]],
        roberts_y: [[0, 1], [-1, 0]],
        scharr_x: [[-3, 0, 3], [-10, 0, 10], [-3, 0, 3]],
        scharr_y: [[-3, -10, -3], [0, 0, 0], [3, 10, 3]],
        laplacian: [[0, 1, 0], [1, -4, 1], [0, 1, 0]],
        LoG: [[0, 0, -1, 0, 0], [0, -1, -2, -1, 0], [-1, -2, 16, -2, -1], [0, -1, -2, -1, 0], [0, 0, -1, 0, 0]],
        kirsch_n: [[-3, -3, 5], [-3, 0, 5], [-3, -3, 5]]
    };

    const stepNotes = {
        original: "原始输入图像，后续步骤会在保持比例的基础上显示完整图像。",
        gray: "RGB 图像按加权法转换为单通道灰度。",
        gx: "水平方向模板响应，强调左右灰度变化。",
        gy: "垂直方向模板响应，强调上下灰度变化。",
        response: "卷积核对灰度突变位置产生强响应。",
        magnitude: "用 Gx 和 Gy 或单核绝对响应得到边缘强度。",
        threshold: "响应值大于阈值的像素保留为边缘。",
        final: "最终边缘图由后端 image_utils 中的手写函数输出。",
        blur: "先用高斯核平滑噪声，降低误检。",
        gradient: "Sobel 计算梯度强度。",
        direction: "atan2(Gy, Gx) 得到梯度方向。",
        nms: "沿梯度方向保留局部最大响应，使粗边缘变细。",
        double: "strong / weak / suppressed 三类像素分离。",
        hysteresis: "从强边缘出发搜索 8 邻域弱边缘，保留连通边缘。"
    };

    const cannyStepDetails = {
        original: {
            process: "原始输入图像，Canny 后续步骤都从这张图开始计算。",
            formula: "Input: RGB image"
        },
        gray: {
            process: "将彩色图像转换为单通道灰度图，后续滤波和梯度计算都在灰度空间完成。",
            formula: "Gray = 0.299R + 0.587G + 0.114B"
        },
        blur: {
            process: "Gaussian Blur 用高斯核平滑图像，降低噪声对梯度和边缘判断的干扰。",
            formula: "Gσ(x,y) = exp(-(x² + y²) / (2σ²))\nBlur = Gray * Gσ"
        },
        gradient: {
            process: "使用 Sobel 计算 Gx / Gy，并由它们得到梯度幅值。幅值越大，表示灰度变化越强。",
            formula: "Gx = Blur * SobelX\nGy = Blur * SobelY\nMagnitude = sqrt(Gx² + Gy²) 或 |Gx| + |Gy|"
        },
        direction: {
            process: "使用 atan2(Gy, Gx) 得到梯度方向。页面中的箭头方向表示灰度变化最强方向，箭头长度表示归一化梯度幅值。",
            formula: "Direction = atan2(Gy, Gx) × 180 / π\nDirection ∈ [0°, 180°)"
        },
        nms: {
            process: "Non-Maximum Suppression 沿梯度方向比较相邻响应，只保留局部最大值，使粗边缘变细。",
            formula: "Keep p if Magnitude(p) >= neighbors along Direction(p)\nOtherwise suppress to 0"
        },
        double: {
            process: "双阈值把 NMS 响应分成 strong、weak、suppressed 三类，为滞后连接做准备。",
            formula: "strong: NMS >= high\nweak: low <= NMS < high\nsuppressed: NMS < low"
        },
        hysteresis: {
            process: "从强边缘出发搜索 8 邻域弱边缘，只保留与强边缘连通的弱边缘，形成最终连续边缘。",
            formula: "Start from strong pixels\nDFS/BFS over 8-neighborhood weak pixels\nFinal = connected strong + weak"
        }
    };

    const cannyFormulaHighlights = {
        blur: 1,
        gradient: 2,
        direction: 0,
        nms: 0,
        double: 0,
        hysteresis: 1
    };

    const cannyFormulaOverrides = {
        nms: "沿梯度方向保留局部最大值\nOtherwise suppress to 0"
    };

    const stepAnimationClasses = {
        gray: "is-anim-gray",
        blur: "is-anim-blur",
        gradient: "is-anim-gradient",
        nms: "is-anim-nms",
        double: "is-anim-double",
        hysteresis: "is-anim-hysteresis"
    };

    const els = {
        panels: root.querySelectorAll("[data-panel]"),
        imageInput: document.getElementById("edgeImageInput"),
        imageName: document.getElementById("edgeImageName"),
        samples: document.getElementById("edgeSamples"),
        status: document.getElementById("edgeStatus"),
        stageEyebrow: document.getElementById("edgeStageEyebrow"),
        stageTitle: document.getElementById("edgeStageTitle"),
        compareView: document.getElementById("edgeCompareView"),
        pipelineView: document.getElementById("edgePipelineView"),
        compareWall: document.getElementById("edgeCompareWall"),
        compareInsightsCard: document.getElementById("edgeCompareInsightsCard"),
        compareInsights: document.getElementById("edgeCompareInsights"),
        compareA: document.getElementById("edgeCompareA"),
        compareB: document.getElementById("edgeCompareB"),
        compareBtn: document.getElementById("edgeCompareBtn"),
        compareThreshold: document.getElementById("edgeCompareThreshold"),
        compareThresholdValue: document.getElementById("edgeCompareThresholdValue"),
        compareAperture: document.getElementById("edgeCompareAperture"),
        compareThreshold1: document.getElementById("edgeCompareThreshold1"),
        compareThreshold2: document.getElementById("edgeCompareThreshold2"),
        compareThreshold1Value: document.getElementById("edgeCompareT1Value"),
        compareThreshold2Value: document.getElementById("edgeCompareT2Value"),
        compareL2: document.getElementById("edgeCompareL2"),
        comparePrecise: document.getElementById("edgeComparePrecise"),
        sliderLeft: document.getElementById("edgeSliderLeft"),
        sliderRight: document.getElementById("edgeSliderRight"),
        sliderClip: document.getElementById("edgeSliderClip"),
        sliderRange: document.getElementById("edgeSliderRange"),
        sliderHandle: document.getElementById("edgeSliderHandle"),
        sliderLeftLabel: document.getElementById("edgeSliderLeftLabel"),
        sliderRightLabel: document.getElementById("edgeSliderRightLabel"),
        kernelMethod: document.getElementById("edgeKernelMethod"),
        kernelDisplay: document.getElementById("edgeKernelDisplay"),
        threshold: document.getElementById("edgeThreshold"),
        thresholdValue: document.getElementById("edgeThresholdValue"),
        kernelBtn: document.getElementById("edgeKernelBtn"),
        kernelCategoryNote: document.getElementById("edgeKernelCategoryNote"),
        aperture: document.getElementById("edgeAperture"),
        threshold1: document.getElementById("edgeThreshold1"),
        threshold2: document.getElementById("edgeThreshold2"),
        threshold1Value: document.getElementById("edgeT1Value"),
        threshold2Value: document.getElementById("edgeT2Value"),
        l2: document.getElementById("edgeL2"),
        precise: document.getElementById("edgePrecise"),
        cannyBtn: document.getElementById("edgeCannyBtn"),
        mainImageButton: document.getElementById("edgeMainImageButton"),
        mainBaseImage: document.getElementById("edgeMainBaseImage"),
        mainImage: document.getElementById("edgeMainImage"),
        vectorCanvas: document.getElementById("edgeVectorCanvas"),
        thumbs: document.getElementById("edgeStepThumbs"),
        stageMeta: document.getElementById("edgeStageMeta"),
        stageMetaTitle: document.getElementById("edgeStageMetaTitle"),
        stageKernelExplain: document.getElementById("edgeStageKernelExplain"),
        stageKernelMini: document.getElementById("edgeStageKernelMini"),
        stageResponseRange: document.getElementById("edgeStageResponseRange"),
        stageThresholdMeta: document.getElementById("edgeStageThresholdMeta"),
        stageEdgeRatio: document.getElementById("edgeStageEdgeRatio"),
        stageProbePrompt: document.getElementById("edgeStageProbePrompt"),
        kernelTeaching: document.getElementById("edgeKernelTeaching"),
        kernelProbeBadge: document.getElementById("edgeKernelProbeBadge"),
        kernelProcessCards: document.getElementById("edgeKernelProcessCards"),
        kernelFlowTitle: document.getElementById("edgeKernelFlowTitle"),
        timeline: document.getElementById("edgeTimeline"),
        playControls: root.querySelector(".edge-play-controls"),
        infoTitle: document.getElementById("edgeInfoTitle"),
        infoText: document.getElementById("edgeInfoText"),
        formula: document.getElementById("edgeFormula"),
        kernelBox: document.getElementById("edgeKernelBox"),
        stats: document.getElementById("edgeStats"),
        probeCard: root.querySelector(".edge-probe-card"),
        probeHint: document.getElementById("edgeProbeHint"),
        probeBox: document.getElementById("edgeProbeBox")
    };

    const state = {
        tab: root.dataset.edgeMode || "compare",
        sample: "espresso_1.jpeg",
        file: null,
        data: null,
        stepIndex: 0,
        timelineIndex: 0,
        timer: null,
        refreshTimer: null,
        loading: false,
        lastProbe: null
    };

    function endpoint(path) {
        return `${basePath}${path}`;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function renderFormula(text, highlightIndex = -1) {
        if (!els.formula) return;
        const lines = String(text || "-").split("\n");
        els.formula.innerHTML = lines.map((line, index) => (
            `<span class="edge-formula-line ${index === highlightIndex ? "is-active" : ""}">${escapeHtml(line)}</span>`
        )).join("");
    }

    function matrixHtml(matrix) {
        if (!Array.isArray(matrix) || !matrix.length) {
            return "-";
        }
        const rows = matrix.length;
        const cols = Array.isArray(matrix[0]) ? matrix[0].length : 1;
        const cells = matrix.flat().map((value) => `<span class="edge-kernel-cell">${Number(value).toFixed(Math.abs(value) >= 10 ? 0 : 1)}</span>`).join("");
        return `<div class="edge-kernel-matrix" style="grid-template-columns: repeat(${cols}, 32px)" data-rows="${rows}">${cells}</div>`;
    }

    function infoFor(method) {
        return methodInfo[method] || { name: methodLabels[method] || method, category: "-", summary: "", pros: "-", cons: "-", best_for: "-" };
    }

    function kernelsFor(method) {
        if (["sobel", "prewitt", "roberts", "scharr"].includes(method)) {
            return { x: edgeKernels[`${method}_x`], y: edgeKernels[`${method}_y`] };
        }
        if (method === "kirsch") {
            return { single: edgeKernels.kirsch_n };
        }
        if (method === "laplacian" || method === "LoG") {
            return { single: edgeKernels[method] };
        }
        return {};
    }

    function kernelTeachingProfile(method) {
        const info = infoFor(method);
        if (["sobel", "prewitt", "roberts", "scharr"].includes(method)) {
            return {
                category: "一阶导数",
                core: "Gx / Gy 双方向响应",
                output: "响应图、幅值图、阈值边缘图",
                summary: info.summary || "通过水平和垂直方向差分估计局部灰度变化。"
            };
        }
        if (["laplacian", "LoG"].includes(method)) {
            return {
                category: "二阶导数",
                core: "单核二阶响应",
                output: "响应图、绝对响应图、阈值边缘图",
                summary: info.summary || "通过二阶变化突出灰度突变区域。"
            };
        }
        if (method === "kirsch") {
            return {
                category: "一阶导数 / 多方向",
                core: "8 方向响应取最大值",
                output: "方向响应图、幅值图、阈值边缘图",
                summary: info.summary || "用多个方向模板寻找最强边缘方向。"
            };
        }
        return {
            category: info.category || "-",
            core: "局部响应",
            output: "响应图、幅值图、阈值边缘图",
            summary: info.summary || "选择算子后显示该算子的教学说明。"
        };
    }

    function updateKernelCategoryNote(method = currentMethod()) {
        if (!els.kernelCategoryNote) return;
        const profile = kernelTeachingProfile(method);
        els.kernelCategoryNote.innerHTML = `
            <span><strong>类别：</strong>${escapeHtml(profile.category)}</span>
            <span><strong>核心：</strong>${escapeHtml(profile.core)}</span>
            <span><strong>输出：</strong>${escapeHtml(profile.output)}</span>
        `;
    }

    function controlValue(control, fallback) {
        return control ? control.value : fallback;
    }

    function controlChecked(control) {
        return Boolean(control && control.checked);
    }

    function on(control, eventName, handler) {
        if (control) {
            control.addEventListener(eventName, handler);
        }
    }

    function renderSamples() {
        els.samples.innerHTML = samples.map((sample) => `
            <button class="edge-sample-btn ${state.sample === sample.file && !state.file ? "is-active" : ""}" type="button" data-sample="${sample.file}" title="${sample.label}">
                <img src="${assetsBase}${sample.file}" alt="${sample.label}">
            </button>
        `).join("");
    }

    function currentMethod() {
        return state.tab === "canny" ? "canny" : controlValue(els.kernelMethod, "sobel");
    }

    function buildForm(mode) {
        const form = new FormData();
        form.append("mode", mode);
        form.append("sample", state.sample);
        if (state.file) {
            form.append("image", state.file);
        }
        form.append("method", currentMethod());
        if (mode === "compare") {
            form.append("threshold", controlValue(els.compareThreshold, "96"));
            form.append("threshold1", controlValue(els.compareThreshold1, "50"));
            form.append("threshold2", controlValue(els.compareThreshold2, "150"));
            form.append("apertureSize", controlValue(els.compareAperture, "5"));
            form.append("L2gradient", controlChecked(els.compareL2) ? "true" : "false");
            form.append("precise", controlChecked(els.comparePrecise) ? "true" : "false");
        } else {
            form.append("threshold", controlValue(els.threshold, "96"));
            form.append("threshold1", controlValue(els.threshold1, "50"));
            form.append("threshold2", controlValue(els.threshold2, "150"));
            form.append("apertureSize", controlValue(els.aperture, "5"));
            form.append("L2gradient", controlChecked(els.l2) ? "true" : "false");
            form.append("precise", controlChecked(els.precise) ? "true" : "false");
        }
        return form;
    }

    function setLoading(message) {
        state.loading = true;
        els.status.textContent = message;
    }

    function setReady(message) {
        state.loading = false;
        els.status.textContent = message;
    }

    function scheduleRefresh(mode = state.tab) {
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
        }
        state.refreshTimer = window.setTimeout(() => {
            state.refreshTimer = null;
            requestEdge(mode);
        }, 180);
    }

    async function requestEdge(mode) {
        clearPlayback();
        state.lastProbe = null;
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
        const previousStepIndex = state.stepIndex;
        const previousStep = state.tab === mode ? state.data?.pipeline?.steps?.[state.stepIndex] : null;
        const previousStepKey = previousStep?.key || null;
        state.tab = mode;
        setLoading("正在调用后端手写 NumPy 边缘检测函数...");
        try {
            const response = await fetch(endpoint("/api/edge-detect"), {
                method: "POST",
                body: buildForm(mode)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "边缘检测失败");
            }
            state.data = data;
            if (mode !== "compare" && data.pipeline?.steps?.length) {
                const steps = data.pipeline.steps;
                const sameKeyIndex = previousStepKey
                    ? steps.findIndex((step) => step.key === previousStepKey)
                    : -1;
                state.stepIndex = sameKeyIndex >= 0
                    ? sameKeyIndex
                    : Math.min(previousStepIndex, steps.length - 1);
                state.timelineIndex = Math.min(
                    (mode === "canny" ? cannyTimeline : kernelTimeline).length - 1,
                    state.stepIndex
                );
            } else {
                state.stepIndex = 0;
                state.timelineIndex = 0;
            }
            render();
            setReady(`处理完成：${data.info.filename}，${data.info.width} × ${data.info.height}，总耗时 ${data.elapsed_ms} ms`);
        } catch (error) {
            setReady(error.message || "边缘检测失败");
        }
    }

    function resultByMethod(method) {
        if (!state.data) return null;
        if (method === "original") {
            return { method: "original", info: { name: "Original" }, final: state.data.original };
        }
        return (state.data.compare || []).find((item) => item.method === method) || null;
    }

    function updateSlider() {
        const pos = Number(els.sliderRange.value);
        els.sliderClip.style.clipPath = `inset(0 0 0 ${pos}%)`;
        els.sliderHandle.style.left = `${pos}%`;
    }

    function renderCompareSlider() {
        const leftMethod = els.compareA.value;
        const rightMethod = els.compareB.value;
        const left = resultByMethod(leftMethod);
        const right = resultByMethod(rightMethod);
        if (!left || !right) return;
        els.sliderLeft.src = left.final;
        els.sliderRight.src = right.final;
        els.sliderLeftLabel.textContent = methodLabels[leftMethod] || left.info.name;
        els.sliderRightLabel.textContent = methodLabels[rightMethod] || right.info.name;
        updateSlider();
    }

    function renderCompareWall() {
        const results = state.data?.compare || [];
        els.compareWall.innerHTML = results.map((item) => {
            const info = infoFor(item.method);
            return `
            <button class="edge-algo-card" type="button" data-compare-method="${item.method}">
                <img src="${item.final}" alt="${escapeHtml(info.name)} 边缘图">
                <div>
                    <h3>${escapeHtml(info.name)}</h3>
                    <span class="edge-tag">${escapeHtml(info.category)}</span>
                </div>
                <div class="edge-mini-meta">
                    <span>${item.elapsed_ms} ms</span>
                    <span>${item.edge_ratio}% edge</span>
                </div>
            </button>
        `;
        }).join("");
    }

    function renderCompareInsights() {
        if (!els.compareInsights) return;
        const leftMethod = els.compareA.value;
        const rightMethod = els.compareB.value;
        if (leftMethod === "original" || rightMethod === "original") {
            const order = ["roberts", "sobel", "prewitt", "kirsch", "laplacian", "LoG", "canny"];
            els.compareInsights.innerHTML = `
                <div class="edge-compare-overview">
                    ${order.map((key) => {
                        const info = infoFor(key);
                        const result = resultByMethod(key);
                        return `
                            <article class="edge-compare-overview-row">
                                <header>
                                    <strong>${escapeHtml(info.name)}</strong>
                                    <span class="edge-tag">${escapeHtml(info.category)}</span>
                                </header>
                                <p>${escapeHtml(info.summary)}</p>
                                <div class="edge-mini-meta">
                                    <span>${result ? `${result.elapsed_ms} ms` : "-"}</span>
                                    <span>${result ? `${result.edge_ratio}% edge` : "-"}</span>
                                </div>
                            </article>
                        `;
                    }).join("")}
                </div>
            `;
            return;
        }
        const leftInfo = infoFor(leftMethod);
        const rightInfo = infoFor(rightMethod);
        const leftResult = resultByMethod(leftMethod);
        const rightResult = resultByMethod(rightMethod);
        const rows = [
            ["类别", leftInfo.category, rightInfo.category],
            ["特点", leftInfo.summary, rightInfo.summary],
            ["优点", leftInfo.pros, rightInfo.pros],
            ["缺点", leftInfo.cons, rightInfo.cons],
            ["适用场景", leftInfo.best_for, rightInfo.best_for],
            ["耗时", leftResult ? `${leftResult.elapsed_ms} ms` : "-", rightResult ? `${rightResult.elapsed_ms} ms` : "-"],
            ["边缘占比", leftResult ? `${leftResult.edge_ratio}%` : "-", rightResult ? `${rightResult.edge_ratio}%` : "-"]
        ];
        els.compareInsights.innerHTML = `
            <div class="edge-compare-insight-grid">
                <article class="edge-compare-insight-col">
                    <header>
                        <strong>${escapeHtml(leftInfo.name)}</strong>
                        <span class="edge-tag">${escapeHtml(leftInfo.category)}</span>
                    </header>
                    ${rows.map(([label, leftValue]) => `
                        <div class="edge-compare-insight-row">
                            <span>${escapeHtml(label)}</span>
                            <p>${escapeHtml(leftValue)}</p>
                        </div>
                    `).join("")}
                </article>
                <article class="edge-compare-insight-col">
                    <header>
                        <strong>${escapeHtml(rightInfo.name)}</strong>
                        <span class="edge-tag">${escapeHtml(rightInfo.category)}</span>
                    </header>
                    ${rows.map(([label, , rightValue]) => `
                        <div class="edge-compare-insight-row">
                            <span>${escapeHtml(label)}</span>
                            <p>${escapeHtml(rightValue)}</p>
                        </div>
                    `).join("")}
                </article>
            </div>
        `;
    }

    function renderCompare() {
        els.compareView.hidden = false;
        els.pipelineView.hidden = true;
        if (els.probeCard) {
            els.probeCard.hidden = true;
        }
        els.stageEyebrow.textContent = "Compare";
        els.stageTitle.textContent = "算法对比";
        renderCompareSlider();
        renderCompareWall();
        renderCompareInsights();
        updateInfoForCompare();
    }

    function stepForTimelineLabel(label, pipeline) {
        const steps = pipeline?.steps || [];
        const map = {
            Image: "original",
            Gray: "gray",
            "Kernel Response": "response",
            Magnitude: "magnitude",
            Threshold: "threshold",
            Final: "final",
            "Gaussian Blur": "blur",
            Gradient: "gradient",
            Direction: "direction",
            NMS: "nms",
            "Double Threshold": "double",
            Hysteresis: "hysteresis"
        };
        const key = map[label];
        const index = steps.findIndex((step) => step.key === key || step.label === label);
        return index >= 0 ? index : Math.max(0, steps.length - 1);
    }

    function clearDirectionVectors() {
        els.mainImageButton.classList.remove("is-vector-mode");
        if (!els.vectorCanvas) return;
        const context = els.vectorCanvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, els.vectorCanvas.width, els.vectorCanvas.height);
        }
    }

    function applyStepAnimation(stepKey) {
        if (!els.mainImageButton) return;
        Object.values(stepAnimationClasses).forEach((className) => {
            els.mainImageButton.classList.remove(className);
        });
        const animationClass = stepAnimationClasses[stepKey];
        if (!animationClass) return;
        void els.mainImageButton.offsetWidth;
        els.mainImageButton.classList.add(animationClass);
    }

    function previousDisplayStep(pipeline, stepIndex) {
        const previous = pipeline.steps[Math.max(0, stepIndex - 1)];
        return previous || pipeline.steps[stepIndex] || pipeline.steps[0];
    }

    function renderStepImage(pipeline, step) {
        const previousStep = previousDisplayStep(pipeline, state.stepIndex);
        const shouldHoldCurrent = step.key === "nms" && previousStep?.key === "direction";
        const baseImage = step.key === "original" || shouldHoldCurrent ? step.image : previousStep.image;
        if (els.mainBaseImage) {
            els.mainBaseImage.src = baseImage;
            els.mainBaseImage.hidden = step.key === "original";
        }
        els.mainImage.src = step.image;
    }

    function drawDirectionVectors(step) {
        const field = step?.vector_field;
        const canvas = els.vectorCanvas;
        if (!canvas || !field?.vectors?.length || !field.width || !field.height) {
            clearDirectionVectors();
            return;
        }

        const rect = els.mainImageButton.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(rect.width * ratio));
        canvas.height = Math.max(1, Math.round(rect.height * ratio));
        const context = canvas.getContext("2d");
        if (!context) return;

        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);

        const scale = Math.min(rect.width / field.width, rect.height / field.height);
        const drawW = field.width * scale;
        const drawH = field.height * scale;
        const offsetX = (rect.width - drawW) / 2;
        const offsetY = (rect.height - drawH) / 2;

        context.strokeStyle = "rgba(148, 163, 184, 0.18)";
        context.lineWidth = 1;
        for (let x = offsetX; x <= offsetX + drawW; x += Math.max(24, drawW / 12)) {
            context.beginPath();
            context.moveTo(x, offsetY);
            context.lineTo(x, offsetY + drawH);
            context.stroke();
        }
        for (let y = offsetY; y <= offsetY + drawH; y += Math.max(24, drawH / 12)) {
            context.beginPath();
            context.moveTo(offsetX, y);
            context.lineTo(offsetX + drawW, y);
            context.stroke();
        }

        field.vectors.forEach((vector) => {
            const x = offsetX + vector.x * scale;
            const y = offsetY + vector.y * scale;
            const angle = Number(vector.angle) * Math.PI / 180;
            const magnitude = Math.max(0.08, Math.min(1, Number(vector.magnitude) || 0));
            const length = (10 + magnitude * 22) * Math.max(0.9, Math.min(1.35, scale));
            const dx = Math.cos(angle) * length;
            const dy = Math.sin(angle) * length;
            const x1 = x - dx * 0.5;
            const y1 = y - dy * 0.5;
            const x2 = x + dx * 0.5;
            const y2 = y + dy * 0.5;
            const head = Math.min(8, Math.max(4, length * 0.26));
            const alpha = 0.55 + magnitude * 0.45;

            context.strokeStyle = "rgba(255, 255, 255, 0.92)";
            context.lineWidth = 4 + magnitude * 2.2;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.stroke();

            context.strokeStyle = `rgba(29, 78, 216, ${alpha})`;
            context.lineWidth = 1.8 + magnitude * 2.2;
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.stroke();

            context.fillStyle = "rgba(255, 255, 255, 0.92)";
            context.beginPath();
            context.moveTo(x2, y2);
            context.lineTo(x2 - Math.cos(angle - Math.PI / 6) * (head + 1), y2 - Math.sin(angle - Math.PI / 6) * (head + 1));
            context.lineTo(x2 - Math.cos(angle + Math.PI / 6) * (head + 1), y2 - Math.sin(angle + Math.PI / 6) * (head + 1));
            context.closePath();
            context.fill();

            context.fillStyle = `rgba(14, 116, 233, ${alpha})`;
            context.beginPath();
            context.moveTo(x2, y2);
            context.lineTo(x2 - Math.cos(angle - Math.PI / 6) * head, y2 - Math.sin(angle - Math.PI / 6) * head);
            context.lineTo(x2 - Math.cos(angle + Math.PI / 6) * head, y2 - Math.sin(angle + Math.PI / 6) * head);
            context.closePath();
            context.fill();
        });

        context.fillStyle = "#0f172a";
        context.font = "700 12px Consolas, 'Microsoft YaHei', monospace";
        context.fillText("angle = atan2(Gy, Gx), arrow length = normalized magnitude", offsetX + 12, offsetY + 22);
        els.mainImageButton.classList.add("is-vector-mode");
    }

    function renderPipeline() {
        const pipeline = state.data?.pipeline;
        if (!pipeline) return;
        els.compareView.hidden = true;
        els.pipelineView.hidden = false;
        if (els.probeCard) {
            els.probeCard.hidden = state.tab !== "kernel";
        }
        if (els.kernelTeaching) {
            els.kernelTeaching.hidden = state.tab !== "kernel";
        }
        if (els.kernelFlowTitle) {
            els.kernelFlowTitle.hidden = state.tab === "compare";
            els.kernelFlowTitle.querySelector("strong").textContent = state.tab === "canny" ? "CANNY FLOW:" : "KERNEL FLOW:";
            els.kernelFlowTitle.querySelector("span").textContent = state.tab === "canny"
                ? "Image → Gray → Gaussian Blur → Gradient → Direction → NMS → Double Threshold → Hysteresis"
                : "Image → Gray → Gx → Gy → Magnitude → Threshold → Final";
        }
        const step = pipeline.steps[state.stepIndex] || pipeline.steps[0];
        const info = infoFor(pipeline.method);
        els.stageEyebrow.textContent = state.tab === "canny" ? "Canny Pipeline" : "Kernel Operator";
        els.stageTitle.textContent = `${info.name} · ${step.label}`;
        if (step.key === "direction" && state.tab === "canny") {
            const previousStep = pipeline.steps[Math.max(0, state.stepIndex - 1)];
            if (els.mainBaseImage) {
                els.mainBaseImage.src = previousStep?.image || step.image;
                els.mainBaseImage.hidden = false;
            }
            els.mainImage.src = previousStep?.image || step.image;
            window.requestAnimationFrame(() => drawDirectionVectors(step));
        } else {
            clearDirectionVectors();
            renderStepImage(pipeline, step);
        }
        applyStepAnimation(step.key);
        els.thumbs.innerHTML = pipeline.steps.map((item, index) => `
            <button class="edge-step-thumb ${index === state.stepIndex ? "is-active" : ""}" type="button" data-step-index="${index}">
                ${index === state.stepIndex ? `<em>CURRENT</em>` : ""}
                <img src="${item.image}" alt="${escapeHtml(item.label)}">
                <span>${escapeHtml(item.label)}</span>
            </button>
        `).join("");
        els.timeline.innerHTML = "";
        updateStageMeta(pipeline);
        if (state.tab === "kernel" && !state.lastProbe) {
            renderKernelTeachingExample(pipeline.method);
        }
        updateInfoForPipeline(pipeline, step);
    }

    function renderTimeline(items) {
        els.timeline.innerHTML = items.map((item, index) => `
            <button class="${index === state.timelineIndex ? "is-active" : ""}" type="button" data-timeline-index="${index}">
                ${escapeHtml(item)}
            </button>
        `).join("");
    }

    function kernelFormula(method) {
        if (method === "canny") {
            return "1) Gaussian blur\n2) G = sqrt(Gx² + Gy²) 或 |Gx| + |Gy|\n3) NMS\n4) Double threshold + hysteresis";
        }
        if (["sobel", "prewitt", "roberts", "scharr"].includes(method)) {
            return "Gx = X * Kx\nGy = X * Ky\nMagnitude = sqrt(Gx² + Gy²)\nEdge = Magnitude >= threshold";
        }
        if (method === "kirsch") {
            return "Response = max(Kn, Kne, Ke, Kse, Ks, Ksw, Kw, Knw)\nEdge = Response >= threshold";
        }
        return "Response = |X * K|\nEdge = Response >= threshold";
    }

    function renderKernelBox(info) {
        const method = info?.method;
        if (!method) {
            els.kernelBox.textContent = "-";
            return;
        }
        const kernels = kernelsFor(method);
        if (kernels.x || kernels.y) {
            els.kernelBox.innerHTML = `
                <span>Kx</span>${matrixHtml(kernels.x)}
                <span>Ky</span>${matrixHtml(kernels.y)}
            `;
            return;
        }
        if (kernels.single) {
            els.kernelBox.innerHTML = matrixHtml(kernels.single);
            return;
        }
        els.kernelBox.textContent = method === "canny" ? "Canny 使用高斯核、Sobel 核、NMS 和双阈值，不是单一卷积核。" : "-";
    }

    function updateInfoForCompare() {
        const leftMethod = els.compareA?.value || "original";
        const rightMethod = els.compareB?.value || "sobel";
        const selectedMethod = rightMethod !== "original" ? rightMethod : (leftMethod !== "original" ? leftMethod : "sobel");
        const selectedInfo = infoFor(selectedMethod);
        const selectedResult = resultByMethod(selectedMethod);
        els.infoTitle.textContent = `当前选中算法 · ${selectedInfo.name}`;
        els.infoText.innerHTML = `
            <span><strong>类别：</strong>${escapeHtml(selectedInfo.category)}</span>
            <span><strong>特点：</strong>${escapeHtml(selectedInfo.summary)}</span>
            <span><strong>优点：</strong>${escapeHtml(selectedInfo.pros)}</span>
            <span><strong>缺点：</strong>${escapeHtml(selectedInfo.cons)}</span>
            <span><strong>适用：</strong>${escapeHtml(selectedInfo.best_for)}</span>
        `;
        renderFormula(kernelFormula(selectedMethod));
        if (els.kernelBox) {
            els.kernelBox.textContent = `${selectedInfo.name} 的算子细节在中间下方的“算子特点对比”中展示。`;
        }
        const info = state.data?.info || {};
        els.stats.innerHTML = `
            <span>总耗时：${state.data?.elapsed_ms ?? "-"} ms</span>
            <span>输出尺寸：${info.width || "-"} × ${info.height || "-"}</span>
            <span>当前选中：${selectedInfo.name}</span>
            <span>处理耗时：${selectedResult ? `${selectedResult.elapsed_ms} ms` : "-"}</span>
            <span>边缘占比：${selectedResult ? `${selectedResult.edge_ratio}%` : "-"}</span>
        `;
    }

    function updateInfoForPipeline(pipeline, step) {
        const info = infoFor(pipeline.method);
        const cannyDetail = pipeline.method === "canny" ? cannyStepDetails[step.key] : null;
        els.infoTitle.textContent = `${info.name} · ${step.label}`;
        els.infoText.textContent = cannyDetail?.process || stepNotes[step.key] || info.summary;
        renderFormula(cannyFormulaOverrides[step.key] || cannyDetail?.formula || kernelFormula(pipeline.method), cannyFormulaHighlights[step.key] ?? -1);
        renderKernelBox(pipeline.info);
        const meta = state.data?.info || {};
        els.stats.innerHTML = `
            <span>总耗时：${state.data?.elapsed_ms ?? "-"} ms</span>
            <span>边缘像素占比：${pipeline.edge_ratio}%</span>
            <span>输出尺寸：${meta.width || "-"} × ${meta.height || "-"}</span>
            <span>响应范围：${pipeline.stats.min} ~ ${pipeline.stats.max}</span>
        `;
    }

    function render() {
        if (!state.data) return;
        if (state.tab === "compare") {
            renderCompare();
        } else {
            renderPipeline();
        }
    }

    function moveStep(delta) {
        if (state.tab === "compare") {
            const length = compareTimeline.length;
            state.timelineIndex = (state.timelineIndex + delta + length) % length;
            renderTimeline(compareTimeline);
            return;
        }
        const pipeline = state.data?.pipeline;
        if (!pipeline) return;
        const length = pipeline.steps.length;
        state.stepIndex = (state.stepIndex + delta + length) % length;
        const activeTimeline = state.tab === "canny" ? cannyTimeline : kernelTimeline;
        state.timelineIndex = Math.min(activeTimeline.length - 1, state.stepIndex);
        renderPipeline();
    }

    function clearPlayback() {
        if (state.timer) {
            window.clearInterval(state.timer);
            state.timer = null;
        }
    }

    function togglePlayback() {
        if (state.timer) {
            clearPlayback();
            return;
        }
        state.timer = window.setInterval(() => moveStep(1), 1100);
    }

    function resetTimeline() {
        clearPlayback();
        state.stepIndex = 0;
        state.timelineIndex = 0;
        render();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function loadGrayMatrix(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) {
                    reject(new Error("浏览器不支持 Canvas 2D 上下文"));
                    return;
                }
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
                const gray = [];
                for (let row = 0; row < canvas.height; row += 1) {
                    const line = [];
                    for (let col = 0; col < canvas.width; col += 1) {
                        const index = (row * canvas.width + col) * 4;
                        line.push(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
                    }
                    gray.push(line);
                }
                resolve({ gray, width: canvas.width, height: canvas.height });
            };
            image.onerror = () => reject(new Error("探针无法读取当前原图"));
            image.src = src;
        });
    }

    function patchFor(gray, x, y, size) {
        const pad = Math.floor(size / 2);
        const height = gray.length;
        const width = gray[0]?.length || 0;
        return Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, col) => {
                const yy = clamp(y + row - pad, 0, height - 1);
                const xx = clamp(x + col - pad, 0, width - 1);
                return gray[yy][xx];
            })
        );
    }

    function multiplyMatrix(a, b) {
        return a.map((row, r) => row.map((value, c) => value * b[r][c]));
    }

    function sumMatrix(matrix) {
        return matrix.reduce((total, row) => total + row.reduce((rowTotal, value) => rowTotal + value, 0), 0);
    }

    function compactMatrixHtml(matrix, label) {
        return `
            <div class="edge-process-matrix-wrap">
                <strong>${escapeHtml(label)}</strong>
                ${matrixHtml(matrix)}
            </div>
        `;
    }

    function staticProbeFor(method = currentMethod()) {
        const kernels = kernelsFor(method);
        const primaryKernel = kernels.x || kernels.single || edgeKernels.sobel_x;
        const secondaryKernel = kernels.y || null;
        const patch = primaryKernel.length === 5
            ? [
                [118, 121, 127, 135, 142],
                [112, 119, 130, 145, 156],
                [104, 116, 138, 164, 178],
                [96, 110, 132, 158, 186],
                [90, 104, 124, 150, 176]
            ]
            : primaryKernel.length === 2
                ? [[120, 156], [112, 178]]
                : [[118, 126, 139], [110, 132, 166], [96, 120, 181]];
        const product = multiplyMatrix(patch, primaryKernel);
        const gx = sumMatrix(product);
        let gy = 0;
        let magnitude = Math.abs(gx);
        if (secondaryKernel) {
            gy = sumMatrix(multiplyMatrix(patch, secondaryKernel));
            magnitude = Math.hypot(gx, gy);
        }
        const threshold = Number(controlValue(els.threshold, "96"));
        return {
            x: "示例",
            y: "像素",
            patch,
            primaryKernel,
            product,
            gx,
            gy,
            hasSecondary: Boolean(secondaryKernel),
            magnitude,
            threshold,
            isEdge: magnitude >= threshold,
            responseLabel: secondaryKernel ? `sqrt(Gx² + Gy²) = ${magnitude.toFixed(2)}` : `|sum| = ${magnitude.toFixed(2)}`,
            isExample: true
        };
    }

    function renderKernelTeachingExample(method = currentMethod()) {
        renderKernelProcessCards(staticProbeFor(method));
        if (els.kernelProbeBadge) {
            els.kernelProbeBadge.textContent = "静态教学示例";
        }
    }

    function renderKernelTeachingEmpty(message = "点击主图中的任意像素，前端会取该位置邻域 Patch，乘以当前 Kernel，展示乘积矩阵、求和响应和阈值判断。") {
        if (!els.kernelProcessCards) return;
        els.kernelProcessCards.innerHTML = `
            <article class="edge-process-card is-empty">
                <span>Probe Hint</span>
                <p>${escapeHtml(message)}</p>
            </article>
            ${["Patch × Kernel", "Product", "Sum", "Response", "Threshold"].map((label) => `
                <article class="edge-process-card is-placeholder">
                    <span>${label}</span>
                    <p>等待选择像素后显示该阶段的局部数值。</p>
                </article>
            `).join("")}
        `;
        if (els.kernelProbeBadge) {
            els.kernelProbeBadge.textContent = "点击图像像素开始";
        }
    }

    function renderKernelProcessCards(probe) {
        if (!els.kernelProcessCards || !probe) return;
        const positionText = probe.isExample ? "示例像素" : `像素 (${probe.x}, ${probe.y})`;
        els.kernelProcessCards.innerHTML = `
            <article class="edge-process-card">
                <span>Patch × Kernel</span>
                <p>以${positionText}为中心取邻域，与当前卷积核逐元素相乘。</p>
                <div class="edge-process-matrix-pair">
                    ${compactMatrixHtml(probe.patch, "Patch")}
                    <b>×</b>
                    ${compactMatrixHtml(probe.primaryKernel, "Kernel")}
                </div>
            </article>
            <article class="edge-process-card">
                <span>Product</span>
                <p>每个位置得到一个乘积贡献。</p>
                ${compactMatrixHtml(probe.product, "Product")}
            </article>
            <article class="edge-process-card">
                <span>Sum</span>
                <p>把 Product 矩阵所有元素相加，得到当前方向的卷积响应。</p>
                <strong class="edge-response-value">Σ Product = ${probe.gx.toFixed(2)}</strong>
            </article>
            <article class="edge-process-card">
                <span>Response</span>
                <p>${probe.hasSecondary ? `同时计算 Gy = ${probe.gy.toFixed(2)}，再合成为幅值。` : "单核算子取响应绝对值作为边缘强度。"}</p>
                <strong class="edge-response-value">${probe.responseLabel}</strong>
            </article>
            <article class="edge-process-card ${probe.isEdge ? "is-edge" : "is-non-edge"}">
                <span>Threshold</span>
                <p>${probe.magnitude.toFixed(2)} ${probe.isEdge ? "≥" : "<"} ${probe.threshold}</p>
                <strong>${probe.isEdge ? "Edge" : "Non-edge"}</strong>
            </article>
        `;
        if (els.kernelProbeBadge) {
            els.kernelProbeBadge.textContent = probe.isExample ? "静态教学示例" : `当前像素 (${probe.x}, ${probe.y})`;
        }
    }

    function updateStageMeta(pipeline) {
        const method = pipeline?.method || currentMethod();
        const info = infoFor(method);
        const profile = kernelTeachingProfile(method);
        const stats = pipeline?.stats || {};
        updateKernelCategoryNote(method);
        if (!els.stageMeta) return;
        els.stageMeta.hidden = state.tab === "compare";
        els.stageMetaTitle.textContent = state.tab === "canny" ? "Canny 多阶段流程" : `${info.name} 响应`;
        if (els.stageKernelExplain) {
            els.stageKernelExplain.textContent = state.tab === "kernel"
                ? profile.summary
                : "Canny 不是单一卷积核，而是由高斯平滑、梯度、NMS、双阈值和滞后连接组成的流水线。";
        }
        if (state.tab === "kernel") {
            const kernels = kernelsFor(method);
            if (kernels.x || kernels.y) {
                els.stageKernelMini.innerHTML = `<span>Kx</span>${matrixHtml(kernels.x)}<span>Ky</span>${matrixHtml(kernels.y)}`;
            } else if (kernels.single) {
                els.stageKernelMini.innerHTML = matrixHtml(kernels.single);
            } else {
                els.stageKernelMini.textContent = "当前算子无单一显示核。";
            }
        } else {
            els.stageKernelMini.textContent = "Canny 包含高斯平滑、Sobel 梯度、NMS、双阈值和滞后连接。";
        }
        els.stageResponseRange.textContent = Number.isFinite(stats.min) ? `${stats.min} ~ ${stats.max}` : "-";
        els.stageThresholdMeta.textContent = state.tab === "canny"
            ? `${controlValue(els.threshold1, "50")} / ${controlValue(els.threshold2, "150")}`
            : controlValue(els.threshold, "96");
        els.stageEdgeRatio.textContent = pipeline?.edge_ratio != null ? `${pipeline.edge_ratio}%` : "-";
        els.stageProbePrompt.textContent = state.tab === "kernel"
            ? "点击左侧图像像素后，下方展示该位置的局部卷积计算。"
            : "Canny 模式侧重流程阶段与方向场，可通过步骤缩略图观察。";
    }

    async function requestProbe(event) {
        if (state.tab !== "kernel" || !state.data?.pipeline) {
            els.probeHint.textContent = "Canny 当前显示流水线阶段说明";
            els.probeBox.textContent = "Canny 的局部探针需要沿梯度方向、NMS 和滞后连接联合解释；此处保留结构用于后续扩展。";
            return;
        }
        const img = els.mainImage;
        if (!img.naturalWidth || !img.naturalHeight) return;
        const rect = img.getBoundingClientRect();
        const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const offsetX = (rect.width - drawW) / 2;
        const offsetY = (rect.height - drawH) / 2;
        const x = Math.round((event.clientX - rect.left - offsetX) / scale);
        const y = Math.round((event.clientY - rect.top - offsetY) / scale);
        if (x < 0 || y < 0 || x >= img.naturalWidth || y >= img.naturalHeight) return;

        try {
            els.probeHint.textContent = `正在计算 (${x}, ${y})`;
            const method = currentMethod();
            const kernels = kernelsFor(method);
            const primaryKernel = kernels.x || kernels.single || edgeKernels.sobel_x;
            const secondaryKernel = kernels.y || null;
            const { gray } = await loadGrayMatrix(state.data.original);
            const sourcePatch = patchFor(gray, x, y, primaryKernel.length);
            const product = multiplyMatrix(sourcePatch, primaryKernel);
            const gx = sumMatrix(product);
            let gy = 0;
            let magnitude = Math.abs(gx);
            if (secondaryKernel) {
                gy = sumMatrix(multiplyMatrix(sourcePatch, secondaryKernel));
                magnitude = Math.hypot(gx, gy);
            }
            const threshold = Number(els.threshold.value);
            const probe = {
                x,
                y,
                patch: sourcePatch,
                primaryKernel,
                product,
                gx,
                gy,
                hasSecondary: Boolean(secondaryKernel),
                magnitude,
                threshold,
                isEdge: magnitude >= threshold,
                responseLabel: secondaryKernel ? `sqrt(Gx² + Gy²) = ${magnitude.toFixed(2)}` : `|sum| = ${magnitude.toFixed(2)}`
            };
            state.lastProbe = probe;
            els.probeHint.textContent = `像素 (${x}, ${y})`;
            els.probeBox.innerHTML = `
                <div class="edge-probe-matrices">
                    <div><strong>Patch</strong>${matrixHtml(sourcePatch)}</div>
                    <div><strong>Kernel</strong>${matrixHtml(primaryKernel)}</div>
                    <div><strong>Product</strong>${matrixHtml(product)}</div>
                </div>
                <span>Gx=${gx.toFixed(2)}，Gy=${gy.toFixed(2)}，Magnitude=${magnitude.toFixed(2)}，Threshold=${threshold}，判断：${magnitude >= threshold ? "Edge" : "Non-edge"}</span>
            `;
            renderKernelProcessCards(probe);
        } catch (error) {
            els.probeHint.textContent = "探针失败";
            els.probeBox.textContent = error.message || "局部计算探针处理失败。";
            renderKernelTeachingEmpty(error.message || "局部计算探针处理失败。");
        }
    }

    function bindEvents() {
        els.samples.addEventListener("click", (event) => {
            const button = event.target.closest("[data-sample]");
            if (!button) return;
            state.sample = button.dataset.sample;
            state.file = null;
            els.imageInput.value = "";
            els.imageName.textContent = `当前使用示例图：${button.title}`;
            renderSamples();
            requestEdge(state.tab);
        });
        els.imageInput.addEventListener("change", () => {
        const file = els.imageInput.files && els.imageInput.files[0];
            if (!file) return;
            state.file = file;
            els.imageName.textContent = file.name;
            renderSamples();
            requestEdge(state.tab);
        });
        els.compareBtn.addEventListener("click", () => requestEdge("compare"));
        els.compareA.addEventListener("change", () => {
            renderCompareSlider();
            renderCompareInsights();
            updateInfoForCompare();
        });
        els.compareB.addEventListener("change", () => {
            renderCompareSlider();
            renderCompareInsights();
            updateInfoForCompare();
        });
        els.compareWall.addEventListener("click", (event) => {
            const button = event.target.closest("[data-compare-method]");
            if (!button) return;
            els.compareB.value = button.dataset.compareMethod;
            renderCompareSlider();
            renderCompareInsights();
            updateInfoForCompare();
        });
        els.sliderRange.addEventListener("input", updateSlider);
        on(els.threshold, "input", () => {
            if (els.thresholdValue) els.thresholdValue.textContent = els.threshold.value;
            if (state.tab !== "compare") {
                scheduleRefresh(state.tab);
            }
        });
        on(els.threshold1, "input", () => {
            if (els.threshold1Value) els.threshold1Value.textContent = els.threshold1.value;
            if (state.tab === "canny") {
                scheduleRefresh("canny");
            }
        });
        on(els.threshold2, "input", () => {
            if (els.threshold2Value) els.threshold2Value.textContent = els.threshold2.value;
            if (state.tab === "canny") {
                scheduleRefresh("canny");
            }
        });
        on(els.compareThreshold, "input", () => {
            if (els.compareThresholdValue) els.compareThresholdValue.textContent = els.compareThreshold.value;
            if (state.tab === "compare") {
                scheduleRefresh("compare");
            }
        });
        on(els.compareThreshold1, "input", () => {
            if (els.compareThreshold1Value) els.compareThreshold1Value.textContent = els.compareThreshold1.value;
            if (state.tab === "compare") {
                scheduleRefresh("compare");
            }
        });
        on(els.compareThreshold2, "input", () => {
            if (els.compareThreshold2Value) els.compareThreshold2Value.textContent = els.compareThreshold2.value;
            if (state.tab === "compare") {
                scheduleRefresh("compare");
            }
        });
        els.kernelBtn.addEventListener("click", () => requestEdge("kernel"));
        els.cannyBtn.addEventListener("click", () => requestEdge("canny"));
        on(els.kernelMethod, "change", () => {
            if (state.tab === "kernel") {
                scheduleRefresh("kernel");
            }
        });
        on(els.compareAperture, "change", () => {
            if (state.tab === "compare") {
                scheduleRefresh("compare");
            }
        });
        [els.compareL2, els.comparePrecise].forEach((control) => {
            on(control, "change", () => {
                if (state.tab === "compare") {
                    scheduleRefresh("compare");
                }
            });
        });
        [els.aperture, els.l2, els.precise].forEach((control) => {
            on(control, "change", () => {
                if (state.tab === "canny") {
                    scheduleRefresh("canny");
                }
            });
        });
        els.thumbs.addEventListener("click", (event) => {
            const button = event.target.closest("[data-step-index]");
            if (!button) return;
            state.stepIndex = Number(button.dataset.stepIndex);
                state.timelineIndex = Math.min((state.tab === "canny" ? cannyTimeline : kernelTimeline).length - 1, state.stepIndex);
            renderPipeline();
        });
        els.timeline.addEventListener("click", (event) => {
            const button = event.target.closest("[data-timeline-index]");
            if (!button) return;
            state.timelineIndex = Number(button.dataset.timelineIndex);
            if (state.tab !== "compare") {
                const labels = state.tab === "canny" ? cannyTimeline : kernelTimeline;
                const mapped = stepForTimelineLabel(labels[state.timelineIndex], state.data?.pipeline);
                state.stepIndex = mapped;
            }
            render();
        });
        els.playControls.addEventListener("click", (event) => {
            const button = event.target.closest("[data-edge-action]");
            if (!button) return;
            const action = button.dataset.edgeAction;
            if (action === "prev") moveStep(-1);
            if (action === "next") moveStep(1);
            if (action === "play") togglePlayback();
            if (action === "reset") resetTimeline();
        });
        els.mainImageButton.addEventListener("click", requestProbe);
    }

    renderSamples();
    bindEvents();
    requestEdge(state.tab);
}());
