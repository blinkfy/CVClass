(function () {
    "use strict";

    const V = window.FeatureViz;

    // ===== A. 小型矩阵工具 =====
    const M = {
        matMul3(A, B) {
            const r = [[0,0,0],[0,0,0],[0,0,0]];
            for (let i=0;i<3;i++) for (let j=0;j<3;j++) {
                let s=0;
                for (let k=0;k<3;k++) s += A[i][k]*B[k][j];
                r[i][j] = s;
            }
            return r;
        },
        matVec3(A, v) {
            return [
                A[0][0]*v[0]+A[0][1]*v[1]+A[0][2]*v[2],
                A[1][0]*v[0]+A[1][1]*v[1]+A[1][2]*v[2],
                A[2][0]*v[0]+A[2][1]*v[1]+A[2][2]*v[2]
            ];
        },
        transpose3(A) {
            return [[A[0][0],A[1][0],A[2][0]],[A[0][1],A[1][1],A[2][1]],[A[0][2],A[1][2],A[2][2]]];
        },
        scale3(A, s) { return A.map(r=>r.map(x=>x*s)); },
        det3(A) {
            return A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1])
                 - A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])
                 + A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);
        },
        frobenius3(A) {
            let s=0;
            for (let i=0;i<3;i++) for (let j=0;j<3;j++) s += A[i][j]*A[i][j];
            return Math.sqrt(s);
        },
        cross3(u, v) { return [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]; },
        norm3(v) { return Math.hypot(v[0], v[1], v[2]); },
        normalize3(v) {
            const n = Math.max(1e-12, Math.hypot(v[0], v[1], v[2]));
            return [v[0]/n, v[1]/n, v[2]/n];
        },
        eye34() { return [[1,0,0,0],[0,1,0,0],[0,0,1,0]]; },
        appendCol(R, t) { return [R[0].concat(t[0]), R[1].concat(t[1]), R[2].concat(t[2])]; },
        diag3(s) { return [[s[0],0,0],[0,s[1],0],[0,0,s[2]]]; },
        composeP(K, RT) {
            const r = [[0,0,0,0],[0,0,0,0],[0,0,0,0]];
            for (let i=0;i<3;i++) for (let j=0;j<4;j++) {
                let s=0;
                for (let k=0;k<3;k++) s += K[i][k]*RT[k][j];
                r[i][j] = s;
            }
            return r;
        }
    };

    // ===== B. 对称 Jacobi 特征分解 A = Q Λ Q^T (统一基础件) =====
    function jacobiSym(Ain, n, opts) {
        opts = opts || {};
        const maxSweeps = opts.maxSweeps || 100;
        const tol = opts.tol || 1e-12;
        const A = [];
        for (let i=0;i<n;i++) A.push(Ain[i].slice());
        const Q = [];
        for (let i=0;i<n;i++) { const row = new Array(n).fill(0); row[i]=1; Q.push(row); }

        const frob = () => {
            let s=0;
            for (let i=0;i<n;i++) for (let j=0;j<n;j++) s += A[i][j]*A[i][j];
            return Math.sqrt(s);
        };
        const off = () => {
            let s=0;
            for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) s += A[i][j]*A[i][j];
            return Math.sqrt(s);
        };

        for (let sweep=0; sweep<maxSweeps; sweep++) {
            if (off() < tol * Math.max(frob(), 1e-300)) break;
            let rotated = false;
            for (let p=0;p<n-1;p++) {
                for (let q=p+1;q<n;q++) {
                    const apq = A[p][q];
                    if (Math.abs(apq) < 1e-300) continue;
                    const app = A[p][p], aqq = A[q][q];
                    if (Math.abs(apq) < tol * Math.sqrt(Math.max(Math.abs(app)*Math.abs(aqq), 1e-300))) continue;
                    rotated = true;
                    const tau = (aqq - app) / (2 * apq);
                    const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(tau*tau + 1));
                    const c = 1 / Math.sqrt(t*t + 1);
                    const s = t * c;
                    const tauRot = s / (1 + c);
                    for (let i=0;i<n;i++) {
                        if (i===p || i===q) continue;
                        const aip = A[i][p], aiq = A[i][q];
                        A[i][p] = aip - s*(aiq + tauRot*aip);
                        A[p][i] = A[i][p];
                        A[i][q] = aiq + s*(aip - tauRot*aiq);
                        A[q][i] = A[i][q];
                    }
                    A[p][p] = app - t*apq;
                    A[q][q] = aqq + t*apq;
                    A[p][q] = 0; A[q][p] = 0;
                    for (let i=0;i<n;i++) {
                        const qip = Q[i][p], qiq = Q[i][q];
                        Q[i][p] = c*qip - s*qiq;
                        Q[i][q] = s*qip + c*qiq;
                    }
                }
            }
            if (!rotated) break;
        }

        const eig = [];
        for (let i=0;i<n;i++) {
            const vec = [];
            for (let r=0;r<n;r++) vec.push(Q[r][i]);
            eig.push({ val: A[i][i], vec });
        }
        eig.sort((a, b) => a.val - b.val);
        const eigenvalues = eig.map(e => e.val);
        const Qout = [];
        for (let i=0;i<n;i++) Qout.push(new Array(n));
        for (let k=0;k<n;k++) for (let i=0;i<n;i++) Qout[i][k] = eig[k].vec[i];
        return { eigenvalues, Q: Qout };
    }

    // ===== C. 3×3 SVD: A = U S V^T (经 A^T A 对称特征分解) =====
    function svd3x3(A) {
        const AtA = M.matMul3(M.transpose3(A), A);
        const { eigenvalues, Q } = jacobiSym(AtA, 3);
        const order = [2, 1, 0];
        const S = order.map(k => Math.sqrt(Math.max(0, eigenvalues[k])));
        const V = [[0,0,0],[0,0,0],[0,0,0]];
        for (let k=0;k<3;k++) {
            const src = order[k];
            V[0][k]=Q[0][src]; V[1][k]=Q[1][src]; V[2][k]=Q[2][src];
        }
        const U = [[0,0,0],[0,0,0],[0,0,0]];
        const smax = Math.max(S[0], 1e-12);
        const computed = [false, false, false];
        for (let k=0;k<3;k++) {
            if (S[k] > 1e-9 * smax) {
                const vk = [V[0][k], V[1][k], V[2][k]];
                const Avk = M.matVec3(A, vk);
                U[0][k] = Avk[0]/S[k]; U[1][k] = Avk[1]/S[k]; U[2][k] = Avk[2]/S[k];
                computed[k] = true;
            }
        }
        for (let k=0;k<3;k++) {
            if (!computed[k]) {
                let k1=-1, k2=-1;
                for (let j=0;j<3;j++) if (computed[j]) { if (k1<0) k1=j; else if (k2<0) k2=j; }
                if (k1>=0 && k2>=0) {
                    const u1=[U[0][k1],U[1][k1],U[2][k1]];
                    const u2=[U[0][k2],U[1][k2],U[2][k2]];
                    const uc = M.normalize3(M.cross3(u1, u2));
                    U[0][k]=uc[0]; U[1][k]=uc[1]; U[2][k]=uc[2];
                }
                computed[k] = true;
            }
        }
        if (M.det3(U) < 0) { U[0][2]=-U[0][2]; U[1][2]=-U[1][2]; U[2][2]=-U[2][2]; }
        if (M.det3(V) < 0) { V[0][2]=-V[0][2]; V[1][2]=-V[1][2]; V[2][2]=-V[2][2]; }
        return { U, S, Vt: M.transpose3(V) };
    }

    // ===== D. BFMatcher + ratio test (分块让出) =====
    async function bfMatcherRatio(descL, descR, opts, onProgress) {
        opts = opts || {};
        const ratioTh = opts.ratio != null ? opts.ratio : 0.74;
        const nL = descL.length, nR = descR.length;
        const L = descL.map(d => new Float32Array(d));
        const R = descR.map(d => new Float32Array(d));
        const dim = L.length ? L[0].length : 128;
        const good = [];
        const raw = [];
        const CHUNK = 50;
        for (let i=0;i<nL;i++) {
            let best=Infinity, second=Infinity, bestJ=-1;
            const li = L[i];
            for (let j=0;j<nR;j++) {
                const rj = R[j];
                let d = 0;
                for (let k=0;k<dim;k++) { const t = li[k]-rj[k]; d += t*t; }
                if (d < best) { second = best; best = d; bestJ = j; }
                else if (d < second) { second = d; }
            }
            if (bestJ < 0) continue;
            const ratio = Math.sqrt(best) / Math.max(Math.sqrt(second), 1e-9);
            raw.push({ leftIdx:i, rightIdx:bestJ, distanceSq:best, ratio });
            if (ratio < ratioTh) {
                good.push({ leftIdx:i, rightIdx:bestJ, distanceSq:best, ratio });
            }
            if (i % CHUNK === CHUNK-1) {
                if (onProgress) onProgress((i+1)/nL);
                await new Promise(r => setTimeout(r, 0));
            }
        }
        good.sort((a, b) => (a.ratio - b.ratio) || (a.distanceSq - b.distanceSq));
        if (onProgress) onProgress(1);
        return { good, raw };
    }

    // ===== E. 归一化 8 点法 =====
    function hartleyNormalize(pts) {
        const n = pts.length;
        let cx=0, cy=0;
        for (const p of pts) { cx += p[0]; cy += p[1]; }
        cx /= n; cy /= n;
        let md = 0;
        for (const p of pts) md += Math.hypot(p[0]-cx, p[1]-cy);
        md = Math.max(1e-9, md/n);
        const s = Math.SQRT2 / md;
        const T = [[s,0,-s*cx],[0,s,-s*cy],[0,0,1]];
        const np = pts.map(p => [s*(p[0]-cx), s*(p[1]-cy)]);
        return { np, T };
    }

    function eightPoint(ptsL, ptsR) {
        const { np:nL, T:T1 } = hartleyNormalize(ptsL);
        const { np:nR, T:T2 } = hartleyNormalize(ptsR);
        const N = nL.length;
        const Mt = [];
        for (let i=0;i<9;i++) Mt.push(new Array(9).fill(0));
        const row = new Array(9);
        for (let i=0;i<N;i++) {
            const x=nL[i][0], y=nL[i][1], xp=nR[i][0], yp=nR[i][1];
            row[0]=xp*x; row[1]=xp*y; row[2]=xp;
            row[3]=yp*x; row[4]=yp*y; row[5]=yp;
            row[6]=x;    row[7]=y;    row[8]=1;
            for (let a=0;a<9;a++) {
                const va = row[a];
                for (let b=a;b<9;b++) Mt[a][b] += va*row[b];
            }
        }
        for (let a=0;a<9;a++) for (let b=0;b<a;b++) Mt[a][b] = Mt[b][a];
        const { eigenvalues, Q } = jacobiSym(Mt, 9);
        const f = [];
        for (let i=0;i<9;i++) f.push(Q[i][0]);
        const Fn = [[f[0],f[1],f[2]],[f[3],f[4],f[5]],[f[6],f[7],f[8]]];
        const { U, S, Vt } = svd3x3(Fn);
        const S2 = [S[0], S[1], 0];
        const Fn2 = M.matMul3(M.matMul3(U, M.diag3(S2)), Vt);
        let F = M.matMul3(M.matMul3(M.transpose3(T2), Fn2), T1);
        const fn = Math.max(1e-12, M.frobenius3(F));
        F = M.scale3(F, 1/fn);
        return { F };
    }

    // ===== F. 极线误差 =====
    function epipolarError(F, l, r) {
        const x=l[0], y=l[1], xp=r[0], yp=r[1];
        const a = F[0][0]*x + F[0][1]*y + F[0][2];
        const b = F[1][0]*x + F[1][1]*y + F[1][2];
        const c = F[2][0]*x + F[2][1]*y + F[2][2];
        const denom = Math.max(1e-9, Math.hypot(a, b));
        const err = Math.abs(a*xp + b*yp + c) / denom;
        return { err, line: [a, b, c] };
    }

    // ===== G. RANSAC 估计 F =====
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function sampleNoReplace(n, k, rng) {
        const idx = Array.from({length:n}, (_, i) => i);
        for (let i=0;i<k;i++) {
            const j = i + Math.floor(rng() * (n-i));
            const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
        }
        return idx.slice(0, k);
    }

    function ransacFindF(ptsL, ptsR, opts) {
        opts = opts || {};
        const threshold = opts.threshold != null ? opts.threshold : 1.35;
        const confidence = 0.995;
        const minIters = 200, maxIters = 8000, sampleSize = 8;
        const N = ptsL.length;
        if (N < sampleSize) throw new Error("匹配点不足 8 对，无法 RANSAC");
        const rng = mulberry32(opts.seed || 0xC10E);
        let bestInliers = null, bestF = null, bestErr = Infinity;
        let adaptiveN = maxIters, itersDone = 0;
        while (itersDone < Math.min(maxIters, adaptiveN)) {
            itersDone++;
            const idx = sampleNoReplace(N, sampleSize, rng);
            let res;
            try {
                res = eightPoint(idx.map(i => ptsL[i]), idx.map(i => ptsR[i]));
            } catch (e) { continue; }
            const F = res.F;
            const inliers = [];
            let errSum = 0;
            for (let i=0;i<N;i++) {
                const { err } = epipolarError(F, ptsL[i], ptsR[i]);
                if (err < threshold) { inliers.push(i); errSum += err; }
            }
            const cur = bestInliers ? bestInliers.length : 0;
            if (inliers.length > cur || (inliers.length === cur && errSum < bestErr)) {
                bestInliers = inliers; bestF = F; bestErr = errSum;
                const w = inliers.length / N;
                if (w > 0) {
                    adaptiveN = Math.ceil(Math.log(1 - confidence) / Math.log(1 - Math.pow(w, sampleSize)));
                    if (adaptiveN < minIters) adaptiveN = minIters;
                }
            }
        }
        if (!bestInliers || bestInliers.length < 8) throw new Error("RANSAC 内点不足 8");
        const ref = eightPoint(bestInliers.map(i => ptsL[i]), bestInliers.map(i => ptsR[i]));
        const F = ref.F;
        const mask = new Array(N).fill(false);
        let count = 0;
        for (let i=0;i<N;i++) {
            const { err } = epipolarError(F, ptsL[i], ptsR[i]);
            if (err < threshold) { mask[i] = true; count++; }
        }
        return { F, inliers: mask, inlierCount: count, itersDone };
    }

    // ===== H. decomposeEssentialMat =====
    function decomposeE(E) {
        const { U, Vt } = svd3x3(E);
        const W = [[0,-1,0],[1,0,0],[0,0,1]];
        const R1 = M.matMul3(M.matMul3(U, W), Vt);
        const R2 = M.matMul3(M.matMul3(U, M.transpose3(W)), Vt);
        const t = [U[0][2], U[1][2], U[2][2]];
        return { R1, R2, t };
    }

    // ===== J. DLT 三角化 =====
    function triangulateDLT(P1, P2, pts1, pts2) {
        const N = pts1.length;
        const result = new Array(N);
        for (let i=0;i<N;i++) {
            const x=pts1[i][0], y=pts1[i][1], xp=pts2[i][0], yp=pts2[i][1];
            const A = [
                [x*P1[2][0]-P1[0][0], x*P1[2][1]-P1[0][1], x*P1[2][2]-P1[0][2], x*P1[2][3]-P1[0][3]],
                [y*P1[2][0]-P1[1][0], y*P1[2][1]-P1[1][1], y*P1[2][2]-P1[1][2], y*P1[2][3]-P1[1][3]],
                [xp*P2[2][0]-P2[0][0], xp*P2[2][1]-P2[0][1], xp*P2[2][2]-P2[0][2], xp*P2[2][3]-P2[0][3]],
                [yp*P2[2][0]-P2[1][0], yp*P2[2][1]-P2[1][1], yp*P2[2][2]-P2[1][2], yp*P2[2][3]-P2[1][3]]
            ];
            const M4 = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
            for (let a=0;a<4;a++) for (let b=0;b<4;b++) {
                let s=0;
                for (let r=0;r<4;r++) s += A[r][a]*A[r][b];
                M4[a][b] = s;
            }
            const { Q } = jacobiSym(M4, 4);
            const w = Q[3][0];
            if (Math.abs(w) < 1e-9) {
                result[i] = [NaN, NaN, NaN];
            } else {
                result[i] = [Q[0][0]/w, Q[1][0]/w, Q[2][0]/w];
            }
        }
        return result;
    }

    function project(P, pts3) {
        return pts3.map(p => {
            const X=p[0], Y=p[1], Z=p[2];
            if (!Number.isFinite(X)) return [NaN, NaN];
            const x = P[0][0]*X + P[0][1]*Y + P[0][2]*Z + P[0][3];
            const y = P[1][0]*X + P[1][1]*Y + P[1][2]*Z + P[1][3];
            const w = P[2][0]*X + P[2][1]*Y + P[2][2]*Z + P[2][3];
            if (Math.abs(w) < 1e-9) return [NaN, NaN];
            return [x/w, y/w];
        });
    }

    // ===== I. cheirality 选择 =====
    function positiveDepthCount(R, t, K, pts1, pts2) {
        const P1 = M.composeP(K, M.eye34());
        const P2 = M.composeP(K, M.appendCol(R, t));
        const pts3 = triangulateDLT(P1, P2, pts1, pts2);
        let positive = 0, finite = 0;
        for (const p of pts3) {
            if (!Number.isFinite(p[0])) continue;
            finite++;
            const cam2z = R[2][0]*p[0] + R[2][1]*p[1] + R[2][2]*p[2] + t[2];
            if (p[2] > 0 && cam2z > 0) positive++;
        }
        return { positive, finite };
    }

    function selectPose(E, K, pts1, pts2) {
        const { R1, R2, t } = decomposeE(E);
        const nt = [-t[0], -t[1], -t[2]];
        const cands = [
            { label:"R1, +t", R:R1, t },
            { label:"R1, -t", R:R1, t:nt },
            { label:"R2, +t", R:R2, t },
            { label:"R2, -t", R:R2, t:nt }
        ];
        const results = cands.map((c, i) => {
            const { positive, finite } = positiveDepthCount(c.R, c.t, K, pts1, pts2);
            return {
                id: i+1, label: c.label, R: c.R, t: c.t,
                positive_depth: positive,
                negative_depth: Math.max(0, finite - positive),
                total: finite
            };
        });
        let sel = results[0];
        for (const r of results) if (r.positive_depth > sel.positive_depth) sel = r;
        results.forEach(r => r.selected = (r.id === sel.id));
        return { R: sel.R, t: sel.t, selectedId: sel.id, candidates: results };
    }

    // ===== K. 点云归一化 =====
    function percentile(vals, p) {
        if (!vals.length) return 0;
        const s = Float64Array.from(vals).sort();
        const n = s.length;
        const rank = (p/100) * (n-1);
        const lo = Math.floor(rank), hi = Math.ceil(rank);
        if (lo === hi) return s[lo];
        const f = rank - lo;
        return s[lo]*(1-f) + s[hi]*f;
    }

    function normalizeCloud(pts3) {
        const finite = pts3.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]));
        if (!finite.length) return pts3.map(() => [0, 0, 0]);
        const cx = percentile(finite.map(p => p[0]), 50);
        const cy = percentile(finite.map(p => p[1]), 50);
        const cz = percentile(finite.map(p => p[2]), 50);
        const sX = percentile(finite.map(p => Math.abs(p[0]-cx)), 75);
        const sY = percentile(finite.map(p => Math.abs(p[1]-cy)), 75);
        const sZ = percentile(finite.map(p => Math.abs(p[2]-cz)), 75);
        const scale = Math.max(sX, sY, sZ, 1e-6);
        const fz = finite.map(p => p[2]);
        const zMin = Math.min.apply(null, fz);
        const zMax = Math.max.apply(null, fz);
        const zRange = Math.max(zMax - zMin, 1e-6);
        return pts3.map(p => {
            const z = p[2];
            const nz = Number.isFinite(z)
                ? Math.max(1.5, Math.min(5.2, (z - zMin)/zRange * 2.5 + 2.2))
                : NaN;
            return [(p[0]-cx)/scale, (p[1]-cy)/scale, nz];
        });
    }

    // ===== utils =====
    function makeIntrinsics(w, h) {
        const f = 0.92 * Math.max(w, h);
        return [[f, 0, w/2], [0, f, h/2], [0, 0, 1]];
    }

    function clampInt(v, d, lo, hi) { v = parseInt(v); if (!Number.isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
    function clampFlt(v, d, lo, hi) { v = parseFloat(v); if (!Number.isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
    function round(v, d) { const p = Math.pow(10, d); return Math.round(v*p)/p; }
    function roundPt(p) { return { x: round(p[0], 2), y: round(p[1], 2) }; }
    function roundMat(m) { return m.map(r => r.map(v => round(v, 6))); }

    function errResult(msg) {
        return {
            success: false, mode: "real_local", error: msg,
            algorithm: "JS SIFT + RANSAC F/E + decomposeEssentialMat + triangulateDLT",
            stats: { elapsed_ms: 0 }
        };
    }

    // ===== L. 编排器 =====
    async function buildMultiviewRealLocal(grayL, grayR, w, h, opts, onProgress) {
        opts = opts || {};
        const t0 = performance.now();
        const maxFeatures = clampInt(opts.maxFeatures, 700, 120, 1000);
        const ratioTh = clampFlt(opts.ratioThreshold, 0.74, 0.45, 0.95);
        const ransacTh = clampFlt(opts.ransacThreshold, 1.35, 0.4, 4.0);
        const prog = (stage, p) => { if (onProgress) onProgress(stage, p); };

        if (!V || typeof V.computeSiftDescriptorSet !== "function") {
            return errResult("FeatureViz 未就绪，无法执行前端 SIFT");
        }

        try {
            prog("sift", 0);
            const setL = V.computeSiftDescriptorSet(grayL, { maxKeypoints: maxFeatures, contrast: 0.025, descriptor: true });
            const setR = V.computeSiftDescriptorSet(grayR, { maxKeypoints: maxFeatures, contrast: 0.025, descriptor: true });
            if (!setL.descriptors.length || !setR.descriptors.length) {
                return errResult("真实样例特征点不足，无法估计基础矩阵");
            }
            prog("sift", 1);

            prog("match", 0);
            const { good, raw } = await bfMatcherRatio(setL.descriptors, setR.descriptors, { ratio: ratioTh }, p => prog("match", p));
            if (good.length < 8) {
                return errResult("通过 ratio test 的匹配不足，无法运行 RANSAC");
            }
            prog("match", 1);

            const kpsL = setL.keypoints, kpsR = setR.keypoints;
            const ptsL = good.map(m => [kpsL[m.leftIdx].x, kpsL[m.leftIdx].y]);
            const ptsR = good.map(m => [kpsR[m.rightIdx].x, kpsR[m.rightIdx].y]);

            prog("ransac", 0);
            const { F, inliers: mask, inlierCount, itersDone } = ransacFindF(ptsL, ptsR, { threshold: ransacTh });
            if (inlierCount < 8) {
                return errResult("基础矩阵内点不足，无法恢复相机位姿");
            }
            prog("ransac", 1);

            const inlierPtsL = [], inlierPtsR = [];
            for (let i=0;i<mask.length;i++) {
                if (mask[i]) { inlierPtsL.push(ptsL[i]); inlierPtsR.push(ptsR[i]); }
            }

            const K = makeIntrinsics(w, h);
            let E = M.matMul3(M.matMul3(M.transpose3(K), F), K);
            E = M.scale3(E, 1 / Math.max(1e-9, M.frobenius3(E)));

            prog("pose", 0);
            const { R, t, selectedId, candidates } = selectPose(E, K, inlierPtsL, inlierPtsR);
            const recoverPosePositive = candidates[selectedId-1].positive_depth;
            prog("pose", 1);

            const P1 = M.composeP(K, M.eye34());
            const P2 = M.composeP(K, M.appendCol(R, t));
            const points3 = triangulateDLT(P1, P2, inlierPtsL, inlierPtsR);
            const projL = project(P1, points3);
            const projR = project(P2, points3);

            const usable = [];
            for (let i=0;i<points3.length;i++) {
                const X = points3[i];
                if (!Number.isFinite(X[0])) continue;
                const cam2z = R[2][0]*X[0] + R[2][1]*X[1] + R[2][2]*X[2] + t[2];
                if (!(X[2] > 0 && cam2z > 0)) continue;
                const eL = Math.hypot(projL[i][0]-inlierPtsL[i][0], projL[i][1]-inlierPtsL[i][1]);
                const eR = Math.hypot(projR[i][0]-inlierPtsR[i][0], projR[i][1]-inlierPtsR[i][1]);
                const meanErr = (eL + eR) / 2;
                if (!Number.isFinite(meanErr) || meanErr >= 8.0) continue;
                usable.push({ i, eL, eR, meanErr });
            }
            if (usable.length < 6) return errResult("三角化后的有效正深度点不足");
            usable.sort((a, b) => a.meanErr - b.meanErr);
            const top = usable.slice(0, 90);

            const normalized = normalizeCloud(points3);

            const cloudPoints = top.map((u, rank) => ({
                id: rank,
                match_index: u.i,
                left: roundPt(inlierPtsL[u.i]),
                right: roundPt(inlierPtsR[u.i]),
                reprojLeft: roundPt(projL[u.i]),
                reprojRight: roundPt(projR[u.i]),
                point3d: points3[u.i].map(v => round(v, 5)),
                x3: round(normalized[u.i][0], 4),
                y3: round(normalized[u.i][1], 4),
                z3: round(normalized[u.i][2], 4),
                err1: round(u.eL, 3),
                err2: round(u.eR, 3),
                error: round(u.meanErr, 3),
                low: u.meanErr > 2.0
            }));

            const matches = good.slice(0, 160).map((m, idx) => {
                const { err, line } = epipolarError(F, ptsL[idx], ptsR[idx]);
                return {
                    id: idx,
                    left: roundPt(ptsL[idx]),
                    right: roundPt(ptsR[idx]),
                    inlier: !!mask[idx],
                    outlier: !mask[idx],
                    error: round(err, 3),
                    distance: round(Math.sqrt(m.distanceSq), 3),
                    ratio: round(m.ratio, 4),
                    line: { a: round(line[0], 8), b: round(line[1], 8), c: round(line[2], 5) }
                };
            });
            matches.sort((a, b) => (a.inlier === b.inlier ? 0 : (a.inlier ? -1 : 1)) || (a.error - b.error));

            const publicKpsL = kpsL.slice(0, maxFeatures).map(k => ({ x: round(k.x, 2), y: round(k.y, 2), size: round(k.sigma || 1, 2) }));
            const publicKpsR = kpsR.slice(0, maxFeatures).map(k => ({ x: round(k.x, 2), y: round(k.y, 2), size: round(k.sigma || 1, 2) }));

            const publicCandidates = candidates.map(c => ({
                id: c.id, label: c.label,
                positive_depth: c.positive_depth,
                negative_depth: c.negative_depth,
                total: c.total,
                selected: c.selected
            }));

            const avgErr = cloudPoints.reduce((s, p) => s + p.error, 0) / cloudPoints.length;
            const lowCount = cloudPoints.filter(p => p.low).length;

            return {
                success: true,
                mode: "real_local",
                algorithm: "JS SIFT + RANSAC F/E + decomposeEssentialMat + triangulateDLT",
                sample: opts.sample || { key: "middlebury_cones", title: "Middlebury Cones", source: "前端复刻" },
                images: opts.images || { left: "", right: "" },
                keypoints: { left: publicKpsL, right: publicKpsR },
                matches,
                matrices: {
                    F: roundMat(F), K: roundMat(K), E: roundMat(E),
                    R: roundMat(R), t: t.map(v => round(v, 6)),
                    P1: roundMat(P1), P2: roundMat(P2)
                },
                pose: {
                    selected_candidate: selectedId,
                    recover_pose_positive: recoverPosePositive,
                    candidates: publicCandidates,
                    scale_note: "translation direction only; metric scale is unknown"
                },
                cloud: {
                    points: cloudPoints,
                    avg_error: round(avgErr, 3),
                    low_count: lowCount,
                    stable_count: cloudPoints.length - lowCount
                },
                stats: {
                    elapsed_ms: round(performance.now() - t0, 2),
                    left_keypoints: kpsL.length,
                    right_keypoints: kpsR.length,
                    raw_pairs: raw.length,
                    ratio_matches: good.length,
                    inliers: inlierCount,
                    outliers: good.length - inlierCount,
                    inlier_ratio: round(inlierCount / Math.max(good.length, 1), 4),
                    triangulated: cloudPoints.length,
                    mean_reprojection_error: round(avgErr, 3),
                    ratio_threshold: ratioTh,
                    ransac_threshold: ransacTh,
                    max_features: maxFeatures,
                    ransac_iters: itersDone
                }
            };
        } catch (e) {
            return errResult(e && e.message ? e.message : "前端多视图几何计算失败");
        }
    }

    // 加载图像并 resize 到 w×h 转灰度（imageToGray 不 resize，自实现）
    async function loadGrayResized(url, w, h) {
        const img = V && typeof V.loadImage === "function" ? await V.loadImage(url) : await loadImgRaw(url);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        for (let i=0;i<gray.length;i++) {
            const o = i * 4;
            gray[i] = 0.299*rgba[o] + 0.587*rgba[o+1] + 0.114*rgba[o+2];
        }
        return { gray, width: w, height: h };
    }

    function loadImgRaw(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("图像加载失败: " + src));
            img.src = src;
        });
    }

    window.MultiviewRealFrontend = {
        buildMultiviewRealLocal,
        loadGrayResized,
        makeIntrinsics
    };
})();
