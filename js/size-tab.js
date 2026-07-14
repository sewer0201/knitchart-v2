/* ============================================================
   size-tab.js
   「サイズ」タブ：行数・目数の一括変更、クイック増減
   （As-Is仕様書 3.2、v2要件定義書 3.6 に対応）
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;
  let rowsInput, colsInput;

  function init() {
    rowsInput = document.getElementById("rows-input");
    colsInput = document.getElementById("cols-input");

    document.getElementById("apply-size-btn").addEventListener("click", onApply);
    document.getElementById("add-row-btn").addEventListener("click", () => {
      S.addRowAtEnd();
      afterChange();
    });
    document.getElementById("add-col-btn").addEventListener("click", () => {
      S.addColumn();
      afterChange();
    });
    document.getElementById("remove-col-btn").addEventListener("click", () => {
      S.removeColumn();
      afterChange();
    });

    KC.bus.on("dataReplaced", render);
    KC.bus.on("rowsChanged", render);
    KC.bus.on("tabActivated", (tab) => {
      if (tab === "size") render();
    });
    render();
  }

  function onApply() {
    const targetRows = parseInt(rowsInput.value, 10) || 1;
    const targetCols = parseInt(colsInput.value, 10) || 1;
    S.applySize(targetRows, targetCols);
    afterChange();
  }

  function afterChange() {
    render();
    KC.bus.emit("rowsChanged");
    KC.bus.emit("sizeChanged");
  }

  function render() {
    if (!rowsInput) return;
    rowsInput.value = S.get().rows.length;
    colsInput.value = S.get().cols;
  }

  KC.sizeTab = { init, render };
})(window.KC);
