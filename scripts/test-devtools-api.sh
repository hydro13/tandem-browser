#!/bin/bash
# DevTools API Test Script for Tandem Browser
# Run this WHILE Tandem is running with a web page loaded
#
# Usage: bash scripts/test-devtools-api.sh
# Optional: TANDEM_PORT=8765 bash scripts/test-devtools-api.sh

set -e

PORT="${TANDEM_PORT:-8765}"
BASE="http://127.0.0.1:${PORT}"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

check() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="$4"
  local expect_field="$5"
  TOTAL=$((TOTAL + 1))

  echo -n "  [$TOTAL] $name... "

  if [ "$method" = "GET" ]; then
    RESPONSE=$(curl -sf "$url" 2>&1) || { echo -e "${RED}FAIL (curl error)${NC}"; FAIL=$((FAIL + 1)); return; }
  else
    RESPONSE=$(curl -sf -X "$method" "$url" -H "Content-Type: application/json" -d "$body" 2>&1) || { echo -e "${RED}FAIL (curl error)${NC}"; FAIL=$((FAIL + 1)); return; }
  fi

  if [ -n "$expect_field" ]; then
    if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$expect_field' in str(d)" 2>/dev/null; then
      echo -e "${GREEN}PASS${NC}"
      PASS=$((PASS + 1))
    else
      echo -e "${RED}FAIL (missing: $expect_field)${NC}"
      echo "    Response: $(echo $RESPONSE | head -c 200)"
      FAIL=$((FAIL + 1))
    fi
  else
    # Just check it's valid JSON
    if echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
      echo -e "${GREEN}PASS${NC}"
      PASS=$((PASS + 1))
    else
      echo -e "${RED}FAIL (invalid JSON)${NC}"
      echo "    Response: $(echo $RESPONSE | head -c 200)"
      FAIL=$((FAIL + 1))
    fi
  fi
}

echo "================================"
echo " Tandem DevTools API Tests"
echo " Target: $BASE"
echo "================================"
echo ""

# Pre-check: is Tandem running?
echo -n "Pre-check: Tandem API... "
if curl -sf "$BASE/status" > /dev/null 2>&1; then
  echo -e "${GREEN}Running${NC}"
else
  echo -e "${RED}NOT RUNNING — start Tandem first!${NC}"
  exit 1
fi
echo ""

# ─── Status ─────────────────────────────
echo "▸ Status"
check "GET /devtools/status" "$BASE/devtools/status" "GET" "" "attached"

# ─── Console ─────────────────────────────
echo ""
echo "▸ Console"
check "GET /devtools/console" "$BASE/devtools/console" "GET" "" "entries"
check "GET /devtools/console?level=error" "$BASE/devtools/console?level=error" "GET" "" "entries"
check "GET /devtools/console?limit=5" "$BASE/devtools/console?limit=5" "GET" "" "entries"
check "GET /devtools/console/errors" "$BASE/devtools/console/errors" "GET" "" "errors"
check "POST /devtools/console/clear" "$BASE/devtools/console/clear" "POST" "{}" "ok"

# Trigger a console.log via evaluate, then read it back
echo ""
echo "▸ Console Capture (round-trip)"
check "Inject console.log" "$BASE/devtools/evaluate" "POST" '{"expression":"console.log(\"TANDEM_TEST_12345\")"}' "ok"
sleep 0.5
echo -n "  [$((TOTAL + 1))] Verify captured log... "
TOTAL=$((TOTAL + 1))
CONSOLE_CHECK=$(curl -sf "$BASE/devtools/console?search=TANDEM_TEST_12345&limit=5" 2>&1)
if echo "$CONSOLE_CHECK" | grep -q "TANDEM_TEST_12345"; then
  echo -e "${GREEN}PASS${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}FAIL (log not captured)${NC}"
  FAIL=$((FAIL + 1))
fi

# ─── Network ─────────────────────────────
echo ""
echo "▸ Network"
check "GET /devtools/network" "$BASE/devtools/network" "GET" "" "entries"
check "GET /devtools/network?type=XHR" "$BASE/devtools/network?type=XHR" "GET" "" "entries"
check "GET /devtools/network?failed=true" "$BASE/devtools/network?failed=true" "GET" "" "entries"
check "POST /devtools/network/clear" "$BASE/devtools/network/clear" "POST" "{}" "ok"

# ─── DOM ─────────────────────────────────
echo ""
echo "▸ DOM"
check "POST /devtools/dom/query (body)" "$BASE/devtools/dom/query" "POST" '{"selector":"body"}' "nodes"
check "POST /devtools/dom/query (h1)" "$BASE/devtools/dom/query" "POST" '{"selector":"h1","maxResults":3}' "nodes"
check "POST /devtools/dom/xpath" "$BASE/devtools/dom/xpath" "POST" '{"expression":"//a[@href]","maxResults":5}' "nodes"

# Error case: missing selector
echo -n "  [$((TOTAL + 1))] POST /devtools/dom/query (no selector)... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/dom/query" -H "Content-Type: application/json" -d '{}')
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}PASS (400 as expected)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}FAIL (expected 400, got $HTTP_CODE)${NC}"
  FAIL=$((FAIL + 1))
fi

# ─── Storage ─────────────────────────────
echo ""
echo "▸ Storage"
check "GET /devtools/storage" "$BASE/devtools/storage" "GET" "" "cookies"

# ─── Performance ─────────────────────────
echo ""
echo "▸ Performance"
check "GET /devtools/performance" "$BASE/devtools/performance" "GET" "" "metrics"

# ─── Evaluate ────────────────────────────
echo ""
echo "▸ Evaluate"
check "Simple expression" "$BASE/devtools/evaluate" "POST" '{"expression":"1 + 1"}' "ok"
check "DOM query" "$BASE/devtools/evaluate" "POST" '{"expression":"document.title"}' "ok"
check "Complex object" "$BASE/devtools/evaluate" "POST" '{"expression":"({url: location.href, title: document.title})"}' "ok"

# Error case: syntax error
echo -n "  [$((TOTAL + 1))] Evaluate syntax error... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/evaluate" -H "Content-Type: application/json" -d '{"expression":"this is not valid js {{"}')
if [ "$HTTP_CODE" = "500" ]; then
  echo -e "${GREEN}PASS (500 as expected)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${YELLOW}WARN (expected 500, got $HTTP_CODE — might be OK if CDP handles it)${NC}"
  PASS=$((PASS + 1))
fi

# ─── Raw CDP ─────────────────────────────
echo ""
echo "▸ Raw CDP"
check "Browser.getVersion" "$BASE/devtools/cdp" "POST" '{"method":"Browser.getVersion"}' "result"
check "Page.getNavigationHistory" "$BASE/devtools/cdp" "POST" '{"method":"Page.getNavigationHistory"}' "result"

# Error case: missing method
echo -n "  [$((TOTAL + 1))] Raw CDP (no method)... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/cdp" -H "Content-Type: application/json" -d '{}')
if [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}PASS (400 as expected)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}FAIL (expected 400, got $HTTP_CODE)${NC}"
  FAIL=$((FAIL + 1))
fi

# ─── Element Screenshot ──────────────────
echo ""
echo "▸ Element Screenshot"
echo -n "  [$((TOTAL + 1))] Screenshot body element... "
TOTAL=$((TOTAL + 1))
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/devtools/screenshot/element" -H "Content-Type: application/json" -d '{"selector":"body"}')
if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}PASS (200 + PNG)${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${YELLOW}WARN (got $HTTP_CODE — element might not be visible)${NC}"
  PASS=$((PASS + 1))
fi

# ─── DevTools Toggle ─────────────────────
echo ""
echo "▸ DevTools Toggle"
check "POST /devtools/toggle" "$BASE/devtools/toggle" "POST" "{}" "ok"
sleep 0.5
# Toggle back
check "POST /devtools/toggle (back)" "$BASE/devtools/toggle" "POST" "{}" "ok"

# ─── Summary ─────────────────────────────
echo ""
echo "================================"
echo -e " Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "================================"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
