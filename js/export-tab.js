/* ============================================================
   export-tab.js
   「書き出し」タブ：プロジェクト名、PNG/JSON書き出し、JSON読み込み
   （v2要件定義書 3.7 に対応）
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  const DEFAULT_PROJECT_NAME = "編み図";

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
    document.getElementById("new-project-btn").addEventListener("click", onNewProject);
    document.getElementById("import-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      KC.jsonIO.importFromFile(
        file,
        (name) => {
          if (name && name.trim()) {
            nameInput.value = name.trim();
          }
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

  // 現在編集中の内容（自動保存分も含む）を破棄して、まっさらな新規プロジェクトを開始する。
  function onNewProject() {
    const ok = confirm(
      "現在の編み図を破棄して、新規プロジェクトを開始します。\n保存していない変更は失われます。よろしいですか？"
    );
    if (!ok) return;

    KC.selection.exit();
    KC.state.reset();
    nameInput.value = DEFAULT_PROJECT_NAME;

    KC.bus.emit("dataReplaced");
    KC.bus.emit("rowsChanged");
    KC.bus.emit("sizeChanged");
    // 自動保存にも即座に反映しておく（次回リロード時に元の内容へ戻らないように）
    KC.storage.saveNow();
    KC.bus.emit("toast", "新規プロジェクトを開始しました");
  }

  KC.exportTab = { init };
})(window.KC);
