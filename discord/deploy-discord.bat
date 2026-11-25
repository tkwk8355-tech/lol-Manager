@echo off
cd /d "%~dp0"

echo === [1/2] creating discord.tar.gz ===
tar -czf discord.tar.gz --exclude=.env --exclude=discord.tar.gz .
if errorlevel 1 ( echo Packaging failed ^& pause ^& exit /b 1 )

echo === [2/2] done ===
echo discord.tar.gz created!
pause
