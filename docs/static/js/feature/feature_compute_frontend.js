(function () {
    "use strict";

    const V = window.FeatureViz;
    if (!V) return;

    const sampleFiles = {
        building: "house.png",
        checker: "cameraman.png",
        book: "brick.png",
        texture: "checkerboard.png",
        peppers: "peppers_color.png"
    };
    const originalComputeDescriptorSet = V.computeDescriptorSet;
    const siftCache = new Map();
    const gaussianKernelCache = new Map();
    const gaussianScratch = new Map();
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function formValue(form, names, fallback) {
        for (const name of names) {
            const value = form.__featureValues
                ? form.__featureValues[name]
                : form.elements[name]?.value;
            if (value !== undefined && value !== "") return value;
        }
        return fallback;
    }

    function snapshotForm(form) {
        const values = {};
        new FormData(form).forEach((value, key) => {
            if (typeof value === "string") values[key] = value;
        });
        return { __featureValues: values };
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function resolveImageSource(form, field = "image") {
        const file = form.querySelector(`input[name="${field}"]`)?.files?.[0];
        if (file) return { src: await readFile(file), filename: file.name };
        const example = form.querySelector("[data-example-input]")?.value || "building";
        const filename = sampleFiles[example] || sampleFiles.building;
        return { src: `${V.assetsBase}${filename}`, filename };
    }

    async function prepareImageSource(source, maxSide = 512) {
        const image = await V.loadImage(source.src || source);
        const originalWidth = image.naturalWidth || image.width;
        const originalHeight = image.naturalHeight || image.height;
        const ratio = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * ratio));
        const height = Math.max(1, Math.round(originalHeight * ratio));
        const canvas = document.createElement("canvas");
        V.setCanvasSize(canvas, width, height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const gray = new Float32Array(width * height);
        for (let index = 0; index < gray.length; index++) {
            const offset = index * 4;
            gray[index] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
        }
        return {
            src: canvas.toDataURL("image/png"),
            filename: source.filename || "frontend-image.png",
            gray,
            rgba,
            width,
            height
        };
    }

    function convolve3x3(source, width, height, kernel) {
        const output = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    const sourceY = clamp(y + ky, 0, height - 1);
                    for (let kx = -1; kx <= 1; kx++) {
                        const sourceX = clamp(x + kx, 0, width - 1);
                        sum += source[sourceY * width + sourceX] * kernel[ky + 1][kx + 1];
                    }
                }
                output[y * width + x] = sum;
            }
        }
        return output;
    }

    function gaussianKernel1d(sigma) {
        const safeSigma = Math.max(0.35, sigma);
        const cacheKey = safeSigma.toFixed(6);
        if (gaussianKernelCache.has(cacheKey)) return gaussianKernelCache.get(cacheKey);
        const radius = Math.max(1, Math.ceil(safeSigma * 2.5));
        const kernel = [];
        let total = 0;
        for (let x = -radius; x <= radius; x++) {
            const value = Math.exp(-(x * x) / (2 * safeSigma * safeSigma));
            kernel.push(value);
            total += value;
        }
        const normalized = kernel.map(value => value / total);
        gaussianKernelCache.set(cacheKey, normalized);
        return normalized;
    }

    function gaussianBlur(source, width, height, sigma) {
        const kernel = gaussianKernel1d(sigma);
        const radius = Math.floor(kernel.length / 2);
        const length = width * height;
        let horizontal = gaussianScratch.get(length);
        if (!horizontal) {
            horizontal = new Float32Array(length);
            gaussianScratch.set(length, horizontal);
            while (gaussianScratch.size > 4) gaussianScratch.delete(gaussianScratch.keys().next().value);
        }
        const output = new Float32Array(length);
        for (let y = 0; y < height; y++) {
            const rowOffset = y * width;
            const interiorStart = Math.min(radius, width);
            const interiorEnd = Math.max(interiorStart, width - radius);
            for (let x = 0; x < interiorStart; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    sum += source[rowOffset + clamp(x + k, 0, width - 1)] * kernel[k + radius];
                }
                horizontal[rowOffset + x] = sum;
            }
            for (let x = interiorStart; x < interiorEnd; x++) {
                let sum = 0;
                const sourceOffset = rowOffset + x - radius;
                for (let kernelIndex = 0; kernelIndex < kernel.length; kernelIndex++) {
                    sum += source[sourceOffset + kernelIndex] * kernel[kernelIndex];
                }
                horizontal[rowOffset + x] = sum;
            }
            for (let x = interiorEnd; x < width; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    sum += source[rowOffset + clamp(x + k, 0, width - 1)] * kernel[k + radius];
                }
                horizontal[rowOffset + x] = sum;
            }
        }
        const interiorStart = Math.min(radius, height);
        const interiorEnd = Math.max(interiorStart, height - radius);
        for (let y = 0; y < interiorStart; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    sum += horizontal[clamp(y + k, 0, height - 1) * width + x] * kernel[k + radius];
                }
                output[y * width + x] = sum;
            }
        }
        for (let y = interiorStart; y < interiorEnd; y++) {
            const outputOffset = y * width;
            const sourceOffset = (y - radius) * width;
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let sourceIndex = sourceOffset + x;
                for (let kernelIndex = 0; kernelIndex < kernel.length; kernelIndex++) {
                    sum += horizontal[sourceIndex] * kernel[kernelIndex];
                    sourceIndex += width;
                }
                output[outputOffset + x] = sum;
            }
        }
        for (let y = interiorEnd; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    sum += horizontal[clamp(y + k, 0, height - 1) * width + x] * kernel[k + radius];
                }
                output[y * width + x] = sum;
            }
        }
        return output;
    }

    function downsample(source, width, height) {
        const nextWidth = Math.max(1, Math.floor(width / 2));
        const nextHeight = Math.max(1, Math.floor(height / 2));
        const output = new Float32Array(nextWidth * nextHeight);
        for (let y = 0; y < nextHeight; y++) {
            for (let x = 0; x < nextWidth; x++) {
                output[y * nextWidth + x] = source[Math.min(height - 1, y * 2) * width + Math.min(width - 1, x * 2)];
            }
        }
        return { data: output, width: nextWidth, height: nextHeight };
    }

    function resizeBilinear(source, width, height, scale) {
        const nextWidth = Math.max(1, Math.round(width * scale));
        const nextHeight = Math.max(1, Math.round(height * scale));
        const output = new Float32Array(nextWidth * nextHeight);
        const xStep = width / nextWidth;
        const yStep = height / nextHeight;
        for (let y = 0; y < nextHeight; y++) {
            const sourceY = y * yStep;
            const y0 = Math.floor(sourceY);
            const y1 = Math.min(height - 1, y0 + 1);
            const dy = sourceY - y0;
            for (let x = 0; x < nextWidth; x++) {
                const sourceX = x * xStep;
                const x0 = Math.floor(sourceX);
                const x1 = Math.min(width - 1, x0 + 1);
                const dx = sourceX - x0;
                output[y * nextWidth + x] =
                    source[y0 * width + x0] * (1 - dx) * (1 - dy) +
                    source[y0 * width + x1] * dx * (1 - dy) +
                    source[y1 * width + x0] * (1 - dx) * dy +
                    source[y1 * width + x1] * dx * dy;
            }
        }
        return { data: output, width: nextWidth, height: nextHeight };
    }

    function extrema(values) {
        let minimum = Infinity;
        let maximum = -Infinity;
        for (let index = 0; index < values.length; index++) {
            const value = Number(values[index]);
            if (!Number.isFinite(value)) continue;
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
        }
        return {
            minimum: Number.isFinite(minimum) ? minimum : 0,
            maximum: Number.isFinite(maximum) ? maximum : 0
        };
    }

    function sampledValues(source, width, height, maxSide = 260) {
        const ratio = Math.min(1, maxSide / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * ratio));
        const targetHeight = Math.max(1, Math.round(height * ratio));
        const values = new Float32Array(targetWidth * targetHeight);
        for (let y = 0; y < targetHeight; y++) {
            const sourceY = Math.min(height - 1, Math.round(y / Math.max(1, targetHeight - 1) * Math.max(0, height - 1)));
            for (let x = 0; x < targetWidth; x++) {
                const sourceX = Math.min(width - 1, Math.round(x / Math.max(1, targetWidth - 1) * Math.max(0, width - 1)));
                values[y * targetWidth + x] = source[sourceY * width + sourceX];
            }
        }
        return { values, width: targetWidth, height: targetHeight };
    }

    function packArray(source, width, height, options = {}) {
        const preview = sampledValues(source, width, height, options.maxSide || 260);
        const transformed = new Float32Array(preview.values.length);
        for (let index = 0; index < transformed.length; index++) {
            let value = preview.values[index];
            if (options.absolute) value = Math.abs(value);
            if (options.positive) value = Math.max(0, value);
            transformed[index] = value;
        }
        let { minimum, maximum } = extrema(transformed);
        if (options.clip) {
            const sorted = Array.from(transformed).filter(Number.isFinite).sort((a, b) => a - b);
            if (sorted.length) {
                minimum = sorted[Math.floor((options.low || 0.01) * (sorted.length - 1))];
                maximum = sorted[Math.floor((options.high || 0.99) * (sorted.length - 1))];
            }
        }
        const scale = Math.abs(maximum - minimum) > 1e-12 ? 255 / (maximum - minimum) : 0;
        const values = Array.from(transformed, value => Math.round(clamp((value - minimum) * scale, 0, 255)));
        const sourceRange = extrema(source);
        return {
            width: preview.width,
            height: preview.height,
            source_width: width,
            source_height: height,
            min: sourceRange.minimum,
            max: sourceRange.maximum,
            values
        };
    }

    function packFloatArray(source, width, height) {
        return { width, height, values: Array.from(source, value => Number.isFinite(value) ? value : 0) };
    }

    function nmsPoints(response, width, height, threshold, radius, maxPoints) {
        const candidates = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = response[y * width + x];
                if (value > threshold) candidates.push({ x, y, response: value });
            }
        }
        candidates.sort((left, right) => right.response - left.response);
        const occupied = new Uint8Array(width * height);
        const corners = [];
        for (const point of candidates) {
            let blocked = false;
            for (let y = Math.max(0, point.y - radius); y <= Math.min(height - 1, point.y + radius) && !blocked; y++) {
                for (let x = Math.max(0, point.x - radius); x <= Math.min(width - 1, point.x + radius); x++) {
                    if (occupied[y * width + x]) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (blocked) continue;
            occupied[point.y * width + point.x] = 1;
            corners.push(point);
            if (corners.length >= maxPoints) break;
        }
        return { candidates, corners };
    }

    function patch(source, width, height, x, y, radius = 2, digits = 2) {
        const rows = [];
        for (let yy = y - radius; yy <= y + radius; yy++) {
            const row = [];
            for (let xx = x - radius; xx <= x + radius; xx++) {
                const value = source[clamp(yy, 0, height - 1) * width + clamp(xx, 0, width - 1)] || 0;
                row.push(Number(value.toFixed(digits)));
            }
            rows.push(row);
        }
        return rows;
    }

    function gaussianWeights(sigma) {
        const rows = [];
        let total = 0;
        for (let y = -2; y <= 2; y++) {
            const row = [];
            for (let x = -2; x <= 2; x++) {
                const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
                row.push(value);
                total += value;
            }
            rows.push(row);
        }
        return rows.map(row => row.map(value => Number((value / total).toFixed(4))));
    }

    function computeCorner(grayImage, method, options) {
        const { gray, width, height } = grayImage;
        const ix = convolve3x3(gray, width, height, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]);
        const iy = convolve3x3(gray, width, height, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]);
        const ix2 = new Float32Array(gray.length);
        const iy2 = new Float32Array(gray.length);
        const ixiy = new Float32Array(gray.length);
        for (let index = 0; index < gray.length; index++) {
            ix2[index] = ix[index] * ix[index];
            iy2[index] = iy[index] * iy[index];
            ixiy[index] = ix[index] * iy[index];
        }
        const sxx = gaussianBlur(ix2, width, height, options.sigma);
        const syy = gaussianBlur(iy2, width, height, options.sigma);
        const sxy = gaussianBlur(ixiy, width, height, options.sigma);
        const det = new Float32Array(gray.length);
        const trace = new Float32Array(gray.length);
        const response = new Float32Array(gray.length);
        let maximum = 0;
        for (let index = 0; index < gray.length; index++) {
            det[index] = sxx[index] * syy[index] - sxy[index] * sxy[index];
            trace[index] = sxx[index] + syy[index];
            const discriminant = Math.sqrt(Math.max(0, trace[index] * trace[index] - 4 * det[index]));
            const value = method === "shi"
                ? Math.max(0, (trace[index] - discriminant) / 2)
                : Math.max(0, det[index] - options.k * trace[index] * trace[index]);
            response[index] = value;
            maximum = Math.max(maximum, value);
        }
        const selected = nmsPoints(
            response,
            width,
            height,
            maximum * options.threshold,
            options.radius,
            options.maxCorners
        );
        return { gray, ix, iy, ix2, iy2, ixiy, sxx, syy, sxy, det, trace, response, ...selected };
    }

    function cornerProbe(result, sigma) {
        const point = result.corners[0] || { x: Math.floor(result.width / 2), y: Math.floor(result.height / 2) };
        const x = point.x;
        const y = point.y;
        const index = y * result.width + x;
        const sxx = result.sxx[index] || 0;
        const syy = result.syy[index] || 0;
        const sxy = result.sxy[index] || 0;
        return {
            x,
            y,
            gray_patch: patch(result.gray, result.width, result.height, x, y, 2, 0),
            ix_patch: patch(result.ix, result.width, result.height, x, y),
            iy_patch: patch(result.iy, result.width, result.height, x, y),
            ix2_patch: patch(result.ix2, result.width, result.height, x, y),
            iy2_patch: patch(result.iy2, result.width, result.height, x, y),
            ixiy_patch: patch(result.ixiy, result.width, result.height, x, y),
            gaussian_weight: gaussianWeights(sigma),
            M: [[Number(sxx.toFixed(3)), Number(sxy.toFixed(3))], [Number(sxy.toFixed(3)), Number(syy.toFixed(3))]],
            det: Number((result.det[index] || 0).toFixed(3)),
            trace: Number((result.trace[index] || 0).toFixed(3)),
            r: Number((result.response[index] || 0).toFixed(3))
        };
    }

    function cornerPayload(grayImage, form, requestedMethods, includeSurface) {
        const sigma = clamp(number(formValue(form, ["sigma", "harris_sigma"], 1.2), 1.2), 0.4, 4);
        const k = clamp(number(formValue(form, ["k", "harris_k"], 0.04), 0.04), 0.02, 0.12);
        const maxCorners = clamp(Math.round(number(formValue(form, ["max_corners"], 500), 500)), 20, 2000);
        const common = { sigma, k, maxCorners };
        const results = {};
        if (requestedMethods.has("harris")) {
            results.harris = computeCorner(grayImage, "harris", {
                ...common,
                threshold: clamp(number(formValue(form, ["threshold_ratio", "harris_threshold"], 0.01), 0.01), 0.0001, 0.8),
                radius: clamp(Math.round(number(formValue(form, ["nms_radius"], 4), 4)), 1, 12)
            });
        }
        if (requestedMethods.has("shi")) {
            results.shi = computeCorner(grayImage, "shi", {
                ...common,
                threshold: clamp(number(formValue(form, ["shi_threshold", "shi_tomasi_threshold"], 0.05), 0.05), 0.0001, 0.8),
                radius: clamp(Math.round(number(formValue(form, ["shi_nms_radius"], 8), 8)), 1, 16)
            });
        }
        const selected = results.harris || results.shi;
        if (!selected) return {};
        selected.width = grayImage.width;
        selected.height = grayImage.height;
        const nms = new Float32Array(grayImage.width * grayImage.height);
        selected.corners.forEach(point => { nms[point.y * grayImage.width + point.x] = point.response; });
        const arrays = {
            gray: packArray(selected.gray, grayImage.width, grayImage.height),
            ix: packArray(selected.ix, grayImage.width, grayImage.height, { absolute: true }),
            iy: packArray(selected.iy, grayImage.width, grayImage.height, { absolute: true }),
            ix2: packArray(selected.ix2, grayImage.width, grayImage.height, { positive: true }),
            iy2: packArray(selected.iy2, grayImage.width, grayImage.height, { positive: true }),
            ixiy: packArray(selected.ixiy, grayImage.width, grayImage.height, { absolute: true }),
            sxx: packArray(selected.sxx, grayImage.width, grayImage.height, { positive: true, clip: true }),
            syy: packArray(selected.syy, grayImage.width, grayImage.height, { positive: true, clip: true }),
            sxy: packArray(selected.sxy, grayImage.width, grayImage.height, { clip: true }),
            nms: packArray(nms, grayImage.width, grayImage.height, { positive: true })
        };
        if (results.harris) {
            arrays.harris_response = packArray(results.harris.response, grayImage.width, grayImage.height, { positive: true, clip: true });
            if (includeSurface) arrays.harris_response_surface = packFloatArray(results.harris.response, grayImage.width, grayImage.height);
        }
        if (results.shi) {
            arrays.shi_tomasi_response = packArray(results.shi.response, grayImage.width, grayImage.height, { positive: true, clip: true });
        }
        const payload = { arrays, probe: cornerProbe(selected, sigma) };
        if (results.harris) payload.harris = {
            corners: results.harris.corners,
            count: results.harris.corners.length,
            candidate_count: results.harris.candidates.length
        };
        if (results.shi) payload.shi_tomasi = {
            corners: results.shi.corners,
            count: results.shi.corners.length,
            candidate_count: results.shi.candidates.length
        };
        return payload;
    }

    function difference(left, right) {
        const output = new Float32Array(Math.min(left.length, right.length));
        for (let index = 0; index < output.length; index++) output[index] = right[index] - left[index];
        return output;
    }

    function buildScaleSpace(grayImage, options) {
        const gaussian = [];
        const dog = [];
        const doubled = options.doubleSize !== false;
        const initial = doubled
            ? resizeBilinear(grayImage.gray, grayImage.width, grayImage.height, 2)
            : { data: grayImage.gray, width: grayImage.width, height: grayImage.height };
        const assumedBlur = doubled ? 1 : 0.5;
        const initialSigma = Math.sqrt(Math.max(options.sigma0 * options.sigma0 - assumedBlur * assumedBlur, 0.01));
        let base = {
            data: gaussianBlur(initial.data, initial.width, initial.height, initialSigma),
            width: initial.width,
            height: initial.height
        };
        const k = Math.pow(2, 1 / options.scales);
        for (let octave = 0; octave < options.octaves; octave++) {
            if (base.width < 16 || base.height < 16) break;
            const layers = [{ data: base.data, width: base.width, height: base.height, sigma: options.sigma0 }];
            const dogLayers = [];
            for (let layer = 1; layer < options.scales + 3; layer++) {
                const sigmaPrevious = options.sigma0 * Math.pow(k, layer - 1);
                const sigmaTotal = sigmaPrevious * k;
                const sigmaIncrement = Math.sqrt(Math.max(sigmaTotal * sigmaTotal - sigmaPrevious * sigmaPrevious, 0.01));
                const previous = layers[layers.length - 1];
                const blurred = gaussianBlur(previous.data, previous.width, previous.height, sigmaIncrement);
                layers.push({ data: blurred, width: base.width, height: base.height, sigma: sigmaTotal });
                dogLayers.push({
                    data: difference(previous.data, blurred),
                    width: base.width,
                    height: base.height
                });
            }
            gaussian.push(layers);
            dog.push(dogLayers);
            const nextBase = layers[Math.min(options.scales, layers.length - 1)];
            base = downsample(nextBase.data, nextBase.width, nextBase.height);
        }
        return { gaussian, dog, baseScale: doubled ? 2 : 1, k };
    }

    function publicSiftPoint(point, oriented = false) {
        const orientation = oriented ? point.orientation || 0 : 0;
        const result = {
            x: Math.round(point.x),
            y: Math.round(point.y),
            x_local: Math.round(point.xLocal),
            y_local: Math.round(point.yLocal),
            octave: point.octave,
            layer: point.layer,
            scale: point.layer,
            sigma: Number((point.sigmaGlobal ?? point.sigma).toFixed(4)),
            response: Number(point.response.toFixed(7)),
            dog: Number(point.dog.toFixed(7)),
            edge_ratio: Number((point.edgeRatio || 0).toFixed(5)),
            orientation: Number(orientation.toFixed(7)),
            orientation_deg: Number((((orientation * 180 / Math.PI) % 360 + 360) % 360).toFixed(3))
        };
        if (Number.isInteger(point.descriptorIndex)) result.descriptor_index = point.descriptorIndex;
        if (oriented) {
            result.orientation_bin = point.orientationBin ?? Math.round(result.orientation_deg / 10) % 36;
            result.orientation_peak = Number((point.orientationPeak || 0).toFixed(7));
            result.relative_peak = Number((point.relativePeak ?? 1).toFixed(5));
        }
        return result;
    }

    function solve3x3(matrix, vector) {
        const augmented = matrix.map((row, index) => row.slice().concat(vector[index]));
        for (let column = 0; column < 3; column++) {
            let pivot = column;
            for (let row = column + 1; row < 3; row++) {
                if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
            }
            if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
            [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
            const divisor = augmented[column][column];
            for (let index = column; index < 4; index++) augmented[column][index] /= divisor;
            for (let row = 0; row < 3; row++) {
                if (row === column) continue;
                const factor = augmented[row][column];
                for (let index = column; index < 4; index++) augmented[row][index] -= factor * augmented[column][index];
            }
        }
        return augmented.map(row => row[3]);
    }

    function refineDogPoint(layers, startX, startY, startLayer, contrastThreshold, edgeThreshold) {
        const width = layers[0].width;
        const height = layers[0].height;
        let x = startX;
        let y = startY;
        let layer = startLayer;
        let offset = [0, 0, 0];
        let gradient = null;
        let hessian = null;
        for (let iteration = 0; iteration < 5; iteration++) {
            if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1 || layer <= 0 || layer >= layers.length - 1) return null;
            const current = layers[layer].data;
            const previous = layers[layer - 1].data;
            const next = layers[layer + 1].data;
            const index = y * width + x;
            const value = current[index];
            const dx = 0.5 * (current[index + 1] - current[index - 1]);
            const dy = 0.5 * (current[index + width] - current[index - width]);
            const ds = 0.5 * (next[index] - previous[index]);
            const dxx = current[index + 1] - 2 * value + current[index - 1];
            const dyy = current[index + width] - 2 * value + current[index - width];
            const dss = next[index] - 2 * value + previous[index];
            const dxy = 0.25 * (
                current[index + width + 1] - current[index + width - 1] -
                current[index - width + 1] + current[index - width - 1]
            );
            const dxs = 0.25 * (next[index + 1] - next[index - 1] - previous[index + 1] + previous[index - 1]);
            const dys = 0.25 * (
                next[index + width] - next[index - width] -
                previous[index + width] + previous[index - width]
            );
            gradient = [dx, dy, ds];
            hessian = [[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]];
            const solution = solve3x3(hessian, gradient.map(value => -value));
            if (!solution || solution.some(value => !Number.isFinite(value))) return null;
            offset = solution;
            if (Math.max(...offset.map(Math.abs)) < 0.5) break;
            x += Math.round(offset[0]);
            y += Math.round(offset[1]);
            layer += Math.round(offset[2]);
            if (iteration === 4) return null;
        }
        const center = layers[layer].data[y * width + x];
        const contrast = center + 0.5 * gradient.reduce((sum, value, index) => sum + value * offset[index], 0);
        if (Math.abs(contrast) < contrastThreshold) return null;
        const dxx = hessian[0][0];
        const dyy = hessian[1][1];
        const dxy = hessian[0][1];
        const determinant = dxx * dyy - dxy * dxy;
        if (determinant <= 1e-10) return null;
        const trace = dxx + dyy;
        const edgeRatio = trace * trace / determinant;
        if (edgeRatio >= edgeThreshold) return null;
        return {
            xLocal: x,
            yLocal: y,
            layer,
            xRefined: x + offset[0],
            yRefined: y + offset[1],
            layerRefined: layer + offset[2],
            offset,
            dog: contrast,
            edgeRatio
        };
    }

    function detectScaleExtrema(scaleSpace, options) {
        const raw = [];
        const survivors = [];
        const contrast = options.contrast * 255;
        const edgeLimit = Math.pow(options.edge + 1, 2) / options.edge;
        scaleSpace.dog.forEach((layers, octave) => {
            const scaleFactor = Math.pow(2, octave) / scaleSpace.baseScale;
            for (let layer = 1; layer <= options.scales && layer < layers.length - 1; layer++) {
                const previous = layers[layer - 1];
                const current = layers[layer];
                const next = layers[layer + 1];
                const width = current.width;
                const height = current.height;
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const centerIndex = y * width + x;
                        const value = current.data[centerIndex];
                        if (Math.abs(value) < contrast * 0.5) continue;
                        const greaterThanCross =
                            value > current.data[centerIndex - 1] &&
                            value > current.data[centerIndex + 1] &&
                            value > current.data[centerIndex - width] &&
                            value > current.data[centerIndex + width];
                        const lessThanCross =
                            value < current.data[centerIndex - 1] &&
                            value < current.data[centerIndex + 1] &&
                            value < current.data[centerIndex - width] &&
                            value < current.data[centerIndex + width];
                        if (!greaterThanCross && !lessThanCross) continue;
                        let isMaximum = greaterThanCross;
                        let isMinimum = lessThanCross;
                        for (let layerOffset = -1; layerOffset <= 1 && (isMaximum || isMinimum); layerOffset++) {
                            const source = layerOffset < 0 ? previous.data : (layerOffset > 0 ? next.data : current.data);
                            for (let yy = -1; yy <= 1 && (isMaximum || isMinimum); yy++) {
                                for (let xx = -1; xx <= 1; xx++) {
                                    if (layerOffset === 0 && xx === 0 && yy === 0) continue;
                                    const neighbor = source[(y + yy) * width + x + xx];
                                    if (value <= neighbor) isMaximum = false;
                                    if (value >= neighbor) isMinimum = false;
                                }
                            }
                        }
                        if (!isMaximum && !isMinimum) continue;
                        raw.push({
                            x: x * scaleFactor,
                            y: y * scaleFactor,
                            xLocal: x, yLocal: y, octave, layer,
                            sigma: options.sigma0 * scaleFactor * Math.pow(scaleSpace.k, layer),
                            response: Math.abs(value), dog: value, edgeRatio: Infinity
                        });
                        if (Math.abs(value) < contrast) continue;
                        const center = centerIndex;
                        const dxx = current.data[center + 1] - 2 * value + current.data[center - 1];
                        const dyy = current.data[center + width] - 2 * value + current.data[center - width];
                        const dxy = (
                            current.data[center + width + 1] - current.data[center + width - 1] -
                            current.data[center - width + 1] + current.data[center - width - 1]
                        ) / 4;
                        const determinant = dxx * dyy - dxy * dxy;
                        const trace = dxx + dyy;
                        const edgeRatio = determinant > 1e-9 ? trace * trace / determinant : Infinity;
                        if (determinant <= 0 || edgeRatio >= edgeLimit) continue;
                        const refined = refineDogPoint(layers, x, y, layer, contrast, edgeLimit);
                        if (!refined) continue;
                        const sigmaLocal = options.sigma0 * Math.pow(scaleSpace.k, refined.layer) * Math.pow(scaleSpace.k, refined.offset[2]);
                        const sigmaGlobal = sigmaLocal * scaleFactor;
                        survivors.push({
                            x: refined.xRefined * scaleFactor,
                            y: refined.yRefined * scaleFactor,
                            xLocal: refined.xLocal,
                            yLocal: refined.yLocal,
                            xRefined: refined.xRefined,
                            yRefined: refined.yRefined,
                            octave,
                            layer: refined.layer,
                            layerRefined: refined.layerRefined,
                            sigma: sigmaLocal,
                            sigmaGlobal,
                            response: Math.abs(refined.dog),
                            dog: refined.dog,
                            edgeRatio: refined.edgeRatio,
                            offset: refined.offset
                        });
                    }
                }
            }
        });
        raw.sort((left, right) => right.response - left.response);
        survivors.sort((left, right) => right.response - left.response);
        const kept = [];
        for (const point of survivors) {
            const radius = Math.max(8, 3 * point.sigmaGlobal);
            const radiusSquared = radius * radius;
            if (kept.some(existing => {
                const dx = existing.x - point.x;
                const dy = existing.y - point.y;
                return dx * dx + dy * dy < radiusSquared;
            })) continue;
            kept.push(point);
            if (kept.length >= options.maxPoints) break;
        }
        return { raw, survivors, kept };
    }

    function layerGradients(layer) {
        const magnitude = new Float32Array(layer.data.length);
        const orientation = new Float32Array(layer.data.length);
        for (let y = 1; y < layer.height - 1; y++) {
            for (let x = 1; x < layer.width - 1; x++) {
                const index = y * layer.width + x;
                const dx = layer.data[index + 1] - layer.data[index - 1];
                const dy = layer.data[index + layer.width] - layer.data[index - layer.width];
                magnitude[index] = Math.sqrt(dx * dx + dy * dy);
                orientation[index] = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
            }
        }
        return { magnitude, orientation, width: layer.width, height: layer.height };
    }

    function orientationCandidates(point, gradients) {
        const histogram = new Float32Array(36);
        const x0 = point.xRefined ?? point.xLocal;
        const y0 = point.yRefined ?? point.yLocal;
        const radius = Math.max(4, Math.min(24, Math.round(4.5 * point.sigma)));
        const weightSigmaSquared = Math.pow(1.5 * point.sigma, 2);
        for (let y = Math.max(1, point.yLocal - radius); y <= Math.min(gradients.height - 2, point.yLocal + radius); y++) {
            for (let x = Math.max(1, point.xLocal - radius); x <= Math.min(gradients.width - 2, point.xLocal + radius); x++) {
                const dx = x - x0;
                const dy = y - y0;
                const weight = Math.exp(-(dx * dx + dy * dy) / (2 * weightSigmaSquared));
                const index = y * gradients.width + x;
                const bin = Math.round(gradients.orientation[index] / (Math.PI * 2) * 36) % 36;
                histogram[bin] += gradients.magnitude[index] * weight;
            }
        }
        const smoothed = new Float32Array(36);
        for (let index = 0; index < 36; index++) {
            smoothed[index] =
                histogram[index] * 0.375 +
                (histogram[(index + 35) % 36] + histogram[(index + 1) % 36]) * 0.25 +
                (histogram[(index + 34) % 36] + histogram[(index + 2) % 36]) * 0.0625;
        }
        const maximum = Math.max(...smoothed);
        if (maximum < 1e-8) return [];
        const candidates = [];
        for (let index = 0; index < 36; index++) {
            const previous = smoothed[(index + 35) % 36];
            const current = smoothed[index];
            const next = smoothed[(index + 1) % 36];
            if (current < previous || current < next || current < maximum * 0.8) continue;
            const denominator = previous - 2 * current + next;
            const offset = Math.abs(denominator) > 1e-8
                ? clamp(0.5 * (previous - next) / denominator, -0.5, 0.5)
                : 0;
            candidates.push({
                ...point,
                orientation: ((index + offset) / 36 * Math.PI * 2 + Math.PI * 2) % (Math.PI * 2),
                orientationPeak: current,
                relativePeak: current / maximum,
                orientationBin: index
            });
        }
        return candidates.sort((left, right) => right.orientationPeak - left.orientationPeak);
    }

    function trilinearVote(descriptor, xBin, yBin, orientationBin, value) {
        const x0 = Math.floor(xBin);
        const y0 = Math.floor(yBin);
        const orientation0 = Math.floor(orientationBin);
        const dx = xBin - x0;
        const dy = yBin - y0;
        const orientationOffset = orientationBin - orientation0;
        for (let oy = 0; oy <= 1; oy++) {
            const y = y0 + oy;
            if (y < 0 || y >= 4) continue;
            const weightedY = value * (oy ? dy : 1 - dy);
            for (let ox = 0; ox <= 1; ox++) {
                const x = x0 + ox;
                if (x < 0 || x >= 4) continue;
                const weightedXY = weightedY * (ox ? dx : 1 - dx);
                for (let oo = 0; oo <= 1; oo++) {
                    const orientation = (orientation0 + oo + 8) % 8;
                    descriptor[(y * 4 + x) * 8 + orientation] += weightedXY * (oo ? orientationOffset : 1 - orientationOffset);
                }
            }
        }
    }

    function makeSiftDescriptor(gradients, point) {
        const descriptor = new Float64Array(128);
        const vectors = [];
        const x0 = point.xRefined ?? point.xLocal;
        const y0 = point.yRefined ?? point.yLocal;
        const cos = Math.cos(point.orientation);
        const sin = Math.sin(point.orientation);
        const scaleFactor = point.sigma / 1.6;
        const halfSize = Math.max(8, Math.min(24, Math.round(8 * scaleFactor)));
        const cellSize = halfSize / 2;
        const descriptorSigmaSquared = Math.pow(halfSize / 2, 2);
        for (let y = Math.max(1, point.yLocal - halfSize); y <= Math.min(gradients.height - 2, point.yLocal + halfSize); y++) {
            for (let x = Math.max(1, point.xLocal - halfSize); x <= Math.min(gradients.width - 2, point.xLocal + halfSize); x++) {
                const dx = x - x0;
                const dy = y - y0;
                const rotatedX = cos * dx + sin * dy;
                const rotatedY = -sin * dx + cos * dy;
                const xBin = rotatedX / cellSize + 1.5;
                const yBin = rotatedY / cellSize + 1.5;
                if (xBin < -1 || xBin > 4 || yBin < -1 || yBin > 4) continue;
                const index = y * gradients.width + x;
                const relative = (gradients.orientation[index] - point.orientation + Math.PI * 2) % (Math.PI * 2);
                const orientationBin = relative / (Math.PI * 2) * 8;
                const weight = Math.exp(-(rotatedX * rotatedX + rotatedY * rotatedY) / (2 * descriptorSigmaSquared));
                const value = gradients.magnitude[index] * weight;
                trilinearVote(descriptor, xBin, yBin, orientationBin, value);
                vectors.push({
                    dx,
                    dy,
                    rx: rotatedX,
                    ry: rotatedY,
                    angle: gradients.orientation[index] * 180 / Math.PI,
                    mag: gradients.magnitude[index],
                    weight,
                    xbin: xBin,
                    ybin: yBin,
                    obin: orientationBin
                });
            }
        }
        let norm = Math.sqrt(descriptor.reduce((sum, value) => sum + value * value, 0));
        if (norm < 1e-8) return null;
        for (let index = 0; index < descriptor.length; index++) descriptor[index] = Math.min(0.2, descriptor[index] / norm);
        norm = Math.sqrt(descriptor.reduce((sum, value) => sum + value * value, 0));
        if (norm < 1e-8) return null;
        for (let index = 0; index < descriptor.length; index++) descriptor[index] /= norm;
        return { descriptor: Array.from(descriptor), patchVectors: vectors.slice(0, 300) };
    }

    function dogProbe(scaleSpace) {
        if (!scaleSpace.dog.length || scaleSpace.dog[0].length < 3) return null;
        const octave = Math.min(1, scaleSpace.dog.length - 1);
        const layers = scaleSpace.dog[octave];
        const layer = Math.min(2, layers.length - 2);
        const current = layers[layer];
        let bestIndex = current.width + 1;
        for (let index = 0; index < current.data.length; index++) {
            if (Math.abs(current.data[index]) > Math.abs(current.data[bestIndex] || 0)) bestIndex = index;
        }
        const y = clamp(Math.floor(bestIndex / current.width), 1, current.height - 2);
        const x = clamp(bestIndex % current.width, 1, current.width - 2);
        return {
            octave,
            layer,
            x,
            y,
            prev: patch(layers[layer - 1].data, current.width, current.height, x, y, 1, 5),
            current: patch(current.data, current.width, current.height, x, y, 1, 5),
            next: patch(layers[layer + 1].data, current.width, current.height, x, y, 1, 5),
            center: Number(current.data[y * current.width + x].toFixed(6))
        };
    }

    function computeSift(grayImage, options = {}) {
        const started = performance.now();
        const profile = {};
        const settings = {
            octaves: clamp(Math.round(number(options.octaves, 3)), 1, 4),
            scales: clamp(Math.round(number(options.scales, 3)), 3, 6),
            sigma0: clamp(number(options.sigma0, 1.6), 0.8, 2.2),
            contrast: clamp(number(options.contrast, 0.03), 0.005, 0.2),
            edge: clamp(number(options.edge, 10), 5, 20),
            maxPoints: clamp(Math.round(number(options.maxPoints, 500)), 20, 1000),
            doubleSize: options.doubleSize !== false
        };
        let stageStarted = performance.now();
        const scaleSpace = options.precomputed?.scaleSpace || buildScaleSpace(grayImage, settings);
        profile.scaleSpaceMs = performance.now() - stageStarted;
        stageStarted = performance.now();
        const detected = options.precomputed ? {
            raw: options.precomputed.raw,
            survivors: options.precomputed.survivors,
            kept: options.precomputed.keypoints
        } : detectScaleExtrema(scaleSpace, settings);
        profile.extremaMs = performance.now() - stageStarted;
        if (options.descriptor === false) {
            return {
                settings,
                scaleSpace,
                raw: detected.raw,
                survivors: detected.survivors,
                keypoints: detected.kept,
                oriented: [],
                descriptors: [],
                profile,
                elapsedMs: performance.now() - started
            };
        }
        stageStarted = performance.now();
        const gradientCache = scaleSpace.gaussian.map(layers => new Array(layers.length));
        const gradientsFor = point => {
            const octaveCache = gradientCache[point.octave];
            if (!octaveCache) return null;
            if (!octaveCache[point.layer]) {
                const layer = scaleSpace.gaussian[point.octave]?.[point.layer];
                if (!layer) return null;
                octaveCache[point.layer] = layerGradients(layer);
            }
            return octaveCache[point.layer];
        };
        profile.gradientSetupMs = performance.now() - stageStarted;
        stageStarted = performance.now();
        const oriented = [];
        detected.kept.forEach(point => {
            const gradients = gradientsFor(point);
            if (gradients) oriented.push(...orientationCandidates(point, gradients));
        });
        profile.orientationMs = performance.now() - stageStarted;
        stageStarted = performance.now();
        const descriptors = [];
        if (options.descriptor !== false) {
            const validOriented = [];
            oriented.forEach(point => {
                const descriptor = makeSiftDescriptor(gradientsFor(point), point);
                if (!descriptor) return;
                point.descriptorIndex = descriptors.length;
                descriptors.push(descriptor);
                validOriented.push(point);
            });
            oriented.length = 0;
            oriented.push(...validOriented);
        }
        profile.descriptorMs = performance.now() - stageStarted;
        return {
            settings,
            scaleSpace,
            raw: detected.raw,
            survivors: detected.survivors,
            keypoints: detected.kept,
            oriented,
            descriptors,
            profile,
            elapsedMs: performance.now() - started
        };
    }

    function imageSignature(grayImage) {
        const values = grayImage.gray;
        if (!values?.length) return `${grayImage.width}x${grayImage.height}:0`;
        let hash = 2166136261;
        const step = Math.max(1, Math.floor(values.length / 257));
        for (let index = 0; index < values.length; index += step) {
            hash ^= Math.round(values[index]);
            hash = Math.imul(hash, 16777619);
        }
        return `${grayImage.width}x${grayImage.height}:${hash >>> 0}`;
    }

    function siftCacheKey(grayImage, options) {
        return [
            imageSignature(grayImage),
            options.octaves,
            options.scales,
            options.sigma0,
            options.contrast,
            options.edge,
            options.maxPoints,
            options.doubleSize !== false
        ].join(":");
    }

    function computeSiftCached(grayImage, options = {}) {
        const key = siftCacheKey(grayImage, options);
        const cached = siftCache.get(key);
        if (cached && (options.descriptor === false || cached.descriptors.length)) return cached;
        const result = computeSift(grayImage, cached ? { ...options, precomputed: cached } : options);
        siftCache.set(key, result);
        while (siftCache.size > 2) siftCache.delete(siftCache.keys().next().value);
        return result;
    }

    function siftPayload(grayImage, form, descriptor) {
        const result = computeSiftCached(grayImage, {
            octaves: formValue(form, ["octave", "sift_octaves"], 3),
            scales: formValue(form, ["scale", "sift_scales"], 3),
            sigma0: formValue(form, ["sigma0", "sift_sigma"], 1.6),
            contrast: formValue(form, ["contrast_threshold", "sift_contrast_threshold"], 0.03),
            edge: formValue(form, ["edge_threshold", "sift_edge_threshold"], 10),
            maxPoints: formValue(form, ["max_points", "max_sift"], 500),
            descriptor
        });
        const pointsExtrema = result.raw.map(point => publicSiftPoint(point));
        const pointsEdge = result.survivors.map(point => publicSiftPoint(point));
        const pointsKeypoints = result.keypoints.map(point => publicSiftPoint(point));
        const extended = descriptor ? result.oriented.map(point => publicSiftPoint(point, true)) : [];
        let selected = null;
        if (descriptor && extended.length && result.descriptors.length) {
            selected = {
                ...extended[0],
                descriptor128: result.descriptors[0].descriptor,
                patch_vectors: result.descriptors[0].patchVectors
            };
        }
        if (!result.packedPyramid) {
            result.packedPyramid = {
                gaussian: result.scaleSpace.gaussian.map((layers, octave) => layers.slice(0, 6).map((layer, index) => ({
                    octave,
                    layer: index,
                    array: packArray(layer.data, layer.width, layer.height, { maxSide: 110 })
                }))),
                dog: result.scaleSpace.dog.map((layers, octave) => layers.slice(0, 5).map((layer, index) => ({
                    octave,
                    layer: index,
                    array: packArray(layer.data, layer.width, layer.height, { maxSide: 110, absolute: true })
                }))),
                probe: dogProbe(result.scaleSpace)
            };
        }
        return {
            sift: {
                points_extrema: pointsExtrema,
                points_edge: pointsEdge,
                points_keypoints: pointsKeypoints,
                extended_points: extended,
                oriented_keypoints: extended,
                keypoints: descriptor ? extended : pointsKeypoints,
                count: descriptor ? extended.length : pointsKeypoints.length,
                counts: {
                    raw_extrema: pointsExtrema.length,
                    contrast_survivors: pointsEdge.length,
                    edge_survivors: pointsEdge.length,
                    kept: pointsKeypoints.length,
                    oriented: extended.length
                },
                selected
            },
            pyramid: result.packedPyramid,
            _frontendSift: result
        };
    }

    async function computeFeatureForm(form, options = {}) {
        if (V.computeMode !== "frontend") return V.postForm(form, options.endpoint || "/api/feature-detect");
        const started = performance.now();
        const capturedForm = snapshotForm(form);
        const sourcePromise = resolveImageSource(form, options.field || "image");
        const mode = options.mode || formValue(capturedForm, ["mode"], "compare");
        const requested = new Set(String(options.methods || formValue(capturedForm, ["methods"], "")).split(",").filter(Boolean));
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const maxSide = clamp(Math.round(number(formValue(capturedForm, ["max_side"], 512), 512)), 160, 768);
        const source = await sourcePromise;
        const image = await prepareImageSource(source, maxSide);
        const response = {
            success: true,
            mode,
            meta: { filename: image.filename, width: image.width, height: image.height },
            images: { original: image.src }
        };
        const cornerAlgorithm = String(formValue(capturedForm, ["corner_algorithm"], "harris")).toLowerCase();
        let cornerMethods = new Set();
        if (mode === "corner" || mode === "harris") {
            if (cornerAlgorithm !== "fast") cornerMethods.add(cornerAlgorithm.startsWith("shi") ? "shi" : "harris");
        } else if (mode === "compare") {
            if (!requested.size || requested.has("harris") || requested.has("combo")) cornerMethods.add("harris");
            if (!requested.size || requested.has("shi")) cornerMethods.add("shi");
        }
        if (cornerMethods.size) Object.assign(response, cornerPayload(image, capturedForm, cornerMethods, mode === "corner" || mode === "harris"));
        const includeSift = ["sift", "sift_scale", "sift_descriptor"].includes(mode) ||
            (mode === "compare" && (!requested.size || requested.has("sift") || requested.has("combo")));
        if (includeSift) {
            const descriptorFlag = String(formValue(capturedForm, ["descriptor"], "")).toLowerCase();
            const descriptor = mode === "compare" || mode === "sift_descriptor" ||
                (mode === "sift" && ["1", "true", "yes", "on"].includes(descriptorFlag));
            Object.assign(response, siftPayload(image, capturedForm, descriptor));
            delete response._frontendSift;
        }
        if (mode === "compare") response.available_methods = requested.size
            ? Array.from(requested).sort()
            : ["harris", "shi", "fast", "sift", "combo"];
        response.meta.elapsed_ms = Number((performance.now() - started).toFixed(2));
        return response;
    }

    function computeSiftDescriptorSet(grayImage, options = {}) {
        const result = computeSiftCached(grayImage, {
            octaves: options.octaves || 3,
            scales: options.scales || 3,
            sigma0: options.sigma0 || 1.6,
            contrast: options.contrast || 0.03,
            edge: options.edge || 10,
            maxPoints: options.maxKeypoints || 500,
            descriptor: true
        });
        return {
            algorithm: "sift",
            keypoints: result.oriented.map(point => publicSiftPoint(point, true)),
            descriptors: result.descriptors.map(item => item.descriptor),
            descriptorType: "float",
            descriptorDim: "128 float",
            distanceType: "L2",
            elapsedMs: result.elapsedMs
        };
    }

    V.computeMode = V.root.dataset.computeMode || "backend";
    V.resolveImageSource = resolveImageSource;
    V.prepareImageSource = prepareImageSource;
    V.computeFeatureForm = computeFeatureForm;
    V.computeSift = computeSift;
    V.computeSiftDescriptorSet = computeSiftDescriptorSet;
    V.computeDescriptorSet = function (grayImage, algorithm, options = {}) {
        return algorithm === "sift"
            ? computeSiftDescriptorSet(grayImage, options)
            : originalComputeDescriptorSet(grayImage, algorithm, options);
    };
})();
