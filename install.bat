@echo off
echo ==========================================================
echo  ComfyWeb - instalacion
echo ==========================================================
echo.
echo [1/4] Verificando Node.js...
node -v >nul 2>&1 || (echo [ERROR] Node.js no instalado. & pause & exit /b 1)

echo [2/4] Instalando dependencias del servidor...
call npm install || (echo [ERROR] Fallo npm install. & pause & exit /b 1)

echo [3/4] Instalando dependencias del puente local (agent)...
cd agent
call npm install || (echo [ERROR] Fallo npm install en agent. & pause & exit /b 1)
cd ..

echo [4/4] Creando .env si falta...
if not exist .env (
    copy .env.example .env >nul
    echo      .env creado desde .env.example  ^<-- COMPLETAR (AGENT_TOKEN, JWT_SECRET, FTP, VPS)
) else (
    echo      .env ya existe.
)
if not exist agent\.env (
    copy agent\.env.example agent\.env >nul
    echo      agent\.env creado  ^<-- pegar el MISMO AGENT_TOKEN
) else (
    echo      agent\.env ya existe.
)

echo.
echo Listo. Ahora:
echo   1) run.bat                 (servidor local)
echo   2) conectar-videocomfy.bat (puente al videocomfy local)
pause
