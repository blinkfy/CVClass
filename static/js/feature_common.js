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

    function bindAutoSubmit(form, options = {}) {
        if (!form) return () => {};
        const delay = Number(options.delay) || 420;
        const excludedIds = new Set(options.excludeIds || []);
        let timer = null;

        const schedule = (wait = delay) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => form.requestSubmit(), wait);
        };

        form.querySelectorAll("input, select").forEach(control => {
            if (control.type === "hidden" || control.type === "submit" || control.disabled || excludedIds.has(control.id)) return;
            if (control.type === "file") {
                control.addEventListener("change", () => schedule(60));
                return;
            }
            control.addEventListener(control.tagName === "SELECT" || control.type === "checkbox" ? "change" : "input", () => schedule());
        });

        form.querySelector("[data-samples]")?.addEventListener("click", event => {
            if (!event.target.closest("[data-example]")) return;
            form.querySelectorAll('input[type="file"]').forEach(input => {
                input.value = "";
            });
            schedule(60);
        });

        return schedule;
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

    function drawDiamond(ctx, x, y, color = "#eab308", size = 5) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.stroke();
    }

    async function imageToGray(src) {
        const image = await loadImage(src);
        const canvas = document.createElement("canvas");
        setCanvasSize(canvas, image.naturalWidth || image.width, image.naturalHeight || image.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const gray = new Float32Array(canvas.width * canvas.height);
        for (let i = 0; i < gray.length; i++) {
            const offset = i * 4;
            gray[i] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
        }
        return { gray, width: canvas.width, height: canvas.height };
    }

    const fastCircle = [
        [0, -3], [1, -3], [2, -2], [3, -1],
        [3, 0], [3, 1], [2, 2], [1, 3],
        [0, 3], [-1, 3], [-2, 2], [-3, 1],
        [-3, 0], [-3, -1], [-2, -2], [-1, -3]
    ];

    function fastScore(gray, width, x, y, threshold, contiguous) {
        const center = gray[y * width + x];
        const differences = fastCircle.map(([dx, dy]) => gray[(y + dy) * width + x + dx] - center);
        let bestScore = 0;
        let bestStart = -1;
        let bestPolarity = "";
        for (const polarity of [1, -1]) {
            for (let start = 0; start < 16; start++) {
                let minimum = Infinity;
                let valid = true;
                for (let step = 0; step < contiguous; step++) {
                    const difference = differences[(start + step) % 16] * polarity;
                    if (difference <= threshold) {
                        valid = false;
                        break;
                    }
                    minimum = Math.min(minimum, difference);
                }
                if (valid && minimum > bestScore) {
                    bestScore = minimum;
                    bestStart = start;
                    bestPolarity = polarity > 0 ? "bright" : "dark";
                }
            }
        }
        return { score: bestScore, start: bestStart, polarity: bestPolarity, differences };
    }

    function detectFast(gray, width, height, options = {}) {
        const threshold = Math.max(1, Number(options.threshold) || 30);
        const contiguous = Number(options.contiguous) === 12 ? 12 : 9;
        const radius = Math.max(1, Number(options.nmsRadius) || 4);
        const maxCorners = Math.max(1, Number(options.maxCorners) || 500);
        const candidates = [];
        for (let y = 3; y < height - 3; y++) {
            for (let x = 3; x < width - 3; x++) {
                const result = fastScore(gray, width, x, y, threshold, contiguous);
                if (result.score > 0) candidates.push({ x, y, response: result.score, ...result });
            }
        }
        candidates.sort((a, b) => b.response - a.response);
        const occupied = new Uint8Array(width * height);
        const corners = [];
        for (const point of candidates) {
            let blocked = false;
            for (let yy = Math.max(0, point.y - radius); yy <= Math.min(height - 1, point.y + radius) && !blocked; yy++) {
                for (let xx = Math.max(0, point.x - radius); xx <= Math.min(width - 1, point.x + radius); xx++) {
                    if (occupied[yy * width + xx]) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (blocked) continue;
            occupied[point.y * width + point.x] = 1;
            corners.push(point);
            if (corners.length >= maxCorners) break;
        }
        return { candidates, corners, threshold, contiguous };
    }

    function refineSubpixel(surface, corners) {
        if (!surface?.values || !surface.width || !surface.height) return [];
        const width = surface.width;
        const height = surface.height;
        const values = surface.values;
        const at = (x, y) => Number(values[y * width + x]) || 0;
        const refined = [];
        (corners || []).forEach(point => {
            const x = Math.round(point.x);
            const y = Math.round(point.y);
            if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return;
            const center = at(x, y);
            const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
            const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
            const hxx = at(x + 1, y) - 2 * center + at(x - 1, y);
            const hyy = at(x, y + 1) - 2 * center + at(x, y - 1);
            const hxy = (at(x + 1, y + 1) - at(x + 1, y - 1) - at(x - 1, y + 1) + at(x - 1, y - 1)) / 4;
            const determinant = hxx * hyy - hxy * hxy;
            if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return;
            const dx = -(hyy * gx - hxy * gy) / determinant;
            const dy = -(-hxy * gx + hxx * gy) / determinant;
            if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) return;
            refined.push({ ...point, x_sub: x + dx, y_sub: y + dy, offset_x: dx, offset_y: dy });
        });
        return refined;
    }

    async function drawFastKeypoints(canvas, src, points = [], options = {}) {
        const result = await drawBaseImage(canvas, src);
        if (!result) return;
        points.slice(0, options.max || 800).forEach(point => {
            drawDiamond(result.ctx, point.x, point.y, options.color || "#eab308", options.size || 5);
        });
    }

    async function drawSubpixelKeypoints(canvas, src, corners = [], refined = [], showSubpixel = true) {
        const result = await drawBaseImage(canvas, src);
        if (!result) return;
        corners.forEach(point => drawCircle(result.ctx, point.x, point.y, "#f97316", 4.5));
        if (!showSubpixel) return;
        refined.forEach(point => {
            result.ctx.strokeStyle = "#06b6d4";
            result.ctx.lineWidth = 1.5;
            result.ctx.beginPath();
            result.ctx.moveTo(point.x, point.y);
            result.ctx.lineTo(point.x_sub, point.y_sub);
            result.ctx.stroke();
            const angle = Math.atan2(point.offset_y, point.offset_x);
            const arrowSize = 3;
            result.ctx.beginPath();
            result.ctx.moveTo(point.x_sub, point.y_sub);
            result.ctx.lineTo(
                point.x_sub - Math.cos(angle - Math.PI / 6) * arrowSize,
                point.y_sub - Math.sin(angle - Math.PI / 6) * arrowSize
            );
            result.ctx.moveTo(point.x_sub, point.y_sub);
            result.ctx.lineTo(
                point.x_sub - Math.cos(angle + Math.PI / 6) * arrowSize,
                point.y_sub - Math.sin(angle + Math.PI / 6) * arrowSize
            );
            result.ctx.stroke();
            drawCross(result.ctx, point.x_sub, point.y_sub, "#06b6d4", 4.5);
        });
    }

    function drawSiftSymbol(ctx, kp) {
        const x = kp.x, y = kp.y;
        const r = Math.max(4, Math.min(24, (kp.sigma || 2) * 2.2));
        ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#7c3aed"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(kp.orientation || 0) * r, y + Math.sin(kp.orientation || 0) * r); ctx.stroke();
    }

    function clamp(value, lo, hi) {
        return Math.max(lo, Math.min(hi, value));
    }

    function grayAt(gray, width, height, x, y) {
        const xx = clamp(Math.round(x), 0, width - 1);
        const yy = clamp(Math.round(y), 0, height - 1);
        return gray[yy * width + xx] || 0;
    }

    function seededRandom(seed) {
        let state = seed >>> 0;
        return () => {
            state = (1664525 * state + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    function briefPairs(count = 256, radius = 15) {
        const random = seededRandom(20240517);
        const pairs = [];
        for (let i = 0; i < count; i++) {
            const sample = () => {
                const r = radius * Math.sqrt(random());
                const theta = random() * Math.PI * 2;
                return [Math.cos(theta) * r, Math.sin(theta) * r];
            };
            pairs.push([sample(), sample()]);
        }
        return pairs;
    }

    const brief256Pairs = briefPairs(256, 15);
    const hammingByteTable = Array.from({ length: 256 }, (_, value) => {
        let bits = value;
        let count = 0;
        while (bits) {
            bits &= bits - 1;
            count++;
        }
        return count;
    });

    function pointOrientation(gray, width, height, point, radius = 15) {
        let m10 = 0;
        let m01 = 0;
        const cx = Math.round(point.x);
        const cy = Math.round(point.y);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy > radius * radius) continue;
                const value = grayAt(gray, width, height, cx + dx, cy + dy);
                m10 += dx * value;
                m01 += dy * value;
            }
        }
        return Math.atan2(m01, m10);
    }

    function makeBriefDescriptor(gray, width, height, point, options = {}) {
        const pairs = options.pairs || brief256Pairs;
        const angle = Number(options.angle) || 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const bytes = new Uint8Array(Math.ceil(pairs.length / 8));
        for (let i = 0; i < pairs.length; i++) {
            const [a, b] = pairs[i];
            const ax = point.x + a[0] * cos - a[1] * sin;
            const ay = point.y + a[0] * sin + a[1] * cos;
            const bx = point.x + b[0] * cos - b[1] * sin;
            const by = point.y + b[0] * sin + b[1] * cos;
            if (grayAt(gray, width, height, ax, ay) < grayAt(gray, width, height, bx, by)) {
                bytes[i >> 3] |= 1 << (i & 7);
            }
        }
        return bytes;
    }

    function hammingDistance(a, b) {
        const n = Math.min(a?.length || 0, b?.length || 0);
        let distance = 0;
        for (let i = 0; i < n; i++) distance += hammingByteTable[(a[i] ^ b[i]) & 255];
        return distance + Math.abs((a?.length || 0) - (b?.length || 0)) * 8;
    }

    function l2Distance(a, b) {
        const n = Math.min(a?.length || 0, b?.length || 0);
        let sum = 0;
        for (let i = 0; i < n; i++) {
            const diff = (Number(a[i]) || 0) - (Number(b[i]) || 0);
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    function integralImage(gray, width, height) {
        const stride = width + 1;
        const integral = new Float64Array((width + 1) * (height + 1));
        for (let y = 1; y <= height; y++) {
            let row = 0;
            for (let x = 1; x <= width; x++) {
                row += gray[(y - 1) * width + (x - 1)] || 0;
                integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
            }
        }
        return { data: integral, width, height, stride };
    }

    function rectSum(ii, x0, y0, x1, y1) {
        const left = clamp(Math.floor(Math.min(x0, x1)), 0, ii.width);
        const right = clamp(Math.ceil(Math.max(x0, x1)), 0, ii.width);
        const top = clamp(Math.floor(Math.min(y0, y1)), 0, ii.height);
        const bottom = clamp(Math.ceil(Math.max(y0, y1)), 0, ii.height);
        return ii.data[bottom * ii.stride + right] - ii.data[top * ii.stride + right] -
            ii.data[bottom * ii.stride + left] + ii.data[top * ii.stride + left];
    }

    function haarX(ii, x, y, size) {
        const half = size / 2;
        return rectSum(ii, x, y - half, x + half, y + half) - rectSum(ii, x - half, y - half, x, y + half);
    }

    function haarY(ii, x, y, size) {
        const half = size / 2;
        return rectSum(ii, x - half, y, x + half, y + half) - rectSum(ii, x - half, y - half, x + half, y);
    }

    function surfResponse(ii, x, y, size = 9) {
        const s = size;
        const lobe = s / 3;
        const dxx = rectSum(ii, x - s, y - lobe, x - lobe, y + lobe) +
            rectSum(ii, x + lobe, y - lobe, x + s, y + lobe) -
            2 * rectSum(ii, x - lobe, y - lobe, x + lobe, y + lobe);
        const dyy = rectSum(ii, x - lobe, y - s, x + lobe, y - lobe) +
            rectSum(ii, x - lobe, y + lobe, x + lobe, y + s) -
            2 * rectSum(ii, x - lobe, y - lobe, x + lobe, y + lobe);
        const dxy = rectSum(ii, x, y, x + lobe, y + lobe) + rectSum(ii, x - lobe, y - lobe, x, y) -
            rectSum(ii, x - lobe, y, x, y + lobe) - rectSum(ii, x, y - lobe, x + lobe, y);
        return Math.abs(dxx * dyy - 0.81 * dxy * dxy);
    }

    function detectSurfLite(gray, width, height, options = {}) {
        const maxKeypoints = Math.max(20, Number(options.maxKeypoints) || 500);
        const threshold = Math.max(1, Number(options.threshold) || 1600000);
        const ii = integralImage(gray, width, height);
        const candidates = [];
        const border = 18;
        for (let y = border; y < height - border; y += 3) {
            for (let x = border; x < width - border; x += 3) {
                const response = surfResponse(ii, x, y, 9);
                if (response > threshold) candidates.push({ x, y, response, sigma: 2.4, orientation: 0 });
            }
        }
        candidates.sort((a, b) => b.response - a.response);
        const radius = 8;
        const kept = [];
        for (const point of candidates) {
            if (kept.some(item => Math.hypot(item.x - point.x, item.y - point.y) < radius)) continue;
            const dx = haarX(ii, point.x, point.y, 12);
            const dy = haarY(ii, point.x, point.y, 12);
            kept.push({ ...point, orientation: Math.atan2(dy, dx) });
            if (kept.length >= maxKeypoints) break;
        }
        return { keypoints: kept, candidates, integral: ii };
    }

    function makeSurfDescriptor(gray, width, height, point, ii) {
        const descriptor = [];
        const angle = Number(point.orientation) || 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const step = 5;
        for (let cy = -2; cy < 2; cy++) {
            for (let cx = -2; cx < 2; cx++) {
                let sx = 0, sy = 0, sax = 0, say = 0;
                for (let yy = 0; yy < 5; yy++) {
                    for (let xx = 0; xx < 5; xx++) {
                        const lx = (cx * 5 + xx + 0.5) * step;
                        const ly = (cy * 5 + yy + 0.5) * step;
                        const rx = point.x + lx * cos - ly * sin;
                        const ry = point.y + lx * sin + ly * cos;
                        const dx = haarX(ii, rx, ry, 4);
                        const dy = haarY(ii, rx, ry, 4);
                        sx += dx; sy += dy; sax += Math.abs(dx); say += Math.abs(dy);
                    }
                }
                descriptor.push(sx, sy, sax, say);
            }
        }
        const norm = Math.sqrt(descriptor.reduce((sum, value) => sum + value * value, 0)) || 1;
        return descriptor.map(value => value / norm);
    }

    function computeDescriptorSet(grayObj, algorithm, options = {}) {
        const start = performance.now();
        const gray = grayObj.gray;
        const width = grayObj.width;
        const height = grayObj.height;
        if (algorithm === "surf") {
            const surf = detectSurfLite(gray, width, height, options);
            const descriptors = surf.keypoints.map(point => makeSurfDescriptor(gray, width, height, point, surf.integral));
            return {
                algorithm,
                keypoints: surf.keypoints,
                descriptors,
                descriptorType: "float",
                descriptorDim: "64 float",
                distanceType: "L2",
                elapsedMs: performance.now() - start
            };
        }
        const fast = detectFast(gray, width, height, {
            threshold: options.threshold || 30,
            contiguous: options.contiguous || 9,
            nmsRadius: options.nmsRadius || 8,
            maxCorners: options.maxKeypoints || 500
        });
        const rotate = algorithm === "orb-lite";
        const keypoints = fast.corners.map(point => {
            const orientation = rotate ? pointOrientation(gray, width, height, point, 15) : 0;
            return { ...point, orientation, sigma: 2.2 };
        });
        const descriptors = keypoints.map(point => makeBriefDescriptor(gray, width, height, point, { angle: point.orientation }));
        return {
            algorithm,
            keypoints,
            descriptors,
            descriptorType: "binary",
            descriptorDim: "256 bit",
            distanceType: "Hamming",
            elapsedMs: performance.now() - start,
            candidates: fast.candidates,
            contiguous: fast.contiguous
        };
    }

    function matchDescriptorSets(left, right, options = {}) {
        const ratio = Math.max(0.4, Math.min(0.98, Number(options.ratio) || 0.75));
        const maxMatches = Math.max(1, Number(options.maxMatches) || 80);
        const distance = left.distanceType === "Hamming" ? hammingDistance : l2Distance;
        const matches = [];
        if (!left.descriptors?.length || (right.descriptors?.length || 0) < 2) {
            return { matches, rawMatches: 0, passedMatches: 0 };
        }
        left.descriptors.forEach((descriptor, leftIndex) => {
            let best = { index: -1, distance: Infinity };
            let second = { index: -1, distance: Infinity };
            right.descriptors.forEach((candidate, rightIndex) => {
                const d = distance(descriptor, candidate);
                if (d < best.distance) {
                    second = best;
                    best = { index: rightIndex, distance: d };
                } else if (d < second.distance) {
                    second = { index: rightIndex, distance: d };
                }
            });
            const ratioValue = best.distance / (second.distance + 1e-9);
            matches.push({
                rank: 0,
                left_index: leftIndex,
                right_index: best.index,
                distance: Math.round(best.distance * 1000) / 1000,
                second_distance: Math.round(second.distance * 1000) / 1000,
                ratio: Math.round(ratioValue * 10000) / 10000,
                passed: ratioValue < ratio
            });
        });
        matches.sort((a, b) => Number(a.passed === false) - Number(b.passed === false) || a.ratio - b.ratio || a.distance - b.distance);
        matches.forEach((item, index) => { item.rank = index + 1; });
        return {
            matches: matches.slice(0, maxMatches),
            rawMatches: matches.length,
            passedMatches: matches.filter(item => item.passed).length
        };
    }

    function featureAlgorithmInfo(algorithm) {
        const info = {
            sift: { name: "SIFT", descriptorType: "float", descriptorDim: "128 float", distanceType: "L2" },
            surf: { name: "SURF", descriptorType: "float", descriptorDim: "64 float", distanceType: "L2" },
            "fast-brief": { name: "FAST + BRIEF", descriptorType: "binary", descriptorDim: "256 bit", distanceType: "Hamming" },
            "orb-lite": { name: "ORB-lite", descriptorType: "binary", descriptorDim: "256 bit", distanceType: "Hamming" }
        };
        return info[algorithm] || info.sift;
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

    window.FeatureViz = { $, root, basePath, assetsBase, setupSamples, bindFileNames, bindAutoSubmit, postForm, loadImage, drawBaseImage, drawArray, drawKeypoints, drawSiftKeypoints, drawCombined, drawCross, drawCircle, drawDiamond, drawSiftSymbol, renderMatrix, renderStatList, drawBarChart, setCanvasSize, imageToGray, detectFast, fastCircle, refineSubpixel, drawFastKeypoints, drawSubpixelKeypoints, computeDescriptorSet, matchDescriptorSets, featureAlgorithmInfo, integralImage };
})();
