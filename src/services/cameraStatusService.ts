import { apiClient } from '@/lib/apiClient';

// Camera reachability is checked by the backend (POST /cameras/check-status), only for cameras of
// the logged-in user's empresa, using the addresses stored in the database — the browser never
// sends an RTSP URL anywhere. Replaces the old standalone camera-status-api.

interface CheckStatusResponse {
    data: Record<string, { online: boolean; checked_at: string; error?: string }>;
}

/**
 * Checks the given cameras (or every active camera of the empresa when `ids` is omitted) and
 * returns camera id → online. The backend also stores the result in cameras.status.
 */
export async function checkMultipleCameras(ids?: string[]): Promise<Map<string, boolean>> {
    try {
        const { data } = await apiClient.post<CheckStatusResponse>('/cameras/check-status', ids ? { ids } : {});
        return new Map(Object.entries(data).map(([id, result]) => [id, result.online]));
    } catch (error) {
        console.error('Error checking camera statuses:', error);
        return new Map((ids ?? []).map((id) => [id, false]));
    }
}
