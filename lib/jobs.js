// ============================================================
// comfyweb - Orquestador de trabajos
// ------------------------------------------------------------
// La web NO genera nada: arma el pedido y se lo pasa al puente
// local (agent), que lo relayea al videocomfy de la PC
// (ws://127.0.0.1:5634) y devuelve progreso + resultado.
// Aca se traduce ese ida y vuelta a documentos Job.
// ============================================================
'use strict';

const Job = require('../models/Job');
const hub = require('./hub');

const KINDS = ['image', 'video'];

function limpiarTexto(v, max) {
    return String(v == null ? '' : v).slice(0, max || 4000);
}

function numero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

// --- Payload -> documento Job ---------------------------------------------
function normalizarPayload(payload, user) {
    const body = payload || {};
    const kind = KINDS.includes(body.kind) ? body.kind : 'image';
    const params = body.params && typeof body.params === 'object' ? body.params : {};

    const limpio = {};
    ['storyboardSteps', 'videoWidth', 'videoHeight', 'videoLength', 'samplerSteps', 'cfgScale', 'seed', 'step'].forEach((k) => {
        const n = numero(params[k]);
        if (n !== undefined) limpio[k] = n;
    });
    // El front manda "pasos" como samplerSteps; el workflow de imagen de
    // videocomfy lee storyboardSteps. Sin este puente, el campo PASOS de la
    // UI no hacia nada en imagenes (quedaba el default).
    if (kind === 'image' && limpio.storyboardSteps === undefined && limpio.samplerSteps !== undefined) {
        limpio.storyboardSteps = limpio.samplerSteps;
    }
    // Guias: la app local espera videoWidth/videoHeight y storyboardSteps.
    if (limpio.storyboardSteps === undefined) limpio.storyboardSteps = 25;
    if (limpio.videoWidth === undefined) limpio.videoWidth = 1024;
    if (limpio.videoHeight === undefined) limpio.videoHeight = 1024;

    return {
        kind,
        prompt: limpiarTexto(body.prompt, 4000),
        workflow: limpiarTexto(body.workflow, 120),
        params: limpio,
        imageFilename: limpiarTexto(body.imageFilename, 260),
        user: {
            id: String((user && user.id) || ''),
            username: String((user && user.username) || ''),
            email: String((user && user.email) || '')
        }
    };
}

// --- Job -> mensaje que entiende videocomfy -------------------------------
function payloadParaVideocomfy(job) {
    const base = {
        prompt: job.prompt,
        params: job.params || {},
        batchId: String(job._id),
        batchName: 'ComfyWeb',
        // videocomfy devuelve este id en prompt_queued: es como el puente
        // sabe a que job pertenece cada respuesta.
        queueItemId: String(job._id)
    };

    if (job.kind === 'video') {
        const msg = Object.assign({ type: 'generarImagen' }, base);
        if (job.imageFilename) msg.imageFilename = job.imageFilename;
        return msg;
    }
    return Object.assign({
        type: 'generarStoryboard',
        storyboardIndex: 0,
        isForWan: false
    }, base);
}

// --- Alta + despacho ------------------------------------------------------
async function crearJob(payload, user) {
    const datos = normalizarPayload(payload, user);
    if (!datos.prompt) {
        const e = new Error('Falta el prompt');
        e.status = 400;
        throw e;
    }

    const job = await Job.create(datos);
    const despachado = await despachar(job);
    return { job, despachado };
}

// Manda el job al puente si esta conectado. Si no, queda en cola.
async function despachar(job) {
    const ok = hub.enviarAlPuente('tunnel:send', {
        jobId: String(job._id),
        payload: payloadParaVideocomfy(job)
    });
    if (ok) {
        hub.emitirUsuario(job.user && job.user.id, 'job:update', { job });
    }
    return ok;
}

// Al conectarse el puente se despacha todo lo que quedo encolado.
async function despacharPendientes() {
    if (!hub.state.agent) return 0;
    const pendientes = await Job.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(20);
    let n = 0;
    for (const job of pendientes) {
        if (await despachar(job)) n++;
    }
    return n;
}

// --- Actualizacion de estado ---------------------------------------------
async function actualizar(job, cambios, evento) {
    Object.assign(job, cambios);
    await job.save();
    hub.emitirUsuario(job.user && job.user.id, 'job:update', { job });
    if (evento) hub.emitirNavegadores(evento, { job });
    return job;
}

async function agregarLog(job, linea) {
    const texto = limpiarTexto(linea, 400);
    if (!texto) return job;
    job.log.push(texto);
    if (job.log.length > 60) job.log = job.log.slice(-60);
    await job.save();
    hub.emitirUsuario(job.user && job.user.id, 'job:log', { jobId: String(job._id), line: texto });
    return job;
}

// --- Eventos que llegan del puente (mensajes crudos de videocomfy) --------
async function procesarEventoPuente(msg) {
    if (!msg || typeof msg !== 'object') return;

    // El puente agrega jobId cuando lo puede resolver.
    let job = null;
    if (msg.jobId) job = await Job.findById(msg.jobId).catch(() => null);
    if (!job && msg.prompt_id) job = await Job.findOne({ promptId: msg.prompt_id });
    if (!job && msg.queueItemId) job = await Job.findById(msg.queueItemId).catch(() => null);

    switch (msg.type) {
        case 'comfy_status':
            hub.state.agentInfo.comfyConnected = (msg.status === 'connected');
            hub.emitirEstadoAgente();
            return;

        case 'queue_state':
            if (typeof msg.comfyConnected === 'boolean') {
                hub.state.agentInfo.comfyConnected = msg.comfyConnected;
                hub.emitirEstadoAgente();
            }
            return;

        case 'prompt_queued': {
            if (!job) return;
            await actualizar(job, {
                status: 'running',
                promptId: msg.prompt_id || '',
                startedAt: job.startedAt || new Date()
            });
            return;
        }

        case 'progress': {
            if (!job) return;
            const d = msg.data || msg;
            const value = numero(d.value);
            const max = numero(d.max);
            job.progress = {
                value: value === undefined ? job.progress.value : value,
                max: max === undefined ? job.progress.max : max,
                node: String(d.node == null ? job.progress.node : d.node)
            };
            if (job.status === 'queued') job.status = 'running';
            await job.save();
            hub.emitirUsuario(job.user && job.user.id, 'job:update', { job });
            return;
        }

        case 'executing': {
            if (!job) return;
            const d = msg.data || msg;
            job.progress.node = String(d.node == null ? '' : d.node);
            await job.save();
            hub.emitirUsuario(job.user && job.user.id, 'job:update', { job });
            return;
        }

        case 'storyboard_generated':
        case 'video_generated': {
            if (!job) return;
            // No pisar un job ya terminado: el binario llega aparte por
            // POST /api/agent/jobs/:id/result y es el que cierra el job.
            if (job.status === 'done') return;
            await actualizar(job, {
                status: 'running',
                progress: { value: 1, max: 1, node: job.progress.node },
                error: ''
            });
            return;
        }

        case 'generation_error': {
            if (!job) return;
            await actualizar(job, {
                status: 'error',
                error: limpiarTexto(msg.error || 'Error en videocomfy', 800),
                finishedAt: new Date()
            });
            return;
        }

        default:
            // Mensajes informativos (status, etc.) -> solo log
            if (job && msg.type) await agregarLog(job, msg.type);
            return;
    }
}

// --- Resultado (binario) -------------------------------------------------
async function guardarResultado(job, { buffer, filename, mime, key, url, bytes }) {
    const esVideo = String(mime || '').startsWith('video') || job.kind === 'video';
    await actualizar(job, {
        status: 'done',
        resultUrl: url,
        resultKey: key || '',
        resultName: filename || '',
        resultMime: mime || '',
        resultBytes: bytes || (buffer ? buffer.length : 0),
        kind: esVideo ? 'video' : job.kind,
        progress: { value: 1, max: 1, node: job.progress.node },
        finishedAt: new Date(),
        error: ''
    }, 'job:done');
    return job;
}

async function cancelar(job) {
    hub.enviarAlPuente('tunnel:cancel', { jobId: String(job._id) });
    return actualizar(job, { status: 'cancelled', finishedAt: new Date() });
}

module.exports = {
    crearJob,
    despachar,
    despacharPendientes,
    procesarEventoPuente,
    guardarResultado,
    cancelar,
    agregarLog,
    payloadParaVideocomfy,
    normalizarPayload
};
