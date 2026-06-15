@echo off
setlocal EnableExtensions

set "APP_DIR=%~dp0"
set "APP_EXE=%APP_DIR%water-plant.exe"
set "APP_HOST=127.0.0.1"
if "%APP_PORT%"=="" set "APP_PORT=8000"

if not exist "%APP_EXE%" (
  echo Cannot find "%APP_EXE%".
  pause
  exit /b 1
)

echo Starting Water Plant...
echo URL: http://%APP_HOST%:%APP_PORT%
start "" /min "%APP_EXE%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='http://%APP_HOST%:%APP_PORT%/health';" ^
  "for($i=0;$i -lt 30;$i++){" ^
  "  try { Invoke-RestMethod -Uri $url -TimeoutSec 1 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 }" ^
  "}; exit 1"

if errorlevel 1 (
  echo Service is still starting. Open http://%APP_HOST%:%APP_PORT% manually if the browser does not open.
) else (
  start "" "http://%APP_HOST%:%APP_PORT%"
)

echo.
echo Keep the Water Plant console window open while using the app.
endlocal
