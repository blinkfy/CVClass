const INSTANCE_WORKER_URL = "/static/js/inference/instance_inference_worker.js?v=20260618-webgpu-fix1";

let instanceSequence = 0;

function makeImageBitmapForInstance(image) {
    return createImageBitmap(image);
}

export function createInstanceInferenceClient() {
    const worker = new Worker(INSTANCE_WORKER_URL);
    const pending = new Map();

    worker.onmessage = (event) => {
        const {id, type, payload} = event.data || {};
        const task = pending.get(id);
        if (!task) return;
        pending.delete(id);
        if (type === "error") {
            const error = new Error(payload?.message || "实例分割推理失败");
            error.code = payload?.code || "";
            error.rawOutputShape = payload?.rawOutputShape || null;
            error.rawOutputShapes = payload?.rawOutputShapes || null;
            task.reject(error);
            return;
        }
        task.resolve(payload);
    };

    worker.onerror = (event) => {
        pending.forEach((task) => task.reject(new Error(event.message || "实例分割 Worker 运行失败")));
        pending.clear();
    };

    function request(type, payload, transfer = []) {
        const id = `${Date.now()}-${instanceSequence += 1}`;
        const promise = new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
        worker.postMessage({id, type, payload}, transfer);
        return promise;
    }

    async function loadInstanceModel({backend}) {
        return request("load", {backend});
    }

    async function runInstanceInference(image) {
        const bitmap = await makeImageBitmapForInstance(image);
        return request("run", {image: bitmap}, [bitmap]);
    }

    return {
        loadInstanceModel,
        runInstanceInference,
        dispose() {
            worker.terminate();
            pending.clear();
        }
    };
}

export {createInstanceInferenceClient as default};
