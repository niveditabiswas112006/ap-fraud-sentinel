@echo off
rem AP Payment Fraud Sentinel - one-time setup (Windows).
setlocal
cd /d "%~dp0"

set PY=python
where python >nul 2>nul
if errorlevel 1 set PY=py -3

rem Pin the DB location regardless of any DATABASE_URL left in the user's shell
rem (Prisma gives process env precedence over .env files).
set DATABASE_URL=file:../db/custom.db

echo === AP Payment Fraud Sentinel - setup ===

echo [1/5] Node dependencies...
where bun >nul 2>nul
if errorlevel 1 (
  call npm install --no-audit --no-fund
) else (
  call bun install
)

echo [2/5] WebSocket service dependencies...
pushd mini-services\pipeline-ws
call npm install --no-audit --no-fund
popd

echo [3/5] Python dependencies...
%PY% -m pip install -r worker\requirements.txt

echo [4/5] Environment file...
if exist .env (
  echo       .env already exists - keeping it.
) else (
  copy .env.example .env >nul
)

echo [5/5] Database - create schema + load reference CSVs...
call npm run db:push
%PY% scripts\seed_db.py

echo.
echo Setup complete. Start everything with:  start.bat
pause
