@echo off
rem AP Payment Fraud Sentinel - start all 3 services (Windows).
rem Each service opens in its own window; close a window to stop that service.
setlocal
cd /d "%~dp0"

set PY=python
where python >nul 2>nul
if errorlevel 1 set PY=py -3

rem Pin the DB location regardless of any DATABASE_URL left in the user's shell
rem (Prisma Client gives process env precedence over .env files).
set DATABASE_URL=file:../db/custom.db

if not exist node_modules (
  echo Looks un-setup - run setup.bat first.
  pause
  exit /b 1
)

echo Starting AP Payment Fraud Sentinel...
echo   trace service  http://localhost:3003
echo   pipeline worker http://localhost:3030
echo   dashboard       http://localhost:3000

start "AP Fraud - Trace WS  :3003" cmd /k node mini-services\pipeline-ws\index.js
start "AP Fraud - Worker     :3030" cmd /k %PY% worker\main.py
start "AP Fraud - Dashboard  :3000" cmd /k npx next dev -p 3000

echo Waiting for the dashboard to come up...
timeout /t 8 /nobreak >nul
start http://localhost:3000

echo.
echo Three windows are open - close each window to stop that service.
pause
