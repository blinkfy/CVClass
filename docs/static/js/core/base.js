(function () {
    window.cvclassUrl = function cvclassUrl(path) {
        const basePath = window.CVCLASS_BASE_PATH || "";
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        // 避免双重前缀：若路径已含 basePath 则直接返回
        if (basePath && normalizedPath.startsWith(basePath + "/")) return normalizedPath;
        return `${basePath}${normalizedPath}`;
    };

    (function routeLegacyHashEntry() {
        const hash = window.location.hash || "";
        const match = hash.match(/^#\/principles(?:\/([^?]+))?/);
        if (!match) return;
        const anchor = match[1] ? `#${encodeURIComponent(decodeURIComponent(match[1]))}` : "";
        window.location.replace(window.cvclassUrl(`/principles${anchor}`));
    })();

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
        grayscale: ["image-basic", "level-01-image-basic", "level-02-color-space", "level-03-threshold", "level-04-histogram"],
        "convolution:visual": ["convolution-filter", "level-05-convolution"],
        "convolution:image": ["convolution-filter", "level-06-multichannel-convolution"],
        "convolution:digit": ["convolution-filter", "level-15-digit-recognition"],
        convolution: ["convolution-filter", "level-05-convolution"],
        "edge:compare": ["edge-contour", "level-07-edge-detection"],
        "edge:kernel": ["edge-contour", "level-07-edge-detection"],
        "edge:canny": ["edge-contour", "level-08-canny"],
        "edge:applications": ["edge-contour", "level-09-morphology-contour"],
        edge: ["edge-contour", "level-07-edge-detection"],
        "feature:compare": ["feature-panorama", "level-10-corner", "level-11-sift", "level-12-matching-panorama"],
        "feature:corner": ["feature-panorama", "level-10-corner"],
        "feature:sift": ["feature-panorama", "level-11-sift"],
        "feature:matching": ["feature-panorama", "level-12-matching-panorama"],
        "feature:panorama": ["feature-panorama", "level-12-matching-panorama"],
        feature: ["feature-panorama", "level-10-corner", "level-11-sift", "level-12-matching-panorama"],
        "cnn:cnn_train": ["cnn-learning", "level-13-cnn-learning"],
        "cnn:cnn_explainer": ["cnn-learning", "level-13-cnn-learning"],
        "cnn:conv_gradient_lab": ["cnn-learning", "level-13-cnn-learning"],
        cnn: ["cnn-learning", "level-13-cnn-learning"],
        "classification_lab:overview": ["classification-lab", "level-14-classification"],
        "classification_lab:classification": ["classification-lab", "level-14-classification"],
        classification_lab: ["classification-lab", "level-14-classification"],
        segmentation_basic: ["segmentation-basic"],
        "object_detection:detection": ["object-detection", "level-16-object-detection"],
        object_detection: ["object-detection", "level-16-object-detection"],
        "segmentation_lab:compare": ["semantic-segmentation", "instance-segmentation", "level-19-semantic-segmentation", "level-20-instance-segmentation"],
        "segmentation_lab:semantic": ["semantic-segmentation", "level-19-semantic-segmentation"],
        "segmentation_lab:instance": ["instance-segmentation", "level-20-instance-segmentation"],
        segmentation_lab: ["semantic-segmentation", "level-19-semantic-segmentation"],
        "human_pose:overview": ["human-pose", "level-21-pose"],
        "human_pose:skeleton": ["human-pose", "level-21-pose"],
        "human_pose:mechanism": ["human-pose", "level-21-pose"],
        "human_pose:action": ["human-pose", "level-22-action"],
        human_pose: ["human-pose", "level-21-pose", "level-22-action"],
        "geometry_vision:model": ["camera-geometry", "level-23-camera-calibration"],
        "geometry_vision:projection": ["camera-geometry", "level-23-camera-calibration"],
        "geometry_vision:calibration": ["camera-geometry", "level-23-camera-calibration"],
        geometry_vision: ["camera-geometry", "level-23-camera-calibration"],
        "motion_estimation:constraint": ["motion-estimation", "level-24-optical-flow"],
        "motion_estimation:lucas_kanade": ["motion-estimation", "level-25-lucas-kanade"],
        "motion_estimation:pyramid": ["motion-estimation", "level-24-optical-flow", "level-25-lucas-kanade"],
        motion_estimation: ["motion-estimation", "level-24-optical-flow"],
        "stereo_depth:parallel": ["stereo-depth", "level-26-stereo"],
        "stereo_depth:disparity": ["stereo-depth", "level-26-stereo"],
        "stereo_depth:block_matching": ["stereo-depth", "level-27-disparity-depth"],
        stereo_depth: ["stereo-depth", "level-26-stereo"],
        "multiview_reconstruction:epipolar": ["multiview-reconstruction", "level-28-epipolar"],
        "multiview_reconstruction:pose": ["multiview-reconstruction", "level-29-3d-reconstruction"],
        "multiview_reconstruction:triangulation": ["multiview-reconstruction", "level-30-triangulation"],
        multiview_reconstruction: ["multiview-reconstruction", "level-28-epipolar", "level-29-3d-reconstruction", "level-30-triangulation"],
        "vision_transformer:vit": ["vision-transformer", "level-31-vit-transformer"],
        "vision_transformer:dino": ["vision-transformer", "level-33-dino"],
        vision_transformer: ["vision-transformer"],
        "vision_language:clip": ["frontier-clip", "level-32-clip"],
        "vision_language:sam": ["frontier-sam", "level-34-sam"],
        "vision_language:gan": ["frontier-gan", "level-35-gan"],
        "vision_language:diffusion": ["frontier-diffusion", "level-36-diffusion"],
        "vision_language:vlm": ["frontier-vlm", "level-37-vlm"],
        "vision_language:multimodal": ["frontier-multimodal", "level-38-multimodal"],
        vision_language: ["frontier-clip", "frontier-sam", "frontier-gan", "frontier-diffusion", "frontier-vlm", "frontier-multimodal"],
        "frontier:overview": ["frontier"],
        "frontier:vision_banana": ["frontier-vision-banana", "level-39-vision-banana"],
        frontier: ["frontier"],
        principles: ["principles"],
    };
    const pathModuleMap = {
        "/object-detection": ["object-detection", "level-16-object-detection"],
        "/object-detection/yolo": ["object-detection", "level-16-object-detection", "level-17-yolo-postprocess"],
        "/object-detection/rcnn": ["object-detection", "level-16-object-detection", "level-18-rcnn"],
        "/vision-transformer": ["vision-transformer"],
        "/vision-transformer/vit": ["vision-transformer", "level-31-vit-transformer"],
        "/vision-transformer/dino": ["vision-transformer", "level-33-dino"],
        "/frontier": ["frontier"],
        "/frontier/vit": ["level-31-vit-transformer"],
        "/frontier/dino": ["level-33-dino"],
        "/frontier/clip": ["frontier-clip", "level-32-clip"],
        "/frontier/vlm": ["frontier-vlm", "level-37-vlm"],
        "/frontier/multimodal": ["frontier-multimodal", "level-38-multimodal"],
        "/frontier/vision-banana": ["frontier-vision-banana", "level-39-vision-banana"],
        "/semantic-segmentation": ["semantic-segmentation", "level-19-semantic-segmentation"],
        "/instance-segmentation": ["instance-segmentation", "level-20-instance-segmentation"],
        "/human-pose": ["human-pose", "level-21-pose"],
        "/human-pose/overview": ["human-pose", "level-21-pose"],
        "/human-pose/skeleton": ["human-pose", "level-21-pose"],
        "/human-pose/mechanism": ["human-pose", "level-21-pose"],
        "/human-pose/action": ["human-pose", "level-22-action"],
        "/camera-geometry": ["camera-geometry", "level-23-camera-calibration"],
        "/camera-geometry/model": ["camera-geometry", "level-23-camera-calibration"],
        "/camera-geometry/projection-matrix": ["camera-geometry", "level-23-camera-calibration"],
        "/camera-geometry/calibration": ["camera-geometry", "level-23-camera-calibration"],
        "/motion-estimation": ["motion-estimation", "level-24-optical-flow"],
        "/motion-estimation/flow-constraint": ["motion-estimation", "level-24-optical-flow"],
        "/motion-estimation/lucas-kanade": ["motion-estimation", "level-25-lucas-kanade"],
        "/motion-estimation/pyramid-tracking": ["motion-estimation", "level-24-optical-flow", "level-25-lucas-kanade"],
        "/stereo-depth": ["stereo-depth", "level-26-stereo"],
        "/stereo-depth/parallel": ["stereo-depth", "level-26-stereo"],
        "/stereo-depth/disparity": ["stereo-depth", "level-26-stereo"],
        "/stereo-depth/block-matching": ["stereo-depth", "level-27-disparity-depth"],
        "/multiview-reconstruction": ["multiview-reconstruction", "level-28-epipolar"],
        "/multiview-reconstruction/epipolar-geometry": ["multiview-reconstruction", "level-28-epipolar"],
        "/multiview-reconstruction/essential-pose": ["multiview-reconstruction", "level-29-3d-reconstruction"],
        "/multiview-reconstruction/triangulation": ["multiview-reconstruction", "level-30-triangulation"],
        "/generative-multimodal/sam": ["frontier-sam", "level-34-sam"],
        "/generative-multimodal/gan": ["frontier-gan", "level-35-gan"],
        "/generative-multimodal/diffusion": ["frontier-diffusion", "level-36-diffusion"],
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

    function setModuleLearned(moduleIds) {
        const ids = Array.isArray(moduleIds) ? moduleIds : [moduleIds];
        const validIds = ids.filter(Boolean);
        if (!validIds.length) return;

        const learnedModules = readLearnedModules();
        const beforeSize = learnedModules.size;
        validIds.forEach((moduleId) => learnedModules.add(moduleId));

        if (learnedModules.size !== beforeSize) {
            saveLearnedModules(learnedModules);
        }
    }

    // Auto mark as learned on page load
    (function autoMarkCurrentPage() {
        const ap = window.CVCLASS_ACTIVE_PAGE;
        const asp = window.CVCLASS_ACTIVE_SUB_PAGE;
        if (!ap) return;

        const scopedPage = asp ? `${ap}:${asp}` : "";
        const normalizedPath = window.location.pathname.replace(window.CVCLASS_BASE_PATH || "", "") || "/";
        const moduleId = pathModuleMap[normalizedPath] || activePageModuleMap[scopedPage] || activePageModuleMap[ap];

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

    {
        const ap = window.CVCLASS_ACTIVE_PAGE;
        const asp = window.CVCLASS_ACTIVE_SUB_PAGE;
        setModuleLearned(activePageModuleMap[asp ? `${ap}:${asp}` : ""] || activePageModuleMap[ap]);
    }
    renderLearnedModules();

    // 推荐学习路径联动高亮逻辑
    (function initPathSelector() {
        const pathCards = document.querySelectorAll(".path-selector-card");
        const moduleGrid = document.querySelector(".module-grid");
        const moduleCards = document.querySelectorAll(".module-card");

        if (!pathCards.length || !moduleGrid || !moduleCards.length) return;

        const pathModules = {
            classic: ["image-basic", "convolution-filter", "edge-contour", "feature-panorama", "segmentation-basic"],
            deep: ["cnn-learning", "object-detection", "semantic-segmentation", "instance-segmentation", "frontier"]
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
