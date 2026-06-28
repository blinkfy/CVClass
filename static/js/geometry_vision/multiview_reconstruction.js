(function () {
    const root = document.querySelector(".multiview-lab");
    if (!root) return;

    const MOTION_MS = 680;
    const AUTO_PLAY_MS = 1480;
    const $ = (selector, base = root) => base.querySelector(selector);
    const $$ = (selector, base = root) => [...base.querySelectorAll(selector)];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
    const fmtInt = (value) => String(Math.round(Number(value) || 0));
    const pad2 = (value) => String(Math.round(Number(value) || 0)).padStart(2, "0");
    const basePath = window.CVCLASS_BASE_PATH || "";
    const htmlCache = new WeakMap();
    const textCache = new WeakMap();
    const mathDirtyTargets = new Set();
    const realState = {
        data: null,
        promise: null,
        error: "",
    };
    const realPresetPath = "assets/examples/multiview/middlebury_cones/reconstruction.json";

    const stepSets = {
        epipolar: [
            {id: "matches", title: "特征匹配", en: "Feature Matches", detail: "从结构角点和边缘中选择同名点 \\(\\mathbf{x}/\\mathbf{x}'\\)。"},
            {id: "estimateF", title: "估计基础矩阵", en: "Estimate F", detail: "多组匹配约束合并，估计基础矩阵 \\(\\mathbf{F}\\)。"},
            {id: "epiline", title: "点到极线", en: "Point to Line", detail: "左图点 \\(\\mathbf{x}\\) 经过 \\(\\mathbf{F}\\) 映射为右图极线 \\(\\mathbf{l}'\\)。"},
            {id: "error", title: "对极误差", en: "Epipolar Error", detail: "计算 \\(|\\mathbf{x}'^{\\mathsf T}\\mathbf{F}\\mathbf{x}|\\)，衡量候选点到极线的距离。"},
            {id: "ransac", title: "RANSAC 内点", en: "RANSAC Inliers", detail: "误差小于阈值的点保留，外点降低权重。"},
        ],
        pose: [
            {id: "matches", title: "特征匹配", en: "Matches", detail: "使用已通过对极几何筛选的匹配约束。"},
            {id: "f", title: "基础矩阵", en: "F Matrix", detail: "\\(\\mathbf{F}\\) 描述像素坐标中的对极约束。"},
            {id: "normalize", title: "内参归一化", en: "Normalize with K", detail: "\\(\\mathbf{K}\\) 与 \\(\\mathbf{K}'\\) 合入 \\(\\mathbf{F}\\)，把约束转到相机坐标。"},
            {id: "e", title: "本质矩阵", en: "Essential Matrix \\(\\mathbf{E}\\)", detail: "\\(\\mathbf{E}=\\mathbf{K}'^{\\mathsf T}\\mathbf{F}\\mathbf{K}\\)，表达相对运动约束。"},
            {id: "decompose", title: "分解 E", en: "Decompose \\(\\mathbf{E}\\)", detail: "SVD 生成 \\(\\mathbf{R}_1\\)、\\(\\mathbf{R}_2\\)、\\(+\\mathbf{t}\\)、\\(-\\mathbf{t}\\)。"},
            {id: "cheirality", title: "正深度检查", en: "Cheirality Check", detail: "三角化点必须位于两台相机前方。"},
            {id: "pose", title: "相机位姿", en: "Camera Pose", detail: "选择正深度最多的 \\(\\mathbf{R},\\mathbf{t}\\) 候选；\\(\\mathbf{t}\\) 只有方向。"},
        ],
        triangulation: [
            {id: "matched", title: "匹配点", en: "Matched Points", detail: "同步高亮两幅图像中的 \\(\\mathbf{x}/\\mathbf{x}'\\)。"},
            {id: "pose", title: "相机位姿", en: "Camera Pose", detail: "使用已恢复的 \\(\\mathbf{R},\\mathbf{t}\\) 和投影矩阵 \\(\\mathbf{P}_1\\)、\\(\\mathbf{P}_2\\)。"},
            {id: "rays", title: "反投影射线", en: "Back-project Rays", detail: "从相机中心沿匹配方向伸出两条空间射线。"},
            {id: "triangulate", title: "三角化 3D 点", en: "Triangulate \\(\\mathbf{X}\\)", detail: "有噪声时取两射线最接近处估计 \\(\\mathbf{X}\\)。"},
            {id: "reproject", title: "重投影", en: "Reproject", detail: "把 \\(\\mathbf{X}\\) 重新投影回 Image 1 / Image 2。"},
            {id: "error", title: "误差检查", en: "Error Check", detail: "检测点与重投影点之间生成误差向量。"},
            {id: "cloud", title: "稀疏点云", en: "Sparse Cloud", detail: "多个可靠匹配点逐步生长为稀疏点云。"},
        ],
    };

    function containsLatex(value) {
        return /\\\(|\\\[/.test(String(value ?? ""));
    }

    function isRealMode(config) {
        return config.algorithmMode === "real";
    }

    function realDataReady(config) {
        return isRealMode(config) && realState.data && !realState.error;
    }

    function staticAssetUrl(path) {
        const value = String(path || "");
        if (!value || value.startsWith("data:") || /^https?:\/\//.test(value)) return value;
        if (value.startsWith("/")) return `${basePath}${value}`;
        return `${basePath}/static/${value}`;
    }

    function normalizeRealData(data, source = "live") {
        const normalized = {...data, source};
        normalized.images = {...(data.images || {})};
        normalized.images.left = staticAssetUrl(normalized.images.left);
        normalized.images.right = staticAssetUrl(normalized.images.right);
        return normalized;
    }

    function fetchLiveRealData() {
        const form = new FormData();
        form.set("sample", "middlebury_cones");
        form.set("max_features", "700");
        form.set("ratio_threshold", "0.74");
        form.set("ransac_threshold", "1.35");
        return fetch(`${basePath}/api/multiview-reconstruction/real-run`, {
            method: "POST",
            body: form,
        }).then(async (response) => {
            const data = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error || "真实多视图几何计算失败");
            }
            return normalizeRealData(data, "live");
        });
    }

    function ensureRealData(render) {
        if (realState.data || realState.promise) return;
        realState.error = "";
        realState.promise = fetch(staticAssetUrl(realPresetPath), {cache: "force-cache"})
            .then(async (response) => {
                if (!response.ok) throw new Error("preset missing");
                const data = await response.json();
                realState.data = normalizeRealData(data, "preset");
            })
            .catch(() => fetchLiveRealData().then((data) => {
                realState.data = data;
            })
            .catch((error) => {
                realState.error = error?.message || "真实多视图几何计算失败";
            }))
            .finally(() => {
                realState.promise = null;
                render(false);
            });
    }

    function realPendingMessage() {
        if (realState.error) return `真实算法失败：${escapeHtml(realState.error)}`;
        return realState.promise ? "真实 OpenCV 双图几何计算中..." : "准备加载真实样例...";
    }

    function matrixValue(matrix, row, col, digits = 3) {
        const value = Number(matrix?.[row]?.[col] || 0);
        if (Math.abs(value) >= 100 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
            return value.toExponential(2);
        }
        return value.toFixed(digits);
    }

    function matrixLatex(matrix, digits = 3) {
        if (!matrix?.length) return "--";
        return `\\begin{bmatrix}${matrix.map((row, rowIndex) => row.map((_, colIndex) => matrixValue(matrix, rowIndex, colIndex, digits)).join("&")).join("\\\\")}\\end{bmatrix}`;
    }

    function currentRealMatch(config) {
        const data = realState.data;
        if (!data?.matches?.length) return null;
        const count = clamp(Number(config.matchCount || 40), 1, data.matches.length);
        const matches = data.matches.slice(0, count);
        return {
            matches,
            current: clamp(Number(config.currentMatch || 1) - 1, 0, matches.length - 1),
        };
    }

    function currentRealCloud(config) {
        const data = realState.data;
        if (!data?.cloud?.points?.length) return null;
        const points = data.cloud.points.slice();
        return {
            points,
            current: clamp(Number(config.currentPoint || 1) - 1, 0, points.length - 1),
        };
    }

    function lineEndpoints(coeffs, width = 320, height = 220) {
        const a = Number(coeffs?.a || 0);
        const b = Number(coeffs?.b || 0);
        const c = Number(coeffs?.c || 0);
        const candidates = [];
        if (Math.abs(b) > 1e-9) {
            candidates.push({x: 0, y: -c / b});
            candidates.push({x: width, y: -(a * width + c) / b});
        }
        if (Math.abs(a) > 1e-9) {
            candidates.push({x: -c / a, y: 0});
            candidates.push({x: -(b * height + c) / a, y: height});
        }
        const inside = candidates.filter((p) => p.x >= -2 && p.x <= width + 2 && p.y >= -2 && p.y <= height + 2);
        if (inside.length >= 2) return [inside[0], inside[1]];
        return [{x: 12, y: height / 2}, {x: width - 12, y: height / 2}];
    }

    function updateMathDirty(el, value) {
        if (!el) return;
        if (containsLatex(value)) {
            mathDirtyTargets.add(el);
            el.classList.add("is-math-pending");
        } else {
            mathDirtyTargets.delete(el);
            el.classList.remove("is-math-pending");
        }
    }

    function setText(selector, value, base = root) {
        const el = typeof selector === "string" ? $(selector, base) : selector;
        if (!el) return false;
        const text = String(value ?? "");
        if (textCache.get(el) === text) return false;
        el.textContent = text;
        textCache.set(el, text);
        htmlCache.delete(el);
        updateMathDirty(el, text);
        return true;
    }

    function setHtml(selector, value, base = root) {
        const el = typeof selector === "string" ? $(selector, base) : selector;
        if (!el) return false;
        const html = String(value ?? "");
        if (htmlCache.get(el) === html) return false;
        el.innerHTML = html;
        htmlCache.set(el, html);
        textCache.delete(el);
        updateMathDirty(el, html);
        return true;
    }

    let mathTimer = 0;
    let mathWaitStarted = 0;
    const MATHJAX_RETRY_MS = 0;
    const MATHJAX_MAX_WAIT_MS = 1800;

    function mathTargetsFor(base = root) {
        const scope = base || root;
        return [...mathDirtyTargets].filter((target) => {
            if (!target?.isConnected) return false;
            return target === scope || scope.contains?.(target) || root.contains(target);
        });
    }

    function clearMathTargets(targets) {
        targets.forEach((target) => {
            mathDirtyTargets.delete(target);
            target.classList.remove("is-math-pending");
        });
    }

    function renderFallbackMathTargets(targets) {
        targets.forEach((target) => renderFallbackMath(target));
    }

    function typesetMath(base = root) {
        if (!mathTargetsFor(base).length) return;
        window.clearTimeout(mathTimer);
        mathTimer = window.setTimeout(() => {
            const targets = mathTargetsFor(base);
            if (!targets.length) return;
            const mathJax = window.MathJax;
            try {
                if (mathJax?.typesetPromise) {
                    mathWaitStarted = 0;
                    mathJax.typesetClear?.(targets);
                    mathJax.typesetPromise(targets)
                        .then(() => clearMathTargets(targets))
                        .catch(() => {
                            renderFallbackMathTargets(targets);
                            clearMathTargets(targets);
                        });
                    return;
                }
            } catch (error) {
                renderFallbackMathTargets(targets);
                clearMathTargets(targets);
                return;
            }
            if (!mathWaitStarted) mathWaitStarted = Date.now();
            if (Date.now() - mathWaitStarted < MATHJAX_MAX_WAIT_MS) {
                typesetMath(base);
                return;
            }
            mathWaitStarted = 0;
            renderFallbackMathTargets(targets);
            clearMathTargets(targets);
        }, MATHJAX_RETRY_MS);
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function fallbackLatexHtml(tex, displayMode = false) {
        const matrices = [];
        let source = String(tex || "").trim().replace(/\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g, (_, body) => {
            const rows = body.split(/\\\\/).map((row) => row.trim()).filter(Boolean);
            const html = `<span class="mv-math-matrix">${rows.map((row) => `
                <span class="mv-math-row">${row.split("&").map((cell) => `<span>${escapeHtml(cell.trim())}</span>`).join("")}</span>
            `).join("")}</span>`;
            matrices.push(html);
            return `@@MVMATRIX${matrices.length - 1}@@`;
        });
        let out = escapeHtml(source)
            .replace(/\\text\{([^{}]+)\}/g, "$1")
            .replace(/\\operatorname\{([^{}]+)\}/g, "$1")
            .replace(/\\mathbf\{([^{}]+)\}/g, '<span class="mv-math-vector">$1</span>')
            .replace(/\\mathsf\{([^{}]+)\}/g, "$1")
            .replace(/\\widehat\{([^{}]+)\}/g, '<span class="mv-math-hat">$1</span>')
            .replace(/\\bar\s*e/g, "e&#772;")
            .replace(/\\sum_([A-Za-z0-9]+)/g, "∑<sub>$1</sub>")
            .replace(/\\lVert/g, "‖")
            .replace(/\\rVert/g, "‖")
            .replace(/\\approx/g, "≈")
            .replace(/\\rightarrow/g, "→")
            .replace(/\\leftrightarrow/g, "↔")
            .replace(/\\ldots/g, "…")
            .replace(/\\pm/g, "±")
            .replace(/\\times/g, "×")
            .replace(/\\circ/g, "°")
            .replace(/\\,/g, " ")
            .replace(/\\ /g, " ");
        out = out
            .replace(/\^\{\\mathsf\s*T\}/g, "<sup>T</sup>")
            .replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>")
            .replace(/\^([A-Za-z0-9+\-])/g, "<sup>$1</sup>")
            .replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>")
            .replace(/_([A-Za-z0-9+\-])/g, "<sub>$1</sub>")
            .replace(/([A-Za-z])'/g, "$1&prime;")
            .replace(/@@MVMATRIX(\d+)@@/g, (_, index) => matrices[Number(index)] || "")
            .replace(/[{}]/g, "");
        return `<span class="mv-math-fallback ${displayMode ? "is-display" : ""}">${out}</span>`;
    }

    function latexToStableHtml(value) {
        return String(value ?? "").replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, (_, inlineTex, displayTex) => {
            return fallbackLatexHtml(inlineTex || displayTex || "", Boolean(displayTex));
        });
    }

    function renderFallbackMath(base = root) {
        if (!base) return;
        const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!/\\\(|\\\[/.test(node.nodeValue || "")) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest("script,style,textarea,pre,svg,mjx-container,.mv-math-fallback,.katex")) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const text = node.nodeValue || "";
            const fragment = document.createDocumentFragment();
            let cursor = 0;
            const pattern = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
            let match = pattern.exec(text);
            while (match) {
                if (match.index > cursor) {
                    fragment.append(document.createTextNode(text.slice(cursor, match.index)));
                }
                const wrapper = document.createElement("span");
                wrapper.innerHTML = fallbackLatexHtml(match[1] || match[2] || "", Boolean(match[2]));
                fragment.append(...Array.from(wrapper.childNodes));
                cursor = match.index + match[0].length;
                match = pattern.exec(text);
            }
            if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
            node.parentNode?.replaceChild(fragment, node);
        });
    }

    function stepLabel(kind, id) {
        const step = (stepSets[kind] || []).find((item) => item.id === id);
        return step ? `${step.title} / ${step.en}` : id;
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
        setHtml(container, steps.map((step, index) => `
            <article class="${step.id === activeId ? "is-active" : ""}">
                <span>${index + 1}</span>
                <div>
                    <strong>${step.title}</strong>
                    <small>${step.en}</small>
                </div>
            </article>
        `).join(""));
    }

    function renderStatusStrip(container, cells) {
        if (!container) return;
        setHtml(container, cells.map((cell) => `
            <article class="multiview-status-cell ${cell.warning ? "is-warning" : ""}">
                <span>${cell.label}</span>
                <strong>${cell.value}</strong>
            </article>
        `).join(""));
    }

    function updateStepper(kind, activeId) {
        const steps = stepSets[kind] || [];
        const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
        $$(`[data-mv-stepper="${kind}"] [data-mv-phase]`).forEach((item) => {
            const index = steps.findIndex((step) => step.id === item.dataset.mvPhase);
            item.classList.toggle("is-active", item.dataset.mvPhase === activeId);
            item.classList.toggle("is-complete", index >= 0 && index < activeIndex);
        });
        const select = $(`[data-mv-step-select="${kind}"]`);
        if (select && select.value !== activeId) select.value = activeId;
    }

    const stepPulseTargets = {
        epipolar: {
            matches: '[data-mv-epipolar-image="left"]',
            estimateF: "[data-mv-epipolar-matrix]",
            epiline: '[data-mv-epipolar-image="right"]',
            error: "[data-mv-epipolar-microscope]",
            ransac: '[data-mv-epipolar-image="right"]',
        },
        pose: {
            matches: "[data-mv-pose-pipeline]",
            f: "[data-mv-pose-pipeline]",
            normalize: "[data-mv-pose-pipeline]",
            e: "[data-mv-pose-pipeline]",
            decompose: "[data-mv-pose-pipeline]",
            cheirality: "[data-mv-pose-candidates]",
            pose: "[data-mv-pose-candidates]",
        },
        triangulation: {
            matched: "[data-mv-tri-images]",
            pose: "[data-mv-tri-geometry]",
            rays: "[data-mv-tri-geometry]",
            triangulate: "[data-mv-tri-geometry]",
            reproject: "[data-mv-tri-verification]",
            error: "[data-mv-tri-verification]",
            cloud: "[data-mv-tri-cloud]",
        },
    };

    function pulseStepTarget(kind, activeId, page) {
        const selector = stepPulseTargets[kind]?.[activeId];
        const target = selector ? $(selector, page) : null;
        pulse(target || $(".multiview-stage-chips", page));
    }

    function bindStepControls(kind, state, render) {
        const steps = stepSets[kind] || [];
        const select = $(`[data-mv-step-select="${kind}"]`);
        const play = $(`[data-mv-play="${kind}"]`);
        const setPlayState = () => {
            if (!play) return;
            play.textContent = state.timer ? "暂停播放" : "播放流程";
            play.classList.toggle("is-playing", Boolean(state.timer));
            play.setAttribute("aria-pressed", state.timer ? "true" : "false");
        };
        const stopPlayback = () => {
            if (state.autoplayStartTimer) {
                window.clearTimeout(state.autoplayStartTimer);
                state.autoplayStartTimer = 0;
            }
            if (state.timer) {
                window.clearInterval(state.timer);
                state.timer = 0;
            }
            setPlayState();
        };
        const cancelUserPlayback = () => {
            state.autoResume = false;
            stopPlayback();
        };
        const move = (delta, {fromPlayback = false} = {}) => {
            const current = Math.max(0, steps.findIndex((step) => step.id === state.step));
            const next = clamp(current + delta, 0, steps.length - 1);
            if (fromPlayback && next === current && delta > 0) {
                state.autoResume = false;
                stopPlayback();
                return;
            }
            state.step = steps[next].id;
            render(true);
        };

        select?.addEventListener("change", () => {
            cancelUserPlayback();
            state.step = select.value;
            render(true);
        });

        $$(`[data-mv-stepper="${kind}"] [data-mv-phase]`).forEach((item) => {
            item.addEventListener("click", () => {
                cancelUserPlayback();
                state.step = item.dataset.mvPhase;
                render(true);
            });
        });

        $(`[data-mv-prev="${kind}"]`)?.addEventListener("click", () => {
            cancelUserPlayback();
            move(-1);
        });
        $(`[data-mv-next="${kind}"]`)?.addEventListener("click", () => {
            cancelUserPlayback();
            move(1);
        });
        const startPlayback = (advanceNow = true) => {
            if (state.timer || steps.length < 2) return;
            const current = Math.max(0, steps.findIndex((step) => step.id === state.step));
            if (current >= steps.length - 1) {
                state.autoResume = false;
                stopPlayback();
                return;
            }
            if (advanceNow) move(1, {fromPlayback: true});
            if (state.step === steps[steps.length - 1].id) {
                state.autoResume = false;
                stopPlayback();
                return;
            }
            state.timer = window.setInterval(() => move(1, {fromPlayback: true}), AUTO_PLAY_MS);
            setPlayState();
        };
        play?.addEventListener("click", () => {
            if (state.timer) {
                state.autoResume = false;
                stopPlayback();
                return;
            }
            state.autoResume = true;
            startPlayback(true);
        });
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
            state.autoResume = true;
            state.autoplayStartTimer = window.setTimeout(() => {
                state.autoplayStartTimer = 0;
                if (state.autoResume) startPlayback(true);
            }, 920);
        }
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && state.timer) {
                state.autoResume = true;
                stopPlayback();
                return;
            }
            if (!document.hidden && state.autoResume && !state.timer) {
                startPlayback(false);
            }
        });
        setPlayState();
    }

    function gridLines(width, height, step) {
        const lines = [];
        for (let x = step; x < width; x += step) {
            lines.push(`<line class="mv-grid-line ${x % (step * 2) === 0 ? "is-major" : ""}" x1="${x}" y1="0" x2="${x}" y2="${height}"></line>`);
        }
        for (let y = step; y < height; y += step) {
            lines.push(`<line class="mv-grid-line ${y % (step * 2) === 0 ? "is-major" : ""}" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`);
        }
        return lines.join("");
    }

    function markerDefs() {
        return `
            <defs>
                <marker id="mvArrowPurple" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="#7c3aed"></path>
                </marker>
                <marker id="mvArrowCyan" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="#0891b2"></path>
                </marker>
                <marker id="mvArrowOrange" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 Z" fill="#ea580c"></path>
                </marker>
            </defs>
        `;
    }

    function sceneDecor(kind, width = 320, height = 220) {
        const windowGrid = [0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((col) => `
            <rect class="mv-image-window" x="${72 + col * 44}" y="${64 + row * 26}" width="26" height="16" rx="2"></rect>
            <path class="mv-scene-edge" d="M${72 + col * 44} ${72 + row * 26}H${98 + col * 44}"></path>
        `).join("")).join("");
        const variants = {
            facade: `
                <rect class="mv-scene-sky" x="0" y="0" width="${width}" height="78"></rect>
                <path class="mv-scene-floor" d="M0 174H${width}V${height}H0Z"></path>
                <rect class="mv-image-building" x="44" y="42" width="230" height="144" rx="6"></rect>
                <path class="mv-scene-shadow" d="M58 184H288L260 206H36Z"></path>
                ${windowGrid}
                <path class="mv-scene-edge" d="M44 42H274V186H44Z"></path>
                <path class="mv-scene-edge" d="M42 188H284"></path>
            `,
            indoor: `
                <path class="mv-scene-wall" d="M42 44H276V184H42Z"></path>
                <path class="mv-scene-floor" d="M42 184L96 138H276V184Z"></path>
                <path class="mv-scene-edge" d="M42 44L96 82H276M42 184L96 138M96 82V138"></path>
                <rect class="mv-image-window" x="118" y="72" width="70" height="48" rx="4"></rect>
                <path class="mv-scene-edge" d="M118 96H188M153 72V120"></path>
                <rect class="mv-image-building" x="204" y="92" width="36" height="68" rx="4"></rect>
            `,
            street: `
                <rect class="mv-scene-sky" x="0" y="0" width="${width}" height="92"></rect>
                <path class="mv-scene-floor" d="M0 180C70 156 134 132 216 112C252 104 286 92 320 72V220H0Z"></path>
                <rect class="mv-image-building" x="46" y="72" width="58" height="104" rx="4"></rect>
                <rect class="mv-image-building" x="122" y="52" width="52" height="116" rx="4"></rect>
                <rect class="mv-image-building" x="212" y="64" width="50" height="94" rx="4"></rect>
                <path class="mv-scene-edge" d="M36 190C90 154 144 132 204 116C248 104 276 88 302 70"></path>
                <path class="mv-scene-edge" d="M58 92H92M58 122H92M134 78H162M134 108H162M224 90H252M224 120H252"></path>
            `,
            noisy: `
                <rect class="mv-scene-sky" x="0" y="0" width="${width}" height="70"></rect>
                <path class="mv-scene-floor" d="M0 176H${width}V${height}H0Z"></path>
                <rect class="mv-image-building" x="50" y="46" width="220" height="140" rx="7"></rect>
                <path class="mv-scene-edge" d="M70 78H246M66 116H252M84 154H232M118 46V186M196 46V186"></path>
                <circle cx="88" cy="66" r="18" fill="#ecfeff" stroke="#67e8f9"></circle>
                <rect class="mv-image-window" x="176" y="82" width="48" height="52" rx="5"></rect>
            `,
            room: `
                <path class="mv-scene-wall" d="M44 46H274V184H44Z"></path>
                <path class="mv-scene-floor" d="M44 184L106 138H274V184Z"></path>
                <path class="mv-scene-edge" d="M44 46L106 92H274M44 184L106 138M106 92V138"></path>
                <rect class="mv-image-window" x="116" y="80" width="64" height="38" rx="4"></rect>
                <path class="mv-scene-edge" d="M116 99H180M148 80V118"></path>
                <path d="M204 86h42v72h-42z" fill="#dbeafe" stroke="#93c5fd"></path>
            `,
            object: `
                <path class="mv-scene-floor" d="M0 172H${width}V${height}H0Z"></path>
                <ellipse class="mv-scene-shadow" cx="160" cy="174" rx="86" ry="18"></ellipse>
                <ellipse cx="160" cy="124" rx="76" ry="48" fill="#e0f2fe" stroke="#38bdf8" stroke-width="2"></ellipse>
                <path d="M96 124C126 76 196 78 224 124C198 164 124 166 96 124Z" fill="#eef2ff" stroke="#a5b4fc" stroke-width="2"></path>
                <path class="mv-scene-edge" d="M112 110C142 96 188 98 212 124M110 138C144 152 190 148 220 126"></path>
                <circle cx="145" cy="112" r="12" fill="#f5f3ff" stroke="#7c3aed"></circle>
                <circle cx="184" cy="122" r="10" fill="#ecfeff" stroke="#0891b2"></circle>
            `,
        };
        return `
            <rect class="mv-image-bg" x="0" y="0" width="${width}" height="${height}" rx="10"></rect>
            ${gridLines(width, height, 24)}
            ${variants[kind] || variants.facade}
        `;
    }

    function sceneAnchors(sample) {
        if (sample === "indoor" || sample === "room") {
            return [
                [44, 46], [106, 92], [106, 138], [44, 184], [116, 80], [180, 80], [116, 118], [180, 118],
                [148, 80], [148, 118], [204, 86], [246, 86], [204, 158], [246, 158], [90, 74], [90, 158],
                [132, 96], [164, 96], [132, 138], [218, 126],
            ];
        }
        if (sample === "street") {
            return [
                [46, 72], [104, 72], [46, 176], [104, 176], [58, 92], [92, 92], [58, 122], [92, 122],
                [122, 52], [174, 52], [122, 168], [174, 168], [134, 78], [162, 108], [212, 64], [262, 158],
                [224, 90], [252, 120], [188, 122], [236, 108], [286, 86], [70, 164],
            ];
        }
        if (sample === "object") {
            return [
                [96, 124], [112, 110], [126, 92], [145, 100], [157, 112], [184, 112], [198, 124], [224, 124],
                [110, 138], [144, 152], [190, 148], [220, 126], [145, 112], [184, 122], [160, 76], [160, 172],
            ];
        }
        return [
            [44, 42], [274, 42], [44, 186], [274, 186], [72, 64], [98, 64], [72, 80], [98, 80],
            [116, 64], [142, 80], [160, 64], [186, 80], [204, 64], [230, 80], [72, 90], [98, 106],
            [116, 90], [142, 106], [160, 90], [186, 106], [204, 90], [230, 106], [72, 116], [98, 132],
            [116, 116], [142, 132], [160, 116], [186, 132], [204, 116], [230, 132], [72, 142], [98, 158],
            [116, 142], [142, 158], [160, 142], [186, 158], [204, 142], [230, 158], [58, 188], [242, 188],
        ];
    }

    function pointSet(count, sample, shift = 0) {
        const anchors = sceneAnchors(sample);
        return Array.from({length: count}, (_, i) => {
            const base = anchors[i % anchors.length];
            const lap = Math.floor(i / anchors.length);
            const jitterX = Math.sin((i + 1) * 1.7) * 2.6 + lap * 1.8;
            const jitterY = Math.cos((i + 3) * 1.25) * 2.4 + lap * 1.4;
            return {
                id: i,
                x: clamp(base[0] + shift + jitterX, 20, 300),
                y: clamp(base[1] + jitterY, 24, 198),
            };
        });
    }

    function epilineCoeffs(match) {
        if (match?.line) return match.line;
        const a = -match.slope;
        const b = 1;
        const c = -(match.epilineY - match.slope * match.right.x);
        return {a, b, c};
    }

    function initEpipolar() {
        const page = $("[data-mv-epipolar]");
        if (!page) return;

        const state = {step: "matches", timer: 0};
        const inputs = {};
        $$("[data-mv-epipolar-input]", page).forEach((input) => {
            inputs[input.dataset.mvEpipolarInput] = input;
            input.addEventListener("input", () => render(true));
            input.addEventListener("change", () => render(true));
        });

        function readConfig() {
            const matchCount = Number(inputs.matchCount?.value || 32);
            if (inputs.currentMatch) {
                inputs.currentMatch.max = String(matchCount);
                inputs.currentMatch.value = String(clamp(Number(inputs.currentMatch.value || 1), 1, matchCount));
            }
            return {
                sample: inputs.sample?.value || "facade",
                algorithmMode: inputs.algorithmMode?.value || "synthetic",
                matchCount,
                outlierRatio: Number(inputs.outlierRatio?.value || 22),
                ransacThreshold: Number(inputs.ransacThreshold?.value || 2),
                currentMatch: Number(inputs.currentMatch?.value || 1),
                showEpipoles: Boolean(inputs.showEpipoles?.checked),
                showLines: Boolean(inputs.showLines?.checked),
                showPlane: Boolean(inputs.showPlane?.checked),
                showLinks: Boolean(inputs.showLinks?.checked),
                showRejected: Boolean(inputs.showRejected?.checked),
            };
        }

        function buildMatches(config) {
            if (realDataReady(config)) {
                const real = currentRealMatch(config);
                return real?.matches || [];
            }
            const left = pointSet(config.matchCount, config.sample);
            const sampleShift = {facade: 34, indoor: 24, street: 48, noisy: 38}[config.sample] || 32;
            const outlierEvery = config.outlierRatio <= 0 ? Infinity : Math.max(2, Math.round(100 / config.outlierRatio));
            return left.map((p, i) => {
                const isOutlier = i % outlierEvery === 0 && i > 0;
                const slope = -0.06 + Math.sin((i + 2) * 0.35) * 0.12;
                const idealY = p.y + 10 + Math.sin(i * 0.55) * 6;
                const rx = clamp(p.x + sampleShift + Math.cos(i * 0.45) * 7, 24, 298);
                const ry = clamp(idealY + (isOutlier ? 17 + (i % 4) * 8 : Math.sin(i * 0.8) * 1.2), 26, 198);
                const error = Math.abs(ry - idealY) * (isOutlier ? 1.05 : 0.72) + (isOutlier ? 0.9 : 0.28);
                const inlier = error <= config.ransacThreshold;
                return {
                    id: i,
                    left: p,
                    right: {x: rx, y: ry},
                    epilineY: idealY,
                    slope,
                    error,
                    inlier,
                    outlier: isOutlier,
                };
            });
        }

        function renderRealImage(points, current, config, side) {
            const data = realState.data;
            const width = data?.images?.width || 320;
            const height = data?.images?.height || 220;
            const rightSide = side === "right";
            const imageHref = rightSide ? data.images.right : data.images.left;
            const currentMatch = points[current] || points[0];
            const showRejected = rightSide && config.showRejected && state.step === "ransac";
            const showEpiline = rightSide && config.showLines && ["epiline", "error", "ransac"].includes(state.step);
            const coeffs = epilineCoeffs(currentMatch);
            const epilinePoints = lineEndpoints(coeffs, width, height);
            const epiline = showEpiline
                ? `<line class="mv-epiline-band" x1="${epilinePoints[0].x}" y1="${epilinePoints[0].y}" x2="${epilinePoints[1].x}" y2="${epilinePoints[1].y}"></line><line class="mv-epiline" x1="${epilinePoints[0].x}" y1="${epilinePoints[0].y}" x2="${epilinePoints[1].x}" y2="${epilinePoints[1].y}"></line>`
                : "";
            const features = points.map((m, i) => {
                const p = rightSide ? m.right : m.left;
                const rejected = showRejected && !m.inlier;
                const status = rightSide && ["error", "ransac"].includes(state.step)
                    ? (m.inlier ? "is-inlier" : "is-outlier")
                    : "";
                return `<circle class="mv-feature ${i === current ? "is-active" : "is-context"} ${status} ${rejected ? "is-rejected" : ""}" cx="${p.x}" cy="${p.y}" r="${i === current ? 5.8 : 3.4}"></circle>`;
            }).join("");
            const currentPoint = currentMatch ? (rightSide ? currentMatch.right : currentMatch.left) : {x: 0, y: 0};
            const activeLabel = currentMatch
                ? `<circle class="mv-current-ring" cx="${currentPoint.x}" cy="${currentPoint.y}" r="11"></circle><text class="mv-label" x="${Math.min(width - 76, currentPoint.x + 8)}" y="${Math.max(18, currentPoint.y - 8)}">SIFT #${current + 1}</text>`
                : "";
            const title = rightSide ? "Image 2 / im6" : "Image 1 / im2";
            return `
                <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${rightSide ? "真实右图极线与候选点" : "真实左图 SIFT 特征点"}">
                    ${markerDefs()}
                    <image href="${imageHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"></image>
                    <rect class="mv-real-image-vignette" x="0" y="0" width="${width}" height="${height}"></rect>
                    ${epiline}
                    ${features}
                    ${activeLabel}
                    <text class="mv-label mv-real-label" x="18" y="24">${title}</text>
                </svg>
            `;
        }

        function renderImage(points, current, config, side) {
            if (realDataReady(config)) return renderRealImage(points, current, config, side);
            const w = 320;
            const h = 220;
            const rightSide = side === "right";
            const currentMatch = points[current] || points[0];
            const showRejected = rightSide && config.showRejected && state.step === "ransac";
            const lineY = currentMatch?.epilineY || 110;
            const slope = currentMatch?.slope || 0;
            const x1 = 16;
            const x2 = 304;
            const y1 = clamp(lineY + slope * (x1 - (currentMatch?.right.x || 160)), 10, 210);
            const y2 = clamp(lineY + slope * (x2 - (currentMatch?.right.x || 160)), 10, 210);
            const epiline = rightSide && config.showLines && ["epiline", "error", "ransac"].includes(state.step)
                ? `<line class="mv-epiline-band" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line><line class="mv-epiline" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`
                : "";
            const epipole = rightSide && config.showEpipoles
                ? `<circle class="mv-epipole" cx="22" cy="${clamp(lineY + slope * (22 - (currentMatch?.right.x || 160)), 22, 198)}" r="6"></circle><text class="mv-small-label" x="32" y="24">epipole</text>`
                : "";
            const features = points.map((m, i) => {
                const p = rightSide ? m.right : m.left;
                const rejected = showRejected && !m.inlier;
                const status = rightSide && ["error", "ransac"].includes(state.step)
                    ? (m.inlier ? "is-inlier" : "is-outlier")
                    : "";
                const classes = [
                    "mv-feature",
                    i === current ? "is-active" : "is-context",
                    status,
                    rejected ? "is-rejected" : "",
                ].filter(Boolean).join(" ");
                return `<circle class="${classes}" cx="${p.x}" cy="${p.y}" r="${i === current ? 5.8 : 3.8}"></circle>`;
            }).join("");
            const currentPoint = rightSide ? currentMatch.right : currentMatch.left;
            const activeLabel = currentMatch
                ? `<circle class="mv-current-ring" cx="${currentPoint.x}" cy="${currentPoint.y}" r="11"></circle><text class="mv-label" x="${currentPoint.x + 8}" y="${currentPoint.y - 8}">point ${current + 1}</text>`
                : "";
            const rejectedLabel = showRejected
                ? points.filter((m) => !m.inlier).slice(0, 5).map((m) => `<text class="mv-small-label" x="${m.right.x + 6}" y="${m.right.y + 12}">outlier</text>`).join("")
                : "";
            const title = rightSide ? "Image 2 / 图像 2" : "Image 1 / 图像 1";
            return `
                <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${rightSide ? "右图极线与候选点" : "左图结构特征点"}">
                    ${markerDefs()}
                    ${sceneDecor(config.sample, w, h)}
                    ${epiline}
                    ${epipole}
                    ${features}
                    ${activeLabel}
                    ${rejectedLabel}
                    <text class="mv-label" x="18" y="24">${title}</text>
                </svg>
            `;
        }

        function renderGeometry(matches, current, config) {
            const m = matches[current] || matches[0];
            const showPlane = config.showPlane && ["estimateF", "epiline", "error", "ransac"].includes(state.step);
            const showCompute = ["estimateF", "epiline", "error", "ransac"].includes(state.step);
            const inlierLines = config.showLinks ? matches.slice(0, Math.min(9, matches.length)).map((match, i) => {
                const cls = match.inlier ? "mv-match-line" : "mv-match-line is-outlier";
                return `<line class="${cls} ${i === current ? "is-active" : "is-faded"}" x1="${76}" y1="${112 + (i % 5) * 5}" x2="${260}" y2="${102 + ((i + 2) % 5) * 6}"></line>`;
            }).join("") : "";
            return `
                <svg viewBox="0 0 360 238" role="img" aria-label="对极几何计算链">
                    ${markerDefs()}
                    <rect class="mv-image-bg" x="0" y="0" width="360" height="238" rx="10"></rect>
                    ${gridLines(360, 238, 26)}
                    ${showPlane ? `<path class="mv-plane" d="M54 164L152 60L294 98L210 186Z"></path>` : ""}
                    <path d="M58 72L134 54L134 158L58 178Z" fill="#ffffff" stroke="#bfdbfe" stroke-width="2"></path>
                    <path d="M222 72L302 54L302 158L222 178Z" fill="#ffffff" stroke="#bfdbfe" stroke-width="2"></path>
                    <path class="mv-camera is-active" d="M54 190l28 -18v36z"></path>
                    <path class="mv-camera" d="M282 190l-28 -18v36z"></path>
                    <text class="mv-label" x="36" y="225">camera 1</text>
                    <text class="mv-label" x="244" y="225">camera 2</text>
                    <circle class="mv-depth-point is-active" cx="172" cy="62" r="6"></circle>
                    <text class="mv-label" x="182" y="60">3D point</text>
                    <line class="mv-ray is-purple" x1="68" y1="190" x2="172" y2="62" marker-end="url(#mvArrowPurple)"></line>
                    <line class="mv-ray" x1="270" y1="190" x2="172" y2="62" marker-end="url(#mvArrowCyan)"></line>
                    ${inlierLines}
                    ${showCompute ? `
                        <path class="mv-compute-link" d="M112 118C130 100 146 94 166 100"></path>
                        <rect class="mv-f-node" x="148" y="92" width="66" height="48" rx="8"></rect>
                        <text class="mv-label" x="165" y="113">matrix</text>
                        <text class="mv-small-label" x="158" y="130">point to line</text>
                        <circle class="mv-flow-particle" cx="132" cy="105" r="3"></circle>
                        <path class="mv-compute-link is-muted" d="M214 118C232 104 242 102 260 110"></path>
                    ` : ""}
                    <text class="mv-small-label" x="78" y="46">image plane 1</text>
                    <text class="mv-small-label" x="236" y="46">image plane 2</text>
                    <text class="mv-small-label" x="122" y="204">epipolar plane</text>
                    <text class="mv-label" x="96" y="112">point ${m ? m.id + 1 : 1}</text>
                    <text class="mv-label" x="250" y="105">epiline</text>
                </svg>
            `;
        }

        function renderEpipolarMatrix(selected, inliers, total, config) {
            const coeffs = epilineCoeffs(selected);
            const real = realDataReady(config) ? realState.data : null;
            const fLatex = real ? matrixLatex(real.matrices.F, 3) : "\\begin{bmatrix}0.0002&-0.003&0.42\\\\0.004&0.0001&-1.80\\\\-0.55&1.62&1.00\\end{bmatrix}";
            return `
                <article class="multiview-matrix-card ${["estimateF", "epiline", "error", "ransac"].includes(state.step) ? "is-active" : ""}">
                    <span>基础矩阵 / \\(\\mathbf{F}\\) Matrix</span>
                    <strong>\\(\\mathbf{F}=${fLatex}\\)</strong>
                </article>
                <article class="multiview-matrix-card ${state.step === "epiline" ? "is-active" : ""}">
                    <span>点到线 / \\(\\mathbf{l}'=\\mathbf{F}\\mathbf{x}\\)</span>
                    <strong>\\(\\mathbf{l}'=[a,b,c]^{\\mathsf T}\\)<br>\\(a=${fmt(coeffs.a, 2)},\\ b=${fmt(coeffs.b, 2)},\\ c=${fmt(coeffs.c, 1)}\\)</strong>
                </article>
                <article class="multiview-matrix-card ${["error", "ransac"].includes(state.step) ? "is-active" : ""}">
                    <span>质量 / Epipolar Error</span>
                    <strong>\\(|\\mathbf{x}'^{\\mathsf T}\\mathbf{F}\\mathbf{x}|=${fmt(selected.error, 2)}\\text{ px}\\)<br>inlier ratio ${fmt((inliers / total) * 100, 0)}%</strong>
                </article>
            `;
        }

        function renderMicroscope(selected, config) {
            const coeffs = epilineCoeffs(selected);
            const status = selected.error <= config.ransacThreshold ? "inlier" : "outlier";
            return `
                <article><span>当前输入 / \\(\\mathbf{x}\\)</span><strong>\\([${fmtInt(selected.left.x)}, ${fmtInt(selected.left.y)}, 1]^{\\mathsf T}\\)</strong></article>
                <article><span>候选匹配 / \\(\\mathbf{x}'\\)</span><strong>\\([${fmtInt(selected.right.x)}, ${fmtInt(selected.right.y)}, 1]^{\\mathsf T}\\)</strong></article>
                <article><span>极线 / \\(\\mathbf{l}'=\\mathbf{F}\\mathbf{x}\\)</span><strong>\\([${fmt(coeffs.a, 3)}, ${fmt(coeffs.b, 1)}, ${fmt(coeffs.c, 1)}]^{\\mathsf T}\\)</strong></article>
                <article><span>误差 / error</span><strong>\\(${fmt(selected.error, 2)}\\text{ px}\\) · threshold \\(${fmt(config.ransacThreshold, 1)}\\text{ px}\\)</strong></article>
                <article class="${status === "inlier" ? "is-inlier" : "is-outlier"}"><span>判定 / RANSAC</span><strong>${status === "inlier" ? "inlier · 保留" : "outlier · 剔除"}</strong></article>
            `;
        }

        const notes = {
            matches: ["特征匹配 / Feature Matches", "多视图重建从同名点开始。单张图像只能给出一条视线，加入第二个非平行视图后，匹配点对开始约束空间位置。"],
            estimateF: ["估计基础矩阵 / Estimate F", "基础矩阵 \\(\\mathbf{F}\\) 由多组匹配点估计，描述两个像素平面之间的对极几何关系。RANSAC 会反复抽样，寻找能解释最多匹配的一致模型。"],
            epiline: ["点到极线 / Point to Epipolar Line", "给定左图点 \\(\\mathbf{x}\\)，\\(\\mathbf{F}\\) 会在右图生成极线 \\(\\mathbf{l}'\\)。对应点 \\(\\mathbf{x}'\\) 应接近这条极线，而不是在整张图像中任意搜索。"],
            error: ["对极误差 / Epipolar Error", "候选点到极线越近，\\(|\\mathbf{x}'^{\\mathsf T}\\mathbf{F}\\mathbf{x}|\\) 越小。误差较大的点通常来自错误匹配、重复纹理或像素噪声。"],
            ransac: ["RANSAC 内点 / RANSAC Inliers", "RANSAC 用多组匹配的一致性筛掉外点。内点稳定进入后续 \\(\\mathbf{E}\\)、位姿和三角测量步骤。"],
        };

        function render(animated = false) {
            const config = readConfig();
            if (isRealMode(config) && !realState.data && !realState.error) {
                ensureRealData(render);
            }
            if (isRealMode(config) && !realDataReady(config)) {
                const message = realPendingMessage();
                const step = stepSets.epipolar.find((item) => item.id === state.step) || stepSets.epipolar[0];
                setText('[data-mv-epipolar-chip="step"]', `${step.title} / ${step.en}`, page);
                setText('[data-mv-epipolar-chip="quality"]', realState.error ? "real sample failed" : "OpenCV running", page);
                setText("[data-mv-epipolar-notes-title]", "真实图片 / Real OpenCV", page);
                setHtml('[data-mv-epipolar-image="left"]', `<div class="multiview-empty-note">${message}</div>`, page);
                setHtml('[data-mv-epipolar-image="right"]', `<div class="multiview-empty-note">${message}</div>`, page);
                setHtml("[data-mv-epipolar-geometry]", `<div class="multiview-empty-note">等待真实 F / E / pose 计算结果</div>`, page);
                setHtml("[data-mv-epipolar-matrix]", `<article class="multiview-matrix-card is-active"><span>真实算法 / Real OpenCV</span><strong>${message}</strong></article>`, page);
                renderStatusStrip($("[data-mv-epipolar-status]", page), [
                    {label: "当前输入 / Input", value: "Middlebury Cones im2 / im6"},
                    {label: "当前计算 / Compute", value: "SIFT + RANSAC \\(\\mathbf{F}\\)"},
                    {label: "当前输出 / Output", value: message, warning: Boolean(realState.error)},
                    {label: "当前质量 / Quality", value: "非完整 SfM · 教学近似内参"},
                ]);
                setHtml("[data-mv-epipolar-microscope]", "", page);
                renderPreview($("[data-mv-epipolar-preview]", page), stepSets.epipolar, state.step);
                updateStepper("epipolar", state.step);
                typesetMath(page);
                return;
            }
            const matches = buildMatches(config);
            const current = clamp(config.currentMatch - 1, 0, matches.length - 1);
            const selected = matches[current] || matches[0];
            const inliers = matches.filter((m) => m.inlier).length;
            const outliers = matches.length - inliers;
            const step = stepSets.epipolar.find((item) => item.id === state.step) || stepSets.epipolar[0];
            const real = realDataReady(config) ? realState.data : null;

            setText('[data-mv-epipolar-output="matchCount"]', real ? matches.length : config.matchCount, page);
            setText('[data-mv-epipolar-output="outlierRatio"]', `${fmtInt(config.outlierRatio)}%`, page);
            setText('[data-mv-epipolar-output="ransacThreshold"]', `${fmt(config.ransacThreshold, 1)} px`, page);
            setText('[data-mv-epipolar-output="currentMatch"]', pad2(config.currentMatch), page);
            setText('[data-mv-epipolar-summary="point"]', `#${pad2(current + 1)} \\(\\mathbf{x}=(${fmtInt(selected.left.x)}, ${fmtInt(selected.left.y)})\\)`, page);
            setText('[data-mv-epipolar-summary="error"]', `${fmt(selected.error, 2)} px`, page);
            setText('[data-mv-epipolar-summary="inliers"]', real ? `${real.stats.inliers} / ${real.stats.outliers}` : `${inliers} / ${outliers}`, page);
            setText('[data-mv-epipolar-summary="note"]', real ? "真实 SIFT + RANSAC" : (selected.inlier ? "匹配贴近极线" : "候选偏离极线"), page);
            setText('[data-mv-epipolar-chip="step"]', `${step.title} / ${step.en}`, page);
            setText('[data-mv-epipolar-chip="quality"]', real ? `real inliers ${real.stats.inliers}/${real.stats.ratio_matches}` : `inliers ${inliers}/${matches.length}`, page);
            setText("[data-mv-epipolar-notes-title]", notes[state.step]?.[0] || notes.matches[0], page);
            setText("[data-mv-epipolar-substitution]", `\\(\\mathbf{x}=(${fmtInt(selected.left.x)},${fmtInt(selected.left.y)},1),\\ \\mathbf{x}'=(${fmtInt(selected.right.x)},${fmtInt(selected.right.y)},1),\\ |\\mathbf{x}'^{\\mathsf T}\\mathbf{F}\\mathbf{x}|=${fmt(selected.error, 2)}\\)`, page);
            setHtml('[data-mv-epipolar-image="left"]', renderImage(matches, current, config, "left"), page);
            setHtml('[data-mv-epipolar-image="right"]', renderImage(matches, current, config, "right"), page);
            setHtml("[data-mv-epipolar-geometry]", renderGeometry(matches, current, config), page);
            setHtml("[data-mv-epipolar-matrix]", renderEpipolarMatrix(selected, inliers, matches.length, config), page);
            const epipolarCompute = {
                matches: "\\(\\mathbf{x}\\leftrightarrow\\mathbf{x}'\\) · collect correspondences",
                estimateF: "多组匹配 \\(\\rightarrow\\mathbf{F}\\)",
                epiline: "\\(\\mathbf{F}\\mathbf{x}\\rightarrow\\mathbf{l}'\\)",
                error: "\\(\\mathbf{x}'^{\\mathsf T}\\mathbf{F}\\mathbf{x}\\rightarrow\\text{error}\\)",
                ransac: `\\(\\text{error}<${fmt(config.ransacThreshold, 1)}\\text{ px}\\ ?\\)`,
            }[state.step] || "\\(\\mathbf{F}\\mathbf{x}\\rightarrow\\mathbf{l}'\\)";
            const epipolarOutput = {
                matches: "候选匹配集合",
                estimateF: "基础矩阵 \\(\\mathbf{F}\\)",
                epiline: "右图极线 \\(\\mathbf{l}'\\)",
                error: `对极误差 ${fmt(selected.error, 2)} px`,
                ransac: selected.inlier ? "RANSAC inlier · 保留" : "RANSAC outlier · 剔除",
            }[state.step] || "极线 + 判定";
            renderStatusStrip($("[data-mv-epipolar-status]", page), [
                {label: "当前输入 / Input", value: `\\(\\mathbf{x}=[${fmtInt(selected.left.x)},${fmtInt(selected.left.y)},1]^{\\mathsf T}\\) · \\(\\mathbf{x}'=[${fmtInt(selected.right.x)},${fmtInt(selected.right.y)},1]^{\\mathsf T}\\)`},
                {label: "当前计算 / Compute", value: epipolarCompute},
                {label: "当前输出 / Output", value: epipolarOutput, warning: state.step === "ransac" && !selected.inlier},
                {label: "当前质量 / Quality", value: `\\(\\text{error}=${fmt(selected.error, 2)}\\text{ px}\\) · ratio ${fmt((inliers / matches.length) * 100, 0)}%`, warning: !selected.inlier},
            ]);
            setHtml("[data-mv-epipolar-microscope]", renderMicroscope(selected, config), page);
            setHtml("[data-mv-epipolar-notes]", Object.entries(notes).map(([key, value], index) => `
                <article class="${key === state.step ? "is-active" : ""}">
                    <strong>${index + 1}. ${value[0]}</strong>
                    <p>${value[1]}</p>
                </article>
            `).join(""), page);
            renderPreview($("[data-mv-epipolar-preview]", page), stepSets.epipolar, state.step);
            updateStepper("epipolar", state.step);
            typesetMath(page);
            if (animated) pulseStepTarget("epipolar", state.step, page);
        }

        bindStepControls("epipolar", state, render);
        render();
    }

    function initPose() {
        const page = $("[data-mv-pose]");
        if (!page) return;

        const state = {step: "matches", timer: 0};
        const inputs = {};
        $$("[data-mv-pose-input]", page).forEach((input) => {
            inputs[input.dataset.mvPoseInput] = input;
            input.addEventListener("input", () => render(true));
            input.addEventListener("change", () => render(true));
        });

        function readConfig() {
            return {
                sample: inputs.sample?.value || "small",
                algorithmMode: inputs.algorithmMode?.value || "synthetic",
                intrinsics: inputs.intrinsics?.value || "known",
                noise: Number(inputs.noise?.value || 0.8),
                matchCount: Number(inputs.matchCount?.value || 42),
                showFE: Boolean(inputs.showFE?.checked),
                showSVD: Boolean(inputs.showSVD?.checked),
                showCandidates: Boolean(inputs.showCandidates?.checked),
                showCheirality: Boolean(inputs.showCheirality?.checked),
                showCorrect: Boolean(inputs.showCorrect?.checked),
            };
        }

        function poseStats(config) {
            if (realDataReady(config)) {
                const data = realState.data;
                const R = data.matrices.R || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
                const t = data.matrices.t || [0, 0, 1];
                const yaw = Math.round(Math.atan2(Number(R[0]?.[2] || 0), Number(R[0]?.[0] || 1)) * 180 / Math.PI);
                return {
                    winner: data.pose.selected_candidate || 1,
                    yaw,
                    tx: Number(t[0] || 0),
                    counts: (data.pose.candidates || []).map((candidate) => candidate.positive_depth || 0),
                    realTotal: data.stats.inliers || 0,
                };
            }
            const sampleBase = {
                small: {winner: 1, yaw: 7, tx: 0.42, counts: [34, 16, 11, 8]},
                large: {winner: 1, yaw: 18, tx: 0.76, counts: [38, 13, 9, 7]},
                rotation: {winner: 3, yaw: 26, tx: 0.18, counts: [12, 10, 31, 9]},
                translation: {winner: 1, yaw: 5, tx: 0.82, counts: [40, 17, 14, 6]},
            }[config.sample] || {winner: 1, yaw: 10, tx: 0.42, counts: [34, 16, 11, 8]};
            const penalty = Math.round(config.noise * 3);
            const counts = sampleBase.counts.map((count, index) => clamp(count + Math.round(config.matchCount * 0.08) - penalty - index, 0, config.matchCount));
            const winner = counts.indexOf(Math.max(...counts)) + 1 || sampleBase.winner;
            return {...sampleBase, counts, winner};
        }

        function renderPipeline(config) {
            const stages = [
                {id: "matches", title: "特征匹配", en: "Feature Matches", detail: `${config.matchCount} pairs`},
                {id: "f", title: "基础矩阵", en: "F Matrix", detail: config.showFE ? "pixel epipolar" : "hidden"},
                {id: "normalize", title: "内参", en: "Intrinsics", detail: config.intrinsics === "known" ? "known" : "normalized"},
                {id: "e", title: "本质矩阵", en: "Essential Matrix", detail: "normalized"},
                {id: "decompose", title: "SVD 分解", en: "SVD", detail: config.showSVD ? "factorized" : "collapsed"},
                {id: "tokens", title: "运动项", en: "Motion Terms", detail: "4 labels"},
                {id: "pose", title: "位姿候选", en: "Pose Candidates", detail: "4 solutions"},
            ];
            const activeAlias = state.step === "cheirality" ? "pose" : state.step;
            const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === activeAlias || (activeAlias === "decompose" && stage.id === "tokens")));
            const boxW = 110;
            const gap = 18;
            const startX = 24;
            const boxes = stages.map((stage, index) => {
                const x = startX + index * (boxW + gap);
                const active = index <= activeIndex;
                return `
                    <rect class="mv-pipeline-box ${active ? "is-active" : ""}" x="${x}" y="62" width="${boxW}" height="72" rx="8"></rect>
                    <text class="mv-pipeline-text" x="${x + 12}" y="88">${stage.title}</text>
                    <text class="mv-pipeline-small" x="${x + 12}" y="106">${stage.en}</text>
                    <text class="mv-pipeline-small" x="${x + 12}" y="122">${stage.detail}</text>
                    ${index < stages.length - 1 ? `<line class="mv-arrow-line" x1="${x + boxW + 4}" y1="98" x2="${x + boxW + gap - 4}" y2="98" marker-end="url(#mvArrowPurple)"></line>` : ""}
                    ${index < Math.min(activeIndex, stages.length - 1) ? `<circle class="mv-pipeline-particle" cx="${x + boxW + gap / 2}" cy="98" r="3"></circle>` : ""}
                `;
            }).join("");
            const tokens = ["rot 1", "rot 2", "+dir", "-dir"].map((label, index) => {
                const x = 672 + (index % 4) * 42;
                return `<rect class="mv-decompose-token" x="${x}" y="146" width="34" height="24" rx="7"></rect><text class="mv-pipeline-small" x="${x + 9}" y="162">${label}</text>`;
            }).join("");
            return `
                <svg viewBox="0 0 928 190" role="img" aria-label="F 到 E 再到四组位姿候选的动态流水线">
                    ${markerDefs()}
                    <rect class="mv-image-bg" x="0" y="0" width="928" height="190" rx="10"></rect>
                    ${gridLines(928, 190, 26)}
                    ${boxes}
                    <rect class="mv-intrinsic-card" x="300" y="18" width="72" height="28" rx="8"></rect>
                    <rect class="mv-intrinsic-card" x="300" y="146" width="72" height="28" rx="8"></rect>
                    <text class="mv-pipeline-small" x="310" y="36">intrinsic</text>
                    <text class="mv-pipeline-small" x="310" y="164">intrinsic</text>
                    <path class="mv-ray ${["normalize", "e"].includes(state.step) ? "is-active" : ""}" d="M336 46C346 60 356 66 374 78"></path>
                    <path class="mv-ray ${["normalize", "e"].includes(state.step) ? "is-active" : ""}" d="M336 146C348 132 358 124 374 118"></path>
                    <text class="mv-small-label" x="390" y="34">内参合入生成本质矩阵</text>
                    ${["decompose", "cheirality", "pose"].includes(state.step) ? tokens : ""}
                    <text class="mv-small-label" x="514" y="34">归一化相机坐标下的相对运动约束</text>
                </svg>
            `;
        }

        function candidateSvg(index, correct, positiveCount, config) {
            const visiblePoints = 12;
            const positiveVisible = Math.round((positiveCount / Math.max(config.matchCount, 1)) * visiblePoints);
            const points = Array.from({length: visiblePoints}, (_, i) => {
                const positive = i < positiveVisible;
                const x = 66 + (i % 4) * 28 + (correct ? Math.sin(i) * 3 : Math.cos(i) * 6);
                const y = positive ? 62 + Math.floor(i / 4) * 22 : 118 + Math.floor(i / 4) * 8;
                return `<circle class="mv-depth-point ${positive ? "" : "is-negative"} ${correct && i === 4 ? "is-active" : ""}" cx="${x}" cy="${y}" r="4.2"></circle>`;
            }).join("");
            const cam2x = correct ? 164 : index % 2 === 0 ? 154 : 108;
            const cam2y = correct ? 126 : index > 2 ? 76 : 144;
            return `
                <svg viewBox="0 0 220 150" role="img" aria-label="位姿候选 ${index}">
                    ${markerDefs()}
                    <rect class="mv-image-bg" x="0" y="0" width="220" height="150" rx="8"></rect>
                    <path class="mv-scene-floor" d="M0 112H220V150H0Z"></path>
                    <path class="mv-camera is-active" d="M42 126l22 -14v28z"></path>
                    <path class="mv-camera ${correct ? "is-active" : ""}" d="M${cam2x} ${cam2y}l-22 -14v28z"></path>
                    <line class="mv-ray ${correct ? "is-active" : "is-muted"}" x1="54" y1="126" x2="${cam2x - 10}" y2="${cam2y}" marker-end="url(#mvArrowCyan)"></line>
                    ${points}
                    <text class="mv-small-label" x="22" y="145">Camera 1</text>
                    <text class="mv-small-label" x="${cam2x - 30}" y="${Math.max(18, cam2y - 20)}">Camera 2</text>
                    ${!correct ? `<path d="M40 42L184 132" stroke="#f97316" stroke-width="3" stroke-linecap="round" opacity="0.36"></path>` : ""}
                    <text class="mv-label" x="14" y="22">positive ${positiveCount}</text>
                </svg>
            `;
        }

        const notes = {
            matches: ["特征匹配 / Matches", "经过 \\(\\mathbf{F}\\)/RANSAC 验证后的匹配点进入位姿恢复。错误匹配越少，\\(\\mathbf{E}\\) 的分解越稳定。"],
            f: ["基础矩阵 / F Matrix", "基础矩阵 \\(\\mathbf{F}\\) 描述像素坐标中的对极关系，但还混合了相机内参的影响。"],
            normalize: ["内参归一化 / Normalize with K", "已知 \\(\\mathbf{K}\\) 与 \\(\\mathbf{K}'\\) 后，可以通过 \\(\\mathbf{E}=\\mathbf{K}'^{\\mathsf T}\\mathbf{F}\\mathbf{K}\\) 把约束转入归一化相机坐标系。"],
            e: ["本质矩阵 / Essential Matrix \\(\\mathbf{E}\\)", "\\(\\mathbf{E}\\) 编码两个相机之间的相对旋转和平移方向，表达归一化坐标下的相对运动约束。"],
            decompose: ["分解 \\(\\mathbf{E}\\) / Decompose E", "SVD 分解 \\(\\mathbf{E}\\) 会产生 \\(\\mathbf{R}_1\\)、\\(\\mathbf{R}_2\\) 和两个相反的平移方向，因此有四组 \\(\\mathbf{R},\\mathbf{t}\\) 候选。"],
            cheirality: ["正深度检查 / Cheirality Check", "把匹配点初步三角化，统计空间点是否同时位于两台相机前方。"],
            pose: ["相机位姿 / Camera Pose", "正深度点最多的候选被选为当前相对位姿。注意 \\(\\mathbf{t}\\) 只有方向，没有真实尺度。"],
        };

        function render(animated = false) {
            const config = readConfig();
            if (isRealMode(config) && !realState.data && !realState.error) {
                ensureRealData(render);
            }
            if (isRealMode(config) && !realDataReady(config)) {
                const message = realPendingMessage();
                const step = stepSets.pose.find((item) => item.id === state.step) || stepSets.pose[0];
                setText('[data-mv-pose-chip="step"]', `${step.title} / ${step.en}`, page);
                setText('[data-mv-pose-chip="pose"]', realState.error ? "real sample failed" : "OpenCV running", page);
                setText("[data-mv-pose-notes-title]", "真实图片 / Real OpenCV", page);
                setHtml("[data-mv-pose-substitution]", `<span class="mv-formula-line">${message}</span>`, page);
                setHtml("[data-mv-pose-pipeline]", `<div class="multiview-empty-note">${message}</div>`, page);
                setHtml("[data-mv-pose-candidates]", `<div class="multiview-empty-note">${message}</div>`, page);
                renderStatusStrip($("[data-mv-pose-status]", page), [
                    {label: "当前输入 / Input", value: "Middlebury Cones im2 / im6"},
                    {label: "当前计算 / Compute", value: "\\(\\mathbf{E}=\\mathbf{K}'^{\\mathsf T}\\mathbf{F}\\mathbf{K}\\)"},
                    {label: "当前输出 / Output", value: message, warning: Boolean(realState.error)},
                    {label: "当前质量 / Quality", value: "非 COLMAP · \\(\\mathbf{t}\\) 尺度未知"},
                ]);
                renderPreview($("[data-mv-pose-preview]", page), stepSets.pose, state.step);
                updateStepper("pose", state.step);
                typesetMath(page);
                return;
            }
            const stats = poseStats(config);
            const singular = config.intrinsics === "known" ? `1.00 / 0.98 / ${fmt(config.noise * 0.02, 2)}` : `1.00 / 1.00 / ${fmt(config.noise * 0.01, 2)}`;
            const candidateLabels = realDataReady(config)
                ? (realState.data.pose.candidates || []).map((candidate) => `\\(${escapeHtml(candidate.label).replaceAll("t", "\\mathbf{t}")}\\)`)
                : ["\\(\\mathbf{R}_1,+\\mathbf{t}\\)", "\\(\\mathbf{R}_1,-\\mathbf{t}\\)", "\\(\\mathbf{R}_2,+\\mathbf{t}\\)", "\\(\\mathbf{R}_2,-\\mathbf{t}\\)"];
            const step = stepSets.pose.find((item) => item.id === state.step) || stepSets.pose[0];
            const cards = candidateLabels.map((label, i) => {
                const index = i + 1;
                const correct = config.showCorrect && index === stats.winner;
                const realCandidate = realDataReady(config) ? realState.data.pose.candidates?.[i] : null;
                const totalDepth = realCandidate?.total || config.matchCount;
                const negative = realCandidate?.negative_depth ?? Math.max(0, totalDepth - (stats.counts[i] || 0));
                return `
                    <article class="multiview-candidate-card ${correct ? "is-active" : ""}">
                        <div class="multiview-candidate-head"><strong>Candidate ${index}</strong><span>${label}</span></div>
                        <div class="multiview-candidate-scene">${config.showCandidates ? candidateSvg(index, correct, stats.counts[i], config) : '<div class="multiview-empty-note">候选显示已关闭</div>'}</div>
                        <div class="multiview-candidate-score"><span>positive depth</span><strong>${config.showCheirality ? `${stats.counts[i] || 0} / ${totalDepth}` : "--"}</strong></div>
                        <div class="multiview-candidate-score"><span>negative depth</span><strong>${config.showCheirality ? `${negative} / ${totalDepth}` : "--"}</strong></div>
                        ${correct ? `<div class="multiview-candidate-score"><span>结论</span><strong>选择 Candidate ${index} · 正深度点最多</strong></div>` : ""}
                    </article>
                `;
            }).join("");

            const real = realDataReady(config) ? realState.data : null;
            const realMatchCount = real?.stats?.inliers || config.matchCount;
            const realSingular = real ? "rank 2 · SIFT/RANSAC" : singular;
            setText('[data-mv-pose-output="noise"]', `${fmt(config.noise, 1)} px`, page);
            setText('[data-mv-pose-output="matchCount"]', real ? real.stats.inliers : config.matchCount, page);
            setText('[data-mv-pose-summary="singular"]', realSingular, page);
            setText('[data-mv-pose-summary="candidates"]', config.showCandidates ? "4 组" : "已隐藏", page);
            setText('[data-mv-pose-summary="winner"]', `Candidate ${stats.winner}`, page);
            setText('[data-mv-pose-summary="scale"]', real ? `\\(\\mathbf{t}\\) direction only · 教学近似 \\(\\mathbf{K}\\)` : `\\(\\mathbf{t}\\approx(${fmt(stats.tx, 2)},0,1)\\) · 尺度未知`, page);
            setText('[data-mv-pose-chip="step"]', `${step.title} / ${step.en}`, page);
            setText('[data-mv-pose-chip="pose"]', real ? `OpenCV pose · Candidate ${stats.winner}` : `\\(\\mathbf{R}\\) yaw ${stats.yaw}° · \\(\\mathbf{t}\\) dir`, page);
            setText("[data-mv-pose-notes-title]", notes[state.step]?.[0] || notes.matches[0], page);
            setHtml("[data-mv-pose-substitution]", `
                <span class="mv-formula-line">\\(\\mathbf{E}=\\mathbf{K}'^{\\mathsf T}\\mathbf{F}\\mathbf{K}\\)</span>
                <span class="mv-formula-line">\\(\\mathbf{R}\\approx\\text{yaw }${stats.yaw}^{\\circ},\\ \\mathbf{t}\\approx(${fmt(stats.tx, 2)},0,1)\\)</span>
                <span class="mv-formula-line">\\(\\text{positive depth}=${stats.counts[stats.winner - 1] || 0}/${real?.pose?.candidates?.[stats.winner - 1]?.total || config.matchCount}\\)</span>
            `, page);
            setHtml("[data-mv-pose-pipeline]", renderPipeline(config), page);
            setHtml("[data-mv-pose-candidates]", cards, page);
            const poseCompute = {
                matches: "verified matches → constraints",
                f: "matches \\(\\rightarrow\\mathbf{F}\\)",
                normalize: "\\(\\mathbf{K}'^{\\mathsf T}\\mathbf{F}\\mathbf{K}\\)",
                e: "生成 \\(\\mathbf{E}\\)",
                decompose: "\\(\\operatorname{SVD}(\\mathbf{E})\\rightarrow\\mathbf{R}_1/\\mathbf{R}_2/\\pm\\mathbf{t}\\)",
                cheirality: "triangulate → positive depth",
                pose: "select max positive depth",
            }[state.step] || "\\(\\mathbf{E}=\\mathbf{K}'^{\\mathsf T}\\mathbf{F}\\mathbf{K}\\)";
            const poseOutput = {
                matches: "几何一致匹配",
                f: "\\(\\mathbf{F}\\) Matrix / 基础矩阵",
                normalize: "归一化相机坐标",
                e: "Essential Matrix \\(\\mathbf{E}\\)",
                decompose: "4 组 \\(\\mathbf{R},\\mathbf{t}\\) 候选",
                cheirality: `Candidate ${stats.winner} wins`,
                pose: `selected Candidate ${stats.winner}`,
            }[state.step] || `Candidate ${stats.winner}: \\(\\mathbf{R},\\mathbf{t}\\)`;
            renderStatusStrip($("[data-mv-pose-status]", page), [
                {label: "当前输入 / Input", value: real ? `${real.stats.inliers} real inliers · Middlebury Cones` : `${config.matchCount} matches · \\(\\mathbf{K},\\mathbf{K}'\\) ${config.intrinsics === "known" ? "known" : "normalized"}`},
                {label: "当前计算 / Compute", value: real ? `OpenCV SIFT + RANSAC · ${poseCompute}` : poseCompute},
                {label: "当前输出 / Output", value: poseOutput},
                {label: "当前质量 / Quality", value: real ? `positive depth ${stats.counts[stats.winner - 1] || 0}/${real.pose.candidates?.[stats.winner - 1]?.total || real.stats.inliers} · scale unknown` : `positive depth ${stats.counts[stats.winner - 1]}/${config.matchCount}`},
            ]);
            setHtml("[data-mv-pose-notes]", Object.entries(notes).map(([key, value], index) => `
                <article class="${key === state.step ? "is-active" : ""}">
                    <strong>${index + 1}. ${value[0]}</strong>
                    <p>${value[1]}</p>
                </article>
            `).join(""), page);
            renderPreview($("[data-mv-pose-preview]", page), stepSets.pose, state.step);
            updateStepper("pose", state.step);
            typesetMath(page);
            if (animated) pulseStepTarget("pose", state.step, page);
        }

        bindStepControls("pose", state, render);
        render();
    }

    function initTriangulation() {
        const page = $("[data-mv-triangulation]");
        if (!page) return;

        const state = {step: "matched", timer: 0};
        const inputs = {};
        $$("[data-mv-tri-input]", page).forEach((input) => {
            inputs[input.dataset.mvTriInput] = input;
            input.addEventListener("input", () => render(true));
            input.addEventListener("change", () => render(true));
        });

        function readConfig() {
            const matchCount = Number(inputs.matchCount?.value || 36);
            if (inputs.currentPoint) {
                inputs.currentPoint.max = String(matchCount);
                inputs.currentPoint.value = String(clamp(Number(inputs.currentPoint.value || 1), 1, matchCount));
            }
            return {
                sample: inputs.sample?.value || "facade",
                algorithmMode: inputs.algorithmMode?.value || "synthetic",
                matchCount,
                baseline: Number(inputs.baseline?.value || 0.42),
                angle: Number(inputs.angle?.value || 18),
                noise: Number(inputs.noise?.value || 0.7),
                currentPoint: Number(inputs.currentPoint?.value || 1),
                showRays: Boolean(inputs.showRays?.checked),
                showPoint: Boolean(inputs.showPoint?.checked),
                showReprojection: Boolean(inputs.showReprojection?.checked),
                showErrors: Boolean(inputs.showErrors?.checked),
                showCloud: Boolean(inputs.showCloud?.checked),
                showOutliers: Boolean(inputs.showOutliers?.checked),
                rotateCloud: Boolean(inputs.rotateCloud?.checked),
            };
        }

        function buildTriPoints(config) {
            if (realDataReady(config)) {
                const real = currentRealCloud(config);
                return real?.points || [];
            }
            const points = pointSet(config.matchCount, config.sample);
            return points.map((p, i) => {
                const depth = 2.4 + (i % 7) * 0.24 + config.baseline * 0.65;
                const x3 = (p.x - 160) / 80;
                const y3 = (112 - p.y) / 90;
                const err1 = config.noise * (0.45 + (i % 5) * 0.16) + (i % 11 === 0 ? 1.1 : 0.12);
                const err2 = config.noise * (0.52 + (i % 4) * 0.18) + (i % 13 === 0 ? 1.2 : 0.14);
                const meanError = (err1 + err2) / 2;
                const right = {
                    x: clamp(p.x + 30 + config.baseline * 24 + Math.sin(i) * 5, 24, 298),
                    y: clamp(p.y + Math.sin(i * 0.7) * 7, 26, 198),
                };
                return {
                    id: i,
                    left: p,
                    right,
                    reprojLeft: {x: clamp(p.x + Math.sin(i + 1) * err1 * 2.2, 20, 300), y: clamp(p.y + Math.cos(i + 2) * err1 * 2.2, 24, 198)},
                    reprojRight: {x: clamp(right.x + Math.cos(i) * err2 * 2.2, 24, 298), y: clamp(right.y + Math.sin(i + 3) * err2 * 2.2, 26, 198)},
                    x3,
                    y3,
                    z3: depth,
                    err1,
                    err2,
                    error: meanError,
                    low: meanError > 2.0,
                };
            });
        }

        function contextSubset(points, current, limit = 18) {
            const start = Math.max(0, current - Math.floor(limit / 3));
            const subset = points.slice(start, start + limit);
            if (!subset.includes(points[current])) subset.push(points[current]);
            return subset;
        }

        function renderRealTriImages(points, current, config) {
            const data = realState.data;
            const selected = points[current] || points[0];
            const subset = contextSubset(points, current);
            const width = data?.images?.width || 320;
            const height = data?.images?.height || 220;
            const leftPoints = subset.map((p) => `<circle class="mv-feature ${p.id === selected.id ? "is-active" : "is-context"} ${p.low && config.showOutliers ? "is-low" : ""}" cx="${p.left.x}" cy="${p.left.y}" r="${p.id === selected.id ? 5.6 : 3.4}"></circle>`).join("");
            const rightPoints = subset.map((p) => `<circle class="mv-feature ${p.id === selected.id ? "is-active" : "is-context"} ${p.low && config.showOutliers ? "is-low" : ""}" cx="${p.right.x + 340}" cy="${p.right.y}" r="${p.id === selected.id ? 5.6 : 3.4}"></circle>`).join("");
            const contextLines = subset.filter((p) => p.id !== selected.id).slice(0, 5).map((p) => `
                <line class="mv-match-line is-faded" x1="${p.left.x}" y1="${p.left.y}" x2="${p.right.x + 340}" y2="${p.right.y}"></line>
            `).join("");
            const reprojection = config.showReprojection && ["reproject", "error", "cloud"].includes(state.step) ? `
                <circle class="mv-reprojected" cx="${selected.reprojLeft.x}" cy="${selected.reprojLeft.y}" r="5"></circle>
                <circle class="mv-reprojected" cx="${selected.reprojRight.x + 340}" cy="${selected.reprojRight.y}" r="5"></circle>
                ${config.showErrors ? `<line class="mv-error-vector" x1="${selected.left.x}" y1="${selected.left.y}" x2="${selected.reprojLeft.x}" y2="${selected.reprojLeft.y}"></line>
                <line class="mv-error-vector" x1="${selected.right.x + 340}" y1="${selected.right.y}" x2="${selected.reprojRight.x + 340}" y2="${selected.reprojRight.y}"></line>` : ""}
                <text class="mv-small-label mv-real-label" x="${Math.min(250, selected.reprojLeft.x + 8)}" y="${Math.min(height - 10, selected.reprojLeft.y + 14)}">reproj</text>
                <text class="mv-small-label mv-real-label" x="${Math.min(594, selected.reprojRight.x + 348)}" y="${Math.min(height - 10, selected.reprojRight.y + 14)}">reproj</text>
            ` : "";
            return `
                <svg viewBox="0 0 660 220" role="img" aria-label="真实两视图匹配点和重投影误差">
                    ${markerDefs()}
                    <image href="${data.images.left}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"></image>
                    <image href="${data.images.right}" x="340" y="0" width="${width}" height="${height}" preserveAspectRatio="none"></image>
                    <rect class="mv-real-image-vignette" x="0" y="0" width="${width}" height="${height}"></rect>
                    <rect class="mv-real-image-vignette" x="340" y="0" width="${width}" height="${height}"></rect>
                    <line x1="330" y1="16" x2="330" y2="204" stroke="#dbeafe" stroke-width="2"></line>
                    ${contextLines}
                    <line class="mv-match-line is-active" x1="${selected.left.x}" y1="${selected.left.y}" x2="${selected.right.x + 340}" y2="${selected.right.y}"></line>
                    ${leftPoints}
                    ${rightPoints}
                    <circle class="mv-current-ring" cx="${selected.left.x}" cy="${selected.left.y}" r="11"></circle>
                    <circle class="mv-current-ring" cx="${selected.right.x + 340}" cy="${selected.right.y}" r="11"></circle>
                    ${reprojection}
                    <text class="mv-label mv-real-label" x="20" y="24">im2 · real point ${current + 1}</text>
                    <text class="mv-label mv-real-label" x="360" y="24">im6 · real point ${current + 1}</text>
                </svg>
            `;
        }

        function renderTriImages(points, current, config) {
            if (realDataReady(config)) return renderRealTriImages(points, current, config);
            const selected = points[current] || points[0];
            const subset = contextSubset(points, current);
            const leftPoints = subset.map((p) => {
                const i = p.id;
                const lowClass = p.low && config.showOutliers ? "is-low" : "";
                return `<circle class="mv-feature ${i === current ? "is-active" : "is-context"} ${lowClass}" cx="${p.left.x}" cy="${p.left.y}" r="${i === current ? 5.6 : 3.6}"></circle>`;
            }).join("");
            const rightPoints = subset.map((p) => {
                const i = p.id;
                const lowClass = p.low && config.showOutliers ? "is-low" : "";
                return `<circle class="mv-feature ${i === current ? "is-active" : "is-context"} ${lowClass}" cx="${p.right.x + 340}" cy="${p.right.y}" r="${i === current ? 5.6 : 3.6}"></circle>`;
            }).join("");
            const contextLines = subset.filter((p) => p.id !== current).slice(0, 5).map((p) => `
                <line class="mv-match-line is-faded" x1="${p.left.x}" y1="${p.left.y}" x2="${p.right.x + 340}" y2="${p.right.y}"></line>
            `).join("");
            const reprojection = config.showReprojection && ["reproject", "error", "cloud"].includes(state.step) ? `
                <circle class="mv-reprojected" cx="${selected.reprojLeft.x}" cy="${selected.reprojLeft.y}" r="5"></circle>
                <circle class="mv-reprojected" cx="${selected.reprojRight.x + 340}" cy="${selected.reprojRight.y}" r="5"></circle>
                ${config.showErrors ? `<line class="mv-error-vector" x1="${selected.left.x}" y1="${selected.left.y}" x2="${selected.reprojLeft.x}" y2="${selected.reprojLeft.y}"></line>
                <line class="mv-error-vector" x1="${selected.right.x + 340}" y1="${selected.right.y}" x2="${selected.reprojRight.x + 340}" y2="${selected.reprojRight.y}"></line>` : ""}
                <text class="mv-small-label" x="${selected.reprojLeft.x + 8}" y="${selected.reprojLeft.y + 14}">reproj</text>
                <text class="mv-small-label" x="${selected.reprojRight.x + 348}" y="${selected.reprojRight.y + 14}">reproj</text>
            ` : "";
            return `
                <svg viewBox="0 0 660 220" role="img" aria-label="两视图匹配点和重投影误差">
                    ${markerDefs()}
                    <g>${sceneDecor(config.sample, 320, 220)}</g>
                    <g transform="translate(340 0)">${sceneDecor(config.sample, 320, 220)}</g>
                    <line x1="330" y1="16" x2="330" y2="204" stroke="#dbeafe" stroke-width="2"></line>
                    ${contextLines}
                    <line class="mv-match-line is-active" x1="${selected.left.x}" y1="${selected.left.y}" x2="${selected.right.x + 340}" y2="${selected.right.y}"></line>
                    ${leftPoints}
                    ${rightPoints}
                    <circle class="mv-current-ring" cx="${selected.left.x}" cy="${selected.left.y}" r="11"></circle>
                    <circle class="mv-current-ring" cx="${selected.right.x + 340}" cy="${selected.right.y}" r="11"></circle>
                    ${reprojection}
                    <text class="mv-label" x="20" y="24">图像 1 / Image 1 · point ${current + 1}</text>
                    <text class="mv-label" x="360" y="24">图像 2 / Image 2 · point ${current + 1}</text>
                </svg>
            `;
        }

        function renderTriGeometry(points, current, config) {
            const selected = points[current] || points[0];
            const pointX = 174 + selected.x3 * 34;
            const pointY = 74 - selected.y3 * 18 + (selected.z3 - 3) * 9;
            const spread = Math.max(2, config.noise * 2.4);
            const leftClose = {x: pointX - spread, y: pointY - spread * 0.45};
            const rightClose = {x: pointX + spread, y: pointY + spread * 0.45};
            const cam1 = {x: 66, y: 188};
            const cam2 = {x: 250 + config.baseline * 28, y: 188 - config.angle * 0.18};
            const showRays = config.showRays && ["rays", "triangulate", "reproject", "error", "cloud"].includes(state.step);
            const showX = config.showPoint && ["triangulate", "reproject", "error", "cloud"].includes(state.step);
            return `
                <svg viewBox="0 0 370 238" role="img" aria-label="反投影射线和三角测量">
                    ${markerDefs()}
                    <rect class="mv-image-bg" x="0" y="0" width="370" height="238" rx="10"></rect>
                    ${gridLines(370, 238, 26)}
                    <rect class="mv-coordinate-box" x="24" y="22" width="76" height="40" rx="7"></rect>
                    <rect class="mv-coordinate-box" x="270" y="22" width="76" height="40" rx="7"></rect>
                    <text class="mv-label" x="34" y="44">projection</text>
                    <text class="mv-small-label" x="42" y="57">view 1</text>
                    <text class="mv-label" x="280" y="44">projection</text>
                    <text class="mv-small-label" x="290" y="57">view 2</text>
                    <path class="mv-camera is-active" d="M${cam1.x} ${cam1.y}l28 -18v36z"></path>
                    <path class="mv-camera" d="M${cam2.x} ${cam2.y}l-28 -18v36z"></path>
                    ${showRays ? `
                        <line class="mv-ray is-active" x1="${cam1.x + 8}" y1="${cam1.y}" x2="${leftClose.x}" y2="${leftClose.y}" marker-end="url(#mvArrowPurple)"></line>
                        <line class="mv-ray is-active" x1="${cam2.x - 8}" y1="${cam2.y}" x2="${rightClose.x}" y2="${rightClose.y}" marker-end="url(#mvArrowCyan)"></line>
                        <line class="mv-nearest-segment" x1="${leftClose.x}" y1="${leftClose.y}" x2="${rightClose.x}" y2="${rightClose.y}"></line>
                    ` : ""}
                    ${showX ? `
                        <circle class="mv-depth-point is-active" cx="${pointX}" cy="${pointY}" r="6.5"></circle>
                        <text class="mv-label" x="${pointX + 10}" y="${pointY - 8}">3D point ${current + 1}</text>
                        <rect class="mv-coordinate-box" x="116" y="184" width="152" height="36" rx="8"></rect>
                        <text class="mv-label" x="126" y="205">point=(${fmt(selected.x3, 2)}, ${fmt(selected.y3, 2)}, ${fmt(selected.z3, 2)})</text>
                    ` : ""}
                    <text class="mv-small-label" x="40" y="222">Camera 1</text>
                    <text class="mv-small-label" x="${cam2.x - 34}" y="222">Camera 2</text>
                    <text class="mv-small-label" x="126" y="30">两条射线最接近处估计三维点</text>
                </svg>
            `;
        }

        function projectRealCloudPoint(point, yaw, pitch) {
            const x0 = Number(point.x3 || 0);
            const y0 = Number(point.y3 || 0);
            const z0 = Number(point.z3 || 0) - 3.05;
            const cy = Math.cos(yaw);
            const sy = Math.sin(yaw);
            const cp = Math.cos(pitch);
            const sp = Math.sin(pitch);
            const xr = x0 * cy - z0 * sy;
            const zr = x0 * sy + z0 * cy;
            const yr = y0 * cp - zr * sp;
            const depth = zr * cp + y0 * sp;
            return {
                x: 182 + xr * 82,
                y: 132 - yr * 62,
                depth,
                r: clamp(4.0 + (depth + 1.8) * 0.42, 3.4, 7.0),
            };
        }

        function renderRealCloud3D(points, current, config) {
            const selected = points[current] || points[0];
            const stepIndex = Math.max(0, stepSets.triangulation.findIndex((item) => item.id === state.step));
            const visibleCount = state.step === "cloud" ? points.length : (stepIndex >= 3 ? current + 1 : 0);
            const visible = config.showCloud ? points.slice(0, visibleCount) : [];
            const yaw = (config.rotateCloud ? 0.58 : 0.36) + (state.step === "cloud" ? 0.18 : 0) + current * 0.018;
            const pitch = 0.46;
            const projected = visible.map((point) => ({point, view: projectRealCloudPoint(point, yaw, pitch)}))
                .sort((a, b) => a.view.depth - b.view.depth);
            const cloudPoints = projected.map(({point, view}, index) => {
                const active = point.id === selected.id;
                const low = point.low && config.showOutliers;
                const labelLow = low && (active || index % 7 === 0);
                return `
                    <circle class="mv-real-cloud-point ${active ? "is-active" : ""} ${low ? "is-low" : ""}" cx="${view.x}" cy="${view.y}" r="${active ? view.r + 1.8 : view.r}"></circle>
                    ${labelLow ? `<text class="mv-low-label" x="${Math.min(286, view.x + 7)}" y="${Math.max(18, view.y - 6)}">low</text>` : ""}
                `;
            }).join("");
            const currentView = selected ? projectRealCloudPoint(selected, yaw, pitch) : {x: 170, y: 130};
            const raw = selected?.point3d || [selected?.x3 || 0, selected?.y3 || 0, selected?.z3 || 0];
            const rawLabel = raw.map((value) => fmt(value, 2)).join(", ");
            const sourceLabel = realState.data?.source === "preset" ? "precomputed JSON" : "live OpenCV API";
            const totalPoints = realState.data?.cloud?.points?.length || points.length;
            const reprojectionBlock = config.showReprojection && selected && ["reproject", "error", "cloud"].includes(state.step) ? `
                <g class="mv-real-cloud-hud">
                    <rect x="202" y="54" width="112" height="52" rx="8"></rect>
                    <text class="mv-small-label" x="214" y="75">reprojection</text>
                    <text class="mv-label" x="214" y="93">mean ${fmt(selected.error, 2)} px</text>
                </g>
            ` : "";
            return `
                <svg viewBox="0 0 340 238" role="img" aria-label="真实 OpenCV 三角化点云">
                    ${markerDefs()}
                    <rect class="mv-image-bg" x="0" y="0" width="340" height="238" rx="10"></rect>
                    ${gridLines(340, 238, 26)}
                    <path class="mv-real-cloud-plane" d="M54 184L164 124L292 164L178 218Z"></path>
                    <line class="mv-axis" x1="84" y1="186" x2="284" y2="164"></line>
                    <line class="mv-axis" x1="84" y1="186" x2="164" y2="58"></line>
                    <line class="mv-axis" x1="84" y1="186" x2="54" y2="116"></line>
                    <text class="mv-small-label" x="288" y="164">X</text>
                    <text class="mv-small-label" x="164" y="54">Y</text>
                    <text class="mv-small-label" x="46" y="114">Z</text>
                    <path class="mv-real-cloud-frustum" d="M62 194L88 172M62 194L96 202M250 184L220 166M250 184L216 196"></path>
                    <circle class="mv-real-cloud-camera is-active" cx="62" cy="194" r="5"></circle>
                    <circle class="mv-real-cloud-camera" cx="250" cy="184" r="5"></circle>
                    <text class="mv-small-label" x="30" y="212">Camera 1</text>
                    <text class="mv-small-label" x="218" y="212">Camera 2</text>
                    ${cloudPoints || '<text class="mv-label" x="82" y="118">等待三角化生成真实点云</text>'}
                    ${selected && visible.length ? `
                        <circle class="mv-current-ring" cx="${currentView.x}" cy="${currentView.y}" r="12"></circle>
                        <text class="mv-label" x="${Math.min(246, currentView.x + 10)}" y="${Math.max(18, currentView.y - 9)}">X${current + 1}</text>
                    ` : ""}
                    ${reprojectionBlock}
                    <text class="mv-label" x="20" y="24">真实稀疏点云 / Real Sparse Cloud</text>
                    <text class="mv-small-label" x="20" y="42">${sourceLabel} · grown ${visible.length}/${totalPoints}</text>
                    <text class="mv-small-label" x="20" y="224">point3d = (${rawLabel}) · scale unknown</text>
                </svg>
            `;
        }

        function renderCloud(points, current, config) {
            if (realDataReady(config)) return renderRealCloud3D(points, current, config);
            const selected = points[current] || points[0];
            const stepIndex = Math.max(0, stepSets.triangulation.findIndex((item) => item.id === state.step));
            const visibleCount = state.step === "cloud" ? points.length : (stepIndex >= 3 ? current + 1 : 0);
            const visible = points.slice(0, visibleCount);
            const cloudPoints = config.showCloud ? visible.map((p) => {
                const x = 160 + p.x3 * 54 + Math.sin(p.id * 0.4) * 12;
                const y = 136 - p.y3 * 42 - p.z3 * 8 + Math.cos(p.id * 0.25) * 8;
                const cls = p.low && config.showOutliers ? "is-low" : "";
                return `<circle class="mv-cloud-point ${p.id === current ? "is-active" : ""} ${cls}" cx="${x}" cy="${y}" r="${p.id === current ? 5.8 : 3.7}"></circle>${p.low && config.showOutliers ? `<text class="mv-low-label" x="${x + 7}" y="${y - 6}">low confidence</text>` : ""}`;
            }).join("") : "";
            const reprojectionBlock = config.showReprojection && ["reproject", "error", "cloud"].includes(state.step) ? `
                <path d="M226 52h88v62h-88z" fill="#ffffff" stroke="#dbeafe" rx="6"></path>
                <circle class="mv-feature is-active" cx="256" cy="82" r="4.8"></circle>
                <circle class="mv-reprojected" cx="${256 + selected.error * 4}" cy="${82 - selected.error * 1.5}" r="4.8"></circle>
                ${config.showErrors ? `<line class="mv-error-vector" x1="256" y1="82" x2="${256 + selected.error * 4}" y2="${82 - selected.error * 1.5}"></line>` : ""}
                <text class="mv-small-label" x="238" y="130">reprojection</text>
            ` : "";
            return `
                <div class="${config.rotateCloud ? "mv-cloud-rotating" : ""}">
                    <svg viewBox="0 0 340 238" role="img" aria-label="稀疏点云和重投影误差">
                        ${markerDefs()}
                        <rect class="mv-image-bg" x="0" y="0" width="340" height="238" rx="10"></rect>
                        ${gridLines(340, 238, 26)}
                        <line class="mv-axis" x1="62" y1="188" x2="282" y2="188"></line>
                        <line class="mv-axis" x1="92" y1="208" x2="162" y2="44"></line>
                        <line class="mv-axis" x1="82" y1="196" x2="246" y2="92"></line>
                        <text class="mv-small-label" x="286" y="188">X</text>
                        <text class="mv-small-label" x="160" y="40">Y</text>
                        <text class="mv-small-label" x="252" y="90">Z</text>
                        ${cloudPoints || '<text class="mv-label" x="98" y="118">点云等待三角化</text>'}
                        ${reprojectionBlock}
                        <text class="mv-label" x="20" y="24">稀疏点云 / Sparse Point Cloud</text>
                        <text class="mv-small-label" x="20" y="42">grown ${visible.length}/${points.length}</text>
                    </svg>
                </div>
            `;
        }

        function renderVerification(selected) {
            const warning = selected.error > 2;
            return `
                <article><span>重投影链 1</span><strong>\\(\\mathbf{X}\\rightarrow\\mathbf{P}_1\\mathbf{X}\\rightarrow\\text{image 1}\\)</strong></article>
                <article><span>重投影链 2</span><strong>\\(\\mathbf{X}\\rightarrow\\mathbf{P}_2\\mathbf{X}\\rightarrow\\text{image 2}\\)</strong></article>
                <article class="${selected.err1 > 2 ? "is-warning" : "is-stable"}"><span>error1</span><strong>\\(${fmt(selected.err1, 2)}\\text{ px}\\)</strong></article>
                <article class="${selected.err2 > 2 ? "is-warning" : "is-stable"}"><span>error2</span><strong>\\(${fmt(selected.err2, 2)}\\text{ px}\\)</strong></article>
                <article class="${warning ? "is-warning" : "is-stable"}"><span>mean error</span><strong>\\(${fmt(selected.error, 2)}\\text{ px}\\) · ${warning ? "low confidence" : "stable"}</strong></article>
            `;
        }

        function renderTriResults(points, current, config, avgError, lowCount) {
            const stepIndex = Math.max(0, stepSets.triangulation.findIndex((item) => item.id === state.step));
            const generatedCount = state.step === "cloud" ? points.length : (stepIndex >= 3 ? current + 1 : 0);
            const stableCount = Math.max(0, generatedCount - points.slice(0, generatedCount).filter((p) => p.low).length);
            const progress = Math.round((generatedCount / Math.max(points.length, 1)) * 100);
            const stablePct = Math.round((stableCount / Math.max(generatedCount, 1)) * 100);
            const lowPct = Math.round((Math.min(lowCount, generatedCount) / Math.max(generatedCount, 1)) * 100);
            const sampleEvery = Math.max(1, Math.ceil(points.length / 18));
            const trendPoints = points.filter((_, index) => index % sampleEvery === 0 || index === current).slice(0, 22);
            const maxError = Math.max(3.2, ...trendPoints.map((p) => p.error));
            const xFor = (index) => 18 + (index / Math.max(trendPoints.length - 1, 1)) * 276;
            const yFor = (error) => 110 - (error / maxError) * 82;
            const trendLine = trendPoints.map((p, index) => `${fmt(xFor(index), 1)},${fmt(yFor(p.error), 1)}`).join(" ");
            const thresholdY = yFor(2);
            const selectedTrendIndex = Math.max(0, trendPoints.findIndex((p) => p.id === current));
            const selectedTrend = trendPoints[selectedTrendIndex] || points[current] || points[0];
            const selectedX = xFor(selectedTrendIndex);
            const selectedY = yFor(selectedTrend.error);
            return `
                <article class="multiview-result-card">
                    <div class="multiview-result-head">
                        <span>点云生成 / Point Growth</span>
                        <strong>${generatedCount}/${points.length}</strong>
                    </div>
                    <div class="multiview-result-meter" aria-hidden="true"><i style="width:${progress}%"></i></div>
                    <dl class="multiview-result-kv">
                        <div><dt>当前点</dt><dd>\\(\\mathbf{X}_{${current + 1}}\\)</dd></div>
                        <div><dt>生成进度</dt><dd>${progress}%</dd></div>
                        <div><dt>低置信</dt><dd>${Math.min(lowCount, generatedCount)} points</dd></div>
                    </dl>
                </article>
                <article class="multiview-result-card multiview-result-card--wide">
                    <div class="multiview-result-head">
                        <span>误差趋势 / Reprojection Error Trend</span>
                        <strong>mean ${fmt(avgError, 2)} px</strong>
                    </div>
                    <svg class="multiview-error-trend" viewBox="0 0 312 126" role="img" aria-label="重投影误差趋势">
                        <path class="mv-trend-grid" d="M18 28H294M18 69H294M18 110H294"></path>
                        <line class="mv-trend-threshold" x1="18" y1="${thresholdY}" x2="294" y2="${thresholdY}"></line>
                        <polyline class="mv-trend-line" points="${trendLine}"></polyline>
                        ${trendPoints.map((p, index) => `<circle class="mv-trend-dot ${p.low ? "is-low" : ""} ${p.id === current ? "is-active" : ""}" cx="${xFor(index)}" cy="${yFor(p.error)}" r="${p.id === current ? 4.5 : 3}"></circle>`).join("")}
                        <text class="mv-small-label" x="22" y="${Math.max(12, thresholdY - 5)}">2.0 px gate</text>
                        <text class="mv-label" x="${Math.min(246, selectedX + 8)}" y="${Math.max(18, selectedY - 8)}">current ${fmt(selectedTrend.error, 2)} px</text>
                    </svg>
                </article>
                <article class="multiview-result-card">
                    <div class="multiview-result-head">
                        <span>置信分布 / Confidence</span>
                        <strong>${stablePct}% stable</strong>
                    </div>
                    <div class="multiview-confidence-bars">
                        <div><span>stable</span><i style="width:${stablePct}%"></i><b>${stableCount}</b></div>
                        <div class="is-low"><span>low</span><i style="width:${lowPct}%"></i><b>${Math.min(lowCount, generatedCount)}</b></div>
                    </div>
                    <p>当前质量由平均重投影误差、低置信点比例和点云增长进度共同判断。</p>
                </article>
            `;
        }

        const notes = {
            matched: ["匹配点 / Matched Points", "三角测量从两个或多个视图中的同名点开始。匹配错误会直接造成空间点漂移。"],
            pose: ["相机位姿 / Camera Pose", "已知相机相对位姿后，可以构造投影矩阵 \\(\\mathbf{P}_1/\\mathbf{P}_2\\)，把二维观测和三维点联系起来。"],
            rays: ["反投影射线 / Back-project Rays", "每个二维点对应一条从相机中心出发的反投影射线。两个视图给出两条空间射线。"],
            triangulate: ["三角化 3D 点 / Triangulate \\(\\mathbf{X}\\)", "三角测量不是直接强行求交；有像素噪声时，通常取两条射线最接近处并最小化误差。"],
            reproject: ["重投影 / Reproject", "把估计出的 \\(\\mathbf{X}\\) 重新投影到两张图像中，得到重投影点。投影关系为 \\(\\mathbf{x}\\approx\\mathbf{P}\\mathbf{X}\\)，\\(\\mathbf{x}'\\approx\\mathbf{P}'\\mathbf{X}\\)。"],
            error: ["误差检查 / Error Check", "检测点与重投影点之间的橙色向量就是重投影误差，误差过大表示低置信或外点。"],
            cloud: ["稀疏点云 / Sparse Cloud", "多个可靠匹配点重复三角化后形成稀疏点云。Bundle Adjustment 是后续联合优化相机位姿与三维点的步骤，这里只做概念说明。"],
        };

        function render(animated = false) {
            const config = readConfig();
            if (isRealMode(config) && !realState.data && !realState.error) {
                ensureRealData(render);
            }
            if (isRealMode(config) && !realDataReady(config)) {
                const message = realPendingMessage();
                const step = stepSets.triangulation.find((item) => item.id === state.step) || stepSets.triangulation[0];
                setText('[data-mv-tri-chip="step"]', `${step.title} / ${step.en}`, page);
                setText('[data-mv-tri-chip="error"]', realState.error ? "real sample failed" : "OpenCV running", page);
                setText("[data-mv-tri-notes-title]", "真实图片 / Real OpenCV", page);
                setHtml("[data-mv-tri-substitution]", `<span class="mv-formula-line">${message}</span>`, page);
                setHtml("[data-mv-tri-images]", `<div class="multiview-empty-note">${message}</div>`, page);
                setHtml("[data-mv-tri-geometry]", `<div class="multiview-empty-note">等待真实 \\(\\mathbf{R},\\mathbf{t}\\) 与 \\(\\mathbf{P}_1/\\mathbf{P}_2\\)</div>`, page);
                setHtml("[data-mv-tri-cloud]", `<div class="multiview-empty-note">等待真实稀疏点云</div>`, page);
                renderStatusStrip($("[data-mv-tri-status]", page), [
                    {label: "当前输入 / Input", value: "Middlebury Cones im2 / im6"},
                    {label: "当前计算 / Compute", value: "OpenCV triangulatePoints"},
                    {label: "当前输出 / Output", value: message, warning: Boolean(realState.error)},
                    {label: "当前质量 / Quality", value: "非完整 SfM · 教学近似内参"},
                ]);
                setHtml("[data-mv-tri-verification]", "", page);
                setHtml("[data-mv-tri-results]", "", page);
                renderPreview($("[data-mv-tri-preview]", page), stepSets.triangulation, state.step);
                updateStepper("triangulation", state.step);
                typesetMath(page);
                return;
            }
            const points = buildTriPoints(config);
            const current = clamp(config.currentPoint - 1, 0, points.length - 1);
            const selected = points[current] || points[0];
            const avgError = points.reduce((sum, p) => sum + p.error, 0) / Math.max(points.length, 1);
            const lowCount = points.filter((p) => p.low).length;
            const step = stepSets.triangulation.find((item) => item.id === state.step) || stepSets.triangulation[0];
            const real = realDataReady(config) ? realState.data : null;
            const coord = real && selected.point3d ? selected.point3d : [selected.x3, selected.y3, selected.z3];
            const coordText = coord.map((value) => fmt(value, 2)).join(",");

            setText('[data-mv-tri-output="matchCount"]', real ? `${points.length} / ${real.cloud.points.length}` : config.matchCount, page);
            setText('[data-mv-tri-output="baseline"]', fmt(config.baseline, 2), page);
            setText('[data-mv-tri-output="angle"]', `${fmtInt(config.angle)}°`, page);
            setText('[data-mv-tri-output="noise"]', `${fmt(config.noise, 1)} px`, page);
            setText('[data-mv-tri-output="currentPoint"]', pad2(config.currentPoint), page);
            setText('[data-mv-tri-summary="point"]', `(${coordText})`, page);
            setText('[data-mv-tri-summary="error"]', `${fmt(avgError, 2)} px`, page);
            setText('[data-mv-tri-summary="cloud"]', `${config.showCloud ? points.length : 0} points`, page);
            setText('[data-mv-tri-summary="confidence"]', real ? `real · ${lowCount ? `${lowCount} low` : "stable"}` : (lowCount ? `${lowCount} 个低置信` : "稳定"), page);
            setText('[data-mv-tri-chip="step"]', `${step.title} / ${step.en}`, page);
            setText('[data-mv-tri-chip="error"]', real ? `real error ${fmt(selected.error, 2)} px` : `error ${fmt(selected.error, 2)} px`, page);
            setText("[data-mv-tri-notes-title]", notes[state.step]?.[0] || notes.matched[0], page);
            setHtml("[data-mv-tri-substitution]", `
                <span class="mv-formula-line">\\(\\mathbf{x}\\approx\\mathbf{P}\\mathbf{X},\\ \\mathbf{x}'\\approx\\mathbf{P}'\\mathbf{X}\\)</span>
                <span class="mv-formula-line">\\(\\mathbf{X}=(${coordText})\\)</span>
                <span class="mv-formula-line">\\(\\bar e=${fmt(selected.error, 2)}\\text{ px}\\)</span>
            `, page);
            setHtml("[data-mv-tri-images]", renderTriImages(points, current, config), page);
            setHtml("[data-mv-tri-geometry]", renderTriGeometry(points, current, config), page);
            setHtml("[data-mv-tri-cloud]", renderCloud(points, current, config), page);
            const triCompute = {
                matched: "\\(\\mathbf{x}/\\mathbf{x}'\\) correspondence",
                pose: "known \\(\\mathbf{R},\\mathbf{t}\\rightarrow\\mathbf{P}_1/\\mathbf{P}_2\\)",
                rays: "\\(\\mathbf{P}_1/\\mathbf{P}_2\\rightarrow\\) back-project rays",
                triangulate: "closest rays \\(\\rightarrow\\widehat{\\mathbf{X}}\\)",
                reproject: "\\(\\mathbf{X}\\rightarrow\\mathbf{P}_1\\mathbf{X}/\\mathbf{P}_2\\mathbf{X}\\)",
                error: "检测点 vs 重投影点",
                cloud: "\\(\\mathbf{X}_1\\ldots\\mathbf{X}_n\\rightarrow\\) sparse cloud",
            }[state.step] || "\\(\\mathbf{P}_1/\\mathbf{P}_2\\rightarrow\\mathbf{X}\\)";
            const triOutput = {
                matched: `match #${pad2(current + 1)}`,
                pose: "投影矩阵 \\(\\mathbf{P}_1/\\mathbf{P}_2\\)",
                rays: "两条反投影射线",
                triangulate: `estimated \\(\\mathbf{X}_{${current + 1}}\\)`,
                reproject: "image reprojection points",
                error: `\\(\\bar e=${fmt(selected.error, 2)}\\text{ px}\\)`,
                cloud: `${points.length} sparse points`,
            }[state.step] || `\\(\\mathbf{X}_{${current + 1}}\\)`;
            renderStatusStrip($("[data-mv-tri-status]", page), [
                {label: "当前输入 / Input", value: real ? `real SIFT inlier #${pad2(current + 1)} · Middlebury Cones` : `\\(\\mathbf{x}=[${fmtInt(selected.left.x)},${fmtInt(selected.left.y)},1]^{\\mathsf T}\\) · \\(\\mathbf{x}'=[${fmtInt(selected.right.x)},${fmtInt(selected.right.y)},1]^{\\mathsf T}\\)`},
                {label: "当前计算 / Compute", value: real ? `OpenCV triangulatePoints · ${triCompute}` : triCompute},
                {label: "当前输出 / Output", value: `${triOutput} · \\(\\mathbf{X}=(${coordText})\\)`},
                {label: "当前质量 / Quality", value: real ? `real reprojection \\(${fmt(selected.error, 2)}\\text{ px}\\) · scale unknown` : `mean reprojection \\(${fmt(selected.error, 2)}\\text{ px}\\)`, warning: selected.error > 2},
            ]);
            setHtml("[data-mv-tri-verification]", renderVerification(selected), page);
            setHtml("[data-mv-tri-results]", renderTriResults(points, current, config, avgError, lowCount), page);
            setHtml("[data-mv-tri-notes]", Object.entries(notes).map(([key, value], index) => `
                <article class="${key === state.step ? "is-active" : "is-compact"}">
                    <strong>${index + 1}. ${value[0]}</strong>
                    ${key === state.step ? `<p>${value[1]}</p>` : ""}
                </article>
            `).join(""), page);
            renderPreview($("[data-mv-tri-preview]", page), stepSets.triangulation, state.step);
            updateStepper("triangulation", state.step);
            typesetMath(page);
            if (animated) pulseStepTarget("triangulation", state.step, page);
        }

        bindStepControls("triangulation", state, render);
        render();
    }

    initEpipolar();
    initPose();
    initTriangulation();
})();
