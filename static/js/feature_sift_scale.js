(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureScaleForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);
    let requestId = 0;

    function renderPyramid(container, rows, dog) {
        if (!container) return;
        container.innerHTML = "";
        (rows || []).forEach((row, o) => {
            const rowEl = document.createElement("div");
            rowEl.className = "feature-pyramid-row";
            rowEl.innerHTML = `<div class="feature-pyramid-label">Octave ${o}</div>`;
            row.forEach(cell => {
                const c = document.createElement("canvas");
                c.title = `${dog ? "D" : "G"}${cell.layer}`;
                rowEl.appendChild(c);
                V.drawArray(c, cell.array, dog ? "gray" : "gray");
            });
            container.appendChild(rowEl);
        });
    }

    function renderDogProbe(probe) {
        const box = V.$("dogProbe");
        if (!box || !probe) return;
        box.innerHTML = "";
        V.renderMatrix(box, "上一层", probe.prev);
        V.renderMatrix(box, "当前层", probe.current);
        V.renderMatrix(box, "下一层", probe.next);
        box.insertAdjacentHTML("beforeend", `<div class="feature-matrix-card"><strong>检测点状态</strong><p>Octave: ${probe.octave}</p><p>Layer: ${probe.layer}</p><p>坐标: (${probe.x}, ${probe.y})</p><p>中心值: ${probe.center}</p></div>`);
    }

    async function render(data) {
        renderPyramid(V.$("gaussianPyramid"), data.pyramid?.gaussian || [], false);
        renderPyramid(V.$("dogPyramid"), data.pyramid?.dog || [], true);
        renderDogProbe(data.pyramid?.probe);
        const sift = data.sift || {};
        await V.drawKeypoints(V.$("scaleExtremaCanvas"), data.images.original, sift.points_extrema || [], { color: "#94a3b8", max: 800, size: 3 });
        await V.drawKeypoints(V.$("scaleEdgeCanvas"), data.images.original, sift.points_edge || [], { color: "#f97316", type: "circle", max: 600, radius: 3 });
        await V.drawSiftKeypoints(V.$("scaleSiftCanvas"), data.images.original, sift.points_keypoints || sift.keypoints || [], { max: 350 });
        const c = data.sift?.counts || {};
        V.renderStatList(V.$("scaleStats"), [
            ["原始极值点", c.raw_extrema || 0],
            ["对比度与边缘过滤后", c.edge_survivors || 0],
            ["最终 NMS 保留", c.kept || data.sift?.count || 0]
        ]);
        V.$("scaleElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const currentRequest = ++requestId;
        const btn = form.querySelector("button[type=submit]");
        if (btn) btn.textContent = "构建中...";
        try {
            const data = await V.computeFeatureForm(form);
            if (currentRequest !== requestId) return;
            await render(data);
        } catch (err) { }
        finally { if (currentRequest === requestId && btn) btn.textContent = "构建尺度空间"; }
    });
    V.bindAutoSubmit(form);
    form.requestSubmit();
})();
