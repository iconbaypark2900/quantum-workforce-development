#!/bin/bash
# Quantum Hybrid Portfolio Dashboard Launcher
# Finds open ports for backend and frontend, starts both, and prints their URLs.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# Default port ranges (first free port in range is used)
BACKEND_START="${BACKEND_PORT_START:-5000}"
BACKEND_END="${BACKEND_PORT_END:-5010}"
FRONTEND_START="${FRONTEND_PORT_START:-3000}"
FRONTEND_END="${FRONTEND_PORT_END:-3010}"

echo "🔍 Finding open ports..."

# Find first free port in range (uses Python script)
find_port() {
  python3 "$ROOT/scripts/find_port.py" "$1" "$2"
}

BACKEND_PORT=$(find_port "$BACKEND_START" "$BACKEND_END") || {
  echo "❌ No free port for backend in range $BACKEND_START–$BACKEND_END"
  exit 1
}

FRONTEND_PORT=$(find_port "$FRONTEND_START" "$FRONTEND_END") || {
  echo "❌ No free port for frontend in range $FRONTEND_START–$FRONTEND_END"
  exit 1
}

# If backend is not on default 5000, warn (proxy in package.json points to 5000 when REACT_APP_API_URL is unset)
if [ "$BACKEND_PORT" -ne 5000 ]; then
  echo "⚠️  Backend using port $BACKEND_PORT (5000 was busy)"
fi
if [ "$FRONTEND_PORT" -ne 3000 ]; then
  echo "⚠️  Frontend using port $FRONTEND_PORT (3000 was busy)"
fi

echo ""
echo "🔌 Starting backend API on port $BACKEND_PORT..."
source "$ROOT/.venv/bin/activate"
export PORT="$BACKEND_PORT"
export CORS_ORIGINS="http://localhost:$FRONTEND_PORT"
python -m api &
BACKEND_PID=$!

# Give backend time to bind
sleep 3

echo "📱 Starting frontend on port $FRONTEND_PORT..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  npm install
fi
export PORT="$FRONTEND_PORT"
export REACT_APP_API_URL="http://localhost:$BACKEND_PORT"
export BROWSER=none
npm start &
FRONTEND_PID=$!

# Wait for frontend to be up (optional, brief)
sleep 5

# ─── Show where everything is running ───
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🎉 Quantum Portfolio Lab is running"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  📊 Frontend (dashboard):  http://localhost:$FRONTEND_PORT"
echo "  🔌 Backend (API):         http://localhost:$BACKEND_PORT"
echo "  ❤️  Health check:          http://localhost:$BACKEND_PORT/api/health"
echo ""
echo "  Open in browser: http://localhost:$FRONTEND_PORT"
echo ""
echo "  Backend PID: $BACKEND_PID  |  Frontend PID: $FRONTEND_PID"
echo "  Press Ctrl+C to stop both."
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Keep script running so background jobs stay attached; trap Ctrl+C to kill both
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
