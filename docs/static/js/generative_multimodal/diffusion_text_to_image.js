const MODEL_ID = "sdxs-512-dreamshaper";
const MODEL_REVISION = "sdxs-512-dreamshaper-20260711-browser-clip1";
const VENDOR_MODULE_PATH = "/static/vendor/web-txt2img/index.js?v=20260711-browser-clip1";
const MODEL_BASE_PATH = "https://huggingface.co/blinkfy/CVClass-SDXS-ONNX/resolve/1fd4b780fb0ead12bbf73f60b90ab2f5d03b53a5";

let runtimeModulePromise = null;
let client = null;
let clientPromise = null;
let clientEpoch = 0;
let capabilitiesPromise = null;
let modelLoadPromise = null;
let modelLoaded = false;
let generationTask = null;

function normalizeFailure(error, fallback) {
    const message = String(error?.message || fallback || "SDXS 文生图推理失败").trim();
    return message || fallback || "SDXS 文生图推理失败";
}

function normalizeResult(result, fallbackMessage) {
    if (!result || typeof result !== "object") {
        throw new Error(fallbackMessage || "模型未返回有效结果。");
    }
    if (result.ok === false) {
        if (result.reason === "cancelled") {
            throw new Error("已取消当前图片生成");
        }
        throw new Error(result.message || fallbackMessage || "模型调用失败。");
    }
    return result;
}

function appUrl(path) {
    if (/^https?:\/\//i.test(path)) return new URL(path).href;
    const relativePath = typeof window.cvclassUrl === "function"
        ? window.cvclassUrl(path)
        : path;
    return new URL(relativePath, window.location.href).href;
}

async function getRuntimeModule() {
    if (!runtimeModulePromise) {
        runtimeModulePromise = import(appUrl(VENDOR_MODULE_PATH)).catch((error) => {
            runtimeModulePromise = null;
            throw new Error(normalizeFailure(error, "本地文生图 Worker 运行时加载失败。"));
        });
    }
    return runtimeModulePromise;
}

async function getClient() {
    if (client) return client;
    if (!clientPromise) {
        const epoch = clientEpoch;
        clientPromise = getRuntimeModule()
            .then((runtime) => {
                const nextClient = runtime.Txt2ImgWorkerClient.createDefault();
                if (epoch !== clientEpoch) {
                    nextClient.terminate?.();
                    throw new Error("文生图运行时已释放。");
                }
                client = nextClient;
                return nextClient;
            })
            .catch((error) => {
                if (epoch === clientEpoch) clientPromise = null;
                throw error;
            });
    }
    return clientPromise;
}

function isWebGpuDeviceError(error) {
    const message = String(error?.message || error || "");
    return /WebGPU validation failed|Invalid Buffer|device lost|GPUDevice/i.test(message);
}

function resetAfterWebGpuError(error) {
    if (!isWebGpuDeviceError(error)) return false;
    disposeTextToImage();
    return true;
}

export async function detectTextToImageCapabilities() {
    if (!capabilitiesPromise) {
        capabilitiesPromise = getClient()
            .then((workerClient) => workerClient.detect())
            .catch((error) => {
                capabilitiesPromise = null;
                throw new Error(normalizeFailure(error, "无法检测当前浏览器的文生图推理能力。"));
            });
    }
    return capabilitiesPromise;
}

export async function preloadTextToImageModel(onProgress) {
    const workerClient = await getClient();
    if (modelLoaded) return { ok: true };

    if (!modelLoadPromise) {
        modelLoadPromise = (async () => {
            const caps = await detectTextToImageCapabilities();
            if (!caps?.webgpu || !caps?.shaderF16) {
                throw new Error("当前浏览器不支持 WebGPU / shader-f16，无法运行 SDXS 前端推理。");
            }

            const result = await workerClient.load(
                MODEL_ID,
                {
                    backendPreference: ["webgpu"],
                    modelBaseUrl: appUrl(`${MODEL_BASE_PATH}?v=${encodeURIComponent(MODEL_REVISION)}`)
                },
                onProgress
            );
            normalizeResult(result, "SDXS 模型加载失败。");
            modelLoaded = true;
            return result;
        })().catch((error) => {
            modelLoadPromise = null;
            throw error;
        });
    }

    try {
        return await modelLoadPromise;
    } finally {
        if (modelLoaded) modelLoadPromise = null;
    }
}

export function cancelTextToImageGeneration() {
    generationTask?.abort?.();
}

export async function textToImage(prompt, onProgress, options = {}) {
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) throw new Error("Prompt 不能为空。");
    if (generationTask) throw new Error("已有图像生成任务正在运行。");

    await preloadTextToImageModel(onProgress);
    const workerClient = await getClient();
    const seed = Number.isInteger(options.seed)
        ? options.seed
        : Math.floor(Math.random() * 2147483647);
    const task = workerClient.generate(
        {
            model: MODEL_ID,
            prompt: cleanPrompt,
            width: options.width || 512,
            height: options.height || 512,
            seed
        },
        onProgress,
        { busyPolicy: "reject" }
    );
    generationTask = task;

    try {
        const result = normalizeResult(await task.promise, "SDXS 图像生成失败。");
        if (!result.blob) throw new Error("SDXS 未返回图像数据。");
        return result.blob;
    } catch (error) {
        if (resetAfterWebGpuError(error)) {
            throw new Error("WebGPU 资源异常，推理引擎已重置，请再次点击生成。");
        }
        if (String(error?.message || "").includes("cancelled")) {
            throw new Error("已取消当前图片生成。");
        }
        throw new Error(normalizeFailure(error, "SDXS 图像生成失败。"));
    } finally {
        generationTask = null;
    }
}

export function disposeTextToImage() {
    generationTask?.abort?.();
    generationTask = null;
    clientEpoch += 1;
    clientPromise = null;
    client?.terminate?.();
    client = null;
    capabilitiesPromise = null;
    modelLoadPromise = null;
    modelLoaded = false;
}
