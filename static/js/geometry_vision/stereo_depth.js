(function () {
    const root = document.querySelector(".stereo-lab");
    if (!root) return;

    const MOTION_MS = 680;
    const $ = (selector, base = root) => base.querySelector(selector);
    const $$ = (selector, base = root) => [...base.querySelectorAll(selector)];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
    const fmtInt = (value) => String(Math.round(Number(value) || 0));

    const stepSets = {
        parallel: [
            {id: "point", title: "空间点 P", detail: "选中三维点 P，观察它相对左右相机的位置。"},
            {id: "cameras", title: "双相机与基线", detail: "左右光心 OL / OR 被已知基线 b 分开。"},
            {id: "rays", title: "投影射线", detail: "同一三维点分别向两个相机形成投影射线。"},
            {id: "planes", title: "成像平面", detail: "左右成像平面上出现 xL 和 xR。"},
            {id: "epipolar", title: "水平极线", detail: "校正后对应点位于同一水平扫描线。"},
            {id: "search", title: "扫描线搜索", detail: "右图候选点只沿水平线滑动搜索。"},
        ],
        disparity: [
            {id: "pick", title: "选中同名点", detail: "选中左右图中的同名点。"},
            {id: "measure", title: "测量 xL / xR", detail: "读取左右图像中的水平坐标。"},
            {id: "disparity", title: "计算视差 d", detail: "计算 d = xL - xR。"},
            {id: "rays", title: "三角测量", detail: "左右相机射线相交得到空间点。"},
            {id: "depth", title: "深度 Z", detail: "用 Z = bf / d 计算距离。"},
            {id: "error", title: "误差敏感性", detail: "观察 Δd 如何放大成深度误差。"},
        ],
        block: [
            {id: "rectified", title: "校正图像对", detail: "左右图像已经校正，扫描线水平对齐。"},
            {id: "patch", title: "选择左 patch", detail: "从左图裁出当前局部窗口。"},
            {id: "search", title: "扫描线搜索", detail: "右图候选窗口沿同一行移动。"},
            {id: "cost", title: "匹配代价", detail: "对每个候选视差计算匹配代价。"},
            {id: "wta", title: "WTA 选择", detail: "选择代价最小或相关性最大的视差。"},
            {id: "disparityMap", title: "视差图", detail: "逐 patch 写入整张视差图。"},
            {id: "depthMap", title: "深度图", detail: "把视差图转换为深度图。"},
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
                <strong>${step.title}</strong>
                <small>${step.detail}</small>
            </article>
        `).join("");
    }

    function updateStepper(kind, activeId) {
        const steps = stepSets[kind] || [];
        const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
        $$(`[data-stereo-stepper="${kind}"] [data-stereo-phase]`).forEach((item) => {
            const index = steps.findIndex((step) => step.id === item.dataset.stereoPhase);
            item.classList.toggle("is-active", item.dataset.stereoPhase === activeId);
            item.classList.toggle("is-complete", index >= 0 && index < activeIndex);
        });
        const select = $(`[data-stereo-step-select="${kind}"]`);
        if (select && select.value !== activeId) select.value = activeId;
    }

    function bindStepControls(kind, state, render) {
        const steps = stepSets[kind] || [];
        const select = $(`[data-stereo-step-select="${kind}"]`);
        select?.addEventListener("change", () => {
            state.step = select.value;
            render(true);
        });

        $$(`[data-stereo-stepper="${kind}"] [data-stereo-phase]`).forEach((item) => {
            item.addEventListener("click", () => {
                state.step = item.dataset.stereoPhase;
                render(true);
            });
        });

        const move = (delta) => {
            const current = Math.max(0, steps.findIndex((step) => step.id === state.step));
            state.step = steps[(current + delta + steps.length) % steps.length].id;
            render(true);
        };

        $(`[data-stereo-prev="${kind}"]`)?.addEventListener("click", () => move(-1));
        $(`[data-stereo-next="${kind}"]`)?.addEventListener("click", () => move(1));
        const play = $(`[data-stereo-play="${kind}"]`);
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

    function gridLines(width, height, step) {
        const lines = [];
        for (let x = step; x < width; x += step) {
            lines.push(`<line class="stereo-grid-line" x1="${x}" y1="0" x2="${x}" y2="${height}"></line>`);
        }
        for (let y = step; y < height; y += step) {
            lines.push(`<line class="stereo-grid-line" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`);
        }
        return lines.join("");
    }

    function markerDefs() {
        return `
            <defs>
                <marker id="stereo-arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#0891b2"></path>
                </marker>
                <marker id="stereo-arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed"></path>
                </marker>
            </defs>
        `;
    }

    function depthToY(depth, minY = 54, maxY = 236) {
        const t = (clamp(depth, 1.2, 8.5) - 1.2) / 7.3;
        return maxY - t * (maxY - minY);
    }

    function formatDepth(value, unit) {
        if (unit === "mm") return `${fmt(value * 1000, 0)} mm`;
        if (unit === "px") return `${fmt(value, 2)} Z units`;
        return `${fmt(value, 2)} m`;
    }

    function miniScene(id, x, y, width, height, shift = 0, options = {}) {
        const baseY = y + height;
        const far = shift * 0.18;
        const mid = shift * 0.55;
        const near = shift;
        const lowTexture = options.lowTexture ? `
            <rect class="stereo-scene-low-texture" x="${x + width * 0.08 - near}" y="${y + height * 0.58}" width="${width * 0.36}" height="${height * 0.18}" rx="8"></rect>
            <text x="${x + width * 0.1 - near}" y="${y + height * 0.69}" fill="#64748b" font-size="10" font-weight="900">低纹理</text>
        ` : "";
        const occlusion = options.occlusion ? `
            <rect class="stereo-occlusion-zone" x="${x + width * 0.66}" y="${y + height * 0.45}" width="${width * 0.2}" height="${height * 0.32}" rx="10"></rect>
            <text x="${x + width * 0.68}" y="${y + height * 0.64}" fill="#b45309" font-size="10" font-weight="900">遮挡</text>
        ` : "";
        return `
            <defs>
                <clipPath id="${id}">
                    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14"></rect>
                </clipPath>
            </defs>
            <g clip-path="url(#${id})">
                <rect class="stereo-scene-sky" x="${x}" y="${y}" width="${width}" height="${height}"></rect>
                <rect class="stereo-scene-ground" x="${x}" y="${y + height * 0.64}" width="${width}" height="${height * 0.36}"></rect>
                <path class="stereo-scene-far" d="M${x - 12 - far} ${baseY - height * 0.36} L${x + width * 0.14 - far} ${y + height * 0.18} L${x + width * 0.34 - far} ${baseY - height * 0.36} Z"></path>
                <path class="stereo-scene-far" d="M${x + width * 0.22 - far} ${baseY - height * 0.36} L${x + width * 0.46 - far} ${y + height * 0.24} L${x + width * 0.72 - far} ${baseY - height * 0.36} Z"></path>
                <rect class="stereo-scene-mid" x="${x + width * 0.58 - mid}" y="${y + height * 0.28}" width="${width * 0.2}" height="${height * 0.36}" rx="8"></rect>
                <rect class="stereo-scene-mid" x="${x + width * 0.68 - mid}" y="${y + height * 0.2}" width="${width * 0.16}" height="${height * 0.44}" rx="8"></rect>
                <rect class="stereo-scene-front" x="${x + width * 0.34 - near}" y="${y + height * 0.56}" width="${width * 0.3}" height="${height * 0.22}" rx="14"></rect>
                <circle class="stereo-scene-front" cx="${x + width * 0.42 - near}" cy="${y + height * 0.79}" r="${height * 0.045}"></circle>
                <circle class="stereo-scene-front" cx="${x + width * 0.57 - near}" cy="${y + height * 0.79}" r="${height * 0.045}"></circle>
                ${lowTexture}
                ${occlusion}
            </g>
        `;
    }

    function initParallelPage() {
        if (!$("[data-stereo-parallel]")) return;
        const state = {step: "point", timer: 0};
        const inputs = {};
        $$("[data-stereo-parallel-input]").forEach((input) => {
            inputs[input.dataset.stereoParallelInput] = input;
        });

        function readConfig() {
            return {
                scene: inputs.scene?.value || "single",
                baseline: Number(inputs.baseline?.value || 0.18),
                focal: Number(inputs.focal?.value || 720),
                depth: Number(inputs.depth?.value || 3.2),
                lateral: Number(inputs.lateral?.value || 0.2),
                showCameras: inputs.showCameras?.checked !== false,
                showBaseline: inputs.showBaseline?.checked !== false,
                showRays: inputs.showRays?.checked !== false,
                showPlanes: inputs.showPlanes?.checked !== false,
                showEpipolar: inputs.showEpipolar?.checked !== false,
                showMatch: inputs.showMatch?.checked !== false,
            };
        }

        function stereoProjection(config) {
            const disparity = config.baseline * config.focal / Math.max(config.depth, 0.2);
            const center = 178 + config.lateral * config.focal / Math.max(config.depth, 0.2) * 0.18;
            return {
                disparity,
                xL: clamp(center, 70, 286),
                xR: clamp(center - disparity, 62, 286),
                y: 128,
            };
        }

        function sceneObjects(config, ox, oy, scale) {
            if (config.scene === "grid") {
                const dots = [];
                for (let row = 0; row < 3; row += 1) {
                    for (let col = 0; col < 5; col += 1) {
                        dots.push(`<circle class="stereo-scene-object" cx="${ox + (col - 2) * scale * 0.28}" cy="${oy + (row - 1) * scale * 0.18}" r="4"></circle>`);
                    }
                }
                return dots.join("");
            }
            if (config.scene === "two") {
                return `
                    <rect class="stereo-scene-object" x="${ox - 52}" y="${oy + 28}" width="44" height="34" rx="8"></rect>
                    <rect class="stereo-scene-object stereo-scene-object--accent" x="${ox + 18}" y="${oy - 16}" width="48" height="44" rx="10"></rect>
                `;
            }
            if (config.scene === "street") {
                return `
                    <path class="stereo-scene-object" d="M${ox - 88} ${oy + 60} L${ox - 44} ${oy - 8} L${ox} ${oy + 60} Z"></path>
                    <rect class="stereo-scene-object stereo-scene-object--accent" x="${ox + 24}" y="${oy + 18}" width="72" height="34" rx="16"></rect>
                    <circle class="stereo-scene-object" cx="${ox + 44}" cy="${oy + 58}" r="9"></circle>
                    <circle class="stereo-scene-object" cx="${ox + 78}" cy="${oy + 58}" r="9"></circle>
                `;
            }
            return `<circle class="stereo-point" cx="${ox}" cy="${oy}" r="8"></circle>`;
        }

        function renderGeometrySvg(config, projection) {
            const sep = 220 + config.baseline * 520;
            const left = {x: 380 - sep / 2, y: 262};
            const right = {x: 380 + sep / 2, y: 262};
            const point = {x: 380 + config.lateral * 76, y: depthToY(config.depth, 48, 220)};
            const planeY = left.y - 64;
            const planeXL = left.x + (projection.xL - 178) * 0.32;
            const planeXR = right.x + (projection.xR - 178) * 0.32;
            const cameras = config.showCameras ? `
                <path class="stereo-camera" d="M${left.x - 24} ${left.y + 18} L${left.x} ${left.y - 24} L${left.x + 24} ${left.y + 18} Z"></path>
                <path class="stereo-camera" d="M${right.x - 24} ${right.y + 18} L${right.x} ${right.y - 24} L${right.x + 24} ${right.y + 18} Z"></path>
                <circle class="stereo-camera-center" cx="${left.x}" cy="${left.y}" r="6"></circle>
                <circle class="stereo-camera-center" cx="${right.x}" cy="${right.y}" r="6"></circle>
                <text x="${left.x - 18}" y="${left.y + 42}" fill="#5b21b6" font-size="12" font-weight="900">OL</text>
                <text x="${right.x - 18}" y="${right.y + 42}" fill="#5b21b6" font-size="12" font-weight="900">OR</text>
            ` : "";
            const baseline = config.showBaseline ? `
                <line class="stereo-baseline" x1="${left.x}" y1="${left.y + 26}" x2="${right.x}" y2="${right.y + 26}"></line>
                <text x="${(left.x + right.x) / 2 - 46}" y="${left.y + 48}" fill="#0e7490" font-size="12" font-weight="900">基线 b = ${fmt(config.baseline, 2)} m</text>
            ` : "";
            const planes = config.showPlanes ? `
                <line class="stereo-epipolar" x1="${left.x - 52}" y1="${planeY}" x2="${left.x + 52}" y2="${planeY}"></line>
                <line class="stereo-epipolar" x1="${right.x - 52}" y1="${planeY}" x2="${right.x + 52}" y2="${planeY}"></line>
                <circle class="stereo-image-point" cx="${planeXL}" cy="${planeY}" r="5"></circle>
                <circle class="stereo-image-point" cx="${planeXR}" cy="${planeY}" r="5"></circle>
                <text x="${left.x - 38}" y="${planeY - 13}" fill="#64748b" font-size="11" font-weight="850">左成像面</text>
                <text x="${right.x - 38}" y="${planeY - 13}" fill="#64748b" font-size="11" font-weight="850">右成像面</text>
            ` : "";
            const rays = config.showRays ? `
                <line class="stereo-ray" x1="${left.x}" y1="${left.y}" x2="${point.x}" y2="${point.y}"></line>
                <line class="stereo-ray stereo-ray--right" x1="${right.x}" y1="${right.y}" x2="${point.x}" y2="${point.y}"></line>
                ${config.showPlanes ? `<line class="stereo-ray" x1="${point.x}" y1="${point.y}" x2="${planeXL}" y2="${planeY}"></line><line class="stereo-ray stereo-ray--right" x1="${point.x}" y1="${point.y}" x2="${planeXR}" y2="${planeY}"></line>` : ""}
            ` : "";
            return `
                <svg viewBox="0 0 760 320" role="img" aria-label="平行双目几何示意">
                    ${markerDefs()}
                    <rect class="stereo-image-window" x="24" y="20" width="712" height="270" rx="18"></rect>
                    ${gridLines(760, 320, 38)}
                    <line class="stereo-axis" x1="52" y1="262" x2="708" y2="262"></line>
                    ${planes}
                    ${rays}
                    ${sceneObjects(config, point.x, point.y, 86)}
                    ${config.scene === "single" ? "" : `<circle class="stereo-point" cx="${point.x}" cy="${point.y}" r="6"></circle>`}
                    ${cameras}
                    ${baseline}
                    <text x="42" y="48" fill="#1d4ed8" font-size="13" font-weight="900">校正后光轴平行，极线水平对齐</text>
                    <text x="${point.x + 12}" y="${point.y - 10}" fill="#5b21b6" font-size="12" font-weight="900">P(X,Y,Z)</text>
                </svg>
            `;
        }

        function renderImagePairSvg(config, projection) {
            const rightOffset = 388;
            const rightWindowX = rightOffset - 16;
            const sceneShift = clamp(projection.disparity * 0.72, 8, 72);
            const epipolar = config.showEpipolar ? `
                <line class="stereo-epipolar" x1="44" y1="${projection.y}" x2="684" y2="${projection.y}"></line>
                <text x="520" y="${projection.y - 12}" fill="#0e7490" font-size="11" font-weight="850">同一水平扫描线</text>
            ` : "";
            const match = config.showMatch ? `
                <line class="stereo-bracket" x1="${projection.xL}" y1="${projection.y + 34}" x2="${rightOffset + projection.xR}" y2="${projection.y + 34}"></line>
                <text x="288" y="${projection.y + 58}" fill="#b45309" font-size="12" font-weight="900">视差提示 d = xL - xR</text>
            ` : "";
            const candidateX = clamp(rightOffset + projection.xR + 48, rightWindowX + 42, rightWindowX + 282);
            const candidate = config.showEpipolar ? `<circle class="stereo-candidate-point" cx="${candidateX}" cy="${projection.y}" r="5"></circle>` : "";
            return `
                <svg viewBox="0 0 720 310" role="img" aria-label="校正后左右图像同一水平扫描线">
                    <rect class="stereo-image-window" x="28" y="42" width="304" height="205" rx="16"></rect>
                    <rect class="stereo-image-window" x="${rightWindowX}" y="42" width="304" height="205" rx="16"></rect>
                    ${gridLines(720, 310, 24)}
                    ${miniScene("parallel-left-scene", 28, 42, 304, 205, 0, {lowTexture: config.scene === "street"})}
                    ${miniScene("parallel-right-scene", rightWindowX, 42, 304, 205, sceneShift, {lowTexture: config.scene === "street"})}
                    <text x="48" y="70" fill="#1d4ed8" font-size="13" font-weight="900">左图 Left</text>
                    <text x="${rightOffset + 4}" y="70" fill="#1d4ed8" font-size="13" font-weight="900">右图 Right</text>
                    ${epipolar}
                    <circle class="stereo-image-point" cx="${projection.xL}" cy="${projection.y}" r="7"></circle>
                    <circle class="stereo-image-point" cx="${rightOffset + projection.xR}" cy="${projection.y}" r="7"></circle>
                    ${candidate}
                    ${match}
                    <text x="${projection.xL - 18}" y="${projection.y - 14}" fill="#0e7490" font-size="12" font-weight="900">xL</text>
                    <text x="${rightOffset + projection.xR - 18}" y="${projection.y - 14}" fill="#0e7490" font-size="12" font-weight="900">xR</text>
                    <rect class="stereo-search-band" x="${rightOffset + 54}" y="${projection.y - 18}" width="196" height="36" rx="18"></rect>
                    <text x="${rightOffset + 76}" y="${projection.y + 6}" fill="#0e7490" font-size="11" font-weight="850">右图候选沿此行滑动</text>
                </svg>
            `;
        }

        function renderParallelStatus(config, projection) {
            const matchState = config.showEpipolar ? "yL = yR，二维搜索降为一维" : "极线隐藏，仅保留投影关系";
            const baselineNote = config.baseline > 0.24 ? "基线偏大，视差更明显" : "基线适中，视差稳定可见";
            return `
                <header><strong>当前几何状态</strong><small>同一个 P 在左右图形成一对同名点</small></header>
                <div class="stereo-status-grid">
                    <span>空间点<b>X=${fmt(config.lateral, 1)}m / Z=${fmt(config.depth, 1)}m</b></span>
                    <span>投影坐标<b>xL=${fmt(projection.xL, 1)} / xR=${fmt(projection.xR, 1)}</b></span>
                    <span>水平约束<b>${matchState}</b></span>
                    <span>基线观察<b>${baselineNote}</b></span>
                </div>
            `;
        }

        const notes = {
            point: [["同一个三维点", "P 在真实空间中只有一个位置，但会被左右相机各自投影到图像平面。"], ["深度影响", "Z 越小，同一个基线下左右投影位置差越明显。"]],
            cameras: [["左右相机", "平行双目由两个光轴平行的相机组成，基线 b 是两光心之间的距离。"], ["已知标定", "b 与 f 已知后，视差可以直接换算成深度。"]],
            rays: [["投影射线", "P 到 OL 和 OR 的两条射线分别决定 xL 与 xR。"], ["同名点", "左右图上来自同一 P 的点就是匹配目标。"]],
            planes: [["成像平面", "左右图像平面接收各自投影点，校正后两图行方向对齐。"], ["坐标关系", "水平坐标差会成为后续深度计算的视差。"]],
            epipolar: [["水平极线", "校正后 yL = yR，因此不必在整张右图二维搜索。"], ["搜索约束", "匹配范围从区域搜索压缩为一条扫描线。"]],
            search: [["一维搜索", "右图候选点沿同一水平线滑动，寻找外观最相似的位置。"], ["进入视差", "最佳匹配确定 xR 后，d = xL - xR 就可以用于深度计算。"]],
        };

        function render(animated) {
            const config = readConfig();
            const projection = stereoProjection(config);
            setText('[data-stereo-parallel-output="baseline"]', `${fmt(config.baseline, 2)} m`);
            setText('[data-stereo-parallel-output="focal"]', `${fmtInt(config.focal)} px`);
            setText('[data-stereo-parallel-output="depth"]', `${fmt(config.depth, 1)} m`);
            setText('[data-stereo-parallel-output="lateral"]', `${fmt(config.lateral, 1)} m`);
            setText('[data-stereo-parallel-summary="point"]', `X=${fmt(config.lateral, 1)}, Z=${fmt(config.depth, 1)}`);
            setText('[data-stereo-parallel-summary="x"]', `xL=${fmt(projection.xL, 1)}, xR=${fmt(projection.xR, 1)}`);
            setText('[data-stereo-parallel-summary="line"]', config.showEpipolar ? "同一水平行" : "已隐藏");
            setText('[data-stereo-parallel-summary="note"]', config.baseline > 0.24 ? "基线增大，视差更明显" : "搜索从二维降为一维");
            setText('[data-stereo-parallel-chip="step"]', stepSets.parallel.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-stereo-parallel-chip="baseline"]', `b = ${fmt(config.baseline, 2)} m`);
            setText('[data-stereo-parallel-chip="disparity"]', `d = ${fmt(projection.disparity, 1)} px`);
            setText("[data-stereo-parallel-notes-title]", stepSets.parallel.find((step) => step.id === state.step)?.title || "空间点 P");
            setText("[data-stereo-parallel-substitution]", `P(${fmt(config.lateral, 1)}, Y, ${fmt(config.depth, 1)}) -> xL=${fmt(projection.xL, 1)}, xR=${fmt(projection.xR, 1)}, d=${fmt(projection.disparity, 1)} px`);
            setHtml("[data-stereo-parallel-geometry]", renderGeometrySvg(config, projection));
            setHtml("[data-stereo-parallel-images]", renderImagePairSvg(config, projection));
            setHtml("[data-stereo-parallel-status]", renderParallelStatus(config, projection));
            setHtml("[data-stereo-parallel-notes]", (notes[state.step] || notes.point).map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderPreview($("[data-stereo-parallel-preview]"), stepSets.parallel, state.step);
            updateStepper("parallel", state.step);
            if (animated) pulse($(".stereo-notes-panel"));
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => render(true));
        });
        bindStepControls("parallel", state, render);
        render(false);
    }

    function initDisparityPage() {
        if (!$("[data-stereo-disparity]")) return;
        const state = {step: "pick", timer: 0};
        const inputs = {};
        $$("[data-stereo-disparity-input]").forEach((input) => {
            inputs[input.dataset.stereoDisparityInput] = input;
        });

        function readConfig() {
            return {
                sample: inputs.sample?.value || "near",
                baseline: Number(inputs.baseline?.value || 0.18),
                focal: Number(inputs.focal?.value || 720),
                disparity: Number(inputs.disparity?.value || 36),
                noise: Number(inputs.noise?.value || 0.8),
                unit: inputs.unit?.value || "m",
                showRays: inputs.showRays?.checked !== false,
                showBracket: inputs.showBracket?.checked !== false,
                showCurve: inputs.showCurve?.checked !== false,
                showError: inputs.showError?.checked !== false,
            };
        }

        function depthFrom(config, disparity) {
            return config.baseline * config.focal / Math.max(disparity, 0.5);
        }

        function imagePairSvg(config, depth) {
            const xL = 190;
            const xR = xL - config.disparity;
            const y = 132;
            const offset = 390;
            const rightWindowX = offset - 16;
            const sceneShift = clamp(config.disparity * 0.72, 10, 76);
            const bracket = config.showBracket ? `
                <line class="stereo-bracket" x1="${xL}" y1="${y + 38}" x2="${offset + xR}" y2="${y + 38}"></line>
                <text x="294" y="${y + 62}" fill="#b45309" font-size="12" font-weight="900">d = xL - xR = ${fmt(config.disparity, 1)} px</text>
            ` : "";
            const multi = config.sample === "multi" ? `
                <circle class="stereo-image-point" cx="132" cy="174" r="5"></circle>
                <circle class="stereo-image-point" cx="${offset + 106}" cy="174" r="5"></circle>
                <circle class="stereo-image-point" cx="250" cy="96" r="5"></circle>
                <circle class="stereo-image-point" cx="${offset + 224}" cy="96" r="5"></circle>
            ` : "";
            return `
                <svg viewBox="0 0 720 300" role="img" aria-label="左右图像中的视差测量">
                    <rect class="stereo-image-window" x="34" y="44" width="306" height="196" rx="16"></rect>
                    <rect class="stereo-image-window" x="${rightWindowX}" y="44" width="306" height="196" rx="16"></rect>
                    ${gridLines(720, 300, 24)}
                    ${miniScene("disparity-left-scene", 34, 44, 306, 196, 0, {lowTexture: config.sample === "far"})}
                    ${miniScene("disparity-right-scene", rightWindowX, 44, 306, 196, sceneShift, {lowTexture: config.sample === "far"})}
                    <line class="stereo-epipolar" x1="48" y1="${y}" x2="684" y2="${y}"></line>
                    <text x="54" y="72" fill="#1d4ed8" font-size="13" font-weight="900">左图 Left</text>
                    <text x="${offset + 4}" y="72" fill="#1d4ed8" font-size="13" font-weight="900">右图 Right</text>
                    ${multi}
                    <circle class="stereo-image-point" cx="${xL}" cy="${y}" r="8"></circle>
                    <circle class="stereo-image-point" cx="${offset + xR}" cy="${y}" r="8"></circle>
                    ${bracket}
                    <text x="${xL - 18}" y="${y - 16}" fill="#0e7490" font-size="12" font-weight="900">xL=${fmtInt(xL)}</text>
                    <text x="${offset + xR - 22}" y="${y - 16}" fill="#0e7490" font-size="12" font-weight="900">xR=${fmtInt(xR)}</text>
                    <text x="46" y="266" fill="#64748b" font-size="11" font-weight="850">当前深度 ${formatDepth(depth, config.unit)}，视差越大物体越近</text>
                </svg>
            `;
        }

        function geometrySvg(config, depth) {
            const left = {x: 120, y: 248};
            const right = {x: 420, y: 248};
            const point = {x: 270, y: depthToY(depth, 42, 224)};
            const zLineX = 492;
            const rays = config.showRays ? `
                <line class="stereo-ray" x1="${left.x}" y1="${left.y}" x2="${point.x}" y2="${point.y}"></line>
                <line class="stereo-ray stereo-ray--right" x1="${right.x}" y1="${right.y}" x2="${point.x}" y2="${point.y}"></line>
            ` : "";
            const error = config.showError && config.noise > 0 ? `
                <rect x="252" y="${clamp(point.y - config.noise * 18, 42, 230)}" width="36" height="${clamp(config.noise * 36, 6, 100)}" rx="18" fill="rgba(245,158,11,.16)" stroke="#f59e0b"></rect>
                <text x="298" y="${clamp(point.y + 4, 54, 228)}" fill="#b45309" font-size="11" font-weight="900">Δd 误差带</text>
            ` : "";
            return `
                <svg viewBox="0 0 540 300" role="img" aria-label="三角测量射线和深度平面">
                    ${markerDefs()}
                    <rect class="stereo-image-window" x="26" y="26" width="488" height="246" rx="18"></rect>
                    ${gridLines(540, 300, 27)}
                    <line class="stereo-baseline" x1="${left.x}" y1="${left.y + 22}" x2="${right.x}" y2="${right.y + 22}"></line>
                    <text x="244" y="${left.y + 43}" fill="#0e7490" font-size="12" font-weight="900">b = ${fmt(config.baseline, 2)} m</text>
                    ${rays}
                    ${error}
                    <line class="stereo-depth-plane" x1="64" y1="${point.y}" x2="476" y2="${point.y}"></line>
                    <line class="stereo-bracket" x1="${zLineX}" y1="${point.y}" x2="${zLineX}" y2="${left.y}" marker-end="url(#stereo-arrow-cyan)"></line>
                    <text x="${zLineX - 34}" y="${(point.y + left.y) / 2}" fill="#b45309" font-size="12" font-weight="900">Z</text>
                    <path class="stereo-camera" d="M${left.x - 24} ${left.y + 16} L${left.x} ${left.y - 24} L${left.x + 24} ${left.y + 16} Z"></path>
                    <path class="stereo-camera" d="M${right.x - 24} ${right.y + 16} L${right.x} ${right.y - 24} L${right.x + 24} ${right.y + 16} Z"></path>
                    <circle class="stereo-camera-center" cx="${left.x}" cy="${left.y}" r="6"></circle>
                    <circle class="stereo-camera-center" cx="${right.x}" cy="${right.y}" r="6"></circle>
                    <text x="${left.x - 20}" y="${left.y + 40}" fill="#5b21b6" font-size="11" font-weight="900">OL</text>
                    <text x="${right.x - 20}" y="${right.y + 40}" fill="#5b21b6" font-size="11" font-weight="900">OR</text>
                    <circle class="stereo-point" cx="${point.x}" cy="${point.y}" r="8"></circle>
                    <text x="${point.x + 13}" y="${point.y - 8}" fill="#5b21b6" font-size="12" font-weight="900">P, Z=${formatDepth(depth, config.unit)}</text>
                    <text x="44" y="52" fill="#1d4ed8" font-size="13" font-weight="900">两条射线相交得到深度</text>
                </svg>
            `;
        }

        function curveSvg(config, depth) {
            const width = 360;
            const height = 300;
            const x0 = 54;
            const y0 = 244;
            const w = 260;
            const h = 178;
            const maxZ = depthFrom(config, 8);
            const mapX = (d) => x0 + ((d - 8) / 76) * w;
            const mapY = (z) => y0 - clamp(z / maxZ, 0, 1) * h;
            const points = [];
            for (let d = 8; d <= 84; d += 3) {
                points.push(`${fmt(mapX(d), 1)},${fmt(mapY(depthFrom(config, d)), 1)}`);
            }
            const curX = mapX(config.disparity);
            const curY = mapY(depth);
            const zLow = depthFrom(config, config.disparity + config.noise);
            const zHigh = depthFrom(config, Math.max(1, config.disparity - config.noise));
            const band = config.showError && config.noise > 0 ? `
                <rect x="${curX - 10}" y="${mapY(zHigh)}" width="20" height="${Math.max(4, mapY(zLow) - mapY(zHigh))}" rx="10" fill="rgba(245,158,11,.2)" stroke="#f59e0b"></rect>
            ` : "";
            const curve = config.showCurve ? `<polyline points="${points.join(" ")}" fill="none" stroke="#2563eb" stroke-width="3"></polyline>` : "";
            const sensitivity = Math.abs(config.baseline * config.focal / Math.max(config.disparity * config.disparity, 1));
            return `
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="视差和深度的反比曲线">
                    <rect class="stereo-image-window" x="20" y="24" width="320" height="244" rx="18"></rect>
                    ${gridLines(width, height, 24)}
                    <line class="stereo-axis" x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}"></line>
                    <line class="stereo-axis" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - h}"></line>
                    ${band}
                    ${curve}
                    <circle class="stereo-point" cx="${curX}" cy="${curY}" r="6"></circle>
                    <text x="${x0 + w - 22}" y="${y0 + 20}" fill="#64748b" font-size="11">d</text>
                    <text x="${x0 - 20}" y="${y0 - h + 4}" fill="#64748b" font-size="11">Z</text>
                    <text x="44" y="54" fill="#1d4ed8" font-size="13" font-weight="900">Z = bf / d</text>
                    <text x="44" y="82" fill="#172554" font-size="20" font-weight="950">${formatDepth(depth, config.unit)}</text>
                    <text x="44" y="104" fill="#64748b" font-size="11">b=${fmt(config.baseline, 2)}m, f=${fmtInt(config.focal)}px, d=${fmt(config.disparity, 1)}px</text>
                    <text x="44" y="126" fill="#b45309" font-size="11" font-weight="900">|∂Z/∂d|≈${fmt(sensitivity, 2)} m/px</text>
                    <text x="170" y="54" fill="#64748b" font-size="11" font-weight="850">小视差区域曲线更陡</text>
                </svg>
            `;
        }

        function renderDisparityCalculator(config, depth, zLow, zHigh) {
            const numerator = config.baseline * config.focal;
            const derivative = -numerator / Math.max(config.disparity * config.disparity, 1);
            const rangeText = config.noise > 0
                ? `${formatDepth(zLow, config.unit)} - ${formatDepth(zHigh, config.unit)}`
                : "未加入 Δd";
            return `
                <header><strong>公式代入</strong><small>实时更新 b / f / d / Z</small></header>
                <div class="stereo-calculation-chain">
                    <span>公式<b>Z = b · f / d</b></span>
                    <span>代入<b>${fmt(config.baseline, 2)} × ${fmtInt(config.focal)} / ${fmt(config.disparity, 1)}</b></span>
                    <span>结果<b>${formatDepth(depth, config.unit)}</b></span>
                    <span>误差<b>Δd=${fmt(config.noise, 1)}px -> ${rangeText}</b></span>
                    <span>敏感度<b>∂Z/∂d=${fmt(derivative, 3)}</b></span>
                </div>
            `;
        }

        const notes = {
            pick: [["同名点", "左右图像中的两个亮点来自同一个三维点 P。"], ["校正前提", "页面聚焦校正后的平行双目，因此匹配点在同一水平行。"]],
            measure: [["坐标测量", "读取左图 xL 与右图 xR 的水平像素坐标。"], ["方向约定", "这里使用 d = xL - xR，近处点的 d 更大。"]],
            disparity: [["计算视差", "视差是左右图像投影点的水平位置差。"], ["深度线索", "d 本身不是深度，但它与深度成反比。"]],
            rays: [["射线相交", "从左右相机出发的两条射线在空间中交于 P。"], ["三角关系", "b、f、d 构成相似三角形关系。"]],
            depth: [["深度公式", "Z = bf / d 把基线、焦距和视差合并为深度估计。"], ["近大远小", "d 越大，Z 越小；d 越小，Z 越大。"]],
            error: [["误差敏感性", "Δd 在分母上影响 Z，远处小视差更容易被放大。"], ["观察曲线", "d-Z 曲线在小 d 区域更陡，深度误差带更宽。"]],
        };

        function render(animated) {
            const config = readConfig();
            const depth = depthFrom(config, config.disparity);
            const xL = 190;
            const xR = xL - config.disparity;
            const zLow = depthFrom(config, config.disparity + config.noise);
            const zHigh = depthFrom(config, Math.max(1, config.disparity - config.noise));
            setText('[data-stereo-disparity-output="baseline"]', `${fmt(config.baseline, 2)} m`);
            setText('[data-stereo-disparity-output="focal"]', `${fmtInt(config.focal)} px`);
            setText('[data-stereo-disparity-output="disparity"]', `${fmt(config.disparity, 1)} px`);
            setText('[data-stereo-disparity-output="noise"]', `${fmt(config.noise, 1)} px`);
            setText('[data-stereo-disparity-summary="x"]', `${fmtInt(xL)} / ${fmtInt(xR)}`);
            setText('[data-stereo-disparity-summary="d"]', `${fmt(config.disparity, 1)} px`);
            setText('[data-stereo-disparity-summary="z"]', formatDepth(depth, config.unit));
            setText('[data-stereo-disparity-summary="error"]', config.noise > 0 ? `${formatDepth(zLow, config.unit)} - ${formatDepth(zHigh, config.unit)}` : "无噪声");
            setText('[data-stereo-disparity-chip="step"]', stepSets.disparity.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-stereo-disparity-chip="depth"]', `Z = ${formatDepth(depth, config.unit)}`);
            setText("[data-stereo-disparity-notes-title]", stepSets.disparity.find((step) => step.id === state.step)?.title || "选中同名点");
            setText("[data-stereo-disparity-substitution]", `b=${fmt(config.baseline, 2)}m, f=${fmtInt(config.focal)}px, d=${fmt(config.disparity, 1)}px -> Z=${formatDepth(depth, config.unit)}`);
            setHtml("[data-stereo-disparity-images]", imagePairSvg(config, depth));
            setHtml("[data-stereo-disparity-geometry]", geometrySvg(config, depth));
            setHtml("[data-stereo-disparity-curve]", curveSvg(config, depth));
            setHtml("[data-stereo-disparity-calculator]", renderDisparityCalculator(config, depth, zLow, zHigh));
            setHtml("[data-stereo-disparity-notes]", (notes[state.step] || notes.pick).map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderPreview($("[data-stereo-disparity-preview]"), stepSets.disparity, state.step);
            updateStepper("disparity", state.step);
            if (animated) pulse($(".stereo-notes-panel"));
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => render(true));
        });
        bindStepControls("disparity", state, render);
        render(false);
    }

    function patchValue(sample, row, col, size) {
        const x = col - (size - 1) / 2;
        const y = row - (size - 1) / 2;
        if (sample === "textureless") return 126 + (row + col) % 2 * 3;
        if (sample === "street") return 96 + row * 10 + col * 7 + Math.sin((row + 1) * (col + 2)) * 16;
        if (sample === "occlusion") return 112 + (x * x + y * y) * 6 + (col > size / 2 ? 22 : 0);
        return 118 + x * 12 - y * 7 + ((row + col) % 3) * 18;
    }

    function makePatch(size, sample, delta, noise) {
        const cells = [];
        for (let row = 0; row < size; row += 1) {
            for (let col = 0; col < size; col += 1) {
                const wobble = Math.sin(row * 7.7 + col * 3.1 + delta * 0.21) * noise * 16;
                const mismatch = Math.abs(delta) * (sample === "textureless" ? 0.28 : 1.45);
                const occlusion = sample === "occlusion" && col > size * 0.62 && delta > 10 ? 34 : 0;
                cells.push(clamp(Math.round(patchValue(sample, row, col, size) + wobble + mismatch + occlusion), 0, 255));
            }
        }
        return cells;
    }

    function computeCost(left, right, type) {
        if (type === "ssd") {
            return left.reduce((sum, value, index) => {
                const diff = value - right[index];
                return sum + diff * diff;
            }, 0) / Math.max(left.length, 1);
        }
        if (type === "ncc") {
            const meanL = left.reduce((sum, value) => sum + value, 0) / left.length;
            const meanR = right.reduce((sum, value) => sum + value, 0) / right.length;
            let num = 0;
            let denL = 0;
            let denR = 0;
            left.forEach((value, index) => {
                const a = value - meanL;
                const b = right[index] - meanR;
                num += a * b;
                denL += a * a;
                denR += b * b;
            });
            return num / Math.max(Math.sqrt(denL * denR), 0.0001);
        }
        return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0);
    }

    function patchMatrix(cells, size, diffFrom) {
        return `
            <div class="stereo-patch-matrix" style="--patch-size:${size}">
                ${cells.map((value, index) => `<i class="${diffFrom && Math.abs(value - diffFrom[index]) > 12 ? "is-diff" : ""}">${fmtInt(diffFrom ? Math.abs(value - diffFrom[index]) : value)}</i>`).join("")}
            </div>
        `;
    }

    function initBlockPage() {
        if (!$("[data-stereo-block]")) return;
        const state = {step: "rectified", timer: 0};
        const inputs = {};
        $$("[data-stereo-block-input]").forEach((input) => {
            inputs[input.dataset.stereoBlockInput] = input;
        });

        function readConfig() {
            return {
                sample: inputs.sample?.value || "blocks",
                cost: inputs.cost?.value || "sad",
                windowSize: Number(inputs.windowSize?.value || 5),
                minD: Number(inputs.minD?.value || 4),
                maxD: Number(inputs.maxD?.value || 44),
                stepD: Number(inputs.stepD?.value || 4),
                noise: Number(inputs.noise?.value || 0.4),
                showSearch: inputs.showSearch?.checked !== false,
                showCurve: inputs.showCurve?.checked !== false,
                showDisparity: inputs.showDisparity?.checked !== false,
                showDepth: inputs.showDepth?.checked !== false,
                showConfidence: inputs.showConfidence?.checked !== false,
            };
        }

        function trueDisparity(sample) {
            return {blocks: 28, street: 34, occlusion: 42, textureless: 18}[sample] || 28;
        }

        function costSet(config) {
            const size = config.windowSize;
            const truth = trueDisparity(config.sample);
            const left = makePatch(size, config.sample, 0, config.noise);
            const candidates = [];
            const maxD = Math.max(config.maxD, config.minD + config.stepD);
            for (let d = config.minD; d <= maxD; d += config.stepD) {
                const right = makePatch(size, config.sample, d - truth, config.noise);
                candidates.push({d, right, value: computeCost(left, right, config.cost)});
            }
            const best = candidates.reduce((chosen, item) => {
                if (!chosen) return item;
                return config.cost === "ncc"
                    ? (item.value > chosen.value ? item : chosen)
                    : (item.value < chosen.value ? item : chosen);
            }, null);
            const current = candidates[Math.min(candidates.length - 1, Math.floor(candidates.length / 2))] || best;
            return {left, candidates, best, current, truth};
        }

        function renderPairSvg(config, data) {
            const patchX = 190;
            const patchY = 166;
            const offset = 390;
            const bestX = offset + patchX - data.best.d;
            const currentX = offset + patchX - data.current.d;
            const search = config.showSearch ? `<rect class="stereo-search-band" x="${offset + patchX - config.maxD - 28}" y="${patchY - 26}" width="${config.maxD - config.minD + 56}" height="52" rx="18"></rect>` : "";
            const conf = config.sample === "occlusion" || config.sample === "textureless"
                ? `<rect x="${offset + 58}" y="214" width="212" height="42" rx="14" fill="rgba(245,158,11,.12)" stroke="#f59e0b"></rect><text x="${offset + 78}" y="240" fill="#b45309" font-size="12" font-weight="900">低置信区域</text>`
                : "";
            return `
                <svg viewBox="0 0 720 340" role="img" aria-label="块匹配左右校正图像和搜索带">
                    <rect class="stereo-image-window" x="34" y="42" width="306" height="244" rx="16"></rect>
                    <rect class="stereo-image-window" x="${offset - 16}" y="42" width="306" height="244" rx="16"></rect>
                    ${gridLines(720, 340, 24)}
                    ${miniScene("block-left-scene", 34, 42, 306, 244, 0, {lowTexture: config.sample === "textureless", occlusion: config.sample === "occlusion"})}
                    ${miniScene("block-right-scene", offset - 16, 42, 306, 244, data.truth * 0.9, {lowTexture: config.sample === "textureless", occlusion: config.sample === "occlusion"})}
                    <text x="54" y="72" fill="#1d4ed8" font-size="13" font-weight="900">左图 Left</text>
                    <text x="${offset + 4}" y="72" fill="#1d4ed8" font-size="13" font-weight="900">右图 Right</text>
                    <line class="stereo-epipolar" x1="50" y1="${patchY}" x2="682" y2="${patchY}"></line>
                    ${search}
                    <rect class="stereo-patch-box" x="${patchX - 26}" y="${patchY - 26}" width="52" height="52" rx="8"></rect>
                    <rect class="stereo-candidate-box" x="${currentX - 26}" y="${patchY - 26}" width="52" height="52" rx="8"></rect>
                    <rect class="stereo-best-box" x="${bestX - 26}" y="${patchY - 26}" width="52" height="52" rx="8"></rect>
                    ${conf}
                    <text x="${patchX - 42}" y="${patchY - 38}" fill="#5b21b6" font-size="12" font-weight="900">左图 patch</text>
                    <text x="${bestX - 42}" y="${patchY - 38}" fill="#0e7490" font-size="12" font-weight="900">最佳 d=${data.best.d}</text>
                    <text x="${currentX - 42}" y="${patchY + 48}" fill="#b45309" font-size="11" font-weight="900">当前候选</text>
                    <rect x="44" y="304" width="632" height="24" rx="12" fill="rgba(239,246,255,.92)" stroke="#dbeafe"></rect>
                    <text x="60" y="320" fill="#64748b" font-size="11" font-weight="850">同一扫描线搜索：左 patch 固定，右候选窗口按 d=${config.minD}...${config.maxD}px 滑动，逐个生成代价柱</text>
                </svg>
            `;
        }

        function renderCostPanel(config, data) {
            const size = config.windowSize;
            const best = data.best;
            const current = data.current;
            const right = best.right;
            const values = data.candidates.map((item) => item.value);
            const maxV = Math.max(...values);
            const minV = Math.min(...values);
            const isNcc = config.cost === "ncc";
            const rule = isNcc ? "NCC 取最高相关峰 argmax" : "SAD/SSD 取最低代价谷 argmin";
            const bars = config.showCurve ? data.candidates.map((item) => {
                const t = (item.value - minV) / Math.max(maxV - minV, 0.0001);
                const h = 22 + t * 104;
                const bestClass = item === best ? `is-best ${isNcc ? "is-peak" : "is-valley"}` : "";
                return `<span class="stereo-cost-bar ${bestClass} ${item === current ? "is-current" : ""}" style="height:${h}px"><small>${item.d}</small>${item === best ? "<em>best</em>" : ""}</span>`;
            }).join("") : "<span>代价曲线已隐藏</span>";
            const formula = config.cost === "ssd" ? "SSD = Σ (IL - IR)^2" : config.cost === "ncc" ? "NCC = corr(IL, IR)" : "SAD = Σ |IL - IR|";
            const bestValue = isNcc ? fmt(best.value, 3) : fmt(best.value, 1);
            const currentValue = isNcc ? fmt(current.value, 3) : fmt(current.value, 1);
            const margin = isNcc
                ? Math.max(0, best.value - current.value)
                : Math.max(0, current.value - best.value);
            const marginLabel = isNcc ? fmt(margin, 3) : fmt(margin, 1);
            return `
                <article class="stereo-cost-card stereo-cost-card--microscope">
                    <strong>${formula}</strong>
                    <div class="stereo-cost-summary">
                        <span>窗口<b>${size}x${size}</b></span>
                        <span>当前候选<b>d=${current.d}px / ${currentValue}</b></span>
                        <span>最佳候选<b>d=${best.d}px / ${bestValue}</b></span>
                        <span>区分度<b>${marginLabel}</b></span>
                    </div>
                    <div class="stereo-matrix-triplet">
                        <div><b>左 patch</b>${patchMatrix(data.left, size)}</div>
                        <div><b>最佳右候选</b>${patchMatrix(right, size)}</div>
                        <div><b>差分 |ΔI|</b>${patchMatrix(right, size, data.left)}</div>
                    </div>
                </article>
                <article class="stereo-cost-card stereo-cost-card--curve">
                    <strong>${isNcc ? "相关性曲线 correlation" : "代价曲线 cost"}</strong>
                    <div class="stereo-cost-bars" data-rule="${rule}" style="--bar-count:${data.candidates.length}">${bars}</div>
                    <span>${rule}；当前最佳 d=${best.d}px，数值=${bestValue}。</span>
                </article>
            `;
        }

        function mapColor(value, depthMode) {
            const t = clamp(value, 0, 1);
            if (depthMode) {
                if (t > 0.66) return "#c4b5fd";
                if (t > 0.36) return "#93c5fd";
                return "#67e8f9";
            }
            if (t > 0.66) return "#7c3aed";
            if (t > 0.36) return "#2563eb";
            return "#0891b2";
        }

        function mapGrid(config, data, depthMode) {
            const cells = [];
            for (let index = 0; index < 48; index += 1) {
                const row = Math.floor(index / 8);
                const col = index % 8;
                const wave = Math.sin(row * 1.2 + col * 0.7);
                const near = (data.truth + wave * 8) / 54;
                const value = depthMode ? 1 - near : near;
                const low = config.showConfidence && ((config.sample === "textureless" && row > 2 && col < 5) || (config.sample === "occlusion" && col > 5));
                const active = index === 27;
                cells.push(`<span class="stereo-map-cell ${active ? "is-active" : ""} ${low ? "is-low-confidence" : ""}" style="--cell-color:${mapColor(value, depthMode)}"></span>`);
            }
            return `<div class="stereo-map-grid">${cells.join("")}</div>`;
        }

        function renderMaps(config, data) {
            const disparity = config.showDisparity ? mapGrid(config, data, false) : "<span>disparity map 已隐藏</span>";
            const depth = config.showDepth ? mapGrid(config, data, true) : "<span>depth map 已隐藏</span>";
            const depthValue = fmt(0.18 * 720 / Math.max(data.best.d, 1), 2);
            const confidence = config.sample === "textureless" ? "低纹理" : config.sample === "occlusion" ? "遮挡风险" : "可靠";
            return `
                <article class="stereo-map-card">
                    <strong>视差图 disparity map</strong>
                    ${disparity}
                    <div class="stereo-map-legend"><span>小视差</span><span>大视差</span></div>
                </article>
                <article class="stereo-map-card">
                    <strong>深度图 depth map</strong>
                    ${depth}
                    <div class="stereo-map-legend"><span>近</span><span>远</span></div>
                </article>
                <article class="stereo-map-card">
                    <strong>当前写入</strong>
                    <div class="stereo-map-summary">
                        <span>patch<b>(3, 4)</b></span>
                        <span>best d<b>${data.best.d}px</b></span>
                        <span>深度 Z<b>${depthValue}m</b></span>
                        <span>置信<b>${confidence}</b></span>
                    </div>
                </article>
            `;
        }

        function renderBlockStatus(config, data, confidence) {
            const isNcc = config.cost === "ncc";
            const rule = isNcc ? "最大相关性 argmax" : "最小代价 argmin";
            const valueLabel = isNcc ? fmt(data.best.value, 3) : fmt(data.best.value, 1);
            return `
                <header><strong>当前块匹配状态</strong><small>每个候选视差都真实计算一次 ${config.cost.toUpperCase()}</small></header>
                <div class="stereo-status-grid">
                    <span>搜索范围<b>${config.minD}-${config.maxD}px / step ${config.stepD}px</b></span>
                    <span>WTA 规则<b>${rule}</b></span>
                    <span>最佳候选<b>d=${data.best.d}px, value=${valueLabel}</b></span>
                    <span>输出写入<b>${confidence}</b></span>
                </div>
            `;
        }

        const notes = {
            rectified: [["校正图像对", "左右图像已被校正到同一水平扫描线。"], ["输入结构", "块匹配假设同名 patch 只会发生水平位移。"]],
            patch: [["左图 patch", "从左图选定当前窗口，后续所有候选都与它比较。"], ["窗口大小", "大窗口更稳定但会模糊边界，小窗口更敏感但受噪声影响更大。"]],
            search: [["扫描线搜索", "在右图同一行内按 minD 到 maxD 枚举候选视差。"], ["候选窗口", "每个 d 对应右图中一个被平移的候选 patch。"]],
            cost: [["代价函数", "SAD / SSD 衡量差异，NCC 衡量归一化相关性。"], ["逐候选计算", "前端会为每个候选 d 真实计算窗口代价。"]],
            wta: [["Winner-Take-All", "选择最小代价或最大相关性的候选作为当前视差。"], ["置信度", "如果曲线很平或有遮挡，最佳值并不一定可靠。"]],
            disparityMap: [["视差图", "对每个像素或 patch 重复同样过程，写入一张稠密视差图。"], ["低置信标记", "遮挡和低纹理区域用斜纹标出，提示匹配不稳定。"]],
            depthMap: [["深度图", "视差图通过 Z = bf / d 转换为深度图。"], ["颜色含义", "页面使用蓝、青、蓝紫表达层次，不使用彩虹深度图。"]],
        };

        function render(animated) {
            const config = readConfig();
            if (config.maxD <= config.minD) {
                config.maxD = config.minD + config.stepD;
                if (inputs.maxD) inputs.maxD.value = String(config.maxD);
            }
            const data = costSet(config);
            const confidence = config.sample === "textureless" ? "低纹理，曲线偏平" : config.sample === "occlusion" ? "存在遮挡区域" : "匹配稳定";
            const costLabel = config.cost === "ncc" ? fmt(data.best.value, 3) : fmt(data.best.value, 1);
            setText('[data-stereo-block-output="minD"]', fmtInt(config.minD));
            setText('[data-stereo-block-output="maxD"]', fmtInt(config.maxD));
            setText('[data-stereo-block-output="stepD"]', `${fmtInt(config.stepD)} px`);
            setText('[data-stereo-block-output="noise"]', fmt(config.noise, 1));
            setText('[data-stereo-block-summary="candidates"]', `${data.candidates.length}`);
            setText('[data-stereo-block-summary="best"]', `${data.best.d} px`);
            setText('[data-stereo-block-summary="cost"]', costLabel);
            setText('[data-stereo-block-summary="confidence"]', confidence);
            setText('[data-stereo-block-chip="step"]', stepSets.block.find((step) => step.id === state.step)?.title || state.step);
            setText('[data-stereo-block-chip="cost"]', config.cost.toUpperCase());
            setText('[data-stereo-block-chip="best"]', `d = ${data.best.d}px`);
            setText("[data-stereo-block-notes-title]", stepSets.block.find((step) => step.id === state.step)?.title || "校正图像对");
            setText("[data-stereo-block-formula]", config.cost === "ssd" ? "SSD = Σ (IL - IR)^2" : config.cost === "ncc" ? "NCC = corr(IL, IR)" : "SAD = Σ |IL - IR|");
            setText("[data-stereo-block-wta-rule]", config.cost === "ncc" ? "d* = argmax corr(d)" : "d* = argmin C(d)");
            setText("[data-stereo-block-formula-note]", config.cost === "ncc" ? "NCC 使用最大相关性：d* = argmax corr(d)。" : "SAD / SSD 使用最小代价：d* = argmin C(d)。");
            setText("[data-stereo-block-substitution]", `best d=${data.best.d}px, ${config.cost.toUpperCase()}=${costLabel}, candidates=${data.candidates.length}`);
            setHtml("[data-stereo-block-pair]", renderPairSvg(config, data));
            setHtml("[data-stereo-block-cost]", renderCostPanel(config, data));
            setHtml("[data-stereo-block-maps]", renderMaps(config, data));
            setHtml("[data-stereo-block-status]", renderBlockStatus(config, data, confidence));
            setHtml("[data-stereo-block-notes]", (notes[state.step] || notes.rectified).map((item, index) => `
                <article><span>${index + 1}</span><div><strong>${item[0]}</strong><p>${item[1]}</p></div></article>
            `).join(""));
            renderPreview($("[data-stereo-block-preview]"), stepSets.block, state.step);
            updateStepper("block", state.step);
            if (animated) pulse($(".stereo-notes-panel"));
        }

        Object.values(inputs).forEach((input) => {
            input.addEventListener(input.type === "range" ? "input" : "change", () => render(true));
        });
        bindStepControls("block", state, render);
        render(false);
    }

    initParallelPage();
    initDisparityPage();
    initBlockPage();
}());
