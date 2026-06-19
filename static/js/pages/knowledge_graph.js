(function () {
    const page = document.querySelector(".knowledge-graph-page");
    if (!page) return;

    const chartElement = document.getElementById("knowledgeGraphChart");
    const chartShell = document.getElementById("kgChartShell");
    const loading = document.getElementById("kgLoading");
    const viewTitle = document.getElementById("kgViewTitle");
    const breadcrumb = document.getElementById("kgBreadcrumb");
    const stats = document.getElementById("kgStats");
    const fullHint = document.getElementById("kgFullHint");
    const backButton = document.getElementById("kgBackButton");
    const rootButton = document.getElementById("kgRootButton");
    const fullButton = document.getElementById("kgFullButton");
    const detailBadge = document.getElementById("kgDetailBadge");
    const infoTitle = document.getElementById("kgInfoTitle");
    const infoDescription = document.getElementById("kgInfoDescription");
    const infoType = document.getElementById("kgInfoType");
    const infoCategory = document.getElementById("kgInfoCategory");
    const infoStatus = document.getElementById("kgInfoStatus");
    const infoViewId = document.getElementById("kgInfoViewId");
    const infoModules = document.getElementById("kgInfoModules");
    const metricNodes = document.getElementById("kgMetricNodes");
    const metricLinks = document.getElementById("kgMetricLinks");
    const metricDrillable = document.getElementById("kgMetricDrillable");
    const metricEnterable = document.getElementById("kgMetricEnterable");
    const enterButton = document.getElementById("kgEnterButton");
    const drillButton = document.getElementById("kgDrillButton");
    const panelFullButton = document.getElementById("kgPanelFullButton");
    const planBadge = document.getElementById("kgPlanBadge");

    const FULL_VIEW_ID = "full_legacy_graph";
    const ROUTE_ALIASES = {
        "/image-basics": "/grayscale",
        "/convolution-filtering": "/convolution",
        "/edge-structure": "/edge-detection",
        "/feature-geometry": "/feature-detection",
        "/cnn-learning": "/cnn-visualization",
    };
    const ROUTE_MODULE_LABELS = {
        "/grayscale": "图像基础",
        "/convolution": "卷积可视化",
        "/image-convolution": "图像卷积应用",
        "/digit-recognition": "卷积模型应用",
        "/cnn-visualization": "CNN 前向与反向传播",
        "/cnn-explainer": "CNN 数据传播细节",
        "/conv-gradient-lab": "卷积梯度显微镜",
        "/edge-detection": "边缘方法对比",
        "/edge-detection/kernel": "边缘局部卷积响应",
        "/edge-detection/canny": "Canny 流水线",
        "/edge-detection/teed": "深度边缘检测拓展",
        "/edge-detection/applications": "边缘应用实践",
        "/feature-detection": "特征方法对比",
        "/feature-detection/corner": "角点检测",
        "/feature-detection/sift": "SIFT 特征",
        "/feature-detection/matching": "特征匹配",
        "/feature-detection/panorama": "图像拼接与全景拍照",
        "/frontier": "CV 前沿探索",
        "/frontier/vision-banana": "Vision Banana 案例",
    };
    const COMPLETED_NODE_ROUTES = {
        图像基础: "/grayscale",
        图像表示: "/grayscale",
        图像: "/grayscale",
        二值图像: "/grayscale",
        灰度图像: "/grayscale",
        彩色图像: "/grayscale",
        色彩空间: "/grayscale",
        RGB: "/grayscale",
        空间域操作: "/grayscale",
        点运算: "/grayscale",
        直方图均衡: "/grayscale",
        CLAHE: "/grayscale",
        镜像翻转: "/grayscale",
        切割缩放: "/grayscale",
        视觉前沿探索: "/frontier",
        前沿探索: "/frontier",
        统一视觉模型: "/frontier",
        VisionBanana: "/frontier/vision-banana",

        卷积与滤波: "/convolution",
        "卷积核组": "/convolution",
        "卷积核/滤波器": "/convolution",
        "卷积/滤波": "/convolution",
        卷积步长: "/convolution",
        边缘填充: "/convolution",
        Patch: "/convolution",
        Product: "/convolution",
        Sum: "/convolution",
        "Feature Map": "/convolution",
        Stride: "/convolution",
        Padding: "/convolution",
        Dilation: "/convolution",
        多通道卷积: "/convolution",
        多卷积核: "/convolution",
        "1×1 卷积": "/convolution",
        空洞卷积: "/convolution",
        降噪: "/image-convolution",
        图片增强: "/image-convolution",
        Gaussian: "/image-convolution",
        高通滤波: "/image-convolution",
        低通滤波: "/image-convolution",

        Roberts: "/edge-detection/kernel",
        Prewitt: "/edge-detection/kernel",
        Sobel: "/edge-detection/kernel",
        Scharr: "/edge-detection/kernel",
        Kirsch: "/edge-detection/kernel",
        Lapacian: "/edge-detection/kernel",
        "LoG / Marr": "/edge-detection/kernel",
        Canny: "/edge-detection/canny",
        非极大值抑制: "/edge-detection/canny",
        双阈值: "/edge-detection/canny",
        滞后连接: "/edge-detection/canny",
        "TEED / HED": "/edge-detection/teed",
        轮廓提取: "/edge-detection/applications",
        "Hough 直线": "/edge-detection/applications",
        "Hough 圆": "/edge-detection/applications",
        形态学运算: "/edge-detection/applications",
        腐蚀算法: "/edge-detection/applications",
        膨胀算法: "/edge-detection/applications",
        开运算: "/edge-detection/applications",
        闭运算: "/edge-detection/applications",
        连通域: "/edge-detection/applications",
        边缘图: "/edge-detection/compare",
        梯度幅值: "/edge-detection/kernel",
        梯度方向: "/edge-detection/kernel",

        "角点、特征与图像拼接": "/feature-detection",
        Harris: "/feature-detection/corner",
        "Shi-Tomasi": "/feature-detection/corner",
        FAST: "/feature-detection/corner",
        SIFT: "/feature-detection/sift",
        描述子: "/feature-detection/sift",
        尺度空间: "/feature-detection/sift",
        "DoG 金字塔": "/feature-detection/sift",
        主方向分配: "/feature-detection/sift",
        "128 维描述子": "/feature-detection/sift",
        "Ratio Test": "/feature-detection/matching",
        "BF Matching": "/feature-detection/matching",
        "FLANN Matching": "/feature-detection/matching",
        RANSAC: "/feature-detection/matching",
        Homography: "/feature-detection/panorama",
        Affine: "/feature-detection/matching",
        Warp: "/feature-detection/panorama",
        图像融合: "/feature-detection/panorama",
        全景拼接: "/feature-detection/panorama",
        图像拼接: "/feature-detection/panorama",
        全景拍照: "/feature-detection/panorama",

        "CNN 如何学习": "/cnn-visualization",
        卷积神经网络: "/cnn-visualization",
        LeNet: "/cnn-visualization",
        AlexNet: "/cnn-visualization",
        VGG: "/cnn-visualization",
        ResNet: "/cnn-visualization",
        池化层: "/cnn-visualization",
        全连接层: "/cnn-visualization",
        激活函数: "/cnn-visualization",
        Sigmoid: "/cnn-visualization",
        Tanh: "/cnn-visualization",
        ReLU: "/cnn-visualization",
        "Leaky ReLU": "/cnn-visualization",
        Softmax: "/cnn-visualization",
        Flatten: "/cnn-visualization",
        前向计算: "/cnn-visualization",
        反向计算: "/cnn-visualization",
        计算图: "/cnn-explainer",
        梯度: "/conv-gradient-lab",
        链式法则: "/cnn-visualization",
        梯度下降: "/conv-gradient-lab",
        优化算法: "/conv-gradient-lab",
        Adam: "/conv-gradient-lab",
        损失函数: "/cnn-visualization",
        交叉熵损失: "/cnn-visualization",
        模型参数: "/cnn-explainer",
        权值: "/cnn-explainer",
        偏置: "/cnn-explainer",
        学习率: "/conv-gradient-lab",
        批归一化: "/cnn-explainer",
        梯度爆炸: "/conv-gradient-lab",
        梯度消失: "/conv-gradient-lab",
        梯度裁剪: "/conv-gradient-lab",
        手写数字识别: "/digit-recognition",
        手写邮编识别: "/digit-recognition",
        图像分类任务: "/cnn-visualization",
    };
    const VIEW_NODE_ROUTES = {
        convolution_filtering: {
            卷积层: "/convolution",
        },
        cnn_learning: {
            卷积层: "/cnn-visualization",
        },
        full_legacy_graph: {
            卷积层: "/cnn-visualization",
        },
    };
    const UNAVAILABLE_ROUTES = new Set(["/detection", "/segmentation"]);
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

    function normalizeRoute(route) {
        if (!route || UNAVAILABLE_ROUTES.has(route)) return "";
        return ROUTE_ALIASES[route] || route;
    }

    function resolveRoute(route) {
        return resolveUrl(normalizeRoute(route));
    }

    function getNodeRawRoute(node, view) {
        if (!node) return "";
        const viewRoute = VIEW_NODE_ROUTES[view?.id]?.[node.name];
        return normalizeRoute(viewRoute || COMPLETED_NODE_ROUTES[node.name] || node.route);
    }

    function getNodeRoute(node, view) {
        return resolveUrl(getNodeRawRoute(node, view));
    }

    function getEffectiveStatus(node, view) {
        if (!node) return "reference";
        return getNodeRawRoute(node, view) ? "completed" : (node.status || "reference");
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
            const effectiveStatus = getEffectiveStatus(node, view);
            const moduleRoute = getNodeRawRoute(node, view);
            const isSelected = node.id === selectedNodeId;
            const isAdjacent = !selectedNodeId || adjacentNodes.has(node.id);
            const isFocus = node.name === focus || node.name === "计算机视觉";
            const baseSize = Number(node.symbolSize) || (full ? 18 : 38);
            const symbolSize = baseSize + (isSelected ? 8 : isFocus ? 7 : 0);
            const color = node.itemStyle?.color || category.itemColor || category.color || FALLBACK_COLORS[node.category] || "#64748b";

            return {
                ...node,
                originalStatus: node.status,
                status: effectiveStatus,
                moduleRoute,
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
        const currentStats = viewStats(view);
        viewTitle.textContent = view.focus || view.title || view.id;
        breadcrumb.textContent = viewPath(view, state.selectedNode).join(" / ");
        stats.textContent = `${currentStats.nodes} 个节点 · ${currentStats.links} 条关系`;
        backButton.disabled = state.historyStack.length === 0;
        rootButton.disabled = state.currentViewId === state.graphData.defaultView && state.historyStack.length === 0;
        fullButton.disabled = false;
        fullHint.hidden = !isFullView(view);
    }

    function updatePanel(view, node) {
        const currentNode = node || null;
        const currentStats = viewStats(view);
        const focusNode = focusNodeForView(view);
        const panelNode = currentNode || focusNode;
        const status = getEffectiveStatus(currentNode, view);
        const rawRoute = getNodeRawRoute(currentNode, view);
        const route = getNodeRoute(currentNode, view);
        const canEnter = Boolean(currentNode && status === "completed" && route);
        const canDrill = Boolean(currentNode?.drillTo);
        const category = currentNode ? getCategoryMeta(currentNode.rawCategory || currentNode.category) : null;
        const modules = Array.isArray(currentNode?.relatedModules) ? currentNode.relatedModules : [];

        metricNodes.textContent = currentStats.nodes;
        metricLinks.textContent = currentStats.links;
        metricDrillable.textContent = currentStats.drillable;
        metricEnterable.textContent = currentStats.enterable;

        detailBadge.className = "kg-status-pill";
        if (canDrill) {
            detailBadge.textContent = "可展开";
            detailBadge.classList.add("is-expandable");
        } else if (canEnter) {
            detailBadge.textContent = "可进入";
            detailBadge.classList.add("is-enterable");
        } else if (currentNode) {
            detailBadge.textContent = "规划中";
            detailBadge.classList.add("is-planned");
        } else {
            detailBadge.textContent = "浏览中";
        }

        infoTitle.textContent = currentNode ? currentNode.name : (view.title || "当前视图");
        infoDescription.textContent = currentNode
            ? (currentNode.description || "暂无节点说明。")
            : (focusNode?.description || state.graphData.description || "从机器学习到计算机视觉任务、算法与应用的层级关系图。");
        infoType.textContent = currentNode ? "节点" : "当前视图";
        infoCategory.textContent = currentNode
            ? (currentNode.categoryLabel || category?.label || currentNode.rawCategory || "-")
            : (focusNode ? (getCategoryMeta(focusNode.category).label || focusNode.category) : "root");
        infoStatus.textContent = currentNode ? (STATUS_LABELS[status] || status || "-") : "浏览中";
        infoViewId.textContent = view.id || state.currentViewId;
        infoModules.textContent = modules.length
            ? modules.join("、")
            : (canEnter ? (ROUTE_MODULE_LABELS[rawRoute] || "当前项目模块") : "暂无可进入模块");

        breadcrumb.textContent = viewPath(view, currentNode).join(" / ");

        enterButton.href = canEnter ? route : "#";
        enterButton.setAttribute("aria-disabled", canEnter ? "false" : "true");
        drillButton.disabled = !canDrill;

        if (currentNode && canDrill) {
            planBadge.textContent = "提示：该节点可继续展开，点击“展开节点”进入下一层图谱";
        } else if (currentNode && !canEnter) {
            planBadge.textContent = "提示：该节点暂无可进入模块，可继续浏览相关节点";
        } else if (currentNode && canEnter) {
            planBadge.textContent = "提示：该节点已关联实验模块，可直接进入学习";
        } else {
            planBadge.textContent = "提示：点击图谱中的节点查看详细信息";
        }
    }

    function findNode(view, nodeId) {
        if (!nodeId) return null;
        return (view.nodes || []).find((node) => node.id === nodeId) || null;
    }

    function viewPath(view, node) {
        const path = Array.isArray(view.path) && view.path.length ? [...view.path] : [view.title || view.id];
        if (node?.name && path[path.length - 1] !== node.name) path.push(node.name);
        return path;
    }

    function viewStats(view) {
        const nodes = view.nodes || [];
        return {
            nodes: nodes.length,
            links: (view.links || []).length,
            drillable: nodes.filter((node) => node.drillTo).length,
            enterable: nodes.filter((node) => getEffectiveStatus(node, view) === "completed" && getNodeRawRoute(node, view)).length,
        };
    }

    function focusNodeForView(view) {
        return (view.nodes || []).find((node) => node.name === view.focus) || null;
    }

    function findDefaultNode(view) {
        const focusNode = (view.nodes || []).find((node) => node.name === view.focus);
        if (focusNode && getNodeRawRoute(focusNode, view)) return focusNode;
        return null;
    }

    function renderView(viewId, selectedNodeId) {
        const view = getView(viewId);
        if (!view) return;

        state.currentViewId = view.id || viewId;
        state.selectedNode = findNode(view, selectedNodeId) || (!selectedNodeId ? findDefaultNode(view) : null);

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
        panelFullButton.addEventListener("click", () => switchView(FULL_VIEW_ID));
        drillButton.addEventListener("click", () => {
            if (state.selectedNode?.drillTo) switchView(state.selectedNode.drillTo);
        });
        enterButton.addEventListener("click", (event) => {
            if (enterButton.getAttribute("aria-disabled") === "true") event.preventDefault();
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
            const response = await fetch(dataUrl);
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
