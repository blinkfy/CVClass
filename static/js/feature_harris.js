(function () {
    "use strict";

    const V = window.FeatureViz;
    const form = document.getElementById("featureHarrisForm");
    if (!V || !form) return;

    V.setupSamples(form);
    V.bindFileNames(form);

    let currentData = null;
    let currentGray = null;
    let currentFast = null;
    let currentStep = 0;
    let requestId = 0;
    let selectedProbe = null;
    let animationFrameId = 0;
    let currentImageFingerprint = "";
    let nmsCleanFrame = null;
    let canvasSizeTransitionTimer = 0;

    function selectedAlgorithm() {
        return V.$("cornerAlgorithm")?.value || "harris";
    }

    function algorithmLabel() {
        const algorithm = selectedAlgorithm();
        if (algorithm === "shi-tomasi") return "Shi-Tomasi";
        if (algorithm === "fast") return "FAST";
        return "Harris";
    }

    function fastOptions() {
        return {
            threshold: Number(V.$("fastThreshold")?.value) || 30,
            contiguous: Number(V.$("fastContiguous")?.value) || 9,
            nmsRadius: Number(V.$("fastNmsRadius")?.value) || 8,
            maxCorners: Number(V.$("fastMaxCorners")?.value) || 500
        };
    }

    function imageFingerprint() {
        const example = form.querySelector("[data-example-input]")?.value || "";
        const maxSide = form.querySelector('[name="max_side"]')?.value || "";
        const file = form.querySelector('input[type="file"][name="image"]')?.files?.[0];
        const fileKey = file ? `${file.name}:${file.size}:${file.lastModified}` : "";
        return JSON.stringify({ example, maxSide, fileKey });
    }

    function updateControlVisibility() {
        const algorithm = selectedAlgorithm();
        const fastMode = algorithm === "fast";
        V.$("harrisControls").hidden = fastMode;
        V.$("fastControls").hidden = !fastMode;
        V.$("harrisKControl").hidden = algorithm !== "harris";
        V.$("harrisThresholdControl").hidden = algorithm !== "harris";
        V.$("harrisNmsControl").hidden = algorithm !== "harris";
        V.$("shiThresholdControl").hidden = algorithm !== "shi-tomasi";
        V.$("shiNmsControl").hidden = algorithm !== "shi-tomasi";
        V.$("showSubpixel").closest(".feature-switch").hidden = algorithm !== "harris";
    }

    function harrisSteps() {
        if (selectedAlgorithm() === "shi-tomasi") {
            return [
                { key: "input", en: "Input", zh: "输入图像" },
                { key: "gray", en: "Gray", zh: "灰度化" },
                { key: "gradient", en: "Gradient", zh: "Ix / Iy" },
                { key: "second", en: "Second Moment", zh: "Ix² / IxIy / Iy²" },
                { key: "tensor", en: "Tensor M", zh: "Sxx / Sxy / Syy" },
                { key: "response", en: "Shi R", zh: "最小特征值" },
                { key: "nms", en: "NMS", zh: "角点筛选" }
            ];
        }
        if (selectedAlgorithm() === "fast") {
            return [
                { key: "input", en: "Input", zh: "输入图像" },
                { key: "gray", en: "Gray", zh: "灰度化" },
                { key: "circle", en: "16-Circle", zh: "圆周采样" },
                { key: "threshold", en: "FAST Test", zh: "连续阈值" },
                { key: "nms", en: "NMS", zh: "非极大值抑制" },
                { key: "corners", en: "Corners", zh: "最终角点" }
            ];
        }
        return [
            { key: "input", en: "Input", zh: "输入图像" },
            { key: "gray", en: "Gray", zh: "灰度化" },
            { key: "gradient", en: "Gradient", zh: "Ix / Iy" },
            { key: "second", en: "Second Moment", zh: "Ix² / IxIy / Iy²" },
            { key: "tensor", en: "Tensor M", zh: "Sxx / Sxy / Syy" },
            { key: "response", en: "Harris R", zh: "角点响应" },
            { key: "nms", en: "NMS", zh: "角点筛选" },
            { key: "refine", en: "Refine", zh: "亚像素定位" }
        ];
    }

    function pointsForAlgorithm() {
        if (selectedAlgorithm() === "shi-tomasi") return currentData?.shi_tomasi?.corners || [];
        if (selectedAlgorithm() === "fast") return currentFast?.corners || [];
        return currentData?.harris?.corners || [];
    }

    function refinedPoints() {
        if (selectedAlgorithm() !== "harris") return [];
        return V.refineSubpixel(currentData?.arrays?.harris_response_surface, pointsForAlgorithm());
    }

    function noteForStep(stepKey) {
        const algorithm = selectedAlgorithm();
        if (algorithm === "fast") {
            const common = {
                input: ["输入图像", "读取当前图像并约束计算尺寸。", "\\(I(x,y)\\)", "后续 FAST 在浏览器中用 Canvas ImageData 取灰度。"],
                gray: ["灰度化", "将 RGB 转为单通道强度，减少圆周比较的通道干扰。", "\\(Gray = 0.299R + 0.587G + 0.114B\\)", "灰度数组由前端生成。"],
                circle: ["16 点圆周采样", "以中心像素为圆心，取半径 3 的 16 个离散圆周点。", "\\(P_0, P_1, \\ldots, P_{15},\\ r=3\\)", "展示当前候选点的圆周响应。"],
                threshold: ["FAST 连续阈值检测", "检查是否存在连续 N 个点都亮于或暗于中心超过阈值。", "\\(|P_i-C| > t,\\ i\\in \\text{contiguous run}\\)", "FAST-9/12 的 N 可调。"],
                nms: ["FAST NMS", "按 FAST 响应强度进行非极大值抑制，减少密集重复点。", "\\(corner = \\operatorname{localmax}(score)\\)", "NMS 半径来自左侧 FAST 参数。"],
                corners: ["最终 FAST 角点", "绘制 NMS 后的黄色菱形角点。", "\\(Corners = NMS(Candidates)\\)", "FAST 不包含亚像素拟合。"]
            };
            return common[stepKey];
        }
        if (algorithm === "shi-tomasi") {
            const common = {
                input: ["输入图像", "读取当前图像并约束计算尺寸。", "\\(I(x,y)\\)", "后续步骤共享同一灰度输入。"],
                gray: ["灰度化", "将彩色图转为单通道灰度图。", "\\(Gray = 0.299R + 0.587G + 0.114B\\)", "结构张量基于灰度梯度。"],
                gradient: ["梯度计算", "手写 Sobel 计算水平与垂直梯度 Ix、Iy。", "\\(I_x=I*S_x,\\quad I_y=I*S_y\\)", "梯度用于构造二阶乘积项。"],
                second: ["二阶矩原始项", "逐像素计算 Ix²、Iy² 和 IxIy，记录局部梯度能量与相关性。", "\\(I_x^2,\\ I_y^2,\\ I_xI_y\\)", "这是未高斯加权的 second moment 原始项。"],
                tensor: ["结构张量 M", "对 Ix²、Iy²、IxIy 做高斯窗口加权求和，得到 Sxx、Syy、Sxy。", "\\(M=\\begin{bmatrix}S_{xx}&S_{xy}\\\\S_{xy}&S_{yy}\\end{bmatrix}\\)", "窗口 σ 来自左侧参数。"],
                response: ["Shi-Tomasi 响应", "用结构张量的较小特征值作为角点评分。", "\\(R=\\min(\\lambda_1,\\lambda_2)\\)", "阈值独立于 Harris，默认更高。"],
                nms: ["NMS 角点筛选", "按最小特征值响应执行阈值和非极大值抑制。", "\\(Corners=NMS(R)\\)", "最终绘制绿色圆环角点。"],
                final: ["最终结果", "展示 Shi-Tomasi 角点的最终叠加结果。", "\\(Final=NMS(\\min(\\lambda_1,\\lambda_2))\\)", "Shi-Tomasi 使用绿色标记。"]
            };
            return common[stepKey];
        }
        const common = {
            input: ["输入图像", "读取当前图像并约束计算尺寸。", "\\(I(x,y)\\)", "后续步骤共享同一灰度输入。"],
            gray: ["灰度化", "将彩色图转为单通道灰度图。", "\\(Gray = 0.299R + 0.587G + 0.114B\\)", "结构张量基于灰度梯度。"],
            gradient: ["梯度计算", "手写 Sobel 计算水平与垂直梯度 Ix、Iy。", "\\(I_x=I*S_x,\\quad I_y=I*S_y\\)", "梯度用于构造二阶乘积项。"],
            second: ["二阶矩原始项", "逐像素计算 Ix²、Iy² 和 IxIy，保留未加权的梯度二阶信息。", "\\(I_x^2,\\ I_y^2,\\ I_xI_y\\)", "Second Moment 是 Tensor M 的输入项。"],
            tensor: ["结构张量 M", "对 Ix²、Iy²、IxIy 做高斯窗口加权求和，得到 Sxx、Syy、Sxy。", "\\(M=\\begin{bmatrix}S_{xx}&S_{xy}\\\\S_{xy}&S_{yy}\\end{bmatrix}\\)", "M 描述局部窗口内两个方向的灰度变化。"],
            response: ["Harris 响应", "通过 det 和 trace 构造角点响应，两个方向都变化大时响应更强。", "\\(R=\\det(M)-k\\operatorname{trace}(M)^2\\)", "k 来自左侧 Harris 参数。"],
            nms: ["NMS 角点筛选", "对响应图做阈值和非极大值抑制，得到整数角点。", "\\(Corners=NMS(R)\\)", "橙色十字表示整数角点。"],
            refine: ["亚像素定位", "用 3×3 响应邻域拟合二次曲面，计算偏移量。", "\\(\\Delta p=-H^{-1}g\\)", "青色空心圆表示亚像素角点，箭头表示偏移。"],
            final: ["最终结果", "对比整数角点与亚像素角点的定位差异。", "\\(p_{sub}=p+\\Delta p\\)", "整数角点橙色，亚像素角点青色。"]
        };
        return common[stepKey];
    }

    function richNoteForStep(stepKey) {
        const algorithm = selectedAlgorithm();
        const fast = fastOptions();
        if (algorithm === "fast") {
            const map = {
                input: ["输入与灰度采样", "FAST 在浏览器端读取 Canvas 像素并生成灰度数组。", ["I(x,y)", "Gray=0.299R+0.587G+0.114B"], ["换图时重新生成灰度数组。", "后续判断全部基于单通道强度。"], "FAST 属于前端扩展，不影响后端 Harris/SIFT 主流程。"],
                gray: ["灰度图", "把彩色输入压缩为亮度图，减少 RGB 通道差异对圆周比较的干扰。", ["G(x,y)=0.299R+0.587G+0.114B"], ["中心像素 C 与 16 个圆周像素都从 G 中读取。"], "灰度化在前端 Canvas ImageData 中手写完成。"],
                circle: ["FAST 16 点圆周", "以候选中心 C 为圆心，检查半径 3 的 Bresenham 圆周 16 个离散点。", ["P_i=G(x+dx_i,y+dy_i),\\ i=0\\ldots15", "r=3"], ["滑动窗口表示逐像素移动候选中心。", "黄色圆周点对应 16 个比较位置。"], "不调用 OpenCV FAST，圆周点偏移由前端固定数组实现。"],
                threshold: ["连续阈值判定", `判断是否存在连续 ${fast.contiguous} 个圆周点同时明显亮于或暗于中心。`, [`P_i>C+${fast.threshold}`, `P_i<C-${fast.threshold}`, `\\exists\\ ${fast.contiguous}\\ \\text{contiguous points}`], ["同一段必须全部为 bright 或全部为 dark。", "阈值越大，角点更少但更稳定。"], "FAST-9 与 FAST-12 只改变连续点数 N。"],
                nms: ["FAST 非极大值抑制", "对候选点按 FAST 响应分数排序，在局部半径内只保留响应最大的点。", ["score=\\max\\sum |P_i-C|", "keep(p)=score(p)=\\max_{q\\in\\Omega_r(p)}score(q)"], ["灰色候选点被黄色保留点的邻域擦除。", "NMS 半径越大，最终点越稀疏。"], "最终 FAST 点用黄色菱形绘制。"],
                corners: ["FAST 最终角点", "展示通过连续阈值和 NMS 后的最终 FAST 角点集合。", ["Corners=NMS(FAST(G,t,N))"], ["FAST 不计算结构张量，也不做亚像素二次曲面拟合。"], "FAST 只作为第 5 实验前端补充方法。"]
            };
            return normalizeRichNote(map[stepKey] || map.corners);
        }
        const isShi = algorithm === "shi-tomasi";
        const map = {
            input: ["输入图像", "读取当前图片并保持统一计算尺寸，后续梯度、张量和响应都基于同一输入。", ["I(x,y)"], ["切换样例或上传图片会重新请求后端结果。"], "后端只返回数组与角点数据，所有可视标记由前端 Canvas 绘制。"],
            gray: ["灰度化", "将 RGB 图像转换成单通道灰度图，作为 Sobel 梯度的输入。", ["G=0.299R+0.587G+0.114B"], ["灰度中心值会同步显示在局部探针中。"], "此处展示的是后端算法返回的灰度数组。"],
            gradient: ["Sobel 梯度计算", "分别用水平和垂直 Sobel 核卷积灰度图，得到局部亮度变化方向。", ["I_x=G*S_x,\\quad S_x=\\begin{bmatrix}-1&0&1\\\\-2&0&2\\\\-1&0&1\\end{bmatrix}", "I_y=G*S_y,\\quad S_y=\\begin{bmatrix}-1&-2&-1\\\\0&0&0\\\\1&2&1\\end{bmatrix}"], ["Ix 强表示左右方向灰度变化明显。", "Iy 强表示上下方向灰度变化明显。"], "动画中的 3×3 Sobel 窗口表示卷积核在图像上滑动。"],
            second: ["Second Moment 原始项", "把梯度转换为二阶乘积项，记录 x/y 方向能量和方向相关性。", ["E_{xx}=I_x^2", "E_{yy}=I_y^2", "E_{xy}=I_xI_y"], ["平方项只保留强度大小。", "交叉项描述两个方向梯度是否同时变化。"], "这些还是未经过高斯窗口统计的逐像素原始项。"],
            tensor: ["结构张量 M", "对二阶项做高斯加权求和，得到描述局部窗口梯度分布的 2×2 矩阵。", ["S_{xx}=G_\\sigma * I_x^2,\\quad S_{yy}=G_\\sigma * I_y^2,\\quad S_{xy}=G_\\sigma * I_xI_y", "M=\\begin{bmatrix}S_{xx}&S_{xy}\\\\S_{xy}&S_{yy}\\end{bmatrix}"], ["两个特征值都大通常表示角点。", "只有一个方向大通常表示边缘。"], "动画中的同心高斯窗表示中心权重大、远处权重小。"],
            response: isShi
                ? ["Shi-Tomasi 响应", "Shi-Tomasi 直接取结构张量较小特征值作为角点强度。", ["\\lambda_{1,2}=\\frac{trace(M)\\pm\\sqrt{trace(M)^2-4det(M)}}{2}", "R=\\min(\\lambda_1,\\lambda_2)"], ["R 大说明两个主方向变化都足够强。", "阈值比 Harris 默认更高，减少弱纹理误检。"], "响应图以半透明热力叠加到淡化原图上。"]
                : ["Harris R 响应", "Harris 用行列式和迹构造响应，抑制单方向强边缘，突出双方向变化。", ["det(M)=S_{xx}S_{yy}-S_{xy}^2", "trace(M)=S_{xx}+S_{yy}", "R=det(M)-k\\cdot trace(M)^2"], ["R 大且为正更像角点。", "R 为负常对应边缘，接近 0 常对应平坦区域。"], "响应显示使用百分位裁剪和原图淡化叠加，避免单色淹没细节。"],
            nms: ["阈值与 NMS", "先过滤低响应候选点，再在局部邻域中只保留响应最大的角点。", ["candidate=R(x,y)>\\tau\\cdot \\max(R)", "keep(p)=R(p)=\\max_{q\\in\\Omega_r(p)}R(q)"], ["保留点向周围发出抑制邻域。", "灰色多余候选点会逐步消失。"], isShi ? "Shi-Tomasi 最终点用绿色绘制。" : "Harris 整数角点用橙色圆圈绘制。"],
            refine: ["亚像素二次曲面拟合", "在 3×3 响应邻域上估计局部二次曲面，求极值点相对整数角点的偏移。", ["R(p+\\Delta p)\\approx R(p)+g^T\\Delta p+\\frac12\\Delta p^TH\\Delta p", "\\Delta p=-H^{-1}g", "p_{sub}=p+\\Delta p"], ["橙色圆圈表示整数角点。", "青色十字滑动到亚像素位置后闪烁。"], "亚像素定位完全在前端基于 Harris response surface 计算。"],
            final: ["最终对比", "对比整数角点与亚像素角点，观察二次拟合带来的细微定位偏移。", ["Final=\\{p_{sub}\\mid |\\Delta p|\\ \\text{valid}\\}"], ["统计区给出平均偏移和最大偏移。"], "Final Compare 只在最终步骤显示。"]
        };
        return normalizeRichNote(map[stepKey] || map.final);
    }

    function normalizeRichNote(note) {
        return { title: note[0], desc: note[1], formulas: note[2], details: note[3], boundary: note[4] };
    }

    function renderKatexFormula(target, tex) {
        if (!target) return;
        const source = String(tex || "").replace(/^\\\(|\\\)$/g, "").trim();
        target.textContent = "";
        if (!source) return;
        if (window.katex) {
            try {
                window.katex.render(source, target, {
                    throwOnError: false,
                    strict: false,
                    displayMode: false
                });
                return;
            } catch (error) {
                console.warn("KaTeX render error:", error);
            }
        }
        target.textContent = source;
    }

    function renderNotes(stepKey) {
        const note = richNoteForStep(stepKey);
        V.$("cornerNoteTitle").textContent = `${algorithmLabel()} · ${note.title}`;
        V.$("cornerNotePrimary").innerHTML = `<b>${note.title}</b><p>${note.desc}</p>`;
        const formulaBox = V.$("cornerNoteFormula");
        if (formulaBox) {
            const formulas = Array.isArray(note.formulas) ? note.formulas : [note.formulas].filter(Boolean);
            formulaBox.innerHTML = `
                <b>公式与判断</b>
                ${formulas.map(() => `<p class="latex-formula"></p>`).join("")}
                <ul class="feature-note-detail">${(note.details || []).map(item => `<li>${item}</li>`).join("")}</ul>
            `;
            formulaBox.querySelectorAll(".latex-formula").forEach((target, index) => {
                renderKatexFormula(target, formulas[index]);
            });
        }
        V.$("cornerNoteBoundary").textContent = note.boundary || "";
        const probe = currentData?.probe || {};
        const values = selectedAlgorithm() === "fast" ? [
            ["候选点", currentFast?.candidates?.length || 0],
            ["NMS 保留", currentFast?.corners?.length || 0],
            ["FAST 阈值", fastOptions().threshold],
            ["连续点数", `FAST-${fastOptions().contiguous}`]
        ] : [
            ["当前点", probe.x !== undefined ? `(${probe.x}, ${probe.y})` : "-"],
            ["det(M)", probe.det ?? "-"],
            ["trace(M)", probe.trace ?? "-"],
            [selectedAlgorithm() === "harris" ? "R" : "min eigen", probe.r ?? "-"],
            ["候选点", selectedAlgorithm() === "harris" ? currentData?.harris?.candidate_count || 0 : currentData?.shi_tomasi?.candidate_count || 0],
            ["NMS 保留", pointsForAlgorithm().length]
        ];
        V.renderStatList(V.$("cornerNoteValues"), values);
    }

    function renderMatrixCard(container, title, matrix) {
        const card = document.createElement("article");
        card.className = "feature-chain-step";
        card.innerHTML = `<h4>${title}</h4><div></div>`;
        container.appendChild(card);
        V.renderMatrix(card.querySelector("div"), title, matrix || []);
    }

    function renderTextCard(container, title, rows) {
        const card = document.createElement("article");
        card.className = "feature-chain-step";
        card.innerHTML = `<h4>${title}</h4>`;
        const list = document.createElement("div");
        list.className = "feature-stat-list";
        card.appendChild(list);
        V.renderStatList(list, rows);
        container.appendChild(card);
    }

    function renderAnimatedFormula(container, title, left, op, right, result) {
        const card = document.createElement("article");
        card.className = "feature-chain-step feature-chain-animated";
        card.innerHTML = `
            <h4>${title}</h4>
            <div class="calc-track">
                <span class="calc-token calc-left">${left}</span>
                <span class="calc-op">${op}</span>
                <span class="calc-token calc-right">${right}</span>
                <span class="calc-eq">=</span>
                <span class="calc-token calc-result">${result}</span>
            </div>
        `;
        container.appendChild(card);
    }

    function renderHarrisChain(stepKey) {
        const probe = probeForCurrentSelection();
        const box = V.$("cornerChainProbe");
        box.innerHTML = "";
        if (stepKey === "input") {
            renderTextCard(box, "输入采样", [["图像", currentData?.meta?.filename || "示例图"], ["尺寸", `${currentData.meta.width}×${currentData.meta.height}`], ["探针坐标", `(${probe.x}, ${probe.y})`]]);
        } else if (stepKey === "gray") {
            renderMatrixCard(box, "Gray Patch", probe.gray_patch);
            renderAnimatedFormula(box, "RGB → Gray", "0.299R", "+ 0.587G + 0.114B", "", centerOf(probe.gray_patch));
        } else if (stepKey === "gradient") {
            renderMatrixCard(box, "Ix Patch", probe.ix_patch);
            renderMatrixCard(box, "Iy Patch", probe.iy_patch);
            renderAnimatedFormula(box, "Sobel 卷积", "Patch", "×", "Kernel", `Ix=${centerOf(probe.ix_patch)}`);
        } else if (stepKey === "second") {
            renderTextCard(box, "中心二阶矩", [["Ix²", centerOf(probe.ix2_patch)], ["IxIy", centerOf(probe.ixiy_patch)], ["Iy²", centerOf(probe.iy2_patch)]]);
            renderAnimatedFormula(box, "平方项", `Ix ${centerOf(probe.ix_patch)}`, "×", `Ix ${centerOf(probe.ix_patch)}`, centerOf(probe.ix2_patch));
            renderAnimatedFormula(box, "交叉项", `Ix ${centerOf(probe.ix_patch)}`, "×", `Iy ${centerOf(probe.iy_patch)}`, centerOf(probe.ixiy_patch));
        } else if (stepKey === "tensor") {
            renderMatrixCard(box, "Gaussian Window", probe.gaussian_weight);
            renderMatrixCard(box, "M Matrix", probe.M);
            renderAnimatedFormula(box, "加权求和", "Ix²", "× G +", "...", `Sxx=${probe.M?.[0]?.[0] ?? "-"}`);
        } else if (stepKey === "response") {
            renderMatrixCard(box, "M Matrix", probe.M);
            renderAnimatedFormula(box, selectedAlgorithm() === "harris" ? "Harris R" : "Min Eigen", "det(M)", selectedAlgorithm() === "harris" ? "- k·" : "→", selectedAlgorithm() === "harris" ? "trace²" : "min λ", selectedAlgorithm() === "harris" ? probe.r : "R");
            renderTextCard(box, "响应值", [["det(M)", probe.det ?? "-"], ["trace(M)", probe.trace ?? "-"], [selectedAlgorithm() === "harris" ? "R" : "min eigen", probe.r ?? "-"]]);
        } else if (stepKey === "nms") {
            renderTextCard(box, "NMS 判定", [["候选点", candidateCount()], ["保留点", pointsForAlgorithm().length], ["当前点是否保留", nearestPointDistance(probe.x, probe.y, pointsForAlgorithm()) <= 3 ? "是" : "否"]]);
            renderAnimatedFormula(box, "局部最大", "R(x,y)", "≥", "邻域响应", "keep / suppress");
        } else if (stepKey === "refine") {
            const nearest = nearestRefinedProbe(probe.x, probe.y);
            renderTextCard(box, "亚像素偏移", [["offset x", nearest?.offset_x?.toFixed?.(3) ?? "-"], ["offset y", nearest?.offset_y?.toFixed?.(3) ?? "-"], ["偏移长度", nearest ? Math.hypot(nearest.offset_x, nearest.offset_y).toFixed(3) : "-"]]);
            renderAnimatedFormula(box, "二次拟合", "-H⁻¹", "×", "g", "Δp");
        } else {
            renderTextCard(box, "最终结果", [["候选点", candidateCount()], ["NMS 保留", pointsForAlgorithm().length], ["亚像素有效", selectedAlgorithm() === "harris" ? refinedPoints().length : "-"]]);
        }
    }

    function renderCurrentProbe(stepKey) {
        const box = V.$("cornerProbeSummary");
        if (!box) return;
        const probe = currentData?.probe || {};
        if (selectedAlgorithm() === "fast") {
            const point = currentFast?.corners?.[0] || currentFast?.candidates?.[0];
            V.renderStatList(box, [
                ["坐标", point ? `(${point.x}, ${point.y})` : "-"],
                ["中心灰度", fastCenterValue(point)],
                ["阈值", currentFast?.threshold || fastOptions().threshold],
                ["连续点", `FAST-${currentFast?.contiguous || fastOptions().contiguous}`],
                ["起点", point?.start ?? "-"],
                ["响应", point ? Number(point.response).toFixed(2) : "-"]
            ]);
            return;
        }
        const refined = refinedPoints();
        const offsets = subpixelOffsetStats(refined);
        const tables = {
            input: [["图像尺寸", `${currentData.meta.width}×${currentData.meta.height}`], ["当前算法", algorithmLabel()]],
            gray: [["当前点", `(${probe.x ?? "-"}, ${probe.y ?? "-"})`], ["灰度中心", centerOf(probe.gray_patch)]],
            gradient: [["Ix 中心", centerOf(probe.ix_patch)], ["Iy 中心", centerOf(probe.iy_patch)]],
            second: [["Ix²", centerOf(probe.ix2_patch)], ["IxIy", centerOf(probe.ixiy_patch)], ["Iy²", centerOf(probe.iy2_patch)]],
            tensor: [["Sxx", probe.M?.[0]?.[0] ?? "-"], ["Sxy", probe.M?.[0]?.[1] ?? "-"], ["Syy", probe.M?.[1]?.[1] ?? "-"]],
            response: [["det(M)", probe.det ?? "-"], ["trace(M)", probe.trace ?? "-"], [selectedAlgorithm() === "harris" ? "R" : "min eigen", probe.r ?? "-"]],
            nms: [["候选点", selectedAlgorithm() === "harris" ? currentData?.harris?.candidate_count || 0 : currentData?.shi_tomasi?.candidate_count || 0], ["NMS 保留", pointsForAlgorithm().length]],
            refine: [["有效亚像素", refined.length], ["平均偏移", offsets.avg], ["最大偏移", offsets.max]],
            final: [["最终点数", pointsForAlgorithm().length], ["平均偏移", selectedAlgorithm() === "harris" ? offsets.avg : "-"], ["最大偏移", selectedAlgorithm() === "harris" ? offsets.max : "-"]]
        };
        V.renderStatList(box, tables[stepKey] || tables.final);
    }

    function renderFastChain(stepKey) {
        const box = V.$("cornerChainProbe");
        box.innerHTML = "";
        const point = currentFast?.corners?.[0] || currentFast?.candidates?.[0];
        if (stepKey === "input" || stepKey === "gray") {
            renderTextCard(box, "灰度中心", [["坐标", point ? `(${point.x}, ${point.y})` : "-"], ["中心灰度", fastCenterValue(point)]]);
        } else if (stepKey === "circle") {
            renderTextCard(box, "16 点圆周", [["半径", 3], ["圆周点", 16], ["中心", fastCenterValue(point)]]);
            renderAnimatedFormula(box, "圆周采样", "center", "→", "P0...P15", "16 values");
        } else if (stepKey === "threshold") {
            renderTextCard(box, "连续阈值", [["阈值", currentFast?.threshold || fastOptions().threshold], ["连续点", `FAST-${currentFast?.contiguous || fastOptions().contiguous}`], ["极性", point?.polarity === "bright" ? "亮于中心" : "暗于中心"]]);
            renderAnimatedFormula(box, "阈值比较", "|Pi-C|", ">", "t", "candidate");
        } else if (stepKey === "nms") {
            renderTextCard(box, "FAST NMS", [["候选", currentFast?.candidates?.length || 0], ["半径", fastOptions().nmsRadius], ["保留", currentFast?.corners?.length || 0]]);
            renderAnimatedFormula(box, "局部最大", "score", "≥", "neighbors", "keep");
        } else {
            renderTextCard(box, "最终角点", [["FAST 点", currentFast?.corners?.length || 0], ["标记", "黄色菱形"]]);
        }
    }

    function centerOf(matrix) {
        if (!Array.isArray(matrix) || !matrix.length) return "-";
        const y = Math.floor(matrix.length / 2);
        const x = Math.floor((matrix[y] || []).length / 2);
        return matrix[y]?.[x] ?? "-";
    }

    function candidateCount() {
        if (selectedAlgorithm() === "fast") return currentFast?.candidates?.length || 0;
        if (selectedAlgorithm() === "shi-tomasi") return currentData?.shi_tomasi?.candidate_count || 0;
        return currentData?.harris?.candidate_count || 0;
    }

    function nearestPointDistance(x, y, points) {
        if (!points?.length) return Infinity;
        return Math.min(...points.map(point => Math.hypot(point.x - x, point.y - y)));
    }

    function nearestRefinedProbe(x, y) {
        const refined = refinedPoints();
        if (!refined.length) return null;
        return refined.reduce((best, point) => {
            const distance = Math.hypot(point.x - x, point.y - y);
            return !best || distance < best.distance ? { ...point, distance } : best;
        }, null);
    }

    function patchFromPacked(packed, x, y, radius = 2) {
        if (!packed?.values?.length) return [];
        const sx = packed.width / (packed.source_width || currentData.meta.width || packed.width);
        const sy = packed.height / (packed.source_height || currentData.meta.height || packed.height);
        const px = Math.max(0, Math.min(packed.width - 1, Math.round(x * sx)));
        const py = Math.max(0, Math.min(packed.height - 1, Math.round(y * sy)));
        const rows = [];
        for (let yy = py - radius; yy <= py + radius; yy++) {
            const row = [];
            for (let xx = px - radius; xx <= px + radius; xx++) {
                const safeX = Math.max(0, Math.min(packed.width - 1, xx));
                const safeY = Math.max(0, Math.min(packed.height - 1, yy));
                row.push(Number(packed.values[safeY * packed.width + safeX] || 0));
            }
            rows.push(row);
        }
        return rows;
    }

    function probeForCurrentSelection() {
        const fallback = currentData?.probe || {};
        if (!selectedProbe || !currentData?.arrays) return fallback;
        const arrays = currentData.arrays;
        const x = selectedProbe.x;
        const y = selectedProbe.y;
        const ix = centerOf(patchFromPacked(arrays.ix, x, y));
        const iy = centerOf(patchFromPacked(arrays.iy, x, y));
        const sxx = centerOf(patchFromPacked(arrays.sxx, x, y, 1));
        const syy = centerOf(patchFromPacked(arrays.syy, x, y, 1));
        const sxy = centerOf(patchFromPacked(arrays.sxy, x, y, 1));
        const det = Number(sxx) * Number(syy) - Number(sxy) * Number(sxy);
        const trace = Number(sxx) + Number(syy);
        return {
            x,
            y,
            gray_patch: patchFromPacked(arrays.gray, x, y),
            ix_patch: patchFromPacked(arrays.ix, x, y),
            iy_patch: patchFromPacked(arrays.iy, x, y),
            ix2_patch: patchFromPacked(arrays.ix2, x, y),
            iy2_patch: patchFromPacked(arrays.iy2, x, y),
            ixiy_patch: patchFromPacked(arrays.ixiy, x, y),
            gaussian_weight: fallback.gaussian_weight || [],
            M: [[sxx, sxy], [sxy, syy]],
            det: Number.isFinite(det) ? det.toFixed(3) : "-",
            trace: Number.isFinite(trace) ? trace.toFixed(3) : "-",
            r: selectedAlgorithm() === "harris" && Number.isFinite(det) ? (det - 0.04 * trace * trace).toFixed(3) : centerOf(patchFromPacked(arrays.shi_tomasi_response || arrays.harris_response, x, y, 1))
        };
    }

    function fastCenterValue(point) {
        if (!point || !currentGray) return "-";
        return Math.round(currentGray.gray[point.y * currentGray.width + point.x]);
    }

    function grayPacked() {
        if (!currentGray) return null;
        return {
            width: currentGray.width,
            height: currentGray.height,
            values: Array.from(currentGray.gray, value => Math.max(0, Math.min(255, Math.round(value))))
        };
    }

    function drawProbeMarker(canvas) {
        if (!canvas || !selectedProbe || selectedAlgorithm() === "fast") return;
        const position = sourceToCanvasPoint(selectedProbe.x, selectedProbe.y, canvas);
        if (!position) return;
        const ctx = canvas.getContext("2d");
        const x = position.x;
        const y = position.y;
        const radius = Math.max(2.4, Math.min(5.5, Math.min(canvas.width, canvas.height) / 70));
        ctx.save();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = Math.max(1.5, radius * 0.35);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = Math.max(1, radius * 0.22);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.moveTo(x - radius * 1.45, y);
        ctx.lineTo(x + radius * 1.45, y);
        ctx.moveTo(x, y - radius * 1.45);
        ctx.lineTo(x, y + radius * 1.45);
        ctx.stroke();
        ctx.restore();
    }

    function handleProbePick(event) {
        if (!currentData || selectedAlgorithm() === "fast") return;
        const canvas = V.$("cornerStepCanvas");
        const visible = displayedCanvasRect(canvas);
        if (!visible) return;
        if (
            event.clientX < visible.left ||
            event.clientX > visible.right ||
            event.clientY < visible.top ||
            event.clientY > visible.bottom
        ) return;
        const canvasPoint = {
            x: (event.clientX - visible.left) / visible.width * canvas.width,
            y: (event.clientY - visible.top) / visible.height * canvas.height
        };
        const mapped = canvasPointToSource(canvasPoint.x, canvasPoint.y);
        if (!mapped) return;
        selectedProbe = mapped;
        drawCurrentStep();
    }

    function displayedCanvasRect(canvas) {
        if (!canvas?.width || !canvas?.height) return null;
        const box = canvas.getBoundingClientRect();
        const canvasRatio = canvas.width / canvas.height;
        const boxRatio = box.width / box.height;
        let width = box.width;
        let height = box.height;
        let left = box.left;
        let top = box.top;
        if (boxRatio > canvasRatio) {
            width = box.height * canvasRatio;
            left = box.left + (box.width - width) / 2;
        } else {
            height = box.width / canvasRatio;
            top = box.top + (box.height - height) / 2;
        }
        return { left, top, width, height, right: left + width, bottom: top + height };
    }

    function currentStepKey() {
        return harrisSteps()[Math.min(currentStep, harrisSteps().length - 1)]?.key || "input";
    }

    function packedForStepPanel(stepKey, panelIndex = 0) {
        const arrays = currentData?.arrays || {};
        if (stepKey === "gray") return arrays.gray;
        if (stepKey === "response") return selectedAlgorithm() === "harris" ? arrays.harris_response : arrays.shi_tomasi_response;
        if (stepKey === "gradient") return panelIndex === 0 ? arrays.ix : arrays.iy;
        if (stepKey === "second") return [arrays.ix2, arrays.ixiy, arrays.iy2][panelIndex];
        if (stepKey === "tensor") return [arrays.sxx, arrays.sxy, arrays.syy][panelIndex];
        return null;
    }

    function canvasPointToSource(x, y) {
        const stepKey = currentStepKey();
        if (["input", "response", "nms", "refine"].includes(stepKey)) {
            return clampSourcePoint(x / Math.max(1, V.$("cornerStepCanvas").width) * currentData.meta.width, y / Math.max(1, V.$("cornerStepCanvas").height) * currentData.meta.height);
        }
        if (stepKey === "gray") {
            return packedCanvasPointToSource(packedForStepPanel(stepKey), x, y, 0, 0);
        }
        if (stepKey === "gradient") {
            return panelCanvasPointToSource(2, x, y);
        }
        if (stepKey === "second" || stepKey === "tensor") {
            return panelCanvasPointToSource(3, x, y);
        }
        return null;
    }

    function sourceToCanvasPoint(sourceX, sourceY, canvas) {
        const stepKey = currentStepKey();
        if (["input", "response", "nms", "refine"].includes(stepKey)) {
            return {
                x: sourceX / Math.max(1, currentData.meta.width) * canvas.width,
                y: sourceY / Math.max(1, currentData.meta.height) * canvas.height
            };
        }
        if (stepKey === "gray") return sourceToPackedCanvasPoint(packedForStepPanel(stepKey), sourceX, sourceY, 0, 0);
        if (stepKey === "gradient") return sourceToPanelCanvasPoint(canvas, 2, 0, sourceX, sourceY);
        if (stepKey === "second" || stepKey === "tensor") return sourceToPanelCanvasPoint(canvas, 3, 0, sourceX, sourceY);
        return null;
    }

    function panelLayout(canvas, count) {
        const gap = count > 1 ? Math.max(8, Math.round(canvas.width * 0.025)) : 0;
        const panelWidth = (canvas.width - gap * (count - 1)) / count;
        const sourceRatio = Math.max(1e-6, currentData.meta.height / Math.max(1, currentData.meta.width));
        const panelHeight = Math.min(canvas.height, panelWidth * sourceRatio);
        const top = (canvas.height - panelHeight) / 2;
        return { gap, panelWidth, panelHeight, top, height: canvas.height };
    }

    function panelCanvasPointToSource(count, x, y) {
        const canvas = V.$("cornerStepCanvas");
        if (!canvas || y < 0 || y > canvas.height) return null;
        const layout = panelLayout(canvas, count);
        for (let index = 0; index < count; index++) {
            const left = index * (layout.panelWidth + layout.gap);
            if (x >= left && x <= left + layout.panelWidth && y >= layout.top && y <= layout.top + layout.panelHeight) {
                return clampSourcePoint(
                    (x - left) / Math.max(1, layout.panelWidth) * currentData.meta.width,
                    (y - layout.top) / Math.max(1, layout.panelHeight) * currentData.meta.height
                );
            }
        }
        return null;
    }

    function sourceToPanelCanvasPoint(canvas, count, panelIndex, sourceX, sourceY) {
        const layout = panelLayout(canvas, count);
        return {
            x: panelIndex * (layout.panelWidth + layout.gap) + sourceX / Math.max(1, currentData.meta.width) * layout.panelWidth,
            y: layout.top + sourceY / Math.max(1, currentData.meta.height) * layout.panelHeight
        };
    }

    function packedCanvasPointToSource(packed, x, y) {
        if (!packed) return null;
        return clampSourcePoint(
            x / Math.max(1, packed.width) * (packed.source_width || currentData.meta.width),
            y / Math.max(1, packed.height) * (packed.source_height || currentData.meta.height)
        );
    }

    function sourceToPackedCanvasPoint(packed, sourceX, sourceY, offsetX = 0, offsetY = 0) {
        if (!packed) return null;
        return {
            x: offsetX + sourceX / Math.max(1, packed.source_width || currentData.meta.width) * packed.width,
            y: offsetY + sourceY / Math.max(1, packed.source_height || currentData.meta.height) * packed.height
        };
    }

    function clampSourcePoint(x, y) {
        return {
            x: Math.max(0, Math.min(currentData.meta.width - 1, Math.round(x))),
            y: Math.max(0, Math.min(currentData.meta.height - 1, Math.round(y)))
        };
    }

    function cancelCanvasAnimation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
        }
    }

    function captureCanvasDisplaySize(canvas) {
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        return { width: rect.width, height: rect.height };
    }

    function clearCanvasDisplayTransition(canvas) {
        window.clearTimeout(canvasSizeTransitionTimer);
        if (!canvas) return;
        canvas.style.transition = "";
        canvas.style.width = "";
        canvas.style.height = "";
    }

    function animateCanvasDisplaySize(canvas, fromSize, duration = 380) {
        if (!canvas || !fromSize) return;
        window.clearTimeout(canvasSizeTransitionTimer);
        const target = canvas.getBoundingClientRect();
        if (!target.width || Math.abs(target.width - fromSize.width) < 1 && Math.abs(target.height - fromSize.height) < 1) return;
        canvas.style.transition = "none";
        canvas.style.width = `${fromSize.width}px`;
        canvas.style.height = `${fromSize.height}px`;
        canvas.offsetWidth;
        window.requestAnimationFrame(() => {
            canvas.style.transition = `width ${duration}ms cubic-bezier(.22,1,.36,1), height ${duration}ms cubic-bezier(.22,1,.36,1), opacity .34s ease, transform .34s ease, filter .34s ease`;
            canvas.style.width = `${target.width}px`;
            canvas.style.height = `${target.height}px`;
            canvasSizeTransitionTimer = window.setTimeout(() => {
                clearCanvasDisplayTransition(canvas);
            }, duration + 80);
        });
    }

    function animateCanvas(canvas, drawFrame, duration = 1500) {
        if (!canvas) return;
        cancelCanvasAnimation();
        const ctx = canvas.getContext("2d");
        const base = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const started = performance.now();
        const frame = now => {
            const t = Math.min(1, (now - started) / duration);
            ctx.putImageData(base, 0, 0);
            drawFrame(ctx, t, canvas);
            if (t < 1) animationFrameId = requestAnimationFrame(frame);
        };
        animationFrameId = requestAnimationFrame(frame);
    }

    function animateCurrentStep(canvas, stepKey) {
        if (!canvas) return;
        if (selectedAlgorithm() === "fast") {
            animateFastStep(canvas, stepKey);
            return;
        }
        if (stepKey === "gradient") animateGradientSplit(canvas);
        else if (stepKey === "second") animateSecondMoment(canvas);
        else if (stepKey === "tensor") animateTensorBuild(canvas);
        else if (stepKey === "response") animateResponseBuild(canvas);
        else if (stepKey === "nms") animateNms(canvas);
        else if (stepKey === "refine") animateRefine(canvas);
        else animateImageReveal(canvas, 900);
    }

    function animateImageReveal(canvas, duration = 900) {
        animateCanvas(canvas, (ctx, t, c) => {
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            ctx.fillStyle = `rgba(37,99,235,${0.12 * (1 - t)})`;
            ctx.fillRect(0, 0, c.width * t, c.height);
            ctx.restore();
        }, duration);
    }

    function animateGradientSplit(canvas) {
        const gray = renderPackedToCanvas(currentData?.arrays?.gray);
        const ix = renderPackedToCanvas(currentData?.arrays?.ix);
        const iy = renderPackedToCanvas(currentData?.arrays?.iy);
        animateCanvas(canvas, (ctx, t, c) => {
            if (!gray || !ix || !iy) return;
            const layout = panelLayout(c, 2);
            const split = easeInOutCubic(Math.max(0, Math.min(1, (t - 0.06) / 0.76)));
            const morph = easeOutCubic(Math.max(0, Math.min(1, (t - 0.28) / 0.58)));
            const full = {
                x: (c.width - currentData.meta.width) / 2,
                y: (c.height - currentData.meta.height) / 2,
                width: currentData.meta.width,
                height: currentData.meta.height
            };
            const leftTarget = { x: 0, y: layout.top, width: layout.panelWidth, height: layout.panelHeight };
            const rightTarget = {
                x: layout.panelWidth + layout.gap,
                y: layout.top,
                width: layout.panelWidth,
                height: layout.panelHeight
            };
            const leftRect = interpolateRect(full, leftTarget, split);
            const rightRect = interpolateRect(full, rightTarget, split);
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.save();
            drawMorphingPanel(ctx, gray, ix, leftRect, morph);
            drawMorphingPanel(ctx, gray, iy, rightRect, morph);
            if (split > 0.5) drawPanelDivider(ctx, layout.panelWidth, layout.gap, c.height);
            ctx.globalAlpha = morph;
            drawDirectionGlyph(ctx, Math.max(22, layout.panelWidth * 0.1), layout.top + Math.max(24, layout.panelHeight * 0.1), "x");
            drawDirectionGlyph(ctx, layout.panelWidth + layout.gap + Math.max(22, layout.panelWidth * 0.1), layout.top + Math.max(24, layout.panelHeight * 0.1), "y");
            const scan = 0.08 + 0.84 * ((t * 1.15) % 1);
            drawSobelWindow(ctx, scan * layout.panelWidth, layout.top + layout.panelHeight * 0.36, Math.min(46, layout.panelWidth * 0.2), "x", 0.78);
            drawSobelWindow(ctx, layout.panelWidth + layout.gap + scan * layout.panelWidth, layout.top + layout.panelHeight * 0.62, Math.min(46, layout.panelWidth * 0.2), "y", 0.78);
            ctx.restore();
        }, 1500);
    }

    function animateSecondMoment(canvas) {
        const ix = renderPackedToCanvas(currentData?.arrays?.ix);
        const iy = renderPackedToCanvas(currentData?.arrays?.iy);
        const ix2 = renderPackedToCanvas(currentData?.arrays?.ix2);
        const iy2 = renderPackedToCanvas(currentData?.arrays?.iy2);
        const ixiy = renderPackedToCanvas(currentData?.arrays?.ixiy);
        animateCanvas(canvas, (ctx, t, c) => {
            if (!ix || !iy || !ix2 || !iy2 || !ixiy) return;
            const layout2 = panelLayout(c, 2);
            const layout3 = panelLayout(c, 3);
            const rearrange = easeInOutCubic(Math.max(0, Math.min(1, (t - 0.05) / 0.72)));
            const morph = easeOutCubic(Math.max(0, Math.min(1, (t - 0.25) / 0.58)));
            const fromLeft = { x: 0, y: layout2.top, width: layout2.panelWidth, height: layout2.panelHeight };
            const fromRight = {
                x: layout2.panelWidth + layout2.gap,
                y: layout2.top,
                width: layout2.panelWidth,
                height: layout2.panelHeight
            };
            const targets = Array.from({ length: 3 }, (_, index) => ({
                x: index * (layout3.panelWidth + layout3.gap),
                y: layout3.top,
                width: layout3.panelWidth,
                height: layout3.panelHeight
            }));
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.save();
            drawMorphingPanel(ctx, ix, ix2, interpolateRect(fromLeft, targets[0], rearrange), morph);
            const crossStart = interpolateRect(fromLeft, fromRight, 0.5);
            drawMorphingPanel(ctx, ix, ixiy, interpolateRect(crossStart, targets[1], rearrange), morph);
            drawMorphingPanel(ctx, iy, iy2, interpolateRect(fromRight, targets[2], rearrange), morph);
            if (rearrange > 0.45) {
                drawPanelDivider(ctx, targets[1].x - layout3.gap, layout3.gap, c.height);
                drawPanelDivider(ctx, targets[2].x - layout3.gap, layout3.gap, c.height);
            }
            const probe = sourceToPanelCanvasPoint(c, 3, Math.min(2, Math.floor(t * 3)), probeForCurrentSelection().x || 0, probeForCurrentSelection().y || 0);
            drawMultiplyWindow(ctx, probe.x, probe.y, Math.min(54, layout3.panelWidth * 0.3), morph);
            ctx.restore();
        }, 1700);
    }

    function animateTensorBuild(canvas) {
        const ix2 = renderPackedToCanvas(currentData?.arrays?.ix2);
        const iy2 = renderPackedToCanvas(currentData?.arrays?.iy2);
        const ixiy = renderPackedToCanvas(currentData?.arrays?.ixiy);
        const sxx = renderPackedToCanvas(currentData?.arrays?.sxx);
        const syy = renderPackedToCanvas(currentData?.arrays?.syy);
        const sxy = renderPackedToCanvas(currentData?.arrays?.sxy);
        animateCanvas(canvas, (ctx, t, c) => {
            if (!ix2 || !iy2 || !ixiy || !sxx || !syy || !sxy) return;
            const layout = panelLayout(c, 3);
            const ease = easeOutCubic(Math.max(0, Math.min(1, (t - 0.08) / 0.76)));
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, c.width, c.height);
            [ix2, ixiy, iy2].forEach((img, index) => {
                const x = index * (layout.panelWidth + layout.gap);
                ctx.globalAlpha = 1 - ease;
                ctx.drawImage(img, x, layout.top, layout.panelWidth, layout.panelHeight);
                ctx.globalAlpha = ease;
                ctx.drawImage([sxx, sxy, syy][index], x, layout.top, layout.panelWidth, layout.panelHeight);
                if (index > 0) drawPanelDivider(ctx, x - layout.gap, layout.gap, c.height);
            });
            ctx.globalAlpha = 1;
            const probe = probeForCurrentSelection();
            const panel = Math.min(2, Math.floor(t * 3));
            const point = sourceToPanelCanvasPoint(c, 3, panel, probe.x || 0, probe.y || 0);
            drawGaussianWindow(ctx, point.x, point.y, Math.min(78, layout.panelWidth * 0.34), 0.75);
            drawMatrixCells(ctx, c.width - 72, 58, Math.min(1, t * 1.4));
        }, 1800);
    }

    function animateResponseBuild(canvas) {
        const tensors = [currentData?.arrays?.sxx, currentData?.arrays?.sxy, currentData?.arrays?.syy].map(item => renderPackedToCanvas(item));
        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = canvas.width;
        finalCanvas.height = canvas.height;
        finalCanvas.getContext("2d").drawImage(canvas, 0, 0);
        animateCanvas(canvas, (ctx, t, c) => {
            if (tensors.some(item => !item)) return;
            const layout = panelLayout(c, 3);
            const merge = easeInOutCubic(Math.max(0, Math.min(1, (t - 0.04) / 0.76)));
            const reveal = easeOutCubic(Math.max(0, Math.min(1, (t - 0.32) / 0.58)));
            const target = { x: 0, y: 0, width: c.width, height: c.height };
            ctx.save();
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, c.width, c.height);
            tensors.forEach((img, index) => {
                const start = {
                    x: index * (layout.panelWidth + layout.gap),
                    y: layout.top,
                    width: layout.panelWidth,
                    height: layout.panelHeight
                };
                const rect = interpolateRect(start, target, merge);
                ctx.globalAlpha = Math.max(0, 1 - reveal * 0.92);
                ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
            });
            ctx.globalAlpha = reveal;
            ctx.drawImage(finalCanvas, 0, 0, c.width, c.height);
            ctx.globalAlpha = 1;
            const probe = probeForCurrentSelection();
            const point = sourceToCanvasPoint(probe.x || 0, probe.y || 0, c) || { x: c.width / 2, y: c.height / 2 };
            drawResponseGlow(ctx, point.x, point.y, reveal);
            drawMatrixCells(ctx, Math.min(c.width - 68, point.x + 76), Math.max(54, point.y - 64), Math.max(0, 1 - merge * 1.2));
            ctx.restore();
        }, 1600);
    }

    function animateNms(canvas) {
        if (!canvas || !nmsCleanFrame) return;
        cancelCanvasAnimation();
        const ctx = canvas.getContext("2d");
        const kept = pointsForAlgorithm();
        const rippleKept = kept.slice(0, 250);
        const suppressed = responseCandidatesForNms(kept, 5000);
        const started = performance.now();
        const duration = 2500;
        const frame = now => {
            const t = Math.min(1, (now - started) / duration);
            ctx.putImageData(nmsCleanFrame, 0, 0);
            suppressed.forEach(point => {
                const nearest = nearestDistance(point, kept);
                const local = Math.max(0, Math.min(1, (t * 1.35) - nearest / 42));
                const intro = t < 0.18 ? 0.72 + 0.28 * Math.abs(Math.sin(t * Math.PI * 24)) : 1;
                const alpha = Math.max(0, 0.95 * intro * (1 - easeOutCubic(local)));
                if (alpha <= 0.02) return;
                ctx.globalAlpha = alpha;
                V.drawCircle(ctx, point.x, point.y, "#38bdf8", 4.2);
                ctx.globalAlpha = alpha * 0.55;
                V.drawCircle(ctx, point.x, point.y, "#f8fafc", 2.3);
            });
            ctx.globalAlpha = 1;
            rippleKept.forEach((point, index) => {
                const delay = index / Math.max(1, rippleKept.length) * 0.38;
                const local = Math.max(0, Math.min(1, (t - delay) / 0.56));
                if (local > 0) {
                    ctx.strokeStyle = `rgba(249,115,22,${0.58 * (1 - local)})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 8 + 36 * local, 0, Math.PI * 2);
                    ctx.stroke();
                }
            });
            kept.forEach(point => {
                if (selectedAlgorithm() === "shi-tomasi") V.drawCircle(ctx, point.x, point.y, "#16a34a", 4);
                else V.drawCircle(ctx, point.x, point.y, "#f97316", 4.5);
            });
            if (t < 1) animationFrameId = requestAnimationFrame(frame);
        };
        animationFrameId = requestAnimationFrame(frame);
    }

    function animateRefine(canvas) {
        const refined = refinedPoints().slice(0, 45);
        animateCanvas(canvas, (ctx, t) => {
            const move = easeOutCubic(Math.min(1, t / 0.72));
            const blink = t < 0.72 ? 0.45 : 0.22 + 0.78 * Math.abs(Math.sin(t * Math.PI * 14));
            refined.forEach(point => {
                const dx = point.x_sub - point.x;
                const dy = point.y_sub - point.y;
                const x = point.x + dx * move;
                const y = point.y + dy * move;
                ctx.strokeStyle = `rgba(249,115,22,${0.65 * (1 - t)})`;
                ctx.lineWidth = 2;
                ctx.globalAlpha = Math.max(0.18, 1 - t * 0.85);
                V.drawCircle(ctx, point.x, point.y, "#f97316", 4 + 4 * t);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = `rgba(6,182,212,${blink})`;
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(x, y);
                ctx.stroke();
                V.drawCross(ctx, x, y, "#06b6d4", 5);
            });
        }, 2600);
    }

    function animateFastStep(canvas, stepKey) {
        if (stepKey === "circle" || stepKey === "threshold") {
            animateFastWindow(canvas, stepKey);
        } else if (stepKey === "nms" || stepKey === "corners") {
            animateCanvas(canvas, (ctx, t) => {
                (currentFast?.corners || []).slice(0, 35).forEach(point => {
                    ctx.strokeStyle = `rgba(234,179,8,${0.7 * (1 - t)})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 8 + 24 * t, 0, Math.PI * 2);
                    ctx.stroke();
                });
            }, 1700);
        } else {
            animateImageReveal(canvas, 900);
        }
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function interpolateRect(from, to, t) {
        return {
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            width: from.width + (to.width - from.width) * t,
            height: from.height + (to.height - from.height) * t
        };
    }

    function drawMorphingPanel(ctx, fromImage, toImage, rect, progress) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.drawImage(fromImage, rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = progress;
        ctx.drawImage(toImage, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
    }

    function renderPackedToCanvas(packed, palette = "gray") {
        if (!packed?.values) return null;
        const canvas = document.createElement("canvas");
        V.drawArray(canvas, packed, palette);
        return canvas;
    }

    function drawPackedSourceSize(canvas, packed, palette = "gray") {
        if (!canvas || !packed?.values) return;
        const sourceWidth = packed.source_width || currentData?.meta?.width || packed.width;
        const sourceHeight = packed.source_height || currentData?.meta?.height || packed.height;
        V.setCanvasSize(canvas, sourceWidth, sourceHeight);
        const preview = renderPackedToCanvas(packed, palette);
        if (!preview) return;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
    }

    function drawDirectionGlyph(ctx, x, y, axis) {
        ctx.save();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (axis === "x") {
            ctx.moveTo(x - 14, y);
            ctx.lineTo(x + 14, y);
            ctx.moveTo(x + 8, y - 6);
            ctx.lineTo(x + 14, y);
            ctx.lineTo(x + 8, y + 6);
        } else {
            ctx.moveTo(x, y - 14);
            ctx.lineTo(x, y + 14);
            ctx.moveTo(x - 6, y + 8);
            ctx.lineTo(x, y + 14);
            ctx.lineTo(x + 6, y + 8);
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawSobelWindow(ctx, x, y, size, axis, alpha = 1) {
        const weights = axis === "x"
            ? [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
            : [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
        const cell = size / 3;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.4;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const value = weights[row][col];
                const px = x - size / 2 + col * cell;
                const py = y - size / 2 + row * cell;
                ctx.fillStyle = value > 0 ? "rgba(249,115,22,.42)" : value < 0 ? "rgba(37,99,235,.42)" : "rgba(255,255,255,.20)";
                ctx.strokeStyle = value === 0 ? "rgba(255,255,255,.38)" : "rgba(255,255,255,.82)";
                ctx.fillRect(px, py, cell, cell);
                ctx.strokeRect(px, py, cell, cell);
                if (value !== 0) {
                    ctx.fillStyle = "#fff";
                    ctx.font = `900 ${Math.max(10, cell * 0.34)}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(value > 0 ? "+" : "-", px + cell / 2, py + cell / 2);
                }
            }
        }
        ctx.strokeStyle = axis === "x" ? "#2563eb" : "#06b6d4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (axis === "x") {
            ctx.moveTo(x - size * 0.75, y);
            ctx.lineTo(x + size * 0.75, y);
        } else {
            ctx.moveTo(x, y - size * 0.75);
            ctx.lineTo(x, y + size * 0.75);
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawMultiplyWindow(ctx, x, y, size, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const radius = size / 2;
        ctx.strokeStyle = "rgba(255,255,255,.86)";
        ctx.fillStyle = "rgba(37,99,235,.18)";
        ctx.lineWidth = 2;
        roundRect(ctx, x - radius, y - radius, size, size, 10);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#f97316";
        ctx.beginPath();
        ctx.moveTo(x - radius * 0.55, y - radius * 0.55);
        ctx.lineTo(x + radius * 0.55, y + radius * 0.55);
        ctx.moveTo(x + radius * 0.55, y - radius * 0.55);
        ctx.lineTo(x - radius * 0.55, y + radius * 0.55);
        ctx.stroke();
        ctx.restore();
    }

    function drawGaussianWindow(ctx, x, y, size, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const radius = size / 2;
        const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
        gradient.addColorStop(0, "rgba(249,115,22,.48)");
        gradient.addColorStop(0.42, "rgba(37,99,235,.25)");
        gradient.addColorStop(1, "rgba(37,99,235,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.82)";
        ctx.lineWidth = 2;
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(x, y, radius * i / 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawValueDot(ctx, x, y, color, alpha = 1, radius = 9) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function drawCollision(ctx, x, y, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 8);
        ctx.lineTo(x + 8, y + 8);
        ctx.moveTo(x + 8, y - 8);
        ctx.lineTo(x - 8, y + 8);
        ctx.stroke();
        ctx.restore();
    }

    function drawWeightedParticle(ctx, x, y, color, alpha = 1) {
        drawValueDot(ctx, x, y, color, alpha, 8);
        ctx.save();
        ctx.globalAlpha = alpha * 0.65;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawMatrixCells(ctx, cx, cy, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const size = 34;
        const gap = 6;
        [["#60a5fa", "#f97316"], ["#f97316", "#60a5fa"]].forEach((row, y) => {
            row.forEach((color, x) => {
                ctx.fillStyle = color;
                ctx.globalAlpha = alpha * 0.28;
                ctx.fillRect(cx - size - gap / 2 + x * (size + gap), cy - size - gap / 2 + y * (size + gap), size, size);
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = color;
                ctx.strokeRect(cx - size - gap / 2 + x * (size + gap), cy - size - gap / 2 + y * (size + gap), size, size);
            });
        });
        ctx.restore();
    }

    function drawResponseGlow(ctx, x, y, alpha = 1) {
        ctx.save();
        const radius = 18 + 22 * alpha;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(249,115,22,${0.7 * alpha})`);
        gradient.addColorStop(1, "rgba(249,115,22,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        drawValueDot(ctx, x, y, "#f97316", alpha, 9);
        ctx.restore();
    }

    function drawFloatingToken(ctx, x, y, text, background = "#eff6ff", alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = "bold 13px sans-serif";
        const width = Math.max(54, ctx.measureText(String(text)).width + 18);
        ctx.fillStyle = "rgba(15,23,42,.10)";
        ctx.fillRect(x - width / 2 + 2, y - 15 + 3, width, 30);
        ctx.fillStyle = background;
        ctx.strokeStyle = "#bfdbfe";
        ctx.lineWidth = 1;
        roundRect(ctx, x - width / 2, y - 15, width, 30, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(text), x, y);
        ctx.restore();
    }

    function drawOperator(ctx, x, y, op, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(op, x, y);
        ctx.restore();
    }

    function drawMatrixOverlay(ctx, cx, cy, matrix, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2;
        roundRect(ctx, cx - 86, cy - 46, 172, 92, 14);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`[ ${matrix?.[0]?.[0] ?? "-"}   ${matrix?.[0]?.[1] ?? "-"} ]`, cx, cy - 10);
        ctx.fillText(`[ ${matrix?.[1]?.[0] ?? "-"}   ${matrix?.[1]?.[1] ?? "-"} ]`, cx, cy + 20);
        ctx.restore();
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function syntheticSuppressedCandidates(kept) {
        const generated = [];
        kept.slice(0, 28).forEach(point => {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const radius = 9 + (i % 3) * 8;
                generated.push({
                    x: Math.max(0, Math.min(currentData.meta.width - 1, point.x + Math.cos(angle) * radius)),
                    y: Math.max(0, Math.min(currentData.meta.height - 1, point.y + Math.sin(angle) * radius))
                });
            }
        });
        return generated;
    }

    function responseCandidatesForNms(kept, limit = 180) {
        const packed = currentResponsePacked();
        if (!packed?.values?.length) return syntheticSuppressedCandidates(kept).slice(0, limit);
        const values = packed.values.map(value => Number(value) || 0);
        const maxValue = Math.max(...values);
        if (maxValue <= 0) return syntheticSuppressedCandidates(kept).slice(0, limit);
        const keptSet = new Set((kept || []).map(point => `${Math.round(point.x)},${Math.round(point.y)}`));
        const candidates = [];
        const stride = Math.max(1, Math.floor(Math.min(packed.width, packed.height) / 180));
        const threshold = maxValue * 0.38;
        for (let y = 0; y < packed.height; y += stride) {
            for (let x = 0; x < packed.width; x += stride) {
                const response = values[y * packed.width + x];
                if (response < threshold) continue;
                const sourceX = Math.round(x / Math.max(1, packed.width - 1) * (packed.source_width || currentData.meta.width));
                const sourceY = Math.round(y / Math.max(1, packed.height - 1) * (packed.source_height || currentData.meta.height));
                if (keptSet.has(`${sourceX},${sourceY}`)) continue;
                if (nearestDistance({ x: sourceX, y: sourceY }, kept) <= 2) continue;
                candidates.push({ x: sourceX, y: sourceY, response });
            }
        }
        candidates.sort((a, b) => b.response - a.response);
        return candidates.slice(0, limit);
    }

    function nearestDistance(point, points) {
        if (!point || !points?.length) return Infinity;
        let best = Infinity;
        points.forEach(item => {
            best = Math.min(best, Math.hypot(point.x - item.x, point.y - item.y));
        });
        return best;
    }

    function animateFastWindow(canvas, stepKey) {
        const points = (currentFast?.candidates || currentFast?.corners || []).slice(0, 20);
        if (!points.length) return;
        animateCanvas(canvas, (ctx, t) => {
            const idx = Math.min(points.length - 1, Math.floor(t * points.length));
            const point = points[idx];
            const radius = 18;
            ctx.save();
            ctx.strokeStyle = "#eab308";
            ctx.lineWidth = 2.5;
            ctx.fillStyle = "rgba(234,179,8,.10)";
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            V.fastCircle.forEach(([dx, dy], i) => {
                const x = point.x + dx * 4;
                const y = point.y + dy * 4;
                const active = point.start >= 0 && Array.from({ length: currentFast.contiguous }, (_, step) => (point.start + step) % 16).includes(i);
                ctx.fillStyle = active ? "#f97316" : "#facc15";
                ctx.beginPath();
                ctx.arc(x, y, active ? 4 : 3, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }, 1900);
    }

    async function drawFastProbe(canvas) {
        const point = currentFast?.corners?.[0] || currentFast?.candidates?.[0];
        if (!canvas || !currentGray || !point) return;
        V.setCanvasSize(canvas, 620, 430);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const centerX = 300;
        const centerY = 210;
        const radius = 145;
        const centerValue = fastCenterValue(point);
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(centerValue, centerX, centerY + 5);
        V.fastCircle.forEach((offset, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / 16;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            const value = currentGray.gray[(point.y + offset[1]) * currentGray.width + point.x + offset[0]];
            const active = point.start >= 0 && Array.from({ length: currentFast.contiguous }, (_, step) => (point.start + step) % 16).includes(index);
            ctx.fillStyle = active ? (point.polarity === "bright" ? "#f97316" : "#7c3aed") : "#dbeafe";
            ctx.strokeStyle = active ? "#1e3a8a" : "#93c5fd";
            ctx.lineWidth = active ? 2 : 1;
            ctx.beginPath();
            ctx.arc(x, y, 21, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = active ? "#fff" : "#1e3a8a";
            ctx.fillText(Math.round(value), x, y + 5);
        });
    }

    async function drawCurrentStep() {
        if (!currentData) return;
        cancelCanvasAnimation();
        const steps = harrisSteps();
        if (currentStep >= steps.length) currentStep = steps.length - 1;
        const step = steps[currentStep];
        const canvas = V.$("cornerStepCanvas");
        const shouldAnimateSize = selectedAlgorithm() !== "fast" && ["gradient", "second", "response"].includes(step.key);
        const previousDisplaySize = shouldAnimateSize ? captureCanvasDisplaySize(canvas) : null;
        clearCanvasDisplayTransition(canvas);
        const original = currentData.images.original;
        V.$("cornerStageTitle").textContent = `${algorithmLabel()} · ${step.en}`;
        V.$("cornerStepStatus").textContent = step.zh;
        V.$("cornerFlowTitle").textContent = `${algorithmLabel()} 角点检测计算流程`;
        V.$("cornerChainTitle").textContent = selectedAlgorithm() === "fast"
            ? "Gray Center → 16-Circle → Threshold → Run → Score → NMS"
            : "Gray Patch → Ix/Iy → Ix²/IxIy/Iy² → Gaussian Window → Sxx/Sxy/Syy → M → det/trace/R → NMS → Refine";
        const probe = probeForCurrentSelection();
        V.$("cornerPointBadge").textContent = selectedAlgorithm() === "fast"
            ? `FAST-${currentFast?.contiguous || fastOptions().contiguous}`
            : `当前点 (${probe.x ?? "-"}, ${probe.y ?? "-"})`;

        if (selectedAlgorithm() === "fast") {
            await drawFastStep(canvas, step.key, original);
            renderFastChain(step.key);
        } else {
            await drawHarrisStep(canvas, step.key, original);
            renderHarrisChain(step.key);
        }
        if (shouldAnimateSize) animateCanvasDisplaySize(canvas, previousDisplaySize);
        drawProbeMarker(canvas);
        window.setTimeout(() => {
            animateCurrentStep(canvas, step.key);
        }, 20);
        renderCurrentProbe(step.key);
        const finalVisible = step.key === "refine" || step.key === "nms" && selectedAlgorithm() === "shi-tomasi" || step.key === "corners";
        V.$("cornerFinalSection").hidden = !finalVisible;
        if (finalVisible) await renderFinalCompare();
        renderStats(step.key);
        renderNotes(step.key);
        renderFlow();
    }

    function currentResponsePacked() {
        const arrays = currentData?.arrays || {};
        return selectedAlgorithm() === "harris" ? arrays.harris_response : arrays.shi_tomasi_response;
    }

    function responseOverlayColor(value) {
        const t = Math.max(0, Math.min(1, value));
        if (t < 0.32) {
            const k = t / 0.32;
            return [
                18 + 18 * k,
                136 + 92 * k,
                210 + 35 * k
            ];
        }
        if (t < 0.68) {
            const k = (t - 0.32) / 0.36;
            return [
                36 + 216 * k,
                228 - 12 * k,
                245 - 185 * k
            ];
        }
        const k = (t - 0.68) / 0.32;
        return [
            252,
            216 - 124 * k,
            60 - 44 * k
        ];
    }

    async function drawResponseOverlay(canvas, original, packed, opts = {}) {
        const result = await V.drawBaseImage(canvas, original, "#f8fbff");
        if (!result || !packed?.values?.length) return;
        const ctx = result.ctx;
        const w = canvas.width;
        const h = canvas.height;
        ctx.save();
        ctx.fillStyle = `rgba(248, 251, 255, ${opts.baseFade ?? 0.54})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = w;
        overlayCanvas.height = h;
        const overlayCtx = overlayCanvas.getContext("2d");
        const overlay = overlayCtx.createImageData(w, h);
        const pW = packed.width || w;
        const pH = packed.height || h;
        const floor = opts.floor ?? 0.045;
        for (let y = 0; y < h; y++) {
            const py = Math.min(pH - 1, Math.max(0, Math.floor(y / Math.max(1, h) * pH)));
            for (let x = 0; x < w; x++) {
                const px = Math.min(pW - 1, Math.max(0, Math.floor(x / Math.max(1, w) * pW)));
                const raw = (Number(packed.values[py * pW + px]) || 0) / 255;
                if (raw <= floor) continue;
                const t = Math.pow((raw - floor) / (1 - floor), 0.48);
                const [r, g, b] = responseOverlayColor(t);
                const alpha = Math.max(0, Math.min(235, 235 * Math.pow(t, 1.02)));
                const i = (y * w + x) * 4;
                overlay.data[i] = r;
                overlay.data[i + 1] = g;
                overlay.data[i + 2] = b;
                overlay.data[i + 3] = alpha;
            }
        }
        overlayCtx.putImageData(overlay, 0, 0);
        ctx.drawImage(overlayCanvas, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.22;
        ctx.drawImage(overlayCanvas, 0, 0);
        ctx.restore();
    }

    async function drawHarrisStep(canvas, stepKey, original) {
        const arrays = currentData.arrays || {};
        const points = pointsForAlgorithm();
        if (stepKey === "input") await V.drawBaseImage(canvas, original);
        else if (stepKey === "gray") drawPackedSourceSize(canvas, arrays.gray);
        else if (stepKey === "gradient") await drawSplitArrays(canvas, arrays.ix, arrays.iy, "Ix", "Iy");
        else if (stepKey === "second") await drawSecondMomentArrays(canvas, arrays);
        else if (stepKey === "tensor") await drawTensorArrays(canvas, arrays);
        else if (stepKey === "response") await drawResponseOverlay(canvas, original, currentResponsePacked());
        else if (stepKey === "nms") {
            await drawNmsBeforeCanvas(canvas, original, points);
        } else if (stepKey === "final") {
            await drawFinalOverlay(canvas, original);
        } else {
            await V.drawSubpixelKeypoints(canvas, original, points, refinedPoints(), Boolean(V.$("showSubpixel")?.checked));
        }
    }

    async function drawFastStep(canvas, stepKey, original) {
        if (stepKey === "input") await V.drawBaseImage(canvas, original);
        else if (stepKey === "gray") drawPackedSourceSize(canvas, grayPacked());
        else if (stepKey === "circle" || stepKey === "threshold") await V.drawBaseImage(canvas, original, "#f8fbff");
        else if (stepKey === "nms") await V.drawFastKeypoints(canvas, original, currentFast?.candidates || [], { max: 1200, color: "#facc15", size: 3 });
        else await V.drawFastKeypoints(canvas, original, currentFast?.corners || []);
    }

    async function drawSplitArrays(canvas, left, right, leftLabel, rightLabel) {
        if (!canvas || !left || !right) return;
        const gap = Math.max(8, Math.round(currentData.meta.width * 0.035));
        V.setCanvasSize(canvas, currentData.meta.width * 2 + gap, currentData.meta.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const a = document.createElement("canvas");
        const b = document.createElement("canvas");
        V.drawArray(a, left);
        V.drawArray(b, right);
        const layout = panelLayout(canvas, 2);
        ctx.drawImage(a, 0, layout.top, layout.panelWidth, layout.panelHeight);
        ctx.drawImage(b, layout.panelWidth + layout.gap, layout.top, layout.panelWidth, layout.panelHeight);
        drawPanelDivider(ctx, layout.panelWidth, layout.gap, canvas.height);
        drawDirectionGlyph(ctx, Math.max(22, layout.panelWidth * 0.1), layout.top + Math.max(24, layout.panelHeight * 0.1), "x");
        drawDirectionGlyph(ctx, layout.panelWidth + layout.gap + Math.max(22, layout.panelWidth * 0.1), layout.top + Math.max(24, layout.panelHeight * 0.1), "y");
    }

    function drawThreeArrays(canvas, first, second, third, labels) {
        if (!canvas || !first || !second || !third) return;
        const gap = Math.max(8, Math.round(currentData.meta.width * 0.035));
        V.setCanvasSize(canvas, currentData.meta.width * 3 + gap * 2, currentData.meta.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const canvases = [first, second, third].map(item => {
            const preview = document.createElement("canvas");
            V.drawArray(preview, item);
            return preview;
        });
        const layout = panelLayout(canvas, 3);
        canvases.forEach((preview, index) => {
            const x = index * (layout.panelWidth + layout.gap);
            ctx.drawImage(preview, x, layout.top, layout.panelWidth, layout.panelHeight);
            if (index > 0) drawPanelDivider(ctx, x - layout.gap, layout.gap, canvas.height);
        });
    }

    function drawPanelDivider(ctx, x, width, height) {
        if (width <= 0) return;
        const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
        gradient.addColorStop(0, "rgba(15,23,42,.72)");
        gradient.addColorStop(0.5, "rgba(37,99,235,.28)");
        gradient.addColorStop(1, "rgba(15,23,42,.72)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, 0, width, height);
    }

    async function drawSecondMomentArrays(canvas, arrays) {
        drawThreeArrays(canvas, arrays.ix2, arrays.ixiy, arrays.iy2, ["Ix²", "IxIy", "Iy²"]);
    }

    async function drawTensorArrays(canvas, arrays) {
        drawThreeArrays(canvas, arrays.sxx, arrays.sxy, arrays.syy, ["Sxx", "Sxy", "Syy"]);
    }

    async function drawFinalOverlay(canvas, original) {
        if (selectedAlgorithm() === "fast") {
            await V.drawFastKeypoints(canvas, original, currentFast?.corners || []);
            return;
        }
        if (selectedAlgorithm() === "shi-tomasi") {
            await V.drawKeypoints(canvas, original, pointsForAlgorithm(), { color: "#16a34a", type: "circle", max: 1000 });
            return;
        }
        await drawCornerCompareCanvas(canvas, original, pointsForAlgorithm(), refinedPoints(), true);
    }

    async function drawNmsBeforeCanvas(canvas, original, kept) {
        const result = await V.drawBaseImage(canvas, original, "#f8fbff");
        if (!result) return;
        const ctx = result.ctx;
        nmsCleanFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const suppressed = responseCandidatesForNms(kept, 180);
        ctx.globalAlpha = 0.95;
        suppressed.forEach(point => {
            V.drawCircle(ctx, point.x, point.y, "#38bdf8", 4.2);
            ctx.globalAlpha = 0.55;
            V.drawCircle(ctx, point.x, point.y, "#f8fafc", 2.3);
            ctx.globalAlpha = 0.95;
        });
        ctx.globalAlpha = 1;
        kept.slice(0, 500).forEach(point => {
            if (selectedAlgorithm() === "shi-tomasi") V.drawCircle(ctx, point.x, point.y, "#16a34a", 4);
            else V.drawCircle(ctx, point.x, point.y, "#f97316", 4.5);
        });
    }

    async function renderFinalCompare() {
        const original = currentData.images.original;
        const algorithm = selectedAlgorithm();
        if (algorithm === "fast") {
            await V.drawFastKeypoints(V.$("cornerIntegerCanvas"), original, currentFast?.candidates || [], { max: 1200, color: "#facc15", size: 3 });
            await V.drawFastKeypoints(V.$("cornerRefineCanvas"), original, currentFast?.corners || []);
            V.$("cornerIntegerCaption").textContent = "FAST 候选点";
            V.$("cornerRefineCaption").textContent = "NMS 后 FAST 角点";
            V.$("cornerFinalTitle").textContent = "FAST 候选点 vs NMS 后角点";
            V.$("cornerFinalBadge").textContent = `${currentFast?.corners?.length || 0} 点`;
            return;
        }
        const points = pointsForAlgorithm();
        if (algorithm === "shi-tomasi") {
            await V.drawKeypoints(V.$("cornerIntegerCanvas"), original, points, { color: "#16a34a", type: "circle", max: 1000 });
            await V.drawKeypoints(V.$("cornerRefineCanvas"), original, points, { color: "#16a34a", type: "circle", max: 1000 });
            V.$("cornerIntegerCaption").textContent = "Shi-Tomasi 角点";
            V.$("cornerRefineCaption").textContent = "最终角点叠加";
            V.$("cornerFinalTitle").textContent = "Shi-Tomasi 响应角点";
            V.$("cornerFinalBadge").textContent = `${points.length} 点`;
            return;
        }
        const refined = refinedPoints();
        await drawCornerCompareCanvas(V.$("cornerIntegerCanvas"), original, points, [], false);
        await drawCornerCompareCanvas(V.$("cornerRefineCanvas"), original, points, refined, true);
        V.$("cornerIntegerCaption").textContent = "整数角点";
        V.$("cornerRefineCaption").textContent = "亚像素角点";
        V.$("cornerFinalTitle").textContent = "整数角点 vs 亚像素角点";
        V.$("cornerFinalBadge").textContent = `${refined.length} 个有效亚像素点`;
    }

    async function drawCornerCompareCanvas(canvas, original, corners, refined, showRefined) {
        const result = await V.drawBaseImage(canvas, original, "#f8fbff");
        if (!result) return;
        const ctx = result.ctx;
        corners.slice(0, 1000).forEach(point => V.drawCircle(ctx, point.x, point.y, "#f97316", 4.5));
        if (!showRefined) return;
        refined.slice(0, 1000).forEach(point => {
            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(point.x_sub, point.y_sub);
            ctx.stroke();
            V.drawCross(ctx, point.x_sub, point.y_sub, "#06b6d4", 4.5);
        });
    }

    function subpixelOffsetStats(refined) {
        const offsets = (refined || []).map(point => Math.hypot((point.x_sub || point.x) - point.x, (point.y_sub || point.y) - point.y));
        if (!offsets.length) return { avg: "-", max: "-" };
        const avg = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
        return { avg: avg.toFixed(3), max: Math.max(...offsets).toFixed(3) };
    }

    function renderStats(stepKey) {
        const algorithm = selectedAlgorithm();
        const points = pointsForAlgorithm();
        const candidates = algorithm === "fast"
            ? currentFast?.candidates?.length || 0
            : (algorithm === "shi-tomasi" ? currentData?.shi_tomasi?.candidate_count || 0 : currentData?.harris?.candidate_count || 0);
        const refined = refinedPoints();
        const offsets = subpixelOffsetStats(refined);
        V.renderStatList(V.$("cornerStepStats"), [
            ["当前算法", algorithmLabel()],
            ["当前步骤", stepKey],
            ["候选点数", candidates],
            ["保留点数", points.length]
        ]);
        V.renderStatList(V.$("harrisSummary"), [
            ["候选点数", candidates],
            ["NMS 保留数", points.length],
            ["亚像素有效数", algorithm === "harris" ? refined.length : "-"],
            ["亚像素平均偏移", algorithm === "harris" ? offsets.avg : "-"],
            ["亚像素最大偏移", algorithm === "harris" ? offsets.max : "-"],
            ["处理耗时", algorithm === "fast" ? "浏览器计算" : `${currentData.meta.elapsed_ms} ms`],
            ["图像尺寸", `${currentData.meta.width}×${currentData.meta.height}`]
        ]);
    }

    function renderFlow() {
        const steps = harrisSteps();
        V.$("cornerFlowLine").innerHTML = steps.map((step, index) => `
            <button type="button" class="flow-step ${index === currentStep ? "is-active" : ""}" data-corner-step="${index}">
                <i>${index + 1}</i><b>${step.en}</b><small>${step.zh}</small>
            </button>
        `).join("");
        V.$("cornerFlowThumbs").innerHTML = steps.map((step, index) => `
            <button type="button" class="${index === currentStep ? "is-active" : ""}" data-corner-step="${index}">
                <canvas id="cornerThumb${index}"></canvas><span>${step.en}</span>
            </button>
        `).join("");
        V.$("cornerFlowLine").querySelectorAll("[data-corner-step]").forEach(bindStepButton);
        V.$("cornerFlowThumbs").querySelectorAll("[data-corner-step]").forEach(bindStepButton);
        drawThumbs(steps);
    }

    function bindStepButton(button) {
        button.addEventListener("click", () => {
            currentStep = Number(button.dataset.cornerStep) || 0;
            drawCurrentStep();
        });
    }

    function drawThumbs(steps) {
        steps.forEach(async (step, index) => {
            const canvas = V.$(`cornerThumb${index}`);
            if (!canvas || !currentData) return;
            const original = currentData.images.original;
            if (step.key === "input") await V.drawBaseImage(canvas, original);
            else if (step.key === "gray") V.drawArray(canvas, currentData.arrays?.gray || grayPacked());
            else if (step.key === "gradient") V.drawArray(canvas, currentData.arrays?.ix || currentGray);
            else if (step.key === "second") V.drawArray(canvas, currentData.arrays?.ix2 || currentGray);
            else if (step.key === "tensor") V.drawArray(canvas, currentData.arrays?.sxx || currentGray);
            else if (step.key === "response") await drawResponseOverlay(canvas, original, currentResponsePacked(), { floor: 0.03 });
            else if (selectedAlgorithm() === "fast") {
                await V.drawFastKeypoints(canvas, original, step.key === "nms" ? currentFast?.candidates || [] : currentFast?.corners || [], { max: 250 });
            } else if (step.key === "refine" || step.key === "final") {
                await V.drawSubpixelKeypoints(canvas, original, pointsForAlgorithm(), refinedPoints(), true);
            } else {
                if (selectedAlgorithm() === "shi-tomasi") await V.drawKeypoints(canvas, original, pointsForAlgorithm(), { color: "#16a34a", type: "circle", max: 250 });
                else await V.drawSubpixelKeypoints(canvas, original, pointsForAlgorithm(), [], false);
            }
        });
    }

    async function render(data) {
        currentData = data;
        currentImageFingerprint = imageFingerprint();
        currentGray = await V.imageToGray(data.images.original);
        if (!selectedProbe && data.probe) {
            selectedProbe = { x: data.probe.x, y: data.probe.y };
        }
        if (selectedAlgorithm() === "fast") {
            currentFast = V.detectFast(currentGray.gray, currentGray.width, currentGray.height, fastOptions());
        } else {
            currentFast = null;
        }
        currentStep = Math.min(currentStep, harrisSteps().length - 1);
        await drawCurrentStep();
        V.$("harrisElapsed").textContent = selectedAlgorithm() === "fast" ? "FAST · 浏览器计算" : `${data.meta.elapsed_ms} ms`;
    }

    V.$("cornerAlgorithm").addEventListener("change", async () => {
        updateControlVisibility();
        currentStep = 0;
        form.requestSubmit();
    });
    V.$("showSubpixel").addEventListener("change", drawCurrentStep);
    V.$("cornerStepCanvas")?.addEventListener("click", handleProbePick);
    ["fastThreshold", "fastNmsRadius", "fastMaxCorners"].forEach(id => {
        V.$(id)?.addEventListener("input", () => {
            if (selectedAlgorithm() === "fast") form.requestSubmit();
        });
    });
    V.$("fastContiguous")?.addEventListener("change", () => {
        if (selectedAlgorithm() === "fast") form.requestSubmit();
    });
    form.querySelector("[data-samples]")?.addEventListener("click", event => {
        if (!event.target.closest("[data-example]")) return;
        currentImageFingerprint = "";
    });
    form.querySelector('input[type="file"][name="image"]')?.addEventListener("change", () => {
        currentImageFingerprint = "";
    });

    updateControlVisibility();
    V.bindAutoSubmit(form, {
        excludeIds: [
            "cornerAlgorithm",
            "showSubpixel",
            "fastThreshold",
            "fastContiguous",
            "fastNmsRadius",
            "fastMaxCorners"
        ]
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const currentRequest = ++requestId;
        const button = form.querySelector("button[type=submit]");
        if (button) button.textContent = "计算中...";
        try {
            let data;
            const canReuseFastImage = currentData && currentImageFingerprint === imageFingerprint();
            if (selectedAlgorithm() === "fast" && canReuseFastImage) {
                data = currentData;
            } else {
                data = await V.postForm(form, "/api/feature-detect");
            }
            if (currentRequest !== requestId) return;
            await render(data);
        } catch (error) {
            if (currentRequest === requestId) V.$("cornerStepStatus").textContent = error.message || "角点检测失败";
        } finally {
            if (currentRequest === requestId && button) button.textContent = "运行角点检测";
        }
    });

    form.requestSubmit();
})();
