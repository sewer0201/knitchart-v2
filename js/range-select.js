/* ============================================================
   range-select.js
   矩形範囲選択モード：2点タップで左上・右下を指定して範囲コピー、
   1マスタップで貼り付け先（左上）を指定して貼り付け。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let active = false;
  let corner1 = null; // { rowUid, col }
  let corner2 = null; // { rowUid, col }
  let clipboard = null; // { rows, cols, cells: bool[][] }
  let pasteAnchor = null; // { rowUid, col }
  let lastSnapshot = null; // 直前の貼り付け前の行スナップショット（undo用）

  function isActive() {
    return active;
  }

  function displayIndexForUid(uid) {
    const state = S.get();
    const idx = S.rowIndex(uid);
    if (idx < 0) return null;
    return state.rows.length - idx - 1;
  }

  function clearPoints() {
    corner1 = null;
    corner2 = null;
    pasteAnchor = null;
  }

  function enter() {
    if (KC.selection && KC.selection.isActive()) KC.selection.exit();
    active = true;
    clearPoints();
    KC.bus.emit("rangeSelectionChanged");
  }
  function exit() {
    active = false;
    clearPoints();
    KC.bus.emit("rangeSelectionChanged");
  }
  function clearSelection() {
    clipboard = null;
    clearPoints();
    KC.bus.emit("rangeSelectionChanged");
  }

  function onCellTap(row, col) {
    if (!clipboard) {
      if (!corner1) {
        corner1 = { rowUid: row.uid, col };
      } else if (!corner2) {
        corner2 = { rowUid: row.uid, col };
      } else {
        corner1 = { rowUid: row.uid, col };
        corner2 = null;
      }
    } else {
      pasteAnchor = { rowUid: row.uid, col };
    }
    KC.bus.emit("rangeSelectionChanged");
  }

  function canCopy() {
    return !!corner1 && !!corner2;
  }

  function copySelected() {
    if (!canCopy()) return;
    const state = S.get();
    const d1 = displayIndexForUid(corner1.rowUid);
    const d2 = displayIndexForUid(corner2.rowUid);
    if (d1 == null || d2 == null) return;
    const dTop = Math.min(d1, d2),
      dBottom = Math.max(d1, d2);
    const cLeft = Math.min(corner1.col, corner2.col),
      cRight = Math.max(corner1.col, corner2.col);
    const rows = dBottom - dTop + 1,
      cols = cRight - cLeft + 1;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      const displayIndex = dTop + r;
      const rowNumber = state.rows.length - displayIndex;
      const rowObj = state.rows[rowNumber - 1];
      const line = [];
      for (let c = 0; c < cols; c++) {
        const col = cLeft + c;
        line.push(rowObj ? S.stitchAt(rowObj, col) : false);
      }
      cells.push(line);
    }
    clipboard = { rows, cols, cells };
    clearPoints();
    KC.bus.emit("rangeSelectionChanged");
    KC.bus.emit("toast", `範囲をコピーしました（${rows}×${cols}）`);
  }

  function canPaste() {
    return !!clipboard && !!pasteAnchor;
  }

  function buildClipboardCells(flipV, flipH) {
    let cells = clipboard.cells;
    if (flipV) cells = cells.slice().reverse();
    if (flipH) cells = cells.map((line) => line.slice().reverse());
    return cells;
  }

  // opts: { flipV: 上下反転して貼り付け, flipH: 左右反転して貼り付け }
  function pasteAtAnchor(opts) {
    opts = opts || {};
    if (!canPaste()) return;
    const state = S.get();
    const dAnchor = displayIndexForUid(pasteAnchor.rowUid);
    if (dAnchor == null) return;
    const cells = buildClipboardCells(!!opts.flipV, !!opts.flipH);

    const affectedRows = [];
    for (let r = 0; r < clipboard.rows; r++) {
      const displayIndex = dAnchor + r;
      if (displayIndex < 0 || displayIndex >= state.rows.length) continue;
      const rowNumber = state.rows.length - displayIndex;
      const rowObj = state.rows[rowNumber - 1];
      if (rowObj) affectedRows.push(rowObj);
    }
    lastSnapshot = affectedRows.map(S.snapshotRowFull);

    for (let r = 0; r < clipboard.rows; r++) {
      const displayIndex = dAnchor + r;
      if (displayIndex < 0 || displayIndex >= state.rows.length) continue;
      const rowNumber = state.rows.length - displayIndex;
      const rowObj = state.rows[rowNumber - 1];
      if (!rowObj) continue;
      for (let c = 0; c < clipboard.cols; c++) {
        const col = pasteAnchor.col + c;
        if (col < 0 || col >= state.cols) continue;
        S.setStitchAt(rowObj, col, cells[r][c]);
      }
    }
    pasteAnchor = null;
    KC.bus.emit("rangeSelectionChanged");
    KC.bus.emit("rowsChanged");
    KC.bus.emit("toast", "選択した範囲に貼り付けました");
  }

  function canUndo() {
    return !!lastSnapshot;
  }

  function undoLastPaste() {
    if (!lastSnapshot) return;
    const state = S.get();
    const map = new Map(lastSnapshot.map((s) => [s.uid, s]));
    state.rows.forEach((r) => {
      const snap = map.get(r.uid);
      if (snap) S.applyAll(r, snap);
    });
    lastSnapshot = null;
    KC.bus.emit("rangeSelectionChanged");
    KC.bus.emit("rowsChanged");
  }

  function statusText() {
    if (clipboard) {
      return pasteAnchor
        ? `コピー済み: ${clipboard.rows}×${clipboard.cols}／「貼り付け」を押してください`
        : `コピー済み: ${clipboard.rows}×${clipboard.cols}／貼り付け先の左上マスをタップ`;
    }
    if (corner1 && corner2)
      return "範囲を選択済み／「選択した範囲をコピー」を押してください";
    if (corner1) return "もう1点タップして範囲（右下）を選択";
    return "範囲の左上・右下(右上・左下)となる2つのマスをタップしてください";
  }

  function getOverlayGeometry() {
    const rects = [];
    if (corner1 && !clipboard) {
      const d1 = displayIndexForUid(corner1.rowUid);
      if (d1 != null) {
        if (corner2) {
          const d2 = displayIndexForUid(corner2.rowUid);
          if (d2 != null) {
            rects.push({
              kind: "selection",
              dTop: Math.min(d1, d2),
              dBottom: Math.max(d1, d2),
              cLeft: Math.min(corner1.col, corner2.col),
              cRight: Math.max(corner1.col, corner2.col),
            });
          }
        } else {
          rects.push({
            kind: "point",
            dTop: d1,
            dBottom: d1,
            cLeft: corner1.col,
            cRight: corner1.col,
          });
        }
      }
    }
    if (clipboard && pasteAnchor) {
      const dA = displayIndexForUid(pasteAnchor.rowUid);
      if (dA != null) {
        rects.push({
          kind: "paste-preview",
          dTop: dA,
          dBottom: dA + clipboard.rows - 1,
          cLeft: pasteAnchor.col,
          cRight: pasteAnchor.col + clipboard.cols - 1,
        });
      }
    }
    return rects;
  }

  KC.rangeSelect = {
    isActive,
    enter,
    exit,
    clearSelection,
    onCellTap,
    canCopy,
    copySelected,
    canPaste,
    pasteAtAnchor,
    canUndo,
    undoLastPaste,
    statusText,
    getOverlayGeometry,
  };
})(window.KC);
