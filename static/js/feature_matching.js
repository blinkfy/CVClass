(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureMatchForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);
    let requestId = 0;

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
        const points = data.extended_points || data.oriented_keypoints || {};
        const leftPoints = points.left || [];
        const rightPoints = points.right || [];
        (data.matches || []).forEach(m => {
            const leftPoint = leftPoints[m.left_index];
            const rightPoint = rightPoints[m.right_index];
            if (!leftPoint || !rightPoint) return;
            const color = m.passed ? "rgba(37,99,235,.78)" : (m.ratio > 0.95 ? "rgba(220,38,38,.86)" : "rgba(148,163,184,.55)");
            ctx.strokeStyle = color;
            ctx.lineWidth = m.passed ? 1.4 : 1;
            ctx.beginPath();
            ctx.moveTo(leftPoint.x, leftPoint.y);
            ctx.lineTo(ox + rightPoint.x, rightPoint.y);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(leftPoint.x, leftPoint.y, 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(ox + rightPoint.x, rightPoint.y, 3, 0, Math.PI * 2); ctx.stroke();
        });
    }

    function renderTable(data) {
        const tbody = document.querySelector("#matchTable tbody");
        if (!tbody) return;
        const points = data.extended_points || data.oriented_keypoints || {};
        const leftPoints = points.left || [];
        const rightPoints = points.right || [];
        tbody.innerHTML = (data.matches || []).slice(0, 8).map(m => {
            const left = leftPoints[m.left_index] || {};
            const right = rightPoints[m.right_index] || {};
            return `<tr><td>${m.rank}</td><td>(${left.x ?? "-"}, ${left.y ?? "-"})</td><td>(${right.x ?? "-"}, ${right.y ?? "-"})</td><td>${m.distance}</td><td>${m.second_distance}</td><td>${m.ratio}</td><td class="${m.passed ? 'pass' : 'fail'}">${m.passed ? '通过' : '未通过'}</td></tr>`;
        }).join("");
    }

    async function render(data) {
        await drawMatch(data);
        const s = data.stats || {};
        V.renderStatList(V.$("matchStats"), [
            ["左图关键点", s.left_keypoints || 0], ["右图关键点", s.right_keypoints || 0], ["原始匹配", s.raw_matches || 0],
            ["通过 ratio test", s.good_matches || 0], ["平均距离", s.avg_distance || 0], ["过滤比例", `${Math.round((s.filter_ratio || 0) * 1000) / 10}%`]
        ]);
        renderTable(data);
        V.$("matchElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const currentRequest = ++requestId;
        const btn = form.querySelector("button[type=submit]");
        if (btn) btn.textContent = "匹配中...";
        try {
            const data = await V.postForm(form, "/api/feature-match");
            if (currentRequest !== requestId) return;
            await render(data);
        } catch (err) { }
        finally { if (currentRequest === requestId && btn) btn.textContent = "执行 SIFT 匹配"; }
    });
    V.bindAutoSubmit(form);
    form.requestSubmit();
})();
