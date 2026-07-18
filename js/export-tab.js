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
    const importInput = document.getElementById("import-input");
    let awaitingImport = false;
    document.getElementById("export-png-btn").addEventListener("click", () => {
      KC.loading.showThen("PNG画像を書き出し中…", () => {
        KC.pngExport.download(KC.state.get(), projectName());
        KC.loading.hide();
        KC.bus.emit("toast", "PNG画像を書き出しました");
      });
    });
    document.getElementById("export-json-btn").addEventListener("click", () => {
      KC.jsonIO.download(projectName());
      KC.bus.emit("toast", "プロジェクトを保存しました");
    });
    document
      .getElementById("new-project-btn")
      .addEventListener("click", onNewProject);
    // ファイル選択ダイアログを開いた瞬間から表示しておく。
    // クラウドストレージ上のファイルなど、OS側での取得に数秒かかる場合
    // その間はJSに一切イベントが来ないため、これが唯一「待機中」を
    // 伝えられるタイミングになる。
    importInput.addEventListener("click", () => {
      awaitingImport = true;
      KC.loading.show("ファイルを準備しています…");
    });
    // 'cancel'はモダンブラウザ対応（ダイアログをファイル未選択で閉じたとき発火）
    importInput.addEventListener("cancel", () => {
      awaitingImport = false;
      KC.loading.hide();
    });
    // 'cancel' 未対応ブラウザ向けフォールバック：
    // ダイアログが閉じてウィンドウにフォーカスが戻ってもchangeが来なければ
    // キャンセルされたとみなす
    window.addEventListener("focus", () => {
      if (!awaitingImport) return;
      setTimeout(() => {
        if (
          awaitingImport &&
          (!importInput.files || importInput.files.length === 0)
        ) {
          awaitingImport = false;
          KC.loading.hide();
        }
      }, 300);
    });
    document.getElementById("import-input").addEventListener("change", (e) => {
      awaitingImport = false;
      const file = e.target.files[0];
      if (!file) return;
      KC.loading.showThen("プロジェクトを読み込み中…", () => {
        KC.jsonIO.importFromFile(
          file,
          (name) => {
            if (name && name.trim()) {
              nameInput.value = name.trim();
            }
            KC.bus.emit("dataReplaced");
            KC.bus.emit("rowsChanged");
            KC.loading.hide();
            KC.bus.emit("toast", "プロジェクトを読み込みました");
          },
          () => {
            KC.loading.hide();
            alert(
              "プロジェクトファイルの読み込みに失敗しました。ファイル形式を確認してください。",
            );
          },
        );
      });
      e.target.value = "";
    });
  }

  // 現在編集中の内容（自動保存分も含む）を破棄して、まっさらな新規プロジェクトを開始する。
  function onNewProject() {
    const ok = confirm(
      "現在の編み図を破棄して、新規プロジェクトを開始します。\n保存していない変更は失われます。よろしいですか？",
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
