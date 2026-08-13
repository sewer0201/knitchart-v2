/* ============================================================
   print-range-select.js
   「印刷する部分を設定」モード：range-select.js と同じく2点タップで
   左上・右下(右上・左下)を指定して矩形範囲を作る。ただし作った範囲は
   コピー用ではなく「印刷範囲」として state.printRanges に複数保存する。
   既存の印刷範囲を選び直す（編集する）こともできる。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let active = false;
  let corner1 = null; // { rowUid, col }
  let corner2 = null; // { rowUid, col }
  let editingUid = null; // 既存の印刷範囲を選び直している場合、その uid

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
  }

  function enter() {
    if (KC.selection && KC.selection.isActive()) KC.selection.exit();
    if (KC.rangeSelect && KC.rangeSelect.isActive()) KC.rangeSelect.exit();
    active = true;
    clearPoints();
    editingUid = null;
    KC.bus.emit("printRangeSelectionChanged");
  }
  function exit() {
    active = false;
    clearPoints();
    editingUid = null;
    KC.bus.emit("printRangeSelectionChanged");
  }

  function onCellTap(row, col) {
    if (!corner1) {
      corner1 = { rowUid: row.uid, col };
    } else if (!corner2) {
      corner2 = { rowUid: row.uid, col };
    } else {
      corner1 = { rowUid: row.uid, col };
      corner2 = null;
    }
    KC.bus.emit("printRangeSelectionChanged");
  }

  function canCommit() {
    return !!corner1 && !!corner2;
  }
  function hasPendingPoint() {
    return !!corner1;
  }
  function cancelPicking() {
    if (!corner1) return;
    clearPoints();
    KC.bus.emit("printRangeSelectionChanged");
  }

  function pendingBounds() {
    if (!canCommit()) return null;
    const state = S.get();
    const d1 = displayIndexForUid(corner1.rowUid);
    const d2 = displayIndexForUid(corner2.rowUid);
    if (d1 == null || d2 == null) return null;
    const dTop = Math.min(d1, d2),
      dBottom = Math.max(d1, d2);
    return {
      startRow: state.rows.length - dBottom,
      endRow: state.rows.length - dTop,
      startCol: Math.min(corner1.col, corner2.col),
      endCol: Math.max(corner1.col, corner2.col),
    };
  }
  function getPendingBounds() {
    return pendingBounds();
  }
  // 上下左右の数値入力・+/-ボタンから範囲を直接指定するための入口。
  // タップでの2点選択と同じ内部状態（corner1/corner2）に変換して扱うので、
  // そのままプレビュー表示や「追加/更新」ボタンに反映される。
  function setPendingBounds(bounds) {
    const state = S.get();
    const rowMax = Math.max(1, state.rows.length);
    const colMax = Math.max(0, state.cols - 1);
    const startRow = Math.max(
      1,
      Math.min(rowMax, Math.round(bounds.startRow)),
    );
    const endRow = Math.max(1, Math.min(rowMax, Math.round(bounds.endRow)));
    const startCol = Math.max(
      0,
      Math.min(colMax, Math.round(bounds.startCol)),
    );
    const endCol = Math.max(0, Math.min(colMax, Math.round(bounds.endCol)));
    const row1 = state.rows[startRow - 1];
    const row2 = state.rows[endRow - 1];
    if (!row1 || !row2) return;
    corner1 = { rowUid: row1.uid, col: startCol };
    corner2 = { rowUid: row2.uid, col: endCol };
    KC.bus.emit("printRangeSelectionChanged");
  }

  function isEditing() {
    return !!editingUid;
  }
  function getEditingUid() {
    return editingUid;
  }

  function commit() {
    const bounds = pendingBounds();
    if (!bounds) return;
    if (editingUid) {
      S.updatePrintRange(editingUid, bounds);
      editingUid = null;
      KC.bus.emit("toast", "印刷範囲を更新しました");
    } else {
      S.addPrintRange(bounds);
      KC.bus.emit("toast", "印刷範囲を追加しました");
    }
    clearPoints();
    KC.bus.emit("printRangeSelectionChanged");
  }

  function startEdit(uid) {
    if (!S.findPrintRange(uid)) return;
    editingUid = uid;
    clearPoints();
    KC.bus.emit("printRangeSelectionChanged");
  }
  function cancelEdit() {
    editingUid = null;
    clearPoints();
    KC.bus.emit("printRangeSelectionChanged");
  }
  function removeRange(uid) {
    S.removePrintRange(uid);
    if (editingUid === uid) editingUid = null;
    KC.bus.emit("printRangeSelectionChanged");
    KC.bus.emit("toast", "印刷範囲を削除しました");
  }
  function setRangeColor(uid, color) {
    S.updatePrintRange(uid, { dividerColor: color });
    KC.bus.emit("printRangeSelectionChanged");
  }

  function statusText() {
    if (editingUid) {
      if (corner1 && corner2)
        return "この内容で選び直しますか？「この範囲で更新」を押してください";
      if (corner1) return "もう1点タップして新しい範囲（右下）を選択";
      return "選び直したい範囲の角（左上・右下 または 右上・左下）を2か所タップしてください";
    }
    if (corner1 && corner2)
      return "この範囲を追加しますか？「この範囲を追加」を押してください";
    if (corner1) return "もう1点タップして範囲（右下）を選択";
    return "印刷したい範囲の角（左上・右下 または 右上・左下）を2か所タップしてください";
  }

  // 範囲(段番号・目インデックス基準)を、キャンバス描画用の displayIndex 基準に変換する
  function boundsToDisplayRect(pr) {
    const state = S.get();
    return {
      dTop: state.rows.length - pr.endRow,
      dBottom: state.rows.length - pr.startRow,
      cLeft: pr.startCol,
      cRight: pr.endCol,
    };
  }

  function getOverlayGeometry() {
    const rects = [];
    S.getPrintRanges().forEach((pr, i) => {
      if (pr.uid === editingUid) {
        // 選び直し中：元の範囲は薄い破線で目印として残しておく
        const r = boundsToDisplayRect(pr);
        rects.push(
          Object.assign(
            { kind: "print-range-original", index: i + 1, uid: pr.uid },
            r,
          ),
        );
        return;
      }
      const r = boundsToDisplayRect(pr);
      rects.push(
        Object.assign(
          { kind: "print-range", index: i + 1, uid: pr.uid },
          r,
        ),
      );
    });
    if (corner1) {
      const d1 = displayIndexForUid(corner1.rowUid);
      if (d1 != null) {
        if (corner2) {
          const d2 = displayIndexForUid(corner2.rowUid);
          if (d2 != null) {
            rects.push({
              kind: "print-range-pending",
              dTop: Math.min(d1, d2),
              dBottom: Math.max(d1, d2),
              cLeft: Math.min(corner1.col, corner2.col),
              cRight: Math.max(corner1.col, corner2.col),
            });
          }
        } else {
          rects.push({
            kind: "print-range-point",
            dTop: d1,
            dBottom: d1,
            cLeft: corner1.col,
            cRight: corner1.col,
          });
        }
      }
    }
    return rects;
  }

  KC.printRangeSelect = {
    isActive,
    enter,
    exit,
    onCellTap,
    canCommit,
    hasPendingPoint,
    cancelPicking,
    commit,
    getPendingBounds,
    setPendingBounds,
    isEditing,
    getEditingUid,
    startEdit,
    cancelEdit,
    removeRange,
    setRangeColor,
    statusText,
    getOverlayGeometry,
  };
})(window.KC);
