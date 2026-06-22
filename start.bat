@echo off
REM ============================================================
REM  Bookwright - double-click launcher
REM  Builds the app (first run) and opens it in your browser.
REM ============================================================
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies for the first time. This can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency install failed. Please run "npm install" manually.
    pause
    exit /b 1
  )
)

echo Starting Bookwright...
call npm start
pause
