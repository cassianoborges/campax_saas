import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { velorioInclude } from './velorios';
import { emitHomenagensChanged } from '../realtime/socket';
import { EMPRESA_PUBLIC_SELECT } from '../lib/empresa';
import { isReservedSlug } from '../lib/empresaHost';
import { signStreamToken, streamUrl, velorioNoAr, velorioTokenTtlSeconds } from '../lib/streamToken';

// Unauthenticated routes. They use the raw `prisma` client, but every query starts from a public
// identifier (velório token or id, empresa hash) and derives the empresa from it — never from the
// request body. A suspended empresa looks exactly like a missing one (404).
export const publicRouter = Router();

const EMPRESA_PUBLIC_WITH_STATUS = { select: { ...EMPRESA_PUBLIC_SELECT, ativo: true } };

// Same shape as velorioInclude, minus cameras.rtsp_url — the RTSP URL usually carries the camera's
// credentials and the public pages only need webrtc_url — plus the empresa's public fields.
const velorioPublicInclude = {
  sala: {
    select: {
      ...velorioInclude.sala.select,
      sala_velorio_cameras: {
        ...velorioInclude.sala.select.sala_velorio_cameras,
        select: {
          ...velorioInclude.sala.select.sala_velorio_cameras.select,
          cameras: { select: { id: true, nome: true, ativo: true, webrtc_url: true, mediamtx_path: true } },
        },
      },
    },
  },
  empresa: EMPRESA_PUBLIC_WITH_STATUS,
};

function notFound(res: Response, error = 'Velório não encontrado') {
  return res.status(404).json({ success: false, error });
}

/** Strips the internal `ativo` flag; returns null for a suspended empresa. */
function publicEmpresa<T extends { ativo: boolean }>(empresa: T | null) {
  if (!empresa?.ativo) return null;
  const { ativo, ...rest } = empresa;
  return rest;
}

type PublicCamera = { webrtc_url: string | null; mediamtx_path: string | null } & Record<string, unknown>;
type PublicVelorio = {
  id: string;
  data_inicio: Date;
  data_fim: Date;
  empresa: { ativo: boolean };
  sala: { sala_velorio_cameras: { cameras: PublicCamera }[] } & Record<string, unknown>;
} & Record<string, unknown>;

// MediaMTX only lets a viewer read with a token (spec 06, part B): each camera gets a stream_url
// carrying a token for this velório's cameras, checked by MediaMTX through /internal/mediamtx/auth
// on every connection. Outside the velório's window there is no stream_url at all — MediaMTX would
// answer 401 with a Basic-auth challenge, i.e. a login prompt inside the page.
function withStreamUrls(velorio: PublicVelorio) {
  const links = velorio.sala.sala_velorio_cameras;
  const paths = links.map((l) => l.cameras.mediamtx_path).filter((p): p is string => !!p);
  const token =
    paths.length && velorioNoAr(velorio) ? signStreamToken({ v: velorio.id, p: paths }, velorioTokenTtlSeconds(velorio)) : null;
  return {
    ...velorio.sala,
    sala_velorio_cameras: links.map(({ cameras: { mediamtx_path, ...camera }, ...link }) => ({
      ...link,
      cameras: { ...camera, stream_url: token && camera.webrtc_url && mediamtx_path ? streamUrl(camera.webrtc_url, token) : null },
    })),
  };
}

function sendPublicVelorio(res: Response, velorio: PublicVelorio | null) {
  const empresa = velorio ? publicEmpresa(velorio.empresa) : null;
  if (!velorio || !empresa) return notFound(res);
  res.json({ success: true, data: { ...velorio, empresa, sala: withStreamUrls(velorio) } });
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** `?empresa=<slug>` sent by the subdomain frontend (spec 08): narrows results, never widens them. */
function empresaSlugFilter(value: unknown): string | null {
  return typeof value === 'string' && value ? value.toLowerCase() : null;
}

/** The velório (id + empresa) behind a public :id, or null if missing or its empresa is suspended. */
async function loadPublicVelorio(id: string) {
  if (!isUuid(id)) return null;
  const velorio = await prisma.velorios.findUnique({
    where: { id },
    select: { id: true, empresa_id: true, empresa: { select: { ativo: true } } },
  });
  return velorio?.empresa.ativo ? { id: velorio.id, empresa_id: velorio.empresa_id } : null;
}

publicRouter.get('/velorios/:token', async (req, res) => {
  try {
    const token = req.params.token.toUpperCase();
    if (token.length !== 6) return res.status(400).json({ success: false, error: 'Token inválido' });

    const velorio = await prisma.velorios.findUnique({ where: { token_acesso: token }, include: velorioPublicInclude });
    const empresaSlug = empresaSlugFilter(req.query.empresa);
    if (velorio && empresaSlug && velorio.empresa.slug !== empresaSlug) return notFound(res);
    sendPublicVelorio(res, velorio);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Used by the public viewing page (/velorio/:id), which visitors reach after the token step.
publicRouter.get('/velorios/id/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res);
    const velorio = await prisma.velorios.findUnique({ where: { id: req.params.id }, include: velorioPublicInclude });
    sendPublicVelorio(res, velorio);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

type EmpresaRow = Prisma.empresasGetPayload<typeof EMPRESA_PUBLIC_WITH_STATUS> | null;

async function findEmpresaBySlug(slug: string): Promise<EmpresaRow> {
  const s = slug.toLowerCase();
  if (isReservedSlug(s)) return null;
  return prisma.empresas.findUnique({ where: { slug: s }, ...EMPRESA_PUBLIC_WITH_STATUS });
}

function sendEmpresa(res: Response, empresaRow: EmpresaRow) {
  const data = publicEmpresa(empresaRow);
  if (!data) return notFound(res, 'Empresa não encontrada');
  res.json({ success: true, data });
}

// Fixed public link of a sala: current velório (or the next one) of a sala of this empresa.
async function sendSalaPublicLink(res: Response, empresaRow: EmpresaRow, salaSlug: string) {
  const empresa = publicEmpresa(empresaRow);
  if (!empresa) return notFound(res, 'Sala não encontrada');

  const sala = await prisma.sala_velorio.findUnique({
    where: { empresa_id_slug: { empresa_id: empresa.id, slug: salaSlug } },
    select: { id: true, nome_sala_velorio: true, cidade: true, estado: true },
  });
  if (!sala) return notFound(res, 'Sala não encontrada');

  const velorios = await prisma.velorios.findMany({
    where: { sala_velorio_id: sala.id },
    select: { id: true, nome_falecido: true, data_inicio: true, data_fim: true, data_sepultamento: true },
  });

  const now = new Date();
  const aoVivos = velorios.filter((v) => now >= v.data_inicio && now <= v.data_fim);
  const atual = aoVivos.length
    ? aoVivos.reduce((maisRecente, v) => (v.data_inicio > maisRecente.data_inicio ? v : maisRecente))
    : null;
  const proximo = atual
    ? null
    : velorios.filter((v) => v.data_inicio > now).sort((a, b) => a.data_inicio.getTime() - b.data_inicio.getTime())[0] ?? null;

  res.json({ success: true, data: { sala, atual, proximo, empresa } });
}

// Subdomain frontend (spec 08): the empresa comes from <slug>.campax.com.br. Registered before
// '/empresas/:hash' routes only for readability — the paths don't overlap.
publicRouter.get('/empresas/slug/:slug', async (req, res) => {
  try {
    sendEmpresa(res, await findEmpresaBySlug(req.params.slug));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.get('/empresas/slug/:slug/salas/:salaSlug', async (req, res) => {
  try {
    await sendSalaPublicLink(res, await findEmpresaBySlug(req.params.slug), req.params.salaSlug);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.get('/empresas/:hash', async (req, res) => {
  try {
    sendEmpresa(res, await prisma.empresas.findUnique({ where: { hash_publico: req.params.hash }, ...EMPRESA_PUBLIC_WITH_STATUS }));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fixed public link of a sala: /:hashEmpresa/:salaSlug in the frontend. Replaces the old
// GET /public/salas/:slug, which relied on slugs being unique across the whole system.
publicRouter.get('/empresas/:hash/salas/:slug', async (req, res) => {
  try {
    const empresaRow = await prisma.empresas.findUnique({ where: { hash_publico: req.params.hash }, ...EMPRESA_PUBLIC_WITH_STATUS });
    await sendSalaPublicLink(res, empresaRow, req.params.slug);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.get('/velorios/:id/visitantes/nomes', async (req, res) => {
  try {
    const velorio = await loadPublicVelorio(req.params.id);
    if (!velorio) return notFound(res);
    const nomes = await prisma.velorio_visitantes.findMany({
      where: { velorio_id: velorio.id },
      select: { id: true, nome: true, created_at: true },
      orderBy: { created_at: 'asc' },
    });
    res.json({ success: true, data: nomes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.post('/velorios/:id/visitantes', async (req, res) => {
  try {
    const { nome, celular, email } = req.body as Record<string, string>;
    if (!nome || !celular) return res.status(400).json({ success: false, error: 'Nome e celular são obrigatórios' });

    const velorio = await loadPublicVelorio(req.params.id);
    if (!velorio) return notFound(res);
    const visitante = await prisma.velorio_visitantes.create({
      data: { velorio_id: velorio.id, nome, celular, email },
    });
    res.json({ success: true, data: visitante });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.post('/velorios/:id/access-logs', async (req, res) => {
  try {
    const velorio = await loadPublicVelorio(req.params.id);
    // Access logging is best-effort — never block the visitor's access on a logging failure.
    if (!velorio) return res.json({ success: true });

    const { token, nome_visitante, celular_visitante, email_visitante } = req.body as Record<string, string>;
    await prisma.velorio_access_logs.create({
      data: {
        velorio_id: velorio.id,
        empresa_id: velorio.empresa_id,
        token_acesso: (token || '').toUpperCase(),
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        nome_visitante,
        celular_visitante,
        email_visitante,
      },
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to log access:', error.message);
    res.json({ success: true });
  }
});

publicRouter.get('/velorios/:id/homenagens', async (req, res) => {
  try {
    const velorio = await loadPublicVelorio(req.params.id);
    if (!velorio) return notFound(res);
    const homenagens = await prisma.velorio_homenagens.findMany({
      where: { velorio_id: velorio.id },
      orderBy: { created_at: 'asc' },
    });
    res.json({ success: true, data: homenagens });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.post('/velorios/:id/homenagens', async (req, res) => {
  try {
    const { autor_nome, parentesco, mensagem } = req.body as Record<string, string>;
    if (!autor_nome || !mensagem) {
      return res.status(400).json({ success: false, error: 'Nome do autor e mensagem são obrigatórios' });
    }
    const velorio = await loadPublicVelorio(req.params.id);
    if (!velorio) return notFound(res);
    const homenagem = await prisma.velorio_homenagens.create({
      data: { velorio_id: velorio.id, autor_nome, parentesco, mensagem },
    });
    emitHomenagensChanged(velorio.id);
    res.json({ success: true, data: homenagem });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Terms acceptance is per empresa (each funeral home is the data controller for its visitors), so
// both routes take the velório and derive the empresa from it.
publicRouter.get('/terms/accepted', async (req, res) => {
  try {
    const { celular, version, velorio_id } = req.query as Record<string, string | undefined>;
    if (!celular || !version || !velorio_id) {
      return res.status(400).json({ success: false, error: 'celular, version e velorio_id são obrigatórios' });
    }
    const velorio = await loadPublicVelorio(velorio_id);
    if (!velorio) return notFound(res);

    const existing = await prisma.terms_acceptances.findFirst({
      where: { empresa_id: velorio.empresa_id, celular: celular.trim(), terms_version: version },
      select: { id: true },
    });
    res.json({ success: true, accepted: !!existing });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

publicRouter.post('/terms-acceptances', async (req, res) => {
  try {
    const { velorio_id, nome, celular, email, terms_version, document_hash } = req.body as Record<string, string>;
    if (!velorio_id || !nome || !celular || !terms_version || !document_hash) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes' });
    }
    const velorio = await loadPublicVelorio(velorio_id);
    if (!velorio) return notFound(res);

    const acceptance = await prisma.terms_acceptances.create({
      data: {
        velorio_id: velorio.id,
        empresa_id: velorio.empresa_id,
        nome,
        celular,
        email,
        terms_version,
        document_hash,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      },
    });
    res.json({ success: true, data: acceptance });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
