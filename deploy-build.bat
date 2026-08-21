@echo off
cd /d "%~dp0"

echo === [1/3] Build ===
call npm run build
if errorlevel 1 ( echo Build failed ^& pause ^& exit /b 1 )

echo === [2/3] Creating deploy.tar.gz ===
tar -czf deploy.tar.gz .next public package.json package-lock.json next.config.js
if errorlevel 1 ( echo Packaging failed ^& pause ^& exit /b 1 )

echo === [3/3] Done ===
echo deploy.tar.gz created!
