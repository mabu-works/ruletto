"use strict";

// ============================================================
// 🎡 ルレット 本体（画面とホイール描画・回転の制御）
// ============================================================
// 純粋な計算は js/wheel-core.js（RulettoCore）に寄せ、ここは
// DOM の読み書きと Canvas 描画、アニメーション駆動に専念する。

const Core = RulettoCore;

// ============================================================
// 📊 状態
// ============================================================
let items = Core.DEFAULT_ITEMS.slice();
let rotation = 0; // 現在の回転角（ラジアン。0 = 第 1 項目が真上から開始）
let spinning = false;
let lastResult = null;
let history = []; // {label, time: Date}、新しいものが先頭

// ============================================================
// 🧩 DOM
// ============================================================
const $ = (id) => document.getElementById(id);
const canvas = $("wheelCanvas");
const ctx = canvas.getContext("2d");
const itemsList = $("itemsList");
const bulkArea = $("bulkArea");
const winnerDisplay = $("winnerDisplay");
const spinBtn = $("spinBtn");
const copyResultBtn = $("copyResultBtn");
const copyMsg = $("copyMsg");
const shareMsg = $("shareMsg");
const printBtn = $("printBtn");
const printItemsList = $("printItemsList");
const printResult = $("printResult");
const dataMsg = $("dataMsg");

// ============================================================
// 🎨 ホイール描画
// ============================================================
function drawWheel() {
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 14;
  const count = items.length;
  ctx.clearRect(0, 0, size, size);

  if (count === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Core.TAU);
    ctx.fillStyle = "#ccc";
    ctx.fill();
    return;
  }

  const seg = Core.TAU / count;
  for (let i = 0; i < count; i++) {
    const start = -Math.PI / 2 + rotation + seg * i;
    const end = start + seg;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = Core.colorForIndex(i);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 🏷️ ラベルは区画の中央方向へ回して、半径方向に沿わせる
    const mid = start + seg / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "bold " + Core.labelFontSize(count, radius) + "px sans-serif";
    ctx.fillText(Core.truncateLabel(items[i], count), radius - 12, 0, radius * 0.62);
    ctx.restore();
  }

  // ⭕ 中心円（押せる場所の目印に「回す」の文字を置く）
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.16, 0, Core.TAU);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.stroke();
  ctx.fillStyle = "#e8590c";
  ctx.font = "bold " + Math.round(radius * 0.11) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("回す", cx, cy);

  // 🔻 真上のポインタ（当選区画の目印）
  ctx.beginPath();
  ctx.moveTo(cx - 16, 2);
  ctx.lineTo(cx + 16, 2);
  ctx.lineTo(cx, 30);
  ctx.closePath();
  ctx.fillStyle = "#212529";
  ctx.fill();
}

// ============================================================
// 🔄 回転アニメーション
// ============================================================
function spin() {
  if (spinning) return;
  if (items.length < 2) {
    winnerDisplay.textContent = "項目を2つ以上入れてください";
    return;
  }
  spinning = true;
  spinBtn.disabled = true;
  copyResultBtn.disabled = true;
  copyMsg.textContent = "";
  winnerDisplay.textContent = "回転中…";

  const startRotation = rotation;
  const target = startRotation + Core.spinExtraAngle(Math.random);
  const startedAt = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startedAt) / Core.SPIN_DURATION_MS);
    rotation = startRotation + (target - startRotation) * Core.easeOutQuart(t);
    drawWheel();
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      rotation = target % Core.TAU;
      drawWheel();
      spinning = false;
      spinBtn.disabled = false;
      finishSpin();
    }
  }
  requestAnimationFrame(frame);
}

function finishSpin() {
  const index = Core.winnerIndex(rotation, items.length);
  if (index < 0) return;
  lastResult = items[index];
  winnerDisplay.textContent = "🎉 " + lastResult;
  copyResultBtn.disabled = false;
  history.unshift({ label: lastResult, time: new Date() });
  if (history.length > Core.MAX_HISTORY) history.length = Core.MAX_HISTORY;
  renderHistory();
  renderPrintArea();
  saveData();
}

spinBtn.addEventListener("click", spin);
canvas.addEventListener("click", spin);

// ============================================================
// 💾 自動保存（localStorage、キー: ruletto-data）
// ============================================================
// 項目・最後の結果・履歴を入力のたびに保存し、再訪時に復元する。
// テーマ保存のキー（ruletto-theme）とは分けてある。
// 復元の優先順位は 共有リンク（URL ハッシュ）＞ 自動保存データ。
function saveData() {
  try {
    localStorage.setItem(Core.DATA_KEY, Core.serializeSavedData(items, lastResult, history));
  } catch (err) { /* 保存できない環境では自動保存なしで動く */ }
}

function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(Core.DATA_KEY);
  } catch (err) { /* 読めない環境では初期項目で開く */ }
  if (!raw) return false;
  const data = Core.parseSavedData(raw, new Date());
  if (!data) return false;
  items = data.items;
  lastResult = data.lastResult;
  history = data.history;
  return true;
}

// ============================================================
// 🖨️ 印刷用エリア（項目一覧と当選結果だけを紙面に出す）
// ============================================================
function renderPrintArea() {
  if (!printItemsList || !printResult) return;
  printItemsList.innerHTML = "";
  items.forEach((value) => {
    const li = document.createElement("li");
    li.textContent = value;
    printItemsList.appendChild(li);
  });
  printResult.textContent = lastResult ? "当選結果：" + lastResult : "当選結果：まだ回していません";
}

if (printBtn) {
  printBtn.addEventListener("click", () => {
    renderPrintArea();
    try { window.print(); } catch (err) { /* 印刷できない環境では何もしない */ }
  });
}

// ============================================================
// 📜 履歴
// ============================================================
function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  history.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry.label;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = entry.time.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.appendChild(time);
    list.appendChild(li);
  });
  $("historyEmpty").style.display = history.length ? "none" : "";
}

// ============================================================
// ✏️ 項目編集
// ============================================================
function renderItems() {
  itemsList.innerHTML = "";
  items.forEach((value, i) => {
    const row = document.createElement("div");
    row.className = "edit-row";

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = Core.colorForIndex(i);

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.maxLength = Core.MAX_ITEM_LENGTH;
    input.addEventListener("input", () => {
      items[i] = input.value;
      drawWheel();
      syncBulk();
      renderPrintArea();
      saveData();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-del";
    del.textContent = "削除";
    del.disabled = items.length <= 1;
    del.addEventListener("click", () => {
      items.splice(i, 1);
      renderItems();
      drawWheel();
      syncBulk();
      saveData();
    });

    row.appendChild(dot);
    row.appendChild(input);
    row.appendChild(del);
    itemsList.appendChild(row);
  });
  $("itemCount").textContent = String(items.length);
  $("addItemBtn").disabled = items.length >= Core.MAX_ITEMS;
  renderPrintArea();
}

function syncBulk() {
  bulkArea.value = items.join("\n");
}

$("addItemBtn").addEventListener("click", () => {
  if (items.length >= Core.MAX_ITEMS) return;
  items.push("項目" + (items.length + 1));
  renderItems();
  drawWheel();
  syncBulk();
  saveData();
});

$("applyBulkBtn").addEventListener("click", () => {
  const parsed = Core.parseBulkText(bulkArea.value);
  if (parsed.length === 0) return;
  items = parsed;
  renderItems();
  drawWheel();
  syncBulk();
  saveData();
});

// ============================================================
// 🧹 保存データの消去（初期化）
// ============================================================
$("clearDataBtn").addEventListener("click", () => {
  try { localStorage.removeItem(Core.DATA_KEY); } catch (err) { /* 消せない環境でも初期化は行う */ }
  items = Core.DEFAULT_ITEMS.slice();
  lastResult = null;
  history = [];
  copyResultBtn.disabled = true;
  winnerDisplay.textContent = "項目を入れて「回す」を押してね";
  renderItems();
  drawWheel();
  syncBulk();
  renderHistory();
  if (dataMsg) dataMsg.textContent = "保存データを消去し、初期項目に戻しました。";
});

// ============================================================
// 🎁 プリセット
// ============================================================
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = Core.PRESETS[btn.dataset.preset];
    if (!preset) return;
    items = preset.slice();
    lastResult = null;
    renderItems();
    drawWheel();
    syncBulk();
    winnerDisplay.textContent = "プリセットをセットしました。「回す」を押してね";
    copyResultBtn.disabled = true;
    saveData();
  });
});

// ============================================================
// 📋 結果コピー
// ============================================================
copyResultBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  const text = "ルーレットの結果：" + lastResult;
  try {
    await navigator.clipboard.writeText(text);
    copyMsg.textContent = "結果をコピーしました。";
  } catch (err) {
    copyMsg.textContent = text;
  }
});

// ============================================================
// 🔗 共有リンク（URL ハッシュ）
// ============================================================
$("shareBtn").addEventListener("click", async () => {
  const url = location.origin + location.pathname + "#" + Core.encodeShareHash(items);
  try {
    await navigator.clipboard.writeText(url);
    shareMsg.textContent = "共有リンクをコピーしました。";
  } catch (err) {
    shareMsg.textContent = "コピーできませんでした。URL: " + url;
  }
});

// ============================================================
// 🚀 初期化
// ============================================================
let restoredFromHash = false;
if (location.hash.length > 1) {
  const shared = Core.decodeShareHash(location.hash.slice(1));
  if (shared) {
    items = shared;
    restoredFromHash = true;
  }
}
if (!restoredFromHash && loadData() && lastResult) {
  winnerDisplay.textContent = "🎉 " + lastResult;
  copyResultBtn.disabled = false;
}
renderItems();
drawWheel();
syncBulk();
renderHistory();
renderPrintArea();

// ============================================================
// 🌙 テーマ切り替え（見た目のみ。ルーレットの動作には影響しない）
// ============================================================
(function initTheme() {
  const root = document.documentElement;
  if (!root || !root.getAttribute || !root.setAttribute) return;

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  }

  let current = root.getAttribute("data-theme");
  if (current !== "light" && current !== "dark") {
    try { current = localStorage.getItem(Core.THEME_KEY); } catch (err) { current = null; }
  }
  apply(current === "light" ? "light" : "dark");

  const btn = document.getElementById("themeToggle");
  if (btn && btn.addEventListener) {
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem(Core.THEME_KEY, next); } catch (err) { /* 保存できなくても切り替えは有効 */ }
    });
  }
})();
