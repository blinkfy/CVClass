"""GrabCut processor — pure NumPy implementation."""
import numpy as np
from app.utils.image_utils import load_image_u8
from app.modules.phase3_intermediate.grabcut.algorithm import grabcut_segment


def _draw_rect(img, x, y, rw, rh, color=(34, 197, 94), thickness=2):
    """Draw rectangle on numpy array (no cv2 needed)."""
    out = img.copy()
    c = np.array(color, dtype=img.dtype)
    t = thickness
    out[max(0, y - t):min(img.shape[0], y + t), max(0, x):min(img.shape[1], x + rw)] = c
    out[max(0, y + rh - t):min(img.shape[0], y + rh + t), max(0, x):min(img.shape[1], x + rw)] = c
    out[max(0, y):min(img.shape[0], y + rh), max(0, x - t):min(img.shape[1], x + t)] = c
    out[max(0, y):min(img.shape[0], y + rh), max(0, x + rw - t):min(img.shape[1], x + rw + t)] = c
    return out


def _morph_close(mask, kernel_size=5):
    """Morphological close: dilate then erode (pure NumPy)."""
    from scipy.ndimage import binary_dilation, binary_erosion
    se = np.ones((kernel_size, kernel_size), dtype=bool)
    dilated = binary_dilation(mask, structure=se, iterations=1)
    closed = binary_erosion(dilated, structure=se, iterations=1)
    return closed


def build_pipeline(image_path=None, **kwargs):
    img_u8 = load_image_u8(image_path, mode='rgb', max_side=320) if image_path else None
    if img_u8 is None:
        return {'steps': [{'id': 'error', 'name': '需要上传图片',
                'image': np.zeros((200, 400, 3), dtype=np.uint8) + 40,
                'explanation': 'GrabCut需要一张有明确前景的图片。'}],
                'metrics': {'status': 'no_image'}}

    h, w = img_u8.shape[:2]
    margin = 10
    x = max(margin, int(kwargs.get('x', w // 6)))
    y = max(margin, int(kwargs.get('y', h // 6)))
    rw = min(int(kwargs.get('w', w * 2 // 3)), w - x - 1)
    rh = min(int(kwargs.get('h', h * 2 // 3)), h - y - 1)
    rw, rh = max(rw, 20), max(rh, 20)

    # Run GrabCut
    fg_mask = grabcut_segment(img_u8, (x, y, rw, rh))
    fg_bool = fg_mask > 0

    # Rect visualization
    rect_vis = _draw_rect(img_u8, x, y, rw, rh)

    # Foreground overlay
    overlay = img_u8.copy()
    if fg_bool.any():
        green = np.array([34, 197, 94], dtype=np.float32)
        overlay[fg_bool] = (overlay[fg_bool].astype(np.float32) * 0.4 + green * 0.6).clip(0, 255).astype(np.uint8)

    # Morphological close for cleaner result
    fg_smooth_bool = _morph_close(fg_bool)
    clean_overlay = img_u8.copy()
    if fg_smooth_bool.any():
        green = np.array([34, 197, 94], dtype=np.float32)
        clean_overlay[fg_smooth_bool] = (clean_overlay[fg_smooth_bool].astype(np.float32) * 0.35 + green * 0.65).clip(
            0, 255).astype(np.uint8)

    # Raw mask visualization (white = foreground)
    mask_vis = np.stack([fg_mask.astype(np.uint8)] * 3, axis=-1)

    fg_pct = round(float(fg_smooth_bool.mean()) * 100, 1)

    return {
        'steps': [
            {'id': 'original', 'name': '原图', 'image': img_u8,
             'explanation': '上传的原始图像。GrabCut 需要用户给出一个大致包含目标物体的矩形框。'},
            {'id': 'rect', 'name': '框选目标区域', 'image': rect_vis,
             'explanation': f'绿色框({x},{y},{rw}×{rh})标记目标大致位置。框外像素=确定背景，框内=可能前景。'},
            {'id': 'mask', 'name': '分割掩码', 'image': mask_vis,
             'explanation': '白色=算法判断为前景的像素，黑色=背景。经过4轮GMM建模+能量最小化迭代。'},
            {'id': 'overlay', 'name': '前景叠加', 'image': overlay,
             'explanation': f'绿色半透明区域=提取的前景（{fg_pct}%像素）。GMM建模前景/背景颜色分布后逐像素判定。'},
            {'id': 'clean', 'name': '形态学精修', 'image': clean_overlay,
             'explanation': '闭运算（先膨胀再腐蚀）填补前景中的小孔洞，使分割边界更完整。'},
        ],
        'metrics': {
            'status': 'numpy_implementation',
            'foreground_pct': fg_pct,
            'gmm_components': 5,
            'iterations': 4,
            'backend': 'NumPy + SciPy',
        }
    }
