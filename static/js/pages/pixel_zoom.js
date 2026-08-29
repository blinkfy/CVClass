/* pixel_zoom.js — 像素放大镜：无插值缩放 + 网格 + RGB/CMYK 探针 */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const els = {
        drop: $("dropZone"), input: $("imageInput"), strip: $("sampleStrip"),
        zoomIn: $("zoomInButton"), zoomOut: $("zoomOutButton"), slider: $("zoomSlider"), zoomVal: $("zoomValue"),
        fit: $("fitButton"), reset: $("resetButton"),
        grid: $("gridToggle"), hl: $("highlightToggle"), label: $("labelToggle"), mode: $("colorMode"),
        msg: $("messageBar"),
        res: $("statusResolution"), px: $("statusPixels"), zoom: $("statusZoom"), fmt: $("statusFormat"), size: $("statusSize"),
        stage: $("pzStage"), cvs: $("pzCanvas"), empty: $("pzEmpty"),
        coord: $("probeCoord"), swatch: $("probeSwatch"), hex: $("probeHex"), gray: $("probeGray"),
        infoName: $("infoName"), infoRes: $("infoResolution"), infoPx: $("infoPixels"), infoFmt: $("infoFormat"), infoSize: $("infoSize"),
        msgTimer: null,
    };
    const probes = {};
    ["R", "G", "B", "C", "M", "Y", "K"].forEach((k) => {
        probes[k] = { v: $("probe" + k), bar: $("probe" + k + "Bar") };
    });
    const isRgb = { R: true, G: true, B: true };

    const samples = [
        { id: "lena", name: "Lena 512", src: cvclassUrl("/static/assets/img/lena_color_512.png") },
        { id: "peppers", name: "Peppers", src: cvclassUrl("/static/assets/img/peppers_color.png") },
        { id: "mandril", name: "Mandril", src: cvclassUrl("/static/assets/img/mandril_color.png") },
        { id: "bangkok", name: "Bangkok", src: cvclassUrl("/static/assets/img/bangkok_traffic.jpg") },
    ];

    const st = {
        img: null, w: 0, h: 0, pix: null,
        sc: 1, ox: 0, oy: 0, fitted: true,
        mx: -1, my: -1,
        grid: true, hl: true, label: true, mode: "rgb",
    };
    const MIN_S = 0.25, MAX_S = 64, GRID_S = 8, HL_S = 2, LABEL_S = 24;
    const ctx = els.cvs.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let raf = 0;

    function fmtSize(n) {
        if (n < 1024) return n + " B";
        if (n < 1048576) return (n / 1024).toFixed(2) + " KB";
        return (n / 1048576).toFixed(2) + " MB";
    }

    // rgb → hsv: h∈[0,360) s,v∈[0,100]
    function rgb2hsv(r, g, b) {
        const rn = r / 255, gn = g / 255, bn = b / 255;
        const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), d = mx - mn;
        let h = 0;
        if (d !== 0) {
            if (mx === rn) h = 60 * (((gn - bn) / d) % 6);
            else if (mx === gn) h = 60 * ((bn - rn) / d + 2);
            else h = 60 * ((rn - gn) / d + 4);
        }
        if (h < 0) h += 360;
        return [Math.round(h), Math.round(mx === 0 ? 0 : d / mx * 100), Math.round(mx * 100)];
    }

    // 按当前颜色模式生成像素叠加文字（多行堆叠，字号可随缩放变大）
    function pixLabelLines(px, py) {
        const i = (py * st.w + px) * 4;
        const r = st.pix[i], g = st.pix[i + 1], b = st.pix[i + 2];
        switch (st.mode) {
            case "rgb":
                return { ls: [r, g, b].map(String), dk: r + g + b < 384 };
            case "cmyk": {
                const rn = r / 255, gn = g / 255, bn = b / 255;
                let k = 1 - Math.max(rn, gn, bn), c, m, y;
                if (k >= 1) { c = m = y = 0; }
                else {
                    c = (1 - rn - k) / (1 - k);
                    m = (1 - gn - k) / (1 - k);
                    y = (1 - bn - k) / (1 - k);
                }
                const v = [c, m, y, k].map((t) => Math.round(t * 100));
                return { ls: [v[0] + "," + v[1], v[2] + "," + v[3]], dk: k < 0.5 };
            }
            case "hex":
                return { ls: ["#" + [r, g, b].map((t) => t.toString(16).padStart(2, "0")).join("").toUpperCase()], dk: r + g + b < 384 };
            case "gray": {
                const gr = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                return { ls: [String(gr)], dk: gr < 128 };
            }
            case "hsv": {
                const h = rgb2hsv(r, g, b);
                return { ls: [h[0] + "°", String(h[1]), String(h[2])], dk: h[2] < 55 };
            }
        }
        return { ls: [], dk: true };
    }

    // 在像素方块内叠加数值：字号取方块尺寸的固定比例 → 跟随缩放线性增长
    function drawLabels(gx0, gx1, gy0, gy1) {
        const cfg = { rgb: [3, 3], cmyk: [2, 7], hex: [1, 7], gray: [1, 3], hsv: [3, 4] }[st.mode] || [1, 3];
        const rows = cfg[0], maxLen = cfg[1];
        const fs = Math.max(7, Math.min(st.sc * 0.78 / rows, st.sc * 0.92 / (maxLen * 0.62)));
        const lh = fs * 1.12;
        ctx.font = "700 " + fs + "px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(1.5, fs * 0.16);
        const cw = els.cvs.clientWidth;
        const gx1c = Math.min(gx1, st.w), gy1c = Math.min(gy1, st.h);
        for (let y = gy0; y < gy1c; y++) {
            for (let x = gx0; x < gx1c; x++) {
                const { ls, dk } = pixLabelLines(x, y);
                if (!ls.length) continue;
                const cx = st.ox + (x + 0.5) * st.sc;
                if (cx < -st.sc || cx > cw + st.sc) continue;
                const cy = st.oy + (y + 0.5) * st.sc;
                const y0 = cy - (ls.length - 1) * lh / 2;
                ctx.strokeStyle = dk ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.9)";
                ctx.fillStyle = dk ? "#ffffff" : "#0f172a";
                for (let j = 0; j < ls.length; j++) {
                    ctx.strokeText(ls[j], cx, y0 + j * lh);
                    ctx.fillText(ls[j], cx, y0 + j * lh);
                }
            }
        }
    }

    function setMessage(text, type) {
        if (!els.msg) return;
        clearTimeout(els.msgTimer);
        els.msg.textContent = text;
        els.msg.classList.toggle("is-error", type === "error");
        els.msg.hidden = false;
        els.msgTimer = setTimeout(() => { els.msg.hidden = true; }, 3200);
    }

    function requestRender() {
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
    }

    function syncZoomUi() {
        const t = st.sc.toFixed(2) + "x";
        els.zoomVal.textContent = t;
        els.zoom.textContent = t;
        if (+els.slider.value !== st.sc) els.slider.value = st.sc;
    }

    function loadImg(img, meta) {
        const off = document.createElement("canvas");
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const octx = off.getContext("2d");
        octx.drawImage(img, 0, 0);
        st.img = img;
        st.w = img.naturalWidth;
        st.h = img.naturalHeight;
        st.pix = octx.getImageData(0, 0, st.w, st.h).data;
        const res = st.w + " × " + st.h;
        const pxc = (st.w * st.h).toLocaleString();
        const size = fmtSize(meta.size);
        els.infoName.textContent = meta.name;
        els.infoRes.textContent = res;
        els.infoPx.textContent = pxc;
        els.infoFmt.textContent = meta.fmt;
        els.infoSize.textContent = size;
        els.res.textContent = res;
        els.px.textContent = pxc;
        els.fmt.textContent = meta.fmt;
        els.size.textContent = size;
        els.stage.classList.remove("is-empty");
        fit();
    }

    function loadFile(file) {
        if (!file) return;
        if (!/^image\/(png|jpe?g|bmp)$/.test(file.type)) {
            setMessage("仅支持 JPG / PNG / BMP 图片", "error");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setMessage("图片过大，不能超过 10MB", "error");
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            loadImg(img, {
                name: file.name,
                fmt: (file.type.split("/")[1] || "-").toUpperCase(),
                size: file.size,
            });
            URL.revokeObjectURL(url);
            setMessage("已加载：" + file.name, "success");
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            setMessage("图片解码失败", "error");
        };
        img.src = url;
    }

    async function loadSample(sp) {
        try {
            setMessage("正在加载示例图：" + sp.name, "success");
            const resp = await fetch(sp.src);
            if (!resp.ok) throw new Error("http " + resp.status);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                loadImg(img, {
                    name: sp.id + "." + (sp.src.split(".").pop() || "png"),
                    fmt: (blob.type.split("/")[1] || "-").toUpperCase(),
                    size: blob.size,
                });
                URL.revokeObjectURL(url);
            };
            img.onerror = () => URL.revokeObjectURL(url);
            img.src = url;
        } catch (e) {
            setMessage("示例图加载失败", "error");
        }
    }

    function fit() {
        if (!st.img) return;
        const cw = els.cvs.clientWidth, ch = els.cvs.clientHeight;
        if (!cw || !ch) return;
        st.sc = Math.min(MAX_S, Math.max(MIN_S, Math.min(cw / st.w, ch / st.h) * 0.95));
        st.ox = (cw - st.w * st.sc) / 2;
        st.oy = (ch - st.h * st.sc) / 2;
        st.fitted = true;
        syncZoomUi();
        requestRender();
    }

    function setZoom(ns, ax, ay) {
        if (!st.img) return;
        const cw = els.cvs.clientWidth, ch = els.cvs.clientHeight;
        if (ax === undefined) { ax = cw / 2; ay = ch / 2; }
        ns = Math.min(MAX_S, Math.max(MIN_S, ns));
        if (ns === st.sc) return;
        const r = ns / st.sc;
        st.ox = ax - (ax - st.ox) * r;
        st.oy = ay - (ay - st.oy) * r;
        st.sc = ns;
        st.fitted = false;
        syncZoomUi();
        requestRender();
    }

    function resetOneToOne() {
        if (!st.img) return;
        const cw = els.cvs.clientWidth, ch = els.cvs.clientHeight;
        st.sc = 1;
        st.ox = (cw - st.w) / 2;
        st.oy = (ch - st.h) / 2;
        st.fitted = false;
        syncZoomUi();
        requestRender();
    }

    function render() {
        const cw = els.cvs.clientWidth, ch = els.cvs.clientHeight;
        if (els.cvs.width !== Math.round(cw * dpr) || els.cvs.height !== Math.round(ch * dpr)) {
            els.cvs.width = Math.round(cw * dpr);
            els.cvs.height = Math.round(ch * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        if (!st.img) return;

        // 放大后关闭平滑插值 → 一个方块一个方块
        ctx.imageSmoothingEnabled = st.sc < 1;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(st.img, st.ox, st.oy, st.w * st.sc, st.h * st.sc);
        ctx.strokeStyle = "rgba(37,99,235,0.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(st.ox - 0.5, st.oy - 0.5, st.w * st.sc + 1, st.h * st.sc + 1);

        const gx0 = Math.max(0, Math.floor(-st.ox / st.sc));
        const gx1 = Math.min(st.w, Math.ceil((cw - st.ox) / st.sc));
        const gy0 = Math.max(0, Math.floor(-st.oy / st.sc));
        const gy1 = Math.min(st.h, Math.ceil((ch - st.oy) / st.sc));

        if (st.grid && st.sc >= GRID_S) {
            ctx.strokeStyle = "rgba(15,23,42,0.22)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = gx0; x <= gx1; x++) {
                const px = st.ox + x * st.sc;
                ctx.moveTo(px, st.oy + gy0 * st.sc);
                ctx.lineTo(px, st.oy + gy1 * st.sc);
            }
            for (let y = gy0; y <= gy1; y++) {
                const py = st.oy + y * st.sc;
                ctx.moveTo(st.ox + gx0 * st.sc, py);
                ctx.lineTo(st.ox + gx1 * st.sc, py);
            }
            ctx.stroke();
        }

        // ≥16x 且开启叠加：在每个像素方块中央画数值
        if (st.label && st.sc >= LABEL_S) drawLabels(gx0, gx1, gy0, gy1);

        const px = Math.floor((st.mx - st.ox) / st.sc);
        const py = Math.floor((st.my - st.oy) / st.sc);
        const inImg = st.mx >= 0 && px >= 0 && px < st.w && py >= 0 && py < st.h;

        if (st.hl && inImg && st.sc >= HL_S) {
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 2;
            ctx.strokeRect(st.ox + px * st.sc + 1, st.oy + py * st.sc + 1, st.sc - 2, st.sc - 2);
        }

        updateProbe(px, py, inImg);
    }

    function resetProbe() {
        els.coord.textContent = "(-, -)";
        els.swatch.style.background = "transparent";
        els.hex.textContent = "#-";
        els.gray.textContent = "Gray -";
        ["R", "G", "B", "C", "M", "Y", "K"].forEach((k) => {
            probes[k].v.textContent = "-";
            probes[k].bar.style.width = "0%";
        });
    }

    function updateProbe(px, py, inImg) {
        if (!st.pix) return;
        if (!inImg) { resetProbe(); return; }
        const i = (py * st.w + px) * 4;
        const r = st.pix[i], g = st.pix[i + 1], b = st.pix[i + 2];
        const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const rn = r / 255, gn = g / 255, bn = b / 255;
        let k = 1 - Math.max(rn, gn, bn), c, m, y;
        if (k >= 1) { c = m = y = 0; k = 1; }
        else {
            c = (1 - rn - k) / (1 - k);
            m = (1 - gn - k) / (1 - k);
            y = (1 - bn - k) / (1 - k);
        }
        els.coord.textContent = "(" + px + ", " + py + ")";
        els.swatch.style.background = hex;
        els.hex.textContent = hex;
        els.gray.textContent = "Gray " + gray;
        const v = { R: r, G: g, B: b, C: Math.round(c * 100), M: Math.round(m * 100), Y: Math.round(y * 100), K: Math.round(k * 100) };
        for (const key in v) {
            probes[key].v.textContent = isRgb[key] ? v[key] : v[key] + "%";
            const pct = isRgb[key] ? v[key] / 255 * 100 : v[key];
            probes[key].bar.style.width = pct + "%";
        }
    }

    function bind() {
        els.drop.addEventListener("click", () => els.input.click());
        els.input.addEventListener("change", () => loadFile(els.input.files[0]));
        ["dragenter", "dragover"].forEach((ev) => els.drop.addEventListener(ev, (e) => {
            e.preventDefault();
            els.drop.classList.add("is-dragging");
        }));
        ["dragleave", "drop"].forEach((ev) => els.drop.addEventListener(ev, (e) => {
            e.preventDefault();
            els.drop.classList.remove("is-dragging");
        }));
        els.drop.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

        els.strip.innerHTML = samples.map((s) => `
            <button class="station01-sample" type="button" data-sample="${s.id}" title="${s.name}">
                <img src="${s.src}" alt="${s.name}">
            </button>`).join("");
        els.strip.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-sample]");
            if (!btn) return;
            const s = samples.find((it) => it.id === btn.dataset.sample);
            if (s) loadSample(s);
        });

        els.zoomIn.addEventListener("click", () => setZoom(st.sc * 1.5));
        els.zoomOut.addEventListener("click", () => setZoom(st.sc / 1.5));
        els.slider.addEventListener("input", () => setZoom(+els.slider.value));
        els.fit.addEventListener("click", fit);
        els.reset.addEventListener("click", resetOneToOne);
        els.grid.addEventListener("change", () => { st.grid = els.grid.checked; requestRender(); });
        els.hl.addEventListener("change", () => { st.hl = els.hl.checked; requestRender(); });
        if (els.label) els.label.addEventListener("change", () => { st.label = els.label.checked; requestRender(); });
        if (els.mode) els.mode.addEventListener("change", () => { st.mode = els.mode.value; requestRender(); });

        els.cvs.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (!st.img) return;
            const rc = els.cvs.getBoundingClientRect();
            const f = Math.exp(-e.deltaY * 0.0018);
            setZoom(st.sc * f, e.clientX - rc.left, e.clientY - rc.top);
        }, { passive: false });

        let pan = null;
        els.cvs.addEventListener("pointerdown", (e) => {
            if (!st.img || e.button !== 0) return;
            pan = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy };
            els.cvs.classList.add("is-panning");
            els.cvs.setPointerCapture(e.pointerId);
        });
        els.cvs.addEventListener("pointermove", (e) => {
            const rc = els.cvs.getBoundingClientRect();
            st.mx = e.clientX - rc.left;
            st.my = e.clientY - rc.top;
            if (pan) {
                st.ox = pan.ox + (e.clientX - pan.x);
                st.oy = pan.oy + (e.clientY - pan.y);
                st.fitted = false;
            }
            requestRender();
        });
        els.cvs.addEventListener("pointerup", (e) => {
            pan = null;
            els.cvs.classList.remove("is-panning");
            try { els.cvs.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
        });
        els.cvs.addEventListener("pointerleave", () => {
            st.mx = -1;
            st.my = -1;
            requestRender();
        });
        els.cvs.addEventListener("dblclick", (e) => { e.preventDefault(); fit(); });

        window.addEventListener("resize", () => {
            if (st.fitted) fit();
            else requestRender();
        });
    }

    bind();
    syncZoomUi();
    resetProbe();
    loadSample(samples[0]);
})();
