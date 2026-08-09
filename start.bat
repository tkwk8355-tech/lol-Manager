@echo off
chcp 65001 >nul
title LOL Clan Manager
cd /d "%~dp0"

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

if not exist ".next" (
    echo Building...
    call npm run build
)

echo.
echo  Starting on http://localhost:8355
echo.
call npm start

pause
