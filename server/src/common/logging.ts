import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

const REQUEST_ID = /^[\w-]{8,100}$/;

/**
 * Query values that grant access: the stream tokens, the ticket link's `t`,
 * and the staff invite / reset `token`.
 */
const SECRET_QUERY = /([?&](?:accessToken|holdToken|t|token)=)[^&#]*/gi;

/** A URL safe to log: secrets in the query string are replaced. */
export function redactUrl(url: string | undefined): string | undefined {
  return url?.replace(SECRET_QUERY, '$1[redacted]');
}

/**
 * Structured request logs (pino). Every request gets an id: the caller's
 * X-Request-Id if it looks like one, else a new one. It goes back in the
 * X-Request-Id header and in error bodies, so a passenger's screenshot leads
 * straight to the log line. Readable lines locally, JSON in production,
 * silent in tests.
 */
export function loggerParams(env = process.env): Params {
  const production = env.NODE_ENV === 'production';
  const test = env.NODE_ENV === 'test';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL ?? (test ? 'silent' : production ? 'info' : 'debug'),
      genReqId(req: IncomingMessage, res: ServerResponse) {
        const given = req.headers['x-request-id'];
        const id =
          typeof given === 'string' && REQUEST_ID.test(given)
            ? given
            : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Tokens, cookies and signatures never reach the logs
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-hold-token"]',
          'req.headers["x-tick-secret"]',
          'req.headers["x-paystack-signature"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      serializers: {
        req(req: { id: string; method: string; url: string }) {
          return { id: req.id, method: req.method, url: redactUrl(req.url) };
        },
      },
      // Render and the tick probe health constantly; don't drown the logs
      autoLogging: {
        ignore: (req: IncomingMessage) => !!req.url?.includes('/health'),
      },
      ...(!production &&
        !test && {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'HH:MM:ss' },
          },
        }),
    },
  };
}
