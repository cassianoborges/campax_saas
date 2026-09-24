import { Router } from 'express';
import { tenantGuard, requireRole } from '../auth/middleware';
import { handleError, pick, TEMPLATE_FIELDS } from '../lib/http';

// Lists the empresa's own templates plus the global ones (empresa_id NULL); only its own can be
// changed — req.db turns an update/delete of a global template into a 404.
export const homenagensTemplatesRouter = Router();

homenagensTemplatesRouter.use(tenantGuard('viewer'));

homenagensTemplatesRouter.get('/', async (req, res) => {
  try {
    const templates = await req.db!.homenagens_templates.findMany({ orderBy: { titulo: 'asc' } });
    res.json({ success: true, data: templates });
  } catch (error) {
    handleError(res, error);
  }
});

homenagensTemplatesRouter.post('/', requireRole('admin'), async (req, res) => {
  try {
    const template = await req.db!.homenagens_templates.create({ data: pick(req.body, TEMPLATE_FIELDS) as any });
    res.json({ success: true, data: template });
  } catch (error) {
    handleError(res, error);
  }
});

homenagensTemplatesRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const template = await req.db!.homenagens_templates.update({
      where: { id: req.params.id },
      data: pick(req.body, TEMPLATE_FIELDS),
    });
    res.json({ success: true, data: template });
  } catch (error) {
    handleError(res, error);
  }
});

homenagensTemplatesRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await req.db!.homenagens_templates.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});
