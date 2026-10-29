import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app.exception.js';
import { allowedOrigins } from '../config/origins.js';

export const REFRESH_COOKIE = 'sl_refresh';

type SameSite = 'lax' | 'strict' | 'none';

/**
 * In production the web app and the API live on different sites (for
 * example *.vercel.app and *.onrender.com), and browsers only send a cookie
 * on such calls when it is SameSite=None. Host both under one site (the web
 * host forwarding /api to the API) and REFRESH_COOKIE_SAMESITE=lax works.
 */
function sameSite(): SameSite {
  const set = process.env.REFRESH_COOKIE_SAMESITE?.trim().toLowerCase();
  if (set === 'lax' || set === 'strict' || set === 'none') return set;
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

// Only sent to /api/v1/auth/*, never readable by page scripts. Secure in
// production; plain http://localhost needs it off.
const options = () => {
  const site = sameSite();
  return {
    httpOnly: true,
    // SameSite=None is ignored by browsers unless the cookie is Secure
    secure: process.env.NODE_ENV === 'production' || site === 'none',
    sameSite: site,
    path: '/api/v1/auth',
  };
};

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

/**
 * The cookie goes with every call to /auth, from any site, so a page
 * elsewhere could make the browser refresh or sign out. Browsers name the
 * calling page in Origin; only the web app's own pages may use the cookie.
 * Calls without Origin (curl, server to server) carry no browser cookie
 * unless the caller has the token anyway.
 */
export function assertCookieOrigin(req: Request) {
  const origin = req.header('origin');
  if (origin && !allowedOrigins().includes(origin.replace(/\/$/, ''))) {
    throw new AppException(
      'FORBIDDEN',
      'This site may not use your Seatline session',
      HttpStatus.FORBIDDEN,
    );
  }
}
