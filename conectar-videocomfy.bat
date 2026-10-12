@echo off
setlocal
title ComfyWeb - Puente local al videocomfy
cd /d "%~dp0"

echo ==========================================================
echo  ComfyWeb - PUENTE LOCAL
echo  Conecta esta PC (videocomfy en 127.0.0.1:5634) con el
echo  servidor comfyweb del VPS. No abre ningun puerto aca.
echo ==========================================================
echo.

if not exist "agent\.env" (
    echo [!] Falta agent\.env  --^> copialo de agent\.env.example
    echo     y pone el mismo AGENT_TOKEN que en el .env del servidor.
    pause
    exit /b 1
)

echo Comprobando que el videocomfy local este levantado (127.0.0.1:5634)...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5634/' -TimeoutSec 4 -UseBasicParsing; Write-Host '  OK: videocomfy responde (HTTP ' $r.StatusCode ')' } catch { Write-Host '  [!] El videocomfy NO responde en 5634. Levantalo primero (start desde su carpeta: node server.js) y volve a correr esto.' }"

echo.
echo Arrancando el puente (deja esta ventana abierta)...
echo.
node agent\videocomfy-bridge.js
pause
