(function () {
    const root = document.querySelector("[data-instance-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const $ = (selector) => root.querySelector(selector);
    const state = { data: null, sampleId: "", selectedId: null, opacity: 0.55, showMask: true, showBox: true, showId: true, onlySelected: false, view: "instance" };
    const els = {
        sample: $("[data-inst-sample]"),
        image: $("[data-inst-image]"),
        missing: $("[data-inst-missing]"),
        svg: $("[data-inst-svg]"),
        map: $("[data-inst-map]"),
        list: $("[data-inst-list]"),
        stats: $("[data-inst-stats]"),
        opacity: $("[data-inst-opacity]"),
        opacityOut: $("[data-inst-opacity-output]"),
        showMask: $("[data-inst-show-mask]"),
        showBox: $("[data-inst-show-box]"),
        showId: $("[data-inst-show-id]"),
        onlySelected: $("[data-inst-only-selected]"),
        viewButtons: [...root.querySelectorAll("[data-inst-view]")],
    };

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }
    function sample() {
        return state.data.samples.find((item) => item.id === state.sampleId) || state.data.samples[0];
    }
    function points(poly, s) {
        return poly.map(([x, y]) => `${(x / s.width) * 100},${(y / s.height) * 100}`).join(" ");
    }
    function bboxRect(bbox, s) {
        const [x1, y1, x2, y2] = bbox;
        return {x: (x1 / s.width) * 100, y: (y1 / s.height) * 100, w: ((x2 - x1) / s.width) * 100, h: ((y2 - y1) / s.height) * 100};
    }
    function polygonArea(poly) {
        let area = 0;
        for (let i = 0; i < poly.length; i += 1) {
            const [x1, y1] = poly[i];
            const [x2, y2] = poly[(i + 1) % poly.length];
            area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area / 2);
    }
    function contourLength(poly) {
        return poly.reduce((sum, point, index) => {
            const next = poly[(index + 1) % poly.length];
            return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
        }, 0);
    }
    function selectedInstance() {
        const s = sample();
        return s.instances.find((item) => item.id === state.selectedId) || s.instances[0];
    }
    function renderControls() {
        els.sample.innerHTML = state.data.samples.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
        els.sample.value = state.sampleId;
    }
    function renderList() {
        const s = sample();
        els.list.innerHTML = s.instances.map((item) => `<button class="${item.id === state.selectedId ? "is-active" : ""}" type="button" data-inst-id="${item.id}"><i style="background:${esc(item.color)}"></i><span><strong>#${item.id} ${esc(item.class)}</strong><small>score ${item.score.toFixed(2)}</small></span></button>`).join("");
        els.list.querySelectorAll("[data-inst-id]").forEach((button) => {
            button.addEventListener("click", () => {
                state.selectedId = Number(button.dataset.instId);
                render();
            });
        });
    }
    function renderSvg() {
        const s = sample();
        const selected = selectedInstance();
        const items = state.view === "semantic"
            ? (s.semantic_regions || []).map((item, index) => ({...item, id: index + 1, score: 1, bbox: null}))
            : s.instances;
        const visible = state.onlySelected && state.view === "instance" ? items.filter((item) => item.id === selected.id) : items;
        const maskMarkup = state.showMask ? visible.map((item) => `<polygon class="instance-poly ${item.id === selected.id ? "is-selected" : ""}" data-inst-hit="${item.id}" points="${points(item.polygon, s)}" fill="${esc(item.color)}" fill-opacity="${state.opacity}" stroke="${esc(item.color)}" stroke-width="${item.id === selected.id ? 2.4 : 1.3}" vector-effect="non-scaling-stroke"></polygon>`).join("") : "";
        const boxMarkup = state.showBox && state.view === "instance" ? visible.map((item) => {
            const rect = bboxRect(item.bbox, s);
            return `<rect class="instance-svg-bbox ${item.id === selected.id ? "is-selected" : ""}" data-inst-hit="${item.id}" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="none" stroke="${esc(item.color)}" stroke-width="1.6" vector-effect="non-scaling-stroke"></rect>`;
        }).join("") : "";
        const labelMarkup = state.showId && state.view === "instance" ? visible.map((item) => {
            const [x1, y1] = item.bbox;
            return `<text class="instance-svg-label" data-inst-hit="${item.id}" x="${(x1 / s.width) * 100}" y="${Math.max(4, (y1 / s.height) * 100 - 1)}">ID ${item.id} · ${esc(item.class)}</text>`;
        }).join("") : "";
        els.svg.innerHTML = maskMarkup + boxMarkup + labelMarkup;
    }
    function renderStats() {
        const item = selectedInstance();
        const [x1, y1, x2, y2] = item.bbox;
        const boxArea = (x2 - x1) * (y2 - y1);
        const maskArea = polygonArea(item.polygon);
        const center = [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
        els.stats.innerHTML = `
            <div class="instance-preview-swatch" style="--instance-color:${esc(item.color)}">#${item.id}</div>
            <div class="instance-stats-grid">
                <div><span>Instance ID</span><strong>${item.id}</strong></div>
                <div><span>Class</span><strong>${esc(item.class)}</strong></div>
                <div><span>Score</span><strong>${item.score.toFixed(3)}</strong></div>
                <div><span>BBox</span><strong>[${item.bbox.join(", ")}]</strong></div>
                <div><span>Box Area</span><strong>${Math.round(boxArea).toLocaleString()} px</strong></div>
                <div><span>Mask Area</span><strong>${Math.round(maskArea).toLocaleString()} px</strong></div>
                <div><span>Mask / Box Ratio</span><strong>${(maskArea / boxArea).toFixed(3)}</strong></div>
                <div><span>Center</span><strong>(${center.join(", ")})</strong></div>
                <div><span>Contour Length</span><strong>${Math.round(contourLength(item.polygon)).toLocaleString()} px</strong></div>
            </div>`;
    }
    function render() {
        const s = sample();
        els.image.src = window.cvclassUrl(s.image);
        els.missing.textContent = `请放入 ${s.image.split("/").pop()}`;
        els.map.textContent = `Mask AP ${(s.maskAP * 100).toFixed(1)}%`;
        els.opacityOut.textContent = `${els.opacity.value}%`;
        renderList();
        renderSvg();
        renderStats();
        els.viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.instView === state.view));
    }

    fetch(`${dataRoot}/instance_samples.json`)
        .then((response) => response.json())
        .then((data) => {
            state.data = data;
            state.sampleId = data.default_sample || data.samples[0].id;
            state.selectedId = sample().instances[0].id;
            renderControls();
            render();
        })
        .catch(() => {
            els.stats.innerHTML = `<div class="vision-empty-result">实例样例数据加载失败</div>`;
        });

    els.sample.addEventListener("change", () => {
        state.sampleId = els.sample.value;
        state.selectedId = sample().instances[0].id;
        render();
    });
    els.opacity.addEventListener("input", () => { state.opacity = Number(els.opacity.value) / 100; render(); });
    els.showMask.addEventListener("change", () => { state.showMask = els.showMask.checked; render(); });
    els.showBox.addEventListener("change", () => { state.showBox = els.showBox.checked; render(); });
    els.showId.addEventListener("change", () => { state.showId = els.showId.checked; render(); });
    els.onlySelected.addEventListener("change", () => { state.onlySelected = els.onlySelected.checked; render(); });
    els.viewButtons.forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.instView; render(); }));
    els.svg.addEventListener("click", (event) => {
        if (state.view !== "instance") return;
        const target = event.target.closest("[data-inst-hit]");
        if (!target) return;
        state.selectedId = Number(target.dataset.instHit);
        render();
    });
}());
