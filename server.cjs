const { spawn } = require('child_process');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
const port = process.env.PORT || 8080;

console.log(`Starting static server on port ${port}...`);
console.log(`Serving directory: ${distPath}`);

// Usar o vite preview
const vite = spawn('npx', ['vite', 'preview', '--port', port, '--host'], {
    stdio: 'inherit',
    shell: true
});

vite.on('error', (error) => {
    console.error(`Error starting server: ${error.message}`);
    process.exit(1);
});

vite.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    process.exit(code);
});

// Handle termination signals
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    vite.kill('SIGTERM');
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    vite.kill('SIGINT');
});
