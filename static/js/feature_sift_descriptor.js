(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureDescriptorForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);

    function drawPatch(canvas, vectors) {
        if (!canvas) return;
        V.setCanvasSize(canvas, 360, 260);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#dbeafe";
        for (let i = 0; i <= 16; i++) {
            const x = 30 + i * 18;
            const y = 20 + i * 14;
            ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 244); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(318, y); ctx.stroke();
        }
        const maxMag = Math.max(1e-6, ...(vectors || []).map(v => v.mag || 0));
        (vectors || []).forEach(v => {
            const x = 30 + (v.dx + 8 + 0.5) * 18;
            const y = 20 + (v.dy + 8 + 0.5) * 14;
            const len = 4 + 10 * ((v.mag || 0) / maxMag);
            ctx.strokeStyle = "#7c3aed";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(v.angle) * len / 2, y - Math.sin(v.angle) * len / 2);
            ctx.lineTo(x + Math.cos(v.angle) * len / 2, y + Math.sin(v.angle) * len / 2);
            ctx.stroke();
        });
    }

    function drawCells(canvas, cells) {
        if (!canvas) return;
        V.setCanvasSize(canvas, 440, 220);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#dbeafe";
        const size = 42;
        const startX = 22;
        const startY = 22;
        for (let cy = 0; cy < 4; cy++) {
            for (let cx = 0; cx < 4; cx++) {
                const x = startX + cx * (size + 8);
                const y = startY + cy * (size + 8);
                ctx.strokeStyle = "#cbd5e1";
                ctx.strokeRect(x, y, size, size);
                const hist = (cells && cells[cy] && cells[cy][cx]) ? cells[cy][cx] : [];
                const max = Math.max(1e-9, ...hist);
                for (let b = 0; b < 8; b++) {
                    const a = b / 8 * Math.PI * 2;
                    const len = 4 + 12 * ((hist[b] || 0) / max);
                    const mx = x + size / 2;
                    const my = y + size / 2;
                    ctx.strokeStyle = "#2563eb";
                    ctx.beginPath();
                    ctx.moveTo(mx, my);
                    ctx.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len);
                    ctx.stroke();
                }
            }
        }
    }

    async function render(data) {
        const kp = data.sift?.selected;
        const keypoints = kp ? [kp] : [];
        await V.drawSiftKeypoints(V.$("descriptorKeypointCanvas"), data.images.original, keypoints, { max: 1 });
        drawPatch(V.$("descriptorPatchCanvas"), kp?.patch_vectors || []);
        const hist = kp?.histogram36 || [];
        const mainBin = hist.indexOf(Math.max(...hist));
        V.drawBarChart(V.$("orientationHist"), hist, { width: 820, height: 160, highlight: mainBin, color: "#60a5fa" });
        drawCells(V.$("cellHistCanvas"), kp?.cell_histograms || []);
        V.drawBarChart(V.$("descriptor128Canvas"), kp?.descriptor128 || [], { width: 820, height: 180, color: "#2563eb" });
        V.renderStatList(V.$("keypointInfo"), kp ? [
            ["x, y", `${kp.x}, ${kp.y}`], ["octave / layer", `${kp.octave} / ${kp.layer}`], ["σ", kp.sigma], ["主方向", `${kp.orientation_deg}°`], ["Response", kp.response], ["Descriptor", "128 维"]
        ] : [["状态", "未检测到关键点"]]);
        V.$("descriptorElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const btn = form.querySelector("button[type=submit]");
        if (btn) btn.textContent = "生成中...";
        try {
            const data = await V.postForm(form, "/api/feature-detect");
            await render(data);
        } catch (err) { alert(err.message || err); }
        finally { if (btn) btn.textContent = "生成描述子"; }
    });
    form.requestSubmit();
})();
