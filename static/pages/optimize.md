以下是针对您提供的 Canny 边缘检测算法进行的极致性能优化版本。优化核心思路包括：**可分离卷积**、**避免逐像素循环**、**预计算常量**、**最小化内存分配**以及**类型控制**。所有实现均严格基于 `numpy`，未调用其他任何库。

```python
import numpy as np
from app.utils.image_utils import ensure_uint8
from numpy.lib.stride_tricks import sliding_window_view

# ========== 常量预计算 ==========
# 灰度转换权重 (float32)
_GRAY_WEIGHTS = np.array([0.299, 0.587, 0.114], dtype=np.float32)

# 高斯平滑 1D 核（5x5，sigma=1.4，已归一化）
_GAUSS_1D = np.array([0.1201, 0.2339, 0.2921, 0.2339, 0.1201], dtype=np.float32)

# Sobel 可分离核
_SOBEL_SMOOTH_V = np.array([1, 2, 1], dtype=np.float32)   # 垂直平滑
_SOBEL_DIFF_H   = np.array([1, 0, -1], dtype=np.float32)  # 水平差分
_SOBEL_DIFF_V   = np.array([-1, 0, 1], dtype=np.float32)  # 垂直差分
_SOBEL_SMOOTH_H = np.array([1, 2, 1], dtype=np.float32)   # 水平平滑


def to_gray(img):
    """RGB转灰度，保持uint8。"""
    if img.ndim == 2:
        return ensure_uint8(img)
    img = ensure_uint8(img)
    gray = np.dot(img[..., :3], _GRAY_WEIGHTS)
    np.round(gray, out=gray)
    return gray.astype(np.uint8)


def bi(img, threshold):
    """二值化，阈值以上为255，否则0。"""
    arr = np.asarray(img, dtype=np.uint8)
    mask = arr >= threshold
    out = np.zeros_like(arr, dtype=np.uint8)
    out[mask] = 255
    return out


def conv(mat, ker):
    """通用2D卷积（保留用于兼容，实际流程未使用）。"""
    kh, kw = ker.shape
    ph, pw = kh // 2, kw // 2
    mat = np.asarray(mat, dtype=np.float32)
    padded = np.pad(mat, ((ph, ph), (pw, pw)), mode='edge')
    views = sliding_window_view(padded, window_shape=(kh, kw))
    res = np.sum(views * ker, axis=(2, 3))
    return res


# ---------- 可分离卷积核心 ----------
def _conv2d_separable(mat, v_kernel, h_kernel):
    """
    利用可分离性加速2D卷积：先垂直方向，再水平方向。
    输入 mat 为2D数组，自动转为float32；输出 float32。
    """
    mat = np.asarray(mat, dtype=np.float32)

    # 垂直卷积
    k_v = len(v_kernel)
    pad_v = k_v // 2
    padded = np.pad(mat, ((pad_v, pad_v), (0, 0)), mode='edge')
    # window shape: (k_v, 1) -> 输出形状 (H_out, W, k_v, 1)
    windows_v = sliding_window_view(padded, (k_v, 1))
    vert = np.sum(windows_v * v_kernel.reshape(1, 1, k_v, 1), axis=(2, 3))

    # 水平卷积
    k_h = len(h_kernel)
    pad_h = k_h // 2
    padded2 = np.pad(vert, ((0, 0), (pad_h, pad_h)), mode='edge')
    windows_h = sliding_window_view(padded2, (1, k_h))
    horiz = np.sum(windows_h * h_kernel.reshape(1, 1, 1, k_h), axis=(2, 3))
    return horiz


# ---------- 高斯模糊 (可分离) ----------
def _gauss_blur(img):
    """用可分离5x1核进行高斯平滑（等效于5x5）。"""
    return _conv2d_separable(img, _GAUSS_1D, _GAUSS_1D)


# ---------- Sobel 梯度 (可分离) ----------
def sobel(img):
    """
    可分离 Sobel：Sx = 垂直平滑(1,2,1) 后接 水平差分(1,0,-1)
                  Sy = 垂直差分(-1,0,1) 后接 水平平滑(1,2,1)
    返回 sx, sy, norm, ang (norm为梯度幅值，ang为角度，单位度)
    """
    sx = _conv2d_separable(img, _SOBEL_SMOOTH_V, _SOBEL_DIFF_H)
    sy = _conv2d_separable(img, _SOBEL_DIFF_V, _SOBEL_SMOOTH_H)
    norm = np.sqrt(sx * sx + sy * sy)
    ang = np.rad2deg(np.arctan2(sy, sx))
    return sx, sy, norm, ang


# ---------- 非极大值抑制 ----------
def nms(norm, ang):
    h, w = norm.shape
    out = np.zeros((h, w), dtype=np.float32)

    # 角度映射到四个方向
    ang_mod = ang % 180
    dirs = np.zeros((h, w), dtype=np.uint8)
    dirs[(ang_mod < 22.5) | (ang_mod >= 157.5)] = 0           # 水平
    dirs[(ang_mod >= 22.5) & (ang_mod < 67.5)] = 1            # 45°
    dirs[(ang_mod >= 67.5) & (ang_mod < 112.5)] = 2           # 垂直
    dirs[(ang_mod >= 112.5) & (ang_mod < 157.5)] = 3          # 135°

    # 四个方向的邻域偏移
    offsets = [
        (0, ( 0, -1), ( 0,  1)),   # 水平
        (1, (-1,  1), ( 1, -1)),   # 45°
        (2, (-1,  0), ( 1,  0)),   # 垂直
        (3, (-1, -1), ( 1,  1))    # 135°
    ]

    # 对每个方向向量化处理
    for d, (dy1, dx1), (dy2, dx2) in offsets:
        mask = dirs[1:-1, 1:-1] == d
        center = norm[1:-1, 1:-1]
        n1 = norm[1+dy1 : h-1+dy1, 1+dx1 : w-1+dx1]
        n2 = norm[1+dy2 : h-1+dy2, 1+dx2 : w-1+dx2]
        keep = (center >= n1) & (center >= n2) & mask
        out[1:-1, 1:-1][keep] = center[keep]

    return out


# ---------- 双阈值滞后边缘追踪 (形态学重建替代DFS) ----------
def link_edges(img, low, high):
    """
    基于二值形态学膨胀的快速边缘连接。
    等价于：所有与强边缘8邻域连通的弱边缘被保留。
    """
    strong = img >= high
    weak = (img >= low) & (img < high)
    mask = strong | weak                     # 候选边缘

    # 使用3x3全1核进行膨胀（代表8连通）
    # 迭代直到不再变化
    while True:
        padded = np.pad(strong, 1, mode='constant')          # 边界填0
        windows = sliding_window_view(padded, (3, 3))
        dilated = np.any(windows, axis=(2, 3))              # 膨胀
        new_strong = dilated & mask
        if np.array_equal(strong, new_strong):
            break
        strong = new_strong

    return (strong * 255).astype(np.uint8)


# ---------- 辅助函数 ----------
def _positive_to_uint8(img):
    """将浮点图像映射到0-255 uint8（用于显示梯度幅值）。"""
    arr = np.asarray(img, dtype=np.float32)
    max_val = arr.max() if arr.size else 0.0
    if max_val <= 1e-8:
        return np.zeros(arr.shape, dtype=np.uint8)
    normalized = arr / max_val
    scaled = normalized * 255
    return scaled.clip(0, 255).astype(np.uint8)


# ---------- 对外接口 ----------
def i_sobel(img, threshold=80):
    """Sobel 边缘检测（仅二值化幅值）。"""
    gray = to_gray(img)
    _, _, norm, _ = sobel(gray)
    norm = _positive_to_uint8(norm)
    return bi(norm, threshold)


def i_canny(img, low=50, high=150):
    """Canny 边缘检测。"""
    gray = to_gray(img)
    blur = _gauss_blur(gray)      # 可分离高斯
    _, _, norm, ang = sobel(blur) # 可分离 Sobel
    sup = nms(norm, ang)
    return link_edges(sup, low, high)
```

### 核心优化说明

1. **可分离卷积替代通用2D卷积**
   - 高斯核与Sobel核均可分解为两个一维核的外积，利用 `_conv2d_separable` 将 `O(k²)` 的计算量降为 `O(2k)`，并大幅减少内存读取。
   - 高斯平滑由5×5核变为两次5×1卷积，Sobel由3×3变为两次3×1卷积。

2. **滞后阈值改用形态学膨胀**
   - 原 `link_edges` 使用Python列表模拟DFS，对每个像素逐个入栈处理，速度极慢。
   - 新实现基于迭代二值膨胀：反复用 `sliding_window_view` + `np.any` 模拟8邻域膨胀，每次处理整张图，收敛极快（通常2~5次迭代）。

3. **减少不必要类型转换与内存分配**
   - 所有卷积内部统一使用 `float32`，避免 `float64` 带来的双倍内存和计算开销。
   - `bi` 函数用预分配零数组+布尔赋值代替 `np.where`，减少临时数组。
   - 预计算所有卷积核和灰度权重为模块级常量，避免运行时重复生成。

4. **保留原接口与功能**
   - 所有函数签名未变，`conv` 保留以维持代码兼容性，实际流程已绕过。
   - 行为与原实现完全一致（包括边界 `edge` 填充、角度计算方式等）。

该优化版本在典型图像（如1MP以上）上可获得 **5~10倍** 的速度提升，且内存占用显著降低。

### 实测修正

后面实际跑 benchmark 之后，我把这版结论修了一下：**可分离卷积这个方向是稳的，但形态学膨胀替代 DFS 不能无脑说更快**。

原因在 `link_edges`。DFS 栈版本虽然在 Python 层 `append/pop`，但它只沿着候选边缘走，访问规模更接近“边缘像素数”。形态学版本每一轮都对整张图做一次 3×3 膨胀，单轮是向量化没错，但轮数取决于最长弱边缘连通路径。截图、UI 图这种长细线很多的图片，弱边缘链条可能拉得很长，形态学版本就会跑一百多轮甚至更多。

所以我最后把优化版拆成两个策略：

```python
i_canny(img, low=50, high=150, link_mode="stack")  # 默认：可分离卷积 + 栈连接
i_canny_morph(img, low=50, high=150)               # 对照：可分离卷积 + 形态学连接
```

真正稳定的优化点是前半段：

1. 高斯 5×5 拆成 5×1 + 1×5。
2. Sobel 3×3 拆成 `[1,2,1]` 平滑和 `[-1,0,1]` 差分。
3. 灰度权重、Gaussian 1D 核、Sobel 1D 核全部模块级预计算。
4. 中间数组统一 `float32`，不让 NumPy 默认飘到 `float64`。

形态学连接保留，但只作为对照策略。它在短连通路径、强边缘比较密的图上可能快；在长弱边缘链条上会慢。这里不能固定写“通常 2~5 次迭代”，也不能直接承诺“5~10倍”。最后的第三个 tab 用实际图片跑出来的数据说话。
