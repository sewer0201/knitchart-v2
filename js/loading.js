/* ============================================================
   loading.js
   時間のかかる処理（プロジェクト読み込みなど）の間、全画面に
   ローディング表示を出すための最小限のユーティリティ。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  let overlay, textEl;
  let shownAt = 0;
  const MIN_VISIBLE_MS = 500; // どんなに処理が速くても最低このくらいは見せる

  function init() {
    overlay = document.getElementById("loading-overlay");
    textEl = document.getElementById("loading-text");
  }

  function show(message) {
    if (!overlay) return;
    if (textEl) textEl.textContent = message || "読み込み中…";
    overlay.classList.add("is-visible");
    shownAt = performance.now();
  }

  function hide() {
    if (!overlay) return;
    const elapsed = performance.now() - shownAt;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    setTimeout(() => {
      overlay.classList.remove("is-visible");
    }, wait);
  }

  // 呼び出し元は、表示直後に重い同期処理を始める前にこれを使うことで、
  // ブラウザにローディング表示を確実に描画させてから処理に入れる。
  // requestAnimationFrame はファイル選択ダイアログが閉じた直後など、
  // ページに操作が戻ってきた瞬間は遅延・スキップされることがあるため、
  // ここでは setTimeout で確実に1回描画のタイミングを空ける。
  function showThen(message, fn) {
    show(message);
    setTimeout(fn, 50);
  }

  KC.loading = { init, show, hide, showThen };
})(window.KC);
