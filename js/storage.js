/* ============================================================
   storage.js
   ページ再読み込みをまたいで作業内容を保持するための自動保存。
   localStorage を使用（cookieはサーバー通信用の仕組みでありこの
   完全クライアントサイドのアプリには不要かつ容量的にも不向きなため
   採用しない）。

   使い方（main.js側）:
   - 他モジュールの init より前に KC.storage.init() を呼ぶ
     → 保存データがあれば state に復元してから true を返す
   - 他モジュールの init が済んだ後に KC.storage.bindAutoSave() を呼ぶ
     → 以後、編集のたびに自動保存されるようになる
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  const STORAGE_KEY = "knitChartMaker.autosave.v1";
  const SAVE_DEBOUNCE_MS = 500;

  let nameInput = null;
  let saveTimer = null;

  function isAvailable() {
    try {
      const testKey = "__kc_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  function readProjectName() {
    return nameInput ? nameInput.value : "";
  }
  function writeProjectName(name) {
    if (nameInput && typeof name === "string" && name.length) {
      nameInput.value = name;
    }
  }

  function saveNow() {
    if (!isAvailable()) return;
    try {
      const payload = {
        savedAt: Date.now(),
        projectName: readProjectName(),
        data: S.buildExportData(1),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error("[KC.storage] save failed", err);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  // 保存データがあれば state に反映する。復元できたら true。
  function restore() {
    if (!isAvailable()) return false;
    let raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return false;
    }
    if (!raw) return false;
    try {
      const payload = JSON.parse(raw);
      S.loadFromData(payload.data);
      writeProjectName(payload.projectName);
      return true;
    } catch (err) {
      console.error("[KC.storage] restore failed", err);
      return false;
    }
  }

  function init() {
    nameInput = document.getElementById("project-name-input");
    return restore();
  }

  function bindAutoSave() {
    KC.bus.on("rowsChanged", scheduleSave);
    KC.bus.on("sizeChanged", scheduleSave);
    KC.bus.on("dataReplaced", scheduleSave);
    if (nameInput) nameInput.addEventListener("input", scheduleSave);
    window.addEventListener("beforeunload", saveNow);
  }

  KC.storage = { init, bindAutoSave, saveNow, restore, isAvailable };
})(window.KC);
