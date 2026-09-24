module.exports = {
    apps: [
        // FRONTEND VELORIO ONLINE
        {
            name: 'campax-frontend-velorio',
            script: './server.cjs',
            cwd: './',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                PORT: 8080
            },
            error_file: './logs/frontend-error.log',
            out_file: './logs/frontend-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },
        // (A checagem de status das câmeras era a camera-status-api, removida em 2026-09-23:
        // agora é POST /cameras/check-status no backend. Ver docs/multiempresa/07-camera-status.md.)
        // BACKEND (API principal + Socket.IO)
        {
            name: 'campax-backend-velorio',
            script: './dist/index.js',
            cwd: './backend',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
                PORT: 3013
            },
            error_file: '../logs/backend-error.log',
            out_file: '../logs/backend-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },
        // SINCRONIZADOR CAMERAS VELORIO ONLINE
        {
            name: 'campax-sync-velorio',
            script: './dist/index.js',
            cwd: './mediamtx-sync',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production'
            },
            error_file: '../logs/sync-error.log',
            out_file: '../logs/sync-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        }
    ]
};
