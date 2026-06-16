(function () {
    const root = document.querySelector("[data-semantic-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
    const $ = (selector) => root.querySelector(selector);
    const state = { data: null, sampleId: "", mode: "overlay", opacity: 0.65, enabled: new Set(), regions: [] };
    const els = {
        sample: $("[data-sem-sample]"),
        image: $("[data-sem-image]"),
        missing: $("[data-sem-missing]"),
        canvas: $("[data-sem-canvas]"),
        stage: $("[data-sem-stage]"),
        modes: [...root.querySelectorAll("[data-sem-mode]")],
        opacity: $("[data-sem-opacity]"),
        opacityOut: $("[data-sem-opacity-output]"),
        filter: $("[data-sem-class-filter]"),
        legend: $("[data-sem-legend]"),
        ratios: $("[data-sem-ratios]"),
        miou: $("[data-sem-miou]"),
        probe: $("[data-sem-probe]"),
    };
    const ctx = els.canvas.getContext("2d");

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }
    function sample() {
        return state.data.samples.find((item) => item.id === state.sampleId) || state.data.samples[0];
    }
    function cls(s, name) {
        return s.classes.find((item) => item.name === name || item.cn === name);
    }
    function polygonArea(points) {
        let area = 0;
        for (let i = 0; i < points.length; i += 1) {
            const [x1, y1] = points[i];
            const [x2, y2] = points[(i + 1) % points.length];
            area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area / 2);
    }
    function pointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i][0], yi = points[i][1];
            const xj = points[j][0], yj = points[j][1];
            const intersect = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }
    function draw() {
        const s = sample();
        els.canvas.width = s.width;
        els.canvas.height = s.height;
        ctx.clearRect(0, 0, s.width, s.height);
        els.stage.dataset.mode = state.mode;
        els.canvas.style.opacity = state.mode === "image" ? "0" : String(state.opacity);
        if (state.mode === "mask") {
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, s.width, s.height);
            els.canvas.style.opacity = "1";
        }
        state.regions = s.regions.filter((region) => state.enabled.has(region.class));
        state.regions.forEach((region) => {
            const info = cls(s, region.class);
            ctx.beginPath();
            region.polygon.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
            ctx.closePath();
            ctx.fillStyle = info?.color || "#2563eb";
            ctx.globalAlpha = state.mode === "mask" ? 0.92 : (region.opacity ?? 0.66);
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    }
    function renderControls() {
        const s = sample();
        els.sample.innerHTML = state.data.samples.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
        els.sample.value = s.id;
        state.enabled = new Set(s.classes.map((item) => item.name));
        els.filter.innerHTML = s.classes.map((item) => `<label class="vision-check-row"><input type="checkbox" value="${esc(item.name)}" checked><span><i style="background:${esc(item.color)}"></i>${esc(item.cn || item.name)}</span></label>`).join("");
        els.filter.querySelectorAll("input").forEach((input) => {
            input.addEventListener("change", () => {
                state.enabled = new Set([...els.filter.querySelectorAll("input:checked")].map((node) => node.value));
                renderSample(false);
            });
        });
    }
    function renderSample(resetControls = true) {
        const s = sample();
        els.image.src = window.cvclassUrl(s.image);
        els.missing.textContent = `请放入 ${s.image.split("/").pop()}`;
        els.miou.textContent = `mIoU ${(s.miou * 100).toFixed(1)}%`;
        if (resetControls) renderControls();
        els.legend.innerHTML = s.classes.map((item) => `<span><i style="background:${esc(item.color)}"></i>${esc(item.cn || item.name)}</span>`).join("");
        const total = s.width * s.height;
        const rows = s.classes.map((item) => {
            const value = s.regions.filter((region) => region.class === item.name && state.enabled.has(item.name)).reduce((sum, region) => sum + polygonArea(region.polygon), 0);
            const pct = Math.min(100, (value / total) * 100);
            return `<div><span><i style="background:${esc(item.color)}"></i>${esc(item.cn || item.name)}</span><b><em style="width:${pct}%"></em></b><strong>${pct.toFixed(1)}%</strong></div>`;
        }).join("");
        els.ratios.innerHTML = rows;
        draw();
    }
    function probe(event) {
        const s = sample();
        const rect = els.canvas.getBoundingClientRect();
        const x = Math.round(((event.clientX - rect.left) / rect.width) * s.width);
        const y = Math.round(((event.clientY - rect.top) / rect.height) * s.height);
        const region = [...state.regions].reverse().find((item) => pointInPolygon(x, y, item.polygon));
        const info = region ? cls(s, region.class) : null;
        els.probe.innerHTML = `
            <strong>像素探针</strong>
            <span>Pixel (x, y): ${x}, ${y}</span>
            <span>RGB: 预设图像采样</span>
            <span>Class ID: ${info?.id ?? "--"}</span>
            <span>Class Name: ${esc(info?.cn || info?.name || "未命中")}</span>
            <span>Probability: ${(region?.probability ?? 0).toFixed(2)}</span>`;
    }

    fetch(`${dataRoot}/semantic_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            renderSample(true);
        })
        .catch(() => {
            els.probe.innerHTML = `<strong>样例数据加载失败</strong>`;
        });

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        renderSample(true);
    });
    els.modes.forEach((button) => button.addEventListener("click", () => {
        state.mode = button.dataset.semMode;
        els.modes.forEach((node) => node.classList.toggle("is-active", node === button));
        draw();
    }));
    els.opacity.addEventListener("input", () => {
        state.opacity = Number(els.opacity.value) / 100;
        els.opacityOut.textContent = `${els.opacity.value}%`;
        draw();
    });
    els.stage.addEventListener("mousemove", probe);
}());
