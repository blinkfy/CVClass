import io
import os
import base64
import subprocess
import sys
import tempfile
import time

import numpy as np
from imageio.v3 import imwrite
from PIL import Image, ImageDraw

from app import create_app
from app.modules.offline_teaching import (
    BLUEPRINT_MODULES,
    EXTERNAL_WEIGHT_MODULES,
    LOCAL_FRONTIER_ALGORITHM_MODULES,
    LOCAL_TEACHING_MODEL_MODULES,
    OFFLINE_TEACHING_MODULES,
)
from app.utils.image_utils import load_chinese_font, to_base64


def _fixture_image():
    img = np.zeros((64, 64, 3), dtype=np.uint8)
    img[16:48, 16:48] = [220, 120, 60]
    fd, path = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    imwrite(path, img)
    return path


def _fixture_png_bytes():
    img = np.zeros((72, 96, 3), dtype=np.uint8)
    img[12:56, 18:62] = [220, 120, 60]
    img[28:68, 52:88] = [40, 170, 220]
    buf = io.BytesIO()
    imwrite(buf, img, extension='.png')
    buf.seek(0)
    return buf


def _assert_explainable_steps(payload, module_id):
    assert payload.get('steps'), module_id
    for step in payload['steps']:
        assert step.get('id'), module_id
        assert step.get('name'), f'{module_id}:{step.get("id")}'
        assert step.get('explanation'), f'{module_id}:{step.get("id")}'
        assert step.get('problem_statement'), f'{module_id}:{step.get("id")}:problem_statement'
        assert step.get('plain_explanation'), f'{module_id}:{step.get("id")}:plain_explanation'
        assert step.get('watch_for'), f'{module_id}:{step.get("id")}:watch_for'
        assert step.get('formula'), f'{module_id}:{step.get("id")}'
        assert step.get('image_base64'), f'{module_id}:{step.get("id")}'


def _find_inline_image_keys(value, path='data'):
    hits = []
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key).lower()
            item_path = f'{path}.{key}'
            if 'base64' in key_text or key_text in {'image', 'img', 'mask'}:
                hits.append(item_path)
            hits.extend(_find_inline_image_keys(item, item_path))
    elif isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            hits.extend(_find_inline_image_keys(item, f'{path}[{index}]'))
    return hits


def _assert_step_data_has_no_inline_images(payload, module_id):
    for step in payload.get('steps', []):
        hits = _find_inline_image_keys(step.get('data'))
        assert not hits, f'{module_id}:{step.get("id")} contains inline image data at {hits[:3]}'


def test_demo_endpoint_returns_steps_and_metrics():
    app = create_app()
    client = app.test_client()
    path = _fixture_image()
    try:
        with open(path, 'rb') as fh:
            resp = client.post(
                '/api/demo/threshold',
                data={'file': fh},
                content_type='multipart/form-data',
            )
        assert resp.status_code == 200
        payload = resp.get_json()
        assert 'steps' in payload and 'metrics' in payload
        assert 'implementation' in payload
        assert isinstance(payload['steps'], list) and payload['steps']
        assert all('id' in s and 'name' in s for s in payload['steps'])
    finally:
        os.remove(path)


def test_api_base64_images_are_not_downscaled_by_wrapper():
    img = np.zeros((80, 160, 3), dtype=np.uint8)
    encoded = to_base64(img, max_side=32)
    decoded = Image.open(io.BytesIO(base64.b64decode(encoded)))
    assert decoded.size == (160, 80)


def test_generated_visuals_can_draw_chinese_text():
    font = load_chinese_font(18)
    canvas = Image.new('RGB', (240, 72), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), '中文公式说明', fill=(0, 0, 0), font=font)
    assert np.asarray(canvas).min() < 255


def test_modules_report_real_implementation_status():
    app = create_app()
    client = app.test_client()

    resp = client.get('/api/modules')
    assert resp.status_code == 200
    payload = resp.get_json()
    modules = {
        mod['id']: mod
        for phase in payload['phases']
        for mod in phase['modules']
    }

    assert modules['vit']['implementation']['real_model'] is True
    assert modules['vit']['implementation']['category'] == 'pretrained_model'
    assert modules['vit']['implementation']['requires_upload'] is True
    assert modules['detection']['implementation']['real_model'] is True
    assert modules['detection']['implementation']['category'] != 'requires_external_weights'
    assert modules['semantic']['implementation']['real_model'] is True
    assert modules['semantic']['implementation']['category'] != 'requires_external_weights'
    assert modules['instance']['implementation']['real_model'] is True
    assert modules['instance']['implementation']['category'] != 'requires_external_weights'
    assert modules['diffusion']['implementation']['category'] == 'local_mechanism'
    assert modules['diffusion']['implementation']['real_model'] is False
    assert modules['gan']['implementation']['category'] == 'local_mechanism'


def test_local_frontier_modules_return_algorithm_mechanism_steps():
    app = create_app()
    client = app.test_client()

    for module_id in sorted(LOCAL_FRONTIER_ALGORITHM_MODULES):
        resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
        payload = resp.get_json()
        assert resp.status_code == 200, module_id
        assert payload is not None, module_id
        assert payload['implementation']['category'] == 'numpy_algorithm', module_id
        assert payload['implementation']['real_model'] is False, module_id
        assert payload['metrics']['status'] in {'numpy_algorithm', 'local_algorithm'}, module_id
        assert len(payload['steps']) >= 4, module_id
        for step in payload['steps']:
            assert step.get('id'), module_id
            assert step.get('name'), module_id
            assert step.get('explanation'), f'{module_id}:{step.get("id")}'
            assert step.get('formula'), f'{module_id}:{step.get("id")}'
            assert step.get('image_base64'), f'{module_id}:{step.get("id")}'


def test_demo_without_upload_uses_builtin_fixture_for_upload_modules():
    app = create_app()
    client = app.test_client()

    for module_id in ['threshold', 'template_match']:
        resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
        payload = resp.get_json()
        assert resp.status_code == 200, module_id
        assert payload['implementation']['requires_upload'] is True
        assert payload['original_image'] == '/static/images/demo-street.jpg'
        _assert_explainable_steps(payload, module_id)

    for module_id in ['sam']:
        resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
        payload = resp.get_json()
        assert payload['implementation']['real_model'] is True
        assert payload['implementation']['requires_upload'] is True
        if resp.status_code == 200:
            assert payload['metrics']['status'] == 'pretrained_model', module_id
            _assert_explainable_steps(payload, module_id)
        else:
            assert resp.status_code in {400, 503}, module_id
            assert payload.get('error'), module_id


def test_sam_accepts_real_interactive_prompts_and_returns_teaching_payload():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/sam',
        data={
            'points': '[[30, 30], [46, 46]]',
            'labels': '[1, 0]',
            'box': '[12, 12, 58, 58]',
            'selected_mask': '1',
        },
        content_type='multipart/form-data',
    )
    payload = resp.get_json()

    assert resp.status_code in {200, 503}
    assert payload is not None
    assert payload['module_id'] == 'sam'
    assert 'interactions' in payload
    assert 'overlays' in payload
    assert 'outputs' in payload
    assert 'frames' in payload

    current_prompt = payload['interactions']['current_prompt']
    assert current_prompt['points'][0]['label'] == 1
    assert current_prompt['points'][1]['label'] == 0
    assert current_prompt['box'] == [12, 12, 58, 58]

    if resp.status_code == 200:
        assert [s['id'] for s in payload['steps']] == [
            'input', 'prompt_overlay', 'image_encoder', 'prompt_encoder',
            'candidate_masks', 'selected_mask',
        ]
        assert payload['metrics']['prompt_type'] == 'points+box'
        assert len(payload['outputs']['candidate_masks']) >= 1
        assert payload['outputs']['selected_idx'] == 1
        assert len(payload['frames']) >= 5
    else:
        assert payload['metrics']['status'] == 'model_not_available'
        assert payload.get('error')


def test_sample_button_modules_run_without_frontend_upload():
    app = create_app()
    client = app.test_client()
    sample_modules = [
        'gaussian', 'histogram', 'hough', 'median', 'morphology',
        'sobel', 'template_match', 'threshold',
    ]

    for module_id in sample_modules:
        start = time.perf_counter()
        resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
        elapsed = time.perf_counter() - start
        payload = resp.get_json()
        assert resp.status_code == 200, module_id
        assert elapsed < 12.0, f'{module_id} took {elapsed:.2f}s'
        assert payload['original_image'] == '/static/images/demo-street.jpg'
        _assert_explainable_steps(payload, module_id)


def test_core_demo_modules_return_json_contract():
    app = create_app()
    client = app.test_client()
    path = _fixture_image()
    try:
        for module_id in ['colorspace', 'grayscale', 'threshold', 'convolution', 'live', 'lenet']:
            data = {}
            if module_id not in {'diffusion'}:
                with open(path, 'rb') as fh:
                    data = {'file': (fh, f'{module_id}.png')}
                    resp = client.post(
                        f'/api/demo/{module_id}',
                        data=data,
                        content_type='multipart/form-data',
                    )
            else:
                resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
            assert resp.status_code in (200, 400, 501, 503)
            payload = resp.get_json()
            assert payload is not None
            assert 'implementation' in payload
            if resp.status_code == 200:
                assert 'steps' in payload and 'metrics' in payload
    finally:
        os.remove(path)


def test_required_detection_segmentation_modules_are_runnable():
    app = create_app()
    client = app.test_client()
    path = _fixture_image()
    try:
        for module_id in ['detection', 'semantic', 'instance']:
            with open(path, 'rb') as fh:
                resp = client.post(
                    f'/api/demo/{module_id}',
                    data={'file': (fh, f'{module_id}.png')},
                    content_type='multipart/form-data',
                )
            payload = resp.get_json()
            assert resp.status_code in {200, 503}, module_id
            assert payload is not None, module_id
            assert payload['implementation']['category'] != 'requires_external_weights'
            assert payload['implementation']['category'] == 'pretrained_model'
            assert payload['implementation']['real_model'] is True
            if resp.status_code == 200:
                assert payload['steps'], module_id
                assert payload['metrics']['status'] in {'pretrained_model', 'partial_error'}
            else:
                assert payload['metrics']['status'] == 'model_not_available'
    finally:
        os.remove(path)


def test_ai_eye_model_catalog_reports_weight_status_and_defaults():
    app = create_app()
    client = app.test_client()

    resp = client.get('/api/ai-eye/models')
    payload = resp.get_json()

    assert resp.status_code == 200
    assert payload['implementation']['category'] == 'pretrained_model'
    assert payload['implementation']['real_model'] is True
    assert payload['defaults']['detection'] == 'fasterrcnn_resnet50_fpn'
    assert payload['defaults']['semantic'] == 'deeplabv3_resnet50'
    assert payload['defaults']['instance'] == 'maskrcnn_resnet50_fpn'
    for model_id in [
        'fasterrcnn_resnet50_fpn',
        'retinanet_resnet50_fpn',
        'deeplabv3_resnet50',
        'lraspp_mobilenet_v3_large',
        'maskrcnn_resnet50_fpn',
    ]:
        assert model_id in payload['models']
        assert payload['models'][model_id]['download_command']
        assert 'cache_dir' in payload['models'][model_id]


def test_huggingface_frontier_loaders_default_to_offline_mode(monkeypatch):
    from app.modules.phase5_frontier.clip import algorithm as clip_algorithm
    from app.modules.phase5_frontier.detr import algorithm as detr_algorithm
    from app.modules.phase5_frontier.vit import algorithm as vit_algorithm

    for key in [
        'CV_ALLOW_MODEL_DOWNLOAD',
        'DISABLE_SAFETENSORS_CONVERSION',
        'HF_HUB_OFFLINE',
        'TRANSFORMERS_OFFLINE',
    ]:
        monkeypatch.delenv(key, raising=False)

    for algorithm in [vit_algorithm, detr_algorithm, clip_algorithm]:
        assert algorithm._allow_model_download() is False
        kwargs = algorithm._offline_model_load_kwargs(local_only=True)
        assert kwargs == {'local_files_only': True}
        assert os.environ['DISABLE_SAFETENSORS_CONVERSION'] == '1'
        assert os.environ['HF_HUB_OFFLINE'] == '1'
        assert os.environ['TRANSFORMERS_OFFLINE'] == '1'


def test_ai_eye_unified_endpoint_returns_real_steps_outputs_and_models():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/ai_eye?task=detection',
        data={
            'file': (_fixture_png_bytes(), 'ai-eye-detection.png'),
            'score_threshold': '0.95',
        },
        content_type='multipart/form-data',
    )
    payload = resp.get_json()

    assert resp.status_code in {200, 503}
    assert payload is not None
    assert payload['module_id'] == 'ai_eye'
    assert payload['implementation']['category'] == 'pretrained_model'
    assert payload['implementation']['real_model'] is True
    assert 'models' in payload
    if resp.status_code == 200:
        assert payload['metrics']['status'] in {'pretrained_model', 'partial_error'}
        assert 'detection' in payload['algorithms']
        assert 'detection' in payload['outputs']
        assert len(payload['steps']) >= 5
        for step in payload['steps']:
            assert step.get('id')
            assert step.get('name')
            assert step.get('explanation')
            assert step.get('formula')
            assert step.get('image_base64')
        assert 'detections' in payload['outputs']['detection']


def test_ai_eye_all_response_is_fetch_safe_when_models_are_available():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/ai_eye?task=all',
        data={
            'file': (_fixture_png_bytes(), 'ai-eye-all.png'),
            'score_threshold': '0.95',
        },
        content_type='multipart/form-data',
    )
    payload = resp.get_json()

    assert resp.status_code in {200, 503}
    assert payload is not None
    assert payload['module_id'] == 'ai_eye'
    assert payload['implementation']['category'] == 'pretrained_model'
    assert payload['implementation']['real_model'] is True
    if resp.status_code != 200:
        assert payload.get('error')
        assert payload['metrics']['status'] == 'model_not_available'
        return

    assert len(resp.get_data()) < 15_000_000
    assert payload['metrics']['status'] in {'pretrained_model', 'partial_error'}
    assert set(payload['outputs']).issubset({'detection', 'semantic', 'instance'})
    assert payload['outputs']
    _assert_step_data_has_no_inline_images(payload, 'ai_eye')
    for task, summary in payload['algorithms'].items():
        assert task in {'detection', 'semantic', 'instance'}
        assert 'output' not in summary
        assert 'steps' not in summary
        assert summary.get('step_ids') is not None


def test_ai_eye_legacy_detection_semantic_instance_endpoints_use_unified_contract():
    app = create_app()
    client = app.test_client()

    for module_id, output_key in [
        ('detection', 'detections'),
        ('semantic', 'labels'),
        ('instance', 'instances'),
    ]:
        resp = client.post(
            f'/api/demo/{module_id}',
            data={
                'file': (_fixture_png_bytes(), f'{module_id}.png'),
                'score_threshold': '0.95',
            },
            content_type='multipart/form-data',
        )
        payload = resp.get_json()
        assert resp.status_code in {200, 503}, module_id
        assert payload is not None, module_id
        assert payload['module_id'] == module_id
        assert payload['implementation']['category'] == 'pretrained_model'
        assert payload['implementation']['real_model'] is True
        if resp.status_code == 200:
            assert payload['metrics']['status'] in {'pretrained_model', 'partial_error'}, module_id
            assert module_id in payload['outputs'], module_id
            assert output_key in payload['outputs'][module_id], module_id
            assert payload['steps'], module_id


def test_ai_eye_step_names_do_not_repeat_selected_task_prefix():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/ai_eye?task=detection',
        data={'file': (_fixture_png_bytes(), 'ai-eye-prefix.png'), 'score_threshold': '0.95'},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code in {200, 503}
    if resp.status_code != 200:
        return

    forbidden = ('目标检测：', '语义分割：', '实例分割：')
    for step in payload['steps']:
        assert not str(step['name']).startswith(forbidden), step['name']


def test_chart_frames_do_not_gain_implicit_overlays_from_data_boxes():
    from app.routes import _ensure_interactive_payload

    resp = {
        'steps': [
            {
                'id': 'scores',
                'name': '分数图',
                'image_base64': 'AA==',
                'visual_kind': 'chart',
                'overlay_scope': 'none',
                'chart': {'type': 'bar', 'items': [{'label': '候选', 'value': 0.8}]},
                'data': {'box': [0, 0, 1, 1], 'score': 0.8},
                'explanation': '图表步骤。',
                'formula': 's',
            }
        ],
        'metrics': {},
    }

    out = _ensure_interactive_payload(resp, {}, 'detection')
    frame = out['frames'][0]
    assert frame['visual_kind'] == 'chart'
    assert frame['overlay_scope'] == 'none'
    assert not frame.get('overlays')


def test_interactive_payload_preserves_frontend_diagrams():
    from app.routes import _ensure_interactive_payload

    resp = {
        'steps': [
            {
                'id': 'residual_block',
                'name': '残差块',
                'image_base64': 'AA==',
                'visual_kind': 'architecture',
                'overlay_scope': 'none',
                'diagram': {
                    'title': '残差连接',
                    'nodes': [{'id': 'x', 'label': '输入'}, {'id': 'y', 'label': '输出'}],
                    'edges': [{'from': 'x', 'to': 'y', 'label': 'shortcut'}],
                },
                'explanation': '结构图由前端渲染。',
                'formula': 'y=F(x)+x',
            }
        ],
        'metrics': {},
    }

    out = _ensure_interactive_payload(resp, {}, 'resnet')
    frame = out['frames'][0]
    assert frame['visual_kind'] == 'architecture'
    assert frame['overlay_scope'] == 'none'
    assert frame['diagram']['nodes'][0]['label'] == '输入'


def test_structured_visuals_keep_frontend_visual_kind_after_normalization():
    from app.routes import _step_to_dict

    chart_step = _step_to_dict({
        'id': 'scores',
        'name': 'scores',
        'image': 'AA==',
        'visual_kind': 'image',
        'chart': {'type': 'bar', 'items': [{'label': 'A', 'value': 0.7}]},
    }, module_id='resnet')
    diagram_step = _step_to_dict({
        'id': 'block',
        'name': 'block',
        'image': 'AA==',
        'visual_kind': 'image',
        'diagram': {'nodes': [{'id': 'x', 'label': 'x'}]},
    }, module_id='resnet')

    assert chart_step['visual_kind'] == 'chart'
    assert diagram_step['visual_kind'] == 'architecture'


def test_gan_uses_structured_scatter_charts_for_sample_distribution():
    from app.modules.phase4_deep_learning.gan.algorithm import build_pipeline

    payload = build_pipeline(iterations=80)
    chart_steps = {step['id']: step for step in payload['steps'] if step.get('chart')}
    assert chart_steps['real_distribution']['chart']['type'] == 'scatter'
    assert chart_steps['initial_generator']['chart']['type'] == 'scatter'
    assert chart_steps['trained_generator']['chart']['type'] == 'scatter'
    assert 'plain_explanation' in chart_steps['trained_generator']


def test_diffusion_visualizes_reverse_generation_and_nonzero_prediction_error():
    from app.modules.phase4_deep_learning.diffusion.processor import build_pipeline

    payload = build_pipeline(num_steps=20)
    steps = {step['id']: step for step in payload['steps']}

    for step_id in [
        'generation_start_noise',
        'denoise_prediction_high_t',
        'denoise_update_high_t',
        'denoise_mid',
        'denoise_final',
    ]:
        assert step_id in steps
        assert steps[step_id].get('plain_explanation')

    assert steps['reverse_oracle']['data']['oracle'] is True
    assert '开卷答案' in steps['reverse_oracle']['plain_explanation']
    assert steps['error']['data']['prediction_mse'] > 0
    error_image = np.asarray(steps['error']['image'])
    assert int(error_image.max()) > int(error_image.min())

    oracle_image = np.asarray(steps['oracle_zero_error']['image'])
    assert int(oracle_image.max()) == int(oracle_image.min()) == 0
    assert '不是显示异常' in steps['oracle_zero_error']['explanation']


def test_gan_visualizes_image_generation_process_and_uses_structured_surfaces():
    from app.modules.phase4_deep_learning.gan.algorithm import build_pipeline

    payload = build_pipeline(iterations=80)
    steps = {step['id']: step for step in payload['steps']}

    assert steps['generation_flow']['visual_kind'] == 'architecture'
    assert steps['generation_flow']['diagram']['nodes'][0]['label'] == '随机噪声 z'
    assert steps['image_samples_before']['data']['sample_grid'] is True
    assert steps['image_samples_after']['data']['sample_grid'] is True
    assert '四个模式' in steps['image_samples_after']['data']['legend']['shape']
    assert 'G_theta(z)' in steps['image_samples_after']['data']['formula_terms']
    assert np.asarray(steps['image_samples_after']['image']).std() > 0

    assert steps['discriminator_surface']['visual_kind'] == 'chart'
    assert steps['discriminator_surface']['chart']['type'] == 'matrix'
    matrix = np.asarray(steps['discriminator_surface']['chart']['matrix'])
    assert float(matrix.max()) > float(matrix.min())

    assert steps['training_timeline']['visual_kind'] == 'chart'
    assert steps['training_timeline']['chart']['type'] == 'flow'


def test_diffusion_formula_terms_explain_prediction_symbols():
    from app.modules.phase4_deep_learning.diffusion.processor import build_pipeline

    payload = build_pipeline(num_steps=20)
    steps = {step['id']: step for step in payload['steps']}

    prediction_terms = steps['denoise_prediction_high_t']['data']['formula_terms']
    assert prediction_terms['x_t'] == '当前带噪图像状态'
    assert '应该去掉的噪声' in prediction_terms['epsilon_theta']

    update_terms = steps['denoise_update_high_t']['data']['formula_terms']
    assert '噪声更少一点' in update_terms['x_{t-1}']

    error_terms = steps['error']['data']['formula_terms']
    assert '真实加入的噪声' in error_terms['epsilon']


def test_originality_guarantee_states_local_steps_and_third_party_weights():
    doc = open('docs/原创性与第三方依赖保证书.md', encoding='utf-8').read()

    assert '算法流程的各个步骤' in doc
    assert '不是简单调用一个成品库函数后直接展示结果' in doc
    assert 'torchvision 官方预训练模型' in doc
    assert '不把这些公开模型结构、论文成果或预训练权重声明为从零自研' in doc
    assert '代码不是由大模型生成' in doc


def test_yolo_and_unet_architectures_are_frontend_diagrams():
    from app.modules.phase4_deep_learning.unet.algorithm import build_pipeline as build_unet
    from app.modules.phase4_deep_learning.yolo.algorithm import build_pipeline as build_yolo

    unet_steps = {step['id']: step for step in build_unet()['steps']}
    yolo_steps = {step['id']: step for step in build_yolo()['steps']}

    unet_arch = unet_steps['architecture']
    assert unet_arch['visual_kind'] == 'architecture'
    assert unet_arch['overlay_scope'] == 'none'
    assert unet_arch.get('image') is not None
    assert unet_arch['diagram']['nodes'][0]['label'] == '输入图像'
    assert any(edge.get('skip') for edge in unet_arch['diagram']['edges'])

    yolo_arch = yolo_steps['architecture']
    assert yolo_arch['visual_kind'] == 'architecture'
    assert yolo_arch['overlay_scope'] == 'none'
    assert yolo_arch.get('image') is not None
    assert yolo_arch['diagram']['nodes'][0]['label'] == '输入图像'
    assert yolo_arch['data']['formula_terms']['NMS'] == '去掉重叠重复框'


def test_ai_eye_text_heavy_steps_prefer_frontend_diagrams():
    from app.modules.phase4_deep_learning.ai_eye import processor

    spec = processor.MODEL_SPECS['fasterrcnn_resnet50_fpn']
    info = {
        'input_shape': [72, 96, 3],
        'weights': 'demo-weights',
        'categories': 91,
        'transform': 'ObjectDetection',
    }

    preprocess = processor._preprocess_diagram(info, spec)
    fpn = processor._feature_pyramid_diagram(spec)
    semantic = processor._semantic_context_diagram(
        processor.MODEL_SPECS['deeplabv3_resnet50'],
        [21, 32, 48],
    )

    for diagram in [preprocess, fpn, semantic]:
        assert diagram['title']
        assert diagram['subtitle']
        assert len(diagram['nodes']) >= 5
        assert len(diagram['edges']) >= 4

    assert preprocess['nodes'][0]['label'] == 'RGB 图片'
    assert any(node['label'] == 'FPN' for node in fpn['nodes'])
    assert any('logits' in node['label'].lower() for node in semantic['nodes'])


def test_ai_eye_response_marks_text_heavy_steps_as_architecture_when_available():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/ai_eye?task=detection',
        data={
            'file': (_fixture_png_bytes(), 'ai-eye-diagram-detection.png'),
            'score_threshold': '0.95',
        },
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code in {200, 503}
    if resp.status_code != 200:
        assert payload.get('error')
        return

    steps = {step['id']: step for step in payload['steps']}
    assert steps['detection_input']['visual_kind'] in {'image', 'overlay_image'}
    for step_id in ['detection_preprocess', 'detection_backbone_fpn']:
        assert steps[step_id]['visual_kind'] == 'architecture'
        assert steps[step_id]['overlay_scope'] == 'none'
        assert steps[step_id]['diagram']['nodes']


def test_ai_eye_real_outputs_include_clickable_focus_views_when_available():
    app = create_app()
    client = app.test_client()

    expectations = {
        'detection': ('detection', 'detections'),
        'semantic': ('semantic', 'labels'),
        'instance': ('instance', 'instances'),
    }
    for task, (output_task, output_key) in expectations.items():
        resp = client.post(
            f'/api/demo/ai_eye?task={task}',
            data={
                'file': (_fixture_png_bytes(), f'ai-eye-{task}.png'),
                'score_threshold': '0.95',
            },
            content_type='multipart/form-data',
        )
        payload = resp.get_json()
        assert resp.status_code in {200, 503}, task
        if resp.status_code != 200:
            assert payload.get('error'), task
            continue
        rows = payload['outputs'].get(output_task, {}).get(output_key, [])
        if rows:
            assert rows[0].get('focus_image_base64'), task


def test_upload_required_modules_do_not_return_500():
    app = create_app()
    client = app.test_client()
    modules_payload = client.get('/api/modules').get_json()
    module_ids = []
    for phase in modules_payload['phases']:
        for module in phase['modules']:
            implementation = module.get('implementation') or {}
            if implementation.get('requires_upload', True) and implementation.get('category') != 'requires_external_weights':
                module_ids.append(module['id'])

    script = r"""
import os
import sys
import tempfile
import numpy as np
from imageio.v3 import imwrite
from app import create_app

module_id = sys.argv[1]
app = create_app()
client = app.test_client()
img = np.zeros((64, 64, 3), dtype=np.uint8)
img[16:48, 16:48] = [220, 120, 60]
fd, path = tempfile.mkstemp(suffix='.png')
os.close(fd)
imwrite(path, img)
try:
    with open(path, 'rb') as fh:
        resp = client.post(
            f'/api/demo/{module_id}',
            data={'file': (fh, f'{module_id}.png')},
            content_type='multipart/form-data',
        )
    payload = resp.get_json()
    assert resp.status_code != 500, resp.status_code
    assert payload is not None
    assert 'implementation' in payload
    assert 'steps' in payload
    assert 'metrics' in payload
    if resp.status_code == 200:
        assert payload['steps']
        for step in payload['steps']:
            assert step.get('id')
            assert step.get('name')
            assert step.get('explanation')
            assert step.get('problem_statement')
            assert step.get('plain_explanation')
            assert step.get('watch_for')
            assert step.get('formula')
            assert step.get('image_base64')
finally:
    os.remove(path)
"""
    for module_id in sorted(module_ids):
        result = subprocess.run(
            [sys.executable, '-c', script, module_id],
            cwd=os.getcwd(),
            text=True,
            capture_output=True,
            timeout=45,
        )
        assert result.returncode == 0, (
            f'{module_id} failed upload contract\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}'
        )


def test_demo_endpoint_accepts_frontend_aliases():
    app = create_app()
    client = app.test_client()
    path = _fixture_image()
    aliases = {
        'canny': 'edge',
        'harris': 'corner',
        'faster_rcnn': 'detection',
        'fcn': 'semantic',
        'mask_rcnn': 'instance',
        'tpl_match': 'template_match',
        'sd': 'stable_diffusion',
    }
    try:
        for alias, canonical in aliases.items():
            with open(path, 'rb') as fh:
                resp = client.post(
                    f'/api/demo/{alias}',
                    data={'file': (fh, f'{alias}.png')},
                    content_type='multipart/form-data',
                )
            payload = resp.get_json()
            assert resp.status_code != 404, alias
            assert resp.status_code != 500, alias
            assert payload['requested_module_id'] == alias
            assert payload['module_id'] == canonical
    finally:
        os.remove(path)


def test_colorspace_demo_returns_four_spaces_and_channel_images():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/colorspace',
        data={'file': (_fixture_png_bytes(), 'colorspace.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code == 200
    assert payload['module_id'] == 'colorspace'
    assert payload['requested_module_id'] == 'colorspace'
    assert payload['implementation']['category'] == 'local_algorithm'
    assert payload['implementation']['real_model'] is False

    steps = {step['id']: step for step in payload['steps']}
    assert set(steps) == {'rgb_space', 'hsv_space', 'lab_space', 'cmyk_space'}
    assert [len(steps[key]['channels']) for key in ['rgb_space', 'hsv_space', 'lab_space', 'cmyk_space']] == [3, 3, 3, 4]
    for step in steps.values():
        assert step['formula']
        assert step['explanation']
        assert step['applications']
        for channel in step['channels']:
            assert channel['id']
            assert channel['name']
            assert channel['meaning']
            assert channel['range']
            assert channel['formula']
            assert channel['image_base64']
            assert channel['visualization_note']


def test_colorspace_cmyk_handles_black_white_and_rgba_without_divide_by_zero():
    app = create_app()
    client = app.test_client()
    img = np.zeros((12, 16, 4), dtype=np.uint8)
    img[:, :8, :3] = 0
    img[:, 8:, :3] = 255
    img[..., 3] = 255
    buf = io.BytesIO()
    imwrite(buf, img, extension='.png')
    buf.seek(0)

    resp = client.post(
        '/api/demo/colorspace',
        data={'file': (buf, 'black-white-rgba.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code == 200
    cmyk = next(step for step in payload['steps'] if step['id'] == 'cmyk_space')
    assert len(cmyk['channels']) == 4
    assert payload['metrics']['cmyk_k_mean'] >= 0


def test_histogram_equalization_returns_animation_data_and_stable_steps():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/histogram',
        data={'file': (_fixture_png_bytes(), 'histogram.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code == 200
    steps = {step['id']: step for step in payload['steps']}
    assert ['original', 'gray', 'histogram', 'cdf', 'mapping', 'equalized', 'equalized_histogram'] == [s['id'] for s in payload['steps']]
    for step in payload['steps']:
        assert step['formula']
        assert step['explanation']
        assert step['image_base64']

    data = steps['histogram']['data']
    assert len(data['histogram']) == 256
    assert len(data['cdf']) == 256
    assert len(data['mapping']) == 256
    assert len(data['equalized_histogram']) == 256
    assert all(data['cdf'][i] <= data['cdf'][i + 1] for i in range(255))
    assert all(0 <= x <= 255 for x in data['mapping'])
    assert all(data['mapping'][i] <= data['mapping'][i + 1] for i in range(255))
    assert 'stats' in data


def test_histogram_equalization_handles_constant_and_rgba_images():
    app = create_app()
    client = app.test_client()
    for value in [0, 255, 128]:
        img = np.zeros((18, 22, 4), dtype=np.uint8)
        img[..., :3] = value
        img[..., 3] = 255
        buf = io.BytesIO()
        imwrite(buf, img, extension='.png')
        buf.seek(0)
        resp = client.post(
            '/api/demo/histogram',
            data={'file': (buf, f'constant-{value}.png')},
            content_type='multipart/form-data',
        )
        payload = resp.get_json()
        assert resp.status_code == 200
        data = next(step for step in payload['steps'] if step['id'] == 'histogram')['data']
        assert len(data['mapping']) == 256
        assert all(np.isfinite(x) for x in data['mapping'])
        assert all(0 <= x <= 255 for x in data['mapping'])


def test_threshold_returns_otsu_process_data_and_overlay():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/threshold',
        data={'file': (_fixture_png_bytes(), 'threshold.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code == 200
    assert ['original', 'gray', 'histogram', 'otsu_score', 'decision_rule', 'result', 'overlay'] == [s['id'] for s in payload['steps']]
    steps = {step['id']: step for step in payload['steps']}
    data = steps['histogram']['data']
    assert len(data['histogram']) == 256
    assert len(data['otsu_scores']) == 256
    assert 0 <= data['threshold'] <= 255
    assert payload['metrics']['method'] == 'otsu'
    assert payload['metrics']['threshold'] == data['threshold']
    assert steps['overlay']['image_base64']


def test_noise_model_returns_distinct_models_and_statistics():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/noise',
        data={'file': (_fixture_png_bytes(), 'noise.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code == 200
    ids = [step['id'] for step in payload['steps']]
    assert {'original', 'salt_pepper', 'impulse_mask', 'gaussian_noise', 'gaussian_distribution', 'poisson_noise', 'residual_map'} <= set(ids)
    for step in payload['steps']:
        assert step['formula']
        assert step['explanation']
        assert step['image_base64']
    assert payload['metrics']['recommended_filters']['salt_pepper'] == 'median filter'
    assert payload['metrics']['gaussian_psnr_db'] > 0


def test_teaching_explanations_are_specific_to_the_current_step():
    app = create_app()
    client = app.test_client()

    histogram = client.post('/api/demo/histogram', data={}, content_type='multipart/form-data').get_json()
    hist_steps = {step['id']: step for step in histogram['steps']}
    assert '0 到 255' in hist_steps['histogram']['plain_explanation']
    assert '亮度' in hist_steps['histogram']['plain_explanation']
    assert '颜色压成亮度' not in hist_steps['histogram']['plain_explanation']
    assert 'CDF' in hist_steps['cdf']['plain_explanation']
    assert '映射表' in hist_steps['mapping']['plain_explanation']
    assert '新灰度' in hist_steps['mapping']['plain_explanation']

    threshold = client.post('/api/demo/threshold', data={}, content_type='multipart/form-data').get_json()
    threshold_steps = {step['id']: step for step in threshold['steps']}
    assert '类间方差' in threshold_steps['otsu_score']['plain_explanation']
    assert '前景' in threshold_steps['decision_rule']['plain_explanation']

    smoothing = client.post('/api/demo/smoothing', data={}, content_type='multipart/form-data').get_json()
    gaussian_steps = {step['id']: step for step in smoothing['algorithms']['gaussian']['steps']}
    median_steps = {step['id']: step for step in smoothing['algorithms']['median']['steps']}
    bilateral_steps = {step['id']: step for step in smoothing['algorithms']['bilateral']['steps']}
    assert '权重' in gaussian_steps['gaussian_kernel']['plain_explanation']
    assert '中位数' in median_steps['median_sort']['watch_for']
    assert '边缘' in bilateral_steps['bilateral_combined_weights']['watch_for']

    sobel = client.post('/api/demo/sobel', data={}, content_type='multipart/form-data').get_json()
    sobel_steps = {step['id']: step for step in sobel['steps']}
    assert '竖直边缘' in sobel_steps['gx']['watch_for']
    assert '水平边缘' in sobel_steps['gy']['watch_for']


def test_smoothing_demo_unifies_gaussian_median_and_bilateral():
    app = create_app()
    client = app.test_client()

    resp = client.post(
        '/api/demo/smoothing',
        data={'file': (_fixture_png_bytes(), 'smoothing.png')},
        content_type='multipart/form-data',
    )
    payload = resp.get_json()
    assert resp.status_code == 200
    assert payload['module_id'] == 'smoothing'
    assert {'gaussian', 'median', 'bilateral'} <= set(payload['algorithms'])
    assert payload['implementation']['category'] == 'numpy_algorithm'
    assert payload['implementation']['real_model'] is False

    for algorithm_id in ['gaussian', 'median', 'bilateral']:
        steps = payload['algorithms'][algorithm_id]['steps']
        assert len(steps) >= 4, algorithm_id
        for step in steps:
            assert step['id']
            assert step['name']
            assert step['explanation']
            assert step['problem_statement']
            assert step['plain_explanation']
            assert step['watch_for']
            assert step['formula']
            assert step['image_base64']

    kernel_step = next(step for step in payload['algorithms']['gaussian']['steps'] if step['id'] == 'gaussian_kernel')
    assert abs(kernel_step['data']['kernel_sum'] - 1.0) < 1e-6
    median_step = next(step for step in payload['algorithms']['median']['steps'] if step['id'] == 'median_sort')
    sorted_values = median_step['data']['sorted_values']
    assert sorted_values == sorted(sorted_values)
    assert sorted_values[median_step['data']['median_index']] == median_step['data']['median_value']
    bilateral_step = next(step for step in payload['algorithms']['bilateral']['steps'] if step['id'] == 'bilateral_combined_weights')
    weights = np.array(bilateral_step['data']['combined_weights'], dtype=float)
    assert np.all(np.isfinite(weights))
    assert np.all(weights >= 0)
    assert abs(float(weights.sum()) - 1.0) < 1e-6


def test_smoothing_legacy_filter_endpoints_share_unified_pipeline():
    app = create_app()
    client = app.test_client()

    for module_id in ['gaussian', 'median', 'bilateral']:
        resp = client.post(
            f'/api/demo/{module_id}',
            data={'file': (_fixture_png_bytes(), f'{module_id}.png')},
            content_type='multipart/form-data',
        )
        payload = resp.get_json()
        assert resp.status_code == 200, module_id
        assert payload['requested_module_id'] == module_id
        assert payload['module_id'] == 'smoothing'
        assert {'gaussian', 'median', 'bilateral'} <= set(payload['algorithms'])
        assert payload['steps']


def test_blueprint_modules_are_runnable_or_controlled():
    app = create_app()
    client = app.test_client()
    path = _fixture_image()
    try:
        for module_id in sorted(BLUEPRINT_MODULES):
            data = {}
            if module_id not in EXTERNAL_WEIGHT_MODULES:
                with open(path, 'rb') as fh:
                    data = {'file': (fh, f'{module_id}.png')}
                    resp = client.post(
                        f'/api/demo/{module_id}',
                        data=data,
                        content_type='multipart/form-data',
                    )
            else:
                resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
            payload = resp.get_json()
            assert payload is not None, module_id
            assert 'implementation' in payload, module_id
            assert 'steps' in payload, module_id
            assert 'metrics' in payload, module_id
            if module_id in EXTERNAL_WEIGHT_MODULES:
                assert resp.status_code == 503, module_id
                assert payload['implementation']['category'] == 'requires_external_weights'
                assert payload['metrics']['status'] == 'requires_external_weights'
            elif module_id in LOCAL_FRONTIER_ALGORITHM_MODULES:
                assert resp.status_code == 200, module_id
                assert payload['implementation']['category'] == 'numpy_algorithm'
                assert payload['implementation']['real_model'] is False
                assert len(payload['steps']) >= 4, module_id
            elif module_id in LOCAL_TEACHING_MODEL_MODULES:
                assert resp.status_code == 200, module_id
                assert payload['implementation']['category'] == 'numpy_algorithm'
                assert payload['implementation']['real_model'] is False
                assert payload['steps'], module_id
            elif module_id in OFFLINE_TEACHING_MODULES:
                assert resp.status_code == 200, module_id
                assert payload['implementation']['category'] == 'teaching_simulation'
                assert payload['steps'], module_id
    finally:
        os.remove(path)


def test_all_registered_modules_demo_endpoint_has_json_contract():
    app = create_app()
    client = app.test_client()
    modules_payload = client.get('/api/modules').get_json()

    for phase in modules_payload['phases']:
        for module in phase['modules']:
            module_id = module['id']
            impl = module.get('implementation') or {}
            if impl.get('requires_upload', True):
                # Upload-required modules are covered in subprocess isolation by
                # test_upload_required_modules_do_not_return_500. Some CV/torch
                # stacks abort the host process only after many mixed requests.
                continue
            resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
            payload = resp.get_json()
            assert resp.status_code not in {404, 500}, module_id
            assert payload is not None, module_id
            assert 'steps' in payload, module_id
            assert 'metrics' in payload, module_id
            assert 'implementation' in payload, module_id
            category = payload['implementation'].get('category')
            if category in {'pretrained_model', 'model_not_available'} and resp.status_code in {400, 503}:
                assert payload.get('error'), module_id
                continue
            if category != 'requires_external_weights':
                assert resp.status_code == 200, module_id
                assert payload['steps'], module_id


def test_all_registered_modules_return_explainable_visual_steps():
    app = create_app()
    client = app.test_client()
    modules_payload = client.get('/api/modules').get_json()

    for phase in modules_payload['phases']:
        for module in phase['modules']:
            module_id = module['id']
            impl = module.get('implementation') or {}
            if impl.get('requires_upload', True):
                # Upload-required modules are asserted in subprocess isolation by
                # test_upload_required_modules_do_not_return_500. Mixing all CV,
                # SciPy and torch stacks in one process can abort the host.
                continue
            data = {}
            resp = client.post(
                f'/api/demo/{module_id}',
                data=data,
                content_type='multipart/form-data',
            )
            payload = resp.get_json()
            category = (payload.get('implementation') or {}).get('category') if payload else None
            if category in {'pretrained_model', 'model_not_available'} and resp.status_code in {400, 503}:
                assert payload.get('error'), module_id
                continue
            assert resp.status_code == 200, module_id
            assert payload is not None, module_id
            _assert_explainable_steps(payload, module_id)
