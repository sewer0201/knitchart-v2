/* ============================================================
   preset-sheet.js
   「毛糸」タブの『リストから追加』ボトムシート。
   yarn-presets.js のデータを1色ずつ選べる一覧として表示し、
   チェックした色をまとめて現在の編み図に追加する
   （既に同じ番号が追加済みの色は選択不可として灰色表示）。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let backdrop, sheet, listEl, openBtn, closeBtn, addBtn;
  let selectedIds = new Set();

  function q(id) {
    return document.getElementById(id);
  }

  function init() {
    backdrop = q("preset-sheet-backdrop");
    sheet = q("preset-sheet");
    listEl = q("preset-list");
    openBtn = q("yarn-preset-btn");
    closeBtn = q("preset-sheet-close");
    addBtn = q("preset-add-btn");

    if (!openBtn || !sheet) return; // マークアップが無い場合は何もしない

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("pointerdown", close);
    addBtn.addEventListener("click", addSelected);
    attachSwipeToClose(sheet);
  }

  function attachSwipeToClose(sheetEl) {
    let startY = null;
    const handle = sheetEl.querySelector(".sheet-handle");
    if (!handle) return;
    handle.addEventListener(
      "touchstart",
      (e) => {
        startY = e.touches[0].clientY;
      },
      { passive: true },
    );
    handle.addEventListener(
      "touchmove",
      (e) => {
        if (startY == null) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) sheetEl.style.transform = `translateY(${dy}px)`;
      },
      { passive: true },
    );
    handle.addEventListener("touchend", (e) => {
      const dy = (e.changedTouches[0].clientY || 0) - (startY || 0);
      sheetEl.style.transform = "";
      startY = null;
      if (dy > 60) close();
    });
  }

  function open() {
    selectedIds.clear();
    render();
    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
  }
  function close() {
    backdrop.classList.remove("is-open");
    sheet.classList.remove("is-open");
  }

  function render() {
    listEl.innerHTML = "";
    const groups = KC.presetGroups || [];
    const totalItems = groups.reduce((n, g) => n + (g.items || []).length, 0);
    if (totalItems === 0) {
      const note = document.createElement("p");
      note.className = "empty-note";
      note.textContent = "リストに毛糸が登録されていません。";
      listEl.appendChild(note);
      updateAddBtn();
      return;
    }
    groups.forEach((group) => {
      if (!group.items || group.items.length === 0) return;
      const title = document.createElement("p");
      title.className = "preset-group-title";
      title.textContent = group.name || "";
      listEl.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "preset-grid";
      group.items.forEach((preset) => {
        grid.appendChild(renderPresetItem(preset));
      });
      listEl.appendChild(grid);
    });
    updateAddBtn();
  }

  function renderPresetItem(preset) {
    const alreadyAdded = S.hasYarnId(preset.id);

    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "preset-swatch-item" +
      (selectedIds.has(preset.id) ? " is-selected" : "") +
      (alreadyAdded ? " is-added" : "");
    item.disabled = alreadyAdded;
    item.title = alreadyAdded ? `${preset.id}（追加済み）` : preset.id;

    const dot = document.createElement("span");
    dot.className = "preset-swatch-btn";
    dot.style.background = preset.color;
    dot.textContent = preset.id;

    item.appendChild(dot);

    if (!alreadyAdded) {
      item.addEventListener("click", () => {
        if (selectedIds.has(preset.id)) selectedIds.delete(preset.id);
        else selectedIds.add(preset.id);
        item.classList.toggle("is-selected");
        updateAddBtn();
      });
    }
    return item;
  }

  function updateAddBtn() {
    if (!addBtn) return;
    const n = selectedIds.size;
    addBtn.disabled = n === 0;
    addBtn.textContent =
      n > 0 ? `選択した色を追加（${n}）` : "選択した色を追加";
  }

  function allPresetItems() {
    const groups = KC.presetGroups || [];
    return groups.reduce((acc, g) => acc.concat(g.items || []), []);
  }

  function addSelected() {
    const presets = allPresetItems();
    const chosen = presets.filter((p) => selectedIds.has(p.id));
    let added = 0;
    let skipped = 0;
    chosen.forEach((p) => {
      if (S.hasYarnId(p.id)) {
        skipped++;
        return;
      }
      S.addYarn(p.id, p.color);
      added++;
    });
    selectedIds.clear();
    close();
    KC.yarnTab.render();
    KC.bus.emit("rowsChanged");

    let msg = `${added}色を追加しました`;
    if (skipped > 0) msg += `（${skipped}色は番号が重複のためスキップ）`;
    KC.bus.emit("toast", msg);
  }

  KC.presetSheet = { init, open, close };
})(window.KC);
