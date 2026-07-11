# CVClass 纯静态版

本目录是与原 Flask 项目隔离的静态版本。构建过程只读取上级目录，所有生成结果都写入 `static_site/site/`。

## 构建与预览

```powershell
python static_site/build_static.py
python static_site/serve_static.py --port 8000
```

访问 `http://127.0.0.1:8000/`。部署到子目录时先指定前缀，例如：

```powershell
python static_site/build_static.py --base-path /CVClass
```

然后把 `static_site/site/` 的内容部署到对应的 `/CVClass` 路径。

## 静态 AI 助手

AI 助手不包含服务端，也不包含预置密钥。首次打开助手会显示设置对话框，用户自行填写：

- OpenAI-compatible Base URL，例如 `https://example.com/v1`
- API Key
- Model Name

Base URL 和模型名保存在 `localStorage`。API Key 默认只保存在当前标签会话的 `sessionStorage`；用户主动勾选“在此浏览器记住 Key”后才保存到 `localStorage`。

浏览器会直接请求 `{Base URL}/chat/completions`，因此所选服务必须允许当前站点的 CORS 请求。公开或不受信任的电脑上不要保存 Key。若供应商不允许浏览器 CORS，应使用自行部署的兼容代理作为 Base URL。

## 部署要求

- 使用 HTTP(S) 静态服务器，不能直接双击 `file://` 打开。
- `.wasm` 应返回 `application/wasm`，`.mjs` 应返回 JavaScript MIME。
- `.m3u8` 与 `.ts` 应分别配置 HLS 播放列表和 MPEG-TS MIME。
- 当前完整 SDXS 构建约 1.23 GiB；未带可选权重的教学构建约 363 MiB。模型按需加载，建议对版本化资源启用长期缓存。
- 不能把原项目的 `compute_config.json` 或任何服务端密钥复制到静态目录。

### 可选 SDXS 真实文生图模型

当前交付的 `static_site/model-assets/` 与 `site/` 已包含完整浏览器 ONNX，`build-manifest.json` 中应显示 `sdxs_mode: full-browser-inference`。

仓库的 `static/` 目录没有包含浏览器可直接执行的 SDXS UNet 与 Text Encoder ONNX，但本机 Hugging Face 缓存可能已有原始 `.safetensors` 参数。构建器需要两个浏览器 ONNX 文件；未提供时会明确进入“教学演示”模式，禁用真实生成按钮且不会产生 404。

若本机已缓存 `IDKiro/sdxs-512-dreamshaper`，可在具备 PyTorch、Diffusers 与 ONNX 工具的环境中执行一次转换：

```powershell
python static_site/export_cached_sdxs.py
python static_site/build_static.py
```

转换器会自动查找 Hugging Face snapshot，并仅将生成结果写入 `static_site/model-assets/`，不会修改原项目或缓存参数。

如果已经有完整的浏览器 ONNX 模型目录，也可以直接指定它，无需先复制：

```powershell
python static_site/build_static.py --sdxs-model-dir 'F:\path\to\sdxs-512-dreamshaper'
```

如需启用完整浏览器端真实生成，将下列两个文件放入后重新构建：

```text
static_site/model-assets/sdxs-512-dreamshaper/unet/model.fp16.onnx
static_site/model-assets/sdxs-512-dreamshaper/text_encoder/model.fp16.onnx
```

构建器会校验两者必须同时存在，并把它们加入最终 `site/`。

## 目录

- `build_static.py`：静态导出、隔离复制和自检。
- `static_ai_assistant.js`：部署版浏览器 AI 助手源文件。
- `serve_static.py`：带正确 WASM、ES module 和 HLS MIME 的本地预览服务器。
- `site/`：可直接部署的最终产物。
- `review-stage/`：构建与审查证据。
