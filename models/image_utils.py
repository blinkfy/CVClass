import numpy as np
from PIL import Image
from numba import njit, prange

# 图像灰度化
def image_to_gray(image, method="weighted"):
    rgba_image = image.convert("RGBA")
    rgba_array = np.asarray(rgba_image, dtype=np.float32)

    r = rgba_array[:, :, 0]
    g = rgba_array[:, :, 1]
    b = rgba_array[:, :, 2]
    alpha = rgba_array[:, :, 3].astype(np.uint8)

    if method == "weighted":
        gray_array = 0.299 * r + 0.587 * g + 0.114 * b
    elif method == "average":
        gray_array = (r + g + b) / 3
    elif method == "max":
        gray_array = np.maximum(np.maximum(r, g), b)
    elif method == "min":
        gray_array = np.minimum(np.minimum(r, g), b)

    gray_array = np.clip(gray_array, 0, 255).astype(np.uint8)
    # 是单通道就可以，但为了保留透明度通道，只好把灰度值复制到 RGB 三个通道上了
    gray_rgba = np.dstack([gray_array, gray_array, gray_array, alpha])
    gray_image = Image.fromarray(gray_rgba, mode="RGBA")
    return gray_array, gray_image


def image_to_rgba_array(image):
    return np.asarray(image.convert("RGBA"), dtype=np.uint8)

def rgba_array_to_image(arr):
    arr = np.asarray(arr)
    if arr.ndim == 2:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        arr = np.dstack([
            arr,
            arr,
            arr,
            np.full_like(arr, 255)
        ])
    elif arr.ndim == 3 and arr.shape[2] == 3:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        alpha = np.full(arr.shape[:2], 255, dtype=np.uint8)
        arr = np.dstack([arr, alpha])
    elif arr.ndim == 3 and arr.shape[2] == 4:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    else:
        raise ValueError(f"Unsupported image array shape: {arr.shape}")
    return Image.fromarray(arr, mode="RGBA")

def rgb_to_gray_array(rgba_array, method="weighted"):
    rgb_array = rgba_array[:, :, :3].astype(np.float32)
    r = rgb_array[:, :, 0]
    g = rgb_array[:, :, 1]
    b = rgb_array[:, :, 2]

    if method == "weighted":
        gray_array = 0.299 * r + 0.587 * g + 0.114 * b
    elif method == "average":
        gray_array = (r + g + b) / 3
    elif method == "max":
        gray_array = np.maximum(np.maximum(r, g), b)
    elif method == "min":
        gray_array = np.minimum(np.minimum(r, g), b)

    return np.clip(gray_array, 0, 255).astype(np.uint8)


def gray_array_to_rgba(gray_array, alpha):
    return np.dstack([gray_array, gray_array, gray_array, alpha]).astype(np.uint8)

# 分离 RGB 通道
def split_rgb_channel(image, channel):
    rgba_array = image_to_rgba_array(image)
    result = np.zeros_like(rgba_array)
    channel_indexes = {"red": 0, "green": 1, "blue": 2}

    if channel not in channel_indexes:
        raise ValueError("invalid rgb channel")

    channel_index = channel_indexes[channel]
    result[:, :, channel_index] = rgba_array[:, :, channel_index]
    result[:, :, 3] = rgba_array[:, :, 3]
    return rgb_to_gray_array(result), rgba_array_to_image(result)

# 二值化
def binary_image(image, threshold=128, method="weighted"):
    rgba_array = image_to_rgba_array(image)
    gray_array = rgb_to_gray_array(rgba_array, method)
    binary_array = np.where(gray_array >= threshold, 255, 0).astype(np.uint8)
    result = gray_array_to_rgba(binary_array, rgba_array[:, :, 3])
    return binary_array, rgba_array_to_image(result)

# 反色
def invert_image(image):
    rgba_array = image_to_rgba_array(image)
    result = rgba_array.copy()
    result[:, :, :3] = 255 - result[:, :, :3]
    return rgb_to_gray_array(result), rgba_array_to_image(result)

# 翻转
def flip_image(image, direction):
    rgba_array = image_to_rgba_array(image)

    if direction == "horizontal":
        result = rgba_array[:, ::-1, :]
    elif direction == "vertical":
        result = rgba_array[::-1, :, :]

    return rgb_to_gray_array(result), rgba_array_to_image(result)

# 逆时针旋转 90 度
def rotate_left_90(image):
    rgba_array = image_to_rgba_array(image)
    result = np.rot90(rgba_array, k=1)
    return rgb_to_gray_array(result), rgba_array_to_image(result)

# def rotate_left_90(image):
#     rgba_array = image_to_rgba_array(image)
#     H, W, C = rgba_array.shape
#     transposed = rgba_array.transpose(1, 0, 2)
#     P = np.eye(W)[::-1]  # (W,W)
#     flat = transposed.reshape(W, -1)# (W,H*C)
#     result_flat = P @ flat
#     result = result_flat.reshape(W, H, C)
#     return rgb_to_gray_array(result), rgba_array_to_image(result)

# 直方图均衡化
def equalize_gray_histogram(image, method="weighted"):
    rgba_array = image_to_rgba_array(image)
    gray_array = rgb_to_gray_array(rgba_array, method)
    histogram = np.bincount(gray_array.ravel(), minlength=256)
    cdf = histogram.cumsum()
    nonzero_cdf = cdf[cdf > 0]

    if nonzero_cdf.size == 0:
        equalized = gray_array
    else:
        cdf_min = nonzero_cdf[0]
        total_pixels = gray_array.size
        denominator = total_pixels - cdf_min
        if denominator == 0:
            equalized = gray_array
        else:
            mapping = np.round((cdf - cdf_min) / denominator * 255)
            mapping = np.clip(mapping, 0, 255).astype(np.uint8)
            equalized = mapping[gray_array]

    result = gray_array_to_rgba(equalized, rgba_array[:, :, 3])
    result[:,:,:3]=(rgba_array[:,:,:3].astype(np.float32)*(equalized.astype(np.float32)/255)[:, :, np.newaxis]).astype(np.uint8)
    return equalized, rgba_array_to_image(result)


def process_image(image, operation="grayscale", method="weighted", channel="red", threshold=128):
    if operation == "grayscale":
        return image_to_gray(image, method)
    if operation == "channel":
        return split_rgb_channel(image, channel)
    if operation == "binary":
        return binary_image(image, threshold, method)
    if operation == "invert":
        return invert_image(image)
    if operation == "flip_horizontal":
        return flip_image(image, "horizontal")
    if operation == "flip_vertical":
        return flip_image(image, "vertical")
    if operation == "rotate_90":
        return rotate_left_90(image)
    if operation == "equalize":
        return equalize_gray_histogram(image, method)

    raise ValueError("invalid image operation")


def make_histogram(gray_array):
    histogram = np.bincount(gray_array.ravel(), minlength=256)
    return histogram.astype(int).tolist()


@njit
def _convolve_channel_parallel(padded_channel, kernel_array, stride, out_h, out_w):
    size = kernel_array.shape[0]
    result = np.zeros((out_h, out_w), dtype=np.float32)

    for out_r in range(out_h):
        for out_c in range(out_w):
            start_r = out_r * stride
            start_c = out_c * stride
            acc = 0.0

            for kernel_r in range(size):
                for kernel_c in range(size):
                    acc += padded_channel[start_r + kernel_r, start_c + kernel_c] * kernel_array[kernel_r, kernel_c]

            result[out_r, out_c] = acc

    return result


def convolve_gray_image(image, kernel, padding=None, stride=1, display_mode="auto"):
    rgba_array = image_to_rgba_array(image)
    rgb_array = rgba_array[:, :, :3].astype(np.float32)
    kernel_array = np.asarray(kernel, dtype=np.float32)

    if kernel_array.ndim != 2 or kernel_array.shape[0] != kernel_array.shape[1]:
        raise ValueError("kernel must be a square matrix")
    if kernel_array.shape[0] not in (1, 3, 5):
        raise ValueError("kernel size must be 1, 3 or 5")
    if stride < 1:
        raise ValueError("stride must be positive")
    if display_mode not in {"auto", "clip", "normalize"}:
        raise ValueError("invalid display mode")

    kernel_sum = float(kernel_array.sum())
    has_negative = bool(np.any(kernel_array < 0))
    if kernel_sum > 1 and not has_negative:
        kernel_array = kernel_array / kernel_sum

    size = kernel_array.shape[0]
    if padding is None:
        padding = size // 2
    if padding < 0:
        raise ValueError("padding must be non-negative")

    out_h = (rgb_array.shape[0] + 2 * padding - size) // stride + 1
    out_w = (rgb_array.shape[1] + 2 * padding - size) // stride + 1
    if out_h <= 0 or out_w <= 0:
        raise ValueError("kernel is larger than the padded image")

    result_channels = []
    for channel_index in range(3):
        channel = rgb_array[:, :, channel_index]
        padded = np.pad(channel, ((padding, padding), (padding, padding)), mode="edge")
        result_channels.append(_convolve_channel_parallel(padded, kernel_array, stride, out_h, out_w))

    result_stack = np.stack(result_channels, axis=-1)

    if display_mode == "auto":
        display_mode = "clip" if has_negative else "normalize"

    if display_mode == "clip":
        display = np.clip(result_stack, 0, 255)
    elif display_mode == "normalize":
        min_value = result_stack.min()
        max_value = result_stack.max()
        if max_value > min_value:
            display = (result_stack - min_value) / (max_value - min_value) * 255
        else:
            display = np.zeros_like(result_stack)
    else:
        raise ValueError("invalid display mode")

    display = np.clip(display, 0, 255).astype(np.uint8)
    if display.shape[:2] == rgba_array[:, :, 3].shape:
        alpha = rgba_array[:, :, 3]
    else:
        alpha_image = Image.fromarray(rgba_array[:, :, 3], mode="L").resize(
            (display.shape[1], display.shape[0]),
            Image.Resampling.BILINEAR,
        )
        alpha = np.asarray(alpha_image, dtype=np.uint8)

    output = np.dstack([display, alpha]).astype(np.uint8)
    return display, rgba_array_to_image(output)

@njit
def convolve(padded,kernel,stride,out_h,out_w):
    size=kernel.shape[0]
    result=np.zeros((out_h,out_w),dtype=np.float32)
    for out_r in range(out_h):
        for out_c in range(out_w):
            start_r=out_r*stride
            start_c=out_c*stride
            s=0.0
            for kr in range(size):
                for kc in range(size):
                    s+=padded[start_r+kr,start_c+kc]*kernel[kr,kc]
            result[out_r,out_c]=s
    return result

# 边缘检测
def _edge_detect(img,method="sobel_x"):
    if method=="sobel_x":
        kernel=[[-1,0,1],[-2,0,2],[-1,0,1]]
    elif method=="sobel_y":
        kernel=[[-1,-2,-1],[0,0,0],[1,2,1]]
    elif method=="prewitt_x":
        kernel=[[-1,0,1],[-1,0,1],[-1,0,1]]
    elif method=="prewitt_y":
        kernel=[[-1,-1,-1],[0,0,0],[1,1,1]]
    elif method=="laplacian":
        kernel=[[0,1,0],[1,-4,1],[0,1,0]]
    elif method=="laplacian_8":
        kernel=[[1,1,1],[1,-8,1],[1,1,1]]
    elif method=="roberts_x":
        kernel=[[1,0],[0,-1]]
    elif method=="roberts_y":
        kernel=[[0,1],[-1,0]]
    elif method=="scharr_x":
        kernel=[[-3,0,3],[-10,0,10],[-3,0,3]]
    elif method=="scharr_y":
        kernel=[[-3,-10,-3],[0,0,0],[3,10,3]]
    elif method == "kirsch_n":
        kernel = [[-3,-3,5],[-3,0,5],[-3,-3,5]]
    elif method == "kirsch_ne":
        kernel = [[-3,-3,-3],[-3,0,5],[-3,5,5]]
    elif method == "kirsch_e":
        kernel = [[-3,-3,-3],[-3,0,-3],[5,5,5]]
    elif method == "kirsch_se":
        kernel = [[-3,-3,-3],[5,0,-3],[5,5,-3]]
    elif method == "kirsch_s":
        kernel = [[ 5,-3,-3],[5,0,-3],[5,-3,-3]]
    elif method == "kirsch_sw":
        kernel = [[5,5,-3],[5,0,-3],[-3,-3,-3]]
    elif method == "kirsch_w":
        kernel = [[5,5,5],[-3,0,-3],[-3,-3,-3]]
    elif method == "kirsch_nw":
        kernel = [[-3,5,5],[-3,0,5],[-3,-3,-3]]
    elif method=="LoG":
        kernel=[[0,0,-1,0,0],[0,-1,-2,-1,0],[-1,-2,16,-2,-1],[0,-1,-2,-1,0],[0,0,-1,0,0]]
    else:
        kernel=[[0,0,0],[0,1,0],[0,0,0]]
    kernel=np.asarray(kernel,dtype=np.float32)
    pad=kernel.shape[0]//2
    if method in ["roberts_x", "roberts_y"]:
        padded=np.pad(img,((pad,pad),(pad,pad)),mode="edge")
    else:
        padded=np.pad(img,((pad,pad),(0,0)),mode="edge")
    grad=convolve(padded,kernel,1,img.shape[0],img.shape[1])
    return grad

def edge_detect(image, method="sobel"):
    img=image_to_gray(image)[0]
    if method in ["sobel","prewitt","roberts","scharr"]:
        grad_x=_edge_detect(img,method+"_x")
        grad_y=_edge_detect(img,method+"_y")
        grad=np.hypot(grad_x,grad_y)
        grad=np.clip(grad,0,255).astype(np.uint8)
    elif method=="kirsch":
        grads=[]
        for direction in ["n","ne","e","se","s","sw","w","nw"]:
            grads.append(_edge_detect(img,f"kirsch_{direction}"))
        grad=np.max(np.stack(grads,axis=-1),axis=-1)
        grad=np.clip(grad,0,255).astype(np.uint8)
    else:
        grad=_edge_detect(img,method)
        grad=np.abs(grad)
        grad=np.clip(grad,0,255).astype(np.uint8)
    rgb_result=np.stack([grad]*3,axis=-1)
    return grad,rgba_array_to_image(rgb_result)

@njit
def interp(grad,r,c):
    r0,c0=int(np.floor(r)),int(np.floor(c))
    r1,c1=r0+1,c0+1
    dr,dc=r-r0,c-c0
    h,w=grad.shape
    r0=max(0,min(r0,h-1))
    r1=max(0,min(r1,h-1))
    c0=max(0,min(c0,w-1))
    c1=max(0,min(c1,w-1))
    val=(1-dr)*(1-dc)*grad[r0,c0] + dr*(1-dc)*grad[r1,c0] + (1-dr)*dc*grad[r0,c1] + dr*dc*grad[r1,c1]
    return val

@njit
def nms(grad,angle,precise=False):
    if precise:
        nms=np.zeros_like(grad,dtype=np.float32)
        for r in range(1,grad.shape[0]-1):
            for c in range(1,grad.shape[1]-1):
                g=grad[r,c]
                angle_rad=angle[r,c]*np.pi/180
                dx=np.cos(angle_rad)
                dy=np.sin(angle_rad)
                g1=interp(grad,r+dy,c+dx)
                g2=interp(grad,r-dy,c-dx)
                if g>=g1 and g>=g2:
                    nms[r,c]=g
                # if 0<=pos1_r<grad.shape[0] and 0<=pos1_c<grad.shape[1] and 0<=pos2_r<grad.shape[0] and 0<=pos2_c<grad.shape[1]:
                #     nms[r,c]=grad[r,c] if grad[r,c]>=grad[pos1_r,pos1_c] and grad[r,c]>=grad[pos2_r,pos2_c] else 0
    else:
        nms=np.zeros_like(grad,dtype=np.float32)
        for r in range(1,grad.shape[0]-1):
            for c in range(1,grad.shape[1]-1):
                if angle[r,c]>=22.5 and angle[r,c]<67.5:
                    nms[r,c]=grad[r,c] if grad[r,c]>=grad[r-1,c+1] and grad[r,c]>=grad[r+1,c-1] else 0
                elif angle[r,c]>=67.5 and angle[r,c]<112.5:
                    nms[r,c]=grad[r,c] if grad[r,c]>=grad[r-1,c] and grad[r,c]>=grad[r+1,c] else 0
                elif angle[r,c]>=112.5 and angle[r,c]<157.5:
                    nms[r,c]=grad[r,c] if grad[r,c]>=grad[r-1,c-1] and grad[r,c]>=grad[r+1,c+1] else 0
                else:
                    nms[r,c]=grad[r,c] if grad[r,c]>=grad[r,c+1] and grad[r,c]>=grad[r,c-1] else 0
    return nms

def canny(image,threshold1=50,threshold2=150,apertureSize=5,L2gradient=False,precise=False):
    img=image_to_gray(image)[0]
    #高斯
    sigma=0.3*((apertureSize-1)*0.5-1)+0.8
    ax=np.arange(-apertureSize//2+1,apertureSize//2+1)
    xx,yy=np.meshgrid(ax,ax)#坐标网格
    k_gas=np.exp(-(xx**2+yy**2)/(2*sigma**2))
    k_gas/=np.sum(k_gas)
    pad=apertureSize//2
    padded=np.pad(img,((pad,pad),(pad,pad)),mode="edge")
    blurred=convolve(padded,k_gas,1,img.shape[0],img.shape[1])
    #Sobel
    grad_x=_edge_detect(blurred,"sobel_x")
    grad_y=_edge_detect(blurred,"sobel_y")
    if L2gradient:
        grad=np.hypot(grad_x,grad_y)
    else:
        grad=np.abs(grad_x)+np.abs(grad_y)
    angle=np.arctan2(grad_y,grad_x)*(180/np.pi)%180
    #nms
    nmsret=nms(grad,angle,precise)
    #dfs
    if threshold1>threshold2:
        threshold1,threshold2=threshold2,threshold1
    h,w=nmsret.shape
    edges=nmsret>=threshold2
    strong=np.argwhere(edges)
    directions=[(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
    stack=list(map(tuple,strong))
    while stack:
        r,c=stack.pop()
        for dr,dc in directions:
            nr,nc=r+dr,c+dc
            if 0<=nr<h and 0<=nc<w:
                if nmsret[nr,nc]>=threshold1 and not edges[nr,nc]:
                    edges[nr,nc]=True
                    stack.append((nr,nc))
    edges=edges.astype(np.uint8)*255
    rgb_result=np.stack([edges]*3,axis=-1)
    return img,blurred,(grad,angle),nmsret,edges,rgba_array_to_image(rgb_result)