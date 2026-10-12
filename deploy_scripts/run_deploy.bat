@echo off
setlocal enabledelayedexpansion

:: Cargar variables desde .env
set "ENV_FILE=%~dp0..\.env"
if exist "%ENV_FILE%" (
    for /f "tokens=*" %%a in ('powershell -Command "Get-Content '%ENV_FILE%' | Where-Object { $_ -match '=' -and -not $_.StartsWith('#') } | ForEach-Object { $_.Trim() }"') do (
        set "%%a"
    )
)

echo ===================================================
echo Iniciando proceso COMPLETO de Deploy - ComfyWeb
echo ===================================================

echo.
echo [1/2] DESPLEGANDO EN EL VPS (!VPS_HOST!) POR SSH...
set "REPO_URL=https://***@github.com/!GITHUB_REPO!"

ssh -p !VPS_PORT! !VPS_USER!@!VPS_HOST! "mkdir -p comfyweb && cd comfyweb && git remote set-url origin !REPO_URL! 2>/dev/null || (git init && git remote add origin !REPO_URL!) && git fetch origin main && git reset --hard origin/main && bash deploy_scripts/server_update.sh"

echo.
echo [2/2] SUBIENDO EL FRONT AL FTP (!FTP_HOST!)...
node "%~dp0upload_ftp.js"
if %ERRORLEVEL% neq 0 (
    echo Error al subir archivos por FTP. Revisa la consola.
    pause
    exit /b
)

echo.
echo ===================================================
echo Deploy de ComfyWeb finalizado!
echo VPS y FTP estan actualizados.
echo ===================================================
pause
