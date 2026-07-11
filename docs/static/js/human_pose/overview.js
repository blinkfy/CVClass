(function () {
    const root = document.querySelector("[data-pose-overview]");
    if (!root) return;

    const steps = ["input", "person", "keypoints", "skeleton", "vector"];
    const methodInfo = {
        topdown: {
            title: "Top-down 两阶段：先找人，再估计关键点",
            status: "Person detector + keypoint head",
            input: "整图先进入人体检测器，再裁剪每个人体区域。",
            output: "每个人一组 COCO-17 关键点、score、visible 与 skeleton pairs。",
            advantage: "单人或少量人物时精度高，关键点落在人体 crop 内更稳定。",
            cost: "多人场景需要先检测每个人，人数越多推理越慢。",
            formula: "image → person bbox → crop → heatmap head → keypoints"
        },
        bottomup: {
            title: "Bottom-up 自底向上：先找关节点，再组合成人",
            status: "Joint candidates + grouping",
            input: "整图一次进入网络，不先裁剪单个人体。",
            output: "全图关节点候选、肢体连接分数与按人分组后的骨架。",
            advantage: "多人密集场景中只需一次全图前向计算，实时展示更轻。",
            cost: "遮挡、肢体交叉或多人贴近时，关节点归属更容易混淆。",
            formula: "image → joint heatmaps → limb affinity → grouping → persons"
        },
        heatmap: {
            title: "Heatmap 峰值定位：每个关节一张概率图",
            status: "Feature map + joint heatmaps",
            input: "图像特征被映射成多个关节点热力图。",
            output: "每个关节在热力图中的峰值位置与置信度。",
            advantage: "空间定位直观，适合解释模型如何从局部响应找到关节。",
            cost: "热力图分辨率有限，亚像素修正会影响最终坐标精度。",
            formula: "joint_k = argmax Heatmap_k(x, y)"
        },
        regression: {
            title: "坐标回归：直接输出姿态向量",
            status: "CNN feature + coordinate vector",
            input: "人体 crop 经 CNN 提取全局特征。",
            output: "归一化坐标向量，再映射回图像绝对坐标。",
            advantage: "链路短，能直接说明 pose vector 的端到端预测思想。",
            cost: "缺少显式空间概率图，复杂姿态和遮挡下稳定性通常弱于热力图。",
            formula: "normalized_x = (x - bbox_x) / bbox_w"
        },
        transformer: {
            title: "Transformer Pose：用 token 建模全局结构",
            status: "Image tokens + pose queries",
            input: "图像 patch 或人体区域被编码成视觉 token。",
            output: "关节点 token 或查询向量解码为关键点坐标。",
            advantage: "能建模远距离关节关系，对遮挡和复杂姿态更有表达力。",
            cost: "模型更大，浏览器端真实推理需要更谨慎的性能评估。",
            formula: "patch tokens + pose queries → joint coordinates"
        }
    };

    const stepLabels = {
        input: "输入图像",
        person: "人体区域",
        keypoints: "关键点",
        skeleton: "骨架连接",
        vector: "姿态向量"
    };

    const setActive = (items, key, attr) => {
        items.forEach((item) => {
            item.classList.toggle("is-active", item.dataset[attr] === key);
        });
    };

    const methodButtons = Array.from(root.querySelectorAll("[data-overview-method]"));
    const stepButtons = Array.from(root.querySelectorAll("[data-overview-step]"));
    const pipelineItems = Array.from(root.querySelectorAll("[data-overview-pipeline]"));
    const tableRows = Array.from(document.querySelectorAll("[data-method-row]"));
    const playButton = root.querySelector("[data-overview-play]");
    const readout = {
        title: root.querySelector("[data-overview-title]"),
        status: root.querySelector("[data-overview-status]"),
        input: root.querySelector("[data-overview-input]"),
        output: root.querySelector("[data-overview-output]"),
        advantage: root.querySelector("[data-overview-advantage]"),
        cost: root.querySelector("[data-overview-cost]"),
        formula: root.querySelector("[data-overview-formula]")
    };
    let playTimer = null;

    function applyMethod(method) {
        const info = methodInfo[method] || methodInfo.topdown;
        root.dataset.method = method;
        setActive(methodButtons, method, "overviewMethod");
        tableRows.forEach((row) => row.classList.toggle("is-active", row.dataset.methodRow === method));
        readout.title.textContent = info.title;
        readout.status.textContent = info.status;
        readout.input.textContent = info.input;
        readout.output.textContent = info.output;
        readout.advantage.textContent = info.advantage;
        readout.cost.textContent = info.cost;
        readout.formula.textContent = info.formula;
    }

    function applyStep(step) {
        root.dataset.step = step;
        setActive(stepButtons, step, "overviewStep");
        setActive(pipelineItems, step, "overviewPipeline");
        root.setAttribute("aria-label", `姿态估计总览对比台，当前阶段：${stepLabels[step] || step}`);
    }

    function stopPlayback() {
        if (playTimer) {
            window.clearInterval(playTimer);
            playTimer = null;
        }
        if (playButton) playButton.textContent = "播放流程";
    }

    function startPlayback() {
        if (!playButton || playTimer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        let index = steps.indexOf(root.dataset.step);
        playButton.textContent = "停止播放";
        playTimer = window.setInterval(() => {
            index = (index + 1) % steps.length;
            applyStep(steps[index]);
        }, 760);
    }

    methodButtons.forEach((button) => {
        button.addEventListener("click", () => {
            applyMethod(button.dataset.overviewMethod);
        });
    });

    stepButtons.forEach((button) => {
        button.addEventListener("click", () => {
            stopPlayback();
            applyStep(button.dataset.overviewStep);
        });
    });

    if (playButton) {
        playButton.addEventListener("click", () => {
            if (playTimer) {
                stopPlayback();
                return;
            }
            startPlayback();
        });
    }

    applyMethod(root.dataset.method || "topdown");
    applyStep(root.dataset.step || "input");
    window.setTimeout(startPlayback, 520);
})();
