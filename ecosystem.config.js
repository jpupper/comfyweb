module.exports = {
  apps: [{
    name: 'comfytd',
    script: './server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      BASE_PATH: '/comfytd',
      PUBLIC_URL: 'https://vps-4455523-x.dattaweb.com/comfyweb',
      PORT: 8085
    }
  }]
};
