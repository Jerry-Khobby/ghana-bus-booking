# Seatline: Bus Booking for Ghana

A full-stack web app for booking intercity bus seats in Ghana. Passengers pick an exact seat and pay with mobile money or card. Station agents sell walk-in tickets and scan passengers onto the bus. Bus operators run their fleet, timetable and staff from a dashboard.

- **Live app:** https://ghana-bus-booking.vercel.app
- **API:** https://seatline-api-ls9x.onrender.com/api/v1
- **Code:** https://github.com/Jerry-Khobby/ghana-bus-booking

---

## The problem it solves

Intercity travel in Ghana usually means going to the station early, queueing, and hoping a seat is left. Many buses also don't leave at a fixed time; they leave when they're full. Seatline brings both kinds of departure online:

- **Passengers** see real seat availability, book from their phone and pay with mobile money, the way most people in Ghana pay.
- **Station agents** see what's loading at their bay in real time and sell the remaining seats to walk-ins without double-booking anyone.
- **Operators** publish trips, track sales, and handle cancellations and refunds from one place.

Payments run on Paystack's test mode, so no real money moves.

---

## What it does, by user

### Passengers
- Search trips by origin, destination and date.
- Pick seats on a seat map drawn from the bus's real layout.
- Hold 1–6 seats for a limited time while paying.
- Pay with **mobile money** (MTN, Telecel, AirtelTigo) or **card**, through Paystack.
- Get the ticket by email with a signed **QR code**, and download a **PDF ticket**.
- Sign in with a **one-time code sent by email** (no password) to see "My tickets" and request refunds.

### Station agents
- Use a live console for their bay, showing the bus loading now and the seats left. It updates in real time.
- Sell walk-in tickets for cash or mobile money.
- Scan tickets with the phone camera to board passengers. Fake, used and wrong-trip tickets are rejected.
- Mark a trip as departed.

### Operators
- Manage buses, and draw seat layouts in a grid editor.
- Manage routes, stations and loading bays.
- Publish trips of two kinds: **fixed time** ("departs 14:30") or **leave when full** (loads from a set time and must leave by a deadline).
- Invite staff, assign agents to bays, and disable accounts.
- See sales reports and export them as CSV.
- Cancel a trip: online buyers are refunded automatically, and cash buyers are listed for repayment.

### Platform admin
- Add bus operators, and send recovery sign-in links to operator admins.

---

## Tech stack

### Backend (`server/`)

| Area | Technology |
|---|---|
| Language and runtime | TypeScript, Node.js 22 |
| Framework | NestJS 12 (modular structure, guards, interceptors, pipes) |
| Database | PostgreSQL 16 |
| ORM and migrations | Prisma 7, using the `pg` driver adapter |
| Validation | class-validator, class-transformer |
| Authentication | JWT access tokens, rotating refresh tokens in httpOnly cookies, email OTP for passengers, Argon2 password hashing for staff |
| Payments | Paystack API (mobile money and card), with signed webhooks |
| Email | Brevo's HTTPS API, with Gmail SMTP and a console logger as alternatives |
| Real-time updates | Server-Sent Events (SSE) |
| Documents | `pdfkit` for PDF tickets, `qrcode` for QR codes |
| API docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Logging | Pino (`nestjs-pino`): structured JSON logs with a request ID on every request |
| Security | Helmet headers, CORS allow-list, rate limiting (`@nestjs/throttler`), cookie origin checks |

### Frontend (`client/`)

| Area | Technology |
|---|---|
| Framework | React 19, TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS 4, with a design-token theme |
| Routing | React Router 7 |
| Server state | TanStack Query 5 (caching, retries, background refetching) |
| Real-time updates | EventSource (SSE) |
| QR codes | `qrcode.react` to display them; the camera API with `BarcodeDetector`, falling back to `jsQR`, to scan them |
| Component structure | Atomic design (atoms, molecules, organisms, templates, pages) |

### Infrastructure and tooling

| Area | Technology |
|---|---|
| Containers | Docker (multi-stage build), Docker Compose for the local database |
| CI | GitHub Actions |
| Scheduled jobs | GitHub Actions cron, calling a secret-protected API endpoint |
| Backend hosting | Render (Docker web service, configured as code in `render.yaml`) |
| Database hosting | Neon (serverless Postgres) |
| Frontend hosting | Vercel (with a rewrite that proxies `/api` to the backend) |
| Testing | Vitest, Supertest |
| Linting and formatting | oxlint, Prettier |
| Browser QA | Puppeteer scripts that ran each user journey against the live site |

---

## Architecture

```
  Browser (React, on Vercel)
     │  /api/*  ── Vercel rewrite (same-origin, so the refresh cookie is first-party)
     ▼
  NestJS API (Docker, on Render) ──► Neon Postgres (Prisma)
     │        │         │
     │        │         └─► Brevo (email over HTTPS)
     │        └─► Paystack (charges, refunds) ◄── signed webhooks
     └─► SSE streams ──► agent console and payment pages update live

  GitHub Actions ── every 30 min ──► POST /internal/tick
     (frees expired holds, checks pending payments, retries emails and refunds)
```

**Backend modules:** auth, staff-auth, catalog, trips, bookings, payments, tickets, agent, admin, platform, reports, realtime, messages, audit, tick, health.

**Database:** 22 tables and 21 enums. They cover operators, stations, bays, routes, seat layouts, buses, trips, per-trip seats, bookings, payments, cash entries, scan logs, outbound messages, webhook events, idempotency keys and an audit log.

**API:** 79 REST endpoints under `/api/v1`, documented with Swagger.

---

## Engineering highlights

- **No double-booking under concurrency.** Taking a seat is a single conditional update ("set held where still available") inside a transaction. Two people clicking the same seat at the same moment can't both get it.
- **Seat holds that expire.** Selected seats are held for a few minutes while the passenger pays, then released automatically.
- **Payments that tolerate retries.** Payment requests carry idempotency keys, so a retried or double-clicked payment never charges twice. Paystack webhooks are checked with an HMAC signature and recorded, so each one is processed only once.
- **Email that survives outages (outbox pattern).** Emails are written to an outbox table and sent in the background, with retries. A slow email provider never blocks a booking or a payment.
- **Pluggable providers.** Payment and email providers sit behind interfaces, so the app can switch from Gmail SMTP to Brevo with one setting. Tests use fake providers.
- **Tamper-proof tickets.** QR codes are signed with HMAC. The scanner rejects forged codes, tickets already used, and tickets for a different trip, and logs every scan.
- **Secure sessions.**
  - Short-lived (15-minute) JWT access tokens, plus rotating refresh tokens in httpOnly cookies.
  - If an old refresh token is used again, it's treated as stolen and every token descended from it is revoked.
  - The refresh cookie checks the request's origin, guarding against cross-site request forgery.
  - One-time codes are hashed, expire, and are rate-limited per email and per IP address.
  - Staff passwords are hashed with Argon2.
- **Role-based access.** Passengers, agents, operator admins and platform admins each have their own guards. Operators only ever see their own data.
- **Real-time updates without WebSockets.** Server-Sent Events push seat and payment changes to the agent console and the payment page.
- **Settings checked at startup.** On startup the API checks every required setting and lists all the problems at once, instead of failing later on a missing value.
- **Audit trail.** Sensitive staff actions are written to an audit log.
- **A frontend that recovers from errors.**
  - The API client retries safe requests and refreshes an expired session once.
  - Errors come back in one consistent shape, with a request ID that matches the server logs.
  - Pages show loading, slow-load and retry states.

---

## Testing

| Type | What | Size |
|---|---|---|
| Unit tests | Services, providers, signing, env checks, logging (Vitest) | 96 tests in 16 files |
| End-to-end API tests | Every module against a real Postgres database: auth, holds, payments, webhooks, tickets, agent sales, admin, reports, rate limits, SSE streams, the tick (Vitest + Supertest) | 158 test cases in 19 files |
| Browser QA | Puppeteer runs the passenger, agent and operator journeys against the deployed site | 27 checks across 3 journeys |

The API tests use a fake payment provider, and can send email inline instead of in the background, so they run fast and give the same result every time.

---

## Workflow and CI/CD

- **Git:** small commits with conventional messages (`feat(server): …`, `fix(client): …`), all on `main`.
- **CI (GitHub Actions):** every push or pull request that touches the backend runs these steps against a Postgres service container:
  1. Install dependencies.
  2. Generate the Prisma client.
  3. Lint, then build.
  4. Run the unit tests.
  5. Apply the migrations.
  6. Run the end-to-end tests.
- **Scheduled maintenance:** a GitHub Actions cron job calls a secret-protected `/internal/tick` endpoint every 30 minutes, as a safety net for expired holds, pending payments, email retries and refunds. It is written but not running yet: the repository variable and secret it needs haven't been set.
- **Database changes:** versioned Prisma migrations, applied automatically when the API starts on Render. A seed script fills the database with demo operators, stations, buses and trips.

---

## Deployment

| Part | Platform | How |
|---|---|---|
| API | Render (Frankfurt, the closest region to Ghana) | Multi-stage Docker image built from `server/Dockerfile`; deploys on push to `main` and is configured in `render.yaml` |
| Database | Neon (eu-central-1) | Managed Postgres; migrations run on deploy |
| Web app | Vercel | Vite static build; `vercel.json` adds a rewrite that proxies `/api` to Render, SPA fallback routing, asset caching and security headers |
| Email | Brevo | Transactional email over HTTPS (Render's free plan blocks SMTP) |
| Payments | Paystack (test mode) | Mobile money and card charges, refunds, webhooks |

Secrets live only in the hosting platforms' environment settings, never in the repository. The app reads its configuration from environment variables.

---

## What I learned and solved along the way

- **Free hosting limits.** Render's free plan blocks outgoing SMTP, so the sign-in emails never arrived. I added an email provider that sends over HTTPS (Brevo) behind the existing mailer interface.
- **Cookies across two domains.** The frontend and API are on different domains, so a refresh cookie would count as third-party and browsers block those. I proxied `/api` through Vercel so the cookie is first-party, and made the cookie settings, the trusted proxy hops and the origin check configurable.
- **CDN caching surprises.** Vercel's edge cache served an old station list after the database was re-seeded. I marked the response `private` so only the browser caches it.
- **Slow work inside requests.** Sending email inside the payment request made replies time out. Moving email to a background outbox fixed it.
- **Real-world QA.** Running scripted browser journeys against the live site caught bugs the API tests couldn't, such as requests firing before the session was restored, a date-parsing crash, and a confirmation screen that disappeared too early.

---

## Suggested CV entry

**Seatline: Bus Booking Platform for Ghana** · *TypeScript, NestJS, React, PostgreSQL, Prisma, Docker*
[Live](https://ghana-bus-booking.vercel.app) · [GitHub](https://github.com/Jerry-Khobby/ghana-bus-booking)

- Built a full-stack booking platform for intercity buses in Ghana. It has separate apps for passengers, station agents and operators, and supports both fixed-time departures and buses that leave when full.
- Designed a NestJS + PostgreSQL API (79 endpoints, 22 tables) where concurrent bookings can't take the same seat, using atomic conditional updates, expiring holds and idempotent payment requests.
- Integrated Paystack mobile money and card payments, with HMAC-verified webhooks, automatic refunds and a background outbox for emails.
- Implemented passwordless email sign-in, rotating refresh-token sessions, role-based access control, rate limiting, and HMAC-signed QR tickets scanned with the phone camera.
- Built a React 19 + TanStack Query frontend with live updates over Server-Sent Events, a seat-layout editor and a camera QR scanner.
- Wrote 250+ automated tests (Vitest, Supertest) running against a real Postgres database in GitHub Actions CI. Deployed with Docker on Render, Neon and Vercel.
