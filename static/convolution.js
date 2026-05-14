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
    linkMode: document.getElementById("convLinkMode"),
    allowNegativeKernel: document.getElementById("allowNegativeKernel"),
    regenInput: document.getElementById("regenInputBtn"),
    regenKernel: document.getElementById("regenKernelBtn"),
    step: document.getElementById("convStepBtn"),
    play: document.getElementById("convPlayBtn"),
    reset: document.getElementById("convResetBtn"),
    inputMatrices: document.getElementById("inputMatrices"),
    kernelGallery: document.getElementById("kernelGallery"),
    outputMaps: document.getElementById("outputMaps"),
    calcChannelTabs: document.getElementById("calcChannelTabs"),
    calcCanvas: document.getElementById("calcCanvas"),
    outputFormula: document.getElementById("outputFormula"),
    calculationDetail: document.getElementById("calculationDetail"),
    stepStatus: document.getElementById("convStepStatus"),
    activeKernelLabel: document.getElementById("activeKernelLabel"),
    outputShape: document.getElementById("convOutputShape"),
    explanation: document.getElementById("convExplanation"),
    snakePathBox: document.getElementById("snakePathBox")
};

const convState = {
    inputs: [],
    kernels: [],
    outputs: [],
    currentStep: 0,
    activeCanvasChannel: 0,
    timer: null
};

const convTypeNames = {
    standard: "标准卷积",
    pointwise: "1×1 卷积",
    dilated: "空洞卷积",
    snake: "蛇形卷积"
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
            generateMatrix(p.inputSize, p.inputSize, 0, 255)
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

        const level = Math.round(246 - normalized * 166);
        return {
            background: `rgb(${level}, ${level}, ${level})`,
            color: level < 136 ? "#ffffff" : "#0f172a"
        };
    }

    return null;
}

function renderMatrix(container, matrix, options = {}) {
    container.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = `matrix-grid ${options.gridClass || ""}`;
    grid.style.gridTemplateColumns = `repeat(${matrix[0]?.length || 0}, 34px)`;
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
            const isPadding = options.isPadding?.(r, c);
            const cellColor = getCellColor(value, { ...options, isPadding });
            if (cellColor) {
                cell.style.background = cellColor.background;
                cell.style.color = cellColor.color;
            }
            if (isPadding) cell.classList.add("padding-cell");
            if (highlight.has(keyOf(r, c))) cell.classList.add("window-cell");
            if (sampled.has(keyOf(r, c))) cell.classList.add("sample-cell");
            if (skipped.has(keyOf(r, c))) cell.classList.add("skipped-cell");
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
        renderMatrix(holder, matrix, {
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
        convEls.inputMatrices.appendChild(card);
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
                gridClass: "kernel-grid",
                pathLabels: labels,
                skipped: snakeSkipped,
                kernelActive: kernelIndex === step.kernelIndex ? { r: 0, c: 0 } : null
            });
            wrapper.appendChild(holder);
        });
        convEls.kernelGallery.appendChild(wrapper);
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
        renderMatrix(holder, output.length ? output : [[0]], {
            gridClass: "output-grid",
            colorMode: "output",
            outputMin,
            outputMax,
            allowNegative: Boolean(convEls.allowNegativeKernel?.checked),
            kernelCount: p.kernelCount,
            active: index === step.kernelIndex ? { r: step.outR, c: step.outC } : null
        });
        convEls.outputMaps.appendChild(card);
    });
}

function getCurrentTermIndex(order) {
    if (!order.length) return 0;
    return convState.currentStep % order.length;
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
    grid.style.gridTemplateColumns = `repeat(${matrix[0]?.length || 0}, 31px)`;
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

    const blocks = board.querySelectorAll(".calc-block");
    blocks[0].appendChild(renderCalcMiniGrid(data.patch, {
        prefix: "patch",
        orderIndex,
        activeTerm: data.activeTerm
    }));
    blocks[1].appendChild(renderCalcMiniGrid(kernelMatrix, {
        prefix: "kernel",
        className: "calc-kernel-grid",
        orderIndex,
        activeTerm: data.activeTerm
    }));
    blocks[2].appendChild(renderCalcMiniGrid(data.product, {
        prefix: "product",
        className: "calc-product-grid",
        orderIndex,
        activeTerm: data.activeTerm
    }));

    if (p.channels > 1) {
        board.querySelector("[data-node='final'] span").textContent = `final: ${finalExpression}`;
    }

    convEls.calcCanvas.innerHTML = "";
    convEls.calcCanvas.appendChild(board);
    requestAnimationFrame(() => drawCalculationLines(board, data));
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
    const line = (from, to, active = false, extraClass = "") => {
        if (!from || !to) return "";
        const mid = (from.x + to.x) / 2;
        return `<path class="calc-line ${active ? "is-active" : ""} ${extraClass}" marker-end="url(#calcArrow)" d="M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}" />`;
    };

    const activeOnly = mode === "dynamic";
    const indexes = activeOnly ? [data.activeTerm] : data.order.map((_, index) => index);
    const parts = [`
        <defs>
            <marker id="calcArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb"></path>
            </marker>
        </defs>
    `];

    indexes.forEach((index) => {
        const active = index === data.activeTerm;
        parts.push(line(centerOf(`[data-node="patch-${index}"]`), centerOf(`[data-node="product-${index}"]`), active));
        parts.push(line(centerOf(`[data-node="kernel-${index}"]`), centerOf(`[data-node="product-${index}"]`), active));
        parts.push(line(centerOf(`[data-node="product-${index}"]`), centerOf(`[data-node="partial"]`), active));
    });

    if (data.p.type === "snake" && mode !== "none") {
        const snakeIndexes = activeOnly
            ? [Math.max(0, data.activeTerm - 1)].filter((index) => index < data.activeTerm)
            : data.order.map((_, index) => index).slice(0, -1);
        snakeIndexes.forEach((index) => {
            parts.push(line(
                centerOf(`[data-node="product-${index}"]`),
                centerOf(`[data-node="product-${index + 1}"]`),
                index + 1 === data.activeTerm,
                "is-path"
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
        <code>effectiveK = ${p.dilation} × (${p.kernelSize} - 1) + 1 = ${size.effectiveK}
outH = floor((${p.inputSize} + 2×${p.padding} - ${size.effectiveK}) / ${p.stride}) + 1 = ${size.outH}
outW = floor((${p.inputSize} + 2×${p.padding} - ${size.effectiveK}) / ${p.stride}) + 1 = ${size.outW}</code>
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
    grid.style.gridTemplateColumns = `repeat(${kernelSize}, 36px)`;
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

function renderAll() {
    updateConvTypeControls();
    ensureStateShape();
    const step = getStepInfo();
    convState.currentStep = Math.min(convState.currentStep, step.total - 1);
    renderInputMatrices();
    renderKernels();
    renderOutputs();
    renderCalculationCanvas();
    renderFormula();
    renderCalculationDetail();
    renderExplanation();
    convEls.stepStatus.textContent = `Step ${convState.currentStep + 1} / ${step.total}`;
}

function resetDemo() {
    convState.currentStep = 0;
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

    convEls.linkMode?.addEventListener("change", renderCalculationCanvas);

    convEls.allowNegativeKernel?.addEventListener("change", () => {
        ensureStateShape(false, true);
        resetDemo();
    });

    convEls.regenInput.addEventListener("click", regenerateInput);
    convEls.regenKernel.addEventListener("click", regenerateKernel);
    convEls.step.addEventListener("click", nextStep);
    convEls.play.addEventListener("click", toggleAutoPlay);
    convEls.reset.addEventListener("click", resetDemo);
}

initConvolutionLab();
