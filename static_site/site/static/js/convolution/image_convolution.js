const imageConvEls = {
    template: document.getElementById("imageKernelTemplate"),
    kernelSize: document.getElementById("imageKernelSize"),
    padding: document.getElementById("imageConvPadding"),
    stride: document.getElementById("imageConvStride"),
    displayMode: document.getElementById("imageConvDisplayMode"),
    kernelGrid: document.getElementById("imageKernelGrid"),
    randomKernel: document.getElementById("imageKernelRandomBtn"),
    input: document.getElementById("imageConvInput"),
    drop: document.getElementById("imageConvDrop"),
    original: document.getElementById("imageConvOriginal"),
    result: document.getElementById("imageConvResult"),
    apply: document.getElementById("imageConvApplyBtn"),
    message: document.getElementById("imageConvMessage"),
    meta: document.getElementById("imageConvMeta"),
    size: document.getElementById("imageConvSize"),
    kernelName: document.getElementById("imageConvKernelName"),
    comparePanel: document.querySelector(".image-compare-panel"),
    compareGrid: document.getElementById("imageCompareGrid"),
    sliderStage: document.getElementById("imageSliderStage"),
    sliderOriginal: document.getElementById("imageSliderOriginal"),
    sliderResult: document.getElementById("imageSliderResult"),
    sliderHandle: document.getElementById("imageSliderHandle"),
    sliderRange: document.getElementById("imageSliderRange"),
    viewButtons: document.querySelectorAll(".view-switch-btn")
};

const imageKernelTemplates = {
    identity: {
        label: "Identity 原图保持",
        matrix: [[0, 0, 0], [0, 1, 0], [0, 0, 0]]
    },
    box_blur: {
        label: "Box Blur 均值模糊",
        matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]]
    },
    sharpen: {
        label: "Sharpen 锐化",
        matrix: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]
    },
    edge: {
        label: "Edge 边缘检测",
        matrix: [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]
    },
    sobel_x: {
        label: "Sobel X",
        matrix: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
    },
    sobel_y: {
        label: "Sobel Y",
        matrix: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
    },
    emboss: {
        label: "Emboss 浮雕",
        matrix: [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]]
    },
    gaussian_5: {
        label: "Gaussian 5×5",
        matrix: [
            [1, 4, 6, 4, 1],
            [4, 16, 24, 16, 4],
            [6, 24, 36, 24, 6],
            [4, 16, 24, 16, 4],
            [1, 4, 6, 4, 1]
        ]
    }
};

let currentKernel = imageKernelTemplates.box_blur.matrix.map((row) => row.slice());
let currentFile = null;
let currentImageData = null;
let originalUrl = null;
let currentKernelLabel = imageKernelTemplates.box_blur.label;
let currentViewMode = "side";
let currentLoadToken = 0;

function computeMode(feature) {
    return window.CVCLASS_COMPUTE_CONFIG?.[feature] || "backend";
}

function cloneMatrix(matrix) {
    return matrix.map((row) => row.slice());
}

function suggestDisplayMode(templateName, size) {
    if (size === 1) {
        return "clip";
    }
    if (["sharpen", "edge", "sobel_x", "sobel_y", "emboss"].includes(templateName)) {
        return "clip";
    }
    if (["box_blur", "gaussian_5", "identity"].includes(templateName)) {
        return "normalize";
    }
    return "auto";
}

function makeRandomKernel(size) {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => Math.floor(Math.random() * 3))
    );
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sumKernel(kernel) {
    return kernel.reduce((total, row) => total + row.reduce((rowTotal, value) => rowTotal + value, 0), 0);
}

function loadImageDataFromFile(file) {
    return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            try {
                const width = image.naturalWidth || image.width;
                const height = image.naturalHeight || image.height;
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) {
                    throw new Error("浏览器不支持 Canvas 2D 上下文");
                }

                context.drawImage(image, 0, 0, width, height);
                const imageData = context.getImageData(0, 0, width, height);
                URL.revokeObjectURL(imageUrl);
                resolve({ imageData, width, height });
            } catch (error) {
                URL.revokeObjectURL(imageUrl);
                reject(error);
            }
        };

        image.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error("图片加载失败，请重试"));
        };

        image.src = imageUrl;
    });
}

function extractAlphaChannel(imageData) {
    const { data } = imageData;
    const alpha = new Uint8ClampedArray(imageData.width * imageData.height);

    for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
        alpha[pixel] = data[index + 3];
    }

    return alpha;
}

function scaleAlphaChannel(alphaChannel, sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
        return alphaChannel;
    }

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) {
        throw new Error("浏览器不支持 Canvas 2D 上下文");
    }

    const sourceImageData = sourceContext.createImageData(sourceWidth, sourceHeight);
    for (let index = 0, pixel = 0; pixel < alphaChannel.length; index += 4, pixel += 1) {
        const value = alphaChannel[pixel];
        sourceImageData.data[index] = value;
        sourceImageData.data[index + 1] = value;
        sourceImageData.data[index + 2] = value;
        sourceImageData.data[index + 3] = 255;
    }
    sourceContext.putImageData(sourceImageData, 0, 0);

    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = targetWidth;
    targetCanvas.height = targetHeight;
    const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
    if (!targetContext) {
        throw new Error("浏览器不支持 Canvas 2D 上下文");
    }

    targetContext.imageSmoothingEnabled = true;
    targetContext.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
    const resized = targetContext.getImageData(0, 0, targetWidth, targetHeight).data;
    const alpha = new Uint8ClampedArray(targetWidth * targetHeight);

    for (let index = 0, pixel = 0; pixel < alpha.length; index += 4, pixel += 1) {
        alpha[pixel] = resized[index];
    }

    return alpha;
}

function convolveImageData(imageData, kernel, padding, stride, displayMode) {
    const sourceWidth = imageData.width;
    const sourceHeight = imageData.height;
    const source = imageData.data;
    const kernelSize = kernel.length;
    const normalizedKernel = kernel.map((row) => row.map((value) => Number(value)));

    if (!normalizedKernel.every((row) => Array.isArray(row) && row.length === kernelSize)) {
        throw new Error("卷积核必须是方阵");
    }
    if (![1, 3, 5].includes(kernelSize)) {
        throw new Error("卷积核大小必须是 1、3 或 5");
    }

    const hasNegative = normalizedKernel.some((row) => row.some((value) => value < 0));
    const kernelSum = sumKernel(normalizedKernel);
    const effectiveKernel = normalizedKernel.map((row) => row.slice());

    if (kernelSum > 1 && !hasNegative) {
        for (let r = 0; r < kernelSize; r += 1) {
            for (let c = 0; c < kernelSize; c += 1) {
                effectiveKernel[r][c] /= kernelSum;
            }
        }
    }

    const safePadding = padding === null || padding === undefined ? Math.floor(kernelSize / 2) : Number(padding);
    const safeStride = Number(stride);

    if (!Number.isInteger(safePadding) || safePadding < 0) {
        throw new Error("padding 必须是非负整数");
    }
    if (!Number.isInteger(safeStride) || safeStride < 1) {
        throw new Error("stride 必须是正整数");
    }

    const outputWidth = Math.floor((sourceWidth + safePadding * 2 - kernelSize) / safeStride) + 1;
    const outputHeight = Math.floor((sourceHeight + safePadding * 2 - kernelSize) / safeStride) + 1;
    if (outputWidth <= 0 || outputHeight <= 0) {
        throw new Error("卷积核大于填充后的图片");
    }

    const resultStack = new Float32Array(outputWidth * outputHeight * 3);
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    for (let outY = 0; outY < outputHeight; outY += 1) {
        const baseY = outY * safeStride - safePadding;
        for (let outX = 0; outX < outputWidth; outX += 1) {
            const baseX = outX * safeStride - safePadding;
            let red = 0;
            let green = 0;
            let blue = 0;

            for (let kernelY = 0; kernelY < kernelSize; kernelY += 1) {
                const sourceY = clamp(baseY + kernelY, 0, sourceHeight - 1);
                for (let kernelX = 0; kernelX < kernelSize; kernelX += 1) {
                    const sourceX = clamp(baseX + kernelX, 0, sourceWidth - 1);
                    const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
                    const weight = effectiveKernel[kernelY][kernelX];
                    red += source[sourceIndex] * weight;
                    green += source[sourceIndex + 1] * weight;
                    blue += source[sourceIndex + 2] * weight;
                }
            }

            const resultIndex = (outY * outputWidth + outX) * 3;
            resultStack[resultIndex] = red;
            resultStack[resultIndex + 1] = green;
            resultStack[resultIndex + 2] = blue;

            minValue = Math.min(minValue, red, green, blue);
            maxValue = Math.max(maxValue, red, green, blue);
        }
    }

    const effectiveDisplayMode = displayMode === "auto" ? (hasNegative ? "clip" : "normalize") : displayMode;
    const alphaChannel = scaleAlphaChannel(
        extractAlphaChannel(imageData),
        sourceWidth,
        sourceHeight,
        outputWidth,
        outputHeight
    );
    const outputData = new Uint8ClampedArray(outputWidth * outputHeight * 4);

    for (let pixel = 0; pixel < outputWidth * outputHeight; pixel += 1) {
        const sourceIndex = pixel * 3;
        const targetIndex = pixel * 4;
        let red = resultStack[sourceIndex];
        let green = resultStack[sourceIndex + 1];
        let blue = resultStack[sourceIndex + 2];

        if (effectiveDisplayMode === "clip") {
            red = clamp(red, 0, 255);
            green = clamp(green, 0, 255);
            blue = clamp(blue, 0, 255);
        } else if (effectiveDisplayMode === "normalize") {
            if (maxValue > minValue) {
                const scale = 255 / (maxValue - minValue);
                red = (red - minValue) * scale;
                green = (green - minValue) * scale;
                blue = (blue - minValue) * scale;
            } else {
                red = 0;
                green = 0;
                blue = 0;
            }
        } else {
            throw new Error("无效的显示方式");
        }

        outputData[targetIndex] = clamp(Math.round(red), 0, 255);
        outputData[targetIndex + 1] = clamp(Math.round(green), 0, 255);
        outputData[targetIndex + 2] = clamp(Math.round(blue), 0, 255);
        outputData[targetIndex + 3] = alphaChannel[pixel];
    }

    return {
        imageData: new ImageData(outputData, outputWidth, outputHeight),
        width: outputWidth,
        height: outputHeight,
        min: minValue,
        max: maxValue,
        displayMode: effectiveDisplayMode
    };
}

function imageDataToUrl(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("浏览器不支持 Canvas 2D 上下文");
    }

    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
}

function syncSizeAndPadding(size) {
    imageConvEls.kernelSize.value = String(size);
    imageConvEls.padding.value = String(Math.floor(size / 2));
}

function renderKernelGrid() {
    const size = currentKernel.length;
    imageConvEls.kernelGrid.style.gridTemplateColumns = `repeat(${size}, 44px)`;
    imageConvEls.kernelGrid.innerHTML = "";

    currentKernel.forEach((row, r) => {
        row.forEach((value, c) => {
            const input = document.createElement("input");
            input.className = "image-kernel-cell";
            input.type = "number";
            input.step = "1";
            input.value = value;
            input.setAttribute("aria-label", `kernel row ${r + 1} col ${c + 1}`);
            input.addEventListener("input", () => {
                const next = Number(input.value);
                currentKernel[r][c] = Number.isFinite(next) ? next : 0;
                imageConvEls.template.value = "custom";
            });
            imageConvEls.kernelGrid.appendChild(input);
        });
    });
}

function applyTemplate() {
    const template = imageKernelTemplates[imageConvEls.template.value];
    if (!template) {
        return;
    }

    currentKernel = cloneMatrix(template.matrix);
    currentKernelLabel = template.label;
    syncSizeAndPadding(currentKernel.length);
    if (imageConvEls.displayMode) {
        imageConvEls.displayMode.value = suggestDisplayMode(imageConvEls.template.value, currentKernel.length);
    }
    renderKernelGrid();
    refreshKernelSummary();
    refreshKernelMeta();
}

function resizeKernel(size) {
    const next = makeRandomKernel(size);
    const copySize = Math.min(size, currentKernel.length);
    for (let r = 0; r < copySize; r += 1) {
        for (let c = 0; c < copySize; c += 1) {
            next[r][c] = currentKernel[r][c];
        }
    }
    currentKernel = next;
    imageConvEls.template.value = "custom";
    currentKernelLabel = "自定义卷积核";
    if (imageConvEls.displayMode) {
        imageConvEls.displayMode.value = suggestDisplayMode("custom", currentKernel.length);
    }
    renderKernelGrid();
    refreshKernelSummary();
    refreshKernelMeta();
}

function refreshKernelSummary() {
    if (imageConvEls.kernelName) {
        imageConvEls.kernelName.textContent = currentKernelLabel;
    }
}

function refreshKernelMeta() {
    setMeta([
        `当前卷积核：${currentKernelLabel}`,
        `kernel size：${currentKernel.length} × ${currentKernel.length}`,
        `padding：${imageConvEls.padding.value}`,
        `stride：${imageConvEls.stride.value}`,
        `显示方式：${imageConvEls.displayMode?.value || "auto"}`,
        "输出范围：-",
        "处理耗时：-"
    ]);
}

function updateOriginalPreview(file) {
    currentFile = file;
    currentImageData = null;
    const loadToken = ++currentLoadToken;
    if (originalUrl) {
        URL.revokeObjectURL(originalUrl);
    }
    originalUrl = URL.createObjectURL(file);
    imageConvEls.original.src = originalUrl;
    imageConvEls.original.classList.add("is-visible");
    syncSliderSources();
    imageConvEls.message.textContent = `已选择：${file.name}`;

    loadImageDataFromFile(file)
        .then((loaded) => {
            if (loadToken !== currentLoadToken) {
                return;
            }
            currentImageData = loaded.imageData;
            imageConvEls.message.textContent = `图片已载入：${file.name}`;
        })
        .catch((error) => {
            if (loadToken !== currentLoadToken) {
                return;
            }
            currentImageData = null;
            imageConvEls.message.textContent = error.message;
        });
}

function setMeta(items) {
    imageConvEls.meta.innerHTML = items.map((item) => `<span>${item}</span>`).join("");
}

function syncSliderSources() {
    if (imageConvEls.sliderOriginal && imageConvEls.original.src) {
        imageConvEls.sliderOriginal.src = imageConvEls.original.src;
    }
    if (imageConvEls.sliderResult && imageConvEls.result.src) {
        imageConvEls.sliderResult.src = imageConvEls.result.src;
    }
}

function updateSliderMask() {
    if (!imageConvEls.sliderStage || !imageConvEls.sliderRange) {
        return;
    }
    const percent = Number(imageConvEls.sliderRange.value || 50);
    imageConvEls.sliderStage.style.setProperty("--slider-pos", `${percent}%`);
    if (imageConvEls.sliderHandle) {
        imageConvEls.sliderHandle.style.setProperty("--slider-pos", `${percent}%`);
    }
}

function setViewMode(mode) {
    currentViewMode = mode;
    imageConvEls.viewButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.viewMode === mode);
    });

    imageConvEls.comparePanel.classList.toggle("is-result", mode === "result");
    imageConvEls.compareGrid.classList.toggle("is-hidden", mode === "slider");
    imageConvEls.sliderStage.classList.toggle("is-hidden", mode !== "slider");
    imageConvEls.sliderStage.classList.toggle("has-result", mode === "slider");

    if (mode === "slider") {
        syncSliderSources();
        if (imageConvEls.sliderRange) {
            imageConvEls.sliderRange.value = "50";
        }
        updateSliderMask();
    }
}

async function applyImageConvolution() {
    if (!currentFile) {
        imageConvEls.message.textContent = "请先上传一张图片。";
        return;
    }

    if (!currentImageData) {
        imageConvEls.message.textContent = "图片仍在加载中，请稍后再试。";
        return;
    }

    const useBackend = computeMode("image_convolution") === "backend";
    imageConvEls.message.textContent = useBackend ? "正在调用 Flask 后端执行卷积..." : "正在使用 Canvas 执行卷积...";
    imageConvEls.apply.disabled = true;

    try {
        const padding = Number(imageConvEls.padding.value);
        const stride = Number(imageConvEls.stride.value);
        const displayMode = imageConvEls.displayMode?.value || "auto";
        let result;

        if (useBackend) {
            const formData = new FormData();
            formData.append("image", currentFile);
            formData.append("kernel", JSON.stringify(currentKernel));
            formData.append("padding", String(padding));
            formData.append("stride", String(stride));
            formData.append("display_mode", displayMode);
            const response = await fetch(cvclassUrl("/convolve-image"), {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "后端卷积失败");
            }
            result = {
                imageUrl: data.image,
                width: data.width,
                height: data.height,
                min: data.min,
                max: data.max,
                displayMode: data.display_mode,
                elapsedText: `${data.elapsed_ms} ms`
            };
        } else {
            const start = performance.now();
            const localResult = convolveImageData(currentImageData, currentKernel, padding, stride, displayMode);
            result = {
                imageUrl: imageDataToUrl(localResult.imageData),
                width: localResult.width,
                height: localResult.height,
                min: localResult.min,
                max: localResult.max,
                displayMode: localResult.displayMode,
                elapsedText: `${Math.round((performance.now() - start) * 100) / 100} ms`
            };
        }

        imageConvEls.result.src = result.imageUrl;
        imageConvEls.result.classList.add("is-visible");
        syncSliderSources();
        imageConvEls.size.textContent = `${result.width} × ${result.height}`;
        imageConvEls.message.textContent = "卷积完成。";
        if (!useBackend && currentViewMode === "side") {
            setViewMode("result");
        }
        if (currentViewMode === "slider" && imageConvEls.sliderRange) {
            imageConvEls.sliderRange.value = "50";
            updateSliderMask();
        }
        setMeta([
            `当前卷积核：${currentKernelLabel}`,
            `kernel size：${currentKernel.length} × ${currentKernel.length}`,
            `padding：${padding}`,
            `stride：${stride}`,
            `显示方式：${result.displayMode}`,
            `输出范围：${Math.round(result.min)} ~ ${Math.round(result.max)}`,
            `处理耗时：${result.elapsedText}`
        ]);
    } catch (error) {
        imageConvEls.message.textContent = error.message;
    } finally {
        imageConvEls.apply.disabled = false;
    }
}

function bindDropZone() {
    ["dragenter", "dragover"].forEach((eventName) => {
        imageConvEls.drop.addEventListener(eventName, (event) => {
            event.preventDefault();
            imageConvEls.drop.classList.add("is-dragging");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        imageConvEls.drop.addEventListener(eventName, (event) => {
            event.preventDefault();
            imageConvEls.drop.classList.remove("is-dragging");
        });
    });

    imageConvEls.drop.addEventListener("drop", (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            imageConvEls.input.files = event.dataTransfer.files;
            updateOriginalPreview(file);
        }
    });
}

function initImageConvolutionPage() {
    if (!imageConvEls.kernelGrid) return;

    applyTemplate();
    refreshKernelMeta();
    refreshKernelSummary();
    setViewMode(currentViewMode);

    imageConvEls.template.addEventListener("change", applyTemplate);
    imageConvEls.kernelSize.addEventListener("change", () => {
        const size = Number(imageConvEls.kernelSize.value);
        imageConvEls.padding.value = String(Math.floor(size / 2));
        resizeKernel(size);
    });
    imageConvEls.padding.addEventListener("change", () => {
        refreshKernelMeta();
    });
    imageConvEls.stride.addEventListener("change", () => {
        refreshKernelMeta();
    });
    imageConvEls.displayMode?.addEventListener("change", refreshKernelMeta);
    imageConvEls.randomKernel.addEventListener("click", () => {
        currentKernel = makeRandomKernel(Number(imageConvEls.kernelSize.value));
        imageConvEls.template.value = "custom";
        currentKernelLabel = "自定义卷积核";
        if (imageConvEls.displayMode) {
            imageConvEls.displayMode.value = "auto";
        }
        renderKernelGrid();
        refreshKernelSummary();
        refreshKernelMeta();
    });
    imageConvEls.input.addEventListener("change", () => {
        const file = imageConvEls.input.files?.[0];
        if (file) {
            updateOriginalPreview(file);
        }
    });
    imageConvEls.apply.addEventListener("click", applyImageConvolution);
    imageConvEls.viewButtons.forEach((button) => {
        button.addEventListener("click", () => {
            setViewMode(button.dataset.viewMode);
        });
    });
    imageConvEls.sliderRange?.addEventListener("input", updateSliderMask);
    bindDropZone();
}

initImageConvolutionPage();
