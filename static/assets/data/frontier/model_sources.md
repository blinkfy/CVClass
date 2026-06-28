# 图文对齐与视觉语言模型：真实模型接入记录

## 已接入

- Runtime: `@huggingface/transformers@4.2.0`
- 运行位置: 浏览器端动态 `import()`，用户点击后才加载
- npm 许可证: Apache-2.0
- npm 包体积: `dist.unpackedSize = 9,536,375` bytes；当前 jsDelivr 入口响应约 `558,373` bytes
- 用途: 在 CLIP 页面运行 `zero-shot-image-classification`
- Fallback: CDN、Hub、WASM 或模型加载失败时，页面保留本地预设 512 维向量演示

## 已接入模型

- Model: `Xenova/clip-vit-base-patch32`
- 上游模型: `openai/clip-vit-base-patch32`
- 用途: CLIP zero-shot image classification
- 输入: 当前课程样例生成的 224x224 canvas PNG，以及英文候选标签 `dog/street/flower/classroom/food`
- 运行方式: Transformers.js pipeline 按需从 Hugging Face Hub 下载 ONNX 权重
- 观察到的关键资源大小:
  - `onnx/model_quantized.onnx`: `153,695,702` bytes
  - `onnx/vision_model_quantized.onnx`: `89,117,001` bytes
  - `tokenizer.json`: `2,224,119` bytes
- 注意: 实际下载文件由 Transformers.js 的模型解析策略、浏览器缓存和 Hub 响应决定，不能在课程页中硬假设固定下载集合

## 评估但未默认接入

- Model: `HuggingFaceTB/SmolVLM-256M-Instruct`
- License: Apache-2.0
- 能力: 图像+文本输入到文本输出，可用于图像描述、视觉问答和 OCR 类任务
- 未默认加载原因:
  - VLM 推理比 CLIP zero-shot 更重，首次加载会明显影响课程页体验
  - 浏览器侧稳定体验通常需要 WebGPU、缓存和更细的进度反馈
  - 当前 VLM 页面以过程动画、token 融合和证据高亮教学为主，真实 VLM 更适合后续做独立“实验模式”或服务器 API 接入

## 后续接入建议

1. 保持 CLIP 浏览器端运行，用真实模型输出补充教学矩阵，不替代主动画。
2. VLM 若要真实推理，优先做可关闭的实验面板，使用 WebGPU 检测和下载进度。
3. 如部署到服务器，可把 VLM 推理移到后端 API，前端只展示流式 token、证据区域和错误回退。
