#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DASHBOARD_DIR="$PKG_ROOT/dashboard"
DIST_DASHBOARD="$PKG_ROOT/dist/dashboard"

echo "=== Building zigrix dashboard ==="

# 1. dashboard 의존성 설치
echo "📦 Installing dashboard dependencies..."
if [ -f "$DASHBOARD_DIR/package-lock.json" ]; then
  (cd "$DASHBOARD_DIR" && npm ci --no-fund --no-audit)
else
  (cd "$DASHBOARD_DIR" && npm install --no-fund --no-audit)
fi

# 2. Next.js 빌드 (output: standalone)
# IMPORTANT: invoke next directly via node to guarantee correct binary resolution.
# npm --prefix / npm run in nested lifecycle contexts (prepack → build:dashboard)
# does NOT reliably add dashboard/node_modules/.bin to PATH on all CI runners.
echo "🔨 Building Next.js (standalone)..."
(cd "$DASHBOARD_DIR" && node node_modules/next/dist/bin/next build)

# 3. 기존 dist/dashboard 정리
rm -rf "$DIST_DASHBOARD"
mkdir -p "$DIST_DASHBOARD"

# 4. standalone 출력 복사
# Next.js standalone은 앱 경로를 반영한 서브디렉토리 구조로 생성됨.
# dashboard/ 앱의 server.js 위치: standalone/dashboard/server.js
# → standalone/dashboard/ 내용을 dist/dashboard/로 직접 복사하여
#   dist/dashboard/server.js 경로를 보장함.
echo "📋 Copying standalone output..."
STANDALONE_APP_DIR="$DASHBOARD_DIR/.next/standalone/dashboard"
if [ -f "$STANDALONE_APP_DIR/server.js" ]; then
  # 서브디렉토리 구조인 경우 (일반적)
  cp -r "$STANDALONE_APP_DIR/." "$DIST_DASHBOARD/"
else
  # 루트에 server.js가 있는 경우 (flat 구조)
  cp -r "$DASHBOARD_DIR/.next/standalone/." "$DIST_DASHBOARD/"
fi

# 5. static 파일 복사 (standalone에 포함 안 됨)
mkdir -p "$DIST_DASHBOARD/.next/static"
cp -r "$DASHBOARD_DIR/.next/static/." "$DIST_DASHBOARD/.next/static/"

# 6. public 디렉토리 복사 (있으면)
if [ -d "$DASHBOARD_DIR/public" ]; then
  cp -r "$DASHBOARD_DIR/public/." "$DIST_DASHBOARD/public/"
fi

echo "✅ Dashboard built → dist/dashboard/"
