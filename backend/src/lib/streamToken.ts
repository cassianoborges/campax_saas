import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Short-lived tokens that let a viewer read specific MediaMTX paths (spec 06, part B). Signed with a
// key derived from JWT_SECRET, and with their own audience, so a stream token is never accepted as
// a login token (or the other way round).
const AUDIENCE = 'mediamtx-read';

/** Stream reads are allowed this long before a velório starts and after it ends. */
export const STREAM_MARGIN_MS = Number(process.env.STREAM_MARGIN_MINUTES ?? 30) * 60_000;

function key() {
  return crypto.createHmac('sha256', process.env.JWT_SECRET!).update('mediamtx-stream-token').digest();
}

export interface StreamTokenPayload {
  /** Velório the viewer opened; null for an admin preview (no time window). */
  v: string | null;
  /** MediaMTX paths the token may read. */
  p: string[];
}

/** `expiresIn`: seconds or a duration string ('1h'). */
export function signStreamToken(payload: StreamTokenPayload, expiresIn: number | string): string {
  return jwt.sign(payload, key(), { audience: AUDIENCE, expiresIn } as jwt.SignOptions);
}

/** Whether a velório's cameras may be watched now (its time window plus the margin). */
export function velorioNoAr(velorio: { data_inicio: Date; data_fim: Date }, now = Date.now()): boolean {
  return now >= velorio.data_inicio.getTime() - STREAM_MARGIN_MS && now <= velorio.data_fim.getTime() + STREAM_MARGIN_MS;
}

/**
 * Token lifetime for a velório: until it ends (plus the margin), so a viewer who reconnects late in
 * an overnight velório isn't locked out. MediaMTX checks on every connection, not during playback.
 */
export function velorioTokenTtlSeconds(velorio: { data_fim: Date }, now = Date.now()): number {
  return Math.max(60, Math.ceil((velorio.data_fim.getTime() + STREAM_MARGIN_MS - now) / 1000));
}

export function verifyStreamToken(token: string): StreamTokenPayload | null {
  try {
    const decoded = jwt.verify(token, key(), { audience: AUDIENCE }) as StreamTokenPayload;
    return Array.isArray(decoded.p) ? decoded : null;
  } catch {
    return null;
  }
}

/** URL of MediaMTX's reader page for a path, carrying the token (the page forwards it to WHEP). */
export function streamUrl(webrtcUrl: string, token: string): string {
  return `${webrtcUrl.replace(/\/+$/, '')}/?t=${encodeURIComponent(token)}`;
}
