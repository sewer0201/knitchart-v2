/* ============================================================
   bus.js
   モジュール間の疎結合な連携のための最小限のイベントバス。
   例: 「rowsChanged」を発火すると、グリッド／ボトムシート／
   一括操作バーなど、購読している各モジュールが自身の再描画を行う。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const listeners = {};

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }
  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error("[KC.bus]", event, err);
      }
    });
  }

  KC.bus = { on, emit };
})(window.KC);
