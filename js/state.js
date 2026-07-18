/* ============================================================
   state.js
   データモデル / state 定義 / 毛糸・行の CRUD・正規化ロジック
   （As-Is仕様書 1章 に対応。UIには一切依存しない純粋なロジック層）
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";

  const DEFAULT_BG_COLOR = "#F5F5F5"; // 地の色が未設定のときの表示色
  const DEFAULT_FG_COLOR = "#9B9B9B"; // 柄の色が未設定のときの表示色
  const REPEAT_MIN = 2;
  const SIZE_MIN = 1,
    SIZE_MAX = 300;

  let uidCounter = 1;
  function newUid(prefix) {
    return prefix + uidCounter++;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function normalizeOffset(offset, repeat) {
    return ((offset % repeat) + repeat) % repeat;
  }

  function makeRow(repeat, bg, fg, offset, maxRepeat) {
    const cap = Math.max(REPEAT_MIN, maxRepeat != null ? maxRepeat : 12);
    repeat = clamp(repeat || 12, REPEAT_MIN, cap);
    return {
      uid: newUid("r"),
      repeat: repeat,
      stitches: new Array(repeat).fill(false),
      bg: bg || null,
      fg: fg || null,
      offset: offset ? normalizeOffset(offset, repeat) : 0,
    };
  }

  function makeDefaultState() {
    const cols = 40;
    const rows = [];
    for (let i = 0; i < 40; i++) rows.push(makeRow(12, null, null, 0, cols));
    return { cols: cols, yarns: [], rows: rows };
  }

  let state = makeDefaultState();

  function getState() {
    return state;
  }
  function replaceState(next) {
    state = next;
  }

  /* ---------------- 毛糸 ---------------- */
  function findYarn(uid) {
    return state.yarns.find((y) => y.uid === uid);
  }
  function yarnColor(uid, role) {
    const y = findYarn(uid);
    if (y) return y.color;
    return role === "fg" ? DEFAULT_FG_COLOR : DEFAULT_BG_COLOR;
  }
  function sortedYarns() {
    return state.yarns
      .slice()
      .sort((a, b) =>
        a.id.localeCompare(b.id, "ja", { numeric: true, sensitivity: "base" }),
      );
  }
  function addYarn(id, color) {
    id = (id || "").trim();
    if (!id) return null;
    const yarn = { uid: newUid("y"), id, color: color || "#997E56" };
    state.yarns.push(yarn);
    return yarn;
  }
  function hasYarnId(id) {
    return state.yarns.some((y) => y.id === id);
  }
  function updateYarn(uid, id, color) {
    const y = findYarn(uid);
    if (!y) return;
    const trimmed = (id || "").trim();
    if (trimmed) y.id = trimmed;
    if (color) y.color = color;
  }
  function deleteYarn(uid) {
    state.yarns = state.yarns.filter((y) => y.uid !== uid);
    state.rows.forEach((r) => {
      if (r.bg === uid) r.bg = null;
      if (r.fg === uid) r.fg = null;
    });
  }

  /* ---------------- 行 ---------------- */
  function rowIndex(uid) {
    return state.rows.findIndex((r) => r.uid === uid);
  }
  function findRow(uid) {
    return state.rows.find((r) => r.uid === uid);
  }
  function toggleStitch(row, colIndex) {
    const idx = normalizeOffset(colIndex + row.offset, row.repeat);
    row.stitches[idx] = !row.stitches[idx];
  }
  function stitchAt(row, colIndex) {
    const idx = normalizeOffset(colIndex + row.offset, row.repeat);
    return row.stitches[idx];
  }
  function setStitchAt(row, colIndex, value) {
    const idx = normalizeOffset(colIndex + row.offset, row.repeat);
    row.stitches[idx] = !!value;
  }
  function setRowRepeat(row, n) {
    const cap = Math.max(REPEAT_MIN, state.cols);
    n = clamp(parseInt(n, 10) || row.repeat, REPEAT_MIN, cap);
    const newStitches = new Array(n).fill(false);
    for (let k = 0; k < Math.min(n, row.stitches.length); k++)
      newStitches[k] = row.stitches[k];
    row.repeat = n;
    row.stitches = newStitches;
    row.offset = normalizeOffset(row.offset, n);
  }
  // 現在タイル表示されている柄をそのままの見た目で確定させ、以後は
  // くり返しをせず全目数ぶんを個別に編集できる状態にする（柄はキープされる）。
  function isRepeatReleased(row) {
    return row.repeat >= state.cols;
  }
  function releaseRepeat(row) {
    const targetCols = state.cols;
    if (row.repeat >= targetCols) return; // 既に解除済み
    const newStitches = [];
    for (let c = 0; c < targetCols; c++) newStitches.push(stitchAt(row, c));
    row.stitches = newStitches;
    row.repeat = targetCols;
    row.offset = 0;
  }
  function addRowAtEnd() {
    return addRow("top");
  }
  // direction: "top"（大きい番号側＝配列の末尾）／"bottom"（小さい番号側＝配列の先頭）
  function addRow(direction) {
    const refRow =
      direction === "bottom"
        ? state.rows[0]
        : state.rows[state.rows.length - 1];
    const row = makeRow(
      refRow ? refRow.repeat : 12,
      refRow ? refRow.bg : null,
      refRow ? refRow.fg : null,
      0,
      state.cols,
    );
    if (direction === "bottom") state.rows.unshift(row);
    else state.rows.push(row);
    return row;
  }
  function removeRow(uid) {
    if (state.rows.length <= 1) return false;
    const idx = rowIndex(uid);
    if (idx < 0) return false;
    state.rows.splice(idx, 1);
    return true;
  }
  // direction: "top"（大きい番号側＝配列の末尾）／"bottom"（小さい番号側＝配列の先頭）
  // 「行を1つ削除」クイックボタン用（addRowと対になる、方向指定での末尾1行削除）
  function removeRowFromEnd(direction) {
    if (state.rows.length <= 1) return false;
    if (direction === "bottom") state.rows.shift();
    else state.rows.pop();
    return true;
  }
  // direction: "top"（大きい番号側から増減）／"bottom"（小さい番号側から増減）
  function applySize(targetRows, targetCols, direction) {
    direction = direction === "bottom" ? "bottom" : "top";
    targetRows = clamp(targetRows, SIZE_MIN, SIZE_MAX);
    targetCols = clamp(targetCols, SIZE_MIN, SIZE_MAX);
    while (state.rows.length < targetRows) {
      addRow(direction);
    }
    while (state.rows.length > targetRows) {
      if (direction === "bottom") state.rows.shift();
      else state.rows.pop();
    }
    state.cols = targetCols;
  }
  function addColumn() {
    state.cols = clamp(state.cols + 1, SIZE_MIN, SIZE_MAX);
  }
  function removeColumn() {
    state.cols = clamp(state.cols - 1, SIZE_MIN, SIZE_MAX);
  }

  /* ---------------- 行のコピー内容ヘルパ ---------------- */
  function snapshotRowContent(row) {
    return {
      repeat: row.repeat,
      stitches: row.stitches.slice(),
      offset: row.offset,
      bg: row.bg,
      fg: row.fg,
    };
  }
  function snapshotRowFull(row) {
    return Object.assign({ uid: row.uid }, snapshotRowContent(row));
  }
  function applyAll(row, content) {
    row.repeat = content.repeat;
    row.stitches = content.stitches.slice();
    row.offset = content.offset;
    row.bg = content.bg;
    row.fg = content.fg;
  }
  function applyColorsOnly(row, content) {
    row.bg = content.bg;
    row.fg = content.fg;
  }
  function applyPatternOnly(row, content) {
    row.repeat = content.repeat;
    row.stitches = content.stitches.slice();
    row.offset = content.offset;
  }

  /* ---------------- JSON 入出力用の正規化（後方互換） ---------------- */
  function buildExportData(formatVersion) {
    return {
      format: "knit-chart-project",
      version: formatVersion || 1,
      cols: state.cols,
      yarns: state.yarns,
      rows: state.rows,
    };
  }

  function loadFromData(data) {
    if (
      !data ||
      !Array.isArray(data.yarns) ||
      !Array.isArray(data.rows) ||
      typeof data.cols !== "number"
    ) {
      throw new Error("invalid shape");
    }
    const yarnUidMap = {};
    const newYarns = data.yarns.map((y) => {
      const uid = newUid("y");
      yarnUidMap[y.uid] = uid;
      return { uid, id: String(y.id), color: y.color || "#cccccc" };
    });
    const targetCols = clamp(data.cols, SIZE_MIN, SIZE_MAX);
    // くり返し目数の上限は編み図の列数（目数）とする
    const maxRepeat = Math.max(REPEAT_MIN, targetCols);
    const newRows = data.rows.map((r) => {
      const repeat = clamp(r.repeat || 12, REPEAT_MIN, maxRepeat);
      let stitches = Array.isArray(r.stitches)
        ? r.stitches.slice(0, repeat)
        : [];
      while (stitches.length < repeat) stitches.push(false);
      const rawOffset = typeof r.offset === "number" ? r.offset : 0;
      const offset = normalizeOffset(rawOffset, repeat);
      return {
        uid: newUid("r"),
        repeat,
        stitches,
        bg: r.bg && yarnUidMap[r.bg] ? yarnUidMap[r.bg] : null,
        fg: r.fg && yarnUidMap[r.fg] ? yarnUidMap[r.fg] : null,
        offset,
      };
    });
    const next = {
      cols: targetCols,
      yarns: newYarns,
      rows: newRows.length ? newRows : [makeRow(12, null, null, 0, targetCols)],
    };
    replaceState(next);
  }

  KC.state = {
    DEFAULT_BG_COLOR,
    DEFAULT_FG_COLOR,
    REPEAT_MIN,
    repeatMax: () => Math.max(REPEAT_MIN, state.cols),
    SIZE_MIN,
    SIZE_MAX,
    clamp,
    normalizeOffset,
    newUid,
    makeRow,
    get: getState,
    replace: replaceState,
    reset: () => replaceState(makeDefaultState()),
    findYarn,
    yarnColor,
    sortedYarns,
    addYarn,
    hasYarnId,
    updateYarn,
    deleteYarn,
    rowIndex,
    findRow,
    toggleStitch,
    stitchAt,
    setStitchAt,
    setRowRepeat,
    isRepeatReleased,
    releaseRepeat,
    addRowAtEnd,
    addRow,
    removeRow,
    removeRowFromEnd,
    applySize,
    addColumn,
    removeColumn,
    snapshotRowContent,
    snapshotRowFull,
    applyAll,
    applyColorsOnly,
    applyPatternOnly,
    buildExportData,
    loadFromData,
  };
})(window.KC);
