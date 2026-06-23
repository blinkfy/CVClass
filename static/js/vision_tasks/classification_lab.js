(function () {
    const root = document.querySelector("[data-classification-lab]");
    if (!root) return;

    const api = window.CVClassVisionTasks || {};
    const dataRoot = api.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const bovwModelUrl = `${dataRoot}/classification_lab/bovw_flowers17_model.json`;
    const flowersSamplesUrl = `${dataRoot}/classification_lab/flowers17_samples.json`;
    const cnnDataRoot = window.cvclassUrl("/static/assets/data/classification");
    const legacyClassificationLabRoot = `${dataRoot}/classification_lab`;
    const localOrtScriptUrl = window.cvclassUrl("/static/vendor/onnxruntime-web/ort.min.js");
    const localOrtWasmBase = window.cvclassUrl("/static/vendor/onnxruntime-web/");
    const cdnOrtScriptUrl = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js";
    const DATA_CACHE_KEY = "cvclass.classification_lab.data";
    const DATA_CACHE_VERSION = "v5";
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const initialParams = new URLSearchParams(window.location.search);
    const methodLabels = {
        bovw: "Trained BoVW · Oxford Flowers17",
        cnn: "CNN 端到端分类",
        compare: "BoVW vs CNN 对比",
    };
    const cnnModelLabels = {
        auto: "Auto CNN",
        flowers17: "Flowers17 CNN",
        squeezenet: "SqueezeNet 1.1",
        mobilenetv2: "MobileNetV2",
    };
    const bovwEngineLabels = {
        trained: "Trained BoVW · Oxford Flowers17",
        principle: "BoVW Principle Demo",
    };
    const featureLabels = {
        sift: "SIFT-like",
        orb: "ORB-like",
        preset: "预设局部特征",
    };
    const palette = ["#2563eb", "#f97316", "#22c55e", "#a855f7", "#eab308", "#06b6d4", "#ef4444", "#14b8a6", "#64748b", "#ec4899", "#84cc16", "#8b5cf6"];
    const visualWordMeanings = [
        "edge-like patch",
        "corner-like patch",
        "texture-like patch",
        "blob-like patch",
        "stripe-like patch",
        "contrast patch",
        "junction-like patch",
        "smooth-region patch",
    ];
    const bovwStepLabels = {
        image: "Image",
        "local-features": "Local Features",
        "visual-words": "Visual Words",
        histogram: "Histogram",
        classifier: "Classifier",
        topk: "Top-K Prediction",
    };
    const cnnAnimationStages = [
        {
            key: "input",
            label: "输入图像",
            title: "当前输入图像",
            input: "上传或样例图像",
            output: "浏览器图像像素",
            formula: "I \\in R^{H\\times W\\times 3}",
            explanation: "读取当前图片。动画展示的是教学化路径，真实分类仍由 ONNX Runtime Web 对当前图片执行 session.run。",
        },
        {
            key: "preprocess",
            label: "图像预处理",
            title: "尺寸缩放 / 归一化 / NCHW 张量",
            input: "图像像素",
            output: "1x3x224x224 张量",
            formula: "x = normalize(resize(I, 224))",
            explanation: "原图缩放到模型输入尺寸，RGB 三通道拆成平面并按 mean/std 归一化，再组织成 NCHW tensor。",
        },
        {
            key: "conv",
            label: "卷积计算",
            title: "3x3 卷积滑动窗口",
            input: "局部 3x3 图像块",
            output: "单个特征响应值",
            formula: "y = sum(x_i * w_i) + b",
            explanation: "卷积核在局部窗口滑动，对应像素值与权重相乘并累加，生成 feature map 中的一个响应值。",
        },
        {
            key: "feature",
            label: "特征图组",
            title: "多层级特征提取图组",
            input: "多通道卷积响应值",
            output: "浅层 / 中层 / 深层语义特征图",
            formula: "F = CNNFeatureExtractor(x)",
            explanation: "浅层关注边缘、颜色和纹理；中层响应局部形状；高层形成物体部件和类别相关响应。",
        },
        {
            key: "pooling",
            label: "全局池化",
            title: "全局池化特征降维",
            input: "H x W x C 特征图",
            output: "1 x 1 x C 紧凑向量",
            formula: "v_c = mean_{h,w}(F_{h,w,c})",
            explanation: "每张 feature map 的空间响应向下汇聚，压缩成一个 pooled 数值，多张图组成表示向量。",
        },
        {
            key: "classifier",
            label: "模型分类器",
            title: "分类决策头 (Linear Head)",
            input: "池化后的特征向量",
            output: "类别置信度 (Logits)",
            formula: "z = Wv + b",
            explanation: "表示向量通过分类器权重连接到类别节点，数值沿连线流动并形成 logits。",
        },
        {
            key: "softmax",
            label: "Softmax 输出",
            title: "Softmax 归一化 Top-5",
            input: "置信度 (Logits)",
            output: "排序后的预测概率",
            formula: "p_i = exp(z_i) / sum_j exp(z_j)",
            explanation: "logits 条形图经 softmax 转为概率，Top-5 重新排序并与真实 session.run 输出联动。",
        },
    ];
    const compareStages = [
        { key: "input", label: "Input", bovw: "image + feature points", cnn: "image tensor + sliding window" },
        { key: "representation", label: "Representation", bovw: "visual words + histogram", cnn: "feature maps + pooled vector" },
        { key: "classifier", label: "Classifier", bovw: "logistic regression", cnn: "classifier head logits" },
        { key: "topk", label: "Top-K", bovw: "flower class scores", cnn: "softmax Top-5" },
    ];
    const bovwPrototypeLabels = ["原型 A", "原型 B", "原型 C", "原型 D", "原型 E", "原型 F"];
    const state = {
        data: null,
        demoData: null,
        flowerData: null,
        bovwModel: null,
        bovwModelReady: false,
        sampleId: "",
        uploadedItem: null,
        method: "bovw",
        bovwEngine: "trained",
        vocabSize: 128,
        featureType: "sift",
        topK: 5,
        features: [],
        words: [],
        assignments: [],
        assignmentDistances: [],
        histogram: [],
        normalizedHistogram: [],
        bovwScores: [],
        imageSignature: null,
        imageBitmap: null,
        selectedFeatureId: 0,
        hoverFeatureId: null,
        representativeFeatureIds: new Set(),
        activeBovwStep: "local-features",
        cnnOnnxSession: null,
        cnnOnnxStatus: "idle",
        cnnOnnxConfig: null,
        cnnLabels: [],
        cnnRealScores: [],
        cnnInferenceMs: 0,
        cnnInputName: null,
        cnnOutputName: null,
        cnnModelKind: "concept",
        cnnModelMessage: "",
        cnnModelUrl: "",
        cnnInferenceKey: "",
        cnnInferencePendingKey: "",
        cnnModelChoice: "flowers17",
        cnnLoadedChoice: "",
        imagenetZhLabels: [],
        cnnStageIndex: 0,
        cnnAnimationPlaying: true,
        cnnAnimationAutoplay: true,
        cnnAnimationTick: 0,
        cnnAnimationTimer: null,
        cnnAnimationImageKey: "",
        compareStage: "representation",
    };

    const els = {
        sample: $("[data-cls-sample]"),
        upload: $("[data-cls-upload]"),
        methods: $$("[data-cls-method]"),
        bovwControls: $("[data-cls-bovw-controls]"),
        cnnControls: $("[data-cls-cnn-controls]"),
        cnnModel: $("[data-cls-cnn-model]"),
        cnnSampleHint: $("[data-cls-cnn-sample-hint]"),
        bovwEngine: $("[data-cls-bovw-engine]"),
        vocabSize: $("[data-cls-vocab-size]"),
        featureType: $("[data-cls-feature-type]"),
        topK: null,
        activeMethod: $("[data-cls-active-method]"),
        inputSize: $("[data-cls-input-size]"),
        featureCount: $("[data-cls-feature-count]"),
        vocabReadout: $("[data-cls-vocab-readout]"),
        vectorDim: $("[data-cls-vector-dim]"),
        top1: $("[data-cls-top1]"),
        status: $("[data-cls-status]"),

        modePanels: $$("[data-cls-mode]"),

        bovwImage: $("[data-cls-bovw-image]"),
        bovwMissing: $("[data-cls-bovw-missing]"),
        bovwOverlay: $("[data-cls-bovw-overlay]"),
        bovwFeatureCard: $("[data-cls-bovw-feature-card]"),
        bovwChain: $("[data-cls-bovw-chain]"),
        bovwFlowSteps: $$("[data-cls-bovw-step]"),
        bovwDictionary: $("[data-cls-bovw-dictionary]"),
        bovwHistogram: $("[data-cls-bovw-histogram]"),
        bovwHistVector: $("[data-cls-bovw-hist-vector]"),
        bovwHistVote: $("[data-cls-bovw-hist-vote]"),
        bovwClassifierFlow: $("[data-cls-bovw-classifier-flow]"),
        bovwScoreList: $("[data-cls-bovw-score-list]"),
        bovwTopkTitle: $("[data-cls-bovw-topk-title]"),
        bovwTopkSubtitle: $("[data-cls-bovw-topk-subtitle]"),
        bovwTopkNote: $("[data-cls-bovw-topk-note]"),
        bovwInferenceProof: $("[data-cls-bovw-inference-proof]"),

        cnnImage: $("[data-cls-cnn-image]"),
        cnnMissing: $("[data-cls-cnn-missing]"),
        cnnInputOverlay: $("[data-cls-cnn-input-overlay]"),
        cnnGuidance: $("[data-cls-cnn-guidance]"),
        cnnStageSteps: $("[data-cls-cnn-stage-steps]"),
        cnnAnimationStage: $("[data-cls-cnn-animation-stage]"),
        cnnStageTitle: $("[data-cls-cnn-stage-title]"),
        cnnStageKicker: $("[data-cls-cnn-stage-kicker]"),
        cnnStageExplanation: $("[data-cls-cnn-stage-explanation]"),
        cnnStageInput: $("[data-cls-cnn-stage-input]"),
        cnnStageOutput: $("[data-cls-cnn-stage-output]"),
        cnnStageFormula: $("[data-cls-cnn-stage-formula]"),
        cnnPlay: $("[data-cls-cnn-play]"),
        cnnPause: $("[data-cls-cnn-pause]"),
        cnnNext: $("[data-cls-cnn-next]"),
        cnnAuto: $("[data-cls-cnn-auto]"),
        cnnMaps: $("[data-cls-cnn-maps]"),
        cnnGlobal: $("[data-cls-cnn-global]"),
        cnnScoreList: $("[data-cls-cnn-score-list]"),
        cnnModelProof: $("[data-cls-cnn-model-proof]"),

        compareBovwImage: $("[data-cls-compare-bovw-image]"),
        compareFlow: $("[data-cls-compare-flow]"),
        compareBovwRoute: $("[data-cls-compare-bovw-route]"),
        compareCnnRoute: $("[data-cls-compare-cnn-route]"),
        compareBovwOverlay: $("[data-cls-compare-bovw-overlay]"),
        compareBovwHist: $("[data-cls-compare-bovw-hist]"),
        compareBovwScores: $("[data-cls-compare-bovw-scores]"),
        compareCnnImage: $("[data-cls-compare-cnn-image]"),
        compareCnnOverlay: $("[data-cls-compare-cnn-overlay]"),
        compareCnnMaps: $("[data-cls-compare-cnn-maps]"),
        compareCnnGlobal: $("[data-cls-compare-cnn-global]"),
        compareCnnScores: $("[data-cls-compare-cnn-scores]"),
        compareDiff: $("[data-cls-compare-diff]"),

        notesMethod: $("[data-cls-notes-method]"),
        notesMethodDesc: $("[data-cls-notes-method-desc]"),
        notesFormulaTitle: $("[data-cls-notes-formula-title]"),
        notesFormula: $("[data-cls-notes-formula]"),
        notesFormulaNote: $("[data-cls-notes-formula-note]"),
        statSelectedFeature: $("[data-cls-stat-selected-feature]"),
        statSelectedWord: $("[data-cls-stat-selected-word]"),
        statSelectedDistance: $("[data-cls-stat-selected-distance]"),
        statSelectedBin: $("[data-cls-stat-selected-bin]"),
        notesSteps: $("[data-cls-notes-steps]"),

        stepper: $$("[data-cls-phase]").length ? $$("[data-cls-phase]") : null,
    };

    if (["bovw", "cnn", "compare"].includes(initialParams.get("method"))) {
        state.method = initialParams.get("method");
    }
    if (initialParams.get("focus") === "topk") {
        state.topK = 5;
    }
    if (["flowers17", "squeezenet", "mobilenetv2"].includes(initialParams.get("cnnModel"))) {
        state.cnnModelChoice = initialParams.get("cnnModel");
    }
    els.methods.forEach((item) => {
        const active = item.dataset.clsMethod === state.method;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (els.topK) els.topK.value = String(state.topK);
    if (els.vocabSize) els.vocabSize.value = String(state.vocabSize);
    if (els.bovwEngine) els.bovwEngine.value = state.bovwEngine;
    if (els.cnnModel) els.cnnModel.value = state.cnnModelChoice;

    const flowerNameTranslations = {
        "daffodil": "黄水仙 (daffodil)",
        "snowdrop": "雪滴花 (snowdrop)",
        "lily_of_the_valley": "谷中百合 (lily of the valley)",
        "bluebell": "蓝铃花 (bluebell)",
        "crocus": "番红花 (crocus)",
        "iris": "鸢尾花 (iris)",
        "tigerlily": "虎皮百合 (tigerlily)",
        "tulip": "郁金香 (tulip)",
        "fritillary": "贝母花 (fritillary)",
        "sunflower": "向日葵 (sunflower)",
        "daisy": "雏菊 (daisy)",
        "coltsfoot": "款冬 (coltsfoot)",
        "dandelion": "蒲公英 (dandelion)",
        "cowslip": "黄花九轮草 (cowslip)",
        "buttercup": "毛茛花 (buttercup)",
        "windflower": "秋牡丹 (windflower)",
        "pansy": "三色堇 (pansy)",
        // 示例图名称翻译
        "Crosswalk People": "人行横道 (Crosswalk People)",
        "Classroom Students": "教室学生 (Classroom Students)",
        "Traffic Street": "交通街道 (Traffic Street)",
        "Boat & Water": "船只与水面 (Boat & Water)",
        "Red Apples": "红苹果 (Red Apples)",
        "Market Stall": "市场摊位 (Market Stall)",
        "Daffodil Flower": "黄水仙花 (Daffodil Flower)",
        "Snowdrop Flower": "雪滴花 (Snowdrop Flower)",
        "Lily of the Valley": "谷中百合 (Lily of the Valley)",
        // ImageNet 常见类别翻译 (用于 CNN 真实推理结果展示)
        "trombone": "长号 (trombone)",
        "cornet": "短号 (cornet)",
        "kimono": "和服 (kimono)",
        "grocery store": "杂货店 (grocery store)",
        "grocery_store": "杂货店 (grocery store)",
        "bow": "蝴蝶结/弓 (bow)",
        "violin": "小提琴 (violin)",
        "flute": "长笛 (flute)",
        "oboe": "双簧管 (oboe)",
        "sax": "萨克斯 (sax)",
        "saxophone": "萨克斯 (saxophone)",
        "french horn": "圆号 (french horn)",
        "french_horn": "圆号 (french horn)",
        "acoustic guitar": "原声吉他 (acoustic guitar)",
        "acoustic_guitar": "原声吉他 (acoustic guitar)",
        "electric guitar": "电吉他 (electric guitar)",
        "electric_guitar": "电吉他 (electric guitar)",
        "banjo": "班卓琴 (banjo)",
        "harp": "竖琴 (harp)",
        "cello": "大提琴 (cello)",
        "grand piano": "大钢琴 (grand piano)",
        "grand_piano": "大钢琴 (grand piano)",
        "upright piano": "立式钢琴 (upright piano)",
        "upright_piano": "立式钢琴 (upright piano)",
        "accordion": "手风琴 (accordion)",
        "chime": "编钟 (chime)",
        "marimba": "马林巴 (marimba)",
        "drum": "鼓 (drum)",
        "gong": "锣 (gong)",
        "tambourine": "铃鼓 (tambourine)"
    };

    const translateSampleName = (name) => {
        if (!name) return "";
        // 匹配 "Daffodil · sample 01" 这种格式
        const parts = name.split(" · ");
        if (parts.length === 2) {
            const key = parts[0].toLowerCase().replace(/\s+/g, "_");
            const translatedKey = flowerNameTranslations[key] || parts[0];
            // 提取括号前的中文，或者直接使用翻译后的文本
            const chineseName = translatedKey.split(" (")[0];
            return `${chineseName} · 样例 ${parts[1].replace("sample ", "")}`;
        }
        return flowerNameTranslations[name] || name;
    };

    const escapeHtml = (value) => {
        const str = String(value ?? "");
        // 优先匹配翻译表，如果没匹配到，则尝试将下划线替换为空格后再次匹配
        const key = str.toLowerCase();
        const keyWithSpaces = key.replace(/_/g, " ");
        return flowerNameTranslations[key] || flowerNameTranslations[keyWithSpaces] || str;
    };

    function sample() {
        if (state.uploadedItem) return state.uploadedItem;
        const data = activeData();
        return data?.samples.find((item) => item.id === state.sampleId) || data?.samples[0];
    }

    function activeData() {
        if (state.method === "cnn") {
            if (state.cnnModelKind === "flowers17") return state.flowerData || state.demoData || state.data;
            return state.demoData || state.data;
        }
        if (isTrainedBovwActive()) return state.flowerData || state.demoData || state.data;
        return state.demoData || state.data;
    }

    function isTrainedBovwActive() {
        return state.bovwEngine === "trained" && state.bovwModelReady && !!state.bovwModel;
    }

    function activeBovwLabel() {
        if (state.bovwEngine === "principle" || !state.bovwModelReady) return bovwEngineLabels.principle;
        return bovwEngineLabels.trained;
    }

    function hashSeed(text) {
        let seed = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            seed ^= text.charCodeAt(i);
            seed = Math.imul(seed, 16777619);
        }
        return seed >>> 0;
    }

    function randomFactory(seed) {
        let value = seed || 1;
        return function rand() {
            value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
            return value / 4294967296;
        };
    }

    function setPhase(phase) {
        if (els.stepper) {
            els.stepper.forEach((item) => item.classList.toggle("is-active", item.dataset.clsPhase === phase));
        }
    }

    function cnnScores(item) {
        const key = item?.image ? `${state.cnnModelKind}|${state.cnnModelUrl}|${item.image}` : "";
        if (key && state.cnnInferenceKey === key && Array.isArray(state.cnnRealScores) && state.cnnRealScores.length) {
            return state.cnnRealScores;
        }
        return item.cnn?.top5 || [];
    }

    function bovwScores() {
        return state.bovwScores || [];
    }

    function readPixel(data, width, height, x, y) {
        const px = clamp(Math.round(x), 0, width - 1);
        const py = clamp(Math.round(y), 0, height - 1);
        const offset = (py * width + px) * 4;
        const r = data[offset] / 255;
        const g = data[offset + 1] / 255;
        const b = data[offset + 2] / 255;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        return { r, g, b, luma };
    }

    function patchDescriptor(imageData, px, py, patchRadius) {
        const { data, width, height } = imageData;
        let lumaSum = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let gradSum = 0;
        let verticalSum = 0;
        let horizontalSum = 0;
        let sampleCount = 0;
        const values = [];
        const step = Math.max(1, Math.round(patchRadius / 3));
        for (let yy = -patchRadius; yy <= patchRadius; yy += step) {
            for (let xx = -patchRadius; xx <= patchRadius; xx += step) {
                const pixel = readPixel(data, width, height, px + xx, py + yy);
                const left = readPixel(data, width, height, px + xx - 1, py + yy).luma;
                const right = readPixel(data, width, height, px + xx + 1, py + yy).luma;
                const up = readPixel(data, width, height, px + xx, py + yy - 1).luma;
                const down = readPixel(data, width, height, px + xx, py + yy + 1).luma;
                const gx = right - left;
                const gy = down - up;
                lumaSum += pixel.luma;
                rSum += pixel.r;
                gSum += pixel.g;
                bSum += pixel.b;
                gradSum += Math.sqrt(gx * gx + gy * gy);
                verticalSum += Math.abs(gx);
                horizontalSum += Math.abs(gy);
                values.push(pixel.luma);
                sampleCount += 1;
            }
        }
        const mean = lumaSum / Math.max(1, sampleCount);
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, sampleCount);
        const colorfulness = (Math.max(rSum, gSum, bSum) - Math.min(rSum, gSum, bSum)) / Math.max(1, sampleCount);
        return [
            clamp(mean, 0, 1),
            clamp(Math.sqrt(variance) * 2.4, 0, 1),
            clamp((gradSum / Math.max(1, sampleCount)) * 3.2, 0, 1),
            clamp(verticalSum / Math.max(0.001, verticalSum + horizontalSum), 0, 1),
            clamp(rSum / Math.max(1, sampleCount), 0, 1),
            clamp(gSum / Math.max(1, sampleCount), 0, 1),
            clamp(bSum / Math.max(1, sampleCount), 0, 1),
            clamp(colorfulness * 2.2, 0, 1),
        ];
    }

    function buildImageSignature(imageData) {
        const { data, width, height } = imageData;
        let luma = 0;
        let saturation = 0;
        let edge = 0;
        let samples = 0;
        const step = Math.max(4, Math.round(Math.min(width, height) / 32));
        for (let y = step; y < height - step; y += step) {
            for (let x = step; x < width - step; x += step) {
                const pixel = readPixel(data, width, height, x, y);
                const left = readPixel(data, width, height, x - 1, y).luma;
                const right = readPixel(data, width, height, x + 1, y).luma;
                const up = readPixel(data, width, height, x, y - 1).luma;
                const down = readPixel(data, width, height, x, y + 1).luma;
                luma += pixel.luma;
                saturation += Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
                edge += Math.sqrt((right - left) ** 2 + (down - up) ** 2);
                samples += 1;
            }
        }
        return {
            luma: luma / Math.max(1, samples),
            saturation: saturation / Math.max(1, samples),
            edge: edge / Math.max(1, samples),
            aspect: width / Math.max(1, height),
        };
    }

    function generateFeaturesFromImage(imageData) {
        const rand = randomFactory(hashSeed(`${sample()?.id || "image"}-${state.featureType}-${state.vocabSize}-${imageData.width}x${imageData.height}`));
        const countBase = state.featureType === "orb" ? 48 : state.featureType === "preset" ? 36 : 64;
        const count = countBase + Math.round(rand() * 12);
        const features = [];
        const anchors = [[18, 48], [34, 64], [52, 52], [72, 38], [78, 66], [42, 28], [60, 76], [28, 30]];
        for (let i = 0; i < count; i += 1) {
            const anchor = anchors[i % anchors.length];
            const spread = state.featureType === "orb" ? 11 : state.featureType === "preset" ? 7 : 9;
            const x = Math.max(4, Math.min(96, anchor[0] + (rand() - 0.5) * spread * 2 + (i % 3) * 1.6));
            const y = Math.max(5, Math.min(95, anchor[1] + (rand() - 0.5) * spread * 2));
            const scale = state.featureType === "orb" ? 3 + rand() * 3 : 4 + rand() * 5;
            const angle = Math.round(rand() * 360);
            const px = (x / 100) * (imageData.width - 1);
            const py = (y / 100) * (imageData.height - 1);
            const descriptor = patchDescriptor(imageData, px, py, Math.max(4, Math.round(scale * 1.35)));
            features.push({ id: i, x, y, scale, angle, descriptor });
        }
        return features;
    }

    function generateTrainedBovwFeatures(imageData) {
        const count = 128;
        const width = imageData.width;
        const height = imageData.height;
        const patchRadius = Math.max(4, Math.round(Math.min(width, height) * 0.018));
        const stride = Math.max(8, Math.round(Math.min(width, height) / 16));
        const candidates = [];
        for (let y = patchRadius; y < height - patchRadius; y += stride) {
            for (let x = patchRadius; x < width - patchRadius; x += stride) {
                const descriptor = patchDescriptor(imageData, x, y, patchRadius);
                candidates.push({ x, y, descriptor, strength: descriptor[2] });
            }
        }
        candidates.sort((a, b) => b.strength - a.strength);
        const strongCount = Math.min(candidates.length, Math.round(count * 0.72));
        const selected = candidates.slice(0, strongCount);
        const step = Math.max(1, Math.floor(candidates.length / Math.max(1, count - selected.length)));
        for (let i = 0; selected.length < count && i < candidates.length; i += step) {
            if (!selected.includes(candidates[i])) selected.push(candidates[i]);
        }
        for (let i = 0; selected.length < count && i < candidates.length; i += 1) {
            if (!selected.includes(candidates[i])) selected.push(candidates[i]);
        }
        return selected.slice(0, count).map((feature, index) => ({
            id: index,
            x: clamp((feature.x / Math.max(1, width - 1)) * 100, 4, 96),
            y: clamp((feature.y / Math.max(1, height - 1)) * 100, 5, 95),
            scale: Math.max(3.2, patchRadius * 0.85),
            angle: Math.round((Math.atan2(feature.descriptor[3] - 0.5, feature.descriptor[2]) * 180) / Math.PI),
            descriptor: feature.descriptor,
        }));
    }

    function generateWords() {
        if (isTrainedBovwActive()) {
            return state.bovwModel.codebook.map((descriptor, index) => ({
                id: index,
                color: palette[index % palette.length],
                descriptor,
            }));
        }
        const words = [];
        const columns = Math.ceil(Math.sqrt(state.vocabSize));
        for (let i = 0; i < state.vocabSize; i += 1) {
            const gx = (i % columns) / Math.max(1, columns - 1);
            const gy = Math.floor(i / columns) / Math.max(1, columns - 1);
            const rand = randomFactory(hashSeed(`codebook-${state.vocabSize}-${i}`));
            words.push({
                id: i,
                color: palette[i % palette.length],
                descriptor: [
                    clamp(gx * 0.82 + 0.08 + (rand() - 0.5) * 0.12, 0, 1),
                    clamp(gy * 0.82 + 0.08 + (rand() - 0.5) * 0.12, 0, 1),
                    clamp(((i * 37) % 101) / 100 + (rand() - 0.5) * 0.18, 0, 1),
                    clamp(((i * 61) % 97) / 96 + (rand() - 0.5) * 0.18, 0, 1),
                    clamp(0.18 + ((i * 17) % 83) / 100 + (rand() - 0.5) * 0.14, 0, 1),
                    clamp(0.16 + ((i * 29) % 79) / 100 + (rand() - 0.5) * 0.14, 0, 1),
                    clamp(0.14 + ((i * 43) % 73) / 100 + (rand() - 0.5) * 0.14, 0, 1),
                    clamp(((i * 19) % 89) / 88 + (rand() - 0.5) * 0.16, 0, 1),
                ],
            });
        }
        return words;
    }

    function classifierWeights(classIndex, vocabSize) {
        const rand = randomFactory(hashSeed(`bovw-linear-${vocabSize}-${classIndex}`));
        const center = (classIndex * 5 + 3) % Math.max(1, vocabSize);
        return Array.from({ length: vocabSize }, (_, wordIndex) => {
            const circularDistance = Math.min(Math.abs(wordIndex - center), vocabSize - Math.abs(wordIndex - center));
            const locality = Math.exp(-(circularDistance ** 2) / Math.max(6, vocabSize * 0.72));
            const wave = Math.sin((wordIndex + 1) * (classIndex + 2) * 0.53) * 0.16;
            return (locality * 1.05) + wave + (rand() - 0.5) * 0.2 - 0.18;
        });
    }

    function calibratedBovwScores(item) {
        const preset = item?.bovw?.top5;
        if (!Array.isArray(preset) || !preset.length || item?.objectUrl) return null;
        return preset.map((entry) => ({
            label: entry.label,
            score: entry.score,
            source: "calibrated-demo",
        }));
    }

    function computePrototypeScores(histogram, signature) {
        const total = Math.max(1, histogram.reduce((sum, count) => sum + count, 0));
        const normalized = histogram.map((count) => count / total);
        state.normalizedHistogram = normalized;
        const logits = bovwPrototypeLabels.map((label, classIndex) => {
            const weights = classifierWeights(classIndex, histogram.length);
            let logit = weights.reduce((sum, weight, index) => sum + weight * normalized[index], 0);
            logit += (signature?.edge || 0) * (classIndex % 3 === 0 ? 0.72 : -0.12);
            logit += (signature?.saturation || 0) * (classIndex % 3 === 1 ? 0.62 : -0.08);
            logit += (signature?.luma || 0) * (classIndex % 3 === 2 ? 0.42 : -0.05);
            logit += Math.abs((signature?.aspect || 1) - 1.4) * (classIndex === 0 || classIndex === 3 ? 0.18 : -0.04);
            return { label, logit };
        });
        const maxLogit = Math.max(...logits.map((item) => item.logit));
        const expScores = logits.map((item) => ({ ...item, exp: Math.exp((item.logit - maxLogit) * 4.2) }));
        const expTotal = expScores.reduce((sum, item) => sum + item.exp, 0) || 1;
        return expScores
            .map((item) => ({ label: item.label, score: item.exp / expTotal, logit: item.logit, source: "prototype-demo" }))
            .sort((a, b) => b.score - a.score);
    }

    function normalizeBovwHistogram(histogram) {
        const total = Math.max(1, histogram.reduce((sum, count) => sum + count, 0));
        const normalized = histogram.map((count) => count / total);
        if (state.bovwModel?.histogram?.normalization === "l1_sqrt") {
            return normalized.map((value) => Math.sqrt(value));
        }
        return normalized;
    }

    function computeTrainedBovwScores(histogram) {
        if (!isTrainedBovwActive()) return null;
        const model = state.bovwModel;
        const normalized = normalizeBovwHistogram(histogram);
        state.normalizedHistogram = normalized;
        const logits = model.labels.map((label, classIndex) => {
            const weights = model.classifier.weights[classIndex] || [];
            let logit = model.classifier.bias[classIndex] || 0;
            for (let index = 0; index < normalized.length; index += 1) {
                logit += (weights[index] || 0) * normalized[index];
            }
            return { label, logit };
        });
        const maxLogit = Math.max(...logits.map((item) => item.logit));
        const expScores = logits.map((item) => ({ ...item, exp: Math.exp(item.logit - maxLogit) }));
        const expTotal = expScores.reduce((sum, item) => sum + item.exp, 0) || 1;
        return expScores
            .map((item) => ({
                label: item.label,
                score: item.exp / expTotal,
                logit: item.logit,
                source: "trained-flowers17",
            }))
            .sort((a, b) => b.score - a.score);
    }

    function computeBovwScores(item, histogram, signature) {
        const trainedScores = computeTrainedBovwScores(histogram);
        if (trainedScores) return trainedScores;
        if (state.bovwEngine === "principle") {
            return computePrototypeScores(histogram, signature);
        }
        const calibrated = calibratedBovwScores(item);
        if (calibrated) {
            const total = Math.max(1, histogram.reduce((sum, count) => sum + count, 0));
            state.normalizedHistogram = histogram.map((count) => count / total);
            return calibrated;
        }
        return computePrototypeScores(histogram, signature);
    }

    function distance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i += 1) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }
        return sum;
    }

    function assignFeatures(features, words) {
        const assignments = [];
        const distances = [];
        const histogram = new Array(words.length).fill(0);
        features.forEach((feature) => {
            let best = 0;
            let bestDistance = Infinity;
            words.forEach((word) => {
                const d = distance(feature.descriptor, word.descriptor);
                if (d < bestDistance) {
                    bestDistance = d;
                    best = word.id;
                }
            });
            assignments.push(best);
            distances.push(Math.sqrt(bestDistance));
            histogram[best] += 1;
        });
        return { assignments, histogram, distances };
    }

    async function loadImageBitmap(item) {
        if (!item?.image) return null;
        if (state.imageBitmap?.key === item.image) return state.imageBitmap;
        return new Promise((resolve) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                const maxSide = 320;
                const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
                const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
                const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                context.drawImage(image, 0, 0, width, height);
                const imageData = context.getImageData(0, 0, width, height);
                state.imageBitmap = { key: item.image, width, height, imageData };
                resolve(state.imageBitmap);
            };
            image.onerror = () => resolve(null);
            image.src = item.image;
        });
    }

    async function fetchOk(url) {
        try {
            const response = await fetch(url, { method: "HEAD", cache: "no-store" });
            return response.ok;
        } catch (_error) {
            return false;
        }
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-cls-dynamic-script="${url}"]`);
            if (existing) {
                if (existing.dataset.loaded === "true") resolve();
                else existing.addEventListener("load", resolve, { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = url;
            script.async = true;
            script.dataset.clsDynamicScript = url;
            script.onload = () => {
                script.dataset.loaded = "true";
                resolve();
            };
            script.onerror = () => reject(new Error(`script failed: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function ensureOrtRuntime() {
        if (!window.ort) {
            try {
                await loadScript(localOrtScriptUrl);
            } catch (_localError) {
                await loadScript(cdnOrtScriptUrl);
            }
        }
        if (!window.ort) throw new Error("ONNX Runtime Web 加载失败");
        const wasmEnv = window.ort.env?.wasm;
        if (wasmEnv) {
            wasmEnv.wasmPaths = localOrtWasmBase;
            wasmEnv.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
        }
        if (window.ort.env) window.ort.env.logLevel = "error";
        return window.ort;
    }

    function normalizeCnnConfig(config = {}) {
        return {
            inputSize: Number(config.input_size || config.inputSize || 224),
            mean: Array.isArray(config.mean) ? config.mean : [0.485, 0.456, 0.406],
            std: Array.isArray(config.std) ? config.std : [0.229, 0.224, 0.225],
            topK: Number(config.top_k || config.topK || 5),
            inputLayout: config.input_layout || config.inputLayout || "NCHW",
            modelName: config.model_name || config.modelName || "CNN ONNX",
            modelUrl: config.model_url || config.modelUrl || "",
            labelsUrl: config.labels_url || config.labelsUrl || "",
            inputName: config.input_name || config.inputName || "",
            outputName: config.output_name || config.outputName || "",
        };
    }

    async function loadLabelsFromCandidates(candidates) {
        for (const url of candidates.filter(Boolean)) {
            try {
                const labels = await loadJson(url, "cnn labels", false);
                if (Array.isArray(labels) && labels.length) return labels;
                if (Array.isArray(labels?.labels) && labels.labels.length) return labels.labels;
            } catch (_error) {
                // try next candidate
            }
        }
        return [];
    }

    async function createCnnSession(modelUrl, config, labels, kind, message) {
        const ortRuntime = await ensureOrtRuntime();
        const session = await ortRuntime.InferenceSession.create(modelUrl, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
        });
        state.cnnOnnxSession = session;
        state.cnnOnnxConfig = normalizeCnnConfig(config);
        state.cnnLabels = labels;
        state.cnnInputName = state.cnnOnnxConfig.inputName || session.inputNames?.[0] || null;
        state.cnnOutputName = state.cnnOnnxConfig.outputName || session.outputNames?.[0] || null;
        state.cnnModelKind = kind;
        state.cnnModelUrl = modelUrl;
        state.cnnModelMessage = message;
        state.cnnOnnxStatus = "ready";
        state.cnnLoadedChoice = state.cnnModelChoice;
        return session;
    }

    function resetCnnInferenceState(message = "") {
        if (state.cnnOnnxSession?.release) {
            state.cnnOnnxSession.release().catch((error) => console.warn("classification cnn session release failed", error));
        }
        state.cnnOnnxSession = null;
        state.cnnOnnxStatus = "idle";
        state.cnnOnnxConfig = null;
        state.cnnLabels = [];
        state.cnnRealScores = [];
        state.cnnInferenceMs = 0;
        state.cnnInputName = null;
        state.cnnOutputName = null;
        state.cnnModelKind = "concept";
        state.cnnModelMessage = message;
        state.cnnModelUrl = "";
        state.cnnInferenceKey = "";
        state.cnnInferencePendingKey = "";
        state.cnnLoadedChoice = "";
    }

    function cloneCnnConfig(config, overrides = {}) {
        return normalizeCnnConfig({ ...(config || {}), ...overrides });
    }

    async function tryLoadCnnCandidate(candidate) {
        const modelUrl = candidate.config.modelUrl || candidate.modelUrl;
        if (!modelUrl || !(await fetchOk(modelUrl))) return null;
        const labels = await loadLabelsFromCandidates(candidate.labelUrls);
        if (!labels.length) return null;
        return createCnnSession(modelUrl, candidate.config, labels, candidate.kind, candidate.message);
    }

    async function loadCnnOnnxModel() {
        if (state.cnnOnnxStatus === "ready" && state.cnnOnnxSession && state.cnnLoadedChoice === state.cnnModelChoice) return state.cnnOnnxSession;
        if (state.cnnOnnxStatus === "loading") return null;
        state.cnnOnnxStatus = "loading";
        state.cnnModelMessage = "正在加载 CNN ONNX 模型...";
        render();

        try {
            const rawFlowersConfig = await loadJson(`${cnnDataRoot}/flowers17_cnn_config.json`, "flowers17 cnn config", false);
            const flowersConfig = normalizeCnnConfig(rawFlowersConfig || {});
            const flowersModelUrl = flowersConfig.modelUrl || `${cnnDataRoot}/flowers17_cnn.onnx`;
            if (rawFlowersConfig?.available !== false && await fetchOk(flowersModelUrl)) {
                const flowersLabels = await loadLabelsFromCandidates([
                    flowersConfig.labelsUrl,
                    `${cnnDataRoot}/flowers17_classes.json`,
                ]);
                if (flowersLabels.length) {
                    return createCnnSession(flowersModelUrl, flowersConfig, flowersLabels, "flowers17", "Flowers17 CNN ONNX 已加载，Top-K 来自 session.run。");
                }
            }

            const imagenetConfig = normalizeCnnConfig(await loadJson(`${cnnDataRoot}/classification_config.json`, "classification config", false) || {});
            const imagenetModelCandidates = [
                imagenetConfig.modelUrl,
                `${cnnDataRoot}/squeezenet1_1.onnx`,
                `${cnnDataRoot}/mobilenetv2-10.onnx`,
                `${legacyClassificationLabRoot}/squeezenet1.1-7.onnx`,
                `${legacyClassificationLabRoot}/mobilenetv2-10.onnx`,
            ];
            const imagenetLabels = await loadLabelsFromCandidates([
                imagenetConfig.labelsUrl,
                `${cnnDataRoot}/imagenet_classes.json`,
                `${legacyClassificationLabRoot}/imagenet-simple-labels.json`,
            ]);
            for (const modelUrl of imagenetModelCandidates.filter(Boolean)) {
                if (!(await fetchOk(modelUrl))) continue;
                return createCnnSession(modelUrl, imagenetConfig, imagenetLabels, "imagenet", "ImageNet CNN ONNX 已加载，类别体系为 1000 类 ImageNet。");
            }

            state.cnnOnnxStatus = "missing";
            state.cnnModelKind = "concept";
            state.cnnModelMessage = "未找到 CNN ONNX 模型，当前保留概念展示。";
        } catch (error) {
            state.cnnOnnxStatus = "error";
            state.cnnModelKind = "concept";
            state.cnnModelMessage = `CNN ONNX 加载失败：${error.message || error}`;
            console.error("classification cnn model failed", error);
        }
        render();
        return null;
    }

    async function loadSelectedCnnOnnxModel() {
        if (state.cnnOnnxStatus === "ready" && state.cnnOnnxSession && state.cnnLoadedChoice === state.cnnModelChoice) return state.cnnOnnxSession;
        if (state.cnnOnnxStatus === "loading") return null;
        state.cnnOnnxStatus = "loading";
        state.cnnModelMessage = `正在加载 ${cnnModelLabels[state.cnnModelChoice] || "CNN"} ONNX 模型...`;
        render();

        try {
            const rawFlowersConfig = await loadJson(`${cnnDataRoot}/flowers17_cnn_config.json`, "flowers17 cnn config", false);
            const flowersConfig = normalizeCnnConfig(rawFlowersConfig || {});
            const flowersModelUrl = flowersConfig.modelUrl || `${cnnDataRoot}/flowers17_cnn.onnx`;
            const rawImagenetConfig = await loadJson(`${cnnDataRoot}/classification_config.json`, "classification config", false) || {};
            const imagenetConfig = normalizeCnnConfig(rawImagenetConfig);
            const imagenetLabelUrls = [
                imagenetConfig.labelsUrl,
                `${cnnDataRoot}/imagenet_classes.json`,
                `${legacyClassificationLabRoot}/imagenet-simple-labels.json`,
            ];
            const candidates = [
                {
                    key: "flowers17",
                    kind: "flowers17",
                    enabled: rawFlowersConfig?.available !== false,
                    modelUrl: flowersModelUrl,
                    config: flowersConfig,
                    labelUrls: [flowersConfig.labelsUrl, `${cnnDataRoot}/flowers17_classes.json`],
                    message: "Flowers17 CNN ONNX 已加载，Top-K 分数由 session.run 实时推理生成。",
                },
                {
                    key: "squeezenet",
                    kind: "imagenet",
                    enabled: true,
                    modelUrl: `${cnnDataRoot}/squeezenet1_1.onnx`,
                    config: cloneCnnConfig(rawImagenetConfig, {
                        model_name: "SqueezeNet 1.1 ImageNet",
                        model_url: `${cnnDataRoot}/squeezenet1_1.onnx`,
                    }),
                    labelUrls: imagenetLabelUrls,
                    message: "SqueezeNet 1.1 ImageNet ONNX 已加载，Top-K 分数由 session.run 实时推理生成。",
                },
                {
                    key: "squeezenet",
                    kind: "imagenet",
                    enabled: true,
                    modelUrl: `${legacyClassificationLabRoot}/squeezenet1.1-7.onnx`,
                    config: cloneCnnConfig(rawImagenetConfig, {
                        model_name: "SqueezeNet 1.1 ImageNet",
                        model_url: `${legacyClassificationLabRoot}/squeezenet1.1-7.onnx`,
                    }),
                    labelUrls: imagenetLabelUrls,
                    message: "SqueezeNet 1.1 ImageNet ONNX 已从备用路径加载，Top-K 分数由 session.run 实时推理生成。",
                },
                {
                    key: "mobilenetv2",
                    kind: "imagenet",
                    enabled: true,
                    modelUrl: `${cnnDataRoot}/mobilenetv2-10.onnx`,
                    config: cloneCnnConfig(rawImagenetConfig, {
                        model_name: "MobileNetV2 ImageNet",
                        model_url: `${cnnDataRoot}/mobilenetv2-10.onnx`,
                    }),
                    labelUrls: imagenetLabelUrls,
                    message: "MobileNetV2 ImageNet ONNX 已加载，Top-K 分数由 session.run 实时推理生成。",
                },
                {
                    key: "mobilenetv2",
                    kind: "imagenet",
                    enabled: true,
                    modelUrl: `${legacyClassificationLabRoot}/mobilenetv2-10.onnx`,
                    config: cloneCnnConfig(rawImagenetConfig, {
                        model_name: "MobileNetV2 ImageNet",
                        model_url: `${legacyClassificationLabRoot}/mobilenetv2-10.onnx`,
                    }),
                    labelUrls: imagenetLabelUrls,
                    message: "MobileNetV2 ImageNet ONNX 已从备用路径加载，Top-K 分数由 session.run 实时推理生成。",
                },
            ];
            if (imagenetConfig.modelUrl && !candidates.some((candidate) => candidate.modelUrl === imagenetConfig.modelUrl)) {
                candidates.splice(1, 0, {
                    key: "squeezenet",
                    kind: "imagenet",
                    enabled: true,
                    modelUrl: imagenetConfig.modelUrl,
                    config: imagenetConfig,
                    labelUrls: imagenetLabelUrls,
                    message: "ImageNet CNN ONNX 已加载，Top-K 分数由 session.run 实时推理生成。",
                });
            }
            const requestedCandidates = candidates.filter((candidate) => candidate.key === state.cnnModelChoice);
            for (const candidate of requestedCandidates) {
                if (!candidate.enabled) continue;
                const session = await tryLoadCnnCandidate(candidate);
                if (session) return session;
            }
            state.cnnOnnxStatus = "missing";
            state.cnnModelKind = "concept";
            state.cnnModelMessage = `未找到选定的 ${cnnModelLabels[state.cnnModelChoice] || "CNN"} ONNX 模型文件。当前保留概念流程演示。`;
        } catch (error) {
            state.cnnOnnxStatus = "error";
            state.cnnModelKind = "concept";
            state.cnnModelMessage = `CNN ONNX 模型加载失败: ${error.message || error}`;
            console.error("classification cnn model failed", error);
        }
        render();
        return null;
    }

    function softmax(values) {
        const maxValue = Math.max(...values);
        const expValues = values.map((value) => Math.exp(value - maxValue));
        const total = expValues.reduce((sum, value) => sum + value, 0) || 1;
        return expValues.map((value) => value / total);
    }

    function buildCnnInputTensor(item) {
        const config = state.cnnOnnxConfig || normalizeCnnConfig();
        const size = config.inputSize || 224;
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                const sourceWidth = image.naturalWidth || image.width;
                const sourceHeight = image.naturalHeight || image.height;
                const cropSize = Math.min(sourceWidth, sourceHeight);
                const sx = Math.max(0, Math.round((sourceWidth - cropSize) / 2));
                const sy = Math.max(0, Math.round((sourceHeight - cropSize) / 2));
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, size, size);
                const pixels = context.getImageData(0, 0, size, size).data;
                const input = new Float32Array(3 * size * size);
                const mean = config.mean;
                const std = config.std;
                for (let y = 0; y < size; y += 1) {
                    for (let x = 0; x < size; x += 1) {
                        const pixelOffset = (y * size + x) * 4;
                        const tensorOffset = y * size + x;
                        input[tensorOffset] = (pixels[pixelOffset] / 255 - mean[0]) / std[0];
                        input[size * size + tensorOffset] = (pixels[pixelOffset + 1] / 255 - mean[1]) / std[1];
                        input[2 * size * size + tensorOffset] = (pixels[pixelOffset + 2] / 255 - mean[2]) / std[2];
                    }
                }
                resolve(new window.ort.Tensor("float32", input, [1, 3, size, size]));
            };
            image.onerror = () => reject(new Error(`CNN image failed to load: ${item?.image || ""}`));
            image.src = item.image;
        });
    }

    async function runCnnInference(item) {
        if (!item?.image || state.cnnOnnxStatus !== "ready" || !state.cnnOnnxSession || !state.cnnInputName) return;
        const key = `${state.cnnModelKind}|${state.cnnModelUrl}|${item.image}`;
        if (state.cnnInferenceKey === key && state.cnnRealScores.length) return;
        if (state.cnnInferencePendingKey === key) return;
        state.cnnInferencePendingKey = key;
        state.cnnRealScores = [];
        state.cnnInferenceMs = 0;
        state.cnnModelMessage = state.cnnModelKind === "flowers17"
            ? "正在用 Flowers17 CNN 执行浏览器端推理..."
            : "正在用 ImageNet CNN 执行浏览器端推理...";
        render();
        try {
            const tensor = await buildCnnInputTensor(item);
            const startedAt = performance.now();
            const outputs = await state.cnnOnnxSession.run({ [state.cnnInputName]: tensor });
            state.cnnInferenceMs = performance.now() - startedAt;
            const outputName = state.cnnOutputName || Object.keys(outputs)[0];
            const output = outputs[outputName];
            const logits = Array.from(output.data || []);
            const probabilities = softmax(logits);
            const labels = state.cnnLabels.length ? state.cnnLabels : probabilities.map((_, index) => `class_${index}`);
            const isImagenet = state.cnnModelKind === "imagenet";
            const zhLabels = isImagenet ? (state.imagenetZhLabels || []) : [];
            state.cnnRealScores = probabilities
                .map((score, index) => ({
                    label: zhLabels[index] || labels[index] || `class_${index}`,
                    score,
                    source: "onnx-session-run",
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            state.cnnInferenceKey = key;
            state.cnnModelMessage = `ONNX session.run 完成，耗时 ${Math.round(state.cnnInferenceMs)} ms。`;
        } catch (error) {
            state.cnnOnnxStatus = "error";
            state.cnnModelKind = "concept";
            state.cnnModelMessage = `CNN 推理失败：${error.message || error}`;
            console.error("classification cnn inference failed", error);
        } finally {
            state.cnnInferencePendingKey = "";
            render();
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function visualWordMeaning(wordId) {
        return visualWordMeanings[wordId % visualWordMeanings.length];
    }

    function activeFeatureId() {
        if (Number.isInteger(state.hoverFeatureId) && state.features[state.hoverFeatureId]) return state.hoverFeatureId;
        if (Number.isInteger(state.selectedFeatureId) && state.features[state.selectedFeatureId]) return state.selectedFeatureId;
        return state.features[0]?.id ?? 0;
    }

    function activeBovwInfo() {
        const featureId = activeFeatureId();
        const feature = state.features[featureId] || state.features[0];
        const resolvedId = feature?.id ?? 0;
        const wordId = state.assignments[resolvedId] ?? 0;
        const word = state.words[wordId] || state.words[0] || { id: 0, color: palette[0] };
        return {
            feature,
            featureId: resolvedId,
            wordId,
            word,
            distance: state.assignmentDistances[resolvedId] ?? 0,
            count: state.histogram[wordId] || 0,
            meaning: visualWordMeaning(wordId),
        };
    }

    function buildRepresentativeFeatures() {
        const entries = state.histogram
            .map((count, id) => ({ count, id }))
            .filter((entry) => entry.count > 0)
            .sort((a, b) => b.count - a.count);
        const chosen = [];
        entries.slice(0, 7).forEach((entry) => {
            const members = state.features.filter((_, featureIndex) => state.assignments[featureIndex] === entry.id);
            if (!members.length) return;
            const pick = members.reduce((best, feature) => (feature.scale > best.scale ? feature : best), members[0]);
            chosen.push(pick.id);
        });
        for (let i = 0; chosen.length < 7 && i < state.features.length; i += Math.ceil(Math.max(1, state.features.length / 7))) {
            chosen.push(state.features[i].id);
        }
        state.representativeFeatureIds = new Set(chosen.slice(0, 7));
    }

    function ensureSelectedFeature() {
        if (!state.features.length) {
            state.selectedFeatureId = 0;
            state.hoverFeatureId = null;
            return;
        }
        if (!state.features[state.selectedFeatureId]) {
            const firstRepresentative = [...state.representativeFeatureIds][0];
            state.selectedFeatureId = Number.isInteger(firstRepresentative) ? firstRepresentative : state.features[0].id;
        }
        state.representativeFeatureIds.add(state.selectedFeatureId);
    }

    function rebuildRepresentation() {
        const item = sample();
        if (!item) return;
        const activeVocabSize = isTrainedBovwActive() ? state.bovwModel.vocab_size : state.vocabSize;
        const bitmap = state.imageBitmap?.key === item.image ? state.imageBitmap : null;
        if (!bitmap) {
            state.features = [];
            state.words = generateWords();
            state.assignments = [];
            state.assignmentDistances = [];
            state.histogram = new Array(activeVocabSize).fill(0);
            state.normalizedHistogram = new Array(activeVocabSize).fill(0);
            state.bovwScores = [];
            return;
        }
        state.features = isTrainedBovwActive()
            ? generateTrainedBovwFeatures(bitmap.imageData)
            : generateFeaturesFromImage(bitmap.imageData);
        state.words = generateWords();
        const assigned = assignFeatures(state.features, state.words);
        state.assignments = assigned.assignments;
        state.assignmentDistances = assigned.distances;
        state.histogram = assigned.histogram;
        state.imageSignature = buildImageSignature(bitmap.imageData);
        state.bovwScores = computeBovwScores(item, state.histogram, state.imageSignature);
        buildRepresentativeFeatures();
        ensureSelectedFeature();
    }

    function renderBovwOverlay(svg) {
        if (!state.features.length) {
            svg.innerHTML = "";
            return;
        }
        const active = activeBovwInfo();
        const topWords = state.histogram
            .map((count, id) => ({ count, id, word: state.words[id] }))
            .filter((item) => item.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
        const slotMap = new Map(topWords.map((item, index) => [item.id, {
            x: 90,
            y: 13 + index * 9.6,
            word: item.word,
            count: item.count,
        }]));
        const aggregateHalos = topWords.slice(0, 6).map((entry, index) => {
            const members = state.features.filter((_, featureIndex) => state.assignments[featureIndex] === entry.id);
            const cx = members.reduce((sum, feature) => sum + feature.x, 0) / Math.max(1, members.length);
            const cy = members.reduce((sum, feature) => sum + feature.y, 0) / Math.max(1, members.length);
            const radius = Math.min(12, 4 + Math.sqrt(entry.count) * 1.7);
            const selectedClass = entry.id === active.wordId ? " is-active" : "";
            return `<circle class="cls-word-field${selectedClass}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}" fill="${entry.word.color}" style="--delay:${(index * 0.18).toFixed(2)}s"></circle>`;
        }).join("");
        const slots = topWords.map((entry, index) => {
            const slot = slotMap.get(entry.id);
            const selectedClass = entry.id === active.wordId ? " is-active" : "";
            return `
                <g class="cls-word-slot${selectedClass}" style="--delay:${(index * 0.08).toFixed(2)}s">
                    <rect x="${(slot.x - 5).toFixed(2)}" y="${(slot.y - 3.1).toFixed(2)}" width="9.5" height="6.2" rx="2" fill="rgba(255,255,255,0.78)" stroke="${entry.word.color}" stroke-width="0.55"></rect>
                    <circle cx="${(slot.x - 2.9).toFixed(2)}" cy="${slot.y.toFixed(2)}" r="1.45" fill="${entry.word.color}"></circle>
                    <text x="${(slot.x + 0.1).toFixed(2)}" y="${(slot.y + 1.25).toFixed(2)}" fill="#1e3a8a" font-size="2.6" font-weight="900">w${entry.id + 1}</text>
                </g>
            `;
        }).join("");
        const lineFeatureIds = new Set([...state.representativeFeatureIds, active.featureId]);
        const paths = state.features
            .filter((feature) => lineFeatureIds.has(feature.id))
            .map((feature, pathIndex) => {
            const index = feature.id;
            const word = state.words[state.assignments[index]];
            const slot = slotMap.get(word.id) || {
                x: 88 + (word.id % 2) * 3,
                y: 14 + (word.id % 8) * 8.8,
            };
            const c1x = feature.x + (slot.x - feature.x) * 0.38;
            const c1y = Math.max(8, Math.min(92, feature.y - 12 + (index % 5) * 5));
            const path = `M${feature.x.toFixed(2)} ${feature.y.toFixed(2)} Q${c1x.toFixed(2)} ${c1y.toFixed(2)} ${slot.x.toFixed(2)} ${slot.y.toFixed(2)}`;
            const delay = (pathIndex * 0.08).toFixed(2);
            const selectedClass = index === active.featureId ? " is-active" : "";
            return `
                <path class="cls-assignment-path${selectedClass}" d="${path}" stroke="${word.color}" style="--delay:${delay}s"></path>
                <circle class="cls-flow-dot${selectedClass}" r="${selectedClass ? "0.95" : "0.62"}" fill="${word.color}" style="--delay:${delay}s"><animateMotion dur="${selectedClass ? "1.65s" : "2.8s"}" begin="${delay}s" repeatCount="indefinite" path="${path}"></animateMotion></circle>
            `;
        }).join("");
        const points = state.features.slice().sort((a, b) => {
            const rank = (feature) => {
                if (feature.id === active.featureId) return 2;
                if (state.representativeFeatureIds.has(feature.id)) return 1;
                return 0;
            };
            return rank(a) - rank(b);
        }).map((feature) => {
            const index = feature.id;
            const word = state.words[state.assignments[index]];
            const delay = (index * 0.025).toFixed(2);
            const radius = Math.max(1.15, feature.scale * 0.22);
            const isRepresentative = state.representativeFeatureIds.has(index);
            const isSelected = index === active.featureId;
            const classes = [
                "cls-keypoint",
                isRepresentative ? "is-representative" : "is-muted",
                isSelected ? "is-selected" : "",
            ].filter(Boolean).join(" ");
            const shape = state.featureType === "orb"
                ? `<rect class="cls-keypoint-core" x="${(feature.x - 1.15).toFixed(2)}" y="${(feature.y - 1.15).toFixed(2)}" width="2.3" height="2.3" transform="rotate(${feature.angle} ${feature.x} ${feature.y})" fill="${word.color}" stroke="#ffffff" stroke-width="0.42"></rect>`
                : `<circle class="cls-keypoint-core" cx="${feature.x.toFixed(2)}" cy="${feature.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${word.color}" fill-opacity="0.92" stroke="#ffffff" stroke-width="0.48"></circle>`;
            return `
                <g class="${classes}" data-feature-id="${index}" data-word-id="${word.id}" tabindex="0" role="button" aria-label="feature ${index + 1} assigned to w${word.id + 1}" style="--delay:${delay}s">
                    <circle class="cls-keypoint-ring" cx="${feature.x.toFixed(2)}" cy="${feature.y.toFixed(2)}" r="${(radius + 1.2).toFixed(2)}" stroke="${word.color}"></circle>
                    <line class="cls-keypoint-orientation" x1="${feature.x.toFixed(2)}" y1="${feature.y.toFixed(2)}" x2="${(feature.x + Math.cos(feature.angle * Math.PI / 180) * (radius + 2.2)).toFixed(2)}" y2="${(feature.y + Math.sin(feature.angle * Math.PI / 180) * (radius + 2.2)).toFixed(2)}" stroke="${word.color}"></line>
                    ${shape}
                    <circle class="cls-keypoint-hit" cx="${feature.x.toFixed(2)}" cy="${feature.y.toFixed(2)}" r="${(isRepresentative || isSelected ? Math.max(3.8, radius + 2.8) : Math.max(2.1, radius + 0.8)).toFixed(2)}"></circle>
                </g>
            `;
        }).join("");
        const activeSlot = slotMap.get(active.wordId) || {
            x: 88 + (active.wordId % 2) * 3,
            y: 14 + (active.wordId % 8) * 8.8,
        };
        const activeLabel = active.feature ? `
            <g class="cls-feature-callout" style="--word-color:${active.word.color}">
                <path d="M${active.feature.x.toFixed(2)} ${active.feature.y.toFixed(2)} L${(active.feature.x + 7).toFixed(2)} ${(active.feature.y - 6).toFixed(2)}"></path>
                <rect x="${clamp(active.feature.x + 7, 4, 73).toFixed(2)}" y="${clamp(active.feature.y - 13, 5, 80).toFixed(2)}" width="22" height="10.5" rx="2"></rect>
                <text x="${clamp(active.feature.x + 9, 6, 75).toFixed(2)}" y="${clamp(active.feature.y - 8.6, 9, 84).toFixed(2)}">f${active.featureId + 1} → w${active.wordId + 1}</text>
                <text x="${clamp(active.feature.x + 9, 6, 75).toFixed(2)}" y="${clamp(active.feature.y - 4.5, 13, 88).toFixed(2)}">hist[w${active.wordId + 1}] += 1</text>
            </g>
            <path class="cls-active-word-jump" d="M${active.feature.x.toFixed(2)} ${active.feature.y.toFixed(2)} Q${((active.feature.x + activeSlot.x) / 2).toFixed(2)} ${Math.max(6, active.feature.y - 16).toFixed(2)} ${activeSlot.x.toFixed(2)} ${activeSlot.y.toFixed(2)}" stroke="${active.word.color}"></path>
        ` : "";
        svg.innerHTML = `
            <defs>
                <filter id="clsGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="1.35" result="blur"></feGaussianBlur>
                    <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
                </filter>
                <linearGradient id="clsOverlayFade" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="0"></stop>
                    <stop offset="0.72" stop-color="#ffffff" stop-opacity="0"></stop>
                    <stop offset="1" stop-color="#eff6ff" stop-opacity="0.65"></stop>
                </linearGradient>
            </defs>
            <rect class="cls-overlay-vignette" x="0" y="0" width="100" height="100" fill="url(#clsOverlayFade)"></rect>
            <path class="cls-scan-beam" d="M4 9 H96"></path>
            ${aggregateHalos}
            <g class="cls-assignment-layer">${paths}</g>
            <g class="cls-word-slot-layer">${slots}</g>
            <g class="cls-keypoint-layer">${points}</g>
            ${activeLabel}
        `;
    }

    function renderCnnOverlay(container) {
        container.innerHTML = Array.from({ length: 64 }, (_, i) => {
            const x = (i % 8) * 12.5 + 1.5;
            const y = Math.floor(i / 8) * 12.5 + 1.5;
            const opacity = 0.08 + ((i * 7) % 13) / 40;
            return `<div class="cls-cnn-pixel-cell" style="left:${x}%;top:${y}%;opacity:${opacity.toFixed(3)};--delay:${(i * 0.01).toFixed(2)}s"></div>`;
        }).join("");
    }

    function renderDictionary(target) {
        const active = activeBovwInfo();
        target.innerHTML = state.words.map((word, index) => {
            const count = state.histogram[word.id] || 0;
            const strength = Math.min(100, Math.max(8, Math.round((count / Math.max(1, ...state.histogram)) * 100)));
            const strengthScale = (strength / 100).toFixed(2);
            const selectedClass = word.id === active.wordId ? " is-active" : "";
            return `
                <div class="cls-word-chip${selectedClass}" data-word-id="${word.id}" data-chain-node="${word.id === active.wordId ? "word" : ""}" style="--word-color:${word.color}; --strength-scale:${strengthScale}; --delay:${(index * 0.018).toFixed(2)}s">
                    <i style="background:${word.color}"></i>
                    <span>w${word.id + 1}</span>
                    <em>${count}</em>
                    <small>${visualWordMeaning(word.id)}</small>
                    <b aria-hidden="true"></b>
                </div>
            `;
        }).join("");
    }

    function scrollActiveWordIntoView() {
        if (!els.bovwDictionary || state.method !== "bovw") return;
        const active = activeBovwInfo();
        const activeChip = els.bovwDictionary.querySelector(`[data-word-id="${active.wordId}"]`);
        if (!activeChip) return;
        
        // 使用 scrollIntoView 配合 block: "nearest" 确保元素滚动到可见区域，且不会引起页面整体抖动
        activeChip.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest"
        });
    }

    function renderHistogram(target) {
        const active = activeBovwInfo();
        const max = Math.max(1, ...state.histogram);
        const radial = state.histogram.length >= 64;
        target.classList.toggle("is-radial", radial);
        target.classList.toggle("is-linear", !radial);
        if (radial) {
            const bins = state.histogram.map((count, index) => {
                const angle = (index / Math.max(1, state.histogram.length)) * 360;
                const strength = Math.sqrt(count / max);
                const length = 42 + Math.round(strength * 78);
                const selectedClass = index === active.wordId ? " is-active" : "";
                const labelClass = index % 16 === 0 || index === active.wordId ? " is-labeled" : "";
                return `
                    <div class="cls-hist-bin cls-radial-bin${selectedClass}${labelClass}" data-bin-id="${index}" data-chain-node="${index === active.wordId ? "histogram" : ""}" title="w${index + 1}: ${count}" style="--angle:${angle.toFixed(3)}deg; --len:${length}px; --word-color:${palette[index % palette.length]}; --delay:${(index * 0.006).toFixed(3)}s">
                        <i style="background:${palette[index % palette.length]}"></i>
                        <span>${index + 1}</span>
                    </div>
                `;
            }).join("");
            target.innerHTML = `
                <div class="cls-radial-shell" aria-label="128-dimensional BoVW radial histogram">
                    <div class="cls-radial-grid" aria-hidden="true"></div>
                    <div class="cls-radial-center">
                        <strong>${state.histogram.length}</strong>
                        <span>visual words</span>
                    </div>
                    ${bins}
                </div>
            `;
            return;
        }
        target.innerHTML = state.histogram.map((count, index) => {
            const height = Math.max(5, Math.round((count / max) * 100));
            const selectedClass = index === active.wordId ? " is-active" : "";
            return `
                <div class="cls-hist-bin${selectedClass}" data-bin-id="${index}" data-chain-node="${index === active.wordId ? "histogram" : ""}" title="w${index + 1}: ${count}">
                    <i style="height:${height}%; background:${palette[index % palette.length]}"></i>
                    <span>${index + 1}</span>
                </div>
            `;
        }).join("");
    }

    function renderHistogramVector() {
        const active = activeBovwInfo();
        if (!state.features.length) {
            els.bovwHistVector.innerHTML = `<span>直方图特征向量</span><code>[正在从图像中计算...]</code>`;
            els.bovwHistVote.innerHTML = `<strong>等待图像采样</strong><span>局部描述子 → 词典最近邻分配</span><em>hist[w] += count</em>`;
            return;
        }
        if (state.histogram.length >= 64) {
            const nonZero = state.histogram.filter((count) => count > 0).length;
            const topBins = state.histogram
                .map((count, index) => ({ count, index }))
                .filter((item) => item.count > 0)
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
                .map((item) => `w${item.index + 1}=${item.count}`)
                .join(" · ");
            els.bovwHistVector.hidden = true;
            els.bovwHistVector.innerHTML = `
                <span>径向直方图摘要</span>
                <code>${nonZero}/${state.histogram.length} 个非零维度 · 当前选中 w${active.wordId + 1}=${active.count} · ${topBins}</code>
            `;
            els.bovwHistVote.innerHTML = `
                <strong style="--word-color:${active.word.color}">特征点 f${active.featureId + 1} → 视觉单词 w${active.wordId + 1}</strong>
                <span>最近邻词典距离 = ${active.distance.toFixed(3)}</span>
                <em>从中心向外延伸的径向射线 w${active.wordId + 1}</em>
            `;
            return;
        }
        els.bovwHistVector.hidden = false;
        els.bovwHistVector.innerHTML = `
            <span>直方图特征向量</span>
            <code>[${state.histogram.map((count, index) => index === active.wordId ? `<b>${count}</b>` : count).join(", ")}]</code>
        `;
        els.bovwHistVote.innerHTML = `
            <strong style="--word-color:${active.word.color}">特征点 f${active.featureId + 1} → 视觉单词 w${active.wordId + 1}</strong>
            <span>最近邻词典距离 = ${active.distance.toFixed(3)}</span>
            <em>hist[w${active.wordId + 1}] += 1</em>
        `;
    }

    function renderMiniHistogram(target) {
        const max = Math.max(1, ...state.histogram);
        const visible = state.histogram.slice(0, 16);
        target.innerHTML = visible.map((count, index) => {
            const height = Math.max(4, Math.round((count / max) * 100));
            return `<div class="cls-mini-bin" title="w${index + 1}: ${count}" style="--h:${height}%; background:${palette[index % palette.length]}"></div>`;
        }).join("");
    }

    function renderCnnMaps(target) {
        target.innerHTML = `
            <article class="cls-cnn-feature-layer">
                <span>01</span>
                <strong>浅层特征提取 (shallow)</strong>
                <p>提取边缘、颜色和纹理特征 (edges / colors / textures)</p>
                <div><i style="--w:72%"></i><i style="--w:54%"></i><i style="--w:63%"></i></div>
            </article>
            <article class="cls-cnn-feature-layer">
                <span>02</span>
                <strong>中层特征提取 (middle)</strong>
                <p>提取模式和局部形状 (patterns / local shapes)</p>
                <div><i style="--w:58%"></i><i style="--w:82%"></i><i style="--w:49%"></i></div>
            </article>
            <article class="cls-cnn-feature-layer">
                <span>03</span>
                <strong>深层特征提取 (high-level)</strong>
                <p>关联物体部件和类别响应 (object parts / category responses)</p>
                <div><i style="--w:88%"></i><i style="--w:61%"></i><i style="--w:75%"></i></div>
            </article>
            <p class="cls-cnn-feature-note">这是 CNN 特征提取过程示意；当前 Top-5 来自 ONNX session.run 的真实输出。</p>
        `;
    }

    function renderGlobalFeature(target, dim = 64) {
        const classCount = state.cnnModelKind === "flowers17" ? 17 : state.cnnModelKind === "imagenet" ? 1000 : "--";
        const infer = state.cnnInferenceMs ? `${Math.round(state.cnnInferenceMs)} ms` : "--";
        const vectorDim = state.cnnModelKind === "flowers17" ? "17 logits" : state.cnnModelKind === "imagenet" ? "1000 logits" : `${dim} dims`;
        const cells = Array.from({ length: Math.min(dim, 96) }, (_, i) => {
            const intensity = 0.12 + ((i * 13) % 17) / 28;
            return `<span style="opacity:${intensity.toFixed(3)}; --delay:${(i * 0.01).toFixed(2)}s"></span>`;
        }).join("");
        target.innerHTML = `
            <div class="cls-representation-summary">
                <div><span>推理阶段</span><strong>全局平均池化 / 分类决策段 (GAP / Classifier)</strong></div>
                <div><span>特征向量</span><strong>全局池化所得表征向量 (pooled vector)</strong></div>
                <div><span>向量维度</span><strong>${vectorDim}</strong></div>
                <div><span>输出结构</span><strong>类别总数：${classCount} 类</strong></div>
                <div><span>当前耗时</span><strong>${infer}</strong></div>
            </div>
            <div class="cls-global-vector">${cells}</div>
            <div class="cls-global-meta">
                <span>当前显示：${dim} 维特征</span>
                <span>GAP: H×W×C → 1×1×C</span>
            </div>
        `;
    }

    function resetCnnAnimation() {
        state.cnnStageIndex = 0;
        state.cnnAnimationTick += 1;
        state.cnnAnimationPlaying = true;
        state.cnnAnimationAutoplay = true;
        if (state.cnnAnimationTimer) clearTimeout(state.cnnAnimationTimer);
        state.cnnAnimationTimer = null;
    }

    function setCnnStage(index, options = {}) {
        const count = cnnAnimationStages.length;
        state.cnnStageIndex = ((index % count) + count) % count;
        state.cnnAnimationTick += 1;
        if (options.play !== undefined) state.cnnAnimationPlaying = options.play;
        render();
    }

    function scheduleCnnAnimation() {
        if (state.cnnAnimationTimer) clearTimeout(state.cnnAnimationTimer);
        state.cnnAnimationTimer = null;
        if (state.method !== "cnn" || !state.cnnAnimationPlaying || !state.cnnAnimationAutoplay) return;
        state.cnnAnimationTimer = setTimeout(() => {
            state.cnnAnimationTimer = null;
            if (state.method === "cnn" && state.cnnAnimationPlaying && state.cnnAnimationAutoplay) {
                setCnnStage(state.cnnStageIndex + 1, { play: true });
            }
        }, 3300);
    }

    function renderCnnStageSteps() {
        if (!els.cnnStageSteps) return;
        els.cnnStageSteps.innerHTML = cnnAnimationStages.map((stage, index) => `
            <button type="button" class="${index === state.cnnStageIndex ? "is-active" : ""}" data-cnn-stage-index="${index}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${stage.label}</strong>
            </button>
        `).join("");
    }

    function renderCnnAnimationVisual(item) {
        const stage = cnnAnimationStages[state.cnnStageIndex] || cnnAnimationStages[0];
        const scores = cnnScores(item);
        const topScores = scores.length ? scores : [
            { label: "等待 ONNX 推理", score: 0.34 },
            { label: "候选分类 Logit", score: 0.22 },
            { label: "类别响应值", score: 0.17 },
            { label: "Softmax 概率值", score: 0.12 },
            { label: "次高置信类别", score: 0.08 },
        ];
        const image = item?.image || "";
        const classCount = state.cnnModelKind === "flowers17" ? 17 : state.cnnModelKind === "imagenet" ? 1000 : "--";
        const tensorSize = state.cnnOnnxConfig?.inputSize || 224;
        
        const journey = (from, via, to) => `
            <div class="cls-cnn-data-journey">
                <span>${from}</span>
                <i></i>
                <strong>${via}</strong>
                <i></i>
                <span>${to}</span>
                <b></b>
            </div>
        `;

        if (stage.key === "input") {
            const width = item?.width || 689;
            const height = item?.height || 500;
            return `
                ${journey("进入前原始输入", "加载输入图像", "待处理物理图像")}
                <div class="cls-anim-img-container">
                    <img src="${image}" alt="CNN Input">
                    <span class="cls-input-rgb-label">RGB IMAGE</span>
                    <span class="cls-input-badge-size">${width} × ${height}</span>
                </div>
            `;
        }
        if (stage.key === "preprocess") {
            return `
                ${journey("图像数据", "缩放并归一化为 Tensor", "归一化张量")}
                <div class="cls-cnn-anim-preprocess">
                    <div class="cls-anim-crop-rect-wrap" style="position: relative;">
                        <div class="cls-anim-crop-rect"></div>
                        <img src="${image}" style="width: 80px; height: 80px; border-radius: 6px; object-fit: cover;" alt="">
                        <div class="cls-input-badge-size" style="position:static; margin-top:4px; font-size:9px; text-align:center; transform: none; opacity: 1;">689×500 → 224×224</div>
                    </div>
                    <div class="cls-resize-planes-container">
                        <div class="cls-rgb-slices">
                            <i class="r" style="--z: 0; background-image: url('${image}')"></i>
                            <i class="g" style="--z: -24; background-image: url('${image}')"></i>
                            <i class="b" style="--z: -48; background-image: url('${image}')"></i>
                        </div>
                    </div>
                    <div class="cls-tensor-glow-grid">
                        ${Array.from({ length: 36 }, (_, i) => `<i style="animation-delay: ${(i * 0.035).toFixed(3)}s"></i>`).join("")}
                    </div>
                </div>
                <strong style="margin-top: 8px;">1 × 3 × ${tensorSize} × ${tensorSize} Tensor 就绪</strong>
            `;
        }
        if (stage.key === "conv") {
            const patch = ["0.9", "0.8", "0.5", "0.2", "0.9", "0.1", "0.3", "0.2", "0.4"];
            const weights = ["0.2", "-0.1", "0.3", "0.0", "0.5", "-0.2", "0.1", "0.4", "0.2"];
            return `
                ${journey("特征局部切片", "数字对齐相乘并累加", "单个神经元输出")}
                <div class="cls-anim-conv-interactive">
                    <div class="cls-interactive-patch-box">
                        ${patch.map((val) => `<i>${val}</i>`).join("")}
                    </div>
                    <svg class="cls-conv-lines-svg">
                        ${Array.from({ length: 9 }, (_, i) => {
                            const row = Math.floor(i / 3);
                            const col = i % 3;
                            const startX = 20 + col * 15;
                            const startY = 30 + row * 40;
                            const endX = 140 + col * 15;
                            const endY = 30 + row * 40;
                            return `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" style="animation-delay:${(i * 0.1).toFixed(2)}s" />`;
                        }).join("")}
                    </svg>
                    <div class="cls-interactive-kernel-box">
                        ${weights.map((val) => `<i>${val}</i>`).join("")}
                    </div>
                    <div class="cls-animated-mult-spark">
                        <span class="cls-mult-number">Σ x_i · w_i = 0.82</span>
                    </div>
                    <div class="cls-conv-out-grid">
                        <i></i><i></i><i></i>
                        <i></i><i class="highlight"></i><i></i>
                        <i></i><i></i><i></i>
                    </div>
                </div>
                <strong style="margin-top: 4px;">滑动窗口提取特征：W × 局部区域 + b → 神经元单元激活值</strong>
            `;
        }
        if (stage.key === "feature") {
            const xCoords = [55, 38, 62];
            const yCoords = [48, 42, 58];
            const layerLabels = [
                { title: "浅层特征 · Edges", desc: "主导色彩与轮廓边缘" },
                { title: "中层特征 · Patterns", desc: "花瓣局部斑点与结构模式" },
                { title: "深层特征 · Object Parts", desc: "抽象花卉类别高维语义" }
            ];
            
            return `
                ${journey("多通道卷积响应", "提取语义特征层级", "高层特征表示")}
                <div class="cls-interactive-maps-view">
                    ${[0, 1, 2].map((idx) => `
                        <div class="cls-feature-hotspot-card">
                            <strong style="font-size: 11px;">${layerLabels[idx].title}</strong>
                            <span style="font-size: 9px; color: #64748b; display: block; margin-top:2px;">${layerLabels[idx].desc}</span>
                            <div class="cls-hot-thumbnail" style="background-image: url('${image}')">
                                <div class="cls-hot-overlay" style="--cx: ${xCoords[idx]}%; --cy: ${yCoords[idx]}%"></div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `;
        }
        if (stage.key === "pooling") {
            const sourceGrids = Array.from({ length: 4 }, (_, gridIdx) => `
                <div class="cls-pooling-source-grid">
                    ${Array.from({ length: 9 }, (_, cellIdx) => {
                        const row = Math.floor(cellIdx / 3);
                        const col = cellIdx % 3;
                        return `<i style="--cx: ${col}; --cy: ${row}; animation-delay: ${(gridIdx * 0.15 + cellIdx * 0.04).toFixed(2)}s"></i>`;
                    }).join("")}
                </div>
            `).join("");
            
            return `
                ${journey("H × W × C 特征空间图", "执行全局平均池化 (GAP)", "1 × 1 × C 特征表示")}
                <div class="cls-pooling-shrink-view">
                    <div class="cls-pool-grids-wrap">
                        ${sourceGrids}
                    </div>
                    <div class="cls-vector-stretch-line"></div>
                    <div class="cls-pool-vector-final">
                        ${Array.from({ length: 6 }, (_, i) => `<i style="--delay: ${(i * 0.12).toFixed(2)}s"></i>`).join("")}
                    </div>
                </div>
                <strong>全局信息压缩：对每个通道取均值以压缩空间维度</strong>
            `;
        }
        if (stage.key === "classifier") {
            const visualLabels = topScores.slice(0, 4).map(s => s.label).concat(["干扰项类别"]);
            
            return `
                ${journey("1×1×C 紧致表示", "全连接层线性决策", `${classCount} 维 Logits`)}
                <div class="cls-classifier-links-view">
                    <div class="cls-nodes-vector-list">
                        ${Array.from({ length: 6 }, (_, i) => `<i>v_{${i+1}}</i>`).join("")}
                    </div>
                    <svg class="cls-links-connect-svg">
                        ${Array.from({ length: 15 }, (_, i) => {
                            const srcIdx = i % 5;
                            const destIdx = Math.floor(i / 3);
                            const y1 = 15 + srcIdx * 32;
                            const y2 = 12 + destIdx * 34;
                            const op = 0.12 + ((i * 7) % 9) / 12;
                            const activeColor = destIdx === 0 && srcIdx < 3 ? "#22c55e" : "#bfdbfe";
                            return `<line x1="28" y1="${y1}" x2="260" y2="${y2}" style="stroke:${activeColor}; stroke-width:${(op*3).toFixed(1)}; opacity:${op.toFixed(2)}; stroke-dasharray:5 3;" />`;
                        }).join("")}
                    </svg>
                    <div class="cls-nodes-output-list">
                        ${visualLabels.map((lbl, idx) => `
                            <span class="${idx === 0 ? "is-target" : ""}">${idx === 4 ? "其他 " + (classCount - 4) + " 个" : escapeHtml(lbl)}</span>
                        `).join("")}
                    </div>
                </div>
                <strong>运算：W^T v + b → 各类别置信度 Logits</strong>
            `;
        }
        
        const barsHtml = topScores.slice(0, 5).map((score, index) => {
            const isTop = index === 0;
            const pct = Math.round((score.score || 0) * 100);
            return `
                <div class="cls-softmax-row-wrap ${isTop ? "is-top-prediction" : ""}">
                    <span>${index + 1}</span>
                    <strong>${escapeHtml(score.label)}</strong>
                    <div class="cls-softmax-bar-flow">
                        <i style="width: ${pct}%"></i>
                    </div>
                    <em>${pct}%</em>
                </div>
            `;
        }).join("");

        return `
            ${journey(`Logits 置信度`, "Softmax 归一化并重新排序", "Top-5 概率输出")}
            <div class="cls-softmax-bars-view">
                ${barsHtml}
            </div>
            <strong style="margin-top: 10px;">归一化指数：e^{z_i} / \\sum e^{z_j}。Top-1 类别锁定输出。</strong>
        `;
    }

    function renderCnnAnimation(item) {
        if (!els.cnnAnimationStage) return;
        const stage = cnnAnimationStages[state.cnnStageIndex] || cnnAnimationStages[0];
        renderCnnStageSteps();
        els.cnnAnimationStage.dataset.stage = stage.key;
        els.cnnAnimationStage.dataset.tick = String(state.cnnAnimationTick);
        els.cnnAnimationStage.innerHTML = renderCnnAnimationVisual(item);
        if (els.cnnStageTitle) els.cnnStageTitle.textContent = stage.title;
        if (els.cnnStageKicker) els.cnnStageKicker.textContent = `阶段 ${state.cnnStageIndex + 1} / ${cnnAnimationStages.length}`;
        if (els.cnnStageExplanation) els.cnnStageExplanation.textContent = stage.explanation;
        if (els.cnnStageInput) els.cnnStageInput.textContent = stage.input;
        if (els.cnnStageOutput) els.cnnStageOutput.textContent = stage.output;
        if (els.cnnStageFormula) els.cnnStageFormula.textContent = stage.formula;
        if (els.cnnPlay) els.cnnPlay.classList.toggle("is-active", state.cnnAnimationPlaying && !state.cnnAnimationAutoplay);
        if (els.cnnPause) els.cnnPause.classList.toggle("is-active", !state.cnnAnimationPlaying);
        if (els.cnnAuto) els.cnnAuto.classList.toggle("is-active", state.cnnAnimationAutoplay);
        scheduleCnnAnimation();
    }

    function renderScores(target, scores, options = {}) {
        const sliced = scores.slice(0, state.topK);
        const chainNode = options.chainNode || "";
        target.innerHTML = sliced.map((item, index) => `
            <div class="classification-score-row ${index === 0 ? "is-top" : ""}" data-chain-node="${index === 0 ? chainNode : ""}">
                <span>${index + 1}</span>
                <strong>${escapeHtml(item.label)}${item.source === "prototype-demo" ? "<small>教学原型</small>" : ""}</strong>
                <div><i style="width:${Math.round((item.score || 0) * 100)}%"></i></div>
                <em>${Math.round((item.score || 0) * 100)}%</em>
            </div>
        `).join("");
    }

    function renderClassifierFlow(scores) {
        const active = activeBovwInfo();
        const top = scores[0];
        const isPrototype = top?.source === "prototype-demo";
        const isTrained = top?.source === "trained-flowers17";
        const classifierText = isTrained
            ? "已训练的 Logistic Regression 分类器"
            : isPrototype
                ? "未训练的原型权重分类器"
                : "已校准的演示分类器";
        const note = isTrained
            ? "当前 Top-K 由导出的 codebook、L1+sqrt histogram 和 logistic regression 权重在前端计算。"
            : isPrototype
                ? "当前为未训练原型分数，只用于说明 histogram 如何进入分类器。"
                : "内置样例分数经过人工校准，用来演示分类器输出结构。";
        els.bovwClassifierFlow.innerHTML = `
            <span data-chain-node="classifier">计算得到的直方图</span>
            <b aria-hidden="true">→</b>
            <span>${classifierText}</span>
            <b aria-hidden="true">→</b>
            <strong>${top ? `${escapeHtml(top.label)} ${Math.round(top.score * 100)}%` : "Top-K 预测分数"}</strong>
            <small>${state.features.length ? `当前选中 f${active.featureId + 1} 投票到 w${active.wordId + 1}，它贡献的是向量第 ${active.wordId + 1} 维。${note}` : "先从 Canvas 图像采样 patch descriptor，再由 histogram 进入分类器。"}</small>
        `;
    }

    function renderFeatureCard() {
        const active = activeBovwInfo();
        if (!els.bovwFeatureCard || !active.feature) return;
        const left = clamp(active.feature.x + 3, 3, 62);
        const top = clamp(active.feature.y - 11, 4, 74);
        els.bovwFeatureCard.style.left = `${left}%`;
        els.bovwFeatureCard.style.top = `${top}%`;
        els.bovwFeatureCard.style.setProperty("--word-color", active.word.color);
        els.bovwFeatureCard.innerHTML = `
            <strong>特征点 f${active.featureId + 1}</strong>
            <span>分配的视觉单词: <b>w${active.wordId + 1}</b></span>
            <span>最近邻单词距离: <b>${active.distance.toFixed(3)}</b></span>
            <em>hist[w${active.wordId + 1}] += 1</em>
        `;
    }

    function renderBovwFlow() {
        const activeStep = state.activeBovwStep || "local-features";
        const steps = ["image", "local-features", "visual-words", "histogram", "classifier", "topk"];
        const activeIndex = steps.indexOf(activeStep);
        els.bovwFlowSteps.forEach((step) => {
            const index = steps.indexOf(step.dataset.clsBovwStep);
            step.classList.toggle("is-active", step.dataset.clsBovwStep === activeStep);
            step.classList.toggle("is-complete", index >= 0 && activeIndex >= 0 && index < activeIndex);
        });
    }

    function scheduleBovwChain() {
        if (!els.bovwChain || state.method !== "bovw") return;
        window.requestAnimationFrame(drawBovwChain);
    }

    function setSelectedFeature(featureId, step = "visual-words") {
        if (!state.features[featureId]) return;
        state.selectedFeatureId = featureId;
        state.hoverFeatureId = null;
        state.activeBovwStep = step;
        renderBovwFocus();
    }

    function setHoverFeature(featureId) {
        if (!state.features[featureId]) return;
        if (state.hoverFeatureId === featureId) return;
        state.hoverFeatureId = featureId;
        state.activeBovwStep = "visual-words";
        renderBovwFocus();
    }

    function clearHoverFeature() {
        if (state.hoverFeatureId === null) return;
        state.hoverFeatureId = null;
        renderBovwFocus();
    }

    function featureIdFromPointer(event, maxDistance = 5.2) {
        const rect = els.bovwOverlay.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        let best = null;
        let bestDistance = Infinity;
        state.features.forEach((feature) => {
            const dx = feature.x - x;
            const dy = feature.y - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const allowance = state.representativeFeatureIds.has(feature.id) ? maxDistance + 2.2 : maxDistance;
            if (d <= allowance && d < bestDistance) {
                best = feature.id;
                bestDistance = d;
            }
        });
        return best;
    }

    function nodeCenter(element, hostRect) {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left - hostRect.left + rect.width / 2,
            y: rect.top - hostRect.top + rect.height / 2,
        };
    }

    function isElementVisibleInside(element, container) {
        if (!element || !container) return false;
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return elementRect.bottom > containerRect.top
            && elementRect.top < containerRect.bottom
            && elementRect.right > containerRect.left
            && elementRect.left < containerRect.right;
    }

    function segmentPath(from, to) {
        const dx = Math.max(36, Math.abs(to.x - from.x) * 0.42);
        return `M${from.x.toFixed(1)} ${from.y.toFixed(1)} C${(from.x + dx).toFixed(1)} ${from.y.toFixed(1)}, ${(to.x - dx).toFixed(1)} ${to.y.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
    }

    function drawBovwChain() {
        if (!els.bovwChain || state.method !== "bovw") return;
        const panel = root.querySelector('[data-cls-mode="bovw"]');
        if (!panel || panel.hidden) return;
        const active = activeBovwInfo();
        if (!active.feature) {
            els.bovwChain.innerHTML = "";
            return;
        }

        const hostRect = panel.getBoundingClientRect();
        const overlayRect = els.bovwOverlay.getBoundingClientRect();
        const wordNode = panel.querySelector('[data-chain-node="word"]');
        const histNode = panel.querySelector('[data-chain-node="histogram"]');
        const classifierNode = panel.querySelector('[data-chain-node="classifier"]');
        const topkNode = panel.querySelector('[data-chain-node="topk"]');
        if (!wordNode || !histNode || !classifierNode || !topkNode || !hostRect.width || !hostRect.height) return;
        if (!isElementVisibleInside(wordNode, els.bovwDictionary)) {
            els.bovwChain.innerHTML = "";
            scrollActiveWordIntoView();
            // 增加延迟，等待平滑滚动动画结束后再重新绘制连线，确保位置计算准确
            window.setTimeout(scheduleBovwChain, 300);
            return;
        }

        els.bovwChain.setAttribute("viewBox", `0 0 ${hostRect.width} ${hostRect.height}`);
        els.bovwChain.setAttribute("width", hostRect.width);
        els.bovwChain.setAttribute("height", hostRect.height);

        const points = [
            {
                x: overlayRect.left - hostRect.left + (active.feature.x / 100) * overlayRect.width,
                y: overlayRect.top - hostRect.top + (active.feature.y / 100) * overlayRect.height,
                label: `f${active.featureId + 1}`,
            },
            { ...nodeCenter(wordNode, hostRect), label: `w${active.wordId + 1}` },
            { ...nodeCenter(histNode, hostRect), label: `bin ${active.wordId + 1}` },
            { ...nodeCenter(classifierNode, hostRect), label: "classifier" },
            { ...nodeCenter(topkNode, hostRect), label: "Top-K" },
        ];

        const paths = points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            return `<path class="cls-bovw-chain-path" d="${segmentPath(point, next)}" style="--delay:${(index * 0.16).toFixed(2)}s"></path>`;
        }).join("");
        const dots = points.map((point, index) => `
            <g class="cls-bovw-chain-node" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
                <circle r="${index === 0 ? 5.2 : 4.4}"></circle>
                <text x="7" y="${index % 2 ? -6 : 12}">${escapeHtml(point.label)}</text>
            </g>
        `).join("");

        els.bovwChain.style.setProperty("--word-color", active.word.color);
        els.bovwChain.innerHTML = `
            <defs>
                <marker id="clsBovwArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0 0 L8 4 L0 8 Z"></path>
                </marker>
            </defs>
            ${paths}
            ${dots}
        `;
    }

    function renderDiffTable() {
        const cnnIsFlowers = state.cnnModelKind === "flowers17";
        const cnnIsImagenet = state.cnnModelKind === "imagenet";
        const cnnTitle = cnnIsFlowers ? "CNN Flowers17" : cnnIsImagenet ? "CNN ImageNet" : "CNN 概念演示";
        const cnnClasses = cnnIsFlowers ? "17 类花卉" : cnnIsImagenet ? "1000 类 ImageNet 物体" : "概念分类";
        
        // 使用结构化徽章拆分推理路径表现
        const bovwRouteBadges = [
            "图像分块",
            "SIFT 描述子",
            "KMeans 词汇汇聚",
            "词频直方图 (Bag of Visual Words)",
            "线性逻辑回归",
            "分类输出"
        ].map(step => `<span class="cls-route-badge bovw">${step}</span>`).join('<i class="cls-route-arrow">→</i>');

        const cnnRouteBadges = (cnnIsFlowers
            ? ["图像 Tensor", "输入归一化", "多层卷积与下采样", "Global Average Pooling", "线性全连接分类头", "Softmax 17类花卉"]
            : cnnIsImagenet
                ? ["图像 Tensor", "输入归一化", "骨干网络特征提取", "全局池化 GAP", "Linear Classification Head", "ONNX ImageNet 1000类"]
                : ["二维图像", "尺寸归一化", "卷积与池化层", "Softmax 分数输出"]
        ).map(step => `<span class="cls-route-badge cnn">${step}</span>`).join('<i class="cls-route-arrow">→</i>');

        const compareNote = cnnIsImagenet
            ? "二者类别体系不同：BoVW 是 17 类花卉，CNN 是 1000 类 ImageNet。本页只比较传统特征分类与深度模型推理路径，不比较准确率。"
            : cnnIsFlowers
                ? "二者同为 Flowers17 分类，但表示学习路径不同：BoVW 使用手工特征描述子（手工设计），CNN 使用端到端自适应特征提取器（数据驱动）。"
                : "当前未加载 CNN ONNX，仅保留概念路径对比。";
                
        els.compareDiff.innerHTML = `
            <table>
                <thead><tr><th>对比维度</th><th>BoVW 视觉词袋模型</th><th>${cnnTitle}</th></tr></thead>
                <tbody>
                    <tr><td>类别体系</td><td><span class="cls-table-pill light-blue">17 类花卉数据集</span></td><td><span class="cls-table-pill orange">${cnnClasses}</span></td></tr>
                    <tr><td>逻辑流程</td><td><div class="cls-route-badge-container">${bovwRouteBadges}</div></td><td><div class="cls-route-badge-container">${cnnRouteBadges}</div></td></tr>
                    <tr><td>推理实现</td><td><span class="cls-status-dot green"></span> 前端通过本地数学计算进行词表最近邻量化及 Softmax 逻辑回归预测</td><td><span class="cls-status-dot blue"></span> ${state.cnnOnnxStatus === "ready" ? "ONNX Runtime Web 浏览器端 WebGL/WASM 硬件加速实时推理" : "概念数据渲染 / 纯前端过渡"}</td></tr>
                    <tr>
                        <td>表征设计</td>
                        <td>
                            <div class="cls-feat-desc-container">
                                <strong>高维稀疏特征直方图</strong>
                                <span>利用统计直方图完全丢弃了各个分块的原始几何位置关系信息。</span>
                                <small>${isTrainedBovwActive() ? state.bovwModel.vocab_size : state.vocabSize} 维直方图</small>
                            </div>
                        </td>
                        <td>
                            <div class="cls-feat-desc-container">
                                <strong>端到端稠密多阶层描述子</strong>
                                <span>在不同层级自动保留并提炼了从「边缘」到「高阶语义」的空间层级感受野表征。</span>
                                <small>高度压缩的语义通道向量</small>
                            </div>
                        </td>
                    </tr>
                    <tr><td>比对说明</td><td colspan="2"><div class="cls-table-note-box">${compareNote}</div></td></tr>
                </tbody>
            </table>
        `;
    }

    function vectorDimLabel() {
        if (state.method === "cnn") return "GAP 1×C";
        return `${isTrainedBovwActive() ? state.bovwModel.vocab_size : state.vocabSize} bins`;
    }

    function renderNotes(item) {
        const bScores = bovwScores();
        const cScores = cnnScores(item);
        const topB = bScores[0];
        const topC = cScores[0];
        const active = activeBovwInfo();

        els.notesMethod.textContent = state.method === "bovw" ? activeBovwLabel() : methodLabels[state.method];
        els.statSelectedFeature.textContent = state.method === "cnn" ? "卷积特征图" : `f_{${active.featureId + 1}}`;
        els.statSelectedWord.textContent = state.method === "cnn" ? "--" : `w_{${active.wordId + 1}}`;
        els.statSelectedDistance.textContent = state.method === "cnn" ? "--" : active.distance.toFixed(3);
        els.statSelectedBin.textContent = state.method === "cnn" ? vectorDimLabel() : `hist[w_{${active.wordId + 1}}] = ${active.count}`;

        let stepsHtml = "";

        if (state.method === "cnn") {
            const onnxReady = state.cnnOnnxStatus === "ready";
            const classCount = state.cnnModelKind === "flowers17" ? 17 : state.cnnModelKind === "imagenet" ? 1000 : "--";
            const currentStage = cnnAnimationStages[state.cnnStageIndex] || cnnAnimationStages[0];
            const modelIdea = state.cnnModelKind === "flowers17"
                ? "Flowers17 CNN 使用微调后的卷积特征提取器，把花卉图像映射到 17 个花卉类别。"
                : "ImageNet CNN 使用通用卷积特征提取器，把图像映射到 1000 个物体类别。";
            const fitNote = state.cnnModelKind === "imagenet"
                ? "ImageNet 更适合单个主体明确的物体图像；复杂街景、多人场景和道路场景通常会产生不稳定或看似奇怪的 Top-5。"
                : "Flowers17 更适合单朵或主体明确的花卉图像；非花卉图片只能得到 17 个花卉类别中的相对最高分。";
            els.notesMethod.textContent = `CNN · ${currentStage.title}`;
            els.notesMethodDesc.textContent = currentStage.explanation;
            if (els.notesFormulaTitle) els.notesFormulaTitle.textContent = "CNN 阶段计算公式";
            els.notesFormula.textContent = currentStage.formula;
            els.notesFormulaNote.textContent = onnxReady
                ? `当前动画阶段是教学化简化视图；真实链路仍是 resize / normalize -> ONNX session.run -> ${classCount} logits -> softmax Top-5。`
                : "ONNX 尚未就绪时只展示教学动画结构。";

            stepsHtml = `
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">1</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">当前阶段：${currentStage.title}</span>
                        <span class="cls-notes-step-desc">${currentStage.explanation} ${modelIdea} 当前 Top-5 ${onnxReady ? "来自 ONNX Runtime Web session.run 的真实输出" : "暂未连接 ONNX session"}。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">2</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">输入预处理：resize / normalize / tensor shape</span>
                        <span class="cls-notes-step-desc">前端用 Canvas 中心裁剪并 resize 到 <strong>${state.cnnOnnxConfig?.inputSize || 224}×${state.cnnOnnxConfig?.inputSize || 224}</strong>，按 ImageNet mean/std normalize，组织为 <strong>1×3×${state.cnnOnnxConfig?.inputSize || 224}×${state.cnnOnnxConfig?.inputSize || 224}</strong> 的 NCHW tensor。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">3</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">输出结构与计算步骤</span>
                        <span class="cls-notes-step-desc">tensor 进入 CNN feature extractor，经 pooling / classifier 得到 <strong>${classCount}</strong> 维 logits，再做 softmax 并排序得到 Top-5。推理耗时：<strong>${state.cnnInferenceMs ? `${Math.round(state.cnnInferenceMs)} ms` : "--"}</strong>。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">4</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">适用性与结果解释</span>
                        <span class="cls-notes-step-desc">${fitNote} 当前 Top-1：<strong>${topC ? escapeHtml(topC.label) : "--"}</strong>，分数 <strong>${topC ? Math.round(topC.score * 100) : 0}%</strong>。</span>
                    </div>
                </div>
            `;
        } else if (state.method === "compare") {
            els.notesMethodDesc.textContent = "并置 BoVW 与 CNN 两条路径，对比它们的表示与输出结构。";
            if (els.notesFormulaTitle) els.notesFormulaTitle.textContent = "推理决策公式对比";
            els.notesFormula.textContent = "\\text{score}_c = W_c \\cdot \\operatorname{normalize}(\\mathbf{h}) + b_c";
            els.notesFormulaNote.textContent = state.cnnModelKind === "imagenet"
                ? "CNN 分支使用 ImageNet 1000 类模型；BoVW 分支使用 Flowers17 17 类模型，二者类别体系不同，只比较推理路径。"
                : state.cnnModelKind === "flowers17"
                    ? "BoVW 与 CNN 均输出 Flowers17 类别，但一个使用视觉词袋，一个使用深度特征。"
                    : "CNN ONNX 未加载时，比较页保留概念展示。";

            stepsHtml = `
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">1</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">BoVW 路径预测 (Top-1)</span>
                        <div class="cls-notes-step-formula" data-formula="\\text{score}_c = W_c \\cdot \\operatorname{normalize}(\\mathbf{h}) + b_c"></div>
                        <span class="cls-notes-step-desc">BoVW 预测 Top-1 类别为 <strong>${topB ? escapeHtml(topB.label) : "--"}</strong>，置信度为 <strong>${topB ? Math.round(topB.score * 100) : 0}%</strong>。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">2</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">CNN 路径预测 (Top-1)</span>
                        <div class="cls-notes-step-formula" data-formula="p = \\operatorname{softmax}(W \\cdot \\operatorname{GAP}(\\mathbf{F}) + b)"></div>
                        <span class="cls-notes-step-desc">CNN 预测 Top-1 类别为 <strong>${topC ? escapeHtml(topC.label) : "--"}</strong>，置信度为 <strong>${topC ? Math.round(topC.score * 100) : 0}%</strong>。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">3</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">核心表示差异 (Representation Difference)</span>
                        <span class="cls-notes-step-desc"><strong>BoVW</strong> 将图像表示为可解释的<strong>视觉词频直方图</strong>（无空间结构）；<strong>CNN</strong> 将图像表示为端到端学习得到的<strong>高维语义向量</strong>（保留层级空间结构）。</span>
                    </div>
                </div>
            `;
        } else {
            const isPrototype = topB?.source === "prototype-demo";
            const isTrained = topB?.source === "trained-flowers17";
            els.notesMethodDesc.textContent = isTrained
                ? "当前模式使用本地训练得到的 BoVW 参数进行真实前端分类。"
                : "该模式用于解释 BoVW 原理，不代表真实分类概率。";
            if (els.notesFormulaTitle) els.notesFormulaTitle.textContent = "BoVW 核心思想";
            els.notesFormula.textContent = "\\text{score}_c = W_c \\cdot \\operatorname{normalize}(\\mathbf{h}) + b_c";
            els.notesFormulaNote.textContent = isTrained
                ? "前端从 Canvas 采样 patch descriptor，分配到导出的 128 个 visual words，执行 L1+sqrt 归一化，再用 JSON 中的 W 和 b 计算 softmax。"
                : `BoVW 教学原型模式：从 Canvas 采样 patch descriptor，分配到页面生成的 codebook，再用 ${state.vocabSize} 维直方图展示分类器输入。`;

            const totalFeatures = state.features?.length || 140;
            const normVal = Math.sqrt(active.count / totalFeatures).toFixed(3);

            stepsHtml = `
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">1</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">特征描述子量化 (Quantization)</span>
                        <div class="cls-notes-step-formula" data-formula="k^* = \\arg\\min_{k} \\|\\mathbf{f}_{${active.featureId + 1}} - \\mathbf{c}_k\\|_2"></div>
                        <span class="cls-notes-step-desc">计算当前特征点 <strong>f_{${active.featureId + 1}}</strong> 与词典中心的欧氏距离，最近邻为 <strong>w_{${active.wordId + 1}}</strong>，距离为 <strong>${active.distance.toFixed(3)}</strong>。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">2</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">直方图频数投递 (Histogram Pooling)</span>
                        <div class="cls-notes-step-formula" data-formula="\\mathbf{h}[w_{${active.wordId + 1}}] \\leftarrow \\mathbf{h}[w_{${active.wordId + 1}}] + 1"></div>
                        <span class="cls-notes-step-desc">将特征点投递到对应的直方图通道，通道 <strong>w_{${active.wordId + 1}}</strong> 的频数累加为 <strong>${active.count}</strong>。整图共投递了 <strong>${totalFeatures}</strong> 个特征点。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">3</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">直方图归一化 (L1-sqrt Normalization)</span>
                        <div class="cls-notes-step-formula" data-formula="\\mathbf{h}' = \\sqrt{\\frac{\\mathbf{h}}{\\sum \\mathbf{h}}}"></div>
                        <span class="cls-notes-step-desc">消除图像大小和特征点总数的影响。当前通道归一化后的特征值：<strong>\\sqrt{${active.count} / ${totalFeatures}} \\approx ${normVal}</strong>。</span>
                    </div>
                </div>
                <div class="cls-notes-step-item">
                    <span class="cls-notes-step-num">4</span>
                    <div class="cls-notes-step-content">
                        <span class="cls-notes-step-title">线性分类器决策 (Linear Classifier)</span>
                        <div class="cls-notes-step-formula" data-formula="\\text{score}_c = W_c \\cdot \\mathbf{h}' + b_c"></div>
                        <span class="cls-notes-step-desc">使用训练好的分类器权重与直方图向量做内积。Top-1 预测类别为 <strong>${topB ? escapeHtml(topB.label) : "--"}</strong>，置信度为 <strong>${topB ? Math.round(topB.score * 100) : 0}%</strong>。</span>
                    </div>
                </div>
            `;
        }

        els.notesSteps.innerHTML = stepsHtml;

        // 渲染 KaTeX 公式
        if (window.katex) {
            try {
                // 渲染主公式
                window.katex.render(els.notesFormula.textContent, els.notesFormula, { throwOnError: false, displayMode: false });
                
                // 渲染当前选中特征的 LaTeX 符号
                if (state.method !== "cnn") {
                    window.katex.render(`f_{${active.featureId + 1}}`, els.statSelectedFeature, { throwOnError: false });
                    window.katex.render(`w_{${active.wordId + 1}}`, els.statSelectedWord, { throwOnError: false });
                    window.katex.render(`\\mathbf{h}[w_{${active.wordId + 1}}] = ${active.count}`, els.statSelectedBin, { throwOnError: false });
                } else {
                    els.statSelectedWord.textContent = "--";
                    els.statSelectedBin.textContent = vectorDimLabel();
                }

                // 渲染步骤流中的公式
                els.notesSteps.querySelectorAll("[data-formula]").forEach((el) => {
                    const formula = el.dataset.formula;
                    window.katex.render(formula, el, { throwOnError: false, displayMode: false });
                });
            } catch (e) {
                console.error("KaTeX render error:", e);
            }
        }
    }

    function setImage(img, missing, item) {
        img.src = item.image;
        if (missing) missing.textContent = item.image;
    }

    function revokeUploadedImage() {
        if (state.uploadedItem?.objectUrl) {
            URL.revokeObjectURL(state.uploadedItem.objectUrl);
        }
        state.uploadedItem = null;
    }

    function uploadedImageItem(file) {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                resolve({
                    id: `upload-${Date.now()}`,
                    name: file.name || "Uploaded Image",
                    image: objectUrl,
                    objectUrl,
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height,
                    bovw: { feature: "canvas patch descriptors -> codebook histogram" },
                    cnn: {
                        top5: [
                            { label: "上传图像", score: 1 },
                            { label: "未运行 CNN", score: 0 },
                            { label: "仅 BoVW 实时计算", score: 0 },
                        ],
                    },
                });
            };
            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("uploaded image failed to load"));
            };
            image.src = objectUrl;
        });
    }

    async function prepareBovwImage(item) {
        if (!item?.image) return;
        const bitmap = await loadImageBitmap(item);
        if (!bitmap) return;
        const current = sample();
        if (current?.image !== item.image) return;
        render();
    }

    function renderBovwFocus(item = sample()) {
        if (!item) return;
        renderBovwModeText();
        renderBovwOverlay(els.bovwOverlay);
        renderDictionary(els.bovwDictionary);
        scrollActiveWordIntoView();
        renderHistogram(els.bovwHistogram);
        renderHistogramVector();
        renderClassifierFlow(bovwScores());
        renderScores(els.bovwScoreList, bovwScores(), { chainNode: "topk" });
        renderFeatureCard();
        renderBovwFlow();
        renderNotes(item);
        scheduleBovwChain();
    }

    function renderBovwModeText() {
        const trained = isTrainedBovwActive();
        if (els.bovwTopkTitle) {
            els.bovwTopkTitle.textContent = trained ? "Top-K 花卉预测" : "Top-K 原型预测分数";
        }
        if (els.bovwTopkSubtitle) {
            els.bovwTopkSubtitle.textContent = trained ? "基于 BoVW 的已训练分类器" : "基于 BoVW 的教学原型演示";
        }
        if (els.bovwTopkNote) {
            els.bovwTopkNote.textContent = trained
                ? "当前模式使用本地训练得到的 BoVW 参数进行真实前端分类。"
                : "该模式用于解释 BoVW 原理，不代表真实分类概率。";
        }
        if (els.bovwInferenceProof) {
            if (trained) {
                const model = state.bovwModel;
                els.bovwInferenceProof.hidden = false;
                els.bovwInferenceProof.innerHTML = `
                    <span>前端推理</span>
                    <strong>模型配置已加载</strong>
                    <code>词典大小 ${model.vocab_size}×${model.descriptor.dimension}</code>
                    <code>权重 W ${model.labels.length}×${model.vocab_size} + b</code>
                    <em>无后端评分请求</em>
                `;
            } else {
                els.bovwInferenceProof.hidden = false;
                els.bovwInferenceProof.innerHTML = `
                    <span>原理演示</span>
                    <strong>已生成词典</strong>
                    <code>原型权重</code>
                    <em>非真实分类概率</em>
                `;
            }
        }
    }

    function renderBovw(item) {
        setImage(els.bovwImage, els.bovwMissing, item);
        renderBovwFocus(item);
        if (state.imageBitmap?.key !== item.image) prepareBovwImage(item);
    }

    function renderCnnModelProof() {
        if (!els.cnnModelProof) return;
        const statusText = {
            idle: "等待加载",
            loading: "正在加载 ONNX",
            ready: state.cnnModelKind === "flowers17" ? "Flowers17 CNN 就绪" : "ImageNet CNN 就绪",
            missing: "未找到 ONNX",
            error: "ONNX 错误",
        }[state.cnnOnnxStatus] || state.cnnOnnxStatus;
        const classCount = state.cnnModelKind === "flowers17" ? 17 : state.cnnModelKind === "imagenet" ? 1000 : "--";
        const runtime = state.cnnOnnxStatus === "ready" ? "ONNX 运行时 (Web)" : "概念演示模式";
        const infer = state.cnnInferenceMs ? `${Math.round(state.cnnInferenceMs)} ms` : "--";
        els.cnnModelProof.innerHTML = `
            <span>状态: ${escapeHtml(statusText)}</span>
            <strong>计算后端: ${escapeHtml(runtime)}</strong>
            <code>当前模型: ${escapeHtml(state.cnnOnnxConfig?.modelName || cnnModelLabels[state.cnnModelChoice] || "CNN ONNX")}</code>
            <code>类别体系: ${escapeHtml(state.cnnModelKind)} · ${classCount} 类</code>
            <code>输入分辨率: ${state.cnnOnnxConfig?.inputSize || 224}×${state.cnnOnnxConfig?.inputSize || 224}</code>
            <em>单次推理耗时: ${infer}</em>
            <small>信息: ${escapeHtml(state.cnnModelMessage || "等待初始化模型状态。")}</small>
        `;
    }

    function renderCnnGuidance() {
        if (!els.cnnGuidance) return;
        const isImagenet = state.cnnModelKind === "imagenet";
        const isFlowers = state.cnnModelKind === "flowers17";
        const modelText = isFlowers
            ? "当前模型：Oxford Flowers17 17 类花卉分类模型"
            : isImagenet
                ? "当前模型：ImageNet 1000 类物体分类模型"
                : "当前模型：CNN ONNX 模型尚未加载";
        const fitText = isFlowers
            ? "适合输入：单朵或主体明确的花卉图片"
            : "适合输入：单个主体明确的物体图像";
        const avoidText = isFlowers
            ? "不适合输入：街景、多人场景、非花卉物体"
            : "不适合输入：复杂街景、多人场景、道路场景";
        const sampleHint = isImagenet
            ? "左侧内置样例偏街景/多人场景，不是 ImageNet 的理想输入；建议上传主体明确的单物体图片，例如 dog / cat / car / cup。"
            : "当前样例会随模型类别体系切换；上传图片仍会直接进入前端 ONNX 推理。";
        els.cnnGuidance.innerHTML = `
            <div class="cls-cnn-guidance-main">
                <strong>${modelText}</strong>
                <span>${fitText}</span>
                <span>${avoidText}</span>
            </div>
            <p>${sampleHint}</p>
        `;
        if (els.cnnSampleHint) {
            els.cnnSampleHint.textContent = isImagenet
                ? "ImageNet 提示：内置街景/多人样例不理想，建议上传 dog / cat / car / cup 等单主体物体图片。"
                : "Flowers17 提示：优先使用花卉样例或上传主体明确的花朵图片。";
        }
    }

    function renderCnn(item) {
        setImage(els.cnnImage, els.cnnMissing, item);
        renderCnnOverlay(els.cnnInputOverlay);
        renderCnnGuidance();
        renderCnnAnimation(item);
        renderCnnMaps(els.cnnMaps);
        renderGlobalFeature(els.cnnGlobal, state.cnnModelKind === "imagenet" ? 128 : 64);
        renderCnnModelProof();
        renderScores(els.cnnScoreList, cnnScores(item));
        if (state.method === "cnn" || state.method === "compare") runCnnInference(item);
    }

    function renderCompareFlow() {
        if (!els.compareFlow) return;
        els.compareFlow.innerHTML = compareStages.map((stage, index) => `
            <button type="button" class="${stage.key === state.compareStage ? "is-active" : ""}" data-compare-stage="${stage.key}">
                <span>${index + 1}</span>
                <strong>${stage.label}</strong>
            </button>
        `).join("");
    }

    function renderCompareCnnOverlay() {
        if (!els.compareCnnOverlay) return;
        const active = state.compareStage;
        const windowClass = active === "input" || active === "representation" ? " is-active" : "";
        els.compareCnnOverlay.innerHTML = `
            <rect class="cls-compare-cnn-window${windowClass}" x="16" y="18" width="22" height="22" rx="2"></rect>
            <path class="cls-compare-cnn-flowline ${active === "input" ? "is-active" : ""}" d="M38 29 C52 28 58 36 69 36"></path>
            <path class="cls-compare-cnn-flowline ${active === "representation" ? "is-active" : ""}" d="M68 36 C76 45 78 58 82 69"></path>
            <path class="cls-compare-cnn-flowline ${active === "classifier" || active === "topk" ? "is-active" : ""}" d="M82 69 C88 72 92 76 96 82"></path>
            <circle class="cls-compare-cnn-token" cx="16" cy="29" r="1.8"></circle>
        `;
    }

    function renderCompareCnnMaps(target) {
        if (!target) return;
        const heatCells = Array.from({ length: 12 }, (_, index) => `<i style="--d:${(index * 0.035).toFixed(3)}s; --o:${(0.22 + ((index * 7) % 11) / 16).toFixed(3)}"></i>`).join("");
        target.innerHTML = `
            <article class="${state.compareStage === "input" ? "is-active" : ""}">
                <strong>patch × kernel</strong>
                <p>sliding 3×3 window → output value</p>
                <div class="cls-compare-kernel-row"><span>3×3 patch × kernel → 0.82</span></div>
            </article>
            <article class="${state.compareStage === "representation" ? "is-active" : ""}">
                <strong>shallow features</strong>
                <p>edges / colors / textures</p>
                <div class="cls-compare-map-cells">${heatCells}</div>
            </article>
            <article class="${state.compareStage === "representation" ? "is-active" : ""}">
                <strong>middle features</strong>
                <p>patterns / local shapes</p>
                <div class="cls-compare-map-cells">${heatCells}</div>
            </article>
            <article class="${state.compareStage === "classifier" ? "is-active" : ""}">
                <strong>high-level features</strong>
                <p>object parts / category responses</p>
                <div class="cls-compare-map-cells">${heatCells}</div>
            </article>
        `;
    }

    function renderCompareCnnVector(target, scores) {
        if (!target) return;
        const topScores = scores.length ? scores.slice(0, 5) : [{ label: "waiting", score: 0.2 }];
        const vector = Array.from({ length: 18 }, (_, index) => `<i class="${index % 5 === 0 ? "is-hot" : ""}" style="--h:${24 + ((index * 13) % 62)}%"></i>`).join("");
        const nodes = topScores.map((score, index) => `<span class="${index === 0 ? "is-top" : ""}">${escapeHtml(score.label)}</span>`).join("");
        target.innerHTML = `
            <div class="cls-compare-pooling-flow ${state.compareStage === "representation" ? "is-active" : ""}">
                <div class="cls-compare-pool-source">
                    ${Array.from({ length: 4 }, () => `<article>${Array.from({ length: 9 }, (_, i) => `<i style="--d:${(i * 0.025).toFixed(3)}s"></i>`).join("")}</article>`).join("")}
                </div>
                <strong>global pooling</strong>
            </div>
            <div class="cls-compare-vector-classifier ${state.compareStage === "classifier" || state.compareStage === "topk" ? "is-active" : ""}">
                <strong class="cls-compare-vector-title">pooled vector → classifier → Top-K nodes</strong>
                <div class="cls-compare-vector">${vector}</div>
                <svg viewBox="0 0 100 64" preserveAspectRatio="none">
                    ${[10, 22, 34, 46, 58].map((y, i) => `<path class="${i < 2 ? "is-hot" : ""}" d="M18 32 C39 ${y} 58 ${y} 82 ${y}"></path>`).join("")}
                </svg>
                <div class="cls-compare-class-nodes">${nodes}</div>
            </div>
        `;
    }

    function renderCompareCnnScores(target, scores) {
        if (!target) return;
        const topScores = scores.slice(0, 5);
        target.innerHTML = `
            <div class="cls-compare-softmax ${state.compareStage === "topk" ? "is-active" : ""}">
                <div class="cls-compare-softmax-title">ONNX logits → softmax probability bars → Top-5 ranking</div>
                ${topScores.map((item, index) => `
                    <div class="classification-score-row ${index === 0 ? "is-top" : ""}" style="--p:${Math.max(5, Math.round((item.score || 0) * 100))}%">
                        <span>${index + 1}</span>
                        <strong>${escapeHtml(item.label)}</strong>
                        <div><i style="width:${Math.round((item.score || 0) * 100)}%"></i></div>
                        <em>${Math.round((item.score || 0) * 100)}%</em>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderCompare(item) {
        setImage(els.compareBovwImage, null, item);
        setImage(els.compareCnnImage, null, item);
        renderCompareFlow();
        if (els.compareBovwRoute) els.compareBovwRoute.dataset.compareStage = state.compareStage;
        if (els.compareCnnRoute) els.compareCnnRoute.dataset.compareStage = state.compareStage;
        renderBovwOverlay(els.compareBovwOverlay);
        renderMiniHistogram(els.compareBovwHist);
        renderScores(els.compareBovwScores, bovwScores());
        renderCompareCnnOverlay();
        renderCompareCnnMaps(els.compareCnnMaps);
        renderCompareCnnVector(els.compareCnnGlobal, cnnScores(item));
        renderCompareCnnScores(els.compareCnnScores, cnnScores(item));
        renderDiffTable();
    }

    function render() {
        const item = sample();
        if (!item) return;
        rebuildRepresentation();
        const bScores = bovwScores();
        const cScores = cnnScores(item);
        const activeScores = state.method === "cnn" ? cScores : bScores;
        const top = activeScores[0];
        const methodLabel = state.method === "bovw"
            ? activeBovwLabel()
            : state.method === "cnn"
                ? `CNN · ${cnnModelLabels[state.cnnModelChoice] || state.cnnModelChoice}`
                : methodLabels[state.method];
        const effectiveVocabSize = isTrainedBovwActive() ? state.bovwModel.vocab_size : state.vocabSize;

        els.inputSize.textContent = item.width && item.height ? `${item.width} × ${item.height}` : "--";
        els.featureCount.textContent = state.method === "cnn" ? "卷积特征图" : (state.features.length ? String(state.features.length) : "正在计算...");
        els.vocabReadout.textContent = String(effectiveVocabSize);
        els.vectorDim.textContent = vectorDimLabel();
        els.top1.textContent = top ? `${top.label} ${Math.round(top.score * 100)}%${top.source === "prototype-demo" ? " 演示" : ""}` : (state.method === "cnn" ? "--" : "正在计算...");
        els.activeMethod.textContent = methodLabel;
        els.status.textContent = state.method === "cnn"
            ? (state.cnnOnnxStatus === "ready" ? `CNN ONNX 推理 · ${state.cnnModelKind.toUpperCase()}` : "CNN 概念视图")
            : state.method === "compare"
                ? "BOVW / CNN 对比模式"
                : isTrainedBovwActive()
                    ? "已训练 FLOWERS17 BOVW"
                    : "BOVW 原理演示模式";

        els.bovwControls.hidden = state.method === "cnn";
        if (els.cnnControls) els.cnnControls.hidden = state.method === "bovw";
        if (els.cnnModel) els.cnnModel.value = state.cnnModelChoice;
        if (els.vocabSize) {
            els.vocabSize.value = String(effectiveVocabSize);
            els.vocabSize.disabled = isTrainedBovwActive();
        }
        if (els.featureType) {
            els.featureType.disabled = isTrainedBovwActive();
        }
        if (state.method === "cnn") {
            els.featureCount.textContent = state.cnnOnnxStatus === "ready" ? "ONNX 特征激活图" : "卷积特征图";
            els.vocabReadout.textContent = "--";
            els.vectorDim.textContent = state.cnnModelKind === "flowers17" ? "17 类置信度" : state.cnnModelKind === "imagenet" ? "1000 类置信度" : "GAP 特征维";
            if (state.cnnInferenceMs) {
                els.top1.textContent = `${top ? top.label : "--"} ${top ? Math.round(top.score * 100) : 0}% · 推理耗时 ${Math.round(state.cnnInferenceMs)} ms`;
            }
        }

        els.modePanels.forEach((panel) => {
            const active = panel.dataset.clsMode === state.method;
            panel.hidden = !active;
        });

        renderBovw(item);
        renderCnn(item);
        renderCompare(item);

        setPhase(state.method === "compare" ? "topk" : "representation");
        if (state.method !== "bovw") renderNotes(item);
    }

    function readCachedData() {
        try {
            const raw = sessionStorage.getItem(DATA_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed?.version !== DATA_CACHE_VERSION) return null;
            return parsed.data || null;
        } catch (_error) {
            return null;
        }
    }

    function writeCachedData(data) {
        try {
            sessionStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ version: DATA_CACHE_VERSION, data }));
        } catch (_error) {
            // ignore storage errors
        }
    }

    function updateSampleOptions() {
        const data = activeData();
        if (!data?.samples?.length) return;
        const currentStillExists = data.samples.some((item) => item.id === state.sampleId);
        if (!currentStillExists) {
            state.sampleId = data.defaultSample || data.samples[0].id;
        }
        els.sample.innerHTML = data.samples
            .map((item) => `<option value="${item.id}">${translateSampleName(item.name)}</option>`)
            .join("");
        els.sample.value = state.sampleId;
    }

    function validateBovwModel(model) {
        return model?.model_type === "frontend_bovw_patch"
            && model?.descriptor?.dimension === 8
            && Array.isArray(model.codebook)
            && Array.isArray(model.labels)
            && Array.isArray(model.classifier?.weights)
            && Array.isArray(model.classifier?.bias)
            && model.codebook.length === model.vocab_size;
    }

    async function loadJson(url, label, required = false) {
        const response = await fetch(url);
        if (!response.ok) {
            if (required) throw new Error(`${label} HTTP ${response.status}`);
            return null;
        }
        return response.json();
    }

    function applyData(payload) {
        state.demoData = payload.demoData;
        state.flowerData = payload.flowerData;
        state.bovwModel = payload.bovwModel;
        state.bovwModelReady = validateBovwModel(payload.bovwModel);
        state.data = state.demoData;
        if (state.bovwModelReady) {
            state.vocabSize = state.bovwModel.vocab_size;
        }
        updateSampleOptions();
        render();
    }

    async function init() {
        try {
            sessionStorage.removeItem(DATA_CACHE_KEY);
            const [demoData, flowerData, bovwModel] = await Promise.all([
                loadJson(`${dataRoot}/classification_lab/classification_samples.json`, "classification samples", true),
                loadJson(flowersSamplesUrl, "flowers17 samples", false),
                loadJson(bovwModelUrl, "flowers17 bovw model", false),
            ]);
            const payload = { demoData, flowerData, bovwModel };
            applyData(payload);
            loadJson(`${dataRoot}/classification_lab/imagenet_classes_zh.json`, "imagenet zh labels", false).then((zh) => {
                if (Array.isArray(zh) && zh.length) state.imagenetZhLabels = zh;
            }).catch(() => {});
            loadSelectedCnnOnnxModel().then(() => {
                updateSampleOptions();
                state.cnnRealScores = [];
                state.cnnInferenceKey = "";
                render();
            });
        } catch (error) {
            console.error("classification lab data failed", error);
            els.notesCompare.innerHTML = `<p class="method-error">分类演示数据加载失败，请检查 static/assets/data/vision_tasks/classification_lab/classification_samples.json。</p>`;
        }
    }

    els.sample.addEventListener("change", () => {
        revokeUploadedImage();
        state.sampleId = els.sample.value;
        state.imageBitmap = null;
        resetCnnAnimation();
        render();
    });
    if (els.upload) {
        els.upload.addEventListener("change", async () => {
            const file = els.upload.files?.[0];
            if (!file) return;
            try {
                revokeUploadedImage();
                state.uploadedItem = await uploadedImageItem(file);
                state.imageBitmap = null;
                resetCnnAnimation();
                render();
            } catch (error) {
                console.error("classification upload failed", error);
            }
        });
    }
    els.methods.forEach((button) => {
        button.addEventListener("click", () => {
            state.method = button.dataset.clsMethod;
            els.methods.forEach((item) => {
                const active = item === button;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", active ? "true" : "false");
            });
            updateSampleOptions();
            state.imageBitmap = null;
            render();
        });
    });
    if (els.bovwEngine) {
        els.bovwEngine.addEventListener("change", () => {
            state.bovwEngine = els.bovwEngine.value;
            updateSampleOptions();
            state.imageBitmap = null;
            render();
        });
    }
    if (els.cnnModel) {
        els.cnnModel.addEventListener("change", () => {
            state.cnnModelChoice = els.cnnModel.value;
            resetCnnInferenceState(`Switching to ${cnnModelLabels[state.cnnModelChoice] || "CNN"}...`);
            resetCnnAnimation();
            updateSampleOptions();
            state.imageBitmap = null;
            render();
            loadSelectedCnnOnnxModel().then(() => {
                updateSampleOptions();
                render();
            });
        });
    }
    if (els.cnnStageSteps) {
        els.cnnStageSteps.addEventListener("click", (event) => {
            const button = event.target.closest("[data-cnn-stage-index]");
            if (!button) return;
            state.cnnAnimationAutoplay = false;
            setCnnStage(Number(button.dataset.cnnStageIndex), { play: true });
        });
    }
    if (els.cnnPlay) {
        els.cnnPlay.addEventListener("click", () => {
            state.cnnAnimationPlaying = true;
            state.cnnAnimationAutoplay = false;
            state.cnnAnimationTick += 1;
            render();
        });
    }
    if (els.cnnPause) {
        els.cnnPause.addEventListener("click", () => {
            state.cnnAnimationPlaying = false;
            state.cnnAnimationAutoplay = false;
            if (state.cnnAnimationTimer) clearTimeout(state.cnnAnimationTimer);
            state.cnnAnimationTimer = null;
            render();
        });
    }
    if (els.cnnNext) {
        els.cnnNext.addEventListener("click", () => {
            state.cnnAnimationAutoplay = false;
            setCnnStage(state.cnnStageIndex + 1, { play: true });
        });
    }
    if (els.cnnAuto) {
        els.cnnAuto.addEventListener("click", () => {
            state.cnnAnimationPlaying = true;
            state.cnnAnimationAutoplay = !state.cnnAnimationAutoplay;
            state.cnnAnimationTick += 1;
            render();
        });
    }
    if (els.compareFlow) {
        els.compareFlow.addEventListener("click", (event) => {
            const button = event.target.closest("[data-compare-stage]");
            if (!button) return;
            state.compareStage = button.dataset.compareStage;
            render();
        });
    }
    els.vocabSize.addEventListener("change", () => {
        state.vocabSize = Number(els.vocabSize.value);
        render();
    });
    els.featureType.addEventListener("change", () => {
        state.featureType = els.featureType.value;
        render();
    });
    els.bovwOverlay.addEventListener("pointermove", (event) => {
        const featureId = featureIdFromPointer(event);
        if (featureId === null) {
            clearHoverFeature();
            return;
        }
        setHoverFeature(featureId);
    });
    els.bovwOverlay.addEventListener("pointerleave", clearHoverFeature);
    els.bovwOverlay.addEventListener("click", (event) => {
        const featureId = featureIdFromPointer(event, 6.5);
        if (featureId === null) return;
        setSelectedFeature(featureId, "histogram");
    });
    els.bovwOverlay.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const point = event.target.closest?.("[data-feature-id]");
        if (!point || !els.bovwOverlay.contains(point)) return;
        event.preventDefault();
        setSelectedFeature(Number(point.dataset.featureId), "histogram");
    });
    els.bovwFlowSteps.forEach((step) => {
        step.addEventListener("click", () => {
            state.activeBovwStep = step.dataset.clsBovwStep || "local-features";
            renderBovwFocus();
        });
    });
    [els.bovwImage, els.cnnImage, els.compareBovwImage, els.compareCnnImage].forEach((img) => {
        if (!img) return;
        img.addEventListener("error", () => root.classList.add("is-image-missing"));
        img.addEventListener("load", () => {
            root.classList.remove("is-image-missing");
            scheduleBovwChain();
        });
    });
    window.addEventListener("resize", scheduleBovwChain);

    init();
})();
