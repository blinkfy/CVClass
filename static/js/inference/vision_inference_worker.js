importScripts("/static/js/inference/ort_loader.js", "/static/js/inference/image_preprocess.js");

const MODEL_URL = "/static/assets/data/detection/yolo_detection.onnx";
const LABELS_URL = "/static/assets/data/detection/labels_coco.json";
const INPUT_SIZE = 640;
const MODEL_SCORE_THRESHOLD = 0.25;
const MODEL_NMS_IOU_THRESHOLD = 0.45;
const MAX_DECODED_BOXES = 24;
const MAX_RAW_CANDIDATE_BOXES = 160;
const MODEL_COLORS = [
    "#2563EB", "#EF4444", "#22C55E", "#F97316", "#A855F7", "#06B6D4",
    "#EAB308", "#EC4899", "#14B8A6", "#64748B", "#84CC16", "#F43F5E"
];

let labelsPromise = null;

function rawOutputShape(tensor) {
    return tensor?.dims ? Array.from(tensor.dims) : [];
}

function getLabels() {
    if (!labelsPromise) {
        labelsPromise = fetch(LABELS_URL).then((response) => {
            if (!response.ok) throw new Error("COCO label 文件加载失败");
            return response.json();
        });
    }
    return labelsPromise;
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
}

function bestClass(values, offset, count, applySigmoid) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < count; i += 1) {
        const raw = values[offset + i];
        const score = applySigmoid ? sigmoid(raw) : raw;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    return {bestIndex, bestScore};
}

function bestClassTransposed(values, anchor, anchors, classCount, applySigmoid) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < classCount; i += 1) {
        const raw = values[(4 + i) * anchors + anchor];
        const score = applySigmoid ? sigmoid(raw) : raw;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    return {bestIndex, bestScore};
}

function boxFromCenter(cx, cy, w, h) {
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

function boxFromModelCenter(cx, cy, w, h, inputSize) {
    const values = [cx, cy, w, h];
    const looksNormalized = values.every((value) => Number.isFinite(value) && Math.abs(value) <= 2);
    const scale = looksNormalized ? inputSize : 1;
    return boxFromCenter(cx * scale, cy * scale, w * scale, h * scale);
}

function colorForClass(index) {
    return MODEL_COLORS[index % MODEL_COLORS.length];
}

function makeBox(id, classIndex, score, bbox, labels) {
    return {
        id,
        class: labels[classIndex] || `class_${classIndex}`,
        classId: classIndex,
        score,
        bbox,
        color: colorForClass(classIndex),
        source: "onnx"
    };
}

function boxArea(box) {
    const [x1, y1, x2, y2] = box.bbox;
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function boxIou(a, b) {
    const [ax1, ay1, ax2, ay2] = a.bbox;
    const [bx1, by1, bx2, by2] = b.bbox;
    const x1 = Math.max(ax1, bx1);
    const y1 = Math.max(ay1, by1);
    const x2 = Math.min(ax2, bx2);
    const y2 = Math.min(ay2, by2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = boxArea(a) + boxArea(b) - inter;
    return union > 0 ? inter / union : 0;
}

function prefilterModelBoxes(boxes) {
    const byClass = new Map();
    boxes
        .filter((box) => box.score >= MODEL_SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .forEach((box) => {
            const key = box.classId ?? box.class;
            if (!byClass.has(key)) byClass.set(key, []);
            byClass.get(key).push(box);
        });

    const kept = [];
    byClass.forEach((items) => {
        const classKept = [];
        items.forEach((box) => {
            if (classKept.every((keep) => boxIou(keep, box) < MODEL_NMS_IOU_THRESHOLD)) {
                classKept.push(box);
            }
        });
        kept.push(...classKept);
    });

    return kept
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_DECODED_BOXES)
        .map((box, index) => ({...box, id: index + 1}));
}

function decodeTransposedYolo(data, dims, labels) {
    const channels = dims[1];
    const anchors = dims[2];
    const classCount = channels - 4;
    if (classCount < 1 || classCount > labels.length + 20) return null;

    const boxes = [];
    for (let anchor = 0; anchor < anchors; anchor += 1) {
        const cx = data[anchor];
        const cy = data[anchors + anchor];
        const w = data[anchors * 2 + anchor];
        const h = data[anchors * 3 + anchor];
        const {bestIndex, bestScore} = bestClassTransposed(data, anchor, anchors, classCount, false);
        if (bestScore >= 0.01) {
            const bbox = boxFromModelCenter(cx, cy, w, h, INPUT_SIZE);
            boxes.push(makeBox(boxes.length + 1, bestIndex, bestScore, bbox, labels));
        }
    }
    return boxes;
}

function decodeRowYolo(data, dims, labels) {
    const rows = dims[1];
    const cols = dims[2];
    const hasObjectness = cols >= labels.length + 5;
    const classOffset = hasObjectness ? 5 : 4;
    const classCount = cols - classOffset;
    if (classCount < 1 || classCount > labels.length + 20) return null;

    const boxes = [];
    for (let row = 0; row < rows; row += 1) {
        const offset = row * cols;
        const cx = data[offset];
        const cy = data[offset + 1];
        const w = data[offset + 2];
        const h = data[offset + 3];
        const objectness = hasObjectness ? data[offset + 4] : 1;
        const {bestIndex, bestScore} = bestClass(data, offset + classOffset, classCount, false);
        const score = objectness * bestScore;
        if (score >= 0.01) {
            boxes.push(makeBox(boxes.length + 1, bestIndex, score, boxFromModelCenter(cx, cy, w, h, INPUT_SIZE), labels));
        }
    }
    return boxes;
}

function decodeYoloOutput(output, meta) {
    const labels = meta.labels || [];
    const dims = rawOutputShape(output);
    const data = output?.data;

    /*
     * Current assumptions:
     * 1. YOLOv8-style output: [1, 84, 8400], where channels are
     *    [cx, cy, w, h, class_0 ... class_79].
     * 2. YOLOv5/YOLOv8 row-style output: [1, N, 85] or [1, N, 84],
     *    where each row is [cx, cy, w, h, objectness?, class scores...].
     * If your ONNX export uses another layout, adapt this function instead
     * of changing the page-level NMS visualization.
     */
    if (!data || dims.length !== 3 || dims[0] !== 1) {
        const error = new Error("请适配 decodeYoloOutput 输出解析函数");
        error.rawOutputShape = dims;
        throw error;
    }

    let boxes = null;
    if (dims[1] >= 6 && dims[1] <= 512 && dims[2] > dims[1]) {
        boxes = decodeTransposedYolo(data, dims, labels);
    }
    if (!boxes && dims[2] >= 6 && dims[1] > 0) {
        boxes = decodeRowYolo(data, dims, labels);
    }
    if (!boxes) {
        const error = new Error("请适配 decodeYoloOutput 输出解析函数");
        error.rawOutputShape = dims;
        throw error;
    }

    return boxes;
}

/**
 * WebGPU 后端的张量数据在 GPU 上，直接访问 .data 会得到错误结果。
 * 必须调用 getData() 异步从 GPU 读回 CPU。
 */
async function readTensorData(tensor) {
    if (!tensor) return tensor;
    if (tensor.location === 'gpu-buffer' || typeof tensor.getData === 'function') {
        try {
            const cpuData = await tensor.getData();
            return {
                data: cpuData,
                dims: tensor.dims,
                type: tensor.type,
                location: 'cpu'
            };
        } catch (_) {
            // already on CPU — fall through
        }
    }
    return tensor;
}

async function firstOutputAsync(results) {
    const raw = Object.values(results || {}).find((value) => value?.dims);
    if (!raw) return null;
    return readTensorData(raw);
}

function serializeError(error) {
    return {
        message: error?.message || "推理失败",
        code: error?.code || "",
        rawOutputShape: error?.rawOutputShape || null,
        stack: error?.stack || ""
    };
}

async function runDetectionInference(image) {
    const labels = await getLabels();
    const {session, backend} = self.getDetectionSession();
    const started = performance.now();
    const {tensor, dims, meta, preprocessTime} = self.preprocessImageToTensor(image, INPUT_SIZE);
    const input = new self.ort.Tensor("float32", tensor, dims);
    const feeds = {[session.inputNames[0]]: input};
    const inferenceStarted = performance.now();
    const results = await session.run(feeds);
    const inferenceTime = performance.now() - inferenceStarted;
    // IMPORTANT: download GPU tensor data to CPU before decoding
    const output = await firstOutputAsync(results);
    const postStarted = performance.now();
    const decoded = decodeYoloOutput(output, {labels});
    const scaledDecoded = self.scaleBoxesToOriginal(decoded, meta)
        .filter((box) => Number.isFinite(box.score) && box.score >= 0.01)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RAW_CANDIDATE_BOXES)
        .map((box, index) => ({...box, id: index + 1}));
    // Worker 只做解码与坐标还原，不做 NMS；页面层负责完整的 confidence filter + NMS 教学演示
    const boxes = scaledDecoded;
    const postprocessTime = performance.now() - postStarted;

    return {
        boxes,
        rawCandidates: scaledDecoded,
        inferenceTime,
        preprocessTime,
        postprocessTime,
        backend,
        inputSize: INPUT_SIZE,
        rawOutputShape: rawOutputShape(output),
        totalTime: performance.now() - started,
        width: meta.originalWidth,
        height: meta.originalHeight
    };
}

self.decodeYoloOutput = decodeYoloOutput;
self.runDetectionInference = runDetectionInference;

self.onmessage = async (event) => {
    const {id, type, payload} = event.data || {};
    try {
        if (type === "load") {
            const info = await self.loadDetectionModel({
                backend: payload?.backend || "wasm",
                modelUrl: payload?.modelUrl || MODEL_URL
            });
            self.postMessage({id, type: "loaded", payload: info});
            return;
        }
        if (type === "run") {
            const result = await runDetectionInference(payload.image);
            self.postMessage({id, type: "result", payload: result});
            return;
        }
        throw new Error(`未知推理任务：${type}`);
    } catch (error) {
        self.postMessage({id, type: "error", payload: serializeError(error)});
    }
};
