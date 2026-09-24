import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import { MediaMTXPathConfig } from './plan';

dotenv.config();

const BASE_URL = process.env.MEDIAMTX_BASE_URL!;
const API_PORT = process.env.MEDIAMTX_API_PORT!;
const WEBRTC_BASE_URL = process.env.MEDIAMTX_WEBRTC_BASE_URL || BASE_URL;
const USER = process.env.MEDIAMTX_USER!;
const PASSWORD = process.env.MEDIAMTX_PASSWORD!;

class MediaMTXAPI {
    private api: AxiosInstance;
    public webrtcBaseUrl: string;

    constructor() {
        // API usa HTTP (não suporta SSL direto)
        this.api = axios.create({
            baseURL: `${BASE_URL}:${API_PORT}`,
            auth: { username: USER, password: PASSWORD },
            timeout: 10_000,
        });
        // WebRTC usa HTTPS através de reverse proxy (sem porta na URL)
        this.webrtcBaseUrl = WEBRTC_BASE_URL;
    }

    /** Configured paths (with their source). Throws on error — the sync must not act on a partial view. */
    async listConfigPaths(): Promise<MediaMTXPathConfig[]> {
        const items: MediaMTXPathConfig[] = [];
        for (let page = 0; ; page++) {
            const { data } = await this.api.get('/v3/config/paths/list', { params: { page, itemsPerPage: 100 } });
            items.push(...(data?.items ?? []).map((item: { name: string; source?: string }) => ({ name: item.name, source: item.source })));
            if (page + 1 >= (data?.pageCount ?? 1)) return items;
        }
    }

    // Runtime paths (for /mediamtx/status only).
    async listPaths(): Promise<string[]> {
        try {
            const response = await this.api.get('/v3/paths/list');
            return (response.data?.items || []).map((item: { name: string }) => item.name);
        } catch (error: any) {
            console.error('Erro ao listar paths:', error.message);
            return [];
        }
    }

    async addPath(name: string, rtspUrl: string): Promise<void> {
        // sourceOnDemand: the camera is only pulled while someone is watching.
        await this.api.post(`/v3/config/paths/add/${name}`, { source: rtspUrl, sourceOnDemand: true });
    }

    async updateSource(name: string, rtspUrl: string): Promise<void> {
        await this.api.patch(`/v3/config/paths/patch/${name}`, { source: rtspUrl });
    }

    async deletePath(name: string): Promise<void> {
        await this.api.delete(`/v3/config/paths/delete/${name}`);
    }

    async listWebRTCSessions(): Promise<any[]> {
        try {
            const response = await this.api.get('/v3/webrtcsessions/list');
            return Object.values(response.data?.items || {});
        } catch (error: any) {
            console.error('Erro ao listar sessões:', error.message);
            return [];
        }
    }

    getWebRTCUrl(cameraPath: string): string {
        return `${this.webrtcBaseUrl}/${cameraPath}`;
    }
}

export const mediamtxAPI = new MediaMTXAPI();
