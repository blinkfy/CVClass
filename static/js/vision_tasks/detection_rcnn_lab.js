(function () {
    window.CVClassVisionTasksMethodLabs = window.CVClassVisionTasksMethodLabs || {};
    window.CVClassVisionTasksMethodLabs.loadDetectionRcnnDemo = async function loadDetectionRcnnDemo() {
        const api = window.CVClassVisionTasks || {};
        const dataRoot = api.moduleDataRoot || window.cvclassUrl("/static/assets/vision_tasks/data");
        const response = await fetch(`${dataRoot}/detection_rcnn_demo.json`);
        if (!response.ok) throw new Error(`detection_rcnn_demo.json HTTP ${response.status}`);
        return response.json();
    };
})();
