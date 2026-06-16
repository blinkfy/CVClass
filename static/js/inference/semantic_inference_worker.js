const ORT_SCRIPT = "/static/vendor/onnxruntime-web/ort.min.js";
const ORT_WASM_PATH = "/static/vendor/onnxruntime-web/";
const DEFAULT_MODEL_BASE = "/static/assets/data/segformer_b0_ade/";
const UNKNOWN_CLASS = 65535;
const FALLBACK_PALETTE = [
    "#2563EB", "#EF4444", "#22C55E", "#F59E0B", "#8B5CF6", "#06B6D4",
    "#84CC16", "#EC4899", "#14B8A6", "#64748B", "#F97316", "#0EA5E9",
    "#A855F7", "#10B981", "#EAB308", "#F43F5E", "#6366F1", "#0891B2"
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
let modelBaseUrl = DEFAULT_MODEL_BASE;
let modelConfig = null;
let preprocessorConfig = null;

function ensureOrtLoaded() {
    if (!self.ort) {
        importScripts(ORT_SCRIPT);
    }
    if (!self.ort) {
        throw new Error("ONNX Runtime Web 加载失败");
    }
    self.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    self.ort.env.logLevel = "error";
}

function modelUrl(path) {
    return `${modelBaseUrl.replace(/\/?$/, "/")}${path}`;
}

async function fetchJson(path) {
    const response = await fetch(modelUrl(path), {cache: "no-store"});
    if (!response.ok) {
        const error = new Error(`模型文件未安装或不可访问：${path}`);
        error.code = "MODEL_FILE_MISSING";
        throw error;
    }
    return response.json();
}

async function fetchArrayBuffer(path) {
    const response = await fetch(modelUrl(path), {cache: "no-store"});
    if (!response.ok) {
        const error = new Error(`模型文件未安装或不可访问：${path}`);
        error.code = "MODEL_FILE_MISSING";
        throw error;
    }
    return response.arrayBuffer();
}

function providerFor(backend) {
    return backend === "webgpu" ? "webgpu" : "wasm";
}

async function createSession(modelBytes, backend) {
    return self.ort.InferenceSession.create(modelBytes, {
        executionProviders: [providerFor(backend)],
        graphOptimizationLevel: "all"
    });
}

async function loadSemanticModel({backend = "webgpu", modelBaseUrl: requestedBase = DEFAULT_MODEL_BASE} = {}) {
    ensureOrtLoaded();
    modelBaseUrl = requestedBase || DEFAULT_MODEL_BASE;
    modelConfig = await fetchJson("config.json");
    preprocessorConfig = await fetchJson("preprocessor_config.json");
    const modelBytes = await fetchArrayBuffer("model_quantized.onnx");

    let requestedBackend = backend;
    if (requestedBackend === "webgpu" && !self.navigator?.gpu) {
        requestedBackend = "wasm";
    }

    try {
        session = await createSession(modelBytes, requestedBackend);
        activeBackend = requestedBackend;
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
        inputNames: session.inputNames,
        outputNames: session.outputNames,
        inputSize: inputSize(),
        classCount: Object.keys(modelConfig?.id2label || {}).length,
        modelName: "SegFormer-B0 Semantic Segmentation"
    };
}

function inputSize() {
    const size = preprocessorConfig?.size || {};
    return {
        width: Number(size.width || size.shortest_edge || modelConfig?.image_size || 512),
        height: Number(size.height || size.shortest_edge || modelConfig?.image_size || 512)
    };
}

function preprocessImage(image) {
    const started = performance.now();
    const size = inputSize();
    const mean = preprocessorConfig?.image_mean || [0.485, 0.456, 0.406];
    const std = preprocessorConfig?.image_std || [0.229, 0.224, 0.225];
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
    const area = size.width * size.height;
    const tensor = new Float32Array(1 * 3 * area);

    for (let i = 0; i < area; i += 1) {
        const src = i * 4;
        tensor[i] = (rgba[src] / 255 - mean[0]) / std[0];
        tensor[area + i] = (rgba[src + 1] / 255 - mean[1]) / std[1];
        tensor[area * 2 + i] = (rgba[src + 2] / 255 - mean[2]) / std[2];
    }

    return {
        tensor,
        dims: [1, 3, size.height, size.width],
        preprocessTime: performance.now() - started,
        inputSize: size,
        originalWidth: image.width,
        originalHeight: image.height
    };
}

function firstOutput(results) {
    return Object.values(results || {}).find((value) => value?.data && value?.dims);
}

function rawOutputShape(tensor) {
    return tensor?.dims ? Array.from(tensor.dims) : [];
}

function colorForClass(id) {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) {
        const hue = (numeric * 47) % 360;
        if (numeric < FALLBACK_PALETTE.length) return FALLBACK_PALETTE[numeric];
        return `hsl(${hue} 72% 48%)`;
    }
    return "#2563EB";
}

function classInfo(id) {
    const label = modelConfig?.id2label?.[String(id)] || `class_${id}`;
    return {
        id,
        name: label,
        cn: label,
        color: colorForClass(id)
    };
}

function argmaxLogits(output) {
    const dims = rawOutputShape(output);
    const data = output?.data;
    if (!data || !dims.length) {
        const error = new Error("模型输出为空，无法生成 semantic mask");
        error.rawOutputShape = dims;
        throw error;
    }

    let classCount;
    let maskHeight;
    let maskWidth;
    let valueAt;
    let directMask = false;

    if (dims.length === 4 && dims[0] === 1 && dims[1] > 1) {
        classCount = dims[1];
        maskHeight = dims[2];
        maskWidth = dims[3];
        valueAt = (c, y, x) => data[((c * maskHeight + y) * maskWidth) + x];
    } else if (dims.length === 4 && dims[0] === 1 && dims[3] > 1) {
        maskHeight = dims[1];
        maskWidth = dims[2];
        classCount = dims[3];
        valueAt = (c, y, x) => data[((y * maskWidth + x) * classCount) + c];
    } else if (dims.length === 3 && dims[0] > 1) {
        classCount = dims[0];
        maskHeight = dims[1];
        maskWidth = dims[2];
        valueAt = (c, y, x) => data[((c * maskHeight + y) * maskWidth) + x];
    } else if (dims.length === 3 && dims[0] === 1) {
        directMask = true;
        maskHeight = dims[1];
        maskWidth = dims[2];
    } else if (dims.length === 2) {
        directMask = true;
        maskHeight = dims[0];
        maskWidth = dims[1];
    } else {
        const error = new Error("模型输出格式不匹配，请检查 SegFormer ONNX 输出");
        error.rawOutputShape = dims;
        throw error;
    }

    const lowResClassMap = new Uint16Array(maskWidth * maskHeight);
    const lowResScoreMap = new Float32Array(maskWidth * maskHeight);

    if (directMask) {
        for (let i = 0; i < lowResClassMap.length; i += 1) {
            const value = Number(data[i]);
            lowResClassMap[i] = Number.isFinite(value) ? Math.max(0, Math.round(value)) : UNKNOWN_CLASS;
            lowResScoreMap[i] = 1;
        }
        classCount = Object.keys(modelConfig?.id2label || {}).length || 0;
    } else {
        for (let y = 0; y < maskHeight; y += 1) {
            for (let x = 0; x < maskWidth; x += 1) {
                let bestClass = 0;
                let bestScore = -Infinity;
                for (let c = 0; c < classCount; c += 1) {
                    const score = valueAt(c, y, x);
                    if (score > bestScore) {
                        bestScore = score;
                        bestClass = c;
                    }
                }
                const index = y * maskWidth + x;
                lowResClassMap[index] = bestClass;
                lowResScoreMap[index] = Number.isFinite(bestScore) ? bestScore : 0;
            }
        }
    }

    return {
        lowResClassMap,
        lowResScoreMap,
        lowResWidth: maskWidth,
        lowResHeight: maskHeight,
        classCount,
        rawOutputShape: dims,
        directMask
    };
}

function upsampleMask(mask, width, height) {
    const classMap = new Uint16Array(width * height);
    const scoreMap = new Float32Array(width * height);
    const counts = new Map();
    const {lowResClassMap, lowResScoreMap, lowResWidth, lowResHeight} = mask;

    for (let y = 0; y < height; y += 1) {
        const sourceY = Math.min(lowResHeight - 1, Math.floor((y / height) * lowResHeight));
        for (let x = 0; x < width; x += 1) {
            const sourceX = Math.min(lowResWidth - 1, Math.floor((x / width) * lowResWidth));
            const src = sourceY * lowResWidth + sourceX;
            const dst = y * width + x;
            const classId = lowResClassMap[src];
            classMap[dst] = classId;
            scoreMap[dst] = lowResScoreMap[src];
            if (classId !== UNKNOWN_CLASS) counts.set(classId, (counts.get(classId) || 0) + 1);
        }
    }

    const total = width * height;
    const distribution = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({
            id,
            name: classInfo(id).name,
            count,
            ratio: total > 0 ? count / total : 0
        }));

    const classes = distribution.map((item) => classInfo(item.id));
    return {classMap, scoreMap, distribution, classes};
}

async function runSemanticInference(image) {
    if (!session) {
        throw new Error("模型未加载，请先点击“加载模型”。");
    }
    const started = performance.now();
    const pre = preprocessImage(image);
    const input = new self.ort.Tensor("float32", pre.tensor, pre.dims);
    const feeds = {[session.inputNames[0]]: input};
    const inferenceStarted = performance.now();
    const results = await session.run(feeds);
    const inferenceTime = performance.now() - inferenceStarted;
    const output = firstOutput(results);
    const postStarted = performance.now();
    const logits = argmaxLogits(output);
    const mask = upsampleMask(logits, pre.originalWidth, pre.originalHeight);
    const postprocessTime = performance.now() - postStarted;

    return {
        source: "model",
        width: pre.originalWidth,
        height: pre.originalHeight,
        classMap: mask.classMap,
        scoreMap: mask.scoreMap,
        classes: mask.classes,
        distribution: mask.distribution,
        meta: {
            modelName: "SegFormer-B0",
            backend: activeBackend,
            inputSize: `${pre.inputSize.width} × ${pre.inputSize.height}`,
            rawOutputShape: logits.rawOutputShape,
            rawOutputSummary: logits.directMask ? "pipeline returned class mask" : "logits -> argmax class map",
            lowResMaskSize: `${logits.lowResWidth} × ${logits.lowResHeight}`,
            classCount: logits.classCount,
            preprocessTime: pre.preprocessTime,
            inferenceTime,
            postprocessTime,
            totalTime: performance.now() - started
        }
    };
}

function serializeError(error) {
    return {
        message: error?.message || "语义分割推理失败",
        code: error?.code || "",
        rawOutputShape: error?.rawOutputShape || null,
        stack: error?.stack || ""
    };
}

self.onmessage = async (event) => {
    const {id, type, payload} = event.data || {};
    try {
        if (type === "load") {
            const info = await loadSemanticModel(payload || {});
            self.postMessage({id, type: "loaded", payload: info});
            return;
        }
        if (type === "run") {
            const result = await runSemanticInference(payload.image);
            self.postMessage({id, type: "result", payload: result}, [result.classMap.buffer, result.scoreMap.buffer]);
            return;
        }
        throw new Error(`未知语义分割任务：${type}`);
    } catch (error) {
        self.postMessage({id, type: "error", payload: serializeError(error)});
    }
};
