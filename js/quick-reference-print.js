/* ============================================================
   quick-reference-print.js
   KC.quickReference.buildGroups() の結果をA5サイズのPNG画像として描画する。
   段数が多くA5 1枚に収まらない場合は複数ページ(複数Canvas)に自動分割する。

   レイアウトを構成する数値はすべて名前付きの定数にし、それぞれ「どの余白/
   サイズを表しているか」をコメントしてある。PC環境で実際に生成→見た目確認→
   数値を書き換えて再生成、を繰り返して調整しやすくすることを意図している。

   列は横幅を3等分し、左から
     ブラケット+トレイリング列(右寄せ) | 段番号列(左寄せ、多い場合は自動で折り返し) | 毛糸列(左寄せ)
   とする。段番号が多くて毛糸列が押し出されて見えなくなる問題を避けるため。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  // ---- 用紙サイズ ----
  // A4版(png-export.js)と同じ縮尺(150dpi相当 = 1mmあたり約5.905px)にそろえてある。
  // A5はA4を半分に折ったサイズ(148mm×210mm)なので、A5の長辺(210mm)はA4の短辺と
  // 一致する＝A5の高さはA4の幅(1240)と同じ値になる。
  const PAGE_W = 874; // 用紙の幅(px) = 148mm × 5.905px/mm
  const PAGE_H = 1240; // 用紙の高さ(px) = 210mm × 5.905px/mm

  // ---- ページ全体の余白 ----
  const MARGIN_LEFT = 60; // ページ左端 〜 表の左端(ブラケット列の左端)までの余白
  const MARGIN_RIGHT = 60; // ページ右端 〜 表の右端(毛糸列の右端)までの余白
  const MARGIN_TOP = 50; // ページ上端 〜 編み図名(タイトル)までの余白
  const MARGIN_BOTTOM = 44; // ページ下端 〜 表の最終行(またはページ番号)までの余白

  // ---- タイトル(編み図名) ----
  // 「大きすぎない文字で左上に」という指定のため、控えめなサイズ・色にしてある
  const TITLE_FONT_SIZE = 15; // 編み図名の文字サイズ
  const TITLE_COLOR = "#8a8a86"; // 編み図名の文字色(本文より薄いグレー)
  const TITLE_GAP_BELOW = 30; // 編み図名の下端 〜 表の1行目までの余白

  // ---- 表の行 ----
  const ROW_FONT_SIZE = 14; // 表内の文字(ブラケット・トレイリング・段番号・毛糸番号)のサイズ
  const ROW_TEXT_COLOR = "#161615"; // 表内の文字色
  const ROW_HEIGHT = 26; // 表の1行分の高さ(行の中心間隔の基本値。段番号が折り返さない場合の高さ)
  const ROW_NUM_WRAP_LINE_HEIGHT = 23; // 段番号が2行目以降に折り返した場合の、1行あたりの追加の高さ
  const GROUP_DIVIDER_EXTRA_GAP = 8; // 毛糸の組み合わせが変わる行の直前に足す追加の余白
  const ROW_NUM_SEPARATOR = "   "; // 段番号同士の間隔。半角スペース2個分
  const DIVIDER_COLOR = "#d8d3c4"; // 区切り線(横線)・縦線(列の境界線)の共通の色
  const DIVIDER_LINE_WIDTH = 0.75; // 区切り線・縦線の太さ

  // ---- 列の幅・余白 ----
  // 左右の列は内容に必要な最小幅だけ確保し、残りを段番号列に割り当てる。
  const COL_GAP_DIVIDER_TO_BRACKET = 10; // 縦線〜ブラケット列の内容右端までの余白
  const COL_GAP_DIVIDER_TO_ROWNUM = 10; // 縦線〜段番号列の内容左端までの余白
  const COL_GAP_ROWNUM_TO_YARN = 12; // 段番号列の右端〜毛糸列の内容左端までの余白
  const COL_ROWNUM_RIGHT_PADDING = 6; // 段番号列の右端に残す余白

  const COL_BRACKET_LEFT_PADDING = 4; // ブラケット列の内容左端に残す余白
  const COL_YARN_RIGHT_PADDING = 4; // 毛糸列の内容右端に残す余白
  const COL_ROWNUM_MIN_WIDTH = 20; // 段番号列が確保する最低幅

  // ---- ブラケットの下線マーク（"["を90度左に回転させたような形。
  //      括弧の文字は使わず、数字の下にこの下線を引くことで表す） ----
  const BRACKET_TOKEN_GAP = 12; // ブラケット内の数字と数字の間の余白
  const BRACKET_UNDERLINE_GAP = 6; // ブラケット数字の下端 〜 下線までの余白
  const BRACKET_UNDERLINE_OVERHANG = 4; // 下線を数字の左右の実際の幅より少し長く伸ばす分
  const BRACKET_UNDERLINE_TICK_H = 5; // 下線の両端に立てる短い縦線(ひげ)の高さ
  const BRACKET_UNDERLINE_WIDTH = 1.25; // 下線・ひげの太さ
  const BRACKET_TRAILING_GAP = 12; // ブラケット部分(下線あり) 〜 トレイリング数値までの余白

  // ---- ページ番号(複数ページの場合のみ表示) ----
  const PAGE_NUMBER_FONT_SIZE = 11; // ページ番号の文字サイズ
  const PAGE_NUMBER_COLOR = "#a1a1a1"; // ページ番号の文字色
  const PAGE_NUMBER_MARGIN_BOTTOM = 20; // ページ番号のページ下端からの余白

  const CIRCLED_DIGITS = "⓪①②③④⑤⑥⑦⑧⑨";
  function circled(n) {
    return n >= 0 && n <= 9 ? CIRCLED_DIGITS[n] : `(${n})`;
  }

  // ブラケットのrun配列から、描画用のトークン列を作る
  // （数字と、柄runには丸数字を使うかどうかのフラグをセットで持つ）
  function bracketTokens(pattern) {
    if (pattern.kind === "allBg") return { special: "---" };
    if (pattern.kind === "allFg") return { tokens: [circled(1)], trailing: 0 };
    const tokens = pattern.runs.map((r) =>
      r.fg ? circled(r.len) : String(r.len),
    );
    return { tokens, trailing: pattern.trailing };
  }

  // 1グループぶんの各列の表示文字列を作る
  function groupToCells(g) {
    const bt = bracketTokens(g.pattern);
    return {
      special: bt.special || null, // "---" の場合のみ入る
      bracketTokenList: bt.tokens || [], // ブラケット内の数字を1個ずつの配列で持つ(間隔を個別に制御するため)
      trailingText: bt.trailing > 0 ? String(bt.trailing) : "",
      rowNumbersText: g.rowNumbers.join(ROW_NUM_SEPARATOR),
      yarnText: `( ${g.bgLabel} / ${g.fgLabel} )`,
      bgLabel: g.bgLabel,
      fgLabel: g.fgLabel,
    };
  }

  // トークン配列(数字を1個ずつ)を、指定の間隔をあけて並べた場合の全体幅を求める
  function measureTokenListWidth(ctx, tokens) {
    if (tokens.length === 0) return 0;
    let w = 0;
    tokens.forEach((t) => (w += ctx.measureText(t).width));
    w += BRACKET_TOKEN_GAP * (tokens.length - 1);
    return w;
  }

  // ページ内の内容から、3列の幅を決める。
  // ・ブラケット列：必要最低限
  // ・段番号列：必要最低限〜ページの残り全部
  // ・毛糸列：必要最低限
  //
  // 段番号が少ない場合は段番号列を短くして、毛糸列を左へ寄せる。
  // 段番号が多くて1行に収まらない場合だけ、段番号列を広げていく。
  function calculateColumnWidths(ctx, pageGroups, tableWidth) {
    const cellsList = pageGroups.map(groupToCells);

    // ------------------------------------------------------------
    // ブラケット列の必要幅
    // ------------------------------------------------------------
    let bracketContentWidth = 0;

    cellsList.forEach((cells) => {
      if (cells.special) {
        bracketContentWidth = Math.max(
          bracketContentWidth,
          ctx.measureText(cells.special).width,
        );
        return;
      }

      const bracketW = measureTokenListWidth(ctx, cells.bracketTokenList);

      const trailingW = cells.trailingText
        ? ctx.measureText(cells.trailingText).width
        : 0;

      const totalW =
        bracketW +
        (cells.trailingText ? BRACKET_TRAILING_GAP : 0) +
        trailingW +
        BRACKET_UNDERLINE_OVERHANG * 2;

      bracketContentWidth = Math.max(bracketContentWidth, totalW);
    });

    // ブラケット列は「内容＋最低限の余白」だけ
    const bracketColWidth =
      bracketContentWidth +
      COL_BRACKET_LEFT_PADDING +
      COL_GAP_DIVIDER_TO_BRACKET;

    // ------------------------------------------------------------
    // 毛糸列の必要幅
    // ------------------------------------------------------------
    let yarnContentWidth = 0;

    cellsList.forEach((cells) => {
      yarnContentWidth = Math.max(
        yarnContentWidth,
        ctx.measureText(cells.yarnText).width,
      );
    });

    // 毛糸列も「内容＋最低限の余白」だけ
    const yarnColWidth =
      COL_GAP_ROWNUM_TO_YARN + yarnContentWidth + COL_YARN_RIGHT_PADDING;

    // ------------------------------------------------------------
    // 段番号列に実際に使える最大幅
    // ------------------------------------------------------------
    //
    // 全体から
    //   ブラケット列
    //   段番号列左側の余白
    //   段番号列右側の余白
    //   毛糸列
    // を引いた残り。
    //
    // これが「段番号が多い場合の最大幅」になる。
    const rowNumMaxWidth = Math.max(
      COL_ROWNUM_MIN_WIDTH,
      tableWidth -
        bracketColWidth -
        COL_GAP_DIVIDER_TO_ROWNUM -
        COL_ROWNUM_RIGHT_PADDING -
        yarnColWidth,
    );

    // ------------------------------------------------------------
    // 段番号列の必要最小幅
    // ------------------------------------------------------------
    //
    // 「各グループの段番号を折り返さず1行で表示する場合」に
    // 必要になる最大幅を求める。
    //
    // 例：
    //   "20 18 16" → この文字列が収まる幅
    //   "20 18"    → こちらの方が短ければ無視
    //
    // ページ内で一番長いものを採用する。
    let rowNumNeededWidth = 0;

    cellsList.forEach((cells) => {
      rowNumNeededWidth = Math.max(
        rowNumNeededWidth,
        ctx.measureText(cells.rowNumbersText).width,
      );
    });

    // 最小幅〜最大幅の間に収める。
    //
    // 段番号が少ない：
    //   rowNumNeededWidth が小さい → 毛糸列が左へ寄る
    //
    // 段番号が多い：
    //   rowNumNeededWidth が大きい → 段番号列も広がる
    //
    // 最大幅を超える場合：
    //   最大幅で止めて折り返す。
    const rowNumWidth = Math.max(
      COL_ROWNUM_MIN_WIDTH,
      Math.min(rowNumNeededWidth, rowNumMaxWidth),
    );

    return {
      bracketColWidth,
      rowNumWidth,
      yarnColWidth,
    };
  }

  // 段番号("20 18 16 14"のようにスペース区切り)を、maxWidthに収まるよう
  // 単純な貪欲法で複数行に折り返す。1個も入らない極端な幅の場合でも、
  // 最低1個は強制的に置く(無限ループ防止)。
  function wrapRowNumbers(ctx, text, maxWidth) {
    const tokens = text.split(" ").filter(Boolean);

    if (tokens.length === 0) return [""];

    const lines = [];
    let current = tokens[0];

    for (let i = 1; i < tokens.length; i++) {
      const candidate = `${current}${ROW_NUM_SEPARATOR}${tokens[i]}`;

      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = tokens[i];
      } else {
        current = candidate;
      }
    }

    lines.push(current);
    return lines;
  }

  // グループ1件ぶんの実際の描画高さ(段番号の折り返し込み)を求める
  function groupRowHeight(numRowNumLines) {
    return numRowNumLines <= 1
      ? ROW_HEIGHT
      : ROW_HEIGHT + (numRowNumLines - 1) * ROW_NUM_WRAP_LINE_HEIGHT;
  }

  // 1ページぶんのCanvasを描画する
  function renderPage(pageGroups, title, pageIndex, pageCount) {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // タイトル(編み図名)：左上・控えめなサイズ
    ctx.fillStyle = TITLE_COLOR;
    ctx.font = `${TITLE_FONT_SIZE}px 'Zen Maru Gothic', sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(title || "", MARGIN_LEFT, MARGIN_TOP);

    // 列の右端/左端のX座標を決める：3列を表全体の横幅でちょうど1/3ずつに分ける
    const contentLeft = MARGIN_LEFT; // 表全体の左端
    const contentRight = PAGE_W - MARGIN_RIGHT; // 表全体の右端
    const tableWidth = contentRight - contentLeft;

    ctx.font = `${ROW_FONT_SIZE}px 'Zen Maru Gothic', sans-serif`;

    const { bracketColWidth, rowNumWidth, yarnColWidth } =
      calculateColumnWidths(ctx, pageGroups, tableWidth);

    // ブラケット列と段番号列の境界
    const dividerX = contentLeft + bracketColWidth;

    // ブラケット列の右寄せ基準
    const bracketColRight = dividerX - COL_GAP_DIVIDER_TO_BRACKET;

    // 段番号列の左端
    const rowNumColLeft = dividerX + COL_GAP_DIVIDER_TO_ROWNUM;

    // 段番号列の実際の折り返し幅
    const rowNumMaxWidth = rowNumWidth;

    // 段番号列と毛糸列の境界
    const rowNumColBoundaryRight =
      rowNumColLeft + rowNumMaxWidth + COL_ROWNUM_RIGHT_PADDING;

    // 毛糸列の左端
    const yarnColLeft = rowNumColBoundaryRight + COL_GAP_ROWNUM_TO_YARN;

    const contentTop = MARGIN_TOP + TITLE_GAP_BELOW;

    ctx.font = `${ROW_FONT_SIZE}px 'Zen Maru Gothic', sans-serif`;
    const cellsList = pageGroups.map((g) => {
      const cells = groupToCells(g);
      cells.rowNumberLines = wrapRowNumbers(
        ctx,
        cells.rowNumbersText,
        rowNumMaxWidth,
      );
      return cells;
    });

    // 縦線(ブラケット+トレイリング列 と 段番号列 の間)の描画開始Y座標
    // (終了Y座標は、下の描画ループで実際の行の積み上げに合わせて都度更新する)
    const dividerTopY = contentTop - ROW_HEIGHT * 0.35;

    // ---- 表の行を描画 ----
    ctx.textBaseline = "alphabetic";
    let y = contentTop;
    let dividerBottom = dividerTopY;
    cellsList.forEach((cells, i) => {
      const prevCells = i > 0 ? cellsList[i - 1] : null;
      const yarnChanged =
        prevCells &&
        (prevCells.bgLabel !== cells.bgLabel ||
          prevCells.fgLabel !== cells.fgLabel);

      if (i > 0) {
        // 1つ前の行の高さ(段番号の折り返し込み)ぶん進める
        y += groupRowHeight(prevCells.rowNumberLines.length);
        if (yarnChanged) {
          y += GROUP_DIVIDER_EXTRA_GAP;
          // 毛糸の組み合わせが変わる境目に、薄い横線を表全体の幅で引く
          // (縦線をまたいで1本につながる。太さ・色は縦線と共通のDIVIDER_*を使う)
          const lineY = y - ROW_FONT_SIZE * 1.5;
          ctx.strokeStyle = DIVIDER_COLOR;
          ctx.lineWidth = DIVIDER_LINE_WIDTH;
          ctx.beginPath();
          ctx.moveTo(contentLeft, lineY);
          ctx.lineTo(contentRight, lineY);
          ctx.stroke();
        }
      }

      // 段番号：左寄せ(段番号列の左端起点)。折り返した場合は2行目以降を下に重ねて描く
      ctx.fillStyle = ROW_TEXT_COLOR;
      ctx.textAlign = "left";
      cells.rowNumberLines.forEach((line, li) => {
        ctx.fillText(line, rowNumColLeft, y + li * ROW_NUM_WRAP_LINE_HEIGHT);
      });

      // このグループ行全体の下端(次の毛糸区切り線・最終的な縦線の長さの計算に使う)
      dividerBottom =
        y + groupRowHeight(cells.rowNumberLines.length) - ROW_HEIGHT;

      // 地/柄の毛糸番号 ( )で囲んで左寄せ。段番号の1行目の高さに揃える
      ctx.fillText(cells.yarnText, yarnColLeft, y);

      // ブラケット＋トレイリング（"---"の特殊表記の場合はそのまま右寄せで表示）。
      // こちらも段番号の1行目の高さに揃える
      if (cells.special) {
        ctx.textAlign = "right";
        ctx.fillText(cells.special, bracketColRight, y);
      } else {
        // トレイリングを右端に、ブラケット部分(下線つき)をその左に配置する
        const trailingW = cells.trailingText
          ? ctx.measureText(cells.trailingText).width
          : 0;
        const trailingX = bracketColRight;
        const bracketRightEdge = cells.trailingText
          ? trailingX - trailingW - BRACKET_TRAILING_GAP
          : trailingX;
        const bracketW = measureTokenListWidth(ctx, cells.bracketTokenList);
        const bracketLeftEdge = bracketRightEdge - bracketW;

        // ブラケット内の数字を1個ずつ、BRACKET_TOKEN_GAP の間隔で並べて描く
        ctx.textAlign = "left";
        let tokenX = bracketLeftEdge;
        cells.bracketTokenList.forEach((token) => {
          ctx.fillText(token, tokenX, y);
          tokenX += ctx.measureText(token).width + BRACKET_TOKEN_GAP;
        });
        if (cells.trailingText) {
          ctx.fillText(cells.trailingText, trailingX - trailingW, y);
        }

        // 下線マーク（"["を90度左に回転させた形＝両端に短いひげのある下線）。
        // 数字の実際の幅より少し(BRACKET_UNDERLINE_OVERHANG ぶん)長めに引く
        const underlineY = y + BRACKET_UNDERLINE_GAP;
        const underlineLeft = bracketLeftEdge - BRACKET_UNDERLINE_OVERHANG;
        const underlineRight = bracketRightEdge + BRACKET_UNDERLINE_OVERHANG;
        ctx.strokeStyle = ROW_TEXT_COLOR;
        ctx.lineWidth = BRACKET_UNDERLINE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(underlineLeft, underlineY);
        ctx.lineTo(underlineRight, underlineY);
        ctx.moveTo(underlineLeft, underlineY);
        ctx.lineTo(underlineLeft, underlineY - BRACKET_UNDERLINE_TICK_H);
        ctx.moveTo(underlineRight, underlineY);
        ctx.lineTo(underlineRight, underlineY - BRACKET_UNDERLINE_TICK_H);
        ctx.stroke();
      }
    });

    // 縦線(ブラケット+トレイリング列 と 段番号列 の間)を1本だけ描画する
    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = DIVIDER_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(dividerX, dividerTopY);
    ctx.lineTo(dividerX, dividerBottom + ROW_HEIGHT * 0.35);
    ctx.stroke();

    // ページ番号(複数ページある場合のみ)
    if (pageCount > 1) {
      ctx.fillStyle = PAGE_NUMBER_COLOR;
      ctx.font = `${PAGE_NUMBER_FONT_SIZE}px 'Zen Maru Gothic', sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(
        `${pageIndex + 1} / ${pageCount}`,
        PAGE_W - MARGIN_RIGHT,
        PAGE_H - PAGE_NUMBER_MARGIN_BOTTOM,
      );
    }

    return canvas;
  }

  // state・タイトル文字列 を受け取り、A5画像のCanvas配列(複数ページ)を返す
  function renderPages(state, title) {
    const groups = KC.quickReference.buildGroups(state);
    if (groups.length === 0) return [];

    // ページ分割の判定にも、段番号列の折り返し幅と同じ計算が必要なので、
    // 計測専用のCanvasを1つ用意しておく(実際の描画には使わない)
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d");
    mctx.font = `${ROW_FONT_SIZE}px 'Zen Maru Gothic', sans-serif`;
    const tableWidthForMeasure = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

    // 描画時と同じルールで段番号列の幅を決める。
    // これにより、ページ分割時の折り返し判定と実際の描画が一致する。
    const { rowNumWidth: rowNumMaxWidthForMeasure } = calculateColumnWidths(
      mctx,
      groups,
      tableWidthForMeasure,
    );

    const groupsWithLines = groups.map((g) => {
      const rowNumbersText = g.rowNumbers.join(ROW_NUM_SEPARATOR);
      const lines = wrapRowNumbers(
        mctx,
        rowNumbersText,
        rowNumMaxWidthForMeasure,
      );
      return Object.assign({}, g, { rowNumberLineCount: lines.length });
    });

    // 1ページに入る行数を、行の高さ(折り返し込み)＋グループ区切りの追加余白を
    // 積算しながら決める
    const contentTop = MARGIN_TOP + TITLE_GAP_BELOW;
    const contentBottom = PAGE_H - MARGIN_BOTTOM;
    const availableHeight = contentBottom - contentTop;

    const pages = [];
    let current = [];
    let usedHeight = 0;
    groupsWithLines.forEach((g, i) => {
      const prev = i > 0 ? groupsWithLines[i - 1] : null;
      const yarnChanged =
        prev && (prev.bgLabel !== g.bgLabel || prev.fgLabel !== g.fgLabel);
      const extra =
        current.length === 0
          ? 0
          : groupRowHeight(prev.rowNumberLineCount) +
            (yarnChanged ? GROUP_DIVIDER_EXTRA_GAP : 0);
      if (current.length > 0 && usedHeight + extra > availableHeight) {
        pages.push(current);
        current = [];
        usedHeight = 0;
      } else {
        usedHeight += extra;
      }
      current.push(g);
    });
    if (current.length > 0) pages.push(current);

    return pages.map((pageGroups, i) =>
      renderPage(pageGroups, title, i, pages.length),
    );
  }

  KC.quickReferencePrint = { renderPages, PAGE_W, PAGE_H };
})(window.KC);
