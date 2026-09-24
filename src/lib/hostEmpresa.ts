// Which funerária this page belongs to, from the address: https://<slug>.<VITE_BASE_DOMAIN>
// (spec 08). app2.campax.com.br, a raw IP and localhost have none. The backend only uses the
// slug to narrow results down (login, token lookup), so nothing here is trusted.

/** Same list as backend/src/lib/empresaHost.ts. */
const RESERVED_SLUGS = new Set([
  'app', 'app2', 'backend', 'media', 'media2', 'apicam', 'api', 'www', 'admin', 'platform',
  'check', 'mail', 'smtp', 'ftp', 'status', 'static', 'cdn', 'painel', 'suporte',
]);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEV_KEY = 'campax:dev-empresa';

const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN ?? '').trim().toLowerCase();

export function slugFromHostname(hostname: string, baseDomain: string): string | null {
  if (!baseDomain) return null;
  const host = hostname.toLowerCase();
  const suffix = `.${baseDomain}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null;
}

function readHostSlug(): string | null {
  // Development only: ?empresa=<slug> simulates the subdomain and sticks for the tab's session.
  if (import.meta.env.DEV) {
    try {
      const param = new URLSearchParams(window.location.search).get('empresa');
      if (param !== null) {
        if (param) sessionStorage.setItem(DEV_KEY, param.toLowerCase());
        else sessionStorage.removeItem(DEV_KEY);
      }
      const saved = sessionStorage.getItem(DEV_KEY);
      if (saved) return saved;
    } catch {
      // sessionStorage unavailable: fall through to the real hostname
    }
  }
  return slugFromHostname(window.location.hostname, BASE_DOMAIN);
}

/** The empresa slug of this address, or null on the generic address. Fixed for the page's lifetime. */
export const HOST_SLUG: string | null = readHostSlug();

/** https://<slug>.<VITE_BASE_DOMAIN>, or null when subdomains are off. */
export function empresaOrigin(slug: string): string | null {
  return BASE_DOMAIN ? `https://${slug}.${BASE_DOMAIN}` : null;
}
