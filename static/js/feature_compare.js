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
            advantage: "响应公式清晰，角点定位稳定，便于观察梯度结构张量的作用。",
            weakness: "对尺度变化不鲁棒，阈值和窗口大小会影响角点数量。",
            bestFor: "建筑边缘、棋盘格、规则几何结构。",
            marker: "青色十字",
            image: "harris.webp"
        },
        shi: {
            name: "Shi-Tomasi",
            category: "特征值角点",
            summary: "使用结构张量较小特征值作为角点评分，直接衡量两个方向上的最弱灰度变化。",
            pros: "角点覆盖通常更充分，对可跟踪特征点的选择更直接。",
            advantage: "评分含义直观，适合筛选两个方向都足够强的可跟踪点。",
            weakness: "仍依赖局部窗口和阈值，对明显尺度变化缺少描述子支持。",
            bestFor: "特征跟踪、运动估计和稠密角点场景。",
            marker: "绿色圆环",
            image: "shi-tomasi.webp"
        },
        fast: {
            name: "FAST",
            category: "圆周连续检测",
            summary: "比较中心像素与半径 3 圆周上的 16 个像素，检查连续亮点或暗点并执行 NMS。",
            pros: "检测速度快、实现直观，参数调整可即时反馈。",
            advantage: "只做像素强度比较，计算开销很低，适合实时检测。",
            weakness: "本身没有尺度和方向描述，单独用于匹配时稳定性有限。",
            bestFor: "实时跟踪、移动端和对速度敏感的场景。",
            marker: "黄色菱形",
            image: "fast.webp"
        },
        sift: {
            name: "SIFT",
            category: "尺度不变特征",
            summary: "在 DoG 尺度空间寻找稳定关键点，并为关键点分配尺度和方向。",
            pros: "具备尺度和旋转鲁棒性，关键点信息丰富，适合跨图像匹配。",
            advantage: "尺度、方向和 128 维描述子组合完整，跨视角匹配更稳定。",
            weakness: "计算流程较长，描述子维度高，速度慢于二进制特征。",
            bestFor: "图像匹配、目标识别、图像拼接。",
            marker: "橙色圆环 + 方向",
            image: "sift.webp"
        },
        surf: {
            name: "SURF",
            category: "Hessian 近似特征",
            summary: "使用积分图快速计算盒式 Hessian 响应，并用 Haar 小波方向和 64 维描述子表达局部区域。",
            pros: "用积分图降低盒式滤波成本，描述子维度低于 SIFT，适合讲解 Hessian 与 Haar 思路。",
            advantage: "积分图让盒式滤波高效，保留尺度与方向特征表达。",
            weakness: "盒式近似会损失部分精细结构，结果依赖响应阈值。",
            bestFor: "特征匹配类比、快速尺度特征教学。",
            marker: "蓝色圆环 + 方向",
            image: "surf.webp"
        },
        "fast-brief": {
            name: "FAST + BRIEF",
            category: "二进制描述子",
            summary: "先用 FAST 找角点，再在关键点邻域执行固定 256 对灰度比较，生成 BRIEF bit 描述子。",
            pros: "结构简单、速度快，匹配可用 Hamming 距离完成。",
            advantage: "检测和描述都轻量，二进制描述子匹配速度快。",
            weakness: "固定采样对不做方向归一化，旋转变化下稳定性较弱。",
            bestFor: "实时匹配、二进制描述子入门。",
            marker: "黄色菱形",
            image: "brief.webp"
        },
        "orb-lite": {
            name: "ORB-lite",
            category: "方向化二进制特征",
            summary: "基于 FAST 关键点，用灰度矩估计方向，并旋转 BRIEF 采样点对提升旋转鲁棒性。",
            pros: "保留二进制描述子的速度优势，同时展示方向归一化思想。",
            advantage: "在 FAST + BRIEF 的基础上加入方向，对旋转场景更稳。",
            weakness: "仍是轻量近似流程，描述能力弱于完整浮点描述子。",
            bestFor: "移动端匹配、旋转场景下的 BRIEF 改进教学。",
            marker: "绿色菱形 + 方向",
            image: "orb.webp"
        }
    };

    const primitiveMethods = ["harris", "shi", "fast", "sift", "surf", "fast-brief", "orb-lite"];
    const state = {
        source: null,
        results: Object.fromEntries(primitiveMethods.map(method => [method, null])),
        images: {},
        sourceVersion: 0,
        methodVersion: Object.fromEntries(primitiveMethods.map(method => [method, 0])),
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
        if (["surf", "fast-brief", "orb-lite"].includes(method)) return result?.keypoints || [];
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
        } else if (method === "surf") {
            methodPoints(method).slice(0, 300).forEach(point => {
                V.drawCircle(context, point.x, point.y, "#0ea5e9", 5);
                context.strokeStyle = "#2563eb";
                context.beginPath();
                context.moveTo(point.x, point.y);
                context.lineTo(point.x + Math.cos(point.orientation || 0) * 12, point.y + Math.sin(point.orientation || 0) * 12);
                context.stroke();
            });
        } else if (method === "orb-lite") {
            methodPoints(method).slice(0, 420).forEach(point => {
                V.drawDiamond(context, point.x, point.y, "#22c55e", 5);
                context.strokeStyle = "#16a34a";
                context.beginPath();
                context.moveTo(point.x, point.y);
                context.lineTo(point.x + Math.cos(point.orientation || 0) * 10, point.y + Math.sin(point.orientation || 0) * 10);
                context.stroke();
            });
        } else if (method === "fast-brief") {
            methodPoints(method).slice(0, 420).forEach(point => V.drawDiamond(context, point.x, point.y, "#eab308", 5));
        }
    }

    function methodCount(method) {
        return methodPoints(method).length;
    }

    function methodStat(method) {
        if (!methodAvailable(method)) return "等待计算";
        if (method === "fast") return `FAST-${state.results.fast?.contiguous || 9} · ${methodCount(method)} 点`;
        if (["surf", "fast-brief", "orb-lite"].includes(method)) {
            const result = state.results[method];
            return `${result.descriptorDim} · ${methodCount(method)} 点`;
        }
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
                <div class="feature-compare-detail-visual">
                    <span class="feature-compare-detail-side">方法 ${side === "left" ? "A" : "B"}</span>
                    <img src="${image}" alt="${info.name} 检测结果">
                </div>
                <div class="feature-compare-detail-copy">
                    <header>
                        <h3>${info.name}</h3>
                        <span class="feature-method-tag">${info.category}</span>
                    </header>
                    <div class="feature-compare-detail-lines">
                        <p><b>核心</b><span>${info.summary}</span></p>
                        <p><b>特点</b><span>${info.pros}</span></p>
                        <p><b>优点</b><span>${info.advantage}</span></p>
                        <p><b>缺点</b><span>${info.weakness}</span></p>
                    </div>
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
        if (V.$("featureInfoMethod")) V.$("featureInfoMethod").textContent = info.name;
        if (V.$("featureInfoCategory")) V.$("featureInfoCategory").textContent = info.category;
        const guideImage = V.$("featureInfoImage");
        if (guideImage) {
            guideImage.src = `${V.assetsBase}${info.image}`;
            guideImage.alt = `${info.name} 算法说明`;
        }
        const caption = V.$("featureInfoCaption");
        if (caption) caption.textContent = info.summary;
        if (V.$("featureInfoCategoryText")) V.$("featureInfoCategoryText").textContent = info.category;
        if (V.$("featureInfoPros")) V.$("featureInfoPros").textContent = info.pros;
        if (V.$("featureInfoAdvantage")) V.$("featureInfoAdvantage").textContent = info.advantage;
        if (V.$("featureInfoWeakness")) V.$("featureInfoWeakness").textContent = info.weakness;
        if (V.$("featureInfoBestFor")) V.$("featureInfoBestFor").textContent = info.bestFor;
        V.$("featureInfoCount").textContent = methodAvailable(state.right) ? methodCount(state.right) : "计算中";
        V.$("featureInfoMarker").textContent = info.marker;
        V.renderStatList(V.$("featureCompareMeta"), [
            ["方法 A", methodInfo[state.left].name],
            ["方法 B", methodInfo[state.right].name],
            ["输出尺寸", state.source?.meta ? `${state.source.meta.width} × ${state.source.meta.height}` : "-"],
            ["当前状态", `${primitiveMethods.filter(methodAvailable).length} / ${primitiveMethods.length} 已完成`],
            ["类比算法", "描述子对照"]
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

    async function ensureSource(sourceVersion, methodVersion, method) {
        if (state.source) return true;
        const sourceData = await postMethod("fast");
        if (sourceVersion !== state.sourceVersion || methodVersion !== state.methodVersion[method]) return false;
        setSource(sourceData);
        return true;
    }

    async function computeAnalogMethod(method, sourceVersion, methodVersion) {
        const ready = await ensureSource(sourceVersion, methodVersion, method);
        if (!ready) return false;
        const gray = await V.imageToGray(state.source.images.original);
        if (sourceVersion !== state.sourceVersion || methodVersion !== state.methodVersion[method]) return false;
        state.results[method] = V.computeDescriptorSet(gray, method, { maxKeypoints: 500, threshold: fastOptions().threshold, contiguous: fastOptions().contiguous, nmsRadius: fastOptions().nmsRadius });
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
            } else if (["surf", "fast-brief", "orb-lite"].includes(method)) {
                accepted = await computeAnalogMethod(method, sourceVersion, methodVersion);
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
        state.results = Object.fromEntries(primitiveMethods.map(method => [method, null]));
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
            if (control.id.startsWith("compareFast")) {
                window.clearTimeout(state.timer);
                state.timer = window.setTimeout(async () => {
                    for (const method of ["fast", "fast-brief", "orb-lite"]) {
                        if (state.results[method] || selectedQueue().includes(method)) await computeMethod(method);
                    }
                }, 320);
            }
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
