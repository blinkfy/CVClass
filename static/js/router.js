/**
 * 轻量级 Hash 路由器
 *   #/              → 首页画廊 (Metro Map)
 *   #/module/<id>   → 算法详情
 */
const Router = (() => {
  const _routes = new Map();
  let _lastHash = '';

  function on(pattern, handler) {
    _routes.set(pattern, { handler, regex: _re(pattern) });
  }

  function go(hash) {
    if (!hash.startsWith('#')) hash = '#' + hash;
    if (!hash.startsWith('#/')) hash = '#/';
    window.location.hash = hash;
  }

  function path() {
    return (window.location.hash || '#/').replace(/^#/, '') || '/';
  }

  function _re(pattern) {
    const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, '(?<$1>[^/]+)');
    return new RegExp('^' + esc + '$');
  }

  function dispatch() {
    const p = path();
    if (p === _lastHash) return;
    _lastHash = p;
    for (const [, { handler, regex }] of _routes) {
      const m = p.match(regex);
      if (m) { handler(m.groups || {}); return; }
    }
    console.warn('[Router] 未匹配:', p, '→ 首页');
    go('/');
  }

  window.addEventListener('hashchange', dispatch);
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.location.hash) window.location.hash = '#/';
    dispatch();
  });

  return { on, go, path, dispatch };
})();
