(function () {
    const page = document.querySelector(".knowledge-graph-page");
    if (!page) return;

    const chartElement = document.getElementById("knowledgeGraphChart");
    const chartShell = document.getElementById("kgChartShell");
    const loading = document.getElementById("kgLoading");
    const breadcrumb = document.getElementById("kgBreadcrumb");
    const stats = document.getElementById("kgStats");
    const fullHint = document.getElementById("kgFullHint");
    const backButton = document.getElementById("kgBackButton");
    const rootButton = document.getElementById("kgRootButton");
    const fullButton = document.getElementById("kgFullButton");
    const infoTitle = document.getElementById("kgInfoTitle");
    const infoDescription = document.getElementById("kgInfoDescription");
    const infoCategory = document.getElementById("kgInfoCategory");
    const infoStatus = document.getElementById("kgInfoStatus");
    const infoModules = document.getElementById("kgInfoModules");
    const enterButton = document.getElementById("kgEnterButton");
    const drillButton = document.getElementById("kgDrillButton");
    const planBadge = document.getElementById("kgPlanBadge");

    const FULL_VIEW_ID = "full_legacy_graph";
    const ROUTE_ALIASES = {
        "/image-basics": "/grayscale",
        "/convolution-filtering": "/convolution",
        "/edge-structure": "/edge-detection",
        "/feature-geometry": "/feature-detection",
        "/cnn-learning": "/cnn-visualization",
    };
    const UNAVAILABLE_ROUTES = new Set(["/detection", "/segmentation", "/frontier"]);
    const FALLBACK_COLORS = {
        root: "#2563eb",
        machine_learning: "#4f46e5",
        cv: "#1d5cff",
        domain: "#3b82f6",
        foundation: "#60a5fa",
        filtering: "#06b6d4",
        structure: "#14b8a6",
        feature: "#6366f1",
        deep: "#7c3aed",
        detection: "#f59e0b",
        segmentation: "#22c55e",
        frontier: "#8b5cf6",
        app: "#16a34a",
        theory: "#64748b",
        method: "#22c55e",
        task: "#f97316",
        data: "#0ea5e9",
        hardware: "#64748b",
    };
    const STATUS_LABELS = {
        completed: "已完成",
        planned: "规划中",
        reference: "参考节点",
        draft: "草稿",
        pending: "待建设",
    };

    const state = {
        chart: null,
        graphData: null,
        currentViewId: "",
        historyStack: [],
        selectedNode: null,
        switchTimer: 0,
    };

    function showLoading(message) {
        if (!loading) return;
        loading.textContent = message;
        loading.hidden = false;
    }

    function hideLoading() {
        if (loading) loading.hidden = true;
    }

    function resolveUrl(path) {
        if (!path) return "";
        if (/^https?:\/\//i.test(path)) return path;
        return window.cvclassUrl ? window.cvclassUrl(path) : path;
    }

    function resolveRoute(route) {
        if (!route || UNAVAILABLE_ROUTES.has(route)) return "";
        return resolveUrl(ROUTE_ALIASES[route] || route);
    }

    function getViews() {
        return state.graphData?.views || {};
    }

    function getView(viewId) {
        return getViews()[viewId] || getViews()[state.graphData.defaultView];
    }

    function getCategoryList() {
        const categories = state.graphData?.categories;
        if (Array.isArray(categories)) return categories;
        if (categories && typeof categories === "object") {
            return Object.entries(categories).map(([name, value]) => ({ name, ...(value || {}) }));
        }
        return Object.entries(FALLBACK_COLORS).map(([name, color]) => ({ name, color, itemColor: color }));
    }

    function getCategoryMeta(categoryName) {
        return getCategoryList().find((category) => category.name === categoryName) || {
            name: categoryName || "unknown",
            label: categoryName || "未分类",
            color: FALLBACK_COLORS[categoryName] || "#64748b",
            itemColor: FALLBACK_COLORS[categoryName] || "#64748b",
        };
    }

    function categoryIndexMap() {
        const map = new Map();
        getCategoryList().forEach((category, index) => map.set(category.name, index));
        return map;
    }

    function getLinkLabel(link) {
        return link.label || link.relation || link.type || "";
    }

    function hasStableCoordinates(view) {
        return view.nodes?.length > 0 && view.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
    }

    function isFullView(view) {
        return view.id === FULL_VIEW_ID || view.nodes?.length > 120;
    }

    function selectedAdjacency(view, selectedNodeId) {
        const adjacentNodes = new Set(selectedNodeId ? [selectedNodeId] : []);
        const adjacentLinks = new Set();

        if (!selectedNodeId) return { adjacentNodes, adjacentLinks };

        (view.links || []).forEach((link, index) => {
            if (link.source === selectedNodeId || link.target === selectedNodeId) {
                adjacentLinks.add(index);
                adjacentNodes.add(link.source);
                adjacentNodes.add(link.target);
            }
        });

        return { adjacentNodes, adjacentLinks };
    }

    function mapNodes(view, selectedNodeId) {
        const categoryMap = categoryIndexMap();
        const full = isFullView(view);
        const { adjacentNodes } = selectedAdjacency(view, selectedNodeId);
        const focus = view.focus || "";

        return (view.nodes || []).map((node) => {
            const category = getCategoryMeta(node.category);
            const isSelected = node.id === selectedNodeId;
            const isAdjacent = !selectedNodeId || adjacentNodes.has(node.id);
            const isFocus = node.name === focus || node.name === "计算机视觉";
            const baseSize = Number(node.symbolSize) || (full ? 18 : 38);
            const symbolSize = baseSize + (isSelected ? 8 : isFocus ? 7 : 0);
            const color = node.itemStyle?.color || category.itemColor || category.color || FALLBACK_COLORS[node.category] || "#64748b";

            return {
                ...node,
                rawCategory: node.category,
                categoryLabel: category.label || category.name || node.category || "未分类",
                category: categoryMap.has(node.category) ? categoryMap.get(node.category) : 0,
                symbol: "circle",
                symbolSize,
                value: node.value || node.name,
                itemStyle: {
                    color,
                    borderColor: isSelected ? "#0f172a" : "rgba(255, 255, 255, 0.96)",
                    borderWidth: isSelected ? 4 : isFocus ? 3 : 2,
                    opacity: isAdjacent ? 1 : 0.25,
                    shadowBlur: isSelected || isFocus ? 16 : 8,
                    shadowColor: isSelected ? "rgba(15, 23, 42, 0.22)" : "rgba(37, 99, 235, 0.13)",
                },
                label: {
                    ...(node.label || {}),
                    show: full ? false : node.label?.show !== false,
                    formatter: "{b}",
                    position: "right",
                    color: "#0f172a",
                    fontSize: full ? 10 : 12,
                    fontWeight: isFocus ? 900 : 750,
                },
                emphasis: {
                    focus: "adjacency",
                    scale: true,
                    label: {
                        show: true,
                        color: "#0f172a",
                        fontWeight: 900,
                    },
                    itemStyle: {
                        borderColor: "#0f172a",
                        borderWidth: 4,
                        shadowBlur: 18,
                        shadowColor: "rgba(37, 99, 235, 0.24)",
                    },
                },
            };
        });
    }

    function mapLinks(view, selectedNodeId) {
        const full = isFullView(view);
        const { adjacentLinks } = selectedAdjacency(view, selectedNodeId);
        const showLabels = !full && (view.links || []).length <= 36;

        return (view.links || []).map((link, index) => {
            const isAdjacent = !selectedNodeId || adjacentLinks.has(index);
            const label = getLinkLabel(link);

            return {
                ...link,
                label: {
                    show: Boolean(label && showLabels && isAdjacent),
                    formatter: label,
                    color: "#64748b",
                    fontSize: 10,
                    fontWeight: 800,
                },
                lineStyle: {
                    color: isAdjacent ? "rgba(37, 99, 235, 0.62)" : "rgba(148, 163, 184, 0.28)",
                    width: isAdjacent ? 2.2 : 1,
                    opacity: selectedNodeId ? (isAdjacent ? 0.92 : 0.16) : 0.58,
                    curveness: full ? 0.05 : 0.08,
                },
                emphasis: {
                    label: {
                        show: Boolean(label),
                    },
                    lineStyle: {
                        color: "#1d5cff",
                        width: 3,
                        opacity: 0.95,
                    },
                },
            };
        });
    }

    function buildOption(view, selectedNodeId) {
        const full = isFullView(view);
        const useNoneLayout = !full && hasStableCoordinates(view);
        const hints = state.graphData.echartsHints || {};
        const categoryList = getCategoryList().map((category) => ({
            name: category.name,
            itemStyle: {
                color: category.itemColor || category.color || FALLBACK_COLORS[category.name] || "#64748b",
            },
        }));

        return {
            backgroundColor: "transparent",
            animation: true,
            animationDuration: hints.animationDuration || 600,
            animationDurationUpdate: hints.animationDurationUpdate || 650,
            animationEasing: hints.animationEasing || "cubicOut",
            animationEasingUpdate: hints.animationEasingUpdate || "cubicInOut",
            tooltip: {
                trigger: "item",
                confine: true,
                borderColor: "#dbeafe",
                backgroundColor: "rgba(255, 255, 255, 0.96)",
                textStyle: {
                    color: "#0f172a",
                    fontWeight: 700,
                },
                formatter(params) {
                    if (params.dataType === "edge") {
                        return getLinkLabel(params.data) || "关联关系";
                    }
                    const data = params.data || {};
                    const category = data.categoryLabel || getCategoryMeta(data.rawCategory).label;
                    return `<b>${data.name || ""}</b><br/>${category || "未分类"}<br/>${data.description || "暂无说明"}`;
                },
            },
            series: [
                {
                    type: "graph",
                    layout: useNoneLayout ? "none" : "force",
                    data: mapNodes(view, selectedNodeId),
                    links: mapLinks(view, selectedNodeId),
                    categories: categoryList,
                    roam: true,
                    draggable: true,
                    focusNodeAdjacency: true,
                    edgeSymbol: ["none", "arrow"],
                    edgeSymbolSize: [0, full ? 5 : 8],
                    zoom: full ? 0.56 : 0.92,
                    scaleLimit: {
                        min: 0.25,
                        max: 3.2,
                    },
                    force: {
                        repulsion: full ? 245 : 210,
                        gravity: full ? 0.08 : 0.055,
                        friction: 0.34,
                        edgeLength: full ? [42, 136] : [88, 180],
                        layoutAnimation: true,
                    },
                    lineStyle: {
                        color: "rgba(148, 163, 184, 0.42)",
                        width: 1.2,
                        curveness: 0.08,
                    },
                    labelLayout: {
                        hideOverlap: true,
                    },
                    emphasis: {
                        focus: "adjacency",
                    },
                },
            ],
        };
    }

    function updateToolbar(view) {
        const path = Array.isArray(view.path) && view.path.length ? view.path : [view.title || view.id];
        breadcrumb.textContent = path.join(" / ");
        stats.textContent = `${(view.nodes || []).length} 个节点 · ${(view.links || []).length} 条关系`;
        backButton.disabled = state.historyStack.length === 0;
        rootButton.disabled = state.currentViewId === state.graphData.defaultView && state.historyStack.length === 0;
        fullButton.disabled = state.currentViewId === FULL_VIEW_ID;
        fullHint.hidden = !isFullView(view);
    }

    function updatePanel(view, node) {
        const currentNode = node || null;
        const status = currentNode?.status || "reference";
        const route = resolveRoute(currentNode?.route);
        const canEnter = Boolean(currentNode && status === "completed" && route);
        const canDrill = Boolean(currentNode?.drillTo);
        const category = currentNode ? getCategoryMeta(currentNode.rawCategory || currentNode.category) : null;
        const modules = Array.isArray(currentNode?.relatedModules) ? currentNode.relatedModules : [];

        infoTitle.textContent = currentNode ? currentNode.name : (view.title || "当前视图");
        infoDescription.textContent = currentNode
            ? (currentNode.description || "暂无节点说明。")
            : (state.graphData.description || "从机器学习到计算机视觉任务、算法与应用的层级关系图。");
        infoCategory.textContent = currentNode ? (currentNode.categoryLabel || category?.label || currentNode.rawCategory || "-") : "当前视图";
        infoStatus.textContent = currentNode ? (STATUS_LABELS[status] || status || "-") : "浏览中";
        infoModules.textContent = modules.length
            ? modules.join("、")
            : (currentNode?.route && canEnter ? "当前项目模块" : "暂无可进入模块");

        enterButton.hidden = !canEnter;
        if (canEnter) enterButton.href = route;

        drillButton.hidden = !canDrill;
        drillButton.disabled = !canDrill;

        if (currentNode && canDrill) {
            planBadge.hidden = true;
        } else if (currentNode && !canEnter) {
            planBadge.hidden = false;
            planBadge.textContent = currentNode.route && status === "completed" ? "页面规划中" : "规划中";
        } else if (currentNode && canEnter) {
            planBadge.hidden = true;
        } else {
            planBadge.hidden = false;
            planBadge.textContent = "点击节点查看详情";
        }
    }

    function findNode(view, nodeId) {
        if (!nodeId) return null;
        return (view.nodes || []).find((node) => node.id === nodeId) || null;
    }

    function renderView(viewId, selectedNodeId) {
        const view = getView(viewId);
        if (!view) return;

        state.currentViewId = view.id || viewId;
        state.selectedNode = findNode(view, selectedNodeId);

        window.clearTimeout(state.switchTimer);
        chartShell.classList.add("is-switching");
        state.chart.setOption(buildOption(view, state.selectedNode?.id), false);
        updateToolbar(view);
        updatePanel(view, state.selectedNode);
        state.switchTimer = window.setTimeout(() => chartShell.classList.remove("is-switching"), 360);
    }

    function switchView(nextViewId) {
        if (!getView(nextViewId) || nextViewId === state.currentViewId) return;
        state.historyStack.push(state.currentViewId);
        renderView(nextViewId);
    }

    function goBack() {
        const previousView = state.historyStack.pop();
        if (previousView) renderView(previousView);
    }

    function goRoot() {
        state.historyStack = [];
        renderView(state.graphData.defaultView);
    }

    function bindChartEvents() {
        state.chart.on("click", (params) => {
            if (params.dataType !== "node") return;
            const node = params.data || {};
            if (node.drillTo) {
                switchView(node.drillTo);
                return;
            }
            renderView(state.currentViewId, node.id);
        });
    }

    function bindControls() {
        backButton.addEventListener("click", goBack);
        rootButton.addEventListener("click", goRoot);
        fullButton.addEventListener("click", () => switchView(FULL_VIEW_ID));
        drillButton.addEventListener("click", () => {
            if (state.selectedNode?.drillTo) switchView(state.selectedNode.drillTo);
        });
        window.addEventListener("resize", () => state.chart?.resize());

        if (window.ResizeObserver) {
            const observer = new ResizeObserver(() => state.chart?.resize());
            observer.observe(chartElement);
        }
    }

    async function init() {
        if (!window.echarts) {
            showLoading("ECharts 加载失败，请检查网络或本地静态资源。");
            return;
        }

        showLoading("正在加载图谱数据...");

        try {
            const dataUrl = page.dataset.graphDataUrl;
            const response = await fetch(dataUrl, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            state.graphData = await response.json();
            state.currentViewId = state.graphData.defaultView || "root";
            state.chart = echarts.init(chartElement, null, { renderer: "canvas" });

            bindChartEvents();
            bindControls();
            hideLoading();
            renderView(state.currentViewId);
        } catch (error) {
            console.error("knowledge graph load failed", error);
            showLoading("图谱数据加载失败，请确认 knowledge_graph.json 已放入 static/assets/data。");
        }
    }

    init();
}());
