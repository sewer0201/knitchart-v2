/* ============================================================
   quick-reference-tab.js
   保存タブに出る早見表（A5画像・複数ページ）のプレビュー・保存リストのDOM配線。
   実際の変換ルールは KC.quickReference、画像化は KC.quickReferencePrint が持つ
   （このファイルはそれらを呼び出して結果を表示するだけ）。

   ボタン操作は不要で、以下のタイミングで自動的に生成し直す：
     ・アプリを開いたとき（プロジェクト読み込み時）
     ・保存タブを表示したとき
   段を塗る・追加するなどの編集操作(rowsChanged)のたびには生成し直さない。
   早見表は編み図全体（cols×全段）を毎回スキャンして繰り返し周期を求め直す処理
   （最悪計算量が段数×目数の2乗に比例する）を含むため、タップやドラッグで
   頻発するrowsChangedにそのまま反応させると、特に目数の多い編み図で編集中に
   もたつく可能性がある。保存タブを見るタイミングでだけ作り直せば、その体感の
   重さを避けつつ「ボタンを押さなくても常に最新の状態で表示されている」を両立できる。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  let panel, listEl;

  function q(id) {
    return document.getElementById(id);
  }

  function init() {
    panel = q("quick-reference-panel");
    listEl = q("quick-reference-list");

    KC.bus.on("dataReplaced", generate);
    KC.bus.on("tabActivated", (tab) => {
      if (tab === "export") generate();
    });

    generate();
  }

  function generate() {
    if (!panel || !listEl) return;
    const state = S.get();
    const pname =
      KC.exportTab && KC.exportTab.projectName
        ? KC.exportTab.projectName()
        : "編み図";

    const pages = KC.quickReferencePrint.renderPages(state, pname);
    listEl.innerHTML = "";
    panel.classList.toggle("is-hidden", pages.length === 0);
    if (pages.length === 0) return;

    pages.forEach((canvas, i) => {
      const li = document.createElement("li");
      li.className = "print-image-item";

      const head = document.createElement("div");
      head.className = "print-image-head";
      const label = document.createElement("span");
      label.className = "print-image-label";
      label.textContent = `${i + 1} / ${pages.length}ページ`;
      head.appendChild(label);
      li.appendChild(head);

      canvas.className = "print-image-canvas";
      li.appendChild(canvas);

      const actions = document.createElement("div");
      actions.className = "print-image-actions";
      const saveOneBtn = document.createElement("button");
      saveOneBtn.type = "button";
      saveOneBtn.className = "pill-btn";
      saveOneBtn.innerHTML =
        '<i class="ti ti-download" aria-hidden="true"></i>PNGとして保存';
      saveOneBtn.addEventListener("click", () => {
        const filename =
          pages.length > 1
            ? `${pname}_早見表_${i + 1}.png`
            : `${pname}_早見表.png`;
        KC.pngExport.downloadCanvas(canvas, filename);
        KC.bus.emit("toast", "早見表のPNG画像を書き出しました");
      });
      actions.appendChild(saveOneBtn);
      li.appendChild(actions);

      listEl.appendChild(li);
    });
  }

  KC.quickReferenceTab = { init };
})(window.KC);
