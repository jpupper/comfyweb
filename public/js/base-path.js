// Configuración de base path para producción
// En desarrollo: '' (vacío)
// En producción: '/comfyweb'
const BASE_PATH = window.location.pathname.startsWith('/comfyweb') ? '/comfyweb' : '';

// Helper para construir URLs
function apiUrl(path) {
    return BASE_PATH + path;
}
