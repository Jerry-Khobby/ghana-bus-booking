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
    env: { PAYMENT_PROVIDER: 'fake', FAKE_PAYMENT_DELAY_MS: '0' },
    // One file at a time: each boots the whole app against the same database,
    // and running them all at once runs small machines out of memory
    fileParallelism: false,
  },
});
