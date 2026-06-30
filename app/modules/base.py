"""
Algorithm module base class.
All CV algorithm modules must inherit AlgorithmModule.
"""
import os


class AlgorithmModule:
    """
    One module = one complete CV algorithm teaching unit.
    Contains: route registration, API endpoints, page info.
    """
    # Subclass must override these -----
    module_id: str = ''          # Unique identifier, e.g. 'grayscale'
    name: str = ''               # Display name
    name_en: str = ''            # English name
    phase: str = ''              # Phase dir: phase1_fundamentals / phase2_classical / ...
    difficulty: int = 1          # Difficulty 1-5
    description: str = ''        # One-line description
    dependencies: list = None    # Prerequisite module ids
    required: bool = False       # Whether this is a mandatory (required) module

    def __init_subclass__(cls, **kwargs):
        """Auto-register subclass into module registry on definition."""
        super().__init_subclass__(**kwargs)
        if cls.module_id:
            from app.modules import register_module
            register_module(cls)

    @staticmethod
    def get_page():
        """Return the HTML page filename (relative to static/pages/)."""
        raise NotImplementedError

    @staticmethod
    def get_api_endpoints():
        """
        Return list of API endpoints for this module.
        Each endpoint: { 'rule': '/api/xxx', 'methods': [...], 'handler': fn, 'endpoint': str }
        Registered by routes.py.
        """
        return []
