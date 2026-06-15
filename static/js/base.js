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

    document.querySelectorAll("[data-learn-link]").forEach((link) => {
        link.addEventListener("click", () => {
            setModuleLearned(link.dataset.learnLink);
            renderLearnedModules();
        });
    });

    document.querySelectorAll("[data-learn-module]").forEach((card) => {
        const link = card.querySelector("a[data-learn-link]");
        if (!link) return;

        card.classList.add("module-card--clickable");
        card.setAttribute("role", "link");
        card.tabIndex = 0;

        function openModule() {
            setModuleLearned(link.dataset.learnLink);
            renderLearnedModules();
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

    window.addEventListener("storage", (event) => {
        if (event.key === LEARNED_MODULES_KEY) renderLearnedModules();
    });
}());
