(function () {
    const layerOrder = ["input", "conv", "relu", "pool", "flatten", "fc", "softmax", "loss"];
    const layerX = {
        input: -5.8,
        conv: -4.0,
        relu: -2.2,
        pool: -0.6,
        flatten: 1.0,
        fc: 2.6,
        softmax: 4.3,
        loss: 5.8
    };
    const colors = {
        base: 0x3b82f6,
        forward: 0x2563eb,
        backward: 0xf97316,
        update: 0x16a34a,
        muted: 0x94a3b8,
        grid: 0xdbeafe,
        dark: 0x1e293b,
        label: 0xffffff
    };

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "0";
        return Number(value.toFixed(2)).toString();
    }

    function makeSprite(THREE, text, options = {}) {
        const canvas = document.createElement("canvas");
        canvas.width = options.width || 256;
        canvas.height = options.height || 64;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = options.color || "#0f172a";
        ctx.font = `${options.weight || 800} ${options.size || 24}px "Segoe UI", Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(options.scaleX || 1.6, options.scaleY || 0.4, 1);
        return sprite;
    }

    function matrixValue(matrix, r, c) {
        return matrix?.[r]?.[c] ?? 0;
    }

    function createCnnScene(mount) {
        if (!mount || !window.THREE) {
            mount.innerHTML = '<div class="cnn-scene-fallback">3D 舞台未加载：Three.js CDN 不可用，已保留下方 2D 计算展示。</div>';
            return null;
        }

        const THREE = window.THREE;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fbff);
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
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
            controls.minDistance = 6;
            controls.maxDistance = 18;
            controls.enablePan = false;
        }

        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(2, 6, 5);
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(0x60a5fa, 1.8, 18);
        rimLight.position.set(-5, 4, 4);
        scene.add(rimLight);

        const root = new THREE.Group();
        scene.add(root);

        const objects = {
            layerGroups: {},
            tiles: {},
            labels: {},
            connections: [],
            fcLines: [],
            softmaxBars: [],
            lossPanel: null
        };

        function material(color, opacity = 0.88) {
            return new THREE.MeshStandardMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                roughness: 0.48,
                metalness: 0.05
            });
        }

        function setTile(mesh, color, opacity = 0.88, emissive = 0x000000) {
            mesh.material.color.setHex(color);
            mesh.material.opacity = opacity;
            mesh.material.transparent = opacity < 1;
            mesh.material.emissive?.setHex(emissive);
        }

        function buildMatrixLayer(key, rows, cols, x, options = {}) {
            const group = new THREE.Group();
            group.position.set(x, options.y || 0, options.z || 0);
            group.rotation.x = options.flat ? 0 : -0.18;
            group.rotation.y = options.rotateY || 0.2;
            root.add(group);
            objects.layerGroups[key] = group;
            objects.tiles[key] = [];

            const tileSize = options.tileSize || 0.28;
            const gap = options.gap || 0.045;
            const geom = new THREE.BoxGeometry(tileSize, tileSize, options.depth || 0.045);
            const x0 = -((cols - 1) * (tileSize + gap)) / 2;
            const y0 = ((rows - 1) * (tileSize + gap)) / 2;
            for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                    const mesh = new THREE.Mesh(geom, material(options.color || colors.base, options.opacity || 0.82));
                    mesh.position.set(x0 + c * (tileSize + gap), y0 - r * (tileSize + gap), 0);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    group.add(mesh);
                    objects.tiles[key].push({ mesh, r, c });
                }
            }
            const label = makeSprite(THREE, options.label || key, { color: "#0f172a", scaleX: 1.4, scaleY: 0.32, size: 24 });
            label.position.set(0, y0 + 0.55, 0.02);
            group.add(label);
            objects.labels[key] = label;
            return group;
        }

        function buildVectorLayer(key, count, x) {
            const group = new THREE.Group();
            group.position.set(x, 0, 0);
            root.add(group);
            objects.layerGroups[key] = group;
            objects.tiles[key] = [];
            const geom = new THREE.BoxGeometry(0.22, 0.7, 0.16);
            for (let i = 0; i < count; i += 1) {
                const mesh = new THREE.Mesh(geom, material(0x8b5cf6, 0.86));
                mesh.position.set(0, 0.72 - i * 0.48, 0);
                group.add(mesh);
                objects.tiles[key].push({ mesh, r: i, c: 0 });
            }
            const label = makeSprite(THREE, "Flatten", { scaleX: 1.4, scaleY: 0.32 });
            label.position.set(0, 1.55, 0.02);
            group.add(label);
        }

        function buildFC(x) {
            const group = new THREE.Group();
            group.position.set(x, 0, 0);
            root.add(group);
            objects.layerGroups.fc = group;
            const sphere = new THREE.SphereGeometry(0.12, 24, 16);
            const inNodes = [];
            const outNodes = [];
            for (let i = 0; i < 4; i += 1) {
                const node = new THREE.Mesh(sphere, material(0xfacc15, 0.95));
                node.position.set(-0.42, 0.75 - i * 0.5, 0);
                group.add(node);
                inNodes.push(node);
            }
            for (let j = 0; j < 3; j += 1) {
                const node = new THREE.Mesh(sphere, material(0xf97316, 0.95));
                node.position.set(0.54, 0.48 - j * 0.55, 0);
                group.add(node);
                outNodes.push(node);
            }
            inNodes.forEach((source, i) => {
                outNodes.forEach((target, j) => {
                    const points = [source.position.clone(), target.position.clone()];
                    const line = new THREE.Line(
                        new THREE.BufferGeometry().setFromPoints(points),
                        new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35 })
                    );
                    line.userData = { i, j };
                    group.add(line);
                    objects.fcLines.push(line);
                });
            });
            const label = makeSprite(THREE, "FC 4→3", { scaleX: 1.4, scaleY: 0.32 });
            label.position.set(0.05, 1.35, 0);
            group.add(label);
        }

        function buildSoftmax(x) {
            const group = new THREE.Group();
            group.position.set(x, 0, 0);
            root.add(group);
            objects.layerGroups.softmax = group;
            const geom = new THREE.BoxGeometry(0.24, 1, 0.24);
            for (let i = 0; i < 3; i += 1) {
                const mesh = new THREE.Mesh(geom, material(0xec4899, 0.85));
                mesh.position.set((i - 1) * 0.34, -0.25, 0);
                mesh.scale.y = 0.25;
                group.add(mesh);
                objects.softmaxBars.push(mesh);
            }
            const label = makeSprite(THREE, "Softmax", { scaleX: 1.5, scaleY: 0.32 });
            label.position.set(0, 1.25, 0);
            group.add(label);
        }

        function buildLoss(x) {
            const group = new THREE.Group();
            group.position.set(x, 0, 0);
            root.add(group);
            objects.layerGroups.loss = group;
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.56, 0.16), material(0x1e3a8a, 0.9));
            group.add(panel);
            objects.lossPanel = panel;
            const label = makeSprite(THREE, "Loss CE", { color: "#ffffff", scaleX: 1.1, scaleY: 0.3, size: 24 });
            label.position.set(0, 0, 0.11);
            group.add(label);
        }

        function connectLayers() {
            for (let i = 0; i < layerOrder.length - 1; i += 1) {
                const a = layerX[layerOrder[i]];
                const b = layerX[layerOrder[i + 1]];
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(a + 0.55, 0, -0.05),
                    new THREE.Vector3((a + b) / 2, 0.35, -0.1),
                    new THREE.Vector3(b - 0.55, 0, -0.05)
                ]);
                const line = new THREE.Mesh(
                    new THREE.TubeGeometry(curve, 16, 0.012, 8, false),
                    material(colors.forward, 0.35)
                );
                root.add(line);
                objects.connections.push(line);
            }
        }

        buildMatrixLayer("input", 6, 6, layerX.input, { label: "Input 6×6", tileSize: 0.2, depth: 0.055, rotateY: -0.36 });
        buildMatrixLayer("conv", 3, 3, layerX.conv, { label: "Kernel 3×3", tileSize: 0.25, color: 0x14b8a6, y: 0.1, z: 0.15, rotateY: -0.18 });
        buildMatrixLayer("relu", 4, 4, layerX.relu, { label: "Feature/ReLU 4×4", tileSize: 0.25, color: 0x4f46e5, rotateY: 0.12 });
        buildMatrixLayer("pool", 2, 2, layerX.pool, { label: "Pool 2×2", tileSize: 0.34, color: 0x8b5cf6, rotateY: 0.1 });
        buildVectorLayer("flatten", 4, layerX.flatten);
        buildFC(layerX.fc);
        buildSoftmax(layerX.softmax);
        buildLoss(layerX.loss);
        connectLayers();

        function resize() {
            const rect = mount.getBoundingClientRect();
            const width = Math.max(320, rect.width);
            const height = Math.max(240, rect.height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        }

        function setView(name, activeLayer = "conv") {
            const targetX = name === "focus" ? (layerX[activeLayer] || 0) : 0;
            const views = {
                overview: { pos: [0, 3.2, 7.8], target: [0, 0, 0] },
                front: { pos: [0, 0.5, 9.5], target: [0, 0, 0] },
                side: { pos: [-7.6, 2.2, 4.6], target: [0, 0, 0] },
                focus: { pos: [targetX, 1.7, 4.2], target: [targetX, 0, 0] }
            };
            const view = views[name] || views.overview;
            camera.position.set(...view.pos);
            if (controls) {
                controls.target.set(...view.target);
                controls.update();
            } else {
                camera.lookAt(new THREE.Vector3(...view.target));
            }
        }

        function patchCells(step) {
            if (!step || !Number.isInteger(step.convIndex)) return [];
            const r0 = Math.floor(step.convIndex / 4);
            const c0 = step.convIndex % 4;
            const cells = [];
            for (let r = 0; r < 3; r += 1) {
                for (let c = 0; c < 3; c += 1) cells.push(`${r0 + r},${c0 + c}`);
            }
            return cells;
        }

        function updateMatrix(key, matrix, options = {}) {
            const active = new Set(options.active || []);
            const muted = new Set(options.muted || []);
            const maxCells = new Set(options.maxCells || []);
            const tiles = objects.tiles[key] || [];
            tiles.forEach(({ mesh, r, c }) => {
                const value = matrixValue(matrix, r, c);
                const normalized = Math.max(0, Math.min(1, Math.abs(value) / (options.scale || 4)));
                let color = options.color || colors.base;
                if (key === "input") color = new THREE.Color().setHSL(0.6, 0.75, 0.32 + normalized * 0.38).getHex();
                if (key === "conv") color = 0x14b8a6;
                if (key === "relu") color = value <= 0 ? colors.muted : new THREE.Color().setHSL(0.64, 0.7, 0.34 + normalized * 0.28).getHex();
                if (key === "pool") color = 0x8b5cf6;
                if (muted.has(`${r},${c}`)) color = colors.muted;
                if (maxCells.has(`${r},${c}`)) color = 0xfacc15;
                if (active.has(`${r},${c}`)) color = options.mode === "backward" ? colors.backward : options.mode === "update" ? colors.update : colors.forward;
                setTile(mesh, color, muted.has(`${r},${c}`) ? 0.42 : 0.88, active.has(`${r},${c}`) ? color : 0x000000);
                mesh.scale.z = 1 + normalized * 2.2;
            });
        }

        function updateVector(values, mode) {
            (objects.tiles.flatten || []).forEach(({ mesh, r }) => {
                const value = values?.[r] || 0;
                const activeColor = mode === "backward" ? colors.backward : colors.forward;
                setTile(mesh, activeColor, 0.82, mode === "backward" ? colors.backward : 0x000000);
                mesh.scale.y = 0.55 + Math.min(1.4, Math.abs(value) * 0.18);
            });
        }

        function updateFC(mode, step) {
            objects.fcLines.forEach((line) => {
                const active = step?.type === "dfc" ? line.userData.i === 1 && line.userData.j === 2 : mode === "forward" && line.userData.j === 1;
                line.material.color.setHex(active ? (mode === "backward" ? colors.backward : colors.forward) : 0x94a3b8);
                line.material.opacity = active ? 0.95 : 0.25;
            });
        }

        function updateSoftmax(probs, label) {
            objects.softmaxBars.forEach((bar, index) => {
                const value = probs?.[index] ?? 0.33;
                bar.scale.y = 0.18 + value * 1.5;
                bar.position.y = -0.55 + bar.scale.y * 0.5;
                setTile(bar, index === label ? colors.backward : 0xec4899, 0.88, index === label ? colors.backward : 0x000000);
            });
        }

        function update(payload = {}) {
            const state = payload.state || {};
            const step = payload.step || {};
            const mode = payload.mode || "forward";
            const activeLayer = payload.activeLayer || "conv";
            const highlightColor = mode === "backward" ? colors.backward : mode === "update" ? colors.update : colors.forward;
            Object.entries(objects.layerGroups).forEach(([key, group]) => {
                const active = key === activeLayer;
                group.scale.setScalar(active ? 1.14 : 1);
                group.position.y = active ? 0.12 : 0;
                group.traverse((child) => {
                    if (child.material?.emissive) child.material.emissive.setHex(active ? highlightColor : 0x000000);
                });
            });
            objects.connections.forEach((line, index) => {
                const source = layerOrder[index];
                const target = layerOrder[index + 1];
                const active = source === activeLayer || target === activeLayer;
                line.material.color.setHex(active ? highlightColor : colors.forward);
                line.material.opacity = active ? 0.78 : 0.22;
            });

            const activePatch = step.type === "conv" || step.type === "dconv" ? patchCells(step) : [];
            updateMatrix("input", state.X, { active: activePatch, mode, scale: 4 });
            updateMatrix("conv", state.K, { active: activeLayer === "conv" ? ["0,0", "0,1", "0,2", "1,0", "1,1", "1,2", "2,0", "2,1", "2,2"] : [], mode, scale: 0.6 });
            const reluMatrix = state.A?.length ? state.A : state.Zconv;
            const mutedRelu = [];
            (state.Zconv || []).forEach((row, r) => row.forEach((value, c) => { if (value <= 0) mutedRelu.push(`${r},${c}`); }));
            const activeFeature = Number.isInteger(step.convIndex) ? [`${Math.floor(step.convIndex / 4)},${step.convIndex % 4}`] : [];
            updateMatrix("relu", reluMatrix, { active: activeLayer === "relu" || activeLayer === "conv" ? activeFeature : [], muted: mutedRelu, mode, scale: 4 });
            const maxCells = [];
            (state.poolMask || []).forEach((row, r) => row.forEach((value, c) => { if (value) maxCells.push(`${r},${c}`); }));
            updateMatrix("pool", state.pool, { active: activeLayer === "pool" ? ["0,0", "0,1", "1,0", "1,1"] : [], maxCells: mode === "backward" ? maxCells : [], mode, scale: 4 });
            updateVector(state.flat, mode);
            updateFC(mode, step);
            updateSoftmax(state.probs, state.label);
            if (objects.lossPanel) {
                setTile(objects.lossPanel, mode === "update" ? colors.update : mode === "backward" ? colors.backward : 0x1e3a8a, 0.92, activeLayer === "loss" ? highlightColor : 0x000000);
            }
        }

        function animate() {
            resize();
            if (controls) controls.update();
            root.rotation.y += 0.0008;
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }

        resize();
        setView("overview");
        animate();
        window.addEventListener("resize", resize);
        return { update, setView, resize };
    }

    window.CnnScene = {
        init: createCnnScene
    };
}());
