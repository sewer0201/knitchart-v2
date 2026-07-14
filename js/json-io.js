/* ============================================================
   json-io.js
   プロジェクトのJSON書き出し・読み込み。
   As-Is仕様書 3.7 を完全踏襲。データ構造に変更がないため
   format version は 1 のまま据え置き、v1で書き出したファイルを
   v2でもそのまま読み込める（v2要件定義書 7章の互換性要件）。
   将来 version:2 相当の構造変更が入った場合に備え、
   migrate() にマイグレーションの分岐点を用意している。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  function migrate(data) {
    // 現状 v1/v2 でデータ構造に差分はないため素通し。
    // 将来 version が 2 以上に上がった場合はここで変換する。
    return data;
  }

  function exportData() {
    return S.buildExportData(1);
  }

  function download(projectName) {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = projectName + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importFromFile(file, onSuccess, onError) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        const data = migrate(raw);
        S.loadFromData(data);
        onSuccess && onSuccess();
      } catch (err) {
        onError && onError(err);
      }
    };
    reader.onerror = () => onError && onError(new Error("read failed"));
    reader.readAsText(file);
  }

  KC.jsonIO = { exportData, download, importFromFile, migrate };
})(window.KC);
