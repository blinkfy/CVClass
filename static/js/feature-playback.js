(function() {
    function fit(canvas) {
        var box = canvas.getBoundingClientRect();
        var scale = window.devicePixelRatio || 1;
        var w = Math.max(320, Math.floor(box.width || 640));
        var h = Math.max(220, Math.floor(box.height || 300));
        if (canvas.width !== Math.floor(w * scale) || canvas.height !== Math.floor(h * scale)) {
            canvas.width = Math.floor(w * scale);
            canvas.height = Math.floor(h * scale);
        }
        var ctx = canvas.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        return { ctx: ctx, w: w, h: h };
    }

    function drawContain(ctx, img, x, y, w, h) {
        var iw0 = img.naturalWidth || img.width;
        var ih0 = img.naturalHeight || img.height;
        if (!iw0 || !ih0) return;
        var ratio = Math.min(w / iw0, h / ih0);
        var iw = iw0 * ratio;
        var ih = ih0 * ratio;
        var ix = x + (w - iw) / 2;
        var iy = y + (h - ih) / 2;
        ctx.drawImage(img, ix, iy, iw, ih);
    }

    function create(options) {
        var canvas = options.canvas;
        var meta = options.stepMeta || {};
        var stepTitle = options.stepTitle;
        var stepPrinciple = options.stepPrinciple;
        var progressDots = options.progressDots;
        var progressText = options.progressText;
        var playPauseBtn = options.playPauseBtn;
        var stepBackBtn = options.stepBackBtn;
        var stepFwdBtn = options.stepFwdBtn;
        var speedSlider = options.speedSlider;
        var speedLabel = options.speedLabel;
        var emptyTitle = options.emptyTitle || 'Waiting';
        var emptyPrinciple = options.emptyPrinciple || 'Upload an image to view each step.';
        var playText = options.playText || 'Play';
        var pauseText = options.pauseText || 'Pause';
        var progressPrefix = options.progressPrefix || 'Step';
        var showLabel = options.showLabel === true;

        var state = {
            steps: [],
            images: [],
            index: 0,
            prevIndex: -1,
            playing: false,
            raf: null,
            transitionRaf: null,
            lastTick: 0,
            transitionStart: 0,
            transitionDuration: 430,
            transitionProgress: 1,
            speed: speedSlider ? Number(speedSlider.value || 0.75) : 0.75
        };

        function getMeta(step) {
            return step && meta[step.id] ? meta[step.id] : { name: step ? step.id : emptyTitle, explain: emptyPrinciple };
        }

        function setIndex(index, animate) {
            if (!state.steps.length) return;
            var next = Math.max(0, Math.min(state.steps.length - 1, index));
            if (next === state.index && animate) return;
            state.prevIndex = animate ? state.index : -1;
            state.index = next;
            state.transitionProgress = animate ? 0 : 1;
            state.transitionStart = 0;
        }

        function drawEmpty(ctx, w, h) {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(0, 0, w, h);
        }

        function drawLabel(ctx, w, h, step, info) {
            var text = step ? (state.index + 1) + '/' + state.steps.length + '  ' + info.name : emptyTitle;
            ctx.font = 'bold 14px Microsoft YaHei, sans-serif';
            var tw = Math.min(w - 24, ctx.measureText(text).width + 24);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(12, h - 40, tw, 28);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 24, h - 26);
            ctx.textBaseline = 'alphabetic';
        }

        function drawFrame(timestamp) {
            if (!canvas) return;
            if (state.transitionProgress < 1 && timestamp) {
                if (!state.transitionStart) state.transitionStart = timestamp;
                state.transitionProgress = Math.min(1, (timestamp - state.transitionStart) / state.transitionDuration);
            }

            var view = fit(canvas);
            var ctx = view.ctx;
            var w = view.w;
            var h = view.h;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, w, h);

            var step = state.steps[state.index];
            var img = state.images[state.index];
            var prevImg = state.prevIndex >= 0 ? state.images[state.prevIndex] : null;
            if (prevImg && prevImg.complete && prevImg.naturalWidth && state.transitionProgress < 1) {
                ctx.globalAlpha = 1;
                drawContain(ctx, prevImg, 0, 0, w, h);
            }
            if (img && img.complete && img.naturalWidth) {
                ctx.globalAlpha = Math.min(1, Math.max(0, state.transitionProgress));
                drawContain(ctx, img, 0, 0, w, h);
                ctx.globalAlpha = 1;
            } else {
                ctx.globalAlpha = 1;
                drawEmpty(ctx, w, h);
            }

            if (showLabel) drawLabel(ctx, w, h, step, getMeta(step));
        }

        function updateInfo() {
            var step = state.steps[state.index];
            var info = getMeta(step);
            if (stepTitle) stepTitle.textContent = step ? info.name : emptyTitle;
            if (stepPrinciple) stepPrinciple.textContent = step ? (info.explain || info.caption || '') : emptyPrinciple;
            if (progressText) {
                progressText.textContent = step ? progressPrefix + ' ' + (state.index + 1) + '/' + state.steps.length + ' · ' + info.name : '-';
            }
        }

        function buildProgress() {
            if (!progressDots) return;
            progressDots.innerHTML = '';
            if (!state.steps.length) return;
            state.steps.forEach(function(_, idx) {
                var dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'progress-dot' + (idx < state.index ? ' done' : '') + (idx === state.index ? ' current' : '');
                dot.setAttribute('aria-label', progressPrefix + ' ' + (idx + 1));
                dot.addEventListener('click', function() {
                    setIndex(idx, true);
                    state.playing = false;
                    updateAll();
                    animateTransition();
                });
                progressDots.appendChild(dot);
                if (idx < state.steps.length - 1) {
                    var line = document.createElement('span');
                    line.className = 'progress-line' + (idx < state.index ? ' done' : '');
                    progressDots.appendChild(line);
                }
            });
        }

        function updateControls() {
            var has = state.steps.length > 0;
            if (playPauseBtn) {
                playPauseBtn.disabled = !has;
                playPauseBtn.textContent = state.playing ? pauseText : playText;
            }
            if (stepBackBtn) stepBackBtn.disabled = !has || state.index <= 0;
            if (stepFwdBtn) stepFwdBtn.disabled = !has || state.index >= state.steps.length - 1;
            if (speedLabel) speedLabel.textContent = state.speed.toFixed(2).replace(/0$/, '').replace(/\.$/, '') + 'x';
        }

        function updateAll() {
            drawFrame();
            updateInfo();
            buildProgress();
            updateControls();
        }

        function animateTransition() {
            if (state.playing) return;
            if (state.transitionRaf) {
                cancelAnimationFrame(state.transitionRaf);
                state.transitionRaf = null;
            }
            function frame(timestamp) {
                drawFrame(timestamp);
                if (state.transitionProgress < 1) {
                    state.transitionRaf = requestAnimationFrame(frame);
                } else {
                    state.transitionRaf = null;
                }
            }
            state.transitionRaf = requestAnimationFrame(frame);
        }

        function stopLoop() {
            state.playing = false;
            if (state.raf) {
                cancelAnimationFrame(state.raf);
                state.raf = null;
            }
            updateControls();
        }

        function loop(timestamp) {
            if (!state.playing) {
                state.raf = null;
                return;
            }
            drawFrame(timestamp);
            if (!state.lastTick) state.lastTick = timestamp;
            if (timestamp - state.lastTick >= 1150 / Math.max(0.25, state.speed)) {
                state.lastTick = timestamp;
                if (state.index >= state.steps.length - 1) {
                    stopLoop();
                    updateAll();
                    return;
                }
                setIndex(state.index + 1, true);
                updateInfo();
                buildProgress();
                updateControls();
            }
            state.raf = requestAnimationFrame(loop);
        }

        function play() {
            if (!state.steps.length) return;
            if (state.index >= state.steps.length - 1) setIndex(0, false);
            state.playing = true;
            state.lastTick = 0;
            updateControls();
            if (!state.raf) state.raf = requestAnimationFrame(loop);
        }

        function load(steps) {
            stopLoop();
            state.steps = steps || [];
            state.images = state.steps.map(function(step) {
                var img = new Image();
                img.onload = drawFrame;
                img.src = step.image;
                return img;
            });
            state.index = 0;
            state.prevIndex = -1;
            state.transitionProgress = 1;
            state.transitionStart = 0;
            updateAll();
        }

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', function() {
                state.playing ? stopLoop() : play();
            });
        }
        if (stepBackBtn) {
            stepBackBtn.addEventListener('click', function() {
                if (state.index > 0) {
                    setIndex(state.index - 1, true);
                    state.playing = false;
                    updateAll();
                    animateTransition();
                }
            });
        }
        if (stepFwdBtn) {
            stepFwdBtn.addEventListener('click', function() {
                if (state.index < state.steps.length - 1) {
                    setIndex(state.index + 1, true);
                    state.playing = false;
                    updateAll();
                    animateTransition();
                }
            });
        }
        if (speedSlider) {
            speedSlider.addEventListener('input', function() {
                state.speed = Number(speedSlider.value || 0.75);
                updateControls();
            });
        }
        window.addEventListener('resize', drawFrame);
        updateAll();
        return { load: load, stop: stopLoop, draw: drawFrame };
    }

    window.FeaturePlayback = { create: create };
})();
