# ComfyWeb

UI web remota del **videocomfy** que corre en la PC de Julián. Desde
`https://fullscreencode.com/comfyweb/` se piden imágenes y el trabajo lo hace
**el ComfyUI de la PC** — el VPS no genera nada ni necesita GPU.

```
navegador (FTP/VPS)  <->  comfyweb (VPS :8085)
                                    ^
                          puente local (agent) que SALE hacia afuera
                          y relayea contra  ws://127.0.0.1:5634
                                    |
                            videocomfy local -> ComfyUI :8188 -> RTX 4090
```

- **El VPS no corre Comfy ni guarda binarios**: los resultados van a Cloudflare R2
  (bucket `fscapps`, prefijo `comfyweb/`).
- **No se abre ningún puerto en la PC**: la conexión la inicia el puente local.
- **No se duplica la lógica de generación**: el puente es pasamanos
  (`generarStoryboard`, `generarImagen`, `generarWan22`, progreso y resultados).

## Puesta en marcha (PC de Julián)

1. Levantar **ComfyUI** (`D:\IA\comfynew\ComfyUI`).
2. Levantar **videocomfy** (`D:\Programacion\videocomfy`: `node server.js`, puerto 5634).
3. Correr **`conectar-videocomfy.bat`** (deja la ventana abierta).

Con eso, en la web: semáforo *Agente local* y *Comfy local* en verde.

## Estructura

| Ruta | Qué es |
|---|---|
| `server.js` | Express + socket.io (namespace raíz = navegadores, `/agent` = puente) |
| `routes/jobs.js` | API de trabajos, subida de resultado, imagen de referencia |
| `lib/jobs.js` | Orquestador: traduce el ida y vuelta del videocomfy a documentos Job |
| `lib/hub.js` | Estado del puente y emisión a los navegadores |
| `lib/r2.js` | Subida a Cloudflare R2 (con respaldo a disco si no hay credenciales) |
| `models/Job.js` | Mongo `comfyweb` (estado, progreso, URL del resultado) |
| `agent/videocomfy-bridge.js` | **Puente local**: sale al VPS y relayea contra el videocomfy |
| `agent/.env` | `AGENT_TOKEN` (el mismo que en el `.env` del servidor) |
| `public/` | Front (HTML/CSS/JS separados + `vendor/socket.io.min.js`) |
| `deploy_scripts/` | `run_deploy.bat` → `server_update.sh` (VPS) + `upload_ftp.js` (FTP) |

## API

| Método | Ruta | Quién |
|---|---|---|
| `GET` | `/comfyweb/health` | cualquiera |
| `GET` | `/comfyweb/api/status` | cualquiera |
| `POST` | `/comfyweb/api/jobs` | sesión FSCAUTH |
| `GET` | `/comfyweb/api/jobs?mine=1&limit=30` | sesión FSCAUTH |
| `GET` | `/comfyweb/api/jobs/:id` | cualquiera |
| `POST` | `/comfyweb/api/jobs/:id/cancel` | dueño del job |
| `POST` | `/comfyweb/api/upload-image` | sesión FSCAUTH (imagen de referencia) |
| `POST` | `/comfyweb/api/agent/*` | puente local (`x-agent-token`) |

Sockets: el navegador emite `job:submit` / `job:cancel` y recibe `agent:status`,
`job:update`, `job:log`.

## Sabido / pendiente

- **Video**: el workflow de video de videocomfy (LTX-2 19B / WAN 14B) hace
  crashear ComfyUI con segfault (`exit 139`) en una GPU de 24 GB porque no entra
  junto a Flux. El puente pide `/free {unload_models:true}` antes de un trabajo
  de video, pero **no está probado**. La UI ya tiene el selector *Video*.
- **Imagen**: Flux dev **fp8 fused** (`flux1-dev-fp8.safetensors`), 1024², ~15 s
  con el modelo residente. La primera corrida paga la carga (~5-6 min).
