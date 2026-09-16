@echo off
chcp 65001 > nul
"C:\Program Files\MariaDB 10.3\bin\mysql.exe" -u markany -pmarkany1@ -h 127.0.0.1 -P 3301 --default-character-set=utf8mb4 lolclient %*
