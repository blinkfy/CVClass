"""
Route hub.
- Root path returns the main shell page
- /api/modules returns module registry info (for frontend navigation)
- Legacy API routes for interactive algorithm pages (compatible with old CV project)
"""
import os
import inspect
import imageio.v3 as iio
from datetime import datetime
from flask import Blueprint, Response, render_template, jsonify, request
from app.modules import MODULE_REGISTRY, get_modules_by_phase
from app.modules.implementation import get_implementation_meta
from app.modules.offline_teaching import (
    BLUEPRINT_MODULES,
    EXTERNAL_WEIGHT_MODULES,
    LOCAL_FRONTIER_ALGORITHM_MODULES,
    LOCAL_TEACHING_MODEL_MODULES,
    OFFLINE_TEACHING_MODULES,
)
from app.utils.image_utils import to_base64, load_image_u8, load_chinese_font
from app.runners import get_remote_runner

main_bp = Blueprint('main', __name__)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_LEGACY_HISTORY = []
_LEGACY_HISTORY_NEXT_ID = 1
TEACHING_PAGE_IDS = {
    'grayscale', 'noise', 'bilateral', 'convolution', 'smoothing',
    'kmeans', 'watershed', 'grabcut', 'slic', 'hog_svm', 'optical_flow', 'stereo',
    'ai_eye', 'detection', 'semantic', 'instance', 'unet', 'yolo',
    'resnet', 'gan', 'diffusion', 'vit', 'detr', 'clip', 'sam', 'stable_diffusion', 'nerf',
}

# New dedicated pages (override teaching.html fallback)
DEDICATED_PAGES = {
    'smoothing': 'smoothing.html',
    'median': 'smoothing.html',
    'sobel': 'sobel_new.html',
    'histogram': 'histogram_new.html',
    'threshold': 'threshold_new.html',
    'gaussian': 'smoothing.html',
    'bilateral': 'smoothing.html',
}

PREFERRED_STATIC_PAGES = {
    'ai_eye': 'detection_segmentation.html',
    'detection': 'detection_segmentation.html?task=detection',
    'semantic': 'detection_segmentation.html?task=semantic',
    'instance': 'detection_segmentation.html?task=instance',
    'yolo': 'detection_segmentation.html?task=yolo',
    'unet': 'detection_segmentation.html?task=unet',
    'resnet': 'nn_resnet.html',
    'gan': 'nn_gan.html',
    'diffusion': 'diffusion.html',
    'vit': 'vit.html',
    'detr': 'detr.html',
    'clip': 'clip.html',
    'sam': 'sam.html',
    'nerf': 'nerf.html',
    'stable_diffusion': 'stable_diffusion.html',
}

MODULE_ALIASES = {
    'canny': 'edge',
    'harris': 'corner',
    'faster_rcnn': 'detection',
    'fcn': 'semantic',
    'mask_rcnn': 'instance',
    'tpl_match': 'template_match',
    'sd': 'stable_diffusion',
}


def _canonical_module_id(module_id):
    return MODULE_ALIASES.get(module_id, module_id)


def _static_page_exists(page):
    page_name = (page or '').split('?', 1)[0]
    return bool(page_name) and os.path.exists(os.path.join(PROJECT_ROOT, 'static', 'pages', page_name))


def _module_page(module_id, cls):
    if module_id in DEDICATED_PAGES:
        return DEDICATED_PAGES[module_id]
    preferred = PREFERRED_STATIC_PAGES.get(module_id)
    if preferred and _static_page_exists(preferred):
        return preferred
    page = cls.get_page() if cls and hasattr(cls, 'get_page') else None
    if page:
        return page
    if module_id in TEACHING_PAGE_IDS:
        return f'teaching.html?id={module_id}'
    return None


# ================================================================
#  Main shell
# ================================================================

@main_bp.route('/')
def index():
    """Main entry point -- returns the SPA shell."""
    return render_template('index.html')


@main_bp.route('/api/modules')
def api_modules():
    """Return all registered module metadata organized by phase."""
    phases = get_modules_by_phase()
    hidden_module_ids = {'ai_eye', 'nms', 'template_match', 'hough', 'contour'}
    for phase in phases:
        phase['modules'] = [
            mod for mod in phase['modules']
            if mod.get('id') not in hidden_module_ids
        ]
        for mod in phase['modules']:
            cls = MODULE_REGISTRY.get(mod['id'])
            page = _module_page(mod['id'], cls)
            if page:
                mod['page'] = page
            mod['implementation'] = get_implementation_meta(mod['id'])
    phases = [phase for phase in phases if phase['modules']]

    return jsonify({'phases': phases, 'total': len(MODULE_REGISTRY)})


@main_bp.route('/api/docs/algorithm-principles')
def api_algorithm_principles_doc():
    """Return the Markdown source for the algorithm principles reader."""
    doc_path = os.path.join(PROJECT_ROOT, 'docs', '算法原理详解.md')
    if not os.path.exists(doc_path):
        return Response('# 算法原理详解\n\n文档尚未生成。\n', content_type='text/markdown; charset=utf-8')
    with open(doc_path, 'r', encoding='utf-8') as fh:
        content = fh.read()
    return Response(content, content_type='text/markdown; charset=utf-8')


# ================================================================
#  Legacy API routes (compatible with old CV project interactive pages)
#  These routes are called by the interactive HTML pages ported from
#  the old CV project.
# ================================================================

def _save_upload(file):
    """Save uploaded file and return (unique_name, upload_path)."""
    import uuid
    upload_dir = os.path.join(PROJECT_ROOT, 'static', 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1] or '.png'
    unique_name = f"{uuid.uuid4().hex}{ext}"
    upload_path = os.path.join(upload_dir, unique_name)
    file.save(upload_path)
    return unique_name, upload_path


def _save_legacy_result(image, source_name, prefix):
    upload_dir = os.path.join(PROJECT_ROOT, 'static', 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    stem = os.path.splitext(source_name)[0]
    result_name = f'{prefix}{stem}.png'
    result_path = os.path.join(upload_dir, result_name)
    iio.imwrite(result_path, image)
    return result_name, result_path


def _legacy_file_info(path):
    size_bytes = os.path.getsize(path)
    if size_bytes >= 1024 * 1024:
        size_text = f'{size_bytes / (1024 * 1024):.1f} MB'
    elif size_bytes >= 1024:
        size_text = f'{size_bytes / 1024:.1f} KB'
    else:
        size_text = f'{size_bytes} B'
    return {
        'file_size': size_text,
        'format': os.path.splitext(path)[1].upper().lstrip('.') or 'PNG',
    }


def _legacy_array_info(image):
    shape = image.shape
    return {
        'width': int(shape[1]),
        'height': int(shape[0]),
        'channels': 1 if len(shape) == 2 else int(shape[2]),
    }


def _legacy_pixel_stats(image):
    import numpy as np
    arr = np.asarray(image, dtype=np.float64)
    return {
        'min': int(arr.min()),
        'max': int(arr.max()),
        'mean': round(float(arr.mean()), 1),
        'std': round(float(arr.std()), 1),
    }


def _legacy_histogram(image, bins=256):
    import numpy as np
    hist, _ = np.histogram(np.asarray(image).ravel(), bins=bins, range=(0, 256))
    return [int(v) for v in hist]


def _legacy_history_snapshot():
    return [dict(entry) for entry in _LEGACY_HISTORY]


def _legacy_add_history_entry(module_key, module_title, original_image, result_image,
                              original_filename='', original_info=None, result_info=None,
                              stats=None, histogram=None, metadata=None):
    global _LEGACY_HISTORY_NEXT_ID
    entry = {
        'id': _LEGACY_HISTORY_NEXT_ID,
        'module_key': module_key,
        'module_title': module_title,
        'original_image': original_image,
        'result_image': result_image,
        'original_filename': original_filename,
        'original_info': original_info,
        'result_info': result_info,
        'stats': stats,
        'histogram': histogram,
        'metadata': metadata or {},
        'timestamp': datetime.now().isoformat(),
    }
    _LEGACY_HISTORY_NEXT_ID += 1
    _LEGACY_HISTORY.insert(0, entry)
    del _LEGACY_HISTORY[100:]
    return dict(entry)


def _legacy_remove_history_entry(entry_id):
    for idx, entry in enumerate(_LEGACY_HISTORY):
        if int(entry.get('id', -1)) == int(entry_id):
            del _LEGACY_HISTORY[idx]
            return True
    return False


def _legacy_clear_history(module_key=None):
    if module_key:
        before = len(_LEGACY_HISTORY)
        _LEGACY_HISTORY[:] = [entry for entry in _LEGACY_HISTORY if entry.get('module_key') != module_key]
        return before - len(_LEGACY_HISTORY)
    cleared = len(_LEGACY_HISTORY)
    _LEGACY_HISTORY.clear()
    return cleared


def _demo_fixture_path():
    """Return a stable built-in image for demo endpoints without uploads."""
    candidates = [
        os.path.join(PROJECT_ROOT, 'static', 'images', 'demo-street.jpg'),
        os.path.join(PROJECT_ROOT, 'bus.jpg'),
        os.path.join(PROJECT_ROOT, '1.jpg'),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def _to_data_url(image):
    return f'data:image/png;base64,{to_base64(image)}'


STEP_FORMULA_FALLBACKS = {
    'original': 'I(x,y)',
    'input': 'I(x,y)',
    'left': 'I_l(x,y)',
    'right': 'I_r(x,y)',
    'frame1': 'I_t(x,y)',
    'frame2': 'I_{t+1}(x,y)',
    'gray': 'Y=0.299R+0.587G+0.114B',
    'grayscale': 'Y=0.299R+0.587G+0.114B',
    'histogram': 'h(k)=sum_{x,y} [I(x,y)=k]',
    'cdf': 'CDF(k)=sum_{i<=k} h(i)',
    'threshold': 'B(x,y)=1[I(x,y)>=T]',
    'result': 'Y=f(I)',
    'output': 'Y=f(I)',
    'features': 'phi(I)',
    'feature': 'phi(I)',
    'gradient': '|grad I|=sqrt(G_x^2+G_y^2)',
    'magnitude': '|grad I|=sqrt(G_x^2+G_y^2)',
    'angle': 'theta=atan2(G_y,G_x)',
    'kernel': 'Y=K*I',
    'kernels': 'K_{t+1}=K_t-eta grad_K L',
    'loss': 'L=mean((K*X-Y)^2)',
    'mask': 'M(x,y)=1[p(x,y)>tau]',
    'boxes': 'b=(x,y,w,h), score=p(class|b)',
    'attention': 'Attention(Q,K,V)=softmax(QK^T/sqrt(d))V',
    'tokens': 'z_0=[x_1E;...;x_NE]+p',
    'embedding': 'z=phi(x)/||phi(x)||',
}

MODULE_FORMULA_FALLBACKS = {
    'smoothing': 'I_denoised=f(I_noisy; filter)',
    'bilateral': "I'_p=(1/W_p) sum_q G_s(||p-q||)G_r(|I_p-I_q|)I_q",
    'convolution': 'Y(i,j)=sum_{u,v} K(u,v) I(i+u,j+v)',
    'gaussian': 'G(x,y)=1/(2*pi*sigma^2) exp(-(x^2+y^2)/(2*sigma^2))',
    'median': "I'(x,y)=median{I(u,v)|(u,v) in Omega}",
    'noise': 'I_noisy=I+n',
    'sobel': '|grad I|=sqrt((K_x*I)^2+(K_y*I)^2)',
    'edge': 'Canny=NMS(|grad(G_sigma*I)|)+hysteresis',
    'corner': 'R=det(M)-k trace(M)^2',
    'shitomasi': 'R=min(lambda_1,lambda_2)',
    'sift': 'D(x,y,sigma)=L(x,y,k sigma)-L(x,y,sigma)',
    'hough': 'rho=x cos(theta)+y sin(theta)',
    'morphology': 'A oplus B, A ominus B',
    'contour': 'C={(x,y)|B(x,y)=1 and neighbor(B)=0}',
    'nms': 'keep(p) iff R(p)=max_{q in N(p)} R(q)',
    'template_match': 'NCC=sum((I-mu_I)(T-mu_T))/(sigma_I sigma_T)',
    'kmeans': 'min sum_i ||x_i-mu_{c_i}||^2',
    'watershed': 'label=watershed(grad I, markers)',
    'grabcut': 'E(alpha,k,theta,z)=U(alpha,k,theta,z)+V(alpha,z)',
    'slic': 'D=sqrt(d_c^2+(m/S)^2 d_s^2)',
    'hog_svm': 'score=w^T HOG(x)+b',
    'optical_flow': 'I_x u+I_y v+I_t=0',
    'stereo': 'd*=argmin_d sum |I_l(x,y)-I_r(x-d,y)|',
    'frequency': 'F(u,v)=sum I(x,y)e^{-j2pi(ux/M+vy/N)}',
    'match': 'm*=argmin_j ||d_i-d_j||',
    'ncuts': 'min Ncut(A,B)=cut(A,B)/assoc(A,V)+cut(A,B)/assoc(B,V)',
    'bovw_spm': 'h_k=sum_i [q(d_i)=k]',
    'calibration': 's[u,v,1]^T=K[R|t][X,Y,Z,1]^T',
    'epipolar': "x'^T F x=0",
    'sfm': 'x=P X, x_prime=P_prime X',
    'detection': 'box=head(FPN(I)), score=softmax(cls)',
    'semantic': 'p_{cxy}=softmax(f_theta(I)_{cxy})',
    'instance': 'mask_i=sigmoid(f_theta(RoI_i))',
    'resnet': 'y=F(x)+x',
    'unet': 'D_l=concat(up(D_{l+1}),E_l)',
    'yolo': 'b,cls,obj=head(grid(I))',
    'gan': 'min_G max_D E log D(x)+E log(1-D(G(z)))',
    'diffusion': 'z_{t-1}=scheduler(z_t, epsilon_theta(z_t,t,c))',
    'ddpm': 'q(x_t|x_0)=N(sqrt(alpha_bar_t)x_0,(1-alpha_bar_t)I)',
    'lenet': 'y=softmax(W flatten(pool(conv(X)))+b)',
    'cnn_basics': 'Y=pool(ReLU(K*I+b))',
    'conv_training': 'K_{t+1}=K_t-eta grad_K L',
    'vit': 'Attention(Q,K,V)=softmax(QK^T/sqrt(d))V',
    'detr': 'boxes=Decoder(object_queries, Encoder(I))',
    'clip': 'sim(I,T)=<phi_I(I),phi_T(T)>/(||phi_I||||phi_T||)',
    'sam': 'M=MaskDecoder(ImageEncoder(I),PromptEncoder(p))',
    'stable_diffusion': 'z_{t-1}=scheduler.step(epsilon_theta(z_t,t,c),z_t)',
    'nerf': 'C(r)=sum_i T_i(1-exp(-sigma_i delta_i))c_i',
}


MODULE_PROBLEM_STATEMENTS = {
    'colorspace': '色彩空间要解决的问题是：同一张图片可以用不同“颜色坐标系”来描述。RGB 适合屏幕，HSV 适合按颜色挑选目标，Lab 更接近人眼感知，CMYK 面向印刷分色。',
    'grayscale': '灰度转换要解决的问题是：把彩色信息压缩成亮度图，让后续算法先专注于明暗变化，而不是被颜色维度干扰。',
    'histogram': '直方图均衡化要解决的问题是：图片太灰、太暗或对比度太低时，把亮度分布拉开，让原本挤在一起的细节更容易被看见。',
    'threshold': '阈值化要解决的问题是：把连续灰度图变成前景和背景两类，适合做文字提取、缺陷检测、轮廓分析等“先分出来再处理”的任务。',
    'noise': '噪声模型要解决的问题是：先理解图像为什么会变脏，再选择合适的去噪方法，而不是盲目套滤波器。',
    'smoothing': '平滑与去噪要解决的问题是：在尽量保留重要边缘的前提下，削弱随机噪声、孤立坏点或细碎纹理。',
    'gaussian': '高斯平滑要解决的问题是：用周围像素的加权平均压低随机波动，适合高斯噪声和边缘检测前的预处理，但会让边缘变软。',
    'median': '中值滤波要解决的问题是：去掉椒盐噪声这类孤立黑白坏点，用邻域排序后的中间值替换异常像素。',
    'bilateral': '双边滤波要解决的问题是：既平滑噪声，又尽量不把边缘两侧的颜色混在一起，因此适合需要保边的去噪。',
    'convolution': '卷积要解决的问题是：用一个小核在图像上滑动，把“看邻域”的规则变成可重复的计算，许多滤波、边缘和深度网络都建立在它上面。',
    'sobel': 'Sobel 要解决的问题是：找出图像亮度变化最快的位置和方向，也就是边缘、轮廓、纹理突变这些结构线索。',
    'edge': 'Canny 边缘检测要解决的问题是：把噪声压下去、找出强边缘、细化边缘线，并用双阈值把断裂边缘尽量连起来。',
    'corner': 'Harris 角点要解决的问题是：找到同时在两个方向上变化明显的位置，这些点适合做跟踪、匹配和几何估计。',
    'shitomasi': 'Shi-Tomasi 要解决的问题是：用更稳定的角点评分挑出适合跟踪的点，常用于运动估计和特征跟踪。',
    'sift': 'SIFT 要解决的问题是：在尺度、旋转、光照变化后仍能认出同一个局部区域，适合图像匹配和拼接。',
    'morphology': '形态学要解决的问题是：用膨胀、腐蚀、开闭运算修补二值区域，让小洞、毛刺、断裂边界更容易处理。',
    'kmeans': 'K-Means 要解决的问题是：把颜色或特征相近的像素自动分成几组，用最简单的方式理解“聚类分割”。',
    'watershed': '分水岭要解决的问题是：把相互挨在一起的区域分开，特别适合讲“从种子点向外涨水直到相遇”的分割思想。',
    'grabcut': 'GrabCut 要解决的问题是：用户只给一个粗框，算法自动估计前景和背景颜色模型，再迭代细化目标区域。',
    'slic': 'SLIC 超像素要解决的问题是：把图像先切成颜色和位置都相近的小块，让后续算法处理“区域”而不是单个像素。',
    'hog_svm': 'HOG+SVM 要解决的问题是：用梯度方向描述物体外形，再用分类器判断图中是否存在目标。',
    'optical_flow': '光流要解决的问题是：估计相邻帧中每个位置往哪里移动，让系统理解画面里的运动。',
    'stereo': '双目立体要解决的问题是：通过左右两张图的位移差估计深度，位移越大通常说明物体越近。',
    'frequency': '频域处理要解决的问题是：把图像从“位置上的像素”变成“不同频率的成分”，方便理解模糊、锐化、周期噪声等现象。',
    'match': '特征匹配要解决的问题是：把两张图里描述子最相似的局部点连起来，为拼接、定位和三维重建提供对应关系。',
    'bovw_spm': 'BoVW/SPM 要解决的问题是：把很多局部特征汇总成一份可分类的图像表示，同时保留粗略空间布局。',
    'calibration': '相机标定要解决的问题是：估计相机内部参数和畸变，让二维像素和真实三维世界之间能互相换算。',
    'epipolar': '极线几何要解决的问题是：把双目匹配从整张图搜索压缩到一条线搜索，大幅减少找对应点的难度。',
    'sfm': 'SfM 要解决的问题是：只靠多张普通照片恢复相机位置和稀疏三维点云，让二维图像重新长出空间结构。',
    'detection': '目标检测要解决的问题是：图里有哪些重要物体，它们大概在哪里。输出是类别、置信度和矩形框。',
    'semantic': '语义分割要解决的问题是：给每个像素分配类别，回答“这块区域是什么”，但不区分同类里的不同个体。',
    'instance': '实例分割要解决的问题是：不仅知道每个像素属于什么类别，还要把同类物体一个个分开。',
    'ai_eye': 'AI 之眼要解决的问题是：用同一张图对比目标检测、语义分割、实例分割三种视觉理解方式，让观众看懂“框、类别地图、实例 mask”的区别。',
    'yolo': 'YOLO 要解决的问题是：把检测做得更快，把整张图一次性划成网格并直接回归目标框和类别。',
    'unet': 'U-Net 要解决的问题是：在像素级分割中既看懂全局语义，又把边界细节还原回来，适合医学、工业和前景 mask。',
    'resnet': 'ResNet 要解决的问题是：网络越深越难训练时，用残差连接让信息和梯度更容易穿过很多层。',
    'gan': 'GAN 要解决的问题是：让生成器和判别器互相博弈，逼迫生成器学会造出越来越像真实数据的图像。',
    'diffusion': '扩散模型要解决的问题是：通过学习“逐步加噪”和“逐步去噪”的逆过程，从噪声中稳定生成图像。',
    'ddpm': 'DDPM 要解决的问题是：用明确的马尔可夫加噪/去噪公式讲清扩散生成如何一步步还原图像。',
    'conv_training': '卷积训练要解决的问题是：不只看卷积怎么用，还要看卷积核如何通过误差反向更新，逐渐学会有用的滤波器。',
    'vit': 'ViT 要解决的问题是：不用卷积也能处理图像，把图片切成 patch token，像处理一句话一样用 Transformer 建模全局关系。',
    'detr': 'DETR 要解决的问题是：把目标检测改成集合预测，用 object query 直接输出一组目标，减少手工后处理依赖。',
    'clip': 'CLIP 要解决的问题是：把图片和文字放到同一个向量空间里，让模型能用自然语言描述或检索图像。',
    'sam': 'SAM 要解决的问题是：用户给点、框等提示后，模型快速返回对应物体 mask，把分割变成交互式任务。',
    'stable_diffusion': 'Stable Diffusion 要解决的问题是：在潜空间里按文本提示逐步去噪生成图像，降低计算量并提高可控性。',
    'nerf': 'NeRF 要解决的问题是：用一个连续函数记住三维场景，从任意视角沿光线采样并渲染新画面。',
    'swin': 'Swin Transformer 要解决的问题是：让视觉 Transformer 在局部窗口内高效计算，同时通过移位窗口交换跨区域信息。',
    'dino': 'DINO 要解决的问题是：不用人工标签，让学生网络模仿教师网络，从多视图图像中学到稳定视觉表征。',
    'mae': 'MAE 要解决的问题是：遮住大部分 patch，只用少量可见区域重建图像，从而逼模型理解图像结构。',
    'dino_det': 'DINO 检测要解决的问题是：在 DETR 风格检测中加入去噪 query 和逐层框修正，让端到端检测更稳定。',
    'grdino': 'Grounding DINO 要解决的问题是：让文本短语和图像区域对齐，实现“用一句话找图里的东西”。',
    'mask2former': 'Mask2Former 要解决的问题是：把语义、实例、全景分割统一成 mask query 分类问题。',
    'sam2': 'SAM2 要解决的问题是：把提示分割从单张图扩展到视频，用记忆机制让 mask 随时间传播。',
    'blip2': 'BLIP-2 要解决的问题是：用 Q-Former 把图像特征接到语言模型上，让图像能参与问答和描述。',
    'controlnet': 'ControlNet 要解决的问题是：把边缘、姿态、深度等条件注入扩散模型，让生成图按用户指定结构走。',
    'dit': 'DiT 要解决的问题是：把扩散模型里的潜变量切成 token，用 Transformer 来完成去噪。',
    'flux': 'Flux/Flow Matching 要解决的问题是：学习从噪声分布流向数据分布的向量场，用连续轨迹理解生成过程。',
    'stylegan': 'StyleGAN 要解决的问题是：把随机向量变成分层风格控制信号，逐层合成高质量图像。',
    'dust3r': 'DUSt3R 要解决的问题是：从图像对直接估计密集匹配、深度和点云，把几何重建做成端到端输出。',
    'orbslam3': 'ORB-SLAM3 要解决的问题是：通过特征点匹配、关键帧和位姿图，让相机边移动边定位和建图。',
    'mediapipe': 'MediaPipe 姿态估计要解决的问题是：把人体关键点检测出来并连成骨架，让图像变成可分析的动作结构。',
    'vitpose': 'ViTPose 要解决的问题是：用 ViT 特征预测人体关键点热力图，实现更细的人体姿态定位。',
}


STEP_TEACHING_RULES = [
    (('input', 'original', '原图', '输入'), '先确认算法真正看到的输入是什么。所有后面的框、曲线、mask、热力图都必须从这张图或这组数据计算出来。', '重点看输入尺寸、颜色、噪声和物体位置；后续结果是否和它对应。'),
    (('preprocess', 'normalize', 'resize', 'tensor', '预处理'), '把人能看的图片转换成算法能算的数字格式，例如缩放、归一化、转张量或灰度化。', '重点看算法并没有改变任务目标，只是在统一输入格式。'),
    (('gray', 'grayscale', '灰度', '亮度'), '把颜色压成亮度，让算法先关注明暗结构。很多边缘、直方图、阈值算法都从这一步开始。', '重点看不同颜色在灰度图中会变成怎样的亮度差。'),
    (('histogram', '直方图'), '统计每种灰度值出现多少次，把一张图变成一条亮度分布。', '重点看亮度是否挤在暗部、亮部或很窄的范围里。'),
    (('cdf', '累计', '累积'), '把直方图从左到右累加，得到“低于某个亮度的像素占多少”的曲线。', '重点看曲线陡的地方，说明大量像素挤在那段亮度里。'),
    (('mapping', '映射'), '把旧亮度重新分配到新亮度，让挤在一起的灰度被拉开。', '重点看同一个旧灰度会被送到哪个新灰度。'),
    (('threshold', 'otsu', '二值', '阈值'), '用一条分界线把像素分成前景和背景。', '重点看阈值移动时，哪些区域从背景变成前景。'),
    (('kernel', 'window', 'convolution', '卷积', '滑窗', '加权'), '用一个小窗口查看局部邻域，并按固定规则合成中心像素的新值。', '重点看窗口里的每个像素权重不同，中心结果来自邻域共同贡献。'),
    (('median', 'sort', '排序', '中值'), '把窗口内的像素排序，取中间值替换中心像素，从而压掉孤立异常点。', '重点看极黑极白噪点会被排序后排到两端，不再控制输出。'),
    (('bilateral', 'range', 'combined', '双边'), '同时考虑空间距离和颜色相似度：离得近且颜色像的像素才会强烈参与平均。', '重点看边缘另一侧虽然距离近，但颜色差大，所以权重会被压低。'),
    (('noise', '噪声', '加噪'), '模拟图像采集或传输中的干扰，让观众知道算法面对的是哪种“脏图”。', '重点看噪声是连续颗粒、孤立坏点，还是周期性条纹。'),
    (('gradient', 'sobel', 'gx', 'gy', 'magnitude', 'angle', '梯度', '方向'), '计算亮度往哪个方向变化最快，变化越大越像边缘。', '重点看水平/垂直梯度分别响应哪类边缘，幅值图哪里最亮。'),
    (('nms', 'non maximum', '细化', '抑制'), '只保留边缘方向上最强的响应，把粗边缘压成更细的线。', '重点看一大片亮带如何被压缩成单像素附近的边缘。'),
    (('hysteresis', '双阈值', '连接'), '用高阈值找可靠边缘，再用低阈值把连接在它旁边的弱边缘接上。', '重点看哪些弱边缘因为连着强边缘而被保留。'),
    (('corner', 'keypoint', '关键点', '角点'), '寻找局部结构稳定、容易再次找到的位置，后续可用于匹配或跟踪。', '重点看角点通常落在拐角、纹理交叉或结构突变处。'),
    (('descriptor', 'match', '描述子', '匹配'), '把局部区域编码成可比较的数字向量，再在另一张图里找最像的点。', '重点看正确匹配应连接同一个物体或同一个纹理位置。'),
    (('cluster', 'kmeans', 'superpixel', 'slic', '聚类', '超像素'), '把相似像素或区域归到同一组，减少逐像素处理的复杂度。', '重点看同组区域是否颜色相近、位置连贯。'),
    (('box', 'boxes', 'proposal', 'prediction', 'detection', 'objectness', 'score', '框', '检测', '候选'), '把“可能有物体的位置”变成候选框、分数和类别。', '重点看分数低的框会被过滤，剩下的框是否对准真实物体。'),
    (('mask', 'segmentation', 'semantic', 'instance', 'label', '分割', '语义', '实例'), '把图像从“整张图片”拆成像素级区域，说明每个位置属于什么或属于哪个个体。', '重点看颜色区域、边界贴合程度，以及同类物体有没有被分开。'),
    (('attention', 'token', 'patch', 'query', 'transformer', '注意力'), '把图像拆成 token，并计算哪些 token 之间应该互相参考。', '重点看注意力高的位置，表示模型在当前步骤重点借用了哪些区域的信息。'),
    (('embedding', 'similarity', 'clip', 'text', '相似度', '文本'), '把图像、文字或区域变成向量，再用距离或相似度判断它们是否匹配。', '重点看相似度最高的候选是否符合图片内容。'),
    (('diffusion', 'denoise', 'noise step', '去噪', '扩散'), '从噪声或受污染的表示中一步步恢复结构，每一步都只做一小次修正。', '重点看噪声如何减少，轮廓、颜色或语义如何逐渐稳定。'),
    (('latent', 'style', 'gan', 'generator', 'discriminator', '生成', '风格'), '在隐空间或生成网络中把随机信号逐步变成有结构的图像。', '重点看控制变量改变时，形状、纹理或风格如何随之变化。'),
    (('depth', 'ray', 'point', 'pose', '3d', '深度', '光线', '点云', '位姿'), '把二维图像线索转成空间结构，例如深度、相机位置或三维点。', '重点看近处/远处、视角变化和点云形状是否一致。'),
    (('loss', 'train', 'epoch', '训练', '损失'), '用误差告诉模型哪里做错了，再用参数更新让下一轮结果更接近目标。', '重点看损失是否下降，以及中间表示是否越来越有任务相关性。'),
    (('result', 'output', 'overlay', 'final', '结果', '叠加'), '把前面的中间计算汇总成最终可读结果。', '重点把它和输入图对照，看算法解决问题的效果和局限。'),
]


SPECIFIC_STEP_TEACHING = {
    'histogram:original': (
        '这是要增强的原图。直方图均衡化不会“识别物体”，它只重新安排亮度，所以第一步要先看清原图哪里暗、哪里灰、哪里细节挤在一起。',
        '重点看暗部、亮部和低对比区域，后面对比这些地方是否被拉开。'
    ),
    'histogram:gray': (
        '把图像转成单通道亮度图，因为全局直方图均衡化讲的是“灰度值如何重新分布”。彩色信息先退到旁边，算法专注处理明暗。',
        '重点看原本不同颜色在亮度图中是否变得接近；这些接近的亮度后面会被重新拉伸。'
    ),
    'histogram:histogram': (
        '统计 0 到 255 每个亮度出现了多少次。它像一张“亮度人口分布图”：柱子挤在一起，说明大量像素挤在相近亮度里，画面就容易灰。',
        '重点看柱子集中在哪一段；越集中，越说明图像动态范围没有充分利用。'
    ),
    'histogram:cdf': (
        '把直方图从暗到亮累加成 CDF。CDF 告诉算法：到某个灰度为止，已经累计了多少像素。',
        '重点看曲线陡升的位置；那里代表很多像素挤在很短的灰度区间里。'
    ),
    'histogram:mapping': (
        '用 CDF 生成旧灰度到新灰度的映射表。原来拥挤的灰度段会被摊开，稀疏的灰度段变化较小。',
        '重点沿着曲线看：一个旧亮度会被送到哪个新亮度。曲线越陡，拉伸越明显。'
    ),
    'histogram:equalized': (
        '把映射表应用到每个像素，得到均衡化后的图像。算法本质上没有凭空创造细节，而是把原来不明显的亮度差放大。',
        '重点和原图对比暗部纹理、边缘和整体层次，同时注意噪声是否也被放大。'
    ),
    'histogram:equalized_histogram': (
        '重新统计均衡化后的亮度分布。理想情况下，像素会比原来分布得更开，而不是挤在一小段灰度里。',
        '重点看柱子是否覆盖更宽的亮度范围；这说明对比度被拉开了。'
    ),
    'threshold:original': (
        '这是阈值化要分割的原图。阈值化的目标不是保留丰富灰度，而是把图像压成前景和背景两类。',
        '重点先判断你希望哪一部分成为前景：文字、物体、缺陷，还是亮区域。'
    ),
    'threshold:gray': (
        '先转成灰度图，因为阈值判断通常只比较亮度大小：高于阈值归一类，低于阈值归另一类。',
        '重点看目标和背景在亮度上是否真的分得开；如果灰度接近，阈值化会很困难。'
    ),
    'threshold:histogram': (
        '用直方图观察亮度分布。如果前景和背景明显不同，直方图常会出现两个峰，阈值应放在两峰之间的谷底附近。',
        '重点找峰和谷：峰代表大量像素，谷代表适合切开的分界。'
    ),
    'threshold:otsu_score': (
        'Otsu 会尝试每一个可能阈值，并计算“类间方差”是否最大。通俗说，就是找一条线，让前景和背景的平均亮度差尽量大。',
        '重点看得分最高的位置；它就是算法认为最合理的全局阈值。'
    ),
    'threshold:decision_rule': (
        '把选出的阈值写成规则：像素亮度大于等于 T 就归为白色前景，低于 T 就归为黑色背景。这是连续灰度变成二值 mask 的关键开关。',
        '重点看规则方向：到底是亮的部分被保留，还是暗的部分被保留。'
    ),
    'threshold:result': (
        '每个像素按阈值规则被染成黑或白，得到二值图。此时细节被简化，但目标区域也更容易被测量和后处理。',
        '重点看目标是否完整、背景是否干净，以及有没有断裂或误检。'
    ),
    'threshold:overlay': (
        '把二值结果叠回原图，检查前景区域和真实物体是否对齐。单看黑白图有时难判断，叠加图能看出错误来自哪里。',
        '重点看边界是否贴合原图，以及误分区域是不是来自阴影、反光或噪声。'
    ),
    'sobel:gx': (
        'Gx 用左右方向的差分找亮度横向变化。横向变化强，通常表示图里有竖直边缘，例如柱子、车身边界、文字竖笔画。',
        '重点看竖直边缘是否更亮；正负方向代表从暗到亮或从亮到暗。'
    ),
    'sobel:gy': (
        'Gy 用上下方向的差分找亮度纵向变化。纵向变化强，通常表示水平边缘，例如地平线、台阶、文字横笔画。',
        '重点看水平边缘是否更亮；它和 Gx 合起来才能描述完整边缘。'
    ),
    'sobel:magnitude': (
        '把 Gx 和 Gy 合成总边缘强度。无论边缘朝哪个方向，只要亮度变化剧烈，幅值图就会变亮。',
        '重点看最终边缘强弱排序：最亮的位置就是局部变化最剧烈的位置。'
    ),
    'sobel:angle': (
        '方向图记录每个像素亮度上升最快的方向。它不是最终边缘图，而是告诉后续算法沿哪个方向比较邻居。',
        '重点看不同颜色/灰度代表不同方向；Canny 的细化步骤会用到它。'
    ),
    'smoothing:original': (
        '这是三种滤波器共用的原始输入。统一输入很重要，否则高斯、中值、双边的结果无法公平比较。',
        '重点看图中哪些是噪声、哪些是边缘和细节；好滤波器应该压噪声而少伤边缘。'
    ),
    'smoothing:gaussian_input_noise': (
        '给高斯平滑准备的噪声场景通常是连续、细碎、颗粒状的随机波动。高斯平均适合压这种小幅波动。',
        '重点看噪声是到处轻微抖动，而不是孤立黑白坏点。'
    ),
    'smoothing:median_input_noise': (
        '给中值滤波准备的是椒盐噪声：少量像素突然变成很黑或很白。排序取中值能把这些极端值排到两端。',
        '重点看孤立黑点白点，它们正是中值滤波最擅长处理的对象。'
    ),
    'smoothing:gaussian_kernel': (
        '高斯核是一张权重表：中心权重大，越远权重越小。平滑时中心像素会被邻域按这张表加权平均。',
        '重点看权重是否从中心向外逐渐变小；这解释了为什么它平滑自然但会模糊边缘。'
    ),
    'smoothing:gaussian_window': (
        '取出一个局部窗口，把窗口像素和高斯核逐项相乘再求和，得到中心像素的新值。',
        '重点看每个邻居的贡献不是一样大，靠近中心的像素影响更强。'
    ),
    'smoothing:gaussian_result': (
        '高斯平滑后的图像随机颗粒会减少，但边缘和细线也会变软。它适合作为边缘检测前的去噪步骤。',
        '重点比较噪声是否下降，同时观察边界是否被抹宽。'
    ),
    'smoothing:median_window': (
        '取出 3x3 或 5x5 邻域，准备把里面的亮度值排序。中值滤波不做平均，所以不容易被极端噪点带偏。',
        '重点看窗口里是否存在特别黑或特别白的异常点。'
    ),
    'smoothing:median_sort': (
        '把窗口值从小到大排成一列，然后取最中间的值替换中心像素。极端噪点会被排到队伍两头，无法控制结果。',
        '重点看被高亮的中位数，它就是新中心像素。'
    ),
    'smoothing:median_result': (
        '中值滤波后的椒盐坏点明显减少，同时多数边缘还能保持比较硬。但窗口太大会吃掉细线和小纹理。',
        '重点看孤立黑白点是否消失，以及细小结构是否被误删。'
    ),
    'smoothing:bilateral_spatial_weights': (
        '空间权重只看距离：离中心越近，影响越大。它和高斯平滑类似，但这只是双边滤波的一半。',
        '重点看权重随距离衰减，这是“局部平滑”的基础。'
    ),
    'smoothing:bilateral_range_weights': (
        '颜色/亮度相似权重只看像素值差异：颜色越像中心像素，权重越高；颜色差太大就被压低。',
        '重点看边缘另一侧虽然离得近，但因为颜色差大，影响会被削弱。'
    ),
    'smoothing:bilateral_combined_weights': (
        '双边滤波把空间权重和颜色相似权重相乘。只有“离得近且颜色像”的像素才会真正参与平均。',
        '重点看组合权重如何在边缘处自动变成单侧平均，这就是它能保边的原因。'
    ),
    'smoothing:bilateral_result': (
        '双边滤波结果通常比高斯更保边：平坦区域被平滑，边界两侧不容易互相染色。代价是计算更慢。',
        '重点比较边缘是否比高斯结果更清晰，同时看纹理区域是否仍有残余噪声。'
    ),
    'ai_eye:shared_input': (
        'AI 之眼从同一张图开始，故意让检测、语义分割、实例分割看同一个输入。这样观众才能比较三种任务的答案差异。',
        '重点记住同一张图会产生三种结果：框、整图类别颜色、单个实例 mask。'
    ),
    'detection:input': (
        '目标检测的输入还是普通 RGB 图像。模型要从这张图里找出可能的物体，并给出大概位置。',
        '重点先观察图中有哪些可数物体，后面对照检测框是否找到它们。'
    ),
    'detection:preprocess': (
        '预处理把图片变成模型需要的张量格式，包括缩放、归一化和通道排列。它不是在检测物体，只是在准备输入。',
        '重点看预处理不会凭空产生框，只是让模型能正确读取图像。'
    ),
    'detection:backbone_fpn': (
        'Backbone 提取边缘、纹理、部件等特征，FPN 把不同尺度特征整理起来，让大物体和小物体都能被看到。',
        '重点看这是“看懂图像结构”的阶段，还不是最终画框。'
    ),
    'detection:raw_predictions': (
        '检测头会先产生很多候选框，宁可多猜一点。后面会按置信度和重叠关系过滤。',
        '重点看候选框数量多、可能重叠，这说明它们还不是最终答案。'
    ),
    'detection:objectness': (
        '目标性热力图把候选框分数投回图像。越亮说明模型越觉得这里像物体。',
        '重点看高亮区域是否集中在真实物体附近。'
    ),
    'detection:score_filter': (
        '置信度过滤会隐藏低分框，只保留模型比较相信的预测。阈值越高，结果越少但通常更保守。',
        '重点拖动阈值时看框数量如何变化，以及低分框是否先消失。'
    ),
    'detection:detections': (
        '最终检测结果由类别、分数和矩形框组成。它回答“有什么、在哪里”，但不回答精确轮廓。',
        '重点看框是否包住主体、类别是否正确、分数是否可信。'
    ),
    'semantic:encoder_context': (
        '语义分割先把整图编码成密集特征，每个位置既看局部纹理，也参考周围上下文。',
        '重点理解它不是找框，而是为每个像素准备分类依据。'
    ),
    'semantic:logits_summary': (
        '每个像素都会对所有类别打分。汇总图展示模型认为画面主要由哪些类别组成。',
        '重点看面积最大的类别是否符合原图内容。'
    ),
    'semantic:label_map': (
        '对每个像素取分数最高的类别，得到彩色类别地图。同类像素会用同一种颜色表示。',
        '重点看同类区域会合并；两个同类个体不会被分开。'
    ),
    'semantic:confidence': (
        '置信度图显示每个像素分类有多确定。边界、遮挡和小目标通常更暗。',
        '重点看暗区域，它们往往是模型最犹豫、最容易错的地方。'
    ),
    'semantic:boundaries': (
        '语义边界是类别发生变化的位置。叠回原图后可以检查分割边缘是否贴合真实轮廓。',
        '重点看边界是否沿着物体真实边缘走，而不是穿过物体内部。'
    ),
    'semantic:overlay': (
        '把类别颜色半透明盖到原图上，得到最终语义分割视图。',
        '重点看整张图被理解成哪些区域，但别期待它区分同类个体。'
    ),
    'instance:detector_stage': (
        '实例分割先像检测一样找出一个个可能物体框。每个框后面会单独预测 mask。',
        '重点看同类物体是否有各自的候选框，这是分开个体的前提。'
    ),
    'instance:mask_logits': (
        'mask 分支在每个候选框内部预测前景概率。亮的地方更可能属于当前实例。',
        '重点看概率图是不是集中在框内真实物体上，而不是背景上。'
    ),
    'instance:mask_threshold': (
        '把 mask 概率图按阈值切成前景和背景。阈值高会更保守，阈值低会覆盖更多区域。',
        '重点看轮廓大小如何随阈值变化。'
    ),
    'instance:masks': (
        '最终每个实例用不同颜色叠加。即使两个目标同类，也会被分配成不同个体。',
        '重点看同类物体是否分开，以及 mask 是否贴合边界。'
    ),
    'instance:instance_crops': (
        '把每个实例单独裁出来，方便检查 mask 有没有漏掉目标、吃进背景或和邻居粘连。',
        '重点逐个看实例质量，而不是只看总览图。'
    ),
}


def _specific_step_key(module_id, step):
    sid = str(step.get('id') or step.get('step') or '').lower()
    module_id = _canonical_module_id(module_id or 'module')
    if module_id == 'ai_eye':
        for prefix in ('detection_', 'semantic_', 'instance_'):
            if sid.startswith(prefix):
                return f'{prefix[:-1]}:{sid[len(prefix):]}'
    if module_id in {'gaussian', 'median', 'bilateral'}:
        return f'smoothing:{sid}'
    return f'{module_id}:{sid}'


def _strip_data_url(value):
    if isinstance(value, str) and value.startswith('data:image') and ',' in value:
        return value.split(',', 1)[1]
    return value


def _fallback_formula(module_id, step):
    sid = str(step.get('id') or step.get('step') or '').lower()
    name = str(step.get('name') or step.get('title') or '').lower()
    for key, formula in STEP_FORMULA_FALLBACKS.items():
        if sid == key or key in sid or key in name:
            return formula
    return MODULE_FORMULA_FALLBACKS.get(module_id, f'Y=f_{{{module_id}}}(X)')


def _fallback_explanation(module_id, normalized):
    name = normalized.get('name') or normalized.get('id') or 'step'
    return f'该步骤展示 {name}，是 {module_id} 算法流水线中的中间结果；后续步骤会基于它继续计算或汇总。'


def _module_problem_statement(module_id):
    module_id = _canonical_module_id(module_id or 'module')
    if module_id in MODULE_PROBLEM_STATEMENTS:
        return MODULE_PROBLEM_STATEMENTS[module_id]
    readable = str(module_id).replace('_', ' ')
    return (
        f'{readable} 要解决的问题是：把输入图像或数据转换成更容易观察、测量、判断的结果。'
        '页面会把输入、中间表示、关键计算和最终输出连起来，而不是只给一张结果图。'
    )


def _step_teaching_hint(step):
    specific = step.get('_specific_teaching')
    if isinstance(specific, (list, tuple)) and len(specific) >= 2:
        return specific[0], specific[1]
    text = f'{step.get("id", "")} {step.get("name", "")}'.lower()
    for keywords, plain, watch in STEP_TEACHING_RULES:
        if any(str(keyword).lower() in text for keyword in keywords):
            return plain, watch
    name = step.get('name') or step.get('id') or '当前步骤'
    return (
        f'{name} 是算法流水线里的一个中间环节，它把上一阶段的结果整理成下一阶段能继续使用的线索。',
        '重点看它相对上一张图或上一组数据发生了什么变化，以及这个变化怎样帮助最终任务。'
    )


def _clean_plain_explanation(explanation, problem=''):
    if not isinstance(explanation, str):
        return ''
    text = ' '.join(explanation.replace('\n', ' ').split()).strip()
    if not text:
        return ''
    if text.startswith('该步骤展示') or text.startswith('This step'):
        return ''
    if problem and text.startswith(problem):
        text = text[len(problem):].strip()
    if text.startswith('这一步：'):
        text = text[len('这一步：'):].strip()
    if len(text) < 12:
        return ''
    return text


def _apply_teaching_fields(module_id, step):
    if not isinstance(step, dict):
        return step
    problem = step.get('problem_statement') or _module_problem_statement(module_id)
    specific = SPECIFIC_STEP_TEACHING.get(_specific_step_key(module_id, step))
    if specific is not None:
        fallback_plain, watch = specific
        plain = step.get('plain_explanation') or fallback_plain
    else:
        fallback_plain, watch = _step_teaching_hint(step)
        plain = step.get('plain_explanation') or _clean_plain_explanation(step.get('explanation'), problem) or fallback_plain
    step['problem_statement'] = problem
    step['plain_explanation'] = plain
    if specific is not None:
        step['watch_for'] = watch
    else:
        step.setdefault('watch_for', watch)
    step.setdefault('teaching_summary', f'解决的问题：{problem} 这一步：{step["plain_explanation"]}')
    return step


def _enrich_steps_with_teaching_text(steps, module_id):
    if not isinstance(steps, list):
        return steps
    return [
        _apply_teaching_fields(module_id, step) if isinstance(step, dict) else step
        for step in steps
    ]


def _enrich_nested_algorithm_teaching(resp, module_id):
    algorithms = resp.get('algorithms')
    if not isinstance(algorithms, dict):
        return
    for algorithm_id, algorithm in algorithms.items():
        if not isinstance(algorithm, dict):
            continue
        child_id = _canonical_module_id(algorithm_id) if algorithm_id in MODULE_REGISTRY else module_id
        algorithm.setdefault('problem_statement', _module_problem_statement(child_id))
        if isinstance(algorithm.get('steps'), list):
            algorithm['steps'] = _enrich_steps_with_teaching_text(algorithm['steps'], child_id)


def _data_summary(data):
    if not isinstance(data, dict) or not data:
        return ''
    parts = []
    for key, value in list(data.items())[:4]:
        if isinstance(value, (list, tuple)):
            parts.append(f'{key}: len={len(value)}')
        elif isinstance(value, dict):
            parts.append(f'{key}: {len(value)} fields')
        else:
            parts.append(f'{key}: {value}')
    return ' | '.join(parts)


def _json_safe_step_data(value):
    """Keep step data useful without duplicating large inline images."""
    if hasattr(value, 'tolist'):
        value = value.tolist()
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if 'base64' in key_text or key_text in {'image', 'img', 'mask'}:
                continue
            out[key] = _json_safe_step_data(item)
        return out
    if isinstance(value, (list, tuple)):
        return [_json_safe_step_data(item) for item in value]
    return value


def _json_safe_overlay_data(value):
    """Keep explicit overlay geometry/masks while dropping unrelated image blobs."""
    if hasattr(value, 'tolist'):
        value = value.tolist()
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            key_text = str(key).lower()
            if key_text in {'image', 'img', 'image_base64', 'image_b64', 'focus_image_base64', 'thumbnail'}:
                continue
            out[key] = _json_safe_overlay_data(item)
        return out
    if isinstance(value, (list, tuple)):
        return [_json_safe_overlay_data(item) for item in value]
    return value


def _step_visual_card(module_id, normalized):
    import numpy as np
    from PIL import Image, ImageDraw

    width, height = 420, 260
    img = Image.new('RGB', (width, height), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    font_title = load_chinese_font(20)
    font_name = load_chinese_font(16)
    font_body = load_chinese_font(15)
    colors = [(13, 148, 136), (59, 130, 246), (124, 58, 237), (245, 158, 11)]
    accent = colors[abs(hash((module_id, normalized.get('id')))) % len(colors)]
    draw.rectangle((0, 0, width, 48), fill=accent)
    draw.text((18, 14), f'{module_id} / {normalized.get("id", "step")}', fill=(255, 255, 255), font=font_title)
    draw.text((18, 68), str(normalized.get('name', 'Process step'))[:44], fill=(15, 23, 42), font=font_name)
    formula = str(normalized.get('formula', 'Y=f(X)'))
    for i in range(0, min(len(formula), 108), 54):
        draw.text((18, 102 + (i // 54) * 22), formula[i:i + 54], fill=(51, 65, 85), font=font_body)
    summary = _data_summary(normalized.get('data'))
    if summary:
        draw.text((18, 176), summary[:58], fill=(71, 85, 105), font=font_body)
    y0 = 218
    for idx, h in enumerate([24, 54, 36, 72, 44]):
        x0 = 34 + idx * 70
        draw.rectangle((x0, y0 - h, x0 + 34, y0), fill=colors[idx % len(colors)])
    return np.array(img)


def _step_to_dict(step, module_id=None):
    if not isinstance(step, dict):
        return None
    module_id = module_id or 'module'
    out = {
        'id': step.get('id', step.get('step', '')),
        'name': step.get('name', step.get('title', '')),
    }
    img = step.get('image')
    if img is None:
        img = step.get('img')
    img_b64 = step.get('image_base64')
    if img_b64 is None:
        img_b64 = step.get('image_b64')
    if img is not None and not isinstance(img, (str, type(None))):
        try:
            out['image_base64'] = to_base64(img)
        except Exception:
            pass
    elif isinstance(img, str):
        out['image_base64'] = _strip_data_url(img)
    elif isinstance(img_b64, str):
        out['image_base64'] = _strip_data_url(img_b64)
    if step.get('explanation') or step.get('description'):
        out['explanation'] = step.get('explanation') or step.get('description', '')
    for teaching_key in ('problem_statement', 'plain_explanation', 'watch_for', 'teaching_summary'):
        if step.get(teaching_key):
            out[teaching_key] = step[teaching_key]
    if step.get('formula'):
        out['formula'] = step['formula']
    if step.get('formula_latex'):
        out['formula_latex'] = step['formula_latex']
    if isinstance(step.get('data'), dict):
        out['data'] = _json_safe_step_data(step['data'])
    if isinstance(step.get('chart'), dict):
        out['chart'] = _json_safe_step_data(step['chart'])
    for diagram_key in ('diagram', 'architecture'):
        if isinstance(step.get(diagram_key), dict):
            out['diagram'] = _json_safe_step_data(step[diagram_key])
            break
    if step.get('overlays') is not None:
        out['overlays'] = _json_safe_overlay_data(step['overlays'])
    for visual_key in ('visual_kind', 'overlay_scope'):
        if step.get(visual_key):
            out[visual_key] = step[visual_key]
    if isinstance(step.get('applications'), list):
        out['applications'] = list(step['applications'])
    if isinstance(step.get('channels'), list):
        channels = []
        for channel in step['channels']:
            if not isinstance(channel, dict):
                continue
            item = {
                k: v
                for k, v in channel.items()
                if k not in {'image', 'img', 'image_b64'}
            }
            ch_img = channel.get('image')
            if ch_img is None:
                ch_img = channel.get('img')
            if ch_img is not None and not isinstance(ch_img, str):
                try:
                    item['image_base64'] = to_base64(ch_img)
                except Exception:
                    pass
            elif isinstance(ch_img, str):
                item['image_base64'] = _strip_data_url(ch_img)
            elif isinstance(channel.get('image_b64'), str):
                item['image_base64'] = _strip_data_url(channel['image_b64'])
            elif isinstance(channel.get('image_base64'), str):
                item['image_base64'] = _strip_data_url(channel['image_base64'])
            channels.append(item)
        out['channels'] = channels
    if not out.get('formula'):
        out['formula'] = _fallback_formula(module_id, step)
    if not out.get('explanation'):
        out['explanation'] = _fallback_explanation(module_id, out)
    if not out.get('image_base64'):
        out['image_base64'] = to_base64(_step_visual_card(module_id, out))
    if out.get('diagram') and out.get('visual_kind') in (None, '', 'image', 'architecture'):
        out['visual_kind'] = 'architecture'
    elif out.get('chart') and out.get('visual_kind') in (None, '', 'image', 'chart'):
        out['visual_kind'] = 'chart'
    elif not out.get('visual_kind'):
        out['visual_kind'] = 'overlay_image' if out.get('overlays') else 'image'
    out.setdefault('overlay_scope', 'frame')
    _apply_teaching_fields(module_id, out)
    return out


def _normalize_pipeline_result(result, module_id=None):
    metrics = {}
    raw_steps = []
    if isinstance(result, dict):
        metrics = result.get('metrics', {})
        raw_steps = result.get('steps', [])
        if not raw_steps and 'result_image' in result:
            raw_steps = [{'id': 'result', 'name': 'Result', 'image': result['result_image']}]
    elif isinstance(result, (list, tuple)):
        if result and isinstance(result[0], list) and all(isinstance(s, dict) for s in result[0]):
            raw_steps = result[0]
            if len(result) > 2 and isinstance(result[2], dict):
                metrics = result[2]
        else:
            for item in result:
                if isinstance(item, (list, tuple)) and len(item) >= 3:
                    raw_steps.append({'id': str(item[0]), 'name': str(item[1]), 'image': item[2]})
                elif isinstance(item, dict):
                    raw_steps.append(item)

    if isinstance(result, dict):
        for step in raw_steps:
            if not isinstance(step, dict) or step.get('image') is not None or step.get('image_base64') is not None:
                continue
            sid = step.get('id') or step.get('step')
            if sid in result:
                step['image'] = result[sid]
            elif sid == 'formula' and result.get('result') is not None:
                step['image'] = result['result']
            elif sid == 'channels' and result.get('r_channel') is not None:
                step['image'] = result['r_channel']

    steps = []
    for step in raw_steps:
        normalized = _step_to_dict(step, module_id=module_id)
        if normalized is not None:
            steps.append(normalized)
    return steps, metrics


def _numeric_list(value, max_len=2048):
    if not isinstance(value, (list, tuple)) or len(value) < 2 or len(value) > max_len:
        return None
    out = []
    for item in value:
        if isinstance(item, (int, float)) and not isinstance(item, bool):
            out.append(float(item))
        else:
            return None
    return out


def _matrix_values(value, max_side=96):
    if not isinstance(value, (list, tuple)) or not value:
        return None
    rows = []
    width = None
    for row in value:
        nums = _numeric_list(row, max_len=max_side)
        if nums is None:
            return None
        width = width or len(nums)
        if len(nums) != width:
            return None
        rows.append(nums)
        if len(rows) > max_side:
            return None
    return rows if width and len(rows) >= 2 else None


def _short_curve(values, limit=512):
    if len(values) <= limit:
        return [round(float(v), 6) for v in values]
    stride = max(1, int(len(values) / limit))
    return [round(float(values[i]), 6) for i in range(0, len(values), stride)][:limit]


def _curve_label(path):
    key = path[-1] if path else 'curve'
    labels = {
        'histogram': '直方图',
        'equalized_histogram': '均衡化后直方图',
        'cdf': '累计分布 CDF',
        'mapping': '灰度映射',
        'alpha_bar': '扩散噪声日程',
        'losses': '训练损失',
        'scores': '分数',
        'attention': '注意力矩阵',
        'cost': '匹配代价矩阵',
    }
    return labels.get(str(key), str(key).replace('_', ' '))


def _collect_curves_from_value(value, path=None, curves=None, depth=0):
    path = [] if path is None else path
    curves = [] if curves is None else curves
    if depth > 5 or len(curves) >= 18:
        return curves
    matrix = _matrix_values(value)
    if matrix is not None:
        curves.append({
            'id': '_'.join(str(p) for p in path) or 'matrix',
            'name': _curve_label(path),
            'type': 'matrix',
            'values': [[round(float(v), 6) for v in row] for row in matrix],
        })
        return curves
    nums = _numeric_list(value)
    if nums is not None:
        curves.append({
            'id': '_'.join(str(p) for p in path) or 'series',
            'name': _curve_label(path),
            'type': 'series',
            'values': _short_curve(nums),
        })
        return curves
    if isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
        keys = sorted({k for item in value for k in item.keys()})
        for key in keys:
            series = []
            for item in value:
                val = item.get(key)
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    series.append(float(val))
                else:
                    series = []
                    break
            if len(series) >= 2:
                curves.append({
                    'id': '_'.join(str(p) for p in path + [key]),
                    'name': _curve_label(path + [key]),
                    'type': 'series',
                    'values': _short_curve(series),
                })
                if len(curves) >= 18:
                    return curves
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key).lower()
            if any(skip in key_text for skip in ('image', 'base64', 'mask', 'thumbnail')):
                continue
            _collect_curves_from_value(item, path + [key], curves, depth + 1)
            if len(curves) >= 18:
                break
    elif isinstance(value, list) and len(value) <= 24:
        for index, item in enumerate(value):
            _collect_curves_from_value(item, path + [index], curves, depth + 1)
            if len(curves) >= 18:
                break
    return curves


def _derive_curves(resp):
    curves = []
    for step in resp.get('steps') or []:
        data = step.get('data')
        if isinstance(data, dict):
            _collect_curves_from_value(data, [step.get('id') or 'step'], curves)
    for key in ('outputs', 'metrics'):
        if isinstance(resp.get(key), dict):
            _collect_curves_from_value(resp[key], [key], curves)
    seen = set()
    out = []
    for curve in curves:
        cid = curve.get('id')
        if cid in seen:
            continue
        seen.add(cid)
        out.append(curve)
    return out[:18]


def _walk_dicts(value, max_items=80):
    found = []
    def walk(item, depth=0):
        if depth > 6 or len(found) >= max_items:
            return
        if isinstance(item, dict):
            found.append(item)
            for child in item.values():
                walk(child, depth + 1)
        elif isinstance(item, list):
            for child in item[:max_items]:
                walk(child, depth + 1)
                if len(found) >= max_items:
                    break
    walk(value)
    return found


def _derive_overlays(resp):
    boxes = []
    points = []
    labels = []
    for item in _walk_dicts(resp.get('outputs', {})):
        box = item.get('box') or item.get('bbox')
        if isinstance(box, (list, tuple)) and len(box) >= 4:
            boxes.append({
                'box': [round(float(v), 3) for v in box[:4]],
                'label': str(item.get('label') or item.get('title') or item.get('class') or 'object'),
                'score': item.get('score'),
                'source': item.get('source') or 'backend_output',
            })
        if 'x' in item and 'y' in item and all(isinstance(item.get(k), (int, float)) for k in ('x', 'y')):
            points.append({'x': float(item['x']), 'y': float(item['y']), 'label': item.get('label', '')})
        if 'label' in item and ('ratio' in item or 'pixels' in item):
            labels.append({
                'label': item.get('label'),
                'ratio': item.get('ratio'),
                'pixels': item.get('pixels'),
                'label_id': item.get('label_id'),
            })
    overlays = {}
    if boxes:
        overlays['boxes'] = boxes[:60]
    if points:
        overlays['points'] = points[:80]
    if labels:
        overlays['labels'] = labels[:40]
    return overlays


def _derive_outputs(resp):
    outputs = {}
    for step in resp.get('steps') or []:
        data = step.get('data')
        if not isinstance(data, dict):
            continue
        for key in ('detections', 'instances', 'predictions', 'top5', 'top_queries', 'labels', 'channels'):
            if key in data and key not in outputs:
                outputs[key] = data[key]
    return outputs


def _normalize_frame(frame, module_id='module'):
    if not isinstance(frame, dict):
        return None
    raw = {
        'id': frame.get('id') or frame.get('step') or 'frame',
        'name': frame.get('name') or frame.get('title') or frame.get('id') or 'Frame',
        'explanation': frame.get('explanation') or frame.get('description') or '',
        'formula': frame.get('formula') or frame.get('formula_latex') or '',
        'data': frame.get('data') if isinstance(frame.get('data'), dict) else {},
    }
    for teaching_key in ('problem_statement', 'plain_explanation', 'watch_for', 'teaching_summary'):
        if frame.get(teaching_key):
            raw[teaching_key] = frame[teaching_key]
    image = frame.get('image') or frame.get('image_base64') or frame.get('image_b64') or frame.get('base_image')
    if image is not None:
        step = _step_to_dict({'id': raw['id'], 'name': raw['name'], 'image': image}, module_id=module_id)
        if step and step.get('image_base64'):
            raw['image_base64'] = step['image_base64']
    elif isinstance(frame.get('image_base64'), str):
        raw['image_base64'] = _strip_data_url(frame['image_base64'])
    if frame.get('overlays') is not None:
        raw['overlays'] = _json_safe_overlay_data(frame.get('overlays'))
    if isinstance(frame.get('chart'), dict):
        raw['chart'] = _json_safe_step_data(frame['chart'])
    for diagram_key in ('diagram', 'architecture'):
        if isinstance(frame.get(diagram_key), dict):
            raw['diagram'] = _json_safe_step_data(frame[diagram_key])
            break
    if frame.get('visual_kind'):
        raw['visual_kind'] = frame.get('visual_kind')
    if frame.get('overlay_scope'):
        raw['overlay_scope'] = frame.get('overlay_scope')
    if raw.get('diagram') and raw.get('visual_kind') in (None, '', 'image', 'architecture'):
        raw['visual_kind'] = 'architecture'
    elif raw.get('chart') and raw.get('visual_kind') in (None, '', 'image', 'chart'):
        raw['visual_kind'] = 'chart'
    elif not raw.get('visual_kind'):
        raw['visual_kind'] = 'overlay_image' if raw.get('overlays') else 'image'
    raw.setdefault('overlay_scope', 'frame')
    return _apply_teaching_fields(module_id, raw)


def _frames_from_steps(steps):
    return [
        {
            'id': step.get('id') or f'frame_{idx}',
            'name': step.get('name') or step.get('id') or f'Frame {idx + 1}',
            'image_base64': step.get('image_base64'),
            'visual_kind': 'architecture' if step.get('diagram') or step.get('architecture') else (step.get('visual_kind') or ('chart' if step.get('chart') else ('overlay_image' if step.get('overlays') else 'image'))),
            'overlay_scope': step.get('overlay_scope') or 'frame',
            'chart': step.get('chart'),
            'diagram': step.get('diagram') or step.get('architecture'),
            'overlays': step.get('overlays'),
            'explanation': step.get('explanation') or '',
            'formula': step.get('formula') or '',
            'data': step.get('data') or {},
            'problem_statement': step.get('problem_statement') or '',
            'plain_explanation': step.get('plain_explanation') or '',
            'watch_for': step.get('watch_for') or '',
            'teaching_summary': step.get('teaching_summary') or '',
        }
        for idx, step in enumerate(steps or [])
    ]


def _interactions_for_module(module_id, resp):
    metrics = resp.get('metrics') or {}
    steps = resp.get('steps') or []
    interactions = [
        {
            'id': 'timeline',
            'type': 'timeline',
            'label': '过程时间线',
            'source': 'frames',
            'frame_count': len(resp.get('frames') or steps),
        }
    ]
    if steps:
        interactions.append({
            'id': 'step_select',
            'type': 'select_step',
            'label': '选择中间步骤',
            'options': [
                {'value': idx, 'label': step.get('name') or step.get('id') or str(idx)}
                for idx, step in enumerate(steps)
            ],
        })
    module_controls = {
        'vit': [
            {'id': 'layer', 'name': 'layer', 'type': 'range', 'label': '注意力层', 'min': 1, 'max': 12, 'step': 1, 'value': metrics.get('layer', 12), 'rerun': True},
            {'id': 'head_idx', 'name': 'head_idx', 'type': 'range', 'label': '注意力头', 'min': 1, 'max': 12, 'step': 1, 'value': metrics.get('head_idx', 1), 'rerun': True},
            {'id': 'selected_patch', 'name': 'selected_patch', 'type': 'point_grid', 'label': '点击图片选择 Patch', 'rerun': True},
        ],
        'detr': [
            {'id': 'threshold', 'name': 'threshold', 'type': 'range', 'label': '检测阈值', 'min': 0.05, 'max': 0.95, 'step': 0.05, 'value': metrics.get('threshold', 0.5), 'rerun': True},
            {'id': 'query_idx', 'name': 'query_idx', 'type': 'range', 'label': 'Object Query', 'min': 0, 'max': max(0, int(metrics.get('num_queries', 100)) - 1), 'step': 1, 'value': metrics.get('query_idx', 0), 'rerun': True},
        ],
        'clip': [
            {'id': 'class_set', 'name': 'class_set', 'type': 'select', 'label': '候选词集', 'value': metrics.get('class_set', 'animals'), 'options': [
                {'value': 'animals', 'label': '动物'}, {'value': 'objects', 'label': '物体'}, {'value': 'scenes', 'label': '场景'},
            ], 'rerun': True},
            {'id': 'custom_classes', 'name': 'custom_classes', 'type': 'text', 'label': '自定义候选词（逗号分隔）', 'value': '', 'rerun': True},
        ],
        'nerf': [
            {'id': 'azimuth', 'name': 'azimuth', 'type': 'range', 'label': '相机方位角', 'min': -180, 'max': 180, 'step': 5, 'value': metrics.get('azimuth', 0), 'rerun': True},
        ],
        'gan': [
            {'id': 'iterations', 'name': 'iterations', 'type': 'range', 'label': '训练迭代', 'min': 80, 'max': 400, 'step': 20, 'value': metrics.get('iterations', 260), 'rerun': True},
        ],
        'diffusion': [
            {'id': 'num_steps', 'name': 'num_steps', 'type': 'range', 'label': '扩散步数', 'min': 8, 'max': 80, 'step': 2, 'value': metrics.get('steps', 50), 'rerun': True},
        ],
        'ddpm': [
            {'id': 'num_steps', 'name': 'num_steps', 'type': 'range', 'label': '扩散步数', 'min': 8, 'max': 80, 'step': 2, 'value': metrics.get('steps', 10), 'rerun': True},
        ],
        'stable_diffusion': [
            {'id': 'prompt', 'name': 'prompt', 'type': 'text', 'label': '文本提示词', 'value': metrics.get('prompt', 'a cat sitting on a chair'), 'rerun': True},
            {'id': 'num_steps', 'name': 'num_steps', 'type': 'range', 'label': '推理步数', 'min': 10, 'max': 30, 'step': 5, 'value': metrics.get('inference_steps', 20), 'rerun': True},
            {'id': 'guidance', 'name': 'guidance', 'type': 'range', 'label': 'CFG 引导强度', 'min': 1, 'max': 15, 'step': 0.5, 'value': metrics.get('guidance_scale', 7.5), 'rerun': True},
        ],
    }
    if module_id in {'ai_eye', 'detection', 'semantic', 'instance', 'yolo', 'unet'}:
        interactions.extend([
            {'id': 'score_threshold', 'name': 'score_threshold', 'type': 'range', 'label': '置信度阈值', 'min': 0.05, 'max': 0.95, 'step': 0.05, 'value': metrics.get('score_threshold', metrics.get('threshold', 0.5)), 'rerun': True},
            {'id': 'mask_threshold', 'name': 'mask_threshold', 'type': 'range', 'label': 'Mask 阈值', 'min': 0.1, 'max': 0.9, 'step': 0.05, 'value': metrics.get('mask_threshold', 0.5), 'rerun': True},
            {'id': 'object_select', 'type': 'object_select', 'label': '点击框或列表查看对象详情', 'source': 'outputs'},
        ])
    elif module_id == 'sam':
        interactions.extend([
            {'id': 'positive_point', 'type': 'point', 'label': '正点提示', 'name': 'points', 'rerun': True},
            {'id': 'negative_point', 'type': 'point', 'label': '负点提示', 'name': 'points', 'rerun': True},
            {'id': 'box_prompt', 'type': 'box', 'label': '框提示', 'name': 'box', 'rerun': True},
        ])
    interactions.extend(module_controls.get(module_id, []))
    return interactions


def _ensure_interactive_payload(resp, result, module_id):
    resp.setdefault('problem_statement', _module_problem_statement(module_id))
    resp['steps'] = _enrich_steps_with_teaching_text(resp.get('steps') or [], module_id)
    _enrich_nested_algorithm_teaching(resp, module_id)
    steps = resp.get('steps') or []
    raw_frames = resp.get('frames')
    if raw_frames:
        frames = [
            frame
            for frame in (_normalize_frame(item, module_id=module_id) for item in raw_frames)
            if frame is not None
        ]
    else:
        frames = _frames_from_steps(steps)
    resp['frames'] = _enrich_steps_with_teaching_text(frames, module_id)
    if not resp.get('outputs'):
        derived = _derive_outputs(resp)
        if derived:
            resp['outputs'] = derived
    if not resp.get('overlays'):
        resp['overlays'] = _derive_overlays(resp)
    if not resp.get('curves'):
        resp['curves'] = _derive_curves(resp)
    if not resp.get('interactions'):
        resp['interactions'] = _interactions_for_module(module_id, resp)
    if isinstance(result, dict) and result.get('algorithms') and not resp.get('outputs'):
        resp['outputs'] = {}
    return resp


def _json_demo_error(message, status_code, implementation, metrics=None, extra=None):
    payload = {
        'error': str(message),
        'steps': [],
        'metrics': metrics or {'status': 'error'},
        'implementation': implementation,
    }
    if isinstance(extra, dict):
        if isinstance(extra.get('steps'), list):
            payload['steps'] = [
                step
                for step in (_step_to_dict(s, module_id=extra.get('module_id') or 'module') for s in extra['steps'])
                if step is not None
            ]
        for key in (
            'models', 'outputs', 'algorithms', 'module_id', 'requested_module_id',
            'frames', 'overlays', 'curves', 'interactions',
        ):
            if key in extra:
                payload[key] = extra[key]
    return jsonify(payload), status_code


@main_bp.route('/api/demo/vision-real-status', methods=['GET'])
def vision_real_status():
    """Status endpoint consumed by detection/segmentation concept demos."""
    module_ids = ['detection', 'semantic', 'instance']
    modules = {}
    ready = True
    for module_id in module_ids:
        meta = get_implementation_meta(module_id)
        runnable = meta.get('category') not in {'not_implemented', 'requires_external_weights', 'model_not_available'}
        modules[module_id] = {
            'ready': bool(runnable),
            'category': meta.get('category'),
            'real_model': bool(meta.get('real_model')),
            'backend': meta.get('backend'),
            'model': meta.get('model'),
            'note': meta.get('note'),
        }
        ready = ready and bool(runnable)
    return jsonify({
        'ready': ready,
        'modules': modules,
        'note': 'Detection, semantic segmentation and instance segmentation demos have runnable local API pipelines.',
    })


@main_bp.route('/api/ai-eye/models', methods=['GET'])
def ai_eye_models():
    """Return AI Eye torchvision model catalog and local weight cache status."""
    from app.modules.phase4_deep_learning.ai_eye.processor import list_models
    return jsonify(list_models())


@main_bp.route('/gray/', methods=['POST'])
def legacy_grayscale():
    """
    Legacy endpoint for grayscale.html interactive page.
    Accepts: multipart file upload.
    Returns the richer JSON shape expected by the restored legacy
    grayscale/color-space page: image URLs, metadata, stats, histogram,
    and a history entry.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    unique_name, upload_path = _save_upload(file)

    from app.modules.phase1_fundamentals.grayscale.algorithm import weighted_average
    original = load_image_u8(upload_path, mode='rgb', max_side=1024)
    gray = weighted_average(original)
    result_name, _ = _save_legacy_result(gray, unique_name, 'gray_')

    original_url = f'/static/uploads/{unique_name}'
    result_url = f'/static/uploads/{result_name}'
    original_info = {
        **_legacy_file_info(upload_path),
        **_legacy_array_info(original),
    }
    result_info = _legacy_array_info(gray)
    stats = _legacy_pixel_stats(gray)
    histogram = _legacy_histogram(gray)
    entry = _legacy_add_history_entry(
        'gray',
        '灰度转换',
        original_url,
        result_url,
        original_filename=file.filename,
        original_info=original_info,
        result_info=result_info,
        stats=stats,
        histogram=histogram,
        metadata={'algorithm': 'weighted_average', 'formula': 'Y=0.299R+0.587G+0.114B'},
    )

    return jsonify({
        'original_image': original_url,
        'result_image': result_url,
        'result_image_base64': to_base64(gray),
        'original_width': int(original.shape[1]),
        'original_height': int(original.shape[0]),
        'original_info': original_info,
        'result_info': result_info,
        'stats': stats,
        'histogram': histogram,
        'entry': entry,
        'history': _legacy_history_snapshot(),
    })


@main_bp.route('/edge/', methods=['POST'])
def legacy_edge():
    """
    Legacy endpoint for edge.html interactive page.
    Accepts: multipart file upload + form fields (low, high, threshold)
    Returns: JSON with pipeline steps (base64 images)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    unique_name, upload_path = _save_upload(file)

    low = int(request.form.get('low', 50))
    high = int(request.form.get('high', 150))
    threshold = int(request.form.get('threshold', 80))

    from app.modules.phase2_classical.edge.processor import build_sobel_pipeline, build_canny_pipeline

    sobel_data = build_sobel_pipeline(upload_path, threshold=threshold)
    canny_data = build_canny_pipeline(upload_path, low=low, high=high)

    def _serialize_steps(data):
        serialized = []
        for step in data['steps']:
            image_b64 = to_base64(step['image'])
            serialized.append({
                'id': step['id'],
                'name': step['name'],
                'image': f'data:image/png;base64,{image_b64}',
                'image_b64': image_b64,
                'explanation': step.get('explanation', ''),
            })
        return serialized

    sobel_steps = _serialize_steps(sobel_data)
    canny_steps = _serialize_steps(canny_data)

    return jsonify({
        'original_image': f'/static/uploads/{unique_name}',
        'sobel': {'steps': sobel_steps, 'metrics': sobel_data['metrics']},
        'canny': {'steps': canny_steps, 'metrics': canny_data['metrics']},
        'pipelines': {
            'sobel': {'steps': sobel_steps, 'metrics': sobel_data['metrics']},
            'canny': {'steps': canny_steps, 'metrics': canny_data['metrics']},
        },
        'edge_pipelines': {
            'sobel': {'steps': sobel_steps, 'metrics': sobel_data['metrics']},
            'canny': {'steps': canny_steps, 'metrics': canny_data['metrics']},
        },
        'thresholds': {'sobel': threshold, 'low': low, 'high': high},
        'implementation': {
            'display_pipeline': 'Sobel / Canny 教学流水线',
            'compute_backend': 'NumPy',
            'jit_enabled': False,
        },
        'history': [],
    })


@main_bp.route('/corner/', methods=['POST'])
def legacy_corner():
    """
    Legacy endpoint for corner.html (Harris corner detection).
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    unique_name, upload_path = _save_upload(file)

    k = float(request.form.get('k', 0.04))
    threshold_ratio = float(request.form.get('threshold_ratio', 0.01))

    from app.modules.phase2_classical.corner.processor import build_pipeline as corner_pipeline

    steps, points, metrics, vis = corner_pipeline(
        upload_path, k=k, threshold_ratio=threshold_ratio)

    serialized_steps = []
    for s in steps:
        image_b64 = to_base64(s['image'])
        serialized_steps.append({
            'id': s['id'],
            'name': s['name'],
            'image': f'data:image/png;base64,{image_b64}',
            'image_b64': image_b64,
            'explanation': s.get('explanation', ''),
        })

    return jsonify({
        'original_image': f'/static/uploads/{unique_name}',
        'steps': serialized_steps,
        'pipelines': {'harris': {'steps': serialized_steps, 'metrics': metrics}},
        'corner_pipelines': {'harris': {'steps': serialized_steps, 'metrics': metrics}},
        'history': [],
        'points': points[:200],
        'metrics': metrics,
        'visualization': vis,
    })


@main_bp.route('/sift/', methods=['POST'])
def legacy_sift():
    """
    Legacy endpoint for sift.html (SIFT feature detection).
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    unique_name, upload_path = _save_upload(file)

    from app.modules.phase2_classical.sift.processor import build_pipeline as sift_pipeline_builder

    steps, keypoints, candidates, metrics, vis = sift_pipeline_builder(upload_path)

    serialized_steps = []
    for s in steps:
        image_b64 = to_base64(s['image'])
        serialized_steps.append({
            'id': s['id'],
            'name': s['name'],
            'image': f'data:image/png;base64,{image_b64}',
            'image_b64': image_b64,
            'explanation': s.get('explanation', ''),
        })

    return jsonify({
        'original_image': f'/static/uploads/{unique_name}',
        'steps': serialized_steps,
        'pipelines': {'sift': {'steps': serialized_steps, 'metrics': metrics}},
        'sift_pipelines': {'sift': {'steps': serialized_steps, 'metrics': metrics}},
        'history': [],
        'keypoints': keypoints,
        'candidates': candidates,
        'metrics': metrics,
        'visualization': vis,
    })


@main_bp.route('/match/', methods=['POST'])
def legacy_match():
    """
    Legacy endpoint for match.html (feature matching and stitching).
    Accepts: multipart left/right uploads + algorithm + ratio
    Returns: image URLs, metrics, and visualization data for match-page.js.
    """
    left_file = request.files.get('left')
    right_file = request.files.get('right')
    if not left_file or not right_file:
        return jsonify({'error': 'Missing left or right image'}), 400
    if left_file.filename == '' or right_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    method = request.form.get('algorithm', 'sift')
    if method not in ('sift', 'harris'):
        return jsonify({'error': f'Unsupported matching algorithm: {method}'}), 400

    try:
        ratio = float(request.form.get('ratio', 0.8))
    except ValueError:
        ratio = 0.8
    ratio = max(0.45, min(0.95, ratio))

    left_name, left_path = _save_upload(left_file)
    right_name, right_path = _save_upload(right_file)

    from app.modules.phase3_intermediate.match.algorithm import build_match_pipeline

    data = build_match_pipeline(left_path, right_path, method=method, ratio=ratio)

    import uuid
    result_dir = os.path.join(PROJECT_ROOT, 'static', 'results')
    os.makedirs(result_dir, exist_ok=True)
    pair_name = f"{uuid.uuid4().hex}_matches.png"
    stitch_name = f"{uuid.uuid4().hex}_stitch.png"
    pair_path = os.path.join(result_dir, pair_name)
    stitch_path = os.path.join(result_dir, stitch_name)
    iio.imwrite(pair_path, data['match_preview'])
    iio.imwrite(stitch_path, data['stitched'])

    left_features = len(data['pts1'])
    right_features = len(data['pts2'])
    matches = data['matches']
    inliers = int(data['inlier_count'])
    if inliers >= 4:
        stitch_status = 'ok'
        stitch_method = 'homography_inliers'
    elif len(matches) >= 4:
        stitch_status = 'ok'
        stitch_method = 'homography_all_matches'
    else:
        stitch_status = 'failed'
        stitch_method = 'insufficient_matches'

    descriptor_samples = {}
    for idx, desc in enumerate(data.get('desc1', [])[:80]):
        descriptor_samples[str(idx)] = [round(float(v), 5) for v in desc[:32]]

    return jsonify({
        'left_image': f'/static/uploads/{left_name}',
        'right_image': f'/static/uploads/{right_name}',
        'pair_image': f'/static/results/{pair_name}',
        'stitch_image': f'/static/results/{stitch_name}',
        'metrics': {
            'algorithm': method,
            'ratio': ratio,
            'left_features': left_features,
            'right_features': right_features,
            'matches': len(matches),
            'raw_matches': int(data['raw_count']),
            'inliers': inliers,
            'stitch_status': stitch_status,
            'stitch_method': stitch_method,
        },
        'visualization': {
            'left_size': [int(data['left'].shape[1]), int(data['left'].shape[0])],
            'right_size': [int(data['right'].shape[1]), int(data['right'].shape[0])],
            'left_points': data['pts1'][:260],
            'right_points': data['pts2'][:260],
            'matches': matches[:120],
            'homography': data['H'],
            'descriptor_samples': descriptor_samples,
        },
    })


# ---- History API (used by old interactive pages) ----
@main_bp.route('/api/history', methods=['GET', 'DELETE'])
def legacy_history():
    """History endpoint for restored legacy interactive pages."""
    if request.method == 'DELETE':
        module_key = request.args.get('module_key') or request.args.get('module')
        return jsonify({'cleared': _legacy_clear_history(module_key)})
    return jsonify({'history': _legacy_history_snapshot()})


@main_bp.route('/api/history/<int:entry_id>', methods=['DELETE'])
def legacy_history_delete(entry_id):
    return jsonify({'deleted': _legacy_remove_history_entry(entry_id), 'id': entry_id})


# ---- Conv training API (used by conv_training.html) ----
@main_bp.route('/conv/api/train', methods=['POST'])
def legacy_conv_train():
    """Kernel training endpoint for conv_training interactive page."""
    data = request.get_json(silent=True) or {}
    preset = data.get('target_preset') or data.get('preset', 'edge_detect')
    kernel_size = int(data.get('kernel_size', 3))
    input_size = int(data.get('input_size', 7))
    lr = float(data.get('learning_rate', 0.1))
    iterations = int(data.get('iterations', 100))

    from app.modules.phase4_deep_learning.conv_training.algorithm import train_kernel
    result = train_kernel(
        target_preset=preset, kernel_size=kernel_size,
        input_size=input_size, learning_rate=lr, iterations=iterations)
    return jsonify(result)


def _to_grayscale_float(img):
    import numpy as np
    arr = np.asarray(img).astype(np.float32)
    if arr.max(initial=0) > 1.0:
        arr /= 255.0

    if arr.ndim == 2:
        return np.clip(arr, 0.0, 1.0)

    if arr.ndim == 3:
        rgb = arr[:, :, :3]
        if arr.shape[2] >= 4:
            alpha = arr[:, :, 3:4]
            rgb = rgb * alpha + (1.0 - alpha)
        gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        return np.clip(gray, 0.0, 1.0)

    raise ValueError('unsupported image shape')


def _resize_bilinear(img, out_h, out_w):
    import numpy as np
    in_h, in_w = img.shape
    if in_h == out_h and in_w == out_w:
        return img.astype(np.float32).copy()

    ys = np.linspace(0, in_h - 1, out_h, dtype=np.float32) if out_h > 1 else np.array([(in_h - 1) / 2], dtype=np.float32)
    xs = np.linspace(0, in_w - 1, out_w, dtype=np.float32) if out_w > 1 else np.array([(in_w - 1) / 2], dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, in_h - 1)
    x1 = np.minimum(x0 + 1, in_w - 1)
    wy = (ys - y0).reshape(out_h, 1)
    wx = (xs - x0).reshape(1, out_w)

    top = img[y0[:, None], x0[None, :]] * (1 - wx) + img[y0[:, None], x1[None, :]] * wx
    bottom = img[y1[:, None], x0[None, :]] * (1 - wx) + img[y1[:, None], x1[None, :]] * wx
    return (top * (1 - wy) + bottom * wy).astype(np.float32)


def _preprocess_digit_image(img):
    import numpy as np
    img = _to_grayscale_float(img)

    border = np.concatenate([img[0, :], img[-1, :], img[:, 0], img[:, -1]])
    if float(np.median(border)) > 0.5:
        img = 1.0 - img

    img = np.clip(img, 0.0, 1.0)
    max_val = float(np.max(img))
    if max_val <= 1e-6:
        return np.zeros((28, 28), dtype=np.float32)

    threshold = max(0.08, min(0.35, max_val * 0.25))
    rows, cols = np.where(img > threshold)
    if rows.size == 0 or cols.size == 0:
        return _resize_bilinear(img, 28, 28)

    pad = 2
    y0 = max(int(rows.min()) - pad, 0)
    y1 = min(int(rows.max()) + pad + 1, img.shape[0])
    x0 = max(int(cols.min()) - pad, 0)
    x1 = min(int(cols.max()) + pad + 1, img.shape[1])
    crop = img[y0:y1, x0:x1]

    scale = 20.0 / max(crop.shape)
    new_h = max(1, int(round(crop.shape[0] * scale)))
    new_w = max(1, int(round(crop.shape[1] * scale)))
    digit = _resize_bilinear(crop, new_h, new_w)
    digit_max = float(np.max(digit))
    if digit_max > 1e-6:
        digit = digit / digit_max

    canvas = np.zeros((28, 28), dtype=np.float32)
    mass = float(np.sum(digit))
    if mass > 1e-6:
        yy, xx = np.indices(digit.shape, dtype=np.float32)
        top = int(round(14.0 - float(np.sum(yy * digit) / mass)))
        left = int(round(14.0 - float(np.sum(xx * digit) / mass)))
    else:
        top = (28 - new_h) // 2
        left = (28 - new_w) // 2

    top = max(0, min(28 - new_h, top))
    left = max(0, min(28 - new_w, left))
    canvas[top:top + new_h, left:left + new_w] = digit
    return np.clip(canvas, 0.0, 1.0)


@main_bp.route('/conv/api/compute', methods=['POST'])
def legacy_conv_compute():
    data = request.get_json(force=True)
    mode = data.get('mode', 'basic')
    inp = data.get('input')
    stride = data.get('stride', 1)
    padding = data.get('padding', 0)
    dilation = data.get('dilation', 1)
    kernel = data.get('kernel')

    from app.modules.phase1_fundamentals.convolution.processor import (
        conv2d_multi_channel,
        conv2d_multi_kernel,
        conv2d_with_trace,
    )

    try:
        if mode == 'basic':
            return jsonify(conv2d_with_trace(inp, kernel, stride=stride, padding=padding, dilation=dilation))
        if mode == 'multi_kernel':
            kernels = data.get('kernels', [kernel])
            outputs = conv2d_multi_kernel(inp, kernels, stride=stride, padding=padding)
            return jsonify({'outputs': outputs, 'num_kernels': len(kernels)})
        if mode == 'multi_channel':
            kernel_3d = data.get('kernel_3d', [kernel])
            return jsonify(conv2d_multi_channel(inp, kernel_3d, stride=stride, padding=padding))
        if mode in {'conv1x1', 'dilated'}:
            return jsonify(conv2d_with_trace(inp, kernel, stride=stride, padding=padding, dilation=dilation))
        return jsonify({'error': 'Unknown mode'}), 400
    except Exception as exc:
        return jsonify({'error': str(exc)}), 400


@main_bp.route('/conv/api/generate', methods=['POST'])
def legacy_conv_generate():
    data = request.get_json(force=True)
    from app.modules.phase1_fundamentals.convolution.processor import generate_matrix
    return jsonify({'matrix': generate_matrix(data.get('h', 7), data.get('w', 7), seed=data.get('seed'))})


@main_bp.route('/conv/api/kernel', methods=['POST'])
def legacy_conv_kernel():
    data = request.get_json(force=True)
    from app.modules.phase1_fundamentals.convolution.processor import generate_kernel
    return jsonify({'kernel': generate_kernel(data.get('size', 3), preset=data.get('preset', 'random'), seed=data.get('seed'))})


@main_bp.route('/conv/api/predict', methods=['POST'])
def legacy_conv_predict():
    import base64
    import io
    from imageio.v3 import imread

    if request.is_json:
        data = request.get_json(force=True)
        img_b64 = data.get('image', '')
        img_bytes = base64.b64decode(img_b64.split(',', 1)[-1] if ',' in img_b64 else img_b64)
    else:
        f = request.files.get('image')
        if not f:
            return jsonify({'error': 'no image provided'}), 400
        img_bytes = f.read()

    img = _preprocess_digit_image(imread(io.BytesIO(img_bytes)))
    from app.modules.phase1_fundamentals.convolution.lenet import predict

    result = predict(img)
    if result is None:
        return jsonify({
            'prediction': 0,
            'probabilities': [0.1] * 10,
            'warning': 'No trained weights found.',
        })
    return jsonify(result)


@main_bp.route('/conv/backprop')
def legacy_conv_backprop_page():
    return render_template('pages/lenet_backprop.html', static_version=lambda: 'cv_comprehensive')


@main_bp.route('/conv/api/backprop_trace', methods=['POST'])
def legacy_conv_backprop_trace():
    data = request.get_json(silent=True) or {}
    try:
        from app.modules.phase1_fundamentals.convolution.backprop import compute_backprop_trace
        return jsonify(compute_backprop_trace(sample_digit=data.get('digit'), reset=bool(data.get('reset', False))))
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@main_bp.route('/conv/api/forward_trace', methods=['POST'])
def legacy_conv_forward_trace():
    import base64
    import io
    from imageio.v3 import imread

    data = request.get_json(force=True)
    img_b64 = data.get('image', '')
    if not img_b64:
        return jsonify({'error': 'no image provided'}), 400

    img_bytes = base64.b64decode(img_b64.split(',', 1)[-1] if ',' in img_b64 else img_b64)
    img = _preprocess_digit_image(imread(io.BytesIO(img_bytes)))

    try:
        from app.modules.phase1_fundamentals.convolution.backprop import compute_forward_trace
        return jsonify(compute_forward_trace(img))
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


# ---- Race benchmark data (for race.html) ----
@main_bp.route('/static/data/edge_race_benchmark.json')
def legacy_race_data():
    """Return edge detection benchmark data for race.html."""
    return jsonify({
        'algorithms': ['naive', 'optimized', 'numba'],
        'image_sizes': [64, 128, 256, 512, 1024],
        'timings_ms': {
            'naive': [0.5, 2.1, 8.5, 34.2, 138.0],
            'optimized': [0.2, 0.8, 3.1, 12.5, 50.0],
            'numba': [0.05, 0.15, 0.5, 2.0, 8.0],
        },
    })


# ---- Generic demo API for all algorithm modules ----

# Module dispatcher: maps module_id -> (processor_func, param_defaults)
def _get_demo_processor(module_id):
    """Return (build_pipeline_func, default_params) for a given module_id."""
    module_id = _canonical_module_id(module_id)
    params = {}

    if module_id in LOCAL_TEACHING_MODEL_MODULES:
        from app.modules.offline_teaching import build_pipeline as _local_teaching_pipeline
        def local_teaching_wrapper(**kwargs):
            return _local_teaching_pipeline(module_id, **kwargs)
        return local_teaching_wrapper, params

    if module_id in LOCAL_FRONTIER_ALGORITHM_MODULES:
        from app.modules.phase5_frontier.local_algorithms import build_pipeline as _local_frontier_pipeline
        def local_frontier_wrapper(**kwargs):
            return _local_frontier_pipeline(module_id, **kwargs)
        return local_frontier_wrapper, params

    if module_id in EXTERNAL_WEIGHT_MODULES:
        from app.modules.offline_teaching import external_weight_error as _external_error
        def external_wrapper(**kwargs):
            return _external_error(module_id)
        return external_wrapper, params

    if module_id in OFFLINE_TEACHING_MODULES:
        from app.modules.offline_teaching import build_pipeline as _offline_pipeline
        def offline_wrapper(**kwargs):
            return _offline_pipeline(module_id, **kwargs)
        return offline_wrapper, params

    # Phase 4 real implementations (ex-offline-teaching)
    if module_id == 'resnet':
        from app.modules.phase4_deep_learning.resnet.algorithm import build_pipeline as fn
    elif module_id == 'gan':
        from app.modules.phase4_deep_learning.gan.algorithm import build_pipeline as fn
    elif module_id == 'ddpm':
        from app.modules.phase4_deep_learning.ddpm.algorithm import build_pipeline as fn
    elif module_id == 'yolo':
        from app.modules.phase4_deep_learning.yolo.algorithm import build_pipeline as fn
    elif module_id == 'unet':
        from app.modules.phase4_deep_learning.unet.algorithm import build_pipeline as fn
    elif module_id == 'simclr':
        from app.modules.phase5_frontier.simclr.algorithm import build_pipeline as fn
    elif module_id == 'moco':
        from app.modules.phase5_frontier.moco.algorithm import build_pipeline as fn
    elif module_id == 'byol':
        from app.modules.phase5_frontier.byol.algorithm import build_pipeline as fn
    elif module_id == 'ijepa':
        from app.modules.phase5_frontier.ijepa.algorithm import build_pipeline as fn
    elif module_id == '3dgs':
        import importlib
        mod = importlib.import_module('app.modules.phase5_frontier.3dgs.algorithm')
        fn = mod.build_pipeline
    elif module_id == 'pointnet':
        from app.modules.phase5_frontier.pointnet.algorithm import build_pipeline as fn
    elif module_id == 'bev':
        from app.modules.phase5_frontier.bev.algorithm import build_pipeline as fn
    elif module_id == 'occupy':
        from app.modules.phase5_frontier.occupy.algorithm import build_pipeline as fn
    elif module_id == 'c3d':
        from app.modules.phase5_frontier.c3d.algorithm import build_pipeline as fn
    elif module_id == 'bytetrack':
        from app.modules.phase5_frontier.bytetrack.algorithm import build_pipeline as fn
    elif module_id == 'botsort':
        from app.modules.phase5_frontier.botsort.algorithm import build_pipeline as fn
    elif module_id == 'deeppose':
        from app.modules.phase5_frontier.deeppose.algorithm import build_pipeline as fn
    elif module_id == 'openpose':
        from app.modules.phase5_frontier.openpose.algorithm import build_pipeline as fn
    elif module_id == 'nerf':
        from app.modules.phase5_frontier.nerf.algorithm import build_pipeline as fn
    elif module_id == 'cnn_basics':
        from app.modules.phase4_deep_learning.cnn_basics.algorithm import build_pipeline as fn
    elif module_id == 'conv_training':
        from app.modules.phase4_deep_learning.conv_training.algorithm import build_pipeline as fn
    # fcn, faster_rcnn, mask_rcnn: keep aliases but use the unified AI Eye backend
    elif module_id == 'fcn':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_semantic_pipeline as _ai_semantic
        def fn(**kwargs):
            kwargs.setdefault('model', 'fcn_resnet50')
            result = _ai_semantic(**kwargs)
            result['module_id'] = 'semantic'
            return result
    elif module_id == 'faster_rcnn':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_detection_pipeline as _ai_detection
        def fn(**kwargs):
            kwargs.setdefault('model', 'fasterrcnn_resnet50_fpn')
            result = _ai_detection(**kwargs)
            result['module_id'] = 'detection'
            return result
        params = {'score_threshold': 0.3}
    elif module_id == 'mask_rcnn':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_instance_pipeline as _ai_instance
        def fn(**kwargs):
            kwargs.setdefault('model', 'maskrcnn_resnet50_fpn')
            result = _ai_instance(**kwargs)
            result['module_id'] = 'instance'
            return result
        return fn, params

    elif module_id in {'smoothing', 'gaussian', 'median', 'bilateral'}:
        from app.modules.phase1_fundamentals.smoothing.algorithm import build_pipeline as _smoothing_fn
        def fn(**kwargs):
            kwargs.setdefault('requested_algorithm', module_id)
            return _smoothing_fn(**kwargs)
    elif module_id == 'noise':
        from app.modules.phase1_fundamentals.noise.algorithm import build_pipeline as fn
    elif module_id == 'sobel':
        from app.modules.phase1_fundamentals.sobel.algorithm import build_pipeline as fn
    elif module_id == 'nms':
        from app.modules.phase2_classical.nms.algorithm import build_pipeline as fn
    elif module_id == 'template_match':
        from app.modules.phase2_classical.template_match.algorithm import build_pipeline as fn
    elif module_id == 'shitomasi':
        from app.modules.phase2_classical.shitomasi.algorithm import build_pipeline as fn
        params = {'threshold_ratio': 0.01, 'min_distance': 3}
    elif module_id == 'kmeans':
        from app.modules.phase3_intermediate.kmeans.algorithm import build_pipeline as fn
    elif module_id == 'colorspace':
        from app.modules.phase1_fundamentals.colorspace.processor import build_pipeline as fn
    elif module_id == 'grayscale':
        from app.modules.phase1_fundamentals.grayscale.processor import build_pipeline as fn
    elif module_id == 'convolution':
        from app.modules.phase1_fundamentals.convolution.algorithm import build_conv_demo as fn
    elif module_id == 'histogram':
        from app.modules.phase1_fundamentals.histogram.processor import build_pipeline as fn
    elif module_id == 'threshold':
        from app.modules.phase1_fundamentals.threshold.processor import build_pipeline as fn
        params = {'method': 'otsu', 'threshold': 128, 'block_size': 11, 'C': 2}
    elif module_id == 'edge':
        from app.modules.phase2_classical.edge.processor import build_canny_pipeline as fn
    elif module_id == 'corner':
        from app.modules.phase2_classical.corner.processor import build_pipeline as _corner_fn
        _corner_valid = {'image_path','k','threshold_ratio','nms','window_size','sigma','nms_radius'}
        def fn(**kwargs):
            filtered = {k:v for k,v in kwargs.items() if k in _corner_valid}
            result = _corner_fn(**filtered)
            # Returns (steps, points, metrics, vis) tuple — normalize to dict
            if isinstance(result, tuple):
                return {'steps': result[0], 'metrics': result[2]}
            return result
    elif module_id == 'sift':
        from app.modules.phase2_classical.sift.processor import build_pipeline as _sift_fn
        _sift_valid = {'image_path','sigma','num_layers','k_stride','threshold','border','gamma','octaves'}
        def fn(**kwargs):
            filtered = {k:v for k,v in kwargs.items() if k in _sift_valid}
            result = _sift_fn(**filtered)
            # Returns (steps, kp, cand, metrics, vis) tuple — normalize to dict
            if isinstance(result, tuple):
                return {'steps': result[0], 'metrics': result[3]}
            return result
    elif module_id == 'hough':
        from app.modules.phase2_classical.hough.processor import build_pipeline as fn
    elif module_id == 'morphology':
        from app.modules.phase2_classical.morphology.processor import build_pipeline as fn
    elif module_id == 'contour':
        from app.modules.phase2_classical.contour.processor import build_pipeline as fn
    elif module_id == 'match':
        from app.modules.phase3_intermediate.match.algorithm import build_match_pipeline as _match_fn
        params = {'method': 'sift', 'ratio': 0.75}
        def match_wrapper(left_path=None, right_path=None, image_path=None, upload_path=None, method='sift', ratio=0.75, **kw):
            lp = left_path or right_path or image_path or upload_path
            rp = right_path or left_path or image_path or upload_path
            r = _match_fn(lp, rp, method=method, ratio=ratio)
            if isinstance(r, dict) and 'left' in r and 'steps' not in r:
                steps = []
                if r.get('left') is not None: steps.append({'id':'left','name':'Left Matches','image':r['left']})
                if r.get('right') is not None: steps.append({'id':'right','name':'Right Matches','image':r['right']})
                return {'steps': steps, 'metrics': {}}
            return r
        fn = match_wrapper
    elif module_id == 'watershed':
        from app.modules.phase3_intermediate.watershed.processor import build_pipeline as fn
    elif module_id == 'grabcut':
        from app.modules.phase3_intermediate.grabcut.processor import build_pipeline as fn
        params = {'x': 30, 'y': 30, 'w': 160, 'h': 160}
    elif module_id == 'slic':
        from app.modules.phase3_intermediate.slic.processor import build_pipeline as fn
        params = {'num_superpixels': 200, 'compactness': 10.0}
    elif module_id == 'ncuts':
        from app.modules.phase3_intermediate.ncuts.algorithm import build_pipeline as fn
        params = {'sigma_i': 0.1, 'sigma_x': 0.05, 'max_regions': 5}
    elif module_id == 'bovw_spm':
        from app.modules.phase3_intermediate.bovw_spm.algorithm import build_pipeline as fn
        params = {'vocab_size': 200}
    elif module_id == 'calibration':
        from app.modules.phase3_intermediate.calibration.algorithm import build_pipeline as fn
        params = {'rows': 6, 'cols': 9, 'square_size': 35}
    elif module_id == 'epipolar':
        from app.modules.phase3_intermediate.epipolar.algorithm import build_pipeline as fn
        params = {'ratio': 0.75}
    elif module_id == 'sfm':
        from app.modules.phase3_intermediate.sfm.algorithm import build_pipeline as fn
        params = {'ratio': 0.75}
    elif module_id == 'hog_svm':
        from app.modules.phase3_intermediate.hog_svm.processor import build_pipeline as fn
    elif module_id == 'optical_flow':
        from app.modules.phase3_intermediate.optical_flow.processor import build_pipeline as fn
    elif module_id == 'stereo':
        from app.modules.phase3_intermediate.stereo.processor import build_pipeline as fn
    elif module_id == 'frequency':
        from app.modules.phase3_intermediate.frequency.processor import build_pipeline as fn
    elif module_id == 'diffusion':
        from app.modules.phase4_deep_learning.diffusion.processor import build_pipeline as fn
        params = {'num_steps': 50}
    elif module_id == 'ai_eye':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_pipeline as fn
    elif module_id == 'detection':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_detection_pipeline as _ai_detection
        def fn(**kwargs):
            result = _ai_detection(**kwargs)
            result['module_id'] = 'detection'
            return result
    elif module_id == 'semantic':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_semantic_pipeline as _ai_semantic
        def fn(**kwargs):
            result = _ai_semantic(**kwargs)
            result['module_id'] = 'semantic'
            return result
    elif module_id == 'instance':
        from app.modules.phase4_deep_learning.ai_eye.processor import build_instance_pipeline as _ai_instance
        def fn(**kwargs):
            result = _ai_instance(**kwargs)
            result['module_id'] = 'instance'
            return result
    elif module_id == 'lenet':
        from app.modules.phase4_deep_learning.lenet.processor import build_inference_trace as fn
    elif module_id == 'live':
        from app.modules.phase1_fundamentals.live.algorithm import build_pipeline as fn
    elif module_id == 'vit':
        from app.modules.phase5_frontier.vit.processor import build_pipeline as fn
    elif module_id == 'detr':
        from app.modules.phase5_frontier.detr.processor import build_pipeline as fn
    elif module_id == 'sam':
        from app.modules.phase5_frontier.sam.processor import build_pipeline as fn
    elif module_id == 'clip':
        from app.modules.phase5_frontier.clip.processor import build_pipeline as fn
    elif module_id == 'stable_diffusion':
        from app.modules.phase5_frontier.stable_diffusion.processor import build_pipeline as fn
    else:
        # Generic real-computation fallback — no module left behind
        def _generic_real(**kwargs):
            import numpy as np
            import io, base64
            from PIL import Image
            from app.utils.image_utils import load_image_u8, ensure_gray
            img_path = kwargs.get('image_path') or kwargs.get('upload_path')
            if img_path:
                img = load_image_u8(img_path, mode='rgb', max_side=256)
            else:
                img = (np.ones((128,128,3), dtype=np.uint8) * 128)
            gray = ensure_gray(img).astype(np.float64)
            gy, gx = np.gradient(gray)
            mag = np.sqrt(gx*gx + gy*gy)
            ang = np.arctan2(gy, gx)
            h, w = gray.shape

            # Real feature extraction
            features = {
                'mean_intensity': float(gray.mean()),
                'std_intensity': float(gray.std()),
                'mean_gradient': float(mag.mean()),
                'std_gradient': float(mag.std()),
                'gradient_energy': float(np.sum(mag)),
                'edge_pixels': int((mag > mag.mean()*1.5).sum()),
                'dominant_angle': float(np.median(ang[mag > mag.mean()])),
            }

            def _b64(arr):
                b = io.BytesIO(); Image.fromarray(arr).save(b, 'PNG')
                return base64.b64encode(b.getvalue()).decode()

            mag_vis = np.clip(mag / max(float(mag.max()), 1e-8) * 255, 0, 255).astype(np.uint8)
            ang_vis = ((ang / np.pi + 1) / 2 * 255).astype(np.uint8)

            # Feature bar chart
            fvis = np.zeros((150, 400, 3), dtype=np.uint8) + 20
            keys = list(features.keys())[:5]
            for i, k in enumerate(keys):
                v = features[k]
                max_v = max(features.values())
                bar_h = int(v / max(max_v, 1e-8) * 100)
                x0 = 30 + i * 72
                fvis[135-bar_h:135, x0:x0+40, :] = [59, 130, 246]
            fvis_pil = Image.fromarray(fvis)

            return {'steps': [
                {'id': 'input', 'name': '输入图像', 'image': img,
                 'explanation': '输入图像。对其提取数值特征进行计算。'},
                {'id': 'gradient', 'name': '梯度幅值', 'image': mag_vis,
                 'explanation': 'Sobel梯度幅值——亮度变化越大的地方越亮。'},
                {'id': 'angle', 'name': '梯度方向', 'image': ang_vis,
                 'explanation': '梯度方向角编码为灰度。每像素的方向信息都来自真实计算。'},
                {'id': 'features', 'name': '特征统计', 'image': np.array(fvis_pil),
                 'explanation': f'均值强度={features["mean_intensity"]:.1f}, 均值梯度={features["mean_gradient"]:.3f}, 边缘像素={features["edge_pixels"]}。'},
            ], 'metrics': {
                'status': 'numpy_algorithm', 'backend': 'NumPy real computation',
                'module_id': module_id, 'mean_intensity': round(features['mean_intensity'], 2),
                'gradient_energy': round(features['gradient_energy'], 1),
                'edge_pixels': features['edge_pixels'],
            }}

        fn = _generic_real
        params = {}
        return fn, params

    return fn, params


@main_bp.route('/api/demo/<module_id>', methods=['POST'])
def demo_endpoint(module_id):
    """
    Generic demo endpoint for all algorithm modules.
    Accepts: multipart file upload + optional form params
    Returns: { steps: [...], metrics: {...}, original_image: url }
    """
    requested_module_id = module_id
    module_id = _canonical_module_id(module_id)
    fn, defaults = _get_demo_processor(module_id)
    if fn is None:
        implementation = get_implementation_meta(module_id)
        return _json_demo_error(
            f'Unknown module: {module_id}',
            404,
            implementation,
            {'status': 'unknown_module', 'module_id': module_id},
            extra={'module_id': module_id, 'requested_module_id': requested_module_id},
        )

    implementation = get_implementation_meta(module_id)
    if implementation.get('category') == 'requires_external_weights':
        result = fn()
        return _json_demo_error(
            result.get('error', implementation.get('note', 'External weights required.')),
            503,
            implementation,
            result.get('metrics', {'status': 'requires_external_weights'}),
            extra={'module_id': module_id, 'requested_module_id': requested_module_id},
        )
    if implementation.get('category') == 'not_implemented':
        return _json_demo_error(
            implementation.get('note') or f'{module_id} has no real implementation wired.',
            501,
            implementation,
            {'status': 'not_implemented'},
            extra={'module_id': module_id, 'requested_module_id': requested_module_id},
        )
    requires_upload = bool(implementation.get('requires_upload', True))

    try:
        sig = inspect.signature(fn)
        valid_keys = set(sig.parameters.keys())
        # If function uses **kwargs (variadic), include everything
        if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
            valid_keys = None  # Signal to pass all kwargs
    except (ValueError, TypeError):
        valid_keys = None

    # Collect params from form data, falling back to defaults
    kwargs = dict(defaults)
    for key in request.args:
        val = request.args[key]
        try:
            if '.' in val: kwargs[key] = float(val)
            else: kwargs[key] = int(val)
        except ValueError:
            kwargs[key] = val
    for key in request.form:
        val = request.form[key]
        try:
            if '.' in val: kwargs[key] = float(val)
            else: kwargs[key] = int(val)
        except ValueError:
            kwargs[key] = val

    if 'file' in request.files and request.files['file'].filename:
        file = request.files['file']
        unique_name, upload_path = _save_upload(file)
        kwargs['image_path'] = upload_path
        kwargs['upload_path'] = upload_path
        if valid_keys is None or 'left_path' in valid_keys: kwargs['left_path'] = upload_path
        if valid_keys is None or 'right_path' in valid_keys: kwargs['right_path'] = upload_path
        if valid_keys is None or 'image' in valid_keys:
            kwargs['image'] = load_image_u8(upload_path, mode='rgb', max_side=1024)
        if valid_keys is None or 'image_28x28' in valid_keys:
            from PIL import Image
            img = Image.open(upload_path).convert('L').resize((28,28))
            import numpy as np
            kwargs['image_28x28'] = np.array(img, dtype=np.float32)
        original_url = f'/static/uploads/{unique_name}'
    elif requires_upload and _demo_fixture_path():
        upload_path = _demo_fixture_path()
        kwargs['image_path'] = upload_path
        kwargs['upload_path'] = upload_path
        if valid_keys is None or 'left_path' in valid_keys: kwargs['left_path'] = upload_path
        if valid_keys is None or 'right_path' in valid_keys: kwargs['right_path'] = upload_path
        if valid_keys is None or 'image' in valid_keys:
            kwargs['image'] = load_image_u8(upload_path, mode='rgb', max_side=1024)
        if valid_keys is None or 'image_28x28' in valid_keys:
            from PIL import Image
            img = Image.open(upload_path).convert('L').resize((28,28))
            import numpy as np
            kwargs['image_28x28'] = np.array(img, dtype=np.float32)
        original_url = '/static/images/demo-street.jpg'
    else:
        kwargs['image_path'] = None
        kwargs['upload_path'] = None
        original_url = None

    # Filter kwargs to only what the function accepts
    if valid_keys is not None:
        filtered = {k: v for k, v in kwargs.items() if k in valid_keys}
    else:
        filtered = dict(kwargs)
    try:
        result = fn(**filtered)
    except FileNotFoundError as exc:
        return _json_demo_error(exc, 503, implementation, {'status': 'model_not_available'},
                                extra={'module_id': module_id, 'requested_module_id': requested_module_id})
    except ImportError as exc:
        return _json_demo_error(exc, 503, implementation, {'status': 'dependency_not_available'},
                                extra={'module_id': module_id, 'requested_module_id': requested_module_id})
    except Exception as exc:
        return _json_demo_error(exc, 500, implementation, {
            'status': 'processor_error',
            'module_id': module_id,
            'error_type': type(exc).__name__,
        }, extra={'module_id': module_id, 'requested_module_id': requested_module_id})
    if isinstance(result, dict) and result.get('error'):
        result_status = result.get('metrics', {}).get('status')
        status_code = 503 if result_status in {'model_not_available', 'requires_external_weights'} else 400
        error_extra = dict(result)
        error_extra.setdefault('module_id', module_id)
        error_extra['requested_module_id'] = requested_module_id
        return _json_demo_error(result['error'], status_code, implementation, result.get('metrics', {}), extra=error_extra)

    steps_out, metrics = _normalize_pipeline_result(result, module_id=module_id)
    resp_module_id = result.get('module_id', module_id) if isinstance(result, dict) else module_id
    resp = {
        'steps': steps_out,
        'metrics': metrics,
        'module_id': resp_module_id,
        'requested_module_id': requested_module_id,
    }
    if isinstance(result, dict):
        for extra_key in (
            'algorithms', 'family_module_id', 'models', 'outputs', 'task',
            'frames', 'overlays', 'curves', 'interactions',
        ):
            if extra_key in result:
                resp[extra_key] = result[extra_key]
    if original_url:
        resp['original_image'] = original_url
    resp['implementation'] = implementation
    resp = _ensure_interactive_payload(resp, result if isinstance(result, dict) else {}, module_id)
    return jsonify(resp)


# ---- Register all module API endpoints ----
for _mid, _cls in list(MODULE_REGISTRY.items()):
    if hasattr(_cls, 'get_api_endpoints'):
        for ep in _cls.get_api_endpoints():
            main_bp.add_url_rule(
                ep['rule'],
                endpoint=ep.get('endpoint'),
                view_func=ep['handler'],
                methods=ep.get('methods', ['GET']),
            )
