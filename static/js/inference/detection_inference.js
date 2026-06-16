const WORKER_URL = "/static/js/inference/vision_inference_worker.js?v=20260616-decode-fix";

let sequence = 0;

function makeImageBitmap(image) {
    return createImageBitmap(image);
}

export function handleModelInferenceError(error) {
    const message = error?.message || "推理失败";
    const shape = error?.rawOutputShape ? ` rawOutputShape=[${error.rawOutputShape.join(", ")}]` : "";
    return `${message}${shape}`;
}

export function createDetectionInferenceClient() {
    const worker = new Worker(WORKER_URL);
    const pending = new Map();

    worker.onmessage = (event) => {
        const {id, type, payload} = event.data || {};
        const task = pending.get(id);
        if (!task) return;
        pending.delete(id);
        if (type === "error") {
            const error = new Error(payload?.message || "推理失败");
            error.code = payload?.code || "";
            error.rawOutputShape = payload?.rawOutputShape || null;
            task.reject(error);
        } else {
            task.resolve(payload);
        }
    };

    worker.onerror = (event) => {
        pending.forEach((task) => task.reject(new Error(event.message || "推理 Worker 运行失败")));
        pending.clear();
    };

    function request(type, payload, transfer = []) {
        const id = `${Date.now()}-${sequence += 1}`;
        const promise = new Promise((resolve, reject) => {
            pending.set(id, {resolve, reject});
        });
        worker.postMessage({id, type, payload}, transfer);
        return promise;
    }

    async function loadDetectionModel({backend}) {
        return request("load", {backend});
    }

    async function runDetectionInference(image) {
        const bitmap = await makeImageBitmap(image);
        return request("run", {image: bitmap}, [bitmap]);
    }

    return {
        loadDetectionModel,
        runDetectionInference,
        dispose() {
            worker.terminate();
            pending.clear();
        }
    };
}

export {createDetectionInferenceClient as default};
