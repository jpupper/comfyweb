@echo off
setlocal
title ComfyWeb - Puerto 8085
set "PORT=8085"

echo [ComfyWeb] Liberando SOLO el puerto %PORT% (no toca otras apps)...
powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($pids) { foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host ('  PID ' + $p + ' liberado (puerto %PORT%)') } } else { Write-Host '  Puerto %PORT% libre, nada que matar.' }"
ping -n 3 127.0.0.1 >nul

echo.
echo  ComfyWeb - servidor local
echo  Panel:  http://localhost:8085/comfyweb/
echo  Health: http://localhost:8085/comfyweb/health
echo.
echo  (El puente local va aparte: conectar-videocomfy.bat)
echo.
npm run dev
pause
