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
        message: document.getElementById("digitMessage")
    };

    const state = {
        drawing: false,
        hasInk: false,
        timer: null,
        sampleIndex: 0
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

    async function recognizeDigit() {
        if (!state.hasInk) {
            setMessage("请先在画布中书写数字", true);
            return;
        }

        setMessage("正在识别...");
        try {
            const response = await fetch("/api/digit-recognize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: canvas.toDataURL("image/png") })
            });
            const data = await response.json();
            if (!data.success) {
                setMessage(data.message || "识别失败", true);
                return;
            }
            updateResult(data);
            setMessage(data.message || "识别成功");
        } catch (error) {
            setMessage("请求失败，请检查 Flask 服务是否正常运行", true);
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

    resetCanvas();
    initBars();
}());
