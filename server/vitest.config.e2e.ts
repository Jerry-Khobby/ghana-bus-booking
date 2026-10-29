import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // main.ts loads .env for the app; tests need it too (DATABASE_URL).
    setupFiles: ['dotenv/config'],
    // Tests never call Paystack; these win over .env (dotenv doesn't override)
    env: {
      PAYMENT_PROVIDER: 'fake',
      // One IP fires hundreds of requests; rate-limits.e2e-spec turns them on
      RATE_LIMITS: 'off',
      FAKE_PAYMENT_DELAY_MS: '0',
      QR_SIGNING_SECRET: 'test-qr-secret',
      TICKET_LINK_SECRET: 'test-ticket-link-secret',
      MAIL_PROVIDER: 'log',
      // Tests read the inbox right after a request, so send before answering
      MAIL_DELIVERY: 'inline',
      WEB_URL: 'http://web.test',
      TICK_SECRET: 'test-tick-secret',
      JWT_ACCESS_SECRET: 'test-jwt-secret',
      REFRESH_TOKEN_PEPPER: 'test-refresh-pepper',
      OTP_PEPPER: 'test-otp-pepper',
    },
    // One file at a time: each boots the whole app against the same database,
    // and running them all at once runs small machines out of memory
    fileParallelism: false,
    // Setup boots the app and writes fixtures to a real database
    hookTimeout: 60_000,
  },
});
