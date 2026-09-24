import { Router } from 'express';
import { tenantGuard, requireRole } from '../auth/middleware';
import { CAMERA_FIELDS, handleError, pick } from '../lib/http';
import { notifyMediamtxSync } from '../lib/mediamtxSync';
import { signStreamToken, streamUrl } from '../lib/streamToken';
import { checkCameras, validateCameraUrl } from '../lib/cameraCheck';

export const camerasRouter = Router();

camerasRouter.use(tenantGuard('viewer'));

camerasRouter.get('/', async (req, res) => {
  try {
    const activeOnly = req.query.ativo === 'true';
    const cameras = await req.db!.cameras.findMany({
      where: activeOnly ? { ativo: true } : undefined,
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: cameras });
  } catch (error) {
    handleError(res, error);
  }
});

camerasRouter.post('/', requireRole('operador'), async (req, res) => {
  try {
    const fields = pick(req.body, CAMERA_FIELDS);
    const invalid = await validateCameraUrl(fields.rtsp_url);
    if (invalid) return res.status(400).json({ success: false, error: invalid });
    // `as any`: empresa_id is injected by req.db, which the generated create type doesn't know about.
    const camera = await req.db!.cameras.create({ data: { ...fields, ativo: fields.ativo ?? true } as any });
    notifyMediamtxSync('camera criada');
    res.json({ success: true, data: camera });
  } catch (error) {
    handleError(res, error);
  }
});

camerasRouter.patch('/:id', requireRole('operador'), async (req, res) => {
  try {
    const fields = pick(req.body, CAMERA_FIELDS);
    if (fields.rtsp_url !== undefined) {
      const invalid = await validateCameraUrl(fields.rtsp_url);
      if (invalid) return res.status(400).json({ success: false, error: invalid });
    }
    const camera = await req.db!.cameras.update({ where: { id: req.params.id }, data: fields });
    notifyMediamtxSync('camera editada');
    res.json({ success: true, data: camera });
  } catch (error) {
    handleError(res, error);
  }
});

// Admin preview of a camera (Câmeras page): a short-lived token with no velório time window.
camerasRouter.post('/:id/stream-url', async (req, res) => {
  try {
    const camera = await req.db!.cameras.findUniqueOrThrow({ where: { id: req.params.id }, select: { mediamtx_path: true, webrtc_url: true } });
    if (!camera.mediamtx_path || !camera.webrtc_url) return res.status(409).json({ success: false, error: 'Câmera ainda não sincronizada' });
    const token = signStreamToken({ v: null, p: [camera.mediamtx_path] }, '1h');
    res.json({ success: true, url: streamUrl(camera.webrtc_url, token) });
  } catch (error) {
    handleError(res, error);
  }
});

// Reachability check done by the backend (replaces the public camera-status-api and the old
// POST /bulk-status, where the browser reported the status). Body { ids?: string[] }: without ids,
// every active camera of the empresa; ids of other empresas are simply not found by req.db.
camerasRouter.post('/check-status', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : undefined;
    const cameras = await req.db!.cameras.findMany({
      where: ids ? { id: { in: ids } } : { ativo: true },
      select: { id: true, rtsp_url: true },
    });
    const results = await checkCameras(cameras);
    await Promise.all(
      [...results].map(([id, result]) =>
        req.db!.cameras.updateMany({
          where: { id },
          data: { status: result.online ? 'online' : 'offline', status_checked_at: new Date(result.checked_at) },
        }),
      ),
    );
    res.json({ success: true, data: Object.fromEntries(results) });
  } catch (error) {
    handleError(res, error);
  }
});

camerasRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await req.db!.cameras.delete({ where: { id: req.params.id } });
    notifyMediamtxSync('camera excluida');
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});
