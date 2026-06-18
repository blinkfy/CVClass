(function () {
    window.CVClassVisionTasksMethodLabs = window.CVClassVisionTasksMethodLabs || {};
    window.CVClassVisionTasksMethodLabs.loadSemanticFcnDemo = async function loadSemanticFcnDemo() {
        const api = window.CVClassVisionTasks || {};
        const dataRoot = api.moduleDataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
        const response = await fetch(`${dataRoot}/semantic_fcn_demo.json`);
        if (!response.ok) throw new Error(`semantic_fcn_demo.json HTTP ${response.status}`);
        return response.json();
    };
})();
