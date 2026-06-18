(function () {
    const page = document.querySelector("[data-banana-page]");
    if (!page) return;

    const fallbackTasks = [
        {
            id: "semantic",
            label: "语义分割",
            prompt: "Generate a semantic segmentation visualization of this street image. Use cyan for sky, blue for road, yellow for vehicles, green for trees, and white for people.",
            keywords: ["semantic segmentation", "cyan", "blue", "yellow", "green", "white"],
            rgbTitle: "RGB Semantic Map",
            decodeTitle: "按颜色表解码像素类别",
            decode: "输出不是类别张量，而是一张可视化 RGB 图；系统再按 prompt 中约定的颜色映射恢复类别图。",
        },
        {
            id: "instance",
            label: "实例分割",
            prompt: "Generate an instance segmentation visualization. Color each vehicle and person with a unique solid RGB color; keep the background dark.",
            keywords: ["instance segmentation", "unique", "solid RGB", "background"],
            rgbTitle: "Unique Instance Colors",
            decodeTitle: "颜色连通域转成实例 ID",
            decode: "每个实例被编码成不同颜色，解码时通过颜色聚类和连通域得到 mask、bbox 与 instance id。",
        },
        {
            id: "referring",
            label: "指代表达分割",
            prompt: "Segment the person crossing near the bus and render only that referred person in white. Everything else should be black.",
            keywords: ["person", "near the bus", "white", "black"],
            rgbTitle: "Referred Object Mask",
            decodeTitle: "语言条件决定被分割对象",
            decode: "prompt 中的指代表达限定目标，RGB 图只显示被指代主体，解码后得到二值 mask。",
        },
        {
            id: "depth",
            label: "深度估计",
            prompt: "Generate a metric depth visualization. Use warm colors for nearby objects and cool colors for far regions; keep the mapping smooth.",
            keywords: ["metric depth", "warm", "cool", "smooth"],
            rgbTitle: "Depth Color Ramp",
            decodeTitle: "颜色梯度恢复稠密深度",
            decode: "模型把远近关系编码为连续色带，解码器按色带标尺恢复相对或度量深度。",
        },
        {
            id: "normal",
            label: "表面法线",
            prompt: "Generate a surface normal map. Encode x, y, and z directions as RGB channels with clean object boundaries.",
            keywords: ["surface normal", "x", "y", "z", "RGB"],
            rgbTitle: "Normal RGB Field",
            decodeTitle: "RGB 通道表示空间方向",
            decode: "每个像素的 RGB 值对应三维法线分量，因此输出图本身就是可解码的方向场。",
        },
        {
            id: "edge",
            label: "边缘图",
            prompt: "Generate an edge visualization of this image. Draw crisp white contours and important structural lines on a dark background.",
            keywords: ["edge", "white contours", "structural lines", "dark"],
            rgbTitle: "Crisp Edge Map",
            decodeTitle: "亮度阈值转成边缘概率",
            decode: "白色线条表示高边缘概率，暗背景表示非边缘区域，可进一步阈值化成二值边缘图。",
        },
        {
            id: "background",
            label: "背景移除",
            prompt: "Remove the background and keep the bus and pedestrians as the foreground. Render transparent regions with a checkerboard style.",
            keywords: ["Remove", "background", "foreground", "checkerboard"],
            rgbTitle: "Foreground Cutout",
            decodeTitle: "前景区域转 Alpha Mask",
            decode: "背景区域被统一编码，前景保留原始颜色，解码时得到可用于合成的 alpha mask。",
        },
        {
            id: "edit",
            label: "图像编辑",
            prompt: "Edit the image by turning the road into a clean blue lane while preserving the people, vehicles, and scene geometry.",
            keywords: ["Edit", "blue lane", "preserving", "geometry"],
            rgbTitle: "Instruction-guided Edit",
            decodeTitle: "生成式接口保留视觉结构",
            decode: "图像编辑不再输出离散标签，而是把指令转成新的 RGB 图像，同时保持主体和几何关系。",
        },
    ];

    const tabRoot = page.querySelector("[data-banana-task-tabs]");
    const output = page.querySelector("[data-banana-output]");
    const currentTask = page.querySelector("[data-banana-current-task]");
    const promptNode = page.querySelector("[data-banana-prompt]");
    const rgbTitle = page.querySelector("[data-banana-rgb-title]");
    const decodeTitle = page.querySelector("[data-banana-decode-title]");
    const decodeNode = page.querySelector("[data-banana-decode]");
    const lightbox = page.querySelector("[data-banana-lightbox]");
    const lightboxImage = page.querySelector("[data-lightbox-image]");
    const lightboxCaption = page.querySelector("[data-lightbox-caption]");
    const lightboxClose = page.querySelector("[data-lightbox-close]");

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

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    async function loadTasks() {
        try {
            const response = await fetch(cvUrl("/static/assets/data/vision_banana_tasks.json"), { cache: "no-store" });
            if (!response.ok) return fallbackTasks;
            const data = await response.json();
            return Array.isArray(data) && data.length ? data : fallbackTasks;
        } catch (_error) {
            return fallbackTasks;
        }
    }

    function renderPrompt(task) {
        if (!promptNode) return;
        let html = escapeHtml(task.prompt);
        const keywords = [...(task.keywords || [])].sort((a, b) => b.length - a.length);
        keywords.forEach((keyword) => {
            const safeKeyword = escapeHtml(keyword);
            const regex = new RegExp(escapeRegExp(safeKeyword), "gi");
            html = html.replace(regex, (match) => `<span class="prompt-keyword">${match}</span>`);
        });
        promptNode.innerHTML = html;

        promptNode.querySelectorAll(".prompt-keyword").forEach((node, index) => {
            window.setTimeout(() => node.classList.add("is-active"), 70 * index);
        });
    }

    function clearTaskClasses(tasks) {
        if (!output) return;
        tasks.forEach((task) => output.classList.remove(`is-task-${task.id}`));
    }

    function activateTask(task, tasks) {
        if (!task) return;

        tabRoot?.querySelectorAll("button").forEach((button) => {
            const isActive = button.dataset.taskId === task.id;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-checked", String(isActive));
        });

        clearTaskClasses(tasks);
        output?.classList.add("is-switching", `is-task-${task.id}`);
        window.setTimeout(() => output?.classList.remove("is-switching"), 520);

        if (currentTask) currentTask.textContent = task.label;
        if (rgbTitle) rgbTitle.textContent = task.rgbTitle;
        if (decodeTitle) decodeTitle.textContent = task.decodeTitle;
        if (decodeNode) decodeNode.textContent = task.decode;
        renderPrompt(task);
    }

    function renderTabs(tasks) {
        if (!tabRoot) return;
        tabRoot.innerHTML = "";
        tasks.forEach((task, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.taskId = task.id;
            button.setAttribute("role", "radio");
            button.setAttribute("aria-checked", String(index === 0));
            button.innerHTML = `<strong>${task.label}</strong><small>${task.rgbTitle}</small>`;
            button.addEventListener("click", () => activateTask(task, tasks));
            tabRoot.appendChild(button);
        });
    }

    function openLightbox(src, title) {
        if (!lightbox || !lightboxImage || !lightboxCaption) return;
        lightboxImage.src = src;
        lightboxImage.alt = title;
        lightboxCaption.textContent = `${title} · arXiv:2604.20329v1`;
        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
        if (!lightbox || !lightboxImage) return;
        lightbox.classList.remove("is-open");
        lightbox.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        window.setTimeout(() => {
            if (!lightbox.classList.contains("is-open")) lightboxImage.removeAttribute("src");
        }, 220);
    }

    function setupLightbox() {
        page.querySelectorAll("[data-lightbox-src]").forEach((button) => {
            button.addEventListener("click", () => openLightbox(button.dataset.lightboxSrc, button.dataset.lightboxTitle || "论文图"));
        });
        lightboxClose?.addEventListener("click", closeLightbox);
        lightbox?.addEventListener("click", (event) => {
            if (event.target === lightbox) closeLightbox();
        });
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && lightbox?.classList.contains("is-open")) closeLightbox();
        });
    }

    function setupReveal() {
        const items = page.querySelectorAll("[data-reveal-section]");
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
        }, { threshold: 0.16 });
        items.forEach((item) => observer.observe(item));
    }

    loadTasks().then((tasks) => {
        renderTabs(tasks);
        activateTask(tasks[0], tasks);
        setupLightbox();
        setupReveal();
    });
}());
