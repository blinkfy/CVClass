(function () {
    const basePath = self.location.pathname.substring(0, self.location.pathname.indexOf("/static"));
    const ORT_SCRIPT = basePath + "/static/vendor/onnxruntime-web/ort.min.js";
    const ORT_WASM_PATH = basePath + "/static/vendor/onnxruntime-web/";
    const DEFAULT_MODEL_URL = basePath + "/static/assets/data/detection/yolo_detection.onnx";

    let session = null;
    let activeBackend = null;

    function ensureOrtLoaded() {
        if (self.ort) {
            self.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
            return;
        }
        importScripts(ORT_SCRIPT);
        if (!self.ort) {
            throw new Error("ONNX Runtime Web 加载失败");
        }
        self.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    }

    async function fetchModelBytes(modelUrl) {
        const response = await fetch(modelUrl);
        if (!response.ok) {
            const error = new Error("模型文件未找到，已回退到预设结果。");
            error.code = "MODEL_NOT_FOUND";
            throw error;
        }
        return response.arrayBuffer();
    }

    function executionProviderFor(backend) {
        return backend === "webgpu" ? "webgpu" : "wasm";
    }

    async function createSession(modelBytes, backend) {
        const provider = executionProviderFor(backend);
        const options = {
            executionProviders: [provider],
            graphOptimizationLevel: "all"
        };
        return self.ort.InferenceSession.create(modelBytes, options);
    }

    async function loadDetectionModel({backend = "wasm", modelUrl = DEFAULT_MODEL_URL} = {}) {
        ensureOrtLoaded();
        const modelBytes = await fetchModelBytes(modelUrl);

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
            outputNames: session.outputNames
        };
    }

    function getDetectionSession() {
        if (!session) {
            throw new Error("模型未加载，请先点击“加载模型”。");
        }
        return {session, backend: activeBackend || "wasm"};
    }

    self.loadDetectionModel = loadDetectionModel;
    self.getDetectionSession = getDetectionSession;
}());
