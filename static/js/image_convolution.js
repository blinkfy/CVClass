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
let originalUrl = null;
let currentKernelLabel = imageKernelTemplates.box_blur.label;
let currentViewMode = "side";

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
    if (originalUrl) {
        URL.revokeObjectURL(originalUrl);
    }
    originalUrl = URL.createObjectURL(file);
    imageConvEls.original.src = originalUrl;
    imageConvEls.original.classList.add("is-visible");
    syncSliderSources();
    imageConvEls.message.textContent = `已选择：${file.name}`;
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

    const formData = new FormData();
    formData.append("image", currentFile);
    formData.append("kernel", JSON.stringify(currentKernel));
    formData.append("padding", imageConvEls.padding.value);
    formData.append("stride", imageConvEls.stride.value);
    formData.append("display_mode", imageConvEls.displayMode?.value || "auto");

    imageConvEls.message.textContent = "后端正在使用 NumPy 执行卷积...";
    imageConvEls.apply.disabled = true;

    try {
        const response = await fetch(cvclassUrl("/convolve-image"), {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "卷积处理失败");
        }

        imageConvEls.result.src = data.image;
        imageConvEls.result.classList.add("is-visible");
        syncSliderSources();
        imageConvEls.size.textContent = `${data.width} × ${data.height}`;
        imageConvEls.message.textContent = "卷积完成。";
        if (currentViewMode === "slider" && imageConvEls.sliderRange) {
            imageConvEls.sliderRange.value = "50";
            updateSliderMask();
        }
        setMeta([
            `当前卷积核：${currentKernelLabel}`,
            `kernel size：${currentKernel.length} × ${currentKernel.length}`,
            `padding：${data.padding}`,
            `stride：${data.stride}`,
            `显示方式：${data.display_mode || imageConvEls.displayMode?.value || "auto"}`,
            `输出范围：${data.min} ~ ${data.max}`,
            `处理耗时：${data.elapsed_ms} ms`
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
