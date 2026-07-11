var basePath = "";
try { basePath = self.location.pathname.substring(0, self.location.pathname.indexOf("/static")); } catch (e) {}

const ORT_SCRIPT = basePath + "/static/vendor/onnxruntime-web/ort.min.js";
const ORT_WASM_PATH = basePath + "/static/vendor/onnxruntime-web/";
const DEFAULT_MANIFEST_URL = basePath + "/static/assets/data/generative_multimodal/sam/model/sam_model_manifest.json";
const DEFAULT_MASK_INPUT_SHAPE = [1, 1, 256, 256];
const DEFAULT_ENCODER_LONG_SIDE = 1024;

let session = null;
let manifest = null;
let activeBackend = "wasm";
let embedding = null;
let embeddingInfo = null;

function postStatus(message, mode = "info", detail = "") {
    self.postMessage({type: "status", payload: {message, mode, detail, backend: activeBackend}});
}

function serializeError(error) {
    return {
        message: error?.message || "SAM Decoder 推理失败",
        code: error?.code || "",
        detail: error?.detail || "",
        rawOutputShape: error?.rawOutputShape || null,
        stack: error?.stack || "",
    };
}

function codedError(message, code, detail = "") {
    const error = new Error(message);
    error.code = code;
    error.detail = detail;
    return error;
}

function ensureOrtLoaded() {
    if (!self.ort) importScripts(ORT_SCRIPT);
    if (!self.ort) throw codedError("ONNX Runtime Web 加载失败", "ORT_LOAD_FAILED");
    self.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    self.ort.env.wasm.numThreads = 1;
    self.ort.env.logLevel = "error";
}

async function fetchJson(url, label) {
    const response = await fetch(url, {cache: "no-store"});
    if (!response.ok) {
        throw codedError(`${label} 不可访问`, "ASSET_MISSING", `${url} HTTP ${response.status}`);
    }
    return response.json();
}

async function fetchArrayBuffer(url, label) {
    const response = await fetch(url, {cache: "no-store"});
    if (!response.ok) {
        throw codedError(`${label} 不可访问`, "ASSET_MISSING", `${url} HTTP ${response.status}`);
    }
    return response.arrayBuffer();
}

function resolveUrl(path, baseUrl) {
    if (!path) return "";
    if (/^(https?:)?\/\//.test(path)) return path;
    if (path.startsWith("/")) {
        // 避免双重前缀：若路径已含 basePath 则直接返回
        if (basePath && path.startsWith(basePath + "/")) return path;
        return basePath + path;
    }
    return new URL(path, baseUrl || self.location.href).toString();
}

async function createSession(modelBytes, backend) {
    const executionProvider = backend === "webgpu" ? "webgpu" : "wasm";
    return self.ort.InferenceSession.create(modelBytes, {
        executionProviders: [executionProvider],
        graphOptimizationLevel: "all",
    });
}

async function loadDecoder(payload = {}) {
    ensureOrtLoaded();
    const manifestUrl = resolveUrl(payload.manifestUrl || DEFAULT_MANIFEST_URL);
    manifest = await fetchJson(manifestUrl, "SAM manifest");
    const modelUrl = resolveUrl(payload.modelUrl || manifest.modelUrl, manifestUrl);
    if (!modelUrl) throw codedError("SAM decoder ONNX 路径未配置", "MODEL_URL_MISSING");

    postStatus("正在加载 SAM ONNX Decoder", "loading", modelUrl);
    const modelBytes = await fetchArrayBuffer(modelUrl, "SAM decoder ONNX 模型");
    let requestedBackend = payload.backend || manifest.defaultBackend || "wasm";
    if (requestedBackend === "webgpu" && !self.navigator?.gpu) requestedBackend = "wasm";
    try {
        session = await createSession(modelBytes, requestedBackend);
        activeBackend = requestedBackend;
    } catch (error) {
        if (requestedBackend === "webgpu") {
            session = await createSession(modelBytes, "wasm");
            activeBackend = "wasm";
        } else {
            throw error;
        }
    }
    postStatus("SAM ONNX Decoder 已就绪", "ready", activeBackend);
    return {
        backend: activeBackend,
        modelName: manifest.modelName || "SAM ViT-B Mask Decoder",
        inputNames: session.inputNames || [],
        outputNames: session.outputNames || [],
        manifestVersion: manifest.version || "",
    };
}

function float16ToFloat32(value) {
    const sign = (value & 0x8000) ? -1 : 1;
    const exponent = (value >> 10) & 0x1f;
    const fraction = value & 0x03ff;
    if (exponent === 0) {
        return sign * (fraction / 0x400) * 2 ** -14;
    }
    if (exponent === 0x1f) {
        return fraction ? NaN : sign * Infinity;
    }
    return sign * (1 + fraction / 0x400) * 2 ** (exponent - 15);
}

function float16ArrayToFloat32(buffer) {
    const view = new DataView(buffer);
    const output = new Float32Array(buffer.byteLength / 2);
    for (let index = 0; index < output.length; index += 1) {
        output[index] = float16ToFloat32(view.getUint16(index * 2, true));
    }
    return output;
}

function arrayProduct(values) {
    return values.reduce((total, value) => total * Number(value || 1), 1);
}

async function setImageEmbedding(payload = {}) {
    if (!session) throw codedError("请先加载 SAM ONNX Decoder", "SESSION_NOT_READY");
    if (payload.embeddingAvailable === false) {
        throw codedError("当前样例没有离线 Image Embedding", "EMBEDDING_MISSING");
    }

    const shape = Array.isArray(payload.shape) && payload.shape.length
        ? payload.shape.map((value) => Number(value))
        : (manifest?.embeddingShape || [1, 256, 64, 64]);
    const dtype = payload.dtype || manifest?.embeddingDtype || "float16";
    const url = resolveUrl(payload.embeddingUrl);
    if (!url) throw codedError("当前样例未配置 embedding 路径", "EMBEDDING_URL_MISSING");

    postStatus("正在加载离线 Image Embedding", "loading", url);
    const buffer = await fetchArrayBuffer(url, "Image Embedding");
    const values = dtype === "float32" ? new Float32Array(buffer) : float16ArrayToFloat32(buffer);
    const expected = arrayProduct(shape);
    if (values.length !== expected) {
        throw codedError("Image Embedding shape 与文件长度不匹配", "EMBEDDING_SHAPE_MISMATCH", `${values.length} != ${expected}`);
    }

    embedding = values;
    embeddingInfo = {
        sampleId: payload.sampleId || "",
        shape,
        dtype,
        imageSize: payload.imageSize || manifest?.imageSize || [640, 420],
        embeddingUrl: url,
    };
    postStatus("离线 Image Embedding 已就绪", "ready", embeddingInfo.sampleId);
    return embeddingInfo;
}

function inputNames() {
    return session?.inputNames || [];
}

function pickInput(configKey, aliases) {
    const configured = manifest?.inputs?.[configKey];
    const names = inputNames();
    if (configured && (!names.length || names.includes(configured))) return configured;
    return aliases.find((name) => names.includes(name)) || configured || aliases[0];
}

function putFeed(feeds, name, tensor, required = false) {
    const names = inputNames();
    if (!names.length || names.includes(name)) {
        feeds[name] = tensor;
        return;
    }
    if (required) {
        throw codedError(`SAM decoder 输入缺失：${name}`, "MODEL_INPUT_MISMATCH", names.join(", "));
    }
}

function normalizeBox(box) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const values = box.map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value))) return null;
    const [x1, y1, x2, y2] = values;
    if (Math.abs(x2 - x1) < 2 || Math.abs(y2 - y1) < 2) return null;
    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function encoderScale(width, height) {
    const longSide = Number(manifest?.imageEncoderLongSide || manifest?.encoderLongSide || DEFAULT_ENCODER_LONG_SIDE);
    return Math.max(1, longSide) / Math.max(width || 1, height || 1);
}

function transformPoint(point, scale) {
    return [
        (Number(point?.[0]) || 0) * scale,
        (Number(point?.[1]) || 0) * scale,
    ];
}

function transformBox(box, scale) {
    return box ? box.map((value) => value * scale) : null;
}

function collectPrompt(payload = {}, width = 640, height = 420) {
    const coords = [];
    const labels = [];
    const scale = encoderScale(width, height);
    (payload.positivePoints || []).forEach((point) => {
        if (Array.isArray(point) && point.length >= 2) {
            const transformed = transformPoint(point, scale);
            coords.push(transformed[0], transformed[1]);
            labels.push(1);
        }
    });
    (payload.negativePoints || []).forEach((point) => {
        if (Array.isArray(point) && point.length >= 2) {
            const transformed = transformPoint(point, scale);
            coords.push(transformed[0], transformed[1]);
            labels.push(0);
        }
    });
    const box = transformBox(normalizeBox(payload.box), scale);
    if (box) {
        coords.push(box[0], box[1], box[2], box[3]);
        labels.push(2, 3);
    }
    if (!labels.length) {
        coords.push(0, 0);
        labels.push(-1);
    }
    return {coords: new Float32Array(coords), labels: new Float32Array(labels), count: labels.length};
}

async function readTensor(tensor) {
    if (!tensor) return null;
    if (typeof tensor.getData === "function") {
        try {
            const data = await tensor.getData();
            return {data, dims: Array.from(tensor.dims || []), type: tensor.type};
        } catch (_) {
            // Fall back to direct data access when already on CPU.
        }
    }
    return {data: tensor.data, dims: Array.from(tensor.dims || []), type: tensor.type};
}

function findTensor(results, configuredName, aliases, predicate) {
    if (configuredName && results[configuredName]) return results[configuredName];
    const alias = aliases.find((name) => results[name]);
    if (alias) return results[alias];
    return Object.values(results || {}).find((tensor) => predicate(Array.from(tensor?.dims || []))) || null;
}

function maskMeta(tensor) {
    const dims = tensor?.dims || [];
    if (dims.length === 4) return {count: dims[1], height: dims[2], width: dims[3], layout: "nchw"};
    if (dims.length === 3) return {count: 1, height: dims[1], width: dims[2], layout: "nhw"};
    if (dims.length === 2) return {count: 1, height: dims[0], width: dims[1], layout: "hw"};
    throw codedError("SAM decoder mask 输出 shape 不受支持", "MODEL_OUTPUT_MISMATCH", JSON.stringify(dims));
}

function maskValue(tensor, meta, candidateIndex, x, y) {
    if (meta.layout === "nchw") {
        return Number(tensor.data[((candidateIndex * meta.height + y) * meta.width) + x] || 0);
    }
    if (meta.layout === "nhw") {
        return Number(tensor.data[(y * meta.width) + x] || 0);
    }
    return Number(tensor.data[(y * meta.width) + x] || 0);
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
}

function candidateStats(tensor, meta, candidateIndex) {
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < meta.height; y += 1) {
        for (let x = 0; x < meta.width; x += 1) {
            const value = maskValue(tensor, meta, candidateIndex, x, y);
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
    }
    return {min, max};
}

function probability(raw, stats) {
    if (stats.min < -0.001 || stats.max > 1.001) return sigmoid(raw);
    return raw;
}

function resampleMask(tensor, meta, candidateIndex, targetWidth, targetHeight, threshold) {
    const mask = new Uint8Array(targetWidth * targetHeight);
    const stats = candidateStats(tensor, meta, candidateIndex);
    let area = 0;
    let x1 = targetWidth;
    let y1 = targetHeight;
    let x2 = 0;
    let y2 = 0;
    for (let y = 0; y < targetHeight; y += 1) {
        const sy = Math.max(0, Math.min(meta.height - 1, Math.floor(((y + 0.5) / targetHeight) * meta.height)));
        for (let x = 0; x < targetWidth; x += 1) {
            const sx = Math.max(0, Math.min(meta.width - 1, Math.floor(((x + 0.5) / targetWidth) * meta.width)));
            const value = probability(maskValue(tensor, meta, candidateIndex, sx, sy), stats);
            if (value >= threshold) {
                const index = y * targetWidth + x;
                mask[index] = 1;
                area += 1;
                x1 = Math.min(x1, x);
                y1 = Math.min(y1, y);
                x2 = Math.max(x2, x);
                y2 = Math.max(y2, y);
            }
        }
    }
    return {
        data: mask,
        width: targetWidth,
        height: targetHeight,
        area,
        bbox: area ? [x1, y1, x2 + 1, y2 + 1] : [0, 0, 0, 0],
    };
}

function contourLength(mask, width, height) {
    let edge = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;
            if (!mask[index]) continue;
            if (x === 0 || !mask[index - 1]) edge += 1;
            if (x === width - 1 || !mask[index + 1]) edge += 1;
            if (y === 0 || !mask[index - width]) edge += 1;
            if (y === height - 1 || !mask[index + width]) edge += 1;
        }
    }
    return edge;
}

function maskIou(a, b) {
    let intersection = 0;
    let union = 0;
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        const av = a[index] ? 1 : 0;
        const bv = b[index] ? 1 : 0;
        if (av && bv) intersection += 1;
        if (av || bv) union += 1;
    }
    return union ? intersection / union : 0;
}

function polygonFromBbox(bbox) {
    const [x1, y1, x2, y2] = bbox;
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function iouScore(iouTensor, index) {
    const data = iouTensor?.data;
    if (!data || !data.length) return 0;
    const raw = Number(data[Math.min(index, data.length - 1)] || 0);
    return Math.max(0, Math.min(1, raw > 1 || raw < 0 ? sigmoid(raw) : raw));
}

function transferList(result) {
    const buffers = [];
    (result.candidates || []).forEach((candidate) => {
        if (candidate.mask?.data?.buffer) buffers.push(candidate.mask.data.buffer);
    });
    return buffers;
}

async function runPrediction(payload = {}) {
    if (!session) throw codedError("请先加载 SAM ONNX Decoder", "SESSION_NOT_READY");
    if (!embedding || !embeddingInfo) throw codedError("请先加载当前样例的离线 Image Embedding", "EMBEDDING_NOT_READY");

    const imageSize = payload.imageSize || embeddingInfo.imageSize || [640, 420];
    const width = Number(imageSize[0]) || 640;
    const height = Number(imageSize[1]) || 420;
    const threshold = Math.max(0.01, Math.min(0.99, Number(payload.threshold) || 0.5));
    const prompt = collectPrompt(payload, width, height);

    const names = {
        image: pickInput("image_embeddings", ["image_embeddings", "image_embedding"]),
        pointCoords: pickInput("point_coords", ["point_coords", "point_coordinates"]),
        pointLabels: pickInput("point_labels", ["point_labels", "labels"]),
        maskInput: pickInput("mask_input", ["mask_input", "mask_inputs"]),
        hasMaskInput: pickInput("has_mask_input", ["has_mask_input"]),
        origImSize: pickInput("orig_im_size", ["orig_im_size", "original_image_size"]),
    };
    const maskInputShape = manifest?.maskInputShape || DEFAULT_MASK_INPUT_SHAPE;
    const feeds = {};
    putFeed(feeds, names.image, new self.ort.Tensor("float32", embedding, embeddingInfo.shape), true);
    putFeed(feeds, names.pointCoords, new self.ort.Tensor("float32", prompt.coords, [1, prompt.count, 2]), true);
    putFeed(feeds, names.pointLabels, new self.ort.Tensor("float32", prompt.labels, [1, prompt.count]), true);
    putFeed(feeds, names.maskInput, new self.ort.Tensor("float32", new Float32Array(arrayProduct(maskInputShape)), maskInputShape));
    putFeed(feeds, names.hasMaskInput, new self.ort.Tensor("float32", new Float32Array([0]), [1]));
    putFeed(feeds, names.origImSize, new self.ort.Tensor("float32", new Float32Array([height, width]), [2]));

    postStatus("SAM Decoder 正在根据 prompt 生成候选 mask", "loading");
    const started = performance.now();
    const results = await session.run(feeds);
    const masksTensor = await readTensor(findTensor(results, manifest?.outputs?.masks, ["masks", "mask"], (dims) => dims.length >= 2 && dims.length <= 4));
    const iouTensor = await readTensor(findTensor(results, manifest?.outputs?.iou_predictions, ["iou_predictions", "scores", "iou"], (dims) => dims.length <= 2));
    if (!masksTensor?.data) {
        throw codedError("SAM decoder 没有返回 mask 输出", "MODEL_OUTPUT_MISSING");
    }

    const meta = maskMeta(masksTensor);
    const count = Math.max(1, Math.min(3, meta.count || 1));
    const candidates = [];
    for (let index = 0; index < count; index += 1) {
        const maskInfo = resampleMask(masksTensor, meta, index, width, height, threshold);
        const looseMask = resampleMask(masksTensor, meta, index, width, height, Math.max(0.01, threshold - 0.05));
        const strictMask = resampleMask(masksTensor, meta, index, width, height, Math.min(0.99, threshold + 0.05));
        const score = iouScore(iouTensor, index);
        const stability = maskIou(looseMask.data, strictMask.data);
        candidates.push({
            id: `onnx_mask_${index + 1}`,
            name: `ONNX Mask ${index + 1}`,
            source: "onnx_decoder",
            score: Math.round(score * 1000) / 1000,
            stability: Math.round(stability * 1000) / 1000,
            area: maskInfo.area,
            areaRatio: Math.round((maskInfo.area / Math.max(width * height, 1)) * 1000) / 1000,
            contourLength: contourLength(maskInfo.data, width, height),
            bbox: maskInfo.bbox,
            polygon: polygonFromBbox(maskInfo.bbox),
            mask: {
                width,
                height,
                data: maskInfo.data,
            },
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    const result = {
        source: "onnx_decoder",
        sampleId: embeddingInfo.sampleId,
        width,
        height,
        threshold,
        promptCount: prompt.count,
        candidates,
        meta: {
            backend: activeBackend,
            inputNames: session.inputNames || [],
            outputNames: session.outputNames || [],
            outputShape: masksTensor.dims,
            inferenceTime: Math.round(performance.now() - started),
            embeddingShape: embeddingInfo.shape,
            embeddingDtype: embeddingInfo.dtype,
        },
    };
    postStatus("SAM Decoder 推理完成", "ready", `${result.meta.inferenceTime}ms`);
    return result;
}

self.onmessage = async (event) => {
    const {id, type, payload} = event.data || {};
    try {
        if (type === "load") {
            const info = await loadDecoder(payload || {});
            self.postMessage({id, type: "loaded", payload: info});
            return;
        }
        if (type === "setImageEmbedding") {
            const info = await setImageEmbedding(payload || {});
            self.postMessage({id, type: "embeddingReady", payload: info});
            return;
        }
        if (type === "predict") {
            const result = await runPrediction(payload || {});
            self.postMessage({id, type: "result", payload: result}, transferList(result));
            return;
        }
        if (type === "dispose") {
            session = null;
            embedding = null;
            embeddingInfo = null;
            self.postMessage({id, type: "disposed", payload: {}});
            return;
        }
        throw codedError(`未知 SAM Worker 任务：${type}`, "UNKNOWN_TASK");
    } catch (error) {
        self.postMessage({id, type: "error", payload: serializeError(error)});
    }
};
