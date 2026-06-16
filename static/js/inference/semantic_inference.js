const SEMANTIC_WORKER_URL = "/static/js/inference/semantic_inference_worker.js?v=20260616-segformer3";

let semanticSequence = 0;

function makeSemanticImageBitmap(image) {
    return createImageBitmap(image);
}

export function createSemanticInferenceClient() {
    const worker = new Worker(SEMANTIC_WORKER_URL);
    const pending = new Map();

    worker.onmessage = (event) => {
        const {id, type, payload} = event.data || {};
        const task = pending.get(id);
        if (!task) return;
        pending.delete(id);
        if (type === "error") {
            const error = new Error(payload?.message || "语义分割推理失败");
            error.code = payload?.code || "";
            error.rawOutputShape = payload?.rawOutputShape || null;
            task.reject(error);
            return;
        }
        task.resolve(payload);
    };

    worker.onerror = (event) => {
        pending.forEach((task) => task.reject(new Error(event.message || "语义分割 Worker 运行失败")));
        pending.clear();
    };

    function request(type, payload, transfer = []) {
        const id = `${Date.now()}-${semanticSequence += 1}`;
        const promise = new Promise((resolve, reject) => {
            pending.set(id, {resolve, reject});
        });
        worker.postMessage({id, type, payload}, transfer);
        return promise;
    }

    async function loadSemanticModel({backend, modelBaseUrl}) {
        return request("load", {backend, modelBaseUrl});
    }

    async function runSemanticInference(image) {
        const bitmap = await makeSemanticImageBitmap(image);
        return request("run", {image: bitmap}, [bitmap]);
    }

    return {
        loadSemanticModel,
        runSemanticInference,
        dispose() {
            worker.terminate();
            pending.clear();
        }
    };
}

export {createSemanticInferenceClient as default};
