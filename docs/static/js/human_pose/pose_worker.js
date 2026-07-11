(function () {
    "use strict";

    const CDN_SCRIPTS = [
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.22.0/dist/tf-core.min.js",
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.22.0/dist/tf-converter.min.js",
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js",
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-cpu@4.22.0/dist/tf-backend-cpu.min.js",
        "https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js",
    ];

    const state = {
        scriptsLoaded: false,
        backendName: "",
        detectors: {},
    };

    function postStatus(id, stage, detail = "") {
        self.postMessage({ type: "status", id, stage, detail });
    }

    function postError(id, error) {
        self.postMessage({
            type: "error",
            id,
            message: error?.message || String(error),
            stack: error?.stack || "",
        });
    }

    function modelVariantName(variant) {
        if (variant === "multipose") return "MoveNet MultiPose Lightning";
        if (variant === "lightning") return "MoveNet Lightning fallback";
        return "MoveNet Thunder";
    }

    function moveNetModelType(variant) {
        const modelTypes = self.poseDetection?.movenet?.modelType || {};
        if (variant === "multipose") return modelTypes.MULTIPOSE_LIGHTNING;
        if (variant === "lightning") return modelTypes.SINGLEPOSE_LIGHTNING;
        return modelTypes.SINGLEPOSE_THUNDER;
    }

    function tfjsAvailable() {
        return Boolean(self.tf && self.poseDetection);
    }

    function loadScripts() {
        if (state.scriptsLoaded) return;
        importScripts(...CDN_SCRIPTS);
        state.scriptsLoaded = true;
    }

    async function selectBackend() {
        if (state.backendName) return state.backendName;
        if (self.tf?.engine?.().registryFactory?.webgl) {
            try {
                await self.tf.setBackend("webgl");
                await self.tf.ready();
                state.backendName = "webgl";
                return state.backendName;
            } catch (error) {
                console.warn("TFJS WebGL backend is unavailable in pose worker; falling back to CPU.", error);
            }
        }
        if (self.tf?.engine?.().registryFactory?.cpu) {
            await self.tf.setBackend("cpu");
            await self.tf.ready();
            state.backendName = "cpu";
            return state.backendName;
        }
        throw new Error("No supported TFJS backend is available in worker");
    }

    async function ensureDetector(variant, modelUrl) {
        if (state.detectors[variant]) return state.detectors[variant];
        const modelType = moveNetModelType(variant);
        if (!modelType) {
            throw new Error(`${modelVariantName(variant)} is not supported by the loaded pose-detection runtime`);
        }

        const detectorConfig = {
            modelType,
            enableSmoothing: false,
            modelUrl,
        };
        if (variant === "multipose") {
            detectorConfig.enableTracking = false;
            detectorConfig.multiPoseMaxDimension = 512;
            detectorConfig.minPoseScore = 0.3;
        }

        const detector = await self.poseDetection.createDetector(
            self.poseDetection.SupportedModels.MoveNet,
            detectorConfig
        );
        state.detectors[variant] = detector;
        return detector;
    }

    function toImageData(image) {
        if (!image?.pixels || !image.width || !image.height) {
            throw new Error("Worker inference image payload is incomplete");
        }
        return new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height);
    }

    async function infer(payload) {
        const { id, image, variants, modelUrls, maxPeople } = payload;
        postStatus(id, "runtime", "Loading TFJS runtime in worker");
        loadScripts();
        if (!tfjsAvailable()) throw new Error("TFJS / MoveNet scripts are not available in worker");

        const backendName = await selectBackend();
        const input = toImageData(image);
        let lastError = null;

        for (const variant of variants || []) {
            const modelUrl = modelUrls?.[variant];
            if (!modelUrl) continue;
            try {
                postStatus(id, "model", `Loading ${modelVariantName(variant)}`);
                const detector = await ensureDetector(variant, modelUrl);
                postStatus(id, "inference", `Running ${modelVariantName(variant)}`);
                const poses = await detector.estimatePoses(input, {
                    maxPoses: variant === "multipose" ? maxPeople : 1,
                    flipHorizontal: false,
                });
                self.postMessage({
                    type: "result",
                    id,
                    variant,
                    backendName,
                    poses,
                });
                return;
            } catch (error) {
                lastError = error;
                postStatus(id, "fallback", `${modelVariantName(variant)} failed; trying fallback`);
            }
        }

        throw lastError || new Error("No local MoveNet model URL is configured");
    }

    self.onmessage = (event) => {
        const payload = event.data || {};
        if (payload.type !== "infer") return;
        infer(payload).catch((error) => postError(payload.id, error));
    };
}());
