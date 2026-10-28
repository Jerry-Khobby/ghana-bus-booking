import {
  SkipThrottle,
  Throttle,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';

const MINUTE_MS = 60_000;

/**
 * 100 requests a minute per IP by default (the plan's number). Behind
 * Render's proxy the IP is the real client's, since production trusts one
 * proxy. RATE_LIMITS=off turns them off; the e2e tests fire far more than a
 * person would from one address.
 */
export const rateLimits: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: MINUTE_MS, limit: 100 }],
  skipIf: () => process.env.RATE_LIMITS === 'off',
  errorMessage: 'Too many requests. Try again in a minute.',
};

/**
 * 10 a minute per IP: sign-in codes, logins, holds and "I have approved it",
 * where a script hammering the route is an attack or a bug.
 */
export const StrictLimit = () =>
  Throttle({ default: { limit: 10, ttl: MINUTE_MS } });

/** Callers that come from a few known IPs (Paystack, the scheduler, Render). */
export const NoLimit = () => SkipThrottle({ default: true });
