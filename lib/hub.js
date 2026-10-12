// ============================================================
// comfyweb - HUB de estado (socket.io del VPS)
// ------------------------------------------------------------
// Guarda el socket del navegador (io) y el socket del puente
// local (agent). Tanto server.js como routes/jobs.js lo usan
// para hablar con los dos lados sin acoplarse.
// ============================================================
'use strict';

const state = {
    io: null,            // namespace raiz (navegadores)
    agent: null,         // socket del puente local (namespace /agent)
    agentInfo: {
        host: '',
        platform: '',
        comfyConnected: false,
        videocomfyUrl: '',
        comfyVersion: '',
        device: '',
        workflows: []
    },
    ultimoLatido: 0
};

function snapshot() {
    return {
        online: !!state.agent,
        comfyConnected: !!state.agentInfo.comfyConnected,
        comfyVersion: state.agentInfo.comfyVersion || '',
        device: state.agentInfo.device || '',
        host: state.agentInfo.host || '',
        videocomfyUrl: state.agentInfo.videocomfyUrl || '',
        workflows: state.agentInfo.workflows || [],
        ultimoLatido: state.ultimoLatido
    };
}

function emitirNavegadores(evento, payload) {
    if (!state.io) return;
    state.io.emit(evento, payload);
}

function emitirUsuario(userId, evento, payload) {
    if (!state.io) return;
    if (userId) state.io.to('user:' + userId).emit(evento, payload);
    else state.io.emit(evento, payload);
}

// Devuelve true si el puente local esta conectado y se pudo encolar.
function enviarAlPuente(evento, payload) {
    if (!state.agent) return false;
    state.agent.emit(evento, payload);
    return true;
}

function statusNavegador() {
    return Object.assign(snapshot(), { ts: Date.now() });
}

function emitirEstadoAgente() {
    state.ultimoLatido = Date.now();
    emitirNavegadores('agent:status', statusNavegador());
}

module.exports = {
    state,
    snapshot,
    statusNavegador,
    emitirNavegadores,
    emitirUsuario,
    enviarAlPuente,
    emitirEstadoAgente
};
