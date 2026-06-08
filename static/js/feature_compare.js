(function () {
    "use strict";

    const V = window.FeatureViz;
    const form = document.getElementById("featureCompareForm");
    if (!V || !form) return;

    V.setupSamples(form);
    V.bindFileNames(form);

    const methodInfo = {
        harris: {
            name: "Harris",
            category: "响应函数角点",
            summary: "通过局部梯度结构张量计算 R = det(M) - k·trace(M)²，突出两个方向均有显著变化的位置。",
            pros: "定位明确、响应值可解释，适合教学展示和规则结构角点检测。",
            bestFor: "建筑边缘、棋盘格、规则几何结构。",
            marker: "青色十字"
        },
        shi: {
            name: "Shi-Tomasi",
            category: "特征值角点",
            summary: "使用结构张量较小特征值作为角点评分，直接衡量两个方向上的最弱灰度变化。",
            pros: "角点覆盖通常更充分，对可跟踪特征点的选择更直接。",
            bestFor: "特征跟踪、运动估计和稠密角点场景。",
            marker: "绿色圆环"
        },
        fast: {
            name: "FAST",
            category: "圆周连续检测",
            summary: "比较中心像素与半径 3 圆周上的 16 个像素，检查连续亮点或暗点并执行 NMS。",
            pros: "检测速度快、实现直观，参数调整可即时反馈。",
            bestFor: "实时跟踪、移动端和对速度敏感的场景。",
            marker: "黄色菱形"
        },
        sift: {
            name: "SIFT",
            category: "尺度不变特征",
            summary: "在 DoG 尺度空间寻找稳定关键点，并为关键点分配尺度和方向。",
            pros: "具备尺度和旋转鲁棒性，关键点信息丰富，适合跨图像匹配。",
            bestFor: "图像匹配、目标识别、图像拼接。",
            marker: "橙色圆环 + 方向"
        }
    };

    const primitiveMethods = ["harris", "shi", "fast", "sift"];
    const state = {
        source: null,
        results: { harris: null, shi: null, fast: null, sift: null },
        images: {},
        sourceVersion: 0,
        methodVersion: { harris: 0, shi: 0, fast: 0, sift: 0 },
        timer: null,
        left: V.$("featureCompareLeft")?.value || "harris",
        right: V.$("featureCompareRight")?.value || "fast"
    };

    function selectedQueue() {
        const queue = [];
        [state.left, state.right].forEach(method => {
            if (!queue.includes(method)) queue.push(method);
        });
        return queue;
    }

    function fullQueue() {
        return [...selectedQueue(), ...primitiveMethods.filter(method => !selectedQueue().includes(method))];
    }

    function fastOptions() {
        return {
            threshold: Number(V.$("compareFastThreshold")?.value) || 30,
            contiguous: Number(V.$("compareFastContiguous")?.value) || 9,
            nmsRadius: Number(V.$("compareFastNms")?.value) || 4,
            maxCorners: 500
        };
    }

    function requestBody(method) {
        const data = new FormData(form);
        data.set("methods", method);
        return data;
    }

    async function postMethod(method) {
        const response = await fetch(`${V.basePath}/api/feature-detect`, {
            method: "POST",
            body: requestBody(method)
        });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || `${methodInfo[method]?.name || method} 计算失败`);
        return data;
    }

    function setSource(data) {
        if (!data?.images?.original) return;
        state.source = {
            images: data.images,
            meta: data.meta
        };
    }

    function setCardStatus(method, text) {
        const target = V.$(`${method}Stats`);
        if (target) target.textContent = text;
    }

    function methodAvailable(method) {
        return Boolean(state.results[method]);
    }

    function methodPoints(method) {
        const result = state.results[method];
        if (method === "harris") return result?.harris?.corners || [];
        if (method === "shi") return result?.shi_tomasi?.corners || [];
        if (method === "fast") return result?.corners || [];
        if (method === "sift") return result?.sift?.keypoints || [];
        return [];
    }

    function drawMarkers(context, method) {
        if (!context || !methodAvailable(method)) return;
        if (method === "harris") {
            methodPoints(method).slice(0, 650).forEach(point => V.drawCross(context, point.x, point.y, "#06b6d4", 5));
        } else if (method === "shi") {
            methodPoints(method).slice(0, 500).forEach(point => V.drawCircle(context, point.x, point.y, "#16a34a", 4));
        } else if (method === "fast") {
            methodPoints(method).slice(0, 500).forEach(point => V.drawDiamond(context, point.x, point.y, "#eab308", 5));
        } else if (method === "sift") {
            methodPoints(method).slice(0, 260).forEach(point => V.drawSiftSymbol(context, point));
        }
    }

    function methodCount(method) {
        return methodPoints(method).length;
    }

    function methodStat(method) {
        if (!methodAvailable(method)) return "等待计算";
        if (method === "fast") return `FAST-${state.results.fast?.contiguous || 9} · ${methodCount(method)} 点`;
        return `检测点数 · ${methodCount(method)}`;
    }

    async function drawMethodCanvas(method) {
        const canvas = V.$(`${method}Canvas`);
        const original = state.source?.images?.original;
        if (!canvas || !original || !methodAvailable(method)) return;
        const result = await V.drawBaseImage(canvas, original, "#f8fbff");
        if (!result) return;
        drawMarkers(result.ctx, method);
        state.images[method] = canvas.toDataURL("image/png");
        setCardStatus(method, methodStat(method));
    }

    async function drawOverlay() {
        const original = state.source?.images?.original;
        const canvas = V.$("featureCompareOverlayCanvas");
        if (!original || !canvas) return;
        const result = await V.drawBaseImage(canvas, original, "#f8fbff");
        if (!result) return;
        drawMarkers(result.ctx, state.left);
        if (state.right !== state.left) drawMarkers(result.ctx, state.right);
        V.$("featureOverlayMethodA").textContent = `A · ${methodInfo[state.left].name}`;
        V.$("featureOverlayMethodB").textContent = `B · ${methodInfo[state.right].name}`;
    }

    function renderCardSelection() {
        document.querySelectorAll("[data-feature-method]").forEach(card => {
            const method = card.dataset.featureMethod;
            const isLeft = method === state.left;
            const isRight = method === state.right;
            card.classList.toggle("is-left-selected", isLeft);
            card.classList.toggle("is-right-selected", isRight);
            const badge = card.querySelector("[data-side-badge]");
            if (badge) badge.textContent = isLeft && isRight ? "A/B" : (isLeft ? "A" : (isRight ? "B" : ""));
        });
    }

    function detailCard(method, side) {
        const info = methodInfo[method];
        const image = state.images[method] || state.source?.images?.original || "";
        return `
            <article class="feature-compare-detail-card ${side === "right" ? "is-right" : ""}">
                <span class="feature-compare-detail-side">方法 ${side === "left" ? "A" : "B"}</span>
                <img src="${image}" alt="${info.name} 检测结果">
                <div class="feature-compare-detail-copy">
                    <h3>${info.name}</h3>
                    <span class="feature-method-tag">${info.category}</span>
                    <p>${info.summary}</p>
                    <div class="feature-compare-detail-meta">
                        <span><b>关键点</b><strong>${methodAvailable(method) ? methodCount(method) : "计算中"}</strong></span>
                        <span><b>标记方式</b><strong>${info.marker}</strong></span>
                    </div>
                </div>
            </article>
        `;
    }

    function renderInfo() {
        const info = methodInfo[state.right];
        V.$("featureCompareInsights").innerHTML = `
            <div class="feature-compare-detail-grid">
                ${detailCard(state.left, "left")}
                ${detailCard(state.right, "right")}
            </div>
            <p class="feature-compare-hint">主图直接叠加方法 A / B 的标记。点击结果卡左半区设为 A，右半区设为 B。</p>
        `;
        V.$("featureInfoMethod").textContent = info.name;
        V.$("featureInfoCategory").textContent = info.category;
        V.$("featureInfoSummary").textContent = info.summary;
        V.$("featureInfoPros").textContent = info.pros;
        V.$("featureInfoBestFor").textContent = info.bestFor;
        V.$("featureInfoCount").textContent = methodAvailable(state.right) ? methodCount(state.right) : "计算中";
        V.$("featureInfoMarker").textContent = info.marker;
        V.renderStatList(V.$("featureCompareMeta"), [
            ["方法 A", methodInfo[state.left].name],
            ["方法 B", methodInfo[state.right].name],
            ["输出尺寸", state.source?.meta ? `${state.source.meta.width} × ${state.source.meta.height}` : "-"],
            ["当前状态", `${primitiveMethods.filter(methodAvailable).length} / ${primitiveMethods.length} 已完成`],
            ["FAST 计算", "本地计算"]
        ]);
    }

    async function renderAfter(method) {
        await drawMethodCanvas(method);
        await drawOverlay();
        renderCardSelection();
        renderInfo();
    }

    async function computeFast(sourceVersion, methodVersion) {
        if (!state.source) {
            const sourceData = await postMethod("fast");
            if (sourceVersion !== state.sourceVersion || methodVersion !== state.methodVersion.fast) return false;
            setSource(sourceData);
        }
        const gray = await V.imageToGray(state.source.images.original);
        if (sourceVersion !== state.sourceVersion || methodVersion !== state.methodVersion.fast) return false;
        state.results.fast = V.detectFast(gray.gray, gray.width, gray.height, fastOptions());
        return true;
    }

    async function computeMethod(method) {
        if (!primitiveMethods.includes(method)) return false;
        const sourceVersion = state.sourceVersion;
        const methodVersion = ++state.methodVersion[method];
        state.results[method] = null;
        delete state.images[method];
        setCardStatus(method, "计算中...");
        V.$("featureCompareStatus").textContent = `正在计算 ${methodInfo[method].name}...`;

        try {
            let accepted = false;
            if (method === "fast") {
                accepted = await computeFast(sourceVersion, methodVersion);
            } else {
                const data = await postMethod(method);
                if (sourceVersion !== state.sourceVersion || methodVersion !== state.methodVersion[method]) return false;
                setSource(data);
                state.results[method] = data;
                accepted = true;
            }
            if (!accepted) return false;
            await renderAfter(method);
            V.$("featureCompareStatus").textContent = `${methodInfo[method].name} 已更新。`;
            return true;
        } catch (error) {
            if (sourceVersion === state.sourceVersion && methodVersion === state.methodVersion[method]) {
                setCardStatus(method, "计算失败");
                V.$("featureCompareStatus").textContent = error.message || `${methodInfo[method].name} 计算失败`;
            }
            return false;
        }
    }

    function invalidateAll() {
        state.sourceVersion += 1;
        state.source = null;
        state.results = { harris: null, shi: null, fast: null, sift: null };
        state.images = {};
        primitiveMethods.forEach(method => {
            state.methodVersion[method] += 1;
            setCardStatus(method, "等待计算");
        });
    }

    async function refreshAll() {
        invalidateAll();
        const sourceVersion = state.sourceVersion;
        const button = form.querySelector("button[type=submit]");
        if (button) button.textContent = "计算中...";
        V.$("featureCompareStatus").textContent = "正在优先计算当前选中的算法...";

        for (const method of fullQueue()) {
            if (sourceVersion !== state.sourceVersion) return;
            if (state.results[method]) continue;
            await computeMethod(method);
        }

        if (sourceVersion === state.sourceVersion) {
            V.$("featureCompareStatus").textContent =
                `全部完成：${state.source?.meta?.filename || "当前图像"}；当前叠加 ${methodInfo[state.left].name} + ${methodInfo[state.right].name}。`;
            if (button) button.textContent = "重新生成对比";
        }
    }

    function scheduleAll(delay = 420) {
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(refreshAll, delay);
    }

    function scheduleMethod(method, delay = 320) {
        window.clearTimeout(state.timer);
        state.timer = window.setTimeout(() => computeMethod(method), delay);
    }

    function syncParameterPanels() {
        const selected = new Set([state.left, state.right]);
        document.querySelectorAll("[data-param-method]").forEach(panel => {
            panel.open = selected.has(panel.dataset.paramMethod);
        });
    }

    async function updateSelection() {
        V.$("featureCompareLeft").value = state.left;
        V.$("featureCompareRight").value = state.right;
        syncParameterPanels();
        renderCardSelection();
        await drawOverlay();
        renderInfo();

        const missing = selectedQueue().filter(method => !state.results[method]);
        for (const method of missing) await computeMethod(method);
        if (!missing.length) {
            V.$("featureCompareStatus").textContent =
                `当前叠加：${methodInfo[state.left].name} + ${methodInfo[state.right].name}。`;
        }
    }

    V.$("featureCompareLeft")?.addEventListener("change", event => {
        state.left = event.target.value;
        updateSelection();
    });
    V.$("featureCompareRight")?.addEventListener("change", event => {
        state.right = event.target.value;
        updateSelection();
    });

    document.querySelector(".feature-compare-results")?.addEventListener("click", event => {
        const card = event.target.closest("[data-feature-method]");
        if (!card) return;
        const rect = card.getBoundingClientRect();
        if (event.clientX < rect.left + rect.width / 2) state.left = card.dataset.featureMethod;
        else state.right = card.dataset.featureMethod;
        updateSelection();
    });

    form.querySelectorAll("input:not([type=file]), select").forEach(control => {
        if (control.id === "featureCompareLeft" || control.id === "featureCompareRight") return;
        const eventName = control.tagName === "SELECT" ? "change" : "input";
        control.addEventListener(eventName, () => {
            if (control.id.startsWith("compareFast")) scheduleMethod("fast");
            else if (control.name.startsWith("sift_") || ["contrast_threshold", "edge_threshold"].includes(control.name)) scheduleMethod("sift");
            else if (control.name.startsWith("shi_")) scheduleMethod("shi");
            else if (control.name === "max_side") scheduleAll();
            else scheduleMethod("harris");
        });
    });

    form.querySelector('input[type="file"]')?.addEventListener("change", () => scheduleAll(50));
    form.querySelector("[data-samples]")?.addEventListener("click", event => {
        if (!event.target.closest("[data-example]")) return;
        const fileInput = form.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = "";
        scheduleAll(50);
    });

    form.addEventListener("submit", event => {
        event.preventDefault();
        refreshAll();
    });

    syncParameterPanels();
    refreshAll();
})();
