import numpy as np
from numba import njit, prange
def pad_input(x,padding):
    if padding == 0:
        return x
    return np.pad(x,((0,0),(0,0),(padding,padding), (padding,padding)),mode='constant')

@njit(parallel=True)#前面这里并行计算是AI写的，后面串行的是我的
def conv_forward_numba(x_padded, weights, bias, stride, H_out, W_out, out):
    N, C, H_p, W_p = x_padded.shape
    Co, _, ks, _ = weights.shape
    for n in prange(N):
        for co in prange(Co):
            for i in range(H_out):
                for j in range(W_out):
                    h = i * stride
                    w = j * stride
                    # 直接索引已填充数组，无需 np.pad
                    patch = x_padded[n, :, h:h+ks, w:w+ks]
                    out[n, co, i, j] = np.sum(patch * weights[co]) + bias[co]
    return out
@njit(parallel=True)
def conv_backward_numba(dout, x_padded, weights, stride, H_out, W_out, dx_padded, dw, db):
    N, C, H_p, W_p = x_padded.shape
    Co, _, ks, _ = weights.shape
    for n in prange(N):
        for co in prange(Co):
            for i in range(H_out):
                for j in range(W_out):
                    h0 = i * stride
                    w0 = j * stride
                    coeff = dout[n, co, i, j]   # 缩短访问路径
                    db[co] += coeff              # 直接累加 bias
                    # 对每个输入通道和卷积核位置做累加
                    for ch in range(C):
                        for kh in range(ks):
                            for kw in range(ks):
                                val = x_padded[n, ch, h0+kh, w0+kw]
                                dw[co, ch, kh, kw] += val * coeff
                                dx_padded[n, ch, h0+kh, w0+kw] += weights[co, ch, kh, kw] * coeff
    return dx_padded, dw, db

from numba import njit, prange
import numpy as np


@njit(parallel=True)
def conv_backward_numba_safe(dout, x_padded, weights, stride, H_out, W_out, dx_padded, dw, db):
    """安全版卷积反向传播。
    避免多个线程同时累加同一个 dw/db/dx 位置。
    dout:      [N, Co, H_out, W_out]
    x_padded:  [N, C, H_p, W_p]
    weights:   [Co, C, ks, ks]
    dx_padded: [N, C, H_p, W_p]
    dw:        [Co, C, ks, ks]
    db:        [Co]"""
    N, C, H_p, W_p = x_padded.shape
    Co, _, ks, _ = weights.shape

    # 1. 计算 db
    # 每个 co 独立，不会写冲突
    for co in prange(Co):
        s = 0.0
        for n in range(N):
            for i in range(H_out):
                for j in range(W_out):
                    s += dout[n, co, i, j]
        db[co] = s

    # 2. 计算 dw
    # 每个 (co, ch, kh, kw) 独立，不会写冲突
    total_w = Co * C * ks * ks
    for idx in prange(total_w):
        kw = idx % ks
        tmp = idx // ks
        kh = tmp % ks
        tmp = tmp // ks
        ch = tmp % C
        co = tmp // C
        s = 0.0
        for n in range(N):
            for i in range(H_out):
                h0 = i * stride + kh
                for j in range(W_out):
                    w0 = j * stride + kw
                    s += x_padded[n, ch, h0, w0] * dout[n, co, i, j]
        dw[co, ch, kh, kw] = s

    # 3. 计算 dx_padded
    # 每个 (n, ch, hp, wp) 独立，不会写冲突
    total_x = N * C * H_p * W_p
    for idx in prange(total_x):
        wp = idx % W_p
        tmp = idx // W_p
        hp = tmp % H_p
        tmp = tmp // H_p
        ch = tmp % C
        n = tmp // C
        s = 0.0
        for co in range(Co):
            for kh in range(ks):
                ih = hp - kh
                if ih % stride != 0:
                    continue
                i = ih // stride
                if i < 0 or i >= H_out:
                    continue
                for kw in range(ks):
                    jw = wp - kw
                    if jw % stride != 0:
                        continue
                    j = jw // stride
                    if j < 0 or j >= W_out:
                        continue
                    s += dout[n, co, i, j] * weights[co, ch, kh, kw]
        dx_padded[n, ch, hp, wp] = s
    return dx_padded, dw, db

class ConvLayer:
    def __init__(self,in_channels,out_channels,kernel_size,stride=1,padding=0):
        self.in_channels=in_channels
        self.out_channels=out_channels
        self.kernel_size=kernel_size
        self.stride=stride
        self.padding=padding
        
        #按照He初始化方法初始化权重
        self.weights=np.random.randn(
            out_channels,in_channels,
            kernel_size,kernel_size
        )*np.sqrt(2./(in_channels*kernel_size*kernel_size))
        self.bias=np.zeros(out_channels)
        
        self.x=None
        self.output_shape=None
        # 最近一次反向传播产生的梯度，用于训练轨迹与可视化导出
        self.last_dw=None
        self.last_db=None
        self.last_dx=None

    def forward(self,x):
        """x: 形状为 [N, C, H, W] 的输入，其中: N - 批量大小 C - 通道数 H - 高度 W - 宽度"""
        self.x=x#保存输入用于反向传播
        N,C,H,W=x.shape
        
        H_out=(H+2*self.padding-self.kernel_size)//self.stride+1
        W_out=(W+2*self.padding-self.kernel_size)//self.stride+1
        self.output_shape=(N,self.out_channels,H_out,W_out)
        
        out=np.zeros(self.output_shape)
        if self.padding>0:
            x_padded = np.pad(x,((0,0),(0,0),(self.padding,self.padding),(self.padding,self.padding)),'constant')
            x_padded = pad_input(x, self.padding)
        else:
            x_padded=x
        #执行卷积操作
        out=conv_forward_numba(x_padded,self.weights,self.bias,self.stride,H_out,W_out,out)
        # for n in range(N):                    # 遍历所有样本
        #     for c_out in range(self.out_channels):  # 遍历所有输出通道
        #         for h in range(H_out):        # 遍历输出的高度
        #             for w in range(W_out):    # 遍历输出的宽度
        #                 # 计算当前卷积窗口的位置
        #                 h_start=h*self.stride
        #                 h_end=h_start+self.kernel_size
        #                 w_start=w*self.stride
        #                 w_end=w_start+self.kernel_size
        #                 x_window=x_padded[n,:,h_start:h_end,w_start:w_end]# 提取当前窗口
                        
        #                 # 计算卷积
        #                 out[n,c_out,h,w]=np.sum(x_window*self.weights[c_out])+self.bias[c_out]
        return out
    
    def backward(self,dout,learning_rate):
        """ dout: 输出对应的梯度 [N, out_channels, H_out, W_out]
        返回输入对应的梯度 [N, C, H, W]"""
        N,C,H,W=self.x.shape
        N,out_C,H_out,W_out=dout.shape
        
        dx=np.zeros_like(self.x)
        dw=np.zeros_like(self.weights)
        db=np.zeros_like(self.bias)
        
        if self.padding>0:
            x_padded=np.pad(self.x,((0,0),(0,0),(self.padding,self.padding),(self.padding,self.padding)),'constant')
            dx_padded=np.zeros_like(x_padded)
        else:
            x_padded=self.x
            dx_padded=np.zeros_like(x_padded)
        
        #偏置的梯度
        # for c_out in range(self.out_channels):
        #     db[c_out]=np.sum(dout[:,c_out,:,:])
        #权重和输入的梯度
        dx_padded,dw,db=conv_backward_numba_safe(dout,x_padded,self.weights,self.stride,H_out,W_out,dx_padded,dw,db)
        # for n in range(N):
        #     for c_out in range(self.out_channels):
        #         for h in range(H_out):
        #             for w in range(W_out):
        #                 h_start=h*self.stride
        #                 h_end=h_start+self.kernel_size
        #                 w_start=w*self.stride
        #                 w_end=w_start+self.kernel_size
                        
        #                 # 计算权重的梯度
        #                 dw[c_out]+=x_padded[n,:,h_start:h_end,w_start:w_end]*dout[n,c_out,h,w]
                        
        #                 # 计算输入的梯度
        #                 dx_padded[n,:,h_start:h_end, w_start:w_end]+=self.weights[c_out]*dout[n,c_out,h,w]
        
        if self.padding>0:#去除填充部分
            dx=dx_padded[:,:,self.padding:-self.padding,self.padding:-self.padding]
        else:
            dx=dx_padded

        # 保存梯度副本，供训练轨迹、PCA、梯度范数和前端可视化使用
        self.last_dw=dw.copy()
        self.last_db=db.copy()
        self.last_dx=dx.copy()

        self.weights-=learning_rate*dw
        self.bias-=learning_rate*db
        return dx
class ReLU:
    def __init__(self):
        self.mask=None
    
    def forward(self,x):
        """大于0的值保持不变，小于0的值变为0"""
        self.mask=(x<=0)
        out=x.copy()
        out[self.mask]=0
        return out
    
    def backward(self,dout,learning_rate=None):
        dx=dout.copy()
        dx[self.mask]=0
        self.last_dx=dx
        return dx
    
@njit(parallel=True)
def _pool_forward_numba(x, pool_size, stride, out, max_idx):
    N, C, H, W = x.shape
    H_out = out.shape[2]
    W_out = out.shape[3]

    for n in prange(N):
        for c in prange(C):
            for i in range(H_out):
                for j in range(W_out):
                    h0 = i * stride
                    w0 = j * stride
                    # 手动扫描池化窗口
                    best = -1e9
                    best_h = 0
                    best_w = 0
                    for ph in range(pool_size):
                        for pw in range(pool_size):
                            val = x[n, c, h0 + ph, w0 + pw]
                            if val > best:
                                best = val
                                best_h = ph
                                best_w = pw

                    out[n, c, i, j] = best
                    max_idx[n, c, i, j, 0] = best_h
                    max_idx[n, c, i, j, 1] = best_w

    return out, max_idx
@njit(parallel=True)
def _pool_backward_numba(dout, max_idx, pool_size, stride, H, W, dx):
    N, C, H_out, W_out = dout.shape
    for n in prange(N):
        for c in prange(C):
            for i in range(H_out):
                for j in range(W_out):
                    # 窗口左上角
                    h0 = i * stride
                    w0 = j * stride
                    # 在 forward 时记录的窗口内最大值位置
                    ph = max_idx[n, c, i, j, 0]
                    pw = max_idx[n, c, i, j, 1]
                    # 将梯度累加到对应位置
                    dx[n, c, h0 + ph, w0 + pw] += dout[n, c, i, j]
    return dx
class MaxPooling:
    def __init__(self,pool_size=2,stride=2):
        """pool_size: 池化窗口大小 ; stride: 步长"""
        self.pool_size=pool_size
        self.stride=stride
        self.x=None
        self.max_indices=None
    
    def forward(self,x):
        """x: 形状为 [N, C, H, W] 的输入"""
        self.x=x
        N,C,H,W=x.shape
        H_out=(H-self.pool_size)//self.stride+1
        W_out=(W-self.pool_size)//self.stride+1
        
        out=np.zeros((N,C,H_out,W_out))
        self.max_indices=np.zeros((N,C,H_out,W_out,2),dtype=int)
        out,self.max_indices=_pool_forward_numba(x,self.pool_size,self.stride,out,self.max_indices)
        # for n in range(N):
        #     for c in range(C):
        #         for h in range(H_out):
        #             for w in range(W_out):
        #                 h_start=h*self.stride
        #                 h_end=h_start+self.pool_size
        #                 w_start=w*self.stride
        #                 w_end=w_start+self.pool_size
                        
        #                 # 提取当前窗口
        #                 x_window=x[n,c,h_start:h_end,w_start:w_end]
                        
        #                 # 找到最大值和其索引
        #                 max_value=np.max(x_window)
        #                 max_idx=np.unravel_index(np.argmax(x_window),x_window.shape)
                        
        #                 out[n,c,h,w] = max_value
        #                 # 保存最大值在原窗口中的相对位置
        #                 self.max_indices[n,c,h,w]=max_idx
        return out
    
    def backward(self,dout,learning_rate=None):
        """dout: 输出对应的梯度 [N, C, H_out, W_out]
           返回输入对应的梯度 [N, C, H, W]"""
        N,C,H,W=self.x.shape
        _,_,H_out,W_out=dout.shape
        
        # 初始化输入的梯度
        dx = np.zeros_like(self.x)
        max_idx = self.max_indices  # 已在 forward 中生成
        dx=_pool_backward_numba(dout,max_idx,self.pool_size,self.stride,H,W,dx)
        # for n in range(N):
        #     for c in range(C):
        #         for h in range(H_out):
        #             for w in range(W_out):
        #                 h_start=h*self.stride
        #                 h_end=h_start+self.pool_size
        #                 w_start=w*self.stride
        #                 w_end=w_start+self.pool_size
                        
        #                 # 获取最大值的索引
        #                 max_h,max_w=self.max_indices[n,c,h,w]
                        
        #                 # 将梯度传递给最大值对应的位置
        #                 dx[n,c,h_start+max_h,w_start+max_w]+=dout[n,c,h,w]
        return dx

class FullyConnected:
    def __init__(self,input_size,output_size):
        """input_size: 输入大小
           output_size: 输出大小"""
        self.weights=np.random.randn(input_size,output_size)*np.sqrt(2.0/input_size)
        self.bias=np.zeros(output_size)
        self.x=None
        self.original_shape=None
        # 最近一次反向传播产生的梯度，用于训练轨迹与可视化导出
        self.last_dw=None
        self.last_db=None
        self.last_dx=None
    
    def forward(self,x):
        """ x: 输入数据 [N, C, H, W] 或 [N, D]
            返回全连接层的输出 [N, output_size]"""
        self.original_shape=x.shape
        if len(x.shape)>2:# 如果输入是多维的，则展平
            N=x.shape[0]
            x_flat=x.reshape(N,-1)
        else:
            x_flat=x
        self.x=x_flat
        out=np.dot(x_flat,self.weights)+self.bias
        return out
    
    def backward(self,dout,learning_rate):
        """ dout: 输出对应的梯度 [N, output_size]
            learning_rate: 学习率
            返回输入对应的梯度，与输入形状相同"""
        dx=np.dot(dout,self.weights.T)
        dw=np.dot(self.x.T,dout)
        db=np.sum(dout,axis=0)

        # 保存梯度副本，供训练轨迹、PCA、梯度范数和前端可视化使用
        self.last_dw=dw.copy()
        self.last_db=db.copy()
        self.last_dx=dx.copy()

        self.weights-=learning_rate*dw
        self.bias-=learning_rate*db
        if len(self.original_shape) > 2:
            dx=dx.reshape(self.original_shape)
        return dx

class SoftmaxWithCrossEntropy:
    def __init__(self):
        self.y_pred=None
        self.y_true=None
    
    def forward(self,x,y_true):
        """ x: 模型输出 [N, num_classes]
            y_true: 真实标签 [N,] (类别索引) 或 [N, num_classes] (one-hot编码)"""
        if len(y_true.shape)==1:# 将y_true转换为one-hot编码
            batch_size=y_true.shape[0]
            num_classes=x.shape[1]
            y_true_one_hot=np.zeros((batch_size,num_classes))
            y_true_one_hot[np.arange(batch_size),y_true]=1
            self.y_true=y_true_one_hot
        else:
            self.y_true=y_true
        
        #softmax
        x_shifted=x-np.max(x, axis=1, keepdims=True)
        exp_scores=np.exp(x_shifted)
        self.y_pred=exp_scores/np.sum(exp_scores,axis=1,keepdims=True)
        #交叉熵损失
        N=x.shape[0]
        loss=-np.sum(self.y_true*np.log(self.y_pred+1e-8))/N
        return loss
    
    def backward(self,learning_rate=None):
        """计算softmax交叉熵的梯度"""
        N = self.y_pred.shape[0]
        dx = (self.y_pred - self.y_true)/N
        self.last_dx=dx.copy()
        return dx

class MyCNN:
    def __init__(self,layers=None):
        """初始化CNN模型的各个层"""
        self.layers=layers
        self.loss_fn=SoftmaxWithCrossEntropy()
    
    def model():
        model=MyCNN([ConvLayer(in_channels=1,out_channels=32,kernel_size=3,stride=1,padding=1),
            ReLU(),MaxPooling(pool_size=2,stride=2),  # 输出: 14x14x32
            ConvLayer(in_channels=32,out_channels=64,kernel_size=3,stride=1,padding=1),
            ReLU(),MaxPooling(pool_size=2,stride=2),  # 输出: 7x7x64
            FullyConnected(input_size=49*64,output_size=128),
            ReLU(),FullyConnected(input_size=128,output_size=10)])
        return model
    
    def forward(self,x,y=None):
        for lay in self.layers:
            x=lay.forward(x)
        if y is not None:
            loss=self.loss_fn.forward(x,y)
            return loss,x
        return x
    
    def backward(self,learning_rate=0.01,return_stats=False):
        dout=self.loss_fn.backward()
        for lay in reversed(self.layers):
            if lay.__class__==ConvLayer or lay.__class__==FullyConnected:
                dout=lay.backward(dout,learning_rate)
            else:
                dout=lay.backward(dout)
        if return_stats:
            return self.gradient_stats(learning_rate)
        return None

    def trainable_layers(self):
        """返回所有含可学习参数的层，格式为 [(layer_index, name, layer), ...]。"""
        names={0:'conv1',3:'conv2',6:'fc1',8:'fc2'}
        result=[]
        for idx,layer in enumerate(self.layers):
            if isinstance(layer,(ConvLayer,FullyConnected)):
                result.append((idx,names.get(idx,f'layer{idx}'),layer))
        return result

    def parameter_vector(self,scope='all'):
        """将指定范围的参数展平成一维向量。scope 可取 all/conv1/conv2/fc1/fc2。"""
        parts=[]
        for idx,name,layer in self.trainable_layers():
            if scope!='all' and scope!=name and scope!=f'layer{idx}':
                continue
            parts.append(layer.weights.ravel())
            parts.append(layer.bias.ravel())
        if not parts:
            return np.array([],dtype=np.float32)
        return np.concatenate(parts).astype(np.float32)

    def gradient_vector(self,scope='all'):
        """将最近一次反向传播得到的参数梯度展平成一维向量。"""
        parts=[]
        for idx,name,layer in self.trainable_layers():
            if scope!='all' and scope!=name and scope!=f'layer{idx}':
                continue
            if layer.last_dw is None or layer.last_db is None:
                continue
            parts.append(layer.last_dw.ravel())
            parts.append(layer.last_db.ravel())
        if not parts:
            return np.array([],dtype=np.float32)
        return np.concatenate(parts).astype(np.float32)

    def gradient_stats(self,learning_rate=0.01):
        """统计最近一次反向传播的梯度范数和参数更新范数。"""
        grad_norms={}
        update_norms={}
        total_sq=0.0
        update_sq=0.0
        for idx,name,layer in self.trainable_layers():
            if layer.last_dw is None or layer.last_db is None:
                grad_norm=0.0
            else:
                grad_norm=float(np.sqrt(np.sum(layer.last_dw**2)+np.sum(layer.last_db**2)))
            grad_norms[name]=grad_norm
            update_norms[name]=float(abs(learning_rate)*grad_norm)
            total_sq+=grad_norm**2
            update_sq+=(learning_rate*grad_norm)**2
        return {
            'grad_norm_total':float(np.sqrt(total_sq)),
            'update_norm_total':float(np.sqrt(update_sq)),
            'layer_grad_norms':grad_norms,
            'layer_update_norms':update_norms,
            'conv1_grad_norm':grad_norms.get('conv1',0.0),
            'conv2_grad_norm':grad_norms.get('conv2',0.0),
            'fc1_grad_norm':grad_norms.get('fc1',0.0),
            'fc2_grad_norm':grad_norms.get('fc2',0.0),
            'conv1_update_norm':update_norms.get('conv1',0.0),
            'conv2_update_norm':update_norms.get('conv2',0.0),
            'fc1_update_norm':update_norms.get('fc1',0.0),
            'fc2_update_norm':update_norms.get('fc2',0.0)
        }
    
    def predict_proba(self, x):
        out=self.forward(x)
        exp_scores=np.exp(out-np.max(out,axis=1,keepdims=True))
        probs=exp_scores/np.sum(exp_scores,axis=1,keepdims=True)
        return probs
    
    def predict(self,x):
        return np.argmax(self.predict_proba(x),axis=1)
    
    def train(self,X_train,y_train,X_val,y_val,batch_size=128,epochs=10,learning_rate=0.01,trace_config=None):
        num_samples=X_train.shape[0]
        num_batches=num_samples//batch_size
        history = {
            'train_loss': [],
            'val_loss': [],
            'train_acc': [],
            'val_acc': []
        }

        trace_config=trace_config or {}
        trace_enabled=bool(trace_config.get('enabled',False))
        trace_every=max(1,int(trace_config.get('sample_every',25)))
        val_sample_size=int(trace_config.get('val_sample_size',512))
        snapshot_scope=str(trace_config.get('snapshot_scope','fc2')).lower()
        trace_rows=[]
        theta_snapshots=[]
        fc2_snapshots=[]

        def eval_subset(X,y,size):
            if size and size>0 and X.shape[0]>size:
                X_eval=X[:size]
                y_eval=y[:size]
            else:
                X_eval=X
                y_eval=y
            return self.evaluate(X_eval,y_eval,batch_size=batch_size)

        def record_trace(global_step,epoch,batch,train_loss,train_acc,stats=None):
            if not trace_enabled:
                return
            stats=stats or self.gradient_stats(learning_rate)
            val_loss,val_acc=eval_subset(X_val,y_val,val_sample_size)
            row={
                'step':int(global_step),
                'epoch':int(epoch),
                'batch':int(batch),
                'train_loss':float(train_loss),
                'val_loss':float(val_loss),
                'loss':float(val_loss),
                'train_acc':float(train_acc*100.0),
                'val_acc':float(val_acc*100.0),
                'lr':float(learning_rate),
                'grad_norm_total':float(stats.get('grad_norm_total',0.0)),
                'update_norm_total':float(stats.get('update_norm_total',0.0)),
                'conv1_grad_norm':float(stats.get('conv1_grad_norm',0.0)),
                'conv2_grad_norm':float(stats.get('conv2_grad_norm',0.0)),
                'fc1_grad_norm':float(stats.get('fc1_grad_norm',0.0)),
                'fc2_grad_norm':float(stats.get('fc2_grad_norm',0.0))
            }
            trace_rows.append(row)
            if snapshot_scope in ('all','both'):
                theta_snapshots.append(self.parameter_vector('all'))
            if snapshot_scope in ('fc2','both','all'):
                fc2_snapshots.append(self.parameter_vector('fc2'))

        if trace_enabled:
            init_loss,init_acc=eval_subset(X_val,y_val,val_sample_size)
            record_trace(0,0,0,init_loss,init_acc,{
                'grad_norm_total':0.0,'update_norm_total':0.0,
                'conv1_grad_norm':0.0,'conv2_grad_norm':0.0,
                'fc1_grad_norm':0.0,'fc2_grad_norm':0.0
            })

        global_step=0
        for epoch in range(epochs):
            indices=np.random.permutation(num_samples)
            X_train_shuffled=X_train[indices]
            y_train_shuffled=y_train[indices]
            
            epoch_loss=0
            correct_preds=0
            
            for batch in range(num_batches):
                global_step+=1
                start_idx=batch*batch_size
                end_idx=start_idx+batch_size
                X_batch=X_train_shuffled[start_idx:end_idx]
                y_batch=y_train_shuffled[start_idx:end_idx]
                loss,outputs=self.forward(X_batch,y_batch)
                predicted_classes=np.argmax(outputs,axis=1)
                batch_acc=float(np.mean(predicted_classes==y_batch.argmax(axis=1)))
                correct_preds+=np.sum(predicted_classes==y_batch.argmax(axis=1))

                stats=self.backward(learning_rate,return_stats=True)
                epoch_loss+=loss
                if trace_enabled and (global_step % trace_every == 0):
                    record_trace(global_step,epoch+1,batch+1,loss,batch_acc,stats)
                print(f"Epoch {epoch+1}/{epochs}, Batch {batch}/{num_batches}, Loss: {loss:.4f}",end='\r')  
            
            # 训练损失和准确率
            train_loss=epoch_loss/num_batches
            train_acc=correct_preds/num_samples
            val_loss,val_acc=self.evaluate(X_val,y_val,batch_size)
            
            history['train_loss'].append(train_loss)
            history['val_loss'].append(val_loss)
            history['train_acc'].append(train_acc)
            history['val_acc'].append(val_acc)
            if trace_enabled:
                record_trace(global_step,epoch+1,num_batches,train_loss,train_acc,self.gradient_stats(learning_rate))
            print(f"Epoch {epoch+1}/{epochs}: train_loss={train_loss:.4f}, train_acc={train_acc:.4f}, val_loss={val_loss:.4f}, val_acc={val_acc:.4f}")

        if trace_enabled:
            history['trace_rows']=trace_rows
            history['theta_snapshots']=np.vstack(theta_snapshots) if theta_snapshots else np.empty((0,0),dtype=np.float32)
            history['fc2_snapshots']=np.vstack(fc2_snapshots) if fc2_snapshots else np.empty((0,0),dtype=np.float32)
            history['trace_config']={
                'sample_every':trace_every,
                'val_sample_size':val_sample_size,
                'snapshot_scope':snapshot_scope
            }
        return history
    
    def evaluate(self,X,y,batch_size=64):
        num_samples=X.shape[0]
        num_batches=int(np.ceil(num_samples/batch_size))
        total_loss=0
        correct_preds=0
        for batch in range(num_batches):
            start_idx=batch*batch_size
            end_idx=min(start_idx+batch_size,num_samples)
            
            X_batch=X[start_idx:end_idx]
            y_batch=y[start_idx:end_idx]
            
            loss,outputs=self.forward(X_batch,y_batch)
            
            predicted_classes=np.argmax(outputs,axis=1)
            correct_preds+=np.sum(predicted_classes==y_batch.argmax(axis=1))
            total_loss+=loss*(end_idx-start_idx)
        avg_loss=total_loss/num_samples
        accuracy=correct_preds/num_samples
        return avg_loss, accuracy
    
    def save_params(self, path):
        params = {}
        for idx, layer in enumerate(self.layers):
            if isinstance(layer, (ConvLayer, FullyConnected)):
                params[f"layer{idx}_weights"] = layer.weights
                params[f"layer{idx}_bias"] = layer.bias
        np.savez_compressed(path, **params)
        
    def load_params(self,path):
        data=np.load(path)
        for idx,layer in enumerate(self.layers):
            if isinstance(layer,(ConvLayer,FullyConnected)):
                layer.weights=data[f"layer{idx}_weights"]
                layer.bias=data[f"layer{idx}_bias"]