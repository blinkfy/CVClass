(function() {
    'use strict';
    var PI = Math.PI, sin = Math.sin, cos = Math.cos, round = Math.round,
        min = Math.min;

    function fit(canvas) {
        var box = canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        var w = Math.max(320, round(box.width || 640));
        var h = Math.max(220, round(box.height || 300));
        if (canvas.width !== round(w * dpr) || canvas.height !== round(h * dpr)) {
            canvas.width = round(w * dpr);
            canvas.height = round(h * dpr);
        }
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx: ctx, w: w, h: h };
    }

    function start(canvas) {
        if (!canvas) return;
        var startTime = performance.now(), stopped = false;

        function frame(now) {
            if (stopped || canvas.dataset.featurePlayback === '1') return;
            var v = fit(canvas), ctx = v.ctx, w = v.w, h = v.h, t = (now - startTime) / 1000;

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, w, h);

            // ── Left: Gaussian scale space ──
            var gx = w * 0.05, gy = h * 0.1, gw = w * 0.28, gh = h * 0.65, layers = 5;
            for (var i = 0; i < layers; i++) {
                var alpha = 0.1 + (layers - i) * 0.08;
                ctx.fillStyle = 'rgba(14,165,233,' + alpha + ')';
                ctx.beginPath();
                ctx.roundRect(gx + i * 3, gy + i * (gh * 0.15), gw - i * 6, gh * 0.6 - i * 6, 4);
                ctx.fill();
                ctx.strokeStyle = 'rgba(226,232,240,' + (0.15 + i * 0.06) + ')';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(gx + i * 3, gy + i * (gh * 0.15), gw - i * 6, gh * 0.6 - i * 6, 4);
                ctx.stroke();
            }
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('高斯尺度空间 (Octave)', gx + gw/2, gy + gh + 4);

            // ── Center: DoG curve ──
            var dx = w * 0.37, dy = h * 0.25, dw = w * 0.30;
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (var px = 0; px <= dw; px += 2) {
                var u = (px - dw/2) / (dw * 0.16);
                var g1 = Math.exp(-u*u/2);
                var py = dy + 60 - g1 * 38;
                if (px === 0) ctx.moveTo(dx + px, py); else ctx.lineTo(dx + px, py);
            }
            ctx.stroke();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            for (var px = 0; px <= dw; px += 2) {
                var u = (px - dw/2) / (dw * 0.25);
                var g2 = Math.exp(-u*u/2);
                var py = dy + 60 - g2 * 38;
                if (px === 0) ctx.moveTo(dx + px, py); else ctx.lineTo(dx + px, py);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // DoG curve below
            var dogY = dy + 100;
            ctx.strokeStyle = '#2dd4bf';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (var px = 0; px <= dw; px += 2) {
                var u = (px - dw/2) / (dw * 0.2);
                var dog = (1 - u*u) * Math.exp(-u*u/2) * 22;
                var py = dogY - dog;
                if (px === 0) ctx.moveTo(dx + px, py); else ctx.lineTo(dx + px, py);
            }
            ctx.stroke();

            ctx.fillStyle = '#0ea5e9'; ctx.textAlign = 'left';
            ctx.font = 'bold 11px Consolas, monospace'; ctx.fillText('G(σ)', dx + dw + 4, dy + 64);
            ctx.fillStyle = '#f59e0b'; ctx.fillText('G(kσ)', dx + dw + 4, dy + 44);
            ctx.fillStyle = '#2dd4bf'; ctx.fillText('DoG', dx + dw + 4, dogY - 14);

            // ── Right: Descriptor grid ──
            var sx = w * 0.72, sy = h * 0.2, ss = min(w * 0.06, h * 0.14);
            for (var r = 0; r < 4; r++) {
                for (var c = 0; c < 4; c++) {
                    var cx = sx + c * ss, cy = sy + r * ss;
                    ctx.fillStyle = 'rgba(30,41,59,0.7)';
                    ctx.fillRect(cx + 1, cy + 1, ss - 2, ss - 2);
                    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(cx + 1, cy + 1, ss - 2, ss - 2);
                    var ccx = cx + ss/2, ccy = cy + ss/2;
                    for (var b = 0; b < 8; b++) {
                        var angle = PI*2*b/8 + t*0.2;
                        var mag = ss*0.25*abs(sin(r+ c+ b*0.5+ t));
                        ctx.strokeStyle = 'rgba(14,165,233,' + (0.3 + mag/ss) + ')';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(ccx, ccy);
                        ctx.lineTo(ccx + cos(angle)*mag, ccy + sin(angle)*mag);
                        ctx.stroke();
                    }
                }
            }
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('4×4×8 = 128 维', sx + ss*2, sy + ss*4 + 18);

            // ── Bottom label ──
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '700 14px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SIFT: 尺度空间 → DoG 极值 → 方向 → 描述子', w/2, h - 16);

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        return { stop: function() { stopped = true; } };
    }

    window.SiftAnimation = { start: start };
})();
