/*
 * CVClass static AI assistant
 *
 * Runs entirely in the browser and talks directly to an OpenAI-compatible
 * /chat/completions endpoint. No credential is embedded in this file.
 */
(function () {
    'use strict';

    const BASE = String(window.CVCLASS_BASE_PATH || '').replace(/\/$/, '');
    const STORAGE = {
        baseUrl: 'cvclass.ai.baseUrl',
        model: 'cvclass.ai.model',
        rememberKey: 'cvclass.ai.rememberKey',
        persistentKey: 'cvclass.ai.apiKey',
        sessionKey: 'cvclass.ai.sessionApiKey',
    };
    const ACTIONS = [
        ['解释当前算法', '请结合当前页面上下文，解释算法的核心思想、步骤和直觉。'],
        ['分析当前参数', '请分析当前页面参数的作用，并给出调参建议。'],
        ['诊断当前结果', '请根据当前页面上下文诊断可能的结果和常见问题。'],
    ];
    const history = [];
    let busy = false;
    let activeController = null;

    function loadSettings() {
        const rememberKey = localStorage.getItem(STORAGE.rememberKey) === 'true';
        return {
            baseUrl: localStorage.getItem(STORAGE.baseUrl) || '',
            model: localStorage.getItem(STORAGE.model) || '',
            rememberKey,
            apiKey: rememberKey
                ? (localStorage.getItem(STORAGE.persistentKey) || '')
                : (sessionStorage.getItem(STORAGE.sessionKey) || ''),
        };
    }

    function saveSettings(settings) {
        localStorage.setItem(STORAGE.baseUrl, settings.baseUrl);
        localStorage.setItem(STORAGE.model, settings.model);
        localStorage.setItem(STORAGE.rememberKey, String(settings.rememberKey));
        if (settings.rememberKey) {
            localStorage.setItem(STORAGE.persistentKey, settings.apiKey);
            sessionStorage.removeItem(STORAGE.sessionKey);
        } else {
            sessionStorage.setItem(STORAGE.sessionKey, settings.apiKey);
            localStorage.removeItem(STORAGE.persistentKey);
        }
    }

    function settingsReady(settings) {
        return Boolean(settings.baseUrl && settings.apiKey && settings.model);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function readControl(el) {
        const label = el.id || el.name || el.getAttribute('aria-label');
        if (!label) return null;
        return [label, el.value];
    }

    function getContext() {
        const params = {};
        document.querySelectorAll('input[type="range"], input[type="number"], select').forEach((el) => {
            const pair = readControl(el);
            if (pair) params[pair[0]] = pair[1];
        });
        return {
            module: window.CVCLASS_ACTIVE_PAGE || 'unknown',
            subPage: window.CVCLASS_ACTIVE_SUB_PAGE || '',
            title: document.title,
            heading: document.querySelector('h1')?.textContent?.trim() || '',
            path: location.pathname,
            params,
        };
    }

    function controlInventory() {
        const controls = [];
        let generated = 0;
        document.querySelectorAll('input, select, button').forEach((el) => {
            if (el.closest('#aiAssistantDrawer, #cvclassAiSettings')) return;
            if (!el.id) el.id = `ai_managed_${generated++}`;
            controls.push({
                selector: `#${CSS.escape(el.id)}`,
                type: el.tagName.toLowerCase(),
                value: 'value' in el ? el.value : undefined,
                label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 50) || el.name || el.id,
            });
        });
        return controls.slice(0, 80);
    }

    function systemPrompt() {
        return [
            '你是 CVClass 计算机视觉教学平台的学习助手。使用简洁、准确的中文回答。',
            '你会收到当前页面上下文和可操作控件。必要时可在回答末尾独占一行输出以下命令：',
            '[SET_PARAM: CSS选择器 | 值] 设置输入控件；[HIGHLIGHT: CSS选择器] 高亮元素；[NAVIGATE: 站内路径] 跳转页面。',
            '只使用上下文中确实存在的选择器，不要编造控件，不要导航到外部网站。',
        ].join('\n');
    }

    function injectStaticAssistantStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #aiAssistantDrawer .ai-close-btn {
                width: 44px; height: 44px; min-width: 44px; border-radius: 10px;
            }
            #aiAssistantDrawer .ai-close-btn:focus-visible,
            #aiAssistantDrawer button:focus-visible,
            #cvclassAiSettings button:focus-visible,
            #cvclassAiSettings input:focus-visible {
                outline: 3px solid rgba(37, 99, 235, .35); outline-offset: 2px;
            }
            #cvclassAiSettings::backdrop { background: rgba(15, 23, 42, .35); }
            .cv-ai-error-title { margin: 0 0 8px; color: #b42318; font-weight: 700; }
            .cv-ai-error-details { margin-top: 8px; color: #667085; font-size: 12px; }
            .cv-ai-error-details summary { cursor: pointer; color: #475467; }
            .cv-ai-request-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
            .cv-ai-request-actions button {
                min-height: 40px; padding: 8px 13px; border-radius: 8px;
                border: 1px solid #b9c7dc; background: #fff; color: #1d4ed8;
                font-weight: 700; cursor: pointer;
            }
            .cv-ai-request-actions button:first-child { background: #2563eb; color: #fff; border-color: #2563eb; }
            @media (max-width: 560px) {
                #aiAssistantDrawer .ai-assistant-header { padding: 8px 10px; }
                #aiAssistantDrawer .ai-header-icon,
                #aiAssistantDrawer .ai-header-icon img { width: 40px !important; height: 40px !important; }
                #cvclassAiSettings { width: calc(100vw - 24px) !important; max-height: calc(100dvh - 24px) !important; }
                #cvclassAiSettingsForm { padding: 18px !important; }
                #cvclassAiSettings button { min-height: 44px; }
            }
        `;
        document.head.appendChild(style);
    }

    function buildUi() {
        const fab = document.createElement('button');
        fab.id = 'aiAssistantFab';
        fab.className = 'ai-assistant-fab';
        fab.type = 'button';
        fab.setAttribute('aria-label', '打开 AI 学习助手');
        fab.innerHTML = `<span class="ai-fab-icon"><img src="${BASE}/static/assets/img/ai.png" alt="" aria-hidden="true"></span><span class="ai-fab-text">AI 助手</span>`;

        const overlay = document.createElement('div');
        overlay.id = 'aiAssistantOverlay';
        overlay.className = 'ai-assistant-overlay';
        overlay.hidden = true;

        // Keep a DIV here because the existing site stylesheet intentionally
        // scopes the compact header/icon rules to div#aiAssistantDrawer.
        const drawer = document.createElement('div');
        drawer.id = 'aiAssistantDrawer';
        drawer.className = 'ai-assistant-drawer';
        drawer.setAttribute('role', 'region');
        drawer.setAttribute('aria-label', 'AI 学习助手');
        drawer.innerHTML = `
            <div class="ai-assistant-header">
                <div class="ai-header-title">
                    <span class="ai-header-icon"><img src="${BASE}/static/assets/img/ai.png" alt="" aria-hidden="true"></span>
                    <div><strong>AI 学习助手</strong><small id="aiConnectionStatus">浏览器直连模型服务</small></div>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                    <button type="button" id="aiSettingsBtn" class="ai-close-btn" aria-label="设置" title="模型设置">⚙</button>
                    <button type="button" id="aiCloseBtn" class="ai-close-btn" aria-label="关闭">✕</button>
                </div>
            </div>
            <div class="ai-assistant-body" id="aiAssistantBody">
                <div class="ai-assistant-context" id="aiContextCard"></div>
                <div class="ai-assistant-actions" id="aiActions"></div>
                <div class="ai-assistant-chat" id="aiChatArea" aria-live="polite"></div>
            </div>
            <div class="ai-assistant-input">
                <input type="text" id="aiInput" placeholder="输入你的问题…" autocomplete="off">
                <button type="button" id="aiSendBtn">发送</button>
            </div>`;

        document.body.append(fab, overlay, drawer);
        return { fab, overlay, drawer };
    }

    function buildSettingsDialog() {
        const dialog = document.createElement('dialog');
        dialog.id = 'cvclassAiSettings';
        dialog.setAttribute('aria-labelledby', 'cvclassAiSettingsTitle');
        dialog.style.cssText = 'width:min(480px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:0;border-radius:14px;padding:0;box-shadow:0 20px 70px rgba(15,23,42,.3);color:#172033';
        dialog.innerHTML = `
            <form method="dialog" id="cvclassAiSettingsForm" style="padding:22px;display:grid;gap:15px;max-height:calc(100dvh - 32px);overflow:auto">
                <div>
                    <h2 id="cvclassAiSettingsTitle" style="font-size:19px;margin:0 0 5px">AI 助手设置</h2>
                    <p style="font-size:13px;margin:0;color:#667085">信息仅保存在此浏览器中，请确认模型服务允许来自本网站的跨域请求。</p>
                </div>
                <label style="display:grid;gap:6px;font-size:13px;font-weight:600">Base URL
                    <input id="cvAiBaseUrl" type="url" required placeholder="https://api.openai.com/v1" style="padding:10px;border:1px solid #ccd2dc;border-radius:8px;font:inherit">
                </label>
                <label style="display:grid;gap:6px;font-size:13px;font-weight:600">API Key
                    <input id="cvAiApiKey" type="password" required autocomplete="off" placeholder="仅保存在你的浏览器" style="padding:10px;border:1px solid #ccd2dc;border-radius:8px;font:inherit">
                </label>
                <label style="display:grid;gap:6px;font-size:13px;font-weight:600">Model
                    <input id="cvAiModel" type="text" required placeholder="gpt-4.1-mini" style="padding:10px;border:1px solid #ccd2dc;border-radius:8px;font:inherit">
                </label>
                <label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:500">
                    <input id="cvAiRememberKey" type="checkbox"> 在此设备上记住 API Key（否则仅当前标签页会话保存）
                </label>
                <div id="cvAiSettingsError" role="alert" style="display:none;color:#b42318;background:#fef3f2;padding:8px;border-radius:7px;font-size:13px"></div>
                <div style="display:flex;justify-content:flex-end;gap:8px">
                    <button value="cancel" type="button" id="cvAiSettingsCancel" style="min-height:44px;padding:9px 14px;border:1px solid #ccd2dc;background:#fff;border-radius:8px;cursor:pointer">取消</button>
                    <button value="save" type="submit" style="min-height:44px;padding:9px 14px;border:0;background:#2563eb;color:white;border-radius:8px;cursor:pointer">保存</button>
                </div>
            </form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close('cancel');
        });
        return dialog;
    }

    function openSettings(dialog) {
        const settings = loadSettings();
        dialog.querySelector('#cvAiBaseUrl').value = settings.baseUrl;
        dialog.querySelector('#cvAiApiKey').value = settings.apiKey;
        dialog.querySelector('#cvAiModel').value = settings.model;
        dialog.querySelector('#cvAiRememberKey').checked = settings.rememberKey;
        dialog.querySelector('#cvAiSettingsError').style.display = 'none';
        if (!dialog.open) dialog.showModal();
    }

    function renderContext() {
        const context = getContext();
        const card = document.getElementById('aiContextCard');
        card.innerHTML = `
            <div class="ai-ctx-title">📌 当前上下文</div>
            <div class="ai-ctx-grid">
                <span class="ai-ctx-label">页面</span><span class="ai-ctx-value">${escapeHtml(context.heading || context.title)}</span>
                <span class="ai-ctx-label">模块</span><span class="ai-ctx-value">${escapeHtml(context.module)}</span>
                <span class="ai-ctx-label">路径</span><span class="ai-ctx-value ai-ctx-code">${escapeHtml(context.path)}</span>
            </div>`;
    }

    function appendMessage(role, text, extraClass) {
        const area = document.getElementById('aiChatArea');
        const bubble = document.createElement('div');
        bubble.className = role === 'user' ? 'user-message' : `ai-message markdown-body${extraClass ? ` ${extraClass}` : ''}`;
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.textContent = text;
        area.appendChild(bubble);
        area.scrollTop = area.scrollHeight;
        return bubble;
    }

    function setStatus(text, kind) {
        const status = document.getElementById('aiConnectionStatus');
        status.textContent = text;
        status.style.color = kind === 'error' ? '#b42318' : kind === 'success' ? '#067647' : '';
    }

    function highlight(el) {
        const old = { outline: el.style.outline, shadow: el.style.boxShadow, transition: el.style.transition };
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'box-shadow .2s';
        el.style.outline = '3px solid #ef4444';
        el.style.boxShadow = '0 0 0 6px rgba(239,68,68,.18)';
        setTimeout(() => {
            el.style.outline = old.outline;
            el.style.boxShadow = old.shadow;
            el.style.transition = old.transition;
        }, 3500);
    }

    function applyCommands(rawText) {
        const visible = [];
        rawText.split(/\r?\n/).forEach((line) => {
            let match = line.match(/^\s*(?:[-*]\s*)?\[?SET_PARAM:\s*([^|\]]+)\s*\|\s*([^\]]+)\]?\s*$/i);
            if (match) {
                const el = safeQuery(match[1].trim());
                if (el) {
                    const value = match[2].trim();
                    if ('value' in el) el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    if (el.tagName === 'BUTTON') el.click();
                    highlight(el);
                }
                return;
            }
            match = line.match(/^\s*(?:[-*]\s*)?\[?HIGHLIGHT:\s*([^\]]+)\]?\s*$/i);
            if (match) {
                const el = safeQuery(match[1].trim());
                if (el) highlight(el);
                return;
            }
            match = line.match(/^\s*(?:[-*]\s*)?\[?NAVIGATE:\s*([^\]]+)\]?\s*$/i);
            if (match) {
                const target = match[1].trim();
                if (target.startsWith('/') && !target.startsWith('//')) {
                    const withBase = BASE && !target.startsWith(`${BASE}/`) ? `${BASE}${target}` : target;
                    setTimeout(() => { location.href = withBase; }, 500);
                }
                return;
            }
            visible.push(line);
        });
        return visible.join('\n').trim() || '已执行页面操作。';
    }

    function safeQuery(selector) {
        try { return document.querySelector(selector); } catch (_) { return null; }
    }

    function endpointFor(baseUrl) {
        const parsed = new URL(baseUrl.trim());
        parsed.hash = '';
        parsed.search = '';
        const clean = parsed.href.replace(/\/+$/, '');
        return /\/chat\/completions$/i.test(clean) ? clean : `${clean}/chat/completions`;
    }

    function errorMessage(error, response) {
        if (response?.status === 401 || response?.status === 403) {
            return `认证失败（HTTP ${response.status}）。请检查 API Key、模型权限和 Base URL。`;
        }
        if (response && !response.ok) return `模型服务返回 HTTP ${response.status}：${error?.message || response.statusText || '请求失败'}`;
        if (response?.ok) return `模型服务返回的内容无法解析：${error?.message || '响应格式不兼容'}`;
        if (error instanceof TypeError) {
            return '无法连接模型服务。常见原因是 Base URL 错误、网络不可达，或服务未允许本站来源的 CORS 跨域请求。';
        }
        return error?.message || '模型请求失败。';
    }

    function renderRequestError(bubble, error, response, question) {
        bubble.textContent = '';
        bubble.style.color = '';
        const title = document.createElement('p');
        title.className = 'cv-ai-error-title';
        title.textContent = '暂时无法连接模型服务，请检查连接设置后重试。';
        const details = document.createElement('details');
        details.className = 'cv-ai-error-details';
        const summary = document.createElement('summary');
        summary.textContent = '查看技术详情';
        const detailText = document.createElement('div');
        detailText.textContent = errorMessage(error, response);
        details.append(summary, detailText);
        const actions = document.createElement('div');
        actions.className = 'cv-ai-request-actions';
        const settingsButton = document.createElement('button');
        settingsButton.type = 'button';
        settingsButton.textContent = '打开设置';
        settingsButton.addEventListener('click', () => document.getElementById('aiSettingsBtn')?.click());
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.textContent = '重试';
        retryButton.addEventListener('click', () => {
            const input = document.getElementById('aiInput');
            if (input) input.value = question;
            document.getElementById('aiSendBtn')?.click();
        });
        actions.append(settingsButton, retryButton);
        bubble.append(title, details, actions);
    }

    function consumeSseEvent(event, onText) {
        const payload = event.split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
        if (!payload || payload === '[DONE]') return;
        const data = JSON.parse(payload);
        if (data.error) throw new Error(data.error.message || String(data.error));
        const content = data.choices?.[0]?.delta?.content;
        if (typeof content === 'string') onText(content);
    }

    async function readSse(response, onText) {
        if (!response.body) throw new Error('浏览器或服务不支持流式响应体。');
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || '';
            for (const event of events) consumeSseEvent(event, onText);
            if (done) {
                if (buffer.trim()) consumeSseEvent(buffer, onText);
                break;
            }
        }
    }

    async function requestCompletion(question, bubble, signal) {
        const settings = loadSettings();
        const pagePayload = JSON.stringify({ context: getContext(), controls: controlInventory() });
        const messages = [
            { role: 'system', content: systemPrompt() },
            { role: 'system', content: `当前页面信息：${pagePayload}` },
            ...history.slice(-10),
            { role: 'user', content: question },
        ];
        let response;
        try {
            response = await fetch(endpointFor(settings.baseUrl), {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${settings.apiKey}`,
                },
                body: JSON.stringify({ model: settings.model, messages, stream: true }),
                signal,
            });
            if (!response.ok) {
                let detail = '';
                try {
                    const data = await response.json();
                    detail = data.error?.message || data.message || '';
                } catch (_) { /* response may not be JSON */ }
                throw new Error(detail || response.statusText);
            }

            const contentType = response.headers.get('content-type') || '';
            let fullText = '';
            if (contentType.includes('text/event-stream')) {
                await readSse(response, (chunk) => {
                    fullText += chunk;
                    bubble.textContent = fullText;
                    bubble.parentElement.scrollTop = bubble.parentElement.scrollHeight;
                });
            } else {
                const data = await response.json();
                if (data.error) throw new Error(data.error.message || String(data.error));
                fullText = data.choices?.[0]?.message?.content || '';
            }
            if (!fullText) throw new Error('模型返回了空内容。');
            bubble.textContent = applyCommands(fullText);
            history.push({ role: 'user', content: question }, { role: 'assistant', content: fullText });
            setStatus('连接成功', 'success');
        } catch (error) {
            if (signal?.aborted) {
                const timedOut = signal.reason === 'timeout';
                bubble.textContent = timedOut ? '请求等待超过 45 秒，已自动取消。' : '已取消本次请求。';
                setStatus(timedOut ? '请求超时' : '已取消');
            } else {
                renderRequestError(bubble, error, response, question);
                setStatus('请求失败', 'error');
            }
        }
    }

    function init() {
        injectStaticAssistantStyles();
        const { fab, overlay, drawer } = buildUi();
        const dialog = buildSettingsDialog();
        const input = document.getElementById('aiInput');
        const send = document.getElementById('aiSendBtn');

        function openDrawer() {
            renderContext();
            drawer.classList.add('open');
            overlay.hidden = false;
            fab.classList.add('hide');
            if (!settingsReady(loadSettings())) openSettings(dialog);
            else input.focus();
        }

        function closeDrawer() {
            drawer.classList.remove('open');
            overlay.hidden = true;
            fab.classList.remove('hide');
        }

        async function submit(text) {
            const question = text.trim();
            if (busy) {
                activeController?.abort('user');
                return;
            }
            if (!question) return;
            if (!settingsReady(loadSettings())) {
                openSettings(dialog);
                return;
            }
            busy = true;
            send.disabled = false;
            send.textContent = '取消';
            input.disabled = true;
            appendMessage('user', question);
            input.value = '';
            const bubble = appendMessage('ai', '正在连接模型…', 'ai-loading');
            setStatus('正在请求…');
            const controller = new AbortController();
            activeController = controller;
            const timeout = window.setTimeout(() => controller.abort('timeout'), 45000);
            await requestCompletion(question, bubble, controller.signal);
            window.clearTimeout(timeout);
            activeController = null;
            bubble.classList.remove('ai-loading');
            busy = false;
            send.disabled = false;
            send.textContent = '发送';
            input.disabled = false;
            input.focus();
        }

        const actions = document.getElementById('aiActions');
        ACTIONS.forEach(([label, prompt]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ai-action-btn';
            button.textContent = label;
            button.addEventListener('click', () => submit(prompt));
            actions.appendChild(button);
        });

        dialog.querySelector('#cvclassAiSettingsForm').addEventListener('submit', (event) => {
            event.preventDefault();
            const settings = {
                baseUrl: dialog.querySelector('#cvAiBaseUrl').value.trim(),
                apiKey: dialog.querySelector('#cvAiApiKey').value.trim(),
                model: dialog.querySelector('#cvAiModel').value.trim(),
                rememberKey: dialog.querySelector('#cvAiRememberKey').checked,
            };
            const error = dialog.querySelector('#cvAiSettingsError');
            if (!settingsReady(settings)) {
                error.textContent = '请完整填写 Base URL、API Key 和 Model。';
                error.style.display = 'block';
                return;
            }
            try {
                const target = new URL(endpointFor(settings.baseUrl));
                if (!['http:', 'https:'].includes(target.protocol)) throw new Error('protocol');
            } catch (_error) {
                error.textContent = '请输入有效的 HTTP(S) Base URL。';
                error.style.display = 'block';
                return;
            }
            saveSettings(settings);
            dialog.close('save');
            setStatus('配置已保存');
            input.focus();
        });
        dialog.querySelector('#cvAiSettingsCancel').addEventListener('click', () => dialog.close('cancel'));
        fab.addEventListener('click', openDrawer);
        overlay.addEventListener('click', closeDrawer);
        document.getElementById('aiCloseBtn').addEventListener('click', closeDrawer);
        document.getElementById('aiSettingsBtn').addEventListener('click', () => openSettings(dialog));
        send.addEventListener('click', () => submit(input.value));
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                submit(input.value);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && drawer.classList.contains('open') && !dialog.open) closeDrawer();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
}());
