import { getAllActiveCameras, updateCameraUrls, isUniqueViolation, Camera } from './db';
import { mediamtxAPI } from './mediamtx-api';
import { generatePathName } from './paths';
import { planSync, CameraToSync } from './plan';
import { blockedReason } from './hostGuard';

const MAX_NAME_ATTEMPTS = 3;

/** Stores a new random path for a camera that has none, retrying on the (unlikely) UNIQUE collision. */
async function assignPath(camera: Camera): Promise<string> {
    for (let attempt = 1; ; attempt++) {
        const name = generatePathName(camera.empresa_slug);
        try {
            await updateCameraUrls(camera.id, name, mediamtxAPI.getWebRTCUrl(name));
            return name;
        } catch (error) {
            if (!isUniqueViolation(error) || attempt >= MAX_NAME_ATTEMPTS) throw error;
        }
    }
}

let running: Promise<void> | null = null;

/** One sync cycle. Concurrent calls (timer + webhook) share the cycle already in progress. */
export function syncCamerasToMediaMTX(): Promise<void> {
    running ??= runSync().finally(() => {
        running = null;
    });
    return running;
}

async function runSync(): Promise<void> {
    // Both reads throw on failure, aborting the cycle before anything is removed.
    const [cameras, configs] = await Promise.all([getAllActiveCameras(), mediamtxAPI.listConfigPaths()]);

    const toSync: CameraToSync[] = [];
    const skipped: string[] = [];
    for (const camera of cameras) {
        const blocked = await blockedReason(camera.rtsp_url);
        if (blocked) {
            skipped.push(`${camera.id} (${blocked})`);
            continue;
        }
        const path = camera.mediamtx_path ?? (await assignPath(camera));
        toSync.push({ id: camera.id, rtsp_url: camera.rtsp_url, mediamtx_path: path });
        // Keep webrtc_url consistent with the path (e.g. after MEDIAMTX_WEBRTC_BASE_URL changes).
        const webrtcUrl = mediamtxAPI.getWebRTCUrl(path);
        if (camera.mediamtx_path && camera.webrtc_url !== webrtcUrl) await updateCameraUrls(camera.id, path, webrtcUrl);
    }

    const plan = planSync(toSync, configs);
    const failures: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
        try {
            await action();
        } catch (error: any) {
            failures.push(`${label}: ${error.response?.data?.error ?? error.message}`);
        }
    };

    for (const camera of plan.add) await attempt(`add ${camera.mediamtx_path}`, () => mediamtxAPI.addPath(camera.mediamtx_path, camera.rtsp_url));
    for (const camera of plan.updateSource) await attempt(`source ${camera.mediamtx_path}`, () => mediamtxAPI.updateSource(camera.mediamtx_path, camera.rtsp_url));
    for (const name of plan.remove) await attempt(`remove ${name}`, () => mediamtxAPI.deletePath(name));

    if (skipped.length) console.warn(`⚠️ sync: câmera(s) fora do MediaMTX por endereço não permitido: ${skipped.join(', ')}`);

    const changed = plan.add.length + plan.updateSource.length + plan.remove.length;
    if (changed || failures.length) {
        console.log(
            `🔄 sync: ${toSync.length} câmeras | +${plan.add.length} adicionadas, ~${plan.updateSource.length} source atualizado, ` +
                `-${plan.remove.length} removidas${failures.length ? ` | ${failures.length} falha(s): ${failures.join('; ')}` : ''}`,
        );
    }
}

export function startPeriodicSync(intervalMs: number = 30000): NodeJS.Timeout {
    console.log(`⏰ Sincronização periódica: ${intervalMs}ms`);
    const tick = () => syncCamerasToMediaMTX().catch((error) => console.error('❌ Erro na sincronização:', error.message));
    tick();
    return setInterval(tick, intervalMs);
}
