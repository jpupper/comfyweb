// ============================================================
// comfyweb - API REST
// ------------------------------------------------------------
//  Navegador (con identidad FSCAUTH):
//    GET  {BASE}/api/status
//    POST {BASE}/api/jobs                    (crear)
//    GET  {BASE}/api/jobs?mine=1&limit=30
//    GET  {BASE}/api/jobs/:id
//    POST {BASE}/api/jobs/:id/cancel
//    POST {BASE}/api/upload-image            (imagen de referencia)
//
//  Puente local (header x-agent-token):
//    POST {BASE}/api/agent/hello
//    POST {BASE}/api/agent/event
//    POST {BASE}/api/agent/jobs/:id/result   (multipart 'file')
//    POST {BASE}/api/agent/jobs/:id/error
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const Job = require('../models/Job');
const hub = require('../lib/hub');
const jobs = require('../lib/jobs');
const r2 = require('../lib/r2');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const BASE_PATH = process.env.BASE_PATH || '/comfyweb';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const MEM_DIR = path.join(__dirname, '..', 'public', 'media');

const subida = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }
});

// --- Espera de respuestas del puente (subida de imagen de referencia) -----
const subidasPendientes = new Map();
let subidaSeq = 0;

function pedirSubidaAlPuente(req) {
    return new Promise((resolve) => {
        if (!hub.state.agent) return resolve({ ok: false, error: 'agente local desconectado' });
        const reqId = 'u' + (++subidaSeq) + '-' + Date.now();
        const timer = setTimeout(() => {
            subidasPendientes.delete(reqId);
            resolve({ ok: false, error: 'timeout del agente local' });
        }, 120000);
        subidasPendientes.set(reqId, (data) => {
            clearTimeout(timer);
            subidasPendientes.delete(reqId);
            resolve(data);
        });
        hub.enviarAlPuente('tunnel:upload', Object.assign({ reqId }, req));
    });
}

// La llama server.js cuando el puente contesta.
function resolverSubida(reqId, data) {
    const cb = subidasPendientes.get(reqId);
    if (cb) cb(data);
}

// --- Puerta del puente local --------------------------------------------
function soloPuente(req, res, next) {
    const t = String(req.headers['x-agent-token'] || '');
    if (!AGENT_TOKEN) return res.status(500).json({ success: false, message: 'AGENT_TOKEN no configurado' });
    if (t !== AGENT_TOKEN) return res.status(401).json({ success: false, message: 'token de agente invalido' });
    return next();
}

// ============================ STATUS =====================================
router.get('/status', async (req, res) => {
    const [enCurso, enCola, hechos] = await Promise.all([
        Job.countDocuments({ status: 'running' }),
        Job.countDocuments({ status: 'queued' }),
        Job.countDocuments({ status: 'done' })
    ]);
    res.json({
        success: true,
        agente: hub.statusNavegador(),
        jobs: { running: enCurso, queued: enCola, done: hechos },
        // Compatibilidad con el contrato del front
        online: !!hub.state.agent,
        comfyConnected: !!hub.state.agentInfo.comfyConnected,
        workflows: hub.state.agentInfo.workflows || []
    });
});

// ============================ JOBS =======================================
router.post('/jobs', authMiddleware, async (req, res) => {
    try {
        const { job, despachado } = await jobs.crearJob(req.body, req.fscUser);
        hub.emitirNavegadores('job:update', { job });
        res.status(201).json({ success: true, job, despachado, agenteOnline: !!hub.state.agent });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

router.get('/jobs', optionalAuth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const filtro = {};
    if (req.query.mine === '1' && req.fscUser) filtro['user.id'] = String(req.fscUser.id);
    if (req.query.kind) filtro.kind = String(req.query.kind);
    const lista = await Job.find(filtro).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, jobs: lista });
});

router.get('/jobs/:id', optionalAuth, async (req, res) => {
    const job = await Job.findById(req.params.id).catch(() => null);
    if (!job) return res.status(404).json({ success: false, message: 'job no encontrado' });
    res.json({ success: true, job });
});

router.post('/jobs/:id/cancel', authMiddleware, async (req, res) => {
    const job = await Job.findById(req.params.id).catch(() => null);
    if (!job) return res.status(404).json({ success: false, message: 'job no encontrado' });
    if (String(job.user && job.user.id) !== String(req.fscUser.id) && req.fscUser.role !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'no es tu job' });
    }
    await jobs.cancelar(job);
    res.json({ success: true, job });
});

// ===================== IMAGEN DE REFERENCIA (I2V) ========================
// El navegador sube el archivo al VPS y el VPS lo manda al puente, que lo
// deposita en el videocomfy local (su /api/upload-image). Asi la imagen
// queda donde el workflow local la puede encontrar.
router.post('/upload-image', authMiddleware, subida.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'falta el archivo (campo image)' });
    if (!hub.state.agent) return res.status(503).json({ success: false, message: 'agente local desconectado' });

    const data = await pedirSubidaAlPuente({
        filename: req.file.originalname || 'referencia.png',
        mime: req.file.mimetype || 'image/png',
        base64: req.file.buffer.toString('base64')
    });

    if (!data || !data.ok) {
        return res.status(502).json({ success: false, message: (data && data.error) || 'no se pudo subir al videocomfy local' });
    }
    res.json({ success: true, filename: data.filename });
});

// ======================== PUENTE LOCAL (agent) ===========================
router.post('/agent/hello', soloPuente, async (req, res) => {
    const b = req.body || {};
    hub.state.agentInfo = Object.assign(hub.state.agentInfo, {
        host: String(b.host || ''),
        platform: String(b.platform || ''),
        videocomfyUrl: String(b.videocomfyUrl || ''),
        comfyVersion: String((b.comfy && b.comfy.comfyui_version) || ''),
        device: String((b.comfy && b.comfy.device) || ''),
        workflows: Array.isArray(b.workflows) ? b.workflows : []
    });
    hub.emitirEstadoAgente();
    res.json({ success: true });
});

router.post('/agent/event', soloPuente, async (req, res) => {
    try {
        await jobs.procesarEventoPuente(req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/agent/jobs/:id/result', soloPuente, subida.single('file'), async (req, res) => {
    const job = await Job.findById(req.params.id).catch(() => null);
    if (!job) return res.status(404).json({ success: false, message: 'job no encontrado' });
    if (!req.file) return res.status(400).json({ success: false, message: 'falta el archivo (campo file)' });

    const filename = req.file.originalname || (job.kind === 'video' ? 'video.mp4' : 'imagen.png');
    const mime = req.file.mimetype || 'application/octet-stream';

    // 1) R2 (camino oficial: el binario NO toca el disco del VPS)
    let subido = await r2.subirMedia(req.file.buffer, {
        tipo: 'comfyweb',
        sub: job.kind === 'video' ? 'videos' : 'imagenes',
        filename,
        mime,
        sobreescribir: false
    });

    // 2) Respaldo en disco: solo si R2 no esta configurado (local / sin credenciales)
    if (!subido) {
        fs.mkdirSync(MEM_DIR, { recursive: true });
        const nombre = Date.now() + '_' + String(filename).replace(/[^\w.\-]+/g, '_');
        fs.writeFileSync(path.join(MEM_DIR, nombre), req.file.buffer);
        subido = { key: '', url: BASE_PATH + '/media/' + nombre };
        console.warn('[comfyweb] R2 no configurado: guardando resultado en disco (respaldo)');
    }

    await jobs.guardarResultado(job, {
        filename, mime, key: subido.key, url: subido.url, bytes: req.file.buffer.length
    });
    res.json({ success: true, url: subido.url });
});

router.post('/agent/jobs/:id/error', soloPuente, async (req, res) => {
    const job = await Job.findById(req.params.id).catch(() => null);
    if (!job) return res.status(404).json({ success: false, message: 'job no encontrado' });
    job.status = 'error';
    job.error = String((req.body && req.body.error) || 'error del agente local').slice(0, 800);
    job.finishedAt = new Date();
    await job.save();
    hub.emitirUsuario(job.user && job.user.id, 'job:update', { job });
    res.json({ success: true });
});

// Cola para el puente que prefiera polling antes que push.
router.get('/agent/jobs/next', soloPuente, async (req, res) => {
    const job = await Job.findOne({ status: 'queued' }).sort({ createdAt: 1 });
    if (!job) return res.json({ success: true, job: null });
    res.json({ success: true, job, payload: jobs.payloadParaVideocomfy(job) });
});

module.exports = router;
module.exports.resolverSubida = resolverSubida;
module.exports.soloPuente = soloPuente;
