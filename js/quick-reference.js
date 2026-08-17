/* ============================================================
   quick-reference.js
   編み図データ(KC.state)から「早見表」テキストを生成する。

   早見表1行の書式：
     [ブラケット] トレイリング数値    行番号(複数可、降順) ( 地の毛糸番号 / 柄の毛糸番号 )

   ルール（サンプルチャート20行から確認済み。詳細はチャットでのやり取り参照）：
   1. 各段を「表示目番号順」（画面の右端＝表示目番号1から左端へ）で読む。
   2. トレイリング数値 = 表示目番号1から数えて、最初に柄(fg)が出てくるまでの
      地(bg)の目数。位置1がすでに柄なら0（表記なし）。
   3. ブラケットは、その段の「実際の最小繰り返し周期」（保存されているrepeat値は
      信用せず、パターン自体から求め直す。最低2回タイルされているものだけを
      繰り返しとみなす）を、地→柄の塊(run)に分解して作る。
      - 素直に位置1から1周期分読んだときに柄で終わっていれば、それをそのまま使う
        （row19のように、たまたま柄で終わる場合はトレイリングとの重複处理は不要）。
      - 柄で終わらない場合は、周期を全ての開始位置で回転させ「柄で終わる」
        パターンのうち、トークン数が最も少ない（＝地/柄の塊が自然にまとまる）
        ものを採用する。
   4. 特殊表記：1段まるごと地 → "---"。1段まるごと柄 → "[①]"。
   5. 地/柄の毛糸番号の組み合わせ・ブラケット・トレイリング数値がすべて一致する
      段は、チャート上で連続していなくても1行にまとめる。行番号は降順で列挙する。
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
    return y ? y.id : "－";
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

  // 1周期分の配列から、ブラケット用のrun配列を求める。
  // 「柄(fg)で終わる」ことを必須条件とし、素直な読みがそれを満たさない場合は
  // 全ての回転を試して条件を満たす中でトークン数最小のものを採用する。
  function buildBracketRuns(periodArr) {
    const naive = runLengthEncode(periodArr);
    if (naive[naive.length - 1].value === true) return naive;

    const p = periodArr.length;
    let best = null;
    for (let start = 0; start < p; start++) {
      const rotated = [];
      for (let i = 0; i < p; i++) rotated.push(periodArr[(start + i) % p]);
      const runs = runLengthEncode(rotated);
      if (runs[runs.length - 1].value !== true) continue;
      if (!best || runs.length < best.runs.length) best = { start, runs };
    }
    return best ? best.runs : naive;
  }

  // 1段ぶんのパターンを解析して構造化データを返す（文字列化はしない）
  // 戻り値:
  //   { kind: "allBg" }                                    … 1段まるごと地
  //   { kind: "allFg" }                                    … 1段まるごと柄
  //   { kind: "pattern", runs: [{fg,len}...], trailing: n } … 通常パターン
  function analyzeRowPattern(row, cols) {
    const full = fullDisplayPattern(row, cols);
    if (full.every((v) => v === false)) return { kind: "allBg" };
    if (full.every((v) => v === true)) return { kind: "allFg" };

    let trailing = 0;
    while (trailing < full.length && full[trailing] === false) trailing++;

    const period = findMinimalPeriod(full);
    const periodArr = full.slice(0, period);
    const runs = buildBracketRuns(periodArr).map((r) => ({
      fg: r.value,
      len: r.len,
    }));
    return { kind: "pattern", runs, trailing };
  }

  // 構造化されたパターンを早見表のテキスト表記（"[4 ①] 2" など）に変換する
  function formatPatternText(pattern) {
    if (pattern.kind === "allBg") return "---";
    if (pattern.kind === "allFg") return "[①]";
    const bracket =
      "[" +
      pattern.runs.map((r) => (r.fg ? circled(r.len) : String(r.len))).join(" ") +
      "]";
    return pattern.trailing > 0 ? `${bracket} ${pattern.trailing}` : bracket;
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
