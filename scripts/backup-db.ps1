$envLine = Get-Content "$PSScriptRoot\..\.env.local" | Select-String '^DB_PASSWORD='
$env:MYSQL_PWD = $envLine.ToString().Split('=',2)[1]

New-Item -ItemType Directory -Force -Path "$PSScriptRoot\..\backups" | Out-Null
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$outFile = "$PSScriptRoot\..\backups\lolclient_backup_$ts.sql"

& 'C:\Program Files\MariaDB 10.3\bin\mysqldump.exe' --host=127.0.0.1 --port=3301 --user=cmjeon --routines --events --triggers --single-transaction lolclient | Out-File -Encoding utf8 $outFile

Remove-Item Env:\MYSQL_PWD

Write-Host "Backup saved to: $outFile"
