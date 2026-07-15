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
  let rowDirection = "top"; // "top"（大きい番号側）／"bottom"（小さい番号側）

  function init() {
    rowsInput = document.getElementById("rows-input");
    colsInput = document.getElementById("cols-input");

    document
      .getElementById("apply-size-btn")
      .addEventListener("click", onApply);
    document.getElementById("add-row-btn").addEventListener("click", () => {
      S.addRow(rowDirection);
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

    document.querySelectorAll(".row-direction-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        rowDirection = btn.dataset.direction;
        document.querySelectorAll(".row-direction-btn").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
      });
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
    S.applySize(targetRows, targetCols, rowDirection);
    afterChange();
    KC.bus.emit("toast", "サイズを変更しました");
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
