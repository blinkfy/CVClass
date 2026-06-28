(function () {
    const root = document.querySelector("[data-generative-sam]");
    if (!root) return;

    const REAL_SOURCE = "onnx_decoder";
    const FALLBACK_SOURCE = "preset_polygon_fallback";

    const DEFAULT_DATA = {
        samples: [
            {
                id: "street_vehicle",
                title: "街道车辆",
                image: "/static/assets/generative_multimodal/sam/street_vehicle.svg",
                scene: "street",
                size: [640, 420],
                defaultObjectId: "car_1",
                objects: [{
                    id: "car_1",
                    label: "vehicle",
                    bbox: [174, 154, 540, 356],
                    positive_points: [[356, 260]],
                    negative_points: [[128, 232]],
                    candidates: [
                        { id: "mask_1", name: "完整车辆", score: 0.91, stability: 0.88, areaRatio: 0.184, contourLength: 418, polygon: [[188, 254], [214, 206], [250, 154], [426, 154], [504, 254], [540, 324], [514, 356], [190, 356]] },
                        { id: "mask_2", name: "车身局部", score: 0.82, stability: 0.76, areaRatio: 0.121, contourLength: 294, polygon: [[202, 254], [242, 214], [296, 194], [430, 202], [506, 260], [496, 324], [212, 322]] },
                        { id: "mask_3", name: "相邻区域", score: 0.63, stability: 0.66, areaRatio: 0.096, contourLength: 236, polygon: [[146, 214], [284, 198], [322, 264], [284, 330], [140, 314], [104, 252]] },
                    ],
                }],
            },
            {
                id: "desktop_objects",
                title: "桌面物体",
                image: "/static/assets/generative_multimodal/sam/desktop_objects.svg",
                scene: "desktop",
                size: [640, 420],
                defaultObjectId: "laptop_1",
                objects: [{
                    id: "laptop_1",
                    label: "laptop",
                    bbox: [184, 92, 470, 324],
                    positive_points: [[320, 186]],
                    negative_points: [[474, 246]],
                    candidates: [
                        { id: "mask_1", name: "笔记本电脑", score: 0.9, stability: 0.86, areaRatio: 0.169, contourLength: 386, polygon: [[198, 94], [458, 96], [466, 264], [438, 324], [220, 324], [184, 286]] },
                        { id: "mask_2", name: "屏幕区域", score: 0.84, stability: 0.79, areaRatio: 0.099, contourLength: 256, polygon: [[214, 112], [444, 112], [444, 248], [214, 248]] },
                        { id: "mask_3", name: "桌面邻近物体", score: 0.61, stability: 0.62, areaRatio: 0.082, contourLength: 228, polygon: [[424, 180], [544, 178], [588, 266], [558, 346], [430, 330]] },
                    ],
                }],
            },
            {
                id: "animal_subject",
                title: "动物主体",
                image: "/static/assets/generative_multimodal/sam/animal_subject.svg",
                scene: "animal",
                size: [640, 420],
                defaultObjectId: "animal_1",
                objects: [{
                    id: "animal_1",
                    label: "animal",
                    bbox: [172, 132, 528, 360],
                    positive_points: [[332, 238]],
                    negative_points: [[92, 304]],
                    candidates: [
                        { id: "mask_1", name: "完整动物", score: 0.89, stability: 0.84, areaRatio: 0.202, contourLength: 452, polygon: [[178, 220], [226, 154], [298, 132], [450, 156], [526, 220], [504, 304], [426, 340], [236, 354], [176, 292]] },
                        { id: "mask_2", name: "躯干主体", score: 0.81, stability: 0.73, areaRatio: 0.132, contourLength: 318, polygon: [[262, 178], [448, 160], [516, 230], [472, 306], [292, 318], [216, 248]] },
                        { id: "mask_3", name: "头部局部", score: 0.68, stability: 0.7, areaRatio: 0.074, contourLength: 210, polygon: [[184, 144], [280, 128], [334, 178], [318, 258], [214, 274], [164, 214]] },
                    ],
                }],
            },
        ],
    };

    const STEPS = [
        {
            id: "image",
            label: "图像 Image",
            short: "输入图像",
            note: "输入图像以 H×W×3 进入视觉编码器。",
            input: "Image ∈ R^(H×W×3)",
            compute: "读取 RGB 图像并保留空间坐标。",
            output: "原始图像张量与画布尺寸。",
            summary: "SAM 不直接从用户提示开始，而是先对整张图像建立视觉表征。",
            metrics: "H、W、通道数和当前样例尺寸。",
            formula: "X = Image[H, W, 3]",
        },
        {
            id: "image-encoder",
            label: "图像编码器",
            short: "视觉编码",
            note: "将原始图像编码为高维视觉特征。",
            input: "图像张量 Image tensor",
            compute: "Vision Transformer / image encoder 提取上下文特征。",
            output: "图像特征 Image Embedding",
            summary: "同一张图像的 embedding 可以被多个不同 prompt 复用。",
            metrics: "编码后 token 数、网格分辨率和特征复用。",
            formula: "E_img = ImageEncoder(X)",
        },
        {
            id: "image-embedding",
            label: "图像特征",
            short: "特征网格",
            note: "Embedding grid 保存局部区域与上下文信息。",
            input: "图像特征 Image Embedding",
            compute: "把图像压缩成可查询的特征地图。",
            output: "Embedding 网格",
            summary: "可以理解为图像被压缩成一张可查询的视觉特征地图。",
            metrics: "grid cell 激活、空间位置和上下文范围。",
            formula: "Grid = reshape(E_img)",
        },
        {
            id: "prompt-input",
            label: "提示输入",
            short: "点 / 框 / mask",
            note: "正点包含目标，负点排除区域，box 限定搜索范围。",
            input: "点 / 框 / Mask Prompt",
            compute: "收集用户交互坐标并保持原图坐标系。",
            output: "编码前的 Prompt tokens",
            summary: "点、框和粗略 mask 都是用户给模型的区域查询条件。",
            metrics: "正点数、负点数、box 面积和 prompt 类型。",
            formula: "P = {points, labels, boxes, mask_prior}",
        },
        {
            id: "prompt-encoder",
            label: "提示编码器",
            short: "提示编码",
            note: "把用户提示转换为模型可计算的 prompt embedding。",
            input: "Prompt 坐标 + 标签",
            compute: "Sparse embedding 编码点/框，dense embedding 编码 mask prior。",
            output: "提示特征 Prompt Embedding",
            summary: "Prompt Encoder 把用户的操作变成可与图像 embedding 对齐的查询向量。",
            metrics: "sparse token、dense prior 和提示标签。",
            formula: "E_prompt = PromptEncoder(P)",
        },
        {
            id: "mask-decoder",
            label: "Mask 解码器",
            short: "融合解码",
            note: "Image embedding 和 prompt embedding 汇入 decoder。",
            input: "图像特征 + Prompt 特征",
            compute: "Mask = Decoder(ImageEmbedding, PromptEmbedding)",
            output: "Mask logits + 质量分数",
            summary: "Decoder 根据提示在图像 embedding 中查询相关区域。",
            metrics: "logit 响应、score 预测和候选数量。",
            formula: "M = Decoder(E_img, E_prompt)",
        },
        {
            id: "candidate-masks",
            label: "候选 Masks",
            short: "候选分割",
            note: "同一个 prompt 可能对应局部、整体或相邻目标。",
            input: "Mask logits",
            compute: "生成多个候选 mask，并预测质量分数。",
            output: "3 个候选 masks + 预测 IoU",
            summary: "多候选结果用于表达提示歧义，用户可选择最符合意图的一项。",
            metrics: "IoU 预测分、稳定性、面积和轮廓长度。",
            formula: "{M1, M2, M3}, score = Rank(DecoderOutput)",
        },
        {
            id: "final-output",
            label: "最终输出",
            short: "结构化输出",
            note: "输出不是一张图片，而是 mask、bbox、score、area 等结构。",
            input: "选中的候选 mask",
            compute: "根据阈值、提示和候选选择得到最终 mask。",
            output: "mask + bbox + 分数 + 面积 + 轮廓长度 + 稳定性",
            summary: "最终结果是结构化分割输出，可继续进入测量、编辑或下游视觉任务。",
            metrics: "IoU、Mask 面积、轮廓长度、稳定性分数。",
            formula: "Output = {mask, bbox, score, area, contour, stability}",
        },
    ];

    const FLOW = [
        { id: "image", title: "图像 Image", detail: "H×W×3" },
        { id: "image-encoder", title: "图像编码器", detail: "视觉特征" },
        { id: "image-embedding", title: "Image Embedding", detail: "特征网格" },
        { id: "prompt-input", title: "提示输入", detail: "点 / 框 / mask" },
        { id: "prompt-encoder", title: "Prompt Encoder", detail: "提示特征" },
        { id: "mask-decoder", title: "Mask Decoder", detail: "区域查询" },
        { id: "candidate-masks", title: "候选 Masks", detail: "3 个 mask + 分数" },
        { id: "final-output", title: "最终输出", detail: "mask + bbox" },
    ];

    const MODES = {
        point: {
            label: "点提示 Point",
            promptType: "positive",
            tool: "positive",
            step: 3,
            caption: "一个正点可能产生多个候选 mask，当前候选由下方卡片选择。",
        },
        box: {
            label: "框提示 Box",
            promptType: "box",
            tool: "box",
            step: 3,
            caption: "box 限定目标搜索范围，通常会让候选 mask 更稳定。",
        },
        refine: {
            label: "多提示修正",
            promptType: "multi",
            tool: "negative",
            step: 5,
            caption: "正点扩展目标区域，负点排除误选区域，mask 会随提示收缩或偏移。",
        },
        output: {
            label: "Mask 输出结构",
            promptType: "mask",
            tool: "positive",
            step: 7,
            caption: "最终输出是结构化数据；加载 ONNX Decoder 后会显示真实 Decoder 结果，否则使用预设 fallback。",
        },
    };

    const el = {
        stage: root.querySelector("[data-sam-canvas]"),
        candidates: root.querySelector("[data-sam-candidates]"),
        flow: root.querySelector("[data-sam-flow]"),
        stageTitle: root.querySelector("[data-sam-stage-title]"),
        sample: root.querySelector('[data-sam-control="sample"]'),
        promptType: root.querySelector('[data-sam-control="promptType"]'),
        candidate: root.querySelector('[data-sam-control="candidate"]'),
        threshold: root.querySelector('[data-sam-control="threshold"]'),
        alpha: root.querySelector('[data-sam-control="alpha"]'),
        contour: root.querySelector('[data-sam-control="contour"]'),
        grid: root.querySelector('[data-sam-control="grid"]'),
        modeButtons: Array.from(root.querySelectorAll("[data-sam-mode]")),
        toolButtons: Array.from(root.querySelectorAll("[data-sam-tool]")),
        actions: Array.from(root.querySelectorAll("[data-sam-action]")),
        inferenceLoad: root.querySelector('[data-sam-inference="load"]'),
        inferenceRun: root.querySelector('[data-sam-inference="run"]'),
        inferenceStatus: root.querySelector("[data-sam-inference-status]"),
        inferenceBackend: root.querySelector("[data-sam-inference-backend]"),
        inferenceNote: root.querySelector("[data-sam-inference-note]"),
        operationHint: root.querySelector("[data-sam-operation-hint]"),
        status: {
            mode: root.querySelector('[data-sam-status="mode"]'),
            truth: root.querySelector('[data-sam-status="truth"]'),
            embedding: root.querySelector('[data-sam-status="embedding"]'),
        },
        value: {
            threshold: root.querySelector('[data-sam-value="threshold"]'),
            alpha: root.querySelector('[data-sam-value="alpha"]'),
        },
        chip: {
            sample: root.querySelector('[data-sam-chip="sample"]'),
            prompt: root.querySelector('[data-sam-chip="prompt"]'),
            candidate: root.querySelector('[data-sam-chip="candidate"]'),
        },
        summary: {
            sample: root.querySelector('[data-sam-summary="sample"]'),
            promptType: root.querySelector('[data-sam-summary="promptType"]'),
            promptCount: root.querySelector('[data-sam-summary="promptCount"]'),
            candidateCount: root.querySelector('[data-sam-summary="candidateCount"]'),
            candidate: root.querySelector('[data-sam-summary="candidate"]'),
            score: root.querySelector('[data-sam-summary="score"]'),
            stability: root.querySelector('[data-sam-summary="stability"]'),
            area: root.querySelector('[data-sam-summary="area"]'),
            contour: root.querySelector('[data-sam-summary="contour"]'),
        },
        note: {
            step: root.querySelector('[data-sam-note="step"]'),
            summary: root.querySelector('[data-sam-note="summary"]'),
            input: root.querySelector('[data-sam-note="input"]'),
            compute: root.querySelector('[data-sam-note="compute"]'),
            output: root.querySelector('[data-sam-note="output"]'),
            state: root.querySelector('[data-sam-note="state"]'),
            metrics: root.querySelector('[data-sam-note="metrics"]'),
            formula: root.querySelector('[data-sam-note="formula"]'),
        },
        outputJson: root.querySelector("[data-sam-output-json]"),
        runtime: root.querySelector("[data-sam-runtime]"),
    };

    const state = {
        data: null,
        dataSource: "loading",
        runtimeMessage: "正在加载预设样例。",
        sampleId: "",
        candidateIndex: 0,
        mode: "point",
        promptType: "positive",
        tool: "positive",
        threshold: 0.55,
        alpha: 0.48,
        showContour: true,
        showGrid: true,
        positivePoints: [],
        negativePoints: [],
        box: null,
        draftBox: null,
        dragStart: null,
        player: null,
        brokenImages: new Set(),
        manifest: null,
        inferenceClient: null,
        inferenceMode: "preset",
        inferenceStatus: "idle",
        inferenceMessage: "准备自动加载真实 Decoder；资源不可用时会回到预设 polygon fallback。",
        inferenceBackend: "--",
        autoLoadStarted: false,
        embeddingSampleId: "",
        realResult: null,
        maskBitmapCache: new WeakMap(),
        predictTimer: 0,
        predictToken: 0,
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round(value, digits) {
        const base = 10 ** digits;
        return Math.round(value * base) / base;
    }

    function samples() {
        return Array.isArray(state.data?.samples) && state.data.samples.length ? state.data.samples : DEFAULT_DATA.samples;
    }

    function currentSample() {
        return samples().find((sample) => sample.id === state.sampleId) || samples()[0];
    }

    function currentObject() {
        const sample = currentSample();
        const objects = Array.isArray(sample?.objects) ? sample.objects : [];
        return objects.find((item) => item.id === sample.defaultObjectId) || objects[0] || {};
    }

    function sampleSize() {
        const size = currentSample()?.size;
        return Array.isArray(size) && size.length === 2 ? size : [640, 420];
    }

    function validPolygon(polygon) {
        return Array.isArray(polygon) && polygon.length >= 3 && polygon.every((point) => (
            Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
        ));
    }

    function usingRealDecoder() {
        return state.inferenceMode === "real_decoder"
            && state.realResult?.source === REAL_SOURCE
            && state.realResult.sampleId === state.sampleId
            && Array.isArray(state.realResult.candidates)
            && state.realResult.candidates.length > 0;
    }

    function realCandidates() {
        if (!usingRealDecoder()) return [];
        return state.realResult.candidates.filter((candidate) => candidate?.source === REAL_SOURCE);
    }

    function candidates() {
        const modelCandidates = realCandidates();
        if (modelCandidates.length) return modelCandidates;

        const raw = Array.isArray(currentObject()?.candidates) ? currentObject().candidates : [];
        const valid = raw.filter((candidate) => validPolygon(candidate.polygon));
        if (valid.length !== raw.length) {
            state.runtimeMessage = "部分 candidate polygon 数据异常，已隐藏异常 mask。";
        }
        return valid.length ? valid : [{
            id: "fallback_mask",
            name: "fallback mask",
            score: 0.5,
            stability: 0.5,
            areaRatio: 0.08,
            contourLength: 160,
            polygon: [[220, 160], [420, 170], [394, 300], [230, 292]],
        }];
    }

    function currentCandidate() {
        const list = candidates();
        state.candidateIndex = clamp(state.candidateIndex, 0, list.length - 1);
        return list[state.candidateIndex];
    }

    function clonePoints(points) {
        return (Array.isArray(points) ? points : []).map((point) => [Number(point[0]) || 0, Number(point[1]) || 0]);
    }

    function formatPoints(points) {
        return points.map((point) => `${round(point[0], 1)},${round(point[1], 1)}`).join(" ");
    }

    function averagePoint(points) {
        if (!points.length) return null;
        const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
        return [sum[0] / points.length, sum[1] / points.length];
    }

    function polygonCentroid(points) {
        return averagePoint(points) || [sampleSize()[0] / 2, sampleSize()[1] / 2];
    }

    function polygonArea(points) {
        if (!points.length) return 0;
        let area = 0;
        points.forEach((point, index) => {
            const next = points[(index + 1) % points.length];
            area += point[0] * next[1] - next[0] * point[1];
        });
        return Math.abs(area) / 2;
    }

    function polygonPerimeter(points) {
        if (!points.length) return 0;
        return points.reduce((total, point, index) => {
            const next = points[(index + 1) % points.length];
            return total + Math.hypot(next[0] - point[0], next[1] - point[1]);
        }, 0);
    }

    function bboxFromPolygon(points) {
        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);
        return [
            Math.round(Math.min(...xs)),
            Math.round(Math.min(...ys)),
            Math.round(Math.max(...xs)),
            Math.round(Math.max(...ys)),
        ];
    }

    function normalizeBox(box) {
        if (!Array.isArray(box) || box.length !== 4) return null;
        const [x1, y1, x2, y2] = box.map((value) => Number(value) || 0);
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        if (right - left < 8 || bottom - top < 8) return null;
        return [left, top, right, bottom];
    }

    function adjustedPolygon(candidate) {
        const [width, height] = sampleSize();
        const base = clonePoints(candidate?.polygon);
        const center = polygonCentroid(base);
        const positiveCenter = averagePoint(state.positivePoints);
        let polygon = base;

        if (positiveCenter) {
            const dx = (positiveCenter[0] - center[0]) * 0.12;
            const dy = (positiveCenter[1] - center[1]) * 0.12;
            polygon = polygon.map((point) => [point[0] + dx, point[1] + dy]);
        }

        const workingCenter = polygonCentroid(polygon);
        const thresholdScale = 1 + (0.55 - state.threshold) * 0.32;
        const promptScale = 1 + Math.min(state.positivePoints.length, 4) * 0.014 - Math.min(state.negativePoints.length, 4) * 0.04 + (state.box ? 0.025 : 0);
        const scale = clamp(thresholdScale * promptScale, 0.72, 1.2);
        polygon = polygon.map((point) => [
            workingCenter[0] + (point[0] - workingCenter[0]) * scale,
            workingCenter[1] + (point[1] - workingCenter[1]) * scale,
        ]);

        if (state.box) {
            const box = normalizeBox(state.box);
            if (box) {
                const boxCenter = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
                polygon = polygon.map((point) => [
                    clamp(point[0] * 0.88 + boxCenter[0] * 0.12, box[0] + 4, box[2] - 4),
                    clamp(point[1] * 0.88 + boxCenter[1] * 0.12, box[1] + 4, box[3] - 4),
                ]);
            }
        }

        return polygon.map((point) => [
            clamp(point[0], 0, width),
            clamp(point[1], 0, height),
        ]);
    }

    function outputMetrics(candidate) {
        const [width, height] = sampleSize();
        if (candidate?.source === REAL_SOURCE) {
            const areaRatio = Number(candidate.areaRatio || 0);
            const polygon = validPolygon(candidate.polygon) ? clonePoints(candidate.polygon) : polygonFromBbox(candidate.bbox);
            return {
                polygon,
                bbox: normalizeBox(candidate.bbox) || bboxFromPolygon(polygon),
                score: round(Number(candidate.score || 0), 3),
                stability: round(Number(candidate.stability || 0), 3),
                areaRatio: round(areaRatio, 3),
                areaText: `${round(areaRatio * 100, 1)}%`,
                contourLength: Math.round(Number(candidate.contourLength || 0)),
                area: Math.round(Number(candidate.area || areaRatio * width * height)),
                source: REAL_SOURCE,
            };
        }
        const polygon = adjustedPolygon(candidate);
        const area = polygonArea(polygon);
        const contourLength = polygonPerimeter(polygon);
        const thresholdPenalty = Math.abs(state.threshold - 0.55) * 0.08;
        const score = clamp(Number(candidate.score || 0.5) + (state.box ? 0.025 : 0) + state.positivePoints.length * 0.006 - state.negativePoints.length * 0.004 - thresholdPenalty, 0.05, 0.99);
        const stability = clamp(Number(candidate.stability || 0.5) + (state.box ? 0.03 : 0) + state.negativePoints.length * 0.01 - Math.abs(state.threshold - 0.62) * 0.05, 0.05, 0.99);
        return {
            polygon,
            bbox: bboxFromPolygon(polygon),
            score: round(score, 2),
            stability: round(stability, 2),
            areaRatio: round(area / Math.max(width * height, 1), 3),
            areaText: `${round((area / Math.max(width * height, 1)) * 100, 1)}%`,
            contourLength: Math.round(contourLength),
            area: Math.round(area),
            source: FALLBACK_SOURCE,
        };
    }

    function polygonFromBbox(box) {
        const normalized = normalizeBox(box);
        if (!normalized) return [[0, 0], [0, 0], [0, 0]];
        const [x1, y1, x2, y2] = normalized;
        return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }

    function currentOutput() {
        const candidate = currentCandidate();
        const metrics = outputMetrics(candidate);
        const [width, height] = sampleSize();
        return {
            source: metrics.source,
            mask: metrics.source === REAL_SOURCE
                ? `${width}×${height} 二值图（ONNX Decoder 输出）`
                : `${width}×${height} 二值图（预设 polygon mask）`,
            bbox: metrics.bbox,
            score: metrics.score,
            stability: metrics.stability,
            area: metrics.area,
            areaRatio: metrics.areaText,
            contourLength: metrics.contourLength,
            candidate: candidate.name || candidate.id,
        };
    }

    function promptLabel() {
        return {
            positive: "正点 Positive Point",
            negative: "负点 Negative Point",
            box: "框提示 Box Prompt",
            multi: "多点提示 Multi-point",
            mask: "Mask 提示",
        }[state.promptType] || "Prompt";
    }

    function toolHint() {
        return {
            positive: "点击主图添加正点；右键可临时添加负点。",
            negative: "点击主图添加负点，观察 mask 修正。",
            box: "在主图中按下并拖拽绘制 Box prompt。",
            mask: "当前使用预设 polygon 作为 mask prior 演示。",
        }[state.tool] || "点击主图添加提示。";
    }

    function resolveAssetPath(path) {
        if (!path) return "";
        if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
        const basePath = window.CVCLASS_BASE_PATH || "";
        if (path.startsWith("/")) return `${basePath}${path}`;
        return `${basePath}/static/${path.replace(/^static\//, "")}`;
    }

    function gridMarkup(width, height) {
        if (!state.showGrid) return "";
        const lines = [];
        const cols = 10;
        const rows = 7;
        for (let index = 1; index < cols; index += 1) {
            const x = (width / cols) * index;
            lines.push(`<line class="sam-grid-line" x1="${x}" y1="0" x2="${x}" y2="${height}"></line>`);
        }
        for (let index = 1; index < rows; index += 1) {
            const y = (height / rows) * index;
            lines.push(`<line class="sam-grid-line" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`);
        }
        return lines.join("");
    }

    function pointMarkup(point, type, index) {
        const classSuffix = type === "negative" ? "negative" : "positive";
        const linkTarget = type === "negative" ? [34, 46 + index * 10] : [606, 46 + index * 10];
        return `
            <line class="sam-prompt-link" x1="${point[0]}" y1="${point[1]}" x2="${linkTarget[0]}" y2="${linkTarget[1]}"></line>
            <circle class="sam-point-ring sam-point-ring-${classSuffix}" cx="${point[0]}" cy="${point[1]}" r="18"></circle>
            <circle class="sam-point sam-point-${classSuffix}" cx="${point[0]}" cy="${point[1]}" r="8"></circle>
        `;
    }

    function boxMarkup(box, className) {
        const normalized = normalizeBox(box);
        if (!normalized) return "";
        const [x1, y1, x2, y2] = normalized;
        const handles = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
            .map((point) => `<circle class="sam-box-handle" cx="${point[0]}" cy="${point[1]}" r="5"></circle>`)
            .join("");
        return `
            <rect class="${className}" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"></rect>
            ${className === "sam-box" ? handles : ""}
        `;
    }

    function fallbackMarkup(sample) {
        return `
            <div class="sam-fallback-art" data-scene="${escapeHtml(sample.scene || "desktop")}">
                <span class="sam-fallback-ground"></span>
                <span class="sam-fallback-object"></span>
            </div>
        `;
    }

    function maskBitmapHref(candidate) {
        const mask = candidate?.mask;
        if (!mask?.data || !mask.width || !mask.height || typeof document === "undefined") return "";
        const cached = state.maskBitmapCache.get(candidate);
        if (cached) return cached;
        const canvas = document.createElement("canvas");
        canvas.width = mask.width;
        canvas.height = mask.height;
        const context = canvas.getContext("2d");
        if (!context) return "";
        const image = context.createImageData(mask.width, mask.height);
        for (let index = 0; index < mask.data.length; index += 1) {
            const offset = index * 4;
            const active = mask.data[index] ? 1 : 0;
            image.data[offset] = 8;
            image.data[offset + 1] = 145;
            image.data[offset + 2] = 178;
            image.data[offset + 3] = active ? 255 : 0;
        }
        context.putImageData(image, 0, 0);
        const href = canvas.toDataURL("image/png");
        state.maskBitmapCache.set(candidate, href);
        return href;
    }

    function maskOverlayMarkup(candidate, metrics) {
        const href = maskBitmapHref(candidate);
        if (href) {
            const [width, height] = sampleSize();
            return `<image class="sam-mask-overlay sam-mask-bitmap sam-mask" href="${href}" x="0" y="0" width="${width}" height="${height}" style="opacity:${state.alpha}"></image>`;
        }
        return `<polygon class="sam-mask-overlay sam-mask" points="${formatPoints(metrics.polygon)}" style="opacity:${state.alpha}"></polygon>`;
    }

    function maskThumbMarkup(candidate, metrics) {
        const href = maskBitmapHref(candidate);
        if (href) {
            return `<image href="${href}" x="0" y="0" width="640" height="420" opacity=".72"></image>
                <polygon points="${formatPoints(metrics.polygon)}" fill="none" stroke="#38bdf8" stroke-width="12"></polygon>`;
        }
        const points = candidate?.source === REAL_SOURCE ? metrics.polygon : adjustedPolygon(candidate);
        return `<polygon points="${formatPoints(points)}" fill="#0891b2" opacity=".45"></polygon>
            <polygon points="${formatPoints(points)}" fill="none" stroke="#38bdf8" stroke-width="12"></polygon>`;
    }

    function renderStage() {
        if (!el.stage) return;
        if (!state.data) {
            el.stage.innerHTML = '<div class="sam-stage-loading">正在加载 SAM 教学样例...</div>';
            return;
        }

        const sample = currentSample();
        const candidate = currentCandidate();
        const metrics = outputMetrics(candidate);
        const [width, height] = sampleSize();
        const imagePath = resolveAssetPath(usingRealDecoder() ? (sampleRealConfig(sample).image || sample.image) : sample.image);
        const imageBroken = state.brokenImages.has(imagePath);
        const points = [
            ...state.positivePoints.map((point) => ({ point, type: "positive" })),
            ...state.negativePoints.map((point) => ({ point, type: "negative" })),
        ];
        const negativeRefinement = state.negativePoints.map((point, index) => (
            `<circle class="sam-negative-refine" cx="${point[0]}" cy="${point[1]}" r="${26 + index * 3}"></circle>`
        )).join("");
        const contour = state.showContour ? `<polygon class="sam-mask-contour" points="${formatPoints(metrics.polygon)}"></polygon>` : "";
        const mask = maskOverlayMarkup(candidate, metrics);
        const pointSvg = points.map((item, index) => pointMarkup(item.point, item.type, index)).join("");
        const stageBadge = usingRealDecoder()
            ? "真实推理 · ONNX Mask Decoder"
            : "预设样例 · polygon mask 回退";

        el.stage.innerHTML = `
            <div class="sam-stage-frame" style="--sam-w:${width};--sam-h:${height}">
                ${imageBroken ? fallbackMarkup(sample) : `<img class="sam-stage-image" src="${escapeHtml(imagePath)}" alt="${escapeHtml(sample.title || "SAM 样例图")}" draggable="false">`}
                <svg class="sam-stage-svg" viewBox="0 0 ${width} ${height}" role="presentation" aria-hidden="true">
                    <g class="sam-embedding-grid">${gridMarkup(width, height)}</g>
                    <g class="sam-mask-layer">${mask}${contour}${negativeRefinement}</g>
                    <g class="sam-box-layer">${boxMarkup(state.box, "sam-box")}${boxMarkup(state.draftBox, "sam-draft-box")}</g>
                    <g class="sam-point-layer">${pointSvg}</g>
                </svg>
                <span class="sam-stage-badge">${stageBadge}</span>
                <p class="sam-stage-caption">${escapeHtml(MODES[state.mode]?.caption || STEPS[state.player?.index || 0]?.summary || "")}</p>
            </div>
        `;

        const image = el.stage.querySelector(".sam-stage-image");
        if (image) {
            image.addEventListener("error", () => {
                state.brokenImages.add(imagePath);
                state.runtimeMessage = "图片资源加载失败，已切换到内置 fallback 图。";
                renderAll();
            }, { once: true });
        }
    }

    function renderCandidates() {
        if (!el.candidates) return;
        const list = candidates();
        const bestScore = Math.max(...list.map((item) => Number(item.score) || 0));
        el.candidates.innerHTML = list.map((candidate, index) => {
            const metrics = outputMetrics(candidate);
            const active = index === state.candidateIndex;
            const best = Number(candidate.score) === bestScore;
            const low = Number(candidate.score) < bestScore - 0.18;
            return `
                <button
                    type="button"
                    class="sam-mask-card ${active ? "is-active" : ""} ${best ? "is-best" : ""} ${low ? "is-low-score" : ""} ${candidate.source === REAL_SOURCE ? "is-real" : ""}"
                    data-sam-candidate-index="${index}"
                    aria-pressed="${active ? "true" : "false"}"
                >
                    <svg class="sam-mask-thumb" viewBox="0 0 640 420" aria-hidden="true" focusable="false">
                        <rect width="640" height="420" fill="#f8fbff"></rect>
                        ${maskThumbMarkup(candidate, metrics)}
                    </svg>
                    <span>
                        <strong>${escapeHtml(candidate.name || `Mask ${index + 1}`)}</strong>
                        <span>IoU ${metrics.score} · 稳定性 ${metrics.stability}</span>
                        <span>面积 ${metrics.areaText} · 轮廓 ${metrics.contourLength}</span>
                    </span>
                </button>
            `;
        }).join("");
    }

    function renderFlow() {
        if (!el.flow) return;
        const activeIndex = state.player?.index || 0;
        el.flow.innerHTML = FLOW.map((item, index) => `
            <article class="sam-flow-card ${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-complete" : ""}" data-flow-step="${escapeHtml(item.id)}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.detail)}</small>
            </article>
        `).join("");
    }

    function sampleRealConfig(sample = currentSample()) {
        const config = sample?.realInference || {};
        const manifestSample = sample?.id ? state.manifest?.samples?.[sample.id] || {} : {};
        return {
            image: sample?.realImage || config.image || manifestSample.image || sample?.image || "",
            embedding: sample?.embedding || config.embedding || manifestSample.embedding || "",
            embeddingShape: sample?.embeddingShape || config.embeddingShape || manifestSample.embeddingShape || state.manifest?.embeddingShape || [1, 256, 64, 64],
            embeddingDtype: sample?.embeddingDtype || config.embeddingDtype || manifestSample.embeddingDtype || state.manifest?.embeddingDtype || "float16",
            ready: Boolean(sample?.realInferenceReady || config.ready || manifestSample.embeddingAvailable),
        };
    }

    function renderControls() {
        const sampleList = samples();
        if (el.sample) {
            el.sample.innerHTML = sampleList.map((sample) => (
                `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.title || sample.id)}</option>`
            )).join("");
            el.sample.value = currentSample()?.id || sampleList[0]?.id || "";
        }

        const list = candidates();
        if (el.candidate) {
            el.candidate.innerHTML = list.map((candidate, index) => (
                `<option value="${index}">Mask ${index + 1} · ${escapeHtml(candidate.name || candidate.id)}</option>`
            )).join("");
            el.candidate.value = String(state.candidateIndex);
        }

        if (el.promptType) el.promptType.value = state.promptType;
        if (el.threshold) el.threshold.value = String(state.threshold);
        if (el.alpha) el.alpha.value = String(state.alpha);
        if (el.contour) el.contour.checked = state.showContour;
        if (el.grid) el.grid.checked = state.showGrid;
        if (el.value.threshold) el.value.threshold.textContent = state.threshold.toFixed(2);
        if (el.value.alpha) el.value.alpha.textContent = state.alpha.toFixed(2);
        if (el.operationHint) el.operationHint.textContent = toolHint();

        el.modeButtons.forEach((button) => {
            const active = button.dataset.samMode === state.mode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
        });
        el.toolButtons.forEach((button) => {
            const active = button.dataset.samTool === state.tool;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", active ? "true" : "false");
        });

        const decoderLoaded = ["ready", "running"].includes(state.inferenceStatus);
        if (el.inferenceLoad) {
            el.inferenceLoad.disabled = ["loading", "running"].includes(state.inferenceStatus);
            el.inferenceLoad.textContent = state.inferenceStatus === "loading"
                ? "正在加载 Decoder"
                : state.inferenceStatus === "running"
                    ? "推理中"
                    : decoderLoaded
                        ? "重新加载 Decoder"
                        : "加载真实 Decoder";
        }
        if (el.inferenceRun) {
            el.inferenceRun.disabled = !decoderLoaded || !sampleRealConfig().ready || state.inferenceStatus === "running";
        }
        if (el.inferenceStatus) el.inferenceStatus.textContent = state.inferenceMessage;
        if (el.inferenceBackend) el.inferenceBackend.textContent = `Backend: ${state.inferenceBackend || "--"}`;
        if (el.inferenceNote) {
            el.inferenceNote.textContent = usingRealDecoder()
                ? "当前结果来自 ONNX Runtime Web 的真实 Mask Decoder；Image Encoder 未在浏览器实时运行，embedding 为离线预计算。"
                : "当前页面默认使用预设 polygon mask；加载 ONNX Decoder 且存在离线 embedding 后，才运行真实 Mask Decoder。";
        }
        if (el.status.mode) {
            el.status.mode.textContent = usingRealDecoder()
                ? "真实推理 · ONNX Mask Decoder"
                : "预设样例 · Prompt Mask 演示";
        }
        if (el.status.truth) {
            el.status.truth.textContent = usingRealDecoder()
                ? "真实推理 · ONNX Runtime Web"
                : "非真实推理 · 教学动画";
            el.status.truth.classList.toggle("sam-status-real", usingRealDecoder());
            el.status.truth.classList.toggle("sam-status-honest", !usingRealDecoder());
        }
        if (el.status.embedding) {
            const realConfig = sampleRealConfig();
            el.status.embedding.textContent = usingRealDecoder()
                ? "Image Embedding · 离线预计算"
                : (realConfig.ready ? "Image Embedding · 可加载离线资源" : "Image Embedding · 资源缺失 fallback");
        }
    }

    function renderNotesAndSummary() {
        const sample = currentSample();
        const candidate = currentCandidate();
        const metrics = outputMetrics(candidate);
        const step = state.player?.current ? state.player.current() : STEPS[0];
        const promptCount = state.positivePoints.length + state.negativePoints.length + (state.box ? 1 : 0);
        const sourceLabel = usingRealDecoder() ? "ONNX Decoder" : "预设 fallback";
        const currentState = `${MODES[state.mode]?.label || "模式"} · ${promptCount} 个提示 · 阈值 ${state.threshold.toFixed(2)} · ${sourceLabel}`;

        if (el.stageTitle) el.stageTitle.textContent = `${step.label} · ${promptLabel()} → ${candidate.name || candidate.id}`;
        if (el.chip.sample) el.chip.sample.textContent = sample?.title || "--";
        if (el.chip.prompt) el.chip.prompt.textContent = promptLabel();
        if (el.chip.candidate) el.chip.candidate.textContent = candidate.name || `Mask ${state.candidateIndex + 1}`;

        if (el.summary.sample) el.summary.sample.textContent = sample?.title || "--";
        if (el.summary.promptType) el.summary.promptType.textContent = promptLabel();
        if (el.summary.promptCount) el.summary.promptCount.textContent = String(promptCount);
        if (el.summary.candidateCount) el.summary.candidateCount.textContent = String(candidates().length);
        if (el.summary.candidate) el.summary.candidate.textContent = candidate.name || `Mask ${state.candidateIndex + 1}`;
        if (el.summary.score) el.summary.score.textContent = metrics.score.toFixed(2);
        if (el.summary.stability) el.summary.stability.textContent = metrics.stability.toFixed(2);
        if (el.summary.area) el.summary.area.textContent = metrics.areaText;
        if (el.summary.contour) el.summary.contour.textContent = String(metrics.contourLength);

        if (el.note.step) el.note.step.textContent = step.label || "";
        if (el.note.summary) el.note.summary.textContent = step.summary || "";
        if (el.note.input) el.note.input.textContent = step.input || "";
        if (el.note.compute) el.note.compute.textContent = step.compute || "";
        if (el.note.output) el.note.output.textContent = step.output || "";
        if (el.note.state) el.note.state.textContent = currentState;
        if (el.note.metrics) el.note.metrics.textContent = step.metrics || "";
        if (el.note.formula) el.note.formula.textContent = step.formula || "";
        if (el.outputJson) el.outputJson.textContent = JSON.stringify(currentOutput(), null, 2);
        if (el.runtime) el.runtime.textContent = state.runtimeMessage;
    }

    function renderAll() {
        renderControls();
        renderStage();
        renderCandidates();
        renderFlow();
        renderNotesAndSummary();
    }

    function clearRealResult() {
        state.realResult = null;
        state.maskBitmapCache = new WeakMap();
        state.embeddingSampleId = "";
    }

    function shortError(error) {
        const message = String(error?.message || error || "未知错误").replace(/\s+/g, " ").trim();
        return message.length > 120 ? `${message.slice(0, 117)}...` : message;
    }

    function setInferenceFallback(message, keepSession = false) {
        state.inferenceMode = "preset";
        state.inferenceStatus = keepSession ? "ready" : "error";
        state.inferenceMessage = message;
        state.runtimeMessage = message;
        state.realResult = null;
        state.maskBitmapCache = new WeakMap();
        state.embeddingSampleId = "";
    }

    function handleWorkerStatus(payload = {}) {
        if (payload.message) {
            state.inferenceMessage = payload.message;
            state.runtimeMessage = payload.message;
        }
        if (payload.backend) state.inferenceBackend = payload.backend;
        renderControls();
        renderNotesAndSummary();
    }

    async function ensureManifest() {
        if (state.manifest) return state.manifest;
        const manifestUrl = root.dataset.modelManifestUrl;
        if (!manifestUrl) throw new Error("SAM manifest URL 未配置");
        const data = await fetchJson(manifestUrl);
        state.manifest = data;
        return data;
    }

    function ensureInferenceClient() {
        if (state.inferenceClient) return state.inferenceClient;
        if (typeof window.createSamInferenceClient !== "function") {
            throw new Error("SAM 推理客户端未加载");
        }
        state.inferenceClient = window.createSamInferenceClient({
            workerUrl: root.dataset.workerUrl || "/static/js/generative_multimodal_sam_worker.js",
            onStatus: handleWorkerStatus,
        });
        return state.inferenceClient;
    }

    async function loadCurrentEmbedding() {
        const sample = currentSample();
        const realConfig = sampleRealConfig(sample);
        if (!realConfig.ready || !realConfig.embedding) {
            setInferenceFallback("当前样例缺少离线 Image Embedding，已回到预设 polygon fallback。", true);
            return false;
        }
        const client = ensureInferenceClient();
        const info = await client.setImageEmbedding({
            sampleId: sample.id,
            embeddingUrl: realConfig.embedding,
            shape: realConfig.embeddingShape,
            dtype: realConfig.embeddingDtype,
            imageSize: sampleSize(),
            embeddingAvailable: realConfig.ready,
        });
        state.embeddingSampleId = info?.sampleId || sample.id;
        return true;
    }

    async function runRealPrediction() {
        if (!state.inferenceClient || !["ready", "running"].includes(state.inferenceStatus)) return;
        const token = ++state.predictToken;
        state.inferenceStatus = "running";
        state.inferenceMode = "real_decoder";
        state.inferenceMessage = "SAM Decoder 正在根据当前 Prompt 推理。";
        renderControls();
        try {
            if (state.embeddingSampleId !== state.sampleId) {
                const embeddingReady = await loadCurrentEmbedding();
                if (!embeddingReady) {
                    state.inferenceStatus = "ready";
                    renderAll();
                    return;
                }
            }
            const result = await state.inferenceClient.predict({
                sampleId: state.sampleId,
                imageSize: sampleSize(),
                positivePoints: clonePoints(state.positivePoints),
                negativePoints: clonePoints(state.negativePoints),
                box: normalizeBox(state.box),
                threshold: state.threshold,
            });
            if (token !== state.predictToken) return;
            state.realResult = result;
            state.maskBitmapCache = new WeakMap();
            state.inferenceMode = "real_decoder";
            state.inferenceStatus = "ready";
            state.inferenceBackend = result?.meta?.backend || state.inferenceBackend;
            state.candidateIndex = clamp(state.candidateIndex, 0, Math.max((result?.candidates?.length || 1) - 1, 0));
            state.runtimeMessage = `真实推理完成：ONNX Mask Decoder · ${result?.meta?.inferenceTime ?? "--"}ms；Image Embedding 为离线预计算。`;
            state.inferenceMessage = state.runtimeMessage;
            renderAll();
        } catch (error) {
            if (token !== state.predictToken) return;
            setInferenceFallback(`真实 Decoder 推理不可用：${shortError(error)}。已回到预设 polygon fallback。`, Boolean(state.inferenceClient));
            renderAll();
        }
    }

    function scheduleRealPrediction(delay = 180) {
        if (!state.inferenceClient || !["ready", "running"].includes(state.inferenceStatus)) return;
        window.clearTimeout(state.predictTimer);
        state.predictTimer = window.setTimeout(runRealPrediction, delay);
    }

    async function loadRealDecoder() {
        if (["loading", "running"].includes(state.inferenceStatus)) return;
        clearRealResult();
        state.inferenceMode = "preset";
        state.inferenceStatus = "loading";
        state.inferenceMessage = "正在读取 SAM manifest 与 ONNX Decoder。";
        state.runtimeMessage = state.inferenceMessage;
        renderAll();
        try {
            await ensureManifest();
            const client = ensureInferenceClient();
            const info = await client.load({
                manifestUrl: root.dataset.modelManifestUrl,
                backend: state.manifest?.defaultBackend || "wasm",
            });
            state.inferenceStatus = "ready";
            state.inferenceBackend = info?.backend || "wasm";
            state.inferenceMessage = "SAM ONNX Decoder 已加载；正在准备当前样例 embedding。";
            state.runtimeMessage = state.inferenceMessage;
            await runRealPrediction();
        } catch (error) {
            setInferenceFallback(`真实 Decoder 资源不可用：${shortError(error)}。当前继续使用预设 polygon fallback。`);
            renderAll();
        }
    }

    function maybeAutoLoadDecoder() {
        if (state.autoLoadStarted) return;
        state.autoLoadStarted = true;
        window.setTimeout(() => {
            loadRealDecoder();
        }, 250);
    }

    function loadPresetPrompt(mode) {
        const object = currentObject();
        state.positivePoints = clonePoints(object.positive_points);
        state.negativePoints = mode === "point" || mode === "box" ? [] : clonePoints(object.negative_points);
        state.box = mode === "point" ? null : normalizeBox(object.bbox);
        state.draftBox = null;
        state.dragStart = null;
    }

    function switchMode(mode) {
        if (!MODES[mode]) return;
        state.mode = mode;
        state.promptType = MODES[mode].promptType;
        state.tool = MODES[mode].tool;
        loadPresetPrompt(mode);
        state.player?.setStep?.(MODES[mode].step);
        renderAll();
        scheduleRealPrediction(0);
    }

    function setTool(tool) {
        state.tool = tool;
        if (tool === "positive") state.promptType = "positive";
        if (tool === "negative") state.promptType = "negative";
        if (tool === "box") state.promptType = "box";
        if (tool === "mask") state.promptType = "mask";
        renderAll();
    }

    function canvasPoint(event) {
        const svg = el.stage?.querySelector(".sam-stage-svg");
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const [width, height] = sampleSize();
        return [
            clamp(((event.clientX - rect.left) / rect.width) * width, 0, width),
            clamp(((event.clientY - rect.top) / rect.height) * height, 0, height),
        ];
    }

    function triggerRefinement() {
        root.classList.add("is-refining");
        window.setTimeout(() => root.classList.remove("is-refining"), 760);
    }

    function triggerThresholdSweep() {
        el.stage?.classList.add("is-thresholding");
        window.setTimeout(() => el.stage?.classList.remove("is-thresholding"), 460);
    }

    function handlePointerDown(event) {
        const point = canvasPoint(event);
        if (!point) return;
        if (state.tool === "box") {
            event.preventDefault();
            state.dragStart = point;
            state.draftBox = [point[0], point[1], point[0], point[1]];
            el.stage?.setPointerCapture?.(event.pointerId);
            renderAll();
            return;
        }

        event.preventDefault();
        const addNegative = event.button === 2 || event.ctrlKey || state.tool === "negative" || state.promptType === "negative";
        if (addNegative) {
            state.negativePoints = [...state.negativePoints, point];
            state.promptType = state.promptType === "multi" ? "multi" : "negative";
            triggerRefinement();
        } else {
            state.positivePoints = [...state.positivePoints, point];
            state.promptType = state.promptType === "multi" ? "multi" : "positive";
        }
        state.player?.setStep?.(3);
        renderAll();
        scheduleRealPrediction(120);
    }

    function handlePointerMove(event) {
        if (!state.dragStart) return;
        const point = canvasPoint(event);
        if (!point) return;
        state.draftBox = [state.dragStart[0], state.dragStart[1], point[0], point[1]];
        renderAll();
    }

    function handlePointerUp(event) {
        if (!state.dragStart) return;
        const point = canvasPoint(event);
        if (point) {
            const nextBox = normalizeBox([state.dragStart[0], state.dragStart[1], point[0], point[1]]);
            if (nextBox) state.box = nextBox;
        }
        state.dragStart = null;
        state.draftBox = null;
        state.promptType = "box";
        state.tool = "box";
        state.player?.setStep?.(3);
        renderAll();
        scheduleRealPrediction(120);
    }

    function bindEvents() {
        el.sample?.addEventListener("change", () => {
            state.sampleId = el.sample.value;
            state.candidateIndex = 0;
            clearRealResult();
            loadPresetPrompt(state.mode);
            state.runtimeMessage = state.dataSource === "fallback"
                ? "JSON 加载失败，当前使用 JS 内置默认数据。"
                : (state.inferenceClient ? "已切换样例；正在检查离线 embedding。" : "已加载预设样例；当前使用 polygon fallback。");
            renderAll();
            scheduleRealPrediction(0);
        });

        el.promptType?.addEventListener("change", () => {
            state.promptType = el.promptType.value || "positive";
            if (state.promptType === "positive") state.tool = "positive";
            if (state.promptType === "negative") state.tool = "negative";
            if (state.promptType === "box") state.tool = "box";
            if (state.promptType === "mask") state.tool = "mask";
            renderAll();
        });

        el.candidate?.addEventListener("change", () => {
            state.candidateIndex = Number(el.candidate.value) || 0;
            state.player?.setStep?.(6);
            renderAll();
        });

        el.threshold?.addEventListener("input", () => {
            state.threshold = Number(el.threshold.value) || 0.55;
            triggerThresholdSweep();
            renderAll();
            scheduleRealPrediction(220);
        });

        el.alpha?.addEventListener("input", () => {
            state.alpha = Number(el.alpha.value) || 0.48;
            renderAll();
        });

        el.contour?.addEventListener("change", () => {
            state.showContour = Boolean(el.contour.checked);
            renderAll();
        });

        el.grid?.addEventListener("change", () => {
            state.showGrid = Boolean(el.grid.checked);
            renderAll();
        });

        el.modeButtons.forEach((button) => {
            button.addEventListener("click", () => switchMode(button.dataset.samMode));
        });

        el.toolButtons.forEach((button) => {
            button.addEventListener("click", () => setTool(button.dataset.samTool));
        });

        el.actions.forEach((button) => {
            button.addEventListener("click", () => {
                const action = button.dataset.samAction;
                if (action === "preset") loadPresetPrompt("refine");
                if (action === "box") state.box = normalizeBox(currentObject().bbox);
                if (action === "clear") {
                    state.positivePoints = [];
                    state.negativePoints = [];
                    state.box = null;
                }
                renderAll();
                scheduleRealPrediction(0);
            });
        });

        el.inferenceLoad?.addEventListener("click", () => {
            loadRealDecoder();
        });

        el.inferenceRun?.addEventListener("click", () => {
            runRealPrediction();
        });

        el.candidates?.addEventListener("click", (event) => {
            const card = event.target.closest("[data-sam-candidate-index]");
            if (!card) return;
            state.candidateIndex = Number(card.dataset.samCandidateIndex) || 0;
            state.player?.setStep?.(6);
            renderAll();
        });

        el.stage?.addEventListener("pointerdown", handlePointerDown);
        el.stage?.addEventListener("pointermove", handlePointerMove);
        el.stage?.addEventListener("pointerup", handlePointerUp);
        el.stage?.addEventListener("pointercancel", handlePointerUp);
        el.stage?.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    function createFallbackPlayer() {
        const stepper = root.querySelector("[data-frontier-stepper]");
        return {
            steps: STEPS,
            index: 0,
            setSteps(steps) {
                this.steps = steps;
                this.render();
            },
            current() {
                return this.steps[this.index] || this.steps[0];
            },
            setStep(index) {
                this.index = clamp(Number(index) || 0, 0, this.steps.length - 1);
                root.dataset.frontierStep = this.current().id;
                this.render();
                renderAll();
            },
            render() {
                if (!stepper) return;
                stepper.innerHTML = this.steps.map((step, index) => `
                    <li class="${index === this.index ? "is-active" : ""} ${index < this.index ? "is-complete" : ""}" data-local-step="${index}">
                        <span>${index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.short)}</small></div>
                    </li>
                `).join("");
                stepper.querySelectorAll("[data-local-step]").forEach((item) => {
                    item.addEventListener("click", () => this.setStep(Number(item.dataset.localStep)));
                });
            },
        };
    }

    function initData(data, source) {
        const valid = data && Array.isArray(data.samples) && data.samples.length;
        state.data = valid ? data : DEFAULT_DATA;
        state.dataSource = valid && source === "json" ? "json" : "fallback";
        state.sampleId = samples()[0]?.id || "";
        state.candidateIndex = 0;
        state.runtimeMessage = state.dataSource === "json"
            ? "已加载真实样例；正在自动加载 ONNX Decoder。"
            : "JSON 加载失败或结构异常，当前使用 JS 内置默认数据。";
        loadPresetPrompt(state.mode);
        renderAll();
        if (state.dataSource === "json") maybeAutoLoadDecoder();
    }

    function fetchJson(url) {
        return fetch(url, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        });
    }

    function init() {
        state.player = window.FrontierPlayer
            ? new window.FrontierPlayer(root, { onStepChange: renderAll })
            : createFallbackPlayer();
        state.player.setSteps(STEPS);
        bindEvents();
        renderAll();

        fetchJson(root.dataset.samplesUrl)
            .then((data) => initData(data, "json"))
            .catch(() => initData(DEFAULT_DATA, "fallback"));
    }

    init();
}());
