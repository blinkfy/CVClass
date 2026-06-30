"""
Module registry.
Scans phase directories (phase1~phase5) and auto-discovers all algorithm modules.
"""
import os
import importlib

MODULE_REGISTRY = {}  # module_id -> AlgorithmModule subclass

# Phase metadata for frontend navigation
PHASE_META = {
    'phase1_fundamentals':  {'name': '基础原语', 'name_en': 'Fundamentals',  'emoji': '1', 'order': 1, 'color': '#3B82F6'},
    'phase2_classical':     {'name': '经典CV核心算法', 'name_en': 'Classical CV', 'emoji': '2', 'order': 2, 'color': '#8B5CF6'},
    'phase3_intermediate':  {'name': '中级视觉', 'name_en': 'Intermediate Vision', 'emoji': '3', 'order': 3, 'color': '#F59E0B'},
    'phase4_deep_learning': {'name': '深度学习时代', 'name_en': 'Deep Learning Era', 'emoji': '4', 'order': 4, 'color': '#EF4444'},
    'phase5_frontier':      {'name': '前沿论文算法', 'name_en': 'Frontier Research', 'emoji': '5', 'order': 5, 'color': '#10B981'},
}

def register_module(cls):
    """Register an AlgorithmModule subclass into the global registry."""
    from app.modules.base import AlgorithmModule
    if not issubclass(cls, AlgorithmModule):
        raise TypeError(f'{cls.__name__} must inherit AlgorithmModule')
    if not cls.module_id:
        raise ValueError(f'{cls.__name__} must define module_id')
    MODULE_REGISTRY[cls.module_id] = cls


def _discover_phase_modules(phase_dir_name):
    """
    Scan a phase directory and import all module subdirectories within it.
    Each subdirectory with an __init__.py that defines an AlgorithmModule
    subclass will be auto-registered via __init_subclass__.
    """
    base = os.path.dirname(os.path.abspath(__file__))
    phase_path = os.path.join(base, phase_dir_name)
    if not os.path.isdir(phase_path):
        return

    for entry in sorted(os.listdir(phase_path)):
        module_path = os.path.join(phase_path, entry)
        init_file = os.path.join(module_path, '__init__.py')
        if os.path.isfile(init_file):
            # Import the module package to trigger __init_subclass__
            importlib.import_module(f'app.modules.{phase_dir_name}.{entry}')


def discover_all():
    """Import all phase directories to trigger module auto-registration."""
    for phase_name in PHASE_META:
        _discover_phase_modules(phase_name)


def get_modules_by_phase():
    """
    Organize modules by phase for frontend navigation.
    Returns ordered list of phases with their modules.
    """
    phases = []
    for phase_name, meta in sorted(PHASE_META.items(), key=lambda x: x[1]['order']):
        modules = []
        for mid, cls in MODULE_REGISTRY.items():
            if getattr(cls, 'phase', '') == phase_name:
                modules.append({
                    'id': cls.module_id,
                    'name': cls.name,
                    'name_en': cls.name_en,
                    'difficulty': cls.difficulty,
                    'description': cls.description,
                    'dependencies': cls.dependencies or [],
                    'required': getattr(cls, 'required', False),
                })
        if modules:
            phases.append({
                'phase_id': phase_name,
                'phase_name': meta['name'],
                'phase_name_en': meta['name_en'],
                'emoji': meta['emoji'],
                'color': meta['color'],
                'order': meta['order'],
                'modules': modules,
            })
    return phases


# Auto-discover on import
discover_all()
