(function() {
    var state = {
        stage: 0,
        data: null,
        images: { left: null, right: null },
        maps: { left: null, right: null },
        raf: 0,
        t0: 0,
        running: false
    };

    function $(id) { return document.getElementById(id); }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function esc(text) {
        return String(text == null ? "" : text).replace(/[&<>"']/g, function(ch) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
        });
    }

    function loadImage(src) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() { resolve(img); };
            img.onerror = reject;
            img.src = src;
        });
    }

    function setupCanvas(canvas) {
        var rect = canvas.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.max(1, Math.round(rect.width));
        var h = Math.max(1, Math.round(rect.height));
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        var ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx: ctx, w: w, h: h };
    }

    function drawContained(ctx, img, canvasW, canvasH, sourceSize) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvasW, canvasH);
        if (!img || !sourceSize) return null;
        var sw = Math.max(1, sourceSize[0]);
        var sh = Math.max(1, sourceSize[1]);
        var scale = Math.min(canvasW / sw, canvasH / sh);
        var dw = sw * scale;
        var dh = sh * scale;
        var dx = (canvasW - dw) / 2;
        var dy = (canvasH - dh) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, dx, dy, dw, dh);
        return { x: dx, y: dy, w: dw, h: dh, sw: sw, sh: sh };
    }

    function pointToCanvas(point, map) {
        if (!point || !map) return null;
        return {
            x: map.x + Number(point.x || 0) / map.sw * map.w,
            y: map.y + Number(point.y || 0) / map.sh * map.h
        };
    }

    function pointToRow(point, side) {
        var canvas = side === "left" ? $("leftCanvas") : $("rightCanvas");
        var row = $("canvasRow");
        var map = state.maps[side];
        var pt = pointToCanvas(point, map);
        if (!canvas || !row || !pt) return null;
        var cr = canvas.getBoundingClientRect();
        var rr = row.getBoundingClientRect();
        return { x: cr.left - rr.left + pt.x, y: cr.top - rr.top + pt.y };
    }

    function clearSvg() {
        var svg = $("matchSvg");
        while (svg && svg.firstChild) svg.removeChild(svg.firstChild);
    }

    function svgEl(name, attrs) {
        var el = document.createElementNS("http://www.w3.org/2000/svg", name);
        Object.keys(attrs || {}).forEach(function(k) { el.setAttribute(k, attrs[k]); });
        $("matchSvg").appendChild(el);
        return el;
    }

    function renderImages() {
        if (!state.data) return;
        var vis = state.data.visualization || {};
        var leftView = setupCanvas($("leftCanvas"));
        var rightView = setupCanvas($("rightCanvas"));
        state.maps.left = drawContained(leftView.ctx, state.images.left, leftView.w, leftView.h, vis.left_size);
        state.maps.right = drawContained(rightView.ctx, state.images.right, rightView.w, rightView.h, vis.right_size);
    }

    function syncSvgSize() {
        var row = $("canvasRow").getBoundingClientRect();
        var svg = $("matchSvg");
        svg.setAttribute("viewBox", "0 0 " + Math.max(1, row.width) + " " + Math.max(1, row.height));
    }

    function drawPointLayer() {
        if (!state.data || !$("matchSvg")) return;
        syncSvgSize();
        clearSvg();
        var vis = state.data.visualization || {};
        [["left", vis.left_points || [], "#38bdf8"], ["right", vis.right_points || [], "#f59e0b"]].forEach(function(group) {
            group[1].slice(0, 260).forEach(function(p, i) {
                var pt = pointToRow(p, group[0]);
                if (!pt) return;
                svgEl("circle", {
                    cx: pt.x, cy: pt.y, r: state.stage === 0 ? 3.7 : 2.6,
                    fill: group[2],
                    "fill-opacity": state.stage === 0 ? 0.86 : 0.42,
                    stroke: "#fff",
                    "stroke-width": 0.8,
                    "data-side": group[0],
                    "data-index": i
                });
            });
        });
    }

    function bindRatioLine(line, match, threshold) {
        line.style.pointerEvents = "stroke";
        line.addEventListener("pointermove", function(ev) { showRatioTip(ev, match, threshold); });
        line.addEventListener("pointerleave", hideRatioTip);
    }

    function drawMatches(t) {
        if (!state.data) return;
        drawPointLayer();
        var vis = state.data.visualization || {};
        var left = vis.left_points || [];
        var right = vis.right_points || [];
        var matches = vis.matches || [];
        var threshold = Number((state.data.metrics || {}).ratio || 0.8);
        var shown = Math.min(matches.length, Math.max(0, Math.floor(t * 38)));
        matches.slice(0, shown).forEach(function(m) {
            var p1 = pointToRow(left[m.left], "left");
            var p2 = pointToRow(right[m.right], "right");
            if (!p1 || !p2) return;
            var ok = Number(m.ratio || 1) < threshold;
            if (!ok) {
                var mx = (p1.x + p2.x) / 2;
                var my = (p1.y + p2.y) / 2;
                bindRatioLine(svgEl("line", {
                    x1: p1.x, y1: p1.y, x2: mx - 10, y2: my - 4,
                    stroke: "#ef4444", "stroke-width": 1.8, "stroke-opacity": 0.35,
                    "stroke-linecap": "round", "stroke-dasharray": "7 7"
                }), m, threshold);
                bindRatioLine(svgEl("line", {
                    x1: mx + 10, y1: my + 4, x2: p2.x, y2: p2.y,
                    stroke: "#ef4444", "stroke-width": 1.8, "stroke-opacity": 0.18,
                    "stroke-linecap": "round", "stroke-dasharray": "7 7"
                }), m, threshold);
            } else {
                bindRatioLine(svgEl("line", {
                    x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                    stroke: "#22c55e", "stroke-width": 2.7, "stroke-opacity": 0.78,
                    "stroke-linecap": "round",
                    style: "filter: drop-shadow(0 0 6px rgba(34,197,94,.72)); transition: all .25s ease;"
                }), m, threshold);
            }
        });
        if (matches.length) {
            var active = matches[Math.floor(t * 1.8) % matches.length];
            var a = pointToRow(left[active.left], "left");
            var b = pointToRow(right[active.right], "right");
            var c = pointToRow(right[active.second], "right");
            if (a && b) svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#22c55e", "stroke-width": 4, "stroke-opacity": 0.95 });
            if (a && c) svgEl("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, stroke: "#ef4444", "stroke-width": 3, "stroke-opacity": 0.6, "stroke-dasharray": "7 7" });
        }
    }

    function renderPanel(t) {
        var panel = $("mathPanel");
        if (!panel) return;
        if (!state.data) {
            panel.innerHTML = "<h2>等待上传</h2><p>上传两张有重叠的图片后开始。</p>";
            return;
        }
        var m = state.data.metrics || {};
        var vis = state.data.visualization || {};
        var algorithmName = (m.algorithm || "sift") === "harris" ? "角点特征（Harris）" : "尺度不变特征（SIFT）";
        if (state.stage === 0) {
            panel.innerHTML =
                "<h2>特征提取</h2>" +
                "<p>两张图分别运行真实的 " + esc(algorithmName) + " 提取，圆点就是后端返回的特征点坐标。</p>" +
                "<div class=\"math-card\"><strong>数量</strong><code>左图: " + esc(m.left_features) + "<br>右图: " + esc(m.right_features) + "</code></div>" +
                "<div class=\"math-card\"><strong>说明</strong><code>尺度不变特征点可悬停查看描述子前 32 维小条图。</code></div>";
        } else {
            var matches = vis.matches || [];
            var active = matches.length ? matches[Math.floor(t * 1.8) % matches.length] : null;
            panel.innerHTML =
                "<h2>匹配过滤</h2>" +
                "<p>每个左图特征都去右图找最像的两个候选点，再用可信度阈值保留更明确的匹配。</p>" +
                "<div class=\"math-card\"><strong>按严格度筛选</strong><code>分数 = 最近距离 / 第二近距离<br>" +
                (active ? ("= " + active.d1 + " / " + active.d2 + " = " + active.ratio) : "暂无匹配") +
                "<br>严格度 = " + esc(Number(m.ratio || 0.8).toFixed(2)) + "</code></div>" +
                "<div class=\"math-card\"><strong>结果</strong><code>通过匹配: " + esc(m.matches) + "<br>几何一致点: " + esc(m.inliers) + "</code></div>";
        }
    }

    function showResultImage(url) {
        var section = $("matchResultSection");
        var img = $("matchResultImg");
        if (!section || !img) return;
        if (!url) {
            section.hidden = true;
            img.removeAttribute("src");
            return;
        }
        img.src = url;
        section.hidden = false;
    }

    function updateStitchText(metrics) {
        var text = document.querySelector(".match-result-head p");
        if (!text) return;
        var status = metrics && metrics.stitch_status;
        var method = metrics && metrics.stitch_method;
        if (status === "ok") {
            text.textContent = method === "homography_all_matches"
                ? "根据保留下来的匹配点直接估计单应性矩阵，并把右图变换到左图坐标系后融合显示。"
                : "根据几何一致点估计单应性矩阵，并把右图变换到左图坐标系后融合显示。";
        } else if (status === "weak") {
            text.textContent = "匹配点不足以稳定估计透视矩阵，因此这里只按匹配点的中位位移做平移对齐，不再伪装成透视拼接。";
        } else if (status === "failed") {
            text.textContent = "没有得到可用匹配点，无法生成可信拼接；下方只保留左图作为失败状态预览。";
        } else {
            text.textContent = "根据保留下来的匹配点估计单应性矩阵，把右图变换到左图坐标系后融合显示。";
        }
    }

    function drawFrame(now) {
        if (!state.running) return;
        if (!state.t0) state.t0 = now;
        var t = (now - state.t0) / 1000;
        renderImages();
        if (state.stage === 0) drawPointLayer();
        else drawMatches(t);
        renderPanel(t);
        state.raf = requestAnimationFrame(drawFrame);
    }

    function startLoop() {
        state.running = true;
        cancelAnimationFrame(state.raf);
        state.t0 = 0;
        state.raf = requestAnimationFrame(drawFrame);
    }

    function stopLoop() {
        state.running = false;
        cancelAnimationFrame(state.raf);
    }

    function setStage(stage) {
        state.stage = Math.min(1, Math.max(0, Number(stage) || 0));
        document.querySelectorAll("#stageTabs button").forEach(function(btn) {
            btn.classList.toggle("active", Number(btn.dataset.stage) === state.stage);
        });
        startLoop();
    }

    function setStatus(text, busy) {
        var btn = $("matchBtn");
        if (btn) {
            btn.disabled = !!busy;
            btn.textContent = text || (busy ? "处理中..." : "提取与匹配");
        }
    }

    function drawDescriptorTip(values) {
        var tip = $("pointTip");
        tip.innerHTML = "<canvas width=\"180\" height=\"44\"></canvas>";
        var canvas = tip.querySelector("canvas");
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 180, 44);
        if (!values || !values.length) return;
        var maxVal = Math.max.apply(null, values.map(function(v) { return Math.abs(Number(v) || 0); })) || 1;
        var bw = 180 / values.length;
        values.forEach(function(v, i) {
            var h = Math.abs(Number(v) || 0) / maxVal * 36;
            ctx.fillStyle = Number(v) >= 0 ? "#0ea5e9" : "#ef4444";
            ctx.fillRect(i * bw + 1, 40 - h, Math.max(1, bw - 2), h);
        });
    }

    function showRatioTip(ev, match, threshold) {
        var tip = $("ratioTip");
        if (!tip) return;
        var ok = Number(match.ratio || 1) < threshold;
        tip.innerHTML = (ok ? "保留匹配" : "剔除匹配") +
            "<code>分数 = 最近距离 / 第二近距离<br>" +
            Number(match.d1 || 0).toFixed(4) + " / " + Number(match.d2 || 0).toFixed(4) +
            " = " + Number(match.ratio || 0).toFixed(4) +
            "<br>严格度 = " + threshold.toFixed(2) + "</code>";
        tip.style.borderColor = ok ? "rgba(34,197,94,.38)" : "rgba(239,68,68,.38)";
        var row = $("canvasRow").getBoundingClientRect();
        tip.style.left = clamp(ev.clientX - row.left + 12, 8, row.width - 240) + "px";
        tip.style.top = clamp(ev.clientY - row.top + 12, 8, row.height - 110) + "px";
        tip.style.display = "block";
    }

    function hideRatioTip() {
        var tip = $("ratioTip");
        if (tip) tip.style.display = "none";
    }

    function handleHover(ev) {
        var tip = $("pointTip");
        if (!state.data || !state.maps.left || state.stage !== 0 || (state.data.metrics || {}).algorithm !== "sift") {
            tip.style.display = "none";
            return;
        }
        var rect = $("leftCanvas").getBoundingClientRect();
        var x = ev.clientX - rect.left;
        var y = ev.clientY - rect.top;
        var vis = state.data.visualization || {};
        var best = null;
        var bestD = 12;
        (vis.left_points || []).slice(0, 260).forEach(function(p, i) {
            var pt = pointToCanvas(p, state.maps.left);
            if (!pt) return;
            var d = Math.hypot(pt.x - x, pt.y - y);
            if (d < bestD) {
                bestD = d;
                best = { point: p, index: i };
            }
        });
        if (!best) {
            tip.style.display = "none";
            return;
        }
        var rows = vis.descriptor_samples || {};
        var values = rows[String(best.index)] || rows[String(best.point.index)] || null;
        if (!values) {
            tip.style.display = "none";
            return;
        }
        drawDescriptorTip(values);
        var row = $("canvasRow").getBoundingClientRect();
        tip.style.left = clamp(ev.clientX - row.left + 12, 8, row.width - 198) + "px";
        tip.style.top = clamp(ev.clientY - row.top + 12, 8, row.height - 70) + "px";
        tip.style.display = "block";
    }

    async function submitForm(ev) {
        ev.preventDefault();
        var fd = new FormData($("matchForm"));
        setStatus("计算中...", true);
        showResultImage(null);
        try {
            var res = await fetch("/match/", {
                method: "POST",
                body: fd,
                headers: { "Accept": "application/json" }
            });
            var payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "匹配失败");
            state.data = payload;
            var imgs = await Promise.all([loadImage(payload.left_image), loadImage(payload.right_image)]);
            state.images.left = imgs[0];
            state.images.right = imgs[1];
            updateStitchText(payload.metrics || {});
            showResultImage(payload.stitch_image || payload.result_image || payload.pair_image);
            setStage(0);
            setStatus("重新匹配", false);
        } catch (err) {
            setStatus("提取与匹配", false);
            $("mathPanel").innerHTML = "<h2>处理失败</h2><p>" + esc(err.message || err) + "</p>";
        }
    }

    function init() {
        $("matchForm").addEventListener("submit", submitForm);
        $("ratioInput").addEventListener("input", function() {
            $("ratioValue").textContent = Number(this.value).toFixed(2);
        });
        $("leftInput").addEventListener("change", function() {
            $("leftName").textContent = this.files && this.files[0] ? this.files[0].name : "未选择文件";
        });
        $("rightInput").addEventListener("change", function() {
            $("rightName").textContent = this.files && this.files[0] ? this.files[0].name : "未选择文件";
        });
        document.querySelectorAll("#stageTabs button").forEach(function(btn) {
            btn.addEventListener("click", function() { setStage(this.dataset.stage); });
        });
        $("leftCanvas").addEventListener("pointermove", handleHover);
        $("leftCanvas").addEventListener("pointerleave", function() { $("pointTip").style.display = "none"; });
        $("matchSvg").addEventListener("pointerleave", hideRatioTip);
        window.addEventListener("resize", function() { if (state.data) startLoop(); });
        document.addEventListener("visibilitychange", function() {
            if (document.hidden) stopLoop();
            else if (state.data) startLoop();
        });
        renderPanel(0);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
