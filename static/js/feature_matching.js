(function () {
    "use strict";
    const V = window.FeatureViz;
    if (!V) return;
    const form = document.getElementById("featureMatchForm");
    if (!form) return;
    V.setupSamples(form);
    V.bindFileNames(form);
    let requestId = 0;
    const sampleFiles = {
        building: "house.png",
        checker: "cameraman.png",
        book: "brick.png",
        texture: "checkerboard.png",
        peppers: "peppers_color.png"
    };

    function selectedAlgorithm() {
        return V.$("matchAlgorithm")?.value || "sift";
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function rotatedImageSource(src) {
        const image = await V.loadImage(src);
        const angle = -18 * Math.PI / 180;
        const sin = Math.abs(Math.sin(angle));
        const cos = Math.abs(Math.cos(angle));
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const canvas = document.createElement("canvas");
        V.setCanvasSize(canvas, width * cos + height * sin, width * sin + height * cos);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        ctx.drawImage(image, -width / 2, -height / 2);
        return canvas.toDataURL("image/png");
    }

    async function matchImageSources() {
        const fileA = form.querySelector('input[name="image_a"]')?.files?.[0];
        const fileB = form.querySelector('input[name="image_b"]')?.files?.[0];
        const example = form.querySelector("[data-example-input]")?.value || "book";
        const left = fileA ? await readFileAsDataURL(fileA) : `${V.assetsBase}${sampleFiles[example] || sampleFiles.book}`;
        const right = fileB ? await readFileAsDataURL(fileB) : await rotatedImageSource(left);
        return { left, right };
    }

    async function drawMatch(data) {
        const canvas = V.$("matchCanvas");
        if (!canvas) return;
        const left = await V.loadImage(data.images.left);
        const right = await V.loadImage(data.images.right);
        const gap = 24;
        const h = Math.max(left.naturalHeight, right.naturalHeight);
        const w = left.naturalWidth + right.naturalWidth + gap;
        V.setCanvasSize(canvas, w, h);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(left, 0, 0);
        ctx.drawImage(right, left.naturalWidth + gap, 0);
        const ox = left.naturalWidth + gap;
        const points = data.points || data.extended_points || data.oriented_keypoints || {};
        const leftPoints = points.left || [];
        const rightPoints = points.right || [];
        (data.matches || []).forEach(m => {
            const leftPoint = leftPoints[m.left_index];
            const rightPoint = rightPoints[m.right_index];
            if (!leftPoint || !rightPoint) return;
            const color = m.passed ? "rgba(37,99,235,.78)" : (m.ratio > 0.95 ? "rgba(220,38,38,.86)" : "rgba(148,163,184,.55)");
            ctx.strokeStyle = color;
            ctx.lineWidth = m.passed ? 1.4 : 1;
            ctx.beginPath();
            ctx.moveTo(leftPoint.x, leftPoint.y);
            ctx.lineTo(ox + rightPoint.x, rightPoint.y);
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(leftPoint.x, leftPoint.y, 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(ox + rightPoint.x, rightPoint.y, 3, 0, Math.PI * 2); ctx.stroke();
        });
    }

    function renderTable(data) {
        const tbody = document.querySelector("#matchTable tbody");
        if (!tbody) return;
        const points = data.points || data.extended_points || data.oriented_keypoints || {};
        const leftPoints = points.left || [];
        const rightPoints = points.right || [];
        tbody.innerHTML = (data.matches || []).slice(0, 8).map(m => {
            const left = leftPoints[m.left_index] || {};
            const right = rightPoints[m.right_index] || {};
            return `<tr><td>${m.rank}</td><td>(${left.x ?? "-"}, ${left.y ?? "-"})</td><td>(${right.x ?? "-"}, ${right.y ?? "-"})</td><td>${m.distance}</td><td>${m.second_distance}</td><td>${m.ratio}</td><td class="${m.passed ? 'pass' : 'fail'}">${m.passed ? '通过' : '未通过'}</td></tr>`;
        }).join("");
    }

    async function render(data) {
        await drawMatch(data);
        const s = data.stats || {};
        const info = V.featureAlgorithmInfo(data.algorithm || selectedAlgorithm());
        V.renderStatList(V.$("matchStats"), [
            ["算法", info.name],
            ["左图关键点", s.left_keypoints || 0],
            ["右图关键点", s.right_keypoints || 0],
            ["描述子", s.descriptor_type || info.descriptorType],
            ["维度", s.descriptor_dim || info.descriptorDim],
            ["距离", s.distance_type || info.distanceType],
            ["原始匹配", s.raw_matches || 0],
            ["通过匹配", s.good_matches || s.passed_matches || 0],
            ["处理耗时", `${data.meta?.elapsed_ms || 0} ms`]
        ]);
        if (V.$("matchInfoResult")) {
            V.renderStatList(V.$("matchInfoResult"), [
                ["算法", info.name],
                ["左图特征", s.left_keypoints || 0],
                ["右图特征", s.right_keypoints || 0],
                ["原始匹配", s.raw_matches || 0],
                ["通过匹配", s.good_matches || s.passed_matches || 0],
                ["处理耗时", `${data.meta?.elapsed_ms || 0} ms`]
            ]);
        }
        renderTable(data);
        V.$("matchElapsed").textContent = `${data.meta.elapsed_ms} ms`;
    }

    async function frontendMatch(algorithm) {
        const started = performance.now();
        const ratio = Number(form.querySelector('[name="ratio_threshold"]')?.value) || 0.75;
        const maxMatches = Number(form.querySelector('[name="max_matches"]')?.value) || 80;
        const images = await matchImageSources();
        const [leftGray, rightGray] = await Promise.all([V.imageToGray(images.left), V.imageToGray(images.right)]);
        const options = { maxKeypoints: 500, threshold: 30, contiguous: 9, nmsRadius: 8 };
        const left = V.computeDescriptorSet(leftGray, algorithm, options);
        const right = V.computeDescriptorSet(rightGray, algorithm, options);
        const matched = V.matchDescriptorSets(left, right, { ratio, maxMatches });
        const good = matched.matches.filter(item => item.passed);
        return {
            success: true,
            algorithm,
            images,
            points: { left: left.keypoints, right: right.keypoints },
            matches: matched.matches,
            stats: {
                left_keypoints: left.keypoints.length,
                right_keypoints: right.keypoints.length,
                descriptor_type: left.descriptorType,
                descriptor_dim: left.descriptorDim,
                distance_type: left.distanceType,
                raw_matches: matched.rawMatches,
                good_matches: good.length,
                passed_matches: matched.passedMatches,
                avg_distance: good.length ? Math.round(good.reduce((sum, item) => sum + item.distance, 0) / good.length * 1000) / 1000 : 0
            },
            meta: { elapsed_ms: Math.round((performance.now() - started) * 100) / 100 }
        };
    }

    function syncAlgorithmUi() {
        const algorithm = selectedAlgorithm();
        const info = V.featureAlgorithmInfo(algorithm);
        const distance = V.$("matchDistanceLabel");
        if (distance) distance.value = info.distanceType === "Hamming" ? "Hamming 汉明距离" : "L2 欧氏距离";
        
        if (V.$("matchInfoTitle")) {
            V.$("matchInfoTitle").textContent = "特征匹配应用";
            V.$("matchInfoGoal").textContent = "在两张图像中建立特征点的对应关系，找出相似度高的描述子对。";
            V.$("matchInfoIO").textContent = "输入：两组特征点描述子 → 输出：匹配对与连线";
            
            const formulaBox = V.$("matchInfoLogic");
            if (formulaBox) {
                const distanceFormula = info.distanceType === "Hamming" 
                    ? "d_H(A,B)=\\operatorname{popcount}(A\\oplus B)" 
                    : "d_E(A,B)=\\sqrt{\\sum(A_i-B_i)^2}";
                formulaBox.innerHTML = `
                    <p class="latex-formula"></p>
                    <ul class="feature-note-detail">
                        <li><b>距离类型</b>: ${info.distanceType === "Hamming" ? "FAST+BRIEF、ORB-lite 使用 Hamming 距离。" : "SIFT、SURF 使用 L2 距离。"}</li>
                        <li><b>Ratio Test</b>: d1 / d2 &lt; ratio，满足时保留，减少模糊匹配。</li>
                    </ul>
                `;
                const target = formulaBox.querySelector(".latex-formula");
                if (window.katex && target) {
                    try { window.katex.render(distanceFormula, target, { throwOnError: false }); } 
                    catch (e) { target.textContent = distanceFormula; }
                } else if (target) {
                    target.textContent = distanceFormula;
                }
            }
            V.$("matchInfoNext").textContent = "本页只展示描述子匹配，不做 RANSAC 或 Homography 几何验证。";
            
            const params = [
                ["Ratio Test", form.elements["ratio_threshold"]?.value || "-"],
                ["最大匹配数", form.elements["max_matches"]?.value || "-"]
            ];
            const paramsContainer = V.$("matchInfoParams");
            if (paramsContainer) {
                paramsContainer.parentElement.hidden = params.length === 0;
                V.renderStatList(paramsContainer, params);
            }
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const currentRequest = ++requestId;
        const btn = form.querySelector("button[type=submit]");
        const algorithm = selectedAlgorithm();
        if (btn) btn.textContent = "匹配中...";
        try {
            const data = algorithm === "sift"
                ? { ...(await V.postForm(form, "/api/feature-match")), algorithm: "sift" }
                : await frontendMatch(algorithm);
            if (currentRequest !== requestId) return;
            await render(data);
        } catch (err) { }
        finally { if (currentRequest === requestId && btn) btn.textContent = "执行特征匹配"; }
    });
    V.$("matchAlgorithm")?.addEventListener("change", () => {
        syncAlgorithmUi();
        form.requestSubmit();
    });
    V.bindAutoSubmit(form);
    syncAlgorithmUi();
    form.requestSubmit();
})();
