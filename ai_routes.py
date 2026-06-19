import json
import re
import urllib.error
import urllib.request

from flask import Response, jsonify, request


def register_ai_routes(app, get_ai_config):
    def normalize_nav_text(text):
        return re.sub(r"\s+", "", (text or "")).lower()

    navigation_catalog = [
        {"path": "/knowledge-graph", "label": "知识图谱", "keywords": ["知识图谱", "知识库", "图谱", "关系图", "graph"]},
        {"path": "/grayscale", "label": "图像灰度化", "keywords": ["灰度", "灰度化", "黑白", "grayscale"]},
        {"path": "/convolution", "label": "卷积与滤波", "keywords": ["卷积", "卷积核", "滤波", "convolution"]},
        {"path": "/image-convolution", "label": "图像卷积应用", "keywords": ["图像卷积", "图片卷积", "卷积应用"]},
        {"path": "/digit-recognition", "label": "卷积模型应用", "keywords": ["手写数字", "数字识别", "mnist", "卷积模型"]},
        {"path": "/cnn-visualization", "label": "CNN 前向与反向传播", "keywords": ["cnn", "卷积神经网络", "前向", "反向", "特征图", "可视化"]},
        {"path": "/cnn-explainer", "label": "CNN 数据传播细节", "keywords": ["cnn解释", "cnn细节", "传播细节", "解释器"]},
        {"path": "/conv-gradient-lab", "label": "卷积梯度显微镜", "keywords": ["梯度", "反向传播", "卷积梯度", "显微镜"]},
        {"path": "/classification-lab", "label": "图像分类与任务谱系", "group": "视觉识别与分割", "keywords": ["图像分类", "任务谱系", "classification", "bovw", "spatial pyramid", "cnn", "top-k"]},
        {"path": "/classification-lab/classification", "label": "图像分类实验", "group": "视觉识别与分割", "keywords": ["图像分类实验", "bovw", "cnn分类", "top-k", "visual words", "histogram"]},
        {"path": "/segmentation-basic", "label": "图像分割与区域提取", "group": "视觉识别与分割", "keywords": ["图像分割", "区域提取", "k-means", "graph cut", "ncut", "watershed", "grabcut", "label map", "mask"]},
        {"path": "/segmentation-basic/cluster", "label": "聚类分割", "group": "视觉识别与分割", "keywords": ["聚类分割", "k-means", "rgb", "rgb xy", "cluster"]},
        {"path": "/segmentation-basic/graph", "label": "图模型与交互分割", "group": "视觉识别与分割", "keywords": ["图模型分割", "交互分割", "graph cut", "ncut", "grabcut"]},
        {"path": "/segmentation-basic/region", "label": "区域分割与属性分析", "group": "视觉识别与分割", "keywords": ["区域分割", "watershed", "区域属性", "label map", "bbox", "contour"]},
        {"path": "/object-detection", "label": "目标检测", "group": "视觉识别与分割", "keywords": ["目标检测", "bbox", "confidence", "iou", "nms", "yolo", "r-cnn", "rpn", "anchor", "roi pooling"]},
        {"path": "/object-detection/yolo", "label": "YOLO 推理与 NMS", "group": "视觉识别与分割", "keywords": ["yolo", "onnx", "nms", "confidence", "iou", "candidate boxes"]},
        {"path": "/object-detection/rcnn", "label": "R-CNN 系列机制", "group": "视觉识别与分割", "keywords": ["r-cnn", "fast r-cnn", "faster r-cnn", "rpn", "anchor", "roi pooling"]},
        {"path": "/segmentation-lab", "label": "语义 vs 实例", "group": "视觉识别与分割", "keywords": ["语义 vs 实例", "semantic vs instance", "semantic mask", "instance mask", "输出结构对比"]},
        {"path": "/segmentation-lab/semantic", "label": "语义分割", "group": "视觉识别与分割", "keywords": ["语义分割", "semantic", "fcn", "segformer", "mIoU", "1x1 conv", "upsampling", "skip connection"]},
        {"path": "/segmentation-lab/instance", "label": "实例分割", "group": "视觉识别与分割", "keywords": ["实例分割", "instance", "mask r-cnn", "roi align", "mask head", "yolo-seg", "prototype mask"]},
        {"path": "/vision-tasks/overview", "label": "视觉任务谱系（旧路径）", "group": "视觉识别与分割", "keywords": ["高级视觉", "视觉任务", "vision tasks", "任务谱系", "总览"]},
        {"path": "/vision-tasks/classification", "label": "图像分类（旧路径）", "group": "视觉识别与分割", "keywords": ["图像分类", "分类", "classification", "bovw", "cnn"]},
        {"path": "/vision-tasks/segmentation-basic", "label": "传统图像分割（旧路径）", "group": "视觉识别与分割", "keywords": ["图像分割", "传统分割", "k-means", "graph cut", "segmentation"]},
        {"path": "/vision-tasks/semantic", "label": "语义分割（旧路径）", "group": "视觉识别与分割", "keywords": ["语义分割", "fcn", "segformer", "semantic"]},
        {"path": "/vision-tasks/detection", "label": "目标检测（旧路径）", "group": "视觉识别与分割", "keywords": ["目标检测", "检测", "yolo", "iou", "nms", "r-cnn", "detection"]},
        {"path": "/vision-tasks/instance", "label": "实例分割（旧路径）", "group": "视觉识别与分割", "keywords": ["实例分割", "mask r-cnn", "yolo-seg", "instance"]},
        {"path": "/frontier", "label": "CV 前沿探索", "keywords": ["前沿", "前沿探索", "基础模型", "统一视觉模型", "clip", "dino", "sam", "vlm", "frontier"]},
        {"path": "/frontier/vision-banana", "label": "Vision Banana 案例", "keywords": ["vision banana", "banana", "图像生成器", "生成式视觉", "rgb输出", "统一生成式视觉接口"]},
        {"path": "/edge-detection", "label": "边缘、轮廓与形态学", "keywords": ["边缘", "轮廓", "形态学", "edge"]},
        {"path": "/edge-detection/compare", "label": "边缘检测方法对比", "keywords": ["方法对比", "边缘对比", "compare"]},
        {"path": "/edge-detection/kernel", "label": "局部卷积响应", "keywords": ["局部卷积", "卷积响应", "kernel"]},
        {"path": "/edge-detection/canny", "label": "Canny 流水线", "keywords": ["canny", "边缘检测", "双阈值"]},
        {"path": "/edge-detection/teed", "label": "深度边缘检测拓展", "keywords": ["teed", "深度边缘"]},
        {"path": "/edge-detection/applications", "label": "边缘检测应用实践", "keywords": ["应用", "实践", "边缘应用"]},
        {"path": "/feature-detection", "label": "角点、特征与图像拼接", "keywords": ["角点", "特征", "图像拼接", "全景", "拼接"]},
        {"path": "/feature-detection/compare", "label": "特征方法对比", "keywords": ["特征对比", "方法对比", "compare"]},
        {"path": "/feature-detection/corner", "label": "角点检测", "keywords": ["角点", "harris", "fast"]},
        {"path": "/feature-detection/sift", "label": "SIFT 特征", "keywords": ["sift"]},
        {"path": "/feature-detection/matching", "label": "特征匹配", "keywords": ["匹配", "特征匹配", "matching"]},
        {"path": "/feature-detection/panorama", "label": "图像拼接与全景拍照", "keywords": ["全景", "拼接", "全景拍照", "panorama", "stitching"]},
    ]

    action_prompts = {
        "explain_algorithm": "请解释当前页面中的算法流程，结合当前参数和步骤，控制在 150 字以内。",
        "analyze_params": "请说明当前参数的作用，以及这些参数如何影响输出结果。",
        "diagnose_result": "请根据当前算法、参数和统计结果，分析可能的问题，如果可以，请直接动用 SET_PARAM 帮我修正到一个较为合适的参数，并在文字里解释。",
        "video_script": "请为当前页面生成一段 40 到 80 秒的视频讲解稿，突出算法流程和系统功能。",
        "report_text": "请为当前页面生成一段实验报告中的功能说明或结果分析文字，要求正式、技术化。",
    }

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
        return """你是计算机视觉实验系统中的 AI 技术助理。
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
            yield f"data: {json.dumps({'error': 'AI 助手未启用，请在 compute_config.json 中配置 ai_assistant。'})}\n\n"
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
            yield f"data: {json.dumps({'error': f'模型服务返回错误 ({exc.code})，请检查 api_key 和 model 配置。'})}\n\n"
        except urllib.error.URLError as exc:
            app.logger.warning("AI assistant URL error: %s", exc)
            yield f"data: {json.dumps({'error': '无法连接模型服务，请检查 api_base 配置和网络。'})}\n\n"
        except Exception:
            app.logger.exception("AI assistant unexpected error")
            yield f"data: {json.dumps({'error': 'AI 助手内部错误，请稍后重试。'})}\n\n"

    @app.route("/api/ai-assistant", methods=["POST"])
    def ai_assistant_api():
        ai_cfg = get_ai_config()
        if ai_cfg is None:
            return jsonify({
                "success": False,
                "message": "AI 助手未启用，请在 compute_config.json 中配置 ai_assistant。",
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
