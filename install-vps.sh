#!/bin/bash

# Script de instalación para ComfyTD en VPS
# Uso: bash install-vps.sh

echo "🚀 Instalando ComfyTD en VPS..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar que estamos en el directorio correcto
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Error: No se encuentra server.js${NC}"
    echo "Por favor ejecuta este script desde el directorio comfytd"
    exit 1
fi

# Instalar dependencias
echo -e "${YELLOW}📦 Instalando dependencias de Node.js...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error al instalar dependencias${NC}"
    exit 1
fi

# Crear directorio de imágenes si no existe
echo -e "${YELLOW}📁 Creando directorio de imágenes...${NC}"
mkdir -p public/imagenes
chmod -R 755 public/imagenes

# Verificar si PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 PM2 no está instalado. Instalando globalmente...${NC}"
    npm install -g pm2
fi

# Detener instancia anterior si existe
echo -e "${YELLOW}🛑 Deteniendo instancia anterior (si existe)...${NC}"
pm2 delete comfytd 2>/dev/null || true

# Iniciar aplicación con PM2
echo -e "${YELLOW}🚀 Iniciando aplicación con PM2...${NC}"
pm2 start ecosystem.config.js

# Guardar configuración de PM2
pm2 save

# Configurar PM2 para iniciar al arranque del sistema
pm2 startup

echo -e "${GREEN}✅ Instalación completada!${NC}"
echo ""
echo -e "${GREEN}📊 Estado de la aplicación:${NC}"
pm2 status

echo ""
echo -e "${GREEN}🌐 La aplicación debería estar disponible en:${NC}"
echo -e "${GREEN}   https://vps-4455523-x.dattaweb.com/comfytd${NC}"
echo ""
echo -e "${YELLOW}📋 Comandos útiles:${NC}"
echo "   pm2 logs comfytd       - Ver logs en tiempo real"
echo "   pm2 restart comfytd    - Reiniciar aplicación"
echo "   pm2 stop comfytd       - Detener aplicación"
echo ""
echo -e "${YELLOW}⚠️  No olvides configurar Nginx con el bloque de configuración${NC}"
echo -e "${YELLOW}   Ver DEPLOY.md para más detalles${NC}"
