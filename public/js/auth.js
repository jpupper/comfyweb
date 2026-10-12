// ============================================================
// comfyweb - AUTH del front (SSO del ecosistema FSC / FSCAUTH)
// ------------------------------------------------------------
// comfyweb NO tiene login propio: redirige a fscauth y captura el retorno
//   <fscauth>/login.html?redirect=<estaPagina>&origin=comfyweb
//   -> vuelve con ?token=..&username=..&userId=..
// El token se guarda en localStorage (mismo origen que fscauth en
// fullscreencode.com, que es lo confiable) y se limpia la URL.
// Orden obligatorio de carga: config.js -> ui.js -> auth.js -> menu.js
// ============================================================
'use strict';

const AUTH_TOKEN_KEY = 'comfyweb_token';
const AUTH_USER_KEY = 'comfyweb_user';
// Modo local: permite probar sin fscauth levantado (el server lo acepta solo
// con ALLOW_DEV_USER_ID=1). Nunca aplica en produccion.
const AUTH_DEV_KEY = 'comfyweb_dev_user';

function getDevUser() { return localStorage.getItem(AUTH_DEV_KEY); }
function setDevUser(id) { id ? localStorage.setItem(AUTH_DEV_KEY, String(id)) : localStorage.removeItem(AUTH_DEV_KEY); }
function removeDev() { localStorage.removeItem(AUTH_DEV_KEY); }


function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function setToken(t) { localStorage.setItem(AUTH_TOKEN_KEY, t); }
function removeToken() { localStorage.removeItem(AUTH_TOKEN_KEY); }

function getUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function setUser(u) { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u)); }
function removeUser() { localStorage.removeItem(AUTH_USER_KEY); }

function isLoggedIn() { return !!getToken() || !!getDevUser(); }
function isAdmin() {
  const u = getUser();
  return !!u && (u.role === 'ADMIN' || u.role === 'SYSTEM');
}
function getUserId() {
  const dev = getDevUser();
  if (!getToken() && dev) return dev;
  const u = getUser();
  return u ? (u.id || u._id || null) : null;
}
function getUserUsername() {
  if (!getToken() && getDevUser()) return 'local';
  const u = getUser();
  return u ? u.username : null;
}

// URL del API: en modo local agrega ?userId= (el server solo lo acepta con
// ALLOW_DEV_USER_ID=1). En produccion la identidad la resuelve el servidor.
function apiUrl(path) {
  const dev = getDevUser();
  if (!getToken() && dev) {
    return CONFIG.API_URL + path + (path.includes('?') ? '&' : '?') + 'userId=' + encodeURIComponent(dev);
  }
  return CONFIG.API_URL + path;
}

function authHeaders(extra) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}


function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json);
  } catch (e) { return null; }
}

function showLogin() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('token')) return;
  if (isLoggedIn()) return;

  // Volver SIEMPRE a esta pagina (origin+pathname), sin arrastrar query vieja.
  const back = window.location.origin + window.location.pathname;
  window.location.href = `${CONFIG.FSCAUTH_URL}/login.html?redirect=${encodeURIComponent(back)}&origin=${CONFIG.APP}`;
}

function showRegister() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('token')) return;
  if (isLoggedIn()) return;

  const back = window.location.origin + window.location.pathname;
  window.location.href = `${CONFIG.FSCAUTH_URL}/register.html?redirect=${encodeURIComponent(back)}&origin=${CONFIG.APP}`;
}

function logout() {
  removeToken();
  removeUser();
  removeDev();
  const back = window.location.origin + CONFIG.BASE + '/';
  window.location.href = `${CONFIG.FSCAUTH_URL}/api/auth/logout?redirect=${encodeURIComponent(back)}`;
}

// SSO silencioso: si hay cookie de fscauth, vuelve autenticado.
function checkSSO() {
  if (isLoggedIn()) return;
  const params = new URLSearchParams(window.location.search);
  if (params.has('token') || params.has('nosession')) return;
  if (sessionStorage.getItem('comfyweb_sso_checked')) return;
  sessionStorage.setItem('comfyweb_sso_checked', 'true');

  const back = window.location.origin + window.location.pathname;
  window.location.href = `${CONFIG.FSCAUTH_URL}/api/auth/sso-check?redirect=${encodeURIComponent(back)}`;
}

// Re-verifica la sesion contra fscauth.
async function syncSession() {
  if (!getToken()) return;
  try {
    const res = await fetch(`${CONFIG.FSCAUTH_URL}/api/auth/verify`, {
      credentials: 'include',
      headers: { Authorization: 'Bearer ' + getToken() }
    });
    const data = await res.json();
    if (!data.loggedIn) {
      removeToken();
      removeUser();
      window.dispatchEvent(new Event('authStateChanged'));
    }
  } catch (e) { /* offline: seguimos con el token local */ }
}

function apiRequest(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(CONFIG.API_URL + endpoint, { ...options, headers });
}

// --- Captura del retorno del login + estado inicial ---
(function initAuth() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const urlUsername = params.get('username');
  const urlUserId = params.get('userId');

  if (urlToken) {
    setToken(urlToken);
    const decoded = parseJwt(urlToken);
    setUser({
      username: urlUsername || (decoded ? decoded.username : '') || '',
      id: urlUserId || null,
      _id: urlUserId || null,
      email: decoded ? decoded.email : null,
      role: decoded ? decoded.role : 'USER'
    });

    ['token', 'username', 'userId', 'ssoset', 'nosession'].forEach(k => params.delete(k));
    const qs = params.toString();
    window.history.replaceState({}, document.title, window.location.pathname + (qs ? '?' + qs : ''));
    window.dispatchEvent(new Event('authStateChanged'));
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (!isLoggedIn() && !params.has('nosession')) checkSSO();
    });
  }

  // "Me loguee en otra pestaña"
  window.addEventListener('focus', () => { syncSession(); });
})();
