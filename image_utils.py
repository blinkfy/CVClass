import numpy as np
from PIL import Image

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


