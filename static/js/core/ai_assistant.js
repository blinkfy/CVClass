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
            page: (document.querySelector('.station-title')?.textContent?.trim() || '视觉识别与分割') + ' — ' + algName,
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
        
        let ctx;
        if (ap === 'edge') ctx = buildEdgeContext();
        else if (ap === 'feature') ctx = buildFeatureContext();
        else if (ap === 'cnn') ctx = buildCnnContext();
        else if (ap === 'convolution') ctx = buildConvolutionContext();
        else if (ap === 'grayscale') ctx = buildGrayscaleContext();
        else if (['vision_tasks', 'classification_lab', 'segmentation_basic', 'object_detection', 'segmentation_lab'].includes(ap)) ctx = buildVisionTasksContext();
        else {
            // 通用 Fallback：尽力抓取页面上的信息
            const pageTitle = document.title.replace(' - 计算机视觉实验平台', '').trim();
            const h1 = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ') || '';
            const h2 = document.querySelector('h2')?.textContent?.replace(/\s+/g, ' ') || '';
            const params = {};
            
            // 抓取页面上常见的可读控件
            document.querySelectorAll('input[type=range], input[type=number], select').forEach(el => {
                let name = el.id || el.name;
                if (!name && el.closest('label')) {
                    const labelText = el.closest('label').textContent.trim();
                    name = labelText.split('\n')[0].trim();
                }
                if (name) {
                    params[name] = el.value;
                }
            });

            // 尝试判断步骤或活动状态
            const activeTab = document.querySelector('.is-active, .active');
            const stepName = activeTab ? activeTab.textContent.trim() : '当前状态';

            ctx = {
                module: ap || '通用模块',
                page: h1 || pageTitle || location.pathname,
                algorithm: h2 || '通用',
                step: stepName,
                params: params,
                stats: {},
                selectedImage: ''
            };
        }

        // 无论是不是 Fallback 页面，我们都在最后统一收集并注入支持 AI 操作的互动物件
        const activeControls = {};
        let aiIdx = 0;
        document.querySelectorAll('input[type=range], input[type=number], select, button.primary-btn, button[class*="primary"]').forEach(el => {
            let name = el.id || el.name;
            if (!name && el.closest('label')) {
                name = el.closest('label').textContent.split('\n')[0].trim();
            } else if (!name && el.tagName === 'BUTTON') {
                name = el.textContent.trim();
            }
            if (!name) name = 'Control_' + aiIdx;

            // 分配一个临时的操作句柄如果它没有 ID
            let handle = el.id;
            if (!handle) {
                handle = 'ai_managed_' + aiIdx;
                el.id = handle;
            }
            aiIdx++;

            if (el.tagName === 'BUTTON') {
                activeControls[name] = { type: 'button', handle: '#' + handle };
            } else {
                activeControls[name] = { type: 'input', value: el.value, handle: '#' + handle };
            }
        });

        ctx.controls = activeControls;
        return ctx;
    }

    /* ---- 快捷操作定义 ---- */
    const ACTIONS = [
        { id: 'explain_algorithm', label: '解释当前算法', icon: '📖' },
        { id: 'analyze_params',    label: '分析当前参数', icon: '🔧' },
        { id: 'diagnose_result',   label: '诊断当前结果', icon: '🩺' },
        { id: 'video_script',      label: '生成本页讲解稿', icon: '🎬' },
        { id: 'report_text',       label: '生成报告描述', icon: '📝' },
    ];

    /* ---- 辅助功能 ---- */
    async function captureScreenshot() {
        if (!window.html2canvas) return '';
        try {
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                scale: window.devicePixelRatio > 1 ? 1 : 1 // restrict scale to save bandwidth
            });

            // Using jpeg to keep size small
            return canvas.toDataURL('image/jpeg', 0.6);
        } catch (e) {
            console.error('Screenshot capture failed', e);
            return '';
        }
    }

    /* ---- DOM 构建 ---- */
    function buildUI() {
        // FAB 按钮
        const fab = document.createElement('button');
        fab.className = 'ai-assistant-fab';
        fab.id = 'aiAssistantFab';
        fab.type = 'button';
        fab.setAttribute('aria-label', '打开 AI 学习助手');
        fab.innerHTML = `<span class="ai-fab-icon"><img src="${BASE}/static/assets/img/ai.png" alt="" aria-hidden="true"></span><span class="ai-fab-text">AI 助手</span>`;

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
                    <span class="ai-header-icon"><img src="${BASE}/static/assets/img/ai.png" alt="" aria-hidden="true"></span>
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
    function processAiControls(rawText, executedCommandsSet) {
        // Parse complete lines only so normal prose is never swallowed by command cleanup.
        const lines = rawText.split(/\r?\n/);
        const renderedLines = [];
        const commandLines = [];

        const setParamLineRegex = /^\s*(?:[-*•]\s*)?\[?SET_PARAM:\s*([^\s\|\]]+)\s*\|\s*([^\]\n]+)\]?\s*$/i;
        const setParamStartRegex = /^\s*(?:[-*•]\s*)?\[?SET_PARAM:\s*([^\s\|\]]+)\s*\|\s*$/i;
        const hlLineRegex = /^\s*(?:[-*•]\s*)?\[?H?IGHLIGHT:\s*([^\]\n]+)\]?\s*$/i;
        const navRegex = /^\s*(?:[-*•]\s*)?\[?NAVIGATE:\s*([^\]\n]+)\]?\s*$/i;
        let pendingSetParam = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isLastLine = i === lines.length - 1;
            const hasTrailingNewline = /\n$/.test(rawText);
            const isPartialCommandTail = isLastLine && !hasTrailingNewline && /^\s*(?:[-*•]\s*)?\[?(?:SET_PARAM|H?IGHLIGHT|NAVIGATE)?[:\s\|\]]*$/i.test(line);

            if (isPartialCommandTail) {
                continue;
            }

            if (pendingSetParam) {
                const valueLine = line.trim();
                const value = valueLine.replace(/^\[?/, '').replace(/\]?$/, '').trim();
                const cmdKey = `SET_PARAM:${pendingSetParam.handle}|${value}`;

                if (!executedCommandsSet || !executedCommandsSet.has(cmdKey)) {
                    executedCommandsSet?.add(cmdKey);
                    const el = document.querySelector(pendingSetParam.handle);
                    if (el) {
                        if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                            el.value = value;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));

                            const outputEl = el.parentElement?.querySelector('output');
                            if (outputEl) outputEl.textContent = value;

                            const origBorder = el.style.border;
                            const origBoxShadow = el.style.boxShadow;
                            const origTransition = el.style.transition;
                            el.style.transition = 'border 0.3s, box-shadow 0.3s';
                            el.style.border = '2px solid red';
                            el.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.6)';
                            setTimeout(() => {
                                el.style.border = origBorder;
                                el.style.boxShadow = origBoxShadow;
                                el.style.transition = origTransition;
                            }, 4000);
                        } else if (el.tagName === 'BUTTON') {
                            el.click();
                        }
                    } else {
                        console.warn(`[AI Assistant] Target element not found for SET_PARAM:`, pendingSetParam.handle);
                    }
                }

                commandLines.push(`${pendingSetParam.rawLine}\n${line}`);
                pendingSetParam = null;
                continue;
            }

            const setMatch = line.match(setParamLineRegex);
            if (setMatch) {
                const handle = setMatch[1].trim();
                const val = setMatch[2].trim();
                const cmdKey = `SET_PARAM:${handle}|${val}`;

                if (!executedCommandsSet || !executedCommandsSet.has(cmdKey)) {
                    executedCommandsSet?.add(cmdKey);
                    const el = document.querySelector(handle);
                    if (el) {
                        if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                            el.value = val;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));

                            const outputEl = el.parentElement?.querySelector('output');
                            if (outputEl) outputEl.textContent = val;

                            const origBorder = el.style.border;
                            const origBoxShadow = el.style.boxShadow;
                            const origTransition = el.style.transition;
                            el.style.transition = 'border 0.3s, box-shadow 0.3s';
                            el.style.border = '2px solid red';
                            el.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.6)';
                            setTimeout(() => {
                                el.style.border = origBorder;
                                el.style.boxShadow = origBoxShadow;
                                el.style.transition = origTransition;
                            }, 2000);
                        } else if (el.tagName === 'BUTTON') {
                            el.click();
                        }
                    } else {
                        console.warn(`[AI Assistant] Target element not found for SET_PARAM:`, handle);
                    }
                }

                commandLines.push(line);
                continue;
            }

            const setStartMatch = line.match(setParamStartRegex);
            if (setStartMatch) {
                pendingSetParam = {
                    handle: setStartMatch[1].trim(),
                    rawLine: line,
                };
                continue;
            }

            const hlMatch = line.match(hlLineRegex);
            if (hlMatch) {
                const handle = hlMatch[1].trim();
                const cmdKey = `HIGHLIGHT:${handle}`;

                if (!executedCommandsSet || !executedCommandsSet.has(cmdKey)) {
                    executedCommandsSet?.add(cmdKey);
                    const el = document.querySelector(handle);
                    if (el) {
                        const originalBorder = el.style.border;
                        const originalTransition = el.style.transition;
                        const originalBoxShadow = el.style.boxShadow;
                        el.style.transition = 'border 0.3s, box-shadow 0.3s';
                        el.style.border = '2px solid red';
                        el.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.6)';
                        setTimeout(() => {
                            el.style.border = originalBorder;
                            el.style.boxShadow = originalBoxShadow;
                            el.style.transition = originalTransition;
                        }, 4000);
                    } else {
                        console.warn(`[AI Assistant] Target element not found for HIGHLIGHT:`, handle);
                    }
                }

                commandLines.push(line);
                continue;
            }

            const navMatch = line.match(navRegex);
            if (navMatch) {
                const path = navMatch[1].trim();
                const cmdKey = `NAVIGATE:${path}`;
                if (!executedCommandsSet || !executedCommandsSet.has(cmdKey)) {
                    executedCommandsSet?.add(cmdKey);
                    // 稍微延迟一下以防画面突变，体验更好
                    setTimeout(() => {
                        window.location.href = path;
                    }, 500); 
                }
                commandLines.push(line);
                continue;
            }

            renderedLines.push(line);
        }

        const renderedText = renderedLines.join('\n').replace(/\s+$/g, '');
        return {
            text: renderedText,
            hasCommands: commandLines.length > 0,
            commandCount: commandLines.length,
        };
    }

    function appendMessage(role, text) {
        const area = document.getElementById('aiChatArea');
        if (!area) return;
        const bubble = document.createElement('div');
        
        if (role === 'ai') {
            bubble.className = 'ai-message markdown-body';
            
            // Keep track of executed commands for this bubble
            bubble.executedCommands = new Set();
            
            const result = processAiControls(text, bubble.executedCommands);
            const cleanText = result.text || (result.hasCommands ? '已执行页面操作。' : '');
            bubble.dataset.raw = cleanText;
            bubble.innerHTML = window.marked ? marked.parse(cleanText) : cleanText;
        } else {
            bubble.className = 'user-message';
            bubble.textContent = text;
        }
        
        area.appendChild(bubble);
        area.scrollTop = area.scrollHeight;
        return bubble;
    }

    function updateAiMessage(bubble, rawChunk) {
        if (!bubble) return;
        
        const fullRaw = (bubble.dataset.fullRaw || '') + rawChunk;
        bubble.dataset.fullRaw = fullRaw;
        
        const result = processAiControls(fullRaw, bubble.executedCommands);
        const cleanText = result.text || (result.hasCommands ? '已执行页面操作。' : '');
        bubble.dataset.raw = cleanText; // for debugging if needed
        bubble.innerHTML = window.marked ? marked.parse(cleanText) : cleanText;
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
    async function streamApi(question, action, onChunk) {
        const ctx = getContext();
        
        // 如果是要执行视觉分析或者全局发送，截取当前页面：
        // 这会使得携带截图发送给大模型，供 Qwen-VL 等多模态大模型分析
        const screenshotBox = document.getElementById('aiScreenshotPreview');
        if (screenshotBox && screenshotBox.dataset.image) {
            ctx.selectedImage = screenshotBox.dataset.image;
        }

        const body = { question, context: ctx, action };
        try {
            const resp = await fetch(`${BASE}/api/ai-assistant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            
            if (resp.headers.get('content-type')?.includes('application/json')) {
                const data = await resp.json();
                return { ok: false, answer: data.message || '未知错误' };
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保持最后可能不完整的一行

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6).trim();
                        if (dataStr === '[DONE]') {
                            return { ok: true };
                        }
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.error) {
                                return { ok: false, answer: data.error };
                            }
                            if (data.content) {
                                onChunk(data.content);
                            }
                        } catch (e) {
                            console.error('SSE JSON parse error:', e, dataStr);
                        }
                    }
                }
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, answer: '网络错误，无法连接 AI 助手服务。' };
        }
    }

    /* ---- 主逻辑 ---- */
    function init() {
        const { fab, overlay, drawer } = buildUI();
        let isOpen = false;
        let busy = false;

        async function open() {
            isOpen = true;
            fab.classList.add('hide');
            renderContextCard(getContext());
            renderActions(handleAction);
            await mountScreenshotUI();

            // 先截图（此时 drawer 尚未打开，截图干净且不会闪烁）
            const preview = document.getElementById('aiScreenshotPreview');
            if (preview && !preview.dataset.image) {
                const btn = document.getElementById('aiTakeScreenshotBtn');
                if (btn) {
                    btn.textContent = '⏳ 正在截取...';
                    btn.disabled = true;
                }
                const base64Img = await captureScreenshot();
                if (btn) {
                    btn.textContent = '📷 重新截取本页';
                    btn.disabled = false;
                }
                if (base64Img) {
                    preview.dataset.image = base64Img;
                    preview.querySelector('img').src = base64Img;
                    preview.style.display = 'inline-block';
                    if (btn) btn.style.display = 'none';
                }
            }

            // 截图完成后再丝滑打开抽屉
            drawer.classList.add('open');
            overlay.hidden = false;
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

        async function submitQuestion(q) {
            if (!q || busy) return;
            busy = true;
            appendMessage('user', q);
            const input = document.getElementById('aiInput');
            if (input) input.value = '';
            
            const loading = appendLoading();
            let aiBubble = null;

            const res = await streamApi(q, 'free_chat', (chunk) => {
                if (loading && loading.parentNode) {
                    removeElement(loading);
                }
                if (!aiBubble) {
                    aiBubble = appendMessage('ai', chunk);
                } else {
                    updateAiMessage(aiBubble, chunk);
                    const area = document.getElementById('aiChatArea');
                    if (area) area.scrollTop = area.scrollHeight;
                }
            });

            if (loading && loading.parentNode) {
                removeElement(loading);
            }
            if (!res.ok) {
                const errText = `⚠️ **服务回复错误**\n\n${res.answer}`;
                if (!aiBubble) {
                    appendMessage('ai', errText);
                } else {
                    updateAiMessage(aiBubble, '\n\n' + errText);
                }
            }
            busy = false;
            if (input) input.focus();
        }

        async function mountScreenshotUI() {
            let container = document.getElementById('aiScreenshotContainer');
            if (!container) {
                const header = document.querySelector('.ai-assistant-header');
                if (!header) return;
                
                container = document.createElement('div');
                container.id = 'aiScreenshotContainer';
                container.innerHTML = `
                    <button type="button" id="aiTakeScreenshotBtn" style="display: inline-block; font-size: 0.8rem; background: var(--cv-gray-200); border:none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                        📷 重新截取本页
                    </button>
                    <div id="aiScreenshotPreview" style="display: none; margin-top: 5px; position: relative;">
                        <img src="" style="max-height: 80px; border-radius: 4px; border: 1px solid var(--cv-gray-300);" />
                        <button type="button" class="remove-screenshot" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 16px; height: 16px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
                    </div>
                `;
                header.parentNode.insertBefore(container, header.nextSibling);

                document.getElementById('aiTakeScreenshotBtn').addEventListener('click', async function() {
                    const originalBtnStyle = this.style.display;
                    this.style.display = 'inline-block';
                    this.textContent = '⏳ 正在截取...';
                    this.disabled = true;
                    
                    // Temporarily hide the drawer content so that screenshot captures the actual page nicely
                    const drawer = document.getElementById('aiAssistantDrawer');
                    const overlay = document.getElementById('aiAssistantOverlay');
                    const drawerDisplay = drawer ? drawer.style.display : '';
                    if (drawer) drawer.style.display = 'none';
                    if (overlay) overlay.style.display = 'none';
                    
                    // Wait a tiny bit for the browser to reflow
                    await new Promise(r => setTimeout(r, 50));
                    
                    const base64Img = await captureScreenshot();
                    
                    if (drawer) drawer.style.display = drawerDisplay;
                    if (overlay) overlay.style.display = '';

                    this.textContent = '📷 重新截取本页';
                    this.disabled = false;

                    if (base64Img) {
                        const preview = document.getElementById('aiScreenshotPreview');
                        preview.dataset.image = base64Img;
                        preview.querySelector('img').src = base64Img;
                        preview.style.display = 'inline-block';
                        this.style.display = 'none';
                    } else {
                        console.error('截屏失败或浏览器不支持');
                    }
                });

                container.querySelector('.remove-screenshot').addEventListener('click', function() {
                    const preview = document.getElementById('aiScreenshotPreview');
                    preview.dataset.image = '';
                    preview.querySelector('img').src = '';
                    preview.style.display = 'none';
                    document.getElementById('aiTakeScreenshotBtn').style.display = 'inline-block';
                });
            }
        }

        async function handleAction(actionId, label) {
            if (busy) return;
            busy = true;
            appendMessage('user', `[快捷指令] ${label}`);
            
            const loading = appendLoading();
            let aiBubble = null;

            const res = await streamApi('', actionId, (chunk) => {
                if (loading && loading.parentNode) {
                    removeElement(loading);
                }
                if (!aiBubble) {
                    aiBubble = appendMessage('ai', chunk);
                } else {
                    updateAiMessage(aiBubble, chunk);
                    const area = document.getElementById('aiChatArea');
                    if (area) area.scrollTop = area.scrollHeight;
                }
            });

            if (loading && loading.parentNode) {
                removeElement(loading);
            }
            if (!res.ok) {
                const errText = `⚠️ **指令执行错误**\n\n${res.answer}`;
                if (!aiBubble) {
                    appendMessage('ai', errText);
                } else {
                    updateAiMessage(aiBubble, '\n\n' + errText);
                }
            }
            busy = false;
        }

        document.getElementById('aiSendBtn')?.addEventListener('click', () => {
            const el = document.getElementById('aiInput');
            if (el) submitQuestion(el.value.trim());
        });

        document.getElementById('aiInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitQuestion(e.target.value.trim());
            }
        });
    }

    /* 页面加载后初始化 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
