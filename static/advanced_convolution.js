(function () {
    const els = {
        tabs: document.querySelectorAll(".conv-subtab"),
        panels: document.querySelectorAll(".conv-tab-panel"),
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

    const state = { dsCase: "line" };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function fallbackMatrix() {
        return [
            [12, 34, 60, 80, 50, 33, 18],
            [20, 56, 90, 130, 86, 42, 22],
            [26, 70, 150, 210, 145, 66, 30],
            [18, 64, 120, 180, 128, 56, 24],
            [10, 40, 84, 110, 92, 44, 16],
            [8, 24, 48, 72, 54, 28, 12],
            [4, 14, 26, 34, 28, 18, 8]
        ];
    }

    function snapshot() {
        return window.getConvolutionLabSnapshot?.() || {
            params: { channels: 3, kernelCount: 1, inputSize: 7 },
            inputs: [fallbackMatrix()]
        };
    }

    function ensureThreeChannels(inputs, base) {
        const first = inputs?.[0] || base || fallbackMatrix();
        const second = inputs?.[1] || first.map((row, r) => row.map((value, c) => clamp(value + ((r + c) % 3 - 1) * 12, 0, 255)));
        const third = inputs?.[2] || first.map((row, r) => row.map((value, c) => clamp(255 - value + ((r * 2 + c) % 4) * 6, 0, 255)));
        return [first, second, third];
    }

    function buildPointwiseFilters() {
        return [
            [1, 2, 3],
            [2, 1, 1],
            [-1, 1, 2],
            [1, -1, 1]
        ];
    }

    function renderGrid(container, matrix, options = {}) {
        if (!container) return;
        const rows = matrix.length;
        const cols = matrix[0]?.length || 0;
        const labels = new Map((options.labels || []).map((item) => [`${item.r},${item.c}`, item.label]));
        const hot = new Set((options.hot || []).map((item) => `${item.r},${item.c}`));
        const windowCells = new Set((options.window || []).map((item) => `${item.r},${item.c}`));
        const cellSize = options.cellSize || 18;

        container.innerHTML = "";
        container.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;

        matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                const key = `${r},${c}`;
                const cell = document.createElement("span");
                cell.className = options.cellClass || "mini-cell";
                if (options.cellSizeClass) cell.classList.add(options.cellSizeClass);
                cell.textContent = labels.has(key) ? labels.get(key) : value;
                if (hot.has(key)) cell.classList.add("hot");
                if (windowCells.has(key)) cell.classList.add("window");
                if (labels.has(key)) cell.classList.add(options.activeClass || "path");
                container.appendChild(cell);
            });
        });
    }

    function convSame(matrix, dilation = 1, padding = dilation, kernel = [[1, 1, 1], [1, 1, 1], [1, 1, 1]]) {
        const rows = matrix.length;
        const cols = matrix[0]?.length || 0;
        const paddedRows = rows + padding * 2;
        const paddedCols = cols + padding * 2;
        const padded = Array.from({ length: paddedRows }, () => Array(paddedCols).fill(0));
        matrix.forEach((row, r) => {
            row.forEach((value, c) => {
                padded[r + padding][c + padding] = value;
            });
        });

        return Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
                let sum = 0;
                for (let kr = 0; kr < 3; kr += 1) {
                    for (let kc = 0; kc < 3; kc += 1) {
                        const rr = r + kr * dilation;
                        const cc = c + kc * dilation;
                        sum += padded[rr][cc] * kernel[kr][kc];
                    }
                }
                return Math.round(sum / 9);
            })
        );
    }

    function renderPointwise() {
        const snap = snapshot();
        const base = snap.inputs[0] || fallbackMatrix();
        const channels = ensureThreeChannels(snap.inputs, base);
        const cin = 3;
        const cout = 4;
        const sampleR = Math.floor(base.length / 2);
        const sampleC = Math.floor(base[0].length / 2);
        const values = channels.map((channel) => channel[sampleR]?.[sampleC] ?? base[sampleR][sampleC]);
        const filters = buildPointwiseFilters();
        const outputs = filters.map((weights) =>
            values.reduce((sum, value, index) => sum + value * weights[index], 0)
        );

        els.pointwiseChannels.innerHTML = values.map((value, index) =>
            `<div class="advanced-chip">C${index + 1}<br>${value}</div>`
        ).join("");
        els.pointwiseWeights.innerHTML = filters[0].map((value, index) =>
            `<div class="advanced-weight">w${index + 1}<br>${value}</div>`
        ).join("");
        els.pointwiseOutput.textContent = outputs[0];
        els.pointwiseOutputs.innerHTML = outputs.map((output, index) =>
            `<div class="advanced-filter-output"><span>Filter ${index + 1}</span><strong>${output}</strong></div>`
        ).join("");
        els.pointwiseFormula.innerHTML = `
            <strong>通道加权求和</strong>
            <code>Output = C1×w1 + C2×w2 + C3×w3
  = ${values[0]}×${filters[0][0]} + ${values[1]}×${filters[0][1]} + ${values[2]}×${filters[0][2]}
  = ${outputs[0]}</code>
        `;
        els.pointwiseParams.innerHTML = `
            <strong>参数量对比</strong>
            <code>C_in = 3, C_out = 4
普通 3×3 参数量 = 4 × 3 × 3 × 3 = 108
1×1 参数量 = 4 × 3 × 1 × 1 = 12
参数量减少比例 = 88.9%</code>
        `;
    }

    function renderAspp() {
        const snap = snapshot();
        const input = snap.inputs[0] || fallbackMatrix();
        const branches = [
            { name: "Branch 1", label: "1×1 Conv", dilation: 0, padding: 0, map: input.map((row) => row.slice()) },
            { name: "Branch 2", label: "3×3 Conv, d=1", dilation: 1, padding: 1, map: convSame(input, 1, 1) },
            { name: "Branch 3", label: "3×3 Conv, d=2", dilation: 2, padding: 2, map: convSame(input, 2, 2) },
            { name: "Branch 4", label: "3×3 Conv, d=3", dilation: 3, padding: 3, map: convSame(input, 3, 3) }
        ];
        const fusion = input.map((row, r) =>
            row.map((_, c) => Math.round(branches.reduce((sum, item) => sum + item.map[r][c], 0) / branches.length))
        );

        els.asppBranches.innerHTML = branches.map((branch) => {
            const effective = branch.dilation === 0 ? 1 : branch.dilation * (3 - 1) + 1;
            const extra = branch.dilation ? `, effectiveK=${effective}` : "";
            return `<div class="aspp-branch">${branch.name}<span>${branch.label}${extra}</span></div>`;
        }).join("");

        const maps = [
            ...branches.map((branch, index) => ({
                title: `Branch ${index + 1}`,
                subtitle: index === 0 ? "1×1 输出" : `same-size 输出, padding=${branch.padding}`,
                map: branch.map
            })),
            { title: "Fusion", subtitle: "1×1 融合输出", map: fusion }
        ];

        els.asppMaps.innerHTML = maps.map((item) => `
            <div class="advanced-mini-map">
                <h4>${item.title}<span>${item.subtitle}</span></h4>
                <div class="mini-map-grid aspp-mini-map" data-map="${item.title}"></div>
            </div>
        `).join("");

        maps.forEach((item) => {
            renderGrid(els.asppMaps.querySelector(`[data-map="${item.title}"]`), item.map, {
                cellSize: 18,
                cellClass: "mini-cell aspp-cell",
                cellSizeClass: "aspp-cell"
            });
        });

        els.asppShapes.innerHTML = `
            <strong>形状流</strong>
            <code>Input: 1×7×7
Branch outputs: 4 × (1×7×7)
Concat: 4×7×7
1×1 Fusion: 1×7×7
d=1 → effectiveK=3
d=2 → effectiveK=5
d=3 → effectiveK=7</code>
        `;
    }

    function makeStructureMatrix(type) {
        const matrix = Array.from({ length: 7 }, () => Array(7).fill(12));
        const paint = (r, c, value = 220) => {
            if (r >= 0 && r < 7 && c >= 0 && c < 7) matrix[r][c] = value;
        };
        const paths = {
            line: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5]],
            diagonal: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]],
            s: [[1, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [5, 4]],
            broken: [[1, 2], [2, 2], [3, 2], [4, 4], [5, 4]]
        };
        paths[type].forEach(([r, c], index) => paint(r, c, index % 2 ? 245 : 210));
        return matrix;
    }

    function fixedSnakePath() {
        return [[2, 1], [2, 2], [2, 3], [3, 3], [3, 4]].map(([r, c], index) => ({ r, c, label: index + 1 }));
    }

    function standardWindow() {
        const path = [];
        for (let r = 2; r <= 4; r += 1) {
            for (let c = 2; c <= 4; c += 1) path.push({ r, c });
        }
        return path;
    }

    function dynamicPath(matrix) {
        const path = [{ r: 3, c: 1 }];
        const used = new Set(["3,1"]);
        for (let i = 0; i < 4; i += 1) {
            const last = path[path.length - 1];
            const candidates = [
                { r: last.r - 1, c: last.c + 1 },
                { r: last.r, c: last.c + 1 },
                { r: last.r + 1, c: last.c + 1 },
                { r: last.r - 1, c: last.c },
                { r: last.r + 1, c: last.c }
            ].filter((p) => p.r >= 0 && p.r < 7 && p.c >= 0 && p.c < 7 && !used.has(`${p.r},${p.c}`));
            candidates.sort((a, b) => matrix[b.r][b.c] - matrix[a.r][a.c]);
            const next = candidates[0] || { r: clamp(last.r, 0, 6), c: clamp(last.c + 1, 0, 6) };
            used.add(`${next.r},${next.c}`);
            path.push(next);
        }
        return path.map((item, index) => ({ ...item, label: index + 1 }));
    }

    function samplingSum(matrix, path) {
        return path.reduce((sum, pos) => sum + matrix[pos.r][pos.c], 0);
    }

    function renderDsconv() {
        const matrix = makeStructureMatrix(state.dsCase);
        const standard = standardWindow();
        const fixed = fixedSnakePath();
        const dynamic = dynamicPath(matrix);
        const hot = [];
        matrix.forEach((row, r) => row.forEach((value, c) => {
            if (value > 100) hot.push({ r, c });
        }));

        renderGrid(els.dsStandardGrid, matrix, {
            cellSize: 20,
            cellClass: "ds-cell",
            window: standard,
            hot
        });
        renderGrid(els.dsFixedGrid, matrix, {
            cellSize: 20,
            cellClass: "ds-cell",
            labels: fixed,
            activeClass: "path",
            hot
        });
        renderGrid(els.dsDynamicGrid, matrix, {
            cellSize: 20,
            cellClass: "ds-cell",
            labels: dynamic,
            activeClass: "dynamic",
            hot
        });
   }

    function initSubTabs() {
        els.tabs.forEach((button) => {
            button.addEventListener("click", () => {
                els.tabs.forEach((item) => item.classList.toggle("is-active", item === button));
                els.panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === button.dataset.convTab));
                window.renderAdvancedConvolution();
                window.dispatchEvent(new Event("resize"));
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

    window.renderAdvancedConvolution = function renderAdvancedConvolution() {
        if (!document.getElementById("convAdvancedPanel")) return;
        renderPointwise();
        renderAspp();
        renderDsconv();
    };

    initSubTabs();
    initDsCases();
    window.renderAdvancedConvolution();
}());
