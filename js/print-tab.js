/* ============================================================
   print-tab.js
   ・保存タブの「印刷する部分を設定」ボタン
   ・編み図タブに出る「印刷範囲を選択」ツールバー（一覧・追加/更新・終了）
   ・保存タブに出る「印刷用画像」一覧（プレビュー・区切り線の色・保存・
     選び直し・削除）
   のDOM配線をまとめて行う。実際の選択状態は KC.printRangeSelect、
   実際の画像生成は KC.pngExport が持つ（このファイルはその橋渡し）。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let statusEl, listEl, commitBtn, cancelBtn, cancelEditBtn, doneBtn;
  let setupBtn, imagesPanel, imagesListEl;
  let boundsInputs; // { rowTop, rowBottom, colLeft, colRight } の <input> 要素

  function q(id) {
    return document.getElementById(id);
  }

  function init() {
    statusEl = q("printrange-status");
    listEl = q("printrange-list");
    commitBtn = q("printrange-commit-btn");
    cancelBtn = q("printrange-cancel-btn");
    cancelEditBtn = q("printrange-cancel-edit-btn");
    doneBtn = q("printrange-done-btn");
    setupBtn = q("setup-print-range-btn");
    imagesPanel = q("print-images-panel");
    imagesListEl = q("print-images-list");
    boundsInputs = {
      rowTop: q("printrange-input-rowTop"),
      rowBottom: q("printrange-input-rowBottom"),
      colLeft: q("printrange-input-colLeft"),
      colRight: q("printrange-input-colRight"),
    };

    if (setupBtn) {
      setupBtn.addEventListener("click", () => {
        KC.printRangeSelect.enter();
        KC.bus.emit("requestActivateTab", "knit");
      });
    }
    if (commitBtn) {
      commitBtn.addEventListener("click", () => KC.printRangeSelect.commit());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () =>
        KC.printRangeSelect.cancelPicking(),
      );
    }
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener("click", () =>
        KC.printRangeSelect.cancelEdit(),
      );
    }
    if (doneBtn) {
      doneBtn.addEventListener("click", () => {
        // 範囲を選択済み（2点タップ済み）なのに「この範囲を追加/更新」を押し忘れて
        // 「選択を終了」を押した場合は、終了前に自動で確定させておく
        if (KC.printRangeSelect.canCommit()) {
          KC.printRangeSelect.commit();
        }
        KC.printRangeSelect.exit();
        KC.bus.emit("requestActivateTab", "export");
      });
    }
    initBoundsInputs();

    KC.bus.on("printRangeSelectionChanged", renderToolbar);
    KC.bus.on("printRangeSelectionChanged", renderImagesPanel);
    KC.bus.on("rowsChanged", renderImagesPanel);
    KC.bus.on("sizeChanged", renderImagesPanel);
    KC.bus.on("dataReplaced", renderImagesPanel);
    KC.bus.on("tabActivated", (tab) => {
      if (tab === "export") renderImagesPanel();
    });

    renderToolbar();
    renderImagesPanel();
  }

  /* ---------------- 段/目の上下左右を数値で直接指定するステッパー ----------------
     ・段（上）＝ endRow、段（下）＝ startRow（1段が下端なのはチャートの向きと同じ）
     ・目（左）／目（右）は画面表示上の目番号（右から左に大きくなる）で入力させ、
       内部の列インデックスへは KC.pngExport.displayColNumber の逆算で変換する。
  */
  function fullChartBounds(state) {
    return {
      startRow: 1,
      endRow: Math.max(1, state.rows.length),
      startCol: 0,
      endCol: Math.max(0, state.cols - 1),
    };
  }

  function currentDisplayBounds() {
    const state = S.get();
    if (KC.printRangeSelect.canCommit()) {
      const b = KC.printRangeSelect.getPendingBounds();
      if (b) return b;
    }
    if (KC.printRangeSelect.isEditing()) {
      const pr = S.findPrintRange(KC.printRangeSelect.getEditingUid());
      if (pr) return pr;
    }
    return fullChartBounds(state);
  }

  function syncBoundsInputs() {
    if (!boundsInputs || !boundsInputs.rowTop) return;
    const state = S.get();
    const rowMax = Math.max(1, state.rows.length);
    const colMax = Math.max(1, state.cols);
    const b = currentDisplayBounds();
    boundsInputs.rowTop.min = 1;
    boundsInputs.rowTop.max = rowMax;
    boundsInputs.rowTop.value = b.endRow;
    boundsInputs.rowBottom.min = 1;
    boundsInputs.rowBottom.max = rowMax;
    boundsInputs.rowBottom.value = b.startRow;
    boundsInputs.colLeft.min = 1;
    boundsInputs.colLeft.max = colMax;
    boundsInputs.colLeft.value = KC.pngExport.displayColNumber(
      state.cols,
      b.startCol,
    );
    boundsInputs.colRight.min = 1;
    boundsInputs.colRight.max = colMax;
    boundsInputs.colRight.value = KC.pngExport.displayColNumber(
      state.cols,
      b.endCol,
    );
  }

  function applyBoundsFromInputs() {
    const state = S.get();
    const rowTop = parseInt(boundsInputs.rowTop.value, 10);
    const rowBottom = parseInt(boundsInputs.rowBottom.value, 10);
    const colLeftDisplay = parseInt(boundsInputs.colLeft.value, 10);
    const colRightDisplay = parseInt(boundsInputs.colRight.value, 10);
    if (
      [rowTop, rowBottom, colLeftDisplay, colRightDisplay].some((v) =>
        Number.isNaN(v),
      )
    ) {
      return;
    }
    KC.printRangeSelect.setPendingBounds({
      startRow: rowBottom,
      endRow: rowTop,
      startCol: state.cols - colLeftDisplay,
      endCol: state.cols - colRightDisplay,
    });
  }

  function initBoundsInputs() {
    if (!boundsInputs || !boundsInputs.rowTop) return;
    Object.values(boundsInputs).forEach((input) => {
      if (!input) return;
      // 入力中にカーソル位置が飛ばないよう、確定タイミング(change)で反映する
      input.addEventListener("change", applyBoundsFromInputs);
    });
    document
      .querySelectorAll(".printrange-stepper-btn")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const field = btn.dataset.prField;
          const delta = parseInt(btn.dataset.prDelta, 10) || 0;
          const input = boundsInputs[field];
          if (!input) return;
          const min = parseInt(input.min, 10);
          const max = parseInt(input.max, 10);
          let next = (parseInt(input.value, 10) || min || 1) + delta;
          if (!Number.isNaN(min)) next = Math.max(min, next);
          if (!Number.isNaN(max)) next = Math.min(max, next);
          input.value = next;
          applyBoundsFromInputs();
        });
      });
  }

  /* ---------------- 編み図タブ側：範囲選択ツールバー ---------------- */
  function renderToolbar() {
    if (!statusEl) return;
    statusEl.textContent = KC.printRangeSelect.statusText();
    if (commitBtn) {
      commitBtn.disabled = !KC.printRangeSelect.canCommit();
      commitBtn.innerHTML = KC.printRangeSelect.isEditing()
        ? '<i class="ti ti-check" aria-hidden="true"></i>この範囲で更新'
        : '<i class="ti ti-plus" aria-hidden="true"></i>この範囲を追加';
    }
    if (cancelBtn) {
      cancelBtn.disabled = !KC.printRangeSelect.hasPendingPoint();
    }
    if (cancelEditBtn) {
      cancelEditBtn.classList.toggle(
        "is-hidden",
        !KC.printRangeSelect.isEditing(),
      );
    }
    syncBoundsInputs();
    renderChipList();
  }

  function rangeSummary(pr, index) {
    return KC.pngExport.rangeSummary(S.get(), pr, index);
  }

  function renderChipList() {
    if (!listEl) return;
    listEl.innerHTML = "";
    const ranges = S.getPrintRanges();
    const editingUid = KC.printRangeSelect.getEditingUid();
    if (ranges.length === 0) {
      const empty = document.createElement("li");
      empty.className = "printrange-empty-note";
      empty.textContent = "まだ印刷範囲は追加されていません。";
      listEl.appendChild(empty);
      return;
    }
    ranges.forEach((pr, i) => {
      const li = document.createElement("li");
      li.className =
        "printrange-chip" + (pr.uid === editingUid ? " is-editing" : "");

      const label = document.createElement("span");
      label.className = "printrange-chip-label";
      label.textContent = rangeSummary(pr, i + 1);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "printrange-chip-btn";
      editBtn.innerHTML = '<i class="ti ti-edit" aria-hidden="true"></i>';
      editBtn.title = "この範囲を選び直す";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        KC.printRangeSelect.startEdit(pr.uid);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "printrange-chip-btn";
      delBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      delBtn.title = "削除";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        KC.printRangeSelect.removeRange(pr.uid);
      });

      li.appendChild(label);
      li.appendChild(editBtn);
      li.appendChild(delBtn);
      listEl.appendChild(li);
    });
  }

  /* ---------------- 保存タブ側：印刷用画像一覧 ---------------- */
  function renderImagesPanel() {
    if (!imagesPanel || !imagesListEl) return;
    const ranges = S.getPrintRanges();
    imagesPanel.classList.toggle("is-hidden", ranges.length === 0);
    imagesListEl.innerHTML = "";
    if (ranges.length === 0) return;

    const state = S.get();
    const pname =
      KC.exportTab && KC.exportTab.projectName
        ? KC.exportTab.projectName()
        : "編み図";

    ranges.forEach((pr, i) => {
      const idx = i + 1;
      const li = document.createElement("li");
      li.className = "print-image-item";

      const head = document.createElement("div");
      head.className = "print-image-head";

      const label = document.createElement("span");
      label.className = "print-image-label";
      label.textContent = rangeSummary(pr, idx);
      head.appendChild(label);

      const colorLabel = document.createElement("label");
      colorLabel.className = "print-image-color";
      colorLabel.title = "セクションの区切り線の色";
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = pr.dividerColor || "#161615";
      colorInput.addEventListener("input", () => {
        KC.printRangeSelect.setRangeColor(pr.uid, colorInput.value);
      });
      colorLabel.appendChild(colorInput);
      head.appendChild(colorLabel);
      li.appendChild(head);

      const title = KC.pngExport.rangeTitle(pname, state, pr, idx);
      const result = KC.pngExport.renderRangeToCanvas(state, pr, title);
      const canvas = result.canvas;
      canvas.className = "print-image-canvas";
      li.appendChild(canvas);

      if (result.warning) {
        const warn = document.createElement("p");
        warn.className = "print-image-warning";
        warn.innerHTML =
          '<i class="ti ti-alert-triangle" aria-hidden="true"></i>' +
          result.warning;
        li.appendChild(warn);
      }

      const actions = document.createElement("div");
      actions.className = "print-image-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "pill-btn";
      saveBtn.innerHTML =
        '<i class="ti ti-download" aria-hidden="true"></i>PNGとして保存';
      saveBtn.addEventListener("click", () => {
        KC.pngExport.downloadCanvas(canvas, `${pname}_範囲${idx}.png`);
        KC.bus.emit("toast", "PNG画像を書き出しました");
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "pill-btn subtle";
      editBtn.innerHTML =
        '<i class="ti ti-edit" aria-hidden="true"></i>範囲を選び直す';
      editBtn.addEventListener("click", () => {
        // 印刷範囲選択モードに入ってから、この範囲の選び直しを始める
        // （enter() は選択状態をリセットするため、必ず startEdit() より先に呼ぶ）
        KC.printRangeSelect.enter();
        KC.printRangeSelect.startEdit(pr.uid);
        KC.bus.emit("requestActivateTab", "knit");
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "pill-btn subtle danger-outline";
      delBtn.innerHTML =
        '<i class="ti ti-trash" aria-hidden="true"></i>削除';
      delBtn.addEventListener("click", () => {
        if (!confirm("この印刷範囲を削除しますか？")) return;
        KC.printRangeSelect.removeRange(pr.uid);
      });

      actions.appendChild(saveBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);

      imagesListEl.appendChild(li);
    });
  }

  KC.printTab = { init };
})(window.KC);
