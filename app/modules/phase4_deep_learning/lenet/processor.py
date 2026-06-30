"""
LeNet-5 pipeline builder.
Provides forward inference trace data and architecture overview for frontend rendering.
"""
import json
import os
import numpy as np
from app.modules.phase4_deep_learning.lenet.algorithm import compute_forward_trace, predict


def _find_weights():
    """Search for pre-trained weights file in common locations."""
    candidates = [
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'static', 'lenet_weights.json'),
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'CV', 'static', 'lenet_weights.json'),
    ]
    for p in candidates:
        p = os.path.normpath(p)
        if os.path.exists(p):
            with open(p) as f:
                return json.load(f)
    return None


def build_inference_trace(image_28x28):
    """
    Build complete forward inference trace for LeNet-5.

    Args:
        image_28x28: (28, 28) float32 ndarray in [0, 1]

    Returns:
        dict with architecture, steps, sample, and prediction
    """
    W = _find_weights()
    if W is None:
        return {'error': 'Pre-trained weights file lenet_weights.json not found'}

    trace = compute_forward_trace(image_28x28, {k: np.array(v, dtype=np.float32) for k, v in W.items()})

    architecture = [
        {'arch_index': 0,  'name': 'Input',     'shape': '1x28x28',    'group': 'Input'},
        {'arch_index': 1,  'name': 'Conv1',     'shape': '6x24x24',    'group': 'Conv Block 1'},
        {'arch_index': 2,  'name': 'Tanh',      'shape': '6x24x24',    'group': 'Conv Block 1'},
        {'arch_index': 3,  'name': 'Pool1',     'shape': '6x12x12',    'group': 'Conv Block 1'},
        {'arch_index': 4,  'name': 'Conv2',     'shape': '16x8x8',     'group': 'Conv Block 2'},
        {'arch_index': 5,  'name': 'Tanh',      'shape': '16x8x8',     'group': 'Conv Block 2'},
        {'arch_index': 6,  'name': 'Pool2',     'shape': '16x4x4',     'group': 'Conv Block 2'},
        {'arch_index': 7,  'name': 'Flatten',   'shape': '256',         'group': 'Fully Connected'},
        {'arch_index': 8,  'name': 'FC1',       'shape': '120',         'group': 'Fully Connected'},
        {'arch_index': 9,  'name': 'Tanh',      'shape': '120',         'group': 'Fully Connected'},
        {'arch_index': 10, 'name': 'FC2',       'shape': '84',          'group': 'Fully Connected'},
        {'arch_index': 11, 'name': 'Tanh',      'shape': '84',          'group': 'Fully Connected'},
        {'arch_index': 12, 'name': 'FC3',       'shape': '10',          'group': 'Fully Connected'},
        {'arch_index': 13, 'name': 'Softmax',   'shape': '10',          'group': 'Output'},
    ]

    result = predict(image_28x28)

    return {
        'architecture': architecture,
        'steps': trace['steps'],
        'sample': trace['sample'],
        'prediction': result,
    }


def build_architecture_overview():
    """Return LeNet-5 architecture overview (no input image needed)."""
    return {
        'name': 'LeNet-5',
        'paper': 'Gradient-Based Learning Applied to Document Recognition (LeCun et al., 1998)',
        'layers': [
            {'name': 'Input',       'type': 'input',      'shape': '1x28x28',   'params': 0},
            {'name': 'Conv1',       'type': 'conv',       'shape': '6x24x24',   'params': 156,   'kernel': '5x5', 'stride': 1},
            {'name': 'Tanh',        'type': 'activation', 'shape': '6x24x24',   'params': 0},
            {'name': 'AvgPool1',    'type': 'pool',       'shape': '6x12x12',   'params': 0,     'kernel': '2x2', 'stride': 2},
            {'name': 'Conv2',       'type': 'conv',       'shape': '16x8x8',    'params': 2416,  'kernel': '5x5', 'stride': 1},
            {'name': 'Tanh',        'type': 'activation', 'shape': '16x8x8',    'params': 0},
            {'name': 'AvgPool2',    'type': 'pool',       'shape': '16x4x4',    'params': 0,     'kernel': '2x2', 'stride': 2},
            {'name': 'Flatten',     'type': 'flatten',    'shape': '256',        'params': 0},
            {'name': 'FC1',         'type': 'linear',     'shape': '120',        'params': 30840},
            {'name': 'Tanh',        'type': 'activation', 'shape': '120',        'params': 0},
            {'name': 'FC2',         'type': 'linear',     'shape': '84',         'params': 10164},
            {'name': 'Tanh',        'type': 'activation', 'shape': '84',         'params': 0},
            {'name': 'FC3',         'type': 'linear',     'shape': '10',         'params': 850},
            {'name': 'Softmax',     'type': 'softmax',    'shape': '10',         'params': 0},
        ],
        'total_params': 44426,
    }
