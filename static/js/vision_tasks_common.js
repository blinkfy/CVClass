(function () {
    const root = document.querySelector(".vision-lab");
    if (!root) return;

    root.classList.add("is-ready");
    window.CVClassVisionTasks = Object.freeze({
        page: root.dataset.visionPage || "overview",
        dataRoot: window.cvclassUrl("/static/assets/vision_tasks/data"),
    });
}());
