/* ============================================================
   export-tab.js
   「書き出し」タブ：プロジェクト名、PNG/JSON書き出し、JSON読み込み
   （v2要件定義書 3.7 に対応）
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  let nameInput;

  function projectName() {
    return (nameInput.value || "my-knit-chart").trim() || "my-knit-chart";
  }

  function init() {
    nameInput = document.getElementById("project-name-input");
    document.getElementById("export-png-btn").addEventListener("click", () => {
      KC.pngExport.download(KC.state.get(), projectName());
      KC.bus.emit("toast", "PNG画像を書き出しました");
    });
    document.getElementById("export-json-btn").addEventListener("click", () => {
      KC.jsonIO.download(projectName());
      KC.bus.emit("toast", "プロジェクトを保存しました");
    });
    document.getElementById("import-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      KC.jsonIO.importFromFile(
        file,
        () => {
          KC.bus.emit("dataReplaced");
          KC.bus.emit("rowsChanged");
          KC.bus.emit("toast", "プロジェクトを読み込みました");
        },
        () => {
          alert("プロジェクトファイルの読み込みに失敗しました。ファイル形式を確認してください。");
        }
      );
      e.target.value = "";
    });
  }

  KC.exportTab = { init };
})(window.KC);
