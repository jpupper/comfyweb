(function () {
  const BASE = window.location.pathname.startsWith('/comfyweb') ? '/comfyweb' : '';
  const isLocal = ['localhost','127.0.0.1'].indexOf(window.location.hostname) !== -1;
  const API_URL = isLocal ? window.location.origin + BASE + '/api'
                          : 'https://vps-4455523-x.dattaweb.com/comfyweb/api';
  const PUBLIC_BASE = isLocal ? window.location.origin + BASE : 'https://fullscreencode.com/comfyweb';
  window.CONFIG = { APP:'comfyweb', BASE:BASE, isLocal:isLocal, API_URL:API_URL, PUBLIC_BASE:PUBLIC_BASE,
                    FSCAUTH_URL:'https://fullscreencode.com/fscauth',
                    // OJO: SOCKET_URL es SOLO el origen. Si lleva el path
                    // (/comfyweb), socket.io lo toma como NAMESPACE y el
                    // handshake falla con "Invalid namespace". El prefijo va
                    // unicamente en SOCKET_PATH.
                    SOCKET_URL: isLocal ? window.location.origin : 'https://vps-4455523-x.dattaweb.com',
                    SOCKET_PATH: (BASE || '') + '/socket.io' };
  window.COMFYWEB_CONFIG = window.CONFIG;
})();
