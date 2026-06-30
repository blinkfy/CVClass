# Cvtoolkits

> AI之眼重点页现在使用 torchvision 官方预训练模型实现目标检测、语义分割和实例分割。权重不提交到仓库；运行 `python prepare_ai_eye_assets.py --list` 查看缓存状态，运行 `python prepare_ai_eye_assets.py --all` 准备全部可切换模型。详细说明见 [docs/AI_EYE_SETUP.md](docs/AI_EYE_SETUP.md)。

# 计算机视觉通识教育系统 — Cvtoolkits

## 项目简介

一个**沉浸式计算机视觉算法可视化通识教育平台**。让对 CV 完全不懂的人，通过视觉化的交互探索，直观理解每个算法从输入到输出的完整流程。

核心理念：**零黑盒、直觉优先、纯手写算法**。

---

## 环境要求

### 必需

| 依赖 | 最低版本 | 用途 |
|---|---|---|
| Python | 3.10+ | 后端计算服务 |
| Node.js | 18+ | 字体安装（npm） |
| pip | 23+ | Python 包管理 |

### 操作系统

- Windows 10/11（主要开发与测试平台）
- macOS 13+ / Linux（理论兼容，未经测试）

### 浏览器

- Chrome 90+ / Edge 90+ / Firefox 90+
- 需支持 CSS Grid、CSS Variables、backdrop-filter、WebP 图像格式

---

## 安装步骤

### 1. 克隆项目

```bash
git clone <repo-url> cv_comprehensive
cd cv_comprehensive
```

### 2. 创建 Python 虚拟环境（推荐）

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 3. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

`requirements.txt` 内容：

```
flask>=2.3.0
flask-cors>=4.0.0
numpy>=1.24.0
imageio>=2.31.0
Pillow>=10.0.0
torch>=2.0.0
torchvision>=0.15.0
transformers>=4.30.0
timm>=0.9.0
segment-anything>=1.0
```

> **注意**：不依赖 OpenCV (cv2) 或 scikit-image。所有算法均使用纯 NumPy 手写实现。
> 深度学习与基础模型页面会使用 PyTorch/torchvision/transformers/segment-anything 运行真实预训练模型；权重大文件不提交到仓库。

准备 AI之眼 torchvision 权重：

```bash
python prepare_ai_eye_assets.py --list
python prepare_ai_eye_assets.py --all
```

准备 ViT / DETR / CLIP / SAM 相关资产：

```bash
python prepare_foundation_assets.py --list
python prepare_foundation_assets.py --all-hf
python prepare_foundation_assets.py --download-sam
```

### 4. 安装字体（Node.js 方式）

项目使用 Noto Sans SC 作为界面字体。字体文件通过 npm 管理，安装后自动复制到 `static/fonts/`。

```bash
npm install
```

此命令会：
1. 下载 `@fontsource/noto-sans-sc` 到 `node_modules/`
2. 自动运行 `postinstall` 脚本，将简体中文 woff2 字体文件复制到 `static/fonts/`

> 如果无法运行 npm（如未安装 Node.js），可手动下载 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)，将 `.ttf` 文件放入 `static/fonts/` 目录，并修改 `static/css/main.css` 中的 `@font-face` 路径。

### 5. 验证安装

```bash
# 启动 Flask 开发服务器
python run.py
```

打开浏览器访问 [http://localhost:5000](http://localhost:5000)，应看到：
- 顶部导航栏显示 "Cvtoolkits · 计算机视觉通识教育"
- 搜索框
- 5 个阶段的算法地铁图（阶段一 ~ 阶段五）
- 页面上方「算法模块」显示 **77**，「已可体验」显示 24+

### 6. 启动命令参考

```bash
# 开发模式（默认 5000 端口，debug 模式）
python run.py

# 指定端口
python run.py --port 8080

# 生产模式
flask run --host=0.0.0.0 --port=5000
```

---

## 项目结构

```
cv_comprehensive/
├── run.py                         # Flask 启动入口
├── config.py                      # 全局配置
├── requirements.txt               # Python 依赖
├── package.json                   # npm 依赖（字体）
├── package-lock.json              # npm 锁文件
│
├── app/                           # 后端
│   ├── __init__.py                # Flask 应用工厂
│   ├── routes.py                  # 路由中枢
│   └── modules/                   # 算法模块（32 个已注册）
│       ├── base.py                # AlgorithmModule 基类
│       ├── phase1_fundamentals/   # 阶段一：基础原语 (5个)
│       ├── phase2_classical/      # 阶段二：经典特征检测 (6个)
│       ├── phase3_intermediate/   # 阶段三：中级视觉 (8个)
│       ├── phase4_deep_learning/  # 阶段四：深度学习时代 (7个)
│       └── phase5_frontier/       # 阶段五：前沿论文算法 (6个)
│
├── static/                        # 前端静态资源
│   ├── css/
│   │   └── main.css               # 全局样式表
│   ├── js/
│   │   ├── app.js                 # 主应用逻辑（Metro Map + 蓝图）
│   │   ├── router.js              # Hash 路由器
│   │   └── utils.js               # 纯函数工具集
│   ├── fonts/                     # 字体文件（npm install 生成, gitignored）
│   ├── pages/                     # 各算法模块的 HTML 页面
│   └── uploads/                   # 用户上传图片
│
├── templates/
│   └── index.html                 # SPA 外壳（Jinja2 模板）
│
└── docs/
    ├── ARCHITECTURE.md            # 总体架构设计文档
    ├── ASSIGNMENT_REQUIREMENTS.md # 作业要求
    └── coverage_gap_analysis.md   # Hands-on-CV 覆盖分析
```

---

## 算法覆盖范围

共规划 **77 个** 算法模块，分 5 个阶段。当前已实现 **24 个**（有算法核心代码），其余为已注册骨架待开发。

| 阶段 | 规划数 | 已实现 | 说明 |
|---|---|---|---|
| 阶段一 · 基础原语 | 9 | 4 | 色彩空间、直方图、阈值化、卷积等 |
| 阶段二 · 经典特征检测 | 9 | 6 | Canny、Harris、SIFT、Hough、形态学、轮廓等 |
| 阶段三 · 中级视觉 | 14 | 8 | 分割、传统识别、运动估计、几何视觉 |
| 阶段四 · 深度学习时代 | 9 | 6 | CNN、ResNet、FCN、GAN、扩散模型等 |
| 阶段五 · 基础模型与前沿感知 | 36 | 0 | ViT、DETR、SAM、NeRF、Diffusion 家族等 |

详细规划见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 第六节。

---

## 技术栈

### 前端

| 层面 | 选型 | 约束 |
|---|---|---|
| 框架 | **无框架** — 原生 HTML/CSS/JS | 禁止 React/Vue 等 |
| 样式 | CSS Grid + CSS Variables | 无预处理器 |
| 可视化 | Canvas 2D API + SVG | 禁止 ECharts/D3.js |
| 字体 | Noto Sans SC（自托管 woff2） | 免费开源 |

### 后端

| 层面 | 选型 | 约束 |
|---|---|---|
| Web 框架 | Flask 3.x + Flask-CORS | 同步模型 |
| 算法计算 | **纯 NumPy** 手写 | 禁止 OpenCV / scikit-image |
| 图像 I/O | imageio（读取）+ Pillow（编码） | — |
| 模块发现 | importlib + `__init_subclass__` | 零配置注册 |

---

## 常见问题

### Q: 启动后页面空白？

- 检查 Flask 是否正常启动（终端应显示 `Running on http://127.0.0.1:5000`）
- 打开浏览器开发者工具（F12）→ Console 查看是否有 JS 错误
- 确认 `npm install` 已运行（字体文件是否存在 `static/fonts/`）

### Q: 字体显示为默认宋体？

- 运行 `npm install`，确认 `static/fonts/` 下有 9 个 `.woff2` 文件
- 如果 npm 不可用，手动从 [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+SC) 下载，将 `*.ttf` 放入 `static/fonts/`，并修改 `main.css` 中 `@font-face` 的 `url()` 路径

### Q: 某些算法卡片点击后提示"尚未实现"？

- 该算法处于规划阶段，后端模块骨架已注册但算法核心代码尚未编写
- 已实现的算法卡片左侧有绿色边框和 ✓ 标记

### Q: 如何添加新算法模块？

1. 在对应阶段目录下创建 `{module_id}/` 文件夹
2. 编写 `__init__.py`（继承 `AlgorithmModule`）
3. 编写 `algorithm.py`（纯 NumPy 实现）
4. 可选：编写 `processor.py`（流水线构建器）
5. 重启 Flask，模块自动注册

### Q: 如何运行单元测试？

```bash
python -m pytest app/modules/
```

---

## 许可与致谢

- 算法实现参考：`Hands-on-CV` 课程讲义、经典论文原始公式
- 字体：Noto Sans SC — SIL Open Font License 1.1
- 项目为课程作业用途
