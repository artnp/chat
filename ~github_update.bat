@echo off
chcp 65001 >nul
title GitHub Uploader - artnp/chat
echo.
echo ========================================
echo   Uploading to artnp/chat (main)
echo ========================================

powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Github\github_upload.ps1" "%~dp0." "artnp/chat"

if %ERRORLEVEL% equ 0 (
    echo.
    echo Upload complete!
) else (
    echo.
    echo Upload had errors.
)
echo.
exit /b
