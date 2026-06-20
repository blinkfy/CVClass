(function () {
    window.cvclassUrl = function cvclassUrl(path) {
        const basePath = window.CVCLASS_BASE_PATH || "";
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return `${basePath}${normalizedPath}`;
    };

    const toggle = document.getElementById("sidebarToggle");
    const overlay = document.getElementById("sidebarOverlay");

    function setCollapsed(collapsed) {
        document.body.classList.toggle("sidebar-collapsed", collapsed);
        if (overlay) overlay.hidden = collapsed;
    }

    toggle?.addEventListener("click", () => {
        setCollapsed(!document.body.classList.contains("sidebar-collapsed"));
    });

    overlay?.addEventListener("click", () => setCollapsed(true));

    const LEARNED_MODULES_KEY = "cvclass.learnedModules";
    const activePageModuleMap = {
        grayscale: "image-basic",
        convolution: "convolution-filter",
        edge: "edge-contour",
        feature: "feature-panorama",
        cnn: "cnn-learning",
        classification_lab: "classification-lab",
        segmentation_basic: "segmentation-basic",
        object_detection: "object-detection",
        segmentation_lab: "segmentation-lab",
        frontier: "frontier",
    };

    function readLearnedModules() {
        try {
            const savedModules = JSON.parse(localStorage.getItem(LEARNED_MODULES_KEY) || "[]");
            return new Set(Array.isArray(savedModules) ? savedModules : []);
        } catch (_error) {
            return new Set();
        }
    }

    function saveLearnedModules(modules) {
        localStorage.setItem(LEARNED_MODULES_KEY, JSON.stringify([...modules]));
    }

    function setModuleLearned(moduleId) {
        if (!moduleId) return;
        const learnedModules = readLearnedModules();
        if (learnedModules.has(moduleId)) return;
        learnedModules.add(moduleId);
        saveLearnedModules(learnedModules);
    }

    // Auto mark as learned on page load
    (function autoMarkCurrentPage() {
        const ap = window.CVCLASS_ACTIVE_PAGE;
        const asp = window.CVCLASS_ACTIVE_SUB_PAGE;
        if (!ap) return;

        let moduleId = activePageModuleMap[ap];
        if (!moduleId && asp) {
            moduleId = activePageModuleMap[`${ap}:${asp}`];
        }

        if (moduleId) {
            setModuleLearned(moduleId);
        }
    })();

    function renderLearnedModules() {
        const learnedModules = readLearnedModules();

        document.querySelectorAll("[data-learn-module]").forEach((card) => {
            const moduleId = card.dataset.learnModule;
            const isLearned = learnedModules.has(moduleId);
            const status = card.querySelector(".module-status");

            card.classList.toggle("module-card--learned", isLearned);

            if (status) {
                status.textContent = isLearned ? "已学习" : "待学习";
                status.classList.toggle("module-status--done", isLearned);
                status.classList.toggle("module-status--pending", !isLearned);
            }
        });
    }

    renderLearnedModules();

    document.querySelectorAll("[data-learn-module]").forEach((card) => {
        const link = card.querySelector("a[data-learn-link]");
        if (!link) return;

        card.classList.add("module-card--clickable");
        card.setAttribute("role", "link");
        card.tabIndex = 0;

        function openModule() {
            window.location.href = link.href;
        }

        card.addEventListener("click", (event) => {
            if (event.target.closest("a, button")) return;
            openModule();
        });

        card.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openModule();
        });
    });

    setModuleLearned(activePageModuleMap[window.CVCLASS_ACTIVE_PAGE]);
    renderLearnedModules();

    // 推荐学习路径联动高亮逻辑
    (function initPathSelector() {
        const pathCards = document.querySelectorAll(".path-selector-card");
        const moduleGrid = document.querySelector(".module-grid");
        const moduleCards = document.querySelectorAll(".module-card");

        if (!pathCards.length || !moduleGrid || !moduleCards.length) return;

        const pathModules = {
            classic: ["image-basic", "convolution-filter", "edge-contour", "feature-panorama", "segmentation-basic"],
            deep: ["cnn-learning", "classification-lab", "object-detection", "segmentation-lab", "frontier"]
        };

        pathCards.forEach((card) => {
            card.addEventListener("click", () => {
                const filter = card.dataset.pathFilter;
                const color = card.dataset.pathColor;
                const isActive = card.classList.contains("is-active");

                // 清除所有激活状态
                pathCards.forEach((c) => {
                    c.classList.remove("is-active");
                    c.querySelector(".path-selector-status").textContent = "点击激活";
                });
                moduleGrid.classList.remove("has-active-path");
                moduleGrid.style.removeProperty("--highlight-color");
                moduleGrid.style.removeProperty("--highlight-shadow");
                moduleCards.forEach((mc) => mc.classList.remove("is-path-highlight"));

                if (!isActive) {
                    // 激活当前路径
                    card.classList.add("is-active");
                    card.querySelector(".path-selector-status").textContent = "已激活";
                    moduleGrid.classList.add("has-active-path");

                    // 设置高亮颜色变量
                    if (color === "blue") {
                        moduleGrid.style.setProperty("--highlight-color", "#2563eb");
                        moduleGrid.style.setProperty("--highlight-shadow", "rgba(37, 99, 235, 0.12)");
                    } else if (color === "purple") {
                        moduleGrid.style.setProperty("--highlight-color", "#7c3aed");
                        moduleGrid.style.setProperty("--highlight-shadow", "rgba(124, 58, 237, 0.12)");
                    }

                    // 高亮对应模块
                    const activeModules = pathModules[filter] || [];
                    moduleCards.forEach((mc) => {
                        const moduleId = mc.dataset.learnModule;
                        if (activeModules.includes(moduleId)) {
                            mc.classList.add("is-path-highlight");
                        }
                    });
                }
            });
        });

        // 点击空白处取消激活
        document.addEventListener("click", (event) => {
            if (!event.target.closest(".path-selector-card") && !event.target.closest(".module-card")) {
                pathCards.forEach((c) => {
                    c.classList.remove("is-active");
                    c.querySelector(".path-selector-status").textContent = "点击激活";
                });
                moduleGrid.classList.remove("has-active-path");
                moduleGrid.style.removeProperty("--highlight-color");
                moduleGrid.style.removeProperty("--highlight-shadow");
                moduleCards.forEach((mc) => mc.classList.remove("is-path-highlight"));
            }
        });
    }());

    window.addEventListener("storage", (event) => {
        if (event.key === LEARNED_MODULES_KEY) renderLearnedModules();
    });
}());
