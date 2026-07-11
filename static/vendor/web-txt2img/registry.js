import { SDXSAdapter } from './adapters/sdxs.js?v=20260711-browser-clip1';

// CVClass intentionally ships one local model instead of the package's
// network-hosted SD-Turbo and Janus adapters.  Keeping this registry small
// also keeps the worker import graph free of optional tokenizer dependencies.
const REGISTRY = Object.freeze([
    Object.freeze({
        id: 'sdxs-512-dreamshaper',
        displayName: 'SDXS-512-DreamShaper (ONNX Runtime Web)',
        task: 'text-to-image',
        supportedBackends: ['webgpu'],
        notes: 'SDXS single-step inference; fixed 512×512 output; seed supported.',
        sizeBytesApprox: 896 * 1024 * 1024,
        sizeGBApprox: 0.88,
        sizeNotes: 'UNet、VAE decoder 与 CLIP Text Encoder 均在浏览器端运行。',
        createAdapter: () => new SDXSAdapter(),
    }),
]);

function findModel(id) {
    const found = REGISTRY.find((model) => model.id === id);
    if (!found) {
        throw new Error(`Unknown model id: ${id}`);
    }
    return found;
}

function modelInfo(model) {
    const { createAdapter, ...info } = model;
    return info;
}

export function listSupportedModels() {
    return REGISTRY.map(modelInfo);
}

export function getModelInfo(id) {
    return modelInfo(findModel(id));
}

export function getRegistryEntry(id) {
    return findModel(id);
}

export function defaultBackendPreferenceFor(id) {
    findModel(id);
    return ['webgpu'];
}
