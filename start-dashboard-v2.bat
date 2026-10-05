@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title PKRU Air Quality - local server (v2)
REM ============================================================
REM  start-dashboard-v2.bat
REM  - Uses port 3000 (allowed by the Aerolink API CORS list, so real
REM    InfluxDB data loads); falls back to 8001-8010 if 3000 is busy
REM  - Opens the browser only after the server is up
REM  - Choose which page to open: dashboard or landing page
REM  - Usage: double-click, or  start-dashboard-v2.bat index
REM ============================================================
cd /d "%~dp0"

set PAGE=dashboard.html
if /i "%~1"=="index" set PAGE=index.html
if /i "%~1"=="home"  set PAGE=index.html

REM ---- find a free port: 3000 first (API CORS allows http://localhost:3000) ----
set PORT=
for %%P in (3000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010) do (
    if not defined PORT (
        netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul
        if errorlevel 1 set PORT=%%P
    )
)
if not defined PORT (
    echo [x] Ports 3000 and 8001-8010 are all in use. Close other servers and try again.
    pause
    exit /b 1
)
set URL=http://localhost:%PORT%/%PAGE%

REM ---- pick a server program ----
set SERVER=
where python >nul 2>nul && set SERVER=python -m http.server %PORT%
if not defined SERVER (
    where py >nul 2>nul && set SERVER=py -m http.server %PORT%
)
if not defined SERVER (
    where npx >nul 2>nul && set SERVER=npx --yes http-server -p %PORT% -c-1
)
if not defined SERVER (
    echo [x] Python or Node.js was not found.
    echo     Install Python from https://www.python.org/downloads/
    echo     ^(tick "Add python.exe to PATH" during install^)
    pause
    exit /b 1
)

echo ============================================================
echo  PKRU Air Quality - local server
echo  Page   : %URL%
echo  Folder : %CD%
echo ------------------------------------------------------------
if "%PORT%"=="3000" (
    echo  Port 3000: real sensor data from the Aerolink API / InfluxDB
    echo  will load ^(the API allows http://localhost:3000^).
) else (
    echo  NOTE: Port 3000 is busy, so the Aerolink API will block
    echo        http://localhost:%PORT% ^(CORS^). Close whatever uses
    echo        port 3000 to get real data. Map and layout still work.
)
echo ------------------------------------------------------------
echo  Close this window or press Ctrl+C to stop the server.
echo ============================================================

REM ---- open the browser after 2 seconds (server needs a moment) ----
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" "%URL%""

%SERVER%
echo.
echo Server stopped.
pause
