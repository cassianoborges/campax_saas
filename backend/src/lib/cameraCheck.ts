import dns from 'dns/promises';
import net from 'net';

// Camera reachability, checked by the backend (spec docs/multiempresa/07-camera-status.md) instead
// of the old public camera-status-api: only cameras of the caller's empresa, using the rtsp_url
// stored in the DB — never an address sent by the client.
//
// Internal addresses are refused both here and when a camera is saved: MediaMTX also connects to
// rtsp_url (it's the path source), so a "camera" pointing at 127.0.0.1:5432 would let any empresa
// probe the VPS's own services.

const DEFAULT_RTSP_PORT = 554;
const TIMEOUT_MS = 3000;
const MAX_CONCURRENT = 10;
const CACHE_MS = 30_000;

export interface RtspHost {
  host: string;
  port: number;
}

/** Host and port of an rtsp:// or rtsps:// URL (credentials may contain '@' and ':'). */
export function parseRtspHost(rtspUrl: string): RtspHost | null {
  const match = /^rtsps?:\/\/(.+)$/i.exec(rtspUrl.trim());
  if (!match) return null;
  // Credentials end at the LAST '@' before the path (passwords may contain '@').
  const authority = match[1].split('/')[0];
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);

  let host: string;
  let portText: string | undefined;
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    if (end < 0) return null;
    host = hostPort.slice(1, end);
    portText = hostPort.slice(end + 1).replace(/^:/, '') || undefined;
  } else {
    [host, portText] = hostPort.split(':');
  }

  const port = portText ? Number(portText) : DEFAULT_RTSP_PORT;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

/** Loopback, private, link-local (incl. cloud metadata), CGNAT, multicast, reserved — IPv4 and IPv6. */
export function defaultBlockList(): net.BlockList {
  const list = new net.BlockList();
  for (const [network, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ] as const) {
    list.addSubnet(network, prefix, 'ipv4');
  }
  for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
    list.addSubnet(network, prefix, 'ipv6');
  }
  return list;
}

export interface CheckOptions {
  blockList?: net.BlockList;
  lookup?: (host: string) => Promise<{ address: string; family: number }>;
}

/** Defaults used by the routes. Tests override them (e.g. an empty block list to reach a local server). */
export const checkDefaults: CheckOptions = {};

export class BlockedAddressError extends Error {}

/**
 * Resolves the host ONCE and returns the IP to connect to — so a hostname can't pass validation
 * pointing somewhere public and then be dialed pointing somewhere internal (DNS rebinding).
 */
export async function resolveAllowed(host: string, options: CheckOptions = {}): Promise<{ address: string; family: 4 | 6 }> {
  const blockList = options.blockList ?? checkDefaults.blockList ?? defaultBlockList();
  const lookup = options.lookup ?? checkDefaults.lookup ?? ((h: string) => dns.lookup(h));
  let { address, family } = net.isIP(host) ? { address: host, family: net.isIP(host) } : await lookup(host);
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it really is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) [address, family] = [mapped[1], 4];
  if (blockList.check(address, family === 6 ? 'ipv6' : 'ipv4')) throw new BlockedAddressError('Endereço não permitido');
  return { address, family: family === 6 ? 6 : 4 };
}

/** Validation for saving a camera: returns an error message, or null when the URL is acceptable. */
export async function validateCameraUrl(rtspUrl: unknown, options: CheckOptions = {}): Promise<string | null> {
  if (typeof rtspUrl !== 'string') return 'Informe o endereço RTSP da câmera';
  const parsed = parseRtspHost(rtspUrl);
  if (!parsed) return 'Endereço inválido: use rtsp://usuario:senha@host:porta/caminho';
  try {
    await resolveAllowed(parsed.host, options);
    return null;
  } catch (error) {
    return error instanceof BlockedAddressError ? 'Endereço da câmera não permitido' : 'Não foi possível resolver o endereço da câmera';
  }
}

function tcpConnect(address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    const done = (online: boolean) => {
      socket.destroy();
      resolve(online);
    };
    socket.setTimeout(TIMEOUT_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export interface CheckResult {
  online: boolean;
  checked_at: string;
  error?: string;
}

const cache = new Map<string, { result: CheckResult; at: number }>();

/** For tests. */
export function clearCheckCache() {
  cache.clear();
}

async function checkOne(rtspUrl: string, options: CheckOptions): Promise<CheckResult> {
  const checked_at = new Date().toISOString();
  const parsed = parseRtspHost(rtspUrl);
  if (!parsed) return { online: false, checked_at, error: 'Endereço inválido' };
  try {
    const { address } = await resolveAllowed(parsed.host, options);
    return { online: await tcpConnect(address, parsed.port), checked_at };
  } catch (error) {
    return { online: false, checked_at, error: error instanceof BlockedAddressError ? error.message : 'Host não encontrado' };
  }
}

/**
 * TCP reachability of each camera, at most MAX_CONCURRENT connections at a time. Results are
 * cached per camera for CACHE_MS, so reopening the Câmeras page doesn't hammer the hosts (and the
 * route can't be used to hammer them either).
 */
export async function checkCameras(
  cameras: { id: string; rtsp_url: string }[],
  options: CheckOptions = {},
): Promise<Map<string, CheckResult>> {
  const results = new Map<string, CheckResult>();
  const pending = cameras.filter((camera) => {
    const hit = cache.get(`${camera.id}|${camera.rtsp_url}`);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      results.set(camera.id, hit.result);
      return false;
    }
    return true;
  });

  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const camera = pending[next++];
      const result = await checkOne(camera.rtsp_url, options);
      cache.set(`${camera.id}|${camera.rtsp_url}`, { result, at: Date.now() });
      results.set(camera.id, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, pending.length) }, worker));
  return results;
}
