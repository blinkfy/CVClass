const imageInput = document.getElementById("imageInput");
const chooseButton = document.getElementById("chooseButton");
const dropZone = document.getElementById("dropZone");
const operationSelect = document.getElementById("operationSelect");
const methodSelect = document.getElementById("methodSelect");
const channelSelect = document.getElementById("channelSelect");
const thresholdInput = document.getElementById("thresholdInput");
const thresholdValue = document.getElementById("thresholdValue");
const methodControl = document.getElementById("methodControl");
const channelControl = document.getElementById("channelControl");
const thresholdControl = document.getElementById("thresholdControl");
const grayButton = document.getElementById("grayButton");
const grayButtonText = document.getElementById("grayButtonText");
const downloadButton = document.getElementById("downloadButton");
const message = document.getElementById("message");

const compareSlider = document.getElementById("compareSlider");
const beforeImage = document.getElementById("beforeImage");
const afterImage = document.getElementById("afterImage");
const sliderHandle = document.getElementById("sliderHandle");
const methodBadge = document.getElementById("methodBadge");

const infoName = document.getElementById("infoName");
const infoResolution = document.getElementById("infoResolution");
const infoSize = document.getElementById("infoSize");
const infoTime = document.getElementById("infoTime");
const infoFormat = document.getElementById("infoFormat");
const pixelPosition = document.getElementById("pixelPosition");
const pixelRgb = document.getElementById("pixelRgb");
const pixelFormula = document.getElementById("pixelFormula");
const historyList = document.getElementById("historyList");

const histogramChartElement = document.getElementById("histogramChart");
const histogramChart = window.echarts ? echarts.init(histogramChartElement) : null;
const pixelCanvas = document.createElement("canvas");
const pixelContext = pixelCanvas.getContext("2d", { willReadFrequently: true });

let selectedFile = null;
let originalImageUrl = "";
let isDraggingSlider = false;
let latestRequestId = 0;
let lastPixel = null;
let historyCount = 0;
let currentImageMetrics = null;

const methodNames = {
    weighted: "加权平均法",
    average: "平均值法",
    max: "最大值法",
    min: "最小值法"
};

const operationNames = {
    grayscale: "灰度化",
    channel: "RGB 通道分离",
    binary: "图像二值化",
    invert: "颜色反转",
    flip_horizontal: "水平翻转",
    flip_vertical: "垂直翻转",
    rotate_90: "逆时针旋转 90°",
    equalize: "直方图均衡化"
};

const channelNames = {
    red: "红色通道",
    green: "绿色通道",
    blue: "蓝色通道"
};

function showMessage(text, type = "normal") {
    message.textContent = text;
    message.classList.toggle("success", type === "success");
    message.classList.toggle("error", type === "error");
}

function formatFileSize(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(2)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function resetDashboard() {
    infoName.textContent = "-";
    infoResolution.textContent = "-";
    infoSize.textContent = "-";
    infoTime.textContent = "-";
    infoFormat.textContent = "格式：-";
    resetPixelDemo();
    drawHistogram([]);
}

function resetResult() {
    afterImage.removeAttribute("src");
    downloadButton.removeAttribute("href");
    downloadButton.classList.add("disabled");
    compareSlider.classList.add("empty");
    compareSlider.style.setProperty("--split", "50%");
    compareSlider.style.setProperty("--slider-left", "50%");
    sliderHandle.setAttribute("aria-valuenow", "50");
    currentImageMetrics = null;
    drawHistogram([]);
}

function resetDataOnly() {
    downloadButton.removeAttribute("href");
    downloadButton.classList.add("disabled");
    drawHistogram([]);
}

function setProcessingState(isProcessing) {
    grayButton.disabled = isProcessing || !selectedFile;
    grayButtonText.textContent = isProcessing ? "处理中..." : "开始处理";
}

function setCurrentMethodLabel(method) {
    const operation = operationSelect.value;
    const parts = [operationNames[operation] || operation];

    if (operation === "grayscale" || operation === "binary" || operation === "equalize") {
        parts.push(methodNames[method] || method);
    }
    if (operation === "channel") {
        parts.push(channelNames[channelSelect.value] || channelSelect.value);
    }
    if (operation === "binary") {
        parts.push(`阈值 ${thresholdInput.value}`);
    }

    methodBadge.textContent = parts.join(" · ");
}

function updateOperationControls() {
    const operation = operationSelect.value;
    const showGrayMethod = operation === "grayscale" || operation === "binary" || operation === "equalize";
    methodControl.classList.toggle("is-hidden", !showGrayMethod);
    channelControl.classList.toggle("is-hidden", operation !== "channel");
    thresholdControl.classList.toggle("is-hidden", operation !== "binary");
    thresholdValue.textContent = thresholdInput.value;
}

function resetPixelDemo() {
    lastPixel = null;
    pixelPosition.textContent = "坐标：-";
    pixelRgb.textContent = "R = -, G = -, B = -";
    pixelFormula.textContent = "将鼠标移入图片区域，查看单个像素的灰度化计算过程。";
}

function clipGray(value) {
    return Math.trunc(Math.min(255, Math.max(0, value)));
}

function getGrayFormula(r, g, b, method) {
    if (method === "average") {
        const gray = clipGray((r + g + b) / 3);
        return {
            gray,
            text: `Gray = (R + G + B) / 3 \n= (${r} + ${g} + ${b}) / 3 \n= ${gray}`
        };
    }

    if (method === "max") {
        const gray = Math.max(r, g, b);
        return {
            gray,
            text: `Gray = max(R, G, B) \n= max(${r}, ${g}, ${b}) \n= ${gray}`
        };
    }

    if (method === "min") {
        const gray = Math.min(r, g, b);
        return {
            gray,
            text: `Gray = min(R, G, B) \n= min(${r}, ${g}, ${b}) \n= ${gray}`
        };
    }

    const gray = clipGray(0.299 * r + 0.587 * g + 0.114 * b);
    return {
        gray,
        text: `Gray = 0.299×R + 0.587×G + 0.114×B\n= 0.299×${r} + 0.587×${g} + 0.114×${b}\n= ${gray}`
    };
}

function updatePixelReadout(x, y, r, g, b) {
    const formula = getGrayFormula(r, g, b, methodSelect.value);
    lastPixel = { x, y, r, g, b };
    pixelPosition.textContent = `坐标：(${x}, ${y})`;
    pixelRgb.textContent = `R = ${r}, G = ${g}, B = ${b}`;
    pixelFormula.textContent = formula.text;
}

function cacheOriginalPixels(image) {
    pixelCanvas.width = image.naturalWidth || image.width;
    pixelCanvas.height = image.naturalHeight || image.height;
    pixelContext.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
    pixelContext.drawImage(image, 0, 0, pixelCanvas.width, pixelCanvas.height);
    currentImageMetrics = {
        width: pixelCanvas.width,
        height: pixelCanvas.height
    };
    syncCompareSliderGeometry();
}

function getImagePointFromEvent(event) {
    if (!pixelCanvas.width || !pixelCanvas.height) {
        return null;
    }

    const rect = compareSlider.getBoundingClientRect();
    const scale = Math.min(rect.width / pixelCanvas.width, rect.height / pixelCanvas.height);
    const renderWidth = pixelCanvas.width * scale;
    const renderHeight = pixelCanvas.height * scale;
    const offsetX = (rect.width - renderWidth) / 2;
    const offsetY = (rect.height - renderHeight) / 2;
    const localX = event.clientX - rect.left - offsetX;
    const localY = event.clientY - rect.top - offsetY;

    if (localX < 0 || localY < 0 || localX >= renderWidth || localY >= renderHeight) {
        return null;
    }

    return {
        x: Math.min(pixelCanvas.width - 1, Math.floor(localX / scale)),
        y: Math.min(pixelCanvas.height - 1, Math.floor(localY / scale))
    };
}

function syncCompareSliderGeometry() {
    if (!currentImageMetrics) {
        compareSlider.style.removeProperty("--image-left");
        compareSlider.style.removeProperty("--image-top");
        compareSlider.style.removeProperty("--image-width");
        compareSlider.style.removeProperty("--image-height");
        compareSlider.style.removeProperty("--slider-left");
        return;
    }

    const rect = compareSlider.getBoundingClientRect();
    const scale = Math.min(rect.width / currentImageMetrics.width, rect.height / currentImageMetrics.height);
    const renderWidth = currentImageMetrics.width * scale;
    const renderHeight = currentImageMetrics.height * scale;
    const offsetX = (rect.width - renderWidth) / 2;
    const offsetY = (rect.height - renderHeight) / 2;
    const splitPercent = parseFloat(compareSlider.style.getPropertyValue("--split")) || 50;
    const sliderLeft = offsetX + renderWidth * (splitPercent / 100);

    compareSlider.style.setProperty("--image-left", `${offsetX}px`);
    compareSlider.style.setProperty("--image-top", `${offsetY}px`);
    compareSlider.style.setProperty("--image-width", `${renderWidth}px`);
    compareSlider.style.setProperty("--image-height", `${renderHeight}px`);
    compareSlider.style.setProperty("--slider-left", `${sliderLeft}px`);
}

function updatePixelFromPointer(event) {
    if (compareSlider.classList.contains("empty")) {
        return;
    }

    const point = getImagePointFromEvent(event);
    if (!point) {
        pixelPosition.textContent = "坐标：图片外";
        return;
    }

    const [r, g, b] = pixelContext.getImageData(point.x, point.y, 1, 1).data;
    updatePixelReadout(point.x, point.y, r, g, b);
}

function refreshLastPixelFormula() {
    if (!lastPixel) {
        return;
    }
    updatePixelReadout(lastPixel.x, lastPixel.y, lastPixel.r, lastPixel.g, lastPixel.b);
}

function addHistoryRecord(data) {
    if (historyList.querySelector(".history-empty")) {
        historyList.innerHTML = "";
    }

    historyCount += 1;
    const item = document.createElement("div");
    item.className = "history-item";
    const now = new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    item.innerHTML = `
        <strong title="${data.info.filename}">${data.info.filename}</strong>
        <time>${now}</time>
        <span>${data.info.width} × ${data.info.height} · ${operationNames[data.info.operation]} · ${data.elapsed_ms} ms</span>
    `;
    historyList.prepend(item);

    while (historyList.children.length > 8) {
        historyList.lastElementChild.remove();
    }
}

function drawHistogram(histogram) {
    if (!histogramChart) {
        histogramChartElement.textContent = "ECharts 加载后将在这里显示灰度直方图";
        return;
    }

    const xData = Array.from({ length: 256 }, (_, index) => index);
    const data = histogram.length ? histogram : new Array(256).fill(0);

    histogramChart.setOption({
        color: ["#4f46e5"],
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            borderWidth: 0,
            textStyle: { color: "#fff" },
            formatter(params) {
                const item = params[0];
                return `灰度级 ${item.axisValue}<br>像素数量 ${item.data}`;
            }
        },
        grid: {
            left: 28,
            right: 18,
            top: 28,
            bottom: 30,
            containLabel: true
        },
        xAxis: {
            type: "category",
            data: xData,
            boundaryGap: false,
            axisLine: { lineStyle: { color: "#cbd5e1" } },
            axisTick: { show: false },
            axisLabel: {
                color: "#64748b",
                interval: 63
            }
        },
        yAxis: {
            type: "value",
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { color: "#94a3b8" }
        },
        series: [
            {
                name: "Pixels",
                type: "line",
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    width: 3,
                    color: "#4f46e5"
                },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: "rgba(79, 70, 229, 0.32)" },
                        { offset: 1, color: "rgba(79, 70, 229, 0.02)" }
                    ])
                },
                data
            }
        ]
    });
}

function handleFile(file) {
    latestRequestId += 1;
    selectedFile = null;
    resetDashboard();
    resetResult();

    if (!file) {
        grayButton.disabled = true;
        showMessage("未选择文件，请先上传图片", "error");
        return;
    }

    if (!file.type.startsWith("image/")) {
        grayButton.disabled = true;
        showMessage("文件类型不是图片，请重新选择", "error");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        grayButton.disabled = true;
        showMessage("文件过大，图片大小不能超过 10MB", "error");
        return;
    }

    selectedFile = file;
    infoName.textContent = file.name;
    infoSize.textContent = formatFileSize(file.size);
    infoFormat.textContent = `格式：${file.type || "未知"}`;
    showMessage(`已选择 ${file.name}，正在自动处理...`);

    const reader = new FileReader();
    reader.onload = (event) => {
        originalImageUrl = event.target.result;
        beforeImage.src = originalImageUrl;

        const image = new Image();
        image.onload = () => {
            infoResolution.textContent = `${image.width} × ${image.height}`;
            cacheOriginalPixels(image);
            processImage();
        };
        image.src = originalImageUrl;
    };
    reader.readAsDataURL(file);

    grayButton.disabled = false;
}

async function processImage() {
    if (!selectedFile) {
        showMessage("未选择文件，请先上传图片", "error");
        return;
    }

    const currentOperation = operationSelect.value;
    const currentMethod = methodSelect.value;
    const currentChannel = channelSelect.value;
    const currentThreshold = thresholdInput.value;
    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("operation", currentOperation);
    formData.append("method", currentMethod);
    formData.append("channel", currentChannel);
    formData.append("threshold", currentThreshold);

    const requestId = ++latestRequestId;
    setProcessingState(true);
    setCurrentMethodLabel(currentMethod);
    showMessage(`正在执行${operationNames[currentOperation]}...`);

    try {
        const response = await fetch(cvclassUrl("/process"), {
            method: "POST",
            body: formData
        });
        const data = await response.json();

        if (requestId !== latestRequestId) {
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || "后端处理失败");
        }

        beforeImage.src = originalImageUrl;
        afterImage.src = data.image;
        compareSlider.classList.remove("empty");
        compareSlider.style.setProperty("--split", "50%");
        sliderHandle.setAttribute("aria-valuenow", "50");
        syncCompareSliderGeometry();
        downloadButton.href = data.image;
        downloadButton.download = `processed_${data.info.filename.replace(/\.[^.]+$/, "")}.png`;
        downloadButton.classList.remove("disabled");

        infoName.textContent = data.info.filename;
        infoResolution.textContent = `${data.info.width} × ${data.info.height}`;
        infoSize.textContent = data.info.size;
        infoTime.textContent = `${data.elapsed_ms} ms`;
        infoFormat.textContent = `格式：${data.info.format}`;
        drawHistogram(data.histogram);
        addHistoryRecord(data);
        refreshLastPixelFormula();
        showMessage(`处理完成：${operationNames[data.info.operation]} · ${data.elapsed_ms} ms`, "success");
    } catch (error) {
        if (requestId !== latestRequestId) {
            return;
        }
        resetResult();
        showMessage(error.message || "后端处理失败", "error");
    } finally {
        if (requestId === latestRequestId) {
            setProcessingState(false);
        }
    }
}

function updateSliderByClientX(clientX) {
    if (!currentImageMetrics) {
        return;
    }

    const rect = compareSlider.getBoundingClientRect();
    const scale = Math.min(rect.width / currentImageMetrics.width, rect.height / currentImageMetrics.height);
    const renderWidth = currentImageMetrics.width * scale;
    const offsetX = (rect.width - renderWidth) / 2;
    const raw = ((clientX - rect.left - offsetX) / renderWidth) * 100;
    const percent = Math.min(100, Math.max(0, raw));
    compareSlider.style.setProperty("--split", `${percent}%`);
    compareSlider.style.setProperty("--slider-left", `${offsetX + renderWidth * (percent / 100)}px`);
    sliderHandle.setAttribute("aria-valuenow", Math.round(percent).toString());
}

chooseButton.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", () => {
    handleFile(imageInput.files[0]);
});

dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove("drag-over");
    }
});

dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    handleFile(event.dataTransfer.files[0]);
});

grayButton.addEventListener("click", processImage);

operationSelect.addEventListener("change", () => {
    updateOperationControls();
    resetDataOnly();
    if (selectedFile && originalImageUrl) {
        processImage();
    }
});

methodSelect.addEventListener("change", () => {
    refreshLastPixelFormula();
    if (selectedFile && originalImageUrl) {
        resetDataOnly();
        processImage();
    }
});

channelSelect.addEventListener("change", () => {
    resetDataOnly();
    if (selectedFile && originalImageUrl) {
        processImage();
    }
});

thresholdInput.addEventListener("input", () => {
    thresholdValue.textContent = thresholdInput.value;
});

thresholdInput.addEventListener("change", () => {
    resetDataOnly();
    if (selectedFile && originalImageUrl) {
        processImage();
    }
});

compareSlider.addEventListener("pointerdown", (event) => {
    if (compareSlider.classList.contains("empty")) {
        return;
    }
    isDraggingSlider = true;
    compareSlider.setPointerCapture(event.pointerId);
    updateSliderByClientX(event.clientX);
});

compareSlider.addEventListener("pointermove", (event) => {
    updatePixelFromPointer(event);
    if (isDraggingSlider) {
        updateSliderByClientX(event.clientX);
    }
});

compareSlider.addEventListener("pointerup", () => {
    isDraggingSlider = false;
});

compareSlider.addEventListener("pointercancel", () => {
    isDraggingSlider = false;
});

window.addEventListener("resize", () => {
    if (histogramChart) {
        histogramChart.resize();
    }
    syncCompareSliderGeometry();
});

// Initialize accordion toggle behavior for lesson sections
(function initAccordions() {
    const headers = document.querySelectorAll('.lesson-accordion-header');
    headers.forEach(h => {
        h.addEventListener('click', () => {
            const target = h.getAttribute('data-target');
            const panel = document.getElementById(target);
            const expanded = h.getAttribute('aria-expanded') === 'true';
            h.setAttribute('aria-expanded', String(!expanded));
            if (panel) panel.classList.toggle('is-active', !expanded);
            const icon = h.querySelector('.accordion-icon');
            if (icon) icon.textContent = expanded ? '+' : '−';
        });
    });
})();

resetDashboard();
updateOperationControls();
