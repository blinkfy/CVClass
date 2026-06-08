(function () {
    "use strict";

    const V = window.FeatureViz;
    const form = document.getElementById("featureSiftForm");
    if (!V || !form) return;

    const descriptorFlag = document.getElementById("siftDescriptorFlag");
    const stepButtons = Array.from(document.querySelectorAll("[data-sift-step]"));
    const stepPanels = Array.from(document.querySelectorAll("[data-sift-panel]"));
    const descriptorStatuses = Array.from(document.querySelectorAll("[data-descriptor-status]"));
    const stepContent = [
        {
            title: "预处理",
            primary: ["灰度化", "将彩色输入转换为单通道强度图，为后续高斯平滑和梯度计算提供统一输入。"],
            secondary: ["统一尺寸", "后端按最大边长约束计算尺寸，前端同步展示输入图和灰度结果。"],
            boundary: "灰度预览由浏览器从输入图像生成，不额外调用后端算法。"
        },
        {
            title: "Gaussian Pyramid",
            primary: ["Octave", "每进入下一组，图像宽高下采样为上一组的一半，覆盖更大的特征尺度。"],
            secondary: ["尺度层", "同一 octave 内逐层增加高斯 σ，得到连续的尺度空间表示。"],
            boundary: "后端返回高斯金字塔缩略数组，Canvas 负责逐层绘制。"
        },
        {
            title: "DoG Pyramid",
            primary: ["Difference of Gaussian", "同一 octave 内相邻高斯层相减，近似尺度归一化 LoG 响应。"],
            secondary: ["尺度响应", "亮暗区域表示不同符号和幅值的 DoG 响应，用于寻找稳定尺度极值。"],
            boundary: "后端返回 DoG 缩略数组，前端仅做归一化显示。"
        },
        {
            title: "3×3×3 极值检测与过滤",
            primary: ["26 邻域比较", "候选点同时与当前层 8 个邻居及上下尺度层各 9 个邻居比较。"],
            secondary: ["候选过滤", "依次剔除低对比度响应、边缘响应，再保留稳定的最终关键点。"],
            boundary: "极值点和过滤结果来自核心 SIFT；圆环、点和统计信息由页面绘制。"
        },
        {
            title: "主方向分配",
            primary: ["36-bin 方向直方图", "在关键点尺度对应的邻域内统计梯度方向，直方图主峰确定关键点主方向。"],
            secondary: ["旋转不变性", "后续局部坐标和梯度方向都相对主方向旋转，降低图像旋转的影响。"],
            boundary: "进入本步骤时才以 descriptor=true 请求方向点和局部 patch 数据。"
        },
        {
            title: "128 维描述子",
            primary: ["4×4×8", "16×16 邻域划分为 4×4 个 cell，每个 cell 统计 8 个方向，组成 128 维向量。"],
            secondary: ["归一化", "描述子经 L2 归一化与幅值截断，减弱整体亮度和局部强梯度的影响。"],
            boundary: "描述子数值由算法模块整理返回，页面只展示选中关键点。"
        }
    ];

    let currentStep = 0;
    let generation = 0;
    let scaleData = null;
    let descriptorData = null;
    let descriptorPromise = null;

    V.setupSamples(form);
    V.bindFileNames(form);

    function setDescriptorStatus(text, state = "") {
        descriptorStatuses.forEach(element => {
            element.textContent = text;
            element.dataset.state = state;
        });
    }

    function renderPyramid(container, rows, dog) {
        if (!container) return;
        container.innerHTML = "";
        (rows || []).forEach((row, octave) => {
            const rowElement = document.createElement("div");
            rowElement.className = "feature-pyramid-row";
            rowElement.innerHTML = `<div class="feature-pyramid-label">Octave ${octave}</div>`;
            row.forEach(cell => {
                const canvas = document.createElement("canvas");
                canvas.title = `${dog ? "DoG" : "Gaussian"} · O${cell.octave} L${cell.layer}`;
                rowElement.appendChild(canvas);
                V.drawArray(canvas, cell.array, "gray");
            });
            container.appendChild(rowElement);
        });
    }

    function renderDogProbe(probe) {
        const box = V.$("dogProbe");
        if (!box) return;
        box.innerHTML = "";
        if (!probe) {
            box.textContent = "当前参数下没有可展示的 3×3×3 邻域。";
            return;
        }
        V.renderMatrix(box, "上一层", probe.prev);
        V.renderMatrix(box, "当前层", probe.current);
        V.renderMatrix(box, "下一层", probe.next);
        box.insertAdjacentHTML("beforeend", `
            <div class="feature-matrix-card">
                <strong>检测点状态</strong>
                <p>Octave / Layer: ${probe.octave} / ${probe.layer}</p>
                <p>坐标: (${probe.x}, ${probe.y})</p>
                <p>中心值: ${probe.center}</p>
            </div>
        `);
    }

    async function renderPreprocess(data) {
        await V.drawBaseImage(V.$("siftOriginalCanvas"), data.images.original);
        const gray = await V.imageToGray(data.images.original);
        V.drawArray(V.$("siftGrayCanvas"), gray, "gray");
        V.renderStatList(V.$("siftInputStats"), [
            ["图像尺寸", `${data.meta.width} × ${data.meta.height}`],
            ["输入文件", data.meta.filename],
            ["处理通道", "RGB → Gray"]
        ]);
    }

    async function renderScale(data) {
        scaleData = data;
        await renderPreprocess(data);
        renderPyramid(V.$("gaussianPyramid"), data.pyramid?.gaussian || [], false);
        renderPyramid(V.$("dogPyramid"), data.pyramid?.dog || [], true);
        renderDogProbe(data.pyramid?.probe);

        const sift = data.sift || {};
        await Promise.all([
            V.drawKeypoints(V.$("scaleExtremaCanvas"), data.images.original, sift.points_extrema || [], {
                color: "#94a3b8", max: 800, size: 3
            }),
            V.drawKeypoints(V.$("scaleEdgeCanvas"), data.images.original, sift.points_edge || [], {
                color: "#f97316", type: "circle", max: 600, radius: 3
            }),
            V.drawSiftKeypoints(V.$("scaleSiftCanvas"), data.images.original, sift.points_keypoints || sift.keypoints || [], {
                max: 350
            })
        ]);

        const counts = sift.counts || {};
        V.renderStatList(V.$("scaleStats"), [
            ["原始极值点", counts.raw_extrema || 0],
            ["对比度与边缘过滤后", counts.edge_survivors || 0],
            ["最终保留", counts.kept || sift.count || 0]
        ]);
        V.$("siftElapsed").textContent = `${data.meta.elapsed_ms} ms · 基础数据`;
    }

    function orientationHistogram(vectors) {
        const histogram = new Array(36).fill(0);
        (vectors || []).forEach(vector => {
            const angle = ((Number(vector.angle) || 0) % 360 + 360) % 360;
            const bin = Math.round(angle / 10) % 36;
            histogram[bin] += (Number(vector.mag) || 0) * (Number(vector.weight) || 1);
        });
        return histogram;
    }

    function cellHistograms(vectors) {
        const cells = Array.from({ length: 4 }, () =>
            Array.from({ length: 4 }, () => new Array(8).fill(0))
        );
        (vectors || []).forEach(vector => {
            const cellX = Math.floor(Number(vector.xbin));
            const cellY = Math.floor(Number(vector.ybin));
            if (cellX < 0 || cellX >= 4 || cellY < 0 || cellY >= 4) return;
            const bin = (Math.floor(Number(vector.obin)) % 8 + 8) % 8;
            cells[cellY][cellX][bin] += (Number(vector.mag) || 0) * (Number(vector.weight) || 1);
        });
        return cells;
    }

    function drawPatch(canvas, vectors) {
        if (!canvas) return;
        V.setCanvasSize(canvas, 360, 260);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#dbeafe";
        for (let index = 0; index <= 16; index++) {
            const x = 30 + index * 18;
            const y = 20 + index * 14;
            ctx.beginPath();
            ctx.moveTo(x, 20);
            ctx.lineTo(x, 244);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(30, y);
            ctx.lineTo(318, y);
            ctx.stroke();
        }
        const maxMagnitude = Math.max(1e-6, ...(vectors || []).map(vector => Number(vector.mag) || 0));
        (vectors || []).forEach(vector => {
            const x = 30 + (Number(vector.dx) + 8.5) * 18;
            const y = 20 + (Number(vector.dy) + 8.5) * 14;
            const length = 4 + 10 * ((Number(vector.mag) || 0) / maxMagnitude);
            const angle = (Number(vector.angle) || 0) * Math.PI / 180;
            ctx.strokeStyle = "#7c3aed";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x - Math.cos(angle) * length / 2, y - Math.sin(angle) * length / 2);
            ctx.lineTo(x + Math.cos(angle) * length / 2, y + Math.sin(angle) * length / 2);
            ctx.stroke();
        });
    }

    function drawCells(canvas, cells) {
        if (!canvas) return;
        V.setCanvasSize(canvas, 440, 220);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const size = 42;
        const startX = 22;
        const startY = 22;
        for (let cellY = 0; cellY < 4; cellY++) {
            for (let cellX = 0; cellX < 4; cellX++) {
                const x = startX + cellX * (size + 8);
                const y = startY + cellY * (size + 8);
                ctx.strokeStyle = "#cbd5e1";
                ctx.strokeRect(x, y, size, size);
                const histogram = cells?.[cellY]?.[cellX] || [];
                const maximum = Math.max(1e-9, ...histogram);
                for (let bin = 0; bin < 8; bin++) {
                    const angle = bin / 8 * Math.PI * 2;
                    const length = 4 + 12 * ((histogram[bin] || 0) / maximum);
                    const centerX = x + size / 2;
                    const centerY = y + size / 2;
                    ctx.strokeStyle = "#2563eb";
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
                    ctx.stroke();
                }
            }
        }
    }

    async function renderDescriptor(data) {
        descriptorData = data;
        const selected = data.sift?.selected;
        const oriented = data.sift?.oriented_keypoints || data.sift?.extended_points || [];
        await V.drawSiftKeypoints(
            V.$("descriptorKeypointCanvas"),
            data.images.original,
            oriented,
            { max: 250 }
        );

        const vectors = selected?.patch_vectors || [];
        drawPatch(V.$("descriptorPatchCanvas"), vectors);
        const histogram = orientationHistogram(vectors);
        const mainBin = selected ? Math.round(Number(selected.orientation_deg) / 10) % 36 : -1;
        V.drawBarChart(V.$("orientationHist"), histogram, {
            width: 820, height: 160, highlight: mainBin, color: "#60a5fa"
        });
        drawCells(V.$("cellHistCanvas"), cellHistograms(vectors));
        V.drawBarChart(V.$("descriptor128Canvas"), selected?.descriptor128 || [], {
            width: 820, height: 180, color: "#2563eb"
        });
        V.renderStatList(V.$("keypointInfo"), selected ? [
            ["x, y", `${selected.x}, ${selected.y}`],
            ["octave / layer", `${selected.octave} / ${selected.layer}`],
            ["σ", selected.sigma],
            ["主方向", `${selected.orientation_deg}°`],
            ["Response", selected.response],
            ["Descriptor", "128 维"]
        ] : [["状态", "当前参数下未检测到可生成描述子的关键点"]]);
        setDescriptorStatus(
            selected ? `已加载 ${oriented.length} 个方向关键点，当前展示 1 个描述子。` : "未检测到可生成描述子的关键点。",
            selected ? "ready" : "empty"
        );
        V.$("siftElapsed").textContent = `${data.meta.elapsed_ms} ms · 描述子数据`;
    }

    function renderNotes(step) {
        const content = stepContent[step];
        V.$("siftStageTitle").textContent = content.title;
        V.$("siftNoteTitle").textContent = content.title;
        V.$("siftNotePrimary").innerHTML = `<b>${content.primary[0]}</b><p>${content.primary[1]}</p>`;
        V.$("siftNoteSecondary").innerHTML = `<b>${content.secondary[0]}</b><p>${content.secondary[1]}</p>`;
        V.$("siftNoteBoundary").textContent = content.boundary;
    }

    async function loadDescriptor() {
        if (descriptorData) return descriptorData;
        if (descriptorPromise) return descriptorPromise;

        const requestGeneration = generation;
        setDescriptorStatus("正在加载主方向与 128 维描述子...", "loading");
        descriptorFlag.value = "true";
        const request = V.postForm(form, "/api/feature-detect");
        descriptorFlag.value = "false";

        descriptorPromise = request.then(async data => {
            if (requestGeneration !== generation) return null;
            await renderDescriptor(data);
            return data;
        }).catch(error => {
            if (requestGeneration === generation) {
                setDescriptorStatus(error.message || "描述子数据加载失败。", "error");
            }
            return null;
        }).finally(() => {
            if (requestGeneration === generation) descriptorPromise = null;
        });
        return descriptorPromise;
    }

    function selectStep(step) {
        currentStep = Math.max(0, Math.min(stepContent.length - 1, Number(step) || 0));
        stepButtons.forEach(button => {
            const active = Number(button.dataset.siftStep) === currentStep;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-current", active ? "step" : "false");
        });
        stepPanels.forEach(panel => {
            panel.hidden = Number(panel.dataset.siftPanel) !== currentStep;
        });
        renderNotes(currentStep);
        if (currentStep >= 4) loadDescriptor();
        else if (scaleData) V.$("siftElapsed").textContent = `${scaleData.meta.elapsed_ms} ms · 基础数据`;
    }

    stepButtons.forEach(button => {
        button.addEventListener("click", () => selectStep(button.dataset.siftStep));
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const requestGeneration = ++generation;
        descriptorData = null;
        descriptorPromise = null;
        setDescriptorStatus("进入第 5 或第 6 步后加载描述子数据。", "");
        descriptorFlag.value = "false";

        const button = form.querySelector("button[type=submit]");
        if (button) button.textContent = "计算中...";
        V.$("siftElapsed").textContent = "基础数据计算中...";
        try {
            const data = await V.postForm(form, "/api/feature-detect");
            if (requestGeneration !== generation) return;
            await renderScale(data);
            if (currentStep >= 4) await loadDescriptor();
        } catch (error) {
            if (requestGeneration === generation) {
                V.$("siftElapsed").textContent = error.message || "计算失败";
            }
        } finally {
            if (requestGeneration === generation && button) button.textContent = "重新计算";
        }
    });

    V.bindAutoSubmit(form);
    selectStep(0);
    form.requestSubmit();
})();
