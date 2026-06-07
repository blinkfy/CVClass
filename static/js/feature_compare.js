(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureCompareForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);

    async function render(data) {
        const original = data.images.original;
        const harris = data.harris?.corners || [];
        const shi = data.shi_tomasi?.corners || [];
        const sift = data.sift?.keypoints || [];
        await V.drawCombined(V.$("compareMainCanvas"), original, harris, shi, sift);
        await V.drawKeypoints(V.$("harrisCanvas"), original, harris, { color: "#06b6d4", max: 600 });
        await V.drawKeypoints(V.$("shiCanvas"), original, shi, { color: "#16a34a", type: "circle", max: 500 });
        await V.drawSiftKeypoints(V.$("siftCanvas"), original, sift, { max: 260 });
        await V.drawCombined(V.$("comboCanvas"), original, harris, shi, sift);
        V.$("harrisStats").textContent = `检测点数：${data.harris?.count || 0}`;
        V.$("shiStats").textContent = `检测点数：${data.shi_tomasi?.count || 0}`;
        V.$("siftStats").textContent = `检测点数：${data.sift?.count || 0}`;
        V.$("comboStats").textContent = `总标记：${(data.harris?.count || 0) + (data.sift?.count || 0)}`;
        V.$("compareElapsed").textContent = `${data.meta.elapsed_ms} ms · ${data.meta.width}×${data.meta.height}`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        if (button) button.textContent = "计算中...";
        try {
            const data = await V.postForm(form, "/api/feature-detect");
            await render(data);
        } catch (err) {
            alert(err.message || err);
        } finally {
            if (button) button.textContent = "一键生成对比";
        }
    });
    form.requestSubmit();
})();
