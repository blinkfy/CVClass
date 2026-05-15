import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from mycnn import MyCNN
train=pd.read_csv("models/train.csv")
train_X=train.drop(['label'],axis=1)
train_y=train['label']
classes=np.unique(train_y)# 标签编码
class_dict=dict(zip(classes,range(len(classes))))
Y_int=train_y.map(class_dict)
train_y=np.eye(len(classes))[Y_int]
train_X=train_X/255.0
train_X=train_X.values.reshape(-1,1,28,28)
X_train,X_test,y_train,y_test=train_test_split(train_X,train_y,test_size=0.1,random_state=42)
X_train,X_val,y_train,y_val=train_test_split(X_train, y_train,test_size=0.1,random_state=42)
print(f"训练集大小: {X_train.shape}")
print(f"验证集大小: {X_val.shape}")
print(f"测试集大小: {X_test.shape}")
model=MyCNN.model()
print("开始训练...")
history=model.train(
    X_train=X_train,y_train=y_train,
    X_val=X_val,y_val=y_val,
    batch_size=64,epochs=3,learning_rate=0.01)
print("在测试集上评估模型...")
test_loss,test_acc=model.evaluate(X_test,y_test)
print(f"测试集上的损失: {test_loss:.4f}, 准确率: {test_acc:.4f}")
weight_path = "models/numpy_mnist_cnn.npz"
model.save_params(weight_path)
print(f"模型参数已保存到: {weight_path}")
# 可视化训练历史
history_fig = plt.figure(figsize=(12, 4))
plt.subplot(1, 2, 1)
plt.plot(history['train_loss'], label='train_loss')
plt.plot(history['val_loss'], label='val_loss')
plt.title('Loss')
plt.legend()

plt.subplot(1, 2, 2)
plt.plot(history['train_acc'], label='train_acc')
plt.plot(history['val_acc'], label='val_acc')
plt.title('Accuracy')
plt.legend()
plt.tight_layout()
history_fig.savefig('models/training_history.png', dpi=160)
plt.show()
plt.close(history_fig)
num_samples=5
indices = np.random.choice(len(y_test), num_samples, replace=False)
X_samples=X_test[indices]
y_samples=y_test[indices]

predictions = model.predict(X_samples)
y_samples_labels = np.argmax(y_samples, axis=1)

prediction_fig = plt.figure(figsize=(15, 3))
for i in range(num_samples):
    plt.subplot(1, num_samples, i+1)
    plt.imshow(X_samples[i, 0], cmap='gray', vmin=0, vmax=1)
    plt.title(f"True: {y_samples_labels[i]}\nPred: {predictions[i]}")
    plt.axis('off')
plt.tight_layout()
prediction_fig.savefig('models/predictions.png', dpi=160)
plt.show()
plt.close(prediction_fig)