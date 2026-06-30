import json
import re
import subprocess
from pathlib import Path

from app import create_app
from app.routes import MODULE_ALIASES


DEBUG_OR_EXPERIMENTAL_PAGES = {
    'upload_test.html',
    'gauss_test.html',
}

HIDDEN_COMPAT_MODULES = {
    'ai_eye',
    'nms',
    'template_match',
    'tpl_match',
    'hough',
    'contour',
}


def _formal_static_pages():
    return sorted(
        page
        for page in Path('static/pages').glob('*.html')
        if page.name not in DEBUG_OR_EXPERIMENTAL_PAGES
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


def _registered_module_ids():
    app = create_app()
    client = app.test_client()
    payload = client.get('/api/modules').get_json()
    return {
        mod['id']
        for phase in payload['phases']
        for mod in phase['modules']
    }


def _homepage_algorithm_ids():
    script = Path('static/js/app.js').read_text(encoding='utf-8')
    topic_block = script.split('const TOPIC_CARDS =', 1)[1].split('function _renderTopicCard', 1)[0]
    ids = set(re.findall(r"\{id:'([^']+)'", topic_block))
    ids.update(re.findall(r"mid:'([^']+)'", topic_block))
    return ids


def _nn_interactive_ids():
    html = Path('static/pages/nn_interactive.html').read_text(encoding='utf-8')
    return set(re.findall(r'([A-Za-z0-9_]+):\{cat:', html))


def _html_query_module_refs():
    refs = set()
    for page in _formal_static_pages():
        text = page.read_text(encoding='utf-8')
        refs.update(re.findall(r'[?&](?:id|module)=([A-Za-z0-9_]+)', text))
        refs.update(re.findall(r"(?:id|module)[:=]'([A-Za-z0-9_]+)'", text))
    return refs


def test_app_shell_shows_topics_not_individual_algorithm_cards():
    script = Path('static/js/app.js').read_text(encoding='utf-8')

    assert 'function _card(a)' not in script
    assert 'phase.algo.map(a=>_card(a))' not in script
    assert 'grp.algo.map(a=>_card(a))' not in script
    assert 'line.querySelectorAll(\'.algo-card\')' not in script
    assert "line.className='phase-line topic-rail'" in script
    assert 'topic-row' in script
    assert 'TOPIC_CARDS.filter' in script
    assert 'algo-index' in script
    assert 'topic-square' in script
    assert 'algorithm-square-card' in script
    assert "id:'ai-eye-detection-seg'" not in script


def test_homepage_stats_do_not_claim_zero_black_box_calls():
    html = Path('templates/index.html').read_text(encoding='utf-8')

    assert '黑盒调用' not in html
    assert '<label>外部 API</label>' in html


def test_algorithm_principles_doc_api_and_reader_contract():
    app = create_app()
    client = app.test_client()
    resp = client.get('/api/docs/algorithm-principles')
    text = resp.get_data(as_text=True)

    assert resp.status_code == 200
    assert resp.content_type == 'text/markdown; charset=utf-8'
    assert '# 计算机视觉算法原理详解' in text
    assert '## 阶段一 · 基础原语 {#phase-fundamentals}' in text
    assert '## 阶段四 · 前沿基础模型 {#phase-foundation-models}' in text
    assert '### 色彩与对比 {#topic-color-and-contrast}' in text
    assert '{#algo-sift}' in text
    assert '{#algo-stable_diffusion}' in text
    assert '```mermaid' in text
    assert '**' not in text
    for forbidden in [
        'or a shared static page',
        'local small algorithm implementation',
        'Computer Vision Notes',
        'This page shows',
        'not pretrained-weight inference',
    ]:
        assert forbidden not in text

    page = Path('static/pages/algorithm_principles.html').read_text(encoding='utf-8')
    for marker in [
        '../css/iframe-theme.css',
        '../js/page-utils.js',
        '../js/theme-sync.js',
        'marked.min.js',
        'purify.min.js',
        'mermaid.min.js',
        '/api/docs/algorithm-principles',
        'docSearch',
        'tocList',
        'phaseTabs',
        'parseDocument',
        'activatePhase',
        'protectMath',
        'restoreMath',
        'function renderMath',
        'typesetPromise([root])',
        'var esc = window.escapeHtml',
    ]:
        assert marker in page
    assert 'Computer Vision Notes' not in page


def test_visible_modules_have_algorithm_principles_anchors_and_home_entry_is_special_page():
    app = create_app()
    client = app.test_client()
    payload = client.get('/api/modules').get_json()
    visible_ids = {
        mod['id']
        for phase in payload['phases']
        for mod in phase['modules']
    }
    doc = Path('docs/算法原理详解.md').read_text(encoding='utf-8')
    app_js = Path('static/js/app.js').read_text(encoding='utf-8')
    html = Path('templates/index.html').read_text(encoding='utf-8')

    assert visible_ids
    for module_id in visible_ids:
        assert doc.count(f'{{#algo-{module_id}}}') == 1, module_id
    assert doc.count('```mermaid') == len(visible_ids)

    assert 'id="btn-principles"' in html
    assert '算法原理文档' in html
    assert "Router.on('/principles'" in app_js
    assert "Router.on('/principles/:anchor'" in app_js
    assert "case'openPrinciples'" in app_js
    assert '/static/pages/algorithm_principles.html' in app_js
    assert 'algorithm_principles' not in visible_ids


def test_algorithm_network_nodes_map_to_principles_sections():
    network = Path('static/algorithm_network.html').read_text(encoding='utf-8')
    doc = Path('docs/算法原理详解.md').read_text(encoding='utf-8')
    node_block = network.split('const N=[', 1)[1].split('];', 1)[0]
    node_ids = set(re.findall(r"id:'([^']+)'", node_block))
    alias_block = network.split('const DOC_ID_MAP={', 1)[1].split('};', 1)[0]
    aliases = dict(re.findall(r"([A-Za-z0-9_]+):'([^']+)'", alias_block))

    assert node_ids
    assert 'data-doc-anchor="${docAnchorFor(n.id)}"' in network
    assert "type:'openPrinciples'" in network

    missing = [
        node_id
        for node_id in sorted(node_ids)
        if f'{{#algo-{aliases.get(node_id, node_id)}}}' not in doc
    ]
    assert not missing


def test_homepage_merges_classical_feature_and_geometry_phases():
    html = Path('templates/index.html').read_text(encoding='utf-8')
    script = Path('static/js/app.js').read_text(encoding='utf-8')
    content = Path('static/js/algorithm-content.js').read_text(encoding='utf-8')
    topic_block = script.split('const TOPIC_CARDS =', 1)[1].split('function _algoMeta', 1)[0]

    assert '<number>4</number><label>认知阶段</label>' in html
    assert '5 阶段' not in script
    assert "name:'阶段二 · 经典结构与几何视觉'" in script
    assert "name:'阶段三 · 中级视觉'" not in script
    assert "name:'阶段三 · 深度学习时代'" in script
    assert "name:'阶段四 · 前沿基础模型'" in script

    assert "{ id:'feature-matching', phase:1" in topic_block
    assert "{ id:'ai-eye-bridge', phase:2" in topic_block
    assert "{ id:'cnn-foundations', phase:2" in topic_block
    assert "{ id:'generative-models', phase:2" in topic_block
    assert "{ id:'transformer-vision', phase:3" in topic_block
    assert "{ id:'foundation-models', phase:3" in topic_block

    assert '阶段三 · 中级视觉' not in content
    assert '经典结构与几何视觉' in content


def test_topic_cards_use_content_sized_fixed_height_and_expanded_algorithms_are_list_items():
    css = Path('static/css/main.css').read_text(encoding='utf-8')
    topic_row = css.split('.topic-row{', 1)[1].split('}', 1)[0]
    topic_square = css.split('.topic-square{', 1)[1].split('}', 1)[0]
    algo_item = css.split('.algorithm-square-card{', 1)[1].split('}', 1)[0]
    drawer = css.split('.algorithm-square-grid{', 1)[1].split('}', 1)[0]

    assert 'display:grid' in topic_row
    assert 'overflow-x:auto' not in topic_row
    assert 'scroll-snap-type:x' not in topic_row
    assert 'aspect-ratio:1/1' not in topic_square
    assert 'height:var(--topic-square-h,auto)' in topic_square
    assert 'min-height:250px' in topic_square
    assert 'aspect-ratio:1/1' not in algo_item
    assert 'grid-template-columns:1fr' in drawer
    assert 'min-height:54px' in algo_item
    assert 'grid-template-areas:"title role" "desc desc"' in algo_item
    assert 'grid-template-columns:repeat(auto-fill' in topic_row
    assert 'overflow:visible' in algo_item
    assert 'text-overflow:ellipsis' not in css.split('.algorithm-square-card .algo-role{', 1)[1].split('}', 1)[0]
    assert 'text-overflow:ellipsis' not in css.split('.algorithm-square-card strong{', 1)[1].split('}', 1)[0]
    assert 'text-overflow:ellipsis' not in css.split('.algorithm-square-card small{', 1)[1].split('}', 1)[0]
    assert 'white-space:normal' in css.split('.algorithm-square-card small{', 1)[1].split('}', 1)[0]


def test_homepage_topic_cards_show_full_copy_with_measured_uniform_height():
    css = Path('static/css/main.css').read_text(encoding='utf-8')
    script = Path('static/js/app.js').read_text(encoding='utf-8')
    topic_title = css.split('.topic-square h3,.bridge-copy h3{', 1)[1].split('}', 1)[0]
    topic_copy = css.split('.topic-square p,.bridge-copy p{', 1)[1].split('}', 1)[0]

    assert 'TOPIC_SUMMARY_LIMIT' not in script
    assert 'function _topicSummary(text)' not in script
    assert 'function _syncTopicSquareHeight()' in script
    assert "document.documentElement.style.setProperty('--topic-square-h'" in script
    assert 'Math.ceil(square.scrollHeight)' in script
    assert "window.addEventListener('resize',Utils.debounce(_scheduleTopicSquareHeightSync,120))" in script
    assert 'document.fonts.ready.then(_scheduleTopicSquareHeightSync)' in script
    assert "'<p>'+escHtml(meta.narrative||'')+'</p>'" in script

    assert 'overflow-wrap:anywhere' in topic_title
    assert 'overflow-wrap:anywhere' in topic_copy
    assert '-webkit-line-clamp' not in topic_copy
    assert 'overflow:visible' in topic_copy


def test_homepage_topic_expand_uses_stable_drawer_animation():
    css = Path('static/css/main.css').read_text(encoding='utf-8')
    script = Path('static/js/app.js').read_text(encoding='utf-8')

    drawer_block = css.split('.algorithm-square-grid{', 1)[1].split('}', 1)[0]
    expanded_drawer = css.split('.topic-card.expanded .algorithm-square-grid{', 1)[1].split('}', 1)[0]
    topic_card_expanded = css.split('.topic-card.expanded{', 1)[1].split('}', 1)[0]

    assert 'position:absolute' in drawer_block
    assert 'opacity:0' in drawer_block
    assert 'visibility:hidden' in drawer_block
    assert 'pointer-events:none' in drawer_block
    assert 'transform:translateY(-8px)' in drawer_block
    assert 'transition:opacity' in drawer_block
    assert 'display:none' not in drawer_block

    assert 'opacity:1' in expanded_drawer
    assert 'visibility:visible' in expanded_drawer
    assert 'pointer-events:auto' in expanded_drawer
    assert 'transform:translateY(0)' in expanded_drawer

    assert 'grid-column:1/-1' not in css
    assert 'grid-template-columns:minmax(230px,280px)' not in css
    assert 'grid-column' not in topic_card_expanded
    assert 'prefers-reduced-motion: reduce' in css

    assert 'function _setTopicExpanded(card, expanded)' in script
    assert "aria-expanded=\"false\"" in script
    assert "aria-hidden=\"true\"" in script
    assert "el.setAttribute('tabindex','-1')" in script
    assert "_setTopicExpanded(card,next)" in script


def test_algorithm_pages_include_plain_problem_statement_and_no_text_clipping_overrides():
    teaching_html = Path('static/pages/teaching.html').read_text(encoding='utf-8')
    teaching_js = Path('static/js/teaching-page.js').read_text(encoding='utf-8')
    teaching_css = Path('static/css/teaching-page.css').read_text(encoding='utf-8')
    model_js = Path('static/js/model-demo-page.js').read_text(encoding='utf-8')
    model_css = Path('static/css/model-demo-page.css').read_text(encoding='utf-8')
    theme_css = Path('static/css/iframe-theme.css').read_text(encoding='utf-8')
    theme_sync = Path('static/js/theme-sync.js').read_text(encoding='utf-8')

    assert 'id="problemStatement"' in teaching_html
    assert 'function findProblemStatement(cfg)' in teaching_js
    assert 'function renderProblemStatement(cfg)' in teaching_js
    assert '解决的问题' in teaching_js
    assert '.teach-problem' in teaching_css
    assert 'overflow-wrap: anywhere' in teaching_css

    for page in Path('static/pages').glob('*.html'):
        html = page.read_text(encoding='utf-8')
        if 'model-demo-page.js' in html:
            assert 'id="problemStatement"' in html, page

    assert 'function defaultProblemStatement(id)' in model_js
    assert 'function renderProblemStatement()' in model_js
    assert '解决的问题' in model_js
    assert '.problem-statement' in model_css
    assert 'overflow-wrap:anywhere' in model_css

    assert '.teach-problem' in theme_css
    assert '.problem-statement' in theme_css
    assert 'text-overflow: clip !important' in theme_css
    assert 'white-space: normal !important' in theme_css
    assert '.teach-problem' in theme_sync
    assert '.problem-statement' in theme_sync
    assert 'text-overflow:clip!important' in theme_sync


def test_implemented_modules_keep_their_existing_subpages():
    app = create_app()
    client = app.test_client()
    payload = client.get('/api/modules').get_json()
    modules = {
        mod['id']: mod
        for phase in payload['phases']
        for mod in phase['modules']
    }

    expected_pages = {
        'colorspace': 'colorspace.html',
        'grayscale': 'grayscale.html',
        'convolution': 'conv_basic.html',
        'edge': 'edge.html',
        'corner': 'corner.html',
        'sift': 'sift.html',
        'match': 'match.html',
        'detection': 'detection_segmentation.html?task=detection',
        'semantic': 'detection_segmentation.html?task=semantic',
        'instance': 'detection_segmentation.html?task=instance',
        'yolo': 'detection_segmentation.html?task=yolo',
        'unet': 'detection_segmentation.html?task=unet',
        'resnet': 'nn_resnet.html',
        'gan': 'nn_gan.html',
        'diffusion': 'diffusion.html',
        'vit': 'vit.html',
        'detr': 'detr.html',
        'clip': 'clip.html',
        'sam': 'sam.html',
        'nerf': 'nerf.html',
        'stable_diffusion': 'stable_diffusion.html',
    }

    for module_id, page in expected_pages.items():
        assert modules[module_id]['page'] == page, module_id


def test_formal_pages_load_unified_iframe_theme_assets():
    for page in _formal_static_pages():
        html = page.read_text(encoding='utf-8')
        assert '../css/iframe-theme.css' in html, page.name
        assert '../js/theme-sync.js' in html, page.name


def test_formal_pages_using_esc_load_or_define_escape_helper():
    helper_tag = '<script src="../js/page-utils.js"></script>'
    uses_esc = re.compile(r'\besc\s*\(')
    defines_esc = re.compile(r'function\s+esc\b|(?:var|let|const)\s+esc\s*=|window\.esc\s*=')

    for page in _formal_static_pages():
        html = page.read_text(encoding='utf-8')
        helper_pos = html.find(helper_tag)
        scripts = list(re.finditer(r'<script(?:\s[^>]*)?>(.*?)</script>', html, flags=re.S | re.I))

        for index, match in enumerate(scripts):
            code = match.group(1)
            if not uses_esc.search(code) or defines_esc.search(code):
                continue
            assert helper_pos != -1, f'{page.name} script {index} uses esc() without a helper'
            assert helper_pos < match.start(), f'{page.name} loads page-utils.js after script {index}'


def test_histogram_threshold_noise_pages_have_rich_visual_teaching_surfaces():
    histogram = Path('static/pages/histogram_new.html').read_text(encoding='utf-8')
    threshold = Path('static/pages/threshold_new.html').read_text(encoding='utf-8')
    noise = Path('static/pages/noise.html').read_text(encoding='utf-8')

    for html in [histogram, threshold, noise]:
        assert '../css/iframe-theme.css' in html
        assert '../js/theme-sync.js' in html
        assert '../js/page-utils.js' in html

    for marker in [
        'mappingDemo',
        'compareSlider',
        'histCanvas',
        'cdfCanvas',
        'mapCanvas',
        'eqHistCanvas',
        '低光照照片增强',
    ]:
        assert marker in histogram

    for marker in [
        'decisionCanvas',
        'scoreCanvas',
        'stripCanvas',
        'manualThreshold',
        'Otsu 搜索分数',
        '文档二值化',
    ]:
        assert marker in threshold

    for marker in [
        'noiseScope',
        'imageGrid',
        'model-row',
        'strategy-grid',
        '椒盐噪声',
        '泊松噪声',
    ]:
        assert marker in noise


def test_smoothing_page_is_the_single_filter_frontend():
    app = create_app()
    client = app.test_client()
    payload = client.get('/api/modules').get_json()
    modules = {
        mod['id']: mod
        for phase in payload['phases']
        for mod in phase['modules']
    }

    for module_id in ['smoothing', 'gaussian', 'median', 'bilateral']:
        assert modules[module_id]['page'] == 'smoothing.html', module_id

    app_js = Path('static/js/app.js').read_text(encoding='utf-8')
    topic_block = app_js.split('const TOPIC_CARDS =', 1)[1].split('function _renderTopicCard', 1)[0]
    assert "{id:'smoothing'" in topic_block
    assert "{id:'gaussian'" not in topic_block
    assert "{id:'median'" not in topic_block
    assert "{id:'bilateral'" not in topic_block

    html = Path('static/pages/smoothing.html').read_text(encoding='utf-8')
    for marker in [
        '../css/iframe-theme.css',
        '../js/theme-sync.js',
        '../js/page-utils.js',
        '../js/card-anims.js',
        'data-step="gaussian"',
        'initCannyGaussianAnim',
        'median-sort',
        'bilateral-anim',
        'compareTable',
        '/api/demo/smoothing',
    ]:
        assert marker in html


def test_sam_page_is_interactive_prompt_teaching_stage():
    html = Path('static/pages/sam.html').read_text(encoding='utf-8')
    script = Path('static/js/sam-page.js').read_text(encoding='utf-8')

    for marker in [
        '../css/iframe-theme.css',
        '../js/theme-sync.js',
        '../js/page-utils.js',
        '../js/sam-page.js',
        'data-mode="positive"',
        'data-mode="negative"',
        'data-mode="box"',
        'candidateGrid',
        'promptCanvas',
        'frameSlider',
    ]:
        assert marker in html

    for marker in [
        "/api/demo/sam",
        "points",
        "labels",
        "box",
        "selected_mask",
        "candidate_masks",
        "composeMask",
    ]:
        assert marker in script


def test_model_demo_page_keeps_real_interaction_parameter_wiring():
    script = Path('static/js/model-demo-page.js').read_text(encoding='utf-8')

    for marker in [
        'InteractiveTeachingStage.mount',
        'onParamChange',
        'state.dynamicParams[name] = value',
        "fetch('/api/demo/' + encodeURIComponent(moduleId)",
        'delete state.dynamicParams[p.name]',
        'state.stage.render(json)',
    ]:
        assert marker in script


def test_hidden_compat_modules_are_not_standalone_frontend_but_demos_stay_compatible():
    app = create_app()
    client = app.test_client()
    payload = client.get('/api/modules').get_json()
    registered_visible_ids = {
        mod['id']
        for phase in payload['phases']
        for mod in phase['modules']
    }
    homepage_ids = _homepage_algorithm_ids()

    for module_id in ['nms', 'template_match', 'hough', 'contour']:
        assert module_id not in registered_visible_ids
    for module_id in ['nms', 'tpl_match', 'hough', 'contour']:
        assert module_id not in homepage_ids

    for module_id in ['nms', 'template_match', 'hough', 'contour']:
        resp = client.post(f'/api/demo/{module_id}', data={}, content_type='multipart/form-data')
        demo = resp.get_json()
        assert resp.status_code == 200, module_id
        assert demo['module_id'] == module_id
        assert demo['steps'], module_id


def test_hidden_compat_modules_are_removed_from_algorithm_network():
    network = Path('static/algorithm_network.html').read_text(encoding='utf-8')

    for marker in [
        "{id:'tpl_match'",
        "{id:'hough'",
        "{id:'contour'",
        "{id:'nms'",
        '模板匹配',
        'Hough变换',
        '轮廓查找',
    ]:
        assert marker not in network


def test_page_utils_provides_global_escape_helpers():
    script = Path('static/js/page-utils.js')
    assert script.exists()
    text = script.read_text(encoding='utf-8')

    assert 'window.esc' in text
    assert 'window.escapeHtml' in text
    assert '&amp;' in text
    assert '&#39;' in text


def test_theme_sync_uses_parent_messages_and_standalone_local_storage():
    script = Path('static/js/theme-sync.js').read_text(encoding='utf-8')

    assert 'window.parent.document.documentElement' in script
    assert "localStorage.getItem('theme')" in script
    assert "type==='theme'" in script or 'type === \'theme\'' in script
    assert "setAttribute('data-theme'" in script


def test_theme_sync_injects_final_light_mode_overrides():
    script = Path('static/js/theme-sync.js').read_text(encoding='utf-8')

    assert 'cv-theme-final-overrides' in script
    assert 'DOMContentLoaded' in script
    assert '--cv-page-gutter' in script
    assert '--cv-page-max' in script
    assert '--cv-font-base' in script
    assert '--cv-card-media-h' in script
    assert '--cv-thumb-media-h' in script
    assert '--cv-stage-media-h' in script
    assert 'html body .ai-page' in script
    assert 'html body .sam-page' in script
    assert 'html body .step-media' in script
    assert 'html body .candidate-card img' in script
    assert 'html[data-theme="dark"] .step-card' in script
    assert 'html[data-theme="dark"] .step-img' in script
    assert 'html[data-theme="light"] .step-card' in script
    assert 'html[data-theme="light"] .step-img' in script
    assert 'html[data-theme="light"] .teach-title-panel' in script
    assert 'html[data-theme="light"] .teach-step-card' in script
    assert 'html[data-theme="light"] .nn-step-card' in script
    assert 'html[data-theme="light"] .rc' in script
    assert 'html[data-theme="light"] input' in script
    assert 'var(--cv-media-bg)' in script
    assert 'var(--cv-control-bg)' in script
    assert 'button.primary' in script
    assert '.ai-page>.ai-hero' in script
    assert 'backdrop-filter:none' in script
    assert 'prefers-reduced-motion: reduce' in script
    assert 'html body .preview-box,html body .result-box{min-height:280px!important;height:auto!important;overflow:visible!important;}' in script
    assert '.preview-box,html body .result-box{width:100%!important;min-height:var(--cv-thumb-media-h' not in script
    assert 'height:var(--cv-stage-media-h,520px)!important' in script
    assert 'ensureArchitectureDiagrams' not in script
    assert 'architecture-content.js' not in script
    assert 'architecture-diagram.js' not in script


def test_shared_architecture_diagram_feature_is_removed_from_formal_pages():
    package = json.loads(Path('package.json').read_text(encoding='utf-8'))
    watched_scripts = [
        Path('static/js/theme-sync.js'),
        Path('static/js/teaching-page.js'),
        Path('static/js/model-demo-page.js'),
        Path('static/js/detection-segmentation.js'),
    ]
    forbidden = [
        'ArchitectureDiagram',
        'ArchitectureContent',
        'architectureRoot',
        'data-architecture-auto',
        'cv:architecture-ready',
        'renderArchitecture',
        'waitForArchitecture',
    ]

    assert '@antv/g6' not in package.get('dependencies', {})
    assert not Path('static/js/architecture-content.js').exists()
    assert not Path('static/js/architecture-diagram.js').exists()
    assert not Path('static/vendor/g6/g6.min.js').exists()
    for path in watched_scripts:
        text = path.read_text(encoding='utf-8')
        for marker in forbidden:
            assert marker not in text, f'{path} still references {marker}'


def test_model_iframe_passes_module_id_for_shared_pages():
    script = Path('static/js/app.js').read_text(encoding='utf-8')

    assert "module='+encodeURIComponent(id)+'&v='" in script


def test_iframe_theme_has_light_safe_color_tokens():
    css = Path('static/css/iframe-theme.css').read_text(encoding='utf-8')
    light_block = css.split('[data-theme="light"] {', 1)[1].split('}', 1)[0]

    for token in [
        '--cv-page-max',
        '--cv-page-gutter',
        '--cv-card-gap',
        '--cv-card-pad',
        '--cv-font-base',
        '--cv-font-body',
        '--cv-card-media-h',
        '--cv-thumb-media-h',
        '--cv-stage-media-h',
    ]:
        assert token in css

    for token in [
        '--cv-title',
        '--cv-page-header-bg',
        '--cv-soft-surface',
        '--cv-control-bg',
        '--cv-media-bg',
        '--cv-code-bg',
        '--cv-danger-text',
    ]:
        assert token in css
        assert token in light_block

    assert 'color: var(--cv-title)' in css
    assert 'background: var(--cv-media-bg)' in css
    assert '.ai-page' in css
    assert '.sam-page' in css
    assert 'object-fit: contain !important' in css
    assert 'height: var(--cv-card-media-h)' in css
    assert '.image-frame' in css
    assert 'height: var(--cv-thumb-media-h)' in css
    assert '.preview-box,\n.result-box {\n  width: 100% !important;\n  min-height: var(--cv-thumb-media-h)' not in css
    assert 'min-height: var(--cv-stage-media-h)' in css
    assert 'height: var(--cv-stage-media-h)' in css
    assert '.ai-page > .ai-hero' in css
    assert 'border: 0 !important' in css
    assert 'background: transparent !important' in css
    assert 'prefers-reduced-motion: reduce' in css


def test_shared_media_slots_use_contain_not_cover_or_cropped_cards():
    css = Path('static/css/iframe-theme.css').read_text(encoding='utf-8')

    forbidden_cover_targets = [
        '.it-media img',
        '.stage-image',
        '.step-media img',
        '.image-frame img',
        '.preview-box img',
        '.result-box img',
        '.sam-stage img',
    ]
    for selector in forbidden_cover_targets:
        assert selector in css, selector

    assert 'object-fit: cover' not in css
    assert 'object-fit:cover' not in css
    assert 'object-fit: contain !important' in css
    assert 'html body .preview-box,\nhtml body .result-box' in css
    assert 'min-height: 280px !important' in css
    assert 'html body .preview-box img,\nhtml body .result-box img' in css


def test_interactive_diagram_media_can_grow_without_clipping():
    css = Path('static/css/iframe-theme.css').read_text(encoding='utf-8')
    diagram_media = css.split('.it-media.is-diagram', 1)[1].split('}', 1)[0]
    diagram_block = css.split('.it-diagram {', 1)[1].split('}', 1)[0]

    assert 'height: auto' in diagram_media
    assert 'overflow: visible' in diagram_media
    assert 'align-items: start' in diagram_media
    assert 'height: auto' in diagram_block
    assert 'overflow: visible' in diagram_block
    assert 'place-items: start stretch' in diagram_block
    assert 'object-fit: contain' in css
    assert 'object-fit: cover' not in css
    assert 'object-fit:cover' not in css


def test_page_specific_css_uses_shared_layout_variables():
    css_files = [
        Path('static/css/model-demo-page.css'),
        Path('static/css/ai-eye-page.css'),
        Path('static/css/sam-page.css'),
    ]

    for path in css_files:
        css = path.read_text(encoding='utf-8')
        assert '--cv-page-max' in css, path
        assert '--cv-page-gutter' in css, path
        assert 'calc(100% - 48px)' not in css, path
        assert 'calc(100vw - 44px)' not in css, path


def test_main_gallery_spacing_is_wider_but_not_edge_to_edge():
    css = Path('static/css/main.css').read_text(encoding='utf-8')
    gallery_block = css.split('.gallery{', 1)[1].split('}', 1)[0]

    assert 'max-width:1580px' in gallery_block
    assert 'clamp(20px,2.2vw,30px)' in gallery_block
    assert 'padding:24px 32px 48px' not in gallery_block


def test_main_page_typography_is_readable_for_teaching_cards():
    css = Path('static/css/main.css').read_text(encoding='utf-8')

    assert 'html{background:var(--bg-deep);font-family:var(--font);font-size:16px' in css
    assert '.topic-square h3' in css
    assert '.topic-square p' in css
    assert '.algorithm-square-card strong' in css


def test_main_light_topic_cards_override_dark_topic_backgrounds():
    css = Path('static/css/main.css').read_text(encoding='utf-8')
    topic_classes = [
        'topic-color-and-contrast',
        'topic-filter-and-convolution',
        'topic-edges-to-corners',
        'topic-descriptors-and-shapes',
        'topic-feature-matching',
        'topic-ai-eye-bridge',
        'topic-cnn-foundations',
        'topic-generative-models',
        'topic-transformer-vision',
        'topic-foundation-models',
    ]

    for topic in topic_classes:
        marker = f'[data-theme="light"] .topic-square.{topic}'
        assert marker in css
        block = css.split(marker, 1)[1].split('}', 1)[0]
        assert '!important' in block, topic
        assert 'rgba(15,23,42' not in block, topic
        assert '#080d16' not in block, topic

    assert '[data-theme="light"] .topic-square h3' in css
    assert '[data-theme="light"] .topic-square p' in css


def test_algorithm_content_entries_target_registered_demo_modules():
    allowed_ids = _registered_module_ids() | set(MODULE_ALIASES) | HIDDEN_COMPAT_MODULES
    content = _algorithm_content()

    for module_id, cfg in content.items():
        if module_id == 'common':
            continue
        endpoint = cfg.get('endpoint')
        assert endpoint and endpoint.startswith('/api/demo/'), module_id
        endpoint_id = endpoint.rsplit('/', 1)[-1]
        assert endpoint_id in allowed_ids, f'{module_id} -> {endpoint_id}'


def test_all_frontend_visible_algorithm_ids_are_registered_or_aliased():
    allowed_ids = _registered_module_ids() | set(MODULE_ALIASES) | HIDDEN_COMPAT_MODULES
    content_ids = set(_algorithm_content()) - {'common'}
    visible_ids = (content_ids | _homepage_algorithm_ids() | _nn_interactive_ids() | _html_query_module_refs()) - HIDDEN_COMPAT_MODULES

    assert visible_ids
    assert visible_ids <= allowed_ids, sorted(visible_ids - allowed_ids)


def test_registered_modules_have_openable_frontend_pages():
    app = create_app()
    client = app.test_client()
    payload = client.get('/api/modules').get_json()

    for phase in payload['phases']:
        for module in phase['modules']:
            page = module.get('page')
            assert page, module['id']
            page_name = page.split('?', 1)[0]
            assert Path('static/pages', page_name).exists(), f'{module["id"]}: {page}'


def test_static_demo_endpoint_references_are_known_modules_or_status_routes():
    allowed_ids = _registered_module_ids() | set(MODULE_ALIASES) | HIDDEN_COMPAT_MODULES
    status_routes = {'vision-real-status'}
    refs = set()
    for path in list(_formal_static_pages()) + list(Path('static/js').glob('*.js')):
        if path.name in DEBUG_OR_EXPERIMENTAL_PAGES:
            continue
        refs.update(re.findall(r"/api/demo/([A-Za-z0-9_-]+)", path.read_text(encoding='utf-8')))

    assert refs
    assert refs <= allowed_ids | status_routes, sorted(refs - allowed_ids - status_routes)

    app = create_app()
    client = app.test_client()
    resp = client.get('/api/demo/vision-real-status')
    payload = resp.get_json()
    assert resp.status_code == 200
    assert payload['ready'] is True
    assert {'detection', 'semantic', 'instance'} <= set(payload['modules'])


def test_nn_interactive_referenced_modules_have_demo_backends():
    allowed_ids = _registered_module_ids() | set(MODULE_ALIASES) | HIDDEN_COMPAT_MODULES
    data_keys = _nn_interactive_ids()

    assert data_keys
    assert data_keys <= allowed_ids


def test_formal_visible_files_do_not_contain_common_mojibake():
    patterns = ('鐪', '闃', '鍥', '绠', '鈥', '鈫', '脳', '�')
    files = _formal_static_pages() + [
        Path('static/js/app.js'),
        Path('static/js/algorithm-content.js'),
        Path('static/js/teaching-page.js'),
        Path('static/js/detection-segmentation.js'),
    ]

    for path in files:
        text = path.read_text(encoding='utf-8')
        hits = [pat for pat in patterns if pat in text]
        assert not hits, f'{path}: {hits}'


def test_demo_step_renderers_include_formula_output():
    files = _formal_static_pages() + [
        Path('static/js/detection-segmentation.js'),
    ]

    for path in files:
        text = path.read_text(encoding='utf-8')
        if '/api/demo/' not in text or ('steps' not in text and 'image_base64' not in text):
            continue
        assert '.formula' in text or "['formula']" in text or '["formula"]' in text, path


def test_formal_pages_load_shared_formula_renderer():
    for page in _formal_static_pages():
        text = page.read_text(encoding='utf-8')
        if 'theme-sync.js' not in text:
            continue
        assert 'page-utils.js' in text, page


def test_detection_segmentation_taxonomy_page_exists_and_is_linked():
    page = Path('static/pages/detection_segmentation_taxonomy.html')
    text = page.read_text(encoding='utf-8')
    source = Path('static/pages/detection_segmentation.html').read_text(encoding='utf-8')
    shell = Path('templates/index.html').read_text(encoding='utf-8')
    app_js = Path('static/js/app.js').read_text(encoding='utf-8')

    assert 'detection_segmentation_taxonomy.html' in source
    assert 'id="btn-vision-taxonomy"' in shell
    assert '检测与分割谱系' in shell
    assert "Router.on('/vision-taxonomy'" in app_js
    assert 'function openVisionTaxonomy()' in app_js
    assert '/static/pages/detection_segmentation_taxonomy.html' in app_js
    for token in ['Faster R-CNN', 'YOLO', 'FCN', 'DeepLabV3', 'U-Net', 'Mask R-CNN']:
        assert token in text
    for token in ['Region-based CNN', '分类 + 定位', 'RPN', 'mask head']:
        assert token in text
    for token in ['vision-architecture-panel', 'R-CNN / Faster R-CNN 系列', '候选区域', 'CNN 特征', '分类 + 框回归', 'U-Net / FCN / DeepLab 系列', '跳跃连接保留边缘细节']:
        assert token in source
    assert 'torchvision' in text
    assert '本地机制实现' in text


def test_formal_pages_do_not_crop_step_images_with_cover():
    files = _formal_static_pages() + [
        Path('static/css/ai-eye-page.css'),
        Path('static/css/detection-segmentation.css'),
        Path('static/css/model-demo-page.css'),
        Path('static/css/iframe-theme.css'),
    ]
    for path in files:
        text = path.read_text(encoding='utf-8')
        assert 'object-fit: cover' not in text
        assert 'object-fit:cover' not in text


def test_ai_eye_uses_compact_interactive_stage_layout():
    js = Path('static/js/detection-segmentation.js').read_text(encoding='utf-8')
    css = Path('static/css/iframe-theme.css').read_text(encoding='utf-8')

    assert 'compact: true' in js
    assert '.interactive-stage.is-compact .it-layout' in css
    assert '.interactive-stage.is-compact .it-inspector' in css
    assert 'display: none' in css[css.index('.interactive-stage.is-compact .it-inspector'):css.index('.interactive-stage.is-compact .it-inspector') + 160]


def test_interactive_stage_prefers_structured_charts_and_limits_overlays():
    script = Path('static/js/interactive-teaching-stage.js').read_text(encoding='utf-8')

    assert 'drawFrameChart' in script
    assert 'drawChartHeader' in script
    assert 'drawWrappedText' in script
    assert 'drawMiniChart' in script
    assert 'drawChartScatter' in script
    assert 'renderDiagram' in script
    assert 'data-it-diagram' in script
    assert 'is-chart' in script
    assert 'is-diagram' in script
    assert 'frameAllowsOverlay' in script
    assert "kind === 'image' || kind === 'overlay_image'" in script
    assert "overlay_scope !== 'none'" in script
    assert 'payload.overlays || this.payload.outputs' not in script
    assert 'concat(extractBoxes(source.frameData))' not in script


def test_edge_playback_canvas_does_not_feed_layout_growth():
    html = Path('static/pages/edge.html').read_text(encoding='utf-8')

    assert '.anim-canvas-wrap' in html
    assert 'aspect-ratio: 16 / 10' in html
    assert 'max-height: min(58vh, 520px)' in html
    setup = html[html.index('function setupCanvas'):html.index('function stepsById')]
    assert 'canvas.style.width' not in setup
    assert 'canvas.style.height' not in setup
    assert 'ctx.setTransform' in setup


def test_formal_inline_scripts_parse_with_node(tmp_path):
    for page in _formal_static_pages():
        html = page.read_text(encoding='utf-8')
        scripts = re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>', html, flags=re.S | re.I)
        for index, code in enumerate(scripts):
            if not code.strip() or ('location.replace' in code and len(code.strip()) < 120):
                continue
            script_path = tmp_path / f'{page.stem}_{index}.js'
            script_path.write_text(code, encoding='utf-8')
            result = subprocess.run(
                ['node', '--check', str(script_path)],
                text=True,
                capture_output=True,
                timeout=20,
            )
            assert result.returncode == 0, f'{page.name} script {index}\n{result.stderr or result.stdout}'
