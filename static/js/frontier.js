(function () {
    const page = document.querySelector("[data-frontier-page]");
    if (!page) return;

    const fallbackTasks = [
        {
            id: "classification",
            label: "分类",
            subtitle: "Image-level label",
            outputTitle: "城市道路场景",
            outputMeta: "Top-1 0.91",
            description: "把整张图像压缩成类别概率分布，回答这是什么场景或主体。",
            relation: "承接 CNN 分类与特征表征，把空间细节汇聚为全局语义。",
            tags: ["全局语义", "概率分布", "CNN 表征"],
        },
        {
            id: "detection",
            label: "目标检测",
            subtitle: "Boxes + classes",
            outputTitle: "3 个候选目标",
            outputMeta: "bbox + score",
            description: "在同一图像上预测目标类别、置信度和边界框位置。",
            relation: "对应检测分割模块中的候选框、IoU 与 NMS。",
            tags: ["边界框", "置信度", "NMS"],
        },
        {
            id: "semantic",
            label: "语义分割",
            subtitle: "Pixel-wise class",
            outputTitle: "道路 / 车辆 / 行人 / 天空",
            outputMeta: "H x W class map",
            description: "为每个像素分配语义类别，同类物体共享同一种颜色。",
            relation: "从边缘、纹理与 CNN 特征进入像素级理解。",
            tags: ["像素分类", "类别图", "mIoU"],
        },
        {
            id: "instance",
            label: "实例分割",
            subtitle: "Masks + identities",
            outputTitle: "实例 ID 可分离",
            outputMeta: "N masks",
            description: "不仅区分类别，还把同类中的不同个体拆成独立实例。",
            relation: "连接目标检测框与语义掩码，形成实例级输出。",
            tags: ["实例 ID", "Mask AP", "检测 + 分割"],
        },
        {
            id: "depth",
            label: "深度估计",
            subtitle: "Monocular depth",
            outputTitle: "近处暖色，远处冷色",
            outputMeta: "dense depth",
            description: "从单张图像推断每个像素的相对远近，输出稠密深度图。",
            relation: "展示统一模型可把几何任务也转成图像式输出。",
            tags: ["几何理解", "深度图", "3D 线索"],
        },
        {
            id: "normal",
            label: "表面法线",
            subtitle: "Surface normal",
            outputTitle: "方向被编码为 RGB",
            outputMeta: "normal RGB",
            description: "把表面朝向映射到 RGB 颜色，表达局部几何方向。",
            relation: "从卷积局部结构扩展到三维表面几何。",
            tags: ["方向场", "RGB 编码", "几何"],
        },
        {
            id: "edge",
            label: "边缘图",
            subtitle: "Edge map",
            outputTitle: "结构边界增强",
            outputMeta: "binary / soft edge",
            description: "保留物体轮廓、道路边界和结构线索，压缩纹理与颜色。",
            relation: "直接回扣边缘轮廓模块中的经典与深度边缘检测。",
            tags: ["轮廓", "结构线", "TEED"],
        },
        {
            id: "background",
            label: "背景移除",
            subtitle: "Foreground alpha",
            outputTitle: "主体 Alpha Mask",
            outputMeta: "foreground cutout",
            description: "把前景主体从背景中分离出来，形成可组合的透明图层。",
            relation: "可看作分割任务在内容创作场景中的接口化表达。",
            tags: ["前景提取", "Alpha", "创作接口"],
        },
    ];

    const buttonRoot = page.querySelector("[data-frontier-task-buttons]");
    const output = page.querySelector("[data-frontier-output]");
    const outputTitle = page.querySelector("[data-frontier-output-title]");
    const outputMeta = page.querySelector("[data-frontier-output-meta]");
    const taskLabel = page.querySelector("[data-frontier-task-label]");
    const taskSubtitle = page.querySelector("[data-frontier-task-subtitle]");
    const taskDescription = page.querySelector("[data-frontier-task-description]");
    const taskRelation = page.querySelector("[data-frontier-task-relation]");
    const taskTags = page.querySelector("[data-frontier-task-tags]");
    const taskPrompt = page.querySelector("[data-frontier-task-prompt]");
    const outputTitleInline = page.querySelector("[data-frontier-output-title-inline]");
    const decodeTitle = page.querySelector("[data-frontier-decode-title]");
    const decodeSummary = page.querySelector("[data-frontier-decode-summary]");

    function cvUrl(path) {
        return window.cvclassUrl ? window.cvclassUrl(path) : path;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderPrompt(task) {
        if (!taskPrompt) return;
        const seed = task.prompt || `Generate a ${task.label} RGB visualization, then decode it into ${task.outputMeta}.`;
        let html = escapeHtml(seed);
        [...(task.tags || []), task.label].filter(Boolean).forEach((keyword) => {
            const safeKeyword = escapeHtml(keyword);
            html = html.replace(safeKeyword, `<span class="frontier-prompt-keyword">${safeKeyword}</span>`);
        });
        taskPrompt.innerHTML = html;
    }

    async function loadTasks() {
        try {
            const response = await fetch(cvUrl("/static/assets/data/frontier_tasks.json"), { cache: "no-store" });
            if (!response.ok) return fallbackTasks;
            const data = await response.json();
            return Array.isArray(data) && data.length ? data : fallbackTasks;
        } catch (_error) {
            return fallbackTasks;
        }
    }

    function clearTaskClasses(tasks) {
        if (!output) return;
        tasks.forEach((task) => output.classList.remove(`is-task-${task.id}`));
    }

    function renderTags(tags) {
        if (!taskTags) return;
        taskTags.innerHTML = "";
        (tags || []).forEach((tag) => {
            const chip = document.createElement("span");
            chip.textContent = tag;
            taskTags.appendChild(chip);
        });
    }

    function activateTask(task, tasks) {
        if (!task) return;

        buttonRoot?.querySelectorAll("button").forEach((button) => {
            const isActive = button.dataset.taskId === task.id;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-checked", String(isActive));
        });

        clearTaskClasses(tasks);
        output?.classList.add("is-switching", `is-task-${task.id}`);
        window.setTimeout(() => output?.classList.remove("is-switching"), 520);

        if (outputTitle) outputTitle.textContent = task.outputTitle;
        if (outputTitleInline) outputTitleInline.textContent = task.outputTitle;
        if (outputMeta) outputMeta.textContent = task.outputMeta;
        if (decodeTitle) decodeTitle.textContent = task.decodeTitle || task.outputMeta;
        if (decodeSummary) decodeSummary.textContent = task.decodeSummary || `Decoded as ${task.outputMeta}`;
        if (taskLabel) taskLabel.textContent = task.label;
        if (taskSubtitle) taskSubtitle.textContent = task.subtitle;
        if (taskDescription) taskDescription.textContent = task.description;
        if (taskRelation) taskRelation.textContent = task.relation;
        renderPrompt(task);
        renderTags(task.tags);
    }

    function renderButtons(tasks) {
        if (!buttonRoot) return;
        buttonRoot.innerHTML = "";
        tasks.forEach((task, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.taskId = task.id;
            button.setAttribute("role", "radio");
            button.setAttribute("aria-checked", String(index === 0));
            button.innerHTML = `<strong>${task.label}</strong><small>${task.subtitle}</small>`;
            button.addEventListener("click", () => activateTask(task, tasks));
            buttonRoot.appendChild(button);
        });
    }

    function setupReveal() {
        const items = page.querySelectorAll("[data-reveal], [data-reveal-section]");
        if (!items.length) return;

        if (!("IntersectionObserver" in window)) {
            items.forEach((item) => item.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.22 });

        items.forEach((item) => observer.observe(item));
    }

    loadTasks().then((tasks) => {
        renderButtons(tasks);
        activateTask(tasks[0], tasks);
        setupReveal();
    });
}());
