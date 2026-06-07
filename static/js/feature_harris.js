(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureHarrisForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);

    function renderProbe(probe) {
        const box = V.$("harrisProbe");
        if (!box || !probe) return;
        box.innerHTML = "";
        V.renderMatrix(box, "Gray Patch", probe.gray_patch);
        V.renderMatrix(box, "Ix Patch", probe.ix_patch);
        V.renderMatrix(box, "Iy Patch", probe.iy_patch);
        V.renderMatrix(box, "Gaussian Weight", probe.gaussian_weight);
        V.renderMatrix(box, "Ix² Patch", probe.ix2_patch);
        V.renderMatrix(box, "Iy² Patch", probe.iy2_patch);
        V.renderMatrix(box, "IxIy Patch", probe.ixiy_patch);
        V.renderMatrix(box, "M 矩阵", probe.M);
        box.insertAdjacentHTML("beforeend", `<div class="feature-matrix-card"><strong>Harris 响应</strong><p>det(M) = ${probe.det}</p><p>trace(M) = ${probe.trace}</p><p>R = ${probe.r}</p><p>坐标：(${probe.x}, ${probe.y})</p></div>`);
    }

    async function render(data) {
        const a = data.arrays || {};
        await V.drawBaseImage(V.$("hOriginal"), data.images.original);
        V.drawArray(V.$("hGray"), a.gray);
        V.drawArray(V.$("hIx"), a.ix);
        V.drawArray(V.$("hIy"), a.iy);
        V.drawArray(V.$("hIx2"), a.ix2);
        V.drawArray(V.$("hIy2"), a.iy2);
        V.drawArray(V.$("hIxIy"), a.ixiy);
        V.drawArray(V.$("hResponse"), a.harris_response, "heat");
        V.drawArray(V.$("hNms"), a.nms);
        await V.drawKeypoints(V.$("hCorners"), data.images.original, data.harris?.corners || [], { color: "#06b6d4", max: 800 });
        await V.drawKeypoints(V.$("harrisFinalCanvas"), data.images.original, data.harris?.corners || [], { color: "#06b6d4", max: 1000 });
        renderProbe(data.probe);
        V.renderStatList(V.$("harrisSummary"), [
            ["Harris 角点", data.harris?.count || 0],
            ["Shi-Tomasi 角点", data.shi_tomasi?.count || 0],
            ["处理耗时", `${data.meta.elapsed_ms} ms`],
            ["图像尺寸", `${data.meta.width}×${data.meta.height}`]
        ]);
        V.$("harrisElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const btn = form.querySelector("button[type=submit]");
        if (btn) btn.textContent = "计算中...";
        try {
            const data = await V.postForm(form, "/api/feature-detect");
            await render(data);
        } catch (err) { alert(err.message || err); }
        finally { if (btn) btn.textContent = "运行 Harris"; }
    });
    form.requestSubmit();
})();
