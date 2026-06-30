import base64
import io
from pathlib import Path

import numpy as np
from PIL import Image

from app import create_app


def test_cv_legacy_files_are_present():
    required = [
        'app/modules/phase1_fundamentals/convolution/backprop.py',
        'app/modules/phase1_fundamentals/convolution/lenet.py',
        'app/modules/phase1_fundamentals/convolution/processor.py',
        'app/modules/phase2_classical/edge/edge_numba.py',
        'app/modules/phase2_classical/edge/edge_naive.py',
        'static/data/edge_naive_benchmark.json',
        'static/data/edge_optimization_benchmark.json',
        'templates/pages/lenet_backprop.html',
    ]
    for path in required:
        assert Path(path).exists(), path


def test_cv_legacy_conv_routes_are_wired():
    app = create_app()
    client = app.test_client()

    assert client.get('/conv/backprop').status_code == 200
    assert client.get('/static/data/edge_naive_benchmark.json').status_code == 200
    assert client.get('/static/data/edge_optimization_benchmark.json').status_code == 200

    assert client.post('/conv/api/generate', json={'h': 3, 'w': 4, 'seed': 1}).status_code == 200
    assert client.post('/conv/api/kernel', json={'size': 3, 'preset': 'edge_detect'}).status_code == 200
    assert client.post(
        '/conv/api/compute',
        json={
            'mode': 'basic',
            'input': [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
            'kernel': [[1, 0], [0, -1]],
            'stride': 1,
            'padding': 0,
        },
    ).status_code == 200

    img = np.zeros((28, 28), dtype=np.uint8)
    img[8:20, 12:16] = 255
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format='PNG')
    encoded = base64.b64encode(buf.getvalue()).decode('ascii')
    assert client.post('/conv/api/forward_trace', json={'image': encoded}).status_code == 200


def test_restored_grayscale_page_keeps_detailed_legacy_frontend():
    html = Path('static/pages/grayscale.html').read_text(encoding='utf-8-sig')

    assert len(html.splitlines()) > 400
    assert '<canvas id="rgbHistogramCanvas"' in html
    assert '<canvas id="histogramCanvas"' in html
    assert 'downloadLink' in html
    assert 'historyList' in html
    assert "fetch('/gray/'" in html
    assert '../css/iframe-theme.css' in html
    assert '../js/theme-sync.js' in html
    assert 'stepsGrid' not in html


def test_legacy_grayscale_route_returns_detailed_page_contract():
    app = create_app()
    client = app.test_client()

    img = np.zeros((24, 32, 3), dtype=np.uint8)
    img[:, :16] = [240, 40, 20]
    img[:, 16:] = [40, 180, 220]
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format='PNG')
    buf.seek(0)

    resp = client.post(
        '/gray/',
        data={'file': (buf, 'colorspace.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()

    assert resp.status_code == 200
    assert payload['original_image'].startswith('/static/uploads/')
    assert payload['result_image'].startswith('/static/uploads/')
    assert client.get(payload['original_image']).status_code == 200
    assert client.get(payload['result_image']).status_code == 200
    assert payload['result_image_base64']
    assert payload['original_info']['width'] == 32
    assert payload['original_info']['height'] == 24
    assert payload['original_info']['channels'] == 3
    assert payload['result_info']['width'] == 32
    assert payload['result_info']['height'] == 24
    assert payload['result_info']['channels'] == 1
    assert {'min', 'max', 'mean', 'std'} <= set(payload['stats'])
    assert len(payload['histogram']) == 256
    assert sum(payload['histogram']) == 24 * 32
    assert payload['entry']['module_key'] == 'gray'
    assert payload['history'] and payload['history'][0]['id'] == payload['entry']['id']

    history = client.get('/api/history').get_json()
    assert history['history'] and history['history'][0]['module_key'] == 'gray'

    deleted = client.delete(f"/api/history/{payload['entry']['id']}").get_json()
    assert deleted['deleted'] is True
