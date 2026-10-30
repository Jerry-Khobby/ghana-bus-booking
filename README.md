# Seatline

Book intercity bus seats in Ghana online: see which bus is loading, pick your seat on a live map, pay with mobile money and board with a QR ticket.

Passengers no longer have to travel to the station to find out which bus is loading or whether there is a seat left. Station agents sell walk-in seats and scan tickets from the same system, and bus operators manage trips, buses and seat layouts.

> **Status:** the web app and the API are built and talk to each other end to end, in Paystack test mode. The API runs on Render with a Neon database; the web app deploys to Vercel.

## Design

All screens were designed before any code was written. The design has 22 screens, each with desktop, tablet (768 px) and phone (390 px) versions.

| # | Screen | Who uses it | Route in `client/` |
| --- | --- | --- | --- |
| 1 | Home and search | Passenger | `/` |
| 2 | Buses on the route | Passenger | `/trips` |
| 3 | Pick a seat | Passenger | `/trips/:tripId/seat` |
| 4 | Pay with mobile money | Passenger | `/trips/:tripId/pay` |
| 5 | E-ticket | Passenger | `/ticket` |
| 6 | Loading console | Station agent | `/agent` |
| 7 | Scan ticket | Station agent | `/agent/scan` |
| 8 | Overview | Operator | `/operator` |
| 9 | Seat layout editor | Operator | `/operator/layouts/:layoutId` (new: `/operator/layouts/new`) |
| 10 | Sign in | Passenger | `/signin` |
| 11 | Staff sign in | Agent, operator | `/staff/signin` |
| 12 | My tickets | Passenger | `/tickets` (one ticket: `/ticket/:code`) |
| 13 | Approve payment on phone | Passenger | `/trips/:tripId/pay/pending` |
| 14 | Payment failed | Passenger | `/trips/:tripId/pay/failed` |
| 15 | Sell walk-in seat | Station agent | `/agent/walk-in` |
| 16 | Trips | Operator | `/operator/trips` |
| 17 | New trip (and edit) | Operator | `/operator/trips/new`, `/operator/trips/:tripId/edit` |
| 18 | Buses | Operator | `/operator/buses` |
| 19 | Seat layouts | Operator | `/operator/layouts` |
| 20 | Routes and fares | Operator | `/operator/routes` |
| 21 | Agents | Operator | `/operator/agents` |
| 22 | Reports | Operator | `/operator/reports` |

### Colours

The brand uses the Ghana flag colours. Ghana has no official colour standard for transport apps, and state buses have been painted in the national colours.

| Token | Hex | Used for |
| --- | --- | --- |
| `brand` | `#006B3D` | Flag green: buttons, your seat, the e-ticket, the logo |
| `gold` | `#FCD20F` | Flag gold: "Loading now" badges, live labels, the scan frame |
| `danger` | `#CF0921` | Flag red: rejected scans, failed payments |
| `ink` | `#16201C` | Text and dark headers |
| `canvas` | `#F6F5F1` | Page background |

Red is kept off the seat map on purpose. Red and green side by side are hard to tell apart for colour-blind passengers, so taken seats are grey. White on green (about 6.6:1) and white on red (about 5.6:1) both pass WCAG AA contrast. Gold always sits under dark text. Report chart bars use a darker gold, `chart-gold` (`#D4A900`), because the flag gold is too light on white for thin marks; every chart also has a table view.

### Type

- **Archivo** (700, 800) for headings and prices
- **IBM Plex Sans** (400–600) for body text
- **IBM Plex Mono** (500, 600) for seat numbers, number plates and ticket codes

All tokens live in [client/src/index.css](client/src/index.css) as a Tailwind `@theme`, so classes like `bg-brand`, `text-muted` and `font-display` match the design exactly.

## Tech stack

| Part | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7, TanStack Query |
| Backend | NestJS, PostgreSQL with Prisma ([server/README.md](server/README.md)) |
| Live updates | Server-Sent Events: seat maps, payments and the agent console |
| Payments | Paystack mobile money and card, in test mode |
| QR codes | `qrcode.react` to draw tickets, the browser's detector or `jsqr` to scan them |
| Hosting | Web app on Vercel, API on Render, database on Neon (all free plans) |

## Getting started

You need Node.js 20 or newer.

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server forwards `/api` to the deployed API, which has the demo data, so the frontend runs on its own. To use an API on your machine instead, run the server (see [server/README.md](server/README.md)) and put `VITE_API_PROXY=http://localhost:3000` in `client/.env.local`.

Other scripts:

```bash
npm run build      # typecheck and build to client/dist
npm run preview    # serve the production build
npm run typecheck  # types only
```

### Trying the flow

The demo data is the bus company Coastline Express, loaded by `npm run db:seed` in `server/`. Its trips are dated the day the seed runs, so seed again for fresh ones.

1. On the home page, choose how many **Passengers** (1–6) and press **Find buses**, or tap a bus under **Loading now**.
2. Pick free seats on the live seat map, up to 6 per booking. They are held for you on the server for 5 minutes.
3. Pay by mobile money with Paystack's test number: **MTN, 055 123 4987**. Test mode moves no money. For card, use Paystack's test card on their page.
4. You get one e-ticket per seat, each with a signed QR code that works once at the bus door.

Passengers sign in at `/signin` with an emailed 6-digit code. **My tickets** shows the account's tickets, or, signed out, the ones bought on this device.

Staff sign in at `/staff/signin` with the password in `SEED_PASSWORD`:

- **Agent** `kofi.a@coastline.example` lands on the loading console: pick a bay, sell walk-in seats (cash or mobile money), scan tickets with the camera or by code, and mark the bus departed.
- **Operator** `admin@coastline.example` lands on the overview: trips, buses, seat layouts, routes and bays, agents and cash, and reports with a CSV export.

## Frontend structure (atomic design)

```text
client/src/
├── components/
│   ├── atoms/        Smallest pieces: Button, Badge, Avatar, Dropdown, Icon, Logo, TextInput, ProgressBar, SeatButton, Card, Th/Td
│   ├── molecules/    Atoms combined: FormField, SegmentedControl, FilterChips, ChoiceCard, CodeInput, InlineFormCard, PageHeader, MiniSeatPlan, TripCard, HoldTimer, StatTile
│   ├── organisms/    Page sections: SiteHeader, SearchForm, SeatMap, PaymentForm, TicketCard, PassengerSignIn, WalkInSale, TripForm, ResponsiveTable, FleetLists, SalesChart
│   └── templates/    Page shells: PublicTemplate, BookingTemplate, AuthTemplate, AgentTemplate, OperatorTemplate, PassTemplate
├── pages/            Routes: templates filled with organisms and data (operator pages in pages/operator/)
├── api/              The API client, live streams, and one module per area (catalog, booking, agent, admin…)
├── app/              Routes and app state: Auth, Booking and Station (agent) contexts
├── data/             Shared view types
├── hooks/            useCountdown (seat hold timer)
└── lib/              Formatting (cedis, labels) and seat-layout helpers
```

The rule: each layer imports only from the layers below it. Pages compose templates and organisms; organisms compose molecules and atoms; atoms import nothing from `components/`.

On phones the layout follows the phone artboards. The header collapses to a menu button, the seat page gets a sticky "Continue to payment" bar, and every operator table becomes a list of cards. Tablets get an icon rail for the operator menu.

## Test mode

- Payments run on Paystack test keys: no real money moves.
- Emails (sign-in codes, tickets, staff invites) can't leave the API on Render's free plan, which blocks SMTP. They wait in the outbox until an email service that works over HTTPS is set up.
- SMS is not used; tickets and codes go by email.

## Deploying the web app (Vercel)

The API is deployed first: see [server/README.md](server/README.md). Then:

1. On [vercel.com](https://vercel.com), **Add New → Project** and import this repository.
2. Set **Root Directory** to `client`. Vercel reads `client/vercel.json`: a Vite build, and two rewrites, `/api/*` to the Render API and every other path to the app (so links like `/ticket/SL-…` work).
3. Leave the environment variables empty: the app calls `/api` on its own site, which Vercel forwards to Render.
4. Deploy, and note the address, e.g. `https://seatline.vercel.app`.
5. In Render, set the API's environment so it knows the web app:
   - `WEB_URL` = the Vercel address (ticket links, card payment returns and the sign-in origin check use it)
   - `REFRESH_COOKIE_SAMESITE` = `lax` (the cookie is first-party now, which Safari needs)
   - `TRUST_PROXY` = `2` (Vercel and Render are both in front, so rate limits see the real client)

Because the browser only ever talks to the Vercel site, the sign-in cookie is first-party everywhere and no CORS setup is needed. Preview deployments get their own address; add any you want to sign in on to `CORS_ORIGINS` in Render.

## Roadmap

- [x] Design: 22 screens, each for desktop, tablet and phone
- [x] Frontend: all 22 screens, responsive
- [x] API: trips, buses, seat layouts, bookings, tickets, agents, reports (NestJS + Prisma + PostgreSQL)
- [x] Seat holds on the server, up to 6 seats together, with live seat maps
- [x] Paystack mobile money and card payments, in test mode
- [x] Camera QR scanning for agents, with one-time boarding
- [x] Sign-in: email codes for passengers, password accounts for staff
- [x] Docker for the API; deployed on Render with Neon
- [ ] Email delivery over HTTPS (Render's free plan blocks SMTP)
- [ ] Screens for the platform admin (operators and shared stations)
- [ ] SMS tickets

## Repository layout

```text
.
├── client/        React web app (deployed on Vercel)
├── server/        NestJS API (deployed on Render with Neon)
├── render.yaml    Render blueprint for the API
└── .github/       CI for the API, and the 30-minute tick
```
