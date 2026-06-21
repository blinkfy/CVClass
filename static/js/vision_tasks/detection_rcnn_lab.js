(function () {
    window.CVClassVisionTasksMethodLabs = window.CVClassVisionTasksMethodLabs || {};
    window.CVClassVisionTasksMethodLabs.loadDetectionRcnnDemo = async function loadDetectionRcnnDemo() {
        const api = window.CVClassVisionTasks || {};
        const dataRoot = api.dataRoot || window.cvclassUrl("/static/assets/data/vision_tasks");
        const response = await fetch(`${dataRoot}/detection_lab/rcnn_demo.json`);
        if (!response.ok) throw new Error(`detection_lab/rcnn_demo.json HTTP ${response.status}`);
        return response.json();
    };
})();
