// ============================================================
// comfyweb - UI web remota del videocomfy local (ecosistema FSC)
// ------------------------------------------------------------
// La app NO genera nada en el VPS:
//   navegador (FTP/VPS)  <->  servidor comfyweb (VPS :8085)
//                                     ^
//                          puente local (agent) que sale hacia
//                          afuera y relayea contra el videocomfy
//                          de la PC: ws://127.0.0.1:5634
//
//   PORT      = 8085
//   BASE_PATH = /comfyweb   -> https://fullscreencode.com/comfyweb/
//   MongoDB   = comfyweb
// ============================================================
require('dotenv').config();

const express = require('express');
const app = express();
const http = require('http');
// El servidor HTTP NO recibe express en el constructor: primero tiene que
// pasar el normalizador de path y el engine de socket.io, y recien despues
// express (asi el handshake nunca lo agarra el catch-all de la SPA).
const servidorHttp = http.createServer();
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const config = require('./config/database');
const hub = require('./lib/hub');
const jobsLib = require('./lib/jobs');
const { fscUser } = require('./middleware/auth');

const PORT = process.env.PORT || 8085;
const BASE_PATH = process.env.BASE_PATH || '/comfyweb';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const NODE_ENV = process.env.NODE_ENV || 'local';

// --- CORS: el front vive en el FTP y la API en el VPS -------------------
const ORIGENES_FSC = [
    'https://fullscreencode.com', 'https://www.fullscreencode.com',
    'https://artedigitaldata.com', 'https://www.artedigitaldata.com',
    'https://exporural.com', 'https://www.exporural.com',
    'https://exporuralsanjuan.com', 'https://www.exporuralsanjuan.com',
    'https://vuelapelucas3000.com', 'https://www.vuelapelucas3000.com',
    'https://vuelapelucas3000.com.ar', 'https://www.vuelapelucas3000.com.ar',
    'https://vps-4455523-x.dattaweb.com'
];
const esOrigenLocal = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(o || ''));

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (ORIGENES_FSC.includes(origin) || esOrigenLocal(origin)) return cb(null, true);
        return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-agent-token'],
    credentials: true
}));
app.options('*', cors());

// --- CSP -----------------------------------------------------------------
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vps-4455523-x.dattaweb.com https://fullscreencode.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://fullscreencode.com https://vps-4455523-x.dattaweb.com https://pub-6289669d41aa4adc9b90385dbd269b1f.r2.dev",
        "media-src 'self' blob: https://vps-4455523-x.dattaweb.com https://pub-6289669d41aa4adc9b90385dbd269b1f.r2.dev",
        "connect-src 'self' https://fullscreencode.com https://vps-4455523-x.dattaweb.com wss://vps-4455523-x.dattaweb.com",
        "worker-src 'self' blob:",
        "frame-ancestors 'self' https://fullscreencode.com"
    ].join('; '));
    next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Compatibilidad de path detras de nginx ------------------------------
// El bloque nginx de /comfyweb/ usa proxy_pass con barra final: le saca el
// prefijo, asi que el handshake de socket.io llega como /socket.io/... mientras
// el engine lo espera en /comfyweb/socket.io. Normalizamos y, MUY IMPORTANTE,
// NO respondemos desde express para esas rutas (return sin next): si el
// catch-all las agarra, le devuelve el index.html y el handshake muere
// (polling: HTML en vez de handshake, websocket: 502).
app.use((req, res, next) => {
    // engine.io ya atendio (o va a atender) estas rutas: express no responde.
    if (req.url.startsWith(BASE_PATH + '/socket.io')) return;
    next();
});

// --- Estaticos (con y sin BASE_PATH) ------------------------------------
app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas ---------------------------------------------------------------
// auth: puente al SSO central (fscauth). No hay login propio.
app.use(BASE_PATH + '/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/auth'));
const jobsRouter = require('./routes/jobs');
app.use(BASE_PATH + '/api', jobsRouter);
app.use('/api', jobsRouter);

app.get([BASE_PATH, BASE_PATH + '/', '/'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/health', BASE_PATH + '/health'], (req, res) => {
    res.json({
        status: 'ok',
        app: 'comfyweb',
        version: '1.0.0',
        basePath: BASE_PATH,
        agente: !!hub.state.agent,
        comfy: !!hub.state.agentInfo.comfyConnected,
        mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        env: NODE_ENV
    });
});

// --- Fallback SPA --------------------------------------------------------
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith(BASE_PATH + '/api/')) {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======================= SOCKET.IO ======================================
// 1) Engine de socket.io (path con prefijo, el que pide el navegador)
const io = new Server(servidorHttp, {
    path: BASE_PATH + '/socket.io',
    cors: {
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (ORIGENES_FSC.includes(origin) || esOrigenLocal(origin)) return cb(null, true);
            return cb(null, false);
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    maxHttpBufferSize: 1e6
});
hub.state.io = io;

// --- Navegadores (namespace raiz) ---------------------------------------
io.on('connection', async (socket) => {
    const token = (socket.handshake.auth && socket.handshake.auth.token)
        || socket.handshake.query.token
        || '';
    let usuario = null;
    if (token) {
        try {
            usuario = await fscUser({ headers: { authorization: 'Bearer ' + token }, query: {} });
        } catch (e) { /* sin sesion: sigue como anonimo */ }
    }
    if (usuario && usuario.id) socket.join('user:' + usuario.id);

    socket.emit('agent:status', hub.statusNavegador());

    // Enviar el trabajo al videocomfy local.
    socket.on('job:submit', async (payload) => {
        try {
            const user = usuario || {
                id: (payload && payload.userId) || '',
                username: (payload && payload.username) || '',
                email: ''
            };
            const { job, despachado } = await jobsLib.crearJob(payload, user);
            io.emit('job:update', { job });
            if (!despachado) {
                socket.emit('job:log', {
                    jobId: String(job._id),
                    line: 'El agente local no está conectado: el trabajo quedó en cola.'
                });
            }
        } catch (err) {
            socket.emit('generation_error', { error: err.message });
        }
    });

    socket.on('job:cancel', async (data) => {
        const jobId = (data && data.jobId) || data;
        const Job = require('./models/Job');
        const job = await Job.findById(jobId).catch(() => null);
        if (job) {
            await jobsLib.cancelar(job);
            io.emit('job:update', { job });
        }
    });

    socket.on('status:request', () => socket.emit('agent:status', hub.statusNavegador()));
});

// --- Puente local (namespace /agent) -----------------------------------
const nspAgente = io.of('/agent');

nspAgente.use((socket, next) => {
    const t = (socket.handshake.auth && socket.handshake.auth.token) || socket.handshake.query.token || '';
    if (!AGENT_TOKEN) return next(new Error('AGENT_TOKEN no configurado en el servidor'));
    if (String(t) !== AGENT_TOKEN) return next(new Error('token de agente invalido'));
    return next();
});

nspAgente.on('connection', async (socket) => {
    hub.state.agent = socket;
    console.log('🔌 Puente local conectado:', socket.id);
    hub.emitirEstadoAgente();

    // Despachar lo que haya quedado encolado mientras no había puente.
    try {
        const n = await jobsLib.despacharPendientes();
        if (n) console.log(`⏩ ${n} trabajo(s) encolado(s) despachados al puente`);
    } catch (e) {
        console.warn('No pude despachar pendientes:', e.message);
    }

    // Mensajes crudos del videocomfy local.
    socket.on('tunnel:event', async (msg) => {
        try {
            await jobsLib.procesarEventoPuente(msg);
        } catch (e) {
            console.error('Error procesando evento del puente:', e.message);
        }
    });

    // Respuesta de subida de imagen de referencia.
    socket.on('tunnel:upload:result', (data) => {
        if (data && data.reqId) jobsRouter.resolverSubida(data.reqId, data);
    });

    socket.on('agent:hello', (info) => {
        const b = info || {};
        hub.state.agentInfo = Object.assign(hub.state.agentInfo, {
            host: String(b.host || ''),
            platform: String(b.platform || ''),
            videocomfyUrl: String(b.videocomfyUrl || ''),
            comfyConnected: !!b.comfyConnected,
            comfyVersion: String((b.comfy && b.comfy.comfyui_version) || ''),
            device: String((b.comfy && (b.comfy.device || b.comfy.gpu)) || ''),
            workflows: Array.isArray(b.workflows) ? b.workflows : []
        });
        console.log('ℹ️ Puente local:', hub.state.agentInfo.host || 'PC', '| videocomfy:', hub.state.agentInfo.videocomfyUrl);
        hub.emitirEstadoAgente();
    });

    socket.on('agent:log', (line) => console.log('[puente]', line));

    socket.on('disconnect', (motivo) => {
        if (hub.state.agent && hub.state.agent.id === socket.id) {
            hub.state.agent = null;
            hub.state.agentInfo.comfyConnected = false;
            console.log('❌ Puente local desconectado:', motivo);
            hub.emitirEstadoAgente();
        }
    });
});

// ======================= ARRANQUE =======================================
// 3) Normalizador de path, PRIMERO en la cola de listeners.
//    nginx sirve /comfyweb/ con proxy_pass de barra final: le saca el prefijo
//    al upstream, asi que el handshake de socket.io llega como /socket.io/...
//    mientras el engine lo espera en /comfyweb/socket.io. prependListener
//    DESPUES de crear el Server deja este handler delante del engine y de
//    express, que es lo unico que garantiza el orden (engine tambien se
//    engancha al evento 'request').
['request', 'upgrade'].forEach((evento) => {
    servidorHttp.prependListener(evento, (req) => {
        if (req.url && req.url.startsWith('/socket.io')) {
            req.url = BASE_PATH + req.url;
        }
    });
});

// 4) Express al final, y con guarda: si el request es de socket.io ya lo
//    atendio engine.io, asi que express NO debe tocarlo. Si corre igual,
//    expressInit intenta setHeader sobre una respuesta ya enviada y tira
//    ERR_HTTP_HEADERS_SENT en cada handshake.
servidorHttp.on('request', (req, res) => {
    if (req.url && req.url.startsWith(BASE_PATH + '/socket.io')) return;
    app(req, res);
});

async function startServer() {
    servidorHttp.listen(PORT, '0.0.0.0', () => {
        console.log('\n===========================================');
        console.log(`✅ comfyweb corriendo en el puerto ${PORT}`);
        console.log(`   Local: http://localhost:${PORT}${BASE_PATH}/`);
        console.log('===========================================\n');
    });

    try {
        await mongoose.connect(config.mongoURI, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ MongoDB conectado:', config.mongoURI);
    } catch (err) {
        console.error('❌ MongoDB error (el server sigue arriba):', err.message);
    }
}

process.on('SIGTERM', () => { servidorHttp.close(); mongoose.connection.close(); process.exit(0); });
process.on('SIGINT', () => { servidorHttp.close(); mongoose.connection.close(); process.exit(0); });

startServer();
