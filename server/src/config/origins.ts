import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';

/** WEB_URL, plus any extra origins in CORS_ORIGINS (comma-separated). */
export function allowedOrigins(env = process.env): string[] {
  const origins = [env.WEB_URL, ...(env.CORS_ORIGINS ?? '').split(',')]
    .map((o) => o?.trim().replace(/\/$/, ''))
    .filter((o): o is string => !!o);
  return origins.length ? origins : ['http://localhost:5173'];
}

/**
 * How many proxies sit in front of the app, for the real client IP when no
 * CLIENT_IP_HEADERS are set. Counting hops only works when the chain is
 * fixed; behind Vercel and Render's Cloudflare it isn't.
 */
export function trustedProxies(env = process.env): number {
  const hops = Number(
    env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? 1 : 0),
  );
  return Number.isInteger(hops) && hops >= 0 ? hops : 1;
}

/**
 * Headers the hosting sets to name the visitor, tried in order
 * (CLIENT_IP_HEADERS, comma-separated). On Render, Cloudflare puts whoever
 * reached it in cf-connecting-ip and refuses requests that forge it; behind
 * Vercel's /api rewrite that is Vercel, and the visitor is in
 * x-vercel-forwarded-for. A caller skipping Vercel can send their own
 * x-vercel-forwarded-for, which only dodges the per-IP limits: account
 * lockout and per-email code limits still hold. List only headers a proxy
 * in front of the app sets.
 */
export function clientIpHeaders(env = process.env): string[] {
  return (env.CLIENT_IP_HEADERS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** The first valid address in those headers, in order. */
export function clientIpFrom(
  headers: IncomingHttpHeaders,
  names: string[],
): string | undefined {
  for (const name of names) {
    const raw = headers[name];
    const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (first && isIP(first)) return first;
  }
  return undefined;
}
