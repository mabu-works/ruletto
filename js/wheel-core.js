"use strict";

// ============================================================
// 🧮 ルーレットの純粋ロジック（DOM に触れない部分）
// ============================================================
// 項目・色・ラベル寸法・当選判定・共有リンク符号化・保存データの
// 変換だけをここに集める。ブラウザでは app.js より先に読み込まれて
// グローバル `RulettoCore` になり、Node では require してテストできる。

const RulettoCore = (() => {
  const TAU = Math.PI * 2;

  // 🎨 セグメントの色（12 色を項目順に循環させる）
  const PALETTE = [
    "#f03e3e", "#f76707", "#f59f00", "#37b24d", "#0ca678",
    "#1098ad", "#1c7ed6", "#7048e8", "#a61e4d", "#e67700",
    "#2f9e44", "#1971c2"
  ];

  const MAX_ITEMS = 50;      // 項目の上限（クラス全員分を想定）
  const MAX_HISTORY = 20;    // 履歴の保持件数
  const MAX_ITEM_LENGTH = 30; // 1 項目の最大文字数
  const DATA_KEY = "ruletto-data";
  const THEME_KEY = "ruletto-theme";
  const DEFAULT_ITEMS = ["A", "B", "C", "D"];
  const SPIN_DURATION_MS = 4200;

  // 🎁 プリセット（キーは共有リンクやボタンの data 属性で使う）
  const PRESETS = {
    dinner: ["カレー", "ラーメン", "寿司", "焼肉", "パスタ", "唐揚げ", "鍋", "ハンバーグ"],
    punishment: ["一発芸", "モノマネ", "腕立て10回", "変顔で写真", "歌を一曲", "早口言葉", "ジュースおごり", "もう一回回す"],
    roles: ["司会", "買い出し", "片付け", "写真係", "盛り上げ役", "記録係"]
  };

  // ----------------------------------------------------------
  // 🎨 色とラベル寸法
  // ----------------------------------------------------------
  function colorForIndex(index) {
    return PALETTE[index % PALETTE.length];
  }

  // 📏 項目数が増えると 1 区画が狭くなるため、省略文字数を段階的に絞る
  function labelMaxChars(count) {
    if (count <= 8) return 10;
    if (count <= 16) return 9;
    if (count <= 24) return 8;
    if (count <= 36) return 7;
    return 6;
  }

  // 📏 フォントサイズも区画数で段階的に縮小する（基準半径 306 = 640px キャンバス時）
  function labelFontSize(count, radius) {
    let base;
    if (count <= 8) base = 24;
    else if (count <= 16) base = 20;
    else if (count <= 24) base = 17;
    else if (count <= 36) base = 14;
    else base = 12;
    const scale = (radius || 306) / 306;
    return Math.max(9, Math.round(base * scale));
  }

  function truncateLabel(text, count) {
    const max = labelMaxChars(count);
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  // ----------------------------------------------------------
  // 🎯 当選判定
  // ----------------------------------------------------------
  // ホイールは第 1 項目が真上（-π/2）から始まり rotation だけ時計回りに回る。
  // 真上のポインタが指す項目は、回転角を 1 周分に正規化して区画幅で割れば出る。
  function winnerIndex(rotation, count) {
    if (count <= 0) return -1;
    const seg = TAU / count;
    const local = ((-rotation) % TAU + TAU) % TAU;
    return Math.floor(local / seg) % count;
  }

  // ----------------------------------------------------------
  // 🔄 回転アニメーションの数式
  // ----------------------------------------------------------
  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  // 追加の回転量: 5〜8 周 + ランダムな 0〜1 周（乱数源は差し替え可能）
  function spinExtraAngle(random) {
    const rand = typeof random === "function" ? random : Math.random;
    return TAU * (5 + rand() * 3) + rand() * TAU;
  }

  // ----------------------------------------------------------
  // ✏️ 項目テキストの解釈
  // ----------------------------------------------------------
  // まとめて編集: 1 行 1 項目、前後の空白を取り、空行を除き、上限と文字数を丸める
  function parseBulkText(text) {
    return String(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .slice(0, MAX_ITEMS)
      .map((line) => line.slice(0, MAX_ITEM_LENGTH));
  }

  // 保存データ・共有リンクからの復元用: 文字列化して文字数だけ丸める（trim はしない）
  function sanitizeItems(list) {
    return list.map((value) => String(value).slice(0, MAX_ITEM_LENGTH));
  }

  function isUsableItemList(list) {
    return Array.isArray(list) && list.length >= 1 && list.length <= MAX_ITEMS;
  }

  // ----------------------------------------------------------
  // 🔗 共有リンク（URL ハッシュ）
  // ----------------------------------------------------------
  // 設定 JSON を UTF-8 バイト列にして Base64URL 化する（日本語を安全に運ぶため）
  function encodeShareHash(items) {
    const json = JSON.stringify({ items });
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // 復号できて項目リストとして妥当なら項目配列を、だめなら null を返す
  function decodeShareHash(hash) {
    try {
      const base64 = String(hash).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (isUsableItemList(data && data.items)) {
        return sanitizeItems(data.items);
      }
    } catch (err) { /* 壊れたハッシュは無視する */ }
    return null;
  }

  // ----------------------------------------------------------
  // 💾 自動保存データ（localStorage キー: ruletto-data）
  // ----------------------------------------------------------
  // 履歴の時刻は ISO 文字列にして JSON 化する
  function serializeSavedData(items, lastResult, history) {
    return JSON.stringify({
      items,
      lastResult,
      history: history.map((entry) => ({
        label: entry.label,
        time: (entry.time instanceof Date ? entry.time : new Date(entry.time)).toISOString()
      }))
    });
  }

  // 保存文字列を検証しながら読み戻す。妥当でなければ null。
  // 時刻が解釈できない履歴は fallbackTime（通常は現在時刻）で補う。
  function parseSavedData(raw, fallbackTime) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return null;
    }
    if (!data || !isUsableItemList(data.items)) return null;

    const fallback = fallbackTime instanceof Date ? fallbackTime : new Date();
    let history = [];
    if (Array.isArray(data.history)) {
      history = data.history
        .filter((entry) => entry && typeof entry.label === "string")
        .slice(0, MAX_HISTORY)
        .map((entry) => {
          const parsed = new Date(entry.time);
          return { label: entry.label, time: isNaN(parsed.getTime()) ? fallback : parsed };
        });
    }
    return {
      items: sanitizeItems(data.items),
      lastResult: typeof data.lastResult === "string" ? data.lastResult : null,
      history
    };
  }

  return {
    TAU,
    PALETTE,
    MAX_ITEMS,
    MAX_HISTORY,
    MAX_ITEM_LENGTH,
    DATA_KEY,
    THEME_KEY,
    DEFAULT_ITEMS,
    SPIN_DURATION_MS,
    PRESETS,
    colorForIndex,
    labelMaxChars,
    labelFontSize,
    truncateLabel,
    winnerIndex,
    easeOutQuart,
    spinExtraAngle,
    parseBulkText,
    sanitizeItems,
    isUsableItemList,
    encodeShareHash,
    decodeShareHash,
    serializeSavedData,
    parseSavedData
  };
})();

// 🧪 Node（テスト）からも読み込めるようにする
if (typeof module !== "undefined" && module.exports) {
  module.exports = RulettoCore;
}
