import { Router } from 'express';
import { tenantGuard } from '../auth/middleware';
import { handleError } from '../lib/http';

export const visitantesRouter = Router();

visitantesRouter.use(tenantGuard('viewer'));

visitantesRouter.get('/', async (req, res) => {
  try {
    const { velorioId, search, startDate, endDate } = req.query as Record<string, string | undefined>;
    const visitantes = await req.db!.velorio_visitantes.findMany({
      where: {
        velorio_id: velorioId || undefined,
        nome: search ? { contains: search, mode: 'insensitive' } : undefined,
        created_at: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        },
      },
      include: { velorios: { select: { id: true, nome_falecido: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: visitantes });
  } catch (error) {
    handleError(res, error);
  }
});
