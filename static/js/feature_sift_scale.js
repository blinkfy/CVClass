(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureScaleForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);

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
        await V.drawSiftKeypoints(V.$("scaleSiftCanvas"), data.images.original, data.sift?.keypoints || [], { max: 350 });
        const c = data.sift?.counts || {};
        V.renderStatList(V.$("scaleStats"), [
            ["原始极值点", c.raw_extrema || 0],
            ["低对比度过滤后", c.contrast_survivors || 0],
            ["边缘过滤后", c.edge_survivors || 0],
            ["最终保留", c.kept || data.sift?.count || 0]
        ]);
        V.$("scaleElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const btn = form.querySelector("button[type=submit]");
        if (btn) btn.textContent = "构建中...";
        try {
            const data = await V.postForm(form, "/api/feature-detect");
            await render(data);
        } catch (err) { alert(err.message || err); }
        finally { if (btn) btn.textContent = "构建尺度空间"; }
    });
    form.requestSubmit();
})();
