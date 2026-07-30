@echo off
setlocal

cd /d "%~dp0"
set "HOST=127.0.0.1"
set "PORT=4173"
set "NODE_BIN="
set "VITE_BIN=%~dp0node_modules\vite\bin\vite.js"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
for /f "delims=" %%N in ('where node') do if not defined NODE_BIN set "NODE_BIN=%%N"

if not exist "%VITE_BIN%" (
  echo Dependencies are missing. Run npm install once before using this launcher.
  pause
  exit /b 1
)

echo Starting Roundtable...
start "" /b "%NODE_BIN%" "%VITE_BIN%" --host %HOST% --port %PORT%

set "READY="
for /l %%N in (1,1,30) do (
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'http://%HOST%:%PORT%/' -TimeoutSec 1 > $null" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :open_browser
  )
  timeout /t 1 /nobreak >nul
)

:open_browser
if defined READY (
  echo Opening browser...
  start "" "http://%HOST%:%PORT%/"
) else (
  echo Startup timed out. Open http://%HOST%:%PORT%/ manually.
)

endlocal
