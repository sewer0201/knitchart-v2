/* ============================================================
   howto.js
   「使い方」ボタンで開閉する簡易ヘルプモーダル。
   以前ツールバーに常時表示していたヒント文言をここに集約した。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  let backdrop, modal, btn, closeBtn;

  function open() {
    backdrop.classList.add("is-open");
    modal.classList.add("is-open");
  }
  function close() {
    backdrop.classList.remove("is-open");
    modal.classList.remove("is-open");
  }

  function init() {
    backdrop = document.getElementById("howto-backdrop");
    modal = document.getElementById("howto-modal");
    btn = document.getElementById("howto-btn");
    closeBtn = document.getElementById("howto-close");

    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("pointerdown", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("is-open")) close();
    });
  }

  KC.howto = { init, open, close };
})(window.KC);
