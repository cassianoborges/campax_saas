import './env';

import express from 'express';
import cors from 'cors';

import { authRouter } from './routes/auth';
import { camerasRouter } from './routes/cameras';
import { veloriosRouter } from './routes/velorios';
import { salasRouter } from './routes/salas';
import { homenagensTemplatesRouter } from './routes/homenagensTemplates';
import { accessLogsRouter, accessStatsRouter } from './routes/accessLogs';
import { visitantesRouter } from './routes/visitantes';
import { termsAcceptancesRouter } from './routes/termsAcceptances';
import { usersRouter } from './routes/users';
import { publicRouter } from './routes/public';
import { platformRouter } from './routes/platform';
import { internalRouter } from './routes/internal';
import { UPLOADS_DIR } from './lib/uploads';
import { corsOrigin } from './lib/empresaHost';

export const app = express();

// Requests arrive through nginx-proxy-manager (Docker, private address). Trusting only local/private
// hops makes req.ip the real visitor IP (logged for LGPD/terms evidence — a client-sent
// X-Forwarded-For can no longer spoof it) and req.protocol "https" (used to build upload URLs).
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// FRONTEND_ORIGIN plus the subdomains of active empresas (spec 08).
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use('/files', express.static(UPLOADS_DIR));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'campax-backend', timestamp: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/public', publicRouter);
app.use('/cameras', camerasRouter);
app.use('/velorios', veloriosRouter);
app.use('/salas', salasRouter);
app.use('/homenagens-templates', homenagensTemplatesRouter);
app.use('/access-logs', accessLogsRouter);
app.use('/access-stats', accessStatsRouter);
app.use('/visitantes', visitantesRouter);
app.use('/terms-acceptances', termsAcceptancesRouter);
app.use('/users', usersRouter);
app.use('/platform', platformRouter);
app.use('/internal', internalRouter);
