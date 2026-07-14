/* ============================================================
   selection.js
   複数行選択（選択モード）／コピー・貼り付け／1段undo
   （As-Is仕様書 3.5、v2要件定義書 3.4 に対応）
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let active = false; // 選択モード中か
  let selectedUids = new Set();
  let multiClipboard = null; // { count, rows: [contentSnapshot, ...] }  (画面表示順=上から下)
  let lastSnapshot = null; // 直前の貼り付け操作前の全行スナップショット（1段のみ）

  function isActive() {
    return active;
  }
  function enter() {
    active = true;
    selectedUids.clear();
    KC.bus.emit("selectionChanged");
  }
  function exit() {
    active = false;
    selectedUids.clear();
    KC.bus.emit("selectionChanged");
  }
  function isSelected(uid) {
    return selectedUids.has(uid);
  }
  function toggle(uid) {
    if (selectedUids.has(uid)) selectedUids.delete(uid);
    else selectedUids.add(uid);
    KC.bus.emit("selectionChanged");
  }
  function clearChecks() {
    selectedUids.clear();
    KC.bus.emit("selectionChanged");
  }
  function count() {
    return selectedUids.size;
  }
  function cleanupMissing() {
    const state = S.get();
    const existing = new Set(state.rows.map((r) => r.uid));
    selectedUids.forEach((uid) => {
      if (!existing.has(uid)) selectedUids.delete(uid);
    });
  }

  function copySelected() {
    const state = S.get();
    cleanupMissing();
    // 画面表示順（行番号が大きい方が上）でコピーする
    const selectedRows = state.rows.filter((r) => selectedUids.has(r.uid)).reverse();
    if (selectedRows.length === 0) return;
    multiClipboard = {
      count: selectedRows.length,
      rows: selectedRows.map((r) => S.snapshotRowContent(r)),
    };
    selectedUids.clear();
    KC.bus.emit("selectionChanged");
  }

  function canPaste() {
    return !!multiClipboard && selectedUids.size >= 1;
  }

  function applyByKind(row, content, kind) {
    if (kind === "colors") S.applyColorsOnly(row, content);
    else if (kind === "pattern") S.applyPatternOnly(row, content);
    else S.applyAll(row, content);
  }

  // kind: "all"（既定）／"colors"（色だけ）／"pattern"（柄だけ）
  // flip: true にすると、コピーした行の並びを上下反転してから貼り付ける
  function pasteFromSelected(kind, flip) {
    kind = kind || "all";
    if (!canPaste()) return;
    const state = S.get();
    cleanupMissing();
    // 画面表示順（上から下）で選択行を並べる
    const selectedRows = state.rows.filter((r) => selectedUids.has(r.uid)).reverse();
    if (selectedRows.length === 0) return;
    saveUndoSnapshot();

    const clipRows = flip ? multiClipboard.rows.slice().reverse() : multiClipboard.rows;

    if (selectedRows.length === 1) {
      // 選択が1行のときは、その行を起点として画面の下方向へ
      // コピーした行数ぶん連続で貼り付ける（従来どおりの「起点貼り付け」）
      const targetIndex = S.rowIndex(selectedRows[0].uid);
      for (let k = 0; k < multiClipboard.count; k++) {
        const destIndex = targetIndex - k;
        if (destIndex < 0) break;
        applyByKind(state.rows[destIndex], clipRows[k], kind);
      }
    } else {
      // 選択が2行以上のときは、選択した行数ぶんに合わせて
      // コピー内容を先頭から繰り返し当てはめる
      // 例）Aを1行コピー→3行選択で貼り付け = AAA
      //     ABCDを4行コピー→6行選択で貼り付け = ABCDAB
      selectedRows.forEach((row, i) => {
        const content = clipRows[i % multiClipboard.count];
        applyByKind(row, content, kind);
      });
    }

    selectedUids.clear();
    KC.bus.emit("selectionChanged");
    KC.bus.emit("rowsChanged");
  }

  function saveUndoSnapshot() {
    const state = S.get();
    lastSnapshot = state.rows.map(S.snapshotRowFull);
    KC.bus.emit("selectionChanged");
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
      if (!snap) return;
      S.applyAll(r, snap);
    });
    lastSnapshot = null;
    KC.bus.emit("selectionChanged");
    KC.bus.emit("rowsChanged");
  }

  function clipboardCount() {
    return multiClipboard ? multiClipboard.count : 0;
  }

  KC.selection = {
    isActive,
    enter,
    exit,
    isSelected,
    toggle,
    clearChecks,
    count,
    cleanupMissing,
    copySelected,
    canPaste,
    pasteFromSelected,
    saveUndoSnapshot,
    canUndo,
    undoLastPaste,
    clipboardCount,
  };
})(window.KC);
