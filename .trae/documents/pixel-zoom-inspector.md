# 像素放大镜（Pixel Zoom Inspector）实现计划

## Summary

在侧边栏「图像基础」下新增独立子页面 `/pixel-zoom`：导入图片后可连续放大（关闭平滑插值，放大后呈现一个一个像素方块），可开启像素网格；辅助信息展示图像分辨率、像素总数等，鼠标移动时实时显示该像素的坐标、RGB、CMYK、Hex 与色块预览。纯前端 Canvas 实现，无后端改动。

## Current State Analysis

- Flask 应用：[page_routes.py](file:///f:/projects/CVClass/page_routes.py) 集中注册页面路由，模板在 `templates/pages/`，配套 `static/css/pages/` 与 `static/js/pages/`。
- [base.html](file:///f:/projects/CVClass/templates/base.html) 侧边栏中「图像基础」（grayscale）目前是单链接、无 subnav；其他模块（卷积、边缘等）均有 `sidebar-subnav` 子导航结构可参考。
- 示例图已有：`static/assets/img/lena_color_512.png`、`peppers_color.png`、`mandril_color.png`、`bangkok_traffic.jpg`。
- `window.cvclassUrl()`（[base.js](file:///f:/projects/CVClass/static/js/core/base.js)）处理部署前缀，示例图加载参考 [grayscale.js](file:///f:/projects/CVClass/static/js/pages/grayscale.js) 的 fetch→File 模式。
- 站点视觉风格：暗色、紧凑三栏、station hero（参考 grayscale.html 的 station01-* 类）。

## Proposed Changes

### 1. [page_routes.py](file:///f:/projects/CVClass/page_routes.py) — 新增路由

在 `/grayscale` 路由之后添加：

```python
@app.route("/pixel-zoom", methods=["GET"])
def pixel_zoom_page():
    return render_template("pages/pixel_zoom.html", active_page="pixel_zoom")
```

### 2. [base.html](file:///f:/projects/CVClass/templates/base.html) — 侧边栏加 subnav

「图像基础」条目改为带 `sidebar-subnav` 的组（参考卷积模块写法）：

- 主链接「图像基础」→ `grayscale_page`（active: `active_page == 'grayscale'`）
- 子项「图像处理实验」→ `grayscale_page`
- 子项「像素放大镜」→ `pixel_zoom_page`（active: `active_page == 'pixel_zoom'`）

### 3. `templates/pages/pixel_zoom.html` — 新建页面

结构（沿用 station 风格，紧凑三栏）：

- Hero：eyebrow `STATION 01 · PIXEL ZOOM INSPECTOR`，标题「像素放大镜：放大到像素级」，badge `ZOOM · GRID · RGB · CMYK`。
- 左栏（输入与视图控制）：
  1. 上传图片：drop-zone + file input（点击/拖拽），支持 JPG/PNG/BMP；
  2. 示例图条（Lena / Peppers / Mandril / Bangkok），页面打开后自动加载 Lena（遵循用户"打开即自动执行"偏好）；
  3. 视图控制：缩放滑块（0.25x–64x）、放大/缩小/适应窗口/重置按钮、像素网格开关（默认开）、像素高亮开关。
- 中栏（舞台）：
  - 顶部状态条：分辨率 `W × H`、当前缩放倍率、像素总数、格式、文件大小；
  - `<canvas>` 主舞台（含空状态提示），底部一行极简操作提示（滚轮缩放 · 拖拽平移 · 双击复位）。
- 右栏（信息面板）：
  - 像素探针卡：大色块 swatch、坐标 `(x, y)`、`R G B` 数值 + 分量条、`C M Y K` 百分比 + 分量条、Hex、Gray 亮度；
  - 图像信息卡：文件名、尺寸、总像素、格式、文件大小。

### 4. `static/css/pages/pixel_zoom.css` — 新建样式

- 复用 `core/base.css` 变量与 grayscale 页的卡片/面板风格（独立前缀 `pz-*`，避免与 station01 冲突）；
- 舞台 canvas 容器固定圆角边框，空状态覆盖层；右栏探针分量条与色块样式。

### 5. `static/js/pages/pixel_zoom.js` — 新建核心逻辑

- 状态：`img`、`W/H`、缓存 `ImageData`（加载后离屏 canvas `getImageData` 一次性取像素数组）、`scale`、`offset{x,y}`、开关位、`dpr`。
- 渲染（rAF + dirty 标记）：
  - `imageSmoothingEnabled = scale < 1`（缩小时平滑抗锯齿；放大后关闭 → 方块效果的关键）；
  - `drawImage(img, ox, oy, W*scale, H*scale)`；
  - `scale >= 8` 且网格开：仅绘制视口内的整数像素网格线（间距 = scale px）；
  - `scale >= 2` 且鼠标在图内：描边高亮当前像素格。
- 交互：
  - wheel：以鼠标为锚点缩放（`scale *= exp(-deltaY*k)`，clamp 0.25–64），同步更新 offset；
  - pointer 拖拽平移；双击复位到 fit；按钮/滑块联动缩放；
  - `mousemove`：反算图像坐标 `px = floor((mx-ox)/scale)`，越界显示 `-`；从缓存像素数组读 RGBA。
- CMYK 换算：`r'=R/255…`，`K = 1 - max(r',g',b')`，`K≈1` 时 `C=M=Y=0`，否则 `C=(1-r'-K)/(1-K)` 等，显示为百分比。
- fit 逻辑：`scale = min(stageW/W, stageH/H) * 0.95` 居中；窗口 resize 重算重绘。

## Assumptions & Decisions

- 位置：独立子页面（用户已确认），路由 `/pixel-zoom`，归入「图像基础」subnav。
- 纯前端实现，不新增后端 API；上传用 FileReader 本地解码。
- 自动加载默认示例 Lena 512×512（符合用户"打开即自动执行"偏好）。
- 放大上限 64x，足够呈现明显方块；网格在 ≥8x 自动可用（可开关）。
- 不修改 `templates/pages/home.html` 模块卡片（保持最小改动）；`docs/` 静态版由用户后续运行 `docs/build_static.py` 自动生成，本次不动。

## Verification

1. `python app.py` 启动，访问 `/pixel-zoom`：页面正常渲染，自动加载 Lena，状态条显示 512 × 512。
2. 滚轮连续放大：>1x 后无平滑插值，出现方块；≥8x 网格线出现；当前像素格高亮。
3. 鼠标移动：右栏坐标/RGB/CMYK/Hex/色块实时更新；纯红像素处验证 CMYK ≈ C0 M100 Y100 K0；移出画布显示 `-`。
4. 拖拽平移、双击复位、按钮与滑块联动正常；缩放不越界（0.25–64）。
5. 上传本地图片（拖拽 + 点击两种方式）与切换示例图均正常；侧边栏「像素放大镜」高亮正确；原 `/grayscale` 页面不受影响。
