(function () {
    "use strict";

    const V = window.FeatureViz;
    const form = document.getElementById("featureMatchForm");
    if (!V || !form) return;

    V.setupSamples(form);
    V.bindFileNames(form);
    const initialExample = form.querySelector("[data-example-input]")?.value;
    form.querySelectorAll("[data-example]").forEach(button => {
        button.classList.toggle("is-active", button.dataset.example === initialExample);
    });

    const sampleFiles = {
        building: "house.png",
        checker: "cameraman.png",
        book: "brick.png",
        texture: "checkerboard.png",
        peppers: "peppers_color.png"
    };
    const stepDefinitions = [
        {
            key: "detect",
            label: "Detect",
            title: "检测稳定关键点",
            goal: "在两幅图像中寻找可重复定位的局部结构。",
            io: "输入：图像 A / B → 输出：两组关键点坐标、尺度与方向",
            formula: "p_i=(x_i,y_i,\\sigma_i,\\theta_i)",
            logic: "SIFT 与 SURF关注尺度结构，FAST 系方法优先检测高对比角点。",
            next: "把每个关键点周围的局部外观编码为描述子。"
        },
        {
            key: "descriptor",
            label: "Descriptor",
            title: "生成局部描述子",
            goal: "把关键点邻域转换为可比较的数值向量或二进制串。",
            io: "输入：关键点邻域 → 输出：float / binary descriptor",
            formula: "\\mathbf f_i\\in\\mathbb R^D\\quad\\text{or}\\quad\\mathbf b_i\\in\\{0,1\\}^D",
            logic: "浮点描述子表达梯度统计，二进制描述子记录像素对比较结果。",
            next: "根据描述子类型选择 L2 或 Hamming 距离。"
        },
        {
            key: "distance",
            label: "Distance",
            title: "计算描述子距离",
            goal: "量化左图描述子与右图候选描述子的相似程度。",
            io: "输入：两组描述子 → 输出：距离矩阵",
            formula: "d_E=\\sqrt{\\sum_i(a_i-b_i)^2},\\qquad d_H=\\operatorname{popcount}(a\\oplus b)",
            logic: "SIFT、SURF 使用 L2；FAST+BRIEF、ORB-lite 使用 Hamming。",
            next: "为每个左图描述子保留距离最小的两个候选。"
        },
        {
            key: "nearest",
            label: "2-NN",
            title: "搜索两个最近邻",
            goal: "同时观察最佳候选 d1 与次佳候选 d2，判断匹配是否具有区分度。",
            io: "输入：一行距离矩阵 → 输出：最近邻 d1 与次近邻 d2",
            formula: "d_1=\\min_j d(i,j),\\qquad d_2=\\min_{j\\ne j_1}d(i,j)",
            logic: "只取最近邻容易接受重复纹理，第二近邻提供局部歧义参照。",
            next: "用 d1 / d2 执行 ratio test。"
        },
        {
            key: "ratio",
            label: "Ratio Test",
            title: "过滤描述子歧义",
            goal: "保留明显优于第二候选的匹配，剔除重复纹理和相似局部。",
            io: "输入：d1、d2、阈值 τ → 输出：ratio 通过 / 失败",
            formula: "\\rho=\\frac{d_1}{d_2}<\\tau",
            logic: "蓝色表示 ratio 通过，红色表示 ratio 失败；阈值越小越严格。",
            next: "对 ratio 通过的匹配执行几何一致性验证。"
        },
        {
            key: "ransac",
            label: "RANSAC",
            title: "验证几何一致性",
            goal: "从含外点的匹配中反复采样最小集合，寻找支持最多的仿射模型。",
            io: "输入：ratio 通过匹配 → 输出：RANSAC 内点与几何外点",
            formula: "e_i=\\lVert p_i'-T(p_i)\\rVert_2,\\qquad e_i\\le\\varepsilon",
            logic: "动画依次展示采样、拟合、投影、误差判定，以及当前与 best 内点数。",
            next: "使用最佳内点模型作为最终仿射变换。"
        },
        {
            key: "transform",
            label: "Transform",
            title: "估计齐次变换矩阵",
            goal: "用最佳 RANSAC 模型描述图像 A 到图像 B 的平移、旋转、缩放和剪切。",
            io: "输入：RANSAC 最佳内点 → 输出：Affine 的 3×3 齐次矩阵 H_A",
            formula: "\\begin{bmatrix}x'\\\\y'\\\\1\\end{bmatrix}=H_A\\begin{bmatrix}x\\\\y\\\\1\\end{bmatrix},\\quad H_A=\\begin{bmatrix}a&c&e\\\\b&d&f\\\\0&0&1\\end{bmatrix}",
            logic: "当前教学实现使用 Affine；平面透视场景可替换为 Homography H，并用四角投影得到目标定位框。",
            next: "把图像 A 按最终矩阵映射到图像 B 坐标系。"
        },
        {
            key: "warp",
            label: "Warp Preview",
            title: "预览图像配准",
            goal: "叠加参考图与变换后的图像，直观看到几何模型的对齐效果。",
            io: "输入：图像 A、图像 B、仿射矩阵 → 输出：半透明配准预览",
            formula: "I_{warp}(x',y')=I_A\\left(T^{-1}(x',y')\\right)",
            logic: "绿色边框是变换后 A 的目标定位范围；Homography 也可用同样的四角投影方式定位目标。",
            next: "本页停留在配准与目标定位；完整 panorama / blend 将在后续独立页面展开。"
        }
    ];
    const ransacPhases = ["随机采样", "拟合模型", "投影对应点", "误差判定", "更新 Best"];
    const state = {
        requestId: 0,
        data: null,
        images: null,
        view: "matches",
        step: 0,
        selectedMatch: 0,
        hoverMatch: -1,
        hitLines: [],
        warpOpacity: 0.46,
        ransacPlaying: true,
        ransacStartedAt: performance.now(),
        ransacFrame: 0,
        renderToken: 0
    };

    const $ = id => document.getElementById(id);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const fixed = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
    const pointLabel = point => `(${fixed(point?.x, 1)}, ${fixed(point?.y, 1)})`;

    function selectedAlgorithm() {
        return $("matchAlgorithm")?.value || "sift";
    }

    function formNumber(name, fallback, min, max) {
        return clamp(number(form.elements[name]?.value, fallback), min, max);
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

    function seededRandom(seed) {
        let value = seed >>> 0;
        return function () {
            value += 0x6D2B79F5;
            let t = value;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function solveLinear(matrix, vector) {
        const n = vector.length;
        const augmented = matrix.map((row, index) => row.slice().concat(vector[index]));
        for (let col = 0; col < n; col += 1) {
            let pivot = col;
            for (let row = col + 1; row < n; row += 1) {
                if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
            }
            if (Math.abs(augmented[pivot][col]) < 1e-8) return null;
            [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
            const divisor = augmented[col][col];
            for (let j = col; j <= n; j += 1) augmented[col][j] /= divisor;
            for (let row = 0; row < n; row += 1) {
                if (row === col) continue;
                const factor = augmented[row][col];
                for (let j = col; j <= n; j += 1) augmented[row][j] -= factor * augmented[col][j];
            }
        }
        return augmented.map(row => row[n]);
    }

    function estimateAffine(matches, leftPoints, rightPoints) {
        if (!matches || matches.length < 3) return null;
        const matrix = [];
        const vector = [];
        matches.slice(0, 3).forEach(match => {
            const left = leftPoints[match.left_index];
            const right = rightPoints[match.right_index];
            if (!left || !right) return;
            matrix.push([left.x, left.y, 0, 0, 1, 0]);
            vector.push(right.x);
            matrix.push([0, 0, left.x, left.y, 0, 1]);
            vector.push(right.y);
        });
        if (matrix.length !== 6) return null;
        const solution = solveLinear(matrix, vector);
        if (!solution || solution.some(value => !Number.isFinite(value))) return null;
        return {
            a: solution[0],
            c: solution[1],
            b: solution[2],
            d: solution[3],
            e: solution[4],
            f: solution[5]
        };
    }

    function estimateAffineLeastSquares(matches, leftPoints, rightPoints) {
        if (!matches || matches.length < 3) return null;
        const design = [];
        const values = [];
        matches.forEach(match => {
            const left = leftPoints[match.left_index];
            const right = rightPoints[match.right_index];
            if (!left || !right) return;
            design.push([left.x, left.y, 0, 0, 1, 0]);
            values.push(right.x);
            design.push([0, 0, left.x, left.y, 0, 1]);
            values.push(right.y);
        });
        if (design.length < 6) return null;
        const normal = Array.from({ length: 6 }, () => Array(6).fill(0));
        const rhs = Array(6).fill(0);
        design.forEach((row, rowIndex) => {
            for (let i = 0; i < 6; i += 1) {
                rhs[i] += row[i] * values[rowIndex];
                for (let j = 0; j < 6; j += 1) normal[i][j] += row[i] * row[j];
            }
        });
        const solution = solveLinear(normal, rhs);
        if (!solution || solution.some(value => !Number.isFinite(value))) return null;
        return {
            a: solution[0],
            c: solution[1],
            b: solution[2],
            d: solution[3],
            e: solution[4],
            f: solution[5]
        };
    }

    function projectPoint(model, point) {
        return {
            x: model.a * point.x + model.c * point.y + model.e,
            y: model.b * point.x + model.d * point.y + model.f
        };
    }

    function evaluateModel(model, matches, leftPoints, rightPoints, threshold) {
        const errors = [];
        const inliers = [];
        matches.forEach((match, index) => {
            const left = leftPoints[match.left_index];
            const right = rightPoints[match.right_index];
            if (!left || !right || !model) {
                errors.push(Infinity);
                return;
            }
            const projected = projectPoint(model, left);
            const error = Math.hypot(projected.x - right.x, projected.y - right.y);
            errors.push(error);
            if (error <= threshold) inliers.push(index);
        });
        const meanError = inliers.length
            ? inliers.reduce((sum, index) => sum + errors[index], 0) / inliers.length
            : Infinity;
        return { errors, inliers, meanError };
    }

    function fallbackTransform(matches, leftPoints, rightPoints) {
        const offsets = matches.map(match => {
            const left = leftPoints[match.left_index];
            const right = rightPoints[match.right_index];
            return left && right ? { x: right.x - left.x, y: right.y - left.y } : null;
        }).filter(Boolean);
        if (!offsets.length) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        offsets.sort((a, b) => a.x - b.x);
        const tx = offsets[Math.floor(offsets.length / 2)].x;
        offsets.sort((a, b) => a.y - b.y);
        const ty = offsets[Math.floor(offsets.length / 2)].y;
        return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
    }

    function sampleThree(matches, random) {
        const picked = new Set();
        while (picked.size < Math.min(3, matches.length)) {
            picked.add(Math.floor(random() * matches.length));
        }
        return Array.from(picked);
    }

    function correspondenceKey(match, leftPoints, rightPoints) {
        const left = leftPoints[match.left_index];
        const right = rightPoints[match.right_index];
        if (!left || !right) return "";
        return [left.x, left.y, right.x, right.y].map(value => Number(value).toFixed(2)).join(":");
    }

    function runRansac(matches, leftPoints, rightPoints, threshold, iterations) {
        const uniqueByCoordinates = new Map();
        matches.filter(match => match.ratio_passed).forEach(match => {
            const key = correspondenceKey(match, leftPoints, rightPoints);
            const current = uniqueByCoordinates.get(key);
            if (!current || match.ratio < current.ratio) uniqueByCoordinates.set(key, match);
        });
        const candidates = Array.from(uniqueByCoordinates.values());
        const seed = candidates.reduce((sum, match) => sum + match.left_index * 31 + match.right_index * 17, 2026);
        const random = seededRandom(seed);
        const rounds = [];
        let bestModel = null;
        let bestEvaluation = { inliers: [], errors: [], meanError: Infinity };
        const loopCount = candidates.length >= 3 ? iterations : 1;

        for (let iteration = 0; iteration < loopCount; iteration += 1) {
            const sampleIndices = candidates.length >= 3 ? sampleThree(candidates, random) : candidates.map((_, index) => index);
            const sample = sampleIndices.map(index => candidates[index]);
            const model = candidates.length >= 3
                ? estimateAffine(sample, leftPoints, rightPoints)
                : fallbackTransform(candidates, leftPoints, rightPoints);
            if (!model) continue;
            const evaluation = evaluateModel(model, candidates, leftPoints, rightPoints, threshold);
            const isBetter = evaluation.inliers.length > bestEvaluation.inliers.length
                || (evaluation.inliers.length === bestEvaluation.inliers.length && evaluation.meanError < bestEvaluation.meanError);
            if (isBetter) {
                bestModel = model;
                bestEvaluation = evaluation;
            }
            if (rounds.length < 24 || iteration === loopCount - 1 || isBetter) {
                rounds.push({
                    iteration: iteration + 1,
                    sampleIndices,
                    sampleRanks: sample.map(match => match.rank),
                    model,
                    inliers: evaluation.inliers.slice(),
                    errors: evaluation.errors.slice(),
                    meanError: evaluation.meanError,
                    bestCount: bestEvaluation.inliers.length
                });
            }
        }

        if (!bestModel) {
            bestModel = fallbackTransform(candidates, leftPoints, rightPoints);
            bestEvaluation = evaluateModel(bestModel, candidates, leftPoints, rightPoints, threshold);
        }

        for (let refinement = 0; refinement < 2 && bestEvaluation.inliers.length >= 3; refinement += 1) {
            const inlierMatches = bestEvaluation.inliers.map(index => candidates[index]);
            const refinedModel = estimateAffineLeastSquares(inlierMatches, leftPoints, rightPoints);
            if (!refinedModel) break;
            bestModel = refinedModel;
            bestEvaluation = evaluateModel(bestModel, candidates, leftPoints, rightPoints, threshold);
        }

        const bestInlierKeys = new Set(
            bestEvaluation.inliers.map(index => correspondenceKey(candidates[index], leftPoints, rightPoints))
        );
        const enriched = matches.map(match => {
            const left = leftPoints[match.left_index];
            const right = rightPoints[match.right_index];
            const projected = match.ratio_passed && left ? projectPoint(bestModel, left) : null;
            const error = projected && right ? Math.hypot(projected.x - right.x, projected.y - right.y) : Infinity;
            const inlier = Boolean(match.ratio_passed && bestInlierKeys.has(correspondenceKey(match, leftPoints, rightPoints)));
            let status = "描述子不确定";
            if (match.ratio_passed && !inlier) status = "几何误匹配";
            if (inlier) status = "有效匹配";
            return {
                ...match,
                ransac_inlier: inlier,
                reprojection_error: match.ratio_passed && Number.isFinite(error) ? Math.round(error * 1000) / 1000 : null,
                projected_point: projected,
                geometry_status: status
            };
        });
        return { matches: enriched, transform: bestModel, evaluation: bestEvaluation, rounds, candidates };
    }

    function normalizeMatchData(raw, algorithm) {
        const info = V.featureAlgorithmInfo(algorithm);
        const pointSource = raw.points || raw.extended_points || raw.oriented_keypoints || {};
        const leftPoints = (pointSource.left || []).map(point => ({
            ...point,
            x: number(point.x),
            y: number(point.y)
        }));
        const rightPoints = (pointSource.right || []).map(point => ({
            ...point,
            x: number(point.x),
            y: number(point.y)
        }));
        const ratioThreshold = formNumber("ratio_threshold", 0.75, 0.4, 0.95);
        const threshold = formNumber("ransac_threshold", 4, 1, 20);
        const iterations = Math.round(formNumber("ransac_iterations", 80, 20, 400));
        const matches = (raw.matches || []).map((match, index) => {
            const ratio = number(match.ratio, number(match.distance) / Math.max(1e-9, number(match.second_distance, 1)));
            const ratioPassed = typeof match.passed === "boolean" ? match.passed : ratio < ratioThreshold;
            return {
                ...match,
                rank: number(match.rank, index + 1),
                left_index: number(match.left_index, -1),
                right_index: number(match.right_index, -1),
                distance: number(match.distance),
                second_distance: number(match.second_distance),
                ratio,
                passed: ratioPassed,
                ratio_passed: ratioPassed
            };
        }).filter(match => leftPoints[match.left_index] && rightPoints[match.right_index]);
        const geometry = runRansac(matches, leftPoints, rightPoints, threshold, iterations);
        const ratioPassed = geometry.matches.filter(match => match.ratio_passed);
        const uniqueInlierCount = geometry.evaluation.inliers.length;
        const uniqueCandidateCount = geometry.candidates.length;
        const uniqueInlierErrors = geometry.evaluation.inliers.map(index => geometry.evaluation.errors[index]);
        const stats = {
            ...(raw.stats || {}),
            left_keypoints: number(raw.stats?.left_keypoints, leftPoints.length),
            right_keypoints: number(raw.stats?.right_keypoints, rightPoints.length),
            descriptor_type: raw.stats?.descriptor_type || info.descriptorType,
            descriptor_dim: raw.stats?.descriptor_dim || info.descriptorDim,
            distance_type: raw.stats?.distance_type || info.distanceType,
            raw_matches: number(raw.stats?.raw_matches, geometry.matches.length),
            passed_matches: ratioPassed.length,
            good_matches: ratioPassed.length,
            geometry_candidates: uniqueCandidateCount,
            inlier_matches: uniqueInlierCount,
            outlier_matches: uniqueCandidateCount - uniqueInlierCount,
            inlier_ratio: uniqueCandidateCount ? uniqueInlierCount / uniqueCandidateCount : 0,
            mean_reprojection_error: uniqueInlierErrors.length
                ? uniqueInlierErrors.reduce((sum, error) => sum + number(error), 0) / uniqueInlierErrors.length
                : 0,
            ratio_threshold: ratioThreshold,
            ransac_threshold: threshold,
            ransac_iterations: iterations
        };
        return {
            ...raw,
            success: raw.success !== false,
            algorithm,
            points: { left: leftPoints, right: rightPoints },
            matches: geometry.matches,
            transform: geometry.transform,
            ransac: {
                threshold,
                iterations,
                rounds: geometry.rounds,
                best_inliers: geometry.evaluation.inliers.length
            },
            stats,
            meta: { ...(raw.meta || {}), elapsed_ms: number(raw.meta?.elapsed_ms) }
        };
    }

    async function frontendMatch(algorithm) {
        const started = performance.now();
        const ratio = formNumber("ratio_threshold", 0.75, 0.4, 0.95);
        const maxMatches = Math.round(formNumber("max_matches", 80, 10, 200));
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
                avg_distance: good.length
                    ? good.reduce((sum, item) => sum + item.distance, 0) / good.length
                    : 0
            },
            meta: { elapsed_ms: Math.round((performance.now() - started) * 100) / 100 }
        };
    }

    function lineDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        if (!lengthSquared) return Math.hypot(px - x1, py - y1);
        const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function drawPoint(ctx, x, y, color, radius = 3) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    function matchColor(match, view) {
        if (view === "matches") return match.ratio_passed ? "#2563eb" : "#dc2626";
        return match.ransac_inlier ? "#16a34a" : "#dc2626";
    }

    async function loadResultImages(data, token) {
        const [left, right] = await Promise.all([V.loadImage(data.images.left), V.loadImage(data.images.right)]);
        if (token !== state.renderToken) return null;
        return { left, right };
    }

    function drawMatchLines(data, images) {
        const canvas = $("matchCanvas");
        const left = images.left;
        const right = images.right;
        const gap = 28;
        const leftWidth = left.naturalWidth || left.width;
        const rightWidth = right.naturalWidth || right.width;
        const height = Math.max(left.naturalHeight || left.height, right.naturalHeight || right.height);
        const width = leftWidth + rightWidth + gap;
        V.setCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(left, 0, 0);
        ctx.drawImage(right, leftWidth + gap, 0);
        ctx.fillStyle = "#dbeafe";
        ctx.fillRect(leftWidth, 0, gap, height);
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "700 12px sans-serif";
        ctx.fillText("A", 10, 19);
        ctx.fillText("B", leftWidth + gap + 10, 19);
        const offsetX = leftWidth + gap;
        const passedLimit = data.matches.length > 50 ? 48 : data.matches.length;
        const failedLimit = data.matches.length > 50 ? 12 : data.matches.length;
        let passedShown = 0;
        let failedShown = 0;
        const visibleMatches = data.matches
            .map((match, index) => ({ match, index }))
            .filter(({ match, index }) => {
                if (index === state.selectedMatch || index === state.hoverMatch) return true;
                if (match.ratio_passed) return passedShown++ < passedLimit;
                return failedShown++ < failedLimit;
            });
        const hitLines = [];
        visibleMatches.forEach(({ match, index }) => {
            const leftPoint = data.points.left[match.left_index];
            const rightPoint = data.points.right[match.right_index];
            if (!leftPoint || !rightPoint) return;
            const color = matchColor(match, state.view);
            const selected = index === state.selectedMatch || index === state.hoverMatch;
            const isRatioFailure = !match.ratio_passed;
            const isGeometryOutlier = state.view === "ransac" && match.ratio_passed && !match.ransac_inlier;
            ctx.save();
            ctx.globalAlpha = selected ? 1 : (isRatioFailure ? 0.68 : (isGeometryOutlier ? 0.84 : 0.72));
            ctx.strokeStyle = color;
            ctx.lineWidth = selected ? 3.5 : (isGeometryOutlier ? 2.4 : (isRatioFailure ? 1.8 : (match.ransac_inlier ? 1.8 : 1.2)));
            if (!selected && isRatioFailure) ctx.setLineDash([4, 4]);
            else if (!selected && isGeometryOutlier) ctx.setLineDash([11, 4]);
            if (isRatioFailure || isGeometryOutlier) {
                ctx.shadowColor = "rgba(220,38,38,.42)";
                ctx.shadowBlur = selected ? 8 : 4;
            }
            ctx.beginPath();
            ctx.moveTo(leftPoint.x, leftPoint.y);
            ctx.lineTo(offsetX + rightPoint.x, rightPoint.y);
            ctx.stroke();
            drawPoint(ctx, leftPoint.x, leftPoint.y, color, selected ? 4.5 : 3);
            drawPoint(ctx, offsetX + rightPoint.x, rightPoint.y, color, selected ? 4.5 : 3);
            ctx.restore();
            hitLines.push({
                index,
                x1: leftPoint.x,
                y1: leftPoint.y,
                x2: offsetX + rightPoint.x,
                y2: rightPoint.y
            });
        });
        state.hitLines = hitLines;
    }

    function drawWarpPreview(data, images) {
        const canvas = $("matchCanvas");
        const left = images.left;
        const right = images.right;
        const width = right.naturalWidth || right.width;
        const height = right.naturalHeight || right.height;
        V.setCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(right, 0, 0);
        const t = data.transform;
        ctx.save();
        ctx.globalAlpha = state.warpOpacity;
        ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
        ctx.drawImage(left, 0, 0);
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.fillRect(10, 10, 218, 30);
        ctx.fillStyle = "#1e3a8a";
        ctx.font = "700 12px sans-serif";
        ctx.fillText(`参考图 B + ${Math.round(state.warpOpacity * 100)}% 变换后图 A`, 20, 30);
        const corners = [
            projectPoint(t, { x: 0, y: 0 }),
            projectPoint(t, { x: left.naturalWidth || left.width, y: 0 }),
            projectPoint(t, { x: left.naturalWidth || left.width, y: left.naturalHeight || left.height }),
            projectPoint(t, { x: 0, y: left.naturalHeight || left.height })
        ];
        ctx.save();
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        corners.forEach((corner, index) => {
            if (index === 0) ctx.moveTo(corner.x, corner.y);
            else ctx.lineTo(corner.x, corner.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        data.matches.filter(match => match.ransac_inlier).slice(0, 40).forEach(match => {
            const rightPoint = data.points.right[match.right_index];
            if (rightPoint) drawPoint(ctx, rightPoint.x, rightPoint.y, "#16a34a", 3);
        });
        state.hitLines = [];
    }

    async function drawMainCanvas() {
        if (!state.data) return;
        const token = ++state.renderToken;
        const images = state.images || await loadResultImages(state.data, token);
        if (!images || token !== state.renderToken) return;
        state.images = images;
        if (state.view === "warp") drawWarpPreview(state.data, images);
        else drawMatchLines(state.data, images);
        $("matchEmptyState").hidden = true;
    }

    function setView(view, fromStep = false) {
        if (!["matches", "ransac", "warp"].includes(view)) return;
        state.view = view;
        document.querySelectorAll("[data-match-view]").forEach(button => {
            button.classList.toggle("is-active", button.dataset.matchView === view);
        });
        $("warpOpacityControl").hidden = view !== "warp";
        const viewCopy = {
            matches: ["Matching Lines", "描述子匹配与 Ratio Test"],
            ransac: ["Geometry Verification", "RANSAC 内点与几何外点"],
            warp: ["Registration Preview", "仿射变换与配准预览"]
        };
        $("matchStageLabel").textContent = viewCopy[view][0];
        $("matchStageTitle").textContent = viewCopy[view][1];
        if (!fromStep) {
            if (view === "matches") setStep(4, true);
            if (view === "ransac") setStep(5, true);
            if (view === "warp") setStep(7, true);
        }
        updatePhaseStrip();
        drawMainCanvas();
    }

    function updatePhaseStrip() {
        const phase = state.step >= 7 ? 7 : state.step >= 5 ? 5 : state.step >= 4 ? 4 : 0;
        document.querySelectorAll("[data-phase-step]").forEach(button => {
            button.classList.toggle("is-active", number(button.dataset.phaseStep) === phase);
        });
    }

    function renderStats(data) {
        const stats = data.stats;
        const info = V.featureAlgorithmInfo(data.algorithm);
        V.renderStatList($("descriptorStats"), [
            ["算法", info.name],
            ["左 / 右关键点", `${stats.left_keypoints} / ${stats.right_keypoints}`],
            ["描述子", `${stats.descriptor_type} · ${stats.descriptor_dim}`],
            ["距离度量", stats.distance_type]
        ]);
        V.renderStatList($("matchingStats"), [
            ["原始候选", stats.raw_matches],
            ["Ratio 阈值", fixed(stats.ratio_threshold, 2)],
            ["Ratio 通过", stats.passed_matches],
            ["过滤数量", Math.max(0, stats.raw_matches - stats.passed_matches)]
        ]);
        V.renderStatList($("geometryStats"), [
            ["RANSAC 内点", `${stats.inlier_matches}（坐标去重）`],
            ["几何外点", stats.outlier_matches],
            ["内点率", `${fixed(stats.inlier_ratio * 100, 1)}%`],
            ["平均重投影误差", `${fixed(stats.mean_reprojection_error, 2)} px`],
            ["变换模型", "Affine · 3×3 H_A"]
        ]);
    }

    function statusClass(match) {
        if (match.ransac_inlier) return "status-inlier";
        if (match.ratio_passed) return "status-outlier";
        return "status-ratio-fail";
    }

    function renderTable(data) {
        const tbody = document.querySelector("#matchTable tbody");
        if (!tbody) return;
        tbody.innerHTML = data.matches.slice(0, 24).map((match, index) => {
            const left = data.points.left[match.left_index];
            const right = data.points.right[match.right_index];
            return `<tr data-match-index="${index}" class="${index === state.selectedMatch ? "is-selected" : ""}">
                <td>${match.rank}</td>
                <td>${pointLabel(left)}</td>
                <td>${pointLabel(right)}</td>
                <td>${fixed(match.distance, 3)}</td>
                <td>${fixed(match.second_distance, 3)}</td>
                <td>${fixed(match.ratio, 3)}</td>
                <td>${match.ransac_inlier ? "内点" : (match.ratio_passed ? "外点" : "-")}</td>
                <td>${match.reprojection_error == null ? "-" : `${fixed(match.reprojection_error, 2)} px`}</td>
                <td><span class="match-status ${statusClass(match)}">${match.geometry_status}</span></td>
            </tr>`;
        }).join("");
    }

    function renderProbeOptions(data) {
        const select = $("matchProbeSelect");
        select.innerHTML = data.matches.slice(0, 40).map((match, index) =>
            `<option value="${index}">#${match.rank} · ${match.geometry_status}</option>`
        ).join("");
        state.selectedMatch = clamp(state.selectedMatch, 0, Math.max(0, data.matches.length - 1));
        select.value = String(state.selectedMatch);
    }

    function heatColor(value) {
        const t = clamp(value, 0, 1);
        const r = Math.round(239 - 181 * t);
        const g = Math.round(246 - 92 * t);
        const b = Math.round(255 - 34 * t);
        return `rgb(${r},${g},${b})`;
    }

    function drawProbeHeatmap(match) {
        const canvas = $("probeHeatmap");
        const ctx = canvas.getContext("2d");
        const cols = 8;
        const rows = 5;
        const pad = 24;
        const cellW = (canvas.width - pad * 2) / cols;
        const cellH = (canvas.height - pad * 2) / rows;
        const random = seededRandom(match.left_index * 997 + match.right_index * 37 + 11);
        const values = [];
        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) values.push(0.3 + random() * 0.7);
        }
        const bestIndex = (match.right_index + match.left_index) % values.length;
        const secondIndex = (bestIndex + 7 + match.rank) % values.length;
        values[bestIndex] = 0.04;
        values[secondIndex] = clamp(0.04 / Math.max(0.08, match.ratio), 0.08, 0.55);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const max = Math.max(...values);
        values.forEach((value, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const normalized = value / max;
            ctx.fillStyle = heatColor(normalized);
            ctx.fillRect(pad + col * cellW + 1, pad + row * cellH + 1, cellW - 2, cellH - 2);
            if (index === bestIndex || index === secondIndex) {
                ctx.strokeStyle = index === bestIndex ? "#2563eb" : "#f97316";
                ctx.lineWidth = 3;
                ctx.strokeRect(pad + col * cellW + 2, pad + row * cellH + 2, cellW - 4, cellH - 4);
                ctx.fillStyle = "#0f172a";
                ctx.font = "700 10px sans-serif";
                ctx.fillText(index === bestIndex ? "d1" : "d2", pad + col * cellW + 5, pad + row * cellH + 14);
            }
        });
        ctx.fillStyle = "#64748b";
        ctx.font = "11px sans-serif";
        ctx.fillText("右图候选描述子", pad, 15);
    }

    function drawProbeLink(match, data) {
        const canvas = $("probeLinkCanvas");
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#eff6ff";
        ctx.strokeStyle = "#bfdbfe";
        ctx.lineWidth = 1;
        ctx.fillRect(18, 28, 104, 112);
        ctx.strokeRect(18, 28, 104, 112);
        ctx.fillRect(178, 28, 104, 112);
        ctx.strokeRect(178, 28, 104, 112);
        const left = data.points.left[match.left_index] || { x: 0, y: 0 };
        const right = data.points.right[match.right_index] || { x: 0, y: 0 };
        const leftX = 42 + (Math.abs(left.x) % 58);
        const leftY = 48 + (Math.abs(left.y) % 70);
        const rightX = 202 + (Math.abs(right.x) % 58);
        const rightY = 48 + (Math.abs(right.y) % 70);
        const projectedY = clamp(rightY + (number(match.reprojection_error) - 4) * 3, 38, 132);
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = match.ransac_inlier ? "#16a34a" : "#dc2626";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftX, leftY);
        ctx.lineTo(rightX, rightY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#2563eb";
        ctx.beginPath();
        ctx.moveTo(rightX - 18, projectedY);
        ctx.lineTo(rightX, rightY);
        ctx.stroke();
        drawPoint(ctx, leftX, leftY, "#2563eb", 4);
        drawPoint(ctx, rightX, rightY, match.ransac_inlier ? "#16a34a" : "#dc2626", 4);
        drawPoint(ctx, rightX - 18, projectedY, "#2563eb", 3);
        ctx.fillStyle = "#475569";
        ctx.font = "700 11px sans-serif";
        ctx.fillText("图像 A", 48, 158);
        ctx.fillText("图像 B", 208, 158);
        ctx.fillText(`e=${fixed(match.reprojection_error, 2)}px`, 118, 21);
    }

    function drawProbeDescriptor(match) {
        const canvas = $("probeDescriptorCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        const point = state.data?.points?.left?.[match.left_index] || {};
        const binary = state.data?.stats?.distance_type === "Hamming";
        const count = binary ? 32 : 40;
        const gap = 2;
        const cellWidth = (width - 16 - gap * (count - 1)) / count;
        let seed = Math.round(number(point.x) * 31 + number(point.y) * 17 + match.left_index * 13);
        for (let index = 0; index < count; index += 1) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const value = binary ? ((seed >>> 28) & 1) : ((seed >>> 20) & 255) / 255;
            const x = 8 + index * (cellWidth + gap);
            const barHeight = binary ? 34 : 9 + value * 31;
            ctx.fillStyle = binary
                ? (value ? "#2563eb" : "#dbeafe")
                : `hsl(${212 + value * 18} 82% ${78 - value * 38}%)`;
            ctx.fillRect(x, height - 9 - barHeight, Math.max(2, cellWidth), barHeight);
        }
        ctx.fillStyle = "#64748b";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(binary ? "256 bit BRIEF pattern (教学抽样)" : "float descriptor bins (教学抽样)", 8, height - 1);
    }

    function updateGate(element, passed, waiting, value) {
        element.classList.toggle("is-pass", passed && !waiting);
        element.classList.toggle("is-fail", !passed && !waiting);
        const result = element.querySelector("b");
        result.textContent = waiting ? "未进入" : (passed ? "通过" : "拒绝");
        element.querySelector("small").textContent = value;
    }

    function renderProbe() {
        if (!state.data?.matches.length) return;
        const match = state.data.matches[state.selectedMatch] || state.data.matches[0];
        const maxDistance = Math.max(match.distance, match.second_distance, 1);
        $("probeD1Bar").style.width = `${clamp(match.distance / maxDistance * 100, 3, 100)}%`;
        $("probeD2Bar").style.width = `${clamp(match.second_distance / maxDistance * 100, 3, 100)}%`;
        $("probeD1Value").textContent = fixed(match.distance, 3);
        $("probeD2Value").textContent = fixed(match.second_distance, 3);
        $("probeRatioFormula").textContent = `ratio = ${fixed(match.distance, 3)} / ${fixed(match.second_distance, 3)} = ${fixed(match.ratio, 3)}`;
        updateGate(
            $("probeRatioGate"),
            match.ratio_passed,
            false,
            `${fixed(match.ratio, 3)} ${match.ratio_passed ? "<" : "≥"} ${fixed(state.data.stats.ratio_threshold, 2)}`
        );
        updateGate(
            $("probeRansacGate"),
            match.ransac_inlier,
            !match.ratio_passed,
            match.ratio_passed
                ? `${fixed(match.reprojection_error, 2)} px ${match.ransac_inlier ? "≤" : ">"} ${fixed(state.data.stats.ransac_threshold, 1)} px`
                : "Ratio 失败，不进入几何验证"
        );
        drawProbeHeatmap(match);
        drawProbeDescriptor(match);
        drawProbeLink(match, state.data);
        document.querySelectorAll("#matchTable tbody tr").forEach(row => {
            row.classList.toggle("is-selected", number(row.dataset.matchIndex, -1) === state.selectedMatch);
        });
        $("matchProbeSelect").value = String(state.selectedMatch);
    }

    function setSelectedMatch(index) {
        if (!state.data?.matches.length) return;
        state.selectedMatch = clamp(number(index), 0, state.data.matches.length - 1);
        renderProbe();
        drawMainCanvas();
    }

    function renderFormula(target, formula, detail) {
        if (!target) return;
        target.innerHTML = `<p class="latex-formula"></p><ul class="feature-note-detail"><li>${detail}</li></ul>`;
        const formulaTarget = target.querySelector(".latex-formula");
        if (window.katex) {
            try {
                window.katex.render(formula, formulaTarget, { throwOnError: false, displayMode: false });
            } catch (error) {
                formulaTarget.textContent = formula;
            }
        } else {
            formulaTarget.textContent = formula;
        }
    }

    function stepResultItems(stepIndex) {
        const stats = state.data?.stats;
        const transform = state.data?.transform;
        if (!stats) return [["状态", "等待运行"]];
        const items = [
            [["左图关键点", stats.left_keypoints], ["右图关键点", stats.right_keypoints]],
            [["描述子类型", stats.descriptor_type], ["描述子维度", stats.descriptor_dim]],
            [["距离类型", stats.distance_type], ["候选匹配", stats.raw_matches]],
            [["2-NN 对数", state.data.matches.length], ["当前观察", `#${state.data.matches[state.selectedMatch]?.rank || "-"}`]],
            [["Ratio 通过", stats.passed_matches], ["Ratio 失败", Math.max(0, stats.raw_matches - stats.passed_matches)]],
            [["RANSAC 内点", stats.inlier_matches], ["几何外点", stats.outlier_matches]],
            [["3×3 H_A", transform ? `[${fixed(transform.a, 2)} ${fixed(transform.c, 2)} ${fixed(transform.e, 1)}; ${fixed(transform.b, 2)} ${fixed(transform.d, 2)} ${fixed(transform.f, 1)}; 0 0 1]` : "-"], ["模型", "Affine"]],
            [["配准内点", stats.inlier_matches], ["内点率", `${fixed(stats.inlier_ratio * 100, 1)}%`]]
        ];
        return items[stepIndex] || items[0];
    }

    function updateProcessNotes() {
        const step = stepDefinitions[state.step];
        const info = V.featureAlgorithmInfo(state.data?.algorithm || selectedAlgorithm());
        $("matchInfoLabel").textContent = `Process Notes · ${String(state.step + 1).padStart(2, "0")}`;
        $("matchInfoTitle").textContent = step.title;
        $("matchInfoGoal").textContent = step.goal;
        $("matchInfoIO").textContent = step.io;
        renderFormula($("matchInfoLogic"), step.formula, step.logic);
        V.renderStatList($("matchInfoParams"), [
            ["算法", info.name],
            ["Ratio τ", fixed(formNumber("ratio_threshold", 0.75, 0.4, 0.95), 2)],
            ["RANSAC ε", `${fixed(formNumber("ransac_threshold", 4, 1, 20), 1)} px`]
        ]);
        V.renderStatList($("matchInfoResult"), stepResultItems(state.step));
        $("matchInfoNext").textContent = step.next;
    }

    function setStep(index, preserveView = false) {
        state.step = clamp(number(index), 0, stepDefinitions.length - 1);
        document.querySelectorAll("[data-match-step]").forEach(button => {
            const buttonIndex = number(button.dataset.matchStep);
            button.classList.toggle("is-active", buttonIndex === state.step);
            button.classList.toggle("is-done", buttonIndex < state.step);
        });
        if (!preserveView) {
            if (state.step === 5 || state.step === 6) setView("ransac", true);
            else if (state.step === 7) setView("warp", true);
            else setView("matches", true);
        }
        if (state.step === 6) {
            $("matchStageLabel").textContent = "Transform Matrix";
            $("matchStageTitle").textContent = "Affine 3×3 齐次矩阵与内点支持";
        }
        updatePhaseStrip();
        updateProcessNotes();
    }

    function drawRansacScene(round, phaseIndex) {
        const canvas = $("ransacCanvas");
        const ctx = canvas.getContext("2d");
        const data = state.data;
        if (!data) return;
        const candidates = data.matches.filter(match => match.ratio_passed);
        const leftPoints = data.points.left;
        const rightPoints = data.points.right;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const leftBox = { x: 24, y: 36, w: 360, h: 226 };
        const rightBox = { x: 536, y: 36, w: 360, h: 226 };
        [leftBox, rightBox].forEach((box, index) => {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#bfdbfe";
            ctx.lineWidth = 1.5;
            ctx.fillRect(box.x, box.y, box.w, box.h);
            ctx.strokeRect(box.x, box.y, box.w, box.h);
            ctx.fillStyle = "#1e3a8a";
            ctx.font = "700 12px sans-serif";
            ctx.fillText(index ? "目标平面 B" : "源平面 A", box.x + 12, box.y + 20);
        });
        const leftMaxX = Math.max(1, ...leftPoints.map(point => point.x));
        const leftMaxY = Math.max(1, ...leftPoints.map(point => point.y));
        const rightMaxX = Math.max(1, ...rightPoints.map(point => point.x));
        const rightMaxY = Math.max(1, ...rightPoints.map(point => point.y));
        const mapPoint = (point, box, maxX, maxY) => ({
            x: box.x + 16 + point.x / maxX * (box.w - 32),
            y: box.y + 30 + point.y / maxY * (box.h - 46)
        });
        const sampleSet = new Set(round?.sampleIndices || []);
        const inlierSet = new Set(round?.inliers || []);
        candidates.slice(0, 70).forEach((match, index) => {
            const lp = mapPoint(leftPoints[match.left_index], leftBox, leftMaxX, leftMaxY);
            const rp = mapPoint(rightPoints[match.right_index], rightBox, rightMaxX, rightMaxY);
            const sampled = sampleSet.has(index);
            const judgedInlier = inlierSet.has(index);
            const color = phaseIndex >= 3
                ? (judgedInlier ? "#16a34a" : "#dc2626")
                : (sampled ? "#f97316" : "#94a3b8");
            if ((phaseIndex >= 1 && sampled) || phaseIndex >= 2) {
                ctx.save();
                ctx.globalAlpha = sampled || phaseIndex >= 3 ? 0.82 : 0.2;
                ctx.strokeStyle = color;
                ctx.lineWidth = sampled ? 2.5 : 1;
                ctx.beginPath();
                ctx.moveTo(lp.x, lp.y);
                ctx.bezierCurveTo(438, lp.y, 482, rp.y, rp.x, rp.y);
                ctx.stroke();
                ctx.restore();
            }
            drawPoint(ctx, lp.x, lp.y, color, sampled ? 4 : 2.5);
            drawPoint(ctx, rp.x, rp.y, color, sampled ? 4 : 2.5);
        });
        if (phaseIndex >= 1 && round?.model) {
            ctx.fillStyle = "#eff6ff";
            ctx.strokeStyle = "#93c5fd";
            ctx.fillRect(402, 92, 116, 104);
            ctx.strokeRect(402, 92, 116, 104);
            ctx.fillStyle = "#1d4ed8";
            ctx.font = "700 11px monospace";
            ctx.fillText("AFFINE T", 424, 113);
            ctx.fillText(`${fixed(round.model.a, 2)} ${fixed(round.model.c, 2)}`, 417, 139);
            ctx.fillText(`${fixed(round.model.b, 2)} ${fixed(round.model.d, 2)}`, 417, 158);
            ctx.fillText(`t ${fixed(round.model.e, 0)},${fixed(round.model.f, 0)}`, 417, 180);
        }
    }

    function updateRansacMotion(timestamp) {
        window.requestAnimationFrame(updateRansacMotion);
        if (!state.data || !state.ransacPlaying) return;
        const rounds = state.data.ransac?.rounds || [];
        if (!rounds.length) return;
        const phaseDuration = 720;
        const elapsed = Math.max(0, timestamp - state.ransacStartedAt);
        const phaseIndex = Math.floor(elapsed / phaseDuration) % ransacPhases.length;
        const roundIndex = Math.floor(elapsed / (phaseDuration * ransacPhases.length)) % rounds.length;
        const frameKey = roundIndex * 10 + phaseIndex;
        if (frameKey === state.ransacFrame) return;
        state.ransacFrame = frameKey;
        const round = rounds[roundIndex];
        drawRansacScene(round, phaseIndex);
        $("ransacPhase").textContent = `${ransacPhases[phaseIndex]} · 第 ${round.iteration} 次迭代`;
        document.querySelectorAll("#ransacStepChips span").forEach((chip, index) => {
            chip.classList.toggle("is-active", index === phaseIndex);
            chip.classList.toggle("is-done", index < phaseIndex);
        });
        const total = Math.max(1, state.data.stats.geometry_candidates);
        const current = round.inliers.length;
        const best = round.bestCount;
        $("ransacCurrentCount").textContent = current;
        $("ransacBestCount").textContent = best;
        $("ransacCurrentBar").style.width = `${current / total * 100}%`;
        $("ransacBestBar").style.width = `${best / total * 100}%`;
        V.renderStatList($("ransacMotionMetrics"), [
            ["采样匹配", (round.sampleRanks || []).map(rank => `#${rank}`).join(" · ") || "-"],
            ["当前平均误差", Number.isFinite(round.meanError) ? `${fixed(round.meanError, 2)} px` : "-"],
            ["模型状态", best > current ? "保留历史 Best" : "更新候选 Best"]
        ]);
    }

    function resetRansacMotion() {
        state.ransacStartedAt = performance.now();
        state.ransacFrame = -1;
        state.ransacPlaying = true;
        document.querySelector('[data-ransac-action="toggle"]').textContent = "暂停";
    }

    function renderRansacShell() {
        $("ransacStepChips").innerHTML = ransacPhases.map((phase, index) =>
            `<span class="${index === 0 ? "is-active" : ""}"><i>${index + 1}</i>${phase}</span>`
        ).join("");
        resetRansacMotion();
    }

    function renderAll(data) {
        state.data = data;
        state.images = null;
        state.selectedMatch = 0;
        state.hoverMatch = -1;
        renderStats(data);
        renderTable(data);
        renderProbeOptions(data);
        renderProbe();
        renderRansacShell();
        updateProcessNotes();
        drawMainCanvas();
        $("matchElapsed").textContent = `运行耗时 ${fixed(data.meta.elapsed_ms, 2)} ms`;
        $("matchElapsed").classList.remove("is-error");
    }

    function syncAlgorithmUi() {
        const algorithm = selectedAlgorithm();
        const info = V.featureAlgorithmInfo(algorithm);
        $("matchDistanceLabel").value = info.distanceType === "Hamming" ? "Hamming 汉明距离" : "L2 欧氏距离";
        document.querySelectorAll("[data-match-algorithm]").forEach(card => {
            card.classList.toggle("is-active", card.dataset.matchAlgorithm === algorithm);
        });
        updateProcessNotes();
    }

    function showError(error) {
        state.data = null;
        state.images = null;
        state.hitLines = [];
        ["matchCanvas", "ransacCanvas", "probeHeatmap", "probeLinkCanvas", "probeDescriptorCanvas"].forEach(id => {
            const canvas = $(id);
            canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        });
        ["descriptorStats", "matchingStats", "geometryStats", "ransacMotionMetrics"].forEach(id => {
            if ($(id)) $(id).innerHTML = "";
        });
        const tbody = document.querySelector("#matchTable tbody");
        if (tbody) tbody.innerHTML = "";
        if ($("matchProbeSelect")) $("matchProbeSelect").innerHTML = "";
        V.renderStatList($("matchInfoResult"), [["状态", "本次输入处理失败"]]);
        $("matchElapsed").textContent = "运行失败";
        $("matchElapsed").classList.add("is-error");
        $("matchEmptyState").hidden = false;
        $("matchEmptyState").textContent = error?.message || "匹配处理失败，请检查输入。";
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const currentRequest = ++state.requestId;
        const button = form.querySelector('button[type="submit"]');
        const algorithm = selectedAlgorithm();
        if (button) {
            button.disabled = true;
            button.textContent = "匹配与几何验证中...";
        }
        $("matchElapsed").textContent = "计算中";
        $("matchEmptyState").hidden = false;
        $("matchEmptyState").textContent = "正在计算描述子、匹配与 RANSAC...";
        try {
            const raw = algorithm === "sift"
                ? { ...(await V.postForm(form, "/api/feature-match")), algorithm: "sift" }
                : await frontendMatch(algorithm);
            if (currentRequest !== state.requestId) return;
            renderAll(normalizeMatchData(raw, algorithm));
        } catch (error) {
            if (currentRequest === state.requestId) showError(error);
        } finally {
            if (currentRequest === state.requestId && button) {
                button.disabled = false;
                button.textContent = "执行完整匹配流程";
            }
        }
    });

    $("matchAlgorithm")?.addEventListener("change", () => {
        syncAlgorithmUi();
        form.requestSubmit();
    });
    document.querySelectorAll("[data-match-algorithm]").forEach(card => {
        card.addEventListener("click", () => {
            $("matchAlgorithm").value = card.dataset.matchAlgorithm;
            syncAlgorithmUi();
            form.requestSubmit();
        });
    });
    document.querySelectorAll("[data-match-view]").forEach(button => {
        button.addEventListener("click", () => setView(button.dataset.matchView));
    });
    document.querySelectorAll("[data-match-step]").forEach(button => {
        button.addEventListener("click", () => setStep(number(button.dataset.matchStep)));
    });
    document.querySelectorAll("[data-phase-step]").forEach(button => {
        button.addEventListener("click", () => setStep(number(button.dataset.phaseStep)));
    });
    $("warpOpacity")?.addEventListener("input", event => {
        state.warpOpacity = clamp(number(event.target.value, 46) / 100, 0, 1);
        $("warpOpacityValue").textContent = `${Math.round(state.warpOpacity * 100)}%`;
        if (state.view === "warp") drawMainCanvas();
    });
    $("matchProbeSelect")?.addEventListener("change", event => setSelectedMatch(event.target.value));
    document.querySelector("#matchTable tbody")?.addEventListener("click", event => {
        const row = event.target.closest("[data-match-index]");
        if (row) setSelectedMatch(row.dataset.matchIndex);
    });
    $("matchCanvas")?.addEventListener("mousemove", event => {
        if (!state.data || state.view === "warp") return;
        const canvas = $("matchCanvas");
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * canvas.width / rect.width;
        const y = (event.clientY - rect.top) * canvas.height / rect.height;
        let nearest = null;
        state.hitLines.forEach(line => {
            const distance = lineDistance(x, y, line.x1, line.y1, line.x2, line.y2);
            if (distance <= 7 && (!nearest || distance < nearest.distance)) nearest = { ...line, distance };
        });
        const nextHover = nearest ? nearest.index : -1;
        if (nextHover !== state.hoverMatch) {
            state.hoverMatch = nextHover;
            drawMainCanvas();
        }
        const tooltip = $("matchTooltip");
        if (!nearest) {
            tooltip.hidden = true;
            return;
        }
        const match = state.data.matches[nearest.index];
        tooltip.hidden = false;
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top + 12}px`;
        tooltip.innerHTML = `<b>#${match.rank} · ${match.geometry_status}</b><span>d1 ${fixed(match.distance, 3)} · d2 ${fixed(match.second_distance, 3)}</span><span>ratio ${fixed(match.ratio, 3)} · error ${fixed(match.reprojection_error, 2)} px</span>`;
    });
    $("matchCanvas")?.addEventListener("mouseleave", () => {
        state.hoverMatch = -1;
        $("matchTooltip").hidden = true;
        drawMainCanvas();
    });
    $("matchCanvas")?.addEventListener("click", () => {
        if (state.hoverMatch >= 0) setSelectedMatch(state.hoverMatch);
    });
    document.querySelectorAll("[data-ransac-action]").forEach(button => {
        button.addEventListener("click", () => {
            if (button.dataset.ransacAction === "restart") {
                resetRansacMotion();
                return;
            }
            state.ransacPlaying = !state.ransacPlaying;
            button.textContent = state.ransacPlaying ? "暂停" : "继续";
            if (state.ransacPlaying) {
                state.ransacStartedAt = performance.now();
                state.ransacFrame = -1;
            }
        });
    });

    V.bindAutoSubmit(form, { excludeIds: ["matchAlgorithm"], delay: 460 });
    syncAlgorithmUi();
    setStep(0);
    renderRansacShell();
    window.requestAnimationFrame(updateRansacMotion);
    form.requestSubmit();
})();
