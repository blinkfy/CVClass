(function () {
    const root = document.querySelector("[data-classification-lab]");
    if (!root) return;

    const api = window.CVClassVisionTasks || {};
    const dataRoot = api.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const bovwModelUrl = window.cvclassUrl("/static/assets/models/bovw/bovw_flowers17_model.json");
    const flowersSamplesUrl = `${dataRoot}/classification_lab/flowers17_samples.json`;
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
    };

    const els = {
        sample: $("[data-cls-sample]"),
        upload: $("[data-cls-upload]"),
        methods: $$("[data-cls-method]"),
        bovwControls: $("[data-cls-bovw-controls]"),
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
        cnnMaps: $("[data-cls-cnn-maps]"),
        cnnGlobal: $("[data-cls-cnn-global]"),
        cnnScoreList: $("[data-cls-cnn-score-list]"),

        compareBovwImage: $("[data-cls-compare-bovw-image]"),
        compareBovwOverlay: $("[data-cls-compare-bovw-overlay]"),
        compareBovwHist: $("[data-cls-compare-bovw-hist]"),
        compareBovwScores: $("[data-cls-compare-bovw-scores]"),
        compareCnnImage: $("[data-cls-compare-cnn-image]"),
        compareCnnMaps: $("[data-cls-compare-cnn-maps]"),
        compareCnnGlobal: $("[data-cls-compare-cnn-global]"),
        compareCnnScores: $("[data-cls-compare-cnn-scores]"),
        compareDiff: $("[data-cls-compare-diff]"),

        notesMethod: $("[data-cls-notes-method]"),
        notesMethodDesc: $("[data-cls-notes-method-desc]"),
        notesFormula: $("[data-cls-notes-formula]"),
        notesFormulaNote: $("[data-cls-notes-formula-note]"),
        statSelectedFeature: $("[data-cls-stat-selected-feature]"),
        statSelectedWord: $("[data-cls-stat-selected-word]"),
        statSelectedDistance: $("[data-cls-stat-selected-distance]"),
        statSelectedBin: $("[data-cls-stat-selected-bin]"),
        notesCompare: $("[data-cls-notes-compare]"),

        stepper: $$("[data-cls-phase]"),
    };

    if (["bovw", "cnn", "compare"].includes(initialParams.get("method"))) {
        state.method = initialParams.get("method");
    }
    if (initialParams.get("focus") === "topk") {
        state.topK = 5;
    }
    els.methods.forEach((item) => {
        const active = item.dataset.clsMethod === state.method;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (els.topK) els.topK.value = String(state.topK);
    if (els.vocabSize) els.vocabSize.value = String(state.vocabSize);
    if (els.bovwEngine) els.bovwEngine.value = state.bovwEngine;

    const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    function sample() {
        if (state.uploadedItem) return state.uploadedItem;
        const data = activeData();
        return data?.samples.find((item) => item.id === state.sampleId) || data?.samples[0];
    }

    function activeData() {
        if (state.method === "cnn") return state.demoData || state.data;
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
        els.stepper.forEach((item) => item.classList.toggle("is-active", item.dataset.clsPhase === phase));
    }

    function cnnScores(item) {
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
        const chipTop = activeChip.offsetTop;
        const chipBottom = chipTop + activeChip.offsetHeight;
        const viewTop = els.bovwDictionary.scrollTop;
        const viewBottom = viewTop + els.bovwDictionary.clientHeight;
        const padding = 12;
        if (chipTop < viewTop + padding) {
            els.bovwDictionary.scrollTo({ top: Math.max(0, chipTop - padding), behavior: "smooth" });
            return;
        }
        if (chipBottom > viewBottom - padding) {
            els.bovwDictionary.scrollTo({ top: chipBottom - els.bovwDictionary.clientHeight + padding, behavior: "smooth" });
        }
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
            els.bovwHistVector.innerHTML = `<span>histogram vector</span><code>[computing from canvas image...]</code>`;
            els.bovwHistVote.innerHTML = `<strong>等待图像采样</strong><span>patch descriptors → codebook assignment</span><em>hist[w] += count</em>`;
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
                <span>radial histogram summary</span>
                <code>${nonZero}/${state.histogram.length} non-zero bins · active w${active.wordId + 1}=${active.count} · ${topBins}</code>
            `;
            els.bovwHistVote.innerHTML = `
                <strong style="--word-color:${active.word.color}">feature f${active.featureId + 1} → w${active.wordId + 1}</strong>
                <span>nearest word distance = ${active.distance.toFixed(3)}</span>
                <em>radial spoke w${active.wordId + 1} extends from center</em>
            `;
            return;
        }
        els.bovwHistVector.hidden = false;
        els.bovwHistVector.innerHTML = `
            <span>histogram vector</span>
            <code>[${state.histogram.map((count, index) => index === active.wordId ? `<b>${count}</b>` : count).join(", ")}]</code>
        `;
        els.bovwHistVote.innerHTML = `
            <strong style="--word-color:${active.word.color}">feature f${active.featureId + 1} → w${active.wordId + 1}</strong>
            <span>nearest word distance = ${active.distance.toFixed(3)}</span>
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
        target.innerHTML = Array.from({ length: 12 }, (_, i) => `
            <div class="cls-cnn-map">
                ${Array.from({ length: 16 }, (_, j) => `<span style="opacity:${0.25 + (((i * 7 + j * 5) % 9) / 12)}; --delay:${((i * 4 + j) * 0.01).toFixed(2)}s"></span>`).join("")}
            </div>
        `).join("");
    }

    function renderGlobalFeature(target, dim = 64) {
        const cells = Array.from({ length: dim }, (_, i) => {
            const intensity = 0.12 + ((i * 13) % 17) / 28;
            return `<span style="opacity:${intensity.toFixed(3)}; --delay:${(i * 0.01).toFixed(2)}s"></span>`;
        }).join("");
        target.innerHTML = `
            <div class="cls-global-vector">${cells}</div>
            <div class="cls-global-meta">
                <span>${dim} dims</span>
                <span>GAP: H×W×C → 1×1×C</span>
            </div>
        `;
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
            ? "trained logistic regression"
            : isPrototype
                ? "untrained prototype weights"
                : "calibrated demo scores";
        const note = isTrained
            ? "当前 Top-K 由导出的 codebook、L1+sqrt histogram 和 logistic regression 权重在前端计算。"
            : isPrototype
                ? "当前为未训练原型分数，只用于说明 histogram 如何进入分类器。"
                : "内置样例分数经过人工校准，用来演示分类器输出结构。";
        els.bovwClassifierFlow.innerHTML = `
            <span data-chain-node="classifier">computed histogram</span>
            <b aria-hidden="true">→</b>
            <span>${classifierText}</span>
            <b aria-hidden="true">→</b>
            <strong>${top ? `${escapeHtml(top.label)} ${Math.round(top.score * 100)}%` : "Top-K scores"}</strong>
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
            <strong>feature f${active.featureId + 1}</strong>
            <span>assigned visual word: <b>w${active.wordId + 1}</b></span>
            <span>nearest word distance: <b>${active.distance.toFixed(3)}</b></span>
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
            window.setTimeout(scheduleBovwChain, 180);
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
        els.compareDiff.innerHTML = `
            <table>
                <thead><tr><th>对比维度</th><th>BoVW</th><th>CNN</th></tr></thead>
                <tbody>
                    <tr><td>表示形式</td><td>稀疏词频直方图<br><small>${state.vocabSize} bins</small></td><td>全局稠密特征向量<br><small>via GAP</small></td></tr>
                    <tr><td>特征来源</td><td>手工局部描述子<br><small>${featureLabels[state.featureType]}</small></td><td>数据驱动的卷积核<br><small>端到端学习</small></td></tr>
                    <tr><td>空间信息</td><td>弱（需 SPM 增强）</td><td>保留在特征图中，<br>池化后压缩</td></tr>
                    <tr><td>训练方式</td><td>分阶段：词典 + 分类器</td><td>统一反向传播优化</td></tr>
                    <tr><td>可解释性</td><td>词频、关键点可见</td><td>特征图可视化较抽象</td></tr>
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
        els.statSelectedFeature.textContent = state.method === "cnn" ? "conv maps" : `f${active.featureId + 1}`;
        els.statSelectedWord.textContent = state.method === "cnn" ? "--" : `w${active.wordId + 1}`;
        els.statSelectedDistance.textContent = state.method === "cnn" ? "--" : active.distance.toFixed(3);
        els.statSelectedBin.textContent = state.method === "cnn" ? vectorDimLabel() : `hist[w${active.wordId + 1}] = ${active.count}`;

        if (state.method === "cnn") {
            els.notesMethodDesc.textContent = "直接从像素学习卷积特征、全局语义向量和分类器参数。";
            els.notesFormula.textContent = "p = softmax(W · GAP(conv(image)) + b)";
            els.notesFormulaNote.textContent = "CNN 通过卷积层提取层级特征，经全局平均池化得到图像级向量，再由全连接层输出类别概率。";
            els.notesCompare.innerHTML = `
                <dl>
                    <div><dt>当前方法</dt><dd>CNN 端到端分类：输入 → 卷积特征图 → GAP → Softmax。</dd></div>
                    <div><dt>与 BoVW 对比</dt><dd>不需要手工设计视觉词典，特征、聚合和分类器联合优化。</dd></div>
                    <div><dt>Top-K 输出</dt><dd>展示 softmax 后的 Top-${state.topK} 类别概率。</dd></div>
                </dl>
            `;
            return;
        }
        if (state.method === "compare") {
            els.notesMethodDesc.textContent = "并置 BoVW 与 CNN 两条路径，对比它们的表示与输出结构。";
            els.notesFormula.textContent = "BoVW: score_c = W_c · normalize(hist) + b_c";
            els.notesFormulaNote.textContent = isTrainedBovwActive()
                ? "BoVW 分支使用本地训练导出的 KMeans codebook 与 logistic regression 权重，在前端完成真实分类。"
                : "Principle Demo 使用页面生成的视觉词典和原型权重，只用于解释 BoVW 原理。";
            els.notesCompare.innerHTML = `
                <dl>
                    <div><dt>BoVW Top-1</dt><dd>${topB ? `${escapeHtml(topB.label)} · ${Math.round(topB.score * 100)}%` : "--"}</dd></div>
                    <div><dt>CNN Top-1</dt><dd>${topC ? `${escapeHtml(topC.label)} · ${Math.round(topC.score * 100)}%` : "--"}</dd></div>
                    <div><dt>关键差异</dt><dd>BoVW 把图像表示为可解释的视觉词频；CNN 把图像表示为端到端学习得到的语义向量。</dd></div>
                </dl>
            `;
            return;
        }
        const isPrototype = topB?.source === "prototype-demo";
        const isTrained = topB?.source === "trained-flowers17";
        els.notesMethodDesc.textContent = isTrained
            ? "当前模式使用本地训练得到的 BoVW 参数进行真实前端分类。"
            : "该模式用于解释 BoVW 原理，不代表真实分类概率。";
        els.notesFormula.textContent = "score_c = W_c · normalize(hist) + b_c";
        els.notesFormulaNote.textContent = isTrained
            ? "前端从 Canvas 采样 patch descriptor，分配到导出的 128 个 visual words，执行 L1+sqrt 归一化，再用 JSON 中的 W 和 b 计算 softmax。"
            : `BoVW Principle Demo：从 Canvas 采样 patch descriptor，分配到页面生成的 codebook，再用 ${state.vocabSize} 维 histogram 展示分类器输入。`;
        els.notesCompare.innerHTML = `
            <dl>
                <div><dt>当前 visual word</dt><dd>w${active.wordId + 1} · ${escapeHtml(active.meaning)} · count ${active.count}</dd></div>
                <div><dt>当前 histogram bin</dt><dd>hist[w${active.wordId + 1}] += 1，向量第 ${active.wordId + 1} 维被累加。</dd></div>
                <div><dt>输出结构</dt><dd>image → histogram vector (${isTrained ? state.bovwModel.vocab_size : state.vocabSize} bins) → class scores。</dd></div>
                <div><dt>Top-K</dt><dd>${isTrained ? "真实 Flowers17 分类分数" : isPrototype ? "未训练原型分数，仅说明 histogram 如何变成分数" : "内置示例校准分数，用来演示分类器输出结构"}；Top-1 为 ${topB ? `${escapeHtml(topB.label)} ${Math.round(topB.score * 100)}%` : "--"}。</dd></div>
            </dl>
        `;
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
            els.bovwTopkTitle.textContent = trained ? "Top-K Flower Prediction" : "Top-K Principle Score";
        }
        if (els.bovwTopkSubtitle) {
            els.bovwTopkSubtitle.textContent = trained ? "trained classifier over BoVW" : "principle demo over BoVW";
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
                    <span>browser-side inference</span>
                    <strong>model JSON loaded</strong>
                    <code>codebook ${model.vocab_size}×${model.descriptor.dimension}</code>
                    <code>W ${model.labels.length}×${model.vocab_size} + b</code>
                    <em>no backend scoring request</em>
                `;
            } else {
                els.bovwInferenceProof.hidden = false;
                els.bovwInferenceProof.innerHTML = `
                    <span>principle demo</span>
                    <strong>generated codebook</strong>
                    <code>prototype weights</code>
                    <em>not class probability</em>
                `;
            }
        }
    }

    function renderBovw(item) {
        setImage(els.bovwImage, els.bovwMissing, item);
        renderBovwFocus(item);
        if (state.imageBitmap?.key !== item.image) prepareBovwImage(item);
    }

    function renderCnn(item) {
        setImage(els.cnnImage, els.cnnMissing, item);
        renderCnnOverlay(els.cnnInputOverlay);
        renderCnnMaps(els.cnnMaps);
        renderGlobalFeature(els.cnnGlobal, 64);
        renderScores(els.cnnScoreList, cnnScores(item));
    }

    function renderCompare(item) {
        setImage(els.compareBovwImage, null, item);
        setImage(els.compareCnnImage, null, item);
        renderBovwOverlay(els.compareBovwOverlay);
        renderMiniHistogram(els.compareBovwHist);
        renderScores(els.compareBovwScores, bovwScores());
        renderCnnMaps(els.compareCnnMaps);
        renderGlobalFeature(els.compareCnnGlobal, 32);
        renderScores(els.compareCnnScores, cnnScores(item));
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
        const methodLabel = state.method === "bovw" ? activeBovwLabel() : methodLabels[state.method];
        const effectiveVocabSize = isTrainedBovwActive() ? state.bovwModel.vocab_size : state.vocabSize;

        els.inputSize.textContent = item.width && item.height ? `${item.width} × ${item.height}` : "--";
        els.featureCount.textContent = state.method === "cnn" ? "learned maps" : (state.features.length ? String(state.features.length) : "computing...");
        els.vocabReadout.textContent = String(effectiveVocabSize);
        els.vectorDim.textContent = vectorDimLabel();
        els.top1.textContent = top ? `${top.label} ${Math.round(top.score * 100)}%${top.source === "prototype-demo" ? " demo" : ""}` : (state.method === "cnn" ? "--" : "computing...");
        els.activeMethod.textContent = methodLabel;
        els.status.textContent = state.method === "cnn"
            ? "CNN CONCEPT VIEW"
            : state.method === "compare"
                ? "BOVW / CNN COMPARE"
                : isTrainedBovwActive()
                    ? "TRAINED FLOWERS17 BOVW"
                    : "BOVW PRINCIPLE DEMO";

        els.bovwControls.hidden = state.method === "cnn";
        if (els.vocabSize) {
            els.vocabSize.value = String(effectiveVocabSize);
            els.vocabSize.disabled = isTrainedBovwActive();
        }
        if (els.featureType) {
            els.featureType.disabled = isTrainedBovwActive();
        }
        if (state.method === "cnn") {
            els.featureCount.textContent = "learned maps";
            els.vocabReadout.textContent = "--";
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
            .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
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
        } catch (error) {
            console.error("classification lab data failed", error);
            els.notesCompare.innerHTML = `<p class="method-error">分类演示数据加载失败，请检查 static/assets/data/vision_tasks/classification_lab/classification_samples.json。</p>`;
        }
    }

    els.sample.addEventListener("change", () => {
        revokeUploadedImage();
        state.sampleId = els.sample.value;
        state.imageBitmap = null;
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
