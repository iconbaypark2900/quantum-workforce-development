#!/usr/bin/env bash
# Start local dev stack: Flask API + Next.js (default) or CRA.
#
# Usage:
#   chmod +x scripts/dev.sh
#   ./scripts/dev.sh              # API (background) + Next on :3000
#   ./scripts/dev.sh --cra        # API + CRA React (:3000)
#   ./scripts/dev.sh --api-only   # Flask only (PORT or 5000)
#   ./scripts/dev.sh --next-only  # Next only — run API separately
#
# Env:
#   PORT          API port (default 5000) — same as `python -m api`
#   NEXT_PORT     Next / CRA dev port (default 3000)
#   VENV          Path to venv (default .venv in repo root)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="next"
API_ONLY=false
UI_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --cra) MODE="cra" ;;
    --next) MODE="next" ;;
    --api-only) API_ONLY=true ;;
    --ui-only|--next-only) UI_ONLY=true ;;
    -h|--help)
      sed -n '2,18p' "$0" | cat
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

VENV="${VENV:-$ROOT/.venv}"
if [[ -f "$VENV/bin/activate" ]]; then
  # shellcheck source=/dev/null
  source "$VENV/bin/activate"
fi

# Auto-load repo-root .env.local for the Flask process (TIINGO_API_KEY, API_KEY, etc.).
# Flask itself does not load dotenv; sourcing here keeps Tiingo/Vercel envs in scope
# without forcing every operator to remember `set -a && source .env.local`.
if [[ -f "$ROOT/.env.local" ]]; then
  echo "[dev] Sourcing $ROOT/.env.local"
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.local"
  set +a
fi

API_PORT="${PORT:-5000}"
NEXT_PORT="${NEXT_PORT:-3000}"
export PORT="$API_PORT"

API_PID=""
cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo ""
    echo "[dev] Stopping API (pid $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "$UI_ONLY" != true ]]; then
  echo "[dev] Starting Flask API on 0.0.0.0:${API_PORT}..."
  python -m api &
  API_PID=$!

  echo "[dev] Waiting for /api/health..."
  for _ in $(seq 1 45); do
    if curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
      echo "[dev] API is up."
      break
    fi
    sleep 1
  done
  if ! curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    echo "[dev] WARNING: API did not respond on ${API_PORT}. Check logs above." >&2
  fi
fi

if [[ "$API_ONLY" == true ]]; then
  echo "[dev] API-only mode; press Ctrl+C to stop."
  wait "${API_PID:-}"
  exit 0
fi

if [[ "$MODE" == "next" ]]; then
  if [[ ! -d "$ROOT/web/node_modules" ]]; then
    echo "[dev] Installing web dependencies (npm install)..."
    (cd "$ROOT/web" && npm install)
  fi
  echo "[dev] Starting Next.js on http://127.0.0.1:${NEXT_PORT} (rewrites /api → :${API_PORT})"
  # No exec: keeps shell alive so EXIT trap stops the API when you quit Next
  (cd "$ROOT/web" && npx next dev -p "${NEXT_PORT}")
else
  if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
    echo "[dev] Installing frontend dependencies (npm install)..."
    (cd "$ROOT/frontend" && npm install)
  fi
  echo "[dev] Starting CRA on http://127.0.0.1:${NEXT_PORT} (proxy → :${API_PORT})"
  (cd "$ROOT/frontend" && env PORT="${NEXT_PORT}" npm start)
fi
