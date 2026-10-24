# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
# Prisma's migration engine needs OpenSSL, which the slim image leaves out
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Match the npm that writes package-lock.json on the host. The image ships
# npm 10, which reads this lockfile differently and makes `npm ci` fail.
RUN npm install -g npm@11.7.0 --no-audit --no-fund

# Dependencies get their own layer, so editing source code doesn't reinstall
# them. The cache mount keeps npm's download cache between builds, so even a
# lockfile change only fetches the packages that changed.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .
RUN npx prisma generate && npm run build
# Strip dev dependencies here instead of running a second `npm ci` in the
# runner stage
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./
USER node

EXPOSE 3000

# Apply pending migrations, then start. Same command as the Render deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
