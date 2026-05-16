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

def rgba_array_to_image(rgba_array):
    rgba_array = np.ascontiguousarray(np.clip(rgba_array, 0, 255).astype(np.uint8))
    return Image.fromarray(rgba_array, mode="RGBA")


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


@njit(parallel=True)
def _convolve_channel_parallel(padded_channel, kernel_array, stride, out_h, out_w):
    size = kernel_array.shape[0]
    result = np.zeros((out_h, out_w), dtype=np.float32)

    for out_r in prange(out_h):
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
