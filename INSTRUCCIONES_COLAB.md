# 🚀 Instrucciones para conectar con Google Colab

## ⚠️ Problema identificado con tu URL de Colab

Tu URL de Colab es:
```
https://8188-gpu-t4-s-38z1ym3un0zb-b.us-west1-1.prod.colab.dev/
```

**Este tipo de URL de Colab NO funciona directamente** porque:
1. Google Colab bloquea conexiones WebSocket externas
2. Necesitas usar **Cloudflare Tunnel** (cloudflared) para exponer ComfyUI

## ✅ Solución: Usar Cloudflare Tunnel

### Paso 1: En tu notebook de Colab

Ejecuta la celda que contiene este código:

```python
!wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i cloudflared-linux-amd64.deb

import subprocess
import threading
import time
import socket

def iframe_thread(port):
  while True:
      time.sleep(0.5)
      sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
      result = sock.connect_ex(('127.0.0.1', port))
      if result == 0:
        break
      sock.close()
  print("\nComfyUI finished loading, trying to launch cloudflared\n")

  p = subprocess.Popen(["cloudflared", "tunnel", "--url", "http://127.0.0.1:{}".format(port)], 
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  for line in p.stderr:
    l = line.decode()
    if "trycloudflare.com " in l:
      print("This is the URL to access ComfyUI:", l[l.find("http"):], end='')

threading.Thread(target=iframe_thread, daemon=True, args=(8188,)).start()

!python main.py
```

### Paso 2: Obtener la URL correcta

Después de ejecutar la celda, verás un mensaje como:
```
This is the URL to access ComfyUI: https://xxx-xxx-xxx.trycloudflare.com
```

**Copia esa URL completa** (debe terminar en `.trycloudflare.com`)

### Paso 3: Configurar en tu aplicación local

1. Abre tu aplicación en `http://localhost:3000`
2. En la sección "Configuración de ComfyUI":
   - Pega la URL de Cloudflare
   - O haz clic en "Colab (Cloudflare)" y pégala cuando te lo pida
3. Haz clic en "Guardar y Conectar"
4. **Revisa el panel de logs** en la parte inferior para ver el estado de la conexión

## 📋 Panel de Logs

El nuevo panel de logs te mostrará:
- ✅ Estado de conexión (verde = conectado, rojo = error)
- 📡 Mensajes del WebSocket
- 🖼️ Cuando se genere una imagen
- ⚠️ Errores de conexión

## 🔧 Cambios realizados

1. **Sistema de logs visual** - Ahora puedes ver todo lo que pasa
2. **Soporte para URLs de Colab** - Detecta automáticamente si es remoto
3. **Modelo actualizado** - Cambiado a `realvisxl.safetensors`
4. **Mejor manejo de errores** - Logs detallados de cada paso

## ❗ Importante

- La URL de Cloudflare **cambia cada vez** que reinicias el notebook de Colab
- Debes actualizar la URL en tu aplicación cada vez que reinicies Colab
- La URL de Colab directa (`*.colab.dev`) **NO funciona** para WebSockets externos

## 🐛 Si tienes problemas

Revisa el panel de logs en tu aplicación. Te dirá exactamente qué está fallando:
- "Error en WebSocket" = Problema de conexión
- "URL inválida" = La URL no tiene el formato correcto
- "WebSocket desconectado" = Se perdió la conexión con el servidor
