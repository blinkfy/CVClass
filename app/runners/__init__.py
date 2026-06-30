"""Model runner abstraction — local vs remote inference dispatch.

Usage::

    from app.runners import get_remote_runner, is_remote_configured

    runner = get_remote_runner('vit')
    if runner:
        result = runner.run(image_path='...')   # → {steps, metrics}
        meta   = runner.get_metadata()          # → {status, backend, ...}
"""
from app.runners.remote_runner import (
    RemoteRunner,
    get_remote_runner,
    is_remote_configured,
    REMOTE_CONFIG,
)

__all__ = [
    'RemoteRunner',
    'get_remote_runner',
    'is_remote_configured',
    'REMOTE_CONFIG',
]
