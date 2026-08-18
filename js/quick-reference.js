/* ============================================================
   quick-reference.js
   編み図データ(KC.state)から「早見表」テキストを生成する。

   早見表1行の書式：
     [ブラケット] トレイリング数値 (末尾繰越の地目数 末尾繰越の柄目数) 行番号(複数可、降順) ( 地の毛糸番号 / 柄の毛糸番号 )

   ルール（サンプルチャート＋実データ(ベスト編み図⑤)185行との突き合わせで確認済み）：
   1. 各段を「表示目番号順」（画面の右端＝表示目番号1から左端へ）で読む。
   2. トレイリング数値 = 表示目番号1から数えて、最初に柄(fg)が出てくるまでの
      地(bg)の目数。位置1がすでに柄なら0（表記なし）。
   3. ブラケットは、その段の「実際の最小繰り返し周期」（保存されているrepeat値は
      信用せず、パターン自体から求め直す。最低2回タイルされているものだけを
      繰り返しとみなす）を、地→柄の塊(run)に分解して作る。
      - 周期配列は円環（先頭と末尾が繋がっている）とみなす。先頭の塊と末尾の塊が
        同じ種類（地/柄）なら、それらは本来1つの塊なので必ず結合してから数える
        （結合を怠ると塊の個数を誤って多く数えてしまう）。
      - 「塊の切れ目」だけを開始位置候補とし、柄(fg)の塊で終わる回転のうち、
        トークン数が最も少ない（＝地/柄の塊が自然にまとまる）ものを候補とする。
      - 候補が複数（同数タイ）ある場合は、後述の「末尾繰越」も考慮したうえで
        最も開始位置indexが大きい（＝周期配列の後方寄りにある）ものを採用する。
        具体的には、開始位置indexが
          period - trailing - tailBgLen - tailFgLen
        以下であるものの中から、開始位置indexが最大のものを選ぶ
        （tailBgLen / tailFgLen はルール3.5参照。地のみで終わる通常行では両方0）。
   3.5 末尾繰越（左端＝表示目番号cols）が柄(fg)で終わる行について：
      - full配列(表示順)の末尾から連続する柄(fg)の目数を tailFgLen、その直前に
        連続する地(bg)の目数を tailBgLen とする（地で終わる行は両方0）。
      - トレイリング数値が0（位置1がすでに柄）で、かつ周期配列の先頭の塊と末尾の
        塊が同じ種類（＝柄同士。ルール3参照）の場合にかぎり、その柄の塊が周期の
        境界をまたいで実在することを示すため、ブラケットの後ろに
        「tailBgLen ○tailFgLen（柄なので丸数字）」を追加で表記する。
        それ以外の場合はこの追加表記はしない。
   4. 特殊表記：1段まるごと地 → "---"。1段まるごと柄 → "[①]"。
   5. 地/柄の毛糸番号の組み合わせ・ブラケット・トレイリング数値・末尾繰越表記が
      すべて一致する段は、チャート上で連続していなくても1行にまとめる。
      行番号は降順で列挙する。
   6. 早見表全体の並び順は、各行(まとめ済み)グループの「最小の行番号」を代表値とし、
      代表値が大きい順（＝編み図の上から下）に並べる。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  const CIRCLED_DIGITS = "⓪①②③④⑤⑥⑦⑧⑨";
  function circled(n) {
    return n >= 0 && n <= 9 ? CIRCLED_DIGITS[n] : `(${n})`;
  }

  function yarnLabel(uid) {
    const y = S.findYarn(uid);
    return y ? y.id : "-";
  }

  // 表示順(index0=表示目番号1=物理右端)のフルパターンを作る。true=柄(fg)
  function fullDisplayPattern(row, cols) {
    const arr = [];
    for (let pos = 0; pos < cols; pos++) arr.push(S.stitchAt(row, cols - 1 - pos));
    return arr;
  }

  // 実際の最小繰り返し周期を、保存されているrepeatを信用せずパターンから求める。
  // 最低2回タイルされているものだけを「繰り返し」とみなす（そうでないと疎らな
  // 1目だけの模様でも偶然小さい周期が成立してしまうため）。
  function findMinimalPeriod(pattern) {
    const n = pattern.length;
    for (let p = 1; p <= Math.floor(n / 2); p++) {
      let ok = true;
      for (let i = 0; i + p < n; i++) {
        if (pattern[i] !== pattern[i + p]) {
          ok = false;
          break;
        }
      }
      if (ok) return p;
    }
    return n; // 有意な繰り返しが見つからない場合は全体を1周期とする
  }

  function runLengthEncode(arr) {
    const runs = [];
    arr.forEach((v) => {
      const last = runs[runs.length - 1];
      if (last && last.value === v) last.len++;
      else runs.push({ value: v, len: 1 });
    });
    return runs;
  }

  // 周期配列(円環)から、「塊の切れ目」だけを開始位置として、柄(fg)の塊で終わる
  // 回転をすべて洗い出す。戻り値は [{ start, runs }] の配列（トークン数は問わない）。
  function enumerateRotations(periodArr) {
    const p = periodArr.length;
    const candidates = [];
    for (let start = 0; start < p; start++) {
      // 塊の切れ目（直前の要素と種類が変わる位置）だけを候補にする。
      // そうしないと同じ塊の途中で切ってしまい、塊が不自然に分裂する。
      if (periodArr[start] === periodArr[(start - 1 + p) % p]) continue;
      const rotated = [];
      for (let i = 0; i < p; i++) rotated.push(periodArr[(start + i) % p]);
      const runs = runLengthEncode(rotated);
      if (runs[runs.length - 1].value !== true) continue; // 柄で終わるものだけ
      candidates.push({ start, runs });
    }
    return candidates;
  }

  // 1周期分の配列から、ブラケット用のrun配列を求める。
  // - 周期配列は円環とみなすため、runLengthEncodeだけでは先頭/末尾が同種の塊を
  //   誤って2つに分裂させてしまう（enumerateRotationsは塊の切れ目のみを開始位置
  //   候補にすることでこれを回避している）。
  // - 柄(fg)の塊で終わる回転のうち、トークン数最小のものだけを候補として残し、
  //   その中から「開始位置 <= limit」を満たす最大の開始位置を採用する。
  //   （limitの意味はルール3参照。同数タイのときにどの回転を選ぶかを決めるための
  //   基準で、これがないと見た目には正しいが人間が書いた早見表とは並びが異なる
  //   ブラケットが選ばれてしまうことがある）
  function buildBracketRuns(periodArr, limit) {
    const naive = runLengthEncode(periodArr);
    const candidates = enumerateRotations(periodArr);
    if (candidates.length === 0) return naive;

    const minLen = Math.min(...candidates.map((c) => c.runs.length));
    const best = candidates.filter((c) => c.runs.length === minLen);
    const within = best.filter((c) => c.start <= limit);
    const pool = within.length > 0 ? within : best;
    let chosen = pool[0];
    pool.forEach((c) => {
      if (c.start > chosen.start) chosen = c;
    });
    return chosen.runs;
  }

  // 表示配列の末尾（左端＝表示目番号cols）から連続する柄(fg)の目数と、
  // その直前に連続する地(bg)の目数を数える。
  // 末尾が地(bg)で終わる行では、この「末尾繰越」自体が無関係なので両方0を返す
  // （末尾がbgの塊の途中であっても、それはただの通常のbg run であり、
  //   ルール3.5の対象にはならない）。
  function measureTail(full) {
    if (full[full.length - 1] !== true) return { tailBgLen: 0, tailFgLen: 0 };
    let i = full.length - 1;
    let tailFgLen = 0;
    while (i >= 0 && full[i] === true) {
      tailFgLen++;
      i--;
    }
    let tailBgLen = 0;
    while (i >= 0 && full[i] === false) {
      tailBgLen++;
      i--;
    }
    return { tailBgLen, tailFgLen };
  }

  // 1段ぶんのパターンを解析して構造化データを返す（文字列化はしない）
  // 戻り値:
  //   { kind: "allBg" }                                    … 1段まるごと地
  //   { kind: "allFg" }                                    … 1段まるごと柄
  //   { kind: "pattern", runs: [{fg,len}...], trailing: n,
  //     tailSuffix: {bgLen, fgLen} | null }                 … 通常パターン
  function analyzeRowPattern(row, cols) {
    const full = fullDisplayPattern(row, cols);
    if (full.every((v) => v === false)) return { kind: "allBg" };
    if (full.every((v) => v === true)) return { kind: "allFg" };

    let trailing = 0;
    while (trailing < full.length && full[trailing] === false) trailing++;

    const period = findMinimalPeriod(full);
    const periodArr = full.slice(0, period);
    const naive = runLengthEncode(periodArr);

    const { tailBgLen, tailFgLen } = measureTail(full);

    // 周期配列の先頭の塊と末尾の塊が同じ種類なら、円環上では本来1つの塊。
    // トレイリングが0（位置1がすでに柄）のときに限り、その塊が周期の境界を
    // またいで実在することを示す追加表記（ルール3.5）が必要になる。
    const needsWrapMerge =
      naive.length > 1 && naive[0].value === naive[naive.length - 1].value;
    const tailSuffix =
      trailing === 0 && needsWrapMerge ? { bgLen: tailBgLen, fgLen: tailFgLen } : null;

    // タイになった回転候補のうち、末尾繰越ぶんも考慮した基準位置以下で
    // もっとも後方のものを選ぶ（ルール3）。
    const limit = period - trailing - tailBgLen - tailFgLen;
    const runs = buildBracketRuns(periodArr, limit).map((r) => ({
      fg: r.value,
      len: r.len,
    }));
    return { kind: "pattern", runs, trailing, tailSuffix };
  }

  // 構造化されたパターンを早見表のテキスト表記（"[4 ①] 2" など）に変換する
  function formatPatternText(pattern) {
    if (pattern.kind === "allBg") return "---";
    if (pattern.kind === "allFg") return "[①]";
    const bracket =
      "[" +
      pattern.runs.map((r) => (r.fg ? circled(r.len) : String(r.len))).join(" ") +
      "]";
    const parts = [bracket];
    if (pattern.trailing > 0) parts.push(String(pattern.trailing));
    if (pattern.tailSuffix) {
      parts.push(String(pattern.tailSuffix.bgLen));
      parts.push(circled(pattern.tailSuffix.fgLen));
    }
    return parts.join(" ");
  }

  // state を受け取り、早見表1行ぶんずつの構造化データ配列を返す
  // （ルール5:グループ化・ルール6:並び順 を適用済み）
  function buildGroups(state) {
    const cols = state.cols;
    const rows = state.rows; // rows[0] = 1段目(下端)

    const analyzed = rows.map((row, i) => {
      const rowNumber = i + 1;
      const pattern = analyzeRowPattern(row, cols);
      const patternKey = JSON.stringify(pattern);
      const key = `${patternKey}\u0000${row.bg || ""}\u0000${row.fg || ""}`;
      return { rowNumber, pattern, bg: row.bg, fg: row.fg, key };
    });

    // ルール5：同一キー(パターン+地/柄)の段をまとめる
    const groups = new Map();
    analyzed.forEach((a) => {
      if (!groups.has(a.key)) {
        groups.set(a.key, {
          pattern: a.pattern,
          bg: a.bg,
          fg: a.fg,
          rowNumbers: [],
        });
      }
      groups.get(a.key).rowNumbers.push(a.rowNumber);
    });

    // ルール6：各グループの最小行番号を代表値とし、代表値の降順に並べる
    const groupList = Array.from(groups.values()).map((g) => {
      const rowNumbers = g.rowNumbers.slice().sort((x, y) => y - x); // 降順
      const minRowNumber = Math.min(...g.rowNumbers);
      return Object.assign(g, { rowNumbers, minRowNumber });
    });
    groupList.sort((a, b) => b.minRowNumber - a.minRowNumber);

    return groupList.map((g) => ({
      pattern: g.pattern,
      patternText: formatPatternText(g.pattern),
      bgLabel: yarnLabel(g.bg),
      fgLabel: yarnLabel(g.fg),
      rowNumbers: g.rowNumbers, // 降順の数値配列
    }));
  }

  // state を受け取り、早見表をテキスト行（1行1文字列）として返す
  function buildLines(state) {
    return buildGroups(state).map((g) => {
      const rowNumbersText = g.rowNumbers.join(" ");
      return `${g.patternText}    ${rowNumbersText} ( ${g.bgLabel} / ${g.fgLabel} )`;
    });
  }

  KC.quickReference = {
    buildGroups,
    buildLines,
    analyzeRowPattern,
    formatPatternText,
    findMinimalPeriod,
  };
})(window.KC);
