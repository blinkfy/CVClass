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
    let animationStartTimer = 0;
    let currentImageFingerprint = "";
    let nmsCleanFrame = null;
    let canvasSizeTransitionTimer = 0;
    let motionProbeFrameId = 0;
    const motionProbeState = {
        playing: true,
        speed: 1,
        progress: 0,
        lastTime: 0,
        signature: ""
    };
    let rawHarrisCache = {
        key: "",
        data: null
    };

    function selectedAlgorithm() {
        return V.$("cornerAlgorithm")?.value || "harris";
    }

    function cornerDisplayMode() {
        return V.$("cornerDisplayMode")?.value || "current";
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
                input: ["输入图像", "读取当前图像并约束计算尺寸。", "\\(I(x,y)\\)", "后续 FAST 通过页面的 Canvas 像素读取灰度。"],
                gray: ["灰度化", "将 RGB 转为单通道强度，减少圆周比较的通道干扰。", "\\(Gray = 0.299R + 0.587G + 0.114B\\)", "灰度数组由页面生成。"],
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
                input: { title: "输入与灰度采样", goal: "FAST 通过页面读取 Canvas 像素并生成灰度数组。", io: "输入：RGB 图像 → 输出：Gray 灰度图", formulas: ["I(x,y)", "Gray=0.299R+0.587G+0.114B"], details: ["换图时重新生成灰度数组。", "后续判断全部基于单通道强度。"], next: "FAST 作为页面扩展，不影响 Harris/SIFT 主流程." },
                gray: { title: "灰度图", goal: "把彩色输入压缩为亮度图，减少 RGB 通道差异对圆周比较的干扰。", io: "输入：RGB → 输出：单通道灰度数组", formulas: ["G(x,y)=0.299R+0.587G+0.114B"], details: ["中心像素 C 与 16 个圆周像素都从 G 中读取。"], next: "灰度化在页面 Canvas ImageData 中手写完成." },
                circle: { title: "FAST 16 点圆周", goal: "以候选中心 C 为圆心，检查半径 3 的 Bresenham 圆周 16 个离散点。", io: "输入：灰度中心点及周围像素 → 输出：16 个圆周像素值", formulas: ["P_i=G(x+dx_i,y+dy_i),\\ i=0\\ldots15", "r=3"], details: ["滑动窗口表示逐像素移动候选中心。", "黄色圆周点对应 16 个比较位置。"], next: "不调用 OpenCV FAST，圆周点偏移由固定数组实现." },
                threshold: { title: "连续阈值判定", goal: `判断是否存在连续 ${fast.contiguous} 个圆周点同时明显亮于或暗于中心。`, io: "输入：16 个圆周点像素值与中心差值 → 输出：候选点", formulas: [`P_i>C+${fast.threshold}`, `P_i<C-${fast.threshold}`, `\\exists\\ ${fast.contiguous}\\ \\text{contiguous points}`], details: ["同一段必须全部为 bright 或全部为 dark。", "阈值越大，角点更少但更稳定。"], next: "FAST-9 与 FAST-12 只改变连续点数 N。" },
                nms: { title: "FAST 非极大值抑制", goal: "对候选点按 FAST 响应分数排序，在局部半径内只保留响应最大的点。", io: "输入：FAST 候选点集合 → 输出：NMS 后的稀疏角点", formulas: ["score=\\max\\sum |P_i-C|", "keep(p)=score(p)=\\max_{q\\in\\Omega_r(p)}score(q)"], details: ["灰色候选点被黄色保留点的邻域擦除。", "NMS 半径越大，最终点越稀疏。"], next: "最终 FAST 点用黄色菱形绘制。" },
                corners: { title: "FAST 最终角点", goal: "展示通过连续阈值和 NMS 后的最终 FAST 角点集合。", io: "输入：NMS 保留点 → 输出：页面绘制坐标", formulas: ["Corners=NMS(FAST(G,t,N))"], details: ["FAST 不计算结构张量，也不做亚像素二次曲面拟合。"], next: "FAST 只作为第 5 实验补充方法。" }
            };
            return map[stepKey] || map.corners;
        }
        const isShi = algorithm === "shi-tomasi";
        const map = {
            input: { title: "输入图像", goal: "读取当前图片并保持统一计算尺寸，后续梯度、张量和响应都基于同一输入。", io: "输入：RGB 图像 → 输出：标准化图片矩阵", formulas: ["I(x,y)"], details: ["切换样例或上传图片会重新生成结果。"], next: "算法模块只返回数组与角点数据，所有可视标记由页面 Canvas 绘制。" },
            gray: { title: "灰度化", goal: "将 RGB 图像转换成单通道灰度图，作为 Sobel 梯度的输入。", io: "输入：RGB 矩阵 → 输出：单通道 Gray 矩阵", formulas: ["G=0.299R+0.587G+0.114B"], details: ["灰度中心值会同步显示在局部探针中。"], next: "此处展示的是算法模块返回的灰度数组。" },
            gradient: { title: "Sobel 梯度计算", goal: "分别用水平和垂直 Sobel 核卷积灰度图，得到局部亮度变化方向。", io: "输入：Gray 矩阵 → 输出：Ix、Iy 梯度矩阵", formulas: ["I_x=G*S_x,\\quad S_x=\\begin{bmatrix}-1&0&1\\\\-2&0&2\\\\-1&0&1\\end{bmatrix}", "I_y=G*S_y,\\quad S_y=\\begin{bmatrix}-1&-2&-1\\\\0&0&0\\\\1&2&1\\end{bmatrix}"], details: ["Ix 强表示左右方向灰度变化明显。", "Iy 强表示上下方向灰度变化明显。"], next: "动画中的 3×3 Sobel 窗口表示卷积核在图像上滑动。" },
            second: { title: "Second Moment 原始项", goal: "把梯度转换为二阶乘积项，记录 x/y 方向能量和方向相关性。", io: "输入：Ix、Iy 矩阵 → 输出：Ix²、Iy²、IxIy 矩阵", formulas: ["E_{xx}=I_x^2", "E_{yy}=I_y^2", "E_{xy}=I_xI_y"], details: ["平方项只保留强度大小。", "交叉项描述两个方向梯度是否同时变化。"], next: "这些还是未经过高斯窗口统计的逐像素原始项。" },
            tensor: { title: "结构张量 M", goal: "对二阶项做高斯加权求和，得到描述局部窗口梯度分布的 2×2 矩阵。", io: "输入：二阶原始项 → 输出：2×2 张量 M (Sxx, Syy, Sxy)", formulas: ["S_{xx}=G_\\sigma * I_x^2,\\quad S_{yy}=G_\\sigma * I_y^2,\\quad S_{xy}=G_\\sigma * I_xI_y", "M=\\begin{bmatrix}S_{xx}&S_{xy}\\\\S_{xy}&S_{yy}\\end{bmatrix}"], details: ["两个特征值都大通常表示角点。", "只有一个方向大通常表示边缘。"], next: "动画中的同心高斯窗表示中心权重大、远处权重小。" },
            response: isShi
                ? { title: "Shi-Tomasi 响应", goal: "Shi-Tomasi 直接取结构张量较小特征值作为角点强度。", io: "输入：张量 M → 输出：角点响应值 R", formulas: ["\\lambda_{1,2}=\\frac{trace(M)\\pm\\sqrt{trace(M)^2-4det(M)}}{2}", "R=\\min(\\lambda_1,\\lambda_2)"], details: ["R 大说明两个主方向变化都足够强。", "阈值比 Harris 默认更高，减少弱纹理误检。"], next: "响应图以半透明热力叠加到淡化原图上。" }
                : { title: "Harris R 响应", goal: "Harris 用行列式和迹构造响应，抑制单方向强边缘，突出双方向变化。", io: "输入：张量 M → 输出：角点响应值 R", formulas: ["det(M)=S_{xx}S_{yy}-S_{xy}^2", "trace(M)=S_{xx}+S_{yy}", "R=det(M)-k\\cdot trace(M)^2"], details: ["R 大且为正更像角点。", "R 为负常对应边缘，接近 0 常对应平坦区域。"], next: "响应显示使用百分位裁剪和原图淡化叠加，避免单色淹没细节。" },
            nms: { title: "阈值与 NMS", goal: "先过滤低响应候选点，再在局部邻域中只保留响应最大的角点。", io: "输入：响应图 R → 输出：整数角点坐标集合", formulas: ["candidate=R(x,y)>\\tau\\cdot \\max(R)", "keep(p)=R(p)=\\max_{q\\in\\Omega_r(p)}R(q)"], details: ["保留点向周围发出抑制邻域。", "灰色多余候选点会逐步消失。"], next: isShi ? "Shi-Tomasi 最终点用绿色绘制。" : "Harris 整数角点用橙色圆圈绘制。" },
            refine: { title: "亚像素二次曲面拟合", goal: "在 3×3 响应邻域上估计局部二次曲面，求极值点相对整数角点的偏移。", io: "输入：整数角点周围响应 → 输出：亚像素级角点坐标", formulas: ["R(p+\\Delta p)\\approx R(p)+g^T\\Delta p+\\frac12\\Delta p^TH\\Delta p", "\\Delta p=-H^{-1}g", "p_{sub}=p+\\Delta p"], details: ["橙色圆圈表示整数角点。", "青色十字滑动到亚像素位置后闪烁。"], next: "亚像素定位完全基于 Harris response surface 计算。" },
            final: { title: "最终对比", goal: "对比整数角点与亚像素角点，观察二次拟合带来的细微定位偏移。", io: "输入：整数角点与亚像素点 → 输出：页面 Canvas 绘制", formulas: ["Final=\\{p_{sub}\\mid |\\Delta p|\\ \\text{valid}\\}"], details: ["统计区给出平均偏移和最大偏移。"], next: "Final Compare 只在最终步骤显示。" }
        };
        return map[stepKey] || map.final;
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

    function cornerNoteParams(stepKey) {
        const algorithm = selectedAlgorithm();
        if (algorithm === "fast") {
            const map = {
                circle: [["圆周半径", 3], ["圆周点数", 16]],
                threshold: [["亮度阈值", form.elements["fast_threshold"]?.value || "-"], ["连续点数 N", form.elements["fast_contiguous"]?.value || "-"]],
                nms: [["NMS 半径", form.elements["fast_nms_radius"]?.value || "-"]]
            };
            return map[stepKey] || [];
        }
        const isShi = algorithm === "shi-tomasi";
        const map = {
            tensor: [["高斯窗口 σ", form.elements["window_sigma"]?.value || "-"]],
            response: [
                isShi ? ["阈值因子", form.elements["shi_threshold"]?.value || "-"] : ["阈值因子", form.elements["threshold_factor"]?.value || "-"],
                isShi ? null : ["Harris k", form.elements["harris_k"]?.value || "-"]
            ].filter(Boolean),
            nms: [
                isShi ? ["NMS 窗口", form.elements["shi_nms_radius"]?.value || "-"] : ["NMS 窗口", form.elements["nms_radius"]?.value || "-"]
            ]
        };
        return map[stepKey] || [];
    }

    function renderNotes(stepKey) {
        const note = richNoteForStep(stepKey);
        V.$("cornerInfoTitle").textContent = `${algorithmLabel()} · ${note.title}`;
        V.$("cornerInfoGoal").textContent = note.goal || note.desc || "";
        V.$("cornerInfoIO").textContent = note.io || "";
        
        const formulaBox = V.$("cornerInfoLogic");
        if (formulaBox) {
            const formulas = Array.isArray(note.formulas) ? note.formulas : [note.formulas].filter(Boolean);
            formulaBox.innerHTML = `
                ${formulas.map(() => `<p class="latex-formula"></p>`).join("")}
                <ul class="feature-note-detail">${(note.details || []).map(item => `<li>${item}</li>`).join("")}</ul>
            `;
            formulaBox.querySelectorAll(".latex-formula").forEach((target, index) => {
                renderKatexFormula(target, formulas[index]);
            });
        }
        V.$("cornerInfoNext").textContent = note.next || note.boundary || "";
        
        const params = cornerNoteParams(stepKey);
        const results = noteValuesForStep(stepKey); // use existing noteValuesForStep for results
        
        const paramsContainer = V.$("cornerInfoParams");
        if (paramsContainer) {
            paramsContainer.parentElement.hidden = params.length === 0;
            V.renderStatList(paramsContainer, params);
        }
        const resultsContainer = V.$("cornerInfoResult");
        if (resultsContainer) {
            V.renderStatList(resultsContainer, results);
        }
    }

    function noteValuesForStep(stepKey) {
        if (selectedAlgorithm() === "fast") return fastNoteValuesForStep(stepKey);
        const arrays = currentData?.arrays || {};
        const probe = currentProbeData();
        const response = currentResponsePacked();
        const candidateTotal = candidateCount();
        const keptTotal = pointsForAlgorithm().length;
        const suppressedRatio = candidateTotal ? ((candidateTotal - keptTotal) / candidateTotal * 100).toFixed(1) + "%" : "-";
        const map = {
            input: [
                ["图像尺寸", `${currentData?.meta?.width || "-"}×${currentData?.meta?.height || "-"}`],
                ["当前点", `(${probe.x}, ${probe.y})`],
                ["Gray", formatNumber(probe.gray)]
            ],
            gray: [
                ["当前点 Gray", formatNumber(probe.gray)],
                ["灰度显示范围", formatRange(arrayStats(arrays.gray))]
            ],
            gradient: [
                ["Ix raw", formatNumber(probe.ix)],
                ["Iy raw", formatNumber(probe.iy)],
                ["|∇I|", formatNumber(Math.hypot(probe.ix, probe.iy))]
            ],
            second: [
                ["Ix² raw", formatNumber(probe.ix2)],
                ["Iy² raw", formatNumber(probe.iy2)],
                ["IxIy raw", formatNumber(probe.ixiy)]
            ],
            tensor: [
                ["Sxx raw", formatNumber(probe.sxx)],
                ["Syy raw", formatNumber(probe.syy)],
                ["Sxy raw", formatNumber(probe.sxy)],
                ["det raw", formatNumber(probe.det)],
                ["trace raw", formatNumber(probe.trace)]
            ],
            response: [
                [selectedAlgorithm() === "harris" ? "raw R" : "raw Shi R", formatNumber(probe.responseRaw)],
                ["display R", formatNumber(probe.responseDisplay)],
                ["raw 阈值", formatNumber(probe.thresholdRaw)],
                ["候选点数", candidateTotal]
            ],
            nms: [
                ["raw R", formatNumber(probe.responseRaw)],
                ["display R", formatNumber(probe.responseDisplay)],
                ["raw 阈值", formatNumber(probe.thresholdRaw)],
                ["neighbor max raw", formatNumber(probe.nmsMaxRaw)],
                ["NMS", probe.nmsResult ? "KEEP" : "SUPPRESS"],
                ["抑制比例", suppressedRatio]
            ],
            refine: [
                ["dx", formatNumber(probe.dx)],
                ["dy", formatNumber(probe.dy)],
                ["offset", formatNumber(probe.offset)],
                ["valid", probe.refineValid ? "YES" : "NO"]
            ],
            final: [
                ["最终点数", keptTotal],
                ["raw R", formatNumber(probe.responseRaw)],
                ["display R", formatNumber(probe.responseDisplay)]
            ]
        };
        return map[stepKey] || map.final;
    }

    function fastNoteValuesForStep(stepKey) {
        const point = fastProbePoint();
        const candidateTotal = currentFast?.candidates?.length || 0;
        const keptTotal = currentFast?.corners?.length || 0;
        const suppressedRatio = candidateTotal ? ((candidateTotal - keptTotal) / candidateTotal * 100).toFixed(1) + "%" : "-";
        const map = {
            input: [["图像尺寸", `${currentGray?.width || "-"}×${currentGray?.height || "-"}`], ["灰度范围", formatRange(grayArrayStats())]],
            gray: [["mean", formatNumber(grayArrayStats().mean)], ["std", formatNumber(grayArrayStats().std)], ["min", formatNumber(grayArrayStats().min)], ["max", formatNumber(grayArrayStats().max)]],
            circle: [["当前点", point ? `(${point.x}, ${point.y})` : "-"], ["中心灰度", fastCenterValue(point)], ["圆周点数", 16], ["半径", 3]],
            threshold: [["FAST 阈值", fastOptions().threshold], ["连续点数", `FAST-${fastOptions().contiguous}`], ["响应", point?.response ? formatNumber(point.response) : "-"], ["候选点数", candidateTotal]],
            nms: [["候选点数", candidateTotal], ["保留点数", keptTotal], ["抑制比例", suppressedRatio]],
            corners: [["最终点数", keptTotal], ["FAST 阈值", fastOptions().threshold], ["连续点数", `FAST-${fastOptions().contiguous}`]]
        };
        return map[stepKey] || map.corners;
    }

    function arrayStats(packed) {
        const values = (packed?.values || []).map(value => Number(value)).filter(Number.isFinite);
        if (!values.length) return { min: 0, max: 0, mean: 0, std: 0, maxAbs: 0 };
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        let maxAbs = 0;
        values.forEach(value => {
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
            maxAbs = Math.max(maxAbs, Math.abs(value));
        });
        const mean = sum / values.length;
        const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / values.length;
        return { min, max, mean, std: Math.sqrt(variance), maxAbs };
    }

    function grayArrayStats() {
        if (!currentGray?.gray?.length) return { min: 0, max: 0, mean: 0, std: 0, maxAbs: 0 };
        return arrayStats({ values: Array.from(currentGray.gray) });
    }

    function formatRange(stats) {
        return `${formatNumber(stats.min)} ~ ${formatNumber(stats.max)}`;
    }

    function formatNumber(value) {
        if (!Number.isFinite(Number(value))) return "-";
        const number = Number(value);
        if (Math.abs(number) >= 1000) return number.toFixed(0);
        if (Math.abs(number) >= 10) return number.toFixed(2);
        return number.toFixed(3);
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
            const nms = nmsProbeDecision(probe);
            renderTextCard(box, "NMS 当前点", [
                ["坐标", `(${nms.x}, ${nms.y})`],
                ["当前 R", nms.currentR],
                ["局部最大 R", nms.localMax],
                ["超过阈值", nms.aboveThreshold ? "是" : "否"],
                ["局部最大", nms.localMaximum ? "是" : "否"],
                ["NMS 结果", nms.kept ? "保留" : "删除"]
            ]);
            renderTextCard(box, nms.kept ? "保留原因" : "抑制原因", [
                ["判断", nms.reason],
                ["抑制点", nms.suppressor ? `(${nms.suppressor.x}, ${nms.suppressor.y})` : "-"],
                ["邻域半径", nmsRadiusForCurrentAlgorithm()]
            ]);
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
        const probe = probeForCurrentSelection();
        if (selectedAlgorithm() === "fast") {
            const point = fastProbePoint();
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
        const nms = stepKey === "nms" ? nmsProbeDecision(probe) : null;
        const tables = {
            input: [["图像尺寸", `${currentData.meta.width}×${currentData.meta.height}`], ["当前算法", algorithmLabel()]],
            gray: [["当前点", `(${probe.x ?? "-"}, ${probe.y ?? "-"})`], ["灰度中心", centerOf(probe.gray_patch)]],
            gradient: [["Ix 中心", centerOf(probe.ix_patch)], ["Iy 中心", centerOf(probe.iy_patch)]],
            second: [["Ix²", centerOf(probe.ix2_patch)], ["IxIy", centerOf(probe.ixiy_patch)], ["Iy²", centerOf(probe.iy2_patch)]],
            tensor: [["Sxx", probe.M?.[0]?.[0] ?? "-"], ["Sxy", probe.M?.[0]?.[1] ?? "-"], ["Syy", probe.M?.[1]?.[1] ?? "-"]],
            response: [["det(M)", probe.det ?? "-"], ["trace(M)", probe.trace ?? "-"], [selectedAlgorithm() === "harris" ? "R" : "min eigen", probe.r ?? "-"]],
            nms: [
                ["当前点", `(${nms?.x ?? "-"}, ${nms?.y ?? "-"})`],
                ["当前 R", nms?.currentR ?? "-"],
                ["邻域最大 R", nms?.localMax ?? "-"],
                ["超过阈值", nms?.aboveThreshold ? "是" : "否"],
                ["局部最大", nms?.localMaximum ? "是" : "否"],
                ["NMS 结果", nms?.kept ? "保留" : "删除"]
            ],
            refine: [["有效亚像素", refined.length], ["平均偏移", offsets.avg], ["最大偏移", offsets.max]],
            final: [["最终点数", pointsForAlgorithm().length], ["平均偏移", selectedAlgorithm() === "harris" ? offsets.avg : "-"], ["最大偏移", selectedAlgorithm() === "harris" ? offsets.max : "-"]]
        };
        V.renderStatList(box, tables[stepKey] || tables.final);
    }

    function renderFastChain(stepKey) {
        const box = V.$("cornerChainProbe");
        box.innerHTML = "";
        const point = fastProbePoint();
        if (stepKey === "input" || stepKey === "gray") {
            renderTextCard(box, "灰度中心", [["坐标", point ? `(${point.x}, ${point.y})` : "-"], ["中心灰度", fastCenterValue(point)]]);
        } else if (stepKey === "circle") {
            renderTextCard(box, "16 点圆周", [["半径", 3], ["圆周点", 16], ["中心", fastCenterValue(point)]]);
            renderAnimatedFormula(box, "圆周采样", "center", "→", "P0...P15", "16 values");
        } else if (stepKey === "threshold") {
            const polarity = point?.polarity === "bright" ? "亮于中心" : point?.polarity === "dark" ? "暗于中心" : "未形成连续段";
            renderTextCard(box, "连续阈值", [["阈值", currentFast?.threshold || fastOptions().threshold], ["连续点", `FAST-${currentFast?.contiguous || fastOptions().contiguous}`], ["极性", polarity]]);
            renderAnimatedFormula(box, "阈值比较", "|Pi-C|", ">", "t", "candidate");
        } else if (stepKey === "nms") {
            renderTextCard(box, "FAST NMS", [["候选", currentFast?.candidates?.length || 0], ["半径", fastOptions().nmsRadius], ["保留", currentFast?.corners?.length || 0]]);
            renderAnimatedFormula(box, "局部最大", "score", "≥", "neighbors", "keep");
        } else {
            renderTextCard(box, "最终角点", [["FAST 点", currentFast?.corners?.length || 0], ["标记", "黄色菱形"]]);
        }
    }

    function renderMotionProbe(stepKey) {
        const canvas = V.$("cornerMotionCanvas");
        if (!canvas || !currentData) return;
        const algorithm = selectedAlgorithm();
        const probe = algorithm === "fast" ? fastProbePoint() : probeForCurrentSelection();
        const step = harrisSteps().find(item => item.key === stepKey) || { en: stepKey, zh: stepKey };
        const signature = `${algorithm}:${stepKey}:${probe?.x ?? "-"}:${probe?.y ?? "-"}`;
        if (motionProbeState.signature !== signature) {
            motionProbeState.signature = signature;
            motionProbeState.progress = 0;
            motionProbeState.playing = true;
            motionProbeState.lastTime = 0;
        }
        V.$("cornerMotionTitle").textContent = `${algorithmLabel()} · ${step.en}`;
        V.$("cornerPointBadge").textContent = probe ? `当前点 (${probe.x}, ${probe.y})` : "当前点 -";
        V.$("cornerProbeTitle").textContent = `${step.en} 关键结果`;
        renderMotionMetrics(stepKey);
        renderMotionStepChips(stepKey);
        syncMotionControls();
        startMotionProbeLoop(stepKey);
    }

    function startMotionProbeLoop(stepKey) {
        cancelMotionProbe();
        const canvas = V.$("cornerMotionCanvas");
        if (!canvas) return;
        V.setCanvasSize(canvas, 860, 236);
        const tick = now => {
            const last = motionProbeState.lastTime || now;
            const delta = Math.min(80, now - last);
            motionProbeState.lastTime = now;
            if (motionProbeState.playing) {
                const duration = 5600 / Math.max(0.25, motionProbeState.speed);
                motionProbeState.progress = (motionProbeState.progress + delta / duration) % 1;
            }
            drawMotionProbeFrame(canvas, stepKey, motionProbeState.progress);
            motionProbeFrameId = requestAnimationFrame(tick);
        };
        motionProbeFrameId = requestAnimationFrame(tick);
    }

    function cancelMotionProbe() {
        if (motionProbeFrameId) {
            cancelAnimationFrame(motionProbeFrameId);
            motionProbeFrameId = 0;
        }
    }

    function motionActions(stepKey) {
        if (selectedAlgorithm() === "fast") {
            const fastMap = {
                input: ["读取图像", "定位探针", "滑动窗口", "准备圆周"],
                gray: ["RGB 采样", "灰度融合", "中心强度", "灰度 Patch"],
                circle: ["中心像素", "半径 r=3", "16 点展开", "圆周编号"],
                threshold: ["中心阈值", "亮暗分类", "连续段扫描", "通过判定"],
                nms: ["候选点", "局部最大", "抑制", "保留"],
                corners: ["候选集合", "局部极大", "FAST 角点", "最终结果"]
            };
            return fastMap[stepKey] || ["中心点", "16 点采样", "亮暗分类", "连续弧段"];
        }
        const map = {
            gradient: ["提取 Patch", "Sobel Gx/Gy", "加权求和", "梯度向量"],
            second: ["Ix/Iy 输入", "Ix² / Iy²", "IxIy 交叉项", "二阶项输出"],
            tensor: ["二阶项", "Gaussian 加权", "Sxx/Sxy/Syy", "组装 M"],
            response: selectedAlgorithm() === "shi-tomasi" ? ["M 输入", "λ1 / λ2", "选择 λmin", "响应输出"] : ["M 输入", "det / trace", "Harris R 计算", "响应输出"],
            nms: ["候选响应", "阈值判断", "邻域最大", "NMS 结果"],
            refine: ["整数角点", "二次拟合", "偏移向量", "亚像素点"],
            gray: ["RGB 采样", "灰度融合", "中心值", "Patch 输出"],
            input: ["读取图像", "选取探针", "局部窗口", "准备计算"]
        };
        return map[stepKey] || ["输入", "计算", "筛选", "输出"];
    }

    function motionPhase(stepKey, progress) {
        const actions = motionActions(stepKey);
        const raw = progress * actions.length;
        const index = Math.min(actions.length - 1, Math.floor(raw));
        const segmentLocal = raw - index;
        const local = progress;
        V.$("cornerMotionAction").textContent = actions[index] || "计算中";
        V.$("cornerMotionFrame").textContent = String(index + 1).padStart(2, "0");
        syncMotionStepChips(index, segmentLocal);
        return { actions, index, local, segmentLocal, total: raw, progress, pulse: 0.5 + 0.5 * Math.sin(progress * Math.PI * 2) };
    }

    function motionProgress(phase) {
        return Math.max(0, Math.min(1, Number(phase?.progress ?? phase?.local ?? 0)));
    }

    function motionEase(phase, start = 0, end = 1, floor = 0) {
        const span = Math.max(0.001, end - start);
        const t = Math.max(0, Math.min(1, (motionProgress(phase) - start) / span));
        return Math.max(floor, easeInOutCubic(t));
    }

    function renderMotionStepChips(stepKey) {
        const box = V.$("cornerMotionSteps");
        if (!box) return;
        const actions = motionActions(stepKey);
        box.innerHTML = actions.map((action, index) => `
            <div class="corner-motion-step-chip" data-motion-step-chip="${index}" style="--chip-progress:0">
                <span>${index + 1}. ${action}</span>
            </div>
        `).join("");
    }

    function syncMotionStepChips(activeIndex, localProgress) {
        const chips = Array.from(document.querySelectorAll("[data-motion-step-chip]"));
        chips.forEach((chip, index) => {
            chip.classList.toggle("is-active", index === activeIndex);
            chip.classList.toggle("is-done", index < activeIndex);
            const progress = index < activeIndex ? 1 : index === activeIndex ? Math.max(0.04, Math.min(1, localProgress)) : 0;
            chip.style.setProperty("--chip-progress", `${(progress * 100).toFixed(1)}%`);
        });
    }

    function syncMotionControls() {
        V.$("motionProbePlay")?.classList.toggle("is-active", motionProbeState.playing);
        V.$("motionProbePause")?.classList.toggle("is-active", !motionProbeState.playing);
        document.querySelectorAll("[data-motion-speed]").forEach(button => {
            button.classList.toggle("is-active", Number(button.dataset.motionSpeed) === Number(motionProbeState.speed));
        });
    }

    function drawMotionProbeFrame(canvas, stepKey, progress) {
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        drawMotionBackground(ctx, w, h);
        const phase = motionPhase(stepKey, progress);
        if (selectedAlgorithm() === "fast") drawMotionFast(ctx, stepKey, phase, w, h);
        else if (stepKey === "input") drawMotionInput(ctx, phase, w, h);
        else if (stepKey === "gray") drawMotionGray(ctx, phase, w, h);
        else if (stepKey === "gradient") drawMotionGradient(ctx, phase, w, h);
        else if (stepKey === "second") drawMotionSecond(ctx, phase, w, h);
        else if (stepKey === "tensor") drawMotionTensor(ctx, phase, w, h);
        else if (stepKey === "response") selectedAlgorithm() === "shi-tomasi" ? drawMotionShiResponse(ctx, phase, w, h) : drawMotionHarrisResponse(ctx, phase, w, h);
        else if (stepKey === "nms") drawMotionNms(ctx, phase, w, h);
        else if (stepKey === "refine") drawMotionRefine(ctx, phase, w, h);
        else drawMotionGeneric(ctx, stepKey, phase, w, h);
    }

    function drawMotionBackground(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, "#f8fbff");
        gradient.addColorStop(1, "#eaf4ff");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(37,99,235,.08)";
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 28) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 28) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
    }

    function sampleRgbAtSource(sourceX, sourceY, fallbackGray = 0) {
        const fallback = Math.max(0, Math.min(255, Math.round(Number(fallbackGray) || 0)));
        if (!currentGray?.rgba?.length || !currentGray.width || !currentGray.height) {
            return { r: fallback, g: fallback, b: fallback, gray: fallback };
        }
        const sourceWidth = currentData?.meta?.width || currentGray.width;
        const sourceHeight = currentData?.meta?.height || currentGray.height;
        const px = Math.max(0, Math.min(currentGray.width - 1, Math.round(Number(sourceX || 0) / Math.max(1, sourceWidth - 1) * (currentGray.width - 1))));
        const py = Math.max(0, Math.min(currentGray.height - 1, Math.round(Number(sourceY || 0) / Math.max(1, sourceHeight - 1) * (currentGray.height - 1))));
        const offset = (py * currentGray.width + px) * 4;
        const r = currentGray.rgba[offset] ?? fallback;
        const g = currentGray.rgba[offset + 1] ?? fallback;
        const b = currentGray.rgba[offset + 2] ?? fallback;
        return { r, g, b, gray: 0.299 * r + 0.587 * g + 0.114 * b };
    }

    function rgbText(sample) {
        if (!sample) return "-";
        return `${Math.round(sample.r)}/${Math.round(sample.g)}/${Math.round(sample.b)}`;
    }

    function drawMotionPanel(ctx, x, y, width, height, color = "#2563eb") {
        ctx.save();
        ctx.shadowColor = "rgba(37,99,235,.12)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = `${color}4f`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, width, height, 16);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
        const gloss = ctx.createLinearGradient(x, y, x + width, y + height);
        gloss.addColorStop(0, `${color}12`);
        gloss.addColorStop(.55, "rgba(255,255,255,0)");
        gloss.addColorStop(1, "rgba(255,255,255,.4)");
        ctx.fillStyle = gloss;
        roundRect(ctx, x + 1, y + 1, width - 2, height - 2, 15);
        ctx.fill();
        ctx.restore();
    }

    function drawParticleFlow(ctx, x1, y1, x2, y2, color, phase, count = 4) {
        ctx.save();
        ctx.strokeStyle = `${color}42`;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        for (let i = 0; i < count; i++) {
            const t = (motionProgress(phase) + i / count) % 1;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            ctx.globalAlpha = .28 + .72 * Math.sin(t * Math.PI);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(x, y, 4.5 + Math.sin(t * Math.PI) * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawRgbPatch(ctx, x, y, size, matrix, sample, active, color, phase, label = "Pixel Patch") {
        const patch = centerMatrix(matrix, 5);
        const rows = patch.length || 5;
        const cols = patch[0]?.length || 5;
        const cell = size / cols;
        const centerIndex = Math.floor(rows * cols / 2);
        ctx.save();
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, x, y - 11);
        flattenMatrix(patch).forEach((value, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const px = x + col * cell;
            const py = y + row * cell;
            const isCenter = index === centerIndex;
            const isActive = index === active;
            const v = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
            const fill = isCenter
                ? `rgb(${Math.round(sample.r)},${Math.round(sample.g)},${Math.round(sample.b)})`
                : `rgb(${Math.round((v + sample.r) / 2)},${Math.round((v + sample.g) / 2)},${Math.round((v + sample.b) / 2)})`;
            ctx.fillStyle = fill;
            ctx.strokeStyle = isCenter ? "#f97316" : isActive ? color : "rgba(147,197,253,.58)";
            ctx.lineWidth = isCenter ? 2.7 : isActive ? 2 : 1;
            roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 6);
            ctx.fill();
            ctx.stroke();
        });
        const center = {
            x: x + (Math.floor(cols / 2) + .5) * cell,
            y: y + (Math.floor(rows / 2) + .5) * cell
        };
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 14 + 4 * phase.pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawGrayPatchOutput(ctx, x, y, size, matrix, active, color, label = "Gray Patch") {
        const patch = centerMatrix(matrix, 5);
        const rows = patch.length || 5;
        const cols = patch[0]?.length || 5;
        const cell = size / cols;
        const centerIndex = Math.floor(rows * cols / 2);
        ctx.save();
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, x, y - 11);
        flattenMatrix(patch).forEach((value, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const px = x + col * cell;
            const py = y + row * cell;
            const v = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
            const isCenter = index === centerIndex;
            const isActive = index === active;
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.strokeStyle = isCenter ? "#f97316" : isActive ? color : "rgba(147,197,253,.58)";
            ctx.lineWidth = isCenter ? 2.5 : isActive ? 1.8 : 1;
            roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 6);
            ctx.fill();
            ctx.stroke();
            if (isCenter) {
                ctx.fillStyle = v > 135 ? "#7c2d12" : "#fff7ed";
                ctx.font = "950 10px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(formatCompact(value), px + cell / 2, py + cell / 2 + 4);
            }
        });
        ctx.restore();
    }

    function drawChannelWeightRow(ctx, x, y, width, label, value, weight, color, progress) {
        const t = Math.max(0, Math.min(1, progress));
        const contribution = Number(value || 0) * Number(weight);
        ctx.save();
        ctx.fillStyle = `${color}18`;
        roundRect(ctx, x, y, width, 19, 9);
        ctx.fill();
        ctx.fillStyle = color;
        roundRect(ctx, x, y, Math.max(8, width * t), 19, 9);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "950 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, x + 9, y + 13);
        ctx.fillStyle = "#334155";
        ctx.font = "900 12px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(value)} × ${weight} = ${formatCompact(contribution)}`, x + width - 8, y + 13);
        ctx.restore();
    }

    function drawCornerGrayComputation(ctx, phase, data, options = {}) {
        const sample = sampleRgbAtSource(data.x, data.y, data.gray);
        const gray = sample.gray;
        const patch = data.gray_patch || [];
        const scan = Math.min(24, Math.floor(motionEase(phase, .05, .55) * 25));
        const rProgress = motionEase(phase, .18, .42, .1);
        const gProgress = motionEase(phase, .28, .56, .08);
        const bProgress = motionEase(phase, .38, .70, .06);
        const outProgress = motionEase(phase, .58, .92, .14);
        const accent = options.accent || "#2563eb";

        drawMotionPanel(ctx, 30, 36, 222, 150, accent);
        drawMotionPanel(ctx, 304, 36, 254, 150, "#06b6d4");
        drawMotionPanel(ctx, 610, 36, 210, 150, "#f97316");
        drawParticleFlow(ctx, 252, 112, 304, 112, "#06b6d4", phase, 3);
        drawParticleFlow(ctx, 558, 112, 610, 112, "#f97316", phase, 3);

        ctx.save();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 17px sans-serif";
        ctx.fillText(options.sourceTitle || "原图像素采样", 50, 65);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText(`中心 (${data.x}, ${data.y}) · RGB ${rgbText(sample)}`, 50, 84);
        drawRgbPatch(ctx, 54, 107, 74, patch, sample, scan, accent, phase, "");
        [
            ["R", sample.r, "#ef4444", 0],
            ["G", sample.g, "#22c55e", 1],
            ["B", sample.b, "#2563eb", 2]
        ].forEach(([label, value, color, index]) => {
            const x = 146 + index * 27;
            const maxH = 42;
            const barH = Math.max(4, maxH * (Number(value) / 255) * motionEase(phase, .08 + index * .07, .38 + index * .07));
            ctx.fillStyle = `${color}1d`;
            roundRect(ctx, x, 141 - maxH, 18, maxH, 7);
            ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, x, 141 - barH, 18, barH, 7);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.font = "950 11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(label, x + 9, 158);
            ctx.fillStyle = "#334155";
            ctx.font = "900 11px sans-serif";
            ctx.fillText(String(Math.round(value)), x + 9, 173);
        });
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "#0891b2";
        ctx.font = "950 17px sans-serif";
        ctx.fillText(options.mixTitle || "RGB 加权融合", 326, 65);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("按亮度感知权重写入灰度数组", 326, 84);
        drawChannelWeightRow(ctx, 326, 99, 200, "R", sample.r, "0.299", "#ef4444", rProgress);
        drawChannelWeightRow(ctx, 326, 126, 200, "G", sample.g, "0.587", "#22c55e", gProgress);
        drawChannelWeightRow(ctx, 326, 153, 200, "B", sample.b, "0.114", "#2563eb", bProgress);
        const grayValue = Math.round(gray);
        ctx.fillStyle = `rgb(${grayValue},${grayValue},${grayValue})`;
        ctx.shadowColor = "rgba(6,182,212,.45)";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(528, 72, 14 + 2 * phase.pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(528, 72, 21 + 6 * outProgress, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = .34 + outProgress * .66;
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 17px sans-serif";
        ctx.fillText(options.outputTitle || "Gray 输出", 630, 65);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText(options.outputSub || "供后续梯度 / 圆周检测读取", 630, 84);
        drawGrayPatchOutput(ctx, 632, 110, 74, patch, 12, "#f97316", "");
        ctx.fillStyle = "#fff7ed";
        ctx.strokeStyle = "rgba(249,115,22,.5)";
        ctx.lineWidth = 1.5;
        roundRect(ctx, 726, 106, 66, 52, 13);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#9a3412";
        ctx.font = "950 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Gray", 759, 126);
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 18px sans-serif";
        ctx.fillText(formatCompact(gray), 759, 148);
        ctx.restore();
    }

    function drawInputSourcePlane(ctx, x, y, width, height, patch, sample, phase) {
        const rows = 5;
        const cols = 7;
        const values = flattenMatrix(centerMatrix(patch, 5));
        const cellW = width / cols;
        const cellH = height / rows;
        const scan = Math.min(rows * cols - 1, Math.floor(motionEase(phase, .04, .48) * rows * cols));
        ctx.save();
        const plane = ctx.createLinearGradient(x, y, x + width, y + height);
        plane.addColorStop(0, "rgba(255,255,255,.36)");
        plane.addColorStop(.5, "rgba(219,234,254,.34)");
        plane.addColorStop(1, "rgba(255,255,255,.18)");
        ctx.fillStyle = plane;
        roundRect(ctx, x, y, width, height, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(96,165,250,.42)";
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, width, height, 20);
        ctx.stroke();
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col;
                const value = values[Math.min(values.length - 1, Math.abs((row - 1) * 5 + col - 1))] ?? sample.gray;
                const mixed = Math.max(40, Math.min(230, Math.round((Number(value) + sample.gray) / 2)));
                const px = x + col * cellW + cellW / 2;
                const py = y + row * cellH + cellH / 2;
                const isCenter = row === 2 && col === 3;
                const isActive = index <= scan;
                ctx.globalAlpha = isActive ? .94 : .34;
                ctx.fillStyle = isCenter
                    ? `rgb(${Math.round(sample.r)},${Math.round(sample.g)},${Math.round(sample.b)})`
                    : `rgb(${mixed},${mixed + 6},${Math.min(255, mixed + 18)})`;
                ctx.shadowColor = isCenter ? "#f97316" : "#60a5fa";
                ctx.shadowBlur = isCenter ? 12 : isActive ? 5 : 0;
                ctx.beginPath();
                ctx.arc(px, py, isCenter ? 6.5 : 4.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        const cx = x + 3.5 * cellW;
        const cy = y + 2.5 * cellH;
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.arc(cx, cy, 24 + 7 * phase.pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("原图采样平面", x + 8, y - 12);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText("点击中心像素，抽取局部 patch", x + 8, y + height + 18);
        ctx.restore();
        return { x: cx, y: cy };
    }

    function drawInputPayload(ctx, x, y, data, sample, phase) {
        const appear = motionEase(phase, .24, .62, .12);
        const rows = [
            ["x", data.x, "#2563eb"],
            ["y", data.y, "#7c3aed"],
            ["RGB", rgbText(sample), "#7c3aed"],
            ["Gray", formatCompact(sample.gray), "#f97316"]
        ];
        ctx.save();
        ctx.globalAlpha = appear;
        ctx.fillStyle = "#0891b2";
        ctx.font = "950 16px sans-serif";
        ctx.fillText("Probe payload", x, y - 18);
        rows.forEach(([label, value, color], index) => {
            const yy = y + index * 28;
            ctx.strokeStyle = `${color}80`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(x, yy + 12);
            ctx.lineTo(x + 136, yy + 12);
            ctx.stroke();
            drawParticle(ctx, x + 136 * ((motionProgress(phase) + index * .17) % 1), yy + 12, color, .72, 3.6);
            ctx.fillStyle = color;
            ctx.font = "950 12px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(label, x, yy + 5);
            ctx.fillStyle = "#334155";
            ctx.font = "950 14px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(String(value), x + 136, yy + 5);
        });
        ctx.restore();
    }

    function drawInputAnchor(ctx, x, y, patch, sample, phase) {
        const appear = motionEase(phase, .56, .92, .12);
        ctx.save();
        ctx.globalAlpha = appear;
        const pulse = 1 + .12 * phase.pulse;
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 48 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(249,115,22,.24)";
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(x, y, 58 + 6 * phase.pulse, 0, Math.PI * 2);
        ctx.stroke();
        drawGrayPatchOutput(ctx, x - 38, y - 37, 76, patch, 12, "#f97316", "");
        ctx.fillStyle = "#fff7ed";
        ctx.strokeStyle = "rgba(249,115,22,.58)";
        ctx.lineWidth = 1.6;
        roundRect(ctx, x + 54, y - 22, 116, 44, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("READY", x + 112, y - 4);
        ctx.fillStyle = "#9a3412";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("same center", x + 112, y + 14);
        ctx.fillStyle = "#ea580c";
        ctx.font = "950 16px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("统一输入锚点", x - 48, y - 74);
        ctx.fillStyle = "#64748b";
        ctx.font = "850 12px sans-serif";
        ctx.fillText(`Gray ${formatCompact(sample.gray)} 将被后续步骤复用`, x - 48, y + 76);
        ctx.restore();
    }

    function drawMotionInput(ctx, phase, w, h) {
        const data = currentProbeData();
        const patch = centerMatrix(data.gray_patch, 5);
        const sample = sampleRgbAtSource(data.x, data.y, data.gray);
        const source = drawInputSourcePlane(ctx, 48, 74, 218, 94, patch, sample, phase);
        const payloadX = 336;
        const anchor = { x: 652, y: 122 };
        drawParticleFlow(ctx, source.x + 32, source.y, payloadX - 28, 112, "#06b6d4", phase, 5);
        drawParticleFlow(ctx, payloadX + 156, 112, anchor.x - 78, anchor.y, "#f97316", phase, 5);
        drawInputPayload(ctx, payloadX, 76, data, sample, phase);
        drawInputAnchor(ctx, anchor.x, anchor.y, patch, sample, phase);
        ctx.save();
        const ghost = motionEase(phase, .20, .62);
        ctx.globalAlpha = .18 + ghost * .36;
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 2;
        const gx = source.x + (payloadX - source.x - 20) * ghost;
        roundRect(ctx, gx - 26, 88 + 14 * Math.sin(ghost * Math.PI), 52, 52, 13);
        ctx.stroke();
        ctx.fillStyle = "#334155";
        ctx.font = "950 14px sans-serif";
        ctx.fillText(`(${data.x}, ${data.y})`, 66, 58);
        ctx.restore();
    }

    function drawMotionGray(ctx, phase, w, h) {
        const data = currentProbeData();
        drawCornerGrayComputation(ctx, phase, data, {
            sourceTitle: "中心像素采样",
            mixTitle: "RGB 加权融合",
            outputTitle: "Gray 写入",
            outputSub: "结构张量从这里开始读取"
        });
    }

    function drawMotionGradient(ctx, phase, w, h) {
        const probe = currentProbeData();
        const patch = centerMatrix(probe.gray_patch, 3);
        const kernelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        const kernelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
        const p = motionProgress(phase);
        const useY = p >= .5;
        const passProgress = useY ? (p - .5) / .5 : p / .5;
        const active = Math.min(8, Math.floor(Math.max(0, Math.min(1, passProgress)) * 9));
        const ix = Number(probe.ix) || 0;
        const iy = Number(probe.iy) || 0;
        const kernel = useY ? kernelY : kernelX;
        drawMotionGrid(ctx, 34, 42, 126, patch, active, "#2563eb", "Gray Patch");
        drawMotionGrid(ctx, 235, 42, 126, kernel, active, "#f97316", useY ? "Sobel Gy" : "Sobel Gx");
        drawMotionFlow(ctx, 160, 104, 235, 104, "#60a5fa", passProgress);
        const cell = activeCellPoint(34, 42, 126, active);
        const product = (Number(flattenMatrix(patch)[active]) || 0) * (Number(flattenMatrix(kernel)[active]) || 0);
        const ixProgress = !useY ? passProgress : 1;
        const iyProgress = useY ? passProgress : 0;
        drawFlyingNumber(ctx, product, cell.x, cell.y, 424, useY ? 146 : 58, passProgress, "#f97316");
        drawAccumulator(ctx, 410, 30, "partial Ix", ix * Math.max(.1, ixProgress), ixProgress, "#2563eb");
        drawAccumulator(ctx, 410, 130, "partial Iy", iy * Math.max(.1, iyProgress), Math.max(.18, iyProgress), "#06b6d4");
        drawMotionFlow(ctx, 528, 60, 590, 60, "#2563eb", ixProgress);
        drawMotionFlow(ctx, 528, 160, 590, 160, "#06b6d4", iyProgress);
        drawValueNode(ctx, 640, 60, "final Ix", ix, "#2563eb", ixProgress);
        drawValueNode(ctx, 640, 160, "final Iy", iy, "#06b6d4", Math.max(.35, iyProgress));
        drawGradientVector(ctx, 770, 118, ix, iy, phase.pulse);
    }

    function drawMotionSecond(ctx, phase, w, h) {
        const probe = currentProbeData();
        const ix = Number(probe.ix) || 0;
        const iy = Number(probe.iy) || 0;
        const values = [
            { label: "Ix²", value: probe.ix2, x: 430, y: 46, color: "#2563eb" },
            { label: "IxIy", value: probe.ixiy, x: 430, y: 118, color: "#7c3aed" },
            { label: "Iy²", value: probe.iy2, x: 430, y: 190, color: "#06b6d4" }
        ];
        drawValueNode(ctx, 130, 82, "Ix", ix, "#2563eb", 1);
        drawValueNode(ctx, 130, 154, "Iy", iy, "#06b6d4", 1);
        const tIx2 = motionEase(phase, .10, .42);
        const tCross = motionEase(phase, .28, .68);
        const tIy2 = motionEase(phase, .46, .88);
        drawMotionFlow(ctx, 182, 82, 372, 46, "#2563eb", tIx2);
        drawMotionFlow(ctx, 182, 82, 372, 118, "#7c3aed", tCross);
        drawMotionFlow(ctx, 182, 154, 372, 118, "#7c3aed", tCross);
        drawMotionFlow(ctx, 182, 154, 372, 190, "#06b6d4", tIy2);
        drawValueNode(ctx, values[0].x, values[0].y, values[0].label, values[0].value, values[0].color, tIx2);
        drawValueNode(ctx, values[1].x, values[1].y, values[1].label, values[1].value, values[1].color, tCross);
        drawValueNode(ctx, values[2].x, values[2].y, values[2].label, values[2].value, values[2].color, tIy2);
        drawCompactFormulaBox(ctx, 585, 48, "平方能量", "Ix × Ix     Iy × Iy", "#2563eb", motionEase(phase, .36, .62, .35));
        drawCompactFormulaBox(ctx, 585, 132, "方向相关", "Ix × Iy", "#7c3aed", motionEase(phase, .54, .82, .3));
    }

    function drawMotionTensor(ctx, phase, w, h) {
        const probe = currentProbeData();
        const patches = [
            { label: "Ix² patch", patch: centerMatrix(probe.ix2_patch, 3), x: 44, color: "#2563eb", target: "Sxx", value: probe.sxx, y: 48 },
            { label: "IxIy patch", patch: centerMatrix(probe.ixiy_patch, 3), x: 164, color: "#7c3aed", target: "Sxy", value: probe.sxy, y: 118 },
            { label: "Iy² patch", patch: centerMatrix(probe.iy2_patch, 3), x: 284, color: "#06b6d4", target: "Syy", value: probe.syy, y: 188 }
        ];
        patches.forEach((item, index) => {
            const alpha = motionEase(phase, .08 + index * .12, .42 + index * .12, .35);
            drawWeightedPatch(ctx, item.x, 48, 86, item.patch, item.color, item.label, alpha);
            drawMotionFlow(ctx, item.x + 86, 92, 430, 118, item.color, alpha);
        });
        drawGaussianGlow(ctx, 430, 118, 76, phase.pulse);
        drawTinyText(ctx, "Gσ", 430, 123, "#ea580c", 15);
        patches.forEach((item, index) => {
            const t = motionEase(phase, .44 + index * .08, .76 + index * .08);
            drawMotionFlow(ctx, 500, 118, 555, item.y, item.color, t);
            drawValueNode(ctx, 610, item.y, item.target, item.value, item.color, Math.max(.25, t));
        });
        drawMatrixMotion(ctx, 722, 58, probe.M, motionEase(phase, .74, .96), "#f97316");
    }

    function drawMotionHarrisResponse(ctx, phase, w, h) {
        const probe = currentProbeData();
        const penalty = harrisK() * probe.trace * probe.trace;
        const tDet = motionEase(phase, .08, .32);
        const tTrace = motionEase(phase, .14, .38);
        const tPenalty = motionEase(phase, .34, .62);
        const tFormula = motionEase(phase, .54, .78);
        const tResult = motionEase(phase, .72, .96);
        drawMatrixMotion(ctx, 34, 54, probe.M, 1, "#2563eb");
        drawMotionFlow(ctx, 180, 88, 258, 68, "#2563eb", tDet);
        drawMotionFlow(ctx, 180, 124, 258, 148, "#7c3aed", tTrace);
        drawValueNode(ctx, 314, 68, "det(M)", probe.det, "#2563eb", tDet);
        drawValueNode(ctx, 314, 148, "trace(M)", probe.trace, "#7c3aed", tTrace);
        drawMotionFlow(ctx, 370, 148, 458, 148, "#7c3aed", tPenalty);
        drawValueNode(ctx, 514, 148, "k·trace²", penalty, "#7c3aed", Math.max(.35, tPenalty));
        drawPenaltyGauge(ctx, 402, 188, probe.det, penalty, Math.max(.12, tPenalty));
        drawMotionFlow(ctx, 370, 68, 610, 92, "#2563eb", tFormula);
        drawMotionFlow(ctx, 570, 148, 610, 124, "#7c3aed", tFormula);
        drawOperatorNode(ctx, 620, 108, "−", "#f97316", Math.max(.35, tFormula));
        drawFlipValue(ctx, 704, 108, "raw R", probe.responseRaw, "#f97316", Math.max(.2, tResult));
        drawMotionFlow(ctx, 760, 108, 810, 154, "#f97316", tResult);
        drawValueNode(ctx, 810, 178, "display R", probe.responseDisplay, "#2563eb", Math.max(.35, tResult));
        drawHeatHalo(ctx, 810, 112, phase.pulse, "#f97316");
    }

    function drawEigenEllipse(ctx, cx, cy, eig, phase) {
        const maxValue = Math.max(1, eig.l1, eig.l2);
        const major = 58;
        const minor = Math.max(18, 58 * Math.sqrt(Math.max(0.02, eig.l2 / maxValue)));
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.strokeStyle = "rgba(22,163,74,.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, major, minor, -0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - major * .78, cy + major * .22);
        ctx.lineTo(cx + major * .78, cy - major * .22);
        ctx.stroke();
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - minor * .16, cy - minor * .9);
        ctx.lineTo(cx + minor * .16, cy + minor * .9);
        ctx.stroke();
        drawParticle(ctx, cx + major * .78, cy - major * .22, "#2563eb", .78 + .2 * phase.pulse, 5.5);
        drawParticle(ctx, cx + minor * .16, cy + minor * .9, "#16a34a", .78 + .2 * phase.pulse, 5.5);
        drawTinyText(ctx, "gradient ellipse", cx, cy - minor - 20, "#166534", 15);
        drawTinyText(ctx, "short axis = λmin", cx, cy + minor + 28, "#16a34a", 15);
        ctx.restore();
    }

    function drawMotionShiResponse(ctx, phase, w, h) {
        const probe = currentProbeData();
        const eig = eigenValuesFromProbe(probe);
        const tEllipse = motionEase(phase, .08, .34);
        const tBars = motionEase(phase, .32, .62);
        const tMin = motionEase(phase, .56, .82);
        const tResult = motionEase(phase, .72, .96);
        drawMatrixMotion(ctx, 38, 54, probe.M, 1, "#16a34a");
        drawMotionFlow(ctx, 190, 118, 288, 118, "#16a34a", tEllipse);
        drawEigenEllipse(ctx, 360, 118, eig, phase);
        drawMotionFlow(ctx, 430, 94, 500, 76, "#2563eb", tBars);
        drawMotionFlow(ctx, 430, 142, 500, 156, "#16a34a", tBars);
        drawBarNode(ctx, 520, 76, "λmax", eig.l1, "#2563eb", eig.l1 / Math.max(1, eig.l1, eig.l2), Math.max(.25, tBars));
        drawBarNode(ctx, 520, 156, "λmin", eig.l2, "#16a34a", eig.l2 / Math.max(1, eig.l1, eig.l2), Math.max(.25, tBars));
        drawMinSelector(ctx, 664, 156, Math.max(.12, tMin));
        drawMotionFlow(ctx, 652, 156, 705, 126, "#16a34a", tMin);
        drawFlipValue(ctx, 760, 118, "R = λmin", eig.min, "#16a34a", Math.max(.35, tResult));
    }

    function drawMotionNms(ctx, phase, w, h) {
        const probe = currentProbeData();
        const nms = nmsProbeDecision(probe);
        const decisionColor = nms.kept ? "#f97316" : "#94a3b8";
        const tSelect = motionEase(phase, .10, .34, .2);
        const tCompare = motionEase(phase, .34, .68, .2);
        const tDecision = motionEase(phase, .66, .96, .25);
        drawNmsResponseField(ctx, 46, 42, 270, 138, phase, nms);
        drawMotionFlow(ctx, 318, 110, 392, 110, "#60a5fa", tSelect);
        drawValueNode(ctx, 450, 84, "raw R", nms.currentR, decisionColor, 1);
        drawValueNode(ctx, 450, 154, "display R", nms.displayR, "#2563eb", 1);
        drawNmsRadius(ctx, 450, 118, 62 + 10 * phase.pulse, decisionColor, Math.max(.25, tSelect));
        drawMotionFlow(ctx, 508, 84, 590, 74, "#2563eb", tCompare);
        drawMotionFlow(ctx, 508, 154, 590, 154, "#7c3aed", tCompare);
        drawValueNode(ctx, 646, 74, "threshold", nms.threshold, "#2563eb", 1);
        drawValueNode(ctx, 646, 154, "max in r", nms.localMax, "#7c3aed", Math.max(.35, tCompare));
        drawSuppressRelation(ctx, 646, 154, 724, 118, nms, Math.max(.1, tCompare));
        drawNmsDecisionCard(ctx, 780, 118, nms, tDecision);
    }

    function drawMotionRefine(ctx, phase, w, h) {
        const probe = currentProbeData();
        const dx = probe.dx || 0;
        const dy = probe.dy || 0;
        const start = { x: 330, y: 118 };
        const scale = 95;
        const t = motionEase(phase, .44, .82, .15);
        const end = { x: start.x + dx * scale * t, y: start.y + dy * scale * t };
        drawRefineSurface(ctx, 62, 44, 170, 148, probe, phase);
        drawMotionFlow(ctx, 238, 118, start.x - 28, start.y, "#60a5fa", motionEase(phase, .16, .42, .25));
        drawSubpixelStage(ctx, start, end, dx, dy, t, phase);
        drawMotionFlow(ctx, 390, 118, 500, 118, "#7c3aed", motionEase(phase, .48, .76, .2));
        drawValueNode(ctx, 555, 72, "dx", dx.toFixed(3), "#7c3aed", 1);
        drawValueNode(ctx, 555, 148, "dy", dy.toFixed(3), "#7c3aed", 1);
        drawMotionFlow(ctx, 610, 110, 690, 118, "#f97316", motionEase(phase, .70, .94, .2));
        drawFlipValue(ctx, 750, 118, "offset", Math.hypot(dx, dy).toFixed(3), "#f97316", motionEase(phase, .76, .96, .45));
    }

    function drawNmsResponseField(ctx, x, y, width, height, phase, nms) {
        const cols = 13;
        const rows = 6;
        const cellW = width / cols;
        const cellH = height / rows;
        ctx.save();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Response candidates", x, y - 12);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const px = x + col * cellW + cellW / 2;
                const py = y + row * cellH + cellH / 2;
                const wave = 0.45 + 0.55 * Math.sin((row * 2.1 + col * 1.3 + phase.pulse * 4));
                const strong = (row === 2 && col === 7) || (row === 3 && col === 6);
                const current = row === 2 && col === 6;
                const suppressProgress = motionEase(phase, .52, .84);
                const suppressed = suppressProgress > .35 && !strong && !current && (row + col) % 3 === 0;
                const color = current ? "#f97316" : strong ? "#7c3aed" : "#60a5fa";
                const alpha = suppressed ? Math.max(.12, .48 * (1 - suppressProgress)) : strong ? .82 : .22 + .35 * wave;
                drawParticle(ctx, px, py, color, alpha, current ? 6.5 : strong ? 5.5 : 3.2);
            }
        }
        const cx = x + 6.5 * cellW;
        const cy = y + 2.5 * cellH;
        drawNmsRadius(ctx, cx, cy, 46 + 8 * phase.pulse, nms.kept ? "#f97316" : "#94a3b8", motionEase(phase, .16, .42, .2));
        drawLabelPill(ctx, cx - 34, cy + 32, "current", "#ea580c");
        drawLabelPill(ctx, x + 7.5 * cellW + 18, y + 2.5 * cellH - 34, "stronger", "#7c3aed");
        ctx.restore();
    }

    function drawNmsDecisionCard(ctx, cx, cy, nms, alpha) {
        const color = nms.kept ? "#f97316" : "#94a3b8";
        ctx.save();
        ctx.globalAlpha = Math.max(.2, Math.min(1, alpha));
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = `${color}55`;
        ctx.shadowBlur = 16;
        roundRect(ctx, cx - 68, cy - 54, 136, 108, 18);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = "950 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(nms.kept ? "KEEP" : "SUPPRESS", cx, cy - 18);
        ctx.fillStyle = "#64748b";
        ctx.font = "900 11px sans-serif";
        ctx.fillText(nms.aboveThreshold ? "R > threshold" : "R <= threshold", cx, cy + 8);
        ctx.fillText(nms.localMaximum ? "local max" : "neighbor wins", cx, cy + 28);
        ctx.restore();
    }

    function drawPenaltyGauge(ctx, x, y, detValue, penaltyValue, alpha) {
        const det = Math.abs(Number(detValue) || 0);
        const penalty = Math.abs(Number(penaltyValue) || 0);
        const total = Math.max(1, det, penalty);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.strokeStyle = "rgba(147,197,253,.72)";
        ctx.lineWidth = 1.6;
        roundRect(ctx, x, y, 210, 32, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2563eb";
        roundRect(ctx, x + 10, y + 8, 82 * det / total, 6, 4);
        ctx.fill();
        ctx.fillStyle = "#7c3aed";
        roundRect(ctx, x + 116, y + 8, 82 * penalty / total, 6, 4);
        ctx.fill();
        ctx.fillStyle = "#52657f";
        ctx.font = "850 9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("det", x + 10, y + 24);
        ctx.fillText("k·trace² penalty", x + 116, y + 24);
        ctx.restore();
    }

    function drawMinSelector(ctx, x, y, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#16a34a";
        ctx.fillStyle = "#16a34a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 26, y);
        ctx.lineTo(x - 4, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 10, y - 6);
        ctx.lineTo(x - 10, y + 6);
        ctx.closePath();
        ctx.fill();
        drawLabelPill(ctx, x + 48, y, "min selected", "#16a34a");
        ctx.restore();
    }

    function drawSuppressRelation(ctx, x1, y1, x2, y2, nms, alpha) {
        const color = nms.kept ? "#f97316" : "#7c3aed";
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = nms.kept ? 2.2 : 3.2;
        ctx.setLineDash(nms.kept ? [4, 6] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo((x1 + x2) / 2, y1 - 32, (x1 + x2) / 2, y2 + 34, x2, y2);
        ctx.stroke();
        drawParticle(ctx, x1, y1, color, .9, nms.kept ? 4.5 : 6);
        drawParticle(ctx, x2, y2, color, .7, nms.kept ? 3.5 : 5);
        drawLabelPill(ctx, (x1 + x2) / 2, y2 + 48, nms.kept ? "current is local max" : "stronger neighbor suppresses", color);
        ctx.restore();
    }

    function drawLabelPill(ctx, x, y, text, color) {
        ctx.save();
        ctx.font = "950 13px sans-serif";
        ctx.textAlign = "center";
        const width = Math.max(62, ctx.measureText(text).width + 22);
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = `${color}99`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x - width / 2, y - 14, width, 28, 14);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillText(text, x, y + 5);
        ctx.restore();
    }

    function drawRefineSurface(ctx, x, y, width, height, probe, phase) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, width, height, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("3×3 response surface", x + 12, y + 20);
        const cx = x + width / 2;
        const cy = y + height / 2 + 10;
        [56, 40, 25].forEach((radius, index) => {
            ctx.strokeStyle = index === 0 ? "rgba(96,165,250,.35)" : index === 1 ? "rgba(124,58,237,.38)" : "rgba(249,115,22,.5)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, radius, radius * 0.62, -0.35, 0, Math.PI * 2);
            ctx.stroke();
        });
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 58);
        gradient.addColorStop(0, `rgba(249,115,22,${.36 + .16 * phase.pulse})`);
        gradient.addColorStop(.45, "rgba(96,165,250,.22)");
        gradient.addColorStop(1, "rgba(96,165,250,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, 58, 0, Math.PI * 2);
        ctx.fill();
        drawTinyText(ctx, "fit paraboloid", cx, y + height - 16, "#7c3aed", 12);
        ctx.restore();
    }

    function drawSubpixelStage(ctx, start, end, dx, dy, t, phase) {
        ctx.save();
        drawNmsRadius(ctx, start.x, start.y, 46, "#dbeafe", .65);
        drawCrossGlyph(ctx, start.x, start.y, "#f97316", 17, 1);
        drawTinyText(ctx, "integer", start.x, start.y - 28, "#ea580c", 12);
        drawMotionFlow(ctx, start.x, start.y, end.x, end.y, "#7c3aed", t);
        drawRingGlyph(ctx, end.x, end.y, "#06b6d4", 18 + 3 * phase.pulse, motionEase(phase, .50, .82, .35));
        drawCrossGlyph(ctx, end.x, end.y, "#06b6d4", 10, motionEase(phase, .58, .88, .25));
        drawTinyText(ctx, "sub-pixel", end.x + 42, end.y + 5, "#0891b2", 12);
        ctx.fillStyle = "#64748b";
        ctx.font = "900 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Δ=(${dx.toFixed(3)}, ${dy.toFixed(3)})`, start.x, start.y + 58);
        ctx.restore();
    }

    function drawMotionFast(ctx, stepKey, phase, w, h) {
        const point = fastProbePoint();
        const info = fastArcInfo(point);
        if (stepKey === "input") {
            drawMotionFastInput(ctx, point, phase, w, h);
            return;
        }
        if (stepKey === "gray") {
            drawMotionFastGray(ctx, point, phase, w, h);
            return;
        }
        if (stepKey === "circle") {
            drawMotionFastCircle(ctx, point, info, phase, w, h);
            return;
        }
        if (stepKey === "threshold") {
            drawMotionFastThreshold(ctx, point, info, phase, w, h);
            return;
        }
        if (stepKey === "nms") {
            drawMotionFastNms(ctx, point, phase, w, h);
            return;
        }
        if (stepKey === "corners") {
            drawMotionFastCorners(ctx, point, phase, w, h);
            return;
        }
        drawMotionFastThreshold(ctx, point, info, phase, w, h);
    }

    function drawMotionFastInput(ctx, point, phase, w, h) {
        const px = 86;
        const py = 34;
        const imageW = 300;
        const imageH = 168;
        const p = motionProgress(phase);
        const scanX = px + 24 + (imageW - 48) * p;
        const scanY = py + 34 + (p > .5 ? 84 : 30) + 8 * Math.sin(p * Math.PI * 2);
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = "#bfdbfe";
        ctx.lineWidth = 2;
        roundRect(ctx, px, py, imageW, imageH, 18);
        ctx.fill();
        ctx.stroke();
        const grid = 18;
        for (let y = py + 10; y < py + imageH - 10; y += grid) {
            for (let x = px + 10; x < px + imageW - 10; x += grid) {
                const tone = 215 + 28 * Math.sin((x + y) * 0.04);
                ctx.fillStyle = `rgb(${tone}, ${Math.min(255, tone + 10)}, 255)`;
                ctx.fillRect(x, y, grid - 4, grid - 4);
            }
        }
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 3;
        ctx.strokeRect(scanX - 18, scanY - 18, 36, 36);
        drawParticle(ctx, scanX, scanY, "#facc15", .9, 6);
        drawMotionFlow(ctx, scanX + 28, scanY, 472, 86, "#60a5fa", motionEase(phase, .18, .62, .18));
        drawValueNode(ctx, 520, 86, "Probe", point ? `(${point.x},${point.y})` : "-", "#2563eb", 1);
        drawValueNode(ctx, 670, 148, "FAST", "r=3", "#f97316", motionEase(phase, .70, .96, .35));
        ctx.fillStyle = "#31527f";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("输入图像上滑动候选中心，局部窗口进入 FAST 圆周检测。", px, 222);
        ctx.restore();
    }

    function drawMotionFastGray(ctx, point, phase, w, h) {
        const patch = fastGrayPatch(point, 2);
        const center = Number(fastCenterValue(point)) || 0;
        drawCornerGrayComputation(ctx, phase, {
            x: point?.x ?? Math.floor((currentGray?.width || 1) / 2),
            y: point?.y ?? Math.floor((currentGray?.height || 1) / 2),
            gray: center,
            gray_patch: patch.gray
        }, {
            accent: "#eab308",
            sourceTitle: "FAST 中心采样",
            mixTitle: "FAST 灰度输入",
            outputTitle: "Circle Test 输入",
            outputSub: "中心 P 与 16 个圆周点同尺度比较"
        });
    }

    function drawMotionFastCircle(ctx, point, info, phase, w, h) {
        const cx = 270;
        const cy = 118;
        const radius = 72;
        const scanProgress = motionEase(phase, .12, .78);
        const scanIndex = Math.min(15, Math.floor(scanProgress * 16));
        drawValueNode(ctx, 76, 118, "center P", fastCenterValue(point), "#2563eb", 1);
        drawMotionFlow(ctx, 128, 118, cx - radius, cy, "#60a5fa", motionEase(phase, .10, .36, .25));
        drawNmsRadius(ctx, cx, cy, radius, "#2563eb", .24 + .55 * motionEase(phase, .14, .44));
        drawRadiusArrow(ctx, cx, cy, radius, "#f97316", motionEase(phase, .18, .48, .35));
        V.fastCircle.forEach((offset, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / 16;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            const state = info.states[index] || "similar";
            const color = state === "bright" ? "#facc15" : state === "dark" ? "#7c3aed" : "#cbd5e1";
            const visited = index <= scanIndex || scanProgress > .96;
            const appear = visited ? 1 : .22;
            drawParticle(ctx, x, y, color, appear, index === scanIndex ? 9 : info.active.has(index) ? 8 : 6);
            if (visited) drawTinyText(ctx, index, x, y + 4, "#0f172a", 9);
        });
        drawScanArc(ctx, cx, cy, radius + 17, scanIndex, "#f97316", motionEase(phase, .24, .70, .35));
        drawMotionFlow(ctx, cx + radius + 24, cy, 520, 118, "#60a5fa", motionEase(phase, .58, .84, .2));
        drawSampleStrip(ctx, 540, 72, scanIndex, phase);
        drawFlipValue(ctx, 724, 138, "radius", "3 px", "#f97316", motionEase(phase, .74, .96, .35));
    }

    function drawFastChannelMixer(ctx, x, y, center, phase) {
        const channels = [
            { label: "R", weight: "0.299", color: "#ef4444", value: center },
            { label: "G", weight: "0.587", color: "#16a34a", value: center },
            { label: "B", weight: "0.114", color: "#2563eb", value: center }
        ];
        ctx.save();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Center pixel channels", x, y - 14);
        channels.forEach((item, index) => {
            const yy = y + index * 48;
            drawChannelPill(ctx, x + 42, yy + 20, item.label, item.value, item.color);
            drawMotionFlow(ctx, x + 86, yy + 20, x + 178, y + 68, item.color, motionEase(phase, .14 + index * .06, .46 + index * .06, .2));
            ctx.fillStyle = item.color;
            ctx.font = "950 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`× ${item.weight}`, x + 132, yy + 12);
        });
        drawOperatorNode(ctx, x + 190, y + 68, "+", "#f97316", motionEase(phase, .36, .58, .35));
        ctx.restore();
    }

    function drawChannelPill(ctx, cx, cy, label, value, color) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, cx - 36, cy - 18, 72, 36, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, cx - 18, cy + 5);
        ctx.fillStyle = "#0f172a";
        ctx.font = "900 12px sans-serif";
        ctx.fillText(formatCompact(value), cx + 14, cy + 5);
        ctx.restore();
    }

    function drawRadiusArrow(ctx, cx, cy, radius, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.stroke();
        drawParticle(ctx, cx + radius, cy, color, alpha, 4.5);
        drawTinyText(ctx, "r = 3", cx + radius / 2, cy - 12, color, 14);
        ctx.restore();
    }

    function drawScanArc(ctx, cx, cy, radius, index, color, alpha) {
        const start = -Math.PI / 2;
        const end = start + (index + 1) / 16 * Math.PI * 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, end);
        ctx.stroke();
        ctx.restore();
    }

    function drawSampleStrip(ctx, x, y, scanIndex, phase) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = "#bfdbfe";
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, 150, 72, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("16 samples", x + 75, y + 22);
        for (let i = 0; i < 16; i++) {
            const px = x + 15 + (i % 8) * 17;
            const py = y + 42 + Math.floor(i / 8) * 17;
            drawParticle(ctx, px, py, i <= scanIndex ? "#2563eb" : "#cbd5e1", i <= scanIndex ? .9 : .35, i === scanIndex ? 4.5 + phase.pulse * 1.5 : 3.2);
        }
        ctx.restore();
    }

    function drawMotionFastThreshold(ctx, point, info, phase, w, h) {
        const cx = 250;
        const cy = 118;
        const radius = 66;
        const center = Number(fastCenterValue(point)) || 0;
        const threshold = fastOptions().threshold;
        const contiguous = fastOptions().contiguous;
        drawValueNode(ctx, 74, 64, "bright if >", center + threshold, "#ca8a04", 1);
        drawValueNode(ctx, 74, 170, "dark if <", center - threshold, "#7c3aed", 1);
        drawMotionFlow(ctx, 126, 64, cx - radius, cy - 20, "#ca8a04", motionEase(phase, .10, .34, .2));
        drawMotionFlow(ctx, 126, 170, cx - radius, cy + 20, "#7c3aed", motionEase(phase, .14, .38, .2));
        V.fastCircle.forEach((offset, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / 16;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            const state = info.states[index] || "similar";
            const color = state === "bright" ? "#facc15" : state === "dark" ? "#7c3aed" : "#cbd5e1";
            const reveal = motionEase(phase, .22 + index * .018, .70 + index * .018, .22);
            drawParticle(ctx, x, y, color, reveal, info.active.has(index) ? 8 : 5.5);
            if (reveal > .7) drawTinyText(ctx, state === "bright" ? "+" : state === "dark" ? "-" : "=", x, y + 3, "#0f172a", 8);
        });
        drawValueNode(ctx, cx, cy, "C", center, "#2563eb", 1);
        drawFastArc(ctx, cx, cy, radius + 16, info, motionEase(phase, .46, .76, .25));
        drawMotionFlow(ctx, cx + radius + 18, cy, 446, 118, info.pass ? "#facc15" : "#94a3b8", motionEase(phase, .58, .84, .2));
        drawFastStateStrip(ctx, 470, 52, info, contiguous, phase);
        drawFlipValue(ctx, 710, 84, "best run", Math.max(info.bright, info.dark), info.pass ? "#facc15" : "#94a3b8", motionEase(phase, .62, .86, .35));
        drawFlipValue(ctx, 710, 156, `FAST-${contiguous}`, info.pass ? "PASS" : "FAIL", info.pass ? "#facc15" : "#94a3b8", motionEase(phase, .76, .96, .3));
    }

    function drawMotionFastCorners(ctx, point, phase, w, h) {
        const candidates = (currentFast?.candidates || []).slice(0, 90);
        const kept = currentFast?.corners || [];
        const keptKeys = new Set(kept.map(item => `${item.x},${item.y}`));
        const selected = nearestPointWithDistance(point?.x || 0, point?.y || 0, kept);
        drawFastCornerLayers(ctx, 44, 38, candidates, keptKeys, phase);
        drawMotionFlow(ctx, 318, 118, 408, 118, "#60a5fa", motionEase(phase, .20, .46, .2));
        drawCornerFunnel(ctx, 460, 118, phase);
        drawMotionFlow(ctx, 512, 118, 600, 118, "#facc15", motionEase(phase, .52, .78, .2));
        drawDiamondGlyph(ctx, 650, 118, "#facc15", 26 + 4 * phase.pulse, motionEase(phase, .58, .86, .35));
        drawTinyText(ctx, "final corner", 650, 162, "#ca8a04", 15);
        drawFlipValue(ctx, 760, 76, "candidates", currentFast?.candidates?.length || candidates.length, "#2563eb", 1);
        drawFlipValue(ctx, 760, 158, "final kept", kept.length, "#facc15", motionEase(phase, .72, .96, .35));
    }

    function drawFastStateStrip(ctx, x, y, info, contiguous, phase) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = "#bfdbfe";
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, 168, 126, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("circle classification", x + 84, y + 22);
        const active = info.active || new Set();
        for (let i = 0; i < 16; i++) {
            const state = info.states?.[i] || "similar";
            const color = state === "bright" ? "#facc15" : state === "dark" ? "#7c3aed" : "#cbd5e1";
            const px = x + 18 + (i % 8) * 19;
            const py = y + 48 + Math.floor(i / 8) * 24;
            const isActive = active.has(i);
            drawParticle(ctx, px, py, color, .9, isActive ? 5.8 : 4);
            drawTinyText(ctx, state === "bright" ? "+" : state === "dark" ? "-" : "=", px, py + 19, color, 12);
        }
        const windowWidth = Math.min(142, contiguous / 16 * 142);
        ctx.strokeStyle = info.pass ? "#facc15" : "#94a3b8";
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 13, y + 100, windowWidth, 12, 6);
        ctx.stroke();
        ctx.fillStyle = info.pass ? "#ca8a04" : "#64748b";
        ctx.font = "950 12px sans-serif";
        ctx.fillText(`${contiguous} contiguous required`, x + 84, y + 94);
        ctx.restore();
    }

    function drawFastCornerLayers(ctx, x, y, candidates, keptKeys, phase) {
        ctx.save();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("candidate layer → kept layer", x, y - 12);
        candidates.forEach((item, index) => {
            const col = index % 14;
            const row = Math.floor(index / 14);
            const px = x + 12 + col * 20;
            const py = y + 14 + row * 22;
            const isKept = keptKeys.has(`${item.x},${item.y}`);
            const filterProgress = motionEase(phase, .28, .76);
            const dim = filterProgress > .35 && !isKept;
            drawParticle(ctx, px, py, isKept ? "#facc15" : "#60a5fa", dim ? .10 : isKept ? .9 : .28, isKept ? 5.2 : 3);
            if (isKept && filterProgress > .62) {
                drawDiamondGlyph(ctx, px, py, "#facc15", 6 + phase.pulse * 1.8, .8);
            }
        });
        ctx.restore();
    }

    function drawCornerFunnel(ctx, cx, cy, phase) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = "#93c5fd";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx - 40, cy - 46);
        ctx.lineTo(cx + 40, cy - 46);
        ctx.lineTo(cx + 18, cy + 8);
        ctx.lineTo(cx + 18, cy + 44);
        ctx.lineTo(cx - 18, cy + 44);
        ctx.lineTo(cx - 18, cy + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const glow = ctx.createLinearGradient(cx, cy - 44, cx, cy + 44);
        glow.addColorStop(0, "rgba(96,165,250,.05)");
        glow.addColorStop(1, `rgba(250,204,21,${.22 + .18 * phase.pulse})`);
        ctx.fillStyle = glow;
        ctx.fill();
        drawTinyText(ctx, "NMS filter", cx, cy - 12, "#2563eb", 14);
        drawTinyText(ctx, "keep local max", cx, cy + 20, "#ca8a04", 13);
        ctx.restore();
    }

    function fastGrayPatch(point, radius = 2) {
        const size = radius * 2 + 1;
        const fallback = {
            rgb: Array.from({ length: size }, () => Array(size).fill(0)),
            gray: Array.from({ length: size }, () => Array(size).fill(0))
        };
        if (!point || !currentGray) return fallback;
        const gray = [];
        const rgb = [];
        for (let yy = point.y - radius; yy <= point.y + radius; yy++) {
            const grayRow = [];
            const rgbRow = [];
            for (let xx = point.x - radius; xx <= point.x + radius; xx++) {
                const safeX = Math.max(0, Math.min(currentGray.width - 1, xx));
                const safeY = Math.max(0, Math.min(currentGray.height - 1, yy));
                const value = Math.round(currentGray.gray[safeY * currentGray.width + safeX] || 0);
                grayRow.push(value);
                rgbRow.push(value);
            }
            gray.push(grayRow);
            rgb.push(rgbRow);
        }
        return { rgb, gray };
    }

    function drawDiamondGlyph(ctx, x, y, color, size, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.fillStyle = `${color}33`;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function drawMotionFastNms(ctx, point, phase, w, h) {
        const candidates = (currentFast?.candidates || []).slice(0, 110);
        const kept = currentFast?.corners || [];
        const keptKeys = new Set(kept.map(item => `${item.x},${item.y}`));
        const selectedKept = nearestPointWithDistance(point?.x || 0, point?.y || 0, kept);
        const keep = selectedKept.distance <= Math.max(4, fastOptions().nmsRadius);
        const field = drawFastNmsField(ctx, 42, 38, 350, 160, candidates, keptKeys, point, selectedKept.point, phase);
        drawMotionFlow(ctx, 398, 118, 470, 118, keep ? "#facc15" : "#94a3b8", motionEase(phase, .18, .44, .2));
        drawValueNode(ctx, 526, 78, "current score", point?.response || 0, keep ? "#facc15" : "#94a3b8", 1);
        drawValueNode(ctx, 526, 158, "winner score", selectedKept.point?.response || 0, "#facc15", motionEase(phase, .42, .68, .35));
        drawMotionFlow(ctx, 584, 118, 660, 118, keep ? "#facc15" : "#7c3aed", motionEase(phase, .52, .78, .2));
        drawFastNmsDecisionCard(ctx, 742, 118, keep, candidates.length, kept.length, motionEase(phase, .72, .96, .35));
    }

    function drawMotionGeneric(ctx, stepKey, phase, w, h) {
        const probe = selectedAlgorithm() === "fast" ? fastProbePoint() : probeForCurrentSelection();
        drawLocalPatchLens(ctx, 70, 42, "#2563eb", phase.pulse);
        drawValueNode(ctx, 390, 92, harrisSteps().find(item => item.key === stepKey)?.en || stepKey, `(${probe?.x ?? "-"}, ${probe?.y ?? "-"})`, "#2563eb", 1);
        drawMotionFlow(ctx, 210, 118, 350, 118, "#60a5fa", phase.local);
        drawFlipValue(ctx, 610, 118, "ready", "probe", "#f97316", phase.local);
    }

    function drawFastNmsField(ctx, x, y, width, height, candidates, keptKeys, currentPoint, winnerPoint, phase) {
        const maxScore = Math.max(1, ...candidates.map(item => Number(item.response) || 0));
        ctx.save();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("FAST candidates ranked by score", x, y - 12);
        candidates.forEach((item, index) => {
            const col = index % 16;
            const row = Math.floor(index / 16);
            const px = x + 12 + col * 20;
            const py = y + 14 + row * 22;
            const isKept = keptKeys.has(`${item.x},${item.y}`);
            const isCurrent = currentPoint && item.x === currentPoint.x && item.y === currentPoint.y;
            const isWinner = winnerPoint && item.x === winnerPoint.x && item.y === winnerPoint.y;
            const scoreRatio = Math.sqrt((Number(item.response) || 0) / maxScore);
            const suppressProgress = motionEase(phase, .48, .86);
            const suppressed = suppressProgress > .30 && !isKept;
            const color = isCurrent ? "#7c3aed" : isWinner || isKept ? "#facc15" : "#60a5fa";
            const alpha = suppressed ? Math.max(.12, (.25 + scoreRatio * .7) * (1 - suppressProgress)) : .25 + scoreRatio * .7;
            drawParticle(ctx, px, py, color, alpha, isCurrent ? 7 : isWinner ? 6.5 : 2.5 + scoreRatio * 3.5);
            if (isCurrent) {
                drawNmsRadius(ctx, px, py, 38 + 8 * phase.pulse, "#7c3aed", motionEase(phase, .20, .50, .25));
                drawLabelPill(ctx, px, py + 44, "current", "#7c3aed");
            }
            if (isWinner && !isCurrent) drawLabelPill(ctx, px + 34, py - 22, "winner", "#ca8a04");
        });
        ctx.restore();
    }

    function drawFastNmsDecisionCard(ctx, cx, cy, keep, candidateCountValue, keptCountValue, alpha) {
        const color = keep ? "#facc15" : "#7c3aed";
        ctx.save();
        ctx.globalAlpha = Math.max(.2, Math.min(1, alpha));
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = `${color}66`;
        ctx.shadowBlur = 16;
        roundRect(ctx, cx - 76, cy - 62, 152, 124, 18);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = "950 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(keep ? "KEEP" : "SUPPRESS", cx, cy - 26);
        ctx.fillStyle = "#31527f";
        ctx.font = "950 13px sans-serif";
        ctx.fillText(`${candidateCountValue} candidates`, cx, cy + 4);
        ctx.fillText(`${keptCountValue} kept after NMS`, cx, cy + 28);
        ctx.restore();
    }

    function renderMotionMetrics(stepKey) {
        const box = V.$("cornerMotionMetrics");
        if (!box) return;
        const rows = motionMetricRows(stepKey);
        box.innerHTML = rows.slice(0, 5).map((row, index) => `
            <div class="corner-motion-metric ${row.tone ? `is-${row.tone}` : ""}">
                <span>${row.label}</span>
                <strong class="${isSemanticMetricValue(row.value) ? "is-badge" : ""}" style="animation-delay:${index * 45}ms">${formatMetricValue(row.value)}</strong>
            </div>
        `).join("");
    }

    function formatMetricValue(value) {
        if (typeof value === "number") return formatCompact(value);
        if (value === null || value === undefined || value === "") return "-";
        const text = String(value);
        if (/^-?\d+(\.\d+)?$/.test(text)) return formatCompact(Number(text));
        return text.length > 24 ? `${text.slice(0, 22)}…` : text;
    }

    function isSemanticMetricValue(value) {
        return /^(KEEP|SUPPRESS|PASS|FAIL|YES|NO|VALID|INVALID|keep|suppress|diamond|ready|READY|λmin selected)$/i.test(String(value || ""));
    }

    function motionMetricRows(stepKey) {
        if (selectedAlgorithm() === "fast") {
            const point = fastProbePoint();
            const info = fastArcInfo(point);
            if (stepKey === "input") {
                const sample = sampleRgbAtSource(point?.x || 0, point?.y || 0, fastCenterValue(point));
                return [
                    { label: "探针坐标", value: point ? `(${point.x}, ${point.y})` : "-" },
                    { label: "图像尺寸", value: currentGray ? `${currentGray.width}×${currentGray.height}` : "-" },
                    { label: "中心 RGB", value: rgbText(sample), tone: "purple" },
                    { label: "中心 Gray", value: formatNumber(sample.gray), tone: "orange" },
                    { label: "窗口半径", value: "r=3", tone: "orange" }
                ];
            }
            if (stepKey === "gray") {
                const sample = sampleRgbAtSource(point?.x || 0, point?.y || 0, fastCenterValue(point));
                return [
                    { label: "中心 RGB", value: rgbText(sample), tone: "purple" },
                    { label: "Gray", value: formatNumber(sample.gray), tone: "orange" },
                    { label: "灰度公式", value: "0.299/0.587/0.114" },
                    { label: "Patch", value: "5×5" },
                    { label: "FAST 输入", value: "Circle Test", tone: "yellow" }
                ];
            }
            if (stepKey === "circle") {
                return [
                    { label: "圆周点数", value: 16 },
                    { label: "半径", value: "3 px", tone: "orange" },
                    { label: "中心 P", value: fastCenterValue(point) }
                ];
            }
            if (stepKey === "threshold") {
                return [
                    { label: "longest bright", value: info.bright, tone: "yellow" },
                    { label: "longest dark", value: info.dark, tone: "purple" },
                    { label: "FAST score", value: info.score, tone: "orange" },
                    { label: `FAST-${fastOptions().contiguous}`, value: info.pass ? "PASS" : "FAIL", tone: info.pass ? "yellow" : "purple" }
                ];
            }
            if (stepKey === "nms") {
                const kept = nearestPointWithDistance(point?.x || 0, point?.y || 0, currentFast?.corners || []);
                return [
                    { label: "Candidates", value: currentFast?.candidates?.length || 0 },
                    { label: "Kept", value: currentFast?.corners?.length || 0, tone: "yellow" },
                    { label: "当前点", value: kept.distance <= fastOptions().nmsRadius ? "KEEP" : "SUPPRESS", tone: kept.distance <= fastOptions().nmsRadius ? "yellow" : "purple" },
                    { label: "NMS radius", value: fastOptions().nmsRadius }
                ];
            }
            if (stepKey === "corners") {
                const kept = nearestPointWithDistance(point?.x || 0, point?.y || 0, currentFast?.corners || []);
                return [
                    { label: "最终角点", value: currentFast?.corners?.length || 0, tone: "yellow" },
                    { label: "候选点", value: currentFast?.candidates?.length || 0 },
                    { label: "最近角点", value: kept.point ? `(${kept.point.x}, ${kept.point.y})` : "-" },
                    { label: "标记", value: "DIAMOND", tone: "orange" }
                ];
            }
            return [
                { label: "中心 P", value: fastCenterValue(point) },
                { label: "longest bright", value: info.bright, tone: "yellow" },
                { label: "longest dark", value: info.dark, tone: "purple" },
                { label: "FAST score", value: info.score, tone: "orange" },
                { label: `FAST-${fastOptions().contiguous}`, value: info.pass ? "PASS" : "FAIL", tone: info.pass ? "yellow" : "purple" }
            ];
        }
        const probe = currentProbeData();
        const ix = Number(probe.ix) || 0;
        const iy = Number(probe.iy) || 0;
        if (stepKey === "input") {
            const sample = sampleRgbAtSource(probe.x, probe.y, probe.gray);
            return [
                { label: "坐标", value: `(${probe.x}, ${probe.y})` },
                { label: "图像尺寸", value: currentGray ? `${currentGray.width}×${currentGray.height}` : "-" },
                { label: "中心 RGB", value: rgbText(sample), tone: "purple" },
                { label: "中心 Gray", value: formatNumber(sample.gray), tone: "orange" },
                { label: "探针包", value: "READY", tone: "orange" }
            ];
        }
        if (stepKey === "gray") {
            const sample = sampleRgbAtSource(probe.x, probe.y, probe.gray);
            return [
                { label: "中心 RGB", value: rgbText(sample), tone: "purple" },
                { label: "Gray", value: formatNumber(sample.gray), tone: "orange" },
                { label: "权重", value: "0.299/0.587/0.114" },
                { label: "Patch", value: "5×5" },
                { label: "输出", value: "Gray array", tone: "orange" }
            ];
        }
        if (stepKey === "gradient") return [
            { label: "Ix", value: formatNumber(ix) },
            { label: "Iy", value: formatNumber(iy) },
            { label: "Magnitude", value: formatNumber(Math.hypot(ix, iy)), tone: "orange" },
            { label: "Direction", value: `${(Math.atan2(iy, ix) * 180 / Math.PI).toFixed(1)}°`, tone: "purple" }
        ];
        if (stepKey === "second") return [
            { label: "Ix² = Ix×Ix", value: formatNumber(probe.ix2) },
            { label: "Iy² = Iy×Iy", value: formatNumber(probe.iy2) },
            { label: "IxIy", value: formatNumber(probe.ixiy), tone: "purple" }
        ];
        if (stepKey === "tensor") return [
            { label: "Sxx", value: formatNumber(probe.sxx) },
            { label: "Syy", value: formatNumber(probe.syy) },
            { label: "Sxy", value: formatNumber(probe.sxy), tone: "purple" },
            { label: "det(M)", value: formatNumber(probe.det), tone: "orange" },
            { label: "trace(M)", value: formatNumber(probe.trace) }
        ];
        if (stepKey === "response" && selectedAlgorithm() === "shi-tomasi") {
            const eig = eigenValuesFromProbe(probe);
            return [
                { label: "λ1", value: formatNumber(eig.l1) },
                { label: "λ2", value: formatNumber(eig.l2) },
                { label: "λmin", value: formatNumber(eig.min), tone: "green" },
                { label: "selection", value: "λmin selected", tone: "green" }
            ];
        }
        if (stepKey === "response") return [
            { label: "det(M)", value: formatNumber(probe.det) },
            { label: "trace(M)", value: formatNumber(probe.trace) },
            { label: "k", value: harrisK() },
            { label: "raw R", value: formatNumber(probe.responseRaw), tone: "orange" },
            { label: "display R", value: formatNumber(probe.responseDisplay) }
        ];
        if (stepKey === "nms") {
            const nms = nmsProbeDecision(probe);
            return [
                { label: "raw R", value: formatNumber(nms.currentR) },
                { label: "display R", value: formatNumber(nms.displayR) },
                { label: "threshold", value: formatNumber(nms.threshold) },
                { label: "neighbor max", value: formatNumber(nms.localMax) },
                { label: "NMS", value: nms.kept ? "KEEP" : "SUPPRESS", tone: nms.kept ? "orange" : "purple" },
            ];
        }
        if (stepKey === "refine") {
            return [
                { label: "dx", value: formatNumber(probe.dx), tone: "purple" },
                { label: "dy", value: formatNumber(probe.dy), tone: "purple" },
                { label: "offset", value: formatNumber(probe.offset), tone: "orange" },
                { label: "valid", value: probe.refineValid ? "YES" : "NO", tone: probe.refineValid ? "orange" : "purple" }
            ];
        }
        return [
            { label: "坐标", value: `(${probe.x}, ${probe.y})` },
            { label: "Gray", value: formatNumber(probe.gray) },
            { label: "状态", value: "READY", tone: "orange" }
        ];
    }

    function centerMatrix(matrix, size = 3) {
        if (!Array.isArray(matrix) || !matrix.length) return Array.from({ length: size }, () => Array(size).fill(0));
        const cy = Math.floor(matrix.length / 2);
        const cx = Math.floor((matrix[cy] || []).length / 2);
        const half = Math.floor(size / 2);
        return Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, col) => matrix[cy - half + row]?.[cx - half + col] ?? 0)
        );
    }

    function flattenMatrix(matrix) {
        return (matrix || []).reduce((values, row) => values.concat(row || []), []);
    }

    function activeCellPoint(x, y, size, index) {
        const cell = size / 3;
        return { x: x + (index % 3 + .5) * cell, y: y + (Math.floor(index / 3) + .5) * cell };
    }

    function drawMotionGrid(ctx, x, y, size, matrix, active, color, label) {
        const rows = matrix.length || 3;
        const cols = matrix[0]?.length || 3;
        const cellW = size / cols;
        const cellH = size / rows;
        ctx.save();
        ctx.fillStyle = "#31527f";
        ctx.font = "900 11px sans-serif";
        ctx.fillText(label, x, y - 10);
        flattenMatrix(matrix).forEach((value, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const px = x + col * cellW;
            const py = y + row * cellH;
            const isActive = index === active;
            ctx.fillStyle = isActive ? `${color}33` : "rgba(255,255,255,.72)";
            ctx.strokeStyle = isActive ? color : "rgba(147,197,253,.55)";
            ctx.lineWidth = isActive ? 2.5 : 1;
            roundRect(ctx, px + 2, py + 2, cellW - 4, cellH - 4, 7);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = isActive ? color : "#52657f";
            ctx.font = `${isActive ? 900 : 750} 10px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(formatCompact(value), px + cellW / 2, py + cellH / 2 + 3);
        });
        ctx.restore();
    }

    function drawCompactPatch(ctx, x, y, size, matrix, active, color, label) {
        const rows = matrix.length || 3;
        const cols = matrix[0]?.length || 3;
        const cellW = size / cols;
        const cellH = size / rows;
        const centerIndex = Math.floor(rows * cols / 2);
        ctx.save();
        ctx.fillStyle = "#31527f";
        ctx.font = "950 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, x, y - 10);
        flattenMatrix(matrix).forEach((value, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const px = x + col * cellW;
            const py = y + row * cellH;
            const isCenter = index === centerIndex;
            const isActive = index === active;
            ctx.fillStyle = isCenter ? "rgba(249,115,22,.18)" : isActive ? `${color}24` : "rgba(255,255,255,.62)";
            ctx.strokeStyle = isCenter ? "#f97316" : isActive ? color : "rgba(147,197,253,.45)";
            ctx.lineWidth = isCenter ? 2.4 : isActive ? 1.8 : 1;
            roundRect(ctx, px + 3, py + 3, cellW - 6, cellH - 6, 8);
            ctx.fill();
            ctx.stroke();
            if (isCenter || isActive) {
                ctx.fillStyle = isCenter ? "#ea580c" : color;
                ctx.font = "950 12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(formatCompact(value), px + cellW / 2, py + cellH / 2 + 3);
            }
        });
        ctx.fillStyle = "#64748b";
        ctx.font = "900 12px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("中心值 + 扫描值", x, y + size + 16);
        ctx.restore();
    }

    function drawWeightedPatch(ctx, x, y, size, matrix, color, label, alpha = 1) {
        const rows = matrix.length || 3;
        const cols = matrix[0]?.length || 3;
        const values = flattenMatrix(matrix).map(value => Math.abs(Number(value) || 0));
        const maxValue = Math.max(1e-9, ...values);
        const cellW = size / cols;
        const cellH = size / rows;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#31527f";
        ctx.font = "950 13px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, x, y - 10);
        values.forEach((value, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const px = x + col * cellW;
            const py = y + row * cellH;
            const intensity = Math.sqrt(value / maxValue);
            ctx.fillStyle = mixColor("#ffffff", color, 0.12 + intensity * 0.5);
            ctx.strokeStyle = index === 4 ? "#f97316" : "rgba(147,197,253,.5)";
            ctx.lineWidth = index === 4 ? 2.2 : 1;
            roundRect(ctx, px + 2, py + 2, cellW - 4, cellH - 4, 7);
            ctx.fill();
            ctx.stroke();
        });
        const center = Number(matrix?.[1]?.[1]) || 0;
        ctx.fillStyle = "#0f172a";
        ctx.font = "950 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatCompact(center), x + size / 2, y + size / 2 + 4);
        ctx.restore();
    }

    function mixColor(from, to, amount) {
        const parse = (hex) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
        const a = parse(from);
        const b = parse(to);
        const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * amount));
        return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
    }

    function drawMotionFlow(ctx, x1, y1, x2, y2, color, progress) {
        const t = Math.max(0, Math.min(1, progress));
        ctx.save();
        ctx.strokeStyle = `${color}44`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2, y2);
        ctx.stroke();
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * easeInOutCubic(t);
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 13);
        glow.addColorStop(0, color);
        glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawFlyingNumber(ctx, value, x1, y1, x2, y2, progress, color) {
        const t = easeInOutCubic(Math.max(0, Math.min(1, progress)));
        drawMotionFlow(ctx, x1, y1, x2, y2, color, t);
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "950 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatCompact(value), x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - 8);
        ctx.restore();
    }

    function drawAccumulator(ctx, x, y, label, value, progress, color) {
        ctx.save();
        ctx.globalAlpha = .35 + .65 * Math.max(0, Math.min(1, progress));
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, 118, 60, 13);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.font = "900 13px sans-serif";
        ctx.fillText(label, x + 12, y + 20);
        ctx.fillStyle = color;
        ctx.font = "950 20px sans-serif";
        ctx.fillText(formatCompact(Number(value) || 0), x + 12, y + 46);
        ctx.restore();
    }

    function drawGradientVector(ctx, cx, cy, ix, iy, pulse) {
        const magnitude = Math.hypot(ix, iy);
        const scale = magnitude ? Math.min(62, 28 + Math.log10(magnitude + 1) * 12) : 24;
        const angle = Math.atan2(iy, ix);
        ctx.save();
        ctx.strokeStyle = "rgba(37,99,235,.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * scale, cy + Math.sin(angle) * scale);
        ctx.stroke();
        drawParticle(ctx, cx + Math.cos(angle) * scale, cy + Math.sin(angle) * scale, "#7c3aed", .8 + .2 * pulse, 7);
        ctx.fillStyle = "#52657f";
        ctx.font = "950 13px sans-serif";
        ctx.fillText(`|∇I| ${formatCompact(magnitude)}`, cx - 34, cy + 92);
        ctx.restore();
    }

    function drawValueNode(ctx, cx, cy, label, value, color, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = Math.max(.12, Math.min(1, alpha));
        ctx.shadowColor = `${color}55`;
        ctx.shadowBlur = 14;
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, cx - 52, cy - 27, 104, 54, 14);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#64748b";
        ctx.font = "900 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, cx, cy - 8);
        ctx.fillStyle = color;
        ctx.font = "950 16px sans-serif";
        ctx.fillText(formatCompact(value), cx, cy + 13);
        ctx.restore();
    }

    function drawMotionFormulaText(ctx, x, y, formula, subtitle, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.font = "950 18px Georgia, serif";
        ctx.fillText(formula, x, y);
        ctx.fillStyle = "#64748b";
        ctx.font = "800 10px sans-serif";
        ctx.fillText(subtitle, x, y + 20);
        ctx.restore();
    }

    function drawGaussianGlow(ctx, cx, cy, radius, pulse) {
        const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, radius);
        glow.addColorStop(0, `rgba(249,115,22,${.48 + .15 * pulse})`);
        glow.addColorStop(.35, "rgba(96,165,250,.28)");
        glow.addColorStop(1, "rgba(96,165,250,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(249,115,22,.65)";
        [0.35, 0.62, 0.9].forEach(scale => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
            ctx.stroke();
        });
        drawTinyText(ctx, "Gσ", cx, cy + 4, "#ea580c", 14);
    }

    function drawMatrixMotion(ctx, x, y, matrix, alpha, color) {
        ctx.save();
        ctx.globalAlpha = Math.max(.2, Math.min(1, alpha));
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 12, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + 112);
        ctx.lineTo(x + 12, y + 112);
        ctx.moveTo(x + 132, y);
        ctx.lineTo(x + 144, y);
        ctx.lineTo(x + 144, y + 112);
        ctx.lineTo(x + 132, y + 112);
        ctx.stroke();
        const values = [matrix?.[0]?.[0], matrix?.[0]?.[1], matrix?.[1]?.[0], matrix?.[1]?.[1]];
        values.forEach((value, index) => {
            drawTinyText(ctx, formatCompact(value), x + 45 + (index % 2) * 62, y + 35 + Math.floor(index / 2) * 52, color, 11);
        });
        ctx.restore();
    }

    function drawFormulaBox(ctx, x, y, text, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, 245, 55, 14);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "950 18px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(text, x + 122, y + 34);
        ctx.restore();
    }

    function drawCompactFormulaBox(ctx, x, y, title, formula, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "rgba(37,99,235,.16)";
        ctx.shadowBlur = 18;
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, 220, 64, 14);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = "950 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(title, x + 110, y + 24);
        ctx.fillStyle = "#31527f";
        ctx.font = "900 14px sans-serif";
        ctx.fillText(formula, x + 110, y + 47);
        ctx.restore();
    }

    function drawFlipValue(ctx, cx, cy, label, value, color, progress) {
        const scaleY = .25 + .75 * Math.max(0, Math.min(1, progress));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, scaleY);
        ctx.fillStyle = color;
        ctx.shadowColor = `${color}88`;
        ctx.shadowBlur = 18;
        roundRect(ctx, -70, -37, 140, 74, 16);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,.78)";
        ctx.font = "900 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, 0, -11);
        ctx.fillStyle = "#fff";
        ctx.font = "950 20px sans-serif";
        ctx.fillText(formatCompact(value), 0, 15);
        ctx.restore();
    }

    function drawHeatHalo(ctx, cx, cy, pulse, color) {
        const radius = 35 + 25 * pulse;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        glow.addColorStop(0, `${color}99`);
        glow.addColorStop(1, `${color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBarNode(ctx, x, y, label, value, color, ratio, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = "#dbeafe";
        roundRect(ctx, x, y - 23, 132, 46, 11);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `${color}33`;
        roundRect(ctx, x + 6, y + 10, 120 * Math.max(.05, ratio), 7, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.font = "950 13px sans-serif";
        ctx.fillText(`${label}  ${formatCompact(value)}`, x + 10, y - 3);
        ctx.restore();
    }

    function drawOperatorNode(ctx, x, y, operator, color, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = `${color}66`;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = "950 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(operator, x, y + 8);
        ctx.restore();
    }

    function drawParticle(ctx, x, y, color, alpha = 1, radius = 4) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawNmsRadius(ctx, cx, cy, radius, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawLocalPatchLens(ctx, x, y, color, pulse) {
        const size = 138;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, size, size, 18);
        ctx.fill();
        ctx.stroke();
        const glow = ctx.createRadialGradient(x + size / 2, y + size / 2, 4, x + size / 2, y + size / 2, size / 2);
        glow.addColorStop(0, `rgba(37,99,235,${.25 + .12 * pulse})`);
        glow.addColorStop(1, "rgba(37,99,235,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, size, size);
        ctx.restore();
    }

    function drawCrossGlyph(ctx, x, y, color, size, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - size, y);
        ctx.lineTo(x + size, y);
        ctx.moveTo(x, y - size);
        ctx.lineTo(x, y + size);
        ctx.stroke();
        ctx.restore();
    }

    function drawRingGlyph(ctx, x, y, color, radius, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawTinyText(ctx, value, x, y, color, size = 10) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `950 ${Math.max(14, size)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(String(value), x, y);
        ctx.restore();
    }

    function formatCompact(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return String(value ?? "-");
        if (Math.abs(number) >= 1000000) return number.toExponential(2);
        if (Math.abs(number) >= 1000) return number.toFixed(0);
        if (Math.abs(number) >= 10) return number.toFixed(1);
        return number.toFixed(2);
    }

    function eigenValuesFromProbe(probe) {
        const a = Number(probe.M?.[0]?.[0]) || 0;
        const b = Number(probe.M?.[0]?.[1]) || 0;
        const d = Number(probe.M?.[1]?.[1]) || 0;
        const trace = a + d;
        const delta = Math.sqrt(Math.max(0, (a - d) * (a - d) + 4 * b * b));
        const l1 = (trace + delta) / 2;
        const l2 = (trace - delta) / 2;
        return { l1, l2, min: Math.min(l1, l2) };
    }

    function fastArcInfo(point) {
        if (!point || !currentGray) return { states: [], active: new Set(), bright: 0, dark: 0, score: 0, pass: false };
        const center = Number(fastCenterValue(point)) || 0;
        const threshold = fastOptions().threshold;
        const states = V.fastCircle.map(([dx, dy]) => {
            const value = Number(currentGray.gray[(point.y + dy) * currentGray.width + point.x + dx]) || 0;
            if (value > center + threshold) return "bright";
            if (value < center - threshold) return "dark";
            return "similar";
        });
        const longest = target => {
            let best = 0;
            let start = -1;
            let run = 0;
            for (let index = 0; index < 32; index++) {
                if (states[index % 16] === target) {
                    run++;
                    if (run > best && run <= 16) {
                        best = run;
                        start = index - run + 1;
                    }
                } else {
                    run = 0;
                }
            }
            return { length: Math.min(16, best), start: start < 0 ? -1 : start % 16 };
        };
        const bright = longest("bright");
        const dark = longest("dark");
        const winner = bright.length >= dark.length ? bright : dark;
        const active = new Set();
        if (winner.start >= 0) {
            for (let index = 0; index < winner.length; index++) active.add((winner.start + index) % 16);
        }
        return {
            states,
            active,
            bright: bright.length,
            dark: dark.length,
            score: formatCompact(point.response || Math.max(bright.length, dark.length)),
            pass: Math.max(bright.length, dark.length) >= fastOptions().contiguous,
            winner
        };
    }

    function drawFastArc(ctx, cx, cy, radius, info, alpha) {
        if (!info.winner || info.winner.start < 0 || !info.winner.length) return;
        const start = -Math.PI / 2 + info.winner.start * Math.PI * 2 / 16;
        const end = start + info.winner.length * Math.PI * 2 / 16;
        const brightWins = info.bright >= info.dark;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = brightWins ? "#facc15" : "#7c3aed";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 18;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, end);
        ctx.stroke();
        ctx.restore();
    }

    function currentProbeData() {
        if (selectedAlgorithm() === "fast") return null;
        const raw = harrisRawData();
        const fallback = currentData?.probe || {};
        const x = Math.max(0, Math.min((raw?.width || currentData?.meta?.width || 1) - 1, Math.round(selectedProbe?.x ?? fallback.x ?? 0)));
        const y = Math.max(0, Math.min((raw?.height || currentData?.meta?.height || 1) - 1, Math.round(selectedProbe?.y ?? fallback.y ?? 0)));
        if (!raw) {
            return {
                x,
                y,
                gray: centerOf(fallback.gray_patch),
                ix: Number(centerOf(fallback.ix_patch)) || 0,
                iy: Number(centerOf(fallback.iy_patch)) || 0,
                ix2: Number(centerOf(fallback.ix2_patch)) || 0,
                iy2: Number(centerOf(fallback.iy2_patch)) || 0,
                ixiy: Number(centerOf(fallback.ixiy_patch)) || 0,
                sxx: Number(fallback.M?.[0]?.[0]) || 0,
                syy: Number(fallback.M?.[1]?.[1]) || 0,
                sxy: Number(fallback.M?.[0]?.[1]) || 0,
                det: Number(fallback.det) || 0,
                trace: Number(fallback.trace) || 0,
                responseRaw: Number(fallback.r) || 0,
                responseDisplay: packedValueAtSource(currentResponsePacked(), x, y),
                thresholdRaw: 0,
                isCandidate: false,
                nmsMaxRaw: 0,
                nmsResult: false,
                dx: 0,
                dy: 0,
                offset: 0,
                refineValid: false,
                gray_patch: fallback.gray_patch || [],
                ix_patch: fallback.ix_patch || [],
                iy_patch: fallback.iy_patch || [],
                ix2_patch: fallback.ix2_patch || [],
                iy2_patch: fallback.iy2_patch || [],
                ixiy_patch: fallback.ixiy_patch || [],
                gaussian_weight: fallback.gaussian_weight || [],
                M: fallback.M || [[0, 0], [0, 0]]
            };
        }

        const index = y * raw.width + x;
        const ix = raw.ix[index] || 0;
        const iy = raw.iy[index] || 0;
        const ix2 = ix * ix;
        const iy2 = iy * iy;
        const ixiy = ix * iy;
        const sxx = raw.sxx[index] || 0;
        const syy = raw.syy[index] || 0;
        const sxy = raw.sxy[index] || 0;
        const det = sxx * syy - sxy * sxy;
        const trace = sxx + syy;
        const responseRaw = raw.response[index] || 0;
        const nms = rawNmsDecision(raw, x, y);
        const refine = rawRefineAt(raw, x, y);
        return {
            x,
            y,
            gray: raw.gray[index] || 0,
            ix,
            iy,
            ix2,
            iy2,
            ixiy,
            sxx,
            syy,
            sxy,
            det,
            trace,
            responseRaw,
            responseDisplay: packedValueAtSource(currentResponsePacked(), x, y),
            thresholdRaw: raw.thresholdRaw,
            isCandidate: responseRaw > raw.thresholdRaw,
            nmsMaxRaw: nms.localMaxRaw,
            nmsResult: nms.kept,
            nmsReason: nms.reason,
            nmsSuppressor: nms.suppressor,
            dx: refine.dx,
            dy: refine.dy,
            offset: refine.offset,
            refineValid: refine.valid,
            gray_patch: rawPatch(raw.gray, raw.width, raw.height, x, y, 2),
            ix_patch: rawPatch(raw.ix, raw.width, raw.height, x, y, 2),
            iy_patch: rawPatch(raw.iy, raw.width, raw.height, x, y, 2),
            ix2_patch: rawPatchDerived(raw, x, y, 2, (item) => item.ix * item.ix),
            iy2_patch: rawPatchDerived(raw, x, y, 2, (item) => item.iy * item.iy),
            ixiy_patch: rawPatchDerived(raw, x, y, 2, (item) => item.ix * item.iy),
            gaussian_weight: gaussianKernel2d(3, harrisSigma()).map(row => row.map(value => Number(value.toFixed(4)))),
            M: [[sxx, sxy], [sxy, syy]]
        };
    }

    function harrisRawData() {
        if (!currentGray?.gray?.length) return null;
        const key = [
            imageFingerprint(),
            selectedAlgorithm(),
            harrisSigma(),
            harrisK(),
            responseThresholdRatio(),
            nmsRadiusForCurrentAlgorithm(),
            maxCornersForCurrentAlgorithm()
        ].join(":");
        if (rawHarrisCache.key === key && rawHarrisCache.data) return rawHarrisCache.data;
        const width = currentGray.width;
        const height = currentGray.height;
        const gray = new Float32Array(currentGray.gray.length);
        for (let i = 0; i < currentGray.gray.length; i++) {
            gray[i] = Math.max(0, Math.min(255, Math.round(currentGray.gray[i] || 0)));
        }
        const ix = convolve3x3(gray, width, height, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]);
        const iy = convolve3x3(gray, width, height, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]);
        const ix2 = new Float32Array(width * height);
        const iy2 = new Float32Array(width * height);
        const ixiy = new Float32Array(width * height);
        for (let i = 0; i < ix.length; i++) {
            ix2[i] = ix[i] * ix[i];
            iy2[i] = iy[i] * iy[i];
            ixiy[i] = ix[i] * iy[i];
        }
        const sigma = harrisSigma();
        const sxx = gaussianBlur3x3(ix2, width, height, sigma);
        const syy = gaussianBlur3x3(iy2, width, height, sigma);
        const sxy = gaussianBlur3x3(ixiy, width, height, sigma);
        const det = new Float32Array(width * height);
        const trace = new Float32Array(width * height);
        const response = new Float32Array(width * height);
        const useShi = selectedAlgorithm() === "shi-tomasi";
        const k = harrisK();
        let responseMax = 0;
        for (let i = 0; i < response.length; i++) {
            det[i] = sxx[i] * syy[i] - sxy[i] * sxy[i];
            trace[i] = sxx[i] + syy[i];
            let value;
            if (useShi) {
                value = trace[i] - Math.sqrt(Math.max(0, trace[i] * trace[i] - 4 * det[i]));
            } else {
                value = det[i] - k * trace[i] * trace[i];
                if (value < 0) value = 0;
            }
            response[i] = value;
            if (value > responseMax) responseMax = value;
        }
        const thresholdRaw = responseMax * responseThresholdRatio();
        const nms = buildRawNms(response, width, height, thresholdRaw, nmsRadiusForCurrentAlgorithm(), maxCornersForCurrentAlgorithm());
        const data = { width, height, gray, ix, iy, ix2, iy2, ixiy, sxx, syy, sxy, det, trace, response, responseMax, thresholdRaw, ...nms };
        rawHarrisCache = { key, data };
        return data;
    }

    function harrisSigma() {
        return Number(document.querySelector('[name="harris_sigma"]')?.value) || 1.2;
    }

    function harrisK() {
        return Number(document.querySelector('[name="harris_k"]')?.value) || 0.04;
    }

    function maxCornersForCurrentAlgorithm() {
        return Number(document.querySelector('[name="max_corners"]')?.value) || 500;
    }

    function convolve3x3(source, width, height, kernel) {
        const out = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    const sy = Math.max(0, Math.min(height - 1, y + ky));
                    for (let kx = -1; kx <= 1; kx++) {
                        const sx = Math.max(0, Math.min(width - 1, x + kx));
                        sum += source[sy * width + sx] * kernel[ky + 1][kx + 1];
                    }
                }
                out[y * width + x] = sum;
            }
        }
        return out;
    }

    function gaussianKernel2d(size, sigma) {
        const half = Math.floor(size / 2);
        const kernel = [];
        let total = 0;
        for (let y = -half; y <= half; y++) {
            const row = [];
            for (let x = -half; x <= half; x++) {
                const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
                row.push(value);
                total += value;
            }
            kernel.push(row);
        }
        return kernel.map(row => row.map(value => value / total));
    }

    function gaussianBlur3x3(source, width, height, sigma) {
        return convolve3x3(source, width, height, gaussianKernel2d(3, sigma));
    }

    function buildRawNms(response, width, height, thresholdRaw, radius, maxCorners) {
        const candidates = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = response[y * width + x];
                if (value > thresholdRaw) candidates.push({ response: value, x, y });
            }
        }
        candidates.sort((a, b) => b.response - a.response);
        const occupied = new Uint8Array(width * height);
        const kept = [];
        const keptKeys = new Set();
        for (const candidate of candidates) {
            let blocked = false;
            for (let yy = Math.max(0, candidate.y - radius); yy <= Math.min(height - 1, candidate.y + radius) && !blocked; yy++) {
                for (let xx = Math.max(0, candidate.x - radius); xx <= Math.min(width - 1, candidate.x + radius); xx++) {
                    if (occupied[yy * width + xx]) {
                        blocked = true;
                        break;
                    }
                }
            }
            if (blocked) continue;
            kept.push(candidate);
            keptKeys.add(`${candidate.x},${candidate.y}`);
            occupied[candidate.y * width + candidate.x] = 1;
            if (kept.length >= maxCorners) break;
        }
        return { candidatesRaw: candidates, keptRaw: kept, keptKeysRaw: keptKeys };
    }

    function rawNmsDecision(raw, x, y) {
        const radius = nmsRadiusForCurrentAlgorithm();
        const current = raw.response[y * raw.width + x] || 0;
        let localMaxRaw = current;
        let localMaxPoint = { x, y };
        for (let yy = Math.max(0, y - radius); yy <= Math.min(raw.height - 1, y + radius); yy++) {
            for (let xx = Math.max(0, x - radius); xx <= Math.min(raw.width - 1, x + radius); xx++) {
                const value = raw.response[yy * raw.width + xx] || 0;
                if (value > localMaxRaw) {
                    localMaxRaw = value;
                    localMaxPoint = { x: xx, y: yy };
                }
            }
        }
        const aboveThreshold = current > raw.thresholdRaw;
        const localMaximum = current >= localMaxRaw - 1e-6;
        const kept = raw.keptKeysRaw.has(`${x},${y}`);
        let reason = "raw R 超过阈值且进入 NMS 保留集合";
        if (!aboveThreshold) reason = "raw R 低于阈值";
        else if (!localMaximum) reason = "邻域内存在更大 raw R";
        else if (!kept) reason = "候选点被更早保留点的 NMS 半径覆盖";
        return {
            current,
            threshold: raw.thresholdRaw,
            localMaxRaw,
            localMaxPoint,
            aboveThreshold,
            localMaximum,
            kept,
            suppressor: kept ? null : localMaxPoint,
            reason
        };
    }

    function rawRefineAt(raw, x, y) {
        if (selectedAlgorithm() !== "harris" || x < 1 || y < 1 || x >= raw.width - 1 || y >= raw.height - 1) {
            return { dx: 0, dy: 0, offset: 0, valid: false };
        }
        const at = (xx, yy) => raw.response[yy * raw.width + xx] || 0;
        const center = at(x, y);
        const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
        const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
        const hxx = at(x + 1, y) - 2 * center + at(x - 1, y);
        const hyy = at(x, y + 1) - 2 * center + at(x, y - 1);
        const hxy = (at(x + 1, y + 1) - at(x + 1, y - 1) - at(x - 1, y + 1) + at(x - 1, y - 1)) / 4;
        const determinant = hxx * hyy - hxy * hxy;
        if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return { dx: 0, dy: 0, offset: 0, valid: false };
        const dx = -(hyy * gx - hxy * gy) / determinant;
        const dy = -(-hxy * gx + hxx * gy) / determinant;
        const valid = Number.isFinite(dx) && Number.isFinite(dy) && Math.abs(dx) <= 1.5 && Math.abs(dy) <= 1.5;
        return { dx: valid ? dx : 0, dy: valid ? dy : 0, offset: valid ? Math.hypot(dx, dy) : 0, valid };
    }

    function rawPatch(source, width, height, x, y, radius = 2) {
        const rows = [];
        for (let yy = y - radius; yy <= y + radius; yy++) {
            const row = [];
            for (let xx = x - radius; xx <= x + radius; xx++) {
                const safeX = Math.max(0, Math.min(width - 1, xx));
                const safeY = Math.max(0, Math.min(height - 1, yy));
                row.push(source[safeY * width + safeX] || 0);
            }
            rows.push(row);
        }
        return rows;
    }

    function rawPatchDerived(raw, x, y, radius, fn) {
        const rows = [];
        for (let yy = y - radius; yy <= y + radius; yy++) {
            const row = [];
            for (let xx = x - radius; xx <= x + radius; xx++) {
                const safeX = Math.max(0, Math.min(raw.width - 1, xx));
                const safeY = Math.max(0, Math.min(raw.height - 1, yy));
                const index = safeY * raw.width + safeX;
                row.push(fn({ ix: raw.ix[index] || 0, iy: raw.iy[index] || 0 }));
            }
            rows.push(row);
        }
        return rows;
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

    function packedValueAtSource(packed, sourceX, sourceY) {
        if (!packed?.values?.length) return 0;
        const px = Math.max(0, Math.min(packed.width - 1, Math.round(sourceX / Math.max(1, packed.source_width || currentData.meta.width) * packed.width)));
        const py = Math.max(0, Math.min(packed.height - 1, Math.round(sourceY / Math.max(1, packed.source_height || currentData.meta.height) * packed.height)));
        return Number(packed.values[py * packed.width + px]) || 0;
    }

    function nmsProbeDecision(probe) {
        const data = probe?.responseRaw !== undefined ? probe : currentProbeData();
        const x = Math.round(data?.x ?? 0);
        const y = Math.round(data?.y ?? 0);
        const currentR = Number(data?.responseRaw) || 0;
        const displayR = Number(data?.responseDisplay) || 0;
        const threshold = Number(data?.thresholdRaw) || 0;
        const localMax = Number(data?.nmsMaxRaw) || currentR;
        const aboveThreshold = Boolean(data?.isCandidate);
        const localMaximum = currentR >= localMax - 1e-6;
        const kept = Boolean(data?.nmsResult);
        const reason = data?.nmsReason || (kept ? "raw R 通过 NMS" : "raw R 未进入保留集合");
        return {
            x,
            y,
            currentR,
            displayR,
            threshold,
            localMax,
            localMaxPoint: data?.nmsSuppressor || { x, y },
            aboveThreshold,
            localMaximum,
            kept,
            suppressor: data?.nmsSuppressor || null,
            reason
        };
    }

    function nmsRadiusForCurrentAlgorithm() {
        return Number(selectedAlgorithm() === "shi-tomasi"
            ? document.querySelector('[name="shi_nms_radius"]')?.value
            : document.querySelector('[name="nms_radius"]')?.value) || 8;
    }

    function responseThresholdRatio() {
        return Number(selectedAlgorithm() === "shi-tomasi"
            ? document.querySelector('[name="shi_threshold"]')?.value
            : document.querySelector('[name="harris_threshold"]')?.value) || (selectedAlgorithm() === "shi-tomasi" ? 0.08 : 0.01);
    }

    function responseThresholdValue(packed) {
        const values = packed?.values?.map(value => Number(value) || 0) || [];
        const maxValue = values.length ? Math.max(...values) : 0;
        return maxValue * responseThresholdRatio();
    }

    function nearestPointWithDistance(x, y, points) {
        let best = { point: null, distance: Infinity };
        (points || []).forEach(point => {
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance < best.distance) best = { point, distance };
        });
        return best;
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
        const data = currentProbeData();
        if (!data) return currentData?.probe || {};
        return {
            ...data,
            det: data.det,
            trace: data.trace,
            r: data.responseRaw
        };
    }

    function fastCenterValue(point) {
        if (!point || !currentGray) return "-";
        return Math.round(currentGray.gray[point.y * currentGray.width + point.x]);
    }

    function fastProbePoint() {
        if (!currentGray) return null;
        const fallback = currentFast?.corners?.[0] || currentFast?.candidates?.[0] || {
            x: Math.floor(currentGray.width / 2),
            y: Math.floor(currentGray.height / 2),
            response: 0,
            start: -1,
            polarity: "none"
        };
        if (!selectedProbe) return fallback;
        const candidates = currentFast?.candidates || [];
        const nearest = nearestPointWithDistance(selectedProbe.x, selectedProbe.y, candidates);
        if (nearest.point && nearest.distance <= Math.max(6, fastOptions().nmsRadius * 1.5)) return nearest.point;
        return {
            x: Math.max(3, Math.min(currentGray.width - 4, Math.round(selectedProbe.x))),
            y: Math.max(3, Math.min(currentGray.height - 4, Math.round(selectedProbe.y))),
            response: 0,
            start: -1,
            polarity: "none"
        };
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
        if (!canvas || !selectedProbe) return;
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

    async function renderPreviousStepOverlay(currentStepDef, original) {
        const previous = previousStep();
        const overlay = V.$("cornerPreviousCanvas");
        const control = V.$("cornerCompareControl");
        const divider = V.$("cornerCompareDivider");
        const enabled = cornerDisplayMode() === "compare" && previous && overlay && currentStepDef;
        if (!enabled) {
            if (overlay) overlay.hidden = true;
            if (control) control.hidden = true;
            if (divider) divider.hidden = true;
            return;
        }
        const temp = document.createElement("canvas");
        if (selectedAlgorithm() === "fast") await drawFastStep(temp, previous.key, original);
        else await drawHarrisStep(temp, previous.key, original);
        overlay.width = Math.max(1, V.$("cornerStepCanvas").width);
        overlay.height = Math.max(1, V.$("cornerStepCanvas").height);
        const ctx = overlay.getContext("2d");
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, overlay.width, overlay.height);
        drawImageCover(ctx, temp, 0, 0, overlay.width, overlay.height);
        overlay.hidden = false;
        control.hidden = false;
        V.$("cornerPreviousLabel").textContent = previous.en;
        V.$("cornerCurrentLabel").textContent = currentStepDef.en;
        syncCompareOverlayLayout();
        updateCompareClip();
    }

    function syncCompareOverlayLayout() {
        const frame = V.$("cornerMainFrame");
        const canvas = V.$("cornerStepCanvas");
        const overlay = V.$("cornerPreviousCanvas");
        if (!frame || !canvas || !overlay || overlay.hidden) return;
        const frameBox = frame.getBoundingClientRect();
        const canvasBox = canvas.getBoundingClientRect();
        overlay.style.left = `${canvasBox.left - frameBox.left}px`;
        overlay.style.top = `${canvasBox.top - frameBox.top}px`;
        overlay.style.width = `${canvasBox.width}px`;
        overlay.style.height = `${canvasBox.height}px`;
        updateCompareClip();
    }

    function updateCompareClip() {
        const overlay = V.$("cornerPreviousCanvas");
        const divider = V.$("cornerCompareDivider");
        const frame = V.$("cornerMainFrame");
        const canvas = V.$("cornerStepCanvas");
        const range = Number(V.$("cornerCompareRange")?.value || 50);
        if (!overlay || !divider || !frame || !canvas || overlay.hidden) return;
        const ratio = Math.max(0, Math.min(100, range));
        overlay.style.clipPath = `inset(0 ${100 - ratio}% 0 0)`;
        const frameBox = frame.getBoundingClientRect();
        const canvasBox = canvas.getBoundingClientRect();
        divider.hidden = false;
        divider.style.left = `${canvasBox.left - frameBox.left + canvasBox.width * ratio / 100}px`;
    }

    function handleProbePick(event) {
        if (!currentData) return;
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
        if (selectedAlgorithm() === "fast") {
            selectedProbe = mapped;
            const selected = fastProbePoint();
            selectedProbe = selected ? { x: selected.x, y: selected.y } : mapped;
        } else {
            selectedProbe = currentStepKey() === "nms" ? nearestNmsProbePoint(mapped) : mapped;
        }
        drawCurrentStep({ animate: false });
    }

    function nearestNmsProbePoint(point) {
        if (!point || selectedAlgorithm() === "fast") return point;
        const kept = pointsForAlgorithm();
        const candidates = [
            ...(kept || []).map(item => ({ ...item, kept: true })),
            ...responseCandidatesForNms(kept, 5000).map(item => ({ ...item, kept: false }))
        ];
        let best = { point: null, distance: Infinity };
        candidates.forEach(item => {
            const distance = Math.hypot(item.x - point.x, item.y - point.y);
            if (distance < best.distance) best = { point: item, distance };
        });
        return best.point && best.distance <= Math.max(10, nmsRadiusForCurrentAlgorithm() * 1.8)
            ? clampSourcePoint(best.point.x, best.point.y)
            : point;
    }

    function displayedCanvasRect(canvas) {
        if (!canvas?.width || !canvas?.height) return null;
        const box = canvas.getBoundingClientRect();
        return {
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            right: box.right,
            bottom: box.bottom
        };
    }

    function currentStepKey() {
        return harrisSteps()[Math.min(currentStep, harrisSteps().length - 1)]?.key || "input";
    }

    function previousStep() {
        const steps = harrisSteps();
        if (currentStep <= 0) return null;
        return steps[currentStep - 1] || null;
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
        if (selectedAlgorithm() === "fast") {
            return clampSourcePoint(
                x / Math.max(1, V.$("cornerStepCanvas").width) * currentData.meta.width,
                y / Math.max(1, V.$("cornerStepCanvas").height) * currentData.meta.height
            );
        }
        if (["input", "gray", "response", "nms", "refine"].includes(stepKey)) {
            return clampSourcePoint(x / Math.max(1, V.$("cornerStepCanvas").width) * currentData.meta.width, y / Math.max(1, V.$("cornerStepCanvas").height) * currentData.meta.height);
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
        if (selectedAlgorithm() === "fast") {
            return {
                x: sourceX / Math.max(1, currentData.meta.width) * canvas.width,
                y: sourceY / Math.max(1, currentData.meta.height) * canvas.height
            };
        }
        if (["input", "gray", "response", "nms", "refine"].includes(stepKey)) {
            return {
                x: sourceX / Math.max(1, currentData.meta.width) * canvas.width,
                y: sourceY / Math.max(1, currentData.meta.height) * canvas.height
            };
        }
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
        if (animationStartTimer) {
            window.clearTimeout(animationStartTimer);
            animationStartTimer = 0;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
        }
    }

    function clearCanvasDisplayTransition(canvas) {
        window.clearTimeout(canvasSizeTransitionTimer);
        if (!canvas) return;
        canvas.style.transition = "";
        canvas.style.width = "";
        canvas.style.height = "";
    }

    function cloneCanvas(canvas) {
        if (!canvas?.width || !canvas?.height) return null;
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext("2d").drawImage(canvas, 0, 0);
        return copy;
    }

    function prepareCanvasResizeTransition(canvas, previousFrame) {
        if (!canvas || !previousFrame) return null;
        const targetFrame = cloneCanvas(canvas);
        if (!targetFrame || previousFrame.width === targetFrame.width && previousFrame.height === targetFrame.height) return null;
        canvas.width = previousFrame.width;
        canvas.height = previousFrame.height;
        canvas.getContext("2d").drawImage(previousFrame, 0, 0);
        clearCanvasDisplayTransition(canvas);
        return {
            fromWidth: previousFrame.width,
            fromHeight: previousFrame.height,
            targetWidth: targetFrame.width,
            targetHeight: targetFrame.height,
            targetFrame
        };
    }

    function animateCanvas(canvas, drawFrame, duration = 1500, options = {}) {
        if (!canvas) return;
        cancelCanvasAnimation();
        const fixedBase = options.resize ? null : canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const started = performance.now();
        const frame = now => {
            const t = Math.min(1, (now - started) / duration);
            if (options.resize) {
                const ease = easeInOutCubic(t);
                const width = Math.max(1, Math.round(options.resize.fromWidth + (options.resize.targetWidth - options.resize.fromWidth) * ease));
                const height = Math.max(1, Math.round(options.resize.fromHeight + (options.resize.targetHeight - options.resize.fromHeight) * ease));
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }
            }
            const ctx = canvas.getContext("2d");
            if (fixedBase) ctx.putImageData(fixedBase, 0, 0);
            drawFrame(ctx, t, canvas);
            if (t < 1) {
                animationFrameId = requestAnimationFrame(frame);
            } else if (options.resize) {
                canvas.width = options.resize.targetWidth;
                canvas.height = options.resize.targetHeight;
                canvas.getContext("2d").drawImage(options.resize.targetFrame, 0, 0);
            }
        };
        animationFrameId = requestAnimationFrame(frame);
    }

    function animateCurrentStep(canvas, stepKey, options = {}) {
        if (!canvas) return;
        if (selectedAlgorithm() === "fast") {
            animateFastStep(canvas, stepKey);
            return;
        }
        if (stepKey === "gradient") animateGradientSplit(canvas, options);
        else if (stepKey === "second") animateSecondMoment(canvas, options);
        else if (stepKey === "tensor") animateTensorBuild(canvas);
        else if (stepKey === "response") animateResponseBuild(canvas, options);
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

    function animateGradientSplit(canvas, options = {}) {
        const gray = renderPackedToCanvas(currentData?.arrays?.gray);
        const ix = renderPackedToCanvas(currentData?.arrays?.ix);
        const iy = renderPackedToCanvas(currentData?.arrays?.iy);
        animateCanvas(canvas, (ctx, t, c) => {
            if (!gray || !ix || !iy) return;
            const layout = panelLayout(c, 2);
            const split = easeInOutCubic(Math.max(0, Math.min(1, (t - 0.06) / 0.76)));
            const morph = easeOutCubic(Math.max(0, Math.min(1, (t - 0.28) / 0.58)));
            const full = {
                x: 0,
                y: 0,
                width: c.width,
                height: c.height
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
        }, 1500, options);
    }

    function animateSecondMoment(canvas, options = {}) {
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
        }, 1700, options);
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

    function animateResponseBuild(canvas, options = {}) {
        const tensors = [currentData?.arrays?.sxx, currentData?.arrays?.sxy, currentData?.arrays?.syy].map(item => renderPackedToCanvas(item));
        const finalCanvas = options.resize?.targetFrame || cloneCanvas(canvas);
        animateCanvas(canvas, (ctx, t, c) => {
            if (tensors.some(item => !item) || !finalCanvas) return;
            const gap = Math.max(8, Math.round(c.width * 0.025));
            const startPanelWidth = (c.width - gap * 2) / 3;
            const merge = easeInOutCubic(Math.max(0, Math.min(1, (t - 0.04) / 0.76)));
            const reveal = easeOutCubic(Math.max(0, Math.min(1, (t - 0.32) / 0.58)));
            const target = { x: 0, y: 0, width: c.width, height: c.height };
            ctx.save();
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, c.width, c.height);
            tensors.forEach((img, index) => {
                const start = {
                    x: index * (startPanelWidth + gap),
                    y: 0,
                    width: startPanelWidth,
                    height: c.height
                };
                const rect = interpolateRect(start, target, merge);
                ctx.globalAlpha = Math.max(0, 1 - reveal * 0.92);
                drawImageCover(ctx, img, rect.x, rect.y, rect.width, rect.height);
            });
            ctx.globalAlpha = reveal;
            drawImageCover(ctx, finalCanvas, 0, 0, c.width, c.height);
            ctx.globalAlpha = 1;
            const probe = probeForCurrentSelection();
            const point = sourceToCanvasPoint(probe.x || 0, probe.y || 0, c) || { x: c.width / 2, y: c.height / 2 };
            drawResponseGlow(ctx, point.x, point.y, reveal);
            drawMatrixCells(ctx, Math.min(c.width - 68, point.x + 76), Math.max(54, point.y - 64), Math.max(0, 1 - merge * 1.2));
            ctx.restore();
        }, 1600, options);
    }

    function animateNms(canvas) {
        if (!canvas || !nmsCleanFrame) return;
        cancelCanvasAnimation();
        const ctx = canvas.getContext("2d");
        const kept = pointsForAlgorithm();
        const rippleKept = kept.slice(0, 250);
        const suppressed = responseCandidatesForNms(kept, 800);
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
        } else if (stepKey === "nms") {
            animateFastNms(canvas);
        } else if (stepKey === "corners") {
            animateFastCorners(canvas);
        } else {
            animateImageReveal(canvas, 900);
        }
    }

    function animateFastNms(canvas) {
        const candidates = (currentFast?.candidates || []).slice(0, 900);
        const kept = currentFast?.corners || [];
        const keptKeys = new Set(kept.map(point => `${point.x},${point.y}`));
        animateCanvas(canvas, (ctx, t) => {
            const erase = easeInOutCubic(Math.max(0, Math.min(1, (t - 0.10) / 0.78)));
            candidates.forEach((point, index) => {
                const isKept = keptKeys.has(`${point.x},${point.y}`);
                const deleteProgress = Math.max(0, Math.min(1, erase * 1.25 - index / Math.max(1, candidates.length)));
                if (!isKept && deleteProgress >= 1) return;
                if (isKept) {
                    const pulse = 1 + 0.18 * Math.sin(t * Math.PI * 8);
                    V.drawDiamond(ctx, point.x, point.y, "#facc15", 4.5 * pulse);
                } else {
                    ctx.globalAlpha = Math.max(0.10, 0.82 * (1 - deleteProgress));
                    V.drawCircle(ctx, point.x, point.y, "#94a3b8", 2.8);
                    ctx.globalAlpha = 1;
                }
            });
            kept.slice(0, 90).forEach((point, index) => {
                const start = Math.min(0.62, index / Math.max(1, kept.length) * 0.55);
                const visible = Math.max(0, Math.min(1, (t - start) / 0.24));
                if (visible <= 0) return;
                for (let waveIndex = 0; waveIndex < 2; waveIndex++) {
                    const wave = (t * 1.85 + index * 0.071 + waveIndex * 0.46) % 1;
                    const alpha = 0.46 * (1 - wave) * visible;
                    ctx.strokeStyle = `rgba(250,204,21,${alpha})`;
                    ctx.lineWidth = 1.6 + 1.2 * (1 - wave);
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 7 + fastOptions().nmsRadius * 2.8 * wave, 0, Math.PI * 2);
                    ctx.stroke();
                }
            });
        }, 2400);
    }

    function animateFastCorners(canvas) {
        const points = currentFast?.corners || [];
        animateCanvas(canvas, (ctx, t) => {
            const visible = Math.ceil(points.length * easeOutCubic(t));
            points.slice(0, visible).forEach((point, index) => {
                const age = Math.max(0, Math.min(1, visible - index));
                V.drawDiamond(ctx, point.x, point.y, "#facc15", 4 + age * 1.4);
            });
            const sweepX = canvas.width * easeInOutCubic(t);
            const gradient = ctx.createLinearGradient(sweepX - 45, 0, sweepX + 20, 0);
            gradient.addColorStop(0, "rgba(250,204,21,0)");
            gradient.addColorStop(0.75, "rgba(250,204,21,.16)");
            gradient.addColorStop(1, "rgba(250,204,21,0)");
            ctx.fillStyle = gradient;
            ctx.fillRect(sweepX - 45, 0, 65, canvas.height);
        }, 1800);
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
        drawImageCover(ctx, fromImage, rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = progress;
        drawImageCover(ctx, toImage, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
    }

    function drawImageCover(ctx, image, x, y, width, height) {
        if (!image || width <= 0 || height <= 0) return;
        const sourceWidth = image.width || image.naturalWidth;
        const sourceHeight = image.height || image.naturalHeight;
        const scale = Math.max(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
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
        const threshold = responseThresholdValue(packed);
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
        const selected = fastProbePoint();
        const scanPoints = fastScanPath(selected);
        const points = scanPoints.length ? scanPoints : (selected ? [selected] : []);
        if (!points.length) return;
        const contiguous = Math.max(1, currentFast?.contiguous || fastOptions().contiguous);
        animateCanvas(canvas, (ctx, t) => {
            const travel = easeInOutCubic(Math.min(1, t * 1.08));
            const idx = Math.min(points.length - 1, Math.floor(travel * points.length));
            const point = points[idx];
            const phase = travel * points.length - idx;
            points.slice(Math.max(0, idx - 9), idx).forEach((visited, trailIndex) => drawFastScanWindow(ctx, visited, 0.12 + trailIndex * 0.06, true));
            ctx.save();
            drawFastScanWindow(ctx, point, 1, false, phase);
            drawFastMagnifier(ctx, canvas, point, stepKey, contiguous, phase);
            ctx.restore();
        }, stepKey === "circle" ? 2600 : 3000);
    }

    function fastScanPath(selected) {
        if (!selected || !currentGray) return [];
        const path = [];
        const step = Math.max(8, Math.round(Math.min(currentGray.width, currentGray.height) / 24));
        const startY = Math.max(3, selected.y - step * 2);
        for (let row = 0; row < 5; row++) {
            const y = Math.max(3, Math.min(currentGray.height - 4, startY + row * step));
            const direction = row % 2 === 0 ? 1 : -1;
            for (let col = -4; col <= 4; col++) {
                const offset = direction > 0 ? col : -col;
                const x = Math.max(3, Math.min(currentGray.width - 4, selected.x + offset * step));
                path.push({ x, y, start: -1, polarity: "none", response: 0 });
            }
        }
        path.push(selected);
        return path;
    }

    function drawFastScanWindow(ctx, point, alpha = 1, compact = false, phase = 0) {
        const size = compact ? 14 : 28;
        const pulse = compact ? 0 : 4 * Math.sin(phase * Math.PI);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = compact ? "rgba(37,99,235,.08)" : "rgba(37,99,235,.18)";
        ctx.strokeStyle = compact ? "#93c5fd" : "#2563eb";
        ctx.lineWidth = compact ? 1.2 : 3;
        ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = compact ? 1 : 2.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 18 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        V.fastCircle.forEach(([dx, dy], index) => {
            const dotX = point.x + dx * 4;
            const dotY = point.y + dy * 4;
            ctx.fillStyle = index % 4 === 0 ? "#f97316" : "#facc15";
            ctx.beginPath();
            ctx.arc(dotX, dotY, compact ? 1.6 : 2.6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    function drawFastMagnifier(ctx, canvas, point, stepKey, contiguous, phase) {
        const size = Math.max(210, Math.min(300, canvas.width * 0.46));
        const panelWidth = size * 1.08;
        const panelHeight = size * 0.92;
        const left = Math.max(12, canvas.width - panelWidth - 18);
        const top = 18;
        const cx = left + panelWidth * 0.43;
        const cy = top + panelHeight * 0.54;
        const radius = size * 0.30;
        const center = fastCenterValue(point);
        const activeIndices = point.start >= 0
            ? Array.from({ length: contiguous }, (_, offset) => (point.start + offset) % 16)
            : [];
        ctx.save();
        ctx.fillStyle = "rgba(248,251,255,.96)";
        ctx.strokeStyle = "rgba(37,99,235,.9)";
        ctx.lineWidth = 2.4;
        roundRect(ctx, left, top, panelWidth, panelHeight, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "900 14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(stepKey === "circle" ? "FAST 16 点圆周采样" : `FAST-${contiguous} 连续段判定`, left + 16, top + 24);
        ctx.fillStyle = "#64748b";
        ctx.font = "800 11px sans-serif";
        ctx.fillText(`C=${center}  t=${fastOptions().threshold}`, left + 16, top + panelHeight - 16);
        const beam = ctx.createLinearGradient(point.x, point.y, left, top);
        beam.addColorStop(0, "rgba(250,204,21,.32)");
        beam.addColorStop(1, "rgba(37,99,235,.04)");
        ctx.strokeStyle = beam;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(point.x + 10, point.y - 10);
        ctx.lineTo(left + 18, top + panelHeight - 22);
        ctx.stroke();
        V.fastCircle.forEach((offset, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / 16;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            const value = currentGray?.gray?.[(point.y + offset[1]) * currentGray.width + point.x + offset[0]] ?? center;
            const bright = value > center + fastOptions().threshold;
            const dark = value < center - fastOptions().threshold;
            const active = activeIndices.includes(index);
            const reveal = stepKey === "circle" ? Math.max(0.18, Math.min(1, phase * 2.4 - index / 16 + 0.7)) : 1;
            ctx.globalAlpha = reveal;
            ctx.fillStyle = active ? (bright ? "#f97316" : "#2563eb") : bright ? "#fed7aa" : dark ? "#bfdbfe" : "#e2e8f0";
            ctx.strokeStyle = active ? "#facc15" : "#94a3b8";
            ctx.lineWidth = active ? 3 : 1.2;
            ctx.beginPath();
            ctx.arc(x, y, active ? 9 : 6.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (active) {
                ctx.fillStyle = "#0f172a";
                ctx.font = "900 9px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(bright ? "+" : dark ? "-" : "=", x, y + 3);
            }
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = point.start >= 0 && stepKey === "threshold" ? "#16a34a" : "#2563eb";
        ctx.beginPath();
        ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "900 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("C", cx, cy + 3);
        if (stepKey === "threshold" && activeIndices.length) {
            const startAngle = -Math.PI / 2 + point.start * Math.PI * 2 / 16;
            const endAngle = startAngle + contiguous * Math.PI * 2 / 16;
            ctx.strokeStyle = point.polarity === "bright" ? "#f97316" : "#2563eb";
            ctx.lineWidth = 9;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 12, startAngle, endAngle);
            ctx.stroke();
            ctx.fillStyle = point.polarity === "bright" ? "#f97316" : "#2563eb";
            ctx.font = "900 13px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(point.polarity === "bright" ? "连续亮点通过" : "连续暗点通过", left + panelWidth - 16, top + panelHeight - 16);
        }
        ctx.restore();
    }

    async function drawFastProbe(canvas) {
        const point = fastProbePoint();
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

    async function drawCurrentStep(options = {}) {
        if (!currentData) return;
        const shouldAnimate = options.animate !== false && cornerDisplayMode() !== "compare";
        cancelCanvasAnimation();
        const steps = harrisSteps();
        if (currentStep >= steps.length) currentStep = steps.length - 1;
        const step = steps[currentStep];
        const canvas = V.$("cornerStepCanvas");
        const shouldAnimateSize = shouldAnimate && selectedAlgorithm() !== "fast" && ["gradient", "second", "response"].includes(step.key);
        const previousFrame = shouldAnimateSize ? cloneCanvas(canvas) : null;
        clearCanvasDisplayTransition(canvas);
        const original = currentData.images.original;
        V.$("cornerStageTitle").textContent = `${algorithmLabel()} · ${step.en}`;
        V.$("cornerStepStatus").textContent = step.zh;
        V.$("cornerFlowTitle").textContent = `${algorithmLabel()} 角点检测计算流程`;

        if (selectedAlgorithm() === "fast") {
            await drawFastStep(canvas, step.key, original);
        } else {
            await drawHarrisStep(canvas, step.key, original);
        }
        const resize = shouldAnimateSize ? prepareCanvasResizeTransition(canvas, previousFrame) : null;
        drawProbeMarker(canvas);
        renderMotionProbe(step.key);
        await renderPreviousStepOverlay(step, original);
        if (shouldAnimate) {
            animationStartTimer = window.setTimeout(() => {
                animationStartTimer = 0;
                animateCurrentStep(canvas, step.key, { resize });
            }, 20);
        }
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
        else if (stepKey === "circle" || stepKey === "threshold") {
            await V.drawBaseImage(canvas, original, "#f8fbff");
            drawFastStaticExplanation(canvas, stepKey);
        }
        else if (stepKey === "nms") await V.drawBaseImage(canvas, original, "#f8fbff");
        else await V.drawFastKeypoints(canvas, original, currentFast?.corners || []);
    }

    function drawFastStaticExplanation(canvas, stepKey) {
        const point = fastProbePoint();
        if (!canvas || !point) return;
        const ctx = canvas.getContext("2d");
        const contiguous = Math.max(1, currentFast?.contiguous || fastOptions().contiguous);
        drawFastScanWindow(ctx, point, 1);
        drawFastMagnifier(ctx, canvas, point, stepKey, contiguous, 1);
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
        V.renderStatList(V.$("harrisSummary"), [
            ["候选点数", candidates],
            ["NMS 保留数", points.length],
            ["亚像素有效数", algorithm === "harris" ? refined.length : "-"],
            ["亚像素平均偏移", algorithm === "harris" ? offsets.avg : "-"],
            ["亚像素最大偏移", algorithm === "harris" ? offsets.max : "-"],
            ["处理耗时", algorithm === "fast" ? "页面计算" : `${currentData.meta.elapsed_ms} ms`]
        ]);
    }

    function renderFlow() {
        const steps = harrisSteps();
        V.$("cornerFlowLine").innerHTML = "";
        V.$("cornerFlowLine").hidden = true;
        V.$("cornerFlowThumbs").innerHTML = steps.map((step, index) => `
            <button type="button" class="${index === currentStep ? "is-active" : ""}" data-corner-step="${index}">
                <span class="corner-flow-card-head">
                    <i>${index + 1}</i>
                    <span><b>${step.en}</b><small>${step.zh}</small></span>
                </span>
                <canvas id="cornerThumb${index}"></canvas>
            </button>
        `).join("");
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
        V.$("harrisElapsed").textContent = selectedAlgorithm() === "fast" ? "FAST · 页面计算" : `${data.meta.elapsed_ms} ms`;
    }

    V.$("cornerAlgorithm").addEventListener("change", async () => {
        updateControlVisibility();
        currentStep = 0;
        form.requestSubmit();
    });
    V.$("showSubpixel").addEventListener("change", drawCurrentStep);
    V.$("cornerStepCanvas")?.addEventListener("click", handleProbePick);
    V.$("cornerDisplayMode")?.addEventListener("change", () => drawCurrentStep({ animate: false }));
    V.$("cornerCompareRange")?.addEventListener("input", updateCompareClip);
    window.addEventListener("resize", syncCompareOverlayLayout);
    V.$("motionProbePlay")?.addEventListener("click", () => {
        motionProbeState.playing = true;
        motionProbeState.lastTime = 0;
        syncMotionControls();
    });
    V.$("motionProbePause")?.addEventListener("click", () => {
        motionProbeState.playing = false;
        syncMotionControls();
    });
    V.$("motionProbeStep")?.addEventListener("click", () => {
        const actions = motionActions(currentStepKey());
        motionProbeState.playing = false;
        const segment = 1 / Math.max(1, actions.length);
        const currentSegment = Math.floor(motionProbeState.progress / segment);
        motionProbeState.progress = ((currentSegment + 1) % actions.length) * segment + 0.001;
        motionProbeState.lastTime = 0;
        syncMotionControls();
        const canvas = V.$("cornerMotionCanvas");
        if (canvas) drawMotionProbeFrame(canvas, currentStepKey(), motionProbeState.progress);
    });
    document.querySelectorAll("[data-motion-speed]").forEach(button => {
        button.addEventListener("click", () => {
            motionProbeState.speed = Number(button.dataset.motionSpeed) || 1;
            syncMotionControls();
        });
    });
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
            "cornerDisplayMode",
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
                data = await V.computeFeatureForm(form);
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
