(function() {
    'use strict';
    var PI = Math.PI, sin = Math.sin, cos = Math.cos, round = Math.round;

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

            // ── Left: Image patch morphing ──
            var gx = w * 0.06, gy = h * 0.18, gs = Math.min(w * 0.18, h * 0.45), cells = 5;
            var phase = (t % 10) / 10; // cycle flat → edge → corner
            for (var r = 0; r < cells; r++) {
                for (var c = 0; c < cells; c++) {
                    var intensity;
                    if (phase < 0.33) { intensity = 0.45; }
                    else if (phase < 0.66) { intensity = r < 2 ? 0.25 : 0.7; }
                    else { intensity = (r < 3 && c < 3) ? 0.2 : 0.8; }
                    var gray = round(intensity * 230 + 15);
                    ctx.fillStyle = 'rgb(' + gray + ',' + gray + ',' + gray + ')';
                    ctx.fillRect(gx + c * gs/cells + 1, gy + r * gs/cells + 1, gs/cells - 2, gs/cells - 2);
                }
            }
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('局部图像块', gx + gs/2, gy + gs + 18);

            // ── Center: M matrix ──
            var mx = w * 0.32, my = h * 0.25;
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.strokeStyle = 'rgba(148,163,184,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(mx, my, 140, 90, 8); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e2e8f0';
            ctx.font = 'bold 15px Consolas, monospace';
            ctx.textAlign = 'left';
            ctx.fillText('M =', mx + 12, my + 26);
            ctx.fillStyle = '#0ea5e9';
            ctx.font = 'bold 16px Consolas, monospace';
            ctx.fillText('[  Ix²   IxIy  ]', mx + 12, my + 50);
            ctx.fillText('[  IxIy  Iy²   ]', mx + 12, my + 74);

            // ── Right: Eigenvalue ellipse ──
            var ex = w * 0.78, ey = h * 0.52, er = Math.min(w * 0.12, h * 0.3);
            var lam1 = 0.3 + 0.5 * sin(t * 0.4) * sin(t * 0.4);
            var lam2 = 0.3 + 0.5 * cos(t * 0.4) * cos(t * 0.4);
            ctx.fillStyle = 'rgba(45,212,191,0.08)';
            ctx.beginPath(); ctx.ellipse(ex, ey, er * lam1, er * lam2, PI/6, 0, PI*2); ctx.fill();
            ctx.strokeStyle = 'rgba(45,212,191,0.6)';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.ellipse(ex, ey, er * lam1, er * lam2, PI/6, 0, PI*2); ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px "Microsoft YaHei", sans-serif';
            ctx.fillText('特征值椭圆', ex, ey + er + 22);

            // ── Bottom label ──
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '700 14px "Microsoft YaHei", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Harris: 梯度 → 结构张量 → 响应 → NMS', w/2, h - 16);

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        return { stop: function() { stopped = true; } };
    }

    window.HarrisAnimation = { start: start };
})();
