#!/bin/bash
# Zadv health check — cek apakah app jalan dengan benar.
# Usage: ./scripts/health-check.sh [BASE_URL]
# Default URL: http://localhost:3000

set -euo pipefail

BASE="${1:-http://localhost:3000}"
PASS="${ADMIN_PASSWORD:-417013ee}"

echo "═══ Zadv Health Check ═══"
echo "URL: $BASE"
echo ""

# 1. Health endpoint
echo -n "[1/4] /api/health ... "
HEALTH=$(curl -sf "$BASE/api/health" 2>/dev/null || echo "FAIL")
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo "✅ OK"
else
  echo "❌ FAIL"
  echo "    Response: $HEALTH"
  exit 1
fi

# 2. Login
echo -n "[2/4] /api/auth/login ... "
COOKIE_FILE=$(mktemp)
LOGIN=$(curl -sf -c "$COOKIE_FILE" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$PASS\"}" 2>/dev/null || echo "FAIL")
if echo "$LOGIN" | grep -q '"ok":true'; then
  echo "✅ OK"
else
  echo "❌ FAIL"
  echo "    Response: $LOGIN"
  rm -f "$COOKIE_FILE"
  exit 1
fi

# 3. Apps list
echo -n "[3/4] /api/apps (auth) ... "
APPS=$(curl -sf -b "$COOKIE_FILE" "$BASE/api/apps" 2>/dev/null || echo "FAIL")
APP_COUNT=$(echo "$APPS" | grep -o '"id"' | wc -l)
if [ "$APP_COUNT" -gt 0 ]; then
  echo "✅ OK ($APP_COUNT apps)"
else
  echo "❌ FAIL"
  echo "    Response: $APPS"
  rm -f "$COOKIE_FILE"
  exit 1
fi

# 4. Cross-app secret (if set)
if [ -n "${CROSS_APP_SECRET:-}" ]; then
  echo -n "[4/4] /api/apps (cross-app) ... "
  CROSS=$(curl -sf -H "X-Cross-App-Secret: $CROSS_APP_SECRET" "$BASE/api/apps" 2>/dev/null || echo "FAIL")
  if echo "$CROSS" | grep -q '"id"'; then
    echo "✅ OK"
  else
    echo "❌ FAIL"
    echo "    Response: $CROSS"
  fi
else
  echo "[4/4] CROSS_APP_SECRET not set — skip cross-app check"
fi

rm -f "$COOKIE_FILE"
echo ""
echo "═══ All checks passed ✅ ═══"
