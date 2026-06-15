/* ==================================================================
 *  AI 学习助手 — 全局浮窗模块
 *  仅依赖原生 DOM，不引入任何前端框架
 * ================================================================== */
(function () {
    'use strict';

    const BASE = window.CVCLASS_BASE_PATH || '';

    /* ------------------------------------------------------------ */
    /*  内置页面上下文采集（通过读取 DOM 元素值，不侵入页面逻辑）      */
    /* ------------------------------------------------------------ */
    function readVal(id) {
        const el = document.getElementById(id);
        if (!el) return undefined;
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return el.value;
        return el.textContent.trim();
    }

    function buildEdgeContext() {
        const page = window.CVCLASS_ACTIVE_SUB_PAGE || 'compare';
        const algMap = { compare: '多方法对比', kernel: '算子卷积响应', canny: 'Canny 边缘检测', teed: '深度边缘检测', applications: '形态学应用' };
        const params = {};
        const stats = {};

        // 读取能找到的滑块/参数
        const th = readVal('edgeThreshold') || readVal('edgeCompareThreshold');
        if (th) params.threshold = th;
        const t1 = readVal('edgeThreshold1') || readVal('edgeCompareThreshold1');
        const t2 = readVal('edgeThreshold2') || readVal('edgeCompareThreshold2');
        if (t1) params.lowThreshold = t1;
        if (t2) params.highThreshold = t2;
        const sigma = readVal('edgeSigma');
        if (sigma) params.sigma = sigma;

        return {
            module: 'edge_contour',
            page: '边缘检测 — ' + (algMap[page] || page),
            algorithm: algMap[page] || page,
            step: page,
            params,
            stats,
            selectedImage: ''
        };
    }

    function buildFeatureContext() {
        const page = window.CVCLASS_ACTIVE_SUB_PAGE || 'compare';
        const algMap = { compare: '特征方法对比', corner: 'Harris/FAST 角点', sift: 'SIFT 特征', matching: '特征匹配', panorama: '图像拼接' };
        const params = {};
        const stats = {};

        const th = readVal('cornerThreshold') || readVal('fastThreshold');
        if (th) params.threshold = th;
        const nms = readVal('cornerNmsRadius') || readVal('fastNmsRadius');
        if (nms) params.nmsRadius = nms;
        const ratio = readVal('matchRatioThreshold');
        if (ratio) params.ratioThreshold = ratio;
        const ransac = readVal('ransacThreshold');
        if (ransac) params.ransacThreshold = ransac;

        return {
            module: 'feature_geometry',
            page: '特征检测 — ' + (algMap[page] || page),
            algorithm: algMap[page] || page,
            step: page,
            params,
            stats,
            selectedImage: ''
        };
    }

    function buildCnnContext() {
        const page = window.CVCLASS_ACTIVE_SUB_PAGE || 'cnn_train';
        const algMap = { cnn_train: 'CNN 前向/反向传播', cnn_explainer: 'CNN 数据传播细节', conv_gradient_lab: '卷积梯度显微镜' };
        const params = {};
        const stats = {};

        const lr = readVal('learningRate') || readVal('speedSlider');
        if (lr) params.learningRate = lr;
        const target = readVal('targetLabel');
        if (target) params.targetLabel = target;

        return {
            module: 'cnn_learning',
            page: 'CNN — ' + (algMap[page] || page),
            algorithm: algMap[page] || page,
            step: page,
            params,
            stats,
            selectedImage: ''
        };
    }

    function buildConvolutionContext() {
        const page = window.CVCLASS_ACTIVE_SUB_PAGE || 'visual';
        const algMap = { visual: '卷积可视化', image: '图像卷积应用', digit: '手写数字识别' };
        return {
            module: 'convolution',
            page: '卷积 — ' + (algMap[page] || page),
            algorithm: algMap[page] || page,
            step: page,
            params: {},
            stats: {},
            selectedImage: ''
        };
    }

    function buildGrayscaleContext() {
        return {
            module: 'image_basics',
            page: '图像基础：灰度化',
            algorithm: '灰度化 / 通道分离',
            step: 'grayscale',
            params: {},
            stats: {},
            selectedImage: ''
        };
    }

    function buildVisionTasksContext() {
        const sub = window.CVCLASS_ACTIVE_SUB_PAGE || 'unknown';
        const subMap = {
            'overview': '任务谱系',
            'detection': '目标检测',
            'semantic': '语义分割',
            'instance': '实例分割'
        };
        const algName = subMap[sub] || sub;
        
        const params = {};
        if (sub === 'detection') {
            const inputs = document.querySelectorAll('input[type=range]');
            if (inputs.length >= 1) params['confidence_threshold'] = inputs[0].value;
            if (inputs.length >= 2) params['iou_threshold'] = inputs[1].value;
        } else if (sub === 'semantic') {
            const el = document.querySelector('input[type=range]');
            if (el) params['mask_opacity'] = el.value;
        } else if (sub === 'instance') {
            const el = document.querySelector('input[type=range]');
            if (el) params['mask_threshold'] = el.value;
        }

        return {
            module: 'vision_tasks',
            page: '高级视觉任务 — ' + algName,
            algorithm: algName,
            step: sub,
            params: params,
            stats: {},
            selectedImage: ''
        };
    }

    /* ---- 统一入口 ---- */
    function getContext() {
        const ap = window.CVCLASS_ACTIVE_PAGE || 'unknown';
        
        if (ap === 'edge') return buildEdgeContext();
        if (ap === 'feature') return buildFeatureContext();
        if (ap === 'cnn') return buildCnnContext();
        if (ap === 'convolution') return buildConvolutionContext();
        if (ap === 'grayscale') return buildGrayscaleContext();
        if (ap === 'vision_tasks') return buildVisionTasksContext();
        
        return {
            module: ap || 'unknown',
            page: location.pathname,
            algorithm: 'unknown',
            step: 'unknown',
            params: {},
            stats: {},
            selectedImage: ''
        };
    }

    /* ---- 快捷操作定义 ---- */
    const ACTIONS = [
        { id: 'explain_algorithm', label: '解释当前算法', icon: '📖' },
        { id: 'analyze_params',    label: '分析当前参数', icon: '🔧' },
        { id: 'diagnose_result',   label: '诊断当前结果', icon: '🩺' },
        { id: 'video_script',      label: '生成本页讲解稿', icon: '🎬' },
        { id: 'report_text',       label: '生成报告描述', icon: '📝' },
    ];

    /* ---- DOM 构建 ---- */
    function buildUI() {
        // FAB 按钮
        const fab = document.createElement('button');
        fab.className = 'ai-assistant-fab';
        fab.id = 'aiAssistantFab';
        fab.type = 'button';
        fab.setAttribute('aria-label', '打开 AI 学习助手');
        fab.innerHTML = '<span class="ai-fab-icon">🤖</span><span class="ai-fab-text">AI 助手</span>';

        // 遮罩
        const overlay = document.createElement('div');
        overlay.className = 'ai-assistant-overlay';
        overlay.id = 'aiAssistantOverlay';
        overlay.hidden = true;

        // 抽屉
        const drawer = document.createElement('div');
        drawer.className = 'ai-assistant-drawer';
        drawer.id = 'aiAssistantDrawer';
        drawer.innerHTML = `
            <div class="ai-assistant-header">
                <div class="ai-header-title">
                    <span class="ai-header-icon">🤖</span>
                    <div>
                        <strong>AI 学习助手</strong>
                        <small>基于当前页面上下文</small>
                    </div>
                </div>
                <button class="ai-close-btn" id="aiCloseBtn" type="button" aria-label="关闭">✕</button>
            </div>
            <div class="ai-assistant-body" id="aiAssistantBody">
                <div class="ai-assistant-context" id="aiContextCard"></div>
                <div class="ai-assistant-actions" id="aiActions"></div>
                <div class="ai-assistant-chat" id="aiChatArea"></div>
            </div>
            <div class="ai-assistant-input">
                <input type="text" id="aiInput" placeholder="输入你的问题…" autocomplete="off" />
                <button id="aiSendBtn" type="button">发送</button>
            </div>`;

        document.body.appendChild(fab);
        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        return { fab, overlay, drawer };
    }

    /* ---- 上下文卡片渲染 ---- */
    function renderContextCard(ctx) {
        const card = document.getElementById('aiContextCard');
        if (!card) return;
        const fields = [
            ['模块', ctx.module],
            ['页面', ctx.page],
            ['算法', ctx.algorithm],
            ['步骤', ctx.step],
        ];
        const paramEntries = Object.entries(ctx.params || {});
        const statEntries = Object.entries(ctx.stats || {});

        let html = '<div class="ai-ctx-title">📌 当前上下文</div><div class="ai-ctx-grid">';
        for (const [k, v] of fields) {
            html += `<span class="ai-ctx-label">${k}</span><span class="ai-ctx-value">${v || '未获取'}</span>`;
        }
        if (paramEntries.length) {
            html += '<span class="ai-ctx-label">参数</span><span class="ai-ctx-value ai-ctx-code">';
            html += paramEntries.map(([pk, pv]) => `${pk}: ${pv}`).join(', ');
            html += '</span>';
        }
        if (statEntries.length) {
            html += '<span class="ai-ctx-label">统计</span><span class="ai-ctx-value ai-ctx-code">';
            html += statEntries.map(([sk, sv]) => `${sk}: ${sv}`).join(', ');
            html += '</span>';
        }
        html += '</div>';
        card.innerHTML = html;
    }

    /* ---- 快捷按钮渲染 ---- */
    function renderActions(onAction) {
        const container = document.getElementById('aiActions');
        if (!container) return;
        container.innerHTML = '';
        for (const a of ACTIONS) {
            const btn = document.createElement('button');
            btn.className = 'ai-action-btn';
            btn.type = 'button';
            btn.textContent = `${a.icon} ${a.label}`;
            btn.addEventListener('click', () => onAction(a.id, a.label));
            container.appendChild(btn);
        }
    }

    /* ---- 聊天区域操作 ---- */
    function appendMessage(role, text) {
        const area = document.getElementById('aiChatArea');
        if (!area) return;
        const bubble = document.createElement('div');
        bubble.className = role === 'user' ? 'user-message' : 'ai-message';
        bubble.textContent = text;
        area.appendChild(bubble);
        area.scrollTop = area.scrollHeight;
        return bubble;
    }

    function appendLoading() {
        const area = document.getElementById('aiChatArea');
        if (!area) return null;
        const el = document.createElement('div');
        el.className = 'ai-message ai-loading';
        el.innerHTML = '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>';
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
        return el;
    }

    function removeElement(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

    /* ---- API 调用 ---- */
    async function callApi(question, action) {
        const ctx = getContext();
        const body = { question, context: ctx, action };
        try {
            const resp = await fetch(`${BASE}/api/ai-assistant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await resp.json();
            if (data.success) return { ok: true, answer: data.answer };
            return { ok: false, answer: data.message || 'AI 助手返回了未知错误。' };
        } catch (err) {
            return { ok: false, answer: '网络错误，无法连接 AI 助手服务。' };
        }
    }

    /* ---- 主逻辑 ---- */
    function init() {
        const { fab, overlay, drawer } = buildUI();
        let isOpen = false;
        let busy = false;

        function open() {
            isOpen = true;
            drawer.classList.add('open');
            overlay.hidden = false;
            fab.classList.add('hide');
            renderContextCard(getContext());
        }

        function close() {
            isOpen = false;
            drawer.classList.remove('open');
            overlay.hidden = true;
            fab.classList.remove('hide');
        }

        fab.addEventListener('click', open);
        overlay.addEventListener('click', close);
        document.getElementById('aiCloseBtn').addEventListener('click', close);

        // ESC 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) close();
        });

        async function send(question, action) {
            if (busy) return;
            busy = true;
            appendMessage('user', question);
            const loading = appendLoading();
            const result = await callApi(question, action);
            removeElement(loading);
            appendMessage('ai', result.answer);
            busy = false;
        }

        // 快捷按钮
        renderActions((actionId, label) => {
            renderContextCard(getContext());
            send(label, actionId);
        });

        // 手动输入
        const input = document.getElementById('aiInput');
        const sendBtn = document.getElementById('aiSendBtn');

        function handleSend() {
            const q = input.value.trim();
            if (!q) return;
            input.value = '';
            renderContextCard(getContext());
            send(q, 'free_chat');
        }

        sendBtn.addEventListener('click', handleSend);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.isComposing) handleSend();
        });
    }

    /* 页面加载后初始化 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
