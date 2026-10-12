#!/bin/bash
# ============================================================
# comfyweb - actualizacion del backend en el VPS (corre DENTRO del VPS)
#   SSH: cd /root/comfyweb && bash deploy_scripts/server_update.sh
#
# IMPORTANTE: este script NO toca el .env del VPS (es config del server,
# no fuente). Si falta, hay que crearlo la primera vez a mano.
# ============================================================

# 1. LIMPIEZA DE CRLF
sed -i 's/\r$//' .env 2>/dev/null
sed -i 's/\r$//' deploy_scripts/server_update.sh 2>/dev/null

# 2. CARGAR VARIABLES DESDE .ENV
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "ADVERTENCIA: no hay .env en el VPS. La app arranca igual (health lo dice),"
    echo "             pero sin JWT_SECRET / AGENT_TOKEN / FSC_AUTH_API no autentica."
fi

APP_NAME="comfyweb"
REPO="${GITHUB_REPO:-jpupper/comfyweb}"
TOKEN=$(echo $GITHUB_TOKEN | tr -d '\r')
REPO_URL="https://$TOKEN@github.com/$REPO"

echo "------------------------------------------------"
echo "DEPLOY: $APP_NAME (Repo: $REPO)"
echo "------------------------------------------------"

# 3. ACTUALIZACION DE GIT
if [ ! -d ".git" ]; then
    echo "Clonando repositorio por primera vez..."
    git init
    git remote add origin "$REPO_URL"
    git fetch origin main
    git checkout -f main
else
    echo "Actualizando repositorio..."
    git remote set-url origin "$REPO_URL"
    git fetch origin main
    git reset --hard origin/main
fi

# 4. DEPENDENCIAS
echo "Instalando dependencias de Node..."
npm install --no-audit --no-fund

# 5. PM2
echo "Reiniciando instancia de PM2 ($APP_NAME)..."
pm2 delete "$APP_NAME" 2>/dev/null
pm2 start server.js --name "$APP_NAME" --update-env
pm2 save

echo "------------------------------------------------"
echo "DEPLOY FINALIZADO CON EXITO"
echo "------------------------------------------------"
pm2 list
echo "------------------------------------------------"
echo "Health: curl -s http://127.0.0.1:8085/comfyweb/health"
