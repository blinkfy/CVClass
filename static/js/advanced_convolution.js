(function () {
    const els = {
        tabs: document.querySelectorAll(".conv-subtab"),
        panels: document.querySelectorAll(".conv-tab-panel"),
        advancedBackBtn: document.getElementById("advancedBackBtn"),
        advancedBriefBtn: document.getElementById("advancedBriefBtn"),
        advancedBriefBox: document.getElementById("advancedBriefBox"),
        advancedBriefContent: document.getElementById("advancedBriefContent"),
        pointwiseChannels: document.getElementById("pointwiseChannels"),
        pointwiseWeights: document.getElementById("pointwiseWeights"),
        pointwiseOutput: document.getElementById("pointwiseOutput"),
        pointwiseOutputs: document.getElementById("pointwiseOutputs"),
        pointwiseFormula: document.getElementById("pointwiseFormula"),
        pointwiseParams: document.getElementById("pointwiseParams"),
        asppBranches: document.getElementById("asppBranches"),
        asppMaps: document.getElementById("asppMaps"),
        asppShapes: document.getElementById("asppShapes"),
        dsCases: document.querySelectorAll(".ds-case"),
        dsStandardGrid: document.getElementById("dsStandardGrid"),
        dsFixedGrid: document.getElementById("dsFixedGrid"),
        dsDynamicGrid: document.getElementById("dsDynamicGrid"),
        dsStandardResponse: document.getElementById("dsStandardResponse"),
        dsFixedResponse: document.getElementById("dsFixedResponse"),
        dsDynamicResponse: document.getElementById("dsDynamicResponse")
    };

    const state = {
        dsCase: "s"
    };

    function fallbackMatrix() {
        return [
            [22, 31, 48, 63, 80, 62, 41],
            [26, 42, 71, 90, 108, 88, 54],
            [34, 58, 98, 142, 124, 95, 60],
            [30, 61, 102, 168, 138, 96, 58],
            [24, 52, 87, 126, 130, 84, 47],
            [18, 34, 55, 82, 76, 51, 28],
            [10, 20, 31, 42, 38, 26, 14]
        ];
    }

    function snapshot() {
        return window.getConvolutionLabSnapshot?.() || {
            params: { channels: 3, kernelCount: 1, inputSize: 7 },
            inputs: [fallbackMatrix(), fallbackMatrix(), fallbackMatrix()]
        };
    }

    function ensureThreeChannels(inputs) {
        const base = inputs[0] || fallbackMatrix();
        const clones = [0, 1, 2].map((index) => {
            if (inputs[index]) return inputs[index];
            return base.map((row) => row.slice());
        });
        return clones;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function activateTab(tabId) {
        els.tabs.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.convTab === tabId);
        });
        els.panels.forEach((panel) => {
            panel.classList.toggle("is-active", panel.id === tabId);
        });
        if (tabId === "convAdvancedPanel") {
            renderAdvancedConvolution();
        }
        window.dispatchEvent(new Event("resize"));
    }

    function buildPointwiseFilters(channelCount) {
        return [
            Array.from({ length: channelCount }, (_, index) => [1, 2, 1][index] ?? 1),
            Array.from({ length: channelCount }, (_, index) => [2, 1, 1][index] ?? 1),
            Array.from({ length: channelCount }, (_, index) => [1, 1, 2][index] ?? 1),
            Array.from({ length: channelCount }, (_, index) => [2, 2, 1][index] ?? 1)
        ];
    }

    function renderPointwise() {
        const snap = snapshot();
        const channels = ensureThreeChannels(snap.inputs).slice(0, 3);
        const sampleR = Math.floor(channels[0].length / 2);
        const sampleC = Math.floor(channels[0][0].length / 2);
        const values = channels.map((channel) => channel[sampleR][sampleC]);
        const filters = buildPointwiseFilters(values.length);
        const focusWeights = filters[0];
        const output = values.reduce((sum, value, index) => sum + value * focusWeights[index], 0);
        const filterOutputs = filters.map((weights) =>
            values.reduce((sum, value, index) => sum + value * weights[index], 0)
        );

        els.pointwiseChannels.innerHTML = values.map((value, index) => `
            <div class="advanced-chip">
                <span>C${index + 1}</span>
                <strong>${value}</strong>
            </div>
        `).join("");

        els.pointwiseWeights.innerHTML = focusWeights.map((weight, index) => `
            <div class="advanced-weight">
                <span>w${index + 1}</span>
                <strong>${weight}</strong>
            </div>
        `).join("");

        els.pointwiseOutput.textContent = output;
        els.pointwiseFormula.innerHTML = `
            <strong>Output = C1×w1 + C2×w2 + C3×w3</strong>
            <code>Output = ${values[0]}×${focusWeights[0]} + ${values[1]}×${focusWeights[1]} + ${values[2]}×${focusWeights[2]} = ${output}</code>
        `;

        els.pointwiseOutputs.innerHTML = filterOutputs.map((value, index) => `
            <div class="advanced-filter-output">
                <strong>Filter ${index + 1}</strong>
                <span>${filters[index].map((weight, wIndex) => `w${wIndex + 1}=${weight}`).join(", ")}</span>
                <span>${value}</span>
            </div>
        `).join("");

        const cin = 3;
        const cout = 4;
        const regular = cout * cin * 3 * 3;
        const pointwise = cout * cin;
        const reduction = ((1 - pointwise / regular) * 100).toFixed(1);
        els.pointwiseParams.innerHTML = `
            <strong>参数量对比（C<sub>in</sub> = ${cin}，C<sub>out</sub> = ${cout}）</strong>
            <code>普通 3×3 参数量 = ${cout} × ${cin} × 3 × 3 = ${regular}
1×1 卷积参数量 = ${cout} × ${cin} × 1 × 1 = ${pointwise}
参数量减少比例 = ${reduction}%</code>
        `;
    }

    function createAsppSampleGrid(activePositions, toneClass) {
        const grid = document.createElement("div");
        grid.className = `aspp-sample-grid ${toneClass}`;
        grid.style.gridTemplateColumns = "repeat(7, 14px)";
        const active = new Set(activePositions.map((item) => `${item.r},${item.c}`));
        for (let r = 0; r < 7; r += 1) {
            for (let c = 0; c < 7; c += 1) {
                const cell = document.createElement("span");
                cell.className = "aspp-sample-cell";
                if (active.has(`${r},${c}`)) {
                    cell.classList.add("active");
                }
                grid.appendChild(cell);
            }
        }
        return grid.outerHTML;
    }

    function renderAspp() {
        const branchConfigs = [
            {
                title: "Input",
                type: "node",
                label: "1×7×7"
            },
            {
                title: "Branch 1",
                type: "branch",
                tone: "blue",
                desc: "1×1 Conv",
                sub: "same-size output",
                sample: [{ r: 3, c: 3 }]
            },
            {
                title: "Branch 2",
                type: "branch",
                tone: "green",
                desc: "3×3 Conv, d=1, p=1",
                sub: "effectiveK=3",
                sample: [
                    { r: 2, c: 2 }, { r: 2, c: 3 }, { r: 2, c: 4 },
                    { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 },
                    { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 4, c: 4 }
                ]
            },
            {
                title: "Branch 3",
                type: "branch",
                tone: "orange",
                desc: "3×3 Conv, d=2, p=2",
                sub: "effectiveK=5",
                sample: [
                    { r: 1, c: 1 }, { r: 1, c: 3 }, { r: 1, c: 5 },
                    { r: 3, c: 1 }, { r: 3, c: 3 }, { r: 3, c: 5 },
                    { r: 5, c: 1 }, { r: 5, c: 3 }, { r: 5, c: 5 }
                ]
            },
            {
                title: "Branch 4",
                type: "branch",
                tone: "purple",
                desc: "3×3 Conv, d=3, p=3",
                sub: "effectiveK=7",
                sample: [
                    { r: 0, c: 0 }, { r: 0, c: 3 }, { r: 0, c: 6 },
                    { r: 3, c: 0 }, { r: 3, c: 3 }, { r: 3, c: 6 },
                    { r: 6, c: 0 }, { r: 6, c: 3 }, { r: 6, c: 6 }
                ]
            },
            {
                title: "Concat",
                type: "node",
                label: "4×7×7"
            },
            {
                title: "1×1 Fusion",
                type: "node",
                label: "1×7×7"
            },
            {
                title: "ASPP Output",
                type: "node accent",
                label: "1×7×7"
            }
        ];

        els.asppBranches.innerHTML = branchConfigs.map((item) => {
            if (item.type.startsWith("node")) {
                return `<div class="aspp-node ${item.type.includes("accent") ? "accent" : ""}">${item.title}<br><span>${item.label}</span></div>`;
            }
            return `
                <div class="aspp-branch-card ${item.tone}">
                    <strong>${item.title}</strong>
                    <span>${item.desc}</span>
                    <span>${item.sub}</span>
                    ${createAsppSampleGrid(item.sample, item.tone)}
                    <span>输出：1×7×7</span>
                </div>
            `;
        }).join("");

        els.asppShapes.innerHTML = `
            <strong>形状流与 same-size padding</strong>
            <code>Input: 1×7×7
Branch 1: 1×1 Conv -> 1×7×7
Branch 2: 3×3 Conv, dilation=1, padding=1 -> 1×7×7
Branch 3: 3×3 Conv, dilation=2, padding=2 -> 1×7×7
Branch 4: 3×3 Conv, dilation=3, padding=3 -> 1×7×7
Concat: 4×7×7
1×1 Fusion: 1×7×7

d=1 -> effectiveK=3
d=2 -> effectiveK=5
d=3 -> effectiveK=7</code>
        `;

        els.asppMaps.innerHTML = `
            <div class="aspp-shape-card">
                <strong>Input</strong>
                <span>1×7×7</span>
            </div>
            <div class="aspp-shape-card">
                <strong>4 个分支各输出</strong>
                <span>1×7×7</span>
            </div>
            <div class="aspp-shape-card">
                <strong>Concat</strong>
                <span>4×7×7</span>
            </div>
            <div class="aspp-shape-card">
                <strong>Fusion</strong>
                <span>1×7×7</span>
            </div>
        `;
    }

    function makeStructureMatrix(type) {
        const matrix = Array.from({ length: 7 }, () => Array(7).fill(18));
        const paint = (r, c, value = 240) => {
            if (r >= 0 && r < 7 && c >= 0 && c < 7) {
                matrix[r][c] = value;
            }
        };

        const cases = {
            line: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5]],
            diagonal: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]],
            s: [[1, 2], [1, 3], [2, 3], [3, 4], [4, 3], [5, 3], [5, 4]],
            broken: [[1, 2], [2, 2], [3, 2], [4, 4], [5, 4]]
        };

        cases[type].forEach(([r, c], index) => {
            paint(r, c, index % 2 === 0 ? 230 : 255);
        });
        return matrix;
    }

    function standardWindow() {
        const path = [];
        for (let r = 2; r <= 4; r += 1) {
            for (let c = 2; c <= 4; c += 1) {
                path.push({ r, c });
            }
        }
        return path;
    }

    function fixedSnakePath() {
        return [
            { r: 2, c: 2, label: 1 },
            { r: 2, c: 3, label: 2 },
            { r: 3, c: 3, label: 3 },
            { r: 4, c: 3, label: 4 },
            { r: 4, c: 2, label: 5 }
        ];
    }

    function dynamicPath(matrix) {
        const path = [{ r: 5, c: 1, label: 1 }];
        const used = new Set(["5,1"]);

        while (path.length < 5) {
            const last = path[path.length - 1];
            const neighbors = [
                { r: last.r - 1, c: last.c },
                { r: last.r - 1, c: last.c + 1 },
                { r: last.r, c: last.c + 1 },
                { r: last.r + 1, c: last.c + 1 },
                { r: last.r + 1, c: last.c }
            ].filter((item) => (
                item.r >= 0 &&
                item.r < 7 &&
                item.c >= 0 &&
                item.c < 7 &&
                !used.has(`${item.r},${item.c}`)
            ));

            neighbors.sort((a, b) => matrix[b.r][b.c] - matrix[a.r][a.c]);
            const next = neighbors[0] || {
                r: clamp(last.r - 1, 0, 6),
                c: clamp(last.c + 1, 0, 6)
            };
            used.add(`${next.r},${next.c}`);
            path.push({ ...next, label: path.length + 1 });
        }

        return path;
    }

    function samplingSum(matrix, path) {
        return path.reduce((sum, item) => sum + matrix[item.r][item.c], 0);
    }

    function renderDsGrid(container, matrix, options) {
        if (!container) return;
        const rows = matrix.length;
        const cols = matrix[0].length;
        const pathMap = new Map((options.path || []).map((item) => [`${item.r},${item.c}`, item.label]));
        const windowSet = new Set((options.window || []).map((item) => `${item.r},${item.c}`));
        const hot = new Set((options.hot || []).map((item) => `${item.r},${item.c}`));

        container.innerHTML = "";
        container.style.gridTemplateColumns = `repeat(${cols}, 34px)`;

        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                const key = `${r},${c}`;
                const cell = document.createElement("span");
                cell.className = "ds-cell";
                cell.textContent = pathMap.has(key) ? pathMap.get(key) : "";
                if (hot.has(key)) cell.classList.add("hot");
                if (windowSet.has(key)) cell.classList.add("window");
                if (pathMap.has(key)) cell.classList.add(options.pathClass || "path");
                container.appendChild(cell);
            }
        }
    }

    function renderDsconv() {
        const matrix = makeStructureMatrix(state.dsCase);
        const standard = standardWindow();
        const fixed = fixedSnakePath();
        const dynamic = dynamicPath(matrix);
        const hot = [];

        matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value > 150) {
                    hot.push({ r, c });
                }
            });
        });

        renderDsGrid(els.dsStandardGrid, matrix, { window: standard, hot });
        renderDsGrid(els.dsFixedGrid, matrix, { path: fixed, hot, pathClass: "path" });
        renderDsGrid(els.dsDynamicGrid, matrix, { path: dynamic, hot, pathClass: "dynamic" });
    }

    function renderBrief() {
        if (!els.advancedBriefContent) return;
        els.advancedBriefContent.textContent = [
            "1. 1×1 Conv 主要用于通道融合。它不扩大空间邻域，而是在同一像素位置上对多个通道做加权求和，因此特别适合做‌逐点卷积。",
            "2. ASPP 通过多个不同 dilation 的并行分支获得不同大小的感受野，再将这些分支 concat 后用 1×1 Conv 融合，兼顾局部细节与全局上下文。",
            "3. DSConv 更关注细长、弯曲结构。标准卷积使用规则方形采样，固定蛇形卷积使用预设路径，而动态蛇形卷积则尝试让采样路径贴近目标结构。",
            "4. 本页所有内容都采用教学简化版可视化，重点帮助理解卷积结构设计思路，而不是复现完整论文实现。"
        ].join("\n\n");
    }

    function initSubTabs() {
        els.tabs.forEach((button) => {
            if (!button.dataset.convTab) return;
            button.addEventListener("click", () => {
                activateTab(button.dataset.convTab);
            });
        });
    }

    function initDsCases() {
        els.dsCases.forEach((button) => {
            button.addEventListener("click", () => {
                state.dsCase = button.dataset.case;
                els.dsCases.forEach((item) => item.classList.toggle("is-active", item === button));
                renderDsconv();
            });
        });
    }

    function initActions() {
        els.advancedBackBtn?.addEventListener("click", () => {
            activateTab("convBasicPanel");
        });

        els.advancedBriefBtn?.addEventListener("click", () => {
            renderBrief();
            els.advancedBriefBox?.classList.toggle("is-hidden");
        });
    }

    function renderAdvancedConvolution() {
        if (!document.getElementById("convAdvancedPanel")) return;
        renderPointwise();
        renderAspp();
        renderDsconv();
    }

    window.renderAdvancedConvolution = renderAdvancedConvolution;

    initSubTabs();
    initDsCases();
    initActions();
    if (window.location.hash === "#convAdvancedPanel") {
        activateTab("convAdvancedPanel");
    }
    renderAdvancedConvolution();
}());
