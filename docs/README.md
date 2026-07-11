# CVClass GitHub Pages 静态版

`docs/` 根目录可直接作为 `main /docs` 的 GitHub Pages 发布源。项目站点前缀固定为 `/CVClass`，入口是 `https://blinkfy.github.io/CVClass/`，不要使用 `/CVClass/index`。

## 构建与预览

```powershell
python docs/build_github_pages.py --base-path /CVClass
python docs/serve_static.py --port 8001
```

访问 `http://127.0.0.1:8001/CVClass/`；访问本地根路径时预览服务器也会自动跳转到该地址。

在 GitHub 仓库的 `Settings → Pages` 中选择 `Deploy from a branch`、`main`、`/docs`。`.nojekyll` 已包含在发布根目录中。

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
- GitHub Pages 版本约 363 MiB，最大单文件约 25 MiB，符合 GitHub Pages 与普通 Git 文件限制。
- 不能把原项目的 `compute_config.json` 或任何服务端密钥复制到静态目录。

### SDXS 在 GitHub Pages 上的边界

完整 SDXS 版本约 1.23 GiB，UNet 与 Text Encoder 分别约 658 MiB、235 MiB。GitHub 普通仓库拒绝超过 100 MiB 的单文件，Pages 发布站点也不能超过 1 GiB，因此 `docs/` 版本明确使用教学模式，不把两个 ONNX 文件提交到 GitHub。

教学动画、参数、预设样例和其余课程不受影响。若要在公网启用真实 SDXS，应把大模型放在支持大文件与 CORS 的对象存储或模型托管服务中，再将浏览器模型地址指向该服务；不要直接提交到 GitHub Pages。

## 目录

- `build_github_pages.py`：生成 `/CVClass` 前缀的 Pages 版本、提升到 `docs/` 根目录并检查 GitHub 大小限制。
- `build_static.py`：底层静态导出与自检，由 Pages 构建器调用。
- `static_ai_assistant.js`：部署版浏览器 AI 助手源文件。
- `serve_static.py`：支持 `/CVClass` 前缀并带正确 WASM、ES module 和 HLS MIME 的本地预览服务器。
- `.nojekyll`：要求 GitHub Pages 直接发布静态文件，不经过 Jekyll 处理。
