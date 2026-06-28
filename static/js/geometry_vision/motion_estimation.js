(function () {
    const root = document.querySelector(".motion-lab");
    if (!root) return;

    const MOTION_MS = 680;
    const $ = (selector, base = root) => base.querySelector(selector);
    const $$ = (selector, base = root) => [...base.querySelectorAll(selector)];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
    const fmtSigned = (value, digits = 1) => {
        const number = Number(value || 0);
        return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
    };

    const stepSets = {
        constraint: [
            {id: "pair", title: "双帧输入 / Frame Pair", detail: "观察同一局部 patch 在两帧之间移动。"},
            {id: "brightness", title: "亮度恒定 / Brightness Constancy", detail: "同一物理点在相邻帧中的亮度近似不变。"},
            {id: "gradients", title: "梯度计算 / Gradients", detail: "Ix、Iy、It 把亮度变化分解为空间和时间方向。"},
            {id: "constraint", title: "光流约束 / Flow Constraint", detail: "Ix u + Iy v + It = 0 在 u-v 平面上是一条约束线。"},
            {id: "aperture", title: "孔径问题 / Aperture Problem", detail: "单个像素只有一个约束，无法唯一确定二维运动。"},
        ],
        lk: [
            {id: "feature", title: "特征点 / Select Feature", detail: "选中角点、边缘、平坦区或纹理区作为追踪点。"},
            {id: "window", title: "局部窗口 / Local Window", detail: "窗口内像素共享同一个局部位移。"},
            {id: "gradients", title: "矩阵构建 / Gradients", detail: "每个像素贡献一行 [Ix, Iy] 和一个 -It。"},
            {id: "leastSquares", title: "最小二乘 / Least Squares", detail: "用 A^T A v = A^T b 求最小二乘光流。"},
            {id: "vector", title: "光流向量 / Flow Vector", detail: "从当前特征点伸展出估计的 u、v 向量。"},
            {id: "confidence", title: "可跟踪性 / Confidence", detail: "角点区域两个方向约束都强，跟踪更稳定。"},
        ],
        pyramid: [
            {id: "build", title: "图像金字塔 / Pyramid", detail: "把原始图像逐层降采样，构造多尺度表示。"},
            {id: "coarse", title: "粗层估计 / Coarse Estimate", detail: "先在最高层估计缩小后的 apparent motion。"},
            {id: "upsample", title: "位移上采样 / Upsample Flow", detail: "把上一层位移放大两倍，作为下一层初值。"},
            {id: "refine", title: "细层修正 / Refine", detail: "在更高分辨率中用 LK 做局部修正。"},
            {id: "final", title: "最终轨迹 / Final Track", detail: "所有层级修正合并为原图上的最终轨迹。"},
        ],
    };

    function setText(selector, value, base = root) {
        const el = typeof selector === "string" ? $(selector, base) : selector;
        if (el) el.textContent = value;
    }

    function setHtml(selector, value, base = root) {
        const el = typeof selector === "string" ? $(selector, base) : selector;
        if (el) el.innerHTML = value;
    }

    let mathTimer = 0;
    function typesetMath(base = root) {
        if (!window.MathJax?.typesetPromise) return;
        window.clearTimeout(mathTimer);
        mathTimer = window.setTimeout(() => {
            try {
                window.MathJax.typesetClear?.([base]);
                window.MathJax.typesetPromise([base]).catch(() => {});
            } catch (error) {
                // MathJax is decorative for formulas; keep UI usable if CDN is unavailable.
            }
        }, 0);
    }

    function pulse(el) {
        if (!el) return;
        el.classList.remove("is-pulsing");
        void el.offsetWidth;
        el.classList.add("is-pulsing");
        window.setTimeout(() => el.classList.remove("is-pulsing"), MOTION_MS);
    }

    function renderPreview(container, steps, activeId) {
        if (!container) return;
        container.innerHTML = steps.map((step, index) => `
            <article class="${step.id === activeId ? "is-active" : ""}">
                <span>${index + 1}</span>
                <div><strong>${step.title}</strong><small>${step.detail}</small></div>
            </article>
        `).join("");
    }

    function updateStepper(kind, activeId) {
        const steps = stepSets[kind] || [];
        const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
        $$(`[data-motion-stepper="${kind}"] [data-motion-phase]`).forEach((item) => {
            const index = steps.findIndex((step) => step.id === item.dataset.motionPhase);
            item.classList.toggle("is-active", item.dataset.motionPhase === activeId);
            item.classList.toggle("is-complete", index >= 0 && index < activeIndex);
        });
        const select = $(`[data-motion-step-select="${kind}"]`);
        if (select && select.value !== activeId) select.value = activeId;
    }

    function bindStepControls(kind, state, render) {
        const steps = stepSets[kind] || [];
        const select = $(`[data-motion-step-select="${kind}"]`);
        select?.addEventListener("change", () => {
            state.step = select.value;
            render(true);
        });

        $$(`[data-motion-stepper="${kind}"] [data-motion-phase]`).forEach((item) => {
            item.addEventListener("click", () => {
                state.step = item.dataset.motionPhase;
                render(true);
            });
        });

        const move = (delta) => {
            const current = Math.max(0, steps.findIndex((step) => step.id === state.step));
            state.step = steps[(current + delta + steps.length) % steps.length].id;
            render(true);
        };

        $(`[data-motion-prev="${kind}"]`)?.addEventListener("click", () => move(-1));
        $(`[data-motion-next="${kind}"]`)?.addEventListener("click", () => move(1));
        const play = $(`[data-motion-play="${kind}"]`);
        play?.addEventListener("click", () => {
            if (state.timer) {
                window.clearInterval(state.timer);
                state.timer = 0;
                play.textContent = "播放流程";
                return;
            }
            play.textContent = "暂停播放";
            move(1);
            state.timer = window.setInterval(() => move(1), 1180);
        });
    }

    function markerDefs() {
        return `
            <defs>
                <marker id="motion-arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#0891b2"></path>
                </marker>
                <marker id="motion-arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed"></path>
                </marker>
                <marker id="motion-arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"></path>
                </marker>
            </defs>
        `;
    }

    function gridLines(width, height, step) {
        const lines = [];
        for (let x = step; x < width; x += step) {
            lines.push(`<line class="motion-grid-line" x1="${x}" y1="0" x2="${x}" y2="${height}"></line>`);
        }
        for (let y = step; y < height; y += step) {
            lines.push(`<line class="motion-grid-line" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`);
        }
        return lines.join("");
    }

    function objectShape(sample, x, y, accentClass = "") {
        if (sample === "texture") {
            return `
                <g transform="translate(${x + 54} ${y + 40}) rotate(18)">
                    <rect class="motion-object motion-object--accent ${accentClass}" x="-46" y="-32" width="92" height="64" rx="16"></rect>
                    <path d="M-36 -20 C-12 10, 6 -34, 34 18" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.72"></path>
                    <path d="M-34 22 C-8 -12, 14 34, 38 -10" fill="none" stroke="#1d4ed8" stroke-width="3" opacity="0.5"></path>
                </g>
            `;
        }
        if (sample === "object") {
            return `
                <rect class="motion-object ${accentClass}" x="${x}" y="${y + 18}" width="104" height="58" rx="24"></rect>
                <circle class="motion-object motion-object--teal ${accentClass}" cx="${x + 34}" cy="${y + 82}" r="13"></circle>
                <circle class="motion-object motion-object--teal ${accentClass}" cx="${x + 80}" cy="${y + 82}" r="13"></circle>
            `;
        }
        if (sample === "camera") {
            return `
                <path class="motion-object motion-object--teal ${accentClass}" d="M${x} ${y + 78} L${x + 38} ${y + 20} L${x + 76} ${y + 78} Z"></path>
                <rect class="motion-object motion-object--accent ${accentClass}" x="${x + 88}" y="${y + 36}" width="76" height="58" rx="14"></rect>
            `;
        }
        return `<rect class="motion-object ${accentClass}" x="${x}" y="${y}" width="110" height="86" rx="18"></rect>`;
    }

    function initFlowConstraintPage() {
        if (!$("[data-motion-flow]")) return;
        const state = {step: "pair", timer: 0};
        const inputs = {};
        $$("[data-motion-flow-input]").forEach((input) => {
            inputs[input.dataset.motionFlowInput] = input;
        });

        const samples = {
            block: {label: "平移方块", ix: 0.62, iy: 0.38, base: 118, pixel: [42, 37]},
            texture: {label: "旋转纹理", ix: -0.46, iy: 0.74, base: 132, pixel: [49, 31]},
            object: {label: "前景物体移动", ix: 0.54, iy: -0.42, base: 124, pixel: [45, 42]},
            camera: {label: "相机平移", ix: 0.36, iy: 0.68, base: 112, pixel: [51, 36]},
        };

        function readConfig() {
            return {
                sample: inputs.sample?.value || "block",
                dx: Number(inputs.dx?.value || 0),
                dy: Number(inputs.dy?.value || 0),
                noise: Number(inputs.noise?.value || 0),
                showDiff: inputs.showDiff?.checked !== false,
                showSpatial: inputs.showSpatial?.checked !== false,
                showTemporal: inputs.showTemporal?.checked !== false,
                showLine: inputs.showLine?.checked !== false,
                showTruth: inputs.showTruth?.checked !== false,
            };
        }

        function flowValues(config) {
            const sample = samples[config.sample] || samples.block;
            const ix = sample.ix + config.noise * 0.08;
            const iy = sample.iy - config.noise * 0.06;
            const it = -(ix * config.dx + iy * config.dy) + config.noise * 0.35;
            return {sample, ix, iy, it};
        }

        function renderFrameSvg(config, values, secondFrame) {
            const width = 360;
            const height = 250;
            const dx = secondFrame ? config.dx * 4.2 : 0;
            const dy = secondFrame ? config.dy * 4.2 : 0;
            const x = 112 + dx;
            const y = 78 + dy;
            const patchX = 142 + dx;
            const patchY = 102 + dy;
            const diff = config.showDiff && secondFrame
                ? `<rect class="motion-diff-zone" x="${112}" y="${78}" width="${Math.abs(dx) + 112}" height="${Math.abs(dy) + 88}" rx="18"></rect>`
                : "";
            const gradients = config.showSpatial
                ? `
                    <line class="motion-gradient-line" x1="${patchX + 22}" y1="${patchY + 22}" x2="${patchX + 62}" y2="${patchY + 22}"></line>
                    <line class="motion-gradient-line" x1="${patchX + 22}" y1="${patchY + 22}" x2="${patchX + 22}" y2="${patchY - 20}"></line>
                    <text x="${patchX + 67}" y="${patchY + 26}" fill="#d97706" font-size="11" font-weight="850">Ix</text>
                    <text x="${patchX + 26}" y="${patchY - 24}" fill="#d97706" font-size="11" font-weight="850">Iy</text>
                `
                : "";
            const temporal = config.showTemporal
                ? `<text x="20" y="226" fill="#0e7490" font-size="12" font-weight="850">It = ${fmt(values.it, 2)} from frame difference</text>`
                : "";
            const vector = config.showTruth && secondFrame
                ? `<line class="motion-vector-truth" x1="166" y1="126" x2="${166 + config.dx * 4.2}" y2="${126 + config.dy * 4.2}"></line>`
                : "";
            const pairMarks = config.showSpatial
                ? `
                    <circle class="motion-pixel-probe motion-pixel-probe--x" cx="${patchX + 14}" cy="${patchY + 24}" r="5"></circle>
                    <circle class="motion-pixel-probe motion-pixel-probe--x" cx="${patchX + 34}" cy="${patchY + 24}" r="5"></circle>
                    <circle class="motion-pixel-probe motion-pixel-probe--y" cx="${patchX + 24}" cy="${patchY + 14}" r="5"></circle>
                    <circle class="motion-pixel-probe motion-pixel-probe--y" cx="${patchX + 24}" cy="${patchY + 34}" r="5"></circle>
                `
                : "";
            const temporalMark = config.showTemporal
                ? `<circle class="motion-pixel-probe motion-pixel-probe--t" cx="${patchX + 24}" cy="${patchY + 24}" r="9"></circle>`
                : "";

            return `
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${secondFrame ? "Frame t+1" : "Frame t"}">
                    ${markerDefs()}
                    <rect class="motion-frame-bg" x="16" y="14" width="328" height="214" rx="18"></rect>
                    ${gridLines(width, height, 24)}
                    ${diff}
                    ${objectShape(config.sample, x, y)}
                    <rect class="motion-patch-box" x="${patchX}" y="${patchY}" width="48" height="48" rx="8"></rect>
                    ${pairMarks}
                    ${temporalMark}
                    ${gradients}
                    ${vector}
                    <circle class="motion-point" cx="${patchX + 24}" cy="${patchY + 24}" r="6"></circle>
                    <text x="26" y="38" fill="#1d4ed8" font-size="13" font-weight="900">${secondFrame ? "t + 1" : "t"} · ${values.sample.label}</text>
                    ${temporal}
                </svg>
            `;
        }

        function renderConstraintSvg(config, values) {
            const centerX = 180;
            const centerY = 124;
            const scale = 8.2;
            const mapX = (u) => centerX + u * scale;
            const mapY = (v) => centerY - v * scale;
            let line = "";
            if (config.showLine) {
                if (Math.abs(values.iy) > 0.05) {
                    const u1 = -15;
                    const u2 = 15;
                    const v1 = (-values.it - values.ix * u1) / values.iy;
                    const v2 = (-values.it - values.ix * u2) / values.iy;
                    line = `<line class="motion-constraint-line" x1="${mapX(u1)}" y1="${mapY(v1)}" x2="${mapX(u2)}" y2="${mapY(v2)}"></line>`;
                } else {
                    const u = -values.it / Math.max(values.ix, 0.05);
                    line = `<line class="motion-constraint-line" x1="${mapX(u)}" y1="28" x2="${mapX(u)}" y2="220"></line>`;
                }
            }
            const truth = config.showTruth
                ? `<line class="motion-vector-truth" x1="${centerX}" y1="${centerY}" x2="${mapX(config.dx)}" y2="${mapY(config.dy)}"></line><circle class="motion-point" cx="${mapX(config.dx)}" cy="${mapY(config.dy)}" r="5"></circle>`
                : "";
            const candidates = [-8, 0, 8].map((u, index) => {
                const v = Math.abs(values.iy) > 0.05 ? (-values.it - values.ix * u) / values.iy : config.dy + (index - 1) * 3;
                const label = ["A", "B", "C"][index];
                return `
                    <circle class="motion-candidate-point" cx="${mapX(u)}" cy="${mapY(v)}" r="4"></circle>
                    <text class="motion-candidate-label" x="${mapX(u) + 6}" y="${mapY(v) - 5}">${label}</text>
                `;
            }).join("");
            return `
                <svg viewBox="0 0 360 250" role="img" aria-label="u-v 平面上的光流约束线">
                    ${markerDefs()}
                    <rect class="motion-frame-bg" x="18" y="16" width="324" height="212" rx="18"></rect>
                    ${gridLines(360, 250, 25)}
                    <line class="motion-axis" x1="34" y1="${centerY}" x2="326" y2="${centerY}"></line>
                    <line class="motion-axis" x1="${centerX}" y1="28" x2="${centerX}" y2="220"></line>
                    ${line}
                    ${state.step === "aperture" ? candidates : ""}
                    ${truth}
                    <text class="motion-constraint-label" x="286" y="${centerY - 8}">u</text>
                    <text class="motion-constraint-label" x="${centerX + 8}" y="38">v</text>
                    <text x="28" y="44" fill="#1d4ed8" font-size="12" font-weight="900">constraint line</text>
                    <text x="28" y="216" fill="#64748b" font-size="11">true motion must lie on this line when assumptions hold</text>
                </svg>
            `;
        }

        function renderPatch(values, config) {
            const cells = [];
            for (let row = 0; row < 5; row += 1) {
                for (let col = 0; col < 5; col += 1) {
                    const centered = row === 2 && col === 2;
                    const xPair = row === 2 && (col === 1 || col === 3);
                    const yPair = col === 2 && (row === 1 || row === 3);
                    const temporal = centered && state.step === "gradients";
                    const value = values.sample.base + (col - 2) * values.ix * 14 + (row - 2) * values.iy * 14 + Math.sin(row * 4 + col * 7) * config.noise * 9;
                    cells.push(`<span class="motion-patch-cell ${centered ? "is-center" : ""} ${xPair ? "is-x-pair" : ""} ${yPair ? "is-y-pair" : ""} ${temporal ? "is-temporal" : ""}">${Math.round(value)}</span>`);
                }
            }
            return cells.join("");
        }

        const notes = {
            pair: [
                ["运动场", "真实三维运动投影到图像平面后形成 motion field。"],
                ["光流", "光流是从亮度变化估计出的二维像素运动，可能与真实运动不完全一致。"],
            ],
            brightness: [
                ["亮度恒定", "假设同一个物理点在相邻帧中亮度近似不变。"],
                ["微小移动", "把 I(x + u, y + v, t + 1) 做一阶泰勒展开，得到线性约束。"],
            ],
            gradients: [
                ["Ix / Iy", "空间梯度描述亮度在水平和垂直方向的变化。"],
                ["It", "时间梯度描述当前像素在两帧之间的亮度变化。"],
            ],
            constraint: [
                ["一条约束线", "Ix u + Iy v + It = 0 在 u-v 平面上不是一个点，而是一条线。"],
                ["真实位移", "满足亮度恒定时，真实位移向量落在这条约束线上。"],
            ],
            aperture: [
                ["孔径问题", "沿边缘方向移动时，局部窗口看到的亮度变化可能相同。"],
                ["需要更多假设", "Lucas-Kanade 使用局部窗口空间一致性，把多个像素约束合并求解。"],
            ],
        };

        function render(animated) {
            const config = readConfig();
            const values = flowValues(config);
            setText('[data-motion-flow-output="dx"]', fmtSigned(config.dx, 0));
            setText('[data-motion-flow-output="dy"]', fmtSigned(config.dy, 0));
            setText('[data-motion-flow-output="noise"]', fmt(config.noise, 1));
            setText('[data-motion-flow-summary="pixel"]', `(${values.sample.pixel[0]}, ${values.sample.pixel[1]})`);
            setText('[data-motion-flow-summary="truth"]', `\\(u=${fmt(config.dx, 1)},\\ v=${fmt(config.dy, 1)}\\)`);
            setText('[data-motion-flow-summary="equation"]', `\\(${fmt(values.ix, 2)}u ${values.iy >= 0 ? "+" : "-"} ${fmt(Math.abs(values.iy), 2)}v ${values.it >= 0 ? "+" : "-"} ${fmt(Math.abs(values.it), 2)}=0\\)`);
            setText('[data-motion-flow-summary="note"]', state.step === "aperture" ? "需要局部窗口约束" : "单像素约束不足");
            setText('[data-motion-flow-chip="step"]', stepSets.constraint.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-motion-flow-chip="vector"]', `u=${fmt(config.dx, 1)}, v=${fmt(config.dy, 1)}`);
            setText('[data-motion-flow-chip="gradient"]', `Ix=${fmt(values.ix, 2)}, Iy=${fmt(values.iy, 2)}, It=${fmt(values.it, 2)}`);
            const equation = `${fmt(values.ix, 2)}u ${values.iy >= 0 ? "+" : "-"} ${fmt(Math.abs(values.iy), 2)}v ${values.it >= 0 ? "+" : "-"} ${fmt(Math.abs(values.it), 2)} = 0`;
            const rhsEquation = `${fmt(values.ix, 2)}u ${values.iy >= 0 ? "+" : "-"} ${fmt(Math.abs(values.iy), 2)}v = ${fmt(-values.it, 2)}`;
            setText("[data-motion-flow-substitution]", `\\(I_x=${fmt(values.ix, 2)},\\ I_y=${fmt(values.iy, 2)},\\ I_t=${fmt(values.it, 2)}\\Rightarrow ${rhsEquation}\\)`);
            setText("[data-motion-flow-gradient-micro]", `\\[
\\begin{aligned}
I(x,y,t)&=${Math.round(values.sample.base)}\\\\
I_x&=I(x+1,y,t)-I(x-1,y,t)=${fmt(values.ix, 2)}\\\\
I_y&=I(x,y+1,t)-I(x,y-1,t)=${fmt(values.iy, 2)}\\\\
I_t&=I(x,y,t+1)-I(x,y,t)=${fmt(values.it, 2)}\\\\
${equation}
\\end{aligned}
\\]`);
            setText("[data-motion-flow-current-equation]", `\\(${equation}\\)`);
            setText("[data-motion-flow-brightness]", `\\(I(${values.sample.pixel[0]},${values.sample.pixel[1]},t)\\approx I(${values.sample.pixel[0]}+u,${values.sample.pixel[1]}+v,t+1)\\)`);
            setText("[data-motion-flow-formula-note]", state.step === "brightness" ? "亮度恒定让两帧匹配可以被写成同一个像素亮度方程。" : "微小移动假设把非线性匹配近似成线性方程。");
            setText("[data-motion-flow-notes-title]", stepSets.constraint.find((step) => step.id === state.step)?.title || "Frame Pair");

            setHtml('[data-motion-flow-frame="t"]', renderFrameSvg(config, values, false));
            setHtml('[data-motion-flow-frame="t1"]', renderFrameSvg(config, values, true));
            setHtml("[data-motion-flow-constraint]", renderConstraintSvg(config, values));
            setHtml("[data-motion-flow-patch]", renderPatch(values, config));
            setHtml("[data-motion-flow-notes]", (notes[state.step] || notes.pair).map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderPreview($("[data-motion-flow-preview]"), stepSets.constraint, state.step);
            updateStepper("constraint", state.step);
            typesetMath($("[data-motion-flow]"));
            if (animated) pulse($(".motion-notes-panel"));
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => render(true));
        });
        bindStepControls("constraint", state, render);
        render(false);
    }

    function initLucasKanadePage() {
        if (!$("[data-motion-lk]")) return;
        const state = {step: "feature", timer: 0};
        const inputs = {};
        $$("[data-motion-lk-input]").forEach((input) => {
            inputs[input.dataset.motionLkInput] = input;
        });
        const samples = {
            corner: {label: "角点追踪", flow: [4.4, 2.1], confidence: 0.92, gx: 0.72, gy: 0.66, condition: "stable corner", note: "两个方向梯度都强，A^T A 稳定。"},
            edge: {label: "边缘区域", flow: [3.8, 0.4], confidence: 0.42, gx: 0.82, gy: 0.08, condition: "edge-like", note: "一个特征值大、一个特征值小，沿边缘方向不稳定。"},
            flat: {label: "平坦区域", flow: [1.2, 0.8], confidence: 0.18, gx: 0.09, gy: 0.07, condition: "flat region", note: "两个特征值都小，纹理不足，无法稳定跟踪。"},
            texture: {label: "纹理区域", flow: [3.2, 2.8], confidence: 0.78, gx: 0.58, gy: 0.54, condition: "textured patch", note: "多个方向有纹理，窗口约束较可靠。"},
        };

        function readConfig() {
            return {
                sample: inputs.sample?.value || "corner",
                windowSize: Number(inputs.windowSize?.value || 5),
                iterations: Number(inputs.iterations?.value || 3),
                featureMode: inputs.featureMode?.value || "manual",
                showWindow: inputs.showWindow?.checked !== false,
                showA: inputs.showA?.checked !== false,
                showB: inputs.showB?.checked !== false,
                showSolution: inputs.showSolution?.checked !== false,
                showConfidence: inputs.showConfidence?.checked !== false,
            };
        }

        function lkValues(config) {
            const sample = samples[config.sample] || samples.corner;
            const windowBoost = Math.min(config.windowSize, 7) * 0.012;
            const iterBoost = config.iterations * 0.018;
            const confidence = clamp(sample.confidence + windowBoost + iterBoost - (config.sample === "flat" ? 0.05 : 0), 0.08, 0.98);
            const flow = [
                sample.flow[0] * (0.92 + config.iterations * 0.025),
                sample.flow[1] * (0.92 + config.iterations * 0.025),
            ];
            return {sample, confidence, flow};
        }

        function gradientRows(values, count = 8) {
            const rows = [];
            for (let i = 0; i < count; i += 1) {
                const sx = Math.sin(i * 1.7);
                const sy = Math.cos(i * 1.3);
                const ix = values.sample.gx * (0.75 + sx * 0.24);
                const iy = values.sample.gy * (0.76 + sy * 0.22);
                const b = ix * values.flow[0] + iy * values.flow[1];
                rows.push({ix, iy, b});
            }
            return rows;
        }

        function normalStats(rows) {
            const ata00 = rows.reduce((sum, row) => sum + row.ix * row.ix, 0);
            const ata01 = rows.reduce((sum, row) => sum + row.ix * row.iy, 0);
            const ata11 = rows.reduce((sum, row) => sum + row.iy * row.iy, 0);
            const atb0 = rows.reduce((sum, row) => sum + row.ix * row.b, 0);
            const atb1 = rows.reduce((sum, row) => sum + row.iy * row.b, 0);
            const det = ata00 * ata11 - ata01 * ata01;
            const trace = ata00 + ata11;
            const root = Math.sqrt(Math.max(0, (ata00 - ata11) ** 2 + 4 * ata01 * ata01));
            const l1 = (trace + root) / 2;
            const l2 = (trace - root) / 2;
            const solU = Math.abs(det) < 0.0001 ? 0 : (ata11 * atb0 - ata01 * atb1) / det;
            const solV = Math.abs(det) < 0.0001 ? 0 : (-ata01 * atb0 + ata00 * atb1) / det;
            const condition = l2 <= 0.0001 ? 999 : l1 / l2;
            return {ata00, ata01, ata11, atb0, atb1, det, l1, l2, condition, solU, solV};
        }

        function matrixText(rows, config, kind) {
            if (kind === "a" && !config.showA) return "A 矩阵已隐藏";
            if (kind === "b" && !config.showB) return "b 向量已隐藏";
            const activeRow = Math.min(rows.length - 1, Math.max(0, Math.floor(rows.length * 0.42)));
            if (kind === "a") return rows.slice(0, 8).map((row, index) => `${index === activeRow ? "▶ " : "  "}[${fmt(row.ix, 2)}, ${fmt(row.iy, 2)}]`).join("\n");
            if (kind === "b") return rows.slice(0, 8).map((row, index) => `${index === activeRow ? "▶ " : "  "}[${fmt(row.b, 2)}]`).join("\n");
            const stats = normalStats(rows);
            return `\\[
\\begin{aligned}
\\mathbf A^\\mathsf{T}\\mathbf A&=
\\begin{bmatrix}${fmt(stats.ata00, 2)}&${fmt(stats.ata01, 2)}\\\\${fmt(stats.ata01, 2)}&${fmt(stats.ata11, 2)}\\end{bmatrix}\\\\
\\mathbf A^\\mathsf{T}\\mathbf b&=
\\begin{bmatrix}${fmt(stats.atb0, 2)}\\\\${fmt(stats.atb1, 2)}\\end{bmatrix}\\\\
\\mathbf v&=(\\mathbf A^\\mathsf{T}\\mathbf A)^{-1}\\mathbf A^\\mathsf{T}\\mathbf b
=\\begin{bmatrix}${fmt(stats.solU, 2)}\\\\${fmt(stats.solV, 2)}\\end{bmatrix}
\\end{aligned}
\\]`;
        }

        function renderWindowCells(config, activeRow) {
            const cell = 10;
            const offset = Math.floor(config.windowSize / 2);
            const cells = [];
            for (let row = 0; row < config.windowSize; row += 1) {
                for (let col = 0; col < config.windowSize; col += 1) {
                    const index = row * config.windowSize + col;
                    const x = (col - offset) * cell - cell / 2;
                    const y = (row - offset) * cell - cell / 2;
                    cells.push(`<rect class="motion-lk-window-cell ${index === activeRow ? "is-active" : ""}" x="${x}" y="${y}" width="${cell - 1}" height="${cell - 1}" rx="2"></rect>`);
                }
            }
            return cells.join("");
        }

        function renderLkFrames(config, values, activeRow) {
            const [u, v] = values.flow;
            const sx = config.featureMode === "auto" ? 124 : 112;
            const sy = config.featureMode === "auto" ? 126 : 144;
            const ex = sx + u * 7;
            const ey = sy + v * 7;
            const window = config.showWindow
                ? `<rect class="motion-patch-box" x="${sx - config.windowSize * 6}" y="${sy - config.windowSize * 6}" width="${config.windowSize * 12}" height="${config.windowSize * 12}" rx="8"></rect>`
                : "";
            return `
                <svg viewBox="0 0 520 310" role="img" aria-label="Lucas-Kanade 局部窗口">
                    ${markerDefs()}
                    <rect class="motion-frame-bg" x="24" y="30" width="210" height="220" rx="18"></rect>
                    <rect class="motion-frame-bg" x="286" y="30" width="210" height="220" rx="18"></rect>
                    ${gridLines(520, 310, 24)}
                    ${objectShape(config.sample === "flat" ? "block" : config.sample === "edge" ? "camera" : "texture", 72, 98)}
                    ${objectShape(config.sample === "flat" ? "block" : config.sample === "edge" ? "camera" : "texture", 72 + u * 7 + 262, 98 + v * 7)}
                    ${window}
                    <g transform="translate(${sx} ${sy})">${renderWindowCells(config, activeRow)}</g>
                    <rect class="motion-patch-box" x="${ex - config.windowSize * 6}" y="${ey - config.windowSize * 6}" width="${config.windowSize * 12}" height="${config.windowSize * 12}" rx="8"></rect>
                    <circle class="motion-feature-point" cx="${sx}" cy="${sy}" r="7"></circle>
                    <circle class="motion-feature-point" cx="${ex}" cy="${ey}" r="7"></circle>
                    <line class="motion-vector-truth" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}"></line>
                    <text x="38" y="56" fill="#1d4ed8" font-size="12" font-weight="900">Frame t</text>
                    <text x="300" y="56" fill="#1d4ed8" font-size="12" font-weight="900">Frame t+1</text>
                    <text x="36" y="284" fill="#64748b" font-size="11">${values.sample.label} · ${config.windowSize}x${config.windowSize} window</text>
                </svg>
            `;
        }

        function renderLkResult(config, values, stats) {
            const confidence = Math.round(values.confidence * 100);
            const [u, v] = values.flow;
            const unstable = values.confidence < 0.5;
            const solution = config.showSolution
                ? `<line class="motion-vector-truth ${unstable ? "is-unstable" : ""}" x1="102" y1="128" x2="${102 + u * 18}" y2="${128 - v * 18}"></line><circle class="motion-point" cx="${102 + u * 18}" cy="${128 - v * 18}" r="5"></circle>`
                : "";
            const confidenceBlock = config.showConfidence
                ? `
                    <rect x="34" y="224" width="260" height="16" rx="8" fill="#e2e8f0"></rect>
                    <rect x="34" y="224" width="${2.6 * confidence}" height="16" rx="8" fill="url(#lk-confidence)"></rect>
                    <text x="34" y="268" fill="#172554" font-size="14" font-weight="900">confidence ${confidence}%</text>
                `
                : "";
            return `
                <svg viewBox="0 0 330 310" role="img" aria-label="Lucas-Kanade 光流向量和置信度">
                    ${markerDefs()}
                    <defs>
                        <linearGradient id="lk-confidence" x1="0" x2="1">
                            <stop offset="0" stop-color="#22c55e"></stop>
                            <stop offset="0.55" stop-color="#0891b2"></stop>
                            <stop offset="1" stop-color="#7c3aed"></stop>
                        </linearGradient>
                    </defs>
                    <rect class="motion-frame-bg" x="24" y="24" width="282" height="262" rx="18"></rect>
                    ${gridLines(330, 310, 24)}
                    <line class="motion-axis" x1="48" y1="128" x2="272" y2="128"></line>
                    <line class="motion-axis" x1="102" y1="48" x2="102" y2="206"></line>
                    <circle class="motion-feature-point" cx="102" cy="128" r="7"></circle>
                    ${solution}
                    ${confidenceBlock}
                    <text x="34" y="50" fill="#1d4ed8" font-size="12" font-weight="900">${values.sample.condition}</text>
                    <text x="34" y="72" fill="#64748b" font-size="11">λ1=${fmt(stats.l1, 2)}, λ2=${fmt(stats.l2, 2)}, cond=${fmt(stats.condition, 1)}</text>
                    <text x="34" y="92" fill="#64748b" font-size="11">v = [${fmt(u, 2)}, ${fmt(v, 2)}]ᵀ</text>
                </svg>
            `;
        }

        const notes = {
            feature: [
                ["特征点选择", "LK 更适合角点或纹理点，因为两个方向都有可观测亮度变化。"],
                ["边缘和平坦区", "边缘存在孔径问题，平坦区梯度弱，都会降低可跟踪性。"],
            ],
            window: [
                ["空间一致性", "假设窗口内所有像素有同一个位移向量。"],
                ["多像素约束", "窗口中 N 个像素提供 N 条线性方程，通常 N 远大于 2。"],
            ],
            gradients: [
                ["A 矩阵", "每一行是一个像素的 [Ix, Iy]。"],
                ["b 向量", "每一行是 -It，即时间亮度变化的相反数。"],
            ],
            leastSquares: [
                ["正规方程", "A^T A v = A^T b 把超定方程组转为二维线性系统。"],
                ["稳定性", "A^T A 两个特征值都大时，解对噪声更稳定。"],
            ],
            vector: [
                ["光流向量", "解出的 u、v 表示当前特征点从 t 到 t+1 的二维位移。"],
                ["迭代 LK", "实际跟踪会多次重采样 patch，逐步修正位移。"],
            ],
            confidence: [
                ["可跟踪性", "角点置信度最高，边缘方向不完整，平坦区几乎不可解。"],
                ["条件数直觉", "A^T A 越接近奇异，运动估计越容易被噪声主导。"],
            ],
        };

        function render(animated) {
            const config = readConfig();
            const values = lkValues(config);
            const rows = gradientRows(values, Math.max(8, config.windowSize * config.windowSize));
            const pixels = config.windowSize * config.windowSize;
            const activeRow = Math.min(rows.length - 1, Math.max(0, Math.floor(rows.length * 0.42)));
            const stats = normalStats(rows);
            const active = rows[activeRow] || rows[0];
            setText('[data-motion-lk-output="iterations"]', config.iterations);
            setText('[data-motion-lk-summary="pixels"]', `${pixels}`);
            setText('[data-motion-lk-summary="rows"]', `${pixels} rows`);
            setText('[data-motion-lk-summary="flow"]', `\\(\\mathbf v=[${fmt(values.flow[0], 2)},${fmt(values.flow[1], 2)}]^\\mathsf{T}\\)`);
            setText('[data-motion-lk-summary="quality"]', `${Math.round(values.confidence * 100)}%`);
            setText('[data-motion-lk-chip="step"]', stepSets.lk.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-motion-lk-chip="window"]', `${config.windowSize}x${config.windowSize} window`);
            setText('[data-motion-lk-chip="condition"]', values.sample.condition);
            setText("[data-motion-lk-notes-title]", stepSets.lk.find((step) => step.id === state.step)?.title || "Lucas-Kanade");
            setText("[data-motion-lk-formula-note]", values.sample.note);
            setText("[data-motion-lk-single-equation]", `\\(${fmt(active.ix, 2)}u + ${fmt(active.iy, 2)}v = ${fmt(active.b, 2)}\\)`);
            setText("[data-motion-lk-solution]", config.showSolution ? `\\(\\mathbf v=(\\mathbf A^\\mathsf{T}\\mathbf A)^{-1}\\mathbf A^\\mathsf{T}\\mathbf b=\\begin{bmatrix}${fmt(stats.solU, 2)}\\\\${fmt(stats.solV, 2)}\\end{bmatrix}\\)` : "最小二乘解已隐藏");
            setText("[data-motion-lk-active-row]", `\\(\\text{row }${activeRow + 1}/${pixels}:\\ [${fmt(active.ix, 2)},${fmt(active.iy, 2)}]\\mathbf v=${fmt(active.b, 2)}\\)`);
            setText('[data-motion-lk-eigen="l1"]', fmt(stats.l1, 2));
            setText('[data-motion-lk-eigen="l2"]', fmt(stats.l2, 2));
            setText("[data-motion-lk-confidence-label]", `${values.sample.condition} · ${Math.round(values.confidence * 100)}%`);
            setText("[data-motion-lk-confidence-note]", values.confidence < 0.3 ? "纹理不足，AᵀA 近似奇异，结果向量淡化。" : values.confidence < 0.55 ? "边缘方向约束弱，沿边缘方向不稳定。" : "两个方向梯度都明显，最小二乘解稳定。");
            const maxEigen = Math.max(stats.l1, 0.01);
            const l1Fill = $('[data-motion-lk-eigen-fill="l1"]');
            const l2Fill = $('[data-motion-lk-eigen-fill="l2"]');
            if (l1Fill) l1Fill.style.width = "100%";
            if (l2Fill) l2Fill.style.width = `${clamp(stats.l2 / maxEigen * 100, 4, 100)}%`;
            setHtml("[data-motion-lk-frames]", renderLkFrames(config, values, activeRow));
            setHtml("[data-motion-lk-result]", renderLkResult(config, values, stats));
            setText('[data-motion-lk-matrix="a"]', matrixText(rows, config, "a"));
            setText('[data-motion-lk-matrix="b"]', matrixText(rows, config, "b"));
            setText('[data-motion-lk-matrix="normal"]', matrixText(rows, config, "normal"));

            const activeMatrix = state.step === "gradients" ? ["a", "b", "row"] : state.step === "leastSquares" ? ["normal"] : state.step === "confidence" ? ["normal"] : [];
            $$("[data-motion-lk-matrix-card]").forEach((card) => {
                const active = activeMatrix.includes(card.dataset.motionLkMatrixCard);
                card.classList.toggle("is-active", active);
                if (active && animated) pulse(card);
            });
            setHtml("[data-motion-lk-notes]", (notes[state.step] || notes.feature).map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderPreview($("[data-motion-lk-preview]"), stepSets.lk, state.step);
            updateStepper("lk", state.step);
            typesetMath($("[data-motion-lk]"));
            if (animated) pulse($(".motion-notes-panel"));
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => render(true));
        });
        bindStepControls("lk", state, render);
        render(false);
    }

    function initPyramidPage() {
        if (!$("[data-motion-pyramid]")) return;
        const state = {step: "build", timer: 0};
        const inputs = {};
        $$("[data-motion-pyramid-input]").forEach((input) => {
            inputs[input.dataset.motionPyramidInput] = input;
        });
        const samples = {
            small: {label: "小位移", flow: [6, 3], residual: 0.9, note: "单层 LK 基本可以处理，但金字塔仍能展示分层细化。"},
            large: {label: "大位移", flow: [18, 10], residual: 3.2, note: "原图位移过大，直接 LK 容易跳出局部窗口。"},
            fast: {label: "快速运动", flow: [24, -8], residual: 4.1, note: "高层先捕获大方向，再逐层修正局部误差。"},
            rotate: {label: "旋转运动", flow: [14, 13], residual: 2.7, note: "金字塔能降低 apparent motion，但旋转仍需要局部近似。"},
        };

        function readConfig() {
            return {
                sample: inputs.sample?.value || "small",
                levels: Number(inputs.levels?.value || 3),
                iterations: Number(inputs.iterations?.value || 3),
                windowSize: Number(inputs.windowSize?.value || 7),
                showPyramid: inputs.showPyramid?.checked !== false,
                showPath: inputs.showPath?.checked !== false,
                showAccumulated: inputs.showAccumulated?.checked !== false,
                showTrack: inputs.showTrack?.checked !== false,
            };
        }

        function activeLayerIndex(config) {
            if (state.step === "build" || state.step === "coarse") return config.levels - 1;
            if (state.step === "upsample" || state.step === "refine") return Math.max(0, config.levels - 2);
            return 0;
        }

        function levelRows(config, sample) {
            const rows = [];
            let carried = [0, 0];
            for (let level = config.levels - 1; level >= 0; level -= 1) {
                const scale = Math.pow(2, level);
                const apparent = [sample.flow[0] / scale, sample.flow[1] / scale];
                const order = config.levels - 1 - level;
                const correction = [
                    (apparent[0] - carried[0]) * clamp(0.58 + config.iterations * 0.06, 0.58, 0.94),
                    (apparent[1] - carried[1]) * clamp(0.58 + config.iterations * 0.06, 0.58, 0.94),
                ];
                const g = [carried[0] + correction[0], carried[1] + correction[1]];
                const residual = sample.residual * Math.pow(0.52, order) / Math.max(1, config.iterations * 0.38);
                rows.push({level, scale, apparent, d: correction, g, residual});
                carried = [g[0] * 2, g[1] * 2];
            }
            return rows;
        }

        function renderOriginalSvg(config, sample) {
            const start = {x: 98, y: 142};
            const end = {x: start.x + sample.flow[0] * 5.2, y: start.y + sample.flow[1] * 5.2};
            const fail = {
                x: start.x + sample.flow[0] * 3.0 + sample.residual * 6,
                y: start.y + sample.flow[1] * 3.0 - sample.residual * 3,
            };
            const track = config.showTrack
                ? `<polyline class="motion-vector-truth" points="${start.x},${start.y} ${start.x + sample.flow[0] * 2.1},${start.y + sample.flow[1] * 2.1} ${end.x},${end.y}" fill="none"></polyline>`
                : "";
            return `
                <svg viewBox="0 0 420 310" role="img" aria-label="原始图像上的最终轨迹">
                    ${markerDefs()}
                    <rect class="motion-frame-bg" x="26" y="28" width="368" height="242" rx="18"></rect>
                    ${gridLines(420, 310, 25)}
                    ${objectShape(config.sample === "rotate" ? "texture" : "object", 82, 96)}
                    ${objectShape(config.sample === "rotate" ? "texture" : "object", 82 + sample.flow[0] * 5.2, 96 + sample.flow[1] * 5.2, "is-ghost")}
                    <circle class="motion-feature-point" cx="${start.x}" cy="${start.y}" r="7"></circle>
                    <line class="motion-fail-line" x1="${start.x}" y1="${start.y}" x2="${fail.x}" y2="${fail.y}"></line>
                    <circle class="motion-fail-point" cx="${fail.x}" cy="${fail.y}" r="5"></circle>
                    ${track}
                    <circle class="motion-point" cx="${end.x}" cy="${end.y}" r="6"></circle>
                    <text x="38" y="54" fill="#1d4ed8" font-size="12" font-weight="900">${sample.label}</text>
                    <text x="38" y="286" fill="#64748b" font-size="11">gray-red: single LK drift · blue-purple: pyramid track</text>
                </svg>
            `;
        }

        function renderPyramidStack(config, rows) {
            if (!config.showPyramid) {
                return "<div class=\"motion-pyramid-layer\"><strong>金字塔已隐藏</strong><span>打开开关后显示 coarse-to-fine 层级</span></div>";
            }
            const activeLevel = activeLayerIndex(config);
            return rows.map((row) => {
                const width = 54 + (config.levels - row.level) * 34;
                const active = row.level === activeLevel;
                const complete = row.level > activeLevel || state.step === "final";
                return `
                    <article class="motion-pyramid-layer ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}" style="width:${width}%">
                        <strong>L${row.level} · scale 1/${row.scale}</strong>
                        <span>apparent [${fmt(row.apparent[0], 2)}, ${fmt(row.apparent[1], 2)}] · d(L)=[${fmt(row.d[0], 2)}, ${fmt(row.d[1], 2)}]</span>
                        <span>g(L)=[${fmt(row.g[0], 2)}, ${fmt(row.g[1], 2)}] · residual ${fmt(row.residual, 2)} px</span>
                    </article>
                `;
            }).join("");
        }

        function renderPyramidResultSvg(config, sample, rows) {
            const activeLevel = activeLayerIndex(config);
            const accumulated = config.showAccumulated
                ? `<line class="motion-vector-truth" x1="84" y1="118" x2="${84 + sample.flow[0] * 4.5}" y2="${118 - sample.flow[1] * 4.5}"></line>`
                : "";
            const path = config.showPath
                ? rows.map((row, index) => {
                    const y = 202 + index * 18;
                    const w = clamp(180 * (1 - row.residual / Math.max(sample.residual, 0.1)), 18, 180);
                    return `
                        <text x="38" y="${y + 8}" fill="#64748b" font-size="10" font-weight="850">L${row.level}</text>
                        <rect x="68" y="${y}" width="180" height="9" rx="5" fill="#e2e8f0"></rect>
                        <rect x="68" y="${y}" width="${w}" height="9" rx="5" fill="${row.level === activeLevel ? "#7c3aed" : "#0891b2"}"></rect>
                        <text x="260" y="${y + 8}" fill="#334155" font-size="10">${fmt(row.residual, 2)} px</text>
                    `;
                }).join("")
                : "";
            return `
                <svg viewBox="0 0 360 310" role="img" aria-label="累计位移和残差变化">
                    ${markerDefs()}
                    <rect class="motion-frame-bg" x="24" y="24" width="312" height="262" rx="18"></rect>
                    ${gridLines(360, 310, 24)}
                    <line class="motion-axis" x1="52" y1="118" x2="290" y2="118"></line>
                    <line class="motion-axis" x1="84" y1="48" x2="84" y2="178"></line>
                    <circle class="motion-feature-point" cx="84" cy="118" r="7"></circle>
                    ${accumulated}
                    <text x="36" y="50" fill="#1d4ed8" font-size="12" font-weight="900">accumulated flow</text>
                    <text x="36" y="184" fill="#64748b" font-size="11">g(L-1)=2·(g(L)+d(L)); residual decreases by level</text>
                    ${path}
                </svg>
            `;
        }

        const notes = {
            build: [
                ["构建金字塔", "每层把图像降采样，最高层中同样的真实位移会变成更小的 apparent motion。"],
                ["微小移动假设", "位移缩小后更容易落入 LK 的局部线性近似范围。"],
            ],
            coarse: [
                ["最高层估计", "先在最低分辨率层求一个粗略方向。"],
                ["大位移入口", "这一层不追求最终精度，只要把方向拉回可收敛范围。"],
            ],
            upsample: [
                ["放大位移", "从 Lk 到 Lk-1 时，位移向量需要乘以 2。"],
                ["作为初值", "放大的结果作为下一层 LK 的初始估计。"],
            ],
            refine: [
                ["逐层修正", "更高分辨率提供更多细节，用局部窗口修正残差。"],
                ["残差下降", "每一层只解决剩下的小误差。"],
            ],
            final: [
                ["最终轨迹", "所有层级的位移和修正合并到原图坐标系。"],
                ["适用边界", "金字塔不解决所有非刚性、遮挡和剧烈旋转问题，但显著提升大位移鲁棒性。"],
            ],
        };

        function render(animated) {
            const config = readConfig();
            const sample = samples[config.sample] || samples.small;
            const rows = levelRows(config, sample);
            const coarse = rows[0]?.apparent || [0, 0];
            const finalResidual = rows[rows.length - 1]?.residual || 0;
            setText('[data-motion-pyramid-output="iterations"]', config.iterations);
            setText('[data-motion-pyramid-summary="coarse"]', `\\([${fmt(coarse[0], 2)},${fmt(coarse[1], 2)}]\\)`);
            setText('[data-motion-pyramid-summary="accumulated"]', `\\([${fmt(sample.flow[0], 1)},${fmt(sample.flow[1], 1)}]\\)`);
            setText('[data-motion-pyramid-summary="residual"]', `${fmt(finalResidual, 2)} px`);
            setText('[data-motion-pyramid-summary="status"]', state.step === "final" ? "轨迹已合并" : "逐层估计中");
            setText('[data-motion-pyramid-chip="step"]', stepSets.pyramid.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-motion-pyramid-chip="levels"]', `${config.levels} levels`);
            setText('[data-motion-pyramid-chip="flow"]', `[${fmt(sample.flow[0], 1)}, ${fmt(sample.flow[1], 1)}]`);
            setText("[data-motion-pyramid-notes-title]", stepSets.pyramid.find((step) => step.id === state.step)?.title || "Pyramid");
            const activeLayer = rows.find((row) => row.level === activeLayerIndex(config)) || rows[0];
            setText("[data-motion-pyramid-formula-note]", `L${activeLayer.level}: g=[${fmt(activeLayer.g[0], 2)}, ${fmt(activeLayer.g[1], 2)}], d=[${fmt(activeLayer.d[0], 2)}, ${fmt(activeLayer.d[1], 2)}], residual=${fmt(activeLayer.residual, 2)}px`);
            setText("[data-motion-pyramid-apparent-note]", `原图位移 [${fmt(sample.flow[0], 1)}, ${fmt(sample.flow[1], 1)}] 在 L${rows[0].level} 变为 [${fmt(rows[0].apparent[0], 2)}, ${fmt(rows[0].apparent[1], 2)}]。`);
            setText("[data-motion-pyramid-single-fail]", `直接单层估计 residual ${fmt(sample.residual, 2)}px，轨迹容易偏离。`);
            setText("[data-motion-pyramid-success]", `最终 residual ${fmt(finalResidual, 2)}px，逐层修正后吸附到目标。`);
            setText("[data-motion-pyramid-layer-state]", `\\[
\\begin{aligned}
${rows.map((row) => `L_${row.level}:\\ \\mathbf g=[${fmt(row.g[0], 2)},${fmt(row.g[1], 2)}],\\ \\mathbf d=[${fmt(row.d[0], 2)},${fmt(row.d[1], 2)}],\\ r=${fmt(row.residual, 2)}\\text{px}`).join("\\\\\n")}
\\end{aligned}
\\]`);
            setHtml("[data-motion-pyramid-original]", renderOriginalSvg(config, sample));
            setHtml("[data-motion-pyramid-stack]", renderPyramidStack(config, rows));
            setHtml("[data-motion-pyramid-result]", renderPyramidResultSvg(config, sample, rows));
            setHtml("[data-motion-pyramid-notes]", (notes[state.step] || notes.build).map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderPreview($("[data-motion-pyramid-preview]"), stepSets.pyramid, state.step);
            updateStepper("pyramid", state.step);
            typesetMath($("[data-motion-pyramid]"));
            if (animated) pulse($(".motion-notes-panel"));
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => render(true));
        });
        bindStepControls("pyramid", state, render);
        render(false);
    }

    function initRealFlowPage() {
        const stage = $("[data-motion-real]");
        if (!stage) return;

        const video = $("[data-motion-real-video]", stage);
        const layout = $("[data-motion-real-layout]", stage);
        const sourceCanvas = $('[data-motion-real-canvas="source"]', stage);
        const denseCanvas = $('[data-motion-real-canvas="dense"]', stage);
        const sparseCanvas = $('[data-motion-real-canvas="sparse"]', stage);
        const sourceCtx = sourceCanvas?.getContext("2d", {willReadFrequently: true});
        const denseCtx = denseCanvas?.getContext("2d");
        const sparseCtx = sparseCanvas?.getContext("2d");
        const inputs = {};
        $$("[data-motion-real-input]", stage).forEach((input) => {
            inputs[input.dataset.motionRealInput] = input;
        });
        const actions = {};
        $$("[data-motion-real-action]", stage).forEach((button) => {
            actions[button.dataset.motionRealAction] = button;
        });

        const work = document.createElement("canvas");
        const workCtx = work.getContext("2d", {willReadFrequently: true});
        const overlay = document.createElement("canvas");
        const overlayCtx = overlay.getContext("2d");
        const state = {
            running: false,
            prevGray: null,
            prevImage: null,
            points: [],
            width: 480,
            height: 270,
            lastVideoTime: -1,
            lastMetricAt: performance.now(),
            frames: 0,
            fps: 0,
            meanMag: 0,
            selectedVector: null,
            lastImage: null,
            lastDense: [],
            lastConfig: null,
            raf: 0,
        };

        function metric(name, value) {
            setText(`[data-motion-real-metric="${name}"]`, value, stage);
        }

        function chip(name, value) {
            setText(`[data-motion-real-chip="${name}"]`, value, stage);
        }

        function setStateText(value) {
            setText("[data-motion-real-state]", value, stage);
        }

        function setActiveLog(index) {
            $$("[data-motion-real-log] article", stage).forEach((item, itemIndex) => {
                item.classList.toggle("is-active", itemIndex === index);
            });
        }

        function setVectorField(name, value) {
            setText(`[data-motion-real-vector="${name}"]`, value, stage);
        }

        function updateInspector(vector) {
            if (!vector) {
                setVectorField("point", "--");
                setVectorField("gray0", "--");
                setVectorField("gray1", "--");
                setVectorField("uv", "--");
                setVectorField("mag", "--");
                setVectorField("angle", "--");
                setVectorField("track", "--");
                setVectorField("status", "等待选择");
                return;
            }
            const dx = Number(vector.dx || 0);
            const dy = Number(vector.dy || 0);
            const mag = Math.hypot(dx, dy);
            const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
            setVectorField("point", `(${Math.round(vector.x)}, ${Math.round(vector.y)})`);
            setVectorField("gray0", fmt(vector.gray0, 1));
            setVectorField("gray1", fmt(vector.gray1, 1));
            setVectorField("uv", `[${fmt(dx, 2)}, ${fmt(dy, 2)}]`);
            setVectorField("mag", `${fmt(mag, 2)} px`);
            setVectorField("angle", `${fmt(angle, 1)}°`);
            setVectorField("track", `${vector.trail?.length || 1} 帧`);
            setVectorField("status", `${Math.round((vector.confidence || 0.66) * 100)}% valid`);
            setText("[data-motion-real-vector-note]", `当前点 (${Math.round(vector.x)}, ${Math.round(vector.y)}) 的估计位移为 [${fmt(dx, 2)}, ${fmt(dy, 2)}]。`, stage);
        }

        function parseResolution() {
            const value = inputs.resolution?.value || "480x270";
            const [width, height] = value.split("x").map((part) => Number(part));
            return {width: width || 480, height: height || 270};
        }

        function config() {
            const res = parseResolution();
            return {
                mode: inputs.mode?.value || "both",
                width: res.width,
                height: res.height,
                density: Number(inputs.density?.value || 18),
                gain: Number(inputs.gain?.value || 3),
                trail: Number(inputs.trail?.value || 18),
                showHsv: inputs.showHsv?.checked !== false,
                showArrows: inputs.showArrows?.checked !== false,
                showTracks: inputs.showTracks?.checked !== false,
                autoFeatures: inputs.autoFeatures?.checked !== false,
            };
        }

        function updateLayout(mode) {
            if (!layout) return;
            const activeMode = mode === "dense" || mode === "sparse" ? mode : "both";
            layout.dataset.flowMode = activeMode;
            $$("[data-motion-real-view]", layout).forEach((card) => {
                const view = card.dataset.motionRealView;
                const isHidden = (activeMode === "dense" && view === "sparse")
                    || (activeMode === "sparse" && view === "dense");
                card.hidden = isHidden;
                card.setAttribute("aria-hidden", isHidden ? "true" : "false");
            });
        }

        function resize(width, height) {
            if (state.width === width && state.height === height && denseCanvas.width === width) return;
            state.width = width;
            state.height = height;
            [sourceCanvas, denseCanvas, sparseCanvas, work, overlay].forEach((canvas) => {
                canvas.width = width;
                canvas.height = height;
            });
            state.prevGray = null;
            state.prevImage = null;
            state.points = [];
            chip("resolution", `${width} × ${height}`);
        }

        function drawPlaceholder(canvas, text) {
            const ctx = canvas?.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width || 480, canvas.height || 270);
            ctx.fillStyle = "#f8fafc";
            ctx.fillRect(0, 0, canvas.width || 480, canvas.height || 270);
            ctx.fillStyle = "#64748b";
            ctx.font = "700 14px Arial, Microsoft YaHei, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(text, (canvas.width || 480) / 2, (canvas.height || 270) / 2);
        }

        function grayFromImage(imageData) {
            const src = imageData.data;
            const gray = new Float32Array(imageData.width * imageData.height);
            for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
                gray[i] = src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114;
            }
            return gray;
        }

        function captureFrame(cfg) {
            resize(cfg.width, cfg.height);
            workCtx.drawImage(video, 0, 0, cfg.width, cfg.height);
            const image = workCtx.getImageData(0, 0, cfg.width, cfg.height);
            return {image, gray: grayFromImage(image)};
        }

        function patchSad(prev, curr, width, x, y, dx, dy, radius) {
            let sad = 0;
            for (let yy = -radius; yy <= radius; yy += 1) {
                const pRow = (y + yy) * width;
                const cRow = (y + yy + dy) * width;
                for (let xx = -radius; xx <= radius; xx += 1) {
                    sad += Math.abs(prev[pRow + x + xx] - curr[cRow + x + xx + dx]);
                }
            }
            return sad;
        }

        function hslToRgb(h, s, l) {
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const hp = h / 60;
            const x = c * (1 - Math.abs((hp % 2) - 1));
            let r = 0;
            let g = 0;
            let b = 0;
            if (hp < 1) [r, g, b] = [c, x, 0];
            else if (hp < 2) [r, g, b] = [x, c, 0];
            else if (hp < 3) [r, g, b] = [0, c, x];
            else if (hp < 4) [r, g, b] = [0, x, c];
            else if (hp < 5) [r, g, b] = [x, 0, c];
            else [r, g, b] = [c, 0, x];
            const m = l - c / 2;
            return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
        }

        function denseVectors(prev, curr, width, height, cfg) {
            const vectors = [];
            const radius = 3;
            const search = Math.max(4, Math.round(cfg.density / 3));
            const margin = radius + search + 1;
            let magSum = 0;
            let magCount = 0;
            for (let y = margin; y < height - margin; y += cfg.density) {
                for (let x = margin; x < width - margin; x += cfg.density) {
                    let best = Infinity;
                    let bestDx = 0;
                    let bestDy = 0;
                    for (let dy = -search; dy <= search; dy += 1) {
                        for (let dx = -search; dx <= search; dx += 1) {
                            const sad = patchSad(prev, curr, width, x, y, dx, dy, radius);
                            if (sad < best) {
                                best = sad;
                                bestDx = dx;
                                bestDy = dy;
                            }
                        }
                    }
                    const mag = Math.hypot(bestDx, bestDy);
                    if (mag > 0.18) {
                        const confidence = clamp(1 - best / ((radius * 2 + 1) ** 2 * 96), 0.18, 0.98);
                        vectors.push({type: "dense", x, y, dx: bestDx, dy: bestDy, mag, gray0: prev[y * width + x], gray1: curr[y * width + x], confidence, trail: [{x, y}, {x: x + bestDx, y: y + bestDy}]});
                        magSum += mag;
                        magCount += 1;
                    }
                }
            }
            return {vectors, mean: magCount ? magSum / magCount : 0};
        }

        function renderDense(image, vectors, cfg) {
            denseCtx.putImageData(image, 0, 0);
            if (cfg.showHsv) {
                const out = denseCtx.createImageData(state.width, state.height);
                const cell = cfg.density;
                vectors.forEach((vector) => {
                    const angle = (Math.atan2(vector.dy, vector.dx) * 180 / Math.PI + 360) % 360;
                    const light = clamp(0.34 + Math.min(vector.mag / 8, 0.46), 0.34, 0.8);
                    const [r, g, b] = hslToRgb(angle, 0.82, light);
                    const left = Math.max(0, vector.x - Math.floor(cell / 2));
                    const right = Math.min(state.width, vector.x + Math.ceil(cell / 2));
                    const top = Math.max(0, vector.y - Math.floor(cell / 2));
                    const bottom = Math.min(state.height, vector.y + Math.ceil(cell / 2));
                    for (let y = top; y < bottom; y += 1) {
                        for (let x = left; x < right; x += 1) {
                            const p = (y * state.width + x) * 4;
                            out.data[p] = r;
                            out.data[p + 1] = g;
                            out.data[p + 2] = b;
                            out.data[p + 3] = 118;
                        }
                    }
                });
                overlayCtx.clearRect(0, 0, state.width, state.height);
                overlayCtx.putImageData(out, 0, 0);
                denseCtx.drawImage(overlay, 0, 0);
            }
            if (cfg.showArrows) {
                denseCtx.save();
                denseCtx.strokeStyle = "#facc15";
                denseCtx.fillStyle = "#ffffff";
                denseCtx.lineWidth = 1.2;
                vectors.forEach((vector) => {
                    const x2 = vector.x + vector.dx * cfg.gain;
                    const y2 = vector.y + vector.dy * cfg.gain;
                    const angle = Math.atan2(y2 - vector.y, x2 - vector.x);
                    denseCtx.beginPath();
                    denseCtx.moveTo(vector.x, vector.y);
                    denseCtx.lineTo(x2, y2);
                    denseCtx.stroke();
                    denseCtx.beginPath();
                    denseCtx.moveTo(x2, y2);
                    denseCtx.lineTo(x2 - Math.cos(angle - 0.7) * 5, y2 - Math.sin(angle - 0.7) * 5);
                    denseCtx.lineTo(x2 - Math.cos(angle + 0.7) * 5, y2 - Math.sin(angle + 0.7) * 5);
                    denseCtx.closePath();
                    denseCtx.fillStyle = "#facc15";
                    denseCtx.fill();
                    denseCtx.fillStyle = "#ffffff";
                    denseCtx.fillRect(vector.x - 1, vector.y - 1, 2, 2);
                });
                denseCtx.restore();
            }
            if (state.selectedVector && state.selectedVector.type === "dense") {
                const vector = state.selectedVector;
                denseCtx.save();
                denseCtx.strokeStyle = "#fb7185";
                denseCtx.fillStyle = "#fb7185";
                denseCtx.lineWidth = 2.5;
                denseCtx.beginPath();
                denseCtx.arc(vector.x, vector.y, 7, 0, Math.PI * 2);
                denseCtx.stroke();
                denseCtx.beginPath();
                denseCtx.moveTo(vector.x, vector.y);
                denseCtx.lineTo(vector.x + vector.dx * cfg.gain, vector.y + vector.dy * cfg.gain);
                denseCtx.stroke();
                denseCtx.restore();
            }
        }

        function sample(gray, width, height, x, y) {
            if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
            const x0 = Math.floor(x);
            const y0 = Math.floor(y);
            const ax = x - x0;
            const ay = y - y0;
            const i = y0 * width + x0;
            const a = gray[i];
            const b = gray[i + 1];
            const c = gray[i + width];
            const d = gray[i + width + 1];
            return a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + c * (1 - ax) * ay + d * ax * ay;
        }

        function detectFeatures(gray, width, height) {
            const candidates = [];
            const radius = 3;
            for (let y = 10; y < height - 10; y += 3) {
                for (let x = 10; x < width - 10; x += 3) {
                    let sx2 = 0;
                    let sy2 = 0;
                    let sxy = 0;
                    for (let yy = -radius; yy <= radius; yy += 1) {
                        const row = (y + yy) * width;
                        for (let xx = -radius; xx <= radius; xx += 1) {
                            const p = row + x + xx;
                            const gx = gray[p + 1] - gray[p - 1];
                            const gy = gray[p + width] - gray[p - width];
                            sx2 += gx * gx;
                            sy2 += gy * gy;
                            sxy += gx * gy;
                        }
                    }
                    const trace = sx2 + sy2;
                    const det = sx2 * sy2 - sxy * sxy;
                    const score = det - 0.04 * trace * trace;
                    if (score > 150000) candidates.push({x, y, score});
                }
            }
            candidates.sort((a, b) => b.score - a.score);
            const points = [];
            const minDistance = 12;
            for (const candidate of candidates) {
                if (points.length >= 140) break;
                if (points.every((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) >= minDistance)) {
                    const hue = (points.length * 47) % 360;
                    const [r, g, b] = hslToRgb(hue, 0.82, 0.56);
                    points.push({x: candidate.x, y: candidate.y, trail: [{x: candidate.x, y: candidate.y}], color: `rgb(${r}, ${g}, ${b})`});
                }
            }
            return points;
        }

        function trackPoint(prev, curr, width, height, point) {
            const radius = 5;
            let u = 0;
            let v = 0;
            if (point.x < 14 || point.y < 14 || point.x > width - 14 || point.y > height - 14) return null;
            for (let iter = 0; iter < 4; iter += 1) {
                let sx2 = 0;
                let sy2 = 0;
                let sxy = 0;
                let sxt = 0;
                let syt = 0;
                for (let yy = -radius; yy <= radius; yy += 1) {
                    for (let xx = -radius; xx <= radius; xx += 1) {
                        const px = point.x + xx;
                        const py = point.y + yy;
                        const qx = px + u;
                        const qy = py + v;
                        if (qx < 2 || qy < 2 || qx >= width - 2 || qy >= height - 2) return null;
                        const ix = (sample(curr, width, height, qx + 1, qy) - sample(curr, width, height, qx - 1, qy)) * 0.5;
                        const iy = (sample(curr, width, height, qx, qy + 1) - sample(curr, width, height, qx, qy - 1)) * 0.5;
                        const it = sample(curr, width, height, qx, qy) - sample(prev, width, height, px, py);
                        sx2 += ix * ix;
                        sy2 += iy * iy;
                        sxy += ix * iy;
                        sxt += ix * it;
                        syt += iy * it;
                    }
                }
                const det = sx2 * sy2 - sxy * sxy;
                if (det < 0.0001) return null;
                const du = (-sxt * sy2 + sxy * syt) / det;
                const dv = (sxy * sxt - sx2 * syt) / det;
                if (!Number.isFinite(du) || !Number.isFinite(dv)) return null;
                u += clamp(du, -4, 4);
                v += clamp(dv, -4, 4);
                if (Math.hypot(du, dv) < 0.03) break;
                if (Math.hypot(u, v) > 18) return null;
            }
            const next = {x: point.x + u, y: point.y + v};
            if (next.x < 2 || next.y < 2 || next.x >= width - 2 || next.y >= height - 2) return null;
            return next;
        }

        function updateSparse(prevGray, currGray, image, cfg) {
            if (!state.points.length || (cfg.autoFeatures && state.points.length < 28)) {
                state.points = detectFeatures(prevGray, state.width, state.height);
            }
            const nextPoints = [];
            for (const point of state.points) {
                const next = trackPoint(prevGray, currGray, state.width, state.height, point);
                if (!next) continue;
                const trail = point.trail.concat(next).slice(-cfg.trail);
                const dx = next.x - point.x;
                const dy = next.y - point.y;
                nextPoints.push({
                    type: "sparse",
                    x: next.x,
                    y: next.y,
                    dx,
                    dy,
                    gray0: sample(prevGray, state.width, state.height, point.x, point.y),
                    gray1: sample(currGray, state.width, state.height, next.x, next.y),
                    confidence: clamp(1 - Math.hypot(dx, dy) / 20, 0.18, 0.96),
                    trail,
                    color: point.color,
                });
            }
            state.points = nextPoints;
            renderSparse(image, cfg);
        }

        function renderSparse(image, cfg) {
            sparseCtx.putImageData(image, 0, 0);
            if (cfg.showTracks) {
                sparseCtx.save();
                sparseCtx.lineWidth = 1.35;
                for (const point of state.points) {
                    if (point.trail.length > 1) {
                        sparseCtx.strokeStyle = point.color;
                        sparseCtx.beginPath();
                        point.trail.forEach((entry, index) => {
                            if (index === 0) sparseCtx.moveTo(entry.x, entry.y);
                            else sparseCtx.lineTo(entry.x, entry.y);
                        });
                        sparseCtx.stroke();
                    }
                    sparseCtx.fillStyle = point.color;
                    sparseCtx.beginPath();
                    sparseCtx.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
                    sparseCtx.fill();
                }
                sparseCtx.restore();
            }
            if (state.selectedVector && state.selectedVector.type === "sparse") {
                const vector = state.selectedVector;
                sparseCtx.save();
                sparseCtx.strokeStyle = "#fb7185";
                sparseCtx.fillStyle = "#fb7185";
                sparseCtx.lineWidth = 2.3;
                sparseCtx.beginPath();
                if (vector.trail?.length > 1) {
                    vector.trail.forEach((entry, index) => {
                        if (index === 0) sparseCtx.moveTo(entry.x, entry.y);
                        else sparseCtx.lineTo(entry.x, entry.y);
                    });
                    sparseCtx.stroke();
                }
                sparseCtx.beginPath();
                sparseCtx.arc(vector.x, vector.y, 7, 0, Math.PI * 2);
                sparseCtx.stroke();
                sparseCtx.restore();
            }
        }

        function renderDisabled(image, canvas, label) {
            const ctx = canvas.getContext("2d");
            ctx.putImageData(image, 0, 0);
            ctx.fillStyle = "rgba(248, 250, 252, 0.72)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#334155";
            ctx.font = "800 15px Arial, Microsoft YaHei, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(label, canvas.width / 2, canvas.height / 2);
        }

        function drawSource(image) {
            if (!sourceCtx || !image) return;
            sourceCtx.putImageData(image, 0, 0);
            if (!state.selectedVector) return;
            const vector = state.selectedVector;
            sourceCtx.save();
            sourceCtx.strokeStyle = "#fb7185";
            sourceCtx.fillStyle = "rgba(251, 113, 133, 0.18)";
            sourceCtx.lineWidth = 2.4;
            sourceCtx.beginPath();
            sourceCtx.arc(vector.x, vector.y, 9, 0, Math.PI * 2);
            sourceCtx.fill();
            sourceCtx.stroke();
            sourceCtx.beginPath();
            sourceCtx.moveTo(vector.x, vector.y);
            sourceCtx.lineTo(vector.x + (vector.dx || 0) * 4, vector.y + (vector.dy || 0) * 4);
            sourceCtx.stroke();
            sourceCtx.restore();
        }

        function canvasPoint(event, canvas) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left) * canvas.width / Math.max(rect.width, 1),
                y: (event.clientY - rect.top) * canvas.height / Math.max(rect.height, 1),
            };
        }

        function nearestVector(vectors, point, limit) {
            let best = null;
            let bestDistance = limit;
            vectors.forEach((vector) => {
                const dist = Math.hypot(vector.x - point.x, vector.y - point.y);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    best = vector;
                }
            });
            return best;
        }

        function redrawLastFrame() {
            if (!state.lastImage || !state.lastConfig) return;
            drawSource(state.lastImage);
            if (state.lastConfig.mode !== "sparse") {
                renderDense(state.lastImage, state.lastDense, state.lastConfig);
            }
            if (state.lastConfig.mode !== "dense") {
                renderSparse(state.lastImage, state.lastConfig);
            }
        }

        function chooseVector(vector) {
            if (!vector) return;
            state.selectedVector = {...vector};
            updateInspector(state.selectedVector);
            redrawLastFrame();
        }

        function processFrame(force = false) {
            if (!video || video.readyState < 2) return;
            const cfg = config();
            updateLayout(cfg.mode);
            resize(cfg.width, cfg.height);
            if (!force && video.currentTime === state.lastVideoTime) return;
            state.lastVideoTime = video.currentTime;
            const start = performance.now();
            const current = captureFrame(cfg);
            state.lastImage = current.image;
            state.lastConfig = cfg;
            drawSource(current.image);
            if (!state.prevGray) {
                state.prevGray = current.gray;
                state.prevImage = current.image;
                denseCtx.putImageData(current.image, 0, 0);
                sparseCtx.putImageData(current.image, 0, 0);
                state.points = detectFeatures(current.gray, state.width, state.height);
                updateInspector(null);
                return;
            }

            let dense = {vectors: [], mean: 0};
            if (cfg.mode !== "sparse") {
                dense = denseVectors(state.prevGray, current.gray, state.width, state.height, cfg);
                state.lastDense = dense.vectors;
                renderDense(current.image, dense.vectors, cfg);
            } else {
                state.lastDense = [];
                renderDisabled(current.image, denseCanvas, "稠密光流已隐藏");
            }

            if (cfg.mode !== "dense") {
                updateSparse(state.prevGray, current.gray, current.image, cfg);
            } else {
                renderDisabled(current.image, sparseCanvas, "稀疏轨迹已隐藏");
            }

            if (!state.selectedVector) {
                chooseVector(dense.vectors[0] || state.points[0]);
            } else {
                const replacement = state.selectedVector.type === "dense"
                    ? nearestVector(dense.vectors, state.selectedVector, cfg.density * 1.3)
                    : nearestVector(state.points, state.selectedVector, 18);
                if (replacement) chooseVector(replacement);
                else updateInspector(state.selectedVector);
            }

            state.prevGray = current.gray;
            state.prevImage = current.image;
            state.meanMag = dense.mean;
            state.frames += 1;
            const now = performance.now();
            if (now - state.lastMetricAt > 650) {
                state.fps = state.frames * 1000 / (now - state.lastMetricAt);
                state.frames = 0;
                state.lastMetricAt = now;
            }
            metric("compute", `${fmt(performance.now() - start, 1)} ms`);
            metric("fps", fmt(state.fps, 1));
            metric("magnitude", `${fmt(state.meanMag, 2)} px`);
            metric("tracks", String(state.points.length));
            chip("status", state.running ? "实时计算中" : "已暂停");
            setStateText(`frame t=${fmt(video.currentTime, 2)}s · vectors=${dense.vectors.length} · tracks=${state.points.length}`);
            setActiveLog(3);
        }

        function loop() {
            if (state.running) processFrame(false);
            state.raf = window.requestAnimationFrame(loop);
        }

        function resetTracks() {
            state.prevGray = null;
            state.prevImage = null;
            state.points = [];
            state.lastVideoTime = -1;
            setStateText("轨迹已重置，下一帧重新检测角点");
            setActiveLog(1);
            processFrame(true);
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => {
                const cfg = config();
                updateLayout(cfg.mode);
                setText('[data-motion-real-output="density"]', cfg.density, stage);
                setText('[data-motion-real-output="gain"]', fmt(cfg.gain, 1), stage);
                setText('[data-motion-real-output="trail"]', cfg.trail, stage);
                if (input.dataset.motionRealInput === "resolution") resize(cfg.width, cfg.height);
                processFrame(true);
            });
        });

        actions.play?.addEventListener("click", () => {
            if (!video) return;
            if (state.running) {
                video.pause();
                state.running = false;
                actions.play.textContent = "播放";
                chip("status", "已暂停");
                setStateText("已暂停，画布保留最近一次计算结果");
                return;
            }
            video.play().then(() => {
                state.running = true;
                actions.play.textContent = "暂停";
                chip("status", "实时计算中");
                setActiveLog(3);
            }).catch(() => {
                setStateText("浏览器阻止自动播放，请再次点击播放");
            });
        });

        actions.step?.addEventListener("click", () => {
            if (!video || !Number.isFinite(video.duration)) return;
            video.pause();
            state.running = false;
            actions.play.textContent = "播放";
            video.currentTime = Math.min(video.duration - 0.04, video.currentTime + 1 / 30);
        });

        actions.reset?.addEventListener("click", resetTracks);

        denseCanvas?.addEventListener("mousemove", (event) => {
            const cfg = state.lastConfig || config();
            const vector = nearestVector(state.lastDense, canvasPoint(event, denseCanvas), cfg.density * 0.85);
            if (vector) chooseVector(vector);
        });

        sparseCanvas?.addEventListener("mousemove", (event) => {
            const vector = nearestVector(state.points, canvasPoint(event, sparseCanvas), 16);
            if (vector) chooseVector(vector);
        });

        video?.addEventListener("loadeddata", () => {
            const cfg = config();
            resize(cfg.width, cfg.height);
            processFrame(true);
            chip("status", "视频就绪");
            setStateText("视频已加载，自动开始播放");
            setActiveLog(1);
            // 页面打开后自动播放
            video.play().then(() => {
                state.running = true;
                if (actions.play) actions.play.textContent = "暂停";
                chip("status", "实时计算中");
                setActiveLog(3);
            }).catch(() => {
                setStateText("浏览器阻止自动播放，请手动点击播放");
            });
        });

        video?.addEventListener("seeked", () => processFrame(true));
        video?.addEventListener("error", () => {
            const text = "视频素材加载失败，请检查静态资源路径";
            [denseCanvas, sparseCanvas].forEach((canvas) => drawPlaceholder(canvas, text));
            setStateText(text);
            chip("status", "素材缺失");
        });

        window.addEventListener("beforeunload", () => {
            if (state.raf) window.cancelAnimationFrame(state.raf);
        });

        setText('[data-motion-real-output="density"]', inputs.density?.value || "18", stage);
        setText('[data-motion-real-output="gain"]', fmt(Number(inputs.gain?.value || 3), 1), stage);
        setText('[data-motion-real-output="trail"]', inputs.trail?.value || "18", stage);
        const initial = config();
        updateLayout(initial.mode);
        resize(initial.width, initial.height);
        drawPlaceholder(denseCanvas, "等待视频帧");
        drawPlaceholder(sparseCanvas, "等待视频帧");
        if (video) {
            const src = stage.dataset.videoSrc || "";
            video.src = window.cvclassUrl ? window.cvclassUrl(src) : src;
        }
        typesetMath(stage);
        state.raf = window.requestAnimationFrame(loop);
    }

    initFlowConstraintPage();
    initLucasKanadePage();
    initPyramidPage();
    initRealFlowPage();
}());
