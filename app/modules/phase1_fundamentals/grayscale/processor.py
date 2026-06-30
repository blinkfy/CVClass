"""
Grayscale conversion pipeline builder.
Assembles algorithm steps into frontend-renderable data.
"""
import numpy as np
from app.modules.phase1_fundamentals.grayscale.algorithm import METHODS, to_uint8
from app.utils.image_utils import load_image_u8


def build_pipeline(image_path, method='weighted'):
    """Build grayscale conversion pipeline with all comparison methods."""
    original = load_image_u8(image_path, mode='rgb', max_side=1024)
    method_name, method_fn = METHODS.get(method, METHODS['weighted'])
    gray = method_fn(original)

    comparisons = {}
    for key, (name, fn) in METHODS.items():
        if key not in ('r', 'g', 'b'):
            comparisons[key] = {'name': name, 'image': fn(original)}

    steps = [
        {'id': 'original', 'name': 'Original Image',
         'explanation': 'The input color image with R, G, B channels.'},
        {'id': 'channels', 'name': 'Channel Separation',
         'explanation': 'Image split into Red, Green, Blue channels. Notice the brightness differences.'},
        {'id': 'formula', 'name': f'Formula: {method_name}',
         'explanation': 'Gray = 0.299*R + 0.587*G + 0.114*B (ITU-R BT.601, matching human eye sensitivity).'
         if method == 'weighted' else f'Result using {method_name}.'},
        {'id': 'result', 'name': 'Final Grayscale',
         'explanation': 'Single-channel image: 0=black, 255=white.'},
    ]

    return {
        'steps': steps, 'original': original, 'result': gray,
        'r_channel': original[:,:,0] if original.ndim==3 else original,
        'g_channel': original[:,:,1] if original.ndim==3 else original,
        'b_channel': original[:,:,2] if original.ndim==3 else original,
        'comparisons': comparisons,
        'metrics': {
            'method': method, 'method_name': method_name,
            'original_shape': list(original.shape),
            'result_shape': list(gray.shape),
            'pixel_count': int(gray.size),
            'mean_brightness': round(float(np.mean(gray)), 1),
            'min_brightness': int(np.min(gray)),
            'max_brightness': int(np.max(gray)),
        },
    }
