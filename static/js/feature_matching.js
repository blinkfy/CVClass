(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureMatchForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);

    async function drawMatch(data) {
        const canvas = V.$("matchCanvas");
        if (!canvas) return;
        const left = await V.loadImage(data.images.left);
        const right = await V.loadImage(data.images.right);
        const gap = 24;
        const h = Math.max(left.naturalHeight, right.naturalHeight);
        const w = left.naturalWidth + right.naturalWidth + gap;
        V.setCanvasSize(canvas, w, h);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(left, 0, 0);
        ctx.drawImage(right, left.naturalWidth + gap, 0);
        const ox = left.naturalWidth + gap;
        (data.matches || []).forEach(m => {
            const color = m.passed ? "rgba(37,99,235,.78)" : (m.ratio > 0.95 ? "rgba(220,38,38,.86)" : "rgba(148,163,184,.55)");
            ctx.strokeStyle = color;
            ctx.lineWidth = m.passed ? 1.4 : 1;
            ctx.beginPath();
            ctx.moveTo(m.left.x, m.left.y);
            ctx.lineTo(ox + m.right.x, m.right.y);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(m.left.x, m.left.y, 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(ox + m.right.x, m.right.y, 3, 0, Math.PI * 2); ctx.stroke();
        });
    }

    function renderTable(matches) {
        const tbody = document.querySelector("#matchTable tbody");
        if (!tbody) return;
        tbody.innerHTML = (matches || []).slice(0, 8).map(m => `<tr><td>${m.rank}</td><td>(${m.left.x}, ${m.left.y})</td><td>(${m.right.x}, ${m.right.y})</td><td>${m.distance}</td><td>${m.second_distance}</td><td>${m.ratio}</td><td class="${m.passed ? 'pass' : 'fail'}">${m.passed ? '通过' : '未通过'}</td></tr>`).join("");
    }

    async function render(data) {
        await drawMatch(data);
        const s = data.stats || {};
        V.renderStatList(V.$("matchStats"), [
            ["左图关键点", s.left_keypoints || 0], ["右图关键点", s.right_keypoints || 0], ["原始匹配", s.raw_matches || 0],
            ["通过 ratio test", s.good_matches || 0], ["平均距离", s.avg_distance || 0], ["过滤比例", `${Math.round((s.filter_ratio || 0) * 1000) / 10}%`]
        ]);
        renderTable(data.matches);
        V.$("matchElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const btn = form.querySelector("button[type=submit]");
        if (btn) btn.textContent = "匹配中...";
        try {
            const data = await V.postForm(form, "/api/feature-match");
            await render(data);
        } catch (err) { alert(err.message || err); }
        finally { if (btn) btn.textContent = "执行 SIFT 匹配"; }
    });
    form.requestSubmit();
})();
