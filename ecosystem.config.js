// ============================================================
// comfyweb - PM2 (VPS)
// Las credenciales NO van aca: viven en el .env del VPS.
// ============================================================
module.exports = {
    apps: [{
        name: 'comfyweb',
        script: 'server.js',
        cwd: '/root/comfyweb',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        max_memory_restart: '400M',
        env: {
            NODE_ENV: 'production'
        }
    }]
};
