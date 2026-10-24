# Seatline API

NestJS + Postgres + Prisma. The full design lives in the backend plan; this
file is the map of where code goes.

## Running it

```bash
cp .env.example .env
npm run db:up        # Postgres in Docker
npm run db:migrate   # apply migrations, regenerate the Prisma client
npm run start:dev    # API on http://localhost:3000/api/v1
```

Or run everything in containers: `docker compose up --build`.

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
| `src/trips/` | Trip creation, status refresh, seat generation (shared service) | — |
| `src/messages/` | Email (and later SMS) templates and sending | — |
| `src/realtime/` | Server-Sent Event streams | — |
| `src/audit/` | Who changed what | — |
| `src/tick/` | The scheduled sweep | `/internal/tick` |
| `src/generated/` | Prisma Client, generated — never edit, not committed | — |

All routes are under `/api/v1`.

### Inside a module

```
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

Code shared by every module (guards, decorators, the error filter, pipes)
goes in `src/common/` when the first piece of it is written.

## Database

- Schema: `prisma/schema.prisma`; config: `prisma.config.ts`
- After editing the schema: `npm run db:migrate` (asks for a migration name)
- Browse the data: `npm run db:studio`
