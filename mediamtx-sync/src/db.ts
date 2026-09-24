import { Pool } from 'pg';
import dotenv from 'dotenv';
import { needsRotation } from './paths';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Camera {
    id: string;
    nome: string;
    rtsp_url: string;
    mediamtx_path: string | null;
    webrtc_url: string | null;
    empresa_slug: string;
}

/** Active cameras of active empresas — a suspended empresa's cameras drop out of MediaMTX. Throws on error. */
export async function getAllActiveCameras(): Promise<Camera[]> {
    const { rows } = await pool.query<Camera>(`
        SELECT c.id, c.nome, c.rtsp_url, c.mediamtx_path, c.webrtc_url, e.slug AS empresa_slug
        FROM cameras c
        JOIN empresas e ON e.id = c.empresa_id
        WHERE c.ativo AND e.ativo
        ORDER BY c.created_at`);
    return rows;
}

/** Cameras whose MediaMTX path must be regenerated (legacy name or stale empresa prefix). */
export async function getCamerasToRotate(): Promise<(Camera & { ativo: boolean; empresa_ativa: boolean })[]> {
    const { rows } = await pool.query<Camera & { ativo: boolean; empresa_ativa: boolean }>(`
        SELECT c.id, c.nome, c.rtsp_url, c.mediamtx_path, c.webrtc_url, c.ativo, e.slug AS empresa_slug, e.ativo AS empresa_ativa
        FROM cameras c JOIN empresas e ON e.id = c.empresa_id
        WHERE c.mediamtx_path IS NOT NULL
        ORDER BY c.created_at`);
    return rows.filter((c) => needsRotation(c.mediamtx_path!, c.empresa_slug));
}

export async function updateCameraUrls(cameraId: string, mediamtxPath: string, webrtcUrl: string): Promise<void> {
    await pool.query('UPDATE cameras SET mediamtx_path = $1, webrtc_url = $2 WHERE id = $3', [mediamtxPath, webrtcUrl, cameraId]);
}

export function isUniqueViolation(error: unknown): boolean {
    return (error as { code?: string })?.code === '23505';
}

export async function closePool() {
    await pool.end();
}
