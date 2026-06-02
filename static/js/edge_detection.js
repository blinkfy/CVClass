(function () {
    "use strict";

    const root = document.getElementById("edgeDetectionPage");
    if (!root) return;

    const basePath = window.CVCLASS_BASE_PATH || "";
    const assetsBase = root.dataset.assetsBase || "";
    const teedModelUrl = root.dataset.teedModelUrl || `${basePath}/static/assets/data/teed_debug_352.onnx`;
    const ortScriptUrl = root.dataset.ortScriptUrl || `${basePath}/static/vendor/onnxruntime-web/ort.min.js`;
    const ortWasmBase = root.dataset.ortWasmBase || `${basePath}/static/vendor/onnxruntime-web/`;
    const teedInputSize = 352;
    const teedBgrMean = [104.00699, 116.66877, 122.67892];
    const samples = [
        { file: "cameraman.png", label: "Cameraman" },
        { file: "house.png", label: "House" },
        { file: "lena_color_512.png", label: "Lena" },
        { file: "mandril_color.png", label: "Mandrill" },
        { file: "peppers_color.png", label: "Peppers" }
    ];

    const compareTimeline = ["算子分类", "一阶导数 / 二阶导数 / Canny", "结果对比"];
    const compareMethods = ["roberts", "sobel", "prewitt", "kirsch", "laplacian", "LoG", "canny", "teed"];
    const kernelTimeline = ["Image", "Gray", "Kernel Response", "Magnitude", "Threshold"];
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
        canny: "Canny",
        teed: "TEED"
    };

    const processNoteImages = {
        sobel: "sobel.webp",
        prewitt: "prewitt.webp",
        roberts: "roberts.webp",
        kirsch: "kirsch.webp",
        laplacian: "laplacian.webp",
        LoG: "log.webp",
        canny: "canny.webp",
        teed: "teed.webp"
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

    methodInfo.teed = {
        name: "TEED",
        category: "深度学习检测",
        summary: "轻量深度学习边缘检测模型，通过多层特征和融合输出预测边缘。",
        pros: "能利用语义和多尺度特征，轮廓更整体。",
        cons: "依赖 ONNX 模型和浏览器运行时，不属于本实验手写算法核心。",
        best_for: "传统算子与深度学习边缘检测效果对比。"
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

    const cannyPreviewNotes = {
        original: "原始输入图像，用作后续 Canny 流水线的起点。",
        gray: "彩色图到灰度图的擦除动画，强调通道压缩到单通道亮度。",
        blur: "清晰图像逐渐被高斯平滑结果覆盖，表现降噪过程。",
        gradient: "边缘响应从暗到亮出现，亮处表示梯度幅值更大。",
        direction: "方向箭头从图像中浮现，位置、方向和长度来自真实梯度向量。",
        nms: "粗边缘沿梯度方向被压细，只保留局部最大响应。",
        double: "强边缘、弱边缘、抑制区域分层点亮，为滞后连接做准备。",
        hysteresis: "强边缘像电流一样连接相邻弱边缘，形成连续边缘。",
        final: "最终边缘线被逐步描出。"
    };

    const stepAnimationClasses = {
        gray: "is-anim-gray",
        gx: "is-anim-kernel-response",
        gy: "is-anim-kernel-response",
        response: "is-anim-kernel-response",
        magnitude: "is-anim-kernel-magnitude",
        threshold: "is-anim-kernel-threshold",
        final: "is-anim-kernel-final",
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
        cannyDisplay: document.getElementById("edgeCannyDisplay"),
        cannyBtn: document.getElementById("edgeCannyBtn"),
        mainImageButton: document.getElementById("edgeMainImageButton"),
        mainBaseImage: document.getElementById("edgeMainBaseImage"),
        mainImage: document.getElementById("edgeMainImage"),
        vectorCanvas: document.getElementById("edgeVectorCanvas"),
        hysteresisCanvas: document.getElementById("edgeHysteresisCanvas"),
        stageSliderHandle: document.getElementById("edgeStageSliderHandle"),
        stageSliderLabels: document.getElementById("edgeStageSliderLabels"),
        stageSliderLeftLabel: document.getElementById("edgeStageSliderLeftLabel"),
        stageSliderRightLabel: document.getElementById("edgeStageSliderRightLabel"),
        mainStageGrid: root.querySelector(".edge-main-stage-grid"),
        sampleOverlay: document.getElementById("edgeSampleOverlay"),
        edgeDot: document.getElementById("edgeEdgeDot"),
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
        formulaCanvas: document.getElementById("edgeFormulaCanvas"),
        drawStage: document.getElementById("edgeDrawStage"),
        flowLayer: document.getElementById("edgeFlowLayer"),
        strokePath: document.getElementById("edgeStrokePath"),
        flowDot: document.getElementById("edgeFlowDot"),
        drawPatch: document.getElementById("edgeDrawPatch"),
        drawKernel: document.getElementById("edgeDrawKernel"),
        drawProduct: document.getElementById("edgeDrawProduct"),
        currentMultiply: document.getElementById("edgeCurrentMultiply"),
        sumValue: document.getElementById("edgeSumValue"),
        sumTrace: document.getElementById("edgeSumTrace"),
        responseValue: document.getElementById("edgeResponseValue"),
        responseFormula: document.getElementById("edgeResponseFormula"),
        thresholdDecision: document.getElementById("edgeThresholdDecision"),
        thresholdFormula: document.getElementById("edgeThresholdFormula"),
        responseNode: document.getElementById("edgeNodeResponse"),
        thresholdNode: document.getElementById("edgeNodeThreshold"),
        probePlay: document.getElementById("edgeProbePlay"),
        probeStep: document.getElementById("edgeProbeStep"),
        probeReset: document.getElementById("edgeProbeReset"),
        probeSpeed: document.getElementById("edgeProbeSpeed"),
        kernelFlowTitle: document.getElementById("edgeKernelFlowTitle"),
        timeline: document.getElementById("edgeTimeline"),
        playControls: root.querySelector(".edge-play-controls"),
        infoTitle: document.getElementById("edgeInfoTitle"),
        infoText: document.getElementById("edgeInfoText"),
        processNoteImage: document.getElementById("edgeProcessNoteImage"),
        processNoteImageWrap: root.querySelector(".edge-process-note-image"),
        formula: document.getElementById("edgeFormula"),
        liveLogic: document.getElementById("edgeLiveLogic"),
        kernelBox: document.getElementById("edgeKernelBox"),
        stats: document.getElementById("edgeStats"),
        stepPreview: document.getElementById("edgeStepPreview"),
        stepPreviewBody: document.getElementById("edgeStepPreviewBody"),
        stepPreviewText: document.getElementById("edgeStepPreviewText"),
        probeCard: root.querySelector(".edge-probe-card"),
        probeHint: document.getElementById("edgeProbeHint"),
        probeBox: document.getElementById("edgeProbeBox")
    };

    const state = {
        tab: root.dataset.edgeMode || "compare",
        sample: "cameraman.png",
        file: null,
        data: null,
        comparePreview: null,
        compareLoading: false,
        compareLoadingMethods: [],
        compareRefreshMethods: [],
        compareRefreshId: 0,
        stepIndex: 0,
        timelineIndex: 0,
        timer: null,
        refreshTimer: null,
        loading: false,
        lastProbe: null,
        probeStepIndex: 0,
        probeTimer: null,
        probePlaying: false,
        stageSplit: 50,
        stageSplitDragging: false,
        hysteresisFrame: null,
        hysteresisPlan: null,
        hysteresisPlanKey: "",
        stageImageTransitionId: 0,
        requestId: 0
    };

    function endpoint(path) {
        return `${basePath}${path}`;
    }

    function computeMode(feature) {
        return window.CVCLASS_COMPUTE_CONFIG?.[feature] || "backend";
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

    function stageKernelHtml(matrix, label) {
        return `<div class="edge-stage-kernel-item"><span>${escapeHtml(label)}</span>${matrixHtml(matrix)}</div>`;
    }

    function infoFor(method) {
        return methodInfo[method] || { name: methodLabels[method] || method, category: "-", summary: "", pros: "-", cons: "-", best_for: "-" };
    }

    function updateProcessNoteImage(method) {
        if (!els.processNoteImage) return;
        if (els.processNoteImageWrap) {
            els.processNoteImageWrap.hidden = state.tab !== "compare";
        }
        if (state.tab !== "compare") return;
        const normalized = method === "original" ? "sobel" : method;
        const file = processNoteImages[normalized] || processNoteImages.sobel;
        const label = methodLabels[normalized] || methodLabels.sobel;
        els.processNoteImage.src = `${assetsBase}${file}`;
        els.processNoteImage.alt = `${label} 算法介绍`;
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

    function buildCompareSingleForm(method) {
        const form = new FormData();
        const isCanny = method === "canny";
        form.append("mode", isCanny ? "canny" : "kernel");
        form.append("sample", state.sample);
        if (state.file) {
            form.append("image", state.file);
        }
        form.append("method", method);
        form.append("threshold", controlValue(els.compareThreshold, "96"));
        form.append("threshold1", controlValue(els.compareThreshold1, "50"));
        form.append("threshold2", controlValue(els.compareThreshold2, "150"));
        form.append("apertureSize", controlValue(els.compareAperture, "5"));
        form.append("L2gradient", controlChecked(els.compareL2) ? "true" : "false");
        form.append("precise", controlChecked(els.comparePrecise) ? "true" : "false");
        return form;
    }

    function compareStateFromSingle(data) {
        const pipeline = data.pipeline || {};
        const compareItem = {
            ...pipeline,
            elapsed_ms: data.elapsed_ms
        };
        return {
            original: data.original,
            info: data.info,
            compare: [compareItem],
            gray: data.gray,
            final: data.final,
            elapsed_ms: data.elapsed_ms
        };
    }

    function comparePreviewFromSingles(entries) {
        const preview = { original: null, results: {} };
        entries.forEach((entry) => {
            if (!entry) return;
            if (entry.original && !preview.original) {
                preview.original = entry.original;
            }
            if (entry.method) {
                preview.results[entry.method] = entry;
            }
        });
        return preview;
    }

    function compareResultFor(method, source = state.data, preview = state.comparePreview) {
        if (method === "original") {
            return {
                method: "original",
                info: { name: "Original" },
                final: preview?.original || source?.original || null
            };
        }
        return preview?.results?.[method] || (source?.compare || []).find((item) => item.method === method) || null;
    }

    function compareSourceImageFor(method) {
        if (method === "original") {
            return state.comparePreview?.original || state.data?.original || null;
        }
        return state.comparePreview?.results?.[method]?.final || state.data?.compare?.find((item) => item.method === method)?.final || null;
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

    function compareDerivativeMethods() {
        return compareMethods.filter((method) => method !== "teed" && method !== "canny");
    }

    function scheduleCompareMethodRefresh(methods) {
        if (state.tab !== "compare") {
            scheduleRefresh(state.tab);
            return;
        }
        const nextMethods = new Set(state.compareRefreshMethods || []);
        methods.forEach((method) => {
            if (compareMethods.includes(method) && method !== "original" && method !== "teed") {
                nextMethods.add(method);
            }
        });
        state.compareRefreshMethods = Array.from(nextMethods);
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
        }
        state.refreshTimer = window.setTimeout(() => {
            const refreshMethods = state.compareRefreshMethods.slice();
            state.compareRefreshMethods = [];
            state.refreshTimer = null;
            requestCompareMethods(refreshMethods);
        }, 180);
    }

    function mergeCompareResults(results, fallback = {}) {
        if (!results.length) return;
        const sourceData = state.data || {
            original: state.comparePreview?.original || fallback.original || null,
            info: fallback.info || {},
            compare: []
        };
        const byMethod = new Map((sourceData.compare || []).map((item) => [item.method, item]));
        Object.values(state.comparePreview?.results || {}).forEach((item) => {
            if (item?.method) byMethod.set(item.method, item);
        });
        results.forEach((item) => {
            if (item?.method) byMethod.set(item.method, item);
        });
        const compare = compareMethods
            .filter((method) => method !== "original")
            .map((method) => byMethod.get(method))
            .filter(Boolean);
        state.data = {
            ...sourceData,
            original: fallback.original || sourceData.original,
            info: fallback.info || sourceData.info,
            compare,
            gray: compare[0]?.steps?.[0]?.image || sourceData.gray || fallback.original || sourceData.original,
            final: compare[0]?.final || sourceData.final || fallback.original || sourceData.original,
            elapsed_ms: fallback.elapsed_ms ?? sourceData.elapsed_ms
        };
    }

    function yieldToBrowser() {
        return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("图片读取失败"));
            reader.readAsDataURL(file);
        });
    }

    function loadImageElement(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("图片加载失败"));
            image.src = src;
        });
    }

    function canvasToPng(canvas) {
        return canvas.toDataURL("image/png");
    }

    function formatClientFileSize(size) {
        if (!Number.isFinite(size)) return "示例图";
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        return `${(size / 1024 / 1024).toFixed(2)} MB`;
    }

    async function loadEdgeClientSource() {
        const src = state.file ? await readFileAsDataUrl(state.file) : `${assetsBase}${state.sample}`;
        const image = await loadImageElement(src);
        const maxSide = 960;
        const sourceW = image.naturalWidth || image.width;
        const sourceH = image.naturalHeight || image.height;
        const scale = Math.min(1, maxSide / Math.max(sourceW, sourceH));
        const width = Math.max(1, Math.round(sourceW * scale));
        const height = Math.max(1, Math.round(sourceH * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const gray = new Float32Array(width * height);
        for (let i = 0; i < width * height; i += 1) {
            gray[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
        }
        return {
            width,
            height,
            gray,
            original: canvasToPng(canvas),
            info: {
                filename: state.file?.name || state.sample,
                size: state.file ? formatClientFileSize(state.file.size) : "示例图",
                width,
                height
            }
        };
    }

    function clipByte(value) {
        return Math.max(0, Math.min(255, Math.trunc(value)));
    }

    function grayDataUrl(values, width, height, options = {}) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(width, height);
        const data = imageData.data;
        let min = Infinity;
        let max = -Infinity;
        if (options.normalize) {
            for (let i = 0; i < values.length; i += 1) {
                const value = Number(values[i]) || 0;
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
        }
        for (let i = 0; i < width * height; i += 1) {
            let value = Number(values[i]) || 0;
            if (options.normalize) {
                value = max > min ? (value - min) / (max - min) * 255 : 0;
            }
            value = options.invert ? 255 - value : value;
            const offset = i * 4;
            const byte = clipByte(value);
            data[offset] = byte;
            data[offset + 1] = byte;
            data[offset + 2] = byte;
            data[offset + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
        return canvasToPng(canvas);
    }

    const edgeTeedRuntime = {
        session: null,
        loading: null,
        scriptLoads: Object.create(null)
    };

    function loadEdgeTeedScript(src) {
        if (window.ort) return Promise.resolve();
        if (edgeTeedRuntime.scriptLoads[src]) return edgeTeedRuntime.scriptLoads[src];
        edgeTeedRuntime.scriptLoads[src] = new Promise((resolve, reject) => {
            const existing = Array.from(document.scripts).find((script) => script.src === src);
            if (existing) {
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error("ONNX Runtime 脚本加载失败")), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("ONNX Runtime 脚本加载失败"));
            document.head.appendChild(script);
        });
        return edgeTeedRuntime.scriptLoads[src];
    }

    async function loadEdgeTeedModel() {
        if (edgeTeedRuntime.session) return edgeTeedRuntime.session;
        if (edgeTeedRuntime.loading) return edgeTeedRuntime.loading;
        edgeTeedRuntime.loading = (async () => {
            await loadEdgeTeedScript(ortScriptUrl);
            if (!window.ort?.InferenceSession || !window.ort?.Tensor) {
                throw new Error("ONNX Runtime 未就绪，无法运行 TEED");
            }
            const wasmEnv = window.ort.env?.wasm;
            if (wasmEnv) {
                wasmEnv.wasmPaths = ortWasmBase;
                wasmEnv.numThreads = 1;
            }
            const session = await window.ort.InferenceSession.create(teedModelUrl, {
                executionProviders: ["wasm"],
                graphOptimizationLevel: "all"
            });
            edgeTeedRuntime.session = session;
            return session;
        })();
        try {
            return await edgeTeedRuntime.loading;
        } finally {
            edgeTeedRuntime.loading = null;
        }
    }

    function imageToEdgeTeedTensor(image, size = teedInputSize) {
        const sourceW = image.naturalWidth || image.width || size;
        const sourceH = image.naturalHeight || image.height || size;
        const scale = Math.min(size / sourceW, size / sourceH);
        const drawWidth = Math.max(1, Math.round(sourceW * scale));
        const drawHeight = Math.max(1, Math.round(sourceH * scale));
        const offsetX = Math.floor((size - drawWidth) / 2);
        const offsetY = Math.floor((size - drawHeight) / 2);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.fillStyle = "#000";
        context.fillRect(0, 0, size, size);
        context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
        const rgba = context.getImageData(0, 0, size, size).data;
        const data = new Float32Array(3 * size * size);
        const plane = size * size;
        for (let i = 0; i < plane; i += 1) {
            data[i] = rgba[i * 4 + 2] - teedBgrMean[0];
            data[plane + i] = rgba[i * 4 + 1] - teedBgrMean[1];
            data[plane * 2 + i] = rgba[i * 4] - teedBgrMean[2];
        }
        return {
            tensor: new window.ort.Tensor("float32", data, [1, 3, size, size]),
            fit: { size, sourceW, sourceH, drawWidth, drawHeight, offsetX, offsetY }
        };
    }

    function firstExistingTeedOutput(results, names) {
        for (const name of names) {
            if (results?.[name]) return results[name];
        }
        return null;
    }

    function edgeTeedTensorFromCanvas(canvas, size = teedInputSize) {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const rgba = context.getImageData(0, 0, size, size).data;
        const data = new Float32Array(3 * size * size);
        const plane = size * size;
        for (let i = 0; i < plane; i += 1) {
            data[i] = rgba[i * 4 + 2] - teedBgrMean[0];
            data[plane + i] = rgba[i * 4 + 1] - teedBgrMean[1];
            data[plane * 2 + i] = rgba[i * 4] - teedBgrMean[2];
        }
        return new window.ort.Tensor("float32", data, [1, 3, size, size]);
    }

    function edgeTeedTensorToProbabilityMap(tensor) {
        const dims = tensor.dims || [];
        const data = tensor.data || [];
        const height = dims[dims.length - 2] || teedInputSize;
        const width = dims[dims.length - 1] || teedInputSize;
        const planeSize = width * height;
        const offset = Math.max(0, data.length - planeSize);
        const values = new Float32Array(planeSize);
        for (let i = 0; i < planeSize; i += 1) {
            values[i] = 1 / (1 + Math.exp(-(Number(data[offset + i]) || 0)));
        }
        return { width, height, values };
    }

    function edgeTeedResizeProbabilityMap(map, sx, sy, sw, sh, targetWidth, targetHeight) {
        const source = document.createElement("canvas");
        source.width = map.width;
        source.height = map.height;
        const sourceContext = source.getContext("2d");
        const sourceData = sourceContext.createImageData(map.width, map.height);
        for (let i = 0; i < map.values.length; i += 1) {
            const byte = clipByte(map.values[i] * 255);
            sourceData.data[i * 4] = byte;
            sourceData.data[i * 4 + 1] = byte;
            sourceData.data[i * 4 + 2] = byte;
            sourceData.data[i * 4 + 3] = 255;
        }
        sourceContext.putImageData(sourceData, 0, 0);
        const target = document.createElement("canvas");
        target.width = targetWidth;
        target.height = targetHeight;
        const targetContext = target.getContext("2d", { willReadFrequently: true });
        targetContext.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
        const rgba = targetContext.getImageData(0, 0, targetWidth, targetHeight).data;
        const values = new Float32Array(targetWidth * targetHeight);
        for (let i = 0; i < values.length; i += 1) values[i] = rgba[i * 4] / 255;
        return values;
    }

    function edgeTeedFitProbabilityToSource(map, fit) {
        const cropX = fit.offsetX / fit.size * map.width;
        const cropY = fit.offsetY / fit.size * map.height;
        const cropW = fit.drawWidth / fit.size * map.width;
        const cropH = fit.drawHeight / fit.size * map.height;
        return edgeTeedResizeProbabilityMap(map, cropX, cropY, cropW, cropH, fit.sourceW, fit.sourceH);
    }

    function edgeTeedGenerateTiles(width, height, size = teedInputSize, stride = 176) {
        const positions = (length) => {
            if (length <= size) return [0];
            const items = [];
            for (let value = 0; value <= length - size; value += stride) items.push(value);
            const last = length - size;
            if (items[items.length - 1] !== last) items.push(last);
            return items;
        };
        const tiles = [];
        positions(height).forEach((y) => {
            positions(width).forEach((x) => {
                tiles.push({ x, y, width: Math.min(size, width), height: Math.min(size, height) });
            });
        });
        return tiles;
    }

    function edgeTeedHannWeights(width, height) {
        const weights = new Float32Array(width * height);
        for (let y = 0; y < height; y += 1) {
            const wy = height <= 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (height - 1));
            for (let x = 0; x < width; x += 1) {
                const wx = width <= 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (width - 1));
                weights[y * width + x] = Math.max(0.04, wx * wy);
            }
        }
        return weights;
    }

    function edgeTeedTileTensor(image, tile, size = teedInputSize) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, tile.x, tile.y, tile.width, tile.height, 0, 0, size, size);
        return edgeTeedTensorFromCanvas(canvas, size);
    }

    function edgeTeedProbabilityCanvas(values, width, height, flashRect = null) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        const imageData = context.createImageData(width, height);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < values.length; i += 1) {
            min = Math.min(min, values[i]);
            max = Math.max(max, values[i]);
        }
        for (let i = 0; i < values.length; i += 1) {
            const normalized = max > min ? (values[i] - min) / (max - min) : values[i];
            const byte = clipByte(normalized * 255);
            imageData.data[i * 4] = byte;
            imageData.data[i * 4 + 1] = byte;
            imageData.data[i * 4 + 2] = byte;
            imageData.data[i * 4 + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
        if (flashRect) {
            context.save();
            context.fillStyle = "rgba(59, 130, 246, 0.14)";
            context.strokeStyle = "rgba(37, 99, 235, 0.95)";
            context.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 160));
            context.fillRect(flashRect.x, flashRect.y, flashRect.width, flashRect.height);
            context.strokeRect(flashRect.x + 0.5, flashRect.y + 0.5, flashRect.width - 1, flashRect.height - 1);
            context.restore();
        }
        return canvas;
    }

    function edgeTeedPipelineFromValues(values, width, height, elapsedMs, originalImage, progress = "", flashRect = null) {
        const canvas = edgeTeedProbabilityCanvas(values, width, height, flashRect);
        const final = canvasToPng(canvas);
        const byteValues = new Uint8ClampedArray(values.length);
        for (let i = 0; i < values.length; i += 1) byteValues[i] = clipByte(values[i] * 255);
        return {
            method: "teed",
            info: { method: "teed", progress },
            steps: [
                { key: "gray", label: "Input", image: originalImage },
                { key: "fusion", label: "Fusion", image: final },
                { key: "final", label: "Final Edge", image: final }
            ],
            final,
            edge_ratio: edgeTeedRatio(values),
            stats: arrayStatsClient(byteValues),
            elapsed_ms: Number(elapsedMs.toFixed(2))
        };
    }

    function teedTensorToCanvas(tensor, fit, targetWidth, targetHeight, options = {}) {
        const dims = tensor.dims || [];
        const data = tensor.data || [];
        const h = dims[dims.length - 2] || fit.size;
        const w = dims[dims.length - 1] || fit.size;
        const planeSize = h * w;
        const offset = Math.max(0, data.length - planeSize);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < planeSize; i += 1) {
            const raw = Number(data[offset + i]) || 0;
            const value = options.normalize ? raw : 1 / (1 + Math.exp(-raw));
            min = Math.min(min, value);
            max = Math.max(max, value);
        }

        const full = document.createElement("canvas");
        full.width = w;
        full.height = h;
        const context = full.getContext("2d");
        const imageData = context.createImageData(w, h);
        const pixels = imageData.data;
        const edgeValues = new Uint8ClampedArray(planeSize);
        for (let i = 0; i < planeSize; i += 1) {
            let value = Number(data[offset + i]) || 0;
            if (options.normalize) {
                value = max > min ? (value - min) / (max - min) : 0;
            } else {
                value = 1 / (1 + Math.exp(-value));
                value = max > min ? (value - min) / (max - min) : value;
            }
            value = clamp(value, 0, 1);
            if (options.invert) value = 1 - value;
            const byte = clipByte(value * 255);
            edgeValues[i] = byte;
            const pixelOffset = i * 4;
            pixels[pixelOffset] = byte;
            pixels[pixelOffset + 1] = byte;
            pixels[pixelOffset + 2] = byte;
            pixels[pixelOffset + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);

        const output = document.createElement("canvas");
        output.width = targetWidth;
        output.height = targetHeight;
        const outputContext = output.getContext("2d");
        const cropX = fit.offsetX / fit.size * w;
        const cropY = fit.offsetY / fit.size * h;
        const cropW = fit.drawWidth / fit.size * w;
        const cropH = fit.drawHeight / fit.size * h;
        outputContext.drawImage(full, cropX, cropY, cropW, cropH, 0, 0, targetWidth, targetHeight);
        const outputData = outputContext.getImageData(0, 0, targetWidth, targetHeight).data;
        const values = new Uint8ClampedArray(targetWidth * targetHeight);
        for (let i = 0; i < values.length; i += 1) {
            values[i] = outputData[i * 4];
        }
        return {
            canvas: output,
            values,
            edge_ratio: edgeRatioClient(values),
            stats: arrayStatsClient(values)
        };
    }

    async function edgeTeedClientPipeline(source, options = {}) {
        const session = await loadEdgeTeedModel();
        const image = await loadImageElement(source.original);
        const startedAt = performance.now();
        const inputName = session.inputNames?.[0] || "input";
        const { tensor, fit } = imageToEdgeTeedTensor(image);
        const results = await session.run({ [inputName]: tensor });
        const fuse = firstExistingTeedOutput(results, ["fuse", "fusion", "final", "final_edge", "output"]);
        if (!fuse) {
            throw new Error("TEED Compare 只展示 fuse/final 输出，但当前模型未返回对应结果");
        }
        const globalEdge = edgeTeedFitProbabilityToSource(edgeTeedTensorToProbabilityMap(fuse), fit);
        const edgeSum = new Float32Array(globalEdge.length);
        const weightSum = new Float32Array(globalEdge.length);
        const currentEdge = new Float32Array(globalEdge.length);
        const globalWeight = 0.2;
        const tileWeight = 0.8;
        for (let i = 0; i < globalEdge.length; i += 1) {
            edgeSum[i] = globalEdge[i] * globalWeight;
            weightSum[i] = globalWeight;
            currentEdge[i] = globalEdge[i];
        }
        let pipeline = edgeTeedPipelineFromValues(
            currentEdge,
            source.width,
            source.height,
            performance.now() - startedAt,
            source.original,
            "Global Pass"
        );
        if (options.onUpdate) {
            options.onUpdate(pipeline, { phase: "global", done: 0, total: 0 });
            await yieldToBrowser();
        }
        if (options.globalOnly) {
            return pipeline;
        }

        const tiles = edgeTeedGenerateTiles(source.width, source.height, teedInputSize, 176);
        const hannCache = new Map();
        for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
            const tile = tiles[tileIndex];
            const tileTensor = edgeTeedTileTensor(image, tile, teedInputSize);
            const tileResults = await session.run({ [inputName]: tileTensor });
            const tileFuse = firstExistingTeedOutput(tileResults, ["fuse", "fusion", "final", "final_edge", "output"]);
            if (!tileFuse) continue;
            const tileEdge = edgeTeedResizeProbabilityMap(
                edgeTeedTensorToProbabilityMap(tileFuse),
                0,
                0,
                teedInputSize,
                teedInputSize,
                tile.width,
                tile.height
            );
            const cacheKey = `${tile.width}x${tile.height}`;
            if (!hannCache.has(cacheKey)) hannCache.set(cacheKey, edgeTeedHannWeights(tile.width, tile.height));
            const weights = hannCache.get(cacheKey);
            for (let y = 0; y < tile.height; y += 1) {
                const sourceRow = (tile.y + y) * source.width;
                const tileRow = y * tile.width;
                for (let x = 0; x < tile.width; x += 1) {
                    const sourceIndex = sourceRow + tile.x + x;
                    const tileIndexInPatch = tileRow + x;
                    const weighted = tileWeight * weights[tileIndexInPatch];
                    edgeSum[sourceIndex] += tileEdge[tileIndexInPatch] * weighted;
                    weightSum[sourceIndex] += weighted;
                    currentEdge[sourceIndex] = edgeSum[sourceIndex] / weightSum[sourceIndex];
                }
            }
            pipeline = edgeTeedPipelineFromValues(
                currentEdge,
                source.width,
                source.height,
                performance.now() - startedAt,
                source.original,
                `patch ${tileIndex + 1} / ${tiles.length}`,
                tile
            );
            if (options.onUpdate) {
                options.onUpdate(pipeline, { phase: "tile", done: tileIndex + 1, total: tiles.length, tile });
                await yieldToBrowser();
            }
        }
        return edgeTeedPipelineFromValues(
            currentEdge,
            source.width,
            source.height,
            performance.now() - startedAt,
            source.original,
            `patch ${tiles.length} / ${tiles.length}`
        );
    }

    function convolveGray(values, width, height, kernel) {
        const size = kernel.length;
        const pad = Math.floor(size / 2);
        const output = new Float32Array(width * height);
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let sum = 0;
                for (let ky = 0; ky < size; ky += 1) {
                    const yy = clamp(y + ky - pad, 0, height - 1);
                    for (let kx = 0; kx < size; kx += 1) {
                        const xx = clamp(x + kx - pad, 0, width - 1);
                        sum += values[yy * width + xx] * kernel[ky][kx];
                    }
                }
                output[y * width + x] = sum;
            }
        }
        return output;
    }

    function absArray(values) {
        const output = new Float32Array(values.length);
        for (let i = 0; i < values.length; i += 1) output[i] = Math.abs(values[i]);
        return output;
    }

    function hypotArray(a, b) {
        const output = new Float32Array(a.length);
        for (let i = 0; i < a.length; i += 1) output[i] = Math.hypot(a[i], b[i]);
        return output;
    }

    function thresholdArray(values, threshold) {
        const output = new Uint8ClampedArray(values.length);
        for (let i = 0; i < values.length; i += 1) output[i] = values[i] >= threshold ? 255 : 0;
        return output;
    }

    function arrayStatsClient(values) {
        if (!values?.length) return { min: 0, max: 0, mean: 0 };
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (let i = 0; i < values.length; i += 1) {
            const value = Number(values[i]) || 0;
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
        }
        return {
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            mean: Math.round((sum / values.length) * 100) / 100
        };
    }

    function edgeRatioClient(values) {
        if (!values?.length) return 0;
        let count = 0;
        for (let i = 0; i < values.length; i += 1) {
            if (values[i] >= 128) count += 1;
        }
        return Math.round((count / values.length * 100) * 100) / 100;
    }

    function edgeTeedRatio(values) {
        if (!values?.length) return 0;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < values.length; i += 1) {
            const value = Number(values[i]) || 0;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        if (max <= min) return 0;
        let count = 0;
        for (let i = 0; i < values.length; i += 1) {
            const normalized = ((Number(values[i]) || 0) - min) / (max - min);
            if (normalized >= 0.68) count += 1;
        }
        return Math.round((count / values.length * 100) * 100) / 100;
    }

    function kirschKernel(direction) {
        const kernels = {
            n: [[-3, -3, 5], [-3, 0, 5], [-3, -3, 5]],
            ne: [[-3, -3, -3], [-3, 0, 5], [-3, 5, 5]],
            e: [[-3, -3, -3], [-3, 0, -3], [5, 5, 5]],
            se: [[-3, -3, -3], [5, 0, -3], [5, 5, -3]],
            s: [[5, -3, -3], [5, 0, -3], [5, -3, -3]],
            sw: [[5, 5, -3], [5, 0, -3], [-3, -3, -3]],
            w: [[5, 5, 5], [-3, 0, -3], [-3, -3, -3]],
            nw: [[-3, 5, 5], [-3, 0, 5], [-3, -3, -3]]
        };
        return kernels[direction] || kernels.n;
    }

    function edgeKernelClientPipeline(source, method, threshold, includeOriginal = true) {
        const { width, height, gray } = source;
        const steps = includeOriginal
            ? [{ key: "original", label: "Image", image: source.original }]
            : [];
        steps.push({ key: "gray", label: "Gray", image: grayDataUrl(gray, width, height) });
        let response;
        if (["sobel", "prewitt", "roberts", "scharr"].includes(method)) {
            const gx = convolveGray(gray, width, height, edgeKernels[`${method}_x`]);
            const gy = convolveGray(gray, width, height, edgeKernels[`${method}_y`]);
            response = hypotArray(gx, gy);
            steps.push(
                { key: "gx", label: "Gx", image: grayDataUrl(gx, width, height, { normalize: true }) },
                { key: "gy", label: "Gy", image: grayDataUrl(gy, width, height, { normalize: true }) },
                { key: "magnitude", label: "Magnitude", image: grayDataUrl(response, width, height) }
            );
        } else if (method === "kirsch") {
            const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
            response = new Float32Array(width * height).fill(-Infinity);
            directions.forEach((direction) => {
                const grad = convolveGray(gray, width, height, kirschKernel(direction));
                for (let i = 0; i < grad.length; i += 1) response[i] = Math.max(response[i], grad[i]);
            });
            steps.push(
                { key: "response", label: "8-dir Response", image: grayDataUrl(response, width, height) },
                { key: "magnitude", label: "Magnitude", image: grayDataUrl(response, width, height) }
            );
        } else {
            const kernel = edgeKernels[method] || edgeKernels.laplacian;
            response = absArray(convolveGray(gray, width, height, kernel));
            steps.push(
                { key: "response", label: "Kernel Response", image: grayDataUrl(response, width, height) },
                { key: "magnitude", label: "Abs Response", image: grayDataUrl(response, width, height) }
            );
        }
        const thresholded = thresholdArray(response, Number(threshold) || 0);
        steps.push(
            { key: "threshold", label: "Threshold", image: grayDataUrl(thresholded, width, height) },
            { key: "final", label: "Final", image: grayDataUrl(thresholded, width, height) }
        );
        return {
            method,
            info: { method },
            steps,
            final: steps[steps.length - 1].image,
            edge_ratio: edgeRatioClient(thresholded),
            stats: arrayStatsClient(response)
        };
    }

    function gaussianKernel(size) {
        const sigma = 0.3 * ((size - 1) * 0.5 - 1) + 0.8;
        const center = Math.floor(size / 2);
        const kernel = [];
        let sum = 0;
        for (let y = 0; y < size; y += 1) {
            const row = [];
            for (let x = 0; x < size; x += 1) {
                const dx = x - center;
                const dy = y - center;
                const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
                row.push(value);
                sum += value;
            }
            kernel.push(row);
        }
        return kernel.map((row) => row.map((value) => value / sum));
    }

    function interpClient(values, width, height, y, x) {
        const y0 = clamp(Math.floor(y), 0, height - 1);
        const x0 = clamp(Math.floor(x), 0, width - 1);
        const y1 = clamp(y0 + 1, 0, height - 1);
        const x1 = clamp(x0 + 1, 0, width - 1);
        const dy = y - y0;
        const dx = x - x0;
        return (1 - dy) * (1 - dx) * values[y0 * width + x0]
            + dy * (1 - dx) * values[y1 * width + x0]
            + (1 - dy) * dx * values[y0 * width + x1]
            + dy * dx * values[y1 * width + x1];
    }

    function nmsClient(grad, angle, width, height, precise) {
        const output = new Float32Array(width * height);
        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                const index = y * width + x;
                const g = grad[index];
                if (precise) {
                    const rad = angle[index] * Math.PI / 180;
                    const dx = Math.cos(rad);
                    const dy = Math.sin(rad);
                    if (g >= interpClient(grad, width, height, y + dy, x + dx)
                        && g >= interpClient(grad, width, height, y - dy, x - dx)) {
                        output[index] = g;
                    }
                } else {
                    const a = angle[index];
                    let g1;
                    let g2;
                    if (a >= 22.5 && a < 67.5) {
                        g1 = grad[(y - 1) * width + x + 1];
                        g2 = grad[(y + 1) * width + x - 1];
                    } else if (a >= 67.5 && a < 112.5) {
                        g1 = grad[(y - 1) * width + x];
                        g2 = grad[(y + 1) * width + x];
                    } else if (a >= 112.5 && a < 157.5) {
                        g1 = grad[(y - 1) * width + x - 1];
                        g2 = grad[(y + 1) * width + x + 1];
                    } else {
                        g1 = grad[y * width + x + 1];
                        g2 = grad[y * width + x - 1];
                    }
                    if (g >= g1 && g >= g2) output[index] = g;
                }
            }
        }
        return output;
    }

    function directionVectorFieldClient(grad, angle, width, height, targetCount = 18) {
        const step = Math.max(2, Math.floor(Math.min(width, height) / targetCount));
        const positives = [];
        for (let i = 0; i < grad.length; i += 1) {
            if (grad[i] > 0) positives.push(grad[i]);
        }
        positives.sort((a, b) => a - b);
        const scale = positives.length ? positives[Math.min(positives.length - 1, Math.floor(positives.length * 0.92))] || 1 : 1;
        const vectors = [];
        const offset = Math.floor(step / 2);
        for (let y = offset; y < height; y += step) {
            for (let x = offset; x < width; x += step) {
                const index = y * width + x;
                const magnitude = Math.max(0, Math.min(1, grad[index] / scale));
                if (magnitude < 0.08) continue;
                vectors.push({
                    x: Math.round(x * 100) / 100,
                    y: Math.round(y * 100) / 100,
                    angle: Math.round(angle[index] * 100) / 100,
                    magnitude: Math.round(magnitude * 1000) / 1000
                });
            }
        }
        return { width, height, vectors };
    }

    function cannyClientPipeline(source, options, includeOriginal = true) {
        const { width, height, gray } = source;
        const apertureSize = [3, 5, 7].includes(Number(options.apertureSize)) ? Number(options.apertureSize) : 5;
        const low = Math.min(Number(options.threshold1) || 0, Number(options.threshold2) || 0);
        const high = Math.max(Number(options.threshold1) || 0, Number(options.threshold2) || 0);
        const blurred = convolveGray(gray, width, height, gaussianKernel(apertureSize));
        const gx = convolveGray(blurred, width, height, edgeKernels.sobel_x);
        const gy = convolveGray(blurred, width, height, edgeKernels.sobel_y);
        const grad = new Float32Array(width * height);
        const angle = new Float32Array(width * height);
        for (let i = 0; i < grad.length; i += 1) {
            grad[i] = options.l2Gradient ? Math.hypot(gx[i], gy[i]) : Math.abs(gx[i]) + Math.abs(gy[i]);
            angle[i] = ((Math.atan2(gy[i], gx[i]) * 180 / Math.PI) % 180 + 180) % 180;
        }
        const nms = nmsClient(grad, angle, width, height, Boolean(options.precise));
        const doubleThreshold = new Uint8ClampedArray(width * height);
        const edges = new Uint8ClampedArray(width * height);
        const queue = [];
        for (let i = 0; i < nms.length; i += 1) {
            if (nms[i] >= high) {
                doubleThreshold[i] = 255;
                edges[i] = 255;
                queue.push(i);
            } else if (nms[i] >= low) {
                doubleThreshold[i] = 128;
            }
        }
        for (let head = 0; head < queue.length; head += 1) {
            const index = queue[head];
            const y = Math.floor(index / width);
            const x = index % width;
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if (!dx && !dy) continue;
                    const yy = y + dy;
                    const xx = x + dx;
                    if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
                    const ni = yy * width + xx;
                    if (!edges[ni] && nms[ni] >= low) {
                        edges[ni] = 255;
                        queue.push(ni);
                    }
                }
            }
        }
        const steps = includeOriginal
            ? [{ key: "original", label: "Image", image: source.original }]
            : [];
        steps.push(
            { key: "gray", label: "Gray", image: grayDataUrl(gray, width, height) },
            { key: "blur", label: "Gaussian Blur", image: grayDataUrl(blurred, width, height) },
            { key: "gradient", label: "Gradient", image: grayDataUrl(grad, width, height) },
            {
                key: "direction",
                label: "Direction",
                image: grayDataUrl(angle, width, height, { normalize: true }),
                vector_field: directionVectorFieldClient(grad, angle, width, height)
            },
            { key: "nms", label: "NMS", image: grayDataUrl(nms, width, height) },
            { key: "double", label: "Double Threshold", image: grayDataUrl(doubleThreshold, width, height) },
            { key: "hysteresis", label: "Hysteresis", image: grayDataUrl(edges, width, height) }
        );
        return {
            method: "canny",
            info: {
                method: "canny",
                threshold1: low,
                threshold2: high,
                apertureSize,
                L2gradient: Boolean(options.l2Gradient),
                precise: Boolean(options.precise)
            },
            steps,
            final: steps[steps.length - 1].image,
            edge_ratio: edgeRatioClient(edges),
            stats: arrayStatsClient(grad)
        };
    }

    function edgeClientPipeline(source, mode, method, includeOriginal = true) {
        if (method === "canny" || mode === "canny") {
            return cannyClientPipeline(source, {
                threshold1: mode === "compare" ? controlValue(els.compareThreshold1, "50") : controlValue(els.threshold1, "50"),
                threshold2: mode === "compare" ? controlValue(els.compareThreshold2, "150") : controlValue(els.threshold2, "150"),
                apertureSize: mode === "compare" ? controlValue(els.compareAperture, "5") : controlValue(els.aperture, "5"),
                l2Gradient: mode === "compare" ? controlChecked(els.compareL2) : controlChecked(els.l2),
                precise: mode === "compare" ? controlChecked(els.comparePrecise) : controlChecked(els.precise)
            }, includeOriginal);
        }
        return edgeKernelClientPipeline(
            source,
            method || "sobel",
            mode === "compare" ? controlValue(els.compareThreshold, "96") : controlValue(els.threshold, "96"),
            includeOriginal
        );
    }

    async function requestEdgeClient(mode, requestId, previousStepIndex, previousStepKey) {
        const start = performance.now();
        const source = await loadEdgeClientSource();
        if (requestId !== state.requestId) return;
        if (mode === "compare") {
            const leftMethod = els.compareA?.value || "original";
            const rightMethod = els.compareB?.value || "sobel";
            const selectedMethods = Array.from(new Set([leftMethod, rightMethod].filter((method) => method !== "original")));
            const quickMethods = selectedMethods;
            const shouldRunTeedRefine = compareMethods.includes("teed");
            const resultsByMethod = {};
            const handleTeedUpdate = (pipeline, progress) => {
                if (requestId !== state.requestId || state.tab !== "compare") return;
                resultsByMethod.teed = pipeline;
                state.comparePreview.results.teed = pipeline;
                state.compareLoadingMethods = compareMethods.filter((item) => (
                    item !== "original" && (!resultsByMethod[item] || (item === "teed" && progress))
                ));
                render();
                if (progress?.phase === "tile") {
                    els.status.textContent = `TEED Progressive Refine: patch ${progress.done} / ${progress.total}`;
                } else {
                    els.status.textContent = "TEED Global Pass 已显示，正在逐块细化...";
                }
            };
            const runCompareMethod = async (method, options = {}) => {
                const methodStart = performance.now();
                const pipeline = method === "teed"
                    ? await edgeTeedClientPipeline(
                        source,
                        options.globalOnly ? { globalOnly: true } : { onUpdate: handleTeedUpdate }
                    )
                    : edgeClientPipeline(source, "compare", method, false);
                return {
                    ...pipeline,
                    elapsed_ms: Number((performance.now() - methodStart).toFixed(2))
                };
            };

            state.compareLoading = true;
            state.comparePreview = { original: source.original, results: {} };
            state.compareLoadingMethods = compareMethods.filter((method) => method !== "original");
            render();
            await yieldToBrowser();
            if (requestId !== state.requestId || state.tab !== "compare") return;

            for (const method of quickMethods) {
                const result = await runCompareMethod(method, { globalOnly: method === "teed" });
                resultsByMethod[method] = result;
                state.comparePreview.results[method] = result;
            }
            state.compareLoadingMethods = compareMethods.filter((method) => (
                method !== "original" && (!resultsByMethod[method] || (method === "teed" && shouldRunTeedRefine))
            ));
            state.stepIndex = 0;
            state.timelineIndex = 0;
            render();
            setReady(quickMethods.length ? "主对比已更新，正在计算对比列表..." : "正在计算传统/Canny 对比列表...");
            await yieldToBrowser();
            if (requestId !== state.requestId || state.tab !== "compare") return;

            for (const method of compareMethods) {
                if (method === "original" || method === "teed" || resultsByMethod[method]) continue;
                const result = await runCompareMethod(method);
                resultsByMethod[method] = result;
                state.comparePreview.results[method] = result;
                state.compareLoadingMethods = compareMethods.filter((item) => (
                    item !== "original" && (!resultsByMethod[item] || (item === "teed" && shouldRunTeedRefine))
                ));
                render();
                await yieldToBrowser();
                if (requestId !== state.requestId || state.tab !== "compare") return;
            }

            if (compareMethods.includes("teed")) {
                setReady("传统/Canny 对比已完成，开始 TEED 滑动窗口...");
                await yieldToBrowser();
                if (requestId !== state.requestId || state.tab !== "compare") return;
                const result = await runCompareMethod("teed");
                resultsByMethod.teed = result;
                state.comparePreview.results.teed = result;
                state.compareLoadingMethods = compareMethods.filter((item) => !resultsByMethod[item] && item !== "original");
                render();
                await yieldToBrowser();
                if (requestId !== state.requestId || state.tab !== "compare") return;
            }

            const compare = compareMethods
                .filter((method) => method !== "original")
                .map((method) => resultsByMethod[method])
                .filter(Boolean);
            state.data = {
                original: source.original,
                info: source.info,
                compare,
                gray: compare[0]?.steps?.[0]?.image || source.original,
                final: compare[0]?.final || source.original,
                elapsed_ms: Number((performance.now() - start).toFixed(2))
            };
            state.compareLoading = false;
            state.comparePreview = null;
            state.compareLoadingMethods = [];
            state.stepIndex = 0;
            state.timelineIndex = 0;
            render();
            setReady(`处理完成：${source.info.filename}，${source.info.width} × ${source.info.height}，计算耗时 ${state.data.elapsed_ms} ms`);
            return;
        }
        const pipeline = edgeClientPipeline(source, mode, mode === "canny" ? "canny" : currentMethod(), true);
        const data = {
            original: source.original,
            info: source.info,
            pipeline,
            gray: pipeline.steps[1]?.image || source.original,
            final: pipeline.final,
            elapsed_ms: Number((performance.now() - start).toFixed(2))
        };
        state.data = data;
        if (pipeline.steps?.length) {
            const sameKeyIndex = previousStepKey
                ? pipeline.steps.findIndex((step) => step.key === previousStepKey)
                : -1;
            state.stepIndex = sameKeyIndex >= 0
                ? sameKeyIndex
                : Math.min(previousStepIndex, pipeline.steps.length - 1);
            state.timelineIndex = Math.min(
                (mode === "canny" ? cannyTimeline : kernelTimeline).length - 1,
                state.stepIndex
            );
        } else {
            state.stepIndex = 0;
            state.timelineIndex = 0;
        }
        render();
        setReady(`处理完成：${data.info.filename}，${data.info.width} × ${data.info.height}，计算耗时 ${data.elapsed_ms} ms`);
    }

    async function requestCompareMethods(methods) {
        const targetMethods = Array.from(new Set(methods))
            .filter((method) => compareMethods.includes(method) && method !== "original" && method !== "teed");
        if (!targetMethods.length) return;
        if (!state.data && !state.comparePreview) {
            requestEdge("compare");
            return;
        }

        const baseRequestId = state.requestId;
        const refreshId = ++state.compareRefreshId;
        state.compareLoading = true;
        state.compareLoadingMethods = Array.from(new Set([
            ...(state.compareLoadingMethods || []),
            ...targetMethods
        ]));
        render();
        setLoading(`正在更新：${targetMethods.map((method) => methodLabels[method] || method).join(" / ")}`);

        try {
            let results = [];
            let fallback = {};
            if (computeMode("edge_detection") === "frontend") {
                const source = await loadEdgeClientSource();
                fallback = {
                    original: source.original,
                    info: source.info
                };
                results = targetMethods.map((method) => {
                    const methodStart = performance.now();
                    const pipeline = edgeClientPipeline(source, "compare", method, false);
                    return {
                        ...pipeline,
                        elapsed_ms: Number((performance.now() - methodStart).toFixed(2))
                    };
                });
                fallback.elapsed_ms = results.reduce((sum, item) => sum + (item.elapsed_ms || 0), 0);
            } else {
                const formData = buildForm("compare");
                formData.set("methods", targetMethods.join(","));
                const response = await fetch(endpoint("/api/edge-detect"), {
                    method: "POST",
                    body: formData
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || "边缘检测失败");
                }
                results = data.compare || [];
                fallback = {
                    original: data.original,
                    info: data.info,
                    elapsed_ms: data.elapsed_ms
                };
            }

            if (baseRequestId !== state.requestId || refreshId !== state.compareRefreshId || state.tab !== "compare") return;
            mergeCompareResults(results, fallback);
            state.compareLoadingMethods = (state.compareLoadingMethods || []).filter((method) => !targetMethods.includes(method));
            state.compareLoading = state.compareLoadingMethods.length > 0;
            if (!state.compareLoading) {
                state.comparePreview = null;
            }
            state.stepIndex = 0;
            state.timelineIndex = 0;
            render();
            setReady(`已更新：${targetMethods.map((method) => methodLabels[method] || method).join(" / ")}`);
        } catch (error) {
            if (baseRequestId !== state.requestId || refreshId !== state.compareRefreshId || state.tab !== "compare") return;
            state.compareLoadingMethods = (state.compareLoadingMethods || []).filter((method) => !targetMethods.includes(method));
            state.compareLoading = state.compareLoadingMethods.length > 0;
            render();
            setReady(error.message || "局部更新失败");
        }
    }

    async function requestEdge(mode) {
        clearPlayback();
        state.lastProbe = null;
        stopProbeAnimation();
        renderProbeCanvas(null);
        updateSampleOverlay(null, false);
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
        const previousStepIndex = state.stepIndex;
        const previousStep = state.tab === mode ? state.data?.pipeline?.steps?.[state.stepIndex] : null;
        const previousStepKey = previousStep?.key || null;
        state.tab = mode;
        const requestId = ++state.requestId;
        setLoading(computeMode("edge_detection") === "frontend"
            ? "正在计算边缘检测结果..."
            : "正在调用后端手写 NumPy 边缘检测函数...");
        if (computeMode("edge_detection") === "frontend") {
            try {
                await requestEdgeClient(mode, requestId, previousStepIndex, previousStepKey);
            } catch (error) {
                if (requestId === state.requestId) {
                    state.compareLoading = false;
                    state.comparePreview = null;
                    state.compareLoadingMethods = [];
                    render();
                    setReady(error.message || "浏览器边缘检测失败");
                }
            }
            return;
        }
        if (mode === "compare") {
            const leftMethod = els.compareA?.value || "original";
            const rightMethod = els.compareB?.value || "sobel";
            const selectedMethods = Array.from(new Set([leftMethod, rightMethod].filter((method) => method !== "original")));
            const backendQuickMethods = selectedMethods.filter((method) => method !== "teed");
            const selectedHasTeed = selectedMethods.includes("teed");
            let clientSourcePromise = null;
            const getClientSource = () => {
                if (!clientSourcePromise) clientSourcePromise = loadEdgeClientSource();
                return clientSourcePromise;
            };
            const runTeedCompare = async (options = {}) => {
                const methodStart = performance.now();
                const source = await getClientSource();
                const pipeline = await edgeTeedClientPipeline(
                    source,
                    options.globalOnly ? { globalOnly: true } : {
                        onUpdate: (partial, progress) => {
                            if (requestId !== state.requestId || state.tab !== "compare") return;
                            if (!state.comparePreview) {
                                state.comparePreview = { original: source.original, results: {} };
                            }
                            state.comparePreview.original = state.comparePreview.original || source.original;
                            state.comparePreview.results.teed = {
                                method: "teed",
                                original: source.original,
                                ...partial,
                                elapsed_ms: Number((performance.now() - methodStart).toFixed(2)),
                                info: source.info
                            };
                            state.compareLoadingMethods = compareMethods.filter((method) => (
                                method !== "original" && (!state.comparePreview.results[method] || method === "teed")
                            ));
                            render();
                            if (progress?.phase === "tile") {
                                els.status.textContent = `TEED Progressive Refine: patch ${progress.done} / ${progress.total}`;
                            } else {
                                els.status.textContent = "TEED Global Pass 已显示，正在逐块细化...";
                            }
                        }
                    }
                );
                return {
                    method: "teed",
                    original: source.original,
                    ...pipeline,
                    elapsed_ms: Number((performance.now() - methodStart).toFixed(2)),
                    info: source.info
                };
            };
            state.compareLoading = true;
            state.comparePreview = null;
            state.compareLoadingMethods = compareMethods.filter((method) => method !== "original");
            // 不清空 state.data = null，保留旧数据作为加载背景
            render();
            try {
                setLoading("正在更新大图中的算法...");
                const quickResponses = await Promise.all([
                    ...backendQuickMethods.map(async (method) => {
                    const response = await fetch(endpoint("/api/edge-detect"), {
                        method: "POST",
                        body: buildCompareSingleForm(method)
                    });
                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || "边缘检测失败");
                    }
                    return {
                        method,
                        original: data.original,
                        ...data.pipeline,
                        elapsed_ms: data.elapsed_ms,
                        info: data.info
                    };
                    }),
                    ...(selectedHasTeed ? [runTeedCompare({ globalOnly: true })] : [])
                ]);
                if (requestId !== state.requestId || state.tab !== "compare") {
                    return;
                }
                state.comparePreview = comparePreviewFromSingles(quickResponses);
                state.compareLoadingMethods = compareMethods.filter((method) => !backendQuickMethods.includes(method) && method !== "original");
                const previewOriginal = quickResponses.find((item) => item.original)?.original || state.data?.original || null;
                if (previewOriginal && !state.comparePreview.original) {
                    state.comparePreview.original = previewOriginal;
                }
                state.stepIndex = 0;
                state.timelineIndex = 0;
                render();
                setReady(quickResponses.length ? "大图已更新，正在加载其它算法结果..." : "正在加载传统/Canny 对比结果...");

                window.setTimeout(async () => {
                    try {
                        // 优化：排除掉已经在第一阶段计算过的算法，减少后端重复工作
                        const remainingMethods = compareMethods.filter(m => m !== "teed" && !backendQuickMethods.includes(m));
                        const formData = buildForm("compare");
                        formData.set("methods", remainingMethods.join(","));

                        const fullResponse = await fetch(endpoint("/api/edge-detect"), {
                            method: "POST",
                            body: formData
                        });
                        const fullData = await fullResponse.json();
                        if (!fullResponse.ok) {
                            throw new Error(fullData.error || "边缘检测失败");
                        }
                        if (requestId !== state.requestId || state.tab !== "compare") {
                            return;
                        }
                        const priorityResults = quickResponses.map(r => ({
                            ...r,
                            method: r.method // 确保字段名一致
                        }));
                        const nonTeedCompare = [...priorityResults, ...(fullData.compare || [])];
                        state.comparePreview = comparePreviewFromSingles(nonTeedCompare);
                        state.comparePreview.original = fullData.original || state.comparePreview.original || state.data?.original || null;
                        state.compareLoadingMethods = ["teed"];
                        render();
                        setReady("传统/Canny 对比已完成，开始 TEED 滑动窗口...");
                        const teedRemaining = await runTeedCompare();
                        if (requestId !== state.requestId || state.tab !== "compare") {
                            return;
                        }
                        
                        // 合并第一阶段和第二阶段的结果
                        const mergedCompare = [
                            ...priorityResults.filter((item) => item.method !== "teed"),
                            ...(fullData.compare || [])
                        ];
                        if (teedRemaining) mergedCompare.push(teedRemaining);
                        
                        state.data = {
                            ...fullData,
                            compare: mergedCompare
                        };
                        state.comparePreview = null;
                        state.compareLoading = false;
                        state.compareLoadingMethods = [];
                        state.stepIndex = 0;
                        state.timelineIndex = 0;
                        render();
                        setReady(`处理完成：${fullData.info.filename}，${fullData.info.width} × ${fullData.info.height}，预览图秒回，全列表耗时 ${fullData.elapsed_ms} ms`);
                    } catch (error) {
                        if (requestId !== state.requestId || state.tab !== "compare") {
                            return;
                        }
                        state.compareLoading = false;
                        state.comparePreview = null;
                        state.compareLoadingMethods = [];
                        render();
                        setReady(error.message || "边缘检测失败");
                    }
                }, 0);
            } catch (error) {
                if (requestId !== state.requestId || state.tab !== "compare") {
                    return;
                }
                state.compareLoading = false;
                state.comparePreview = null;
                state.compareLoadingMethods = [];
                render();
                setReady(error.message || "边缘检测失败");
            }
            return;
        }
        try {
            const response = await fetch(endpoint("/api/edge-detect"), {
                method: "POST",
                body: buildForm(mode)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "边缘检测失败");
            }
            if (requestId !== state.requestId) {
                return;
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
        if (!state.data && !state.comparePreview) return null;
        if (method === "original") {
            return {
                method: "original",
                info: { name: "Original" },
                final: state.comparePreview?.original || state.data?.original || null
            };
        }
        return compareResultFor(method) || null;
    }

    function updateSlider() {
        const pos = Number(els.sliderRange.value);
        els.sliderClip.style.clipPath = `inset(0 0 0 ${pos}%)`;
        els.sliderHandle.style.left = `${pos}%`;
    }

    function renderCompareSlider() {
        const leftMethod = els.compareA.value;
        const rightMethod = els.compareB.value;
        const left = compareResultFor(leftMethod) || compareResultFor("original");
        const right = compareResultFor(rightMethod) || compareResultFor("original");
        if (!left || !right) return;
        const leftImage = compareSourceImageFor(leftMethod) || left.final;
        const rightImage = compareSourceImageFor(rightMethod) || right.final;
        if (leftImage) {
            els.sliderLeft.src = leftImage;
        }
        if (rightImage) {
            els.sliderRight.src = rightImage;
        }
        els.sliderLeftLabel.textContent = methodLabels[leftMethod] || left.info.name;
        els.sliderRightLabel.textContent = methodLabels[rightMethod] || right.info.name;
        updateSlider();
    }

    function renderCompareWall() {
        const results = state.data?.compare || [];
        const preview = state.comparePreview?.results || {};
        const loadingMethods = new Set(state.compareLoadingMethods || []);
        const leftMethod = els.compareA?.value || "original";
        const rightMethod = els.compareB?.value || "sobel";
        const placeholderImage = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>
                <defs>
                    <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
                        <stop offset='0%' stop-color='#f8fbff'/>
                        <stop offset='100%' stop-color='#eff6ff'/>
                    </linearGradient>
                </defs>
                <rect width='400' height='300' fill='url(#g)'/>
                <rect x='24' y='24' width='352' height='252' rx='16' fill='none' stroke='#dbeafe' stroke-width='4' stroke-dasharray='12 10'/>
            </svg>
        `);
        els.compareWall.innerHTML = compareMethods.map((method) => {
            const item = results.find((entry) => entry.method === method);
            const info = infoFor(method);
            const previewItem = preview?.[method] || null;
            const displayItem = previewItem || item;
            const isLoading = Boolean(loadingMethods.has(method));
            const isLeft = method === leftMethod;
            const isRight = method === rightMethod;
            const originalImage = state.comparePreview?.original || state.data?.original || null;
            const imageSrc = displayItem?.final || originalImage || placeholderImage;
            const elapsedText = displayItem?.elapsed_ms != null ? `${displayItem.elapsed_ms} ms` : (isLoading ? "加载中" : "...");
            const ratioText = displayItem?.edge_ratio != null ? `${displayItem.edge_ratio}% edge` : (isLoading ? "加载中" : "...");
            return `
            <button class="edge-algo-card ${isLoading ? "is-loading" : ""} ${isLeft ? "is-left-selected" : ""} ${isRight ? "is-right-selected" : ""}" type="button" data-compare-method="${method}">
                ${isLeft ? `<span class="edge-compare-side-badge edge-compare-side-left">左</span>` : ""}
                ${isRight ? `<span class="edge-compare-side-badge edge-compare-side-right">右</span>` : ""}
                <div class="edge-algo-media">
                    <img src="${imageSrc}" alt="${escapeHtml(info.name)} 边缘图">
                    ${isLoading ? `<div class="edge-algo-loading" aria-hidden="true"><span></span><em>加载中</em></div>` : ""}
                </div>
                <div class="edge-algo-summary">
                    <h3>${escapeHtml(info.name)}</h3>
                    <span class="edge-tag">${escapeHtml(info.category)}</span>
                    <div class="edge-mini-meta">
                        <span>${elapsedText}</span>
                        <span>${ratioText}</span>
                    </div>
                </div>
            </button>
        `;
        }).join("");
    }

    function compareDetailCardHtml(method, side) {
        const result = compareResultFor(method) || compareResultFor("original");
        const info = method === "original"
            ? { name: "Original", category: "原图", summary: "原始输入图像，用于和边缘检测结果对比。", pros: "-", cons: "-", best_for: "观察各方法提取出的边缘差异。" }
            : infoFor(method);
        const imageSrc = compareSourceImageFor(method) || result?.final || state.data?.original || state.comparePreview?.original || "";
        const elapsed = result?.elapsed_ms != null ? `${result.elapsed_ms} ms` : "-";
        const ratio = result?.edge_ratio != null ? `${result.edge_ratio}% edge` : "-";
        const sideLabel = side === "left" ? "左侧方法" : "右侧方法";
        const sideClass = side === "left" ? "is-left" : "is-right";
        return `
            <article class="edge-compare-detail-card ${sideClass}">
                <span class="edge-compare-detail-side">${sideLabel}</span>
                <img src="${imageSrc}" alt="${escapeHtml(info.name)} 对比结果">
                <div class="edge-compare-detail-copy">
                    <header>
                        <strong>${escapeHtml(info.name)}</strong>
                        <span class="edge-tag">${escapeHtml(info.category)}</span>
                    </header>
                    <p>${escapeHtml(info.summary)}</p>
                    <div class="edge-compare-detail-meta">
                        <span><b>速度</b><strong>${elapsed}</strong></span>
                        <span><b>边缘占比</b><strong>${ratio}</strong></span>
                    </div>
                </div>
            </article>
        `;
    }

    function renderCompareInsights() {
        if (!els.compareInsights) return;
        const leftMethod = els.compareA.value;
        const rightMethod = els.compareB.value;
        els.compareInsights.innerHTML = `
            <div class="edge-compare-detail-grid">
                ${compareDetailCardHtml(leftMethod, "left")}
                ${compareDetailCardHtml(rightMethod, "right")}
            </div>
            <p class="edge-compare-hint">提示：点击上方结果卡可将其设为左侧或右侧对比方法，当前选择：左侧为 ${escapeHtml(methodLabels[leftMethod] || leftMethod)}，右侧为 ${escapeHtml(methodLabels[rightMethod] || rightMethod)}。</p>
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
        const stripHint = root.querySelector(".edge-compare-strip-head span");
        const insightTitle = root.querySelector(".edge-compare-insights-head strong");
        const insightHint = root.querySelector(".edge-compare-insights-head span");
        if (stripHint) stripHint.textContent = "点击卡片左半区设为左侧，右半区设为右侧";
        if (insightTitle) insightTitle.textContent = "当前对比方法说明";
        if (insightHint) insightHint.textContent = "跟随滑块两侧方法同步更新";
        updateInfoForCompare();
        if (els.stepPreview) {
            els.stepPreview.hidden = true;
        }
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
        els.mainImageButton.classList.remove("is-vector-mode", "is-direction-compare-left", "is-direction-compare-right");
        if (!els.vectorCanvas) return;
        const context = els.vectorCanvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, els.vectorCanvas.width, els.vectorCanvas.height);
        }
    }

    function clearHysteresisOverlay() {
        if (state.hysteresisFrame) {
            window.cancelAnimationFrame(state.hysteresisFrame);
            state.hysteresisFrame = null;
        }
        if (!els.hysteresisCanvas) return;
        els.mainImageButton?.classList.remove("is-hysteresis-overlay");
        const context = els.hysteresisCanvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, els.hysteresisCanvas.width, els.hysteresisCanvas.height);
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

    function displayImageForStep(pipeline, stepIndex) {
        const step = pipeline.steps[stepIndex] || pipeline.steps[0];
        if (state.tab === "canny" && step?.key === "direction") {
            return previousDisplayStep(pipeline, stepIndex).image;
        }
        return step?.image;
    }

    function stageDisplayMode() {
        if (state.tab === "kernel") {
            return els.kernelDisplay?.value || "current";
        }
        if (state.tab === "canny") {
            return els.cannyDisplay?.value || "current";
        }
        return "current";
    }

    function updateStageSplit(percent = state.stageSplit) {
        const value = Math.max(4, Math.min(96, Number(percent) || 50));
        state.stageSplit = value;
        if (els.mainImageButton) {
            els.mainImageButton.style.setProperty("--edge-stage-split", `${value}%`);
        }
        if (els.stageSliderHandle) {
            els.stageSliderHandle.style.left = `${value}%`;
        }
    }

    function setStageSplitFromEvent(event) {
        if (!els.mainImageButton) return;
        const rect = els.mainImageButton.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
        updateStageSplit((x / Math.max(1, rect.width)) * 100);
    }

    function updateStageSliderLabels(previousStep, step, showSlider) {
        if (els.stageSliderHandle) {
            els.stageSliderHandle.hidden = !showSlider;
        }
        if (els.stageSliderLabels) {
            els.stageSliderLabels.hidden = !showSlider;
        }
        if (!showSlider) return;
        if (els.stageSliderLeftLabel) {
            els.stageSliderLeftLabel.textContent = previousStep?.label || "上一步";
        }
        if (els.stageSliderRightLabel) {
            els.stageSliderRightLabel.textContent = step?.label || "当前步骤";
        }
    }

    function renderStepImage(pipeline, step) {
        const previousStep = previousDisplayStep(pipeline, state.stepIndex);
        const showDiff = stageDisplayMode() === "diff" && state.stepIndex > 0;
        const baseImage = showDiff ? displayImageForStep(pipeline, state.stepIndex - 1) : displayImageForStep(pipeline, state.stepIndex);
        const currentImage = displayImageForStep(pipeline, state.stepIndex);
        if (els.mainBaseImage) {
            const transitionBase = state.tab === "canny" && !showDiff
                ? displayImageForStep(pipeline, state.stepIndex - 1)
                : baseImage;
            els.mainBaseImage.src = transitionBase || baseImage;
            els.mainBaseImage.hidden = !(showDiff || (state.tab === "canny" && transitionBase && transitionBase !== currentImage));
        }
        if (state.tab === "canny" && !showDiff && els.mainImage.src !== currentImage) {
            const transitionId = state.stageImageTransitionId + 1;
            state.stageImageTransitionId = transitionId;
            els.mainImage.src = currentImage;
            window.setTimeout(() => {
                if (state.stageImageTransitionId === transitionId && els.mainBaseImage && stageDisplayMode() !== "diff") {
                    els.mainBaseImage.hidden = true;
                }
            }, 720);
        } else {
            els.mainImage.src = currentImage;
        }
        els.mainImageButton.classList.toggle("is-diff-mode", showDiff);
        updateStageSliderLabels(previousStep, step, showDiff);
        updateStageSplit();
    }

    function drawDirectionVectors(step, options = {}) {
        const side = options.side || "full";
        const showLabel = options.showLabel !== false;
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
        if (showLabel) {
            context.fillText("angle = atan2(Gy, Gx), arrow length = normalized magnitude", offsetX + 12, offsetY + 22);
        }
        els.mainImageButton.classList.toggle("is-vector-mode", side === "full");
        els.mainImageButton.classList.toggle("is-direction-compare-left", side === "left");
        els.mainImageButton.classList.toggle("is-direction-compare-right", side === "right");
    }

    function renderDirectionCompareOverlay(pipeline, step) {
        const showDiff = stageDisplayMode() === "diff" && state.stepIndex > 0;
        if (!showDiff || state.tab !== "canny") return false;
        const previousStep = pipeline.steps[state.stepIndex - 1];
        if (previousStep?.key === "direction") {
            drawDirectionVectors(previousStep, { side: "left", showLabel: false });
            return true;
        }
        if (step?.key === "direction") {
            drawDirectionVectors(step, { side: "right", showLabel: false });
            return true;
        }
        return false;
    }

    async function buildHysteresisPlan(pipeline) {
        const doubleStep = stepByKey(pipeline, "double");
        if (!doubleStep?.image) return null;
        const cacheKey = `${doubleStep.image.slice(0, 80)}:${pipeline.info?.threshold1}:${pipeline.info?.threshold2}`;
        if (state.hysteresisPlan && state.hysteresisPlanKey === cacheKey) {
            return state.hysteresisPlan;
        }
        const { gray, width, height } = await loadGrayMatrix(doubleStep.image);
        const stride = 1;
        const cols = Math.ceil(width / stride);
        const rows = Math.ceil(height / stride);
        const status = Array.from({ length: rows }, () => Array(cols).fill(0));
        const strong = [];
        const weak = [];

        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const y = Math.min(height - 1, row * stride);
                const x = Math.min(width - 1, col * stride);
                const value = gray[y]?.[x] || 0;
                if (value >= 210) {
                    status[row][col] = 2;
                    strong.push({ row, col, x, y });
                } else if (value >= 80) {
                    status[row][col] = 1;
                    weak.push({ row, col, x, y });
                }
            }
        }

        const dirs = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ dx, dy }))).filter((item) => item.dx || item.dy);
        const weakNeighborScore = (node) => dirs.reduce((score, { dx, dy }) => {
            const nr = node.row + dy;
            const nc = node.col + dx;
            return score + (nr >= 0 && nc >= 0 && nr < rows && nc < cols && status[nr][nc] === 1 ? 1 : 0);
        }, 0);
        const minSeedDistance = Math.max(10, Math.min(rows, cols) * 0.12);
        const seeds = strong
            .map((node) => ({ ...node, score: weakNeighborScore(node) }))
            .filter((node) => node.score > 0)
            .sort((a, b) => b.score - a.score)
            .reduce((selected, node) => {
                if (selected.length >= 16) return selected;
                const tooClose = selected.some((item) => Math.hypot(item.row - node.row, item.col - node.col) < minSeedDistance);
                if (!tooClose) selected.push(node);
                return selected;
            }, []);
        if (!seeds.length && strong.length) {
            seeds.push(strong[Math.floor(strong.length / 2)]);
        }

        const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
        const queue = [];
        const connected = [];
        seeds.forEach((seed, seedId) => {
            visited[seed.row][seed.col] = true;
            queue.push({ ...seed, parent: null, depth: 0, kind: "strong", seedId });
        });

        let maxDepth = 0;
        let head = 0;
        while (head < queue.length && connected.length < 720) {
            const node = queue[head];
            head += 1;
            connected.push(node);
            maxDepth = Math.max(maxDepth, node.depth);
            dirs.forEach(({ dx, dy }) => {
                const nr = node.row + dy;
                const nc = node.col + dx;
                if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || visited[nr][nc] || status[nr][nc] !== 1) return;
                visited[nr][nc] = true;
                queue.push({
                    row: nr,
                    col: nc,
                    x: Math.min(width - 1, nc * stride),
                    y: Math.min(height - 1, nr * stride),
                    parent: { x: node.x, y: node.y },
                    depth: node.depth + 1,
                    kind: "weak",
                    seedId: node.seedId
                });
            });
        }

        const isolated = weak
            .filter((node) => !visited[node.row][node.col])
            .filter((_, index) => index % Math.max(1, Math.floor(weak.length / 120)) === 0)
            .slice(0, 120);
        const plan = { width, height, strong: seeds, connected, isolated, maxDepth: Math.max(1, maxDepth) };
        state.hysteresisPlan = plan;
        state.hysteresisPlanKey = cacheKey;
        return plan;
    }

    function imageDrawMetrics(sourceWidth, sourceHeight) {
        const rect = els.mainImageButton.getBoundingClientRect();
        const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
        const drawW = sourceWidth * scale;
        const drawH = sourceHeight * scale;
        return {
            rect,
            scale,
            offsetX: (rect.width - drawW) / 2,
            offsetY: (rect.height - drawH) / 2
        };
    }

    function drawHysteresisPlan(plan, startTime) {
        const canvas = els.hysteresisCanvas;
        if (!canvas || !plan) return;
        const ratio = window.devicePixelRatio || 1;
        const { rect, scale, offsetX, offsetY } = imageDrawMetrics(plan.width, plan.height);
        canvas.width = Math.max(1, Math.round(rect.width * ratio));
        canvas.height = Math.max(1, Math.round(rect.height * ratio));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);

        const elapsed = performance.now() - startTime;
        const cycle = 3600;
        const progress = (elapsed % cycle) / cycle;
        const activeDepth = progress < 0.08 ? 0 : Math.ceil((progress - 0.08) / 0.84 * plan.maxDepth);
        const visibleNodes = plan.connected.filter((node) => node.depth <= activeDepth);
        const radius = Math.max(2.4, Math.min(5.2, scale * 2.2));
        const mapX = (x) => offsetX + x * scale;
        const mapY = (y) => offsetY + y * scale;

        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        visibleNodes.forEach((node) => {
            const alpha = Math.max(0.18, 1 - (activeDepth - node.depth) / Math.max(3, plan.maxDepth));
            if (node.parent) {
                context.strokeStyle = `rgba(37, 99, 235, ${0.22 + alpha * 0.42})`;
                context.lineWidth = Math.max(1.2, radius * 0.75);
                context.beginPath();
                context.moveTo(mapX(node.parent.x), mapY(node.parent.y));
                context.lineTo(mapX(node.x), mapY(node.y));
                context.stroke();
            }
        });

        visibleNodes.forEach((node) => {
            const age = Math.max(0, activeDepth - node.depth) / Math.max(1, plan.maxDepth);
            const isStrong = node.kind === "strong";
            context.fillStyle = isStrong
                ? "rgba(14, 165, 233, 0.95)"
                : `rgba(96, 165, 250, ${0.36 + (1 - Math.min(1, age)) * 0.58})`;
            context.shadowColor = isStrong ? "rgba(14, 165, 233, 0.75)" : "rgba(37, 99, 235, 0.45)";
            context.shadowBlur = isStrong ? 14 : 8;
            context.beginPath();
            context.arc(mapX(node.x), mapY(node.y), isStrong ? radius * 1.35 : radius, 0, Math.PI * 2);
            context.fill();
        });

        const pulse = 0.5 + Math.sin(elapsed / 180) * 0.5;
        plan.strong.forEach((node, index) => {
            const phase = (pulse + index * 0.07) % 1;
            context.strokeStyle = `rgba(14, 165, 233, ${0.2 + phase * 0.45})`;
            context.lineWidth = 1.5;
            context.shadowColor = "rgba(14, 165, 233, 0.8)";
            context.shadowBlur = 12;
            context.beginPath();
            context.arc(mapX(node.x), mapY(node.y), radius * (2.0 + phase * 2.4), 0, Math.PI * 2);
            context.stroke();
        });

        const fade = Math.max(0.05, 0.46 - progress * 0.42);
        context.shadowBlur = 0;
        plan.isolated.forEach((node, index) => {
            const alpha = Math.max(0.06, fade - (index % 5) * 0.025);
            context.fillStyle = `rgba(148, 163, 184, ${alpha})`;
            context.beginPath();
            context.arc(mapX(node.x), mapY(node.y), radius * 0.82, 0, Math.PI * 2);
            context.fill();
        });
        context.fillStyle = "rgba(15, 23, 42, 0.76)";
        context.font = "800 12px Consolas, 'Microsoft YaHei', monospace";
        context.fillText(`BFS depth ${Math.min(activeDepth, plan.maxDepth)} / ${plan.maxDepth}: high-threshold seeds connect weak edges`, offsetX + 12, offsetY + 22);
        context.restore();
        state.hysteresisFrame = window.requestAnimationFrame(() => drawHysteresisPlan(plan, startTime));
    }

    function renderFlowTimeline(pipeline, step) {
        if (!els.kernelFlowTitle) return;
        els.kernelFlowTitle.hidden = state.tab === "compare";
        const labels = state.tab === "canny"
            ? ["Image", "Gray", "Blur", "Gradient", "Direction", "NMS", "Double", "Hysteresis"]
            : ["Image", "Gray", "Gx/Gy", "Magnitude", "Threshold"];
        const kernelFlowIndex = {
            original: 0,
            gray: 1,
            gx: 2,
            gy: 2,
            response: 2,
            magnitude: 3,
            threshold: 4
        };
        const stepIndex = state.tab === "kernel"
            ? (kernelFlowIndex[step?.key] ?? 0)
            : Math.max(0, pipeline.steps.findIndex((item) => item === step || item.key === step?.key));
        els.kernelFlowTitle.style.setProperty("--edge-flow-count", labels.length);
        els.kernelFlowTitle.innerHTML = `
            <strong>${state.tab === "canny" ? "CANNY FLOW" : "KERNEL FLOW"}</strong>
            <ol class="edge-flow-timeline" aria-label="${state.tab === "canny" ? "Canny 流程时间线" : "卷积核流程时间线"}">
                ${labels.map((label, index) => `
                    <li class="${index < stepIndex ? "is-done" : ""} ${index === stepIndex ? "is-active" : ""}">
                        <span>${index + 1}</span>
                        <b>${escapeHtml(label)}</b>
                    </li>
                `).join("")}
            </ol>
        `;
    }

    async function renderHysteresisOverlay(pipeline, step) {
        clearHysteresisOverlay();
        if (state.tab !== "canny" || step?.key !== "hysteresis" || !els.hysteresisCanvas) return;
        try {
            const plan = await buildHysteresisPlan(pipeline);
            const currentStep = state.data?.pipeline?.steps?.[state.stepIndex];
            if (!plan || state.tab !== "canny" || currentStep?.key !== "hysteresis") return;
            els.mainImageButton.classList.add("is-hysteresis-overlay");
            drawHysteresisPlan(plan, performance.now());
        } catch (_error) {
            clearHysteresisOverlay();
        }
    }

    function visiblePipelineSteps(pipeline) {
        const steps = pipeline?.steps || [];
        if (state.tab !== "kernel") return steps;
        return steps.filter((step) => step.key !== "final");
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
        if (els.mainStageGrid) {
            els.mainStageGrid.classList.toggle("is-kernel", state.tab === "kernel");
        }
        const visibleSteps = visiblePipelineSteps(pipeline);
        if (state.stepIndex >= visibleSteps.length) {
            state.stepIndex = Math.max(0, visibleSteps.length - 1);
        }
        const step = visibleSteps[state.stepIndex] || visibleSteps[0] || pipeline.steps[0];
        renderFlowTimeline(pipeline, step);
        const info = infoFor(pipeline.method);
        els.stageEyebrow.textContent = state.tab === "canny" ? "Canny Pipeline" : "Kernel Operator";
        els.stageTitle.textContent = `${info.name} · ${step.label}`;
        const showDiff = stageDisplayMode() === "diff" && state.stepIndex > 0;
        if (step.key === "direction" && state.tab === "canny" && !showDiff) {
            const previousStep = pipeline.steps[Math.max(0, state.stepIndex - 1)];
            if (els.mainBaseImage) {
                els.mainBaseImage.src = previousStep?.image || step.image;
                els.mainBaseImage.hidden = false;
            }
            els.mainImage.src = previousStep?.image || step.image;
            els.mainImageButton.classList.remove("is-diff-mode");
            updateStageSliderLabels(previousStep, step, false);
            window.requestAnimationFrame(() => drawDirectionVectors(step));
        } else {
            const keepDirectionOverlay = state.tab === "canny"
                && !showDiff
                && pipeline.steps[Math.max(0, state.stepIndex - 1)]?.key === "direction";
            if (!keepDirectionOverlay) {
                clearDirectionVectors();
            }
            renderStepImage(pipeline, step);
            renderDirectionCompareOverlay(pipeline, step);
            if (keepDirectionOverlay) {
                const transitionId = state.stageImageTransitionId;
                window.setTimeout(() => {
                    if (state.stageImageTransitionId === transitionId && stageDisplayMode() !== "diff") {
                        clearDirectionVectors();
                    }
                }, 720);
            }
        }
        applyStepAnimation(step.key);
        renderHysteresisOverlay(pipeline, step);
        els.thumbs.innerHTML = visibleSteps.map((item, index) => {
            const isCannyThumb = state.tab === "canny";
            const cannyClass = isCannyThumb ? `has-thumb-anim edge-thumb-${item.key}` : "";
            const previousThumb = pipeline.steps[Math.max(0, index - 1)] || item;
            const imageMarkup = isCannyThumb
                ? `<span class="edge-thumb-media">
                    <img class="edge-thumb-base-img" src="${previousThumb.image}" alt="">
                    <img class="edge-thumb-current-img" src="${item.image}" alt="${escapeHtml(item.label)}">
                    ${thumbAnimationMarkup(item.key, pipeline)}
                </span>`
                : `<img src="${item.image}" alt="${escapeHtml(item.label)}">`;
            return `
            <button class="edge-step-thumb ${cannyClass} ${index === state.stepIndex ? "is-active" : ""}" type="button" data-step-index="${index}">
                ${index === state.stepIndex ? `<em>CURRENT</em>` : ""}
                ${imageMarkup}
                <span>${escapeHtml(item.label)}</span>
            </button>
        `;
        }).join("");
        els.timeline.innerHTML = "";
        updateStageMeta(pipeline);
        if (state.tab === "kernel" && !state.lastProbe) {
            renderKernelTeachingExample(pipeline.method);
        }
        updateInfoForPipeline(pipeline, step);
        if (!state.lastProbe) {
            updateSampleOverlay(null, false);
        }
    }

    function representativeVectors(pipeline, limit = 5) {
        const field = pipeline?.steps?.find((step) => step.key === "direction")?.vector_field;
        const vectors = Array.isArray(field?.vectors) ? field.vectors : [];
        const width = Number(field?.width) || 1;
        const height = Number(field?.height) || 1;
        const selected = [];
        vectors
            .filter((vector) => Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.angle))
            .sort((a, b) => (Number(b.magnitude) || 0) - (Number(a.magnitude) || 0))
            .forEach((vector) => {
                if (selected.length >= limit) return;
                const xPct = Math.max(8, Math.min(92, Number(vector.x) / width * 100));
                const yPct = Math.max(10, Math.min(88, Number(vector.y) / height * 100));
                const tooClose = selected.some((item) => Math.hypot(item.xPct - xPct, item.yPct - yPct) < 18);
                if (tooClose) return;
                selected.push({
                    xPct,
                    yPct,
                    angleDeg: Number(vector.angle) * 180 / Math.PI,
                    magnitude: Math.max(0.18, Math.min(1, Number(vector.magnitude) || 0.18)),
                });
            });
        return selected;
    }

    function vectorArrowMarkup(vectors) {
        return vectors.map((vector, index) => {
            const length = Math.round(16 + vector.magnitude * 18);
            const alpha = Math.max(0.58, Math.min(1, 0.55 + vector.magnitude * 0.45));
            return `<i class="edge-thumb-arrow edge-thumb-vector" style="--edge-arrow-alpha:${alpha};left:${vector.xPct.toFixed(2)}%;top:${vector.yPct.toFixed(2)}%;width:${length}px;transform:translate(-50%, -50%) rotate(${vector.angleDeg.toFixed(1)}deg);animation-delay:${(index * 0.22).toFixed(2)}s"></i>`;
        }).join("");
    }

    function vectorDotMarkup(vectors) {
        const classes = ["edge-thumb-dot-strong", "edge-thumb-dot-weak", "edge-thumb-dot-suppressed"];
        return vectors.slice(0, 3).map((vector, index) => (
            `<i class="edge-thumb-dot ${classes[index]}" style="left:${vector.xPct.toFixed(2)}%;top:${vector.yPct.toFixed(2)}%;animation-delay:${(index * 0.25).toFixed(2)}s"></i>`
        )).join("");
    }

    function thumbAnimationMarkup(key, pipeline) {
        const vectors = representativeVectors(pipeline, key === "direction" ? 6 : 4);
        const imageMotion = `<i class="edge-thumb-sheen"></i>`;
        if (key === "gray" || key === "blur" || key === "gradient" || key === "final") {
            return imageMotion;
        }
        if (key === "direction") {
            return `${imageMotion}${vectorArrowMarkup(vectors)}`;
        }
        if (key === "nms") {
            const vector = vectors[0] || { xPct: 50, yPct: 50, angleDeg: 0, magnitude: 0.5 };
            const length = Math.round(28 + vector.magnitude * 22);
            return `${imageMotion}<i class="edge-thumb-nms-line" style="left:${vector.xPct.toFixed(2)}%;top:${vector.yPct.toFixed(2)}%;width:${length}px;transform:translate(-50%, -50%) rotate(${vector.angleDeg.toFixed(1)}deg)"></i>`;
        }
        if (key === "double") {
            return `${imageMotion}${vectorDotMarkup(vectors)}`;
        }
        if (key === "hysteresis") {
            const first = vectors[0] || { xPct: 18, yPct: 58 };
            const last = vectors[1] || { xPct: 72, yPct: 46 };
            return `${imageMotion}<i class="edge-thumb-trace" style="--edge-trace-x0:${first.xPct.toFixed(2)}%;--edge-trace-y0:${first.yPct.toFixed(2)}%;--edge-trace-x1:${last.xPct.toFixed(2)}%;--edge-trace-y1:${last.yPct.toFixed(2)}%"></i>`;
        }
        return imageMotion;
    }

    function stepByKey(pipeline, key) {
        return pipeline?.steps?.find((item) => item.key === key);
    }

    function previewArrowsMarkup(pipeline) {
        return representativeVectors(pipeline, 7).map((vector, index) => {
            const length = Math.round(28 + vector.magnitude * 32);
            const alpha = Math.max(0.62, Math.min(1, 0.56 + vector.magnitude * 0.44));
            return `<i class="edge-preview-arrow" style="--edge-arrow-alpha:${alpha};--edge-arrow-rotate:${vector.angleDeg.toFixed(1)}deg;left:${vector.xPct.toFixed(2)}%;top:${vector.yPct.toFixed(2)}%;width:${length}px;animation-delay:${(index * 0.18).toFixed(2)}s"></i>`;
        }).join("");
    }

    function previewDotsMarkup(pipeline) {
        const classes = ["is-strong", "is-weak", "is-suppressed", "is-strong", "is-weak"];
        return representativeVectors(pipeline, 5).map((vector, index) => (
            `<i class="edge-preview-dot ${classes[index] || "is-weak"}" style="left:${vector.xPct.toFixed(2)}%;top:${vector.yPct.toFixed(2)}%;animation-delay:${(index * 0.2).toFixed(2)}s"></i>`
        )).join("");
    }

    function previewTraceMarkup(pipeline) {
        const vectors = representativeVectors(pipeline, 4);
        const first = vectors[0] || { xPct: 18, yPct: 58 };
        const last = vectors[2] || vectors[1] || { xPct: 76, yPct: 42 };
        return `<i class="edge-preview-trace" style="--edge-trace-x0:${first.xPct.toFixed(2)}%;--edge-trace-y0:${first.yPct.toFixed(2)}%;--edge-trace-x1:${last.xPct.toFixed(2)}%;--edge-trace-y1:${last.yPct.toFixed(2)}%"></i>`;
    }

    function calculationPreviewFor(stepKey) {
        const map = {
            original: {
                title: "Input",
                nodes: ["Input Image", "RGB Pixels", "Canny Pipeline"],
                active: 0,
                formula: "输入图像保持比例，后续步骤在灰度空间中继续计算。"
            },
            gray: {
                title: "Gray",
                nodes: ["R,G,B", "0.299R + 0.587G + 0.114B", "Gray"],
                active: 1,
                formula: "每个像素把 3 个颜色通道压缩为 1 个亮度值。"
            },
            blur: {
                title: "Blur",
                nodes: ["Gray Patch", "Gaussian Kernel", "Weighted Sum", "Blurred Pixel"],
                active: 2,
                formula: "用高斯权重做局部加权平均，先降低噪声。"
            },
            gradient: {
                title: "Gradient",
                nodes: ["Blur", "Sobel X/Y", "Gx, Gy", "Magnitude"],
                active: 2,
                formula: "G = sqrt(Gx^2 + Gy^2)，左右和上下两路梯度先并行，再合成幅值。"
            },
            direction: {
                title: "Direction",
                nodes: ["Gx, Gy", "atan2(Gy, Gx)", "Angle", "Vector Field"],
                active: 1,
                formula: "方向来自 atan2，箭头朝向表示角度，箭头长度表示归一化梯度幅值。"
            },
            nms: {
                title: "NMS",
                nodes: ["Magnitude", "Direction", "Compare Neighbors", "Thin Edge"],
                active: 2,
                formula: "沿梯度方向比较相邻像素，只保留局部最大响应。"
            },
            double: {
                title: "Double Threshold",
                nodes: ["NMS", "High / Low", "Strong", "Weak", "Suppressed"],
                active: 1,
                formula: "高阈值以上为强边缘，低阈值和高阈值之间为弱边缘，其余抑制。"
            },
            hysteresis: {
                title: "Hysteresis",
                nodes: ["Strong Edge", "8-neighbor Search", "Connected Weak", "Final Edge"],
                active: 1,
                formula: "从强边缘出发搜索 8 邻域，只保留连通弱边缘。"
            },
            final: {
                title: "Final",
                nodes: ["Connected Edges", "Binary Map", "Final Output"],
                active: 2,
                formula: "输出最终二值边缘图。"
            }
        };
        return map[stepKey] || map.original;
    }

    function calculationModeFor(stepKey) {
        return {
            original: "source",
            gray: "gray",
            blur: "multiply",
            gradient: "gradient",
            direction: "vector",
            nms: "suppress",
            double: "threshold",
            hysteresis: "connect",
            final: "source"
        }[stepKey] || "source";
    }

    function calculationStageMarkup(mode) {
        const grid = "<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>";
        const particles = `<i class="edge-calc-particle is-a"></i><i class="edge-calc-particle is-b"></i><i class="edge-calc-particle is-c"></i>`;
        if (mode === "gray") {
            return `<div class="edge-calc-color-stack"><i class="is-r"></i><i class="is-g"></i><i class="is-b"></i></div><div class="edge-calc-operator">weighted sum</div><div class="edge-calc-result is-gray"><span>L</span></div>${particles}<i class="edge-calc-flow-line"></i>`;
        }
        if (mode === "gradient") {
            return `
                <div class="edge-grad-source">Blur Patch</div>
                <div class="edge-grad-branch is-x"><b>Sobel X</b><i></i></div>
                <div class="edge-grad-branch is-y"><b>Sobel Y</b><i></i></div>
                <div class="edge-grad-combine"><span>Gx^2 + Gy^2</span><strong>sqrt</strong></div>
                <div class="edge-grad-output"><i></i></div>
                <i class="edge-grad-pulse is-x"></i>
                <i class="edge-grad-pulse is-y"></i>
                <i class="edge-grad-rail is-x"></i>
                <i class="edge-grad-rail is-y"></i>
            `;
        }
        if (mode === "multiply") {
            return `
                <div class="edge-calc-lab is-patch"><b>Patch</b><div class="edge-calc-matrix-mini">${grid}</div></div>
                <div class="edge-calc-lab is-kernel"><b>Kernel</b><div class="edge-calc-kernel-disc"><i></i><i></i><i></i></div></div>
                <div class="edge-calc-product-stream"><i></i><i></i><i></i><i></i></div>
                <div class="edge-calc-output-pixel"><b>Σ</b><span></span></div>
                <i class="edge-calc-flow-line"></i>
            `;
        }
        if (mode === "vector") {
            return `
                <div class="edge-vector-plane"><i class="axis-x"></i><i class="axis-y"></i><b>Gx</b><em>Gy</em><span></span></div>
                <div class="edge-calc-operator">atan2</div>
                <div class="edge-calc-vector-out"><i></i><i></i><i></i></div>
                <i class="edge-angle-arc"></i>
                <i class="edge-vector-angle-label">θ</i>
            `;
        }
        if (mode === "suppress") {
            return `
                <div class="edge-nms-scan"><i class="is-prev"></i><i class="is-center"></i><i class="is-next"></i><span></span></div>
                <div class="edge-calc-operator">keep max</div>
                <div class="edge-calc-thin-line"></div>
                <i class="edge-nms-cutter"></i>
                <i class="edge-nms-scan-beam"></i>
            `;
        }
        if (mode === "threshold") {
            return `
                <div class="edge-threshold-ruler"><i class="low"></i><i class="high"></i><span></span></div>
                <div class="edge-threshold-samples"><i class="is-off"></i><i class="is-weak"></i><i class="is-strong"></i></div>
                <div class="edge-calc-threshold-dots"><i class="is-strong"></i><i class="is-weak"></i><i class="is-off"></i></div>
                <i class="edge-threshold-gate"></i>
                <i class="edge-threshold-label is-low">low</i><i class="edge-threshold-label is-high">high</i>
            `;
        }
        if (mode === "connect") {
            return `
                <div class="edge-hysteresis-map"><i class="is-strong"></i><i class="is-weak a"></i><i class="is-weak b"></i><i class="is-weak c"></i><i class="is-noise"></i><span></span></div>
                <div class="edge-calc-operator">8-neighbor</div>
                <div class="edge-calc-connected"><i></i></div>
                <i class="edge-calc-electric"></i>
                <i class="edge-connect-halo"></i>
            `;
        }
        return `<div class="edge-calc-source-block"></div><div class="edge-calc-operator">input</div><div class="edge-calc-result is-image"></div>${particles}`;
    }

    function renderCalculationPreview(pipeline, step) {
        if (!els.stepPreview || !els.stepPreviewBody || !els.stepPreviewText) return;
        if (pipeline?.method !== "canny") {
            els.stepPreview.hidden = true;
            return;
        }
        const preview = calculationPreviewFor(step.key);
        const field = step.key === "direction"
            ? pipeline?.steps?.find((item) => item.key === "direction")?.vector_field
            : null;
        const low = pipeline?.info?.threshold1;
        const high = pipeline?.info?.threshold2;
        const detailText = {
            gradient: "Sobel X / Sobel Y",
            direction: field?.vectors?.length ? `${field.vectors.length} vectors` : "atan2(Gy, Gx)",
            nms: "keep local max",
            double: Number.isFinite(low) && Number.isFinite(high) ? `low ${low} / high ${high}` : "low / high",
            hysteresis: "8-neighbor search"
        }[step.key] || preview.nodes[preview.active] || step.label;
        els.stepPreview.hidden = false;
        const mode = calculationModeFor(step.key);
        els.stepPreviewBody.innerHTML = `
            <div class="edge-calc-preview-head">
                <strong>${escapeHtml(preview.title || step.label)}</strong>
                <span>${escapeHtml(detailText)}</span>
            </div>
            <div class="edge-calc-preview edge-calc-${escapeHtml(step.key)} edge-calc-mode-${escapeHtml(mode)}">
                <div class="edge-calc-stage">
                    ${calculationStageMarkup(mode)}
                </div>
            </div>
        `;
        els.stepPreviewText.textContent = preview.formula;
        return;
        els.stepPreviewBody.innerHTML = `
            <div class="edge-calc-preview edge-calc-${escapeHtml(step.key)}">
                <div class="edge-calc-nodes">
                    ${preview.nodes.map((node, index) => `
                        <span class="edge-calc-node ${index === preview.active ? "is-active" : ""}" style="animation-delay:${(index * 0.14).toFixed(2)}s">${escapeHtml(node)}</span>
                    `).join('<i class="edge-calc-arrow">→</i>')}
                </div>
                <div class="edge-calc-meter"><span></span></div>
            </div>
        `;
        els.stepPreviewText.textContent = preview.formula;
    }

    function renderStepPreview(pipeline, step) {
        renderCalculationPreview(pipeline, step);
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
        if (!els.kernelBox) return;
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

    function liveLogicForPipeline(pipeline, step) {
        if (!pipeline || !step) return "等待运行边缘检测流程。";
        if (pipeline.method !== "canny") {
            return state.lastProbe
                ? els.liveLogic?.textContent || "局部卷积探针已计算。"
                : "点击中间主图上的一个像素，查看 Patch × Kernel、响应值和阈值判断。";
        }
        const low = pipeline.info?.threshold1 ?? controlValue(els.threshold1, "50");
        const high = pipeline.info?.threshold2 ?? controlValue(els.threshold2, "150");
        const map = {
            original: "输入图像作为 Canny 流水线起点，后续计算会先转入灰度空间。",
            gray: "RGB 按 0.299R + 0.587G + 0.114B 合成为单通道灰度。",
            blur: "灰度 Patch 与高斯核逐项加权求和，输出平滑后的像素。",
            gradient: "Sobel X/Y 计算 Gx、Gy，再合成为梯度幅值。",
            direction: "atan2(Gy, Gx) 得到梯度方向，方向用于后续 NMS 邻域选择。",
            nms: "沿梯度方向比较前后邻点；只有局部最大响应会被保留。",
            double: `NMS 响应按阈值分类：>= ${high} 为强边缘，${low}~${high} 为弱边缘，< ${low} 被抑制。`,
            hysteresis: "从强边缘出发搜索 8 邻域，保留与强边缘连通的弱边缘。",
            final: "最终输出强边缘和被连接的弱边缘组成的二值边缘图。"
        };
        return map[step.key] || "当前步骤使用上方公式更新边缘响应。";
    }

    function updateInfoForCompare() {
        const leftMethod = els.compareA?.value || "original";
        const rightMethod = els.compareB?.value || "sobel";
        const selectedMethod = rightMethod !== "original" ? rightMethod : (leftMethod !== "original" ? leftMethod : "sobel");
        const selectedInfo = infoFor(selectedMethod);
        const selectedResult = resultByMethod(selectedMethod);
        //els.infoTitle.textContent = `当前选中算法 · ${selectedInfo.name}`;
        updateProcessNoteImage(selectedMethod);
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
        updateProcessNoteImage(pipeline.method);
        els.infoText.textContent = cannyDetail?.process || stepNotes[step.key] || info.summary;
        renderFormula(cannyFormulaOverrides[step.key] || cannyDetail?.formula || kernelFormula(pipeline.method), cannyFormulaHighlights[step.key] ?? -1);
        if (els.liveLogic) {
            els.liveLogic.textContent = liveLogicForPipeline(pipeline, step);
        }
        renderKernelBox(pipeline.info);
        const meta = state.data?.info || {};
        els.stats.innerHTML = `
            <span>总耗时：${state.data?.elapsed_ms ?? "-"} ms</span>
            <span>边缘像素占比：${pipeline.edge_ratio}%</span>
            <span>输出尺寸：${meta.width || "-"} × ${meta.height || "-"}</span>
            <span>响应范围：${pipeline.stats.min} ~ ${pipeline.stats.max}</span>
        `;
        renderStepPreview(pipeline, step);
    }

    function render() {
        if (!state.data && !state.comparePreview && !state.compareLoading) return;
        if (state.tab === "compare") {
            renderCompare();
        } else {
            if (!state.data) return; // 对于 canny/kernel 模式，没有 data 无法渲染
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
        const length = visiblePipelineSteps(pipeline).length;
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
            image.crossOrigin = "anonymous";
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
        setProbe(staticProbeFor(method), { autoplay: false });
        if (els.kernelProbeBadge) {
            els.kernelProbeBadge.textContent = "静态示例，点击图像像素开始动态演示";
        }
    }

    function renderKernelTeachingEmpty(message = "点击主图中的任意像素，系统会取该位置邻域 Patch，乘以当前 Kernel，展示乘积矩阵、求和响应和阈值判断。") {
        stopProbeAnimation();
        state.lastProbe = null;
        state.probeStepIndex = 0;
        renderProbeCanvas(null);
        updateSampleOverlay(null, false);
        if (els.kernelProbeBadge) {
            els.kernelProbeBadge.textContent = "点击图像像素开始";
        }
        if (els.currentMultiply) els.currentMultiply.textContent = message;
    }

    function probeCellCount(probe) {
        return Array.isArray(probe?.patch) ? probe.patch.length * (probe.patch[0]?.length || 0) : 0;
    }

    function probeSpeedDelay() {
        const speed = els.probeSpeed?.value || "medium";
        if (speed === "slow") return 1400;
        if (speed === "fast") return 720;
        return 1020;
    }

    function flatValue(matrix, index) {
        const cols = matrix?.[0]?.length || 1;
        return matrix?.[Math.floor(index / cols)]?.[index % cols] ?? 0;
    }

    function formatNumber(value, digits = 0) {
        const number = Number(value) || 0;
        return Math.abs(number) >= 100 ? number.toFixed(0) : number.toFixed(digits);
    }

    function matrixCellsHtml(matrix, role, activeIndex = -1, revealUntil = matrix?.length * (matrix?.[0]?.length || 0)) {
        if (!Array.isArray(matrix) || !matrix.length) return "";
        const cols = matrix[0].length;
        const flat = matrix.flat();
        return flat.map((value, index) => `
            <span class="edge-draw-cell ${index === activeIndex ? "is-active" : ""} ${index < revealUntil ? "is-written" : "is-pending"} ${role === "product" ? "edge-product-cell" : ""}" data-cell="${index}" style="--cell-delay:${index * 34}ms">
                ${index < revealUntil || role !== "product" ? escapeHtml(formatNumber(value, role === "product" ? 0 : 0)) : ""}
            </span>
        `).join("");
    }

    function renderProbeCanvas(probe) {
        if (!els.formulaCanvas) return;
        if (!probe) {
            if (els.drawPatch) els.drawPatch.innerHTML = "";
            if (els.drawKernel) els.drawKernel.innerHTML = "";
            if (els.drawProduct) els.drawProduct.innerHTML = "";
            if (els.sumValue) els.sumValue.textContent = "0.00";
            if (els.sumTrace) els.sumTrace.textContent = "等待累加";
            if (els.responseValue) els.responseValue.textContent = "-";
            if (els.responseFormula) els.responseFormula.textContent = "sqrt(Gx² + Gy²)";
            if (els.thresholdDecision) els.thresholdDecision.textContent = "-";
            if (els.thresholdFormula) els.thresholdFormula.textContent = "Response ? Threshold";
            if (els.currentMultiply) els.currentMultiply.textContent = "点击主图选择像素。";
            if (els.liveLogic) els.liveLogic.textContent = "点击中间主图上的一个像素，查看公式和阈值判断。";
            return;
        }
        const count = probeCellCount(probe);
        const step = clamp(state.probeStepIndex, 0, count + 2);
        const activeIndex = Math.min(step, count - 1);
        const revealProductUntil = Math.min(step + 1, count);
        const productFlat = probe.product.flat();
        const partial = productFlat.slice(0, Math.min(step + 1, count)).reduce((total, value) => total + value, 0);
        const currentPatch = flatValue(probe.patch, activeIndex);
        const currentKernel = flatValue(probe.primaryKernel, activeIndex);
        const currentProduct = currentPatch * currentKernel;
        state.lastProbeRenderStep = state.lastProbeRenderStep ?? -1;
        const gridStyle = `grid-template-columns: repeat(${probe.patch[0].length}, minmax(0, 1fr))`;
        els.drawPatch.style = gridStyle;
        els.drawKernel.style = gridStyle;
        els.drawProduct.style = gridStyle;
        els.drawPatch.innerHTML = matrixCellsHtml(probe.patch, "patch", activeIndex, count);
        els.drawKernel.innerHTML = matrixCellsHtml(probe.primaryKernel, "kernel", activeIndex, count);
        els.drawProduct.innerHTML = matrixCellsHtml(probe.product, "product", activeIndex, revealProductUntil);
        els.formulaCanvas.classList.toggle("is-edge", probe.isEdge && step >= count + 2);
        els.formulaCanvas.classList.toggle("is-non-edge", !probe.isEdge && step >= count + 2);
        els.formulaCanvas.style.setProperty("--flow-progress", `${Math.min(1, step / Math.max(1, count + 2))}`);
        
        if (step < count && state.lastProbeRenderStep !== state.probeStepIndex) {
            state.lastProbeRenderStep = state.probeStepIndex;
            window.setTimeout(() => spawnFlyingParticles(probe, step, count), 10);
        } else if (step === 0) {
            state.lastProbeRenderStep = 0;
        }
        
        if (els.currentMultiply) {
            els.currentMultiply.textContent = step < count
                ? `${formatNumber(currentPatch)} × ${formatNumber(currentKernel)} = ${formatNumber(currentProduct)}`
                : "乘法完成";
        }
        if (els.sumValue) {
            const newSumText = step < count ? formatNumber(partial, 0) : formatNumber(probe.gx, 0);
            if (els.sumValue.textContent !== newSumText) {
                els.sumValue.textContent = newSumText;
                const pool = els.sumValue.closest('.edge-sum-pool');
                if (pool) {
                    pool.classList.remove('is-flashing');
                    void pool.offsetWidth;
                    pool.classList.add('is-flashing');
                }
            }
        }
        if (els.sumTrace) {
            if (step < count) {
                const terms = productFlat.slice(0, Math.min(step + 1, count)).map((value) => {
                    const cls = value >= 0 ? "is-positive" : "is-negative";
                    return `<span class="edge-sum-item ${cls}">${formatNumber(value)}</span>`;
                });
                const hiddenCount = Math.max(0, terms.length - 4);
                els.sumTrace.innerHTML = hiddenCount
                    ? `${terms.slice(-4).join("<span class=\"edge-sum-operator\">+</span>")}<span class=\"edge-sum-more\">…</span>`
                    : terms.join("<span class=\"edge-sum-operator\">+</span>");
            } else {
                els.sumTrace.textContent = `Σ Product = ${formatNumber(probe.gx, 0)}`;
            }
        }
        if (els.responseValue) {
            els.responseValue.textContent = step >= count + 1 ? probe.magnitude.toFixed(2) : "等待";
        }
        if (els.responseNode) {
            els.responseNode.classList.toggle("is-active", step >= count + 1);
        }
        if (els.responseFormula) {
            els.responseFormula.textContent = probe.hasSecondary
                ? `sqrt(${probe.gx.toFixed(2)}² + ${probe.gy.toFixed(2)}²)`
                : `|${probe.gx.toFixed(2)}|`;
        }
        if (els.thresholdDecision) {
            els.thresholdDecision.textContent = step >= count + 2 ? (probe.isEdge ? "Edge" : "Non-edge") : "等待";
        }
        if (els.thresholdNode) {
            els.thresholdNode.classList.toggle("is-edge", Boolean(step >= count + 2 && probe.isEdge));
            els.thresholdNode.classList.toggle("is-non-edge", Boolean(step >= count + 2 && !probe.isEdge));
        }
        if (els.thresholdFormula) {
            els.thresholdFormula.textContent = step >= count + 2
                ? `${probe.magnitude.toFixed(2)} ${probe.isEdge ? "≥" : "<"} ${probe.threshold}`
                : `Threshold = ${probe.threshold}`;
        }
        if (els.liveLogic) {
            let logicText = "等待计算开始...";
            if (step < count) {
                logicText = `当前乘法: ${formatNumber(currentPatch)} × ${formatNumber(currentKernel)} = ${formatNumber(currentProduct)}`;
            } else if (step === count || step === count + 1) {
                logicText = `计算响应值: ${probe.magnitude.toFixed(2)}`;
            } else if (step >= count + 2) {
                logicText = `阈值判断: ${probe.magnitude.toFixed(2)} ${probe.isEdge ? "≥" : "<"} ${probe.threshold} ➔ ${probe.isEdge ? "Edge" : "Non-edge"}`;
            }
            els.liveLogic.textContent = logicText;
        }
        updateFlowPath(step, count + 2);
        if (step >= count + 2) {
            updateSampleOverlay(probe, true);
        }
    }

    function spawnFlyingParticles(probe, step, count) {
        if (step >= count || !els.formulaCanvas) return;
        const patchCell = els.drawPatch.querySelector(`[data-cell="${step}"]`);
        const kernelCell = els.drawKernel.querySelector(`[data-cell="${step}"]`);
        const productCell = els.drawProduct.querySelector(`[data-cell="${step}"]`);
        const sumPool = els.sumValue ? els.sumValue.closest('.edge-sum-pool') : null;
        if (!patchCell || !kernelCell || !productCell || !sumPool) return;

        const patchVal = flatValue(probe.patch, step);
        const kernelVal = flatValue(probe.primaryKernel, step);
        const productVal = patchVal * kernelVal;
        const containerRect = els.formulaCanvas.getBoundingClientRect();
        const flyInDuration = 340;
        const settleDuration = 60;
        const productToSumDelay = 260;
        const flyOutDuration = 280;

        const createFlyer = (text, startEl, endEl, delay, cls) => {
            const startRect = startEl.getBoundingClientRect();
            const tarRect = endEl.getBoundingClientRect();
            const p = document.createElement("div");
            p.className = `edge-flying-particle edge-fly-${cls}`;
            p.textContent = text;
            p.style.left = `${startRect.left - containerRect.left + startRect.width/2}px`;
            p.style.top = `${startRect.top - containerRect.top + startRect.height/2}px`;
            els.formulaCanvas.appendChild(p);

            setTimeout(() => {
                const startX = startRect.left - containerRect.left + startRect.width / 2;
                const startY = startRect.top - containerRect.top + startRect.height / 2;
                const endX = tarRect.left - containerRect.left + tarRect.width / 2;
                const endY = tarRect.top - containerRect.top + tarRect.height / 2;
                const midX = (startX + endX) / 2;
                const midY = Math.min(startY, endY) - 24;
                const duration = cls === 'product' ? flyOutDuration : flyInDuration;
                p.animate([
                    { transform: `translate(-50%, -50%) translate(0px, 0px) scale(1)`, offset: 0, opacity: 1 },
                    { transform: `translate(-50%, -50%) translate(${midX - startX}px, ${midY - startY}px) scale(1.08)`, offset: 0.42, opacity: 1 },
                    { transform: `translate(-50%, -50%) translate(${endX - startX}px, ${endY - startY}px) scale(0.96)`, offset: 0.86, opacity: 1 },
                    { transform: `translate(-50%, -50%) translate(${endX - startX}px, ${endY - startY}px) scale(0.75)`, offset: 1, opacity: 0 }
                ], {
                    duration,
                    delay,
                    easing: 'cubic-bezier(0.22, 0.85, 0.3, 1)',
                    fill: 'forwards'
                });
            }, 0);

            setTimeout(() => p.remove(), delay + (cls === 'product' ? flyOutDuration : flyInDuration) + 160);
        };

        createFlyer(formatNumber(patchVal, 0), patchCell, productCell, 20, 'patch');
        createFlyer(formatNumber(kernelVal, 0), kernelCell, productCell, 20, 'kernel');

        setTimeout(() => {
            createFlyer(formatNumber(productVal, 0), productCell, sumPool, productToSumDelay, 'product');
        }, flyInDuration + settleDuration);
    }

    function updateFlowPath(step, maxStep) {
        if (!els.strokePath || !els.flowDot) return;
        const length = els.strokePath.getTotalLength ? els.strokePath.getTotalLength() : 900;
        const progress = Math.min(1, Math.max(0, step / Math.max(1, maxStep)));
        els.strokePath.style.strokeDasharray = `${length}`;
        els.strokePath.style.strokeDashoffset = `${length * (1 - progress)}`;
        const point = els.strokePath.getPointAtLength ? els.strokePath.getPointAtLength(length * progress) : { x: 160, y: 122 };
        els.flowDot.setAttribute("cx", point.x);
        els.flowDot.setAttribute("cy", point.y);
    }

    function stopProbeAnimation() {
        if (state.probeTimer) {
            window.clearInterval(state.probeTimer);
            state.probeTimer = null;
        }
        state.probePlaying = false;
        if (els.probePlay) els.probePlay.textContent = "播放计算";
    }

    function advanceProbeStep() {
        const probe = state.lastProbe;
        if (!probe) return;
        const maxStep = probeCellCount(probe) + 2;
        state.probeStepIndex = Math.min(maxStep, state.probeStepIndex + 1);
        renderProbeCanvas(probe);
        if (state.probeStepIndex >= maxStep) {
            stopProbeAnimation();
        }
    }

    function playProbeAnimation() {
        const probe = state.lastProbe || staticProbeFor(currentMethod());
        if (!state.lastProbe) setProbe(probe, { autoplay: false });
        if (state.probePlaying) {
            stopProbeAnimation();
            return;
        }
        state.probePlaying = true;
        if (els.probePlay) els.probePlay.textContent = "暂停";
        state.probeTimer = window.setInterval(advanceProbeStep, probeSpeedDelay());
    }

    function resetProbeAnimation() {
        stopProbeAnimation();
        state.probeStepIndex = 0;
        renderProbeCanvas(state.lastProbe || staticProbeFor(currentMethod()));
        updateSampleOverlay(state.lastProbe, false);
    }

    function setProbe(probe, options = {}) {
        stopProbeAnimation();
        state.lastProbe = probe;
        state.probeStepIndex = 0;
        renderProbeCanvas(probe);
        if (els.kernelProbeBadge) {
            els.kernelProbeBadge.textContent = probe.isExample ? "静态教学示例，点击图像像素开始动态演示" : `当前像素 (${probe.x}, ${probe.y})`;
        }
        updateSampleOverlay(probe, false);
        if (options.autoplay) {
            playProbeAnimation();
        }
    }

    function updateStageMeta(pipeline) {
        const method = pipeline?.method || currentMethod();
        const info = infoFor(method);
        const profile = kernelTeachingProfile(method);
        const stats = pipeline?.stats || {};
        updateKernelCategoryNote(method);
        if (!els.stageMeta) return;
        els.stageMeta.hidden = state.tab !== "kernel";
        els.stageMetaTitle.textContent = state.tab === "canny" ? "Canny 多阶段流程" : `${info.name} 响应`;
        if (els.stageKernelExplain) {
            els.stageKernelExplain.textContent = state.tab === "kernel"
                ? profile.summary
                : "Canny 不是单一卷积核，而是由高斯平滑、梯度、NMS、双阈值和滞后连接组成的流水线。";
        }
        if (state.tab === "kernel") {
            const kernels = kernelsFor(method);
            if (kernels.x || kernels.y) {
                els.stageKernelMini.innerHTML = `${stageKernelHtml(kernels.x, "Kx")}${stageKernelHtml(kernels.y, "Ky")}`;
            } else if (kernels.single) {
                els.stageKernelMini.innerHTML = stageKernelHtml(kernels.single, "Kernel");
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
        if (stageDisplayMode() === "diff") return;
        if (state.tab !== "kernel" || !state.data?.pipeline) return;
        const img = els.mainImage;
        if (!img.naturalWidth || !img.naturalHeight) return;
        const rect = els.mainImageButton.getBoundingClientRect();
        const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const offsetX = (rect.width - drawW) / 2;
        const offsetY = (rect.height - drawH) / 2;
        const x = Math.round((event.clientX - rect.left - offsetX) / scale);
        const y = Math.round((event.clientY - rect.top - offsetY) / scale);
        if (x < 0 || y < 0 || x >= img.naturalWidth || y >= img.naturalHeight) return;

        try {
            if (els.kernelProbeBadge) {
                els.kernelProbeBadge.textContent = `正在计算 (${x}, ${y})`;
            }
            const method = currentMethod();
            const kernels = kernelsFor(method);
            const primaryKernel = kernels.x || kernels.single || edgeKernels.sobel_x;
            const secondaryKernel = kernels.y || null;
            const sourceImage = state.data.pipeline?.steps?.[0]?.image || state.data.original;
            const { gray } = await loadGrayMatrix(sourceImage);
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
            setProbe(probe, { autoplay: true });
        } catch (error) {
            renderKernelTeachingEmpty(error.message || "局部计算探针处理失败。");
        }
    }

    function updateSampleOverlay(probe, showEdge) {
        if (!els.sampleOverlay || !els.mainImageButton || !els.mainImage) return;
        if (!probe) {
            els.sampleOverlay.hidden = true;
            if (els.edgeDot) {
                els.edgeDot.classList.remove("is-edge", "is-non-edge");
            }
            return;
        }
        const img = els.mainImage;
        const rect = els.mainImageButton.getBoundingClientRect();
        if (!img.naturalWidth || !img.naturalHeight) return;
        const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const offsetX = (rect.width - drawW) / 2;
        const offsetY = (rect.height - drawH) / 2;
        const x = offsetX + probe.x * scale;
        const y = offsetY + probe.y * scale;
        const cellSize = Math.max(14, Math.min(22, scale * 6));
        const gridSize = cellSize * (probe.patch?.length || 3);
        const grid = els.sampleOverlay.querySelector(".edge-sample-grid");
        const center = els.sampleOverlay.querySelector(".edge-sample-center");
        if (grid) {
            grid.style.left = `${x}px`;
            grid.style.top = `${y}px`;
            grid.style.width = `${gridSize}px`;
            grid.style.height = `${gridSize}px`;
            grid.style.backgroundSize = `${cellSize}px ${cellSize}px`;
        }
        if (center) {
            center.style.left = `${x}px`;
            center.style.top = `${y}px`;
        }
        if (els.edgeDot) {
            els.edgeDot.style.left = `${x}px`;
            els.edgeDot.style.top = `${y}px`;
            
            const wasEdge = els.edgeDot.classList.contains("is-edge");
            const wasNonEdge = els.edgeDot.classList.contains("is-non-edge");
            
            els.edgeDot.classList.toggle("is-edge", Boolean(showEdge && probe.isEdge));
            els.edgeDot.classList.toggle("is-non-edge", Boolean(showEdge && !probe.isEdge));
            
            if (showEdge && (!wasEdge && !wasNonEdge)) {
                 // Trigger flash
                 els.edgeDot.classList.remove("is-flashing");
                 void els.edgeDot.offsetWidth;
                 els.edgeDot.classList.add("is-flashing");
                 setTimeout(() => {
                     if (els.edgeDot) els.edgeDot.classList.remove("is-flashing");
                 }, 650);
            } else if (!showEdge) {
                 els.edgeDot.classList.remove("is-flashing");
            }
        }
        els.sampleOverlay.hidden = false;
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
            renderCompareWall();
            renderCompareInsights();
            updateInfoForCompare();
        });
        els.compareB.addEventListener("change", () => {
            renderCompareSlider();
            renderCompareWall();
            renderCompareInsights();
            updateInfoForCompare();
        });
        els.compareWall.addEventListener("click", (event) => {
            const button = event.target.closest("[data-compare-method]");
            if (!button) return;
            const rect = button.getBoundingClientRect();
            const clickedLeftSide = event.clientX < rect.left + rect.width / 2;
            if (clickedLeftSide && els.compareA) {
                els.compareA.value = button.dataset.compareMethod;
            } else {
                els.compareB.value = button.dataset.compareMethod;
            }
            renderCompareSlider();
            renderCompareWall();
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
                scheduleCompareMethodRefresh(compareDerivativeMethods());
            }
        });
        on(els.compareThreshold1, "input", () => {
            if (els.compareThreshold1Value) els.compareThreshold1Value.textContent = els.compareThreshold1.value;
            if (state.tab === "compare") {
                scheduleCompareMethodRefresh(["canny"]);
            }
        });
        on(els.compareThreshold2, "input", () => {
            if (els.compareThreshold2Value) els.compareThreshold2Value.textContent = els.compareThreshold2.value;
            if (state.tab === "compare") {
                scheduleCompareMethodRefresh(["canny"]);
            }
        });
        els.kernelBtn.addEventListener("click", () => requestEdge("kernel"));
        els.cannyBtn.addEventListener("click", () => requestEdge("canny"));
        on(els.kernelMethod, "change", () => {
            if (state.tab === "kernel") {
                scheduleRefresh("kernel");
            }
        });
        on(els.kernelDisplay, "change", () => {
            if (state.tab === "kernel") {
                renderPipeline();
            }
        });
        on(els.cannyDisplay, "change", () => {
            if (state.tab === "canny") {
                renderPipeline();
            }
        });
        on(els.compareAperture, "change", () => {
            if (state.tab === "compare") {
                scheduleCompareMethodRefresh(["canny"]);
            }
        });
        [els.compareL2, els.comparePrecise].forEach((control) => {
            on(control, "change", () => {
                if (state.tab === "compare") {
                    scheduleCompareMethodRefresh(["canny"]);
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
        if (els.probePlay) {
            els.probePlay.addEventListener("click", playProbeAnimation);
        }
        if (els.probeStep) {
            els.probeStep.addEventListener("click", () => {
                if (!state.lastProbe) {
                    setProbe(staticProbeFor(currentMethod()), { autoplay: false });
                }
                advanceProbeStep();
            });
        }
        if (els.probeReset) {
            els.probeReset.addEventListener("click", resetProbeAnimation);
        }
        if (els.probeSpeed) {
            els.probeSpeed.addEventListener("change", () => {
                if (state.probePlaying) {
                    stopProbeAnimation();
                    playProbeAnimation();
                }
            });
        }
        if (els.mainImageButton) {
            els.mainImageButton.addEventListener("pointerdown", (event) => {
                if (stageDisplayMode() !== "diff" || state.stepIndex <= 0) return;
                state.stageSplitDragging = true;
                els.mainImageButton.setPointerCapture?.(event.pointerId);
                setStageSplitFromEvent(event);
                event.preventDefault();
            });
            els.mainImageButton.addEventListener("pointermove", (event) => {
                if (!state.stageSplitDragging) return;
                setStageSplitFromEvent(event);
            });
            els.mainImageButton.addEventListener("pointerup", (event) => {
                if (!state.stageSplitDragging) return;
                state.stageSplitDragging = false;
                els.mainImageButton.releasePointerCapture?.(event.pointerId);
            });
            els.mainImageButton.addEventListener("pointercancel", () => {
                state.stageSplitDragging = false;
            });
        }
        els.mainImageButton.addEventListener("click", requestProbe);
    }

    renderSamples();
    bindEvents();
    requestEdge(state.tab);
}());
