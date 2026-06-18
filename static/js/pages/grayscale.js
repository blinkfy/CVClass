(() => {
    const $ = (id) => document.getElementById(id);
    const els = {
        imageInput: $("imageInput"),
        dropZone: $("dropZone"),
        sampleStrip: $("sampleStrip"),
        reloadSamplesButton: $("reloadSamplesButton"),
        operationList: $("operationList"),
        paramsArea: $("paramsArea"),
        statusTask: $("statusTask"),
        statusSize: $("statusSize"),
        statusTime: $("statusTime"),
        statusOutputType: $("statusOutputType"),
        compareToggle: $("compareToggle"),
        downloadButton: $("downloadButton"),
        messageBar: $("messageBar"),
        flowSteps: $("flowSteps"),
        compareStage: $("compareStage"),
        compareHandle: $("compareHandle"),
        compareEmpty: $("compareEmpty"),
        beforeImage: $("beforeImage"),
        afterImage: $("afterImage"),
        afterLayer: $("afterLayer"),
        resultLabel: $("resultLabel"),
        previewStrip: $("previewStrip"),
        histogramChart: $("histogramChart"),
        histogramMeta: $("histogramMeta"),
        infoName: $("infoName"),
        infoResolution: $("infoResolution"),
        infoChannels: $("infoChannels"),
        infoSize: $("infoSize"),
        infoPixels: $("infoPixels"),
        infoTask: $("infoTask"),
        infoTimeStat: $("infoTimeStat"),
        historyList: $("historyList"),
        clearHistoryButton: $("clearHistoryButton"),
        notesPanel: $("notesPanel"),
        probeLockState: $("probeLockState"),
        probeCoord: $("probeCoord"),
        probeR: $("probeR"),
        probeG: $("probeG"),
        probeB: $("probeB"),
        probeGray: $("probeGray"),
        probeHsv: $("probeHsv"),
        probeRBar: $("probeRBar"),
        probeGBar: $("probeGBar"),
        probeBBar: $("probeBBar"),
        probeGrayBar: $("probeGrayBar"),
        grayCalc: $("grayCalc"),
        summaryChannels: $("summaryChannels"),
        summaryPixels: $("summaryPixels"),
        summaryMean: $("summaryMean"),
        summaryMin: $("summaryMin"),
        summaryMax: $("summaryMax"),
        summaryStd: $("summaryStd"),
        summaryPeak: $("summaryPeak"),
        probeBubble: $("probeBubble")
    };

    if (!els.compareStage) return;

    const sourceCanvas = document.createElement("canvas");
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const resultCache = new Map();
    const historyRows = [];
    const histogramChart = window.echarts && els.histogramChart ? echarts.init(els.histogramChart) : null;

    const samples = [
        { id: "bangkok", name: "Bangkok", src: cvclassUrl("/static/assets/img/bangkok_traffic.jpg") },
        { id: "peppers", name: "Peppers", src: cvclassUrl("/static/assets/img/peppers_color.png") },
        { id: "crosswalk", name: "Crosswalk", src: cvclassUrl("/static/assets/img/crosswalk_people.jpg") },
        { id: "lena", name: "Lena", src: cvclassUrl("/static/assets/img/lena_color_512.png") },
        { id: "mandril", name: "Mandril", src: cvclassUrl("/static/assets/img/mandril_color.png") }
    ];
    const defaultSampleId = "bangkok";

    const tasks = [
        { id: "grayscale", label: "灰度化", operation: "grayscale" },
        { id: "binary", label: "二值化", operation: "binary" },
        { id: "channel", label: "RGB 通道分离", operation: "channel" },
        { id: "hsv", label: "HSV 颜色空间", operation: "hsv" },
        { id: "equalize", label: "直方图均衡化", operation: "equalize" },
        { id: "invert", label: "反色", operation: "invert" },
        { id: "geometry", label: "几何变换（翻转 / 旋转）", operation: "flip_horizontal" }
    ];

    const operationText = {
        original: "原图",
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

    const outputTypeText = {
        original: "RGB 图像",
        grayscale: "灰度图像",
        binary: "二值图像",
        channel: "通道图像",
        hsv: "HSV 分量图",
        equalize: "均衡化图像",
        invert: "反色图像",
        flip_horizontal: "RGB 图像",
        flip_vertical: "RGB 图像",
        rotate_90: "RGB 图像",
        rotate_right_90: "RGB 图像"
    };

    const previewDefinitions = [
        { key: "grayscale", title: "灰度化", desc: "亮度结构" },
        { key: "binary", title: "二值化", desc: "前景 / 背景" },
        { key: "channel-red", title: "R 通道", desc: "红色贡献" },
        { key: "channel-green", title: "G 通道", desc: "绿色贡献" },
        { key: "channel-blue", title: "B 通道", desc: "蓝色贡献" },
        { key: "hsv", title: "HSV", desc: "颜色空间" },
        { key: "equalize", title: "均衡化", desc: "对比增强" },
        { key: "invert", title: "反色", desc: "强度取反" },
        { key: "geometry", title: "几何变换", desc: "坐标映射" }
    ];

    const flows = {
        grayscale: ["RGB 输入", "读取像素", "拆分 R/G/B", "加权求和", "生成灰度图", "更新直方图"],
        binary: ["RGB 输入", "灰度化", "阈值比较", "前景/背景划分", "二值图输出"],
        channel: ["RGB 输入", "拆分 R/G/B", "选择通道", "生成通道图"],
        hsv: ["RGB 输入", "归一化", "计算 H/S/V", "选择分量", "生成结果"],
        equalize: ["灰度图", "统计直方图", "计算 CDF", "灰度映射", "均衡化输出"],
        invert: ["RGB 输入", "读取像素", "255 - value", "输出反色图"],
        geometry: ["输入图像", "坐标映射", "翻转/旋转", "输出图像"]
    };

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
        probeLocked: false,
        activeSampleId: defaultSampleId,
        requestId: 0,
        draggingCompare: false,
        compareMode: true,
        activeFlowIndex: 0
    };

    const previewWarmupKeys = ["grayscale", "binary", "channel-red", "channel-green", "channel-blue", "hsv", "equalize", "invert"];

    function cvclassUrl(path) {
        if (window.cvclassUrl) return window.cvclassUrl(path);
        const base = window.CVCLASS_BASE_PATH || "";
        return `${base}${path}`;
    }

    function computeMode(feature) {
        return window.CVCLASS_COMPUTE_CONFIG?.[feature] || "backend";
    }

    function debounce(fn, wait) {
        let timer = null;
        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), wait);
        };
    }

    function clipByte(value) {
        return Math.trunc(Math.min(255, Math.max(0, value)));
    }

    function formatFileSize(size) {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        return `${(size / 1024 / 1024).toFixed(2)} MB`;
    }

    function grayValue(r, g, b, method = state.method) {
        if (method === "average") return clipByte((r + g + b) / 3);
        if (method === "max") return Math.max(r, g, b);
        if (method === "min") return Math.min(r, g, b);
        return clipByte(0.299 * r + 0.587 * g + 0.114 * b);
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
        return { h, s, v: max };
    }

    function rgbToHsv(r, g, b) {
        const hsv = rgbToHsvRaw(r, g, b);
        return {
            h: Math.round(hsv.h),
            s: Number((hsv.s * 100).toFixed(1)),
            v: Number((hsv.v * 100).toFixed(1))
        };
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
        if (sector === 1) { r = q; g = value; b = p; }
        else if (sector === 2) { r = p; g = value; b = t; }
        else if (sector === 3) { r = p; g = q; b = value; }
        else if (sector === 4) { r = t; g = p; b = value; }
        else if (sector >= 5) { r = value; g = p; b = q; }
        return { r: clipByte(r * 255), g: clipByte(g * 255), b: clipByte(b * 255) };
    }

    function makeHistogramFromGray(grayArray) {
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < grayArray.length; i += 1) histogram[grayArray[i]] += 1;
        return histogram;
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
        const total = Array.isArray(histogram) ? histogram.reduce((sum, value) => sum + value, 0) : 0;
        if (!total) return { avg: 0, min: 0, max: 0, std: 0, peak: 0, peakCount: 0, total: 0 };
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
        return { avg, min, max, std: Math.sqrt(variance / total), peak, peakCount, total };
    }

    function otsuThreshold(grayArray) {
        const histogram = makeHistogramFromGray(grayArray);
        const total = grayArray.length || 1;
        const sumTotal = histogram.reduce((sum, value, index) => sum + index * value, 0);
        let sumBackground = 0;
        let weightBackground = 0;
        let maxVariance = -1;
        let threshold = 128;
        for (let value = 0; value < 256; value += 1) {
            weightBackground += histogram[value];
            if (!weightBackground) continue;
            const weightForeground = total - weightBackground;
            if (!weightForeground) break;
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
        for (let i = 0; i < channelArray.length; i += 1) result[i] = mapping[channelArray[i]];
        return result;
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
            default:
                return "3 (RGB)";
        }
    }

    function processImageClient(params) {
        if (!sourceCanvas.width || !sourceCanvas.height) throw new Error("请先加载一张图片");
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
        if (!outputCtx) throw new Error("浏览器不支持 Canvas 图像处理");
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

        const equalizedGray = operation === "equalize" && params.equalize_mode !== "rgb" ? equalizeChannel(inputGray) : null;
        const effectiveThreshold = operation === "binary" && params.binary_mode === "otsu"
            ? otsuThreshold(inputGray)
            : Number(params.threshold ?? state.threshold);
        const channelIndex = { red: 0, green: 1, blue: 2 }[params.channel] ?? 0;

        function destinationPixel(x, y) {
            let dstX = x;
            let dstY = y;
            if (operation === "flip_horizontal") dstX = width - 1 - x;
            else if (operation === "flip_vertical") dstY = height - 1 - y;
            else if (operation === "rotate_90") { dstX = y; dstY = width - 1 - x; }
            else if (operation === "rotate_right_90") { dstX = height - 1 - y; dstY = x; }
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
        return tasks.find((item) => item.id === state.selectedTask)?.operation || "grayscale";
    }

    function selectedTaskLabel() {
        return state.selectedTask === "geometry"
            ? "几何变换"
            : tasks.find((item) => item.id === state.selectedTask)?.label || operationText[getSelectedOperation()];
    }

    function currentParamLabel() {
        const operation = getSelectedOperation();
        if (state.selectedTask === "grayscale") return methodText[state.method];
        if (state.selectedTask === "binary") return state.binaryMode === "otsu" ? "OTSU" : `手动阈值 T=${state.threshold}`;
        if (state.selectedTask === "channel") return `${channelText[state.channel]} · ${state.channelMode === "gray" ? "灰度强度" : "原色通道"}`;
        if (state.selectedTask === "hsv") return { h: "H", s: "S", v: "V", composite: "HSV 合成" }[state.hsvChannel];
        if (state.selectedTask === "equalize") return state.equalizeMode === "rgb" ? "RGB 分通道" : "灰度图";
        if (state.selectedTask === "invert") return state.invertMode === "gray" ? "灰度反色" : "RGB 反色";
        return operationText[operation] || operation;
    }

    function activeTaskTitle() {
        return `${selectedTaskLabel()}（${currentParamLabel()}）`;
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
        if (key === "binary") return { ...base, operation: "binary" };
        if (key === "channel-red") return { ...base, operation: "channel", channel: "red" };
        if (key === "channel-green") return { ...base, operation: "channel", channel: "green" };
        if (key === "channel-blue") return { ...base, operation: "channel", channel: "blue" };
        if (key === "hsv") return { ...base, operation: "hsv" };
        if (key === "equalize") return { ...base, operation: "equalize" };
        if (key === "invert") return { ...base, operation: "invert" };
        if (key === "geometry") return { ...base, operation: state.geometryOperation };
        return { ...base, operation: getSelectedOperation() };
    }

    function currentPreviewKey() {
        if (state.selectedTask === "grayscale") return "grayscale";
        if (state.selectedTask === "binary") return "binary";
        if (state.selectedTask === "channel") return `channel-${state.channel}`;
        if (state.selectedTask === "hsv") return "hsv";
        if (state.selectedTask === "equalize") return "equalize";
        if (state.selectedTask === "invert") return "invert";
        if (state.selectedTask === "geometry") return "geometry";
        return state.selectedTask;
    }

    function setMessage(text, type = "normal") {
        if (!els.messageBar) return;
        els.messageBar.textContent = text;
        els.messageBar.hidden = type === "normal";
        els.messageBar.classList.toggle("is-error", type === "error");
        els.messageBar.classList.toggle("is-success", type === "success");
    }

    function renderOperations() {
        els.operationList.innerHTML = tasks.map((task) => `
            <button class="station01-operation ${task.id === state.selectedTask ? "is-active" : ""}" type="button" data-task="${task.id}" role="option" aria-selected="${task.id === state.selectedTask}">
                <strong>${task.label}</strong>
            </button>
        `).join("");
    }

    function radioGroup(name, options, value) {
        return `<div class="station01-param-options">${options.map((option) => `
            <label class="station01-param-option">
                <input type="radio" name="${name}" value="${option.value}" ${option.value === value ? "checked" : ""}>
                <span>${option.label}</span>
            </label>
        `).join("")}</div>`;
    }

    function renderParams() {
        let html = "";
        if (state.selectedTask === "grayscale") {
            html = `<div class="station01-param-group"><div class="station01-param-title">灰度化方法</div>${radioGroup("method", [
                { value: "weighted", label: "加权平均法" },
                { value: "average", label: "平均值法" },
                { value: "max", label: "最大值法" },
                { value: "min", label: "最小值法" }
            ], state.method)}</div>`;
        } else if (state.selectedTask === "binary") {
            html = `
                <div class="station01-param-group"><div class="station01-param-title">阈值模式</div>${radioGroup("binaryMode", [
                    { value: "manual", label: "手动阈值" },
                    { value: "otsu", label: "OTSU" }
                ], state.binaryMode)}</div>
                <div class="station01-param-slider">
                    <div><span>阈值滑块</span><strong id="thresholdValue">${state.threshold}</strong></div>
                    <input id="thresholdInput" type="range" min="0" max="255" value="${state.threshold}" ${state.binaryMode === "otsu" ? "disabled" : ""}>
                </div>`;
        } else if (state.selectedTask === "channel") {
            html = `
                <div class="station01-param-group"><div class="station01-param-title">通道选择</div>${radioGroup("channel", [
                    { value: "red", label: "R 通道" },
                    { value: "green", label: "G 通道" },
                    { value: "blue", label: "B 通道" }
                ], state.channel)}</div>
                <div class="station01-param-group"><div class="station01-param-title">显示模式</div>${radioGroup("channelMode", [
                    { value: "color", label: "原色通道" },
                    { value: "gray", label: "灰度强度" }
                ], state.channelMode)}</div>`;
        } else if (state.selectedTask === "hsv") {
            html = `<div class="station01-param-group"><div class="station01-param-title">HSV 分量</div>${radioGroup("hsvChannel", [
                { value: "h", label: "H" },
                { value: "s", label: "S" },
                { value: "v", label: "V" },
                { value: "composite", label: "HSV 合成" }
            ], state.hsvChannel)}</div>`;
        } else if (state.selectedTask === "equalize") {
            html = `<div class="station01-param-group"><div class="station01-param-title">均衡化模式</div>${radioGroup("equalizeMode", [
                { value: "gray", label: "灰度图" },
                { value: "rgb", label: "RGB 分通道" }
            ], state.equalizeMode)}</div>`;
        } else if (state.selectedTask === "invert") {
            html = `<div class="station01-param-group"><div class="station01-param-title">反色模式</div>${radioGroup("invertMode", [
                { value: "rgb", label: "RGB 反色" },
                { value: "gray", label: "灰度反色" }
            ], state.invertMode)}</div>`;
        } else {
            html = `<div class="station01-param-group"><div class="station01-param-title">几何变换</div>${radioGroup("geometryOperation", [
                { value: "flip_horizontal", label: "水平翻转" },
                { value: "flip_vertical", label: "垂直翻转" },
                { value: "rotate_90", label: "左旋 90°" },
                { value: "rotate_right_90", label: "右旋 90°" }
            ], state.geometryOperation)}</div>`;
        }
        els.paramsArea.innerHTML = html;
    }

    function renderSamples() {
        els.sampleStrip.innerHTML = samples.map((sample) => `
            <button class="station01-sample ${state.activeSampleId === sample.id ? "is-active" : ""}" type="button" data-sample="${sample.id}">
                <img src="${sample.src}" alt="${sample.name}">
                <strong>${sample.name}</strong>
            </button>
        `).join("");
    }

    function renderPreviewStrip() {
        els.previewStrip.innerHTML = previewDefinitions.map((item) => {
            const cached = item.key === "original" ? state.imageUrl : resultCache.get(item.key)?.image;
            const isActive = state.previewKey === item.key;
            const isCurrentTask = currentPreviewKey() === item.key;
            return `
                <button class="station01-preview ${isActive ? "is-active" : ""}" type="button" data-preview="${item.key}">
                    <span class="station01-preview-thumb-wrap">
                        ${cached ? `<img class="station01-preview-thumb" src="${cached}" alt="${item.title}">` : `<span class="station01-preview-placeholder"></span>`}
                    </span>
                    <strong>${item.title}</strong>
                    <small>${item.desc}</small>
                    ${isCurrentTask ? `<em>当前任务</em>` : ""}
                </button>
            `;
        }).join("");
    }

    function renderFlow(activeIndex = state.activeFlowIndex) {
        const key = state.selectedTask;
        const steps = flows[key] || flows.grayscale;
        state.activeFlowIndex = activeIndex;
        els.flowSteps.innerHTML = steps.map((step, index) => `
            <div class="${index < activeIndex ? "is-done" : ""} ${index === activeIndex ? "is-active" : ""}">
                <span>${index + 1}</span><strong>${step}</strong>
            </div>
        `).join("");
    }

    function animateFlow() {
        const steps = flows[state.selectedTask] || flows.grayscale;
        renderFlow(0);
        steps.forEach((_, index) => {
            window.setTimeout(() => renderFlow(index), index * 120);
        });
        window.setTimeout(() => renderFlow(steps.length - 1), steps.length * 120);
    }

    function outputLabelFor(data = state.currentResult) {
        const operation = data?.info?.operation || getSelectedOperation();
        return outputTypeText[operation] || "处理结果";
    }

    function paramLabelForResult(data) {
        const info = data?.info || {};
        if (info.operation === "grayscale") return methodText[info.method] || methodText[state.method];
        if (info.operation === "binary") return info.binary_mode === "otsu" ? "OTSU" : `T=${info.threshold ?? state.threshold}`;
        if (info.operation === "channel") return `${channelText[info.channel] || channelText[state.channel]} · ${info.channel_mode === "gray" ? "灰度强度" : "原色通道"}`;
        if (info.operation === "hsv") return { h: "H", s: "S", v: "V", composite: "HSV 合成" }[info.hsv_channel] || "HSV";
        if (info.operation === "equalize") return info.equalize_mode === "rgb" ? "RGB 分通道" : "灰度图";
        if (info.operation === "invert") return info.invert_mode === "gray" ? "灰度反色" : "RGB 反色";
        return currentParamLabel();
    }

    function updateSummary(histogram = state.currentResult?.histogram || []) {
        const stats = histogramStats(histogram);
        const pixels = state.imageWidth && state.imageHeight ? state.imageWidth * state.imageHeight : 0;
        els.summaryChannels.textContent = state.currentResult?.info?.channels || "3 (RGB)";
        els.summaryPixels.textContent = pixels ? pixels.toLocaleString("zh-CN") : "-";
        els.summaryMean.textContent = stats.total ? stats.avg.toFixed(2) : "-";
        els.summaryMin.textContent = stats.total ? stats.min : "-";
        els.summaryMax.textContent = stats.total ? stats.max : "-";
        els.summaryStd.textContent = stats.total ? stats.std.toFixed(2) : "-";
        els.summaryPeak.textContent = stats.total ? `${stats.peak} (${stats.peakCount.toLocaleString("zh-CN")})` : "-";
        els.histogramMeta.textContent = stats.total ? `Mean ${stats.avg.toFixed(1)} · Peak ${stats.peak}` : "Mean - · Peak -";
    }

    function updateLabelsAndInfo() {
        const resultInfo = state.currentResult?.info;
        const displayWidth = resultInfo?.width || state.imageWidth;
        const displayHeight = resultInfo?.height || state.imageHeight;
        const sizeText = displayWidth && displayHeight ? `${displayWidth} × ${displayHeight}` : "-";
        const elapsed = state.currentResult?.elapsed_ms;
        const resultOperation = resultInfo?.operation || getSelectedOperation();
        const resultName = operationText[resultOperation] || "处理结果";

        els.statusTask.textContent = activeTaskTitle();
        els.statusSize.textContent = sizeText;
        els.statusTime.textContent = Number.isFinite(elapsed) ? `${elapsed} ms` : "-";
        els.statusOutputType.textContent = outputLabelFor();
        els.resultLabel.textContent = `结果：${resultName}`;
        els.infoName.textContent = state.filename;
        els.infoResolution.textContent = sizeText;
        els.infoChannels.textContent = resultInfo?.channels || "3 (RGB)";
        els.infoSize.textContent = state.fileSize;
        els.infoPixels.textContent = state.imageWidth && state.imageHeight ? (state.imageWidth * state.imageHeight).toLocaleString("zh-CN") : "-";
        els.infoTask.textContent = resultInfo?.operation
            ? `${operationText[resultInfo.operation] || resultInfo.operation}（${paramLabelForResult(state.currentResult)}）`
            : activeTaskTitle();
        els.infoTimeStat.textContent = Number.isFinite(elapsed) ? `${elapsed} ms` : "-";
        updateSummary();
    }

    function drawHistogram(histogram, compareHistogram = null) {
        const data = Array.isArray(histogram) && histogram.length ? histogram : new Array(256).fill(0);
        updateSummary(data);
        if (!histogramChart) {
            els.histogramChart.textContent = "ECharts 加载后将在这里显示灰度直方图";
            return;
        }

        const stats = histogramStats(data);
        const series = [{
            type: "bar",
            name: "当前结果",
            data,
            barWidth: "88%",
            animationDuration: 620,
            animationEasing: "cubicOut",
            itemStyle: { color: "#2563eb", borderRadius: [2, 2, 0, 0] },
            markLine: {
                symbol: "none",
                label: { color: "#0f172a", formatter: "{b}" },
                lineStyle: { width: 2 },
                data: [
                    { name: `Mean ${stats.avg.toFixed(1)}`, xAxis: Math.round(stats.avg), lineStyle: { color: "#0f766e", type: "solid" } },
                    { name: `Peak ${stats.peak}`, xAxis: stats.peak, lineStyle: { color: "#f59e0b", type: "dashed" } }
                ]
            }
        }];

        if (state.selectedTask === "binary") {
            series[0].markLine.data.push({
                name: `T ${state.currentResult?.info?.threshold ?? state.threshold}`,
                xAxis: state.currentResult?.info?.threshold ?? state.threshold,
                lineStyle: { color: "#ef4444", type: "solid" }
            });
        }

        if (Array.isArray(compareHistogram) && compareHistogram.length) {
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
            animation: true,
            grid: { left: 42, right: 18, top: 28, bottom: 30 },
            tooltip: {
                trigger: "axis",
                backgroundColor: "rgba(15,23,42,0.94)",
                borderWidth: 0,
                textStyle: { color: "#fff" },
                formatter(params) {
                    const item = params.find((entry) => entry.seriesType === "bar") || params[0];
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
        }, true);
    }

    function noteCard(title, body, extraClass = "") {
        return `<section class="station01-note-card ${extraClass}"><h4>${title}</h4>${body}</section>`;
    }

    function renderNotes() {
        const stats = histogramStats(state.currentResult?.histogram || []);
        const task = state.selectedTask;
        let html = "";
        if (task === "grayscale") {
            html += noteCard("当前算法说明", "<p>将 RGB 三通道按感知权重合成为单通道亮度图。</p>");
            html += noteCard("核心公式", "<code>Gray(x,y) = 0.299R + 0.587G + 0.114B</code>");
            html += noteCard("观察提示", "<p>灰度图更突出亮度结构，适合作为边缘检测、特征提取和阈值分割前处理。</p>");
        } else if (task === "binary") {
            html += noteCard("当前算法说明", "<p>先将图像转换为灰度，再用阈值把像素划分为前景和背景。</p>");
            html += noteCard("核心公式", "<code>Binary(x,y)=255 if Gray(x,y) ≥ T else 0</code>");
            html += noteCard("观察提示", "<p>拖动阈值线时，亮度高于 T 的区域会进入前景，低于 T 的区域进入背景。</p>");
        } else if (task === "channel") {
            html += noteCard("当前算法说明", "<p>将彩色图像的 R、G、B 三个矩阵拆开，观察单通道对图像结构的贡献。</p>");
            html += noteCard("核心公式", "<code>I(x,y) = [R(x,y), G(x,y), B(x,y)]</code>");
            html += noteCard("观察提示", "<p>不同通道的亮暗分布常反映物体颜色、材质和光照差异。</p>");
        } else if (task === "hsv") {
            html += noteCard("当前算法说明", "<p>HSV 将颜色拆成色相、饱和度和明度，比 RGB 更适合颜色筛选。</p>");
            html += noteCard("核心概念", "<p>H 表示颜色角度，S 表示颜色纯度，V 表示明暗强度。</p>");
            html += noteCard("观察提示", "<p>HSV 分量能把颜色信息和亮度信息拆开，便于后续分割。</p>");
        } else if (task === "equalize") {
            html += noteCard("当前算法说明", "<p>统计灰度直方图，计算 CDF 后把集中灰度重新映射到更宽范围。</p>");
            html += noteCard("核心公式", "<code>s = round((CDF(r)-CDFmin)/(N-CDFmin) × 255)</code>");
            html += noteCard("观察提示", `<p>均衡化后峰值灰度为 ${stats.peak}，标准差 ${stats.std.toFixed(2)}，对比度通常更强。</p>`, "has-cdf");
        } else if (task === "geometry") {
            const relation = {
                flip_horizontal: "x' = W - 1 - x, y' = y",
                flip_vertical: "x' = x, y' = H - 1 - y",
                rotate_90: "x' = y, y' = W - 1 - x",
                rotate_right_90: "x' = H - 1 - y, y' = x"
            }[getSelectedOperation()];
            html += noteCard("当前算法说明", "<p>几何变换不改变像素颜色，只改变像素在矩阵中的坐标位置。</p>");
            html += noteCard("坐标映射公式", `<code>${relation}</code>`);
            html += noteCard("观察提示", "<p>画布上的浅色网格可帮助观察坐标映射、翻转和旋转方向。</p>");
        } else {
            html += noteCard("当前算法说明", "<p>反色把每个颜色通道映射为 255 减去原强度。</p>");
            html += noteCard("核心公式", "<code>R'=255-R, G'=255-G, B'=255-B</code>");
            html += noteCard("观察提示", "<p>反色会交换亮暗关系，也能快速观察颜色空间中的互补变化。</p>");
        }
        els.notesPanel.innerHTML = html;
    }

    function renderHistory() {
        if (!historyRows.length) {
            els.historyList.innerHTML = `<div class="station01-history-empty">暂无处理记录</div>`;
            return;
        }
        els.historyList.innerHTML = historyRows.slice(0, 3).map((row) => `
            <div class="station01-history-row">
                <time>${row.time}</time>
                <span title="${row.task}">${row.task}</span>
                <span title="${row.param}">${row.param}</span>
                <span>${row.elapsed}</span>
            </div>
        `).join("");
    }

    function addHistory(data) {
        const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        historyRows.unshift({
            time: now,
            task: operationText[data.info.operation] || data.info.operation,
            param: paramLabelForResult(data),
            elapsed: `${data.elapsed_ms} ms`
        });
        while (historyRows.length > 8) historyRows.pop();
        renderHistory();
    }

    function setCompareSplit(percent) {
        const clamped = Math.min(100, Math.max(0, percent));
        els.compareStage.style.setProperty("--split", `${clamped}%`);
        els.compareHandle.setAttribute("aria-valuenow", Math.round(clamped).toString());
    }

    function setCompareByClientX(clientX) {
        const rect = els.compareStage.getBoundingClientRect();
        if (!rect.width) return;
        setCompareSplit(((clientX - rect.left) / rect.width) * 100);
    }

    function sweepCompare() {
        els.compareStage.classList.remove("is-sweeping");
        void els.compareStage.offsetWidth;
        els.compareStage.classList.add("is-sweeping");
        setCompareSplit(4);
        window.setTimeout(() => setCompareSplit(96), 80);
        window.setTimeout(() => setCompareSplit(50), 920);
        window.setTimeout(() => els.compareStage.classList.remove("is-sweeping"), 1180);
    }

    function setBusy(isBusy) {
        document.querySelector(".station01-left")?.classList.toggle("is-loading", isBusy);
        els.compareStage.classList.toggle("is-processing", isBusy);
    }

    function renderProbe(pixel, renderPoint = null) {
        if (!pixel) {
            state.lastPixel = null;
            els.probeCoord.textContent = "-";
            els.probeR.textContent = "-";
            els.probeG.textContent = "-";
            els.probeB.textContent = "-";
            els.probeGray.textContent = "-";
            els.probeHsv.textContent = "-";
            [els.probeRBar, els.probeGBar, els.probeBBar, els.probeGrayBar].forEach((bar) => { bar.style.width = "0%"; });
            els.grayCalc.textContent = "RGB → Gray";
            els.probeLockState.textContent = "实时";
            return;
        }

        const gray = grayValue(pixel.r, pixel.g, pixel.b);
        const hsv = rgbToHsv(pixel.r, pixel.g, pixel.b);
        state.lastPixel = pixel;
        els.probeCoord.textContent = `(${pixel.x}, ${pixel.y})`;
        els.probeR.textContent = pixel.r;
        els.probeG.textContent = pixel.g;
        els.probeB.textContent = pixel.b;
        els.probeGray.textContent = gray;
        els.probeHsv.textContent = `${hsv.h}° / ${hsv.s}% / ${hsv.v}%`;
        els.probeRBar.style.width = `${pixel.r / 255 * 100}%`;
        els.probeGBar.style.width = `${pixel.g / 255 * 100}%`;
        els.probeBBar.style.width = `${pixel.b / 255 * 100}%`;
        els.probeGrayBar.style.width = `${gray / 255 * 100}%`;
        els.grayCalc.textContent = `0.299×${pixel.r} + 0.587×${pixel.g} + 0.114×${pixel.b} = ${gray}`;
        els.grayCalc.classList.remove("is-pulsing");
        void els.grayCalc.offsetWidth;
        els.grayCalc.classList.add("is-pulsing");
        els.probeLockState.textContent = state.probeLocked ? "已固定" : "实时";

        if (renderPoint) {
            els.compareStage.style.setProperty("--probe-x", `${renderPoint.x}px`);
            els.compareStage.style.setProperty("--probe-y", `${renderPoint.y}px`);
            els.probeBubble.textContent = `(${pixel.x}, ${pixel.y}) · RGB ${pixel.r},${pixel.g},${pixel.b}`;
        }
    }

    function resetProbe() {
        state.probeLocked = false;
        renderProbe(null);
        els.compareStage.classList.remove("has-probe");
    }

    function pixelFromEvent(event) {
        if (!sourceCanvas.width || !sourceCanvas.height) return null;
        const frame = els.compareStage.querySelector(".station01-compare-frame");
        const rect = frame.getBoundingClientRect();
        const scale = Math.min(rect.width / sourceCanvas.width, rect.height / sourceCanvas.height);
        const renderWidth = sourceCanvas.width * scale;
        const renderHeight = sourceCanvas.height * scale;
        const offsetX = (rect.width - renderWidth) / 2;
        const offsetY = (rect.height - renderHeight) / 2;
        const localX = event.clientX - rect.left - offsetX;
        const localY = event.clientY - rect.top - offsetY;
        if (localX < 0 || localY < 0 || localX > renderWidth || localY > renderHeight) return null;
        const x = Math.min(sourceCanvas.width - 1, Math.floor(localX / scale));
        const y = Math.min(sourceCanvas.height - 1, Math.floor(localY / scale));
        const [r, g, b] = sourceCtx.getImageData(x, y, 1, 1).data;
        return {
            pixel: { x, y, r, g, b },
            renderPoint: { x: offsetX + localX, y: offsetY + localY }
        };
    }

    function updateProbeFromEvent(event, lock = false) {
        const result = pixelFromEvent(event);
        if (!result) {
            if (!state.probeLocked) els.compareStage.classList.remove("has-probe");
            return;
        }
        if (lock) state.probeLocked = !state.probeLocked || state.lastPixel?.x !== result.pixel.x || state.lastPixel?.y !== result.pixel.y;
        if (!state.probeLocked || lock) {
            els.compareStage.classList.add("has-probe");
            renderProbe(result.pixel, result.renderPoint);
            renderNotes();
        }
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

    async function requestProcess(params, requestId) {
        if (!state.selectedFile) throw new Error("未选择图片");
        if (computeMode("grayscale") === "frontend") return requestId === state.requestId ? processImageClient(params) : null;

        const formData = new FormData();
        formData.append("image", state.selectedFile);
        Object.entries(params).forEach(([key, value]) => formData.append(key, value));
        const response = await fetch(cvclassUrl("/process"), { method: "POST", body: formData });
        const data = await response.json();
        if (requestId !== state.requestId) return null;
        if (response.status === 409 && data.compute_mode === "frontend") return processImageClient(params);
        if (!response.ok) throw new Error(data.error || "图像处理失败");
        data.info.channels = resolveOutputChannels(params);
        return data;
    }

    function applyResult(data, previewKey = state.previewKey, writeHistory = true) {
        state.currentResult = data;
        resultCache.set(previewKey, data);
        els.beforeImage.src = state.imageUrl;
        els.afterImage.src = data.image;
        els.compareStage.classList.remove("is-empty");
        els.compareEmpty.classList.add("is-hidden");
        els.compareStage.classList.toggle("is-geometry", ["flip_horizontal", "flip_vertical", "rotate_90", "rotate_right_90"].includes(data.info.operation));
        setCompareSplit(state.compareMode ? 50 : 0);
        const compareHistogram = state.selectedTask === "equalize" ? state.originalHistogram : null;
        drawHistogram(data.histogram, compareHistogram);
        updateLabelsAndInfo();
        renderNotes();
        renderPreviewStrip();
        if (writeHistory) addHistory(data);
        setMessage(`处理完成：${operationText[data.info.operation] || data.info.operation} · ${data.elapsed_ms} ms`, "success");
        window.setTimeout(() => setMessage("", "normal"), 1300);
        sweepCompare();
    }

    async function processCurrent() {
        if (!state.selectedFile) return;
        const requestId = ++state.requestId;
        const previewKey = currentPreviewKey();
        state.previewKey = previewKey;
        setBusy(true);
        setMessage(`正在执行：${activeTaskTitle()}`, "success");
        animateFlow();
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
            if (!data || requestId !== state.requestId) return;
            applyResult(data, previewKey, true);
        } catch (error) {
            if (requestId !== state.requestId) return;
            setMessage(error.message || "图像处理失败，请检查图片后重试。", "error");
            drawHistogram([]);
        } finally {
            if (requestId === state.requestId) setBusy(false);
        }
    }

    const debouncedProcess = debounce(processCurrent, 220);

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
                if (baseRequestId !== state.requestId) return;
                console.debug("preview warmup skipped", key, error?.message || error);
            }
        }
    }

    function loadFile(file, sampleId = "") {
        state.requestId += 1;
        resultCache.clear();
        resetProbe();
        els.compareStage.classList.add("is-empty");
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
        setMessage("正在读取图片...", "success");

        const reader = new FileReader();
        reader.onload = (event) => {
            state.imageUrl = event.target.result;
            els.beforeImage.src = state.imageUrl;
            const image = new Image();
            image.onload = () => {
                cacheOriginalImage(image);
                els.compareStage.classList.remove("is-empty");
                els.compareEmpty.classList.add("is-hidden");
                updateLabelsAndInfo();
                drawHistogram(state.originalHistogram);
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
            setMessage(`正在加载示例图：${sample.name}`, "success");
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
            els.compareStage.classList.remove("is-geometry");
            drawHistogram(state.originalHistogram);
            updateLabelsAndInfo();
            renderNotes();
            renderPreviewStrip();
            sweepCompare();
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
        setBusy(true);
        setMessage("正在生成结果预览...", "success");
        try {
            const data = await requestProcess(params, requestId);
            if (!data) return;
            applyResult(data, key, true);
        } catch (error) {
            if (requestId !== state.requestId) return;
            setMessage(error.message || "结果预览生成失败。", "error");
        } finally {
            if (requestId === state.requestId) setBusy(false);
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
        if (name === "invertMode") state.invertMode = value;
        if (name === "geometryOperation") state.geometryOperation = value;
    }

    function bindEvents() {
        els.operationList.addEventListener("click", (event) => {
            const button = event.target.closest("[data-task]");
            if (!button) return;
            state.selectedTask = button.dataset.task;
            state.previewKey = currentPreviewKey();
            renderOperations();
            renderParams();
            renderFlow(0);
            updateLabelsAndInfo();
            renderPreviewStrip();
            renderNotes();
            debouncedProcess();
        });

        els.paramsArea.addEventListener("change", (event) => {
            const input = event.target;
            if (!input.matches("input[type='radio']")) return;
            setStateFromInput(input);
            renderParams();
            renderFlow(0);
            updateLabelsAndInfo();
            renderPreviewStrip();
            renderNotes();
            debouncedProcess();
        });

        els.paramsArea.addEventListener("input", (event) => {
            if (event.target.id !== "thresholdInput") return;
            state.threshold = Number(event.target.value);
            const valueEl = $("thresholdValue");
            if (valueEl) valueEl.textContent = state.threshold;
            updateLabelsAndInfo();
            debouncedProcess();
        });

        els.sampleStrip.addEventListener("click", (event) => {
            const button = event.target.closest("[data-sample]");
            if (!button) return;
            const sample = samples.find((item) => item.id === button.dataset.sample);
            if (sample) loadSample(sample);
        });

        els.reloadSamplesButton.addEventListener("click", () => {
            loadSample(samples.find((item) => item.id === defaultSampleId) || samples[0]);
        });

        els.imageInput.addEventListener("change", () => loadFile(els.imageInput.files[0]));

        ["dragenter", "dragover"].forEach((eventName) => {
            els.dropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                els.dropZone.classList.add("is-dragging");
            });
        });

        els.dropZone.addEventListener("dragleave", (event) => {
            if (!els.dropZone.contains(event.relatedTarget)) els.dropZone.classList.remove("is-dragging");
        });

        els.dropZone.addEventListener("drop", (event) => {
            event.preventDefault();
            els.dropZone.classList.remove("is-dragging");
            loadFile(event.dataTransfer.files[0]);
        });

        els.previewStrip.addEventListener("click", (event) => {
            const button = event.target.closest("[data-preview]");
            if (button) handlePreviewClick(button.dataset.preview);
        });

        els.compareStage.addEventListener("pointerdown", (event) => {
            if (els.compareStage.classList.contains("is-empty")) return;
            if (event.target.closest(".station01-compare-handle")) {
                state.draggingCompare = true;
                els.compareStage.setPointerCapture(event.pointerId);
                setCompareByClientX(event.clientX);
            } else {
                updateProbeFromEvent(event, true);
            }
        });

        els.compareStage.addEventListener("pointermove", (event) => {
            if (els.compareStage.classList.contains("is-empty")) return;
            if (state.draggingCompare) setCompareByClientX(event.clientX);
            updateProbeFromEvent(event, false);
        });

        els.compareStage.addEventListener("pointerup", () => {
            state.draggingCompare = false;
        });

        els.compareStage.addEventListener("pointercancel", () => {
            state.draggingCompare = false;
        });

        els.compareStage.addEventListener("pointerleave", () => {
            if (!state.probeLocked) els.compareStage.classList.remove("has-probe");
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
            anchor.download = `station01_${state.previewKey}_${state.filename.replace(/\.[^.]+$/, "") || "image"}.png`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        });

        els.clearHistoryButton.addEventListener("click", () => {
            historyRows.length = 0;
            renderHistory();
        });

        window.addEventListener("resize", () => histogramChart?.resize());
    }

    function init() {
        renderOperations();
        renderParams();
        renderSamples();
        renderPreviewStrip();
        renderFlow(0);
        renderHistory();
        renderNotes();
        resetProbe();
        updateLabelsAndInfo();
        drawHistogram([]);
        bindEvents();
        loadSample(samples.find((item) => item.id === defaultSampleId) || samples[0]);
    }

    init();
})();
