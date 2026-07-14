/* ============================================================
   yarn-tab.js
   「毛糸」タブ：登録・インライン編集（カード形式）・削除
   （As-Is仕様書 3.1、v2要件定義書 3.5 に対応）
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let listEl, formEl, idInput, colorInput;
  let editingUid = null;

  function init() {
    listEl = document.getElementById("yarn-list");
    formEl = document.getElementById("yarn-form");
    idInput = document.getElementById("yarn-id-input");
    colorInput = document.getElementById("yarn-color-input");

    formEl.addEventListener("submit", onSubmit);
    KC.bus.on("rowsChanged", () => {}); // no-op placeholder for symmetry
    KC.bus.on("dataReplaced", render);
    KC.bus.on("tabActivated", (tab) => {
      if (tab === "yarn") render();
    });
    render();
  }

  function onSubmit(e) {
    e.preventDefault();
    const id = idInput.value.trim();
    if (!id) return;
    if (S.hasYarnId(id)) {
      if (
        !confirm(
          `番号「${id}」はすでに登録されています。それでも追加しますか？`,
        )
      )
        return;
    }
    S.addYarn(id, colorInput.value);
    idInput.value = "";
    idInput.focus();
    render();
    KC.bus.emit("rowsChanged"); // グリッド上のスウォッチ選択肢が変わるため再描画
  }

  function requestDelete(y) {
    if (
      !confirm(
        `毛糸「${y.id}」を削除しますか？この毛糸を使っている行は既定色（グレー）表示に戻ります。`,
      )
    )
      return;
    S.deleteYarn(y.uid);
    if (editingUid === y.uid) editingUid = null;
    render();
    KC.bus.emit("rowsChanged");
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    const yarns = S.sortedYarns();
    if (yarns.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-note";
      li.textContent = "毛糸が登録されていません。";
      listEl.appendChild(li);
      return;
    }
    yarns.forEach((y) => {
      const card = document.createElement("li");
      card.className = "yarn-card";

      if (editingUid === y.uid) {
        card.classList.add("is-editing");
        const colorIn = document.createElement("input");
        colorIn.type = "color";
        colorIn.className = "yarn-card-color-input";
        colorIn.value = y.color;

        const idIn = document.createElement("input");
        idIn.type = "text";
        idIn.className = "yarn-card-id-input";
        idIn.value = y.id;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "yarn-card-del";
        delBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        delBtn.title = "削除";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          requestDelete(y);
        });

        const commit = () => {
          if (editingUid !== y.uid) return;
          S.updateYarn(y.uid, idIn.value, colorIn.value);
          editingUid = null;
          render();
          KC.bus.emit("rowsChanged");
        };
        colorIn.addEventListener("input", (e) => {
          y.color = e.target.value;
          KC.bus.emit("rowsChanged");
        });
        idIn.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            idIn.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            editingUid = null;
            render();
          }
        });
        card.addEventListener("focusout", () => {
          requestAnimationFrame(() => {
            if (!card.contains(document.activeElement)) commit();
          });
        });

        card.appendChild(colorIn);
        card.appendChild(idIn);
        card.appendChild(delBtn);
        listEl.appendChild(card);
        idIn.focus();
        idIn.select();
      } else {
        const sw = document.createElement("span");
        sw.className = "yarn-card-swatch";
        sw.style.background = y.color;

        const label = document.createElement("span");
        label.className = "yarn-card-label";
        label.textContent = y.id;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "yarn-card-del";
        delBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        delBtn.title = "削除";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          requestDelete(y);
        });

        card.appendChild(sw);
        card.appendChild(label);
        card.appendChild(delBtn);
        card.title = "タップして編集";
        card.addEventListener("click", () => {
          editingUid = y.uid;
          render();
        });
        listEl.appendChild(card);
      }
    });
  }

  KC.yarnTab = { init, render };
})(window.KC);
