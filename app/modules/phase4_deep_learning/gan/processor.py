"""GAN module placeholder for real implementation wiring.

This module is intentionally non-simulated: until a real pretrained GAN
checkpoint/repo is wired in, the API returns a clear not-ready error instead of
fabricating samples.
"""


def build_pipeline(image_path=None, **kwargs):
    return {
        'error': 'GAN 真实权重尚未接入，当前不提供模拟输出。',
        'steps': [],
        'metrics': {'status': 'not_implemented'},
    }
