(function () {
    "use strict";

    const root = document.getElementById("featurePage");
    if (!root) return;

    const basePath = window.CVCLASS_BASE_PATH || "";
    const assetsBase = root.dataset.assetsBase || `${basePath}/static/assets/img/`;
    const samples = [
        { key: "building", file: "house.png", label: "建筑" },
        { key: "checker", file: "cameraman.png", label: "人物" },
        { key: "book", file: "brick.png", label: "砖块" },
        { key: "texture", file: "checkerboard.png", label: "棋盘" },
        { key: "peppers", file: "peppers_color.png", label: "彩色" }
    ];

    function $(id) { return document.getElementById(id); }

    function setupSamples(form) {
        if (!form) return;
        const box = form.querySelector("[data-samples]");
        const input = form.querySelector("[data-example-input]");
        if (!box || !input) return;
        box.innerHTML = samples.map((item, idx) => `
            <button class="feature-sample-btn ${idx === 0 ? "is-active" : ""}" type="button" data-example="${item.key}" title="${item.label}">
                <img src="${assetsBase}${item.file}" alt="${item.label}">
            </button>
        `).join("");
        box.addEventListener("click", (event) => {
            const btn = event.target.closest(".feature-sample-btn");
            if (!btn) return;
            box.querySelectorAll(".feature-sample-btn").forEach(item => item.classList.remove("is-active"));
            btn.classList.add("is-active");
            input.value = btn.dataset.example || "building";
        });
    }

    function bindFileNames(form) {
        if (!form) return;
        form.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener("change", () => {
                const label = input.closest(".feature-upload")?.querySelector("small");
                if (label) label.textContent = input.files && input.files[0] ? input.files[0].name : "当前使用示例图";
            });
        });
    }

    async function postForm(form, endpoint) {
        const fd = new FormData(form);
        const res = await fetch(`${basePath}${endpoint}`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "请求处理失败");
        return data;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function setCanvasSize(canvas, width, height) {
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
    }

    async function drawBaseImage(canvas, src, background = "#0f172a") {
        if (!canvas || !src) return null;
        const img = await loadImage(src);
        setCanvasSize(canvas, img.naturalWidth || img.width, img.naturalHeight || img.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return { ctx, img };
    }

    function colorGray(v) {
        return [v, v, v];
    }

    function colorHeat(v) {
        const t = v / 255;
        const r = Math.max(0, Math.min(255, 255 * (1.65 * t - 0.2)));
        const g = Math.max(0, Math.min(255, 255 * (1.85 * t - 0.95)));
        const b = Math.max(0, Math.min(255, 255 * (0.55 + 0.75 * (1 - t))));
        return [r, g, b];
    }

    function drawArray(canvas, packed, palette = "gray") {
        if (!canvas || !packed || !packed.values) return;
        const w = packed.width;
        const h = packed.height;
        setCanvasSize(canvas, w, h);
        const ctx = canvas.getContext("2d");
        const imageData = ctx.createImageData(w, h);
        const colorFn = palette === "heat" ? colorHeat : colorGray;
        for (let i = 0; i < packed.values.length; i++) {
            const [r, g, b] = colorFn(Number(packed.values[i]) || 0);
            const j = i * 4;
            imageData.data[j] = r;
            imageData.data[j + 1] = g;
            imageData.data[j + 2] = b;
            imageData.data[j + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    async function drawKeypoints(canvas, src, points = [], opts = {}) {
        const result = await drawBaseImage(canvas, src);
        if (!result) return;
        const ctx = result.ctx;
        const sx = canvas.width / (result.img.naturalWidth || result.img.width);
        const sy = canvas.height / (result.img.naturalHeight || result.img.height);
        ctx.lineWidth = opts.lineWidth || 2;
        ctx.strokeStyle = opts.color || "#06b6d4";
        points.slice(0, opts.max || 800).forEach(p => {
            const x = p.x * sx;
            const y = p.y * sy;
            if (opts.type === "circle") {
                ctx.beginPath();
                ctx.arc(x, y, opts.radius || 4, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                const s = opts.size || 5;
                ctx.beginPath();
                ctx.moveTo(x - s, y);
                ctx.lineTo(x + s, y);
                ctx.moveTo(x, y - s);
                ctx.lineTo(x, y + s);
                ctx.stroke();
            }
        });
    }

    async function drawSiftKeypoints(canvas, src, keypoints = [], opts = {}) {
        const result = await drawBaseImage(canvas, src);
        if (!result) return;
        const ctx = result.ctx;
        const sx = canvas.width / (result.img.naturalWidth || result.img.width);
        const sy = canvas.height / (result.img.naturalHeight || result.img.height);
        keypoints.slice(0, opts.max || 350).forEach(kp => {
            const x = kp.x * sx;
            const y = kp.y * sy;
            const r = Math.max(4, Math.min(26, (kp.sigma || 2) * 2.2));
            const angle = Number(kp.orientation || 0);
            ctx.strokeStyle = opts.color || "#f97316";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = opts.arrowColor || "#7c3aed";
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
            ctx.stroke();
            ctx.fillStyle = opts.color || "#f97316";
            ctx.beginPath();
            ctx.arc(x, y, 2.2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    async function drawCombined(canvas, src, harris = [], shi = [], sift = []) {
        await drawBaseImage(canvas, src);
        const ctx = canvas.getContext("2d");
        harris.slice(0, 650).forEach(p => drawCross(ctx, p.x, p.y, "#06b6d4", 5));
        shi.slice(0, 450).forEach(p => drawCircle(ctx, p.x, p.y, "#16a34a", 4));
        sift.slice(0, 250).forEach(kp => drawSiftSymbol(ctx, kp));
    }

    function drawCross(ctx, x, y, color, size) {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
    }

    function drawCircle(ctx, x, y, color, radius) {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    }

    function drawSiftSymbol(ctx, kp) {
        const x = kp.x, y = kp.y;
        const r = Math.max(4, Math.min(24, (kp.sigma || 2) * 2.2));
        ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#7c3aed"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(kp.orientation || 0) * r, y + Math.sin(kp.orientation || 0) * r); ctx.stroke();
    }

    function renderMatrix(container, title, matrix) {
        if (!container) return;
        const rows = (matrix || []).map(row => `<tr>${row.map(v => `<td>${v}</td>`).join("")}</tr>`).join("");
        container.insertAdjacentHTML("beforeend", `<div class="feature-matrix-card"><strong>${title}</strong><table class="feature-matrix"><tbody>${rows}</tbody></table></div>`);
    }

    function renderStatList(el, items) {
        if (!el) return;
        el.innerHTML = items.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
    }

    function drawBarChart(canvas, values, opts = {}) {
        if (!canvas || !values) return;
        const w = opts.width || 820;
        const h = opts.height || 170;
        setCanvasSize(canvas, w, h);
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#dbeafe";
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
        const max = Math.max(1e-9, ...values.map(v => Math.abs(Number(v) || 0)));
        const pad = 28;
        const n = values.length;
        const bw = Math.max(1, (w - pad * 2) / n - 1);
        ctx.fillStyle = opts.color || "#2563eb";
        values.forEach((val, i) => {
            const t = (Number(val) || 0) / max;
            const x = pad + i * ((w - pad * 2) / n);
            const bh = Math.abs(t) * (h - pad * 2) * 0.92;
            const y0 = h / 2;
            ctx.fillRect(x, t >= 0 ? y0 - bh : y0, bw, bh);
        });
        if (Number.isInteger(opts.highlight)) {
            const x = pad + opts.highlight * ((w - pad * 2) / n);
            ctx.fillStyle = "#f97316";
            ctx.fillRect(x, 12, Math.max(3, bw), h - 24);
        }
    }

    window.FeatureViz = { $, root, basePath, assetsBase, setupSamples, bindFileNames, postForm, loadImage, drawBaseImage, drawArray, drawKeypoints, drawSiftKeypoints, drawCombined, drawCross, drawCircle, drawSiftSymbol, renderMatrix, renderStatList, drawBarChart, setCanvasSize };
})();
