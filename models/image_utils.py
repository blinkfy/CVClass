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

def fliter(img,method="sobel_x"):
    kernalmap={
        "sobel_x":np.array([[-1,0,1],[-2,0,2],[-1,0,1]],dtype=np.float32),
        "sobel_y":np.array([[-1,-2,-1],[0,0,0],[1,2,1]],dtype=np.float32),
        "prewitt_x":np.array([[-1,0,1],[-1,0,1],[-1,0,1]],dtype=np.float32),
        "prewitt_y":np.array([[-1,-1,-1],[0,0,0],[1,1,1]],dtype=np.float32),
        "laplacian":np.array([[0,1,0],[1,-4,1],[0,1,0]],dtype=np.float32),
        "laplacian_8":np.array([[1,1,1],[1,-8,1],[1,1,1]],dtype=np.float32),
        "roberts_x":np.array([[1,0],[0,-1]],dtype=np.float32),
        "roberts_y":np.array([[0,1],[-1,0]],dtype=np.float32),
        "scharr_x":np.array([[-3,0,3],[-10,0,10],[-3,0,3]],dtype=np.float32),
        "scharr_y":np.array([[-3,-10,-3],[0,0,0],[3,10,3]],dtype=np.float32),
        "kirsch_n":np.array([[-3,-3,5],[-3,0,5],[-3,-3,5]],dtype=np.float32),
        "kirsch_ne":np.array([[-3,-3,-3],[-3,0,5],[-3,5,5]],dtype=np.float32),
        "kirsch_e":np.array([[-3,-3,-3],[-3,0,-3],[5,5,5]],dtype=np.float32),
        "kirsch_se":np.array([[-3,-3,-3],[5,0,-3],[5,5,-3]],dtype=np.float32),
        "kirsch_s":np.array([[ 5,-3,-3],[5,0,-3],[5,-3,-3]],dtype=np.float32),
        "kirsch_sw":np.array([[5,5,-3],[5,0,-3],[-3,-3,-3]],dtype=np.float32),
        "kirsch_w":np.array([[5,5,5],[-3,0,-3],[-3,-3,-3]],dtype=np.float32),
        "kirsch_nw":np.array([[-3,5,5],[-3,0,5],[-3,-3,-3]],dtype=np.float32),
        "LoG":np.array([[0,0,-1,0,0],[0,-1,-2,-1,0],[-1,-2,16,-2,-1],[0,-1,-2,-1,0],[0,0,-1,0,0]],dtype=np.float32),
    }
    kernel=kernalmap.get(method,np.array([[1]],dtype=np.float32))
    pad=kernel.shape[0]//2
    if method in ["roberts_x", "roberts_y"]:
        padded=np.pad(img,((0,pad),(0,pad)),mode="edge")
    else:
        padded=np.pad(img,((pad,pad),(pad,pad)),mode="edge")
    grad=convolve(padded,kernel,1,img.shape[0],img.shape[1])
    return grad

def edge_detect(image, method="sobel"):
    img=image_to_gray(image)[0]
    if method in ["sobel","prewitt","roberts","scharr"]:
        grad_x=fliter(img,method+"_x")
        grad_y=fliter(img,method+"_y")
        grad=np.hypot(grad_x,grad_y)
        grad=np.clip(grad,0,255).astype(np.uint8)
    elif method=="kirsch":
        grads=[]
        for direction in ["n","ne","e","se","s","sw","w","nw"]:
            grads.append(fliter(img,f"kirsch_{direction}"))
        grad=np.max(np.stack(grads,axis=-1),axis=-1)
        grad=np.clip(grad,0,255).astype(np.uint8)
    else:
        grad=fliter(img,method)
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

def gaussian_blur(img,kernel_size=5,sigma=None):
    if sigma is None:
        sigma=0.3*((kernel_size-1)*0.5-1)+0.8
    ax=np.arange(-kernel_size//2+1,kernel_size//2+1)
    xx,yy=np.meshgrid(ax,ax)
    kernel=np.exp(-(xx**2+yy**2)/(2*sigma**2))
    kernel/=np.sum(kernel)
    pad=kernel_size//2
    padded=np.pad(img,((pad,pad),(pad,pad)),mode="edge")
    blurred=convolve(padded,kernel,1,img.shape[0],img.shape[1])
    return blurred

@njit(parallel=True)
def gaussian_blur2(img,kernel_size=5,sigma=None):
    if sigma is None:
        sigma=0.3*((kernel_size-1)*0.5-1)+0.8
    half=kernel_size//2
    ax=np.arange(-half,half+1)
    kernel_1d=np.exp(-ax**2/(2*sigma**2))
    kernel_1d/=np.sum(kernel_1d)
    h,w = img.shape
    tmp=np.empty_like(img,dtype=np.float32)
    out=np.empty_like(img,dtype=np.float32)

    for i in prange(h):
        for j in range(w):
            s=0.0
            for k in range(-half,half+1):
                col=j+k
                if col<0:
                    col=0
                elif col>=w:
                    col=w-1
                s+=img[i,col]*kernel_1d[k+half]
            tmp[i,j]=s
    for i in prange(h):
        for j in range(w):
            s=0.0
            for k in range(-half,half+1):
                row=i+k
                if row<0:
                    row=0
                elif row>=h:
                    row=h-1
                s+=tmp[row,j]*kernel_1d[k+half]
            out[i,j]=s
    return out

def canny(image,threshold1=50,threshold2=150,apertureSize=5,L2gradient=False,precise=False):
    img=image_to_gray(image)[0]
    #高斯
    blurred=gaussian_blur2(img,apertureSize)
    #Sobel
    grad_x=fliter(blurred,"sobel_x")
    grad_y=fliter(blurred,"sobel_y")
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

def harris(image,sigma=1.2,k=0.04,threshold_ratio=0.01,nms_radius=8,max_corners=500,method="harris"):
    img=image_to_gray(image)[0]
    Ix=fliter(img,"sobel_x")
    Iy=fliter(img,"sobel_y")
    Ix2=Ix*Ix
    Iy2=Iy*Iy
    Ixy=Ix*Iy
    ksize=max(3,int(3*sigma)*2+1)
    sxx=gaussian_blur(Ix2,3,sigma)
    syy=gaussian_blur(Iy2,3,sigma)
    sxy=gaussian_blur(Ixy,3,sigma)
    det=sxx*syy-sxy**2
    trace=sxx+syy
    if method=="harris":
        R=det-k*trace**2
        R[R<0]=0
    elif method=="shi-tomasi":
        delta=trace**2-4*det
        delta[delta<0]=0
        # lambda1=0.5*(trace+np.sqrt(delta))
        # lambda2=0.5*(trace-np.sqrt(delta))
        # R=np.minimum(lambda1,lambda2)
        R=trace-np.sqrt(delta)
    #corners=np.argwhere(R>threshold_ratio*R.max())
    # corner_values=R[corners[:,0],corners[:,1]]
    # sorted_indices=np.argsort(corner_values)[::-1]
    # corners=corners[sorted_indices]
    # selected_corners=[]
    # for corner in corners:
    #     if len(selected_corners)>=max_corners:
    #         break
    #     r,c=corner
    #     if all(max(abs(r-sr),abs(c-sc))>nms_radius for sr,sc in selected_corners):
    #         selected_corners.append((r,c,R[r,c]))
    r_max=R.max()
    ys,xs=np.where(R>threshold_ratio*r_max)
    candidates=list(zip(R[ys,xs],xs,ys))
    candidates.sort(key=lambda x:x[0],reverse=True)
    occupied=np.zeros_like(R,dtype=bool)
    corners=[]
    for val,x,y in candidates:
        if not occupied[max(0,y-nms_radius):min(R.shape[0],y+nms_radius+1),max(0,x-nms_radius):min(R.shape[1],x+nms_radius+1)].any():
            corners.append((val,x,y))
            occupied[y,x]=True
        if len(corners)>=max_corners:
            break
    return img,Ix,Iy,Ix2,Iy2,Ixy,sxx,syy,sxy,det,trace,R,candidates,corners

@njit
def resize_bilinear(img,scale):
    h,w=img.shape[:2]
    new_h,new_w=round(h*scale),round(w*scale)
    if img.ndim==3:
        channels=img.shape[2]
        out=np.zeros((new_h,new_w,channels),dtype=img.dtype)
    else:
        out=np.zeros((new_h,new_w),dtype=img.dtype)
    x_step=1/scale
    y_step=1/scale
    y=0.0
    for y2 in range(new_h):
        y0=int(y)
        y1=min(y0+1,h-1)
        dy=y-y0
        x=0.0
        for x2 in range(new_w):
            x0=int(x)
            x1=min(x0+1,w-1)
            dx=x-x0
            out[y2,x2]=(1-dy)*(1-dx)*img[y0,x0]+(1-dy)*dx*img[y0,x1]+dy*(1-dx)*img[y1,x0]+dy*dx*img[y1,x1]
            x+=x_step
        y+=y_step
    return out

def refine_dogs(dogs,x,y,s,constrast_th,edge_th,max_iter):
    h,w=dogs[0].shape
    offset=np.zeros(3,dtype=np.float32)
    grad=None
    hessian=None
    for _ in range(max_iter):
        if x<=0 or x>=w-1 or y<=0 or y>=h-1 or s<=0 or s>=len(dogs)-1:
            return None
        D=dogs[s]
        Dp=dogs[s+1]
        Dm=dogs[s-1]
        dx=0.5*(D[y,x+1]-D[y,x-1])
        dy=0.5*(D[y+1,x]-D[y-1,x])
        ds=0.5*(Dp[y,x]-Dm[y,x])
        dxx=D[y,x+1]-2*D[y,x]+D[y,x-1]
        dyy=D[y+1,x]-2*D[y,x]+D[y-1,x]
        dss=Dp[y,x]-2*D[y,x]+Dm[y,x]
        dxy=0.25*(D[y+1,x+1]-D[y+1,x-1]-D[y-1,x+1]+D[y-1,x-1])
        dxs=0.25*(Dp[y,x+1]-Dp[y,x-1]-Dm[y,x+1]+Dm[y,x-1])
        dys=0.25*(Dp[y+1,x]-Dp[y-1,x]-Dm[y+1,x]+Dm[y-1,x])
        grad=np.array([dx,dy,ds],dtype=np.float32)
        hessian=np.array([[dxx,dxy,dxs],[dxy,dyy,dys],[dxs,dys,dss]],dtype=np.float32)
        try:
            offset=-np.linalg.solve(hessian,grad)
        except np.linalg.LinAlgError:
            return None
        if not np.all(np.isfinite(offset)):
            return None
        if np.max(np.abs(offset))<0.5: #在当前点附近
            break
        x+=int(round(offset[0]))
        y+=int(round(offset[1]))
        s+=int(round(offset[2]))
    else:
        return None
    constrast=dogs[s][y,x]+0.5*np.dot(grad,offset)
    if abs(constrast)<constrast_th:
        return None
    dxx=hessian[0,0]
    dyy=hessian[1,1]
    dxy=hessian[0,1]
    tr=dxx+dyy
    det=dxx*dyy-dxy**2
    if det<=1e-12:
        return None
    edge_ratio=tr**2/det
    if edge_ratio>=edge_th:
        return None
    return {
        "x_local":x,
        "y_local":y,
        "scale":s,
        "x_refine":x+offset[0],
        "y_refine":y+offset[1],
        "scale_refine":s+offset[2],
        "offset":offset,
        "dog":constrast,
        "edge_ratio":edge_ratio
    }

@njit
def trilinear_vote(descriptor,xbin,ybin,obin,val):
    x0=int(np.floor(xbin))
    y0=int(np.floor(ybin))
    o0=int(np.floor(obin))
    dx=xbin-x0
    dy=ybin-y0
    dob=obin-o0
    h,w,bins=descriptor.shape
    for oy in (0,1):
        yb=y0+oy
        if yb<0 or yb>=h: 
            continue
        valwy=(1-dy if oy == 0 else dy)*val
        for ox in (0,1):
            xb=x0+ox
            if xb<0 or xb>=w: 
                continue
            valwxy=(1-dx if ox==0 else dx)*valwy
            for oo in (0,1):
                ob=(o0+oo)%bins
                wo=1-dob if oo==0 else dob
                descriptor[yb,xb,ob]+=valwxy*wo

def sift(image,octave=3,scale=3,sigma0=1.6,contrast_threshold=0.04,edge_threshold=10,max_points=500,descriptor=True,double_size=True,auto_nms=True):
    img=image_to_gray(image)[0]
    img=img.astype(np.float32)/255
    if double_size:
        img=resize_bilinear(img,2)
        assumed_blur=1.0
        base_scale=2
    else:
        assumed_blur=0.5
        base_scale=1
    sigma_diff=np.sqrt(max(sigma0**2-assumed_blur**2,0.01))
    gaussize=max(int(2*np.ceil(3*sigma_diff)+1),3)
    current=gaussian_blur2(img,gaussize,sigma_diff)
    # 尺度空间
    k=2**(1/scale)
    pyramid=[]
    sigmass=[]
    dogs_pyramid=[]
    for o in range(octave):
        layers=[current]
        dog_layers=[]
        sigmas=[sigma0]
        for s in range(1,scale+3):
            sigma_prev=sigma0*k**(s-1)
            sigma_total=sigma_prev*k # k**s
            sigma_diff=np.sqrt(sigma_total**2-sigma_prev**2)
            gaussize=max(int(2*np.ceil(3*sigma_diff)+1),3)
            blurred=gaussian_blur2(layers[-1],gaussize,sigma_diff)
            layers.append(blurred)
            sigmas.append(sigma_total)
            dog=blurred-layers[-2]
            dog_layers.append(dog)
        pyramid.append(layers)
        sigmass.append(sigmas)
        dogs_pyramid.append(dog_layers)
        if o<octave-1:
            current=layers[scale][::2,::2].copy()
            if current.shape[0]<16 or current.shape[1]<16:
                break
    # 关键点检测
    points_extrema=[]
    points_edge=[]
    edge_ratio_threshold=(edge_threshold+1)**2/edge_threshold
    for i,dog_layer in enumerate(dogs_pyramid):
        h,w=dog_layer[0].shape
        scale_factor=(2**i)/base_scale
        for s in range(1,scale+1):
            current=dog_layer[s]
            center=current[1:h-1,1:w-1]
            mask_contrast=np.abs(center)>=contrast_threshold
            #极值点
            is_max=np.ones_like(center,dtype=bool)
            is_min=np.ones_like(center,dtype=bool)
            for ds in [-1,0,1]:
                dog=dog_layer[s+ds]
                for dr in [-1,0,1]:
                    for dc in [-1,0,1]:
                        if ds==0 and dr==0 and dc==0:
                            continue
                        neighbor=dog[1+dr:h-1+dr,1+dc:w-1+dc]
                        is_max&=(center>neighbor)
                        is_min&=(center<neighbor)
            mask_extrema=is_max|is_min
            ys,xs=np.where(mask_extrema)
            ys+=1
            xs+=1
            points_extrema.extend([{
                "x": round(x*scale_factor),
                "y": round(y*scale_factor),
                "x_local": x,
                "y_local": y,
                "octave": i,
                "scale": s,
                "dog": current[y,x]
            }for y,x in zip(ys,xs)])
            #边缘响应
            dxx=current[1:h-1,2:w]-2*center+current[1:h-1,:w-2]
            dyy=current[2:h,1:w-1]-2*center+current[:h-2,1:w-1]
            dxy=(current[2:h,2:w]-current[2:h,:w-2]-current[:h-2,2:w]+current[:h-2,:w-2])/4
            tr=dxx+dyy
            det=dxx*dyy-dxy**2
            mask_edge=(det>0) & (tr**2/(det+1e-8)<edge_ratio_threshold)
            mask=mask_contrast&mask_extrema&mask_edge
            
            ys,xs=np.where(mask)
            ys+=1
            xs+=1
            for y,x in zip(ys,xs):
                val=current[y,x]
                refined=refine_dogs(dog_layer,x,y,s,contrast_threshold,edge_ratio_threshold,5)
                if refined is None:
                    continue
                sr=refined["scale"]
                sigma_base=sigmass[i][min(max(0,sr),len(sigmass[i])-1)]
                sigma_refined=sigma_base*(k**refined["offset"][2])
                sigma_global=sigma_refined*scale_factor
                x_global=refined["x_refine"]*scale_factor
                y_global=refined["y_refine"]*scale_factor
                points_edge.append({
                    "x": round(x_global),
                    "y": round(y_global),
                    "x_float": x_global,
                    "y_float": y_global,
                    "x_local": refined["x_local"],
                    "y_local": refined["y_local"],
                    "x_refine": refined["x_refine"],
                    "y_refine": refined["y_refine"],
                    "octave": i,
                    "scale": refined["scale"],
                    "scale_refine": refined["scale_refine"],
                    "offset": refined["offset"],
                    "sigma": sigma_refined,
                    "sigma_global": sigma_global,
                    "response": abs(refined["dog"]),
                    "dog": refined["dog"],
                    "edge_ratio": refined["edge_ratio"]
                })
    # NMS
    points_edge.sort(key=lambda x:x["response"],reverse=True)
    keypoints=[]
    min_dist2=16
    for point in points_edge:
        keep=True
        x,y=point["x"],point["y"]
        if auto_nms:
            radius=max(8,3*point.get("sigma_global",1.6))
            min_dist2=radius*radius
        for sp in keypoints:
            if (x-sp["x"])**2+(y-sp["y"])**2<min_dist2:
                keep=False
                break
        if keep:
            keypoints.append(point)
            if len(keypoints)>=max_points:
                break
    
    if not descriptor:
        return {
            "pyramid": pyramid,
            "sigmas": sigmass,
            "dogs_pyramid": dogs_pyramid,
            "points_extrema": points_extrema,
            "points_edge": points_edge,
            "points_keypoints": keypoints
        }

    # 描述符
    grad_cache=[]
    for octave_layers in pyramid:
        octave_grads=[]
        for layer in octave_layers:
            gx=np.zeros_like(layer,dtype=np.float32)
            gy=np.zeros_like(layer,dtype=np.float32)
            gx[:,1:-1]=layer[:,2:]-layer[:,:-2]
            gy[1:-1,:]=layer[2:,:]-layer[:-2,:]
            magnitude=np.sqrt(gx*gx+gy*gy)
            orientation=(np.arctan2(gy,gx)*180/np.pi)%360
            octave_grads.append((magnitude,orientation))
        grad_cache.append(octave_grads)
    bin_num=36
    degree=360/bin_num
    descriptors=[]
    extended_points=[]
    for kp in keypoints:
        octave=kp["octave"]
        scale=kp["scale"]
        x0_int=kp["x_local"]
        y0_int=kp["y_local"]
        x0=kp.get("x_refine",x0_int)
        y0=kp.get("y_refine",y0_int)
        sigma=max(kp["sigma"],1)
        layer=pyramid[octave][scale]
        h,w=layer.shape
        # 统计方向直方图
        magnitude,orientation=grad_cache[octave][scale]
        radius=max(4,min(round(4.5*sigma),24))
        w_sigma2=(1.5*sigma)**2
        hist=np.zeros(bin_num,dtype=np.float32)
        for yy in range(max(0,y0_int-radius),min(h,y0_int+radius+1)):
            for xx in range(max(0,x0_int-radius),min(w,x0_int+radius+1)):
                dx=xx-x0
                dy=yy-y0
                weight=np.exp(-(dx*dx+dy*dy)/w_sigma2/2)
                angle=orientation[yy,xx]
                bin=int(np.round(angle/degree))%bin_num
                hist[bin]+=magnitude[yy,xx]*weight
        # 找主方向+辅方向
        hist=hist*0.375+(np.roll(hist,1)+np.roll(hist,-1))*0.25+(np.roll(hist,2)+np.roll(hist,-2))*0.0625
        max_val=hist.max()
        if max_val<1e-8:
            continue
        orientations=[]
        for i in range(bin_num):
            prev=hist[(i-1)%bin_num]
            cur=hist[i]
            next=hist[(i+1)%bin_num]
            if cur>=prev and cur>=next and cur>=0.8*max_val:
                denom=prev-2*cur+next
                offset=0.5*(prev-next)/denom if abs(denom)>1e-8 else 0
                offset=max(-0.5,min(0.5,offset))
                pos=i+offset
                pos=(pos*degree)%360
                orientations.append({"angle":pos,"bin":i,"peak":cur,"relative_peak":cur/max_val})
        orientations.sort(key=lambda x:x["peak"],reverse=True)
        # 生成描述符
        scale_factor=sigma/1.6
        half_size=max(8,min(round(8*scale_factor),24))
        cell_size=half_size/2
        des_sigma2=(half_size/2)**2
        for orient in orientations:
            kp_orient=kp.copy()
            kp_orient["index"]=len(descriptors)
            kp_orient["angle"]=orient["angle"]
            kp_orient["bin"]=orient["bin"]
            kp_orient["peak"]=orient["peak"]
            kp_orient["relative_peak"]=orient["relative_peak"]
            descriptor=np.zeros((4,4,8),dtype=np.float32)
            rad=np.deg2rad(orient["angle"])
            cos_t=np.cos(rad)
            sin_t=np.sin(rad)
            patch_vectors=[]
            for yy in range(max(0,y0_int-half_size),min(h,y0_int+half_size+1)):
                for xx in range(max(0,x0_int-half_size),min(w,x0_int+half_size+1)):
                    dx=xx-x0
                    dy=yy-y0
                    #旋转坐标系
                    rx=cos_t*dx+sin_t*dy
                    ry=-sin_t*dx+cos_t*dy
                    xbin=rx/cell_size+2-0.5
                    ybin=ry/cell_size+2-0.5
                    if xbin<-1 or xbin>4 or ybin<-1 or ybin>4:
                        continue
                    angle=(orientation[yy,xx]-orient["angle"])%360
                    obin=angle/45
                    weight=np.exp(-(rx*rx+ry*ry)/des_sigma2/2)
                    val=magnitude[yy,xx]*weight
                    trilinear_vote(descriptor,xbin,ybin,obin,val) #三线性插值投票
                    patch_vectors.append({"dx":dx,"dy":dy,"rx":rx,"ry":ry,"xbin":xbin,"ybin":ybin,"obin":obin,"mag":magnitude[yy,xx],"angle":orientation[yy,xx],"weight":weight})
            vec=descriptor.reshape(-1)
            norm=np.linalg.norm(vec)+1e-12
            vec=vec/norm
            vec=np.clip(vec,0,0.2)
            norm=np.linalg.norm(vec)+1e-12
            vec=vec/norm
            if np.linalg.norm(vec)<1e-8:
                continue
            descriptors.append({"descriptor":vec,"patch_vectors":patch_vectors[:300]})
            extended_points.append(kp_orient)
    if len(descriptors)>0:
        matrix=np.vstack([d["descriptor"] for d in descriptors])
    else:
        matrix=np.empty((0,128),dtype=np.float32)
    return {
        "pyramid": pyramid,
        "sigmas": sigmass,
        "dogs_pyramid": dogs_pyramid,
        "points_extrema": points_extrema,
        "points_edge": points_edge,
        "points_keypoints": keypoints,
        "extended_points": extended_points,
        "descriptors": descriptors,
        "descriptor_matrix": matrix
    }