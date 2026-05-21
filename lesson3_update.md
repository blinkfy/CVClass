# 第三节 CNN 前向与反向传播可视化实验更新说明

## 1. 新增功能列表

- 新增 `/cnn-visualization` 页面路由。
- 新增第三节入口：侧边栏和实验首页均可进入。
- 新增四个 Tab：模型总览、前向传播、反向传播、模型应用。
- 新增固定教学 CNN：`6×6 → Conv 3×3 → ReLU → MaxPool → Flatten → FC 4→3 → Softmax → Loss`。
- 新增前端逐步前向传播：Conv 滑窗、ReLU、Pool、Flatten、FC、Softmax、Loss。
- 新增前端逐步反向传播：dlogits、dWfc、dflat、dPool、dA、dZ、dK 累加、dbConv。
- 新增参数更新展示：显示学习率、梯度和更新前后对比。
- 新增模型应用入口：跳转到已有 `/digit-recognition` 手写数字识别模块。

## 2. 对应课程知识点

- CNN 层级结构和张量尺寸变化。
- 卷积层局部感受野和滑窗乘加计算。
- ReLU 非线性激活及其梯度 mask。
- MaxPool 前向取最大值与反向梯度路由。
- Flatten 在二维特征和一维向量之间的形状转换。
- 全连接层矩阵乘法与权重梯度。
- Softmax 与 Cross Entropy 的组合梯度。
- 梯度下降参数更新。

## 3. 与第一节、第二节的区别

第一节关注图像作为像素矩阵的基础处理，例如灰度化、通道分离、二值化和直方图均衡化。

第二节关注卷积算子本身，展示 padding、stride、dilation、多通道、多卷积核和不同卷积结构的前向计算。

第三节关注 CNN 训练链路，把卷积、激活、池化、全连接、Softmax 和 Loss 串成一个小模型，并重点解释反向传播和参数如何更新。

## 4. 反向传播计算展示说明

反向传播 Tab 按以下顺序展示：

1. `dlogits = probs - onehot(label)`。
2. `dWfc[i,j] = flat[i] × dlogits[j]`，同时展示 `dbfc` 和 `dflat`。
3. `dflat` reshape 回 `2×2 dPool`。
4. MaxPool 只把梯度传回前向最大值所在位置，其余位置为 0。
5. ReLU 使用 `1(Z > 0)` mask，`Z <= 0` 的位置梯度置 0。
6. Conv 梯度逐步累加：`contribution(i,j) = patch(i,j) × dZ[i,j]`，`dK = Σ contribution(i,j)`。
7. `db_conv = Σ dZ[i,j]`。

页面会在右侧公式区显示公式与数值代入，在底部计算详情区显示当前 patch、当前上游梯度、当前 contribution 和累计 `dK`。

## 5. 参数更新展示说明

参数更新使用学习率 `lr`，默认 `0.1`：

```text
K_new = K_old - lr × dK
Wfc_new = Wfc_old - lr × dWfc
b_new = b_old - lr × db
```

点击“更新参数”后，页面展示卷积核和全连接权重的更新前后对比，例如：

```text
0.20 → 0.16
-0.10 → -0.08
```

更新后会清空旧的前向缓存，下一次前向传播将基于新参数重新计算。

## 6. 视频演示建议步骤

1. 从首页进入“第三节 CNN 前向与反向传播可视化”。
2. 在“模型总览”中依次点击 Conv、ReLU、MaxPool、FC、Softmax、Loss，讲解尺寸变化。
3. 切到“前向传播”，点击“下一步”展示第一个卷积输出位置的 patch、kernel、逐元素乘积和 `sum + bias`。
4. 点击“执行完整前向”，观察 ReLU、Pool、Flatten、FC、Softmax 和 Loss 的结果。
5. 切到“反向传播”，逐步讲解 `dlogits = probs - y` 和 FC 权重梯度。
6. 继续展示 MaxPool 梯度只回传到最大值位置、ReLU mask 阻断负数位置梯度。
7. 在 Conv 梯度步骤中多次点击“下一步”，观察 `dK` 如何逐步累加。
8. 点击“更新参数”，展示 `K_old → K_new` 和 `Wfc_old → Wfc_new`。
9. 切到“模型应用”，跳转到手写数字识别页面，说明真实 CNN 分类应用与小 CNN 教学模型的关系。
