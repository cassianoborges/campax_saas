import { MANAGED_PATH } from './paths';

export interface CameraToSync {
    id: string;
    rtsp_url: string;
    mediamtx_path: string;
}

export interface MediaMTXPathConfig {
    name: string;
    source?: string;
}

export interface SyncPlan {
    add: CameraToSync[];
    updateSource: CameraToSync[];
    remove: string[];
}

/**
 * What to change in MediaMTX so it matches the active cameras. Pure: no I/O.
 * `cameras` are the active cameras of active empresas, each already with its path name.
 */
export function planSync(cameras: CameraToSync[], configs: MediaMTXPathConfig[]): SyncPlan {
    const existing = new Map(configs.map((c) => [c.name, c]));
    const wanted = new Set(cameras.map((c) => c.mediamtx_path));

    const add: CameraToSync[] = [];
    const updateSource: CameraToSync[] = [];
    for (const camera of cameras) {
        const config = existing.get(camera.mediamtx_path);
        if (!config) add.push(camera);
        // Before this existed, a changed rtsp_url was never applied: "already exists" counted as success.
        else if (config.source !== camera.rtsp_url) updateSource.push(camera);
    }

    const remove = configs.map((c) => c.name).filter((name) => MANAGED_PATH.test(name) && !wanted.has(name));
    return { add, updateSource, remove };
}
