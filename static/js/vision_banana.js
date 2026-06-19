(function () {
    const page = document.querySelector("[data-banana-page]");
    if (!page) return;

    const revealCards = page.querySelectorAll("[data-vb-reveal-card]");
    const lightbox = page.querySelector("[data-banana-lightbox]");
    const lightboxImage = page.querySelector("[data-lightbox-image]");
    const lightboxCaption = page.querySelector("[data-lightbox-caption]");
    const lightboxClose = page.querySelector("[data-lightbox-close]");
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    function setupCapabilityReveal() {
        revealCards.forEach((card) => {
            card.addEventListener("click", () => {
                card.classList.toggle("is-revealed");
            });

            card.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                card.classList.toggle("is-revealed");
            });

            if (!isTouchDevice) {
                card.addEventListener("mouseleave", () => card.classList.remove("is-revealed"));
            }
        });

        if (isTouchDevice) {
            page.querySelectorAll(".vb-reveal-hint").forEach((hint) => {
                hint.textContent = "点击查看";
            });
        }
    }

    function openLightbox(src, title) {
        if (!lightbox || !lightboxImage || !lightboxCaption) return;
        lightboxImage.src = src;
        lightboxImage.alt = title || "Vision Banana 研究图表";
        lightboxCaption.textContent = title || "Vision Banana 研究图表";
        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
        if (!lightbox || !lightboxImage) return;
        lightbox.classList.remove("is-open");
        lightbox.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        window.setTimeout(() => {
            if (!lightbox.classList.contains("is-open")) {
                lightboxImage.removeAttribute("src");
            }
        }, 220);
    }

    function setupLightbox() {
        page.querySelectorAll("[data-vb-lightbox-src]").forEach((button) => {
            button.addEventListener("click", () => {
                openLightbox(button.dataset.vbLightboxSrc, button.dataset.vbLightboxTitle);
            });
        });

        lightboxClose?.addEventListener("click", closeLightbox);
        lightbox?.addEventListener("click", (event) => {
            if (event.target === lightbox) closeLightbox();
        });
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && lightbox?.classList.contains("is-open")) {
                closeLightbox();
            }
        });
    }

    function setupReveal() {
        const items = page.querySelectorAll("[data-reveal-section]");
        if (!items.length) return;

        if (!("IntersectionObserver" in window)) {
            items.forEach((item) => item.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.16 });

        items.forEach((item) => observer.observe(item));
    }

    function fallbackCopy(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
        } finally {
            textarea.remove();
        }
    }

    function setupBibtexCopy() {
        const cards = page.querySelectorAll(".vb-bibtex-card");
        cards.forEach((card) => {
            const button = card.querySelector("[data-vb-copy-bibtex]");
            const source = card.querySelector(".vb-bibtex-raw") || card.querySelector("[data-vb-bibtex]");
            if (!button || !source) return;

            button.addEventListener("click", async () => {
                const text = source.textContent.trim();
                const textSpan = button.querySelector(".vb-copy-text");
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        fallbackCopy(text);
                    }
                    button.classList.add("is-copied");
                    if (textSpan) textSpan.textContent = "已复制!";
                    window.setTimeout(() => {
                        button.classList.remove("is-copied");
                        if (textSpan) textSpan.textContent = "复制 BibTeX";
                    }, 1200);
                } catch (error) {
                    fallbackCopy(text);
                    button.classList.add("is-copied");
                    if (textSpan) textSpan.textContent = "已复制!";
                    window.setTimeout(() => {
                        button.classList.remove("is-copied");
                        if (textSpan) textSpan.textContent = "复制 BibTeX";
                    }, 1200);
                }
            });
        });
    }

    function setupPointCloudViewer() {
        const viewer = page.querySelector("[data-vb-pointcloud]");
        const canvas = page.querySelector("[data-vb-pointcloud-canvas]");
        const loading = page.querySelector("[data-vb-pointcloud-loading]");
        if (!viewer || !canvas || !loading) return;

        const dataButtons = Array.from(viewer.querySelectorAll("[data-pc-key]"));
        const rotateButton = viewer.querySelector("[data-vb-pc-rotate]");
        const resetButton = viewer.querySelector("[data-vb-pc-reset]");
        const cache = new Map();

        let gl;
        let program;
        let positionLoc;
        let colorLoc;
        let yawLoc;
        let pitchLoc;
        let zoomLoc;
        let projectionLoc;
        let pointSizeLoc;
        let currentCloud = null;
        let initialized = false;
        let visible = false;
        let autoRotate = true;
        let yaw = 0.24;
        let pitch = -0.12;
        let zoom = 3.8;
        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        const vertexShaderSource = `
            attribute vec3 aPosition;
            attribute vec3 aColor;
            uniform float uYaw;
            uniform float uPitch;
            uniform float uZoom;
            uniform float uPointSize;
            uniform mat4 uProjection;
            varying vec3 vColor;

            void main() {
                float cy = cos(uYaw);
                float sy = sin(uYaw);
                float cp = cos(uPitch);
                float sp = sin(uPitch);
                vec3 p = aPosition;
                p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
                p = vec3(p.x, cp * p.y - sp * p.z, sp * p.y + cp * p.z);
                p.y += 0.22;
                p.z -= uZoom;
                vec4 clip = uProjection * vec4(p, 1.0);
                gl_Position = clip;
                gl_PointSize = clamp(uPointSize / max(0.8, clip.w), 1.2, 4.2);
                vColor = aColor;
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            varying vec3 vColor;

            void main() {
                vec2 delta = gl_PointCoord - vec2(0.5);
                if (dot(delta, delta) > 0.25) discard;
                gl_FragColor = vec4(vColor, 0.94);
            }
        `;

        function setLoading(isLoading, text, isError) {
            loading.classList.toggle("is-hidden", !isLoading);
            loading.classList.toggle("is-error", Boolean(isError));
            const label = loading.querySelector("strong");
            if (label && text) label.textContent = text;
        }

        function createShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const message = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(message || "WebGL shader compile failed");
            }
            return shader;
        }

        function createProgram() {
            const vertex = createShader(gl.VERTEX_SHADER, vertexShaderSource);
            const fragment = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
            const linked = gl.createProgram();
            gl.attachShader(linked, vertex);
            gl.attachShader(linked, fragment);
            gl.linkProgram(linked);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
                const message = gl.getProgramInfoLog(linked);
                gl.deleteProgram(linked);
                throw new Error(message || "WebGL program link failed");
            }
            return linked;
        }

        function perspective(fovy, aspect, near, far) {
            const f = 1 / Math.tan(fovy / 2);
            const rangeInv = 1 / (near - far);
            return new Float32Array([
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (near + far) * rangeInv, -1,
                0, 0, near * far * rangeInv * 2, 0
            ]);
        }

        function resizeCanvas() {
            if (!gl) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
            const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            gl.viewport(0, 0, width, height);
            gl.useProgram(program);
            gl.uniformMatrix4fv(projectionLoc, false, perspective(Math.PI / 4.5, width / height, 0.01, 100));
        }

        function parsePointCloud(buffer) {
            const data = new Float32Array(buffer);
            const total = Math.floor(data.length / 6);
            const stride = Math.max(1, Math.floor(total / 140000));

            let minX = Infinity;
            let minY = Infinity;
            let minZ = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            let maxZ = -Infinity;
            let maxColor = 0;

            for (let i = 0; i < total; i += stride) {
                const base = i * 6;
                const x = data[base];
                const y = data[base + 1];
                const z = data[base + 2];
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                maxZ = Math.max(maxZ, z);
                maxColor = Math.max(maxColor, data[base + 3], data[base + 4], data[base + 5]);
            }

            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const cz = (minZ + maxZ) / 2;
            const range = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
            const scale = 2.35 / range;
            const colorScale = maxColor > 1.5 ? 255 : 1;
            const count = Math.ceil(total / stride);
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);

            let cursor = 0;
            for (let i = 0; i < total; i += stride) {
                const base = i * 6;
                positions[cursor * 3] = (data[base] - cx) * scale;
                positions[cursor * 3 + 1] = -(data[base + 1] - cy) * scale;
                positions[cursor * 3 + 2] = (data[base + 2] - cz) * scale;
                colors[cursor * 3] = Math.min(1, Math.max(0, data[base + 3] / colorScale));
                colors[cursor * 3 + 1] = Math.min(1, Math.max(0, data[base + 4] / colorScale));
                colors[cursor * 3 + 2] = Math.min(1, Math.max(0, data[base + 5] / colorScale));
                cursor += 1;
            }

            return { positions, colors, count };
        }

        function createCloudBuffers(parsed) {
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, parsed.positions, gl.STATIC_DRAW);

            const colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, parsed.colors, gl.STATIC_DRAW);

            return {
                positionBuffer,
                colorBuffer,
                count: parsed.count
            };
        }

        async function loadCloud(button) {
            const key = button.dataset.pcKey;
            if (!key) return;

            dataButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
            setLoading(true, "正在加载点云数据...");

            try {
                if (!cache.has(key)) {
                    const response = await fetch(button.dataset.pcSrc);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const parsed = parsePointCloud(await response.arrayBuffer());
                    cache.set(key, createCloudBuffers(parsed));
                }
                currentCloud = cache.get(key);
                resetView(false);
                setLoading(false);
            } catch (error) {
                setLoading(true, "点云数据加载失败", true);
            }
        }

        function bindCloud() {
            if (!currentCloud) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, currentCloud.positionBuffer);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, currentCloud.colorBuffer);
            gl.enableVertexAttribArray(colorLoc);
            gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
        }

        function resetView(keepRotate) {
            yaw = 0.24;
            pitch = -0.12;
            zoom = 3.8;
            if (!keepRotate) {
                autoRotate = rotateButton?.classList.contains("is-active") ?? true;
            }
        }

        function setAutoRotate(value) {
            autoRotate = value;
            rotateButton?.classList.toggle("is-active", autoRotate);
        }

        function render() {
            window.requestAnimationFrame(render);
            if (!visible || !gl || !currentCloud) return;

            if (autoRotate) yaw += 0.0032;
            resizeCanvas();
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.useProgram(program);
            gl.uniform1f(yawLoc, yaw);
            gl.uniform1f(pitchLoc, pitch);
            gl.uniform1f(zoomLoc, zoom);
            gl.uniform1f(pointSizeLoc, 8.2);
            bindCloud();
            gl.drawArrays(gl.POINTS, 0, currentCloud.count);
        }

        function setupPointerControls() {
            canvas.addEventListener("pointerdown", (event) => {
                dragging = true;
                lastX = event.clientX;
                lastY = event.clientY;
                canvas.setPointerCapture?.(event.pointerId);
                setAutoRotate(false);
            });

            canvas.addEventListener("pointermove", (event) => {
                if (!dragging) return;
                const dx = event.clientX - lastX;
                const dy = event.clientY - lastY;
                yaw += dx * 0.006;
                pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.006));
                lastX = event.clientX;
                lastY = event.clientY;
            });

            window.addEventListener("pointerup", () => {
                dragging = false;
            });

            canvas.addEventListener("wheel", (event) => {
                event.preventDefault();
                zoom = Math.max(1.4, Math.min(8, zoom + event.deltaY * 0.003));
            }, { passive: false });
        }

        function init() {
            if (initialized) return;
            initialized = true;

            try {
                gl = canvas.getContext("webgl", { antialias: true, alpha: false });
                if (!gl) throw new Error("WebGL unavailable");
                program = createProgram();
                positionLoc = gl.getAttribLocation(program, "aPosition");
                colorLoc = gl.getAttribLocation(program, "aColor");
                yawLoc = gl.getUniformLocation(program, "uYaw");
                pitchLoc = gl.getUniformLocation(program, "uPitch");
                zoomLoc = gl.getUniformLocation(program, "uZoom");
                projectionLoc = gl.getUniformLocation(program, "uProjection");
                pointSizeLoc = gl.getUniformLocation(program, "uPointSize");
                gl.clearColor(1, 1, 1, 1);
                gl.enable(gl.DEPTH_TEST);
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                resizeCanvas();
                setupPointerControls();
                new ResizeObserver(resizeCanvas).observe(canvas);
                render();
                const activeButton = dataButtons.find((button) => button.classList.contains("is-active")) || dataButtons[0];
                if (activeButton) loadCloud(activeButton);
            } catch (error) {
                setLoading(true, "WebGL 点云可视化不可用", true);
            }
        }

        dataButtons.forEach((button) => {
            button.addEventListener("click", () => {
                if (!initialized) init();
                loadCloud(button);
            });
        });

        rotateButton?.addEventListener("click", () => setAutoRotate(!autoRotate));
        resetButton?.addEventListener("click", () => resetView(true));

        if (!("IntersectionObserver" in window)) {
            visible = true;
            init();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                visible = entry.isIntersecting;
                if (entry.isIntersecting) init();
            });
        }, { rootMargin: "320px 0px", threshold: 0.04 });

        observer.observe(viewer);
    }

    setupCapabilityReveal();
    setupLightbox();
    setupReveal();
    setupBibtexCopy();
    setupPointCloudViewer();
}());
