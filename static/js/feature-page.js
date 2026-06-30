(function() {
    function qs(id) {
        return document.getElementById(id);
    }

    function clearNode(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function makeEl(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function pad2(n) {
        return n < 10 ? '0' + n : '' + n;
    }

    function renderMath(root) {
        if (!window.katex || !root) return;
        root.querySelectorAll('[data-katex]').forEach(function(el) {
            katex.render(el.dataset.katex || '', el, { throwOnError: false, displayMode: false });
        });
    }

    function bindImage(image, empty, url) {
        image.onload = null;
        image.onerror = null;
        image.style.display = 'none';
        empty.style.display = 'block';
        empty.textContent = '';
        if (!url) {
            image.removeAttribute('src');
            return;
        }
        image.onload = function() {
            image.style.display = 'block';
            empty.style.display = 'none';
        };
        image.onerror = function() {
            image.style.display = 'none';
            empty.style.display = 'block';
            empty.textContent = '';
        };
        image.src = url;
        if (image.complete && image.naturalWidth) {
            image.style.display = 'block';
            empty.style.display = 'none';
        }
    }

    function stepsById(steps) {
        var map = {};
        (steps || []).forEach(function(step) {
            if (step && step.id) map[step.id] = step;
        });
        return map;
    }

    function equalizeHeights(selector) {
        var els = document.querySelectorAll(selector);
        var maxH = 0;
        els.forEach(function(el) {
            el.style.height = 'auto';
        });
        els.forEach(function(el) {
            var h = el.getBoundingClientRect().height;
            if (h > maxH) maxH = h;
        });
        els.forEach(function(el) {
            el.style.height = maxH + 'px';
        });
    }

    function refreshModuleHeights() {
        requestAnimationFrame(function() {
            equalizeHeights('.step-copy');
            equalizeHeights('.step-formula');
            equalizeHeights('.step-caption');
            equalizeHeights('.step-explain');
        });
    }

    function dispatchFeatureData(config, payload) {
        window.dispatchEvent(new CustomEvent('feature:data', {
            detail: {
                moduleKey: config.moduleKey,
                payload: payload || {}
            }
        }));
    }

    function createStepCard(config, stepId, step, index) {
        var meta = config.stepMeta[stepId] || { name: stepId, principle: '', formula: '', caption: '', explain: '' };
        var card = makeEl('article', 'step-card');
        var top = makeEl('div', 'step-top');
        top.appendChild(makeEl('h3', 'step-name', meta.name || stepId));
        top.appendChild(makeEl('span', 'step-index', pad2(index + 1)));

        var copy = makeEl('div', 'step-copy');
        copy.appendChild(top);
        copy.appendChild(makeEl('p', 'step-principle', meta.principle || meta.explain || ''));

        var visual = makeEl('div', 'step-visual');
        var imageFrame = makeEl('div', 'step-image-frame');
        var image = document.createElement('img');
        image.alt = meta.name || stepId;
        var empty = makeEl('div', 'step-empty', '');
        imageFrame.appendChild(image);
        imageFrame.appendChild(empty);
        bindImage(image, empty, step && step.image);
        visual.appendChild(imageFrame);

        var formula = makeEl('div', 'step-formula');
        formula.setAttribute('data-katex', meta.formula || '');
        visual.appendChild(formula);
        visual.appendChild(makeEl('div', 'step-caption', meta.caption || ''));
        visual.appendChild(makeEl('div', 'step-explain', meta.explain || ''));

        card.appendChild(copy);
        card.appendChild(visual);
        return card;
    }

    function createPlayback(config) {
        if (!window.FeaturePlayback || config._playback) return config._playback || null;
        config._playback = window.FeaturePlayback.create({
            canvas: qs('animCanvas'),
            stepMeta: config.stepMeta,
            stepTitle: qs('stepTitle'),
            stepPrinciple: qs('stepPrinciple'),
            progressDots: qs('progressDots'),
            progressText: qs('progressText'),
            playPauseBtn: qs('playPauseBtn'),
            stepBackBtn: qs('stepBackBtn'),
            stepFwdBtn: qs('stepFwdBtn'),
            speedSlider: qs('speedSlider'),
            speedLabel: qs('speedLabel'),
            emptyTitle: config.emptyTitle || '',
            emptyPrinciple: config.emptyPrinciple || '',
            playText: config.playText || 'Play',
            pauseText: config.pauseText || 'Pause',
            progressPrefix: config.progressPrefix || 'Step',
            showLabel: config.showLabel === true
        });
        return config._playback;
    }

    function renderPipelineCards(config, steps) {
        var track = qs('pipelineTrack');
        var map = stepsById(steps);
        clearNode(track);
        var displayOrder = config.pipelineOrder || (config.order || []).filter(function(stepId) {
            return stepId !== 'original';
        });
        displayOrder.forEach(function(stepId, index) {
            track.appendChild(createStepCard(config, stepId, map[stepId], index));
        });
        renderMath(track);
        refreshModuleHeights();
    }

    function updateMetricChips(config, metrics) {
        var chips = qs('metricsStatus');
        if (!chips || !config.metricChips) return;
        chips.innerHTML = config.metricChips(metrics || {}).map(function(item) {
            return '<span>' + item.label + '<strong>' + item.value + '</strong></span>';
        }).join('');
    }

    function renderHistory(config, historyData) {
        var historyList = qs('historyList');
        var entries = (historyData || []).filter(function(e) {
            return e.module_key === config.moduleKey;
        });
        clearNode(historyList);
        if (!entries.length) {
            historyList.appendChild(makeEl('div', 'history-empty', config.historyEmpty || ''));
            return;
        }
        entries.slice(0, 20).forEach(function(entry) {
            var item = makeEl('div', 'history-item');
            item.dataset.id = entry.id;
            var filename = entry.original_filename || (entry.original_image || '').split('/').pop() || 'image';
            item.appendChild(makeEl('span', 'history-module', (entry.module_title || config.historyTitle || '') + '_' + filename));
            item.appendChild(makeEl('span', 'history-time', new Date(entry.timestamp).toLocaleString('zh-CN')));
            var view = makeEl('a', 'history-view-btn', config.viewText || 'View');
            view.href = entry.result_image || '#';
            view.target = '_blank';
            view.rel = 'noopener noreferrer';
            item.appendChild(view);
            var load = makeEl('a', 'history-load-btn', config.loadText || 'Load');
            load.href = '#';
            load.dataset.id = entry.id;
            item.appendChild(load);
            var del = makeEl('button', 'history-del-btn', 'x');
            del.type = 'button';
            del.title = 'Delete';
            del.dataset.id = entry.id;
            item.appendChild(del);
            historyList.appendChild(item);
        });
    }

    function init(config) {
        var form = qs('uploadForm');
        var fileInput = qs('fileInput');
        var fileNameText = qs('fileNameText');
        var processBtn = qs('processBtn');
        var statusText = qs('statusText');
        var loadingOverlay = qs('loadingOverlay');
        var animEmpty = qs('animEmpty');
        var clearHistoryBtn = qs('clearHistoryBtn');
        var historyList = qs('historyList');
        var historyData = [];
        var selectedFile = null;
        var userDataLoaded = false;
        var demoLoading = false;
        var demoLoaded = false;

        function showLoading() {
            loadingOverlay.classList.add('active');
            loadingOverlay.style.display = 'none';
            processBtn.disabled = true;
            statusText.textContent = config.loadingText || '';
        }

        function hideLoading() {
            loadingOverlay.classList.remove('active');
            loadingOverlay.style.display = 'none';
            processBtn.disabled = false;
        }

        function applyMetrics(metrics, params) {
            if (qs('pipelineMeta') && config.pipelineMeta) {
                qs('pipelineMeta').textContent = config.pipelineMeta(metrics || {}, params || {});
            }
            updateMetricChips(config, metrics || {});
        }

        function loadSteps(steps) {
            steps = steps || [];
            renderPipelineCards(config, steps);
            var player = createPlayback(config);
            if (player) player.load(steps);
            animEmpty.style.display = 'none';
            animEmpty.textContent = '';
        }

        function setSelectedFile(file) {
            selectedFile = file || null;
            fileNameText.textContent = selectedFile ? selectedFile.name : (config.noFileText || '');
            processBtn.disabled = !selectedFile;
            statusText.textContent = selectedFile
                ? (config.fileReadyText || '已选择图片，点击运行按钮开始处理。')
                : (config.readyText || '');
        }

        function collectFormData() {
            var fd = new FormData(form);
            if (selectedFile) fd.set('file', selectedFile, selectedFile.name || 'upload.png');
            return fd;
        }

        function fetchHistory() {
            fetch('/api/history', { headers: { Accept: 'application/json' }, cache: 'no-store' })
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(d) {
                    if (!d) return;
                    historyData = d.history || [];
                    renderHistory(config, historyData);
                })
                .catch(function() {});
        }

        function makeDemoBlob() {
            return new Promise(function(resolve) {
                var canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 96;
                var ctx = canvas.getContext('2d');
                var grad = ctx.createLinearGradient(0, 0, 128, 96);
                grad.addColorStop(0, '#f8fafc');
                grad.addColorStop(1, '#cbd5e1');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 128, 96);
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(16, 16, 42, 42);
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(24, 24, 26, 26);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(78, 14);
                ctx.lineTo(112, 48);
                ctx.lineTo(74, 78);
                ctx.stroke();
                ctx.strokeStyle = '#0ea5e9';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(88, 42, 18, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#14b8a6';
                ctx.beginPath();
                ctx.arc(38, 72, 10, 0, Math.PI * 2);
                ctx.fill();
                function done(blob) {
                    resolve(blob);
                }
                if (canvas.toBlob) {
                    canvas.toBlob(done, 'image/png');
                } else {
                    var data = atob(canvas.toDataURL('image/png').split(',')[1]);
                    var arr = new Uint8Array(data.length);
                    for (var i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
                    done(new Blob([arr], { type: 'image/png' }));
                }
            });
        }

        function ensureDemoData() {
            if (config.demo === false || userDataLoaded || demoLoading || demoLoaded) return;
            demoLoading = true;
            makeDemoBlob().then(function(blob) {
                var fd = new FormData(form);
                fd.set('file', blob, (config.moduleKey || 'feature') + '-demo.png');
                fd.set('skip_history', '1');
                return fetch(config.endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
            }).then(function(res) {
                if (!res.ok) throw new Error('demo failed');
                return res.json();
            }).then(function(json) {
                demoLoaded = true;
                if (!userDataLoaded) dispatchFeatureData(config, json);
            }).catch(function() {
                demoLoaded = false;
            }).finally(function() {
                demoLoading = false;
            });
        }

        function ensureKnowledgeData() {
            if (config.demo === false) {
                if (!userDataLoaded) {
                    dispatchFeatureData(config, {
                        empty: true,
                        message: config.needsRealDataText || ''
                    });
                }
                return;
            }
            ensureDemoData();
        }

        function rerunHistoryForVisualization(config, entry, metadata, pipelines) {
            if (!entry || !entry.original_image) return;
            fetch(entry.original_image, { cache: 'no-store' })
                .then(function(res) {
                    if (!res.ok) throw new Error('image fetch failed');
                    return res.blob();
                })
                .then(function(blob) {
                    var fd = new FormData();
                    var params = metadata.params || {};
                    Object.keys(params).forEach(function(key) {
                        fd.set(key, params[key]);
                    });
                    fd.set('skip_history', '1');
                    fd.set('file', blob, entry.original_filename || 'history.png');
                    return fetch(config.endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
                })
                .then(function(res) {
                    if (!res.ok) throw new Error('history rerun failed');
                    return res.json();
                })
                .then(function(json) {
                    dispatchFeatureData(config, json);
                })
                .catch(function() {
                    dispatchFeatureData(config, {
                        pipelines: pipelines,
                        metrics: metadata.metrics || {},
                        params: metadata.params || {},
                        visualization: metadata.visualization || {},
                        keypoints: metadata.keypoints || [],
                        candidates: metadata.candidates || [],
                        points: metadata.points || []
                    });
                });
        }

        function hasVisualizationData(visualization) {
            if (!visualization || typeof visualization !== 'object') return false;
            return Object.keys(visualization).some(function(key) {
                var value = visualization[key];
                if (Array.isArray(value)) return value.length > 0;
                if (value && typeof value === 'object') return Object.keys(value).length > 0;
                return value != null;
            });
        }

        (config.ranges || []).forEach(function(item) {
            var input = qs(item.id);
            var out = qs(item.out);
            if (!input || !out) return;
            function sync() {
                out.textContent = Number(input.value).toFixed(item.digits);
            }
            input.addEventListener('input', sync);
            sync();
        });

        document.querySelectorAll('.view-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                var view = this.dataset.view;
                document.querySelectorAll('.view-tab').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                qs('viewVisual').style.display = view === 'visual' ? '' : 'none';
                qs('viewKnowledge').style.display = view === 'knowledge' ? '' : 'none';
                renderMath(document);
                refreshModuleHeights();
                if (view === 'knowledge') ensureKnowledgeData();
            });
        });

        fileInput.addEventListener('change', function() {
            setSelectedFile(fileInput.files && fileInput.files.length ? fileInput.files[0] : null);
        });

        form.addEventListener('submit', function(ev) {
            ev.preventDefault();
            if (!selectedFile) return;
            showLoading();
            fetch(config.endpoint, { method: 'POST', body: collectFormData(), headers: { Accept: 'application/json' } })
                .then(function(res) {
                    if (res.ok) return res.json();
                    return res.text().then(function(text) {
                        throw new Error(text || ('HTTP ' + res.status));
                    });
                })
                .then(function(json) {
                    userDataLoaded = true;
                    var steps = json.pipelines && json.pipelines[config.pipelineKey] ? json.pipelines[config.pipelineKey].steps || [] : [];
                    loadSteps(steps);
                    historyData = json.history || [];
                    renderHistory(config, historyData);
                    applyMetrics(json.metrics || {}, json.params || {});
                    dispatchFeatureData(config, json);
                    statusText.textContent = config.doneText || '';
                    hideLoading();
                })
                .catch(function() {
                    hideLoading();
                    animEmpty.style.display = 'none';
                    animEmpty.textContent = '';
                    statusText.textContent = config.errorText || '';
                });
        });

        historyList.addEventListener('click', function(ev) {
            var loadTarget = ev.target.closest && ev.target.closest('.history-load-btn');
            var delTarget = ev.target.closest && ev.target.closest('.history-del-btn');
            if (loadTarget) {
                ev.preventDefault();
                var id = parseInt(loadTarget.dataset.id, 10);
                var entry = historyData.find(function(e) { return e.id === id; });
                if (!entry) return;
                var metadata = entry.metadata || {};
                var pipelines = metadata[config.historyPipelinesKey] || {};
                var steps = pipelines[config.pipelineKey] ? pipelines[config.pipelineKey].steps || [] : [];
                loadSteps(steps);
                userDataLoaded = true;
                applyMetrics(metadata.metrics || {}, metadata.params || {});
                var historyPayload = {
                    pipelines: pipelines,
                    metrics: metadata.metrics || {},
                    params: metadata.params || {},
                    visualization: metadata.visualization || {},
                    keypoints: metadata.keypoints || [],
                    candidates: metadata.candidates || [],
                    points: metadata.points || []
                };
                dispatchFeatureData(config, historyPayload);
                if (!hasVisualizationData(metadata.visualization)) {
                    rerunHistoryForVisualization(config, entry, metadata, pipelines);
                }
                statusText.textContent = config.loadedText || '';
            }
            if (delTarget) {
                var deleteId = parseInt(delTarget.dataset.id, 10);
                fetch('/api/history/' + deleteId, { method: 'DELETE' }).then(function(res) {
                    if (!res.ok) return;
                    historyData = historyData.filter(function(e) { return e.id !== deleteId; });
                    renderHistory(config, historyData);
                });
            }
        });

        clearHistoryBtn.addEventListener('click', function() {
            if (!confirm(config.clearConfirmText || 'Clear history?')) return;
            fetch('/api/history?module_key=' + encodeURIComponent(config.moduleKey), { method: 'DELETE' })
                .then(function() {
                    historyData = historyData.filter(function(e) { return e.module_key !== config.moduleKey; });
                    renderHistory(config, historyData);
                    loadSteps([]);
                    statusText.textContent = config.readyText || '';
                    applyMetrics({}, {});
                    userDataLoaded = false;
                    demoLoaded = false;
                    if (qs('viewKnowledge').style.display !== 'none') ensureKnowledgeData();
                });
        });

        window.addEventListener('resize', refreshModuleHeights);

        renderPipelineCards(config, []);
        renderMath(document);
        fetchHistory();
        applyMetrics({}, {});
        animEmpty.style.display = 'none';
        animEmpty.textContent = '';
        loadingOverlay.classList.remove('active');
        loadingOverlay.style.display = 'none';
        setSelectedFile(null);
        if (qs('viewKnowledge') && qs('viewKnowledge').style.display !== 'none') ensureKnowledgeData();
    }

    window.FeaturePage = { init: init };
})();
