@echo off
chcp 65001 >nul
color 0A
title Chat Local Server - Port 8080

echo.
echo ================================================
echo    Starting Local Web Server on Port 8080
echo ================================================
echo.
echo Server URL: http://127.0.0.1:8080
echo.
echo Press Ctrl+C or close this window to stop server
echo ================================================
echo.

REM Clear any old process holding port 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Open browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8080"

REM Check if Node.js is available
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Using Node.js HTTP Server
    call npx -y http-server -p 8080 -a 127.0.0.1 --cors -c-1
    goto :end
)

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Using Python HTTP Server
    python -m http.server 8080 --bind 127.0.0.1
    goto :end
)

echo [ERROR] Python or Node.js not found!
echo Please install Python or Node.js to run the local server.
pause
exit /b 1

:end
echo.
echo Server stopped.
timeout /t 2 >nul
