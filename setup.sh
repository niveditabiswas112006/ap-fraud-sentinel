#!/usr/bin/env bash
# AP Payment Fraud Sentinel — one-time setup (macOS / Linux).
# Installs Node + Python dependencies, creates .env, creates + seeds the DB.
set -e
cd "$(dirname "$0")"

PY=${PYTHON:-python3}
command -v "$PY" >/dev/null 2>&1 || PY=python

# Pin the DB location regardless of any DATABASE_URL left in the user's shell
# (Prisma gives process env precedence over .env files).
export DATABASE_URL=file:../db/custom.db

echo "=== AP Payment Fraud Sentinel — setup ==="

echo "[1/5] Node dependencies..."
if command -v bun >/dev/null 2>&1; then
  bun install
else
  npm install --no-audit --no-fund
fi

echo "[2/5] WebSocket service dependencies..."
(
  cd mini-services/pipeline-ws
  if command -v bun >/dev/null 2>&1; then bun install; else npm install --no-audit --no-fund; fi
)

echo "[3/5] Python dependencies..."
"$PY" -m pip install -r worker/requirements.txt

echo "[4/5] Environment file..."
if [ -f .env ]; then
  echo "      .env already exists — keeping it."
else
  cp .env.example .env
fi

echo "[5/5] Database (create schema + load reference CSVs)..."
npx prisma db push
"$PY" scripts/seed_db.py

echo ""
echo "Setup complete. Start everything with:  ./start.sh"
