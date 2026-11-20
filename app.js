"use strict";

// ===== 定数 =====
const PALETTE = [
  "#f03e3e", "#f76707", "#f59f00", "#37b24d", "#0ca678",
  "#1098ad", "#1c7ed6", "#7048e8", "#a61e4d", "#e67700",
  "#2f9e44", "#1971c2"
];
const MAX_ITEMS = 50;
const MAX_HISTORY = 20;
const DATA_KEY = "ruletto-data";
const PRESETS = {
  dinner: ["カレー", "ラーメン", "寿司", "焼肉", "パスタ", "唐揚げ", "鍋", "ハンバーグ"],
  punishment: ["一発芸", "モノマネ", "腕立て10回", "変顔で写真", "歌を一曲", "早口言葉", "ジュースおごり", "もう一回回す"],
  roles: ["司会", "買い出し", "片付け", "写真係", "盛り上げ役", "記録係"]
};

// ===== 状態 =====
let items = ["A", "B", "C", "D"];
let rotation = 0; // 現在の回転角（ラジアン、0=第1項目が真上から開始）
let spinning = false;
let lastResult = null;
let history = []; // {label, time}

// ===== DOM =====
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

// ===== ホイールラベル（区画数に応じて段階的に縮小） =====
// 50件では1区画が狭くなるため、フォントサイズと省略文字数を区画数で切り替える。
// 判読限界がある前提で、項目リスト表示と当選結果の大きな表示は従来どおり維持する。
function labelMaxChars(n) {
  if (n <= 8) return 10;
  if (n <= 16) return 9;
  if (n <= 24) return 8;
  if (n <= 36) return 7;
  return 6;
}
function labelFontSize(n, R) {
  let base;
  if (n <= 8) base = 24;
  else if (n <= 16) base = 20;
  else if (n <= 24) base = 17;
  else if (n <= 36) base = 14;
  else base = 12;
  const scale = (R || 306) / 306; // 基準半径306（640キャンバス時）で換算
  return Math.max(9, Math.round(base * scale));
}
function truncateLabel(text, n) {
  const max = labelMaxChars(n);
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// ===== ホイール描画 =====
function drawWheel() {
  const w = canvas.width;
  const cx = w / 2;
  const cy = w / 2;
  const R = w / 2 - 14;
  const n = items.length;
  ctx.clearRect(0, 0, w, w);

  if (n === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#ccc";
    ctx.fill();
    return;
  }

  const seg = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const start = -Math.PI / 2 + rotation + seg * i;
    const end = start + seg;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, start, end);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // ラベル（半径方向に沿って配置）
    const mid = start + seg / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "bold " + labelFontSize(n, R) + "px sans-serif";
    const label = truncateLabel(items[i], n);
    ctx.fillText(label, R - 12, 0, R * 0.62);
    ctx.restore();
  }

  // 中心円
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.stroke();
  ctx.fillStyle = "#e8590c";
  ctx.font = "bold " + Math.round(R * 0.11) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("回す", cx, cy);

  // ポインタ（真上の三角）
  ctx.beginPath();
  ctx.moveTo(cx - 16, 2);
  ctx.lineTo(cx + 16, 2);
  ctx.lineTo(cx, 30);
  ctx.closePath();
  ctx.fillStyle = "#212529";
  ctx.fill();
}

// 真上のポインタが指す項目の index
function winnerIndex() {
  const n = items.length;
  if (n === 0) return -1;
  const seg = (Math.PI * 2) / n;
  const local = ((-rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(local / seg) % n;
}

// ===== 回転アニメーション =====
function spin() {
  if (spinning || items.length < 2) {
    if (items.length < 2) {
      winnerDisplay.textContent = "項目を2つ以上入れてください";
    }
    return;
  }
  spinning = true;
  spinBtn.disabled = true;
  copyResultBtn.disabled = true;
  copyMsg.textContent = "";
  winnerDisplay.textContent = "回転中…";

  const startRotation = rotation;
  const extra = Math.PI * 2 * (5 + Math.random() * 3) + Math.random() * Math.PI * 2;
  const target = startRotation + extra;
  const duration = 4200;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
    rotation = startRotation + (target - startRotation) * eased;
    drawWheel();
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      rotation = target % (Math.PI * 2);
      drawWheel();
      spinning = false;
      spinBtn.disabled = false;
      finishSpin();
    }
  }
  requestAnimationFrame(frame);
}

function finishSpin() {
  const idx = winnerIndex();
  if (idx < 0) return;
  lastResult = items[idx];
  winnerDisplay.textContent = "🎉 " + lastResult;
  copyResultBtn.disabled = false;
  history.unshift({ label: lastResult, time: new Date() });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  renderHistory();
  renderPrintArea();
  saveData();
}

spinBtn.addEventListener("click", spin);
canvas.addEventListener("click", spin);

// ===== 自動保存（localStorage、キー: ruletto-data） =====
// 項目リストと主要な設定（最後の結果・履歴）を入力が変わるたびに保存し、再訪時に復元する。
// テーマキー ruletto-theme とは別キーで衝突しない。共有リンク（URLハッシュ）がある場合はそちらを優先する。
function saveData() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify({
      items,
      lastResult,
      history: history.map((h) => ({
        label: h.label,
        time: (h.time instanceof Date ? h.time : new Date(h.time)).toISOString()
      }))
    }));
  } catch (e) { /* 保存できない環境では自動保存なしで動作する */ }
}

function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > MAX_ITEMS) return false;
    items = data.items.map((s) => String(s).slice(0, 30));
    lastResult = typeof data.lastResult === "string" ? data.lastResult : null;
    if (Array.isArray(data.history)) {
      history = data.history
        .filter((h) => h && typeof h.label === "string")
        .slice(0, MAX_HISTORY)
        .map((h) => {
          const t = new Date(h.time);
          return { label: h.label, time: isNaN(t.getTime()) ? new Date() : t };
        });
    }
    return true;
  } catch (e) { /* 壊れた保存データは無視する */ }
  return false;
}

// ===== 印刷用エリア（項目一覧と当選結果のみを紙面に出す） =====
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
    try { window.print(); } catch (e) { /* 印刷が使えない環境では何もしない */ }
  });
}

// ===== 履歴 =====
function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  history.forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h.label;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = h.time.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.appendChild(time);
    list.appendChild(li);
  });
  $("historyEmpty").style.display = history.length ? "none" : "";
}

// ===== 項目編集 =====
function renderItems() {
  itemsList.innerHTML = "";
  items.forEach((value, i) => {
    const row = document.createElement("div");
    row.className = "edit-row";

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = PALETTE[i % PALETTE.length];

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.maxLength = 30;
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
  $("addItemBtn").disabled = items.length >= MAX_ITEMS;
  renderPrintArea();
}

function syncBulk() {
  bulkArea.value = items.join("\n");
}

$("addItemBtn").addEventListener("click", () => {
  if (items.length >= MAX_ITEMS) return;
  items.push("項目" + (items.length + 1));
  renderItems();
  drawWheel();
  syncBulk();
  saveData();
});

$("applyBulkBtn").addEventListener("click", () => {
  const lines = bulkArea.value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== "");
  if (lines.length === 0) return;
  items = lines.slice(0, MAX_ITEMS).map((s) => s.slice(0, 30));
  renderItems();
  drawWheel();
  syncBulk();
  saveData();
});

// ===== 保存データの消去（初期化） =====
$("clearDataBtn").addEventListener("click", () => {
  try { localStorage.removeItem(DATA_KEY); } catch (e) { /* 消去できない環境でも初期化は行う */ }
  items = ["A", "B", "C", "D"];
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

// ===== プリセット =====
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = PRESETS[btn.dataset.preset];
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

// ===== 結果コピー =====
copyResultBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  const text = "ルーレットの結果：" + lastResult;
  try {
    await navigator.clipboard.writeText(text);
    copyMsg.textContent = "結果をコピーしました。";
  } catch (e) {
    copyMsg.textContent = text;
  }
});

// ===== 共有リンク（URLハッシュ） =====
function encodeState() {
  const data = JSON.stringify({ items });
  const bytes = new TextEncoder().encode(data);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(hash) {
  try {
    const b64 = hash.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(data.items) && data.items.length >= 1 && data.items.length <= MAX_ITEMS) {
      items = data.items.map((s) => String(s).slice(0, 30));
      return true;
    }
  } catch (e) { /* 壊れたハッシュは無視 */ }
  return false;
}

$("shareBtn").addEventListener("click", async () => {
  const url = location.origin + location.pathname + "#" + encodeState();
  try {
    await navigator.clipboard.writeText(url);
    shareMsg.textContent = "共有リンクをコピーしました。";
  } catch (e) {
    shareMsg.textContent = "コピーできませんでした。URL: " + url;
  }
});

// ===== 初期化 =====
// 復元の優先順位：共有リンク（URLハッシュ）＞ 自動保存データ（ruletto-data）
let restoredFromHash = false;
if (location.hash.length > 1) {
  restoredFromHash = decodeState(location.hash.slice(1));
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

// ===== テーマ切り替え（見た目のみ・ルーレットの動作には影響しない） =====
(function initTheme() {
  var root = document.documentElement;
  if (!root || !root.getAttribute || !root.setAttribute) return;
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  }
  var current = root.getAttribute("data-theme");
  if (current !== "light" && current !== "dark") {
    try { current = localStorage.getItem("ruletto-theme"); } catch (e) { current = null; }
  }
  apply(current === "light" ? "light" : "dark");
  var btn = document.getElementById("themeToggle");
  if (btn && btn.addEventListener) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem("ruletto-theme", next); } catch (e) { /* 保存できなくても切り替え自体は有効 */ }
    });
  }
})();
