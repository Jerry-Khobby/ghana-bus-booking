import { loggerParams, redactUrl } from './logging.js';

describe('redactUrl', () => {
  it('hides tokens in the query string, and nothing else', () => {
    expect(
      redactUrl(
        '/api/v1/agent/console/stream?bayId=abc&accessToken=eyJhbGci.x.y',
      ),
    ).toBe('/api/v1/agent/console/stream?bayId=abc&accessToken=[redacted]');
    expect(redactUrl('/api/v1/tickets/SL-AAAA-BB?t=123.sig')).toBe(
      '/api/v1/tickets/SL-AAAA-BB?t=[redacted]',
    );
    expect(redactUrl('/api/v1/payments/x/stream?holdToken=abc')).toBe(
      '/api/v1/payments/x/stream?holdToken=[redacted]',
    );
    expect(redactUrl('/api/v1/trips/search?to=accra&date=2026-10-28')).toBe(
      '/api/v1/trips/search?to=accra&date=2026-10-28',
    );
  });
});

describe('loggerParams', () => {
  const genReqId = (header?: string) => {
    const params = loggerParams({ NODE_ENV: 'test' });
    const set: Record<string, string> = {};
    const http = params.pinoHttp as {
      genReqId: (req: unknown, res: unknown) => string;
    };
    const id = http.genReqId(
      { headers: header ? { 'x-request-id': header } : {} },
      { setHeader: (k: string, v: string) => (set[k] = v) },
    );
    return { id, header: set['X-Request-Id'] };
  };

  it('keeps a sensible incoming request id and echoes it', () => {
    expect(genReqId('client-req-1234')).toEqual({
      id: 'client-req-1234',
      header: 'client-req-1234',
    });
  });

  it('makes a new id when none (or a strange one) is sent', () => {
    expect(genReqId().id).toMatch(/^[0-9a-f-]{36}$/);
    expect(genReqId('<script>').id).not.toBe('<script>');
  });

  it('is silent in tests and JSON in production', () => {
    expect(loggerParams({ NODE_ENV: 'test' }).pinoHttp).toMatchObject({
      level: 'silent',
    });
    const production = loggerParams({ NODE_ENV: 'production' }).pinoHttp;
    expect(production).toMatchObject({ level: 'info' });
    expect(production).not.toHaveProperty('transport');
  });
});
