import { fetchArrayBufferWithCacheProgress, purgeModelCache } from '../cache.js';
import { ClipTokenizer } from './clip_tokenizer.js?v=20260711-browser-clip1';

const MODEL_ID = 'sdxs-512-dreamshaper';
const DEFAULT_MODEL_BASE_URL = '/api/generative-multimodal/diffusion/model';
const PROMPT_SHAPE = [1, 77, 768];
const PROMPT_LENGTH = 77 * 768;

const SCHEDULER_CONFIG = Object.freeze({
    betaStart: 0.00085,
    betaEnd: 0.012,
    numTrainTimesteps: 1000,
});

const VAE_CONFIG = Object.freeze({
    scalingFactor: 1.0,
});

function buildSingleStepEulerSchedule() {
    const betas = new Float64Array(SCHEDULER_CONFIG.numTrainTimesteps);
    const start = Math.sqrt(SCHEDULER_CONFIG.betaStart);
    const end = Math.sqrt(SCHEDULER_CONFIG.betaEnd);
    const sigmas = new Float64Array(SCHEDULER_CONFIG.numTrainTimesteps);
    let alphaProduct = 1;

    for (let index = 0; index < betas.length; index += 1) {
        const ratio = index / (betas.length - 1);
        const value = start + (end - start) * ratio;
        betas[index] = value * value;
        alphaProduct *= 1 - betas[index];
        sigmas[index] = Math.sqrt((1 - alphaProduct) / alphaProduct);
    }

    const timestep = SCHEDULER_CONFIG.numTrainTimesteps - 1;
    return Object.freeze({ timestep, sigma: sigmas[timestep], sigmaNext: 0 });
}

const SINGLE_STEP_SCHEDULE = buildSingleStepEulerSchedule();

function joinUrl(baseUrl, assetPath) {
    const url = new URL(String(baseUrl), self.location.href);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${assetPath}`;
    return url.href;
}

function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
        value += 0x6D2B79F5;
        let result = Math.imul(value ^ (value >>> 15), 1 | value);
        result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}

function createNoise(shape, sigma, seed) {
    const random = mulberry32(seed ?? 0);
    const size = shape.reduce((product, value) => product * value, 1);
    const values = new Float32Array(size);

    for (let index = 0; index < size; index += 1) {
        const first = Math.max(random(), 1e-7);
        const second = random();
        values[index] = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second) * sigma;
    }
    return values;
}

function scaleEulerInput(values, sigma) {
    const divisor = Math.sqrt(sigma * sigma + 1);
    const scaled = new Float32Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
        scaled[index] = values[index] / divisor;
    }
    return scaled;
}

function eulerSingleStep(sample, noisePrediction, sigma, sigmaNext) {
    const next = new Float32Array(sample.length);
    const delta = sigmaNext - sigma;
    for (let index = 0; index < sample.length; index += 1) {
        next[index] = sample[index] + noisePrediction[index] * delta;
    }
    return next;
}

function progressForAsset(progress, loaded, asset) {
    const bytesDownloaded = progress.loadedBytes + loaded;
    return {
        phase: 'loading',
        message: `正在下载 ${asset}...`,
        pct: Math.min(100, Math.round((bytesDownloaded / progress.totalBytes) * 100)),
        bytesDownloaded,
        totalBytesExpected: progress.totalBytes,
        asset,
        accuracy: 'approximate',
    };
}

async function fetchTextAsset(url, label) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${label} 请求失败（${response.status}）`);
    return response;
}

async function tensorToPngBlob(tensor) {
    const [, channels, height, width] = tensor.dims;
    if (channels !== 3) {
        throw new Error(`VAE 输出通道错误：${channels}`);
    }

    const data = tensor.data;
    const pixels = new Uint8ClampedArray(width * height * 4);
    let outputIndex = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            for (let channel = 0; channel < 3; channel += 1) {
                const value = data[channel * height * width + y * width + x];
                pixels[outputIndex++] = Math.round(Math.max(0, Math.min(1, value / 2 + 0.5)) * 255);
            }
            pixels[outputIndex++] = 255;
        }
    }

    const imageData = new ImageData(pixels, width, height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas 2D context unavailable');
    }
    context.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
}

export class SDXSAdapter {
    constructor() {
        this.id = MODEL_ID;
        this.loaded = false;
        this.ort = null;
        this.sessions = {};
        this.modelBaseUrl = DEFAULT_MODEL_BASE_URL;
        this.tokenizer = null;
    }

    checkSupport(capabilities) {
        return capabilities.webgpu && capabilities.shaderF16 ? ['webgpu'] : [];
    }

    async load(options = {}) {
        const backendPreference = options.backendPreference ?? ['webgpu'];
        if (!backendPreference.includes('webgpu')) {
            return { ok: false, reason: 'backend_unavailable', message: 'SDXS FP16 需要 WebGPU 后端。' };
        }

        // This URL is deliberately a runtime option so CVClass can keep every
        // browser model asset under the page's own prefix-aware API route.
        if (options.modelBaseUrl) {
            this.modelBaseUrl = options.modelBaseUrl;
        }

        try {
            const ortModule = await import(new URL('../../onnxruntime-web/ort.webgpu.bundle.min.mjs', import.meta.url).href);
            this.ort = ortModule.default ?? ortModule;
            this.ort.env.logLevel = 'error';
        } catch (error) {
            return {
                ok: false,
                reason: 'internal_error',
                message: `本地 ONNX Runtime WebGPU 运行时加载失败：${error?.message || error}`,
            };
        }

        const models = {
            unet: { asset: 'unet/model.fp16.onnx', sizeMB: 658 },
            vae_decoder: { asset: 'vae_decoder/model.fp16.onnx', sizeMB: 3 },
            text_encoder: { asset: 'text_encoder/model.fp16.onnx', sizeMB: 235 },
        };
        const totalBytes = Object.values(models).reduce((sum, model) => sum + model.sizeMB * 1024 * 1024, 0);
        const progress = { loadedBytes: 0, totalBytes };
        const sessionOptions = {
            executionProviders: ['webgpu'],
            enableMemPattern: false,
            enableCpuMemArena: false,
            graphOptimizationLevel: 'all',
            logSeverityLevel: 3,
        };

        try {
            options.onProgress?.({
                phase: 'loading',
                message: '正在加载 SDXS 图像模型与浏览器端文本编码器...',
                pct: 0,
                bytesDownloaded: 0,
                totalBytesExpected: totalBytes,
            });

            for (const [key, model] of Object.entries(models)) {
                const expectedBytes = model.sizeMB * 1024 * 1024;
                const buffer = await fetchArrayBufferWithCacheProgress(
                    joinUrl(this.modelBaseUrl, model.asset),
                    this.id,
                    (loaded) => options.onProgress?.(progressForAsset(progress, loaded, model.asset)),
                    expectedBytes,
                );
                progress.loadedBytes += buffer.byteLength;
                this.sessions[key] = await this.ort.InferenceSession.create(buffer, sessionOptions);
            }

            const [vocabularyResponse, mergesResponse] = await Promise.all([
                fetchTextAsset(joinUrl(this.modelBaseUrl, 'tokenizer/vocab.json'), 'CLIP vocabulary'),
                fetchTextAsset(joinUrl(this.modelBaseUrl, 'tokenizer/merges.txt'), 'CLIP merges'),
            ]);
            this.tokenizer = new ClipTokenizer(await vocabularyResponse.json(), await mergesResponse.text());

            this.loaded = true;
            return { ok: true, backendUsed: 'webgpu', bytesDownloaded: progress.loadedBytes };
        } catch (error) {
            await this.unload();
            return { ok: false, reason: 'internal_error', message: `SDXS 模型加载失败：${error?.message || error}` };
        }
    }

    isLoaded() {
        return this.loaded;
    }

    async generate(params = {}) {
        if (!this.loaded) {
            return { ok: false, reason: 'model_not_loaded', message: '请先加载 SDXS 模型。' };
        }

        const { prompt, width = 512, height = 512, signal, onProgress, seed = 0 } = params;
        if (!prompt || !prompt.trim()) {
            return { ok: false, reason: 'unsupported_option', message: '需要提供文本提示词。' };
        }
        if (width !== 512 || height !== 512) {
            return { ok: false, reason: 'unsupported_option', message: 'SDXS 当前仅支持 512×512 图像。' };
        }

        const startedAt = performance.now();
        let embeddingTensor;
        let inputIdsTensor;
        let latentTensor;
        let modelInputTensor;
        let timestepTensor;
        let denoisedTensor;
        let noisePrediction;
        let imageTensor;

        try {
            onProgress?.({ phase: 'encoding', pct: 15, message: '浏览器端 CLIP 正在编码文本提示词...' });
            inputIdsTensor = new this.ort.Tensor('int64', this.tokenizer.encode(prompt.trim()), [1, 77]);
            const textEncoderResult = await this.sessions.text_encoder.run({ input_ids: inputIdsTensor });
            const textEncoderOutput = textEncoderResult.last_hidden_state ?? Object.values(textEncoderResult)[0];
            const embedding = textEncoderOutput?.data instanceof Float32Array
                ? textEncoderOutput.data
                : new Float32Array(textEncoderOutput?.data || []);
            if (embedding.length !== PROMPT_LENGTH) {
                throw new Error(`文本嵌入必须为 [1, 77, 768]，实际长度为 ${embedding.length}`);
            }
            if (signal?.aborted) {
                return { ok: false, reason: 'cancelled' };
            }

            const ort = this.ort;
            embeddingTensor = new ort.Tensor('float32', embedding, PROMPT_SHAPE);
            const latentShape = [1, 4, 64, 64];
            const schedule = SINGLE_STEP_SCHEDULE;
            const latentValues = createNoise(latentShape, schedule.sigma, seed);
            latentTensor = new ort.Tensor('float32', latentValues, latentShape);
            modelInputTensor = new ort.Tensor('float32', scaleEulerInput(latentValues, schedule.sigma), latentShape);
            timestepTensor = new ort.Tensor('float32', Float32Array.of(schedule.timestep), [1]);

            onProgress?.({ phase: 'denoising', pct: 55, message: 'SDXS 单步去噪中...' });
            const unetResult = await this.sessions.unet.run({
                sample: modelInputTensor,
                timestep: timestepTensor,
                encoder_hidden_states: embeddingTensor,
            });
            noisePrediction = unetResult.out_sample ?? unetResult.sample ?? Object.values(unetResult)[0];
            const denoised = eulerSingleStep(latentValues, noisePrediction.data, schedule.sigma, schedule.sigmaNext);
            const vaeInput = new Float32Array(denoised.length);
            for (let index = 0; index < denoised.length; index += 1) {
                vaeInput[index] = denoised[index] / VAE_CONFIG.scalingFactor;
            }
            denoisedTensor = new ort.Tensor('float32', vaeInput, latentShape);

            if (signal?.aborted) {
                return { ok: false, reason: 'cancelled' };
            }

            onProgress?.({ phase: 'decoding', pct: 90, message: '正在解码图像...' });
            const vaeResult = await this.sessions.vae_decoder.run({ latent_sample: denoisedTensor });
            imageTensor = vaeResult.sample ?? Object.values(vaeResult)[0];
            const blob = await tensorToPngBlob(imageTensor);
            const timeMs = performance.now() - startedAt;
            onProgress?.({ phase: 'complete', pct: 100, timeMs });
            return { ok: true, blob, timeMs };
        } catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') {
                return { ok: false, reason: 'cancelled' };
            }
            return { ok: false, reason: 'internal_error', message: error?.message || String(error) };
        } finally {
            imageTensor?.dispose?.();
            noisePrediction?.dispose?.();
            inputIdsTensor?.dispose?.();
            embeddingTensor?.dispose?.();
            latentTensor?.dispose?.();
            modelInputTensor?.dispose?.();
            timestepTensor?.dispose?.();
            denoisedTensor?.dispose?.();
        }
    }

    async unload() {
        await this.sessions.unet?.release?.();
        await this.sessions.vae_decoder?.release?.();
        await this.sessions.text_encoder?.release?.();
        this.sessions = {};
        this.ort = null;
        this.tokenizer = null;
        this.loaded = false;
    }

    async purgeCache() {
        await purgeModelCache(this.id);
    }
}
