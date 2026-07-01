import os

from flask import Response, redirect, render_template, request, url_for


def register_page_routes(app, get_model_status):
    def build_vision_module_context(module_key, active_sub_page, active_nav=None):
        module_configs = {
            "classification_lab": {
                "active_page": "classification_lab",
                "eyebrow": "STATION 06 · CLASSIFICATION AND TASK TAXONOMY",
                "title": "图像分类与任务谱系",
                "subtitle": "任务谱系对比，BoVW 与 CNN 图像分类及 Top-K 评价",
                "badge": "CLASSIFICATION · TAXONOMY · TOP-K",
            },
            "segmentation_basic": {
                "active_page": "segmentation_basic",
                "eyebrow": "STATION 07 · TRADITIONAL SEGMENTATION",
                "title": "图像分割与区域提取",
                "subtitle": "从聚类、图割到区域统计，理解传统图像分割如何把像素组织成可分析的区域。",
                "badge": "CLUSTER · GRAPH CUT · REGION MAP",
            },
            "object_detection": {
                "active_page": "object_detection",
                "eyebrow": "STATION 08 · OBJECT DETECTION",
                "title": "目标检测",
                "subtitle": "目标检测候选框、置信度、IoU 与 NMS 后处理链路",
                "badge": "YOLO · BBOX · NMS",
            },
            "segmentation_lab": {
                "active_page": "segmentation_lab",
                "eyebrow": "STATION 09 · SEMANTIC AND INSTANCE SEGMENTATION",
                "title": "语义分割与实例分割",
                "subtitle": "语义分割与实例分割的输出结构对比与 Mask AP 评价",
                "badge": "SEMANTIC MASK · INSTANCE MASK · METRICS",
            },
        }
        config = module_configs[module_key]

        if module_key == "classification_lab":
            active_nav = active_nav or ("overview" if active_sub_page == "overview" else "classification")
            nav = [
                {"key": "overview", "label": "任务谱系", "href": url_for("vision_tasks_overview_page")},
                {"key": "classification", "label": "图像分类实验", "href": url_for("classification_lab_detail_alias_page")},
            ]
        elif module_key == "segmentation_basic":
            requested_method = request.args.get("method") or "kmeans-rgb"
            requested_family = (
                "cluster" if request.path.endswith("/cluster")
                else "graph" if request.path.endswith("/graph")
                else "region" if request.path.endswith("/region")
                else None
            )
            def segmentation_family():
                if requested_family:
                    return requested_family
                if requested_method.startswith("kmeans"):
                    return "cluster"
                if requested_method in {"graphcut", "ncut", "grabcut"}:
                    return "graph"
                return "region"
            active_nav = active_nav or segmentation_family()
            nav = [
                {"key": "cluster", "label": "聚类分割", "href": url_for("segmentation_basic_cluster_page")},
                {"key": "graph", "label": "图模型与交互分割", "href": url_for("segmentation_basic_graph_page")},
                {"key": "region", "label": "区域分割与属性分析", "href": url_for("segmentation_basic_region_page")},
            ]
        elif module_key == "object_detection":
            requested_mode = request.args.get("mode") or "yolo"
            requested_focus = request.args.get("focus")
            requested_family = "rcnn" if request.path.endswith("/rcnn") else "yolo" if request.path.endswith("/yolo") else None
            def detection_family():
                if requested_family:
                    return requested_family
                if requested_mode == "yolo" or requested_focus == "nms":
                    return "yolo"
                return "rcnn"
            active_nav = active_nav or detection_family()
            nav = [
                {"key": "yolo", "label": "真实推理：YOLO 检测", "href": url_for("object_detection_yolo_page")},
                {"key": "rcnn", "label": "机制拆解：R-CNN 流程", "href": url_for("object_detection_rcnn_page")},
            ]
        else:
            requested_view = request.args.get("view")
            if active_sub_page == "compare":
                active_nav = active_nav or "compare"
            elif active_sub_page == "instance":
                active_nav = active_nav or (
                    "compare" if requested_view == "semantic"
                    else "instance"
                )
            else:
                active_nav = active_nav or "semantic"
            nav = [
                {"key": "compare", "label": "语义 vs 实例", "href": url_for("segmentation_lab_page")},
                {"key": "semantic", "label": "语义分割", "href": url_for("segmentation_lab_semantic_page")},
                {"key": "instance", "label": "实例分割", "href": url_for("segmentation_lab_instance_page")},
            ]

        for item in nav:
            item["active"] = item["key"] == active_nav

        # Subpage-specific hero titles replace the module-level defaults so the
        # top hero changes with the active sub-page instead of duplicating it below.
        subpage_overrides = {
            ("classification_lab", "overview"): {
                "eyebrow": "TASK TAXONOMY CONSOLE",
                "title": "视觉任务谱系：从图像级预测到实例级理解",
                "subtitle": "使用同一张图像对比图像分类、目标检测、语义分割和实例分割的预测粒度、输出结构与评价指标，并引导进入独立任务模块。",
                "badge": "SAME IMAGE · OUTPUT · METRIC",
            },
            ("classification_lab", "classification"): {
                "eyebrow": "STATION 06 · IMAGE CLASSIFICATION",
                "title": "图像分类",
                "subtitle": "从手工局部特征和视觉词袋，到深度卷积网络端到端分类，理解图像级预测的两条典型路线。",
                "badge": "CLASSIFICATION · TAXONOMY · TOP-K",
            },
            ("segmentation_basic", "segmentation_basic"): {
                "eyebrow": "STATION 07 · TRADITIONAL SEGMENTATION",
                "title": "图像分割与区域提取",
                "subtitle": "从传统分割方法出发，展示 K-means、Graph Cut、Watershed、GrabCut、mask 与区域 label map，连接阈值、边缘、轮廓和后续语义分割任务。",
                "badge": "CLUSTER · GRAPH CUT · REGION MAP",
            },
            ("object_detection", "detection"): {
                "eyebrow": "STATION 08 · OBJECT DETECTION",
                "title": "目标检测：从候选框到最终检测",
                "subtitle": "展示 bbox、confidence、IoU、NMS 与真实 YOLO 前端推理，并补充 R-CNN 系列检测机制。",
                "badge": "YOLO · BBOX · NMS",
            },
            ("segmentation_lab", "semantic"): {
                "eyebrow": "STATION 09 · SEMANTIC SEGMENTATION",
                "title": "语义分割：Pixel-wise Mask",
                "subtitle": "展示逐像素分类、logits、argmax、Semantic Mask、mIoU、FCN 与 SegFormer 推理过程。",
                "badge": "SEMANTIC MASK · PIXEL CLASS",
            },
            ("segmentation_lab", "compare"): {
                "eyebrow": "STATION 09 · REAL SEGMENTATION LAB",
                "title": "语义分割 vs 实例分割：真实模型对比台",
                "subtitle": "在同一张图像上同时运行 SegFormer-B0 与 YOLO11n-seg，比较 H×W class map 与 N × {bbox, class, score, mask, instance_id} 的输出结构、推理流程和适用场景。",
                "badge": "SEGFORMER · YOLO-SEG · COMPARISON",
            },
        }

        if module_key == "segmentation_lab" and active_sub_page == "instance":
            if active_nav == "compare":
                subpage_overrides[(module_key, active_sub_page)] = {
                    "eyebrow": "STATION 09 · SEMANTIC VS INSTANCE",
                    "title": "语义分割 vs 实例分割",
                    "subtitle": "在同一张真实图像上对比 H×W class map 与 N × {bbox, class, score, mask, instance_id} 的输出结构、指标和交互目标。",
                    "badge": "COMPARE · SEMANTIC · INSTANCE",
                }
            else:
                subpage_overrides[(module_key, active_sub_page)] = {
                    "eyebrow": "STATION 09 · INSTANCE SEGMENTATION",
                    "title": "实例分割：Instance Mask",
                    "subtitle": "展示 bbox、class、score、mask、instance id 的联合输出，解释 Mask R-CNN、ROI Align、Mask Head 与 YOLO-seg 推理。",
                    "badge": "INSTANCE MASK · YOLO-SEG",
                }

        override = subpage_overrides.get((module_key, active_sub_page), {})

        return {
            "active_page": config["active_page"],
            "active_sub_page": active_sub_page,
            "vision_module_key": module_key,
            "vision_module_eyebrow": override.get("eyebrow", config["eyebrow"]),
            "vision_module_title": override.get("title", config["title"]),
            "vision_module_subtitle": override.get("subtitle", config["subtitle"]),
            "vision_module_badge": override.get("badge", config["badge"]),
            "vision_module_nav": nav,
        }

    def build_human_pose_context(active_sub_page):
        subpage_configs = {
            "overview": {
                "title": "姿态估计总览",
                "subtitle": "从人体区域输入到关键点、骨架连接与姿态向量输出，建立人体姿态估计任务的整体视图。",
            },
            "skeleton": {
                "title": "关键点与骨架",
                "subtitle": "展示 COCO-17 关键点、骨架结构、置信度过滤与姿态向量组织方式。",
            },
            "mechanism": {
                "title": "姿态估计机制",
                "subtitle": "对比 DeepPose 坐标回归与 Heatmap 峰值定位两类典型机制。",
            },
            "action": {
                "title": "动作识别",
                "subtitle": "展示视频帧序列、时空特征、3D Convolution 与动作类别概率输出。",
            },
        }
        nav = [
            {"key": "overview", "label": "姿态估计总览", "href": url_for("human_pose_overview_page")},
            {"key": "skeleton", "label": "关键点与骨架", "href": url_for("human_pose_skeleton_page")},
            {"key": "mechanism", "label": "姿态估计机制", "href": url_for("human_pose_mechanism_page")},
            {"key": "action", "label": "动作识别", "href": url_for("human_pose_action_page")},
        ]
        for item in nav:
            item["active"] = item["key"] == active_sub_page

        config = subpage_configs[active_sub_page]
        human_pose_status_map = {
            "skeleton": "真实推理 · 本地 MoveNet MultiPose / Thunder",
            "action": "真实推理 · 本地动作分类器",
        }
        human_pose_status = human_pose_status_map.get(active_sub_page, "预设样例 · 机制拆解")
        return {
            "active_page": "human_pose",
            "active_sub_page": active_sub_page,
            "human_pose_eyebrow": "STATION 10 · HUMAN POSE & ACTION",
            "human_pose_title": "人体姿态估计与动作识别",
            "human_pose_subtitle": "Keypoints、Skeleton、Pose Vector、Heatmap、C3D 与动作分类流程可视化。",
            "human_pose_badge": "POSE · SKELETON · ACTION",
            "human_pose_status": human_pose_status,
            "human_pose_page_title": config["title"],
            "human_pose_page_subtitle": config["subtitle"],
            "human_pose_nav": nav,
        }

    def build_geometry_context(active_sub_page):
        subpage_configs = {
            "model": {
                "page_title": "相机成像模型",
                "subtitle": "从光心、光轴、焦距和成像平面出发，观察三维点如何通过针孔投影落到二维图像平面。",
                "status": "机制拆解 · 教学动画",
            },
            "projection": {
                "page_title": "内外参与投影矩阵",
                "subtitle": "观察世界坐标如何经过外参变换、归一化投影和内参映射，最终得到像素坐标。",
                "status": "公式推导 · K[R|t]",
            },
            "calibration": {
                "page_title": "棋盘格标定实验",
                "subtitle": "通过棋盘格角点建立 3D 世界点与 2D 图像点对应，观察相机参数求解和重投影误差。",
                "status": "预设样例 · 可解释演示",
            },
        }
        nav = [
            {"key": "model", "label": "相机成像模型", "href": url_for("camera_geometry_model_page")},
            {"key": "projection", "label": "内外参与投影矩阵", "href": url_for("camera_projection_matrix_page")},
            {"key": "calibration", "label": "棋盘格标定实验", "href": url_for("camera_calibration_page")},
        ]
        for item in nav:
            item["active"] = item["key"] == active_sub_page

        config = subpage_configs[active_sub_page]
        return {
            "active_page": "geometry_vision",
            "active_sub_page": active_sub_page,
            "geometry_eyebrow": "STATION 12 · WORLD 03 CAMERA GEOMETRY",
            "geometry_title": "相机几何与标定",
            "geometry_page_title": config["page_title"],
            "geometry_subtitle": config["subtitle"],
            "geometry_badge": "K · [R|t] · REPROJECTION",
            "geometry_status": config["status"],
            "geometry_nav": nav,
        }

    def build_motion_context(active_sub_page):
        subpage_configs = {
            "constraint": {
                "page_title": "运动场与光流约束",
                "subtitle": "从两帧图像的亮度变化出发，观察像素运动如何被近似为二维光流向量。",
                "status": "机制拆解 · 教学动画",
            },
            "lucas_kanade": {
                "page_title": "Lucas-Kanade 光流",
                "subtitle": "用一个局部窗口内的多个像素约束，最小二乘求解当前 patch 的二维运动向量。",
                "status": "预设样例 · 可解释演示",
            },
            "pyramid": {
                "page_title": "金字塔光流与运动追踪",
                "subtitle": "通过图像金字塔从粗到细估计大位移，让 Lucas-Kanade 适用于更明显的运动。",
                "status": "公式推导 · Optical Flow",
            },
            "real_flow": {
                "page_title": "真实视频光流可视化",
                "subtitle": "从本地交通视频逐帧读取像素，在浏览器中实时计算稠密采样光流和稀疏特征轨迹。",
                "status": "真实视频帧 · 浏览器端计算",
            },
        }
        nav = [
            {"key": "constraint", "label": "运动场与光流约束", "href": url_for("motion_flow_constraint_page")},
            {"key": "lucas_kanade", "label": "Lucas-Kanade 光流", "href": url_for("motion_lucas_kanade_page")},
            {"key": "pyramid", "label": "金字塔光流与运动追踪", "href": url_for("motion_pyramid_tracking_page")},
            {"key": "real_flow", "label": "真实视频光流", "href": url_for("motion_real_flow_page")},
        ]
        for item in nav:
            item["active"] = item["key"] == active_sub_page

        config = subpage_configs[active_sub_page]
        return {
            "active_page": "motion_estimation",
            "active_sub_page": active_sub_page,
            "motion_eyebrow": "MODULE 02 · WORLD 03 MOTION ESTIMATION",
            "motion_title": "运动估计与光流",
            "motion_page_title": config["page_title"],
            "motion_subtitle": config["subtitle"],
            "motion_badge": "Ix u + Iy v + It = 0 · LK · PYRAMID",
            "motion_status": config["status"],
            "motion_nav": nav,
        }

    def build_stereo_context(active_sub_page):
        subpage_configs = {
            "parallel": {
                "page_title": "平行双目与极线约束",
                "subtitle": "观察同一个三维点如何分别投影到左右相机，并理解校正后双目图像为什么可以沿水平扫描线寻找匹配。",
                "status": "PARALLEL STEREO · RECTIFIED PAIR",
            },
            "disparity": {
                "page_title": "视差与深度三角关系",
                "subtitle": "通过 d = xL - xR 和 Z = bf / d，观察视差、基线、焦距如何共同决定深度。",
                "status": "DISPARITY TO DEPTH · Z = bf / d",
            },
            "block_matching": {
                "page_title": "块匹配与视差图",
                "subtitle": "从单点视差扩展到整张图像，用局部块匹配计算每个像素或 patch 的视差，生成视差图与深度图。",
                "status": "BLOCK MATCHING · COST VOLUME",
            },
        }
        nav = [
            {"key": "parallel", "label": "平行双目与极线约束", "href": url_for("stereo_depth_parallel_page")},
            {"key": "disparity", "label": "视差与深度三角关系", "href": url_for("stereo_depth_disparity_page")},
            {"key": "block_matching", "label": "块匹配与视差图", "href": url_for("stereo_depth_block_matching_page")},
        ]
        for item in nav:
            item["active"] = item["key"] == active_sub_page

        config = subpage_configs[active_sub_page]
        return {
            "active_page": "stereo_depth",
            "active_sub_page": active_sub_page,
            "stereo_eyebrow": "STATION 14 · WORLD 03 STEREO DEPTH",
            "stereo_title": "双目视觉与深度",
            "stereo_page_title": config["page_title"],
            "stereo_subtitle": config["subtitle"],
            "stereo_badge": "b · f · d · Z",
            "stereo_status": config["status"],
            "stereo_nav": nav,
        }

    def build_multiview_context(active_sub_page):
        subpage_configs = {
            "epipolar": {
                "page_title": "对极几何与基础矩阵",
                "subtitle": "从两张非平行视图中的匹配点出发，观察一个点如何在另一张图像中生成一条极线，并理解对极约束 \\( \\mathbf{x}'^{\\mathsf T}\\mathbf{F}\\mathbf{x}=0 \\)。",
                "status": "预设样例 · 可解释演示",
            },
            "pose": {
                "page_title": "本质矩阵与相机位姿",
                "subtitle": "在已知相机内参后，把基础矩阵转换为本质矩阵，并通过分解 \\( \\mathbf{E} \\) 恢复两台相机之间的旋转 \\( \\mathbf{R} \\) 和平移 \\( \\mathbf{t} \\)。",
                "status": "\\( \\mathbf{F}\\rightarrow\\mathbf{E} \\) · \\( \\mathbf{R},\\mathbf{t} \\) · CHEIRALITY",
            },
            "triangulation": {
                "page_title": "三角测量与稀疏点云",
                "subtitle": "已知相机位姿和二维匹配点后，通过反投影射线求空间点，并将多个匹配点重建为稀疏三维点云。",
                "status": "TRIANGULATION · REPROJECTION ERROR",
            },
        }
        nav = [
            {"key": "epipolar", "label": "对极几何与基础矩阵", "href": url_for("multiview_epipolar_geometry_page")},
            {"key": "pose", "label": "本质矩阵与相机位姿", "href": url_for("multiview_essential_pose_page")},
            {"key": "triangulation", "label": "三角测量与稀疏点云", "href": url_for("multiview_triangulation_page")},
        ]
        for item in nav:
            item["active"] = item["key"] == active_sub_page

        config = subpage_configs[active_sub_page]
        return {
            "active_page": "multiview_reconstruction",
            "active_sub_page": active_sub_page,
            "multiview_eyebrow": "STATION 15 · WORLD 03 MULTIVIEW RECONSTRUCTION",
            "multiview_title": "多视图几何与三维重建",
            "multiview_page_title": config["page_title"],
            "multiview_subtitle": config["subtitle"],
            "multiview_badge": "\\( \\mathbf{F} \\) · \\( \\mathbf{E} \\) · \\( \\mathbf{R},\\mathbf{t} \\) · \\( \\mathbf{X} \\)",
            "multiview_status": config["status"],
            "multiview_nav": nav,
        }

    @app.route("/")
    def home():
        return render_template("pages/home.html", active_page="home")

    @app.route("/principles", methods=["GET"])
    def algorithm_principles_page():
        return render_template("pages/algorithm_principles.html", active_page="principles")

    @app.route("/api/docs/algorithm-principles", methods=["GET"])
    def api_algorithm_principles_doc():
        doc_path = os.path.join(app.root_path, "docs", "算法原理详解.md")
        if not os.path.exists(doc_path):
            return Response("# 算法原理详解\n\n文档尚未生成。\n", content_type="text/markdown; charset=utf-8")
        with open(doc_path, "r", encoding="utf-8") as doc_file:
            content = doc_file.read()
        return Response(content, content_type="text/markdown; charset=utf-8")

    @app.route("/learning-path", methods=["GET"])
    def learning_path_page():
        return render_template("pages/learning_path.html", active_page="learning_path")

    @app.route("/learning-path/frontier", methods=["GET"])
    def learning_path_frontier_page():
        return redirect("/learning-path#path-frontier")

    @app.route("/knowledge-graph", methods=["GET"])
    def knowledge_graph_page():
        return render_template("pages/knowledge_graph.html", active_page="knowledge_graph")

    @app.route("/about-author", methods=["GET"])
    def author_page():
        return render_template("pages/author.html", active_page="author")

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

    @app.route("/vision-tasks/overview", methods=["GET"])
    def vision_tasks_overview_page():
        return render_template(
            "vision_tasks/vision_tasks_overview.html",
            **build_vision_module_context("classification_lab", "overview"),
        )

    @app.route("/classification-lab", methods=["GET"])
    def classification_lab_page():
        return vision_tasks_overview_page()

    @app.route("/vision-tasks/classification", methods=["GET"])
    @app.route("/classification-lab/classification", methods=["GET"])
    def classification_lab_detail_alias_page():
        return render_template(
            "vision_tasks/classification_lab.html",
            **build_vision_module_context("classification_lab", "classification"),
        )

    @app.route("/vision-tasks/segmentation-basic", methods=["GET"])
    @app.route("/segmentation-basic", methods=["GET"])
    def segmentation_basic_alias_page():
        return render_template(
            "vision_tasks/segmentation_basic_lab.html",
            **build_vision_module_context("segmentation_basic", "segmentation_basic"),
        )

    @app.route("/segmentation-basic/cluster", methods=["GET"])
    def segmentation_basic_cluster_page():
        return render_template(
            "vision_tasks/segmentation_basic_lab.html",
            **build_vision_module_context("segmentation_basic", "segmentation_basic", "cluster"),
        )

    @app.route("/segmentation-basic/graph", methods=["GET"])
    def segmentation_basic_graph_page():
        return render_template(
            "vision_tasks/segmentation_basic_lab.html",
            **build_vision_module_context("segmentation_basic", "segmentation_basic", "graph"),
        )

    @app.route("/segmentation-basic/region", methods=["GET"])
    def segmentation_basic_region_page():
        return render_template(
            "vision_tasks/segmentation_basic_lab.html",
            **build_vision_module_context("segmentation_basic", "segmentation_basic", "region"),
        )

    @app.route("/vision-tasks/detection", methods=["GET"])
    @app.route("/object-detection", methods=["GET"])
    def object_detection_alias_page():
        return render_template(
            "vision_tasks/object_detection_lab.html",
            **build_vision_module_context("object_detection", "detection"),
        )

    @app.route("/object-detection/yolo", methods=["GET"])
    def object_detection_yolo_page():
        return render_template(
            "vision_tasks/object_detection_lab.html",
            **build_vision_module_context("object_detection", "detection", "yolo"),
        )

    @app.route("/object-detection/rcnn", methods=["GET"])
    def object_detection_rcnn_page():
        return render_template(
            "vision_tasks/object_detection_lab.html",
            **build_vision_module_context("object_detection", "detection", "rcnn"),
        )

    @app.route("/segmentation-lab", methods=["GET"])
    def segmentation_lab_page():
        context = build_vision_module_context("segmentation_lab", "compare", "compare")
        return render_template(
            "vision_tasks/segmentation_lab_compare.html",
            **context,
        )

    @app.route("/segmentation-lab/semantic", methods=["GET"])
    def segmentation_lab_semantic_page():
        return render_template(
            "vision_tasks/semantic_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "semantic", "semantic"),
        )

    @app.route("/vision-tasks/semantic", methods=["GET"])
    @app.route("/semantic-segmentation", methods=["GET"])
    def semantic_segmentation_alias_page():
        return render_template(
            "vision_tasks/semantic_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "semantic", "semantic"),
        )

    @app.route("/segmentation-lab/instance", methods=["GET"])
    def segmentation_lab_instance_page():
        context = build_vision_module_context("segmentation_lab", "instance")
        if request.args.get("view") == "semantic":
            context["vision_instance_mode"] = "compare"
        return render_template(
            "vision_tasks/instance_segmentation_lab.html",
            **context,
        )

    @app.route("/vision-tasks/instance", methods=["GET"])
    @app.route("/instance-segmentation", methods=["GET"])
    def instance_segmentation_alias_page():
        return render_template(
            "vision_tasks/instance_segmentation_lab.html",
            **build_vision_module_context("segmentation_lab", "instance", "instance"),
        )

    @app.route("/human-pose", methods=["GET"])
    def human_pose_page():
        return redirect(url_for("human_pose_skeleton_page"))

    @app.route("/human-pose/overview", methods=["GET"])
    def human_pose_overview_page():
        return render_template(
            "human_pose/overview.html",
            **build_human_pose_context("overview"),
        )

    @app.route("/human-pose/skeleton", methods=["GET"])
    def human_pose_skeleton_page():
        return render_template(
            "human_pose/skeleton.html",
            **build_human_pose_context("skeleton"),
        )

    @app.route("/human-pose/mechanism", methods=["GET"])
    def human_pose_mechanism_page():
        return render_template(
            "human_pose/mechanism.html",
            **build_human_pose_context("mechanism"),
        )

    @app.route("/human-pose/action", methods=["GET"])
    def human_pose_action_page():
        return render_template(
            "human_pose/action_recognition.html",
            **build_human_pose_context("action"),
        )

    @app.route("/camera-geometry", methods=["GET"])
    def camera_geometry_page():
        return redirect(url_for("camera_geometry_model_page"))

    @app.route("/camera-geometry/model", methods=["GET"])
    def camera_geometry_model_page():
        return render_template(
            "geometry_vision/camera_model.html",
            **build_geometry_context("model"),
        )

    @app.route("/camera-geometry/projection-matrix", methods=["GET"])
    def camera_projection_matrix_page():
        return render_template(
            "geometry_vision/projection_matrix.html",
            **build_geometry_context("projection"),
        )

    @app.route("/camera-geometry/calibration", methods=["GET"])
    def camera_calibration_page():
        return render_template(
            "geometry_vision/calibration.html",
            **build_geometry_context("calibration"),
        )

    @app.route("/motion-estimation", methods=["GET"])
    def motion_estimation_page():
        return redirect(url_for("motion_flow_constraint_page"))

    @app.route("/motion-estimation/flow-constraint", methods=["GET"])
    def motion_flow_constraint_page():
        return render_template(
            "geometry_vision/motion_flow_constraint.html",
            **build_motion_context("constraint"),
        )

    @app.route("/motion-estimation/lucas-kanade", methods=["GET"])
    def motion_lucas_kanade_page():
        return render_template(
            "geometry_vision/motion_lucas_kanade.html",
            **build_motion_context("lucas_kanade"),
        )

    @app.route("/motion-estimation/pyramid-tracking", methods=["GET"])
    def motion_pyramid_tracking_page():
        return render_template(
            "geometry_vision/motion_pyramid_tracking.html",
            **build_motion_context("pyramid"),
        )

    @app.route("/motion-estimation/real-flow", methods=["GET"])
    def motion_real_flow_page():
        return render_template(
            "geometry_vision/motion_real_flow.html",
            **build_motion_context("real_flow"),
        )

    @app.route("/stereo-depth", methods=["GET"])
    def stereo_depth_page():
        return redirect(url_for("stereo_depth_disparity_page"))

    @app.route("/stereo-depth/parallel", methods=["GET"])
    def stereo_depth_parallel_page():
        return render_template(
            "geometry_vision/stereo_parallel.html",
            **build_stereo_context("parallel"),
        )

    @app.route("/stereo-depth/disparity", methods=["GET"])
    def stereo_depth_disparity_page():
        return render_template(
            "geometry_vision/stereo_disparity.html",
            **build_stereo_context("disparity"),
        )

    @app.route("/stereo-depth/block-matching", methods=["GET"])
    def stereo_depth_block_matching_page():
        return render_template(
            "geometry_vision/stereo_block_matching.html",
            **build_stereo_context("block_matching"),
        )

    @app.route("/multiview-reconstruction", methods=["GET"])
    def multiview_reconstruction_page():
        return redirect(url_for("multiview_epipolar_geometry_page"))

    @app.route("/multiview-reconstruction/epipolar-geometry", methods=["GET"])
    def multiview_epipolar_geometry_page():
        return render_template(
            "geometry_vision/multiview_epipolar.html",
            **build_multiview_context("epipolar"),
        )

    @app.route("/multiview-reconstruction/essential-pose", methods=["GET"])
    def multiview_essential_pose_page():
        return render_template(
            "geometry_vision/multiview_pose.html",
            **build_multiview_context("pose"),
        )

    @app.route("/multiview-reconstruction/triangulation", methods=["GET"])
    def multiview_triangulation_page():
        return render_template(
            "geometry_vision/multiview_triangulation.html",
            **build_multiview_context("triangulation"),
        )

    @app.route("/frontier", methods=["GET"])
    def frontier_page():
        return render_template("frontier.html", active_page="frontier", active_sub_page="overview")

    @app.route("/vision-transformer", methods=["GET"])
    def vision_transformer_page():
        return redirect(url_for("vision_transformer_vit_page"))

    @app.route("/vision-transformer/vit", methods=["GET"])
    def vision_transformer_vit_page():
        return render_template(
            "frontier_vit.html",
            active_page="vision_transformer",
            active_sub_page="vit",
        )

    @app.route("/vision-transformer/dino", methods=["GET"])
    def vision_transformer_dino_page():
        return render_template(
            "frontier_dino.html",
            active_page="vision_transformer",
            active_sub_page="dino",
        )

    @app.route("/frontier/vit", methods=["GET"])
    def frontier_vit_page():
        return redirect(url_for("vision_transformer_vit_page"))

    @app.route("/frontier/dino", methods=["GET"])
    def frontier_dino_page():
        return redirect(url_for("vision_transformer_dino_page"))

    @app.route("/frontier/clip", methods=["GET"])
    def frontier_clip_page():
        return render_template("frontier/clip.html", active_page="vision_language", active_sub_page="clip")

    @app.route("/frontier/vlm", methods=["GET"])
    def frontier_vlm_page():
        return render_template("frontier/vlm.html", active_page="vision_language", active_sub_page="vlm")

    @app.route("/frontier/multimodal", methods=["GET"])
    def frontier_multimodal_page():
        return render_template("frontier/multimodal.html", active_page="vision_language", active_sub_page="multimodal")

    @app.route("/generative-multimodal/sam", methods=["GET"])
    def generative_multimodal_sam_page():
        return render_template("generative_multimodal_sam.html", active_page="vision_language", active_sub_page="sam")

    @app.route("/generative-multimodal/gan", methods=["GET"])
    def generative_multimodal_gan_page():
        return render_template("generative_multimodal/gan.html", active_page="vision_language", active_sub_page="gan")

    @app.route("/generative-multimodal/diffusion", methods=["GET"])
    def generative_multimodal_diffusion_page():
        return render_template("generative_multimodal/diffusion.html", active_page="vision_language", active_sub_page="diffusion")

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
