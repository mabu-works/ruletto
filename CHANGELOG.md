# 📜 更新履歴

更新履歴はこのファイルに記録します。

## v1.0.0（2026-11-28）

### 追加

- 単体テスト（`tests/`、node --test）を追加。当選判定・ラベル段階・共有リンク符号化・保存データ変換を固定。
- Issue / PR テンプレートと CONTRIBUTING.md を追加し、統一開発フロー（Issue → ブランチ → PR → CI → Rebase and merge）を採用。

### 変更

- リポジトリをゼロから再作成（同名で作り直し）。機能・挙動・保存形式（localStorage `ruletto-data`）・共有リンク形式は従来どおり。
- 純粋な計算を `js/wheel-core.js` に分離（ブラウザ挙動は不変）。
- バージョン表記を日付管理から 1.0.0 にリセット。Service Worker のキャッシュ名は ruletto-v1。
- Windows 版 exe を GitHub Release に添付する運用をやめ、各自ビルド（`windows/build.bat` / `build.sh`）に変更。
