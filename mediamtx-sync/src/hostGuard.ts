import dns from 'dns/promises';
import net from 'net';

// Defense in depth (spec 07): the backend already refuses to save a camera whose rtsp_url points at
// an internal address; this keeps such a camera out of MediaMTX even if the DB is edited directly
// (MediaMTX would otherwise dial it as the path source). Same list as backend/src/lib/cameraCheck.ts.
const blockList = new net.BlockList();
for (const [network, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockList.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
    blockList.addSubnet(network, prefix, 'ipv6');
}

/** Host of an rtsp(s) URL (credentials may contain '@'), or null. */
export function rtspHost(rtspUrl: string): string | null {
    const match = /^rtsps?:\/\/([^/]+)/i.exec(rtspUrl.trim());
    if (!match) return null;
    const hostPort = match[1].slice(match[1].lastIndexOf('@') + 1);
    const host = hostPort.startsWith('[') ? hostPort.slice(1, hostPort.indexOf(']')) : hostPort.split(':')[0];
    return host || null;
}

/** Why a camera must not be sent to MediaMTX, or null if its host is fine. */
export async function blockedReason(rtspUrl: string): Promise<string | null> {
    const host = rtspHost(rtspUrl);
    if (!host) return 'endereço RTSP inválido';
    try {
        let { address, family } = net.isIP(host) ? { address: host, family: net.isIP(host) } : await dns.lookup(host);
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
        if (mapped) [address, family] = [mapped[1], 4];
        return blockList.check(address, family === 6 ? 'ipv6' : 'ipv4') ? `endereço interno (${address})` : null;
    } catch {
        // Unresolvable right now (DNS hiccup, camera's dynamic DNS down): not a security problem.
        return null;
    }
}
