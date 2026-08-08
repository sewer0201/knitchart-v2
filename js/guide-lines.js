/* ============================================================
   guide-lines.js
   「サイズ」タブ内のガイド線（縦の目印線）機能。
   1セット2本（左右の端から／中央から左右にそれぞれ）で、
   ズレ（目数）・色・太さを設定できる。
   マス目の縦線と同じ位置に描画され、PNG書き出しにも反映される
   （実際の描画は canvas-grid.js / png-export.js 側で行う）。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let listEl, emptyNote, addBtn;
  let backdrop, sheet, title, closeBtn;
  let refBtns;
  let offsetInput, offsetMinus, offsetPlus;
  let colorInput;
  let widthInput, widthMinus, widthPlus;
  let addConfirmBtn, deleteBtn;

  let currentUid = null; // 編集中のガイド線uid。新規作成中はまだnullで、初回の入力で確定する
  let draftRef = "edges";

  function q(id) {
    return document.getElementById(id);
  }

  function init() {
    listEl = q("guide-line-list");
    emptyNote = q("guide-line-empty-note");
    addBtn = q("add-guide-line-btn");

    backdrop = q("guide-sheet-backdrop");
    sheet = q("guide-line-sheet");
    title = q("guide-line-sheet-title");
    closeBtn = q("guide-line-sheet-close");
    refBtns = document.querySelectorAll(".guide-ref-btn");
    offsetInput = q("guide-offset-input");
    offsetMinus = q("guide-offset-minus");
    offsetPlus = q("guide-offset-plus");
    colorInput = q("guide-color-input");
    widthInput = q("guide-width-input");
    widthMinus = q("guide-width-minus");
    widthPlus = q("guide-width-plus");
    addConfirmBtn = q("guide-add-confirm-btn");
    deleteBtn = q("guide-delete-btn");

    if (!listEl || !sheet) return; // マークアップが無い場合は何もしない

    addBtn.addEventListener("click", () => openSheet(null));
    backdrop.addEventListener("pointerdown", closeSheet);
    closeBtn.addEventListener("click", closeSheet);

    refBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        draftRef = btn.dataset.ref;
        refBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
        commit();
      });
    });
    offsetMinus.addEventListener("click", () => {
      offsetInput.value = Math.max(0, (parseInt(offsetInput.value, 10) || 0) - 1);
      commit();
    });
    offsetPlus.addEventListener("click", () => {
      offsetInput.value = (parseInt(offsetInput.value, 10) || 0) + 1;
      commit();
    });
    offsetInput.addEventListener("change", commit);
    colorInput.addEventListener("input", commit);
    widthMinus.addEventListener("click", () => {
      widthInput.value = Math.max(1, (parseInt(widthInput.value, 10) || 1) - 1);
      commit();
    });
    widthPlus.addEventListener("click", () => {
      widthInput.value = Math.min(12, (parseInt(widthInput.value, 10) || 1) + 1);
      commit();
    });
    widthInput.addEventListener("change", commit);
    addConfirmBtn.addEventListener("click", commit);
    deleteBtn.addEventListener("click", onDelete);

    KC.bus.on("dataReplaced", render);
    KC.bus.on("sizeChanged", render);
    KC.bus.on("tabActivated", (tab) => {
      if (tab === "size") render();
    });
    render();
  }

  function currentValues() {
    return {
      ref: draftRef,
      offset: parseInt(offsetInput.value, 10) || 0,
      color: colorInput.value,
      width: parseInt(widthInput.value, 10) || 1,
    };
  }

  // 新規追加シートでの初回の入力時に実データを作成し、以後はその線を更新するモードに切り替える。
  // 既存の線を編集している場合は、都度state側を更新する。
  // どちらの場合もキャンバスへリアルタイムにプレビューを反映する。
  function commit() {
    const values = currentValues();
    if (currentUid) {
      S.updateGuideLine(currentUid, values);
    } else {
      const gl = S.addGuideLine(values);
      currentUid = gl.uid;
      deleteBtn.classList.remove("is-hidden");
      addConfirmBtn.classList.add("is-hidden");
      title.textContent = "ガイド線を編集";
    }
    KC.bus.emit("rowsChanged");
    render();
  }

  function openSheet(uid) {
    currentUid = uid;
    const gl = uid ? S.findGuideLine(uid) : null;
    draftRef = gl ? gl.ref : "edges";

    refBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.ref === draftRef));
    offsetInput.value = gl ? gl.offset : 0;
    colorInput.value = gl ? gl.color : "#e9312b";
    widthInput.value = gl ? gl.width : 4;

    title.textContent = gl ? "ガイド線を編集" : "ガイド線を追加";
    addConfirmBtn.classList.toggle("is-hidden", !!gl);
    deleteBtn.classList.toggle("is-hidden", !gl);

    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
  }

  function closeSheet() {
    backdrop.classList.remove("is-open");
    sheet.classList.remove("is-open");
    currentUid = null;
  }

  function requestDelete(uid) {
    if (!confirm("このガイド線を削除しますか？")) return;
    S.removeGuideLine(uid);
    if (currentUid === uid) closeSheet();
    KC.bus.emit("rowsChanged");
    KC.bus.emit("toast", "ガイド線を削除しました");
    render();
  }

  function onDelete() {
    if (!currentUid) return;
    requestDelete(currentUid);
  }

  function summaryFor(gl) {
    const pos =
      gl.ref === "center" ? `中央から ${gl.offset}目` : `左右から ${gl.offset}目`;
    return `${pos}・太さ${gl.width}`;
  }

  function render() {
    if (!listEl) return;
    const lines = S.getGuideLines();
    listEl.innerHTML = "";
    if (lines.length === 0) {
      emptyNote.classList.remove("is-hidden");
      return;
    }
    emptyNote.classList.add("is-hidden");
    lines.forEach((gl) => {
      const li = document.createElement("li");
      li.className = "guide-line-item";

      const swatch = document.createElement("span");
      swatch.className = "guide-line-swatch";
      swatch.style.background = gl.color;
      swatch.style.height = Math.min(10, Math.max(2, gl.width)) + "px";

      const label = document.createElement("span");
      label.className = "guide-line-label";
      label.textContent = summaryFor(gl);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "yarn-card-del";
      delBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      delBtn.title = "削除";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        requestDelete(gl.uid);
      });

      li.appendChild(swatch);
      li.appendChild(label);
      li.appendChild(delBtn);
      li.addEventListener("click", () => openSheet(gl.uid));
      listEl.appendChild(li);
    });
  }

  KC.guideLines = { init, render };
})(window.KC);
