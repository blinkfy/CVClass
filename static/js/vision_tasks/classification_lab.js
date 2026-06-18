(function () {
    const root = document.querySelector("[data-classification-lab]");
    if (!root) return;

    const api = window.CVClassVisionTasks || {};
    const dataRoot = api.moduleDataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];
    const methodLabels = {
        bovw: "BoVW 视觉词袋",
        pyramid: "Spatial Pyramid Matching",
        cnn: "CNN 分类对比",
    };
    const featureLabels = {
        sift: "SIFT-like",
        orb: "ORB-like",
        preset: "预设局部特征",
    };
    const palette = ["#2563eb", "#f97316", "#22c55e", "#a855f7", "#eab308", "#06b6d4", "#ef4444", "#14b8a6", "#64748b", "#ec4899", "#84cc16", "#8b5cf6"];
    const state = {
        data: null,
        sampleId: "",
        method: "bovw",
        vocabSize: 16,
        featureType: "sift",
        topK: 3,
        features: [],
        words: [],
        assignments: [],
        histogram: [],
        pyramid: null,
    };

    const els = {
        sample: $("[data-cls-sample]"),
        methods: $$("[data-cls-method]"),
        vocabSize: $("[data-cls-vocab-size]"),
        featureType: $("[data-cls-feature-type]"),
        topK: $("[data-cls-topk]"),
        activeMethod: $("[data-cls-active-method]"),
        inputSize: $("[data-cls-input-size]"),
        featureCount: $("[data-cls-feature-count]"),
        vocabReadout: $("[data-cls-vocab-readout]"),
        vectorDim: $("[data-cls-vector-dim]"),
        top1: $("[data-cls-top1]"),
        status: $("[data-cls-status]"),
        stripMethod: $("[data-cls-strip-method]"),
        stripFeature: $("[data-cls-strip-feature]"),
        stripVector: $("[data-cls-strip-vector]"),
        stripPrediction: $("[data-cls-strip-prediction]"),
        stripTopk: $("[data-cls-strip-topk]"),
        image: $("[data-cls-image]"),
        missing: $("[data-cls-missing]"),
        featureOverlay: $("[data-cls-feature-overlay]"),
        imageTitle: $("[data-cls-image-title]"),
        imageSubtitle: $("[data-cls-image-subtitle]"),
        visualTitle: $("[data-cls-visual-title]"),
        visualSubtitle: $("[data-cls-visual-subtitle]"),
        dictionary: $("[data-cls-dictionary]"),
        cnnMaps: $("[data-cls-cnn-maps]"),
        flowFeature: $("[data-cls-flow-feature]"),
        histTitle: $("[data-cls-hist-title]"),
        histSubtitle: $("[data-cls-hist-subtitle]"),
        histogram: $("[data-cls-histogram]"),
        pyramidPanel: $("[data-cls-pyramid-panel]"),
        pyramidImage: $("[data-cls-pyramid-image]"),
        pyramidGrid: $("[data-cls-pyramid-grid]"),
        pyramidRegions: $("[data-cls-pyramid-regions]"),
        boardTitle: $("[data-cls-board-title]"),
        boardSubtitle: $("[data-cls-board-subtitle]"),
        scoreList: $("[data-cls-score-list]"),
        cnnCompare: $("[data-cls-cnn-compare]"),
        notesSubtitle: $("[data-cls-notes-subtitle]"),
        formulaLabel: $("[data-cls-formula-label]"),
        formula: $("[data-cls-formula]"),
        formulaNote: $("[data-cls-formula-note]"),
        notes: $("[data-cls-notes]"),
        stepper: $$("[data-cls-phase]"),
    };

    const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    function sample() {
        return state.data?.samples.find((item) => item.id === state.sampleId) || state.data?.samples[0];
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

    function methodScores(item) {
        return state.method === "cnn" ? item.cnn?.top5 || [] : item.bovw?.top5 || [];
    }

    function generateFeatures(item) {
        const rand = randomFactory(hashSeed(`${item.id}-${state.featureType}-${state.vocabSize}`));
        const countBase = state.featureType === "orb" ? 42 : state.featureType === "preset" ? 30 : 54;
        const count = countBase + Math.round(rand() * 10);
        const features = [];
        const anchorSets = {
            crosswalk_people: [[18, 48], [34, 64], [52, 52], [72, 38], [78, 66], [42, 28]],
            classroom_students: [[22, 34], [42, 42], [63, 36], [78, 48], [55, 70], [30, 68]],
        };
        const anchors = anchorSets[item.id] || [[25, 35], [52, 42], [70, 65], [38, 72]];
        for (let i = 0; i < count; i += 1) {
            const anchor = anchors[i % anchors.length];
            const spread = state.featureType === "orb" ? 11 : state.featureType === "preset" ? 7 : 9;
            const x = Math.max(4, Math.min(96, anchor[0] + (rand() - 0.5) * spread * 2 + (i % 3) * 1.6));
            const y = Math.max(5, Math.min(95, anchor[1] + (rand() - 0.5) * spread * 2));
            const scale = state.featureType === "orb" ? 3 + rand() * 3 : 4 + rand() * 5;
            const angle = Math.round(rand() * 360);
            const descriptor = [
                Math.max(0, Math.min(1, x / 100 + (rand() - 0.5) * 0.12)),
                Math.max(0, Math.min(1, y / 100 + (rand() - 0.5) * 0.12)),
                rand(),
                rand(),
            ];
            features.push({ id: i, x, y, scale, angle, descriptor });
        }
        return features;
    }

    function generateWords() {
        const words = [];
        const columns = Math.ceil(Math.sqrt(state.vocabSize));
        for (let i = 0; i < state.vocabSize; i += 1) {
            const gx = (i % columns) / Math.max(1, columns - 1);
            const gy = Math.floor(i / columns) / Math.max(1, columns - 1);
            words.push({
                id: i,
                color: palette[i % palette.length],
                descriptor: [
                    Math.max(0, Math.min(1, gx * 0.78 + 0.11)),
                    Math.max(0, Math.min(1, gy * 0.78 + 0.11)),
                    ((i * 37) % 101) / 100,
                    ((i * 61) % 97) / 96,
                ],
            });
        }
        return words;
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
            histogram[best] += 1;
        });
        return { assignments, histogram };
    }

    function buildPyramid(features, assignments) {
        const levels = [1, 2, 4];
        const regions = [];
        levels.forEach((level) => {
            for (let row = 0; row < level; row += 1) {
                for (let col = 0; col < level; col += 1) {
                    const hist = new Array(state.vocabSize).fill(0);
                    let count = 0;
                    features.forEach((feature, index) => {
                        const cx = Math.min(level - 1, Math.floor((feature.x / 100) * level));
                        const cy = Math.min(level - 1, Math.floor((feature.y / 100) * level));
                        if (cx === col && cy === row) {
                            hist[assignments[index]] += 1;
                            count += 1;
                        }
                    });
                    regions.push({ level, row, col, count, hist });
                }
            }
        });
        return { levels, regions, vectorDim: state.vocabSize * regions.length };
    }

    function rebuildRepresentation() {
        const item = sample();
        if (!item) return;
        state.features = generateFeatures(item);
        state.words = generateWords();
        const assigned = assignFeatures(state.features, state.words);
        state.assignments = assigned.assignments;
        state.histogram = assigned.histogram;
        state.pyramid = buildPyramid(state.features, state.assignments);
    }

    function renderOverlay() {
        if (state.method === "cnn") {
            els.featureOverlay.innerHTML = `
                <rect x="8" y="10" width="84" height="76" rx="3" fill="rgba(37,99,235,0.08)" stroke="#60a5fa" stroke-width="0.8"></rect>
                ${Array.from({ length: 20 }, (_, i) => {
                    const x = 12 + (i % 5) * 16;
                    const y = 16 + Math.floor(i / 5) * 16;
                    return `<rect x="${x}" y="${y}" width="10" height="10" rx="1.5" fill="#2563eb" opacity="${0.18 + (i % 4) * 0.12}"></rect>`;
                }).join("")}
                <text x="50" y="94" text-anchor="middle" fill="#1e40af" font-size="5" font-weight="800">convolutional feature maps</text>
            `;
            return;
        }
        const lineLimit = state.method === "pyramid" ? 30 : 24;
        const lines = state.features.slice(0, lineLimit).map((feature, index) => {
            const word = state.words[state.assignments[index]];
            const cx = 8 + (word.id % 8) * 4.5;
            const cy = 8 + Math.floor(word.id % 16 / 8) * 4.5;
            return `<line x1="${feature.x.toFixed(2)}" y1="${feature.y.toFixed(2)}" x2="${cx.toFixed(2)}" y2="${cy.toFixed(2)}" stroke="${word.color}" stroke-width="0.45" opacity="0.28"></line>`;
        }).join("");
        const points = state.features.map((feature, index) => {
            const word = state.words[state.assignments[index]];
            const shape = state.featureType === "orb"
                ? `<rect x="${(feature.x - 1.15).toFixed(2)}" y="${(feature.y - 1.15).toFixed(2)}" width="2.3" height="2.3" transform="rotate(${feature.angle} ${feature.x} ${feature.y})" fill="${word.color}" stroke="#ffffff" stroke-width="0.4"></rect>`
                : `<circle cx="${feature.x.toFixed(2)}" cy="${feature.y.toFixed(2)}" r="${Math.max(1.1, feature.scale * 0.22).toFixed(2)}" fill="${word.color}" fill-opacity="0.88" stroke="#ffffff" stroke-width="0.45"></circle>`;
            return shape;
        }).join("");
        const grid = state.method === "pyramid" ? `
            <path d="M50 0 V100 M0 50 H100" stroke="#ffffff" stroke-width="0.9" opacity="0.95"></path>
            ${[25, 75].map((v) => `<path d="M${v} 0 V100 M0 ${v} H100" stroke="#ffffff" stroke-width="0.45" opacity="0.55"></path>`).join("")}
        ` : "";
        els.featureOverlay.innerHTML = `${grid}${lines}${points}`;
    }

    function renderDictionary() {
        const maxVisible = Math.min(state.vocabSize, 32);
        els.dictionary.hidden = state.method === "cnn";
        els.cnnMaps.hidden = state.method !== "cnn";
        if (state.method === "cnn") {
            els.cnnMaps.innerHTML = Array.from({ length: 12 }, (_, i) => `
                <div class="cls-cnn-map">
                    ${Array.from({ length: 16 }, (_, j) => `<span style="opacity:${0.25 + (((i * 7 + j * 5) % 9) / 12)}"></span>`).join("")}
                </div>
            `).join("");
            return;
        }
        els.dictionary.innerHTML = state.words.slice(0, maxVisible).map((word) => `
            <div class="cls-word-chip">
                <i style="background:${word.color}"></i>
                <span>w${word.id + 1}</span>
            </div>
        `).join("") + (state.vocabSize > maxVisible ? `<div class="cls-word-chip is-more">+${state.vocabSize - maxVisible}</div>` : "");
    }

    function renderHistogram() {
        const max = Math.max(1, ...state.histogram);
        const visibleBins = state.histogram.map((count, index) => ({ count, index }));
        els.histogram.innerHTML = visibleBins.map(({ count, index }) => {
            const height = Math.max(5, Math.round((count / max) * 100));
            return `
                <div class="cls-hist-bin" title="word ${index + 1}: ${count}">
                    <i style="height:${height}%; background:${palette[index % palette.length]}"></i>
                    <span>${index + 1}</span>
                </div>
            `;
        }).join("");
    }

    function renderPyramid(item) {
        const enabled = state.method === "pyramid";
        els.pyramidPanel.hidden = !enabled;
        if (!enabled) return;
        els.pyramidImage.src = item.image;
        els.pyramidGrid.innerHTML = `
            <rect x="0" y="0" width="100" height="100" fill="transparent" stroke="#ffffff" stroke-width="1.2"></rect>
            <path d="M50 0 V100 M0 50 H100" stroke="#ffffff" stroke-width="1"></path>
            ${[25, 75].map((v) => `<path d="M${v} 0 V100 M0 ${v} H100" stroke="#ffffff" stroke-width="0.55" opacity="0.7"></path>`).join("")}
        `;
        const topRegions = [...state.pyramid.regions].sort((a, b) => b.count - a.count).slice(0, 8);
        els.pyramidRegions.innerHTML = topRegions.map((region) => {
            const max = Math.max(1, ...region.hist);
            return `
                <div class="cls-pyramid-region">
                    <strong>${region.level}×${region.level} · r${region.row + 1}c${region.col + 1}</strong>
                    <div>${region.hist.slice(0, 8).map((v, idx) => `<i style="height:${Math.max(4, Math.round((v / max) * 100))}%; background:${palette[idx % palette.length]}"></i>`).join("")}</div>
                    <span>${region.count} features</span>
                </div>
            `;
        }).join("");
    }

    function renderScores(scores) {
        const sliced = scores.slice(0, state.topK);
        els.scoreList.innerHTML = sliced.map((item, index) => `
            <div class="classification-score-row ${index === 0 ? "is-top" : ""}">
                <span>${index + 1}</span>
                <strong>${escapeHtml(item.label)}</strong>
                <div><i style="width:${Math.round((item.score || 0) * 100)}%"></i></div>
                <em>${Math.round((item.score || 0) * 100)}%</em>
            </div>
        `).join("");
    }

    function vectorDim() {
        if (state.method === "cnn") return "GAP 1×C";
        if (state.method === "pyramid") return `${state.pyramid?.vectorDim || state.vocabSize * 21} dims`;
        return `${state.vocabSize} bins`;
    }

    function renderNotes(item, scores) {
        const top = scores[0];
        if (state.method === "pyramid") {
            els.notesSubtitle.textContent = "Spatial Pyramid Matching";
            els.formulaLabel.textContent = "SPM";
            els.formula.textContent = "vector = concat(hist(1×1), hist(2×2), hist(4×4))";
            els.formulaNote.textContent = "空间金字塔把 BoVW 从整图统计扩展到多尺度网格，补充弱位置信息。";
            els.notes.innerHTML = `
                <dl>
                    <div><dt>图像分类定义</dt><dd>输入整张图像，输出类别概率排序；不负责定位对象位置。</dd></div>
                    <div><dt>空间金字塔</dt><dd>1×1 保留全局分布，2×2 与 4×4 补充区域布局，最终拼接为 ${vectorDim()}。</dd></div>
                    <div><dt>视觉词典</dt><dd>${state.vocabSize} 个视觉单词，每个局部特征被分配给最近的视觉单词。</dd></div>
                    <div><dt>Top-K 概念</dt><dd>Top-${state.topK} 检查正确类别是否出现在最高的 ${state.topK} 个预测内。</dd></div>
                    <div><dt>当前预测</dt><dd>${escapeHtml(top?.label || "--")} · ${Math.round((top?.score || 0) * 100)}%</dd></div>
                </dl>
            `;
            return;
        }
        if (state.method === "cnn") {
            els.notesSubtitle.textContent = "CNN End-to-end Classification";
            els.formulaLabel.textContent = "CNN";
            els.formula.textContent = "p = softmax(W · GAP(conv(image)) + b)";
            els.formulaNote.textContent = "CNN 直接从像素学习卷积特征、全局语义向量和分类器参数。";
            els.notes.innerHTML = `
                <dl>
                    <div><dt>CNN 为什么端到端</dt><dd>局部特征、聚合方式和分类器由训练目标共同优化，不需要手工视觉词典。</dd></div>
                    <div><dt>卷积特征图</dt><dd>浅层更像边缘纹理响应，深层更接近物体部件和场景语义。</dd></div>
                    <div><dt>全局特征</dt><dd>Global Average Pooling 把 H×W×C 特征图压缩为 C 维图像向量。</dd></div>
                    <div><dt>Top-K 输出</dt><dd>展示 softmax 后的 Top-${state.topK} 类别概率。</dd></div>
                    <div><dt>与 BoVW 对比</dt><dd>BoVW 依赖局部描述子和直方图，CNN 学到层级特征并保留更强语义表达。</dd></div>
                </dl>
            `;
            return;
        }
        els.notesSubtitle.textContent = "BoVW Flow";
        els.formulaLabel.textContent = "BoVW";
        els.formula.textContent = "hist[w] = count(assign(feature_i) = word_w)";
        els.formulaNote.textContent = "BoVW 将局部特征量化为视觉单词，再把整图编码为词频直方图。";
        els.notes.innerHTML = `
            <dl>
                <div><dt>图像分类定义</dt><dd>预测整张图像属于哪些类别，输出 Top-K 类别概率。</dd></div>
                <div><dt>BoVW 流程</dt><dd>局部特征 → K-means 视觉词典 → 视觉单词分配 → 直方图编码 → 分类器。</dd></div>
                <div><dt>局部特征</dt><dd>${featureLabels[state.featureType]} 产生 ${state.features.length} 个关键点或局部描述子。</dd></div>
                <div><dt>视觉词典</dt><dd>${state.vocabSize} 个中心模拟 K-means codebook，每个颜色表示一个视觉单词。</dd></div>
                <div><dt>Top-K 错误率</dt><dd>若真实类别不在 Top-${state.topK} 中，则记为 Top-${state.topK} error。</dd></div>
            </dl>
        `;
    }

    function render() {
        const item = sample();
        if (!item) return;
        rebuildRepresentation();
        const scores = methodScores(item);
        const top = scores[0];
        const methodLabel = methodLabels[state.method];
        const featureLabel = featureLabels[state.featureType];

        els.image.src = item.image;
        els.missing.textContent = item.image;
        els.inputSize.textContent = `${item.width} × ${item.height}`;
        els.featureCount.textContent = state.method === "cnn" ? "learned maps" : String(state.features.length);
        els.vocabReadout.textContent = String(state.vocabSize);
        els.vectorDim.textContent = vectorDim();
        els.top1.textContent = top ? `${top.label} ${Math.round(top.score * 100)}%` : "--";
        els.activeMethod.textContent = methodLabel;
        els.stripMethod.textContent = methodLabel;
        els.stripFeature.textContent = state.method === "cnn" ? "Conv maps" : featureLabel;
        els.stripVector.textContent = vectorDim();
        els.stripPrediction.textContent = top?.label || "--";
        els.stripTopk.textContent = `Top-${state.topK}`;
        els.status.textContent = state.method === "cnn" ? "CNN CONCEPT VIEW" : "PRESET BOVW DATA";

        els.imageTitle.textContent = state.method === "cnn" ? "输入图像 + 卷积响应概念" : state.method === "pyramid" ? "原图 + 空间金字塔分块" : "原图 + 局部特征点";
        els.imageSubtitle.textContent = state.method === "cnn" ? "input image to feature maps" : state.method === "pyramid" ? "1×1 / 2×2 / 4×4 blocks" : "keypoints assigned to visual words";
        els.visualTitle.textContent = state.method === "cnn" ? "卷积特征图概念" : "视觉词典中心";
        els.visualSubtitle.textContent = state.method === "cnn" ? "learned filters and activation maps" : "K-means visual dictionary";
        els.flowFeature.textContent = state.method === "cnn" ? "Conv Feature Maps" : state.method === "pyramid" ? "Pyramid Histograms" : "Local Features";
        els.histTitle.textContent = state.method === "cnn" ? "全局特征向量" : state.method === "pyramid" ? "拼接后的图像表征向量" : "视觉单词直方图";
        els.histSubtitle.textContent = state.method === "cnn" ? "global average pooled feature" : state.method === "pyramid" ? "1 + 4 + 16 regional histograms" : "histogram encoding";
        els.boardTitle.textContent = state.method === "cnn" ? "Softmax Top-K 输出" : "Top-K 分类概率";
        els.boardSubtitle.textContent = state.method === "cnn" ? "end-to-end CNN classifier scores" : "linear classifier over BoVW feature";

        renderOverlay();
        renderDictionary();
        renderHistogram();
        renderPyramid(item);
        renderScores(scores);
        renderNotes(item, scores);
        els.cnnCompare.hidden = state.method !== "cnn";
        setPhase(state.method === "cnn" ? "classifier" : state.method === "pyramid" ? "histogram" : "dictionary");
    }

    async function init() {
        try {
            const response = await fetch(`${dataRoot}/classification_samples.json`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            state.data = await response.json();
            state.sampleId = state.data.defaultSample || state.data.samples?.[0]?.id || "";
            els.sample.innerHTML = (state.data.samples || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
            els.sample.value = state.sampleId;
            render();
        } catch (error) {
            console.error("classification lab data failed", error);
            els.notes.innerHTML = `<p class="method-error">分类演示数据加载失败，请检查 static/assets/vision_tasks/data/classification_samples.json。</p>`;
        }
    }

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        render();
    });
    els.methods.forEach((button) => {
        button.addEventListener("click", () => {
            state.method = button.dataset.clsMethod;
            els.methods.forEach((item) => item.classList.toggle("is-active", item === button));
            render();
        });
    });
    els.vocabSize.addEventListener("change", () => {
        state.vocabSize = Number(els.vocabSize.value);
        render();
    });
    els.featureType.addEventListener("change", () => {
        state.featureType = els.featureType.value;
        render();
    });
    els.topK.addEventListener("change", () => {
        state.topK = Number(els.topK.value);
        render();
    });
    els.image.addEventListener("error", () => root.classList.add("is-image-missing"));
    els.image.addEventListener("load", () => root.classList.remove("is-image-missing"));

    init();
})();
