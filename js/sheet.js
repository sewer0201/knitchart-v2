/* ============================================================
   sheet.js
   行編集ボトムシート（くり返し目数・地の色/柄の色スウォッチ選択・
   コピー/貼り付け3種・削除）。v2要件定義書 3.3 に対応。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let els = {};
  let currentUid = null;

  function q(id) {
    return document.getElementById(id);
  }

  function init() {
    els.backdrop = q("sheet-backdrop");
    els.sheet = q("row-sheet");
    els.title = q("row-sheet-title");
    els.closeBtn = q("row-sheet-close");
    els.repeatVal = q("row-repeat-val");
    els.repeatMinus = q("row-repeat-minus");
    els.repeatPlus = q("row-repeat-plus");
    els.bgSwatches = q("row-bg-swatches");
    els.fgSwatches = q("row-fg-swatches");
    els.deleteBtn = q("row-delete-btn");

    els.backdrop.addEventListener("pointerdown", close);
    els.closeBtn.addEventListener("click", close);
    els.repeatMinus.addEventListener("click", () => changeRepeat(-1));
    els.repeatPlus.addEventListener("click", () => changeRepeat(1));
    els.deleteBtn.addEventListener("click", onDelete);

    attachSwipeToClose(els.sheet);

    KC.bus.on("openRowSheet", open);
    KC.bus.on("rowsChanged", () => {
      if (currentUid) render();
    });
  }

  function attachSwipeToClose(sheetEl) {
    let startY = null;
    const handle = sheetEl.querySelector(".sheet-handle");
    handle.addEventListener(
      "touchstart",
      (e) => {
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );
    handle.addEventListener(
      "touchmove",
      (e) => {
        if (startY == null) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) sheetEl.style.transform = `translateY(${dy}px)`;
      },
      { passive: true }
    );
    handle.addEventListener("touchend", (e) => {
      const dy = (e.changedTouches[0].clientY || 0) - (startY || 0);
      sheetEl.style.transform = "";
      startY = null;
      if (dy > 60) close();
    });
  }

  function open(rowUid) {
    currentUid = rowUid;
    render();
    els.backdrop.classList.add("is-open");
    els.sheet.classList.add("is-open");
  }
  function close() {
    els.backdrop.classList.remove("is-open");
    els.sheet.classList.remove("is-open");
    currentUid = null;
  }

  function currentRow() {
    return currentUid ? S.findRow(currentUid) : null;
  }

  function render() {
    const row = currentRow();
    if (!row) {
      close();
      return;
    }
    const state = S.get();
    const rowNumber = S.rowIndex(row.uid) + 1;
    els.title.textContent = `${rowNumber}段目を編集`;
    els.repeatVal.textContent = row.repeat;
    els.repeatMinus.disabled = row.repeat <= S.REPEAT_MIN;
    els.repeatPlus.disabled = row.repeat >= S.REPEAT_MAX;

    renderSwatchGrid(els.bgSwatches, row.bg, "bg", row);
    renderSwatchGrid(els.fgSwatches, row.fg, "fg", row);

    els.deleteBtn.disabled = state.rows.length <= 1;
  }

  function renderSwatchGrid(container, selectedUid, role, row) {
    container.innerHTML = "";
    const state = S.get();

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "swatch-btn swatch-none" + (!selectedUid ? " is-selected" : "");
    noneBtn.textContent = "未設定";
    noneBtn.title = "未設定（既定色）";
    noneBtn.style.background = role === "fg" ? S.DEFAULT_FG_COLOR : S.DEFAULT_BG_COLOR;
    noneBtn.addEventListener("click", () => {
      row[role] = null;
      KC.bus.emit("rowsChanged");
    });
    container.appendChild(noneBtn);

    S.sortedYarns().forEach((y) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn" + (selectedUid === y.uid ? " is-selected" : "");
      btn.style.background = y.color;
      btn.textContent = y.id;
      btn.title = y.id;
      btn.addEventListener("click", () => {
        row[role] = y.uid;
        KC.bus.emit("rowsChanged");
      });
      container.appendChild(btn);
    });

    if (state.yarns.length === 0) {
      const note = document.createElement("p");
      note.className = "swatch-empty-note";
      note.textContent = "毛糸タブで毛糸を設定してください";
      container.appendChild(note);
    }
  }

  function changeRepeat(delta) {
    const row = currentRow();
    if (!row) return;
    S.setRowRepeat(row, row.repeat + delta);
    KC.bus.emit("rowsChanged");
  }

  function onDelete() {
    const row = currentRow();
    if (!row) return;
    const state = S.get();
    if (state.rows.length <= 1) {
      alert("最後の1行は削除できません。");
      return;
    }
    const rowNumber = S.rowIndex(row.uid) + 1;
    if (!confirm(`${rowNumber}段目を削除しますか？`)) return;
    S.removeRow(row.uid);
    close();
    KC.bus.emit("rowsChanged");
    KC.bus.emit("sizeChanged");
  }

  KC.sheet = { init };
})(window.KC);
