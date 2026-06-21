(function () {
    window.CVClassVisionTasksMethodLabs = window.CVClassVisionTasksMethodLabs || {};
    window.CVClassVisionTasksMethodLabs.loadInstanceMaskRcnnDemo = async function loadInstanceMaskRcnnDemo() {
        const api = window.CVClassVisionTasks || {};
        const dataRoot = api.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
        const response = await fetch(`${dataRoot}/instance_lab/maskrcnn_demo.json`);
        if (!response.ok) throw new Error(`instance_lab/maskrcnn_demo.json HTTP ${response.status}`);
        return response.json();
    };
})();
