#!/usr/bin/env bash
# ルレット for Windows - ビルド（Linux / この開発環境用）
# publish して単一ファイル exe を生成し、成果物パスを表示する。
set -euo pipefail
cd "$(dirname "$0")"

DOTNET="${DOTNET:-$HOME/workspace/tools/dotnet/dotnet}"
export TMPDIR="${TMPDIR:-$HOME/workspace/.tmp-dotnet}"
mkdir -p "$TMPDIR"
export TAR_OPTIONS=--no-same-owner

"$DOTNET" publish Ruletto.csproj -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true \
  -p:RestoreSources="$HOME/workspace/tools/nuget-local" -o dist

echo "===== 完了 ====="
echo "成果物: $(pwd)/dist/Ruletto.exe"
ls -la dist/Ruletto.exe
