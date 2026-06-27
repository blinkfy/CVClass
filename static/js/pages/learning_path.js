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
    const bossLevelIds = new Set([
        "level-12-matching-panorama",
        "level-22-action",
        "level-29-3d-reconstruction",
        "level-40-unified-vision",
    ]);
    const keyLevelIds = new Set([
        "level-05-convolution",
        "level-08-canny",
        "level-12-matching-panorama",
        "level-16-object-detection",
        "level-20-instance-segmentation",
        "level-22-action",
        "level-23-camera-calibration",
        "level-26-stereo",
        "level-29-3d-reconstruction",
        "level-31-vit-transformer",
        "level-34-sam",
        "level-39-vision-banana",
        "level-40-unified-vision",
    ]);

    const state = {
        data: null,
        selectedLevelId: "",
        focusedWorldId: "",
        renderedOnce: false,
        mapViewportWidths: {},
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

    function estimateMapViewportWidth() {
        const listWidth = el.worldList?.clientWidth || root.clientWidth || window.innerWidth;
        const compact = window.matchMedia("(max-width: 820px)").matches;
        const medium = window.matchMedia("(max-width: 1440px)").matches;

        if (compact) return Math.max(0, Math.floor(listWidth - 32));

        const metaWidth = medium ? 188 : 196;
        const gap = 14;
        const cardPaddingX = 36;
        return Math.max(0, Math.floor(listWidth - metaWidth - gap - cardPaddingX));
    }

    function getWorldMapSize(world) {
        const viewportWidth = state.mapViewportWidths[world.id] || estimateMapViewportWidth();
        const minWidth = Math.max(720, world.levels.length * 70 + 84);
        const maxWidth = Math.min(1500, Math.max(1180, world.levels.length * 132 + 220));
        const overflowReserve = window.matchMedia("(max-width: 820px)").matches ? 14 : 32;
        const fittedWidth = Math.min(maxWidth, Math.max(minWidth, viewportWidth - overflowReserve));

        return {
            width: Math.round(fittedWidth),
            height: 278,
        };
    }

    function updateMeasuredMapWidths() {
        let changed = false;

        el.worldList.querySelectorAll(".cv-world-card").forEach((card) => {
            const map = card.querySelector(".cv-world-map");
            if (!map || !card.id) return;

            const width = Math.floor(map.clientWidth);
            const previous = state.mapViewportWidths[card.id] || 0;
            if (width && Math.abs(previous - width) > 2) {
                state.mapViewportWidths[card.id] = width;
                changed = true;
            }
        });

        return changed;
    }

    function getLevelPoint(index, count, size) {
        const startX = 64;
        const endX = size.width - 88;
        const span = Math.max(endX - startX, 1);
        const baseX = startX + (span * index) / Math.max(count - 1, 1);
        const drift = [0, -8, 12, -14, 14, -6, 12, -10, 8, -8, 10, 0];
        const x = Math.min(endX, Math.max(startX, baseX + drift[index % drift.length]));
        const wave = [142, 86, 154, 110, 76, 146, 104, 174, 126, 82, 158, 116];
        return { x, y: wave[index % wave.length] };
    }

    function buildSmoothSegmentPath(points, index) {
        const previous = points[Math.max(index - 1, 0)];
        const from = points[index];
        const to = points[index + 1];
        const next = points[Math.min(index + 2, points.length - 1)];
        const smooth = 0.18;
        const c1x = from.x + (to.x - previous.x) * smooth;
        const c1y = from.y + (to.y - previous.y) * smooth;
        const c2x = to.x - (next.x - from.x) * smooth;
        const c2y = to.y - (next.y - from.y) * smooth;
        return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
    }

    function buildRoutePath(points) {
        return points.slice(1).map((_point, index) => buildSmoothSegmentPath(points, index)).join(" ");
    }

    function buildBranchPath(from, to, direction) {
        const distance = to.x - from.x;
        const lift = Math.min(66, Math.max(34, Math.abs(distance) * 0.12)) * direction;
        const c1x = from.x + distance * 0.34;
        const c2x = to.x - distance * 0.34;
        return `M ${from.x} ${from.y} C ${c1x} ${from.y - lift}, ${c2x} ${to.y - lift}, ${to.x} ${to.y}`;
    }

    function renderBranchSegments(world, learnedModules, points) {
        const branchPairs = world.levels.length >= 10
            ? [[1, 3], [4, 6], [7, 9]]
            : [[1, 3], [4, 6]];

        return branchPairs
            .filter(([fromIndex, toIndex]) => points[fromIndex] && points[toIndex])
            .map(([fromIndex, toIndex], branchIndex) => {
                const fromLevel = world.levels[fromIndex];
                const toLevel = world.levels[toIndex];
                const planned = effectiveStatus(fromLevel, learnedModules) === "planned"
                    || effectiveStatus(toLevel, learnedModules) === "planned";
                const bright = fromLevel.id === state.selectedLevelId || toLevel.id === state.selectedLevelId;
                return `
                    <path
                        class="map-route-branch ${planned ? "map-route-branch--planned" : "map-route-branch--active"} ${bright ? "is-bright" : ""}"
                        d="${buildBranchPath(points[fromIndex], points[toIndex], branchIndex % 2 === 0 ? 1 : -1)}"
                    />
                `;
            }).join("");
    }

    function renderPathSegments(world, learnedModules, points) {
        return world.levels.slice(1).map((level, index) => {
            const previous = world.levels[index];
            const status = effectiveStatus(level, learnedModules);
            const previousStatus = effectiveStatus(previous, learnedModules);
            const planned = status === "planned" || previousStatus === "planned";
            const bright = previous.id === state.selectedLevelId || level.id === state.selectedLevelId;
            const d = buildSmoothSegmentPath(points, index);
            return `
                <path class="map-route-segment ${planned ? "map-route-segment--planned" : "map-route-segment--active"} ${bright ? "is-bright" : ""}" d="${d}" />
            `;
        }).join("");
    }

    function renderWorlds() {
        const learnedModules = readLearnedModules();
        el.worldList.innerHTML = state.data.worlds.map((world, worldIndex) => {
            const completed = world.levels.filter((level) => effectiveStatus(level, learnedModules) === "completed").length;
            const implemented = world.levels.filter((level) => level.route).length;
            const progress = Number.isFinite(world.progress) ? world.progress : Math.round((implemented / world.levels.length) * 100);

            const mapSize = getWorldMapSize(world);
            const points = world.levels.map((_level, index) => getLevelPoint(index, world.levels.length, mapSize));
            const levelHtml = world.levels.map((level, index) => {
                const status = effectiveStatus(level, learnedModules);
                const meta = getStatusMeta(status);
                const selected = state.selectedLevelId === level.id;
                const current = level.id === state.data.defaultLevelId;
                const keywords = formatList(level.keywords);
                const point = points[index];
                const boss = bossLevelIds.has(level.id);
                const key = keyLevelIds.has(level.id);

                return `
                    <button
                        class="world-level-node world-level-node--${meta.className} ${selected ? "is-selected" : ""} ${current ? "is-current" : ""} ${key ? "is-key" : ""} ${boss ? "is-boss" : ""} ${state.renderedOnce ? "is-revealed" : ""}"
                        type="button"
                        data-level-id="${escapeHtml(level.id)}"
                        style="--node-x:${point.x}px; --node-y:${point.y}px; --reveal-index:${worldIndex * 10 + index};"
                        aria-pressed="${selected ? "true" : "false"}"
                    >
                        <span class="level-node-marker">
                            <i class="level-icon">${escapeHtml(typeIcons[level.type] || "CV")}</i>
                            <b>${escapeHtml(level.number)}</b>
                        </span>
                        ${boss ? "<span class=\"level-boss-badge\">FINAL</span>" : ""}
                        <strong>${escapeHtml(level.title)}</strong>
                        <em>${meta.label}</em>
                        <span class="level-tooltip">${escapeHtml(keywords)}</span>
                    </button>
                `;
            }).join("");

            return `
                <article
                    id="${escapeHtml(world.id)}"
                    class="cv-world-card cv-world-card--${escapeHtml(world.id)} ${state.focusedWorldId === world.id ? "is-focused" : ""} ${state.renderedOnce ? "is-revealed" : ""}"
                    style="--world-color:${escapeHtml(world.themeColor)}"
                >
                    <div class="cv-world-meta">
                        <button class="cv-world-title-button" type="button" data-world-focus="${escapeHtml(world.id)}">
                            <span>${escapeHtml(world.code)}</span>
                            <strong>${escapeHtml(world.title)}</strong>
                        </button>
                        <p>${escapeHtml(world.subtitle)}</p>
                        <div class="cv-world-progress" aria-label="${escapeHtml(world.title)} 学习进度">
                            <div>
                                <span>学习进度</span>
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
                        <div class="cv-world-track" style="width:${mapSize.width}px;height:${mapSize.height}px;">
                            <svg class="world-route-svg" viewBox="0 0 ${mapSize.width} ${mapSize.height}" aria-hidden="true" focusable="false">
                                <path class="map-route-base" d="${buildRoutePath(points)}" />
                                ${renderBranchSegments(world, learnedModules, points)}
                                ${renderPathSegments(world, learnedModules, points)}
                            </svg>
                            ${levelHtml}
                        </div>
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

        window.requestAnimationFrame(() => {
            if (updateMeasuredMapWidths()) {
                renderWorlds();
                return;
            }

            if (!state.renderedOnce) {
                el.worldList.querySelectorAll(".world-level-node").forEach((button, index) => {
                    window.setTimeout(() => button.classList.add("is-revealed"), Math.min(index * 24, 760));
                });
                el.worldList.querySelectorAll(".cv-world-card").forEach((card, index) => {
                    window.setTimeout(() => card.classList.add("is-revealed"), index * 80);
                });
                state.renderedOnce = true;
            }
        });
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
        let resizeTimer = 0;

        el.enterButton.addEventListener("click", (event) => {
            if (el.enterButton.getAttribute("aria-disabled") === "true") event.preventDefault();
        });

        window.addEventListener("resize", () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                state.mapViewportWidths = {};
                renderWorlds();
            }, 120);
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
