/* ============================================================
   main.js
   初期化・タブ切り替え・「編む」画面の上部バー（通常時/選択モード時）
   の配線を行う。各モジュール自体はここに依存しない。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  const TABS = ["knit", "yarn", "size", "export"];
  let currentTab = "knit";

  function q(id) {
    return document.getElementById(id);
  }

  function initTabs() {
    document.querySelectorAll(".tabbar-btn").forEach((btn) => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });
  }

  function activateTab(tab) {
    if (!TABS.includes(tab)) return;
    currentTab = tab;
    TABS.forEach((t) => {
      q("view-" + t).classList.toggle("is-active", t === tab);
    });
    document.querySelectorAll(".tabbar-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    KC.bus.emit("tabActivated", tab);
    if (tab === "knit") {
      // グリッドが非表示の間にコンテナサイズが変わっている可能性があるため再フィット
      requestAnimationFrame(() => KC.grid.draw());
    }
  }

  /* ---------------- 「編む」画面 上部バー ---------------- */
  function initKnitToolbar() {
    q("enter-selection-btn").addEventListener("click", () =>
      KC.selection.enter(),
    );
    q("enter-range-select-btn").addEventListener("click", () =>
      KC.rangeSelect.enter(),
    );
    q("zoom-reset-btn").addEventListener("click", () => KC.grid.resetView());

    q("bulk-copy-btn").addEventListener("click", () =>
      KC.selection.copySelected(),
    );
    q("bulk-release-repeat-btn").addEventListener("click", () => {
      KC.selection.releaseRepeatForSelected();
      KC.bus.emit("toast", "選択した行の繰り返しを解除しました");
    });
    q("bulk-paste-btn").addEventListener("click", () =>
      KC.selection.pasteFromSelected("all"),
    );
    q("bulk-paste-flip-btn").addEventListener("click", () =>
      KC.selection.pasteFromSelected("all", true),
    );
    q("bulk-paste-color-btn").addEventListener("click", () =>
      KC.selection.pasteFromSelected("colors"),
    );
    q("bulk-paste-pattern-btn").addEventListener("click", () =>
      KC.selection.pasteFromSelected("pattern"),
    );
    q("bulk-clear-btn").addEventListener("click", () =>
      KC.selection.clearChecks(),
    );
    q("bulk-undo-btn").addEventListener("click", () =>
      KC.selection.undoLastPaste(),
    );
    q("bulk-done-btn").addEventListener("click", () => KC.selection.exit());

    q("range-copy-btn").addEventListener("click", () =>
      KC.rangeSelect.copySelected(),
    );
    q("range-paste-btn").addEventListener("click", () =>
      KC.rangeSelect.pasteAtAnchor(),
    );
    q("range-paste-flip-v-btn").addEventListener("click", () =>
      KC.rangeSelect.pasteAtAnchor({ flipV: true }),
    );
    q("range-paste-flip-h-btn").addEventListener("click", () =>
      KC.rangeSelect.pasteAtAnchor({ flipH: true }),
    );
    q("range-undo-btn").addEventListener("click", () =>
      KC.rangeSelect.undoLastPaste(),
    );
    q("range-clear-btn").addEventListener("click", () =>
      KC.rangeSelect.clearSelection(),
    );
    q("range-done-btn").addEventListener("click", () => KC.rangeSelect.exit());

    KC.bus.on("selectionChanged", updateKnitToolbar);
    KC.bus.on("rangeSelectionChanged", updateKnitToolbar);
    updateKnitToolbar();
  }

  function updateKnitToolbar() {
    const bulkActive = KC.selection.isActive();
    const rangeActive = KC.rangeSelect.isActive();
    q("knit-toolbar-normal").classList.toggle(
      "is-hidden",
      bulkActive || rangeActive,
    );
    q("knit-toolbar-bulk").classList.toggle("is-hidden", !bulkActive);
    q("knit-toolbar-range").classList.toggle("is-hidden", !rangeActive);
    document
      .getElementById("tabbar")
      .classList.toggle("is-hidden", bulkActive || rangeActive);

    if (bulkActive) {
      const n = KC.selection.count();
      const clip = KC.selection.clipboardCount();
      let status = `選択中: ${n}行`;
      if (clip) status += `／コピー済み: ${clip}行`;
      q("bulk-status").textContent = status;
      q("bulk-copy-btn").disabled = n === 0;
      q("bulk-release-repeat-btn").disabled = n === 0;
      const pasteDisabled = !KC.selection.canPaste();
      q("bulk-paste-btn").disabled = pasteDisabled;
      q("bulk-paste-flip-btn").disabled = pasteDisabled;
      q("bulk-paste-color-btn").disabled = pasteDisabled;
      q("bulk-paste-pattern-btn").disabled = pasteDisabled;
      q("bulk-undo-btn").disabled = !KC.selection.canUndo();
    }

    if (rangeActive) {
      q("range-status").textContent = KC.rangeSelect.statusText();
      q("range-copy-btn").disabled = !KC.rangeSelect.canCopy();
      const pasteDisabled = !KC.rangeSelect.canPaste();
      q("range-paste-btn").disabled = pasteDisabled;
      q("range-paste-flip-v-btn").disabled = pasteDisabled;
      q("range-paste-flip-h-btn").disabled = pasteDisabled;
      q("range-undo-btn").disabled = !KC.rangeSelect.canUndo();
    }
  }

  /* ---------------- トースト ---------------- */
  let toastTimer = null;
  function initToast() {
    KC.bus.on("toast", (msg) => {
      const el = q("toast");
      el.textContent = msg;
      el.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
    });
  }

  /* ---------------- 初期化 ---------------- */
  function init() {
    KC.state.reset();
    initTabs();
    initToast();
    // 他モジュールが初期描画で state を読む前に、保存済みデータがあれば復元しておく
    const restored = KC.storage.init();
    initKnitToolbar();
    KC.grid.init();
    KC.sheet.init();
    KC.yarnTab.init();
    KC.presetSheet.init();
    KC.sizeTab.init();
    KC.exportTab.init();
    KC.howto.init();
    // 各モジュールの初期化が終わってから、以後の変更を自動保存するようにする
    KC.storage.bindAutoSave();
    activateTab("knit");
    if (restored) KC.bus.emit("toast", "前回の編集内容を復元しました");
  }

  document.addEventListener("DOMContentLoaded", init);
})(window.KC);
