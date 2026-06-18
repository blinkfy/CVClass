(function () {
    window.CVClassVisionTasksMethodLabs = window.CVClassVisionTasksMethodLabs || {};
    window.CVClassVisionTasksMethodLabs.loadInstanceMaskRcnnDemo = async function loadInstanceMaskRcnnDemo() {
        const api = window.CVClassVisionTasks || {};
        const dataRoot = api.moduleDataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
        const response = await fetch(`${dataRoot}/instance_maskrcnn_demo.json`);
        if (!response.ok) throw new Error(`instance_maskrcnn_demo.json HTTP ${response.status}`);
        return response.json();
    };
})();
