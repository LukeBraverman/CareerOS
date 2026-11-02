@echo off
setlocal
cd /d "%~dp0"

set "PORT=8420"
set "URL=http://localhost:%PORT%"

:: Resolve Python interpreter (local venv -> shared MeInc venv -> system python)
set "PYTHON_EXE="
if exist "%~dp0venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
) else if exist "%~dp0..\MeIncRemidner\MeInc_ReminderService\venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0..\MeIncRemidner\MeInc_ReminderService\venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

:: Check if CareerOS backend is already running on port 8420
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%URL%/api/status' -UseBasicParsing -TimeoutSec 1; exit 0 } catch { exit 1 }"
if %ERRORLEVEL% NEQ 0 (
    echo Starting CareerOS Local Backend Server on %URL%...
    start "CareerOS Server" /min "%PYTHON_EXE%" "%~dp0backend\server.py"
    
    :: Wait up to 10 seconds for the server to become ready
    for /L %%i in (1,1,20) do (
        powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%URL%/api/status' -UseBasicParsing -TimeoutSec 1; exit 0 } catch { Start-Sleep -Milliseconds 500; exit 1 }" && goto :open_app
    )
)

:open_app
:: Launch in standalone desktop app window (Edge or Chrome --app mode)
where msedge >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" msedge --app=%URL%
    exit /b 0
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=%URL%
    exit /b 0
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=%URL%
    exit /b 0
)

start "" %URL%
