# 📦 Resumen de Deploy - ComfyTD

## ✅ Archivos creados para el deploy

1. **`ecosystem.config.js`** - Configuración de PM2
2. **`install-vps.sh`** - Script de instalación automatizado
3. **`nginx-config.txt`** - Configuración de Nginx lista para copiar
4. **`DEPLOY.md`** - Guía completa de despliegue
5. **`public/js/base-path.js`** - Soporte para subpath `/comfytd`

## 🔧 Cambios realizados en el código

### Backend (server.js)
- ✅ Agregado soporte para `BASE_PATH` variable de entorno
- ✅ Todos los endpoints usan `BASE_PATH + '/api/...'`
- ✅ Archivos estáticos servidos con subpath

### Frontend
- ✅ Creado `base-path.js` que detecta automáticamente el path
- ✅ Función `apiUrl()` para construir URLs correctamente
- ✅ Todos los `fetch()` actualizados para usar `apiUrl()`
- ✅ WebSocket actualizado para usar BASE_PATH

## 🚀 Pasos rápidos para deploy

### 1. Preparar archivos (en Windows)
```bash
# Comprimir el proyecto
cd c:\xampp\htdocs\comfytd
tar -czf comfytd.tar.gz comfytd/
```

### 2. Subir al VPS
```bash
scp comfytd.tar.gz root@vps-4455523-x.dattaweb.com:/root/
```

### 3. En el VPS
```bash
# Conectar
ssh root@vps-4455523-x.dattaweb.com

# Descomprimir
cd /root
tar -xzf comfytd.tar.gz
cd comfytd

# Dar permisos de ejecución al script
chmod +x install-vps.sh

# Ejecutar instalación
bash install-vps.sh
```

### 4. Configurar Nginx
```bash
# Editar configuración de Nginx
nano /etc/nginx/sites-available/default

# Copiar el contenido de nginx-config.txt
# Pegarlo dentro del bloque server { ... }
# Antes de la línea: listen [::]:443 ssl ipv6only=on;

# Verificar configuración
nginx -t

# Recargar Nginx
systemctl reload nginx
```

### 5. Verificar
```bash
# Ver estado
pm2 status

# Ver logs
pm2 logs comfytd

# Acceder desde el navegador
https://vps-4455523-x.dattaweb.com/comfytd
```

## 🎯 Funcionamiento

### En desarrollo (localhost)
- URL: `http://localhost:8085`
- BASE_PATH: vacío `''`
- WebSocket: `ws://localhost:8085`

### En producción (VPS)
- URL: `https://vps-4455523-x.dattaweb.com/comfytd`
- BASE_PATH: `/comfytd`
- WebSocket: `wss://vps-4455523-x.dattaweb.com/comfytd`

El código detecta automáticamente en qué entorno está y ajusta las rutas.

## 📝 Notas importantes

1. **Puerto 8085**: La app corre en localhost:8085 (no expuesta)
2. **Nginx**: Hace de proxy reverso y maneja SSL
3. **PM2**: Mantiene la app corriendo y la reinicia si falla
4. **WebSocket**: Funciona a través de Nginx con los headers correctos
5. **Imágenes**: Se guardan en `public/imagenes/`

## 🔄 Para actualizar la app

```bash
# Desde Windows, subir archivos actualizados
scp -r comfytd/* root@vps-4455523-x.dattaweb.com:/root/comfytd/

# En el VPS
pm2 restart comfytd
```

## 🐛 Troubleshooting

### App no inicia
```bash
pm2 logs comfytd --lines 50
```

### WebSocket no conecta
```bash
tail -f /var/log/nginx/error.log
```

### Puerto ocupado
```bash
netstat -tulpn | grep 8085
pm2 delete comfytd
pm2 start ecosystem.config.js
```

## ✨ Listo!

Tu aplicación estará disponible en:
**https://vps-4455523-x.dattaweb.com/comfytd**
