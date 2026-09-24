import express from 'express';
import dotenv from 'dotenv';
import { syncCamerasToMediaMTX, startPeriodicSync } from './sync';
import { mediamtxAPI } from './mediamtx-api';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3002);
// Endpoints have no auth, so only local callers (the backend) may reach them.
const HOST = '127.0.0.1';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '30000');

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Trigger sync manual
app.post('/sync', async (req, res) => {
    try {
        await syncCamerasToMediaMTX();
        res.json({ success: true, message: 'Sincronização concluída' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Status do MediaMTX
app.get('/mediamtx/status', async (req, res) => {
    try {
        const paths = await mediamtxAPI.listPaths();
        const sessions = await mediamtxAPI.listWebRTCSessions();

        res.json({
            paths: paths.length,
            activeSessions: sessions.length,
            webrtcBaseUrl: mediamtxAPI.webrtcBaseUrl,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Webhook para forçar re-sincronização imediata (ex.: chamado pelo backend após criar/editar câmera)
app.post('/webhook/camera-change', async (req, res) => {
    console.log('📨 Webhook recebido');
    try {
        await syncCamerasToMediaMTX();
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Sync Service rodando em ${HOST}:${PORT}`);
    console.log(`📡 MediaMTX: ${process.env.MEDIAMTX_BASE_URL}`);
    startPeriodicSync(SYNC_INTERVAL);
});
