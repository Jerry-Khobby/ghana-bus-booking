import { assertEnv, checkEnv } from './env.js';

const secret = 'x'.repeat(40);
const good = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/seatline',
  JWT_ACCESS_SECRET: secret,
  REFRESH_TOKEN_PEPPER: secret,
  OTP_PEPPER: secret,
  QR_SIGNING_SECRET: secret,
  TICKET_LINK_SECRET: secret,
  PAYMENT_PROVIDER: 'paystack',
  PAYSTACK_SECRET_KEY: 'sk_test_abc123',
  MAIL_PROVIDER: 'gmail',
  GMAIL_USER: 'seatline@gmail.com',
  GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  WEB_URL: 'https://seatline.example',
  TICK_SECRET: secret,
};

describe('checkEnv', () => {
  it('accepts a complete setup', () => {
    expect(checkEnv({ ...good, NODE_ENV: 'production' })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('lists everything missing at once', () => {
    expect(checkEnv({}).errors).toEqual([
      'DATABASE_URL is missing',
      'JWT_ACCESS_SECRET is missing',
      'REFRESH_TOKEN_PEPPER is missing',
      'OTP_PEPPER is missing',
      'QR_SIGNING_SECRET is missing',
      'TICKET_LINK_SECRET is missing',
      'PAYSTACK_SECRET_KEY is missing',
    ]);
  });

  it('is stricter in production', () => {
    const { errors } = checkEnv({
      ...good,
      NODE_ENV: 'production',
      OTP_PEPPER: 'replace-with-a-long-random-string',
      PAYMENT_PROVIDER: 'fake',
      WEB_URL: undefined,
    });
    expect(errors).toEqual([
      'OTP_PEPPER must be a long random string in production',
      'PAYMENT_PROVIDER=fake is for tests only',
      'WEB_URL is missing (ticket links and CORS need it)',
    ]);
  });

  it('checks the shape of keys and passwords', () => {
    const { errors } = checkEnv({
      ...good,
      PAYSTACK_SECRET_KEY: 'pk_test_abc',
      GMAIL_APP_PASSWORD: 'short',
      PORT: 'eighty',
    });
    expect(errors).toEqual([
      'PAYSTACK_SECRET_KEY must be an sk_test_ or sk_live_ key',
      'GMAIL_APP_PASSWORD must be the 16-letter app password',
      'PORT must be a number',
    ]);
  });

  it('warns when the tick has no secret', () => {
    expect(checkEnv({ ...good, TICK_SECRET: undefined }).warnings).toEqual([
      'TICK_SECRET is not set: POST /internal/tick stays closed',
    ]);
  });
});

describe('assertEnv', () => {
  it('stops the boot with the list', () => {
    expect(() => assertEnv({ ...good, DATABASE_URL: 'mysql://x' })).toThrow(
      /DATABASE_URL must be a postgresql:\/\/ URL/,
    );
  });
});
