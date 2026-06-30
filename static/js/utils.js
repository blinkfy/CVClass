/**
 * 纯函数工具集。
 * 每个函数无副作用，输入→输出，可独立测试。
 */

const Utils = (() => {

  /**
   * 安全获取嵌套对象属性。
   * @param {Object} obj - 源对象
   * @param {string} path - 点分隔路径，如 'a.b.c'
   * @param {*} def - 默认值
   */
  function get(obj, path, def = null) {
    const keys = path.split('.');
    let cur = obj;
    for (const k of keys) {
      if (cur == null || typeof cur !== 'object') return def;
      cur = cur[k];
    }
    return cur !== undefined ? cur : def;
  }

  /**
   * 类型断言 —— 确保 value 是指定类型，否则抛错。
   * @param {*} value
   * @param {string} expectedType - typeof 的结果
   * @param {string} label - 变量名，用于错误信息
   */
  function assertType(value, expectedType, label = 'value') {
    const actual = typeof value;
    if (actual !== expectedType) {
      throw new TypeError(`${label} 期望类型 ${expectedType}，实际为 ${actual}`);
    }
    return value;
  }

  /**
   * 检查对象是否包含指定字段，缺字段则抛错。
   * @param {Object} obj
   * @param {string[]} fields - 必需字段名列表
   * @param {string} label
   */
  function assertFields(obj, fields, label = 'object') {
    if (obj == null || typeof obj !== 'object') {
      throw new TypeError(`${label} 必须是非 null 对象`);
    }
    const missing = fields.filter(f => !(f in obj));
    if (missing.length) {
      throw new Error(`${label} 缺少必需字段: ${missing.join(', ')}`);
    }
    return obj;
  }

  /**
   * 防抖 —— 高频事件只执行最后一次。
   * @param {Function} fn
   * @param {number} delay - 毫秒
   */
  function debounce(fn, delay = 200) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * 节流 —— 固定间隔内最多执行一次。
   * @param {Function} fn
   * @param {number} interval - 毫秒
   */
  function throttle(fn, interval = 100) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= interval) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  /**
   * 将 base64 字符串转为 Blob URL，用于 iframe 间传输图像数据。
   * @param {string} b64 - base64 编码的图像数据
   * @param {string} mime - 如 'image/png'
   */
  function b64ToBlobUrl(b64, mime = 'image/png') {
    const byteChars = atob(b64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  }

  /**
   * Canvas 上下文获取辅助 —— 确保 2D 上下文非空。
   * @param {HTMLCanvasElement} canvas
   */
  function getCtx2D(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError('getCtx2D 需要 HTMLCanvasElement');
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 Canvas 2D 上下文');
    return ctx;
  }

  /**
   * 显示 Toast 消息。
   * @param {string} msg
   * @param {number} duration
   */
  function toast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), duration);
  }

  return {
    get, assertType, assertFields,
    debounce, throttle,
    b64ToBlobUrl, getCtx2D,
    toast,
  };
})();
