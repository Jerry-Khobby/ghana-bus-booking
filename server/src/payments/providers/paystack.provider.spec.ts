import { createHmac } from 'node:crypto';
import { classify, PaystackProvider, toResult } from './paystack.provider.js';
import { ProviderUnavailableError } from './payment-provider.js';

const SECRET = 'sk_test_unit';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('PaystackProvider', () => {
  const provider = new PaystackProvider(SECRET);
  const momo = {
    reference: 'pay_1',
    amountPesewas: 5100,
    email: 'ama@example.com',
    phone: '+233551234987',
    network: 'TELECEL' as const,
  };

  it('sends a mobile money charge in the shape Paystack expects', async () => {
    const fetchMock = mockFetch(200, {
      status: true,
      message: 'Charge attempted',
      data: { status: 'pay_offline', display_text: 'Approve on your phone' },
    });

    const result = await provider.chargeMomo(momo);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.paystack.co/charge');
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init.body)).toEqual({
      email: 'ama@example.com',
      amount: 5100,
      currency: 'GHS',
      reference: 'pay_1',
      mobile_money: { phone: '0551234987', provider: 'vod' },
    });
    expect(result).toMatchObject({
      status: 'pending',
      displayText: 'Approve on your phone',
    });
  });

  it('reads a test-mode decline as a failure with the reason', async () => {
    mockFetch(400, {
      status: false,
      message: 'Charge attempted',
      data: {
        status: 'failed',
        message: 'Declined. Please use the test mobile money number.',
      },
    });

    expect(await provider.chargeMomo(momo)).toMatchObject({
      status: 'failed',
      failureCode: 'PROVIDER_REFUSED',
      message: 'Declined. Please use the test mobile money number.',
    });
  });

  it('returns the checkout link for cards', async () => {
    mockFetch(200, {
      status: true,
      message: 'Authorization URL created',
      data: { authorization_url: 'https://checkout.paystack.com/abc' },
    });

    expect(
      await provider.initCard({
        reference: 'pay_2',
        amountPesewas: 5100,
        email: 'ama@example.com',
      }),
    ).toEqual({
      status: 'pending',
      authorizationUrl: 'https://checkout.paystack.com/abc',
    });
  });

  it('treats an unknown reference on verify as still pending', async () => {
    mockFetch(400, {
      status: false,
      message: 'Transaction reference not found',
    });
    expect(await provider.verify('nope')).toEqual({ status: 'pending' });
  });

  it('reports outages as ProviderUnavailableError', async () => {
    mockFetch(502, { status: false, message: 'Bad gateway' });
    await expect(provider.verify('x')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(provider.verify('x')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('asks Paystack to refund a transaction in full', async () => {
    const fetchMock = mockFetch(200, {
      status: true,
      message: 'Refund has been queued for processing',
    });
    await provider.refund('pay_1', 5100);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.paystack.co/refund');
    expect(JSON.parse(init.body)).toMatchObject({
      transaction: 'pay_1',
      amount: 5100,
      currency: 'GHS',
    });
  });

  it('throws when Paystack refuses a refund', async () => {
    mockFetch(400, {
      status: false,
      message: 'Transaction has been fully reversed',
    });
    await expect(provider.refund('pay_1', 5100)).rejects.toThrow(
      'Paystack refused the refund: Transaction has been fully reversed',
    );
  });

  it('checks webhook signatures against the raw body', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const good = createHmac('sha512', SECRET).update(body).digest('hex');

    expect(provider.verifyWebhook(body, good)).toBe(true);
    expect(provider.verifyWebhook(Buffer.from('{"event":"x"}'), good)).toBe(
      false,
    );
    expect(provider.verifyWebhook(body, 'abc')).toBe(false);
    expect(provider.verifyWebhook(body, undefined)).toBe(false);
  });
});

describe('toResult', () => {
  it('maps a success with its amount', () => {
    expect(
      toResult({
        status: true,
        message: 'Verification successful',
        data: { status: 'success', amount: 5100, currency: 'GHS' },
      }),
    ).toMatchObject({
      status: 'success',
      amountPesewas: 5100,
      currency: 'GHS',
    });
  });

  it('maps an abandoned charge to an expired prompt', () => {
    expect(
      toResult({ status: true, message: 'ok', data: { status: 'abandoned' } }),
    ).toMatchObject({ status: 'failed', failureCode: 'PROMPT_EXPIRED' });
  });
});

describe('classify', () => {
  it.each([
    ['Insufficient funds', 'INSUFFICIENT_FUNDS'],
    ['Incorrect PIN', 'WRONG_PIN'],
    ['Transaction timed out', 'PROMPT_EXPIRED'],
    ['Declined by the bank', 'CARD_DECLINED'],
    ['Something else', 'PROVIDER_REFUSED'],
    [null, 'PROVIDER_REFUSED'],
  ])('%s → %s', (reason, code) => {
    expect(classify(reason)).toBe(code);
  });
});
