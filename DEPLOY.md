# 🚀 Guía de Despliegue - ComfyTD en VPS

## 📋 Requisitos previos
- Node.js instalado en el VPS
- PM2 instalado globalmente (`npm install -g pm2`)
- Nginx configurado
- Acceso SSH al VPS

## 🔧 Pasos de instalación

### 1. Subir archivos al VPS

```bash
# Desde tu máquina local, comprimir el proyecto
cd c:\xampp\htdocs\comfytd
tar -czf comfytd.tar.gz comfytd/

# Subir al VPS (reemplaza con tu IP/dominio)
scp comfytd.tar.gz root@vps-4455523-x.dattaweb.com:/root/

# Conectar al VPS
ssh root@vps-4455523-x.dattaweb.com

# Descomprimir
cd /root
tar -xzf comfytd.tar.gz
cd comfytd
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar Nginx

Agregar este bloque a tu configuración de Nginx (dentro del bloque `server` principal):

```nginx
# APLICACIÓN: ComfyTD (puerto 8085)
location /comfytd {
    proxy_pass http://localhost:8085;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts más largos para WebSocket
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
}
```

Guardar y recargar Nginx:

```bash
nginx -t
systemctl reload nginx
```

### 4. Iniciar la aplicación con PM2

```bash
cd /root/comfytd
pm2 start ecosystem.config.js
pm2 save
```

### 5. Verificar que está corriendo

```bash
pm2 status
pm2 logs comfytd
```

## 🌐 Acceso

La aplicación estará disponible en:
```
https://vps-4455523-x.dattaweb.com/comfytd
```

## 🔄 Actualizar la aplicación

```bash
# Detener la app
pm2 stop comfytd

# Subir nuevos archivos (desde tu máquina local)
scp -r comfytd/* root@vps-4455523-x.dattaweb.com:/root/comfytd/

# En el VPS, reiniciar
pm2 restart comfytd
```

## 📊 Comandos útiles de PM2

```bash
pm2 status              # Ver estado de todas las apps
pm2 logs comfytd        # Ver logs en tiempo real
pm2 logs comfytd --lines 100  # Ver últimas 100 líneas
pm2 restart comfytd     # Reiniciar la app
pm2 stop comfytd        # Detener la app
pm2 delete comfytd      # Eliminar la app de PM2
```

## 🐛 Troubleshooting

### La app no se conecta a ComfyUI
1. Verifica que ComfyUI esté corriendo
2. Configura la URL correcta desde la interfaz web
3. Revisa los logs: `pm2 logs comfytd`

### WebSocket no conecta
1. Verifica que Nginx tenga los headers de WebSocket configurados
2. Revisa que el puerto 8085 esté libre: `netstat -tulpn | grep 8085`
3. Verifica los logs de Nginx: `tail -f /var/log/nginx/error.log`

### Error de permisos
```bash
# Dar permisos a la carpeta de imágenes
chmod -R 755 /root/comfytd/public/imagenes
```

## 🔐 Seguridad

- La aplicación corre en localhost:8085 (no expuesta directamente)
- Nginx maneja SSL/TLS
- Solo accesible a través de HTTPS
