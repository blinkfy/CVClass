const convEls = {
    tabs: document.querySelectorAll(".lesson-accordion-header"),
    accordions: document.querySelectorAll(".lesson-accordion"),
    panels: document.querySelectorAll(".lesson-panel"),
    inputSize: document.getElementById("convInputSize"),
    kernelSize: document.getElementById("convKernelSize"),
    stride: document.getElementById("convStride"),
    padding: document.getElementById("convPadding"),
    dilation: document.getElementById("convDilation"),
    dilationControl: document.getElementById("dilationControl"),
    snakeDirection: document.getElementById("convSnakeDirection"),
    snakeDirectionControl: document.getElementById("snakeDirectionControl"),
    channels: document.getElementById("convChannels"),
    kernelCount: document.getElementById("convKernelCount"),
    type: document.getElementById("convType"),
    kernelTemplate: document.getElementById("kernelTemplateSelect"),
    linkMode: document.getElementById("convLinkMode"),
    demoMode: document.getElementById("convDemoMode"),
    demoModeControl: document.getElementById("demoModeControl"),
    showGuideLines: document.getElementById("showGuideLines"),
    guideLinesControl: document.getElementById("guideLinesControl"),
    enableMoveAnimation: document.getElementById("enableMoveAnimation"),
    moveAnimationControl: document.getElementById("moveAnimationControl"),
    allowNegativeKernel: document.getElementById("allowNegativeKernel"),
    regenInput: document.getElementById("regenInputBtn"),
    regenKernel: document.getElementById("regenKernelBtn"),
    animStep: document.getElementById("animStepBtn"),
    step: document.getElementById("convStepBtn"),
    play: document.getElementById("convPlayBtn"),
    reset: document.getElementById("convResetBtn"),
    inputMatrices: document.getElementById("inputMatrices"),
    kernelGallery: document.getElementById("kernelGallery"),
    outputMaps: document.getElementById("outputMaps"),
    convImageInput: document.getElementById("convImageInput"),
    applyImageConv: document.getElementById("applyImageConvBtn"),
    imageConvMessage: document.getElementById("imageConvMessage"),
    convImageResult: document.getElementById("convImageResult"),
    calcChannelTabs: document.getElementById("calcChannelTabs"),
    calcCanvas: document.getElementById("calcCanvas"),
    outputFormula: document.getElementById("outputFormula"),
    calculationDetail: document.getElementById("calculationDetail"),
    stepStatus: document.getElementById("convStepStatus"),
    activeKernelLabel: document.getElementById("activeKernelLabel"),
    outputShape: document.getElementById("convOutputShape"),
    explanation: document.getElementById("convExplanation"),
    snakePathBox: document.getElementById("snakePathBox"),
    controlsPanel: document.querySelector(".conv-controls"),
    sidePanel: document.querySelector(".conv-side")
};

const convState = {
    inputs: [],
    kernels: [],
    outputs: [],
    currentStep: 0,
    animationTermStep: 0,
    activeCanvasChannel: 0,
    stageTimers: [],
    renderToken: 0,
    timer: null
};

const convTypeNames = {
    standard: "标准卷积",
    pointwise: "1×1 卷积",
    dilated: "空洞卷积",
    snake: "蛇形卷积"
};

const kernelTemplates = {
    identity: {
        size: 3,
        matrix: [[0, 0, 0], [0, 1, 0], [0, 0, 0]]
    },
    box_blur: {
        size: 3,
        matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]]
    },
    sharpen: {
        size: 3,
        matrix: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]
    },
    edge: {
        size: 3,
        matrix: [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]
    },
    sobel_x: {
        size: 3,
        matrix: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
    },
    sobel_y: {
        size: 3,
        matrix: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
    },
    emboss: {
        size: 3,
        matrix: [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]]
    },
    gaussian_5: {
        size: 5,
        matrix: [
            [1, 4, 6, 4, 1],
            [4, 16, 24, 16, 4],
            [6, 24, 36, 24, 6],
            [4, 16, 24, 16, 4],
            [1, 4, 6, 4, 1]
        ]
    }
};

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMatrix(rows, cols, min, max) {
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => randomInt(min, max))
    );
}

function generateKernel(size, min, max) {
    return generateMatrix(size, size, min, max);
}

function addPadding(matrix, padding) {
    if (padding === 0) {
        return matrix.map((row) => row.slice());
    }

    const width = matrix[0].length + padding * 2;
    const padded = Array.from({ length: matrix.length + padding * 2 }, () => Array(width).fill(0));
    matrix.forEach((row, r) => {
        row.forEach((value, c) => {
            padded[r + padding][c + padding] = value;
        });
    });
    return padded;
}

function getOutputSize(inputSize, kernelSize, stride, padding, dilation) {
    const effectiveK = dilation * (kernelSize - 1) + 1;
    const output = Math.floor((inputSize + 2 * padding - effectiveK) / stride) + 1;
    return {
        effectiveK,
        outH: Math.max(0, output),
        outW: Math.max(0, output)
    };
}

function getSnakePath(kernelSize, direction = "horizontal") {
    if (kernelSize === 1) {
        return [[0, 0]];
    }

    const middle = Math.floor(kernelSize / 2);
    const offsets = [];
    for (let i = 0; i < kernelSize; i += 1) {
        const wave = i % 4 === 1 ? -1 : i % 4 === 3 ? 1 : 0;
        offsets.push(wave);
    }

    if (direction === "vertical") {
        return offsets.map((offset, r) => [r, clamp(middle + offset, 0, kernelSize - 1)]);
    }

    return offsets.map((offset, c) => [clamp(middle + offset, 0, kernelSize - 1), c]);
}

function getWindowBounds(row, col, kernelSize, stride, dilation) {
    const baseR = row * stride;
    const baseC = col * stride;
    return {
        minR: baseR,
        minC: baseC,
        maxR: baseR + (kernelSize - 1) * dilation,
        maxC: baseC + (kernelSize - 1) * dilation
    };
}

function getKernelOrder(kernelSize, type) {
    if (type === "snake") {
        return getSnakePath(kernelSize, convEls.snakeDirection?.value || "horizontal");
    }

    const order = [];
    for (let r = 0; r < kernelSize; r += 1) {
        for (let c = 0; c < kernelSize; c += 1) {
            order.push([r, c]);
        }
    }
    return order;
}

function getCurrentWindow(row, col, kernelSize, stride, dilation) {
    const baseR = row * stride;
    const baseC = col * stride;
    const positions = [];
    for (let kr = 0; kr < kernelSize; kr += 1) {
        for (let kc = 0; kc < kernelSize; kc += 1) {
            positions.push({
                r: baseR + kr * dilation,
                c: baseC + kc * dilation,
                kr,
                kc
            });
        }
    }
    return positions;
}

function conv2dSingleChannel(input, kernel, stride, padding, dilation, type = "standard") {
    const padded = addPadding(input, padding);
    const outputSize = getOutputSize(input.length, kernel.length, stride, padding, dilation);
    const output = Array.from({ length: outputSize.outH }, () => Array(outputSize.outW).fill(0));
    const order = getKernelOrder(kernel.length, type);

    for (let outR = 0; outR < outputSize.outH; outR += 1) {
        for (let outC = 0; outC < outputSize.outW; outC += 1) {
            let sum = 0;
            order.forEach(([kr, kc]) => {
                const inputR = outR * stride + kr * dilation;
                const inputC = outC * stride + kc * dilation;
                sum += padded[inputR][inputC] * kernel[kr][kc];
            });
            output[outR][outC] = sum;
        }
    }
    return output;
}

function conv2dMultiChannel(inputChannels, kernelChannels, stride, padding, dilation, type = "standard") {
    const first = conv2dSingleChannel(inputChannels[0], kernelChannels[0], stride, padding, dilation, type);
    const output = first.map((row) => row.slice());

    for (let ch = 1; ch < inputChannels.length; ch += 1) {
        const partial = conv2dSingleChannel(inputChannels[ch], kernelChannels[ch], stride, padding, dilation, type);
        for (let r = 0; r < output.length; r += 1) {
            for (let c = 0; c < output[0].length; c += 1) {
                output[r][c] += partial[r][c];
            }
        }
    }
    return output;
}

function convWithMultipleKernels(inputChannels, kernels, stride, padding, dilation, type = "standard") {
    return kernels.map((kernelChannels) =>
        conv2dMultiChannel(inputChannels, kernelChannels, stride, padding, dilation, type)
    );
}

function getParams() {
    let type = convEls.type.value;
    let kernelSize = Number(convEls.kernelSize.value);
    let dilation = type === "dilated" ? Number(convEls.dilation.value) : 1;

    if (type === "pointwise") {
        kernelSize = 1;
        dilation = 1;
        convEls.kernelSize.value = "1";
    }

    if (type === "dilated" && dilation === 1) {
        dilation = 2;
        convEls.dilation.value = "2";
    }

    return {
        inputSize: Number(convEls.inputSize.value),
        kernelSize,
        stride: Number(convEls.stride.value),
        padding: Number(convEls.padding.value),
        dilation,
        channels: Number(convEls.channels.value),
        kernelCount: Number(convEls.kernelCount.value),
        type,
        snakeDirection: convEls.snakeDirection?.value || "horizontal"
    };
}

function ensureStateShape(regenInput = false, regenKernel = false) {
    const p = getParams();
    if (regenInput || convState.inputs.length !== p.channels || convState.inputs[0]?.length !== p.inputSize) {
        convState.inputs = Array.from({ length: p.channels }, () =>
            generateMatrix(p.inputSize, p.inputSize, 0, 249)
        );
    }

    const kernelShapeChanged =
        convState.kernels.length !== p.kernelCount ||
        convState.kernels[0]?.length !== p.channels ||
        convState.kernels[0]?.[0]?.length !== p.kernelSize;

    if (regenKernel || kernelShapeChanged) {
        const kernelMin = convEls.allowNegativeKernel?.checked ? -2 : 0;
        const kernelMax = convEls.allowNegativeKernel?.checked ? 2 : 2;
        convState.kernels = Array.from({ length: p.kernelCount }, () =>
            Array.from({ length: p.channels }, () => generateKernel(p.kernelSize, kernelMin, kernelMax))
        );
    }

    convState.outputs = convWithMultipleKernels(
        convState.inputs,
        convState.kernels,
        p.stride,
        p.padding,
        p.dilation,
        p.type
    );
}

function getStepInfo() {
    const p = getParams();
    const { outH, outW } = getOutputSize(p.inputSize, p.kernelSize, p.stride, p.padding, p.dilation);
    const perKernel = outH * outW;
    const total = Math.max(1, perKernel * p.kernelCount);
    const safeStep = Math.min(convState.currentStep, total - 1);
    const kernelIndex = perKernel === 0 ? 0 : Math.floor(safeStep / perKernel);
    const local = perKernel === 0 ? 0 : safeStep % perKernel;

    return {
        kernelIndex,
        outR: outW === 0 ? 0 : Math.floor(local / outW),
        outC: outW === 0 ? 0 : local % outW,
        total,
        outH,
        outW
    };
}

function keyOf(r, c) {
    return `${r},${c}`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getCellColor(value, options = {}) {
    if (options.isPadding) {
        return null;
    }

    if (options.colorMode === "input") {
        const v = clamp(Number(value), 0, 255);
        return {
            background: `rgb(${v}, ${v}, ${v})`,
            color: v > 150 ? "#0f172a" : "#ffffff"
        };
    }

    if (options.colorMode === "output") {
        const numberValue = Number(value);
        const min = Number.isFinite(options.outputMin) ? options.outputMin : 0;
        const max = Number.isFinite(options.outputMax) ? options.outputMax : 1;
        const range = Math.max(1, max - min);
        const normalized = clamp((numberValue - min) / range, 0, 1);

        const level = Math.round(80 + normalized * 166);
        return {
            background: `rgb(${level}, ${level}, ${level})`,
            color: level < 136 ? "#ffffff" : "#0f172a"
        };
    }

    return null;
}

function measureGridCellSize(container, cols, options = {}) {
    const {
        minSize = 22,
        maxSize = 34,
        gap = 3,
        padding = 8,
        fontRatio = 0.38,
        minFont = 10,
        maxFont = 13,
        digits = 2
    } = options;
    const hostCandidates = [
        options.fitScope,
        container?.closest?.(".calc-flow-board"),
        container?.closest?.(".anim-stage"),
        container?.closest?.(".matrix-gallery"),
        container?.closest?.(".feature-map-gallery"),
        container?.closest?.(".kernel-gallery"),
        container?.closest?.(".conv-subpanel"),
        container?.closest?.(".calc-block"),
        container?.closest?.(".anim-block"),
        container?.parentElement,
        container
    ].filter(Boolean);

    let host = 0;
    for (const el of hostCandidates) {
        const rect = el.getBoundingClientRect?.();
        const width = rect?.width || el.clientWidth || 0;
        if (width > host) host = width;
    }

    if (host <= 0) {
        return {
            size: minSize,
            font: clamp(Math.round(minSize * fontRatio), minFont, maxFont),
            gap
        };
    }

    const available = Math.max(0, host - padding * 2);
    const raw = cols > 0 ? Math.floor((available - gap * (cols - 1)) / cols) : minSize;
    const size = clamp(Number.isFinite(raw) ? raw : minSize, minSize, maxSize);
    const digitFactor = digits >= 4 ? 0.32 : digits >= 3 ? 0.35 : fontRatio;
    const font = clamp(Math.round(size * digitFactor), minFont, maxFont);
    return { size, font, gap };
}

function estimateMaxDigits(matrix) {
    let maxDigits = 1;
    matrix.forEach((row) => {
        row.forEach((value) => {
            const len = String(value ?? "").length;
            if (len > maxDigits) maxDigits = len;
        });
    });
    return maxDigits;
}

function renderMatrix(container, matrix, options = {}) {
    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = `matrix-grid ${options.gridClass || ""}`;
    const cols = matrix[0]?.length || 0;
    const fit = options.autoFit === false
        ? {
            size: options.cellSize || 34,
            font: options.fontSize || 13,
            gap: options.gap || 3
        }
        : measureGridCellSize(container, cols, {
            minSize: options.minCellSize || 22,
            maxSize: options.maxCellSize || 34,
            gap: options.gap || 3,
            padding: options.padding || 8,
            digits: options.maxDigits || estimateMaxDigits(matrix),
            fitScope: options.fitScope
        });
    grid.style.setProperty("--matrix-cell-size", `${fit.size}px`);
    grid.style.setProperty("--matrix-cell-font-size", `${fit.font}px`);
    grid.style.gap = `${fit.gap}px`;
    grid.style.gridTemplateColumns = `repeat(${cols}, ${fit.size}px)`;
    const highlight = new Set((options.highlight || []).map((p) => keyOf(p.r, p.c)));
    const sampled = new Set((options.sampled || []).map((p) => keyOf(p.r, p.c)));
    const skipped = new Set((options.skipped || []).map((p) => keyOf(p.r, p.c)));
    const pathMap = new Map((options.pathLabels || []).map((p) => [keyOf(p.r, p.c), p.label]));

    matrix.forEach((row, r) => {
        row.forEach((value, c) => {
            const cell = document.createElement("div");
            cell.className = "matrix-cell";
            if (Number.isInteger(options.channelIndex)) {
                cell.classList.add(`channel-${options.channelIndex}`);
            }
            cell.textContent = value;
            const isSkipped = skipped.has(keyOf(r, c));
            const canEdit = options.editable && !isSkipped;
            if (canEdit) {
                cell.contentEditable = "true";
                cell.spellcheck = false;
                cell.classList.add("editable-cell");
                cell.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        cell.blur();
                    }
                });
                cell.addEventListener("blur", () => {
                    const parsed = Number(cell.textContent.trim());
                    if (!Number.isFinite(parsed)) {
                        cell.textContent = value;
                        return;
                    }
                    options.onEdit?.(r, c, parsed);
                });
            }
            const isPadding = options.isPadding?.(r, c);
            const cellColor = getCellColor(value, { ...options, isPadding });
            if (cellColor) {
                cell.style.background = cellColor.background;
                cell.style.color = cellColor.color;
            }
            if (isPadding) cell.classList.add("padding-cell");
            if (highlight.has(keyOf(r, c))) cell.classList.add("window-cell");
            if (sampled.has(keyOf(r, c))) cell.classList.add("sample-cell");
            if (isSkipped) cell.classList.add("skipped-cell");
            if (options.active?.r === r && options.active?.c === c) cell.classList.add("active-output");
            if (options.kernelActive?.r === r && options.kernelActive?.c === c) cell.classList.add("kernel-active");
            if (pathMap.has(keyOf(r, c))) {
                const badge = document.createElement("span");
                badge.className = "path-index";
                badge.textContent = pathMap.get(keyOf(r, c));
                cell.appendChild(badge);
            }
            grid.appendChild(cell);
        });
    });
    container.appendChild(grid);
}

function renderInputMatrices() {
    const p = getParams();
    const step = getStepInfo();
    const paddedInputs = convState.inputs.map((m) => addPadding(m, p.padding));
    const order = getKernelOrder(p.kernelSize, p.type);
    const sampled = order.map(([kr, kc]) => ({
        r: step.outR * p.stride + kr * p.dilation,
        c: step.outC * p.stride + kc * p.dilation
    }));
    const bounds = getWindowBounds(step.outR, step.outC, p.kernelSize, p.stride, p.dilation);
    const skipped = [];
    for (let r = bounds.minR; r <= bounds.maxR; r += 1) {
        for (let c = bounds.minC; c <= bounds.maxC; c += 1) {
            if (!sampled.some((pos) => pos.r === r && pos.c === c)) skipped.push({ r, c });
        }
    }

    convEls.inputMatrices.innerHTML = "";
    paddedInputs.forEach((matrix, channelIndex) => {
        const card = document.createElement("div");
        card.className = "matrix-card";
        card.innerHTML = `<h4>Channel ${channelIndex + 1}</h4>`;
        const holder = document.createElement("div");
        card.appendChild(holder);
        convEls.inputMatrices.appendChild(card);
        renderMatrix(holder, matrix, {
            fitScope: convEls.inputMatrices,
            highlight: sampled,
            sampled,
            skipped: p.dilation > 1 || p.type === "snake" ? skipped : [],
            colorMode: "input",
            channelIndex,
            channelCount: p.channels,
            isPadding: (r, c) =>
                r < p.padding ||
                c < p.padding ||
                r >= matrix.length - p.padding ||
                c >= matrix[0].length - p.padding
        });
    });
}

function renderKernels() {
    const p = getParams();
    const step = getStepInfo();
    const order = getKernelOrder(p.kernelSize, p.type);
    const labels = p.type === "snake"
        ? order.map(([r, c], index) => ({ r, c, label: index + 1 }))
        : [];
    const orderKeys = new Set(order.map(([r, c]) => keyOf(r, c)));
    const snakeSkipped = [];
    if (p.type === "snake") {
        for (let r = 0; r < p.kernelSize; r += 1) {
            for (let c = 0; c < p.kernelSize; c += 1) {
                if (!orderKeys.has(keyOf(r, c))) snakeSkipped.push({ r, c });
            }
        }
    }

    convEls.kernelGallery.innerHTML = "";
    convState.kernels.forEach((kernelChannels, kernelIndex) => {
        const wrapper = document.createElement("div");
        wrapper.className = "kernel-card";
        convEls.kernelGallery.appendChild(wrapper);
        wrapper.innerHTML = `<h4>Kernel ${kernelIndex + 1}${kernelIndex === step.kernelIndex ? " · 当前" : ""}</h4>`;

        kernelChannels.forEach((kernel, channelIndex) => {
            const holder = document.createElement("div");
            holder.className = "kernel-channel";
            const title = document.createElement("h4");
            title.textContent = `Ch ${channelIndex + 1}`;
            holder.appendChild(title);
            const gridHolder = document.createElement("div");
            holder.appendChild(gridHolder);
            renderMatrix(gridHolder, kernel, {
                fitScope: convEls.kernelGallery,
                gridClass: "kernel-grid",
                pathLabels: labels,
                skipped: snakeSkipped,
                editable: true,
                onEdit: (r, c, value) => {
                    convState.kernels[kernelIndex][channelIndex][r][c] = value;
                    convEls.kernelTemplate.value = "";
                    convState.outputs = convWithMultipleKernels(
                        convState.inputs,
                        convState.kernels,
                        p.stride,
                        p.padding,
                        p.dilation,
                        p.type
                    );
                    renderAll();
                },
                kernelActive: kernelIndex === step.kernelIndex ? { r: 0, c: 0 } : null
            });
            wrapper.appendChild(holder);
        });
    });

    convEls.activeKernelLabel.textContent = `Kernel ${step.kernelIndex + 1}`;
}

function renderOutputs() {
    const p = getParams();
    const step = getStepInfo();
    convEls.outputMaps.innerHTML = "";
    convState.outputs.forEach((output, index) => {
        const values = output.flat();
        const outputMin = values.length ? Math.min(...values) : 0;
        const outputMax = values.length ? Math.max(...values) : 1;
        const card = document.createElement("div");
        card.className = "feature-card";
        card.innerHTML = `<h4>Feature Map ${index + 1}</h4>`;
        const holder = document.createElement("div");
        card.appendChild(holder);
        convEls.outputMaps.appendChild(card);
        renderMatrix(holder, output.length ? output : [[0]], {
            fitScope: convEls.outputMaps,
            gridClass: "output-grid",
            colorMode: "output",
            outputMin,
            outputMax,
            allowNegative: Boolean(convEls.allowNegativeKernel?.checked),
            kernelCount: p.kernelCount,
            active: index === step.kernelIndex ? { r: step.outR, c: step.outC } : null
        });
    });
}

function getCurrentTermIndex(order) {
    if (!order.length) return 0;
    return convState.animationTermStep % order.length;
}

function buildCalculationData(channelIndex) {
    const p = getParams();
    const step = getStepInfo();
    if (step.outH === 0 || step.outW === 0) return null;

    const input = addPadding(convState.inputs[channelIndex], p.padding);
    const kernel = convState.kernels[step.kernelIndex][channelIndex];
    const order = getKernelOrder(p.kernelSize, p.type);
    const orderKeys = new Set(order.map(([r, c]) => keyOf(r, c)));
    const activeTerm = getCurrentTermIndex(order);
    const patch = [];
    const product = [];
    let partial = 0;

    for (let kr = 0; kr < p.kernelSize; kr += 1) {
        const patchRow = [];
        const productRow = [];
        for (let kc = 0; kc < p.kernelSize; kc += 1) {
            const inputR = step.outR * p.stride + kr * p.dilation;
            const inputC = step.outC * p.stride + kc * p.dilation;
            const sampled = orderKeys.has(keyOf(kr, kc));
            const inputValue = sampled ? input[inputR][inputC] : "";
            const weight = sampled ? kernel[kr][kc] : "";
            const productValue = sampled ? inputValue * weight : "";
            if (sampled) partial += productValue;
            patchRow.push({ value: inputValue, sampled, kr, kc });
            productRow.push({ value: productValue, sampled, kr, kc });
        }
        patch.push(patchRow);
        product.push(productRow);
    }

    const partials = convState.inputs.map((_, index) => {
        const channelInput = addPadding(convState.inputs[index], p.padding);
        const channelKernel = convState.kernels[step.kernelIndex][index];
        return order.reduce((sum, [kr, kc]) => {
            const inputR = step.outR * p.stride + kr * p.dilation;
            const inputC = step.outC * p.stride + kc * p.dilation;
            return sum + channelInput[inputR][inputC] * channelKernel[kr][kc];
        }, 0);
    });
    const final = partials.reduce((sum, value) => sum + value, 0);

    return {
        p,
        step,
        order,
        activeTerm,
        patch,
        kernel,
        product,
        partial,
        partials,
        final
    };
}

function renderCalcTabs(channelCount) {
    if (!convEls.calcChannelTabs) return;
    convState.activeCanvasChannel = Math.min(convState.activeCanvasChannel, channelCount - 1);
    convEls.calcChannelTabs.innerHTML = "";
    for (let i = 0; i < channelCount; i += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Channel ${i + 1}`;
        button.classList.toggle("is-active", i === convState.activeCanvasChannel);
        button.addEventListener("click", () => {
            convState.activeCanvasChannel = i;
            renderCalculationCanvas();
        });
        convEls.calcChannelTabs.appendChild(button);
    }
}

function renderCalcMiniGrid(matrix, options = {}) {
    const grid = document.createElement("div");
    grid.className = `calc-mini-grid ${options.className || ""}`;
    const cols = matrix[0]?.length || 0;
    const digits = matrix.reduce((max, row) => Math.max(max, ...row.map((item) => String(item?.value ?? "").length)), 1);
    const fit = options.autoFit === false
        ? {
            size: options.cellSize || 31,
            font: options.fontSize || 12,
            gap: options.gap || 3
        }
        : measureGridCellSize(options.container, cols, {
            minSize: options.minCellSize || 20,
            maxSize: options.maxCellSize || 31,
            gap: options.gap || 3,
            padding: options.padding || 7,
            digits,
            fitScope: options.fitScope
        });
    grid.style.setProperty("--calc-cell-size", `${fit.size}px`);
    grid.style.setProperty("--calc-cell-font-size", `${fit.font}px`);
    grid.style.gap = `${fit.gap}px`;
    grid.style.gridTemplateColumns = `repeat(${cols}, ${fit.size}px)`;
    matrix.forEach((row) => {
        row.forEach((item) => {
            const cell = document.createElement("div");
            const termIndex = options.orderIndex?.get(keyOf(item.kr, item.kc));
            cell.className = "calc-cell";
            cell.textContent = item.value;
            if (!item.sampled) cell.classList.add("is-muted");
            if (termIndex === options.activeTerm) cell.classList.add("is-active");
            if (item.sampled && options.prefix) {
                cell.dataset.node = `${options.prefix}-${termIndex}`;
            }
            grid.appendChild(cell);
        });
    });
    return grid;
}

function renderCalculationCanvas() {
    stopStageAnimation();
    updateDemoControls();
    const mode = convEls.linkMode?.value === "dynamic" ? (convEls.demoMode?.value || "static") : "static";
    if (mode === "static") {
        renderStaticCalculationCanvas();
        return;
    }
    renderAnimatedCalculationStage(mode);
}

function renderStaticCalculationCanvas() {
    if (!convEls.calcCanvas) return;
    const p = getParams();
    renderCalcTabs(p.channels);
    const channelIndex = convState.activeCanvasChannel;
    const data = buildCalculationData(channelIndex);
    if (!data) {
        convEls.calcCanvas.innerHTML = "<p>当前参数下没有可展示的卷积窗口。</p>";
        return;
    }

    const orderIndex = new Map(data.order.map(([r, c], index) => [keyOf(r, c), index]));
    const kernelMatrix = data.kernel.map((row, kr) =>
        row.map((value, kc) => ({
            value: orderIndex.has(keyOf(kr, kc)) ? value : "",
            sampled: orderIndex.has(keyOf(kr, kc)),
            kr,
            kc
        }))
    );
    const finalExpression = data.partials.map((value, index) => `p${index + 1}=${value}`).join(" + ");

    const board = document.createElement("div");
    board.className = "calc-flow-board";
    board.innerHTML = `
        <svg class="calc-flow-svg" aria-hidden="true"></svg>
        <div class="calc-block"><h4>Patch · Ch ${channelIndex + 1}</h4></div>
        <div class="calc-operator">×</div>
        <div class="calc-block"><h4>Kernel Slice</h4></div>
        <div class="calc-operator">=</div>
        <div class="calc-block"><h4>Product</h4></div>
        <div class="calc-operator">Σ</div>
        <div class="calc-result-box" data-node="partial">
            <span>partial sum</span>
            <strong>${data.partial}</strong>
        </div>
        <div class="calc-operator">→</div>
        <div class="calc-result-box final" data-node="final">
            <span>final output</span>
            <strong>${data.final}</strong>
        </div>
    `;

    convEls.calcCanvas.innerHTML = "";
    convEls.calcCanvas.appendChild(board);

    const blocks = board.querySelectorAll(".calc-block");
    blocks[0].appendChild(renderCalcMiniGrid(data.patch, {
        fitScope: board,
        prefix: "patch",
        orderIndex,
        activeTerm: data.activeTerm
    }));
    blocks[1].appendChild(renderCalcMiniGrid(kernelMatrix, {
        fitScope: board,
        prefix: "kernel",
        className: "calc-kernel-grid",
        orderIndex,
        activeTerm: data.activeTerm
    }));
    blocks[2].appendChild(renderCalcMiniGrid(data.product, {
        fitScope: board,
        prefix: "product",
        className: "calc-product-grid",
        orderIndex,
        activeTerm: data.activeTerm
    }));

    if (p.channels > 1) {
        board.querySelector("[data-node='final'] span").textContent = `final: ${finalExpression}`;
    }

    requestAnimationFrame(() => drawCalculationLines(board, data));
}

function stopStageAnimation() {
    convState.renderToken += 1;
    convState.stageTimers.forEach((timer) => clearTimeout(timer));
    convState.stageTimers = [];
}

function scheduleStage(callback, delay, token) {
    const timer = setTimeout(() => {
        if (token === convState.renderToken) callback();
    }, delay);
    convState.stageTimers.push(timer);
}

function renderAnimatedCalculationStage(mode = "step") {
    if (!convEls.calcCanvas) return;
    const p = getParams();
    if (mode === "step") {
        renderCalcTabs(p.channels);
    } else {
        convEls.calcChannelTabs.innerHTML = "";
    }
    const step = getStepInfo();
    if (step.outH === 0 || step.outW === 0) {
        convEls.calcCanvas.innerHTML = "<p>当前参数下没有可展示的卷积窗口。</p>";
        return;
    }

    const token = convState.renderToken;
    const board = document.createElement("div");
    board.className = "anim-stage";
    board.classList.toggle("is-large-kernel", p.kernelSize >= 5);
    board.innerHTML = `
        <svg class="anim-stage-svg" aria-hidden="true"></svg>
        <div class="anim-stage-header">
            <span id="animStagePhase">高亮当前输入窗口</span>
            <strong>Kernel ${step.kernelIndex + 1} · 输出位置 (${step.outR}, ${step.outC})</strong>
        </div>
        <div class="anim-stage-body">
            <div class="anim-block anim-patch-block"><h4>Patch</h4><div data-stage="patch"></div></div>
            <div class="anim-symbol">×</div>
            <div class="anim-block anim-kernel-block"><h4>Kernel Slice</h4><div data-stage="kernel"></div></div>
            <div class="anim-symbol">→</div>
            <div class="anim-block anim-product-block"><h4>Product</h4><div data-stage="product"></div></div>
            <div class="anim-partials" data-stage="partials"></div>
            <div class="anim-final" data-stage="final">
                <span>Final output</span>
                <strong>等待汇聚</strong>
            </div>
        </div>
    `;

    convEls.calcCanvas.innerHTML = "";
    convEls.calcCanvas.appendChild(board);

    const channels = mode === "step" ? [convState.activeCanvasChannel] : Array.from({ length: p.channels }, (_, index) => index);
    const channelDelay = mode === "auto" ? 520 : 520;
    let cursor = 0;
    const partials = [];

    channels.forEach((channelIndex, channelOrder) => {
        const data = buildCalculationData(channelIndex);
        if (!data) return;
        scheduleStage(() => renderAnimatedChannel(board, data, channelIndex), cursor, token);
        cursor += 260;

        const termIndexes = mode === "step" ? [data.activeTerm] : data.order.map((_, termIndex) => termIndex);
        termIndexes.forEach((termIndex) => {
            scheduleStage(() => revealAnimatedTerm(board, data, termIndex), cursor, token);
            cursor += mode === "auto" ? channelDelay : 430;
        });

        if (mode === "auto") {
            scheduleStage(() => {
                partials[channelIndex] = data.partial;
                showAnimatedPartial(board, channelIndex, data.partial);
            }, cursor, token);
            cursor += 560;
        } else {
            scheduleStage(() => {
                board.querySelector("#animStagePhase").textContent = `分步动画：当前只演示第 ${data.activeTerm + 1} 个乘法项`;
            }, cursor, token);
        }

        if (mode === "step" && channelOrder === 0) return;
    });

    if (mode === "auto") {
        scheduleStage(() => {
            const allPartials = convState.inputs.map((_, channelIndex) => buildCalculationData(channelIndex)?.partial || 0);
            showAnimatedFinal(board, allPartials);
        }, cursor + 120, token);
    }
}

function matrixToStageItems(matrix, orderIndex) {
    return matrix.map((row, kr) =>
        row.map((value, kc) => ({
            value,
            sampled: orderIndex.has(keyOf(kr, kc)),
            kr,
            kc
        }))
    );
}

function renderAnimatedChannel(board, data, channelIndex) {
    board.querySelector("#animStagePhase").textContent = `Channel ${channelIndex + 1}: 拆出 Patch 与 Kernel Slice`;
    const orderIndex = new Map(data.order.map(([r, c], index) => [keyOf(r, c), index]));
    const kernelMatrix = matrixToStageItems(data.kernel, orderIndex);
    const emptyProduct = data.product.map((row) => row.map((item) => ({ ...item, value: "" })));
    const patchHolder = board.querySelector("[data-stage='patch']");
    const kernelHolder = board.querySelector("[data-stage='kernel']");
    const productHolder = board.querySelector("[data-stage='product']");

    patchHolder.innerHTML = "";
    kernelHolder.innerHTML = "";
    productHolder.innerHTML = "";
    patchHolder.appendChild(renderAnimatedGrid(data.patch, {
        fitScope: board,
        prefix: "anim-patch",
        orderIndex
    }));
    kernelHolder.appendChild(renderAnimatedGrid(kernelMatrix, {
        fitScope: board,
        prefix: "anim-kernel",
        orderIndex,
        className: "anim-kernel-grid"
    }));
    productHolder.appendChild(renderAnimatedGrid(emptyProduct, {
        fitScope: board,
        prefix: "anim-product",
        orderIndex,
        className: "anim-product-grid"
    }));

    board.querySelectorAll(".anim-block").forEach((block) => block.classList.add("is-floating"));
    board.classList.toggle("is-moving", Boolean(convEls.enableMoveAnimation?.checked));
}

function renderAnimatedGrid(matrix, options = {}) {
    const grid = document.createElement("div");
    grid.className = `anim-grid ${options.className || ""}`;
    const cols = matrix[0]?.length || 0;
    const digits = matrix.reduce((max, row) => Math.max(max, ...row.map((item) => String(item?.value ?? "").length)), 1);
    const fit = options.autoFit === false
        ? {
            size: options.cellSize || 38,
            font: options.fontSize || 13,
            gap: options.gap || 4
        }
        : measureGridCellSize(options.container, cols, {
            minSize: options.minCellSize || 24,
            maxSize: options.maxCellSize || 38,
            gap: options.gap || 4,
            padding: options.padding || 8,
            digits,
            fitScope: options.fitScope
        });
    grid.style.setProperty("--anim-cell-size", `${fit.size}px`);
    grid.style.setProperty("--anim-cell-font-size", `${fit.font}px`);
    grid.style.gap = `${fit.gap}px`;
    grid.style.gridTemplateColumns = `repeat(${cols}, ${fit.size}px)`;
    matrix.forEach((row) => {
        row.forEach((item) => {
            const index = options.orderIndex.get(keyOf(item.kr, item.kc));
            const cell = document.createElement("div");
            cell.className = "anim-cell";
            cell.textContent = item.value;
            if (!item.sampled) cell.classList.add("is-muted");
            if (item.sampled) cell.dataset.node = `${options.prefix}-${index}`;
            grid.appendChild(cell);
        });
    });
    return grid;
}

function revealAnimatedTerm(board, data, termIndex) {
    const [kr, kc] = data.order[termIndex];
    const productValue = data.product[kr][kc].value;
    board.querySelector("#animStagePhase").textContent = `逐元素乘法：第 ${termIndex + 1} 项`;
    board.querySelectorAll(".anim-cell.is-active").forEach((cell) => cell.classList.remove("is-active"));
    const patch = board.querySelector(`[data-node="anim-patch-${termIndex}"]`);
    const kernel = board.querySelector(`[data-node="anim-kernel-${termIndex}"]`);
    const product = board.querySelector(`[data-node="anim-product-${termIndex}"]`);
    [patch, kernel, product].forEach((cell) => cell?.classList.add("is-active"));
    patch?.classList.add("is-approach-from-left");
    kernel?.classList.add("is-approach-from-right");
    if (product) {
        product.textContent = productValue;
        product.classList.add("is-filled");
    }
    drawAnimatedGuide(board, patch, kernel, product);
}

function drawAnimatedGuide(board, patch, kernel, product) {
    const svg = board.querySelector(".anim-stage-svg");
    if (!svg || !convEls.showGuideLines?.checked) {
        if (svg) svg.innerHTML = "";
        return;
    }
    const boardRect = board.getBoundingClientRect();
    const center = (node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.left - boardRect.left + rect.width / 2, y: rect.top - boardRect.top + rect.height / 2 };
    };
    const draw = (a, b) => {
        if (!a || !b) return "";
        const mid = (a.x + b.x) / 2;
        return `<path class="anim-guide-line" marker-end="url(#animArrow)" d="M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}" />`;
    };
    svg.innerHTML = `
        <defs><marker id="animArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb"></path></marker></defs>
        ${draw(center(patch), center(product))}
        ${draw(center(kernel), center(product))}
    `;
}

function showAnimatedPartial(board, channelIndex, partial) {
    board.querySelector("#animStagePhase").textContent = `Channel ${channelIndex + 1}: Product 汇聚为 partial sum`;
    board.querySelectorAll(".anim-product-grid .anim-cell.is-filled").forEach((cell) => cell.classList.add("is-gathering"));
    const partials = board.querySelector("[data-stage='partials']");
    const item = document.createElement("div");
    item.className = "anim-partial-pill";
    item.dataset.partial = channelIndex;
    item.innerHTML = `<span>partial ${channelIndex + 1}</span><strong>${partial}</strong>`;
    partials.appendChild(item);
}

function showAnimatedFinal(board, partials) {
    const final = partials.reduce((sum, value) => sum + value, 0);
    board.querySelector("#animStagePhase").textContent = "所有 partial sum 汇聚为 final output";
    board.querySelectorAll(".anim-partial-pill").forEach((item) => item.classList.add("is-gathering"));
    const finalBox = board.querySelector("[data-stage='final']");
    finalBox.classList.add("is-ready");
    finalBox.innerHTML = `<span>${partials.map((value, index) => `p${index + 1}=${value}`).join(" + ")}</span><strong>${final}</strong>`;
}

function drawCalculationLines(board, data) {
    const mode = convEls.linkMode?.value || "dynamic";
    const svg = board.querySelector(".calc-flow-svg");
    if (!svg || mode === "none") {
        if (svg) svg.innerHTML = "";
        return;
    }

    const boardRect = board.getBoundingClientRect();
    const centerOf = (selector) => {
        const node = board.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
            x: rect.left - boardRect.left + rect.width / 2,
            y: rect.top - boardRect.top + rect.height / 2
        };
    };
    const line = (from, to, active = false, extraClass = "", offset = 0) => {
        if (!from || !to) return "";
        const mid = (from.x + to.x) / 2;
        const bend = mode === "all" ? offset : 0;
        const c1y = from.y + bend;
        const c2y = to.y - bend;
        const marker = active ? `marker-end="url(#calcArrowActive)"` : `marker-end="url(#calcArrowMuted)"`;
        return `<path class="calc-line ${active ? "is-active" : ""} ${extraClass}" ${marker} d="M ${from.x} ${from.y} C ${mid} ${c1y}, ${mid} ${c2y}, ${to.x} ${to.y}" />`;
    };

    const activeOnly = mode === "dynamic";
    const indexes = activeOnly ? [data.activeTerm] : data.order.map((_, index) => index);
    const parts = [`
        <defs>
            <marker id="calcArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb"></path>
            </marker>
            <marker id="calcArrowActive" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb"></path>
            </marker>
            <marker id="calcArrowMuted" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#94a3b8"></path>
            </marker>
        </defs>
    `];

    indexes.forEach((index) => {
        const active = index === data.activeTerm;
        const spread = mode === "all" ? (index - (indexes.length - 1) / 2) * 8 : 0;
        parts.push(line(centerOf(`[data-node="patch-${index}"]`), centerOf(`[data-node="product-${index}"]`), active, "", spread));
        parts.push(line(centerOf(`[data-node="kernel-${index}"]`), centerOf(`[data-node="product-${index}"]`), active, "", -spread));
        parts.push(line(centerOf(`[data-node="product-${index}"]`), centerOf(`[data-node="partial"]`), active, "", spread * 0.9));
    });

    if (data.p.type === "snake" && mode !== "none") {
        const snakeIndexes = activeOnly
            ? [Math.max(0, data.activeTerm - 1)].filter((index) => index < data.activeTerm)
            : data.order.map((_, index) => index).slice(0, -1);
        snakeIndexes.forEach((index) => {
            const spread = mode === "all" ? (index - (snakeIndexes.length - 1) / 2) * 7 : 0;
            parts.push(line(
                centerOf(`[data-node="product-${index}"]`),
                centerOf(`[data-node="product-${index + 1}"]`),
                index + 1 === data.activeTerm,
                "is-path",
                spread
            ));
        });
    }

    parts.push(line(centerOf(`[data-node="partial"]`), centerOf(`[data-node="final"]`), true));
    svg.innerHTML = parts.join("");
}

function renderFormula() {
    const p = getParams();
    const size = getOutputSize(p.inputSize, p.kernelSize, p.stride, p.padding, p.dilation);
    convEls.outputShape.textContent = `${size.outH} × ${size.outW} × ${p.kernelCount}`;
    convEls.outputFormula.innerHTML = `
        <div>effectiveK = dilation × (K - 1) + 1</div>
        <code>effectiveK=${p.dilation}×(${p.kernelSize}-1)+1=${size.effectiveK}
outH=floor((${p.inputSize}+2×${p.padding}-${size.effectiveK})/${p.stride})+1=${size.outH}
outW=floor((${p.inputSize}+2×${p.padding}-${size.effectiveK})/${p.stride})+1=${size.outW}</code>
        <div>stride=${p.stride} 时，窗口每次移动 ${p.stride} 格；padding=${p.padding} 会在输入外围补 0。</div>
    `;
}

function renderCalculationDetail() {
    const p = getParams();
    const step = getStepInfo();
    if (step.outH === 0 || step.outW === 0) {
        convEls.calculationDetail.innerHTML = "<p>当前参数下输出尺寸为 0，请调小卷积核、dilation 或 padding/stride。</p>";
        return;
    }

    const paddedInputs = convState.inputs.map((m) => addPadding(m, p.padding));
    const order = getKernelOrder(p.kernelSize, p.type);
    let final = 0;
    const lines = [];

    paddedInputs.forEach((input, channelIndex) => {
        const kernel = convState.kernels[step.kernelIndex][channelIndex];
        const terms = [];
        let partial = 0;
        order.forEach(([kr, kc]) => {
            const inputR = step.outR * p.stride + kr * p.dilation;
            const inputC = step.outC * p.stride + kc * p.dilation;
            const inputValue = input[inputR][inputC];
            const weight = kernel[kr][kc];
            partial += inputValue * weight;
            terms.push(`${inputValue}×${weight}`);
        });
        final += partial;
        const expression = terms
            .map((term, index) => {
                if (index === 0) return term;
                return index % 4 === 0 ? `\n+ ${term}` : ` + ${term}`;
            })
            .join("");
        lines.push(`
            <div class="partial-line">
                <h4>Channel ${channelIndex + 1} partial sum = ${partial}</h4>
                <code>${expression} = ${partial}</code>
            </div>
        `);
    });

    convEls.calculationDetail.innerHTML = `
        <div class="process-meta">
            <span>当前 Kernel：Kernel ${step.kernelIndex + 1}</span>
            <span>输出位置：(${step.outR}, ${step.outC})</span>
        </div>
        ${lines.join("")}
        <strong class="final-output">Final output = ${final}</strong>
    `;
}

function renderSnakePath(kernelSize) {
    if (convEls.type.value !== "snake") {
        convEls.snakePathBox.innerHTML = "";
        return;
    }

    const direction = convEls.snakeDirection?.value || "horizontal";
    const path = getSnakePath(kernelSize, direction);
    const map = new Map(path.map(([r, c], index) => [keyOf(r, c), index + 1]));
    const grid = document.createElement("div");
    grid.className = "snake-grid";
    const fit = measureGridCellSize(convEls.snakePathBox, kernelSize, {
        minSize: 24,
        maxSize: 36,
        gap: 4,
        padding: 8,
        digits: 1,
        fitScope: convEls.snakePathBox
    });
    grid.style.setProperty("--snake-cell-size", `${fit.size}px`);
    grid.style.setProperty("--snake-cell-font-size", `${fit.font}px`);
    grid.style.gridTemplateColumns = `repeat(${kernelSize}, ${fit.size}px)`;
    grid.style.gap = `${fit.gap}px`;
    for (let r = 0; r < kernelSize; r += 1) {
        for (let c = 0; c < kernelSize; c += 1) {
            const cell = document.createElement("div");
            cell.className = "snake-cell";
            const label = map.get(keyOf(r, c));
            cell.textContent = label || "";
            if (!label) cell.classList.add("snake-cell-muted");
            grid.appendChild(cell);
        }
    }
    convEls.snakePathBox.innerHTML = `<p>${direction === "vertical" ? "Vertical" : "Horizontal"} DSConv 路径采样顺序：</p>`;
    convEls.snakePathBox.appendChild(grid);
}

function renderExplanation() {
    const p = getParams();
    const notes = {
        standard: "标准卷积按卷积核窗口逐项乘加，输出特征图的每个位置对应输入中的一个局部邻域。",
        pointwise: "1×1 卷积不扩大空间邻域，主要用于通道融合、通道压缩或升维。多通道时，同一空间位置的各通道数值与 1×1 权重相乘后求和。",
        dilated: "空洞卷积通过 dilation 间隔采样，在不增加参数量的情况下扩大感受野。页面中橙色为实际采样位置，淡色虚线为跳过位置。",
        snake: "蛇形卷积采用教学版 DSConv 路径采样：Horizontal DSConv 沿横向弯曲路径采样，Vertical DSConv 沿纵向弯曲路径采样。它只计算路径上的 K 个点，而不是完整 K×K 邻域。"
    };
    convEls.explanation.innerHTML = `<p>${notes[p.type]}</p>`;
    renderSnakePath(p.kernelSize);
}

function updateConvTypeControls() {
    const type = convEls.type.value;
    const isPointwise = type === "pointwise";
    const isDilated = type === "dilated";
    const isSnake = type === "snake";

    convEls.kernelSize.disabled = isPointwise;
    convEls.dilation.disabled = !isDilated;
    convEls.dilationControl.classList.toggle("is-hidden", !isDilated);
    convEls.snakeDirectionControl?.classList.toggle("is-hidden", !isSnake);

    if (isPointwise) {
        convEls.kernelSize.value = "1";
        convEls.dilation.value = "1";
    }
    if (isDilated && convEls.dilation.value === "1") {
        convEls.dilation.value = "2";
    }
    if (!isDilated) {
        convEls.dilation.value = "1";
    }
}

function updateDemoControls() {
    const isDynamic = convEls.linkMode?.value === "dynamic";
    [
        convEls.demoModeControl,
        convEls.guideLinesControl,
        convEls.moveAnimationControl
    ].forEach((control) => control?.classList.toggle("is-hidden", !isDynamic));
}

function syncControlPanelHeight() {
    const controls = convEls.controlsPanel;
    const side = convEls.sidePanel;
    if (!controls || !side) return;

    const sideHeight = Math.round(side.getBoundingClientRect().height);
    if (sideHeight > 0) {
        controls.style.setProperty("--conv-controls-max-height", `${sideHeight}px`);
    }
}

function renderAll() {
    updateConvTypeControls();
    updateDemoControls();
    ensureStateShape();
    const step = getStepInfo();
    convState.currentStep = Math.min(convState.currentStep, step.total - 1);
    const p = getParams();
    document.getElementById("convolutionLesson")?.classList.toggle(
        "is-single-channel",
        p.channels === 1 && p.kernelCount === 1
    );
    renderInputMatrices();
    renderKernels();
    renderOutputs();
    renderCalculationCanvas();
    renderFormula();
    renderCalculationDetail();
    renderExplanation();
    convEls.stepStatus.textContent = `Step ${convState.currentStep + 1} / ${step.total}`;
    requestAnimationFrame(syncControlPanelHeight);
    requestAnimationFrame(() => window.renderAdvancedConvolution?.());
}

window.getConvolutionLabSnapshot = function getConvolutionLabSnapshot() {
    return {
        params: getParams(),
        inputs: convState.inputs.map((matrix) => matrix.map((row) => row.slice())),
        kernels: convState.kernels.map((kernel) => kernel.map((channel) => channel.map((row) => row.slice())))
    };
};

function resetDemo() {
    convState.currentStep = 0;
    convState.animationTermStep = 0;
    stopAutoPlay();
    renderAll();
}

function nextStep() {
    const step = getStepInfo();
    if (convState.currentStep < step.total - 1) {
        convState.currentStep += 1;
    } else {
        stopAutoPlay();
    }
    renderAll();
}

function stopAutoPlay() {
    if (convState.timer) {
        clearInterval(convState.timer);
        convState.timer = null;
        convEls.play.textContent = "自动播放";
    }
}

function toggleAutoPlay() {
    if (convState.timer) {
        stopAutoPlay();
        return;
    }
    convEls.play.textContent = "暂停播放";
    convState.timer = setInterval(nextStep, 900);
}

function regenerateInput() {
    ensureStateShape(true, false);
    resetDemo();
}

function regenerateKernel() {
    ensureStateShape(false, true);
    resetDemo();
}

function applyKernelTemplate() {
    const template = kernelTemplates[convEls.kernelTemplate?.value];
    if (!template) return;

    convEls.type.value = "standard";
    convEls.kernelSize.value = String(template.size);
    convEls.allowNegativeKernel.checked = template.matrix.flat().some((value) => value < 0);
    updateConvTypeControls();
    ensureStateShape(false, true);

    const step = getStepInfo();
    const targetKernel = Math.min(step.kernelIndex, convState.kernels.length - 1);
    for (let ch = 0; ch < convState.kernels[targetKernel].length; ch += 1) {
        convState.kernels[targetKernel][ch] = template.matrix.map((row) => row.slice());
    }
    resetDemo();
}

function nextAnimationTerm() {
    const p = getParams();
    const order = getKernelOrder(p.kernelSize, p.type);
    convState.animationTermStep = (convState.animationTermStep + 1) % Math.max(1, order.length);
    if (convEls.linkMode?.value === "dynamic" && convEls.demoMode?.value === "static") {
        convEls.demoMode.value = "step";
    }
    renderCalculationCanvas();
}

function getActiveKernelSlice() {
    const step = getStepInfo();
    return convState.kernels[step.kernelIndex]?.[0] || [[1]];
}

async function applyKernelToImage() {
    const file = convEls.convImageInput?.files?.[0];
    if (!file) {
        convEls.imageConvMessage.textContent = "请先选择一张图片";
        return;
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("kernel", JSON.stringify(getActiveKernelSlice()));

    convEls.imageConvMessage.textContent = "后端 NumPy 卷积处理中...";
    try {
        const response = await fetch("/convolve-image", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "后端卷积失败");
        }
        convEls.convImageResult.src = data.image;
        convEls.convImageResult.classList.add("is-visible");
        convEls.imageConvMessage.textContent = `完成：${data.width}×${data.height}，耗时 ${data.elapsed_ms} ms`;
    } catch (error) {
        convEls.imageConvMessage.textContent = error.message;
    }
}

function handleParamChange() {
    updateConvTypeControls();
    ensureStateShape(false, false);
    resetDemo();
}

function initTabs() {
    convEls.tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.target;
            const currentAccordion = tab.closest(".lesson-accordion");
            const shouldOpen = !currentAccordion?.classList.contains("is-open");

            convEls.accordions.forEach((accordion) => {
                const isTarget = accordion === currentAccordion;
                accordion.classList.toggle("is-open", isTarget && shouldOpen);
            });
            convEls.tabs.forEach((item) => {
                const isTarget = item === tab && shouldOpen;
                item.setAttribute("aria-expanded", String(isTarget));
                const icon = item.querySelector(".accordion-icon");
                if (icon) icon.textContent = isTarget ? "−" : "+";
            });
            convEls.panels.forEach((panel) => {
                panel.classList.toggle("is-active", panel.id === target && shouldOpen);
            });
            window.dispatchEvent(new Event("resize"));
        });
    });
}

function initConvolutionLab() {
    if (!convEls.inputMatrices) return;

    initTabs();
    updateConvTypeControls();
    ensureStateShape(true, true);
    renderAll();

    [
        convEls.inputSize,
        convEls.kernelSize,
        convEls.stride,
        convEls.padding,
        convEls.dilation,
        convEls.channels,
        convEls.kernelCount,
        convEls.type,
        convEls.snakeDirection
    ].forEach((control) => control.addEventListener("change", handleParamChange));

    convEls.linkMode?.addEventListener("change", () => {
        updateDemoControls();
        renderCalculationCanvas();
    });
    convEls.kernelTemplate?.addEventListener("change", applyKernelTemplate);

    convEls.allowNegativeKernel?.addEventListener("change", () => {
        ensureStateShape(false, true);
        resetDemo();
    });

    [
        convEls.demoMode,
        convEls.showGuideLines,
        convEls.enableMoveAnimation
    ].forEach((control) => control?.addEventListener("change", renderCalculationCanvas));

    convEls.regenInput.addEventListener("click", regenerateInput);
    convEls.regenKernel.addEventListener("click", regenerateKernel);
    convEls.animStep?.addEventListener("click", nextAnimationTerm);
    convEls.applyImageConv?.addEventListener("click", applyKernelToImage);
    convEls.step.addEventListener("click", nextStep);
    convEls.play.addEventListener("click", toggleAutoPlay);
    convEls.reset.addEventListener("click", resetDemo);

    if (!window.__convResizeBound) {
        window.__convResizeBound = true;
        let resizeTimer = null;
        window.addEventListener("resize", () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                if (document.getElementById("convolutionLesson")) {
                    renderAll();
                }
            }, 120);
        });
    }
}

initConvolutionLab();
