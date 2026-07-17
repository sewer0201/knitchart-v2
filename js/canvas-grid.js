/* ============================================================
   canvas-grid.js
   編み図グリッドの描画・ピンチズーム/パン・セルタップ・
   行番号タップ（行編集シートを開く）・長押し（選択モードに入る）

   行番号ガター（左）・目数番号ガター（上）は共に「画面に固定された
   フローズンペイン」として、セル部分のパン/ズームとは切り離して描画する。
   行番号ガターは縦方向のパン/ズームに追従し（横に動かしても番号が
   画面外に消えない）、目数番号ガターは横方向のパン/ズームに追従する
   （縦に動かしても番号が画面外に消えない）。
   ============================================================ */
window.KC = window.KC || {};

(function (KC) {
  "use strict";
  const S = KC.state;

  const BASE_CELL = 26; // 拡大率1.0のときの1マスのサイズ(px)
  const GUTTER_W = 40; // 行番号ガター幅（画面座標系・固定・ズームの影響を受けない）
  const GUTTER_W_SELECTION = 56; // 選択モード時の行番号ガター幅（画面座標系・固定・ズームの影響を受けない）
  const GUTTER_H = 32; // 目数番号ガター高さ（画面座標系・固定・ズームの影響を受けない）
  const MIN_SCALE = 0.15;
  const MAX_SCALE = 4;
  const TAP_MOVE_THRESHOLD = 9; // これ以上動いたらタップではなくパン/ドラッグ扱い
  const LONGPRESS_MS = 480;

  const NUMBER_COLOR_NORMAL = "#a1a1a1";
  const NUMBER_COLOR_FIVE = "#6C6C68";

  function numberColor(n) {
    return n % 5 === 0 ? NUMBER_COLOR_FIVE : NUMBER_COLOR_NORMAL;
  }
  function numberFont(n, sizePx, family) {
    const weight = n % 5 === 0 ? "bold " : "";
    return `${weight}${sizePx}px ${family}`;
  }

  let canvas, ctx, viewport;
  // view.tx / view.ty はセル部分（ガターを除いた本体グリッド）のパン量。
  // 画面座標 = GUTTER_W + view.tx + contentX*scale （横）
  // 画面座標 = GUTTER_H + view.ty + contentY*scale （縦）
  let view = { scale: 1, tx: 0, ty: 0 };
  let fitted = false;

  const pointers = new Map(); // pointerId -> {x,y}
  let gesture = null; // 'none' | 'maybe-pan' | 'pan' | 'pinch'
  let panStart = null; // {x,y, tx0, ty0}
  let pinchStart = null; // {dist0, mid0, scale0, tx0, ty0}
  let downInfo = null; // 単一ポインタのタップ/長押し判定用
  let longPressTimer = null;
  let suppressNextTap = false;

  function clampScale(s) {
    return S.clamp(s, MIN_SCALE, MAX_SCALE);
  }

  function fitToWidth() {
    const state = S.get();
    const gutterW = gutterWidth();
    if (!viewport || state.cols === 0 || state.rows.length === 0) return;
    const vw = viewport.clientWidth || 320;
    const vh = viewport.clientHeight || 480;
    const gridW = state.cols * BASE_CELL;
    const gridH = state.rows.length * BASE_CELL;
    // 横幅基準・縦幅基準それぞれのスケールを計算し、小さい方（＝より縮小が必要な方）を
    // 採用することで、横長・縦長どちらの編み図でも全体が必ず収まるようにする。
    const scaleW = (vw - gutterW - 16) / gridW;
    const scaleH = (vh - GUTTER_H - 16) / gridH;
    let scale = Math.min(scaleW, scaleH);
    scale = clampScale(scale);
    view.scale = scale;
    view.tx = 8;
    view.ty = 8;
    fitted = true;
  }

  function resizeCanvas() {
    if (!canvas || !viewport) return;
    const dpr = window.devicePixelRatio || 1;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!fitted) fitToWidth();
    draw();
  }

  function gutterWidth() {
    return KC.selection.isActive() ? GUTTER_W_SELECTION : GUTTER_W;
  }

  /* ---------------- 描画 ---------------- */
  function draw() {
    if (!ctx || !viewport) return;
    const state = S.get();
    const gutterW = gutterWidth();
    const vw = viewport.clientWidth,
      vh = viewport.clientHeight;
    ctx.clearRect(0, 0, vw, vh);

    const cellScreen = BASE_CELL * view.scale;
    const selection = KC.selection;

    // 可視範囲（セル部分の座標系）だけを描画する
    const contentXmin = (0 - view.tx) / view.scale;
    const contentXmax = (vw - gutterW - view.tx) / view.scale;
    const contentYmin = (0 - view.ty) / view.scale;
    const contentYmax = (vh - GUTTER_H - view.ty) / view.scale;

    const colStart = Math.max(0, Math.floor(contentXmin / BASE_CELL));
    const colEnd = Math.min(state.cols - 1, Math.ceil(contentXmax / BASE_CELL));
    const rowStart = Math.max(0, Math.floor(contentYmin / BASE_CELL));
    const rowEnd = Math.min(
      state.rows.length - 1,
      Math.ceil(contentYmax / BASE_CELL),
    );

    /* ---- セル本体（ガターの右下。パン/ズームが効く） ---- */
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      gutterW,
      GUTTER_H,
      Math.max(0, vw - gutterW),
      Math.max(0, vh - GUTTER_H),
    );
    ctx.clip();
    ctx.translate(gutterW + view.tx, GUTTER_H + view.ty);
    ctx.scale(view.scale, view.scale);

    const rowMeta = []; // ガター描画用に screenY 等を控えておく
    for (let displayIndex = rowStart; displayIndex <= rowEnd; displayIndex++) {
      const rowNumber = state.rows.length - displayIndex;
      const row = state.rows[rowNumber - 1];
      if (!row) continue;
      const y = displayIndex * BASE_CELL;
      const isSelected = selection.isActive() && selection.isSelected(row.uid);
      rowMeta.push({ row, rowNumber, displayIndex, isSelected });

      for (let c = colStart; c <= colEnd; c++) {
        const on = S.stitchAt(row, c);
        const color = on
          ? S.yarnColor(row.fg, "fg")
          : S.yarnColor(row.bg, "bg");
        const x = c * BASE_CELL;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, BASE_CELL, BASE_CELL);
        ctx.strokeStyle = "rgba(44,44,42,0.18)";
        ctx.lineWidth = 1 / view.scale;
        ctx.strokeRect(
          x + 0.5 / view.scale,
          y + 0.5 / view.scale,
          BASE_CELL,
          BASE_CELL,
        );
      }

      if (isSelected) {
        ctx.fillStyle = "rgba(196,106,62,0.16)";
        ctx.fillRect(
          colStart * BASE_CELL,
          y,
          (colEnd - colStart + 1) * BASE_CELL,
          BASE_CELL,
        );
        ctx.strokeStyle = "#C46A3E";
        ctx.lineWidth = 2 / view.scale;
        ctx.strokeRect(
          1 / view.scale,
          y + 1 / view.scale,
          state.cols * BASE_CELL - 2 / view.scale,
          BASE_CELL - 2 / view.scale,
        );
      }
    }

    if (KC.rangeSelect && KC.rangeSelect.isActive()) {
      KC.rangeSelect.getOverlayGeometry().forEach((r) => {
        const dTop = Math.max(0, r.dTop);
        const dBottom = Math.min(state.rows.length - 1, r.dBottom);
        const cLeft = Math.max(0, r.cLeft);
        const cRight = Math.min(state.cols - 1, r.cRight);
        if (dTop > dBottom || cLeft > cRight) return;
        const x = cLeft * BASE_CELL;
        const y = dTop * BASE_CELL;
        const w = (cRight - cLeft + 1) * BASE_CELL;
        const h = (dBottom - dTop + 1) * BASE_CELL;
        ctx.save();
        if (r.kind === "paste-preview") {
          ctx.strokeStyle = "#2B5B8C";
          ctx.lineWidth = 2 / view.scale;
          ctx.setLineDash([6 / view.scale, 4 / view.scale]);
          ctx.strokeRect(
            x + 1 / view.scale,
            y + 1 / view.scale,
            w - 2 / view.scale,
            h - 2 / view.scale,
          );
        } else {
          ctx.fillStyle = "rgba(43,91,140,0.16)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#2B5B8C";
          ctx.lineWidth = 2 / view.scale;
          ctx.strokeRect(
            x + 1 / view.scale,
            y + 1 / view.scale,
            w - 2 / view.scale,
            h - 2 / view.scale,
          );
        }
        ctx.restore();
      });
    }
    ctx.restore();

    const showNumbers = cellScreen >= 9;

    /* ---- 目数番号ガター（画面上部に固定。常に見える） ---- */
    ctx.save();
    ctx.fillStyle = "#FAF6EF";
    ctx.fillRect(gutterW, 0, Math.max(0, vw - gutterW), GUTTER_H);
    ctx.strokeStyle = "rgba(44,44,42,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gutterW, GUTTER_H - 0.5);
    ctx.lineTo(vw, GUTTER_H - 0.5);
    ctx.stroke();

    if (showNumbers) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(gutterW, 0, Math.max(0, vw - gutterW), GUTTER_H);
      ctx.clip();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let c = colStart; c <= colEnd; c++) {
        const colNumber = c + 1;
        ctx.fillStyle = numberColor(colNumber);
        ctx.font = numberFont(colNumber, 18, "'Zen Maru Gothic', sans-serif");
        const screenX =
          gutterW + view.tx + c * BASE_CELL * view.scale + cellScreen / 2;
        ctx.fillText(String(colNumber), screenX, GUTTER_H / 2);
      }
      ctx.restore();
    }
    ctx.restore();

    /* ---- 行番号ガター（画面左側に固定。常に見える） ---- */
    ctx.save();
    ctx.fillStyle = "#FAF6EF";
    ctx.fillRect(0, 0, gutterW, vh);
    ctx.strokeStyle = "rgba(44,44,42,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gutterW - 0.5, 0);
    ctx.lineTo(gutterW - 0.5, vh);
    ctx.stroke();

    rowMeta.forEach(({ row, rowNumber, displayIndex, isSelected }) => {
      const screenY =
        GUTTER_H + view.ty + displayIndex * BASE_CELL * view.scale;
      const rowH = BASE_CELL * view.scale;
      const midY = screenY + rowH / 2;

      if (selection.isActive()) {
        const r = 9;
        const cx = 16;
        ctx.beginPath();
        ctx.arc(cx, midY, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#C46A3E" : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#C46A3E" : "#B9B2A4";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (isSelected) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(cx - 3.5, midY);
          ctx.lineTo(cx - 1, midY + 3);
          ctx.lineTo(cx + 4, midY - 3.5);
          ctx.stroke();
        }
      }
      if (showNumbers) {
        ctx.fillStyle = isSelected ? "#C46A3E" : numberColor(rowNumber);
        ctx.font = numberFont(rowNumber, 18, "'Zen Maru Gothic', sans-serif");
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(String(rowNumber), gutterW - 8, midY);
      }
    });
    ctx.restore();

    /* ---- 左上コーナー（両ガターの交点。行/目数どちらのガター色でもよいので上書きしておく） ---- */
    ctx.save();
    ctx.fillStyle = "#FAF6EF";
    ctx.fillRect(0, 0, gutterW, GUTTER_H);
    ctx.strokeStyle = "rgba(44,44,42,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gutterW - 0.5, 0);
    ctx.lineTo(gutterW - 0.5, GUTTER_H);
    ctx.moveTo(gutterW, GUTTER_H - 0.5);
    ctx.lineTo(0, GUTTER_H - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 座標変換・ヒットテスト ---------------- */
  // 画面座標 -> どの行/列（またはガター）かを判定する。
  // ガター判定は画面上の座標だけで決まるため、パン/ズーム状態に関わらず常に一貫する。
  function hitTest(sx, sy) {
    const state = S.get();
    const gutterW = gutterWidth();

    if (sy < GUTTER_H) {
      // 目数番号ガター（および左上コーナー）：タップしても何も起きない
      return { row: null, inColHeader: true };
    }

    const adjY = sy - GUTTER_H;
    const displayIndex = Math.floor(
      (adjY - view.ty) / (BASE_CELL * view.scale),
    );
    const rowNumber = state.rows.length - displayIndex;
    const row = state.rows[rowNumber - 1];
    if (!row) return { row: null };

    if (sx < gutterW) {
      return { row, rowNumber, inGutter: true, valid: true };
    }
    const contentX = (sx - gutterW - view.tx) / view.scale;
    const col = Math.floor(contentX / BASE_CELL);
    const valid = col >= 0 && col < state.cols;
    return { row, rowNumber, inGutter: false, col, valid };
  }

  /* ---------------- ジェスチャー処理 ---------------- */
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function getLocalPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function clearLongPressTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function onPointerDown(e) {
    // 古いWebKit（iPadOS 15までしか対応しない機種など）では、マウスの
    // クリック＆ドラッグに対してブラウザ標準の「コンテンツ選択ドラッグ」が
    // 先に発火し、canvasが選択ハイライト色（水色）で覆われた上でJS側の
    // ジェスチャー処理が乗っ取られてしまうことがある。touch-action /
    // user-select のCSSだけでは環境によって防ぎきれない場合があるため、
    // ここで明示的に preventDefault して確実に止める。
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pos = getLocalPos(e);
    pointers.set(e.pointerId, pos);

    if (pointers.size === 1) {
      gesture = "maybe-pan";
      downInfo = { start: pos, moved: false };
      panStart = { x: pos.x, y: pos.y, tx0: view.tx, ty0: view.ty };
      clearLongPressTimer();
      const hit = hitTest(pos.x, pos.y);
      if (
        hit.row &&
        !KC.selection.isActive() &&
        !(KC.rangeSelect && KC.rangeSelect.isActive())
      ) {
        longPressTimer = setTimeout(() => {
          if (gesture === "maybe-pan" && !downInfo.moved) {
            triggerLongPress(hit.row);
            suppressNextTap = true;
          }
        }, LONGPRESS_MS);
      }
    } else if (pointers.size === 2) {
      clearLongPressTimer();
      const pts = Array.from(pointers.values());
      pinchStart = {
        dist0: Math.max(1, dist(pts[0], pts[1])),
        mid0: mid(pts[0], pts[1]),
        scale0: view.scale,
        tx0: view.tx,
        ty0: view.ty,
      };
      gesture = "pinch";
      suppressNextTap = true;
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const pos = getLocalPos(e);
    pointers.set(e.pointerId, pos);

    if (gesture === "pinch" && pointers.size >= 2) {
      const gutterW = gutterWidth();
      const pts = Array.from(pointers.values());
      const d = Math.max(1, dist(pts[0], pts[1]));
      const m = mid(pts[0], pts[1]);
      const newScale = clampScale(pinchStart.scale0 * (d / pinchStart.dist0));
      // ピンチ中心のコンテンツ座標を保ったままズーム＋パンを同時に行う
      const anchorContentX =
        (pinchStart.mid0.x - gutterW - pinchStart.tx0) / pinchStart.scale0;
      const anchorContentY =
        (pinchStart.mid0.y - GUTTER_H - pinchStart.ty0) / pinchStart.scale0;
      view.scale = newScale;
      view.tx = m.x - gutterW - anchorContentX * newScale;
      view.ty = m.y - GUTTER_H - anchorContentY * newScale;
      draw();
      return;
    }

    if (gesture === "maybe-pan" || gesture === "pan") {
      const dx = pos.x - downInfo.start.x;
      const dy = pos.y - downInfo.start.y;
      if (!downInfo.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        downInfo.moved = true;
        gesture = "pan";
        clearLongPressTimer();
      }
      if (gesture === "pan") {
        view.tx = panStart.tx0 + (pos.x - panStart.x);
        view.ty = panStart.ty0 + (pos.y - panStart.y);
        draw();
      }
    }
  }

  function onPointerUp(e) {
    const pos = pointers.get(e.pointerId) || getLocalPos(e);
    pointers.delete(e.pointerId);
    clearLongPressTimer();

    if (gesture === "pinch") {
      if (pointers.size < 2) {
        gesture = pointers.size === 1 ? "maybe-pan" : "none";
        if (pointers.size === 1) {
          const remaining = Array.from(pointers.values())[0];
          panStart = {
            x: remaining.x,
            y: remaining.y,
            tx0: view.tx,
            ty0: view.ty,
          };
          downInfo = { start: remaining, moved: true, uid: null };
        }
      }
      return;
    }

    if (pointers.size === 0) {
      const wasTap = downInfo && !downInfo.moved;
      gesture = "none";
      if (wasTap && !suppressNextTap) {
        handleTap(pos);
      }
      suppressNextTap = false;
      downInfo = null;
    }
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    clearLongPressTimer();
    if (pointers.size === 0) {
      gesture = "none";
      downInfo = null;
      suppressNextTap = false;
    }
  }

  function triggerLongPress(row) {
    if (
      KC.selection.isActive() ||
      (KC.rangeSelect && KC.rangeSelect.isActive())
    )
      return;
    KC.selection.enter();
    KC.selection.toggle(row.uid);
    if (navigator.vibrate) navigator.vibrate(12);
    draw();
  }

  function handleTap(pos) {
    const hit = hitTest(pos.x, pos.y);
    if (!hit.row) return;

    if (KC.rangeSelect && KC.rangeSelect.isActive()) {
      if (!hit.inGutter && hit.valid) {
        KC.rangeSelect.onCellTap(hit.row, hit.col);
      }
      return;
    }

    if (KC.selection.isActive()) {
      KC.selection.toggle(hit.row.uid);
      draw();
      return;
    }
    if (hit.inGutter) {
      KC.bus.emit("openRowSheet", hit.row.uid);
      return;
    }
    if (hit.valid) {
      S.toggleStitch(hit.row, hit.col);
      draw();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const pos = getLocalPos(e);
    const zoomIntensity = 0.0016;
    const factor = Math.exp(-e.deltaY * zoomIntensity);
    const newScale = clampScale(view.scale * factor);
    const gutterW = gutterWidth();
    const contentX = (pos.x - gutterW - view.tx) / view.scale;
    const contentY = (pos.y - GUTTER_H - view.ty) / view.scale;
    view.scale = newScale;
    view.tx = pos.x - gutterW - contentX * newScale;
    view.ty = pos.y - GUTTER_H - contentY * newScale;
    draw();
  }

  function resetView() {
    fitted = false;
    fitToWidth();
    draw();
  }

  function init() {
    viewport = document.getElementById("grid-viewport");
    canvas = document.getElementById("grid-canvas");
    ctx = canvas.getContext("2d");

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerCancel);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    new ResizeObserver(resizeCanvas).observe(viewport);

    KC.bus.on("rowsChanged", () => draw());
    KC.bus.on("selectionChanged", () => draw());
    KC.bus.on("rangeSelectionChanged", () => draw());
    KC.bus.on("sizeChanged", () => resetView());
    KC.bus.on("dataReplaced", () => resetView());

    resizeCanvas();
  }

  KC.grid = { init, draw, resetView };
})(window.KC);
