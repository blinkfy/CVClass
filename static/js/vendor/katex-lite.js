(function () {
    if (window.katex) return;

    function esc(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function renderInline(tex) {
        let out = esc(tex)
            .replace(/\\text\{([^{}]+)\}/g, "$1")
            .replace(/\\_/g, "_")
            .replace(/\\cdot/g, "<span class=\"katex-lite-dot\">·</span>")
            .replace(/\\approx/g, "≈")
            .replace(/\\geq/g, "≥")
            .replace(/\\leq/g, "≤")
            .replace(/\\cap/g, "∩")
            .replace(/\\cup/g, "∪")
            .replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>")
            .replace(/\^([A-Za-z0-9])/g, "<sup>$1</sup>")
            .replace(/([A-Za-z])'/g, "$1&prime;");

        out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, function (_, top, bottom) {
            return `<span class="katex-lite-frac"><span>${top}</span><span>${bottom}</span></span>`;
        });

        return `<span class="katex katex-lite">${out}</span>`;
    }

    window.katex = {
        renderToString: function (tex) {
            return renderInline(tex);
        },
        render: function (tex, element) {
            if (element) element.innerHTML = renderInline(tex);
        }
    };
}());
