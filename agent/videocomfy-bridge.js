// ============================================================
// comfyweb - PUENTE LOCAL (corre en la PC de Julián)
// ------------------------------------------------------------
// Sale HACIA AFUERA al servidor comfyweb del VPS y relayea, en los
// dos sentidos, contra el videocomfy local (ws://127.0.0.1:5634).
//
//   web  -> VPS -> [este puente] -> videocomfy local -> ComfyUI local
//   web  <- VPS <- [este puente] <- videocomfy local <- ComfyUI local
//
// NO reimplementa generación: es pasamanos.
// NO abre puertos en la PC: la conexión la inicia este proceso.
//
//   Correr:  conectar-videocomfy.bat   (o: node agent/videocomfy-bridge.js)
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// .env del puente (agent/.env), con el del proyecto como respaldo.
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { io } = require('socket.io-client');
const WebSocket = require('ws');

// ------------------------------ config ------------------------------------
const CFG = {
    VPS_URL: (process.env.VPS_URL || 'https://vps-4455523-x.dattaweb.com').replace(/\/+$/, ''),
    BASE_PATH: process.env.BASE_PATH || '/comfyweb',
    AGENT_TOKEN: process.env.AGENT_TOKEN || '',
    VIDEOCOMFY_HTTP: (process.env.VIDEOCOMFY_HTTP || 'http://127.0.0.1:5634').replace(/\/+$/, ''),
    VIDEOCOMFY_WS: process.env.VIDEOCOMFY_WS || 'ws://127.0.0.1:5634',
    COMFY_HTTP: (process.env.COMFY_HTTP || 'http://127.0.0.1:8188').replace(/\/+$/, ''),
    RECONEXION_MS: Number(process.env.RECONEXION_MS || 5000)
};

if (!CFG.AGENT_TOKEN) {
    console.error('❌ Falta AGENT_TOKEN. Copiá agent/.env.example a agent/.env y completá el token (el mismo del .env del servidor).');
    process.exit(1);
}

// ------------------------------ estado ------------------------------------
let ws = null;                    // socket al videocomfy local
let socketVps = null;             // socket.io al VPS (namespace /agent)
const promptIdAJob = new Map();   // prompt_id de ComfyUI -> jobId de la web
const jobAPromptId = new Map();   // jobId -> prompt_id de ComfyUI
const subidasEnCurso = new Map(); // reqId -> {filename} (upload en vuelo)

// El videocomfy NO manda prompt_id en los mensajes de 'progress' (solo value/max).
// Comfy ejecuta en FIFO, asi que el progreso pertenece al job mas viejo que
// todavia no termino: esa es la cola de atribucion.
const colaEnEjecucion = [];       // [{ jobId, promptId }]

function encolarEnEjecucion(jobId, promptId) {
    if (!jobId) return;
    if (colaEnEjecucion.some((x) => x.jobId === jobId)) return;
    colaEnEjecucion.push({ jobId, promptId });
}

function desencolarEnEjecucion(jobId) {
    const i = colaEnEjecucion.findIndex((x) => x.jobId === jobId);
    if (i !== -1) colaEnEjecucion.splice(i, 1);
}

function jobEnEjecucion() {
    return colaEnEjecucion.length ? colaEnEjecucion[0].jobId : null;
}

const log = (...a) => console.log(`[${new Date().toLocaleTimeString('es-AR')}]`, ...a);

// --------------------------- helpers HTTP ---------------------------------
async function comfyInfo() {
    try {
        const r = await fetch(CFG.COMFY_HTTP + '/system_stats');
        if (!r.ok) return null;
        const d = await r.json();
        const dev = (d.devices && d.devices[0]) || {};
        return {
            comfyui_version: d.system && d.system.comfyui_version,
            python_version: d.system && d.system.python_version,
            device: dev.name || '',
            vram_total: dev.vram_total || 0
        };
    } catch (e) {
        return null;
    }
}

async function comfyConectado() {
    try {
        const r = await fetch(CFG.COMFY_HTTP + '/system_stats', { signal: AbortSignal.timeout(3000) });
        return r.ok;
    } catch (e) {
        return false;
    }
}

const WORKFLOWS = [
    { id: 'flux', label: 'Flux (imagen)', kind: 'image' },
    { id: 'ltx2', label: 'LTX-2 (video, texto o imagen)', kind: 'video' }
];

function enviarAlVps(evento, payload) {
    if (!socketVps || !socketVps.connected) return false;
    socketVps.emit(evento, payload);
    return true;
}

// El video usa modelos enormes (LTX-2 19B fp8, WAN 14B): si Flux sigue
// cargado no entran en 24 GB y ComfyUI muere con segfault (exit 139).
// Antes de un trabajo de video le pedimos a Comfy que descargue modelos.
async function liberarVram() {
    try {
        const r = await fetch(CFG.COMFY_HTTP + '/free', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unload_models: true, free_memory: true })
        });
        if (r.ok) {
            log('🧹 VRAM liberada en Comfy (unload_models) antes del trabajo de video');
            await new Promise((res) => setTimeout(res, 4000));
        }
    } catch (e) {
        log('⚠️  No pude liberar VRAM:', e.message);
    }
}

// ------------------------ socket.io hacia el VPS --------------------------
function conectarVps() {
    const url = CFG.VPS_URL + '/agent';
    log(`🔌 Conectando al VPS: ${url} (path ${CFG.BASE_PATH}/socket.io)`);

    socketVps = io(url, {
        path: CFG.BASE_PATH + '/socket.io',
        auth: { token: CFG.AGENT_TOKEN, host: os.hostname() },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: CFG.RECONEXION_MS,
        reconnectionDelayMax: 15000
    });

    socketVps.on('connect', async () => {
        log('✅ Conectado al VPS como puente del videocomfy local');
        const info = await comfyInfo();
        enviarAlVps('agent:hello', {
            host: os.hostname(),
            platform: os.platform() + ' ' + os.release(),
            videocomfyUrl: CFG.VIDEOCOMFY_HTTP,
            comfyConnected: !!info,
            comfy: info || {},
            workflows: WORKFLOWS
        });
        // Reclamar el estado actual de la cola del videocomfy local.
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'request_queue_state' }));
    });

    socketVps.on('connect_error', (e) => log('⚠️  Sin conexión al VPS:', e.message));
    socketVps.on('disconnect', (m) => log('🔌 Desconectado del VPS:', m));

    // ---- web -> videocomfy local ----
    socketVps.on('tunnel:send', async ({ jobId, payload } = {}) => {
        if (!payload) return;
        // Los trabajos de video necesitan la VRAM libre (ver liberarVram).
        if (payload.type === 'generarImagen' || payload.type === 'generarWan22') {
            await liberarVram();
        }
        // queueItemId = jobId: es lo que permite atar cada respuesta al job de la web.
        payload.queueItemId = jobId;
        jobAPromptId.set(jobId, null);
        enviarVideocomfy(payload, `job ${jobId}`);
    });

    socketVps.on('tunnel:cancel', async ({ jobId } = {}) => {
        log(`⛔ Cancelando job ${jobId}`);
        try {
            await fetch(CFG.COMFY_HTTP + '/interrupt', { method: 'POST' });
            await fetch(CFG.COMFY_HTTP + '/queue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear: true })
            });
        } catch (e) { log('   no pude interrumpir Comfy:', e.message); }
    });

    // ---- subida de imagen de referencia (web -> videocomfy local) ----
    socketVps.on('tunnel:upload', async (req) => {
        try {
            const buf = Buffer.from(req.base64 || '', 'base64');
            const form = new FormData();
            form.append('image', new Blob([buf], { type: req.mime || 'image/png' }), req.filename || 'referencia.png');
            const r = await fetch(CFG.VIDEOCOMFY_HTTP + '/api/upload-image', { method: 'POST', body: form });
            const d = await r.json().catch(() => ({}));
            const ok = r.ok && (d.filename || d.name);
            log(`📤 Imagen de referencia subida al videocomfy: ${d.filename || d.name || '(sin nombre)'}`);
            enviarAlVps('tunnel:upload:result', {
                reqId: req.reqId, ok: !!ok,
                filename: d.filename || d.name || '',
                error: ok ? '' : ('videocomfy respondió ' + r.status)
            });
        } catch (e) {
            enviarAlVps('tunnel:upload:result', { reqId: req.reqId, ok: false, error: e.message });
        }
    });
}

// ---------------------- websocket al videocomfy ---------------------------
function enviarVideocomfy(mensaje, etiqueta) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(mensaje));
        log(`➡️  ${mensaje.type} enviado al videocomfy${etiqueta ? ' (' + etiqueta + ')' : ''}`);
        return true;
    }
    log('⚠️  El videocomfy local no está conectado: no pude enviar', mensaje.type);
    return false;
}

function conectarVideocomfy() {
    log(`🔌 Conectando al videocomfy local: ${CFG.VIDEOCOMFY_WS}`);
    ws = new WebSocket(CFG.VIDEOCOMFY_WS);

    ws.on('open', () => {
        log('✅ Conectado al videocomfy local (:5634)');
        ws.send(JSON.stringify({ type: 'request_queue_state' }));
    });

    ws.on('message', async (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
        try { await relayarAlVps(msg); } catch (e) { log('Error relayando:', e.message); }
    });

    ws.on('close', () => {
        log('🔌 videocomfy local cerrado. Reintento en', (CFG.RECONEXION_MS / 1000) + 's');
        setTimeout(conectarVideocomfy, CFG.RECONEXION_MS);
    });

    ws.on('error', (e) => log('⚠️  Error websocket videocomfy:', e.message));
}

// ---------------------- videocomfy -> web (relay) -------------------------
async function relayarAlVps(msg) {
    const tipo = msg.type;
    let jobId = null;

    switch (tipo) {
        case 'prompt_queued': {
            jobId = msg.queueItemId || null;
            if (jobId && msg.prompt_id) {
                promptIdAJob.set(msg.prompt_id, jobId);
                jobAPromptId.set(jobId, msg.prompt_id);
            }
            if (jobId) encolarEnEjecucion(jobId, msg.prompt_id || '');
            break;
        }
        case 'progress':
        case 'executing':
        case 'execution_error':
        case 'generation_error': {
            const pid = (msg.data && msg.data.prompt_id) || msg.prompt_id;
            jobId = (pid && promptIdAJob.get(pid)) || jobEnEjecucion();
            if (tipo === 'generation_error' || tipo === 'execution_error') desencolarEnEjecucion(jobId);
            break;
        }
        case 'storyboard_generated':
        case 'video_generated': {
            jobId = (msg.prompt_id && promptIdAJob.get(msg.prompt_id)) || jobEnEjecucion();
            break;
        }
        default:
            break;
    }

    // Estado del Comfy local: lo usamos para el semáforo de la web.
    if (tipo === 'comfy_status') {
        enviarAlVps('tunnel:event', { type: 'comfy_status', status: msg.status });
        return;
    }

    enviarAlVps('tunnel:event', Object.assign({}, msg, jobId ? { jobId } : {}));

    if (tipo === 'storyboard_generated' || tipo === 'video_generated') {
        if (jobId) {
            // El archivo vive en el videocomfy local: lo bajamos y lo entregamos al VPS.
            try {
                await subirResultado(jobId, msg.url || ('/uploads/' + msg.filename), msg.filename, tipo === 'video_generated');
            } catch (e) {
                log('❌ No pude entregar el resultado al VPS:', e.message);
                enviarAlVps('agent:log', 'entrega de resultado fallida: ' + e.message);
            }
        }
        if (jobId) desencolarEnEjecucion(jobId);
        if (msg.prompt_id) promptIdAJob.delete(msg.prompt_id);
        log(`🖼️  ${tipo}${jobId ? ' (job ' + jobId + ')' : ' (sin job asociado)'}: ${msg.filename || msg.url}`);
    } else if (tipo === 'progress') {
        const d = msg.data || {};
        if (d.max) process.stdout.write(`\r   ${d.value}/${d.max} (nodo ${d.node || '-'})      `);
    } else if (tipo === 'generation_error' || tipo === 'execution_error') {
        log('❌ Error en el videocomfy/Comfy:', JSON.stringify(msg.error || msg.data || {}).slice(0, 300));
    }
}

// Baja el resultado del videocomfy local y lo entrega al VPS.
async function subirResultado(jobId, urlRelativa, filename, esVideo) {
    const url = urlRelativa.startsWith('http') ? urlRelativa : CFG.VIDEOCOMFY_HTTP + urlRelativa;
    log(`⬇️  Bajando resultado del videocomfy local: ${url}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error('no pude bajar el resultado (' + r.status + ')');
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get('content-type') || (esVideo ? 'video/mp4' : 'image/png');
    const nombre = filename || ('resultado.' + (esVideo ? 'mp4' : 'png'));

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), nombre);

    const destino = `${CFG.VPS_URL}${CFG.BASE_PATH}/api/agent/jobs/${jobId}/result`;
    const up = await fetch(destino, {
        method: 'POST',
        headers: { 'x-agent-token': CFG.AGENT_TOKEN, 'ngrok-skip-browser-warning': '1' },
        body: form
    });
    const d = await up.json().catch(() => ({}));
    if (!up.ok) throw new Error('el VPS rechazó el resultado: ' + up.status + ' ' + JSON.stringify(d).slice(0, 200));
    log(`✅ Resultado entregado al VPS (${(buf.length / 1024 / 1024).toFixed(2)} MB) -> ${d.url || ''}`);
}

// ------------------------------ latido ------------------------------------
setInterval(async () => {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'request_queue_state' }));
}, 20000);

setInterval(async () => {
    if (!socketVps || !socketVps.connected) return;
    const info = await comfyInfo();
    enviarAlVps('tunnel:event', { type: 'comfy_status', status: info ? 'connected' : 'disconnected' });
}, 30000);

// ------------------------------ arranque ----------------------------------
log('=============================================');
log(' comfyweb - puente local del videocomfy');
log(' PC:', os.hostname(), '| Node', process.version);
log(' VPS:', CFG.VPS_URL, '| videocomfy:', CFG.VIDEOCOMFY_WS);
log('=============================================');
conectarVps();
conectarVideocomfy();
