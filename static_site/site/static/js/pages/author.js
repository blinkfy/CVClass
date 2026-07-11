(function () {
    const mapLineConfigs = {
        robot: {
            nodeSelector: ".map-node--robot",
            coreAnchor: { edge: "left", ratioY: 0.46 },
            nodeAnchor: { edge: "right", ratioY: 0.52 },
            controls: { firstX: -92, firstY: -40, secondX: 92, secondY: -6 }
        },
        pore: {
            nodeSelector: ".map-node--pore",
            coreAnchor: { edge: "right", ratioY: 0.44 },
            nodeAnchor: { edge: "left", ratioY: 0.52 },
            controls: { firstX: 98, firstY: -42, secondX: -98, secondY: -6 }
        },
        app: {
            nodeSelector: ".map-node--app",
            coreAnchor: { edge: "right", ratioY: 0.7 },
            nodeAnchor: { edge: "left", ratioY: 0.5 },
            controls: { firstX: 80, firstY: 34, secondX: -84, secondY: 6 }
        },
        future: {
            nodeSelector: ".map-node--future",
            coreAnchor: { edge: "left", ratioY: 0.72 },
            nodeAnchor: { edge: "right", ratioY: 0.5 },
            controls: { firstX: -88, firstY: 35, secondX: 88, secondY: 8 }
        }
    };

    function attachHls(video) {
        const hlsSrc = video.dataset.hlsSrc;
        const fallbackSrc = video.dataset.fallbackSrc;
        if (!hlsSrc) return;

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = hlsSrc;
            return;
        }

        if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({
                maxBufferLength: 24,
                backBufferLength: 30
            });
            hls.loadSource(hlsSrc);
            hls.attachMedia(video);
            video.addEventListener("emptied", function () {
                hls.destroy();
            }, { once: true });
            return;
        }

        if (fallbackSrc) {
            video.src = fallbackSrc;
        }
    }

    function getLocalRect(element, rootRect) {
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left - rootRect.left,
            top: rect.top - rootRect.top,
            right: rect.right - rootRect.left,
            bottom: rect.bottom - rootRect.top,
            width: rect.width,
            height: rect.height
        };
    }

    function anchorPoint(rect, anchor, inset) {
        let x = rect.left + rect.width * 0.5;
        if (anchor.edge === "left") x = rect.left + inset;
        if (anchor.edge === "right") x = rect.right - inset;
        return {
            x,
            y: rect.top + rect.height * anchor.ratioY
        };
    }

    function curvePath(start, end, controls) {
        return [
            "M", start.x.toFixed(1), start.y.toFixed(1),
            "C",
            (start.x + controls.firstX).toFixed(1), (start.y + controls.firstY).toFixed(1),
            (end.x + controls.secondX).toFixed(1), (end.y + controls.secondY).toFixed(1),
            end.x.toFixed(1), end.y.toFixed(1)
        ].join(" ");
    }

    function updateAuthorMapLines() {
        const map = document.querySelector(".author-map");
        const svg = map && map.querySelector(".map-lines");
        const core = map && map.querySelector(".map-core");
        if (!map || !svg || !core || getComputedStyle(svg).display === "none") return;

        const rootRect = map.getBoundingClientRect();
        if (!rootRect.width || !rootRect.height) return;

        svg.setAttribute("viewBox", `0 0 ${rootRect.width.toFixed(1)} ${rootRect.height.toFixed(1)}`);
        const coreRect = getLocalRect(core, rootRect);

        Object.entries(mapLineConfigs).forEach(([name, config]) => {
            const node = map.querySelector(config.nodeSelector);
            if (!node) return;

            const nodeRect = getLocalRect(node, rootRect);
            const start = anchorPoint(coreRect, config.coreAnchor, 12);
            const end = anchorPoint(nodeRect, config.nodeAnchor, 12);
            const path = curvePath(start, end, config.controls);

            svg.querySelectorAll(`[data-map-line="${name}"]`).forEach((line) => {
                line.setAttribute("d", path);
            });
        });
    }

    function bindAuthorMapLines() {
        const map = document.querySelector(".author-map");
        if (!map) return;

        const scheduleUpdate = () => window.requestAnimationFrame(updateAuthorMapLines);
        scheduleUpdate();
        window.addEventListener("resize", scheduleUpdate);

        if ("ResizeObserver" in window) {
            const observer = new ResizeObserver(scheduleUpdate);
            observer.observe(map);
            map._authorMapResizeObserver = observer;
        }

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleUpdate).catch(function () {});
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll(".author-hls-video").forEach(attachHls);
        bindAuthorMapLines();
    });
})();
