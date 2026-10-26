import { FakeProvider } from './fake.provider.js';

const momo = (reference: string, phone: string) => ({
  reference,
  phone,
  network: 'MTN' as const,
  amountPesewas: 5100,
  email: 'ama@example.com',
});

describe('FakeProvider', () => {
  it('stays pending until the delay passes', async () => {
    const fake = new FakeProvider();
    fake.delayMs = 60_000;
    await fake.chargeMomo(momo('a', '+233240000000'));
    expect(await fake.verify('a')).toEqual({ status: 'pending' });
  });

  it('decides by the last four digits once the delay passes', async () => {
    const fake = new FakeProvider();
    fake.delayMs = 0;
    await fake.chargeMomo(momo('ok', '+233240000000'));
    await fake.chargeMomo(momo('broke', '+233241111111'));
    await fake.chargeMomo(momo('waiting', '+233241234567'));

    expect(await fake.verify('ok')).toEqual({
      status: 'success',
      amountPesewas: 5100,
      currency: 'GHS',
    });
    expect(await fake.verify('broke')).toEqual({
      status: 'failed',
      failureCode: 'INSUFFICIENT_FUNDS',
    });
    expect(await fake.verify('waiting')).toEqual({ status: 'pending' });
  });

  it('succeeds cards and returns a checkout link', async () => {
    const fake = new FakeProvider();
    fake.delayMs = 0;
    const started = await fake.initCard({
      reference: 'card',
      amountPesewas: 5100,
      email: 'ama@example.com',
    });
    expect(started.authorizationUrl).toBe('fake://checkout/card');
    expect((await fake.verify('card')).status).toBe('success');
  });

  it("knows nothing about charges it didn't make", async () => {
    expect(await new FakeProvider().verify('unknown')).toEqual({
      status: 'pending',
    });
  });
});
