(function () {
    const root = document.querySelector(".cv-quest-page");
    if (!root) return;

    const dataUrl = root.dataset.questMapUrl;
    const learnedKey = "cvclass.learnedModules";
    const statusMeta = {
        completed: { label: "已完成", className: "completed" },
        mechanism: { label: "机制演示", className: "mechanism" },
        real_inference: { label: "真实推理", className: "inference" },
        frontier_case: { label: "前沿案例", className: "frontier" },
        planned: { label: "规划中", className: "planned" },
    };
    const typeIcons = {
        matrix: "Px",
        color: "RGB",
        threshold: "T",
        hist: "Hist",
        kernel: "K",
        edge: "Ed",
        shape: "Sh",
        feature: "Ft",
        stitch: "St",
        cnn: "CNN",
        classify: "Cls",
        digit: "09",
        detect: "Box",
        segment: "Seg",
        pose: "Pose",
        video: "Vid",
        camera: "Cam",
        flow: "Flow",
        stereo: "3D",
        depth: "Dep",
        geometry: "Geo",
        reconstruct: "SfM",
        transformer: "ViT",
        multimodal: "MM",
        "self-supervised": "SSL",
        foundation: "SAM",
        generate: "Gen",
        frontier: "AI",
    };

    const state = {
        data: null,
        selectedLevelId: "",
        focusedWorldId: "",
        renderedOnce: false,
    };

    const el = {
        overviewRoute: document.getElementById("questOverviewRoute"),
        worldList: document.getElementById("questWorldList"),
        total: document.getElementById("questTotalCount"),
        completed: document.getElementById("questCompletedCount"),
        mechanism: document.getElementById("questMechanismCount"),
        inference: document.getElementById("questInferenceCount"),
        frontier: document.getElementById("questFrontierCount"),
        planned: document.getElementById("questPlannedCount"),
        worlds: document.getElementById("questWorldCount"),
        panel: document.querySelector(".cv-level-panel"),
        panelWorld: document.getElementById("levelPanelWorld"),
        panelTitle: document.getElementById("levelPanelTitle"),
        panelStatus: document.getElementById("levelPanelStatus"),
        panelDifficulty: document.getElementById("levelPanelDifficulty"),
        panelTask: document.getElementById("levelPanelTask"),
        task: document.getElementById("levelTask"),
        input: document.getElementById("levelInput"),
        compute: document.getElementById("levelCompute"),
        output: document.getElementById("levelOutput"),
        keywords: document.getElementById("levelKeywords"),
        metrics: document.getElementById("levelMetrics"),
        prerequisites: document.getElementById("levelPrerequisites"),
        enterButton: document.getElementById("levelEnterButton"),
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function readLearnedModules() {
        try {
            const value = JSON.parse(localStorage.getItem(learnedKey) || "[]");
            return new Set(Array.isArray(value) ? value : []);
        } catch (_error) {
            return new Set();
        }
    }

    function allLevels() {
        return state.data.worlds.flatMap((world) => world.levels.map((level) => ({ world, level })));
    }

    function findLevel(levelId) {
        return allLevels().find((item) => item.level.id === levelId) || allLevels()[0];
    }

    function effectiveStatus(level, learnedModules) {
        if (level.status !== "planned" && learnedModules.has(level.id)) return "completed";
        return level.status;
    }

    function getStatusMeta(status) {
        return statusMeta[status] || statusMeta.mechanism;
    }

    function formatList(items) {
        return Array.isArray(items) && items.length ? items.join(" / ") : "无";
    }

    function renderTags(items) {
        if (!Array.isArray(items) || !items.length) return "<span>无</span>";
        return items.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    }

    function resolveRoute(route) {
        if (!route) return "";
        if (/^https?:\/\//i.test(route)) return route;
        const basePath = window.CVCLASS_BASE_PATH || "";
        return `${basePath}${route}`;
    }

    function renderStats() {
        const learnedModules = readLearnedModules();
        const levels = allLevels().map((item) => item.level);
        const counts = levels.reduce((acc, level) => {
            const status = effectiveStatus(level, learnedModules);
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        el.total.textContent = levels.length;
        el.completed.textContent = counts.completed || 0;
        el.mechanism.textContent = counts.mechanism || 0;
        el.inference.textContent = counts.real_inference || 0;
        el.frontier.textContent = counts.frontier_case || 0;
        el.planned.textContent = counts.planned || 0;
        el.worlds.textContent = state.data.worlds.length;
    }

    function renderOverviewRoute() {
        const phases = state.data.overview || [];
        el.overviewRoute.innerHTML = phases.map((phase, index) => {
            const meta = getStatusMeta(phase.status);
            const next = phases[index + 1];
            const linkStatus = !next ? "" : (phase.status === "planned" || next.status === "planned" ? "planned" : "completed");
            return `
                <div class="overview-step overview-step--${meta.className} ${phase.current ? "is-current" : ""}">
                    <span>${String(index + 1).padStart(2, "0")}</span>
                    <strong>${escapeHtml(phase.label)}</strong>
                </div>
                ${next ? `<div class="overview-link overview-link--${linkStatus}" aria-hidden="true"></div>` : ""}
            `;
        }).join("");
    }

    function levelOffset(index) {
        const offsets = [10, -18, 18, -8, 12, -16, 16, -6, 14, -12, 18, -4];
        return offsets[index % offsets.length];
    }

    function linkAngle(index) {
        const delta = levelOffset(index + 1) - levelOffset(index);
        if (Math.abs(delta) < 8) return "0deg";
        return delta > 0 ? "12deg" : "-12deg";
    }

    function renderWorlds() {
        const learnedModules = readLearnedModules();
        el.worldList.innerHTML = state.data.worlds.map((world, worldIndex) => {
            const completed = world.levels.filter((level) => effectiveStatus(level, learnedModules) === "completed").length;
            const implemented = world.levels.filter((level) => level.route).length;
            const progress = Number.isFinite(world.progress) ? world.progress : Math.round((implemented / world.levels.length) * 100);

            const levelHtml = world.levels.map((level, index) => {
                const status = effectiveStatus(level, learnedModules);
                const meta = getStatusMeta(status);
                const selected = state.selectedLevelId === level.id;
                const current = level.id === state.data.defaultLevelId;
                const previous = world.levels[index - 1];
                const previousStatus = previous ? effectiveStatus(previous, learnedModules) : "";
                const linkClass = previous
                    ? [
                        "world-path-link",
                        previousStatus === "planned" || status === "planned" ? "world-path-link--planned" : "world-path-link--active",
                        previous.id === state.selectedLevelId || level.id === state.selectedLevelId ? "is-bright" : "",
                    ].filter(Boolean).join(" ")
                    : "";
                const keywords = formatList(level.keywords);

                return `
                    ${previous ? `<span class="${linkClass}" style="--link-angle:${linkAngle(index - 1)}" aria-hidden="true"></span>` : ""}
                    <button
                        class="world-level-node world-level-node--${meta.className} ${selected ? "is-selected" : ""} ${current ? "is-current" : ""} ${state.renderedOnce ? "is-revealed" : ""}"
                        type="button"
                        data-level-id="${escapeHtml(level.id)}"
                        style="--level-y:${levelOffset(index)}px; --reveal-index:${worldIndex * 8 + index};"
                        aria-pressed="${selected ? "true" : "false"}"
                    >
                        <span class="level-node-top">
                            <i class="level-icon">${escapeHtml(typeIcons[level.type] || "CV")}</i>
                            <b>${escapeHtml(level.number)}</b>
                        </span>
                        <strong>${escapeHtml(level.title)}</strong>
                        <em>${meta.label}</em>
                        <span class="level-tooltip">${escapeHtml(keywords)}</span>
                    </button>
                `;
            }).join("");

            return `
                <article
                    id="${escapeHtml(world.id)}"
                    class="cv-world-card ${state.focusedWorldId === world.id ? "is-focused" : ""} ${state.renderedOnce ? "is-revealed" : ""}"
                    style="--world-color:${escapeHtml(world.themeColor)}"
                >
                    <div class="cv-world-meta">
                        <button class="cv-world-title-button" type="button" data-world-focus="${escapeHtml(world.id)}">
                            <span>${escapeHtml(world.code)}</span>
                            <strong>${escapeHtml(world.title)}</strong>
                        </button>
                        <p>${escapeHtml(world.subtitle)}</p>
                        <div class="cv-world-progress" aria-label="${escapeHtml(world.title)} 完成度">
                            <div>
                                <span>完成度</span>
                                <strong>${completed}/${world.levels.length}</strong>
                            </div>
                            <i><b style="width:${progress}%"></b></i>
                        </div>
                        <div class="cv-world-meta-grid">
                            <span><strong>${world.levels.length}</strong> 关卡</span>
                            <span><strong>${implemented}</strong> 已有入口</span>
                            <span><strong>${world.levels.length - implemented}</strong> 规划中</span>
                        </div>
                    </div>
                    <div class="cv-world-map" tabindex="0" aria-label="${escapeHtml(world.title)} 关卡地图">
                        <div class="cv-world-track">${levelHtml}</div>
                    </div>
                </article>
            `;
        }).join("");

        el.worldList.querySelectorAll("[data-level-id]").forEach((button) => {
            button.addEventListener("click", () => selectLevel(button.dataset.levelId, true));
        });

        el.worldList.querySelectorAll("[data-world-focus]").forEach((button) => {
            button.addEventListener("click", () => focusWorld(button.dataset.worldFocus));
        });

        if (!state.renderedOnce) {
            window.requestAnimationFrame(() => {
                el.worldList.querySelectorAll(".world-level-node").forEach((button, index) => {
                    window.setTimeout(() => button.classList.add("is-revealed"), Math.min(index * 24, 760));
                });
                el.worldList.querySelectorAll(".cv-world-card").forEach((card, index) => {
                    window.setTimeout(() => card.classList.add("is-revealed"), index * 80);
                });
                state.renderedOnce = true;
            });
        }
    }

    function renderPanel() {
        const learnedModules = readLearnedModules();
        const item = findLevel(state.selectedLevelId);
        if (!item) return;

        const { world, level } = item;
        const status = effectiveStatus(level, learnedModules);
        const meta = getStatusMeta(status);
        const route = resolveRoute(level.route);
        const canEnter = Boolean(route) && status !== "planned";

        el.panel.classList.add("is-updating");
        el.panelWorld.textContent = `${world.code} / ${world.title}`;
        el.panelTitle.textContent = `${level.number} ${level.title}`;
        el.panelStatus.textContent = meta.label;
        el.panelStatus.className = `cv-level-status cv-level-status--${meta.className}`;
        el.panelDifficulty.innerHTML = Array.from({ length: 5 }, (_item, index) => (
            `<span class="${index < level.difficulty ? "is-active" : ""}">★</span>`
        )).join("");
        el.panelTask.textContent = level.task || level.subtitle || "";
        el.task.textContent = level.task || "无";
        el.input.textContent = level.input || "无";
        el.compute.textContent = level.compute || "无";
        el.output.textContent = level.output || "无";
        el.keywords.innerHTML = renderTags(level.keywords);
        el.metrics.textContent = formatList(level.metrics);
        el.prerequisites.textContent = formatList(level.prerequisites);
        el.enterButton.textContent = canEnter ? "进入模块" : "规划中";
        el.enterButton.href = canEnter ? route : "#";
        el.enterButton.classList.toggle("cv-level-enter--disabled", !canEnter);
        el.enterButton.setAttribute("aria-disabled", canEnter ? "false" : "true");

        window.setTimeout(() => el.panel.classList.remove("is-updating"), 180);
    }

    function selectLevel(levelId, scrollPanel) {
        if (!levelId || levelId === state.selectedLevelId) {
            renderPanel();
            return;
        }
        state.selectedLevelId = levelId;
        renderWorlds();
        renderPanel();

        if (scrollPanel && window.matchMedia("(max-width: 1120px)").matches) {
            el.panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function focusWorld(worldId) {
        const world = state.data.worlds.find((item) => item.id === worldId);
        if (!world) return;
        state.focusedWorldId = worldId;
        renderWorlds();
        document.getElementById(worldId)?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
            state.focusedWorldId = "";
            renderWorlds();
        }, 900);
    }

    function bindGlobalEvents() {
        el.enterButton.addEventListener("click", (event) => {
            if (el.enterButton.getAttribute("aria-disabled") === "true") event.preventDefault();
        });

        window.addEventListener("storage", (event) => {
            if (event.key !== learnedKey) return;
            renderStats();
            renderWorlds();
            renderPanel();
        });
    }

    async function init() {
        try {
            const response = await fetch(dataUrl, { cache: "no-store" });
            if (!response.ok) throw new Error(`Quest map data failed: ${response.status}`);
            state.data = await response.json();
            state.selectedLevelId = state.data.defaultLevelId || allLevels()[0]?.level.id || "";
            renderStats();
            renderOverviewRoute();
            renderWorlds();
            renderPanel();
            bindGlobalEvents();
        } catch (error) {
            console.error(error);
            el.worldList.innerHTML = "<div class=\"cv-quest-error\">学习路径数据加载失败，请刷新页面重试。</div>";
        }
    }

    init();
}());
