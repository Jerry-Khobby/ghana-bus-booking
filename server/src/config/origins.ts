/** WEB_URL, plus any extra origins in CORS_ORIGINS (comma-separated). */
export function allowedOrigins(env = process.env): string[] {
  const origins = [env.WEB_URL, ...(env.CORS_ORIGINS ?? '').split(',')]
    .map((o) => o?.trim().replace(/\/$/, ''))
    .filter((o): o is string => !!o);
  return origins.length ? origins : ['http://localhost:5173'];
}

/**
 * How many proxies sit in front of the app, for the real client IP that rate
 * limits count by. Render has one; a web host that forwards /api to Render
 * adds another (TRUST_PROXY=2).
 */
export function trustedProxies(env = process.env): number {
  const hops = Number(
    env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? 1 : 0),
  );
  return Number.isInteger(hops) && hops >= 0 ? hops : 1;
}
