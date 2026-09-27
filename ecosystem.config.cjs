module.exports = {
  apps: [{
    name: 'pulse',
    cwd: __dirname,
    script: '.next/standalone/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '768M',
    env: {
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: '3000',
    },
  }],
};
