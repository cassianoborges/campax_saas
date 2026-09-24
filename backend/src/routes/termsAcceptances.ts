import { Router } from 'express';
import { tenantGuard } from '../auth/middleware';
import { handleError } from '../lib/http';

export const termsAcceptancesRouter = Router();

// Read-only admin listing. There is intentionally no PATCH/DELETE here — this
// table is append-only for LGPD/legal compliance (mirrors the old RLS setup).
termsAcceptancesRouter.use(tenantGuard('viewer'));

termsAcceptancesRouter.get('/', async (req, res) => {
  try {
    const acceptances = await req.db!.terms_acceptances.findMany({ orderBy: { accepted_at: 'desc' } });
    res.json({ success: true, data: acceptances });
  } catch (error) {
    handleError(res, error);
  }
});
