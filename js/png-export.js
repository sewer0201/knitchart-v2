/* ============================================================
   png-export.js
   PNG書き出し（A4縦、150dpi相当）。UIから独立した純粋関数。
   レイアウト・グルーピングロジックは As-Is仕様書 3.6 を完全踏襲。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  // state を受け取り、書き出し用の Canvas を返す（副作用なし＝テストしやすい）
  function renderToCanvas(state, projectName) {
    const W = 1240,
      H = 1754; // A4縦 約150dpi
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#161615";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(projectName, W / 2, 60);

    // 毛糸凡例
    const legendTop = 120;
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    let lx = 60,
      ly = legendTop,
      lineH = 30;
    const maxLegendWidth = W - 120;
    state.yarns.forEach((y) => {
      const label = `${y.id}`;
      const textW = ctx.measureText(label).width;
      const chunkW = 26 + textW + 26;
      if (lx + chunkW > 60 + maxLegendWidth) {
        lx = 60;
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
    const legendBottom = ly + lineH;

    const rows = state.rows.length,
      cols = state.cols;

    const displayRows = [];
    for (let i = rows - 1; i >= 0; i--) {
      displayRows.push({ row: state.rows[i], rowNumber: i + 1 });
    }

    function yarnLabel(uid) {
      const y = S.findYarn(uid);
      return y ? y.id : "－";
    }

    const LABEL_FONT = "13px sans-serif";
    const groups = [];
    displayRows.forEach((dr, displayIndex) => {
      const key = (dr.row.bg || "none") + "|" + (dr.row.fg || "none");
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.end = displayIndex;
        last.count++;
      } else {
        groups.push({ key, start: displayIndex, end: displayIndex, count: 1, row: dr.row });
      }
    });
    ctx.font = LABEL_FONT;
    groups.forEach((g) => {
      const baseLabel = `地:${yarnLabel(g.row.bg)}　柄:${yarnLabel(g.row.fg)}`;
      g.label = g.count > 1 ? `${baseLabel}（${g.count}段）` : baseLabel;
    });
    let maxLabelWidth = 0;
    groups.forEach((g) => {
      const w = ctx.measureText(g.label).width;
      if (w > maxLabelWidth) maxLabelWidth = w;
    });

    const marginTop = legendBottom + 30;
    const marginBottom = 60;
    const marginLeft = 90;
    const bracketSpace = 22;
    const marginRight = Math.ceil(maxLabelWidth) + bracketSpace + 30;
    const availW = W - marginLeft - marginRight;
    const availH = H - marginTop - marginBottom;
    const cell = Math.max(2, Math.floor(Math.min(availW / cols, availH / rows)));
    const gridW = cell * cols,
      gridH = cell * rows;
    const offsetX = marginLeft + (availW - gridW) / 2;
    const offsetY = marginTop;

    displayRows.forEach((dr, displayRowIndex) => {
      const row = dr.row;
      const rowNumber = dr.rowNumber;
      const y = offsetY + displayRowIndex * cell;
      for (let c = 0; c < cols; c++) {
        const on = S.stitchAt(row, c);
        const color = on ? S.yarnColor(row.fg, "fg") : S.yarnColor(row.bg, "bg");
        const x = offsetX + c * cell;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell, cell);
      }
      if (cell >= 10) {
        ctx.fillStyle = "#6C6C68";
        ctx.font = `${Math.min(14, cell)}px sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText(String(rowNumber), offsetX - 10, y + cell / 2 + 4);
      }
    });

    ctx.strokeStyle = "#161615";
    ctx.lineWidth = 2;
    groups.forEach((g, gi) => {
      if (gi === 0) return;
      const yBoundary = offsetY + g.start * cell;
      ctx.beginPath();
      ctx.moveTo(offsetX, yBoundary);
      ctx.lineTo(offsetX + gridW, yBoundary);
      ctx.stroke();
    });

    ctx.strokeStyle = "#161615";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, gridW, gridH);

    ctx.font = LABEL_FONT;
    ctx.textAlign = "left";
    const bracketX = offsetX + gridW + 8;
    const textX = bracketX + bracketSpace;
    groups.forEach((g) => {
      const yTop = offsetY + g.start * cell;
      const yBottom = offsetY + (g.end + 1) * cell;
      const yMid = (yTop + yBottom) / 2;
      if (g.count > 1) {
        ctx.strokeStyle = "#6C6C68";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bracketX, yTop + 2);
        ctx.lineTo(bracketX + 8, yTop + 2);
        ctx.lineTo(bracketX + 8, yBottom - 2);
        ctx.lineTo(bracketX, yBottom - 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#161615";
      ctx.fillText(g.label, textX, yMid + 4);
    });

    return canvas;
  }

  function download(state, projectName) {
    const canvas = renderToCanvas(state, projectName);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = projectName + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  KC.pngExport = { renderToCanvas, download };
})(window.KC);
