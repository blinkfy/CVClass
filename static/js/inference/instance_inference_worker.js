importScripts("/static/js/inference/image_preprocess.js");

const ORT_SCRIPT = "/static/vendor/onnxruntime-web/ort.min.js";
const ORT_WASM_PATH = "/static/vendor/onnxruntime-web/";
const MODEL_URL = "/static/assets/data/instance/yolo11n-seg.onnx";
const LABELS_URL = "/static/assets/data/instance/labels_coco.json";
const CONFIG_URL = "/static/assets/data/instance/model_config.json";
const INPUT_SIZE = 640;
const MAX_CANDIDATES = 260;
const MAX_INSTANCES = 14;
const COLORS = [
    "#2563EB", "#F97316", "#22C55E", "#8B5CF6", "#EAB308", "#EC4899",
    "#06B6D4", "#EF4444", "#14B8A6", "#A855F7", "#84CC16", "#64748B"
];

const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
function isIgnorableOrtMessage(args) {
    return args.some((item) => String(item).includes("VerifyEachNodeIsAssignedToAnEp"));
}
console.error = (...args) => {
    if (!isIgnorableOrtMessage(args)) originalConsoleError(...args);
};
console.warn = (...args) => {
    if (!isIgnorableOrtMessage(args)) originalConsoleWarn(...args);
};

let session = null;
let activeBackend = "wasm";
let labels = [];
let config = null;

function ensureOrtLoaded() {
    if (!self.ort) {
        importScripts(ORT_SCRIPT);
    }
    if (!self.ort) throw new Error("ONNX Runtime Web 加载失败");
    self.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    self.ort.env.logLevel = "error";
}

async function fetchJson(url, label) {
    const response = await fetch(url, {cache: "no-store"});
    if (!response.ok) {
        const error = new Error(`${label} 未安装或不可访问`);
        error.code = "MODEL_FILE_MISSING";
        throw error;
    }
    return response.json();
}

async function fetchModelBytes() {
    const response = await fetch(MODEL_URL, {cache: "no-store"});
    if (!response.ok) {
        const error = new Error("模型文件不存在，请放置 static/assets/data/instance/yolo11n-seg.onnx");
        error.code = "MODEL_FILE_MISSING";
        throw error;
    }
    return response.arrayBuffer();
}

async function createSession(modelBytes, backend) {
    return self.ort.InferenceSession.create(modelBytes, {
        executionProviders: [backend === "webgpu" ? "webgpu" : "wasm"],
        graphOptimizationLevel: "all"
    });
}

async function loadInstanceModel({backend = "wasm"} = {}) {
    ensureOrtLoaded();
    labels = await fetchJson(LABELS_URL, "COCO labels");
    config = await fetchJson(CONFIG_URL, "模型配置");
    const modelBytes = await fetchModelBytes();
    let requested = backend;
    if (requested === "webgpu" && !self.navigator?.gpu) requested = "wasm";
    try {
        session = await createSession(modelBytes, requested);
        activeBackend = requested;
    } catch (error) {
        if (backend === "webgpu") {
            session = await createSession(modelBytes, "wasm");
            activeBackend = "wasm";
        } else {
            throw error;
        }
    }
    return {
        backend: activeBackend,
        inputSize: INPUT_SIZE,
        modelName: "YOLO11n-seg",
        inputNames: session.inputNames,
        outputNames: session.outputNames,
        classCount: labels.length
    };
}

function rawShape(tensor) {
    return tensor?.dims ? Array.from(tensor.dims) : [];
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
}

function scoreValue(raw) {
    return raw > 1 || raw < 0 ? sigmoid(raw) : raw;
}

function boxFromCenter(cx, cy, w, h) {
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

function modelBox(cx, cy, w, h) {
    const values = [cx, cy, w, h];
    const normalized = values.every((value) => Number.isFinite(value) && Math.abs(value) <= 2);
    const scale = normalized ? INPUT_SIZE : 1;
    return boxFromCenter(cx * scale, cy * scale, w * scale, h * scale);
}

function clampBox(box, width = INPUT_SIZE, height = INPUT_SIZE) {
    const [x1, y1, x2, y2] = box;
    return [
        Math.max(0, Math.min(width, x1)),
        Math.max(0, Math.min(height, y1)),
        Math.max(0, Math.min(width, x2)),
        Math.max(0, Math.min(height, y2))
    ];
}

function boxArea(box) {
    return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

function boxIou(a, b) {
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[2], b[2]);
    const y2 = Math.min(a[3], b[3]);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = boxArea(a) + boxArea(b) - inter;
    return union > 0 ? inter / union : 0;
}

function identifyOutputs(results) {
    const tensors = Object.entries(results || {}).map(([name, tensor]) => ({name, tensor, dims: rawShape(tensor)}));
    const prototypes = tensors.find((item) => item.dims.length === 4 && (item.dims[1] <= 64 || item.dims[3] <= 64));
    const predictions = tensors.find((item) => item !== prototypes && item.dims.length === 3);
    return {predictions, prototypes, tensors};
}

function bestClassTransposed(data, anchor, anchors, classCount) {
    let classId = -1;
    let best = -Infinity;
    for (let c = 0; c < classCount; c += 1) {
        const score = scoreValue(data[(4 + c) * anchors + anchor]);
        if (score > best) {
            best = score;
            classId = c;
        }
    }
    return {classId, score: best};
}

function bestClassRow(data, offset, classCount) {
    let classId = -1;
    let best = -Infinity;
    for (let c = 0; c < classCount; c += 1) {
        const score = scoreValue(data[offset + 4 + c]);
        if (score > best) {
            best = score;
            classId = c;
        }
    }
    return {classId, score: best};
}

function decodeYoloSegOutput(predictionTensor, prototypeTensor, options = {}) {
    const classCount = options.classCount || labels.length || 80;
    const predDims = rawShape(predictionTensor);
    const protoDims = rawShape(prototypeTensor);
    const data = predictionTensor?.data;
    if (!data || predDims.length !== 3 || predDims[0] !== 1 || !prototypeTensor?.data || protoDims.length !== 4) {
        const error = new Error("输出格式不匹配，需要适配 decodeYoloSegOutput()");
        error.rawOutputShape = {prediction: predDims, prototype: protoDims};
        throw error;
    }

    const confidenceThreshold = options.confidenceThreshold ?? 0.35;
    const candidates = [];
    if (predDims[1] > predDims[2]) {
        const anchors = predDims[1];
        const channels = predDims[2];
        const coeffCount = channels - 4 - classCount;
        if (coeffCount <= 0) {
            const error = new Error("输出通道缺少 mask coefficients，需要适配 decodeYoloSegOutput()");
            error.rawOutputShape = {prediction: predDims, prototype: protoDims};
            throw error;
        }
        for (let a = 0; a < anchors; a += 1) {
            const offset = a * channels;
            const {classId, score} = bestClassRow(data, offset, classCount);
            if (score < Math.min(0.02, confidenceThreshold)) continue;
            const coeffs = new Float32Array(coeffCount);
            for (let k = 0; k < coeffCount; k += 1) coeffs[k] = data[offset + 4 + classCount + k];
            candidates.push({classId, score, bbox: clampBox(modelBox(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])), coeffs});
        }
    } else {
        const channels = predDims[1];
        const anchors = predDims[2];
        const coeffCount = channels - 4 - classCount;
        if (coeffCount <= 0) {
            const error = new Error("输出通道缺少 mask coefficients，需要适配 decodeYoloSegOutput()");
            error.rawOutputShape = {prediction: predDims, prototype: protoDims};
            throw error;
        }
        for (let a = 0; a < anchors; a += 1) {
            const {classId, score} = bestClassTransposed(data, a, anchors, classCount);
            if (score < Math.min(0.02, confidenceThreshold)) continue;
            const coeffs = new Float32Array(coeffCount);
            for (let k = 0; k < coeffCount; k += 1) coeffs[k] = data[(4 + classCount + k) * anchors + a];
            candidates.push({
                classId,
                score,
                bbox: clampBox(modelBox(data[a], data[anchors + a], data[anchors * 2 + a], data[anchors * 3 + a])),
                coeffs
            });
        }
    }

    return {
        candidates: candidates
            .filter((item) => boxArea(item.bbox) > 4)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_CANDIDATES),
        rawOutputShape: {prediction: predDims, prototype: protoDims}
    };
}

function nms(candidates, iouThreshold) {
    const kept = [];
    const sorted = candidates.slice().sort((a, b) => b.score - a.score);
    for (const candidate of sorted) {
        if (candidate.score < (config?.confidenceThreshold ?? 0.35)) continue;
        const suppress = kept.some((item) => item.classId === candidate.classId && boxIou(item.bbox, candidate.bbox) >= iouThreshold);
        if (!suppress) kept.push(candidate);
        if (kept.length >= MAX_INSTANCES) break;
    }
    return kept;
}

function scaleBoxToOriginal(box, meta) {
    return [
        Math.max(0, Math.min(meta.originalWidth, Math.round((box[0] - meta.padX) / meta.scale))),
        Math.max(0, Math.min(meta.originalHeight, Math.round((box[1] - meta.padY) / meta.scale))),
        Math.max(0, Math.min(meta.originalWidth, Math.round((box[2] - meta.padX) / meta.scale))),
        Math.max(0, Math.min(meta.originalHeight, Math.round((box[3] - meta.padY) / meta.scale)))
    ];
}

function protoMeta(tensor) {
    const dims = rawShape(tensor);
    if (dims[1] <= 64) return {layout: "nchw", coeffs: dims[1], height: dims[2], width: dims[3]};
    return {layout: "nhwc", coeffs: dims[3], height: dims[1], width: dims[2]};
}

function protoValue(tensor, meta, k, y, x) {
    if (meta.layout === "nchw") return tensor.data[((k * meta.height + y) * meta.width) + x];
    return tensor.data[((y * meta.width + x) * meta.coeffs) + k];
}

function contourLength(mask, width, height) {
    let edge = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            if (!mask[i]) continue;
            if (x === 0 || !mask[i - 1]) edge += 1;
            if (x === width - 1 || !mask[i + 1]) edge += 1;
            if (y === 0 || !mask[i - width]) edge += 1;
            if (y === height - 1 || !mask[i + width]) edge += 1;
        }
    }
    return edge;
}

function createMask(candidate, prototypeTensor, preMeta, originalBox) {
    const pm = protoMeta(prototypeTensor);
    const low = new Float32Array(pm.width * pm.height);
    const coeffLimit = Math.min(candidate.coeffs.length, pm.coeffs);
    for (let y = 0; y < pm.height; y += 1) {
        for (let x = 0; x < pm.width; x += 1) {
            let sum = 0;
            for (let k = 0; k < coeffLimit; k += 1) sum += candidate.coeffs[k] * protoValue(prototypeTensor, pm, k, y, x);
            low[y * pm.width + x] = sigmoid(sum);
        }
    }

    const mask = new Uint8Array(preMeta.originalWidth * preMeta.originalHeight);
    const [x1, y1, x2, y2] = originalBox;
    const threshold = config?.maskThreshold ?? 0.5;
    let area = 0;
    let cxSum = 0;
    let cySum = 0;
    for (let y = Math.max(0, y1); y < Math.min(preMeta.originalHeight, y2); y += 1) {
        for (let x = Math.max(0, x1); x < Math.min(preMeta.originalWidth, x2); x += 1) {
            const lx = x * preMeta.scale + preMeta.padX;
            const ly = y * preMeta.scale + preMeta.padY;
            const px = Math.max(0, Math.min(pm.width - 1, Math.floor((lx / INPUT_SIZE) * pm.width)));
            const py = Math.max(0, Math.min(pm.height - 1, Math.floor((ly / INPUT_SIZE) * pm.height)));
            if (low[py * pm.width + px] >= threshold) {
                const index = y * preMeta.originalWidth + x;
                mask[index] = 1;
                area += 1;
                cxSum += x;
                cySum += y;
            }
        }
    }

    const center = area > 0
        ? [Math.round(cxSum / area), Math.round(cySum / area)]
        : [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
    return {
        mask: {width: preMeta.originalWidth, height: preMeta.originalHeight, data: mask},
        maskArea: area,
        center,
        contourLength: area > 0 ? contourLength(mask, preMeta.originalWidth, preMeta.originalHeight) : 0,
        maskDecodeFailed: area === 0
    };
}

function makeInstance(candidate, index, prototypeTensor, preMeta) {
    const bbox = scaleBoxToOriginal(candidate.bbox, preMeta);
    const boxAreaValue = Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
    let maskInfo;
    try {
        maskInfo = createMask(candidate, prototypeTensor, preMeta, bbox);
    } catch (error) {
        maskInfo = {
            mask: null,
            maskArea: 0,
            center: [Math.round((bbox[0] + bbox[2]) / 2), Math.round((bbox[1] + bbox[3]) / 2)],
            contourLength: 0,
            maskDecodeFailed: true
        };
    }
    return {
        id: index + 1,
        classId: candidate.classId,
        className: labels[candidate.classId] || `class_${candidate.classId}`,
        score: candidate.score,
        bbox,
        mask: maskInfo.mask,
        polygon: [],
        color: COLORS[index % COLORS.length],
        maskArea: maskInfo.maskArea,
        boxArea: boxAreaValue,
        maskBoxRatio: boxAreaValue > 0 ? maskInfo.maskArea / boxAreaValue : 0,
        center: maskInfo.center,
        contourLength: maskInfo.contourLength,
        source: "model",
        maskDecodeFailed: maskInfo.maskDecodeFailed
    };
}

async function runInstanceInference(image) {
    if (!session) throw new Error("模型未加载，请先点击“加载模型”。");
    const started = performance.now();
    const {tensor, dims, meta, preprocessTime} = self.preprocessImageToTensor(image, INPUT_SIZE);
    const input = new self.ort.Tensor("float32", tensor, dims);
    const feeds = {[session.inputNames[0]]: input};
    const inferenceStarted = performance.now();
    const results = await session.run(feeds);
    const inferenceTime = performance.now() - inferenceStarted;
    const postStarted = performance.now();
    const {predictions, prototypes, tensors} = identifyOutputs(results);
    if (!predictions || !prototypes) {
        const error = new Error("输出格式不匹配，需要适配 decodeYoloSegOutput()");
        error.rawOutputShape = tensors.map((item) => ({name: item.name, dims: item.dims}));
        throw error;
    }
    const decoded = decodeYoloSegOutput(predictions.tensor, prototypes.tensor, {
        classCount: labels.length,
        confidenceThreshold: config?.confidenceThreshold ?? 0.35
    });
    const filtered = decoded.candidates.filter((item) => item.score >= (config?.confidenceThreshold ?? 0.35));
    const kept = nms(filtered, config?.iouThreshold ?? 0.5);
    const instances = kept.map((candidate, index) => makeInstance(candidate, index, prototypes.tensor, meta));
    const postprocessTime = performance.now() - postStarted;

    return {
        source: "model",
        width: meta.originalWidth,
        height: meta.originalHeight,
        instances,
        semantic_regions: [],
        meta: {
            modelName: "YOLO11n-seg",
            backend: activeBackend,
            inputSize: `${INPUT_SIZE} × ${INPUT_SIZE}`,
            rawOutputShape: decoded.rawOutputShape,
            decodedBoxesCount: decoded.candidates.length,
            confidenceFilteredCount: filtered.length,
            nmsKeptCount: kept.length,
            maskPrototypeShape: rawShape(prototypes.tensor),
            preprocessTime,
            inferenceTime,
            postprocessTime,
            totalTime: performance.now() - started
        }
    };
}

function transferList(result) {
    const buffers = [];
    (result.instances || []).forEach((item) => {
        if (item.mask?.data?.buffer) buffers.push(item.mask.data.buffer);
    });
    return buffers;
}

function serializeError(error) {
    return {
        message: error?.message || "实例分割推理失败",
        code: error?.code || "",
        rawOutputShape: error?.rawOutputShape || null,
        rawOutputShapes: error?.rawOutputShapes || null,
        stack: error?.stack || ""
    };
}

self.decodeYoloSegOutput = decodeYoloSegOutput;

self.onmessage = async (event) => {
    const {id, type, payload} = event.data || {};
    try {
        if (type === "load") {
            const info = await loadInstanceModel(payload || {});
            self.postMessage({id, type: "loaded", payload: info});
            return;
        }
        if (type === "run") {
            const result = await runInstanceInference(payload.image);
            self.postMessage({id, type: "result", payload: result}, transferList(result));
            return;
        }
        throw new Error(`未知实例分割任务：${type}`);
    } catch (error) {
        self.postMessage({id, type: "error", payload: serializeError(error)});
    }
};
