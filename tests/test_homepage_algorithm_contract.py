import io
import json
import re
import subprocess
from pathlib import Path

import numpy as np
from imageio.v3 import imwrite

from app import create_app
from app.modules.offline_teaching import LOCAL_FRONTIER_ALGORITHM_MODULES


ALIAS_TARGETS = {
    'canny': 'edge',
    'harris': 'corner',
    'faster_rcnn': 'detection',
    'fcn': 'semantic',
    'mask_rcnn': 'instance',
    'tpl_match': 'template_match',
    'sd': 'stable_diffusion',
}


def _homepage_ids():
    script = Path('static/js/app.js').read_text(encoding='utf-8')
    topic_block = script.split('const TOPIC_CARDS =', 1)[1].split('function _renderTopicCard', 1)[0]
    ids = set(re.findall(r"\{id:'([^']+)'", topic_block))
    ids.update(re.findall(r"mid:'([^']+)'", topic_block))
    return sorted(ids)


def _fixture_png_bytes():
    img = np.zeros((72, 96, 3), dtype=np.uint8)
    img[12:56, 18:62] = [220, 120, 60]
    img[28:68, 52:88] = [40, 170, 220]
    buf = io.BytesIO()
    imwrite(buf, img, extension='.png')
    buf.seek(0)
    return buf


def _post_demo(client, module_id):
    data = {'file': (_fixture_png_bytes(), f'{module_id}.png')}
    return client.post(
        f'/api/demo/{module_id}',
        data=data,
        content_type='multipart/form-data',
    )


def _algorithm_content():
    script = (
        "const fs=require('fs'),vm=require('vm');"
        "const code=fs.readFileSync('static/js/algorithm-content.js','utf8');"
        "const ctx={window:{},console};"
        "vm.createContext(ctx);vm.runInContext(code,ctx);"
        "console.log(JSON.stringify(ctx.window.AlgorithmContent));"
    )
    result = subprocess.run(
        ['node', '-e', script],
        cwd='.',
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout.decode('utf-8'))


def test_homepage_topic_algorithms_have_demo_contract():
    app = create_app()
    client = app.test_client()

    for module_id in _homepage_ids():
        resp = _post_demo(client, module_id)
        payload = resp.get_json()
        assert resp.status_code not in {404, 500}, module_id
        assert payload is not None, module_id
        assert 'steps' in payload, module_id
        assert 'metrics' in payload, module_id
        assert 'implementation' in payload, module_id
        category = payload['implementation']['category']
        if category in {'pretrained_model', 'model_not_available'} and resp.status_code in {400, 503}:
            assert payload.get('error'), module_id
            continue
        if category != 'requires_external_weights':
            assert resp.status_code == 200, module_id
            assert payload['steps'], module_id
            assert all(step.get('id') and step.get('name') for step in payload['steps']), module_id


def test_homepage_aliases_return_canonical_module_id():
    app = create_app()
    client = app.test_client()

    for alias, canonical in ALIAS_TARGETS.items():
        resp = _post_demo(client, alias)
        payload = resp.get_json()
        assert resp.status_code == 200, alias
        assert payload['requested_module_id'] == alias
        assert payload['module_id'] == canonical
        assert payload['steps'], alias


def test_formal_foundation_models_report_real_inference_or_weight_setup():
    app = create_app()
    client = app.test_client()

    for module_id in ['vit', 'detr', 'clip', 'sam']:
        resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
        payload = resp.get_json()
        assert resp.status_code in {200, 400, 503}, module_id
        assert payload is not None, module_id
        assert payload['implementation']['real_model'] is True
        assert payload['implementation']['category'] in {'pretrained_model', 'model_not_available'}
        if resp.status_code == 200:
            assert payload['steps'], module_id
        else:
            assert payload.get('error'), module_id


def test_homepage_algorithm_content_has_teaching_visualization_contract():
    content = _algorithm_content()

    for module_id in _homepage_ids():
        canonical = ALIAS_TARGETS.get(module_id, module_id)
        cfg = content.get(module_id) or content.get(canonical)
        assert cfg, module_id
        assert cfg.get('formula'), module_id
        assert cfg.get('pipeline'), module_id
        assert cfg.get('principles'), module_id
        story = cfg.get('visualStory') or {}
        assert story.get('cards'), module_id
        impl = cfg.get('implementation') or {}
        if module_id in {'vit', 'detr', 'clip', 'sam'}:
            assert cfg.get('endpoint'), module_id
            assert impl.get('realModel') is True
        if module_id in {'sd'}:
            assert cfg.get('endpoint'), module_id
            assert impl.get('realModel') is False


def test_frontier_algorithm_content_has_visualization_contract():
    content = _algorithm_content()

    for module_id in sorted(LOCAL_FRONTIER_ALGORITHM_MODULES | {'frequency'}):
        cfg = content.get(module_id)
        assert cfg, module_id
        assert cfg.get('endpoint') == f'/api/demo/{module_id}', module_id
        assert cfg.get('formula'), module_id
        assert cfg.get('pipeline'), module_id
        assert cfg.get('principles'), module_id
        story = cfg.get('visualStory') or {}
        assert len(story.get('cards') or []) >= 2, module_id
        if module_id in LOCAL_FRONTIER_ALGORITHM_MODULES:
            impl = cfg.get('implementation') or {}
            assert impl.get('category') == 'numpy_algorithm', module_id
            assert impl.get('realModel') is False, module_id
            assert impl.get('requiresUpload') is False, module_id
