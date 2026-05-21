# 基础图像处理扩展功能说明

以图像灰度化为核心实验，在此基础上增加若干基础图像处理功能。所有新增算法均由 NumPy 手动实现，不使用 OpenCV。

## 新增功能列表

- RGB 通道分离
- 图像二值化
- 颜色反转
- 水平翻转
- 垂直翻转
- 逆时针旋转 90 度
- 灰度直方图均衡化

## 实现方法

后端读取上传图像，并转换为 RGBA 数组。NumPy 负责所有像素级运算，alpha 透明度通道会尽量保留，避免 PNG 等透明图片处理后丢失透明背景。

前端使用原生 HTML、CSS、JavaScript 提供上传、参数选择、请求发送、结果展示、下载和处理记录功能。

## 核心 NumPy 代码

RGB 通道分离：

```python
result = np.zeros_like(rgba_array)
result[:, :, channel_index] = rgba_array[:, :, channel_index]
result[:, :, 3] = rgba_array[:, :, 3]
```

图像二值化：

```python
binary_array = np.where(gray_array >= threshold, 255, 0).astype(np.uint8)
```

颜色反转：

```python
result = rgba_array.copy()
result[:, :, :3] = 255 - result[:, :, :3]
```

水平翻转和垂直翻转：

```python
horizontal = rgba_array[:, ::-1, :]
vertical = rgba_array[::-1, :, :]
```

逆时针旋转 90 度：

```python
result = np.rot90(rgba_array, k=1)
```

灰度直方图均衡化：

```python
histogram = np.bincount(gray_array.ravel(), minlength=256)
cdf = histogram.cumsum()
mapping = np.round((cdf - cdf_min) / (total_pixels - cdf_min) * 255)
equalized = mapping[gray_array]
```

## 与计算机视觉课程的关系

这些功能覆盖了计算机视觉入门实验中常见的像素级处理任务：颜色空间理解、通道操作、阈值分割、几何变换、灰度统计和对比度增强。项目保留灰度化作为主线，再扩展基础处理算子，便于在课程展示中说明图像本质上是矩阵，图像处理可以通过 NumPy 数组运算完成。这些东西在之前的数字图像处理课程中已经学过了，因此在这里补充应用上了。

## 第二节：卷积原理可视化扩展

第二节新增“卷积计算过程可视化系统”，用于展示卷积神经网络中局部感受野、卷积核滑动、padding、stride、dilation、多通道融合和多卷积核输出的关系。

核心实现位于 `static/convolution.js`，主要包含：

- `generateMatrix(rows, cols, min, max)`：生成随机输入矩阵，卷积实验中默认范围为 0-255。
- `generateKernel(size, min, max)`：生成随机卷积核。
- `addPadding(matrix, padding)`：在输入矩阵外围补 0。
- `getOutputSize(inputSize, kernelSize, stride, padding, dilation)`：计算输出尺寸和 effectiveK。
- `conv2dSingleChannel(...)`：实现单通道二维卷积。
- `conv2dMultiChannel(...)`：实现多通道 partial sum 相加。
- `convWithMultipleKernels(...)`：实现多个卷积核对应多个 Feature Map。
- `getCurrentWindow(...)`：返回当前卷积窗口采样位置。
- `renderMatrix(...)`：渲染矩阵、padding、采样点和输出高亮。
- `renderSnakePath(...)`：渲染蛇形卷积弯曲路径采样顺序，非路径点不参与计算。

卷积可视化模块完全在前端使用原生 JavaScript 完成，没有引入 React、Vue 等大型框架。矩阵使用 HTML grid 渲染，便于显示每个具体数值和高亮每一步计算过程。单通道矩阵按灰度显示数值强度，三通道输入按 R/G/B 通道颜色显示；dilation 控件只在空洞卷积中显示和启用。

## 第三节：CNN 前向与反向传播可视化扩展

第三节新增固定小 CNN 教学页面，访问地址为 `/cnn-visualization`。该页面使用原生 JavaScript 在前端完成 6×6 输入、3×3 卷积、ReLU、MaxPool、Flatten、FC、Softmax、Cross Entropy Loss、反向传播和参数更新的数值演示。

与第二节不同，第三节不追求多通道或大规模真实训练，而是把每一步梯度计算拆开显示：`dlogits = probs - y`、`dWfc = flat × dlogits`、MaxPool 梯度路由、ReLU mask、卷积核梯度 `dK` 逐步累加以及 `K_new = K_old - lr × dK` 参数更新。该页面用于课程录屏中解释 CNN 为什么能训练，以及梯度如何从 Loss 回传到卷积核。
