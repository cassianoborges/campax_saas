import crypto from 'crypto';
import { Router } from 'express';
import { prisma } from '../prisma';
import { velorioNoAr, verifyStreamToken } from '../lib/streamToken';

// MediaMTX HTTP authentication (authMethod: http, spec 06 part B). MediaMTX POSTs every action it
// needs to authorize here; 2xx allows, anything else denies. Called by the container through the
// Docker bridge — the URL carries a shared key, and requests that came through the public reverse
// proxy (X-Forwarded-For set) are refused.
export const internalRouter = Router();

function safeEqual(a: string, b: string) {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

interface MediaMTXAuthRequest {
  user?: string;
  password?: string;
  token?: string;
  ip?: string;
  action?: string;
  path?: string;
  protocol?: string;
  query?: string;
}

async function canRead(path: string, query: string): Promise<boolean> {
  const token = new URLSearchParams(query).get('t');
  const payload = token ? verifyStreamToken(token) : null;
  if (!payload || !payload.p.includes(path)) return false;

  const camera = await prisma.cameras.findUnique({
    where: { mediamtx_path: path },
    select: { ativo: true, empresa: { select: { ativo: true } } },
  });
  if (!camera?.ativo || !camera.empresa.ativo) return false;

  // Admin preview token: no velório, no time window (short TTL instead).
  if (payload.v === null) return true;

  const velorio = await prisma.velorios.findUnique({
    where: { id: payload.v },
    select: { data_inicio: true, data_fim: true, empresa: { select: { ativo: true } } },
  });
  return !!velorio?.empresa.ativo && velorioNoAr(velorio);
}

internalRouter.post('/mediamtx/auth/:key', async (req, res) => {
  const expectedKey = process.env.MEDIAMTX_AUTH_KEY;
  if (!expectedKey || !safeEqual(req.params.key, expectedKey) || req.headers['x-forwarded-for']) {
    return res.status(404).end();
  }

  const body = (req.body ?? {}) as MediaMTXAuthRequest;
  try {
    let allowed = false;
    if (body.action === 'api') {
      // Control API: same credentials mediamtx-sync and apicam.campax.com.br use.
      const user = process.env.MEDIAMTX_API_USER ?? '';
      const password = process.env.MEDIAMTX_API_PASSWORD ?? '';
      allowed = !!user && !!password && safeEqual(body.user ?? '', user) && safeEqual(body.password ?? '', password);
    } else if (body.action === 'read' && body.path) {
      allowed = await canRead(body.path, body.query ?? '');
    }
    // publish, playback, metrics, pprof: never.
    res.status(allowed ? 200 : 401).end();
  } catch (error) {
    console.error('[mediamtx-auth]', (error as Error).message);
    res.status(401).end();
  }
});
