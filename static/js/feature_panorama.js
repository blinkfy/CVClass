(function () {
    "use strict";

    const V = window.FeatureViz;
    const form = document.getElementById("panoramaForm");
    if (!V || !form) return;

    V.setupSamples(form);
    V.bindFileNames(form);

    const $ = id => document.getElementById(id);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const fixed = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";

    const sampleFiles = {
        building: "house.png",
        checker: "cameraman.png",
        book: "brick.png",
        texture: "checkerboard.png",
        peppers: "peppers_color.png"
    };

    const state = {
        mode: "upload",
        view: "inputs",
        upload: null,
        camera: {
            stream: null,
            frames: [],
            panorama: null,
            status: "idle",
            stable: false,
            lastMetrics: null,
            lastOverlap: 0,
            autoTimer: 0
        },
        busy: false
    };

    function formValue(name, fallback) {
        return form.elements[name]?.value ?? fallback;
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

    async function shiftedExampleSource(src) {
        const image = await V.loadImage(src);
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const canvas = document.createElement("canvas");
        V.setCanvasSize(canvas, width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, width, height);
        ctx.save();
        ctx.translate(-Math.round(width * 0.22), 10);
        ctx.rotate(-3 * Math.PI / 180);
        ctx.drawImage(image, 0, 0, width, height);
        ctx.restore();
        return canvas.toDataURL("image/png");
    }

    async function inputSources() {
        const fileA = form.querySelector('input[name="image_a"]')?.files?.[0];
        const fileB = form.querySelector('input[name="image_b"]')?.files?.[0];
        const example = form.querySelector("[data-example-input]")?.value || "book";
        const left = fileA ? await readFileAsDataURL(fileA) : `${V.assetsBase}${sampleFiles[example] || sampleFiles.book}`;
        const right = fileB ? await readFileAsDataURL(fileB) : await shiftedExampleSource(left);
        return { left, right };
    }

    function solveLinear(matrix, vector) {
        const n = vector.length;
        const augmented = matrix.map((row, index) => row.slice().concat(vector[index]));
        for (let col = 0; col < n; col += 1) {
            let pivot = col;
            for (let row = col + 1; row < n; row += 1) {
                if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
            }
            if (Math.abs(augmented[pivot][col]) < 1e-9) return null;
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
        const s = solveLinear(matrix, vector);
        return s ? [s[0], s[1], s[4], s[2], s[3], s[5], 0, 0, 1] : null;
    }

    function estimateHomography(matches, leftPoints, rightPoints) {
        if (!matches || matches.length < 4) return null;
        const matrix = [];
        const vector = [];
        matches.slice(0, 4).forEach(match => {
            const p = leftPoints[match.left_index];
            const q = rightPoints[match.right_index];
            if (!p || !q) return;
            matrix.push([p.x, p.y, 1, 0, 0, 0, -q.x * p.x, -q.x * p.y]);
            vector.push(q.x);
            matrix.push([0, 0, 0, p.x, p.y, 1, -q.y * p.x, -q.y * p.y]);
            vector.push(q.y);
        });
        if (matrix.length !== 8) return null;
        const s = solveLinear(matrix, vector);
        return s ? [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1] : null;
    }

    function project(H, point) {
        const den = H[6] * point.x + H[7] * point.y + H[8];
        if (Math.abs(den) < 1e-9) return { x: Infinity, y: Infinity };
        return {
            x: (H[0] * point.x + H[1] * point.y + H[2]) / den,
            y: (H[3] * point.x + H[4] * point.y + H[5]) / den
        };
    }

    function evaluateModel(H, matches, leftPoints, rightPoints, threshold) {
        const errors = [];
        const inliers = [];
        matches.forEach((match, index) => {
            const left = leftPoints[match.left_index];
            const right = rightPoints[match.right_index];
            if (!left || !right || !H) {
                errors.push(Infinity);
                return;
            }
            const p = project(H, left);
            const error = Math.hypot(p.x - right.x, p.y - right.y);
            errors.push(error);
            if (Number.isFinite(error) && error <= threshold) inliers.push(index);
        });
        return {
            errors,
            inliers,
            meanError: inliers.length ? inliers.reduce((sum, index) => sum + errors[index], 0) / inliers.length : Infinity
        };
    }

    function seededRandom(seed) {
        let value = seed >>> 0;
        return () => {
            value += 0x6D2B79F5;
            let t = value;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function sample(matches, count, random) {
        const picked = new Set();
        while (picked.size < Math.min(count, matches.length)) picked.add(Math.floor(random() * matches.length));
        return Array.from(picked).map(index => matches[index]);
    }

    function fallbackTranslation(matches, leftPoints, rightPoints) {
        const offsets = matches.map(match => {
            const p = leftPoints[match.left_index];
            const q = rightPoints[match.right_index];
            return p && q ? { x: q.x - p.x, y: q.y - p.y } : null;
        }).filter(Boolean);
        if (!offsets.length) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        offsets.sort((a, b) => a.x - b.x);
        const tx = offsets[Math.floor(offsets.length / 2)].x;
        offsets.sort((a, b) => a.y - b.y);
        const ty = offsets[Math.floor(offsets.length / 2)].y;
        return [1, 0, tx, 0, 1, ty, 0, 0, 1];
    }

    function runRansac(matches, leftPoints, rightPoints, model, threshold, iterations) {
        const candidates = matches.filter(match => match.passed || match.ratio_passed);
        const minCount = model === "homography" ? 4 : 3;
        const random = seededRandom(candidates.reduce((sum, match) => sum + match.left_index * 37 + match.right_index * 19, 2027));
        let bestH = null;
        let best = { inliers: [], errors: [], meanError: Infinity };
        if (candidates.length >= minCount) {
            for (let i = 0; i < iterations; i += 1) {
                const picked = sample(candidates, minCount, random);
                const H = model === "homography" ? estimateHomography(picked, leftPoints, rightPoints) : estimateAffine(picked, leftPoints, rightPoints);
                if (!H) continue;
                const evalResult = evaluateModel(H, candidates, leftPoints, rightPoints, threshold);
                if (evalResult.inliers.length > best.inliers.length || (evalResult.inliers.length === best.inliers.length && evalResult.meanError < best.meanError)) {
                    bestH = H;
                    best = evalResult;
                }
            }
        }
        if (!bestH) {
            bestH = fallbackTranslation(candidates.length ? candidates : matches, leftPoints, rightPoints);
            best = evaluateModel(bestH, candidates.length ? candidates : matches, leftPoints, rightPoints, threshold);
        }
        return { H: bestH, inliers: best.inliers.length, inlierIndices: best.inliers.slice(), meanError: Number.isFinite(best.meanError) ? best.meanError : 0, candidates: candidates.length };
    }

    function affineFromH(H) {
        return { a: H[0], b: H[3], c: H[1], d: H[4], e: H[2], f: H[5] };
    }

    function hasPerspective(H) {
        return Math.abs(H?.[6] || 0) > 1e-8 || Math.abs(H?.[7] || 0) > 1e-8;
    }

    function invertHomography(H) {
        const [a, b, c, d, e, f, g, h, i] = H;
        const A = e * i - f * h;
        const B = c * h - b * i;
        const C = b * f - c * e;
        const D = f * g - d * i;
        const E = a * i - c * g;
        const F = c * d - a * f;
        const G = d * h - e * g;
        const Hh = b * g - a * h;
        const I = a * e - b * d;
        const det = a * A + b * D + c * G;
        if (Math.abs(det) < 1e-10) return null;
        return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, Hh / det, I / det];
    }

    function imageCorners(width, height) {
        return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    }

    function canvasBounds(left, right, H) {
        const warped = imageCorners(left.width, left.height).map(point => project(H, point));
        const base = imageCorners(right.width, right.height);
        const all = warped.concat(base).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
        const minX = Math.min(...all.map(point => point.x), 0);
        const minY = Math.min(...all.map(point => point.y), 0);
        const maxX = Math.max(...all.map(point => point.x), right.width);
        const maxY = Math.max(...all.map(point => point.y), right.height);
        return { minX, minY, maxX, maxY, width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) };
    }

    function warpProjectiveLayer(sourceImg, H, target, mask, shiftX, shiftY, outputScale) {
        const inverse = invertHomography(H);
        if (!inverse) throw new Error("H 不可靠：无法反求透视矩阵。");
        const sourceCanvas = document.createElement("canvas");
        V.setCanvasSize(sourceCanvas, sourceImg.width, sourceImg.height);
        const sourceCtx = sourceCanvas.getContext("2d");
        sourceCtx.drawImage(sourceImg, 0, 0);
        const source = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const targetCtx = target.getContext("2d");
        const maskCtx = mask.getContext("2d");
        const targetData = targetCtx.createImageData(target.width, target.height);
        const maskData = maskCtx.createImageData(mask.width, mask.height);
        const sw = source.width;
        const sh = source.height;
        const sd = source.data;
        const td = targetData.data;
        const md = maskData.data;
        for (let y = 0; y < target.height; y += 1) {
            const wy = (y - shiftY) / outputScale;
            for (let x = 0; x < target.width; x += 1) {
                const wx = (x - shiftX) / outputScale;
                const den = inverse[6] * wx + inverse[7] * wy + inverse[8];
                if (Math.abs(den) < 1e-9) continue;
                const sx = (inverse[0] * wx + inverse[1] * wy + inverse[2]) / den;
                const sy = (inverse[3] * wx + inverse[4] * wy + inverse[5]) / den;
                if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) continue;
                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = Math.min(sw - 1, x0 + 1);
                const y1 = Math.min(sh - 1, y0 + 1);
                const fx = sx - x0;
                const fy = sy - y0;
                const w00 = (1 - fx) * (1 - fy);
                const w10 = fx * (1 - fy);
                const w01 = (1 - fx) * fy;
                const w11 = fx * fy;
                const i00 = (y0 * sw + x0) * 4;
                const i10 = (y0 * sw + x1) * 4;
                const i01 = (y1 * sw + x0) * 4;
                const i11 = (y1 * sw + x1) * 4;
                const ti = (y * target.width + x) * 4;
                const alpha = sd[i00 + 3] * w00 + sd[i10 + 3] * w10 + sd[i01 + 3] * w01 + sd[i11 + 3] * w11;
                if (alpha <= 4) continue;
                td[ti] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
                td[ti + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
                td[ti + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
                td[ti + 3] = alpha;
                md[ti] = 255;
                md[ti + 1] = 255;
                md[ti + 2] = 255;
                md[ti + 3] = 255;
            }
        }
        targetCtx.putImageData(targetData, 0, 0);
        maskCtx.putImageData(maskData, 0, 0);
    }

    function drawWarpedLayers(leftImg, rightImg, H, scale = 1) {
        const bounds = canvasBounds(leftImg, rightImg, H);
        const maxSide = 1600;
        const outputScale = Math.min(scale, maxSide / Math.max(bounds.width, bounds.height, 1));
        const width = Math.max(1, Math.round(bounds.width * outputScale));
        const height = Math.max(1, Math.round(bounds.height * outputScale));
        if (width * height > 3200000) throw new Error("输出画布过大，请降低输出缩放。");
        const make = () => {
            const canvas = document.createElement("canvas");
            V.setCanvasSize(canvas, width, height);
            return canvas;
        };
        const leftLayer = make();
        const rightLayer = make();
        const leftMaskLayer = make();
        const rightMaskLayer = make();
        const maskLayer = make();
        const shiftX = -bounds.minX * outputScale;
        const shiftY = -bounds.minY * outputScale;
        const leftCtx = leftLayer.getContext("2d");
        const leftMaskCtx = leftMaskLayer.getContext("2d");
        if (hasPerspective(H)) {
            warpProjectiveLayer(leftImg, H, leftLayer, leftMaskLayer, shiftX, shiftY, outputScale);
        } else {
            const t = affineFromH(H);
            leftCtx.setTransform(t.a * outputScale, t.b * outputScale, t.c * outputScale, t.d * outputScale, t.e * outputScale + shiftX, t.f * outputScale + shiftY);
            leftCtx.drawImage(leftImg, 0, 0);
            leftCtx.setTransform(1, 0, 0, 1, 0, 0);
            leftMaskCtx.fillStyle = "#fff";
            leftMaskCtx.setTransform(t.a * outputScale, t.b * outputScale, t.c * outputScale, t.d * outputScale, t.e * outputScale + shiftX, t.f * outputScale + shiftY);
            leftMaskCtx.fillRect(0, 0, leftImg.width, leftImg.height);
            leftMaskCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        const rightCtx = rightLayer.getContext("2d");
        rightCtx.drawImage(rightImg, shiftX, shiftY, rightImg.width * outputScale, rightImg.height * outputScale);
        const rightMaskCtx = rightMaskLayer.getContext("2d");
        rightMaskCtx.fillStyle = "#fff";
        rightMaskCtx.fillRect(shiftX, shiftY, rightImg.width * outputScale, rightImg.height * outputScale);
        updateOverlapPreview(maskLayer, leftMaskLayer, rightMaskLayer);
        return { leftLayer, rightLayer, leftMaskLayer, rightMaskLayer, maskLayer, bounds, outputScale, shiftX, shiftY, width, height };
    }

    function updateOverlapPreview(preview, leftMaskLayer, rightMaskLayer) {
        const width = preview.width;
        const height = preview.height;
        const left = leftMaskLayer.getContext("2d").getImageData(0, 0, width, height).data;
        const right = rightMaskLayer.getContext("2d").getImageData(0, 0, width, height).data;
        const ctx = preview.getContext("2d");
        const out = ctx.createImageData(width, height);
        const od = out.data;
        for (let i = 0, p = 0; i < od.length; i += 4, p += 1) {
            const hasLeft = left[i + 3] > 8;
            const hasRight = right[i + 3] > 8;
            if (!hasLeft && !hasRight) continue;
            if (hasLeft && hasRight) {
                od[i] = 37; od[i + 1] = 99; od[i + 2] = 235; od[i + 3] = 210;
            } else if (hasLeft) {
                od[i] = 22; od[i + 1] = 163; od[i + 2] = 74; od[i + 3] = 145;
            } else {
                od[i] = 14; od[i + 1] = 165; od[i + 2] = 233; od[i + 3] = 145;
            }
        }
        ctx.putImageData(out, 0, 0);
    }

    function alphaCoverage(canvas) {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const mask = new Uint8Array(canvas.width * canvas.height);
        for (let i = 0, p = 0; i < data.length; i += 4, p += 1) mask[p] = data[i + 3] > 8 ? 1 : 0;
        return mask;
    }

    function distanceTransform(mask, width, height) {
        const inf = width + height + 1024;
        const dist = new Float32Array(width * height);
        for (let i = 0; i < dist.length; i += 1) dist[i] = mask[i] ? inf : 0;
        const diag = 1.4142;
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const i = y * width + x;
                let best = dist[i];
                if (x > 0) best = Math.min(best, dist[i - 1] + 1);
                if (y > 0) best = Math.min(best, dist[i - width] + 1);
                if (x > 0 && y > 0) best = Math.min(best, dist[i - width - 1] + diag);
                if (x + 1 < width && y > 0) best = Math.min(best, dist[i - width + 1] + diag);
                dist[i] = best;
            }
        }
        for (let y = height - 1; y >= 0; y -= 1) {
            for (let x = width - 1; x >= 0; x -= 1) {
                const i = y * width + x;
                let best = dist[i];
                if (x + 1 < width) best = Math.min(best, dist[i + 1] + 1);
                if (y + 1 < height) best = Math.min(best, dist[i + width] + 1);
                if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[i + width + 1] + diag);
                if (x > 0 && y + 1 < height) best = Math.min(best, dist[i + width - 1] + diag);
                dist[i] = best;
            }
        }
        return dist;
    }

    function smoothstep(value) {
        const t = clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
    }

    function boxBlurWeights(weights, width, height, radius, passes = 1) {
        if (radius <= 0) return weights;
        let src = weights;
        let temp = new Float32Array(weights.length);
        let dst = new Float32Array(weights.length);
        for (let pass = 0; pass < passes; pass += 1) {
            for (let y = 0; y < height; y += 1) {
                let sum = 0;
                for (let x = -radius; x <= radius; x += 1) sum += src[y * width + clamp(x, 0, width - 1)];
                for (let x = 0; x < width; x += 1) {
                    temp[y * width + x] = sum / (radius * 2 + 1);
                    const removeX = clamp(x - radius, 0, width - 1);
                    const addX = clamp(x + radius + 1, 0, width - 1);
                    sum += src[y * width + addX] - src[y * width + removeX];
                }
            }
            for (let x = 0; x < width; x += 1) {
                let sum = 0;
                for (let y = -radius; y <= radius; y += 1) sum += temp[clamp(y, 0, height - 1) * width + x];
                for (let y = 0; y < height; y += 1) {
                    dst[y * width + x] = sum / (radius * 2 + 1);
                    const removeY = clamp(y - radius, 0, height - 1);
                    const addY = clamp(y + radius + 1, 0, height - 1);
                    sum += temp[addY * width + x] - temp[removeY * width + x];
                }
            }
            [src, dst] = [dst, src];
        }
        return src;
    }

    function makeFeatherWeights(layers, mode, levels) {
        const width = layers.width;
        const height = layers.height;
        const leftMask = alphaCoverage(layers.leftMaskLayer);
        const rightMask = alphaCoverage(layers.rightMaskLayer);
        const leftDist = distanceTransform(leftMask, width, height);
        const rightDist = distanceTransform(rightMask, width, height);
        const weights = new Float32Array(width * height);
        for (let i = 0; i < weights.length; i += 1) {
            if (leftMask[i] && rightMask[i]) {
                const total = leftDist[i] + rightDist[i];
                weights[i] = total > 1e-4 ? smoothstep(leftDist[i] / total) : 0.5;
            } else {
                weights[i] = leftMask[i] ? 1 : 0;
            }
        }
        if (mode === "multiband") {
            const radius = Math.max(2, Math.round(levels * 1.8));
            return boxBlurWeights(weights, width, height, radius, 2);
        }
        return weights;
    }

    function estimateOverlapGains(leftData, rightData) {
        const leftMean = [0, 0, 0];
        const rightMean = [0, 0, 0];
        let count = 0;
        for (let i = 0; i < leftData.length; i += 4) {
            if (leftData[i + 3] <= 8 || rightData[i + 3] <= 8) continue;
            for (let c = 0; c < 3; c += 1) {
                leftMean[c] += leftData[i + c];
                rightMean[c] += rightData[i + c];
            }
            count += 1;
        }
        if (!count) return { left: [1, 1, 1], right: [1, 1, 1] };
        const leftGain = [1, 1, 1];
        const rightGain = [1, 1, 1];
        for (let c = 0; c < 3; c += 1) {
            leftMean[c] /= count;
            rightMean[c] /= count;
            const target = (leftMean[c] + rightMean[c]) / 2;
            leftGain[c] = clamp(target / Math.max(1, leftMean[c]), 0.82, 1.22);
            rightGain[c] = clamp(target / Math.max(1, rightMean[c]), 0.82, 1.22);
        }
        return { left: leftGain, right: rightGain };
    }

    function blendLayers(layers, mode, levels) {
        const canvas = document.createElement("canvas");
        V.setCanvasSize(canvas, layers.width, layers.height);
        const ctx = canvas.getContext("2d");
        if (mode === "average") {
            ctx.drawImage(layers.rightLayer, 0, 0);
            ctx.globalAlpha = .55;
            ctx.drawImage(layers.leftLayer, 0, 0);
            ctx.globalAlpha = 1;
            return canvas;
        }
        const leftData = layers.leftLayer.getContext("2d").getImageData(0, 0, layers.width, layers.height);
        const rightData = layers.rightLayer.getContext("2d").getImageData(0, 0, layers.width, layers.height);
        const weights = makeFeatherWeights(layers, mode, levels);
        const gains = estimateOverlapGains(leftData.data, rightData.data);
        const out = ctx.createImageData(layers.width, layers.height);
        const od = out.data;
        const ld = leftData.data;
        const rd = rightData.data;
        for (let i = 0, p = 0; i < od.length; i += 4, p += 1) {
            const la = ld[i + 3] / 255;
            const ra = rd[i + 3] / 255;
            if (la <= 0 && ra <= 0) continue;
            let lw = weights[p] * la;
            let rw = (1 - weights[p]) * ra;
            const sum = lw + rw;
            if (sum <= 1e-6) continue;
            lw /= sum;
            rw /= sum;
            const overlap = la > 0.03 && ra > 0.03;
            for (let c = 0; c < 3; c += 1) {
                const lg = overlap ? gains.left[c] : 1;
                const rg = overlap ? gains.right[c] : 1;
                od[i + c] = clamp(ld[i + c] * lg * lw + rd[i + c] * rg * rw, 0, 255);
            }
            od[i + 3] = 255 * Math.max(la, ra);
        }
        ctx.putImageData(out, 0, 0);
        return canvas;
    }

    function cropTransparent(canvas) {
        const ctx = canvas.getContext("2d");
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const index = (y * canvas.width + x) * 4;
                if (data.data[index + 3] > 12 && (data.data[index] + data.data[index + 1] + data.data[index + 2]) > 24) {
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                }
            }
        }
        if (maxX <= minX || maxY <= minY) return canvas;
        const out = document.createElement("canvas");
        V.setCanvasSize(out, maxX - minX + 1, maxY - minY + 1);
        out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
        return out;
    }

    async function stitchSources(leftSrc, rightSrc, options) {
        const started = performance.now();
        const [leftImg, rightImg, leftGray, rightGray] = await Promise.all([
            V.loadImage(leftSrc),
            V.loadImage(rightSrc),
            V.imageToGray(leftSrc),
            V.imageToGray(rightSrc)
        ]);
        const featureOptions = { maxKeypoints: 650, threshold: 30, contiguous: 9, nmsRadius: 8 };
        const left = V.computeDescriptorSet(leftGray, options.algorithm, featureOptions);
        const right = V.computeDescriptorSet(rightGray, options.algorithm, featureOptions);
        const matched = V.matchDescriptorSets(left, right, { ratio: options.ratio, maxMatches: 140 });
        if (matched.passedMatches < 4) throw new Error("匹配不足：请换用纹理更丰富或重叠更大的图像。");
        const geometry = runRansac(matched.matches, left.keypoints, right.keypoints, options.model, options.threshold, 120);
        if (geometry.inliers < 4) throw new Error("内点不足：当前图像无法可靠估计几何变换。");
        if (geometry.meanError > options.threshold * 1.8) throw new Error("H 不可靠：重投影误差过大。");
        const layers = drawWarpedLayers(leftImg, rightImg, geometry.H, options.scale);
        const overlapRatio = Math.min(leftImg.width, rightImg.width) / Math.max(layers.bounds.width, 1);
        if (overlapRatio < .12) throw new Error("重叠区域太小，无法生成稳定全景。");
        const blended = blendLayers(layers, options.blend, options.levels);
        const panorama = options.autoCrop ? cropTransparent(blended) : blended;
        return {
            sources: { left: leftSrc, right: rightSrc },
            images: { left: leftImg, right: rightImg },
            features: { left, right },
            matches: matched.matches,
            geometry,
            layers,
            blended,
            panorama,
            options,
            meta: { elapsedMs: performance.now() - started, overlapRatio }
        };
    }

    function drawContained(ctx, img, rect, label) {
        ctx.save();
        ctx.fillStyle = "#f1f5f9";
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
        ctx.fill();
        ctx.clip();
        const scale = Math.min(rect.w / img.width, rect.h / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = rect.x + (rect.w - w) / 2;
        const y = rect.y + (rect.h - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
        ctx.fillStyle = "#1d4ed8";
        ctx.font = "950 13px sans-serif";
        ctx.fillText(label, rect.x + 14, rect.y + 24);
        return { x, y, w, h };
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function syncPanoramaCanvasSize(canvas) {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(640, Math.round(rect.width || canvas.width));
        const height = Math.max(420, Math.round(rect.height || canvas.height));
        if (canvas.width !== width || canvas.height !== height) V.setCanvasSize(canvas, width, height);
    }

    function canvasContentRect(canvas) {
        const margin = clamp(Math.min(canvas.width, canvas.height) * 0.045, 24, 46);
        return {
            x: margin,
            y: margin,
            w: Math.max(1, canvas.width - margin * 2),
            h: Math.max(1, canvas.height - margin * 2)
        };
    }

    function splitContentRects(rect, count) {
        const gap = clamp(rect.w * 0.035, 24, 56);
        if (count === 2 && rect.w < 720) {
            const h = (rect.h - gap) / 2;
            return [
                { x: rect.x, y: rect.y, w: rect.w, h },
                { x: rect.x, y: rect.y + h + gap, w: rect.w, h }
            ];
        }
        if (count === 2) {
            const w = (rect.w - gap) / 2;
            return [
                { x: rect.x, y: rect.y, w, h: rect.h },
                { x: rect.x + w + gap, y: rect.y, w, h: rect.h }
            ];
        }
        const columns = rect.w >= 900 ? 4 : 2;
        const rows = Math.ceil(count / columns);
        const cardGap = clamp(rect.w * 0.018, 16, 28);
        const cardW = (rect.w - cardGap * (columns - 1)) / columns;
        const cardH = (rect.h - cardGap * (rows - 1)) / rows;
        return Array.from({ length: count }, (_, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            return {
                x: rect.x + col * (cardW + cardGap),
                y: rect.y + row * (cardH + cardGap),
                w: cardW,
                h: cardH
            };
        });
    }

    function drawPanorama() {
        const canvas = $("panoramaCanvas");
        syncPanoramaCanvasSize(canvas);
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f8fbff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const data = state.mode === "camera" ? state.camera.panorama : state.upload;
        if (state.mode === "camera") {
            const baseWidth = 980;
            const baseHeight = 560;
            const scale = Math.min(canvas.width / baseWidth, canvas.height / baseHeight);
            ctx.save();
            ctx.translate((canvas.width - baseWidth * scale) / 2, (canvas.height - baseHeight * scale) / 2);
            ctx.scale(scale, scale);
            drawCameraScene(ctx, { width: baseWidth, height: baseHeight });
            ctx.restore();
            return;
        }
        if (!data) {
            $("panoramaEmptyState").hidden = false;
            return;
        }
        $("panoramaEmptyState").hidden = true;
        const content = canvasContentRect(canvas);
        if (state.view === "inputs") {
            const [leftRect, rightRect] = splitContentRects(content, 2);
            drawContained(ctx, data.images.left, leftRect, "图像 A");
            drawContained(ctx, data.images.right, rightRect, "图像 B");
        } else if (state.view === "match") {
            const [leftBox, rightBox] = splitContentRects(content, 2);
            const leftRect = drawContained(ctx, data.images.left, leftBox, "匹配摘要 A");
            const rightRect = drawContained(ctx, data.images.right, rightBox, "匹配摘要 B");
            const inlierSet = new Set(data.geometry.inlierIndices || []);
            data.matches.filter(match => match.passed || match.ratio_passed).slice(0, 55).forEach((match, index) => {
                const p = data.features.left.keypoints[match.left_index];
                const q = data.features.right.keypoints[match.right_index];
                if (!p || !q) return;
                const lx = leftRect.x + p.x / data.images.left.width * leftRect.w;
                const ly = leftRect.y + p.y / data.images.left.height * leftRect.h;
                const rx = rightRect.x + q.x / data.images.right.width * rightRect.w;
                const ry = rightRect.y + q.y / data.images.right.height * rightRect.h;
                ctx.strokeStyle = inlierSet.has(index) ? "rgba(22,163,74,.72)" : "rgba(37,99,235,.25)";
                ctx.lineWidth = inlierSet.has(index) ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(rx, ry);
                ctx.stroke();
            });
        } else if (state.view === "warp") {
            drawContained(ctx, data.layers.rightLayer, content, "Warp 对齐与全景画布边界");
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = clamp(canvas.width * 0.0024, 3, 5);
            ctx.setLineDash([12, 8]);
            ctx.strokeRect(content.x, content.y, content.w, content.h);
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(37,99,235,.13)";
            const maskW = clamp(content.w * 0.36, 280, 520);
            const maskH = clamp(content.h * 0.36, 180, 320);
            const maskX = content.x + content.w * 0.24;
            const maskY = content.y + content.h * 0.30;
            roundRect(ctx, maskX, maskY, maskW, maskH, 16);
            ctx.fill();
            ctx.fillStyle = "#1d4ed8";
            ctx.font = `950 ${clamp(canvas.width * 0.012, 14, 18)}px sans-serif`;
            ctx.fillText("重叠区域 / overlap mask", maskX + 26, maskY + 38);
        } else if (state.view === "blend") {
            const cards = [
                ["overlap mask", data.layers.maskLayer],
                ["blend band", data.blended],
                ["pyramid blend", data.blended],
                ["final blend", data.panorama]
            ];
            const rects = splitContentRects(content, cards.length);
            cards.forEach(([label, img], index) => {
                drawContained(ctx, img, rects[index], label);
            });
        } else {
            drawContained(ctx, data.panorama, content, "全景结果");
        }
    }

    function renderStats() {
        const data = state.mode === "camera" ? state.camera.panorama : state.upload;
        const isCamera = state.mode === "camera";
        $("panoramaInfoTitle").textContent = isCamera ? "摄像头全景拍照" : "双图上传拼接";
        $("panoramaCurrentStep").textContent = isCamera ? state.camera.status : (data ? state.view : "等待输入");
        V.renderStatList($("panoramaInputStatus"), isCamera ? [
            ["摄像头", state.camera.stream ? "已打开" : "未打开"],
            ["已捕获帧数", state.camera.frames.length]
        ] : [
            ["图像 A", data ? `${data.images.left.width} × ${data.images.left.height}` : "等待"],
            ["图像 B", data ? `${data.images.right.width} × ${data.images.right.height}` : "等待"]
        ]);
        V.renderStatList($("panoramaGeometryStatus"), data ? [
            ["内点数", data.geometry.inliers],
            ["平均误差", `${fixed(data.geometry.meanError, 2)} px`],
            ["重叠比例", `${fixed(data.meta.overlapRatio * 100, 1)}%`],
            ["可拼接状态", data.geometry.inliers >= 8 ? "可拼接" : "风险较高"]
        ] : [
            ["内点数", "-"],
            ["平均误差", "-"],
            ["可拼接状态", isCamera ? "等待捕获" : "等待执行"]
        ]);
        V.renderStatList($("panoramaOutputStatus"), data ? [
            ["输出尺寸", `${data.panorama.width} × ${data.panorama.height}`],
            ["融合方式", blendLabel(data.options.blend)],
            ["金字塔层数", data.options.levels],
            ["耗时", `${fixed(data.meta.elapsedMs, 1)} ms`]
        ] : [
            ["融合方式", isCamera ? blendLabel($("cameraExportBlend")?.value || "multiband") : blendLabel(formValue("blend_mode", "multiband"))],
            ["输出结果", "-"]
        ]);
        V.renderStatList($("panoramaStats"), data ? [
            ["输出尺寸", `${data.panorama.width} × ${data.panorama.height}`],
            ["内点数", data.geometry.inliers],
            ["平均误差", `${fixed(data.geometry.meanError, 2)} px`],
            ["融合方式", blendLabel(data.options.blend)],
            ["层数", data.options.levels],
            ["耗时", `${fixed(data.meta.elapsedMs, 1)} ms`]
        ] : [["状态", "等待生成全景图"]]);
        updateFlowStepper();
        drawBlendProcessPanel(data);
    }

    function blendLabel(value) {
        return { average: "平均融合", feather: "Feather 融合", multiband: "多频段融合" }[value] || value;
    }

    function currentFlowKey() {
        if (state.mode === "camera") {
            if (!state.camera.stream) return "camera";
            if (!state.camera.frames.length) return "first";
            if (!state.camera.panorama) return "move";
            return state.camera.stable ? "preview" : "capture";
        }
        if (!state.upload) return "images";
        return {
            inputs: "images",
            match: "match",
            warp: "align",
            blend: "blend",
            result: form.elements.auto_crop?.checked ? "panorama" : "crop"
        }[state.view] || "panorama";
    }

    function updateFlowStepper() {
        const uploadSteps = [
            ["images", "Images", "输入图像"],
            ["match", "Match", "特征匹配"],
            ["align", "Align", "几何对齐"],
            ["blend", "Blend", "图像融合"],
            ["crop", "Crop", "裁剪黑边"],
            ["panorama", "Panorama", "全景输出"]
        ];
        const cameraSteps = [
            ["camera", "Camera", "打开摄像头"],
            ["first", "First Frame", "第一帧"],
            ["move", "Move", "移动取景"],
            ["capture", "Capture", "捕获下一帧"],
            ["stitch", "Stitch", "拼接"],
            ["preview", "Preview", "实时预览"],
            ["export", "Export", "导出"]
        ];
        const steps = state.mode === "camera" ? cameraSteps : uploadSteps;
        const active = currentFlowKey();
        const activeIndex = Math.max(0, steps.findIndex(([key]) => key === active));
        const line = document.querySelector(".feature-flow-line");
        const title = document.querySelector(".feature-flow > strong");
        if (title) title.textContent = state.mode === "camera" ? "摄像头全景拍照流程" : "图像拼接与全景输出流程";
        if (!line) return;
        line.innerHTML = steps.map(([key, en, zh], index) => `
            <button type="button" class="flow-step ${index === activeIndex ? "is-active" : ""} ${index < activeIndex ? "is-done" : ""}" data-panorama-flow="${key}">
                <i>${index + 1}</i><b>${en}</b><small>${zh}</small>
            </button>
        `).join("");
        line.querySelectorAll("[data-panorama-flow]").forEach(button => {
            button.addEventListener("click", () => {
                const key = button.dataset.panoramaFlow;
                const view = { images: "inputs", match: "match", align: "warp", blend: "blend", crop: "result", panorama: "result", preview: "result", export: "result" }[key];
                if (view) setView(view);
            });
        });
    }

    function cameraQuality(result) {
        const minInliers = number($("cameraMinInliers")?.value, 12);
        const maxError = number($("cameraMaxError")?.value, 5);
        const minOverlap = number($("cameraMinOverlap")?.value, 0.35);
        const inliers = number(result?.geometry?.inliers, 0);
        const error = number(result?.geometry?.meanError, Infinity);
        const overlap = number(result?.meta?.overlapRatio, 0);
        const stable = inliers >= minInliers && error <= maxError && overlap >= minOverlap;
        const weak = inliers >= Math.max(4, minInliers * 0.65) && error <= maxError * 1.6 && overlap >= minOverlap * 0.65;
        return { stable, weak, inliers, error, overlap, minInliers, maxError, minOverlap };
    }

    function cameraStitchOptions(blend, scale = 0.7) {
        return {
            algorithm: $("cameraAlgorithm").value,
            ratio: 0.78,
            threshold: number($("cameraMaxError").value, 5),
            model: "affine",
            blend,
            levels: blend === "multiband" ? 5 : 3,
            autoCrop: blend === "multiband",
            scale
        };
    }

    function drawBlendProcessPanel(data) {
        const panel = $("blendProcessPanel");
        if (!panel || panel.hidden || !data?.layers) return;
        const canvases = Array.from(panel.querySelectorAll("canvas"));
        const labels = [
            ["Gaussian Mask Pyramid", data.layers.maskLayer],
            ["Laplacian A / B", data.layers.leftLayer],
            ["Blend Pyramid", data.blended],
            ["Collapse", data.panorama]
        ];
        canvases.forEach((canvas, index) => {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#f8fbff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const [label, img] = labels[index] || labels[0];
            if (img) drawContained(ctx, img, { x: 8, y: 18, w: canvas.width - 16, h: canvas.height - 26 }, "");
            ctx.fillStyle = "#1d4ed8";
            ctx.font = "900 10px sans-serif";
            ctx.fillText(label, 10, 13);
        });
    }

    async function runUploadStitch() {
        if (state.busy) return;
        state.busy = true;
        $("panoramaElapsed").textContent = "拼接中...";
        $("panoramaEmptyState").hidden = false;
        $("panoramaEmptyState").textContent = "正在检测特征、估计几何变换并融合图像...";
        try {
            const sources = await inputSources();
            state.upload = await stitchSources(sources.left, sources.right, {
                algorithm: formValue("algorithm", "sift"),
                ratio: formNumber("ratio_threshold", 0.75, 0.4, 0.95),
                threshold: formNumber("ransac_threshold", 4, 1, 20),
                model: formValue("transform_model", "homography"),
                blend: formValue("blend_mode", "multiband"),
                levels: Math.round(formNumber("pyramid_levels", 5, 3, 6)),
                autoCrop: Boolean(form.elements.auto_crop?.checked),
                scale: formNumber("output_scale", 1, 0.25, 1)
            });
            state.view = "result";
            setView("result");
            $("panoramaElapsed").textContent = `${fixed(state.upload.meta.elapsedMs, 2)} ms`;
        } catch (error) {
            showError(error.message || "图像拼接失败，请检查输入。");
        } finally {
            state.busy = false;
            renderStats();
            drawPanorama();
        }
    }

    function showError(message) {
        $("panoramaEmptyState").hidden = false;
        $("panoramaEmptyState").textContent = message;
        $("panoramaElapsed").textContent = "处理失败";
    }

    function setMode(mode) {
        state.mode = mode;
        if (mode !== "camera") stopAutoCapture();
        document.querySelectorAll("[data-panorama-mode]").forEach(button => button.classList.toggle("is-active", button.dataset.panoramaMode === mode));
        document.querySelectorAll("[data-panorama-controls]").forEach(box => { box.hidden = box.dataset.panoramaControls !== mode; });
        $("panoramaStageTitle").textContent = mode === "camera" ? "摄像头连续拍摄全景" : "双图拼接结果预览";
        state.view = mode === "camera" ? "result" : "inputs";
        document.querySelectorAll("[data-panorama-view]").forEach(button => button.classList.toggle("is-active", button.dataset.panoramaView === state.view));
        renderStats();
        drawPanorama();
    }

    function setView(view) {
        state.view = view;
        document.querySelectorAll("[data-panorama-view]").forEach(button => button.classList.toggle("is-active", button.dataset.panoramaView === view));
        drawPanorama();
        renderStats();
    }

    function captureVideoFrame() {
        const video = $("panoramaVideo");
        if (!video.videoWidth || !video.videoHeight) return null;
        const canvas = document.createElement("canvas");
        V.setCanvasSize(canvas, video.videoWidth, video.videoHeight);
        canvas.getContext("2d").drawImage(video, 0, 0);
        return canvas.toDataURL("image/png");
    }

    async function openCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
            state.camera.stream = stream;
            const video = $("panoramaVideo");
            video.srcObject = stream;
            video.hidden = true;
            await video.play();
            state.camera.status = "请沿箭头方向缓慢移动";
            drawPanorama();
            renderStats();
        } catch (error) {
            state.camera.status = "摄像头权限失败";
            showError("摄像头权限失败，请允许浏览器访问摄像头。");
            renderStats();
        }
    }

    async function captureCameraFrame(first = false) {
        const frame = captureVideoFrame();
        if (!frame) {
            showError("摄像头尚未就绪。");
            return;
        }
        if (first || !state.camera.frames.length) {
            state.camera.frames = [frame];
            state.camera.panorama = null;
            state.camera.status = "第一帧已捕获，请向右缓慢移动";
        } else {
            const previous = state.camera.panorama?.panorama?.toDataURL("image/png") || state.camera.frames[state.camera.frames.length - 1];
            try {
                const result = await stitchSources(previous, frame, {
                    algorithm: $("cameraAlgorithm").value,
                    ratio: 0.78,
                    threshold: number($("cameraMaxError").value, 5),
                    model: "affine",
                    blend: $("cameraPreviewBlend").value,
                    levels: 3,
                    autoCrop: false,
                    scale: .7
                });
                const minInliers = number($("cameraMinInliers").value, 12);
                if (result.geometry.inliers < minInliers) throw new Error("当前帧不可拼接：内点数不足。");
                state.camera.frames.push(frame);
                state.camera.panorama = result;
                state.camera.status = "检测到稳定重叠，可捕获下一帧";
                state.camera.lastMetrics = result.geometry;
            } catch (error) {
                state.camera.status = error.message || "当前帧不可拼接";
            }
        }
        renderStats();
        drawPanorama();
    }

    async function captureCameraFrameEnhanced(first = false) {
        if (state.busy) return;
        const frame = captureVideoFrame();
        if (!frame) {
            showError("摄像头尚未就绪。");
            return;
        }
        if (first || !state.camera.frames.length) {
            state.camera.frames = [frame];
            state.camera.panorama = null;
            state.camera.stable = false;
            state.camera.lastOverlap = 0;
            state.camera.status = "第一帧已捕获，请向右缓慢移动";
            renderStats();
            drawPanorama();
            return;
        }
        const previous = state.camera.panorama?.panorama?.toDataURL("image/png") || state.camera.frames[state.camera.frames.length - 1];
        try {
            state.busy = true;
            state.camera.status = "正在检测重叠并拼接当前帧";
            renderStats();
            const result = await stitchSources(previous, frame, cameraStitchOptions($("cameraPreviewBlend").value, .7));
            const quality = cameraQuality(result);
            if (!quality.stable) {
                const reason = quality.inliers < quality.minInliers ? "内点数不足" : quality.overlap < quality.minOverlap ? "重叠区域太小" : "重投影误差偏大";
                throw new Error(`当前帧不可拼接：${reason}`);
            }
            state.camera.frames.push(frame);
            state.camera.panorama = result;
            state.camera.stable = true;
            state.camera.lastOverlap = quality.overlap;
            state.camera.lastMetrics = result.geometry;
            state.camera.status = "检测到稳定重叠，可捕获下一帧";
        } catch (error) {
            state.camera.stable = false;
            state.camera.status = error.message || "当前帧不可拼接";
        } finally {
            state.busy = false;
        }
        renderStats();
        drawPanorama();
    }

    function drawCameraScene(ctx, canvas) {
        const video = $("panoramaVideo");
        $("panoramaEmptyState").hidden = Boolean(state.camera.stream);
        if (state.camera.stream && video.videoWidth) {
            const rect = { x: 38, y: 32, w: 560, h: 330 };
            drawVideoContained(ctx, video, rect);
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 3;
            roundRect(ctx, rect.x + rect.w / 2 - 105, rect.y + 52, 210, 210, 20);
            ctx.stroke();
            ctx.strokeStyle = "#16a34a";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(rect.x + 90, rect.y + rect.h + 34);
            ctx.lineTo(rect.x + rect.w - 92, rect.y + rect.h + 34);
            ctx.stroke();
            ctx.fillStyle = "#16a34a";
            ctx.beginPath();
            ctx.moveTo(rect.x + rect.w - 92, rect.y + rect.h + 34);
            ctx.lineTo(rect.x + rect.w - 112, rect.y + rect.h + 22);
            ctx.lineTo(rect.x + rect.w - 112, rect.y + rect.h + 46);
            ctx.fill();
            ctx.fillStyle = "#1e3a8a";
            ctx.font = "950 18px sans-serif";
            ctx.fillText("请沿箭头方向缓慢移动", rect.x + 160, rect.y + rect.h + 72);
            ctx.fillStyle = "#64748b";
            ctx.font = "850 13px sans-serif";
            ctx.fillText("保持足够重叠区域；检测到稳定重叠后可捕获下一帧", rect.x + 128, rect.y + rect.h + 96);
        }
        if (state.camera.frames.length) {
            const ghostY = 462;
            const ghostW = Math.min(460, 92 + state.camera.frames.length * 72);
            ctx.save();
            ctx.fillStyle = "rgba(37,99,235,.10)";
            roundRect(ctx, 84, ghostY, ghostW, 34, 17);
            ctx.fill();
            for (let i = 0; i < state.camera.frames.length; i += 1) {
                const x = 98 + i * 58;
                ctx.fillStyle = `rgba(37,99,235,${0.12 + Math.min(.32, i * .04)})`;
                roundRect(ctx, x, ghostY + 6, 74, 22, 11);
                ctx.fill();
            }
            ctx.fillStyle = "#1d4ed8";
            ctx.font = "900 11px sans-serif";
            ctx.fillText(`已拍摄区域 ghost × ${state.camera.frames.length}`, 104, ghostY + 23);
            ctx.restore();
        }

        const preview = { x: 640, y: 52, w: 300, h: 260 };
        ctx.fillStyle = "#f1f5f9";
        roundRect(ctx, preview.x, preview.y, preview.w, preview.h, 16);
        ctx.fill();
        if (state.camera.panorama) drawContained(ctx, state.camera.panorama.panorama, preview, "实时全景预览");
        else {
            ctx.fillStyle = "#64748b";
            ctx.font = "900 14px sans-serif";
            ctx.fillText("实时全景预览", preview.x + 24, preview.y + 42);
        }
        const status = state.camera.panorama?.geometry || {};
        const inliers = number(status.inliers, 0);
        const error = number(status.meanError, 0);
        const ok = inliers >= number($("cameraMinInliers").value, 12);
        drawCameraStatus(ctx, { x: 640, y: 340, w: 300, h: 132 }, ok, inliers, error);
    }

    function drawVideoContained(ctx, video, rect) {
        ctx.save();
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
        ctx.clip();
        const scale = Math.max(rect.w / video.videoWidth, rect.h / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;
        ctx.drawImage(video, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
        ctx.restore();
    }

    function drawCameraStatus(ctx, rect, ok, inliers, error) {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = ok ? "#86efac" : inliers ? "#fde68a" : "#fecaca";
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
        ctx.fill();
        ctx.stroke();
        const rows = [
            ["重叠度", ok ? "稳定" : "等待"],
            ["RANSAC 内点数", inliers],
            ["平均重投影误差", error ? `${fixed(error, 2)} px` : "-"],
            ["可拼接状态", ok ? "可捕获" : (inliers ? "勉强可拼接" : "不可拼接")]
        ];
        rows.forEach(([label, value], index) => {
            ctx.fillStyle = "#475569";
            ctx.font = "850 12px sans-serif";
            ctx.fillText(label, rect.x + 18, rect.y + 26 + index * 26);
            ctx.fillStyle = ok ? "#15803d" : inliers ? "#ca8a04" : "#dc2626";
            ctx.font = "950 12px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(String(value), rect.x + rect.w - 18, rect.y + 26 + index * 26);
            ctx.textAlign = "left";
        });
    }

    function drawCameraStatus(ctx, rect, ok, inliers, error) {
        const overlap = state.camera.lastOverlap || state.camera.panorama?.meta?.overlapRatio || 0;
        const weak = inliers > 0 || overlap > 0;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = ok ? "#86efac" : weak ? "#fde68a" : "#fecaca";
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
        ctx.fill();
        ctx.stroke();
        const rows = [
            ["重叠度", overlap ? `${fixed(overlap * 100, 1)}%` : "-"],
            ["RANSAC 内点数", inliers],
            ["平均重投影误差", error ? `${fixed(error, 2)} px` : "-"],
            ["稳定度", ok ? "稳定" : weak ? "勉强" : "不足"],
            ["可拼接状态", ok ? "可捕获" : weak ? "需要更稳" : "不可拼接"]
        ];
        rows.forEach(([label, value], index) => {
            const y = rect.y + 23 + index * 21;
            ctx.fillStyle = "#475569";
            ctx.font = "850 11px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(label, rect.x + 16, y);
            ctx.fillStyle = ok ? "#15803d" : weak ? "#ca8a04" : "#dc2626";
            ctx.font = "950 11px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(String(value), rect.x + rect.w - 16, y);
        });
        ctx.textAlign = "left";
    }

    function stopAutoCapture() {
        if (state.camera.autoTimer) clearInterval(state.camera.autoTimer);
        state.camera.autoTimer = 0;
        const toggle = $("cameraAutoCapture");
        if (toggle) toggle.checked = false;
    }

    function startAutoCapture() {
        stopAutoCapture();
        const toggle = $("cameraAutoCapture");
        if (toggle) toggle.checked = true;
        state.camera.autoTimer = setInterval(() => {
            if (!state.camera.stream || state.busy) return;
            if (!state.camera.frames.length) captureCameraFrameEnhanced(true);
            else captureCameraFrameEnhanced(false);
        }, 3200);
    }

    function stopCamera() {
        stopAutoCapture();
        state.camera.stream?.getTracks().forEach(track => track.stop());
        state.camera.stream = null;
        $("panoramaVideo").srcObject = null;
        state.camera.status = "已停止拍摄";
        renderStats();
        drawPanorama();
    }

    function resetCamera() {
        stopAutoCapture();
        state.camera.frames = [];
        state.camera.panorama = null;
        state.camera.stable = false;
        state.camera.lastOverlap = 0;
        state.camera.status = state.camera.stream ? "请拍摄第一帧" : "idle";
        renderStats();
        drawPanorama();
    }

    async function buildCameraExportPanorama() {
        if (state.camera.frames.length < 2) return state.camera.panorama;
        let source = state.camera.frames[0];
        let result = null;
        const blend = $("cameraExportBlend")?.value || "multiband";
        for (let index = 1; index < state.camera.frames.length; index += 1) {
            result = await stitchSources(source, state.camera.frames[index], cameraStitchOptions(blend, 1));
            source = result.panorama.toDataURL("image/png");
        }
        return result;
    }

    async function downloadPanoramaFinal() {
        if (state.busy) return;
        let data = state.mode === "camera" ? state.camera.panorama : state.upload;
        if (state.mode === "camera" && state.camera.frames.length > 1) {
            try {
                state.busy = true;
                $("panoramaElapsed").textContent = "高质量导出中...";
                state.camera.status = "正在使用最终融合方式重建全景";
                renderStats();
                data = await buildCameraExportPanorama();
                if (data) {
                    state.camera.panorama = data;
                    state.camera.status = "最终全景已生成，可导出";
                }
            } catch (error) {
                showError(error.message || "最终导出失败。");
                state.busy = false;
                renderStats();
                return;
            } finally {
                state.busy = false;
            }
        }
        if (!data?.panorama) return;
        const a = document.createElement("a");
        a.href = data.panorama.toDataURL("image/png");
        a.download = "panorama.png";
        a.click();
        renderStats();
        drawPanorama();
    }

    function downloadPanorama() {
        const data = state.mode === "camera" ? state.camera.panorama : state.upload;
        if (!data?.panorama) return;
        const a = document.createElement("a");
        a.href = data.panorama.toDataURL("image/png");
        a.download = "panorama.png";
        a.click();
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        runUploadStitch();
    });
    document.querySelectorAll("[data-panorama-mode]").forEach(button => {
        button.addEventListener("click", () => setMode(button.dataset.panoramaMode));
    });
    document.querySelectorAll("[data-panorama-view]").forEach(button => {
        button.addEventListener("click", () => setView(button.dataset.panoramaView));
    });
    document.querySelectorAll("[data-camera-action]").forEach(button => {
        button.addEventListener("click", () => {
            const action = button.dataset.cameraAction;
            if (action === "open") openCamera();
            if (action === "first") captureCameraFrameEnhanced(true);
            if (action === "next") captureCameraFrameEnhanced(false);
            if (action === "stop") stopCamera();
            if (action === "reset") resetCamera();
            if (action === "export") downloadPanoramaFinal();
        });
    });
    $("cameraAutoCapture")?.addEventListener("change", event => {
        if (event.target.checked) startAutoCapture();
        else stopAutoCapture();
    });
    $("blendProcessToggle")?.addEventListener("click", () => {
        const panel = $("blendProcessPanel");
        panel.hidden = !panel.hidden;
    });
    $("panoramaDownload")?.addEventListener("click", downloadPanoramaFinal);
    if (window.ResizeObserver) {
        const canvasResizeObserver = new ResizeObserver(() => drawPanorama());
        canvasResizeObserver.observe($("panoramaCanvas"));
    } else {
        window.addEventListener("resize", drawPanorama);
    }

    setMode("upload");
    renderStats();
    drawPanorama();
})();
