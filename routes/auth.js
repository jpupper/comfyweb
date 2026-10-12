// ============================================================
// jptask - Puente de AUTENTICACION al sistema central (FSCAUTH)
// ------------------------------------------------------------
// jptask NO tiene usuarios ni login propio: todo pasa por fscauth
// (base global `fullscreen_global`, SSO del ecosistema). Estas rutas
// son el proxy server->server para cuando el front quiere autenticar
// por API en vez de redirigir a fscauth/login.html.
//
//   POST /register  · /login  · /forgot-password  · /reset-password
//   GET  /verify    · /profile
// ============================================================
'use strict';

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Interno (localhost) en el VPS; el dominio publico como respaldo.
const FSC_AUTH_API = (process.env.FSC_AUTH_API || 'https://vps-4455523-x.dattaweb.com/fscauth/api').replace(/\/$/, '');
const APP_ORIGIN = process.env.APP_ORIGIN || 'jptask';

const handleProxyError = (res, err) => {
    console.error('[FSCAUTH Proxy]', err.message);
    return res.status(500).json({ error: 'Error al conectar con el sistema central de autenticacion' });
};

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        const response = await fetch(`${FSC_AUTH_API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, origin: APP_ORIGIN })
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        return res.status(201).json({ token: data.token, user: data.user });
    } catch (err) {
        return handleProxyError(res, err);
    }
});

router.post('/login', async (req, res) => {
    try {
        const { identifier, username, email, password } = req.body;
        const loginId = identifier || email || username;
        if (!loginId || !password) {
            return res.status(400).json({ error: 'Email/usuario y contraseña son obligatorios' });
        }
        const response = await fetch(`${FSC_AUTH_API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: loginId, password })
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        return res.json({ token: data.token, user: data.user });
    } catch (err) {
        return handleProxyError(res, err);
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const response = await fetch(`${FSC_AUTH_API}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, origin: APP_ORIGIN })
        });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return handleProxyError(res, err);
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const response = await fetch(`${FSC_AUTH_API}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword: password })
        });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return handleProxyError(res, err);
    }
});

// Verifica la sesion (Bearer o cookie fsc_token) contra fscauth.
router.get('/verify', async (req, res) => {
    try {
        const auth = req.headers.authorization || '';
        const cookie = req.headers.cookie || '';
        const headers = {};
        if (auth) headers.Authorization = auth;
        if (!auth && cookie) headers.Cookie = cookie;

        const response = await fetch(`${FSC_AUTH_API}/auth/verify`, { headers });
        const data = await response.json();
        return res.json(data);
    } catch (err) {
        console.warn('[FSCAUTH Proxy] verify:', err.message);
        return res.json({ loggedIn: false });
    }
});

// Perfil universal (identidad + licencia). Solo lectura aca:
// la edicion la hace el pasaporte de fscauth.
router.get('/profile', async (req, res) => {
    try {
        const auth = req.headers.authorization || '';
        const headers = {};
        if (auth) headers.Authorization = auth;
        else if (req.headers.cookie) headers.Cookie = req.headers.cookie;

        const response = await fetch(`${FSC_AUTH_API}/auth/profile`, { headers });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return handleProxyError(res, err);
    }
});

module.exports = router;
