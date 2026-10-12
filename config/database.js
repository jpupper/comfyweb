// ============================================================
// comfyweb - conexion Mongo (local vs VPS)
// La base es PROPIA de la app: guarda los trabajos (jobs) que la web
// le pide al videocomfy que corre en la PC de Julián.
// ============================================================
const isLocal = ['localhost', '127.0.0.1'].includes(require('os').hostname());

module.exports = {
    mongoURI: process.env.MONGODB_URI || (isLocal
        ? 'mongodb://localhost:27017/comfyweb'
        : 'mongodb://127.0.0.1:27017/comfyweb'),
    isLocal,
    jwtSecret: process.env.JWT_SECRET || ''
};
