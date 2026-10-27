import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'sl_refresh';

// Only sent to /api/v1/auth/*, never readable by page scripts. Secure in
// production; plain http://localhost needs it off.
const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
});

export function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(REFRESH_COOKIE, token, { ...options(), expires });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, options());
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE
  ];
  return typeof value === 'string' ? value : undefined;
}
