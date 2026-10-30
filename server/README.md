# Seatline API

NestJS + Postgres + Prisma. The full design lives in the backend plan; this
file is the map of where code goes, and how to run and deploy it.

## Running it

```bash
cp .env.example .env # then fill in the Paystack and Gmail values
npm run db:up        # Postgres in Docker
npm run db:migrate   # apply migrations, regenerate the Prisma client
npm run db:seed      # demo data: Coastline Express, 6 trips (wipes the database)
npm run start:dev    # API on http://localhost:3000/api/v1, docs at /api/docs
```

Or run everything in containers: `docker compose up --build`.

The app checks every setting when it starts and refuses to boot, listing what
is missing or wrong, rather than failing on the first request that needs it.

## Project layout

One folder per NestJS module. Each `*.module.ts` starts with a comment
saying what the module owns, which tables it writes and which routes it serves.

| Folder | What lives here | Routes |
| --- | --- | --- |
| `src/prisma/` | `PrismaService`, the database client (global) | — |
| `src/health/` | Liveness and readiness checks | `/health`, `/health/ready` |
| `src/auth/` | Passenger sign-in by email code, tokens, profile | `/auth/*`, `/me` |
| `src/catalog/` | Public stations, trip search, seat maps | `/stations`, `/trips/*` |
| `src/bookings/` | Seat holds and the booking lifecycle | `/holds/*` |
| `src/payments/` | Charging, verifying, webhooks, provider adapters | `/holds/:id/pay`, `/payments/*`, `/webhooks/*` |
| `src/tickets/` | Ticket view, QR signing, PDF | `/tickets/*`, `/me/tickets` |
| `src/staff-auth/` | Staff login, invites, password reset | `/staff/*` |
| `src/agent/` | Agent console: walk-ins, scanning, boarding, departure | `/agent/*` |
| `src/admin/` | Operator admin: trips, buses, layouts, routes, bays, agents, cash | `/admin/*` |
| `src/platform/` | Platform admin: operators and shared stations | `/platform/*` |
| `src/reports/` | Totals, charts, CSV export | `/reports/*` |
| `src/trips/` | Trip status refresh, departure, seat helpers (shared) | — |
| `src/messages/` | The email outbox, templates and mailers | — |
| `src/realtime/` | The event bus behind the live streams | `…/stream` routes in catalog, payments and agent |
| `src/audit/` | Who changed what | — |
| `src/tick/` | The scheduled sweep | `/internal/tick` |
| `src/common/` | Guards, decorators, the error filter, pipes, logging, rate limits | — |
| `src/config/` | The startup check of every setting | — |
| `src/generated/` | Prisma Client, generated — never edit, not committed | — |

All routes are under `/api/v1`.

### Inside a module

```text
src/bookings/
  bookings.module.ts       wiring: controllers, providers, exports
  bookings.controller.ts   HTTP only: parse the request, call the service, shape the reply
  bookings.service.ts      the business rules and database work
  dto/                     request/response classes with class-validator rules
  *.spec.ts                unit tests next to the code they test
```

Controllers never touch Prisma or write a status column directly; that goes
through the module's service. A module that needs another module's logic
imports that module and injects its exported service (for example,
`AdminModule` imports `TripsModule` to create trips).

## Database

- Schema: `prisma/schema.prisma`; config: `prisma.config.ts`
- After editing the schema: `npm run db:migrate` (asks for a migration name)
- Demo data: `npm run db:seed` empties every table and rebuilds Coastline Express
  (`prisma/seed.ts`). Staff accounts such as `admin@coastline.example`,
  `kofi.a@coastline.example` and `platform@seatline.example` use
  `SEED_PASSWORD` from `.env`.
- Browse the data: `npm run db:studio`

## Testing

```bash
npm test             # unit tests
npm run db:up        # the e2e suite needs the database
npm run test:e2e     # every endpoint against a real Postgres
```

The e2e suite never calls Paystack or Gmail: it uses the fake payment provider
and the log mailer, with rate limits off (one suite turns them back on). Each
suite builds its own operator, so it neither needs nor disturbs the seed data.
GitHub Actions runs both on every push to `main`.

## In production

- **Errors** always look like `{ "error": { "code", "message", "details",
  "requestId" } }`. The `requestId` is also in the `X-Request-Id` header and on
  the request's log line.
- **Logs** are JSON (pino). Tokens, cookies, hold tokens and Paystack signatures
  are redacted, including tokens in URLs.
- **Rate limits:** 100 requests a minute per IP, 10 on sign-in codes, staff
  login, holds and payment verify (`RATE_LIMITED`, with `Retry-After`).
- **CORS** allows only `WEB_URL` (plus any `CORS_ORIGINS`), with credentials
  for the refresh cookie.
- **Live updates** are Server-Sent Events on `/trips/:id/seats/stream`,
  `/payments/:id/stream` and `/agent/console/stream`. The event bus lives in
  the process, which suits one instance; with more, swap it for Postgres
  `LISTEN/NOTIFY`.

## Deploying (free: Neon + Render)

The API runs on a Render free web service built from `Dockerfile`; the
database is Neon's free plan. Each deploy runs `prisma migrate deploy` before
starting.

> A free Render service sleeps after 15 minutes without traffic, so the first
> request after a quiet spell takes about a minute while it wakes. Fine for a
> demo; a paid instance doesn't sleep.

1. **Neon.** Create a free project at [neon.tech](https://neon.tech). From
   *Connect*, copy two connection strings: the **pooled** one (its host has
   `-pooler`) for `DATABASE_URL`, and the **direct** one for `DIRECT_URL`.
2. **Render.** *New → Blueprint*, pick this repository. Render reads
   `render.yaml`, generates the signing secrets, and asks for the rest:
   `DATABASE_URL`, `DIRECT_URL`, `WEB_URL` (the web app's address),
   `PAYSTACK_SECRET_KEY` (an `sk_test_` key), `BREVO_API_KEY` and `MAIL_FROM`.
   It deploys when GitHub's checks pass.

   **Email:** Render's free plan blocks SMTP, so Gmail can't send from there.
   Email goes through [Brevo](https://www.brevo.com) over HTTPS instead (free,
   300 a day): create an account, verify your sender address under
   *Senders, domains & IPs* (a Gmail address is fine), create a key under
   *SMTP & API → API keys*, and set `MAIL_FROM` to that sender, e.g.
   `Seatline <you@gmail.com>`. Locally, `MAIL_PROVIDER=gmail` or `log` still works.
3. **Check it.** `https://<your-service>.onrender.com/api/v1/health/ready`
   should answer `{"status":"ok","database":"up"}`.
4. **Demo data (optional).** From your laptop, with Neon's direct URL:
   `DATABASE_URL="<direct url>" npm run db:seed`. This wipes that database.
5. **Paystack webhook.** In the Paystack dashboard (test mode), set the
   webhook URL to `https://<your-service>.onrender.com/api/v1/webhooks/paystack`.
6. **The tick.** In GitHub → *Settings → Secrets and variables → Actions*, add
   the variable `API_URL` (`https://<your-service>.onrender.com`) and the
   secret `TICK_SECRET` (copy it from the Render service's environment). The
   `Tick` workflow then runs every 30 minutes.
