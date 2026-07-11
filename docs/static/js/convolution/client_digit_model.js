(function () {
    const MODEL_URL = "/static/assets/data/cnn/mnist_cnn_weights.json";
    const state = {
        loaded: false,
        loadingPromise: null,
        weights: null
    };

    function modelUrl() {
        if (typeof window.cvclassUrl === "function") {
            return window.cvclassUrl(MODEL_URL);
        }
        const basePath = window.CVCLASS_BASE_PATH || "";
        return `${basePath}${MODEL_URL}`;
    }

    function flattenNested(value, target, offset = 0) {
        if (typeof value === "number") {
            target[offset] = value;
            return offset + 1;
        }

        let next = offset;
        for (let i = 0; i < value.length; i += 1) {
            next = flattenNested(value[i], target, next);
        }
        return next;
    }

    function toFloat32Array(value, expectedLength, key) {
        const array = new Float32Array(expectedLength);
        const written = flattenNested(value, array);
        if (written !== expectedLength) {
            throw new Error(`${key} 权重尺寸不匹配`);
        }
        return array;
    }

    function parseWeights(raw) {
        return {
            layer0_weights: toFloat32Array(raw.layer0_weights, 32 * 1 * 3 * 3, "layer0_weights"),
            layer0_bias: toFloat32Array(raw.layer0_bias, 32, "layer0_bias"),
            layer3_weights: toFloat32Array(raw.layer3_weights, 64 * 32 * 3 * 3, "layer3_weights"),
            layer3_bias: toFloat32Array(raw.layer3_bias, 64, "layer3_bias"),
            layer6_weights: toFloat32Array(raw.layer6_weights, 3136 * 128, "layer6_weights"),
            layer6_bias: toFloat32Array(raw.layer6_bias, 128, "layer6_bias"),
            layer8_weights: toFloat32Array(raw.layer8_weights, 128 * 10, "layer8_weights"),
            layer8_bias: toFloat32Array(raw.layer8_bias, 10, "layer8_bias")
        };
    }

    async function loadClientDigitModel() {
        if (state.loaded) return window.clientDigitModel;
        if (state.loadingPromise) return state.loadingPromise;

        state.loadingPromise = fetch(modelUrl(), { cache: "force-cache" })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("模型权重加载失败，请检查 static/assets/data/cnn/mnist_cnn_weights.json");
                }
                return response.json();
            })
            .then((raw) => {
                state.weights = parseWeights(raw);
                state.loaded = true;
                return window.clientDigitModel;
            })
            .catch((error) => {
                state.loaded = false;
                state.loadingPromise = null;
                throw error;
            });

        return state.loadingPromise;
    }

    function normalizeInput(canvas28x28) {
        const input = new Float32Array(28 * 28);
        let index = 0;

        for (let y = 0; y < 28; y += 1) {
            const row = canvas28x28[y];
            if (!row || row.length !== 28) {
                throw new Error("推理输入必须是 28×28 数组");
            }

            for (let x = 0; x < 28; x += 1) {
                const value = Number(row[x]);
                if (!Number.isFinite(value) || value < 0 || value > 1) {
                    throw new Error("推理输入像素必须在 0 到 1 之间");
                }
                input[index] = value;
                index += 1;
            }
        }

        return input;
    }

    function conv2d(input, inChannels, height, width, weights, bias, outChannels) {
        const output = new Float32Array(outChannels * height * width);

        for (let oc = 0; oc < outChannels; oc += 1) {
            const outChannelOffset = oc * height * width;
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    let sum = bias[oc];
                    for (let ic = 0; ic < inChannels; ic += 1) {
                        const inputChannelOffset = ic * height * width;
                        const weightBase = ((oc * inChannels + ic) * 3) * 3;
                        for (let ky = 0; ky < 3; ky += 1) {
                            const iy = y + ky - 1;
                            if (iy < 0 || iy >= height) continue;
                            for (let kx = 0; kx < 3; kx += 1) {
                                const ix = x + kx - 1;
                                if (ix < 0 || ix >= width) continue;
                                sum += input[inputChannelOffset + iy * width + ix] * weights[weightBase + ky * 3 + kx];
                            }
                        }
                    }
                    output[outChannelOffset + y * width + x] = sum;
                }
            }
        }

        return output;
    }

    function reluInPlace(values) {
        for (let i = 0; i < values.length; i += 1) {
            if (values[i] < 0) values[i] = 0;
        }
        return values;
    }

    function maxPool2x2(input, channels, height, width) {
        const outHeight = Math.floor(height / 2);
        const outWidth = Math.floor(width / 2);
        const output = new Float32Array(channels * outHeight * outWidth);

        for (let c = 0; c < channels; c += 1) {
            const inChannelOffset = c * height * width;
            const outChannelOffset = c * outHeight * outWidth;
            for (let y = 0; y < outHeight; y += 1) {
                for (let x = 0; x < outWidth; x += 1) {
                    const inY = y * 2;
                    const inX = x * 2;
                    const base = inChannelOffset + inY * width + inX;
                    output[outChannelOffset + y * outWidth + x] = Math.max(
                        input[base],
                        input[base + 1],
                        input[base + width],
                        input[base + width + 1]
                    );
                }
            }
        }

        return output;
    }

    function dense(input, weights, bias, outSize) {
        const output = new Float32Array(outSize);
        for (let out = 0; out < outSize; out += 1) {
            let sum = bias[out];
            for (let i = 0; i < input.length; i += 1) {
                sum += input[i] * weights[i * outSize + out];
            }
            output[out] = sum;
        }
        return output;
    }

    function softmax(logits) {
        let maxValue = -Infinity;
        for (let i = 0; i < logits.length; i += 1) {
            if (logits[i] > maxValue) maxValue = logits[i];
        }

        const probabilities = new Array(logits.length);
        let sum = 0;
        for (let i = 0; i < logits.length; i += 1) {
            const value = Math.exp(logits[i] - maxValue);
            probabilities[i] = value;
            sum += value;
        }

        let prediction = 0;
        let confidence = 0;
        for (let i = 0; i < probabilities.length; i += 1) {
            probabilities[i] /= sum;
            if (probabilities[i] > confidence) {
                confidence = probabilities[i];
                prediction = i;
            }
        }

        return { prediction, confidence, probabilities };
    }

    function predict(canvas28x28) {
        if (!state.loaded || !state.weights) {
            throw new Error("模型尚未加载");
        }

        const start = performance.now();
        const weights = state.weights;
        const input = normalizeInput(canvas28x28);
        const conv0 = reluInPlace(conv2d(input, 1, 28, 28, weights.layer0_weights, weights.layer0_bias, 32));
        const pool0 = maxPool2x2(conv0, 32, 28, 28);
        const conv1 = reluInPlace(conv2d(pool0, 32, 14, 14, weights.layer3_weights, weights.layer3_bias, 64));
        const pool1 = maxPool2x2(conv1, 64, 14, 14);
        const fc0 = reluInPlace(dense(pool1, weights.layer6_weights, weights.layer6_bias, 128));
        const logits = dense(fc0, weights.layer8_weights, weights.layer8_bias, 10);
        const result = softmax(logits);
        result.elapsed_ms = Math.round((performance.now() - start) * 100) / 100;
        return result;
    }

    function predictDetailed(canvas28x28) {
        if (!state.loaded || !state.weights) {
            throw new Error("模型尚未加载");
        }

        const start = performance.now();
        const weights = state.weights;
        const input = normalizeInput(canvas28x28);
        const conv0Raw = conv2d(input, 1, 28, 28, weights.layer0_weights, weights.layer0_bias, 32);
        const conv0 = reluInPlace(new Float32Array(conv0Raw));
        const pool0 = maxPool2x2(conv0, 32, 28, 28);
        const conv1Raw = conv2d(pool0, 32, 14, 14, weights.layer3_weights, weights.layer3_bias, 64);
        const conv1 = reluInPlace(new Float32Array(conv1Raw));
        const pool1 = maxPool2x2(conv1, 64, 14, 14);
        const fc0Raw = dense(pool1, weights.layer6_weights, weights.layer6_bias, 128);
        const fc0 = reluInPlace(new Float32Array(fc0Raw));
        const logits = dense(fc0, weights.layer8_weights, weights.layer8_bias, 10);
        const result = softmax(logits);
        result.elapsed_ms = Math.round((performance.now() - start) * 100) / 100;
        result.logits = Array.from(logits);
        result.activations = {
            input: Array.from(input),
            conv0_raw: conv0Raw,
            conv0,
            pool0,
            conv1_raw: conv1Raw,
            conv1,
            pool1,
            fc0_raw: fc0Raw,
            fc0,
            logits
        };
        return result;
    }

    window.loadClientDigitModel = loadClientDigitModel;
    window.clientDigitModel = {
        loadClientDigitModel,
        predict,
        predictDetailed
    };
}());
