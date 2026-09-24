import { prisma } from '../prisma';

// Each funerária is reachable at https://<empresa slug>.<BASE_DOMAIN> (spec 08). The frontend
// tells the backend which slug it is on; the backend only uses it to narrow results down, so it
// never has to trust it. An empty BASE_DOMAIN turns subdomains off.

/** Subdomains taken by infrastructure; no empresa may use them as slug. Mirrored in src/lib/hostEmpresa.ts (frontend). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'app', 'app2', 'backend', 'media', 'media2', 'apicam', 'api', 'www', 'admin', 'platform',
  'check', 'mail', 'smtp', 'ftp', 'status', 'static', 'cdn', 'painel', 'suporte',
]);

/** A sala slug becomes /<sala> on the subdomain, so it can't shadow a first-level route. */
export const RESERVED_SALA_SLUGS: ReadonlySet<string> = new Set(['admin', 'velorio', 'platform']);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function baseDomain(): string {
  return (process.env.BASE_DOMAIN ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** The empresa slug of an exact `https://<slug>.<BASE_DOMAIN>` origin, or null. Pure — no DB. */
export function parseEmpresaOrigin(origin: string): string | null {
  const base = baseDomain();
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.origin.toLowerCase() !== origin.toLowerCase()) return null;
  const host = url.hostname.toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return null;
  return slug;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { ok: boolean; at: number }>();

export function clearEmpresaOriginCache() {
  cache.clear();
}

/** True for the subdomain of an active empresa. Cached per slug for a minute (positive and negative). */
export async function isEmpresaOrigin(origin: string): Promise<boolean> {
  const slug = parseEmpresaOrigin(origin);
  if (!slug) return false;
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const empresa = await prisma.empresas.findUnique({ where: { slug }, select: { ativo: true } });
  const ok = !!empresa?.ativo;
  cache.set(slug, { ok, at: Date.now() });
  return ok;
}
