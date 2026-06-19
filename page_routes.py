from flask import redirect, render_template, request, url_for


def register_page_routes(app, get_model_status):
    def build_vision_module_context(module_key, active_sub_page, active_nav=None):
        module_configs = {
            "classification_lab": {
                "active_page": "classification_lab",
                "eyebrow": "STATION 06 · CLASSIFICATION AND TASK TAXONOMY",
                "title": "图像分类与任务谱系",
                "subtitle": "从图像级分类出发，比较 Classification、Detection、Semantic Segmentation 与 Instance Segmentation 的输出粒度，并展示 BoVW、Spatial Pyramid、CNN 分类与 Top-K 指标。",
                "badge": "CLASSIFICATION · TAXONOMY · TOP-K",
            },
            "segmentation_basic": {
                "active_page": "segmentation_basic",
                "eyebrow": "STATION 07 · TRADITIONAL SEGMENTATION",
                "title": "图像分割与区域提取",
                "subtitle": "展示从像素聚类、图切割、交互式前景提取到区域 label map 的传统分割流程，连接阈值、边缘、轮廓和语义分割任务。",
                "badge": "CLUSTER · GRAPH CUT · REGION MAP",
            },
            "object_detection": {
                "active_page": "object_detection",
                "eyebrow": "STATION 08 · OBJECT DETECTION",
                "title": "目标检测",
                "subtitle": "展示目标检测从候选框、置信度、IoU 到 NMS 后处理的完整链路，并结合 YOLO 前端推理与 R-CNN 系列机制说明检测任务。",
                "badge": "YOLO · BBOX · NMS",
            },
            "segmentation_lab": {
                "active_page": "segmentation_lab",
                "eyebrow": "STATION 09 · SEMANTIC AND INSTANCE SEGMENTATION",
                "title": "语义分割与实例分割",
                "subtitle": "展示从像素级类别预测到实例级 mask 识别的完整分割任务链路，对比 Semantic Mask 与 Instance Mask 的输出结构和评价指标。",
                "badge": "SEMANTIC MASK · INSTANCE MASK · METRICS",
            },
        }
        config = module_configs[module_key]

        if module_key == "classification_lab":
            requested_method = request.args.get("method")
            requested_focus = request.args.get("focus")
            active_nav = active_nav or ("overview" if active_sub_page == "overview" else requested_focus or requested_method or "bovw")
            nav = [
                {"key": "overview", "label": "任务谱系", "href": url_for("classification_lab_page")},
                {"key": "bovw", "label": "BoVW 分类", "href": f"{url_for('classification_lab_detail_alias_page', method='bovw')}#bovw-classification"},
                {"key": "cnn", "label": "CNN 分类对比", "href": f"{url_for('classification_lab_detail_alias_page', method='cnn')}#cnn-classification"},
                {"key": "topk", "label": "Top-K 指标", "href": f"{url_for('classification_lab_detail_alias_page', focus='topk')}#topk-metrics"},
            ]
        elif module_key == "segmentation_basic":
            requested_method = request.args.get("method") or "kmeans-rgb"
            active_nav = active_nav or (
                "kmeans" if requested_method.startswith("kmeans")
                else "graph" if requested_method in {"graphcut", "ncut"}
                else requested_method
            )
            nav = [
                {"key": "kmeans", "label": "K-means", "href": url_for("segmentation_basic_alias_page", method="kmeans-rgb")},
                {"key": "graph", "label": "Graph Cut / Ncut", "href": url_for("segmentation_basic_alias_page", method="graphcut")},
                {"key": "grabcut", "label": "GrabCut", "href": url_for("segmentation_basic_alias_page", method="grabcut")},
                {"key": "watershed", "label": "Watershed", "href": url_for("segmentation_basic_alias_page", method="watershed")},
                {"key": "regions", "label": "区域属性", "href": url_for("segmentation_basic_alias_page", method="regions")},
            ]
        elif module_key == "object_detection":
            requested_mode = request.args.get("mode") or "yolo"
            requested_focus = request.args.get("focus")
            active_nav = active_nav or ("nms" if requested_focus == "nms" else requested_mode)
            nav = [
                {"key": "yolo", "label": "YOLO 推理", "href": url_for("object_detection_alias_page", mode="yolo")},
                {"key": "nms", "label": "IoU / NMS", "href": url_for("object_detection_alias_page", mode="yolo", focus="nms")},
                {"key": "rcnn", "label": "R-CNN 系列", "href": url_for("object_detection_alias_page", mode="rcnn")},
                {"key": "rpn", "label": "RPN / Anchor", "href": url_for("object_detection_alias_page", mode="rpn")},
                {"key": "roi", "label": "ROI Pooling", "href": url_for("object_detection_alias_page", mode="roi")},
            ]
        else:
            requested_source = request.args.get("source")
            requested_view = request.args.get("view")
            if active_sub_page == "instance":
                active_nav = active_nav or (
                    "compare" if requested_view == "semantic"
                    else "maskrcnn" if requested_source in {"maskrcnn", "roiAlign", "maskMetric"}
                    else "instance"
                )
            else:
                active_nav = active_nav or ("fcn" if requested_source == "fcn" else "semantic")
            nav = [
                {"key": "semantic", "label": "语义分割", "href": url_for("segmentation_lab_page")},
                {"key": "fcn", "label": "FCN / SegFormer", "href": url_for("segmentation_lab_page", source="fcn")},
                {"key": "instance", "label": "实例分割", "href": url_for("segmentation_lab_instance_page")},
                {"key": "maskrcnn", "label": "Mask R-CNN / YOLO-seg", "href": url_for("segmentation_lab_instance_page", source="maskrcnn")},
                {"key": "compare", "label": "语义 vs 实例", "href": url_for("segmentation_lab_instance_page", view="semantic")},
            ]

        for item in nav:
            item["active"] = item["key"] == active_nav

        return {
            "active_page": config["active_page"],
            "active_sub_page": active_sub_page,
            "vision_module_key": module_key,
            "vision_module_eyebrow": config["eyebrow"],
            "vision_module_title": config["title"],
            "vision_module_subtitle": config["subtitle"],
            "vision_module_badge": config["badge"],
            "vision_module_nav": nav,
        }

    @app.route("/")
    def home():
        return render_template("pages/home.html", active_page="home")

    @app.route("/knowledge-graph", methods=["GET"])
    def knowledge_graph_page():
        return render_template("pages/knowledge_graph.html", active_page="knowledge_graph")

    @app.route("/grayscale", methods=["GET"])
    def grayscale_page():
        return render_template("pages/grayscale.html", active_page="grayscale")

    @app.route("/convolution", methods=["GET"])
    def convolution_page():
        return render_template("convolution/convolution.html", active_page="convolution", active_sub_page="visual")

    @app.route("/image-convolution", methods=["GET"])
    def image_convolution_page():
        return render_template("convolution/image_convolution.html", active_page="convolution", active_sub_page="image")

    @app.route("/digit-recognition", methods=["GET"])
    def digit_recognition_page():
        model_ready, model_message = get_model_status()
        return render_template(
            "convolution/digit_recognition.html",
            active_page="convolution",
            active_sub_page="digit",
            model_ready=model_ready,
            model_message=model_message,
            digit_mode="numpy",
        )

    @app.route("/cnn-visualization", methods=["GET"])
    def cnn_visualization_page():
        return render_template("cnn/cnn_visualization.html", active_page="cnn", active_sub_page="cnn_train")

    @app.route("/cnn-explainer", methods=["GET"])
    def cnn_explainer_page():
        return render_template("cnn/cnn_explainer.html", active_page="cnn", active_sub_page="cnn_explainer")

    @app.route("/conv-gradient-lab", methods=["GET"])
    def conv_gradient_lab_page():
        return render_template(
            "cnn/conv_gradient_lab.html",
            active_page="cnn",
            active_sub_page="conv_gradient_lab",
        )

    @app.route("/vision-tasks", methods=["GET"])
    def vision_tasks_page():
        return redirect(url_for("classification_lab_page"))

    @app.route("/classification-lab", methods=["GET"])
    def classification_lab_page():
        return render_template(
            "vision_tasks/vision_tasks_overview.html",
            **build_vision_module_context("classification_lab", "overview"),
        )

    @app.route("/classification-lab/classification", methods=["GET"])
    def classification_lab_detail_alias_page():
        return render_template(
            "vision_tasks/classification_lab.html",
            **build_vision_module_context("classification_lab", "classification"),
        )

    @app.route("/vision-tasks/overview", methods=["GET"])
    def vision_tasks_overview_page():
        return render_template(
            "vision_tasks/vision_tasks_overview.html",
            **build_vision_module_context("classification_lab", "overview"),
        )

    @app.route("/vision-tasks/classification", methods=["GET"])
    def vision_tasks_classification_page():
        return render_template(
            "vision_tasks/classification_lab.html",
            **build_vision_module_context("classification_lab", "classification"),
        )

    @app.route("/segmentation-basic", methods=["GET"])
    def segmentation_basic_alias_page():
        return render_template(
            "vision_tasks/segmentation_basic_lab.html",
            **build_vision_module_context("segmentation_basic", "segmentation_basic"),
        )

    @app.route("/vision-tasks/segmentation-basic", methods=["GET"])
    def segmentation_basic_lab_page():
        return render_template(
            "vision_tasks/segmentation_basic_lab.html",
            **build_vision_module_context("segmentation_basic", "segmentation_basic"),
        )

    @app.route("/object-detection", methods=["GET"])
    def object_detection_alias_page():
        return render_template(
            "vision_tasks/detection_lab.html",
            **build_vision_module_context("object_detection", "detection"),
        )

    @app.route("/vision-tasks/detection", methods=["GET"])
    def detection_lab_page():
        return render_template(
            "vision_tasks/detection_lab.html",
            **build_vision_module_context("object_detection", "detection"),
        )

    @app.route("/segmentation-lab", methods=["GET"])
    @app.route("/segmentation-lab/semantic", methods=["GET"])
    def segmentation_lab_page():
        return render_template(
            "vision_tasks/semantic_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "semantic"),
        )

    @app.route("/vision-tasks/semantic", methods=["GET"])
    def semantic_segmentation_lab_page():
        return render_template(
            "vision_tasks/semantic_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "semantic"),
        )

    @app.route("/segmentation-lab/instance", methods=["GET"])
    def segmentation_lab_instance_page():
        return render_template(
            "vision_tasks/instance_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "instance"),
        )

    @app.route("/vision-tasks/instance", methods=["GET"])
    def instance_segmentation_lab_page():
        return render_template(
            "vision_tasks/instance_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "instance"),
        )

    @app.route("/frontier", methods=["GET"])
    def frontier_page():
        return render_template("frontier.html", active_page="frontier", active_sub_page="overview")

    @app.route("/frontier/vision-banana", methods=["GET"])
    def vision_banana_page():
        return render_template("vision_banana.html", active_page="frontier", active_sub_page="vision_banana")

    @app.route("/edge-detection", methods=["GET"])
    def edge_detection_page():
        return redirect(url_for("edge_detection_mode_page", mode="compare"))

    @app.route("/edge-detection/<mode>", methods=["GET"])
    def edge_detection_mode_page(mode):
        if mode == "teed":
            return render_template("edge/edge_teed.html", active_page="edge", active_sub_page=mode, edge_mode=mode)
        if mode == "applications":
            return render_template("edge/edge_applications.html", active_page="edge", active_sub_page=mode, edge_mode=mode)
        if mode not in {"compare", "kernel", "canny"}:
            return redirect(url_for("edge_detection_mode_page", mode="compare"))
        return render_template("edge/edge_detection.html", active_page="edge", active_sub_page=mode, edge_mode=mode)

    @app.route("/feature-detection", methods=["GET"])
    def feature_detection_page():
        return redirect(url_for("feature_detection_mode_page", mode="compare"))

    @app.route("/feature-detection/<mode>", methods=["GET"])
    def feature_detection_mode_page(mode):
        if mode == "harris":
            return redirect(url_for("feature_detection_mode_page", mode="corner"))
        if mode in {"sift_scale", "sift_descriptor"}:
            return redirect(url_for("feature_detection_mode_page", mode="sift"))

        feature_templates = {
            "compare": "feature/feature_compare.html",
            "corner": "feature/feature_harris.html",
            "sift": "feature/feature_sift.html",
            "matching": "feature/feature_matching.html",
            "panorama": "feature/feature_panorama.html",
        }
        if mode not in feature_templates:
            return redirect(url_for("feature_detection_mode_page", mode="compare"))
        return render_template(
            feature_templates[mode],
            active_page="feature",
            active_sub_page=mode,
            feature_mode=mode,
        )
