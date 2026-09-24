import './env';

import http from 'http';
import { app } from './app';
import { corsOrigin } from './lib/empresaHost';
import { initRealtime } from './realtime/socket';

const server = http.createServer(app);

initRealtime(server, corsOrigin);

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
