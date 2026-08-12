@echo off
chcp 65001 >nul
title Deploy Package Builder
cd /d "%~dp0"

echo === [1/3] 빌드 ===
call npm run build
if errorlevel 1 ( echo 빌드 실패 & pause & exit /b 1 )

echo === [2/3] deploy.tar.gz 생성 ===
tar -czf deploy.tar.gz ^
  .next ^
  public ^
  package.json ^
  package-lock.json ^
  next.config.js
if errorlevel 1 ( echo 패키징 실패 & pause & exit /b 1 )

echo === [3/3] 완료 ===
echo deploy.tar.gz 생성됨
pause
