// Asks mediamtx-sync to sync right away (camera or empresa status changed) instead of waiting for
// its 30 s cycle. Fire-and-forget: never delays or fails the API response — the cycle covers misses.
const SYNC_URL = process.env.MEDIAMTX_SYNC_URL;

export function notifyMediamtxSync(reason: string): void {
  if (!SYNC_URL) return;
  fetch(`${SYNC_URL.replace(/\/+$/, '')}/webhook/camera-change`, { method: 'POST', signal: AbortSignal.timeout(2000) }).catch(
    (error) => console.warn(`[mediamtx-sync] webhook falhou (${reason}): ${error.message}`),
  );
}
