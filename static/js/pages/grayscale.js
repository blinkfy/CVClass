const els = {
    imageInput: document.getElementById("imageInput"),
    dropZone: document.getElementById("dropZone"),
    sampleStrip: document.getElementById("sampleStrip"),
    reloadSamplesButton: document.getElementById("reloadSamplesButton"),
    operationList: document.getElementById("operationList"),
    paramsArea: document.getElementById("paramsArea"),
    statusTask: document.getElementById("statusTask"),
    statusSize: document.getElementById("statusSize"),
    statusTime: document.getElementById("statusTime"),
    compareToggle: document.getElementById("compareToggle"),
    downloadButton: document.getElementById("downloadButton"),
    messageBar: document.getElementById("messageBar"),
    compareStage: document.getElementById("compareStage"),
    compareHandle: document.getElementById("compareHandle"),
    compareEmpty: document.getElementById("compareEmpty"),
    beforeImage: document.getElementById("beforeImage"),
    afterImage: document.getElementById("afterImage"),
    resultLabel: document.getElementById("resultLabel"),
    previewStrip: document.getElementById("previewStrip"),
    histogramChart: document.getElementById("histogramChart"),
    infoName: document.getElementById("infoName"),
    infoResolution: document.getElementById("infoResolution"),
    infoChannels: document.getElementById("infoChannels"),
    infoSize: document.getElementById("infoSize"),
    infoPixels: document.getElementById("infoPixels"),
    infoTask: document.getElementById("infoTask"),
    infoTimeStat: document.getElementById("infoTimeStat"),
    historyList: document.getElementById("historyList"),
    clearHistoryButton: document.getElementById("clearHistoryButton"),
    notesPanel: document.getElementById("notesPanel"),
    probeCoord: document.getElementById("probeCoord"),
    probeR: document.getElementById("probeR"),
    probeG: document.getElementById("probeG"),
    probeB: document.getElementById("probeB"),
    probeGray: document.getElementById("probeGray"),
    probeHsv: document.getElementById("probeHsv")
};

const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const resultCache = new Map();
const historyRows = [];
const histogramChart = window.echarts ? echarts.init(els.histogramChart) : null;

const samples = [
    { id: "house", name: "House", src: cvclassUrl("/static/assets/img/house.png") },
    { id: "camera", name: "Camera", src: cvclassUrl("/static/assets/img/cameraman.png") },
    { id: "traffic", name: "Street", src: cvclassUrl("/static/assets/img/bangkok_traffic.jpg") },
    { id: "peppers", name: "Peppers", src: cvclassUrl("/static/assets/img/peppers_color.png") },
    { id: "lena", name: "Lena", src: cvclassUrl("/static/assets/img/lena_color_512.png") }
];
const defaultSampleId = "peppers";

const taskGroups = [
    { id: "grayscale", label: "灰度化", operation: "grayscale" },
    { id: "binary", label: "二值化", operation: "binary" },
    { id: "channel", label: "RGB 通道分离", operation: "channel" },
    { id: "hsv", label: "HSV 颜色空间", operation: "hsv" },
    { id: "equalize", label: "直方图均衡化", operation: "equalize" },
    { id: "invert", label: "反色", operation: "invert" },
    { id: "geometry", label: "几何变换（翻转 / 旋转）", operation: "flip_horizontal" }
];

const operationText = {
    grayscale: "灰度化",
    binary: "二值化",
    channel: "RGB 通道分离",
    hsv: "HSV 颜色空间",
    equalize: "直方图均衡化",
    invert: "反色",
    flip_horizontal: "水平翻转",
    flip_vertical: "垂直翻转",
    rotate_90: "左旋 90°",
    rotate_right_90: "右旋 90°"
};

const methodText = {
    weighted: "加权平均法",
    average: "平均值法",
    max: "最大值法",
    min: "最小值法"
};

const channelText = {
    red: "R 通道",
    green: "G 通道",
    blue: "B 通道"
};

const previewDefinitions = [
    { key: "original", title: "原图", desc: "RGB" },
    { key: "grayscale", title: "灰度化", desc: "当前任务" },
    { key: "binary", title: "二值化", desc: "阈值分割" },
    { key: "channel-red", title: "R 通道", desc: "红色贡献" },
    { key: "channel-green", title: "G 通道", desc: "绿色贡献" },
    { key: "channel-blue", title: "B 通道", desc: "蓝色贡献" },
    { key: "equalize", title: "均衡化", desc: "对比度增强" },
    { key: "invert", title: "反色", desc: "RGB 取反" }
];

const state = {
    selectedTask: "grayscale",
    previewKey: "grayscale",
    method: "weighted",
    binaryMode: "manual",
    threshold: 128,
    channel: "red",
    channelMode: "color",
    hsvChannel: "h",
    equalizeMode: "gray",
    equalizeCompare: "image",
    invertMode: "rgb",
    geometryOperation: "flip_horizontal",
    selectedFile: null,
    imageUrl: "",
    filename: "-",
    fileSize: "-",
    fileType: "-",
    imageWidth: 0,
    imageHeight: 0,
    originalHistogram: new Array(256).fill(0),
    currentResult: null,
    lastPixel: null,
    activeSampleId: defaultSampleId,
    requestId: 0,
    draggingCompare: false,
    compareMode: true
};

const previewWarmupKeys = ["grayscale", "binary", "channel-red", "channel-green", "channel-blue", "equalize", "invert"];

function formatFileSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), wait);
    };
}

function computeMode(feature) {
    return window.CVCLASS_COMPUTE_CONFIG?.[feature] || "backend";
}

function clipByte(value) {
    return Math.trunc(Math.min(255, Math.max(0, value)));
}

function grayValue(r, g, b, method = state.method) {
    if (method === "average") return clipByte((r + g + b) / 3);
    if (method === "max") return Math.max(r, g, b);
    if (method === "min") return Math.min(r, g, b);
    return clipByte(0.299 * r + 0.587 * g + 0.114 * b);
}

function rgbToHsv(r, g, b) {
    const hsv = rgbToHsvRaw(r, g, b);
    return {
        h: Math.round(hsv.h),
        s: Number((hsv.s * 100).toFixed(1)),
        v: Number((hsv.v * 100).toFixed(1))
    };
}

function rgbToHsvRaw(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    return {
        h,
        s,
        v: max
    };
}

function histogramFromPixels(imageData, method = state.method) {
    const histogram = new Array(256).fill(0);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        histogram[grayValue(data[i], data[i + 1], data[i + 2], method)] += 1;
    }
    return histogram;
}

function histogramStats(histogram) {
    const total = histogram.reduce((sum, value) => sum + value, 0);
    if (!total) {
        return { avg: 0, min: 0, max: 0, std: 0, peak: 0, total: 0 };
    }

    let sum = 0;
    let min = 255;
    let max = 0;
    let peak = 0;
    let peakCount = -1;
    histogram.forEach((count, value) => {
        if (!count) return;
        sum += value * count;
        min = Math.min(min, value);
        max = Math.max(max, value);
        if (count > peakCount) {
            peak = value;
            peakCount = count;
        }
    });

    const avg = sum / total;
    let variance = 0;
    histogram.forEach((count, value) => {
        variance += ((value - avg) ** 2) * count;
    });

    return {
        avg,
        min,
        max,
        std: Math.sqrt(variance / total),
        peak,
        total
    };
}

function makeHistogramFromGray(grayArray) {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < grayArray.length; i += 1) {
        histogram[grayArray[i]] += 1;
    }
    return histogram;
}

function otsuThreshold(grayArray) {
    const histogram = makeHistogramFromGray(grayArray).map((value) => Number(value));
    const total = grayArray.length || 1;
    const sumTotal = histogram.reduce((sum, value, index) => sum + index * value, 0);
    let sumBackground = 0;
    let weightBackground = 0;
    let maxVariance = -1;
    let threshold = 128;

    for (let value = 0; value < 256; value += 1) {
        weightBackground += histogram[value];
        if (weightBackground === 0) continue;

        const weightForeground = total - weightBackground;
        if (weightForeground === 0) break;

        sumBackground += value * histogram[value];
        const meanBackground = sumBackground / weightBackground;
        const meanForeground = (sumTotal - sumBackground) / weightForeground;
        const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

        if (variance > maxVariance) {
            maxVariance = variance;
            threshold = value;
        }
    }

    return threshold;
}

function equalizeChannel(channelArray) {
    const histogram = makeHistogramFromGray(channelArray);
    const cdf = new Array(256);
    let cumulative = 0;
    for (let i = 0; i < 256; i += 1) {
        cumulative += histogram[i];
        cdf[i] = cumulative;
    }

    const cdfMin = cdf.find((value) => value > 0) || 0;
    const denominator = channelArray.length - cdfMin;
    if (denominator <= 0) return channelArray.slice();

    const mapping = cdf.map((value) => clipByte(Math.round(((value - cdfMin) / denominator) * 255)));
    const result = new Uint8ClampedArray(channelArray.length);
    for (let i = 0; i < channelArray.length; i += 1) {
        result[i] = mapping[channelArray[i]];
    }
    return result;
}

function hsvToRgb(h, s, v) {
    const hue = ((h % 360) + 360) % 360 / 60;
    const saturation = Math.min(1, Math.max(0, s / 100));
    const value = Math.min(1, Math.max(0, v / 100));
    const sector = Math.floor(hue);
    const fraction = hue - sector;
    const p = value * (1 - saturation);
    const q = value * (1 - fraction * saturation);
    const t = value * (1 - (1 - fraction) * saturation);

    let r = value;
    let g = t;
    let b = p;

    switch (sector) {
        case 0: r = value; g = t; b = p; break;
        case 1: r = q; g = value; b = p; break;
        case 2: r = p; g = value; b = t; break;
        case 3: r = p; g = q; b = value; break;
        case 4: r = t; g = p; b = value; break;
        default: r = value; g = p; b = q; break;
    }

    return {
        r: clipByte(r * 255),
        g: clipByte(g * 255),
        b: clipByte(b * 255)
    };
}

function resolveOutputChannels(params) {
    switch (params.operation) {
        case "grayscale":
        case "binary":
            return "1 (Gray)";
        case "channel":
            return params.channel_mode === "gray" ? "1 (Gray)" : "3 (RGB)";
        case "hsv":
            return params.hsv_channel === "composite" ? "3 (RGB)" : "1 (Gray)";
        case "equalize":
            return params.equalize_mode === "rgb" ? "3 (RGB)" : "1 (Gray)";
        case "invert":
            return params.invert_mode === "gray" ? "1 (Gray)" : "3 (RGB)";
        case "flip_horizontal":
        case "flip_vertical":
        case "rotate_90":
        case "rotate_right_90":
        default:
            return "3 (RGB)";
    }
}

function processImageClient(params) {
    if (!sourceCanvas.width || !sourceCanvas.height) {
        throw new Error("请先加载一张图片");
    }

    const start = performance.now();
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const pixelCount = width * height;
    const operation = params.operation || "grayscale";
    const source = sourceCtx.getImageData(0, 0, width, height);
    const src = source.data;
    const inputGray = new Uint8ClampedArray(pixelCount);

    for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
        inputGray[pixel] = grayValue(src[index], src[index + 1], src[index + 2], params.method);
    }

    let outWidth = width;
    let outHeight = height;
    if (operation === "rotate_90" || operation === "rotate_right_90") {
        outWidth = height;
        outHeight = width;
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outWidth;
    outputCanvas.height = outHeight;
    const outputCtx = outputCanvas.getContext("2d");
    if (!outputCtx) {
        throw new Error("浏览器不支持 Canvas 图像处理");
    }

    const outputImage = outputCtx.createImageData(outWidth, outHeight);
    const dst = outputImage.data;
    const outputGray = new Uint8ClampedArray(outWidth * outHeight);
    const rgbChannels = operation === "equalize" && params.equalize_mode === "rgb"
        ? {
            red: new Uint8ClampedArray(pixelCount),
            green: new Uint8ClampedArray(pixelCount),
            blue: new Uint8ClampedArray(pixelCount)
        }
        : null;

    if (rgbChannels) {
        for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
            rgbChannels.red[pixel] = src[index];
            rgbChannels.green[pixel] = src[index + 1];
            rgbChannels.blue[pixel] = src[index + 2];
        }
        rgbChannels.red = equalizeChannel(rgbChannels.red);
        rgbChannels.green = equalizeChannel(rgbChannels.green);
        rgbChannels.blue = equalizeChannel(rgbChannels.blue);
    }

    const equalizedGray = operation === "equalize" && params.equalize_mode !== "rgb"
        ? equalizeChannel(inputGray)
        : null;
    const effectiveThreshold = operation === "binary" && params.binary_mode === "otsu"
        ? otsuThreshold(inputGray)
        : Number(params.threshold ?? state.threshold);
    const channelIndex = { red: 0, green: 1, blue: 2 }[params.channel] ?? 0;

    function destinationPixel(x, y) {
        let dstX = x;
        let dstY = y;
        if (operation === "flip_horizontal") {
            dstX = width - 1 - x;
        } else if (operation === "flip_vertical") {
            dstY = height - 1 - y;
        } else if (operation === "rotate_90") {
            dstX = y;
            dstY = width - 1 - x;
        } else if (operation === "rotate_right_90") {
            dstX = height - 1 - y;
            dstY = x;
        }
        return dstY * outWidth + dstX;
    }

    function writePixel(dstPixel, r, g, b, alpha, grayForHistogram = grayValue(r, g, b)) {
        const dstIndex = dstPixel * 4;
        dst[dstIndex] = r;
        dst[dstIndex + 1] = g;
        dst[dstIndex + 2] = b;
        dst[dstIndex + 3] = alpha;
        outputGray[dstPixel] = grayForHistogram;
    }

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const srcPixel = y * width + x;
            const srcIndex = srcPixel * 4;
            const r = src[srcIndex];
            const g = src[srcIndex + 1];
            const b = src[srcIndex + 2];
            const alpha = src[srcIndex + 3];
            const gray = inputGray[srcPixel];
            const dstPixel = destinationPixel(x, y);

            if (operation === "grayscale") {
                writePixel(dstPixel, gray, gray, gray, alpha, gray);
            } else if (operation === "binary") {
                const value = gray >= effectiveThreshold ? 255 : 0;
                writePixel(dstPixel, value, value, value, alpha, value);
            } else if (operation === "channel") {
                const channelValue = src[srcIndex + channelIndex];
                if (params.channel_mode === "gray") {
                    writePixel(dstPixel, channelValue, channelValue, channelValue, alpha, channelValue);
                } else {
                    const out = [0, 0, 0];
                    out[channelIndex] = channelValue;
                    writePixel(dstPixel, out[0], out[1], out[2], alpha, channelValue);
                }
            } else if (operation === "hsv") {
                const hsv = rgbToHsvRaw(r, g, b);
                if (params.hsv_channel === "s") {
                    const value = clipByte(hsv.s * 255);
                    writePixel(dstPixel, value, value, value, alpha, value);
                } else if (params.hsv_channel === "v") {
                    const value = clipByte(hsv.v * 255);
                    writePixel(dstPixel, value, value, value, alpha, value);
                } else if (params.hsv_channel === "composite") {
                    const rgb = hsvToRgb(hsv.h, hsv.s * 100, hsv.v * 100);
                    writePixel(dstPixel, rgb.r, rgb.g, rgb.b, alpha, grayValue(rgb.r, rgb.g, rgb.b));
                } else {
                    const value = clipByte((hsv.h / 360) * 255);
                    writePixel(dstPixel, value, value, value, alpha, value);
                }
            } else if (operation === "equalize") {
                if (rgbChannels) {
                    const rr = rgbChannels.red[srcPixel];
                    const gg = rgbChannels.green[srcPixel];
                    const bb = rgbChannels.blue[srcPixel];
                    writePixel(dstPixel, rr, gg, bb, alpha, grayValue(rr, gg, bb));
                } else {
                    const value = equalizedGray[srcPixel];
                    writePixel(dstPixel, value, value, value, alpha, value);
                }
            } else if (operation === "invert") {
                if (params.invert_mode === "gray") {
                    const value = 255 - gray;
                    writePixel(dstPixel, value, value, value, alpha, value);
                } else {
                    const rr = 255 - r;
                    const gg = 255 - g;
                    const bb = 255 - b;
                    writePixel(dstPixel, rr, gg, bb, alpha, grayValue(rr, gg, bb));
                }
            } else {
                writePixel(dstPixel, r, g, b, alpha, grayValue(r, g, b));
            }
        }
    }

    outputCtx.putImageData(outputImage, 0, 0);

    return {
        image: outputCanvas.toDataURL("image/png"),
        histogram: makeHistogramFromGray(outputGray),
        elapsed_ms: Number((performance.now() - start).toFixed(2)),
        info: {
            filename: state.filename,
            size: state.fileSize,
            width: outWidth,
            height: outHeight,
            format: state.fileType || "Unknown",
            method: params.method,
            operation,
            channel: params.channel,
            threshold: effectiveThreshold,
            binary_mode: params.binary_mode,
            channel_mode: params.channel_mode,
            hsv_channel: params.hsv_channel,
            equalize_mode: params.equalize_mode,
            invert_mode: params.invert_mode,
            channels: resolveOutputChannels({ ...params, operation })
        }
    };
}

function getSelectedOperation() {
    if (state.selectedTask === "geometry") return state.geometryOperation;
    const task = taskGroups.find((item) => item.id === state.selectedTask);
    return task?.operation || "grayscale";
}

function currentParamLabel() {
    const operation = getSelectedOperation();
    if (state.selectedTask === "grayscale") return methodText[state.method];
    if (state.selectedTask === "binary") {
        return state.binaryMode === "otsu" ? "OTSU" : `阈值=${state.threshold}`;
    }
    if (state.selectedTask === "channel") {
        return `${channelText[state.channel]} · ${state.channelMode === "gray" ? "灰度强度" : "原色通道"}`;
    }
    if (state.selectedTask === "hsv") {
        return { h: "H", s: "S", v: "V", composite: "HSV 合成" }[state.hsvChannel];
    }
    if (state.selectedTask === "equalize") {
        return state.equalizeMode === "rgb" ? "RGB 分通道" : "灰度图";
    }
    if (state.selectedTask === "invert") {
        return state.invertMode === "gray" ? "灰度图" : "RGB";
    }
    return operationText[operation] || operation;
}

function paramLabelForResult(data) {
    const info = data?.info || {};
    if (info.operation === "grayscale") return methodText[info.method] || methodText[state.method];
    if (info.operation === "binary") {
        return info.binary_mode === "otsu" ? "OTSU" : `阈值=${info.threshold ?? state.threshold}`;
    }
    if (info.operation === "channel") {
        return `${channelText[info.channel] || channelText[state.channel]} · ${info.channel_mode === "gray" ? "灰度强度" : "原色通道"}`;
    }
    if (info.operation === "hsv") {
        return { h: "H", s: "S", v: "V", composite: "HSV 合成" }[info.hsv_channel] || "HSV";
    }
    if (info.operation === "equalize") {
        return info.equalize_mode === "rgb" ? "RGB 分通道" : "灰度图";
    }
    if (info.operation === "invert") {
        return info.invert_mode === "gray" ? "灰度图" : "RGB";
    }
    return operationText[info.operation] || currentParamLabel();
}

function activeTaskTitle() {
    const taskLabel = state.selectedTask === "geometry"
        ? "几何变换"
        : (taskGroups.find((item) => item.id === state.selectedTask)?.label || operationText[getSelectedOperation()] || "图像处理");
    return `${taskLabel}（${currentParamLabel()}）`;
}

function setMessage(text, type = "normal") {
    els.messageBar.textContent = text;
    els.messageBar.hidden = type !== "error";
    els.messageBar.classList.toggle("is-error", type === "error");
    els.messageBar.classList.toggle("is-success", type === "success");
}

function renderOperations() {
    els.operationList.innerHTML = taskGroups.map((task) => `
        <button class="operation-item ${task.id === state.selectedTask ? "is-active" : ""}" type="button" data-task="${task.id}" role="option" aria-selected="${task.id === state.selectedTask}">
            <strong>${task.label}</strong>
        </button>
    `).join("");
}

function radioGroup(name, options, value) {
    return `
        <div class="param-options">
            ${options.map((option) => `
                <label class="param-option">
                    <input type="radio" name="${name}" value="${option.value}" ${option.value === value ? "checked" : ""}>
                    <span>${option.label}</span>
                </label>
            `).join("")}
        </div>
    `;
}

function renderParams() {
    let html = "";

    if (state.selectedTask === "grayscale") {
        html = `
            <div class="param-group">
                <div class="param-title">灰度化方法</div>
                ${radioGroup("method", [
                    { value: "weighted", label: "加权平均法" },
                    { value: "average", label: "平均值法" },
                    { value: "max", label: "最大值法" },
                    { value: "min", label: "最小值法" }
                ], state.method)}
            </div>
        `;
    } else if (state.selectedTask === "binary") {
        html = `
            <div class="param-group">
                <div class="param-title">阈值模式</div>
                ${radioGroup("binaryMode", [
                    { value: "manual", label: "手动阈值" },
                    { value: "otsu", label: "OTSU" }
                ], state.binaryMode)}
            </div>
            <div class="param-slider">
                <div class="param-slider-row">
                    <span class="param-title">阈值滑块</span>
                    <strong id="thresholdValue">${state.threshold}</strong>
                </div>
                <input id="thresholdInput" type="range" min="0" max="255" value="${state.threshold}" ${state.binaryMode === "otsu" ? "disabled" : ""}>
            </div>
        `;
    } else if (state.selectedTask === "channel") {
        html = `
            <div class="param-group">
                <div class="param-title">通道选择</div>
                ${radioGroup("channel", [
                    { value: "red", label: "R 通道" },
                    { value: "green", label: "G 通道" },
                    { value: "blue", label: "B 通道" }
                ], state.channel)}
            </div>
            <div class="param-group">
                <div class="param-title">显示模式</div>
                ${radioGroup("channelMode", [
                    { value: "color", label: "原色通道" },
                    { value: "gray", label: "灰度强度" }
                ], state.channelMode)}
            </div>
        `;
    } else if (state.selectedTask === "hsv") {
        html = `
            <div class="param-group">
                <div class="param-title">HSV 分量</div>
                ${radioGroup("hsvChannel", [
                    { value: "h", label: "H" },
                    { value: "s", label: "S" },
                    { value: "v", label: "V" },
                    { value: "composite", label: "HSV 合成" }
                ], state.hsvChannel)}
            </div>
        `;
    } else if (state.selectedTask === "equalize") {
        html = `
            <div class="param-group">
                <div class="param-title">均衡化模式</div>
                ${radioGroup("equalizeMode", [
                    { value: "gray", label: "灰度图" },
                    { value: "rgb", label: "RGB 分通道" }
                ], state.equalizeMode)}
            </div>
            <div class="param-group">
                <div class="param-title">对比方式</div>
                ${radioGroup("equalizeCompare", [
                    { value: "image", label: "图像对比" },
                    { value: "histogram", label: "直方图对比" }
                ], state.equalizeCompare)}
            </div>
        `;
    } else if (state.selectedTask === "invert") {
        html = `
            <div class="param-group">
                <div class="param-title">反色模式</div>
                ${radioGroup("invertMode", [
                    { value: "rgb", label: "RGB" },
                    { value: "gray", label: "灰度图" }
                ], state.invertMode)}
            </div>
        `;
    } else {
        html = `
            <div class="param-group">
                <div class="param-title">几何变换</div>
                ${radioGroup("geometryOperation", [
                    { value: "flip_horizontal", label: "水平翻转" },
                    { value: "flip_vertical", label: "垂直翻转" },
                    { value: "rotate_90", label: "左旋 90°" },
                    { value: "rotate_right_90", label: "右旋 90°" }
                ], state.geometryOperation)}
            </div>
        `;
    }

    els.paramsArea.innerHTML = html;
}

function renderSamples() {
    els.sampleStrip.innerHTML = samples.map((sample) => `
        <button class="sample-thumb ${state.activeSampleId === sample.id ? "is-active" : ""}" type="button" data-sample="${sample.id}">
            <img src="${sample.src}" alt="${sample.name}">
            <strong>${sample.name}</strong>
        </button>
    `).join("");
}

function renderPreviewStrip() {
    els.previewStrip.innerHTML = previewDefinitions.map((item) => {
        const cached = item.key === "original" ? state.imageUrl : resultCache.get(item.key)?.image;
        const isActive = state.previewKey === item.key;
        return `
            <button class="preview-card ${isActive ? "is-active" : ""}" type="button" data-preview="${item.key}">
                ${cached ? `<img class="preview-thumb" src="${cached}" alt="${item.title}">` : `<div class="preview-thumb preview-placeholder"></div>`}
                <strong>${item.title}</strong>
                <span>${item.desc}</span>
            </button>
        `;
    }).join("");
}

function updateLabelsAndInfo() {
    const sizeText = state.imageWidth && state.imageHeight ? `${state.imageWidth} × ${state.imageHeight}` : "-";
    const taskText = activeTaskTitle();
    const elapsed = state.currentResult?.elapsed_ms ?? "-";
    const resultOperation = state.currentResult?.info?.operation || getSelectedOperation();
    const resultName = operationText[resultOperation] || "处理结果";

    els.statusTask.textContent = taskText;
    els.statusSize.textContent = sizeText;
    els.statusTime.textContent = elapsed === "-" ? "-" : `${elapsed} ms`;
    els.resultLabel.textContent = `处理结果（${resultName}）`;
    els.infoName.textContent = state.filename;
    els.infoResolution.textContent = sizeText;
    els.infoChannels.textContent = state.currentResult?.info?.channels || "3 (RGB)";
    els.infoSize.textContent = state.fileSize;
    els.infoPixels.textContent = state.imageWidth && state.imageHeight ? (state.imageWidth * state.imageHeight).toLocaleString("zh-CN") : "-";
    els.infoTask.textContent = state.currentResult?.info?.operation
        ? `${operationText[state.currentResult.info.operation] || state.currentResult.info.operation}（${paramLabelForResult(state.currentResult)}）`
        : taskText;
    els.infoTimeStat.textContent = elapsed === "-" ? "-" : `${elapsed} ms`;
}

function drawHistogram(histogram, compareHistogram = null) {
    if (!histogramChart) {
        els.histogramChart.textContent = "ECharts 加载后将在这里显示灰度分布柱状图。";
        return;
    }

    const data = Array.isArray(histogram) && histogram.length ? histogram : new Array(256).fill(0);
    const series = [{
        type: "bar",
        name: "当前结果",
        data,
        barWidth: "80%",
        itemStyle: { borderRadius: [2, 2, 0, 0] }
    }];
    const colors = ["#2563eb"];

    if (Array.isArray(compareHistogram) && compareHistogram.length) {
        colors.push("#94a3b8");
        series.unshift({
            type: "line",
            name: "原始灰度",
            data: compareHistogram,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2, color: "#94a3b8" }
        });
    }

    histogramChart.setOption({
        color: colors,
        grid: { left: 42, right: 16, top: 24, bottom: 32, containLabel: false },
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            borderWidth: 0,
            textStyle: { color: "#ffffff" },
            formatter(params) {
                const item = params[0];
                return `灰度级 ${item.axisValue}<br>像素数量 ${item.data}`;
            }
        },
        xAxis: {
            type: "category",
            data: Array.from({ length: 256 }, (_, index) => index),
            axisLabel: { color: "#64748b", interval: 63 },
            axisTick: { show: false },
            axisLine: { lineStyle: { color: "#cbd5e1" } }
        },
        yAxis: {
            type: "value",
            axisLabel: { color: "#64748b" },
            splitLine: { lineStyle: { color: "#e8eef7", type: "dashed" } }
        },
        series
    });
}

function noteSection(title, content) {
    return `<section class="note-section"><h4>${title}</h4>${content}</section>`;
}

function renderNotes() {
    const stats = histogramStats(state.currentResult?.histogram || []);
    const pixel = state.lastPixel;
    const gray = pixel ? grayValue(pixel.r, pixel.g, pixel.b) : "-";
    const threshold = state.threshold;
    const total = stats.total || 1;
    const foreground = state.currentResult?.histogram
        ? state.currentResult.histogram.slice(128).reduce((sum, value) => sum + value, 0) / total * 100
        : 0;

    let html = "";

    if (state.selectedTask === "grayscale") {
        html += noteSection("当前算法说明", `<p>${methodText[state.method]}将 RGB 三通道合成为单通道亮度图。</p>`);
        html += noteSection("公式", `<p>Gray(x,y) = 0.299R + 0.587G + 0.114B</p>`);
        html += noteSection("核心思想", `<p>按人眼对绿色更敏感、对蓝色较弱的亮度感知加权，得到更符合视觉观感的灰度。</p>`);
        html += noteSection("灰度计算过程", `<p>${pixel ? `Gray = 0.299×${pixel.r} + 0.587×${pixel.g} + 0.114×${pixel.b} = ${gray}` : "移动鼠标到图像上查看单个像素计算。"}</p>`);
        html += noteSection("结果统计", `<ul><li>平均灰度：${stats.avg.toFixed(2)}</li><li>最小值：${stats.min}</li><li>最大值：${stats.max}</li><li>标准差：${stats.std.toFixed(2)}</li><li>直方图峰值：${stats.peak}</li><li>总像素数：${stats.total.toLocaleString("zh-CN")}</li></ul>`);
    } else if (state.selectedTask === "binary") {
        const fg = state.currentResult?.histogram ? state.currentResult.histogram[255] || 0 : 0;
        const bg = state.currentResult?.histogram ? state.currentResult.histogram[0] || 0 : 0;
        const divisor = Math.max(1, fg + bg);
        html += noteSection("阈值分割公式", `<p>Out(x,y) = Gray(x,y) ≥ T ? 255 : 0</p>`);
        html += noteSection("当前阈值", `<p>${state.binaryMode === "otsu" ? "OTSU 自动阈值" : threshold}</p>`);
        html += noteSection("比例统计", `<ul><li>前景比例：${(fg / divisor * 100).toFixed(2)}%</li><li>背景比例：${(bg / divisor * 100).toFixed(2)}%</li></ul>`);
        html += noteSection("适用场景", `<p>适合目标与背景灰度差异明显的文档扫描、轮廓提取、缺陷检测等任务。</p>`);
    } else if (state.selectedTask === "channel") {
        const channelValue = pixel ? { red: pixel.r, green: pixel.g, blue: pixel.b }[state.channel] : "-";
        html += noteSection("矩阵结构", `<p>彩色图像可表示为 H × W × 3 的矩阵，每个像素包含 R、G、B 三个强度值。</p>`);
        html += noteSection("当前通道值", `<p>${channelText[state.channel]}：${channelValue}</p>`);
        html += noteSection("通道贡献说明", `<p>通道分离可以观察单一颜色分量在图像结构、纹理和亮度中的贡献。</p>`);
    } else if (state.selectedTask === "hsv") {
        const hsv = pixel ? rgbToHsv(pixel.r, pixel.g, pixel.b) : null;
        html += noteSection("RGB 与 HSV 的区别", `<p>RGB 描述发光强度组合，HSV 将颜色拆成色相、饱和度和明度，更接近调色与分割直觉。</p>`);
        html += noteSection("H / S / V 含义", `<ul><li>H：色相角度</li><li>S：颜色纯度</li><li>V：明暗强度</li></ul>`);
        html += noteSection("当前像素 HSV 值", `<p>${hsv ? `H=${hsv.h}°, S=${hsv.s}%, V=${hsv.v}%` : "移动鼠标到图像上查看 HSV 值。"}</p>`);
    } else if (state.selectedTask === "equalize") {
        html += noteSection("CDF 映射思想", `<p>统计灰度直方图并计算累计分布函数，将密集灰度区间重新映射到更宽的 0–255 范围。</p>`);
        html += noteSection("对比度增强说明", `<p>均衡化会提升暗部或亮部细节的可见度，但也可能放大噪声。</p>`);
        html += noteSection("原始灰度分布", `<p>原始峰值：${histogramStats(state.originalHistogram).peak}</p>`);
        html += noteSection("均衡化后灰度分布", `<p>当前峰值：${stats.peak}，标准差：${stats.std.toFixed(2)}</p>`);
    } else if (state.selectedTask === "geometry") {
        const operation = getSelectedOperation();
        const relation = {
            flip_horizontal: "新坐标 x' = W - 1 - x, y' = y",
            flip_vertical: "新坐标 x' = x, y' = H - 1 - y",
            rotate_90: "左旋后 x' = y, y' = W - 1 - x",
            rotate_right_90: "右旋后 x' = H - 1 - y, y' = x"
        }[operation];
        html += noteSection("坐标映射关系", `<p>${relation}</p>`);
        html += noteSection("像素位置变化", `<p>几何变换不改变像素颜色本身，只重新排列像素在图像矩阵中的位置。</p>`);
    } else {
        html += noteSection("反色映射", `<p>RGB 反色使用 R'=255-R，G'=255-G，B'=255-B；灰度图反色使用 Gray'=255-Gray。</p>`);
        html += noteSection("当前统计", `<ul><li>平均灰度：${stats.avg.toFixed(2)}</li><li>前景估计：${foreground.toFixed(2)}%</li></ul>`);
    }

    els.notesPanel.innerHTML = html;
}

function addHistory(data) {
    const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    historyRows.unshift({
        time: now,
        task: operationText[data.info.operation] || data.info.operation,
        param: currentParamLabel(),
        elapsed: `${data.elapsed_ms} ms`
    });
    while (historyRows.length > 8) historyRows.pop();
    renderHistory();
}

function renderHistory() {
    if (!historyRows.length) {
        els.historyList.innerHTML = `<div class="history-empty">暂无处理记录</div>`;
        return;
    }

    els.historyList.innerHTML = historyRows.map((row) => `
        <div class="history-row">
            <time>${row.time}</time>
            <span title="${row.task}">${row.task}</span>
            <span title="${row.param}">${row.param}</span>
            <span>${row.elapsed}</span>
        </div>
    `).join("");
}

function setCompareSplit(percent) {
    const clamped = Math.min(100, Math.max(0, percent));
    els.compareStage.style.setProperty("--split", `${clamped}%`);
    els.compareHandle.setAttribute("aria-valuenow", Math.round(clamped).toString());
}

function setCompareByClientX(clientX) {
    const rect = els.compareStage.getBoundingClientRect();
    setCompareSplit(((clientX - rect.left) / rect.width) * 100);
}

function updateProbeFromEvent(event) {
    if (!sourceCanvas.width || !sourceCanvas.height) return;

    const frame = els.compareStage.querySelector(".compare-frame");
    if (!frame) {
        els.probeCoord.textContent = "图片外";
        return;
    }

    const rect = frame.getBoundingClientRect();
    const scale = Math.min(rect.width / sourceCanvas.width, rect.height / sourceCanvas.height);
    const renderWidth = sourceCanvas.width * scale;
    const renderHeight = sourceCanvas.height * scale;
    const offsetX = (rect.width - renderWidth) / 2;
    const offsetY = (rect.height - renderHeight) / 2;
    const localX = event.clientX - rect.left - offsetX;
    const localY = event.clientY - rect.top - offsetY;

    if (localX < 0 || localY < 0 || localX > renderWidth || localY > renderHeight) {
        els.probeCoord.textContent = "图片外";
        return;
    }

    const x = Math.min(sourceCanvas.width - 1, Math.floor(localX / scale));
    const y = Math.min(sourceCanvas.height - 1, Math.floor(localY / scale));
    const [r, g, b] = sourceCtx.getImageData(x, y, 1, 1).data;
    const gray = grayValue(r, g, b);
    const hsv = rgbToHsv(r, g, b);
    state.lastPixel = { x, y, r, g, b };

    els.probeCoord.textContent = `(${x}, ${y})`;
    els.probeR.textContent = r;
    els.probeG.textContent = g;
    els.probeB.textContent = b;
    els.probeGray.textContent = gray;
    els.probeHsv.textContent = `${hsv.h}° / ${hsv.s}% / ${hsv.v}%`;
    renderNotes();
}

function resetProbe() {
    state.lastPixel = null;
    els.probeCoord.textContent = "-";
    els.probeR.textContent = "-";
    els.probeG.textContent = "-";
    els.probeB.textContent = "-";
    els.probeGray.textContent = "-";
    els.probeHsv.textContent = "-";
}

function cacheOriginalImage(image) {
    sourceCanvas.width = image.naturalWidth || image.width;
    sourceCanvas.height = image.naturalHeight || image.height;
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
    state.imageWidth = sourceCanvas.width;
    state.imageHeight = sourceCanvas.height;
    state.originalHistogram = histogramFromPixels(sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height));
}

function applyResult(data, previewKey = state.previewKey, writeHistory = true) {
    state.currentResult = data;
    resultCache.set(previewKey, data);
    els.beforeImage.src = state.imageUrl;
    els.afterImage.src = data.image;
    els.compareStage.classList.remove("empty");
    els.compareEmpty.classList.add("is-hidden");
    setCompareSplit(state.compareMode ? 50 : 0);
    const compareHistogram = state.selectedTask === "equalize" && state.equalizeCompare === "histogram"
        ? state.originalHistogram
        : null;
    drawHistogram(data.histogram, compareHistogram);
    updateLabelsAndInfo();
    renderNotes();
    renderPreviewStrip();
    if (writeHistory) addHistory(data);
    setMessage(`处理完成：${operationText[data.info.operation] || data.info.operation} · ${data.elapsed_ms} ms`, "success");
}

async function warmPreviewCache(baseRequestId) {
    const currentImage = state.imageUrl;
    for (const key of previewWarmupKeys) {
        if (baseRequestId !== state.requestId || state.imageUrl !== currentImage) return;
        if (resultCache.has(key)) continue;
        const params = paramsForKey(key);
        if (!params) continue;
        try {
            const data = await requestProcess(params, baseRequestId);
            if (!data || baseRequestId !== state.requestId || state.imageUrl !== currentImage) return;
            resultCache.set(key, data);
            renderPreviewStrip();
        } catch (error) {
            if (baseRequestId !== state.requestId || state.imageUrl !== currentImage) return;
            console.debug("preview warmup skipped", key, error?.message || error);
        }
    }
}

function paramsForKey(key) {
    const base = {
        method: state.method,
        threshold: state.threshold,
        binary_mode: state.binaryMode,
        channel: state.channel,
        channel_mode: state.channelMode,
        hsv_channel: state.hsvChannel,
        equalize_mode: state.equalizeMode,
        invert_mode: state.invertMode
    };

    if (key === "original") return null;
    if (key === "grayscale") return { ...base, operation: "grayscale" };
    if (key === "binary") return { ...base, operation: "binary", threshold: state.threshold };
    if (key === "channel-red") return { ...base, operation: "channel", channel: "red" };
    if (key === "channel-green") return { ...base, operation: "channel", channel: "green" };
    if (key === "channel-blue") return { ...base, operation: "channel", channel: "blue" };
    if (key === "equalize") return { ...base, operation: "equalize" };
    if (key === "invert") return { ...base, operation: "invert" };
    return { ...base, operation: getSelectedOperation() };
}

async function requestProcess(params, requestId) {
    if (!state.selectedFile) throw new Error("未选择图片");

    if (computeMode("grayscale") === "frontend") {
        const data = processImageClient(params);
        return requestId === state.requestId ? data : null;
    }

    const formData = new FormData();
    formData.append("image", state.selectedFile);
    Object.entries(params).forEach(([key, value]) => formData.append(key, value));
    const response = await fetch(cvclassUrl("/process"), { method: "POST", body: formData });
    const data = await response.json();
    if (requestId !== state.requestId) return null;
    if (response.status === 409 && data.compute_mode === "frontend") {
        return processImageClient(params);
    }
    if (!response.ok) throw new Error(data.error || "图像处理失败");
    data.info.channels = resolveOutputChannels(params);
    return data;
}

function currentPreviewKey() {
    if (state.selectedTask === "grayscale") return "grayscale";
    if (state.selectedTask === "binary") return "binary";
    if (state.selectedTask === "channel") return `channel-${state.channel}`;
    if (state.selectedTask === "equalize") return "equalize";
    if (state.selectedTask === "invert") return "invert";
    return state.selectedTask;
}

async function processCurrent() {
    if (!state.selectedFile) return;
    const requestId = ++state.requestId;
    const previewKey = currentPreviewKey();
    state.previewKey = previewKey;
    setMessage(`正在执行：${activeTaskTitle()}`);
    updateLabelsAndInfo();

    try {
        const params = {
            ...paramsForKey(previewKey),
            operation: getSelectedOperation(),
            method: state.method,
            threshold: state.threshold,
            binary_mode: state.binaryMode,
            channel: state.channel,
            channel_mode: state.channelMode,
            hsv_channel: state.hsvChannel,
            equalize_mode: state.equalizeMode,
            invert_mode: state.invertMode
        };
        const data = await requestProcess(params, requestId);
        if (!data) return;
        applyResult(data, previewKey, true);
    } catch (error) {
        if (requestId !== state.requestId) return;
        setMessage(error.message || "图像处理失败，请检查图片后重试。", "error");
        els.compareStage.classList.add("empty");
        drawHistogram([]);
    }
}

const debouncedProcess = debounce(processCurrent, 220);

function loadFile(file, sampleId = "") {
    state.requestId += 1;
    resultCache.clear();
    resetProbe();
    els.compareStage.classList.add("empty");
    els.compareEmpty.classList.remove("is-hidden");
    if (!file) {
        setMessage("未选择文件，请上传图片。", "error");
        return;
    }

    if (!/^image\/(png|jpeg|bmp|x-ms-bmp)$/i.test(file.type) && !/\.(png|jpg|jpeg|bmp)$/i.test(file.name)) {
        setMessage("仅支持 JPG / PNG / BMP 图片。", "error");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        setMessage("图片大小不能超过 10MB。", "error");
        return;
    }

    state.selectedFile = file;
    state.filename = file.name;
    state.fileSize = formatFileSize(file.size);
    state.fileType = file.type || "Unknown";
    state.activeSampleId = sampleId;
    state.previewKey = "grayscale";
    state.currentResult = null;
    renderSamples();
    renderPreviewStrip();
    setMessage("正在读取图片...");

    const reader = new FileReader();
    reader.onload = (event) => {
        state.imageUrl = event.target.result;
        els.beforeImage.src = state.imageUrl;
        const image = new Image();
        image.onload = () => {
            cacheOriginalImage(image);
            els.compareStage.classList.remove("empty");
            els.compareEmpty.classList.add("is-hidden");
            updateLabelsAndInfo();
            renderPreviewStrip();
            processCurrent();
            warmPreviewCache(state.requestId);
        };
        image.onerror = () => setMessage("图片读取失败，请换一张图片重试。", "error");
        image.src = state.imageUrl;
    };
    reader.onerror = () => setMessage("文件读取失败，请重新选择图片。", "error");
    reader.readAsDataURL(file);
}

async function loadSample(sample) {
    try {
        setMessage(`正在加载示例图：${sample.name}`);
        const response = await fetch(sample.src);
        if (!response.ok) throw new Error("示例图加载失败");
        const blob = await response.blob();
        const extension = sample.src.split(".").pop().split("?")[0] || "png";
        const file = new File([blob], `${sample.id}.${extension}`, { type: blob.type || "image/png" });
        loadFile(file, sample.id);
    } catch (error) {
        setMessage(error.message || "示例图加载失败，请刷新页面重试。", "error");
    }
}

async function handlePreviewClick(key) {
    if (!state.selectedFile) return;
    state.previewKey = key;

    if (key === "original") {
        const data = {
            image: state.imageUrl,
            histogram: state.originalHistogram,
            elapsed_ms: 0,
            info: {
                filename: state.filename,
                width: state.imageWidth,
                height: state.imageHeight,
                size: state.fileSize,
                operation: "original",
                channels: "3 (RGB)"
            }
        };
        state.currentResult = data;
        els.afterImage.src = state.imageUrl;
        drawHistogram(state.originalHistogram);
        updateLabelsAndInfo();
        renderNotes();
        renderPreviewStrip();
        return;
    }

    const cached = resultCache.get(key);
    if (cached) {
        applyResult(cached, key, false);
        return;
    }

    const params = paramsForKey(key);
    if (!params) return;
    const requestId = ++state.requestId;
    setMessage(`正在生成速览：${previewDefinitions.find((item) => item.key === key)?.title || key}`);
    try {
        const data = await requestProcess(params, requestId);
        if (!data) return;
        applyResult(data, key, true);
    } catch (error) {
        if (requestId !== state.requestId) return;
        setMessage(error.message || "速览生成失败。", "error");
    }
}

function setStateFromInput(input) {
    const name = input.name;
    const value = input.value;
    if (name === "method") state.method = value;
    if (name === "binaryMode") state.binaryMode = value;
    if (name === "channel") state.channel = value;
    if (name === "channelMode") state.channelMode = value;
    if (name === "hsvChannel") state.hsvChannel = value;
    if (name === "equalizeMode") state.equalizeMode = value;
    if (name === "equalizeCompare") state.equalizeCompare = value;
    if (name === "invertMode") state.invertMode = value;
    if (name === "geometryOperation") state.geometryOperation = value;
}

function bindEvents() {
    els.operationList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-task]");
        if (!button) return;
        state.selectedTask = button.dataset.task;
        renderOperations();
        renderParams();
        updateLabelsAndInfo();
        debouncedProcess();
    });

    els.paramsArea.addEventListener("change", (event) => {
        const input = event.target;
        if (input.matches("input[type='radio']")) {
            setStateFromInput(input);
            renderParams();
            updateLabelsAndInfo();
            debouncedProcess();
        }
    });

    els.paramsArea.addEventListener("input", (event) => {
        if (event.target.id !== "thresholdInput") return;
        state.threshold = Number(event.target.value);
        const valueEl = document.getElementById("thresholdValue");
        if (valueEl) valueEl.textContent = state.threshold;
        debouncedProcess();
    });

    els.sampleStrip.addEventListener("click", (event) => {
        const button = event.target.closest("[data-sample]");
        if (!button) return;
        const sample = samples.find((item) => item.id === button.dataset.sample);
        if (sample) loadSample(sample);
    });

    els.reloadSamplesButton.addEventListener("click", () => loadSample(samples.find((item) => item.id === defaultSampleId) || samples[0]));

    els.imageInput.addEventListener("change", () => loadFile(els.imageInput.files[0]));

    ["dragenter", "dragover"].forEach((eventName) => {
        els.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            els.dropZone.classList.add("drag-over");
        });
    });

    els.dropZone.addEventListener("dragleave", (event) => {
        if (!els.dropZone.contains(event.relatedTarget)) {
            els.dropZone.classList.remove("drag-over");
        }
    });

    els.dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("drag-over");
        loadFile(event.dataTransfer.files[0]);
    });

    els.previewStrip.addEventListener("click", (event) => {
        const button = event.target.closest("[data-preview]");
        if (button) handlePreviewClick(button.dataset.preview);
    });

    els.compareStage.addEventListener("pointerdown", (event) => {
        if (els.compareStage.classList.contains("empty")) return;
        state.draggingCompare = true;
        els.compareStage.setPointerCapture(event.pointerId);
        setCompareByClientX(event.clientX);
        updateProbeFromEvent(event);
    });

    els.compareStage.addEventListener("pointermove", (event) => {
        if (!els.compareStage.classList.contains("empty")) updateProbeFromEvent(event);
        if (state.draggingCompare) setCompareByClientX(event.clientX);
    });

    els.compareStage.addEventListener("pointerup", () => {
        state.draggingCompare = false;
    });

    els.compareStage.addEventListener("pointercancel", () => {
        state.draggingCompare = false;
    });

    els.compareToggle.addEventListener("click", () => {
        state.compareMode = !state.compareMode;
        setCompareSplit(state.compareMode ? 50 : 0);
        els.compareToggle.textContent = state.compareMode ? "对比视图" : "结果视图";
    });

    els.downloadButton.addEventListener("click", () => {
        const image = state.currentResult?.image;
        if (!image) {
            setMessage("暂无可导出的处理结果。", "error");
            return;
        }
        const anchor = document.createElement("a");
        anchor.href = image;
        anchor.download = `processed_${state.filename.replace(/\.[^.]+$/, "") || "image"}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    });

    els.clearHistoryButton.addEventListener("click", () => {
        historyRows.length = 0;
        renderHistory();
    });

    window.addEventListener("resize", () => {
        if (histogramChart) histogramChart.resize();
    });
}

function init() {
    els.compareStage.classList.add("empty");
    renderOperations();
    renderParams();
    renderSamples();
    renderPreviewStrip();
    renderHistory();
    resetProbe();
    updateLabelsAndInfo();
    drawHistogram([]);
    renderNotes();
    bindEvents();
    loadSample(samples.find((item) => item.id === defaultSampleId) || samples[0]);
}

init();
