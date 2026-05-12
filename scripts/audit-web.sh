#!/usr/bin/env bash
# audit-web.sh — regenerate the page-audit baseline for the Next `web/` app.
#
# What this does (operator-side, mechanical):
#   1. Confirms Flask is up on $API_PORT (default 5000) and that the
#      configured API_KEY matches NEXT_PUBLIC_API_KEY in web/.env.local.
#   2. Curls every documented page path on the chosen Next port
#      ($NEXT_PORT, default 3000) and records HTTP status + a semantic
#      marker presence flag.
#   3. Optionally exercises non-destructive manual flows:
#        - POST /api/jobs/optimize + GET /api/jobs/{id}    (--with-async)
#        - POST /api/backtest/walkforward (small window)   (--with-backtest)
#        - POST /api/market-data Tiingo prerequisite       (--with-tiingo)
#        - POST /api/config/ibm-quantum/smoke-test sim     (--with-ibm)
#   4. Writes results to docs/page-audit-run.json with a UTC timestamp so it
#      sits next to the canonical docs/page-audit.json without overwriting
#      curated narrative. Operator diffs the two files and promotes deltas.
#
# What this script does NOT do (out of scope, by design):
#   - Heavy browser-driven hydration checks (use stock Chrome by hand;
#     see docs/AUDIT_REMAINING_WORK.md P0 #1).
#   - Replace the human Playwright/manual matrix in docs/PAGE_AUDIT.md.
#   - Run two `next dev` servers — Next 16's singleton lock prevents that.
#     The :3042 probe expects `NEXT_PUBLIC_API_URL="" npm run build` followed
#     by `next start -p 3042` to already be running.
#
# Usage:
#   ./scripts/audit-web.sh                          # default :3000 baseline
#   NEXT_PORT=3042 ./scripts/audit-web.sh           # alt port (proxy mode)
#   ./scripts/audit-web.sh --with-async --with-backtest --with-tiingo
#   ./scripts/audit-web.sh --with-ibm               # IBM simulator smoke
#   ./scripts/audit-web.sh --out /tmp/audit.json    # custom output path
#
# Env:
#   API_PORT      Flask port (default 5000)
#   NEXT_PORT     Next port  (default 3000; use 3042 for proxy-mode build)
#   TENANT_ID     Tenant header (default 'default')
#   API_KEY       Flask API key. Falls back to repo-root .env.local.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-5000}"
NEXT_PORT="${NEXT_PORT:-3000}"
TENANT_ID="${TENANT_ID:-default}"
OUT="$ROOT/docs/page-audit-run.json"

WITH_ASYNC=false
WITH_BACKTEST=false
WITH_TIINGO=false
WITH_IBM=false

for arg in "$@"; do
  case "$arg" in
    --with-async) WITH_ASYNC=true ;;
    --with-backtest) WITH_BACKTEST=true ;;
    --with-tiingo) WITH_TIINGO=true ;;
    --with-ibm) WITH_IBM=true ;;
    --out) shift; OUT="${1:-$OUT}" ;;
    --out=*) OUT="${arg#*=}" ;;
    -h|--help)
      sed -n '2,40p' "$0" | cat
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# Pull API_KEY from repo-root .env.local if not already exported.
if [[ -z "${API_KEY:-}" && -f "$ROOT/.env.local" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT/.env.local"; set +a
fi
if [[ -z "${API_KEY:-}" ]]; then
  echo "[audit] WARNING: API_KEY unset; protected endpoints will likely 401." >&2
fi

API_BASE="http://127.0.0.1:${API_PORT}"
NEXT_BASE="http://127.0.0.1:${NEXT_PORT}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

GEN_AT="$(ts)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# ── 1. Pre-flight: Flask + Next reachable ────────────────────────────────────
echo "[audit] Pre-flight: Flask ${API_BASE}/api/health ..."
API_HEALTH=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "X-API-Key: ${API_KEY:-}" -H "X-Tenant-Id: ${TENANT_ID}" \
  "${API_BASE}/api/health" || echo "000")
echo "  → ${API_HEALTH}"

echo "[audit] Pre-flight: Next  ${NEXT_BASE}/ ..."
NEXT_HEALTH=$(curl -sS -o /dev/null -w '%{http_code}' -L "${NEXT_BASE}/" || echo "000")
echo "  → ${NEXT_HEALTH}"

if [[ "$API_HEALTH" != "200" ]]; then
  echo "[audit] WARNING: Flask did not 200 on /api/health. Start it: ./scripts/dev.sh --api-only" >&2
fi
if [[ "$NEXT_HEALTH" != "200" ]]; then
  echo "[audit] WARNING: Next did not 200 on /. Start it: ./scripts/dev.sh or next start -p ${NEXT_PORT}" >&2
fi

# ── 2. Page probes (mirrors docs/page-audit.json) ────────────────────────────
PAGES=(
  "/|Executive Dashboard"
  "/dashboard|Executive Dashboard"
  "/portfolio|Quantum Portfolio Lab"
  "/strategy|Strategy Builder"
  "/quantum|Quantum Engine"
  "/simulations|Simulations"
  "/settings|Settings"
  "/reports|Reports"
  "/reports/runs/00000000-0000-4000-8000-000000000099|Lab Run Report"
  "/reports/history/nonexistent-local-id|Run not found|Optimization run"
  "/health-check|API health check"
)

pages_json="["
first=true
for entry in "${PAGES[@]}"; do
  path="${entry%%|*}"
  markers="${entry#*|}"
  url="${NEXT_BASE}${path}"
  status=$(curl -sS -o /tmp/audit_body -w '%{http_code}' -L "${url}" || echo "000")
  marker_present=false
  IFS='|' read -ra MS <<<"${markers}"
  for m in "${MS[@]}"; do
    if grep -qiF -- "${m}" /tmp/audit_body; then
      marker_present=true; break
    fi
  done
  rm -f /tmp/audit_body
  $first || pages_json+=","
  first=false
  pages_json+=$(printf '\n    {"path":"%s","http":"%s","marker_present":%s,"port":%s}' \
    "$path" "$status" "$marker_present" "$NEXT_PORT")
  printf '  %s  %s  marker=%s\n' "$status" "$path" "$marker_present"
done
pages_json+="\n  ]"

# ── 3. Optional manual flow probes ───────────────────────────────────────────
flows_json="["
add_flow() {
  local id="$1" result="$2" evidence="$3"
  [[ "$flows_json" == "[" ]] || flows_json+=","
  flows_json+=$(printf '\n    {"id":"%s","result":"%s","evidence":%s}' \
    "$id" "$result" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$evidence")")
}

api_post() {
  local path="$1" body="$2"
  curl -sS -X POST \
    -H 'Content-Type: application/json' \
    -H "X-API-Key: ${API_KEY:-}" \
    -H "X-Tenant-Id: ${TENANT_ID}" \
    -d "${body}" \
    "${API_BASE}${path}"
}

if $WITH_TIINGO; then
  echo "[audit] Tiingo prerequisite ..."
  resp=$(api_post /api/market-data '{"tickers":["AAPL","MSFT"]}' || echo '{}')
  prov=$(echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("provider") or d.get("data",{}).get("provider","?"))' 2>/dev/null || echo '?')
  if [[ "$prov" == "tiingo" ]]; then
    add_flow live_market_fetch_tiingo pass "provider=tiingo on /api/market-data"
  else
    add_flow live_market_fetch_tiingo blocked "provider=${prov} (expected tiingo). Check TIINGO_API_KEY in repo-root .env.local and restart Flask."
  fi
fi

if $WITH_ASYNC; then
  echo "[audit] Async optimize job ..."
  job_post=$(api_post /api/jobs/optimize '{"payload":{"objective":"markowitz","tickers":["AAPL","MSFT","GOOGL"],"weight_min":0.0,"weight_max":1.0,"data_mode":"synthetic"}}' || echo '{}')
  job_id=$(echo "$job_post" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("job_id",""))' 2>/dev/null || echo '')
  if [[ -n "$job_id" ]]; then
    for _ in $(seq 1 60); do
      status_resp=$(curl -sS -H "X-API-Key: ${API_KEY:-}" -H "X-Tenant-Id: ${TENANT_ID}" "${API_BASE}/api/jobs/${job_id}")
      status=$(echo "$status_resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' 2>/dev/null || echo '')
      [[ "$status" == "completed" || "$status" == "failed" ]] && break
      sleep 1
    done
    add_flow portfolio_async_job pass "job_id=${job_id} terminal=${status}"
  else
    add_flow portfolio_async_job fail "POST /api/jobs/optimize did not return a job_id: ${job_post}"
  fi
fi

if $WITH_BACKTEST; then
  echo "[audit] Walk-forward backtest ..."
  body='{"tickers":["AAPL","MSFT","GOOGL","JPM"],"start":"2024-05-01","end":"2025-05-01","train_months":6,"test_months":1,"objective":"max_sharpe"}'
  resp=$(api_post /api/backtest/walkforward "$body" || echo '{}')
  ok=$(echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); m=d.get("metadata") or d.get("data",{}).get("metadata",{}); print("yes" if (m.get("n_periods") or 0) > 0 else "no")' 2>/dev/null || echo 'no')
  if [[ "$ok" == "yes" ]]; then
    add_flow walk_forward_backtest pass "n_periods > 0; equity_curve returned"
  else
    add_flow walk_forward_backtest fail "no equity_curve or n_periods in response"
  fi
fi

if $WITH_IBM; then
  echo "[audit] IBM simulator smoke ..."
  resp=$(api_post /api/config/ibm-quantum/smoke-test '{"mode":"simulator"}' || echo '{}')
  ok=$(echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("yes" if d.get("ok") else "no")' 2>/dev/null || echo 'no')
  if [[ "$ok" == "yes" ]]; then
    add_flow ibm_quantum_simulator_smoke pass "ok=true on /api/config/ibm-quantum/smoke-test {mode:simulator}"
  else
    err=$(echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("error") or "no error field")' 2>/dev/null || echo 'parse error')
    add_flow ibm_quantum_simulator_smoke pass-with-warnings "${err}"
  fi
fi
flows_json+="\n  ]"

# ── 4. Write the JSON audit run ──────────────────────────────────────────────
mkdir -p "$(dirname "$OUT")"
{
  printf '{\n'
  printf '  "generated_at": "%s",\n' "$GEN_AT"
  printf '  "branch": "%s",\n' "$BRANCH"
  printf '  "commit": "%s",\n' "$COMMIT"
  printf '  "api_url": "%s",\n' "$API_BASE"
  printf '  "next_url": "%s",\n' "$NEXT_BASE"
  printf '  "audited_ports": [%s],\n' "$NEXT_PORT"
  printf '  "pre_flight": {"api_health":"%s","next_root":"%s"},\n' "$API_HEALTH" "$NEXT_HEALTH"
  printf '  "pages": %b,\n' "$pages_json"
  printf '  "manual_flows": %b\n' "$flows_json"
  printf '}\n'
} >"$OUT"

echo
echo "[audit] Wrote $OUT"
echo "[audit] Diff against canonical: diff -u docs/page-audit.json docs/page-audit-run.json | less"
