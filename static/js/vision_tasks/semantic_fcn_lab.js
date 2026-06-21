(function () {
    window.CVClassVisionTasksMethodLabs = window.CVClassVisionTasksMethodLabs || {};
    window.CVClassVisionTasksMethodLabs.loadSemanticFcnDemo = async function loadSemanticFcnDemo() {
        const api = window.CVClassVisionTasks || {};
        const dataRoot = api.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
        const response = await fetch(`${dataRoot}/semantic_lab/fcn_demo.json`);
        if (!response.ok) throw new Error(`semantic_lab/fcn_demo.json HTTP ${response.status}`);
        return response.json();
    };
})();
