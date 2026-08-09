#!/bin/bash
set -e

echo "=== 1. Docker 설치 ==="
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

echo "=== 2. Docker Compose 설치 ==="
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

echo "=== 3. 환경변수 파일 생성 ==="
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo ".env.local 파일이 생성되었습니다. RIOT_API_KEY와 비밀번호를 반드시 수정하세요."
  echo "  nano .env.local"
  exit 0
fi

echo "=== 4. 빌드 & 실행 ==="
# .env.local을 docker-compose가 읽는 .env로 복사
cp .env.local .env
sudo docker-compose up -d --build

echo ""
echo "=== 완료 ==="
echo "앱 주소: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8355"
