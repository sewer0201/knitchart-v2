/* ============================================================
   png-export.js
   印刷範囲（KC.state.printRanges の1件）ごとに印刷用PNG画像(A4縦)を作る。
   UIから独立した純粋関数。

   1段につき1行、左から
     [編み図(セクションの区切り線付き)] 段数 セクションの範囲(縦につながった括弧)
     地の色/柄の色 (セクション内の下から何段目/セクションが何段続くか)
   の順で表示する。編み図の上下には目番号（5の倍数だけ濃い色）、右側には
   段番号（同じく5の倍数だけ濃い色）を表示する。目番号は編み図タブと同じく
   右から左に大きくなる。セクションの区切り線（右側の括弧＋編み図内の横線）の
   色は印刷範囲ごとに設定できる(printRange.dividerColor)。

   A4縦（1240×1754相当）に収まるようセルサイズを自動計算するが、目数・段数が
   多すぎて数字が小さくなりすぎる場合は warning 文字列を添えて返す。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  const NUMBER_COLOR_NORMAL = "#a1a1a1";
  const NUMBER_COLOR_FIVE = "#6C6C68";
  const BRACKET_COLOR = "#d8d8d3"; // セクション範囲線は目番号のグレーよりさらに薄く
  const DEFAULT_DIVIDER_COLOR = "#161615";
  const PRINT_W = 1240; // A4縦 相当（150dpi換算）
  const PRINT_H = 1754;
  const COMFORTABLE_CELL = 10; // これより小さいと数字が読み取りづらくなる目安

  function numberColor(n) {
    return n % 5 === 0 ? NUMBER_COLOR_FIVE : NUMBER_COLOR_NORMAL;
  }
  function numberFont(n, sizePx, family) {
    const weight = n % 5 === 0 ? "bold " : "";
    return `${weight}${sizePx}px ${family || "sans-serif"}`;
  }
  function yarnLabel(uid) {
    const y = S.findYarn(uid);
    return y ? y.id : "－";
  }
  // 目番号は右から左に大きくなる（編み図タブと同じ向き）
  function displayColNumber(cols, c) {
    return cols - c;
  }

  // 編み図全体（印刷範囲でクロップする前）を対象に、各段番号ごとの
  // 「同じ地・柄の組み合わせのセクション」情報を求める。
  // セクションは編み図全体の構造なので、印刷範囲で一部だけ切り出しても
  // 「セクションが何段続くか」は全体基準のまま変わらない。
  function computeGlobalRowMeta(state) {
    const total = state.rows.length;
    const displayAll = [];
    for (let i = total - 1; i >= 0; i--) {
      displayAll.push({ row: state.rows[i], rowNumber: i + 1 });
    }
    const groups = [];
    displayAll.forEach((dr, displayIndex) => {
      const key = (dr.row.bg || "none") + "|" + (dr.row.fg || "none");
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.end = displayIndex;
        last.count++;
      } else {
        groups.push({ key, start: displayIndex, end: displayIndex, count: 1 });
      }
    });
    const meta = new Map();
    groups.forEach((g) => {
      for (let di = g.start; di <= g.end; di++) {
        const dr = displayAll[di];
        meta.set(dr.rowNumber, {
          count: g.count,
          posFromBottom: g.end - di + 1,
          isSectionTop: di === g.start,
          isSectionBottom: di === g.end,
          isSectionSingle: g.count === 1,
        });
      }
    });
    return meta;
  }

  function clampPrintRange(state, pr) {
    const rowMax = Math.max(1, state.rows.length);
    const colMax = Math.max(0, state.cols - 1);
    let startRow = S.clamp(pr.startRow, 1, rowMax);
    let endRow = S.clamp(pr.endRow, 1, rowMax);
    if (startRow > endRow) {
      const t = startRow;
      startRow = endRow;
      endRow = t;
    }
    let startCol = S.clamp(pr.startCol, 0, colMax);
    let endCol = S.clamp(pr.endCol, 0, colMax);
    if (startCol > endCol) {
      const t = startCol;
      startCol = endCol;
      endCol = t;
    }
    return { startRow, endRow, startCol, endCol };
  }

  // 凡例が何行に折り返されるかを、実際の描画と同じ幅計算で先に求めておく
  function measureLegendLines(ctx, yarns, maxLegendWidth) {
    ctx.font = "16px sans-serif";
    let lx = 0,
      lines = 1;
    yarns.forEach((y) => {
      const textW = ctx.measureText(y.id).width;
      const chunkW = 26 + textW + 26;
      if (lx + chunkW > maxLegendWidth) {
        lx = 0;
        lines++;
      }
      lx += chunkW;
    });
    return lines;
  }

  // state・印刷範囲(printRange)・タイトル文字列 を受け取り、
  // { canvas, warning, cell } を返す（副作用なし＝テストしやすい）
  function renderRangeToCanvas(state, printRange, title) {
    const pr = clampPrintRange(state, printRange);
    const dividerColor = printRange.dividerColor || DEFAULT_DIVIDER_COLOR;
    const rowMeta = computeGlobalRowMeta(state);

    const displayRows = [];
    for (let rn = pr.endRow; rn >= pr.startRow; rn--) {
      const row = state.rows[rn - 1];
      if (row) displayRows.push({ row, rowNumber: rn });
    }
    if (displayRows.length === 0) {
      const empty = document.createElement("canvas");
      empty.width = 400;
      empty.height = 200;
      const ectx = empty.getContext("2d");
      ectx.fillStyle = "#ffffff";
      ectx.fillRect(0, 0, empty.width, empty.height);
      ectx.fillStyle = "#161615";
      ectx.font = "16px sans-serif";
      ectx.textAlign = "center";
      ectx.fillText("表示できる段がありません", 200, 100);
      return { canvas: empty, warning: null, cell: 0 };
    }
    const colsInRange = pr.endCol - pr.startCol + 1;
    const rowsInRange = displayRows.length;
    const LABEL_FONT = "13px sans-serif";
    const LABEL_SEP = "　";

    // 右側3列（段番号・セクションの範囲(括弧)・地/柄+段数）の幅を先に測っておく
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d");
    mctx.font = LABEL_FONT;
    const rowNumColW =
      Math.ceil(mctx.measureText(String(state.rows.length)).width) + 2;
    const BRACKET_COL_W = 22;
    const sepW = mctx.measureText(LABEL_SEP).width;
    let maxColorOnlyWidth = 0;
    let maxCountOnlyWidth = 0;
    const rowLabels = displayRows.map((dr) => {
      const m = rowMeta.get(dr.rowNumber);
      const colorLabel = `${yarnLabel(dr.row.bg)}/${yarnLabel(dr.row.fg)}`;
      const countLabel = m ? `(${m.posFromBottom}/${m.count})` : "(1/1)";
      const colorLabelW = mctx.measureText(colorLabel).width;
      const countLabelW = mctx.measureText(countLabel).width;
      if (colorLabelW > maxColorOnlyWidth) maxColorOnlyWidth = colorLabelW;
      if (countLabelW > maxCountOnlyWidth) maxCountOnlyWidth = countLabelW;
      return { rowNumber: dr.rowNumber, colorLabel, countLabel };
    });
    // 「(◯/◯)」の左端をどの段でも揃えるため、色ラベルの最大幅を基準に
    // 固定の開始位置を使う（段ごとに色ラベルの長さが違っても位置がずれない）
    const countLabelOffsetX = maxColorOnlyWidth + sepW;
    const maxColorLabelWidth = countLabelOffsetX + maxCountOnlyWidth;

    // 毛糸凡例（この印刷範囲に登場する毛糸のみ）
    const usedYarnUids = new Set();
    displayRows.forEach((dr) => {
      if (dr.row.bg) usedYarnUids.add(dr.row.bg);
      if (dr.row.fg) usedYarnUids.add(dr.row.fg);
    });
    const legendYarns = state.yarns.filter((y) => usedYarnUids.has(y.uid));

    const marginLeft = 70;
    const gapA = 6,
      gapB = 10,
      gapC = 10,
      endPad = 20;
    const marginRight =
      gapA + rowNumColW + gapB + BRACKET_COL_W + gapC +
      Math.ceil(maxColorLabelWidth) + endPad;

    const titleH = 50;
    const colHeaderH = 26;
    const colFooterH = 26;
    const marginBottom = 40;
    const legendLines = legendYarns.length
      ? measureLegendLines(mctx, legendYarns, PRINT_W - 140)
      : 0;
    const legendH = legendYarns.length ? legendLines * 30 + 10 : 0;
    const marginTop = 30 + titleH + legendH + 20;

    const availW = Math.max(1, PRINT_W - marginLeft - marginRight);
    const availH = Math.max(
      1,
      PRINT_H - marginTop - colHeaderH - colFooterH - marginBottom,
    );
    const cell = Math.max(
      1,
      Math.min(
        Math.floor(availW / colsInRange),
        Math.floor(availH / rowsInRange),
      ),
    );

    let warning = null;
    if (cell < COMFORTABLE_CELL) {
      const maxColsAtComfortable = Math.max(
        1,
        Math.floor(availW / COMFORTABLE_CELL),
      );
      const maxRowsAtComfortable = Math.max(
        1,
        Math.floor(availH / COMFORTABLE_CELL),
      );
      warning = `この範囲は目数${colsInRange}・段数${rowsInRange}に対してA4サイズでは1マスが約${cell}pxまで縮小され、段番号・目番号などの文字が読み取りづらくなる可能性があります。A4に収めるなら目安として目数${maxColsAtComfortable}以内・段数${maxRowsAtComfortable}以内に分割することをおすすめします。`;
    }

    const gridW = cell * colsInRange;
    const gridH = cell * rowsInRange;

    const canvas = document.createElement("canvas");
    canvas.width = PRINT_W;
    canvas.height = PRINT_H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PRINT_W, PRINT_H);

    ctx.fillStyle = "#161615";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title || "", PRINT_W / 2, 45);

    // 毛糸凡例
    if (legendYarns.length > 0) {
      ctx.font = "16px sans-serif";
      ctx.textAlign = "left";
      let lx = 70,
        ly = 30 + titleH + 24;
      const lineH = 30;
      const maxLegendWidth = PRINT_W - 140;
      legendYarns.forEach((y) => {
        const label = `${y.id}`;
        const textW = ctx.measureText(label).width;
        const chunkW = 26 + textW + 26;
        if (lx + chunkW > 70 + maxLegendWidth) {
          lx = 70;
          ly += lineH;
        }
        ctx.fillStyle = y.color;
        ctx.fillRect(lx, ly - 14, 20, 20);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.strokeRect(lx, ly - 14, 20, 20);
        ctx.fillStyle = "#161615";
        ctx.fillText(label, lx + 26, ly + 2);
        lx += chunkW;
      });
    }

    const offsetX = marginLeft + (availW - gridW) / 2;
    const offsetYTop = marginTop + colHeaderH;
    const offsetYBottom = offsetYTop + gridH;

    // 目番号（上）5の倍数だけ濃い色、それ以外はグレー。右から左に大きくなる
    if (cell >= COMFORTABLE_CELL) {
      ctx.textAlign = "center";
      for (let c = pr.startCol; c <= pr.endCol; c++) {
        const colNumber = displayColNumber(state.cols, c);
        ctx.fillStyle = numberColor(colNumber);
        ctx.font = numberFont(colNumber, Math.min(14, cell));
        const x = offsetX + (c - pr.startCol) * cell + cell / 2;
        ctx.fillText(String(colNumber), x, offsetYTop - 10);
      }
    }

    // セル本体
    displayRows.forEach((dr, di) => {
      const row = dr.row;
      const y = offsetYTop + di * cell;
      for (let c = pr.startCol; c <= pr.endCol; c++) {
        const on = S.stitchAt(row, c);
        const color = on
          ? S.yarnColor(row.fg, "fg")
          : S.yarnColor(row.bg, "bg");
        const x = offsetX + (c - pr.startCol) * cell;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell, cell);
      }
    });

    // セクション区切り線（編み図内。全体基準のセクション境界のうち、
    // この範囲内に見えている位置。色は印刷範囲ごとに設定できる）
    ctx.strokeStyle = dividerColor;
    ctx.lineWidth = 2;
    displayRows.forEach((dr, di) => {
      if (di === 0) return; // 画像の一番上は外枠と重なるので省略
      const m = rowMeta.get(dr.rowNumber);
      if (m && m.isSectionTop) {
        const yBoundary = offsetYTop + di * cell;
        ctx.beginPath();
        ctx.moveTo(offsetX, yBoundary);
        ctx.lineTo(offsetX + gridW, yBoundary);
        ctx.stroke();
      }
    });

    // 目番号（下）
    if (cell >= COMFORTABLE_CELL) {
      ctx.textAlign = "center";
      for (let c = pr.startCol; c <= pr.endCol; c++) {
        const colNumber = displayColNumber(state.cols, c);
        ctx.fillStyle = numberColor(colNumber);
        ctx.font = numberFont(colNumber, Math.min(14, cell));
        const x = offsetX + (c - pr.startCol) * cell + cell / 2;
        ctx.fillText(String(colNumber), x, offsetYBottom + colFooterH - 6);
      }
    }

    // 外枠（区切り線とは別に、常に濃いグレーで固定）
    ctx.strokeStyle = "#161615";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetYTop, gridW, gridH);

    // ---- 右側：段番号列 / セクションの範囲（縦につながった括弧）列 / 地・柄+段数列 ----
    const rowNumColX0 = offsetX + gridW + gapA;
    const bracketColX0 = rowNumColX0 + rowNumColW + gapB;
    const bracketX = bracketColX0 + BRACKET_COL_W - 4;
    const tickLen = BRACKET_COL_W - 8;
    const colorColX0 = bracketColX0 + BRACKET_COL_W + gapC;

    // 段番号（5の倍数だけ濃い色、それ以外はグレー。目番号と同じルール）
    // 列の横幅を詰めてグリッドとの間の余白を減らしつつ、右寄せのまま表示する
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    rowLabels.forEach((lbl, di) => {
      const y = offsetYTop + di * cell + cell / 2;
      ctx.fillStyle = numberColor(lbl.rowNumber);
      ctx.font = numberFont(lbl.rowNumber, Math.min(13, Math.max(9, cell * 0.5)));
      ctx.fillText(String(lbl.rowNumber), rowNumColX0 + rowNumColW, y);
    });

    // セクションの範囲：以前の表示のように、括弧が縦に自然につながった形にする
    // （セクションが複数段続く場合は1本の縦線＋上下の短い横線、1段だけの場合は短い横線）。
    // 隣り合うセクション同士の線がくっついて見えないよう、上下に少し余白を空ける。
    // 色は段番号のグレー（5の倍数以外）と揃える（編み図内の区切り線の色とは独立）
    const visibleSections = [];
    displayRows.forEach((dr, di) => {
      const key = (dr.row.bg || "none") + "|" + (dr.row.fg || "none");
      const last = visibleSections[visibleSections.length - 1];
      if (last && last.key === key) {
        last.endDi = di;
      } else {
        visibleSections.push({ key, startDi: di, endDi: di });
      }
    });
    const bracketGap = Math.max(1, Math.min(6, cell * 0.15));
    ctx.strokeStyle = BRACKET_COLOR;
    ctx.lineWidth = 2;
    visibleSections.forEach((sec) => {
      const topMeta = rowMeta.get(displayRows[sec.startDi].rowNumber);
      const bottomMeta = rowMeta.get(displayRows[sec.endDi].rowNumber);
      const yTopRaw = offsetYTop + sec.startDi * cell;
      const yBottomRaw = offsetYTop + (sec.endDi + 1) * cell;
      if (sec.endDi === sec.startDi) {
        const yMid = (yTopRaw + yBottomRaw) / 2;
        ctx.beginPath();
        ctx.moveTo(bracketX - tickLen, yMid);
        ctx.lineTo(bracketX, yMid);
        ctx.stroke();
        return;
      }
      const yTop = yTopRaw + bracketGap;
      const yBottom = yBottomRaw - bracketGap;
      if (yBottom <= yTop) {
        // セルが小さすぎて余白が取れない場合は縦線を省略し、印だけ残す
        const yMid = (yTopRaw + yBottomRaw) / 2;
        ctx.beginPath();
        ctx.moveTo(bracketX - tickLen, yMid);
        ctx.lineTo(bracketX, yMid);
        ctx.stroke();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(bracketX, yTop);
      ctx.lineTo(bracketX, yBottom);
      ctx.stroke();
      if (topMeta && topMeta.isSectionTop) {
        ctx.beginPath();
        ctx.moveTo(bracketX - tickLen, yTop);
        ctx.lineTo(bracketX, yTop);
        ctx.stroke();
      }
      if (bottomMeta && bottomMeta.isSectionBottom) {
        ctx.beginPath();
        ctx.moveTo(bracketX - tickLen, yBottom);
        ctx.lineTo(bracketX, yBottom);
        ctx.stroke();
      }
    });

    // 地の色/柄の色 (セクション内の下から何段目/セクションが何段続くか)
    // 色の組み合わせ自体は通常の文字色、(◯/◯)の部分はグレーにして
    // セクションの範囲線・目番号の非5の倍数と同じトーンに揃える。
    // 「(◯/◯)」は段ごとに色ラベルの長さが違っても左端が揃うよう固定位置に描く
    ctx.font = LABEL_FONT;
    ctx.textAlign = "left";
    rowLabels.forEach((lbl, di) => {
      const y = offsetYTop + di * cell + cell / 2;
      ctx.fillStyle = "#161615";
      ctx.fillText(lbl.colorLabel, colorColX0, y);
      ctx.fillStyle = NUMBER_COLOR_NORMAL;
      ctx.fillText(lbl.countLabel, colorColX0 + countLabelOffsetX, y);
    });

    return { canvas, warning, cell };
  }

  function rangeTitle(projectName, state, pr, index) {
    const colLow = displayColNumber(state.cols, pr.endCol);
    const colHigh = displayColNumber(state.cols, pr.startCol);
    return `${projectName}　${pr.startRow}〜${pr.endRow}段・${colLow}〜${colHigh}目（範囲${index}）`;
  }

  function rangeSummary(state, pr, index) {
    const colLow = displayColNumber(state.cols, pr.endCol);
    const colHigh = displayColNumber(state.cols, pr.startCol);
    return `${index}：${pr.startRow}〜${pr.endRow}段・${colLow}〜${colHigh}目`;
  }

  function downloadCanvas(canvas, filename) {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  KC.pngExport = {
    renderRangeToCanvas,
    rangeTitle,
    rangeSummary,
    displayColNumber,
    downloadCanvas,
    computeGlobalRowMeta,
  };
})(window.KC);
