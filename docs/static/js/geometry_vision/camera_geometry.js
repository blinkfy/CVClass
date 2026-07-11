(function () {
    const root = document.querySelector(".geometry-lab");
    if (!root) return;

    const MOTION_MS = 680;
    const CHECKERBOARD_IMAGE_URL = window.cvclassUrl
        ? window.cvclassUrl("/static/assets/img/checkerboard.png")
        : (window.CVCLASS_BASE_PATH||"")+"/static/assets/img/checkerboard.png";
    const CHECKERBOARD_SOURCE_SQUARES = 10;
    const $ = (selector, base = root) => base.querySelector(selector);
    const $$ = (selector, base = root) => [...base.querySelectorAll(selector)];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const rad = (deg) => (Number(deg) || 0) * Math.PI / 180;
    const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
    const fmtInt = (value) => String(Math.round(Number(value) || 0));

    const stepSets = {
        camera: [
            {id: "point", title: "三维点 / 3D Point", detail: "选中一个三维世界点，观察它相对光心的位置。"},
            {id: "center", title: "光心 / Camera Center", detail: "光心 O 是所有投影射线的共同起点。"},
            {id: "ray", title: "投影射线 / Projection Ray", detail: "三维点与光心连线穿过成像平面。"},
            {id: "plane", title: "成像平面 / Image Plane", detail: "焦距 f 决定成像平面到光心的距离和放大倍率。"},
            {id: "pixel", title: "像平面点 / Image Point", detail: "理想投影点落在成像平面坐标中。"},
        ],
        projection: [
            {id: "world", title: "世界坐标 / World Coordinate", detail: "Xw = [X,Y,Z,1]^T 描述点在世界坐标系中的位置。"},
            {id: "extrinsic", title: "外参变换 / Extrinsic Transform", detail: "R, t 把世界坐标变换到相机坐标系。"},
            {id: "camera", title: "相机坐标 / Camera Coordinate", detail: "Xc = R Xw + t，此时深度 Zc 决定透视缩放。"},
            {id: "intrinsic", title: "内参投影 / Intrinsic Projection", detail: "归一化平面经过 K 的缩放和平移得到像素坐标。"},
            {id: "pixel", title: "像素坐标 / Pixel Coordinate", detail: "s[u,v,1]^T = K[R|t]Xw 是最终图像坐标。"},
        ],
        calibration: [
            {id: "chessboard", title: "棋盘格标定板 / Chessboard", detail: "棋盘格提供已知尺寸的平面世界点。"},
            {id: "corners", title: "角点检测 / Corner Detection", detail: "在图像中检测每个黑白格交点的 2D 坐标。"},
            {id: "pairs", title: "3D-2D 对应 / 3D-2D Pairs", detail: "把世界角点和图像角点按顺序配对。"},
            {id: "solve", title: "参数求解 / Solve Params", detail: "多组对应关系共同约束 K、R、t 和畸变参数。"},
            {id: "reproject", title: "重投影 / Reprojection", detail: "用求得的参数把 3D 点重新投影回图像。"},
            {id: "error", title: "误差分析 / Error Analysis", detail: "检测点与重投影点之间的像素距离就是重投影误差。"},
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
                // Formula rendering is presentational; keep the lab usable if MathJax fails.
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

    function renderFlow(container, steps, activeId) {
        if (!container) return;
        container.innerHTML = steps.map((step, index) => `
            <article class="${step.id === activeId ? "is-active" : ""}" data-geo-flow-step="${step.id}" role="button" tabindex="0" aria-current="${step.id === activeId ? "step" : "false"}">
                <span>${index + 1}</span>
                <div><strong>${step.title}</strong><small>${step.detail}</small></div>
            </article>
        `).join("");
    }

    function renderStatusStrip(container, items) {
        if (!container) return;
        container.innerHTML = items.map((item, index) => `
            <section class="geo-status-cell ${item.active ? "is-active" : ""}">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
                <small>${item.detail || ""}</small>
                <i aria-hidden="true">${index + 1}</i>
            </section>
        `).join("");
    }

    function stepTitle(kind, activeId) {
        return (stepSets[kind] || []).find((step) => step.id === activeId)?.title || activeId;
    }

    function inImage(point) {
        return point && point.u >= 40 && point.u <= 600 && point.v >= 20 && point.v <= 400 && point.z > 0.2;
    }

    function updateStepper(kind, activeId) {
        const steps = stepSets[kind] || [];
        const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
        $$(`[data-geo-stepper="${kind}"] [data-geo-phase]`).forEach((item) => {
            const index = steps.findIndex((step) => step.id === item.dataset.geoPhase);
            item.classList.toggle("is-active", item.dataset.geoPhase === activeId);
            item.classList.toggle("is-complete", index >= 0 && index < activeIndex);
        });
        const select = $(`[data-geo-step-select="${kind}"]`);
        if (select && select.value !== activeId) select.value = activeId;
    }

    function bindStepControls(kind, state, render) {
        const steps = stepSets[kind] || [];
        const flowSelector = {
            camera: "[data-geo-camera-flow]",
            projection: "[data-geo-flow-preview]",
            calibration: "[data-geo-calib-flow]",
        }[kind];
        const select = $(`[data-geo-step-select="${kind}"]`);
        select?.addEventListener("change", () => {
            state.step = select.value;
            render(true);
        });

        $$(`[data-geo-stepper="${kind}"] [data-geo-phase]`).forEach((item) => {
            item.addEventListener("click", () => {
                state.step = item.dataset.geoPhase;
                render(true);
            });
        });

        $(flowSelector)?.addEventListener("click", (event) => {
            const item = event.target.closest("[data-geo-flow-step]");
            if (!item) return;
            state.step = item.dataset.geoFlowStep;
            render(true);
        });

        $(flowSelector)?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            const item = event.target.closest("[data-geo-flow-step]");
            if (!item) return;
            event.preventDefault();
            state.step = item.dataset.geoFlowStep;
            render(true);
        });

        const move = (delta) => {
            const current = Math.max(0, steps.findIndex((step) => step.id === state.step));
            state.step = steps[(current + delta + steps.length) % steps.length].id;
            render(true);
        };

        $(`[data-geo-prev="${kind}"]`)?.addEventListener("click", () => move(-1));
        $(`[data-geo-next="${kind}"]`)?.addEventListener("click", () => move(1));
        const play = $(`[data-geo-play="${kind}"]`);
        play?.addEventListener("click", () => {
            if (state.timer) {
                window.clearInterval(state.timer);
                state.timer = 0;
                play.textContent = "播放流程";
                return;
            }
            play.textContent = "暂停播放";
            move(1);
            state.timer = window.setInterval(() => move(1), 1150);
        });
    }

    function matrixMultiply(a, b) {
        return a.map((row) => b[0].map((_item, col) => row.reduce((sum, value, i) => sum + value * b[i][col], 0)));
    }

    function rotationMatrix(yaw, pitch, roll) {
        const cy = Math.cos(rad(yaw));
        const sy = Math.sin(rad(yaw));
        const cp = Math.cos(rad(pitch));
        const sp = Math.sin(rad(pitch));
        const cr = Math.cos(rad(roll));
        const sr = Math.sin(rad(roll));
        const rz = [[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]];
        const ry = [[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]];
        const rx = [[1, 0, 0], [0, cr, -sr], [0, sr, cr]];
        return matrixMultiply(rz, matrixMultiply(ry, rx));
    }

    function transformPoint(r, t, point) {
        return {
            x: r[0][0] * point.x + r[0][1] * point.y + r[0][2] * point.z + t.x,
            y: r[1][0] * point.x + r[1][1] * point.y + r[1][2] * point.z + t.y,
            z: r[2][0] * point.x + r[2][1] * point.y + r[2][2] * point.z + t.z,
        };
    }

    function projectionPointSets(kind) {
        if (kind === "point") return [{id: "P1", x: 0.72, y: 0.42, z: 0}];
        if (kind === "chessboard") {
            const points = [];
            for (let row = 0; row < 4; row += 1) {
                for (let col = 0; col < 6; col += 1) {
                    points.push({id: `B${row}-${col}`, x: (col - 2.5) * 0.28, y: (row - 1.5) * 0.28, z: 0});
                }
            }
            return points;
        }
        if (kind === "axes") {
            return [
                {id: "O", x: 0, y: 0, z: 0},
                {id: "X", x: 1.1, y: 0, z: 0},
                {id: "Y", x: 0, y: 1.1, z: 0},
                {id: "Z", x: 0, y: 0, z: 1.1},
            ];
        }
        const points = [];
        [-0.65, 0.65].forEach((x) => {
            [-0.65, 0.65].forEach((y) => {
                [-0.55, 0.55].forEach((z) => points.push({id: `C${points.length + 1}`, x, y, z}));
            });
        });
        return points;
    }

    function renderProjectionSvg(points, activeIndex, config) {
        const grid = [];
        for (let x = 40; x <= 600; x += 40) grid.push(`<line class="geo-grid-line" x1="${x}" y1="20" x2="${x}" y2="400"></line>`);
        for (let y = 20; y <= 400; y += 40) grid.push(`<line class="geo-grid-line" x1="40" y1="${y}" x2="600" y2="${y}"></line>`);
        const principal = {
            x: clamp(config?.cx || 320, 40, 600),
            y: clamp(config?.cy || 210, 20, 400),
        };
        const ghostSvg = points.map((point, index) => {
            const gx = clamp(320 + point.world.x * 92 + point.world.z * 22, 42, 598);
            const gy = clamp(210 - point.world.y * 92 - point.world.z * 14, 22, 398);
            return `<circle class="geo-point-ghost ${index === activeIndex ? "is-active" : ""}" cx="${fmt(gx, 1)}" cy="${fmt(gy, 1)}" r="${index === activeIndex ? 5 : 3.2}"></circle>`;
        }).join("");
        const pointSvg = points.map((point, index) => {
            const outside = !inImage(point);
            const cx = clamp(point.u, 42, 598);
            const cy = clamp(point.v, 22, 398);
            return `<circle class="geo-point ${index === activeIndex ? "is-active" : ""} ${outside ? "is-outside" : ""}" cx="${fmt(cx, 1)}" cy="${fmt(cy, 1)}" r="${index === activeIndex ? 6 : 4.2}"></circle>`;
        }).join("");
        const trace = points.slice(1).map((point, index) => {
            const prev = points[index];
            if (point.z <= 0.2 || prev.z <= 0.2) return "";
            return `<line class="geo-flow-line" x1="${fmt(clamp(prev.u, 42, 598), 1)}" y1="${fmt(clamp(prev.v, 22, 398), 1)}" x2="${fmt(clamp(point.u, 42, 598), 1)}" y2="${fmt(clamp(point.v, 22, 398), 1)}" stroke="rgba(8,145,178,.36)" stroke-width="1.2"></line>`;
        }).join("");
        return `
            <svg viewBox="0 0 640 420" role="img" aria-label="投影后的二维像素点">
                <rect x="40" y="20" width="560" height="380" rx="16" fill="rgba(255,255,255,.72)" stroke="#bfdbfe"></rect>
                ${grid.join("")}
                <line class="geo-axis-line" x1="40" y1="210" x2="600" y2="210"></line>
                <line class="geo-axis-line" x1="320" y1="20" x2="320" y2="400"></line>
                <line class="geo-principal-line" x1="${fmt(principal.x, 1)}" y1="${fmt(principal.y - 16, 1)}" x2="${fmt(principal.x, 1)}" y2="${fmt(principal.y + 16, 1)}"></line>
                <line class="geo-principal-line" x1="${fmt(principal.x - 16, 1)}" y1="${fmt(principal.y, 1)}" x2="${fmt(principal.x + 16, 1)}" y2="${fmt(principal.y, 1)}"></line>
                <circle class="geo-principal" cx="${fmt(principal.x, 1)}" cy="${fmt(principal.y, 1)}" r="12"></circle>
                ${ghostSvg}
                ${trace}
                ${pointSvg}
                <text x="52" y="46" fill="#1d4ed8" font-size="12" font-weight="800">像素坐标 / Pixel Coordinate</text>
                <text x="${fmt(principal.x + 16, 1)}" y="${fmt(principal.y - 12, 1)}" fill="#7c3aed" font-size="10" font-weight="850">cx, cy</text>
                <text x="512" y="386" fill="#64748b" font-size="11">pixel grid</text>
            </svg>
        `;
    }

    function initProjectionPage() {
        if (!("[data-geometry-projection]" in document.body.dataset) && !$("[data-geometry-projection]")) return;
        const state = {step: "world", lastParam: "fx", timer: 0};
        const inputs = {};
        $$("[data-geo-proj-input]").forEach((input) => {
            inputs[input.dataset.geoProjInput] = input;
        });

        function readState() {
            return {
                pointSet: inputs.pointSet?.value || "cube",
                yaw: Number(inputs.yaw?.value || 0),
                pitch: Number(inputs.pitch?.value || 0),
                roll: Number(inputs.roll?.value || 0),
                tx: Number(inputs.tx?.value || 0),
                ty: Number(inputs.ty?.value || 0),
                tz: Number(inputs.tz?.value || 4),
                fx: Number(inputs.fx?.value || 680),
                fy: Number(inputs.fy?.value || 650),
                cx: Number(inputs.cx?.value || 320),
                cy: Number(inputs.cy?.value || 210),
                skew: inputs.skew?.checked ? 38 : 0,
            };
        }

        function project(config) {
            const r = rotationMatrix(config.yaw, config.pitch, config.roll);
            const t = {x: config.tx, y: config.ty, z: config.tz};
            return projectionPointSets(config.pointSet).map((world) => {
                const camera = transformPoint(r, t, world);
                const invZ = Math.max(camera.z, 0.18);
                const nx = camera.x / invZ;
                const ny = camera.y / invZ;
                return {
                    world,
                    camera,
                    nx,
                    ny,
                    u: config.fx * nx + config.skew * ny + config.cx,
                    v: config.fy * ny + config.cy,
                    z: camera.z,
                };
            });
        }

        function matrixRows(rows) {
            return rows.map((row) => `[${row.map((value) => fmt(value, 2)).join(", ")}]`).join("\n");
        }

        function latexMatrixRows(rows) {
            return rows.map((row) => row.map((value) => fmt(value, 2)).join(" & ")).join(" \\\\ ");
        }

        function updateOutputs(config) {
            [
                ["yaw", `${fmtInt(config.yaw)}°`],
                ["pitch", `${fmtInt(config.pitch)}°`],
                ["roll", `${fmtInt(config.roll)}°`],
                ["tx", fmt(config.tx, 2)],
                ["ty", fmt(config.ty, 2)],
                ["tz", fmt(config.tz, 2)],
                ["fx", fmtInt(config.fx)],
                ["fy", fmtInt(config.fy)],
                ["cx", fmtInt(config.cx)],
                ["cy", fmtInt(config.cy)],
            ].forEach(([key, value]) => setText(`[data-geo-output="${key}"]`, value));
        }

        const notes = {
            world: {
                title: "世界坐标 / World Coordinate",
                formula: "\\(\\mathbf X_w=[X,Y,Z,1]^{\\mathsf T}\\)",
                body: [
                    ["坐标系", "世界坐标描述真实三维点，与相机摆放位置无关。"],
                    ["输入结构", "点集可以是单点、立方体、棋盘格或坐标轴。"],
                ],
            },
            extrinsic: {
                title: "外参变换 / Extrinsic Transform",
                formula: "\\(\\mathbf X_c=\\mathbf R\\mathbf X_w+\\mathbf t\\)",
                body: [
                    ["R", "旋转矩阵改变相机朝向，点阵在图像中会发生整体透视变化。"],
                    ["t", "平移向量改变相机相对世界的位置，tz 增大会让点看起来更远。"],
                ],
            },
            camera: {
                title: "相机坐标 / Camera Coordinate",
                formula: "\\(\\mathbf X_c=[X_c,Y_c,Z_c]^{\\mathsf T}\\)",
                body: [
                    ["深度 Zc", "Zc 越大，归一化坐标 Xc/Zc 和 Yc/Zc 越小。"],
                    ["可见性", "Zc 接近 0 时投影不稳定，真实系统会进行可见性过滤。"],
                ],
            },
            intrinsic: {
                title: "内参投影 / Intrinsic Projection",
                formula: "\\(\\mathbf K=\\begin{bmatrix}f_x&s&c_x\\\\0&f_y&c_y\\\\0&0&1\\end{bmatrix}\\)",
                body: [
                    ["fx / fy", "焦距像素单位控制水平和垂直方向的放大倍率。"],
                    ["cx / cy", "主点位置相当于图像坐标原点偏移。"],
                ],
            },
            pixel: {
                title: "像素坐标 / Pixel Coordinate",
                formula: "\\(s[u,v,1]^{\\mathsf T}=\\mathbf K[\\mathbf R|\\mathbf t]\\mathbf X_w\\)",
                body: [
                    ["输出", "最终像素坐标用于在图像平面中定位三维点的观测位置。"],
                    ["矩阵链路", "\\(\\mathbf P=\\mathbf K[\\mathbf R|\\mathbf t]\\) 把外参和内参合并为 \\(3\\times4\\) 投影矩阵。"],
                ],
            },
        };

        const impactText = {
            fx: "调整 fx：改变水平方向焦距，投影点在 x 方向放大或缩小。",
            fy: "调整 fy：改变垂直方向焦距，投影点在 y 方向放大或缩小。",
            cx: "调整 cx：改变主点位置，相当于图像坐标原点水平偏移。",
            cy: "调整 cy：改变主点位置，相当于图像坐标原点垂直偏移。",
            yaw: "调整 R：改变相机朝向，三维点在图像中发生整体透视变化。",
            pitch: "调整 R：改变相机俯仰角，点阵上下透视关系同步变化。",
            roll: "调整 R：改变相机滚转角，图像中点阵绕主点旋转。",
            tx: "调整 tx：相机坐标系横向平移，像素点整体左右移动。",
            ty: "调整 ty：相机坐标系纵向平移，像素点整体上下移动。",
            tz: "调整 tz：深度增大时投影收缩，点更靠近主点。",
            skew: "开启 skew：模拟非正交像素轴，x 坐标会随 y 坐标发生剪切。",
            pointSet: "切换点集：观察同一投影矩阵对不同几何结构的作用。",
        };

        function render(animated) {
            const config = readState();
            updateOutputs(config);
            const r = rotationMatrix(config.yaw, config.pitch, config.roll);
            const projected = project(config);
            const active = projected[0] || projected[0];
            const activeStages = [state.step];
            const contextStages = state.step === "intrinsic" ? ["normalized"] : [];

            const visibleCount = projected.filter(inImage).length;

            setHtml("[data-geo-projection-window]", renderProjectionSvg(projected, 0, config));
            setText('[data-geo-chip="projection-step"]', stepTitle("projection", state.step));
            setText('[data-geo-chip="projection-count"]', `${projected.length} points`);
            setText('[data-geo-proj-summary="point"]', active ? `[${fmt(active.world.x)}, ${fmt(active.world.y)}, ${fmt(active.world.z)}]` : "--");
            setText('[data-geo-proj-summary="camera"]', active ? `[${fmt(active.camera.x)}, ${fmt(active.camera.y)}, ${fmt(active.camera.z)}]` : "--");
            setText('[data-geo-proj-summary="pixel"]', active ? `(${fmt(active.u, 1)}, ${fmt(active.v, 1)})` : "--");
            setText('[data-geo-proj-summary="status"]', active?.z > 0.2 ? `${visibleCount}/${projected.length} 在图像内` : "深度过近");
            setText("[data-geo-current-pixel]", active ? `u=${fmt(active.u, 1)}, v=${fmt(active.v, 1)}` : "u=--, v=--");
            setText("[data-geo-param-impact]", impactText[state.lastParam] || impactText.fx);
            setText("[data-geo-substitution]", active ? `\\[
\\begin{aligned}
\\mathbf X_w&=[${fmt(active.world.x)},${fmt(active.world.y)},${fmt(active.world.z)},1]^{\\mathsf T}\\\\
\\mathbf X_c&=[${fmt(active.camera.x)},${fmt(active.camera.y)},${fmt(active.camera.z)}]^{\\mathsf T}\\\\
(u,v)&=(${fmt(active.u, 1)},${fmt(active.v, 1)})
\\end{aligned}
\\]` : "--");

            setText('[data-geo-matrix="world"]', active ? `输入 \\(\\mathbf X_w=[${fmt(active.world.x)},${fmt(active.world.y)},${fmt(active.world.z)},1]^{\\mathsf T}\\)\n输出：世界点位置` : "--");
            setText('[data-geo-matrix="extrinsic"]', `计算 \\(\\mathbf X_c=\\mathbf R\\mathbf X_w+\\mathbf t\\)\n\\(\\mathbf R=\\begin{bmatrix}${latexMatrixRows(r)}\\end{bmatrix}\\)\n\\(\\mathbf t=[${fmt(config.tx)},${fmt(config.ty)},${fmt(config.tz)}]^{\\mathsf T}\\)`);
            setText('[data-geo-matrix="camera"]', active ? `输出 \\(\\mathbf X_c=[${fmt(active.camera.x)},${fmt(active.camera.y)},${fmt(active.camera.z)}]^{\\mathsf T}\\)\n\\(Z_c=${fmt(active.camera.z, 2)}\\)` : "--");
            setText('[data-geo-matrix="normalized"]', active ? `透视除法\n\\(x_n=\\frac{X_c}{Z_c}=${fmt(active.nx, 3)}\\)\n\\(y_n=\\frac{Y_c}{Z_c}=${fmt(active.ny, 3)}\\)` : "--");
            setText('[data-geo-matrix="intrinsic"]', active ? `\\(\\mathbf K=\\begin{bmatrix}${fmtInt(config.fx)}&${fmtInt(config.skew)}&${fmtInt(config.cx)}\\\\0&${fmtInt(config.fy)}&${fmtInt(config.cy)}\\\\0&0&1\\end{bmatrix}\\)\n\\(u=f_xx_n+sy_n+c_x=${fmt(active.u, 1)}\\)\n\\(v=f_yy_n+c_y=${fmt(active.v, 1)}\\)` : "--");
            setText('[data-geo-matrix="pixel"]', active ? `输出\n\\(s[u,v,1]^{\\mathsf T}=[${fmt(active.u, 1)},${fmt(active.v, 1)},1]^{\\mathsf T}\\)` : "--");

            $$(".geo-matrix-card").forEach((card) => {
                const activeCard = activeStages.includes(card.dataset.geoStage);
                card.classList.toggle("is-active", activeCard);
                card.classList.toggle("is-context", contextStages.includes(card.dataset.geoStage));
                if (activeCard && animated) pulse(card);
            });

            const note = notes[state.step] || notes.world;
            setText("[data-geo-notes-title]", note.title);
            setText("[data-geo-notes-formula]", note.formula);
            setHtml("[data-geo-notes-body]", note.body.map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderStatusStrip($("[data-geo-flow-preview]"), [
                {label: "当前输入", value: active ? `\\(\\mathbf X_w=[${fmt(active.world.x)},${fmt(active.world.y)},${fmt(active.world.z)},1]^{\\mathsf T}\\)` : "--", detail: `${projected.length} 个世界点`, active: state.step === "world"},
                {label: "当前计算", value: state.step === "extrinsic" ? "\\(\\mathbf X_c=\\mathbf R\\mathbf X_w+\\mathbf t\\)" : state.step === "intrinsic" ? "\\(u=f_xx_n+sy_n+c_x\\)" : "\\(\\mathbf P=\\mathbf K[\\mathbf R|\\mathbf t]\\)", detail: stepTitle("projection", state.step), active: state.step === "extrinsic" || state.step === "intrinsic"},
                {label: "当前输出", value: active ? `\\((u,v)=(${fmt(active.u, 1)},${fmt(active.v, 1)})\\)` : "--", detail: "像素坐标 / Pixel Coordinate", active: state.step === "pixel"},
                {label: "当前质量", value: `${visibleCount}/${projected.length} in image`, detail: active ? `\\(Z_c=${fmt(active.z, 2)}\\) · 主点 \\((${fmtInt(config.cx)},${fmtInt(config.cy)})\\)` : "--", active: state.step === "camera"},
            ]);
            updateStepper("projection", state.step);
            typesetMath();
            if (animated) pulse($(".geometry-notes-panel"));
        }

        Object.entries(inputs).forEach(([key, input]) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => {
                state.lastParam = key;
                render(true);
            });
        });
        bindStepControls("projection", state, render);
        render(false);
    }

    function cameraScenePoints(scene, depth) {
        if (scene === "board") {
            const points = [];
            for (let row = 0; row < 5; row += 1) {
                for (let col = 0; col < 6; col += 1) {
                    points.push({id: `B${row}-${col}`, x: (col - 2.5) * 0.34, y: (row - 2) * 0.28, z: depth});
                }
            }
            return points;
        }
        if (scene === "scatter") {
            return [
                [-0.82, -0.38, -0.2], [0.45, -0.48, 0.1], [0.92, 0.12, 0.6], [-0.34, 0.46, -0.4],
                [0.18, 0.7, 0.35], [-0.72, 0.2, 0.72], [0.65, -0.05, -0.65], [-0.05, -0.72, 0.45],
                [0.32, 0.25, -0.25], [-0.48, -0.1, 0.24],
            ].map((p, i) => ({id: `S${i + 1}`, x: p[0], y: p[1], z: depth + p[2]}));
        }
        const points = [];
        [-0.62, 0.62].forEach((x) => {
            [-0.62, 0.62].forEach((y) => {
                [-0.55, 0.55].forEach((z) => points.push({id: `C${points.length + 1}`, x, y, z: depth + z}));
            });
        });
        return points;
    }

    function initCameraPage() {
        if (!$("[data-geometry-camera-model]")) return;
        const state = {step: "point", lastParam: "focal", timer: 0};
        const inputs = {};
        $$("[data-geo-camera-input]").forEach((input) => {
            inputs[input.dataset.geoCameraInput] = input;
        });

        function readState() {
            return {
                scene: inputs.scene?.value || "cube",
                focal: Number(inputs.focal?.value || 120),
                depth: Number(inputs.depth?.value || 4),
                fov: Number(inputs.fov?.value || 48),
                showCenter: inputs.showCenter?.checked !== false,
                showAxis: inputs.showAxis?.checked !== false,
                showRays: inputs.showRays?.checked !== false,
                showPlane: inputs.showPlane?.checked !== false,
                showPixels: inputs.showPixels?.checked !== false,
            };
        }

        function projectPoint(point, focal) {
            return {
                x: focal * point.x / Math.max(point.z, 0.2),
                y: focal * point.y / Math.max(point.z, 0.2),
            };
        }

        function renderWorld(points, config) {
            const center = {x: 72, y: 236};
            const planeX = 238;
            const planeHalf = 88 + (config.fov - 28) * 1.7;
            const active = points[0];
            const pointSvg = points.map((point, index) => {
                const x = 286 + point.x * 55 + (point.z - config.depth) * 26;
                const y = 200 - point.y * 58 - (point.z - config.depth) * 6;
                return `<circle class="camera-point ${index === 0 ? "is-active" : ""}" cx="${fmt(x, 1)}" cy="${fmt(y, 1)}" r="${index === 0 ? 6 : 4.2}"></circle>`;
            }).join("");
            const rays = points.map((point, index) => {
                const x = 286 + point.x * 55 + (point.z - config.depth) * 26;
                const y = 200 - point.y * 58 - (point.z - config.depth) * 6;
                return `<line class="camera-ray ${index === 0 ? "is-active" : ""}" x1="${center.x}" y1="${center.y}" x2="${fmt(x, 1)}" y2="${fmt(y, 1)}"></line>`;
            }).join("");
            const activeProjection = projectPoint(active, config.focal);
            const activeScreen = {
                x: 286 + active.x * 55 + (active.z - config.depth) * 26,
                y: 200 - active.y * 58 - (active.z - config.depth) * 6,
            };
            const planeDotY = 236 - activeProjection.y * 0.74;
            const planeDotClamped = clamp(planeDotY, 236 - planeHalf, 236 + planeHalf);
            const activeRay = config.showRays ? `<polyline class="camera-ray camera-ray--projection is-active" points="${fmt(activeScreen.x, 1)},${fmt(activeScreen.y, 1)} ${center.x},${center.y} ${planeX},${fmt(planeDotClamped, 1)}"></polyline>` : "";
            return `
                <svg viewBox="0 0 520 360" role="img" aria-label="三维相机成像几何">
                    <path class="camera-frustum" d="M${center.x} ${center.y} L${planeX} ${236 - planeHalf} L${planeX} ${236 + planeHalf} Z"></path>
                    ${config.showPlane ? `<rect class="camera-plane" x="${planeX - 10}" y="${236 - planeHalf}" width="20" height="${planeHalf * 2}" rx="8"></rect>` : ""}
                    ${config.showPlane ? Array.from({length: 5}, (_item, i) => `<line class="camera-plane-grid" x1="${planeX - 10}" y1="${236 - planeHalf + (planeHalf * 2 * i / 4)}" x2="${planeX + 10}" y2="${236 - planeHalf + (planeHalf * 2 * i / 4)}"></line>`).join("") : ""}
                    ${config.showAxis ? `<line class="camera-axis" x1="${center.x}" y1="${center.y}" x2="476" y2="${center.y}"></line><text x="424" y="${center.y - 9}" fill="#0891b2" font-size="12" font-weight="800">optical axis</text>` : ""}
                    ${config.showRays ? rays : ""}
                    ${activeRay}
                    ${config.showPlane ? `<circle class="camera-pixel is-active" cx="${planeX}" cy="${fmt(planeDotClamped, 1)}" r="5"></circle>` : ""}
                    ${pointSvg}
                    ${config.showCenter ? `<circle class="camera-center" cx="${center.x}" cy="${center.y}" r="8"></circle><text x="${center.x - 18}" y="${center.y + 25}" fill="#5b21b6" font-size="12" font-weight="900">O</text>` : ""}
                    <text x="20" y="30" fill="#1d4ed8" font-size="12" font-weight="850">3D world points</text>
                    <text x="${planeX - 38}" y="${236 - planeHalf - 12}" fill="#2563eb" font-size="11" font-weight="850">image plane</text>
                </svg>
            `;
        }

        function renderPlane(points, config) {
            const projected = points.map((point) => projectPoint(point, config.focal));
            const pixels = projected.map((point, index) => {
                const x = clamp(240 + point.x, 28, 452);
                const y = clamp(180 - point.y, 28, 332);
                return `<circle class="camera-pixel ${index === 0 ? "is-active" : ""}" cx="${fmt(x, 1)}" cy="${fmt(y, 1)}" r="${index === 0 ? 6 : 4.2}"></circle>`;
            }).join("");
            const grid = [];
            for (let x = 30; x <= 450; x += 30) grid.push(`<line class="geo-grid-line" x1="${x}" y1="25" x2="${x}" y2="335"></line>`);
            for (let y = 30; y <= 330; y += 30) grid.push(`<line class="geo-grid-line" x1="25" y1="${y}" x2="455" y2="${y}"></line>`);
            return `
                <svg viewBox="0 0 480 360" role="img" aria-label="二维成像平面像素点">
                    <rect x="25" y="25" width="430" height="310" rx="16" fill="rgba(255,255,255,.76)" stroke="#bfdbfe"></rect>
                    ${grid.join("")}
                    <line class="geo-axis-line" x1="25" y1="180" x2="455" y2="180"></line>
                    <line class="geo-axis-line" x1="240" y1="25" x2="240" y2="335"></line>
                    <circle class="geo-principal" cx="240" cy="180" r="12"></circle>
                    ${config.showPixels ? pixels : ""}
                    <text x="36" y="48" fill="#1d4ed8" font-size="12" font-weight="850">2D pixel coordinate</text>
                    <text x="336" y="318" fill="#64748b" font-size="11">u, v</text>
                </svg>
            `;
        }

        const notes = {
            point: ["当前三维点发光", "先选定世界中的一个三维点，记录它的 X、Y、Z。"],
            center: ["光心 O", "针孔相机把所有入射光线视为经过同一个光心。"],
            ray: ["投影射线", "三维点、光心和像平面投影点在同一条直线上。"],
            plane: ["成像平面", "焦距 f 控制成像平面距离，投影坐标与 f 成正比。"],
            pixel: ["像平面点", "第一页只观察理想针孔成像坐标，完整像素坐标和 K 在第二页展开。"],
        };

        function render(animated) {
            const config = readState();
            const points = cameraScenePoints(config.scene, config.depth);
            const active = points[0];
            const p = projectPoint(active, config.focal);
            const scale = config.focal / Math.max(active.z, 0.2);
            setText('[data-geo-camera-output="focal"]', fmtInt(config.focal));
            setText('[data-geo-camera-output="depth"]', fmt(config.depth, 1));
            setText('[data-geo-camera-output="fov"]', `${fmtInt(config.fov)}°`);
            setHtml("[data-geo-camera-3d]", renderWorld(points, config));
            setHtml("[data-geo-camera-plane]", renderPlane(points, config));
            setText('[data-geo-camera-chip="step"]', stepSets.camera.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-geo-camera-chip="focal"]', `\\(f=${fmtInt(config.focal)}\\)`);
            setText('[data-geo-camera-chip="depth"]', `\\(Z=${fmt(config.depth, 1)}\\)`);
            setText('[data-geo-camera-summary="point"]', `[${fmt(active.x)}, ${fmt(active.y)}, ${fmt(active.z)}]`);
            setText('[data-geo-camera-summary="scale"]', `${fmt(scale, 1)} px/unit`);
            setText('[data-geo-camera-summary="count"]', `${points.length}`);
            setText('[data-geo-camera-summary="note"]', state.lastParam === "depth" ? "Z 越大，投影越靠近中心" : "f 越大，图像越放大");
            setText('[data-geo-camera-micro="point"]', `\\(P=(${fmt(active.x, 2)},${fmt(active.y, 2)},${fmt(active.z, 2)})\\)`);
            setText('[data-geo-camera-micro="normalized"]', `\\(x_n=\\frac{X}{Z}=${fmt(active.x / Math.max(active.z, 0.2), 3)},\\ y_n=\\frac{Y}{Z}=${fmt(active.y / Math.max(active.z, 0.2), 3)}\\)`);
            setText('[data-geo-camera-micro="image"]', `\\(x=\\frac{fX}{Z}=${fmt(p.x, 1)},\\ y=\\frac{fY}{Z}=${fmt(p.y, 1)}\\)`);
            setText('[data-geo-camera-micro="scale"]', `\\(\\frac{f}{Z}=${fmt(scale, 2)}\\)`);
            setText('[data-geo-camera-micro="conclusion"]', state.lastParam === "depth" ? "Z 增大时 f/Z 变小，投影点向中心收缩。" : "f 增大时 f/Z 变大，投影点相对中心向外移动。");
            setText("[data-geo-camera-notes-title]", notes[state.step]?.[0] || "针孔投影");
            setHtml("[data-geo-camera-notes]", `
                <article><span>1</span><div><strong>${notes[state.step]?.[0] || "当前步骤"}</strong><p>${notes[state.step]?.[1] || ""}</p></div></article>
                <article><span>2</span><div><strong>观察结论</strong><p>${state.lastParam === "depth" ? "增加 Z 深度会让所有像平面点向中心收缩。" : "增加焦距 f 会让所有投影点相对中心向外移动。"}</p></div></article>
                <article><span>3</span><div><strong>内容边界</strong><p>这里展示理想成像坐标 x, y；像素坐标 u, v 需要再经过内参 K，放到第二页讲。</p></div></article>
            `);
            setText("[data-geo-camera-substitution]", `\\[
\\begin{aligned}
P&=(${fmt(active.x)},${fmt(active.y)},${fmt(active.z)})\\\\
(x_n,y_n)&=(${fmt(active.x / Math.max(active.z, 0.2), 3)},${fmt(active.y / Math.max(active.z, 0.2), 3)})\\\\
(x,y)&=(${fmt(p.x, 1)},${fmt(p.y, 1)})
\\end{aligned}
\\]`);
            renderStatusStrip($("[data-geo-camera-flow]"), [
                {label: "当前输入", value: `\\(P=(${fmt(active.x)},${fmt(active.y)},${fmt(active.z)})\\)`, detail: `${points.length} 个上下文点`, active: state.step === "point"},
                {label: "当前计算", value: "projection ray", detail: "P → O → image plane", active: state.step === "ray" || state.step === "center"},
                {label: "当前输出", value: `\\(p=(${fmt(p.x, 1)},${fmt(p.y, 1)})\\)`, detail: "成像平面坐标 / Image Plane", active: state.step === "plane" || state.step === "pixel"},
                {label: "当前质量", value: `\\(\\frac{f}{Z}=${fmt(scale, 2)}\\)`, detail: "projection scale \\(=f/Z\\)", active: state.step === "pixel"},
            ]);
            updateStepper("camera", state.step);
            typesetMath();
            if (animated) pulse($(".geometry-notes-panel"));
        }

        Object.entries(inputs).forEach(([key, input]) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => {
                state.lastParam = key;
                render(true);
            });
        });
        bindStepControls("camera", state, render);
        render(false);
    }

    function bilinear(quad, u, v) {
        const [a, b, c, d] = quad;
        return {
            x: (1 - u) * (1 - v) * a.x + u * (1 - v) * b.x + u * v * c.x + (1 - u) * v * d.x,
            y: (1 - u) * (1 - v) * a.y + u * (1 - v) * b.y + u * v * c.y + (1 - u) * v * d.y,
        };
    }

    function noiseValue(index, scale, phase) {
        return Math.sin(index * 12.9898 + phase) * Math.cos(index * 4.1414 + phase * 0.7) * scale;
    }

    function calibrationQuad(sample) {
        const quads = {
            front: [{x: 84, y: 56}, {x: 432, y: 56}, {x: 432, y: 286}, {x: 84, y: 286}],
            tilted: [{x: 128, y: 42}, {x: 454, y: 84}, {x: 408, y: 310}, {x: 76, y: 250}],
            perspective: [{x: 154, y: 34}, {x: 452, y: 104}, {x: 374, y: 318}, {x: 58, y: 232}],
            multi: [{x: 92, y: 70}, {x: 414, y: 38}, {x: 486, y: 280}, {x: 148, y: 320}],
            noise: [{x: 112, y: 54}, {x: 444, y: 86}, {x: 404, y: 306}, {x: 78, y: 262}],
        };
        return quads[sample] || quads.front;
    }

    function quadPoints(quad) {
        return quad.map((p) => `${fmt(p.x, 1)},${fmt(p.y, 1)}`).join(" ");
    }

    function shiftedQuad(quad, dx, dy, scale) {
        const cx = quad.reduce((sum, p) => sum + p.x, 0) / quad.length;
        const cy = quad.reduce((sum, p) => sum + p.y, 0) / quad.length;
        return quad.map((p) => ({
            x: cx + (p.x - cx) * scale + dx,
            y: cy + (p.y - cy) * scale + dy,
        }));
    }

    function boardImageDefs(id) {
        return `
            <defs>
                <marker id="${id}-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#f97316"></path>
                </marker>
                <filter id="${id}-noise" x="-8%" y="-8%" width="116%" height="116%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="8" result="noise"></feTurbulence>
                    <feColorMatrix in="noise" type="saturate" values="0" result="grayNoise"></feColorMatrix>
                    <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply"></feBlend>
                    <feGaussianBlur stdDeviation="0.72"></feGaussianBlur>
                </filter>
                <filter id="${id}-soft-blur" x="-8%" y="-8%" width="116%" height="116%">
                    <feGaussianBlur stdDeviation="0.45"></feGaussianBlur>
                </filter>
            </defs>
        `;
    }

    function boardImageProbe() {
        return `<image data-calib-board-image class="calib-board-probe" href="${CHECKERBOARD_IMAGE_URL}" x="-4" y="-4" width="1" height="1" opacity="0"></image>`;
    }

    function boardLayerFilter(config, id, isPrimary) {
        if (!isPrimary) return "";
        return config.sample === "noise"
            ? ` filter="url(#${id}-noise)"`
            : config.sample === "tilted" || config.sample === "perspective"
                ? ` filter="url(#${id}-soft-blur)"`
                : "";
    }

    function boardCellsSvg(config, quad) {
        const cells = [];
        const squareRows = clamp(config.rows + 1, 4, CHECKERBOARD_SOURCE_SQUARES);
        const squareCols = clamp(config.cols + 1, 4, CHECKERBOARD_SOURCE_SQUARES);
        for (let row = 0; row < squareRows; row += 1) {
            for (let col = 0; col < squareCols; col += 1) {
                const u0 = col / squareCols;
                const v0 = row / squareRows;
                const u1 = (col + 1) / squareCols;
                const v1 = (row + 1) / squareRows;
                const p0 = bilinear(quad, u0, v0);
                const p1 = bilinear(quad, u1, v0);
                const p2 = bilinear(quad, u1, v1);
                const p3 = bilinear(quad, u0, v1);
                const cls = (row + col) % 2 ? "calib-board-dark" : "calib-board-light";
                cells.push(`<polygon class="calib-board-cell ${cls}" points="${fmt(p0.x, 1)},${fmt(p0.y, 1)} ${fmt(p1.x, 1)},${fmt(p1.y, 1)} ${fmt(p2.x, 1)},${fmt(p2.y, 1)} ${fmt(p3.x, 1)},${fmt(p3.y, 1)}"></polygon>`);
            }
        }
        return cells.join("");
    }

    function generatedBoardLayer(config, quad, id, extraClass, isPrimary) {
        const filter = boardLayerFilter(config, id, isPrimary);
        return `
            <g class="calib-generated-board ${extraClass || ""}"${filter}>
                ${boardCellsSvg(config, quad)}
                <polygon class="calib-board-outline" points="${quadPoints(quad)}"></polygon>
            </g>
        `;
    }

    function multiBoardLayers(config, quad, id) {
        const layers = [generatedBoardLayer(config, quad, id, "is-primary", true)];
        if (config.sample === "multi") {
            layers.unshift(generatedBoardLayer(config, shiftedQuad(quad, -62, -24, 0.58), id, "is-ghost is-ghost-one", false));
            layers.push(generatedBoardLayer(config, shiftedQuad(quad, 54, 28, 0.52), id, "is-ghost is-ghost-two", false));
        }
        return layers.join("");
    }

    function imageFallback(width = 520, height = 360) {
        return `
            <foreignObject class="calib-image-fallback" x="34" y="34" width="${width - 68}" height="${height - 68}">
                <div xmlns="http://www.w3.org/1999/xhtml">
                    <strong>棋盘格图片未找到</strong>
                    <span>请检查 static/assets/img/checkerboard.png</span>
                </div>
            </foreignObject>
        `;
    }

    function calibrationSampleLabel(sample) {
        return {
            front: "正视棋盘格",
            tilted: "倾斜棋盘格",
            perspective: "远近透视棋盘格",
            multi: "多视角棋盘格",
            noise: "噪声 / 模糊棋盘格",
        }[sample] || "棋盘格样例";
    }

    function calibrationPoints(config) {
        const quad = calibrationQuad(config.sample);
        const noiseScale = config.noise + (config.sample === "noise" ? 1.2 : 0);
        const squareRows = clamp(config.rows + 1, 4, CHECKERBOARD_SOURCE_SQUARES);
        const squareCols = clamp(config.cols + 1, 4, CHECKERBOARD_SOURCE_SQUARES);
        const points = [];
        for (let row = 0; row < config.rows; row += 1) {
            for (let col = 0; col < config.cols; col += 1) {
                const boardCol = col + 1;
                const boardRow = row + 1;
                const u = boardCol / squareCols;
                const v = boardRow / squareRows;
                const ideal = bilinear(quad, u, v);
                const index = row * config.cols + col;
                const detected = {
                    x: ideal.x + noiseValue(index, noiseScale, 0.4),
                    y: ideal.y + noiseValue(index, noiseScale, 1.7),
                };
                const reprojected = {
                    x: ideal.x + noiseValue(index, Math.max(0.18, noiseScale * 0.34), 2.3),
                    y: ideal.y + noiseValue(index, Math.max(0.18, noiseScale * 0.34), 3.1),
                };
                const error = Math.hypot(detected.x - reprojected.x, detected.y - reprojected.y);
                points.push({
                    id: `P${index + 1}`,
                    row,
                    col,
                    world: {x: boardCol * config.square, y: boardRow * config.square, z: 0},
                    ideal,
                    detected,
                    reprojected,
                    error,
                });
            }
        }
        return points;
    }

    function renderCalibrationImage(config, points) {
        const quad = calibrationQuad(config.sample);
        const corners = config.showDetected ? points.map((point, index) => `
            <circle class="calib-corner is-detected ${index === 0 ? "is-active" : ""}" style="--corner-delay:${Math.min(index * 18, 520)}ms" cx="${fmt(point.detected.x, 1)}" cy="${fmt(point.detected.y, 1)}" r="${index === 0 ? 5.2 : 3.8}"></circle>
        `).join("") : "";
        const boardId = `calib-board-${config.sample}-image`;
        return `
            <svg class="calibration-real-board calibration-real-board--${config.sample}" viewBox="0 0 520 360" role="img" aria-label="棋盘格角点检测">
                ${boardImageDefs(boardId)}
                ${boardImageProbe()}
                <rect x="22" y="24" width="476" height="312" rx="18" fill="#eef6ff" stroke="#dbeafe"></rect>
                ${multiBoardLayers(config, quad, boardId)}
                ${imageFallback()}
                ${corners}
                <text x="34" y="48" fill="#1d4ed8" font-size="12" font-weight="850">checkerboard.png 纹理 · ${calibrationSampleLabel(config.sample)}</text>
            </svg>
        `;
    }

    function renderCalibrationWorld(config, points) {
        const squareRows = clamp(config.rows + 1, 4, CHECKERBOARD_SOURCE_SQUARES);
        const squareCols = clamp(config.cols + 1, 4, CHECKERBOARD_SOURCE_SQUARES);
        const maxX = Math.max(1, squareCols * config.square);
        const maxY = Math.max(1, squareRows * config.square);
        const dots = points.map((point, index) => {
            const x = 60 + (point.world.x / maxX) * 300;
            const y = 50 + (point.world.y / maxY) * 210;
            return `<circle class="calib-corner ${index === 0 ? "is-active" : ""}" cx="${fmt(x, 1)}" cy="${fmt(y, 1)}" r="${index === 0 ? 5.2 : 3.4}"></circle>`;
        }).join("");
        const lines = points.slice(0, Math.min(points.length, 14)).map((point, index) => {
            const x = 60 + (point.world.x / maxX) * 300;
            const y = 50 + (point.world.y / maxY) * 210;
            return `<line class="calib-pair-line" x1="${fmt(x, 1)}" y1="${fmt(y, 1)}" x2="${420}" y2="${80 + index * 13}"></line>`;
        }).join("");
        const pose = config.showPose ? `<path class="calib-camera-pose" d="M412 92 l52 -24 l0 52 z"></path><circle class="camera-center" cx="412" cy="92" r="6"></circle><text x="392" y="132" fill="#5b21b6" font-size="11" font-weight="850">camera pose</text>` : "";
        return `
            <svg viewBox="0 0 520 360" role="img" aria-label="棋盘格世界坐标平面">
                <rect x="38" y="30" width="348" height="260" rx="16" fill="rgba(255,255,255,.76)" stroke="#bfdbfe"></rect>
                ${Array.from({length: squareCols + 1}, (_item, col) => `<line class="geo-grid-line" x1="${60 + col * (300 / squareCols)}" y1="50" x2="${60 + col * (300 / squareCols)}" y2="260"></line>`).join("")}
                ${Array.from({length: squareRows + 1}, (_item, row) => `<line class="geo-grid-line" x1="60" y1="${50 + row * (210 / squareRows)}" x2="360" y2="${50 + row * (210 / squareRows)}"></line>`).join("")}
                ${stateOrPairsVisible(config) ? lines : ""}
                ${dots}
                ${pose}
                <text x="52" y="318" fill="#64748b" font-size="11">Z = 0 plane, square = ${config.square} mm</text>
            </svg>
        `;
    }

    function stateOrPairsVisible(_config) {
        return true;
    }

    function renderCalibrationReprojection(config, points) {
        const quad = calibrationQuad(config.sample);
        const maxError = Math.max(...points.map((point) => point.error), 0.001);
        const active = points[0];
        const detected = points.map((point, index) => {
            const hot = point.error >= maxError * 0.78;
            const err = config.showErrors ? `<line class="calib-error-vector ${hot ? "is-hot" : ""}" marker-end="url(#calib-board-${config.sample}-reprojection-arrow)" x1="${fmt(point.detected.x, 1)}" y1="${fmt(point.detected.y, 1)}" x2="${fmt(point.reprojected.x, 1)}" y2="${fmt(point.reprojected.y, 1)}"></line>` : "";
            const reproj = config.showReprojected ? `<circle class="calib-reprojected ${index === 0 ? "is-active" : ""} ${hot ? "is-hot" : ""}" cx="${fmt(point.reprojected.x, 1)}" cy="${fmt(point.reprojected.y, 1)}" r="${index === 0 ? 4.9 : 3.4}"></circle>` : "";
            const det = config.showDetected ? `<circle class="calib-corner ${hot ? "is-hot" : ""}" cx="${fmt(point.detected.x, 1)}" cy="${fmt(point.detected.y, 1)}" r="3"></circle>` : "";
            return `${err}${det}${reproj}`;
        }).join("");
        const boardId = `calib-board-${config.sample}-reprojection`;
        const loupe = active ? `
            <g class="calib-error-loupe">
                <rect x="338" y="68" width="136" height="82" rx="14"></rect>
                <text x="352" y="91" fill="#1d4ed8" font-size="10" font-weight="850">detected vs reprojected</text>
                <line class="calib-error-vector is-hot" marker-end="url(#${boardId}-arrow)" x1="384" y1="116" x2="${fmt(384 + (active.reprojected.x - active.detected.x) * 7, 1)}" y2="${fmt(116 + (active.reprojected.y - active.detected.y) * 7, 1)}"></line>
                <circle class="calib-corner" cx="384" cy="116" r="4.2"></circle>
                <circle class="calib-reprojected is-active" cx="${fmt(384 + (active.reprojected.x - active.detected.x) * 7, 1)}" cy="${fmt(116 + (active.reprojected.y - active.detected.y) * 7, 1)}" r="4.2"></circle>
                <text x="352" y="140" fill="#ef4444" font-size="10" font-weight="850">e=${fmt(active.error, 2)} px</text>
            </g>
        ` : "";
        return `
            <svg class="calibration-real-board calibration-real-board--${config.sample}" viewBox="0 0 520 360" role="img" aria-label="重投影误差向量">
                ${boardImageDefs(boardId)}
                ${boardImageProbe()}
                <rect x="22" y="24" width="476" height="312" rx="18" fill="#f8fbff" stroke="#dbeafe"></rect>
                ${multiBoardLayers(config, quad, boardId)}
                ${imageFallback()}
                ${detected}
                ${loupe}
                <text x="34" y="48" fill="#1d4ed8" font-size="12" font-weight="850">蓝色检测点 · 紫色重投影点</text>
                <text x="338" y="318" fill="#ef4444" font-size="11" font-weight="850">橙色箭头 = 重投影误差</text>
            </svg>
        `;
    }

    function renderResidualBars(points) {
        const visible = points.slice(0, 12);
        const maxError = Math.max(...visible.map((point) => point.error), 0.001);
        return visible.map((point) => {
            const width = clamp((point.error / maxError) * 100, 4, 100);
            return `
                <div class="calib-residual-bar ${point.error >= maxError * 0.78 ? "is-hot" : ""}">
                    <span>${point.id}</span>
                    <i style="width:${fmt(width, 1)}%"></i>
                    <strong>${fmt(point.error, 2)}</strong>
                </div>
            `;
        }).join("");
    }

    function bindCalibrationImageStatus() {
        $$("image[data-calib-board-image]").forEach((image) => {
            const svg = image.closest("svg");
            if (!svg) return;
            image.addEventListener("load", () => {
                svg.classList.add("is-board-image-ready");
                svg.classList.remove("is-board-image-failed");
            }, {once: true});
            image.addEventListener("error", () => {
                svg.classList.add("is-board-image-failed");
                svg.classList.remove("is-board-image-ready");
            }, {once: true});
        });
    }

    function initCalibrationPage() {
        if (!$("[data-geometry-calibration]")) return;
        const state = {step: "chessboard", lastParam: "sample", timer: 0};
        const inputs = {};
        $$("[data-geo-calib-input]").forEach((input) => {
            inputs[input.dataset.geoCalibInput] = input;
        });

        function readState() {
            return {
                sample: inputs.sample?.value || "front",
                rows: Number(inputs.rows?.value || 4),
                cols: Number(inputs.cols?.value || 4),
                square: Number(inputs.square?.value || 24),
                noise: Number(inputs.noise?.value || 0),
                images: Number(inputs.images?.value || 8),
                showDetected: inputs.showDetected?.checked !== false,
                showReprojected: inputs.showReprojected?.checked !== false,
                showErrors: inputs.showErrors?.checked !== false,
                showPose: inputs.showPose?.checked !== false,
            };
        }

        const notes = {
            chessboard: ["棋盘格标定板", "棋盘格提供规则、已知间距的平面世界点，通常设 Z = 0。"],
            corners: ["角点检测", "算法在图像中定位黑白格交点，得到二维像素坐标。"],
            pairs: ["3D-2D 对应", "每个世界角点必须与同序号图像角点配对，才能形成投影约束。"],
            solve: ["参数求解", "多张图像的角点约束合并，求解 K、R、t 和畸变参数。"],
            reproject: ["重投影", "用估计参数把世界角点重新投影回图像，与检测点对比。"],
            error: ["误差分析", "平均重投影误差越小，说明参数解释观测点的能力越强。"],
        };

        function render(animated) {
            const config = readState();
            const points = calibrationPoints(config);
            const meanError = points.reduce((sum, point) => sum + point.error, 0) / Math.max(points.length, 1);
            const imageError = meanError * (1 + 1 / Math.max(config.images, 1));
            const maxPoint = points.reduce((best, point) => (!best || point.error > best.error ? point : best), null);
            const fx = 720 + config.images * 7 - config.noise * 8;
            const fy = 700 + config.images * 6 - config.noise * 6;
            const cx = 320 + (config.sample === "tilted" ? 8 : config.sample === "perspective" ? 12 : config.sample === "multi" ? -6 : 0);
            const cy = 210 + (config.sample === "noise" ? 5 : config.sample === "perspective" ? -4 : 0);
            setText('[data-geo-calib-output="rows"]', fmtInt(config.rows));
            setText('[data-geo-calib-output="cols"]', fmtInt(config.cols));
            setText('[data-geo-calib-output="square"]', `${fmtInt(config.square)} mm`);
            setText('[data-geo-calib-output="noise"]', `${fmt(config.noise, 1)} px`);
            setText('[data-geo-calib-output="images"]', fmtInt(config.images));
            setHtml("[data-geo-calib-image]", renderCalibrationImage(config, points));
            setHtml("[data-geo-calib-world]", renderCalibrationWorld(config, points));
            setHtml("[data-geo-calib-reprojection]", renderCalibrationReprojection(config, points));
            bindCalibrationImageStatus();
            setText('[data-geo-calib-chip="step"]', stepTitle("calibration", state.step));
            setText('[data-geo-calib-chip="corners"]', `${points.length} corners`);
            setText('[data-geo-calib-chip="images"]', `${config.images} images`);
            setText('[data-geo-calib-summary="corners"]', `${points.length * config.images}`);
            setText('[data-geo-calib-summary="meanError"]', `${fmt(meanError, 2)} px`);
            setText('[data-geo-calib-summary="imageError"]', `${fmt(imageError, 2)} px`);
            setText('[data-geo-calib-summary="status"]', state.step === "error" ? "误差分析完成" : "参数估计中");
            setText('[data-geo-calib-result="k"]', `\\(\\mathbf K=\\begin{bmatrix}${fmtInt(fx)}&0&${fmtInt(cx)}\\\\0&${fmtInt(fy)}&${fmtInt(cy)}\\\\0&0&1\\end{bmatrix}\\)`);
            setText('[data-geo-calib-result="dist"]', `\\(\\mathbf d=[${fmt(config.noise * 0.012, 4)},${fmt(-config.noise * 0.004, 4)},0.0008,-0.0006]\\)`);
            setText('[data-geo-calib-result="meanError"]', `${fmt(meanError, 2)} px`);
            setText('[data-geo-calib-result="imageError"]', `${fmt(imageError, 2)} px`);
            setText('[data-geo-calib-result="cornerCount"]', `${points.length * config.images}`);
            setText('[data-geo-calib-result="maxError"]', maxPoint ? `${maxPoint.id} · ${fmt(maxPoint.error, 2)} px` : "--");
            setHtml('[data-geo-calib-result="residualBars"]', renderResidualBars(points));

            const note = notes[state.step] || notes.chessboard;
            setText("[data-geo-calib-notes-title]", note[0]);
            setHtml("[data-geo-calib-notes]", `
                <article><span>1</span><div><strong>${note[0]}</strong><p>${note[1]}</p></div></article>
                <article><span>2</span><div><strong>当前状态</strong><p>${points.length} 个角点、${config.images} 张图像，共 ${points.length * config.images} 条观测约束，平均重投影误差 ${fmt(meanError, 2)} px。</p></div></article>
                <article><span>3</span><div><strong>演示边界</strong><p>当前为预设样例 · 标定流程演示，用可解释的角点扰动模拟求解与误差反馈，不标记为真实 OpenCV 标定结果。</p></div></article>
            `);
            $$("[data-geo-calib-note-step]").forEach((item) => {
                const step = item.dataset.geoCalibNoteStep;
                item.classList.toggle("is-active", step === state.step || (state.step === "corners" && step === "chessboard"));
            });
            renderStatusStrip($("[data-geo-calib-flow]"), [
                {label: "当前输入", value: `${points.length} pairs × ${config.images}`, detail: "objectPoints + imagePoints", active: state.step === "chessboard" || state.step === "corners"},
                {label: "当前计算", value: state.step === "solve" ? "\\(\\min\\sum_i\\lVert\\mathbf p_i-\\hat{\\mathbf p}_i\\rVert_2^2\\)" : state.step === "reproject" ? "\\(\\hat{\\mathbf p}=\\operatorname{project}(\\mathbf K,\\mathbf R,\\mathbf t,\\mathbf X_w)\\)" : "corner pairing", detail: stepTitle("calibration", state.step), active: state.step === "pairs" || state.step === "solve" || state.step === "reproject"},
                {label: "当前输出", value: `\\(f_x=${fmtInt(fx)},\\ f_y=${fmtInt(fy)}\\)`, detail: `\\(d_1\\approx ${fmt(config.noise * 0.012, 4)}\\)`, active: state.step === "solve"},
                {label: "当前质量", value: `mean=${fmt(meanError, 2)} px`, detail: maxPoint ? `max ${maxPoint.id}=${fmt(maxPoint.error, 2)} px` : "--", active: state.step === "error"},
            ]);
            updateStepper("calibration", state.step);
            typesetMath();
            if (animated) {
                pulse($(".geometry-notes-panel"));
                pulse($(".calibration-results-panel"));
            }
        }

        Object.entries(inputs).forEach(([key, input]) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => {
                state.lastParam = key;
                render(true);
            });
        });
        bindStepControls("calibration", state, render);
        render(false);
    }

    initProjectionPage();
    initCameraPage();
    initCalibrationPage();
}());
