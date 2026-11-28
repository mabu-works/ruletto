"use strict";

// ============================================================
// 🧪 wheel-core の単体テスト（node --test）
// ============================================================
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../js/wheel-core.js");

const TAU = Math.PI * 2;

// ----------------------------------------------------------
// 🎯 当選判定: winnerIndex
// ----------------------------------------------------------
test("winnerIndex: 回転角 0 では第 1 項目が当選する", () => {
  for (const n of [2, 3, 4, 8, 50]) {
    assert.equal(Core.winnerIndex(0, n), 0);
  }
});

test("winnerIndex: 項目数 0 では -1", () => {
  assert.equal(Core.winnerIndex(0, 0), -1);
  assert.equal(Core.winnerIndex(1.23, 0), -1);
});

test("winnerIndex: 区画の中央にポインタが来る回転角で、その区画が選ばれる", () => {
  // 区画 i の中央が真上に来るのは rotation = -(i + 0.5) * seg のとき
  for (const n of [2, 3, 5, 8, 12, 24, 50]) {
    const seg = TAU / n;
    for (let i = 0; i < n; i++) {
      const rotation = -(i + 0.5) * seg;
      assert.equal(Core.winnerIndex(rotation, n), i, `n=${n} i=${i}`);
    }
  }
});

test("winnerIndex: 幾何学的な区画判定と一致する（境界付近を除く）", () => {
  // 独立した照合: ポインタ（真上 = 角度 -π/2）が区画 i の描画範囲
  // [-π/2 + rotation + seg*i, +seg) に入っているかを直接調べる。
  const norm = (a) => ((a % TAU) + TAU) % TAU;
  for (const n of [2, 3, 4, 7, 10, 16, 33, 50]) {
    const seg = TAU / n;
    for (let k = 0; k < 720; k++) {
      const rotation = (k / 720) * TAU * 3 - TAU; // -2π 〜 4π を走査
      const local = norm(-rotation);
      // 境界ちょうど（浮動小数点の同点）は既知事象として照合から外す
      const frac = (local / seg) % 1;
      if (frac < 1e-9 || frac > 1 - 1e-9) continue;
      let expected = -1;
      for (let i = 0; i < n; i++) {
        if (norm(local - seg * i) < seg) { expected = i; break; }
      }
      assert.equal(Core.winnerIndex(rotation, n), expected, `n=${n} rotation=${rotation}`);
    }
  }
});

test("winnerIndex: 2π の整数倍を足しても結果は変わらない", () => {
  for (const n of [4, 9, 50]) {
    for (const rotation of [0.1, 1.7, 3.3, 5.9]) {
      assert.equal(Core.winnerIndex(rotation + TAU * 7, n), Core.winnerIndex(rotation, n));
      assert.equal(Core.winnerIndex(rotation - TAU * 3, n), Core.winnerIndex(rotation, n));
    }
  }
});

test("winnerIndex: 逆回転（負の角）でも範囲内の index を返す", () => {
  for (const n of [2, 50]) {
    for (let k = 0; k < 200; k++) {
      const idx = Core.winnerIndex(-k * 0.37, n);
      assert.ok(idx >= 0 && idx < n, `idx=${idx}`);
    }
  }
});

// ----------------------------------------------------------
// 🔄 回転アニメーション
// ----------------------------------------------------------
test("easeOutQuart: 端点と単調増加", () => {
  assert.equal(Core.easeOutQuart(0), 0);
  assert.equal(Core.easeOutQuart(1), 1);
  let prev = -1;
  for (let k = 0; k <= 20; k++) {
    const v = Core.easeOutQuart(k / 20);
    assert.ok(v > prev, `t=${k / 20}`);
    prev = v;
  }
  // 中点では 1 - (1/2)^4 = 0.9375 まで進む（最初に速く、最後はゆっくり）
  assert.equal(Core.easeOutQuart(0.5), 0.9375);
});

test("spinExtraAngle: 5〜9 周の範囲に収まり、乱数源を差し替えられる", () => {
  assert.equal(Core.spinExtraAngle(() => 0), TAU * 5);
  const nearMax = Core.spinExtraAngle(() => 0.999999);
  assert.ok(nearMax > TAU * 8.9 && nearMax < TAU * 9, `nearMax=${nearMax}`);
  for (let k = 0; k < 500; k++) {
    const extra = Core.spinExtraAngle(Math.random);
    assert.ok(extra >= TAU * 5 && extra < TAU * 9, `extra=${extra}`);
  }
});

test("定数: 回転時間は 4200ms、上限は項目 50 件・履歴 20 件", () => {
  assert.equal(Core.SPIN_DURATION_MS, 4200);
  assert.equal(Core.MAX_ITEMS, 50);
  assert.equal(Core.MAX_HISTORY, 20);
  assert.equal(Core.DATA_KEY, "ruletto-data");
  assert.equal(Core.THEME_KEY, "ruletto-theme");
});

// ----------------------------------------------------------
// 🎨 色とラベル
// ----------------------------------------------------------
test("PALETTE: 12 色で、index の循環で割り当てる", () => {
  assert.equal(Core.PALETTE.length, 12);
  assert.equal(Core.PALETTE[0], "#f03e3e");
  assert.equal(Core.PALETTE[11], "#1971c2");
  assert.equal(Core.colorForIndex(0), Core.PALETTE[0]);
  assert.equal(Core.colorForIndex(12), Core.PALETTE[0]);
  assert.equal(Core.colorForIndex(25), Core.PALETTE[1]);
  for (const color of Core.PALETTE) {
    assert.match(color, /^#[0-9a-f]{6}$/);
  }
});

test("labelMaxChars: 区画数での段階（境界値）", () => {
  const cases = [[1, 10], [8, 10], [9, 9], [16, 9], [17, 8], [24, 8], [25, 7], [36, 7], [37, 6], [50, 6]];
  for (const [n, expected] of cases) {
    assert.equal(Core.labelMaxChars(n), expected, `n=${n}`);
  }
});

test("labelFontSize: 区画数での段階と半径スケール、最小 9px", () => {
  assert.equal(Core.labelFontSize(8, 306), 24);
  assert.equal(Core.labelFontSize(9, 306), 20);
  assert.equal(Core.labelFontSize(16, 306), 20);
  assert.equal(Core.labelFontSize(17, 306), 17);
  assert.equal(Core.labelFontSize(24, 306), 17);
  assert.equal(Core.labelFontSize(25, 306), 14);
  assert.equal(Core.labelFontSize(36, 306), 14);
  assert.equal(Core.labelFontSize(37, 306), 12);
  assert.equal(Core.labelFontSize(50, 306), 12);
  // 半径が半分ならフォントもほぼ半分、半径省略時は基準 306
  assert.equal(Core.labelFontSize(8, 153), 12);
  assert.equal(Core.labelFontSize(8), 24);
  // 小さい半径でも 9px を下回らない
  assert.equal(Core.labelFontSize(50, 10), 9);
});

test("truncateLabel: 上限以下はそのまま、超えたら省略記号を付ける", () => {
  assert.equal(Core.truncateLabel("短い", 4), "短い");
  assert.equal(Core.truncateLabel("1234567890", 8), "1234567890"); // ちょうど上限
  assert.equal(Core.truncateLabel("12345678901", 8), "1234567890…"); // 上限 10 文字 + …
  assert.equal(Core.truncateLabel("あいうえおかきくけこさ", 50), "あいうえおか…"); // 50 件時は 6 文字
});

// ----------------------------------------------------------
// ✏️ 項目テキストの解釈
// ----------------------------------------------------------
test("parseBulkText: 1 行 1 項目、空白行と前後空白を除く", () => {
  assert.deepEqual(Core.parseBulkText("  A \n\nB\r\n C \n"), ["A", "B", "C"]);
  assert.deepEqual(Core.parseBulkText(""), []);
  assert.deepEqual(Core.parseBulkText("\n \n"), []);
});

test("parseBulkText: 50 件で切り、1 項目は 30 文字に丸める", () => {
  const lines = Array.from({ length: 60 }, (_, i) => "項目" + (i + 1)).join("\n");
  const parsed = Core.parseBulkText(lines);
  assert.equal(parsed.length, 50);
  assert.equal(parsed[49], "項目50");
  assert.deepEqual(Core.parseBulkText("あ".repeat(40)), ["あ".repeat(30)]);
});

test("PRESETS: 3 種の内容が従来どおり", () => {
  assert.deepEqual(Core.PRESETS.dinner, ["カレー", "ラーメン", "寿司", "焼肉", "パスタ", "唐揚げ", "鍋", "ハンバーグ"]);
  assert.deepEqual(Core.PRESETS.punishment, ["一発芸", "モノマネ", "腕立て10回", "変顔で写真", "歌を一曲", "早口言葉", "ジュースおごり", "もう一回回す"]);
  assert.deepEqual(Core.PRESETS.roles, ["司会", "買い出し", "片付け", "写真係", "盛り上げ役", "記録係"]);
  assert.deepEqual(Core.DEFAULT_ITEMS, ["A", "B", "C", "D"]);
});

// ----------------------------------------------------------
// 🔗 共有リンク
// ----------------------------------------------------------
test("共有リンク: 日本語を含む項目が往復で戻る", () => {
  const items = ["カレー", "ラーメン", "寿司 🍣", "A&B", "a+b/c=?"];
  const hash = Core.encodeShareHash(items);
  assert.match(hash, /^[A-Za-z0-9_-]+$/); // Base64URL（= パディングなし）
  assert.deepEqual(Core.decodeShareHash(hash), items);
});

test("共有リンク: 壊れたハッシュや不正な項目数は null", () => {
  assert.equal(Core.decodeShareHash("!!!not-base64!!!"), null);
  assert.equal(Core.decodeShareHash(""), null);
  const encodeRaw = (obj) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  assert.equal(Core.decodeShareHash(encodeRaw({ items: [] })), null); // 0 件は受理しない
  assert.equal(Core.decodeShareHash(encodeRaw({ items: Array(51).fill("x") })), null); // 51 件は受理しない
  assert.equal(Core.decodeShareHash(encodeRaw({ items: "abc" })), null);
  assert.equal(Core.decodeShareHash(encodeRaw({ foo: 1 })), null);
  assert.deepEqual(Core.decodeShareHash(encodeRaw({ items: Array(50).fill("x") })).length, 50);
});

test("共有リンク: 復元時に文字列化と 30 文字丸めがかかる", () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ items: [123, "あ".repeat(40)] }));
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  const hash = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.deepEqual(Core.decodeShareHash(hash), ["123", "あ".repeat(30)]);
});

// ----------------------------------------------------------
// 💾 保存データ
// ----------------------------------------------------------
test("保存データ: 往復で項目・結果・履歴が戻る（時刻は ISO 文字列経由）", () => {
  const time = new Date("2026-11-28T10:20:30.000Z");
  const json = Core.serializeSavedData(["A", "B"], "B", [{ label: "B", time }]);
  const parsed = JSON.parse(json);
  assert.deepEqual(Object.keys(parsed), ["items", "lastResult", "history"]);
  assert.equal(parsed.history[0].time, "2026-11-28T10:20:30.000Z");

  const restored = Core.parseSavedData(json, new Date());
  assert.deepEqual(restored.items, ["A", "B"]);
  assert.equal(restored.lastResult, "B");
  assert.equal(restored.history.length, 1);
  assert.equal(restored.history[0].label, "B");
  assert.equal(restored.history[0].time.getTime(), time.getTime());
});

test("保存データ: 壊れた JSON・項目数不正は null", () => {
  const now = new Date();
  assert.equal(Core.parseSavedData("{oops", now), null);
  assert.equal(Core.parseSavedData("null", now), null);
  assert.equal(Core.parseSavedData(JSON.stringify({ items: [] }), now), null);
  assert.equal(Core.parseSavedData(JSON.stringify({ items: Array(51).fill("x") }), now), null);
  assert.equal(Core.parseSavedData(JSON.stringify({ items: "AB" }), now), null);
});

test("保存データ: lastResult が文字列でなければ null、履歴は整形される", () => {
  const fallback = new Date("2026-01-01T00:00:00.000Z");
  const raw = JSON.stringify({
    items: ["X", 42, "あ".repeat(40)],
    lastResult: 123,
    history: [
      { label: "X", time: "2026-11-28T01:02:03.000Z" },
      { label: 99, time: "2026-11-28T01:02:03.000Z" }, // ラベルが文字列でないので除外
      { label: "Y", time: "not-a-date" },               // 時刻不正は fallback で補う
      null
    ]
  });
  const restored = Core.parseSavedData(raw, fallback);
  assert.deepEqual(restored.items, ["X", "42", "あ".repeat(30)]);
  assert.equal(restored.lastResult, null);
  assert.equal(restored.history.length, 2);
  assert.equal(restored.history[0].time.toISOString(), "2026-11-28T01:02:03.000Z");
  assert.equal(restored.history[1].time.getTime(), fallback.getTime());
});

test("保存データ: 履歴は最新 20 件まで、history キーが無ければ空", () => {
  const many = {
    items: ["A"],
    lastResult: null,
    history: Array.from({ length: 25 }, (_, i) => ({ label: "h" + i, time: "2026-11-28T00:00:00.000Z" }))
  };
  const restored = Core.parseSavedData(JSON.stringify(many), new Date());
  assert.equal(restored.history.length, 20);
  assert.equal(restored.history[0].label, "h0");

  const noHistory = Core.parseSavedData(JSON.stringify({ items: ["A"], lastResult: "A" }), new Date());
  assert.deepEqual(noHistory.history, []);
  assert.equal(noHistory.lastResult, "A");
});

test("保存データ: 時刻が Date でない履歴エントリも ISO 化される", () => {
  const json = Core.serializeSavedData(["A"], null, [{ label: "A", time: "2026-11-28T05:06:07.000Z" }]);
  assert.equal(JSON.parse(json).history[0].time, "2026-11-28T05:06:07.000Z");
});
