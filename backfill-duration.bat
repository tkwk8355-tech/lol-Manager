@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 내전 기존 경기 경기시간 보충 (최근 20경기) ===
node scripts\backfill-duration.js 20
pause
