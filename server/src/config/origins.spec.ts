import { clientIpFrom, clientIpHeaders } from './origins.js';

describe('clientIpHeaders', () => {
  it('reads a comma-separated list, lowercased', () => {
    expect(
      clientIpHeaders({
        CLIENT_IP_HEADERS: ' X-Vercel-Forwarded-For, cf-connecting-ip ,',
      }),
    ).toEqual(['x-vercel-forwarded-for', 'cf-connecting-ip']);
    expect(clientIpHeaders({})).toEqual([]);
  });
});

describe('clientIpFrom', () => {
  const names = ['x-vercel-forwarded-for', 'cf-connecting-ip'];

  // What Render logged for the same visitor, through Vercel and directly
  it('names the visitor behind Vercel, where Cloudflare only sees Vercel', () => {
    expect(
      clientIpFrom(
        {
          'x-vercel-forwarded-for': '154.161.20.30',
          'cf-connecting-ip': '63.185.1.2',
          'x-forwarded-for': '154.161.20.30,63.185.1.2, 104.23.3.4, 10.196.0.5',
        },
        names,
      ),
    ).toBe('154.161.20.30');
  });

  it('falls back to Cloudflare for callers that skip Vercel', () => {
    expect(
      clientIpFrom(
        {
          'cf-connecting-ip': '154.161.20.30',
          'x-forwarded-for':
            '198.51.100.1,154.161.20.30, 162.158.5.6, 10.198.0.7',
        },
        names,
      ),
    ).toBe('154.161.20.30');
  });

  it('skips values that are not addresses, and headers not listed', () => {
    expect(
      clientIpFrom(
        {
          'x-vercel-forwarded-for': 'unknown',
          'cf-connecting-ip': '2a02:4780::1',
        },
        names,
      ),
    ).toBe('2a02:4780::1');
    expect(
      clientIpFrom({ 'x-real-ip': '198.51.100.4' }, names),
    ).toBeUndefined();
  });
});
