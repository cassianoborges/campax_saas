import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { tenantGuard, requireRole } from '../auth/middleware';
import { generateUniqueToken } from '../lib/token';
import { emitHomenagensChanged } from '../realtime/socket';
import { falecidoFotoPublicPath, uploadFotoFalecido } from '../lib/uploads';
import { handleError, pick, VELORIO_FIELDS } from '../lib/http';
import { assertPertence } from '../tenant/prismaForEmpresa';
import { criadoresPorId } from '../tenant/criadores';

export const velorioInclude = {
  sala: {
    select: {
      id: true,
      nome_sala_velorio: true,
      endereco: true,
      bairro: true,
      cidade: true,
      estado: true,
      cep: true,
      google_maps_url: true,
      sala_velorio_cameras: {
        orderBy: { ordem: 'asc' as const },
        select: {
          camera_id: true,
          ordem: true,
          cameras: { select: { id: true, nome: true, rtsp_url: true, ativo: true, webrtc_url: true } },
        },
      },
    },
  },
};

export const veloriosRouter = Router();

veloriosRouter.use(tenantGuard('viewer'));

// A sala of another empresa fails the composite FK (velorios → sala_velorio on (id, empresa_id)).
const SALA_INVALIDA = { foreignKey: 'Sala inválida' };

// @db.Date columns: the form sends "YYYY-MM-DD", which Prisma rejects (it wants a full ISO DateTime).
const DATE_ONLY_FIELDS = ['data_nascimento', 'data_falecimento'] as const;

export const FAMILIARES_MAX = 400;
const MSG_FAMILIARES = `Familiares: máximo de ${FAMILIARES_MAX} caracteres`;

class CampoInvalidoError extends Error {}

// Free text for the death notice ("Deixa a esposa…"). Blank means "remove it".
function normalizarFamiliares(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') throw new CampoInvalidoError(MSG_FAMILIARES);
  const texto = value.trim();
  if (texto.length > FAMILIARES_MAX) throw new CampoInvalidoError(MSG_FAMILIARES);
  return texto || null;
}

function velorioFields(body: unknown) {
  // token_acesso, created_by, foto_falecido and empresa_id never come from the client.
  const fields = pick(body, VELORIO_FIELDS);
  for (const field of DATE_ONLY_FIELDS) {
    const value = fields[field];
    if (value === '') fields[field] = null;
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) fields[field] = new Date(`${value}T00:00:00.000Z`);
  }
  if ('familiares' in fields) fields.familiares = normalizarFamiliares(fields.familiares);
  return fields;
}

async function assertSalaDaEmpresa(req: Request, salaId: unknown) {
  if (salaId !== undefined) await assertPertence(req.db!, 'sala_velorio', [String(salaId)]);
}

veloriosRouter.get('/', async (req, res) => {
  try {
    const velorios = await req.db!.velorios.findMany({
      include: velorioInclude,
      orderBy: { data_inicio: 'desc' },
    });
    res.json({ success: true, data: velorios });
  } catch (error) {
    handleError(res, error);
  }
});

veloriosRouter.get('/creation-stats', async (req, res) => {
  try {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const db = req.db!;

    const [total, today, thisWeek, thisMonth] = await Promise.all([
      db.velorios.count(),
      db.velorios.count({ where: { created_at: { gte: startToday } } }),
      db.velorios.count({ where: { created_at: { gte: sevenDaysAgo } } }),
      db.velorios.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
    ]);

    res.json({
      success: true,
      data: { total_velorios: total, velorios_today: today, velorios_this_week: thisWeek, velorios_this_month: thisMonth },
    });
  } catch (error) {
    handleError(res, error);
  }
});

veloriosRouter.get('/audit', async (req, res) => {
  try {
    const { createdBy, sala, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const velorios = await req.db!.velorios.findMany({
      where: {
        created_by: createdBy || undefined,
        created_at: {
          gte: dateFrom ? new Date(dateFrom) : undefined,
          lte: dateTo ? new Date(dateTo) : undefined,
        },
        sala: sala ? { nome_sala_velorio: { contains: sala, mode: 'insensitive' } } : undefined,
      },
      include: { sala: { select: { nome_sala_velorio: true } } },
      orderBy: { created_at: 'desc' },
    });

    const creatorIds = [...new Set(velorios.map((v) => v.created_by).filter(Boolean))] as string[];
    const creatorMap = await criadoresPorId(creatorIds);

    const data = velorios.map((v) => ({
      ...v,
      created_by_email: v.created_by ? creatorMap.get(v.created_by)?.email ?? null : null,
      created_by_name: v.created_by ? creatorMap.get(v.created_by)?.full_name ?? null : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
});

veloriosRouter.get('/:id', async (req, res) => {
  try {
    const velorio = await req.db!.velorios.findUnique({ where: { id: req.params.id }, include: velorioInclude });
    if (!velorio) return res.status(404).json({ success: false, error: 'Velório não encontrado' });
    res.json({ success: true, data: velorio });
  } catch (error) {
    handleError(res, error);
  }
});

veloriosRouter.get('/:id/access-stats', async (req, res) => {
  try {
    const velorioId = req.params.id;
    await assertPertence(req.db!, 'velorios', [velorioId]);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = req.db!;

    const [total, accesses, last] = await Promise.all([
      db.velorio_access_logs.count({ where: { velorio_id: velorioId } }),
      db.velorio_access_logs.findMany({ where: { velorio_id: velorioId }, select: { token_acesso: true, accessed_at: true } }),
      db.velorio_access_logs.findFirst({ where: { velorio_id: velorioId }, orderBy: { accessed_at: 'desc' }, select: { accessed_at: true } }),
    ]);

    const uniqueTokens = new Set(accesses.map((a) => a.token_acesso)).size;
    const last24h = accesses.filter((a) => a.accessed_at && a.accessed_at > dayAgo).length;

    res.json({
      success: true,
      data: { total_accesses: total, unique_tokens: uniqueTokens, last_access: last?.accessed_at ?? null, accesses_last_24h: last24h },
    });
  } catch (error) {
    handleError(res, error);
  }
});

veloriosRouter.post('/', requireRole('operador'), async (req, res) => {
  try {
    const fields = velorioFields(req.body);
    await assertSalaDaEmpresa(req, fields.sala_velorio_id);
    const token_acesso = await generateUniqueToken();
    const velorio = await req.db!.velorios.create({
      data: { ...fields, token_acesso, status: fields.status || 'Agendado', created_by: req.profile!.id } as any,
      include: velorioInclude,
    });
    res.json({ success: true, data: velorio });
  } catch (error) {
    if (error instanceof CampoInvalidoError) return res.status(400).json({ success: false, error: error.message });
    handleError(res, error, SALA_INVALIDA);
  }
});

veloriosRouter.patch('/:id', requireRole('operador'), async (req, res) => {
  try {
    const fields = velorioFields(req.body);
    await assertSalaDaEmpresa(req, fields.sala_velorio_id);
    const velorio = await req.db!.velorios.update({ where: { id: req.params.id }, data: fields, include: velorioInclude });
    res.json({ success: true, data: velorio });
  } catch (error) {
    if (error instanceof CampoInvalidoError) return res.status(400).json({ success: false, error: error.message });
    handleError(res, error, SALA_INVALIDA);
  }
});

veloriosRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await req.db!.velorios.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

// Must run before multer: otherwise the file would already be on disk (possibly overwriting
// another empresa's photo) by the time the route could reject the request.
async function velorioDaEmpresa(req: Request, res: Response, next: NextFunction) {
  try {
    await assertPertence(req.db!, 'velorios', [req.params.id]);
    next();
  } catch (error) {
    handleError(res, error);
  }
}

veloriosRouter.post('/:id/foto', requireRole('operador'), velorioDaEmpresa, uploadFotoFalecido.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Arquivo não enviado' });
    const publicUrl = `${req.protocol}://${req.get('host')}${falecidoFotoPublicPath(req.empresa!.id, req.params.id, req.file.filename)}`;
    const velorio = await req.db!.velorios.update({ where: { id: req.params.id }, data: { foto_falecido: publicUrl } });
    res.json({ success: true, data: velorio, url: publicUrl });
  } catch (error) {
    handleError(res, error);
  }
});

veloriosRouter.delete('/:velorioId/homenagens/:id', requireRole('admin'), async (req, res) => {
  try {
    // Scoped by req.db (via the velório's empresa) *and* by the velório in the URL.
    const { count } = await req.db!.velorio_homenagens.deleteMany({
      where: { id: req.params.id, velorio_id: req.params.velorioId },
    });
    if (count === 0) return res.status(404).json({ success: false, error: 'Não encontrado' });
    emitHomenagensChanged(req.params.velorioId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});
