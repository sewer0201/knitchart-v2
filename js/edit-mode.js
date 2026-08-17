/* ============================================================
   edit-mode.js
   編集モード/プレビューモードの切り替え。プロジェクトデータではなく
   その場限りのUI状態なので、KC.state ではなくここで単独に持つ。

   ・編集モード（既定）: マス目タップで色を塗れる。段番号タップで開く
     段編集シートも、くり返し目数・色ともに変更できる。
   ・プレビューモード: マス目タップでは何も起きない。段編集シートは
     くり返し目数・使用中の色の確認のみで、変更操作はできない。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  let preview = false;

  function isPreview() {
    return preview;
  }
  function setPreview(value) {
    const next = !!value;
    if (next === preview) return;
    preview = next;
    KC.bus.emit("editModeChanged", preview);
  }
  function toggle() {
    setPreview(!preview);
  }

  KC.editMode = { isPreview, setPreview, toggle };
})(window.KC);
