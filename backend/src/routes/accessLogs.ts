import { Router } from 'express';
import { tenantGuard } from '../auth/middleware';
import { handleError } from '../lib/http';

export const accessLogsRouter = Router();

accessLogsRouter.use(tenantGuard('viewer'));

accessLogsRouter.get('/', async (req, res) => {
  try {
    const { velorioId, token, startDate, endDate } = req.query as Record<string, string | undefined>;
    const logs = await req.db!.velorio_access_logs.findMany({
      where: {
        velorio_id: velorioId || undefined,
        token_acesso: token || undefined,
        accessed_at: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        },
      },
      include: {
        velorios: {
          select: { id: true, nome_falecido: true, token_acesso: true, sala: { select: { nome_sala_velorio: true } } },
        },
      },
      orderBy: { accessed_at: 'desc' },
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    handleError(res, error);
  }
});

export const accessStatsRouter = Router();

accessStatsRouter.use(tenantGuard('viewer'));

accessStatsRouter.get('/overall', async (req, res) => {
  try {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, velorioIds, accessesToday, accessesLast7d] = await Promise.all([
      req.db!.velorio_access_logs.count(),
      req.db!.velorio_access_logs.findMany({ distinct: ['velorio_id'], select: { velorio_id: true } }),
      req.db!.velorio_access_logs.count({ where: { accessed_at: { gte: startToday } } }),
      req.db!.velorio_access_logs.count({ where: { accessed_at: { gte: sevenDaysAgo } } }),
    ]);

    res.json({
      success: true,
      data: {
        total_accesses: total,
        total_velorios: velorioIds.length,
        accesses_today: accessesToday,
        accesses_last_7_days: accessesLast7d,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
});
