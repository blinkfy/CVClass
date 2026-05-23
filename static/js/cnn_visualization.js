(function () {
    "use strict";

    const root = document.getElementById("cnnVizPage");
    if (!root) return;

    const els = {
        status: document.getElementById("cnnStepStatus"),
        activeLayerLabel: document.getElementById("cnnActiveLayerLabel"),
        modeButtons: Array.from(root.querySelectorAll("[data-mode]")),
        resetView: document.getElementById("cnnResetView"),
        playPause: document.getElementById("cnnPlayPause"),
        speed: document.getElementById("cnnSpeed"),
        landscapeToggle: document.getElementById("cnnLandscapeToggle"),
        landscapeModal: document.getElementById("cnnLandscapeModal"),
        landscapeClose: document.getElementById("cnnLandscapeClose"),
        landscapeRefresh: document.getElementById("cnnLandscapeRefresh"),
        landscapeStatus: document.getElementById("cnnLandscapeStatus"),
        lrCompareToggle: document.getElementById("cnnLrCompareToggle"),
        lrCompareButtons: document.getElementById("cnnLrCompareButtons"),
        lsStep: document.getElementById("cnnLsStep"),
        lsLoss: document.getElementById("cnnLsLoss"),
        lsAcc: document.getElementById("cnnLsAcc"),
        lsLr: document.getElementById("cnnLsLr"),
        lsGrad: document.getElementById("cnnLsGrad"),
        lsUpdate: document.getElementById("cnnLsUpdate"),
        lossCurve: document.getElementById("cnnLossCurve"),
        pcaTrajectory: document.getElementById("cnnPcaTrajectory"),
        fc2Surface: document.getElementById("cnnFc2Surface"),
        stageCard: root.querySelector(".cnn-stage-card"),
        sceneMount: document.getElementById("cnnSceneMount"),
        controlToggle: document.getElementById("cnnControlToggle"),
        sceneControls: document.getElementById("cnnSceneControls"),
        sceneOptions: Array.from(root.querySelectorAll("[data-scene-option]")),
        layerGroups: Array.from(root.querySelectorAll("[data-layer-group]")),
        digitCanvas: document.getElementById("cnnDigitCanvas"),
        digitClear: document.getElementById("cnnDigitClear"),
        digitSample: document.getElementById("cnnDigitSample"),
        digitStatus: document.getElementById("cnnDigitStatus"),
        probe: document.getElementById("cnnProbe"),
        probeClose: document.getElementById("cnnProbeClose"),
        probeTitle: document.getElementById("cnnProbeTitle"),
        probeInput: document.getElementById("cnnProbeInput"),
        probeOutput: document.getElementById("cnnProbeOutput"),
        probePosition: document.getElementById("cnnProbePosition"),
        probeRole: document.getElementById("cnnProbeRole"),
        probeFormula: document.getElementById("cnnProbeFormula"),
        probeImpl: document.getElementById("cnnProbeImpl"),
        timelineMode: document.getElementById("cnnTimelineMode"),
        timeline: document.getElementById("cnnTimeline"),
        stepCard: document.getElementById("cnnStepCard"),
        stepToggle: document.getElementById("cnnStepToggle"),
        stepTitle: document.getElementById("cnnStepTitle"),
        stepBody: document.getElementById("cnnStepBody")
    };

    const layerInfo = {
        input: {
            title: "Input 输入层",
            input: "-",
            output: "1×28×28",
            role: "把手写数字预处理成 28×28 单通道灰度张量，像素亮度表示笔画强度。",
            formula: "X \\in \\mathbb{R}^{1\\times 28\\times 28}",
            impl: "3D 舞台中显示一张灰度热力图，亮区域表示数字笔画。"
        },
        conv1: {
            title: "Conv1 卷积层",
            input: "1×28×28",
            output: "32×28×28",
            role: "使用 32 个 3×3 卷积核提取局部边缘、笔画方向和小结构响应。",
            formula: "Z^{(k)}_{i,j}=\\sum_{u,v}X_{i+u,j+v}K^{(k)}_{u,v}+b^{(k)}",
            impl: "探针高亮一个 input patch、一个 kernel 和输出 feature map 的代表位置。"
        },
        relu1: {
            title: "ReLU1 激活层",
            input: "32×28×28",
            output: "32×28×28",
            role: "把卷积输出中的负响应截断为 0，保留正向笔画激活。",
            formula: "A=\\max(0,Z)",
            impl: "负响应区域变灰，正响应保留蓝色热力图。"
        },
        pool1: {
            title: "Pool1 最大池化",
            input: "32×28×28",
            output: "32×14×14",
            role: "在每个 2×2 区域保留最大响应，降低空间尺寸并增强平移鲁棒性。",
            formula: "P_{i,j}=\\max(A_{2i:2i+2,2j:2j+2})",
            impl: "探针高亮一个 2×2 区域和最大值位置。"
        },
        conv2: {
            title: "Conv2 卷积层",
            input: "32×14×14",
            output: "64×14×14",
            role: "组合浅层笔画特征，形成更抽象的数字部件响应。",
            formula: "Z^{(k)}=\\sum_c P^{(c)}\\ast K^{(k,c)}+b^{(k)}",
            impl: "3D 堆叠显示 12 张抽样 feature maps，代表 64 个通道。"
        },
        relu2: {
            title: "ReLU2 激活层",
            input: "64×14×14",
            output: "64×14×14",
            role: "继续进行非线性激活，抑制负响应并保留更稳定的数字部件。",
            formula: "A=\\max(0,Z)",
            impl: "反向传播时 ReLU mask 会阻断负值位置的梯度。"
        },
        pool2: {
            title: "Pool2 最大池化",
            input: "64×14×14",
            output: "64×7×7",
            role: "进一步压缩空间尺寸，得到紧凑的 64×7×7 分类特征。",
            formula: "P_{i,j}=\\max(\\text{2×2 region})",
            impl: "反向传播时只有前向最大值位置接收梯度。"
        },
        flatten: {
            title: "Flatten 展平",
            input: "64×7×7",
            output: "3136",
            role: "把三维特征体展开成一维向量，作为全连接层输入。",
            formula: "v=\\mathrm{reshape}(P)",
            impl: "舞台中用一列抽样小方块表示 3136 维向量。"
        },
        fc: {
            title: "FC 全连接",
            input: "3136",
            output: "128",
            role: "将卷积特征映射为 128 维隐藏表示，再映射到 10 个 logits。",
            formula: "h=Wv+b",
            impl: "探针高亮一个 flat 节点、一个输出节点和代表性连接。"
        },
        softmax: {
            title: "Softmax 输出",
            input: "10 logits",
            output: "10 probabilities",
            role: "把 logits 归一化为 0 到 9 的概率分布，最高概率为预测数字。",
            formula: "p_i=\\frac{e^{z_i}}{\\sum_j e^{z_j}}",
            impl: "舞台右侧 10 根概率柱显示分类分布，预测类高亮。"
        }
    };

    const overviewSteps = [
        { id: "O1", label: "CNN 总览", layer: "input", theme: "forward", title: "手写数字 CNN 总览" }
    ];

    const forwardSteps = [
        { id: "F1", label: "Input", layer: "input", theme: "forward", title: "F1 Input 输入张量" },
        { id: "F2", label: "Conv1", layer: "conv1", theme: "forward", title: "F2 Conv1 卷积计算" },
        { id: "F3", label: "ReLU1", layer: "relu1", theme: "forward", title: "F3 ReLU1 激活" },
        { id: "F4", label: "Pool1", layer: "pool1", theme: "forward", title: "F4 Pool1 下采样" },
        { id: "F5", label: "Conv2", layer: "conv2", theme: "forward", title: "F5 Conv2 多通道卷积" },
        { id: "F6", label: "ReLU2", layer: "relu2", theme: "forward", title: "F6 ReLU2 激活" },
        { id: "F7", label: "Pool2", layer: "pool2", theme: "forward", title: "F7 Pool2 压缩特征" },
        { id: "F8", label: "Flatten", layer: "flatten", theme: "forward", title: "F8 Flatten 展平" },
        { id: "F9", label: "FC", layer: "fc", theme: "forward", title: "F9 FC 分类映射" },
        { id: "F10", label: "Softmax", layer: "softmax", theme: "forward", title: "F10 Softmax 输出概率" }
    ];

    const backwardSteps = [
        { id: "B1", label: "dlogits", layer: "softmax", theme: "backward", title: "B1 Softmax + CE 梯度" },
        { id: "B2", label: "FC2 grad", layer: "fc", theme: "backward", title: "B2 FC2 128→10 梯度" },
        { id: "B3", label: "FC1 grad", layer: "fc", theme: "backward", title: "B3 FC1隐藏层 + ReLU 梯度" },
        { id: "B4", label: "reshape", layer: "flatten", theme: "backward", title: "B4 dflat reshape 为 Pool2 梯度" },
        { id: "B5", label: "Pool2 grad", layer: "pool2", theme: "backward", title: "B5 Pool2 最大值路由" },
        { id: "B6", label: "ReLU2 mask", layer: "relu2", theme: "backward", title: "B6 ReLU2 mask 阻断" },
        { id: "B7", label: "Conv2 grad", layer: "conv2", theme: "backward", title: "B7 Conv2 dW/db/dX" },
        { id: "B8", label: "Pool1 grad", layer: "pool1", theme: "backward", title: "B8 Pool1 最大值路由" },
        { id: "B9", label: "ReLU1 mask", layer: "relu1", theme: "backward", title: "B9 ReLU1 mask 阻断" },
        { id: "B10", label: "Conv1 grad", layer: "conv1", theme: "backward", title: "B10 Conv1 dW/db/dX" },
        { id: "B11", label: "Update", layer: "conv1", theme: "update", title: "B11 参数更新" }
    ];

    const state = {
        mode: "overview",
        stepIndex: 0,
        playing: false,
        timer: null,
        speed: 1,
        drawing: false,
        hasInk: false,
        digitTimer: null,
        scene: null,
        landscape: {
            open: false,
            loading: false,
            loaded: false,
            source: "",
            trace: null,
            surface: null,
            lrCompare: null,
            compareEnabled: false,
            selectedLr: null,
            currentIndex: 0
        }
    };

    function stepsForMode() {
        if (state.mode === "forward") return forwardSteps;
        if (state.mode === "backward") return backwardSteps;
        return overviewSteps;
    }

    function renderLatex(target, tex) {
        if (!target) return;
        if (!window.katex || !tex) {
            target.textContent = tex || "";
            return;
        }
        try {
            window.katex.render(tex, target, { throwOnError: false, displayMode: false });
        } catch (error) {
            target.textContent = tex;
        }
    }

    function resetDigitCanvas() {
        if (!els.digitCanvas) return;
        const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, els.digitCanvas.width, els.digitCanvas.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 22;
        state.hasInk = false;
        if (els.digitStatus) els.digitStatus.textContent = "写完后自动更新真实热力图";
    }

    function digitPoint(event) {
        const rect = els.digitCanvas.getBoundingClientRect();
        const pointer = event.touches?.[0] || event;
        return {
            x: (pointer.clientX - rect.left) * (els.digitCanvas.width / rect.width),
            y: (pointer.clientY - rect.top) * (els.digitCanvas.height / rect.height)
        };
    }

    function drawDigitSample() {
        resetDigitCanvas();
        const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
        ctx.beginPath();
        [[88, 54], [188, 58], [196, 105], [145, 138], [198, 174], [172, 226], [84, 220]].forEach(([x, y], index) => {
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.closePath();
        state.hasInk = true;
    }

    function preprocessDigitCanvas() {
        const canvas = els.digitCanvas;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const source = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const gray = new Float32Array(canvas.width * canvas.height);
        let total = 0;
        for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
            const brightness = (299 * source[i] + 587 * source[i + 1] + 114 * source[i + 2]) / 1000;
            gray[p] = brightness;
            total += brightness;
        }
        let foreground = gray;
        if (total / gray.length > 127) {
            foreground = new Float32Array(gray.length);
            for (let i = 0; i < gray.length; i += 1) foreground[i] = 255 - gray[i];
        }
        let minValue = Infinity;
        let maxValue = -Infinity;
        for (let i = 0; i < foreground.length; i += 1) {
            minValue = Math.min(minValue, foreground[i]);
            maxValue = Math.max(maxValue, foreground[i]);
        }
        const normalized = new Float32Array(foreground.length);
        const range = maxValue - minValue;
        if (range > 0) {
            for (let i = 0; i < foreground.length; i += 1) {
                normalized[i] = (foreground[i] - minValue) / range;
            }
        }

        let count = 0;
        let top = canvas.height;
        let bottom = -1;
        let left = canvas.width;
        let right = -1;
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const hit = normalized[y * canvas.width + x] > 0.18;
                if (!hit) continue;
                count += 1;
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
                left = Math.min(left, x);
                right = Math.max(right, x);
            }
        }
        if (count < 10) throw new Error("没有检测到有效数字，请写大一点");

        const cropWidth = right - left + 1;
        const cropHeight = bottom - top + 1;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext("2d");
        const cropImage = cropCtx.createImageData(cropWidth, cropHeight);
        for (let y = 0; y < cropHeight; y += 1) {
            for (let x = 0; x < cropWidth; x += 1) {
                const value = Math.round(normalized[(top + y) * canvas.width + (left + x)] * 255);
                const offset = (y * cropWidth + x) * 4;
                cropImage.data[offset] = value;
                cropImage.data[offset + 1] = value;
                cropImage.data[offset + 2] = value;
                cropImage.data[offset + 3] = 255;
            }
        }
        cropCtx.putImageData(cropImage, 0, 0);

        const maxSide = Math.max(cropWidth, cropHeight);
        const scaledWidth = Math.max(1, Math.round(20 / maxSide * cropWidth));
        const scaledHeight = Math.max(1, Math.round(20 / maxSide * cropHeight));
        const scaledCanvas = document.createElement("canvas");
        scaledCanvas.width = scaledWidth;
        scaledCanvas.height = scaledHeight;
        const scaledCtx = scaledCanvas.getContext("2d");
        scaledCtx.imageSmoothingEnabled = true;
        scaledCtx.drawImage(cropCanvas, 0, 0, scaledWidth, scaledHeight);
        const resized = scaledCtx.getImageData(0, 0, scaledWidth, scaledHeight).data;
        const canvas28 = new Float32Array(28 * 28);
        const x0 = Math.floor((28 - scaledWidth) / 2);
        const y0 = Math.floor((28 - scaledHeight) / 2);
        for (let y = 0; y < scaledHeight; y += 1) {
            for (let x = 0; x < scaledWidth; x += 1) {
                canvas28[(y0 + y) * 28 + (x0 + x)] = resized[(y * scaledWidth + x) * 4] / 255;
            }
        }

        let mass = 0;
        let sumX = 0;
        let sumY = 0;
        for (let y = 0; y < 28; y += 1) {
            for (let x = 0; x < 28; x += 1) {
                const value = canvas28[y * 28 + x];
                mass += value;
                sumX += x * value;
                sumY += y * value;
            }
        }
        if (mass > 0) {
            const shiftX = Math.round(13.5 - sumX / mass);
            const shiftY = Math.round(13.5 - sumY / mass);
            const shifted = new Float32Array(28 * 28);
            for (let y = 0; y < 28; y += 1) {
                for (let x = 0; x < 28; x += 1) {
                    const sx = x - shiftX;
                    const sy = y - shiftY;
                    if (sx < 0 || sx >= 28 || sy < 0 || sy >= 28) continue;
                    shifted[y * 28 + x] = canvas28[sy * 28 + sx];
                }
            }
            return Array.from({ length: 28 }, (_, row) => Array.from(shifted.slice(row * 28, (row + 1) * 28)));
        }
        return Array.from({ length: 28 }, (_, row) => Array.from(canvas28.slice(row * 28, (row + 1) * 28)));
    }

    async function updateDigitActivations() {
        if (!state.hasInk) return;
        try {
            if (!window.loadClientDigitModel || !window.clientDigitModel?.predictDetailed) {
                throw new Error("前端手写模型脚本未加载");
            }
            if (els.digitStatus) els.digitStatus.textContent = "正在推理并更新 3D 热力图...";
            const canvas28 = preprocessDigitCanvas();
            await window.loadClientDigitModel();
            const result = window.clientDigitModel.predictDetailed(canvas28);
            state.scene?.setActivations(result);
            if (els.digitStatus) {
                els.digitStatus.innerHTML = `预测 <b>${result.prediction}</b>，置信度 <b>${(result.confidence * 100).toFixed(1)}%</b>，${result.elapsed_ms.toFixed(2)} ms`;
            }
        } catch (error) {
            if (els.digitStatus) els.digitStatus.textContent = error.message || "手写模型更新失败";
        }
    }

    function scheduleDigitUpdate() {
        window.clearTimeout(state.digitTimer);
        state.digitTimer = window.setTimeout(updateDigitActivations, 360);
    }

    function miniMatrix(values, cols = 3, hotIndex = -1, blocked = []) {
        return `<div class="cnn-mini-matrix cols-${cols}">${values.map((value, index) => {
            const klass = index === hotIndex ? "hot" : blocked.includes(index) ? "blocked" : "";
            return `<span class="${klass}">${value}</span>`;
        }).join("")}</div>`;
    }

    function calcBox(title, body) {
        return `<div class="cnn-calc-box"><strong>${title}</strong>${body}</div>`;
    }

    function formulaLine(text) {
        return `<div class="cnn-formula-line">${text}</div>`;
    }

    function latexFormula(tex) {
        return `<div class="cnn-formula-line" data-tex="${tex.replace(/"/g, "&quot;")}"></div>`;
    }

    function calcChain(items) {
        return `<div class="cnn-calc-chain">${items.map((item, index) => `
            <div class="cnn-chain-item">
                <strong>${item.title}</strong>
                <div>${item.body}</div>
            </div>
            ${index < items.length - 1 ? '<span class="cnn-chain-arrow">→</span>' : ''}
        `).join("")}</div>`;
    }

    function structuredStep({ formula, substitution, chain, conclusion }) {
        return `
            <div class="cnn-step-section">
                <strong>核心公式</strong>
                ${latexFormula(formula)}
            </div>
            <div class="cnn-step-section">
                <strong>数值代入</strong>
                <p>${substitution}</p>
            </div>
            <div class="cnn-step-section">
                <strong>计算链</strong>
                ${chain}
            </div>
            <div class="cnn-step-section">
                <strong>本步结论</strong>
                <p>${conclusion}</p>
            </div>
        `;
    }

    function detailedBody(step) {
        const id = step.id;
        if (id === "O1") {
            return structuredStep({
                formula: "1\\times28\\times28 \\rightarrow 32\\times28\\times28 \\rightarrow 64\\times7\\times7 \\rightarrow 3136 \\rightarrow 128 \\rightarrow 10",
                substitution: "输入是一张 28×28 手写数字；Conv1 抽样显示 8 张特征图代表 32 通道，Conv2/Pool2 抽样显示更多通道代表 64 通道。",
                chain: calcChain([
                    { title: "输入", body: "1×28×28" },
                    { title: "卷积特征", body: "Conv/ReLU/Pool × 2" },
                    { title: "分类", body: "Flatten → FC → Softmax" }
                ]),
                conclusion: "总览模式用于观察完整网络结构；Forward / Backward 会按步骤显示数据流和梯度流。"
            });
        }
        if (id === "F2" || id === "F5") {
            return structuredStep({
                formula: "z_{i,j,k}=\\sum_{u,v,c}x_{i+u,j+v,c}w_{u,v,c,k}+b_k",
                substitution: "patch 中心值 0.90，kernel 中心权重 0.31，局部乘积 0.90×0.31=0.279；sum=0.28，bias=0.07，输出 0.35。",
                chain: calcChain([
                    { title: "input patch", body: miniMatrix(["0.0", "0.2", "0.8", "0.1", "0.9", "0.7", "0.0", "0.3", "0.6"], 3, 4) },
                    { title: "kernel", body: miniMatrix(["0.12", "-0.08", "0.04", "0.18", "0.31", "-0.15", "0.02", "0.11", "0.09"], 3, 4) },
                    { title: "elementwise", body: miniMatrix(["0", "-.02", ".03", ".02", ".28", "-.11", "0", ".03", ".05"], 3, 4) },
                    { title: "sum+bias", body: "0.28 + 0.07 = <b>0.35</b>" }
                ]),
                conclusion: "蓝色计算块从输入 patch 进入卷积核，乘加结果写入当前 feature map 位置。"
            });
        }
        if (id === "F3" || id === "F6") {
            return structuredStep({
                formula: "a=\\max(0,z)",
                substitution: "z=[-0.40,0.20,1.10,-0.10]，小于 0 的位置被置为 0。",
                chain: calcChain([
                    { title: "Z", body: miniMatrix(["-0.4", "0.2", "1.1", "-0.1"], 2, -1, [0, 3]) },
                    { title: "mask", body: miniMatrix(["0", "1", "1", "0"], 2, -1, [0, 3]) },
                    { title: "A", body: miniMatrix(["0", "0.2", "1.1", "0"], 2, -1, [0, 3]) }
                ]),
                conclusion: "ReLU 正响应保留并变亮，负响应区域变灰，表示信号被截断。"
            });
        }
        if (id === "F4" || id === "F7") {
            return structuredStep({
                formula: "p_{i,j,k}=\\max A_{2i:2i+2,2j:2j+2,k}",
                substitution: "2×2 区域 [0.12,0.48;0.31,0.09] 中最大值是 0.48。",
                chain: calcChain([
                    { title: "2×2 region", body: miniMatrix(["0.12", "0.48", "0.31", "0.09"], 2, 1) },
                    { title: "max selector", body: "<b>0.48</b>" },
                    { title: "pooled map", body: id === "F4" ? "28×28 → 14×14" : "14×14 → 7×7" }
                ]),
                conclusion: "蓝色选择器把局部最大响应压缩到更小的池化特征图。"
            });
        }
        if (id === "F8") {
            return structuredStep({
                formula: "v=\\mathrm{reshape}(P),\\quad 64\\times7\\times7=3136",
                substitution: "Pool2 的每个通道按空间位置展开，64 个通道共得到 3136 维向量。",
                chain: calcChain([
                    { title: "Pool2 volume", body: "64×7×7" },
                    { title: "reshape", body: "按通道展开" },
                    { title: "flat vector", body: "3136" }
                ]),
                conclusion: "舞台中 feature volume 展开为紫色向量，为 FC 层提供输入。"
            });
        }
        if (id === "F9") {
            return structuredStep({
                formula: "h_j=\\sum_i v_iW_{i,j}+b_j",
                substitution: "v[12]=0.64，W[12,7]=0.18，单项贡献 0.64×0.18=0.115。",
                chain: calcChain([
                    { title: "flat node", body: "v[12]=0.64" },
                    { title: "weight", body: "W[12,7]=0.18" },
                    { title: "hidden node", body: "累加到 h[7]" }
                ]),
                conclusion: "FC 连接线发光，表示特征向分类隐藏表示聚合。"
            });
        }
        if (id === "F10") {
            return structuredStep({
                formula: "p_i=\\frac{e^{z_i}}{\\sum_j e^{z_j}}",
                substitution: "预测类 logit 最大，因此指数化和归一化后对应概率柱最高。",
                chain: calcChain([
                    { title: "logits", body: "[0.1,-0.4,0.6,3.2,...]" },
                    { title: "exp / sum", body: "指数化后除以总和" },
                    { title: "probability", body: "p(3)≈0.72" }
                ]),
                conclusion: "Softmax 概率柱增长，最高类别用更醒目的颜色标记。"
            });
        }
        if (id === "B1") {
            return structuredStep({
                formula: "\\frac{\\partial L}{\\partial z}=p-y",
                substitution: "[0.02,0.04,0.72,0.03,...] - [0,0,0,1,...] = [0.02,0.04,0.72,-0.97,...]",
                chain: calcChain([
                    { title: "probs", body: "[0.02,0.04,0.72,0.03]" },
                    { title: "onehot", body: "[0,0,0,1]" },
                    { title: "dlogits", body: "[0.02,0.04,0.72,-0.97]" }
                ]),
                conclusion: "Softmax 右侧生成橙色梯度，真实类别为负梯度，其余类别为正梯度。"
            });
        }
        if (id === "B2") {
            return structuredStep({
                formula: "dW_2=h^T dlogits,\\quad db_2=dlogits,\\quad dh=dlogits\\,W_2^T",
                substitution: "h[18]=0.64，dlogits[3]=-0.28，所以 dW2[18,3]=0.64×(-0.28)=-0.179；db2[3]=-0.28；dh 回传到 128 维隐藏层。",
                chain: calcChain([
                    { title: "dW2", body: "h[i]×dlogits[j]<br>0.64×-0.28=<b>-0.179</b>" },
                    { title: "db2", body: "db2[j]=dlogits[j]<br><b>-0.28</b>" },
                    { title: "dh", body: "dlogits·W2^T<br>→ 128 维" }
                ]),
                conclusion: "FC2 反向同时得到权重梯度 dW2、偏置梯度 db2，并把梯度 dh 传回 FC1 隐藏表示。"
            });
        }
        if (id === "B3") {
            return structuredStep({
                formula: "dW_1=flat^T dZ_{fc1},\\quad db_1=dZ_{fc1},\\quad dflat=dZ_{fc1}W_1^T",
                substitution: "dh[7]=0.31，FC1 ReLU mask[7]=1，所以 dZfc1[7]=0.31；flat[12]=0.64，则 dW1[12,7]=0.64×0.31=0.198。",
                chain: calcChain([
                    { title: "dZfc1", body: "dh⊙mask<br>0.31×1=<b>0.31</b>" },
                    { title: "dW1 / db1", body: "flat×dZfc1=<b>0.198</b><br>db1=dZfc1" },
                    { title: "dflat", body: "dZfc1·W1^T<br>→ 3136 维" }
                ]),
                conclusion: "FC1 反向先经过隐藏层 ReLU mask，再计算 dW1、db1，并把 dflat 继续传回 Flatten。"
            });
        }
        if (id === "B5" || id === "B8") {
            return structuredStep({
                formula: "dA_{\\mathrm{argmax}}=dP,\\quad dA_{others}=0",
                substitution: "前向最大值位置为 0.48，上游梯度 dP=0.36，因此只有该位置接收 0.36。",
                chain: calcChain([
                    { title: "forward region", body: miniMatrix(["0.12", "0.48", "0.31", "0.09"], 2, 1) },
                    { title: "upstream dP", body: "0.36" },
                    { title: "routed dA", body: miniMatrix(["0", "0.36", "0", "0"], 2, 1, [0, 2, 3]) }
                ]),
                conclusion: `${id === "B5" ? "Pool2" : "Pool1"} 反向只把梯度路由给前向最大值位置，其余位置为 0。`
            });
        }
        if (id === "B6" || id === "B9") {
            return structuredStep({
                formula: "dZ=dA\\odot \\mathbf{1}(Z>0)",
                substitution: "Z≤0 的位置 mask=0，所以即使上游 dA 有梯度也会被阻断；Z>0 的位置保留 dA。",
                chain: calcChain([
                    { title: "Z", body: miniMatrix(["-0.4", "0.2", "1.1", "-0.1"], 2, -1, [0, 3]) },
                    { title: "mask", body: miniMatrix(["0", "1", "1", "0"], 2, -1, [0, 3]) },
                    { title: "dA", body: miniMatrix(["0.2", "0.3", "-0.1", "0.4"], 2) },
                    { title: "dZ", body: miniMatrix(["0", "0.3", "-0.1", "0"], 2, -1, [0, 3]) }
                ]),
                conclusion: `${id === "B6" ? "ReLU2" : "ReLU1"} 只允许正响应位置通过梯度，负响应位置用灰色阻断。`
            });
        }
        if (id === "B7" || id === "B10") {
            return structuredStep({
                formula: "dK+=patch\\,dZ,\\quad db+=dZ,\\quad dX_{patch}+=K\\,dZ",
                substitution: "dZ=-0.24,patch中心0.9,所以dK中心贡献0.9×(-0.24)=-0.216;db累加-0.24;dX_patch使用K×dZ回传",
                chain: calcChain([
                    { title: "dK += patch×dZ", body: miniMatrix(["0", "-.05", "-.19", "-.02", "-.22", "-.17", "0", "-.07", "-.14"], 3, 4) },
                    { title: "db += dZ", body: "db += <b>-0.24</b>" },
                    { title: "dX_patch += K×dZ", body: miniMatrix(["-.03", ".02", "-.01", "-.04", "-.07", ".04", "-.01", "-.03", "-.02"], 3, 4) }
                ]),
                conclusion: `${id === "B7" ? "Conv2" : "Conv1"} 反向同时产生dK、db和传给上一层的dX；动画高亮dZ、输入patch和kernel contribution。`
            });
        }
        if (id === "B11") {
            return structuredStep({
                formula: "\\theta^{(l)}_{new}=\\theta^{(l)}_{old}-\\eta\\,\\frac{\\partial L}{\\partial \\theta^{(l)}}",
                substitution: "一次 update 会同时作用于所有含参数层：Conv1、Conv2、FC1、FC2。示例：K1=0.20-0.10×0.42=0.158，Wfc2=-0.30-0.10×(-0.18)=-0.282。",
                chain: calcChain([
                    { title: "Conv1 kernel/bias", body: "K1: 0.20 → <b>0.158</b><br>b1: 0.04 → <b>0.031</b>" },
                    { title: "Conv2 kernel/bias", body: "K2: -0.12 → <b>-0.097</b><br>b2: 0.08 → <b>0.074</b>" },
                    { title: "FC1 weights/bias", body: "W1: 0.16 → <b>0.151</b><br>b1: -0.03 → <b>-0.026</b>" },
                    { title: "FC2 weights/bias", body: "W2: -0.30 → <b>-0.282</b><br>b2: 0.06 → <b>0.041</b>" }
                ]),
                conclusion: "绿色闪烁现在覆盖 Conv1、Conv2 和 FC 区域，表示优化器在反向传播完成后统一更新所有可学习参数，而不是只更新一个卷积核。"
            });
        }
        if (id === "B11") {
            return structuredStep({
                formula: "\\theta_{new}=\\theta_{old}-\\eta\\,d\\theta",
                substitution: "K_new=0.20-0.10×0.42=0.158；W_new=-0.30-0.10×(-0.18)=-0.282。",
                chain: calcChain([
                    { title: "K update", body: "0.20 → <b>0.158</b>" },
                    { title: "W update", body: "-0.30 → <b>-0.282</b>" },
                    { title: "lr", body: "0.10" }
                ]),
                conclusion: "Update 步骤使用绿色闪烁，表示卷积核和 FC 权重沿负梯度方向更新。"
            });
        }
        if (id === "B4") {
            return structuredStep({
                formula: "dP=\\mathrm{reshape}(dflat)",
                substitution: "3136 维 dflat 按 64×7×7 的原始形状还原。",
                chain: calcChain([
                    { title: "dflat", body: "3136" },
                    { title: "reshape", body: "恢复通道和空间位置" },
                    { title: "dPool2", body: "64×7×7" }
                ]),
                conclusion: "Flatten 反向不改变梯度数值，只改变梯度形状。"
            });
        }
        return forwardBody(step);
    }

    function overviewBody() {
        return `
            ${formulaLine("1×28×28 → Conv/ReLU/Pool → Conv/ReLU/Pool → Flatten 3136 → FC 128 → Softmax 10")}
            <p>3D 舞台中 Conv1 抽样显示 8 张 feature maps 表示 32 通道，Conv2 抽样显示 12 张 feature maps 表示 64 通道。点击任意层可以打开 Computation Probe。</p>
            <div class="cnn-calc-grid">
                ${calcBox("输入", "1×28×28 灰度手写数字")}
                ${calcBox("卷积块 1", "Conv1 32×28×28，ReLU，Pool1 32×14×14")}
                ${calcBox("卷积块 2", "Conv2 64×14×14，ReLU，Pool2 64×7×7")}
                ${calcBox("分类器", "Flatten 3136 → FC 128 → Softmax 10")}
            </div>
        `;
    }

    function forwardBody(step) {
        if (step.id === "F2") {
            return `
                ${formulaLine("z[i,j,k] = Σ patch × kernel + bias")}
                <div class="cnn-calc-grid">
                    ${calcBox("input patch", miniMatrix(["0.0", "0.2", "0.8", "0.1", "0.9", "0.7", "0.0", "0.3", "0.6"], 3, 4))}
                    ${calcBox("kernel", miniMatrix(["0.12", "-0.08", "0.04", "0.18", "0.31", "-0.15", "0.02", "0.11", "0.09"], 3))}
                    ${calcBox("elementwise", miniMatrix(["0", "-.02", ".03", ".02", ".28", "-.11", "0", ".03", ".05"], 3, 4))}
                    ${calcBox("sum + bias", "0.28 + 0.07 = <b>0.35</b><br>写入 Conv1 feature map 的代表位置")}
                </div>
                <p>3D 场景高亮输入局部 patch、卷积核和输出 feature map 堆叠中的一个代表通道。</p>
            `;
        }
        if (step.id === "F3" || step.id === "F6") {
            return `
                ${formulaLine("A = max(0, Z)")}
                <div class="cnn-calc-grid">
                    ${calcBox("Z", miniMatrix(["-0.4", "0.2", "1.1", "-0.1"], 2, -1, [0, 3]))}
                    ${calcBox("mask", miniMatrix(["0", "1", "1", "0"], 2, -1, [0, 3]))}
                    ${calcBox("A", miniMatrix(["0", "0.2", "1.1", "0"], 2, -1, [0, 3]))}
                    ${calcBox("结论", "负响应被截断为 0，正响应继续传向下一层。")}
                </div>
            `;
        }
        if (step.id === "F4" || step.id === "F7") {
            return `
                ${formulaLine("P[i,j] = max(2×2 region)")}
                <div class="cnn-calc-grid">
                    ${calcBox("2×2 region", miniMatrix(["0.12", "0.48", "0.31", "0.09"], 2, 1))}
                    ${calcBox("max", "<b>0.48</b> 是该区域最大响应")}
                    ${calcBox("输出位置", "写入 pooled feature map 的 P[i,j]")}
                    ${calcBox("尺寸变化", step.id === "F4" ? "28×28 → 14×14" : "14×14 → 7×7")}
                </div>
            `;
        }
        if (step.id === "F8") {
            return `
                ${formulaLine("v = reshape(Pool2), 64×7×7 = 3136")}
                <p>Pool2 的三维 feature volume 按通道和空间位置展开成一维向量，舞台中用抽样小方块表示 3136 维输入。</p>
            `;
        }
        if (step.id === "F9") {
            return `
                ${formulaLine("h = ReLU(Wv + b)")}
                <div class="cnn-calc-grid">
                    ${calcBox("flat[i]", "v[12] = 0.64")}
                    ${calcBox("weight", "W[12,7] = 0.18")}
                    ${calcBox("贡献", "0.64 × 0.18 = 0.115")}
                    ${calcBox("隐藏节点", "累加所有输入后得到 h[7]")}
                </div>
            `;
        }
        if (step.id === "F10") {
            return `
                ${formulaLine("p_i = exp(z_i) / Σ exp(z_j)")}
                <div class="cnn-calc-grid">
                    ${calcBox("logits", "[0.1, -0.4, 0.6, 3.2, ...]")}
                    ${calcBox("exp", "对每个 logit 指数化")}
                    ${calcBox("normalize", "所有 exp 值求和后归一化")}
                    ${calcBox("预测", "数字 3 概率最高，p≈0.72")}
                </div>
            `;
        }
        return `
            ${formulaLine("X ∈ R^(1×28×28)")}
            <p>输入层显示一张预处理后的手写数字热力图，亮度越高表示像素越接近笔画前景。</p>
        `;
    }

    function backwardBody(step) {
        if (step.id === "B1") {
            return `
                ${formulaLine("dlogits = probs - onehot(label)")}
                <div class="cnn-calc-grid">
                    ${calcBox("probs", "[0.02, 0.04, 0.72, 0.03, ...]")}
                    ${calcBox("onehot(3)", "[0, 0, 0, 1, 0, ...]")}
                    ${calcBox("dlogits", "[0.02, 0.04, 0.72, -0.97, ...]")}
                    ${calcBox("结论", "真实类别位置为负梯度，其余类别为正梯度。")}
                </div>
            `;
        }
        if (step.id === "B2") {
            return `
                ${formulaLine("dW_fc[i,j] = flat[i] × dlogits[j]")}
                <div class="cnn-calc-grid">
                    ${calcBox("flat[i]", "flat[18] = 0.64")}
                    ${calcBox("dlogits[j]", "dlogits[3] = -0.28")}
                    ${calcBox("dW", "dW[18,3] = 0.64 × -0.28 = <b>-0.179</b>")}
                    ${calcBox("dflat", "dflat[i] = Σ W[i,j] × dlogits[j]")}
                </div>
            `;
        }
        if (step.id === "B3") {
            return `
                ${formulaLine("dPool2 = reshape(dflat), 3136 → 64×7×7")}
                <p>Flatten 不改变数值，只改变形状。反向传播时把一维梯度按原来的通道和空间顺序 reshape 回 Pool2 feature volume。</p>
            `;
        }
        if (step.id === "B4") {
            return `
                ${formulaLine("dA[position_of_max] = dP, others = 0")}
                <div class="cnn-calc-grid">
                    ${calcBox("前向 region", miniMatrix(["0.12", "0.48", "0.31", "0.09"], 2, 1))}
                    ${calcBox("上游 dP", "dP = 0.36")}
                    ${calcBox("回传 dA", miniMatrix(["0", "0.36", "0", "0"], 2, 1, [0, 2, 3]))}
                    ${calcBox("结论", "只有最大值位置接收橙色梯度。")}
                </div>
            `;
        }
        if (step.id === "B5") {
            return `
                ${formulaLine("dZ = dA × 1(Z > 0)")}
                <div class="cnn-calc-grid">
                    ${calcBox("Z", miniMatrix(["-0.4", "0.2", "1.1", "-0.1"], 2, -1, [0, 3]))}
                    ${calcBox("mask", miniMatrix(["0", "1", "1", "0"], 2, -1, [0, 3]))}
                    ${calcBox("dA", miniMatrix(["0.2", "0.3", "-0.1", "0.4"], 2))}
                    ${calcBox("dZ", miniMatrix(["0", "0.3", "-0.1", "0"], 2, -1, [0, 3]))}
                </div>
            `;
        }
        if (step.id === "B6") {
            return `
                ${formulaLine("dK[u,v] += input_patch[u,v] × dZ[i,j,k]")}
                <div class="cnn-calc-grid">
                    ${calcBox("dZ[i,j,k]", "dZ = -0.24")}
                    ${calcBox("input patch", miniMatrix(["0.0", "0.2", "0.8", "0.1", "0.9", "0.7", "0.0", "0.3", "0.6"], 3, 4))}
                    ${calcBox("contribution", miniMatrix(["0", "-.05", "-.19", "-.02", "-.22", "-.17", "0", "-.07", "-.14"], 3, 4))}
                    ${calcBox("dK 累加", "对所有空间位置和通道累加 contribution。")}
                </div>
            `;
        }
        return `
            ${formulaLine("θ_new = θ_old - lr × dθ")}
            <div class="cnn-calc-grid">
                ${calcBox("K_old", "0.20")}
                ${calcBox("dK", "0.42")}
                ${calcBox("lr", "0.10")}
                ${calcBox("K_new", "0.20 - 0.10×0.42 = <b>0.158</b>")}
            </div>
            <p>参数更新使用绿色标记，表示网络权重沿着降低 loss 的方向移动一步。</p>
        `;
    }

    function bodyForStep(step) {
        return detailedBody(step);
    }

    function themeForStep(step) {
        return step.theme === "update" ? "update" : step.theme === "backward" ? "backward" : "forward";
    }

    function renderTimeline() {
        els.timelineMode.textContent = state.mode === "overview" ? "Overview" : state.mode === "forward" ? "Forward" : "Backward";
        const row = (mode, label, steps, labelClass = "") => `
            <div class="cnn-timeline-row">
                <div class="cnn-timeline-row-label ${labelClass}">${label}</div>
                <div class="cnn-timeline-track ${labelClass}">
                    ${steps.map((step, index) => {
                        const active = state.mode === mode && index === state.stepIndex;
                        return `
                            <button class="cnn-step-pill theme-${themeForStep(step)} ${active ? "is-active" : ""}" type="button" data-mode-step="${mode}" data-step="${index}" title="${step.title}">
                                <strong>${step.id}</strong>
                                <span>${step.id} ${step.label}</span>
                            </button>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
        els.timeline.innerHTML = `
            ${row("forward", "Forward", forwardSteps)}
            ${row("backward", "Backward", backwardSteps, "backward")}
        `;
        els.timeline.querySelectorAll("[data-step]").forEach((button) => {
            button.addEventListener("click", () => {
                state.mode = button.dataset.modeStep;
                state.stepIndex = Number(button.dataset.step);
                stopPlayback();
                renderAll();
                showProbe((stepsForMode()[state.stepIndex] || {}).layer);
            });
        });
    }

    function renderStepCard() {
        const step = stepsForMode()[state.stepIndex] || stepsForMode()[0];
        const theme = themeForStep(step);
        els.stepCard.classList.remove("theme-forward", "theme-backward", "theme-update");
        els.stepCard.classList.add(`theme-${theme}`);
        els.stepTitle.textContent = step.title;
        els.stepBody.innerHTML = bodyForStep(step);
        els.stepBody.querySelectorAll("[data-tex]").forEach((node) => {
            renderLatex(node, node.dataset.tex);
        });
    }

    function renderStatus() {
        const step = stepsForMode()[state.stepIndex] || stepsForMode()[0];
        const meta = layerInfo[step.layer];
        els.status.textContent = `${step.id} · ${step.label}`;
        els.activeLayerLabel.textContent = `${meta.title} · ${meta.output}`;
        els.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.mode));
    }

    function updateScene() {
        const step = stepsForMode()[state.stepIndex] || stepsForMode()[0];
        state.scene?.setStep({
            mode: step.theme === "update" ? "update" : state.mode,
            layer: step.layer,
            focus: !state.playing,
            panOnly: state.playing
        });
    }

    function renderAll() {
        renderTimeline();
        renderStepCard();
        renderStatus();
        if (els.probe && !els.probe.hidden) {
            const step = stepsForMode()[state.stepIndex] || stepsForMode()[0];
            showProbe(step.layer);
        }
        updateScene();
        renderLandscapePanel();
    }

    function setMode(mode) {
        state.mode = mode;
        state.stepIndex = 0;
        state.scene?.setMode(mode);
        renderAll();
    }

    function syncStepFromLayer(layerKey) {
        if (!layerKey) return;
        const findStep = (steps) => steps.findIndex((step) => step.layer === layerKey);
        let targetMode = state.mode;
        let index = targetMode === "backward" ? findStep(backwardSteps) : findStep(forwardSteps);

        if (index < 0 && targetMode === "backward") {
            index = findStep(forwardSteps);
            targetMode = "forward";
        }
        if (index < 0 || targetMode === "overview") {
            index = findStep(forwardSteps);
            targetMode = index >= 0 ? "forward" : "overview";
        }
        if (index < 0) return;

        stopPlayback();
        state.mode = targetMode;
        state.stepIndex = index;
        renderAll();
    }

    function showProbe(layerKey) {
        if (!layerKey) {
            els.probe.hidden = true;
            els.stageCard?.classList.remove("stage--probe-open");
            state.scene?.setProbeOpen?.(false);
            return;
        }
        const info = layerInfo[layerKey];
        if (!info) return;
        els.probe.hidden = false;
        els.stageCard?.classList.add("stage--probe-open");
        state.scene?.setProbeOpen?.(true);
        els.probeTitle.textContent = info.title;
        els.probeInput.textContent = info.input;
        els.probeOutput.textContent = info.output;
        els.probePosition.textContent = probePositionText(layerKey);
        els.probeRole.textContent = info.role;
        renderLatex(els.probeFormula, info.formula);
        els.probeImpl.textContent = info.impl;
    }

    function probePositionText(layerKey) {
        const step = stepsForMode()[state.stepIndex] || stepsForMode()[0];
        if (layerKey.startsWith("conv")) return "代表通道 k=5，空间位置 i=10, j=12";
        if (layerKey.startsWith("relu")) return "代表通道 k=5，正/负响应位置对比";
        if (layerKey.startsWith("pool")) return "代表 2×2 pooling window，argmax 位置";
        if (layerKey === "flatten") return "Pool2 展开后的代表索引 v[18]";
        if (layerKey === "fc") return step.theme === "update" ? "FC1 / FC2 权重与 bias 参数" : "flat[18] → hidden/output 节点";
        if (layerKey === "softmax") return "预测概率柱、真实类别与 dlogits";
        return "当前输入热力图代表位置";
    }

    function stopPlayback() {
        window.clearInterval(state.timer);
        state.timer = null;
        state.playing = false;
        els.playPause.textContent = "Play";
    }

    function startPlayback() {
        stopPlayback();
        state.playing = true;
        els.playPause.textContent = "Pause";
        const delay = Math.max(360, 1150 / state.speed);
        state.timer = window.setInterval(() => {
            const steps = stepsForMode();
            state.stepIndex = (state.stepIndex + 1) % steps.length;
            renderAll();
        }, delay);
    }


    function cvUrl(path) {
        if (typeof window.cvclassUrl === "function") return window.cvclassUrl(path);
        const basePath = window.CVCLASS_BASE_PATH || "";
        return `${basePath}${path}`;
    }

    async function fetchJsonCandidates(paths) {
        let lastError = null;
        for (const path of paths) {
            try {
                const response = await fetch(cvUrl(path), { cache: "no-store" });
                if (!response.ok) throw new Error(`${path} ${response.status}`);
                const data = await response.json();
                if (data && data.success === false) throw new Error(data.message || `${path} 返回 success=false`);
                return { data, path };
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error("训练轨迹数据不存在");
    }

    function normalizeTraceData(raw) {
        const rows = Array.isArray(raw) ? raw : raw?.trace || raw?.points || raw?.data || [];
        return rows.map((row, index) => ({
            step: Number(row.step ?? index),
            epoch: Number(row.epoch ?? Math.floor(index / 8)),
            train_loss: Number(row.train_loss ?? row.loss ?? 0),
            val_loss: Number(row.val_loss ?? row.train_loss ?? row.loss ?? 0),
            train_acc: Number(row.train_acc ?? row.acc ?? row.accuracy ?? 0),
            val_acc: Number(row.val_acc ?? row.train_acc ?? row.acc ?? row.accuracy ?? 0),
            lr: Number(row.lr ?? 0.1),
            grad_norm: Number(row.grad_norm ?? row.grad_norm_total ?? 0),
            update_norm: Number(row.update_norm ?? row.update_norm_total ?? 0),
            pc1: Number(row.pc1 ?? row.x ?? 0),
            pc2: Number(row.pc2 ?? row.y ?? 0),
            loss: Number(row.loss ?? row.val_loss ?? row.train_loss ?? 0)
        })).filter((row) => Number.isFinite(row.loss));
    }

    function syntheticTrace() {
        const rows = [];
        for (let i = 0; i < 44; i += 1) {
            const t = i / 43;
            const trainLoss = 2.15 * Math.exp(-3.2 * t) + 0.13 + 0.04 * Math.sin(i * 0.65);
            const valLoss = 2.0 * Math.exp(-2.85 * t) + 0.18 + 0.05 * Math.cos(i * 0.52);
            rows.push({
                step: i * 25,
                epoch: Math.floor(i / 11) + 1,
                train_loss: Math.max(0.08, trainLoss),
                val_loss: Math.max(0.1, valLoss),
                train_acc: Math.min(99.2, 38 + t * 61 + 2.2 * Math.sin(i * 0.42)),
                val_acc: Math.min(98.5, 34 + t * 59 + 2.0 * Math.cos(i * 0.35)),
                lr: i < 26 ? 0.1 : 0.05,
                grad_norm: 2.4 * Math.exp(-1.6 * t) + 0.18,
                update_norm: 0.24 * Math.exp(-1.7 * t) + 0.015,
                pc1: -2.8 + 5.2 * t + 0.18 * Math.sin(i * 0.3),
                pc2: 1.6 * Math.cos(t * Math.PI * 1.15) - 0.45 * t,
                loss: Math.max(0.1, valLoss)
            });
        }
        return rows;
    }

    function syntheticSurface(trace) {
        const alpha = Array.from({ length: 45 }, (_, i) => -3 + i * (6 / 44));
        const beta = Array.from({ length: 45 }, (_, i) => -2.6 + i * (5.2 / 44));
        const z = beta.map((b) => alpha.map((a) => {
            const bowl = 0.13 + 0.19 * Math.pow(a - 1.55, 2) + 0.24 * Math.pow(b + 0.75, 2);
            const ripple = 0.04 * Math.sin(a * 2.1) * Math.cos(b * 1.7);
            return Math.max(0.08, bowl + ripple);
        }));
        return {
            alpha_values: alpha,
            beta_values: beta,
            loss_grid: z,
            final_point: { alpha: 1.55, beta: -0.75, loss: 0.13 },
            trajectory_on_surface: trace.map((row) => ({
                alpha: row.pc1,
                beta: row.pc2,
                loss: row.loss,
                step: row.step
            }))
        };
    }

    function normalizeSurface(raw, trace) {
        if (!raw || !Array.isArray(raw.loss_grid)) return syntheticSurface(trace);
        return {
            alpha_values: raw.alpha_values || raw.x || [],
            beta_values: raw.beta_values || raw.y || [],
            loss_grid: raw.loss_grid || raw.z || [],
            final_point: raw.final_point || null,
            trajectory_on_surface: raw.trajectory_on_surface || raw.trajectory || []
        };
    }

    function normalizeLrComparison(raw) {
        if (!raw || !Array.isArray(raw.series)) return null;
        const series = raw.series.map((item) => {
            const points = Array.isArray(item.points) ? item.points.map((row) => ({
                step: Number(row.step ?? 0),
                epoch: Number(row.epoch ?? 0),
                batch: Number(row.batch ?? 0),
                pc1: Number(row.pc1 ?? 0),
                pc2: Number(row.pc2 ?? 0),
                loss: Number(row.loss ?? row.val_loss ?? row.train_loss ?? 0),
                train_loss: Number(row.train_loss ?? row.loss ?? 0),
                val_loss: Number(row.val_loss ?? row.loss ?? row.train_loss ?? 0),
                train_acc: Number(row.train_acc ?? 0),
                val_acc: Number(row.val_acc ?? row.train_acc ?? 0),
                lr: Number(row.lr ?? item.lr ?? 0),
                grad_norm_total: Number(row.grad_norm_total ?? 0),
                update_norm_total: Number(row.update_norm_total ?? 0)
            })).filter((row) => Number.isFinite(row.loss)) : [];
            return {
                lr: Number(item.lr),
                label: item.label || `lr=${item.lr}`,
                type: item.type || "compare",
                status: item.status || "ok",
                stop_reason: item.stop_reason || "",
                points
            };
        }).filter((item) => Number.isFinite(item.lr) && item.points.length);
        if (!series.length) return null;
        return {
            success: raw.success !== false,
            description: raw.description || "Learning-rate comparison trajectories use a shared PCA coordinate system.",
            primary_lr: Number(raw.primary_lr ?? series[0].lr),
            learning_rates: raw.learning_rates || series.map((item) => item.lr),
            series
        };
    }

    function syntheticLrComparison(baseTrace) {
        const lrs = [0.001, 0.01, 0.05, 0.1];
        const series = lrs.map((lr, idx) => {
            const factor = lr === 0.001 ? 0.38 : lr === 0.01 ? 1 : lr === 0.05 ? 1.25 : 1.6;
            const status = lr === 0.1 ? "demo_fast" : "demo";
            const points = baseTrace.map((row, i) => {
                const t = baseTrace.length <= 1 ? 1 : i / (baseTrace.length - 1);
                const slowLoss = baseTrace[0].loss - (baseTrace[0].loss - baseTrace[baseTrace.length - 1].loss) * Math.min(1, t * factor);
                const oscillation = lr === 0.1 ? Math.sin(i * 0.72) * 0.18 * (1 - t * 0.35) : 0;
                return {
                    ...row,
                    lr,
                    pc1: row.pc1 * factor + idx * 0.14,
                    pc2: row.pc2 * factor - idx * 0.08,
                    loss: Math.max(0.08, slowLoss + oscillation),
                    train_loss: Math.max(0.08, slowLoss + oscillation * 0.8),
                    val_loss: Math.max(0.1, slowLoss + oscillation),
                    update_norm_total: Number(row.update_norm_total || 0) * factor
                };
            });
            return { lr, label: `lr=${lr}`, type: lr === 0.001 ? "slow" : lr === 0.01 ? "primary" : "fast", status, stop_reason: "", points };
        });
        return { success: true, primary_lr: 0.01, learning_rates: lrs, series, description: "Synthetic learning-rate comparison for preview." };
    }

    function currentIndexForTrace(trace) {
        if (!trace?.length) return 0;
        const steps = stepsForMode();
        const ratio = steps.length <= 1 ? 1 : state.stepIndex / (steps.length - 1);
        return Math.max(0, Math.min(trace.length - 1, Math.round(ratio * (trace.length - 1))));
    }

    function selectedLrSeries() {
        const cmp = state.landscape.lrCompare;
        if (!cmp?.series?.length) return null;
        const selected = state.landscape.selectedLr;
        return cmp.series.find((item) => Math.abs(item.lr - selected) < 1e-12) || cmp.series[0];
    }

    function renderLrCompareControls() {
        if (!els.lrCompareToggle || !els.lrCompareButtons) return;
        const cmp = state.landscape.lrCompare;
        const enabled = !!(state.landscape.compareEnabled && cmp?.series?.length);
        els.lrCompareToggle.classList.toggle("is-active", enabled);
        els.lrCompareToggle.setAttribute("aria-pressed", String(enabled));
        els.lrCompareToggle.textContent = enabled ? "关闭对比" : "开启对比";
        els.lrCompareButtons.hidden = !enabled;
        if (!cmp?.series?.length) {
            els.lrCompareButtons.innerHTML = "";
            return;
        }
        els.lrCompareButtons.innerHTML = cmp.series.map((item) => {
            const active = Math.abs(item.lr - state.landscape.selectedLr) < 1e-12;
            const diverged = item.status && item.status !== "ok" && !item.status.startsWith("demo");
            return `<button type="button" class="${active ? "is-active" : ""} ${diverged ? "is-diverged" : ""}" data-lr="${item.lr}" title="${item.status || "ok"}${item.stop_reason ? `: ${item.stop_reason}` : ""}">${item.label}${diverged ? " · diverged" : ""}</button>`;
        }).join("");
        els.lrCompareButtons.querySelectorAll("[data-lr]").forEach((button) => {
            button.addEventListener("click", () => {
                state.landscape.selectedLr = Number(button.dataset.lr);
                renderLrCompareControls();
                plotLandscapeCharts();
            });
        });
    }

    async function loadLandscapeData(force = false) {
        if (state.landscape.loaded && !force) return;
        state.landscape.loading = true;
        if (els.landscapeStatus) {
            els.landscapeStatus.className = "cnn-landscape-status";
            els.landscapeStatus.textContent = "正在加载训练轨迹数据...";
        }
        try {
            const traceResult = await fetchJsonCandidates(["/static/assets/data/training_pca_trace.json"]);
            const trace = normalizeTraceData(traceResult.data);
            if (!trace.length) throw new Error("训练轨迹为空");

            let surface;
            let surfacePath = "";
            try {
                const surfaceResult = await fetchJsonCandidates(["/static/assets/data/fc2_loss_surface.json"]);
                surface = normalizeSurface(surfaceResult.data, trace);
                surfacePath = surfaceResult.path;
            } catch (_) {
                surface = syntheticSurface(trace);
                surfacePath = "示例 FC2 loss surface";
            }

            let lrCompare = null;
            let lrPath = "";
            try {
                const lrResult = await fetchJsonCandidates([
                    "/static/assets/data/lr_comparison_trace.json"
                ]);
                lrCompare = normalizeLrComparison(lrResult.data);
                lrPath = lrResult.path;
            } catch (_) {
                lrCompare = null;
                lrPath = "未加载学习率对比数据";
            }

            state.landscape.trace = trace;
            state.landscape.surface = surface;
            state.landscape.lrCompare = lrCompare;
            if (lrCompare?.series?.length && state.landscape.selectedLr === null) {
                state.landscape.selectedLr = lrCompare.primary_lr ?? lrCompare.series[0].lr;
            }
            state.landscape.source = `${traceResult.path}；${surfacePath}${lrCompare ? `；${lrPath}` : ""}`;
            state.landscape.loaded = true;
            renderLrCompareControls();
            if (els.landscapeStatus) {
                els.landscapeStatus.className = "cnn-landscape-status";
                els.landscapeStatus.textContent = `已加载训练轨迹：${state.landscape.source}`;
            }
        } catch (error) {
            const trace = syntheticTrace();
            state.landscape.trace = trace;
            state.landscape.surface = syntheticSurface(trace);
            state.landscape.lrCompare = syntheticLrComparison(trace);
            state.landscape.selectedLr = state.landscape.lrCompare.primary_lr;
            state.landscape.source = "内置演示数据";
            state.landscape.loaded = true;
            renderLrCompareControls();
            if (els.landscapeStatus) {
                els.landscapeStatus.className = "cnn-landscape-status is-demo";
                els.landscapeStatus.textContent = `未找到训练轨迹文件，当前显示内置演示数据。原因：${error.message || error}`;
            }
        } finally {
            state.landscape.loading = false;
        }
    }

    function currentLandscapeIndex() {
        const trace = state.landscape.trace || [];
        if (!trace.length) return 0;
        const steps = stepsForMode();
        const ratio = steps.length <= 1 ? 1 : state.stepIndex / (steps.length - 1);
        return Math.max(0, Math.min(trace.length - 1, Math.round(ratio * (trace.length - 1))));
    }

    function fmt(value, digits = 3) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "-";
        return n.toFixed(digits);
    }

    function updateLandscapeStats(current) {
        if (!current) return;
        els.lsStep && (els.lsStep.textContent = `${current.step}`);
        els.lsLoss && (els.lsLoss.textContent = fmt(current.loss ?? current.val_loss, 3));
        els.lsAcc && (els.lsAcc.textContent = `${fmt(current.val_acc ?? current.train_acc, 1)}%`);
        els.lsLr && (els.lsLr.textContent = fmt(current.lr, 3));
        els.lsGrad && (els.lsGrad.textContent = fmt(current.grad_norm_total ?? current.grad_norm, 3));
        els.lsUpdate && (els.lsUpdate.textContent = fmt(current.update_norm_total ?? current.update_norm, 3));
    }

    function plotlyLayout(title, scene = false) {
        const layout = {
            title: { text: title, font: { size: 13, color: "#0f172a" } },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "#f8fbff",
            margin: { l: 40, r: 18, t: 34, b: 38 },
            font: { family: "Segoe UI, Arial", color: "#334155", size: 11 },
            legend: { orientation: "h", y: -0.16 },
            hovermode: "closest"
        };
        if (scene) {
            layout.margin = { l: 0, r: 0, t: 34, b: 0 };
            layout.scene = {
                xaxis: { title: "PC1", backgroundcolor: "#f8fbff", gridcolor: "#dbeafe" },
                yaxis: { title: "PC2", backgroundcolor: "#f8fbff", gridcolor: "#dbeafe" },
                zaxis: { title: "Loss", backgroundcolor: "#f8fbff", gridcolor: "#dbeafe" },
                camera: { eye: { x: 1.45, y: -1.45, z: 0.95 } }
            };
        }
        return layout;
    }

    function plotLandscapeCharts() {
        if (!state.landscape.open || !window.Plotly || !state.landscape.trace) {
            if (state.landscape.open && !window.Plotly && els.landscapeStatus) {
                els.landscapeStatus.className = "cnn-landscape-status is-error";
                els.landscapeStatus.textContent = "Plotly.js 未加载，无法绘制训练轨迹图。";
            }
            return;
        }
        renderLrCompareControls();
        const trace = state.landscape.trace;
        const surface = state.landscape.surface || syntheticSurface(trace);
        const compareEnabled = !!(state.landscape.compareEnabled && state.landscape.lrCompare?.series?.length);
        const selectedSeries = compareEnabled ? selectedLrSeries() : null;
        const displayTrace = selectedSeries?.points || trace;
        const currentIndex = currentIndexForTrace(displayTrace);
        state.landscape.currentIndex = currentIndex;
        const current = displayTrace[currentIndex];
        const next = displayTrace[Math.min(displayTrace.length - 1, currentIndex + 1)];
        updateLandscapeStats(current);

        const plotConfig = { responsive: true, displayModeBar: false };
        const palette = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#8b5cf6", "#0891b2"];

        if (els.lossCurve) {
            let lossTraces;
            if (compareEnabled) {
                lossTraces = state.landscape.lrCompare.series.flatMap((series, index) => {
                    const active = selectedSeries && Math.abs(series.lr - selectedSeries.lr) < 1e-12;
                    const color = palette[index % palette.length];
                    const width = active ? 4 : 2;
                    const opacity = active ? 1 : 0.32;
                    return [{
                        x: series.points.map((d) => d.step),
                        y: series.points.map((d) => d.val_loss ?? d.loss),
                        type: "scatter",
                        mode: "lines",
                        name: `${series.label}${series.status === "diverged" ? " (diverged)" : ""}`,
                        opacity,
                        line: { width, color, dash: series.status === "diverged" ? "dash" : "solid" },
                        text: series.points.map((d) => `lr ${series.lr}<br>step ${d.step}<br>loss ${fmt(d.loss, 3)}`)
                    }];
                });
                lossTraces.push({
                    x: [current.step],
                    y: [current.loss ?? current.val_loss],
                    type: "scatter",
                    mode: "markers",
                    name: "selected current",
                    marker: { size: 10, color: "#0f172a", line: { color: "#ffffff", width: 2 } }
                });
            } else {
                lossTraces = [
                    { x: trace.map((d) => d.step), y: trace.map((d) => d.train_loss), type: "scatter", mode: "lines", name: "train loss", line: { width: 3, color: "#2563eb" } },
                    { x: trace.map((d) => d.step), y: trace.map((d) => d.val_loss), type: "scatter", mode: "lines", name: "val loss", line: { width: 3, color: "#f97316" } },
                    { x: [current.step], y: [current.loss ?? current.val_loss], type: "scatter", mode: "markers", name: "current", marker: { size: 10, color: "#16a34a", line: { color: "#ffffff", width: 2 } } }
                ];
            }
            window.Plotly.react(els.lossCurve, lossTraces, { ...plotlyLayout(compareEnabled ? "不同学习率的 Loss 对比" : "Loss 随训练 step 下降"), xaxis: { title: "step" }, yaxis: { title: "loss" } }, plotConfig);
        }

        if (els.pcaTrajectory) {
            let pcaTraces;
            if (compareEnabled) {
                pcaTraces = state.landscape.lrCompare.series.map((series, index) => {
                    const active = selectedSeries && Math.abs(series.lr - selectedSeries.lr) < 1e-12;
                    const color = palette[index % palette.length];
                    return {
                        x: series.points.map((d) => d.pc1),
                        y: series.points.map((d) => d.pc2),
                        z: series.points.map((d) => d.loss),
                        type: "scatter3d",
                        mode: "lines+markers",
                        name: `${series.label}${series.status === "diverged" ? " (diverged)" : ""}`,
                        marker: { size: active ? 3.8 : 2.4, color, opacity: active ? 0.95 : 0.30 },
                        line: { width: active ? 7 : 3, color },
                        opacity: active ? 1 : 0.34,
                        text: series.points.map((d) => `lr ${series.lr}<br>step ${d.step}<br>loss ${fmt(d.loss, 3)}`)
                    };
                });
                pcaTraces.push({
                    x: [current.pc1],
                    y: [current.pc2],
                    z: [current.loss],
                    type: "scatter3d",
                    mode: "markers",
                    name: "selected current",
                    marker: { size: 6, color: "#0f172a", symbol: "circle" }
                });
            } else {
                pcaTraces = [
                    { x: trace.map((d) => d.pc1), y: trace.map((d) => d.pc2), z: trace.map((d) => d.loss), type: "scatter3d", mode: "lines+markers", name: "PCA trajectory", marker: { size: 3, color: trace.map((d) => d.loss), colorscale: "Viridis", opacity: 0.86 }, line: { width: 5, color: "#2563eb" }, text: trace.map((d) => `step ${d.step}<br>loss ${fmt(d.loss, 3)}`) },
                    { x: [current.pc1], y: [current.pc2], z: [current.loss], type: "scatter3d", mode: "markers", name: "current", marker: { size: 6, color: "#f97316", symbol: "circle" } },
                    { x: [current.pc1, next.pc1], y: [current.pc2, next.pc2], z: [current.loss, next.loss], type: "scatter3d", mode: "lines", name: "update direction", line: { width: 8, color: "#16a34a" } }
                ];
            }
            window.Plotly.react(els.pcaTrajectory, pcaTraces, plotlyLayout(compareEnabled ? "共享 PCA 坐标下的学习率轨迹" : "参数快照 PCA 轨迹", true), plotConfig);
        }

        if (els.fc2Surface) {
            const mainIndex = currentLandscapeIndex();
            const mainCurrent = trace[mainIndex] || current;
            const surfTrace = surface.trajectory_on_surface?.length ? surface.trajectory_on_surface : trace.map((d) => ({ alpha: d.pc1, beta: d.pc2, loss: d.loss, step: d.step }));
            const currentSurf = surfTrace[Math.min(surfTrace.length - 1, mainIndex)] || { alpha: mainCurrent.pc1, beta: mainCurrent.pc2, loss: mainCurrent.loss };
            window.Plotly.react(els.fc2Surface, [
                { x: surface.alpha_values, y: surface.beta_values, z: surface.loss_grid, type: "surface", name: "FC2 surface", opacity: 0.82, showscale: false, colorscale: "YlGnBu" },
                { x: surfTrace.map((d) => d.alpha), y: surfTrace.map((d) => d.beta), z: surfTrace.map((d) => d.loss), type: "scatter3d", mode: "lines+markers", name: "primary trajectory", marker: { size: 3, color: "#f97316" }, line: { width: 6, color: "#f97316" } },
                { x: [currentSurf.alpha], y: [currentSurf.beta], z: [currentSurf.loss], type: "scatter3d", mode: "markers", name: "current", marker: { size: 7, color: "#16a34a" } }
            ], plotlyLayout("FC2 最后一层二维损失切片", true), plotConfig);
        }
    }

    function renderLandscapePanel() {
        if (!state.landscape.open) return;
        if (!state.landscape.loaded) {
            loadLandscapeData().then(() => plotLandscapeCharts());
            return;
        }
        plotLandscapeCharts();
    }

    function openLandscapePanel() {
        if (!els.landscapeModal) return;
        state.landscape.open = true;
        els.landscapeModal.hidden = false;
        loadLandscapeData().then(() => {
            window.requestAnimationFrame(() => plotLandscapeCharts());
        });
    }

    function closeLandscapePanel() {
        state.landscape.open = false;
        if (els.landscapeModal) els.landscapeModal.hidden = true;
    }

    function bindEvents() {
        els.modeButtons.forEach((button) => {
            button.addEventListener("click", () => {
                stopPlayback();
                setMode(button.dataset.mode);
            });
        });
        els.resetView.addEventListener("click", () => {
            state.scene?.resetView();
            els.probe.hidden = true;
            els.stageCard?.classList.remove("stage--probe-open");
            state.scene?.setProbeOpen?.(false);
        });
        els.playPause.addEventListener("click", () => {
            if (state.playing) {
                stopPlayback();
            } else {
                startPlayback();
            }
        });
        els.speed.addEventListener("input", () => {
            state.speed = Number(els.speed.value) || 1;
            if (state.playing) startPlayback();
        });
        els.controlToggle.addEventListener("click", () => {
            const nextHidden = !els.sceneControls.hidden;
            els.sceneControls.hidden = nextHidden;
            els.controlToggle.setAttribute("aria-expanded", String(!nextHidden));
        });
        els.landscapeToggle?.addEventListener("click", openLandscapePanel);
        els.landscapeClose?.addEventListener("click", closeLandscapePanel);
        els.landscapeModal?.addEventListener("click", (event) => {
            if (event.target === els.landscapeModal) closeLandscapePanel();
        });
        els.landscapeRefresh?.addEventListener("click", () => {
            state.landscape.loaded = false;
            loadLandscapeData(true).then(() => plotLandscapeCharts());
        });
        els.lrCompareToggle?.addEventListener("click", () => {
            state.landscape.compareEnabled = !state.landscape.compareEnabled;
            if (!state.landscape.lrCompare && state.landscape.loaded) {
                loadLandscapeData(true).then(() => {
                    renderLrCompareControls();
                    plotLandscapeCharts();
                });
                return;
            }
            renderLrCompareControls();
            plotLandscapeCharts();
        });
        window.addEventListener("resize", () => {
            if (!state.landscape.open || !window.Plotly) return;
            [els.lossCurve, els.pcaTrajectory, els.fc2Surface].forEach((node) => node && window.Plotly.Plots.resize(node));
        });
        els.sceneOptions.forEach((input) => {
            input.addEventListener("change", () => {
                state.scene?.setOptions({ [input.dataset.sceneOption]: input.checked });
            });
        });
        els.layerGroups.forEach((input) => {
            input.addEventListener("change", () => {
                state.scene?.setLayerVisibility(input.dataset.layerGroup, input.checked);
            });
        });
        const closeProbe = (event) => {
            event?.preventDefault();
            event?.stopPropagation();
            els.probe.hidden = true;
            els.stageCard?.classList.remove("stage--probe-open");
            state.scene?.setProbeOpen?.(false);
        };
        els.probeClose.addEventListener("pointerdown", closeProbe);
        els.probeClose.addEventListener("click", closeProbe);
        els.stepToggle.addEventListener("click", () => {
            const collapsed = !els.stepCard.classList.contains("is-collapsed");
            els.stepCard.classList.toggle("is-collapsed", collapsed);
            els.stepToggle.textContent = collapsed ? "展开" : "收起";
            els.stepToggle.setAttribute("aria-expanded", String(!collapsed));
        });

        if (els.digitCanvas) {
            const ctx = els.digitCanvas.getContext("2d", { willReadFrequently: true });
            const startDraw = (event) => {
                event.preventDefault();
                state.drawing = true;
                state.hasInk = true;
                const point = digitPoint(event);
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                if (els.digitStatus) els.digitStatus.textContent = "松开后自动刷新真实 activation";
            };
            const draw = (event) => {
                if (!state.drawing) return;
                event.preventDefault();
                const point = digitPoint(event);
                ctx.lineTo(point.x, point.y);
                ctx.stroke();
            };
            const endDraw = () => {
                if (!state.drawing) return;
                state.drawing = false;
                ctx.closePath();
                scheduleDigitUpdate();
            };
            els.digitCanvas.addEventListener("mousedown", startDraw);
            els.digitCanvas.addEventListener("mousemove", draw);
            window.addEventListener("mouseup", endDraw);
            els.digitCanvas.addEventListener("touchstart", startDraw, { passive: false });
            els.digitCanvas.addEventListener("touchmove", draw, { passive: false });
            window.addEventListener("touchend", endDraw);
        }
        els.digitClear?.addEventListener("click", () => {
            window.clearTimeout(state.digitTimer);
            resetDigitCanvas();
        });
        els.digitSample?.addEventListener("click", () => {
            drawDigitSample();
            updateDigitActivations();
        });
    }

    function init() {
        bindEvents();
        if (window.Cnn3DScene) {
            state.scene = window.Cnn3DScene.createScene(els.sceneMount, {
                onLayerClick: (layerKey) => {
                    showProbe(layerKey);
                    syncStepFromLayer(layerKey);
                }
            });
        }
        resetDigitCanvas();
        drawDigitSample();
        updateDigitActivations();
        renderAll();
    }

    init();
}());
