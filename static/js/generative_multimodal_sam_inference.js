(function () {
    "use strict";

    let sequence = 0;

    function createSamInferenceClient(options = {}) {
        const defaultWorkerUrl = window.cvclassUrl ? window.cvclassUrl("/static/js/generative_multimodal_sam_worker.js") : (window.CVCLASS_BASE_PATH || "") + "/static/js/generative_multimodal_sam_worker.js";
        const workerUrl = options.workerUrl || defaultWorkerUrl;
        const worker = new Worker(workerUrl);
        const pending = new Map();
        const onStatus = typeof options.onStatus === "function" ? options.onStatus : null;

        worker.onmessage = (event) => {
            const {id, type, payload} = event.data || {};
            if (type === "status") {
                onStatus?.(payload || {});
                return;
            }

            const task = pending.get(id);
            if (!task) return;
            pending.delete(id);

            if (type === "error") {
                const error = new Error(payload?.message || "SAM Decoder 推理失败");
                error.code = payload?.code || "";
                error.detail = payload?.detail || "";
                error.rawOutputShape = payload?.rawOutputShape || null;
                task.reject(error);
                return;
            }
            task.resolve(payload);
        };

        worker.onerror = (event) => {
            const error = new Error(event.message || "SAM Decoder Worker 运行失败");
            pending.forEach((task) => task.reject(error));
            pending.clear();
        };

        function request(type, payload) {
            const id = `${Date.now()}-${sequence += 1}`;
            const promise = new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
            worker.postMessage({id, type, payload});
            return promise;
        }

        return {
            load(payload) {
                return request("load", payload || {});
            },
            setImageEmbedding(payload) {
                return request("setImageEmbedding", payload || {});
            },
            predict(payload) {
                return request("predict", payload || {});
            },
            dispose() {
                worker.terminate();
                pending.clear();
            },
        };
    }

    window.createSamInferenceClient = createSamInferenceClient;
}());
