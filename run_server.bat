@echo off
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

REM Check if Python is available
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Using Python HTTP Server
    echo [INFO] Opening browser in 2 seconds...
    echo.
    
    REM Open browser after 2 seconds
    start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8080"
    
    REM Start Python server
    python -m http.server 8080 --bind 127.0.0.1
    goto :end
)

REM If no Python, try Node.js
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Using Node.js HTTP Server
    echo [INFO] Installing http-server (one time only)...
    call npm install -g http-server >nul 2>nul
    echo [INFO] Opening browser in 2 seconds...
    echo.
    
    REM Open browser after 2 seconds
    start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8080"
    
    REM Start Node server
    http-server -p 8080 -a 127.0.0.1 --cors -c-1
    goto :end
)

REM If neither Python nor Node.js is found
echo [ERROR] Python or Node.js not found!
echo.
echo Please install one of the following:
echo   1. Python from https://www.python.org/downloads/
echo   2. Node.js from https://nodejs.org/
echo.
pause
exit /b 1

:end
echo.
echo.
echo ================================================
echo Server stopped. Port 8080 is now available.
echo ================================================
timeout /t 3 >nul
