import json
import re
import urllib.error
import urllib.request

from flask import Response, jsonify, request


def register_ai_routes(app, get_ai_config):
    def normalize_nav_text(text):
        return re.sub(r"\s+", "", (text or "")).lower()

    navigation_catalog = [
        {"path": "/", "label": "首页", "group": "系统总览", "keywords": ["首页", "home", "总览", "开始"]},
        {"path": "/learning-path", "label": "学习路径", "group": "系统总览", "keywords": ["学习路径", "learning path", "路线", "课程"]},
        {"path": "/knowledge-graph", "label": "知识图谱", "group": "系统总览", "keywords": ["知识图谱", "知识库", "图谱", "关系图", "graph"]},
        {"path": "/vision-tasks/overview", "label": "视觉任务谱系", "group": "系统总览", "keywords": ["视觉任务", "任务谱系", "vision tasks", "classification detection semantic instance", "总览"]},
        {"path": "/about-author", "label": "关于作者", "group": "系统总览", "keywords": ["关于作者", "作者", "about", "介绍"]},
        {"path": "/grayscale", "label": "图像基础", "group": "基础算法主线", "keywords": ["灰度", "灰度化", "二值化", "直方图", "grayscale"]},
        {"path": "/convolution", "label": "卷积与滤波", "group": "基础算法主线", "keywords": ["卷积", "卷积核", "滤波", "patch", "stride", "padding", "dilation"]},
        {"path": "/image-convolution", "label": "图像卷积应用", "group": "基础算法主线", "keywords": ["图像卷积", "图片卷积", "卷积应用"]},
        {"path": "/edge-detection", "label": "边缘、轮廓与形态学", "group": "边缘与特征结构", "keywords": ["边缘", "轮廓", "形态学", "sobel", "canny", "hough", "edge"]},
        {"path": "/feature-detection", "label": "角点、特征与图像拼接", "group": "边缘与特征结构", "keywords": ["角点", "特征", "图像拼接", "全景", "harris", "fast", "sift", "ransac", "homography"]},
        {"path": "/cnn-visualization", "label": "CNN 如何学习 / 图像分类", "group": "CNN 学习与分类", "keywords": ["cnn", "卷积神经网络", "前向", "反向", "梯度", "图像分类", "可视化"]},
        {"path": "/cnn-explainer", "label": "CNN 数据传播细节", "group": "CNN 学习与分类", "keywords": ["cnn解释", "cnn细节", "传播细节", "解释器"]},
        {"path": "/conv-gradient-lab", "label": "卷积梯度显微镜", "group": "CNN 学习与分类", "keywords": ["梯度", "反向传播", "卷积梯度", "显微镜"]},
        {"path": "/digit-recognition", "label": "手写数字识别", "group": "CNN 学习与分类", "keywords": ["手写数字", "数字识别", "mnist", "卷积模型"]},
        {"path": "/vision-tasks/classification", "label": "图像分类实验", "group": "CNN 学习与分类", "keywords": ["图像分类", "classification", "bovw", "spatial pyramid", "cnn", "top-k"]},
        {"path": "/segmentation-basic", "label": "图像分割与区域提取", "group": "分割与识别任务", "keywords": ["图像分割", "区域提取", "k-means", "graph cut", "ncut", "watershed", "grabcut", "label map", "mask"]},
        {"path": "/object-detection", "label": "目标检测", "group": "分割与识别任务", "keywords": ["目标检测", "bbox", "confidence", "iou", "nms", "yolo", "r-cnn", "rpn", "anchor", "roi pooling"]},
        {"path": "/semantic-segmentation", "label": "语义分割", "group": "分割与识别任务", "keywords": ["语义分割", "semantic", "fcn", "segformer", "mIoU", "1x1 conv", "upsampling", "skip connection"]},
        {"path": "/instance-segmentation", "label": "实例分割", "group": "分割与识别任务", "keywords": ["实例分割", "instance", "mask r-cnn", "fpn", "roi align", "mask head", "yolo-seg", "prototype mask"]},
        {"path": "/camera-geometry", "label": "相机几何与标定", "group": "几何运动与三维视觉", "keywords": ["相机几何", "相机标定", "针孔模型", "投影矩阵", "内参", "外参", "reprojection"]},
        {"path": "/camera-geometry/model", "label": "相机成像模型", "group": "几何运动与三维视觉", "keywords": ["相机成像模型", "针孔模型", "投影", "pinhole", "成像"]},
        {"path": "/camera-geometry/projection-matrix", "label": "内外参与投影矩阵", "group": "几何运动与三维视觉", "keywords": ["内外参", "投影矩阵", "内参矩阵", "外参矩阵", "camera matrix"]},
        {"path": "/camera-geometry/calibration", "label": "棋盘格标定实验", "group": "几何运动与三维视觉", "keywords": ["棋盘格标定", "相机标定", "calibration", "checkerboard", "张正友"]},
        {"path": "/motion-estimation", "label": "运动估计与光流", "group": "几何运动与三维视觉", "keywords": ["运动估计", "光流", "lucas-kanade", "pyramid", "运动场", "亮度恒定"]},
        {"path": "/motion-estimation/flow-constraint", "label": "运动场与光流约束", "group": "几何运动与三维视觉", "keywords": ["运动场", "光流约束", "亮度恒定", "光流方程", "brightness constancy"]},
        {"path": "/motion-estimation/lucas-kanade", "label": "Lucas-Kanade 光流", "group": "几何运动与三维视觉", "keywords": ["lucas-kanade", "LK 光流", "光流估计", "局部光流", "光流法"]},
        {"path": "/motion-estimation/pyramid-tracking", "label": "金字塔光流与运动追踪", "group": "几何运动与三维视觉", "keywords": ["金字塔光流", "运动追踪", "lucas-kanade", "pyramid", "tracking"]},
        {"path": "/motion-estimation/real-flow", "label": "真实视频光流可视化", "group": "几何运动与三维视觉", "keywords": ["真实视频光流", "光流可视化", "video", "optical flow", "dense flow"]},
        {"path": "/stereo-depth", "label": "双目视觉与深度", "group": "几何运动与三维视觉", "keywords": ["双目视觉", "平行双目", "视差", "深度", "baseline", "disparity", "block matching", "stereo"]},
        {"path": "/stereo-depth/parallel", "label": "平行双目与极线约束", "group": "几何运动与三维视觉", "keywords": ["平行双目", "极线约束", "水平扫描线", "校正", "xL", "xR"]},
        {"path": "/stereo-depth/disparity", "label": "视差与深度三角关系", "group": "几何运动与三维视觉", "keywords": ["视差与深度", "Z=bf/d", "三角测量", "视差误差", "深度误差"]},
        {"path": "/stereo-depth/block-matching", "label": "块匹配与视差图", "group": "几何运动与三维视觉", "keywords": ["块匹配", "视差图", "深度图", "SAD", "SSD", "NCC", "cost curve"]},
        {"path": "/multiview-reconstruction", "label": "多视图几何与三维重建", "group": "几何运动与三维视觉", "keywords": ["多视图几何", "三维重建", "sfm", "structure from motion", "mvg"]},
        {"path": "/multiview-reconstruction/epipolar-geometry", "label": "对极几何与基础矩阵", "group": "几何运动与三维视觉", "keywords": ["对极几何", "基础矩阵", "fundamental matrix", "epipolar", "极点极线"]},
        {"path": "/multiview-reconstruction/essential-pose", "label": "本质矩阵与相机位姿", "group": "几何运动与三维视觉", "keywords": ["本质矩阵", "相机位姿", "essential matrix", "camera pose", "旋转平移"]},
        {"path": "/multiview-reconstruction/triangulation", "label": "三角测量与稀疏点云", "group": "几何运动与三维视觉", "keywords": ["三角测量", "稀疏点云", "triangulation", "point cloud", "三维点"]},
        {"path": "/human-pose", "label": "人体姿态估计", "group": "几何运动与三维视觉", "keywords": ["人体姿态估计", "姿态估计", "human pose", "skeleton"]},
        {"path": "/human-pose/overview", "label": "姿态估计总览", "group": "几何运动与三维视觉", "keywords": ["姿态估计总览", "人体姿态", "overview", "姿态估计概述"]},
        {"path": "/human-pose/skeleton", "label": "关键点与骨架", "group": "几何运动与三维视觉", "keywords": ["关键点", "骨架", "skeleton", "keypoints", "关节"]},
        {"path": "/human-pose/mechanism", "label": "姿态估计机制", "group": "几何运动与三维视觉", "keywords": ["姿态估计机制", "pose mechanism", "人体检测", "姿态网络"]},
        {"path": "/human-pose/action", "label": "动作识别", "group": "几何运动与三维视觉", "keywords": ["动作识别", "action recognition", "行为识别", "动作分类"]},
        {"path": "/frontier", "label": "CV 前沿探索", "group": "前沿探索", "keywords": ["前沿", "前沿探索", "基础模型", "统一视觉模型", "clip", "dino", "sam", "vlm", "frontier"]},
        {"path": "/vision-transformer", "label": "Vision Transformer", "group": "前沿探索", "keywords": ["vision transformer", "vit", "dino", "自注意力", "transformer 视觉"]},
        {"path": "/vision-transformer/vit", "label": "Vision Transformer (ViT)", "group": "前沿探索", "keywords": ["vit", "vision transformer", "image patches", "cls token", "transformer 分类"]},
        {"path": "/vision-transformer/dino", "label": "DINO", "group": "前沿探索", "keywords": ["dino", "自监督学习", "自蒸馏", "vision transformer", "无监督"]},
        {"path": "/frontier/vit", "label": "Vision Transformer (ViT)", "group": "旧路径兼容", "keywords": ["vit", "vision transformer", "frontier vit", "旧路径"]},
        {"path": "/frontier/dino", "label": "DINO", "group": "旧路径兼容", "keywords": ["dino", "自监督", "frontier dino", "旧路径"]},
        {"path": "/frontier/clip", "label": "CLIP 图文对齐", "group": "图文对齐与视觉语言模型", "keywords": ["clip", "图文对齐", "contrastive", "embedding", "zero-shot", "相似度矩阵"]},
        {"path": "/frontier/vlm", "label": "VLM 视觉语言模型", "group": "图文对齐与视觉语言模型", "keywords": ["vlm", "视觉语言模型", "视觉问答", "image tokens", "prompt tokens", "cross-attention", "evidence"]},
        {"path": "/frontier/multimodal", "label": "多模态理解", "group": "图文对齐与视觉语言模型", "keywords": ["多模态", "multimodal", "ocr", "audio", "layout", "fusion", "grounding"]},
        {"path": "/generative-multimodal/sam", "label": "SAM", "group": "前沿探索", "keywords": ["sam", "segment anything", "提示分割", "promptable segmentation", "基础分割模型"]},
        {"path": "/generative-multimodal/gan", "label": "GAN", "group": "前沿探索", "keywords": ["gan", "生成对抗网络", "生成器", "判别器", "对抗训练"]},
        {"path": "/generative-multimodal/diffusion", "label": "Diffusion", "group": "前沿探索", "keywords": ["diffusion", "扩散模型", "去噪", "score matching", "生成模型"]},
        {"path": "/classification-lab", "label": "任务谱系（兼容入口）", "group": "旧路径兼容", "keywords": ["任务谱系", "classification lab", "overview"]},
        {"path": "/classification-lab/classification", "label": "图像分类实验（兼容入口）", "group": "旧路径兼容", "keywords": ["图像分类实验", "bovw", "cnn分类", "top-k", "visual words", "histogram"]},
        {"path": "/vision-tasks/segmentation-basic", "label": "图像分割与区域提取（旧路径）", "group": "旧路径兼容", "keywords": ["图像分割", "传统分割", "k-means", "graph cut", "segmentation"]},
        {"path": "/vision-tasks/detection", "label": "目标检测（旧路径）", "group": "旧路径兼容", "keywords": ["目标检测", "检测", "yolo", "iou", "nms", "r-cnn", "detection"]},
        {"path": "/vision-tasks/semantic", "label": "语义分割（旧路径）", "group": "旧路径兼容", "keywords": ["语义分割", "fcn", "segformer", "semantic"]},
        {"path": "/vision-tasks/instance", "label": "实例分割（旧路径）", "group": "旧路径兼容", "keywords": ["实例分割", "mask r-cnn", "yolo-seg", "instance"]},
        {"path": "/segmentation-basic/cluster", "label": "聚类分割", "group": "分割与识别任务", "keywords": ["聚类分割", "k-means", "rgb", "rgb xy", "cluster"]},
        {"path": "/segmentation-basic/graph", "label": "图模型与交互分割", "group": "分割与识别任务", "keywords": ["图模型分割", "交互分割", "graph cut", "ncut", "grabcut"]},
        {"path": "/segmentation-basic/region", "label": "区域分割与属性分析", "group": "分割与识别任务", "keywords": ["区域分割", "watershed", "区域属性", "label map", "bbox", "contour"]},
        {"path": "/object-detection/yolo", "label": "真实推理：YOLO 检测", "group": "分割与识别任务", "keywords": ["yolo", "onnx", "nms", "confidence", "iou", "candidate boxes"]},
        {"path": "/object-detection/rcnn", "label": "机制拆解：R-CNN 流程", "group": "分割与识别任务", "keywords": ["r-cnn", "fast r-cnn", "faster r-cnn", "rpn", "anchor", "roi pooling"]},
        {"path": "/segmentation-lab", "label": "语义 vs 实例", "group": "旧路径兼容", "keywords": ["语义 vs 实例", "semantic vs instance", "semantic mask", "instance mask", "输出结构对比"]},
        {"path": "/segmentation-lab/semantic", "label": "语义分割（兼容入口）", "group": "旧路径兼容", "keywords": ["语义分割", "semantic", "fcn", "segformer", "mIoU", "1x1 conv", "upsampling", "skip connection"]},
        {"path": "/segmentation-lab/instance", "label": "实例分割（兼容入口）", "group": "旧路径兼容", "keywords": ["实例分割", "instance", "mask r-cnn", "roi align", "mask head", "yolo-seg", "prototype mask"]},
        {"path": "/frontier/vision-banana", "label": "Vision Banana 案例", "group": "前沿探索", "keywords": ["vision banana", "banana", "图像生成器", "生成式视觉", "rgb输出", "统一生成式视觉接口"]},
        {"path": "/edge-detection/compare", "label": "边缘检测方法对比", "group": "边缘与特征结构", "keywords": ["方法对比", "边缘对比", "compare"]},
        {"path": "/edge-detection/kernel", "label": "局部卷积响应", "group": "边缘与特征结构", "keywords": ["局部卷积", "卷积响应", "kernel"]},
        {"path": "/edge-detection/canny", "label": "Canny 流水线", "group": "边缘与特征结构", "keywords": ["canny", "边缘检测", "双阈值"]},
        {"path": "/edge-detection/teed", "label": "深度边缘检测拓展", "group": "边缘与特征结构", "keywords": ["teed", "深度边缘"]},
        {"path": "/edge-detection/applications", "label": "边缘检测应用实践", "group": "边缘与特征结构", "keywords": ["应用", "实践", "边缘应用"]},
        {"path": "/feature-detection/compare", "label": "特征方法对比", "group": "边缘与特征结构", "keywords": ["特征对比", "方法对比", "compare"]},
        {"path": "/feature-detection/corner", "label": "角点检测", "group": "边缘与特征结构", "keywords": ["角点", "harris", "fast"]},
        {"path": "/feature-detection/sift", "label": "SIFT 特征", "group": "边缘与特征结构", "keywords": ["sift"]},
        {"path": "/feature-detection/matching", "label": "特征匹配", "group": "边缘与特征结构", "keywords": ["匹配", "特征匹配", "matching"]},
        {"path": "/feature-detection/panorama", "label": "图像拼接与全景拍照", "group": "边缘与特征结构", "keywords": ["全景", "拼接", "全景拍照", "panorama", "stitching"]},
    ]

    action_prompts = {
        "explain_algorithm": "请解释当前页面中的算法流程，结合当前参数和步骤，控制在 150 字以内。",
        "analyze_params": "请说明当前参数的作用，以及这些参数如何影响输出结果。",
        "diagnose_result": "请根据当前算法、参数和统计结果，分析可能的问题，如果可以，请直接动用 SET_PARAM 帮我修正到一个较为合适的参数，并在文字里解释。",
        "video_script": "请为当前页面生成一段 40 到 80 秒的视频讲解稿，突出算法流程和系统功能。",
        "report_text": "请为当前页面生成一段实验报告中的功能说明或结果分析文字，要求正式、技术化。",
    }

    def check_config_details():
        import os
        config_path = os.path.join(app.root_path, "compute_config.json")
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f).get("ai_assistant", {})
        except Exception:
            cfg = {}
        
        enabled = cfg.get("enabled", False)
        api_key = cfg.get("api_key", "")
        model = cfg.get("model", "")
        api_base = cfg.get("api_base", "")
        
        if enabled:
            missing = []
            if not api_key or api_key.strip() == "" or api_key.startswith("在此填写"):
                missing.append("api_key")
            if not model or model.strip() == "" or model.startswith("在此填写"):
                missing.append("model")
            if not api_base or api_base.strip() == "" or api_base.startswith("在此填写"):
                missing.append("api_base")
            if missing:
                return f"检测到 AI 助手配置不完整（未配置 {', '.join(missing)}）。请配置项目根目录下的 compute_config.json 文件并填入有效配置。"
            return None
        return "AI 助手未启用。请配置项目根目录下的 compute_config.json 文件，将 enabled 设为 true 并填入配置。"

    def build_navigation_candidates(question, context=None, limit=5):
        context = context or {}
        normalized_question = normalize_nav_text(question)
        current_path = normalize_nav_text(context.get("currentPath") or context.get("current_path") or "")
        current_page = normalize_nav_text(context.get("page") or context.get("algorithm") or "")

        scored = []
        for item in navigation_catalog:
            path = item["path"]
            score = 0
            normalized_path = normalize_nav_text(path)
            if normalized_path and normalized_path in normalized_question:
                score += 10
            for keyword in item["keywords"]:
                normalized_keyword = normalize_nav_text(keyword)
                if normalized_keyword and normalized_keyword in normalized_question:
                    score += 6 + min(len(normalized_keyword), 4)
            if current_path and current_path == normalized_path:
                score += 1
            if current_page and current_page in normalized_path:
                score += 1
            if score > 0:
                scored.append({"path": path, "label": item["label"], "score": score})

        if not scored:
            return []

        scored.sort(key=lambda item: (-item["score"], len(item["path"]), item["path"]))
        return scored[:limit]

    def get_dynamic_system_prompt():
        return """你是计算机视觉教学系统中的 AI 技术助理。
你需要结合当前页面上下文，解释算法、分析参数、诊断结果、生成简短讲解稿或报告描述。

【页面主动控制权】
我们为你打通了操纵用户本地页面的权限。在用户上下文中，你会看到 `controls` 字典，里面列出了当前页面中可以由你来操纵的各种旋钮、输入框和按钮的句柄（handle）。
当你诊断认为应该调整某个参数，或者想在页面高亮某个按钮让用户注意时，请把控制符单独放在一行：
- 如果你想帮用户把参数调整为某个数值：`[SET_PARAM: handle | 值]` （例如：[SET_PARAM: #edgeSigma | 1.8]）
- 如果你想高亮（闪烁）页面的某个控件以引起注意：`[HIGHLIGHT: handle]` （例如：[HIGHLIGHT: #threshold-input]）
- 如果你需要带用户跳出当前页面去学习某个新模块，只能使用 `context.navigation_candidates` 里给出的候选路径，不要自己猜路径。

【跳转规则】
1. 不要自己列举路由，不要猜测短路径，不要输出 URL 白名单。
2. 只能从 `context.navigation_candidates` 里选一个最合适的 path 作为 `[NAVIGATE: /path]`。
3. 如果 `context.navigation_candidates` 为空，就不要跳转，改为用自然语言建议用户先说明想学的方向。
4. 对“角点、特征与图像拼接 / 全景 / 图像拼接 / 全景拍照” 这类意图，优先使用 `/feature-detection/panorama`，不要输出 `/feature`、`/panorama` 或其它缩写路径。

【控制符使用绝对要求】
1. **绝对不要向用户说你能控制什么，不要复述 `controls` 字典、暴露 `handle` 或展示具体的跳转路径。用户不需要知道底层细节。**不要输出“当前可直接操作的控件”“可操控空间”“句柄列表”“控件清单”等标题或暴露命令语法。
2. 如果你要执行控制或跳转，就直接给出控制符并在正文里用自然语言说结果，例如“我已为您跳转到边缘检测模块”。不要在正文中点名具体元素、ID 或直接打印路径。
3. 控制符必须**100%完全独立占据一行**，**绝对不要**在行首或行尾加项目符号（如 `- `、`* `、`• `）、括号、解释文字、代码块。正确示例就是纯白板上一句 `[SET_PARAM: #xxxx | 12]` 或 `[NAVIGATE: /grayscale]`。
4. 系统会在后台静默吞掉这行并替你执行，所以你的回答里直接描述你干了啥即可。

回答要求：
1. 简洁、准确、偏技术说明。
2. 尽量使用页面控制权引导用户调参或跳转。
3. 不编造系统中不存在的 controls 句柄或未列出的跳转路径。
4. 优先结合上下文信息的 params、stats 和 controls。"""

    def call_bailian_model(question, context, action):
        ai_cfg = get_ai_config()
        if ai_cfg is None:
            diag = check_config_details()
            yield f"data: {json.dumps({'error': diag})}\n\n"
            return

        action_hint = action_prompts.get(action, "")
        user_prompt = action_hint + "\n" + question if action_hint else question
        nav_candidates = build_navigation_candidates(question, context)

        context_text = (
            f"当前模块: {context.get('module', 'unknown')}\n"
            f"当前页面: {context.get('page', 'unknown')}\n"
            f"当前算法: {context.get('algorithm', 'unknown')}\n"
            f"当前步骤: {context.get('step', 'unknown')}\n"
            f"参数: {json.dumps(context.get('params', {}), ensure_ascii=False)}\n"
            f"可操作句柄(controls): {json.dumps(context.get('controls', {}), ensure_ascii=False)}\n"
            f"统计: {json.dumps(context.get('stats', {}), ensure_ascii=False)}\n"
            f"预判导航候选(navigation_candidates): {json.dumps(nav_candidates, ensure_ascii=False) if nav_candidates else '[]'}"
        )

        image_data = context.get("selectedImage", "")
        if image_data:
            user_content = [
                {"type": "text", "text": f"【页面上下文】\n{context_text}\n\n【用户问题】\n{user_prompt}"},
                {"type": "image_url", "image_url": {"url": image_data}},
            ]
        else:
            user_content = f"【页面上下文】\n{context_text}\n\n【用户问题】\n{user_prompt}"

        messages = [
            {"role": "system", "content": get_dynamic_system_prompt()},
            {"role": "user", "content": user_content},
        ]

        payload = json.dumps({
            "model": ai_cfg["model"],
            "messages": messages,
            "temperature": ai_cfg.get("temperature", 0.1),
            "max_tokens": ai_cfg.get("max_tokens", 800),
            "stream": True,
        }).encode("utf-8")

        api_url = ai_cfg["api_base"].rstrip("/") + "/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ai_cfg['api_key']}",
            "Accept": "text/event-stream",
        }

        req = urllib.request.Request(api_url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                for line in resp:
                    line = line.decode("utf-8").strip()
                    if not line:
                        continue
                    if line == "data: [DONE]":
                        break
                    if line.startswith("data: "):
                        body = json.loads(line[6:])
                        choices = body.get("choices", [])
                        if choices:
                            chunk = choices[0].get("delta", {}).get("content", "")
                            if chunk:
                                yield f"data: {json.dumps({'content': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except urllib.error.HTTPError as exc:
            app.logger.warning("AI assistant HTTP error: %s", exc)
            diag = check_config_details()
            detail = f"（配置诊断：{diag}）" if diag else "请检查您的 api_key 和 model 是否配置正确。"
            yield f"data: {json.dumps({'error': f'模型服务返回错误 ({exc.code})。{detail}'})}\n\n"
        except urllib.error.URLError as exc:
            app.logger.warning("AI assistant URL error: %s", exc)
            diag = check_config_details()
            detail = f"（配置诊断：{diag}）" if diag else "请检查您的 api_base 或网络代理。"
            yield f"data: {json.dumps({'error': f'网络连接失败。{detail}'})}\n\n"
        except Exception:
            app.logger.exception("AI assistant unexpected error")
            yield f"data: {json.dumps({'error': 'AI 助手内部发生未知异常，请重试。'})}\n\n"

    @app.route("/api/ai-assistant", methods=["POST"])
    def ai_assistant_api():
        ai_cfg = get_ai_config()
        if ai_cfg is None:
            diag = check_config_details()
            return jsonify({
                "success": False,
                "message": diag,
            })

        data = request.get_json(silent=True) or {}
        question = (data.get("question") or "").strip()
        context = data.get("context", {})
        action = data.get("action", "free_chat")

        if not question and action == "free_chat":
            return jsonify({"success": False, "message": "请输入问题。"})

        if not question:
            question = action_prompts.get(action, "请简要说明当前页面内容。")

        return Response(call_bailian_model(question, context, action), mimetype="text/event-stream")
