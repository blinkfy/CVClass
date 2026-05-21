(function () {
    const canvas = document.getElementById("digitCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const els = {
        recognizeBtn: document.getElementById("recognizeBtn"),
        clearBtn: document.getElementById("clearDigitBtn"),
        loadExampleBtn: document.getElementById("loadExampleBtn"),
        autoRecognize: document.getElementById("autoRecognize"),
        predictionDigit: document.getElementById("predictionDigit"),
        confidenceText: document.getElementById("confidenceText"),
        probabilityBars: document.getElementById("probabilityBars"),
        preprocessedImage: document.getElementById("preprocessedImage"),
        message: document.getElementById("digitMessage"),
        inferenceModeBadge: document.getElementById("inferenceModeBadge"),
        inferenceModeInputs: Array.from(document.querySelectorAll('input[name="digitInferenceMode"]'))
    };

    const state = {
        drawing: false,
        hasInk: false,
        timer: null,
        sampleIndex: 0,
        inferenceMode: "server"
    };

    const samples = [
        [[80, 72], [200, 72], [164, 118], [134, 178], [112, 224]],
        [[92, 80], [140, 58], [140, 226], [94, 226], [190, 226]],
        [[78, 84], [118, 60], [176, 70], [202, 112], [174, 150], [96, 218], [206, 218]],
        [[82, 70], [198, 70], [142, 132], [202, 132], [82, 220], [202, 220]]
    ];

    function resetCanvas() {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 22;
        state.hasInk = false;
    }

    function initBars() {
        els.probabilityBars.innerHTML = Array.from({ length: 10 }, (_, digit) => `
            <div class="prob-row">
                <strong>${digit}</strong>
                <div class="prob-track"><div class="prob-fill" data-digit="${digit}"></div></div>
                <span data-prob="${digit}">0.0%</span>
            </div>
        `).join("");
    }

    function canvasPoint(event) {
        const rect = canvas.getBoundingClientRect();
        const pointer = event.touches?.[0] || event;
        return {
            x: (pointer.clientX - rect.left) * (canvas.width / rect.width),
            y: (pointer.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function createPreviewFromCanvas(canvas28) {
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 28;
        previewCanvas.height = 28;
        const previewCtx = previewCanvas.getContext("2d");
        const imageData = previewCtx.createImageData(28, 28);

        for (let i = 0; i < canvas28.length; i += 1) {
            const value = Math.max(0, Math.min(1, canvas28[i])) * 255;
            const offset = i * 4;
            imageData.data[offset] = value;
            imageData.data[offset + 1] = value;
            imageData.data[offset + 2] = value;
            imageData.data[offset + 3] = 255;
        }

        previewCtx.putImageData(imageData, 0, 0);

        const scaledCanvas = document.createElement("canvas");
        scaledCanvas.width = 140;
        scaledCanvas.height = 140;
        const scaledCtx = scaledCanvas.getContext("2d");
        scaledCtx.imageSmoothingEnabled = false;
        scaledCtx.clearRect(0, 0, 140, 140);
        scaledCtx.drawImage(previewCanvas, 0, 0, 140, 140);
        return scaledCanvas.toDataURL("image/png");
    }

    function preprocessCanvas() {
        const source = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const gray = new Float32Array(canvas.width * canvas.height);
        let total = 0;

        for (let i = 0, p = 0; i < source.length; i += 4, p += 1) {
            const brightness = (299 * source[i] + 587 * source[i + 1] + 114 * source[i + 2]) / 1000;
            gray[p] = brightness;
            total += brightness;
        }

        let foreground = gray;
        const mean = total / gray.length;
        if (mean > 127) {
            foreground = new Float32Array(gray.length);
            for (let i = 0; i < gray.length; i += 1) {
                foreground[i] = 255 - gray[i];
            }
        }

        let minValue = Infinity;
        let maxValue = -Infinity;
        for (let i = 0; i < foreground.length; i += 1) {
            const value = foreground[i];
            if (value < minValue) minValue = value;
            if (value > maxValue) maxValue = value;
        }

        const normalized = new Float32Array(foreground.length);
        const range = maxValue - minValue;
        if (range > 0) {
            for (let i = 0; i < foreground.length; i += 1) {
                normalized[i] = (foreground[i] - minValue) / range;
            }
        }

        const mask = [];
        let count = 0;
        for (let i = 0; i < normalized.length; i += 1) {
            const hit = normalized[i] > 0.18;
            mask.push(hit);
            if (hit) count += 1;
        }

        if (count < 10) {
            throw new Error("没有检测到有效数字，请在画布中央写大一点");
        }

        let top = canvas.height;
        let bottom = -1;
        let left = canvas.width;
        let right = -1;
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const index = y * canvas.width + x;
                if (!mask[index]) continue;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
            }
        }

        const cropWidth = right - left + 1;
        const cropHeight = bottom - top + 1;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext("2d");
        const cropImage = cropCtx.createImageData(cropWidth, cropHeight);

        for (let y = 0; y < cropHeight; y += 1) {
            for (let x = 0; x < cropWidth; x += 1) {
                const sourceIndex = (top + y) * canvas.width + (left + x);
                const value = Math.round(normalized[sourceIndex] * 255);
                const offset = (y * cropWidth + x) * 4;
                cropImage.data[offset] = value;
                cropImage.data[offset + 1] = value;
                cropImage.data[offset + 2] = value;
                cropImage.data[offset + 3] = 255;
            }
        }

        cropCtx.putImageData(cropImage, 0, 0);

        const scaledSize = Math.max(1, Math.round(20 / Math.max(cropWidth, cropHeight) * cropWidth));
        const scaledHeight = Math.max(1, Math.round(20 / Math.max(cropWidth, cropHeight) * cropHeight));
        const digitCanvas = document.createElement("canvas");
        digitCanvas.width = scaledSize;
        digitCanvas.height = scaledHeight;
        const digitCtx = digitCanvas.getContext("2d");
        digitCtx.imageSmoothingEnabled = true;
        digitCtx.drawImage(cropCanvas, 0, 0, scaledSize, scaledHeight);

        const resized = digitCtx.getImageData(0, 0, scaledSize, scaledHeight).data;
        const digit = new Float32Array(scaledSize * scaledHeight);
        for (let i = 0, p = 0; i < resized.length; i += 4, p += 1) {
            digit[p] = resized[i] / 255;
        }

        const canvas28 = new Float32Array(28 * 28);
        const x0 = Math.floor((28 - scaledSize) / 2);
        const y0 = Math.floor((28 - scaledHeight) / 2);
        for (let y = 0; y < scaledHeight; y += 1) {
            for (let x = 0; x < scaledSize; x += 1) {
                canvas28[(y0 + y) * 28 + (x0 + x)] = digit[y * scaledSize + x];
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
            const centerX = sumX / mass;
            const centerY = sumY / mass;
            const shiftX = Math.round(13.5 - centerX);
            const shiftY = Math.round(13.5 - centerY);
            const shifted = new Float32Array(28 * 28);

            for (let y = 0; y < 28; y += 1) {
                for (let x = 0; x < 28; x += 1) {
                    const sourceX = x - shiftX;
                    const sourceY = y - shiftY;
                    if (sourceX < 0 || sourceX >= 28 || sourceY < 0 || sourceY >= 28) continue;
                    shifted[y * 28 + x] = canvas28[sourceY * 28 + sourceX];
                }
            }

            return {
                canvas: Array.from({ length: 28 }, (_, row) => Array.from(shifted.slice(row * 28, (row + 1) * 28))),
                preview: createPreviewFromCanvas(shifted)
            };
        }

        return {
            canvas: Array.from({ length: 28 }, (_, row) => Array.from(canvas28.slice(row * 28, (row + 1) * 28))),
            preview: createPreviewFromCanvas(canvas28)
        };
    }

    function startDraw(event) {
        event.preventDefault();
        state.drawing = true;
        state.hasInk = true;
        const point = canvasPoint(event);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
    }

    function draw(event) {
        if (!state.drawing) return;
        event.preventDefault();
        const point = canvasPoint(event);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }

    function endDraw() {
        if (!state.drawing) return;
        state.drawing = false;
        ctx.closePath();
        scheduleRecognize();
    }

    function scheduleRecognize() {
        if (!els.autoRecognize.checked || !state.hasInk) return;
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(recognizeDigit, 450);
    }

    function setMessage(text, isError = false) {
        els.message.textContent = text;
        els.message.style.color = isError ? "#b91c1c" : "#475569";
        els.message.style.background = isError ? "#fee2e2" : "#f1f5f9";
    }

    function updateResult(data) {
        els.predictionDigit.textContent = data.prediction;
        els.confidenceText.textContent = `置信度：${(data.confidence * 100).toFixed(1)}%`;
        els.preprocessedImage.src = data.preprocessed_image;
        data.probabilities.forEach((probability, digit) => {
            const fill = els.probabilityBars.querySelector(`[data-digit="${digit}"]`);
            const label = els.probabilityBars.querySelector(`[data-prob="${digit}"]`);
            if (fill) fill.style.width = `${Math.max(0, Math.min(1, probability)) * 100}%`;
            if (label) label.textContent = `${(probability * 100).toFixed(1)}%`;
        });
    }

    function updateModeBadge() {
        if (!els.inferenceModeBadge) return;
        els.inferenceModeBadge.textContent = state.inferenceMode === "client"
            ? "当前模式：浏览器本地推理"
            : "当前模式：Flask 后端推理";
    }

    async function recognizeWithClient(preprocessed) {
        if (!window.loadClientDigitModel || !window.clientDigitModel) {
            throw new Error("前端模型脚本未加载");
        }

        await window.loadClientDigitModel();
        const result = window.clientDigitModel.predict(preprocessed.canvas);
        return {
            success: true,
            prediction: result.prediction,
            confidence: result.confidence,
            probabilities: result.probabilities,
            elapsed_ms: result.elapsed_ms,
            preprocessed_image: preprocessed.preview,
            message: `前端推理完成：${result.elapsed_ms.toFixed(2)} ms`
        };
    }

    async function recognizeWithServer(preprocessed) {
        const response = await fetch(cvclassUrl("/api/digit-recognize"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                canvas: preprocessed.canvas,
                preprocessed_image: preprocessed.preview
            })
        });
        return response.json();
    }

    async function recognizeDigit() {
        if (!state.hasInk) {
            setMessage("请先在画布中书写数字", true);
            return;
        }

        setMessage("正在识别...");
        try {
            const preprocessed = preprocessCanvas();
            const data = state.inferenceMode === "client"
                ? await recognizeWithClient(preprocessed)
                : await recognizeWithServer(preprocessed);
            if (!data.success) {
                setMessage(data.message || "识别失败", true);
                return;
            }
            els.preprocessedImage.src = preprocessed.preview;
            updateResult(data);
            setMessage(data.message || "识别成功");
        } catch (error) {
            if (state.inferenceMode === "client") {
                const message = error.message && error.message.includes("mnist_cnn_weights.json")
                    ? "前端模型权重加载失败，请检查 static/models/mnist_cnn_weights.json"
                    : error.message || "前端推理失败";
                setMessage(message, true);
                return;
            }
            setMessage(error.message || "请求失败，请检查 Flask 服务是否正常运行", true);
        }
    }

    function clearAll() {
        resetCanvas();
        els.predictionDigit.textContent = "-";
        els.confidenceText.textContent = "置信度：-";
        els.preprocessedImage.removeAttribute("src");
        initBars();
        setMessage("在画布中写一个 0~9 的数字");
    }

    function drawSample() {
        resetCanvas();
        const points = samples[state.sampleIndex % samples.length];
        state.sampleIndex += 1;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => {
            ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.closePath();
        state.hasInk = true;
        scheduleRecognize();
    }

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    window.addEventListener("touchend", endDraw);

    els.recognizeBtn.addEventListener("click", recognizeDigit);
    els.clearBtn.addEventListener("click", clearAll);
    els.loadExampleBtn.addEventListener("click", drawSample);
    els.inferenceModeInputs.forEach((input) => {
        input.addEventListener("change", () => {
            if (!input.checked) return;
            state.inferenceMode = input.value;
            updateModeBadge();
        });
    });

    resetCanvas();
    initBars();
    updateModeBadge();
}());
