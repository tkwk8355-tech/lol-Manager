@echo off
cd /d "%~dp0"

echo === [1/2] uploading cookies to server ===
if not exist discord\cookies.txt (
  echo cookies.txt not found.
  echo Please export cookies from YouTube using the browser extension and save as discord\cookies.txt
  pause
  exit /b 1
)
scp -i key.pem -o StrictHostKeyChecking=no discord\cookies.txt ec2-user@13.211.80.250:~/discordBot/cookies.txt
if errorlevel 1 (
  echo upload failed
  pause
  exit /b 1
)

echo === [2/2] restarting bot ===
ssh -i key.pem -o StrictHostKeyChecking=no ec2-user@13.211.80.250 "pm2 restart discordBot"

echo done!
pause
