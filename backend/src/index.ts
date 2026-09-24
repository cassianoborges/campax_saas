import './env';

import http from 'http';
import { app, FRONTEND_ORIGIN } from './app';
import { initRealtime } from './realtime/socket';

const server = http.createServer(app);

initRealtime(server, FRONTEND_ORIGIN);

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`🚀 campax-backend rodando na porta ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
