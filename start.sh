#!/usr/bin/env bash
# AP Payment Fraud Sentinel — start all 3 services (macOS / Linux).
#   trace WS :3003  →  worker :3030  →  dashboard :3000
# Ctrl+C stops all three.
set -e
cd "$(dirname "$0")"

PY=${PYTHON:-python3}
command -v "$PY" >/dev/null 2>&1 || PY=python

# Pin the DB location regardless of any DATABASE_URL left in the user's shell
# (Prisma + Prisma Client give process env precedence over .env files).
export DATABASE_URL=file:../db/custom.db

if [ ! -d node_modules ] || [ ! -f db/custom.db ]; then
  echo "Looks un-setup — run ./setup.sh first."
  exit 1
fi

echo "Starting AP Payment Fraud Sentinel..."
echo "  trace service  http://localhost:3003"
echo "  pipeline worker http://localhost:3030"
echo "  dashboard       http://localhost:3000"

node mini-services/pipeline-ws/index.js > ws.log 2>&1 &
WS_PID=$!
"$PY" worker/main.py > worker.log 2>&1 &
WORKER_PID=$!
npx next dev -p 3000 > dashboard.log 2>&1 &
DASH_PID=$!

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill $WS_PID $WORKER_PID $DASH_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

sleep 5
(command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:3000) \
  || (command -v open >/dev/null 2>&1 && open http://localhost:3000) || true

echo ""
echo "Dashboard: http://localhost:3000   (logs: ws.log worker.log dashboard.log)"
echo "Press Ctrl+C to stop all services."
wait
