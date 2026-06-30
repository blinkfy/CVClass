(function() {
  function moduleIdFromPath() {
    var name = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (name === 'stable_diffusion') return 'stable_diffusion';
    return name;
  }

  function findModule(payload, id) {
    var found = null;
    (payload.phases || []).forEach(function(phase) {
      (phase.modules || []).forEach(function(mod) {
        if (mod.id === id) found = mod;
      });
    });
    return found;
  }

  function setDisabled(el, disabled, text) {
    if (!el) return;
    el.disabled = !!disabled;
    if (text) el.textContent = text;
  }

  function sync() {
    var id = moduleIdFromPath();
    fetch('/api/modules')
      .then(function(res) { return res.json(); })
      .then(function(payload) {
        var mod = findModule(payload, id);
        if (!mod || !mod.implementation) return;
        var impl = mod.implementation;
        var stEl = document.querySelector('.status');
        if (stEl) {
          stEl.textContent = impl.status || stEl.textContent;
          if (impl.backend === 'remote') {
            // Remote inference — blue/purple badge
            stEl.style.background = '#1e1b4b';
            stEl.style.color = '#c7d2fe';
            stEl.title = (impl.provider || '') + ' · ' + (impl.model || '');
          } else if (impl.category === 'not_implemented' || impl.category === 'model_not_available') {
            stEl.style.background = '#7f1d1d';
            stEl.style.color = '#fecaca';
          } else if (impl.real_model) {
            // Local real model — green
            stEl.style.background = '#14532d';
            stEl.style.color = '#bbf7d0';
          } else {
            // NumPy / teaching algorithm — slate
            stEl.style.background = '#1e293b';
            stEl.style.color = '#cbd5e1';
          }
        }

        if (impl.requires_upload) {
          setDisabled(document.getElementById('sampleBtn'), true, '请上传真实图片');
        }

        if (impl.category === 'not_implemented' || impl.category === 'model_not_available') {
          setDisabled(document.getElementById('runBtn'), true, '未接入真实实现');
          var errorBox = document.getElementById('errorBox');
          if (errorBox) {
            errorBox.textContent = impl.note || impl.status || '当前模块不可运行。';
            errorBox.classList.add('visible');
          }
        } else {
          // Module is available — either local or remote
          var runBtn = document.getElementById('runBtn');
          if (runBtn && runBtn.disabled) {
            setDisabled(runBtn, false, '运行');
          }
          // Show backend hint if element exists
          var hint = document.getElementById('backendHint');
          if (hint) {
            hint.textContent = impl.backend === 'remote'
              ? '☁️ 远程推理 · ' + (impl.provider || '') + ' · ' + (impl.model || '')
              : '💻 本地推理';
            hint.style.display = '';
          }
        }
      })
      .catch(function() {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
