import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations need a direct connection; Neon's pooled DATABASE_URL won't do.
    // Read with process.env rather than env() so `prisma generate` still works
    // during the Docker build, where no database URL is set.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
