(function () {
    "use strict";

    const layerMeta = [
        { key: "input", label: "Input", dim: "1×28×28", x: -8.2, kind: "map", maps: 1, size: 2.2, grid: 28 },
        { key: "conv1", label: "Conv1", dim: "32×28×28", x: -5.8, kind: "stack", maps: 8, size: 2.05, grid: 28 },
        { key: "relu1", label: "ReLU1", dim: "32×28×28", x: -3.15, kind: "stack", maps: 8, size: 2.05, grid: 28 },
        { key: "pool1", label: "Pool1", dim: "32×14×14", x: -0.95, kind: "stack", maps: 8, size: 1.36, grid: 14 },
        { key: "conv2", label: "Conv2", dim: "64×14×14", x: 1.15, kind: "stack", maps: 12, size: 1.48, grid: 14 },
        { key: "relu2", label: "ReLU2", dim: "64×14×14", x: 3.3, kind: "stack", maps: 12, size: 1.48, grid: 14 },
        { key: "pool2", label: "Pool2", dim: "64×7×7", x: 5.2, kind: "stack", maps: 12, size: 0.92, grid: 7 },
        { key: "flatten", label: "Flatten", dim: "3136", x: 6.8, kind: "vector" },
        { key: "fc", label: "FC", dim: "128", x: 8.25, kind: "fc" },
        { key: "softmax", label: "Softmax", dim: "10", x: 9.85, kind: "softmax" }
    ];

    const forwardLayers = ["input", "conv1", "relu1", "pool1", "conv2", "relu2", "pool2", "flatten", "fc", "softmax"];
    const backwardLayers = ["softmax", "fc", "flatten", "pool2", "relu2", "conv2", "pool1", "relu1", "conv1"];
    const colors = {
        forward: 0x2563eb,
        backward: 0xf97316,
        update: 0x16a34a,
        muted: 0x94a3b8,
        cyan: 0x06b6d4,
        yellow: 0xfacc15,
        gray: 0xcbd5e1,
        ink: 0x0f172a
    };

    function createTextSprite(THREE, text, options = {}) {
        const canvas = document.createElement("canvas");
        canvas.width = options.width || 320;
        canvas.height = options.height || 96;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${options.weight || 900} ${options.size || 28}px "Segoe UI", Arial`;
        ctx.fillStyle = options.color || "#0f172a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lines = String(text).split("\n");
        lines.forEach((line, index) => {
            ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * (options.lineHeight || 30));
        });
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.userData.isLabel = true;
        sprite.scale.set(options.scaleX || 1.6, options.scaleY || 0.48, 1);
        return sprite;
    }

    function heatValue(type, row, col, channel, size) {
        const cx = size * 0.48 + Math.sin(channel * 1.7) * size * 0.13;
        const cy = size * 0.52 + Math.cos(channel * 1.1) * size * 0.13;
        const dx = (col - cx) / size;
        const dy = (row - cy) / size;
        const digitStroke = Math.exp(-(Math.abs(row - size * 0.23) + Math.abs(col - size * 0.53)) / (size * 0.18)) +
            Math.exp(-(Math.abs(row - size * 0.52) + Math.abs(col - size * 0.55)) / (size * 0.18)) +
            Math.exp(-(Math.abs(row - size * 0.78) + Math.abs(col - size * 0.5)) / (size * 0.18));
        const blob = Math.exp(-(dx * dx + dy * dy) * 18);
        const wave = Math.sin(row * 0.45 + channel) * Math.cos(col * 0.37 + channel * 0.31);
        let value = 0.08 + blob * 0.68 + wave * 0.15;
        if (type === "input") value = Math.min(1, digitStroke * 0.72);
        if (type.includes("relu")) value = Math.max(0, value);
        if (type.includes("pool")) value = Math.min(1, value * 1.08);
        return Math.max(0, Math.min(1, value));
    }

    function heatColor(value, palette = "blue") {
        const v = Math.max(0, Math.min(1, value));
        if (palette === "gray") {
            const g = Math.round(238 - v * 205);
            return `rgb(${g},${g},${g})`;
        }
        if (palette === "orange") {
            return `rgb(${Math.round(255 - v * 36)},${Math.round(218 - v * 142)},${Math.round(174 - v * 152)})`;
        }
        if (v > 0.78) return `rgb(255,${Math.round(172 - v * 76)},28)`;
        if (v > 0.52) {
            const t = (v - 0.52) / 0.26;
            const r = Math.round(8 + t * 220);
            const g = Math.round(158 + t * 42);
            const b = Math.round(184 - t * 128);
            return `rgb(${r},${g},${b})`;
        }
        const t = v / 0.52;
        const r = Math.round(28 - t * 12);
        const g = Math.round(96 + t * 66);
        const b = Math.round(150 + t * 52);
        return `rgb(${r},${g},${b})`;
    }

    function createHeatTexture(THREE, type, channel, cells, palette) {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const cell = canvas.width / cells;
        ctx.fillStyle = palette === "gray" ? "#e2e8f0" : "#1f5f8f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < cells; r += 1) {
            for (let c = 0; c < cells; c += 1) {
                const value = heatValue(type, r, c, channel, cells);
                ctx.fillStyle = heatColor(value, palette);
                ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
            }
        }
        ctx.strokeStyle = palette === "gray" ? "rgba(15,23,42,0.12)" : "rgba(15,76,129,0.22)";
        ctx.lineWidth = Math.max(0.6, cell * 0.08);
        for (let i = 0; i <= cells; i += 1) {
            ctx.beginPath();
            ctx.moveTo(i * cell, 0);
            ctx.lineTo(i * cell, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * cell);
            ctx.lineTo(canvas.width, i * cell);
            ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        return texture;
    }

    function createTextureFromMatrix(THREE, values, width, height, palette = "blue") {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const cellW = canvas.width / width;
        const cellH = canvas.height / height;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < values.length; i += 1) {
            const value = Number(values[i]) || 0;
            if (value < min) min = value;
            if (value > max) max = value;
        }
        const range = Math.max(1e-6, max - min);
        ctx.fillStyle = palette === "gray" ? "#e2e8f0" : "#1f5f8f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < height; r += 1) {
            for (let c = 0; c < width; c += 1) {
                const raw = Number(values[r * width + c]) || 0;
                const normalized = palette === "gray" ? raw : Math.max(0.16, Math.pow((raw - min) / range, 0.82));
                ctx.fillStyle = heatColor(normalized, palette);
                ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
            }
        }
        ctx.strokeStyle = palette === "gray" ? "rgba(15,23,42,0.10)" : "rgba(15,76,129,0.20)";
        ctx.lineWidth = Math.max(0.5, Math.min(cellW, cellH) * 0.08);
        for (let i = 0; i <= width; i += 1) {
            ctx.beginPath();
            ctx.moveTo(i * cellW, 0);
            ctx.lineTo(i * cellW, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= height; i += 1) {
            ctx.beginPath();
            ctx.moveTo(0, i * cellH);
            ctx.lineTo(canvas.width, i * cellH);
            ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        return texture;
    }

    function sampledValue(values, width, height, row, col, samples) {
        const r = Math.min(height - 1, Math.max(0, Math.floor((row + 0.5) * height / samples)));
        const c = Math.min(width - 1, Math.max(0, Math.floor((col + 0.5) * width / samples)));
        return Number(values[r * width + c]) || 0;
    }

    function createScene(mount, callbacks = {}) {
        if (!mount || !window.THREE) {
            mount.innerHTML = '<div class="cnn-scene-fallback">Three.js 加载失败，无法显示 3D CNN 舞台。</div>';
            return null;
        }

        const THREE = window.THREE;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fbff);
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        mount.innerHTML = "";
        mount.appendChild(renderer.domElement);

        const controls = window.THREE.OrbitControls
            ? new window.THREE.OrbitControls(camera, renderer.domElement)
            : null;
        if (controls) {
            controls.enableDamping = true;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.minDistance = 5;
            controls.maxDistance = 36;
            controls.enablePan = true;
            controls.screenSpacePanning = true;
        }

        scene.add(new THREE.AmbientLight(0xffffff, 0.92));
        const key = new THREE.DirectionalLight(0xffffff, 1.25);
        key.position.set(-3, 6, 5);
        scene.add(key);
        const rim = new THREE.PointLight(0x60a5fa, 1.6, 28);
        rim.position.set(3, 4, 5);
        scene.add(rim);

        const root = new THREE.Group();
        root.rotation.y = -0.1;
        root.scale.set(1.08, 1.08, 1.08);
        scene.add(root);

        const grid = new THREE.GridHelper(18, 18, 0xdbeafe, 0xeaf2ff);
        grid.position.y = -2.1;
        grid.position.z = -0.5;
        root.add(grid);

        const state = {
            mode: "overview",
            activeLayer: "input",
            options: { connections: true, labels: true, heatmap: true },
            pulses: [],
            layers: {},
            labels: {},
            connections: [],
            rayTargets: [],
            selected: null,
            visibility: {
                input: true,
                conv: true,
                relu: true,
                pool: true,
                classifier: true
            },
            cameraTarget: new THREE.Vector3(0, 2.05, 13.5),
            lookTarget: new THREE.Vector3(0, -0.1, 0),
            modelYOffsetTarget: 0,
            autoCamera: true,
            cameraFrames: 120,
            stepStartTime: performance.now()
        };

        if (controls) {
            controls.target.copy(state.lookTarget);
            controls.addEventListener("start", () => {
                state.autoCamera = false;
                state.cameraFrames = 0;
            });
        }

        function mat(color, opacity = 1, roughness = 0.55) {
            return new THREE.MeshStandardMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                roughness,
                metalness: 0.04,
                side: THREE.DoubleSide
            });
        }

        function flatMat(color, opacity = 1) {
            return new THREE.MeshBasicMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                side: THREE.DoubleSide
            });
        }

        function addOutline(group, size, color = colors.yellow) {
            const outline = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(size + 0.04, size + 0.04, 0.04)),
                new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.0 })
            );
            outline.userData.isOutline = true;
            group.add(outline);
            return outline;
        }

        function createMapLayer(meta) {
            const group = new THREE.Group();
            group.position.set(meta.x, 0, 0);
            group.rotation.y = -0.35;
            root.add(group);
            state.layers[meta.key] = { group, meta, maps: [], outlines: [], voxels: [] };

            const count = meta.maps || 1;
            const center = (count - 1) / 2;
            for (let i = 0; i < count; i += 1) {
                const z = (i - center) * 0.14;
                const y = meta.key === "input" ? 0 : (center - i) * 0.035;
                const texture = createHeatTexture(THREE, meta.key, i, meta.grid || 14, meta.key === "input" ? "gray" : "blue");
                const plane = new THREE.Mesh(
                    new THREE.PlaneGeometry(meta.size, meta.size),
                    new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: false,
                        opacity: 1,
                        side: THREE.DoubleSide
                    })
                );
                plane.position.set(0, y, z);
                plane.userData.layer = meta.key;
                plane.userData.mapIndex = i;
                plane.userData.depthWeight = count <= 1 ? 1 : i / (count - 1);
                plane.userData.baseColor = 0xffffff;
                group.add(plane);
                state.layers[meta.key].maps.push(plane);
                state.rayTargets.push(plane);

                const edge = new THREE.LineSegments(
                    new THREE.EdgesGeometry(new THREE.BoxGeometry(meta.size + 0.02, meta.size + 0.02, 0.035)),
                    new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: i === count - 1 ? 0.52 : 0.045 })
                );
                edge.position.copy(plane.position);
                group.add(edge);
                state.layers[meta.key].outlines.push(edge);

                if (meta.key !== "input") {
                    const samples = meta.grid >= 28 ? 8 : meta.grid >= 14 ? 6 : 4;
                    const cubeSize = (meta.size / samples) * 0.72;
                    const cubeDepth = Math.max(0.035, cubeSize * 0.16);
                    const cubeGeom = new THREE.BoxGeometry(cubeSize, cubeSize, cubeDepth);
                    for (let r = 0; r < samples; r += 1) {
                        for (let c = 0; c < samples; c += 1) {
                            const value = heatValue(meta.key, r, c, i, samples);
                            const voxel = new THREE.Mesh(
                                cubeGeom,
                                new THREE.MeshStandardMaterial({
                                    color: new THREE.Color(heatColor(value, "blue")),
                                    transparent: true,
                                    opacity: 0.72,
                                    roughness: 0.42,
                                    metalness: 0.02
                                })
                            );
                            voxel.position.set(
                                -meta.size / 2 + (c + 0.5) * meta.size / samples,
                                y + meta.size / 2 - (r + 0.5) * meta.size / samples,
                                z + 0.05
                            );
                            voxel.userData.layer = meta.key;
                            voxel.userData.mapIndex = i;
                            voxel.userData.depthWeight = count <= 1 ? 1 : i / (count - 1);
                            voxel.userData.row = r;
                            voxel.userData.col = c;
                            voxel.userData.samples = samples;
                            voxel.userData.baseZ = voxel.position.z;
                            voxel.userData.baseScale = 0.55 + value * 1.1;
                            voxel.userData.baseColor = new THREE.Color(heatColor(value, "blue")).getHex();
                            voxel.scale.z = voxel.userData.baseScale;
                            group.add(voxel);
                            state.layers[meta.key].voxels.push(voxel);
                        }
                    }
                }
            }

            const label = createTextSprite(THREE, `${meta.label}\n${meta.dim}`, { scaleX: 1.0, scaleY: 0.36, size: 24, lineHeight: 28 });
            label.position.set(0, meta.size / 2 + 0.32 + Math.max(0, count - 1) * 0.045, 0);
            group.add(label);
            state.labels[meta.key] = label;
        }

        function createVectorLayer(meta) {
            const group = new THREE.Group();
            group.position.set(meta.x, 0, 0);
            root.add(group);
            state.layers[meta.key] = { group, meta, maps: [], outlines: [] };
            const geom = new THREE.BoxGeometry(0.16, 0.42, 0.16);
            for (let i = 0; i < 18; i += 1) {
                const cube = new THREE.Mesh(geom, mat(0x8b5cf6, 0.88));
                cube.position.set(0, 1.0 - i * 0.12, 0);
                cube.userData.layer = meta.key;
                group.add(cube);
                state.layers[meta.key].maps.push(cube);
                state.rayTargets.push(cube);
            }
            const label = createTextSprite(THREE, `${meta.label}\n${meta.dim}`, { scaleX: 0.92, scaleY: 0.36, size: 24, lineHeight: 28 });
            label.position.set(0, 1.35, 0);
            group.add(label);
            state.labels[meta.key] = label;
        }

        function createFCLayer(meta) {
            const group = new THREE.Group();
            group.position.set(meta.x, 0, 0);
            root.add(group);
            state.layers[meta.key] = { group, meta, maps: [], outlines: [], lines: [] };
            const sphere = new THREE.SphereGeometry(0.09, 22, 16);
            const left = [];
            const right = [];
            for (let i = 0; i < 8; i += 1) {
                const n = new THREE.Mesh(sphere, flatMat(0xf59e0b, 0.96));
                n.position.set(-0.34, 0.98 - i * 0.28, 0);
                n.userData.baseColor = 0xf59e0b;
                n.userData.layer = meta.key;
                group.add(n);
                left.push(n);
                state.layers[meta.key].maps.push(n);
                state.rayTargets.push(n);
            }
            for (let i = 0; i < 8; i += 1) {
                const n = new THREE.Mesh(sphere, flatMat(0xea580c, 0.96));
                n.position.set(0.42, 0.98 - i * 0.28, 0);
                n.userData.baseColor = 0xea580c;
                n.userData.layer = meta.key;
                group.add(n);
                right.push(n);
                state.rayTargets.push(n);
            }
            left.forEach((source, i) => {
                right.forEach((target, j) => {
                    if ((i + j) % 2 && i !== j) return;
                    const line = new THREE.Line(
                        new THREE.BufferGeometry().setFromPoints([source.position.clone(), target.position.clone()]),
                        new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.22 })
                    );
                    group.add(line);
                    state.layers[meta.key].lines.push(line);
                });
            });
            const label = createTextSprite(THREE, `${meta.label}\n${meta.dim}`, { scaleX: 0.92, scaleY: 0.36, size: 24, lineHeight: 28 });
            label.position.set(0.05, 1.35, 0);
            group.add(label);
            state.labels[meta.key] = label;
        }

        function createSoftmaxLayer(meta) {
            const group = new THREE.Group();
            group.position.set(meta.x, 0, 0);
            root.add(group);
            state.layers[meta.key] = { group, meta, maps: [], outlines: [] };
            const probs = [0.01, 0.02, 0.04, 0.72, 0.02, 0.06, 0.01, 0.04, 0.05, 0.03];
            const geom = new THREE.BoxGeometry(0.12, 1, 0.16);
            for (let i = 0; i < 10; i += 1) {
                const bar = new THREE.Mesh(geom, flatMat(i === 3 ? 0xe11d48 : 0x38bdf8, 0.9));
                const h = 0.22 + probs[i] * 1.65;
                bar.scale.y = h;
                bar.position.set((i - 4.5) * 0.14, -0.95 + h / 2, 0);
                bar.userData.baseColor = i === 3 ? 0xe11d48 : 0x38bdf8;
                bar.userData.layer = meta.key;
                group.add(bar);
                state.layers[meta.key].maps.push(bar);
                state.rayTargets.push(bar);
                const digit = createTextSprite(THREE, String(i), { scaleX: 0.22, scaleY: 0.16, size: 34 });
                digit.position.set((i - 4.5) * 0.14, -1.35, 0);
                group.add(digit);
            }
            const label = createTextSprite(THREE, `${meta.label}\n${meta.dim}`, { scaleX: 0.96, scaleY: 0.36, size: 24, lineHeight: 28 });
            label.position.set(0, 1.12, 0);
            group.add(label);
            state.labels[meta.key] = label;
        }

        layerMeta.forEach((meta) => {
            if (meta.kind === "map" || meta.kind === "stack") createMapLayer(meta);
            if (meta.kind === "vector") createVectorLayer(meta);
            if (meta.kind === "fc") createFCLayer(meta);
            if (meta.kind === "softmax") createSoftmaxLayer(meta);
        });

        function connectLayers() {
            for (let i = 0; i < layerMeta.length - 1; i += 1) {
                const a = layerMeta[i];
                const b = layerMeta[i + 1];
                const makeFlow = (from, to, y, color, mode) => {
                    const curve = new THREE.CatmullRomCurve3([
                        new THREE.Vector3(from.x + 0.65, y, -0.12),
                        new THREE.Vector3((from.x + to.x) / 2, y + 0.16, -0.24),
                        new THREE.Vector3(to.x - 0.65, y, -0.12)
                    ]);
                    const tube = new THREE.Mesh(
                        new THREE.TubeGeometry(curve, 24, 0.012, 8, false),
                        mat(color, mode === "forward" ? 0.32 : 0.26)
                    );
                    tube.userData.from = from.key;
                    tube.userData.to = to.key;
                    tube.userData.mode = mode;
                    root.add(tube);
                    state.connections.push(tube);

                    const arrow = new THREE.Mesh(
                        new THREE.ConeGeometry(0.055, 0.16, 18),
                        mat(color, mode === "forward" ? 0.7 : 0.62)
                    );
                    arrow.rotation.z = mode === "forward" ? -Math.PI / 2 : Math.PI / 2;
                    arrow.position.set((from.x + to.x) / 2, y + 0.12, -0.24);
                    arrow.userData.from = from.key;
                    arrow.userData.to = to.key;
                    arrow.userData.mode = mode;
                    root.add(arrow);
                    state.connections.push(arrow);
                };
                makeFlow(a, b, 0.24, colors.forward, "forward");
                makeFlow(b, a, -0.38, colors.backward, "backward");
            }
        }
        connectLayers();

        function pulseMaterial(color) {
            return new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.85,
                transparent: true,
                opacity: 0.66,
                roughness: 0.24,
                metalness: 0.05
            });
        }

        function addPulse(color, kind, phase, size = 0.12) {
            const group = new THREE.Group();
            const head = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, 12, 8), pulseMaterial(color));
            const tail = new THREE.Mesh(new THREE.BoxGeometry(size * 2.6, size * 0.09, size * 0.09), pulseMaterial(color));
            tail.position.x = -size * 1.15;
            group.add(tail);
            group.add(head);
            root.add(group);
            state.pulses.push({
                mesh: group,
                head,
                tail,
                kind,
                t: phase,
                speed: 0.0018 + Math.random() * 0.0012,
                baseScale: 1 + Math.random() * 0.18
            });
        }

        for (let i = 0; i < 7; i += 1) {
            addPulse(colors.forward, "forward", i / 7, 0.12);
        }
        for (let i = 0; i < 6; i += 1) {
            addPulse(colors.backward, "backward", i / 6, 0.12);
        }
        for (let i = 0; i < 6; i += 1) {
            addPulse(colors.update, "update", i / 6, 0.12);
        }

        function createComputationRig() {
            const group = new THREE.Group();
            group.visible = false;
            root.add(group);

            const kernelGroup = new THREE.Group();
            group.add(kernelGroup);
            const kernelCells = [];
            const kernelGeom = new THREE.BoxGeometry(0.16, 0.16, 0.055);
            for (let r = 0; r < 3; r += 1) {
                for (let c = 0; c < 3; c += 1) {
                    const cell = new THREE.Mesh(kernelGeom, new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        emissive: 0x2563eb,
                        emissiveIntensity: 0.08,
                        transparent: true,
                        opacity: 0.88,
                        roughness: 0.34,
                        metalness: 0.02
                    }));
                    cell.position.set((c - 1) * 0.19, (1 - r) * 0.19, 0);
                    kernelGroup.add(cell);
                    kernelCells.push(cell);
                }
            }
            const kernelFrame = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(0.66, 0.66, 0.07)),
                new THREE.LineBasicMaterial({ color: colors.yellow, transparent: true, opacity: 0.82 })
            );
            kernelGroup.add(kernelFrame);

            const tokenGeom = new THREE.BoxGeometry(0.13, 0.13, 0.13);
            const tokens = [];
            for (let i = 0; i < 9; i += 1) {
                const token = new THREE.Mesh(tokenGeom, new THREE.MeshStandardMaterial({
                    color: colors.forward,
                    emissive: colors.forward,
                    emissiveIntensity: 0.35,
                    transparent: true,
                    opacity: 0.92,
                    roughness: 0.3,
                    metalness: 0.03
                }));
                group.add(token);
                tokens.push(token);
            }

            const valueBadge = new THREE.Mesh(
                new THREE.BoxGeometry(0.48, 0.18, 0.08),
                new THREE.MeshStandardMaterial({
                    color: 0x16a34a,
                    emissive: 0x16a34a,
                    emissiveIntensity: 0.2,
                    transparent: true,
                    opacity: 0.0,
                    roughness: 0.28
                })
            );
            group.add(valueBadge);

            return { group, kernelGroup, kernelCells, kernelFrame, tokens, valueBadge };
        }

        state.computeRig = createComputationRig();

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const pointerState = { x: 0, y: 0, moved: false };

        function resize() {
            const rect = mount.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }

        function resetView() {
            state.cameraTarget.set(0.7, 2.3, 18.2);
            state.lookTarget.set(0.7, -0.12, 0);
            state.autoCamera = true;
            state.cameraFrames = 120;
        }

        function focusLayer(key) {
            const meta = layerMeta.find((item) => item.key === key) || layerMeta[0];
            state.selected = key;
            state.activeLayer = key;
            const focusX = Math.max(-4.2, Math.min(5.4, meta.x * 0.24));
            state.cameraTarget.set(focusX, 2.1, 15.4);
            state.lookTarget.set(Math.max(-5.6, Math.min(6.3, meta.x * 0.36)), -0.08, 0);
            state.autoCamera = true;
            state.cameraFrames = 95;
            updateVisualState();
        }

        function panLayerIntoView(key) {
            const meta = layerMeta.find((item) => item.key === key) || layerMeta[0];
            state.selected = key;
            state.activeLayer = key;
            const currentTarget = controls ? controls.target : state.lookTarget;
            const desiredTargetX = Math.max(-5.6, Math.min(6.4, meta.x * 0.5));
            const deltaX = desiredTargetX - currentTarget.x;
            state.lookTarget.set(currentTarget.x + deltaX, currentTarget.y, currentTarget.z);
            state.cameraTarget.set(camera.position.x + deltaX, camera.position.y, camera.position.z);
            state.autoCamera = true;
            state.cameraFrames = 50;
            updateVisualState();
        }

        function activePath() {
            if (state.mode === "backward") return backwardLayers;
            return forwardLayers;
        }

        function metaForLayer(key) {
            return layerMeta.find((item) => item.key === key) || layerMeta[0];
        }

        function adjacentLayer(key, direction) {
            const index = forwardLayers.indexOf(key);
            if (index < 0) return key;
            return forwardLayers[Math.max(0, Math.min(forwardLayers.length - 1, index + direction))];
        }

        function lerpVector(a, b, t) {
            return new THREE.Vector3(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t
            );
        }

        function pathForPulse(kind) {
            if (kind === "backward") return backwardLayers;
            if (kind === "update") return ["conv1", "conv2", "fc"];
            return forwardLayers;
        }

        function connectionActive(connection) {
            if (connection.userData.mode && connection.userData.mode !== state.mode) {
                return false;
            }
            const path = activePath();
            const fromIndex = path.indexOf(connection.userData.from);
            const toIndex = path.indexOf(connection.userData.to);
            if (state.mode === "backward") {
                return fromIndex >= 0 && toIndex === fromIndex + 1;
            }
            return fromIndex >= 0 && toIndex === fromIndex + 1;
        }

        function groupForLayer(key) {
            if (key === "input") return "input";
            if (key.startsWith("conv")) return "conv";
            if (key.startsWith("relu")) return "relu";
            if (key.startsWith("pool")) return "pool";
            return "classifier";
        }

        function layerVisible(key) {
            return state.visibility[groupForLayer(key)] !== false;
        }

        function updateVisualState() {
            const modeColor = state.mode === "backward" ? colors.backward : state.mode === "update" ? colors.update : colors.forward;
            const now = performance.now();
            const stepFlash = Math.max(0, 1 - (now - state.stepStartTime) / 850);
            Object.entries(state.layers).forEach(([key, layer]) => {
                layer.group.visible = layerVisible(key);
                const isParameterLayer = state.mode === "update" && ["conv1", "conv2", "fc"].includes(key);
                const isActive = key === state.activeLayer || key === state.selected || isParameterLayer;
                const isNeighbor = layerMeta.some((meta, index) => {
                    if (meta.key !== state.activeLayer) return false;
                    return [layerMeta[index - 1]?.key, layerMeta[index + 1]?.key].includes(key);
                });
                layer.group.traverse((obj) => {
                    if (!obj.material) return;
                    if (obj.userData.isLabel) return;
                    const opacity = state.mode === "overview"
                        ? (isActive ? 1 : 0.92)
                        : (isActive ? 1 : isNeighbor ? 0.84 : 0.62);
                    const depth = obj.userData.depthWeight ?? 1;
                    const depthOpacity = key === "input" ? 1 : 0.68 + depth * 0.32;
                    let finalOpacity = Math.min(1, opacity * depthOpacity);
                    if (obj.material.map && key !== "input") {
                        finalOpacity = 1;
                    }
                    obj.material.transparent = finalOpacity < 1;
                    if ("opacity" in obj.material) obj.material.opacity = finalOpacity;
                    if (obj.userData.baseColor !== undefined && obj.material.color && !obj.material.map) {
                        const base = new THREE.Color(obj.userData.baseColor);
                        const gray = new THREE.Color(0x9fb3c8);
                        const grayMix = key === "input" ? 0 : (isActive ? (1 - depth) * 0.26 : isNeighbor ? (1 - depth) * 0.34 : 0.24 + (1 - depth) * 0.26);
                        obj.material.color.copy(base.lerp(gray, grayMix));
                    }
                    if (obj.material.emissive) obj.material.emissive.setHex(isActive ? modeColor : 0x000000);
                    if (obj.material.emissiveIntensity !== undefined) obj.material.emissiveIntensity = isActive ? 0.2 + stepFlash * 0.45 : 0;
                });
                layer.group.scale.lerp(new THREE.Vector3(isActive ? 1.1 + stepFlash * 0.04 : 1, isActive ? 1.1 + stepFlash * 0.04 : 1, isActive ? 1.1 + stepFlash * 0.04 : 1), 0.5);
                layer.outlines?.forEach((edge, index) => {
                    const front = index === layer.outlines.length - 1;
                    edge.material.color.setHex(isActive && front ? modeColor : 0x64748b);
                    edge.material.opacity = isActive && front ? 1 : isActive ? 0.12 : front ? 0.18 : 0.035;
                });
                layer.voxels?.forEach((voxel) => {
                    let activeVoxel = isActive && ((voxel.userData.row + voxel.userData.col + voxel.userData.mapIndex) % 7 === 0);
                    if (state.mode === "backward" && key.startsWith("pool")) activeVoxel = isActive && voxel.userData.row === 1 && voxel.userData.col === 1;
                    if (state.mode === "backward" && key.startsWith("relu") && (voxel.userData.row + voxel.userData.col) % 3 === 0) {
                        voxel.material.color.setHex(0x94a3b8);
                    }
                    voxel.material.emissive?.setHex(activeVoxel ? modeColor : 0x000000);
                    if (voxel.material.emissiveIntensity !== undefined) voxel.material.emissiveIntensity = activeVoxel ? 0.38 + stepFlash * 0.45 : 0;
                    const depth = voxel.userData.depthWeight ?? 1;
                    voxel.material.opacity = (isActive ? 0.88 : isNeighbor ? 0.76 : 0.64) * (0.72 + depth * 0.28);
                });
                layer.lines?.forEach((line, index) => {
                    line.material.color.setHex(isActive && index % 5 === 0 ? modeColor : 0x94a3b8);
                    line.material.opacity = isActive && index % 5 === 0 ? 0.92 : 0.18;
                });
                if (state.labels[key]) state.labels[key].visible = state.options.labels;
            });
            state.connections.forEach((line) => {
                line.visible = state.options.connections && layerVisible(line.userData.from) && layerVisible(line.userData.to);
                line.material.color.setHex(connectionActive(line) ? modeColor : colors.muted);
                line.material.opacity = connectionActive(line) ? 0.52 : 0.12;
            });
            Object.entries(state.layers).forEach(([key, layer]) => {
                if (!["input", "conv1", "relu1", "pool1", "conv2", "relu2", "pool2"].includes(key)) return;
                layer.maps.forEach((mesh) => {
                    if (mesh.material.map) mesh.material.map.offset.x = state.options.heatmap ? 0 : 0.99;
                });
            });
            state.pulses.forEach((pulse) => {
                pulse.mesh.visible = false;
            });
        }

        function setStep(payload) {
            state.mode = payload.mode || state.mode;
            state.activeLayer = payload.layer || state.activeLayer;
            if (payload.mode === "update") state.mode = "update";
            state.stepStartTime = performance.now();
            if (payload.panOnly) {
                panLayerIntoView(state.activeLayer);
            } else if (payload.focus !== false) {
                focusLayer(state.activeLayer);
            } else {
                updateVisualState();
            }
        }

        function setMode(mode) {
            state.mode = mode || "overview";
            state.stepStartTime = performance.now();
            updateVisualState();
        }

        function setOptions(options) {
            state.options = { ...state.options, ...options };
            updateVisualState();
        }

        function setLayerVisibility(group, visible) {
            state.visibility[group] = visible;
            updateVisualState();
        }

        function setProbeOpen(open) {
            state.modelYOffsetTarget = open ? 2.4 : 0;
        }

        function updateMapTextures(layerKey, flatValues, channels, width, height, palette = "blue") {
            const layer = state.layers[layerKey];
            if (!layer || !flatValues) return;
            const stride = Math.max(1, Math.floor(channels / Math.max(1, layer.maps.length)));
            layer.maps.forEach((mesh, index) => {
                const channel = Math.min(channels - 1, index * stride);
                const offset = channel * width * height;
                const slice = flatValues.slice(offset, offset + width * height);
                let min = Infinity;
                let max = -Infinity;
                for (let i = 0; i < slice.length; i += 1) {
                    const value = Number(slice[i]) || 0;
                    if (value < min) min = value;
                    if (value > max) max = value;
                }
                const range = Math.max(1e-6, max - min);
                const texture = createTextureFromMatrix(THREE, slice, width, height, palette);
                if (mesh.material.map) mesh.material.map.dispose?.();
                mesh.material.map = texture;
                mesh.material.needsUpdate = true;
                mesh.material.opacity = 1;
                mesh.material.transparent = false;
                layer.voxels?.forEach((voxel) => {
                    if (voxel.userData.mapIndex !== index) return;
                    const raw = sampledValue(slice, width, height, voxel.userData.row, voxel.userData.col, voxel.userData.samples);
                    const normalized = palette === "gray" ? raw : (raw - min) / range;
                    const v = Math.max(0, Math.min(1, normalized));
                    voxel.material.color.setStyle(heatColor(v, palette === "orange" ? "orange" : "blue"));
                    voxel.userData.baseColor = new THREE.Color(heatColor(v, palette === "orange" ? "orange" : "blue")).getHex();
                    voxel.userData.baseScale = 0.45 + v * 1.65;
                    voxel.scale.z = voxel.userData.baseScale;
                });
            });
        }

        function updateSoftmax(probabilities) {
            const layer = state.layers.softmax;
            if (!layer || !Array.isArray(probabilities)) return;
            let best = 0;
            probabilities.forEach((value, index) => {
                if (value > probabilities[best]) best = index;
            });
            layer.maps.forEach((bar, index) => {
                const prob = probabilities[index] || 0;
                const h = 0.18 + prob * 1.9;
                const color = index === best ? 0xe11d48 : 0x38bdf8;
                bar.scale.y = h;
                bar.position.y = -0.95 + h / 2;
                bar.material.color.setHex(color);
                bar.userData.baseColor = color;
                bar.material.emissive?.setHex(index === best ? 0x7f1d1d : 0x000000);
                if (bar.material.emissiveIntensity !== undefined) bar.material.emissiveIntensity = index === best ? 0.2 : 0;
            });
        }

        function updateFC(values) {
            const layer = state.layers.fc;
            if (!layer || !values) return;
            layer.maps.forEach((node, index) => {
                const source = Math.min(values.length - 1, index * Math.max(1, Math.floor(values.length / layer.maps.length)));
                const value = Math.max(0, Math.min(1, Math.abs(values[source] || 0)));
                node.material.color.setStyle(heatColor(value, "orange"));
            });
        }

        function setActivations(payload) {
            if (!payload || !payload.activations) return;
            const a = payload.activations;
            updateMapTextures("input", a.input, 1, 28, 28, "gray");
            updateMapTextures("conv1", a.conv0_raw || a.conv0, 32, 28, 28, "blue");
            updateMapTextures("relu1", a.conv0, 32, 28, 28, "blue");
            updateMapTextures("pool1", a.pool0, 32, 14, 14, "blue");
            updateMapTextures("conv2", a.conv1_raw || a.conv1, 64, 14, 14, "blue");
            updateMapTextures("relu2", a.conv1, 64, 14, 14, "blue");
            updateMapTextures("pool2", a.pool1, 64, 7, 7, "blue");
            updateFC(a.fc0);
            updateSoftmax(payload.probabilities);
            updateVisualState();
        }

        function raycastLayer(event) {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const hits = raycaster.intersectObjects(state.rayTargets, false);
            if (hits.length) {
                const key = hits[0].object.userData.layer;
                focusLayer(key);
                callbacks.onLayerClick?.(key);
            } else {
                callbacks.onLayerClick?.(null);
            }
        }

        function onPointerDown(event) {
            pointerState.x = event.clientX;
            pointerState.y = event.clientY;
            pointerState.moved = false;
        }

        function onPointerMove(event) {
            if (Math.abs(event.clientX - pointerState.x) > 5 || Math.abs(event.clientY - pointerState.y) > 5) {
                pointerState.moved = true;
            }
        }

        function onPointerUp(event) {
            if (!pointerState.moved) raycastLayer(event);
        }

        function computationSpec() {
            const layer = state.activeLayer;
            const isBackward = state.mode === "backward";
            const isUpdate = state.mode === "update";
            if (state.mode === "overview") return null;

            if (isUpdate) {
                return {
                    kind: "update",
                    color: colors.update,
                    source: metaForLayer("conv1"),
                    operator: metaForLayer("conv2"),
                    target: metaForLayer("fc"),
                    label: "old parameter - lr × gradient → new parameter"
                };
            }

            if (layer.startsWith("conv")) {
                const sourceKey = isBackward || isUpdate ? layer : adjacentLayer(layer, -1);
                const targetKey = isBackward || isUpdate ? adjacentLayer(layer, -1) : layer;
                return {
                    kind: "conv",
                    color: isUpdate ? colors.update : isBackward ? colors.backward : colors.forward,
                    source: metaForLayer(sourceKey),
                    operator: metaForLayer(layer),
                    target: metaForLayer(targetKey),
                    label: isBackward ? "dZ × patch → dK, then dX" : "patch × kernel → feature map"
                };
            }

            if (layer.startsWith("pool")) {
                const sourceKey = isBackward ? layer : adjacentLayer(layer, -1);
                const targetKey = isBackward ? adjacentLayer(layer, -1) : layer;
                return {
                    kind: "pool",
                    color: isBackward ? colors.backward : colors.forward,
                    source: metaForLayer(sourceKey),
                    operator: metaForLayer(layer),
                    target: metaForLayer(targetKey),
                    label: isBackward ? "gradient routes to max location" : "2×2 max selector"
                };
            }

            if (layer.startsWith("relu")) {
                const sourceKey = isBackward ? layer : adjacentLayer(layer, -1);
                const targetKey = isBackward ? adjacentLayer(layer, -1) : layer;
                return {
                    kind: "relu",
                    color: isBackward ? colors.backward : colors.forward,
                    source: metaForLayer(sourceKey),
                    operator: metaForLayer(layer),
                    target: metaForLayer(targetKey),
                    label: isBackward ? "mask blocks negative gradients" : "max(0, z)"
                };
            }

            if (layer === "fc" || layer === "flatten" || layer === "softmax") {
                const sourceKey = isBackward ? layer : adjacentLayer(layer, -1);
                const targetKey = isBackward ? adjacentLayer(layer, -1) : layer;
                return {
                    kind: layer === "softmax" ? "softmax" : "fc",
                    color: isBackward ? colors.backward : colors.forward,
                    source: metaForLayer(sourceKey),
                    operator: metaForLayer(layer),
                    target: metaForLayer(targetKey),
                    label: layer === "softmax" ? "logits → probabilities" : "vector × weights"
                };
            }

            return null;
        }

        function updateComputationRig(time) {
            const rig = state.computeRig;
            const spec = computationSpec();
            if (!rig || !spec || !state.options.connections) {
                if (rig) rig.group.visible = false;
                return;
            }

            const color = spec.color;
            const sourceX = spec.source.x;
            const operatorX = (spec.source.x + spec.target.x) / 2;
            const targetX = spec.target.x;
            const opY = spec.kind === "conv" ? 0.45 : spec.kind === "pool" ? 0.16 : -0.05;
            const opZ = 0.72;
            rig.group.visible = true;
            rig.kernelGroup.visible = !["fc", "softmax", "flatten"].includes(spec.kind);
            rig.kernelGroup.position.set(operatorX, opY, opZ);
            rig.kernelGroup.scale.setScalar(spec.kind === "conv" ? 1 : spec.kind === "pool" ? 0.78 : 0.7);

            const phaseBase = ((time || 0) * 0.00055) % 1;
            const flash = 0.5 + Math.sin((time || 0) * 0.012) * 0.5;
            if (spec.kind === "update") {
                const parameterLayers = ["conv1", "conv2", "fc"];
                rig.kernelGroup.visible = false;
                rig.tokens.forEach((token, index) => {
                    const layerIndex = Math.floor(index / 3);
                    const slot = index % 3;
                    const meta = metaForLayer(parameterLayers[layerIndex] || "fc");
                    token.visible = layerIndex < parameterLayers.length;
                    if (!token.visible) return;
                    const localX = [-0.26, 0, 0.26][slot];
                    const labelsY = [0.78, 0.54, 0.78][slot];
                    const pulse = Math.sin((time || 0) * 0.006 + index * 0.9) * 0.08;
                    token.position.set(meta.x + localX, labelsY + pulse, 0.78 + slot * 0.04);
                    token.material.color.setHex(slot === 1 ? 0x22c55e : 0x86efac);
                    token.material.emissive.setHex(colors.update);
                    token.material.opacity = slot === 1 ? 0.96 : 0.72;
                    token.scale.setScalar(slot === 1 ? 1.18 + flash * 0.18 : 0.82);
                    token.rotation.x += 0.012;
                    token.rotation.y += 0.018;
                });
                rig.valueBadge.position.set(metaForLayer("conv2").x, 0.08, 0.86);
                rig.valueBadge.material.color.setHex(colors.update);
                rig.valueBadge.material.emissive.setHex(colors.update);
                rig.valueBadge.material.opacity = 0.72 + flash * 0.18;
                rig.valueBadge.scale.set(1.55 + flash * 0.2, 0.9, 1);
                return;
            }

            const poolVisible = new Set([0, 1, 3, 4]);
            const reluVisible = new Set([1, 4, 7]);
            rig.kernelCells.forEach((cell, index) => {
                const isConv = spec.kind === "conv";
                const isPool = spec.kind === "pool";
                const isRelu = spec.kind === "relu";
                const visible = isConv || (isPool && poolVisible.has(index)) || (isRelu && reluVisible.has(index));
                const activeCell = isConv || (isPool && index === 4) || (isRelu && index === 4);
                cell.visible = visible;
                if (!visible) return;
                cell.position.set(((index % 3) - 1) * 0.19, (1 - Math.floor(index / 3)) * 0.19, 0);
                if (isPool && poolVisible.has(index)) {
                    const poolIndex = Array.from(poolVisible).indexOf(index);
                    cell.position.set((poolIndex % 2 - 0.5) * 0.22, (0.5 - Math.floor(poolIndex / 2)) * 0.22, 0);
                }
                if (isRelu) {
                    cell.position.set(0, (1 - Math.floor(index / 3)) * 0.22, 0);
                }
                cell.material.color.setHex(
                    isRelu && index === 7 ? 0x94a3b8 :
                    isPool && index === 4 ? 0xfacc15 :
                    isConv ? 0x0f766e : 0x93c5fd
                );
                cell.material.emissive.setHex(activeCell ? color : colors.muted);
                cell.material.emissiveIntensity = activeCell ? 0.18 + flash * 0.44 : 0.04;
                cell.material.opacity = isRelu && index === 7 ? 0.5 : 0.92;
                const scale = activeCell ? 1 + flash * 0.16 : 1;
                cell.scale.setScalar(scale);
            });
            rig.kernelFrame.visible = rig.kernelGroup.visible;
            if (rig.kernelFrame.visible) {
                rig.kernelFrame.scale.set(
                    spec.kind === "pool" ? 0.74 : spec.kind === "relu" ? 0.36 : 1,
                    spec.kind === "pool" ? 0.74 : spec.kind === "relu" ? 1 : 1,
                    1
                );
                rig.kernelFrame.material.color.setHex(spec.kind === "pool" ? 0xfacc15 : spec.kind === "relu" ? 0x94a3b8 : colors.yellow);
                rig.kernelFrame.material.opacity = 0.9;
            }

            rig.tokens.forEach((token, index) => {
                const row = Math.floor(index / 3);
                const col = index % 3;
                if (spec.kind === "pool") {
                    const poolIndex = index;
                    const isMax = poolIndex === 1;
                    const isBackwardPool = state.mode === "backward";
                    const isCandidate = poolIndex < 4;
                    token.visible = isBackwardPool ? isMax : isCandidate;
                    if (!token.visible) return;

                    const poolRow = Math.floor(poolIndex / 2);
                    const poolCol = poolIndex % 2;
                    const source = isBackwardPool
                        ? new THREE.Vector3(sourceX, 0, 0.92)
                        : new THREE.Vector3(
                            sourceX,
                            (0.5 - poolRow) * 0.34,
                            0.92 + (poolCol - 0.5) * 0.34
                        );
                    const operator = new THREE.Vector3(
                        operatorX + (poolCol - 0.5) * 0.26,
                        opY + (0.5 - poolRow) * 0.26,
                        opZ + 0.1
                    );
                    const target = isBackwardPool
                        ? new THREE.Vector3(
                            targetX,
                            (0.5 - poolRow) * 0.34,
                            0.92 + (poolCol - 0.5) * 0.34
                        )
                        : new THREE.Vector3(targetX, 0, 0.92);
                    const t = (phaseBase + (isBackwardPool ? 0 : poolIndex * 0.025)) % 1;
                    let p;
                    if (t < 0.42) {
                        p = lerpVector(source, operator, t / 0.42);
                    } else if (t < 0.62) {
                        p = operator.clone();
                        p.z += Math.sin((t - 0.42) / 0.2 * Math.PI) * 0.16;
                    } else if (isMax) {
                        p = lerpVector(operator, target, (t - 0.62) / 0.38);
                    } else {
                        p = operator.clone();
                        p.y -= 0.03;
                    }

                    token.position.copy(p);
                    token.material.color.setHex(isMax ? color : 0x94a3b8);
                    token.material.emissive.setHex(isMax ? color : 0x475569);
                    token.material.opacity = isMax ? 0.92 : (t < 0.62 ? 0.78 : 0.5);
                    const scale = isMax ? 0.98 + flash * 0.18 : 0.92;
                    token.scale.setScalar(scale);
                    token.rotation.x += 0.018;
                    token.rotation.y += 0.014;
                    return;
                }

                const laneY = (1 - row) * 0.18;
                const laneZ = 0.92 + (col - 1) * 0.11;
                const source = new THREE.Vector3(sourceX, laneY, laneZ);
                const opSpread = spec.kind === "conv" ? 1 : spec.kind === "pool" ? 0.68 : spec.kind === "relu" ? 0.25 : 0.0;
                const operator = new THREE.Vector3(operatorX + (col - 1) * 0.14 * opSpread, opY + (1 - row) * 0.14 * opSpread, opZ + 0.08);
                const target = new THREE.Vector3(targetX, laneY * (spec.kind === "fc" ? 0.35 : 0.7), laneZ);
                const t = (phaseBase + index * 0.055) % 1;
                let p;
                if (t < 0.38) {
                    p = lerpVector(source, operator, t / 0.38);
                } else if (t < 0.62) {
                    const shake = Math.sin((t - 0.38) / 0.24 * Math.PI);
                    p = operator.clone();
                    p.z += shake * (spec.kind === "fc" ? 0.08 : 0.18);
                } else {
                    p = lerpVector(operator, target, (t - 0.62) / 0.38);
                }
                token.position.copy(p);
                token.material.color.setHex(color);
                token.material.emissive.setHex(color);
                token.material.opacity = t < 0.38 ? 0.78 : t < 0.62 ? 1 : 0.86;
                const scale = 0.78 + (t > 0.38 && t < 0.62 ? flash * 0.75 : 0);
                token.scale.setScalar(scale);
                token.rotation.x += 0.026;
                token.rotation.y += 0.021;
                token.visible = spec.kind === "conv" || index < (spec.kind === "pool" ? 4 : spec.kind === "relu" ? 5 : spec.kind === "softmax" ? 3 : 6);
            });

            rig.valueBadge.position.set(operatorX, opY - 0.54, opZ + 0.02);
            rig.valueBadge.material.color.setHex(state.mode === "update" ? colors.update : color);
            rig.valueBadge.material.emissive.setHex(state.mode === "update" ? colors.update : color);
            rig.valueBadge.material.opacity = ["conv", "fc", "softmax"].includes(spec.kind) || state.mode === "update" ? 0.66 + flash * 0.22 : 0.28;
            rig.valueBadge.scale.set(spec.kind === "softmax" ? 0.7 + flash * 0.22 : 1 + flash * 0.35, 1 + flash * 0.1, 1);
        }

        function animate(time) {
            requestAnimationFrame(animate);
            if (state.autoCamera || state.cameraFrames > 0) {
                const lerp = 0.075;
                camera.position.lerp(state.cameraTarget, lerp);
                if (controls) {
                    controls.target.lerp(state.lookTarget, lerp);
                    controls.update();
                } else {
                    camera.lookAt(state.lookTarget);
                }
                state.cameraFrames = Math.max(0, state.cameraFrames - 1);
                if (state.cameraFrames === 0 && camera.position.distanceTo(state.cameraTarget) < 0.05) {
                    state.autoCamera = false;
                }
            } else {
                controls?.update();
            }
            root.position.y += (state.modelYOffsetTarget - root.position.y) * 0.09;
            updateVisualState();
            state.pulses.forEach((pulse, index) => {
                const active = state.mode === pulse.kind || (state.mode === "overview" && pulse.kind === "forward");
                pulse.mesh.visible = active && state.options.connections;
                if (!active) return;
                const speedScale = state.mode === "overview" ? 0.55 : pulse.kind === "backward" ? 1.65 : 1.35;
                pulse.t += pulse.speed * speedScale;
                if (pulse.t > 1) pulse.t = 0;
                if (pulse.t < 0) pulse.t = 1;
                if (pulse.kind === "update") {
                    const parameterPath = ["conv1", "conv2", "fc"];
                    const meta = metaForLayer(parameterPath[index % parameterPath.length]);
                    const angle = (time || 0) * 0.004 + index * 1.7;
                    pulse.mesh.position.set(
                        meta.x + Math.cos(angle) * 0.34,
                        0.12 + Math.sin(angle * 1.3) * 0.16,
                        0.76 + Math.sin(angle) * 0.18
                    );
                    pulse.mesh.rotation.set(0, 0, angle);
                    const s = pulse.baseScale * (0.95 + Math.sin((time || 0) * 0.01 + index) * 0.18);
                    pulse.mesh.scale.setScalar(s);
                    return;
                }
                const path = pathForPulse(pulse.kind);
                const segment = Math.min(path.length - 2, Math.max(0, Math.floor(pulse.t * (path.length - 1))));
                const local = (pulse.t * (path.length - 1)) - segment;
                const a = layerMeta.find((item) => item.key === path[segment]) || layerMeta[0];
                const b = layerMeta.find((item) => item.key === path[segment + 1]) || layerMeta[1];
                const x = a.x + (b.x - a.x) * local;
                const lane = ((index % 5) - 2) * 0.055;
                const yBase = pulse.kind === "backward" ? -0.52 : pulse.kind === "update" ? -0.08 : 0.36;
                const zBase = pulse.kind === "backward" ? -0.42 : pulse.kind === "update" ? 0.18 : -0.24;
                pulse.mesh.position.set(x, yBase + lane, zBase + lane * 0.8);
                pulse.mesh.rotation.set(0, 0, pulse.kind === "backward" ? Math.PI : 0);
                const s = pulse.baseScale * (0.9 + Math.sin((time || 0) * 0.008 + index) * 0.08);
                pulse.mesh.scale.setScalar(s);
            });
            updateComputationRig(time);
            renderer.render(scene, camera);
        }

        resetView();
        camera.position.copy(state.cameraTarget);
        camera.lookAt(state.lookTarget);
        updateVisualState();
        resize();
        window.addEventListener("resize", resize);
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        requestAnimationFrame(animate);

        return {
            setStep,
            setMode,
            focusLayer,
            resetView,
            setOptions,
            setLayerVisibility,
            setProbeOpen,
            setActivations,
            getLayerMeta: (key) => layerMeta.find((item) => item.key === key)
        };
    }

    window.Cnn3DScene = {
        createScene,
        layerMeta
    };
}());
