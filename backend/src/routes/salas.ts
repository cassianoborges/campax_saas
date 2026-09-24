import { Router } from 'express';
import { tenantGuard, requireRole } from '../auth/middleware';
import { assertPertence } from '../tenant/prismaForEmpresa';
import { handleError, pick, SALA_FIELDS } from '../lib/http';
import { RESERVED_SALA_SLUGS } from '../lib/empresaHost';

const salaInclude = {
  sala_velorio_cameras: {
    orderBy: { ordem: 'asc' as const },
    select: {
      camera_id: true,
      ordem: true,
      cameras: { select: { id: true, nome: true, rtsp_url: true, ativo: true, webrtc_url: true } },
    },
  },
};

const SLUG_CONFLICT = 'Já existe uma sala com esse identificador (slug duplicado)';
const RESERVED_SALA_SLUG = 'Esse identificador é reservado (admin, velorio e platform são endereços do sistema)';

export const salasRouter = Router();

salasRouter.use(tenantGuard('viewer'));

function cameraIdsFrom(body: unknown): string[] | undefined {
  const ids = (body as { camera_ids?: unknown })?.camera_ids;
  return Array.isArray(ids) ? ids.map(String) : undefined;
}

/** A sala slug becomes /<sala> on the empresa's subdomain (spec 08). */
function reservedSalaSlug(body: unknown): boolean {
  const slug = (body as { slug?: unknown })?.slug;
  return typeof slug === 'string' && RESERVED_SALA_SLUGS.has(slug.trim().toLowerCase());
}

salasRouter.get('/', async (req, res) => {
  try {
    const salas = await req.db!.sala_velorio.findMany({ include: salaInclude, orderBy: { nome_sala_velorio: 'asc' } });
    res.json({ success: true, data: salas });
  } catch (error) {
    handleError(res, error);
  }
});

salasRouter.post('/', requireRole('operador'), async (req, res) => {
  try {
    if (reservedSalaSlug(req.body)) return res.status(400).json({ success: false, error: RESERVED_SALA_SLUG });
    const camera_ids = cameraIdsFrom(req.body);
    if (camera_ids) await assertPertence(req.db!, 'cameras', camera_ids);

    const sala = await req.db!.sala_velorio.create({ data: pick(req.body, SALA_FIELDS) as any });
    if (camera_ids?.length) {
      await req.db!.sala_velorio_cameras.createMany({
        data: camera_ids.map((camera_id, ordem) => ({ sala_velorio_id: sala.id, camera_id, ordem })),
      });
    }

    const full = await req.db!.sala_velorio.findUnique({ where: { id: sala.id }, include: salaInclude });
    res.json({ success: true, data: full });
  } catch (error) {
    handleError(res, error, { conflict: SLUG_CONFLICT });
  }
});

salasRouter.patch('/:id', requireRole('operador'), async (req, res) => {
  try {
    if (reservedSalaSlug(req.body)) return res.status(400).json({ success: false, error: RESERVED_SALA_SLUG });
    const camera_ids = cameraIdsFrom(req.body);
    if (camera_ids) await assertPertence(req.db!, 'cameras', camera_ids);

    // Fails with 404 before touching the camera links if the sala isn't this empresa's.
    await req.db!.sala_velorio.update({ where: { id: req.params.id }, data: pick(req.body, SALA_FIELDS) });

    if (camera_ids !== undefined) {
      await req.db!.sala_velorio_cameras.deleteMany({ where: { sala_velorio_id: req.params.id } });
      if (camera_ids.length) {
        await req.db!.sala_velorio_cameras.createMany({
          data: camera_ids.map((camera_id, ordem) => ({ sala_velorio_id: req.params.id, camera_id, ordem })),
        });
      }
    }

    const full = await req.db!.sala_velorio.findUnique({ where: { id: req.params.id }, include: salaInclude });
    res.json({ success: true, data: full });
  } catch (error) {
    handleError(res, error, { conflict: SLUG_CONFLICT });
  }
});

salasRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await req.db!.sala_velorio.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, { foreignKey: 'Não é possível excluir: há velórios vinculados a esta sala' });
  }
});
