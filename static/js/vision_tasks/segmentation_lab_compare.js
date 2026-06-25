(function () {
    const root = document.querySelector("[data-segmentation-lab]");
    if (!root) return;

    const dataRoot = window.CVClassVisionTasks?.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
    const semanticModuleUrl = window.cvclassUrl("/static/js/inference/semantic_inference.js?v=20260624-seg-lab");
    const instanceModuleUrl = window.cvclassUrl("/static/js/inference/instance_inference.js?v=20260624-seg-lab");
    const semanticModelBase = window.cvclassUrl("/static/assets/data/segformer_b0_ade/");
    const UNKNOWN = 65535;
    const palette = ["#2563EB", "#F97316", "#22C55E", "#8B5CF6", "#EAB308", "#EC4899", "#06B6D4", "#EF4444", "#14B8A6", "#64748B", "#A855F7", "#84CC16"];
    const $ = (selector) => root.querySelector(selector);
    const $$ = (selector) => [...root.querySelectorAll(selector)];

    const state = {
        data: null,
        sampleId: "",
        imageUrl: "",
        imageName: "",
        width: 0,
        height: 0,
        opacity: 0.62,
        focus: "semantic",
        backend: "webgpu",
        semantic: null,
        instance: null,
        semanticClient: null,
        instanceClient: null,
        semanticInfo: null,
        instanceInfo: null,
        semanticBackendKey: "",
        instanceBackendKey: "",
        selectedInstanceId: null,
        token: 0,
        customUrl: null,
        step: "input",
        playback: "paused",
        speed: 0.5,
        playTimer: null,
        linkMode: "hover",
        lockedInstanceId: null
    };

    const STEPS = ["input", "preprocess", "semantic", "instance", "compare"];
    const STEP_META = {
        input: {name: "Image", principle: "共享输入图像，两个模型将分别从同一像素集合中提取不同粒度的信息。"},
        preprocess: {name: "Preprocess", principle: "resize 到模型输入尺寸并归一化，保证两个模型看到的是同一预处理结果。"},
        semantic: {name: "SegFormer", principle: "语义分支输出 H×W×C logits，经 argmax 得到每像素类别。"},
        instance: {name: "YOLO-seg", principle: "实例分支输出检测框 + mask 原型，每实例获得独立掩码与 id。"},
        compare: {name: "Compare", principle: "同一像素在语义图里只有类别，在实例图里可归属独立对象——这就是任务粒度差异。"}
    };

    const els = {
        sample: $("[data-seg-sample-picker]"),
        sampleTrigger: $("[data-seg-sample-trigger]"),
        sampleLabel: $("[data-seg-sample-label]"),
        sampleGrid: $("[data-seg-sample-grid]"),
        upload: $("[data-seg-upload]"),
        uploadName: $("[data-seg-upload-name]"),
        focusButtons: $$("[data-seg-focus]"),
        opacity: $("[data-seg-opacity]"),
        opacityOut: $("[data-seg-opacity-output]"),
        backend: $("[data-seg-backend]"),
        run: $("[data-seg-run]"),
        status: $("[data-seg-status]"),
        inputName: $("[data-seg-input-name]"),
        semanticTime: $("[data-seg-sem-time]"),
        instanceTime: $("[data-seg-inst-time]"),
        classCount: $("[data-seg-class-count]"),
        instanceCount: $("[data-seg-inst-count]"),
        imageSize: $("[data-seg-image-size]"),
        missing: $("[data-seg-missing]"),
        semanticStatus: $("[data-seg-sem-status]"),
        semanticMeta: $("[data-seg-sem-meta]"),
        instanceStatus: $("[data-seg-inst-status]"),
        instanceMeta: $("[data-seg-inst-meta]"),
        semanticBadge: $("[data-seg-sem-badge]"),
        instanceBadge: $("[data-seg-inst-badge]"),
        inputImage: $("[data-seg-input-image]"),
        semanticImage: $("[data-seg-sem-image]"),
        instanceImage: $("[data-seg-inst-image]"),
        semanticCanvas: $("[data-seg-sem-canvas]"),
        instanceCanvas: $("[data-seg-inst-canvas]"),
        instanceSvg: $("[data-seg-inst-svg]"),
        semanticLegend: $("[data-seg-sem-legend]"),
        instanceLegend: $("[data-seg-inst-legend]"),
        semanticStage: $("[data-seg-sem-stage]"),
        instanceStage: $("[data-seg-inst-stage]"),
        grid: $("[data-seg-comparison-grid]"),
        cards: $$("[data-seg-card]"),
        pipeline: $$("[data-seg-step]"),
        explainKicker: $("[data-seg-explain-kicker]"),
        explainTitle: $("[data-seg-explain-title]"),
        explainCopy: $("[data-seg-explain-copy]"),
        explainOutput: $("[data-seg-explain-output]"),
        explainMetric: $("[data-seg-explain-metric]"),
        explainBest: $("[data-seg-explain-best]"),
        inspector: $("[data-seg-inspector]"),
        prosCards: $$("[data-seg-pros-card]"),
        player: $("[data-seg-player]"),
        stepInfo: $("[data-seg-step-info]"),
        stepName: $("[data-seg-step-name]"),
        stepPrinciple: $("[data-seg-step-principle]"),
        progress: $("[data-seg-progress]"),
        progressText: $("[data-seg-progress-text]"),
        dots: $$("[data-seg-dot]"),
        lines: $$(".seg-lab-progress-line"),
        prev: $("[data-seg-prev]"),
        play: $("[data-seg-play]"),
        next: $("[data-seg-next]"),
        speed: $("[data-seg-speed]"),
        speedLabel: $("[data-seg-speed-label]"),
        linkModeBtns: $$("[data-seg-link-mode]"),
        semCard: $("[data-seg-card='semantic']"),
        instCard: $("[data-seg-card='instance']"),
        compareSemOverlay: $("[data-seg-compare-sem]"),
        compareInstOverlay: $("[data-seg-compare-inst]"),
        inspectorTooltip: null,
        figureCards: $$("[data-seg-figure]")
    };

    const semanticCtx = els.semanticCanvas.getContext("2d", {willReadFrequently: true});
    const instanceCtx = els.instanceCanvas.getContext("2d", {willReadFrequently: true});

    // 创建像素 inspector tooltip
    els.inspectorTooltip = document.createElement("div");
    els.inspectorTooltip.className = "seg-lab-inspector-tooltip";
    els.inspectorTooltip.innerHTML = `
        <div class="tip-title">PIXEL INSPECTOR</div>
        <div class="tip-row"><span>坐标</span><b data-tip-coord>--</b></div>
        <div class="tip-row"><span>语义类别</span><b class="tip-sem" data-tip-sem>--</b></div>
        <div class="tip-row"><span>所属实例</span><b class="tip-inst" data-tip-inst>--</b></div>
    `;
    document.body.appendChild(els.inspectorTooltip);
    const tipEls = {
        coord: els.inspectorTooltip.querySelector("[data-tip-coord]"),
        sem: els.inspectorTooltip.querySelector("[data-tip-sem]"),
        inst: els.inspectorTooltip.querySelector("[data-tip-inst]")
    };

    function showInspectorTooltip(event) {
        if (!state.semantic && !state.instance) return;
        const semCoords = eventToCanvasCoords(event, els.semanticCanvas);
        if (!semCoords) {
            hideInspectorTooltip();
            return;
        }
        const {x, y} = semCoords;
        tipEls.coord.textContent = `(${x}, ${y})`;
        // 语义类别
        let semLabel = "--";
        if (state.semantic) {
            if (state.semantic.classMap) {
                const id = state.semantic.classMap[y * state.semantic.width + x];
                if (id !== undefined && id !== 255) {
                    const cls = (state.semantic.classes || []).find((c) => Number(c.id) === Number(id));
                    semLabel = cls ? cls.name || cls.cn || `class_${id}` : `class_${id}`;
                } else {
                    semLabel = "背景/未知";
                }
            } else {
                const regions = state.semantic.regions || [];
                const region = regions.find((r) => Array.isArray(r.polygon) && pointInPolygon(x, y, r.polygon));
                semLabel = region ? region.className : "背景";
            }
        }
        tipEls.sem.textContent = semLabel;
        // 所属实例
        let instLabel = "--";
        if (state.instance) {
            const insts = state.instance.instances || [];
            const found = insts.find((item) => {
                if (item.mask?.data) {
                    return item.mask.data[y * state.instance.width + x];
                }
                if (item.bbox) {
                    const [x1, y1, x2, y2] = item.bbox;
                    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
                }
                return false;
            });
            if (found) {
                instLabel = `#${found.id} ${found.className} ${found.score.toFixed(2)}`;
            } else {
                instLabel = "无实例";
            }
        }
        tipEls.inst.textContent = instLabel;
        // 定位
        const pad = 14;
        const tipW = els.inspectorTooltip.offsetWidth || 200;
        const tipH = els.inspectorTooltip.offsetHeight || 90;
        let left = event.clientX + pad;
        let top = event.clientY + pad;
        if (left + tipW > window.innerWidth) left = event.clientX - tipW - pad;
        if (top + tipH > window.innerHeight) top = event.clientY - tipH - pad;
        els.inspectorTooltip.style.left = `${left}px`;
        els.inspectorTooltip.style.top = `${top}px`;
        els.inspectorTooltip.classList.add("is-visible");
    }

    function hideInspectorTooltip() {
        if (els.inspectorTooltip) els.inspectorTooltip.classList.remove("is-visible");
    }

    function esc(value) {
        return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function fmtMs(value) {
        return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "--";
    }

    function colorFor(id, fallbackIndex = 0) {
        if (Number.isFinite(Number(id))) return palette[Math.abs(Number(id)) % palette.length];
        return palette[fallbackIndex % palette.length];
    }

    function parseColor(hex) {
        const normalized = String(hex || "#2563eb").replace("#", "").padEnd(6, "0").slice(0, 6);
        return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
    }

    function label(info) {
        return info?.cn || info?.name || info?.className || info?.class || `class_${info?.id ?? "--"}`;
    }

    function currentSample() {
        return state.data?.samples?.find((item) => item.id === state.sampleId) || state.data?.samples?.[0];
    }

    function currentImageElement() {
        return els.inputImage || els.semanticImage || els.instanceImage;
    }

    function setStep(step) {
        if (!STEPS.includes(step)) return;
        state.step = step;
        els.pipeline.forEach((button) => button.classList.toggle("is-active", button.dataset.segStep === step));
        const idx = STEPS.indexOf(step);
        els.dots.forEach((dot, i) => {
            dot.classList.toggle("is-current", i === idx);
            dot.classList.toggle("is-done", i < idx);
        });
        els.lines.forEach((line, i) => line.classList.toggle("is-done", i < idx));
        if (els.progressText) els.progressText.textContent = `步骤 ${idx + 1} / ${STEPS.length}`;
        const meta = STEP_META[step] || {name: step, principle: ""};
        if (els.stepName) els.stepName.textContent = meta.name;
        if (els.stepPrinciple) els.stepPrinciple.textContent = meta.principle;
        const ready = state.semantic || state.instance;
        if (els.prev) els.prev.disabled = !ready || idx === 0 || state.playback === "playing";
        if (els.next) els.next.disabled = !ready || idx === STEPS.length - 1 || state.playback === "playing";
        if (els.play) {
            els.play.disabled = !ready;
            els.play.textContent = state.playback === "playing" ? "暂停" : "播放";
        }
        // Compare 步骤触发输出结构差异动画
        if (step === "compare" && ready) {
            triggerCompareAnimation();
        } else {
            hideCompareAnimation();
        }
        root.dataset.step = step;
    }

    function triggerCompareAnimation() {
        [els.compareSemOverlay, els.compareInstOverlay].forEach((el) => {
            if (!el) return;
            el.classList.remove("is-active");
            // 强制重排让动画重新触发
            void el.offsetWidth;
            el.classList.add("is-active");
        });
    }

    function hideCompareAnimation() {
        [els.compareSemOverlay, els.compareInstOverlay].forEach((el) => {
            if (el) el.classList.remove("is-active");
        });
    }

    function playNext() {
        const idx = STEPS.indexOf(state.step);
        if (idx < STEPS.length - 1) {
            setStep(STEPS[idx + 1]);
        } else {
            pausePlayback();
        }
    }

    function startPlayback() {
        if (state.playback === "playing") return;
        state.playback = "playing";
        if (els.play) els.play.textContent = "暂停";
        const advance = () => {
            if (state.playback !== "playing") return;
            const idx = STEPS.indexOf(state.step);
            if (idx < STEPS.length - 1) {
                setStep(STEPS[idx + 1]);
                state.playTimer = setTimeout(advance, 1100 / state.speed);
            } else {
                pausePlayback();
            }
        };
        state.playTimer = setTimeout(advance, 1100 / state.speed);
        setStep(state.step);
    }

    function pausePlayback() {
        state.playback = "paused";
        if (state.playTimer) {
            clearTimeout(state.playTimer);
            state.playTimer = null;
        }
        if (els.play) els.play.textContent = "播放";
        setStep(state.step);
    }

    function togglePlayback() {
        if (state.playback === "playing") pausePlayback();
        else startPlayback();
    }

    function gotoStep(step) {
        pausePlayback();
        setStep(step);
    }

    function setBusy(busy) {
        root.classList.toggle("is-running", busy);
        els.run.disabled = busy;
        els.run.classList.toggle("is-loading", busy);
    }

    function setCardState(task, stateName) {
        const card = root.querySelector(`[data-seg-card="${task}"]`);
        if (!card) return;
        card.dataset.state = stateName || "";
    }

    function updateFocus() {
        root.dataset.focus = state.focus;
        els.focusButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.segFocus === state.focus));
        els.cards.forEach((card) => card.classList.toggle("is-focused", card.dataset.segCard === state.focus || (state.focus === "compare" && card.dataset.segCard !== "input")));
        els.prosCards.forEach((card) => card.classList.toggle("is-focused", card.dataset.segProsCard === state.focus || (state.focus === "compare" && card.dataset.segProsCard === "semantic")));

        const copy = {
            semantic: {
                kicker: "Semantic Segmentation",
                title: "语义分割关注“每个像素是什么类别”",
                body: "适合道路、天空、墙面、地面等 stuff 类别和整体场景理解，但不会把同类多个目标拆成独立对象。",
                output: "H×W class map / H×W×C logits",
                metric: "Pixel Accuracy / mIoU",
                best: "场景理解、区域占比、可通行区域"
            },
            instance: {
                kicker: "Instance Segmentation",
                title: "实例分割关注每个对象是谁、在哪里",
                body: "在检测基础上为每个目标生成独立 mask，因此同类目标可以计数、选择和跟踪。",
                output: "N × {bbox,class,score,mask,instance_id}",
                metric: "Mask IoU / Mask AP",
                best: "目标计数、实例选择、对象级属性统计"
            },
            compare: {
                kicker: "Task Difference",
                title: "同一图像，两种不同粒度的理解",
                body: "语义分割输出 dense class map；实例分割输出目标集合。前者强在全局区域，后者强在独立对象。",
                output: "class map vs instance set",
                metric: "mIoU vs Mask AP",
                best: "先判断是否需要 instance_id，再选择任务"
            }
        }[state.focus];
        els.explainKicker.textContent = copy.kicker;
        els.explainTitle.textContent = copy.title;
        els.explainCopy.textContent = copy.body;
        if (els.explainOutput) els.explainOutput.textContent = copy.output;
        if (els.explainMetric) els.explainMetric.textContent = copy.metric;
        if (els.explainBest) els.explainBest.textContent = copy.best;
        // 根据当前 focus 切换 figure-card 显示
        const figTarget = state.focus === "instance" ? "instance" : "semantic";
        els.figureCards.forEach((card) => card.classList.toggle("is-active", card.dataset.segFigure === figTarget));
        renderInspector();
    }

    function waitForImage(image) {
        if (!image) return Promise.resolve();
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const onLoad = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error("图像加载失败")); };
            const cleanup = () => {
                image.removeEventListener("load", onLoad);
                image.removeEventListener("error", onError);
            };
            image.addEventListener("load", onLoad, {once: true});
            image.addEventListener("error", onError, {once: true});
        });
    }

    function setImage(url, name, width = 0, height = 0) {
        state.imageUrl = url;
        state.imageName = name || "Uploaded image";
        state.width = width;
        state.height = height;
        const resolved = url.startsWith("blob:") ? url : window.cvclassUrl(url);
        [els.inputImage, els.semanticImage, els.instanceImage].filter(Boolean).forEach((img) => {
            img.src = resolved;
        });
        if (els.inputName) els.inputName.textContent = state.imageName;
        if (els.missing) {
            els.missing.textContent = url.startsWith("blob:") ? "上传图片读取失败" : `请放入 ${url.split("/").pop()}`;
        }
        updateImageMetrics();
    }

    function updateImageMetrics() {
        const image = currentImageElement();
        const width = image?.naturalWidth || state.width || 0;
        const height = image?.naturalHeight || state.height || 0;
        if (width && height) {
            state.width = width;
            state.height = height;
            if (els.imageSize) els.imageSize.textContent = `${width} × ${height}`;
            root.style.setProperty("--seg-lab-aspect", `${width} / ${height}`);
        } else {
            if (els.imageSize) els.imageSize.textContent = "-- × --";
        }
    }

    function polygonArea(poly = []) {
        let area = 0;
        for (let i = 0; i < poly.length; i += 1) {
            const [x1, y1] = poly[i];
            const [x2, y2] = poly[(i + 1) % poly.length];
            area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area / 2);
    }

    function buildPresetSemantic(scene) {
        const classMap = new Map();
        const regions = [];
        (scene.semantic_regions || []).forEach((region, index) => {
            const className = region.class || region.className || `class_${index + 1}`;
            if (!classMap.has(className)) {
                classMap.set(className, {
                    id: classMap.size,
                    name: className,
                    cn: className,
                    color: region.color || colorFor(index, index)
                });
            }
            regions.push({...region, className, color: region.color || classMap.get(className).color});
        });
        (scene.instances || []).forEach((item, index) => {
            const className = item.className || item.class || `instance_${index + 1}`;
            if (!classMap.has(className)) {
                classMap.set(className, {
                    id: classMap.size,
                    name: className,
                    cn: className,
                    color: colorFor(index, index)
                });
            }
        });
        const classes = [...classMap.values()];
        const distribution = classes.map((item) => ({
            id: item.id,
            name: item.name,
            count: Math.round(regions.filter((region) => region.className === item.name).reduce((sum, region) => sum + polygonArea(region.polygon || []), 0)),
            ratio: state.width && state.height ? Math.min(1, regions.filter((region) => region.className === item.name).reduce((sum, region) => sum + polygonArea(region.polygon || []), 0) / (state.width * state.height)) : 0
        })).filter((item) => item.count > 0);
        return {
            source: "preset",
            width: scene.width,
            height: scene.height,
            classes,
            regions,
            distribution,
            meta: {
                modelName: "Preset semantic regions",
                backend: "preset",
                inputSize: `${scene.width} × ${scene.height}`,
                inferenceTime: null,
                postprocessTime: 0,
                rawOutputSummary: "semantic_regions fallback"
            }
        };
    }

    function normalizeInstance(item, index, source = "preset") {
        const bbox = (item.bbox || [0, 0, 0, 0]).map((value) => Math.round(Number(value) || 0));
        const poly = Array.isArray(item.polygon) ? item.polygon : [];
        const maskArea = Number.isFinite(item.maskArea) ? item.maskArea : polygonArea(poly);
        const boxArea = Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
        return {
            id: Number(item.id ?? index + 1),
            className: item.className || item.class || `instance_${index + 1}`,
            score: Number(item.score ?? 1),
            bbox,
            mask: item.mask || null,
            polygon: poly,
            color: item.color || colorFor(index, index),
            maskArea,
            boxArea,
            source
        };
    }

    function buildPresetInstance(scene) {
        return {
            source: "preset",
            width: scene.width,
            height: scene.height,
            instances: (scene.instances || []).map((item, index) => normalizeInstance(item, index, "preset")),
            meta: {
                modelName: "Preset instance masks",
                backend: "preset",
                inputSize: `${scene.width} × ${scene.height}`,
                inferenceTime: null,
                postprocessTime: 0,
                rawOutputSummary: "polygon instances fallback"
            }
        };
    }

    function presetScene() {
        const sample = currentSample();
        return sample ? {
            ...sample,
            instances: (sample.instances || []).map((item, index) => normalizeInstance(item, index, "preset"))
        } : null;
    }

    function drawSemanticMask(result) {
        if (!result) return;
        const width = result.width || state.width;
        const height = result.height || state.height;
        els.semanticCanvas.width = width;
        els.semanticCanvas.height = height;
        semanticCtx.clearRect(0, 0, width, height);
        const alpha = Math.round(state.opacity * 255);

        if (result.classMap) {
            const imageData = semanticCtx.createImageData(width, height);
            const out = imageData.data;
            const byId = new Map((result.classes || []).map((item, index) => [Number(item.id), item.color || colorFor(item.id, index)]));
            for (let i = 0; i < result.classMap.length; i += 1) {
                const id = result.classMap[i];
                if (id === UNKNOWN) continue;
                const [r, g, b] = parseColor(byId.get(Number(id)) || colorFor(Number(id)));
                const p = i * 4;
                out[p] = r;
                out[p + 1] = g;
                out[p + 2] = b;
                out[p + 3] = alpha;
            }
            semanticCtx.putImageData(imageData, 0, 0);
            return;
        }

        (result.regions || []).forEach((region, index) => {
            if (!Array.isArray(region.polygon) || region.polygon.length < 3) return;
            semanticCtx.beginPath();
            region.polygon.forEach(([x, y], pointIndex) => {
                if (pointIndex === 0) semanticCtx.moveTo(x, y);
                else semanticCtx.lineTo(x, y);
            });
            semanticCtx.closePath();
            semanticCtx.globalAlpha = state.opacity;
            semanticCtx.fillStyle = region.color || colorFor(index, index);
            semanticCtx.fill();
            semanticCtx.globalAlpha = 1;
        });
    }

    function drawInstanceMasks(result) {
        if (!result) return;
        const width = result.width || state.width;
        const height = result.height || state.height;
        els.instanceCanvas.width = width;
        els.instanceCanvas.height = height;
        instanceCtx.clearRect(0, 0, width, height);

        const imageData = instanceCtx.createImageData(width, height);
        const out = imageData.data;
        const alpha = Math.round(state.opacity * 255);
        (result.instances || []).forEach((item, index) => {
            const [r, g, b] = parseColor(item.color || colorFor(index, index));
            if (item.mask?.data) {
                const mask = item.mask.data;
                for (let i = 0; i < mask.length; i += 1) {
                    if (!mask[i]) continue;
                    const p = i * 4;
                    out[p] = r;
                    out[p + 1] = g;
                    out[p + 2] = b;
                    out[p + 3] = Math.max(out[p + 3], alpha);
                }
            }
        });
        instanceCtx.putImageData(imageData, 0, 0);

        (result.instances || []).forEach((item, index) => {
            if (!item.polygon?.length || item.mask?.data) return;
            instanceCtx.beginPath();
            item.polygon.forEach(([x, y], pointIndex) => {
                if (pointIndex === 0) instanceCtx.moveTo(x, y);
                else instanceCtx.lineTo(x, y);
            });
            instanceCtx.closePath();
            instanceCtx.globalAlpha = state.opacity;
            instanceCtx.fillStyle = item.color || colorFor(index, index);
            instanceCtx.fill();
            instanceCtx.globalAlpha = 1;
        });

        els.instanceSvg.innerHTML = (result.instances || []).map((item, index) => {
            const [x1, y1, x2, y2] = item.bbox || [0, 0, 0, 0];
            const x = (x1 / width) * 100;
            const y = (y1 / height) * 100;
            const w = ((x2 - x1) / width) * 100;
            const h = ((y2 - y1) / height) * 100;
            const selected = item.id === state.selectedInstanceId;
            return `<g data-seg-inst-id="${item.id}" class="${selected ? "is-selected" : ""}">
                <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${esc(item.color || colorFor(index, index))}" stroke-width="1.35" vector-effect="non-scaling-stroke"></rect>
                <text x="${x}" y="${Math.max(4, y - 1)}">#${item.id} ${esc(item.className)} ${item.score.toFixed(2)}</text>
            </g>`;
        }).join("");
    }

    function renderSemanticLegend() {
        const result = state.semantic;
        if (!result) {
            els.semanticLegend.innerHTML = `<span>等待语义 mask</span>`;
            return;
        }
        const top = (result.distribution || [])
            .slice()
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 6);
        const classById = new Map((result.classes || []).map((item) => [Number(item.id), item]));
        els.semanticLegend.innerHTML = top.length ? top.map((item, index) => {
            const info = classById.get(Number(item.id)) || item;
            const ratio = Number.isFinite(item.ratio) ? `${(item.ratio * 100).toFixed(1)}%` : "";
            return `<button type="button" data-seg-focus="semantic"><i style="background:${esc(info.color || colorFor(item.id, index))}"></i><b>${esc(label(info))}</b><em>${ratio}</em></button>`;
        }).join("") : `<span>暂无类别分布</span>`;
    }

    function renderInstanceLegend() {
        const result = state.instance;
        if (!result) {
            els.instanceLegend.innerHTML = `<span>等待实例 mask</span>`;
            return;
        }
        els.instanceLegend.innerHTML = (result.instances || []).slice(0, 8).map((item, index) => `
            <button class="${item.id === state.selectedInstanceId ? "is-active" : ""}" type="button" data-seg-instance="${item.id}">
                <i style="background:${esc(item.color || colorFor(index, index))}"></i>
                <b>#${item.id} ${esc(item.className)}</b>
                <em>${item.score.toFixed(2)}</em>
            </button>
        `).join("") || `<span>模型未检测到实例</span>`;
        els.instanceLegend.querySelectorAll("[data-seg-instance]").forEach((button) => {
            button.addEventListener("click", () => {
                state.focus = "instance";
                state.selectedInstanceId = Number(button.dataset.segInstance);
                drawInstanceMasks(state.instance);
                renderInstanceLegend();
                updateFocus();
            });
        });
    }

    function renderInspector() {
        const semMeta = state.semantic?.meta || {};
        const instMeta = state.instance?.meta || {};
        const selected = (state.instance?.instances || []).find((item) => item.id === state.selectedInstanceId) || state.instance?.instances?.[0];
        const rows = [
            ["Semantic output", state.semantic ? `${state.semantic.width}×${state.semantic.height} class map` : "--"],
            ["Semantic backend", semMeta.backend || "--"],
            ["Semantic raw", semMeta.rawOutputShape ? `[${semMeta.rawOutputShape}]` : semMeta.rawOutputSummary || "--"],
            ["Instance output", state.instance ? `${state.instance.instances?.length || 0} masks` : "--"],
            ["Instance backend", instMeta.backend || "--"],
            ["Selected instance", selected ? `#${selected.id} ${selected.className} score ${selected.score.toFixed(2)}` : "--"],
            ["Model relation", "同一输入图像，两个输出头学习不同预测粒度"]
        ];
        els.inspector.innerHTML = rows.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("");
    }

    function renderMetrics() {
        const semMeta = state.semantic?.meta || {};
        const instMeta = state.instance?.meta || {};
        els.semanticTime.textContent = fmtMs(semMeta.inferenceTime);
        els.instanceTime.textContent = fmtMs(instMeta.inferenceTime);
        els.classCount.textContent = String(state.semantic?.classes?.length || state.semantic?.distribution?.length || "--");
        els.instanceCount.textContent = String(state.instance?.instances?.length ?? "--");
        els.semanticMeta.textContent = `${semMeta.modelName || "SegFormer-B0"} · ${semMeta.backend || "--"} · ${fmtMs(semMeta.inferenceTime)}`;
        els.instanceMeta.textContent = `${instMeta.modelName || "YOLO11n-seg"} · ${instMeta.backend || "--"} · ${fmtMs(instMeta.inferenceTime)}`;
        renderInspector();
    }

    function renderAll() {
        els.opacityOut.textContent = `${Math.round(state.opacity * 100)}%`;
        drawSemanticMask(state.semantic);
        drawInstanceMasks(state.instance);
        renderSemanticLegend();
        renderInstanceLegend();
        renderMetrics();
        updateFocus();
    }

    async function ensureSemanticClient() {
        if (state.semanticClient && state.semanticBackendKey === state.backend) return state.semanticClient;
        state.semanticClient?.dispose?.();
        const module = await import(semanticModuleUrl);
        state.semanticClient = module.createSemanticInferenceClient();
        state.semanticInfo = await state.semanticClient.loadSemanticModel({
            modelBaseUrl: semanticModelBase,
            backend: state.backend
        });
        state.semanticBackendKey = state.backend;
        return state.semanticClient;
    }

    async function ensureInstanceClient() {
        if (state.instanceClient && state.instanceBackendKey === state.backend) return state.instanceClient;
        state.instanceClient?.dispose?.();
        const module = await import(instanceModuleUrl);
        state.instanceClient = module.createInstanceInferenceClient();
        state.instanceInfo = await state.instanceClient.loadInstanceModel({backend: state.backend});
        state.instanceBackendKey = state.backend;
        return state.instanceClient;
    }

    async function runSemantic(token) {
        setCardState("semantic", "running");
        els.semanticStatus.textContent = "加载模型";
        els.semanticBadge.textContent = "MODEL";
        setStep("semantic");
        try {
            const client = await ensureSemanticClient();
            if (token !== state.token) return;
            els.semanticStatus.textContent = "推理中";
            const result = await client.runSemanticInference(currentImageElement());
            if (token !== state.token) return;
            state.semantic = result;
            els.semanticStatus.textContent = "模型完成";
            els.semanticBadge.textContent = "MODEL";
            setCardState("semantic", "done");
        } catch (error) {
            if (token !== state.token) return;
            const scene = presetScene();
            state.semantic = scene ? buildPresetSemantic(scene) : null;
            els.semanticStatus.textContent = "预设 fallback";
            els.semanticMeta.textContent = error?.message || "SegFormer 推理失败";
            els.semanticBadge.textContent = "FALLBACK";
            setCardState("semantic", "fallback");
        }
        renderAll();
    }

    async function runInstance(token) {
        setCardState("instance", "running");
        els.instanceStatus.textContent = "加载模型";
        els.instanceBadge.textContent = "MODEL";
        setStep("instance");
        try {
            const client = await ensureInstanceClient();
            if (token !== state.token) return;
            els.instanceStatus.textContent = "推理中";
            const result = await client.runInstanceInference(currentImageElement());
            if (token !== state.token) return;
            state.instance = {
                ...result,
                instances: (result.instances || []).map((item, index) => normalizeInstance(item, index, "model"))
            };
            state.selectedInstanceId = state.instance.instances?.[0]?.id ?? null;
            els.instanceStatus.textContent = "模型完成";
            els.instanceBadge.textContent = "MODEL";
            setCardState("instance", "done");
        } catch (error) {
            if (token !== state.token) return;
            const scene = presetScene();
            state.instance = scene ? buildPresetInstance(scene) : null;
            state.selectedInstanceId = state.instance?.instances?.[0]?.id ?? null;
            els.instanceStatus.textContent = "预设 fallback";
            els.instanceMeta.textContent = error?.message || "YOLO-seg 推理失败";
            els.instanceBadge.textContent = "FALLBACK";
            setCardState("instance", "fallback");
        }
        renderAll();
    }

    async function runModels(reason = "manual") {
        if (!state.imageUrl) return;
        const token = state.token + 1;
        state.token = token;
        setBusy(true);
        setStep("preprocess");
        els.status.textContent = reason === "auto" ? "AUTO RUNNING" : "RUNNING";
        els.semanticStatus.textContent = "等待图像";
        els.instanceStatus.textContent = "等待图像";
        try {
            await waitForImage(currentImageElement());
            updateImageMetrics();
            await Promise.allSettled([runSemantic(token), runInstance(token)]);
            if (token === state.token) {
                setStep("compare");
                els.status.textContent = "MODEL READY";
            }
        } finally {
            if (token === state.token) setBusy(false);
        }
    }

    function renderSamplePicker() {
        const samples = state.data?.samples || [];
        if (!els.sampleGrid) return;
        els.sampleGrid.innerHTML = samples.map((item) => `
            <button type="button" class="vis-sample-picker__card${item.id === state.sampleId ? " is-active" : ""}" data-seg-sample-card="${esc(item.id)}">
                <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">
                <span>${esc(item.name)}</span>
            </button>
        `).join("");
        els.sampleGrid.querySelectorAll("[data-seg-sample-card]").forEach((button) => {
            button.addEventListener("click", () => {
                if (button.dataset.segSampleCard === state.sampleId) {
                    closeSamplePicker();
                    return;
                }
                switchSample(button.dataset.segSampleCard);
                closeSamplePicker();
            });
        });
        updateSampleLabel();
    }

    function updateSampleLabel() {
        const s = state.data?.samples.find((item) => item.id === state.sampleId);
        if (els.sampleLabel) els.sampleLabel.textContent = s ? s.name : "选择示例图";
    }

    function closeSamplePicker() { els.sample?.classList.remove("is-open"); }
    function toggleSamplePicker() { els.sample?.classList.toggle("is-open"); }

    function switchSample(sampleId) {
        const sample = state.data.samples.find((item) => item.id === sampleId) || state.data.samples[0];
        state.sampleId = sample.id;
        state.selectedInstanceId = null;
        state.semantic = null;
        state.instance = null;
        setImage(sample.image, sample.name, sample.width, sample.height);
        els.uploadName.textContent = "选择图片运行双模型";
        state.token += 1;
        setStep("input");
        setCardState("semantic", "");
        setCardState("instance", "");
        const presetSem = buildPresetSemantic(sample);
        const presetInst = buildPresetInstance(sample);
        state.semantic = presetSem;
        state.instance = presetInst;
        state.selectedInstanceId = presetInst.instances?.[0]?.id ?? null;
        els.semanticStatus.textContent = "预设就绪";
        els.instanceStatus.textContent = "预设就绪";
        els.semanticBadge.textContent = "PRESET";
        els.instanceBadge.textContent = "PRESET";
        renderSamplePicker();
        renderAll();
        waitForImage(currentImageElement()).then(() => {
            updateImageMetrics();
            renderAll();
            runModels("auto");
        }).catch(() => {
            els.status.textContent = "IMAGE ERROR";
        });
    }

    function handleUpload(file) {
        if (!file) return;
        if (state.customUrl) URL.revokeObjectURL(state.customUrl);
        const url = URL.createObjectURL(file);
        state.customUrl = url;
        state.sampleId = "";
        state.semantic = null;
        state.instance = null;
        state.selectedInstanceId = null;
        els.uploadName.textContent = file.name;
        setImage(url, file.name);
        waitForImage(currentImageElement()).then(() => {
            updateImageMetrics();
            runModels("upload");
        }).catch(() => {
            els.status.textContent = "UPLOAD ERROR";
        });
    }

    function initControls() {
        els.sampleTrigger?.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSamplePicker();
        });
        document.addEventListener("click", (e) => {
            if (!els.sample?.contains(e.target)) closeSamplePicker();
        });
        els.upload.addEventListener("change", () => handleUpload(els.upload.files?.[0]));
        els.focusButtons.forEach((button) => button.addEventListener("click", () => {
            state.focus = button.dataset.segFocus;
            updateFocus();
        }));
        els.opacity.addEventListener("input", () => {
            state.opacity = Number(els.opacity.value) / 100;
            renderAll();
        });
        els.backend.addEventListener("change", () => {
            state.backend = els.backend.value;
            state.semanticClient?.dispose?.();
            state.instanceClient?.dispose?.();
            state.semanticClient = null;
            state.instanceClient = null;
            state.semanticBackendKey = "";
            state.instanceBackendKey = "";
            runModels("backend");
        });
        els.run.addEventListener("click", () => runModels("manual"));
        els.cards.forEach((card) => {
            card.addEventListener("click", () => {
                if (card.dataset.segCard === "input") return;
                state.focus = card.dataset.segCard;
                updateFocus();
            });
        });
        els.instanceSvg.addEventListener("click", (event) => {
            const target = event.target.closest("[data-seg-inst-id]");
            if (!target) return;
            state.selectedInstanceId = Number(target.dataset.segInstId);
            state.focus = "instance";
            drawInstanceMasks(state.instance);
            renderInstanceLegend();
            updateFocus();
        });
        els.pipeline.forEach((button) => button.addEventListener("click", () => gotoStep(button.dataset.segStep)));
        els.dots.forEach((dot) => dot.addEventListener("click", () => gotoStep(dot.dataset.segDot)));
        if (els.prev) els.prev.addEventListener("click", () => {
            const idx = STEPS.indexOf(state.step);
            if (idx > 0) gotoStep(STEPS[idx - 1]);
        });
        if (els.next) els.next.addEventListener("click", () => {
            const idx = STEPS.indexOf(state.step);
            if (idx < STEPS.length - 1) gotoStep(STEPS[idx + 1]);
        });
        if (els.play) els.play.addEventListener("click", () => togglePlayback());
        if (els.speed) els.speed.addEventListener("input", () => {
            state.speed = Number(els.speed.value);
            if (els.speedLabel) els.speedLabel.textContent = `${state.speed.toFixed(2)}×`;
            root.style.setProperty("--seg-lab-speed", String(state.speed));
            if (state.playback === "playing") {
                if (state.playTimer) clearTimeout(state.playTimer);
                state.playTimer = setTimeout(() => {
                    const idx = STEPS.indexOf(state.step);
                    if (idx < STEPS.length - 1) {
                        setStep(STEPS[idx + 1]);
                        state.playTimer = setTimeout(function tick() {
                            if (state.playback !== "playing") return;
                            const i = STEPS.indexOf(state.step);
                            if (i < STEPS.length - 1) {
                                setStep(STEPS[i + 1]);
                                state.playTimer = setTimeout(tick, 1100 / state.speed);
                            } else {
                                pausePlayback();
                            }
                        }, 1100 / state.speed);
                    } else {
                        pausePlayback();
                    }
                }, 1100 / state.speed);
            }
        });
        // Mask linkage modes
        els.linkModeBtns.forEach((btn) => btn.addEventListener("click", () => setLinkMode(btn.dataset.segLinkMode)));
        // Hover linkage: hovering instance card highlights semantic pixels of same class
        if (els.instCard) {
            els.instCard.addEventListener("mousemove", (e) => {
                if (state.linkMode !== "hover") return;
                const inst = pickInstanceFromEvent(e);
                if (inst) {
                    spotlightInstance(inst.id);
                } else {
                    spotlightInstance(null);
                }
            });
            els.instCard.addEventListener("mouseleave", () => {
                if (state.linkMode !== "hover") return;
                spotlightInstance(null);
            });
        }
        if (els.semCard) {
            els.semCard.addEventListener("mousemove", (e) => {
                if (state.linkMode !== "hover") return;
                const cls = pickSemanticClassFromEvent(e);
                if (cls) {
                    spotlightClass(cls.id);
                } else {
                    spotlightClass(null);
                }
            });
            els.semCard.addEventListener("mouseleave", () => {
                if (state.linkMode !== "hover") return;
                spotlightClass(null);
            });
        }
        // Click lock: click instance dims other instances in both views
        if (els.instCard) {
            els.instCard.addEventListener("click", (e) => {
                if (state.linkMode !== "click") return;
                const inst = pickInstanceFromEvent(e);
                if (inst) {
                    state.lockedInstanceId = state.lockedInstanceId === inst.id ? null : inst.id;
                    lockInstance(state.lockedInstanceId);
                }
            });
        }
        // 像素 inspector tooltip - 在两个 canvas 上监听
        [els.semanticCanvas, els.instanceCanvas].forEach((canvas) => {
            if (!canvas) return;
            canvas.addEventListener("mousemove", showInspectorTooltip);
            canvas.addEventListener("mouseleave", hideInspectorTooltip);
        });
    }

    function setLinkMode(mode) {
        state.linkMode = mode;
        root.dataset.linkMode = mode;
        els.linkModeBtns.forEach((btn) => {
            const active = btn.dataset.segLinkMode === mode;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
        // 清理前模式的高亮残留
        spotlightInstance(null);
        spotlightClass(null);
        if (state.lockedInstanceId !== null) {
            lockInstance(null);
            state.lockedInstanceId = null;
        }
    }

    // 把鼠标事件坐标转换为 canvas 像素坐标
    function eventToCanvasCoords(event, canvas) {
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) return null;
        const x = Math.floor((event.clientX - rect.left) / rect.width * canvas.width);
        const y = Math.floor((event.clientY - rect.top) / rect.height * canvas.height);
        return {x, y};
    }

    function pickInstanceFromEvent(event) {
        if (!state.instance) return null;
        const coords = eventToCanvasCoords(event, els.instanceCanvas);
        if (!coords) return null;
        const {x, y} = coords;
        // 优先通过 mask.data 拾取
        const insts = state.instance.instances || [];
        for (const item of insts) {
            if (item.mask?.data) {
                const idx = y * state.instance.width + x;
                if (item.mask.data[idx]) return item;
            } else if (item.bbox) {
                const [x1, y1, x2, y2] = item.bbox;
                if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return item;
            }
        }
        return null;
    }

    function pickSemanticClassFromEvent(event) {
        if (!state.semantic) return null;
        const coords = eventToCanvasCoords(event, els.semanticCanvas);
        if (!coords) return null;
        const {x, y} = coords;
        if (state.semantic.classMap) {
            const id = state.semantic.classMap[y * state.semantic.width + x];
            if (id === undefined || id === 255) return null;
            const cls = (state.semantic.classes || []).find((c) => Number(c.id) === Number(id));
            return cls || null;
        }
        // regions fallback
        const regions = state.semantic.regions || [];
        for (const region of regions) {
            if (Array.isArray(region.polygon) && pointInPolygon(x, y, region.polygon)) {
                const cls = (state.semantic.classes || []).find((c) => c.name === region.className);
                return cls || {id: -1, name: region.className, color: region.color};
            }
        }
        return null;
    }

    function pointInPolygon(px, py, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i];
            const [xj, yj] = poly[j];
            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-6) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // Hover: 高亮某实例，其余变暗
    function spotlightInstance(instanceId) {
        if (!els.instCard || !els.semCard) return;
        if (instanceId === null) {
            els.instCard.classList.remove("is-spotlight", "is-dimmed");
            els.semCard.classList.remove("is-spotlight", "is-dimmed");
            return;
        }
        els.instCard.classList.add("is-spotlight");
        els.semCard.classList.add("is-dimmed");
    }

    // Hover: 高亮某类，其余变暗
    function spotlightClass(classId) {
        if (!els.instCard || !els.semCard) return;
        if (classId === null) {
            els.instCard.classList.remove("is-spotlight", "is-dimmed");
            els.semCard.classList.remove("is-spotlight", "is-dimmed");
            return;
        }
        els.semCard.classList.add("is-spotlight");
        els.instCard.classList.add("is-dimmed");
    }

    // Click lock: 锁定某实例
    function lockInstance(instanceId) {
        if (!els.instCard || !els.semCard) return;
        if (instanceId === null) {
            els.instCard.classList.remove("is-locked");
            els.semCard.classList.remove("is-locked");
        } else {
            els.instCard.classList.add("is-locked");
            els.semCard.classList.add("is-locked");
            state.selectedInstanceId = instanceId;
            drawInstanceMasks(state.instance);
            renderInstanceLegend();
        }
    }

    root.dataset.linkMode = state.linkMode;
    root.dataset.step = state.step;

    fetch(`${dataRoot}/overview/instance_samples.json?v=20260625-samples4`)
        .then((response) => {
            if (!response.ok) throw new Error(`sample http ${response.status}`);
            return response.json();
        })
        .then((data) => {
            state.data = data;
            initControls();
            switchSample(data.default_sample || data.samples[0]?.id);
        })
        .catch((error) => {
            els.status.textContent = "DATA ERROR";
            els.inspector.innerHTML = `<div><dt>数据加载失败</dt><dd>${esc(error.message)}</dd></div>`;
        });

    window.addEventListener("beforeunload", () => {
        state.semanticClient?.dispose?.();
        state.instanceClient?.dispose?.();
        if (state.customUrl) URL.revokeObjectURL(state.customUrl);
        if (state.playTimer) clearTimeout(state.playTimer);
        if (els.inspectorTooltip) els.inspectorTooltip.remove();
    });
}());
