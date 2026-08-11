#!/bin/bash
# 서버에서 실행하는 배포 스크립트
# 사용법: bash deploy.sh

set -e

echo "=== [1/3] 최신 코드 pull ==="
git pull

echo "=== [2/3] Docker 이미지 빌드 & 컨테이너 재시작 ==="
docker compose down
docker compose build --no-cache app
docker compose up -d

echo "=== [3/3] 컨테이너 상태 확인 ==="
docker compose ps
echo "배포 완료 ✅"
