// ============================================================
// jptask - Identidad FSC (SSO del ecosistema Fullscreen)
// ------------------------------------------------------------
// La app NO tiene login propio: la sesion la emite fscauth y la
// validamos SIEMPRE server->server contra /fscauth/api/auth/verify
// (o, como respaldo, verificando localmente el JWT con el JWT_SECRET
// compartido del ecosistema). El cliente NUNCA declara su identidad.
//
//   req.fscUser = { id, username, email, role }  |  null
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// Para server->server usamos la URL interna del VPS; si no esta, el dominio publico.
const FSCAUTH_URL = process.env.FSCAUTH_URL || 'https://vps-4455523-x.dattaweb.com/fscauth';
// Solo para desarrollo local sin fscauth levantado (NUNCA en el VPS).
const ALLOW_DEV_USER_ID = process.env.ALLOW_DEV_USER_ID === '1';

function tokenFrom(req) {
    const h = String((req.headers && req.headers.authorization) || '');
    if (h.startsWith('Bearer ')) return h.slice(7);
    if (req.query && req.query.token) return String(req.query.token);
    const cookie = String((req.headers && req.headers.cookie) || '');
    const m = cookie.match(/(?:^|;\s*)fsc_token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    return null;
}

// Valida el token contra fscauth (la unica fuente de verdad de la identidad).
async function verifyAgainstFscAuth(token) {
    try {
        const r = await fetch(FSCAUTH_URL.replace(/\/$/, '') + '/api/auth/verify', {
            headers: { Authorization: 'Bearer ' + token }
        });
        const d = await r.json();
        if (d && d.loggedIn === true && d.user) {
            return {
                id: String(d.user.id || ''),
                username: String(d.user.username || ''),
                email: String(d.user.email || ''),
                role: d.user.role || 'USER'
            };
        }
    } catch (err) {
        console.warn('[AUTH] fscauth no respondio:', err.message);
    }
    return null;
}

// Respaldo: el JWT del ecosistema firmado con el JWT_SECRET compartido.
function verifyLocally(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    try {
        const d = jwt.verify(token, secret);
        return { id: String(d.id || ''), username: d.username || '', email: d.email || '', role: d.role || 'USER' };
    } catch (e) {
        return null;
    }
}

// Resuelve la sesion FSC del request (identidad verificada, nunca la del cliente).
async function fscUser(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    return (await verifyAgainstFscAuth(token)) || verifyLocally(token);
}

async function optionalAuth(req, _res, next) {
    req.fscUser = await fscUser(req);
    next();
}

// Puerta para las rutas personales: sin identidad FSC valida -> 401.
async function authMiddleware(req, res, next) {
    req.fscUser = await fscUser(req);
    if (req.fscUser && req.fscUser.id) return next();

    // Desarrollo local: permitir userId declarado en la query SOLO si esta activado.
    if (ALLOW_DEV_USER_ID) {
        const devId = (req.query && req.query.userId) || (req.body && req.body.userId);
        if (devId) {
            req.fscUser = { id: String(devId), username: 'dev', email: '', role: 'USER', dev: true };
            return next();
        }
    }
    return res.status(401).json({ success: false, message: 'Sesion FSCAUTH requerida' });
}

module.exports = { authMiddleware, optionalAuth, fscUser, tokenFrom, FSCAUTH_URL, ALLOW_DEV_USER_ID };
module.exports.authMiddleware = authMiddleware;
